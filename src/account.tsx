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
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
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
      className="account-nav"
      href="/account/"
      aria-label={user ? "Личный кабинет" : "Войти через Яндекс"}
      title={user?.nickname ?? "Войти"}
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
      <span>{user?.nickname ?? "Войти"}</span>
    </a>
  );
}
type Run = { id: string; game: GameId; challenge: any };
type RunState = {
  status:
    | "idle"
    | "loading"
    | "local"
    | "ready"
    | "checking"
    | "complete"
    | "saved"
    | "error";
  id?: string;
  score?: number;
  message?: string;
};
type Task = { index: number; answer: unknown };
export function useRankedRun(game: GameId) {
  const [state, setState] = useState<RunState>({ status: "idle" });
  const current = useRef<{
    epoch: number;
    run: Promise<Run | null>;
    tasks: Task[];
    accepted: number;
    working: boolean;
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
  function begin(): Promise<Run | null> {
    const run = {
      epoch: current.current.epoch + 1,
      run: Promise.resolve(null) as Promise<Run | null>,
      tasks: [] as Task[],
      accepted: 0,
      working: false,
    };
    current.current = run;
    setState({ status: "loading" });
    run.run = api<Run>("/games", "POST", { game })
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
    if (run.working) return;
    run.working = true;
    const data = await run.run;
    if (!data) {
      run.working = false;
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
    }
  }
  function submit(index: number, answer: unknown) {
    const run = current.current;
    if (!run.tasks.some((t) => t.index === index))
      run.tasks.push({ index, answer });
    void flush(run);
  }
  async function panorama(index: number, pano: string) {
    const run = current.current,
      data = await run.run;
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
    const data = await current.current.run;
    if (!data) return null;
    try {
      return (await api(`/games/${data.id}/replace`, "POST", { index })).place;
    } catch {
      local();
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
    local,
    replaceGeo,
    begin,
    submit,
    panorama,
    retry: () => void flush(),
    saved: (id: string) =>
      setState((s) => (s.id === id ? { ...s, status: "saved" } : s)),
  };
}
export type RankedRun = ReturnType<typeof useRankedRun>;
export function SaveResult({ run, game }: { run: RankedRun; game: GameId }) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const s = run.state;
  if (s.status === "idle" || s.status === "local")
    return (
      <div className="save-result">
        <p>
          Рекорд сохранён в этом браузере. Для рейтинга начни новую партию с
          доступным соединением.
        </p>
        <a href={`/leaderboard/?game=${game}`}>Рейтинг игры →</a>
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
  async function save() {
    if (!s.id || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!user || !user.nickname_confirmed) {
        if (!user)
          reachGoal(ACCOUNT_GOALS.loginStart, { source: "game_result", game });
        window.location.assign(
          !user
            ? "/api/auth/yandex/start?return=" +
                encodeURIComponent(`/account/?claim=${s.id}`)
            : `/account/?claim=${s.id}`,
        );
        return;
      }
      await api(`/games/${s.id}/publish`, "POST", {});
      run.saved(s.id);
      reachGoal(ACCOUNT_GOALS.resultPublished, { game, score: s.score ?? 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        window.location.assign(
          "/api/auth/yandex/start?return=" +
            encodeURIComponent(`/account/?claim=${s.id}`),
        );
      else setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="save-result">
      <p>
        {s.status === "saved"
          ? "Результат сохранён в рейтинг."
          : user
            ? "Сохрани результат в общий рейтинг."
            : "Войди через Яндекс, чтобы сохранить этот результат в рейтинг."}
      </p>
      <div>
        {s.status !== "saved" && (
          <button
            className="primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Сохраняем…" : "Сохранить в рейтинг"}
          </button>
        )}
        <a href={`/leaderboard/?game=${game}`}>Рейтинг игры →</a>
      </div>
      <p className="account-message" role="status">
        {error}
      </p>
    </div>
  );
}
export const resultText = (game: GameId, score: number) =>
  game === "circle"
    ? `${score.toFixed(1).replace(".", ",")}%`
    : `${score} / 500`;
