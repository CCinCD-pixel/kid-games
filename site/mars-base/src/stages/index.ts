/**
 * Stage registry (spec §8.1/§8.2): one operating surface per answer style. A stage never judges — it only collects a response and can
 * show a hint patch / the answer. First build: number line (place / read / calibration), picture + keypad (int families),
 * compare, choose, build mat (interim steppers; the full tray machine follows with the vault round), fallback.
 */
import { mountNumberLine, type NumberLineControl } from '@engines/manip/numberline';
import type { Answer, FamilyDef } from '../app/types';
import { anchorLabels } from '../families/nl';
import { bugAnswer } from '../diag/bugs';
import { gemOnly, numberParts, partsPair, partsSvg } from '../art/crystals';
import { zhNumber } from '../voice/lines';
import { KEYPAD_CELLS } from '../app/cellInput';
import { counterView } from './counter';
import { counterStage, dictationTypedStage } from './counter';
import { arrayPicture, arrayStage } from './array';
import { beltStage, hopStage, zoomStage } from './misc';
import { podsPicture, podsStage } from './pods';
import { trayConfig, trayStage } from './tray';
import { el, type StageCtx, type StageHandle } from './common';
export type { StageCtx, StageHandle } from './common';

/** ---- number line ---- */
function numberLineStage(c: StageCtx): StageHandle {
  const p = c.params; const kind = c.fam.id === 'nl.calib' ? 'calib' : c.fam.id === 'nl.read' ? 'read' : 'place';
  const labels = kind === 'calib' ? [0, p.L] : anchorLabels(p.L, p.anchors);
  const ctl: NumberLineControl = mountNumberLine(c.host, { L: p.L, kind, labels, fixed: kind === 'read' ? p.target : undefined, width: c.w, height: c.h, onOp: c.onOp, onPlace: () => c.onOp() });
  return {
    input: kind === 'read' ? 'keypad' : 'self', layout: kind === 'read' ? 'keypad' : 'folded',
    collect: () => (kind === 'read' ? null : ctl.value()), hasAnswer: () => kind === 'read' || ctl.value() !== null, lock: (on) => ctl.lock(on),
    hint(level, answer) { if (level === 1) ctl.showH1(true); else if (level === 2) ctl.showAnchors([p.L / 4, p.L / 2, (3 * p.L) / 4]); else if (kind !== 'read') ctl.setFlag(answer as number); },
    feedback(r, correct) { const v = typeof r === 'number' ? r : Number(r); if (kind === 'place' && Number.isFinite(v)) ctl.showFeedback({ target: correct as number, d: Math.abs(v - (correct as number)), lo: (correct as number) - p.tol, hi: (correct as number) + p.tol }); },
    resize: (w, h) => ctl.resize(w, h), destroy: () => ctl.destroy(),
  };
}

/** ---- picture + keypad (int families) ---- */
function pictureFor(f: FamilyDef, p: any, w: number, h: number): string {
  const pic = (parts: Parameters<typeof partsSvg>[0]) => partsSvg(parts, w, Math.max(80, h - 90));
  switch (f.id) {
    case 'pv2.read': return pic({ rods: p.t, crystals: p.o });
    case 'pv3.read': return pic({ boxes: p.h, rods: p.t, crystals: p.o });
    case 'pv2.split': return pic(numberParts(p.n));
    case 'mul.groups': case 'mul.write': return podsPicture(p.n, p.k, w, Math.max(80, h - 90));
    case 'mul.skip': return gemOnly(Math.min(30, p.n * p.k), w, Math.max(80, h - 90));
    case 'mul.array': return arrayPicture(p.rows, p.cols, w, Math.max(80, h - 90));
    case 'mul.missingFactor': return arrayPicture(p.n, 1, w, Math.max(80, h - 90));
    case 'mul.split': return arrayPicture(p.n, p.m, w, Math.max(80, h - 90), { cut: p.k });
    case 'pv2.step': return pic(numberParts(p.from ?? 0));
    case 'pv3.step': case 'pv3.round': return pic(numberParts(p.a ?? p.n ?? 0));   // the number as 箱 / 棒 / 颗: no answer in it (the step / the rounding is the question)
    case 'pv3.addHund': { const half = Math.floor(w / 2) - 24; const [pa, pb] = partsPair(numberParts(p.a), numberParts(p.b), half, Math.max(80, h - 40)); return `<div class="st-two">${pa}<b class="st-sign">${p.op === '+' ? '+' : '−'}</b>${pb}</div>`; }
    case 'rel.compare': {   // the two quantities as bundles side by side; the unknown one is left out (the question)
      const half = Math.floor(w / 2) - 24; const one = (n: number) => partsSvg(numberParts(n), half, Math.max(80, h - 40));
      if (p.form === 'diff') { const [pb, ps] = partsPair(numberParts(p.big), numberParts(p.small), half, Math.max(80, h - 40)); return `<div class="st-two">${pb}<b class="st-sign">?</b>${ps}</div>`; }
      return `<div class="st-two">${one(p.form === 'findBig' ? p.small : p.big)}</div>`;
    }
    case 'col.add': case 'col.sub': return columnPicture(p.a, p.b, f.id === 'col.add' ? '+' : '−', w, Math.max(120, h - 20));
    case 'add.tens': case 'add.carry1': case 'add.2d2d': case 'add.compensate': case 'sub.tens': case 'sub.borrow1': case 'sub.thinkAdd': case 'sub.2d2d': case 'sub.compensate': {
      const half = Math.floor(w / 2) - 24; const sign = f.id.startsWith('add') ? '+' : '−';
      const [pa, pb] = partsPair(numberParts(p.a), numberParts(p.b), half, Math.max(80, h - 40));
      return `<div class="st-two">${pa}<b class="st-sign">${sign}</b>${pb}</div>`;
    }
    default: return '';
  }
}
/** 竖式: the two numbers aligned by place, the answer row empty (tens left, ones right). */
function columnPicture(a: number, b: number, sign: string, w: number, h: number): string {
  const cell = Math.max(34, Math.min(70, Math.floor(Math.min(w / 5, h / 4)))); const x0 = (w - cell * 3) / 2; const y0 = (h - cell * 3.4) / 2; const d = (n: number, i: number) => (n >= 10 ** i ? String(Math.floor(n / 10 ** i) % 10) : '');
  let g = `<text x="${x0 + 0.5 * cell - cell * 0.1}" y="${y0 + cell * 1.55}" class="col-sign" text-anchor="middle">${sign}</text>`;
  for (const [row, n] of [[0, a], [1, b]] as const) for (const [ci, i] of [[1, 1], [2, 0]] as const) g += `<text x="${x0 + (ci + 0.5) * cell}" y="${y0 + (row + 1) * cell * 0.95}" class="col-digit" text-anchor="middle">${d(n, i)}</text>`;
  g += `<line x1="${x0}" x2="${x0 + cell * 3}" y1="${y0 + cell * 2.15}" y2="${y0 + cell * 2.15}" stroke="var(--xg-ink-800)" stroke-width="4" stroke-linecap="round"/>`;
  for (const [ci, name] of [[1, '十'], [2, '个']] as const) g += `<rect x="${x0 + ci * cell + 5}" y="${y0 + cell * 2.3}" width="${cell - 10}" height="${cell * 0.9}" rx="10" fill="var(--xg-paper-200)" stroke="var(--xg-ink-400)" stroke-width="3" stroke-dasharray="6 5"/><text x="${x0 + (ci + 0.5) * cell}" y="${y0 + cell * 3.35}" class="col-name" text-anchor="middle">${name}</text>`;
  return `<svg class="col-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${g}</svg>`;
}
const exprOf = (f: FamilyDef, p: any, ask?: string): string => f.prompt(p, ask).big;
function keypadStage(c: StageCtx): StageHandle {
  const root = el('div', 'st-pic'); const expr = el('div', 'st-expr', exprOf(c.fam, c.params, c.item.ask));
  const pic = el('div', 'st-art', pictureFor(c.fam, c.params, c.w, c.h)); root.append(pic.innerHTML ? pic : el('div', ''));  void expr; c.host.replaceChildren(root);
  const cells = c.fam.id === 'mul.compareArr' ? undefined : KEYPAD_CELLS[c.fam.id]?.slice();
  return { input: 'keypad', layout: 'keypad', cells, collect: () => null, hasAnswer: () => true, lock() {}, hint(level, answer) { root.classList.toggle('is-hinted', level >= 1); void answer; }, resize() {}, destroy: () => c.host.replaceChildren() };
}

/** ---- choose (4 big buttons; the distractors are the family's own misconceptions) ---- */
export function choicesOf(f: FamilyDef, p: unknown, ask: string | undefined, correct: number, seed: number): number[] {
  const set = new Set<number>([correct]);
  for (const cls of f.diag) { const b = bugAnswer(f, p, cls, ask); if (typeof b === 'number' && b >= 0 && b <= 1000) set.add(b); }
  for (const d of [1, -1, 10, -10, 2, -2, 5, -5]) { if (set.size >= 4) break; const v = correct + d; if (v >= 0 && v <= 1000) set.add(v); }
  const arr = [...set].slice(0, 4);
  return arr.map((v, i) => ({ v, k: ((seed >>> (i * 3)) ^ (v * 2654435761)) >>> 0 })).sort((a, b) => a.k - b.k).map((x) => x.v);
}
function chooseStage(c: StageCtx, correct: number): StageHandle {
  const root = el('div', 'st-pic'); root.append(el('div', 'st-art', pictureFor(c.fam, c.params, c.w, c.h)), el('div', 'st-expr', exprOf(c.fam, c.params, c.item.ask)));
  const row = el('div', 'st-choices'); let locked = false;
  for (const v of choicesOf(c.fam, c.params, c.item.ask, correct, c.item.seed)) {
    const b = el('button', 'xg-btn xg-btn--secondary st-choice', String(v)); b.type = 'button';
    b.addEventListener('click', () => { if (locked) return; c.onOp(); c.onAnswer(v); });
    row.append(b);
  }
  root.append(row); c.host.replaceChildren(root);
  return { input: 'self', layout: 'folded', collect: () => null, hasAnswer: () => false, lock: (on) => { locked = on; row.classList.toggle('is-locked', on); }, hint(level) { root.classList.toggle('is-hinted', level >= 1); }, resize() {}, destroy: () => c.host.replaceChildren() };
}

/** ---- compare ---- */
function compareStage(c: StageCtx): StageHandle {
  const { a, b } = c.params as { a: number; b: number }; const three = Math.max(a, b) >= 100;
  const places = three ? ['hundreds', 'tens', 'ones'] : ['tens', 'ones'];
  let digit: string | null = null; let symb: string | null = null; let locked = false;
  const root = el('div', 'st-cmp'); const row = el('div', 'st-cmp-row');
  const num = (n: number, side: string) => { const s = String(n).padStart(places.length, '0'); const w = el('div', 'st-cmp-num'); w.setAttribute('data-side', side); places.forEach((pl, i) => { const d = el('button', 'st-digit', s[i]); d.type = 'button'; d.dataset.place = pl; d.setAttribute('aria-label', `${pl === 'hundreds' ? '百位' : pl === 'tens' ? '十位' : '个位'}`); w.append(d); }); return w; };
  const sy = el('div', 'st-cmp-syms');
  for (const s of ['>', '<', '=']) { const k = el('button', 'xg-btn xg-btn--secondary st-sym', s === '>' ? '＞' : s === '<' ? '＜' : '＝'); k.type = 'button'; k.dataset.sym = s; sy.append(k); }
  row.append(num(a, 'l'), sy, num(b, 'r')); root.append(el('div', 'st-hint-line', '点决定大小的那一位，再选符号'), row); c.host.replaceChildren(root);
  const paint = () => { root.querySelectorAll<HTMLElement>('.st-digit').forEach((d) => d.classList.toggle('is-on', d.dataset.place === digit)); root.querySelectorAll<HTMLElement>('.st-sym').forEach((d) => d.classList.toggle('is-on', d.dataset.sym === symb)); };
  root.addEventListener('click', (e) => {
    if (locked) return; const t = (e.target as HTMLElement).closest('button') as HTMLElement | null; if (!t) return; c.onOp();
    if (t.classList.contains('st-digit')) digit = t.dataset.place!; else if (t.classList.contains('st-sym')) symb = t.dataset.sym!; paint();
  });
  return {
    input: 'self', layout: 'folded', collect: () => (digit && symb ? { sym: symb, digit } : digit || symb ? { sym: symb ?? '', digit: digit ?? '' } : null), hasAnswer: () => !!(digit && symb), lock: (on) => { locked = on; },
    hint(level, answer) { root.classList.toggle('is-hinted', level >= 1); if (level >= 3) { const x = answer as { sym: string; digit: string }; digit = x.digit; symb = x.sym; paint(); } },
    resize() {}, destroy: () => c.host.replaceChildren(),
  };
}

/** ---- fallback: the operating surface of this family is not built yet (dev builds only auto-answer through the test hook) ---- */
function fallbackStage(c: StageCtx): StageHandle {
  c.host.replaceChildren(el('div', 'st-fallback', `<div class="st-expr">${exprOf(c.fam, c.params, c.item.ask)}</div><div class="st-note">操作台还在建设中</div>`));
  return { input: 'keypad', layout: 'keypad', collect: () => null, hasAnswer: () => true, lock() {}, hint() {}, resize() {}, destroy: () => c.host.replaceChildren() };
}

const INT_KEYPAD = new Set(['pv2.read', 'pv2.step', 'pv2.split', 'add.tens', 'add.carry1', 'add.2d2d', 'add.compensate', 'sub.tens', 'sub.borrow1', 'sub.thinkAdd', 'sub.2d2d', 'sub.compensate', 'rel.compare', 'rel.partWhole', 'rel.unknownAny',
  'pv3.read', 'pv3.dictation', 'pv3.step', 'pv3.addHund', 'pv3.skip', 'pv3.round', 'mul.groups', 'mul.skip', 'mul.array', 'mul.missingFactor', 'col.add', 'col.sub', 'mul.write', 'mul.split']);
const CHOOSABLE = new Set(['pv2.read', 'pv3.read', 'mul.groups', 'pv2.split']);
const OWN = new Set(['pv2.compare', 'pv3.compare', 'pv2.build', 'pv3.build', 'pv3.pack', 'pv3.counter', 'pv3.order', 'nl.zoom', 'mul.equalCheck', 'mul.commute', 'mul.compareArr', 'open.pv3', 'open.pv3cmp', 'open.groups', 'open.arrays']);
/** Which families have a real operating surface in this build. */
export const STAGE_READY = (id: string): boolean => id.startsWith('nl.') || INT_KEYPAD.has(id) || OWN.has(id);

const TRAY_HANDS = new Set(['add.tens', 'add.carry1', 'add.2d2d', 'sub.tens', 'sub.borrow1', 'sub.2d2d', 'pv3.addHund', 'pv3.read', 'pv2.read']);
export function mountStage(c: StageCtx, correct: Answer): StageHandle {
  const id = c.fam.id; const p = c.params; const ask = c.item.ask; const typed = !!c.item.typed; const hands = !!c.item.buildFirst;
  if (id === 'nl.place' || id === 'nl.read' || id === 'nl.calib') return numberLineStage(c);
  if (id === 'nl.zoom') return zoomStage(c);
  if (id === 'pv2.compare' || id === 'pv3.compare') return compareStage(c);
  if (id === 'pv2.build' || id === 'pv3.build' || id === 'pv3.pack') return trayStage(c, trayConfig(id, p, true, c.item.level <= 2)!);
  if (id === 'pv3.counter') return counterStage(c, 'set');
  if (id === 'pv3.dictation') return typed ? dictationTypedStage(c) : counterStage(c, 'dictation');
  if (id === 'pv3.step' && !typed) return counterStage(c, 'step');
  if (id === 'pv3.order') return beltStage(c);
  if (id === 'pv3.skip' || id === 'mul.skip') return hopStage(c);
  if (id === 'mul.groups' && ask === 'count') return podsStage(c, 'count');
  if (id === 'mul.groups' && ask === 'size') return podsStage(c, 'size');
  if (id === 'mul.write' && ask === 'times') return podsStage(c, 'cards');
  if (id === 'mul.equalCheck') return podsStage(c, 'equal');
  if (id === 'mul.array' && ask === 'cols') return arrayStage(c, 'missing');
  if (id === 'mul.array' && !typed) return arrayStage(c, 'build');
  if (id === 'mul.missingFactor' && !typed) return arrayStage(c, 'missing');
  if (id === 'mul.commute') return arrayStage(c, 'commute');
  if (id === 'mul.compareArr') return arrayStage(c, 'compare');
  if (id === 'open.groups') return podsStage(c, 'open');
  if (id === 'open.arrays') return arrayStage(c, 'open');
  if (id === 'open.pv3') { const h = trayStage(c, { ...trayConfig('pv3.build', { n: 0 }, true, true)!, target: 0 }); return { ...h, collect: () => { const r = h.collect() as { total: number }; return { built: r.total, said: r.total }; } }; }
  if (id === 'open.pv3cmp') return openCmpStage(c);
  if (TRAY_HANDS.has(id) && hands) {
    const cfg = trayConfig(id === 'pv3.addHund' ? (p.op === '+' ? 'add.2d2d' : 'sub.2d2d') : id, p, true, c.item.level <= 2);
    if (cfg && !(cfg.mode === 'read' && (c.hk ?? c.h) < 262)) return trayStage(c, cfg);
  }
  if (INT_KEYPAD.has(id)) {
    if (!typed && CHOOSABLE.has(id) && typeof correct === 'number') return chooseStage(c, correct);
    return keypadStage(c);
  }
  return fallbackStage(c);
}

/** open.pv3cmp: two counters → {a, b} */
function openCmpStage(c: StageCtx): StageHandle {
  const root = el('div', 'oc'); const a = counterView(100, c.h, false, 20); const b = counterView(100, c.h, false, 20); a.root.dataset.side = 'a'; b.root.dataset.side = 'b';
  root.append(a.root, el('b', 'oc-rel', c.params.rel === '>' ? '＞' : '＜'), b.root); c.host.replaceChildren(root); a.onChange = b.onChange = () => c.onOp();
  return { input: 'self', layout: 'folded', collect: () => ({ a: a.value(), b: b.value() }), hasAnswer: () => true, lock: (on) => { a.lock(on); b.lock(on); }, hint(level) { root.classList.toggle('is-hinted', level >= 1); }, resize(_w, h) { a.resize(h); b.resize(h); }, destroy: () => c.host.replaceChildren() };
}
export { zhNumber };
