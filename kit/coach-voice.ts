import { mount, type Companion, type Mood } from './companion';
import { Narrator } from './narration';

/** A compact robot guide whose caption stays visible between spoken lines. */
export class CoachVoice {
  readonly narrator: Narrator;
  private bot: Companion | null = null;
  private caption: HTMLElement | null = null;
  private last: { text: string; lines: string[]; mood: Mood } | null = null;
  private token = 0;

  constructor(manifestUrl: string, private options: { name: string; accessory?: 'coach'; accent?: string; speechFallback?: boolean }) {
    // Product companions use committed clips as their voice. A browser TTS fallback can sound like a
    // different character, especially on iOS, so callers can keep a failed line as subtitle pacing.
    this.narrator = new Narrator({ manifestUrl, speechFallback: options.speechFallback });
  }

  attach(host: HTMLElement | null, caption: HTMLElement | null): void {
    this.narrator.stop();
    this.bot?.destroy();
    this.caption = caption;
    this.bot = host ? mount(host, { size: '100%', variant: 'head', name: this.options.name, accessory: this.options.accessory, accent: this.options.accent, mood: this.last?.mood ?? 'happy' }) : null;
    if (caption && this.last) caption.textContent = this.last.text;
  }

  say(text: string, lines: string | string[], mood: Mood = 'happy', force = false): void {
    const sequence = Array.isArray(lines) ? lines : [lines];
    this.last = { text, lines: sequence, mood };
    if (this.caption) this.caption.textContent = text;
    const token = ++this.token;
    const speak = async () => {
      for (let i = 0; i < sequence.length && token === this.token; i++) {
        const result = await this.narrator.say(sequence[i], { interrupt: i === 0, force });
        if (result !== 'done') break;
      }
    };
    if (this.bot) {
      this.bot.setMood(mood);
      if (mood === 'celebrating') this.bot.react('hop');
      void this.bot.say(text, { mood, stay: true, hold: 0, cps: 80, speak });
    } else void speak();
  }

  replay(): void {
    if (this.last) this.say(this.last.text, this.last.lines, this.last.mood, true);
  }

  stop(): void {
    this.token++;
    this.narrator.stop();
    this.bot?.hush();
  }
}
