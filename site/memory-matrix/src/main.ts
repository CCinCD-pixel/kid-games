// 星图记忆站 (rebuilt in place, spec docs/specs/memory-matrix.md v1.1). Boot: shell -> save -> engine -> narrator / voice policy -> station.
import { initShell, currentLayout } from '@kit/shell';
import { createStore, setHubProgress } from '@kit/progress';
import { Narrator, type Cue, type NarrationManifest } from '@kit/narration';
import { bindPress, createSubtitleBar, shouldAutoSkip } from '@kit/ui';
import { chime, installKitSfx } from '@kit/ui/sfx-bridge';
import { sfx } from '@kit/audio';
import { isTestEnv } from '@kit/dev';
import { randomSeed } from '@kit/rng';
import lines from '../../../content/memory-matrix/lines.json';
import { Engine, LEGACY_LIVE_KEY, LEGACY_SNAPSHOT_KEY, SECTOR_IDS, normalizeSave, type NightSummary, type Save, type SectorId } from './core/session';
import { Voice, dwellMs } from './core/voice';
import { registerParentMetrics } from './core/metrics';
import type { App } from './view/app';
import { playRound } from './view/round';
import { computeLayout } from './core/layout';
import { clearSprites, prewarmSprites } from './art/sprites';
import { mountAtlas, mountSectorPage, mountSky, mountStation, playIntro, showGateIntro, showGateVerdict, showNightCard, showSettings, type Screen } from './view/screens';
import './styles.css';

const root = document.getElementById('app') as HTMLElement;
const qs = new URLSearchParams(location.search);
const test = qs.has('test') && isTestEnv();
const fast = test && qs.has('fast');

/** in-memory Storage for ?test=1: a test session never touches the child's real save (asserted by the Playwright spec) */
class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length(): number { return this.m.size; }
  clear(): void { this.m.clear(); }
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  key(i: number): string | null { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string): void { this.m.delete(k); }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
}
const readLegacy = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const mkSalt = (): string => (test ? (qs.get('seed') ?? 'test') : randomSeed().toString(36));

const store = createStore<Save>('memory-matrix', { version: 1, defaults: () => normalizeSave(null, mkSalt), storage: test ? new MemStorage() : undefined });
const engine = new Engine(store.load(), { mkSalt, legacyLive: readLegacy(LEGACY_LIVE_KEY), legacySnapshot: readLegacy(LEGACY_SNAPSHOT_KEY) });
if (test) {
  engine.save.introSeen = !qs.has('intro');
  if (!qs.has('tutorial')) for (const s of SECTOR_IDS) engine.save.tutorial[s] = true;
  if (qs.get('state') === 'late') simulate(engine, Number(qs.get('nights') ?? 36));
  if (qs.has('gate')) { const sc = (qs.get('sector') ?? 's1') as SectorId, t = engine.sec(sc).tracks[0]; engine.sec(sc).open = true; t.L = 5; t.atG = 3; t.placement = false; t.cp = { LR: 3, UD: 3, F: 3, B: 3, near: 3, far: 3 }; }
  if (qs.has('open')) for (const s of SECTOR_IDS) engine.sec(s).open = true;
}

/** a flawless child plays `nights` nights in memory: all sectors open, many cards and stars (screenshots, atlas, station growth) */
function simulate(e: Engine, nights: number): void {
  for (let n = 0; n < nights; n += 1) {
    e.startNight(e.recommended());
    for (let guard = 0; guard < 40; guard += 1) { const p = e.plan(), f = e.finish(p, { slips: 0, rwPre: 0, rwMid: 0, hint: 0, showAnswer: false }); if (f.night) break; }
  }
}

const onResize = new Set<() => void>();
let warmKey = '';                                                                       // (declared before initShell: onLayout can fire during it)
const shell = initShell({
  game: 'memory-matrix',
  back: { compact: true },
  startGate: test ? false : { title: '星图记忆站', subtitle: '看一眼，把星图复原', buttonLabel: '开始' },
  onBeforeLeave: () => persist(),
  onPause: () => persist(),
  onLayout: () => { onResize.forEach((f) => f()); warmBoards(); },
});

// text manifest: every line has its subtitle even before the voice step has produced clips (src '' -> the kit speech fallback, silent under automation)
const textManifest: NarrationManifest = Object.fromEntries(Object.entries(lines as Record<string, { text: string; role: string }>).map(([id, l]) => [id, { src: '', text: l.text, durationMs: 0, role: l.role }]));
const HAS_AUDIO = Object.keys(import.meta.glob('../../../public/audio/memory-matrix/audio-manifest.json')).length > 0;
const sub = createSubtitleBar(document.body);
/** a subtitle that is parked on <body> (sector page, atlas, modals) hides itself shortly after the line ended, so it never lingers over controls; inside rounds and the station it stays (it has its own place there) */
let subTimer = 0;
const onCue = (cue: Cue | null): void => {
  sub.onCue(cue);
  if (!cue) return;
  window.clearTimeout(subTimer);
  const arm = (): void => { subTimer = window.setTimeout(() => { if (sub.el.parentElement !== document.body) return; if (narrator.speaking) arm(); else sub.hide(); }, 2400); };
  subTimer = window.setTimeout(arm, dwellMs(cue.text));
};
const narrator: Narrator = new Narrator({ manifest: textManifest, manifestUrl: HAS_AUDIO ? '/audio/memory-matrix/audio-manifest.json' : undefined, onCue, onWord: sub.onWord, unlocked: test ? () => Promise.resolve() : undefined });
sub.attach(narrator);
const voice = new Voice(narrator, engine.save.voice, { now: () => Date.now(), nightClock: () => engine.save.nightClock });
voice.quiet = fast; voice.textOnly = !HAS_AUDIO;

const metrics = test ? null : registerParentMetrics(() => engine.save);
const app: App = {
  root, engine, voice, narrator, bot: null, sub, shell, fast, test,
  viewport: () => { const l = currentLayout(); return { w: l.width, h: l.height, safe: l.safe }; },
  sfx: (name, o) => { sfx.play(name, o); },
  chime: (step) => chime(step),
  persist: () => persist(),
  mark: (name, data) => { shell.session?.mark(name, data); },
  refreshHub: () => refreshHub(),
  lastActive: Date.now(), lastAxis: null, shownBuilt: -1, onResize, storageFailed: false,
};

/** a private window / disabled storage: the game keeps working from memory, but nothing would survive: tell the parent on the station (spec §3.6) */
function storageWorks(): boolean { try { const k = 'kg:probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; } }
function persist(): void {
  const ok = store.save(engine.serialize());
  if (!ok && !test && !app.storageFailed && !storageWorks()) { app.storageFailed = true; current?.refresh?.(); }
  refreshHub(); metrics?.refresh();
}
function refreshHub(): void {
  if (test) return;
  const n = engine.cardCount();
  setHubProgress('memory-matrix', { label: `星图册 ${n}/28`, value: n / 28 });
}

/** the board sprites (glass, fog) are painted in idle slices while the child is on the station, never in the first round's frame */
function warmBoards(): void {
  const l = currentLayout(), S = computeLayout(l.width, l.height, l.safe).S, dpr = Math.min(2, window.devicePixelRatio || 1), key = `${S}:${dpr}`;
  if (key === warmKey) return;
  if (warmKey) clearSprites();                                                          // the screen turned: the old sizes are never needed again
  warmKey = key; void prewarmSprites(S, dpr, () => warmKey !== key);
}
/* ------------------------------------------------------------------------------------------- flows */
let current: Screen | null = null;
const mountSc = (s: Screen): void => { current?.destroy(); current = s; };
const sky = mountSky(app); app.onResize.add(() => sky.resize());

async function toStation(opts: { intro?: boolean } = {}): Promise<void> {
  mountSc(mountStation(app, { onStart: (s) => void nightFlow(s), onSector: (s) => toSector(s), onAtlas: () => toAtlas(), onSettings: () => openSettings() }));
  root.dataset.ready = '1';
  persist(); warmBoards();
  if (opts.intro && !engine.save.introSeen) {
    await playIntro(app, root);
    engine.save.introSeen = true; persist();
    void nightFlow('s1');
  } else if (engine.veteranNew) { engine.veteranNew = false; void voice.say('mm.st.vet', {}); persist(); }
  else if (!test) void voice.say(engine.awayMs() > 14 * 86_400_000 ? 'mm.st.back' : 'mm.st.home', { awayMin: engine.awayMs() / 60_000 });
}
function toAtlas(): void { mountSc(mountAtlas(app, () => void toStation())); }
function openSettings(): void { showSettings(app, { onReplay: (s) => void replayTutorial(s), onClose: () => current?.refresh?.() }); }
function toSector(s: SectorId): void {
  mountSc(mountSectorPage(app, s, { onStart: () => void nightFlow(s), onBack: () => void toStation(), onPractice: (D) => void practiceFlow(s, D) }));
}
async function replayTutorial(s: SectorId): Promise<void> {
  current?.destroy(); current = null;
  await playRound(app, engine.tutorialPlan(s)); persist(); await toStation();
}
/** whatever goes wrong inside a flow (a corrupt save, a bug) ends on the station with the save repaired, never on a dead button */
async function safely(flow: () => Promise<void>): Promise<void> {
  try { await flow(); } catch (err) {
    console.warn('[memory-matrix] flow failed, back to the station', err);
    document.querySelectorAll('.mm-round, .mm-modal, .mm-reveal, .xg-drag-ghost').forEach((e) => e.remove());
    try { engine.abandon(); persist(); } catch { /* keep going */ }
    void toStation();
  }
}
const practiceFlow = (s: SectorId, D: number): Promise<void> => safely(async () => {
  current?.destroy(); current = null;
  for (;;) {
    const exit = await playRound(app, engine.practicePlan(s, D, test && qs.get('seed') && qs.get('sector') === s ? `${qs.get('seed')}:${D}` : undefined)); persist();
    if (exit.choice !== 'next') break;
  }
  toSector(s);
});

/** one night: (tutorial first time) -> gate if due -> six rounds -> the night card -> again / station */
const nightFlow = (s: SectorId): Promise<void> => safely(() => nightFlow0(s));
async function nightFlow0(s: SectorId): Promise<void> {
  current?.destroy(); current = null;
  if (engine.tutorialDue(s)) {
    if (shouldAutoSkip()) { engine.save.tutorial[s] = true; persist(); } else { await playRound(app, engine.tutorialPlan(s)); persist(); }
  }
  engine.startNight(s); voice.newNight(); persist();
  void voice.say('mm.st.flight', {});
  for (;;) {
    const plan = engine.plan();
    if (plan.kind === 'gate' && plan.gate!.i === 0) await showGateIntro(app, plan.gate!.G, true);
    const exit = await playRound(app, plan); persist();
    const fin = exit.fin;
    if (exit.choice === 'station' || !fin) { persist(); void toStation(); return; }
    if (exit.choice === 'sectors') { const n = engine.closeNight(); persist(); if (n) await showNightCard(app, n).then(() => undefined); void toStation(); return; }
    if (fin.gate && (fin.gate.verdict === 'passed' || fin.gate.verdict === 'failed')) { await showGateVerdict(app, fin.gate.verdict === 'passed', plan.gate!.G, s); persist(); }
    if (fin.night) {
      persist();
      const r = await showNightCard(app, fin.night);
      if (r === 'again') { const next = engine.recommended(); engine.startNight(next); voice.newNight(); s = next; persist(); continue; }
      void toStation(); return;
    }
  }
}

/* ------------------------------------------------------------------------------------------- boot */
async function boot(): Promise<void> {
  bindPress(document);
  await shell.ready;
  void installKitSfx().catch(() => []);
  if (test) {
    const tag = document.createElement('div'); tag.className = 'mm-test-ribbon'; tag.textContent = 'TEST'; document.body.append(tag);
    (window as unknown as { __mm: unknown }).__mm = {
      engine, app, nightFlow, toStation, toSector, toAtlas, practiceFlow, simulate: (n: number) => simulate(engine, n),
      /** replace the in-memory save with a (possibly corrupt) one: the engine repairs it exactly like a real load */
      loadSave: (raw: unknown) => { engine.save = normalizeSave(raw, mkSalt); void toStation(); },
      showNight: (n: NightSummary) => showNightCard(app, n), showGateIntro: () => showGateIntro(app, 5, true), showGateVerdict: (ok: boolean) => showGateVerdict(app, ok, 5, 's1'), showSettings: () => openSettings(),
    };
  }
  const sector = qs.get('sector') as SectorId | null, D = Number(qs.get('D') ?? 0);
  if (test && sector && SECTOR_IDS.includes(sector) && D >= 1 && D <= 15) { engine.sec(sector).open = true; root.dataset.ready = '1'; await practiceFlow(sector, D); return; }
  if (test && sector && SECTOR_IDS.includes(sector) && qs.has('night')) { engine.sec(sector).open = true; root.dataset.ready = '1'; await nightFlow(sector); return; }
  await toStation({ intro: true });
}
void boot();
