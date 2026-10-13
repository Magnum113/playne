// Local connection check; this server is never included in the public build.
import { createServer } from "node:http";
import { readFile, writeFile, chmod } from "node:fs/promises";

const origin = "http://localhost:4173";
const page = new URL("./google-check.html", import.meta.url);

function reply(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.headers.host !== "localhost:4173")
    return reply(res, 403, { error: "Недопустимый адрес" });
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    res.end(await readFile(page));
    return;
  }
  if (req.method !== "POST" || req.url !== "/config")
    return reply(res, 404, { error: "Не найдено" });
  if (
    req.headers.origin !== origin ||
    req.headers["content-type"] !== "application/json"
  )
    return reply(res, 403, { error: "Недопустимый запрос" });
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096)
        return reply(res, 413, { error: "Слишком большой запрос" });
    }
    const { key, mode = "development" } = JSON.parse(body);
    if (!["development", "production"].includes(mode))
      return reply(res, 400, { error: "Недопустимый режим" });
    const config = new URL(`../.env.${mode}.local`, import.meta.url);
    if (typeof key !== "string" || !/^AIza[A-Za-z0-9_-]{35,64}$/.test(key))
      return reply(res, 400, { error: "Проверь API-ключ" });
    const previous = await readFile(config, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const entry = `VITE_GOOGLE_MAPS_API_KEY=${key}`;
    const updated = /^VITE_GOOGLE_MAPS_API_KEY=.*$/m.test(previous)
      ? previous.replace(/^VITE_GOOGLE_MAPS_API_KEY=.*$/m, entry)
      : `${previous}${previous && !previous.endsWith("\n") ? "\n" : ""}${entry}\n`;
    await writeFile(config, updated, { mode: 0o600 });
    await chmod(config, 0o600);
    reply(res, 200, { saved: true });
  } catch {
    reply(res, 500, { error: "Не удалось сохранить настройки" });
  }
}).listen(4173, "127.0.0.1", () =>
  console.log(`Проверка Google Maps: ${origin}`),
);
