/** Recorded flame frames. No fluid simulation or pixel generation at runtime. */
export const BUTTON_FIRE_ATLAS = "/art/playne-share-fire-v1.png";

let atlasPromise: Promise<HTMLImageElement> | undefined;
function loadAtlas() {
  if (!atlasPromise) {
    atlasPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => {
        atlasPromise = undefined;
        reject(new Error("Flame atlas unavailable"));
      };
      image.src = BUTTON_FIRE_ATLAS;
    });
  }
  return atlasPromise;
}

type Emitter = { x: number; y: number; nx: number; ny: number; phase: number; seed: number; offset: number };

/** The canvas lives INSIDE the native button, sharing its transform and hit area. */
export function attachButtonFire(button: HTMLButtonElement, canvas: HTMLCanvasElement) {
  if (typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const paint = document.createElement("canvas"), pc = paint.getContext("2d");
  if (!pc) return () => {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const forced = matchMedia("(forced-colors: active)");
  const top = 64, padding = 20, frameCount = 48, columns = 8, cellWidth = 88, cellHeight = 120;
  const flameHeight = 10, speed = 1.5, loopDuration = 1.75;
  let atlas: HTMLImageElement | undefined, disposed = false, requested = false;
  let visible = false, started = false, time = 0, ignition = 0, last = 0, raf = 0;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let width = 0, height = 0, bw = 0, bh = 0, radius = 12, perimeter = 0;
  let emitters: Emitter[] = [];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const smooth = (v: number) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const fraction = (v: number) => v - Math.floor(v);
  const calm = () => reduced.matches || forced.matches;

  function pointAt(phase: number) {
    const s = bw - radius * 2, v = bh - radius * 2, c = Math.PI * radius / 2;
    let d = phase * perimeter;
    if (d < s) return { x: padding + radius + d, y: top, nx: 0, ny: -1 }; d -= s;
    if (d < c) { const a = -Math.PI / 2 + d / radius; return { x: padding + bw - radius + Math.cos(a) * radius, y: top + radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) }; } d -= c;
    if (d < v) return { x: padding + bw, y: top + radius + d, nx: 1, ny: 0 }; d -= v;
    if (d < c) { const a = d / radius; return { x: padding + bw - radius + Math.cos(a) * radius, y: top + bh - radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) }; } d -= c;
    if (d < s) return { x: padding + bw - radius - d, y: top + bh, nx: 0, ny: 1 }; d -= s;
    if (d < c) { const a = Math.PI / 2 + d / radius; return { x: padding + radius + Math.cos(a) * radius, y: top + bh - radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) }; } d -= c;
    if (d < v) return { x: padding, y: top + bh - radius - d, nx: -1, ny: 0 }; d -= v;
    const a = Math.PI + d / radius;
    return { x: padding + radius + Math.cos(a) * radius, y: top + radius + Math.sin(a) * radius, nx: Math.cos(a), ny: Math.sin(a) };
  }

  function resize() {
    // Layout dimensions deliberately exclude the :active scale. A press must
    // transform the existing canvas, not rebuild a second, smaller contour.
    bw = button.offsetWidth; bh = button.offsetHeight;
    if (!bw || !bh) return;
    const style = getComputedStyle(button);
    radius = Math.min(parseFloat(style.borderTopLeftRadius) || 12, bw / 2, bh / 2);
    width = bw + padding * 2; height = bh + top + 36;
    canvas.style.left = `${-padding - (parseFloat(style.borderLeftWidth) || 0)}px`;
    canvas.style.top = `${-top - (parseFloat(style.borderTopWidth) || 0)}px`;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = paint.width = Math.round(width * dpr);
    canvas.height = paint.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0); pc!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.imageSmoothingEnabled = pc!.imageSmoothingEnabled = true;
    perimeter = 2 * (bw - radius * 2) + 2 * (bh - radius * 2) + 2 * Math.PI * radius;
    const count = Math.ceil(perimeter / 11);
    emitters = Array.from({ length: count }, (_, i) => {
      const seed = fraction(Math.sin(i * 47.17 + 3) * 43758.5453);
      const phase = Math.max(0, (i + (seed - .5) * .3) / count);
      return { ...pointAt(phase), phase, seed, offset: fraction(i * .6180339 + seed * .31) };
    });
    draw();
  }

  function draw() {
    if (!width || !atlas || calm()) return;
    const c = pc!, output = ctx!, front = clamp(ignition / 1.4);
    button.dataset.fireState = !started ? "waiting" : front < 1 ? "igniting" : "burning";
    c.clearRect(0, 0, width, height);
    if (started) {
      const gradient = c.createLinearGradient(padding, top, padding + bw, top + bh);
      gradient.addColorStop(0, "#ffbe57"); gradient.addColorStop(.5, "#ff7124"); gradient.addColorStop(1, "#ffae34");
      c.save(); c.strokeStyle = gradient; c.lineWidth = 2.2; c.lineCap = "round";
      c.setLineDash([perimeter * front, perimeter + 1]);
      c.beginPath(); c.moveTo(padding + radius, top); c.lineTo(padding + bw - radius, top);
      c.arcTo(padding + bw, top, padding + bw, top + radius, radius); c.lineTo(padding + bw, top + bh - radius);
      c.arcTo(padding + bw, top + bh, padding + bw - radius, top + bh, radius); c.lineTo(padding + radius, top + bh);
      c.arcTo(padding, top + bh, padding, top + bh - radius, radius); c.lineTo(padding, top + radius);
      c.arcTo(padding, top, padding + radius, top, radius); c.stroke(); c.restore();
      for (const e of emitters) {
        const amount = smooth((ignition - e.phase * 1.28) / .12);
        if (!amount || e.ny > .4) continue;
        const isTop = e.ny < -.25;
        const h = flameHeight * (isTop ? 3.3 : 1.65) * (.8 + .4 * e.seed), w = h * cellWidth / cellHeight;
        const index = Math.floor(fraction(time * speed / loopDuration + e.offset) * frameCount);
        c.save(); c.globalAlpha = amount * (isTop ? .94 : .84);
        c.translate(e.x + e.nx * (isTop ? -1 : 1.5), e.y + (isTop ? 12 : 5)); c.rotate(e.nx * .1);
        c.drawImage(atlas, (index % columns) * cellWidth, Math.floor(index / columns) * cellHeight, cellWidth, cellHeight, -w / 2, -h, w, h);
        c.restore();
      }
    }
    output.clearRect(0, 0, width, height);
    output.save(); output.globalAlpha = .22; output.filter = "blur(2px)";
    output.drawImage(paint, 0, 0, width, height); output.restore();
    output.drawImage(paint, 0, 0, width, height);
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0; last = 0; clearTimeout(startTimer);
  }
  function frame(ms: number) {
    raf = 0;
    if (disposed || !visible || document.hidden || calm()) return;
    if (!last) last = ms;
    const delta = (ms - last) / 1000;
    if (delta >= 1 / 30) { last = ms; const dt = Math.min(.08, delta); time += dt; ignition += dt; draw(); }
    raf = requestAnimationFrame(frame);
  }
  function run() {
    if (!disposed && atlas && started && visible && !document.hidden && !calm() && !raf) {
      last = 0; raf = requestAnimationFrame(frame);
    }
  }
  function enter() {
    clearTimeout(startTimer);
    if (disposed || !visible || document.hidden || calm()) return;
    if (!atlas) {
      if (!requested) {
        requested = true;
        void loadAtlas().then(image => {
          if (disposed) return;
          atlas = image; resize(); enter();
        }).catch(() => { if (!disposed) button.dataset.fireState = "unavailable"; });
      }
      return;
    }
    if (started) { draw(); run(); return; }
    startTimer = setTimeout(() => {
      if (disposed || !visible || document.hidden || calm()) return;
      started = true; time = ignition = 0; draw(); run();
    }, 200);
  }
  function preferenceChanged() {
    stop();
    if (calm()) { ctx!.clearRect(0, 0, width, height); button.dataset.fireState = "reduced"; }
    else { button.dataset.fireState = "waiting"; enter(); }
  }
  const visibilityChanged = () => document.hidden ? stop() : enter();
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting && entries[0].intersectionRatio >= .65;
    if (visible) enter(); else stop();
  }, { threshold: [0, .65] });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(button); observer.observe(button);
  document.addEventListener("visibilitychange", visibilityChanged);
  reduced.addEventListener("change", preferenceChanged); forced.addEventListener("change", preferenceChanged);
  button.dataset.fireState = calm() ? "reduced" : "waiting";
  resize();
  return () => {
    disposed = true; stop(); observer.disconnect(); resizeObserver.disconnect();
    document.removeEventListener("visibilitychange", visibilityChanged);
    reduced.removeEventListener("change", preferenceChanged); forced.removeEventListener("change", preferenceChanged);
    delete button.dataset.fireState;
  };
}
