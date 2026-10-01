import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createServer } from "vite";
const dist = new URL("../dist/", import.meta.url);
const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});
try {
  const { pages, SITE_URL } = await server.ssrLoadModule("/src/seo.ts");
  const paths = new Set(pages.map((p) => p.path));
  const titles = new Set();
  const descriptions = new Set();
  for (const page of pages) {
    const html = await readFile(
      new URL(`${page.path.slice(1)}index.html`, dist),
      "utf8",
    );
    const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
    assert(
      html.includes(`id="root" data-page-path="${page.path}"`),
      `${page.path}: stable route for proxied documents`,
    );
    const inlineCss = html.match(
      /<style data-playne-styles data-source="(\/assets\/[^"/]+\.css)">([\s\S]*?)<\/style>/,
    );
    assert(inlineCss, `${page.path}: self-contained styles`);
    assert.equal(
      inlineCss[2],
      await readFile(new URL(inlineCss[1].slice(1), dist), "utf8"),
    );
    assert(
      !/<link\b[^>]*rel="stylesheet"/.test(html),
      `${page.path}: no external CSS dependency`,
    );
    assert(title && !titles.has(title), `${page.path}: unique title`);
    titles.add(title);
    const description = html.match(
      /<meta name="description" content="([^"]+)"/,
    )?.[1];
    assert(
      description && !descriptions.has(description),
      `${page.path}: unique description`,
    );
    descriptions.add(description);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert(html.includes(`rel="canonical" href="${SITE_URL}${page.path}"`));
    assert.equal(
      (html.match(/<h1[\s>]/g) || []).length,
      1,
      `${page.path}: exactly one H1`,
    );
    assert(html.includes('lang="ru"') && !html.includes('content="noindex'));
    assert(html.includes("og:image") && html.includes("twitter:card"));
    assert(html.includes('data-playne-mark="vector"'));
    assert(
      !/<img\b[^>]*src="\/art\/playne-logo\.png/i.test(html),
      `${page.path}: the large social image must not be used in page chrome`,
    );
    assert(
      html.includes('class="footer-links"'),
      `${page.path}: footer links rendered without JS`,
    );
    const json = html.match(
      /<script type="application\/ld\+json">(.*?)<\/script>/s,
    )?.[1];
    assert(json, `${page.path}: structured data`);
    const data = JSON.parse(json);
    assert.equal(data["@context"], "https://schema.org");
    assert(data["@graph"].some((x) => x.url === SITE_URL + page.path));
    for (const match of html.matchAll(
      /(?:href|src)="(\/[^"?#]*)(?:[?#][^"]*)?"/g,
    )) {
      const path = match[1];
      if (path.endsWith("/"))
        assert(paths.has(path), `${page.path}: broken route ${path}`);
      else await access(new URL(path.slice(1), dist));
    }
    for (const match of html.matchAll(/href="#([^"]+)"/g))
      assert(
        html.includes(`id="${match[1]}"`),
        `${page.path}: broken section ${match[1]}`,
      );
    // A source edit must produce useful readable HTML, not just an app shell.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ");
    assert(
      text.length > (page.kind === "article" ? 2500 : 400),
      `${page.path}: missing prerendered copy`,
    );
  }
  const sitemap = await readFile(new URL("sitemap.xml", dist), "utf8");
  const listed = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), pages.map((p) => SITE_URL + p.path).sort());
  const robots = await readFile(new URL("robots.txt", dist), "utf8");
  assert(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
  assert(!robots.includes("Disallow: /"));
  const missing = await readFile(new URL("404.html", dist), "utf8");
  assert(
    missing.includes('content="noindex, follow"') &&
      !missing.includes('rel="canonical"'),
  );
  const destroy = await readFile(new URL("destroy.html", dist), "utf8");
  assert(Buffer.byteLength(destroy) < 16_000, "Destroy page should stay small");
  assert(destroy.includes('name="robots" content="noindex, nofollow"'));
  assert(destroy.includes("<style>") && !destroy.includes("<script"));
  assert(!/<(?:img|link|iframe)\b/i.test(destroy));
  assert(!/@import\b|url\s*\(/i.test(destroy));
  for (const game of ["На глаз", "Круг", "Оттенок"])
    assert(destroy.includes(game), `Destroy page is missing ${game}`);
  const home = await readFile(new URL("index.html", dist), "utf8");
  assert(
    home.includes("https%3A%2F%2Fplayne.ru%2Fdestroy.html%3Fv%3D1"),
    "Destroy link must use the self-contained page",
  );
  console.log(
    `SEO checks passed: ${pages.length} prerendered routes, internal links, metadata, JSON-LD, sitemap, robots and 404.`,
  );
} finally {
  await server.close();
}
