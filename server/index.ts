import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { buildApp } from "./app";
const env = process.env;
for (const key of [
  "DATABASE_URL",
  "YANDEX_CLIENT_ID",
  "YANDEX_CLIENT_SECRET",
  "YANDEX_REDIRECT_URI",
])
  if (!env[key]) throw new Error("Missing server setting: " + key);
const origin = env.PLAYNE_ORIGIN ?? "https://playne.ru";
if (new URL(env.YANDEX_REDIRECT_URI!).origin !== origin)
  throw new Error("Invalid callback origin");
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 8,
  connectionTimeoutMillis: 5000,
});
async function main() {
  await pool.query(
    readFileSync(
      env.PLAYNE_SCHEMA ?? "/srv/playne/current/api/schema.sql",
      "utf8",
    ),
  );
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
  });
  await app.listen({ host: "127.0.0.1", port: Number(env.PORT ?? 3035) });
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
