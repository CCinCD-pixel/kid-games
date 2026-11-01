/**
 * 棋盘引擎游乐场 /dev/board/ —— engines/board 的活样例，也是冒烟 / 截图 / Playwright 的靶子（不在大厅里，不进 Service Worker 预缓存）。
 * 象棋与国象各用一份**参考适配器**当规则（test/reference，只是夹具）+ 本目录的演示主题（星港夜色）。
 * 查询参数：?game=xq|chess &orient=second &f2f=1 &bot=0 &reduced=1 &fen=… &coords=0 &safe=top,right,bottom,left
 */
import { initShell } from '@kit/shell';
import { createAiHost, fromWorker, type AiHostImpl } from '@engines/board/ai/host';
import { createAiHandler } from '@engines/board/ai/handler';
import { chessPlugin, xqPlugin } from './ai-plugins';
import { createGame, type GameImpl } from '@engines/board/core/game';
import { createSession, type Session } from '@engines/board/play/session';
import { createFaceToFace, type FaceToFaceImpl } from '@engines/board/play/facetoface';
import { createRecorder, type Recorder } from '@engines/board/play/recorder';
import { createReplayPlayer, type ReplayPlayer } from '@engines/board/play/replay';
import type { Disposable, GameRules, Orientation, RobotLevel, Side, Sq, Theme } from '@engines/board/core/types';
import { createBoardView, type BoardViewImpl } from '@engines/board/view/board-view';
import { createPromotionPicker } from '@engines/board/view/promotion-picker';
import { chessRules } from '@engines/board/test/reference/chess-adapter.mjs';
import { xqRules } from '@engines/board/test/reference/xq-adapter.mjs';
import type { Viewport } from '@engines/board/view/layout-types';
import { chessTheme, xqTheme } from './themes';
import { demoLayout, type DemoLayout } from './layout';
import { createReasonText } from '@engines/board/play/reasons';
import { createLessonPlayer } from '@engines/board/lesson/player';
import { createStepUi, type StepUiImpl } from '@engines/board/lesson/step-ui';
import { createGhost, type GhostImpl } from '@engines/board/lesson/ghost';
import { createHintLadder } from '@engines/board/core/hints';
import { xqLessonData, xqLessons } from '@engines/board/test/xq-lesson-data';
import './board-demo.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRules = GameRules<any, any>; type AnyGame = GameImpl<any, any>; type AnyView = BoardViewImpl<any, any>;
type Mode = 'xq' | 'chess';
interface ModeDef { label: string; rules(): AnyRules; theme(): Theme; presets: { name: string; fen: string }[]; sides: [string, string]; promoOrder?: number[] }
const MODES: Record<Mode, ModeDef> = {
  xq: { label: '象棋', rules: () => xqRules(), theme: xqTheme, sides: ['红方', '黑方'], presets: [
    { name: '开局', fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w' },
    { name: '中局', fen: 'r1bakab1r/9/1cn2cn2/p1p1p1p1p/9/2P6/P3P1P1P/1CN1C1N2/9/R1BAKABR1 w' },
    { name: '将军', fen: '3k5/9/9/9/9/9/9/9/4R4/3K5 w' },
    { name: '残局', fen: '4k4/9/9/9/9/9/9/4B4/4A4/3K1R3 w' }] },
  chess: { label: '国象', rules: () => chessRules(), theme: chessTheme, sides: ['白方', '黑方'], promoOrder: [2, 3, 4, 5], presets: [
    { name: '开局', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    { name: '易位', fen: 'r3k2r/ppp2ppp/2np1n2/4p3/4P3/2N2N2/PPPP1PPP/R3K2R w KQkq - 0 1' },
    { name: '升变', fen: '8/P6k/8/8/8/8/6p1/K7 w - - 0 1' },
    { name: '过路兵', fen: 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3' },
    { name: '一步杀', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4' },
    { name: '陨石', fen: '4k3/8/8/3X4/8/3P4/8/R3K3 w - - 0 1' }] },
};

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let mode: Mode = q.get('game') === 'chess' ? 'chess' : 'xq';
let f2f = q.get('f2f') === '1', bot = q.get('bot') !== '0' && !f2f, reduced = q.get('reduced') === '1', flipped = q.get('orient') === 'second', coords = q.get('coords') !== '0';
let presetIx = 0; const botSeed = 20261013; let reserve = 0; const reasonText = createReasonText();

let rules: AnyRules, theme: Theme, session: Session<any, any>, view: AnyView, f2fUi: FaceToFaceImpl | null = null, recorder: Recorder, replayer: ReplayPlayer<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
let layoutNow: DemoLayout | null = null; let viewSubs: Disposable[] = [];
const events: string[] = []; const log = (e: string): void => { events.push(e); if (events.length > 200) events.shift(); };

const shell = initShell({ game: 'dev-board', startGate: false, back: { compact: true }, serviceWorker: false, log: false, onLayout: () => relayout() });
const kidSide = (): Side => (flipped ? 1 : 0);
const orientation = (): Orientation => (f2f ? 'first-bottom' : flipped ? 'second-bottom' : 'first-bottom');
const sideName = (s: Side): string => MODES[mode].sides[s];

function setRect(el: HTMLElement, r: { x: number; y: number; w: number; h: number }): void { el.style.left = `${r.x}px`; el.style.top = `${r.y}px`; el.style.width = `${r.w}px`; el.style.height = `${r.h}px`; }
function relayout(): void {
  if (!view) return; const l = shell.layout(); const vp: Viewport = { w: l.width, h: l.height, safe: { t: l.safe.top, r: l.safe.right, b: l.safe.bottom, l: l.safe.left } };
  const g = rules.geometry; layoutNow = demoLayout(vp, g.viewBox.w / g.viewBox.h, reserve); setRect($('status'), layoutNow.status); setRect($('panel'), layoutNow.panel); view.layout(layoutNow.board);
}
function renderTrays(): void {
  const game = session.game; for (const s of [0, 1] as const) { const t = $(`tray${s}`); const lost = game.captured(s); const diff = game.materialDiff(s); t.dataset.label = `${sideName(s)}被吃`; t.textContent = lost.map((p) => theme.pieces.label(p).slice(-1)).join('') + (diff ? `  ${diff > 0 ? '+' : ''}${diff}` : ''); }
}
function refresh(): void {
  const game = session.game; const out = session.outcome(); const chk = rules.check(game.state()); let text: string;
  if (replayer) text = `<b>复盘</b>　第 ${replayer.ply} / ${replayer.total} 手`;
  else if (out.over) text = out.winner === null ? `<b>和棋</b>（${reasonText(out.reason)}）` : `<b>${sideName(out.winner as Side)}胜</b>（${reasonText(out.reason)}）`;
  else text = `<b>${sideName(game.turn())}</b>走${chk ? '　<b>将军！</b>' : ''}${game.warn().warn ? '　小心长将' : ''}<span style="opacity:.6">　第 ${Math.floor(game.ply() / 2) + 1} 回合</span>`;
  $('status').innerHTML = text; renderTrays(); f2fUi?.turnLamp(game.turn());
}

// ───────── AI（真 Worker + 主线程兜底）─────────
const LEVEL: RobotLevel = { id: 'demo', depth: 2, nodes: 3000, slip: 0.12, glanceTemp: 60, temp: 30, margin: 50, mateSight: 0.6, coachCap: 2, look: {} };
let ai: AiHostImpl | null = null; let aiMode: Mode | null = null;
function aiFor(m: Mode): AiHostImpl {
  if (ai && aiMode === m) return ai; ai?.terminate(); aiMode = m;
  const plug = m === 'xq' ? xqPlugin : chessPlugin; const fb = createAiHandler(plug(), { fallback: true });
  ai = createAiHost({ createWorker: () => fromWorker(m === 'xq' ? new Worker(new URL('./ai-worker-xq.ts', import.meta.url), { type: 'module' }) : new Worker(new URL('./ai-worker-chess.ts', import.meta.url), { type: 'module' })), timeoutMs: navigator.webdriver ? 20000 : 3000, retries: 1, warmup: true, fallback: async (req) => fb.handle(req) });
  return ai;
}

function teardown(): void { stopLesson(); replayer?.destroy(); replayer = null; for (const s of viewSubs) s.dispose(); viewSubs = []; f2fUi?.destroy(); f2fUi = null; session?.destroy(); view?.destroy(); }
function build(fen: string): void {
  teardown(); const host = $('host'); const def = MODES[mode]; const game = createGame(rules, fen);
  view = createBoardView(host, { rules, theme, orientation: orientation(), seat: f2f ? 'f2f' : 'single', coords: coords && rules.geometry.kind === 'squares', reducedMotion: reduced });
  if (f2f) view.setPieceRotation('seat');
  view.setTrayAnchor(0, () => $('tray0').getBoundingClientRect()); view.setTrayAnchor(1, () => $('tray1').getBoundingClientRect());
  for (const ev of ['landed', 'captured', 'promoted', 'castled', 'checked', 'lift', 'bump'] as const) viewSubs.push(view.on(ev, (e) => log(`${ev}:${e.sq}`)));
  relayout();
  session = createSession({ rules, view, game, seat: f2f ? 'f2f' : 'single', kidSide: kidSide(), ai: bot && !f2f ? aiFor(mode) : undefined, robot: bot && !f2f ? { level: LEVEL, gameSeed: botSeed, thinkMs: Number(q.get('think') ?? 300), budget: { maxMs: navigator.webdriver ? Infinity : 1800, maxDepth: 4 } } : null, promotion: createPromotionPicker(view, rules, theme.pieces, { order: def.promoOrder }) });
  recorder = createRecorder(rules.id, fen, { kidSide: kidSide() }); recorder.attach(session);
  for (const ev of ['move', 'undo', 'restart', 'end', 'resign', 'phase', 'aiThinking'] as const) viewSubs.push(session.on(ev, () => refresh()));
  viewSubs.push(session.on('illegal', (e) => { const t = e.reason ?? 'illegal'; log(`illegal:${t}:${e.from}>${e.to}`); toastWhy(t); }), session.on('select', (e) => log(`select:${e.sq ?? '-'}:${e.legal.length}`)), session.on('move', (e) => { if (e.capture) log(`cap:${e.encoded}`); }));
  if (f2f) f2fUi = createFaceToFace({ host: $('host'), board: view.el, lock: (r) => session.input.lock(r), sideName });
  refresh(); renderButtons();
}
function toastWhy(t: string): void { const s = $('status'); const old = s.innerHTML; s.innerHTML = `<b>不行：</b>${reasonText(t)}`; setTimeout(() => { if (s.textContent?.startsWith('不行')) s.innerHTML = old; }, 1600); }
function setFen(fen: string): void { build(fen); }
function buildAll(newGame: boolean): void {
  if (newGame) reserve = 0;
  const def = MODES[mode]; if (newGame || !rules) { rules = def.rules(); theme = def.theme(); build(q.get('fen') ?? def.presets[0].fen); }
  else build(session ? session.game.startFen : def.presets[0].fen);
  document.body.dataset.xgGame = mode === 'xq' ? 'xiangqi' : 'chess';
}
/** 保留对局进度地重建视图（切换 f2f / 电脑 / 减弱动画时）：用同一串着法重放 */
function rebuildKeepGame(): void { const moves = session.game.encoded(); const fen = session.game.startFen; build(fen); for (const t of moves) { const m = rules.decode(session.game.state(), t); if (m) session.game.play(m); } view.setState(session.game.state()); refresh(); session.poke(); }

// ───────── 控制按钮 ─────────
function renderButtons(): void {
  const host = $('btns'); host.replaceChildren(); const main = document.createElement('div'), extra = document.createElement('div'); main.className = 'bd-main'; extra.className = 'bd-extra'; host.append(main, extra);
  const add = (to: HTMLElement, label: string, fn: () => void, pressed?: boolean, id?: string): void => { const b = document.createElement('button'); b.type = 'button'; b.className = 'bd-btn'; b.textContent = label; if (id) b.id = id; if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed)); b.addEventListener('click', () => { fn(); if (to === extra) $('panel').removeAttribute('data-open'); }); to.appendChild(b); };
  if (replayer) {
    const r = replayer; add(main, '退出复盘', () => exitReplay(), undefined, 'r-exit'); add(main, '⏮', () => r.goto(0), undefined, 'r-start'); add(main, '◀', () => void r.prev().then(refresh), undefined, 'r-prev'); add(main, '▶', () => void r.next().then(refresh), undefined, 'r-next'); add(main, r.playing ? '暂停' : '自动播放', () => { r.toggle(); }, undefined, 'r-auto'); return;
  }
  add(main, `${MODES[mode].label} ⇄`, () => { mode = mode === 'xq' ? 'chess' : 'xq'; presetIx = 0; buildAll(true); }, undefined, 'b-mode');
  add(main, '悔棋', () => void undo(), undefined, 'b-undo');
  add(main, '重开', () => { session.restart(MODES[mode].presets[presetIx].fen); refresh(); }, undefined, 'b-restart');
  add(main, `局面：${MODES[mode].presets[presetIx].name}`, () => { presetIx = (presetIx + 1) % MODES[mode].presets.length; setFen(MODES[mode].presets[presetIx].fen); }, undefined, 'b-preset');
  add(main, '更多', () => { const p = $('panel'); if (p.hasAttribute('data-open')) p.removeAttribute('data-open'); else p.setAttribute('data-open', ''); }, undefined, 'b-more');
  add(extra, '翻转', () => { if (f2f) return; flipped = !flipped; session.setRobot(session.robot, kidSide()); view.finishAnimations(); view.setOrientation(orientation(), true); }, flipped, 'b-flip');
  add(extra, '面对面', () => { f2f = !f2f; if (f2f) { bot = false; flipped = false; } rebuildKeepGame(); }, f2f, 'b-f2f');
  add(extra, '电脑', () => { bot = !bot; if (bot) f2f = false; rebuildKeepGame(); }, bot, 'b-bot');
  add(extra, '标记', () => marksDemo(), undefined, 'b-marks');
  add(extra, '减弱动画', () => { reduced = !reduced; rebuildKeepGame(); }, reduced, 'b-reduced');
  add(extra, '复盘', () => enterReplay(), undefined, 'b-replay');
  if (mode === 'xq') add(extra, '课程', () => void startLesson(q.get('lesson') ?? 'L04'), undefined, 'b-lesson');
  add(extra, '认输', () => void resignFlow(), undefined, 'b-resign');
}
async function undo(): Promise<void> {
  if (session.phase === 'animating' || !session.game.moves.length) return;
  if (f2fUi) { const asker = (session.game.turn() === 0 ? 1 : 0) as Side; const c = f2fUi.consent('undo', asker); log(`consent:undo:${asker}`); if (!(await c.result)) { log('consent:no'); return; } log('consent:yes'); }
  await session.undo(); refresh();
}
async function resignFlow(): Promise<void> { const who = (f2f ? session.game.turn() : kidSide()) as Side; if (f2fUi) { if (!(await f2fUi.resign(who))) return; } session.resign(who); refresh(); }
function enterReplay(): void {
  const rec = recorder.record(); if (!rec.moves.length) return; session.input.enable(false); session.view.finishAnimations();
  replayer = createReplayPlayer({ rules, view, startFen: rec.startFen, moves: rec.moves, gapMs: 450 }); replayer.goto(rec.moves.length); replayer.onChange(() => { refresh(); const a = document.getElementById('r-auto'); if (a) a.textContent = replayer?.playing ? '暂停' : '自动播放'; }); renderButtons(); refresh();
}
function exitReplay(): void { replayer?.destroy(); replayer = null; view.finishAnimations(); view.setState(session.game.state()); const l = session.game.moves.at(-1); void l; session.input.enable(true); renderButtons(); refresh(); }
function marksDemo(): void {
  const s = session.game.state(); const mine = session.game.legalMoves().slice(0, 4); if (!mine.length) return; const i0 = rules.moveInfo(s, mine[0]); const ds: Disposable[] = [view.mark('hint', [i0.from], { pulse: true }), view.mark('star', [i0.to])];
  mine.slice(1).forEach((m, k) => { const i = rules.moveInfo(s, m); ds.push(view.arrow(i.from, i.to, (['hint', 'good', 'warn', 'threat'] as const)[k % 4])); });
  for (const m of session.game.legalMoves().filter((m) => rules.moveInfo(s, m).capture).slice(0, 2)) ds.push(view.mark('danger', [rules.moveInfo(s, m).to]));
  setTimeout(() => { for (const d of ds) d.dispose(); }, 2600);
}


// ───────── 课（engines/board/lesson/*）：?lesson=L05 或 __board.lesson.start('L05')；只有象棋（xq）有课数据 ─────────
const lessonState = { id: '', name: '', step: '', kind: '', index: 0, total: 0, subtitle: '', done: false, cancelled: false, stars: 0, results: [] as unknown[], error: '' };
let lessonRun: { player: ReturnType<typeof createLessonPlayer>; ui: StepUiImpl; ghost: GhostImpl } | null = null;
function stopLesson(): void { if (!lessonRun) return; const r = lessonRun; lessonRun = null; r.player.cancel(); r.ui.destroy(); r.ghost.destroy(); }
const naptime = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function startLesson(id: string, fromStep?: string): Promise<void> {
  const def = xqLessons.find((l) => l.id === id); if (!def) return; if (mode !== 'xq') { mode = 'xq'; rules = MODES.xq.rules(); theme = MODES.xq.theme(); }
  stopLesson(); reserve = 84; bot = false; f2f = false; build(MODES.xq.presets[0].fen);
  const ui = createStepUi(view as never); const ghost = createGhost(view, rules, {}); const fast = !!navigator.webdriver || reduced;
  const hooks = { narrate: async (nid: string) => { lessonState.subtitle = nid; log(`narrate:${nid}`); $('status').innerHTML = `<b>${def.id} ${def.name}</b>　<span style="opacity:.75">${nid}</span>`; await naptime(fast ? 15 : 600); }, companion: { mood: () => undefined, say: async (cid: string) => void log(`say:${cid}`) }, sfx: (n: string) => void log(`sfx:${n}`), ghost, save: (p: { stepId: string; puzzleIx?: number }) => void log(`save:${p.stepId}${p.puzzleIx !== undefined ? '#' + p.puzzleIx : ''}`), skip: () => false };
  const ctx = { rules, view, input: session.input, ai: null, hooks, hints: createHintLadder(), ui, data: xqLessonData(rules), wrongHoldMs: fast ? 120 : 600 };
  const player = createLessonPlayer(ctx as never, { onStep: (e) => { if (e.phase === 'start') { Object.assign(lessonState, { step: e.step.id, kind: e.step.k, index: e.index, total: e.total }); $('status').innerHTML = `<b>${def.id} ${def.name}</b>　${e.index + 1}/${e.total}　${e.step.k}`; } else lessonState.results.push({ id: e.step.id, ...e.result }); } });
  lessonRun = { player, ui, ghost }; Object.assign(lessonState, { id, name: def.name, step: '', kind: '', index: 0, total: def.steps.length, subtitle: '', done: false, cancelled: false, stars: 0, results: [], error: '' });
  void player.run(def as never, fromStep ? { lessonId: id, stepId: fromStep } : null).then((r) => { if (lessonRun?.player !== player) return; Object.assign(lessonState, { done: r.completed, cancelled: !r.completed, stars: r.stars }); if (r.completed) $('status').innerHTML = `<b>${def.id} 完成</b>　${'★'.repeat(r.stars)}`; }).catch((e: unknown) => { lessonState.error = String(e); });
}

buildAll(true); if (q.get('lesson')) void startLesson(q.get('lesson') as string, q.get('step') ?? undefined);
// 测试 / 调试入口（pw.ts 依赖）
const api = {
  get view() { return view; }, get input() { return session.input; }, get game(): AnyGame { return session.game as AnyGame; }, get session() { return session; }, get rules() { return rules; }, events, get layout() { return layoutNow; },
  get idle(): boolean { return view.idle && !session.input.locked && (session.phase === 'play' || session.phase === 'ended'); }, get ai(): AiHostImpl | null { return ai; }, get ready(): Promise<void> { return view.ready; }, get f2f() { return f2fUi; }, get replay() { return replayer; },
  fen: (): string => session.game.fen(), encoded: (): string[] => session.game.encoded(), setFen, sqName: (sq: Sq): string => rules.geometry.name(sq), mode: (): Mode => mode,
  rectOf: (sq: Sq): { x: number; y: number; w: number; h: number } => { const r = view.rect(sq); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
  play: async (enc: string): Promise<boolean> => { const m = rules.decode(session.game.state(), enc); if (m === null) return false; await session.play(m); return true; },
  setOptions: (o: { f2f?: boolean; bot?: boolean; reduced?: boolean; flipped?: boolean; mode?: Mode }): void => { if (o.mode) { mode = o.mode; buildAll(true); } if (o.f2f !== undefined) f2f = o.f2f; if (o.bot !== undefined) bot = o.bot; if (o.reduced !== undefined) reduced = o.reduced; if (o.flipped !== undefined) flipped = o.flipped; rebuildKeepGame(); },
  undo, lesson: { start: startLesson, cancel: stopLesson, get state() { return lessonState; }, get ui() { return lessonRun?.ui ?? null; }, ids: (): string[] => xqLessons.map((l) => l.id) },
};
(window as unknown as { __board: typeof api }).__board = api;
