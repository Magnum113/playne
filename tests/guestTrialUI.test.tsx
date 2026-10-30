// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthProvider,
  GuestTrialPrompt,
  guestLoginReturn,
} from "../src/account";
import { GameStartAction } from "../src/GameIntro";
let root: Root, box: HTMLDivElement;
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  window.history.replaceState(null, "", "/colorfle/");
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
});
async function render(data: any, onStart = vi.fn()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );
  await act(async () =>
    root.render(
      <AuthProvider>
        <GameStartAction game="colorfle" onStart={onStart} />
      </AuthProvider>,
    ),
  );
  return onStart;
}
describe("guest party entry", () => {
  it("starts the free party without a login caption on the welcome screen", async () => {
    const start = await render({ user: null, trials: {} });
    expect(box.textContent).not.toContain("Первая партия — без входа");
    act(() => box.querySelector("button")!.click());
    expect(start).toHaveBeenCalledTimes(1);
  });
  it("offers the reserved party, never a new one, while unfinished", async () => {
    await render({
      user: null,
      trials: { colorfle: { id, mode: "timed", completed: false } },
    });
    expect(box.querySelector("button")!.textContent).toContain(
      "Продолжить партию",
    );
    expect(box.textContent).toContain("Режим сохранён");
  });
  it("replaces replay with Yandex login when the free party is consumed", async () => {
    await render({
      user: null,
      trials: { colorfle: { id, completed: true, score: 350 } },
    });
    expect(box.querySelector("button")!.textContent).toContain(
      "Войти и продолжить",
    );
    expect(box.textContent).not.toContain("Начать игру");
  });
  it("lets signed-in players start another party even after using the trial", async () => {
    const start = await render({
      user: { id: "user", nickname: "Игрок" },
      trials: { colorfle: { id, completed: true } },
    });
    expect(box.textContent).not.toContain("Первая партия");
    act(() => box.querySelector("button")!.click());
    expect(start).toHaveBeenCalledTimes(1);
  });
  it("does not allow play when checking access fails, and offers retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await act(async () =>
      root.render(
        <AuthProvider>
          <GameStartAction game="naglaz" onStart={vi.fn()} />
        </AuthProvider>,
      ),
    );
    expect(box.querySelector("button")!.disabled).toBe(false);
    expect(box.querySelector("button")!.textContent).toContain(
      "Повторить проверку",
    );
    expect(box.querySelector("button")!.getAttribute("aria-busy")).toBe(
      "false",
    );
  });
  it("shows the pending state while retrying a failed access check and recovers", async () => {
    let resolve: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      );
    vi.stubGlobal("fetch", fetch);
    await act(async () =>
      root.render(
        <AuthProvider>
          <GameStartAction game="naglaz" onStart={vi.fn()} />
        </AuthProvider>,
      ),
    );
    act(() =>
      [...box.querySelectorAll("button")]
        .find((b) => b.textContent?.includes("Повторить проверку"))!
        .click(),
    );
    expect(box.textContent).toContain("Проверяем доступ");
    expect(box.textContent).not.toContain("Повторить проверку");
    await act(async () =>
      resolve!(new Response(JSON.stringify({ user: null, trials: {} }))),
    );
    expect(box.querySelector("button")!.disabled).toBe(false);
  });
  it("refreshes the consumed trial when another tab updates the result queue", async () => {
    await render({ user: null, trials: {} });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              user: null,
              trials: { colorfle: { id, completed: true } },
            }),
          ),
      ),
    );
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "playne:ranked-pending:v1",
          oldValue: JSON.stringify([{ key: id, completed: false }]),
          newValue: JSON.stringify([{ key: id, completed: true }]),
        }),
      ),
    );
    expect(box.querySelector("button")!.textContent).toContain(
      "Войти и продолжить",
    );
  });
  it("does not recheck access for every pointer or answer update in another tab", async () => {
    await render({ user: null, trials: {} });
    const request = vi.fn(
      async () => new Response(JSON.stringify({ user: null, trials: {} })),
    );
    vi.stubGlobal("fetch", request);
    await act(async () => {
      for (let i = 0; i < 10; i++)
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "playne:ranked-pending:v1",
            oldValue: JSON.stringify([{ key: id, completed: false }]),
            newValue: JSON.stringify([
              {
                key: id,
                completed: false,
                pins: { 0: { h: i, s: 50, v: 75 } },
              },
            ]),
          }),
        );
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("explains a cancelled login without losing the result or offering a new trial", async () => {
    window.history.replaceState(null, "", "/colorfle/?auth=cancelled");
    await render({ user: null, trials: { colorfle: { id, completed: true } } });
    expect(box.textContent).toContain("Вход отменён. Результат сохранён");
    expect(box.querySelector("button")!.textContent).toContain(
      "Войти и продолжить",
    );
  });
  it("confirms the saved result after returning from Yandex", async () => {
    window.history.replaceState(
      null,
      "",
      `/colorfle/?saved=${id}&auth=success`,
    );
    await render({
      user: { id: "user", nickname: "Игрок" },
      trials: { colorfle: { id, completed: true, published: true } },
    });
    expect(box.textContent).toContain("Результат сохранён в рейтинг");
    expect(box.querySelector("button")!.textContent).toContain("Начать игру");
    expect(window.location.search).not.toContain("auth=success");
  });
  it("keeps the selected game mode when returning from login", () => {
    expect(guestLoginReturn("geo", id, "landmarks-timed")).toBe(
      `/geo/?saved=${id}&mode=landmarks-timed`,
    );
    expect(guestLoginReturn("colorfle", id, "timed")).toBe(
      `/colorfle/?saved=${id}&mode=timed`,
    );
    expect(guestLoginReturn("circle", id, "timed")).toBe(
      `/circle/?saved=${id}`,
    );
  });
  it.each(["line", "flash", "rotate", "slide", "dispatch"] as const)(
    "keeps a %s invitation ahead of an older saved guest result on login",
    (game) => {
      const path = game === "line" ? "/one-line/" : `/brain/${game}/`;
      const token = "aB_9-".repeat(8) + "xyz";
      window.history.replaceState(
        null,
        "",
        `${path}?challenge=${token}&saved=${id}&mode=practice`,
      );
      expect(guestLoginReturn(game, id, "practice")).toBe(
        `${path}?challenge=${token}`,
      );
    },
  );
  it.each(["short", "a".repeat(44), "a".repeat(42) + "/", ""])(
    "keeps ordinary saved-result recovery for an invalid invitation: %s",
    (token) => {
      window.history.replaceState(
        null,
        "",
        `/one-line/?challenge=${encodeURIComponent(token)}`,
      );
      expect(guestLoginReturn("line", id, "practice")).toBe(
        `/one-line/?saved=${id}&mode=practice`,
      );
    },
  );
  it("does not transfer a challenge to a game without invitation support", () => {
    window.history.replaceState(
      null,
      "",
      `/circle/?challenge=${"a".repeat(43)}`,
    );
    expect(guestLoginReturn("circle", id)).toBe(`/circle/?saved=${id}`);
  });
  it.each(["welcome", "finished"] as const)(
    "keeps the invitation in the real %s guest login navigation",
    async (surface) => {
      const token = "b".repeat(43);
      window.history.replaceState(
        null,
        "",
        `/brain/flash/?challenge=${token}`,
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({
          user: null,
          trials: { flash: { id, mode: "classic", completed: true } },
        }))),
      );
      const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
      try {
        await act(async () => root.render(
          <AuthProvider>
            {surface === "welcome" ? (
              <GameStartAction game="flash" onStart={vi.fn()} />
            ) : (
              <GuestTrialPrompt game="flash" id={id} />
            )}
          </AuthProvider>,
        ));
        await act(async () => box.querySelector("button")!.click());
        expect(assign).toHaveBeenCalledTimes(1);
        const target = new URL(String(assign.mock.calls[0][0]), location.origin);
        expect(target.pathname).toBe("/api/auth/yandex/start");
        expect(target.searchParams.get("return")).toBe(
          `/brain/flash/?challenge=${token}`,
        );
      } finally {
        assign.mockRestore();
      }
    },
  );
  it("shows a complete-party prompt with a clear save promise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ user: null, trials: {} })),
      ),
    );
    await act(async () =>
      root.render(
        <AuthProvider>
          <GuestTrialPrompt game="circle" id={id} />
        </AuthProvider>,
      ),
    );
    expect(box.textContent).toContain("Сыграем ещё?");
    expect(box.textContent).toContain("сохранить результат в рейтинг");
  });
});
