// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RecordCelebration from "../src/RecordCelebration";
import {
  RECORD_CELEBRATION_KEY,
  RECORD_CELEBRATION_TTL,
  rememberPersonalRecord,
  takePersonalRecord,
  personalRecordHref,
  personalRecordLabel,
  personalRecordScore,
} from "../src/recordCelebrationState";
import { createRankedQueue } from "../src/rankedQueue";

const run = {
  id: "11111111-1111-4111-8111-111111111111",
  game: "colorfle" as const,
  mode: "timed" as const,
  challenge: {},
};
const owner = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-30T12:00:00Z");
const receipt = {
  improved: true,
  completedAt: new Date(now).toISOString(),
  ownerId: null,
};
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("New record handoff", () => {
  it("survives navigation, is consumed once and ignores retried completion or claim", () => {
    rememberPersonalRecord(run, 487, receipt);
    expect(takePersonalRecord(null)?.score).toBe(487);
    expect(takePersonalRecord(null)).toBeNull();
    rememberPersonalRecord(run, 487, receipt);
    rememberPersonalRecord(run, 487, { ...receipt, ownerId: owner });
    expect(takePersonalRecord(owner)).toBeNull();
  });
  it("waits for the matching account and cancels a guest record if claim finds a higher account record", () => {
    rememberPersonalRecord(run, 487, receipt);
    expect(takePersonalRecord(owner)).toBeNull();
    rememberPersonalRecord(run, 487, {
      ...receipt,
      ownerId: owner,
      improved: false,
    });
    expect(takePersonalRecord(null)).toBeNull();
    expect(takePersonalRecord(owner)).toBeNull();
  });
  it("does not celebrate history, stale, invalid, zero, future or practice results", () => {
    for (const change of [
      { improved: false },
      { completedAt: new Date(now - RECORD_CELEBRATION_TTL - 1).toISOString() },
      { completedAt: new Date(now + 120_000).toISOString() },
    ]) {
      rememberPersonalRecord(run, 487, { ...receipt, ...change });
      expect(takePersonalRecord(null)).toBeNull();
    }
    for (const score of [0, -1, NaN, Infinity, 501])
      rememberPersonalRecord(run, score, receipt);
    rememberPersonalRecord({ ...run, mode: "practice" }, 487, receipt);
    expect(takePersonalRecord(null)).toBeNull();
  });
  it("keeps the most recent improvement when an older request arrives late", () => {
    const latest = { ...run, id: "33333333-3333-4333-8333-333333333333" };
    rememberPersonalRecord(latest, 490, receipt);
    rememberPersonalRecord(run, 487, {
      ...receipt,
      completedAt: new Date(now - 1000).toISOString(),
    });
    expect(takePersonalRecord(null)?.id).toBe(latest.id);
  });
  it("does not throw when storage is unavailable", () => {
    const storage = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    } as unknown as Storage;
    expect(() =>
      rememberPersonalRecord(
        { ...run, id: "44444444-4444-4444-8444-444444444444" },
        487,
        receipt,
        storage,
      ),
    ).not.toThrow();
    expect(takePersonalRecord(null, storage)?.score).toBe(487);
    expect(takePersonalRecord(null, storage)).toBeNull();
  });
  it("preserves record display through StrictMode effect replay and dismisses it", async () => {
    rememberPersonalRecord(run, 487, receipt);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <StrictMode>
          <RecordCelebration />
        </StrictMode>,
      ),
    );
    expect(host.textContent).toContain("Новый рекорд!");
    expect(host.textContent).toContain("487 / 500");
    expect(host.querySelector("a")?.getAttribute("href")).toBe(
      "/colorfle/?mode=timed",
    );
    expect(takePersonalRecord(null)).toBeNull();
    await act(async () =>
      (host.querySelector("button") as HTMLButtonElement).click(),
    );
    expect(host.textContent).toBe("");
    await act(async () => root.unmount());
  });
  it("replays design-system example without creating real record storage", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<RecordCelebration demo />));
    const replay = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Показать рекорд",
    )!;
    await act(async () => replay.click());
    expect(host.textContent).toContain("487 / 500");
    expect(localStorage.getItem(RECORD_CELEBRATION_KEY)).toBeNull();
    await act(async () => root.unmount());
  });
  it("formats mode and score and links back to that exact game", () => {
    const record = { ...run, score: 42, completedAt: now, ownerId: null };
    expect(
      personalRecordLabel({ ...record, game: "geo", mode: "landmarks-timed" }),
    ).toBe("Где я? · достопримечательности · на время");
    expect(personalRecordScore({ ...record, game: "pressure" })).toBe(
      "42 очка",
    );
    expect(
      personalRecordHref({ ...record, game: "line", mode: "classic" }),
    ).toBe("/one-line/");
  });
  it("uses only acknowledged completed results, including claim corrections, without blocking save", async () => {
    const response = vi.fn(async (path: string) =>
      path.endsWith("/publish")
        ? {
            ok: true,
            score: 487,
            record: { ...receipt, ownerId: owner, improved: false },
          }
        : { completed: true, score: 487, record: receipt },
    );
    const q = createRankedQueue(response, {
      storage: localStorage,
      onRecordResult: rememberPersonalRecord,
    });
    const key = q.add(run, "colorfle", "timed");
    q.enqueue(key, 4, { choice: { h: 0, s: 50, v: 50 } });
    await q.drain(key);
    expect(
      JSON.parse(localStorage.getItem(RECORD_CELEBRATION_KEY)!).pending.score,
    ).toBe(487);
    q.connect(owner);
    await q.drain(key);
    expect(q.get(key)?.state.status).toBe("saved");
    expect(takePersonalRecord(owner)).toBeNull();
    q.dispose();
  });
});
