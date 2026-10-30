import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { buildApp } from "../server/app";
import { improvesPersonalRecord } from "../server/personal-record";
import { scoreVersion } from "../server/scoring";
const db = process.env.TEST_DATABASE_URL;

(db ? describe : describe.skip)("Personal-record receipts", () => {
  let admin: Pool, pool: Pool, app: Awaited<ReturnType<typeof buildApp>>;
  const origin = "https://record.test";
  const cookies = (response: any) =>
    response.cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
  const guest = async () => cookies(await app.inject("/api/me"));
  const post = (cookie: string, url: string, payload: any) =>
    app.inject({ method: "POST", url, headers: { origin, cookie }, payload });
  async function player() {
    const id = (
      await pool.query(
        "INSERT INTO playne_users(nickname) VALUES('Игрок') RETURNING id",
      )
    ).rows[0].id;
    const token = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
      [createHash("sha256").update(token).digest("hex"), id],
    );
    return {
      id,
      session: `playne_session=${token}`,
      cookie: `${await guest()}; playne_session=${token}`,
    };
  }
  async function old(
    owner: string,
    game = "circle",
    units = 1000,
    mode = "classic",
    version = 1,
    answers: any[] = [],
  ) {
    return (
      await pool.query(
        "INSERT INTO playne_games(browser_hash,owner_id,game,version,mode,challenge,answers,score_units,completed_at,published_at) VALUES('prior',$1,$2,$3,$4,'{}',$5,$6,now(),now()) RETURNING id",
        [owner, game, version, mode, JSON.stringify(answers), units],
      )
    ).rows[0].id;
  }
  const answer = {
    index: 0,
    answer: {
      points: Array.from({ length: 361 }, (_, i) => ({
        x: 300 + 150 * Math.cos((i * Math.PI) / 180),
        y: 300 + 150 * Math.sin((i * Math.PI) / 180),
      })),
    },
  };
  beforeAll(async () => {
    if (!db || new URL(db).pathname !== "/playne_test")
      throw Error("Isolated test database required");
    admin = new Pool({ connectionString: db });
    await admin.query("CREATE SCHEMA IF NOT EXISTS playne_record_test");
    pool = new Pool({
      connectionString: db,
      options: "-c search_path=playne_record_test",
    });
    await pool.query(readFileSync("server/schema.sql", "utf8"));
    app = await buildApp(pool, {
      origin,
      yandexId: "test",
      yandexSecret: "test",
      redirect: origin + "/api/auth/yandex/callback",
      secure: true,
      revision: "test",
    });
  });
  beforeEach(async () => {
    await pool.query("TRUNCATE playne_games,playne_users CASCADE");
  });
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await admin?.query("DROP SCHEMA IF EXISTS playne_record_test CASCADE");
    await admin?.end();
  });

  it("returns a verified first guest record and a stable timestamp on an idempotent retry", async () => {
    const cookie = await guest(),
      run = (await post(cookie, "/api/games", { game: "circle" })).json();
    const first = await post(cookie, `/api/games/${run.id}/answers`, answer);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      completed: true,
      score: 100,
      record: { improved: true, ownerId: null },
    });
    const retry = (
      await post(cookie, `/api/games/${run.id}/answers`, answer)
    ).json();
    expect(retry.record.improved).toBe(true);
    expect(retry.record.completedAt).toBe(first.json().record.completedAt);
  });
  it("compares an account's best score, so ties and lower results do not celebrate", async () => {
    const p = await player();
    await old(p.id, "circle", 990);
    const run = (await post(p.cookie, "/api/games", { game: "circle" })).json();
    const result = (
      await post(p.cookie, `/api/games/${run.id}/answers`, answer)
    ).json();
    expect(result).toMatchObject({
      completed: true,
      published: true,
      score: 100,
      record: { improved: true, ownerId: p.id },
    });
    await pool.query("UPDATE playne_games SET score_units=990 WHERE id<>$1", [
      run.id,
    ]);
    const next = (
      await post(p.cookie, "/api/games", { game: "circle" })
    ).json();
    expect(
      (await post(p.cookie, `/api/games/${next.id}/answers`, answer)).json()
        .record.improved,
    ).toBe(false);
  });
  it("rechecks a guest score after sign-in, preserving an existing higher account record", async () => {
    const p = await player();
    await old(p.id);
    const cookie = await guest(),
      run = (await post(cookie, "/api/games", { game: "circle" })).json();
    expect(
      (await post(cookie, `/api/games/${run.id}/answers`, answer)).json().record
        .improved,
    ).toBe(true);
    const claim = (
      await post(`${cookie}; ${p.session}`, `/api/games/${run.id}/publish`, {})
    ).json();
    expect(claim.record).toMatchObject({ improved: false, ownerId: p.id });
  });
  it("does not attribute an unfinished account A run to account B in the same browser", async () => {
    const a = await player(),
      b = await player();
    const run = (await post(a.cookie, "/api/games", { game: "circle" })).json();
    const switched = a.cookie.replace(a.session, b.session);
    const completion = await post(
      switched,
      `/api/games/${run.id}/answers`,
      answer,
    );
    expect(completion.statusCode).toBe(200);
    expect(completion.json()).toMatchObject({
      completed: true,
      published: false,
      record: { improved: false, ownerId: a.id },
    });
    expect(
      (
        await pool.query(
          "SELECT owner_id,published_at FROM playne_games WHERE id=$1",
          [run.id],
        )
      ).rows[0],
    ).toMatchObject({ owner_id: a.id, published_at: null });
    expect(
      (await post(switched, `/api/games/${run.id}/publish`, {})).statusCode,
    ).toBe(403);
    expect(
      (await post(switched, `/api/games/${run.id}/answers`, answer)).json()
        .record,
    ).toMatchObject({ improved: false, ownerId: a.id });
    const restored = await post(a.cookie, `/api/games/${run.id}/publish`, {});
    expect(restored.statusCode).toBe(200);
    expect(restored.json().record).toMatchObject({
      improved: true,
      ownerId: a.id,
    });
  });
  it("does not treat an owned run completed after session expiry as a guest record", async () => {
    const p = await player();
    const run = (await post(p.cookie, "/api/games", { game: "circle" })).json();
    await pool.query(
      "UPDATE playne_auth_sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
      [p.id],
    );
    const completion = await post(
      p.cookie,
      `/api/games/${run.id}/answers`,
      answer,
    );
    expect(completion.statusCode).toBe(200);
    expect(completion.json()).toMatchObject({
      completed: true,
      published: false,
      record: { improved: false, ownerId: p.id },
    });
    expect(
      (await post(p.cookie, `/api/games/${run.id}/publish`, {})).statusCode,
    ).toBe(401);
    expect(
      (await post(p.cookie, `/api/games/${run.id}/answers`, answer)).json()
        .record,
    ).toMatchObject({ improved: false, ownerId: p.id });
    await pool.query(
      "UPDATE playne_auth_sessions SET expires_at=now()+interval '1 day' WHERE user_id=$1",
      [p.id],
    );
    const restored = await post(p.cookie, `/api/games/${run.id}/publish`, {});
    expect(restored.statusCode).toBe(200);
    expect(restored.json().record).toMatchObject({
      improved: true,
      ownerId: p.id,
    });
  });
  it("separates modes, projects old geo scores and never celebrates private practice", async () => {
    const p = await player();
    const id = await old(
      p.id,
      "geo",
      250000,
      "classic",
      2,
      Array.from({ length: 5 }, () => ({ score: 5000 })),
    );
    const c = await pool.connect();
    try {
      const run = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        game: "geo",
        mode: "classic",
        version: 4,
      };
      expect(await improvesPersonalRecord(c, run, 4990, p.id)).toBe(false);
      expect(
        await improvesPersonalRecord(c, { ...run, mode: "timed" }, 4990, p.id),
      ).toBe(true);
      expect(await improvesPersonalRecord(c, { ...run, id }, 4990, p.id)).toBe(
        true,
      );
      expect(
        await improvesPersonalRecord(
          c,
          { ...run, mode: "practice" },
          5000,
          p.id,
        ),
      ).toBe(false);
    } finally {
      c.release();
    }
  });
  it("does not celebrate resumed legacy scores against a different current scoring scale", async () => {
    const p = await player();
    await old(p.id, "geo", 5000, "classic", 4);
    await old(p.id, "colorfle", 5000, "classic", scoreVersion("colorfle"));
    const c = await pool.connect();
    try {
      for (const [game, version, units] of [
        ["geo", 3, 4900],
        ["geo", 2, 245000],
        ["colorfle", scoreVersion("colorfle") - 1, 4990],
      ] as const) {
        const legacy = {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          game,
          version,
          mode: "classic",
        };
        expect(await improvesPersonalRecord(c, legacy, units, p.id)).toBe(
          false,
        );
        expect(await improvesPersonalRecord(c, legacy, units, null)).toBe(
          false,
        );
      }
    } finally {
      c.release();
    }
  });
});
