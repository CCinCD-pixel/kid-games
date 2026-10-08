// 沙盘战斗 (spec §2.2, §2.5, §2.7, §8.4): fixed-step kernel (20 Hz) + interpolated Canvas2D stage + DOM HUD.
// Input → actions queued for the next tick; the HUD updates only when its numbers change.
// Modes: normal · assist tier 1/2 (§3.20) · ghost replay of the lesson window (「看看墨子怎么守」, §5.4).
import { effSpeed as speedOf, held, slowmoStart, slowmoGone, PHASE_TICKS, type SpeedHold } from './timing';
import { sayCard } from '../pointread';
import { createSim, step, act, snapshot, restore as restoreSnap, resume as resumeSnap, canPlace, hash, type Snapshot } from '../lane/sim';
import { puzzleStars, costOf, type Puzzle } from '../lane/puzzle';
import { coachLine, makeCoachMemory, followed, askLine, conceptLineId, type CoachLine, type CoachMemory } from '../lane/coach';
import { starsOf } from '../lane/stars';
import { UNITS } from '../lane/tables';
import { TPS, T as TILE, ASSIST, ASSIST2 } from '../lane/rules';
import { FEARS } from '../lane/tags';
import { learned } from '../lane/learn';
import type { Action, Level, SimEvent, SimState } from '../lane/types';
import { makeGeo, drawBoard, cellCx, feetY, laneTop, PHONE, type Geo, type PhoneInsets } from '../render/board';
import { Stage } from '../render/stage';
import { drawStats } from '../render/atlas';
import { FrameProbe, Ring, type Degrade } from '../render/perf';
import { rigIcon, portrait } from '../art/icons';
import { coachLineId } from '../theme/mozi';
import { nameOf, ENEMY_INFO } from '../content';
import { atlasFor, type AppCtx } from '../ctx';
import * as sfx from '../audio/sfx';
import { stinger } from '../audio/music';
import { BossBar, WarnHands, horseDelivery, namePlate, star3State, HORSE_SVG } from './hud';
import { icon, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import { takeReads } from '../pointread';
import type { LayoutInfo } from '@kit/shell';

export interface GhostRun { actions: [number, Action[]][]; w0: number; w1: number; seed: number; loadout: string[] }
export interface BattleOpts {
  level: Level; loadout: string[]; seed: number; assist?: 0 | 1 | 2; resume?: Snapshot | null; restore?: boolean;
  /** back from the map's 接着推演: open on the pause layer, so the child restarts the clock himself (spec §2.1) */
  startPaused?: boolean;
  /** a 战鼓 checkpoint already passed before a suspend: 接着推演 keeps 「从第 N 面战鼓重来」 (spec §8.4) */
  checkpoint?: { snap: Snapshot; flag: number } | null;
  ghost?: GhostRun | null;
  /** 设置 → 新手教学: 1-1 with its lesson again, even after it was won or skipped (Dad, 2026-10-08) */
  tutorial?: boolean;
  /** 锦囊谜题 (static drill, spec §3.18): place everything first, then 开始推演; no cooldowns / economy / logs */
  puzzle?: PuzzleRun | null;
  /** pause/leave (suspend) and each 战鼓 (checkpoint): the caller writes it to IndexedDB on an idle frame */
  onSnap?: (s: Snapshot, kind: 'suspend' | 'checkpoint', flag: number, now?: boolean) => Promise<void> | void;
  /** 回地图 from the pause menu: the game's action log so far (calibration replays, spec §8.8) */
  onAbandon?: (log: { actions: [number, Action[]][]; from: number; tick: number; seed: number }) => void;
  /** ?dev=perf stress scene (src/dev/perf.ts): fills the board before tick 0 and tops it up after every kernel step */
  dev?: { setup?(S: SimState, stage: Stage): void; tick?(S: SimState, stage: Stage): void; frame?(S: SimState, stage: Stage): void; degrade?: number } | null;
}
export interface Placed { card: string; lane: number; col: number }
export interface PuzzleRun { p: Puzzle; placed: Placed[] }
export interface BattleEnd { result: 'win' | 'lose'; S: SimState; stars: number; checkpoint: Snapshot | null; checkpointFlag: number; asked: number; /** ticks of every coach hint / 怎么办 answer (mastery needs hint-free games) */ hints?: number[]; placed?: Placed[]; spent?: number;
  /** kernel actions by tick since `from` (tick 0, or the restored snapshot's tick) + the seed they ran on (replays, §8.8) */
  actions?: [number, Action[]][]; from?: number; seed?: number;
  /** followed the first hand within 3 s (or acted before it) — PvZ 老手快速通道 input from 1-1 / 1-2 (spec §2.4) */
  quick?: boolean }
export interface Screen { layout(l: LayoutInfo): void; destroy(): void; pause(): void; leave?(): void | Promise<void> }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
const px = (e: HTMLElement, x: number, y: number, w: number, hh: number): void => { Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' }); };
/** "还差 N" (spec §2.5): a small 还差 over a big N, on its own dark plaque in the middle of the card */
const setShort = (e: HTMLElement, n: number): void => { const v = n > 0 ? String(n) : ''; if (e.dataset.n === v) return; e.dataset.n = v; e.innerHTML = n > 0 ? `<small>还差</small><b>${n}</b>` : ''; };
const TRAITS: Record<string, string> = { shield: '盾', wheels: '轮', momentum: '冲', swarm: '群', ladder: '梯', smoke: '烟', aura: '鼓', peck: '啄' };

export function mountBattle(root: HTMLElement, app: AppCtx, o: BattleOpts, done: (e: BattleEnd | null) => void): Screen {
  const ghost = o.ghost ?? null;
  const pz = ghost ? null : o.puzzle ?? null; let setup = !!pz; const placed: Placed[] = pz ? pz.placed.map((q) => ({ ...q })) : [];
  const tier = ghost ? 0 : (o.assist ?? 0);
  const L: Level = { ...o.level, loadout: ghost ? (ghost.loadout.length ? ghost.loadout : o.level.loadout) : o.loadout };
  const simOpt = { events: true, assist: tier, extraStart: tier === 2 ? ASSIST2.startGrain : tier ? ASSIST.startGrain : 0, logCap: tier === 2 ? ASSIST2.logs : 1 };
  const fresh = (seed: number): SimState => createSim(L, seed, simOpt);
  sfx.prepareLevel(L, L.loadout); // only this level's sounds stay synthesized (spec §8.6 audio budget)
  let S: SimState;
  const gmap = new Map<number, Action[]>(ghost ? ghost.actions : []);
  if (ghost) { // fast-forward (no drawing) to the start of the lesson window
    S = createSim(L, ghost.seed, { events: true });
    while (S.tick < ghost.w0 && !S.result) step(S, gmap.get(S.tick) ?? null);
    S.ev!.length = 0;
  } else if (o.resume) {
    const R = o.restore ? restoreSnap(o.resume, L, { events: true, assist: tier }) : resumeSnap(o.resume, L, { events: true });
    if (!R) app.mark('gf-desync', { level: o.level.id });
    S = R ?? fresh(o.seed);
  } else if (pz) S = pzState();
  else S = fresh(o.seed);
  /** a drill's state at tick 0 = a fresh sim with every placement made (exactly what step(S, placements) does first) */
  function pzState(): SimState { const X = fresh(0); for (const q of placed) act(X, { t: 'place', card: q.card, lane: q.lane, col: q.col }); if (X.ev) X.ev.length = 0; return X; }

  const el = h('div', 'gf-battle' + (ghost ? ' is-ghost' : '') + (pz ? ' is-puzzle is-setup' : '')); root.appendChild(el);
  const board = h('canvas', 'gf-layer'); const stageC = h('canvas', 'gf-layer gf-stage'); el.append(board, stageC);
  const hud = h('div', 'gf-hud'); el.appendChild(hud);
  // ── HUD pieces ──
  const bin = h('div', 'gf-bin', `<div class="gf-bin__num">0</div><div class="gf-bin__rate"></div>`);
  const tray = h('div', 'gf-tray' + (L.belt ? ' gf-tray--rack' : ''));
  const shovel = h('button', 'gf-tool gf-shovel', `<svg viewBox="0 0 32 32"><path d="M8 25 21 12" stroke="#7a4b26" stroke-width="3.6" stroke-linecap="round"/><path d="M19 8c3-3 7-1 6 3l-4 4c-2 1-4-1-4-3z" fill="#b8bec6" stroke="#2a1b12" stroke-width="1.6"/><circle cx="7" cy="26" r="2.6" fill="#c08a52" stroke="#2a1b12" stroke-width="1.2"/></svg>`);
  const box = h('div', 'gf-box', `<svg class="gf-box__ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg"/></svg><div class="gf-box__lid"></div><div class="gf-box__tokens"></div>`);
  const pauseB = h('button', 'gf-tool gf-pause', icon('pause'));
  const scroll = h('div', 'gf-scroll', `<div class="gf-scroll__fill"></div><div class="gf-scroll__hand"></div>`);
  const moziA = h('button', 'gf-avatar gf-mozi'); const moziB = h('div', 'gf-bubble gf-bubble--mozi', '<span class="t"></span>');
  const replay = h('button', 'gf-replay', icon('replay'));
  const lubanA = h('div', 'gf-avatar gf-luban'); const lubanB = h('div', 'gf-bubble gf-bubble--luban', '<span class="t"></span>');
  const speed = h('div', 'gf-speed');
  const star3 = h('button', 'gf-star3', `<span class="gf-star3__seal">附</span><span class="gf-star3__t"></span><span class="gf-star3__n"></span><span class="gf-star3__logs"><i></i><i></i></span><span class="gf-star3__ok"></span>`);
  hud.append(bin, tray, shovel, box, pauseB, scroll, moziA, moziB, replay, lubanA, lubanB, speed, star3);
  const ghostBar = ghost ? h('div', 'gf-ghostbar', `${icon('eye')}<span>看墨子怎么守</span>`) : null; if (ghostBar) hud.appendChild(ghostBar);
  if (ghost) star3.style.display = 'none'; // the bonus is the player's; the replay's 跳过 takes its slot
  /** the kit's 跳过 pill (1-1's lesson, the ghost replay) and its spot on this layout (see placeSkip) */
  let skipOff: (() => void) | null = null; let skipEl: HTMLElement | null = null;
  // drill pieces: 开始推演 button, the budget plate and 鲁班's queue of machines per lane (the whole script laid out, §3.18)
  const goB = pz ? h('button', 'xg-btn xg-btn--primary xg-btn--lg gf-pzgo', `${icon('play')}开始推演`) : null;
  const pzQ = pz ? h('div', 'gf-pzq') : null;
  /** a drill's scroll runs to a few seconds after its last machine (its endTick keeps 90 s of slack for the kernel) */
  const pzEnd = pz ? Math.max(1, (Math.max(...pz.p.lanes.flatMap((ln) => ln.wave.map(([t]) => t))) + 6) * TPS) : 1;
  if (goB && pzQ) { hud.append(goB, pzQ); box.style.display = 'none'; star3.style.display = 'none'; }
  const SPEEDS = [0.75, 1, 1.5];
  const fastOK = ((o.level.vol ?? 1) > 1 || (o.level.idx ?? 1) >= 4) && o.level.env?.fogCol == null; // 雾关 (2-5) has no 1.5× (§3.15)
  let speedSel = ghost ? 1 : tier ? 0.75 : fastOK ? (app.save.settings.speed || 1) : Math.min(1, app.save.settings.speed || 1);
  for (const s of SPEEDS) {
    const b = h('button', 'gf-speed__b', s === 0.75 ? '慢' : s === 1 ? '1×' : '1.5×'); b.dataset.s = String(s);
    // phones show only the current speed (one button that moves on to the next on a tap); the dots say which of the three it is
    b.insertAdjacentHTML('beforeend', `<i class="gf-speed__dots" aria-hidden="true">${SPEEDS.map((x) => `<b class="${x === s ? 'is-cur' : ''}${x === 1.5 && !fastOK ? ' is-shut' : ''}"></b>`).join('')}</i>`);
    if (s === 1.5 && !fastOK) b.disabled = true;
    if (s === 1.5 && o.level.id === '1-4' && !app.save.levels['1-4']) b.insertAdjacentHTML('beforeend', '<i class="gf-new">新</i>'); // 1.5× opens from 1-4
    if (s === 1.5 && speedSel === 1.5) b.classList.add('is-flash');
    speed.appendChild(b);
  }

  // ── geometry / layers ──
  /** phone landscape: the safe insets + how many card columns the tray column needs (makeGeo sizes the board between) */
  const phIns = (l: LayoutInfo): PhoneInsets => ({ l: l.safe.left, r: l.safe.right, b: l.safe.bottom, trayCols: trayCount() > 5 ? 2 : 1 });
  let geo: Geo = makeGeo(app.layout.width, app.layout.height, app.layout.safe.top, app.dpr, phIns(app.layout));
  let atlas = atlasFor(geo.w, app.dpr);
  const stage = new Stage(stageC, atlas, geo);
  stage.setShake(app.save.settings.shake);
  stage.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (o.dev) { o.dev.setup?.(S, stage); drawStats.measure = true; }
  const cards: Record<string, HTMLButtonElement> = {}; let cardEls: HTMLButtonElement[] = [];
  let lastHud = ''; let pulseCard: string | null = null; // 1-1: the card that keeps pulsing (survives a re-layout)
  const bossBar = L.boss ? new BossBar(hud, L.boss.type, atlas, app.dpr) : null; if (L.boss) el.classList.add('has-boss');
  if (bossBar) scroll.style.display = 'none';
  const warn = new WarnHands(hud);
  // the placement cell under the finger (green = fits, ✕ = it can't go there): a DOM cell over both canvases, repainted
  // synchronously on every pointer move (see Stage.onHover)
  const cellHint = h('div', 'gf-cellhint', '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 11L29 29M29 11L11 29"/></svg>'); hud.prepend(cellHint);
  function paintHover(v: { lane: number; col: number; ok: boolean; pulse?: boolean } | null): void {
    if (!v) { cellHint.className = 'gf-cellhint'; delete cellHint.dataset.cell; return; }
    cellHint.style.transform = `translate(${Math.round(geo.x0 + v.col * geo.w)}px, ${Math.round(laneTop(geo, v.lane))}px)`;
    cellHint.style.width = `${Math.round(geo.w)}px`; cellHint.style.height = `${Math.round(geo.h)}px`;
    cellHint.className = `gf-cellhint is-on ${v.ok ? 'is-ok' : 'is-bad'}${v.pulse ? ' is-pulse' : ''}`; cellHint.dataset.cell = `${v.lane},${v.col},${v.ok ? 1 : 0}`;
  }
  stage.onHover = paintHover;

  function sizeCanvas(c: HTMLCanvasElement, g: Geo = geo): void { c.width = Math.round(g.W * g.dpr); c.height = Math.round(g.H * g.dpr); c.style.width = g.W + 'px'; c.style.height = g.H + 'px'; }
  // adaptive quality (§8.6, render/perf.ts): the first 120 running frames decide; level 2 draws the stage at DPR 1.5
  let degrade: Degrade = 0; const probe = new FrameProbe();
  const stageGeo = (): Geo => (degrade >= 2 && geo.dpr > 1.5 ? { ...geo, dpr: 1.5 } : geo);
  function applyDegrade(d: number): void {
    const was = degrade; degrade = Math.max(degrade, Math.min(3, d)) as Degrade;
    stage.particleCap = degrade >= 1 ? 100 : 200; stage.lite = degrade >= 3;
    if (degrade >= 2 && was < 2) { sizeCanvas(stageC, stageGeo()); stage.setGeo(stageGeo(), atlas); }
  }
  /** night until 天亮 (2-10 at 120 s, 2-11 at 300 s): the board is repainted at dawn under a 3 s fading night veil (§3.9) */
  const nightNow = (): boolean => !!L.env?.night && !(S.dawnAt != null && S.tick >= S.dawnAt);
  let boardNight = false;
  function paintBoard(): void {
    sizeCanvas(board); sizeCanvas(stageC, stageGeo()); boardNight = nightNow();
    const bctx = board.getContext('2d')!; drawBoard(bctx, geo, { lanes: L.lanes, night: boardNight, fogCol: L.env?.fogCol ?? null });
    // 鲁班线 for column conditions (spec §2.5)
    const c3 = L.star3 || {}; const col = typeof c3.minX === 'number' ? c3.minX : c3.minXOf ? Object.values(c3.minXOf as Record<string, number>)[0] : null;
    if (col != null && !ghost) { const x = geo.x0 + (col as number) * geo.w; bctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0); bctx.strokeStyle = 'rgba(200,55,45,0.85)'; bctx.lineWidth = 3; bctx.setLineDash([10, 8]); bctx.beginPath(); bctx.moveTo(x, geo.by + 4); bctx.lineTo(x, geo.by + geo.bh - 4); bctx.stroke(); bctx.setLineDash([]); }
  }
  function placeHud(): void {
    const g = geo; const Ts = app.layout.safe.top; const W = g.W, H = g.H; const n = trayCount();
    el.dataset.orient = g.landscape ? 'landscape' : 'portrait'; el.toggleAttribute('data-phone', g.phone);
    lubanB.style.right = ''; lubanB.style.maxWidth = ''; // (the phone layout anchors his bubble on the right)
    if (g.phone) { // phone landscape (Dad's phone, 2026-10-08): tray column · board · tools column, a thin top bar
      const sf = app.layout.safe; const lx = Math.max(8, sf.left + 4); const rx = W - Math.max(8, sf.right + 4) - PHONE.tools; const yb = H - Math.max(6, sf.bottom);
      // top bar: [🏠 kit][粮斗][墨子][his bubble …][再听][附加题], the bamboo scroll under it. The 附加题 slip gets what the
      // bubble can spare (QA fb1 r1): its condition on one line over 附 · logs · count; on the narrowest phones (iPhone SE
      // 568 wide) just 附 · the count · logs — a tap reads the condition and 墨子's bubble shows it whole
      const tb0 = Math.max(12, sf.left) + 56 + 8, tb1 = rx - 6; const bx0 = tb0 + 142;
      const spare = tb1 - tb0 - (84 + 6 + 46 + 6 + 6 + 44 + 6); const compact = spare < 300; // (bubble + slip share it)
      const s3W = compact ? (goB ? 124 : ghost ? 112 : 88) : Math.min(204, spare - 150); star3.dataset.fit = compact ? 'compact' : 'full'; // (a drill's 开始推演 / the ghost's 跳过 take that slot)
      px(bin, tb0, Ts + 6, 84, 46); px(moziA, tb0 + 90, Ts + 6, 46, 46);
      px(star3, tb1 - s3W, Ts + 6, s3W, 46); px(replay, tb1 - s3W - 6 - 44, Ts + 7, 44, 44);
      px(moziB, bx0, Ts + 6, tb1 - s3W - 56 - bx0, 46); moziB.style.height = ''; moziB.style.minHeight = '46px';
      px(scroll, tb0, Ts + 56, tb1 - tb0, 16);
      // tools column (QA fb1 r1: it has to fit a 320-px-high screen): 鲁班 · ⏸ at the top; 机关匣 · 铲子 · the speed (one
      // button: 慢 → 1× → 1.5×) stacked up from the bottom, where the thumb is
      px(lubanA, rx + 4, Ts + 6, 48, 48); px(pauseB, rx + 4, Ts + 60, 48, 48);
      const sy = Math.max(Ts + 114 + 62 + 6 + 48 + 6, yb - 48); px(speed, rx + 4, sy, 48, 48); px(shovel, rx + 4, sy - 54, 48, 48); px(box, rx, sy - 54 - 68, PHONE.tools, 62);
      // 鲁班's bubble: one line as long as his line, right beside him over the bamboo scroll — never over lane 1 (the
      // board starts at T+86 at the earliest), never takes a tap (QA fb1 r1)
      Object.assign(lubanB.style, { left: 'auto', right: `${W - (rx - 6)}px`, top: `${Ts + 52}px`, width: 'auto', height: '', minHeight: '', maxWidth: `${rx - 6 - tb0}px` });
      // the tray column under the 🏠: one card wide, two when the deck has more than five
      const cols = n > 5 ? 2 : 1; const cw = cols > 1 ? PHONE.card2 : PHONE.card; const rows = Math.ceil(Math.max(n, 1) / cols); const top0 = Math.max(12, Ts) + 56 + 8;
      const ch = Math.max(44, Math.min(56, Math.floor((yb - top0 + PHONE.gap) / rows) - PHONE.gap)); const th = rows * ch + (rows - 1) * PHONE.gap;
      px(tray, lx, top0 + Math.max(0, Math.floor((yb - top0 - th) / 2)), cols * cw + (cols - 1) * PHONE.gap, th); tray.style.transform = '';
      tray.style.setProperty('--cw', cw + 'px'); tray.style.setProperty('--ch', ch + 'px');
      if (ghostBar) px(ghostBar, Math.round(g.bx + g.bw / 2 - 110), Ts + 51, 220, 26);
      if (goB) px(goB, tb1 - s3W, Ts + 4, s3W, 50); // 开始推演 takes the 附加题 slot (hidden in a drill)
    } else if (g.landscape) {
      px(bin, 84, Ts + 8, 120, 96);
      const cw = 84, gap = 6; px(tray, 212, Ts + 8, Math.max(n, 1) * (cw + gap) - gap, 96); tray.style.transform = '';
      const right = W - 8; px(pauseB, right - 64, Ts + 24, 64, 64); px(box, right - 64 - 6 - 88, Ts + 8, 88, 96); px(shovel, right - 64 - 6 - 88 - 6 - 64, Ts + 24, 64, 64);
      px(scroll, 84, Ts + 108, W - 84 - 8, 32);
      const yb = g.by + g.bh + 14; const hb = Math.max(72, Math.min(92, H - yb - 8));
      const spW = 3 * 64, s3W = 168; const bubW = Math.max(240, Math.min(400, W - (12 + hb + 8) - (6 + 52) - (14 + s3W) - (12 + spW) - (14 + hb + 12)));
      px(moziA, 12, yb, hb, hb); px(moziB, 12 + hb + 8, yb + 4, bubW, hb - 8); const rx = 12 + hb + 8 + bubW + 6; px(replay, rx, yb + (hb - 52) / 2, 52, 52);
      // 墨子 · 附加题竹简 · speed · 鲁班: the bonus slip sits next to 墨子's side, so 鲁班's bubble (which opens beside his own
      // portrait, over the speed control for its few seconds — it takes no taps) never hides the live bonus progress (QA r5)
      const s3x = rx + 52 + 14, spx = s3x + s3W + 12;
      px(star3, s3x, yb + (hb - 76) / 2, s3W, 76); px(speed, spx, yb + (hb - 60) / 2, spW, 60);
      px(lubanA, W - 12 - hb, yb, hb, hb);
      // never over lane 5; a long line grows the bubble downwards into the free strip under the bar
      const lx = spx - 4; px(lubanB, lx, yb + 4, Math.max(150, W - 12 - hb - 8 - lx), hb - 8); lubanB.style.height = ''; lubanB.style.minHeight = hb - 8 + 'px';
      if (ghostBar) px(ghostBar, Math.round(W / 2 - 150), Ts + 104, 300, 40);
    } else {
      px(bin, 84, Ts + 8, 128, 72); px(scroll, 220, Ts + 24, W - 220 - 80, 40); px(pauseB, W - 8 - 64, Ts + 12, 64, 64);
      px(box, 12, Ts + 92, 120, 60); px(star3, 144, Ts + 88, Math.min(320, W - 144 - 140), 64); px(lubanA, W - 12 - 56, Ts + 94, 56, 56); px(lubanB, W - 12 - 56 - 8 - 220, Ts + 96, 220, 52); lubanB.style.minHeight = '';
      // tray band T+586..T+854 (spec §2.2): a one-row tray sits mid-band with the tools beside it, and 墨子's row stays at
      // T+878 whatever the card count (on 1-1..1-4 it used to ride up under the speed stack)
      const ty = g.by + g.bh + 24; const cw = 120, chh = 128, gap = 12; const cols = L.belt ? 3 : Math.min(4, Math.max(n, 1)); const rows = n > cols ? 2 : 1;
      const band = 2 * chh + gap; const th = rows * chh + (rows - 1) * gap; const tw = cols * cw + (cols - 1) * gap;
      // a one-row tray (≤ 4 cards) is drawn 1.2× so the band between the board and 墨子 is used (QA r2: empty bands)
      const ks = !L.belt && rows === 1 ? 1.2 : 1; const cx = Math.round(W / 2), cy = ty + Math.round(band / 2);
      px(tray, Math.round(cx - tw / 2), Math.round(cy - th / 2), tw, th); tray.style.transform = ks !== 1 ? `scale(${ks})` : ''; tray.style.transformOrigin = '50% 50%';
      const tx = Math.round(cx - (tw * ks) / 2), tw2 = Math.round(tw * ks);
      px(shovel, Math.max(8, tx - 12 - 80), ty + Math.round((band - 72) / 2), 72, 72); px(speed, Math.min(W - 8 - 72, tx + tw2 + 12), ty + Math.round((band - 192) / 2), 72, 3 * 64);
      const my = Math.max(ty + th + 20, Math.min(ty + band + 24, H - 8 - 112)); const mh = Math.max(80, Math.min(112, H - my - 8));
      px(moziA, 12, my, mh, mh); px(moziB, 12 + mh + 8, my + 4, Math.min(600, W - mh - 100), mh - 8); px(replay, W - 8 - 56, my + (mh - 56) / 2, 56, 56);
      if (ghostBar) px(ghostBar, 220, Ts + 24, W - 300, 40);
    }
    if (bossBar) { const r = scroll.style; px(bossBar.el, parseFloat(r.left), parseFloat(r.top), parseFloat(r.width), parseFloat(r.height)); }
    if (goB && !g.phone) { // the 开始推演 button takes the speed + 附加题 slot while laying out (speed is hidden until the drill runs)
      if (g.landscape) { const sp = speed.style, sr = star3.style; const x0 = parseFloat(sp.left), x1 = parseFloat(sr.left) + parseFloat(sr.width); const bw = Math.min(280, x1 - x0); px(goB, Math.round((x0 + x1 - bw) / 2), parseFloat(sp.top) - 6, bw, 72); }
      else px(goB, Math.round(W / 2 - 120), Ts + 86, 240, 66);
    }
    if (pzQ) buildQueue();
    moziA.replaceChildren(portrait('mozi', moziA.offsetWidth || 88, geo.dpr, 'calm'));
    lubanA.replaceChildren(portrait('luban', lubanA.offsetWidth || 88, geo.dpr, 'think'));
    stage.partsBox = { x: box.offsetLeft + box.offsetWidth / 2, y: box.offsetTop + box.offsetHeight / 2 };
    stage.grainBin = { x: bin.offsetLeft + bin.offsetWidth / 2, y: bin.offsetTop + bin.offsetHeight / 2 };
    buildTray(); placeSkip();
  }
  /** 跳过's spot: in 1-1 on the boarded-up 第 5 路 at the board's right end (the HUD keeps its corners); in the ghost
   *  replay on the 附加题 slot (hidden there) */
  function placeSkip(): void {
    if (!skipEl) return; const g = geo; let top: number, right: number;
    if (ghost) { const r = star3.style; top = parseFloat(r.top) + (parseFloat(r.height) - 56) / 2; right = g.W - parseFloat(r.left) - parseFloat(r.width); }
    else { top = laneTop(g, 4) + (g.h - 56) / 2; right = g.W - (g.bx + g.bw) + Math.round(g.w * 0.2); }
    skipEl.style.setProperty('--xg-skip-top', `${Math.round(top)}px`); skipEl.style.setProperty('--xg-skip-right', `${Math.round(right)}px`);
  }
  // the rack (1-6 驿马 levels) always shows its 6 pegs; normal levels show the deck
  function trayCount(): number { return L.belt ? (L.belt.cap || 6) : S.loadout.length; }
  function trayCards(): string[] { return L.belt ? S.belt.slice() : S.loadout.slice(); }
  let beltSeen = S.beltI; let beltKey = '';
  function buildTray(): void {
    tray.replaceChildren(); for (const k in cards) delete cards[k]; cardEls = [];
    const g = geo; const size = g.phone ? 40 : g.landscape ? 64 : 88; const list = trayCards();
    for (let i = 0; i < trayCount(); i++) {
      const c = list[i];
      if (!c) { tray.appendChild(h('div', 'gf-card gf-card--peg')); continue; }
      const b = h('button', 'gf-card'); b.dataset.card = c;
      b.append(rigIcon(atlas, c, size, g.dpr));
      b.insertAdjacentHTML('beforeend', `${L.belt ? '' : `<span class="gf-card__cost">${UNITS[c].cost}</span>`}<span class="gf-card__cd"></span><span class="gf-card__short"></span>${c === o.level.newCard ? '<span class="gf-card__new">新</span>' : ''}<span class="gf-card__glass"></span>`);
      b.addEventListener('pointerdown', (ev) => startCardDrag(c, ev));
      if (pulseCard === c) b.classList.add('is-pulse');
      tray.appendChild(b); cardEls.push(b); if (!cards[c]) cards[c] = b;
    }
    beltKey = S.belt.join(); lastHud = '';
  }
  /** 鲁班's machines waiting in each lane's exit strip, in arrival order (they leave the queue as they come out) */
  function buildQueue(): void {
    if (!pz || !pzQ) return; pzQ.replaceChildren(); const g = geo; const sz = Math.floor(Math.min((g.spawnW - 10) / 3, (g.h - 10) / 2));
    for (const ln of pz.p.lanes) {
      const box2 = h('div', 'gf-pzq__lane'); px(box2, g.x0 + 8 * g.w + 2, laneTop(g, ln.lane) + 3, g.spawnW - 4, g.h - 6);
      ln.wave.forEach(([t, k]) => { const i = h('i', 'gf-pzq__m'); i.dataset.t = String(t); i.style.width = i.style.height = sz + 'px'; i.append(rigIcon(atlas, k === 'swarm' ? 'ant' : k, Math.round(sz * 0.92), g.dpr)); box2.appendChild(i); });
      pzQ.appendChild(box2);
    }
    // the whole drill's timeline across the top scroll (spec §2.2/§3.18): every machine at the second it comes out, so
    // the child sees WHEN as well as which lane (the exit-strip queues above) — QA r5
    scroll.querySelectorAll('.gf-scroll__m').forEach((x) => x.remove());
    const all = pz.p.lanes.flatMap((ln) => ln.wave.map(([t, k]) => ({ t, k, lane: ln.lane }))).sort((a, b) => a.t - b.t);
    const seen: number[] = [];
    for (const m of all) {
      const i = h('i', 'gf-scroll__m'); const f = Math.min(1, (m.t * TPS) / pzEnd); const stack = seen.filter((t) => Math.abs(t - f) < 0.035).length; seen.push(f);
      i.style.left = `calc(${f * 100}% - 14px)`; i.style.top = `${-6 + Math.min(stack, 2) * 7}px`; i.dataset.t = String(m.t * TPS);
      i.append(rigIcon(atlas, m.k === 'swarm' ? 'ant' : m.k, 28, g.dpr)); scroll.appendChild(i);
    }
  }
  paintBoard(); placeHud();

  // ── state ──
  const queue: Action[] = [];
  let selected: string | null = null; let shovelMode = false;
  let paused = false; let ended = false; let destroyed = false;
  let acc = 0; let last = performance.now(); let raf = 0; const hold: SpeedHold = { slowUntil: 0, phaseUntil: 0 };
  const mem: CoachMemory = makeCoachMemory(app.save.coach.followed);
  let pendingLine: (CoachLine & { at: number }) | null = null;
  let autoHint: { card: string; lane: number; col: number; until: number } | null = null; let autoSaid = false;
  let checkpoint: Snapshot | null = o.checkpoint && o.resume && !o.restore && o.checkpoint.snap.tick <= S.tick ? o.checkpoint.snap : null; let checkpointFlag = checkpoint ? o.checkpoint!.flag : 0;
  const seenKinds = new Set<string>(); let kills = 0; let lubanQuietUntil = 0; let asked = 0;
  const hintTicks: number[] = [];
  let s3ok = false, s3lost = false; let beltFullSeen = S.stats.beltFull; let beltFullSaidAt = -1e9;
  // 1-1's lesson (spec §2.4) runs until 1-1 has been won once or the lesson was skipped (跳过, Dad 2026-10-08); 设置 →
  // 新手教学 plays it again; the parent's 跳过开场和教学 turns it off. The level itself always stays: it is the first puzzle.
  const lesson = o.level.id === '1-1' && !o.resume && !ghost && !pz && (!!o.tutorial || (!app.save.story.includes('tut.1-1') && !shouldAutoSkip()));
  let tut = lesson ? { phase: 0, at: 0, placedAt: -1, collected: false, firstGone: false, idle: 0, pulse: false } : null;
  let actLog: [number, Action[]][] = []; let logFrom = S.tick; let curSeed = o.seed;
  let firstHintTick = -1, firstPlaceTick = -1; let deferred: { l: CoachLine; at: number } | null = null;
  // (跳过开场和教学 counts as the fast track: teaching levels show the hand only after 5 s of hesitation)
  let fastHands = (!!app.save.fastTrack || shouldAutoSkip()) && o.level.type === 'teach' && !tier && !ghost;
  let hooking = false; let hookDone: (() => void) | null = null;

  // ── voice / bubbles ──
  // 墨子's bubble closes 6 s after his line has been spoken (spec §2.5), and at once when the instruction is done
  let bubbleTimer = 0; let bubbleTok = 0;
  function hideMozi(): void { clearTimeout(bubbleTimer); bubbleTok++; moziB.classList.remove('is-on'); }
  function mozi(id: string | null, interrupt = false, vars?: Record<string, string | number>): void {
    if (!id) return; moziB.querySelector('.t')!.textContent = app.voice.text(id, vars); moziB.dataset.line = id; if (vars) moziB.dataset.vars = JSON.stringify(vars); else delete moziB.dataset.vars; moziB.classList.add('is-on'); clearTimeout(bubbleTimer); const tok = ++bubbleTok;
    bubbleTimer = window.setTimeout(hideMozi, 15000); // safety net if the line never reports its end
    void app.voice.say(id, { interrupt, vars }).finally(() => { if (tok !== bubbleTok || destroyed) return; clearTimeout(bubbleTimer); bubbleTimer = window.setTimeout(hideMozi, 6000); });
  }
  let lubanTimer = 0;
  /** 鲁班 speaks in his own voice (role luban clips): turning-point lines (`narrate`: Boss, phases) always queue; a bark
   *  while someone is already talking stays a bubble, so he never talks over 墨子. Without a clip (manifest not loaded
   *  yet) his bubble types out with a wooden click per syllable and turning points are read by the narrator
   *  ("鲁班说：……", the spec §7.3 fallback). The bubble's typewriter follows the length of his clip. */
  function luban(id: string, narrate = false): void {
    const txt = app.voice.text(id); if (!txt) return; const t = lubanB.querySelector('.t')!; t.textContent = ''; lubanB.dataset.full = txt; lubanB.classList.add('is-on'); lubanA.classList.add('is-talking');
    const nar = 'fort.nar.' + id.slice(5);
    const own = !ghost && app.voice.hasClip(id) && (narrate || !app.voice.narrator.speaking);
    if (own) { void app.voice.say(id); lubanB.dataset.line = id; }
    else {
      if (narrate && !ghost && app.voice.text(nar)) void app.voice.say(nar);
      if (app.voice.hasClip(id)) lubanB.dataset.line = id; else if (app.voice.text(nar)) lubanB.dataset.line = nar; else delete lubanB.dataset.line;
      sfx.babble(Math.min(6, Math.ceil(txt.length / 3)));
    }
    const per = own ? Math.max(55, Math.min(240, (app.voice.clipMs(id) - 300) / txt.length)) : 55;
    let i = 0; clearInterval(lubanTimer);
    lubanTimer = window.setInterval(() => { t.textContent = txt.slice(0, ++i); if (i >= txt.length) { clearInterval(lubanTimer); setTimeout(() => { lubanB.classList.remove('is-on'); lubanA.classList.remove('is-talking'); }, own ? 1800 : 2600); } }, per);
  }
  replay.addEventListener('click', () => { app.voice.narrator.replay(); });
  moziA.addEventListener('click', () => { // 「墨子，怎么办？」
    if (ghost) return;
    const l = askLine(S, mem); asked++; hintTicks.push(S.tick); if (!l) return;
    // concept fallback: subtitle = the voiced line itself (QA r4 major). No per-tap session mark: `asked` rides on
    // gf-level, and a mark per tap would rewrite the whole session log and could fill its 200-event cap (QA r4 tech).
    if (l.type === 'concept') mozi(conceptLineId(o.level), true);
    else { mozi(coachLineId(l), true); showHint(l); }
  });
  // tap the 附加题 chip → this level's condition, read aloud (fort.bonus.<关>); the chip itself is the subtitle
  star3.addEventListener('click', () => {
    const id = `fort.bonus.${o.level.id}`; app.ui('ui-tap', 0.4); star3.classList.remove('is-say'); void star3.offsetWidth; star3.classList.add('is-say');
    // phones: the slip has room for the start of the condition (or only the count), so 墨子's bubble shows it whole while it is read
    if (geo.phone && app.voice.text(id)) { mozi(id, true); return; }
    if (app.voice.text(id)) void app.voice.say(id, { interrupt: true }); else mozi('fort.ui.star3rule');
  });
  star3.querySelector('.gf-star3__t')!.textContent = o.level.star3Text || '';

  // ── hints: glow the card + ghost hand to the cell ──
  const hand = h('div', 'gf-hand', `<svg viewBox="0 0 64 64"><path d="M22 6c3 0 5 2 5 5v17l3-1c3-1 5 1 5 3l1 1c2-1 5 0 5 3l1 1c2-1 5 1 5 3v12c0 9-6 14-14 14h-6c-6 0-9-3-12-8L8 40c-2-3 2-6 5-4l4 4V11c0-3 2-5 5-5z" fill="#fff" stroke="#2a1b12" stroke-width="3" stroke-linejoin="round"/></svg>`); hud.appendChild(hand);
  let handAnim: Animation | null = null; let rigAnim: Animation | null = null;
  // the machine the demo hand carries, floating where a real drag shows it (spec §2.7: the drop cell is 0.6 tile above
  // the finger) — the hand ends where the real finger must lift, so copying it exactly places the card (QA r2 blocker)
  const handRig = h('div', 'gf-hand__rig'); hand.appendChild(handRig); let handRigCard = '';
  function handTo(x0: number, y0: number, x1: number, y1: number, iterations = 2, card = ''): void {
    handAnim?.cancel(); rigAnim?.cancel(); hand.style.display = 'block';
    const yl = y1 + geo.h * 0.6; // the fingertip at lift: dropCell() reads y − 0.6 tile → the cell centre (x1, y1)
    hand.dataset.kind = "drag"; hand.dataset.tip = `${Math.round(x1)},${Math.round(yl)}`; hand.dataset.cell = `${Math.round(x1)},${Math.round(y1)}`;
    const s = geo.w * 0.95;
    if (card && card !== handRigCard) { handRigCard = card; handRig.replaceChildren(rigIcon(atlas, card, s, geo.dpr)); }
    handRig.style.display = card ? 'block' : 'none';
    // same offset as the real drag ghost (onMove): finger − (0.47 w, 0.6 h + 0.8 w); the hand's fingertip is at (22, 4)
    handRig.style.left = `${Math.round(22 - geo.w * 0.47)}px`; handRig.style.top = `${Math.round(4 - geo.h * 0.6 - geo.w * 0.8)}px`;
    const dur = 1900, it = iterations;
    handAnim = hand.animate([{ transform: `translate(${x0 - 22}px, ${y0 - 4}px) scale(1)`, opacity: 0 }, { transform: `translate(${x0 - 22}px, ${y0 - 4}px) scale(.9)`, opacity: 1, offset: 0.12 }, { transform: `translate(${x0 - 22}px, ${y0 - 4}px) scale(.9)`, opacity: 1, offset: 0.2 }, { transform: `translate(${x1 - 22}px, ${yl - 4}px) scale(.9)`, opacity: 1, offset: 0.68 }, { transform: `translate(${x1 - 22}px, ${yl - 4}px) scale(.9)`, opacity: 1, offset: 0.76 }, { transform: `translate(${x1 - 22}px, ${yl + 6}px) scale(1)`, opacity: 0 }], { duration: dur, iterations: it, easing: 'ease-in-out' });
    if (card) rigAnim = handRig.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 0, transform: 'scale(.6)', offset: 0.12 }, { opacity: 0.92, transform: 'scale(1)', offset: 0.2 }, { opacity: 0.92, transform: 'scale(1)', offset: 0.74 }, { opacity: 1, transform: `translateY(${Math.round(geo.h * 0.12)}px) scale(1.06,.9)`, offset: 0.8 }, { opacity: 0, transform: `translateY(${Math.round(geo.h * 0.12)}px) scale(1)` }], { duration: dur, iterations: it, easing: 'ease-in-out' });
    handAnim.onfinish = () => { hand.style.display = 'none'; };
  }
  /** the child took over (pressed a card, placed, or tapped the bag): the demo hand and the rig it carries go away */
  function stopHand(): void { handAnim?.cancel(); rigAnim?.cancel(); handAnim = rigAnim = null; hand.style.display = 'none'; }
  function handTap(x: number, y: number): void {
    handAnim?.cancel(); rigAnim?.cancel(); handRig.style.display = 'none'; hand.style.display = 'block'; hand.dataset.tip = `${Math.round(x)},${Math.round(y)}`; hand.dataset.kind = 'tap';
    handAnim = hand.animate([{ transform: `translate(${x - 22}px, ${y + 10}px) scale(1)`, opacity: 0 }, { transform: `translate(${x - 22}px, ${y - 4}px) scale(.88)`, opacity: 1, offset: 0.4 }, { transform: `translate(${x - 22}px, ${y - 4}px) scale(1)`, opacity: 1, offset: 0.7 }, { transform: `translate(${x - 22}px, ${y + 10}px)`, opacity: 0 }], { duration: 1100, iterations: 3 });
    handAnim.onfinish = () => { hand.style.display = 'none'; };
  }
  const cellXY = (lane: number, col: number): { x: number; y: number } => ({ x: geo.x0 + (col + 0.5) * geo.w, y: laneTop(geo, lane) + geo.h * 0.55 });
  function showHint(l: CoachLine): void {
    if (l.card == null || l.lane == null || l.col == null) return;
    hintTicks.push(S.tick); if (firstHintTick < 0) firstHintTick = S.tick;
    const card = cards[l.card]; if (card) { card.classList.add('is-hint'); setTimeout(() => card.classList.remove('is-hint'), 6000); }
    const t = cellXY(l.lane, l.col);
    if (card) { const c = cardXY(card); handTo(c.x, c.y, t.x, t.y, 2, l.card); } else handTap(t.x, t.y);
  }
  /** a tray card's centre in HUD coordinates (the card sits inside the positioned tray: add the tray's offset) */
  function cardXY(b: HTMLElement): { x: number; y: number } { const r = b.getBoundingClientRect(), hr = hud.getBoundingClientRect(); return { x: r.left - hr.left + r.width / 2, y: r.top - hr.top + r.height / 2 }; }

  // ── input ──
  const cellAt = (x: number, y: number): { lane: number; col: number } | null => {
    const c = Math.floor((x - geo.x0) / geo.w), l = Math.floor((y - geo.by) / geo.h);
    return c >= 0 && c < 8 && l >= 0 && l < 5 ? { lane: l, col: c } : null;
  };
  /** placement forgiveness (QA r5): a card put down on a CLOSED lane next to an open one goes to that open lane, same
   *  column — in 1-1 (one open lane) a finger a little high or low in lane 3 must not end in a red ✕ on the boards */
  const openCellAt = (x: number, y: number): { lane: number; col: number } | null => {
    const c = cellAt(x, y); if (!c || L.lanes[c.lane]) return c;
    const fy = (y - geo.by) / geo.h - 0.5; let best = -1, bd = 1.01;
    for (let l = 0; l < 5; l++) if (L.lanes[l] && Math.abs(l - fy) < bd) { bd = Math.abs(l - fy); best = l; }
    return best < 0 ? c : { lane: best, col: c.col };
  };
  const why = (card: string, lane: number, col: number): string | null => canPlace(S, card, lane, col);
  function tryPlace(card: string, lane: number, col: number, quiet = false): boolean {
    if (ghost) return false;
    if (pz && !setup) { app.ui('ui-locked', 0.5); return false; } // the drill runs on its own once started
    const r = why(card, lane, col);
    if (pz) {
      if (r) { if (!quiet) { app.ui('ui-locked', 0.6); flashReason(card, r); } return false; }
      placed.push({ card, lane, col }); S = pzState(); stage.reset(); lastHud = '';
      sfx.play(card === 'spikes' ? 'place.spikes' : card === 'pit' ? 'place.pit' : 'place', { lane }); return true;
    }
    // one action per card and per cell per tick (the kernel would reject the 2nd; say so before it happens)
    const dup = queue.some((a) => a.t === 'place' && ((a.lane === lane && a.col === col) || (!L.belt && a.card === card)));
    if (r) { app.ui('ui-locked', 0.6); flashReason(card, r); return false; }
    if (dup) return false; // a double tap: the first placement is already queued — no error flash for the second
    queue.push({ t: 'place', card, lane, col }); stopHand();
    // spec §2.7 rule ①: a grain bag resting on that cell is collected on the way (顺手收掉)
    for (const d of S.drops) { const dc = stage.dropCell(S, d); if (dc.lane === lane && dc.col === col && S.tick - d.t >= 12) { const p = stage.dropXY(S, d, performance.now()); collect(d.id, p.x, p.y); } }
    if (pendingLine && pendingLine.card === card && pendingLine.lane === lane) { followed(mem, pendingLine); app.save.coach.followed = { ...mem.lifetime }; pendingLine = null; }
    if (autoHint && autoHint.card === card) { autoHint = null; stage.hover = restHover(); }
    if (tut && tut.placedAt < 0) { tut.placedAt = S.tick; pulseOff(); hideMozi(); }
    if (firstPlaceTick < 0) firstPlaceTick = S.tick;
    return true;
  }
  function flashReason(card: string, r: string): void {
    const b = cards[card]; if (!b) return; b.classList.remove('is-no'); void b.offsetWidth; b.classList.add('is-no');
    if (r === 'grain') setShort(b.querySelector('.gf-card__short') as HTMLElement, UNITS[card].cost - S.grain);
  }
  function select(card: string | null): void { selected = card; for (const b of cardEls) b.classList.toggle('is-sel', b.dataset.card === card); if (card) setShovel(false); }
  function setShovel(on: boolean): void { shovelMode = on; shovel.classList.toggle('is-on', on); if (on) select(null); }
  shovel.addEventListener('click', () => { if (ghost) return; setShovel(!shovelMode); app.ui('ui-select', 0.5); });
  // drag a card (finger offset: the drop cell is 0.6 tile above the finger, spec §2.7)
  // every gesture remembers its pointerId: only that finger moves / ends it (spec §2.7 — the first finger only; a palm or
  // a second finger is ignored), and a cancelled gesture puts nothing down
  let drag: { card: string; ghost: HTMLElement; moved: boolean; x0: number; y0: number; pid: number; bad: boolean } | null = null;
  let tdrag: { ghost: HTMLElement; pid: number } | null = null; // 机关令 being dragged from the box
  let press: { id: number; k: string; x: number; y: number; timer: number; pid: number } | null = null; // long-press → mark
  /** the cell glow while no finger is on the board: 墨子's 二档 hand, or the 1-1 pulse after two idle demos */
  function restHover(): { lane: number; col: number; ok: boolean; pulse?: boolean } | null { return autoHint ? { lane: autoHint.lane, col: autoHint.col, ok: true } : tut?.pulse ? { lane: 2, col: 1, ok: true, pulse: true } : null; }
  function pulseOn(): void { if (!tut || tut.pulse) return; tut.pulse = true; pulseCard = 'shooter'; cards.shooter?.classList.add('is-pulse'); if (!drag) stage.hover = restHover(); }
  function pulseOff(): void { if (!tut?.pulse) return; tut.pulse = false; pulseCard = null; for (const b of cardEls) b.classList.remove('is-pulse'); if (!drag) stage.hover = restHover(); }
  function startCardDrag(card: string, ev: PointerEvent): void {
    if (paused || ended || ghost || hooking || !ev.isPrimary || drag || tdrag) return; ev.preventDefault();
    const gh = h('div', 'gf-dragghost'); gh.append(rigIcon(atlas, card, geo.w * 0.95, geo.dpr)); hud.appendChild(gh);
    stopHand(); drag = { card, ghost: gh, moved: false, x0: ev.clientX, y0: ev.clientY, pid: ev.pointerId, bad: false }; onMove(ev);
    app.ui('ui-pick', 0.5);
  }
  const local = (ev: PointerEvent): { x: number; y: number } => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  function dropCell(ev: PointerEvent, forgive = false): { lane: number; col: number } | null { const p = local(ev); return (forgive ? openCellAt : cellAt)(p.x, p.y - geo.h * 0.6); }
  const unitAt = (c: { lane: number; col: number } | null): boolean => !!c && S.units.some((u) => u.lane === c.lane && u.col === c.col && !u.dead);
  function onMove(ev: PointerEvent): void {
    if (press && ev.pointerId === press.pid && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 14) { clearTimeout(press.timer); press = null; }
    if (tdrag) { if (ev.pointerId !== tdrag.pid) return; const p = local(ev); tdrag.ghost.style.transform = `translate(${p.x - 30}px, ${p.y - geo.h * 0.6 - 30}px)`; const c = dropCell(ev); stage.hover = c ? { ...c, ok: unitAt(c) } : null; return; }
    if (!drag || ev.pointerId !== drag.pid) return; const p = local(ev);
    if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 10) drag.moved = true;
    drag.ghost.style.transform = `translate(${p.x - geo.w * 0.47}px, ${p.y - geo.h * 0.6 - geo.w * 0.8}px)`;
    const c = drag.moved ? dropCell(ev, true) : null; const ok = !c || why(drag.card, c.lane, c.col) === null; stage.hover = c ? { ...c, ok } : restHover();
    if (drag.bad === ok) { drag.bad = !ok; drag.ghost.classList.toggle('is-bad', !ok); } // the ghost covers the cell: it shows the ✕ too
  }
  function onUp(ev: PointerEvent): void {
    if (press) { if (ev.pointerId !== press.pid) return; clearTimeout(press.timer); const p = press; press = null; infoMachine(p.k, p.id); return; }
    if (tdrag) { if (ev.pointerId !== tdrag.pid) return; const t = tdrag; tdrag = null; t.ghost.remove(); stage.hover = restHover(); const c = dropCell(ev); if (c && unitAt(c)) { queue.push({ t: 'token', lane: c.lane, col: c.col }); app.ui('lock-in', 0.6); } else app.ui('bump', 0.4); return; }
    if (!drag || ev.pointerId !== drag.pid) return; const d = drag; drag = null; d.ghost.remove(); stage.hover = restHover();
    if (!d.moved) {
      // 二档: tapping the glowing card confirms 墨子's hand (spec §3.20)
      if (autoHint && autoHint.card === d.card && performance.now() < autoHint.until) { tryPlace(d.card, autoHint.lane, autoHint.col); return; }
      select(selected === d.card ? null : d.card); app.ui('ui-tap', 0.5); return;
    }
    const c = dropCell(ev, true); if (c) tryPlace(d.card, c.lane, c.col); else app.ui('bump', 0.4);
  }
  /** a cancelled gesture (system edge swipe, Control Center, a notification) places nothing, spends nothing, opens nothing */
  function onCancel(ev: PointerEvent): void {
    if (press && ev.pointerId === press.pid) { clearTimeout(press.timer); press = null; }
    if (tdrag && ev.pointerId === tdrag.pid) { tdrag.ghost.remove(); tdrag = null; stage.hover = restHover(); }
    if (drag && ev.pointerId === drag.pid) { drag.ghost.remove(); drag = null; stage.hover = restHover(); }
  }
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel);
  box.addEventListener('pointerdown', (ev) => {
    if (paused || ended || ghost || hooking || !ev.isPrimary || drag || tdrag) return;
    if (S.tokens <= 0) { app.ui('ui-locked', 0.4); box.classList.remove('is-no'); void box.offsetWidth; box.classList.add('is-no'); return; }
    ev.preventDefault(); const t = h('div', 'gf-dragtoken', '令'); hud.appendChild(t); tdrag = { ghost: t, pid: ev.pointerId }; onMove(ev); app.ui('ui-pick', 0.5);
  });
  stageC.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || ended || ghost || hooking || drag || tdrag) return; const { x, y } = local(ev);
    const cell = cellAt(x, y);
    if (paused) return;
    if (pz && setup && cell && !selected) { // 拿起来换个位置 (or put it back in the box): full refund before the drill starts
      const i = placed.findIndex((q) => q.lane === cell.lane && q.col === cell.col);
      if (i >= 0) { const q = placed.splice(i, 1)[0]; const dig = shovelMode; S = pzState(); stage.reset(); lastHud = ''; setShovel(false); sfx.play('refund', { lane: q.lane }); if (!dig) startCardDrag(q.card, ev); return; }
    }
    // grain first (hit area 64×64) — also with a card in hand: the bag is taken, and the card goes down too when it can
    // (spec §2.7 rule ①); a tap on a bag never just fails with 还差 N粮 (QA r3)
    const bag = S.drops.map((d) => ({ d, p: stage.dropXY(S, d, performance.now()) })).find(({ p }) => Math.abs(p.x - x) < 34 && Math.abs(p.y - y) < 34);
    if (bag) collect(bag.d.id, bag.p.x, bag.p.y);
    if (selected && cell) { const oc = openCellAt(x, y) ?? cell; if (tryPlace(selected, oc.lane, oc.col, !!bag)) select(null); return; }
    if (bag) return;
    if (shovelMode && cell) { const u = S.units.find((q) => q.lane === cell.lane && q.col === cell.col); if (u) { queue.push({ t: 'shovel', lane: cell.lane, col: cell.col }); void 0; } setShovel(false); return; }
    // a machine → its card on release; holding 0.5 s marks it (spec §3.12.1: a tap never marks)
    for (const e of S.enemies) {
      if (e.gone || e.hp <= 0) continue; const p = stage.enemyXY(e, 1);
      if (Math.abs(p.x - x) < geo.w * 0.45 + 12 && y < p.y + 12 && y > p.y - geo.h * 0.95 - 12) {
        const id = e.id, k = e.k;
        press = { id, k, x: ev.clientX, y: ev.clientY, pid: ev.pointerId, timer: window.setTimeout(() => { if (!press) return; press = null; queue.push({ t: 'mark', id: S.mark === id ? 0 : id }); app.ui('lock-in', 0.6); sfx.play('seal.stamp', { vol: 0.6 }); }, 500) };
        return;
      }
    }
  });
  const taken = new Set<number>(); // a bag is collected once, however many taps / placements reach it before the next tick
  function collect(id: number, x: number, y: number): void {
    if (taken.has(id)) return; taken.add(id);
    queue.push({ t: 'collect', id }); sfx.collect(); if (tut && tut.phase === 4) stopHand();
    stage.fly('grainBag', 'grain', x, y, stage.grainBin.x, stage.grainBin.y, performance.now(), 450);
    if (tut) tut.collected = true;
  }
  const tip = h('div', 'gf-tip'); hud.appendChild(tip); let tipTimer = 0;
  function infoMachine(k: string, id: number): void {
    const I = ENEMY_INFO[k]; const fe = (FEARS[k] || []).filter((c) => learned(app.save.counters, k, c));
    const tags = I ? [I.mat === 'metal' ? '铜' : '木', I.wt === 'heavy' ? '重' : I.wt === 'light' ? '轻' : '中', I.layer === 'air' ? '空中' : '地面', ...I.traits.map((t) => TRAITS[t] || '')].filter(Boolean) : [];
    tip.innerHTML = `<div class="gf-tip__top"><b>${nameOf(k)}</b><button class="gf-tip__flag${S.mark === id ? ' is-on' : ''}" aria-label="标记">${icon('flag')}</button></div>
      <div class="gf-tip__tags">${tags.map((t) => `<i>${t}</i>`).join('')}</div><div class="gf-tip__fear">怕：${fe.length ? fe.map((c) => `<span class="gf-mini" data-c="${c}"></span>`).join('') : '<span class="gf-q">？</span>'}</div>`;
    tip.querySelectorAll<HTMLElement>('.gf-mini').forEach((m) => m.append(rigIcon(atlas, m.dataset.c!, 30, geo.dpr)));
    tip.classList.add('is-on'); if (!ghost) void sayCard(app, nameOf(k), fe.length && app.voice.text(`fort.alm.${k}.fear`) ? [`fort.alm.${k}.fear`] : []);
    const e = S.enemies.find((q) => q.id === id); if (e) { const p = stage.enemyXY(e, 1); tip.style.left = Math.max(8, Math.min(geo.W - 200, p.x - 90)) + 'px'; tip.style.top = Math.max(8, p.y - geo.h * 1.6) + 'px'; }
    (tip.querySelector('.gf-tip__flag') as HTMLElement).onclick = () => { queue.push({ t: 'mark', id: S.mark === id ? 0 : id }); tip.classList.remove('is-on'); app.ui('lock-in', 0.5); };
    clearTimeout(tipTimer); tipTimer = window.setTimeout(() => tip.classList.remove('is-on'), 3500);
  }
  function setSpeed(s: number): void {
    if (ghost) return; speedSel = s; if (!tier) { app.save.settings.speed = speedSel as 0.75 | 1 | 1.5; app.persist(); } speed.querySelector(`[data-s="${s}"] .gf-new`)?.remove();
    for (const x of speed.querySelectorAll<HTMLElement>('.gf-speed__b')) x.classList.toggle('is-on', +x.dataset.s! === s); // at once: on a phone it is the only button shown
    app.ui('ui-toggle-on', 0.4); lastHud = '';
  }
  // a phone shows only the current speed: a tap moves on to the next one (慢 → 1× → 1.5× → 慢; 1.5× only where it is open)
  const nextSpeed = (): number => { const open = SPEEDS.filter((s) => s !== 1.5 || fastOK); return open[(open.indexOf(speedSel) + 1) % open.length] ?? 1; };
  for (const b of speed.querySelectorAll('button')) b.addEventListener('click', () => setSpeed(geo.phone ? nextSpeed() : +(b as HTMLElement).dataset.s!));
  pauseB.addEventListener('click', () => openPause());

  // ── pause ──
  const pauseLayer = h('div', 'gf-pausel'); el.appendChild(pauseLayer);
  // spec §2.7 / §8.4: while paused he can still tap a machine to read its card (the card shows above the pause veil)
  pauseLayer.addEventListener('pointerdown', (ev) => {
    if (ev.target !== pauseLayer || !paused || ended || !ev.isPrimary) return; const { x, y } = local(ev);
    for (const e of S.enemies) {
      if (e.gone || e.hp <= 0) continue; const p = stage.enemyXY(e, 1);
      if (Math.abs(p.x - x) < geo.w * 0.45 + 12 && y < p.y + 12 && y > p.y - geo.h * 0.95 - 12) { pauseLayer.appendChild(tip); infoMachine(e.k, e.id); return; }
    }
    if (tip.parentElement === pauseLayer) tip.classList.remove('is-on');
  });
  /** continuous loops follow the board (spec §7.1: 冲车助跑 pitch, 阳燧 climb level, 蚁傅 count) */
  function loopsTick(): void {
    const ants = S.enemies.filter((e) => e.k === 'ant' && e.hp > 0 && e.x < 90000);
    sfx.setLoop('ant.chitter', Math.min(1, ants.length / 10), { lane: ants[0]?.lane });
    const rams = S.enemies.filter((e) => e.k === 'ram' && e.hp > 0 && e.run > 0); const run = rams.reduce((m, e) => Math.max(m, e.run), 0);
    sfx.setLoop('ram.roll', rams.length ? 1 : 0, { rate: Math.pow(2, Math.min(7, run / 4300) / 12), lane: rams[0]?.lane });
    const beams = S.units.filter((u) => u.k === 'beam' && u.tgt > 0); const lvl = beams.reduce((m, u) => Math.max(m, Math.min(5, 1 + Math.floor((S.tick - u.tOn) / 20))), 0);
    sfx.setLoop('beam.hum', lvl ? 0.35 + lvl * 0.13 : 0, { rate: 1 + lvl * 0.012, lane: beams[0]?.lane });
  }
  /** pause / leave snapshot; `now` = write it to IndexedDB at once (page hidden or 🏠: iOS may freeze the page before idle) */
  function suspend(now = false): Promise<void> | void { sfx.stopLoops(); if (!ghost && !ended && o.onSnap) return o.onSnap(snapshot(S), 'suspend', checkpointFlag, now); }
  const SPEED_CN = (s: number): string => (s === 0.75 ? '慢' : s === 1 ? '1×' : '1.5×');
  function openPause(now = false): void {
    if (ended || paused) return; paused = true; app.ui('ui-open', 0.5); void suspend(now);
    pauseLayer.innerHTML = `<div class="gf-pausel__panel xg-root"><div class="gf-pausel__title">${ghost ? '墨子的推演' : '推演暂停'}</div>
      ${ghost || pz ? '' : `<div class="gf-speed gf-pausel__speed" role="group" aria-label="速度">${SPEEDS.map((s) => `<button class="gf-speed__b${s === speedSel ? ' is-on' : ''}" data-s="${s}"${s === 1.5 && !fastOK ? ' disabled' : ''}>${SPEED_CN(s)}</button>`).join('')}</div>`}
      <button class="xg-btn xg-btn--primary xg-btn--lg" data-a="go">${icon('play')}继续</button>
      ${checkpoint && !ghost ? `<button class="xg-btn xg-btn--secondary" data-a="cp">${icon('flag')}从第 ${checkpointFlag} 面战鼓重来</button>` : ''}
      ${ghost ? '' : pz ? (setup ? '' : `<button class="xg-btn xg-btn--secondary" data-a="resetup">${icon('restart')}改一改阵再推</button>`) : `<button class="xg-btn xg-btn--secondary" data-a="restart">${icon('restart')}整关重来</button>`}
      <button class="xg-btn xg-btn--ghost" data-a="map">${icon(ghost ? 'back' : 'map')}${ghost ? '回去' : '回地图'}</button></div>`;
    pauseLayer.classList.add('is-on');
    pauseLayer.querySelectorAll<HTMLElement>('.gf-pausel__speed button').forEach((b) => b.addEventListener('click', () => { setSpeed(+b.dataset.s!); pauseLayer.querySelectorAll<HTMLElement>('.gf-pausel__speed button').forEach((x) => x.classList.toggle('is-on', x === b)); }));
    pauseLayer.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = (b as HTMLElement).dataset.a; pauseLayer.classList.remove('is-on'); if (tip.parentElement !== hud) { tip.classList.remove('is-on'); hud.appendChild(tip); }
      if (a === 'go') { paused = false; kick(); }
      else if (a === 'cp' && checkpoint) { const R = restoreSnap(checkpoint, L, { events: true, assist: tier }); if (R) { S = R; actLog = actLog.filter(([t]) => t < S.tick); stage.reset(); resetHud(); paused = false; kick(); } }
      else if (a === 'resetup') { resetup(); paused = false; kick(); }
      else if (a === 'restart') { curSeed = o.seed + 1; S = fresh(curSeed); actLog = []; logFrom = 0; stage.reset(); checkpoint = null; checkpointFlag = 0; resetHud(); paused = false; kick(); }
      else if (a === 'map') { if (!ghost && !pz) o.onAbandon?.({ actions: actLog, from: logFrom, tick: S.tick, seed: curSeed }); finish(null); }
    }));
  }
  /** back to the layout phase with the same placements (the drill can be rerun as often as he likes) */
  function resetup(): void { setup = true; ended = false; S = pzState(); stage.reset(); resetHud(); el.classList.add('is-setup'); goB?.classList.remove('is-gone'); for (const b of cardEls) b.classList.remove('is-locked'); buildQueue(); }
  function startDrill(): void {
    if (!pz || !setup || paused) return;
    if (!placed.length) { app.ui('ui-locked', 0.6); goB?.classList.remove('is-no'); void goB?.offsetWidth; goB?.classList.add('is-no'); mozi('fort.pz.intro', true); return; }
    setup = false; el.classList.remove('is-setup'); goB?.classList.add('is-gone'); for (const b of cardEls) b.classList.add('is-locked'); setShovel(false); select(null);
    app.ui('ui-confirm', 0.6); sfx.play('flag.drum'); last = performance.now(); acc = 0;
  }
  goB?.addEventListener('click', startDrill);
  function dawn(): void {
    const veil = h('div', 'gf-dawn'); el.insertBefore(veil, stageC); paintBoard();
    requestAnimationFrame(() => requestAnimationFrame(() => veil.classList.add('is-on'))); setTimeout(() => veil.remove(), 3600);
    if (!ghost) { mozi('fort.env.dawn'); sfx.play('dawn'); }
  }
  function resetHud(): void { lastHud = ''; hold.slowUntil = 0; hold.phaseUntil = 0; hold.slowId = undefined; s3ok = false; s3lost = false; star3.classList.remove('is-ok', 'is-lost'); beltSeen = S.beltI; beltFullSeen = S.stats.beltFull; warn.clear(); buildTray(); delete scroll.dataset.drums; scroll.querySelectorAll('.gf-scroll__drum').forEach((d) => d.remove()); }

  // ── kernel events → sound, voice, 鲁班 ──
  let owlQuietUntil = 0; let lastBolts = 0, lastLobs = 0, lastRefunds = 0, lastTokens = 0; let fireLobs: SimState['lobs'] = []; const knocked = new Set<number>();
  stage.onFx = (kind, x) => {
    if (kind === 'hit') sfx.play(x.mat === 'metal' ? 'hit.metal' : x.wt === 'heavy' ? 'hit.wood.heavy' : 'hit.wood', { lane: x.lane });
    else if (kind === 'ding') sfx.play('hit.metal', { lane: x.lane, vol: 0.8 });
    else if (kind === 'shieldCrack' || kind === 'shieldBreak') sfx.play(kind === 'shieldBreak' ? 'shield.break' : 'shield.crack', { lane: x.lane });
    else if (kind === 'unitHurt') sfx.play('unit.hurt', { lane: x.lane });
  };
  stage.onAct = (u) => sfx.play(u.k === 'gust' ? 'gust.blow' : u.k === 'hook' ? 'hook.swing' : 'radial.shoot', { lane: u.lane });
  stage.onEvent = (e: SimEvent) => {
    switch (e.type) {
      case 'spawn': if (e.k && !seenKinds.has(e.k)) {
        seenKinds.add(e.k);
        if (!ghost && (e.k === o.level.newEnemy || (o.level.newEnemy === 'swarm' && e.k === 'ant'))) { slowmoStart(hold, S.tick, e.id); namePlate(hud, geo, e.lane ?? 2, nameOf(e.k)); stinger('newMachine'); setTimeout(() => luban(tut ? 'fort.story.0.4' : 'fort.luban.first'), 600); } // 1-1: 鲁班 introduces himself with the first 木甲兵 (spec §2.4)
      } break;
      case 'gone': slowmoGone(hold, S.tick, e.id); if (e.log) sfx.play('log.crush', { lane: e.lane }); if (!e.log) { kills++; if (!e.captured) { sfx.play('machine.break', { lane: e.lane }); sfx.parts(e.k === 'ant' ? 1 : e.k === 'brute' || e.k === 'ram' ? 3 : 2); } if (!ghost && kills % 7 === 0 && performance.now() > lubanQuietUntil) { luban(`fort.luban.blocked.${1 + ((kills / 7) % 3)}`); lubanQuietUntil = performance.now() + 15000; } if (tut && !tut.firstGone) { tut.firstGone = true; setTimeout(() => mozi('fort.story.0.b1'), 900); } } break;
      case 'impact': sfx.play('ram.hit', { lane: e.lane, vol: Math.min(1, 0.55 + (e.run || 0) / 60000) }); break;
      case 'strike': sfx.play('strike.whistle', { lane: e.lane }); break;
      case 'strikeLand': sfx.play('strike.land', { lane: e.lane }); break;
      case 'log': sfx.play('log.roll', { lane: e.lane }); if (!ghost) luban('fort.luban.log'); break;
      case 'captured': sfx.play('capture', { lane: e.lane }); break;
      case 'shellOn': hold.phaseUntil = S.tick + PHASE_TICKS; sfx.play('boss.phase'); if (!ghost) luban('fort.luban.rhino.shell', true); break;
      case 'shellOff': hold.phaseUntil = S.tick + PHASE_TICKS; sfx.play('rhino.crack'); if (!ghost) luban('fort.luban.rhino.crack', true); break;
      case 'owlRage': hold.phaseUntil = S.tick + PHASE_TICKS; sfx.play('boss.phase'); break;
      case 'owlLanded': hold.phaseUntil = S.tick + PHASE_TICKS; sfx.play('boss.phase'); if (!ghost) luban('fort.luban.dawn', true); break;
      case 'owlDown': hold.phaseUntil = S.tick + PHASE_TICKS; sfx.play('boss.phase'); if (!ghost && performance.now() > owlQuietUntil) { owlQuietUntil = performance.now() + 20000; luban('fort.luban.owl.down', true); } break;
      case 'bossIn': sfx.play('boss.gong'); if (!ghost) luban(e.k === 'owl' ? 'fort.luban.owl' : 'fort.luban.rhino', true); break;
      case 'bossDone': sfx.play('boss.fold'); setTimeout(() => stinger('bossFold'), 1500); break;
      case 'ult': sfx.play('token.use', { lane: e.lane }); break;
      case 'place': sfx.play(e.card === 'spikes' ? 'place.spikes' : e.card === 'pit' ? 'place.pit' : 'place', { lane: e.lane }); break;
      case 'unitGone': if (e.why === 'shovel') { const rf = S.stats.refunds || 0; sfx.play(rf > lastRefunds ? 'refund' : 'shovel', { lane: e.lane }); lastRefunds = rf; } else if (e.why !== 'spent') sfx.play('unit.break', { lane: e.lane }); break;
      case 'stuck': sfx.play('ram.jam', { lane: S.enemies.find((q) => q.id === e.id)?.lane }); break;
      case 'chargeTele': sfx.play('rhino.stomp'); break;
      case 'dashStopped': sfx.play('ram.hit', { vol: 1 }); break;
      case 'drop': if (e.from === 'farm' || e.from === 'bank') sfx.play(e.from === 'bank' ? 'yield.bank' : 'yield.farm', { vol: 0.8 }); break;
      case 'grounded': sfx.play('flyer.down', { lane: S.enemies.find((q) => q.id === e.id)?.lane }); break;
      case 'perch': sfx.play('flyer.peck', { vol: 0.8 }); break;
      case 'cloud': sfx.play('smoke.puff', { lane: e.lane }); break;
      case 'ladderRaise': sfx.play('ladder.raise', { lane: S.enemies.find((q) => q.id === e.id)?.lane }); break;
      case 'ladderDown': sfx.play('ladder.down', { lane: S.enemies.find((q) => q.id === e.id)?.lane }); break;
      case 'drum': sfx.play('drum.beat'); break;
      case 'swoopTele': sfx.play('owl.screech'); break;
      case 'owlShadow': case 'owlUp': sfx.play('owl.flap'); break;
      default: break;
    }
  };

  // ── loop ──
  let ghostSaid = new Set<string>(); let ghostEnd = false;
  function ghostActs(): Action[] | null {
    const a = gmap.get(S.tick) ?? null; if (!a) return null;
    for (const x of a) if (x.t === 'place') {
      const k = x.card === 'farm' ? 'farm' : x.card === 'bank' ? 'bank' : x.card === 'wall' ? 'wall' : 'counter';
      if (!ghostSaid.has(k)) { ghostSaid.add(k); mozi(`fort.ghost.${k}`); }
      const card = cards[x.card]; const t = cellXY(x.lane, x.col);
      if (card) { const c = cardXY(card); handTo(c.x, c.y, t.x, t.y, 1, x.card); } else handTap(t.x, t.y);
      card?.classList.add('is-hint'); setTimeout(() => card?.classList.remove('is-hint'), 1400);
    } else if (x.t === 'collect' && !ghostSaid.has('collect')) { ghostSaid.add('collect'); mozi('fort.ghost.collect'); }
    return a;
  }
  function tickOnce(): void {
    const acts = ghost ? ghostActs() : queue.splice(0);
    if (!ghost && !pz && acts && acts.length) actLog.push([S.tick, acts.map((a) => ({ ...a }))]);
    stage.beforeStep(S, performance.now());
    const flags = S.flags || [];
    if (flags.includes(S.tick)) {
      checkpoint = snapshot(S); checkpointFlag = flags.indexOf(S.tick) + 1; // memory copy now; the caller writes it when idle
      if (!ghost) o.onSnap?.(checkpoint, 'checkpoint', checkpointFlag);
      sfx.play('flag.drum'); setTimeout(() => stinger('flag'), 1200);
      if (!ghost) luban(checkpointFlag === 1 ? (tut ? 'fort.story.0.b2' : 'fort.luban.flag.1') : 'fort.luban.flag.2');
    }
    const k0 = performance.now(); step(S, acts); const k1 = performance.now(); stepMs += k1 - k0; stepN++;
    o.dev?.tick?.(S, stage);
    stage.afterStep(S, performance.now());
    if (S.bolts.length > lastBolts) sfx.play('shoot.crossbow', { lane: S.bolts[S.bolts.length - 1].lane });
    if (S.lobs.length > lastLobs) { const l = S.lobs[S.lobs.length - 1]; sfx.play(l.fire ? 'shoot.burner' : 'shoot.lobber', { lane: l.lane }); }
    for (const l of fireLobs) if (!S.lobs.includes(l)) sfx.play('fire.burst', { lane: l.lane });
    fireLobs = S.lobs.filter((l) => l.fire); lastBolts = S.bolts.length; lastLobs = S.lobs.length;
    if (S.tokens > lastTokens) sfx.play('token.ready'); lastTokens = S.tokens;
    for (const e of S.enemies) if (e.x < TILE && e.hp > 0 && !knocked.has(e.id)) { knocked.add(e.id); sfx.play('gate.knock', { lane: e.lane }); }
    if (S.tick % 6 === 0) loopsTick();
    if (ghost) { if (!ghostEnd && (S.tick >= ghost.w1 || S.result)) { ghostEnd = true; mozi('fort.ghost.try', true); setTimeout(() => finish(null), 3200); } return; }
    // coach: one look every 0.5 s (the kernel coach is a pure function of the visible state)
    if (S.tick % 10 === 0 && !tut && !pz) {
      const l = coachLine(S, mem);
      if (l) { const id = coachLineId(l); if (id) {
        mozi(id); pendingLine = { ...l, at: S.tick };
        // PvZ 老手快速通道 (spec §2.4): after following the hand within 3 s in both 1-1 and 1-2, teaching levels show the hand
        // only after 5 s of hesitation; the line and the card glow still come at once
        if (fastHands && l.card != null && cards[l.card]) { deferred = { l, at: performance.now() + 5000 }; const cb = cards[l.card]; cb.classList.add('is-hint'); setTimeout(() => cb.classList.remove('is-hint'), 6000); } else showHint(l);
        if (tier === 2 && l.card != null && l.lane != null && l.col != null && why(l.card, l.lane, l.col) === null) {
          autoHint = { card: l.card, lane: l.lane, col: l.col, until: performance.now() + 6000 }; if (!drag) stage.hover = restHover();
          if (!autoSaid) { autoSaid = true; setTimeout(() => !destroyed && mozi('fort.ui.assist2.tap'), 2600); }
        }
      } }
    }
    if (autoHint && performance.now() > autoHint.until) { autoHint = null; if (!drag) stage.hover = restHover(); }
    if (deferred && performance.now() >= deferred.at) { const d = deferred; deferred = null; if (pendingLine && pendingLine.card === d.l.card && pendingLine.lane === d.l.lane) showHint(d.l); }
    if (pendingLine && S.tick - pendingLine.at > 8 * TPS) pendingLine = null;
    if (tut) tutorial();
  }
  function tutorial(): void {
    if (!tut) return; const t = S.tick;
    if (tut.phase === 0 && t >= 10) { tut.phase = 1; mozi('fort.lvl.1-1.1'); setTimeout(() => mozi('fort.lvl.1-1.2'), 2300); tut.at = t; }
    if (tut.phase === 1 && t - tut.at >= 30 && tut.placedAt < 0) { tut.phase = 2; showHint({ type: 'lane', key: 't', card: 'shooter', lane: 2, col: 1 }); tut.at = t; }
    // 8 s idle → the hand shows it again; another 8 s → the card and 第3路第2格 keep pulsing until he places it (spec §2.4)
    if (tut.phase === 2 && tut.placedAt < 0 && t - tut.at >= 8 * TPS) { tut.idle++; showHint({ type: 'lane', key: 't', card: 'shooter', lane: 2, col: 1 }); mozi('fort.lvl.1-1.again'); tut.at = t; if (tut.idle >= 2) pulseOn(); }
    if (tut.phase === 2 && tut.placedAt >= 0) tut.phase = 3;
    if (tut.phase === 3 && S.drops.length && tut.firstGone) { tut.phase = 4; mozi('fort.lvl.1-1.collect'); const d = S.drops[0]; const p = stage.dropRestXY(S, d); handTap(p.x, p.y + 4); }
    if (tut.phase === 4 && S.grain >= 80 && S.tick >= (S.cdReady.shooter ?? 0)) { tut.phase = 5; skipOff?.(); skipOff = null; skipEl = null; mozi('fort.lvl.1-1.more'); cards.shooter?.classList.add('is-hint'); setTimeout(() => cards.shooter?.classList.remove('is-hint'), 5000); }
  }
  function updateHud(): void {
    if (L.belt && S.belt.join() !== beltKey) {
      const arrived = S.beltI > beltSeen; beltSeen = S.beltI; buildTray();
      if (arrived && cardEls.length) { const b = cardEls[cardEls.length - 1]; b.classList.add('is-new'); horseDelivery(hud, { x: tray.offsetLeft - 60, y: tray.offsetTop + tray.offsetHeight / 2 }, { x: tray.offsetLeft + b.offsetLeft + b.offsetWidth / 2, y: tray.offsetTop + b.offsetTop + b.offsetHeight / 2 }, stage.reduced); sfx.play('place', { vol: 0.8 }); }
    }
    if (S.stats.beltFull > beltFullSeen) { beltFullSeen = S.stats.beltFull; if (performance.now() - beltFullSaidAt > 20000) { beltFullSaidAt = performance.now(); mozi('fort.belt.full'); } tray.classList.remove('is-full'); void tray.offsetWidth; tray.classList.add('is-full'); }
    warn.update(S, geo);
    bossBar?.update(S);
    const night = !!L.env?.night && !(S.dawnAt != null && S.tick >= S.dawnAt);
    const inc = (S.skyNext >= 0 && !night ? 20 / 8 : 0) + S.units.reduce((a, u) => a + (u.k === 'farm' ? (night ? 10 : 20) / 18 : u.k === 'bank' && S.tick >= (u.armAt || 0) ? 50 / 16 : 0), 0);
    const isHeld = speedSel > 1 && held(S, hold); const key = [S.grain, S.tick >> 3, S.parts, S.tokens, speedSel, S.belt.length, S.stats.logsUsed, isHeld].join('|'); if (key === lastHud) return; lastHud = key;
    if (L.belt) { if (!bin.classList.contains('is-belt')) { bin.classList.add('is-belt'); (bin.firstElementChild as HTMLElement).innerHTML = HORSE_SVG; } } else (bin.firstElementChild as HTMLElement).textContent = String(S.grain);
    if ((S.tick & 31) === 0 || !bin.lastElementChild!.textContent) (bin.lastElementChild as HTMLElement).textContent = L.belt ? '驿马送牒' : pz ? `预算 ${pz.p.budget}` : `每分钟 +${Math.floor(60 * inc)}`;
    if (pzQ) for (const m of pzQ.querySelectorAll<HTMLElement>('.gf-pzq__m')) m.classList.toggle('is-out', S.tick >= Math.round(+m.dataset.t! * TPS));
    const left = Math.max(0, (S.flags.length ? S.flags[S.flags.length - 1] : S.endTick) - S.tick) / TPS; // 沙漏: counted to the last 战鼓 (rev d)
    for (const b of cardEls) {
      if (pz) { const c = b.dataset.card!; const short = UNITS[c].cost - S.grain; b.classList.toggle('is-poor', setup && short > 0); b.classList.toggle('is-ready', setup && short <= 0); setShort(b.querySelector('.gf-card__short') as HTMLElement, setup ? short : 0); continue; }
      const c = b.dataset.card!; const cd = L.belt ? 0 : Math.max(0, (S.cdReady[c] ?? 0) - S.tick); const full = UNITS[c].cd || 1;
      (b.querySelector('.gf-card__cd') as HTMLElement).style.height = `${Math.min(100, (cd / full) * 100)}%`;
      const short = L.belt ? 0 : UNITS[c].cost - S.grain; b.classList.toggle('is-poor', short > 0); b.classList.toggle('is-ready', cd === 0 && short <= 0);
      setShort(b.querySelector('.gf-card__short') as HTMLElement, short);
      const payback = c === 'farm' ? (night ? 63 : 27) : c === 'bank' ? 42 : 0; b.classList.toggle('is-late', payback > 0 && left < payback);
    }
    const ring = box.querySelector('.fg') as SVGCircleElement; ring.style.strokeDashoffset = String(100.5 * (1 - Math.min(20, S.parts) / 20));
    box.classList.toggle('is-ready', S.tokens > 0); box.classList.toggle('is-full', S.tokens >= 3);
    (box.querySelector('.gf-box__tokens') as HTMLElement).innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < S.tokens ? 'on' : ''}">令</i>`).join('');
    // bamboo scroll: script time with drums
    const end = pz ? pzEnd : Math.max(1, S.endTick); const fill = scroll.firstElementChild as HTMLElement; fill.style.width = `${Math.min(100, (S.tick / end) * 100)}%`;
    (scroll.querySelector('.gf-scroll__hand') as HTMLElement).style.left = `calc(${Math.min(100, (S.tick / end) * 100)}% - 14px)`;
    if (pz) for (const m of scroll.querySelectorAll<HTMLElement>('.gf-scroll__m')) m.classList.toggle('is-past', S.tick >= +m.dataset.t!);
    if (!scroll.dataset.drums) { scroll.dataset.drums = '1'; for (const f of S.flags) { const d = h('div', 'gf-scroll__drum'); d.style.left = `calc(${(f / end) * 100}% - 15px)`; d.dataset.t = String(f); scroll.appendChild(d); } }
    for (const d of scroll.querySelectorAll<HTMLElement>('.gf-scroll__drum')) { const ft = +d.dataset.t!; d.classList.toggle('is-near', S.tick >= ft - 5 * TPS && S.tick < ft); d.classList.toggle('is-past', S.tick >= ft); }
    for (const b of speed.querySelectorAll<HTMLElement>('button')) { b.classList.toggle('is-on', +b.dataset.s! === speedSel); b.classList.toggle('is-held', isHeld && +b.dataset.s! === 1.5); }
    // 附加题 chip: live count, two little 檑木 for 守得稳, tick when done, grey once it can't be done
    if (!ghost) {
      const st = star3State(S); (star3.querySelector('.gf-star3__n') as HTMLElement).textContent = st.text; star3.toggleAttribute('data-count', !!st.text);
      star3.querySelectorAll('.gf-star3__logs i').forEach((x, i) => x.classList.toggle('is-used', i < S.stats.logsUsed));
      if (st.ok && !s3ok) { s3ok = true; star3.classList.add('is-ok'); sfx.play('collect', { step: 7, vol: 1.3 }); }
      if (!st.ok && s3ok && !st.lost) { s3ok = false; star3.classList.remove('is-ok'); }
      if (st.lost && !s3lost) { s3lost = true; s3ok = false; star3.classList.remove('is-ok'); star3.classList.add('is-lost'); setTimeout(() => !destroyed && !ended && mozi('fort.ui.bonusLost'), 1200); }
    }
  }
  function effSpeed(): number { return speedOf(speedSel, S, hold); } // §3.15 rules live in timing.ts (tested)
  // paused: draw a couple of settling frames, then stop the loop (no 60 fps GPU load while nobody plays; GAME_AUTHORING §7,
  // spec §8.5); kick() restarts it on 继续 / 战鼓重来 / 整关重来 and redraws once on a layout change
  let idleFrames = 0; let perfNote: { median: number; degrade: number } | null = null;
  function kick(): void { idleFrames = 0; if (!raf && !destroyed) raf = requestAnimationFrame((t) => { last = t; frame(t); }); }
  function frame(now: number): void {
    raf = 0;
    if (destroyed) return;
    if (paused && !hooking && !ended) { if (++idleFrames > 2) return; } else idleFrames = 0;
    raf = requestAnimationFrame(frame);
    const w0 = performance.now(); const running = !paused && !ended && !setup && !hooking;
    const dt = Math.max(0, Math.min(100, now - last)); last = now;
    if (running) {
      acc += dt * effSpeed(); let n = 0;
      while (acc >= 50 && n < 4) { tickOnce(); acc -= 50; n++; if (S.result || destroyed) break; }
      if (n === 4) acc = Math.min(acc, 50);
      if (S.result && !ended && !ghost) end();
    }
    if (destroyed) return;
    const r0 = performance.now(); drawStats.px = 0;
    o.dev?.frame?.(S, stage); // V19 stress: particles topped up around every frame, so the peak holds 200 between ticks
    stage.render(S, paused || ended ? 1 : Math.min(1, acc / 50), now, dt);
    o.dev?.frame?.(S, stage);
    updateHud();
    if (boardNight !== nightNow()) { if (boardNight) dawn(); else paintBoard(); }
    const t1 = performance.now();
    perf.ms[perf.i] = t1 - r0; perf.calls[perf.i] = drawStats.calls; perf.i = (perf.i + 1) % 240; perf.n = Math.min(240, perf.n + 1);
    work.push(t1 - w0); if (drawStats.measure) fill.push(drawStats.px / (stageC.width * stageC.height));
    if (running && !probe.done) { const d = probe.push(t1 - w0, dt); if (d != null) { applyDegrade(Math.max(app.test && !o.dev ? 0 : d, o.dev?.degrade ?? 0)); /* automation shots stay full quality */ perfNote = { median: +probe.median.toFixed(2), degrade }; /* folded into gf-level */ } }
  }
  /** render cost ring (V19 / §9.8: drawImage calls per frame, render+HUD ms per frame) — read by the perf spec */
  const perf = { ms: new Float32Array(240), calls: new Uint16Array(240), i: 0, n: 0 };
  /** whole frame work (kernel steps + render + HUD) and painted pixels / stage pixels (fill only while drawStats.measure) */
  const work = new Ring(4096), fill = new Ring(4096); let stepMs = 0, stepN = 0;
  function end(): void {
    if (pz) { // drill: stars by spend (§3.18); "还没守住" is not a failure, just try another layout
      ended = true; const win = S.result === 'win'; const spent = costOf(placed); const stars = win ? puzzleStars(pz.p, spent) : 0;
      sfx.stopLoops(); if (win) { luban('fort.luban.win'); stinger('win'); } else stinger('lose');
      app.mark('gf-puzzle', { id: pz.p.id, result: S.result, stars, spent, par: pz.p.par, sec: Math.round(S.tick / TPS) });
      setTimeout(() => finish({ result: win ? 'win' : 'lose', S, stars, checkpoint: null, checkpointFlag: 0, asked, placed: placed.map((q) => ({ ...q })), spent }), 1400);
      return;
    }
    ended = true; const win = S.result === 'win'; const stars = starsOf(S);
    sfx.stopLoops(); if (win) { luban('fort.luban.win'); stinger('win'); } else { luban('fort.luban.lose'); stinger('lose'); }
    app.mark('gf-level', { id: o.level.id, result: S.result, stars, assist: tier, logs: S.stats.logsUsed, sec: Math.round(S.tick / TPS), asked, hash: hash(S), reads: takeReads(), ...(perfNote ? { perf: perfNote } : {}) });
    // a Boss fold (it starts when the stage eats the boss's last event, i.e. after this frame) plays out before the result
    const later = (): void => { const w = stage.foldLeft(performance.now()); if (w > 0 && !destroyed) { setTimeout(later, w + 300); return; } finish({ result: win ? 'win' : 'lose', S, stars, checkpoint, checkpointFlag, asked, hints: hintTicks, actions: actLog, from: logFrom, seed: curSeed, quick: firstPlaceTick >= 0 && (firstHintTick < 0 || firstPlaceTick <= firstHintTick + 3 * TPS) }); };
    setTimeout(later, 1400);
  }
  function finish(r: BattleEnd | null): void { if (destroyed) return; destroy(); done(r); }
  function destroy(): void {
    hookDone?.(); skipOff?.(); destroyed = true; drawStats.measure = false; cancelAnimationFrame(raf); clearInterval(lubanTimer); clearTimeout(bubbleTimer); clearTimeout(tipTimer); if (press) clearTimeout(press.timer);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); window.removeEventListener('click', onHome, true);
    app.voice.stop(); sfx.resetSfx(); el.remove();
    delete (window as unknown as { __gf?: unknown }).__gf; // never keep the destroyed battle (S, stage, canvases) reachable
  }
  // ── 1-1 首屏钩子 (spec §2.4, ≈3.4 s, any touch skips): the sand table's lid swings open, the five lane strips drop into
  // the tray one by one (squash + dust), a light pass runs over the sand, 鲁班's sleeve sets down a little ram, 墨子's
  // sleeve drops a caltrop in front of it, 噗 — the wheels jam, and both fly into the 机关匣. The kernel waits at tick 0
  // meanwhile (the first-touch clock of §2.4 starts after it). Hands are drawn as robe sleeves in the rig style.
  const SLEEVE = (robe: string, dark: string, cuff: string, cuff2: string, skin: string): string => `<svg viewBox="0 0 84 156" aria-hidden="true">
    <path d="M10 0H74L76 64Q79 92 66 102H18Q5 92 8 64Z" fill="${robe}" stroke="#2a1b12" stroke-width="3" stroke-linejoin="round"/>
    <path d="M25 6Q21 46 27 92M58 6Q63 46 56 92M41 4V30" stroke="${dark}" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".75"/>
    <path d="M14 86Q42 97 70 86L68 104Q42 114 16 104Z" fill="${cuff}" stroke="#2a1b12" stroke-width="3" stroke-linejoin="round"/>
    <path d="M20 96Q42 104 64 96" stroke="${cuff2}" stroke-width="2.4" fill="none" stroke-dasharray="5 4" stroke-linecap="round"/>
    <path d="M27 106Q24 118 27 126L29 141Q30 148 35.5 147Q40 146 39 140L38.5 131L41 145Q42.5 151 48 150Q53 149 51.5 142L49.5 131L53 139Q55.5 144 59.5 142Q63 140 61 134L57 122Q57.5 113 56 106Z" fill="${skin}" stroke="#2a1b12" stroke-width="3" stroke-linejoin="round"/>
    <path d="M56 109Q67 113 66.5 122Q66 129 60 128.5Q57 128 57.5 124" fill="${skin}" stroke="#2a1b12" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 128Q33 134 33.5 138M44 131Q45 137 45.5 141" stroke="#b5835c" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
  </svg>`;
  function hook(): void {
    hooking = true; el.classList.add('is-hook'); const k = stage.reduced ? 0.5 : 1; const ms = (v: number): number => Math.round(v * k);
    const lay = h('div', 'gf-hook'); hud.appendChild(lay); const anims: Animation[] = []; const timers: number[] = [];
    const at = (t: number, f: () => void): void => { timers.push(window.setTimeout(() => { if (hooking && !destroyed) f(); }, ms(t))); };
    const anim = (e: Element, kf: Keyframe[], o2: KeyframeAnimationOptions): void => { anims.push(e.animate(kf, { ...o2, duration: ms(Number(o2.duration)), delay: ms(Number(o2.delay || 0)), fill: 'both' })); };
    const T = (x: number, y: number, extra = ''): string => `translate(${Math.round(x)}px, ${Math.round(y)}px) ${extra}`;
    const LW = 8 * geo.w; const fm = Math.round(geo.w * 0.2);
    // ① the empty tray (a dark recess where the lanes go) + the lid over the whole table, which swings open in two halves
    const recess = h('i', 'gf-hook__recess'); px(recess, geo.x0, geo.by, LW, geo.bh); lay.appendChild(recess);
    const lid = h('div', 'gf-hook__lid'); px(lid, geo.bx - fm, geo.by - fm, geo.bw + fm * 2, geo.bh + fm * 2); lay.appendChild(lid);
    const lt = h('i', 'gf-hook__half gf-hook__half--top'), lb = h('i', 'gf-hook__half gf-hook__half--bot'), seal = h('b', 'gf-hook__seal', '墨');
    lid.append(lt, lb, seal);
    anim(seal, [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.55 }, { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%, -50%) scale(.6)', opacity: 0 }], { duration: 520, delay: 0, easing: 'ease-in' });
    anim(lt, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-104deg)', opacity: 1, offset: 0.85 }, { transform: 'rotateX(-110deg)', opacity: 0 }], { duration: 640, delay: 360, easing: 'cubic-bezier(.5,0,.3,1)' });
    anim(lb, [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(104deg)', opacity: 1, offset: 0.85 }, { transform: 'rotateX(110deg)', opacity: 0 }], { duration: 640, delay: 360, easing: 'cubic-bezier(.5,0,.3,1)' });
    [0, 170, 340].forEach((t, i) => at(t, () => sfx.play('collect', { step: i * 2, vol: 1.1 }))); // 编钟三声
    at(200, () => sfx.play('place', { vol: 0.5 }));
    // ② the five lane strips (cut from the painted board) drop into the tray top to bottom with a squash and a puff
    const dust = (x: number, y: number, n: number, d: number): void => { for (let i = 0; i < n; i++) { const p = h('i', 'gf-hook__dust'); const s0 = Math.round(geo.h * (0.22 + 0.1 * (i % 3))); px(p, x + (i - n / 2) * geo.w * 0.9 - s0 / 2, y - s0 / 2, s0, s0); lay.appendChild(p);
      anim(p, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(.8)', opacity: 0.85, offset: 0.2 }, { transform: `translate(${(i % 2 ? 1 : -1) * geo.w * 0.25}px, ${-geo.h * 0.3}px) scale(1.5)`, opacity: 0 }], { duration: 520, delay: d, easing: 'ease-out' }); } };
    for (let l = 0; l < 5; l++) {
      const c = document.createElement('canvas'); c.className = 'gf-hook__strip'; const sw = Math.round(LW * geo.dpr), sh = Math.round(geo.h * geo.dpr);
      c.width = sw; c.height = sh; c.getContext('2d')?.drawImage(board, Math.round(geo.x0 * geo.dpr), Math.round(laneTop(geo, l) * geo.dpr), sw, sh, 0, 0, sw, sh);
      px(c, geo.x0, laneTop(geo, l), LW, geo.h); lay.appendChild(c); const d = 380 + l * 115;
      anim(c, [{ transform: `translateY(${-geo.h * 1.4}px) scale(1.02)`, opacity: 0 }, { transform: `translateY(${-geo.h * 0.9}px) scale(1.02)`, opacity: 1, offset: 0.25 }, { transform: 'translateY(0) scale(1.02, .86)', opacity: 1, offset: 0.72 }, { transform: 'translateY(0) scale(.99, 1.03)', opacity: 1, offset: 0.86 }, { transform: 'none', opacity: 1 }], { duration: 330, delay: d, easing: 'cubic-bezier(.55,0,.9,.6)' });
      at(d + 240, () => sfx.play('place', { vol: 0.45, lane: l })); dust(geo.x0 + LW / 2, laneTop(geo, l) + geo.h, 4, d + 230);
    }
    // ③ one warm light pass over the sand (masked to the table)
    const sweepBox = h('div', 'gf-hook__sweepbox'); px(sweepBox, geo.x0, geo.by, LW, geo.bh); const band = h('i', 'gf-hook__sweep'); sweepBox.appendChild(band); lay.appendChild(sweepBox);
    anim(band, [{ transform: `translateX(${-LW * 0.45}px) skewX(-18deg)`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { transform: `translateX(${LW * 1.1}px) skewX(-18deg)`, opacity: 0 }], { duration: 760, delay: 1000, easing: 'ease-in-out' });
    // ④ 鲁班's sleeve sets the ram down at col 7 (they move together), lets go and lifts; the ram bounces, then rolls left
    const lane = 2; const p6 = cellXY(lane, 6.2), p3 = cellXY(lane, 3), box0 = stage.partsBox;
    const rs = Math.round(geo.w * 1.1), ss = Math.round(geo.w * 0.78); const HW = Math.round(geo.w * 0.92), HH = Math.round(HW * 156 / 84);
    const toy = (kind: string, size: number): HTMLElement => { const d = h('div', 'gf-hook__toy'); d.append(rigIcon(atlas, kind, size, geo.dpr)); px(d, 0, 0, size, size); lay.appendChild(d); return d; };
    const sleeve = (cls: string, svg: string): HTMLElement => { const d = h('div', 'gf-hook__hand ' + cls, svg); px(d, 0, 0, HW, HH); lay.appendChild(d); return d; };
    const ram = toy('ram', rs), spk = toy('spikes', ss);
    const lh = sleeve('gf-hook__hand--luban', SLEEVE('#b5462f', '#7e2b1c', '#d9a440', '#7a4a12', '#f2c9a0'));
    const mh = sleeve('gf-hook__hand--mozi', SLEEVE('#2f5d55', '#1d3d37', '#c9a46a', '#6b5530', '#e9bd92'));
    const ramY = p6.y - rs * 0.62, spkY = p3.y - ss * 0.5;
    const gripR = (y: number): number => y - HH * 0.84; // the sleeve's fingertips sit on the toy's top edge
    const top0 = -HH - rs - 40; // above the screen with the toy in its fingers
    anim(lh, [{ transform: T(p6.x - HW / 2, top0) }, { transform: T(p6.x - HW / 2, gripR(ramY)), offset: 0.42 }, { transform: T(p6.x - HW / 2, gripR(ramY)), offset: 0.6 }, { transform: T(p6.x - HW / 2, top0) }], { duration: 1100, delay: 900, easing: 'cubic-bezier(.45,0,.35,1)' });
    anim(ram, [{ transform: T(p6.x - rs / 2, top0 + HH * 0.84), opacity: 1 }, { transform: T(p6.x - rs / 2, ramY - 4, 'scale(1.06,.9)'), opacity: 1, offset: 0.27 }, { transform: T(p6.x - rs / 2, ramY), opacity: 1, offset: 0.36 }, { transform: T(p6.x - rs / 2, ramY), opacity: 1, offset: 0.48 }, { transform: T(p3.x + geo.w * 0.45 - rs / 2, ramY), opacity: 1 }], { duration: 1720, delay: 900, easing: 'cubic-bezier(.4,0,.8,.6)' });
    at(1380, () => sfx.play('place', { lane })); at(1760, () => sfx.play('ram.roll', { lane, vol: 0.8 }));
    // ⑤ 墨子's sleeve drops a caltrop in front of it
    anim(mh, [{ transform: T(p3.x - HW / 2, top0) }, { transform: T(p3.x - HW / 2, gripR(spkY) - ss * 0.15), offset: 0.45 }, { transform: T(p3.x - HW / 2, gripR(spkY) - ss * 0.15), offset: 0.62 }, { transform: T(p3.x - HW / 2, top0) }], { duration: 950, delay: 1450, easing: 'cubic-bezier(.45,0,.35,1)' });
    anim(spk, [{ transform: T(p3.x - ss / 2, spkY - 70), opacity: 0 }, { transform: T(p3.x - ss / 2, spkY - 60), opacity: 1, offset: 0.12 }, { transform: T(p3.x - ss / 2, spkY), opacity: 1, offset: 0.34 }, { transform: T(p3.x - ss / 2, spkY), opacity: 1 }], { duration: 900, delay: 1700, easing: 'ease-in' });
    at(1990, () => { sfx.play('place.spikes', { lane }); dust(p3.x, spkY + ss * 0.5, 2, 0); });
    // 噗: stuck, a little shake, then both fly into the 机关匣
    at(2620, () => { sfx.play('ram.jam', { lane }); ram.classList.add('is-stuck'); dust(p3.x + geo.w * 0.3, ramY + rs * 0.8, 3, 0); });
    const fly = (e: HTMLElement, x0: number, y0: number, s0: number, d: number): void => anim(e, [{ transform: T(x0, y0), opacity: 1 }, { transform: T(box0.x - s0 / 2, box0.y - s0 / 2, 'scale(.18) rotate(200deg)'), opacity: 0.2 }], { duration: 430, delay: d, easing: 'cubic-bezier(.5,0,.9,.5)' });
    at(2940, () => { sfx.play('capture', { lane }); setTimeout(() => sfx.parts(2, 0.1), 200); fly(ram, p3.x + geo.w * 0.45 - rs / 2, ramY, rs, 0); fly(spk, p3.x - ss / 2, spkY, ss, 60); });
    const done = (): void => { if (!hooking) return; hooking = false; hookDone = null; for (const a of anims) a.cancel(); timers.forEach(clearTimeout); lay.remove(); el.classList.remove('is-hook'); last = performance.now(); acc = 0; };
    hookDone = done; at(3480, done);
    lay.addEventListener('pointerdown', (ev) => { ev.preventDefault(); done(); });
  }
  // intro lines (1-1 has its own script)
  if (ghost) setTimeout(() => !destroyed && mozi('fort.ghost.start'), 300);
  else if (pz) { mozi(pz.p.group === 1 ? 'fort.pz.g1' : pz.p.group === 2 ? 'fort.pz.g2' : 'fort.pz.g4'); setTimeout(() => !destroyed && setup && mozi('fort.pz.budget', false, { n: pz.p.budget }), 2600); }
  else if (!tut && !o.resume) { const v = o.level.voice; if (v) { mozi(v.intro[0]); setTimeout(() => !destroyed && mozi(v.intro[1]), 2600); } }
  if (tut) hook();
  // 跳过 (kit pill, after 1.5 s): ends 1-1's lesson — no more demo hand, pulses or scripted lines, the level plays on with
  // 墨子's coach (hand only after 5 s of hesitation) and the lesson counts as seen — or ends the ghost replay (back to 复盘)
  function skipTutorial(): void {
    if (!tut) return; hookDone?.(); stopHand(); pulseOff(); hideMozi(); app.voice.stop(); cards.shooter?.classList.remove('is-hint');
    tut = null; fastHands = !tier; deferred = null;
    if (!app.save.story.includes('tut.1-1')) { app.save.story.push('tut.1-1'); app.persist(); }
    app.mark('gf-tut', { id: '1-1', skipped: true, tick: S.tick });
  }
  if (tut || ghost) { skipOff = mountSkipButton(el, () => { skipOff = null; skipEl = null; if (ghost) finish(null); else skipTutorial(); }, { className: 'gf-skipbtn' }); skipEl = el.querySelector<HTMLElement>('.gf-skipbtn'); placeSkip(); }
  if (o.startPaused && !ghost) openPause();
  // 🏠 mid-battle (spec §2.1): one tap asks first — "回游戏大厅？这一局会存好" — the 2nd tap on 回大厅 leaves for real
  let homeOK = false;
  const onHome = (ev: MouseEvent): void => {
    const a = (ev.target as Element | null)?.closest?.<HTMLAnchorElement>('.kit-back'); if (!a || homeOK || ended || ghost || destroyed || pz) return;
    ev.preventDefault(); ev.stopImmediatePropagation(); app.ui('ui-open', 0.5);
    if (!paused) openPause(true);
    const pn = pauseLayer.querySelector('.gf-pausel__panel'); if (!pn || pn.querySelector('.gf-pausel__home')) return;
    const q = h('div', 'gf-pausel__home', `<b>回游戏大厅？</b><span>这一局会存好，回来接着推。</span><div><button class="xg-btn xg-btn--primary" data-h="go">${icon('home')}回大厅</button><button class="xg-btn xg-btn--secondary" data-h="stay">${icon('play')}接着推演</button></div>`);
    pn.prepend(q); pn.classList.add('is-home');
    q.querySelector('[data-h=go]')!.addEventListener('click', () => { homeOK = true; app.ui('ui-confirm', 0.5); a.click(); });
    q.querySelector('[data-h=stay]')!.addEventListener('click', () => { q.remove(); pn.classList.remove('is-home'); (pauseLayer.querySelector('[data-a=go]') as HTMLElement | null)?.click(); });
  };
  window.addEventListener('click', onHome, true);
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  // test / dev hooks
  if (app.test || o.dev) (window as unknown as { __gf?: unknown }).__gf = { get S() { return S; }, stage, perf: () => { const ms = Array.from(perf.ms.slice(0, perf.n)).sort((x, y) => x - y); const q = (f: number): number => ms[Math.min(ms.length - 1, Math.floor(f * ms.length))] || 0; const r2 = (v: number): number => +v.toFixed(2);
    return { n: perf.n, mean: r2(ms.reduce((x, y) => x + y, 0) / Math.max(1, ms.length)), p50: q(0.5), p95: q(0.95), p99: q(0.99), maxCalls: Math.max(0, ...Array.from(perf.calls.slice(0, perf.n))), units: S.units.length, enemies: S.enemies.length, bolts: S.bolts.length, dpr: devicePixelRatio,
      work: { n: work.n, p50: r2(work.q(0.5)), p95: r2(work.q(0.95)), p99: r2(work.q(0.99)), max: r2(work.max()) }, fill: { n: fill.n, max: r2(fill.max()), mean: r2(fill.mean()) },
      stepUs: r2((stepMs / Math.max(1, stepN)) * 1000), steps: stepN, degrade, probe: r2(probe.median), stageDpr: stageGeo().dpr, bakeMs: r2(atlas.bakeMs), particles: stage.activeParticles() }; },
    resetPerf: () => { perf.n = 0; perf.i = 0; work.reset(); fill.reset(); stepMs = 0; stepN = 0; }, degrade: (d: number) => applyDegrade(d), place: tryPlace, collectAll: () => { for (const d of S.drops) queue.push({ t: 'collect', id: d.id }); }, token: (lane: number, col: number) => queue.push({ t: 'token', lane, col }), mark: (id: number) => queue.push({ t: 'mark', id }), setSpeed: (s: number) => { speedSel = s; }, pause: openPause, skipHook: () => hookDone?.(), luban: (id: string) => luban(id), get hooking() { return hooking; }, go: startDrill, placed: () => placed.slice(), tile: TILE, cell: (l: number, c: number) => ({ x: cellCx(geo, c), y: feetY(geo, l) }), ghost: !!ghost, tier };

  return {
    layout(l: LayoutInfo): void { geo = makeGeo(l.width, l.height, l.safe.top, app.dpr, phIns(l)); atlas = atlasFor(geo.w, app.dpr); stage.setGeo(stageGeo(), atlas); warn.clear(); paintBoard(); placeHud(); paintHover(stage.hover); kick(); },
    destroy, pause: () => { if (!paused && !ended) openPause(true); },
    leave: () => suspend(true),
  };
}
