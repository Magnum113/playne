// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmailReport, { EmailReportView, type EmailReportData } from "../src/EmailReport";

const metrics = { messages: 0, accepted: 0, recipients: 0, delivered: 0, delivered_users: 0, opened: 0, clicked: 0, visited_users: 0, started_users: 0, completed_users: 0, pending: 0, uncertain: 0, failed: 0, cancelled: 0, unsubscribes: 0, complaints: 0 };
const report: EmailReportData = {
  generatedAt: "2026-10-31T19:00:00Z", reportWindowDays: 90,
  activity: { totals: { ...metrics, accepted: 7, delivered: 7, delivered_users: 4 }, byKind: [{ ...metrics, kind: "rank", accepted: 6, delivered: 6, delivered_users: 3 }, { ...metrics, kind: "verify", accepted: 1, delivered: 1, delivered_users: 1 }] },
  current: [{ ...metrics, variant: "A", accepted: 1, delivered: 1, delivered_users: 1 }, { ...metrics, variant: "B", accepted: 2, delivered: 2, delivered_users: 1 }, { ...metrics, variant: "C", accepted: 3, delivered: 3, delivered_users: 1 }],
  health: { subscribers: 9, last_callback: "2026-10-31T17:43:00Z", next_mature_at: "2026-11-05T17:43:00Z" },
  variants: ["A", "B", "C"].map((variant) => ({ variant, delivered_users: 0, visited_users: 0, started_users: 0, completed_users: 0, visitRate: null, visitRate95: null })),
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("Email analytics", () => {
  it("shows recent sends immediately and explains why mature A/B/C data is unavailable", () => {
    const box = document.createElement("div");
    box.innerHTML = renderToStaticMarkup(<EmailReportView report={report} />);
    expect(box.querySelectorAll(".email-report-totals dd")[0].textContent).toBe("7");
    expect(box.querySelector('[aria-label="Текущие результаты A/B/C"]')!.textContent).toContain("C3301");
    expect(box.textContent).toContain("ещё нет писем с полным окном");
    expect(box.textContent).toContain("5 ноября");
    expect(box.querySelector('[aria-label="Зрелые результаты A/B/C"]')).toBeNull();
    expect(box.textContent).toContain("Подтверждение почты");
    expect(box.textContent).toContain("Напоминания");
  });
  it("keeps the mature comparison separate when it becomes available", () => {
    const mature = { ...report, variants: [{ ...report.variants[0], delivered_users: 10, visited_users: 2, visitRate: .2, visitRate95: [.05, .5] }] };
    const html = renderToStaticMarkup(<EmailReportView report={mature} />);
    expect(html).toContain('aria-label="Зрелые результаты A/B/C"');
    expect(html).toContain("20,0%");
    expect(html).not.toContain("ещё нет писем с полным окном");
  });
  it("loads automatically and preserves the last successful statistics after a refresh error", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const remote = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(report))).mockRejectedValueOnce(new Error("Нет связи"));
    vi.stubGlobal("fetch", remote);
    const box = document.createElement("div"); document.body.append(box);
    const root = createRoot(box);
    try {
      await act(async () => root.render(<EmailReport />));
      expect(remote).toHaveBeenCalledOnce();
      expect(box.textContent).toContain("Принято Unisender");
      await act(async () => box.querySelector("button")!.click());
      expect(box.querySelector('[role="alert"]')!.textContent).toBe("Нет связи");
      expect(box.querySelector("dd")!.textContent).toBe("7");
    } finally { await act(async () => root.unmount()); box.remove(); }
  });
});
