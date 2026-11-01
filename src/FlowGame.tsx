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
import { reachGoal, trackChallengeResult } from "./analytics";
import { FlowAnt, FlowCrate, FlowScene } from "./FlowArt";
import {
  FLOW_COLORS,
  FLOW_VERSION,
  FLOW_LEVELS,
  flowDay,
  flowFrontier,
  flowSolution,
  makeFlowPuzzle,
  replayFlow,
  type FlowAction,
  type FlowEvent,
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
import { flowMotion, flowWorld } from "./flowPresentation";
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
function FlowIcon({
  kind,
}: {
  kind:
    | "motion"
    | "still"
    | "lock"
    | "pause"
    | "undo"
    | "hint"
    | "restart"
    | "queue";
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
      ) : kind === "hint" ? (
        <path d="m12 2 2.8 6.2L22 11l-7.2 2.8L12 21l-2.8-7.2L2 11l7.2-2.8Z" />
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
const chapterNames = ["Первый рейс", "Цветные маршруты", "Мастера потока"];
const dateLabel = (day: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(new Date(`${day}T12:00:00Z`));
const Stars = ({ count }: { count: number }) => (
  <span className="flow-stars" aria-label={`${count} из 3 звёзд`}>
    {[0, 1, 2].map((i) => (
      <span key={i} className={i < count ? "is-earned" : ""} aria-hidden="true">
        ★
      </span>
    ))}
  </span>
);

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
      scope={`challenge:${token}:${scope}`}
      signed={signed}
      challenge={reference}
    />
  );
}

export default function FlowGame() {
  const { user, loading } = useAuth();
  const [challengeToken] = useState(readChallengeToken);
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
            key={user?.id ?? "guest"}
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
    attempt.key === challenge.flow.key;
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
  const [chapter, setChapter] = useState(() =>
    Math.floor((flowUnlocked(save.records) - 1) / 12),
  );
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [hint, setHint] = useState<number | null>(null);
  const [flight, setFlight] = useState<{
    cells: number[];
    events: FlowEvent[];
    teams: { id: number; color: number; left: number }[];
    delivered: Record<number, number>;
  } | null>(null);
  const [previewColor, setPreviewColor] = useState<number | null>(null);
  const [launchGhost, setLaunchGhost] = useState<{
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
  } | null>(null);
  const launchSerial = useRef(0),
    fxTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    gate = useRef(false),
    latestSave = useRef(save);
  const audio = useRef<FlowAudio | null>(null);
  const sound = () => (audio.current ??= new FlowAudio());
  function sceneSound(kind: FlowSound, color = 0, variation = 0, pan = 0) {
    if (
      stage.current &&
      !document.hidden &&
      !document.querySelector("dialog[open]")
    )
      audio.current?.play(kind, color, variation, pan);
  }
  function later(callback: () => void, delay: number) {
    const id = setTimeout(() => {
      fxTimers.current.delete(id);
      callback();
    }, delay);
    fxTimers.current.add(id);
    return id;
  }
  function clearEffects() {
    if (timer.current) clearTimeout(timer.current);
    for (const id of fxTimers.current) clearTimeout(id);
    fxTimers.current.clear();
    audio.current?.cancel();
    gate.current = false;
    setFlight(null);
    setLaunchGhost(null);
    setBusy(false);
  }
  latestSave.current = save;
  const active = save.active;
  const puzzle = useMemo(
    () =>
      active
        ? makeFlowPuzzle(
            active.kind,
            active.kind === "level" ? Number(active.key) : active.key,
          )
        : null,
    [active?.id, active?.kind, active?.key],
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
      if (timer.current) clearTimeout(timer.current);
      gate.current = false;
      for (const id of fxTimers.current) clearTimeout(id);
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
            version: FLOW_VERSION,
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
  function start(kind: "level" | "daily", key: string | number) {
    if (challenge?.flow) {
      kind = challenge.flow.kind;
      key = challenge.flow.key;
    }
    clearEffects();
    setPreviewColor(null);
    sound().wake();
    sound().play("start");
    setHint(null);
    setMessage("");
    const attempt: FlowAttempt = {
      id: crypto.randomUUID(),
      ...(challenge ? { challengeToken: challenge.token } : {}),
      kind,
      key: String(key),
      actions: [],
    };
    setSave((current) => ({ ...current, active: attempt }));
    setMode(kind);
    setScreen("play");
    reachGoal("playne_flow_start", {
      game: "flow",
      mode: kind,
      level: String(key),
    });
  }
  function action(next: FlowAction) {
    if (!active || !puzzle || !game || game.won || gate.current) return;
    if (active.actions.length >= 590) {
      setMessage(
        "Слишком длинная партия. Начни заново — лучший результат останется.",
      );
      return;
    }
    if (
      next.type === "launch" &&
      !puzzle.lanes[next.lane]?.[game.state.lanes[next.lane]]
    )
      return;
    let updated;
    try {
      updated = replayFlow(puzzle, [...active.actions, next]);
    } catch {
      return;
    }
    setHint(null);
    setPreviewColor(null);
    sound().wake();
    setMessage("");
    const attempt = { ...active, actions: [...active.actions, next] };
    setSave((current) => ({
      ...current,
      active: attempt,
      ...(updated.won
        ? {
            records: challenge
              ? current.records
              : mergeFlowRecords(current.records, {
                  [flowRecordKey(active.kind, active.key)]: {
                    score: updated.score,
                    stars: updated.stars,
                  },
                }),
            pending: [
              ...current.pending.filter((p) => p.id !== attempt.id),
              attempt,
            ],
          }
        : {}),
    }));
    const finish = () => {
      setFlight(null);
      setLaunchGhost(null);
      setBusy(false);
      gate.current = false;
      if (updated.won) sceneSound("win");
      else if (updated.stuck) sceneSound("blocked");
    };
    if (next.type === "launch") {
      const team = puzzle.lanes[next.lane][game.state.lanes[next.lane]],
        timing = flowMotion(updated.events, speed, puzzle);
      sound().play("launch", team.color);
      if (animated) {
        gate.current = true;
        setBusy(true);
        const source =
          launchButtons.current[next.lane]?.getBoundingClientRect();
        const target =
          dockElements.current[
            game.state.active.length
          ]?.getBoundingClientRect();
        const surface = stage.current?.getBoundingClientRect();
        if (source && target && surface)
          setLaunchGhost({
            id: ++launchSerial.current,
            color: team.color,
            count: team.count,
            x: source.left - surface.left,
            y: source.top - surface.top,
            dx: target.left - source.left,
            dy: target.top - source.top,
            width: source.width,
            scale: target.width / source.width,
            duration: timing.launch,
          });
        setFlight({
          cells: game.state.cells,
          events: updated.events,
          teams: [...game.state.active, { ...team, left: team.count }],
          delivered: {},
        });
        for (const cue of flowSoundscape(timing, speed))
          later(
            () => sceneSound(cue.kind, cue.color, cue.variation, cue.pan),
            cue.at,
          );
        const lastByTeam = new Map<number, number>();
        timing.deliveries.forEach((event) => {
          lastByTeam.set(
            event.packet,
            Math.max(lastByTeam.get(event.packet) ?? 0, event.at),
          );
          later(() => {
            setFlight((current) =>
              current
                ? {
                    ...current,
                    delivered: {
                      ...current.delivered,
                      [event.packet]:
                        (current.delivered[event.packet] ?? 0) + 1,
                    },
                  }
                : null,
            );
          }, event.at);
        });
        const teams = [...game.state.active, { ...team, left: team.count }];
        for (const old of teams) {
          const deliveredAt = lastByTeam.get(old.id);
          if (
            deliveredAt !== undefined &&
            !updated.state.active.some((t) => t.id === old.id)
          )
            later(() => sceneSound("dock", old.color), deliveredAt + 15);
        }
        timer.current = later(finish, timing.finish);
      } else {
        if (updated.events.length) sound().play("collect", team.color);
        finish();
      }
    } else if (next.type === "undo") sound().play("undo");
    else if (next.type === "hint") sound().play("hint");
    if (updated.won)
      reachGoal("playne_flow_complete", {
        game: "flow",
        mode: active.kind,
        level: active.key,
        score: updated.score,
        hints: updated.hints,
        undos: updated.undos,
      });
    else if (updated.stuck) setMessage("Нет свободных слотов. Отмени ход.");
  }
  function showHint() {
    if (!puzzle || !game || busy || game.won) return;
    const path = flowSolution(puzzle, game.state);
    if (!path?.length) {
      setMessage("Из этой позиции путь не найден. Отмени последний запуск.");
      return;
    }
    action({ type: "hint" });
    setHint(path[0]);
    setMessage(`Очередь ${path[0] + 1} подсвечена.`);
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
      if (["h", "р"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        showHint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const resume = !!active && !game?.won;
  const dockTeams = (flight?.teams ?? game?.state.active ?? []).map((team) => ({
    ...team,
    left: Math.max(0, team.left - (flight?.delivered[team.id] ?? 0)),
  }));
  const visualCollected = game
    ? game.state.collected -
      (flight?.events.length ?? 0) +
      Object.values(flight?.delivered ?? {}).reduce((a, b) => a + b, 0)
    : 0;
  const highlightedColor =
    hint !== null && puzzle && game
      ? puzzle.lanes[hint][game.state.lanes[hint]]?.color
      : previewColor;
  const progress =
    game && puzzle
      ? Math.round(
          (visualCollected / puzzle.cells.filter((c) => c >= 0).length) * 100,
        )
      : 0;

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
            onClick={() => rules.current?.showModal()}
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
              if (active?.challengeToken === challenge.token) setScreen("play");
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
                    if (resume && active?.kind === "level") setScreen("play");
                    else start("level", unlocked);
                  }}
                >
                  {resume && active?.kind === "level"
                    ? `Продолжить уровень ${active.key}`
                    : `Начать уровень ${unlocked}`}{" "}
                  <span aria-hidden="true">▶</span>
                </button>
                <div className="flow-selection-heading">
                  <h2 id="flow-selection-title">{chapterNames[chapter]}</h2>
                  <span className="flow-star-total">
                    ★ {totalStars}
                    <small> / 108</small>
                  </span>
                </div>
                <div className="flow-chapters" role="group" aria-label="Главы">
                  {chapterNames.map((name, i) => (
                    <button
                      type="button"
                      key={name}
                      aria-pressed={chapter === i}
                      onClick={() => setChapter(i)}
                      aria-label={`Глава ${i + 1}. ${name}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <div className="flow-level-grid">
                  {Array.from(
                    { length: 12 },
                    (_, i) => chapter * 12 + i + 1,
                  ).map((level) => {
                    const record = save.records[`level:${level}`];
                    return (
                      <button
                        type="button"
                        key={level}
                        className={`flow-level${level === unlocked ? " is-next" : ""}${record ? " is-done" : ""}`}
                        disabled={level > unlocked}
                        onClick={() => start("level", level)}
                        aria-label={`Уровень ${level}${level > unlocked ? ". Сначала пройди предыдущий" : record ? `. ${record.stars} из 3 звёзд` : ". Играть"}`}
                      >
                        <strong>
                          {level > unlocked ? (
                            <span className="flow-lock">
                              <FlowIcon kind="lock" />
                            </span>
                          ) : (
                            level
                          )}
                        </strong>
                        <Stars count={record?.stars ?? 0} />
                      </button>
                    );
                  })}
                </div>
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
                      setScreen("play");
                    else start("daily", day);
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
          style={worldStyle}
          ref={stage}
          aria-label="Игровая площадка Рой"
        >
          {game.won && !busy && animated && <FlowCelebration />}
          {launchGhost && (
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
          )}
          <div className="flow-play-top">
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
              disabled={busy || !animated}
              aria-label={
                speed === 1
                  ? "Ускорить анимации вдвое"
                  : "Обычная скорость анимаций"
              }
              aria-pressed={speed === 2}
              onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
            >
              » {speed}×
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
                  flight
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
                events={flight?.events}
                moving={!!flight && animated}
              />
              {game.won && !busy && (
                <div className="flow-victory-stamp" aria-hidden="true">
                  ✓
                </div>
              )}
            </div>
            {!game.won || busy ? (
              <>
                <div
                  className={`flow-docks${game.stuck && !busy ? " is-full" : ""}`}
                  role="group"
                  aria-label={`Доки: ${puzzle.slots - dockTeams.length} свободно из ${puzzle.slots}`}
                  style={{
                    gridTemplateColumns: `repeat(${puzzle.slots}, 1fr)`,
                  }}
                >
                  {Array.from({ length: puzzle.slots }, (_, i) => {
                    const team = dockTeams[i];
                    return (
                      <div
                        className={`flow-dock${team ? " is-waiting" : ""}${flight?.teams[i] ? " is-working" : ""}${team?.left === 0 ? " is-delivered" : ""}${launchGhost && i === (flight?.teams.length ?? 0) - 1 ? " is-launching" : ""}`}
                        key={i}
                        ref={(element) => {
                          dockElements.current[i] = element;
                        }}
                        aria-label={
                          team
                            ? `${FLOW_COLORS[team.color].name} команда: осталось ${team.left}`
                            : "Свободный док"
                        }
                      >
                        <span className="flow-dock-hole" aria-hidden="true" />
                        {team && (
                          <FlowCrate color={team.color} count={team.left} />
                        )}
                        {team && !flight && (
                          <span className="flow-wait-dots" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
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
                    onClick={() => start("level", Number(active.key) + 1)}
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
                      version: FLOW_VERSION,
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
                <button
                  type="button"
                  onClick={() => start(active.kind, active.key)}
                >
                  Переиграть
                </button>
                {!signed && (
                  <button type="button" onClick={() => loginToPlay("flow")}>
                    Сохранить в аккаунте
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2 className="sr-only">Очереди команд</h2>
              <div className="flow-supply">
                {puzzle.lanes.map((lane, i) => {
                  const remaining = lane.slice(game.state.lanes[i]),
                    team = remaining[0],
                    paint = team ? FLOW_COLORS[team.color] : null;
                  const accessible =
                    team &&
                    flowFrontier(puzzle, game.state.cells).some(
                      (cell) => game.state.cells[cell] === team.color,
                    );
                  return (
                    <div className="flow-lane" key={i}>
                      <button
                        type="button"
                        className={`flow-launch${hint === i ? " is-hinted" : ""}${!accessible ? " needs-opening" : ""}`}

                        disabled={
                          !team ||
                          busy ||
                          game.state.active.length >= puzzle.slots
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
                            ? `Очередь ${i + 1}: ${paint!.name} команда ${paint!.symbol}, ${team.count} кубиков. ${accessible ? "Цвет доступен" : "Пока нет доступных кубиков этого цвета"}. Запустить`
                            : `Очередь ${i + 1} пуста`
                        }
                      >
                        {team ? (
                          <span
                            className="flow-promoted-crate"
                            key={`${active.id}:${team.id}`}
                          >
                            <FlowCrate color={team.color} count={team.count} />
                          </span>
                        ) : (
                          <span className="flow-lane-done" aria-hidden="true">
                            ✓
                          </span>
                        )}
                        {hint === i && (
                          <span className="flow-hint-arrow" aria-hidden="true">
                            ↓
                          </span>
                        )}
                      </button>
                      <div
                        className="flow-next-packets"
                        key={`queue:${i}:${game.state.lanes[i]}`}
                        aria-label={`Дальше в очереди ${i + 1}`}
                      >
                        {remaining.slice(1, 4).map((packet) => (
                          <span
                            key={packet.id}
                            aria-label={`${FLOW_COLORS[packet.color].name}, ${packet.count} кубиков`}
                          >
                            <FlowCrate
                              color={packet.color}
                              count={packet.count}
                            />
                          </span>
                        ))}
                        {remaining.length > 4 && (
                          <span className="flow-more-packets">
                            +{remaining.length - 4}
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
                  data-flow-sound="hint"
                  aria-label="Подсказка −100"
                  title="Подсказка −100"
                  onClick={showHint}
                  disabled={busy}
                >
                  <FlowIcon kind="hint" />
                  <span className="flow-tool-cost" aria-hidden="true">
                    −100
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
            </>
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
              if (busy) {
                clearEffects();
                if (game?.won) sceneSound("win");
              }
            }}
          >
            <FlowIcon kind={save.motion ? "motion" : "still"} /> Анимации{" "}
            <span>{save.motion ? "Вкл" : "Выкл"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              pause.current?.close();
              rules.current?.showModal();
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
            <p>Нажми на переднюю коробку. Число — её груз.</p>
          </div>
          <div>
            <FlowCrate color={2} count={8} />
            <p>Муравьи забирают нижние кубики своего цвета.</p>
          </div>
          <div>
            <FlowCrate color={1} count={5} />
            <p>
              Закрытый цвет ждёт в слоте. Оставляй место для других коробок.
            </p>
          </div>
        </div>
        <details className="flow-rule-details">
          <summary>Очки и управление</summary>
          <p>
            Победа — 1000 очков. Подсказка −100, отмена −20. ★★★ от 960, ★★ от
            800. Время не влияет.
          </p>
          <p>
            1–4 — очередь, Z — отмена, H — подсказка. Новое испытание дня — в
            00:00 по Москве; учитывается лучший результат.
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
                {lane.slice(game?.state.lanes[i] ?? 0).map((team) => (
                  <li
                    key={team.id}
                    style={{
                      background: FLOW_COLORS[team.color].hex,
                      color: FLOW_COLORS[team.color].dark,
                    }}
                  >
                    {FLOW_COLORS[team.color].symbol} {team.count}
                    <span className="sr-only">
                      {" "}
                      · {FLOW_COLORS[team.color].name}
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
            if (active) start(active.kind, active.key);
          }}
        >
          Начать заново
        </button>
      </RulesDialog>
    </div>
  );
}
