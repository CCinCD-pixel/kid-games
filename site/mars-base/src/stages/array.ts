/**
 * Arrays (生产线 P2): the 板 of blocks in rows × columns. `arrayPicture` draws the fixed board; interactive kinds: build (set rows/cols with the
 * handles), missing (add columns until the board is as big as the order), commute (predict → 转一转 → read the turned board), compare (two boards),
 * open (find every rectangle of 24 on the 10×10 board). Area is conserved by the model (engines/manip/models.ts).
 */
import { ghostTap } from '@kit/ui';
import { ARRAY_MAX, arrayArea, arraySet, arrayTurn, type ArrayState } from '@engines/manip/models';
import { factorPairsIn10x10 } from '../families/open';
import type { Answer } from '../app/types';
import { KEYPAD_CELLS } from '../app/cellInput';
import { btn, el, playPlan, sleep, reducedMotion, type StageCtx, type StageHandle } from './common';
import { cardRow } from './misc';

export function arrayPicture(rows: number, cols: number, w: number, h: number, opts: { cut?: number; ghost?: number; glowRow?: number; class?: string } = {}): string {
  const cell = Math.max(8, Math.min(66, Math.floor(Math.min((w - 12) / Math.max(1, cols), (h - 12) / Math.max(1, rows))))); const g = Math.max(2, Math.round(cell * 0.1));
  const W = cols * cell, H = rows * cell; const x0 = (w - W) / 2, y0 = (h - H) / 2; let s = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lower = opts.cut && r >= opts.cut; const glow = opts.glowRow !== undefined && r === opts.glowRow;
    s += `<rect x="${x0 + c * cell + g / 2}" y="${y0 + r * cell + g / 2}" width="${cell - g}" height="${cell - g}" rx="${Math.max(2, cell * 0.16)}" fill="${glow ? 'var(--xg-gold-500)' : lower ? 'var(--xg-jade-500)' : 'var(--xg-mars)'}" stroke="var(--xg-ink-800)" stroke-width="1.4"/>`;
  }
  if (opts.cut) s += `<line x1="${x0 - 6}" x2="${x0 + W + 6}" y1="${y0 + opts.cut * cell}" y2="${y0 + opts.cut * cell}" stroke="var(--xg-ink-900)" stroke-width="3" stroke-dasharray="7 5"/>`;
  void opts.ghost;
  return `<svg class="ar-svg ${opts.class ?? ''}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${rows} 行 ${cols} 列的板">${s}</svg>`;
}

type Kind = 'build' | 'missing' | 'commute' | 'compare' | 'open';
const pairKey = (a: number, b: number) => `${Math.min(a, b)}x${Math.max(a, b)}`;
export function arrayStage(c: StageCtx, kind: Kind): StageHandle {
  const p = c.params; const root = el('div', `ar ar--${kind}`); let locked = false; let alive = true;
  const board = el('div', 'ar-board'); const bar = el('div', 'ar-bar'); root.append(board, bar);
  let s: ArrayState = { rows: 1, cols: 1, cut: 0 }; let predict: 0 | 1 | null = null; let turned = false; let cards: ReturnType<typeof cardRow> | null = null; let pick: 0 | 1 | 2 | null = null; const found = new Set<string>(); let spinning = false;
  if (kind === 'missing') s = { rows: p.rows ?? p.n, cols: 1, cut: 0 };
  if (kind === 'commute') s = { rows: p.rows, cols: p.cols, cut: 0 };
  if (kind === 'open') s = { rows: 1, cols: 1, cut: 0 };
  const target = kind === 'missing' ? (p.rows ?? p.n) * (p.cols ?? p.P / p.n) : 0;
  const stepper = (label: string, key: 'rows' | 'cols') => {
    const wrap = el('div', 'ar-step'); const m = btn('xg-btn xg-btn--secondary ar-sz', '−', `${label}减一`); const pl = btn('xg-btn xg-btn--secondary ar-sz', '＋', `${label}加一`); const t = el('b', 'ar-lab', label);
    m.disabled = locked || !arraySet(s, key === 'rows' ? s.rows - 1 : s.rows, key === 'cols' ? s.cols - 1 : s.cols); pl.disabled = locked || !arraySet(s, key === 'rows' ? s.rows + 1 : s.rows, key === 'cols' ? s.cols + 1 : s.cols);
    const set = (d: number) => { const n = arraySet(s, key === 'rows' ? s.rows + d : s.rows, key === 'cols' ? s.cols + d : s.cols); if (n) { s = n; c.onOp(); c.sfx?.('ui-pop'); render(); } };
    m.onclick = () => set(-1); pl.onclick = () => set(1); wrap.append(m, t, pl); return wrap;
  };
  const strip = (n: number) => `<div class="ar-strip" aria-label="一共这么多块">${Array.from({ length: n }, () => '<i></i>').join('')}</div>`;
  function render(): void {
    // 'open' also holds the list of found boards under the picture. The bar is rebuilt from scratch on EVERY render: it must be emptied here, on its own line
    // (QA fix-mars-r2: this call once sat at the end of the comment above, so every tap piled another row of buttons onto the bar — validate/stage-lint.test.ts guards it).
    const bw = c.w - 16, bh = Math.max(60, c.h - (kind === 'open' ? 224 : 130));
    bar.replaceChildren();
    if (kind === 'build' || kind === 'open') {
      board.innerHTML = arrayPicture(s.rows, s.cols, bw, bh); bar.append(stepper('行', 'rows'), stepper('列', 'cols'));
      if (kind === 'open') {
        const keep = btn('xg-btn xg-btn--primary ar-keep', '放进册子', '放进册子'); const dup = found.has(pairKey(s.rows, s.cols));
        keep.disabled = locked || s.rows * s.cols !== p.total || dup; keep.onclick = () => { found.add(pairKey(s.rows, s.cols)); c.onOp(); render(); }; bar.append(keep);
        const list = el('div', 'ar-found', [...found].sort().map((k) => `<span class="ar-chip">${k.replace('x', ' × ')}</span>`).join('') || '<span class="ar-hint">摆出 24 块的板</span>'); board.append(list);
      }
    } else if (kind === 'missing') {
      board.innerHTML = strip(target) + arrayPicture(s.rows, s.cols, bw, Math.max(60, bh - 36));
      const add = btn('xg-btn xg-btn--primary ar-keep', '加一列', '加一列'); add.disabled = locked || !arraySet(s, s.rows, s.cols + 1); add.onclick = () => { const n = arraySet(s, s.rows, s.cols + 1); if (n) { s = n; c.onOp(); c.sfx?.('ui-pop'); render(); } };
      const rm = btn('xg-btn xg-btn--secondary ar-sz', '拿走一列', '拿走一列'); rm.disabled = locked || s.cols <= 1; rm.onclick = () => { const n = arraySet(s, s.rows, s.cols - 1); if (n) { s = n; c.onOp(); render(); } }; bar.append(rm, add);
    } else if (kind === 'commute') {
      board.innerHTML = arrayPicture(s.rows, s.cols, bw, Math.max(70, bh - 60), { class: turned ? 'is-turned' : '' });
      if (predict === null) { bar.append(el('div', 'ar-cap', '转一转，总数会变吗？')); const no = btn('xg-btn xg-btn--primary', '不变', '不变'); const yes = btn('xg-btn xg-btn--secondary', '会变', '会变'); no.onclick = () => { predict = 0; c.onOp(); render(); }; yes.onclick = () => { predict = 1; c.onOp(); render(); }; bar.append(no, yes); }
      else if (!turned) { const t = btn('xg-btn xg-btn--accent ar-turn', '转一转', '转一转'); t.disabled = locked || spinning; t.onclick = () => void turn(); bar.append(t); }
      else { bar.append(el('div', 'ar-cap', '现在是几行几列？')); if (!cards) { cards = cardRow(['行'], 10, () => c.onOp(), ['行数', '列数']); root.insertBefore(cards.root, bar); } }
    } else if (kind === 'compare') {
      const half = Math.floor(bw / 2) - 6; const pb = (r: number, cl: number, i: 1 | 2) => `<button type="button" class="ar-pick${pick === i ? ' is-on' : ''}" data-i="${i}" aria-label="第${i}块板">${arrayPicture(r, cl, half, Math.max(60, bh - 20))}</button>`;
      board.innerHTML = `<div class="ar-two">${pb(p.r1, p.c1, 1)}${pb(p.r2, p.c2, 2)}</div>`;
      const eq = btn(`xg-btn xg-btn--secondary ar-eq${pick === 0 ? ' is-on' : ''}`, '一样大', '一样大'); eq.onclick = () => { if (!locked) { pick = 0; c.onOp(); render(); } }; bar.append(eq);
      board.querySelectorAll<HTMLElement>('.ar-pick').forEach((b) => (b.onclick = () => { if (!locked) { pick = Number(b.dataset.i) as 1 | 2; c.onOp(); render(); } }));
    }
  }
  async function turn(): Promise<void> {
    spinning = true; board.classList.add('is-turning'); c.sfx?.('ui-open'); await sleep(reducedMotion() ? 120 : 600); if (!alive) return;
    s = arrayTurn(s); turned = true; spinning = false; board.classList.remove('is-turning'); c.onOp(); render();
  }
  render(); c.host.replaceChildren(root);
  const done = (): boolean => (kind === 'open' ? found.size > 0 : kind === 'build' ? s.rows * s.cols > 1 : kind === 'missing' ? s.cols > 1 : kind === 'compare' ? pick !== null : !!cards?.full());
  const handle: StageHandle = {
    input: kind === 'compare' ? 'keypad' : 'self', layout: kind === 'compare' ? 'keypad' : 'folded', cells: kind === 'compare' ? KEYPAD_CELLS['mul.compareArr'].slice() : undefined,
    pre: kind === 'compare' ? () => (pick === null ? null : [pick]) : undefined,
    collect() {
      if (kind === 'build') return arrayArea(s); if (kind === 'missing') return s.cols;
      if (kind === 'commute') { const v = cards?.values(); return predict !== null && v && v.every((x) => x !== null) ? [predict, v[0] as number, v[1] as number] : null; }
      if (kind === 'open') return found.size ? { pairs: [...found].map((k) => k.split('x').map(Number)) } : null; return null;
    },
    hasAnswer: () => (kind === 'commute' ? !!cards?.full() && predict !== null : done()),
    lock(on) { locked = on; cards?.lock(on); render(); },
    hint(level, ans: Answer) {
      root.classList.toggle('is-hinted', level >= 1);
      if (level === 1) root.querySelectorAll('.ar-svg, .ar-strip').forEach((e) => e.classList.add('is-glow'));
      if (level === 2) { if (kind === 'build') { const n = arraySet(s, p.rows, 1); if (n) { s = n; render(); } } else if (kind === 'missing') { const n = arraySet(s, s.rows, 2); if (n) { s = n; render(); } } else if (kind === 'commute') { predict = 0; render(); } }   // H2 gives the prediction (a wrong 会变 used to stay for ever: the buttons are gone once chosen)
      if (level >= 3) void (async () => {
        if (kind === 'build') { s = arraySet(s, p.rows, p.cols) ?? s; render(); }
        else if (kind === 'missing') { const addB = root.querySelector('.ar-keep'); const need = Number(ans); await playPlan(Array.from({ length: Math.max(0, need - s.cols) }), async (_x, i) => { if (i === 0 && addB) await ghostTap(addB).catch(() => {}); const n = arraySet(s, s.rows, s.cols + 1); if (n) { s = n; render(); } }, 380, () => alive); }
        else if (kind === 'commute') { if (predict !== 0) { predict = 0; render(); } if (!turned) await turn(); const a = ans as number[]; cards?.set(0, a[1]); cards?.set(1, a[2]); }
        else if (kind === 'open') { for (const [a, b] of factorPairsIn10x10(p.total)) found.add(pairKey(a, b)); render(); }
        else if (kind === 'compare') { pick = Number(ans as unknown as number[] ? (ans as number[])[0] : 0) as 0 | 1 | 2; render(); }
      })();
    },
    resize(w, h) { c.w = w; c.h = h; render(); }, destroy() { alive = false; c.host.replaceChildren(); },
  };
  void ARRAY_MAX;
  return handle;
}
