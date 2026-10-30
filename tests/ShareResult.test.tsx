// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShareResult from "../src/ShareResult";
import type { PublicChallenge } from "../src/challenges";
import { SHARE_GOALS } from "../src/analytics";

const mock = vi.hoisted(() => ({
  api: vi.fn(),
  goal: vi.fn(),
  user: { id: "one" } as { id: string } | null,
  loading: false,
}));
vi.mock("../src/account", () => ({
  api: (...args: unknown[]) => mock.api(...args),
  useAuth: () => ({ user: mock.user, loading: mock.loading }),
}));
vi.mock("../src/analytics", async (original) => ({
  ...(await original<typeof import("../src/analytics")>()),
  reachGoal: (...args: unknown[]) => mock.goal(...args),
}));
const value = (token = "shared-one", score = 400): PublicChallenge => ({
  token,
  url: `https://playne.ru/brain/flash/?challenge=${token}`,
  imageUrl: `https://playne.ru/api/challenges/${token}/preview.png`,
  game: "flash",
  gameName: "Вспышка",
  nickname: "Игрок",
  score,
  maxScore: 500,
  day: "2026-10-30",
  mode: "classic",
  isTodayDaily: true,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let box: HTMLDivElement, root: Root;
const button = (text: string) =>
  [...box.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() === text,
  )!;
const dialog = () => box.querySelector<HTMLDialogElement>("dialog")!;
const render = async (runId: string | undefined = "run-one") => {
  await act(async () => root.render(<ShareResult runId={runId} />));
};
const click = async (text: string) => {
  await act(async () => button(text).click());
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mock.user = { id: "one" };
  mock.loading = false;
  mock.api.mockResolvedValue(value());
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: undefined,
  });
  // happy-dom does not implement the browser's native modal focus lifecycle.
  // Keep the component on showModal()/close(), and emulate only those semantics.
  const returnFocus = new WeakMap<HTMLDialogElement, HTMLElement | null>();
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      returnFocus.set(this, document.activeElement as HTMLElement | null);
      this.setAttribute("open", "");
      this.querySelector<HTMLButtonElement>("button")?.focus();
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    if (!this.open) return;
    this.removeAttribute("open");
    returnFocus.get(this)?.focus();
    this.dispatchEvent(new Event("close"));
  });
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("explicit result sharing", () => {
  it("does not publish until explicitly opened, then creates one link and its PNG preview", async () => {
    await render();
    expect(mock.api).not.toHaveBeenCalled();
    expect(dialog().open).toBe(false);
    await click("Бросить вызов ↗");
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(mock.api).toHaveBeenCalledExactlyOnceWith("/challenges", "POST", {
      runId: "run-one",
    });
    const image = box.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(value().imageUrl);
    expect(image.getAttribute("width")).toBe("1200");
    expect(image.getAttribute("height")).toBe("630");
    expect(image.alt).toContain("400 / 500");
    expect(box.textContent).toContain("По ссылке видны ник и результат");
  });
  it("uses the labelled native dialog, returns focus on close, and reopens the existing link", async () => {
    await render();
    const trigger = button("Бросить вызов ↗");
    trigger.focus();
    await click("Бросить вызов ↗");
    expect(dialog().getAttribute("aria-labelledby")).toBe(
      box.querySelector("h2")!.id,
    );
    expect(document.activeElement).toBe(
      box.querySelector('[aria-label="Закрыть приглашение"]'),
    );
    await act(async () =>
      box
        .querySelector<HTMLButtonElement>('[aria-label="Закрыть приглашение"]')!
        .click(),
    );
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    await click("Бросить вызов ↗");
    expect(mock.api).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(true);
    await act(async () =>
      dialog().dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(dialog().open).toBe(false);
  });
  it("copies the public link, and falls back to selecting it when clipboard fails", async () => {
    await render();
    await click("Бросить вызов ↗");
    await click("Скопировать ссылку");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(value().url);
    expect(box.textContent).toContain("Ссылка скопирована");
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("denied"),
    );
    await click("Скопировать ссылку");
    const input = box.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(value().url.length);
    expect(box.textContent).toContain("скопируй её вручную");
  });
  it("shares the precise result and treats native cancellation as a normal dismissal", async () => {
    const share = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("cancelled"), { name: "AbortError" }),
      )
      .mockResolvedValueOnce(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    await render();
    await click("Бросить вызов ↗");
    await click("Поделиться");
    expect(share).toHaveBeenCalledWith({
      title: "Вспышка · 400 / 500",
      text: "Побьёшь мой результат?",
      url: value().url,
    });
    expect(box.textContent).not.toContain("Поделиться не получилось");
    expect(mock.goal).not.toHaveBeenCalledWith(
      SHARE_GOALS.sent,
      expect.anything(),
    );
    const before = mock.goal.mock.calls.length;
    await click("Поделиться");
    expect(mock.goal.mock.calls.length).toBe(before + 1);
  });
  it("uses a repeat-result invitation at the maximum 500 score and recovers from share failure", async () => {
    const share = vi.fn().mockRejectedValue(new Error("unavailable"));
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    mock.api.mockResolvedValue(value("perfect", 500));
    await render();
    await click("Бросить вызов ↗");
    await click("Поделиться");
    expect(share.mock.calls[0][0].text).toBe(
      "Сможешь повторить мой результат?",
    );
    expect(box.textContent).toContain("Можно скопировать ссылку");
    expect(box.querySelector("input")!.value).toBe(value("perfect", 500).url);
  });
  it("keeps creation errors inside the dialog and retries without leaving the result", async () => {
    mock.api
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(value());
    await render();
    await click("Бросить вызов ↗");
    expect(box.textContent).toContain("Не удалось подготовить ссылку");
    expect(dialog().open).toBe(true);
    await click("Подготовить ссылку");
    expect(mock.api).toHaveBeenCalledTimes(2);
    expect(box.querySelector("img")).not.toBeNull();
  });
  it("ignores a late create response after identity and run change", async () => {
    const old = deferred<PublicChallenge>();
    mock.api
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(value("new-account"));
    await render();
    await click("Бросить вызов ↗");
    expect(box.textContent).toContain("Готовим превью");
    mock.user = { id: "two" };
    await render("run-two");
    expect(dialog().open).toBe(false);
    await click("Бросить вызов ↗");
    await act(async () => old.resolve(value("private-old")));
    expect(box.querySelector("input")!.value).toContain("new-account");
    expect(box.textContent).not.toContain("private-old");
  });
  it.each(["copy", "share"] as const)(
    "ignores a late %s failure after the invitation scope has changed",
    async (action) => {
      const old = deferred<void>();
      if (action === "copy")
        vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(
          old.promise,
        );
      else
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: vi.fn().mockReturnValueOnce(old.promise),
        });
      mock.api
        .mockResolvedValueOnce(value())
        .mockResolvedValueOnce(value("new-scope"));
      await render();
      await click("Бросить вызов ↗");
      await click(action === "copy" ? "Скопировать ссылку" : "Поделиться");
      mock.user = { id: "two" };
      await render("run-two");
      await click("Бросить вызов ↗");
      await act(async () => old.reject(new Error("late denied")));
      expect(box.querySelector("input")?.value).toContain("new-scope");
      expect(box.textContent).not.toContain("скопируй её вручную");
      expect(box.textContent).not.toContain("Поделиться не получилось");
      expect(document.activeElement).not.toBe(box.querySelector("input"));
    },
  );
  it("does not create without a result or while authentication is loading", async () => {
    await act(async () => root.render(<ShareResult />));
    expect(box.innerHTML).toBe("");
    mock.loading = true;
    await render();
    expect(button("Бросить вызов ↗").disabled).toBe(true);
    await click("Бросить вызов ↗");
    expect(mock.api).not.toHaveBeenCalled();
  });
});
