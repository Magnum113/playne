import { RoundDots } from "./ui";
import {
  AccountNav,
  useRankedRun,
  SaveResult,
  RankedSyncError,
} from "./account";
import { useEffect, useRef, useState } from "react";
import { GameHeader } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import GeoPreview from "./GeoPreview";
import GeoAbout from "./GeoAbout";
import { GEO_GOALS, reachGoal } from "./analytics";
import {
  distanceKm,
  geoBounds,
  geoDistance,
  geoScore,
  GEO_ROUND_POINTS,
  GEO_MAX_POINTS,
  GEO_TIME_LIMIT_MS,
  geoModeName,
  geoCanMove,
  geoIsLandmarks,
  geoBearing,
  geoPanoramaFits,
  geoIsTimed,
  geoModeFor,
  validGeoMode,
  geoRemaining,
  geoClock,
  geoPoints,
  type GeoMode,
  readGeoStats,
  saveGeoStats,
  type GeoAnswer,
  type GeoPoint,
} from "./geo";
import { type GeoLocation } from "./geoLocations";
import {
  findPanorama,
  hasStreetViewLinks,
  loadGoogleMaps,
  onMapsAuthFailure,
} from "./googleMaps";
import "./geo.css";

type Phase =
  | "welcome"
  | "loading"
  | "guessing"
  | "checking"
  | "reveal"
  | "finished"
  | "error";
function Rules({ landmarks = false }: { landmarks?: boolean }) {
  return (
    <div className="geo-rules-copy">
      <p>
        {landmarks
          ? "Узнай достопримечательность и найди её на карте мира."
          : "Ты в незнакомом месте. Осмотрись и найди его на карте мира."}
      </p>
      <ol>
        <li>
          Вращай панораму мышью или пальцем.{" "}
          {landmarks
            ? "Можно приближать детали. Переходы по улицам отключены."
            : "В режиме «С перемещением» можно идти по улице по стрелкам или нажатием на дорогу."}
        </li>
        <li>
          Открой карту, приблизь нужный участок и поставь точку. До ответа её
          можно передвигать.
        </li>
        <li>Нажми «Ответить». Увидишь правильное место, расстояние и очки.</li>
      </ol>
      <p>
        Пять раундов, до 500 очков. За попадание в пределах 250 метров — 100
        очков. Дальше оценка плавно уменьшается с расстоянием. Выбери режим без
        таймера или три минуты на раунд. Когда время закончится, примем
        последнюю выбранную точку; без точки — ноль очков.
      </p>
      <p>
        {landmarks
          ? "Поставь точку на самой достопримечательности — положение камеры не влияет на очки."
          : "Найди на карте место, откуда начался раунд. Кнопка «На старт» возвращает к начальной панораме и не сбрасывает таймер. Ищи подсказки в языке вывесок, архитектуре, растениях и разметке."}{" "}
        Рекорд сохраняется в этом браузере.
      </p>
    </div>
  );
}

export default function GeoGame() {
  const ranked = useRankedRun("geo");
  const [mode, setMode] = useState<GeoMode>(() => {
    const value =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("mode")
        : null;
    return validGeoMode(value) ? value : "classic";
  });
  const modeRef = useRef<GeoMode>(mode);
  const [deadline, setDeadline] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(GEO_TIME_LIMIT_MS / 1000);
  const timeoutAction = useRef<() => void>(() => {});
  const [phase, setPhaseState] = useState<Phase>("welcome");
  const phaseRef = useRef<Phase>("welcome");
  const setPhase = (value: Phase) => {
    phaseRef.current = value;
    setPhaseState(value);
  };
  const [stats, setStats] = useState(() => readGeoStats(mode));
  const statsRef = useRef(stats);
  const [round, setRound] = useState(0);
  const rounds = useRef<GeoLocation[]>([]);
  const [answers, setAnswers] = useState<GeoAnswer[]>([]);
  const answersRef = useRef<GeoAnswer[]>([]);
  const [guess, setGuess] = useState<GeoPoint | null>(null);
  const guessRef = useRef<GeoPoint | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [error, setError] = useState("");
  const panoNode = useRef<HTMLDivElement>(null),
    mapNode = useRef<HTMLDivElement>(null);
  const panorama = useRef<google.maps.StreetViewPanorama | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const guessMarker = useRef<google.maps.Marker | null>(null),
    actualMarker = useRef<google.maps.Marker | null>(null);
  const line = useRef<google.maps.Polyline | null>(null);
  const actual = useRef<GeoPoint | null>(null);
  const activePlace = useRef<GeoLocation | null>(null);
  const allowedPano = useRef("");
  const startHeading = useRef(0);
  const busy = useRef(false),
    operation = useRef(0);
  const cancelWait = useRef<(() => void) | null>(null);
  const badPlaces = useRef(new Set<string>());
  const rules = useRef<HTMLDialogElement>(null),
    result = useRef<HTMLElement>(null);
  const mapExpand = useRef<HTMLButtonElement>(null),
    mapClose = useRef<HTMLButtonElement>(null),
    mapToggle = useRef<HTMLButtonElement>(null);
  const total =
    Math.round(answers.reduce((sum, answer) => sum + answer.score, 0) * 10) /
    10;
  const answer = answers[round];

  function choosePoint(point: GeoPoint) {
    if (phaseRef.current !== "guessing" || !map.current) return;
    if (
      geoIsTimed(modeRef.current) &&
      deadlineRef.current !== null &&
      Date.now() >= deadlineRef.current
    ) {
      void submit(true);
      return;
    }
    if (geoIsTimed(modeRef.current)) ranked.geoPin(round, point);
    guessRef.current = point;
    setGuess(point);
    setError("");
    guessMarker.current?.setPosition(point);
    guessMarker.current?.setMap(map.current);
  }
  timeoutAction.current = () => void submit(true);
  useEffect(() => {
    if (phase !== "guessing" || !geoIsTimed(mode) || deadline === null) return;
    const tick = () => {
      const left = geoRemaining(deadline);
      setRemaining(left);
      if (left === 0 && phaseRef.current === "guessing")
        timeoutAction.current();
    };
    tick();
    const timer = window.setInterval(tick, 200);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [phase, mode, deadline]);
  function chooseMode(value: GeoMode) {
    setMode(value);
    modeRef.current = value;
    const stored = readGeoStats(value);
    statsRef.current = stored;
    setStats(stored);
  }
  useEffect(
    () =>
      onMapsAuthFailure(() => {
        operation.current++;
        cancelWait.current?.();
        busy.current = false;
        setError(
          "Не удалось подключиться к карте. Попробуй ещё раз чуть позже.",
        );
        setPhase("error");
      }),
    [],
  );
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          !panorama.current ||
          !panoNode.current?.clientWidth ||
          !panoNode.current.clientHeight
        )
          return;
        google.maps.event.trigger(panorama.current, "resize");
        // A hidden/zero-size viewport can make Google's zoom non-finite.
        panorama.current.setZoom(0);
      });
    });
    if (panoNode.current) observer.observe(panoNode.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const view = map.current;
        if (
          !view ||
          !mapNode.current?.clientWidth ||
          !mapNode.current.clientHeight
        )
          return;
        const center = view.getCenter();
        google.maps.event.trigger(view, "resize");
        const revealed = answersRef.current[round];
        if (
          phaseRef.current === "reveal" &&
          revealed?.guess &&
          revealed.distance !== null &&
          revealed.distance >= 0.01
        )
          view.fitBounds(geoBounds(revealed.guess, revealed.actual), 55);
        else if (center) view.setCenter(center);
      });
    });
    if (mapNode.current) observer.observe(mapNode.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [round]);
  function closeMap() {
    setMapOpen(false);
    const control = window.matchMedia(
      "(max-width: 750px), (max-width: 1000px) and (max-height: 520px)",
    ).matches
      ? mapToggle.current
      : mapExpand.current;
    control?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!mapOpen || phase !== "guessing") return;
    const frame = requestAnimationFrame(() => {
      const control = window.matchMedia(
        "(max-width: 750px), (max-width: 1000px) and (max-height: 520px)",
      ).matches
        ? mapClose.current
        : mapExpand.current;
      control?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [mapOpen, phase]);
  useEffect(() => {
    if (phase === "reveal" || phase === "finished" || phase === "error")
      result.current?.focus({ preventScroll: true });
  }, [phase]);
  useEffect(
    () => () => {
      operation.current++;
      cancelWait.current?.();
      if (panorama.current)
        google.maps.event.clearInstanceListeners(panorama.current);
      if (map.current) google.maps.event.clearInstanceListeners(map.current);
    },
    [],
  );

  function ensureViews() {
    if (map.current && panorama.current) return;
    map.current = new google.maps.Map(mapNode.current!, {
      center: { lat: 20, lng: 0 },
      zoom: 2,
      minZoom: 1,
      maxZoom: 18,
      streetViewControl: false,
      zoomControl: true,
      cameraControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
    });
    panorama.current = new google.maps.StreetViewPanorama(panoNode.current!, {
      visible: true,
      pov: { heading: 0, pitch: 0 },
      zoom: 0,
      addressControl: false,
      linksControl: false,
      clickToGo: false,
      showRoadLabels: false,
      enableCloseButton: false,
      fullscreenControl: true,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
      panControlOptions: { position: google.maps.ControlPosition.LEFT_BOTTOM },
      motionTracking: false,
      motionTrackingControl: false,
    });
    panorama.current.addListener("pano_changed", () => {
      const view = panorama.current;
      if (
        view &&
        allowedPano.current &&
        view.getPano() !== allowedPano.current &&
        (!geoCanMove(modeRef.current) || phaseRef.current !== "guessing")
      )
        view.setPano(allowedPano.current);
    });
    panorama.current.addListener("zoom_changed", () => {
      const view = panorama.current;
      if (view && !Number.isFinite(view.getZoom())) view.setZoom(0);
    });
    map.current.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (event.latLng) choosePoint(event.latLng.toJSON());
    });
    guessMarker.current = new google.maps.Marker({
      title: "Твой ответ",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: "#a188e3",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
      zIndex: 2,
    });
    actualMarker.current = new google.maps.Marker({
      title: "Правильное место",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#147b69",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
      zIndex: 3,
    });
  }
  function showPanorama(pano: string, heading: number, pitch = 0, zoom = 0) {
    return new Promise<void>((resolve, reject) => {
      const view = panorama.current!;
      let settled = false;
      const timer = setTimeout(
        () => finish(new Error("Panorama unavailable")),
        15_000,
      );
      const listener = view.addListener("status_changed", () => {
        if (view.getPano() !== pano) return;
        if (view.getStatus() === google.maps.StreetViewStatus.OK) finish();
        else finish(new Error("Panorama unavailable"));
      });
      function finish(reason?: Error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        listener.remove();
        cancelWait.current = null;
        if (reason) reject(reason);
        else {
          view.setPov({ heading, pitch });
          view.setZoom(zoom);
          resolve();
        }
      }
      cancelWait.current = () => finish(new Error("Cancelled"));
      const alreadyLoaded =
        view.getPano() === pano &&
        view.getStatus() === google.maps.StreetViewStatus.OK;
      allowedPano.current = pano;
      view.setPov({ heading, pitch });
      view.setZoom(zoom);
      view.setPano(pano);
      // Reusing an already-loaded panorama may not emit another status event.
      if (alreadyLoaded) finish();
    });
  }
  async function loadRound(index: number) {
    if (busy.current) return;
    busy.current = true;
    const token = ++operation.current;
    setPhase("loading");
    panorama.current?.setOptions({ linksControl: false, clickToGo: false });
    setMapOpen(false);
    setGuess(null);
    guessRef.current = null;
    setError("");
    setRound(index);
    deadlineRef.current = null;
    setDeadline(null);
    setRemaining(GEO_TIME_LIMIT_MS / 1000);
    guessMarker.current?.setMap(null);
    actualMarker.current?.setMap(null);
    line.current?.setMap(null);
    try {
      await loadGoogleMaps();
      if (token !== operation.current) return;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      ensureViews();
      map.current!.setCenter({ lat: 20, lng: 0 });
      map.current!.setZoom(2);
      let place = rounds.current[index];
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const response = await findPanorama(place);
          if (token !== operation.current) return;
          const data = response.data;
          if (!data.location?.latLng || !data.location.pano)
            throw new Error("No panorama");
          if (!geoPanoramaFits(place, data.location.latLng.toJSON()))
            throw new Error("Panorama is outside the search area");
          if (
            geoCanMove(modeRef.current) &&
            !hasStreetViewLinks(data.links, data.location.pano)
          )
            throw new Error("Panorama has no navigation links");
          const verifiedActual = await ranked.panorama(
            index,
            data.location.pano,
          );
          const heading =
            place.heading ??
            (geoIsLandmarks(modeRef.current)
              ? geoBearing(data.location.latLng.toJSON(), place)
              : (data.tiles?.centerHeading ?? 0));
          await showPanorama(
            data.location.pano,
            heading,
            place.pitch ?? 0,
            place.zoom ?? 0,
          );
          startHeading.current = heading;
          if (token !== operation.current) return;
          actual.current = geoIsLandmarks(modeRef.current)
            ? { lat: place.lat, lng: place.lng }
            : (verifiedActual ?? data.location.latLng.toJSON());
          activePlace.current = place;
          rounds.current[index] = place;
          if (geoIsTimed(modeRef.current)) {
            const started = await ranked.geoReady(index);
            if (token !== operation.current) return;
            deadlineRef.current = started ?? Date.now() + GEO_TIME_LIMIT_MS;
            setDeadline(deadlineRef.current);
            setRemaining(geoRemaining(deadlineRef.current));
          }
          setPhase("guessing");
          panorama.current!.setOptions({
            linksControl: geoCanMove(modeRef.current),
            clickToGo: geoCanMove(modeRef.current),
          });
          busy.current = false;
          return;
        } catch (e) {
          if (token !== operation.current) return;
          if (e instanceof RankedSyncError) throw e;
          badPlaces.current.add(place.id);
          const onlineReplacement = await ranked.replaceGeo(index);
          if (onlineReplacement) {
            place = onlineReplacement;
            rounds.current[index] = place;
            continue;
          }
          throw new Error("No replacement available");
        }
      }
      throw new Error("No panorama");
    } catch {
      if (token !== operation.current) return;
      setError(
        "Панорама не загрузилась. Проверь соединение и попробуй ещё раз — раунд не потеряется.",
      );
      setPhase("error");
      reachGoal(GEO_GOALS.loadError, { round: index + 1 });
    } finally {
      if (token === operation.current) busy.current = false;
    }
  }
  async function start(replay = false) {
    if (busy.current) return;
    if (ranked.state.status === "loading") return;
    busy.current = true;
    modeRef.current = mode;
    const token = ++operation.current;
    const online = await ranked.begin(mode);
    if (token !== operation.current) return;
    busy.current = false;
    if (!online) {
      setError(
        "Не удалось загрузить партию. Проверь соединение и попробуй ещё раз.",
      );
      return;
    }
    rounds.current = online.challenge.places;
    answersRef.current = [];
    setAnswers([]);
    reachGoal(replay ? GEO_GOALS.gameRestart : GEO_GOALS.gameStart, { mode });
    void loadRound(0);
  }
  async function submit(expired = false) {
    if (phaseRef.current !== "guessing") return;
    const timedOut =
      geoIsTimed(modeRef.current) &&
      (expired ||
        (deadlineRef.current !== null && Date.now() >= deadlineRef.current));
    if (!guessRef.current && !timedOut) {
      setMapOpen(true);
      mapNode.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
      setError("Сначала поставь точку на карте.");
      return;
    }
    if (!actual.current || !activePlace.current) return;
    const token = operation.current;
    const selected = guessRef.current;
    const place = activePlace.current;
    const correct = actual.current;
    setPhase("checking");
    panorama.current?.setOptions({ linksControl: false, clickToGo: false });
    if (timedOut) rules.current?.close();
    const verified = await ranked.geoAnswer(round, selected, timedOut);
    if (token !== operation.current) return;
    const distance = selected ? distanceKm(selected, correct) : null;
    const result: GeoAnswer = {
      location: place,
      guess: selected,
      actual: correct,
      distance,
      score: distance === null ? 0 : geoScore(distance),
      timedOut,
      ...verified,
    };
    answersRef.current = [...answersRef.current, result];
    setAnswers(answersRef.current);
    setPhase("reveal");
    setMapOpen(true);
    setError("");
    actualMarker.current!.setPosition(result.actual);
    actualMarker.current!.setMap(map.current);
    if (result.guess) {
      guessMarker.current!.setPosition(result.guess);
      guessMarker.current!.setMap(map.current);
      line.current = new google.maps.Polyline({
        map: map.current,
        path: [result.guess, result.actual],
        geodesic: true,
        strokeColor: "#a188e3",
        strokeWeight: 3,
        strokeOpacity: 0.8,
      });
      if (result.distance !== null && result.distance < 0.01) {
        map.current!.setCenter(result.actual);
        map.current!.setZoom(15);
      } else map.current!.fitBounds(geoBounds(result.guess, result.actual), 55);
    } else {
      guessMarker.current?.setMap(null);
      map.current!.setCenter(result.actual);
      map.current!.setZoom(12);
    }
    reachGoal(GEO_GOALS.roundComplete, {
      round: round + 1,
      score: result.score,
      distance_km: result.distance === null ? -1 : Math.round(result.distance),
      mode: modeRef.current,
      timed_out: !!result.timedOut,
      country: result.location.countryCode,
    });
    if (result.score === GEO_ROUND_POINTS)
      reachGoal(GEO_GOALS.perfectRound, { round: round + 1 });
    if (answersRef.current.length === 5) {
      const score =
        Math.round(
          answersRef.current.reduce((sum, item) => sum + item.score, 0) * 10,
        ) / 10;
      const nextStats = {
        best: Math.max(statsRef.current.best, score),
        played: statsRef.current.played + 1,
        recent: [
          ...statsRef.current.recent,
          ...answersRef.current.map((item) => item.location.id),
        ].slice(-30),
      };
      statsRef.current = nextStats;
      setStats(nextStats);
      saveGeoStats(nextStats, modeRef.current);
      reachGoal(GEO_GOALS.gameComplete, { score, mode: modeRef.current });
    }
  }
  function next() {
    if (phaseRef.current !== "reveal") return;
    if (round === 4) setPhase("finished");
    else void loadRound(round + 1);
  }
  const active = phase !== "welcome" && phase !== "finished";
  return (
    <div className={`app geo-app ${active ? "geo-playing" : ""}`}>
      <a className="skip-link" href="#geo-main">
        Перейти к игре
      </a>
      <GameHeader>
        {active && (
          <button
            className="help-button geo-playing-help"
            aria-label="Как играть"
            onClick={() => {
              rules.current?.showModal();
              reachGoal(GEO_GOALS.rulesOpen);
            }}
          >
            <span className="question" aria-hidden="true">
              ?
            </span>
          </button>
        )}
      </GameHeader>
      <main id="geo-main" className="geo-main">
        {active && <h1 className="sr-only">Где я?</h1>}
        <div className="geo-heading">
          <div>
            <p className="eyebrow">УГАДАЙ МЕСТО</p>
            <h1>
              Где я<span className="brand-dot">?</span>
            </h1>
          </div>
          <button
            className="help-button"
            onClick={() => {
              rules.current?.showModal();
              reachGoal(GEO_GOALS.rulesOpen);
            }}
          >
            Как играть{" "}
            <span className="question" aria-hidden="true">
              ?
            </span>
          </button>
        </div>
        {phase === "welcome" && (
          <section className="geo-welcome">
            <div className="geo-welcome-copy">
              <p className="eyebrow">ПЯТЬ РАУНДОВ · 500 ОЧКОВ</p>
              <h2>
                {geoIsLandmarks(mode)
                  ? "Узнай и найди на карте."
                  : "Угадай страну по панораме."}
              </h2>
              <p>
                {geoIsLandmarks(mode)
                  ? "Храмы, памятники и необычные места со всего мира. Найди на карте достопримечательность, которую видишь на панораме."
                  : "Узнай страну и город по панораме Google Street View. Поставь точку на карте: чем ближе к месту, тем больше очков."}
              </p>
              <ol>
                <li>Вращай панораму и замечай детали.</li>
                <li>Поставь точку на карте мира.</li>
                <li>Проверь ответ и узнай, где оказался.</li>
              </ol>
              <fieldset className="geo-mode-choice">
                <legend>Места</legend>
                {([false, true] as const).map((landmarks) => (
                  <label
                    key={String(landmarks)}
                    className={
                      geoIsLandmarks(mode) === landmarks ? "selected" : ""
                    }
                  >
                    <input
                      type="radio"
                      name="geo-collection"
                      checked={geoIsLandmarks(mode) === landmarks}
                      disabled={ranked.state.status === "loading"}
                      onChange={() =>
                        chooseMode(
                          geoModeFor(
                            geoCanMove(mode),
                            geoIsTimed(mode),
                            landmarks,
                          ),
                        )
                      }
                    />
                    <span>
                      <strong>
                        {landmarks ? "Достопримечательности" : "Весь мир"}
                      </strong>
                      <small>
                        {landmarks
                          ? "Узнай памятники, храмы и чудеса природы"
                          : "Города, дороги и пейзажи"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {!geoIsLandmarks(mode) && (
                <fieldset className="geo-mode-choice">
                  <legend>Перемещение</legend>
                  {([false, true] as const).map((moving) => (
                    <label
                      key={String(moving)}
                      className={geoCanMove(mode) === moving ? "selected" : ""}
                    >
                      <input
                        type="radio"
                        name="geo-movement"
                        checked={geoCanMove(mode) === moving}
                        disabled={ranked.state.status === "loading"}
                        onChange={() =>
                          chooseMode(geoModeFor(moving, geoIsTimed(mode)))
                        }
                      />
                      <span>
                        <strong>
                          {moving ? "С перемещением" : "Без перемещения"}
                        </strong>
                        <small>
                          {moving
                            ? "Пройди по улице и найди подсказки"
                            : "Осмотрись из одной точки"}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              <fieldset className="geo-mode-choice">
                <legend>Время</legend>
                {([false, true] as const).map((timed) => (
                  <label
                    key={String(timed)}
                    className={geoIsTimed(mode) === timed ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="geo-time"
                      checked={geoIsTimed(mode) === timed}
                      disabled={ranked.state.status === "loading"}
                      onChange={() =>
                        chooseMode(
                          geoModeFor(
                            geoCanMove(mode),
                            timed,
                            geoIsLandmarks(mode),
                          ),
                        )
                      }
                    />
                    <span>
                      <strong>{timed ? "На время" : "Без таймера"}</strong>
                      <small>
                        {timed
                          ? "3 минуты на каждый раунд"
                          : "Осматривайся в своём темпе"}
                      </small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                className="primary"
                disabled={ranked.state.status === "loading"}
                onClick={() => void start()}
              >
                Начать игру <span aria-hidden="true">↗</span>
              </button>
              {error && <p role="status">{error}</p>}
              <small>
                Бесплатно и без регистрации. У каждого режима свой рейтинг.
              </small>
              {stats.best > 0 && (
                <p className="geo-best">
                  Твой рекорд: <strong>{geoPoints(stats.best)} / 500</strong>
                </p>
              )}
            </div>
            <div className="geo-welcome-art">
              <GeoPreview />
              <span>
                {geoIsLandmarks(mode)
                  ? "Памятники, храмы и чудеса природы."
                  : "Города, побережья, горы и дороги."}
              </span>
            </div>
          </section>
        )}
        {active && (
          <div className="geo-status">
            <div className="geo-status-round">
              <span className="eyebrow">РАУНД {round + 1} ИЗ 5</span>
              <RoundDots
                current={round}
                completed={answers.length}
                className="geo-dots"
              />
            </div>
            <div className="geo-status-meta">
              <span className="geo-mode-label">{geoModeName(mode)}</span>
              {geoIsTimed(mode) && (
                <span
                  className={`geo-timer ${remaining <= 15 ? "geo-timer-urgent" : ""}`}
                  role="timer"
                  aria-label={`Осталось ${remaining} секунд`}
                  aria-live="off"
                >
                  {geoClock(remaining)}
                </span>
              )}
              <span
                className="geo-score"
                aria-label={`Очки: ${geoPoints(total)} из 500`}
              >
                <span className="geo-score-label">Очки</span>
                <strong>{geoPoints(total)}</strong>
                <span className="geo-score-max">/ 500</span>
              </span>
            </div>
          </div>
        )}
        <div
          className={`geo-stage ${active ? "" : "geo-stage-hidden"} ${mapOpen ? "geo-map-open" : ""} ${phase === "reveal" ? "geo-revealed" : ""}`}
          inert={!active}
        >
          <div
            className="geo-panorama"
            ref={panoNode}
            inert={
              mapOpen ||
              phase === "loading" ||
              phase === "error" ||
              phase === "checking"
            }
            aria-label="Панорама: осмотрись и угадай место"
          />
          {phase === "guessing" && geoCanMove(mode) && (
            <button
              className="geo-return-start"
              onClick={() => {
                const view = panorama.current;
                if (!view || !allowedPano.current) return;
                view.setPano(allowedPano.current);
                view.setPov({
                  heading: startHeading.current,
                  pitch: activePlace.current?.pitch ?? 0,
                });
                view.setZoom(activePlace.current?.zoom ?? 0);
              }}
              aria-label="На старт — вернуться к начальной панораме"
            >
              ↶ На старт
            </button>
          )}
          <section
            className="geo-map-panel"
            onKeyDown={(event) => {
              if (event.key === "Escape" && mapOpen && phase === "guessing") {
                event.stopPropagation();
                closeMap();
              }
            }}
            inert={
              phase === "loading" || phase === "error" || phase === "checking"
            }
            aria-label="Карта для ответа"
          >
            <div className="geo-map-heading">
              <h2>
                {phase === "reveal"
                  ? answer?.guess
                    ? "Сравни точки"
                    : "Правильное место"
                  : "Где это?"}
              </h2>
              {phase !== "reveal" && (
                <button
                  ref={mapExpand}
                  className="geo-map-expand"
                  aria-label={mapOpen ? "Уменьшить карту" : "Увеличить карту"}
                  aria-expanded={mapOpen}
                  aria-controls="geo-answer-map"
                  onClick={() => setMapOpen(!mapOpen)}
                >
                  {mapOpen ? "Уменьшить" : "Увеличить"}
                </button>
              )}
              {phase !== "reveal" && (
                <button
                  ref={mapClose}
                  className="geo-map-close"
                  aria-label="Вернуться к панораме"
                  onClick={closeMap}
                >
                  ×
                </button>
              )}
            </div>
            <div className="geo-map" id="geo-answer-map" ref={mapNode} />
            <div className="geo-map-tools">
              {phase === "reveal" ? (
                <div className="geo-legend">
                  {answer?.guess && (
                    <span>
                      <i className="guess" /> Твой ответ
                    </span>
                  )}
                  <span>
                    <i className="actual" /> Правильное место
                  </span>
                </div>
              ) : (
                <>
                  <span className="geo-map-hint">
                    {guess
                      ? "Точку можно передвинуть"
                      : "Нажми на нужное место"}
                  </span>
                  <button
                    disabled={phase !== "guessing"}
                    onClick={() => {
                      const center = map.current?.getCenter();
                      if (center) choosePoint(center.toJSON());
                    }}
                  >
                    Выбрать центр карты
                  </button>
                  {error && (
                    <span className="geo-inline-error" role="status">
                      {error}
                    </span>
                  )}
                  <button
                    className="primary geo-map-answer"
                    disabled={phase !== "guessing"}
                    onClick={() => void submit()}
                  >
                    Ответить <span aria-hidden="true">→</span>
                  </button>
                </>
              )}
            </div>
          </section>
          {phase === "guessing" && (
            <button
              ref={mapToggle}
              className="geo-map-toggle"
              aria-expanded={mapOpen}
              aria-controls="geo-answer-map"
              onClick={() => (mapOpen ? closeMap() : setMapOpen(true))}
            >
              {mapOpen ? "Панорама" : guess ? "Карта · точка выбрана" : "Карта"}
            </button>
          )}
          {(phase === "loading" || phase === "checking") && (
            <div className="geo-loading" role="status">
              <span className="geo-loader" aria-hidden="true" />
              <strong>
                {phase === "checking"
                  ? "Проверяем ответ…"
                  : "Открываем новое место…"}
              </strong>
              <span>
                {phase === "checking"
                  ? "Сейчас покажем место и очки."
                  : "Таймер начнётся после загрузки панорамы."}
              </span>
            </div>
          )}
          {phase === "error" && (
            <section className="geo-error" ref={result} tabIndex={-1}>
              <h2>Не получилось открыть место</h2>
              <p>{error}</p>
              <button className="primary" onClick={() => void loadRound(round)}>
                Попробовать ещё раз ↗
              </button>
            </section>
          )}
        </div>
        {phase === "reveal" && answer && (
          <section
            className="geo-result"
            ref={result}
            tabIndex={-1}
            aria-live="polite"
          >
            <div>
              <p className="eyebrow">{answer.location.country}</p>
              <h2>{answer.location.name}</h2>
              {answer.location.note && <p>{answer.location.note}</p>}
            </div>
            <div className="geo-round-result">
              {answer.timedOut && (
                <span className="geo-timeout-note" role="status">
                  Время вышло
                  {answer.guess ? " — принят последний ответ" : " — 0 очков"}
                </span>
              )}
              <strong>
                {geoPoints(answer.score)}
                <span> / 100</span>
              </strong>
              <span>
                {answer.distance === null ? (
                  "Точка не выбрана"
                ) : (
                  <>
                    До правильного места — <b>{geoDistance(answer.distance)}</b>
                  </>
                )}
              </span>
              <button className="primary" onClick={next}>
                {round === 4 ? "Мой результат" : "Следующее место"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}
        {phase === "finished" && (
          <section className="geo-summary" ref={result} tabIndex={-1}>
            <p className="eyebrow">
              ТВОЙ РЕЗУЛЬТАТ · {geoModeName(mode).toUpperCase()}
            </p>
            <h2>
              {geoPoints(total)}
              <span> из 500</span>
            </h2>
            <p>
              {total >= 20000
                ? "Ты отлично ориентируешься. Проверим ещё пять мест?"
                : "Партия закончена. Сыграешь ещё?"}
            </p>
            <div className="geo-summary-stats">
              <span>
                Рекорд <strong>{geoPoints(stats.best)} / 500</strong>
              </span>
              <span>
                Партий сыграно <strong>{stats.played}</strong>
              </span>
            </div>
            <ol className="geo-recap">
              {answers.map((item) => (
                <li key={item.location.id}>
                  <div>
                    <strong>{item.location.name}</strong>
                    <span>
                      {item.location.country} ·{" "}
                      {item.distance === null
                        ? "Точка не выбрана"
                        : geoDistance(item.distance)}
                      {item.timedOut ? " · Время вышло" : ""}
                    </span>
                  </div>
                  <b>
                    {geoPoints(item.score)}
                    <span> / 100</span>
                  </b>
                </li>
              ))}
            </ol>
            <button className="primary" onClick={() => void start(true)}>
              Играть ещё <span aria-hidden="true">↗</span>
            </button>
            <button
              className="text-button"
              onClick={() => {
                setPhase("welcome");
                deadlineRef.current = null;
                setDeadline(null);
              }}
            >
              Выбрать другой режим
            </button>
            <SaveResult run={ranked} game="geo" />
          </section>
        )}
        {(phase === "welcome" || phase === "finished") && <GeoAbout />}
      </main>
      <footer className="geo-footer">
        <span>Замечай детали. Находи своё место.</span>
        <a href="/">Все игры Playne ↗</a>
        <FooterLinks />
      </footer>
      <dialog
        className="geo-rules-dialog"
        ref={rules}
        aria-labelledby="geo-rules-title"
      >
        <div className="dialog-top">
          <h2 id="geo-rules-title">Как играть в «Где я?»</h2>
          <button
            className="geo-dialog-close"
            aria-label="Закрыть правила"
            onClick={() => rules.current?.close()}
          >
            ×
          </button>
        </div>
        <Rules landmarks={geoIsLandmarks(mode)} />
        <button className="primary" onClick={() => rules.current?.close()}>
          Понятно
        </button>
      </dialog>
    </div>
  );
}
