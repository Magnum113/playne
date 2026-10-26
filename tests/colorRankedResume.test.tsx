// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newShadeSession,
  shadeReducer,
  saveShadeSession,
  SHADE_KEY,
  type ShadeMode,
} from "../src/colorfle";
import { RANKED_PENDING_KEY } from "../src/rankedQueue";
let root: Root | undefined, container: HTMLDivElement;
const id = "11111111-1111-4111-8111-111111111111";
const newId = "22222222-2222-4222-8222-222222222222";
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
async function mount() {
  const { AuthProvider } = await import("../src/account");
  const { default: ColorfleGame } = await import("../src/ColorfleGame");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AuthProvider>
        <ColorfleGame />
      </AuthProvider>,
    );
  });
}
function setup() {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  window.history.replaceState(null, "", "/colorfle/");
}
function startButton() {
  return [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.startsWith("Начать игру"),
  )!;
}
function pageshow(persisted: boolean) {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  root = undefined;
});
describe("color game entry", () => {
  it("restores the selected mode after OAuth even without a saved browser preference", async () => {
    setup();
    window.history.replaceState(
      null,
      "",
      `/colorfle/?saved=${id}&mode=timed&auth=success`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ user: { id: "signed-player", nickname: "Игрок" }, trials: {} }),
      ),
    );
    await mount();
    expect(
      container.querySelector<HTMLInputElement>('input[value="timed"]')
        ?.checked,
    ).toBe(true);
    expect(container.querySelector("[role=timer]")).toBeNull();
    expect(startButton()).toBeDefined();
  });
  it.each(
    (["classic", "timed"] as ShadeMode[]).flatMap((mode) =>
      ["picking", "reveal", "finished"].map((phase) => ({ mode, phase })),
    ),
  )(
    "opens the menu instead of the stored $mode $phase party and preserves records",
    async ({ mode, phase }) => {
      setup();
      let session = {
        ...newShadeSession(undefined, Math.random, mode),
        rankedId: id,
        stats: { played: 3, best: 410 },
        modeStats: {
          classic: { played: 3, best: 410 },
          timed: { played: 2, best: 380 },
        },
      };
      session = shadeReducer(session, { type: "start" }) as typeof session;
      if (phase !== "picking")
        for (let i = 0; i < (phase === "finished" ? 5 : 1); i++) {
          session = shadeReducer(session, {
            type: "pick",
            color: session.targets[i],
          }) as typeof session;
          session = shadeReducer(session, { type: "submit" }) as typeof session;
          if (phase === "finished" && i < 4)
            session = shadeReducer(session, { type: "next" }) as typeof session;
        }
      saveShadeSession(session);
      const request = vi.fn(async (url: string) => {
        if (url !== "/api/me")
          throw new Error("Old party must not resume: " + url);
        return json({ user: null });
      });
      vi.stubGlobal("fetch", request);
      await mount();
      expect(container.textContent).toContain("Сможешь попасть в цвет?");
      expect(startButton()).toBeDefined();
      expect(container.querySelector(".shade-status")).toBeNull();
      expect(container.querySelector("[role=timer]")).toBeNull();
      const fresh = JSON.parse(localStorage.getItem(SHADE_KEY)!);
      expect(fresh).toMatchObject({
        started: false,
        mode,
        round: 0,
        answers: [],
        touched: false,
        stats: session.stats,
      });
      expect(fresh.modeStats[mode === "classic" ? "timed" : "classic"]).toEqual(
        session.modeStats[mode === "classic" ? "timed" : "classic"],
      );
      expect(fresh.rankedId).toBeUndefined();
      expect(fresh.deadline).toBeUndefined();
      expect(fresh.targets).not.toEqual(session.targets);
      expect(request.mock.calls.every(([url]) => url === "/api/me")).toBe(true);
    },
  );
  it("returns to the menu when restored from browser history and starts a new server party", async () => {
    setup();
    const targets = newShadeSession().targets;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/me") return json({ user: null });
        if (url === "/api/games")
          return json({
            id: newId,
            game: "colorfle",
            version: 2,
            challenge: { targets },
            answers: [],
          });
        throw new Error("Unexpected " + url);
      }),
    );
    await mount();
    await act(async () => startButton().click());
    expect(container.querySelector(".shade-status")).not.toBeNull();
    await act(async () => pageshow(false));
    expect(container.querySelector(".shade-status")).not.toBeNull();
    await act(async () => pageshow(true));
    expect(container.textContent).toContain("Сможешь попасть в цвет?");
    expect(
      JSON.parse(localStorage.getItem(SHADE_KEY)!).rankedId,
    ).toBeUndefined();
  });
  it("does not enter an abandoned party if its start response arrives after history restoration", async () => {
    setup();
    let resolveRun!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/me") return Promise.resolve(json({ user: null }));
        if (url === "/api/games")
          return new Promise<Response>((resolve) => {
            resolveRun = resolve;
          });
        throw new Error("Unexpected " + url);
      }),
    );
    await mount();
    await act(async () => startButton().click());
    await act(async () => pageshow(true));
    await act(async () =>
      resolveRun(
        json({
          id: newId,
          game: "colorfle",
          version: 2,
          challenge: { targets: newShadeSession().targets },
          answers: [],
        }),
      ),
    );
    expect(container.textContent).toContain("Сможешь попасть в цвет?");
    expect(container.querySelector(".shade-status")).toBeNull();
  });
  it("finishes publishing queued answers in the background while showing the menu", async () => {
    setup();
    const targets = newShadeSession().targets;
    localStorage.setItem(
      RANKED_PENDING_KEY,
      JSON.stringify([
        {
          key: id,
          game: "colorfle",
          mode: "classic",
          run: {
            id,
            game: "colorfle",
            mode: "classic",
            version: 2,
            challenge: { targets },
            answers: [],
          },
          tasks: targets.map((choice, index) => ({
            index,
            answer: { choice },
          })),
          pins: {},
          results: {},
          completed: false,
          published: false,
          updated: Date.now(),
        },
      ]),
    );
    let accepted = 0;
    const request = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/me")
        return json({
          user: { id: "test-user", nickname: "Тест", nickname_confirmed: true },
        });
      if (url === `/api/games/${id}/answers`) {
        const body = JSON.parse(String(init?.body));
        expect(body.index).toBe(accepted++);
        return json({
          answer: { choice: targets[body.index], score: 100 },
          completed: accepted === 5,
          published: accepted === 5,
          score: accepted === 5 ? 500 : null,
        });
      }
      throw new Error("Unexpected " + url);
    });
    vi.stubGlobal("fetch", request);
    await mount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(accepted).toBe(5);
    expect(container.textContent).toContain("Сможешь попасть в цвет?");
    expect(
      JSON.parse(localStorage.getItem(RANKED_PENDING_KEY)!)[0].published,
    ).toBe(true);
    expect(request.mock.calls.some(([url]) => url === "/api/games")).toBe(
      false,
    );
  });
});
