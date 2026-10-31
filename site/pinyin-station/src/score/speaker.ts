/**
 * Per-speaker normalisation state. The feasibility study (pinyin-lab) found that tone shape from F0 only works when the
 * contour is normalised against the SPEAKER, not the single recording: the child's own pitch centre and pitch range,
 * estimated from his last N recordings (no labels needed). Without it, new-voice accuracy fell to 50-63 %.
 *
 * The profile never leaves the device: it is a short list of numbers kept in localStorage.
 */
export interface SpeakerSample {
  /** Median F0 of the recording's voiced span, Hz. */
  hz: number;
  /** max-min of the recording's 10-point semitone contour. */
  range: number;
}
export interface SpeakerProfile {
  recent: SpeakerSample[];
}
export const SPEAKER_WINDOW = 20;
/** Fewer than this many usable recordings: say nothing about tone (too early to know his pitch range). */
export const SPEAKER_MIN = 8;
/** 90th percentile of per-recording pitch range in the licensed adult-female library (semitones); see scorer.test.ts. */
export const REFERENCE_RANGE_ST = 11.7;

export const emptySpeaker = (): SpeakerProfile => ({ recent: [] });
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const percentile = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];

export function addRecording(profile: SpeakerProfile, sample: SpeakerSample, window = SPEAKER_WINDOW): SpeakerProfile {
  if (!(sample.hz > 50 && sample.hz < 900) || !Number.isFinite(sample.range) || sample.range < 0 || sample.range > 40) return profile;
  return { recent: [...profile.recent, sample].slice(-window) };
}
export function speakerReady(profile: SpeakerProfile | undefined): profile is SpeakerProfile {
  return !!profile && profile.recent.length >= SPEAKER_MIN;
}
export interface SpeakerSummary {
  n: number;
  medianHz: number;
  rangeP90: number;
  /** Multiply semitone excursions by this to bring the speaker to the reference range (clamped 0.6-1.8). */
  scale: number;
}
export function summarize(profile: SpeakerProfile): SpeakerSummary {
  const n = profile.recent.length;
  if (!n) return { n: 0, medianHz: 0, rangeP90: REFERENCE_RANGE_ST, scale: 1 };
  const rangeP90 = percentile(
    profile.recent.map((s) => s.range),
    0.9,
  );
  return {
    n,
    medianHz: median(profile.recent.map((s) => s.hz)),
    rangeP90,
    scale: Math.max(0.6, Math.min(1.8, REFERENCE_RANGE_ST / Math.max(1, rangeP90))),
  };
}

const KEY = 'pinyin-station:speaker:v1';
export function loadSpeaker(): SpeakerProfile {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (parsed && Array.isArray(parsed.recent)) return { recent: parsed.recent.filter((s: SpeakerSample) => s && s.hz > 0).slice(-SPEAKER_WINDOW) };
  } catch {
    /* Storage may be unavailable (private mode); start empty. */
  }
  return emptySpeaker();
}
export function saveSpeaker(profile: SpeakerProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* Not persisting is acceptable: the profile rebuilds from the next recordings. */
  }
}
export function clearSpeaker(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing to clear. */
  }
}
