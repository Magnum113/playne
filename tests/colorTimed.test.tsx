// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newShadeSession,
  saveShadeSession,
  shadeReducer,
  SHADE_KEY,
  type ShadeSession,
} from "../src/colorfle";
let root: Root | undefined, container: HTMLDivElement;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  root = undefined;
});
describe("timed shade lifecycle", () => {
  it.each([false, true])(
    "uses the original deadline after reload and automatically submits exactly once (chosen: %s)",
    async (chosen) => {
      vi.useFakeTimers();
      vi.resetModules();
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      localStorage.clear();
      const id = "22222222-2222-4222-8222-222222222222";
      const deadline = Date.now() + 5000;
      let state: ShadeSession = {
        ...newShadeSession(undefined, Math.random, "timed"),
        rankedId: id,
      };
      state = shadeReducer(state, { type: "start" });
      if (chosen)
        state = shadeReducer(state, { type: "pick", color: state.targets[0] });
      saveShadeSession(state);
      let accepted = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          let data: any;
          if (url === "/api/me") data = { user: null };
          else if (url === `/api/games/${id}`)
            data = {
              id,
              game: "colorfle",
              mode: "timed",
              challenge: {
                targets: state.targets,
                mode: "timed",
                timers: { 0: { deadline } },
              },
              answers: [],
            };
          else if (url.endsWith("/ready"))
            data = { deadline, serverNow: Date.now() };
          else if (url.endsWith("/choice")) data = { ok: true };
          else if (url.endsWith("/answers")) {
            accepted++;
            data = {
              answer: {
                choice: chosen ? state.targets[0] : null,
                score: chosen ? 100 : 0,
                timedOut: true,
              },
              completed: false,
              published: false,
            };
          } else throw new Error("Unexpected " + url);
          return new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" },
          });
        }),
      );
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
      expect(container.querySelector("[role=timer]")?.textContent).toBe("0:05");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(accepted).toBe(1);
      expect(container.textContent).toContain(
        chosen
          ? "Засчитан последний выбранный оттенок."
          : "Цвет не выбран — 0 очков.",
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(accepted).toBe(1);
      expect(
        JSON.parse(localStorage.getItem(SHADE_KEY)!).answers[0].score,
      ).toBe(chosen ? 100 : 0);
    },
  );
});
