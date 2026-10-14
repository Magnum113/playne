import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRankedQueue,
  RANKED_PENDING_KEY,
  type ServerRun,
} from "../src/rankedQueue";
const id = "11111111-1111-4111-8111-111111111111";
const run = (game: ServerRun["game"] = "colorfle"): ServerRun => ({
  id,
  game,
  challenge: { targets: [] },
  mode: "classic",
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
  } as Storage;
}
const queues: ReturnType<typeof createRankedQueue>[] = [];
function queue(request: any, s = storage()) {
  const q = createRankedQueue(request, { storage: s });
  queues.push(q);
  return q;
}
afterEach(() => {
  queues.forEach((q) => q.dispose());
  queues.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("durable result synchronization", () => {
  it("restores a timed color answer after network loss and discards only an expired choice update", async () => {
    const saved = storage();
    const failed = queue(async () => {
      throw new Error("offline");
    }, saved);
    const issued = { ...run(), mode: "timed" as const };
    const key = failed.add(issued, "colorfle");
    failed.pin(key, 0, { h: 240, s: 100, v: 100 });
    failed.enqueue(key, 0, { choice: { h: 0, s: 100, v: 100 }, expired: true });
    await failed.drain(key);
    failed.dispose();
    const paths: string[] = [];
    const restored = queue(async (path: string, _method: string, body: any) => {
      paths.push(path);
      if (path.endsWith("/choice"))
        throw Object.assign(new Error("expired"), { status: 409 });
      expect(body.answer.expired).toBe(true);
      return {
        answer: { choice: null, score: 0, timedOut: true },
        completed: false,
        published: false,
      };
    }, saved);
    restored.recover();
    await restored.drain(key);
    expect(paths).toEqual([`/games/${id}/choice`, `/games/${id}/answers`]);
    expect(restored.get(key)?.results[0].answer.score).toBe(0);
    expect(restored.get(key)?.tasks).toHaveLength(0);
  });
  it.each(["naglaz", "circle", "colorfle", "geo"] as const)(
    "keeps %s answers until acknowledged and recognizes automatic server publication",
    async (game) => {
      const request = vi.fn(async (_p: string, _m: string, body: any) => ({
        answer: { score: 80 },
        completed: body.index === (game === "circle" ? 0 : 4),
        published: body.index === (game === "circle" ? 0 : 4),
        score: game === "circle" ? 80 : 400,
      }));
      const q = queue(request),
        key = q.add(run(game), game);
      q.connect("user");
      q.enqueueMany(
        key,
        Array.from({ length: game === "circle" ? 1 : 5 }, (_, index) => ({
          index,
          answer: { choice: index },
        })),
      );
      await q.drain(key);
      await q.drain(key);
      expect(q.get(key)?.state.status).toBe("saved");
      expect(q.get(key)?.tasks).toHaveLength(0);
      expect(request.mock.calls.map((c) => c[2].index)).toEqual(
        game === "circle" ? [0] : [0, 1, 2, 3, 4],
      );
    },
  );
  it("retries a lost response after reload using the same run and original answers", async () => {
    vi.useFakeTimers();
    const s = storage();
    let offline = true;
    const request = vi.fn(async (_p: string, _m: string, body: any) => {
      if (offline) throw new TypeError("lost response");
      return {
        answer: { score: 75 },
        completed: body.index === 4,
        published: body.index === 4,
        score: 375,
      };
    });
    const first = queue(request, s),
      key = first.add(run(), "colorfle");
    first.enqueueMany(
      key,
      Array.from({ length: 5 }, (_, index) => ({
        index,
        answer: { choice: index },
      })),
    );
    await first.drain(key);
    expect(JSON.parse(s.getItem(RANKED_PENDING_KEY)!)[0].tasks).toHaveLength(5);
    first.dispose();
    offline = false;
    const restored = queue(request, s);
    restored.connect("user");
    await restored.drain(key);
    expect(restored.get(key)?.state).toMatchObject({
      status: "saved",
      id,
      score: 375,
    });
    expect(
      request.mock.calls.every((c) => c[0] === `/games/${id}/answers`),
    ).toBe(true);
  });
  it("automatically resumes after a transient failure without a new party", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const request = vi.fn(async () => {
      if (calls++ === 0)
        throw Object.assign(new Error("unavailable"), { status: 503 });
      return {
        completed: true,
        published: true,
        score: 84.3,
        answer: { score: 84.3 },
      };
    });
    const q = queue(request),
      key = q.add(run("circle"), "circle");
    q.enqueue(key, 0, { points: [1, 2, 3] });
    await q.drain(key);
    expect(q.get(key)?.state.status).toBe("error");
    await vi.advanceTimersByTimeAsync(2000);
    expect(q.get(key)?.state.status).toBe("saved");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("preserves the preceding party when a new one is started", async () => {
    vi.useFakeTimers();
    let offline = true;
    const request = vi.fn(async () => {
      if (offline) throw new TypeError("offline");
      return {
        completed: true,
        published: true,
        score: 81,
        answer: { score: 81 },
      };
    });
    const q = queue(request),
      old = q.add(run("circle"), "circle");
    q.enqueue(old, 0, { points: [1, 2, 3] });
    await q.drain(old);
    const next = q.add(
      { ...run("circle"), id: "22222222-2222-4222-8222-222222222222" },
      "circle",
    );
    offline = false;
    q.retry();
    await q.drain(old);
    expect(q.get(old)?.state.status).toBe("saved");
    expect(q.get(next)?.state.status).toBe("ready");
  });
  it("leaves guest results private until login, then publishes automatically", async () => {
    const request = vi.fn(async (p: string) =>
      p.endsWith("/publish")
        ? { ok: true }
        : {
            completed: true,
            published: false,
            score: 90,
            answer: { score: 90 },
          },
    );
    const q = queue(request),
      key = q.add(run("circle"), "circle");
    q.enqueue(key, 0, { points: [1, 2, 3] });
    await q.drain(key);
    expect(q.get(key)?.state.status).toBe("complete");
    expect(request).toHaveBeenCalledTimes(1);
    q.connect("user");
    await q.drain(key);
    expect(q.get(key)?.state.status).toBe("saved");
    expect(request.mock.calls[1][0]).toBe(`/games/${id}/publish`);
  });
  it("can retain an offline circle and create its server run after connection recovers", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (p: string) =>
      p === "/games"
        ? run("circle")
        : {
            completed: true,
            published: true,
            score: 87,
            answer: { score: 87 },
          },
    );
    const q = queue(request),
      key = q.add(null, "circle");
    q.enqueue(key, 0, { points: [1, 2, 3] });
    await q.drain(key);
    expect(q.get(key)?.state).toMatchObject({ status: "saved", id });
    expect(request.mock.calls[0][0]).toBe("/games");
  });
  it("recovers accepted rounds without resending or replacing the challenge", async () => {
    const request = vi.fn(
      async (_path: string, _method: string, _body: any) => ({
        completed: true,
        published: true,
        score: 400,
        answer: { score: 80 },
      }),
    );
    const q = queue(request),
      key = q.add({ ...run(), answers: [{}, {}, {}, {}] }, "colorfle");
    q.enqueueMany(
      key,
      Array.from({ length: 5 }, (_, index) => ({
        index,
        answer: { choice: index },
      })),
    );
    await q.drain(key);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][2].index).toBe(4);
  });
  it("orders pending geographic pins and answers and tolerates an expired pin", async () => {
    const paths: string[] = [];
    const request = vi.fn(async (p: string, _m: string, body: any) => {
      paths.push(p + ":" + body.index);
      if (p.endsWith("/pin"))
        throw Object.assign(new Error("expired"), { status: 409 });
      return { answer: { score: 0 }, completed: false, published: false };
    });
    const q = queue(request),
      key = q.add(run("geo"), "geo");
    q.pin(key, 0, { lat: 1, lng: 2 });
    q.enqueue(key, 0, { expired: true, guess: { lat: 1, lng: 2 } });
    await q.drain(key);
    expect(paths).toEqual([`/games/${id}/pin:0`, `/games/${id}/answers:0`]);
    expect(q.get(key)?.tasks).toHaveLength(0);
  });
  it("keeps invalid answers blocked instead of endlessly retrying them", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => {
      throw Object.assign(new Error("invalid"), { status: 400 });
    });
    const q = queue(request),
      key = q.add(run("circle"), "circle");
    q.enqueue(key, 0, {});
    await q.drain(key);
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(q.get(key)?.tasks).toHaveLength(1);
  });
  it("does not overwrite another tab's pending party", async () => {
    vi.useFakeTimers();
    const s = storage();
    const request = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const a = queue(request, s),
      b = queue(request, s);
    a.connect(null);
    b.connect(null);
    const first = a.add(run("circle"), "circle");
    const second = b.add(
      { ...run("circle"), id: "22222222-2222-4222-8222-222222222222" },
      "circle",
    );
    a.enqueue(first, 0, { points: [1, 2, 3] });
    b.enqueue(second, 0, { points: [4, 5, 6] });
    await a.drain(first);
    await b.drain(second);
    const saved = JSON.parse(s.getItem(RANKED_PENDING_KEY)!);
    expect(new Set(saved.map((p: any) => p.key))).toEqual(
      new Set([first, second]),
    );
    const replay = queue(
      vi.fn(async () => ({
        completed: true,
        published: true,
        score: 87,
        answer: { score: 87 },
      })),
      s,
    );
    replay.connect("user");
    await replay.drain(first);
    await replay.drain(second);
    expect(replay.get(first)?.state.status).toBe("saved");
    expect(replay.get(second)?.state.status).toBe("saved");
  });
  it("uses a shared browser lock to create and save one offline circle across tabs", async () => {
    const locks = new Map<string, Promise<any>>();
    vi.stubGlobal("navigator", {
      locks: {
        request: (name: string, callback: () => Promise<void>) => {
          const task = (locks.get(name) ?? Promise.resolve()).then(callback);
          locks.set(name, task);
          return task;
        },
      },
    });
    const s = storage();
    const request = vi.fn(async (path: string) =>
      path === "/games"
        ? run("circle")
        : {
            completed: true,
            published: true,
            score: 87,
            answer: { score: 87 },
          },
    );
    const a = queue(request, s),
      key = a.add(null, "circle");
    a.enqueue(key, 0, { points: [1, 2, 3] });
    const b = queue(request, s);
    b.connect("user");
    await Promise.all([a.drain(key), b.drain(key)]);
    expect(request.mock.calls.filter((c) => c[0] === "/games")).toHaveLength(1);
    expect(
      request.mock.calls.filter((c) => c[0].endsWith("/answers")),
    ).toHaveLength(1);
    expect(a.get(key)?.state.status).toBe("saved");
    expect(b.get(key)?.state.status).toBe("saved");
  });
});
