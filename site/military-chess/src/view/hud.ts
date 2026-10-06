/** Turn bar (colour capsule + text + thinking dots), quiet dots, and the 你是红方/蓝方 badge. */
import { MS, d } from './anim';

export class TurnBar {
  readonly el: HTMLDivElement;
  private pill: HTMLDivElement;
  private text: HTMLSpanElement;
  private dots: HTMLSpanElement;
  private avatar: HTMLSpanElement;
  constructor(testid = 'turn') {
    this.el = document.createElement('div');
    this.el.className = 'mc-turn';
    this.el.dataset.testid = testid;
    this.pill = document.createElement('div');
    this.pill.className = 'mc-turn__pill';
    this.text = document.createElement('span');
    this.text.className = 'mc-turn__text';
    this.dots = document.createElement('span');
    this.dots.className = 'mc-turn__dots';
    this.dots.innerHTML = '<i></i><i></i><i></i>';
    this.dots.style.display = 'none';
    this.avatar = document.createElement('span');
    this.avatar.className = 'mc-turn__avatar';
    this.avatar.style.display = 'none';
    this.el.append(this.pill, this.avatar, this.text, this.dots);
  }
  /** the robot opponent's small head (40 px) while it is its turn */
  setAvatar(html: string | null): void {
    this.avatar.innerHTML = html ?? '';
    this.avatar.style.display = html ? '' : 'none';
  }
  /** colour −1 = undecided (翻翻棋 before the first flip) */
  set(colour: number, text: string, o: { thinking?: boolean; pillText?: string } = {}): void {
    const prev = this.pill.dataset.c;
    this.pill.dataset.c = String(colour);
    this.pill.innerHTML = `<b>${o.pillText ?? (colour === 0 ? '红' : colour === 1 ? '蓝' : '翻')}</b>`;
    this.text.textContent = text;
    this.dots.style.display = o.thinking ? '' : 'none';
    this.el.dataset.colour = String(colour);
    if (prev !== undefined && prev !== String(colour)) {
      this.pill.animate([{ transform: 'translateX(-24px)', opacity: 0.2 }, { transform: 'translateX(0)', opacity: 1 }], { duration: d(MS.turnSwitch), easing: 'ease-out' });
    }
  }
  wobble(): void {
    this.el.classList.remove('is-wobble');
    void this.el.offsetWidth;
    this.el.classList.add('is-wobble');
    this.dots.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: d(MS.wobble) });
  }
}

export class QuietDots {
  readonly el: HTMLDivElement;
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'mc-quiet';
    this.el.dataset.testid = 'quiet';
    this.el.style.display = 'none';
  }
  /** lit = dots still lit (0 hides the row) */
  set(lit: number): void {
    if (lit <= 0) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = 'flex';
    this.el.innerHTML = Array.from({ length: 10 }, (_, k) => `<i class="${k < lit ? '' : 'off'}"></i>`).join('');
  }
}
