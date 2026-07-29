import { createSerializedMutationQueue } from "../serialized-mutation";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("serialized mutation queue", () => {
  it("preserves rapid writes for one setting in client order", async () => {
    const queue = createSerializedMutationQueue();
    const firstGate = deferred();
    const writes: string[] = [];

    const first = queue.enqueue("push_friend_preferences", async () => {
      writes.push("first");
      await firstGate.promise;
    });
    const second = queue.enqueue("push_friend_preferences", async () => {
      writes.push("second");
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toEqual(["first"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(writes).toEqual(["first", "second"]);
  });
});
