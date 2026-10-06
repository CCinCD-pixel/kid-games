/**
 * App router + match driver (spec §8.8). Screens are DOM sections inside #app; the browser history is
 * never touched. LOBBY → MATCH(timed|endless) → PODIUM / ENDLESS_RESULT → LOBBY (never automatic).
 * The match loop: read input → step the sim (fixed 60 Hz, ≤3 steps/frame) → build sprites → HUD.
 * Quality tiers (Q2 1.5 / Q1 1.25 / Q0 1.0 render scale) adapt to frame time and only change pixels.
 */
import { h, createSubtitleBar, toast } from '@kit/ui';
import { getSettings } from '@kit/settings';
import { randomSeed } from '@kit/rng';
import { setHubProgress } from '@kit/progress';
import type { Shell, LayoutInfo } from '@kit/shell';
import { Match, type MatchEvent } from './match';
import type { Renderer } from './render/gl';
import { WorldView } from './render/view';
import { menuMusic } from './menu-music';
import { Hud } from './hud';
import { TouchRouter } from './input/touch-router';
import { SaveCtl, today } from './save';
import { Voice, play, SND, eatSound, MatchPad, lineText, loadSfx } from './audio';
import { renderLobby, pausePanel, settingsPanel, deathCard, podium } from './screens';
import { missionMap, storyCard, briefCard, missionResult, unlockCard, collectionScreen, recordsScreen } from './screens2';
import { MISSIONS, MISSION_BY_ID, twinOf, type Mission } from './sim/mission';
import demos from '../../../content/snake-battle/demos.json';
import { VENUES, VENUE_IDS, TROPHIES, displayName, type VenueId } from './sim/venues';
import { skinById, hex2rgb, aiBodyColor } from './render/art';
import type { KillTag } from './sim/core';

const LEN_WORD: Record<number, string> = { 100: '一百', 200: '两百', 300: '三百', 500: '五百', 800: '八百', 1000: '一千', 1500: '一千五', 2000: '两千' };
const MULTI: Record<number, string> = { 2: 'double', 3: 'triple', 4: 'quad', 5: 'penta' };
const MULTI_TXT: Record<number, string> = { 2: '两连击！', 3: '三连击！', 4: '四连击！', 5: '五连击！' };

export class App {
  save = new SaveCtl();
  voice: Voice;
  sub: ReturnType<typeof createSubtitleBar>;
  venue: VenueId = 'moon';
  private lobby: ReturnType<typeof renderLobby> | null = null;
  match: Match | null = null; view: WorldView | null = null; hud: Hud | null = null; router: TouchRouter | null = null;
  private canvas: HTMLCanvasElement | null = null; private raf = 0; private last = 0;
  private pad = new MatchPad();
  private card: HTMLElement | null = null; private pausePanel: HTMLElement | null = null;
  private matchVoice = { near: 0 };
  private frameTimes: number[] = []; private qT = 0; private slowStreak = 0; private upgraded = false;
  private orientation = '';
  readonly test: boolean;
  /** ?test=1: per-frame main-thread work (ms) for perf probes */
  workLog: number[] = [];
  shell: Shell | null = null;

  constructor(private root: HTMLElement, params: URLSearchParams) {
    this.test = params.has('test');
    this.sub = createSubtitleBar(document.body);
    // subtitles fade 2.5 s after the voice queue drains (the kit bar keeps the last line by design)
    const onCue = this.sub.onCue; let hideT = 0;
    this.sub.onCue = (c) => { clearTimeout(hideT); if (c && this.voice?.inMatch && this.voice.currentPrio === 2) return; onCue(c); if (!c) hideT = window.setTimeout(() => { this.sub.el.hidden = true; }, 2500); };
    this.voice = new Voice({ onCue: this.sub.onCue, onWord: this.sub.onWord, test: this.test && params.has('silentvoice') });
    this.sub.attach(this.voice.narrator);
    const last = VENUE_IDS.filter((v) => this.save.venueOpen(v));
    this.venue = last[last.length - 1] ?? 'moon';
    if (params.get('venue') && VENUE_IDS.includes(params.get('venue') as VenueId)) this.venue = params.get('venue') as VenueId;
  }

  async afterGate() {
    await loadSfx();
    if (!this.match) void this.say('snake.lobby.hello.' + (1 + (new Date().getDate() % 3)));
  }

  private say(id: string, o: { interrupt?: boolean; vars?: Record<string, string | number> } = {}) { return this.voice.say(id, o).catch(() => 'skipped'); }
  /** voice with a lifetime cap per group (spec §7.5): after `cap` plays only the sound + banner remain */
  private sayCapped(group: string, id: string, cap = 3, o: { vars?: Record<string, string | number>; interrupt?: boolean } = {}) {
    if (this.save.voiceCount(group) >= cap) return;
    this.save.voiceBump(group); void this.say(id, o);
  }

  layout(l: LayoutInfo) {
    const s = document.documentElement.style;
    s.setProperty('--sb-st', `${l.safe.top}px`); s.setProperty('--sb-sb', `${l.safe.bottom}px`); s.setProperty('--sb-sl', `${l.safe.left}px`); s.setProperty('--sb-sr', `${l.safe.right}px`);
    s.setProperty('--sb-H', `${l.height - l.safe.top - l.safe.bottom}px`);
    if (this.view) this.view.resize(l.width, l.height, this.renderScale());
    if (this.orientation && this.orientation !== l.orientation && this.match && this.match.state !== 'over') {
      // rotation: pause → relayout → automatic 3-2-1 after 300 ms (spec §3.18)
      const m = this.match;
      if (m.state !== 'paused' && m.state !== 'dying' && m.state !== 'dead') { m.pause(); setTimeout(() => { if (this.match === m && m.state === 'paused' && !this.pausePanel) m.resume(true); }, 300); }
    }
    this.orientation = l.orientation;
  }
  private renderScale() { const q = this.view?.R.quality ?? 2; return Math.min(devicePixelRatio || 1, q === 2 ? 1.5 : q === 1 ? 1.25 : 1); }

  // ---------------------------------------------------------------- lobby
  showLobby() {
    menuMusic(true);
    this.teardownMatch();
    document.body.classList.remove('sb-playing');
    document.getElementById('sb-back')?.removeAttribute('hidden');
    this.root.querySelector('.sb-lobby')?.remove();
    this.closeMenus();
    const name = displayName(getSettings().displayName);
    this.lobby = renderLobby(this.root, this.save, this.venue, name, {
      onPlay: (mode, v) => { this.venue = v; void this.startMatch(mode, v); },
      onVenue: (v, locked) => {
        if (locked) { void this.say(`snake.venue.locked.${v}`).then(() => this.say('snake.venue.locked.or')); return; }
        this.venue = v;
        const d = today();
        if (this.save.data.venueIntroDay[v] !== d) { this.save.data.venueIntroDay[v] = d; this.save.save(); void this.say(`snake.venue.${v}`, { interrupt: true }); }
      },
      onSettings: () => { settingsPanel(this.root, this.save, () => {}); },
      onSoon: () => toast('下一个版本开放，敬请期待！'),
      onMissions: () => this.showMap(),
      onCollection: () => this.showCollection(),
      onRecords: () => this.showRecords(),
    });
    this.drainCards();
    const sr = this.save.data.session;
    if (sr.matchesInRow >= 3 && !this.save.seen(`rest:${today()}`)) { this.save.markSeen(`rest:${today()}`); void this.say('snake.lobby.rest'); }
    setHubProgress('snake-battle', { label: `${VENUES[this.venue].name}` });
  }

  // ---------------------------------------------------------------- match
  async startMatch(mode: 'timed' | 'endless' | 'mission', venue: VenueId, opts: { seed?: number; countdown?: boolean; stress?: number; mission?: string; twin?: number; demo?: boolean; clip?: boolean; waitTouch?: boolean } = {}) {
    this.lobby?.dispose(); this.lobby = null;
    this.closeMenus();
    this.teardownMatch();
    menuMusic(false); this.voice.inMatch = true;
    document.body.classList.add('sb-playing');
    document.getElementById('sb-back')?.setAttribute('hidden', '');
    const s = this.save.data, settings = getSettings();
    const seed = opts.seed ?? randomSeed();
    const skin = s.equipped.skin;
    const avoid = skin === 'venus' ? ['黄', '橙'] : [];
    let mdef: Mission | undefined = opts.mission ? MISSION_BY_ID[opts.mission] : undefined;
    if (mdef && opts.twin) for (let k = 0; k < Math.min(3, opts.twin); k++) mdef = twinOf(mdef);
    const demoRec = opts.demo && opts.mission ? (demos as unknown as { demos: Record<string, { seed: number; keyT: number | null }> }).demos[opts.mission] : undefined;
    const demoSeed = demoRec?.seed;
    const m = new Match({ mode, venue, seed: demoSeed ?? seed, heat: mode === 'timed' ? s.venues[venue].heat : 0, name: displayName(settings.displayName), skin, avoidColors: avoid, stress: opts.stress, countdown: opts.countdown,
      mission: mdef, twin: false, demo: opts.demo ? { tier: 'EXPERT', persona: 'expert' } : undefined, waitTouch: opts.waitTouch });
    if (mdef?.isTwin) (m as Match & { twinLevel?: number }).twinLevel = opts.twin;
    this.demoKey = { t: demoRec?.keyT ?? null, done: false, end: null };
    if (opts.demo && m.run) {
      m.state = 'playing';
      // H2 看一招: the clip = 4 s before the key moment to 2 s after (spec §5.1); skip ahead headlessly
      if (opts.clip && demoRec?.keyT != null) {
        const n = Math.max(0, Math.round((demoRec.keyT - 4) * 60));
        for (let i = 0; i < n && !m.run.done; i++) { m.run.step(); m.world.drainEvents(() => {}); }
        this.demoKey.end = demoRec.keyT + 2;
      }
    }
    this.match = m; this.matchVoice = { near: 0 }; this.missionVoice = { headon: false, windup: false }; this.hintState = { idle: 0, noProg: 0, lastProg: '', h0: 0, pointShown: false };
    if (!this.glCanvas || this.glR?.lost) { this.glCanvas = h('canvas', { id: 'sb-world', class: 'sb-world' }) as HTMLCanvasElement; this.glR = null; }
    this.canvas = this.glCanvas;
    this.root.append(this.canvas);
    let view: WorldView;
    const sd = this.save.data, wearCrown = m.run?.m.id === 'c5m8' || (sd.owned.includes('crown') && sd.settings.crown);
    try { view = new WorldView(this.canvas, m, { trail: sd.equipped.trail, crown: wearCrown, renderer: this.glR ?? undefined }); this.glR = view.R; }
    catch (e) { console.error('[snake-battle] view init failed', e); toast('画面准备失败，请重新打开'); this.showLobby(); return; }
    this.view = view;
    view.onRipple = () => play('hit-soft', { volume: 0.5 });
    view.R.onLost = () => { m.pause(); this.showPause(); };
    view.R.onRestored = () => { view.R.setAtlas(view.atlas); };
    const L = this.shell?.layout();
    view.resize(L?.width ?? innerWidth, L?.height ?? innerHeight, this.renderScale());
    const hud = new Hud(this.root, m, view, this.save.boostSide()); this.hud = hud;
    hud.showNames = s.settings.showNames;
    this.router = new TouchRouter({
      surface: this.root, boostEl: hud.boost, pauseEl: hud.pause, stickEl: hud.stick,
      headScreen: () => (m.me.alive ? view.worldToScreen(m.me.x, m.me.y) : null),
      mode: () => this.save.data.settings.control, doubleTapBoost: () => this.save.data.settings.doubleTapBoost,
      onPause: () => this.showPause(), onBoostLocked: () => play('ui-locked', { volume: 0.5 }), canBoost: () => m.me.mass >= 20,
    });
    m.onEvent = (e) => this.onMatchEvent(e);
    if (m.run) {
      hud.root.classList.toggle('is-demo', m.demo);
      if (!m.demo) this.save.startMission(m.run.m.id);
      this.shell?.session?.mark('mission-start', { id: m.run.m.id, seed: m.seed, twin: !!opts.twin, demo: !!opts.demo });
      if (m.demo) this.demoOverlay(m);
      else if (opts.waitTouch) this.ghostHand(m);
      if (!m.demo) this.missionIntroVoice(m);
    } else {
      this.save.startMatch(mode as 'timed' | 'endless', venue);
      this.shell?.session?.mark('match-start', { mode, venue, seed, heat: s.venues[venue].heat });
    }
    if (s.settings.matchMusic) this.pad.start(m.run ? Math.min(3, m.run.m.ch - 1) : VENUE_IDS.indexOf(venue));
    this.last = performance.now();
    const loop = (now: number) => { this.raf = requestAnimationFrame(loop); this.frame(now); };
    this.raf = requestAnimationFrame(loop);
    if (this.test) (window as unknown as { __sb: unknown }).__sb = { app: this, match: m, view, hud };
  }

  private frame(now: number) {
    const m = this.match, v = this.view, hud = this.hud, r = this.router; if (!m || !v || !hud || !r) return;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const t0 = performance.now();
    r.tick();
    m.input.target = r.target; m.input.boost = r.boost;
    if (m.waitTouch && r.target !== null) this.root.querySelector('.sb-ghost')?.remove();
    if (m.run && !m.demo) this.hintTick(m, dt);
    if (m.demo) this.demoTick(m);
    m.update(dt);
    v.focus = m.state === 'dying' && m.lastDeath ? { x: m.lastDeath.x, y: m.lastDeath.y, killer: m.lastDeath.killer?.id ?? -1, t0: v.focus?.t0 ?? v.time } : (m.state === 'dying' ? v.focus : null);
    v.frame(dt);
    hud.update(dt);
    const work = performance.now() - t0;
    if (this.test) { this.workLog.push(work); if (this.workLog.length > 4000) this.workLog.shift(); }
    this.adaptQuality(work, dt);
  }

  /** every 2 s: p90 > 18 ms twice → one tier down; 20 s p90 < 12 ms → one tier up (once per match) */
  private adaptQuality(work: number, dt: number) {
    const v = this.view!; this.frameTimes.push(Math.max(work, dt * 1000 * 0.25)); this.qT += dt;
    if (this.qT < 2) return; this.qT = 0;
    const a = this.frameTimes.sort((x, y) => x - y), p90 = a[Math.floor(a.length * 0.9)] ?? 0; this.frameTimes = [];
    if (p90 > 18) { this.slowStreak++; if (this.slowStreak >= 2 && v.R.quality > 0) { v.R.quality--; this.slowStreak = 0; this.relayout(); this.shell?.session?.mark('quality', { q: v.R.quality }); } }
    else { this.slowStreak = 0; if (p90 < 12 && v.R.quality < 2 && !this.upgraded && this.match!.world.t > 20) { v.R.quality++; this.upgraded = true; this.relayout(); } }
  }
  private relayout() { const L = this.shell?.layout(); if (L) this.view?.resize(L.width, L.height, this.renderScale()); }

  private onMatchEvent(e: MatchEvent) {
    const m = this.match!, v = this.view!, hud = this.hud!, me = m.me;
    switch (e.kind) {
      case 'countdown': hud.showCount(e.n); play('ui-tick'); if (e.n === 3 && m.world.t === 0) void this.say('snake.match.go', { interrupt: true }); break;
      case 'go': hud.showCount('出发'); play('launch', { volume: 0.7 }); break;
      case 'milestone': {
        hud.bannerShow(`长度${LEN_WORD[e.n]}！`, 'is-len'); play('level-up'); v.fx.confetti(me.x, me.y, 16); v.zoom *= 0.97;
        this.sayCapped(`len.${e.n}`, `snake.len.${e.n}`);
        break;
      }
      case 'rank1': hud.bannerShow('你是第一名！', 'is-gold'); play('jingle-magic'); this.pad.raise(true); void this.say('snake.match.rank1'); setTimeout(() => this.pad.raise(m.timeLeft <= 10), 6000); break;
      case 'last10': play('ui-notify'); void this.say('snake.match.last10'); this.pad.raise(true); break;
      case 'wall': if (!this.save.seen('wall')) { this.save.markSeen('wall'); void this.say('snake.match.wall'); } break;
      case 'boostReady': if (!this.save.seen('boost')) { this.save.markSeen('boost'); hud.pulseBoost(); void this.say('snake.match.boost'); } break;
      case 'boost': if (e.on) SND.boostStart(); break;
      case 'ending': hud.bannerShow('比赛结束', 'is-end'); play('jingle-round-over'); this.pad.raise(false); void this.say('snake.match.end', { interrupt: true }); this.root.classList.add('sb-freeze'); break;
      case 'died': this.onDied(e.cause.tag, e.cause.killer); break;
      case 'card': this.showDeathCard(); break;
      case 'respawned': this.card?.remove(); this.card = null; hud.setDying(false); if (m.run?.m.playerRespawn === 'keep') { if (!this.save.seen('respawn.keep')) { this.save.markSeen('respawn.keep'); void this.say('snake.respawn.keep'); } } else if (!this.save.seen('respawn')) { this.save.markSeen('respawn'); void this.say('snake.respawn'); } break;
      case 'endlessNudge': void this.say('snake.endless.nudge'); break;
      case 'over': void (m.run ? this.finishMission() : this.finishMatch()); break;
      case 'mission': this.onMissionNote(e.n); break;
      case 'missionDone': if (e.ok) { hud.bannerShow(m.demo ? '看明白了吗？' : '过关！', 'is-gold'); play('jingle-win'); v.fx.confetti(me.x, me.y, 24); } break;
      case 'sim': this.onSim(e.e); break;
    }
  }

  private onSim(e: import('./sim/world').SimEvent) {
    const m = this.match!, v = this.view!, hud = this.hud!, w = m.world, me = m.me;
    switch (e.type) {
      case 'eat': { eatSound(e.kind === 'big'); if (e.kind === 'big') hud.floater('+5', me.x, me.y, 'is-gold'); break; }
      case 'meteor': {
        const s = w.byId.get(e.id)!;
        if (s === me) { play('coin'); SND.meteor(); v.fx.burst(me.x, me.y, [255, 120, 200], 30, 260, 9, 'spark', 0.8); hud.floater('+15', me.x, me.y, 'is-gold'); this.root.classList.remove('sb-rainbow'); void this.root.offsetWidth; this.root.classList.add('sb-rainbow'); v.happyUntil = v.time + 0.6; }
        break;
      }
      case 'pu': {
        const s = w.byId.get(e.id)!;
        if (s === me) { play('powerup'); if (e.kind === 'shield') SND.shieldUp(); if (e.kind === 'magnet') SND.magnet(); this.sayCapped(`pu.${e.kind}`, `snake.pu.${e.kind}`, 3); v.fx.shockwave(me.x, me.y, [255, 255, 255], 10, 60, 0.35); }
        break;
      }
      case 'gem': {
        const k = w.byId.get(e.id)!;
        v.fx.burst(k.x, k.y - k.r, [255, 210, 63], 30, 320, 10, 'spark', 0.8); v.fx.shockwave(k.x, k.y, [255, 120, 200], k.r, k.r * 6, 0.5); v.fx.kick(4, 0.15); SND.gem();
        hud.bannerShow(e.left > 0 ? `宝石 ${(k.crownMax ?? 3) - e.left}/${k.crownMax ?? 3}` : '王冠碎了！', 'is-gold');
        void this.say(e.left > 0 ? 'snake.king.gem' : 'snake.king.down', { interrupt: true });
        break;
      }
      case 'king-windup': { const k = w.byId.get(e.id)!; if (v.onScreen(k.x, k.y, 300)) SND.windup(); if (!this.missionVoice.windup) { this.missionVoice.windup = true; void this.say('snake.king.charge', { interrupt: true }); } break; }
      case 'king-charge': { const k = w.byId.get(e.id)!; if (v.onScreen(k.x, k.y, 200)) { v.fx.shockwave(k.x, k.y, [255, 140, 60], k.r, k.r * 4, 0.35); SND.boostStart(); } break; }
      case 'wake': { const k = w.byId.get(e.id)!; if (v.onScreen(k.x, k.y, 100)) { SND.wake(); hud.floater('醒了！', k.x, k.y, 'is-near'); } break; }
      case 'shieldsave': {
        const s = w.byId.get(e.id)!;
        if (v.onScreen(s.x, s.y, 80)) { v.fx.burst(s.x, s.y, [90, 230, 255], 12, 300, 10, 'shard', 0.5); v.fx.shockwave(s.x, s.y, [255, 255, 255], s.r, s.r * 4, 0.35); SND.shieldBreak(); }
        if (s === me) { void this.say('snake.pu.saved', { interrupt: true }); }
        break;
      }
      case 'nearmiss': {
        if (e.id !== me.id) break;
        const txt = ['好险！', '擦身而过！', '躲开了！'][me.stats.nearMiss % 3];
        hud.floater(txt, me.x + Math.cos(me.angle + 1.2) * 40, me.y + Math.sin(me.angle + 1.2) * 40, 'is-near'); play('whoosh-up', { rate: 1.4, volume: 0.7 });
        if (this.matchVoice.near < 2) { this.matchVoice.near++; this.sayCapped('near', `snake.near.${1 + (me.stats.nearMiss % 3)}`); }
        break;
      }
      case 'spawn': {
        const s = w.byId.get(e.id)!;
        if (v.onScreen(s.x, s.y, 100)) v.fx.shockwave(s.x, s.y, [255, 255, 255], s.r, s.r * 5, 0.4);
        break;
      }
      case 'kill': {
        const victim = w.byId.get(e.victim)!, killer = e.killer >= 0 ? w.byId.get(e.killer) ?? null : null;
        if (v.onScreen(victim.x, victim.y, 200)) { v.ghost(victim); const c = v.colorOf(victim); v.fx.burst(victim.x, victim.y, c as [number, number, number], 14, 240, 10, 'spark', 0.6); }
        const top = m.ranking().slice(0, 3).map((x) => x.s);
        if (killer === me || victim === me || top.includes(victim) || (killer && top.includes(killer))) hud.feedLine(killer, e.tag, victim);
        if (killer === me && victim !== me) this.onPlayerKill(e.tag, victim);
        break;
      }
    }
  }

  private onPlayerKill(tag: KillTag, victim: import('./sim/core').Snake) {
    const v = this.view!, hud = this.hud!, me = this.match!.me;
    SND.kill(); v.fx.shockwave(victim.x, victim.y, [255, 210, 63], victim.r, victim.r * 6, 0.45); v.happyUntil = v.time + 0.6;
    const multi = me.stats.multi;
    if (multi >= 2) { const k = Math.min(5, multi); hud.bannerShow(MULTI_TXT[k], 'is-gold'); void this.say(`snake.ann.${MULTI[k]}`, { interrupt: true }); }
    else if (tag === 'cut') { hud.bannerShow('截住了！', 'is-gold'); void this.say('snake.ann.cut', { interrupt: true }); }
    else if (tag === 'encircle') { hud.bannerShow('围住了！', 'is-gold'); void this.say('snake.ann.encircle', { interrupt: true }); }
    else void this.say('snake.ann.kill');
    if (me.stats.lifeKills === 3) { hud.bannerShow('一条命击败三条！', 'is-gold'); void this.say('snake.ann.streak3'); }
    const vk = me.stats.killTags[me.stats.killTags.length - 1]?.victimLifeKills ?? 0;
    if (vk >= 3) void this.say('snake.ann.shutdown');
  }

  private onDied(tag: KillTag, killer: import('./sim/core').Snake | null) {
    const v = this.view!, hud = this.hud!, me = this.match!.me;
    SND.out(); v.ghost(me); v.focus = null; v.fx.kick(4, 0.12);
    hud.setDying(true);
    this.router?.reset();
    this.shell?.session?.mark('death', { tag, killer: killer?.persona ?? 'none', mass: Math.round(me.mass) });
  }

  private showDeathCard() {
    const m = this.match!, d = m.lastDeath; if (!d || this.card) return;
    if (m.demo || (m.run && !m.run.m.playerRespawn)) return;   // out-is-failure levels go straight to S9
    const killerName = d.killer?.name ?? '它';
    const line = (lineText(`snake.death.${d.tag}`) || '撞到了{name}的身体。').replace('{name}', killerName);
    const kc = d.killer ? this.view!.colorOf(d.killer) : hex2rgb('#8d97ad');
    const sayDeath = () => this.say(`snake.death.${d.tag}`, { interrupt: true, vars: { name: killerName } });
    void sayDeath().then(() => {
      const tips = { body: 2, cut: 2, headon: 1, encircle: 1 } as Record<string, number>;
      if (this.save.tipAllowed(d.tag)) void this.say(`snake.tip.${d.tag}.${1 + (this.save.data.tipDay.byCause[d.tag]! - 1) % (tips[d.tag] ?? 1)}`);
    });
    const endless = m.mode === 'endless';
    const vr = this.save.data.venues[m.venue];
    const tipId = `snake.tip.${d.tag}.1`;
    this.card = deathCard(this.root, {
      tipText: lineText(tipId) || undefined,
      tag: d.tag, killer: d.killer, line, killerColor: kc, mode: m.mode === 'mission' ? 'timed' : m.mode, respawnIn: Math.max(0.5, m.respawnAt - m.world.t),
      stats: endless ? { len: Math.floor(m.me.mass), peak: Math.floor(m.me.stats.peak), record: m.me.stats.peak > vr.endless.bestPeak && vr.endless.runs > 0 } : undefined,
      onOk: () => { this.card?.remove(); this.card = null; },
      onAgain: () => { this.card?.remove(); this.card = null; if (m.run) this.retryMission(m.run.m.id); else void this.startMatch(m.mode, m.venue); },
      onLobby: () => { this.card?.remove(); this.card = null; this.showLobby(); },
      onReplay: () => void sayDeath(),
    });
  }

  showPause() {
    const m = this.match; if (!m || m.state === 'over' || this.pausePanel) return;
    m.pause(); this.router?.reset();
    const close = () => { this.pausePanel?.remove(); this.pausePanel = null; };
    this.pausePanel = pausePanel(this.root, {
      endless: m.mode === 'endless', mission: !!m.run,
      onResume: () => { close(); m.resume(true); },
      onRestart: () => { close(); this.save.leaveMatch(m.counters()); if (m.run) this.retryMission(m.run.m.id); else void this.startMatch(m.mode, m.venue); },
      onSettings: () => settingsPanel(this.root, this.save, () => { if (this.hud) this.hud.showNames = this.save.data.settings.showNames; }),
      onLobby: () => { close(); this.save.leaveMatch(m.counters()); if (m.run) this.showMap(m.run.m.ch); else this.showLobby(); },
      onBank: () => { close(); void this.say('snake.endless.bank'); m.bank(); },
    });
  }

  /** background: pause + commit the counter increment (spec §3.18) */
  onBackground() { const m = this.match; if (!m || m.state === 'over') return; this.save.commitProgress(m.counters()); this.showPause(); }
  onLeave() { const m = this.match; if (m && m.state !== 'over') this.save.leaveMatch(m.counters()); this.save.save(); }

  private async finishMatch() {
    const m = this.match!; const r = m.result();
    this.pad.stop();
    this.root.classList.remove('sb-freeze');
    const res = this.save.endMatch(r);
    this.shell?.session?.mark('match-end', { mode: r.mode, venue: r.venue, rank: r.rank, peak: r.peak, kills: r.kills });
    await new Promise((ok) => setTimeout(ok, r.mode === 'endless' && !r.banked ? 900 : 300));
    if (this.match !== m) return;
    this.card?.remove(); this.card = null;
    const trophies = res.trophies.map((id) => TROPHIES[r.venue].find((t) => `trophy:${r.venue}.${t.id}` === id)!).filter(Boolean);
    let title: string; let line: string; let vars: Record<string, number> | undefined;
    if (r.mode === 'timed' && r.rank <= 3) { title = r.rank === 1 ? '冠军！' : `第${r.rank === 2 ? '二' : '三'}名！`; line = `snake.podium.${r.rank}`; play(r.rank === 1 ? 'level-complete' : 'jingle-win'); }
    else if (res.newRecord) { title = '比纪录还长！'; line = 'snake.podium.best'; play('jingle-win'); }
    else if (r.peak >= 60) { title = `这局长到了 ${r.peak}！`; line = 'snake.podium.grow'; vars = { n: r.peak }; play('star-2'); }
    else if (r.kills > 0) { title = `这局击败了 ${r.kills} 条！`; line = 'snake.podium.kills'; vars = { n: r.kills }; play('star-2'); }
    else { title = '下局再来！'; line = 'snake.podium.other'; play('star-1'); }
    if (r.mode === 'endless' && r.banked) title = '平安返航！';
    void this.say(line, { interrupt: true, vars });
    if (trophies.length) setTimeout(() => play('unlock'), 900);
    podium(this.root, {
      r, meId: m.me.id, meName: m.me.name, skin: this.save.data.equipped.skin, colorOf: (s) => (s.isPlayer ? hex2rgb(skinById(this.save.data.equipped.skin).base) : aiBodyColor(s.color ?? '灰', s.persona)),
      title, newRecord: res.newRecord, trophies, unlocked: res.unlocked.map((u) => VENUES[u].name),
      onAgain: () => { this.root.querySelector('.sb-podium')?.remove(); void this.startMatch(r.mode, r.venue); },
      onLobby: () => { this.root.querySelector('.sb-podium')?.remove(); this.showLobby(); },
    });
    // unlock cards pop one by one after the podium has risen (spec §2.5 S6)
    setTimeout(() => { if (this.root.querySelector('.sb-podium')) this.drainCards(); }, 1400);
  }

  /** one WebGL canvas for the whole session (see WorldView) */
  private glCanvas: HTMLCanvasElement | null = null; private glR: Renderer | null = null;
  teardownMatch() {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.router?.dispose(); this.router = null;
    this.hud?.dispose(); this.hud = null;
    if (this.view) { this.view.R.onLost = null; this.view.R.onRestored = null; }
    this.canvas?.remove(); this.canvas = null;
    this.view = null; this.match = null;
    this.card?.remove(); this.card = null; this.pausePanel?.remove(); this.pausePanel = null;
    this.root.querySelectorAll('.sb-scrim').forEach((n) => n.remove());
    this.pad.stop(); this.voice.stop(); this.voice.inMatch = false;
    this.root.classList.remove('sb-freeze');
  }

  // ================================================================ stage 2: 挑战关 / 收藏 / 纪录
  private menu: { dispose(): void } | null = null;
  private missionVoice = { headon: false, windup: false };
  private hintState = { idle: 0, noProg: 0, lastProg: '', h0: 0, pointShown: false };
  private cardBusy = false;

  private closeMenus() { this.sub.el.hidden = true; this.menu?.dispose(); this.menu = null; this.root.querySelectorAll('.sb-brief, .sb-story, .sb-unlock, .sb-cbig, .sb-demo').forEach((n) => n.remove()); }
  private leaveLobby() { this.lobby?.dispose(); this.lobby = null; this.closeMenus(); }

  showMap(ch?: number) {
    menuMusic(true);
    this.teardownMatch(); this.leaveLobby();
    document.body.classList.remove('sb-playing');
    document.getElementById('sb-back')?.setAttribute('hidden', '');
    const cur = MISSION_BY_ID[this.save.currentMission()];
    const c0 = ch ?? cur.ch;
    const map = missionMap(this.root, this.save, c0, {
      onPick: (id) => this.openMission(id),
      onBack: () => this.showLobby(),
      onChapter: (c) => this.storyOnce(c),
    });
    this.menu = map;
    this.storyOnce(c0);
    setHubProgress('snake-battle', { label: `挑战关 第${c0}章` });
  }
  /** first entry into a chapter: story card read by the narrator (spec §2.5 S7) */
  private storyOnce(ch: number, then?: () => void) {
    const key = `story:c${ch}`;
    if (this.save.seen(key)) { then?.(); return; }
    this.save.markSeen(key);
    void this.say(`snake.story.c${ch}`, { interrupt: true });
    storyCard(this.root, ch, () => then?.());
  }

  /** hint level for the next attempt (spec §5.1): misses 1/2/3 → H1/H2/H3 */
  private hintLevel(id: string): 0 | 1 | 2 | 3 { const r = this.save.data.missions[id]; return (r && r.clears === 0 ? Math.min(3, r.failStreak) : 0) as 0 | 1 | 2 | 3; }

  /** S8 only the first time, or when this retry just unlocked a new hint level (spec §2.1) */
  openMission(id: string) {
    const m = MISSION_BY_ID[id]; const rec = this.save.data.missions[id];
    const first = !rec || rec.attempts === 0;
    const hl = this.hintLevel(id);
    const newHint = !first && hl > (rec?.hintMax ?? 0);
    if (!first && !newHint) { void this.startMatch('mission', this.venue, { mission: id }); return; }
    if (newHint) { this.save.mission(id).hintMax = hl; this.save.save(); this.shell?.session?.mark('hint', { id, level: hl }); }
    const autoWatch = first && !!m.newElement && m.ch > 1;
    const card = briefCard(this.root, {
      m, hint: first ? (autoWatch ? 2 : 0) : hl, firstTime: first,
      onStart: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id }); },
      onWatch: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id, demo: true, clip: true }); this.afterDemo = () => this.openBriefAgain(id); },
      onDemo: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id, demo: true }); this.afterDemo = () => this.startTwin(id); },
      onBack: () => card.remove(),
      onReplay: () => void this.say(hl >= 1 && !first ? m.lines.h1 : m.lines.brief, { interrupt: true }),
    });
    void this.say(hl >= 1 && !first ? m.lines.h1 : m.lines.brief, { interrupt: true }).then(() => { if (!first && hl >= 2) void this.say(hl >= 3 ? 'snake.hint.offer3' : 'snake.hint.offer2'); });
  }
  private openBriefAgain(id: string) { this.showMap(MISSION_BY_ID[id].ch); this.openMissionBrief(id); }
  private demoKey: { t: number | null; done: boolean; end: number | null } = { t: null, done: false, end: null };
  /** the demo's key moment plays at 0.5× for 1.5 s; the H2 clip ends 2 s after it (spec §5.1) */
  private demoTick(m: Match) {
    const k = this.demoKey, t = m.world.t;
    if (k.t !== null && !k.done && t >= k.t - 0.4) { k.done = true; m.timeScale = 0.5; this.hud?.bannerShow('看这里！', 'is-gold'); setTimeout(() => { if (this.match === m && m.state === 'playing') m.timeScale = 1; }, 1500); }
    if (k.end !== null && t >= k.end) { k.end = null; (m as Match & { onDemoEnd?: () => void }).onDemoEnd?.(); }
  }
  private openMissionBrief(id: string) {
    const m = MISSION_BY_ID[id]; const hl = this.hintLevel(id);
    const card = briefCard(this.root, { m, hint: hl, firstTime: hl === 0, onStart: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id }); }, onDemo: () => { card.remove(); void this.startMatch('mission', this.venue, { mission: id, demo: true }); this.afterDemo = () => this.startTwin(id); }, onBack: () => card.remove(), onReplay: () => void this.say(m.lines.brief, { interrupt: true }) });
  }
  /** H3 twin: same level, new seed, knobs; each further twin miss loosens one more step (spec §5.1) */
  private startTwin(id: string) {
    const lvl = this.save.data.twinLevel?.[id] ?? 1;
    const tm = twinOf(MISSION_BY_ID[id]);
    const line = tm.ai.some((a) => a.crown) ? 'snake.hint.twin.king' : tm.objective.type === 'race' ? (MISSION_BY_ID[id].objective.killsGE ? 'snake.hint.twin.racekill' : 'snake.hint.twin.race') : tm.objective.type === 'survive' ? 'snake.hint.twin.shield' : tm.playerRespawn === 'keep' && !MISSION_BY_ID[id].playerRespawn ? 'snake.hint.twin.respawn' : tm.ai.length ? 'snake.hint.twin.ai' : tm.objective.type === 'rings' ? 'snake.hint.twin.rings' : 'snake.hint.twin.count';
    void this.say(line, { interrupt: true });
    void this.startMatch('mission', this.venue, { mission: id, twin: lvl });
  }
  private afterDemo: (() => void) | null = null;
  retryMission(id: string) { this.openMission(id); }

  /** demo overlay: the 领航员 plays (bot + hook, deterministic seed); a tap ends it (spec §5.1 H3) */
  private demoOverlay(m: Match) {
    const ov = h('div', { class: 'sb-demo' }, h('div', { class: 'sb-demo__tag' }, '领航员示范'), h('div', { class: 'sb-demo__tap' }, '点屏幕，换你来'));
    this.root.append(ov);
    const end = () => { ov.remove(); const f = this.afterDemo; this.afterDemo = null; this.teardownMatch(); f?.(); };
    setTimeout(() => ov.addEventListener('pointerdown', end), 600);
    (m as Match & { onDemoEnd?: () => void }).onDemoEnd = end;
    void this.say('snake.hint.offer3');
  }
  /** first run c1m1: the ghost hand loops toward the first ring until his first touch (spec §2.6) */
  private ghostHand(m: Match) {
    const g = h('div', { class: 'sb-ghost' }); g.innerHTML = '<svg viewBox="0 0 64 64"><path d="M26 30V12a5 5 0 0 1 10 0v16l12 3c4 1 6 4 5 8l-3 13c-1 4-4 6-8 6H31c-3 0-5-1-7-4l-9-12c-2-3 0-6 3-6 2 0 4 1 5 3z" fill="#fff" stroke="#2b3a8a" stroke-width="3" stroke-linejoin="round"/></svg>';
    this.root.append(g);
    const p = m.run!.m.objective.points?.[0];
    if (p) { const v = this.view!; const place = () => { if (!g.isConnected) return; const [sx, sy] = v.worldToScreen(p[0] + 40, p[1]); g.style.left = `${sx}px`; g.style.top = `${sy}px`; requestAnimationFrame(place); }; requestAnimationFrame(place); }
  }
  private missionIntroVoice(m: Match) {
    const ms = m.run!.m;
    if (ms.id === 'c1m1' && !this.save.data.firstRunDone) { void this.say('snake.intro.1', { interrupt: true }).then(() => this.say('snake.intro.2')); return; }
    if (this.hintLevel(ms.id) >= 1) { this.hud!.pointUntil = 3; this.hintState.pointShown = true; }
    if (ms.ai.some((a) => a.king)) void this.say(ms.id === 'c5m7' ? 'snake.king.appear' : 'snake.king.sleep');
  }
  /** H0 (spec §5.1): 6 s without touching, or 20 s without progress → ghost hand + pointing arrow (≤2 per level) */
  private hintTick(m: Match, dt: number) {
    const hs = this.hintState, run = m.run!, r = this.router!;
    if (m.state !== 'playing') return;
    hs.idle = r.target === null ? hs.idle + dt : 0;
    const p = run.progress(); const key = `${p.cur}`;
    if (key !== hs.lastProg) { hs.lastProg = key; hs.noProg = 0; } else hs.noProg += dt;
    if (hs.h0 < 2 && (hs.idle >= 6 || hs.noProg >= 20)) { hs.h0++; hs.idle = 0; hs.noProg = 0; this.hud!.pointUntil = m.world.t + 3; }
  }
  private onMissionNote(n: { kind: string; id?: number; n?: number }) {
    const m = this.match!, v = this.view!, hud = this.hud!, me = m.me, run = m.run!;
    switch (n.kind) {
      case 'ring': { const p = run.m.objective.points![(n.n ?? 1) - 1]; SND.ring((n.n ?? 1) - 1); play('chime', { volume: 0.6 }); if (p) { v.fx.burst(p[0], p[1], [255, 214, 90], 26, 300, 9, 'spark', 0.7); v.fx.shockwave(p[0], p[1], [255, 240, 170], 30, run.m.objective.radius! * 1.4, 0.45); } if (run.m.id === 'c1m1' && n.n === 1 && !this.save.data.firstRunDone) void this.say('snake.intro.3'); break; }
      case 'marker': SND.core(); hud.bannerShow('圈住了！', 'is-gold'); break;
      case 'headonTarget': if (!this.missionVoice.headon) { this.missionVoice.headon = true; void this.say('snake.m.headon', { interrupt: true }); } break;
      case 'phase2': void this.say('snake.king.guards', { interrupt: true }); break;
      case 'phase3': void this.say('snake.king.angry', { interrupt: true }); break;
      case 'bigSwimIn': { const s = m.world.byId.get(n.id!); if (s) hud.floater('大蛇来了！', me.x, me.y - 60, 'is-gold'); break; }
    }
  }

  private async finishMission() {
    const m = this.match!; const res = m.result(); const mr = res.mission!; const ms = m.run!.m;
    this.pad.stop(); this.root.classList.remove('sb-freeze');
    if (m.demo) { const f = (m as Match & { onDemoEnd?: () => void }).onDemoEnd; await new Promise((ok) => setTimeout(ok, 900)); if (this.match === m) f?.(); return; }
    const twin = !!ms.isTwin;
    const out = this.save.endMission(ms.id, { ok: mr.ok, stars: mr.stars, t: mr.t, why: mr.why }, res.counters, { twin });
    this.shell?.session?.mark('mission-end', { id: ms.id, ok: mr.ok, stars: mr.stars, t: Math.round(mr.t), why: mr.why ?? '', twin, hint: this.save.data.missions[ms.id]?.hintMax ?? 0 });
    await new Promise((ok) => setTimeout(ok, mr.ok ? 700 : 400));
    if (this.match !== m) return;
    this.card?.remove(); this.card = null;
    const i = MISSIONS.findIndex((x) => x.id === ms.id); const next = MISSIONS[i + 1];
    const praise = `snake.praise.c${ms.ch}.${1 + (this.save.data.missions[ms.id].clears % 2)}`;
    const retry = mr.why === 'cap' ? (ms.ai.some((a) => a.crown) ? 'snake.retry.cap.king' : ms.objective.type === 'kill' ? 'snake.retry.cap.kill' : 'snake.retry.cap.other') : `snake.retry.${1 + (this.save.data.missions[ms.id].failStreak % 4)}`;
    if (mr.ok) { play(mr.stars >= 3 ? 'level-complete' : 'jingle-win'); void this.say(praise, { interrupt: true }).then(() => this.say(`snake.m.${ms.id}.brief`).catch(() => 'skipped')); }
    else { play('star-1'); void this.say(retry, { interrupt: true }); }
    if (mr.ok && ms.id === 'c1m3' && !this.save.data.firstRunDone) { this.save.data.firstRunDone = true; this.save.save(); }
    const canSkip = !mr.ok && this.save.canSkip(ms.id);
    if (canSkip) void this.say('snake.hint.skip');
    const hasNext = !!next && this.save.missionOpen(next.id);
    const act = await missionResult({ m: ms, ok: mr.ok, stars: mr.stars, star2: mr.star2, star3: mr.star3, praise, retry, canSkip, hasNext, twin });
    if (this.match !== m) return;
    this.teardownMatch();
    const go = () => {
      if (act === 'next' && next) { if (next.ch !== ms.ch) this.showMap(next.ch); if (!this.save.data.firstRunDone || ms.id === 'c1m1' || ms.id === 'c1m2') { void this.startMatch('mission', this.venue, { mission: next.id }); return; } this.openMission(next.id); }
      else if (act === 'again') { if (twin && !mr.ok) this.startTwin(ms.id); else this.retryMission(ms.id); }
      else if (act === 'skip' && next) { this.save.skip(ms.id); this.showMap(next.ch); this.openMission(next.id); }
      else if (!this.save.data.firstRunDone) { void this.startMatch('mission', this.venue, { mission: ms.id }); }
      else this.showMap(ms.ch);
    };
    const end = mr.ok && out.firstClear && ms.id === 'c5m7';
    // first run: c1m3 cleared → the lobby appears for the first time (spec §2.6)
    if (mr.ok && ms.id === 'c1m3' && out.firstClear && act !== 'again') { this.showLobby(); void this.say('snake.intro.done', { interrupt: true }); return; }
    if (end) { void this.say('snake.story.end', { interrupt: true }); storyCard(this.root, 'end', () => this.drainCards(go)); return; }
    this.drainCards(go);
  }

  /** unlock cards one by one (name + fact read aloud), then `then` (spec §5.4) */
  drainCards(then?: () => void) {
    const q = this.save.data.cardQueue;
    if (this.cardBusy) return;
    const key = q.shift();
    if (!key) { this.save.save(); then?.(); return; }
    this.save.save();
    if (key.startsWith('trophy:')) { this.drainCards(then); return; }   // trophies have their own podium card
    this.cardBusy = true; play('unlock');
    const kind = key.startsWith('venue:') ? 'venue' : key.split(':')[0];
    void this.say(`snake.unlock.${kind === 'crown' ? 'skin' : kind}`, { interrupt: true });
    unlockCard(this.root, key, () => { this.cardBusy = false; this.drainCards(then); });
  }

  showCollection() {
    menuMusic(true);
    this.leaveLobby(); document.getElementById('sb-back')?.setAttribute('hidden', '');
    this.menu = collectionScreen(this.root, this.save, {
      onBack: () => this.showLobby(),
      onEquip: (key) => { const [k, id] = key.split(':'); if (k === 'skin') this.save.data.equipped.skin = id; if (k === 'trail') this.save.data.equipped.trail = id; this.save.save(); play('ui-confirm'); },
      onFact: (key) => { const id = key.split(':')[1] ?? key; void this.say(key === 'crown' ? 'snake.fact.crown' : key.startsWith('trail:') ? `snake.fact.trail.${id}` : `snake.fact.${id}`, { interrupt: true }); },
      onLocked: () => play('ui-locked', { volume: 0.6 }),
    });
  }
  showRecords() {
    menuMusic(true);
    this.leaveLobby(); document.getElementById('sb-back')?.setAttribute('hidden', '');
    this.menu = recordsScreen(this.root, this.save, () => this.showLobby());
  }
  /** first run (spec §2.6): straight into c1m1, no lobby, no S8, no 3-2-1; the sim waits for his first touch */
  startFirstRun() { void this.startMatch('mission', 'moon', { mission: 'c1m1', countdown: false, waitTouch: true }); }
}
