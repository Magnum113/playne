import { afterEach, describe, expect, it, vi } from "vitest";
import { createRankedQueue, type ServerRun } from "../src/rankedQueue";
const id = "11111111-1111-4111-8111-111111111111";
const active: ReturnType<typeof createRankedQueue>[] = [];
const storage = () => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  } as Storage;
};
const run = (privateResult = false): ServerRun => ({
  id,
  game: "flash",
  challenge: { rounds: [] },
  mode: privateResult ? "practice" : "classic",
  private: privateResult,
});
afterEach(() => {
  active.forEach((q) => q.dispose());
  active.length = 0;
});
describe("Brain durable private result synchronization", () => {
  it("saves private practice answers without publishing or recording a public event", async () => {
    const request = vi.fn(async () => ({
        answer: { score: 100 },
        completed: true,
        published: false,
        private: true,
        score: 500,
      })),
      published = vi.fn();
    const q = createRankedQueue(request, {
      storage: storage(),
      onPublished: published,
    });
    active.push(q);
    const key = q.add(run(true), "flash", "practice");
    q.connect("user");
    q.enqueue(key, 0, { cells: [1] });
    await q.drain(key);
    expect(request).toHaveBeenCalledTimes(1);
    expect(q.get(key)?.state.status).toBe("complete");
    expect(published).not.toHaveBeenCalled();
  });
  it("honors server claim conversion to private practice instead of pretending it was published", async () => {
    const request = vi.fn(async () => ({
        ok: true,
        private: true,
        score: 500,
      })),
      published = vi.fn();
    const q = createRankedQueue(request, {
      storage: storage(),
      onPublished: published,
    });
    active.push(q);
    const key = q.add({ ...run(), completed: true, score: 500 }, "flash");
    q.connect("user");
    await q.drain(key);
    expect(request).toHaveBeenCalledTimes(1);
    expect(q.get(key)?.run?.private).toBe(true);
    expect(q.get(key)?.state.status).toBe("complete");
    expect(published).not.toHaveBeenCalled();
    await q.drain(key);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("restores a brain answer after offline reload", async () => {
    const saved = storage(),
      first = createRankedQueue(
        async () => {
          throw new TypeError("offline");
        },
        { storage: saved },
      );
    active.push(first);
    const key = first.add(run(), "flash");
    first.enqueue(key, 0, { cells: [1, 2] });
    await first.drain(key);
    first.dispose();
    const request = vi.fn(async () => ({
      answer: { score: 80 },
      completed: false,
      published: false,
      private: false,
    }));
    const recovered = createRankedQueue(request, { storage: saved });
    active.push(recovered);
    recovered.recover();
    await recovered.drain(key);
    expect(request).toHaveBeenCalledWith(`/games/${id}/answers`, "POST", {
      index: 0,
      answer: { cells: [1, 2] },
    });
    expect(recovered.get(key)?.tasks).toHaveLength(0);
  });
});
