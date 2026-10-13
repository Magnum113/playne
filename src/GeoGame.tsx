import { AccountNav, useRankedRun, SaveResult } from "./account";
import { useEffect, useRef, useState } from "react";
import { PlayneBrand, ThemeToggle } from "./SiteHeader";
import FooterLinks from "./FooterLinks";
import GeoPreview from "./GeoPreview";
import { GEO_GOALS, reachGoal } from "./analytics";
import {
  chooseGeoRounds,
  distanceKm,
  geoBounds,
  geoDistance,
  geoScore,
  readGeoStats,
  saveGeoStats,
  type GeoAnswer,
  type GeoPoint,
} from "./geo";
import { geoLocations, type GeoLocation } from "./geoLocations";
import { findPanorama, loadGoogleMaps, onMapsAuthFailure } from "./googleMaps";
import "./geo.css";

type Phase =
  | "welcome"
  | "loading"
  | "guessing"
  | "reveal"
  | "finished"
  | "error";
function Rules() {
  return (
    <div className="geo-rules-copy">
      <p>Ты в незнакомом месте. Осмотрись и найди его на карте мира.</p>
      <ol>
        <li>
          Вращай панораму мышью или пальцем. Приближать можно, идти по улицам —
          нельзя.
        </li>
        <li>
          Открой карту, приблизь нужный участок и поставь точку. До ответа её
          можно передвигать.
        </li>
        <li>Нажми «Ответить». Увидишь правильное место, расстояние и очки.</li>
      </ol>
      <p>
        Пять раундов, до 500 очков. За попадание в пределах 250 метров — 100
        очков. Дальше оценка плавно уменьшается с расстоянием. Таймера нет.
      </p>
      <p>
        Ищи подсказки в языке вывесок, архитектуре, растениях и разметке. Рекорд
        сохраняется в этом браузере.
      </p>
    </div>
  );
}

export default function GeoGame() {
  const ranked = useRankedRun("geo");
  const [phase, setPhaseState] = useState<Phase>("welcome");
  const phaseRef = useRef<Phase>("welcome");
  const setPhase = (value: Phase) => {
    phaseRef.current = value;
    setPhaseState(value);
  };
  const [stats, setStats] = useState(readGeoStats);
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
  const busy = useRef(false),
    operation = useRef(0);
  const cancelWait = useRef<(() => void) | null>(null);
  const badPlaces = useRef(new Set<string>());
  const rules = useRef<HTMLDialogElement>(null),
    result = useRef<HTMLElement>(null);
  const total = answers.reduce((sum, answer) => sum + answer.score, 0);
  const answer = answers[round];

  function choosePoint(point: GeoPoint) {
    if (phaseRef.current !== "guessing" || !map.current) return;
    guessRef.current = point;
    setGuess(point);
    setError("");
    guessMarker.current?.setPosition(point);
    guessMarker.current?.setMap(map.current);
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
        if (map.current) google.maps.event.trigger(map.current, "resize");
      });
    });
    if (panoNode.current) observer.observe(panoNode.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
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
      motionTracking: false,
      motionTrackingControl: false,
    });
    panorama.current.addListener("pano_changed", () => {
      const view = panorama.current;
      if (view && allowedPano.current && view.getPano() !== allowedPano.current)
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
  function showPanorama(pano: string, heading: number) {
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
        else resolve();
      }
      cancelWait.current = () => finish(new Error("Cancelled"));
      allowedPano.current = pano;
      view.setPov({ heading, pitch: 0 });
      view.setZoom(0);
      view.setPano(pano);
      // Reusing an already-loaded panorama may not emit another status event.
      if (
        view.getStatus() === google.maps.StreetViewStatus.OK &&
        view.getPano() === pano
      )
        finish();
    });
  }
  async function loadRound(index: number) {
    if (busy.current) return;
    busy.current = true;
    const token = ++operation.current;
    setPhase("loading");
    setMapOpen(false);
    setGuess(null);
    guessRef.current = null;
    setError("");
    setRound(index);
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
          const verifiedActual = await ranked.panorama(index, data.location.pano);
          await showPanorama(
            data.location.pano,
            place.heading ?? data.tiles?.centerHeading ?? 0,
          );
          if (token !== operation.current) return;
          actual.current = verifiedActual ?? data.location.latLng.toJSON();
          activePlace.current = place;
          rounds.current[index] = place;
          setPhase("guessing");
          busy.current = false;
          return;
        } catch {
          if (token !== operation.current) return;
          badPlaces.current.add(place.id);
          const onlineReplacement = await ranked.replaceGeo(index);
          if (onlineReplacement) { place = onlineReplacement; rounds.current[index] = place; continue; }
          ranked.local();
          const next = geoLocations.find(
            (candidate) =>
              candidate.region === place.region &&
              !badPlaces.current.has(candidate.id) &&
              !rounds.current.some(
                (other, i) =>
                  i !== index &&
                  (other.id === candidate.id ||
                    other.countryCode === candidate.countryCode),
              ),
          );
          if (!next) throw new Error("No alternative");
          place = next;
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
    const online = await ranked.begin();
    rounds.current =
      online?.challenge.places ?? chooseGeoRounds(statsRef.current.recent);
    answersRef.current = [];
    setAnswers([]);
    reachGoal(replay ? GEO_GOALS.gameRestart : GEO_GOALS.gameStart);
    void loadRound(0);
  }
  function submit() {
    if (phaseRef.current !== "guessing") return;
    if (!guessRef.current) {
      setMapOpen(true);
      mapNode.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
      setError("Сначала поставь точку на карте.");
      return;
    }
    if (!actual.current || !activePlace.current) return;
    ranked.submit(round, { guess: guessRef.current });
    const distance = distanceKm(guessRef.current, actual.current);
    const result: GeoAnswer = {
      location: activePlace.current,
      guess: guessRef.current,
      actual: actual.current,
      distance,
      score: geoScore(distance),
    };
    answersRef.current = [...answersRef.current, result];
    setAnswers(answersRef.current);
    setPhase("reveal");
    setMapOpen(true);
    setError("");
    actualMarker.current!.setPosition(result.actual);
    actualMarker.current!.setMap(map.current);
    line.current = new google.maps.Polyline({
      map: map.current,
      path: [result.guess, result.actual],
      geodesic: true,
      strokeColor: "#a188e3",
      strokeWeight: 3,
      strokeOpacity: 0.8,
    });
    const bounds = geoBounds(result.guess, result.actual);
    if (distance < 0.01) {
      map.current!.setCenter(result.actual);
      map.current!.setZoom(15);
    } else map.current!.fitBounds(bounds, 55);
    reachGoal(GEO_GOALS.roundComplete, {
      round: round + 1,
      score: result.score,
      distance_km: Math.round(distance),
      country: result.location.countryCode,
    });
    if (result.score === 100)
      reachGoal(GEO_GOALS.perfectRound, { round: round + 1 });
    if (answersRef.current.length === 5) {
      const score = answersRef.current.reduce(
        (sum, item) => sum + item.score,
        0,
      );
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
      saveGeoStats(nextStats);
      reachGoal(GEO_GOALS.gameComplete, { score });
    }
  }
  function next() {
    if (phaseRef.current !== "reveal") return;
    if (round === 4) setPhase("finished");
    else void loadRound(round + 1);
  }
  const active = phase !== "welcome" && phase !== "finished";
  return (
    <div className="app geo-app">
      <a className="skip-link" href="#geo-main">
        Перейти к игре
      </a>
      <header className="header">
        <PlayneBrand />
        <nav className="game-header-actions" aria-label="Навигация">
          <a className="back-to-hub" href="/">
            ← Все игры
          </a>
          <AccountNav />
          <ThemeToggle />
        </nav>
      </header>
      <main id="geo-main" className="geo-main">
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
              <h2>Мир полон подсказок.</h2>
              <p>
                Осмотрись в незнакомом месте и найди его на карте. Чем ближе
                твоя точка, тем больше очков.
              </p>
              <ol>
                <li>Вращай панораму и замечай детали.</li>
                <li>Поставь точку на карте мира.</li>
                <li>Проверь ответ и узнай, где оказался.</li>
              </ol>
              <button className="primary" onClick={() => start()}>
                Начать игру <span aria-hidden="true">↗</span>
              </button>
              <small>Без перемещения по улицам. Без таймера.</small>
              {stats.best > 0 && (
                <p className="geo-best">
                  Твой рекорд: <strong>{stats.best} / 500</strong>
                </p>
              )}
            </div>
            <div className="geo-welcome-art">
              <GeoPreview />
              <span>Города, побережья, горы и дороги.</span>
            </div>
          </section>
        )}
        {active && (
          <div className="geo-status">
            <div>
              <span className="eyebrow">РАУНД {round + 1} ИЗ 5</span>
              <div className="geo-dots" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i
                    key={i}
                    className={
                      i < answers.length ? "done" : i === round ? "active" : ""
                    }
                  />
                ))}
              </div>
            </div>
            <span className="geo-score">
              Очки <strong>{total}</strong> / 500
            </span>
          </div>
        )}
        <div
          className={`geo-stage ${active ? "" : "geo-stage-hidden"} ${mapOpen ? "geo-map-open" : ""} ${phase === "reveal" ? "geo-revealed" : ""}`}
          inert={!active}
        >
          <div
            className="geo-panorama"
            ref={panoNode}
            inert={phase === "loading" || phase === "error"}
            aria-label="Панорама: осмотрись и угадай место"
          />
          <section
            className="geo-map-panel"
            inert={phase === "loading" || phase === "error"}
            aria-label="Карта для ответа"
          >
            <div className="geo-map-heading">
              <h2>{phase === "reveal" ? "Сравни точки" : "Где это?"}</h2>
              <button
                className="geo-map-close"
                aria-label="Вернуться к панораме"
                onClick={() => setMapOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="geo-map" ref={mapNode} />
            <div className="geo-map-tools">
              {phase === "reveal" ? (
                <div className="geo-legend">
                  <span>
                    <i className="guess" /> Твой ответ
                  </span>
                  <span>
                    <i className="actual" /> Правильное место
                  </span>
                </div>
              ) : (
                <>
                  <span>
                    {guess
                      ? "Точку можно передвинуть"
                      : "Нажми на нужное место"}
                  </span>
                  <button
                    onClick={() => {
                      const center = map.current?.getCenter();
                      if (center) choosePoint(center.toJSON());
                    }}
                  >
                    Выбрать центр карты
                  </button>
                </>
              )}
            </div>
          </section>
          {phase === "loading" && (
            <div className="geo-loading" role="status">
              <span className="geo-loader" aria-hidden="true" />
              <strong>Открываем новое место…</strong>
              <span>Скоро можно будет осмотреться.</span>
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
        {phase === "guessing" && (
          <div className="geo-actions">
            <div className="geo-action-tip">
              <span>
                {guess
                  ? "Точка выбрана. Готов проверить?"
                  : "Осмотрись и поставь точку на карте."}
              </span>
              <span className="geo-inline-error" role="status">
                {error}
              </span>
            </div>
            <div className="geo-action-buttons">
              <button
                className="geo-map-toggle"
                aria-expanded={mapOpen}
                onClick={() => setMapOpen(!mapOpen)}
              >
                {mapOpen
                  ? "Панорама"
                  : guess
                    ? "Изменить точку"
                    : "Открыть карту"}
              </button>
              <button className="primary" onClick={submit}>
                Ответить <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        )}
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
              <strong>
                {answer.score}
                <span> / 100</span>
              </strong>
              <span>
                До правильного места — <b>{geoDistance(answer.distance)}</b>
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
            <p className="eyebrow">ТВОЙ РЕЗУЛЬТАТ</p>
            <h2>
              {total}
              <span> из 500</span>
            </h2>
            <p>
              {total >= 400
                ? "Ты отлично ориентируешься. Проверим ещё пять мест?"
                : "Партия закончена. Сыграешь ещё?"}
            </p>
            <div className="geo-summary-stats">
              <span>
                Рекорд <strong>{stats.best} / 500</strong>
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
                      {item.location.country} · {geoDistance(item.distance)}
                    </span>
                  </div>
                  <b>
                    {item.score}
                    <span> / 100</span>
                  </b>
                </li>
              ))}
            </ol>
            <button className="primary" onClick={() => start(true)}>
              Играть ещё <span aria-hidden="true">↗</span>
            </button>
            <SaveResult run={ranked} game="geo" />
          </section>
        )}
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
        <Rules />
        <button className="primary" onClick={() => rules.current?.close()}>
          Понятно
        </button>
      </dialog>
    </div>
  );
}
