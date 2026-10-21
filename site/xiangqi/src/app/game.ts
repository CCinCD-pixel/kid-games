// site/xiangqi/src/app/game.ts — 对局屏（对机器人 / 小局 / 面对面）：引擎的 createSession + createBoardView 之上的 HUD、教练、提示、托盘、结果卡、存档与复盘。
import { h, icon } from '@kit/ui';
import { xqResult } from './result';
import type { Companion } from '@kit/companion';
import { createBoardView, type BoardViewImpl } from '@engines/board/view/board-view';
import { createSession, restoreGame, type Session } from '@engines/board/play/session';
import { createFaceToFace, type FaceToFaceImpl } from '@engines/board/play/facetoface';
import { createReplayPlayer, type ReplayPlayer } from '@engines/board/play/replay';
import { createIdleTimer } from '@engines/board/core/hints';
import { replayMoves } from '@engines/board/core/game';
import type { AiHintResult } from '@engines/board/ai/protocol';
import type { CoachRow, Disposable, Orientation, Outcome, Side } from '@engines/board/core/types';
import { createRules, type XqCfg } from '../rules/rules';
import { Position, parseMove, notation } from '../rules/position';
import { createFx, type Fx } from '../art/fx';
import { robotSvg } from '../art/robots';
import { detectHighlights, pickHighlights, type Highlight } from '../rules/highlights';
import { openRealBoard, openSettings, showWallAward } from './panels';
import { robotById, ROBOTS } from '../rules/robots';
import { GLYPH } from './theme';
import { getAi, searchBudget, fallbackMove } from '../ai/client';
import { createAiRecovery } from './ai-recover';
import { renderCoordRow, bottomSideOf, a11yRelabel } from '../art/coords';
import { layout, type Layout, type Vp } from './layout';
const VALS = [0, 0, 200, 200, 400, 900, 450, 100];
import { place, setBack, setBubbleW, sleep, type AppCtx, type Screen } from './ctx';
import { recordResult, type GameMode, type HouseRules, type SavedGameRec } from '../progress/save';
import { lineText } from './lines';

export interface GameParams { mode: GameMode; robotId?: string; xjId?: string; startFen: string; moves?: string[]; side: 0 | 1; handicap: string; seed: number; coach: boolean; easy: boolean; rules: HouseRules; undo?: number; used?: [number, number]; hints?: number; coachShown?: number; coachAccepted?: number; startedAt?: number; lesson?: string }
const SOFT_CAP_PLIES = 60;
const cfgOf = (r: HouseRules): XqCfg => ({ stalemate: r.stalemate, perpetual: r.perpetual, limit: r.limit });
const REASON_LINE: Record<string, string> = { checkmate: 'g.mate', 'stalemate-loss': 'g.stale', 'perpetual-check': 'g.perp' };

export function mountGame(ctx: AppCtx, p: GameParams): Screen {
  const f2f = p.mode === 'f2f', xj = p.mode === 'xj'; const cfg: XqCfg = f2f ? cfgOf(p.rules) : { stalemate: 'loss', perpetual: 'loss', limit: 120 };
  const rules = createRules(cfg); const robot = f2f ? null : robotById(p.robotId ?? 'R1'); const kid = p.side; const ai = getAi();
  const state = { undo: p.undo ?? 0, hints: p.hints ?? 0, coachShown: p.coachShown ?? 0, coachAccepted: p.coachAccepted ?? 0, startedAt: p.startedAt ?? Date.now(), ended: false, tired: false, softShown: false, replaying: false, coachOn: p.coach };
  const used: [number, number] = p.used ? [p.used[0], p.used[1]] : [0, 0]; let perpWarn = false; let slowSaid = false; let coachLeft = robot ? robot.level.coachCap : 0; if (p.coach && robot && robot.level.coachCap === 0) coachLeft = 3;
  const subs: Disposable[] = []; let destroyed = false; let vpNow = ctx.vp(); const coordsOn = (): boolean => ctx.save.settings.coords || state.replaying; let L: Layout = layout(vpNow, { screen: f2f ? 'f2f' : 'game', coords: coordsOn(), lefty: ctx.save.settings.handedness === 'left' });

  // ───────── DOM ─────────
  const root = h('div', { class: 'xq-screen xq-game', 'data-screen': f2f ? 'f2f' : 'game' }); const host = h('div', { class: 'xq-host' }); root.append(host);
  const titleEl = h('div', { class: 'xq-title' }); const dock = h('div', { class: 'xq-dock' }); const botHost = h('div', { class: 'xq-bot' }); root.append(dock, titleEl, botHost);
  const key = (id: string, ic: Parameters<typeof icon>[0], label: string, fn: () => void, cls = ''): HTMLButtonElement => { const b = h('button', { type: 'button', class: `xq-key ${cls}`, 'aria-label': label, 'data-key': id, onclick: fn }); b.innerHTML = `${icon(ic)}<span>${label}</span>`; root.append(b); return b; };
  const trayEls: HTMLElement[] = [h('div', { class: 'xq-tray', 'data-side': '0' }), h('div', { class: 'xq-tray', 'data-side': '1' })]; root.append(...trayEls);
  const coordEl = h('div', { class: 'xq-coordrow' }); root.append(coordEl); const chip = h('button', { type: 'button', class: 'xq-chip', 'aria-label': '吃子' }); root.append(chip); let pop: HTMLElement | null = null;
  const keys: Record<string, HTMLButtonElement> = {}; const clusterKeys: { el: HTMLButtonElement; seat: Side }[] = [];

  const orientation: Orientation = f2f ? 'first-bottom' : kid === 1 ? 'second-bottom' : 'first-bottom';
  const { game: game0, truncated } = restoreGame(rules, p.startFen, p.moves ?? [], cfg);
  const view: BoardViewImpl<number, Position> = createBoardView<number, Position>(host, { rules, theme: ctx.theme, orientation, seat: f2f ? 'f2f' : 'single', coords: ctx.save.settings.coords, reducedMotion: false });
  const fx: Fx = createFx(view); const unRelabel = a11yRelabel(view.el);
  if (f2f) view.setPieceRotation('seat');
  view.setTrayAnchor(0, () => trayEls[0].getBoundingClientRect()); view.setTrayAnchor(1, () => trayEls[1].getBoundingClientRect());
  const session: Session<number, Position> = createSession({ rules, view, game: game0, seat: f2f ? 'f2f' : 'single', kidSide: kid, ai: robot ? ai : undefined, robot: robot ? { level: p.easy ? robot.easy : robot.level, gameSeed: p.seed, thinkMs: 600, budget: searchBudget(), cfg } : null });
  /** session.restart 会换一个新的 Game：所有地方都经这个转发器取当前局，避免读到旧局 */
  const game = new Proxy({} as typeof game0, { get: (_t, k) => { const g = session.game as unknown as Record<string | symbol, unknown>; const v = g[k]; return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(g) : v; } });
  let f2fUi: FaceToFaceImpl | null = null; if (f2f) f2fUi = createFaceToFace({ host: root, board: view.el, lock: (r) => session.input.lock(r), sideName: (s) => (s === 0 ? '红方' : '黑方'), strings: { ask: (k, n) => (k === 'undo' ? `${n}想悔棋，退回到${n}上一步之前，可以吗？` : `${n}想和棋，可以吗？`) } });
  let bot: Companion | null = null;
  let avatar: HTMLElement | null = null; if (robot) { avatar = h('span', { class: 'xq-av', 'data-robot': robot.id }); avatar.innerHTML = robotSvg(robot.id); }
  const oppEl = h('div', { class: 'xq-opp', 'data-robot': robot?.id ?? '' }); if (robot) oppEl.innerHTML = robotSvg(robot.id); const inTray = h('div', { class: 'xq-intray' }); root.append(inTray, oppEl);
  const avatars = (): HTMLElement[] => [avatar, oppEl.style.display !== 'none' ? oppEl : null].filter(Boolean) as HTMLElement[];
  const left = (): boolean => ctx.save.settings.handedness === 'left'; const material = (): boolean => ctx.save.settings.material !== false;

  // ───────── 布局 ─────────
  function topRect(): { x: number; y: number; w: number; h: number } { const home = L.home; const x = home.x + home.w + 10; const right = (L.skip ? L.skip.x : L.S.x + L.S.w - 12) - 8; if (L.portrait) return { x, y: home.y, w: Math.max(80, (L.panel ? L.panel.x + L.panel.w : L.S.x + L.S.w - 12) - x), h: home.h }; const px = L.panel!.x; return { x: px + home.w + 10, y: home.y, w: Math.max(80, L.panel!.x + L.panel!.w - (px + home.w + 10)), h: home.h }; void right; }
  const frameTrayTop = (): 0 | 1 => (orientation === 'first-bottom' ? 0 : 1);
  function applyLayout(vp: Vp): void {
    vpNow = vp; L = layout(vp, { screen: f2f ? 'f2f' : 'game', coords: coordsOn(), lefty: left() }); view.layout({ x: L.board.x, y: L.board.y, w: L.board.w, h: L.board.h });
    place(dock, L.dock ?? L.panel); place(botHost, L.companion); place(titleEl, f2f && L.portrait ? null : topRect());
    setBack(L.home); setBubbleW(L.bubble.w);
    const names = ['undo', 'hint', 'resign', 'menu']; if (!f2f && !state.replaying) names.forEach((n, i) => { if (keys[n]) place(keys[n], L.keys[i]); }); if (state.replaying) replayBtns.forEach((b, i) => place(b, L.keys[i]));   // 左手顺手由 layout 整体镜像（横屏面板在左、竖屏键组靠左），键序固定：灯泡永远是左起第二个
    place(coordEl, L.coordRow); if (L.coordRow) renderCoordRow(coordEl, L.c, bottomSideOf(orientation));
    if (f2f && L.redCluster && L.blackCluster) clusterKeys.forEach((c, i) => { const cl = c.seat === 0 ? L.redCluster! : L.blackCluster!; place(c.el, cl.keys[i % 3]); });
    if (L.trays.mode === 'frame') { const topSide = frameTrayTop(); const rt = L.trays.top, rb = L.trays.bottom; place(trayEls[topSide], rt); place(trayEls[1 - topSide], rb); trayEls[topSide].style.justifyContent = L.portrait ? 'flex-end' : ''; trayEls[1 - topSide].style.justifyContent = ''; root.style.setProperty('--xq-cap', `${Math.max(18, Math.min(30, rt.h - 4))}px`); chip.style.display = 'none'; }
    else if (L.trays.mode === 'chip') { place(chip, L.trays.chip); trayEls.forEach((t) => (t.style.display = 'none')); }
    else { chip.style.display = 'none'; trayEls.forEach((t) => (t.style.display = 'none')); }
    renderTrays(); closePop(); applyFree();
  }
  /** 版面里没人用的那块空地：手机竖屏 = 伙伴行与键行之间；横屏 = 键组下方。放吃子托盘 / 机关人大头像，不再留一片空白。 */
  function applyFree(): void {
    oppEl.style.display = 'none'; inTray.style.display = 'none'; if (f2f || !robot || L.keys.length === 0) return;
    const d = L.dock ?? L.panel; if (!d) return; const kx = L.keys.map((k) => k.y), kb = L.keys.map((k) => k.y + k.h);
    const r = L.portrait ? { x: d.x + 8, y: Math.max(L.companion.y + L.companion.h, d.y + 62) + 4, w: d.w - 16, h: Math.min(...kx) - 6 - (Math.max(L.companion.y + L.companion.h, d.y + 62) + 4) } : { x: d.x + 8, y: Math.max(...kb) + 8, w: d.w - 16, h: d.y + d.h - 8 - (Math.max(...kb) + 8) };
    if (r.h < 44 || r.w < 100) return;
    if (L.trays.mode === 'chip') { const sz = Math.min(r.h, 84); place(oppEl, { x: r.x + r.w - sz, y: r.y + (r.h - sz) / 2, w: sz, h: sz }); place(inTray, { x: r.x, y: r.y, w: r.w - sz - 8, h: r.h }); inTray.style.display = 'flex'; chip.style.display = 'none'; fillInTray(); }
    else { const sz = Math.min(r.w, r.h, 150); place(oppEl, { x: r.x + (r.w - sz) / 2, y: r.y + (r.h - sz) / 2, w: sz, h: sz }); }
  }
  function fillInTray(): void { inTray.replaceChildren(); for (const sd of [1, 0] as const) { const row = h('div', { class: 'xq-tray' }); fillTray(row, sd); row.style.setProperty('--xq-cap', '24px'); inTray.append(row); } }

  // ───────── 托盘 ─────────
  const capGlyph = (p0: { type: number; side: Side }): string => GLYPH[p0.type]?.[p0.side] ?? '?';
  function fillTray(el: HTMLElement, side: Side): void { el.replaceChildren(); for (const c of game.captured(side).slice(-16)) el.append(h('span', { class: 'xq-cap', 'data-side': String(side) }, capGlyph(c))); const diff = material() ? game.materialDiff(side === 0 ? 1 : 0) : 0; if (diff > 0) el.append(h('span', { class: 'xq-diff' }, `+${diff}`)); }
  function renderTrays(): void {
    fillTray(trayEls[0], 0); fillTray(trayEls[1], 1); if (inTray.style.display === 'flex') fillInTray();
    if (L.trays.mode === 'chip') { const d = game.materialDiff(kid); chip.textContent = material() ? `吃子 ${d > 0 ? '+' : ''}${d}` : '吃子'; }
  }
  function closePop(): void { pop?.remove(); pop = null; }
  chip.addEventListener('click', () => { if (pop) { closePop(); return; } const r = L.trays.mode === 'chip' ? (L.popover ?? L.trays.chip) : null; if (!r) return; pop = h('div', { class: 'xq-pop' }); for (const s of [1, 0] as const) { const t = h('div', { class: 'xq-tray' }); fillTray(t, s); pop.append(t); } place(pop, r); root.append(pop); });

  // ───────── 说话 / 状态 ─────────
  const say = (id: string, mood?: Parameters<AppCtx['speak']>[2] extends infer O ? (O extends { mood?: infer M } ? M : never) : never): void => { void ctx.speak(bot, id, { mood }); };
  function renderTitle(): void {
    const out = session.outcome(); const turn = game.turn(); const chk = !out.over && !!rules.check(game.state());
    let status = ''; let on = false;
    if (out.over) status = '这盘下完了'; else if (f2f) { status = turn === 0 ? '红方走' : '黑方走'; on = true; } else if (turn === kid) { status = chk ? '将军！应将' : perpWarn ? '别再一直将军' : '轮到你了'; on = true; } else status = `${robot?.name ?? ''}想想…`;
    const name = f2f ? '和爸爸下' : xj ? `小局 · ${robot?.name}` : `对 ${robot?.name}`;
    titleEl.replaceChildren(...(avatar ? [avatar] : []), h('span', null, name), h('span', { class: 'xq-turn', 'data-on': on ? '1' : '0', 'data-check': chk ? '1' : '0', 'data-warn': perpWarn && !chk ? '1' : '0' }, status)); if (f2fUi && !out.over) f2fUi.turnLamp(turn);
  }

  // ───────── 存档 ─────────
  function persist(): void {
    if (state.ended) return; const rec: SavedGameRec = { mode: p.mode, robot: p.robotId, xjId: p.xjId, startFen: game.startFen, moves: game.encoded(), side: kid, handicap: p.handicap, seed: p.seed, coach: p.coach, easy: p.easy, rules: p.rules, undo: state.undo, used: [used[0], used[1]], hints: state.hints, coachShown: state.coachShown, coachAccepted: state.coachAccepted, startedAt: state.startedAt, ...(p.lesson ? { lesson: p.lesson } : {}) };
    ctx.save.game = rec; ctx.persist();
  }

  // ───────── 提示（H0–H3）─────────
  let hintMarks: Disposable[] = []; let hintTier = 0;
  const clearHint = (): void => { for (const d of hintMarks) d.dispose(); hintMarks = []; hintTier = 0; };
  const idle = createIdleTimer({ ms: 30_000, onIdle: () => keys.hint?.classList.add('is-ready'), isBusy: () => session.phase !== 'play' });
  async function doHint(): Promise<void> {
    if (state.ended || session.phase !== 'play' || (!f2f && game.turn() !== kid)) return; keys.hint?.classList.remove('is-ready'); idle.touch();
    for (const d of hintMarks) d.dispose(); hintMarks = []; hintTier = Math.min(3, hintTier + 1); state.hints++;
    try {
      const r = await ai.request<AiHintResult>({ op: 'hint', startFen: game.startFen, moves: game.encoded(), cfg, tier: hintTier as 1 | 2 | 3 }); if (destroyed || r.move === null) return;
      hintMarks.push(view.mark('hint', [r.from], { pulse: true })); if (hintTier >= 2) hintMarks.push(view.arrow(r.from, r.to, 'hint')); if (hintTier >= 3) hintMarks.push(view.mark('star', [r.to]));
      ctx.sfx('hint'); say(hintTier === 1 ? 'h.2' : hintTier === 2 ? 'h.2b' : 'h.3', 'encouraging');
    } catch { /* 取消 / 超时：静默 */ }
  }

  // ───────── 提问卡 ─────────
  const openAsks = new Set<() => void>();      // 还开着的提问卡（终局时一并收掉：QA r2 m8——"长将提醒"不该盖在"这盘下完了"上）
  function ask(msg: string, btns: [string, string] | [string], rot = false): Promise<number> {
    return new Promise((res) => {
      const release = session.input.lock('modal'); let closed = false; const shut = (i: number): void => { if (closed) return; closed = true; openAsks.delete(dismiss); el.remove(); release(); res(i); }; const dismiss = (): void => shut(0);
      const el = h('div', { class: 'xq-ask', 'data-ask': '1' }, h('p', null, msg), h('div', { class: 'row' }, ...btns.map((b, i) => h('button', { type: 'button', class: `xq-btn ${i ? 'is-sub' : ''}`, onclick: () => shut(i) }, b))));
      const r = L.dock ?? L.panel!; place(el, { x: r.x, y: r.y - (L.portrait ? 0 : 0), w: r.w, h: Math.max(r.h, 120) }); if (rot) el.classList.add('is-rot'); root.append(el); openAsks.add(dismiss);
    });
  }
  /** 有提问卡 / 同意卡开着：其他键（悔棋 / 和棋 / 认输…）先不响应，不叠第二张卡 */
  const cardOpen = (): boolean => openAsks.size > 0 || !!f2fUi?.open;

  // ───────── 教练 + 长将提醒（提交前拦截）─────────
  let coachRows: Map<string, CoachRow> | null = null; let coachEpoch = 0; let coachMarks: Disposable[] = [];
  async function refreshCoach(): Promise<void> {
    coachRows = null; const my = ++coachEpoch; if (!robot || !state.coachOn || coachLeft <= 0 || state.ended || game.turn() !== kid) return;
    try { const rows = await ai.request<CoachRow[]>({ op: 'coach', startFen: game.startFen, moves: game.encoded(), cfg }); if (my === coachEpoch && !destroyed) coachRows = new Map(rows.map((r) => [r.m, r])); } catch { /* 没算好就不提醒 */ }
  }
  function revert(): void { view.finishAnimations(); view.setState(game.state()); session.input.select(null); }
  /** 提交前的提醒（长将预警 / 教练）。不再在输入锁里等孩子回答（会触发 2 秒看门狗警告）：先把子放回去，回答之后才真正走。 */
  const needsGate = (m: number): boolean => (cfg.perpetual !== 'off' && game.wouldEndBadly(m)) || (!!coachRows?.get(rules.encode(m))?.reason && coachLeft > 0);
  async function confirmFlow(m: number): Promise<boolean> {
    const enc = rules.encode(m); const mover = game.turn();
    if (cfg.perpetual !== 'off' && game.wouldEndBadly(m)) {
      const msg = f2f ? '这样走，同一个局面第三次出现，按家规「长将判负」。换个走法？' : lineText('g.perp.warn');
      const c = await ask(msg, ['换个走法', '就这样走'], f2f && mover === 1); if (c === 0) return false;
    }
    const row = coachRows?.get(enc);
    if (row?.reason && coachLeft > 0) {
      coachLeft--; state.coachShown++; if (row.reason === 'hang') coachMarks.push(view.mark('danger', [row.victim]));
      if (row.reason === 'hang') coachMarks.push(view.arrow(row.attacker, row.victim, 'warn')); const cid = row.reason === 'allowMate' ? 'c.mate' : row.movedIsVictim ? 'c.hang' : 'c.hang2'; say(cid, 'surprised');
      const c = await ask(lineText(cid), ['再想想', '就这样走']); for (const d of coachMarks) d.dispose(); coachMarks = [];
      if (c === 0) { state.coachAccepted++; persist(); say('s.again', 'encouraging'); return false; } say('c.go');
    }
    return true;
  }
  session.input.overrideHooks({
    commit: async (m: number) => {
      clearHint(); idle.touch();
      if (needsGate(m)) { revert(); void confirmFlow(m).then(async (go) => { if (destroyed || state.ended) return; if (go) { if (session.phase === 'play') await session.play(m); } else revert(); }); return; }
      await session.play(m);
    },
  });

  // ───────── 机关人的"小动作"（tell）+ 走子音 + 危险点 ─────────
  let okSaid = 0; let tellEls: Element[] = []; let tellMarks: Disposable[] = []; const tellTimers: number[] = []; let dangerMarks: Disposable[] = [];
  const later = (fn: () => void, ms: number): void => { tellTimers.push(window.setTimeout(fn, ms)); };
  function tellStop(): void { for (const a of [avatar, oppEl]) a?.classList.remove('is-think', 'is-mate'); for (const t of tellTimers) clearTimeout(t); tellTimers.length = 0; for (const e of tellEls) e.remove(); tellEls = []; for (const m of tellMarks) m.dispose(); tellMarks = []; }
  function tellLine(target: number): void {
    const src = oppEl.style.display !== 'none' ? oppEl : avatar; if (!src || destroyed) return; const rb = root.getBoundingClientRect(), a = src.getBoundingClientRect(), r = view.rect(target); const ax = a.left + a.width / 2 - rb.left, ay = a.top + a.height / 2 - rb.top, bx = r.left + r.width / 2 - rb.left, by = r.top + r.height / 2 - rb.top;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'xq-tell'); svg.innerHTML = `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/><circle cx="${bx}" cy="${by}" r="${r.width * 0.46}"/>`; root.append(svg); tellEls.push(svg); svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: 'forwards' });
  }
  function tellStart(): void {
    if (!robot || f2f || state.ended) return; tellStop(); for (const a of avatars()) a.classList.add('is-think'); const st = game.state().clone(); const mine = st.side;
    switch (robot.id) {
      case 'R2': { let best = -1, bv = -1; for (const m of st.legal()) { const t = st.b[m >> 7]; if (t && VALS[t & 7] > bv) { bv = VALS[t & 7]; best = m >> 7; } } if (best >= 0) later(() => tellLine(best), 220); break; }
      case 'R3': later(() => { const b = view.el as HTMLElement; const line = h('div', { class: 'xq-scanline' }); b.append(line); tellEls.push(line); line.animate([{ transform: 'translateY(0)', opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translateY(${b.clientHeight * 0.5}px)`, opacity: 0.9 }], { duration: 900, easing: 'ease-in-out', fill: 'forwards' }); }, 150); [0, 0.3, 0.6].forEach((d, i) => later(() => ctx.sfx('ui-pick', { rate: 0.9 + i * 0.12, volume: 0.4 }), 150 + d * 1000)); break;
      case 'R4': for (const m of st.legal()) { st.make(m); const over = st.legal().length === 0; st.unmake(); if (over) { const k = st.ksq[(mine ^ 8) >> 3]; if (k >= 0) { tellMarks.push(view.mark('hint', [k], { pulse: true })); for (const a of avatars()) a.classList.add('is-mate'); ctx.sfx('chime', { volume: 0.5 }); } break; } } break;
      case 'R5': [0, 1, 2].forEach((i) => later(() => ctx.sfx('ui-pick', { rate: 1 + i * 0.15, volume: 0.45 }), 250 + i * 280)); break;
      case 'R6': for (let i = 0; i < 7; i++) later(() => ctx.sfx('blip-happy', { rate: 0.8 + i * 0.12, volume: 0.3 }), 120 + i * 130); break;
    }
  }
  function robotMoveSound(): void {
    if (!robot) return; const [nm, r] = robot.sfx.split('@'); const rate = Number(r) || 1; const at = (d: number, rt: number): void => { setTimeout(() => ctx.sfx(nm, { rate: rt, volume: 0.55 }), d); };
    switch (robot.id) { case 'R2': ctx.sfx(nm, { rate }); at(95, rate * 1.12); break; case 'R3': ctx.sfx(nm, { rate }); at(70, rate * 1.1); at(140, rate * 1.2); break; case 'R4': ctx.sfx(nm, { rate }); at(110, rate * 1.5); break; case 'R6': [1, 1.25, 1.5].forEach((mm, i) => at(i * 80, rate * mm)); break; default: ctx.sfx(nm, { rate }); }
  }
  const captureWasSafe = (m: number): boolean => !game.state().attacked(m >> 7, kid === 0 ? 8 : 0);
  const clearDanger = (): void => { for (const d of dangerMarks) d.dispose(); dangerMarks = []; };
  function refreshDanger(): void {
    clearDanger(); if (!ctx.save.settings.dangerHatch || f2f || state.ended || game.turn() !== kid) return; const st = game.state(); const mine = kid === 0 ? 0 : 8, enemy = mine ^ 8; const sqs: number[] = [];
    for (let sq = 0; sq < 90 && sqs.length < 3; sq++) { const pc = st.b[sq]; if (!pc || (pc & 8) !== mine || (pc & 7) === 1) continue; const att = st.attackers(sq, enemy); if (!att.length) continue; const minA = Math.min(...att.map((a) => VALS[st.b[a] & 7])); if (!st.attacked(sq, mine) || minA < VALS[pc & 7]) sqs.push(sq); }
    if (sqs.length) dangerMarks.push(view.mark('danger', sqs));
  }

  /** 长将预警（规格 §3.5）：当前局面第 2 次出现、且走子方窗口内每步都在将军 → 提醒（可悔棋）。对机器人：只提醒孩子（机器人自己会避开）；面对面：朝向走子方的提示卡，按家规分支。 */
  function perpHeadsUp(): void {
    if (cfg.perpetual === 'off' || state.ended || session.outcome().over) return; const turn = game.turn();
    if (f2f) {
      const w = game.warn(); const dup = cfg.perpetual === 'warn' && game.repCount() >= 2 && !!rules.check(game.state());
      if (!w.warn && !dup) return; const msg = w.warn ? '再这样一直将军，按家规「长将判负」。可以换个走法，也可以悔棋。' : '同样的局面出现两次了，再来一次就和棋（家规：长将只提醒）。';
      void ask(msg, ['知道了'], turn === 1); return;
    }
    const w = game.warn(); if (w.warn && w.side === kid) { perpWarn = true; renderTitle(); say('g.perp.warn', 'surprised'); }
  }
  // ───────── 机器人请求失败的恢复 ─────────
  const recovery = robot ? createAiRecovery({
    stalled: () => !destroyed && !state.ended && session.phase === 'play' && !session.outcome().over && game.turn() !== kid,
    retry: () => session.poke(),
    fallbackMove: () => fallbackMove({ op: 'move', startFen: game.startFen, moves: game.encoded(), cfg, level: p.easy ? robot.easy : robot.level, gameSeed: p.seed, budget: { maxMs: 600, maxDepth: 3 } }),
    playRobot: async (enc) => { const m = rules.decode(game.state(), enc); if (m === null) throw new Error('bad-move'); await session.play(m, { robot: true }); },
    giveBack: async () => {
      if (game.moves.length > 0 && game.turn() !== kid) return (await session.undo()) ? 'undo' : 'none';                       // 退掉孩子刚走的那步 → 回合还给孩子（不计孩子的悔棋次数）
      const m = rules.legalMoves(game.state())[0]; if (m === undefined) return 'none'; await session.play(m, { robot: true }); return 'move';   // 开局就轮到机器人：替它走一步合法着
    },
    say: (k) => say(k === 'slow' ? 's.slow' : 's.sorry', 'encouraging'), sleep,
  }) : null;
  // ───────── 事件 ─────────
  let lastWhy = new Map<string, number>(); let yourSaid = 0;
  subs.push(view.on('landed', ({ sq }) => { fx.ripple(sq); ctx.sfx('place-piece', { rate: 0.95 + Math.random() * 0.1 }); }), view.on('captured', ({ sq }) => { fx.sparks(sq, { n: 10 }); fx.shake(3); ctx.sfx('capture'); }), view.on('bump', () => ctx.sfx('bump')), view.on('lift', () => ctx.sfx('ui-select', { volume: 0.5 })), view.on('checked', ({ sq }) => fx.checkPulse(sq)));
  subs.push(session.on('illegal', (e) => { const r = e.reason; if (!r) return; fx.reason(game.state(), e.from, e.to, r); if (r === 'face') ctx.sfx('ui-notify', { volume: 0.7 }); const t = performance.now(); if (t - (lastWhy.get(r) ?? -1e9) > 30_000) { lastWhy.set(r, t); say(`w.${r}`, 'encouraging'); } }));
  subs.push(session.on('aiThinking', (e) => { bot?.setMood(e.on ? 'thinking' : 'idle'); renderTitle(); if (e.on) tellStart(); else tellStop(); }));
  subs.push(session.on('move', (e) => {
    perpWarn = false; if (e.robot) recovery?.onRobotMove(); renderTitle(); renderTrays(); persist(); idle.touch(); clearHint(); clearDanger(); if (robot && e.robot) { fx.windup(e.m & 127); robotMoveSound(); }
    if (e.check) { ctx.sfx('ui-notify'); if (e.by === kid || f2f) bot?.react('fan'); else { bot?.setMood('surprised'); if (!state.ended) say(ctx.save.settings.coords ? 'g.check3' : 'g.checked', 'encouraging'); } }
    if (!f2f && !e.robot && e.capture) { bot?.react('hop'); if (okSaid < 2 && captureWasSafe(e.m)) { okSaid++; say('f.ok3', 'happy'); bot?.react('fan'); } } if (!f2f && e.robot && e.capture) bot?.setMood('encouraging');
    if (!f2f && e.robot) { if (!state.ended && performance.now() - yourSaid > 20_000) { yourSaid = performance.now(); } void refreshCoach(); refreshDanger(); }
    if (!state.ended) perpHeadsUp(); if (e.robot && ai.fallbackActive && !slowSaid && !state.ended) { slowSaid = true; say('s.slow', 'encouraging'); }
    if (xj && !state.softShown && game.ply() >= SOFT_CAP_PLIES && !state.ended) void softCap();
    // 疲惫裁定：R1–R3 在限着即将和棋（119 步）而孩子子力领先 ≥9 → 判孩子胜
    if (robot && robot.level.resign && !state.ended && cfg.limit > 0 && game.noProgress() >= cfg.limit - 1 && game.materialDiff(kid) >= 9) { state.tired = true; session.resign((1 - kid) as Side); }
  }));
  subs.push(session.on('undo', () => { perpWarn = false; renderTitle(); renderTrays(); persist(); clearHint(); }));
  subs.push(session.on('aiError', () => { void recovery?.onError(); }));
  subs.push(session.on('end', (e) => { void onEnd(e.outcome); }));
  subs.push(session.on('phase', () => renderTitle()));

  async function softCap(): Promise<void> {
    state.softShown = true; say('g.cap'); const c = await ask(lineText('g.cap'), ['再试一次', '继续']);
    if (c === 0) { session.restart(p.startFen); state.undo = 0; state.softShown = false; renderTitle(); renderTrays(); persist(); void refreshCoach(); }
  }

  // ───────── 终局 ─────────
  async function onEnd(out: Outcome): Promise<void> {
    if (state.ended || destroyed) return; state.ended = true; for (const d of [...openAsks]) d(); idle.stop(); clearHint(); delete ctx.save.game; renderTitle(); renderTrays();
    const winner = out.over ? out.winner : null; const reason = out.over ? (state.tired ? 'tired' : out.reason) : ''; const kidWon = winner === kid, drew = winner === null;
    const result: 'w' | 'd' | 'l' = drew ? 'd' : kidWon ? 'w' : 'l';
    const ix = Math.max(0, ROBOTS.findIndex((r) => r.id === (p.robotId ?? 'R1'))); const firstWin = !f2f && result === 'w' && (ctx.save.robots[p.robotId ?? 'R1']?.w ?? 1) === 0; if (out.over && winner !== null && (reason === 'checkmate' || reason === 'stalemate-loss')) { const k = game.state().ksq[1 - winner]; if (k >= 0) { fx.burst(k, reason === 'checkmate' ? 'mate' : 'stale'); fx.shake(4); } } let line = ''; let title = ''; let text = ''; let stars: 0 | 1 | 2 | 3 = 0;
    if (f2f) { ctx.save.stats.f2fGames++; title = drew ? '和棋' : winner === 0 ? '红方胜' : '黑方胜'; line = 'd.end'; text = reasonText(reason, winner === 0 ? '红方' : '黑方'); }
    else {
      const rr = REASON_LINE[reason]; line = reason === 'resign' ? (kidWon ? 'g.resign.win' : 'g.resign') : reason === 'tired' ? 'g.tired' : drew ? (reason === 'repetition' ? 'g.draw.rep' : reason === 'no-capture-limit' ? 'g.draw.cap' : reason === 'no-attackers' ? 'g.draw.none' : 'g.draw.ok') : rr ? `${rr}.${kidWon ? 'win' : 'lose'}` : 'g.draw.ok';
      title = result === 'w' ? '你赢了！' : result === 'd' ? '和棋，没输' : '这盘输了，没关系'; text = result === 'w' ? '你想得很仔细。' : result === 'd' ? lineText('g.draw.ok') : '先看看自己下得好的地方，再来一盘。';
      if (reason === 'perpetual-check') text = result === 'l' ? '长将判负：一直将军、局面重复三次，按规则判输。下次换个走法。' : '对方一直将军，按「长将判负」的规则，判你赢。';
      if (reason === 'stalemate-loss') text = result === 'w' ? '对方无路可走。象棋里这叫「困毙」，判你赢！' : '你没有路可走了。象棋里这样判输，叫「困毙」。';
      if (xj && result === 'w') line = 'xj.win';
      const rec = recordResult(ctx.save, { robot: p.robotId ?? 'R1', mode: xj ? 'xj' : 'full', xjId: p.xjId, result, plies: game.ply(), undo: state.undo, coachShown: state.coachShown, coachAccepted: state.coachAccepted, kidSide: kid, hintsUsed: state.hints, helped: p.easy || state.coachShown > 0 || p.handicap !== 'none' }); void rec;
      if (p.lesson && !xj) { const old = ctx.save.lessons[p.lesson]; ctx.save.lessons[p.lesson] = { stars: result === 'w' ? 3 : 2, stepId: old?.stepId ?? `${p.lesson}.1`, done: true }; }   // 第一盘棋：赢输都算学完（不罚输）
      if (xj && result === 'w') stars = (state.undo === 0 ? (game.ply() <= 40 ? 3 : 2) : 1) as 1 | 2 | 3;
      ctx.metrics.refresh();
    }
    ctx.persist(); await sleep(f2f ? 500 : 900); if (destroyed) return;
    say(line, result === 'w' || f2f ? 'celebrating' : 'encouraging'); if (result === 'w' && !f2f) { ctx.sfx('jingle-win'); } else if (f2f) ctx.sfx('level-complete', { volume: 0.7 });
    if (firstWin) await showWallAward(ctx, ix, bot); if (destroyed) return;
    const rbLine = !f2f && !xj && (result === 'w' || result === 'l') ? `rb.${ix + 1}.${result === 'w' ? 'win' : 'lose'}` : '';
    let choice = 'hall'; let spoke = false; const whyLesson = !f2f && ((reason === 'perpetual-check' && result === 'l') ? 'L19' : (reason === 'stalemate-loss' ? 'L20' : ''));
    for (;;) {
      choice = await xqResult(ctx, { kind: `${f2f ? 'f2f' : xj ? 'xj' : 'robot'}-${reason || 'none'}-${result}`, ribbon: f2f ? '棋局结束' : xj ? '小局' : robot?.name, stars: xj ? stars : undefined, title, text,
        stats: [f2f ? { label: '共走', value: `${Math.ceil(game.ply() / 2)} 回合` } : { label: '你走了', value: `${kidMoves()} 步` }, ...(state.undo ? [{ label: '悔棋', value: `${state.undo} 次` }] : [])],
        actions: [{ id: 'again', label: f2f ? '再下一盘' : xj ? '再来一个小局' : '再来一盘', kind: 'primary' }, { id: 'replay', label: '复盘' }, ...(whyLesson ? [{ id: 'why', label: '为什么？' }] : []), ...(xj && !whyLesson && vpNow.h >= 640 && vpNow.w >= 360 ? [{ id: 'real', label: '摆到真棋盘' }] : []), { id: 'hall', label: '回大厅' }] });
      if (rbLine && !spoke) { spoke = true; say(rbLine); }
      if (choice === 'real') { await new Promise<void>((res) => openRealBoard(ctx, game.startFen, '摆到真棋盘', res)); continue; } break;
    }
    if (choice === 'replay') { startReplay(); return; }
    if (choice === 'why' && whyLesson) { ctx.go({ to: 'lesson', lessonId: whyLesson }); return; }
    if (choice === 'again') { if (f2f) ctx.go({ to: 'f2f-setup' }); else ctx.go({ to: 'arena' }); return; }
    ctx.go({ to: 'hall' });
  }
  /** 孩子自己走了几步（整回合数，不是双方半步数）：按走子方交替数 */
  const kidMoves = (): number => { const first = game.startFen.split(' ')[1] === 'b' ? 1 : 0; let n = 0; for (let i = 0; i < game.ply(); i++) if (((first + i) & 1) === kid) n++; return n; };
  const reasonText = (r: string, who: string): string => ({ checkmate: `${who}将死了对方。`, 'stalemate-loss': `${who}赢了：对方无路可走（家规：困毙判负）。`, 'stalemate-draw': '对方无路可走，按家规判和。', 'perpetual-check': `${who}赢了：对方一直将军（家规：长将判负）。`, repetition: cfg.perpetual === 'warn' ? '同样的局面出现三次，和棋（家规：长将只提醒）。' : '同样的局面出现三次，和棋。', 'no-capture-limit': '很久没吃子了，和棋。', 'no-attackers': '双方都没有进攻的子，和棋。', resign: `${who}赢了：对方认输。`, agreed: '双方同意和棋。' })[r] ?? '';

  // ───────── 复盘 ─────────
  let replayer: ReplayPlayer<number> | null = null; const replayBtns: HTMLButtonElement[] = []; let spotMarks: Disposable[] = [];
  const stripEl = h('div', { class: 'xq-notes', 'data-notes': '1' });
  function startReplay(): void {
    if (replayer) return; state.replaying = true; root.classList.add('xq-replaying'); const moves = game.encoded(); view.finishAnimations(); session.input.enable(false); clearDanger(); tellStop(); applyLayout(vpNow);   // 复盘自动显示竖线号（棋谱条「炮二平五」要用）
    // 逐步中文记谱 + 精彩时刻
    const notes: string[] = []; const fens: string[] = [game.startFen]; { const ps = Position.fromFen(game.startFen); for (const mv of moves) { const m = parseMove(mv); notes.push(notation(ps, m)); ps.make(m); fens.push(ps.fen()); } }
    const hls: Highlight[] = f2f ? [] : pickHighlights(detectHighlights(game.startFen, moves, kid)); const hlAt = (ply: number): Highlight | undefined => hls.find((h0) => h0.ply === ply);
    replayer = createReplayPlayer({ rules, view, startFen: game.startFen, moves, gapMs: 800 });
    const chips = [h('button', { type: 'button', class: 'xq-note-chip', 'data-ply': '0', onclick: () => replayer?.goto(0) }, '开局'), ...notes.map((n, i) => { const hh = hls.find((x) => x.moveIx === i); return h('button', { type: 'button', class: `xq-note-chip ${hh ? (hh.positive ? 'is-pos' : 'is-neg') : ''}`, 'data-ply': String(i + 1), onclick: () => replayer?.goto(i + 1) }, h('i', null, String(i + 1)), n); })];
    stripEl.replaceChildren(...chips); titleEl.replaceChildren(stripEl); place(titleEl, f2f && L.portrait ? topRect() : topRect()); titleEl.style.overflow = 'visible';
    for (const k of Object.values(keys)) k.style.display = 'none';
    const mk = (id: string, ic: Parameters<typeof icon>[0], label: string, fn: () => void): HTMLButtonElement => { const b = key(`r-${id}`, ic, label, fn); replayBtns.push(b); return b; };
    let spot = 0; const jumpSpot = (): void => { if (!hls.length) { replayer?.goto(0); say('r.none'); return; } const cur = replayer?.ply ?? 0; const nxt = hls.find((x) => x.ply > cur) ?? hls[0]; spot++; replayer?.goto(nxt.ply); };
    mk('prev', 'back', '上一步', () => void replayer?.prev()); mk('next', 'next', '下一步', () => void replayer?.next()); mk('spot', 'hint', hls.length ? '精彩' : '开头', jumpSpot);
    mk('more', 'settings', '更多', () => {
      closeMenu(); scrim = h('div', { class: 'xq-scrim', onclick: closeMenu }); const r = L.dock ?? L.panel!; const btn = (label: string, fn: () => void, sub = true): HTMLButtonElement => h('button', { type: 'button', class: `xq-btn ${sub ? 'is-sub' : ''}`, onclick: () => { closeMenu(); fn(); } }, label);
      const cur = replayer?.ply ?? 0;
      menuEl = h('div', { class: 'xq-menu' }, btn('摆到真棋盘', () => openRealBoard(ctx, fens[cur] ?? game.startFen, cur === 0 ? "开局的局面" : `第 ${cur} 步的局面`)), btn('从这里重新下', () => { const fen = fens[cur] ?? game.startFen; ctx.go({ to: 'game', params: { mode: f2f ? 'f2f' : 'robot', robotId: p.robotId, startFen: fen, moves: [], side: kid, handicap: 'none', seed: (p.seed + 17) & 0x7fffffff, coach: false, easy: p.easy, rules: p.rules } }); }, false), btn('回开头', () => replayer?.goto(0)), btn('回大厅', () => ctx.go({ to: 'hall' })));
      place(menuEl, { x: r.x, y: Math.max(L.S.y + 4, r.y - (L.portrait ? 130 : 0)), w: r.w, h: 124 }); root.append(scrim, menuEl);
    });
    replayBtns.forEach((b, i) => place(b, L.keys[i]));
    const show = (ply: number): void => {
      for (const d of spotMarks) d.dispose(); spotMarks = []; for (const c of Array.from(stripEl.children) as HTMLElement[]) { const on = Number(c.dataset.ply) === ply; c.classList.toggle('is-cur', on); if (on) c.scrollIntoView({ block: 'nearest', inline: 'center' }); }
      const hh = hlAt(ply); if (hh) { if (hh.arrow && (hh.kind === 'missMate' || hh.kind === 'missFree')) spotMarks.push(view.arrow(hh.arrow[0], hh.arrow[1], 'hint')); else if (hh.kind === 'hang') spotMarks.push(view.mark('danger', hh.squares, { pulse: true })); else if (hh.squares.length) spotMarks.push(view.mark('star', hh.squares)); say(hh.line, hh.positive ? 'celebrating' : 'encouraging'); if (hh.positive) bot?.react('fan'); }
    };
    replayer.onChange((e) => show(e.ply)); replayer.goto(0); show(0); say(hls.length ? 'r.intro' : 'r.none');
    (api as unknown as { highlights: Highlight[] }).highlights = hls;
  }

  // ───────── 键 ─────────
  /** 悔棋。对机器人：引擎按"机器人已应 → 退两步、还在想 → 退孩子刚走的一步"。面对面（规格 §2.4）：悔回发起方上一步之前——对方已应一步则两步一起退，对方还没应则只退一步；发起方还没走过棋则不能悔。 */
  async function undo(asker?: Side): Promise<void> {
    if (state.ended || session.phase === 'animating' || !game.moves.length) return;
    if (cardOpen()) { ctx.sfx('ui-locked'); return; }
    if (f2fUi) {
      const lastBy = (game.turn() === 0 ? 1 : 0) as Side; const who = (asker ?? lastBy) as Side; const plies = lastBy === who ? 1 : 2;
      if (plies > game.moves.length) { ctx.sfx('ui-locked'); return; }
      if (p.rules.undo === 3 && used[who] >= 3) { ctx.sfx('ui-locked'); return; }
      const c = f2fUi.consent('undo', who); if (!(await c.result)) return; if (state.ended || destroyed) return; used[who]++;
      clearHint(); let ok = false; for (let i = 0; i < plies && game.moves.length; i++) ok = (await session.undo()) || ok; if (ok) { state.undo++; ctx.sfx('whoosh-down'); say('s.undo'); persist(); }
      return;
    }
    clearHint(); const ok = await session.undo(); if (ok) { state.undo++; ctx.sfx('whoosh-down'); say('s.undo'); }
  }
  async function resign(who?: Side): Promise<void> {
    if (state.ended || destroyed) return; if (cardOpen()) { ctx.sfx('ui-locked'); return; } const side = (who ?? (f2f ? game.turn() : kid)) as Side;
    if (f2fUi) { if (!(await f2fUi.resign(side))) return; session.resign(side); return; }
    const c = await ask(lineText('g.resign'), ['继续下', '认输']); if (c === 1) session.resign(kid);
  }
  async function draw(who: Side): Promise<void> { if (!f2fUi || state.ended) return; if (cardOpen()) { ctx.sfx('ui-locked'); return; } const c = f2fUi.consent('draw', who); if (await c.result) { session.input.lock('modal'); await onEnd({ over: true, winner: null, reason: 'agreed' }); } }
  let menuEl: HTMLElement | null = null; let scrim: HTMLElement | null = null;
  function closeMenu(): void { menuEl?.remove(); scrim?.remove(); menuEl = scrim = null; }
  function openMenu(): void {
    if (menuEl) { closeMenu(); return; } scrim = h('div', { class: 'xq-scrim', onclick: closeMenu }); const r = L.dock ?? L.panel!;
    const btn = (label: string, fn: () => void, sub = true): HTMLButtonElement => h('button', { type: 'button', class: `xq-btn ${sub ? 'is-sub' : ''}`, onclick: () => { closeMenu(); fn(); } }, label);
    menuEl = h('div', { class: 'xq-menu' }, btn('重新开始', () => { if (state.ended) return; session.restart(p.startFen); state.undo = 0; state.hints = 0; clearHint(); renderTitle(); renderTrays(); persist(); void refreshCoach(); say(kid === 0 ? 'g.red' : 'g.black'); }), btn('设置', () => { const c0 = ctx.save.settings.coords; openSettings(ctx, { onChange: () => { ctx.applyPrefs(); renderTrays(); refreshDanger(); applyLayout(vpNow); } }); void c0; }), btn('复盘', () => { if (game.moves.length) startReplay(); }), btn('存好，回大厅', () => ctx.go({ to: 'hall' })));
    place(menuEl, { x: r.x, y: Math.max(L.S.y + 4, r.y - (L.portrait ? 130 : 0)), w: r.w, h: 124 }); root.append(scrim, menuEl);
  }
  if (!f2f) { keys.undo = key('undo', 'undo', '悔棋', () => void undo()); keys.hint = key('hint', 'hint', '提示', () => void doHint()); keys.resign = key('resign', 'flag', '认输', () => void resign()); keys.menu = key('menu', 'settings', '设置', openMenu); }
  else for (const seat of [0, 1] as const) { const rot = seat === 1; const mk = (id: string, ic: Parameters<typeof icon>[0], label: string, fn: () => void): void => { const b = key(`${id}-${seat}`, ic, label, fn, `xq-cluster-key ${rot ? 'is-rot' : ''}`); clusterKeys.push({ el: b, seat }); }; mk('undo', 'undo', '悔棋', () => void undo(seat)); mk('draw', 'swap', '和棋', () => void draw(seat)); mk('resign', 'flag', '认输', () => void resign(seat)); }

  // ───────── 启动 ─────────
  ctx.root.append(root); applyLayout(vpNow);
  bot = ctx.mountBot(botHost, { size: '100%', bubble: L.portrait ? 'right' : 'right', bubbleMax: Math.max(140, L.bubble.w), accessory: 'junshi', mood: 'idle' });
  renderTitle(); renderTrays(); idle.touch(); void refreshCoach();
  if (session.phase === 'aiThinking') tellStart();
  void truncated; refreshDanger();
  if (!game.moves.length) say(f2f ? 'd.intro' : xj ? 'xj.intro' : kid === 0 ? 'g.red' : 'g.black');
  persist();
  const api = { get view() { return view; }, get input() { return session.input; }, get game() { return session.game; }, get session() { return session; }, get rules() { return rules; }, events: [] as string[], get layout() { return L; }, get idle(): boolean { return view.idle && !session.input.locked && (session.phase === 'play' || session.phase === 'ended'); }, get ai() { return ai; }, get ready() { return view.ready; }, get f2f() { return f2fUi; }, get replay() { return replayer; }, params: p, state,
    fen: (): string => session.game.fen(), encoded: (): string[] => session.game.encoded(), sqName: (sq: number): string => rules.geometry.name(sq), rectOf: (sq: number): { x: number; y: number; w: number; h: number } => { const r = view.rect(sq); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    play: async (enc: string): Promise<boolean> => { const m = rules.decode(session.game.state(), enc); if (m === null) return false; await session.play(m); return true; }, undo: () => undo(), draw: (who: Side) => draw(who), resign: (who?: Side) => resign(who), ask, forceEnd: (o: Outcome) => onEnd(o), setFen: (f: string) => { session.restart(f); renderTitle(); renderTrays(); } };
  (window as unknown as { __board: typeof api; __xq: typeof api }).__board = api; (window as unknown as { __xq: typeof api }).__xq = api;
  void view.ready.then(() => { root.dataset.ready = '1'; });
  void replayMoves; void ROBOTS;
  return {
    resize: (vp) => { if (!destroyed) applyLayout(vp); },
    onBack: () => { persist(); ctx.go({ to: 'hall' }); return true; },
    destroy: () => { destroyed = true; unRelabel(); fx.destroy(); idle.stop(); coachEpoch++; for (const s of subs) s.dispose(); replayer?.destroy(); f2fUi?.destroy(); session.destroy(); view.destroy(); bot?.destroy(); root.remove(); },
  };
}
