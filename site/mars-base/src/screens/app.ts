/** App context + the screens around the mission runner: map (S1), chapter (S12), wrap-up (S4), onboarding (S0a). Routes are not browser history (spec §2.1, §8.4). */
import { showModal, showResult, nodeMap, mountSkipButton, shouldAutoSkip, ghostDrag, icon, type MapNode } from '@kit/ui';
import { sound } from '@kit/ui';
import { mount as mountCompanion, type Companion } from '@kit/companion';
import type { Narrator } from '@kit/narration';
import { currentLayout, type LayoutInfo, type Shell } from '@kit/shell';
import { getSettings } from '@kit/settings';
import { setHubProgress } from '@kit/progress';
import { Economy } from '@kit/economy';
import { mountNumberLine } from '@engines/manip/numberline';
import type { MarsSaveV5 } from '../save/schema';
import type { SaveHandle } from '../save/store';
import { STAGE_READY } from '../stages';
import { CARDS, MAIN_ORDER, NODE_BY_ID, PROBES, REMEDIAL_ORDER, zoneOfNode } from '../app/content';
import { nextNodeFor, openZones, recommend, isZoneBuilt } from '../app/scheduler';
import { acceptDirect, declineDirect } from '../app/adaptive';
import { beginVisit } from '../app/session';
import type { EndSummary } from '../app/mission';
import type { ZoneId } from '../app/types';
import { vpOf, type Viewport } from '../app/layout';
import { SITE_NAME, buildingSvg, landerSvg, plotSvg, sceneSvg, type SiteId } from '../art/buildings';
import { lineTable, lineText } from '../voice/lines';
import { speakLine } from '../voice/compose';
import { playMission } from './mission';
import cardsJson from '../../../../content/mars-base/cards.json';
import { updateBase, type SiteKey } from '../app/base';
import { canCheck } from '../app/daily';
import { readStarActivity, StarPetActivity } from '../app/starPetActivity';
import type { MachineState } from '../app/itemMachine';
import type { Item } from '../app/types';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, attrs?: Record<string, string> | string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.className = cls;
  if (typeof attrs === 'string') e.textContent = attrs; else if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text; return e;
}
/** the map-only reply to a tap on a site that is not open yet (shown as a bubble; the voice line stays mars.map.locked) */
const WAIT_TEXT: Partial<Record<SiteId, string>> = { balance: '称重台：工程师还在画图纸，很快开工。', puzzle: '谜题舱：还在施工，下次再来看看。', race: '火箭赛道：跑道还没铺好，等一等。' };
const SITES: { id: SiteId; zone: ZoneId | null }[] = [
  { id: 'orbit', zone: 'orbit' }, { id: 'cert', zone: 'cert' }, { id: 'vault', zone: 'vault' }, { id: 'factory', zone: 'factory' },
  { id: 'balance', zone: 'balance' }, { id: 'puzzle', zone: 'puzzle' }, { id: 'race', zone: null }, { id: 'archive', zone: null },
  { id: 'pets', zone: null },
];

/**
 * The box a chapter map needs: kit `nodeMap` spreads n nodes evenly along a sine path inside the box it is given. On a 320–390 px phone 17+ nodes of 72 px pile up,
 * so the box grows along its long side (the scroller scrolls) until no two nodes come closer than 1.3 node sizes (same path formula as the kit; V10 screens.spec).
 */
export function chapterBox(w: number, h: number, n: number, size: number): { w: number; h: number } {
  if (n < 2 || w < 10 || h < 10) return { w, h };
  const pad = Math.max(70, Math.round((size * 1.26) / 2) + 22); const need = size * 1.3; const N = 240;
  const minDist = (W: number, H: number): number => {
    const land = W >= H, waves = land ? 1.25 : 1.5; const raw: [number, number][] = []; const cum = [0];
    for (let i = 0; i <= N; i++) { const t = i / N, sn = Math.sin(t * Math.PI * 2 * waves - Math.PI / 2); raw.push(land ? [pad + (W - 2 * pad) * t, H / 2 + (H / 2 - pad) * 0.92 * sn] : [W / 2 + (W / 2 - pad) * 0.92 * sn, H - pad - (H - 2 * pad) * t]); if (i) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1])); }
    const total = cum[N]; const pts = Array.from({ length: n }, (_, i) => { const len = (total * i) / (n - 1); let k = 1; while (k < N && cum[k] < len) k++; const f = (len - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]); return [raw[k - 1][0] + (raw[k][0] - raw[k - 1][0]) * f, raw[k - 1][1] + (raw[k][1] - raw[k - 1][1]) * f]; });
    let m = Infinity; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])); return m;
  };
  let W = w, H = h; const land = w >= h;
  for (let k = 0; k < 60 && minDist(W, H) < need; k++) { if (land) W = Math.ceil(W * 1.06); else H = Math.ceil(H * 1.06); }
  return { w: W, h: H };
}

export class App {
  streak = 0; metrics: { refresh(): boolean } | null = null; private layoutCbs = new Set<() => void>(); private bot: Companion | null = null;
  economy = new Economy(); unsaved = false;
  readonly activity = new StarPetActivity();
  private missionBusy = false;
  private petsOpening = false;
  private extraOpening = false;
  constructor(public save: MarsSaveV5, public handle: SaveHandle, public shell: Shell, public narrator: Narrator, private root: HTMLElement) {
    shell.on('layout', () => this.layoutCbs.forEach((f) => f()));
    document.addEventListener('visibilitychange', () => { this.activity.setVisible(!document.hidden); if (document.hidden) this.saveNow(); });
  }
  layoutInfo(): LayoutInfo { return currentLayout(); }
  vp(): Viewport { const l = currentLayout(); return vpOf(l.width, l.height); }
  /** returns the disposer: a screen that is gone must not stay referenced by the layout callbacks (soak gate) */
  onLayout(cb: () => void): () => void { this.layoutCbs.add(cb); return () => { this.layoutCbs.delete(cb); }; }
  saveNow(): void {
    if (!this.handle.save(this.save)) { this.unsaved = true; return; }
    const done = this.economy.flush(this.save.eco.pending);
    if (done.length) {
      this.save.eco.pending = this.save.eco.pending.filter((p) => !done.includes(p.id));
      if (!this.handle.save(this.save)) { this.unsaved = true; return; }
    }
    this.unsaved = this.economy.unsaved;
    this.syncHub();
  }
  private bots = new Set<Companion>();
  /** The kit robot blinks on a self-rescheduling timer until destroy(): every screen that is replaced must destroy its robot, or each map / mission leaves a blinking, retained copy behind (soak gate). */
  private track(bot: Companion): Companion { this.bots.add(bot); return bot; }
  screen(node: HTMLElement, theme: 'night' | 'day' = 'night'): void { for (const b of this.bots) b.destroy(); this.bots.clear(); if (theme === 'night') document.body.dataset.xgTheme = 'night'; else delete document.body.dataset.xgTheme; this.root.replaceChildren(node); this.activity.setMode(node.classList.contains('mb-pets') ? 'pet' : node.classList.contains('mb-mission') ? 'mission' : 'idle'); }
  sfx(name: string): void { sound(name as never); }
  mountBot(host: HTMLElement, size: number): Companion { return this.track(mountCompanion(host, { size, variant: 'head', sfx: undefined })); }
  /** Show a line on the 通讯条 (always) and speak it (clip when the manifest has it, else the speech fallback). */
  say(bot: Companion | null, ui: { commText: HTMLElement } | null, id: string, vars?: Record<string, string | number>): void {
    const text = lineText(id, vars); if (!text) return;
    if (ui) ui.commText.textContent = text;
    bot?.react?.('hop'); speakLine(this.narrator, lineTable(), id, vars, { interrupt: true });   // own clip, else fragment + number clips, else one speech-fallback utterance (voice/compose.ts)
  }
  async sayAndWait(bot: Companion | null, ui: { commText: HTMLElement }, id: string): Promise<void> {
    const text = lineText(id); if (!text) return;
    ui.commText.textContent = text;
    bot?.react?.('hop');
    if (!getSettings().narration) return;
    await this.narrator.ready();
    if (!ui.commText.isConnected) return;
    await this.narrator.say(this.narrator.has(id) ? id : text, { interrupt: true });
  }
  praiseFor(state: MachineState, item: Item): string {
    if (state.firstTry && this.streak === 3) return 'mars.ok.streak3'; if (state.firstTry && this.streak === 6) return 'mars.ok.streak6';
    if (state.firstTry) return item.slot === 'main' && this.save.recent.length < 1 ? 'mars.ok.first' : 'mars.ok.steady';
    return 'mars.ok.fix';
  }
  syncHub(): void {
    const scored = Object.values(MAIN_ORDER).flat().filter((id) => NODE_BY_ID[id].kind !== 'calib' && NODE_BY_ID[id].kind !== 'breather');
    const done = scored.filter((id) => (this.save.nodes[id]?.st ?? 'open') !== 'open').length;
    setHubProgress('mars-base', { label: `祝融基地 · ${this.save.baseLevel} 级`, value: scored.length ? done / scored.length : 0 });
  }

  // ---- flow -----------------------------------------------------------------------------------------------------------------
  async start(): Promise<void> {
    this.activity.begin();
    beginVisit(this.save, Date.now()); updateBase(this.save); this.saveNow();
    if (!this.save.onboarded) await this.onboard();
    this.goMap();
  }
  goMap(): void { this.showMap(); }
  async openPets(): Promise<void> {
    if (this.petsOpening) return;
    this.petsOpening = true;
    const from = this.root.firstElementChild;
    try {
      const { showPets } = await import('./pets');
      if (this.root.firstElementChild === from) showPets(this);
    } catch {
      if (this.root.firstElementChild === from) {
        const toast = this.root.querySelector<HTMLElement>('.mb-map-toast');
        if (toast) { toast.textContent = '宠物舱暂时没打开，请再试一次。'; toast.classList.add('is-on'); }
      }
    } finally {
      this.petsOpening = false;
    }
  }
  private async openExtra(view: 'parent' | 'badges' | 'archive'): Promise<void> {
    if (this.extraOpening) return;
    this.extraOpening = true;
    const from = this.root.firstElementChild;
    try {
      const extra = await import('./extra');
      if (this.root.firstElementChild !== from) return;
      if (view === 'parent') void extra.showParent(this);
      else if (view === 'badges') extra.showBadges(this);
      else extra.showArchive(this);
    } finally {
      this.extraOpening = false;
    }
  }

  /** A mission the child left (reload, killed home-screen app, 回地图) and can pick up again: 开始任务 resumes it before anything else is recommended. */
  pendingMission(): { kind: 'node' | 'probe' | 'wall' | 'challenge' | 'check'; node: string } | null {
    const m = this.save.mission; if (!m?.plan) return null;
    if (m.kind === 'node' && !NODE_BY_ID[m.node]) return null;
    return { kind: m.kind, node: m.node };
  }
  async resumePending(): Promise<void> {
    const p = this.pendingMission(); if (!p) return this.goMap();
    if (p.kind === 'wall') return this.runWall();
    if (p.kind === 'check') return this.runCheck();
    if (p.kind === 'challenge') return this.runChallenge();
    if (p.kind === 'probe') { const zone = (this.save.mission?.plan?.probeZone ?? p.node.replace(/^probe\./, '')) as ZoneId; const n = nextNodeFor(this.save, zone) ?? NODE_BY_ID[MAIN_ORDER[zone][0]]; return this.runNode(n.id); }
    return this.runNode(p.node, true);
  }
  async runNode(nodeId: string, resume = false): Promise<void> {
    if (this.missionBusy) return;
    this.missionBusy = true;
    try {
    if (!resume) this.activity.mission(this.save.nodes[nodeId]?.st === 'done');
    const node = NODE_BY_ID[nodeId]; const zone = zoneOfNode(node); let id = nodeId; let noWarm = false;
    if (!resume && PROBES[zone] && !this.save.probes[zone as 'vault']?.done && node.kind !== 'calib') {
      const s = await playMission(this, { nodeId, probe: true }); if (!s) return this.goMap();
      noWarm = true; id = nextNodeFor(this.save, zone)?.id ?? nodeId;
    }
    const sum = await playMission(this, { nodeId: id, noWarm });
    if (!sum) return;
    const destination = await this.wrap(sum); if (destination === 'pets') this.openPets(); else this.goMap();
    } finally { this.missionBusy = false; }
  }

  /** 挑战订单: nine orders mixed from what has been learned (app/challenge.ts), the same runner / hint ladder, no parts, no coins. */
  async runChallenge(): Promise<void> {
    if (this.missionBusy) return;
    this.missionBusy = true;
    try {
    const sum = await playMission(this, { nodeId: 'challenge', challenge: true });
    if (!sum) return;
    const destination = await this.wrap(sum); if (destination === 'pets') this.openPets(); else this.goMap();
    } finally { this.missionBusy = false; }
  }
  async runCheck(): Promise<void> {
    const pending = this.pendingMission();
    if (this.missionBusy || (pending ? pending.kind !== 'check' : !canCheck(this.save))) return;
    this.missionBusy = true;
    try {
      const sum = await playMission(this, { nodeId: 'check', check: true });
      if (!sum) return;
      const destination = await this.wrap(sum); if (destination === 'pets') this.openPets(); else this.goMap();
    } finally { this.missionBusy = false; }
  }

  /** 徽章墙 "一起验货": every card that is not lit, in one go (4 items per card, one attempt each, no per-item verdict). */
  async runWall(): Promise<void> {
    if (this.missionBusy) return;
    this.missionBusy = true;
    try {
    const cards = CARDS.filter((c) => this.save.cert[c].state !== 'lit'); if (!cards.length) { if (this.save.mission?.kind === 'wall') { this.save.mission = null; this.saveNow(); } return this.goMap(); }
    const sum = await playMission(this, { nodeId: 'cert.wall', wall: cards });
    if (!sum) return;
    const destination = await this.wrap(sum); if (destination === 'pets') this.openPets(); else this.goMap();
    } finally { this.missionBusy = false; }
  }

  private async wrap(sum: EndSummary): Promise<'map' | 'pets'> {
    const { orbitChart, showBuild } = await import('./extra');
    const o = sum.outcome; const lines: string[] = []; const ch = sum.challenge;
    if (sum.check) lines.push('检修完成，货车送达。');
    for (const c of sum.certs ?? []) lines.push(c.outcome.state === 'lit' ? lineText(`mars.cert.lit.${c.card}`) : c.outcome.state === 'half' ? lineText('mars.cert.half.1') : lineText('mars.cert.more'));
    if (sum.cert) lines.push(sum.cert.outcome.state === 'lit' ? lineText(`mars.cert.lit.${sum.cert.card}`) : sum.cert.outcome.state === 'half' ? lineText('mars.cert.half.1') : lineText('mars.cert.more'));
    if (sum.calibration) lines.push(lineText('mars.orbit.calibDone'));
    if (ch) lines.push(lineText('mars.chal.done'));
    // calibration / 一起验货 / 挑战订单 are not star-rated nodes: a star row that stays empty reads as "0 stars = failed" — only real node results show stars
    const rated = !ch && !!sum.node && sum.node.kind !== 'calib' && !sum.calibration && !!o && o.stars > 0;
    const ev = updateBase(this.save, !!sum.node && sum.node.kind !== 'calib' && sum.outcome?.advance !== false); this.saveNow(); this.metrics?.refresh();
    const stats = sum.check ? [{ label: '星币', value: this.unsaved ? '待保存' : '+16' }, { label: '一次就对', value: `${sum.check.firstTry}/${sum.check.n}` }] : ch ? [{ label: '一次就对', value: `${ch.firstTry}/${ch.n}` }] : o && sum.node && sum.node.kind !== 'calib' ? [{ label: '一次就对', value: `${o.firstTry}/${o.n}` }] : [];
    const newCards = (cardsJson.cards as { id: string; title: string; verified: unknown }[]).filter((c) => ev.newCards.includes(c.id) && c.verified);
    if (newCards.length) lines.push(`新知识卡：${newCards.map((c) => c.title).join('、')}`);
    const test = sum.calibration ? this.save.orbit.tests[this.save.orbit.tests.length - 1] : undefined;
    const choice = await showResult({
      ribbon: sum.check ? '设备检修' : ch ? lineText('mars.chal.title') : sum.node ? lineText(`mars.node.${sum.node.id.replace(/^\w+\./, '')}`) : '订单交付', stars: (ch ? ch.stars : rated ? o!.stars : undefined) as 0 | 1 | 2 | 3 | undefined,
      title: sum.check ? this.unsaved ? '货车送达 · 星币待保存' : '货车送达 · +16 星币' : ch ? lineText('mars.chal.done') : lineText('mars.mis.done'), text: lines.filter((l, k) => !(ch && k === 0 && l === lineText('mars.chal.done'))).join(' ') + (this.unsaved ? ' 这台设备暂时没存上进度，请保留页面。' : ''), stats, accentGame: 'mars', actions: sum.check ? [{ id: 'pets', label: '去宠物舱', kind: 'primary' }, { id: 'home', label: '回基地' }] : [{ id: 'home', label: '回基地', kind: 'primary' }],
      onOpen: (modal) => { if (sum.check) this.say(null, null, 'mars.check.done'); if (test) { const fig = h('div', 'mb-result-chart'); fig.innerHTML = orbitChart(test, 200, 200) + `<span>你的轨道：点越靠近亮线，估得越准</span>`; (modal.querySelector('.xg-modal__title') ?? modal.firstElementChild)?.before(fig); } },
    });
    if (o?.directOffer && this.save.directOffer) {
      const pick = await showModal({ title: lineText('mars.mis.direct'), actions: [{ id: 'yes', label: lineText('mars.mis.direct.yes'), primary: true }, { id: 'no', label: lineText('mars.mis.direct.no'), primary: true }] });
      if (pick === 'yes' && sum.node) acceptDirect(this.save, this.save.directOffer.zone, sum.node.id); else declineDirect(this.save);
      this.saveNow();
    }
    await showBuild(this, ev, (sum.zone as SiteKey) || null);
    if (sum.award) {
      const next = await showResult({ ribbon: this.unsaved ? '等待保存' : '星币入账', title: this.unsaved ? '货车送达 · 星币待保存' : '货车送达 · +26 星币', text: this.unsaved ? '这台设备暂时没存上进度，请保留页面。' : '', stats: [{ label: '现在有', value: this.economy.balance() }], accentGame: 'mars', confetti: false, actions: [{ id: 'pets', label: '去宠物舱', kind: 'primary' }, { id: 'home', label: '回基地' }] });
      return next === 'pets' ? 'pets' : 'map';
    }
    return choice === 'pets' ? 'pets' : 'map';
  }

  // ---- map ------------------------------------------------------------------------------------------------------------------
  private mapToast: { el: HTMLElement; t: number } | null = null;
  /** A tap that does not open anything must still answer: a bounce on the site + a text bubble (the voice line alone is a dead tap with the sound off). */
  private siteWait(btn: HTMLElement, text: string, lineId = 'mars.map.locked'): void {
    sound('ui-tap'); btn.classList.remove('is-bounce'); void btn.offsetWidth; btn.classList.add('is-bounce');
    const t = this.mapToast; if (t) { t.el.textContent = text; t.el.classList.add('is-on'); clearTimeout(t.t); t.t = window.setTimeout(() => t.el.classList.remove('is-on'), 3200); }
    this.say(this.bot, null, lineId);
  }
  showMap(): void {
    const root = h('div', 'mb-map'); root.dataset.mapReady = '1';
    const vp = this.vp(); root.dataset.cls = vp.cls;
    root.innerHTML = sceneSvg(vp.w >= vp.h ? 1080 : 810, vp.w >= vp.h ? 810 : 1080);
    const rec = recommend(this.save); const open = new Set(openZones(this.save));
    const title = h('div', 'mb-map-title', `祝融基地 · ${this.save.baseLevel} 级`); root.append(title);
    if (getSettings().showCoins) {
      const folded = readStarActivity().collapsed;
      const coins = h('button', `mb-map-coins${folded ? ' is-folded' : ''}`, { type: 'button', 'aria-label': `进入宠物舱，星币余额 ${this.economy.balance()}` }, folded ? '✦' : `✦ ${this.economy.balance()}`);
      coins.onclick = () => this.openPets(); root.append(coins);
    }
    let hold = 0; title.addEventListener('pointerdown', () => { hold = window.setTimeout(() => void this.openExtra('parent'), 3000); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) title.addEventListener(ev, () => clearTimeout(hold));
    const toast = h('div', 'mb-map-toast'); toast.setAttribute('role', 'status'); this.mapToast = { el: toast, t: 0 };
    if (this.unsaved) root.append(h('p', 'mb-save-warning', { role: 'alert' }, '这台设备暂时没存上进度，请先保留页面。'));
    const sites = h('div', 'mb-sites');
    for (const s of SITES) {
      // 档案馆 and 徽章站 are real buildings; 称重台 / 谜题舱 / 火箭赛道 are scaffolds with a crane (unbuilt in v1)
      const built = s.id === 'archive' || s.id === 'pets' || (s.zone ? isZoneBuilt(s.zone) : false); const ready = s.zone ? open.has(s.zone) : s.id === 'archive' || s.id === 'pets';
      const b = h('button', `mb-site${rec !== null && rec === s.zone ? ' is-rec' : ''}${built ? '' : ' is-plot'}`, { type: 'button', 'data-site': s.id, 'aria-label': built ? SITE_NAME[s.id] : `${SITE_NAME[s.id]}，建设中` });
      b.innerHTML = (built ? buildingSvg(s.id, this.save.buildings[s.id] ?? 1, rec !== null && rec === s.zone) : plotSvg(s.id)) + `<span class="mb-site-name">${SITE_NAME[s.id]}${built ? '' : '<small>建设中</small>'}</span>`;
      b.onclick = () => {
        if (this.pendingMission() && s.id !== 'archive' && s.id !== 'pets') { this.siteWait(b, '先继续未完成的任务。'); return; }
        if (s.id === 'cert') { sound('ui-tap'); void this.openExtra('badges'); return; } if (s.id === 'archive') { sound('ui-tap'); void this.openExtra('archive'); return; }
        if (s.id === 'pets') { sound('ui-tap'); this.openPets(); return; }
        if (!built || !s.zone) { this.siteWait(b, WAIT_TEXT[s.id] ?? '这里还在建设中。'); return; }
        if (!ready) { this.siteWait(b, `${SITE_NAME[s.id]}还没开门，先去别处做一单。`); return; }
        sound('ui-tap'); this.showChapter(s.zone);
      };
      sites.append(b);
    }
    root.append(sites, toast);
    const botHost = h('div', 'mb-map-bot'); root.append(botHost);
    const next = rec ? nextNodeFor(this.save, rec) : null; const pend = this.pendingMission();
    // nothing recommended = every built main-line order is delivered: the button becomes 挑战订单 (never a dead, disabled button)
    const challenge = !next && !pend;
    const actions = h('div', 'mb-map-actions');
    const go = h('button', 'mb-go xg-btn xg-btn--primary xg-btn--lg', { type: 'button' }, challenge ? lineText('mars.chal.title') : '开始任务'); go.dataset.zone = rec ?? '';
    const check = h('button', 'mb-check xg-btn xg-btn--secondary', { type: 'button' }, '设备检修');
    check.disabled = pend ? pend.kind !== 'check' : !canCheck(this.save);
    check.title = pend && pend.kind !== 'check' ? '先继续未完成的任务' : check.disabled ? '做完几单后，检修会开放' : '复习学过的知识点';
    check.onclick = () => void this.runCheck();
    const sub = h('div', 'mb-go-sub', pend ? lineText('mars.mis.resume') : next ? lineText(`mars.node.${next.id.replace(/^\w+\./, '')}`) : lineText('mars.map.allDone'));
    go.onclick = () => { if (pend) void this.resumePending(); else if (next) void this.runNode(next.id); else void this.runChallenge(); };
    actions.append(go, check); root.append(sub, actions); this.screen(root);
    this.bot = this.track(mountCompanion(botHost, { size: vp.cls.startsWith('phone') ? 96 : 140, bubble: 'right' }));
    this.bot.setMood('happy');
    this.say(this.bot, null, this.save.session.missions ? 'mars.map.welcome' : 'mars.map.pick');
  }

  // ---- chapter map ----------------------------------------------------------------------------------------------------------
  showChapter(zone: ZoneId): void {
    const root = h('div', 'mb-chapter'); const vp = this.vp();
    const ids = zone === 'cert' ? CARDS.flatMap((c) => REMEDIAL_ORDER[c]) : MAIN_ORDER[zone];
    const next = nextNodeFor(this.save, zone);
    const nodes: MapNode[] = ids.map((id) => {
      const st = this.save.nodes[id]?.st ?? 'open'; const n = NODE_BY_ID[id];
      return { id, label: lineText(`mars.node.${id.replace(/^\w+\./, '')}`), state: st === 'done' ? 'done' : st === 'skipped' ? 'skipped' : next?.id === id ? 'current' : 'open', stars: this.save.nodes[id]?.stars, boss: n.kind === 'boss' };
    });
    const back = h('button', 'mb-ch-back xg-btn xg-btn--secondary', { type: 'button', 'aria-label': '回地图' }); back.innerHTML = icon('back'); back.onclick = () => this.goMap();
    const title = h('div', 'mb-ch-title', SITE_NAME[(SITES.find((s) => s.zone === zone)?.id ?? 'orbit')]);
    const scroller = h('div', 'mb-ch-scroll'); const box = h('div', 'mb-ch-map'); scroller.append(box); root.append(back, title, scroller); this.screen(root);
    const size = vp.cls.startsWith('phone') ? 72 : 88; const fit = chapterBox(scroller.clientWidth, scroller.clientHeight, nodes.length, size);
    box.style.width = `${fit.w}px`; box.style.height = `${fit.h}px`;   // a long chapter scrolls (along its long side) instead of piling its nodes up
    nodeMap(box, nodes, { nodeSize: size, onPick: (n) => { const node = NODE_BY_ID[n.id]; if (node.items.some((i) => !STAGE_READY(i.fam))) { this.say(null, null, 'mars.map.locked'); return; } void this.runNode(n.id); } });
    (box.querySelector('.xg-node--current') as HTMLElement | null)?.scrollIntoView({ block: 'center', inline: 'center' });
  }

  // ---- onboarding (S0a): plant the flag, use the magnifier; no tray, no calibration (spec §2.5) ----------------------------------
  async onboard(): Promise<void> {
    if (shouldAutoSkip()) { this.save.onboarded = true; this.saveNow(); return; }
    const vp = this.vp();
    const root = h('div', 'mb-onboard'); root.innerHTML = `${sceneSvg(vp.w >= vp.h ? 1080 : 810, vp.w >= vp.h ? 810 : 1080)}<div class="mb-ob-lander">${landerSvg()}</div><div class="mb-ob-order"></div><div class="mb-ob-line"></div><div class="mb-ob-line2"></div><div class="mb-ob-stage"></div><button class="mb-ob-ok xg-btn xg-btn--primary xg-btn--lg" type="button" disabled>${icon('check')}</button>`;
    const mark = h('i', 'mb-ob-mark'); root.append(mark);   // an invisible point on the track: where the hand carries the flag to
    this.screen(root);
    const q = (s: string) => root.querySelector(s) as HTMLElement; const stage = q('.mb-ob-stage'); const ok = q('.mb-ob-ok') as HTMLButtonElement;
    let skipped = false; let touched = false; let idle = 0; let demoable = true;
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const dispose = mountSkipButton(document.body, () => { skipped = true; this.narrator.stop(); });
    const orders = [{ v: 30, tol: 10, line: 'mars.onb.1' }, { v: 62, tol: 10, line: 'mars.onb.2' }, { v: 45, tol: 6, line: 'mars.onb.3' }];
    const hideHand = () => document.querySelector('.xg-ghost-hand')?.classList.remove('is-on');
    const ctl = mountNumberLine(stage, { L: 100, kind: 'place', labels: [0, 50, 100], width: stage.clientWidth || 320, height: stage.clientHeight || 260, onPlace: () => { ok.disabled = false; }, onOp: () => { touched = true; clearTimeout(idle); ctl.stopDemo(); hideHand(); } });
    // the demo: the hand takes the flag from the rack and CARRIES it to the order's value (30) with the magnifier up, rests a moment, puts the rack back; repeats after 10 s of no touch
    const demo = async (): Promise<void> => {
      if (skipped || touched || !demoable || ctl.value() !== null) return;
      const rack = stage.querySelector('.nl-rack .nl-flag') as Element | null; if (!rack) return;
      mark.style.left = `${ctl.flagToClientX(30)}px`; mark.style.top = `${ctl.trackClientY() - 30}px`;
      const hand = ghostDrag(rack, mark).catch(() => undefined); void ctl.demoPlace(30, { delay: 860, ms: 1000 });
      await hand; await sleep(1100);
      if (!skipped && !touched && demoable) { ctl.reset(); idle = window.setTimeout(() => void demo(), 10_000); }
    };
    const resizer = () => ctl.resize(stage.clientWidth, stage.clientHeight); const offLayout = this.onLayout(resizer);
    for (let i = 0; i < orders.length && !skipped; i++) {
      const o = orders[i]; ctl.reset(); ok.disabled = true; q('.mb-ob-order').textContent = `卫星入轨 ${o.v}`; q('.mb-ob-line2').textContent = ''; this.say(null, { commText: q('.mb-ob-line') }, o.line);
      demoable = i === 0; if (i === 0) { clearTimeout(idle); idle = window.setTimeout(() => void demo(), 900); }
      for (let tries = 0; tries < 2 && !skipped; tries++) {
        await new Promise<void>((res) => { ok.onclick = () => res(); const t = window.setInterval(() => { if (skipped) { clearInterval(t); res(); } }, 200); ok.addEventListener('click', () => clearInterval(t), { once: true }); });
        if (skipped) break; const v = ctl.value() ?? -999;
        if (Math.abs(v - o.v) <= o.tol) { sound('correct'); stage.classList.add('is-ok'); q('.mb-ob-line2').textContent = '卫星入轨了！'; await sleep(750); stage.classList.remove('is-ok'); break; }
        ctl.showFeedback({ target: o.v, d: Math.abs(v - o.v), lo: o.v - o.tol, hi: o.v + o.tol }); this.say(null, { commText: q('.mb-ob-line2') }, 'mars.onb.far'); await sleep(1400); ctl.clearFeedback();
      }
      demoable = false; clearTimeout(idle);
    }
    clearTimeout(idle); ctl.stopDemo(); hideHand(); dispose(); offLayout(); ctl.destroy(); this.narrator.stop();
    this.save.onboarded = true; this.saveNow();
    if (!skipped) { const { showFirstLight } = await import('./extra'); await showFirstLight(this); }   // the base lights up, the first part rises, the first knowledge card (祝融号) is earned — then the map
  }
}
