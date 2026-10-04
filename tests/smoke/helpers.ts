/**
 * Shared Playwright helpers for smoke tests and game e2e tests (site/<id>/tests/*.spec.ts):
 *
 *   import { instrument, watch, probe, shot } from '../../../tests/smoke/helpers';
 *   await instrument(page);                 // before goto: counts AudioContexts / early audio
 *   const { errors, failed } = watch(page); // console errors, page errors, failed requests
 *   await shot(page, test.info().project.name, 'sokoban-level-1');
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { SHOTS_DIR } from './playwright.config';

export { SHOTS_DIR };

/** Count AudioContexts and audio starts before the first touch (installed before any page script). */
export async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const probe = { contexts: 0, gesture: false, startsBeforeGesture: 0 };
    (w as Record<string, unknown>).__kgProbe = probe;
    for (const type of ['pointerdown', 'touchstart', 'mousedown', 'keydown']) {
      window.addEventListener(type, () => (probe.gesture = true), { capture: true });
    }
    for (const key of ['AudioContext', 'webkitAudioContext'] as const) {
      const Orig = w[key];
      if (typeof Orig !== 'function') continue;
      w[key] = new Proxy(Orig, {
        construct(target, args, newTarget) {
          probe.contexts += 1;
          return Reflect.construct(target, args, newTarget);
        },
      });
    }
    const wrapStart = (proto: { start?: (...a: unknown[]) => unknown } | undefined) => {
      if (!proto?.start) return;
      const orig = proto.start;
      proto.start = function (this: unknown, ...a: unknown[]) {
        if (!probe.gesture) probe.startsBeforeGesture += 1;
        return orig.apply(this, a);
      };
    };
    wrapStart(window.AudioScheduledSourceNode?.prototype as never);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!probe.gesture) probe.startsBeforeGesture += 1;
      return play.call(this);
    };
  });
}

export function watch(page: Page) {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`));
  page.on('response', (r) => {
    // the kit demo manifest deliberately lists one missing clip (fallback-voice test)
    if (r.status() >= 400 && !r.url().includes('dev.missing')) failed.push(`${r.status()} ${r.url()}`);
  });
  return { errors, failed };
}

export const probe = (page: Page) => page.evaluate(() => (window as unknown as { __kgProbe: { contexts: number; startsBeforeGesture: number } }).__kgProbe);

export async function shot(page: Page, project: string, name: string, dir = path.join(SHOTS_DIR, project)) {
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}
