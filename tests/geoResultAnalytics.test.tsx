// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://playne.ru/geo/"}
import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GEO_GOALS } from "../src/analytics";
import { useGeoResultAnalytics } from "../src/geoAnalytics";

function Result(props: Parameters<typeof useGeoResultAnalytics>[0]) {
  const { scoreRef, trackResultClick } = useGeoResultAnalytics(props);
  return (
    <section onClickCapture={trackResultClick}>
      <h1 ref={scoreRef}>{props.score}</h1>
      <button className="yandex-login"><span>Войти</span></button>
    </section>
  );
}

it("credits the guest conversion only when the same run comes back published", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const ym = vi.fn();
  window.ym = ym;
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const params: ComponentProps<typeof Result> = {
    runId: "private-geo-attempt", mode: "daily", origin: "played",
    player: "guest", score: 305, saved: false,
  };
  const events = (goal: string) => ym.mock.calls.filter((call) => call[2] === goal);
  try {
    act(() => root.render(<Result {...params} />));
    act(() => node.querySelector("button span")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(events(GEO_GOALS.resultAction)).toHaveLength(1);
    expect(events(GEO_GOALS.resultSavedAfterLogin)).toHaveLength(0);

    act(() => root.render(<Result {...params} origin="restored" player="account" runId="different-attempt" saved />));
    act(() => root.render(<Result {...params} origin="restored" player="account" />));
    expect(events(GEO_GOALS.resultSavedAfterLogin)).toHaveLength(0);

    act(() => root.render(<Result {...params} origin="restored" player="account" saved />));
    act(() => root.render(<Result {...params} origin="restored" player="account" saved />));
    const conversions = events(GEO_GOALS.resultSavedAfterLogin);
    expect(conversions).toHaveLength(1);
    expect(conversions[0][3]).toMatchObject({ mode: "daily", player: "guest", origin: "played" });
    expect(JSON.stringify(ym.mock.calls)).not.toContain("private-geo-attempt");
  } finally {
    act(() => root.unmount());
    node.remove();
    sessionStorage.clear();
    delete window.ym;
    vi.unstubAllGlobals();
  }
});
