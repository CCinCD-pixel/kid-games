/**
 * S10 残局挑战 (spec §2.5, §4.2): two tiers × 8 endgames as node cards (4 per row × 2 rows), each
 * with its number, the idea icon, a hand-written title and its stars. Tier 1 opens with L5; tier 2
 * after ≥ 6 tier-1 endgames and L6. A locked tier is grey with a lock and is read out when tapped.
 * The next endgame to do glows gold.
 */
import { icon, starRating } from '@kit/ui';
import type { App } from '../app';
import { ENDGAMES, TIER_NAMES, type Endgame } from '../content';
import { endgameTierUnlocked, endgamesDone, starsOf } from '../core/progress';
import { mcIcon, type McIcon } from '../view/icons';
import { BaseScreen, abs, button, div } from './base';

const IDEA_ICON: Record<string, McIcon> = {
  dig: 'shovel', 'dig-turn': 'shovel', capture: 'swords', 'eng-run': 'train', nomoves: 'feet', 'bomb-mine': 'bomb', camp: 'tent', 'bomb-guard': 'bomb', defend: 'shield', rail: 'train',
};

export class EndgamesScreen extends BaseScreen {
  readonly name = 'endgames';

  constructor(app: App) {
    super(app);
    this.bag.timeout(() => void this.say(endgameTierUnlocked(app.save, 1) ? 'mc.home.puzzle' : 'mc.eg.locked1'), 300);
  }

  back(): boolean {
    this.app.go({ name: 'home' });
    return true;
  }

  private nextId(): string | null {
    for (const tier of [1, 2] as const) {
      if (!endgameTierUnlocked(this.app.save, tier)) return null;
      const e = ENDGAMES.find((x) => x.tier === tier && !starsOf(this.app.save, x.id));
      if (e) return e.id;
    }
    return null;
  }

  protected render(): void {
    const portrait = this.o === 'portrait', st = this.safeTop;
    const W = portrait ? 810 : 1080;
    this.el.replaceChildren();
    this.el.classList.add('mc-endgames');
    const title = div('mc-h1 mc-center', '残局挑战');
    abs(title, { x: 100, y: st + 10, w: W - 200, h: 56 });
    this.el.appendChild(title);
    const next = this.nextId();
    for (const tier of [1, 2] as const) {
      const open = endgameTierUnlocked(this.app.save, tier);
      const box = div(`mc-tier${open ? '' : ' is-locked'}`);
      box.dataset.testid = `tier-${tier}`;
      const r = portrait ? { x: 24, y: st + 76 + (tier - 1) * 404, w: 762, h: 390 } : { x: 16 + (tier - 1) * 532, y: st + 76, w: 516, h: 560 };
      abs(box, r);
      const done = endgamesDone(this.app.save, tier);
      box.innerHTML = `<div class="mc-tier__head"><span class="mc-tier__badge">${tier}</span><b>${TIER_NAMES[String(tier)]}</b><span class="mc-tier__count">${mcIcon('star')}${done}/8</span>${open ? '' : `<span class="mc-tier__lock">${icon('lock')}</span>`}</div>`;
      const list = ENDGAMES.filter((e) => e.tier === tier);
      const cols = portrait ? 4 : 2;
      const cw = portrait ? 176 : 238, ch = portrait ? 150 : 110, gx = portrait ? 12 : 12, gy = portrait ? 14 : 12;
      const x0 = (r.w - cols * cw - (cols - 1) * gx) / 2, y0 = portrait ? 66 : 62;
      list.forEach((e, k) => {
        const c = k % cols, row = Math.floor(k / cols);
        const s = starsOf(this.app.save, e.id);
        const node = button(`mc-eg${portrait ? '' : ' is-compact'}${s ? ' is-done' : ''}${e.id === next ? ' is-next' : ''}${open ? '' : ' is-locked'}`, `
          <span class="mc-eg__n">${k + 1}</span>
          <span class="mc-eg__ico">${mcIcon(IDEA_ICON[e.idea] ?? 'flag')}</span>
          <span class="mc-eg__t">${e.title}</span>
          <span class="mc-eg__stars">${starRating(s, 3)}</span>`, () => this.pick(e, open), `eg-${e.id}`);
        abs(node, { x: x0 + c * (cw + gx), y: y0 + row * (ch + gy), w: cw, h: ch });
        box.appendChild(node);
      });
      this.el.appendChild(box);
    }
    const gh = div('');
    if (portrait) {
      abs(gh, { x: 24, y: 1080 - 16 - 120, w: 110, h: 120 });
      abs(this.caption.el, { x: 150, y: 1080 - 16 - 96, w: 636, h: 84 });
    } else {
      abs(gh, { x: 24, y: 810 - 16 - 110, w: 96, h: 110 });
      abs(this.caption.el, { x: 136, y: 810 - 16 - 84, w: 760, h: 76 });
    }
    this.el.append(gh, this.caption.el);
    this.placeGuide(gh, portrait ? 110 : 96);
  }

  private pick(e: Endgame, open: boolean): void {
    if (!open) {
      this.app.play('ui-locked');
      void this.say(e.tier === 1 ? 'mc.eg.locked1' : 'mc.eg.locked2', 'thinking');
      return;
    }
    this.app.play('ui-confirm');
    const pr = this.app.save.puzzleResume;
    const resume = pr?.id === e.id;
    this.app.go({ name: 'item', id: e.id, twin: resume ? pr!.twin : false, resume });
  }
}
