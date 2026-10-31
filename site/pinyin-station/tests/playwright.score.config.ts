/**
 * Browser tests for the local-scoring trial against the Vite DEV server (no build needed):
 *   KG_SHOTS_DIR=~/kid-games-work/shots/pinyin-lab npx playwright test -c site/pinyin-station/tests/playwright.score.config.ts
 * WebKit projects stub the microphone (WebKit cannot fake audio); the chromium project uses Chromium's real fake
 * audio device fed from a generated WAV, so the true capture pipeline (getUserMedia -> AudioWorklet -> VAD) runs.
 * Always muted: pages load with ?mute, Chromium with --mute-audio.
 */
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from '@playwright/test';
import base from '../../../tests/smoke/playwright.config';
import { FIXTURES, REPO_ROOT, encodeWav, gaussian, rng, synthVoice } from '../src/score/test-support';

const PORT = Number(process.env.KG_SCORE_PORT || 5333);
// Lets score.spec.ts know it is served by the Vite dev server (it imports source modules for the worker-timing test).
process.env.KG_SCORE_DEV = '1';
export const FAKE_MIC = path.join(FIXTURES, 'fake-mic-rising.wav');
fs.mkdirSync(FIXTURES, { recursive: true });
{
  // 0.5 s of room noise, a rising child-pitched "ma2/ni2" (tone 2) of 0.6 s, then 1.6 s of room noise. Chromium loops it.
  const sr = 16000,
    random = rng(21),
    out = new Float32Array(Math.round(2.7 * sr));
  for (let i = 0; i < out.length; i++) out[i] = 0.0008 * gaussian(random);
  const voice = synthVoice({ seconds: 0.6, f0: (t) => 270 * Math.pow(2, (7 * Math.min(1, Math.max(0, (t - 0.03) / 0.54))) / 12), amp: () => 0.7 });
  voice.forEach((x, i) => (out[Math.round(0.5 * sr) + i] += x));
  fs.writeFileSync(FAKE_MIC, encodeWav(out, sr));
}
const mobile = { deviceScaleFactor: 2, isMobile: true, hasTouch: true } as const;
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'score.spec.ts',
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: 'portrait-810x1080', use: { ...mobile, viewport: { width: 810, height: 1080 } } },
    { name: 'landscape-1080x810', use: { ...mobile, viewport: { width: 1080, height: 810 } } },
    { name: 'phone-390x664', use: { ...mobile, viewport: { width: 390, height: 664 } } },
    { name: 'phone-844x390', use: { ...mobile, viewport: { width: 844, height: 390 } } },
    {
      name: 'chromium-fake-mic',
      use: {
        browserName: 'chromium',
        viewport: { width: 810, height: 1080 },
        permissions: ['microphone'],
        launchOptions: {
          args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${FAKE_MIC}`, '--mute-audio'],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    cwd: REPO_ROOT,
    url: `http://localhost:${PORT}/pinyin-station/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
  },
});
