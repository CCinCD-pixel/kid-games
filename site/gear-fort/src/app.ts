// App state machine (spec §8.4): gate → (first time) 1-1 → result → map ⇄ preview → battle → result | debrief.
// Each screen = mount(root, app, …) → { destroy, layout? }. Never auto-advances (the child chooses every next step).
// Snapshots (pause/leave + each 战鼓) go to IndexedDB through snapstore.ts; the save only points at them.
import { showResult, confetti, shouldAutoSkip } from '@kit/ui';
import { installPointRead } from './pointread';
import { setHubProgress } from '@kit/progress';
import type { LayoutInfo } from '@kit/shell';
import { LEVELS, ORDER, nextLevel, KERNEL_VERSION, loadGhost, PLAYABLE_VOLUMES, volOf, CAMPAIGN } from './content';
import { playStory, mountInn, type StoryId, type InnAct } from './screens/story';
import { mountSong, volStars, FLAG_STARS } from './render/songcity';
import { openSettings } from './screens/settings';
import { parentMetrics, noteGame } from './metrics';
import * as sfx from './audio/sfx';
import { mountPuzzles, nextPuzzle } from './screens/puzzles';
import { puzzleLevel, type Puzzle } from './lane/puzzle';
import { mountBattle, type BattleEnd, type Screen, type Placed } from './screens/battle';
import { mountMap, mountPreview, mountDebrief, type DebriefAct } from './screens/menus';
import { mountAlmanac, isNewPage } from './screens/almanac';
import ALMANAC from '../../../content/gear-fort/almanac.json';
import { failCause, type Cause } from './lane/failcause';
import { pairEvents, addCounters, learned } from './lane/learn';
import { FEARS } from './lane/tags';
import type { Snapshot } from './lane/sim';
import type { Level } from './lane/types';
import { putSnap, getSnap, delSnap, putReplay, getReplays, usableSnap } from './snapstore';
import { goodLines } from './theme/mozi';
import { cond as bonusOf } from './lane/stars';
/** 鲁班的附加题 met? (a stripped-down state — the test hook's — falls back to the stars) */
const bonusMet = (S: BattleEnd['S'], stars: number): boolean => { try { return bonusOf(S); } catch { return stars === 3; } };
import { nameOf } from './content';
import { rigIcon } from './art/icons';
import { atlasFor } from './ctx';
import type { Action } from './lane/types';
import { playTheme, stopMusic, warmMusic, setMusicEnabled } from './audio/music';
import { warmSfx } from './audio/sfx';
import type { AppCtx } from './ctx';
import type { Stars } from './save';

type Cur = { destroy(): void; layout?(l: LayoutInfo): void; pause?(): void; leave?(): void | Promise<void> } | null;

export function startApp(root: HTMLElement, app: AppCtx): { layout(l: LayoutInfo): void; pause(): void; leave(): void | Promise<void> } {
  setMusicEnabled(app.save.settings.music !== false);
  installPointRead(root, app); // 点读: tap any word (spec §2.6)
  warmMusic(); warmSfx(); // synthesize instruments + battle sounds in idle slices once audio is unlocked (spec §8.6)
  let cur: Cur = null;
  const swap = (s: Cur): void => { cur?.destroy(); cur = s; };
  const recent: Record<string, string[]> = {};
  // a new kernel cannot replay old snapshots: drop them, and say so (gf-desync) when one was waiting to be resumed (§8.8)
  if (app.save.kernelVersion !== KERNEL_VERSION) { if (app.save.resume) app.mark('gf-desync', { level: app.save.resume.level, why: 'kernel', was: app.save.kernelVersion }); app.save.kernelVersion = KERNEL_VERSION; app.save.resume = null; app.persist(); void delSnap('suspend'); void delSnap('checkpoint'); }

  async function map(): Promise<void> {
    playTheme('map', app.save.levels ? Object.keys(app.save.levels).length + 1 : 1);
    // the newest durable snapshot: 暂停/离开 → 原样接着推; only a 战鼓 checkpoint (the page was killed) → 从第 N 面战鼓接着推 (§8.4)
    const r = app.save.resume; let resume: { level: string; flag?: number; onYes(): void; onNo(): void } | null = null;
    if (r) {
      const rec = await getSnap(r.kind);
      // a suspend after a 战鼓: keep that checkpoint too, so 「从第 N 面战鼓重来」 survives 🏠 / 回地图 / page eviction
      const cpRec = r.kind === 'suspend' && rec ? await getSnap('checkpoint') : null;
      const cp = cpRec && rec && usableSnap(cpRec, r.level, KERNEL_VERSION) && cpRec.seed === rec.seed && cpRec.snap.tick <= rec.snap.tick ? { snap: cpRec.snap, flag: cpRec.flag } : null;
      if (rec && usableSnap(rec, r.level, KERNEL_VERSION)) resume = { level: r.level, flag: r.kind === 'checkpoint' ? rec.flag : undefined, onYes: () => battle(r.level, rec.loadout, { snap: rec.snap, restore: r.kind === 'checkpoint', paused: true, checkpoint: cp }, rec.assist as 0 | 1 | 2), onNo: () => { app.save.resume = null; app.persist(); void delSnap('suspend'); void delSnap('checkpoint'); } };
      else { app.save.resume = null; app.persist(); if (rec) app.mark('gf-desync', { level: r.level }); }
    }
    const newPages = (ALMANAC as unknown as { id: string }[]).filter((p) => isNewPage(app, p as never)).length;
    swap(mountMap(root, app, (id) => void preview(id), { onAlmanac: almanac, onPuzzles: puzzles, resume, newPages, onSettings: () => openSettings(app, undefined, { replay }) }));
  }
  /** 设置 → 故事和教学 (Dad, 2026-10-08): every skipped or seen scene and the 1-1 lesson stay replayable */
  function replay(what: StoryId | 'tut'): void {
    if (what === 'tut') battle('1-1', LEVELS['1-1'].loadout || ['shooter'], undefined, 0, true);
    else { swap(null); stopMusic(300); void playStory(root, app, what, { replay: true }).then(() => void map()); }
  }
  function almanac(): void { swap(mountAlmanac(root, app, () => void map())); }
  // ── 锦囊谜题 (static drills, spec §3.18) ──
  function puzzles(): void { playTheme('map'); swap(mountPuzzles(root, app, (p) => drill(p), () => void map())); }
  function drill(p: Puzzle, placed: Placed[] = []): void {
    stopMusic(400);
    swap(mountBattle(root, app, { level: puzzleLevel(p), loadout: p.deck, seed: 0, puzzle: { p, placed } }, (r) => (r ? void drillEnd(p, r) : puzzles())));
  }
  async function drillEnd(p: Puzzle, r: BattleEnd): Promise<void> {
    swap(null); playTheme('map');
    const win = r.result === 'win'; const spent = r.spent ?? 0; const rec = app.save.puzzles[p.id] ?? { stars: 0 as Stars, bestSpent: null, tries: 0 };
    rec.tries++; if (win) { rec.stars = Math.max(rec.stars, r.stars) as Stars; rec.bestSpent = rec.bestSpent == null ? spent : Math.min(rec.bestSpent, spent); }
    app.save.puzzles[p.id] = rec; app.persist();
    if (win && r.stars === 3) confetti(50);
    void app.voice.say(win ? (spent <= p.par ? 'fort.pz.par' : 'fort.pz.held') : 'fort.pz.notyet');
    const nx = win ? nextPuzzle(app, p.id) : null;
    const a = await showResult({
      ribbon: `锦囊谜题 · ${p.groupName} ${p.id.slice(-2).replace(/^0/, '')}`, title: win ? (spent <= p.par ? '正好够！' : '守住了！') : '还没守住', stars: (win ? r.stars : 0) as Stars, accentGame: 'defense',
      text: win ? (spent <= p.par ? '一粒粮都没浪费。' : `再省 ${spent - p.par} 粮，就是三颗星。`) : '改一改阵，再推一次——不算输。',
      stats: [{ label: '用粮', value: `${spent}` }, { label: '最省', value: win && rec.stars === 3 ? `${p.par}` : '？' }],
      actions: [...(nx ? [{ id: 'next', label: '下一题', kind: 'primary' as const }] : []), { id: 'again', label: win ? '再省一点' : '改一改', kind: (nx ? 'secondary' : 'primary') as 'primary' | 'secondary' }, { id: 'list', label: '回谜题', kind: 'secondary' as const }],
    });
    app.voice.stop();
    if (a === 'next' && nx) drill(nx); else if (a === 'again') drill(p, r.placed ?? []); else puzzles();
    const m = parentMetrics(app.save); if (win && r.stars === 3) app.mark('gf-parent', m as unknown as Record<string, unknown>);
  }
  async function preview(id: string, assist: 0 | 1 | 2 = 0): Promise<void> {
    if (id === '2-1' && !app.save.story.includes('v2open')) await story('v2open');
    playTheme('map');
    const lv = LEVELS[id];
    swap(mountPreview(root, app, lv, (deck) => battle(id, deck, undefined, assist), () => void map(), assist));
  }
  function battle(id: string, deck: string[], resume?: { snap: Snapshot; restore: boolean; paused?: boolean; checkpoint?: { snap: Snapshot; flag: number } | null }, assist: 0 | 1 | 2 = 0, tutorial = false): void {
    stopMusic(500);
    const lv = LEVELS[id]; const rec = app.save.levels[id];
    const seed = ((rec?.attempts ?? 0) * 7919 + ORDER.indexOf(id) * 31 + 1) % 100000 || 1;
    const s: Screen = mountBattle(root, app, {
      level: lv, loadout: deck, seed, resume: resume?.snap ?? null, restore: resume?.restore, startPaused: !!resume?.paused, checkpoint: resume?.checkpoint ?? null, assist, tutorial,
      onSnap: (snap, kind, flag, now) => {
        const p = putSnap({ key: kind, level: id, kind, seed, loadout: deck, snap, h: snap.h, kernelVersion: KERNEL_VERSION, restored: snap.restored || 0, assist, flag, at: new Date().toISOString() }, now);
        app.save.resume = { level: id, kind, key: kind, at: new Date().toISOString() }; // always the newest snapshot
        // §8.8: never serialise the whole save on the 战鼓 tick — a checkpoint's save is written with its snapshot, on
        // idle; a suspend (pause / hidden / 🏠) still writes at once (QA r4 tech)
        if (now || kind !== 'checkpoint') app.persist(); else void p.then(() => app.persist());
        return p;
      },
      onAbandon: (log) => logGame(id, deck, assist, 'abandon', 0, log), // the pause snapshot stays: the map still offers 接着推演
    }, (r) => (r ? ended(id, deck, r, assist) : void map()));
    swap(s);
  }
  function ended(id: string, deck: string[], r: BattleEnd, assist: number): void {
    const s = app.save; const rec = s.levels[id] ?? { best: 0 as Stars, attempts: 0, firstTry: null, wins: 0, lastAt: '' };
    const firstWin = r.result === 'win' && rec.wins === 0;
    const v = volOf(id); const starsBefore = volStars(s, v);
    rec.attempts++; if (rec.firstTry == null) rec.firstTry = r.result; rec.lastAt = new Date().toISOString();
    logGame(id, deck, assist, r.result, r.stars, { actions: r.actions ?? [], from: r.from ?? 0, tick: r.S.tick, seed: r.seed ?? 0 });
    // PvZ 老手快速通道 (§2.4): followed the hand within 3 s in both 1-1 and 1-2 → later teaching levels wait 5 s for the hand
    if ((id === '1-1' || id === '1-2') && r.result === 'win' && r.quick != null) { const q = 'quick.' + id; s.story = s.story.filter((x) => x !== q); if (r.quick) s.story.push(q); s.fastTrack = s.story.includes('quick.1-1') && s.story.includes('quick.1-2'); }
    const pe = pairEvents(r.S); addCounters(s.counters, pe);
    const before = s.learned.length;
    for (const [k, fs] of Object.entries(FEARS)) for (const c of fs) { const key = `${k}>${c}`; if (!s.learned.includes(key) && learned(s.counters, k, c)) s.learned.push(key); }
    if (r.result === 'win') {
      if (id === '1-1' && !s.story.includes('tut.1-1')) s.story.push('tut.1-1'); // the 1-1 lesson is done: later 1-1s play without it (设置 replays it)
      rec.wins++; rec.best = Math.max(rec.best, r.stars) as Stars; s.lossStreak[id] = 0;
      const nx = nextLevel(id); if (nx && ORDER.indexOf(nx) > ORDER.indexOf(s.current)) s.current = nx;
    } else s.lossStreak[id] = (s.lossStreak[id] ?? 0) + 1;
    s.levels[id] = rec; s.resume = null;
    const m0 = JSON.stringify(parentMetrics(s));
    noteGame(s, id, r.S, { assist, asked: r.asked, hints: r.hints ?? [] });
    const m1 = parentMetrics(s); if (JSON.stringify(m1) !== m0) app.mark('gf-parent', m1 as unknown as Record<string, unknown>);
    app.persist(); void delSnap('suspend'); void delSnap('checkpoint');
    const thr = FLAG_STARS[v - 1]; const flagNew = starsBefore < thr && volStars(s, v) >= thr ? v : 0;
    const won = Object.values(s.levels).filter((x) => x.wins > 0).length;
    const cv = volOf(s.current); setHubProgress('gear-fort', { label: `第${cv === 1 ? '一' : '二'}卷 第 ${s.current.split('-')[1]} 关`, value: won / ORDER.length });
    if (r.result === 'win') void result(id, r, firstWin, s.learned.slice(before), assist, flagNew as 0 | 1 | 2); else debrief(id, deck, r, assist);
  }
  /** one replay record per finished / abandoned game (snapstore keeps the last 8, ≤ 8 KB each) */
  function logGame(id: string, deck: string[], assist: number, result: 'win' | 'lose' | 'abandon', stars: number, log: { actions: [number, Action[]][]; from: number; tick: number; seed: number }): void {
    void putReplay({ level: id, seed: log.seed, from: log.from, loadout: deck.slice(), assist, result, stars, tick: log.tick, actions: log.actions, at: new Date().toISOString(), kernelVersion: KERNEL_VERSION });
  }
  async function result(id: string, r: BattleEnd, firstWin: boolean, newPairs: string[], assist: number, flagNew: 0 | 1 | 2 = 0): Promise<void> {
    const newLearn = newPairs.length > 0;
    swap(null); playTheme('map');
    const lv = LEVELS[id]; const nx = nextLevel(id); const canNext = !!nx && PLAYABLE_VOLUMES.includes(volOf(nx));
    if (r.stars === 3) confetti(70);
    // 讲给爸爸听 only at 检验关 / Boss / a teaching level's first win — and at the 驿站 instead when this level has one (§5.8)
    const ask = firstWin && !assist && !CAMPAIGN.inns[id] && ['teach', 'test', 'boss'].includes(lv.type || '') ? lv.voice?.ask : null;
    const repairLine = firstWin && CAMPAIGN.repairArt[id] ? `fort.repair.${id}` : null;
    // at most 2 automatic lines: the win line + the most important of 学会 / 宋城修好了 (§5.8, D25); the rest is tap-to-hear
    const second = newLearn ? 'fort.good.learned' : repairLine;
    let resLive = true; // the second line never plays once the child has left the result (QA r2 tech major)
    void (async () => { const r1 = await app.voice.say(r.stars === 3 ? 'fort.result.star3' : 'fort.result.win'); if (second && resLive && r1 !== 'interrupted') await app.voice.say(second); })();
    let song: ReturnType<typeof mountSong> | null = null; let flagTimer = 0;
    const a = await showResult({
      ribbon: `${lv.id} · ${lv.name}`, title: '这一招，挡住了！', stars: r.stars as Stars, accentGame: 'defense',
      text: ask ? app.voice.text(ask) : r.S.stats.logsUsed ? `檑木用了 ${r.S.stats.logsUsed} 根` : '一根檑木都没用——守得稳！',
      // the bonus result itself (not stars === 3, which also needs ≤ 1 檑木): 做到了 ✓ / 下次再试 big, the condition small (QA r3)
      stats: [lv.star3Text ? { label: `鲁班的附加题：${lv.star3Text}`, value: bonusMet(r.S, r.stars) ? '<span class="gf-bonus is-ok">做到了 ✓</span>' : '<span class="gf-bonus is-miss">下次再试</span>' } : { label: '鲁班的附加题', value: r.stars === 3 ? '做到了 ✓' : '—' }],
      actions: [...(canNext ? [{ id: 'next', label: '下一关', kind: 'primary' as const }] : []), { id: 'again', label: '再玩一次', kind: 'secondary' as const }, { id: 'map', label: '回地图', kind: 'secondary' as const }],
      onOpen: (panel) => {
        panel.classList.add('gf-resultp'); // three equal buttons (spec §2.1)
        // 今天学会了：冲车怕铁蒺藜 — the pair as two pictures + caption; tap → hear it (spec §2.3-3)
        if (newLearn) {
          const [k, c] = newPairs[0].split('>'); const at = atlasFor(110, app.dpr);
          const b = document.createElement('button'); b.type = 'button'; b.className = 'gf-learned';
          const say = app.voice.text(`fort.alm.${k}.fear`) ? `fort.alm.${k}.fear` : 'fort.good.learned';
          b.innerHTML = `<span class="gf-learned__pair"><i></i><b>怕</b><i></i></span><span class="gf-learned__cap" data-line="${say}"><em>今天学会了：</em><b>${nameOf(k)}怕${nameOf(c)}</b>${newPairs.length > 1 ? `<small>还有 ${newPairs.length - 1} 招</small>` : ''}</span>`;
          const ii = b.querySelectorAll('.gf-learned__pair i'); ii[0].append(rigIcon(at, k, 56, app.dpr)); ii[1].append(rigIcon(at, c, 56, app.dpr));
          b.addEventListener('click', () => { app.ui('ui-tap', 0.4); void app.voice.say(say, { interrupt: true }); });
          panel.insertBefore(b, panel.querySelector('.xg-modal__actions'));
        }
        if (!repairLine && !flagNew) return;
        // 宋城修复: a 2-s close-up of the part just repaired (carpenter knocks + 编钟), then the whole tray (§5.7)
        const box = document.createElement('button'); box.className = 'gf-repair'; box.type = 'button'; box.setAttribute('aria-label', '宋城修复');
        const cap = document.createElement('span'); cap.className = 'gf-repair__cap'; cap.textContent = app.voice.text(repairLine ?? 'fort.repair.flag'); box.appendChild(cap);
        panel.insertBefore(box, panel.querySelector('.xg-modal__actions'));
        const knock = (): void => { sfx.play('repair.knock'); setTimeout(() => sfx.play('repair.knock'), 240); setTimeout(() => sfx.play('repair.knock'), 480); setTimeout(() => sfx.play('token.ready'), 820); };
        const flag = (): void => { song?.destroy(); song = mountSong(box, app.save, app.dpr, { popFlag: flagNew as 1 | 2, zoomTo: 'flag', onPop: () => sfx.play('flag.drum') }); box.insertBefore(song.canvas, cap); cap.textContent = app.voice.text('fort.repair.flag'); void app.voice.say('fort.repair.flag'); };
        if (repairLine) { song = mountSong(box, app.save, app.dpr, { popLevel: id, zoomTo: CAMPAIGN.repairArt[id], onPop: knock }); box.insertBefore(song.canvas, cap); if (flagNew) flagTimer = window.setTimeout(flag, 3800); }
        else flag();
        box.addEventListener('click', () => void app.voice.say(cap.textContent === app.voice.text('fort.repair.flag') ? 'fort.repair.flag' : repairLine!, { interrupt: true }));
      },
    });
    resLive = false; clearTimeout(flagTimer); (song as ReturnType<typeof mountSong> | null)?.destroy(); app.voice.stop();
    await afterWin(id, a);
  }
  /** after a win: 序幕 + 码头 (first 1-1) → 驿站 (every 3 levels) → 卷尾 → the chosen next screen (spec §2.1) */
  async function afterWin(id: string, a: string): Promise<void> {
    const s = app.save;
    if (a === 'again') { void preview(id); return; }
    let dest = a;
    // the first-run chain 序幕 → 码头 → 旅途地图 (spec §2.1): the child's first look at the journey map, with its 3-s
    // first-visit guide, whichever button he pressed on the 1-1 result (QA r5)
    if (id === '1-1' && !s.story.includes('prologue')) { await story('prologue'); await story('dock'); dest = 'map'; }
    // the 驿站 offers its two buttons at once; under the parent's 跳过开场和教学 it is skipped (seen) and his result-screen choice stands
    if (CAMPAIGN.inns[id] && !s.story.includes('inn.' + id)) {
      if (shouldAutoSkip()) { s.story.push('inn.' + id); app.persist(); app.mark('gf-inn', { level: id, skipped: true }); }
      else dest = (await inn(id)) === 'more' ? 'next' : 'map';
    }
    const V = CAMPAIGN.volumes[volOf(id) - 1]; const end: StoryId = volOf(id) === 1 ? 'v1end' : 'v2end';
    if (V.levels[V.levels.length - 1] === id && !s.story.includes(end)) await story(end);
    const nx = nextLevel(id);
    if (dest === 'next' && nx && PLAYABLE_VOLUMES.includes(volOf(nx))) void preview(nx); else void map();
  }
  function story(id: StoryId): Promise<void> { swap(null); stopMusic(300); return playStory(root, app, id); }
  function inn(id: string): Promise<InnAct> { return new Promise((res) => { swap(mountInn(root, app, id, (act) => { cur = null; res(act); })); }); }
  function debrief(id: string, deck: string[], r: BattleEnd, assist: number, cause?: Cause, repeat0?: number): void {
    playTheme('map');
    const lv = LEVELS[id]; const c = cause ?? failCause(r.S, { recent: recent[id] || [] });
    const key = c.id + (c.kind ? ':' + c.kind : ''); const repeat = repeat0 ?? (recent[id] || []).filter((x) => x === key).length;
    if (!cause) (recent[id] ||= []).push(key);
    const streak = app.save.lossStreak[id] ?? 0;
    const good = goodLines(r.S, r.checkpoint ? r.checkpointFlag : 0, Math.max(0, streak - 1));
    swap(mountDebrief(root, app, lv, c, r.checkpoint ? r.checkpointFlag : 0, (a: DebriefAct) => {
      // the checkpoint retry keeps this game's help tier (speed, 墨子's hand, the extra grain, and how the game is recorded)
      if (a === 'checkpoint' && r.checkpoint) battle(id, deck, { snap: r.checkpoint, restore: true }, assist as 0 | 1 | 2);
      else if (a === 'restart') void preview(id);
      else if (a === 'assist1') void preview(id, 1);
      else if (a === 'assist2') void preview(id, 2);
      else if (a === 'ghost') void ghost(id, () => debrief(id, deck, r, assist, c, repeat));
      else void map();
    }, streak, { good, repeat, units: r.S.units.filter((u) => !u.dead).map((u) => ({ k: u.k, lane: u.lane, col: u.col })) }));
  }
  async function ghost(id: string, back: () => void): Promise<void> {
    const g = await loadGhost(id); if (!g) { back(); return; }
    stopMusic(400);
    swap(mountBattle(root, app, { level: LEVELS[id], loadout: g.loadout, seed: g.seed, ghost: g }, () => back()));
    app.mark('gf-ghost', { level: id });
  }
  // test/dev only: mount a battle on an arbitrary level (the art "zoo" scene of tests/gear-fort/shoot.mjs)
  if (app.test) (window as unknown as { __gfApp?: unknown }).__gfApp = { battle: (lv: Level, deck: string[]) => { stopMusic(0); swap(mountBattle(root, app, { level: lv, loadout: deck, seed: 1 }, () => void map())); }, level: (id: string) => LEVELS[id], story: (id: StoryId) => story(id).then(() => void map()), inn: (id: string) => void inn(id).then(() => void map()), win: (id: string, stars = 3) => { const S = { stats: { logsUsed: 0 }, ev: [], L: LEVELS[id], loadout: [], flags: [], result: 'win' } as unknown as BattleEnd['S']; ended(id, [], { result: 'win', S, stars, checkpoint: null, checkpointFlag: 0, asked: 0, hints: [] }, 0); }, metrics: () => parentMetrics(app.save), voice: app.voice, play: (id: string, deck: string[], assist: 0 | 1 | 2 = 0) => battle(id, deck, undefined, assist), preview: (id: string) => void preview(id) };
  // ?dev=perf — the V19 stress scene with its overlay (spec §9.8; dev only, dynamic import)
  async function devPerf(): Promise<void> {
    const P = await import('./dev/perf'); stopMusic(0); const off = P.perfOverlay(root);
    swap(mountBattle(root, app, { level: P.perfLevel(LEVELS['2-9']), loadout: ['shooter', 'farm', 'wall', 'lobber', 'beam', 'burner', 'bank'], seed: 1, dev: P.stressHooks() }, () => { off(); void map(); }));
  }
  // ?dev=export — dad's copy of the last 8 games (calibration input, spec §9.11): a button, because iOS only downloads on a tap
  async function devExport(): Promise<void> {
    const list = await getReplays(); const box = document.createElement('div'); box.className = 'gf-export xg-root'; box.dataset.xgTheme = 'night';
    box.innerHTML = `<div class="gf-export__card"><b>推演记录</b><small>最近 ${list.length} 局（给爸爸校准用）</small><button class="xg-btn xg-btn--primary xg-btn--lg">下载 JSON</button><button class="xg-btn xg-btn--ghost" data-a="map">回地图</button></div>`;
    box.querySelector('.xg-btn--primary')!.addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ game: 'gear-fort', kernelVersion: KERNEL_VERSION, at: new Date().toISOString(), replays: list }, null, 1)], { type: 'application/json' })); a.download = `gear-fort-replays-${new Date().toISOString().slice(0, 10)}.json`; a.click(); });
    box.querySelector('[data-a=map]')!.addEventListener('click', () => { box.remove(); void map(); });
    swap(null); root.appendChild(box);
  }
  if (app.test) (window as unknown as { __gfReplays?: unknown }).__gfReplays = getReplays;
  // first visit: straight into 1-1 (first touch ≤ 8 s, spec §2.4); afterwards the map
  if (/[?&]dev=export\b/.test(location.search)) void devExport();
  else if (/[?&]dev=perf\b/.test(location.search)) void devPerf();
  else if (!Object.keys(app.save.levels).length && !app.save.resume) battle('1-1', LEVELS['1-1'].loadout || ['shooter']); else void map();
  return { layout: (l) => cur?.layout?.(l), pause: () => cur?.pause?.(), leave: () => cur?.leave?.() };
}
