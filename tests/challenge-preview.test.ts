import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { CHALLENGE_GAMES, type PublicChallenge } from "../src/challenges";
import {
  challengeSvg,
  renderChallengePng,
  CHALLENGE_PREVIEW_VERSION,
  challengeHtml,
} from "../server/challenge-preview";
const data = (game: PublicChallenge["game"], score = 420): PublicChallenge => ({
  token: "a".repeat(43),
  url: "https://playne.ru/c/example123456789",
  imageUrl: `https://playne.ru/api/challenges/example/image.png?v=${CHALLENGE_PREVIEW_VERSION}`,
  game,
  gameName: game === "circle" ? "Круг" : "Одной линией",
  nickname: "Ник <private> & данные",
  score,
  maxScore: game === "circle" ? 100 : game === "pressure" ? 0 : 500,
  day: "2026-10-30",
  mode: "classic",
  isTodayDaily: false,
});
describe("Selected B: dynamic friend-result previews", () => {
  it.each(CHALLENGE_GAMES)(
    "uses the chosen frame and a distinct %s game illustration",
    (game) => {
      const svg = challengeSvg(data(game, game === "circle" ? 95.8 : 420));
      expect(svg).toContain('width="1200" height="630"');
      expect(svg).toContain('id="dots"');
      expect(svg).toContain('id="field-grid"');
      expect(svg).toContain('fill="#eee6fb"');
      expect(svg).toContain(`data-game-art="${game}"`);
      expect(svg).not.toContain("<private>");
      expect(svg).not.toContain("Ник");
      expect(svg).not.toContain("2026-10-30");
      expect(svg).not.toContain('href="http');
      expect(svg).toContain("Побьёшь мой результат?");
    },
  );
  it("shows Russian decimals, real score units and fair copy at the maximum", () => {
    expect(challengeSvg(data("circle", 95.8))).toContain("95,8%");
    expect(challengeSvg(data("circle", 0))).toContain(">0%</text>");
    for (const game of CHALLENGE_GAMES.filter((g) => g !== "pressure")) {
      const max = game === "circle" ? 100 : 500,
        svg = challengeSvg(data(game, max));
      expect(svg).toContain("Сможешь повторить?");
      expect(svg).not.toContain("Побьёшь мой результат?");
    }
    const pressure = challengeSvg(data("pressure", 25000));
    expect(pressure).toContain(">25000</text>");
    expect(pressure).toContain(">очков</text>");
    expect(pressure).not.toContain("из 0");
  });
  it("shows the actual swarm level, stars, score and a link to the same board", async () => {
    const value = {
      ...data("flow", 1000),
      gameName: "Рой",
      maxScore: 1000,
      flow: { kind: "level" as const, key: "12", stars: 3 },
    };
    const svg = challengeSvg(value),
      html = challengeHtml(value);
    expect(svg).toContain("Уровень 12");
    expect(svg).toContain("1000 / 1000");
    expect(svg).toContain('data-stars="3"');
    expect(svg).toContain('data-game-art="flow"');
    expect(html).toContain(`/swarm/?challenge=${value.token}`);
    expect(html).toContain("Уровень 12");
    expect(html).toContain('property="og:image"');
    const png = await renderChallengePng(value);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(
      await renderChallengePng({
        ...value,
        flow: { ...value.flow, key: "13" },
      }),
    ).not.toEqual(png);
  });
  it("escapes title text and versions the real OG image URL", () => {
    const value = { ...data("line"), gameName: 'Игра <script> & "цитата"' };
    expect(challengeSvg(value)).toContain(
      "Игра &lt;script&gt; &amp; &quot;цитата&quot;",
    );
    expect(challengeSvg(value)).not.toContain("<script>");
    expect(challengeHtml(value)).toContain(
      `image.png?v=${CHALLENGE_PREVIEW_VERSION}`,
    );
  });
  it("renders distinct valid PNGs using the production renderer, with stable repeat output", async () => {
    const hashes = new Set<string>();
    for (const game of CHALLENGE_GAMES) {
      const png = await renderChallengePng(
        data(game, game === "circle" ? 95.8 : 420),
      );
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
      expect(png.length).toBeGreaterThan(10000);
      expect(
        await renderChallengePng(data(game, game === "circle" ? 95.8 : 420)),
      ).toEqual(png);
      hashes.add(createHash("sha256").update(png).digest("hex"));
    }
    expect(hashes.size).toBe(CHALLENGE_GAMES.length);
    // Full PNG renders plus cold WASM/font initialization can exceed the
    // default 5 seconds on shared CI runners; this is not a latency benchmark.
  }, 30_000);
});
