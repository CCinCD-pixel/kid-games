/**
 * S9 机库 (spec §2.4, §5.6): the big 星晶号 with its 9 module slots (v1 opens 4; the other 5 are dashed
 * "下一批航线" outlines) — tap an installed module to repaint it — and four pages: 知识卡 (re-listen),
 * 星图 (5 constellations, lit by the star total), 徽章 (4 puzzles + 老玩家), 工具 (counts + replay the
 * intro card). Every item carries one piece of knowledge or usage (plan §3.0).
 */
import { bindPress, icon, showResult } from '@kit/ui';
import { CONSTELLATIONS, EPISODES } from '../content';
import type { AppCtx } from '../ctx';
import { play as sfx } from '../audio';
import { badgeSvg, BADGES } from '../view/art/badges';
import { cardArt } from '../view/art/cards';
import { FUTURE, MODULE_NAMES, PAINT_NAMES, PAINTS, shipSvg, type ModuleKey } from '../view/art/ship';
import { constellationSvg } from '../view/art/skycard';
import { backdrop } from '../view/backdrop';
import { TOOL_NAMES, toolSvg, type ToolId } from '../view/art/tools';
import { showIntroCard } from './intro-card';
import { installed } from './route';
import { totalStars } from './arrival';

type Tab = 'cards' | 'sky' | 'badges' | 'tools';
const TABS: { id: Tab; label: string; icon: 'book' | 'star' | 'badge' | 'grid' }[] = [
  { id: 'cards', label: '知识卡', icon: 'book' }, { id: 'sky', label: '星图', icon: 'star' }, { id: 'badges', label: '徽章', icon: 'badge' }, { id: 'tools', label: '工具', icon: 'grid' },
];
const TOOL_INTRO: Record<ToolId, string> = { drill: 'boosterDrill', tractor: 'boosterTractor', ion: 'boosterIon' };

export class HangarScreen {
  el: HTMLElement;
  constructor(private app: AppCtx, private tab: Tab = 'cards') {
    this.el = document.createElement('div');
    this.el.className = 'em-screen em-hangar';
  }
  mount(host: HTMLElement): void { host.append(this.el); this.app.music(true); this.render(); this.el.dataset.ready = '1'; }
  resize(): void { this.render(); }
  destroy(): void { this.el.remove(); }
  private land(): boolean { const l = this.app.layout(); return l.width > l.height; }
  private render(): void {
    const s = this.app.save.data;
    const inst = installed(this.app);
    const mods = EPISODES.map((e) => e.module as ModuleKey);
    this.el.innerHTML = `<div class="em-bg">${backdrop('route', this.land())}</div>
      <div class="em-topbar"><button class="xg-btn xg-btn--night em-upbtn" data-sfx="ui-back">${icon('back')}<span>航线</span></button>
        <div class="em-chip em-chip--title"><span>星晶号机库</span></div><div class="em-chip em-chip--stars">${icon('star')}<b class="xg-num">${totalStars(this.app)}</b><span class="xg-num">/120</span></div></div>
      <div class="em-hangar__ship"><div class="em-hangar__art">${shipSvg(inst, { all: true })}</div>
        <div class="em-hangar__mods">${mods.map((m) => `<button class="em-mod${inst[m] ? ' is-on' : ''}" data-mod="${m}"><i style="background:${inst[m] ?? 'transparent'}"></i><span>${MODULE_NAMES[m]}</span></button>`).join('')}
          <span class="em-hangar__next">下一批航线</span>${FUTURE.map((f) => `<span class="em-mod is-future"><i></i><span>${f.name}</span></span>`).join('')}</div></div>
      <div class="em-hangar__book">
        <div class="em-tabs" role="tablist">${TABS.map((t) => `<button class="em-tab${t.id === this.tab ? ' is-on' : ''}" data-tab="${t.id}" role="tab">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}</div>
        <div class="em-hangar__page">${this.page(this.tab)}</div></div>`;
    this.el.querySelector('.em-upbtn')!.addEventListener('click', () => this.app.go({ s: 'route' }));
    this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab as Tab; sfx('ui-tap'); this.render(); }));
    this.el.querySelectorAll<HTMLElement>('.em-mod[data-mod]').forEach((b) => b.addEventListener('click', () => void this.repaint(b.dataset.mod as ModuleKey)));
    this.el.querySelectorAll<HTMLElement>('[data-item]').forEach((b) => b.addEventListener('click', () => void this.open(b.dataset.item!)));
    bindPress(this.el);
    void s;
  }
  private page(tab: Tab): string {
    const s = this.app.save.data;
    if (tab === 'cards') return `<div class="em-grid">${EPISODES.map((e) => {
      const got = s.arrivals.includes(e.ep);
      return `<button class="em-item${got ? '' : ' is-locked'}" data-item="card:${e.ep}">${got ? `<span class="em-item__art">${cardArt(e.card)}</span>` : `<span class="em-item__lock">${icon('lock')}</span>`}<b>${e.dest}</b></button>`;
    }).join('')}</div>`;
    if (tab === 'sky') {
      const stars = totalStars(this.app);
      return `<div class="em-grid em-grid--sky">${CONSTELLATIONS.map((c) => {
        const lit = stars >= c.gate;
        return `<button class="em-item${lit ? '' : ' is-locked'}" data-item="sky:${c.id}"><span class="em-item__art">${constellationSvg(c, { lit })}</span><b>${lit ? c.name : `${icon('star')}<span class="xg-num">${c.gate}</span>`}</b></button>`;
      }).join('')}</div>`;
    }
    if (tab === 'badges') return `<div class="em-grid em-grid--badges">${BADGES.map((b) => {
      const got = b.id === 'veteran' ? s.grants.includes('veteran') : !!s.puzzles[b.id]?.solved;
      return `<button class="em-item em-item--badge${got ? '' : ' is-locked'}" data-item="badge:${b.id}"><span class="em-item__badge">${badgeSvg(b.id, { locked: !got, helped: got && (s.puzzles[b.id]?.maxHint ?? 0) >= 3 })}</span><b>${got ? b.name : '？'}</b></button>`;
    }).join('')}</div>`;
    return `<div class="em-grid em-grid--tools">${(['drill', 'tractor', 'ion'] as ToolId[]).map((t) => {
      const known = s.intros.includes(TOOL_INTRO[t]);
      return `<button class="em-item em-item--tool${known ? '' : ' is-locked'}" data-item="tool:${t}"><span class="em-item__tool">${known ? toolSvg(t) : icon('lock')}</span><b>${known ? `${TOOL_NAMES[t]} <span class="xg-num">×${s.boosters[t]}</span>` : '？'}</b></button>`;
    }).join('')}</div>`;
  }
  private async open(item: string): Promise<void> {
    const [kind, id] = item.split(':');
    const s = this.app.save.data;
    if (kind === 'card') {
      const e = EPISODES.find((x) => x.ep === Number(id))!;
      if (!s.arrivals.includes(e.ep)) { sfx('ui-locked'); void this.app.voice.say('em.route.locked', { interrupt: true }); return; }
      const line = `em.card.${e.card}`;
      void this.app.voice.say(line, { interrupt: true });
      await this.modal(`<div class="xg-ribbon">${e.dest}</div><div class="em-kcard__art">${cardArt(e.card)}</div><p class="em-kcard__text">${this.app.voice.text(line)}</p>`, line);
    } else if (kind === 'sky') {
      const c = CONSTELLATIONS.find((x) => x.id === id)!;
      if (totalStars(this.app) < c.gate) { sfx('ui-locked'); return; }
      void this.app.voice.say(c.line, { interrupt: true });
      await this.modal(`<div class="xg-ribbon">${c.name}</div><div class="em-sky__card">${constellationSvg(c, { animate: true })}</div><p class="em-kcard__text">${this.app.voice.text(c.line)}</p>`, c.line);
    } else if (kind === 'badge') {
      const b = BADGES.find((x) => x.id === id)!;
      const got = b.id === 'veteran' ? s.grants.includes('veteran') : !!s.puzzles[b.id]?.solved;
      if (!got) { sfx('ui-locked'); return; }
      await this.modal(`<div class="xg-ribbon">徽章</div><div class="em-badge-big">${badgeSvg(b.id, { helped: (s.puzzles[b.id]?.maxHint ?? 0) >= 3 })}</div><h2 class="xg-modal__title">${b.name}</h2><p class="em-kcard__text">${b.how}</p>`, null);
    } else if (kind === 'tool') {
      const t = id as ToolId;
      if (!s.intros.includes(TOOL_INTRO[t])) { sfx('ui-locked'); return; }
      await showIntroCard(this.app, TOOL_INTRO[t]);
    }
  }
  private modal(html: string, line: string | null): Promise<void> {
    return new Promise((res) => {
      void showResult({
        accentGame: 'match',
        actions: [...(line ? [{ id: 'again', label: '再听一遍', kind: 'secondary' as const, icon: 'listen' as const }] : []), { id: 'ok', label: '好的', kind: 'primary', icon: 'check' }],
        onOpen: (panel) => { panel.classList.add('em-modal--wide'); panel.closest('.xg-scrim')?.classList.add('em-has-text'); const box = document.createElement('div'); box.className = 'em-hangar__modal'; box.innerHTML = html; panel.prepend(box); },
      }).then((a) => { if (a === 'again' && line) { void this.app.voice.say(line, { interrupt: true }); void this.modal(html, line).then(res); } else res(); });
    });
  }
  private async repaint(m: ModuleKey): Promise<void> {
    const inst = installed(this.app);
    if (!inst[m]) { sfx('ui-locked'); void this.app.voice.say('em.route.locked', { interrupt: true }); return; }
    void this.app.voice.say('em.pick.1', { interrupt: true });
    const pick = await showResult({
      ribbon: MODULE_NAMES[m], accentGame: 'match',
      actions: PAINTS[m].map((_c, k) => ({ id: String(k), label: PAINT_NAMES[m][k], kind: (k === 0 ? 'secondary' : 'primary') as 'secondary' | 'primary' })),
      onOpen: (panel) => {
        const row = document.createElement('div'); row.className = 'em-paint em-paint--modal';
        row.innerHTML = PAINTS[m].map((c, k) => `<span class="em-paint__card" style="--paint:${c}"><span class="em-paint__ship">${shipSvg({ ...inst, [m]: c })}</span><b>${PAINT_NAMES[m][k]}</b></span>`).join('');
        panel.querySelector('.xg-modal__actions')?.before(row);
      },
    });
    this.app.save.data.cosmetics[m] = PAINTS[m][Number(pick)];
    this.app.save.commit();
    sfx('ui-confirm');
    this.render();
  }
}
