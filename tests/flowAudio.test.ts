import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowAudio } from "../src/flowAudio";
const parameter = (value = 1) => ({
  value,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const sourceNode = (kind: "oscillator" | "noise") => {
  const source = {
    ...node(),
    kind,
    frequency: parameter(),
    playbackRate: parameter(),
    buffer: null,
    start: vi.fn(),
    stop: vi.fn((at?: number) => {
      if (at === undefined) source.onended?.();
    }),
    onended: null as null | (() => void),
    type: "sine",
  };
  return source;
};
type GainMock = ReturnType<typeof node> & {
  gain: ReturnType<typeof parameter>;
};
class AudioMock {
  static all: AudioMock[] = [];
  state = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  sources: ReturnType<typeof sourceNode>[] = [];
  buffers: Float32Array[] = [];
  panners: { pan: ReturnType<typeof parameter> }[] = [];
  gains: GainMock[] = [];
  graph: ReturnType<typeof node>[] = [];
  constructor() {
    AudioMock.all.push(this);
  }
  createGain(): GainMock {
    const gain = { ...node(), gain: parameter() };
    this.gains.push(gain);
    this.graph.push(gain);
    return gain;
  }
  createDynamicsCompressor() {
    const compressor = {
      ...node(),
      threshold: parameter(),
      knee: parameter(),
      ratio: parameter(),
      attack: parameter(),
      release: parameter(),
    };
    this.graph.push(compressor);
    return compressor;
  }
  createStereoPanner() {
    const panner = { ...node(), pan: parameter(0) };
    this.panners.push(panner);
    this.graph.push(panner);
    return panner;
  }
  createBiquadFilter() {
    const filter = {
      ...node(),
      frequency: parameter(),
      Q: parameter(),
      type: "",
    };
    this.graph.push(filter);
    return filter;
  }
  source(kind: "oscillator" | "noise") {
    const source = sourceNode(kind);
    this.sources.push(source);
    this.graph.push(source);
    return source;
  }
  createOscillator() {
    return this.source("oscillator");
  }
  createBufferSource() {
    return this.source("noise");
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    this.buffers.push(data);
    return { getChannelData: () => data };
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  close() {
    this.state = "closed";
    return Promise.resolve();
  }
}
beforeEach(() => {
  AudioMock.all = [];
  vi.stubGlobal("AudioContext", AudioMock);
  vi.stubGlobal("document", { hidden: false });
});
afterEach(() => vi.unstubAllGlobals());
describe("Рой: ant footsteps and cube foley", () => {
  it("never autoplays; a gesture unlocks quiet compressed audio", () => {
    const audio = new FlowAudio();
    audio.play("step");
    expect(AudioMock.all).toHaveLength(0);
    audio.wake();
    audio.play("step");
    const ctx = AudioMock.all[0];
    expect(ctx.sources.map((s) => s.kind)).toEqual(["noise", "oscillator"]);
    expect(ctx.gains[0].gain.value).toBeLessThan(1);
    expect(ctx.graph[1]).toMatchObject({
      ratio: { value: 4 },
      threshold: { value: -14 },
    });
  });
  it("reuses its short noise buffer and gives pickup, carrying and delivery distinct envelopes", () => {
    const audio = new FlowAudio();
    audio.wake();
    const ctx = AudioMock.all[0];
    audio.play("step", 0, 0);
    audio.play("pickup", 2, 3);
    audio.play("carry", 2, 2);
    audio.play("collect", 2, 4);
    expect(ctx.buffers).toHaveLength(1);
    expect(ctx.buffers[0].length).toBeLessThan(ctx.sampleRate * 0.2);
    expect(ctx.sources.filter((s) => s.kind === "noise")).toHaveLength(4);
    const lifetimes = ctx.sources
      .filter((s) => s.kind === "noise")
      .map((s) => s.stop.mock.calls[0][0]);
    expect(lifetimes[0]).toBeLessThan(lifetimes[2]!);
    expect(new Set(lifetimes).size).toBe(3);
    expect(ctx.buffers[0].some((sample) => sample !== 0)).toBe(true);
  });
  it("throttles dense swarms per cue without suppressing a pickup at the same instant", () => {
    const audio = new FlowAudio();
    audio.wake();
    const ctx = AudioMock.all[0];
    for (let i = 0; i < 40; i++) audio.play("step", i % 7, i);
    expect(ctx.sources).toHaveLength(2);
    audio.play("pickup", 2);
    expect(ctx.sources).toHaveLength(5);
    ctx.currentTime = 0.056;
    audio.play("step", 1, 1);
    expect(ctx.sources).toHaveLength(7);
  });
  it("caps all sources and leaves event headroom above footsteps", () => {
    const audio = new FlowAudio();
    audio.wake();
    const ctx = AudioMock.all[0];
    for (let i = 0; i < 16; i++) {
      ctx.currentTime += 0.1;
      audio.play("step", 0, i);
    }
    expect(ctx.sources).toHaveLength(16);
    audio.play("pickup", 0);
    expect(ctx.sources).toHaveLength(19);
    for (let i = 0; i < 30; i++) audio.play("win");
    expect(ctx.sources).toHaveLength(24);
    ctx.sources[0].onended?.();
    audio.play("tap");
    expect(ctx.sources).toHaveLength(25);
  });
  it("clamps pan and varies repeated feet, while preserving a mono fallback", () => {
    const audio = new FlowAudio();
    audio.wake();
    const ctx = AudioMock.all[0];
    audio.play("step", 0, 0, -2);
    const first = ctx.sources.find((s) => s.kind === "oscillator")!;
    ctx.currentTime = 0.1;
    audio.play("step", 0, 2, 2);
    expect(ctx.panners.map((p) => p.pan.value)).toEqual([-0.6, -0.6, 0.6, 0.6]);
    expect(ctx.sources[3].frequency.setValueAtTime.mock.calls[0][0]).not.toBe(
      first.frequency.setValueAtTime.mock.calls[0][0],
    );
    vi.spyOn(ctx, "createStereoPanner").mockImplementation(() => {
      throw Error("no stereo");
    });
    expect(() => audio.play("tap")).not.toThrow();
    expect(ctx.sources.at(-1)?.start).toHaveBeenCalled();
  });
  it("stops and disconnects future-scheduled voices on pause; resume works without a new context", () => {
    const audio = new FlowAudio();
    audio.wake();
    const ctx = AudioMock.all[0];
    audio.play("win");
    audio.play("pickup");
    const count = ctx.sources.length;
    const sourceNodes = [...ctx.graph].slice(2);
    audio.hush();
    expect(ctx.state).toBe("suspended");
    expect(
      ctx.sources.every((s) =>
        s.stop.mock.calls.some((args) => args.length === 0),
      ),
    ).toBe(true);
    expect(sourceNodes.every((n) => n.disconnect.mock.calls.length > 0)).toBe(
      true,
    );
    audio.play("dock");
    expect(ctx.sources).toHaveLength(count);
    audio.wake();
    audio.play("step");
    expect(ctx.sources.length).toBe(count + 2);
    audio.dispose();
    audio.wake();
    audio.play("win");
    expect(ctx.state).toBe("closed");
    expect(AudioMock.all).toHaveLength(1);
  });
  it("cancels a restarted scene without suspending its unlocked context", () => {
    const audio = new FlowAudio();
    audio.wake();
    const ctx = AudioMock.all[0];
    audio.play("step");
    expect(ctx.sources).toHaveLength(2);
    audio.cancel();
    expect(ctx.state).toBe("running");
    expect(
      ctx.sources.every((source) => source.disconnect.mock.calls.length > 0),
    ).toBe(true);
    audio.play("step");
    expect(ctx.sources).toHaveLength(4);
    expect(AudioMock.all).toHaveLength(1);
    audio.dispose();
  });
  it("stays silent when hidden and tolerates unavailable foley or rejected audio", () => {
    vi.stubGlobal("document", { hidden: true });
    const hidden = new FlowAudio();
    hidden.wake();
    hidden.play("start");
    expect(AudioMock.all).toHaveLength(0);
    vi.stubGlobal("document", { hidden: false });
    const audio = new FlowAudio();
    audio.wake();
    const ctx = AudioMock.all[0];
    vi.spyOn(ctx, "createBuffer").mockImplementation(() => {
      throw Error("no noise");
    });
    expect(() => audio.play("pickup")).not.toThrow();
    expect(ctx.sources.map((s) => s.kind)).toEqual([
      "oscillator",
      "oscillator",
    ]);
    vi.stubGlobal("document", { hidden: true });
    audio.play("win");
    expect(ctx.sources).toHaveLength(2);
    vi.stubGlobal("document", { hidden: false });
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw Error("blocked");
        }
      },
    );
    const blocked = new FlowAudio();
    expect(() => {
      blocked.wake();
      blocked.play("win");
      blocked.dispose();
    }).not.toThrow();
  });
  it("uses the legacy Safari constructor when AudioContext is absent", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", AudioMock);
    const audio = new FlowAudio();
    audio.wake();
    audio.play("tap");
    expect(AudioMock.all).toHaveLength(1);
    expect(AudioMock.all[0].sources).toHaveLength(1);
    audio.dispose();
  });
});
