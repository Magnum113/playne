import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowAudio } from "../src/flowAudio";
class AudioMock {
  static all: AudioMock[] = [];
  state = "running";
  currentTime = 0;
  destination = {};
  voices: any[] = [];
  constructor() {
    AudioMock.all.push(this);
  }
  createGain() {
    return {
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  createOscillator() {
    const node = {
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn((at?: number) => {
        if (at === undefined) node.onended?.();
      }),
      onended: null as null | (() => void),
      type: "sine",
    };
    this.voices.push(node);
    return node;
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
describe("Рой: short interaction sounds", () => {
  it("never autoplays; caps simultaneous voices and stops future scheduled effects after pause", () => {
    const audio = new FlowAudio();
    audio.play("start");
    expect(AudioMock.all).toHaveLength(0);
    audio.wake();
    audio.play("launch", 1);
    const ctx = AudioMock.all[0];
    expect(ctx.voices).toHaveLength(1);
    for (let i = 0; i < 40; i++) audio.play("collect", i % 7);
    expect(ctx.voices).toHaveLength(18);
    audio.hush();
    const count = ctx.voices.length;
    audio.play("win");
    expect(ctx.state).toBe("suspended");
    expect(ctx.voices).toHaveLength(count);
    audio.wake();
    audio.play("tap");
    expect(ctx.voices).toHaveLength(count + 1);
    audio.dispose();
    audio.wake();
    audio.play("win");
    expect(ctx.state).toBe("closed");
    expect(AudioMock.all).toHaveLength(1);
  });
  it("stays silent in a hidden tab and tolerates unavailable or rejected audio", () => {
    vi.stubGlobal("document", { hidden: true });
    const hidden = new FlowAudio();
    hidden.wake();
    hidden.play("start");
    expect(AudioMock.all).toHaveLength(0);
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
});
