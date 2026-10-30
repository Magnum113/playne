// @vitest-environment happy-dom
// Navigation streak is verified separately from game mechanics.
vi.mock("../src/HeaderStreak", () => ({ default: () => null }));
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  access: {
    user: { id: "geo-mode-test" },
    ready: true,
    loading: false,
    blocked: false,
    resume: false,
    trial: undefined as undefined | { mode: string },
  },
  ranked: { state: { status: "idle" } },
}));
vi.mock("../src/account", () => ({
  useGuestTrial: () => state.access,
  useRankedRun: () => state.ranked,
  GuestSavedNotice: () => null,
  AccountNav: () => null,
  SaveResult: () => null,
  RankedSyncError: class extends Error {},
}));
import GeoGame from "../src/GeoGame";

let root: Root, box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  window.history.replaceState(null, "", "/geo/");
  state.access.resume = false;
  state.access.trial = undefined;
  state.ranked.state.status = "idle";
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
});
function picker(legend: string) {
  return [...box.querySelectorAll<HTMLFieldSetElement>("fieldset")].find(
    (field) => field.querySelector("legend")?.textContent === legend,
  )!;
}
function select(legend: string, value: string) {
  act(() =>
    picker(legend)
      .querySelector<HTMLInputElement>(`input[value="${value}"]`)!
      .click(),
  );
}
describe("Geo shared mode choices", () => {
  it("preserves independent collection, movement and time choices and suppresses movement in landmarks", async () => {
    await act(async () => root.render(<GeoGame />));
    const groups = [...box.querySelectorAll("fieldset")];
    expect(groups).toHaveLength(3);
    expect(
      groups.every((group) => group.classList.contains("mode-choice")),
    ).toBe(true);
    const names = groups.map(
      (group) => group.querySelector<HTMLInputElement>("input")!.name,
    );
    expect(new Set(names).size).toBe(3);
    select("Время", "timed");
    select("Перемещение", "moving");
    expect(
      picker("Время").querySelector<HTMLInputElement>('input[value="timed"]')!
        .checked,
    ).toBe(true);
    select("Места", "landmarks");
    expect(picker("Перемещение")).toBeUndefined();
    expect(
      picker("Время").querySelector<HTMLInputElement>('input[value="timed"]')!
        .checked,
    ).toBe(true);
    expect(box.textContent).toContain("Узнай и найди на карте.");
    select("Места", "world");
    expect(
      picker("Перемещение").querySelector<HTMLInputElement>(
        'input[value="stationary"]',
      )!.checked,
    ).toBe(true);
    expect(
      picker("Время").querySelector<HTMLInputElement>('input[value="timed"]')!
        .checked,
    ).toBe(true);
  });
  it("restores and locks an unfinished party's mode", async () => {
    state.access.resume = true;
    state.access.trial = { mode: "moving-timed" };
    await act(async () => root.render(<GeoGame />));
    expect(
      [...box.querySelectorAll<HTMLFieldSetElement>("fieldset")].every(
        (group) => group.disabled,
      ),
    ).toBe(true);
    expect(
      picker("Перемещение").querySelector<HTMLInputElement>(
        'input[value="moving"]',
      )!.checked,
    ).toBe(true);
    expect(
      picker("Время").querySelector<HTMLInputElement>('input[value="timed"]')!
        .checked,
    ).toBe(true);
  });
});
