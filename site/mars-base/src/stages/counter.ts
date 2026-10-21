/**
 * Counter (拨计数器): three rods of ≤9 beads + the 仓灯 that lights at 1000 (it is NOT a digit rod: 3006 cannot be written).
 * Used by pv3.counter (set a number), pv3.dictation (set the number you hear), pv3.step (apply ±1/10/100 with the carry), open.pv3cmp (two counters).
 */
import { ghostTap } from '@kit/ui';
import { counterBump, counterFrom, counterSet, counterValue, type CounterPlace, type CounterState } from '@engines/manip/models';
import type { Answer } from '../app/types';
import { zhNumber } from '../voice/lines';
import { btn, el, playPlan, type StageCtx, type StageHandle } from './common';

export interface CounterView { root: HTMLElement; value(): number; set(n: number): void; lock(on: boolean): void; resize(h: number): void; glow(sel: string, on: boolean): void; onChange: (() => void) | null; bump(place: CounterPlace, d: 1 | -1): boolean }
export function counterView(startValue: number, hStage: number, withLamp = true, cap = 34): CounterView {
  let s: CounterState = counterFrom(startValue); let locked = false; let beadH = 22;
  const root = el('div', 'ct'); const view: CounterView = { root, value: () => counterValue(s), set(n) { s = counterFrom(n); render(); }, lock(on) { locked = on; root.classList.toggle('is-locked', on); }, resize(h) { fit(h); render(); }, glow(sel, on) { root.querySelectorAll(sel).forEach((e) => e.classList.toggle('is-glow', on)); }, onChange: null, bump };
  const fit = (h: number) => { beadH = Math.max(7, Math.min(cap, Math.floor((h - 190) / 9) - 2)); root.style.setProperty('--bead', `${beadH}px`); };
  const NAMES: Record<CounterPlace, string> = { h: '百', t: '十', o: '个' };
  function render(carry: CounterPlace[] = []): void {
    const rod = (pl: CounterPlace) => {
      const d = s[pl];
      return `<div class="ct-rod${carry.includes(pl) ? ' is-carry' : ''}" data-place="${pl}"><button type="button" class="ct-arrow" data-up="${pl}" aria-label="${NAMES[pl]}位加一" ${locked || counterBump(s, pl, 1) === null ? 'disabled' : ''}>▲</button>`
        + `<div class="ct-beads" data-beads="${pl}">${Array.from({ length: 9 }, (_, i) => `<i class="ct-bead${9 - i <= d ? ' is-on' : ''}"></i>`).join('')}</div>`
        + `<button type="button" class="ct-arrow" data-down="${pl}" aria-label="${NAMES[pl]}位减一" ${locked || counterBump(s, pl, -1) === null ? 'disabled' : ''}>▼</button><b class="ct-digit">${s.lamp ? 0 : d}<small class="ct-name">${NAMES[pl]}</small></b></div>`;
    };
    root.innerHTML = `${withLamp ? `<div class="ct-lamp${s.lamp ? ' is-lit' : ''}" aria-label="仓灯"><svg viewBox="0 0 40 56" width="40" height="56" aria-hidden="true"><path d="M20 4 a14 14 0 0 1 9 25 v8 h-18 v-8 a14 14 0 0 1 9-25z" fill="${s.lamp ? 'var(--xg-gold-500)' : 'var(--xg-paper-300)'}" stroke="var(--xg-ink-800)" stroke-width="2.4"/><rect x="11" y="40" width="18" height="8" rx="3" fill="var(--xg-ink-700)"/></svg><span class="ct-name">仓灯</span></div>` : ''}${rod('h')}${rod('t')}${rod('o')}`;
  }
  function bump(place: CounterPlace, d: 1 | -1): boolean {
    if (locked) return false; const before = s; const n = counterBump(s, place, d); if (!n) return false; s = n;
    const changed = (['h', 't', 'o'] as CounterPlace[]).filter((k) => before[k] !== s[k] && k !== place); render(changed); view.onChange?.(); return true;
  }
  root.addEventListener('click', (e) => {
    if (locked) return; const t = e.target as HTMLElement; const b = t.closest('button') as HTMLButtonElement | null;
    if (b?.dataset.up) { bump(b.dataset.up as CounterPlace, 1); return; } if (b?.dataset.down) { bump(b.dataset.down as CounterPlace, -1); return; }
    const beads = t.closest('.ct-beads') as HTMLElement | null;
    if (beads) {   // tap a bead: the rod shows that many (tap the top bead again to take one off)
      const pl = beads.dataset.beads as CounterPlace; const r = beads.getBoundingClientRect(); const idxFromBottom = Math.min(9, Math.max(1, Math.ceil((r.bottom - (e as MouseEvent).clientY) / (r.height / 9))));
      const nd = s[pl] === idxFromBottom ? idxFromBottom - 1 : idxFromBottom; const n = counterSet(s, pl, nd); if (n) { s = n; render(); view.onChange?.(); }
    }
  });
  fit(hStage); render(); return view;
}

type Kind = 'set' | 'dictation' | 'step';
export function counterStage(c: StageCtx, kind: Kind): StageHandle {
  const p = c.params; const root = el('div', `ct-wrap ct-wrap--${kind}`); let alive = true;
  const startV = kind === 'step' ? p.a : 0;
  const view = counterView(startV, kind === 'dictation' ? c.h - 72 : c.h);
  const head = el('div', 'ct-head');
  let sayBtn: HTMLButtonElement | null = null;
  if (kind === 'dictation') { sayBtn = btn('xg-btn xg-btn--accent ct-say', '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M5 12h6l8-6v20l-8-6H5z" fill="currentColor"/><path d="M23 11q4 5 0 10M26 7q7 9 0 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>', '再听一遍'); head.append(sayBtn, el('div', 'ct-read', zhNumber(p.n))); sayBtn.onclick = () => c.say?.(zhNumber(p.n)); }
  else if (kind === 'step') head.append(el('div', 'ct-note', ''));
  root.append(head, view.root); c.host.replaceChildren(root); view.onChange = () => { c.onOp(); c.sfx?.('ui-pop'); };
  if (kind === 'dictation') setTimeout(() => alive && c.say?.(zhNumber(p.n)), 500);
  const stepPlace: CounterPlace = kind === 'step' ? (p.b >= 100 ? 'h' : p.b >= 10 ? 't' : 'o') : 'o';
  const stepDir: 1 | -1 = kind === 'step' && p.op === '-' ? -1 : 1;
  const target = kind === 'set' ? p.n : null;
  return {
    input: 'self', layout: 'folded', collect: () => view.value(), hasAnswer: () => kind !== 'step' || view.value() !== p.a, lock: (on) => view.lock(on),
    hint(level, ans: Answer) {
      root.classList.toggle('is-hinted', level >= 1);
      if (level === 1) { if (kind === 'step') view.glow(`.ct-rod[data-place="${stepPlace}"] .ct-arrow`, true); else view.glow('.ct-rod', true); }
      else if (level === 2) { if (kind === 'step') { view.bump(stepPlace, stepDir); } else { const n = Number(ans); view.set(Math.floor(n / 100) * 100); } }
      else if (level >= 3) void (async () => {
        const n = Number(ans);
        if (kind === 'step') { view.set(p.a); const arrow = view.root.querySelector(`.ct-rod[data-place="${stepPlace}"] [data-${stepDir > 0 ? 'up' : 'down'}]`); if (arrow) await ghostTap(arrow).catch(() => {}); view.bump(stepPlace, stepDir); return; }
        view.set(0); const digs: [CounterPlace, number][] = [['h', Math.floor(n / 100) % 10], ['t', Math.floor(n / 10) % 10], ['o', n % 10]];
        await playPlan(digs, async ([pl, d]) => { const beads = view.root.querySelector(`.ct-beads[data-beads="${pl}"]`); if (beads) { /* set directly (the ghost hand would need geometry) */ for (let i = 0; i < d && alive; i++) view.bump(pl, 1); } }, 400, () => alive);
      })();
    },
    feedback() {}, resize(w, h) { c.w = w; c.h = h; view.resize(kind === 'dictation' ? h - 72 : h); }, destroy() { alive = false; c.host.replaceChildren(); },
    ...(target === null ? {} : {}),
  };
}

/** pv3.dictation typed mode: speaker + the reading as text (never the digits), keypad below. */
export function dictationTypedStage(c: StageCtx): StageHandle {
  const n: number = c.params.n; const root = el('div', 'dc'); let alive = true;
  const sayBtn = btn('xg-btn xg-btn--accent dc-say', '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M5 12h6l8-6v20l-8-6H5z" fill="currentColor"/><path d="M23 11q4 5 0 10M26 7q7 9 0 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg><b>听</b>', '再听一遍'); sayBtn.onclick = () => c.say?.(zhNumber(n));
  root.append(sayBtn, el('div', 'dc-read', zhNumber(n))); c.host.replaceChildren(root); setTimeout(() => alive && c.say?.(zhNumber(n)), 500);
  return { input: 'keypad', layout: 'keypad', collect: () => null, hasAnswer: () => true, lock() {}, hint(level) { root.classList.toggle('is-hinted', level >= 1); sayBtn.classList.toggle('is-glow', level === 1); if (level >= 2) c.say?.(zhNumber(n)); }, resize() {}, destroy() { alive = false; c.host.replaceChildren(); } };
}
