// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FooterSignup from "../src/FooterSignup";
import FooterLinks from "../src/FooterLinks";
import {
  EMAIL_CONSENT_VERSION,
  EMAIL_SETTINGS_UPDATED,
} from "../src/emailConsent";

const mock = vi.hoisted(() => ({
  user: { id: "member-1" } as { id: string } | null,
  loading: false,
  api: vi.fn(),
}));
vi.mock("../src/account", async (original) => ({
  ...(await original<typeof import("../src/account")>()),
  api: mock.api,
  useAuth: () => ({
    user: mock.user,
    loading: mock.loading,
    emailSignupAvailable: true,
  }),
}));
const base = {
  available: true,
  email: "qa@example.com",
  enabled: false,
  pending: false,
  verified: true,
  purpose: null as "general" | "rank" | null,
};
let root: Root, box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mock.user = { id: "member-1" };
  mock.loading = false;
  mock.api.mockReset().mockResolvedValue(base);
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
});

it("offers guests only sign-in for ranking in the common footer", async () => {
  mock.user = null;
  await act(async () => root.render(<FooterLinks />));
  expect(mock.api).not.toHaveBeenCalled();
  expect(box.querySelector(".footer-signup")?.textContent).toContain(
    "Войди, чтобы участвовать в рейтинге.",
  );
  expect(box.querySelector(".yandex-login")?.textContent).toContain(
    "Войти через Яндекс",
  );
  expect(box.querySelector("input")).toBeNull();
});

it("does not offer sign-in or subscription until auth has resolved", async () => {
  mock.loading = true;
  await act(async () => root.render(<FooterSignup />));
  expect(box.textContent).toBe("");
  expect(mock.api).not.toHaveBeenCalled();
});

it("keeps subscriptions opt-in, including upgrading a rank-only subscriber, and hides the saved offer", async () => {
  mock.api.mockImplementation(async (_path, method) => ({
    ...base,
    enabled: true,
    purpose: method === "POST" ? "general" : "rank",
  }));
  await act(async () => root.render(<FooterSignup />));
  const input = box.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(input.checked).toBe(false);
  expect(box.querySelectorAll("input")).toHaveLength(1);
  expect(box.textContent).not.toContain(base.email);
  expect(mock.api).toHaveBeenCalledTimes(1);
  await act(async () => input.click());
  expect(mock.api).toHaveBeenCalledWith("/email/settings", "POST", {
    enabled: true,
    email: base.email,
    consentVersion: EMAIL_CONSENT_VERSION,
    dataConsent: true,
  });
  expect(box.querySelector(".footer-signup")).toBeNull();
  expect(box.querySelector('[role="status"]')?.textContent).toBe(
    "Подписка включена.",
  );
});

it("does not show an offer to existing general subscribers", async () => {
  mock.api.mockResolvedValue({ ...base, enabled: true, purpose: "general" });
  await act(async () => root.render(<FooterSignup />));
  expect(box.querySelector(".footer-signup")).toBeNull();
});

it("blocks duplicate saves and retains an unchecked retry after request failure", async () => {
  let fail!: (error: Error) => void;
  mock.api.mockImplementation(async (_path, method) =>
    method === "POST"
      ? new Promise((_resolve, reject) => {
          fail = reject;
        })
      : base,
  );
  await act(async () => root.render(<FooterSignup />));
  const input = box.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    input.click();
    input.click();
  });
  expect(input.disabled).toBe(true);
  expect(
    mock.api.mock.calls.filter(([, method]) => method === "POST"),
  ).toHaveLength(1);
  await act(async () => fail(new Error("Нет соединения. Попробуй ещё раз.")));
  expect(input.checked).toBe(false);
  expect(input.disabled).toBe(false);
  expect(box.querySelector('[role="alert"]')?.textContent).toContain(
    "Нет соединения",
  );
  expect(box.querySelector(".footer-signup")).not.toBeNull();
});

it("shows only the necessary confirmation instruction for an unverified saved address", async () => {
  mock.api.mockImplementation(async (_path, method) =>
    method === "POST"
      ? { ...base, pending: true, verified: false, purpose: "general" }
      : base,
  );
  await act(async () => root.render(<FooterSignup />));
  await act(async () => box.querySelector<HTMLInputElement>("input")!.click());
  expect(box.querySelector("input")).toBeNull();
  expect(box.querySelector(".footer-signup")?.textContent).toBe(
    "Подтверди подписку в письме.",
  );
});

it("routes a missing address to account settings without showing an unusable checkbox or email form", async () => {
  mock.api.mockResolvedValue({ ...base, email: "" });
  await act(async () => root.render(<FooterSignup />));
  expect(box.querySelector("input")).toBeNull();
  expect(box.querySelector("a")?.getAttribute("href")).toBe(
    "/account/#email-settings",
  );
});

it("refreshes when the subscription is changed in account settings", async () => {
  await act(async () => root.render(<FooterSignup />));
  expect(box.querySelector("input")).not.toBeNull();
  mock.api.mockResolvedValue({ ...base, enabled: true, purpose: "general" });
  await act(async () =>
    window.dispatchEvent(new Event(EMAIL_SETTINGS_UPDATED)),
  );
  expect(box.querySelector(".footer-signup")).toBeNull();
});

it("ignores an old account request resolving after switching accounts", async () => {
  let old!: (value: typeof base) => void;
  mock.api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        old = resolve;
      }),
  );
  await act(async () => root.render(<FooterSignup />));
  mock.user = { id: "member-2" };
  await act(async () => root.render(<FooterSignup />));
  expect(box.querySelector("input")).not.toBeNull();
  await act(async () => old({ ...base, enabled: true, purpose: "general" }));
  expect(box.querySelector("input")).not.toBeNull();
});
