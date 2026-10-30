import {
  createRankedQueue,
  retryable,
  sameColorTargets,
  type RankedState,
  type ServerRun,
} from "./rankedQueue";
import { YandexLogin, TopTenEmailOffer } from "./EmailPreferences";
import { rememberPersonalRecord } from "./recordCelebrationState";
import { GuestTrialPanel, ResultStatus } from "./ResultStatus";
import { PLAY_PROGRESS_UPDATED } from "./playProgress";
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
import {
  ACCOUNT_GOALS,
  reachGoal,
  trackChallengeStart,
  trackChallengeComplete,
  SHARE_GOALS,
  type MetrikaParams,
} from "./analytics";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
export type GameId =
  | "naglaz"
  | "circle"
  | "colorfle"
  | "geo"
  | "pressure"
  | "line"
  | "flash"
  | "rotate"
  | "slide"
  | "dispatch";
const isBrain = (game: string) =>
  ["flash", "rotate", "slide", "dispatch"].includes(game);
export type GameMode = GeoMode | "practice";
export const gameNames: Record<GameId, string> = {
  naglaz: "На глаз",
  circle: "Круг",
  colorfle: "Оттенок",
  geo: "Где я?",
  pressure: "Жми",
  line: "Одной линией",
  flash: "Вспышка",
  rotate: "Поворот",
  slide: "Передвинь",
  dispatch: "Диспетчер",
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
  onRecordResult: rememberPersonalRecord,
  onCompleted: trackChallengeComplete,
  onPublished: (run, score) =>
    trackPublished(run.id, {
      game: run.game,
      score,
      automatic: true,
      mode: run.mode ?? "classic",
    }),
});
export type GuestTrial<G extends GameId = GameId> = {
  id?: string;
  mode?: G extends "line" | "flash" | "rotate" | "slide" | "dispatch"
    ? GameMode
    : GeoMode;
  completed: boolean;
  published?: boolean;
  score?: number | null;
};
const AuthContext = createContext<{
  user: User | null;
  trials: Partial<Record<GameId, GuestTrial>>;
  ready: boolean;
  emailSignupAvailable: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}>({
  user: null,
  trials: {},
  ready: true,
  emailSignupAvailable: false,
  loading: false,
  refresh: async () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const [trials, setTrials] = useState<Partial<Record<GameId, GuestTrial>>>({});
  const [ready, setReady] = useState(false);
  const [emailSignupAvailable, setEmailSignupAvailable] = useState(false);
  const verified = useRef(false);
  const loginReported = useRef(false);
  async function refresh() {
    if (!verified.current) setLoading(true);
    try {
      meRequest ??= api("/me").finally(() => {
        meRequest = undefined;
      });
      const data = await meRequest;
      setUser(data.user);
      setEmailSignupAvailable(!!data.emailSignupAvailable);
      setTrials(data.trials ?? {});
      setReady(true);
      verified.current = true;
      if (
        data.user &&
        !loginReported.current &&
        new URLSearchParams(window.location.search).get("auth") === "success"
      ) {
        loginReported.current = true;
        reachGoal(ACCOUNT_GOALS.loginSuccess, { provider: "yandex" });
        const url = new URL(window.location.href);
        url.searchParams.delete("auth");
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
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
      if (e.key === "playne:ranked-pending:v1") {
        rankedQueue.recover();
        try {
          const before = JSON.parse(e.oldValue ?? "[]");
          const after = JSON.parse(e.newValue ?? "[]");
          if (
            Array.isArray(before) &&
            Array.isArray(after) &&
            after.some(
              (p: any) =>
                p?.completed &&
                !before.some((old: any) => old?.key === p.key && old.completed),
            )
          )
            void refresh();
        } catch {
          /* Ignore malformed storage; focus and online also refresh access. */
        }
      }
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
    <AuthContext.Provider
      value={{ user, loading, refresh, trials, ready, emailSignupAvailable }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function useGuestTrial<G extends GameId = GameId>(game?: G) {
  const auth = useAuth();
  const trial = (game ? auth.trials[game] : undefined) as
    | GuestTrial<G>
    | undefined;
  const query =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search);
  const retrying =
    /^[0-9a-f-]{36}$/i.test(query?.get("retry") ?? "") &&
    /^[A-Za-z0-9_-]{43}$/.test(query?.get("challenge") ?? "");
  return {
    ...auth,
    trial,
    blocked: !auth.user && !!trial?.completed && !retrying,
    resume: !auth.user && !!trial && !trial.completed,
  };
}
export function guestLoginReturn(game: GameId, id?: string, mode?: GameMode) {
  const params = new URLSearchParams();
  const challenge =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("challenge");
  if (challenge && /^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    const retry = new URLSearchParams(window.location.search).get("retry");
    return `/${game === "line" ? "one-line" : isBrain(game) ? "brain/" + game : game}/?challenge=${challenge}${retry && /^[0-9a-f-]{36}$/i.test(retry) ? "&retry=" + retry : ""}`;
  }
  if (id) params.set("saved", id);
  if (
    mode &&
    (game === "geo" || game === "colorfle" || game === "line" || isBrain(game))
  )
    params.set("mode", mode);
  return (
    `/${isBrain(game) ? "brain/" + game : game === "line" ? "one-line" : game}/` +
    (params.size ? `?${params}` : "")
  );
}
export function loginToPlay(game: GameId, id?: string, mode?: GameMode) {
  reachGoal(ACCOUNT_GOALS.loginStart, { source: "guest_party", game });
  const path = guestLoginReturn(game, id, mode);
  window.location.assign(
    "/api/auth/yandex/start?return=" + encodeURIComponent(path),
  );
}
export function GuestSavedNotice({ game }: { game: GameId }) {
  const { user, trial } = useGuestTrial(game);
  const saved =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("saved");
  const auth =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("auth");
  if (!user && ["cancelled", "failed", "expired"].includes(auth ?? ""))
    return (
      <p className="guest-auth-notice" role="status">
        {auth === "cancelled"
          ? "Вход отменён. Результат сохранён — войти можно ещё раз."
          : "Не удалось завершить вход. Результат сохранён — попробуй ещё раз."}
      </p>
    );
  return user && trial?.published && saved === trial.id ? (
    <p className="guest-saved-notice" role="status">
      Результат сохранён в рейтинг. Можно играть дальше.
    </p>
  ) : null;
}
export function GuestTrialPrompt({ game, id }: { game: GameId; id?: string }) {
  const { user, trial, ready, loading, refresh } = useGuestTrial(game);
  if (user) return null;
  return (
    <GuestTrialPanel practice={isBrain(game) && trial?.mode === "practice"}>
      <YandexLogin
        disabled={loading}
        source="guest_party"
        game={game}
        returnPath={guestLoginReturn(game, id ?? trial?.id, trial?.mode)}
      >
        Войти и продолжить <span aria-hidden="true">→</span>
      </YandexLogin>
      {!ready && (
        <button className="text-button" onClick={() => void refresh()}>
          Проверить соединение
        </button>
      )}
    </GuestTrialPanel>
  );
}
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
export function useRankedRun<G extends GameId>(game: G) {
  const auth = useGuestTrial(game);
  const retryFrom = useRef(
    typeof window === "undefined"
      ? undefined
      : new URLSearchParams(window.location.search).get("retry") || undefined,
  );
  const invite = useRef(
    typeof window === "undefined"
      ? undefined
      : new URLSearchParams(window.location.search).get("challenge") ||
          undefined,
  );
  const [state, setState] = useState<RankedState>({ status: "idle" });
  const current = useRef<{
    generation: number;
    key?: string;
    mode?: GameMode;
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
  useEffect(() => {
    if (["complete", "saved"].includes(state.status)) {
      void auth.refresh();
      window.dispatchEvent(new Event(PLAY_PROGRESS_UPDATED));
    }
  }, [state.status]);
  useEffect(() => {
    if (
      invite.current &&
      state.id &&
      ["complete", "saved"].includes(state.status) &&
      !["line", "flash", "rotate", "slide", "dispatch"].includes(game)
    ) {
      window.dispatchEvent(
        new CustomEvent("playne:challenge-completed", {
          detail: { game, token: invite.current, id: state.id },
        }),
      );
      window.history.replaceState(
        null,
        "",
        `/${game}/?result=${state.id}&challenge=${invite.current}`,
      );
    }
  }, [state.status, state.id, game]);
  function activate<T extends ServerRun>(
    data: T | null,
    generation: number,
  ): T | null {
    if (
      (game === "line" || isBrain(game)) &&
      data &&
      current.current.generation === generation
    )
      current.current.mode = data.mode ?? data.challenge.mode ?? "classic";
    if (
      data?.completed &&
      invite.current &&
      !["line", "flash", "rotate", "slide", "dispatch"].includes(game)
    ) {
      window.location.assign(
        `/${game}/?result=${data.id}&challenge=${invite.current}`,
      );
      return null;
    }
    const key = rankedQueue.add(data, game, current.current.mode);
    if (current.current.generation === generation) {
      current.current.key = key;
      rankedQueue.enqueueMany(key, current.current.queued);
      current.current.queued = [];
      sync();
    }
    return data;
  }
  function begin(
    mode?: GameMode,
    difficulty = 1,
    challenge: string | undefined = invite.current,
  ): Promise<ServerRun<G> | null> {
    const generation = current.current.generation + 1;
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    restoreAction.current = null;
    const active = {
      generation,
      mode,
      key: undefined as string | undefined,
      queued: [] as { index: number; answer: unknown }[],
      run: Promise.resolve(null) as Promise<ServerRun<G> | null>,
    };
    current.current = active;
    if (game === "circle" && !challenge) {
      active.key = rankedQueue.add(null, "circle");
      sync();
      return active.run;
    }
    setState({ status: "loading" });
    active.run = rankedQueue
      .flushGame(game)
      .then(() =>
        api<ServerRun<G>>("/games", "POST", {
          game,
          mode,
          ...(isBrain(game) ? { difficulty } : {}),
          ...(challenge
            ? {
                challenge,
                ...(retryFrom.current ? { retry: retryFrom.current } : {}),
              }
            : {}),
          geoRulesVersion: game === "geo" ? GEO_SCORE_VERSION : undefined,
          pressureRulesVersion:
            game === "pressure" ? PRESSURE_RULES_VERSION : undefined,
          supportedPairIds:
            game === "naglaz" ? pairs.map((pair) => pair.id) : undefined,
        }),
      )
      .then((data) => {
        if (current.current === active && challenge && data && !data.completed)
          trackChallengeStart(data, !!auth.user);
        return activate(data, generation);
      })
      .catch((e) => {
        if (challenge && current.current === active)
          reachGoal(SHARE_GOALS.error, { game, stage: "start" });
        if (e instanceof ApiError && e.status === 403) void auth.refresh();
        if (alive.current && current.current === active)
          setState({
            status: "error",
            message:
              e instanceof ApiError && (challenge || e.status === 403)
                ? e.message
                : "Не удалось загрузить партию. Проверь соединение и попробуй ещё раз.",
          });
        return null;
      });
    return active.run;
  }
  function resume(id: string): Promise<ServerRun | null> {
    const active = {
      generation: current.current.generation + 1,
      mode: undefined as GameMode | undefined,
      key: undefined as string | undefined,
      queued: [] as { index: number; answer: unknown }[],
      run: Promise.resolve(null) as Promise<ServerRun | null>,
    };
    current.current = active;
    setState({ status: "loading" });
    active.run = rankedQueue
      .flushGame(game)
      .then(() => api<ServerRun>(`/games/${encodeURIComponent(id)}`))
      .then((data) => {
        if (data.game !== game) throw new Error("Это партия другой игры");
        active.mode = data.mode ?? data.challenge.mode ?? "classic";
        return activate(data, active.generation);
      })
      .catch((error) => {
        if (alive.current && current.current === active)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Не удалось восстановить партию",
          });
        if (
          (game === "line" || isBrain(game)) &&
          error instanceof ApiError &&
          [403, 404, 410].includes(error.status)
        )
          throw error;
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
    get comparisonToken(): string | undefined {
      return current.current.key
        ? rankedQueue.get(current.current.key)?.run?.challenge?.comparisonToken
        : undefined;
    },
    state,
    mode: (current.current.mode ?? "classic") as G extends
      | "line"
      | "flash"
      | "rotate"
      | "slide"
      | "dispatch"
      ? GameMode
      : GeoMode,
    begin,
    submit,
    resumeColor,
    resume,
    brainStart: (index: number) => geoRequest("brain/start", { index }),
    brainHint: (index: number, moves: unknown[], requestId: string) =>
      geoRequest("brain/hint", { index, moves, requestId }),
    brainAnswer: async (index: number, answer: unknown) => {
      const active = current.current;
      submit(index, answer);
      const run = await active.run;
      if (!active.key || !run)
        throw new RankedSyncError("Нет соединения с сервером");
      await rankedQueue.drain(active.key);
      if (rankedQueue.get(active.key)?.tasks.length)
        throw new RankedSyncError(
          "Ответ сохранён в браузере и ещё отправляется",
        );
      const fresh = await api<ServerRun>(`/games/${run.id}`);
      active.run = Promise.resolve(fresh);
      return activate(fresh, active.generation);
    },
    lineStart: (index: number) => geoRequest("line/start", { index }),
    lineHint: (index: number, path: number[], requestId: string) =>
      geoRequest("line/hint", { index, path, requestId }),
    lineAnswer: async (index: number, path: number[]) => {
      const active = current.current;
      submit(index, { path });
      const run = await active.run;
      if (!active.key || !run) return null;
      await rankedQueue.drain(active.key);
      if (rankedQueue.get(active.key)?.tasks.length)
        throw new RankedSyncError(
          "Ответ сохранён в браузере и ещё отправляется",
        );
      const fresh = await api<ServerRun>(`/games/${run.id}`);
      active.run = Promise.resolve(fresh);
      return activate(fresh, active.generation);
    },
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
  if (isBrain(game) && run.mode === "practice")
    return (
      <p className="save-result" role="status">
        Результат практики сохранён в личной истории. В публичный рейтинг
        попадает задача дня.
      </p>
    );
  function login() {
    if (!s.id) return;
    reachGoal(ACCOUNT_GOALS.loginStart, { source: "game_result", game });
    window.location.assign(
      "/api/auth/yandex/start?return=" +
        encodeURIComponent(`/account/?claim=${s.id}`),
    );
  }
  if (s.status === "idle")
    return <ResultStatus state="restoring" ranking={ranking} />;
  if (["loading", "checking", "ready"].includes(s.status))
    return <ResultStatus state="checking" />;
  if (s.status === "error")
    return (
      <ResultStatus
        state="check-error"
        message={s.message}
        onRetry={run.retry}
      />
    );
  if (!loading && !user && ["complete", "save-error"].includes(s.status))
    return <GuestTrialPrompt game={game} id={s.id} />;
  const waiting =
    loading || s.status === "saving" || (s.status === "complete" && !!user);
  return (
    <ResultStatus
      state={s.status === "saved" ? "saved" : waiting ? "saving" : "save-error"}
      message={s.status !== "saved" && !waiting ? s.message : undefined}
      ranking={ranking}
      onRetry={
        !waiting && s.status !== "saved" && user ? run.retrySave : undefined
      }
    >
      {!waiting && s.status !== "saved" && !user && (
        <button className="primary" onClick={login}>
          Войти и сохранить
        </button>
      )}
      {s.status === "saved" && user && (
        <TopTenEmailOffer game={game} mode={run.mode} />
      )}
    </ResultStatus>
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
