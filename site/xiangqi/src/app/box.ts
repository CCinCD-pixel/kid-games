// site/xiangqi/src/app/box.ts — 棋盒：首次进入的 60 秒无字玩具（规格 §2.3）。
// 0–20 s 棋子一个个"弹"上盘，点哪个哪个亮（炮隔子吃 / 马的弧线 / 兵一步，最多三处"试试我"）；20–45 s 目标一拍：双车一步将死；45–60 s 一颗星飞过河、飞进九宫，点中得"发现印"。
// 除字幕外没有文字；右上"跳过"（1.5 秒后出现）；家长"跳过开场和教学"同效。
import { h, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import type { Companion } from '@kit/companion';
import { isTestEnv } from '@kit/dev';
import { createBoardView, type BoardViewImpl } from '@engines/board/view/board-view';
import { createSession, restoreGame, type Session } from '@engines/board/play/session';
import type { Disposable, Sq } from '@engines/board/core/types';
import { layout, type Layout, type Vp } from './layout';
import { place, setBack, setBubbleW, sleep, type AppCtx, type Screen } from './ctx';
import { Position, SQ, START_FEN, parseSq, parseMove } from '../rules/position';
import { createRules } from '../rules/rules';
import { createFx, type Fx } from '../art/fx';
import { GLYPH, PIECE_NAME } from './theme';

const FEN_A = '1r7/9/9/1n3p3/9/4N4/8P/1C7/9/9 w';           // 炮隔着马吃车 · 马跳吃卒 · 兵走一步
const FEN_B = '4k4/R8/9/1R7/9/9/9/9/3P5/3K5 w';                  // 双车一步将死：车 b7 → b10
const ORDER_A: string[] = ['b3', 'e5', 'i4', 'b7', 'f7', 'b10'];  // 弹上棋盘的顺序（红炮 红马 红兵 黑马 黑卒 黑车）
const STAR = '<svg viewBox="0 0 40 40"><defs><linearGradient id="bx-star" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c9"/><stop offset="1" stop-color="#df9a1c"/></linearGradient></defs><polygon points="20,2.5 25.4,14.2 38,15.6 28.6,24.2 31.2,36.7 20,30.4 8.8,36.7 11.4,24.2 2,15.6 14.6,14.2" fill="url(#bx-star)" stroke="#a86a00" stroke-width="1.8" stroke-linejoin="round"/></svg>';

export function mountBox(ctx: AppCtx, o: { onDone: (skipped: boolean) => void }): Screen {
  const rules = createRules(); const root = h('div', { class: 'xq-screen xq-box', 'data-screen': 'box' }); const host = h('div', { class: 'xq-host' }); const dock = h('div', { class: 'xq-dock' }); const botHost = h('div', { class: 'xq-bot' }); root.append(host, dock, botHost); ctx.root.append(root);
  let vp = ctx.vp(); let L: Layout = layout(vp, { screen: 'game' }); let destroyed = false; let finished = false; const t0 = performance.now(); let touches = 0; let captures = 0; let phase: 'setup' | 'play' | 'goal' | 'star' | 'done' = 'setup';
  const { game: game0 } = restoreGame(rules, '9/9/9/9/9/9/9/9/9/9 w', [], undefined);
  const view: BoardViewImpl<number, Position> = createBoardView<number, Position>(host, { rules, theme: ctx.theme, orientation: 'first-bottom', seat: 'single', coords: false, reducedMotion: false });
  const session: Session<number, Position> = createSession({ rules, view, game: game0, seat: 'single', kidSide: 0, ai: undefined, robot: null });
  const fx: Fx = createFx(view); const subs: Disposable[] = []; let marks: Disposable[] = []; let nameTag: HTMLElement | null = null; let discovered = 0;
  const bot: Companion = ctx.mountBot(botHost, { size: '100%', bubble: 'right', bubbleMax: Math.max(140, L.bubble.w), accessory: 'junshi', mood: 'idle' });
  const say = (id: string, mood?: 'happy' | 'encouraging' | 'celebrating' | 'idle'): void => { void ctx.speak(bot, id, { mood }); };
  const sq = (n: string): Sq => parseSq(n);
  const clearMarks = (): void => { for (const m of marks) m.dispose(); marks = []; };
  const waitIdle = async (ms = 2000): Promise<void> => { const t = performance.now(); while (!destroyed && (!view.idle || session.phase === 'animating') && performance.now() - t < ms) await sleep(30); };
  const touch = (): void => { touches++; lastTouch = performance.now(); clearMarks(); };
  let lastTouch = performance.now();

  function applyLayout(v: Vp): void { vp = v; L = layout(v, { screen: 'game' }); view.layout(L.board); place(dock, L.dock ?? L.panel); place(botHost, L.companion); setBack(L.home); setBubbleW(L.bubble.w); }
  /** 找到某格上的棋子元素并让它"弹"一下（squash） */
  function pop(s: Sq): void {
    const r = view.rect(s); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best: HTMLElement | null = null, bd = 1e9;
    for (const e of Array.from(view.el.querySelectorAll<HTMLElement>('.bk-piece'))) { const b = e.getBoundingClientRect(); const d = Math.hypot(b.left + b.width / 2 - cx, b.top + b.height / 2 - cy); if (d < bd) { bd = d; best = e; } }
    const sp = best?.querySelector<HTMLElement>('.bk-sprite'); if (sp && bd < r.width) sp.animate([{ transform: 'translateY(-26px) scale(.3)', opacity: 0 }, { transform: 'translateY(2px) scale(1.18,.86)', opacity: 1, offset: 0.55 }, { transform: 'translateY(0) scale(.96,1.05)', offset: 0.78 }, { transform: 'none' }], { duration: 420, easing: 'ease-out' });
    fx.ripple(s); ctx.sfx('place-piece', { rate: 0.9 + Math.random() * 0.25, volume: 0.8 });
  }
  /** 把当前局面的轮次重新拨回红方（黑方永远不动，棋盒只给红方玩） */
  const redTurn = (fen: string): string => fen.replace(/ b( |$)/, ' w$1');
  async function setupA(): Promise<void> {
    const full = Position.fromFen(FEN_A); const cur = Position.fromFen('9/9/9/9/9/9/9/9/9/9 w');
    for (const n of ORDER_A) { if (destroyed || finished) return; const s0 = sq(n); cur.b[s0] = full.b[s0]; session.restart(cur.fen()); await sleep(40); pop(s0); await sleep(330); }
    phase = 'play'; lastTouch = performance.now(); say('tb.touch', 'happy'); void runGlints();
  }
  /** "试试我"：闲置 5 秒亮一处（炮 → 马 → 兵），最多三处；20 秒内还没吃子就亲手示范一次 */
  async function runGlints(): Promise<void> {
    const seq: { at: string; to: string; line: string }[] = [{ at: 'b3', to: 'b10', line: 'tb.cannon' }, { at: 'e5', to: 'f7', line: 'tb.horse' }, { at: 'i4', to: 'i5', line: 'tb.pawn' }]; let i = 0;
    while (!destroyed && !finished && phase === 'play') {
      await sleep(250); const idleMs = performance.now() - lastTouch; if (idleMs < (i === 0 ? 4500 : 6500)) continue;
      if (captures === 0 && performance.now() - t0 > 24_000 && i >= 1) { await demo(); if (phase === 'play') { lastTouch = performance.now(); continue; } return; }
      const g = seq[i % 3]; i++; lastTouch = performance.now(); if (rules.decode(session.game.state(), g.at + g.to) === null) continue;   // 这颗子被孩子挪走了：这一处不亮
      clearMarks(); marks.push(view.mark('hint', [sq(g.at)], { pulse: true })); if (g.at === 'b3') marks.push(view.arrow(sq('b3'), sq('b10'), 'hint')); ctx.sfx('hint'); say(g.line, 'encouraging');
    }
  }
  /** 亲手示范一次吃子：优先「炮隔马吃车」，孩子已经把它挪走了就找盘上任何一个能吃的子；一个能吃的都没有就把棋子摆回去（孩子永远不会卡在一个没有目标的玩具里） */
  async function demo(): Promise<void> {
    clearMarks(); const st = session.game.state(); const caps = session.game.legalMoves().filter((m) => st.b[m >> 7] !== 0);
    const pref = caps.find((m) => (m & 127) === sq('b3') && (m >> 7) === sq('b10')) ?? caps[0];
    if (pref === undefined) { await resetA(); return; }
    await session.play(pref);
  }
  /** 摆回去：重新把六颗棋子弹上盘 */
  async function resetA(): Promise<void> {
    clearMarks(); session.restart(FEN_A); await sleep(60); for (const n of ORDER_A) { if (destroyed || finished) return; pop(sq(n)); await sleep(120); } lastTouch = performance.now(); say('tb.touch', 'happy');
  }

  // ───────── 事件 ─────────
  subs.push(view.on('landed', ({ sq: s0 }) => fx.ripple(s0)), view.on('captured', ({ sq: s0 }) => { fx.sparks(s0, { n: 12 }); fx.shake(2.5); ctx.sfx('capture'); }), view.on('lift', () => ctx.sfx('ui-select', { volume: 0.5 })), view.on('bump', () => ctx.sfx('bump')));
  subs.push(session.on('select', (e) => { touch(); showName(e.sq); }));
  subs.push(session.on('illegal', () => { touch(); }));
  subs.push(session.on('move', (e) => {
    touch(); hideName(); if (e.capture) captures++;
    if (phase === 'play') void afterMoveA(e.capture);
    else if (phase === 'goal') void afterMoveB();
  }));
  function showName(s0: Sq | null): void {
    hideName(); if (s0 === null) return; const p = session.game.state().b[s0]; if (!p) return; const r = view.rect(s0), b = host.getBoundingClientRect(); const name = PIECE_NAME[p & 7]?.[p >> 3] ?? '';
    nameTag = h('div', { class: 'xq-nametag' }, name); nameTag.style.left = `${r.left + r.width / 2 - b.left}px`; nameTag.style.top = `${r.top - b.top - 6}px`; host.append(nameTag); void GLYPH;
  }
  const hideName = (): void => { nameTag?.remove(); nameTag = null; };
  async function afterMoveA(cap: boolean): Promise<void> {
    await waitIdle(); if (destroyed || finished) return; session.restart(redTurn(session.game.fen())); await sleep(30);
    if (cap) { phase = 'goal'; await sleep(1100); await beatB(); }
  }
  async function beatB(): Promise<void> {
    if (destroyed || finished) return; clearMarks(); session.restart(FEN_B); await sleep(60); pop(sq('e10')); pop(sq('b7')); pop(sq('a9')); phase = 'goal'; lastTouch = performance.now(); say('tb.goal', 'happy');
    void (async () => { while (!destroyed && !finished && phase === 'goal') { await sleep(300); if (performance.now() - lastTouch > 11_000) { lastTouch = performance.now(); clearMarks(); marks.push(view.mark('hint', [sq('b7')], { pulse: true }), view.arrow(sq('b7'), sq('b10'), 'hint')); ctx.sfx('hint'); } } })();
  }
  async function afterMoveB(): Promise<void> {
    await waitIdle(); if (destroyed || finished) return; const out = session.outcome();
    if (out.over) { phase = 'star'; const k = session.game.state().ksq[1]; ctx.sfx('jingle-win'); fx.burst(k >= 0 ? k : sq('e10'), 'mate'); bot.react('fan'); await sleep(2200); void beatC(); }
    else { ctx.sfx('bump'); await sleep(700); session.restart(FEN_B); }       // 没将死：回到原位再试，不说"错"
  }
  // ───────── 第三拍：星飞过河、飞进九宫 ─────────
  function starAt(target: Sq, hover: Sq[], kind: 'river' | 'palace'): Promise<boolean> {
    return new Promise((res) => {
      const rb = root.getBoundingClientRect(); const pt = (s0: Sq): { x: number; y: number } => { const r = view.rect(s0); return { x: r.left + r.width / 2 - rb.left, y: r.top + r.height / 2 - rb.top }; };
      const from = { x: -30, y: pt(hover[0]).y - 120 }, hov = hover.length > 1 ? { x: (pt(hover[0]).x + pt(hover[1]).x) / 2, y: (pt(hover[0]).y + pt(hover[1]).y) / 2 } : pt(hover[0]); void target;
      const size = Math.max(56, view.cellPx * 0.9); const star = h('button', { type: 'button', class: 'xq-star', 'aria-label': kind === 'river' ? '一颗星' : '又一颗星' }); star.style.width = star.style.height = `${size}px`; star.innerHTML = STAR; root.append(star);
      const s0 = { transform: `translate(${from.x}px,${from.y}px)` }, s1 = { transform: `translate(${hov.x - size / 2}px,${hov.y - size / 2}px) rotate(180deg)` };
      const fly = star.animate([s0, s1], { duration: 1500, easing: 'cubic-bezier(.3,.8,.3,1)', fill: 'forwards' }); let caught = false; ctx.sfx('whoosh-down', { volume: 0.5 });
      const catchIt = (auto: boolean): void => { if (caught) return; caught = true; star.remove(); fx.sparks(hover[0], { n: 16 }); ctx.sfx('star-2'); stamp(kind); res(!auto); };
      star.addEventListener('pointerdown', () => catchIt(false));
      void fly.finished.then(() => { if (caught || destroyed) return; star.animate([{ transform: s1.transform }, { transform: `translate(${hov.x - size / 2}px,${hov.y - size / 2 - 10}px) rotate(190deg) scale(1.1)` }, { transform: s1.transform }], { duration: 1400, iterations: 7, easing: 'ease-in-out' }); setTimeout(() => catchIt(true), 9500); });
    });
  }
  function stamp(kind: 'river' | 'palace'): void {
    discovered++; ctx.save.intro[kind] = true; ctx.persist(); say(kind === 'river' ? 'tb.stampRiver' : 'tb.stampPalace', 'celebrating');
    const el = h('div', { class: 'xq-discover' }, h('b', null, kind === 'river' ? '楚河汉界' : '九宫'), h('small', null, '发现印')); root.append(el); ctx.sfx('level-complete', { volume: 0.6 }); setTimeout(() => el.remove(), 2600);
  }
  async function beatC(): Promise<void> {
    if (destroyed || finished) return; clearMarks(); session.restart(START_FEN); await sleep(120); phase = 'star'; session.input.enable(false); say('tb.river', 'encouraging');
    await starAt(sq('e5'), [SQ(4, 4), SQ(5, 4)], 'river'); if (destroyed || finished) return; await sleep(1500);
    say('tb.palace', 'encouraging'); await starAt(sq('e1'), [SQ(8, 4)], 'palace'); if (destroyed || finished) return; await sleep(2200); finish(false);
  }
  function finish(skipped: boolean): void {
    if (finished) return; finished = true; phase = 'done'; const s = ctx.save; s.intro.box = true; for (const id of ['L01', 'L02']) if (!skipped && !s.lessons[id]?.done) s.lessons[id] = { stars: s.lessons[id]?.stars ?? 1, stepId: `${id}.1`, done: false, known: true }; ctx.persist(); o.onDone(skipped);   // 玩完整个棋盒才算学过 L01 / L02；点跳过只是不看开场，不记学会
  }

  applyLayout(vp); void view.ready.then(() => { root.dataset.ready = '1'; if (destroyed) return; if (isTestEnv() && new URLSearchParams(location.search).get('boxskip') === '1') { finish(true); return; } if (shouldAutoSkip()) { finish(true); return; } say('s.title', 'happy'); void sleep(900).then(() => { void setupA(); }); });
  const unmountSkip = mountSkipButton(root, () => { ctx.narrator.stop(); bot.hush(); finish(true); }, { delayMs: 1500 });
  (window as unknown as { __xq: unknown }).__xq = { view, session, get phase() { return phase; }, get touches() { return touches; }, get captures() { return captures; }, get discovered() { return discovered; }, rules, sq, play: async (enc: string): Promise<boolean> => { const m = rules.decode(session.game.state(), enc); if (m === null) return false; await session.play(m); return true; }, skip: () => finish(true), demo: () => demo(), reset: () => resetA(), parseMove, elapsed: () => performance.now() - t0 };
  return { resize: (v) => { if (!destroyed) applyLayout(v); }, onBack: () => false, destroy: () => { destroyed = true; unmountSkip(); for (const s of subs) s.dispose(); clearMarks(); fx.destroy(); session.destroy(); view.destroy(); bot.destroy(); root.remove(); } };
}
