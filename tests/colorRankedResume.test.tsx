// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  newShadeSession,
  shadeReducer,
  saveShadeSession,
  SHADE_KEY,
  LEGACY_SHADE_KEY,
  legacyShadeScore,
} from "../src/colorfle";
import { RANKED_PENDING_KEY } from "../src/rankedQueue";
let root: Root | undefined, container: HTMLDivElement;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  root = undefined;
});
describe("color game restoration", () => {
  it.each([
    { withId: false, cached: false },
    { withId: true, cached: false },
    { withId: true, cached: true },
  ])(
    "saves or refreshes a finished party after reload without replay: %j",
    async ({ withId, cached }) => {
      vi.useFakeTimers();
      vi.resetModules();
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      localStorage.clear();
      const id = "11111111-1111-4111-8111-111111111111";
      let session = newShadeSession(undefined, () => 0.37);
      if (withId) session = { ...session, rankedId: id };
      session = shadeReducer(session, { type: "start" });
      for (let i = 0; i < 5; i++) {
        session = shadeReducer(session, {
          type: "pick",
          color: { h: 180, s: 50, v: 75 },
        });
        session = shadeReducer(session, { type: "submit" });
        if (i < 4) session = shadeReducer(session, { type: "next" });
      }
      saveShadeSession(session);
      const score = session.answers.reduce((sum, a) => sum + a.score, 0);
      let legacyRaw = "";
      if (cached) {
        const answers = session.answers.map((a, i) => ({
          ...a,
          score: legacyShadeScore(a.choice, session.targets[i]),
        }));
        const oldScore = answers.reduce((sum, a) => sum + a.score, 0);
        legacyRaw = JSON.stringify({
          ...session,
          scoringVersion: undefined,
          answers,
          stats: { played: 1, best: oldScore },
        });
        localStorage.removeItem(SHADE_KEY);
        localStorage.setItem(LEGACY_SHADE_KEY, legacyRaw);
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
                version: 1,
                challenge: { targets: session.targets },
                answers,
                score: oldScore,
                completed: true,
                published: true,
              },
              score: oldScore,
              completed: true,
              published: true,
              updated: Date.now(),
              tasks: [],
              pins: {},
              results: {},
            },
          ]),
        );
      }
      const calls: string[] = [];
      let accepted = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          calls.push(url);
          let data: any;
          if (url === "/api/me")
            data = {
              user: {
                id: "test-user",
                nickname: "Тест",
                nickname_confirmed: true,
              },
            };
          else if (url === "/api/games/resume" || url === `/api/games/${id}`)
            data = {
              id,
              game: "colorfle",
              version: 2,
              challenge: {
                targets: session.targets.map((c) => ({
                  v: c.v,
                  s: c.s,
                  h: c.h,
                })),
              },
              answers: cached ? session.answers : [],
              completed: cached,
              published: cached,
              score: cached ? score : null,
            };
          else if (url.endsWith("/answers")) {
            const body = JSON.parse(String(init?.body));
            expect(body.index).toBe(accepted++);
            data = {
              answer: { score: session.answers[body.index].score },
              completed: accepted === 5,
              published: accepted === 5,
              score:
                accepted === 5
                  ? session.answers.reduce((s, a) => s + a.score, 0)
                  : null,
            };
          } else throw new Error("Unexpected request: " + url);
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
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.textContent).toContain("Результат сохранён в рейтинг.");
      expect(container.textContent).not.toContain("начни новую партию");
      expect(accepted).toBe(cached ? 0 : 5);
      expect(calls).not.toContain("/api/games");
      if (cached) {
        expect(calls).toContain(`/api/games/${id}`);
        expect(container.textContent).toContain(`${score} из 500`);
        expect(localStorage.getItem(LEGACY_SHADE_KEY)).toBe(legacyRaw);
        expect(
          JSON.parse(localStorage.getItem(SHADE_KEY)!).scoringVersion,
        ).toBe(2);
      }
    },
  );
});
