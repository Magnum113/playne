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
import { LEADERBOARD_SQL } from "./leaderboard";
import { overallLeaderboard } from "./overall";
import { improvesPersonalRecord } from "./personal-record";
import { registerPlayProgressRoutes } from "./play-progress";
import {
  privateComparison,
  registerChallengeRoutes,
  resolveChallengeStart,
} from "./challenges";
import { registerBrainInsightRoutes } from "./brain-insights";
import { hintLinePath, lineMoscowDate } from "../src/line";
import {
  isBrainGame,
  brainDailyPack,
  privateBrain,
  claimBrainDay,
  registerBrainRoutes,
} from "./brain";
import { emailConsentPurpose } from "../src/emailConsent";
import {
  lockPublications,
  notificationSnapshot,
  queueDisplacements,
  requestEmailSubscription,
  mailConfigured,
  normalizeEmail,
  type EmailConfig,
} from "./email-core";
import {
  registerEmailRoutes,
  recordEmailGameStart,
  recordEmailGameCompletion,
} from "./email-routes";
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
const privateRun = (run: any) => privateBrain(run) || privateComparison(run);
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
  email?: EmailConfig;
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
    routerOptions: { maxParamLength: 1800 },
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
  const emailConfig: EmailConfig = config.email ?? {
    origin: config.origin,
    secret: "",
  };
  const jsonParser = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      const text = typeof body === "string" ? body : body.toString("utf8");
      if (req.url.split("?")[0] === "/api/email/provider")
        (req as any).emailRawBody = text;
      jsonParser(req, text, done);
    },
  );
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) =>
      done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
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
      req.headers.origin !== config.origin &&
      !(
        req.headers.origin === undefined &&
        (req.routeOptions.url === "/api/email/provider" ||
          req.routeOptions.url === "/api/email/unsubscribe/:token")
      )
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
      req.cookies.playne_guest = value;
    }
    reply.setCookie("playne_guest", value, { ...options, maxAge: 365 * 86400 });
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
    if (
      !game.published_at &&
      !(privateRun(game) && game.owner_id && game.completed_at) &&
      new Date(game.expires_at).getTime() < Date.now()
    )
      failure("Срок сохранения этой партии истёк.", 410);
    return game;
  }
  // A guest result survives login, but a second attempt at an already reserved
  // account/day becomes practice rather than a second ranked daily result.
  async function claimLineDay(client: any, run: any, ownerId: string) {
    if (run.game !== "line" || run.mode !== "classic") return;
    const day = run.challenge.day;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "line:account:" + ownerId + ":" + day,
    ]);
    const prior = await client.query(
      "SELECT run_id FROM playne_line_days WHERE day=$1 AND owner_id=$2",
      [day, ownerId],
    );
    if (prior.rows[0] && prior.rows[0].run_id !== run.id) {
      run.mode = "practice";
      run.challenge.mode = "practice";
      await client.query(
        "UPDATE playne_games SET mode='practice',challenge=$1 WHERE id=$2",
        [JSON.stringify(run.challenge), run.id],
      );
    } else if (!prior.rows[0]) {
      await client.query(
        "UPDATE playne_line_days SET owner_id=$1 WHERE day=$3 AND browser_hash=(SELECT browser_hash FROM playne_line_days WHERE run_id=$2 ORDER BY created_at,browser_hash LIMIT 1)",
        [ownerId, run.id, day],
      );
    }
  }
  await registerEmailRoutes(app, pool, emailConfig, requireUser);
  await registerBrainRoutes(app, pool, owned, failure, browser, user);
  await registerBrainInsightRoutes(app, pool, browser, user);
  await registerPlayProgressRoutes(app, pool, browser, user);
  await registerChallengeRoutes(app, pool, {
    origin: config.origin,
    browser,
    user,
  });
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { ok: true, revision: config.revision };
  });
  app.get("/api/me", async (req, reply) => {
    const b = browser(req, reply);
    const signed = await user(req);
    const trials = await pool.query(
      "SELECT t.game,t.run_id AS id,t.consumed_at,g.mode,g.score_units,g.completed_at,g.published_at,g.owner_id FROM playne_guest_trials t LEFT JOIN playne_games g ON g.id=t.run_id WHERE t.browser_hash=$1",
      [b],
    );
    return {
      user: signed,
      emailSignupAvailable:
        !!emailConfig.yandexEmail && mailConfigured(emailConfig),
      trials: Object.fromEntries(
        trials.rows.map((r) => [
          r.game,
          {
            id: r.id,
            mode: r.mode,
            completed: !!r.consumed_at || !!r.completed_at || !r.id,
            published: !!r.published_at && r.owner_id === signed?.id,
            score: r.score_units === null ? null : r.score_units / 10,
          },
        ]),
      ),
    };
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
  async function startYandex(req: FastifyRequest, reply: any, optIn = false) {
    const state = token(),
      verifier = token();
    const input = (req.method === "POST" ? req.body : req.query) as any;
    const returnPath = safeReturn(input?.return);
    await pool.query(
      "INSERT INTO playne_oauth_states(state_hash,browser_hash,verifier,return_path,expires_at,email_opt_in,email_consent_version) VALUES($1,$2,$3,$4,now()+interval '10 minutes',$5,$6)",
      [
        hash(state),
        browser(req, reply),
        verifier,
        returnPath,
        optIn,
        optIn ? input.consentVersion : null,
      ],
    );
    const query = new URLSearchParams({
      response_type: "code",
      client_id: config.yandexId,
      redirect_uri: config.redirect,
      scope: "login:info login:email",
      state,
      code_challenge: hashChallenge(verifier),
      code_challenge_method: "S256",
    });
    return "https://oauth.yandex.ru/authorize?" + query;
  }
  app.post(
    "/api/auth/yandex/start",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = req.body as any;
      const optIn = body?.emailOptIn === true;
      if (
        optIn &&
        (!emailConsentPurpose(body.consentVersion) || body.dataConsent !== true)
      )
        failure("Подтверди согласие на письма и обработку адреса.");
      if (optIn && (!emailConfig.yandexEmail || !mailConfigured(emailConfig)))
        failure("Подписка пока недоступна. Можно войти без неё.", 503);
      return { url: await startYandex(req, reply, optIn) };
    },
  );
  app.get(
    "/api/auth/yandex/start",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req, reply) => {
      return reply.redirect(await startYandex(req, reply));
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
        await lockPublications(client);
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
        // Store the provider's address independently of newsletter consent.
        // A malformed/missing optional profile field must not break sign-in.
        let providerEmail: string | null = null;
        try {
          providerEmail = normalizeEmail(profile.default_email);
        } catch {
          // Some Yandex profiles do not have an email address.
        }
        await client.query(
          "UPDATE playne_identities SET provider_email=$1,email_received_at=CASE WHEN $1::text IS NULL THEN NULL ELSE now() END WHERE provider='yandex' AND subject=$2 AND user_id=$3",
          [providerEmail, profile.id, userId],
        );
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
        const lineTrials = await client.query(
          "SELECT g.* FROM playne_games g JOIN playne_guest_trials t ON t.run_id=g.id WHERE t.browser_hash=$1 AND g.game IN('line','flash','rotate','slide','dispatch') AND (g.owner_id IS NULL OR g.owner_id=$2) FOR UPDATE OF g",
          [flow.browser_hash, userId],
        );
        for (const trial of lineTrials.rows) {
          await claimLineDay(client, trial, userId);
          await claimBrainDay(client, trial, userId);
          await client.query(
            "UPDATE playne_games SET owner_id=$1 WHERE id=$2",
            [userId, trial.id],
          );
        }
        // A guest can finish several games before signing in. Snapshot each board once.
        const claims = (
          await client.query(
            `SELECT g.id,g.game,g.mode FROM playne_games g JOIN playne_guest_trials t ON t.run_id=g.id WHERE t.browser_hash=$1 AND g.completed_at IS NOT NULL AND g.published_at IS NULL AND NOT(g.game IN('flash','rotate','slide','dispatch') AND g.mode='practice') AND coalesce(g.challenge->>'comparison','false')<>'true' AND (g.owner_id IS NULL OR g.owner_id=$2) ORDER BY g.game,g.mode,g.id`,
            [flow.browser_hash, userId],
          )
        ).rows;
        const boards = new Map<
          string,
          { game: any; mode: string; before: any[]; cause: string }
        >();
        for (const claim of claims) {
          const key = claim.game + ":" + claim.mode;
          if (!boards.has(key))
            boards.set(key, {
              game: claim.game,
              mode: claim.mode,
              before: await notificationSnapshot(
                client,
                claim.game,
                claim.mode,
              ),
              cause: claim.id,
            });
        }
        await client.query(
          `UPDATE playne_games g SET owner_id=$1,published_at=CASE WHEN (g.game IN('flash','rotate','slide','dispatch') AND g.mode='practice') OR coalesce(g.challenge->>'comparison','false')='true' THEN NULL ELSE coalesce(g.published_at,now()) END,
          answers=CASE WHEN g.game='geo' THEN (SELECT jsonb_agg(a - 'actual' - 'guess') FROM jsonb_array_elements(g.answers) a) ELSE g.answers END,
          challenge=CASE WHEN g.game='geo' THEN jsonb_build_object('places',g.challenge->'places','mode',g.mode) ELSE g.challenge END
          FROM playne_guest_trials t WHERE t.run_id=g.id AND t.browser_hash=$2 AND g.completed_at IS NOT NULL AND (g.owner_id IS NULL OR g.owner_id=$1)`,
          [userId, flow.browser_hash],
        );
        for (const board of boards.values())
          await queueDisplacements(
            client,
            board.before,
            userId,
            board.cause,
            board.game,
            board.mode,
          );
        for (const claim of claims)
          await recordEmailGameCompletion(client, claim.id);
        if (
          flow.email_opt_in &&
          emailConsentPurpose(flow.email_consent_version)
        ) {
          // Mail setup must never roll back a successful sign-in or saved game.
          await client.query("SAVEPOINT email_signup");
          try {
            await requestEmailSubscription(
              client,
              emailConfig,
              userId,
              profile.default_email ?? null,
              "yandex",
              Date.now(),
              flow.email_consent_version,
            );
            await client.query("RELEASE SAVEPOINT email_signup");
          } catch {
            await client.query("ROLLBACK TO SAVEPOINT email_signup");
            await client.query("RELEASE SAVEPOINT email_signup");
          }
        }
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
      const challengeToken = (req.body as any)?.challenge;
      const retryFrom = (req.body as any)?.retry;
      if (
        retryFrom !== undefined &&
        (!uuid(retryFrom) || challengeToken === undefined)
      )
        failure("Некорректная повторная попытка", 400);
      let mode =
        challengeToken !== undefined
          ? "classic"
          : game === "geo" ||
              game === "colorfle" ||
              game === "line" ||
              isBrainGame(game)
            ? ((req.body as any)?.mode ?? "classic")
            : "classic";
      if (
        game === "line" || isBrainGame(game)
          ? !["classic", "practice"].includes(mode)
          : !validGeoMode(mode) ||
            (game === "colorfle" && !validShadeMode(mode))
      )
        failure("Неизвестный режим");
      const lineDay =
        game === "line" || isBrainGame(game) ? lineMoscowDate() : undefined;
      let difficulty =
        challengeToken !== undefined
          ? 1
          : ((req.body as any)?.difficulty ?? (req.body as any)?.level ?? 1);
      if (
        isBrainGame(game) &&
        mode === "practice" &&
        (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 3)
      )
        failure("Неизвестная сложность");
      const b = browser(req, reply),
        u = await user(req);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const shared =
          challengeToken === undefined
            ? null
            : await resolveChallengeStart(
                client,
                challengeToken,
                game,
                config.origin,
                lineDay,
                retryFrom !== undefined,
              );
        if (shared) {
          mode = shared.mode;
          if (shared.kind === "comparison")
            difficulty = shared.challenge.difficulty ?? 1;
        }
        if (retryFrom !== undefined) {
          if (shared?.kind !== "comparison") failure("Вызов недоступен", 404);
          const previous = (
            await client.query("SELECT * FROM playne_games WHERE id=$1", [
              retryFrom,
            ])
          ).rows[0];
          const manages =
            previous &&
            (previous.owner_id
              ? previous.owner_id === u?.id
              : previous.browser_hash === b);
          const matches =
            previous &&
            (previous.challenge.comparisonToken === challengeToken ||
              (["line", "flash", "rotate", "slide", "dispatch"].includes(
                game,
              ) &&
                previous.mode === "classic" &&
                previous.challenge.day === shared.reference.day));
          if (
            !manages ||
            previous.game !== game ||
            !previous.completed_at ||
            !matches
          )
            failure("Результат вызова не найден", 404);
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `challenge-retry:${u?.id ?? b}:${retryFrom}`,
          ]);
          let run = (
            await client.query(
              "SELECT * FROM playne_games WHERE game=$1 AND (owner_id=$2 OR (owner_id IS NULL AND browser_hash=$3)) AND challenge->>'comparisonToken'=$4 AND challenge->>'retryOf'=$5 AND (completed_at IS NOT NULL OR expires_at>now()) ORDER BY created_at LIMIT 1",
              [game, u?.id ?? null, b, challengeToken, retryFrom],
            )
          ).rows[0];
          if (!run)
            run = (
              await client.query(
                "INSERT INTO playne_games(browser_hash,owner_id,game,challenge,version,mode,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '365 days') RETURNING *",
                [
                  b,
                  u?.id ?? null,
                  game,
                  JSON.stringify({ ...shared.challenge, retryOf: retryFrom }),
                  shared.version,
                  shared.mode,
                ],
              )
            ).rows[0];
          await client.query("COMMIT");
          return {
            id: run.id,
            game,
            version: run.version,
            mode: run.mode,
            challenge: publicChallenge(game, run.challenge),
            answers: run.answers,
            completed: !!run.completed_at,
            published: false,
            private: true,
            score: run.score_units === null ? null : run.score_units / 10,
          };
        }
        // Claims/publication take this lock before the run and account/day locks.
        // Daily starts use the same order, including adoption of a guest attempt.
        if (isBrainGame(game) && mode === "classic")
          await lockPublications(client);
        if (!u) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            "trial:" + b + ":" + game,
          ]);
          const trial = await client.query(
            "SELECT t.*,g.completed_at FROM playne_guest_trials t LEFT JOIN playne_games g ON g.id=t.run_id WHERE t.browser_hash=$1 AND t.game=$2",
            [b, game],
          );
          if (trial.rows[0]) {
            const t = trial.rows[0];
            if (t.consumed_at || t.completed_at || !t.run_id)
              failure(
                "Первая партия уже сыграна. Войди через Яндекс, чтобы играть дальше.",
                403,
              );
            const existing = await owned(req, reply, t.run_id, client);
            if (
              shared &&
              !(shared.kind === "daily"
                ? existing.mode === "classic" &&
                  existing.challenge.day === lineDay &&
                  !privateComparison(existing)
                : privateComparison(existing) &&
                  existing.challenge.comparisonToken === challengeToken)
            )
              failure(
                "В этом браузере уже начата другая пробная партия. Закончи её или войди, чтобы принять вызов.",
                409,
              );
            await client.query("COMMIT");
            return {
              id: existing.id,
              game,
              version: existing.version,
              mode: existing.mode,
              challenge: publicChallenge(game, existing.challenge),
              answers: existing.answers,
              completed: false,
              ...(isBrainGame(game) || privateComparison(existing)
                ? { private: privateRun(existing) }
                : {}),
            };
          }
        }
        if (shared?.kind === "comparison" && u) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
            `challenge-run:${u.id}:${game}:${challengeToken}`,
          ]);
          const previous = await client.query(
            "SELECT id FROM playne_games WHERE owner_id=$1 AND game=$2 AND challenge->>'comparison'='true' AND challenge->>'comparisonToken'=$3 AND (completed_at IS NOT NULL OR expires_at>now()) ORDER BY created_at,id LIMIT 1",
            [u.id, game, challengeToken],
          );
          if (previous.rows[0]) {
            const existing = await owned(
              req,
              reply,
              previous.rows[0].id,
              client,
              true,
            );
            await client.query("COMMIT");
            return {
              id: existing.id,
              game,
              version: existing.version,
              mode: existing.mode,
              challenge: publicChallenge(game, existing.challenge),
              answers: existing.answers,
              completed: !!existing.completed_at,
              published: false,
              private: true,
              score:
                existing.score_units === null
                  ? null
                  : existing.score_units / 10,
            };
          }
        }
        if ((game === "line" || isBrainGame(game)) && mode === "classic") {
          const day = lineDay!;
          const prefix = game === "line" ? "line" : "brain";
          const keyGame = game === "line" ? "" : ":" + game;
          const locks = [`${prefix}:browser:${b}${keyGame}:${day}`];
          if (u) locks.push(`${prefix}:account:${u.id}${keyGame}:${day}`);
          for (const key of locks.sort())
            await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
              key,
            ]);
          const reservation = await client.query(
            `SELECT run_id FROM ${game === "line" ? "playne_line_days" : "playne_brain_days"} WHERE day=$1 ${game === "line" ? "" : "AND game=$4"} AND (browser_hash=$2 OR owner_id=$3) ORDER BY (owner_id=$3) DESC NULLS LAST LIMIT 1`,
            game === "line"
              ? [day, b, u?.id ?? null]
              : [day, b, u?.id ?? null, game],
          );
          if (reservation.rows[0]) {
            const existingId = reservation.rows[0].run_id;
            if (!existingId)
              failure("Задача дня уже сыграна. Выбери практику.", 409);
            const existing = await owned(req, reply, existingId, client, true);
            if (existing.owner_id && existing.owner_id !== u?.id)
              failure(
                "Задача дня в этом браузере уже сыграна. Выбери практику.",
                403,
              );
            if (u && !existing.owner_id) {
              await claimLineDay(client, existing, u.id);
              await claimBrainDay(client, existing, u.id);
              await client.query(
                "UPDATE playne_games SET owner_id=$1 WHERE id=$2",
                [u.id, existing.id],
              );
            }
            if (game === "line")
              await client.query(
                "INSERT INTO playne_line_days(day,browser_hash,owner_id,run_id) VALUES($1,$2,NULL,$3) ON CONFLICT(day,browser_hash) DO NOTHING",
                [day, b, existing.id],
              );
            else
              await client.query(
                "INSERT INTO playne_brain_days(day,game,browser_hash,owner_id,run_id) VALUES($1,$2,$3,NULL,$4) ON CONFLICT(day,game,browser_hash) DO NOTHING",
                [day, game, b, existing.id],
              );
            await client.query("COMMIT");
            return {
              id: existing.id,
              game,
              version: existing.version,
              mode: existing.mode,
              challenge: publicChallenge(game, existing.challenge),
              answers: existing.answers,
              completed: !!existing.completed_at,
              published: !!existing.published_at,
              ...(isBrainGame(game) ? { private: privateRun(existing) } : {}),
              score:
                existing.score_units === null
                  ? null
                  : existing.score_units / 10,
            };
          }
        }
        const recentRows = await client.query(
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
        const geoVersion = (req.body as any)?.geoRulesVersion;
        const version =
          shared?.kind === "comparison"
            ? shared.version
            : game === "geo"
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
        const brainPack =
          isBrainGame(game) && shared?.kind !== "comparison"
            ? await brainDailyPack(client, game, lineDay!)
            : undefined;
        let challenge: ReturnType<typeof makeChallenge>;
        try {
          challenge =
            shared?.kind === "comparison"
              ? shared.challenge
              : makeChallenge(
                  game,
                  recent,
                  game === "geo" && version === 1 ? "classic" : mode,
                  game === "naglaz" ? supportedPairIds : undefined,
                  (req.body as any)?.pressureRulesVersion,
                  lineDay,
                  difficulty,
                  brainPack,
                );
        } catch (e) {
          if (game === "naglaz")
            failure("Обнови страницу, чтобы загрузить доступные сравнения");
          throw e;
        }
        const { rows } = await client.query(
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
        if (game === "line" && mode === "classic")
          await client.query(
            "INSERT INTO playne_line_days(day,browser_hash,owner_id,run_id) VALUES($1,$2,$3,$4)",
            [(challenge as any).day, b, u?.id ?? null, rows[0].id],
          );
        if (isBrainGame(game) && mode === "classic")
          await client.query(
            "INSERT INTO playne_brain_days(day,game,browser_hash,owner_id,run_id) VALUES($1,$2,$3,$4,$5)",
            [(challenge as any).day, game, b, u?.id ?? null, rows[0].id],
          );
        if (!u) {
          await client.query(
            "INSERT INTO playne_guest_trials(browser_hash,game,run_id) VALUES($1,$2,$3)",
            [b, game, rows[0].id],
          );
          await client.query(
            "UPDATE playne_games SET expires_at=now()+interval '365 days' WHERE id=$1",
            [rows[0].id],
          );
        }
        await recordEmailGameStart(client, emailConfig, req, rows[0].id);
        await client.query("COMMIT");
        return {
          id: rows[0].id,
          game,
          version,
          mode: game === "geo" && version === 1 ? "classic" : mode,
          challenge: publicChallenge(game, challenge),
          answers: [],
          ...(isBrainGame(game) || privateComparison({ challenge })
            ? { private: privateRun({ game, mode, challenge }) }
            : {}),
        };
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
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
      ...(isBrainGame(run.game) || privateComparison(run)
        ? { private: privateRun(run) }
        : {}),
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
        privateComparison(run) ||
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
        if (existing) {
          await c.query("COMMIT");
          return { verified: true, actual: existing.actual };
        }
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
  for (const action of ["start", "hint"] as const)
    app.post(`/api/games/:id/line/${action}`, async (req, reply) => {
      const input = req.body as any;
      if (!Number.isInteger(input?.index) || input.index < 0 || input.index > 4)
        failure("Некорректный раунд");
      if (
        action === "hint" &&
        (!uuid(input.requestId) ||
          !Array.isArray(input.path) ||
          input.path.length > 36 ||
          !input.path.every(Number.isInteger))
      )
        failure("Некорректная подсказка");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const run = await owned(
          req,
          reply,
          (req.params as any).id,
          client,
          true,
        );
        if (
          run.game !== "line" ||
          run.completed_at ||
          run.answers.length !== input.index
        )
          failure("Сначала закончи текущий раунд", 409);
        const serverNow = Date.now();
        const rounds = run.challenge.rounds;
        if (action === "start") {
          rounds[input.index] ??= {
            startedAt: serverNow,
            hints: 0,
            requests: {},
          };
        } else {
          const round = rounds[input.index];
          if (!round) failure("Сначала начни раунд", 409);
          const previous = round.requests[input.requestId];
          if (previous) {
            await client.query("COMMIT");
            return {
              ...previous,
              hints: round.hints,
              startedAt: round.startedAt,
              serverNow,
            };
          }
          if (round.hints >= 36)
            failure("Все подсказки этого раунда уже использованы", 409);
          const hint = hintLinePath(
            run.challenge.puzzles[input.index],
            input.path,
          );
          round.hints++;
          round.requests[input.requestId] = hint;
          await client.query(
            "UPDATE playne_games SET challenge=$1 WHERE id=$2",
            [JSON.stringify(run.challenge), run.id],
          );
          await client.query("COMMIT");
          return {
            ...hint,
            hints: round.hints,
            startedAt: round.startedAt,
            serverNow,
          };
        }
        await client.query("UPDATE playne_games SET challenge=$1 WHERE id=$2", [
          JSON.stringify(run.challenge),
          run.id,
        ]);
        await client.query("COMMIT");
        const round = rounds[input.index];
        return { startedAt: round.startedAt, hints: round.hints, serverNow };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    });
  app.post("/api/games/:id/answers", async (req, reply) => {
    const input = req.body as any;
    if (!Number.isInteger(input?.index) || input.index < 0 || input.index > 4)
      failure("Некорректный раунд");
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await lockPublications(c);
      const run = await owned(req, reply, (req.params as any).id, c, true);
      // Idempotent retry returns the originally accepted answer, never changes it.
      if (input.index < run.answers.length) {
        const recordViewer = run.completed_at ? await user(req, c) : null;
        const record = run.completed_at
          ? {
              improved:
                (!run.owner_id || run.owner_id === recordViewer?.id) &&
                !privateRun(run) &&
                (await improvesPersonalRecord(
                  c,
                  run,
                  run.score_units,
                  run.owner_id,
                )),
              completedAt: new Date(run.completed_at).toISOString(),
              ownerId: run.owner_id,
            }
          : undefined;
        await c.query("COMMIT");
        return {
          answer: run.answers[input.index],
          ...(isBrainGame(run.game) || privateComparison(run)
            ? { private: privateRun(run) }
            : {}),
          completed: !!run.completed_at,
          published: !!run.published_at,
          score: run.score_units === null ? null : run.score_units / 10,
          ...(record ? { record } : {}),
        };
      }
      if (run.completed_at || input.index !== run.answers.length)
        failure("Ответь на раунды по порядку", 409);
      if (run.game === "pressure") {
        const rounds = input.answer?.rounds;
        if (
          !Array.isArray(rounds) ||
          rounds.some((r: any) => !Number.isFinite(r?.elapsed) || r.elapsed < 0)
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
      const shouldOwn =
        !!viewer && (!run.owner_id || run.owner_id === viewer.id);
      if (shouldOwn) {
        await claimLineDay(c, run, viewer.id);
        await claimBrainDay(c, run, viewer.id);
      }
      const publish = shouldOwn && !privateRun(run);
      // Finishing through the original browser does not transfer an owned run
      // when the player has switched accounts or their session has expired.
      const recordOwnerId = shouldOwn ? viewer.id : run.owner_id;
      const record = complete
        ? {
            improved:
              (!recordOwnerId || recordOwnerId === viewer?.id) &&
              !privateRun(run) &&
              (await improvesPersonalRecord(c, run, units!, recordOwnerId)),
            completedAt: new Date().toISOString(),
            ownerId: recordOwnerId,
          }
        : undefined;
      const before =
        publish && !run.published_at
          ? await notificationSnapshot(c, run.game, run.mode)
          : [];
      const savedAnswers =
        publish && run.game === "geo"
          ? answers.map(({ actual, guess, ...answer }: any) => answer)
          : answers;
      const savedChallenge =
        publish && run.game === "geo"
          ? {
              places: run.challenge.places,
              mode: run.mode,
              cameraIds:
                run.challenge.cameraIds ??
                Object.fromEntries(
                  Object.entries(run.challenge.panoramas ?? {}).map(
                    ([i, p]: any) => [i, p.pano],
                  ),
                ),
            }
          : run.challenge;
      const updated = await c.query(
        "UPDATE playne_games SET answers=$1,score_units=$2,completed_at=CASE WHEN $3 THEN now() ELSE NULL END,owner_id=CASE WHEN $8 THEN $6 ELSE owner_id END,published_at=CASE WHEN $5 THEN coalesce(published_at,now()) ELSE published_at END,challenge=$7 WHERE id=$4 RETURNING completed_at",
        [
          JSON.stringify(savedAnswers),
          units,
          complete,
          run.id,
          publish,
          viewer?.id ?? null,
          JSON.stringify(savedChallenge),
          shouldOwn,
        ],
      );
      if (record)
        record.completedAt = new Date(
          updated.rows[0].completed_at,
        ).toISOString();
      if (complete)
        await c.query(
          "UPDATE playne_guest_trials SET consumed_at=coalesce(consumed_at,now()) WHERE run_id=$1",
          [run.id],
        );
      if (publish) {
        await queueDisplacements(
          c,
          before,
          viewer.id,
          run.id,
          run.game,
          run.mode,
        );
        await recordEmailGameCompletion(c, run.id);
      }
      await c.query("COMMIT");
      return {
        answer,
        completed: complete,
        published: publish || !!run.published_at,
        ...(isBrainGame(run.game) || privateComparison(run)
          ? { private: privateRun(run) }
          : {}),
        score: units === null ? null : units / 10,
        ...(record ? { record } : {}),
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
      await lockPublications(c);
      const run = await owned(req, reply, (req.params as any).id, c, true);
      if (!run.completed_at) failure("Сначала закончи партию", 409);
      if (run.owner_id && run.owner_id !== u.id)
        failure("Эта партия принадлежит другому аккаунту", 403);
      await claimLineDay(c, run, u.id);
      await claimBrainDay(c, run, u.id);
      if (privateRun(run)) {
        await c.query(
          "UPDATE playne_games SET owner_id=$1,published_at=NULL WHERE id=$2",
          [u.id, run.id],
        );
        await c.query("COMMIT");
        return {
          ok: true,
          private: true,
          score: run.score_units / 10,
          record: {
            improved: false,
            completedAt: new Date(run.completed_at).toISOString(),
            ownerId: u.id,
          },
        };
      }
      const record = {
        improved: await improvesPersonalRecord(c, run, run.score_units, u.id),
        completedAt: new Date(run.completed_at).toISOString(),
        ownerId: u.id,
      };
      const before = !run.published_at
        ? await notificationSnapshot(c, run.game, run.mode)
        : [];
      const answers =
        run.game === "geo"
          ? run.answers.map(({ actual, guess, ...a }: any) => a)
          : run.answers;
      const challenge =
        run.game === "geo"
          ? {
              places: run.challenge.places,
              mode: run.mode,
              cameraIds:
                run.challenge.cameraIds ??
                Object.fromEntries(
                  Object.entries(run.challenge.panoramas ?? {}).map(
                    ([i, p]: any) => [i, p.pano],
                  ),
                ),
            }
          : run.challenge;
      await c.query(
        "UPDATE playne_games SET owner_id=$1,published_at=coalesce(published_at,now()),answers=$2,challenge=$3 WHERE id=$4",
        [u.id, JSON.stringify(answers), JSON.stringify(challenge), run.id],
      );
      await queueDisplacements(c, before, u.id, run.id, run.game, run.mode);
      await recordEmailGameCompletion(c, run.id);
      await c.query("COMMIT");
      return {
        ok: true,
        score: geoProjection(run, geoViewerVersion(req)).score_units / 10,
        record,
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
    if (q.game === "overall" || q.game === "brain") {
      if (q.game === "brain" && q.mode && q.mode !== "classic")
        failure("Практика доступна только в личной истории");
      const page = Number(q.page ?? 1),
        limit = Number(q.limit ?? 25);
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        page > 10000 ||
        ![5, 25].includes(limit)
      )
        failure("Некорректная страница");
      return overallLeaderboard(
        pool,
        (await user(req))?.id ?? null,
        page,
        limit,
        q.game === "brain" ? "brain" : "overall",
      );
    }
    if (!isGame(q.game)) failure("Неизвестная игра");
    if (isBrainGame(q.game) && q.mode && q.mode !== "classic")
      failure("Практика доступна только в личной истории");
    const period = q.period ?? "all";
    if (!["all", "week"].includes(period)) failure("Неизвестный период");
    const page = Number(q.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 10000)
      failure("Некорректная страница");
    const u = await user(req);
    const mode =
      q.game === "geo" || q.game === "colorfle" || q.game === "line"
        ? (q.mode ?? "classic")
        : "classic";
    if (
      q.game === "line"
        ? !["classic", "practice"].includes(mode)
        : !validGeoMode(mode) ||
          (q.game === "colorfle" && !validShadeMode(mode))
    )
      failure("Неизвестный режим");
    const base = LEADERBOARD_SQL;
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
      "SELECT id,game,mode,version,score_units,answers,completed_at,challenge->>'difficulty' AS difficulty FROM playne_games WHERE owner_id=$1 AND (published_at IS NOT NULL OR ((game IN('flash','rotate','slide','dispatch') AND mode='practice' OR challenge->>'comparison'='true') AND completed_at IS NOT NULL)) ORDER BY completed_at DESC LIMIT 30",
      [u.id],
    );
    const best = await pool.query(
      `SELECT game,mode,max(CASE WHEN $3=4 THEN ${GEO_V4_UNITS_SQL} WHEN $3=3 THEN ${GEO_V3_UNITS_SQL} ELSE score_units END)/10.0 AS score FROM playne_games WHERE owner_id=$1 AND coalesce(challenge->>'comparison','false')<>'true' AND (published_at IS NOT NULL OR (game IN('flash','rotate','slide','dispatch') AND mode='practice' AND completed_at IS NOT NULL)) AND ((game='geo' AND (version=$3 OR ($3=3 AND version=2) OR ($3=4 AND version IN(2,3)))) OR (game='colorfle' AND version=$4) OR (game NOT IN('geo','colorfle') AND version=$2)) GROUP BY game,mode`,
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
      "DELETE FROM playne_games WHERE published_at IS NULL AND expires_at<now() AND NOT(owner_id IS NOT NULL AND completed_at IS NOT NULL)",
    );
    await pool.query(
      "DELETE FROM playne_guest_trials WHERE created_at<now()-interval '365 days'",
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
