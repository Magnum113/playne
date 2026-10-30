// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import OtherChallenge from "../src/OtherChallenge";
const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../src/account", () => ({
  api: (...args: unknown[]) => mock.api(...args),
}));
vi.mock("../src/SiteHeader", () => ({
  GameHeader: () => <header>Playne</header>,
}));
vi.mock("../src/FooterLinks", () => ({ default: () => null }));
vi.mock("../src/ShareResult", () => ({
  default: () => <button>Бросить вызов другу</button>,
}));
vi.mock("../src/ChallengeContext", () => ({
  default: () => <div>Вызов друга</div>,
}));
let box: HTMLDivElement, root: Root;
const token = "a".repeat(43);
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  box = document.createElement("div");
  document.body.append(box);
  root = createRoot(box);
  mock.api.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  box.remove();
  vi.unstubAllGlobals();
});
it.each(["naglaz", "circle", "colorfle", "geo", "pressure"] as const)(
  "loads %s invitation before mounting gameplay and restores its mode",
  async (game) => {
    window.history.replaceState(null, "", `/${game}/?challenge=${token}`);
    mock.api.mockResolvedValue({
      game,
      mode: game === "geo" ? "moving-timed" : "classic",
    });
    await act(async () =>
      root.render(
        <OtherChallenge game={game}>
          <div>Игра</div>
        </OtherChallenge>,
      ),
    );
    expect(box.textContent).toContain("Игра");
    expect(box.textContent).toContain("Вызов друга");
    expect(new URLSearchParams(location.search).get("mode")).toBe(
      game === "geo" ? "moving-timed" : "classic",
    );
  },
);
it("rejects a mismatched result instead of comparing arbitrary scores", async () => {
  window.history.replaceState(
    null,
    "",
    `/circle/?challenge=${token}&result=own-run`,
  );
  mock.api
    .mockResolvedValueOnce({ game: "circle", mode: "classic" })
    .mockResolvedValueOnce({
      game: "circle",
      completed: true,
      score: 99,
      challenge: { comparisonToken: "another" },
    });
  await act(async () =>
    root.render(
      <OtherChallenge game="circle">
        <div>Игра</div>
      </OtherChallenge>,
    ),
  );
  expect(box.textContent).toContain("Для сравнения нужны те же задания");
  expect(box.textContent).not.toContain("99");
});
it("restores the exact completed circle with percent units without starting gameplay", async () => {
  window.history.replaceState(
    null,
    "",
    `/circle/?challenge=${token}&result=own-run`,
  );
  mock.api
    .mockResolvedValueOnce({
      game: "circle",
      gameName: "Круг",
      mode: "classic",
      maxScore: 100,
    })
    .mockResolvedValueOnce({
      game: "circle",
      id: "own-run",
      completed: true,
      score: 98.7,
      challenge: { comparisonToken: token },
    });
  await act(async () =>
    root.render(
      <OtherChallenge game="circle">
        <div>Игра</div>
      </OtherChallenge>,
    ),
  );
  expect(box.textContent).toContain("98,7%");
  expect(box.querySelector(".challenge-player-score")?.textContent).toBe(
    "98,7%",
  );
  expect(mock.api).toHaveBeenCalledTimes(2);
});
it("opens the designed result immediately after a matching game-completion event", async () => {
  window.history.replaceState(null, "", `/circle/?challenge=${token}`);
  mock.api.mockResolvedValueOnce({
    token,
    game: "circle",
    gameName: "Круг",
    mode: "classic",
    maxScore: 100,
    score: 75.3,
    nickname: "Друг",
  });
  await act(async () =>
    root.render(
      <OtherChallenge game="circle">
        <div data-testid="game">Игра</div>
      </OtherChallenge>,
    ),
  );
  mock.api.mockResolvedValueOnce({
    id: "finished",
    game: "circle",
    completed: true,
    score: 62.8,
    challenge: { comparisonToken: token },
  });
  await act(async () =>
    window.dispatchEvent(
      new CustomEvent("playne:challenge-completed", {
        detail: { game: "circle", token, id: "finished" },
      }),
    ),
  );
  expect(box.querySelector('[data-testid="game"]')).toBeNull();
  expect(box.querySelector("h1")?.textContent).toBe("Друг впереди");
  expect(box.querySelectorAll('[role="meter"]')).toHaveLength(2);
  const retry = [...box.querySelectorAll("a")].find((a) =>
    a.textContent?.includes("Попробовать ещё"),
  )!;
  expect(retry.getAttribute("href")).toContain(
    `challenge=${token}&retry=finished`,
  );
  expect(box.querySelector("header")).not.toBeNull();
});
