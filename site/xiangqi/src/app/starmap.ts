// site/xiangqi/src/app/starmap.ts — 星图：每次 3 道杀棋题（一步杀；档位随近 30 题首次做对率升降）。题目由独立穷举复核过（content/xiangqi/pool-mate1.json 的 8 141 题 + 课内两步杀 24 题）。
import { h, icon } from '@kit/ui';
import { xqResult } from './result';
import type { Companion } from '@kit/companion';
import { createBoardView, type BoardViewImpl } from '@engines/board/view/board-view';
import { createInputController, type InputControllerImpl } from '@engines/board/input/input-controller';
import { createGhost } from '@engines/board/lesson/ghost';
import { createStepUi } from '@engines/board/lesson/step-ui';
import { createPuzzlePlayer } from '@engines/board/puzzle/player';
import { createRng, hash32 } from '@engines/board/core/rng';
import type { Puzzle } from '@engines/board/core/types';
import { layout, type Vp } from './layout';
import { place, setBack, setBubbleW, type AppCtx, type Screen } from './ctx';
import { createRules } from '../rules/rules';
import type { Position } from '../rules/position';
import { puzzleFromRecord } from '../lesson/data';
import puzzles from '../../../../content/xiangqi/puzzles.v1.json';

type PoolRow = [string, string, number];
let POOL: PoolRow[] = [];
/** 8 141 题的每日池（366 KB / gzip 105 KB）惰性加载，不进主包 */
const loadPool = async (): Promise<void> => { if (!POOL.length) POOL = (await import('../../../../content/xiangqi/pool-mate1.json')).default as unknown as PoolRow[]; };
const M2 = (puzzles as unknown as { mate2: { id: string; fen: string; solution: string; cat: string }[] }).mate2;
const todayKey = (): string => new Date().toISOString().slice(0, 10);

/** 选 3 题：按 tier 从池里抽没做过的；tier 3 以上轮到两步杀 */
export function pickSet(save: AppCtx['save'], seed: number, n = 3): { id: string; fen: string; sol: string; tier: number; two?: boolean }[] {
  const rng = createRng(seed); const done = new Set(save.puzzles.done); const tier = save.puzzles.tier; const out: { id: string; fen: string; sol: string; tier: number; two?: boolean }[] = [];
  const cand = POOL.map((p, i) => ({ i, p })).filter((x) => x.p[2] === tier && !done.has(`pool.${x.i}`));
  while (out.length < n && cand.length) { const k = Math.floor(rng.next() * cand.length); const { i, p } = cand.splice(k, 1)[0]; out.push({ id: `pool.${i}`, fen: `${p[0]} w`, sol: p[1], tier }); }
  if (out.length < n) for (const m of M2) { if (out.length >= n) break; if (!done.has(m.id)) out.push({ id: m.id, fen: m.fen, sol: m.solution, tier: 3, two: true }); }
  return out;
}

export function mountStarmap(ctx: AppCtx): Screen {
  const rules = createRules(); const s = ctx.save; let destroyed = false; let L = layout(ctx.vp(), { screen: 'lesson' }); let round = 0;
  const root = h('div', { class: 'xq-screen xq-lesson', 'data-screen': 'starmap' }); const host = h('div', { class: 'xq-host' }); const dock = h('div', { class: 'xq-dock' }); const botHost = h('div', { class: 'xq-bot' }); const title = h('div', { class: 'xq-title' }); const dots = h('div', { class: 'xq-dots' }); const slot = h('div', { class: 'xq-slot' }); root.append(host, dock, title, dots, botHost, slot);
  let player: ReturnType<typeof createPuzzlePlayer<number, Position>> | null = null;
  const defs: { id: string; ic: Parameters<typeof icon>[0]; label: string; fn: () => void }[] = [{ id: 'hint', ic: 'hint', label: '提示', fn: () => { player?.requestHint(); } }, { id: 'skip', ic: 'next', label: '换一题', fn: () => void next() }, { id: 'hall', ic: 'home', label: '回大厅', fn: () => ctx.go({ to: 'hall' }) }];
  const keys = defs.map((k) => { const b = h('button', { type: 'button', class: 'xq-key', 'data-key': k.id, 'aria-label': k.label, onclick: k.fn }); b.innerHTML = `${icon(k.ic)}<span>${k.label}</span>`; root.append(b); return b; }); ctx.root.append(root);
  const view: BoardViewImpl<number, Position> = createBoardView<number, Position>(host, { rules, theme: ctx.theme, orientation: 'first-bottom', seat: 'single', coords: false, reducedMotion: false });
  let viewState = rules.initial(); const origSet = view.setState.bind(view); view.setState = (st, o) => { viewState = st; origSet(st, o); };
  const input = createInputController(view, rules, { state: () => viewState, seatToMove: () => rules.turn(viewState), canAct: () => true, commit: async () => undefined, onIllegal: () => undefined }, { keyboard: false }) as InputControllerImpl<number, Position>;
  const bot: Companion = ctx.mountBot(botHost, { size: '100%', bubble: 'right', bubbleMax: Math.max(140, L.bubble.w), accessory: 'junshi', mood: 'idle' });
  const ghost = createGhost(view, rules, { playMove: async (enc) => { const m = rules.decode(viewState, enc); if (m === null) return; const before = viewState; viewState = rules.apply(before, m); await view.animateMove(m, before); } });
  const ui = createStepUi(view as unknown as BoardViewImpl<never, never>, { slot });
  let queue: ReturnType<typeof pickSet> = []; let ix = 0; let firsts = 0; let cancelCur = false;
  const say = (id: string, mood?: 'happy' | 'encouraging'): void => { void ctx.speak(bot, id, { mood }); };
  const renderDots = (): void => { dots.replaceChildren(...queue.map((_, k) => h('i', { class: k < ix ? 'on' : k === ix ? 'cur' : '' }))); title.replaceChildren(h('span', null, '星图'), h('small', null, queue[ix]?.two ? '两步杀' : '一步杀')); };
  function record(id: string, first: boolean): void {
    const p = s.puzzles; p.done.push(id); if (p.done.length > 800) p.done.shift(); if (first) { p.firstTry.push(id); if (p.firstTry.length > 800) p.firstTry.shift(); } p.recent30.push(first); if (p.recent30.length > 30) p.recent30.shift(); p.daily = { date: todayKey(), ids: [...p.daily.ids, id], got: (p.daily.date === todayKey() ? p.daily.got : 0) + (first ? 1 : 0) };
    if (p.recent30.length >= 10) { const r = p.recent30.filter(Boolean).length / p.recent30.length; if (r >= 0.8 && p.tier < 3) p.tier = (p.tier + 1) as 1 | 2 | 3; else if (r < 0.5 && p.tier > 1) p.tier = (p.tier - 1) as 1 | 2 | 3; } ctx.persist(); ctx.metrics.refresh();
  }
  async function next(): Promise<void> { cancelCur = true; player?.cancel(); }
  async function loop(): Promise<void> {
    await loadPool(); queue = pickSet(s, hash32(Date.now() & 0xffff, round)); if (destroyed) return; say('pz.intro'); while (!destroyed) {
      if (ix >= queue.length) { const stars = Math.max(1, firsts) as 1 | 2 | 3; const c = await xqResult(ctx, { kind: 'starmap-done', ribbon: '星图', stars, title: '这一组做完了', text: '想得很仔细，歇一歇也行。', actions: [{ id: 'more', label: '再做 3 道', kind: 'primary' }, { id: 'hall', label: '回大厅', kind: 'secondary' }] }); if (c !== 'more') { ctx.go({ to: 'hall' }); return; } round++; queue = pickSet(s, hash32(Date.now() & 0xffff, round)); ix = 0; firsts = 0; if (!queue.length) { ctx.go({ to: 'hall' }); return; } continue; }
      renderDots(); const q = queue[ix]; const pz: Puzzle = puzzleFromRecord(rules, { id: q.id, fen: q.fen, solution: q.sol, tier: q.tier }, q.two ? 'mate2' : 'mate1'); cancelCur = false;
      player = createPuzzlePlayer<number, Position>({ rules, view, input, ghost, ui, wrongHoldMs: 800, hooks: { onCorrect: (i) => { ctx.sfx('correct'); if (i.last) say(`f.ok${1 + (ix % 5)}`, 'happy'); }, onWrong: (i) => { ctx.sfx('hit-soft'); if (i.why) say(`w.${i.why}`, 'encouraging'); else say('f.try1', 'encouraging'); }, onHint: () => say('h.2') } });
      try { const r = await player.play(pz, { hints: true }); record(q.id, r.firstTry && r.hintTier === 0); if (r.firstTry && r.hintTier === 0) firsts++; ix++; await new Promise((res) => setTimeout(res, 700)); }
      catch (e) { if (!(e as { cancelled?: boolean }).cancelled) throw e; if (cancelCur) { ix++; } else return; }
    }
  }
  function applyLayout(vp: Vp): void { L = layout(vp, { screen: 'lesson' }); view.layout(L.board); place(dock, L.dock ?? L.panel); place(botHost, L.companion); place(dots, L.dots); setBack(L.home); setBubbleW(L.bubble.w);
    place(title, L.portrait ? { x: L.home.x + L.home.w + 10, y: L.home.y, w: L.S.w - L.home.w - 24, h: L.home.h } : { x: L.panel!.x + L.home.w + 10, y: L.home.y, w: L.panel!.w - L.home.w - 10, h: L.home.h }); keys.forEach((k, i) => place(k, L.keys[i]));
    const u = L.keys.reduce((a, r) => ({ x1: Math.min(a.x1, r.x), y1: Math.min(a.y1, r.y), x2: Math.max(a.x2, r.x + r.w), y2: Math.max(a.y2, r.y + r.h) }), { x1: 1e9, y1: 1e9, x2: 0, y2: 0 }); place(slot, { x: u.x1, y: u.y1, w: u.x2 - u.x1, h: u.y2 - u.y1 }); }
  applyLayout(ctx.vp()); void view.ready.then(() => { root.dataset.ready = '1'; void loop(); });
  (window as unknown as { __xq: unknown }).__xq = { view, input, rules, get state() { return viewState; }, get queue() { return queue; }, get ix() { return ix; }, play: async (enc: string) => { const m = rules.decode(viewState, enc); if (m === null) return false; await input.submit(m); return true; } };
  return { resize: (v) => { if (!destroyed) applyLayout(v); }, onBack: () => { ctx.go({ to: 'hall' }); return true; }, destroy: () => { destroyed = true; player?.cancel(); ghost.destroy(); ui.destroy(); input.destroy(); view.destroy(); bot.destroy(); root.remove(); } };
}
