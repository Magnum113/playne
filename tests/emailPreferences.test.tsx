// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { EmailPreferences } from "../src/EmailPreferences";
import LeaderboardPage from "../src/LeaderboardPage";
import {
  captureEmailNavigation,
  getEmailAction,
  initEmailReturnTracking,
} from "../src/emailNavigation";
let root: Root, box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/account/");
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
});
describe("Email entry safety", () => {
  it("removes the capability from the URL while retaining it only for the action", () => {
    window.history.replaceState(
      null,
      "",
      "/account/?mail=confirm#local-capability",
    );
    captureEmailNavigation();
    expect(location.hash).toBe("");
    expect(getEmailAction()).toEqual({
      kind: "confirm",
      token: "local-capability",
    });
  });
  it("does not count scripted/scanner events as human return", () => {
    window.history.replaceState(null, "", "/colorfle/?from_email=1");
    const remote = vi.fn();
    vi.stubGlobal("fetch", remote);
    initEmailReturnTracking();
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(remote).not.toHaveBeenCalled();
  });
  it("does not submit a subscription after its checkbox is cleared, including Enter/form submit", async () => {
    const remote = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            available: true,
            email: "qa@example.com",
            enabled: false,
            pending: false,
            verified: false,
          }),
        ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<EmailPreferences />));
    expect(
      box.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked,
    ).toBe(false);
    act(() =>
      box.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
    );
    act(() =>
      box.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1].click(),
    );
    act(() =>
      box.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
    );
    await act(async () => {
      box
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(remote.mock.calls).toHaveLength(1);
    expect(box.textContent).toContain("Подтверди согласие");
  });
  it("opens the all-time board requested by an email link", () => {
    window.history.replaceState(
      null,
      "",
      "/leaderboard/?game=geo&mode=landmarks&period=all",
    );
    const html = renderToStaticMarkup(<LeaderboardPage />);
    const doc = document.createElement("div");
    doc.innerHTML = html;
    const buttons = Array.from(doc.querySelectorAll("button"));
    expect(
      buttons
        .find((b) => b.textContent === "Всё время")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      buttons
        .find((b) => b.textContent === "Неделя")
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
