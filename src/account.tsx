import {
  createRankedQueue,
  retryable,
  sameColorTargets,
  type RankedState,
  type ServerRun,
} from "./rankedQueue";
import { SHADE_SCORE_VERSION } from "./colorfle";
import { PRESSURE_RULES_VERSION, formatPressScore } from "./pressure";
import { pairs } from "./data";
import {
  GEO_MAX_POINTS,
  GEO_SCORE_VERSION,
  geoPoints,
  type GeoMode,
  type GeoPoint,
} from "./geo";
import { ACCOUNT_GOALS, reachGoal, type MetrikaParams } from "./analytics";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
export type GameId = "naglaz" | "circle" | "colorfle" | "geo" | "pressure";
export const gameNames: Record<GameId, string> = {
  naglaz: "На глаз",
  circle: "Круг",
  colorfle: "Оттенок",
  geo: "Где я?",
  pressure: "Жми",
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
    signal: AbortSignal.timeout(15000),
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Сервис временно недоступен" }));
  if (!response.ok || data.error)
    throw new ApiError(
      data.error ?? "Не удалось выполнить запрос",
      response.ok ? 502 : response.status,
    );
  return data;
}
const publishedEvents = new Set<string>();
export function trackPublished(id: string, params: MetrikaParams) {
  if (publishedEvents.has(id)) return;
  publishedEvents.add(id);
  reachGoal(ACCOUNT_GOALS.resultPublished, params);
}
let refreshAuth: () => Promise<void> = async () => {};
const rankedQueue = createRankedQueue(api, {
  onUnauthorized: () => void refreshAuth(),
  onPublished: (run, score) =>
    trackPublished(run.id, {
      game: run.game,
      score,
      automatic: true,
      mode: run.mode ?? "classic",
    }),
});
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
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refreshAuth = refresh;
    void refresh();
    return () => {
      refreshAuth = async () => {};
    };
  }, []);
  useEffect(() => {
    rankedQueue.connect(user?.id ?? null);
  }, [user?.id]);
  useEffect(() => {
    const recover = () => {
      rankedQueue.retry();
      void refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") recover();
    };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    const stored = (e: StorageEvent) => {
      if (e.key === "playne:ranked-pending:v1") rankedQueue.recover();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", stored);
    return () => {
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", stored);
    };
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
export class RankedSyncError extends Error {}
export function useRankedRun(game: GameId) {
  const [state, setState] = useState<RankedState>({ status: "idle" });
  const current = useRef<{
    generation: number;
    key?: string;
    mode?: GeoMode;
    run: Promise<ServerRun | null>;
    queued: { index: number; answer: unknown }[];
  }>({ generation: 0, run: Promise.resolve(null), queued: [] });
  const restoreAction = useRef<(() => void) | null>(null);
  const alive = useRef(true),
    restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function sync() {
    const p = current.current.key && rankedQueue.get(current.current.key);
    if (p && alive.current) setState({ ...p.state });
  }
  useEffect(() => {
    alive.current = true;
    const off = rankedQueue.subscribe(sync);
    return () => {
      alive.current = false;
      off();
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
    };
  }, []);
  function activate(data: ServerRun | null, generation: number) {
    const key = rankedQueue.add(data, game, current.current.mode);
    if (current.current.generation === generation) {
      current.current.key = key;
      rankedQueue.enqueueMany(key, current.current.queued);
      current.current.queued = [];
      sync();
    }
    return data;
  }
  function begin(mode?: GeoMode): Promise<ServerRun | null> {
    const generation = current.current.generation + 1;
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    restoreAction.current = null;
    const active = {
      generation,
      mode,
      key: undefined as string | undefined,
      queued: [] as { index: number; answer: unknown }[],
      run: Promise.resolve(null) as Promise<ServerRun | null>,
    };
    current.current = active;
    if (game === "circle") {
      active.key = rankedQueue.add(null, "circle");
      sync();
      return active.run;
    }
    setState({ status: "loading" });
    active.run = api<ServerRun>("/games", "POST", {
      game,
      mode,
      geoRulesVersion: game === "geo" ? GEO_SCORE_VERSION : undefined,
      pressureRulesVersion:
        game === "pressure" ? PRESSURE_RULES_VERSION : undefined,
      supportedPairIds:
        game === "naglaz" ? pairs.map((pair) => pair.id) : undefined,
    })
      .then((data) => activate(data, generation))
      .catch((e) => {
        if (alive.current && current.current === active)
          setState({
            status: "error",
            message:
              "Не удалось загрузить партию. Проверь соединение и попробуй ещё раз.",
          });
        return null;
      });
    return active.run;
  }
  function submit(index: number, answer: unknown) {
    const active = current.current;
    if (active.key) rankedQueue.enqueue(active.key, index, answer);
    else if (!active.queued.some((t) => t.index === index))
      active.queued.push({ index, answer });
  }
  async function resumeColor(
    id: string | undefined,
    targets: unknown[],
    answers: { choice: unknown; timedOut?: boolean; noChoice?: boolean }[],
  ) {
    if (game !== "colorfle") return;
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    restoreAction.current = () => void resumeColor(id, targets, answers);
    const active = current.current;
    const known = active.key ? rankedQueue.get(active.key) : undefined;
    if (
      known?.run?.version === SHADE_SCORE_VERSION &&
      sameColorTargets(known.run.challenge.targets, targets)
    )
      return known.run;
    const key = id ? rankedQueue.find(id) : rankedQueue.findColor(targets);
    const cached = key ? rankedQueue.get(key) : undefined;
    if (
      cached?.run &&
      cached.run.version === SHADE_SCORE_VERSION &&
      sameColorTargets(cached.run.challenge.targets, targets)
    ) {
      active.key = key;
      active.mode = cached.run.mode ?? cached.run.challenge.mode ?? "classic";
      active.run = Promise.resolve(cached.run);
      rankedQueue.enqueueMany(key!, [
        ...answers.map((answer, index) => ({
          index,
          answer: {
            choice: answer.noChoice ? null : answer.choice,
            expired: answer.timedOut,
          },
        })),
        ...active.queued,
      ]);
      active.queued = [];
      sync();
      void rankedQueue.drain(key!);
      return cached.run;
    }
    setState({ status: "loading" });
    active.run = (
      id
        ? api<ServerRun>(`/games/${id}`)
        : api<ServerRun>("/games/resume", "POST", { game, targets })
    )
      .then((data) => {
        if (
          data.game !== game ||
          !sameColorTargets(data.challenge?.targets, targets)
        )
          throw new ApiError(
            "Сохранённая партия не совпадает с серверным заданием.",
            409,
          );
        if (current.current !== active) return null;
        active.mode = data.mode ?? data.challenge.mode ?? "classic";
        active.queued = [
          ...answers.map((answer, index) => ({
            index,
            answer: {
              choice: answer.noChoice ? null : answer.choice,
              expired: answer.timedOut,
            },
          })),
          ...active.queued,
        ];
        activate(data, active.generation);
        void rankedQueue.drain(active.key!);
        return data;
      })
      .catch((e) => {
        if (alive.current && current.current === active) {
          setState({
            status: "error",
            message: retryable(e)
              ? "Восстанавливаем соединение. Результат отправится автоматически."
              : e instanceof Error
                ? e.message
                : "Не удалось восстановить партию.",
          });
          if (retryable(e))
            restoreTimer.current = setTimeout(
              () => void resumeColor(id, targets, answers),
              2000,
            );
        }
        return null;
      });
    return await active.run;
  }
  async function geoRequest(path: string, body: unknown) {
    const active = current.current,
      data = await active.run;
    if (!data || !active.key)
      throw new RankedSyncError("Нет соединения с сервером");
    await rankedQueue.drain(active.key);
    if (rankedQueue.get(active.key)?.tasks.length)
      throw new RankedSyncError("Предыдущий ответ ещё отправляется");
    try {
      return await api(`/games/${data.id}/${path}`, "POST", body);
    } catch (e) {
      if (retryable(e))
        throw new RankedSyncError(
          "Не удалось связаться с сервером. Раунд сохранён, попробуй ещё раз.",
        );
      throw e;
    }
  }
  async function geoAnswer(
    index: number,
    guess: GeoPoint | null,
    expired: boolean,
  ) {
    const active = current.current;
    submit(index, { guess, expired });
    await active.run;
    if (!active.key) return null;
    await rankedQueue.drain(active.key);
    return rankedQueue.get(active.key)?.results[index]?.answer ?? null;
  }
  return {
    state,
    mode: current.current.mode ?? "classic",
    begin,
    submit,
    resumeColor,
    panorama: async (index: number, pano: string) =>
      (await geoRequest("panorama", { index, pano })).actual,
    replaceGeo: async (index: number) =>
      (await geoRequest("replace", { index })).place,
    geoReady: async (index: number) => {
      const timing = await geoRequest("ready", { index });
      return Date.now() + timing.deadline - timing.serverNow;
    },
    shadeReady: async (index: number) => {
      const timing = await geoRequest("ready", { index });
      return Date.now() + timing.deadline - timing.serverNow;
    },
    shadeChoice: (index: number, choice: unknown) => {
      if (current.current.key)
        rankedQueue.pin(current.current.key, index, choice);
    },
    shadeAnswer: async (index: number, answer: unknown) => {
      const active = current.current;
      submit(index, answer);
      await active.run;
      if (!active.key) return null;
      await rankedQueue.drain(active.key);
      return rankedQueue.get(active.key)?.results[index]?.answer ?? null;
    },
    shadeResults: () =>
      current.current.key
        ? rankedQueue.get(current.current.key)?.results
        : undefined,
    geoPin: (index: number, guess: GeoPoint) => {
      if (current.current.key)
        rankedQueue.pin(current.current.key, index, guess);
    },
    geoAnswer,
    retry: () => {
      if (current.current.key) rankedQueue.retry(current.current.key);
      else restoreAction.current?.();
    },
    retrySave: () => {
      if (current.current.key) rankedQueue.retry(current.current.key);
    },
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
  if (s.status === "idle")
    return (
      <div className="save-result">
        <p>Восстанавливаем сохранение результата…</p>
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
              ? (s.message ??
                "Результат сохранён в браузере. Повторяем отправку в рейтинг…")
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
  game === "pressure"
    ? formatPressScore(score)
    : game === "circle"
      ? `${score.toFixed(1).replace(".", ",")}%`
      : `${geoPoints(score)} / ${game === "geo" && version !== 1 ? geoPoints(GEO_MAX_POINTS) : "500"}`;
