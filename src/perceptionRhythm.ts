export const RHYTHM_CUE_START = 900;
export const RHYTHM_GUIDED_TAPS = 4;
export const RHYTHM_SOLO_TAPS = 8;

export function rhythmCueAt(tap: number, period: number) {
  const index = Math.round((tap - RHYTHM_CUE_START) / period);
  const cue = RHYTHM_CUE_START + index * period;
  return index >= 0 && Math.abs(tap - cue) <= period / 3 ? cue : null;
}

function isTapSequence(taps: unknown, count: number): taps is number[] {
  return Array.isArray(taps) && taps.length === count && taps.every(
    (tap, index) => Number.isFinite(tap) && tap >= 0 && (index === 0 || tap > taps[index - 1]),
  );
}

export function evaluateRhythm(bpm: number, taps: unknown, calibration: unknown) {
  if (!isTapSequence(taps, RHYTHM_SOLO_TAPS)) {
    throw new Error("Нужно восемь нажатий по порядку");
  }

  const period = 60000 / bpm;
  // A queued answer from the previous client has no guided taps.
  let anchor = 800 + 3 * period;
  if (calibration !== undefined) {
    if (!isTapSequence(calibration, RHYTHM_GUIDED_TAPS)) {
      throw new Error("Нужно четыре попадания под метроном");
    }
    const cues = calibration.map((tap) => rhythmCueAt(tap, period));
    const lastCue = cues[RHYTHM_GUIDED_TAPS - 1];
    if (
      lastCue === null ||
      cues.some((cue, index) => cue === null || (index > 0 && cue === cues[index - 1])) ||
      taps[0] < lastCue + period / 2
    ) {
      throw new Error("Сначала попади в четыре удара метронома");
    }
    const latency = calibration.reduce((sum, tap, index) => sum + tap - cues[index]!, 0) / calibration.length;
    anchor = lastCue + latency;
  }

  const differences = taps.map((tap, index) => tap - (anchor + (index + 1) * period));
  const mean = differences.reduce((sum, offset) => sum + offset, 0) / differences.length;
  const shiftedBeats = Math.round(mean / period);
  // Starting a whole beat late changes the phase origin, not the tempo.
  const offsets = differences.map((offset) => offset - shiftedBeats * period);
  const phase = mean - shiftedBeats * period;
  const jitter = Math.sqrt(offsets.reduce((sum, offset) => sum + (offset - phase) ** 2, 0) / offsets.length);
  const error = .6 * Math.abs(phase) + .4 * jitter;

  return {
    score: Math.round(100 * Math.exp(-.5 * (error / 60) ** 2)),
    error: Math.round(error),
    unit: "мс",
    guess: Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))),
    actual: bpm,
    rhythm: {
      offsets: offsets.map(Math.round),
      phase: Math.round(phase),
      jitter: Math.round(jitter),
      shiftedBeats,
    },
  };
}
