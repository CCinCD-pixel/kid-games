/** Counts only visible, interactive item time. A single idle gap contributes at most 45 s. */
export class ItemTimer {
  private last: number;
  private visible = true;
  private demo = false;
  private total = 0;

  constructor(now: number) { this.last = now; }
  tick(now: number): number {
    const gap = Math.max(0, now - this.last);
    if (this.visible && !this.demo) this.total = Math.min(120_000, this.total + Math.min(45_000, gap));
    this.last = now;
    return Math.round(this.total);
  }
  setVisible(visible: boolean, now: number): void { this.tick(now); this.visible = visible; }
  setDemo(demo: boolean, now: number): void { this.tick(now); this.demo = demo; }
  elapsed(now: number): number { return this.tick(now); }
}
