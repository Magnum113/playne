import { afterAll, afterEach, beforeAll, expect, it, describe, vi } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { buildApp } from "../server/app";
import { chooseDailyGeoPlaces } from "../server/geo-daily";
import { geoDailyDate } from "../src/geoDaily";
import { GEO_SCORE_VERSION } from "../src/geo";

const db = process.env.TEST_DATABASE_URL;
(db ? describe : describe.skip)("Маршрут дня in PostgreSQL", () => {
  let admin: Pool;
  let pool: Pool;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test")
      throw new Error("Isolated test database required");
    admin = new Pool({ connectionString: db });
    await admin.query("CREATE SCHEMA playne_geo_daily_test");
    pool = new Pool({
      connectionString: db,
      options: "-c search_path=playne_geo_daily_test",
    });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(pool, {
      origin: "https://daily.test",
      redirect: "https://daily.test/api/auth/yandex/callback",
      yandexId: "test", yandexSecret: "test", googleKey: "fixture",
      secure: true, revision: "geo-daily-test",
    }, (async (url: string) => {
      const request = new URL(url);
      if (request.hostname === "maps.googleapis.com") {
        const [lat, lng] = request.searchParams.get("pano")!.split(",").map(Number);
        return Response.json({ status: "OK", location: { lat, lng } });
      }
      if (request.pathname === "/token") return Response.json({ access_token: "test" });
      return Response.json({ id: "geo-daily-identity", client_id: "test", first_name: "Игрок" });
    }) as typeof fetch);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query("DROP SCHEMA IF EXISTS playne_geo_daily_test CASCADE");
    await admin?.end();
  });

  const cookies = (response: Awaited<ReturnType<typeof get>>) =>
    response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const get = (url: string, cookie = "") =>
    app.inject({ url, headers: { cookie } });
  const post = (url: string, cookie: string, payload: object) =>
    app.inject({ method: "POST", url, headers: { cookie, origin: "https://daily.test" }, payload });
  const start = (cookie: string, mode = "daily", game = "geo") =>
    post("/api/games", cookie, { game, mode, geoRulesVersion: GEO_SCORE_VERSION });

  async function finish(cookie: string, run: any, firstGuess?: { lat: number; lng: number }, delayMs = 0) {
    for (const [index, place] of run.challenge.places.entries()) {
      const point = place.view ?? place;
      const panorama = await post(`/api/games/${run.id}/panorama`, cookie, {
        index, pano: `${point.lat},${point.lng}`,
      });
      expect(panorama.statusCode, panorama.body).toBe(200);
      if (delayMs) {
        vi.setSystemTime(Date.now() + delayMs / 2);
        // Reopening a round must leave its original clock running.
        if (index === 0) {
          expect((await post(`/api/games/${run.id}/panorama`, cookie, {
            index, pano: `${point.lat},${point.lng}`,
          })).statusCode).toBe(200);
        }
        vi.setSystemTime(Date.now() + delayMs / 2);
      }
      const response = await post(`/api/games/${run.id}/answers`, cookie, {
        index, answer: { guess: index === 0 && firstGuess ? firstGuess : { lat: place.lat, lng: place.lng }, elapsedMs: 0 },
      });
      expect(response.statusCode, response.body).toBe(200);
      if (delayMs && run.challenge.speedScoring)
        expect(response.json().answer).toMatchObject({ elapsedMs: delayMs, score: 95 });
      expect(response.json().completed).toBe(index === 4);
    }
  }

  it("shares and freezes five places, reserves one guest attempt, and leaves the regular trial alone", async () => {
    const guest = cookies(await get("/api/me"));
    const second = cookies(await get("/api/me"));
    const regular = (await start(guest, "classic")).json();
    const before = await get("/api/geo/daily", guest);
    expect(before.headers["cache-control"]).toBe("no-store");
    expect(before.json()).toEqual({ day: geoDailyDate(), speedScoring: true, leaders: [], attempt: null });

    const [first, concurrent] = await Promise.all([start(guest), start(guest)]);
    expect(first.statusCode, first.body).toBe(200);
    expect(concurrent.statusCode, concurrent.body).toBe(200);
    const run = first.json();
    expect(concurrent.json().id).toBe(run.id);
    expect(new Set(run.challenge.places.map((p: any) => p.region)).size).toBe(5);
    const another = (await start(second)).json();
    expect(another.id).not.toBe(run.id);
    expect(another.challenge).toEqual(run.challenge);
    expect((await post(`/api/games/${run.id}/replace`, guest, { index: 0 })).statusCode).toBe(409);
    expect((await get("/api/me", guest)).json().trials.geo.id).toBe(regular.id);
    expect((await start(guest, "daily", "naglaz")).statusCode).toBe(400);
  });

  it("counts a guest finish for the streak, claims it at login and keeps rankings separate by Moscow date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(geoDailyDate() + "T12:00:00Z"));
    const guest = cookies(await get("/api/me"));
    const run = (await start(guest)).json();
    const day = run.challenge.day;
    await finish(guest, run, undefined, 90_000);
    expect((await get("/api/geo/daily", guest)).json().attempt).toEqual({
      id: run.id, completed: true, published: false, score: 475,
    });
    expect((await get("/api/play/progress", guest)).json().streak.playedToday).toBe(true);
    expect((await start(guest)).json().completed).toBe(true);
    const board = "/api/leaderboard?game=geo&mode=daily";
    const rank = `/api/games/${run.id}/geo-rank`;
    expect((await get(board, guest)).json().total).toBe(0);
    await pool.query(
      `WITH players AS (
        INSERT INTO playne_users(nickname) VALUES ('Быстрый'),('Уверенный'),('Спокойный')
        RETURNING id,nickname
      )
      INSERT INTO playne_games(browser_hash,owner_id,game,mode,version,challenge,answers,score_units,completed_at,published_at)
      SELECT repeat('b',64),id,'geo','daily',$1,jsonb_build_object('day',$2::text),
        (SELECT jsonb_agg(jsonb_build_object('score',95,'elapsedMs',
          CASE nickname WHEN 'Быстрый' THEN 10000 WHEN 'Уверенный' THEN 40000 ELSE 100000 END)
          ORDER BY round)
         FROM generate_series(1,5) AS rounds(round)),4750,now(),now() FROM players`,
      [GEO_SCORE_VERSION, day],
    );
    expect((await get(rank, guest)).json()).toEqual({ place: 3, projected: true });

    const authStart = await get("/api/auth/yandex/start?return=%2Fgeo%2F%3Fmode%3Ddaily", guest);
    const state = new URL(authStart.headers.location!).searchParams.get("state");
    const callback = await get(`/api/auth/yandex/callback?code=fixture&state=${state}`, guest);
    const signed = guest + "; " + cookies(callback);
    expect(callback.headers.location).toContain("auth=success");
    expect((await get("/api/geo/daily", signed)).json().attempt.published).toBe(true);
    expect((await get(board, signed)).json()).toMatchObject({
      total: 4, day, speedScoring: true, mine: { score: 475, place: 3, elapsedMs: 450_000 },
    });
    expect((await get(rank, signed)).json()).toEqual({ place: 3, projected: false });
    expect((await get("/api/geo/daily", signed)).json().leaders).toEqual([
      { nickname: "Быстрый", place: 1, position: 1, score: 475, elapsedMs: 50_000 },
      { nickname: "Уверенный", place: 2, position: 2, score: 475, elapsedMs: 200_000 },
      { nickname: "Игрок", place: 3, position: 3, score: 475, elapsedMs: 450_000 },
    ]);

    const otherBrowser = cookies(await get("/api/me")) + "; " + cookies(callback);
    expect((await start(otherBrowser)).json().id).toBe(run.id);
    expect((await get("/api/leaderboard?game=geo&mode=landmarks&version=4", signed)).json().total).toBe(0);

    vi.setSystemTime(new Date(day + "T21:00:01Z"));
    expect((await get(board, signed)).json().total).toBe(0);
    expect((await get(board + "&day=" + day, signed)).json().total).toBe(4);
    expect((await get(rank, signed)).json()).toEqual({ place: 3, projected: false });
    expect((await get("/api/geo/daily", signed)).json().attempt).toBeNull();
    const next = (await start(signed)).json();
    expect(next.challenge.day).not.toBe(day);
    expect(next.challenge.places.map((p: any) => p.id)).not.toEqual(
      run.challenge.places.map((p: any) => p.id),
    );
  });

  it("keeps the original scoring for a daily pack that was already issued", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const day = geoDailyDate(Date.now() - 86_400_000);
    vi.setSystemTime(new Date(day + "T12:00:00Z"));
    await pool.query(
      "INSERT INTO playne_geo_daily_packs(day,places) VALUES($1,$2)",
      [day, JSON.stringify(chooseDailyGeoPlaces(day))],
    );
    const guest = cookies(await get("/api/me"));
    expect((await get("/api/geo/daily", guest)).json().speedScoring).toBe(false);
    const run = (await start(guest)).json();
    expect(run.challenge.speedScoring).toBe(false);
    await finish(guest, run, undefined, 90_000);
    const finished = (await get(`/api/games/${run.id}`, guest)).json();
    expect(finished.score).toBe(500);
    expect(finished.answers[0]).not.toHaveProperty("elapsedMs");
  });

  it("previews a regular place across the full board and returns the account's best place after login", async () => {
    const guest = cookies(await get("/api/me"));
    const other = cookies(await get("/api/me"));
    const run = (await start(guest, "landmarks")).json();
    const rank = `/api/games/${run.id}/geo-rank`;
    expect((await get(rank, other)).statusCode).toBe(404);
    expect((await get(rank, guest)).json()).toBeNull();
    await finish(guest, run, { lat: 0, lng: 0 });
    const completed = (await get(`/api/games/${run.id}`, guest)).json();
    await pool.query(
      `WITH players AS (
        INSERT INTO playne_users(nickname)
        SELECT 'Игрок ' || n FROM generate_series(1, 31) n
        RETURNING id,nickname
      )
      INSERT INTO playne_games(browser_hash,owner_id,game,mode,version,challenge,score_units,completed_at,published_at)
      SELECT repeat('a',64),id,'geo','landmarks',$1,'{}',
        CASE WHEN nickname='Игрок 31' THEN $2 ELSE 5000 END,now(),now()
      FROM players`,
      [GEO_SCORE_VERSION, completed.answers.reduce((sum: number, a: {score: number}) => sum + a.score * 10, 0)],
    );
    const preview = await get(rank, guest);
    expect(preview.headers["cache-control"]).toBe("no-store");
    expect(preview.json()).toEqual({ place: 31, projected: true });

    const returnPath = encodeURIComponent(`/geo/?saved=${run.id}&mode=landmarks`);
    const auth = await get(`/api/auth/yandex/start?return=${returnPath}`, guest);
    const state = new URL(auth.headers.location!).searchParams.get("state");
    const callback = await get(`/api/auth/yandex/callback?code=fixture&state=${state}`, guest);
    const signed = guest + "; " + cookies(callback);
    expect(callback.headers.location).toContain(`saved=${run.id}`);
    expect((await get(rank, signed)).json()).toEqual({ place: 31, projected: false });
    expect((await get(rank, guest)).statusCode).toBe(404);
    const account = (await get("/api/me", signed)).json().user;
    await pool.query(
      `INSERT INTO playne_games(browser_hash,owner_id,game,mode,version,challenge,score_units,completed_at,published_at)
       VALUES(repeat('a',64),$1,'geo','landmarks',$2,'{}',5000,now(),now())`,
      [account.id, GEO_SCORE_VERSION],
    );
    expect((await get(rank, signed)).json()).toEqual({ place: 1, projected: false });
  });
});
