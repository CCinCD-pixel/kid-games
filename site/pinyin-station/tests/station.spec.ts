import { test, expect, type Page } from '@playwright/test';
import { instrument, watch, shot, probe } from '../../../tests/smoke/helpers';
import { initialSave, schedule } from '../src/domain/learning';
import { parseSyllable } from '../src/domain/pinyin';
import { bank } from '../src/domain/content';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const responses = JSON.parse(fs.readFileSync(new URL('../src/speech/fixtures/real-responses.json', import.meta.url), 'utf8'));

async function open(page: Page) {
  await instrument(page);
  await page.goto('/pinyin-station/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始今天的节目' })).toBeVisible();
}
async function fits(page: Page) {
  const layout = await page.evaluate(() => ({
    bad: [...document.querySelectorAll('#app button:not(:disabled)')]
      .filter((e) => !e.closest('[hidden]') && getComputedStyle(e).display !== 'none')
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (r.width === 0) return false;
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return (
          r.left < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || !hit || !e.contains(hit)
        );
      })
      .map((e) => e.textContent),
  }));
  expect(layout.bad).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('complete a supportive program, including permission-denied follow reading', async ({ page }, info) => {
  const diagnostics = watch(page);
  await open(page);
  await fits(page);
  await shot(page, info.project.name, 'pinyin-home');
  const s = initialSave();
  s.sessions = 1;
  const queue = schedule(s, bank, 'today');
  await page.getByRole('button', { name: '开始今天的节目' }).click();
  for (const q of queue) {
    await expect(page.locator('.practice')).toBeVisible();
    if (q.kind === 'A' || q.kind === 'B') await page.locator(`[data-choice="${q.target}"]`).click();
    else if (q.kind === 'E') {
      const w = bank.words.find((w) => w.id === q.target)!;
      await page.getByRole('button', { name: w.hanzi, exact: true }).click();
    } else if (q.kind === 'F') {
      const w = bank.words.find((w) => w.id === q.target)!;
      for (const id of w.syllables) {
        const syl = parseSyllable(id)!;
        for (let part = 0; part < 3; part++) {
          if (await page.getByRole('button', { name: '接下一条', exact: true }).isVisible()) break;
          const direction = await page.locator('.part-direction').innerText();
          const component = direction.includes('开头')
            ? syl.initial
            : direction.includes('后面')
              ? syl.final
              : String(syl.tone);
          await page.locator(`[data-piece="${component}"]`).click();
          if (!s.settings.scaffold || s.settings.scaffold !== 'full') break;
        }
      }
    } else if (q.kind === 'C') {
      await page.locator('.blend-parts button').last().click();
      await page.getByRole('button', { name: '先接下一条', exact: true }).click();
      continue;
    } else if (q.kind === 'D') {
      await page.getByRole('button', { name: '这次先跟读', exact: true }).click();
      await page.getByRole('button', { name: '我读过啦', exact: true }).click();
      continue;
    } else if (q.kind === 'G') {
      const w = bank.words.find((w) => w.id === q.target)!;
      for (const chunk of w.chunks ?? []) {
        const display = chunk
          .split(' ')
          .map((id) => bank.syllables.find((s) => s.id === id)!.display)
          .join(' ');
        await page.getByRole('button', { name: display, exact: true }).click();
      }
    }
    await fits(page);
    await page.getByRole('button', { name: '接下一条', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: '今天的声音，收到啦' })).toBeVisible();
  await shot(page, info.project.name, 'pinyin-broadcast');
  const p = await probe(page);
  expect(p.contexts).toBeLessThanOrEqual(1);
  expect(p.startsBeforeGesture).toBe(0);
  expect(diagnostics.errors).toEqual([]);
  expect(diagnostics.failed).toEqual([]);
});

test('three attempts lead to demonstration, without trapping the child', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: '开始今天的节目' }).click();
  const s = initialSave();
  s.sessions = 1;
  const q = schedule(s, bank, 'today')[0];
  const wrong = page.locator(`[data-choice]:not([data-choice="${q.target}"])`).first();
  for (let i = 0; i < 3; i++) await wrong.click();
  await expect(page.getByRole('button', { name: '接下一条', exact: true })).toBeVisible();
  await shot(page, info.project.name, 'pinyin-kind-hint');
  expect(await page.locator('.practice').innerText()).not.toMatch(/错误|答错|失败|分数|倒计时/);
});

test('spell on four-line grid, view the album and reject microphone gracefully', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: '图画拼搭', exact: false }).click();
  await expect(page.locator('.kit-subtitle__text')).toContainText('看图');
  expect(
    await page.locator('.kit-subtitle__text').evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThan(80);
  await expect(page.locator('.grid-slot')).not.toHaveCount(0);
  await fits(page);
  await shot(page, info.project.name, 'pinyin-spelling');
  await page.getByRole('button', { name: '收好电台', exact: true }).click();
  await page.getByRole('button', { name: '收好电台', exact: true }).click();
  await page.getByRole('button', { name: '信号卡册', exact: true }).click();
  await fits(page);
  await shot(page, info.project.name, 'pinyin-album');
  await page.getByRole('button', { name: '去当小播音员' }).click();
  await page.getByRole('button', { name: '读给台长听' }).click();
  await expect(page.getByRole('button', { name: '我读过啦' })).toBeVisible({ timeout: 12000 });
  expect(await page.locator('.practice').innerText()).not.toMatch(/失败|错误/);
});

test('parent gate, add a local practice word, and keep trial AI out of mastery', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: '家长', exact: true }).click();
  await page.getByLabel('设置家长 PIN').fill('2468');
  await page.getByRole('button', { name: '进入家长页' }).click();
  await page.getByLabel('设置家长 PIN').fill('2468');
  await page.getByRole('button', { name: '进入家长页' }).click();
  await expect(page.getByRole('heading', { name: '电台值班室' })).toBeVisible();
  await page.getByRole('textbox', { name: '练习词汉字' }).fill('木马');
  await expect(page.getByRole('textbox', { name: '数字声调拼音' })).toHaveValue('mu4 ma3');
  await expect(page.getByRole('combobox', { name: '选择图库' })).toHaveValue('muma');
  await page.getByRole('button', { name: '加入练习', exact: true }).click();
  await expect(page.getByText('已加入待接通信号，图片保存在本机')).toBeVisible();
  const overflow = await page.locator('.parent-scroll').evaluate((el) => ({
    width: el.clientWidth,
    content: el.scrollWidth,
    outside: [...el.querySelectorAll('input,select,button')]
      .filter((control) => {
        const r = control.getBoundingClientRect();
        return r.left < 0 || r.right > innerWidth + 1;
      })
      .map((control) => control.getAttribute('aria-label') ?? control.textContent),
  }));
  expect(overflow.content).toBeLessThanOrEqual(overflow.width + 1);
  expect(overflow.outside).toEqual([]);
  await page.getByRole('heading', { name: '补充练习词', exact: true }).scrollIntoViewIfNeeded();
  await shot(page, info.project.name, 'pinyin-parent-word');
  await page.locator('.parent-scroll').evaluate((el) => (el.scrollTop = 0));
  await shot(page, info.project.name, 'pinyin-parent');
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('kg:v1:pinyin-station') ?? '{}').data,
  );
  expect(saved.customWords).toHaveLength(1);
  expect(saved.settings.ai).toBe(false);
});

// Exercise real resampling/VAD/WAV/IndexedDB code with synthetic, inaudible input.
// This verifies plumbing only; it is deliberately not pronunciation calibration.
test.describe('microphone trial', () => {
  test.use({ serviceWorkers: 'block' });
  test('records locally, displays trial feedback and rebuilds a parent correction', async ({
    page,
  }, info) => {
    await page.addInitScript((fixture) => {
      const state = { stopped: 0, bytes: 0, refs: [] as string[] };
      (window as any).__micTest = state;
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => state.stopped++ }] }) },
        configurable: true,
      });
      AudioContext.prototype.createMediaStreamSource = function () {
        return this.createGain() as any;
      };
      (window as any).AudioWorkletNode = class extends GainNode {
        port: { onmessage: ((event: { data: Float32Array }) => void) | null } = { onmessage: null };
        timer: number;
        constructor(context: AudioContext) {
          super(context);
          let n = 0;
          this.timer = window.setInterval(() => {
            const input = Float32Array.from({ length: Math.round(context.sampleRate / 5) }, (_, i) =>
              n < 5 ? Math.sin(i / 17) * 0.12 : 0,
            );
            n++;
            this.port.onmessage?.({ data: input });
          }, 25);
        }
        disconnect() {
          clearInterval(this.timer);
          super.disconnect();
        }
      };
      (window as any).WebSocket = class {
        onmessage: any;
        onerror: any;
        onclose: any;
        constructor(_url: string) {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ code: 0 }) }), 20);
        }
        send(data: any) {
          if (typeof data !== 'string') {
            state.bytes += data.byteLength;
            return;
          }
          setTimeout(
            () =>
              this.onmessage?.({
                data: JSON.stringify({
                  code: 0,
                  final: 1,
                  result: fixture,
                }),
              }),
            20,
          );
        }
        close() {}
      };
    }, responses.correctBa1Sentence);
    await page.route('**/.netlify/functions/soe-sign', async (route) => {
      const request = route.request();
      expect(request.headers()['x-family-token']).toBe('local-test-token');
      await route.fulfill({ json: { url: 'wss://soe.cloud.tencent.com/soe/api/1?mock=1' } });
    });
    const seed = initialSave();
    seed.settings.ai = true;
    await page.addInitScript((seed) => {
      localStorage.setItem(
        'kg:v1:pinyin-station',
        JSON.stringify({ v: 1, updatedAt: Date.now(), data: seed }),
      );
      sessionStorage.setItem('pinyin-family-token', 'local-test-token');
    }, seed);
    await open(page);
    await page.getByRole('button', { name: '信号卡册', exact: true }).click();
    await page.getByRole('button', { name: '去当小播音员' }).click();
    await page.getByRole('button', { name: '读给台长听' }).click();
    await expect(page.getByRole('button', { name: '听我的声音' })).toBeVisible();
    await expect(page.locator('.lamp.lit')).toHaveCount(3);
    await fits(page);
    await shot(page, info.project.name, 'pinyin-trial-recording');
    expect(await page.evaluate(() => (window as any).__micTest.bytes)).toBeGreaterThan(20000);
    expect(
      await page.evaluate(() =>
        Object.keys(JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data.atoms),
      ),
    ).toEqual([]);
    await page.getByRole('button', { name: '家长', exact: true }).click();
    expect(await page.evaluate(() => (window as any).__micTest.stopped)).toBe(1);
    for (let i = 0; i < 2; i++) {
      await page.getByLabel('设置家长 PIN').fill('2468');
      await page.getByRole('button', { name: '进入家长页' }).click();
    }
    await page.getByRole('combobox', { name: /改判/ }).selectOption('tone');
    await expect(page.getByText('家长已标注', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data.atoms).map(
            (a: any) => a.box,
          ),
        ),
      )
      .toEqual([0]);
    await page.getByRole('combobox', { name: /改判/ }).selectOption('correct');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(JSON.parse(localStorage.getItem('kg:v1:pinyin-station')!).data.atoms).map(
            (a: any) => a.box,
          ),
        ),
      )
      .toEqual([1]);
  });
});

test('cached picture and spelling practice survive a real server outage', async ({ page }) => {
  // WebKit's setOffline can reject navigation before SW dispatch. Stop an actual local
  // HTTP server instead, so the production worker sees a genuine connection failure.
  const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
  const types: Record<string, string> = {
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ttf': 'font/ttf',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const server = http.createServer((req, res) => {
    let file = path.join(dist, new URL(req.url!, 'http://localhost').pathname);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      Connection: 'close',
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await instrument(page);
    await page.goto(`http://localhost:${port}/pinyin-station/?mute`);
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.kit-start')).toHaveCount(0);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const cache = await caches.open('kg-media-v1');
            return (await cache.keys()).filter((r) => r.url.includes('/audio/pinyin-station/')).length;
          }),
        { timeout: 20000 },
      )
      .toBeGreaterThan(180);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await page.reload();
    await page.getByRole('button', { name: '进入电台', exact: true }).click();
    await expect(page.locator('.kit-start')).toHaveCount(0);
    await page.getByRole('button', { name: '图画拼搭', exact: false }).click();
    await expect(page.locator('.grid-slot')).not.toHaveCount(0);
    const hit = await page.evaluate(async () => {
      const m = await fetch('/audio/pinyin-station/audio-manifest.json').then((r) => r.json());
      const r = await fetch(m['py.syl.ba1'].src, { headers: { Range: 'bytes=0-99' } });
      return { status: r.status, length: (await r.arrayBuffer()).byteLength };
    });
    expect(hit).toEqual({ status: 206, length: 100 });
    await page.getByRole('button', { name: '收好电台', exact: true }).click();
    await page.getByRole('button', { name: '收好电台', exact: true }).click();
    await page.getByRole('button', { name: '开始今天的节目' }).click();
    await expect(page.locator('.type-A')).toBeVisible();
  } finally {
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('builds a complete vowel-led custom word without repeating its final', async ({ page }) => {
  const s = initialSave();
  s.settings.lesson = 2;
  s.settings.scaffold = 'full';
  s.customWords = [
    {
      id: 'family-vowel',
      hanzi: '阿姨',
      syllables: ['a1', 'yi2'],
      display: 'ā yí',
      picture: 'custom',
      kind: 'noun',
      lesson: 2,
      source: 'test',
      custom: true,
    },
  ];
  await page.addInitScript(
    (seed) =>
      localStorage.setItem(
        'kg:v1:pinyin-station',
        JSON.stringify({ v: 1, updatedAt: Date.now(), data: seed }),
      ),
    s,
  );
  await open(page);
  await page.getByRole('button', { name: '图画拼搭', exact: false }).click();
  await fits(page);
  for (const piece of ['a', '1', 'y', 'i', '2']) await page.locator(`[data-piece="${piece}"]`).click();
  await expect(page.getByRole('button', { name: '接下一条', exact: true })).toBeVisible();
  await fits(page);
});

test('hidden adult lab still requires the shared parent PIN', async ({ page }) => {
  await instrument(page);
  await page.goto('/pinyin-station/lab/?mute');
  await page.getByRole('button', { name: '进入电台', exact: true }).click();
  await expect(page.locator('.kit-start')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '录一条成人样本' })).toHaveCount(0);
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('设置家长 PIN').fill('2468');
    await page.getByRole('button', { name: '进入家长页' }).click();
  }
  await expect(page.getByRole('button', { name: '录一条成人样本' })).toBeVisible();
});
