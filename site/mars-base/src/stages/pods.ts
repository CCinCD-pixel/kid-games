/**
 * 货舱 (pods): equal groups. `podsPicture` is the fixed-pattern picture used everywhere (k pods × n crystals, the same n always looks the same);
 * the interactive kinds: count (make pods of n from a stock), size (deal a round at a time until the stock is gone), cards (write □ × □),
 * equalCheck (一样多吗？ then the two-step answer) and open (free equal groups of a total).
 */
import { ghostTap } from '@kit/ui';
import { podsAdd, podsDeal, podsEqual, podsRemove, podsTake, type PodsState } from '@engines/manip/models';
import type { Answer } from '../app/types';
import { gemIcon, podPattern } from '../art/crystals';
import { btn, el, playPlan, type StageCtx, type StageHandle } from './common';
import { cardRow } from './misc';

/** k pods of n crystals (or `sizes` when unequal); `lit` lights the first pods (the 对质 demo), `labels` writes a number under them. */
export function podsPicture(n: number, k: number, w: number, h: number, opts: { sizes?: number[]; lit?: number; labels?: (string | number)[]; strike?: number[] } = {}): string {
  const sizes = opts.sizes ?? Array.from({ length: k }, () => n); const cnt = sizes.length;
  const cols = cnt <= 5 ? cnt : Math.ceil(cnt / 2); const rows = Math.ceil(cnt / cols);
  const pw = Math.max(30, Math.min(120, (w - 10) / cols - 10)); const ph = Math.max(34, Math.min(104, (h - 6) / rows - (opts.labels ? 26 : 12)));
  const totalW = cols * (pw + 10); const x0 = (w - totalW) / 2 + 5; let g = '';
  sizes.forEach((sz, i) => {
    const cx = x0 + (i % cols) * (pw + 10); const cy = 6 + Math.floor(i / cols) * (ph + (opts.labels ? 28 : 14));
    const lit = opts.lit !== undefined && i < opts.lit;
    g += `<g transform="translate(${cx},${cy})"><rect width="${pw}" height="${ph}" rx="${Math.min(22, pw * 0.3)}" fill="${lit ? 'var(--xg-gold-100, #fdeeb9)' : 'var(--xg-surface)'}" stroke="${lit ? 'var(--xg-gold-600)' : 'var(--xg-ink-700)'}" stroke-width="${lit ? 3.4 : 2.4}"/>${podPattern(sz, pw, ph)}`
      + (opts.labels && opts.labels[i] !== undefined ? `<text x="${pw / 2}" y="${ph + 20}" text-anchor="middle" class="pd-lab">${opts.labels[i]}</text>` : '') + '</g>';
  });
  return `<svg class="pd-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${g}</svg>`;
}

type Kind = 'count' | 'size' | 'cards' | 'equal' | 'open';
export function podsStage(c: StageCtx, kind: Kind): StageHandle {
  const p = c.params; const root = el('div', `pd pd--${kind}`); let locked = false; let alive = true;
  const board = el('div', 'pd-board'); const bar = el('div', 'pd-bar'); root.append(board, bar);
  // ---- state per kind
  let s: PodsState = { pods: [], stock: 0 }; let podSize = 3; let cards: ReturnType<typeof cardRow> | null = null; let eqStep: 0 | 1 | 2 = 0; let eqChoice: 0 | 1 | null = null; let removed = 0; let sizes: number[] = [];
  if (kind === 'count') s = { pods: [], stock: p.n * p.k };
  if (kind === 'size') s = { pods: Array.from({ length: p.k }, () => 0), stock: p.n * p.k };
  if (kind === 'open') { s = { pods: [], stock: p.total }; podSize = 3; }
  if (kind === 'equal') sizes = (p.sizes as number[]).slice();
  const minSize = () => Math.min(...sizes);

  const stockHtml = () => `<div class="pd-stock" aria-label="货堆">${Array.from({ length: Math.min(40, s.stock) }, () => gemIcon(20)).join('')}</div>`;
  const render = () => {
    const bw = c.w - 16, bh = Math.max(80, c.h - 120);
    bar.replaceChildren();
    if (kind === 'count' || kind === 'open') {
      board.innerHTML = stockHtml() + podsPicture(0, 0, bw, bh, { sizes: s.pods }); const sz = kind === 'count' ? p.n : podSize;
      const add = btn('xg-btn xg-btn--primary pd-add', kind === 'count' ? `再装一舱` : '装一舱', '装一舱'); add.disabled = locked || !podsAdd(s, sz); add.onclick = () => act(podsAdd(s, sz));
      const rm = btn('xg-btn xg-btn--secondary pd-rm', '拿走一舱', '拿走一舱'); rm.disabled = locked || !s.pods.length; rm.onclick = () => act(podsRemove(s, s.pods.length - 1));
      bar.append(rm, add);
      if (kind === 'open') { const m = btn('xg-btn xg-btn--secondary pd-sz', '−', '每舱少一颗'); const pl = btn('xg-btn xg-btn--secondary pd-sz', '＋', '每舱多一颗'); const lab = el('b', 'pd-szn', `每舱 ${podSize}`); m.disabled = locked || podSize <= 2 || s.pods.length > 0; pl.disabled = locked || podSize >= 10 || s.pods.length > 0; m.onclick = () => { podSize--; render(); }; pl.onclick = () => { podSize++; render(); }; bar.prepend(m, lab, pl); }
    } else if (kind === 'size') {
      board.innerHTML = stockHtml() + podsPicture(0, 0, bw, bh, { sizes: s.pods });
      const deal = btn('xg-btn xg-btn--primary pd-add', '发一圈', '发一圈'); deal.disabled = locked || !podsDeal(s); deal.onclick = () => act(podsDeal(s));
      const back = btn('xg-btn xg-btn--secondary pd-rm', '收回一圈', '收回一圈'); back.disabled = locked || s.pods.some((x) => x < 1); back.onclick = () => { let n: PodsState | null = s; for (let i = 0; i < s.pods.length && n; i++) n = podsTake(n, i); act(n); };
      bar.append(back, deal);
    } else if (kind === 'cards') {
      board.innerHTML = podsPicture(p.n, p.k, bw, Math.max(70, bh - 130));
    } else {
      board.innerHTML = podsPicture(0, 0, bw, Math.max(70, bh - 100), { sizes });
      // QA fix-mars-r2 blocker 3: the two answers STAY on screen (the chosen one lit) so that a wrong first choice can always be taken back
      const yes = btn(`xg-btn pd-yes ${eqChoice === 1 ? 'xg-btn--primary is-on' : 'xg-btn--secondary'}`, '一样多', '一样多'); const no = btn(`xg-btn pd-no ${eqChoice === 0 ? 'xg-btn--primary is-on' : 'xg-btn--secondary'}`, '不一样多', '不一样多');
      yes.disabled = locked; no.disabled = locked; yes.onclick = () => choose(1); no.onclick = () => choose(0); bar.append(yes, no);
      if (eqChoice === 0) {
        const take = btn('xg-btn xg-btn--secondary pd-rm', '拿走一颗多的', '拿走一颗多的'); take.disabled = locked || sizes.every((x) => x === minSize()); take.onclick = () => { const i = sizes.findIndex((x) => x > minSize()); if (i >= 0) { sizes[i]--; removed++; c.onOp(); render(); } };
        bar.append(el('div', 'pd-cap', '点多出来的，拿走变成一样多'), take);
      }
    }
  };
  const act = (n: PodsState | null) => { if (!n || locked) return; s = n; c.onOp(); c.sfx?.('ui-pop'); render(); };
  /** leave the current branch: the 写成乘法 cards go, the pods are the order's again (nothing taken away) */
  const resetBranch = (): void => { cards?.root.remove(); cards = null; root.querySelector('.pd-capline')?.remove(); sizes = (p.sizes as number[]).slice(); removed = 0; };
  const choose = (v: 0 | 1): void => {
    if (locked || eqChoice === v) return;
    resetBranch(); eqChoice = v; eqStep = 1; c.onOp(); c.sfx?.('ui-pop');
    if (v === 1) { board.after(el('div', 'pd-capline', '写成乘法')); cards = cardRow(['×'], 10, () => c.onOp(), ['几个', '每个几']); root.insertBefore(cards.root, bar); }
    render();
  };
  if (kind === 'cards') { cards = cardRow(['×'], 10, () => c.onOp(), ['几个', '每个几']); root.insertBefore(cards.root, bar); }
  render(); c.host.replaceChildren(root);

  const pair = (): number[] | null => { const v = cards?.values(); return v && v.every((x) => x !== null) ? (v as number[]) : null; };
  return {
    input: 'self', layout: 'folded',
    collect() {
      if (kind === 'count') return s.pods.length || null; if (kind === 'size') return podsEqual(s) ?? Math.max(0, s.pods[0] ?? 0) ?? null;
      if (kind === 'open') return s.pods.length ? { n: podsEqual(s) ?? s.pods[0], k: s.pods.length } : null;
      if (kind === 'cards') return pair();
      if (eqChoice === 1) { const v = pair(); return v ? [1, v[0], v[1]] : null; } if (eqChoice === 0) return eqStep ? [0, removed] : null; return null;
    },
    hasAnswer() { return kind === 'count' ? s.pods.length > 0 : kind === 'size' ? s.pods.some((x) => x > 0) : kind === 'open' ? s.pods.length > 0 : kind === 'cards' ? !!pair() : eqChoice === 1 ? !!pair() : eqChoice === 0 && removed > 0; },
    lock(on) { locked = on; cards?.lock(on); render(); },
    hint(level, ans: Answer) {
      root.classList.toggle('is-hinted', level >= 1);
      if (level === 1) { root.querySelectorAll('.pd-svg, .pd-stock').forEach((e) => e.classList.add('is-glow')); }
      if (level === 2) { if (kind === 'count') act(podsAdd(s, p.n)); else if (kind === 'size') act(podsDeal(s)); else if (kind === 'cards' || (kind === 'equal' && eqChoice === 1)) cards?.set(0, p.n ?? sizes[0]); }
      if (level >= 3) void (async () => {
        if (kind === 'count') { const addB = root.querySelector('.pd-add'); await playPlan(Array.from({ length: p.k }), async (_x, i) => { if (i === 0 && addB) await ghostTap(addB).catch(() => {}); act(podsAdd(s, p.n)); }, 380, () => alive); }
        else if (kind === 'size') { const dealB = root.querySelector('.pd-add'); await playPlan(Array.from({ length: p.n }), async (_x, i) => { if (i === 0 && dealB) await ghostTap(dealB).catch(() => {}); act(podsDeal(s)); }, 380, () => alive); }
        else if (kind === 'cards') { const a = ans as number[]; cards?.set(0, a[0]); cards?.set(1, a[1]); }
        else if (kind === 'equal') { const a = ans as number[]; if (a[0] === 1) { choose(1); cards?.set(0, a[1]); cards?.set(1, a[2]); } else { choose(0); while (sizes.some((x) => x > minSize())) { const i = sizes.findIndex((x) => x > minSize()); sizes[i]--; removed++; } render(); } }   // H3 shows the ORACLE branch, whatever was chosen before (a wrong first choice is replaced, not kept)
      })();
    },
    resize(w, h) { c.w = w; c.h = h; render(); }, destroy() { alive = false; c.host.replaceChildren(); },
    blocked: () => null,
  };
}
