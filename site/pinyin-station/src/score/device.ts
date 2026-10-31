import type { RecordingMeta } from '../speech/recordings';
/** Coarse device facts stored with each recording so calibration can be split by device and window size. */
export function deviceInfo(): RecordingMeta['device'] {
  let standalone = false;
  try {
    standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    /* Older engines. */
  }
  return { ua: navigator.userAgent.slice(0, 200), viewport: [innerWidth, innerHeight], dpr: window.devicePixelRatio || 1, standalone };
}
