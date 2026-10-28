// @vitest-environment happy-dom
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../src/account";
import { ACCOUNT_GOALS, METRIKA_COUNTER_ID } from "../src/analytics";

let root: Root, box: HTMLDivElement;
const user = { id: "confirmed-user", nickname: "Игрок" };
const ym = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  window.history.replaceState(null, "", "/account/");
  window.ym = ym;
  ym.mockReset();
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  delete window.ym;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(signedIn = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ user: signedIn ? user : null, trials: {} }),
        ),
    ),
  );
  await act(async () =>
    root.render(
      <StrictMode>
        <AuthProvider>
          <p>Playne</p>
        </AuthProvider>
      </StrictMode>,
    ),
  );
}
const successes = () =>
  ym.mock.calls.filter((call) => call[2] === ACCOUNT_GOALS.loginSuccess);
describe("successful Yandex authentication analytics", () => {
  it.each([
    "/account/",
    "/naglaz/",
    "/circle/",
    "/colorfle/",
    "/geo/",
    "/pressure/",
  ])(
    "reports exactly one confirmed login on %s",
    async (path) => {
      window.history.replaceState(
        null,
        "",
        `${path}?mode=timed&auth=success#game`,
      );
      await mount();
      expect(successes()).toEqual([
        [
          METRIKA_COUNTER_ID,
          "reachGoal",
          "account_yandex_login_success",
          { provider: "yandex" },
        ],
      ]);
      expect(window.location.search).toBe("?mode=timed");
      expect(window.location.hash).toBe("#game");
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new Event("online"));
      });
      expect(successes()).toHaveLength(1);
      act(() => root.unmount());
      root = createRoot(box);
      await act(async () =>
        root.render(
          <AuthProvider>
            <p>Повторное открытие</p>
          </AuthProvider>,
        ),
      );
      expect(successes()).toHaveLength(1);
    },
  );
  it.each(["cancelled", "failed", "expired", ""])(
    "does not count an ordinary visit or auth=%s as a login",
    async (status) => {
      window.history.replaceState(
        null,
        "",
        "/account/" + (status ? `?auth=${status}` : ""),
      );
      await mount();
      expect(successes()).toHaveLength(0);
    },
  );
  it("waits for the server to confirm the session even when the URL says success", async () => {
    window.history.replaceState(null, "", "/account/?auth=success");
    await mount(false);
    expect(successes()).toHaveLength(0);
    expect(window.location.search).toContain("auth=success");
  });
  it("waits through a network error, then reports only after a confirmed retry", async () => {
    window.history.replaceState(null, "", "/account/?auth=success");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await act(async () =>
      root.render(
        <AuthProvider>
          <p>Playne</p>
        </AuthProvider>,
      ),
    );
    expect(successes()).toHaveLength(0);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ user, trials: {} }))),
    );
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(successes()).toHaveLength(1);
  });
  it("does not duplicate the goal when URL cleanup is unavailable", async () => {
    window.history.replaceState(null, "", "/account/?auth=success");
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {
      throw new Error("history unavailable");
    });
    await mount();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(successes()).toHaveLength(1);
  });
});
