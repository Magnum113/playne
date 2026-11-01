import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { api, useAuth, loginToPlay } from "./account";
import { GameHeader } from "./SiteHeader";
import { RulesDialog } from "./RulesDialog";
import FooterLinks from "./FooterLinks";
import { useGameViewport } from "./useGameViewport";
import { PLAY_PROGRESS_UPDATED } from "./playProgress";
import {
  FLOW_GOALS,
  reachGoal,
  reachGoalOnce,
  trackChallengeStart,
  trackChallengeComplete,
  trackChallengeResult,
} from "./analytics";
import { flowAnalyticsParams, trackFlowReturn } from "./flowAnalytics";
import { FlowAnt, FlowCrate, FlowScene } from "./FlowArt";
import { FlowQueueLinks } from "./FlowQueueLinks";
import { FlowDocks } from "./FlowDocks";
import {
  flowAllocateDocks,
  flowDockRemaining,
  type FlowDockTeam,
} from "./flowDockLayout";
import { FlowLevelPicker, FlowStars as Stars } from "./FlowLevelPicker";
import {
  FLOW_COLORS,
  FLOW_VERSION,
  FLOW_LEVELS,
  flowDay,
  flowFrontier,
  flowLaunchPackets,
  makeFlowPuzzle,
  replayFlow,
  type FlowAction,
} from "./flow";
import {
  flowRecordKey,
  flowUnlocked,
  mergeFlowRecords,
  readFlowSave,
  writeFlowSave,
  type FlowAttempt,
  type FlowRecord,
  type FlowSave,
} from "./flowStorage";
import { FlowAudio, type FlowSound } from "./flowAudio";
import {
  flowMotion,
  flowRetimeMotion,
  flowWorld,
  type FlowMotion,
} from "./flowPresentation";
import { flowSoundscape } from "./flowSoundscape";
import ShareResult from "./ShareResult";
import ChallengeComparison from "./ChallengeComparison";
import { readChallengeToken } from "./ChallengeContext";
import { challengeTask, type PublicChallenge } from "./challenges";
import { FlowCelebration } from "./FlowEffects";
import "./flow.css";

type Board = {
  day: string;
  total: number;
  entries: { place: number; nickname: string; score: number; isMe: boolean }[];
};
type Flight = {
  cells: number[];
  timing: FlowMotion;
  teams: FlowDockTeam[];
  delivered: Record<number, number>;
  baseCollected: number;
  serial: number;
};
type SceneTimer = {
  handle: ReturnType<typeof setTimeout> | null;
  at: number;
  callback: () => void;
};
function FlowIcon({
  kind,
}: {
  kind: "motion" | "still" | "lock" | "pause" | "undo" | "restart" | "queue";
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "pause" ? (
        <path d="M8 5v14M16 5v14" strokeWidth="4" />
      ) : kind === "undo" ? (
        <path d="M8 8H3V3m0 5a9 9 0 1 1 0 8" />
      ) : kind === "restart" ? (
        <path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5" />
      ) : kind === "queue" ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
      ) : kind === "lock" ? (
        <>
          <rect x="5" y="10" width="14" height="11" rx="3" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
        </>
      ) : kind === "motion" || kind === "still" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          {kind === "motion" ? (
            <>
              <path d="M9 8v8m6-8v8" />
            </>
          ) : (
            <path d="m10 8 6 4-6 4Z" />
          )}
        </>
      ) : (
        <path d="M9 8v8m6-8v8" />
      )}
    </svg>
  );
}
const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${day}T12:00:00Z`));

function FlowChallenge({
  token,
  scope,
  signed,
}: {
  token: string;
  scope: string;
  signed: boolean;
}) {
  const [reference, setReference] = useState<PublicChallenge | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api<PublicChallenge>(`/challenges/${encodeURIComponent(token)}`)
      .then((data) => {
        if (data.game !== "flow" || !data.flow) throw Error("Неверный вызов");
        if (alive) setReference(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [token]);
  if (failed)
    return (
      <section className="flow-selection">
        <p role="alert">Вызов недоступен.</p>
        <a href="/swarm/">Открыть «Рой» →</a>
      </section>
    );
  if (!reference) return <p role="status">Загружаем вызов…</p>;
  return (
    <FlowSession
      key={`${FLOW_VERSION}:${reference.flow?.version ?? 2}:${scope}`}
      scope={`challenge:${token}:${scope}`}
      signed={signed}
      challenge={reference}
    />
  );
}

export default function FlowGame() {
  const { user, loading } = useAuth();
  const [challengeToken] = useState(readChallengeToken);
  const viewed = useRef(false);
  useEffect(() => {
    if (loading || viewed.current) return;
    viewed.current = true;
    const daily =
      new URLSearchParams(window.location.search).get("mode") === "daily";
    reachGoal(FLOW_GOALS.view, {
      game: "flow",
      source: challengeToken ? "challenge" : daily ? "daily" : "campaign",
      ...(!challengeToken ? { mode: daily ? "daily" : "level" } : {}),
      player: user ? "account" : "guest",
      ...(!challengeToken ? { field_version: FLOW_VERSION } : {}),
    });
  }, [loading, challengeToken, !!user]);
  return (
    <div className="flow-page">
      <a className="skip-link" href="#flow-main">
        К игре
      </a>
      <GameHeader />
      <main id="flow-main" className="flow-main">
        {loading ? (
          <p role="status">Готовим посадочную площадку…</p>
        ) : challengeToken ? (
          <FlowChallenge
            key={`${user?.id ?? "guest"}:${challengeToken}`}
            token={challengeToken}
            scope={user?.id ?? "guest"}
            signed={!!user}
          />
        ) : (
          <FlowSession
            key={`${FLOW_VERSION}:${user?.id ?? "guest"}`}
            scope={user?.id ?? "guest"}
            signed={!!user}
          />
        )}
      </main>
      <FooterLinks />
    </div>
  );
}

export function FlowSession({
  scope,
  signed,
  challenge,
}: {
  scope: string;
  signed: boolean;
  challenge?: PublicChallenge;
}) {
  const matchesChallenge = (attempt: FlowAttempt | null) =>
    !!attempt &&
    !!challenge?.flow &&
    attempt.challengeToken === challenge.token &&
    attempt.kind === challenge.flow.kind &&
    attempt.key === challenge.flow.key &&
    (attempt.version ?? FLOW_VERSION) === (challenge.flow.version ?? 2);
  const [save, setSave] = useState<FlowSave>(() => {
    const current = readFlowSave(scope);
    if (challenge) {
      if (current.active && !matchesChallenge(current.active))
        current.active = null;
      if (!signed) return current;
      const guest = readFlowSave(`challenge:${challenge.token}:guest`);
      return {
        ...current,
        active: matchesChallenge(guest.active) ? guest.active : current.active,
        pending: [
          ...current.pending,
          ...guest.pending.filter(
            (attempt) =>
              matchesChallenge(attempt) &&
              !current.pending.some((saved) => saved.id === attempt.id),
          ),
        ],
      };
    }
    if (!signed) return current;
    const guest = readFlowSave("guest");
    return {
      ...current,
      records: mergeFlowRecords(current.records, guest.records),
      active: guest.active ?? current.active,
      pending: [
        ...current.pending,
        ...guest.pending.filter(
          (p) => !current.pending.some((q) => q.id === p.id),
        ),
      ],
    };
  });
  const guestImported = useRef(false);
  const [screen, setScreen] = useState<"home" | "play">("home");
  const [mode, setMode] = useState<"level" | "daily">(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "daily"
      ? "daily"
      : "level",
  );
  const [day, setDay] = useState(flowDay);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      save.restartedForUpgrade ? "Обновили поле. Уровень начат заново." : "",
    );
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef<Flight | null>(null);
  const sceneEpoch = useRef(performance.now());
  const sceneSerial = useRef(0);
  // Only attempts started or changed here can finish in this visit.
  const playedAttempts = useRef(new Set<string>());
  const seenHalfway = useRef(new Set<string>());
  const [previewColor, setPreviewColor] = useState<number | null>(null);
  const [launchGhosts, setLaunchGhosts] = useState<
    {
      id: number;
      color: number;
      count: number;
      x: number;
      y: number;
      dx: number;
      dy: number;
      width: number;
      scale: number;
      duration: number;
      slot: number;
    }[]
  >([]);
  const launchSerial = useRef(0),
    fxTimers = useRef(new Set<SceneTimer>());
  const supply = useRef<HTMLDivElement>(null);
  const launchButtons = useRef<(HTMLButtonElement | null)[]>([]),
    dockElements = useRef<(HTMLDivElement | null)[]>([]);
  const [reduced, setReduced] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [sync, setSync] = useState<"idle" | "saving" | "offline" | "error">(
    "idle",
  );
  const [board, setBoard] = useState<Board | null>(null),
    [boardError, setBoardError] = useState(false);
  const [boardRevision, setBoardRevision] = useState(0);
  const [syncRevision, setSyncRevision] = useState(0);
  const rules = useRef<HTMLDialogElement>(null),
    restart = useRef<HTMLDialogElement>(null),
    queueDialog = useRef<HTMLDialogElement>(null),
    pause = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null);
  const latestSave = useRef(save);
  const audio = useRef<FlowAudio | null>(null);
  const sound = () => (audio.current ??= new FlowAudio());
  function changeFlight(
    update: Flight | null | ((current: Flight | null) => Flight | null),
  ) {
    const next =
      typeof update === "function" ? update(flightRef.current) : update;
    flightRef.current = next;
    setFlight(next);
    return next;
  }
  function sceneSound(kind: FlowSound, color = 0, variation = 0, pan = 0) {
    if (
      stage.current &&
      !document.hidden &&
      !document.querySelector("dialog[open]")
    )
      audio.current?.play(kind, color, variation, pan);
  }
  function armEffect(effect: SceneTimer) {
    effect.handle = setTimeout(
      () => {
        fxTimers.current.delete(effect);
        effect.callback();
      },
      Math.max(0, effect.at - performance.now()),
    );
  }
  function later(callback: () => void, delay: number) {
    const effect: SceneTimer = {
      handle: null,
      at: performance.now() + Math.max(0, delay),
      callback,
    };
    fxTimers.current.add(effect);
    armEffect(effect);
  }
  function clearEffects() {
    for (const effect of fxTimers.current)
      if (effect.handle !== null) clearTimeout(effect.handle);
    fxTimers.current.clear();
    audio.current?.cancel();
    sceneSerial.current++;
    sceneEpoch.current = performance.now();
    changeFlight(null);
    setLaunchGhosts([]);
    setBusy(false);
  }
  function changeSpeed() {
    const nextSpeed = speed === 1 ? 2 : 1;
    const now = performance.now();
    const current = flightRef.current;
    if (current && busy) {
      changeFlight({
        ...current,
        timing: flowRetimeMotion(
          current.timing,
          now - sceneEpoch.current,
          speed,
          nextSpeed,
        ),
      });
      // Move every pending cue, pickup, delivery and settle to the same clock.
      // Fired effects have already left this set and can never fire twice.
      for (const effect of fxTimers.current) {
        if (effect.handle !== null) clearTimeout(effect.handle);
        effect.at = now + Math.max(0, effect.at - now) * (speed / nextSpeed);
        armEffect(effect);
      }
    }
    setSpeed(nextSpeed);
  }
  latestSave.current = save;
  const active = save.active;
  const puzzle = useMemo(
    () =>
      active
        ? makeFlowPuzzle(
            active.kind,
            active.kind === "level" ? Number(active.key) : active.key,
            active.version ?? FLOW_VERSION,
          )
        : null,
    [active?.id, active?.kind, active?.key, active?.version],
  );
  const game = useMemo(
    () => (puzzle && active ? replayFlow(puzzle, active.actions) : null),
    [puzzle, active?.actions],
  );
  const unlocked = flowUnlocked(save.records);
  const homePuzzle = useMemo(
    () =>
      challenge?.flow
        ? makeFlowPuzzle(
            challenge.flow.kind,
            challenge.flow.kind === "level"
              ? Number(challenge.flow.key)
              : challenge.flow.key,
            challenge.flow.version ?? 2,
          )
        : makeFlowPuzzle(
            mode,
            mode === "daily"
              ? day
              : active?.kind === "level" && !game?.won
                ? Number(active.key)
                : unlocked,
          ),
    [mode, day, unlocked, active?.kind, active?.key, game?.won, challenge],
  );
  const totalStars = Object.entries(save.records)
    .filter(([key]) => key.startsWith("level:"))
    .reduce((sum, [, record]) => sum + record.stars, 0);
  const animated = save.motion && !reduced;
  useEffect(() => {
    if (!animated && flightRef.current) clearEffects();
  }, [animated]);
  const world = flowWorld(
    active?.kind ?? mode,
    active?.key ?? (mode === "daily" ? day : unlocked),
  );
  const homeWorld = flowWorld(
    challenge?.flow?.kind ?? mode,
    challenge?.flow?.key ?? (mode === "daily" ? day : unlocked),
  );
  const worldStyle = {
    "--flow-world-image": `url("${world.image}")`,
    "--flow-world-ground": world.ground,
    "--flow-speed": speed,
  } as CSSProperties;
  useEffect(() => {
    const image = new Image();
    image.src = world.image;
  }, [world.image]);
  useGameViewport(stage, screen === "play" ? (active?.id ?? null) : null);

  useEffect(() => {
    const written = writeFlowSave(scope, save);
    setStorageError(!written);
    if (written && signed && challenge && !guestImported.current) {
      const guestScope = `challenge:${challenge.token}:guest`;
      const guest = readFlowSave(guestScope);
      const copied = [...save.pending, ...(save.active ? [save.active] : [])];
      const moved = (attempt: FlowAttempt | null) =>
        matchesChallenge(attempt) &&
        copied.some(
          (saved) =>
            saved.id === attempt!.id &&
            JSON.stringify(saved.actions) === JSON.stringify(attempt!.actions),
        );
      // Clear only the exact token-scoped snapshot already persisted to the account.
      // A newer attempt written by another tab remains available to that guest.
      guestImported.current = writeFlowSave(guestScope, {
        ...guest,
        active: moved(guest.active) ? null : guest.active,
        pending: guest.pending.filter((attempt) => !moved(attempt)),
      });
    }
    if (written && signed && !challenge && !guestImported.current) {
      const guest = readFlowSave("guest");
      writeFlowSave("guest", {
        ...guest,
        records: {},
        pending: [],
        active: null,
      });
      guestImported.current = true;
    }
  }, [scope, save]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      for (const effect of fxTimers.current)
        if (effect.handle !== null) clearTimeout(effect.handle);
      fxTimers.current.clear();
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    const update = () => setDay(flowDay());
    const interval = setInterval(update, 30000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, []);
  useEffect(() => {
    if (challenge) return;
    let alive = true;
    const load = () => {
      void api<{ records: Record<string, FlowRecord>; day: string }>(
        "/flow/progress",
      )
        .then((data) => {
          if (alive) {
            setSave((current) => ({
              ...current,
              records: mergeFlowRecords(current.records, data.records),
            }));
            setDay(data.day);
          }
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("online", load);
    return () => {
      alive = false;
      window.removeEventListener("online", load);
    };
  }, [scope, challenge?.token]);
  useEffect(() => {
    let alive = true,
      working = false;
    const flush = async () => {
      if (working || !latestSave.current.pending.length) return;
      working = true;
      setSync("saving");
      try {
        for (const pending of latestSave.current.pending) {
          await api("/flow/finish", "POST", {
            ...pending,
            version: pending.version ?? FLOW_VERSION,
          });
          if (!alive) return;
          setSave((current) => ({
            ...current,
            pending: current.pending.filter((p) => p.id !== pending.id),
          }));
          window.dispatchEvent(new Event(PLAY_PROGRESS_UPDATED));
        }
        if (alive) {
          setSync("idle");
          setBoardRevision((v) => v + 1);
        }
      } catch (error) {
        if (alive)
          setSync(
            (error as any)?.status && (error as any).status < 500
              ? "error"
              : "offline",
          );
      } finally {
        working = false;
      }
    };
    void flush();
    const interval = setInterval(() => void flush(), 30000);
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("online", flush);
      window.removeEventListener("focus", flush);
    };
  }, [scope, save.pending.length, syncRevision]);
  useEffect(() => {
    if (challenge || (mode !== "daily" && active?.kind !== "daily")) return;
    let alive = true;
    setBoardError(false);
    void api<Board>("/flow/leaderboard")
      .then((data) => {
        if (alive) setBoard(data);
      })
      .catch(() => {
        if (alive) setBoardError(true);
      });
    return () => {
      alive = false;
    };
  }, [mode, active?.kind, day, boardRevision]);
  useEffect(() => {
    if (game?.won && !busy)
      resultHeading.current?.focus({ preventScroll: true });
  }, [game?.won, busy]);

  useEffect(() => {
    if (
      challenge &&
      game?.won &&
      !busy &&
      active?.challengeToken === challenge.token
    )
      trackChallengeResult(active.id, "flow", game.score, challenge.score);
  }, [challenge, game?.won, game?.score, busy, active?.id]);

  useEffect(() => {
    const quiet = () => {
      if (document.hidden) audio.current?.hush();
    };
    document.addEventListener("visibilitychange", quiet);
    return () => document.removeEventListener("visibilitychange", quiet);
  }, []);
  function start(
    kind: "level" | "daily",
    key: string | number,
    entry = "menu",
  ) {
    if (challenge?.flow) {
      kind = challenge.flow.kind;
      key = challenge.flow.key;
    }
    clearEffects();
    setPreviewColor(null);
    sound().wake();
    sound().play("start");
    setMessage("");
    const attempt: FlowAttempt = {
      id: crypto.randomUUID(),
      version: challenge?.flow?.version ?? (challenge ? 2 : FLOW_VERSION),
      ...(challenge ? { challengeToken: challenge.token } : {}),
      kind,
      key: String(key),
      actions: [],
    };
    playedAttempts.current.add(attempt.id);
    setSave((current) => ({ ...current, active: attempt }));
    setMode(kind);
    setScreen("play");
    const params = { ...flowAnalyticsParams(attempt, signed), entry };
    reachGoalOnce(FLOW_GOALS.gameStart, attempt.id, params);
    if (kind === "daily" && !challenge)
      reachGoalOnce(FLOW_GOALS.dailyStart, attempt.id, params);
    if (challenge)
      trackChallengeStart(
        {
          id: attempt.id,
          game: "flow",
          mode: kind,
          challenge:
            entry === "replay" || entry === "restart"
              ? { retryOf: active?.id ?? "replay" }
              : {},
        },
        signed,
      );
  }
  function continueAttempt() {
    if (!active) return;
    if (!game?.won) {
      // Restored progress is a baseline, not a newly reached milestone.
      const cubes = puzzle?.cells.filter((color) => color >= 0).length ?? 0;
      if (game && cubes > 0 && game.state.collected * 2 >= cubes)
        seenHalfway.current.add(active.id);
      reachGoalOnce(FLOW_GOALS.resume, active.id, {
        ...flowAnalyticsParams(active, signed),
        launches: game?.state.launches ?? 0,
      });
      if (challenge)
        trackChallengeStart(
          { id: active.id, game: "flow", mode: active.kind, challenge: {} },
          signed,
        );
    }
    setScreen("play");
  }
  function openRules() {
    if (!rules.current || rules.current.open) return;
    rules.current.showModal();
    const source =
      screen === "play" && active
        ? active
        : challenge?.flow
          ? {
              ...challenge.flow,
              version: challenge.flow.version ?? 2,
              challengeToken: challenge.token,
            }
          : {
              kind: mode,
              key:
                mode === "daily"
                  ? day
                  : active?.kind === "level" && !game?.won
                    ? active.key
                    : String(unlocked),
              version: homePuzzle.version,
            };
    reachGoal(FLOW_GOALS.rulesOpen, {
      ...flowAnalyticsParams(source, signed),
      screen,
    });
  }
  function replayAttempt(reason: "restart" | "replay") {
    if (!active) return;
    reachGoal(FLOW_GOALS.restart, {
      ...flowAnalyticsParams(active, signed),
      reason,
      launches: game?.state.launches ?? 0,
    });
    start(active.kind, active.key, reason);
  }
  function action(next: FlowAction) {
    const attemptBefore = latestSave.current.active;
    if (!attemptBefore || !puzzle || (next.type !== "launch" && busy)) return;
    const before = replayFlow(puzzle, attemptBefore.actions);
    if (before.won || next.type === "hint") return;
    if (attemptBefore.actions.length >= 590) {
      setMessage(
        "Слишком длинная партия. Начни заново — лучший результат останется.",
      );
      return;
    }
    const previous = flightRef.current;
    const initialTeams =
      previous?.teams ??
      before.state.active.map((team, slot) => ({
        id: team.id,
        color: team.color,
        left: team.left,
        link: team.link,
        slot,
      }));
    const delivered = previous?.delivered ?? {};
    const retainedIds = new Set(
      flowDockRemaining(initialTeams, delivered).map((team) => team.id),
    );
    const teams = initialTeams.filter((team) => retainedIds.has(team.id));
    const group =
      next.type === "launch"
        ? flowLaunchPackets(puzzle, before.state, next.lane)
        : null;
    const allocation = group
      ? flowAllocateDocks(
          teams,
          group.map((item) => item.packet),
          puzzle.slots,
        )
      : null;
    if (next.type === "launch" && !allocation) return;
    let updated;
    try {
      updated = replayFlow(puzzle, [...attemptBefore.actions, next]);
    } catch {
      return;
    }
    playedAttempts.current.add(attemptBefore.id);
    const actionParams = {
      ...flowAnalyticsParams(attemptBefore, signed),
      launches: updated.state.launches,
      undos: updated.undos,
    };
    if (next.type === "launch") {
      reachGoalOnce(FLOW_GOALS.engaged, attemptBefore.id, actionParams);
      trackFlowReturn(actionParams);
    } else if (next.type === "undo") {
      reachGoalOnce(
        FLOW_GOALS.undo,
        `${attemptBefore.id}:${attemptBefore.actions.length + 1}`,
        actionParams,
      );
      clearEffects();
    }
    setPreviewColor(null);
    sound().wake();
    setMessage("");
    const attempt = {
      ...attemptBefore,
      actions: [...attemptBefore.actions, next],
    };
    const nextSave: FlowSave = {
      ...latestSave.current,
      active: attempt,
      ...(updated.won
        ? {
            records: challenge
              ? latestSave.current.records
              : mergeFlowRecords(latestSave.current.records, {
                  [flowRecordKey(attempt.kind, attempt.key)]: {
                    score: updated.score,
                    stars: updated.stars,
                  },
                }),
            pending: [
              ...latestSave.current.pending.filter((p) => p.id !== attempt.id),
              attempt,
            ],
          }
        : {}),
    };
    latestSave.current = nextSave;
    setSave(nextSave);
    if (next.type === "launch") {
      const team = group![0].packet;
      sound().play("launch", team.color);
      if (animated) {
        const roster = allocation!.teams;
        const slots = new Map(roster.map((team) => [team.id, team.slot]));
        const origins = new Map<number, { x: number; y: number }>();
        const svg = stage.current?.querySelector<SVGSVGElement>(
          ".flow-board-wrap .flow-scene",
        );
        const matrix = svg?.getScreenCTM?.();
        if (svg && matrix && typeof svg.createSVGPoint === "function") {
          const inverse = matrix.inverse();
          for (const member of roster) {
            const dock =
              dockElements.current[member.slot]?.getBoundingClientRect();
            if (!dock || dock.width <= 0 || dock.height <= 0) continue;
            const point = svg.createSVGPoint();
            point.x = dock.left + dock.width / 2;
            point.y = dock.top + dock.height / 2;
            const local = point.matrixTransform(inverse);
            origins.set(member.id, { x: local.x, y: local.y });
          }
        }
        const now = performance.now() - sceneEpoch.current;
        const timing = flowMotion(updated.events, speed, puzzle, {
          now,
          trips: previous?.timing.trips,
          slots,
          slotCount: puzzle.slots,
          origins,
          cells: previous?.cells ?? before.state.cells,
          epoch: attempt.id,
        });
        const serial = ++sceneSerial.current;
        changeFlight({
          cells: previous?.cells ?? [...before.state.cells],
          timing,
          teams: roster,
          delivered: { ...delivered },
          baseCollected: previous?.baseCollected ?? before.state.collected,
          serial,
        });
        setBusy(true);
        const surface = stage.current?.getBoundingClientRect();
        for (const [index, item] of group!.entries()) {
          const source =
            launchButtons.current[item.lane]?.getBoundingClientRect();
          const target =
            dockElements.current[
              allocation!.slots[index]
            ]?.getBoundingClientRect();
          if (source && target && surface) {
            const ghostId = ++launchSerial.current;
            setLaunchGhosts((current) => [
              ...current,
              {
                id: ghostId,
                color: item.packet.color,
                count: item.packet.count,
                x: source.left - surface.left,
                y: source.top - surface.top,
                dx:
                  puzzle.version === 4
                    ? target.left +
                      target.width / 2 -
                      source.left -
                      source.width / 2
                    : target.left - source.left,
                dy:
                  puzzle.version === 4
                    ? target.bottom - source.bottom
                    : target.top - source.top,
                width: source.width,
                scale: puzzle.version === 4 ? 1 : target.width / source.width,
                duration: timing.launch,
                slot: allocation!.slots[index],
              },
            ]);
            later(
              () =>
                setLaunchGhosts((current) =>
                  current.filter((ghost) => ghost.id !== ghostId),
                ),
              timing.launch + 160 / speed,
            );
          }
        }
        for (const cue of flowSoundscape(
          { ...timing, trips: timing.added },
          speed,
        ))
          later(
            () => sceneSound(cue.kind, cue.color, cue.variation, cue.pan),
            Math.max(0, cue.at - now),
          );
        for (const trip of timing.added) {
          later(
            () =>
              changeFlight((current) => {
                if (!current) return current;
                const cells = [...current.cells];
                cells[trip.cell] = -1;
                return { ...current, cells };
              }),
            Math.max(0, trip.at + 100 / speed - now),
          );
          later(
            () => {
              let completedColor: number | undefined;
              changeFlight((current) => {
                if (!current) return current;
                const delivered = {
                  ...current.delivered,
                  [trip.packet]: (current.delivered[trip.packet] ?? 0) + 1,
                };
                const team = current.teams.find(
                  (team) => team.id === trip.packet,
                );
                if (
                  team &&
                  delivered[trip.packet] === team.left &&
                  (!team.link ||
                    current.teams
                      .filter((member) => member.link === team.link)
                      .every(
                        (member) => (delivered[member.id] ?? 0) >= member.left,
                      ))
                )
                  completedColor = team.color;
                return {
                  ...current,
                  delivered,
                  timing: {
                    ...current.timing,
                    trips: current.timing.trips.filter(
                      (old) => old.id !== trip.id,
                    ),
                  },
                };
              });
              if (completedColor !== undefined)
                sceneSound("dock", completedColor);
            },
            Math.max(0, trip.deliveryAt - now),
          );
        }
        later(
          () => {
            const current = flightRef.current;
            if (!current || current.serial !== serial) return;
            const latest = latestSave.current.active;
            if (!latest || latest.id !== attempt.id) return;
            const settled = replayFlow(puzzle, latest.actions);
            changeFlight({
              cells: settled.state.cells,
              timing: flowMotion([], speed, puzzle),
              teams: flowDockRemaining(current.teams, current.delivered),
              delivered: {},
              baseCollected: settled.state.collected,
              serial,
            });
            setLaunchGhosts([]);
            setBusy(false);
            if (settled.won) sceneSound("win");
            else if (settled.stuck) sceneSound("blocked");
          },
          Math.max(0, timing.finish - now),
        );
      } else {
        if (updated.events.length) sceneSound("collect", team.color);
        if (updated.won) sceneSound("win");
        else if (updated.stuck) sceneSound("blocked");
      }
    } else if (next.type === "undo") sound().play("undo");
    if (updated.stuck) setMessage("Нет свободных слотов. Отмени ход.");
  }
  useEffect(() => {
    if (screen !== "play") return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat ||
        document.querySelector("dialog[open]") ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,select"))
      )
        return;
      if (["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        action({ type: "launch", lane: Number(event.key) - 1 });
      }
      if (["z", "я"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        action({ type: "undo" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const resume = !!active && !game?.won;
  const visibleTeams = flowDockRemaining(
    flight?.teams ??
      game?.state.active.map((team, slot) => ({ ...team, slot })) ??
      [],
    flight?.delivered,
  );
  const visualCollected = flight
    ? flight.baseCollected +
      Object.values(flight.delivered).reduce((a, b) => a + b, 0)
    : (game?.state.collected ?? 0);
  const highlightedColor = previewColor;
  const exposedColors = useMemo(() => {
    if (!puzzle || !game) return new Set<number>();
    const cells = flight?.cells ?? game.state.cells;
    return new Set(flowFrontier(puzzle, cells).map((cell) => cells[cell]));
  }, [puzzle, game?.state.cells, flight?.cells]);
  const totalCubes = puzzle?.cells.filter((color) => color >= 0).length ?? 0;
  const progress =
    game && totalCubes ? Math.round((visualCollected / totalCubes) * 100) : 0;

  useEffect(() => {
    if (
      screen !== "play" ||
      !active ||
      !game ||
      !playedAttempts.current.has(active.id)
    )
      return;
    const params = {
      ...flowAnalyticsParams(active, signed),
      score: game.score,
      stars: game.stars,
      undos: game.undos,
      launches: game.state.launches,
    };
    if (
      totalCubes > 0 &&
      visualCollected * 2 >= totalCubes &&
      !seenHalfway.current.has(active.id)
    ) {
      seenHalfway.current.add(active.id);
      reachGoalOnce(FLOW_GOALS.halfway, active.id, { ...params, progress: 50 });
    }
    if (game.stuck && !busy)
      reachGoalOnce(
        FLOW_GOALS.stuck,
        `${active.id}:${active.actions.length}`,
        params,
      );
    if (!game.won || busy) return;
    reachGoalOnce(FLOW_GOALS.gameComplete, active.id, params);
    if (active.kind === "daily" && !challenge)
      reachGoalOnce(FLOW_GOALS.dailyComplete, active.id, params);
    if (challenge) trackChallengeComplete(active, game.score);
  }, [
    screen,
    active?.id,
    active?.actions.length,
    game?.won,
    game?.stuck,
    game?.score,
    game?.stars,
    game?.undos,
    game?.state.launches,
    busy,
    visualCollected,
    totalCubes,
    signed,
    challenge?.token,
  ]);

  return (
    <div
      className={`flow-session${!animated ? " flow-motion-off" : ""}`}
      onClickCapture={(event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest("button")
            : null;
        if (target && !target.disabled) {
          sound().wake();
          if (!target.matches(".flow-launch,[data-flow-sound]"))
            sound().play("tap");
        }
      }}
    >
      {screen === "home" && (
        <div className="flow-page-heading">
          <h1>
            Рой<span>.</span>
          </h1>
          <button
            type="button"
            className="flow-help"
            aria-label="Как играть"
            onClick={openRules}
          >
            <span aria-hidden="true">?</span>
          </button>
        </div>
      )}
      {storageError && (
        <p className="flow-notice" role="alert">
          Браузер не сохраняет данные. Оставь вкладку открытой до конца уровня;
          отправленные результаты доступны в аккаунте.
        </p>
      )}
      {screen === "home" && challenge?.flow ? (
        <section
          className="flow-selection flow-invitation"
          aria-labelledby="flow-invitation-title"
        >
          <p className="flow-invitation-from">Вызов от {challenge.nickname}</p>
          <h2 id="flow-invitation-title">{challengeTask(challenge)}</h2>
          <div
            className="flow-home-art"
            style={{ backgroundImage: `url("${homeWorld.image}")` }}
          >
            <FlowScene puzzle={homePuzzle} cells={homePuzzle.cells} preview />
          </div>
          <div className="flow-invitation-score">
            <Stars count={challenge.flow.stars} />
            <strong>{challenge.score} / 1000</strong>
          </div>
          <button
            type="button"
            className="flow-primary flow-start"
            onClick={() => {
              if (active?.challengeToken === challenge.token) continueAttempt();
              else start(challenge.flow!.kind, challenge.flow!.key);
            }}
          >
            {active?.challengeToken === challenge.token
              ? game?.won
                ? "Посмотреть результат"
                : "Продолжить вызов"
              : "Принять вызов →"}
          </button>
          <p className="flow-invitation-note">
            То же поле. Отдельная попытка, без изменения кампании и рейтинга.
          </p>
          <a href="/swarm/">К обычной игре</a>
        </section>
      ) : screen === "home" ? (
        <>
          <section
            className="flow-selection"
            aria-labelledby="flow-selection-title"
          >
            <div
              className="flow-mode-switch"
              role="group"
              aria-label="Режим игры"
            >
              <button
                type="button"
                aria-pressed={mode === "level"}
                onClick={() => setMode("level")}
              >
                Уровни
              </button>
              <button
                type="button"
                aria-pressed={mode === "daily"}
                onClick={() => setMode("daily")}
              >
                ✦ На сегодня
              </button>
            </div>
            <div
              className="flow-home-art"
              style={{
                backgroundImage: `linear-gradient(#fff9,#fff2),url("${homeWorld.image}")`,
              }}
            >
              <FlowScene puzzle={homePuzzle} cells={homePuzzle.cells} preview />
            </div>
            {mode === "level" ? (
              <>
                <button
                  type="button"
                  className="flow-primary flow-start"
                  onClick={() => {
                    if (resume && active?.kind === "level") continueAttempt();
                    else start("level", unlocked);
                  }}
                >
                  {resume && active?.kind === "level"
                    ? `Продолжить уровень ${active.key}`
                    : `Начать уровень ${unlocked}`}{" "}
                  <span aria-hidden="true">▶</span>
                </button>
                <FlowLevelPicker
                  unlocked={unlocked}
                  records={save.records}
                  totalStars={totalStars}
                  onSelect={(level) => start("level", level, "level_select")}
                />
              </>
            ) : (
              <div className="flow-daily">
                <h2 id="flow-selection-title">{dateLabel(day)}</h2>
                {save.records[`daily:${day}`] && (
                  <div className="flow-daily-best">
                    <Stars count={save.records[`daily:${day}`].stars} />
                    <strong>{save.records[`daily:${day}`].score} / 1000</strong>
                  </div>
                )}
                <button
                  type="button"
                  className="flow-primary"
                  onClick={() => {
                    if (
                      resume &&
                      active?.kind === "daily" &&
                      active.key === day
                    )
                      continueAttempt();
                    else
                      start(
                        "daily",
                        day,
                        save.records[`daily:${day}`] ? "improve_daily" : "menu",
                      );
                  }}
                >
                  {resume && active?.kind === "daily" && active.key === day
                    ? "Продолжить испытание"
                    : save.records[`daily:${day}`]
                      ? "Улучшить результат"
                      : "Начать испытание"}
                  <span aria-hidden="true">↗</span>
                </button>
                <small>Новая задача в 00:00 · Москва</small>
              </div>
            )}
          </section>
        </>
      ) : active && puzzle && game ? (
        <section
          className={`flow-play${game.stuck ? " is-stuck" : ""}${game.won && !busy ? " is-won" : ""}`}
          data-world={world.id}
          data-layout={puzzle.version === 4 ? "reference" : undefined}
          style={
            {
              ...worldStyle,
              "--flow-lanes": puzzle.lanes.length,
            } as CSSProperties
          }
          ref={stage}
          aria-label="Игровая площадка Рой"
        >
          {game.won && !busy && animated && <FlowCelebration />}
          {launchGhosts.map((launchGhost) => (
            <div
              key={launchGhost.id}
              className="flow-launch-ghost"
              aria-hidden="true"
              style={
                {
                  left: launchGhost.x,
                  top: launchGhost.y,
                  width: launchGhost.width,
                  "--ghost-dx": `${launchGhost.dx}px`,
                  "--ghost-dy": `${launchGhost.dy}px`,
                  "--ghost-scale": launchGhost.scale,
                  "--ghost-time": `${launchGhost.duration}ms`,
                } as CSSProperties
              }
            >
              <FlowCrate color={launchGhost.color} count={launchGhost.count} />
            </div>
          ))}
          <div className="flow-play-top">
            <a
              href="/"
              className="flow-site-back"
              aria-label="Вернуться к играм"
              onClick={clearEffects}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m14 6-6 6 6 6M8 12h12" />
              </svg>
              <span>К играм</span>
            </a>
            <button
              type="button"
              className="flow-icon-button"
              aria-label="Пауза"
              onClick={() => {
                audio.current?.hush();
                pause.current?.showModal();
              }}
            >
              <FlowIcon kind="pause" />
            </button>
            <h1>
              {active.kind === "daily"
                ? dateLabel(active.key)
                : `Уровень ${active.key}`}
              <span className="sr-only"> — Рой</span>
            </h1>
            <button
              type="button"
              className="flow-speed"
              disabled={!animated}
              aria-label={
                speed === 1
                  ? "Ускорить анимации вдвое"
                  : "Обычная скорость анимаций"
              }
              aria-pressed={speed === 2}
              onClick={changeSpeed}
            >
              <span aria-hidden="true">» ×2</span>
            </button>
          </div>
          <div
            className={`flow-arena${!animated ? " flow-still" : ""}`}
            key={`arena:${active.id}`}
            style={{ "--flow-speed": speed } as CSSProperties}
          >
            <h2 className="sr-only">{puzzle.name}</h2>
            <div
              className="flow-progress"
              role="progressbar"
              aria-label="Собрано кубиков"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div
              key={`board:${game.undos}`}
              className={`flow-board-wrap${game.undos ? " is-restoring" : ""}`}
            >
              <FlowScene
                label={
                  busy
                    ? "Муравьи переносят кубики в муравейник"
                    : game.won && !busy
                      ? `Собранная конструкция: ${puzzle.name}`
                      : undefined
                }
                puzzle={puzzle}
                speed={speed}
                highlightColor={highlightedColor}
                cells={
                  game.won && !busy
                    ? puzzle.cells
                    : (flight?.cells ?? game.state.cells)
                }
                motion={flight?.timing}
                moving={busy && animated}
                epoch={sceneEpoch.current}
                revealHidden={game.won && !busy}
              />
              {game.won && !busy && (
                <div className="flow-victory-stamp" aria-hidden="true">
                  ✓
                </div>
              )}
            </div>
          </div>
          {game.won && !busy ? (
            <div className="flow-result">
              <div className="flow-result-crew">
                <FlowAnt color={1} size={48} />
                <Stars count={game.stars} />
                <FlowAnt color={0} size={48} />
              </div>
              <h2 ref={resultHeading} tabIndex={-1}>
                {challenge
                  ? game.score > challenge.score
                    ? "Ты впереди!"
                    : game.score === challenge.score
                      ? "Ничья!"
                      : "Друг впереди"
                  : "Готово!"}
              </h2>
              {challenge ? (
                <ChallengeComparison reference={challenge} score={game.score} />
              ) : (
                <p>
                  <strong>{game.score}</strong> / 1000
                </p>
              )}
              <p className="flow-save-status" role="status">
                {save.pending.some((p) => p.id === active.id)
                  ? sync === "error"
                    ? "Результат на устройстве. Сервер не принял партию; повтори отправку позже."
                    : sync === "offline"
                      ? "Сохранено на устройстве. Отправим, когда появится связь."
                      : "Сохраняем результат…"
                  : signed
                    ? "Сохранено в аккаунте"
                    : "Сохранено на устройстве"}
              </p>
              {save.pending.some((p) => p.id === active.id) &&
                ["error", "offline"].includes(sync) && (
                  <button
                    type="button"
                    className="flow-sync-retry"
                    onClick={() => setSyncRevision((value) => value + 1)}
                  >
                    Повторить отправку
                  </button>
                )}
              <div className="flow-result-actions ui-action-stack ui-action-stack--effect">
                {challenge ? (
                  <a className="flow-primary" href="/swarm/">
                    К игре «Рой» →
                  </a>
                ) : active.kind === "level" &&
                  Number(active.key) < FLOW_LEVELS ? (
                  <button
                    type="button"
                    className="flow-primary"
                    onClick={() => {
                      reachGoalOnce(
                        FLOW_GOALS.nextLevel,
                        active.id,
                        flowAnalyticsParams(active, signed),
                      );
                      start("level", Number(active.key) + 1, "next_level");
                    }}
                  >
                    Следующий уровень →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="flow-primary"
                    onClick={() => {
                      setMode("level");
                      setScreen("home");
                    }}
                  >
                    К уровням →
                  </button>
                )}
                <ShareResult
                  runId={active.id}
                  className="flow-challenge-share"
                  beforeCreate={async () => {
                    if (
                      !latestSave.current.pending.some(
                        (p) => p.id === active.id,
                      )
                    )
                      return;
                    await api("/flow/finish", "POST", {
                      ...active,
                      version: active.version ?? FLOW_VERSION,
                    });
                    setSave((current) => ({
                      ...current,
                      pending: current.pending.filter(
                        (p) => p.id !== active.id,
                      ),
                    }));
                  }}
                />
              </div>
              <div className="flow-result-links">
                <button type="button" onClick={() => replayAttempt("replay")}>
                  Переиграть
                </button>
                {!signed && (
                  <button type="button" onClick={() => loginToPlay("flow")}>
                    Сохранить в аккаунте
                  </button>
                )}
              </div>
              <a href="/" className="flow-mobile-back" onClick={clearEffects}>
                ← Все игры
              </a>
            </div>
          ) : (
            <div className="flow-controls">
              <div className="flow-colony">
                <FlowDocks
                  teams={visibleTeams}
                  count={puzzle.slots}
                  working={
                    new Set(flight?.timing.trips.map((trip) => trip.packet))
                  }
                  launching={new Set(launchGhosts.map((ghost) => ghost.slot))}
                  full={game.stuck && !busy}
                  onSlot={(slot, element) => {
                    dockElements.current[slot] = element;
                  }}
                />
                <h2 className="sr-only">Очереди команд</h2>
                <div
                  ref={supply}
                  className={`flow-supply${puzzle.version === 4 ? " flow-supply-dense" : ""}`}
                  style={{
                    gridTemplateColumns: `repeat(${puzzle.lanes.length}, minmax(0, 1fr))`,
                    maxWidth:
                      puzzle.version === 4
                        ? undefined
                        : puzzle.lanes.length === 3
                          ? 264
                          : 332,
                  }}
                >
                  <FlowQueueLinks
                    puzzle={puzzle}
                    positions={game.state.lanes}
                    supply={supply}
                  />
                  {puzzle.lanes.map((lane, i) => {
                    const remaining = lane.slice(game.state.lanes[i]),
                      team = remaining[0],
                      paint = team ? FLOW_COLORS[team.color] : null;
                    const group = flowLaunchPackets(puzzle, game.state, i);
                    const launchable =
                      !!group &&
                      puzzle.slots - visibleTeams.length >= group.length;
                    const accessible = team && exposedColors.has(team.color);
                    return (
                      <div className="flow-lane" key={i}>
                        <button
                          type="button"
                          className={`flow-launch${!accessible ? " needs-opening" : ""}`}

                          disabled={!launchable}
                          data-flow-packet={team?.id}
                          data-flow-linked={team?.link}
                          title={
                            team?.link
                              ? group
                                ? "Связанная пара · 2 слота"
                                : "Открой вторую коробку связки"
                              : undefined
                          }
                          ref={(element) => {
                            launchButtons.current[i] = element;
                          }}
                          onPointerEnter={() =>
                            setPreviewColor(team?.color ?? null)
                          }
                          onPointerLeave={() => setPreviewColor(null)}
                          onPointerDown={() =>
                            setPreviewColor(team?.color ?? null)
                          }
                          onFocus={() => setPreviewColor(team?.color ?? null)}
                          onBlur={() => setPreviewColor(null)}
                          onClick={() => action({ type: "launch", lane: i })}
                          aria-label={
                            team
                              ? `Очередь ${i + 1}: ${paint!.name} команда ${paint!.symbol}, ${team.count} кубиков. ${team.link ? "Связанная пара, нужны 2 слота. " : ""}${accessible ? "Цвет доступен" : "Пока нет доступных кубиков этого цвета"}. Запустить`
                              : `Очередь ${i + 1} пуста`
                          }
                        >
                          {team ? (
                            <span
                              className="flow-promoted-crate"
                              key={`${active.id}:${team.id}`}
                            >
                              <FlowCrate
                                color={team.color}
                                count={team.count}
                              />
                              {team.link && (
                                <span
                                  className="flow-link-badge"
                                  aria-hidden="true"
                                >
                                  ↔{team.link.split("-").at(-1)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="flow-lane-done" aria-hidden="true">
                              ✓
                            </span>
                          )}
                        </button>
                        <div
                          className="flow-next-packets"
                          key={`queue:${i}:${game.state.lanes[i]}`}
                          aria-label={`Дальше в очереди ${i + 1}`}
                        >
                          {remaining
                            .slice(1, puzzle.version === 4 ? 3 : 4)
                            .map((packet) => (
                              <span
                                key={packet.id}
                                data-flow-packet={packet.id}
                                data-flow-linked={packet.link}
                                aria-label={
                                  packet.mystery
                                    ? "Скрытая команда"
                                    : `${FLOW_COLORS[packet.color].name}, ${packet.count} кубиков${packet.link ? ", связанная пара" : ""}`
                                }
                              >
                                <FlowCrate
                                  color={packet.color}
                                  count={packet.count}
                                  concealed={packet.mystery}
                                />
                              </span>
                            ))}
                          {remaining.length >
                            (puzzle.version === 4 ? 3 : 4) && (
                            <span className="flow-more-packets">
                              +
                              {remaining.length -
                                (puzzle.version === 4 ? 3 : 4)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flow-game-message" role="status">
                  {message ||
                    (game.stuck ? "Нет свободных слотов. Отмени ход." : "")}
                </div>
              </div>
              <div className="flow-tools">
                <div className="flow-toolbar">
                  <button
                    type="button"
                    data-flow-sound="undo"
                    aria-label="Отмена −20"
                    title="Отмена −20"
                    onClick={() => action({ type: "undo" })}
                    disabled={!game.history.length || busy}
                  >
                    <FlowIcon kind="undo" />
                    <span className="flow-tool-cost" aria-hidden="true">
                      −20
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Все команды"
                    title="Все команды"
                    onClick={() => queueDialog.current?.showModal()}
                  >
                    <FlowIcon kind="queue" />
                  </button>
                  <button
                    type="button"
                    aria-label="Заново"
                    title="Заново"
                    onClick={() => restart.current?.showModal()}
                    disabled={busy}
                  >
                    <FlowIcon kind="restart" />
                  </button>
                </div>
                <p className="flow-score-note">
                  <span aria-hidden="true">★</span> {game.score} / 1000
                </p>
              </div>
            </div>
          )}
          <div className="flow-share-message" role="status">
            {game.won ? message : ""}
          </div>
        </section>
      ) : null}
      {!challenge &&
        ((screen === "home" && mode === "daily") ||
          (screen === "play" &&
            active?.kind === "daily" &&
            game?.won &&
            !busy)) && (
          <section
            className="flow-leaderboard"
            aria-labelledby="flow-board-title"
          >
            <div>
              <h2 id="flow-board-title">Рой дня</h2>
              <p>{dateLabel(day)} · лучший результат каждого игрока</p>
            </div>
            {boardError ? (
              <p>
                Рейтинг пока недоступен.{" "}
                <button
                  type="button"
                  onClick={() => setBoardRevision((v) => v + 1)}
                >
                  Обновить
                </button>
              </p>
            ) : !board ? (
              <p role="status">Загружаем результаты…</p>
            ) : board.entries.length ? (
              <ol>
                {board.entries.map((entry, i) => (
                  <li
                    key={`${entry.place}:${i}`}
                    className={entry.isMe ? "is-me" : ""}
                  >
                    <span>{entry.place}</span>
                    <strong>
                      {entry.nickname}
                      {entry.isMe ? " · ты" : ""}
                    </strong>
                    <b>{entry.score}</b>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="flow-empty-board">
                Сегодня ты можешь стать первым.
              </p>
            )}
            {!signed && (
              <button
                type="button"
                className="flow-login-link"
                onClick={() => loginToPlay("flow")}
              >
                Войти для участия в рейтинге ↗
              </button>
            )}
          </section>
        )}
      <RulesDialog
        className="flow-dialog"
        dialogRef={pause}
        title="Пауза"
        closeLabel="Продолжить игру"
        contentLabel="Настройки игры"
        actionLabel="Продолжить"
      >
        <div className="flow-pause-options">
          <button
            type="button"
            aria-pressed={save.motion}
            onClick={() => {
              setSave((s) => ({ ...s, motion: !s.motion }));
              clearEffects();
            }}
          >
            <FlowIcon kind={save.motion ? "motion" : "still"} /> Анимации{" "}
            <span>{save.motion ? "Вкл" : "Выкл"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              pause.current?.close();
              openRules();
            }}
          >
            Как играть <span>?</span>
          </button>
          <button
            type="button"
            onClick={() => {
              clearEffects();
              pause.current?.close();
              setScreen("home");
              setMessage("");
            }}
          >
            К меню <span>↗</span>
          </button>
        </div>
      </RulesDialog>
      <RulesDialog className="flow-dialog" dialogRef={rules} title="Как играть">
        <div className="flow-rules">
          <div>
            <FlowCrate color={0} count={12} />
            <p>Число на коробке — сколько кубиков заберёт команда.</p>
          </div>
          <div>
            <FlowCrate color={2} count={8} />
            <p>Муравьи забирают свой цвет с открытых краёв картины.</p>
          </div>
          <div>
            <FlowCrate color={1} count={5} />
            <p>
              Закрытый цвет ждёт в слоте. Оставляй место для других коробок.
            </p>
          </div>
        </div>
        {(puzzle?.lanes.some((lane) =>
          lane.some((packet) => packet.mystery || packet.link),
        ) ||
          !!puzzle?.hiddenCells?.length) && (
          <div className="flow-rules flow-rules-special">
            {puzzle?.lanes.some((lane) =>
              lane.some((packet) => packet.mystery),
            ) && (
              <div>
                <FlowCrate color={0} count={0} concealed />
                <p>Цвет откроется, когда коробка дойдёт до начала очереди.</p>
              </div>
            )}
            {puzzle?.lanes.some((lane) =>
              lane.some((packet) => packet.link),
            ) && (
              <div>
                <span className="flow-rule-pair">
                  <FlowCrate color={4} count={25} />
                  <span>↔</span>
                  <FlowCrate color={1} count={20} />
                </span>
                <p>
                  Связанные коробки выходят вместе. Освободи два слота и открой
                  обе.
                </p>
              </div>
            )}
            {!!puzzle?.hiddenCells?.length && (
              <div>
                <span className="flow-rule-hidden" aria-hidden="true">
                  ? ?<br />? ?
                </span>
                <p>Скрытые кубики откроются на краю картины.</p>
              </div>
            )}
          </div>
        )}
        <details className="flow-rule-details">
          <summary>Очки и управление</summary>
          <p>
            Победа — 1000 очков. Отмена −20. ★★★ от 960, ★★ от 800. Время не
            влияет.
          </p>
          <p>
            1–4 — очередь, Z — отмена. Новое испытание дня — в 00:00 по Москве;
            учитывается лучший результат.
          </p>
        </details>
      </RulesDialog>
      <RulesDialog
        className="flow-dialog"
        dialogRef={queueDialog}
        title="Очереди команд"
        actionLabel="Вернуться к игре"
        closeLabel="Закрыть очереди"
        contentLabel="Состав очередей"
      >
        <div className="flow-queue-list">
          {puzzle?.lanes.map((lane, i) => (
            <section key={i}>
              <h3>
                <span className="sr-only">Очередь </span>
                {i + 1}
              </h3>
              <ol>
                {lane.slice(game?.state.lanes[i] ?? 0).map((team, depth) => (
                  <li
                    key={team.id}
                    style={{
                      background:
                        team.mystery && depth > 0
                          ? "#9396a5"
                          : FLOW_COLORS[team.color].hex,
                      color:
                        team.mystery && depth > 0
                          ? "#fffefa"
                          : (FLOW_COLORS[team.color].ink ??
                            FLOW_COLORS[team.color].dark),
                    }}
                  >
                    {team.mystery && depth > 0
                      ? "?"
                      : `${FLOW_COLORS[team.color].symbol} ${team.count}`}
                    {team.link ? ` ↔${team.link.split("-").at(-1)}` : ""}
                    <span className="sr-only">
                      {" "}
                      ·{" "}
                      {team.mystery && depth > 0
                        ? "Скрытая команда"
                        : FLOW_COLORS[team.color].name}
                      {team.link
                        ? `, связанная пара ${team.link.split("-").at(-1)}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ol>
              {lane.length === game?.state.lanes[i] && <p>Все отправлены</p>}
            </section>
          ))}
        </div>
      </RulesDialog>
      <RulesDialog
        className="flow-dialog"
        dialogRef={restart}
        title="Начать заново?"
        actionLabel="Продолжить эту партию"
        closeLabel="Продолжить партию"
        contentLabel="Перезапуск партии"
      >
        <p>
          Текущая конструкция вернётся в начало. Лучшие результаты и открытые
          уровни останутся.
        </p>
        <button
          type="button"
          className="flow-primary"
          onClick={() => {
            restart.current?.close();
            replayAttempt("restart");
          }}
        >
          Начать заново
        </button>
      </RulesDialog>
    </div>
  );
}
