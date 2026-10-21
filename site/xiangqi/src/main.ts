// site/xiangqi/src/main.ts — 楚河棋院入口：壳（开始门 / 🏠 / 布局）、存档、旁白、音效、路由。开发钩子（仅 dev server / 自动化）：?dev=1&screen=hall|arena|f2f-setup|game &robot=3 &mode=robot|xj|f2f &seed=7 &side=1 &fen=… &coach=1 &easy=1
import { initShell, type LayoutInfo } from '@kit/shell';
import { Narrator } from '@kit/narration';
import { mount as mountCompanion, type Companion, type CompanionOptions } from '@kit/companion';
import { sfx } from '@kit/audio';
import { bindPress, shouldAutoSkip } from '@kit/ui';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { setHubProgress, requestPersistence } from '@kit/progress';
import { isTestEnv } from '@kit/dev';
import './styles/xq.css';
import { createXqStore, hubLabel, type SavedGameRec } from './progress/save';
import { setupMetrics } from './progress/metrics';
import { createRules } from './rules/rules';
import { createXqTheme } from './app/theme';
import { lineText, hasLine, xqId, silentHoldMs } from './app/lines';
import type { AppCtx, Nav, Screen } from './app/ctx';
import type { Vp } from './app/layout';
import type { GameParams } from './app/game';
import { mountHall } from './app/hall';
import { mountArena, mountF2fSetup } from './app/arena';
import { mountGame } from './app/game';
import { mountStarmap } from './app/starmap';
import { mountBox } from './app/box';
import { mountPerf } from './app/perf';
import { mountAcademy, mountLesson, lessonRunOf } from './app/academy';
import { sleep } from './app/ctx';
import { START_FEN } from './rules/position';
import { DEFAULT_HOUSE } from './progress/save';

const q = new URLSearchParams(location.search); const perfMode = q.get('dev') === 'perf'; const dev = (isTestEnv() && q.get('dev') === '1') || perfMode;
const app = document.getElementById('app') as HTMLElement; app.classList.add('xq-app');
const store = createXqStore(); let save = store.load(); save.stats.sessions++; store.save(save);
let screen: Screen | null = null; let layoutInfo: LayoutInfo | null = null; let rootVp: Vp = { w: innerWidth, h: innerHeight, safe: { t: 0, r: 0, b: 0, l: 0 } };
const toVp = (l: LayoutInfo): Vp => ({ w: l.width, h: l.height, safe: { t: l.safe.top, r: l.safe.right, b: l.safe.bottom, l: l.safe.left } });

const shell = initShell({
  game: 'xiangqi', startGate: dev ? false : { title: '楚河棋院', subtitle: '楚河边，摆开棋阵', buttonLabel: '开始' }, back: { compact: true, onClick: () => !!screen?.onBack?.() },
  onBeforeLeave: () => { store.save(save); }, onPause: () => { store.save(save); },
  onLayout: (l) => { layoutInfo = l; rootVp = toVp(l); screen?.resize(rootVp); },
});
app.dataset.ready = '';
if (dev && q.get('unlock') === '1') { for (const r of Object.values(save.robots)) r.unlocked = true; store.save(save); }
const metrics = setupMetrics(store);
const narrator = new Narrator({ manifestUrl: '/audio/xiangqi/audio-manifest.json' });
let sfxReady = false;

const ctx: AppCtx = {
  root: app, shell, store, get save() { return save; }, persist: () => { store.save(save); }, narrator, lineText,
  mountBot(host: HTMLElement, o: CompanionOptions = {}): Companion { const c = mountCompanion(host, { sfx: (n) => ctx.sfx(n, { volume: 0.5 }), ...o }); host.querySelectorAll('.b-z').forEach((e) => e.setAttribute('aria-hidden', 'true')); return c; },   // 睡着的「z z Z」不是正文
  async speak(bot, id, o) {
    const text = lineText(id); if (!text) return; const nid = xqId(id);
    const voiceOn = save.settings.sfx !== false;
    if (!bot) { if (voiceOn && narrator.has(nid)) await narrator.say(nid, { interrupt: true, vars: o?.vars }); return; }
    if (dev) { void bot.say(text, { mood: o?.mood }); await sleep(q.get('slow') === '1' ? 1200 : 30); return; }      // 开发 / 测试：不等打字机和停留，课程步骤即刻往下走（?slow=1：每句停 1.2 秒，测"念的时候棋盘上有什么"）
    const voiced = voiceOn && narrator.has(nid);
    await bot.say(text, { mood: o?.mood, ...(voiced ? { speak: async () => { await narrator.say(nid, { interrupt: true, vars: o?.vars }); } } : { hold: silentHoldMs(text) }) });
  },
  sfx: (name, o) => { if (sfxReady && save.settings.sfx !== false) sfx.play(name, o); }, theme: createXqTheme(), rules: createRules(), go, vp: () => rootVp, metrics, applyPrefs,
};
function applyPrefs(): void { app.classList.toggle('xq-nosubs', save.settings.subs === false); app.classList.toggle('xq-voiced', save.settings.sfx !== false && narrator.has('xq.s.title')); }
const fromRec = (r: SavedGameRec): GameParams => ({ mode: r.mode, robotId: r.robot, xjId: r.xjId, startFen: r.startFen, moves: r.moves, side: r.side, handicap: r.handicap, seed: r.seed, coach: r.coach, easy: r.easy, rules: r.rules, undo: r.undo, used: r.used, hints: r.hints, coachShown: r.coachShown, coachAccepted: r.coachAccepted, startedAt: r.startedAt, lesson: r.lesson });
let lastGame: GameParams | null = null;
function go(n: Nav): void {
  screen?.destroy(); screen = null; app.querySelectorAll('.xq-screen').forEach((e) => { e.replaceChildren(); e.remove(); });   // replaceChildren：已脱离文档的根若被某处引用着，也不拖着整棵子树（每次进大厅曾漏 ~900 个节点）
  switch (n.to) {
    case 'hall': screen = mountHall(ctx, { intro: !!n.intro }); break;
    case 'box': screen = mountBox(ctx, { onDone: (skipped) => go({ to: 'hall', intro: !skipped }) }); break;
    case 'perf': screen = mountPerf(ctx); break;
    case 'arena': screen = mountArena(ctx, { quick: !!n.quick }); break;
    case 'f2f-setup': screen = mountF2fSetup(ctx); break;
    case 'game': lastGame = n.params; screen = mountGame(ctx, n.params); break;
    case 'resume': { const g = save.game; if (g) { lastGame = fromRec(g); screen = mountGame(ctx, lastGame); } else screen = mountHall(ctx, {}); break; }
    case 'starmap': screen = mountStarmap(ctx); break;
    case 'academy': screen = mountAcademy(ctx); break;
    case 'lesson': screen = mountLesson(ctx, lessonRunOf(n.lessonId, n.placement)); break;
    default: screen = mountHall(ctx, {}); break;
  }
  screen.resize(rootVp); setHubProgress('xiangqi', hubLabel(save));
}
void (async () => {
  if (layoutInfo) rootVp = toVp(layoutInfo); else { const l = shell.layout(); rootVp = toVp(l); }
  bindPress(document); void requestPersistence();
  if (!dev) await shell.ready; rootVp = toVp(shell.layout());
  void installKitSfx({ only: ['place-piece', 'capture', 'bump', 'ui-select', 'ui-notify', 'ui-open', 'ui-locked', 'whoosh-down', 'hint', 'jingle-win', 'level-complete', 'ui-pick', 'ui-press', 'ui-tap', 'unlock', 'chime', 'blip-happy', 'blip-think', 'blip-talk', 'blip-question', 'blip-surprised', 'blip-sleepy', 'star-1', 'star-2', 'star-3', 'correct', 'hit-soft'] }).then(() => { sfxReady = true; });
  void narrator.ready().then(() => applyPrefs()).catch(() => undefined); applyPrefs(); void warmOffline();
  if (hasLine('s.title') && !dev) void sleep(0);
  const screenQ = q.get('screen'); const needBox = !save.intro.box && !shouldAutoSkip() && (!dev || q.get('intro') === 'box') && !q.has('screen');
  if (perfMode) { go({ to: 'perf' }); return; }
  if (dev && (screenQ === 'game' || q.has('fen') || q.has('robot') || q.get('mode'))) {
    const mode = (q.get('mode') as GameParams['mode']) ?? 'robot'; const side = q.get('side') === '1' ? 1 : 0;
    const params: GameParams = { mode, robotId: `R${q.get('robot') ?? '1'}`, xjId: q.get('xj') ?? undefined, startFen: q.get('fen') ? decodeURIComponent(q.get('fen') as string) : START_FEN, moves: q.get('moves') ? (q.get('moves') as string).split(',') : [], side, handicap: 'none', seed: Number(q.get('seed') ?? 7), coach: q.get('coach') === '1', easy: q.get('easy') === '1', rules: { ...DEFAULT_HOUSE } };
    go({ to: 'game', params });
  } else if (screenQ === 'resume') go({ to: 'resume' }); else if (screenQ === 'arena') go({ to: 'arena' }); else if (screenQ === 'f2f-setup') go({ to: 'f2f-setup' }); else if (screenQ === 'starmap') go({ to: 'starmap' }); else if (screenQ === 'academy') go({ to: 'academy' }); else if (screenQ === 'lesson') go({ to: 'lesson', lessonId: q.get('lesson') ?? 'L04' });
  else if (needBox) go({ to: 'box' }); else go({ to: 'hall' });
  void lastGame; void metrics;
})();
/** 离线：平台 SW 的 media 缓存是"懒填"的（字体 / 音效第一次被 SW 控制的页面请求时才进缓存）。首次在线、SW 接管之后主动取一遍两个字体和常用音效，断网后汉字不退回系统字体、音效不丢。尽力而为，失败静默。 */
async function warmOffline(): Promise<void> {
  if (isTestEnv() || !('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.ready; await sleep(5000); for (const u of ['/fonts/zcool-kuaile-3500.woff2', '/fonts/wenkai-gb-medium-3500.woff2', ...SFX_WARM.map((n) => `/audio/sfx/${n}.m4a`)]) { try { await fetch(u); } catch { /* 离线 / 404：忽略 */ } } } catch { /* ignore */ }
}
const SFX_WARM = ['place-piece', 'capture', 'bump', 'ui-select', 'ui-notify', 'ui-open', 'hint', 'correct', 'star-1', 'level-complete'];
