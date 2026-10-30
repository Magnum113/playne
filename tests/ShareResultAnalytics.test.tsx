// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import ShareResult from "../src/ShareResult";
const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/account", () => ({
  api: (...args: unknown[]) => mock.api(...args),
  useAuth: () => ({ user: null, loading: false }),
}));
let root: Root, box: HTMLDivElement;
let ym = vi.fn();
const source = {
  game: "circle",
  gameName: "Круг",
  token: "private-token",
  url: "https://playne.ru/c/short",
  imageUrl: "/preview.png",
  score: 75,
  maxScore: 100,
  mode: "classic",
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  ym = vi.fn();
  window.ym = ym;
  window.history.replaceState(null, "", "/circle/");
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  mock.api.mockReset();
  mock.api.mockResolvedValue(source);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  delete window.ym;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const click = async (text: string) => {
  await act(async () =>
    Array.from(box.querySelectorAll("button"))
      .find((b) => b.textContent?.includes(text))!
      .click(),
  );
};
const events = () =>
  ym.mock.calls.filter((c) => c[1] === "reachGoal").map((c) => c[2]);
it("counts successful copying, but no false share on native cancellation or a clipboard failure", async () => {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: vi
      .fn()
      .mockRejectedValue(new DOMException("cancelled", "AbortError")),
  });
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  await act(async () => root.render(<ShareResult runId="private-run" />));
  await click("Бросить вызов");
  await click("Поделиться");
  await click("Скопировать ссылку");
  expect(events()).toEqual([
    "playne_challenge_dialog_open",
    "playne_challenge_created",
    "playne_challenge_share_cancelled",
    "playne_challenge_copied",
  ]);
  copy.mockRejectedValueOnce(Error("clipboard permission private details"));
  await click("Скопировать ссылку");
  expect(events().at(-1)).toBe("playne_challenge_error");
  expect(events().filter((e) => e === "playne_challenge_copied")).toHaveLength(
    1,
  );
  expect(JSON.stringify(ym.mock.calls)).not.toMatch(
    /private-token|private-run|private details|https:/,
  );
});
it("records native completion only after success", async () => {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  await act(async () => root.render(<ShareResult runId="run2" />));
  await click("Бросить вызов");
  await click("Поделиться");
  expect(events()).toContain("playne_challenge_shared");
});
