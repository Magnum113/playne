import { validHSV } from "./colorfle";
import type { GameId } from "./account";
import type { GeoMode } from "./geo";

export type ServerRun = {
  id: string;
  game: GameId;
  challenge: any;
  version?: number;
  mode?: GeoMode;
  completed?: boolean;
  published?: boolean;
  score?: number | null;
  answers?: any[];
};
export type RankedState = {
  status:
    | "idle"
    | "loading"
    | "ready"
    | "checking"
    | "complete"
    | "saving"
    | "save-error"
    | "saved"
    | "error";
  id?: string;
  score?: number;
  message?: string;
};
type Task = { index: number; answer: unknown };
type Pending = {
  key: string;
  run: ServerRun | null;
  game: GameId;
  mode?: GeoMode;
  tasks: Task[];
  pins: Record<number, unknown>;
  results: Record<number, any>;
  completed: boolean;
  published: boolean;
  score?: number;
  updated: number;
  state: RankedState;
  blocked?: boolean;
  failures: number;
};
type Request = (path: string, method?: string, body?: unknown) => Promise<any>;
export const RANKED_PENDING_KEY = "playne:ranked-pending:v1";
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
export const retryable = (e: unknown) =>
  !e ||
  typeof (e as any).status !== "number" ||
  (e as any).status >= 500 ||
  [408, 429].includes((e as any).status);

export function sameColorTargets(a: unknown, b: unknown) {
  return (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === 5 &&
    b.length === 5 &&
    a.every(
      (c, i) =>
        validHSV(c) &&
        validHSV(b[i]) &&
        c.h === b[i].h &&
        c.s === b[i].s &&
        c.v === b[i].v,
    )
  );
}

// Answers are kept until the server acknowledges them. A result outlives its
// game component, so navigation or starting another party cannot drop it.
export function createRankedQueue(
  request: Request,
  options: {
    storage?: Storage;
    onPublished?: (run: ServerRun, score: number) => void;
    onUnauthorized?: () => void;
  } = {},
) {
  const records = new Map<string, Pending>(),
    workers = new Map<string, Promise<void>>(),
    timers = new Map<string, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  let loaded = false,
    userId: string | null = null;
  const storage = () =>
    options.storage ??
    (typeof localStorage === "undefined" ? undefined : localStorage);
  function load() {
    if (loaded) return;
    loaded = true;
    mergeStored();
  }
  function mergeStored(
    exceptKey?: string,
    refreshExisting = false,
    forceKey?: string,
  ) {
    try {
      const saved = JSON.parse(storage()?.getItem(RANKED_PENDING_KEY) ?? "[]");
      if (!Array.isArray(saved)) return;
      for (const p of saved) {
        if (
          !p ||
          !uuid(p.key) ||
          !["naglaz", "circle", "colorfle", "geo", "pressure"].includes(
            p.game,
          ) ||
          !Array.isArray(p.tasks) ||
          p.tasks.length > 5 ||
          !Number.isFinite(p.updated) ||
          Date.now() - p.updated > 24 * 60 * 60 * 1000 ||
          (p.run && (!uuid(p.run.id) || p.run.game !== p.game))
        )
          continue;
        if (p.key === exceptKey || (workers.has(p.key) && p.key !== forceKey))
          continue;
        const existing = records.get(p.key);
        if (existing && !refreshExisting) continue;
        const restored: Pending = {
          ...p,
          results: p.results ?? {},
          pins: p.pins ?? {},
          failures: 0,
          state: p.published
            ? { status: "saved", id: p.run?.id, score: p.score }
            : p.completed
              ? { status: "complete", id: p.run?.id, score: p.score }
              : { status: "ready", id: p.run?.id },
        };
        if (existing) Object.assign(existing, restored);
        else records.set(p.key, restored);
      }
    } catch {
      /* Storage must never prevent play or live synchronization. */
    }
  }
  function changed(p: Pending) {
    try {
      mergeStored(p.key, true);
      const all = [...records.values()];
      const pending = all.filter(
        (r) =>
          r.tasks.length ||
          Object.keys(r.pins).length ||
          (r.completed && !r.published),
      );
      const history = all.filter((r) => !pending.includes(r)).slice(-12);
      storage()?.setItem(
        RANKED_PENDING_KEY,
        JSON.stringify([...pending, ...history]),
      );
    } catch {
      /* In-memory retry remains active. */
    }
    listeners.forEach((fn) => fn());
  }
  function state(p: Pending, next: RankedState) {
    p.state = next;
    changed(p);
  }
  function add(run: ServerRun | null, game: GameId, mode?: GeoMode) {
    load();
    const existing =
      run && [...records.values()].find((p) => p.run?.id === run!.id);
    if (existing && run) {
      existing.run = { ...run, mode: mode ?? run.mode ?? run.challenge?.mode };
      for (const [index, answer] of (run.answers ?? []).entries())
        existing.results[index] = {
          answer,
          completed: run.completed,
          published: run.published,
          score: run.score,
        };
      existing.tasks = existing.tasks.filter(
        (task) => !Object.hasOwn(existing.results, task.index),
      );
      if (run.completed) {
        existing.completed = true;
        existing.score = run.score ?? existing.score;
        existing.published = !!run.published;
        state(existing, {
          status: existing.published ? "saved" : "complete",
          id: run.id,
          score: existing.score,
        });
      }
      changed(existing);
      return existing.key;
    }
    if (run) run = { ...run, mode: mode ?? run.mode ?? run.challenge?.mode };
    const key = run?.id ?? crypto.randomUUID();
    const results = Object.fromEntries(
      (run?.answers ?? []).map((answer, index) => [
        index,
        {
          answer,
          completed: run?.completed,
          published: run?.published,
          score: run?.score,
        },
      ]),
    );
    const p: Pending = {
      key,
      run,
      game,
      mode: mode ?? run?.mode,
      tasks: [],
      pins: {},
      results,
      completed: !!run?.completed,
      published: !!run?.published,
      score: run?.score ?? undefined,
      updated: Date.now(),
      state: {
        status: run?.published
          ? "saved"
          : run?.completed
            ? "complete"
            : "ready",
        id: run?.id,
        score: run?.score ?? undefined,
      },
      failures: 0,
    };
    records.set(key, p);
    changed(p);
    return key;
  }
  function schedule(p: Pending) {
    if (timers.has(p.key)) return;
    const delay = Math.min(30000, 2000 * 2 ** Math.min(p.failures - 1, 4));
    timers.set(
      p.key,
      setTimeout(() => {
        timers.delete(p.key);
        void drain(p.key);
      }, delay),
    );
  }
  function drain(key: string): Promise<void> {
    load();
    if (workers.has(key)) return workers.get(key)!;
    const p = records.get(key);
    if (
      !p ||
      p.blocked ||
      (p.published && !p.tasks.length && !Object.keys(p.pins).length)
    )
      return Promise.resolve();
    const process = async () => {
      if (p.published && !p.tasks.length && !Object.keys(p.pins).length) return;
      try {
        if (!p.run) {
          if (p.game !== "circle" || !p.tasks.length) return;
          state(p, { status: "checking" });
          p.run = await request("/games", "POST", { game: "circle" });
          changed(p);
        }
        while (p.tasks.length || Object.keys(p.pins).length) {
          const pinIndex = Math.min(...Object.keys(p.pins).map(Number));
          if (
            Number.isFinite(pinIndex) &&
            (!p.tasks.length || pinIndex <= p.tasks[0].index)
          ) {
            const guess = p.pins[pinIndex];
            try {
              await request(
                `/games/${p.run!.id}/${p.game === "colorfle" ? "choice" : "pin"}`,
                "POST",
                {
                  index: pinIndex,
                  ...(p.game === "colorfle" ? { choice: guess } : { guess }),
                },
              );
            } catch (e) {
              if ((e as any)?.status !== 409) throw e;
            }
            if (p.pins[pinIndex] === guess) delete p.pins[pinIndex];
            changed(p);
            continue;
          }
          state(p, { status: "checking", id: p.run!.id });
          const task = p.tasks[0];
          const result = await request(
            `/games/${p.run!.id}/answers`,
            "POST",
            task,
          );
          p.results[task.index] = result;
          p.tasks.shift();
          p.completed = !!result.completed;
          p.published = !!result.published;
          p.score = result.score ?? p.score;
          p.failures = 0;
          state(p, {
            status: p.published ? "saved" : p.completed ? "complete" : "ready",
            id: p.run!.id,
            score: p.score,
          });
          if (p.published) options.onPublished?.(p.run!, p.score ?? 0);
        }
        if (p.completed && !p.published && userId) {
          state(p, { status: "saving", id: p.run!.id, score: p.score });
          await request(`/games/${p.run!.id}/publish`, "POST", {});
          p.published = true;
          p.failures = 0;
          state(p, { status: "saved", id: p.run!.id, score: p.score });
          options.onPublished?.(p.run!, p.score ?? 0);
        }
      } catch (e) {
        p.failures++;
        if ((e as any)?.status === 401) options.onUnauthorized?.();
        p.blocked = !retryable(e);
        state(p, {
          status: p.completed ? "save-error" : "error",
          id: p.run?.id,
          score: p.score,
          message: p.blocked
            ? e instanceof Error
              ? e.message
              : "Не удалось сохранить результат"
            : "Результат сохранён в браузере. Повторяем отправку в рейтинг…",
        });
        if (!p.blocked) schedule(p);
      }
    };
    const work = (
      typeof navigator !== "undefined" && navigator.locks?.request
        ? navigator.locks
            .request("playne:result:" + key, async () => {
              mergeStored(undefined, true, key);
              listeners.forEach((fn) => fn());
              await process();
            })
            .then(() => undefined)
        : process()
    ).finally(() => {
      workers.delete(key);
      if (
        !p.blocked &&
        p.failures === 0 &&
        (p.tasks.length ||
          Object.keys(p.pins).length ||
          (p.completed && !p.published && userId))
      )
        void drain(key);
    });
    workers.set(key, work);
    return work;
  }
  function enqueueMany(key: string, tasks: Task[]) {
    load();
    const p = records.get(key);
    if (!p) return;
    for (const task of tasks)
      if (
        !p.tasks.some((t) => t.index === task.index) &&
        !Object.hasOwn(p.results, task.index)
      )
        p.tasks.push(task);
    p.tasks.sort((a, b) => a.index - b.index);
    p.updated = Date.now();
    changed(p);
    void drain(key);
  }
  function enqueue(key: string, index: number, answer: unknown) {
    enqueueMany(key, [{ index, answer }]);
  }
  function retry(key?: string) {
    load();
    for (const p of records.values())
      if (!key || p.key === key) {
        const timer = timers.get(p.key);
        if (timer) clearTimeout(timer);
        timers.delete(p.key);
        p.blocked = false;
        void drain(p.key);
      }
  }
  return {
    add,
    flushGame: async (game: GameId) => {
      load();
      await Promise.all(
        [...records.values()]
          .filter(
            (p) =>
              p.game === game && (p.tasks.length || Object.keys(p.pins).length),
          )
          .map((p) => drain(p.key)),
      );
    },
    enqueue,
    enqueueMany,
    drain,
    retry,
    pin: (key: string, index: number, guess: unknown) => {
      const p = records.get(key);
      if (!p) return;
      p.pins[index] = guess;
      changed(p);
      void drain(key);
    },
    findColor: (targets: unknown[]) => {
      load();
      return [...records.values()]
        .reverse()
        .find(
          (p) =>
            p.game === "colorfle" &&
            sameColorTargets(p.run?.challenge.targets, targets),
        )?.key;
    },
    find: (id: string) => {
      load();
      return [...records.values()].find((p) => p.run?.id === id)?.key;
    },
    get: (key: string) => {
      load();
      return records.get(key);
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    connect: (id: string | null) => {
      if (id !== userId) {
        userId = id;
        for (const p of records.values()) p.blocked = false;
      }
      retry();
    },
    recover: () => {
      mergeStored(undefined, true);
      listeners.forEach((fn) => fn());
      retry();
    },
    dispose: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      listeners.clear();
    },
  };
}
