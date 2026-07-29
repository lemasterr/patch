import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const chunkSize = 1800;

function chunkCountKey(key: string) {
  return `${key}.chunks`;
}

function chunkKey(key: string, index: number) {
  return `${key}.${index}`;
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

    await removeNativeItem(key);
    const chunks = value.match(new RegExp(`.{1,${chunkSize}}`, "gs")) ?? [""];
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), chunk),
      ),
    );
    await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(key);
      return;
    }
    await removeNativeItem(key);
  },
};
