// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pairs } from "../src/data";

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = undefined;
  vi.unstubAllGlobals();
});

describe("Naglaz client catalogue", () => {
  it("advertises the comparisons included in this browser bundle", async () => {
    vi.resetModules();
    localStorage.clear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const request = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          game: "naglaz",
          version: 1,
          challenge: { pairIds: [] },
        }),
      ),
    );
    vi.stubGlobal("fetch", request);
    const { useRankedRun } = await import("../src/account");
    function Start() {
      const run = useRankedRun("naglaz");
      return <button onClick={() => void run.begin()}>Начать</button>;
    }
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<Start />));
    await act(async () => container!.querySelector("button")!.click());
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/games");
    expect(JSON.parse(init.body as string)).toEqual({
      game: "naglaz",
      supportedPairIds: pairs.map((pair) => pair.id),
    });
  });
});
