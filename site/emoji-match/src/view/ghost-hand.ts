/**
 * Cancellable ghost hand (spec §5.1a, kit request #4): positioned from layout cell rects (the board is
 * one canvas, kit ghostDrag needs elements); fades out the moment the child touches the screen.
 */
export class GhostHand {
  private el: HTMLElement;
  private anim: Animation | null = null;
  private timer = 0;
  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'em-ghost';
    this.el.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M26 6c3 0 5 2 5 5v18l2-1c3-1 6 1 6 4v1l2-1c3-1 6 1 6 4l2-1c3 0 5 2 5 5v9c0 9-7 16-16 16h-4c-6 0-10-3-13-8L12 41c-2-3-1-6 2-7 2-1 5 0 6 2l1 2V11c0-3 2-5 5-5z" fill="#fff" stroke="#1b2656" stroke-width="3" stroke-linejoin="round"/></svg><i></i>`;
    this.el.hidden = true;
    parent.append(this.el);
  }
  /** loop: drag from (x0,y0) to (x1,y1) every `every` ms (or a tap when equal) until stop() */
  loop(x0: number, y0: number, x1: number, y1: number, every = 4000): void {
    this.stop();
    const run = () => {
      this.el.hidden = false;
      const tap = Math.hypot(x1 - x0, y1 - y0) < 4;
      const kf: Keyframe[] = tap
        ? [{ transform: `translate(${x0}px, ${y0 + 30}px) scale(1)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${x0}px, ${y0}px) scale(.85)`, opacity: 1, offset: 0.45 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1, offset: 0.6 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0 }]
        : [{ transform: `translate(${x0}px, ${y0 + 30}px) scale(1)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0}px) scale(.9)`, opacity: 1, offset: 0.2 },
          { transform: `translate(${x1}px, ${y1}px) scale(.9)`, opacity: 1, offset: 0.65 }, { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 0 }];
      this.anim = this.el.animate(kf, { duration: Math.min(every - 600, tap ? 1600 : 2800), easing: 'ease-in-out' });
      this.anim.onfinish = () => { this.el.hidden = true; };
      this.timer = window.setTimeout(run, every);
    };
    run();
  }
  /** one gesture (drag, or a tap when the points coincide) at intro-card speed; resolves when done */
  once(x0: number, y0: number, x1: number, y1: number, ms?: number): Promise<void> {
    this.stop();
    const tap = Math.hypot(x1 - x0, y1 - y0) < 4;
    const dur = ms ?? (tap ? 720 : 1050);
    this.el.hidden = false;
    const kf: Keyframe[] = tap
      ? [{ transform: `translate(${x0}px, ${y0 + 26}px) scale(1)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${x0}px, ${y0}px) scale(.82)`, opacity: 1, offset: 0.62 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1, offset: 0.82 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0 }]
      : [{ transform: `translate(${x0}px, ${y0 + 26}px) scale(1)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0}px) scale(.9)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${x1}px, ${y1}px) scale(.9)`, opacity: 1, offset: 0.78 }, { transform: `translate(${x1}px, ${y1}px) scale(1)`, opacity: 0 }];
    this.anim = this.el.animate(kf, { duration: dur, easing: 'ease-in-out' });
    return new Promise((res) => {
      const done = () => { this.el.hidden = true; res(); };
      this.anim!.onfinish = done;
      this.anim!.oncancel = done;
    });
  }
  get active(): boolean { return this.timer !== 0; }
  stop(): void {
    window.clearTimeout(this.timer); this.timer = 0;
    if (this.anim) { this.anim.cancel(); this.anim = null; }
    this.el.hidden = true;
  }
  destroy(): void { this.stop(); this.el.remove(); }
}
