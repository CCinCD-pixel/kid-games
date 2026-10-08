/**
 * Play-screen HUD (spec §2.3, §6.8, §6.11): moves bubble, goal cards (bump on arrival, gold check when
 * done), level chip, pause, companion head, combo/chain callouts, subtitle lane, booster bar.
 */
import { icon } from '@kit/ui';
import type { Objective } from '../core/types';
import { energySvg, objectiveIcon } from './icons';
import type { PlayLayout, Rect } from './layout';

const place = (el: HTMLElement, r: Rect) => { el.style.left = `${r.x}px`; el.style.top = `${r.y}px`; el.style.width = `${r.w}px`; el.style.height = `${r.h}px`; };

/** one button of the bottom action bar: boosters (levels), undo / restart / hint (puzzles), 结束 (free) */
export interface BarButton { id: string; icon: string; label?: string; count?: number; state?: 'ok' | 'empty' | 'limit' | 'active'; fresh?: boolean; aria: string }

export class Hud {
  root: HTMLElement;
  moves: HTMLElement;
  private movesNum: HTMLElement;
  chip: HTMLElement;
  pause: HTMLButtonElement;
  head: HTMLElement;
  goals: HTMLElement[] = [];
  private goalNum: HTMLElement[] = [];
  private goalIcon: HTMLElement[] = [];
  sub: HTMLElement;
  tools: HTMLElement;
  private callouts: HTMLElement;
  /** ion-cannon direction keys (横 / 竖), shown in the subtitle lane while aiming */
  aimbar: HTMLElement;
  private queue: HTMLElement[] = [];
  private bar: BarButton[] = [];
  private energyGoal = -1;
  private energyN = 1;
  constructor(parent: HTMLElement, label: string, objectives: Objective[], o: { movesLabel?: string } = {}) {
    this.root = document.createElement('div');
    this.root.className = 'em-hud';
    this.root.innerHTML = `
      <div class="em-chip"><span class="em-chip__txt">${label}</span></div>
      <button class="xg-iconbtn xg-iconbtn--night em-pause" aria-label="暂停" data-sfx="ui-open">${icon('pause')}</button>
      <div class="em-moves" aria-label="步数"><b class="xg-num">0</b><span>${o.movesLabel ?? '步数'}</span></div>
      <div class="em-head"></div>
      <div class="em-sub-lane"></div>
      <div class="em-tools" role="toolbar"></div>
      <div class="em-aimbar" hidden></div>
      <div class="em-callouts" aria-live="polite"></div>`;
    parent.append(this.root);
    this.chip = this.root.querySelector('.em-chip')!;
    this.pause = this.root.querySelector('.em-pause')!;
    this.moves = this.root.querySelector('.em-moves')!;
    this.movesNum = this.moves.querySelector('b')!;
    this.head = this.root.querySelector('.em-head')!;
    this.sub = this.root.querySelector('.em-sub-lane')!;
    this.tools = this.root.querySelector('.em-tools')!;
    this.callouts = this.root.querySelector('.em-callouts')!;
    this.aimbar = this.root.querySelector('.em-aimbar')!;
    objectives.forEach((ob, k) => {
      const card = document.createElement('div');
      card.className = `em-goal em-goal--${ob.t}`;
      card.innerHTML = `<div class="em-goal__icon">${objectiveIcon(ob)}</div><b class="xg-num em-goal__n">0</b><div class="em-goal__check">${icon('check')}</div>`;
      this.root.append(card);
      this.goals.push(card);
      this.goalNum.push(card.querySelector('.em-goal__n')!);
      this.goalIcon.push(card.querySelector('.em-goal__icon')!);
      if (ob.t === 'energy') { this.energyGoal = k; this.energyN = ob.n; }
    });
  }
  layout(l: PlayLayout): void {
    this.root.dataset.orientation = l.orientation;
    this.root.dataset.size = l.size;
    place(this.chip, l.chip); place(this.pause, l.pause); place(this.moves, l.moves); place(this.head, l.head); place(this.sub, l.sub);
    l.goals.forEach((r, k) => { if (this.goals[k]) place(this.goals[k], r); });
    if (l.tools) { place(this.tools, l.tools); this.tools.hidden = false; } else this.tools.hidden = true;
    l.toolBtns.forEach((r, k) => { const b = this.tools.children[k] as HTMLElement | undefined; if (b) { b.style.left = `${r.x - l.tools!.x}px`; b.style.top = '0px'; b.style.width = `${r.w}px`; b.style.height = `${r.h}px`; } });
    place(this.aimbar, l.sub);
    this.callouts.style.left = `${l.panel.x}px`; this.callouts.style.width = `${l.panel.w}px`;
    this.callouts.style.top = `${l.panel.y + Math.min(l.panel.h * 0.3, 160)}px`;
  }
  setMoves(n: number, warn: boolean): void {
    this.movesNum.textContent = String(n);
    this.moves.classList.toggle('is-low', warn);
  }
  bumpMoves(): void { this.moves.classList.remove('is-tick'); void this.moves.offsetWidth; this.moves.classList.add('is-tick'); }
  setGoal(k: number, n: number, done = n <= 0): void {
    const el = this.goals[k]; if (!el) return;
    this.goalNum[k].textContent = String(Math.max(0, n));
    if (k === this.energyGoal) this.goalIcon[k].innerHTML = energySvg(1 - Math.max(0, n) / this.energyN);
    if (done && !el.classList.contains('is-done')) { el.classList.add('is-done'); return; }
    if (!done) el.classList.remove('is-done');
  }
  bumpGoal(k: number): void { const el = this.goals[k]; if (!el) return; el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }
  goalCenter(k: number): { x: number; y: number } | null {
    const el = this.goalIcon[k]; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /** one callout at a time, 700 ms each, oldest dropped beyond 2 queued (spec §6.11) */
  callout(text: string, kind: 'chain' | 'combo' | 'info', big = false, lessFx = false): void {
    const el = document.createElement('div');
    el.className = `em-callout em-callout--${kind}${big ? ' is-big' : ''}${lessFx ? ' is-calm' : ''}`;
    const m = /^连锁 (\d+)$/.exec(text);
    el.innerHTML = m ? `<b class="xg-num">${m[1]}</b><span>连锁</span>` : `<span>${text}</span>`;
    this.queue.push(el);
    if (this.queue.length > 3) this.queue.splice(1, this.queue.length - 3);
    if (this.queue.length === 1) this.nextCallout();
  }
  private nextCallout(): void {
    const el = this.queue[0]; if (!el) return;
    this.callouts.append(el);
    window.setTimeout(() => { el.remove(); this.queue.shift(); this.nextCallout(); }, 700);
  }
  clearCallouts(): void { this.queue = []; this.callouts.innerHTML = ''; }

  /** (re)build the action bar; positions come from layout() */
  setBar(buttons: BarButton[], onPress: (id: string) => void): void {
    this.bar = buttons.map((b) => ({ ...b }));
    this.tools.innerHTML = '';
    for (const b of this.bar) {
      const el = document.createElement('button');
      el.className = 'em-tool';
      el.dataset.id = b.id;
      el.setAttribute('aria-label', b.aria);
      el.innerHTML = `<span class="em-tool__icon">${b.icon}</span>${b.label ? `<span class="em-tool__label">${b.label}</span>` : ''}<b class="em-tool__count xg-num"></b>`;
      el.addEventListener('click', () => onPress(b.id));
      this.tools.append(el);
      this.paintBar(b);
    }
  }
  updateBar(id: string, patch: Partial<BarButton>): void {
    const b = this.bar.find((x) => x.id === id); if (!b) return;
    Object.assign(b, patch); this.paintBar(b);
  }
  barEl(id: string): HTMLElement | null { return this.tools.querySelector<HTMLElement>(`[data-id="${id}"]`); }
  private paintBar(b: BarButton): void {
    const el = this.barEl(b.id); if (!el) return;
    const c = el.querySelector<HTMLElement>('.em-tool__count')!;
    c.hidden = b.count === undefined; c.textContent = String(b.count ?? '');
    el.dataset.state = b.state ?? 'ok';
    el.classList.toggle('is-fresh', !!b.fresh);
  }
  /** ion aim: show the 横 / 竖 keys in the subtitle lane (null hides them) */
  showAimbar(html: string | null): void {
    this.aimbar.hidden = html === null;
    this.sub.style.visibility = html === null ? '' : 'hidden';
    if (html !== null) this.aimbar.innerHTML = html;
  }
  destroy(): void { this.root.remove(); }
}
