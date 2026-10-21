/**
 * Shared helpers of the 火星基地 browser matrix (spec §9 V10). Playwright WebKit, one browser at a time.
 * The expected geometry comes from the REAL `computeLayout` (imported, never re-derived); the DOM audit runs inside the page.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, TestInfo } from '@playwright/test';
import { checkLayout, computeLayout, vpOf, type Insets, type LayoutKind } from '../src/app/layout';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../../..');
export const MUTE = path.join(ROOT, 'tools/qa/mute-audio.js');
export const SHOTS = path.join(os.homedir(), 'kid-games-work/shots/rr/mars/e2e');
export const LIT = { state: 'lit', attempts: 1, at: 1 };
/** a save that skips the onboarding, has all probes done and all three badge cards lit (so every node is a plain mission) */
export const PLAY_SAVE = { onboarded: true, session: { index: 3, lastActiveAt: Date.now(), missions: 3 }, cert: { C1: LIT, C2: LIT, C3: LIT }, probes: { vault: { done: true }, factory: { done: true }, balance: { done: true } } };

export const safeOf = (ti: TestInfo): string | undefined => (ti.project.metadata as { safe?: string }).safe;
export function insetsOf(safe: string | undefined): Insets {
  const [t = 0, r = 0, b = 0, l = r] = (safe ?? '0,0,0,0').split(',').map(Number);
  return { t, r, b, l };
}

/** console + page errors collected for one test */
export interface Watch { errors: string[] }

/** init scripts: silence (belt and braces; the kit auto-mutes under WebDriver) + an AudioContext census */
export async function prepare(page: Page, opts: { narration?: boolean } = {}): Promise<Watch> {
  const w: Watch = { errors: [] };
  await page.context().addInitScript({ path: MUTE });
  await page.context().addInitScript(() => {
    const made: unknown[] = []; (window as any).__acs = made;
    for (const k of ['AudioContext', 'webkitAudioContext']) {
      const C = (window as any)[k]; if (!C) continue;
      (window as any)[k] = new Proxy(C, { construct(t, a, nt) { const o = Reflect.construct(t, a, nt); made.push(o); return o; } });
    }
  });
  // 跳过开场和教学 (kit setting): the 90 s onboarding never runs under test; narration optionally off
  const narration = opts.narration !== false;
  await page.context().addInitScript((nar) => { try { localStorage.setItem('kg:settings:v1', JSON.stringify({ skipIntros: true, narration: nar })); } catch { /* blocked */ } }, narration);
  page.on('pageerror', (e) => w.errors.push(`pageerror: ${e.message.slice(0, 160)} | ${(e.stack ?? '').split('\n').slice(0, 3).join(' < ').slice(0, 260)}`));
  page.on('console', (m) => { if (m.type() === 'error') { const l = m.location(); w.errors.push(`console: ${m.text().slice(0, 200)} @${(l.url || '').split('/').pop()}:${l.lineNumber}:${l.columnNumber}`); } });
  return w;
}

/** open the game (with the project's injected insets), pass the start gate, land on the map with a play-ready save */
export async function boot(page: Page, ti: TestInfo, o: { save?: Record<string, unknown>; query?: string; gate?: boolean } = {}): Promise<void> {   // gate:false = stop at the start gate (nothing tapped yet)
  const safe = safeOf(ti);
  await page.goto(`/mars-base/?test=1${safe ? `&safe=${safe}` : ''}${o.query ?? ''}`);
  if (o.gate === false) { await page.waitForSelector('.kit-start__go', { timeout: 8000 }); return; }
  await page.locator('.kit-start__go').click({ timeout: 8000 }).catch(() => undefined);
  await page.waitForSelector('#app[data-ready]', { timeout: 10_000 });
  await page.waitForFunction(() => !!(window as any).__mars, undefined, { timeout: 10_000 });
  await page.evaluate((s) => (window as any).__mars.setSave(s), { ...PLAY_SAVE, ...(o.save ?? {}) });
  await page.waitForSelector('.mb-map', { timeout: 8000 });
}

export const resetSave = (page: Page): Promise<void> => page.evaluate((s) => (window as any).__mars.setSave(s), PLAY_SAVE);

export async function startNode(page: Page, id: string): Promise<void> {
  await page.evaluate((n) => (window as any).__mars.start(n), id);
  await page.waitForSelector('.mb-mission .mb-stage', { timeout: 8000 });
  await page.locator('.xg-skip[data-state="shown"]').first().click({ timeout: 700 }).catch(() => undefined);   // a first-time intro / tutorial (kit 跳过) sits above the screen
  await page.waitForFunction(() => (window as any).__mars.item(), undefined, { timeout: 8000 });
}
export const leaveMission = async (page: Page): Promise<void> => { await page.locator('.mb-map-btn').click({ timeout: 3000 }).catch(() => undefined); await page.waitForSelector('.mb-map', { timeout: 5000 }).catch(() => undefined); };
export const itemKey = (page: Page): Promise<string> => page.evaluate(() => { const i = (window as any).__mars.item(); return i ? `${i.fam}|${i.ask ?? ''}|${i.typed ? 'T' : ''}|${i.mode}` : ''; });

// ------------------------------------------------------------------------------------------------ the DOM audit
export interface AuditExp { reg: Record<string, { x: number; y: number; w: number; h: number }>; usable: { x: number; y: number; w: number; h: number }; kind: string; phone: boolean }
/** Runs INSIDE the page (self-contained). Returns every violation of §2.2 / V10 found on the mission screen. */
export function auditDom(exp: AuditExp): string[] {
  const out: string[] = [];
  const rc = (e: Element) => e.getBoundingClientRect();
  const shown = (e: Element) => { const r = rc(e); const cs = getComputedStyle(e as HTMLElement); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !(e as HTMLElement).hidden; };
  const VW = window.innerWidth, VH = window.innerHeight;
  const MAP: [string, string][] = [['order', '.mb-order'], ['comm', '.mb-comm'], ['stage', '.mb-stage'], ['answer', '.mb-answer'], ['keypad', '.mb-keypad'], ['tools', '.mb-tools'], ['okBtn', '.mb-ok'], ['mapBtn', '.mb-map-btn'], ['hintBtn', '.mb-hint-btn'], ['replayBtn', '.mb-replay-btn'], ['kitBack', '.kit-back']];
  const seen: [string, DOMRect][] = [];
  for (const [name, sel] of MAP) {
    const want = exp.reg[name]; const e = document.querySelector(sel);
    if (!want) continue;
    if (!e || !shown(e)) { if (name !== 'tools') out.push(`${name}: not rendered`); continue; }
    const r = rc(e); seen.push([name, r]);
    const d = (a: number, b: number) => Math.abs(a - b) > 1.01;
    if (d(r.x, want.x) || d(r.y, want.y) || (name !== 'kitBack' && (d(r.width, want.w) || d(r.height, want.h)))) out.push(`${name}: DOM ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)} ≠ layout ${want.x},${want.y} ${want.w}×${want.h}`);
    if (name === 'kitBack' && (r.width < 55 || r.height < 55)) out.push(`kitBack ${Math.round(r.width)}×${Math.round(r.height)} < 56`);
    const u = exp.usable;
    if (r.left < u.x - 1 || r.top < u.y - 1 || r.right > u.x + u.w + 1 || r.bottom > u.y + u.h + 1) out.push(`${name}: outside the usable rect`);
  }
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    const a = seen[i][1], b = seen[j][1];
    if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) out.push(`overlap ${seen[i][0]}×${seen[j][0]}`);
  }
  const stage = document.querySelector('.mb-stage') as HTMLElement | null; const sr = stage ? rc(stage) : null;
  // controls: size, on-screen, inside the stage when they live in it
  const keyMin = exp.phone ? 44 : 72;
  document.querySelectorAll('.mb-mission button, .mb-mission [role="button"], .kit-back').forEach((b) => {
    if (!shown(b) || (b as HTMLButtonElement).closest('[data-dense]')) return;
    const r = rc(b); const cls = (b as HTMLElement).className?.toString?.() ?? ''; const label = `${b.tagName.toLowerCase()}.${cls.split(' ').filter(Boolean)[0] ?? ''}`;
    const isKey = (b as HTMLElement).classList.contains('xg-key');
    const min = isKey ? keyMin : 44;
    const slop = getComputedStyle(b, '::after'); const hw = Math.max(r.width, slop.position === 'absolute' ? parseFloat(slop.width) || 0 : 0), hh = Math.max(r.height, slop.position === 'absolute' ? parseFloat(slop.height) || 0 : 0);   // hit box = element ∪ its ::after hit slop
    if (hw < min - 0.5 || hh < min - 0.5) out.push(`tap ${label} ${Math.round(hw)}×${Math.round(hh)} < ${min}`);
    if (r.left < -1 || r.top < -1 || r.right > VW + 1 || r.bottom > VH + 1) out.push(`off-screen ${label}`);
    if (sr && stage!.contains(b) && (r.left < sr.left - 2 || r.top < sr.top - 2 || r.right > sr.right + 2 || r.bottom > sr.bottom + 2)) out.push(`clipped by the stage ${label}`);
  });
  // HIT AUDIT (QA fix-mars-r2 MAJOR): region sizes / overlaps cannot see that the running-number pill once lay on the crystal cart and on the 拿走 / 切开 tools (SE, 390x664: those items were unfinishable by touch).
  // 1) at the centre of every enabled control the topmost element must be that control (or a part of it / an identical peer: rods side by side have overlapping 44 px hit boxes); 2) the tray readout must not intersect ANY control.
  const peer = (a: Element, t: Element) => { const x = t.closest('button'); return !!x && x !== a && x.className === (a as HTMLElement).className && x.parentElement === a.parentElement; };
  document.querySelectorAll('.mb-mission button, .mb-mission [role="button"], .kit-back').forEach((b) => {
    if (!shown(b) || (b as HTMLButtonElement).disabled || (b as HTMLButtonElement).closest('[data-dense]') || getComputedStyle(b as HTMLElement).pointerEvents === 'none') return;
    const r = rc(b); const x0 = Math.max(0, r.left), x1 = Math.min(VW, r.right), y0 = Math.max(0, r.top), y1 = Math.min(VH, r.bottom); if (x1 - x0 < 2 || y1 - y0 < 2) return;
    const t = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2); if (!t || b === t || b.contains(t) || peer(b, t)) return;
    const name = (e: Element) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className?.toString?.() ?? '').split(' ')[0]}`;
    out.push(`obscured ${name(b)} by ${name(t)} at its centre`);
  });
  const readout = document.querySelector('.tr-read');
  if (readout && shown(readout)) { const rr = rc(readout); document.querySelectorAll('.mb-stage button').forEach((b) => { if (!shown(b)) return; const r = rc(b); if (rr.left < r.right - 0.5 && r.left < rr.right - 0.5 && rr.top < r.bottom - 0.5 && r.top < rr.bottom - 0.5) out.push(`readout covers ${(b as HTMLElement).className.toString().split(' ')[0]}`); }); }
  if (sr) stage!.querySelectorAll('svg').forEach((s) => { if (!shown(s)) return; const r = rc(s); if (r.left < sr.left - 2 || r.top < sr.top - 2 || r.right > sr.right + 2 || r.bottom > sr.bottom + 2) out.push(`svg.${(s as SVGElement).getAttribute('class') ?? ''} sticks out of the stage`); });
  // no scrolling anywhere
  const de = document.documentElement;
  if (de.scrollWidth > VW + 1 || de.scrollHeight > VH + 1) out.push(`page scrolls ${de.scrollWidth}×${de.scrollHeight} > ${VW}×${VH}`);
  document.querySelectorAll('.mb-mission *').forEach((e) => { const cs = getComputedStyle(e as HTMLElement); if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && ((e as HTMLElement).scrollHeight > (e as HTMLElement).clientHeight + 1 || (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1)) out.push(`scrollable .${(e as HTMLElement).className}`); });
  // text not cut
  document.querySelectorAll('.mb-order-big, .mb-order-small, .mb-comm-text').forEach((e) => { const h = e as HTMLElement; if (h.textContent && h.scrollWidth > h.clientWidth + 1) out.push(`text cut .${h.className}: "${h.textContent.slice(0, 18)}"`); });
  if (document.querySelector('.st-fallback')) out.push('fallback stage');
  return out;
}

/** audit the mission screen that is on right now; returns the issues (layout rules from Node + DOM rules from the page) */
export async function auditMission(page: Page, ti: TestInfo): Promise<string[]> {
  const info = await page.evaluate(() => { const m = document.querySelector('.mb-mission') as HTMLElement | null; return m ? { kind: m.dataset.kind ?? 'keypad', warn: !!m.dataset.layoutWarn, w: window.innerWidth, h: window.innerHeight, stageHtml: document.querySelector('.mb-stage')?.innerHTML.length ?? 0 } : null; });
  if (!info) return ['no mission screen'];
  const vp = vpOf(info.w, info.h); const kind = info.kind as LayoutKind; const L = computeLayout(vp, insetsOf(safeOf(ti)), kind);
  const issues = checkLayout(L, vp, kind).map((x) => `layout: ${x}`);
  if (info.warn) issues.push('data-layout-warn set');
  if (info.stageHtml < 40) issues.push(`stage empty (${info.stageHtml})`);
  const reg: AuditExp['reg'] = {}; for (const [k, r] of Object.entries(L.reg)) reg[k] = r as AuditExp['reg'][string];
  issues.push(...(await page.evaluate(auditDom, { reg, usable: L.usable, kind, phone: vp.cls.startsWith('phone') })));
  return issues;
}

export const shotPath = (ti: TestInfo, name: string): string => { const d = path.join(SHOTS, ti.project.name); fs.mkdirSync(d, { recursive: true }); return path.join(d, `${name.replace(/[^\w.-]+/g, '_')}.png`); };

/** answers the families the hook cannot judge with `correct()` (open orders, the zoom stage) — same shapes as tools/mars-base/stages.mjs */
export function openAnswerOf(it: { fam: string; params: any }): unknown {
  const p = it.params;
  if (it.fam === 'open.pv3') { const n = ({ any: 357, zeroInside: 306, over500: 724, under300: 248 } as Record<string, number>)[p.rule] ?? 357; return { built: n, said: n }; }
  if (it.fam === 'open.pv3cmp') return p.rel === '>' ? { a: 652, b: 341 } : { a: 341, b: 652 };
  if (it.fam === 'open.groups') { for (let n = 2; n <= 10; n++) if (p.total % n === 0 && p.total / n >= 2) return { n, k: p.total / n }; }
  if (it.fam === 'open.arrays') return { pairs: [[3, 8], [4, 6]] };
  if (it.fam === 'nl.zoom') return { hundred: Math.floor(p.target / 100), ten: Math.floor(p.target / 10) };
  return null;
}
