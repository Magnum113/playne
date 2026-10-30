/** Continuous low flame from the approved playne-clockwise-fire preview. */
const tile = new Float32Array(16384);
let noiseSeed = 437561;
for (let i = 0; i < tile.length; i++) {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) | 0;
  tile[i] = (noiseSeed >>> 0) / 4294967296;
}
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = tile[(iy & 127) * 128 + (ix & 127)], b = tile[(iy & 127) * 128 + ((ix + 1) & 127)];
  const c = tile[((iy + 1) & 127) * 128 + (ix & 127)], d = tile[((iy + 1) & 127) * 128 + ((ix + 1) & 127)];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/** The canvas lives INSIDE the native button, sharing its transform and hit area. */
export function attachButtonFire(button: HTMLButtonElement, canvas: HTMLCanvasElement) {
  if (typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") return () => {};
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const buffer = document.createElement("canvas"), pc = buffer.getContext("2d");
  if (!pc) return () => {};
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const forced = matchMedia("(forced-colors: active)");
  const top = 50, padding = 20, flameHeight = 12, speed = 1.5;
  let disposed = false;
  let visible = false, started = false, time = 0, ignition = 0, last = 0, raf = 0;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let width = 0, height = 0, bw = 0, bh = 0, radius = 12;
  let image: ImageData | undefined;
  let geometry: { x: number; y: number; dist: number; rise: number; phase: number; lateral: number; index: number }[] = [];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const smooth = (v: number) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const calm = () => reduced.matches || forced.matches;

  // Same continuous temperature field as playne-clockwise-fire.html, the
  // approved low-flame preview. Geometry adapts to the actual button size.
  function distanceAt(x: number, y: number) {
    const qx = Math.abs(x - (padding + bw / 2)) - (bw / 2 - radius);
    const qy = Math.abs(y - (top + bh / 2)) - (bh / 2 - radius);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  }
  function phaseAt(x: number, y: number) {
    const l = padding, r = l + bw, t = top, b = t + bh, R = radius;
    const S = bw - 2 * R, V = bh - 2 * R, C = Math.PI * R / 2, P = 2 * S + 2 * V + 4 * C;
    let d: number;
    if (x >= l + R && x <= r - R) d = y < (t + b) / 2 ? x - l - R : S + 2 * C + V + r - R - x;
    else if (y >= t + R && y <= b - R) d = x > (l + r) / 2 ? S + C + y - t - R : 2 * S + 3 * C + V + b - R - y;
    else if (x > (l + r) / 2) d = y < (t + b) / 2
      ? S + (Math.atan2(y - t - R, x - r + R) + Math.PI / 2) * R
      : S + C + V + Math.atan2(y - b + R, x - r + R) * R;
    else d = y > (t + b) / 2
      ? 2 * S + 2 * C + V + (Math.atan2(y - b + R, x - l - R) - Math.PI / 2) * R
      : 2 * S + 3 * C + 2 * V + (Math.atan2(y - t - R, x - l - R) + Math.PI) * R;
    return clamp(d / P);
  }

  function resize() {
    // Layout dimensions deliberately exclude the :active scale. A press must
    // transform the existing canvas, not rebuild a second, smaller contour.
    bw = button.offsetWidth; bh = button.offsetHeight;
    if (!bw || !bh) return;
    const style = getComputedStyle(button);
    radius = Math.min(parseFloat(style.borderTopLeftRadius) || 12, bw / 2, bh / 2);
    width = bw + padding * 2; height = bh + top + 40;
    canvas.style.left = `${-padding - (parseFloat(style.borderLeftWidth) || 0)}px`;
    canvas.style.top = `${-top - (parseFloat(style.borderTopWidth) || 0)}px`;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    buffer.width = width; buffer.height = height;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.imageSmoothingEnabled = true;
    image = pc!.createImageData(width, height);
    geometry = [];
    for (let y = top - 26; y < height - 10; y++) {
      for (let x = padding - 16; x < padding + bw + 16; x++) {
        const dist = distanceAt(x, y);
        if (dist < -.5) continue;
        let base = top;
        if (x < padding + radius) {
          const dx = Math.min(radius, Math.max(0, padding + radius - x));
          base = top + radius - Math.sqrt(Math.max(0, radius * radius - dx * dx));
        } else if (x > padding + bw - radius) {
          const dx = Math.min(radius, Math.max(0, x - padding - bw + radius));
          base = top + radius - Math.sqrt(Math.max(0, radius * radius - dx * dx));
        }
        geometry.push({ x, y, dist, rise: base - y, phase: phaseAt(x, y),
          lateral: clamp((x - padding + 5) / 13) * clamp((padding + bw + 5 - x) / 13), index: (y * width + x) * 4 });
      }
    }
    draw();
  }

  function draw() {
    if (!image || calm()) return;
    const front = clamp(ignition / .7), t = time * speed, pixels = image.data;
    button.dataset.fireState = !started ? "waiting" : front < 1 ? "igniting" : "burning";
    pixels.fill(0);
    if (started) for (const { x, y, dist, rise, phase, lateral, index: i } of geometry) {
      const mask = front >= 1 ? 1 : smooth((front - phase) * 75);
      if (mask <= 0) continue;
      let heat = 0, alpha = 0;
      const warp = 5 * (noise(x * .07, rise * .09 - t * 1.5) - .5) + 2.8 * Math.sin(rise * .21 - t * 2.2);
      const nx = x + warp;
      if (rise >= -2 && lateral > 0) {
        const broad = clamp((noise(nx * .095, t * 1.8) - .2) * 1.8);
        const fine = noise(nx * .24, rise * .2 - t * 3.2);
        const h = (2 + (flameHeight - 2) * Math.pow(broad, 1.5)) * lateral;
        const density = h - rise + (fine - .5) * 3;
        alpha = smooth((density + 1.2) / 2.6);
        heat = clamp((h - rise) / Math.max(1, h));
        alpha *= smooth((rise + 3) / 2);
        if (rise > 3) alpha *= .6 + .4 * fine;
      }
      const reach = 1.7 + 3.8 * Math.pow(noise(x * .15 + t * .7, y * .19 - t * 2), 2);
      const rim = smooth((reach - dist + 1.2) / 2.3);
      if (rim > alpha) { alpha = rim; heat = clamp(1 - dist / reach) * .85; }
      const edge = Math.exp(-Math.max(0, dist) * 1.2);
      if (edge > alpha) { alpha = edge; heat = .88 * edge; }
      alpha *= mask;
      const turbulence = noise(x * .28, rise * .32 - t * 4);
      const energy = clamp(heat * .82 + turbulence * .25);
      let green = 35 + 180 * Math.pow(energy, 1.2), blue = 2 + 50 * Math.pow(energy, 2.5);
      if (energy > .86) { const core = (energy - .86) / .14; green += core * 30; blue += core * 150; }
      const head = front < 1 ? Math.exp(-Math.pow((front - phase) * 130, 2)) * Math.exp(-dist * dist / 8) : 0;
      pixels[i] = 255; pixels[i + 1] = Math.min(255, green + head * 65);
      pixels[i + 2] = Math.min(255, blue + head * 180); pixels[i + 3] = Math.round(clamp(alpha) * 255);
    }
    pc!.putImageData(image, 0, 0);
    ctx!.clearRect(0, 0, width, height);
    ctx!.save(); ctx!.globalAlpha = .22; ctx!.filter = "blur(3px)";
    ctx!.drawImage(buffer, 0, 0); ctx!.restore(); ctx!.drawImage(buffer, 0, 0);
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
    if (!disposed && started && visible && !document.hidden && !calm() && !raf) {
      last = 0; raf = requestAnimationFrame(frame);
    }
  }
  function enter() {
    clearTimeout(startTimer);
    if (disposed || !visible || document.hidden || calm()) return;
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
