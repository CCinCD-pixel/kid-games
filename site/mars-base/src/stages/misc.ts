/** Small self-collecting stages: number cards (×), hop track (skip counting), order belt, zoom (O2.5). Spec §3.8.3, §4.2. */
import { ghostTap } from '@kit/ui';
import { HOP_MAX, beltFull, beltLift, beltNew, beltOrder, beltPlace, hopBack, hopForward, hopLanding, type BeltState, type HopState } from '@engines/manip/models';
import type { Answer } from '../app/types';
import { btn, el, playPlan, type StageCtx, type StageHandle } from './common';

/** ---- number cards: `slots` boxes joined by `signs`; tap a card → first empty slot, tap a filled slot → empty it ---- */
export interface CardRow { root: HTMLElement; values(): (number | null)[]; full(): boolean; set(i: number, v: number | null): void; lock(on: boolean): void; glow(on: boolean): void }
export function cardRow(signs: string[], max: number, onChange: () => void, labels: string[] = []): CardRow {
  const vals: (number | null)[] = signs.length ? [null, null] : [null]; let locked = false;
  const root = el('div', 'cd'); const slots = el('div', 'cd-slots'); const pool = el('div', 'cd-pool');
  const render = () => {
    slots.innerHTML = vals.map((v, i) => `${i ? `<b class="cd-sign">${signs[i - 1]}</b>` : ''}<button type="button" class="cd-slot${v === null ? '' : ' is-filled'}" data-i="${i}" aria-label="${labels[i] ?? '格子'}">${v ?? ''}</button>`).join('');
  };
  pool.innerHTML = Array.from({ length: max }, (_, i) => `<button type="button" class="cd-card" data-v="${i + 1}">${i + 1}</button>`).join('');
  root.append(slots, pool); render();
  root.addEventListener('click', (e) => {
    if (locked) return; const t = (e.target as HTMLElement).closest('button') as HTMLElement | null; if (!t) return;
    if (t.classList.contains('cd-card')) { const i = vals.findIndex((v) => v === null); if (i >= 0) { vals[i] = Number(t.dataset.v); render(); onChange(); } }
    else if (t.classList.contains('cd-slot')) { vals[Number(t.dataset.i)] = null; render(); onChange(); }
  });
  return { root, values: () => vals.slice(), full: () => vals.every((v) => v !== null), set(i, v) { vals[i] = v; render(); onChange(); }, lock(on) { locked = on; root.classList.toggle('is-locked', on); }, glow(on) { root.classList.toggle('is-glow', on); } };
}

/** ---- hop track (mul.skip / pv3.skip): tap 跳 once per jump; the landing number appears at every stop ---- */
export function hopStage(c: StageCtx): StageHandle {
  const p = c.params; const mul = c.fam.id === 'mul.skip'; const start = mul ? 0 : p.start; const step = mul ? p.n : p.step; const k: number = p.k;
  let s: HopState = { start, step, hops: 0 }; let locked = false; let alive = true;
  const stops = Math.min(HOP_MAX, Math.max(8, k + 3));
  const root = el('div', 'hp'); const svgBox = el('div', 'hp-track'); const bar = el('div', 'hp-bar');
  const go = btn('xg-btn xg-btn--primary hp-go', '跳一下', '跳一下'); const back = btn('xg-btn xg-btn--secondary hp-back', '退一跳', '退一跳');
  bar.append(back, go); root.append(svgBox, bar);
  const draw = () => {
    const W = Math.max(200, c.w - 12), H = Math.max(120, c.h - 84); const gap = (W - 40) / stops; const y = H * 0.7;
    let g = `<path d="M20 ${y} H${W - 20}" stroke="var(--xg-paper-400)" stroke-width="4" stroke-linecap="round"/>`;
    for (let i = 0; i <= stops; i++) {
      const x = 20 + i * gap; const reached = i <= s.hops;
      g += `<circle cx="${x}" cy="${y}" r="${reached ? 9 : 5}" fill="${reached ? 'var(--xg-mars)' : 'var(--xg-paper-300)'}" stroke="var(--xg-ink-800)" stroke-width="2"/>`;
      if (reached) g += `<text x="${x}" y="${y + 30}" text-anchor="middle" class="hp-num">${start + i * step}</text>`;
      if (i > 0 && i <= s.hops) { const x0 = 20 + (i - 1) * gap; g += `<path class="hp-arc${i === s.hops ? ' is-new' : ''}" d="M${x0} ${y - 8} Q${(x0 + x) / 2} ${y - H * 0.42} ${x} ${y - 8}" fill="none" stroke="var(--xg-jade-600)" stroke-width="4" stroke-linecap="round"/>`; }
    }
    const rx = 20 + s.hops * gap;
    g += `<g class="hp-rover" style="transform:translate(${rx}px,${y - 30}px)"><path d="M-12 8 L-12 -4 Q0 -22 12 -4 L12 8Z" fill="var(--xg-paper-100)" stroke="var(--xg-ink-800)" stroke-width="2.4" stroke-linejoin="round"/><circle cx="0" cy="-5" r="4.2" fill="var(--xg-gold-500)" stroke="var(--xg-ink-800)" stroke-width="1.6"/><path d="M-12 8 l-6 8 7-3z M12 8 l6 8-7-3z" fill="var(--xg-mars)" stroke="var(--xg-ink-800)" stroke-width="1.6"/></g>`;
    svgBox.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="跳跳轨">${g}</svg>`;
    go.disabled = locked || s.hops >= stops; back.disabled = locked || s.hops <= 0;
  };
  const doHop = (d: 1 | -1) => { if (locked) return; const n = d > 0 ? hopForward(s) : hopBack(s); if (!n || n.hops > stops) return; s = n; c.onOp(); c.sfx?.('ui-pop'); draw(); };
  go.onclick = () => doHop(1); back.onclick = () => doHop(-1); draw(); c.host.replaceChildren(root);
  return {
    input: 'self', layout: 'folded', collect: () => hopLanding(s), hasAnswer: () => s.hops > 0, lock: (on) => { locked = on; draw(); },
    hint(level, _a: Answer) {
      root.classList.toggle('is-hinted', level >= 1); go.classList.toggle('is-glow', level === 1);
      if (level === 2 && s.hops < 1) doHop(1);
      if (level >= 3) void (async () => { while (s.hops > 0) { s = hopBack(s)!; } draw(); await playPlan(Array.from({ length: k }), async (_x, i) => { if (i === 0) await ghostTap(go).catch(() => {}); doHop(1); }, 420, () => alive); })();
    },
    resize(w, h) { c.w = w; c.h = h; draw(); }, destroy() { alive = false; c.host.replaceChildren(); },
  };
}

/** ---- belt (pv3.order): three number cards go onto the belt, smallest on the left ---- */
export function beltStage(c: StageCtx): StageHandle {
  const xs: number[] = c.params.xs; let s: BeltState = beltNew(xs); let locked = false;
  const root = el('div', 'bl'); const belt = el('div', 'bl-belt'); const pool = el('div', 'bl-pool');
  root.append(el('div', 'bl-cap', '<span>小</span><i></i><span>大</span>'), belt, pool);
  const render = () => {
    belt.innerHTML = s.slots.map((v, i) => `<button type="button" class="bl-slot${v === null ? '' : ' is-filled'}" data-slot="${i}" aria-label="第${i + 1}格">${v ?? ''}</button>`).join('');
    pool.innerHTML = s.pool.map((v) => `<button type="button" class="bl-card" data-v="${v}">${v}</button>`).join('');
  };
  root.addEventListener('click', (e) => {
    if (locked) return; const t = (e.target as HTMLElement).closest('button') as HTMLElement | null; if (!t) return;
    if (t.classList.contains('bl-card')) { const free = s.slots.findIndex((x) => x === null); const n = free >= 0 ? beltPlace(s, Number(t.dataset.v), free) : null; if (n) { s = n; c.onOp(); c.sfx?.('ui-pop'); render(); } }
    else if (t.classList.contains('bl-slot')) { const n = beltLift(s, Number(t.dataset.slot)); if (n) { s = n; c.onOp(); render(); } }
  });
  // drag a card onto the slot you choose (the dashed slots invite it); a plain tap still fills the first free slot. A drag never also clicks.
  let drag: { card: HTMLElement; v: number; x0: number; y0: number; ghost: HTMLElement | null; id: number } | null = null; let swallow = false;
  root.addEventListener('pointerdown', (e) => {
    if (locked || drag) return; const card = (e.target as HTMLElement).closest('.bl-card') as HTMLElement | null; if (!card) return;
    drag = { card, v: Number(card.dataset.v), x0: e.clientX, y0: e.clientY, ghost: null, id: e.pointerId }; try { card.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) { const g = drag.card.cloneNode(true) as HTMLElement; g.classList.add('bl-ghost'); g.style.cssText = `position:fixed;left:0;top:0;width:${drag.card.offsetWidth}px;height:${drag.card.offsetHeight}px;pointer-events:none;z-index:50`; document.body.append(g); drag.ghost = g; drag.card.classList.add('is-lifted'); }
    if (drag.ghost) { drag.ghost.style.transform = `translate(${e.clientX - drag.card.offsetWidth / 2}px, ${e.clientY - drag.card.offsetHeight / 2}px)`; belt.querySelectorAll('.bl-slot').forEach((sl) => { const r = sl.getBoundingClientRect(); sl.classList.toggle('is-over', e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12); }); }
  });
  const endDrag = (e: PointerEvent, drop: boolean) => {
    if (!drag || e.pointerId !== drag.id) return; const d = drag; drag = null; d.ghost?.remove(); d.card.classList.remove('is-lifted'); belt.querySelectorAll('.bl-slot.is-over').forEach((sl) => sl.classList.remove('is-over'));
    if (!d.ghost) return;   // no movement: it was a tap, the click handler does the work
    swallow = true; setTimeout(() => { swallow = false; }, 60);
    if (!drop || locked) return;
    const slot = Array.from(belt.querySelectorAll<HTMLElement>('.bl-slot')).findIndex((sl) => { const r = sl.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12; });
    if (slot < 0) return; const n = beltPlace(s, d.v, slot); if (n) { s = n; c.onOp(); c.sfx?.('ui-pop'); render(); }
  };
  root.addEventListener('pointerup', (e) => endDrag(e, true)); root.addEventListener('pointercancel', (e) => endDrag(e, false));
  root.addEventListener('click', (e) => { if (swallow) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  render(); c.host.replaceChildren(root);
  const sorted = (c.params.xs as number[]).slice().sort((a, b) => a - b);
  return {
    input: 'self', layout: 'folded', collect: () => beltOrder(s), hasAnswer: () => beltFull(s), lock: (on) => { locked = on; root.classList.toggle('is-locked', on); },
    hint(level, _a: Answer) {
      root.classList.toggle('is-hinted', level >= 1);
      if (level === 2 || level >= 3) {   // H2: the smallest is placed; H3: all of them
        const want = level === 2 ? 1 : 3; s = beltNew(xs); for (let i = 0; i < want; i++) { const n = beltPlace(s, sorted[i], i); if (n) s = n; } render();
      }
    },
    resize() {}, destroy() { c.host.replaceChildren(); },
  };
}

/** ---- zoom (nl.zoom, O2.5): pick the hundred-segment, then the ten-segment inside it ---- */
export function zoomStage(c: StageCtx): StageHandle {
  const target: number = c.params.target; let hundred: number | null = null; let ten: number | null = null; let locked = false;
  const root = el('div', 'zm'); const cap = el('div', 'zm-cap'); const grid = el('div', 'zm-grid'); const back = btn('xg-btn xg-btn--secondary zm-back', '回上一层', '回上一层'); root.append(cap, grid, back);
  const render = () => {
    root.dataset.level = hundred === null ? 'hundred' : 'ten'; back.hidden = hundred === null;
    if (hundred === null) { cap.textContent = '先找百'; grid.innerHTML = Array.from({ length: 10 }, (_, i) => `<button type="button" class="zm-seg" data-h="${i}"><b>${i * 100}</b><i>–</i><b>${(i + 1) * 100}</b></button>`).join(''); }
    else { cap.textContent = '再找十'; grid.innerHTML = Array.from({ length: 10 }, (_, i) => { const a = hundred! * 100 + i * 10; return `<button type="button" class="zm-seg${ten === hundred! * 10 + i ? ' is-on' : ''}" data-t="${hundred! * 10 + i}"><b>${a}</b><i>–</i><b>${a + 10}</b></button>`; }).join(''); }
  };
  root.addEventListener('click', (e) => {
    if (locked) return; const t = (e.target as HTMLElement).closest('button') as HTMLElement | null; if (!t) return; c.onOp(); c.sfx?.('ui-select');
    if (t === back) { hundred = null; ten = null; render(); } else if (t.dataset.h !== undefined) { hundred = Number(t.dataset.h); ten = null; root.classList.add('is-zoom'); setTimeout(() => root.classList.remove('is-zoom'), 400); render(); } else if (t.dataset.t !== undefined) { ten = Number(t.dataset.t); render(); }
  });
  render(); c.host.replaceChildren(root);
  return {
    input: 'self', layout: 'folded', collect: () => (hundred !== null && ten !== null ? { hundred, ten } : hundred !== null ? { hundred, ten: -1 } : null), hasAnswer: () => ten !== null, lock: (on) => { locked = on; root.classList.toggle('is-locked', on); },
    hint(level, _a: Answer) {
      root.classList.toggle('is-hinted', level >= 1);
      if (level >= 2) { hundred = Math.floor(target / 100); if (level >= 3) ten = Math.floor(target / 10); render(); }
    },
    feedback() {}, resize() {}, destroy() { c.host.replaceChildren(); },
  };
}
