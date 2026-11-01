import { test, expect, type Page } from '@playwright/test';
import { parentPin } from './helpers';
import fs from 'node:fs';
import { instrument, watch, shot } from '../../../tests/smoke/helpers';
import { initialSave } from '../src/domain/learning';

/** Saved game with the local-scoring switch on and a first 'read' question whose answer is ni2 (rising tone). */
function seedSave(localScore: boolean) {
  const seed = initialSave();
  seed.settings.localScore = localScore;
  // 泥 (ni2) is an alias of 泥土 and is no longer scheduled; the single-syllable read question is injected.
  seed.resume = { mode: 'read', index: 0, at: Date.now(), queue: [{ id: 'D:ni', kind: 'D' as const, target: 'ni', skill: 'word:ni:say', lesson: 4, phase: 'main' as const, choices: ['ni'] }] };
  return seed;
}
async function start(page: Page, localScore = true, knownChild = true) {
  await instrument(page);
  const seed = seedSave(localScore);
  await page.addInitScript(
    ({ seed, knownChild }) => {
      localStorage.setItem('kg:v1:pinyin-station', JSON.stringify({ v: 1, updatedAt: Date.now(), data: seed }));
      // A child who has already read ~10 syllables (the scorer says nothing about tone before that).
      if (knownChild && !localStorage.getItem('pinyin-station:speaker:v1'))
        localStorage.setItem('pinyin-station:speaker:v1', JSON.stringify({ recent: Array.from({ length: 10 }, () => ({ hz: 320, range: 11.7 })) }));
    },
    { seed, knownChild },
  );
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始今天的节目' })).toBeVisible();
  await page.getByRole('button', { name: '接着上次的节目' }).click();
}
/** WebKit cannot fake audio: stand in for getUserMedia + the capture worklet with synthetic child-pitched PCM. */
async function stubMic(page: Page, kind: 'rising' | 'falling' | 'quiet') {
  await page.addInitScript((kind) => {
    const state = { stopped: 0 };
    (window as any).__mic = state;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ readyState: 'live', stop: () => state.stopped++ }] }) },
      configurable: true,
    });
    AudioContext.prototype.createMediaStreamSource = function () {
      return this.createGain() as any;
    };
    (window as any).AudioWorkletNode = class extends GainNode {
      port: { onmessage: ((event: { data: Float32Array }) => void) | null } = { onmessage: null };
      constructor(context: AudioContext) {
        super(context);
        const sr = context.sampleRate,
          lead = Math.round(0.4 * sr),
          voiced = Math.round(0.6 * sr),
          total = lead + voiced + Math.round(1.0 * sr);
        const pcm = new Float32Array(total);
        let seed = 7;
        const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.0016;
        let phase = 0;
        for (let i = 0; i < total; i++) {
          let v = noise();
          if (i >= lead && i < lead + voiced) {
            const u = (i - lead) / voiced;
            const st = kind === 'falling' ? 3 - 11 * u : -2 + 7 * u;
            phase += (2 * Math.PI * 300 * Math.pow(2, st / 12)) / sr;
            let s = 0;
            for (let h = 1; h <= 10; h++) s += Math.sin(h * phase) / h ** 1.2;
            v += 0.3 * s * (kind === 'quiet' ? 0.012 : 1) * Math.min(1, u * 20, (1 - u) * 20);
          }
          pcm[i] = v;
        }
        let at = 0;
        const timer = window.setInterval(() => {
          // After the scripted clip the room keeps hissing quietly, like a real microphone.
          const block = at < total ? pcm.slice(at, at + 1024) : Float32Array.from({ length: 1024 }, () => noise());
          this.port.onmessage?.({ data: block });
          at += 1024;
        }, 4);
        (this as any).__timer = timer;
      }
      disconnect() {
        clearInterval((this as any).__timer);
        super.disconnect();
      }
    };
  }, kind);
}
const atoms = (page: Page) => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data.atoms));

for (const [kind, verdict] of [
  ['rising', 'match'],
  ['falling', 'differs'],
  ['quiet', 'unsure'],
] as const) {
  test(`webkit/stub: ${kind} voice for ni2 shows a gentle card (${verdict})`, async ({ page, browserName }, info) => {
    test.skip(browserName === 'chromium', 'chromium has its own real-microphone test below');
    const diagnostics = watch(page);
    await stubMic(page, kind);
    await start(page);
    await page.getByRole('button', { name: '读给台长听' }).click();
    const card = page.locator('.score-card');
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toHaveAttribute('data-verdict', verdict);
    // Two curves for a clear voice; the model curve is always there (drawn from the licensed recording's F0).
    await expect(card.locator('.score-model path')).toHaveCount(1, { timeout: 10000 });
    if (kind !== 'quiet') await expect(card.locator('.score-mine path')).toHaveCount(1);
    const text = await card.innerText();
    expect(text).not.toMatch(/错|失败|不对|分数|得分|倒计时/);
    if (verdict === 'unsure') expect(text).toContain('声音再大一点点');
    if (verdict === 'differs') expect(text).toContain('上扬');
    for (const name of ['再听示范', '听我的', '再读一次', '接下一条'])
      await expect(card.getByRole('button', { name, exact: true })).toBeVisible();
    // Every control is a >= 44 px target, inside the viewport, and nothing overflows horizontally.
    const geometry = await page.evaluate(() => ({
      small: [...document.querySelectorAll('.score-card button')].filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).map((b) => b.textContent),
      outside: [...document.querySelectorAll('.score-card button')].filter((b) => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.top < 0; }).map((b) => b.textContent),
      overflowX: document.documentElement.scrollWidth > innerWidth,
      cardOverflowY: (document.querySelector('.score-card') as HTMLElement).scrollHeight - (document.querySelector('.score-card') as HTMLElement).clientHeight,
    }));
    expect(geometry.small).toEqual([]);
    expect(geometry.outside).toEqual([]);
    expect(geometry.overflowX).toBe(false);
    await page.waitForTimeout(450); // let the slide-in settle for the screenshot
    await shot(page, info.project.name, `pinyin-local-card-${kind}`);
    // Local results never count toward mastery, whatever the verdict.
    expect(await atoms(page)).toEqual([]);
    await card.getByRole('button', { name: '再读一次', exact: true }).click();
    await expect(page.locator('.score-card')).toHaveCount(0);
    await expect(page.locator('.score-card')).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => (window as any).__mic.stopped)).toBe(2);
    await card.getByRole('button', { name: '接下一条', exact: true }).click();
    expect(await atoms(page)).toEqual([]);
    expect(diagnostics.errors).toEqual([]);
  });
}

test('with the parent switch off (default) nothing changes: no local card, old buttons remain', async ({ page, browserName }) => {
  test.skip(browserName === 'chromium', 'WebKit stub');
  await stubMic(page, 'rising');
  await start(page, false);
  await page.getByRole('button', { name: '读给台长听' }).click();
  await expect(page.getByRole('button', { name: '听我的声音' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.score-card')).toHaveCount(0);
});

test('parent page has the "local scoring (trial)" switch, default off, persisted when turned on', async ({ page, browserName }) => {
  test.skip(browserName === 'chromium', 'WebKit layout project');
  await instrument(page);
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await page.getByRole('button', { name: '家长', exact: true }).click();
  await parentPin(page);
  const toggle = page.getByLabel('本地评分（试用）');
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('不会判错')).toBeVisible();
  await toggle.check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data.settings.localScore)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data.settings.ai)).toBe(false);
});

test('chromium real fake microphone: record -> trim -> level meter -> dispose, no live tracks', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'WebKit cannot fake audio capture');
  const diagnostics = watch(page);
  await page.addInitScript(() => {
    const tracks: MediaStreamTrack[] = [];
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const stream = await real(c);
      stream.getTracks().forEach((t) => tracks.push(t));
      return stream;
    };
    (window as any).__tracks = tracks;
    (window as any).__maxLevel = 0;
    setInterval(() => {
      const meter = document.querySelector('.voice-meter') as HTMLElement | null;
      if (meter) (window as any).__maxLevel = Math.max((window as any).__maxLevel, parseFloat(meter.style.getPropertyValue('--level') || '0'));
    }, 20);
  });
  await start(page);
  await page.getByRole('button', { name: '读给台长听' }).click();
  const card = page.locator('.score-card');
  await expect(card).toBeVisible({ timeout: 20000 });
  expect(await card.getAttribute('data-verdict')).toBe('match');
  expect(await page.evaluate(() => (window as any).__maxLevel)).toBeGreaterThan(0.3);
  // No microphone track is left live the moment the clip is closed.
  const live = () => page.evaluate(() => ((window as any).__tracks as MediaStreamTrack[]).filter((t) => t.readyState === 'live').length);
  expect(await live()).toBe(0);
  expect(await page.evaluate(() => (window as any).__tracks.length)).toBe(1);
  // Trimmed: the stored recording is the ~0.6 s voiced stretch plus pre/post roll, not the 2.7 s file.
  const bytes = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('kg-pinyin-station');
        open.onsuccess = () => {
          const all = open.result.transaction('recordings').objectStore('recordings').getAll();
          all.onsuccess = () => resolve((all.result[0].audio as ArrayBuffer).byteLength);
        };
      }),
  );
  const seconds = (bytes - 44) / 2 / 16000;
  expect(seconds).toBeGreaterThan(0.55);
  expect(seconds).toBeLessThan(1.3);
  const saved = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const open = indexedDB.open('kg-pinyin-station');
        open.onsuccess = () => {
          const all = open.result.transaction('recordings').objectStore('recordings').getAll();
          all.onsuccess = () => resolve(all.result[0]);
        };
      }),
  );
  expect(saved.local).toMatchObject({ verdict: 'match', scorers: ['tone-shape'] });
  // Calibration data travels with the recording: target, features, quality flags, device, and his speaker profile size.
  expect(saved.local.contour).toHaveLength(10);
  expect(saved.local.features).toMatchObject({ expected: 'rising', heard: 'rising' });
  expect(saved.meta).toMatchObject({ v: 1, target: { syllable: 'ni2', initial: 'n', final: 'i', tone: 2 }, capture: { source: 'worklet' }, speakerN: 10 });
  expect(saved.meta.capture.quality.unreliable).toBe(false);
  expect(saved.meta.device.viewport).toEqual([810, 1080]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pinyin-station:speaker:v1')!).recent.length)).toBe(11);
  await page.waitForTimeout(450);
  await shot(page, info.project.name, 'pinyin-local-card-real-mic');
  // Record again, then leave the screen mid-recording: dispose must still leave nothing live.
  await card.getByRole('button', { name: '再读一次', exact: true }).click();
  await page.getByRole('button', { name: '收好电台', exact: true }).click();
  await expect.poll(live).toBe(0);
  expect(await atoms(page)).toEqual([]);
  expect(diagnostics.errors).toEqual([]);
});

test('worker timing for a 1.5 s clip (main thread stays free)', async ({ page, browserName }, info) => {
  test.skip(!process.env.KG_SCORE_DEV, 'imports source modules: only under the Vite dev server (playwright.score.config.ts)');
  await page.goto('/pinyin-station/?mute');
  const timing = await page.evaluate(async () => {
    const url = '/pinyin-station/src/score/client.ts';
    const { LocalScorer } = await import(/* @vite-ignore */ url);
    const sr = 16000,
      n = Math.round(1.5 * sr),
      pcm = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const voiced = t > 0.3 && t < 1.0;
      phase += (2 * Math.PI * 300 * Math.pow(2, (7 * Math.max(0, Math.min(1, (t - 0.3) / 0.7))) / 12)) / sr;
      let s = 0;
      for (let h = 1; h <= 10; h++) s += Math.sin(h * phase) / h ** 1.2;
      pcm[i] = voiced ? 0.3 * s * Math.min(1, (t - 0.3) * 50, (1.0 - t) * 50) : 0.0004 * Math.sin(i * 12.9898);
    }
    const scorer = new LocalScorer();
    const input = { pcm, sampleRate: sr, speaker: { recent: Array.from({ length: 10 }, () => ({ hz: 320, range: 11.7 })) }, target: { syllable: 'ni2', initial: 'n', final: 'i', tone: 2 as const }, confusions: { tones: [3 as const] } };
    // Count how long the main thread stays unresponsive while the worker scores.
    let longest = 0,
      last = performance.now();
    const probe = setInterval(() => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
    }, 4);
    const t0 = performance.now();
    const first = await scorer.score(input);
    const firstMs = performance.now() - t0;
    const runs: number[] = [];
    for (let i = 0; i < 12; i++) {
      const s = performance.now();
      await scorer.score(input);
      runs.push(performance.now() - s);
    }
    clearInterval(probe);
    scorer.dispose();
    runs.sort((a, b) => a - b);
    return { verdict: first.verdict, firstMs, medianMs: runs[6], maxMs: runs[11], inWorkerMs: first.elapsedMs, longestMainThreadGapMs: longest };
  });
  console.log(`WORKER TIMING ${info.project.name}: ${JSON.stringify(timing)}`);
  info.annotations.push({ type: 'worker-timing', description: JSON.stringify(timing) });
  fs.mkdirSync(`${process.env.HOME}/kid-games-work/shots/pinyin-lab`, { recursive: true });
  fs.appendFileSync(`${process.env.HOME}/kid-games-work/shots/pinyin-lab/worker-timing.jsonl`, JSON.stringify({ project: info.project.name, browserName, ...timing }) + '\n');
  expect(timing.verdict).toBe('match');
  expect(timing.medianMs).toBeLessThan(400);
});

test('first recordings: the child is still being learned (warming_up) and the profile grows', async ({ page, browserName }) => {
  test.skip(browserName === 'chromium', 'WebKit stub');
  await stubMic(page, 'falling');
  await start(page, true, false);
  await page.getByRole('button', { name: '读给台长听' }).click();
  const card = page.locator('.score-card');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toHaveAttribute('data-verdict', 'unsure');
  await expect(card).toContainText('我在认识你的声音');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pinyin-station:speaker:v1')!).recent.length)).toBe(1);
  expect(await atoms(page)).toEqual([]);
});

test('parent batch review: blind one-at-a-time labelling, separate stats, local ZIP export', async ({ page, browserName }, info) => {
  test.skip(browserName === 'chromium', 'WebKit layout project');
  await instrument(page);
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await page.getByRole('button', { name: '家长', exact: true }).click();
  await parentPin(page);
  await expect(page.getByLabel('保存录音到本机')).toBeChecked();
  // Three recordings as the scoring trial would have stored them (raw IndexedDB: the app opened the database above).
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const wav = (hz: number) => {
          const n = 4800,
            buf = new ArrayBuffer(44 + n * 2),
            v = new DataView(buf);
          [...'RIFF'].forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
          v.setUint32(4, 36 + n * 2, true);
          [...'WAVEfmt '].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
          v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
          [...'data'].forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0)));
          v.setUint32(40, n * 2, true);
          for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((i / 16000) * 2 * Math.PI * hz) * 8000, true);
          return buf;
        };
        const open = indexedDB.open('kg-pinyin-station');
        open.onsuccess = () => {
          const tx = open.result.transaction('recordings', 'readwrite'),
            store = tx.objectStore('recordings');
          [['a', 'ni', 'ni2', 'rising', 'match'], ['b', 'ni', 'ni2', 'falling', 'differs'], ['c', 'ni', 'ni2', 'level', 'unsure']].forEach(([id, wordId, syl, heard, verdict], i) =>
            store.put({ id, at: Date.now() - i * 1000, wordId, skill: 'word:ni:say', session: 1, kind: 'D', audio: wav(300 + i * 50), mime: 'audio/wav', local: { verdict, confidence: 0.95, heard, scorers: ['tone-shape'] }, meta: { v: 1, target: { syllable: syl, initial: 'n', final: 'i', tone: 2 }, device: { ua: 'test', viewport: [1, 1], dpr: 1, standalone: false }, capture: { source: 'worklet', quality: { unreliable: false } } } }),
          );
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.getByRole('button', { name: '快速点评（一条一条听）' }).click();
  const sheet = page.locator('.batch-sheet');
  await expect(sheet.getByText('第 1 / 3 条')).toBeVisible();
  // Blind: neither the AI nor the local verdict is shown while labelling.
  expect(await sheet.innerText()).not.toMatch(/match|differs|rising|falling/);
  const small = await page.evaluate(() => [...document.querySelectorAll('.batch-sheet button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44); }).map((b) => b.textContent));
  expect(small).toEqual([]);
  await page.waitForTimeout(300);
  await shot(page, info.project.name, 'pinyin-batch-review');
  await sheet.getByRole('button', { name: '读对', exact: true }).click();
  await expect(sheet.getByText('第 2 / 3 条')).toBeVisible();
  await sheet.getByRole('button', { name: '读错', exact: true }).click();
  await sheet.getByRole('button', { name: '声调', exact: true }).click();
  await expect(sheet.getByText('第 3 / 3 条')).toBeVisible();
  await sheet.getByRole('button', { name: '拿不准', exact: true }).click();
  await expect(sheet.getByText('这一轮点评了 3 条')).toBeVisible();
  // Separate instruments, separate numbers; local scorer: 1 match on a correct reading, 1 differs on a wrong tone.
  await expect(sheet.getByText('两套数字分开统计')).toBeVisible();
  await expect(sheet.getByText('说“不同”时家长同意 100%')).toBeVisible();
  const rows = await page.evaluate(() => new Promise<any[]>((resolve) => { const o = indexedDB.open('kg-pinyin-station'); o.onsuccess = () => { const g = o.result.transaction('recordings').objectStore('recordings').getAll(); g.onsuccess = () => resolve(g.result.map((r) => ({ id: r.id, parent: r.parent, unsure: r.unsure }))); }; }));
  expect(Object.fromEntries(rows.map((r) => [r.id, r.parent ?? (r.unsure ? 'unsure' : null)]))).toEqual({ a: 'correct', b: 'tone', c: 'unsure' });
  // Export: one local ZIP with manifest.json + wav files.
  const download = page.waitForEvent('download');
  await sheet.getByRole('button', { name: /导出标注集/ }).click();
  const file = await (await download).path();
  const { execFileSync } = await import('node:child_process');
  execFileSync('unzip', ['-tq', file!]);
  const manifest = JSON.parse(execFileSync('unzip', ['-p', file!, 'manifest.json'], { encoding: 'utf8' }));
  expect(manifest.format).toBe('pinyin-station-recordings');
  expect(manifest.rows.map((r: any) => [r.id, r.label, r.parentUnsure, r.syllable, r.tone])).toEqual([['c', null, true, 'ni2', 2], ['b', 'tone', false, 'ni2', 2], ['a', 'correct', false, 'ni2', 2]]);
  expect(manifest.rows[0].local.verdict).toBe('unsure');
  expect(execFileSync('unzip', ['-l', file!], { encoding: 'utf8' })).toMatch(/wav\/a\.wav/);
});
