// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccountPage from "../src/AccountPage";
import { AuthProvider } from "../src/account";

let root: Root, box: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
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
async function render(patch: () => Promise<Response>) {
  const remote = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/me" && options?.method === "PATCH") return patch();
    const result =
      url === "/api/me"
        ? { user: { id: "account-form-test", nickname: "Игрок" }, trials: {} }
        : url === "/api/account"
          ? { best: [], history: [] }
          : { available: false, enabled: false, pending: false };
    return new Response(JSON.stringify(result));
  });
  vi.stubGlobal("fetch", remote);
  await act(async () =>
    root.render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    ),
  );
  return remote;
}
async function submit(form: HTMLFormElement) {
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
}

describe("Account form feedback", () => {
  it("returns focus to the same invalid field on repeated local submissions", async () => {
    const remote = await render(async () => new Response("{}"));
    const input = box.querySelector<HTMLInputElement>("#nickname")!;
    const form = box.querySelector<HTMLFormElement>(".nickname-form")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "А");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      form.querySelector("button")!.focus();
      await submit(form);
      expect(document.activeElement).toBe(input);
      expect(input.getAttribute("aria-invalid")).toBe("true");
    }
    expect(
      remote.mock.calls.some(([, options]) => options?.method === "PATCH"),
    ).toBe(false);
  });
  it("keeps a rejected nickname next to its field and outside unrelated account feedback", async () => {
    await render(
      async () =>
        new Response(
          JSON.stringify({ error: "Ник не должен содержать ссылку." }),
          { status: 400 },
        ),
    );
    await submit(box.querySelector<HTMLFormElement>(".nickname-form")!);
    const input = box.querySelector<HTMLInputElement>("#nickname")!;
    expect(input.classList.contains("ui-input")).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain("nickname-error");
    expect(box.querySelector("#nickname-error")?.textContent).toBe(
      "Ник не должен содержать ссылку.",
    );
    expect(box.querySelector("#account-message")?.textContent).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("shows request failure locally without claiming that a valid nickname is invalid", async () => {
    await render(
      async () =>
        new Response(JSON.stringify({ error: "Попробуй позже." }), {
          status: 503,
        }),
    );
    await submit(box.querySelector<HTMLFormElement>(".nickname-form")!);
    expect(box.querySelector(".nickname-form [role=alert]")?.textContent).toBe(
      "Попробуй позже.",
    );
    expect(box.querySelector("#nickname")?.hasAttribute("aria-invalid")).toBe(
      false,
    );
    expect(box.querySelector("#account-message")?.textContent).toBe("");
  });

  it("keeps nickname success in its form, with loading semantics while saving", async () => {
    let complete!: (response: Response) => void;
    await render(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const form = box.querySelector<HTMLFormElement>(".nickname-form")!;
    await submit(form);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(form.querySelector("button")?.disabled).toBe(true);
    expect(form.querySelector("button")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    await act(async () => complete(new Response("{}")));
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(form.querySelector("[role=status]")?.textContent).toBe(
      "Ник сохранён.",
    );
    expect(box.querySelector("#account-message")?.textContent).toBe("");
  });

  it("makes deletion an explicit disclosure, rejects missing confirmation locally and restores focus on cancel", async () => {
    const remote = await render(async () => new Response("{}"));
    const toggle = box.querySelector<HTMLButtonElement>(
      "[aria-controls=delete-account-form]",
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const form = box.querySelector<HTMLFormElement>("#delete-account-form")!;
    const input = form.querySelector<HTMLInputElement>("input")!;
    expect(document.activeElement).toBe(input);
    expect(form.querySelector(".danger-button")?.textContent).toContain(
      "Удалить аккаунт и результаты",
    );
    await submit(form);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(
      "delete-account-error",
    );
    expect(
      remote.mock.calls.some(([url]) => url === "/api/account/delete"),
    ).toBe(false);
    expect(box.querySelector("#account-message")?.textContent).toBe("");
    act(() =>
      form.querySelector<HTMLButtonElement>(".secondary-button")!.click(),
    );
    expect(box.querySelector("#delete-account-form")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
});
