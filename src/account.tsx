import {
  GEO_MAX_POINTS,
  GEO_SCORE_VERSION,
  geoPoints,
  type GeoMode,
  type GeoPoint,
} from "./geo";
import { ACCOUNT_GOALS, reachGoal } from "./analytics";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
export type GameId = "naglaz" | "circle" | "colorfle" | "geo";
export const gameNames: Record<GameId, string> = {
  naglaz: "На глаз",
  circle: "Круг",
  colorfle: "Оттенок",
  geo: "Где я?",
};
export type User = {
  id: string;
  nickname: string;
  nickname_confirmed: boolean;
};
let meRequest: Promise<any> | undefined;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (path !== "/me" && meRequest) await meRequest.catch(() => {});
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "X-Playne-Geo-Version": String(GEO_SCORE_VERSION),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(path === "/games" ? 3500 : 15000),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Сервис временно недоступен" }));
  if (!response.ok)
    throw new ApiError(
      data.error ?? "Не удалось выполнить запрос",
      response.status,
    );
  return data;
}
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
}>({ user: null, loading: false, refresh: async () => {} });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  async function refresh() {
    try {
      meRequest ??= api("/me").finally(() => {
        meRequest = undefined;
      });
      const data = await meRequest;
      setUser(data.user);
      if (
        data.user &&
        new URLSearchParams(window.location.search).get("auth") === "success"
      ) {
        reachGoal(ACCOUNT_GOALS.loginSuccess, { provider: "yandex" });
        const url = new URL(window.location.href);
        url.searchParams.delete("auth");
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function AccountNav() {
  const { user } = useAuth();
  return (
    <a
      className={`account-nav${user ? "" : " account-nav-login"}`}
      href="/account/"
      aria-label={user ? "Личный кабинет" : "Войти через Яндекс"}
      title={user ? "Личный кабинет" : "Войти через Яндекс"}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </svg>
      {!user && <span>Войти</span>}
    </a>
  );
}
type Run = { id: string; game: GameId; challenge: any; version?: number };
type RunState = {
  status:
    | "idle"
    | "loading"
    | "local"
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
export function useRankedRun(game: GameId) {
  const { user, refresh } = useAuth();
  const [state, setState] = useState<RunState>({ status: "idle" });
  const publishing = useRef<string | null>(null);
  const current = useRef<{
    epoch: number;
    mode?: GeoMode;
    run: Promise<Run | null>;
    tasks: Task[];
    accepted: number;
    working: boolean;
    drained?: Promise<void>;
    pinWork?: Promise<void>;
  }>({
    epoch: 0,
    run: Promise.resolve(null),
    tasks: [],
    accepted: 0,
    working: false,
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function setFor(run: typeof current.current, next: RunState) {
    if (alive.current && current.current === run) setState(next);
  }
  useEffect(() => {
    if (state.status !== "complete" || !state.id || !user) return;
    const id = state.id;
    if (publishing.current === id) return;
    publishing.current = id;
    const activeRun = current.current;
    setFor(activeRun, { ...state, status: "saving" });
    void api(`/games/${id}/publish`, "POST", {})
      .then(() => {
        setFor(activeRun, { ...state, status: "saved" });
        reachGoal(ACCOUNT_GOALS.resultPublished, {
          game,
          score: state.score ?? 0,
          automatic: true,
          mode: activeRun.mode ?? "classic",
        });
      })
      .catch((e) => {
        setFor(activeRun, {
          ...state,
          status: "save-error",
          message:
            e instanceof Error ? e.message : "Не удалось сохранить результат",
        });
        if (e instanceof ApiError && e.status === 401) void refresh();
      })
      .finally(() => {
        if (publishing.current === id) publishing.current = null;
      });
  }, [state, game, user?.id]);
  function begin(mode?: GeoMode): Promise<Run | null> {
    const run = {
      epoch: current.current.epoch + 1,
      mode,
      run: Promise.resolve(null) as Promise<Run | null>,
      tasks: [] as Task[],
      accepted: 0,
      working: false,
    };
    current.current = run;
    setState({ status: "loading" });
    run.run = api<Run>("/games", "POST", {
      game,
      mode,
      geoRulesVersion: game === "geo" ? GEO_SCORE_VERSION : undefined,
    })
      .then((data) => {
        setFor(run, { status: "ready", id: data.id });
        return data;
      })
      .catch(() => {
        setFor(run, { status: "local" });
        return null;
      });
    return run.run;
  }
  async function flush(run = current.current) {
    if (run.working) return run.drained;
    run.working = true;
    let finish: () => void = () => {};
    run.drained = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const data = await run.run;
    if (!data) {
      run.working = false;
      finish();
      return;
    }
    try {
      while (run.accepted < run.tasks.length) {
        setFor(run, { status: "checking", id: data.id });
        const task = run.tasks[run.accepted];
        const result = await api(`/games/${data.id}/answers`, "POST", task);
        run.accepted++;
        setFor(run, {
          status: result.completed ? "complete" : "ready",
          id: data.id,
          score: result.score ?? undefined,
        });
      }
    } catch (e) {
      setFor(run, {
        status: "error",
        id: data.id,
        message:
          e instanceof Error ? e.message : "Не удалось проверить результат",
      });
    } finally {
      run.working = false;
      finish();
    }
  }
  function submit(index: number, answer: unknown) {
    const run = current.current;
    if (!run.tasks.some((t) => t.index === index))
      run.tasks.push({ index, answer });
    void flush(run);
  }
  async function panorama(index: number, pano: string) {
    const run = current.current;
    // Commit the preceding answer before registering the next round.
    await flush(run);
    const data = await run.run;
    if (!data) return null;
    try {
      const verified = await api(`/games/${data.id}/panorama`, "POST", {
        index,
        pano,
      });
      return verified.actual;
    } catch (e) {
      setFor(run, {
        status: "local",
        message: e instanceof Error ? e.message : undefined,
      });
      current.current = { ...run, run: Promise.resolve(null) };
      return null;
    }
  }
  async function replaceGeo(index: number) {
    const run = current.current;
    await flush(run);
    const data = await run.run;
    if (!data) return null;
    try {
      return (await api(`/games/${data.id}/replace`, "POST", { index })).place;
    } catch {
      local();
      return null;
    }
  }
  async function geoReady(index: number) {
    const run = current.current;
    await flush(run);
    const data = await run.run;
    if (!data) return null;
    try {
      const timing = await api(`/games/${data.id}/ready`, "POST", { index });
      return Date.now() + timing.deadline - timing.serverNow;
    } catch {
      if (current.current === run) local();
      return null;
    }
  }
  function geoPin(index: number, guess: GeoPoint) {
    const run = current.current;
    run.pinWork = (run.pinWork ?? Promise.resolve()).then(async () => {
      const data = await run.run;
      if (!data) return;
      try {
        await api(`/games/${data.id}/pin`, "POST", { index, guess });
      } catch (e) {
        if (
          !(e instanceof ApiError && e.status === 409) &&
          current.current === run
        )
          local();
      }
    });
  }
  async function geoAnswer(
    index: number,
    guess: GeoPoint | null,
    expired: boolean,
  ) {
    const run = current.current;
    await flush(run);
    await run.pinWork;
    const data = await run.run;
    if (!data) return null;
    try {
      setFor(run, { status: "checking", id: data.id });
      const result = await api(`/games/${data.id}/answers`, "POST", {
        index,
        answer: { guess, expired },
      });
      setFor(run, {
        status: result.completed ? "complete" : "ready",
        id: data.id,
        score: result.score ?? undefined,
      });
      return result.answer;
    } catch {
      if (current.current === run) local();
      return null;
    }
  }
  function local() {
    const run = current.current;
    setFor(run, { status: "local" });
    current.current = { ...run, run: Promise.resolve(null) };
  }
  return {
    state,
    mode: current.current.mode ?? "classic",
    local,
    replaceGeo,
    begin,
    submit,
    panorama,
    geoReady,
    geoPin,
    geoAnswer,
    retry: () => void flush(),
    retrySave: () =>
      setState((s) => ({ ...s, status: "complete", message: undefined })),
    saved: (id: string) =>
      setState((s) => (s.id === id ? { ...s, status: "saved" } : s)),
  };
}
export type RankedRun = ReturnType<typeof useRankedRun>;
export function SaveResult({ run, game }: { run: RankedRun; game: GameId }) {
  const { user, loading } = useAuth();
  const s = run.state;
  const ranking = `/leaderboard/?game=${game}&mode=${run.mode}`;
  function login() {
    if (!s.id) return;
    reachGoal(ACCOUNT_GOALS.loginStart, { source: "game_result", game });
    window.location.assign(
      "/api/auth/yandex/start?return=" +
        encodeURIComponent(`/account/?claim=${s.id}`),
    );
  }
  if (s.status === "idle" || s.status === "local")
    return (
      <div className="save-result">
        <p>
          Рекорд сохранён в этом браузере. Для рейтинга начни новую партию с
          доступным соединением.
        </p>
        <a href={ranking}>Рейтинг игры →</a>
      </div>
    );
  if (["loading", "checking", "ready"].includes(s.status))
    return (
      <div className="save-result" role="status">
        Проверяем результат для рейтинга…
      </div>
    );
  if (s.status === "error")
    return (
      <div className="save-result">
        <p role="status">{s.message}</p>
        <button className="text-button" onClick={run.retry}>
          Повторить проверку
        </button>
      </div>
    );
  const waiting =
    loading || s.status === "saving" || (s.status === "complete" && !!user);
  return (
    <div className="save-result">
      <p role="status">
        {s.status === "saved"
          ? "Результат сохранён в рейтинг."
          : waiting
            ? "Сохраняем результат в рейтинг…"
            : s.status === "save-error"
              ? "Не удалось сохранить результат. Проверь соединение и попробуй ещё раз."
              : "Войди через Яндекс, чтобы сохранить этот результат в рейтинг."}
      </p>
      <div>
        {!waiting &&
          s.status !== "saved" &&
          (user ? (
            <button className="primary" onClick={run.retrySave}>
              Повторить сохранение
            </button>
          ) : (
            <button className="primary" onClick={login}>
              Войти и сохранить
            </button>
          ))}
        <a href={ranking}>Рейтинг игры →</a>
      </div>
    </div>
  );
}
export const resultText = (
  game: GameId,
  score: number,
  version = GEO_SCORE_VERSION,
) =>
  game === "circle"
    ? `${score.toFixed(1).replace(".", ",")}%`
    : `${geoPoints(score)} / ${game === "geo" && version !== 1 ? geoPoints(GEO_MAX_POINTS) : "500"}`;
