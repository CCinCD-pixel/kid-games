// Battle HUD extras (spec §2.5, §3.13, §3.19): the Boss bar (phase dots, durability, 铜犀's cracking bronze plate,
// grey 叮), 驿马 delivering 牒 to the rack (1-6), 鲁班按手 on the lanes before a 大波, the first-appearance name plate,
// and the 附加题 chip's live count. DOM only; reads the kernel state, never writes it.
import type { Enemy, SimState } from '../lane/types';
import { condCount, condProgress, condLost } from '../lane/stars';
import { TPS } from '../lane/rules';
import { laneTop, type Geo } from '../render/board';
import { rigIcon } from '../art/icons';
import type { Atlas } from '../render/atlas';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };

// ───────── Boss bar ─────────
const CRACKS = [
  'M30 4 34 14 29 22', 'M58 30 50 36 52 46 46 54', 'M86 6 80 18 86 26 82 38', 'M112 44 104 34 108 24 100 16', 'M140 8 132 22 138 30 130 44 136 54',
];
export class BossBar {
  readonly el: HTMLElement;
  private dots: HTMLElement[]; private fill: HTMLElement; private hoop: HTMLElement; private plate: HTMLElement; private only: HTMLElement; private cloud: HTMLElement;
  private dings = 0; private crack = -1; private phase = 0;
  constructor(parent: HTMLElement, readonly kind: string, atlas: Atlas, dpr: number) {
    this.el = h('div', 'gf-boss');
    this.el.innerHTML = `<div class="gf-boss__face"></div><div class="gf-boss__dots"><i></i><i></i><i></i></div>
      <div class="gf-boss__bar"><div class="gf-boss__fill"></div><div class="gf-boss__hoop"></div>
      <div class="gf-boss__plate"><svg viewBox="0 0 160 60" preserveAspectRatio="none">${CRACKS.map((d) => `<path d="${d}"/>`).join('')}</svg></div>
      <div class="gf-boss__cloud">高空 ×½</div><b class="gf-boss__won">已破</b></div><div class="gf-boss__only">只有<span data-c="lobber"></span><span data-c="beam"></span></div>`;
    (this.el.querySelector('.gf-boss__face') as HTMLElement).append(rigIcon(atlas, kind, 54, dpr));
    for (const s of this.el.querySelectorAll<HTMLElement>('.gf-boss__only span')) s.append(rigIcon(atlas, s.dataset.c!, 30, dpr));
    this.dots = [...this.el.querySelectorAll<HTMLElement>('.gf-boss__dots i')];
    this.fill = this.el.querySelector('.gf-boss__fill')!; this.hoop = this.el.querySelector('.gf-boss__hoop')!; this.plate = this.el.querySelector('.gf-boss__plate')!;
    this.only = this.el.querySelector('.gf-boss__only')!; this.cloud = this.el.querySelector('.gf-boss__cloud')!;
    parent.appendChild(this.el);
  }
  static boss(S: SimState): Enemy | undefined { return S.enemies.find((e) => !!e.boss && !e.proxy); }
  update(S: SimState): void {
    const e = BossBar.boss(S); const B = e?.boss as (Enemy['boss'] & { phase?: number; crack?: number; state?: string }) | undefined;
    const frac = e ? Math.max(0, e.hp) / Math.max(1, e.max) : S.boss?.done ? 0 : 1;
    this.fill.style.width = `${(frac * 100).toFixed(1)}%`; this.el.classList.toggle('is-wait', !e && !S.boss?.done);
    let ph = 1;
    if (this.kind === 'rhino') {
      ph = B?.phase ?? 1; if (S.boss?.done) ph = 3;
      this.hoop.style.left = e && e.p2At ? `${((e.p2At / e.max) * 100).toFixed(1)}%` : '50%'; this.hoop.style.display = ph === 1 ? '' : 'none';
      const shell = ph === 2; this.plate.classList.toggle('is-on', shell); this.only.classList.toggle('is-on', shell);
      if (shell && e) { const c = Math.min(4, Math.floor(((B?.crack ?? 0) / Math.max(1, e.crackMax ?? 1)) * 5)); if (c !== this.crack) { this.crack = c; this.plate.querySelectorAll('path').forEach((p, i) => p.classList.toggle('on', i < c)); this.plate.classList.remove('is-hit'); void this.plate.offsetWidth; this.plate.classList.add('is-hit'); } }
    } else if (this.kind === 'owl') {
      // done → all three dots, no altitude cloud; waiting (not yet in the sky) → no cloud either (QA r4: the bar used to
      // rewind to phase 1 + '高空 ×½' after the kill)
      const st = e ? B?.state ?? 'high' : ''; ph = S.boss?.done ? 3 : S.dawnAt != null && S.tick >= S.dawnAt ? 3 : e && e.hp * 2 < e.max ? 2 : 1;
      this.cloud.classList.toggle('is-on', !!e && (st === 'high' || st === 'swoopTele')); this.el.classList.toggle('is-down', st === 'down' || st === 'landed');
      this.hoop.style.display = 'none';
    }
    this.el.classList.toggle('is-done', !!S.boss?.done);
    if (ph !== this.phase) { this.phase = ph; this.dots.forEach((d, i) => { d.classList.toggle('is-on', i < ph); d.classList.toggle('is-now', i === ph - 1); }); }
    const dn = e?.dings ?? 0;
    if (dn > this.dings && e) { const d = h('span', 'gf-boss__ding', '叮'); d.style.left = `${20 + Math.random() * 60}%`; this.el.querySelector('.gf-boss__bar')!.appendChild(d); setTimeout(() => d.remove(), 900); }
    this.dings = dn;
  }
}

// ───────── 驿马 (1-6 rack deliveries) ─────────
export const HORSE_SVG = `<svg viewBox="0 0 120 90"><g stroke="#2a1b12" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
  <rect x="14" y="66" width="86" height="9" rx="4" fill="#8a5a2b"/><circle cx="28" cy="78" r="9" fill="#c9a46a"/><circle cx="86" cy="78" r="9" fill="#c9a46a"/>
  <path d="M26 64 30 40h46l6 24z" fill="#c0392b"/><path d="M30 40c-6-2-12-9-12-16l6 2c2 6 6 9 10 10z" fill="#e0b070"/>
  <path d="M76 40c2-10 4-20 12-26l10-4 4 8-6 4c2 6 2 10 0 16z" fill="#e0b070"/><path d="M90 10l6-6 3 9z" fill="#e0b070"/>
  <circle cx="94" cy="17" r="2" fill="#2a1b12"/><path d="M46 40v-8h18v8" fill="#d8b04a"/><path d="M40 52h30" stroke="#f4d58a"/></g></svg>`;
export function horseDelivery(hud: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }, reduced: boolean): void {
  const e = h('div', 'gf-horse', HORSE_SVG); hud.appendChild(e);
  const dur = reduced ? 350 : 750;
  e.animate([{ transform: `translate(${from.x - 50}px, ${from.y - 70}px) scaleX(-1)` }, { transform: `translate(${to.x - 50}px, ${to.y - 70}px) scaleX(-1)`, offset: 0.8 }, { transform: `translate(${to.x - 50}px, ${to.y - 70}px) scaleX(-1)`, opacity: 0 }], { duration: dur, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => e.remove();
  if (!reduced) e.firstElementChild!.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }], { duration: 180, iterations: Math.ceil(dur / 180) });
}

// ───────── 鲁班按手 (warn: 10 s before a 大波 his wooden hands press the lanes) ─────────
const HAND = `<svg viewBox="0 0 100 80"><g stroke="#2a1b12" stroke-width="3" stroke-linejoin="round"><path d="M8 50c0-10 8-16 18-16h6V14c0-5 8-5 8 0v20h4V8c0-5 8-5 8 0v26h4V10c0-5 8-5 8 0v24h4V18c0-5 8-5 8 0v32c0 14-10 24-24 24H32C18 74 8 64 8 50z" fill="#d9a86a"/><path d="M30 60h36M36 40v8M52 36v10M68 38v8" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round" fill="none"/></g></svg>`;
export class WarnHands {
  private els = new Map<number, HTMLElement>();
  constructor(private hud: HTMLElement) {}
  update(S: SimState, geo: Geo): void {
    const want = new Set<number>();
    for (const w of S.L.warn || []) { const t1 = w.t * TPS; if (S.tick >= t1 - 10 * TPS && S.tick < t1) for (const l of w.lanes) want.add(l); }
    for (const [l, e] of this.els) if (!want.has(l)) { e.classList.add('is-off'); setTimeout(() => e.remove(), 400); this.els.delete(l); }
    for (const l of want) if (!this.els.has(l)) {
      const e = h('div', 'gf-warn', `<div class="gf-warn__glow"></div><div class="gf-warn__hand">${HAND}</div>`); this.hud.appendChild(e); this.els.set(l, e);
      Object.assign(e.style, { left: `${geo.x0 + 5 * geo.w}px`, top: `${laneTop(geo, l)}px`, width: `${3 * geo.w}px`, height: `${geo.h}px` });
    }
  }
  clear(): void { for (const e of this.els.values()) e.remove(); this.els.clear(); }
}

// ───────── first appearance: 鲁班's hand + name plate at the spawn edge (1.5 s) ─────────
export function namePlate(hud: HTMLElement, geo: Geo, lane: number, name: string): void {
  const e = h('div', 'gf-plate', `<div class="gf-plate__hand">${HAND}</div><div class="gf-plate__name">${name}</div>`); hud.appendChild(e);
  const w = 168; Object.assign(e.style, { left: `${geo.x0 + 8 * geo.w - w - 6}px`, top: `${Math.max(4, laneTop(geo, lane) - 44)}px`, width: `${w}px` });
  setTimeout(() => { e.classList.add('is-off'); setTimeout(() => e.remove(), 400); }, 1500);
}

// ───────── 附加题 chip ─────────
const S3LABEL: Record<string, string> = { econAt60: '禾田', attackersLost: '咬坏', wallsLost: '木垒坏', unitsLost: '坏了', lostTo: '撞坏', jammed: '卡住', captures: '收走', bestBurn: '烧到', bestSplash: '砸中', strikeMax: '砸中', beltFull: '作废', econLost: '丢粮' };
export interface Star3State { ok: boolean; lost: boolean; text: string }
export function star3State(S: SimState): Star3State {
  const c = S.L.star3 || {}; const parts: string[] = [];
  for (const k of Object.keys(c)) { const cc = condCount(S, k, c[k]); if (cc && S3LABEL[k]) parts.push(`${S3LABEL[k]} ${Math.min(cc.n, 99)}/${cc.of}`); }
  const prog = condProgress(S); const lost = condLost(S);
  const fin = !!S.result || S.tick >= S.endTick;
  // "at least" counts (and 第 60 秒 checks) tick as soon as they are reached; "at most" and 鲁班线 conditions only
  // count as done when the run is over (until then they merely have not been broken)
  const ok = !lost && prog.length > 0 && S.stats.logsUsed <= 1 && prog.every((p) => { const cc = condCount(S, p.key, c[p.key]); return p.ok && (fin || (!!cc && !cc.most)); });
  return { ok, lost, text: parts.join(' · ') };
}
