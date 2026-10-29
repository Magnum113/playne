// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountBests } from "../src/AccountBests";

describe("account line results", () => {
  it("keeps daily classic and practice records in separate rows", () => {
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(
      <AccountBests
        best={[
          { game: "line", mode: "classic", score: 0 },
          { game: "line", mode: "practice", score: 475 },
        ]}
      />,
    );
    const line = box.querySelector(
      '[aria-label="Результаты игры Одной линией"]',
    )!;
    const classic = line.querySelector(
      'a[href="/leaderboard/?game=line&mode=classic&period=all"]',
    )!;
    const practice = line.querySelector(
      'a[href="/leaderboard/?game=line&mode=practice&period=all"]',
    )!;
    expect(classic.textContent).toContain("Задача дня");
    expect(classic.querySelector("strong")?.textContent).toContain("0");
    expect(classic.textContent).not.toContain("Нет результата");
    expect(practice.querySelector("strong")?.textContent).toContain("475");
  });

  it("does not reuse practice as the missing daily result", () => {
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(
      <AccountBests best={[{ game: "line", mode: "practice", score: 500 }]} />,
    );
    const classic = box.querySelector(
      'a[href="/leaderboard/?game=line&mode=classic&period=all"]',
    )!;
    expect(classic.textContent).toContain("Нет результата");
    expect(classic.textContent).not.toContain("500");
  });
});

describe("brain account records", () => {
  it("adds the four daily records as one category and ignores practice", () => {
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(
      <AccountBests
        best={[
          { game: "flash", mode: "classic", score: 400 },
          { game: "flash", mode: "practice", score: 500 },
          { game: "rotate", mode: "classic", score: 300 },
          { game: "slide", mode: "classic", score: 200 },
          { game: "dispatch", mode: "classic", score: 100 },
        ]}
      />,
    );
    const group = box.querySelector(
      '[aria-label="Результаты разминки для ума"]',
    )!;
    expect(group.querySelectorAll(".account-best-row")).toHaveLength(4);
    expect(
      group.querySelector(".account-best-brain-total")?.textContent,
    ).toContain("500 / 1000");
    expect(
      group.querySelector('a[href*="game=flash&mode=classic"]')?.textContent,
    ).toContain("400");
    expect(
      group.querySelector(
        'a[href*="game=flash&mode=classic"] .account-best-score',
      )?.textContent,
    ).toBe("400 / 500");
    expect(group.querySelector('a[href*="mode=practice"]')).toBeNull();
  });
});
