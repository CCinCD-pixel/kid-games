// App state machine (spec §8.4): gate → (first time) 1-1 → result → map ⇄ preview → battle → result | debrief.
// Each screen = mount(root, app, …) → { destroy, layout? }. Never auto-advances (the child chooses every next step).
// Snapshots (pause/leave + each 战鼓) go to IndexedDB through snapstore.ts; the save only points at them.
import { showResult, confetti } from '@kit/ui';
import { setHubProgress } from '@kit/progress';
import type { LayoutInfo } from '@kit/shell';
import { LEVELS, ORDER, nextLevel, KERNEL_VERSION, loadGhost } from './content';
import { mountBattle, type BattleEnd, type Screen } from './screens/battle';
import { mountMap, mountPreview, mountDebrief, type DebriefAct } from './screens/menus';
import { mountAlmanac, pageOpen } from './screens/almanac';
import ALMANAC from '../../../content/gear-fort/almanac.json';
import { failCause, type Cause } from './lane/failcause';
import { pairEvents, addCounters, learned } from './lane/learn';
import { FEARS } from './lane/tags';
import type { Snapshot } from './lane/sim';
import { putSnap, getSnap, delSnap } from './snapstore';
import { playTheme, stopMusic } from './audio/music';
import type { AppCtx } from './ctx';
import type { Stars } from './save';

type Cur = { destroy(): void; layout?(l: LayoutInfo): void; pause?(): void; leave?(): void } | null;

export function startApp(root: HTMLElement, app: AppCtx): { layout(l: LayoutInfo): void; pause(): void; leave(): void } {
  let cur: Cur = null;
  const swap = (s: Cur): void => { cur?.destroy(); cur = s; };
  const recent: Record<string, string[]> = {};
  if (app.save.kernelVersion !== KERNEL_VERSION) { app.save.kernelVersion = KERNEL_VERSION; app.save.resume = null; app.persist(); void delSnap('suspend'); void delSnap('checkpoint'); }

  async function map(): Promise<void> {
    playTheme('map', app.save.levels ? Object.keys(app.save.levels).length + 1 : 1);
    const r = app.save.resume; let resume: { level: string; onYes(): void; onNo(): void } | null = null;
    if (r && r.kind === 'suspend') {
      const rec = await getSnap('suspend');
      if (rec && rec.kernelVersion === KERNEL_VERSION && rec.level === r.level) resume = { level: r.level, onYes: () => battle(r.level, rec.loadout, { snap: rec.snap, restore: false }, rec.assist as 0 | 1 | 2), onNo: () => { app.save.resume = null; app.persist(); void delSnap('suspend'); } };
      else { app.save.resume = null; app.persist(); if (rec) app.mark('gf-desync', { level: r.level }); }
    }
    const newPages = (ALMANAC as unknown as { id: string }[]).filter((p) => pageOpen(app, p as never) && app.save.almanac[p.id] !== 'seen').length;
    swap(mountMap(root, app, (id) => preview(id), { onAlmanac: almanac, resume, newPages }));
    app.shell.session?.mark('gf-map', {});
  }
  function almanac(): void { swap(mountAlmanac(root, app, () => void map())); }
  function preview(id: string, assist: 0 | 1 | 2 = 0): void {
    playTheme('map');
    const lv = LEVELS[id];
    swap(mountPreview(root, app, lv, (deck) => battle(id, deck, undefined, assist), () => void map(), assist));
  }
  function battle(id: string, deck: string[], resume?: { snap: Snapshot; restore: boolean }, assist: 0 | 1 | 2 = 0): void {
    stopMusic(500);
    const lv = LEVELS[id]; const rec = app.save.levels[id];
    const seed = ((rec?.attempts ?? 0) * 7919 + ORDER.indexOf(id) * 31 + 1) % 100000 || 1;
    const s: Screen = mountBattle(root, app, {
      level: lv, loadout: deck, seed, resume: resume?.snap ?? null, restore: resume?.restore, assist,
      onSnap: (snap, kind, flag, now) => {
        void putSnap({ key: kind, level: id, kind, seed, loadout: deck, snap, h: snap.h, kernelVersion: KERNEL_VERSION, restored: snap.restored || 0, assist, flag, at: new Date().toISOString() }, now);
        if (kind === 'suspend') { app.save.resume = { level: id, kind, key: kind, at: new Date().toISOString() }; app.persist(); }
      },
    }, (r) => (r ? ended(id, deck, r, assist) : void map()));
    swap(s);
    app.shell.session?.mark('gf-start', { id, attempt: (rec?.attempts ?? 0) + 1, assist });
  }
  function ended(id: string, deck: string[], r: BattleEnd, assist: number): void {
    const s = app.save; const rec = s.levels[id] ?? { best: 0 as Stars, attempts: 0, firstTry: null, wins: 0, lastAt: '' };
    const firstWin = r.result === 'win' && rec.wins === 0;
    rec.attempts++; if (rec.firstTry == null) rec.firstTry = r.result; rec.lastAt = new Date().toISOString();
    const pe = pairEvents(r.S); addCounters(s.counters, pe);
    const before = s.learned.length;
    for (const [k, fs] of Object.entries(FEARS)) for (const c of fs) { const key = `${k}>${c}`; if (!s.learned.includes(key) && learned(s.counters, k, c)) s.learned.push(key); }
    if (r.result === 'win') {
      rec.wins++; rec.best = Math.max(rec.best, r.stars) as Stars; s.lossStreak[id] = 0;
      const nx = nextLevel(id); if (nx && ORDER.indexOf(nx) > ORDER.indexOf(s.current)) s.current = nx;
    } else s.lossStreak[id] = (s.lossStreak[id] ?? 0) + 1;
    s.levels[id] = rec; s.resume = null; app.persist(); void delSnap('suspend');
    const won = Object.values(s.levels).filter((x) => x.wins > 0).length;
    setHubProgress('gear-fort', { label: `第一卷 第 ${Math.min(11, ORDER.indexOf(s.current) + 1)} 关`, value: won / ORDER.length });
    if (r.result === 'win') void result(id, r, firstWin, s.learned.length > before, assist); else debrief(id, deck, r);
  }
  async function result(id: string, r: BattleEnd, firstWin: boolean, newLearn: boolean, assist: number): Promise<void> {
    swap(null); playTheme('map');
    const lv = LEVELS[id]; const nx = nextLevel(id); const canNext = !!nx && +nx.split('-')[0] === 1;
    if (r.stars === 3) confetti(70);
    // 讲给爸爸听: only for 检验关, Boss and a teaching level's first win (驿站 arrive in build stage 2; spec §5.8)
    const ask = firstWin && !assist && ['teach', 'test', 'boss'].includes(lv.type || '') ? lv.voice?.ask : null;
    void (async () => {
      await app.voice.say(r.stars === 3 ? 'fort.result.star3' : 'fort.result.win');
      if (newLearn) await app.voice.say('fort.good.learned');
      if (ask) await app.voice.say(ask);
    })();
    const a = await showResult({
      ribbon: `${lv.id} · ${lv.name}`, title: '这一招，挡住了！', stars: r.stars as Stars, accentGame: 'defense',
      text: ask ? app.voice.text(ask) : r.S.stats.logsUsed ? `檑木用了 ${r.S.stats.logsUsed} 根` : '一根檑木都没用——守得稳！',
      stats: [{ label: '鲁班的附加题', value: r.stars === 3 ? '做到了' : lv.star3Text || '—' }, ...(newLearn ? [{ label: '学会', value: '新的一招' }] : [])],
      actions: [...(canNext ? [{ id: 'next', label: '下一关', kind: 'primary' as const }] : []), { id: 'again', label: '再玩一次', kind: 'secondary' as const }, { id: 'map', label: '回地图', kind: 'secondary' as const }],
    });
    app.voice.stop();
    if (a === 'next' && nx) preview(nx); else if (a === 'again') preview(id); else void map();
  }
  function debrief(id: string, deck: string[], r: BattleEnd, cause?: Cause): void {
    playTheme('map');
    const lv = LEVELS[id]; const c = cause ?? failCause(r.S, { recent: recent[id] || [] });
    if (!cause) (recent[id] ||= []).push(c.id + (c.kind ? ':' + c.kind : ''));
    const streak = app.save.lossStreak[id] ?? 0;
    swap(mountDebrief(root, app, lv, c, r.checkpoint ? r.checkpointFlag : 0, (a: DebriefAct) => {
      if (a === 'checkpoint' && r.checkpoint) battle(id, deck, { snap: r.checkpoint, restore: true });
      else if (a === 'restart') preview(id);
      else if (a === 'assist1') preview(id, 1);
      else if (a === 'assist2') preview(id, 2);
      else if (a === 'ghost') void ghost(id, () => debrief(id, deck, r, c));
      else void map();
    }, streak));
  }
  async function ghost(id: string, back: () => void): Promise<void> {
    const g = await loadGhost(id); if (!g) { back(); return; }
    stopMusic(400);
    swap(mountBattle(root, app, { level: LEVELS[id], loadout: g.loadout, seed: g.seed, ghost: g }, () => back()));
    app.mark('gf-ghost', { level: id });
  }
  // first visit: straight into 1-1 (first touch ≤ 8 s, spec §2.4); afterwards the map
  if (!Object.keys(app.save.levels).length && !app.save.resume) battle('1-1', LEVELS['1-1'].loadout || ['shooter']); else void map();
  return { layout: (l) => cur?.layout?.(l), pause: () => cur?.pause?.(), leave: () => cur?.leave?.() };
}
