// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, GuestTrialPrompt } from "../src/account";
import { GameStartAction } from "../src/GameIntro";
let root: Root, box: HTMLDivElement;
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
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
  it("explains the free party and starts it without login", async () => {
    const start = await render({ user: null, trials: {} });
    expect(box.textContent).toContain("Первая партия — без входа");
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
    expect(box.querySelector("button")!.disabled).toBe(true);
    expect(box.textContent).toContain("Попробовать ещё раз");
  });
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
