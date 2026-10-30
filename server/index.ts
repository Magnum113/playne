import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { buildApp } from "./app";
import { prepareReminderEmails } from "./email-reminders";
import { migrateShadeScores } from "./shade-migration";
import {
  deliverEmails,
  prepareRankEmails,
  emailExperimentReport,
  cleanupEmailData,
  refreshEmailReadiness,
  type EmailConfig,
} from "./email-core";
const env = process.env;
for (const key of [
  "DATABASE_URL",
  "YANDEX_CLIENT_ID",
  "YANDEX_CLIENT_SECRET",
  "YANDEX_REDIRECT_URI",
])
  if (!env[key]) throw new Error("Missing server setting: " + key);
const origin = env.PLAYNE_ORIGIN ?? "https://playne.ru";
const email: EmailConfig = {
  origin,
  secret: env.PLAYNE_EMAIL_SECRET ?? "",
  apiKey: env.UNISENDER_PLAYNE_API_KEY,
  projectId: env.UNISENDER_PLAYNE_PROJECT_ID,
  from: env.PLAYNE_EMAIL_FROM,
  replyTo: env.PLAYNE_EMAIL_REPLY_TO,
  enabled: env.PLAYNE_EMAIL_ENABLED === "1",
  yandexEmail: env.PLAYNE_YANDEX_EMAIL === "1",
  adminId: env.PLAYNE_EMAIL_ADMIN_ID,
  deliveryReady: false,
};
if (new URL(env.YANDEX_REDIRECT_URI!).origin !== origin)
  throw new Error("Invalid callback origin");
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 8,
  connectionTimeoutMillis: 5000,
});
async function main() {
  if (process.argv.includes("--email-report")) {
    console.log(JSON.stringify(await emailExperimentReport(pool), null, 2));
    await pool.end();
    return;
  }
  await pool.query(
    readFileSync(
      env.PLAYNE_SCHEMA ?? "/srv/playne/current/api/schema.sql",
      "utf8",
    ),
  );
  const migrated = await migrateShadeScores(pool);
  if (migrated.updated || migrated.skipped)
    console.log("Shade score migration", migrated);
  const app = await buildApp(pool, {
    origin,
    yandexId: env.YANDEX_CLIENT_ID!,
    yandexSecret: env.YANDEX_CLIENT_SECRET!,
    redirect: env.YANDEX_REDIRECT_URI!,
    googleKey: env.GOOGLE_STREET_VIEW_SERVER_KEY,
    secure: !origin.startsWith("http://localhost"),
    revision:
      env.PLAYNE_REVISION ??
      readFileSync("/srv/playne/current/REVISION", "utf8").trim(),
    email,
  });
  let emailJob: Promise<void> | undefined;
  let lastEmailCleanup = 0;
  let lastDomainCheck = 0;
  const emailShutdown = new AbortController();
  let emailTimer: ReturnType<typeof setInterval> | undefined;
  const pump = () => {
    if (emailJob || emailShutdown.signal.aborted) return;
    emailJob = (async () => {
      if (email.enabled && Date.now() - lastDomainCheck > 300000) {
        const wasReady = email.deliveryReady;
        await refreshEmailReadiness(email, fetch, emailShutdown.signal);
        lastDomainCheck = Date.now();
        if (!wasReady && email.deliveryReady)
          console.log("Playne email domain verified; subscriptions enabled");
      }
      if (emailShutdown.signal.aborted) return;
      if (Date.now() - lastEmailCleanup > 3600000) {
        await cleanupEmailData(pool);
        lastEmailCleanup = Date.now();
      }
      await prepareRankEmails(pool, email);
      await prepareReminderEmails(pool, email);
      await deliverEmails(pool, email, fetch, Date.now(), emailShutdown.signal);
    })()
      .catch(() => console.error("Playne email worker failed"))
      .finally(() => {
        emailJob = undefined;
      });
  };
  app.addHook("onClose", async () => {
    if (emailTimer) clearInterval(emailTimer);
    emailShutdown.abort();
    await emailJob;
  });
  await app.listen({ host: "127.0.0.1", port: Number(env.PORT ?? 3035) });
  emailTimer = setInterval(pump, 60_000);
  emailTimer.unref();
  pump();
  console.log("Playne API listening on loopback");
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      void app
        .close()
        .then(() => pool.end())
        .then(() => process.exit(0));
    });
}
void main().catch(() => {
  console.error("Playne API startup failed");
  process.exit(1);
});
