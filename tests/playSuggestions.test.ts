import { describe, expect, it } from "vitest";
import { DAILY_PLAY_GAMES } from "../src/playProgress";
import { nextDaily, todaySuggestions } from "../src/playSuggestions";
import {
  completedDailyFixtures,
  dailyRunFixture,
  playProgressFixture,
} from "./playProgressFixture";

describe("daily Playne recommendations", () => {
  it("prioritizes an unfinished daily over a genuinely preferred non-daily game", () => {
    const data = playProgressFixture({
      daily: { dispatch: dailyRunFixture("dispatch") },
      favorites: [
        {
          game: "pressure",
          completedRuns: 12,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
      ],
    });
    const [primary, secondary] = todaySuggestions(data.day, data);
    expect(primary).toMatchObject({
      game: "dispatch",
      href: "/brain/dispatch/",
      action: "Продолжить",
      label: "Партия начата",
    });
    expect(secondary.game).not.toBe(primary.game);
  });

  it("prioritizes a pending task over a daily favorite and honors exclusion", () => {
    const data = playProgressFixture({
      daily: { slide: dailyRunFixture("slide") },
      favorites: [
        {
          game: "flash",
          completedRuns: 7,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
      ],
    });
    expect(nextDaily(data)).toMatchObject({
      game: "slide",
      action: "Продолжить",
    });
    expect(nextDaily(data, "slide")).toMatchObject({
      game: "flash",
      href: "/brain/flash/",
      action: "Играть",
    });
    expect(nextDaily(data, "flash")?.game).toBe("slide");
  });

  it("never recommends a completed daily favorite as either of today's choices", () => {
    const data = playProgressFixture({
      daily: {
        flash: dailyRunFixture("flash", true),
        rotate: dailyRunFixture("rotate", true),
      },
      favorites: [
        {
          game: "flash",
          completedRuns: 20,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
      ],
    });
    const choices = todaySuggestions(data.day, data);
    expect(choices).toHaveLength(2);
    expect(
      choices.every((choice) => !["flash", "rotate"].includes(choice.game)),
    ).toBe(true);
    expect(nextDaily(data)?.game).not.toBe("flash");
  });

  it("uses a real preferred non-daily game before an unstarted daily suggestion", () => {
    const data = playProgressFixture({
      favorites: [
        {
          game: "geo",
          completedRuns: 9,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
      ],
    });
    const [primary, secondary] = todaySuggestions(data.day, data);
    expect(primary).toMatchObject({
      game: "geo",
      href: "/geo/",
      label: "Для тебя",
    });
    expect(DAILY_PLAY_GAMES).toContain(secondary.game);
    expect(secondary.game).not.toBe(primary.game);
    expect(nextDaily(data)?.game).not.toBe("geo");
  });

  it("uses the next eligible favorite when the strongest favorite's daily is already completed", () => {
    const data = playProgressFixture({
      daily: { flash: dailyRunFixture("flash", true) },
      favorites: [
        {
          game: "flash",
          completedRuns: 12,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
        {
          game: "geo",
          completedRuns: 8,
          lastCompletedAt: "2026-10-28T12:00:00Z",
        },
      ],
    });
    expect(todaySuggestions(data.day, data)[0]).toMatchObject({
      game: "geo",
      label: "Для тебя",
    });
  });

  it("keeps no-data defaults stable within a day and always offers two distinct games", () => {
    const defaults = [];
    for (const day of [
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
    ]) {
      const choices = todaySuggestions(day);
      expect(todaySuggestions(day)).toEqual(choices);
      expect(choices[0].game).not.toBe(choices[1].game);
      expect(
        choices.every((choice) =>
          (DAILY_PLAY_GAMES as readonly string[]).includes(choice.game),
        ),
      ).toBe(true);
      defaults.push(choices[0].game);
    }
    expect(new Set(defaults).size).toBeGreaterThan(1);
  });

  it("returns no next daily after every daily is completed and offers a replayable fallback", () => {
    const data = playProgressFixture({ daily: completedDailyFixtures() });
    expect(nextDaily(data)).toBeNull();
    const [primary, secondary] = todaySuggestions(data.day, data);
    expect(primary).toMatchObject({
      game: "naglaz",
      href: "/naglaz/",
      label: "Все задачи дня готовы",
      action: "Сыграть ещё",
    });
    expect(secondary.game).not.toBe(primary.game);
    expect(
      (DAILY_PLAY_GAMES as readonly string[]).includes(secondary.game),
    ).toBe(false);
  });

  it("links a completed favorite daily to private practice after all daily tasks are done", () => {
    const data = playProgressFixture({
      daily: completedDailyFixtures(),
      favorites: [
        {
          game: "flash",
          completedRuns: 12,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
      ],
    });
    const [primary, secondary] = todaySuggestions(data.day, data);
    expect(primary).toMatchObject({
      game: "flash",
      href: "/brain/flash/?mode=practice",
      label: "Все задачи дня готовы",
      action: "Сыграть ещё",
    });
    expect(secondary.game).not.toBe(primary.game);
    expect(nextDaily(data)).toBeNull();
  });

  it("preserves a genuine non-daily favorite even when every daily task is done", () => {
    const data = playProgressFixture({
      daily: completedDailyFixtures(),
      favorites: [
        {
          game: "circle",
          completedRuns: 7,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
      ],
    });
    const [primary, secondary] = todaySuggestions(data.day, data);
    expect(primary.game).toBe("circle");
    expect(secondary.game).toBe("colorfle");
  });

  it("preserves the only unfinished current game for the result-screen fallback", () => {
    const daily = completedDailyFixtures();
    daily.rotate = dailyRunFixture("rotate");
    const data = playProgressFixture({ daily });
    expect(nextDaily(data, "rotate")).toBeNull();
    expect(nextDaily(data)).toMatchObject({
      game: "rotate",
      action: "Продолжить",
    });
    expect(todaySuggestions(data.day, data)[0]).toMatchObject({
      game: "rotate",
      label: "Партия начата",
    });
  });

  it("finds an unstarted favorite when current is excluded and other favorites are completed", () => {
    const data = playProgressFixture({
      daily: {
        slide: dailyRunFixture("slide"),
        flash: dailyRunFixture("flash", true),
      },
      favorites: [
        {
          game: "flash",
          completedRuns: 12,
          lastCompletedAt: "2026-10-29T12:00:00Z",
        },
        {
          game: "rotate",
          completedRuns: 8,
          lastCompletedAt: "2026-10-28T12:00:00Z",
        },
      ],
    });
    expect(nextDaily(data, "slide")).toMatchObject({
      game: "rotate",
      action: "Играть",
    });
  });
});
