import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(
  new URL("../src/design-tokens.css", import.meta.url),
  "utf8",
);
const variables = (body) =>
  Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
const base = variables(
  css.match(/\[data-theme-scope="light"\]\s*\{([\s\S]*?)\}/)[1],
);
const dark = {
  ...base,
  ...variables(css.match(/\[data-theme-scope="dark"\]\s*\{([\s\S]*?)\}/)[1]),
};
const luminance = (hex) => {
  assert(
    /^#[\da-f]{6}$/i.test(hex),
    `Expected an opaque six-digit colour: ${hex}`,
  );
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
};
const textPairs = [
  ["--text", "--bg"],
  ["--text", "--panel"],
  ["--text", "--purple-tint"],
  ["--muted", "--bg"],
  ["--muted", "--panel"],
  ["--muted", "--hover"],
  ["--muted", "--purple-tint"],
  ["--mint", "--bg"],
  ["--mint", "--mint-tint"],
  ["--purple", "--bg"],
  ["--orange", "--orange-tint"],
  ["--actual", "--bg"],
  ["--danger", "--bg"],
  ["--danger", "--panel"],
  ["--danger", "--danger-tint"],
  ["--button-text", "--purple-soft"],
  ["--button-text", "--button-hover"],
];
for (const [theme, tokens] of [
  ["light", base],
  ["dark", dark],
]) {
  const resolve = (key) =>
    tokens[key]?.startsWith("var(")
      ? resolve(tokens[key].slice(4, -1))
      : tokens[key];
  for (const [fg, bg] of textPairs) {
    const ratio = contrast(resolve(fg), resolve(bg));
    assert(
      ratio >= 4.5,
      `${theme}: ${fg} on ${bg} has ${ratio.toFixed(2)}:1, needs 4.5:1`,
    );
  }
  for (const fg of ["--focus", "--field-border"])
    for (const bg of ["--bg", "--panel"]) {
      assert(
        contrast(resolve(fg), resolve(bg)) >= 3,
        `${theme}: ${fg} boundary on ${bg}`,
      );
    }
}
const html = await readFile(
  new URL("../dist/design-system/index.html", import.meta.url),
  "utf8",
);
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(
  new Set(ids).size,
  ids.length,
  "Design system must not duplicate element or SVG IDs",
);
for (const id of [
  "foundations",
  "type",
  "layout",
  "brand",
  "actions",
  "forms",
  "navigation",
  "cards",
  "motion",
  "gameplay",
  "results",
  "overlays",
  "feedback",
  "content",
  "artwork",
  "inventory",
  "audit",
]) {
  assert(ids.includes(id), `Missing catalog section: ${id}`);
}
assert(
  html.includes('content="noindex, follow"'),
  "Technical catalog should not compete with game pages in search",
);
assert(!html.includes('placeholder="TODO"'));
console.log(
  `Design system checks passed: 17 sections, unique IDs and ${textPairs.length * 2 + 8} colour-pair checks in both themes.`,
);
