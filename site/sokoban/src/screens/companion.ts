/**
 * Companion strip (spec §2.2): the 领航员 avatar + a paper subtitle bubble (≤ 15 characters a line,
 * 文楷) + 再听一遍. Portrait: a 72 px strip above the action bar (head avatar); landscape: the right
 * column (full robot, bubble below). Shown only while there is something to say; the subtitle
 * stays readable until the next line or `hide()`. The robot never looks sad (kit rule).
 */
import { mount, type Companion, type Mood } from '@kit/companion';
import { icon, setPlaying } from '@kit/ui';
import type { SayResult } from '@kit/narration';
import type { Rect } from '../render/layout';
import type { Voice } from '../audio/voice';
import { playSfx } from '../audio/sfx';
import { setPhraseText } from './wrap';

export class CompanionStrip {
  readonly el: HTMLDivElement;
  private bot: Companion | null = null;
  private readonly botHost: HTMLDivElement;
  private readonly bubble: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly replay: HTMLButtonElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private variant: 'head' | 'full' | null = null;
  private token = 0;
  /** last line id shown (tests read it from the DOM: data-line) */
  lastId = '';
  /** the line being spoken right now (resolves when it ends or is cut off) */
  private speaking: Promise<unknown> | null = null;

  constructor(host: HTMLElement, private readonly voice: Voice) {
    this.el = document.createElement('div');
    this.el.className = 'sok-comp';
    this.botHost = document.createElement('div');
    this.botHost.className = 'sok-comp__bot';
    this.bubble = document.createElement('div');
    this.bubble.className = 'sok-comp__bubble';
    this.text = document.createElement('div');
    this.text.className = 'sok-comp__text';
    this.text.setAttribute('aria-live', 'polite');
    this.replay = document.createElement('button');
    this.replay.type = 'button';
    this.replay.className = 'xg-iconbtn xg-iconbtn--sm sok-comp__replay';
    this.replay.setAttribute('aria-label', '再听一遍');
    this.replay.dataset.testid = 'replay';
    this.replay.innerHTML = icon('replay');
    this.replay.addEventListener('click', () => {
      setPlaying(this.replay, true);
      void this.voice.replay().then(() => setPlaying(this.replay, false));
      this.bot?.say(this.text.textContent ?? '', { hold: 0, speak: () => new Promise((r) => setTimeout(r, 900)) });
    });
    this.bubble.append(this.text, this.replay);
    this.el.append(this.botHost, this.bubble);
    host.append(this.el);
  }

  layout(r: Rect, orientation: 'portrait' | 'landscape'): void {
    Object.assign(this.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    this.el.dataset.orient = orientation;
    const want = orientation === 'portrait' ? 'head' : 'full';
    if (want !== this.variant) {
      this.bot?.destroy();
      this.variant = want;
      this.bot = mount(this.botHost, { size: want === 'head' ? 64 : 96, variant: want, bubble: 'right', mood: 'idle', sfx: (n) => playSfx(n, { volume: 0.5 }), name: '领航员' });
    }
  }

  /** Speak a line: bubble + voice + LED mouth. */
  /**
   * Speak a line. `polite` lines (the automatic ones: chapter and level intros) wait for a line that
   * is still being said and give up if another line took the stage meanwhile — they never cut off
   * a line that answered something the child just did.
   */
  async say(id: string, o: { mood?: Mood; interrupt?: boolean; hold?: number; polite?: boolean } = {}): Promise<SayResult> {
    if (this.dead) return 'skipped';
    if (o.polite && this.speaking) {
      const before = this.token;
      await this.settle(8000);
      // another line took the stage, or the screen went away (a deferred intro must never be
      // spoken over the next level — QA r2: sok.lv.0-1 was heard after 0-3 had loaded)
      if (this.token !== before || this.dead) return 'skipped';
    }
    const token = ++this.token;
    const text = this.voice.text(id);
    if (!text) return 'skipped';
    this.lastId = id;
    this.el.dataset.line = this.voice.resolve(id);
    setPhraseText(this.text, text);
    this.el.classList.add('is-on');
    if (this.hideTimer) clearTimeout(this.hideTimer);
    let result: SayResult = 'skipped';
    const speak = async () => {
      result = await this.voice.say(id, { interrupt: o.interrupt ?? true });
    };
    const run = this.bot ? this.bot.say(text, { mood: o.mood ?? 'happy', speak, hold: 0, cps: 40 }) : speak();
    this.speaking = run;
    await run;
    if (this.speaking === run) this.speaking = null;
    if (token === this.token) {
      this.hideTimer = setTimeout(() => {
        if (token === this.token) this.el.classList.remove('is-on');
      }, o.hold ?? 5000);
    }
    return result;
  }

  /** Resolves when the current line has been said (or after `maxMs`): lets a scene end without cutting a line. */
  settle(maxMs: number): Promise<void> {
    const cur = this.speaking;
    if (!cur) return Promise.resolve();
    return Promise.race([cur.then(() => undefined, () => undefined), new Promise<void>((r) => setTimeout(r, maxMs))]);
  }

  mood(m: Mood): void {
    this.bot?.setMood(m);
  }

  react(kind: 'hop' | 'nod' | 'wiggle' | 'jolt'): void {
    this.bot?.react(kind);
  }

  hide(): void {
    this.token += 1;
    this.speaking = null;
    this.el.classList.remove('is-on');
    this.voice.stop();
    this.bot?.hush();
  }

  /** Set by destroy(): every pending / deferred say() of this strip resolves 'skipped'. */
  private dead = false;

  destroy(): void {
    this.dead = true;
    this.token += 1;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.bot?.destroy();
    this.el.remove();
  }
}
