import Fastify, { type FastifyRequest } from "fastify";
import {
  validHSV,
  validShadeMode,
  hsvToHex,
  SHADE_TIME_LIMIT_MS,
  SHADE_SCORE_VERSION,
} from "../src/colorfle";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { randomBytes, createHash } from "node:crypto";
import { Pool } from "pg";
import {
  GAME_NAMES,
  isGame,
  makeChallenge,
  publicChallenge,
  validateAnswer,
  scoreUnits,
  validNickname,
  initialNickname,
  safeReturn,
  SCORE_VERSION,
  scoreVersion,
  geoProjection,
  GEO_V3_UNITS_SQL,
  GEO_V4_UNITS_SQL,
} from "./scoring";
import {
  validPoint,
  validGeoMode,
  geoIsTimed,
  geoCanMove,
  geoIsLandmarks,
  geoCatalog,
  geoPanoramaFits,
  GEO_TIME_LIMIT_MS,
} from "../src/geo";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const geoViewerVersion = (req: FastifyRequest, query: any = {}) =>
  req.headers["x-playne-geo-version"] === "4" || query.version === "4"
    ? 4
    : req.headers["x-playne-geo-version"] === "3" || query.version === "3"
      ? 3
      : req.headers["x-playne-geo-version"] === "2" || query.version === "2"
        ? 2
        : 1;
export type Config = {
  origin: string;
  yandexId: string;
  yandexSecret: string;
  redirect: string;
  googleKey?: string;
  secure: boolean;
  revision: string;
};
export async function buildApp(
  pool: Pool,
  config: Config,
  remoteFetch: typeof fetch = fetch,
) {
  const app = Fastify({
    logger: false,
    trustProxy: "127.0.0.1",
    bodyLimit: 600_000,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  const options = {
    path: "/",
    httpOnly: true,
    secure: config.secure,
    sameSite: "lax" as const,
    maxAge: 30 * 86400,
  };
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    if (
      ["POST", "PATCH", "DELETE"].includes(req.method) &&
      req.headers.origin !== config.origin
    )
      return reply.code(403).send({ error: "Недопустимый источник запроса" });
  });
  app.setErrorHandler((err, req, reply) => {
    const status = (err as any).statusCode ?? 500;
    if (status === 429)
      return reply
        .code(429)
        .send({ error: "Слишком много запросов. Попробуй чуть позже." });
    if (status >= 500)
      console.error(
        "Playne API request failed",
        req.method,
        req.routeOptions.url,
      );
    reply.code(status).send({
      error:
        status < 500
          ? (err as Error).message
          : "Не удалось выполнить запрос. Попробуй ещё раз.",
    });
  });
  function failure(message: string, status = 400): never {
    throw Object.assign(new Error(message), { statusCode: status });
  }
  function browser(req: FastifyRequest, reply: any) {
    let value = req.cookies.playne_guest;
    if (!value || !/^[\w-]{43}$/.test(value)) {
      value = token();
      reply.setCookie("playne_guest", value, options);
    }
    return hash(value);
  }
  async function user(req: FastifyRequest, client: any = pool) {
    const sid = req.cookies.playne_session;
    if (!sid || !/^[\w-]{43}$/.test(sid)) return null;
    const { rows } = await client.query(
      "SELECT u.id,u.nickname,u.nickname_confirmed FROM playne_auth_sessions s JOIN playne_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
      [hash(sid)],
    );
    return rows[0] ?? null;
  }
  async function requireUser(req: FastifyRequest) {
    const u = await user(req);
    if (!u) failure("Войди, чтобы сохранить результат", 401);
    return u;
  }
  async function owned(
    req: FastifyRequest,
    reply: any,
    id: unknown,
    client: any,
    lock = false,
  ) {
    if (!uuid(id)) failure("Партия не найдена", 404);
    const { rows } = await client.query(
      "SELECT * FROM playne_games WHERE id=$1" + (lock ? " FOR UPDATE" : ""),
      [id],
    );
    const game = rows[0];
    const owner = await user(req, client);
    if (
      !game ||
      (game.browser_hash !== browser(req, reply) && game.owner_id !== owner?.id)
    )
      failure("Партия не найдена", 404);
    if (!game.published_at && new Date(game.expires_at).getTime() < Date.now())
      failure("Срок сохранения этой партии истёк.", 410);
    return game;
  }
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { ok: true, revision: config.revision };
  });
  app.get("/api/me", async (req, reply) => {
    browser(req, reply);
    return { user: await user(req) };
  });
  app.patch("/api/me", async (req) => {
    const u = await requireUser(req);
    let nickname: string;
    try {
      nickname = validNickname((req.body as any)?.nickname);
    } catch (e) {
      failure((e as Error).message);
    }
    const { rows } = await pool.query(
      "UPDATE playne_users SET nickname=$1,nickname_confirmed=true WHERE id=$2 RETURNING id,nickname,nickname_confirmed",
      [nickname!, u.id],
    );
    return { user: rows[0] };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies.playne_session)
      await pool.query("DELETE FROM playne_auth_sessions WHERE token_hash=$1", [
        hash(req.cookies.playne_session),
      ]);
    reply.clearCookie("playne_session", options);
    return { ok: true };
  });
  app.get(
    "/api/auth/yandex/start",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const state = token(),
        verifier = token(),
        returnPath = safeReturn((req.query as any).return);
      await pool.query(
        "INSERT INTO playne_oauth_states(state_hash,browser_hash,verifier,return_path,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",
        [hash(state), browser(req, reply), verifier, returnPath],
      );
      const query = new URLSearchParams({
        response_type: "code",
        client_id: config.yandexId,
        redirect_uri: config.redirect,
        scope: "login:info",
        state,
        code_challenge: hashChallenge(verifier),
        code_challenge_method: "S256",
      });
      return reply.redirect("https://oauth.yandex.ru/authorize?" + query);
    },
  );
  app.get("/api/auth/yandex/callback", async (req, reply) => {
    const q = req.query as any;
    if (typeof q.state !== "string" || q.state.length > 100)
      return reply.redirect("/account/?auth=expired");
    const { rows } = await pool.query(
      "DELETE FROM playne_oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING *",
      [hash(q.state), browser(req, reply)],
    );
    const flow = rows[0];
    if (!flow) return reply.redirect("/account/?auth=expired");
    if (q.error || typeof q.code !== "string" || q.code.length > 2048)
      return reply.redirect(
        flow.return_path.includes("?")
          ? flow.return_path + "&auth=cancelled"
          : flow.return_path + "?auth=cancelled",
      );
    try {
      const response = await remoteFetch("https://oauth.yandex.ru/token", {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: q.code,
          client_id: config.yandexId,
          client_secret: config.yandexSecret,
          redirect_uri: config.redirect,
          code_verifier: flow.verifier,
        }),
      });
      if (!response.ok) throw new Error("Provider error");
      const tokens = (await response.json()) as any;
      if (typeof tokens.access_token !== "string")
        throw new Error("Missing token");
      const info = await remoteFetch(
        "https://login.yandex.ru/info?format=json",
        {
          signal: AbortSignal.timeout(15_000),
          headers: { Authorization: "OAuth " + tokens.access_token },
        },
      );
      const profile = (await info.json()) as any;
      if (
        !info.ok ||
        typeof profile.id !== "string" ||
        !profile.id ||
        profile.client_id !== config.yandexId
      )
        throw new Error("Invalid identity");
      const client = await pool.connect();
      let userId: string;
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          "yandex:" + profile.id,
        ]);
        const identity = await client.query(
          "SELECT user_id FROM playne_identities WHERE provider='yandex' AND subject=$1",
          [profile.id],
        );
        if (identity.rows[0]) userId = identity.rows[0].user_id;
        else {
          const created = await client.query(
            "INSERT INTO playne_users(nickname) VALUES($1) RETURNING id",
            [initialNickname(profile)],
          );
          userId = created.rows[0].id;
          await client.query(
            "INSERT INTO playne_identities(provider,subject,user_id) VALUES('yandex',$1,$2)",
            [profile.id, userId],
          );
        }
        if (req.cookies.playne_session)
          await client.query(
            "DELETE FROM playne_auth_sessions WHERE token_hash=$1",
            [hash(req.cookies.playne_session)],
          );
        const sid = token();
        await client.query(
          "INSERT INTO playne_auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",
          [hash(sid), userId],
        );
        await client.query("COMMIT");
        reply.setCookie("playne_session", sid, options);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return reply.redirect(
        flow.return_path +
          (flow.return_path.includes("?") ? "&" : "?") +
          "auth=success",
      );
    } catch {
      return reply.redirect("/account/?auth=failed");
    }
  });
  app.post(
    "/api/games",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const game = (req.body as any)?.game;
      if (!isGame(game)) failure("Неизвестная игра");
      const supportedPairIds = (req.body as any)?.supportedPairIds;
      if (
        game === "naglaz" &&
        supportedPairIds !== undefined &&
        (!Array.isArray(supportedPairIds) ||
          !supportedPairIds.every((id: unknown) => typeof id === "string"))
      )
        failure("Некорректный каталог сравнений");
      const b = browser(req, reply),
        u = await user(req);
      const recentRows = await pool.query(
        "SELECT challenge FROM playne_games WHERE game=$1 AND browser_hash=$2 ORDER BY created_at DESC LIMIT $3",
        [game, b, game === "colorfle" ? 30 : 6],
      );
      const recent = (
        game === "geo" ? [...recentRows.rows].reverse() : recentRows.rows
      ).flatMap((r) =>
        game === "naglaz"
          ? (r.challenge.pairIds ?? [])
          : game === "geo"
            ? (r.challenge.places ?? []).map((p: any) => p.id)
            : game === "colorfle"
              ? (r.challenge.targets ?? []).filter(validHSV).map(hsvToHex)
              : game === "pressure"
                ? (r.challenge.levels ?? []).map((l: any) => l.id)
                : [],
      );
      const mode =
        game === "geo" || game === "colorfle"
          ? ((req.body as any)?.mode ?? "classic")
          : "classic";
      if (!validGeoMode(mode) || (game === "colorfle" && !validShadeMode(mode)))
        failure("Неизвестный режим");
      const geoVersion = (req.body as any)?.geoRulesVersion;
      const version =
        game === "geo"
          ? geoVersion === 4
            ? 4
            : geoVersion === 3
              ? 3
              : geoVersion === 2
                ? 2
                : 1
          : scoreVersion(game);
      if (
        game === "geo" &&
        (geoCanMove(mode) || geoIsLandmarks(mode)) &&
        version < 4
      )
        failure("Обнови страницу, чтобы играть в этом режиме");
      let challenge: ReturnType<typeof makeChallenge>;
      try {
        challenge = makeChallenge(
          game,
          recent,
          game === "geo" && version === 1 ? "classic" : mode,
          game === "naglaz" ? supportedPairIds : undefined,
        );
      } catch (e) {
        if (game === "naglaz")
          failure("Обнови страницу, чтобы загрузить доступные сравнения");
        throw e;
      }
      const { rows } = await pool.query(
        "INSERT INTO playne_games(browser_hash,owner_id,game,challenge,version,mode) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          b,
          u?.id ?? null,
          game,
          JSON.stringify(challenge),
          version,
          game === "geo" && version === 1 ? "classic" : mode,
        ],
      );
      return {
        id: rows[0].id,
        game,
        version,
        challenge: publicChallenge(game, challenge),
      };
    },
  );
  // Recover only a challenge previously issued to this browser or account.
  app.post("/api/games/resume", async (req, reply) => {
    const { game, targets } = req.body as any;
    if (
      game !== "colorfle" ||
      !Array.isArray(targets) ||
      targets.length !== 5 ||
      !targets.every(validHSV)
    )
      failure("Некорректная сохранённая партия");
    const b = browser(req, reply),
      u = await user(req);
    const { rows } = await pool.query(
      "SELECT * FROM playne_games WHERE game='colorfle' AND version=$1 AND (browser_hash=$2 OR owner_id=$3) AND challenge->'targets'=$4::jsonb AND (published_at IS NOT NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1",
      [scoreVersion("colorfle"), b, u?.id ?? null, JSON.stringify(targets)],
    );
    const run = rows[0];
    if (!run)
      failure(
        "Для этой партии не найдено серверное задание. Результат сохранён в браузере.",
        404,
      );
    return {
      id: run.id,
      game: run.game,
      mode: run.mode,
      version: run.version,
      challenge: publicChallenge(run.game, run.challenge),
      answers: run.answers,
      score: run.score_units === null ? null : run.score_units / 10,
      completed: !!run.completed_at,
      published: !!run.published_at,
    };
  });
  app.get("/api/games/:id", async (req, reply) => {
    const run = geoProjection(
      await owned(req, reply, (req.params as any).id, pool),
      geoViewerVersion(req),
    );
    return {
      id: run.id,
      game: run.game,
      mode: run.mode,
      version: run.version,
      score: run.score_units === null ? null : run.score_units / 10,
      answers: run.answers,
      challenge: publicChallenge(run.game, run.challenge),
      published: !!run.published_at,
      completed: !!run.completed_at,
    };
  });
  app.post("/api/games/:id/replace", async (req, reply) => {
    const index = (req.body as any)?.index;
    if (!Number.isInteger(index) || index < 0 || index > 4)
      failure("Некорректный раунд");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const run = await owned(req, reply, (req.params as any).id, c, true);
      if (
        run.game !== "geo" ||
        run.completed_at ||
        run.answers.length !== index ||
        run.challenge.panoramas[index]
      )
        failure("Панораму нельзя изменить", 409);
      const excluded = run.challenge.unavailable ?? [];
      if (excluded.length >= 12) failure("Не удалось подобрать панораму", 503);
      excluded.push(run.challenge.places[index].id);
      const places = geoCatalog(run.mode).filter(
        (p) =>
          p.region === run.challenge.places[index].region &&
          !excluded.includes(p.id) &&
          !run.challenge.places.some(
            (other: any, i: number) =>
              i !== index &&
              (p.id === other.id || p.countryCode === other.countryCode),
          ),
      );
      const place = places[Math.floor(Math.random() * places.length)];
      if (!place) failure("Нет доступных мест", 503);
      run.challenge.places[index] = place;
      run.challenge.unavailable = excluded;
      delete run.challenge.panoramas[index];
      await c.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
        JSON.stringify(run.challenge),
        run.id,
      ]);
      await c.query("COMMIT");
      return { place };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post(
    "/api/games/:id/panorama",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!config.googleKey)
        failure("Серверная проверка панорам временно недоступна", 503);
      const body = req.body as any;
      if (
        !Number.isInteger(body?.index) ||
        body.index < 0 ||
        body.index > 4 ||
        typeof body.pano !== "string" ||
        body.pano.length > 256 ||
        !body.pano
      )
        failure("Некорректная панорама");
      const run = await owned(req, reply, (req.params as any).id, pool);
      if (
        run.game !== "geo" ||
        run.completed_at ||
        run.answers.length !== body.index
      )
        failure("Панораму нельзя изменить", 409);
      if (run.challenge.panoramas[body.index]) {
        if (run.challenge.panoramas[body.index].pano !== body.pano)
          failure("Панораму нельзя изменить", 409);
        return {
          verified: true,
          actual: run.challenge.panoramas[body.index].actual,
        };
      }
      let metadata: any;
      try {
        const r = await remoteFetch(
          "https://maps.googleapis.com/maps/api/streetview/metadata?" +
            new URLSearchParams({ pano: body.pano, key: config.googleKey }),
          { signal: AbortSignal.timeout(12_000) },
        );
        metadata = await r.json();
      } catch {
        failure("Не удалось проверить панораму", 503);
      }
      if (
        metadata.status !== "OK" ||
        !metadata.location ||
        !validPoint(metadata.location) ||
        !geoPanoramaFits(run.challenge.places[body.index], metadata.location)
      )
        failure("Панорама не подходит к выбранному месту", 400);
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const locked = await owned(req, reply, run.id, c, true);
        if (
          locked.answers.length !== body.index ||
          locked.completed_at ||
          !geoPanoramaFits(
            locked.challenge.places[body.index],
            metadata.location,
          )
        )
          failure("Раунд уже завершён", 409);
        const existing = locked.challenge.panoramas[body.index];
        if (existing && existing.pano !== body.pano)
          failure("Панорама уже выбрана", 409);
        locked.challenge.panoramas[body.index] = {
          pano: body.pano,
          actual: metadata.location,
        };
        await c.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
          JSON.stringify(locked.challenge),
          run.id,
        ]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      return { verified: true, actual: metadata.location };
    },
  );
  app.post("/api/games/:id/ready", async (req, reply) => {
    const index = (req.body as any)?.index;
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const run = await owned(req, reply, (req.params as any).id, c, true);
      if (
        !(
          (run.game === "geo" && geoIsTimed(run.mode)) ||
          (run.game === "colorfle" && run.mode === "timed")
        ) ||
        !Number.isInteger(index) ||
        index !== run.answers.length ||
        run.completed_at
      )
        failure("Раунд недоступен", 409);
      if (run.game === "colorfle") run.challenge.timers ??= {};
      const pano =
        run.game === "colorfle"
          ? (run.challenge.timers[index] ??= {})
          : run.challenge.panoramas?.[index];
      if (!pano) failure("Панорама не проверена", 409);
      pano.deadline ??=
        Date.now() +
        (run.game === "colorfle" ? SHADE_TIME_LIMIT_MS : GEO_TIME_LIMIT_MS);
      await c.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
        JSON.stringify(run.challenge),
        run.id,
      ]);
      await c.query("COMMIT");
      return { deadline: pano.deadline, serverNow: Date.now() };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post("/api/games/:id/choice", async (req, reply) => {
    const body = req.body as any;
    if (
      !Number.isInteger(body?.index) ||
      body.index < 0 ||
      body.index > 4 ||
      !validHSV(body?.choice)
    )
      failure("Некорректный цвет");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const run = await owned(req, reply, (req.params as any).id, c, true);
      const timer = run.challenge.timers?.[body.index];
      if (
        run.game !== "colorfle" ||
        run.mode !== "timed" ||
        run.completed_at ||
        run.answers.length !== body.index ||
        !timer?.deadline ||
        Date.now() >= timer.deadline
      )
        failure("Время истекло или раунд недоступен", 409);
      timer.choice = body.choice;
      await c.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
        JSON.stringify(run.challenge),
        run.id,
      ]);
      await c.query("COMMIT");
      return { ok: true };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post("/api/games/:id/pin", async (req, reply) => {
    const body = req.body as any;
    if (
      !Number.isInteger(body?.index) ||
      !body?.guess ||
      !validPoint(body.guess)
    )
      failure("Некорректная точка");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const run = await owned(req, reply, (req.params as any).id, c, true);
      if (
        run.game !== "geo" ||
        !geoIsTimed(run.mode) ||
        run.answers.length !== body.index ||
        run.completed_at
      )
        failure("Раунд недоступен", 409);
      const pano = run.challenge.panoramas?.[body.index];
      if (!pano?.deadline || Date.now() >= pano.deadline)
        failure("Время истекло", 409);
      pano.pin = { lat: body.guess.lat, lng: body.guess.lng };
      await c.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
        JSON.stringify(run.challenge),
        run.id,
      ]);
      await c.query("COMMIT");
      return { ok: true };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post("/api/games/:id/answers", async (req, reply) => {
    const input = req.body as any;
    if (!Number.isInteger(input?.index) || input.index < 0 || input.index > 4)
      failure("Некорректный раунд");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const run = await owned(req, reply, (req.params as any).id, c, true);
      // Idempotent retry returns the originally accepted answer, never changes it.
      if (input.index < run.answers.length) {
        await c.query("COMMIT");
        return {
          answer: run.answers[input.index],
          completed: !!run.completed_at,
          published: !!run.published_at,
          score: run.score_units === null ? null : run.score_units / 10,
        };
      }
      if (run.completed_at || input.index !== run.answers.length)
        failure("Ответь на раунды по порядку", 409);
      if (run.game === "pressure") {
        const rounds = input.answer?.rounds;
        if (
          !Array.isArray(rounds) ||
          rounds.some((r: any) => !Number.isFinite(r?.elapsed))
        )
          failure("Некорректная попытка");
        const elapsed = rounds.reduce(
          (sum: number, r: any) => sum + r.elapsed,
          0,
        );
        if (elapsed > Date.now() - new Date(run.created_at).getTime() + 2000)
          failure("Время попытки не совпадает с серверным");
      }
      let answer: any;
      try {
        answer = validateAnswer(
          run.game,
          run.challenge,
          input.index,
          input.answer,
          Date.now(),
          run.version,
        );
      } catch (e) {
        failure((e as Error).message);
      }
      const answers = [...run.answers, answer],
        complete =
          answers.length ===
          (["circle", "pressure"].includes(run.game) ? 1 : 5),
        units = complete ? scoreUnits(answers) : null;
      const viewer = complete ? await user(req, c) : null;
      const publish = !!viewer && (!run.owner_id || run.owner_id === viewer.id);
      const savedAnswers =
        publish && run.game === "geo"
          ? answers.map(({ actual, guess, ...answer }: any) => answer)
          : answers;
      const savedChallenge =
        publish && run.game === "geo"
          ? { places: run.challenge.places, mode: run.mode }
          : run.challenge;
      await c.query(
        "UPDATE playne_games SET answers=$1,score_units=$2,completed_at=CASE WHEN $3 THEN now() ELSE NULL END,owner_id=CASE WHEN $5 THEN $6 ELSE owner_id END,published_at=CASE WHEN $5 THEN coalesce(published_at,now()) ELSE published_at END,challenge=$7 WHERE id=$4",
        [
          JSON.stringify(savedAnswers),
          units,
          complete,
          run.id,
          publish,
          viewer?.id ?? null,
          JSON.stringify(savedChallenge),
        ],
      );
      await c.query("COMMIT");
      return {
        answer,
        completed: complete,
        published: publish || !!run.published_at,
        score: units === null ? null : units / 10,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.post("/api/games/:id/publish", async (req, reply) => {
    const u = await requireUser(req);
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const run = await owned(req, reply, (req.params as any).id, c, true);
      if (!run.completed_at) failure("Сначала закончи партию", 409);
      if (run.owner_id && run.owner_id !== u.id)
        failure("Эта партия принадлежит другому аккаунту", 403);
      const answers =
        run.game === "geo"
          ? run.answers.map(({ actual, guess, ...a }: any) => a)
          : run.answers;
      const challenge =
        run.game === "geo"
          ? { places: run.challenge.places, mode: run.mode }
          : run.challenge;
      await c.query(
        "UPDATE playne_games SET owner_id=$1,published_at=coalesce(published_at,now()),answers=$2,challenge=$3 WHERE id=$4",
        [u.id, JSON.stringify(answers), JSON.stringify(challenge), run.id],
      );
      await c.query("COMMIT");
      return {
        ok: true,
        score: geoProjection(run, geoViewerVersion(req)).score_units / 10,
      };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  });
  app.get("/api/leaderboard", async (req, reply) => {
    const q = req.query as any;
    if (!isGame(q.game)) failure("Неизвестная игра");
    const period = q.period ?? "all";
    if (!["all", "week"].includes(period)) failure("Неизвестный период");
    const page = Number(q.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      failure("Некорректная страница");
    const u = await user(req);
    const mode =
      q.game === "geo" || q.game === "colorfle"
        ? (q.mode ?? "classic")
        : "classic";
    if (!validGeoMode(mode) || (q.game === "colorfle" && !validShadeMode(mode)))
      failure("Неизвестный режим");
    const base = `WITH eligible AS (SELECT owner_id,version,answers,completed_at,CASE WHEN $2=4 THEN ${GEO_V4_UNITS_SQL} WHEN $2=3 THEN ${GEO_V3_UNITS_SQL} ELSE score_units END AS score_units FROM playne_games WHERE game=$1 AND (version=$2 OR ($1='geo' AND $2=3 AND version=2) OR ($1='geo' AND $2=4 AND version IN(2,3))) AND mode=$4 AND published_at IS NOT NULL AND ($3='all' OR completed_at >= date_trunc('week',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')), best AS (SELECT DISTINCT ON(owner_id) owner_id,version,score_units,answers,completed_at FROM eligible ORDER BY owner_id,score_units DESC,completed_at ASC), ranked AS (SELECT u.id,u.nickname,b.version,b.score_units/10.0 AS score,b.answers,b.completed_at,rank() OVER(ORDER BY b.score_units DESC) AS place FROM best b JOIN playne_users u ON u.id=b.owner_id)`;
    const requestedVersion =
      q.game === "geo" ? geoViewerVersion(req, q) : scoreVersion(q.game);
    const params = [q.game, requestedVersion, period, mode];
    const [entries, count, mine] = await Promise.all([
      pool.query(
        base +
          " SELECT id,nickname,score,place,answers,version FROM ranked ORDER BY score DESC,completed_at,id LIMIT 25 OFFSET $5",
        [...params, (page - 1) * 25],
      ),
      pool.query(base + " SELECT count(*)::int AS count FROM ranked", params),
      u
        ? pool.query(
            base +
              " SELECT id,nickname,score,place,answers,version FROM ranked WHERE id=$5",
            [...params, u.id],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    const project = (r: any) => ({
      nickname: r.nickname,
      score: Number(r.score),
      place: Number(r.place),
      rounds: geoProjection(
        {
          game: q.game,
          version: r.version,
          answers: r.answers,
          score_units: null,
        },
        requestedVersion,
      ).answers.map((a: any) => a.score),
      isMe: r.id === u?.id,
    });
    return {
      game: q.game,
      mode,
      period,
      page,
      total: count.rows[0].count,
      entries: entries.rows.map(project),
      mine: mine.rows[0] ? project(mine.rows[0]) : null,
    };
  });
  app.get("/api/account", async (req) => {
    const u = await requireUser(req);
    const rows = await pool.query(
      "SELECT id,game,mode,version,score_units,answers,completed_at FROM playne_games WHERE owner_id=$1 AND published_at IS NOT NULL ORDER BY completed_at DESC LIMIT 30",
      [u.id],
    );
    const best = await pool.query(
      `SELECT game,mode,max(CASE WHEN $3=4 THEN ${GEO_V4_UNITS_SQL} WHEN $3=3 THEN ${GEO_V3_UNITS_SQL} ELSE score_units END)/10.0 AS score FROM playne_games WHERE owner_id=$1 AND published_at IS NOT NULL AND ((game='geo' AND (version=$3 OR ($3=3 AND version=2) OR ($3=4 AND version IN(2,3)))) OR (game='colorfle' AND version=$4) OR (game NOT IN('geo','colorfle') AND version=$2)) GROUP BY game,mode`,
      [u.id, SCORE_VERSION, geoViewerVersion(req), SHADE_SCORE_VERSION],
    );
    return {
      user: u,
      best: best.rows.map((r) => ({ ...r, score: Number(r.score) })),
      history: rows.rows.map((r) => {
        const { answers, score_units, ...rest } = geoProjection(
          r,
          geoViewerVersion(req),
        );
        return { ...rest, score: score_units / 10 };
      }),
    };
  });
  app.post("/api/account/delete", async (req, reply) => {
    const u = await requireUser(req);
    if ((req.body as any)?.confirmation !== "delete")
      failure("Подтверди удаление");
    await pool.query("DELETE FROM playne_users WHERE id=$1", [u.id]);
    reply.clearCookie("playne_session", options);
    return { ok: true };
  });
  async function cleanup() {
    await pool.query("DELETE FROM playne_auth_sessions WHERE expires_at<now()");
    await pool.query("DELETE FROM playne_oauth_states WHERE expires_at<now()");
    await pool.query(
      "DELETE FROM playne_games WHERE published_at IS NULL AND expires_at<now()",
    );
  }
  const timer = setInterval(
    () => {
      void cleanup().catch(() => console.error("Playne cleanup failed"));
    },
    60 * 60 * 1000,
  );
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
  await cleanup();
  return app;
}
const hashChallenge = (v: string) =>
  createHash("sha256").update(v).digest("base64url");
