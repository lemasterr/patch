import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const chunkSize = 1800;

type ChunkManifest = {
  generation: string;
  count: number;
};

function chunkCountKey(key: string) {
  return `${key}.chunks`;
}

function chunkKey(key: string, index: number) {
  return `${key}.${index}`;
}

function manifestKey(key: string) {
  return `${key}.manifest`;
}

function generationChunkKey(key: string, generation: string, index: number) {
  return `${key}.${generation}.${index}`;
}

function parseManifest(value: string | null): ChunkManifest | null {
  if (!value) return null;
  try {
    const manifest = JSON.parse(value) as Partial<ChunkManifest>;
    const generation = manifest.generation;
    const count = manifest.count;
    if (
      typeof generation !== "string" ||
      !/^[a-z0-9-]{8,80}$/.test(generation) ||
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100
    ) {
      return null;
    }
    return { generation, count };
  } catch {
    return null;
  }
}

async function removeGeneration(key: string, manifest: ChunkManifest | null) {
  if (!manifest) return;
  await Promise.all(
    Array.from({ length: manifest.count }, (_, index) =>
      SecureStore.deleteItemAsync(
        generationChunkKey(key, manifest.generation, index),
      ),
    ),
  );
}

async function removeNativeItem(key: string) {
  const countValue = await SecureStore.getItemAsync(chunkCountKey(key));
  const count = Number.parseInt(countValue ?? "0", 10);
  await Promise.all([
    ...Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index)),
    ),
    SecureStore.deleteItemAsync(chunkCountKey(key)),
    SecureStore.deleteItemAsync(key),
  ]);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return globalThis.localStorage?.getItem(key) ?? null;
    }

    const manifest = parseManifest(
      await SecureStore.getItemAsync(manifestKey(key)),
    );
    if (manifest) {
      const chunks = await Promise.all(
        Array.from({ length: manifest.count }, (_, index) =>
          SecureStore.getItemAsync(
            generationChunkKey(key, manifest.generation, index),
          ),
        ),
      );
      return chunks.every((chunk) => chunk !== null) ? chunks.join("") : null;
    }

    const countValue = await SecureStore.getItemAsync(chunkCountKey(key));
    const count = Number.parseInt(countValue ?? "0", 10);
    if (!Number.isFinite(count) || count <= 0) {
      return SecureStore.getItemAsync(key);
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index)),
      ),
    );
    return chunks.every((chunk) => chunk !== null) ? chunks.join("") : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, value);
      return;
    }

    const previous = parseManifest(
      await SecureStore.getItemAsync(manifestKey(key)),
    );
    const chunks = value.match(new RegExp(`.{1,${chunkSize}}`, "gs")) ?? [""];
    const generation = `v${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`;
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(
          generationChunkKey(key, generation, index),
          chunk,
        ),
      ),
    );
    // The manifest is the commit record. Readers see either the complete old
    // generation or the complete new one, never a partly overwritten session.
    await SecureStore.setItemAsync(
      manifestKey(key),
      JSON.stringify({
        generation,
        count: chunks.length,
      } satisfies ChunkManifest),
    );
    await Promise.all([removeGeneration(key, previous), removeNativeItem(key)]);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    const manifest = parseManifest(
      await SecureStore.getItemAsync(manifestKey(key)),
    );
    await Promise.all([
      SecureStore.deleteItemAsync(manifestKey(key)),
      removeGeneration(key, manifest),
      removeNativeItem(key),
    ]);
  },
};
