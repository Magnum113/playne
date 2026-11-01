/** Street View has no public tilesloaded event. Wait for visible image loads
 * and two browser paints after metadata becomes OK; never run a timed round
 * behind this loading gate. Keep a timeout and cancellation for slow networks. */
export function panoramaPaint(root: HTMLElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settle: ReturnType<typeof setTimeout>, frame = 0;
    const cleanup = () => { clearTimeout(settle); clearTimeout(timeout); cancelAnimationFrame(frame); observer.disconnect(); root.removeEventListener("load", check, true); root.removeEventListener("error", check, true); signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); reject(new Error("Cancelled")); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error("Panorama paint timeout")); }, 12000);
    function check() {
      clearTimeout(settle);
      const pending = [...root.querySelectorAll("img")].some(img => !img.complete && img.getBoundingClientRect().width > 0);
      if (pending) return;
      settle = setTimeout(() => {
        frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => { cleanup(); resolve(); }); });
      }, 800);
    }
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
    root.addEventListener("load", check, true); root.addEventListener("error", check, true);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else check();
  });
}
