export type FlowSound =
  | "tap"
  | "start"
  | "launch"
  | "step"
  | "pickup"
  | "carry"
  | "collect"
  | "dock"
  | "undo"
  | "hint"
  | "blocked"
  | "win";
const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
const cooldown: Partial<Record<FlowSound, number>> = {
  step: 0.055,
  pickup: 0.055,
  carry: 0.095,
  collect: 0.045,
  dock: 0.12,
};
type Voice = { source: AudioScheduledSourceNode; release: () => void };

/** Dry, quiet toy-like foley, generated once in the browser after a gesture. */
export class FlowAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private last = new Map<FlowSound, number>();
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
        const context = new Audio();
        try {
          const master = context.createGain();
          master.gain.value = 0.5;
          // Gentle peak control, with a direct-gain fallback on older engines.
          try {
            const limiter = context.createDynamicsCompressor();
            limiter.threshold.value = -14;
            limiter.knee.value = 12;
            limiter.ratio.value = 4;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.12;
            master.connect(limiter);
            limiter.connect(context.destination);
            this.limiter = limiter;
          } catch {
            master.connect(context.destination);
          }
          this.context = context;
          this.master = master;
        } catch {
          void context.close().catch(() => {});
        }
      }
      if (this.context?.state === "suspended")
        void this.context.resume().catch(() => {});
    } catch {
      /* Audio failure must never stop a move. */
    }
  }

  play(kind: FlowSound, color = 0, variation = 0, pan = 0) {
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
    const interval = cooldown[kind] ?? 0;
    if (
      interval &&
      ctx.currentTime - (this.last.get(kind) ?? -Infinity) < interval
    )
      return;
    // Leave room for pickup, delivery and UI cues when a dense swarm is walking.
    if (this.voices.size >= (kind === "step" || kind === "carry" ? 16 : 24))
      return;
    this.last.set(kind, ctx.currentTime);
    const seed = Math.abs(
        Math.trunc(Number.isFinite(variation) ? variation : 0),
      ),
      base =
        notes[
          Math.abs(Math.trunc(Number.isFinite(color) ? color : 0)) %
            notes.length
        ],
      pitch = 1 + ((seed % 7) - 3) * 0.018,
      position = Math.max(-0.6, Math.min(0.6, Number.isFinite(pan) ? pan : 0));

    const route = (envelope: GainNode, nodes: AudioNode[]) => {
      try {
        const panner = ctx.createStereoPanner();
        panner.pan.value = position;
        nodes.push(panner);
        envelope.connect(panner);
        panner.connect(this.master!);
      } catch {
        envelope.connect(this.master!);
      }
    };
    const attach = (
      source: AudioScheduledSourceNode,
      nodes: AudioNode[],
      at: number,
      duration: number,
    ) => {
      const voice: Voice = {
        source,
        release: () => {
          this.voices.delete(voice);
          for (const node of nodes) {
            try {
              node.disconnect();
            } catch {
              /* Already disconnected. */
            }
          }
          source.onended = null;
        },
      };
      this.voices.add(voice);
      source.onended = voice.release;
      try {
        source.start(at);
        source.stop(at + duration + 0.012);
      } catch (error) {
        voice.release();
        try {
          source.stop();
        } catch {
          /* Never started. */
        }
        throw error;
      }
    };
    const voice = (
      frequency: number,
      at: number,
      duration: number,
      gain = 0.1,
      type: OscillatorType = "sine",
      end = frequency,
    ) => {
      if (this.voices.size >= 24) return;
      const nodes: AudioNode[] = [];
      try {
        const oscillator = ctx.createOscillator(),
          envelope = ctx.createGain(),
          time = ctx.currentTime + at;
        nodes.push(oscillator, envelope);
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, time);
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(40, end),
          time + duration,
        );
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(
          gain,
          time + Math.min(0.008, duration / 4),
        );
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(envelope);
        route(envelope, nodes);
        attach(oscillator, nodes, time, duration);
      } catch {
        for (const node of nodes)
          try {
            node.disconnect();
          } catch {
            /* Unsupported node. */
          }
      }
    };
    const rustle = (
      at: number,
      duration: number,
      gain: number,
      frequency: number,
      rate = 1,
    ) => {
      if (this.voices.size >= 24) return;
      const nodes: AudioNode[] = [];
      try {
        if (!this.noise) {
          this.noise = ctx.createBuffer(
            1,
            Math.ceil(ctx.sampleRate * 0.18),
            ctx.sampleRate,
          );
          const data = this.noise.getChannelData(0);
          let state = 17321;
          for (let i = 0; i < data.length; i++) {
            state = (Math.imul(state, 1664525) + 1013904223) | 0;
            data[i] = (state / 2147483648) * 0.7;
          }
        }
        const source = ctx.createBufferSource(),
          filter = ctx.createBiquadFilter(),
          envelope = ctx.createGain(),
          time = ctx.currentTime + at;
        nodes.push(source, filter, envelope);
        source.buffer = this.noise;
        source.playbackRate.value = rate;
        filter.type = "bandpass";
        filter.frequency.value = frequency;
        filter.Q.value = 0.65;
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(
          gain,
          time + Math.min(0.006, duration / 4),
        );
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        source.connect(filter);
        filter.connect(envelope);
        route(envelope, nodes);
        attach(source, nodes, time, duration);
      } catch {
        for (const node of nodes)
          try {
            node.disconnect();
          } catch {
            /* Unsupported node. */
          }
      }
    };

    if (kind === "step") {
      // A tiny alternating pair: papery feet with a rounded, low wooden contact.
      rustle(0, 0.033, 0.105, 1000 + (seed % 4) * 150, pitch);
      voice((155 + (seed % 3) * 19) * pitch, 0, 0.035, 0.06, "sine", 95);
    }
    if (kind === "carry") {
      rustle(0, 0.065, 0.075, 680 + (seed % 3) * 120, pitch * 0.85);
      voice(235 * pitch, 0.009, 0.055, 0.045, "triangle", 175);
    }
    if (kind === "pickup") {
      // A dry cube click and a small upward rubbery pluck, not a sharp beep.
      rustle(0, 0.04, 0.15, 1900 + (seed % 3) * 120, 1.12);
      voice(base * 0.56 * pitch, 0.006, 0.095, 0.13, "sine", base * 0.92);
      voice(base * 1.5, 0.012, 0.055, 0.035);
    }
    if (kind === "tap") voice(380, 0, 0.055, 0.08, "triangle", 260);
    if (kind === "start") {
      voice(523, 0, 0.15);
      voice(784, 0.075, 0.23, 0.1);
    }
    if (kind === "launch") {
      rustle(0, 0.11, 0.13, 620, 0.85);
      voice(base * 0.4, 0.005, 0.15, 0.14, "triangle", base * 0.7);
    }
    if (kind === "collect") {
      // Warm contact at the nest, distinct from the higher pickup pluck.
      rustle(0, 0.04, 0.11, 850, 0.8);
      voice(base * 0.75 * pitch, 0, 0.11, 0.105, "sine", base * 0.7);
      voice(base * 1.5, 0.012, 0.07, 0.035);
    }
    if (kind === "dock") {
      voice(base, 0, 0.14, 0.1);
      voice(base * 1.5, 0.045, 0.18, 0.07);
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

  /** Cancel a scene immediately without closing the gesture-unlocked context. */
  cancel() {
    this.last.clear();
    for (const voice of [...this.voices]) {
      try {
        voice.source.stop();
      } catch {
        /* Already ended. */
      }
      voice.release();
    }
    this.voices.clear();
  }
  hush() {
    this.active = false;
    this.cancel();
    if (this.context?.state === "running")
      void this.context.suspend().catch(() => {});
  }
  dispose() {
    this.hush();
    this.closed = true;
    if (this.context && this.context.state !== "closed")
      void this.context.close().catch(() => {});
    this.master?.disconnect();
    this.limiter?.disconnect();
    this.context = null;
    this.master = null;
    this.limiter = null;
    this.noise = null;
  }
}
