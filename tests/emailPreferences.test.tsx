// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { EmailPreferences, YandexLogin } from "../src/EmailPreferences";
import FooterSignup from "../src/FooterSignup";
import {
  EMAIL_CONSENT_VERSION,
  EMAIL_LABEL,
  EMAIL_DESCRIPTION,
  EMAIL_SETTINGS_UPDATED,
} from "../src/emailConsent";
import LeaderboardPage from "../src/LeaderboardPage";
import {
  captureEmailNavigation,
  getEmailAction,
  initEmailReturnTracking,
} from "../src/emailNavigation";
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("../src/account", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/account")>()),
  useAuth: () => ({
    user: auth.user,
    loading: false,
    ready: true,
    emailSignupAvailable: true,
  }),
}));
let root: Root, box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/account/");
  auth.user = null;
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
  it("does not let an older event refresh undo a completed account unsubscribe", async () => {
    const initial = {
      available: true,
      email: "qa@example.com",
      enabled: true,
      pending: false,
      verified: true,
      purpose: "general",
    };
    let finishOld!: (response: Response) => void;
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: any, options?: any) => {
        if (options?.method === "POST")
          return new Response(JSON.stringify({ ...initial, enabled: false }));
        if (++reads === 2)
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        return new Response(JSON.stringify(initial));
      }),
    );
    await act(async () => root.render(<EmailPreferences />));
    await act(async () =>
      window.dispatchEvent(new Event(EMAIL_SETTINGS_UPDATED)),
    );
    const unsubscribe = [
      ...box.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Отключить письма")!;
    await act(async () => unsubscribe.click());
    await act(async () => finishOld(new Response(JSON.stringify(initial))));
    expect(box.textContent).toContain("Подписка выключена.");
    expect(box.textContent).not.toContain("Подписка включена.");
  });
  it("updates account controls after subscribing in the footer, and updates the footer after account unsubscribe", async () => {
    auth.user = { id: "footer-account-sync" };
    let enabled = false;
    const remote = vi.fn(async (_url: any, options?: any) => {
      if (options?.method === "POST")
        enabled = JSON.parse(options.body).enabled;
      return new Response(
        JSON.stringify({
          available: true,
          email: "qa@example.com",
          yandexEmail: "qa@example.com",
          enabled,
          pending: false,
          verified: true,
          purpose: enabled ? "general" : null,
        }),
      );
    });
    vi.stubGlobal("fetch", remote);
    await act(async () =>
      root.render(
        <>
          <EmailPreferences />
          <FooterSignup />
        </>,
      ),
    );
    expect(box.querySelector(".email-settings")?.textContent).toContain(
      "Подписка выключена.",
    );
    await act(async () =>
      box.querySelector<HTMLInputElement>(".footer-signup input")!.click(),
    );
    expect(box.querySelector(".footer-signup")).toBeNull();
    expect(box.querySelector(".email-settings")?.textContent).toContain(
      "Подписка включена.",
    );
    const unsubscribe = [
      ...box.querySelectorAll<HTMLButtonElement>(".email-settings button"),
    ].find((button) => button.textContent === "Отключить письма")!;
    expect(unsubscribe).toBeDefined();
    await act(async () => unsubscribe.click());
    expect(box.querySelector(".email-settings")?.textContent).toContain(
      "Подписка выключена.",
    );
    expect(box.querySelector(".footer-signup input")).not.toBeNull();
    expect(
      remote.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(2);
  });
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
  it("shows immediate success for a Yandex address without asking for an email confirmation", async () => {
    const remote = vi.fn(
      async (_: any, options: any) =>
        new Response(
          JSON.stringify({
            available: true,
            email: "qa@example.com",
            yandexEmail: "qa@example.com",
            enabled: options?.method === "POST",
            pending: false,
            verified: options?.method === "POST",
          }),
        ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<EmailPreferences />));
    expect(box.textContent).toContain(
      "Адрес из Яндекса. Подтверждать не нужно.",
    );
    act(() =>
      box.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
    );
    act(() =>
      box.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1].click(),
    );
    await act(async () =>
      box
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(box.textContent).toContain("Письма подключены.");
    expect(box.textContent).toContain("Подписка включена.");
    expect(box.textContent).not.toContain("Отправим письмо с подтверждением");
  });
  it("allows opt-out even while the mail service is unavailable", async () => {
    const remote = vi.fn(
      async (_: any, options: any) =>
        new Response(
          JSON.stringify({
            available: false,
            email: "qa@example.com",
            enabled: options?.method === "POST" ? false : true,
            pending: false,
            verified: true,
          }),
        ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<EmailPreferences />));
    const off = Array.from(box.querySelectorAll("button")).find(
      (b) => b.textContent === "Отключить письма",
    )!;
    expect(off).toBeTruthy();
    await act(async () => off.click());
    expect(remote.mock.calls[1][1].body).toBe(
      JSON.stringify({ enabled: false }),
    );
    expect(box.textContent).toContain("Письма отключены.");
  });
  it("offers one unchecked general subscription at login without making email access depend on it", async () => {
    await act(async () => root.render(<YandexLogin returnPath="/account/" />));
    expect(box.textContent).toContain(EMAIL_LABEL);
    expect(box.textContent).toContain(EMAIL_DESCRIPTION);
    expect(box.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(
      box.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
    expect(box.textContent).toContain("Войти через Яндекс");
  });
  it("requires a new unchecked consent to upgrade an existing rank-only subscriber", async () => {
    const remote = vi.fn(
      async (_url: any, options: any) =>
        new Response(
          JSON.stringify({
            available: true,
            email: "qa@example.com",
            yandexEmail: "qa@example.com",
            enabled: true,
            pending: false,
            verified: true,
            purpose: options?.method === "POST" ? "general" : "rank",
          }),
        ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<EmailPreferences />));
    expect(box.textContent).toContain("нужно новое согласие");
    expect(
      box.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
    expect(remote).toHaveBeenCalledTimes(1);
    act(() =>
      box.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    act(() =>
      box
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
        .click(),
    );
    await act(async () =>
      box
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(JSON.parse(remote.mock.calls[1][1].body)).toMatchObject({
      enabled: true,
      consentVersion: EMAIL_CONSENT_VERSION,
      dataConsent: true,
    });
    expect(box.textContent).toContain("Письма подключены");
  });
  it("shows the optional footer offer without requesting a top-ten board or repeating the email field", async () => {
    auth.user = { id: "ordinary-player" };
    const remote = vi.fn(
      async (_url: any, _options?: any) =>
        new Response(
          JSON.stringify({
            available: true,
            email: "qa@example.com",
            enabled: false,
            pending: false,
            verified: false,
            purpose: null,
          }),
        ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<FooterSignup />));
    expect(remote.mock.calls).toHaveLength(1);
    expect(remote.mock.calls[0][0]).toBe("/api/email/settings");
    expect(box.textContent).toContain(EMAIL_LABEL);
    expect(box.textContent).not.toContain("топ-10");
    expect(box.querySelector("button.primary")).toBeNull();
    expect(box.querySelector('input[type="email"]')).toBeNull();
    expect(box.textContent).not.toContain("qa@example.com");
    expect(
      box.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
  });
  it("saves native weekday/time controls separately from subscription consent", async () => {
    const reminders = {
      enabled: true,
      days: [1, 3, 5],
      time: "19:00",
      timezone: "Europe/Moscow",
    };
    const remote = vi.fn(
      async (_url: any, options: any) =>
        new Response(
          JSON.stringify({
            available: true,
            email: "qa@example.com",
            enabled: true,
            pending: false,
            verified: true,
            purpose: "general",
            reminders:
              options?.method === "POST"
                ? { ...reminders, ...JSON.parse(options.body) }
                : reminders,
          }),
        ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<EmailPreferences />));
    const time = box.querySelector<HTMLInputElement>('input[type="time"]')!;
    expect(time.value).toBe("19:00");
    expect(time.min).toBe("10:00");
    expect(time.max).toBe("20:59");
    const days = box.querySelectorAll<HTMLInputElement>("fieldset input");
    expect(
      [...days]
        .map((input, index) => (input.checked ? index + 1 : 0))
        .filter(Boolean),
    ).toEqual([1, 3, 5]);
    act(() => days[0].click());
    await act(async () =>
      box
        .querySelector(".email-reminders-form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(remote.mock.calls[1][0]).toBe("/api/email/reminders");
    expect(JSON.parse(remote.mock.calls[1][1].body)).toEqual({
      enabled: true,
      days: [3, 5],
      time: "19:00",
    });
    expect(box.textContent).toContain("Напоминания настроены");
  });
  it("associates a missing address with its field and does not send a subscription", async () => {
    const remote = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            available: true,
            email: "",
            enabled: false,
            pending: false,
            verified: false,
          }),
        ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<EmailPreferences />));
    act(() =>
      box.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
    );
    act(() =>
      box.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1].click(),
    );
    await act(async () => {
      box
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    const input = box.querySelector<HTMLInputElement>("input[type=email]")!;
    expect(input.classList.contains("ui-input")).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(input.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toBe("Введи электронную почту.");
    expect(document.activeElement).toBe(input);
    expect(remote).toHaveBeenCalledTimes(1);
  });
  it("links the trusted address hint and exposes pending saves without marking request errors as invalid email", async () => {
    let complete!: (response: Response) => void;
    const remote = vi.fn(async (_: any, options: any) =>
      options?.method === "POST"
        ? new Promise<Response>((resolve) => {
            complete = resolve;
          })
        : new Response(
            JSON.stringify({
              available: true,
              email: "qa@example.com",
              yandexEmail: "qa@example.com",
              enabled: false,
              pending: false,
              verified: true,
            }),
          ),
    );
    vi.stubGlobal("fetch", remote);
    await act(async () => root.render(<EmailPreferences />));
    const input = box.querySelector<HTMLInputElement>("input[type=email]")!;
    expect(
      document.getElementById(input.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("Адрес из Яндекса");
    act(() =>
      box.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(),
    );
    act(() =>
      box.querySelectorAll<HTMLInputElement>("input[type=checkbox]")[1].click(),
    );
    await act(async () => {
      box
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(box.querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    expect(input.disabled).toBe(true);
    await act(async () => {
      complete(
        new Response(JSON.stringify({ error: "Сервис временно недоступен." }), {
          status: 503,
        }),
      );
    });
    expect(box.querySelector("form")?.getAttribute("aria-busy")).toBe("false");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(box.querySelector("[role=alert]")?.textContent).toBe(
      "Сервис временно недоступен.",
    );
  });
});
