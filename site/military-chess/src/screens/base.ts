/** Shared screen plumbing: positioning helpers, the guide robot + caption, a timer bag. */
import type { Mood } from '@kit/companion';
import type { App, Screen } from '../app';
import { Caption, mountGuide, type Guide } from '../view/guide';
import type { Orientation, Rect } from '../view/layout';

export function abs(el: HTMLElement, r: Rect): HTMLElement {
  Object.assign(el.style, { position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  return el;
}

export function div(cls: string, html = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

const ICON_LABELS: Record<string, string> = {
  hint: '提示', menu: '菜单', medals: '勋章柜', rules: '规则', 'card-close': '关闭',
  'review-prev': '上一步', 'review-next': '下一步', 'rule-prev': '上一页', 'rule-next': '下一页',
};

/**
 * Where the last real touch/press went down. A tap that starts on something else (the kit start gate,
 * a sheet that closes on pointerup, a scrim) must not activate a button that only appears under the
 * finger afterwards: WebKit hit-tests the synthesized click after touchend (r3: the start-gate tap
 * fell through to the camp's 残局 card).
 */
let lastDown: EventTarget | null = null;
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => { lastDown = e.target; }, true);
/** true when a trusted pointer click did not start on `el` */
export function strayClick(e: MouseEvent, el: Element): boolean {
  if (!e.isTrusted || e.detail === 0) return false; // keyboard / programmatic activation
  return !(lastDown instanceof Node) || !el.contains(lastDown);
}

export function button(cls: string, html: string, onClick: () => void, testid?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.type = 'button';
  b.innerHTML = html;
  if (testid) b.dataset.testid = testid;
  // accessible names: drawn art (tile / icon SVG text) is decorative; icon-only buttons get a label
  b.querySelectorAll('svg').forEach((s) => s.setAttribute('aria-hidden', 'true'));
  const label = testid ? ICON_LABELS[testid] : undefined;
  if (label && !b.textContent?.replace(/\s/g, '')) b.setAttribute('aria-label', label);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    if (strayClick(e, b)) return;
    onClick();
  });
  return b;
}

/** timers and listeners released when the screen goes away (R10.3) */
export class Bag {
  private timers = new Set<number>();
  private offs: Array<() => void> = [];
  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }
  wait(ms: number): Promise<void> {
    return new Promise((r) => this.timeout(r, ms));
  }
  on(off: () => void): void {
    this.offs.push(off);
  }
  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const o of this.offs.splice(0)) o();
  }
}

/** ?test=1: performance entries for the §8.6 regression gates (rotation rebuild, per-move dispatch) */
export const PERF_MARKS = typeof location !== 'undefined' && /[?&]test=1(&|$)/.test(location.search);

export abstract class BaseScreen implements Screen {
  abstract readonly name: string;
  readonly el: HTMLDivElement;
  protected bag = new Bag();
  protected guide: Guide | null = null;
  protected caption: Caption;
  protected o: Orientation = 'portrait';
  protected safeTop = 20;
  /** false once the screen is gone: chained narration (`await say(a); say(b)`) stops instead of
   *  talking over the next screen (a card tapped mid-greeting must keep its own line) */
  protected alive = true;

  constructor(protected app: App) {
    this.el = document.createElement('div');
    this.el.className = 'mc-screen';
    this.caption = new Caption(app.voice);
    app.voice.setTarget(this.caption);
  }

  /** (re)mount the guide robot in a host element */
  protected placeGuide(host: HTMLElement, size: number, o: { variant?: 'full' | 'head'; mood?: Mood; referee?: boolean } = {}): Guide {
    this.guide?.destroy();
    this.guide = mountGuide(host, { size, variant: o.variant, mood: o.mood, referee: o.referee, bubble: 'right' });
    return this.guide;
  }

  protected say(id: string, mood?: Mood): Promise<unknown> {
    if (!this.alive) return Promise.resolve('interrupted');
    if (mood) this.guide?.mood(mood);
    this.guide?.react('nod');
    return this.app.voice.say(id);
  }

  layout(o: Orientation, safeTop: number): void {
    this.o = o;
    this.safeTop = safeTop;
    const t0 = PERF_MARKS ? performance.now() : 0;
    this.render();
    // QA r2 major: render() empties this.el, so a sheet / menu open during a rotation used to vanish
    // while its promise / input lock stayed pending (soft lock). Open modals survive the rebuild.
    for (const [scrim, place] of this.overlays) {
      this.el.appendChild(scrim);
      place();
    }
    if (PERF_MARKS) performance.measure('mc:layout', { start: t0, end: performance.now() });
  }

  private overlays = new Map<HTMLElement, () => void>();
  /** mount a modal scrim that survives orientation rebuilds; `place` (re)positions it for `this.o`.
   *  Returns the close function (removes it for good). */
  protected keepOverlay(scrim: HTMLElement, place: () => void): () => void {
    this.overlays.set(scrim, place);
    place();
    this.el.appendChild(scrim);
    return () => {
      this.overlays.delete(scrim);
      scrim.remove();
    };
  }

  protected abstract render(): void;

  destroy(): void {
    this.alive = false;
    this.bag.dispose();
    this.guide?.destroy();
    this.caption.destroy();
    this.el.remove();
  }
}

/**
 * "Tap to take over" for intro demos (QA r1 major: the ghost hand / button read-through held input for
 * 3–10 s and silently swallowed the child's taps). While armed, the first touch on the screen ends the
 * demo at once: narration stops, the ghost hand fades, and control goes to the child (the touch itself
 * only ends the demo, so a half-shown move is never played by accident). `step()` races each demo await
 * against the skip so the caller's `finally` releases input immediately.
 */
export class IntroSkip {
  skipped = false;
  private res!: () => void;
  private readonly p: Promise<void>;
  private swallowClick = false;
  private armed = true;
  private readonly onDown = (e: PointerEvent): void => {
    if (!this.armed) return;
    e.stopPropagation();
    e.preventDefault();
    this.swallowClick = true;
    this.skip();
  };
  private readonly onClick = (e: MouseEvent): void => {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  };

  constructor(private host: HTMLElement, private onSkip: () => void) {
    this.p = new Promise((r) => (this.res = r));
    host.addEventListener('pointerdown', this.onDown, true);
    host.addEventListener('click', this.onClick, true);
  }

  /** await a demo step; false when the child took over (stop the demo) */
  async step(p: Promise<unknown>): Promise<boolean> {
    if (this.skipped) return false;
    await Promise.race([p, this.p]);
    return !this.skipped;
  }

  skip(): void {
    if (this.skipped || !this.armed) return;
    this.skipped = true;
    document.querySelector('.xg-ghost-hand')?.classList.remove('is-on', 'is-down');
    this.res();
    this.onSkip();
  }

  /** the demo is over: stop intercepting (a pending swallowed click is still eaten) */
  end(): void {
    this.armed = false;
    this.host.removeEventListener('pointerdown', this.onDown, true);
    window.setTimeout(() => this.host.removeEventListener('click', this.onClick, true), 700);
  }
}
