export type FlowSound =
  | "tap"
  | "start"
  | "launch"
  | "collect"
  | "dock"
  | "undo"
  | "hint"
  | "blocked"
  | "win";
const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

/** Short, quiet generated effects. No autoplay, music loop or mute control. */
export class FlowAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  private closed = false;
  private active = false;

  wake() {
    if (this.closed || (typeof document !== "undefined" && document.hidden))
      return;
    this.active = true;
    try {
      if (!this.context) {
        const Audio =
          globalThis.AudioContext ??
          (
            globalThis as typeof globalThis & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (!Audio) return;
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended")
        void this.context.resume().catch(() => {});
    } catch {
      /* Audio failure must never stop a move. */
    }
  }
  play(kind: FlowSound, color = 0, variation = 0) {
    const ctx = this.context;
    if (
      !ctx ||
      !this.master ||
      !this.active ||
      this.closed ||
      ctx.state !== "running" ||
      (typeof document !== "undefined" && document.hidden)
    )
      return;
    const base = notes[Math.abs(color) % notes.length];
    const voice = (
      frequency: number,
      at: number,
      duration: number,
      gain = 0.13,
      type: OscillatorType = "sine",
      end = frequency,
    ) => {
      if (this.voices.size >= 18) return;
      try {
        const oscillator = ctx.createOscillator(),
          envelope = ctx.createGain(),
          time = ctx.currentTime + at;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, time);
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(40, end),
          time + duration,
        );
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(gain, time + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(envelope);
        envelope.connect(this.master!);
        this.voices.add(oscillator);
        oscillator.onended = () => {
          this.voices.delete(oscillator);
          oscillator.disconnect();
          envelope.disconnect();
        };
        oscillator.start(time);
        oscillator.stop(time + duration + 0.015);
      } catch {
        /* Unsupported/interrupted browser audio is silent. */
      }
    };
    if (kind === "tap") voice(380, 0, 0.055, 0.08, "triangle", 260);
    if (kind === "start") {
      voice(523, 0, 0.15);
      voice(784, 0.075, 0.23, 0.1);
    }
    if (kind === "launch")
      voice(base * 0.5, 0, 0.14, 0.17, "triangle", base * 0.85);
    if (kind === "collect")
      voice(base * (1 + (variation % 3) * 0.012), 0, 0.09, 0.085);
    if (kind === "dock") {
      voice(base, 0, 0.16, 0.11);
      voice(base * 1.5, 0.045, 0.2, 0.08);
    }
    if (kind === "undo") {
      voice(620, 0, 0.09, 0.1);
      voice(420, 0.07, 0.12, 0.08);
    }
    if (kind === "hint") {
      voice(659, 0, 0.12, 0.1);
      voice(880, 0.075, 0.17, 0.1);
    }
    if (kind === "blocked") {
      voice(220, 0, 0.11, 0.09, "triangle");
      voice(175, 0.08, 0.14, 0.07, "triangle");
    }
    if (kind === "win")
      [523.25, 659.25, 783.99, 1046.5].forEach((note, i) =>
        voice(note, i * 0.09, 0.32, 0.12),
      );
  }
  hush() {
    this.active = false;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
    if (this.context?.state === "running")
      void this.context.suspend().catch(() => {});
  }
  dispose() {
    this.hush();
    this.closed = true;
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}
