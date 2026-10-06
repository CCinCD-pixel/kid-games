// 沙盘战斗 (spec §2.2, §2.5, §2.7, §8.4): fixed-step kernel (20 Hz) + interpolated Canvas2D stage + DOM HUD.
// Input → actions queued for the next tick; the HUD updates only when its numbers change.
// Modes: normal · assist tier 1/2 (§3.20) · ghost replay of the lesson window (「看看墨子怎么守」, §5.4).
import { createSim, step, snapshot, restore as restoreSnap, resume as resumeSnap, canPlace, hash, type Snapshot } from '../lane/sim';
import { coachLine, makeCoachMemory, followed, askLine, type CoachLine, type CoachMemory } from '../lane/coach';
import { starsOf } from '../lane/stars';
import { UNITS } from '../lane/tables';
import { TPS, T as TILE, ASSIST, ASSIST2 } from '../lane/rules';
import { FEARS } from '../lane/tags';
import { learned } from '../lane/learn';
import type { Action, Level, SimEvent, SimState } from '../lane/types';
import { makeGeo, drawBoard, cellCx, feetY, laneTop, type Geo } from '../render/board';
import { Stage } from '../render/stage';
import { rigIcon, portrait } from '../art/icons';
import { coachLineId } from '../theme/mozi';
import { nameOf, ENEMY_INFO } from '../content';
import { atlasFor, type AppCtx } from '../ctx';
import * as sfx from '../audio/sfx';
import { stinger } from '../audio/music';
import { BossBar, WarnHands, horseDelivery, namePlate, star3State, HORSE_SVG } from './hud';
import { icon } from '@kit/ui';
import type { LayoutInfo } from '@kit/shell';

export interface GhostRun { actions: [number, Action[]][]; w0: number; w1: number; seed: number; loadout: string[] }
export interface BattleOpts {
  level: Level; loadout: string[]; seed: number; assist?: 0 | 1 | 2; resume?: Snapshot | null; restore?: boolean;
  ghost?: GhostRun | null;
  /** pause/leave (suspend) and each 战鼓 (checkpoint): the caller writes it to IndexedDB on an idle frame */
  onSnap?: (s: Snapshot, kind: 'suspend' | 'checkpoint', flag: number, now?: boolean) => void;
}
export interface BattleEnd { result: 'win' | 'lose'; S: SimState; stars: number; checkpoint: Snapshot | null; checkpointFlag: number; asked: number }
export interface Screen { layout(l: LayoutInfo): void; destroy(): void; pause(): void; leave?(): void }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
const px = (e: HTMLElement, x: number, y: number, w: number, hh: number): void => { Object.assign(e.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' }); };
const TRAITS: Record<string, string> = { shield: '盾', wheels: '轮', momentum: '冲', swarm: '群', ladder: '梯', smoke: '烟', aura: '鼓', peck: '啄' };

export function mountBattle(root: HTMLElement, app: AppCtx, o: BattleOpts, done: (e: BattleEnd | null) => void): Screen {
  const ghost = o.ghost ?? null;
  const tier = ghost ? 0 : (o.assist ?? 0);
  const L: Level = { ...o.level, loadout: ghost ? (ghost.loadout.length ? ghost.loadout : o.level.loadout) : o.loadout };
  const simOpt = { events: true, assist: tier, extraStart: tier === 2 ? ASSIST2.startGrain : tier ? ASSIST.startGrain : 0, logCap: tier === 2 ? ASSIST2.logs : 1 };
  const fresh = (seed: number): SimState => createSim(L, seed, simOpt);
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
  } else S = fresh(o.seed);

  const el = h('div', 'gf-battle' + (ghost ? ' is-ghost' : '')); root.appendChild(el);
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
  const SPEEDS = [0.75, 1, 1.5];
  const fastOK = (o.level.vol ?? 1) > 1 || (o.level.idx ?? 1) >= 4;
  let speedSel = ghost ? 1 : tier ? 0.75 : fastOK ? (app.save.settings.speed || 1) : Math.min(1, app.save.settings.speed || 1);
  for (const s of SPEEDS) {
    const b = h('button', 'gf-speed__b', s === 0.75 ? '慢' : s === 1 ? '1×' : '1.5×'); b.dataset.s = String(s);
    if (s === 1.5 && !fastOK) b.disabled = true;
    if (s === 1.5 && o.level.id === '1-4' && !app.save.levels['1-4']) b.insertAdjacentHTML('beforeend', '<i class="gf-new">新</i>'); // 1.5× opens from 1-4
    speed.appendChild(b);
  }

  // ── geometry / layers ──
  let geo: Geo = makeGeo(app.layout.width, app.layout.height, app.layout.safe.top, app.dpr);
  let atlas = atlasFor(geo.w, app.dpr);
  const stage = new Stage(stageC, atlas, geo);
  stage.setShake(app.save.settings.shake);
  stage.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards: Record<string, HTMLButtonElement> = {}; let cardEls: HTMLButtonElement[] = [];
  let lastHud = '';
  const bossBar = L.boss ? new BossBar(hud, L.boss.type, atlas, app.dpr) : null;
  if (bossBar) scroll.style.display = 'none';
  const warn = new WarnHands(hud);

  function sizeCanvas(c: HTMLCanvasElement): void { c.width = Math.round(geo.W * geo.dpr); c.height = Math.round(geo.H * geo.dpr); c.style.width = geo.W + 'px'; c.style.height = geo.H + 'px'; }
  function paintBoard(): void {
    sizeCanvas(board); sizeCanvas(stageC);
    const bctx = board.getContext('2d')!; drawBoard(bctx, geo, { lanes: L.lanes, night: !!L.env?.night, fogCol: L.env?.fogCol ?? null });
    // 鲁班线 for column conditions (spec §2.5)
    const c3 = L.star3 || {}; const col = typeof c3.minX === 'number' ? c3.minX : c3.minXOf ? Object.values(c3.minXOf as Record<string, number>)[0] : null;
    if (col != null && !ghost) { const x = geo.x0 + (col as number) * geo.w; bctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0); bctx.strokeStyle = 'rgba(200,55,45,0.85)'; bctx.lineWidth = 3; bctx.setLineDash([10, 8]); bctx.beginPath(); bctx.moveTo(x, geo.by + 4); bctx.lineTo(x, geo.by + geo.bh - 4); bctx.stroke(); bctx.setLineDash([]); }
  }
  function placeHud(): void {
    const g = geo; const Ts = app.layout.safe.top; const W = g.W, H = g.H; const n = trayCount();
    el.dataset.orient = g.landscape ? 'landscape' : 'portrait';
    if (g.landscape) {
      px(bin, 84, Ts + 8, 120, 96);
      const cw = 84, gap = 6; px(tray, 212, Ts + 8, Math.max(n, 1) * (cw + gap) - gap, 96);
      const right = W - 8; px(pauseB, right - 64, Ts + 24, 64, 64); px(box, right - 64 - 6 - 88, Ts + 8, 88, 96); px(shovel, right - 64 - 6 - 88 - 6 - 64, Ts + 24, 64, 64);
      px(scroll, 84, Ts + 108, W - 84 - 8, 32);
      const yb = g.by + g.bh + 14; const hb = Math.max(72, Math.min(92, H - yb - 8));
      const spW = 3 * 64, s3W = 168; const bubW = Math.max(240, Math.min(440, W - (12 + hb + 8) - (6 + 52) - (14 + spW) - (12 + s3W) - (14 + hb + 12)));
      px(moziA, 12, yb, hb, hb); px(moziB, 12 + hb + 8, yb + 4, bubW, hb - 8); const rx = 12 + hb + 8 + bubW + 6; px(replay, rx, yb + (hb - 52) / 2, 52, 52);
      px(speed, rx + 52 + 14, yb + (hb - 60) / 2, spW, 60); px(star3, rx + 52 + 14 + spW + 12, yb + (hb - 76) / 2, s3W, 76);
      px(lubanA, W - 12 - hb, yb, hb, hb); px(lubanB, W - 12 - hb - 8 - 230, yb - 50, 230, 56);
      if (ghostBar) px(ghostBar, Math.round(W / 2 - 150), Ts + 104, 300, 40);
    } else {
      px(bin, 84, Ts + 8, 128, 72); px(scroll, 220, Ts + 24, W - 220 - 80, 40); px(pauseB, W - 8 - 64, Ts + 12, 64, 64);
      px(box, 12, Ts + 92, 120, 60); px(star3, 144, Ts + 88, Math.min(320, W - 144 - 140), 64); px(lubanA, W - 12 - 56, Ts + 94, 56, 56); px(lubanB, W - 12 - 56 - 8 - 220, Ts + 96, 220, 52);
      const ty = g.by + g.bh + 24; const cw = 120, chh = 128, gap = 12; const cols = L.belt ? 3 : Math.min(4, Math.max(n, 1)); const rows = n > cols ? 2 : 1;
      const tw = cols * cw + (cols - 1) * gap; const tx = Math.round((W - tw) / 2); px(tray, tx, ty, tw, rows * chh + (rows - 1) * gap);
      px(shovel, Math.max(8, tx - 12 - 80), ty, 72, 72); px(speed, Math.min(W - 8 - 72, tx + tw + 12), ty, 72, 3 * 64);
      const my = ty + rows * chh + (rows - 1) * gap + 20; const mh = Math.max(80, Math.min(112, H - my - 8));
      px(moziA, 12, my, mh, mh); px(moziB, 12 + mh + 8, my + 4, Math.min(600, W - mh - 100), mh - 8); px(replay, W - 8 - 56, my + (mh - 56) / 2, 56, 56);
      if (ghostBar) px(ghostBar, 220, Ts + 24, W - 300, 40);
    }
    if (bossBar) { const r = scroll.style; px(bossBar.el, parseFloat(r.left), parseFloat(r.top), parseFloat(r.width), parseFloat(r.height)); }
    moziA.replaceChildren(portrait('mozi', moziA.offsetWidth || 88, geo.dpr, 'calm'));
    lubanA.replaceChildren(portrait('luban', lubanA.offsetWidth || 88, geo.dpr, 'think'));
    stage.partsBox = { x: box.offsetLeft + box.offsetWidth / 2, y: box.offsetTop + box.offsetHeight / 2 };
    stage.grainBin = { x: bin.offsetLeft + bin.offsetWidth / 2, y: bin.offsetTop + bin.offsetHeight / 2 };
    buildTray();
  }
  // the rack (1-6 驿马 levels) always shows its 6 pegs; normal levels show the deck
  function trayCount(): number { return L.belt ? (L.belt.cap || 6) : S.loadout.length; }
  function trayCards(): string[] { return L.belt ? S.belt.slice() : S.loadout.slice(); }
  let beltSeen = S.beltI; let beltKey = '';
  function buildTray(): void {
    tray.replaceChildren(); for (const k in cards) delete cards[k]; cardEls = [];
    const g = geo; const size = g.landscape ? 64 : 88; const list = trayCards();
    for (let i = 0; i < trayCount(); i++) {
      const c = list[i];
      if (!c) { tray.appendChild(h('div', 'gf-card gf-card--peg')); continue; }
      const b = h('button', 'gf-card'); b.dataset.card = c;
      b.append(rigIcon(atlas, c, size, g.dpr));
      b.insertAdjacentHTML('beforeend', `${L.belt ? '' : `<span class="gf-card__cost">${UNITS[c].cost}</span>`}<span class="gf-card__cd"></span><span class="gf-card__short"></span>${c === o.level.newCard ? '<span class="gf-card__new">新</span>' : ''}<span class="gf-card__glass"></span>`);
      b.addEventListener('pointerdown', (ev) => startCardDrag(c, ev));
      tray.appendChild(b); cardEls.push(b); if (!cards[c]) cards[c] = b;
    }
    beltKey = S.belt.join(); lastHud = '';
  }
  paintBoard(); placeHud();

  // ── state ──
  const queue: Action[] = [];
  let selected: string | null = null; let shovelMode = false;
  let paused = false; let ended = false; let destroyed = false;
  let acc = 0; let last = performance.now(); let raf = 0; let slowUntil = 0;
  const mem: CoachMemory = makeCoachMemory(app.save.coach.followed);
  let pendingLine: (CoachLine & { at: number }) | null = null;
  let autoHint: { card: string; lane: number; col: number; until: number } | null = null; let autoSaid = false;
  let checkpoint: Snapshot | null = null; let checkpointFlag = 0;
  const seenKinds = new Set<string>(); let kills = 0; let lubanQuietUntil = 0; let asked = 0;
  let s3ok = false, s3lost = false; let beltFullSeen = S.stats.beltFull; let beltFullSaidAt = -1e9;
  const tut = o.level.id === '1-1' && !o.resume && !ghost ? { phase: 0, at: 0, placedAt: -1, collected: false, firstGone: false } : null;

  // ── voice / bubbles ──
  let bubbleTimer = 0;
  function mozi(id: string | null, interrupt = false, vars?: Record<string, string | number>): void {
    if (!id) return; moziB.querySelector('.t')!.textContent = app.voice.text(id, vars); moziB.classList.add('is-on'); clearTimeout(bubbleTimer); bubbleTimer = window.setTimeout(() => moziB.classList.remove('is-on'), 6500);
    void app.voice.say(id, { interrupt, vars });
  }
  let lubanTimer = 0;
  function luban(id: string): void {
    const txt = app.voice.text(id); if (!txt) return; const t = lubanB.querySelector('.t')!; t.textContent = ''; lubanB.classList.add('is-on'); lubanA.classList.add('is-talking');
    let i = 0; clearInterval(lubanTimer); sfx.babble(Math.min(6, Math.ceil(txt.length / 3)));
    lubanTimer = window.setInterval(() => { t.textContent = txt.slice(0, ++i); if (i >= txt.length) { clearInterval(lubanTimer); setTimeout(() => { lubanB.classList.remove('is-on'); lubanA.classList.remove('is-talking'); }, 2600); } }, 55);
  }
  replay.addEventListener('click', () => { app.voice.narrator.replay(); });
  moziA.addEventListener('click', () => { // 「墨子，怎么办？」
    if (ghost) return;
    const l = askLine(S, mem); asked++; if (!l) return;
    if (l.type === 'concept') { moziB.querySelector('.t')!.textContent = o.level.concept || ''; moziB.classList.add('is-on'); void app.voice.say(o.level.voice?.intro?.[1] || 'fort.ui.choose'); }
    else { mozi(coachLineId(l), true); showHint(l); }
    app.mark('gf-ask', { level: o.level.id, tick: S.tick });
  });
  star3.addEventListener('click', () => { mozi('fort.ui.star3rule'); setTimeout(() => !destroyed && o.level.voice && moziB.classList.contains('is-on') && (moziB.querySelector('.t')!.textContent = o.level.star3Text || ''), 1800); });
  star3.querySelector('.gf-star3__t')!.textContent = o.level.star3Text || '';

  // ── hints: glow the card + ghost hand to the cell ──
  const hand = h('div', 'gf-hand', `<svg viewBox="0 0 64 64"><path d="M22 6c3 0 5 2 5 5v17l3-1c3-1 5 1 5 3l1 1c2-1 5 0 5 3l1 1c2-1 5 1 5 3v12c0 9-6 14-14 14h-6c-6 0-9-3-12-8L8 40c-2-3 2-6 5-4l4 4V11c0-3 2-5 5-5z" fill="#fff" stroke="#2a1b12" stroke-width="3" stroke-linejoin="round"/></svg>`); hud.appendChild(hand);
  let handAnim: Animation | null = null;
  function handTo(x0: number, y0: number, x1: number, y1: number, iterations = 2): void {
    handAnim?.cancel(); hand.style.display = 'block';
    handAnim = hand.animate([{ transform: `translate(${x0 - 22}px, ${y0 - 4}px) scale(1)`, opacity: 0 }, { transform: `translate(${x0 - 22}px, ${y0 - 4}px) scale(.9)`, opacity: 1, offset: 0.15 }, { transform: `translate(${x1 - 22}px, ${y1 - 4}px) scale(.9)`, opacity: 1, offset: 0.75 }, { transform: `translate(${x1 - 22}px, ${y1 - 4}px) scale(1)`, opacity: 0 }], { duration: 1600, iterations, easing: 'ease-in-out' });
    handAnim.onfinish = () => { hand.style.display = 'none'; };
  }
  function handTap(x: number, y: number): void {
    handAnim?.cancel(); hand.style.display = 'block';
    handAnim = hand.animate([{ transform: `translate(${x - 22}px, ${y + 10}px) scale(1)`, opacity: 0 }, { transform: `translate(${x - 22}px, ${y - 4}px) scale(.88)`, opacity: 1, offset: 0.4 }, { transform: `translate(${x - 22}px, ${y - 4}px) scale(1)`, opacity: 1, offset: 0.7 }, { transform: `translate(${x - 22}px, ${y + 10}px)`, opacity: 0 }], { duration: 1100, iterations: 3 });
    handAnim.onfinish = () => { hand.style.display = 'none'; };
  }
  const cellXY = (lane: number, col: number): { x: number; y: number } => ({ x: geo.x0 + (col + 0.5) * geo.w, y: laneTop(geo, lane) + geo.h * 0.55 });
  function showHint(l: CoachLine): void {
    if (l.card == null || l.lane == null || l.col == null) return;
    const card = cards[l.card]; if (card) { card.classList.add('is-hint'); setTimeout(() => card.classList.remove('is-hint'), 6000); }
    const t = cellXY(l.lane, l.col);
    if (card) handTo(card.offsetLeft + card.offsetWidth / 2, card.offsetTop + card.offsetHeight / 2, t.x, t.y); else handTap(t.x, t.y);
  }

  // ── input ──
  const cellAt = (x: number, y: number): { lane: number; col: number } | null => {
    const c = Math.floor((x - geo.x0) / geo.w), l = Math.floor((y - geo.by) / geo.h);
    return c >= 0 && c < 8 && l >= 0 && l < 5 ? { lane: l, col: c } : null;
  };
  const why = (card: string, lane: number, col: number): string | null => canPlace(S, card, lane, col);
  function tryPlace(card: string, lane: number, col: number): boolean {
    if (ghost) return false;
    const r = why(card, lane, col);
    // one action per card and per cell per tick (the kernel would reject the 2nd; say so before it happens)
    const dup = queue.some((a) => a.t === 'place' && ((a.lane === lane && a.col === col) || (!L.belt && a.card === card)));
    if (r || dup) { app.ui('ui-locked', 0.6); flashReason(card, r || 'cd'); return false; }
    queue.push({ t: 'place', card, lane, col }); sfx.wood(1, 0.35); app.ui('place-piece', 0.5);
    if (pendingLine && pendingLine.card === card && pendingLine.lane === lane) { followed(mem, pendingLine); app.save.coach.followed = { ...mem.lifetime }; pendingLine = null; }
    if (autoHint && autoHint.card === card) { autoHint = null; stage.hover = null; }
    if (tut && tut.placedAt < 0) tut.placedAt = S.tick;
    return true;
  }
  function flashReason(card: string, r: string): void {
    const b = cards[card]; if (!b) return; b.classList.remove('is-no'); void b.offsetWidth; b.classList.add('is-no');
    if (r === 'grain') { const sh = b.querySelector('.gf-card__short') as HTMLElement; sh.textContent = `还差 ${UNITS[card].cost - S.grain}`; }
  }
  function select(card: string | null): void { selected = card; for (const b of cardEls) b.classList.toggle('is-sel', b.dataset.card === card); if (card) setShovel(false); }
  function setShovel(on: boolean): void { shovelMode = on; shovel.classList.toggle('is-on', on); if (on) select(null); }
  shovel.addEventListener('click', () => { if (ghost) return; setShovel(!shovelMode); app.ui('ui-select', 0.5); });
  // drag a card (finger offset: the drop cell is 0.6 tile above the finger, spec §2.7)
  let drag: { card: string; ghost: HTMLElement; moved: boolean; x0: number; y0: number } | null = null;
  let tdrag: { ghost: HTMLElement } | null = null; // 机关令 being dragged from the box
  let press: { id: number; k: string; x: number; y: number; timer: number } | null = null; // long-press → mark
  function startCardDrag(card: string, ev: PointerEvent): void {
    if (paused || ended || ghost || !ev.isPrimary) return; ev.preventDefault();
    const gh = h('div', 'gf-dragghost'); gh.append(rigIcon(atlas, card, geo.w * 0.95, geo.dpr)); hud.appendChild(gh);
    drag = { card, ghost: gh, moved: false, x0: ev.clientX, y0: ev.clientY }; onMove(ev);
    app.ui('ui-pick', 0.5);
  }
  const local = (ev: PointerEvent): { x: number; y: number } => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  function dropCell(ev: PointerEvent): { lane: number; col: number } | null { const p = local(ev); return cellAt(p.x, p.y - geo.h * 0.6); }
  const unitAt = (c: { lane: number; col: number } | null): boolean => !!c && S.units.some((u) => u.lane === c.lane && u.col === c.col && !u.dead);
  function onMove(ev: PointerEvent): void {
    if (press && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 14) { clearTimeout(press.timer); press = null; }
    if (tdrag) { const p = local(ev); tdrag.ghost.style.transform = `translate(${p.x - 30}px, ${p.y - geo.h * 0.6 - 30}px)`; const c = dropCell(ev); stage.hover = c ? { ...c, ok: unitAt(c) } : null; return; }
    if (!drag) return; const p = local(ev);
    if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 10) drag.moved = true;
    drag.ghost.style.transform = `translate(${p.x - geo.w * 0.47}px, ${p.y - geo.h * 0.6 - geo.w * 0.8}px)`;
    const c = drag.moved ? dropCell(ev) : null; stage.hover = c ? { ...c, ok: why(drag.card, c.lane, c.col) === null } : null;
  }
  function onUp(ev: PointerEvent): void {
    if (press) { clearTimeout(press.timer); const p = press; press = null; infoMachine(p.k, p.id); return; }
    if (tdrag) { const t = tdrag; tdrag = null; t.ghost.remove(); stage.hover = null; const c = dropCell(ev); if (c && unitAt(c)) { queue.push({ t: 'token', lane: c.lane, col: c.col }); app.ui('lock-in', 0.6); } else app.ui('bump', 0.4); return; }
    if (!drag) return; const d = drag; drag = null; d.ghost.remove(); stage.hover = autoHint ? { lane: autoHint.lane, col: autoHint.col, ok: true } : null;
    if (!d.moved) {
      // 二档: tapping the glowing card confirms 墨子's hand (spec §3.20)
      if (autoHint && autoHint.card === d.card && performance.now() < autoHint.until) { tryPlace(d.card, autoHint.lane, autoHint.col); return; }
      select(selected === d.card ? null : d.card); app.ui('ui-tap', 0.5); return;
    }
    const c = dropCell(ev); if (c) tryPlace(d.card, c.lane, c.col); else app.ui('bump', 0.4);
  }
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  box.addEventListener('pointerdown', (ev) => {
    if (paused || ended || ghost || !ev.isPrimary) return;
    if (S.tokens <= 0) { app.ui('ui-locked', 0.4); box.classList.remove('is-no'); void box.offsetWidth; box.classList.add('is-no'); return; }
    ev.preventDefault(); const t = h('div', 'gf-dragtoken', '令'); hud.appendChild(t); tdrag = { ghost: t }; onMove(ev); app.ui('ui-pick', 0.5);
  });
  stageC.addEventListener('pointerdown', (ev) => {
    if (!ev.isPrimary || ended || ghost) return; const { x, y } = local(ev);
    const cell = cellAt(x, y);
    if (paused) return;
    if (selected && cell) { if (tryPlace(selected, cell.lane, cell.col)) select(null); return; }
    // grain first (hit area 64×64)
    for (const d of S.drops) { const p = stage.dropXY(S, d, performance.now()); if (Math.abs(p.x - x) < 34 && Math.abs(p.y - y) < 34) { collect(d.id, p.x, p.y); return; } }
    if (shovelMode && cell) { const u = S.units.find((q) => q.lane === cell.lane && q.col === cell.col); if (u) { queue.push({ t: 'shovel', lane: cell.lane, col: cell.col }); sfx.wood(0.7, 0.3); } setShovel(false); return; }
    // a machine → its card on release; holding 0.5 s marks it (spec §3.12.1: a tap never marks)
    for (const e of S.enemies) {
      if (e.gone || e.hp <= 0) continue; const p = stage.enemyXY(e, 1);
      if (Math.abs(p.x - x) < geo.w * 0.45 + 12 && y < p.y + 12 && y > p.y - geo.h * 0.95 - 12) {
        const id = e.id, k = e.k;
        press = { id, k, x: ev.clientX, y: ev.clientY, timer: window.setTimeout(() => { if (!press) return; press = null; queue.push({ t: 'mark', id: S.mark === id ? 0 : id }); app.ui('lock-in', 0.6); sfx.drum(0.4); }, 500) };
        return;
      }
    }
  });
  function collect(id: number, x: number, y: number): void {
    queue.push({ t: 'collect', id }); sfx.bell(4, 0.18); app.ui('coin', 0.45);
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
    tip.classList.add('is-on');
    const e = S.enemies.find((q) => q.id === id); if (e) { const p = stage.enemyXY(e, 1); tip.style.left = Math.max(8, Math.min(geo.W - 200, p.x - 90)) + 'px'; tip.style.top = Math.max(8, p.y - geo.h * 1.6) + 'px'; }
    (tip.querySelector('.gf-tip__flag') as HTMLElement).onclick = () => { queue.push({ t: 'mark', id: S.mark === id ? 0 : id }); tip.classList.remove('is-on'); app.ui('lock-in', 0.5); };
    clearTimeout(tipTimer); tipTimer = window.setTimeout(() => tip.classList.remove('is-on'), 3500);
  }
  for (const b of speed.querySelectorAll('button')) b.addEventListener('click', () => { if (ghost) return; speedSel = +(b as HTMLElement).dataset.s!; if (!tier) { app.save.settings.speed = speedSel as 0.75 | 1 | 1.5; app.persist(); } b.querySelector('.gf-new')?.remove(); app.ui('ui-toggle-on', 0.4); lastHud = ''; });
  pauseB.addEventListener('click', () => openPause());

  // ── pause ──
  const pauseLayer = h('div', 'gf-pausel'); el.appendChild(pauseLayer);
  function suspend(now = false): void { if (!ghost && !ended && o.onSnap) o.onSnap(snapshot(S), 'suspend', checkpointFlag, now); }
  function openPause(): void {
    if (ended || paused) return; paused = true; app.ui('ui-open', 0.5); suspend();
    pauseLayer.innerHTML = `<div class="gf-pausel__panel xg-root"><div class="gf-pausel__title">${ghost ? '墨子的推演' : '推演暂停'}</div>
      <button class="xg-btn xg-btn--primary xg-btn--lg" data-a="go">${icon('play')}继续</button>
      ${checkpoint && !ghost ? `<button class="xg-btn xg-btn--secondary" data-a="cp">${icon('flag')}从第 ${checkpointFlag} 面战鼓重来</button>` : ''}
      ${ghost ? '' : `<button class="xg-btn xg-btn--secondary" data-a="restart">${icon('restart')}整关重来</button>`}
      <button class="xg-btn xg-btn--ghost" data-a="map">${icon(ghost ? 'back' : 'map')}${ghost ? '回去' : '回地图'}</button></div>`;
    pauseLayer.classList.add('is-on');
    pauseLayer.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const a = (b as HTMLElement).dataset.a; pauseLayer.classList.remove('is-on');
      if (a === 'go') { paused = false; last = performance.now(); }
      else if (a === 'cp' && checkpoint) { const R = restoreSnap(checkpoint, L, { events: true, assist: tier }); if (R) { S = R; stage.reset(); resetHud(); paused = false; last = performance.now(); } }
      else if (a === 'restart') { S = fresh(o.seed + 1); stage.reset(); checkpoint = null; checkpointFlag = 0; resetHud(); paused = false; last = performance.now(); }
      else if (a === 'map') { finish(null); }
    }));
  }
  function resetHud(): void { lastHud = ''; s3ok = false; s3lost = false; star3.classList.remove('is-ok', 'is-lost'); beltSeen = S.beltI; beltFullSeen = S.stats.beltFull; warn.clear(); buildTray(); delete scroll.dataset.drums; scroll.querySelectorAll('.gf-scroll__drum').forEach((d) => d.remove()); }

  // ── kernel events → sound, voice, 鲁班 ──
  let lastBolts = 0, lastLobs = 0;
  stage.onEvent = (e: SimEvent) => {
    switch (e.type) {
      case 'spawn': if (e.k && !seenKinds.has(e.k)) {
        seenKinds.add(e.k);
        if (!ghost && (e.k === o.level.newEnemy || (o.level.newEnemy === 'swarm' && e.k === 'ant'))) { slowUntil = performance.now() + 4000; namePlate(hud, geo, e.lane ?? 2, nameOf(e.k)); stinger('newMachine'); setTimeout(() => luban('fort.luban.first'), 600); }
      } break;
      case 'gone': if (!e.log) { kills++; sfx.arp(kills % 4, 3, 0.06); if (!ghost && kills % 7 === 0 && performance.now() > lubanQuietUntil) { luban(`fort.luban.blocked.${1 + ((kills / 7) % 3)}`); lubanQuietUntil = performance.now() + 15000; } if (tut && !tut.firstGone) { tut.firstGone = true; setTimeout(() => mozi('fort.story.0.b1'), 900); } } break;
      case 'impact': sfx.thud(0.6); break;
      case 'strike': sfx.whoosh(0.3); break;
      case 'strikeLand': sfx.thud(0.8); break;
      case 'log': sfx.drum(0.7); sfx.thud(0.6); if (!ghost) luban('fort.luban.log'); break;
      case 'captured': sfx.bell(6, 0.3); break;
      case 'shellOn': luban('fort.luban.rhino.shell'); break;
      case 'shellOff': luban('fort.luban.rhino.crack'); sfx.arp(2, 5); break;
      case 'bossIn': luban('fort.luban.rhino'); break;
      case 'bossDone': stinger('bossFold'); break;
      case 'ult': sfx.arp(3, 5, 0.05); break;
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
      if (card) handTo(card.offsetLeft + card.offsetWidth / 2, card.offsetTop + card.offsetHeight / 2, t.x, t.y, 1); else handTap(t.x, t.y);
      card?.classList.add('is-hint'); setTimeout(() => card?.classList.remove('is-hint'), 1400);
    } else if (x.t === 'collect' && !ghostSaid.has('collect')) { ghostSaid.add('collect'); mozi('fort.ghost.collect'); }
    return a;
  }
  function tickOnce(): void {
    const acts = ghost ? ghostActs() : queue.splice(0);
    stage.beforeStep(S, performance.now());
    const flags = S.flags || [];
    if (flags.includes(S.tick)) {
      checkpoint = snapshot(S); checkpointFlag = flags.indexOf(S.tick) + 1; // memory copy now; the caller writes it when idle
      if (!ghost) o.onSnap?.(checkpoint, 'checkpoint', checkpointFlag);
      sfx.drum(0.8); setTimeout(() => sfx.drum(0.6), 220); stinger('flag');
      if (!ghost) luban(checkpointFlag === 1 ? (tut ? 'fort.story.0.b2' : 'fort.luban.flag.1') : 'fort.luban.flag.2');
    }
    step(S, acts);
    stage.afterStep(S, performance.now());
    if (S.bolts.length > lastBolts) sfx.twang(); if (S.lobs.length > lastLobs) sfx.whoosh(); lastBolts = S.bolts.length; lastLobs = S.lobs.length;
    if (ghost) { if (!ghostEnd && (S.tick >= ghost.w1 || S.result)) { ghostEnd = true; mozi('fort.ghost.try', true); setTimeout(() => finish(null), 3200); } return; }
    // coach: one look every 0.5 s (the kernel coach is a pure function of the visible state)
    if (S.tick % 10 === 0 && !tut) {
      const l = coachLine(S, mem);
      if (l) { const id = coachLineId(l); if (id) {
        mozi(id); pendingLine = { ...l, at: S.tick }; showHint(l);
        if (tier === 2 && l.card != null && l.lane != null && l.col != null && why(l.card, l.lane, l.col) === null) {
          autoHint = { card: l.card, lane: l.lane, col: l.col, until: performance.now() + 6000 }; if (!drag) stage.hover = { lane: l.lane, col: l.col, ok: true };
          if (!autoSaid) { autoSaid = true; setTimeout(() => !destroyed && mozi('fort.ui.assist2.tap'), 2600); }
        }
      } }
    }
    if (autoHint && performance.now() > autoHint.until) { autoHint = null; if (!drag) stage.hover = null; }
    if (pendingLine && S.tick - pendingLine.at > 8 * TPS) pendingLine = null;
    if (tut) tutorial();
  }
  function tutorial(): void {
    if (!tut) return; const t = S.tick;
    if (tut.phase === 0 && t >= 10) { tut.phase = 1; mozi('fort.lvl.1-1.1'); setTimeout(() => mozi('fort.lvl.1-1.2'), 2300); tut.at = t; }
    if (tut.phase === 1 && t - tut.at >= 30 && tut.placedAt < 0) { tut.phase = 2; showHint({ type: 'lane', key: 't', card: 'shooter', lane: 2, col: 1 }); tut.at = t; }
    if (tut.phase === 2 && tut.placedAt < 0 && t - tut.at >= 8 * TPS) { showHint({ type: 'lane', key: 't', card: 'shooter', lane: 2, col: 1 }); mozi('fort.lvl.1-1.again'); tut.at = t; }
    if (tut.phase === 2 && tut.placedAt >= 0) tut.phase = 3;
    if (tut.phase === 3 && S.drops.length && tut.firstGone) { tut.phase = 4; mozi('fort.lvl.1-1.collect'); const d = S.drops[0]; const p = stage.dropXY(S, d, performance.now()); handTap(p.x, p.y); }
    if (tut.phase === 4 && S.grain >= 80 && S.tick >= (S.cdReady.shooter ?? 0)) { tut.phase = 5; mozi('fort.lvl.1-1.more'); cards.shooter?.classList.add('is-hint'); setTimeout(() => cards.shooter?.classList.remove('is-hint'), 5000); }
  }
  function updateHud(): void {
    if (L.belt && S.belt.join() !== beltKey) {
      const arrived = S.beltI > beltSeen; beltSeen = S.beltI; buildTray();
      if (arrived && cardEls.length) { const b = cardEls[cardEls.length - 1]; b.classList.add('is-new'); horseDelivery(hud, { x: tray.offsetLeft - 60, y: tray.offsetTop + tray.offsetHeight / 2 }, { x: tray.offsetLeft + b.offsetLeft + b.offsetWidth / 2, y: tray.offsetTop + b.offsetTop + b.offsetHeight / 2 }, stage.reduced); sfx.wood(1.2, 0.25); }
    }
    if (S.stats.beltFull > beltFullSeen) { beltFullSeen = S.stats.beltFull; if (performance.now() - beltFullSaidAt > 20000) { beltFullSaidAt = performance.now(); mozi('fort.belt.full'); } tray.classList.remove('is-full'); void tray.offsetWidth; tray.classList.add('is-full'); }
    warn.update(S, geo);
    bossBar?.update(S);
    const night = !!L.env?.night && !(S.dawnAt != null && S.tick >= S.dawnAt);
    const inc = (S.skyNext >= 0 && !night ? 20 / 8 : 0) + S.units.reduce((a, u) => a + (u.k === 'farm' ? (night ? 10 : 20) / 18 : u.k === 'bank' && S.tick >= (u.armAt || 0) ? 50 / 16 : 0), 0);
    const key = [S.grain, S.tick >> 3, S.parts, S.tokens, speedSel, S.belt.length, S.stats.logsUsed].join('|'); if (key === lastHud) return; lastHud = key;
    if (L.belt) { if (!bin.classList.contains('is-belt')) { bin.classList.add('is-belt'); (bin.firstElementChild as HTMLElement).innerHTML = HORSE_SVG; } } else (bin.firstElementChild as HTMLElement).textContent = String(S.grain);
    if ((S.tick & 31) === 0 || !bin.lastElementChild!.textContent) (bin.lastElementChild as HTMLElement).textContent = L.belt ? '驿马送牒' : `每分钟 +${Math.floor(60 * inc)}`;
    const left = Math.max(0, (S.flags.length ? S.flags[S.flags.length - 1] : S.endTick) - S.tick) / TPS; // 沙漏: counted to the last 战鼓 (rev d)
    for (const b of cardEls) {
      const c = b.dataset.card!; const cd = L.belt ? 0 : Math.max(0, (S.cdReady[c] ?? 0) - S.tick); const full = UNITS[c].cd || 1;
      (b.querySelector('.gf-card__cd') as HTMLElement).style.height = `${Math.min(100, (cd / full) * 100)}%`;
      const short = L.belt ? 0 : UNITS[c].cost - S.grain; b.classList.toggle('is-poor', short > 0); b.classList.toggle('is-ready', cd === 0 && short <= 0);
      (b.querySelector('.gf-card__short') as HTMLElement).textContent = short > 0 ? `还差 ${short}` : '';
      const payback = c === 'farm' ? (night ? 63 : 27) : c === 'bank' ? 42 : 0; b.classList.toggle('is-late', payback > 0 && left < payback);
    }
    const ring = box.querySelector('.fg') as SVGCircleElement; ring.style.strokeDashoffset = String(100.5 * (1 - Math.min(20, S.parts) / 20));
    box.classList.toggle('is-ready', S.tokens > 0); box.classList.toggle('is-full', S.tokens >= 3);
    (box.querySelector('.gf-box__tokens') as HTMLElement).innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < S.tokens ? 'on' : ''}">令</i>`).join('');
    // bamboo scroll: script time with drums
    const end = Math.max(1, S.endTick); const fill = scroll.firstElementChild as HTMLElement; fill.style.width = `${Math.min(100, (S.tick / end) * 100)}%`;
    (scroll.querySelector('.gf-scroll__hand') as HTMLElement).style.left = `calc(${Math.min(100, (S.tick / end) * 100)}% - 14px)`;
    if (!scroll.dataset.drums) { scroll.dataset.drums = '1'; for (const f of S.flags) { const d = h('div', 'gf-scroll__drum'); d.style.left = `calc(${(f / end) * 100}% - 15px)`; d.dataset.t = String(f); scroll.appendChild(d); } }
    for (const d of scroll.querySelectorAll<HTMLElement>('.gf-scroll__drum')) { const ft = +d.dataset.t!; d.classList.toggle('is-near', S.tick >= ft - 5 * TPS && S.tick < ft); d.classList.toggle('is-past', S.tick >= ft); }
    for (const b of speed.querySelectorAll<HTMLElement>('button')) b.classList.toggle('is-on', +b.dataset.s! === speedSel);
    // 附加题 chip: live count, two little 檑木 for 守得稳, tick when done, grey once it can't be done
    if (!ghost) {
      const st = star3State(S); (star3.querySelector('.gf-star3__n') as HTMLElement).textContent = st.text;
      star3.querySelectorAll('.gf-star3__logs i').forEach((x, i) => x.classList.toggle('is-used', i < S.stats.logsUsed));
      if (st.ok && !s3ok) { s3ok = true; star3.classList.add('is-ok'); sfx.bell(7, 0.3); }
      if (!st.ok && s3ok && !st.lost) { s3ok = false; star3.classList.remove('is-ok'); }
      if (st.lost && !s3lost) { s3lost = true; s3ok = false; star3.classList.remove('is-ok'); star3.classList.add('is-lost'); setTimeout(() => !destroyed && !ended && mozi('fort.ui.bonusLost'), 1200); }
    }
  }
  function effSpeed(): number {
    let s = speedSel;
    if (s > 1) for (const f of S.flags) if (S.tick >= f - 100 && S.tick < f + 500) s = 1; // 1.5× falls back around each 大波 (§3.15)
    if (s > 1 && S.boss && !S.boss.done && S.enemies.some((e) => e.boss)) s = 1;
    if (performance.now() < slowUntil) s *= 0.6;
    return s;
  }
  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - last); last = now;
    if (!paused && !ended) {
      acc += dt * effSpeed(); let n = 0;
      while (acc >= 50 && n < 4) { tickOnce(); acc -= 50; n++; if (S.result || destroyed) break; }
      if (n === 4) acc = Math.min(acc, 50);
      if (S.result && !ended && !ghost) end();
    }
    if (destroyed) return;
    stage.render(S, paused || ended ? 1 : Math.min(1, acc / 50), now, dt);
    updateHud();
  }
  function end(): void {
    ended = true; const win = S.result === 'win'; const stars = starsOf(S);
    if (win) { luban('fort.luban.win'); sfx.arp(0, 6, 0.09); stinger('win'); } else { luban('fort.luban.lose'); sfx.drum(0.5); stinger('lose'); }
    app.mark('gf-level', { id: o.level.id, result: S.result, stars, assist: tier, logs: S.stats.logsUsed, sec: Math.round(S.tick / TPS), asked, hash: hash(S) });
    setTimeout(() => finish({ result: win ? 'win' : 'lose', S, stars, checkpoint, checkpointFlag, asked }), 1400);
  }
  function finish(r: BattleEnd | null): void { if (destroyed) return; destroy(); done(r); }
  function destroy(): void {
    destroyed = true; cancelAnimationFrame(raf); clearInterval(lubanTimer); clearTimeout(bubbleTimer); clearTimeout(tipTimer); if (press) clearTimeout(press.timer);
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
    app.voice.stop(); el.remove();
  }
  // intro lines (1-1 has its own script)
  if (ghost) setTimeout(() => !destroyed && mozi('fort.ghost.start'), 300);
  else if (!tut && !o.resume) { const v = o.level.voice; if (v) { mozi(v.intro[0]); setTimeout(() => !destroyed && mozi(v.intro[1]), 2600); } }
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  // test / dev hooks
  (window as unknown as { __gf?: unknown }).__gf = { get S() { return S; }, stage, place: tryPlace, collectAll: () => { for (const d of S.drops) queue.push({ t: 'collect', id: d.id }); }, token: (lane: number, col: number) => queue.push({ t: 'token', lane, col }), mark: (id: number) => queue.push({ t: 'mark', id }), setSpeed: (s: number) => { speedSel = s; }, pause: openPause, tile: TILE, cell: (l: number, c: number) => ({ x: cellCx(geo, c), y: feetY(geo, l) }), ghost: !!ghost, tier };

  return {
    layout(l: LayoutInfo): void { geo = makeGeo(l.width, l.height, l.safe.top, app.dpr); atlas = atlasFor(geo.w, app.dpr); stage.setGeo(geo, atlas); warn.clear(); paintBoard(); placeHud(); },
    destroy, pause: () => { if (!paused && !ended) openPause(); },
    leave: () => suspend(true),
  };
}
