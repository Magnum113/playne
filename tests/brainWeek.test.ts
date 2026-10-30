import { describe, expect, it } from "vitest";
import { brainDateLabel, brainWeekDays } from "../src/brainProgress";
import { brainMoscowDate } from "../src/brain";

describe("current Moscow week calendar", () => {
  it.each([
    ["2026-10-30", "2026-10-26", "2026-11-01"],
    ["2026-10-26", "2026-10-26", "2026-11-01"],
    ["2026-11-01", "2026-10-26", "2026-11-01"],
    ["2026-01-01", "2025-12-29", "2026-01-04"],
    ["2024-02-29", "2024-02-26", "2024-03-03"],
  ])("shows Monday–Sunday for %s", (today, first, last) => {
    const week = brainWeekDays(today, []);
    expect(week).toHaveLength(7);
    expect(week[0].day).toBe(first);
    expect(week[6].day).toBe(last);
    expect(
      week.map((day) => brainDateLabel(day.day, { weekday: "short" })),
    ).toEqual(["пн", "вт", "ср", "чт", "пт", "сб", "вс"]);
    expect(week.filter((day) => day.isToday).map((day) => day.day)).toEqual([
      today,
    ]);
  });

  it("uses the Moscow date even while UTC is still Sunday", () => {
    const before = brainMoscowDate(new Date("2026-10-25T20:59:59Z"));
    const after = brainMoscowDate(new Date("2026-10-25T21:00:00Z"));
    expect(brainWeekDays(before, [])[0].day).toBe("2026-10-19");
    expect(brainWeekDays(after, [])[0].day).toBe("2026-10-26");
  });

  it("keeps this week's activity, ignores last weekend and leaves future days empty", () => {
    const week = brainWeekDays("2026-10-30", [
      { day: "2026-10-24", gamesCompleted: 4, score: 2000 },
      { day: "2026-10-25", gamesCompleted: 4, score: 2000 },
      { day: "2026-10-26", gamesCompleted: 1, score: 0 },
      { day: "2026-10-30", gamesCompleted: 2, score: 700 },
      { day: "2026-10-31", gamesCompleted: 4, score: 2000 },
    ]);
    expect(week[0]).toMatchObject({
      gamesCompleted: 1,
      score: 0,
      isFuture: false,
    });
    expect(week[4]).toMatchObject({
      gamesCompleted: 2,
      score: 700,
      isToday: true,
    });
    expect(week.filter((day) => day.gamesCompleted > 0)).toHaveLength(2);
    expect(week.filter((day) => day.isFuture)).toEqual([
      {
        day: "2026-10-31",
        gamesCompleted: 0,
        score: 0,
        isToday: false,
        isFuture: true,
      },
      {
        day: "2026-11-01",
        gamesCompleted: 0,
        score: 0,
        isToday: false,
        isFuture: true,
      },
    ]);
  });
});
