// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import BrainInsight from "../src/BrainInsight";
import type { BrainInsightResult } from "../src/brainInsights";

const mock = vi.hoisted(() => ({
  api: vi.fn(),
  user: { id: "owner" } as { id: string } | null,
  loading: false,
}));
vi.mock("../src/account", () => ({
  api: (path: string) => mock.api(path),
  useAuth: () => ({ user: mock.user, loading: mock.loading }),
}));
let box: HTMLDivElement, root: Root;
const fixture = (
  status: BrainInsightResult["status"] = "ready",
): BrainInsightResult => ({
  status,
  game: "flash",
  mode: "practice",
  difficulty: 1,
  metric: {
    kind: "flash_recovery",
    label: "Восстановленные клетки",
    current: 0.8,
    baseline: 0.6,
    numerator: 20,
    denominator: 25,
  },
  sample: { previous: 3, required: 3, missing: 0 },
  fact: "Восстановлено 20 из 25 клеток — 80%. В прошлых сопоставимых партиях в среднем — 60%.",
  nextStep: "В следующей партии попробуй восстановить на одну клетку больше.",
  comparisonNote:
    "Сравниваем один режим и одинаковые параметры. Это личная игровая статистика.",
});
async function render(runId?: string, game: "flash" | "rotate" = "flash") {
  await act(async () =>
    root.render(<BrainInsight game={game} runId={runId} />),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mock.user = { id: "owner" };
  mock.loading = false;
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  mock.api.mockResolvedValue(fixture());
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("personal Brain result insight", () => {
  it("shows one fact and target, with the comparison method behind native details", async () => {
    await render("result-1");
    expect(mock.api).toHaveBeenCalledWith("/games/result-1/insight");
    expect(box.querySelectorAll(".brain-insight-fact")).toHaveLength(1);
    expect(box.querySelectorAll(".brain-insight-next")).toHaveLength(1);
    expect(box.textContent).toContain("20 из 25 клеток");
    expect(box.querySelector("details")?.open).toBe(false);
    expect(box.querySelector("summary")?.textContent).toBe("Как считаем");
    expect(box.querySelector("a")?.getAttribute("href")).toBe("/account/");
    expect(box.querySelector("button.primary")).toBeNull();
  });
  it("keeps the truthful insufficient-sample message and does not display a fake average", async () => {
    const result = fixture("insufficient");
    result.sample = { previous: 1, required: 3, missing: 2 };
    delete result.metric!.baseline;
    result.fact =
      "Восстановлено 20 из 25 клеток — 80%. Пока мало сопоставимых партий для сравнения.";
    mock.api.mockResolvedValue(result);
    await render("result-2");
    expect(box.textContent).toContain("мало сопоставимых партий");
    expect(box.textContent).toContain("Сопоставимых прошлых партий: 1 из 3");
    expect(box.textContent).not.toContain("в среднем");
    expect(box.textContent).not.toContain("В сравнении —");
  });
  it("supports a legacy unavailable result without an invented numerical metric", async () => {
    mock.api.mockResolvedValue({
      ...fixture("unavailable"),
      metric: null,
      fact: "Для этой партии не хватает подробных данных для личного разбора.",
      nextStep:
        "Закончи новую практику, чтобы начать собирать подробную статистику.",
    });
    await render("legacy");
    expect(box.textContent).toContain("не хватает подробных данных");
    expect(box.querySelector(".brain-insight-next")?.textContent).toContain(
      "Закончи новую практику",
    );
    expect(box.textContent).not.toContain("NaN");
  });
  it("shows a challenge replay as its own metric without a growth comparison or performance target", async () => {
    const result = fixture("replay");
    delete result.metric!.baseline;
    result.fact =
      "Восстановлено 20 из 25 клеток — 80%. Повтор по вызову не участвует в сравнении.";
    result.nextStep = "Выбери новую практику на этой сложности.";
    mock.api.mockResolvedValue(result);
    await render("comparison");
    expect(box.textContent).toContain(
      "Повтор по вызову не участвует в сравнении",
    );
    expect(box.textContent).toContain(
      "Выбери новую практику на этой сложности",
    );
    expect(box.textContent).not.toContain("в среднем");
    expect(box.textContent).not.toContain("Сопоставимых прошлых партий:");
  });
  it("retries a failed request without displacing the saved game result or navigating", async () => {
    mock.api
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(fixture());
    await render("retry");
    expect(box.textContent).toContain("Результат партии сохранён");
    await act(async () =>
      box.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(mock.api).toHaveBeenCalledTimes(2);
    expect(box.textContent).toContain("20 из 25 клеток");
  });
  it("does not request private history before identity is ready or without a run", async () => {
    await render();
    expect(box.innerHTML).toBe("");
    expect(mock.api).not.toHaveBeenCalled();
    mock.loading = true;
    await render("pending");
    expect(mock.api).not.toHaveBeenCalled();
    expect(box.textContent).toContain("Смотрим твои прошлые партии");
    mock.loading = false;
    await render("pending");
    expect(mock.api).toHaveBeenCalledTimes(1);
  });
  it("hides the previous account's data immediately and ignores its late response", async () => {
    let resolveOld!: (value: BrainInsightResult) => void;
    mock.api
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("not owned"));
    await render("private");
    mock.user = { id: "other" };
    await render("private");
    await act(async () => resolveOld(fixture()));
    expect(box.textContent).not.toContain("20 из 25 клеток");
    expect(box.textContent).toContain("Личный разбор пока недоступен");
  });
  it("clears a displayed insight when logging out and when changing result", async () => {
    await render("first");
    expect(box.textContent).toContain("20 из 25 клеток");
    mock.user = null;
    mock.api.mockRejectedValue(new Error("not owned"));
    await render("second");
    expect(box.textContent).not.toContain("20 из 25 клеток");
    expect(mock.api).toHaveBeenLastCalledWith("/games/second/insight");
  });
  it("rejects a stale response from a different game", async () => {
    mock.api.mockResolvedValue({ ...fixture(), game: "rotate" });
    await render("wrong-game");
    expect(box.textContent).not.toContain("20 из 25 клеток");
    expect(box.textContent).toContain("Личный разбор пока недоступен");
  });
  it("does not move focus or scroll when the asynchronous insight arrives", async () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus"),
      scroll = vi
        .spyOn(Element.prototype, "scrollIntoView")
        .mockImplementation(() => {});
    await render("stable-result");
    expect(focus).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect(box.querySelectorAll("[role=dialog]")).toHaveLength(0);
  });
});
