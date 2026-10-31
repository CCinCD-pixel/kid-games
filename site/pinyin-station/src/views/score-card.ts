/**
 * Feedback card for the local-scoring trial: "my voice vs the model" pitch curves, one gentle line of words, and the
 * buttons. It never shows a score, a red mark or the words wrong/failed; when the scorer is not sure it says so and
 * asks for another try. Rendering only: the verdict comes from score/ and is never stored as mastery.
 */
import { h } from '@kit/ui';
import { parseSyllable, displayPinyin } from '../domain/pinyin';
import type { Bank } from '../domain/types';
import { LocalScorer } from '../score/client';
import type { Contour } from '../score/contour';
import type { ScoreInput, ScoreResult, Tone } from '../score/types';
import { glyph, pinyin } from './common';

let scorer: LocalScorer | null = null;
export const getLocalScorer = (): LocalScorer => (scorer ??= new LocalScorer());
export function disposeLocalScorer() {
  scorer?.dispose();
  scorer = null;
}

/** Target + the tones this child is likely to mix it up with (from the curriculum's tone confusion pairs). */
export function scoreTarget(syllable: string, bank: Bank): Pick<ScoreInput, 'target' | 'confusions'> | null {
  const parsed = parseSyllable(syllable);
  if (!parsed || parsed.tone < 1 || parsed.tone > 4) return null;
  const mixed = bank.confusions
    .filter((c) => c.type === 'tone' && c.pair.includes(String(parsed.tone)))
    .flatMap((c) => c.pair.filter((t) => t !== String(parsed.tone)).map(Number)) as Tone[];
  const all = ([1, 2, 3, 4] as Tone[]).filter((t) => t !== parsed.tone);
  return {
    target: { syllable, initial: parsed.initial, final: parsed.final, tone: parsed.tone as Tone },
    confusions: { tones: mixed.length ? mixed : all },
  };
}

export type Mood = 'match' | 'try' | 'unsure';
export interface Copy {
  /** Narration id in content/narration/pinyin-station.yaml (clip generated later). */
  id: string;
  text: string;
  mood: Mood;
}
const TRY: Record<1 | 2 | 3 | 4, Copy> = {
  1: { id: 'py.local.t1', text: '试试让声音平平的，像小路。', mood: 'try' },
  2: { id: 'py.local.t2', text: '听，再看：你的声音上扬了吗？', mood: 'try' },
  3: { id: 'py.local.t3', text: '试试先低下去，再抬起来。', mood: 'try' },
  4: { id: 'py.local.t4', text: '试试从高处，一下滑下来。', mood: 'try' },
};
const UNSURE: Record<string, Copy> = {
  warming_up: { id: 'py.local.warmup', text: '我在认识你的声音，再读几个吧', mood: 'unsure' },
  too_quiet: { id: 'py.local.quiet', text: '声音再大一点点，我就听见啦', mood: 'unsure' },
  too_noisy: { id: 'py.local.noisy', text: '周围有点吵，找个安静的地方', mood: 'unsure' },
  clipped: { id: 'py.local.loud', text: '离远一点点，轻轻地读', mood: 'unsure' },
  too_short: { id: 'py.local.short', text: '声音太短啦，慢慢读完整', mood: 'unsure' },
};
export function scoreCopy(result: ScoreResult, tone: Tone): Copy {
  if (result.verdict === 'match') return { id: 'py.local.match', text: '你的声音，和示范很像！', mood: 'match' };
  if (result.verdict === 'differs' && tone >= 1 && tone <= 4) return TRY[tone as 1 | 2 | 3 | 4];
  return UNSURE[result.reason ?? ''] ?? { id: 'py.local.unsure', text: '再试一次，我听得更清楚', mood: 'unsure' };
}
/** Every id used above, so the narration yaml and the tests can check they stay in step. */
export const LOCAL_NARRATION: Copy[] = [
  { id: 'py.local.match', text: '你的声音，和示范很像！', mood: 'match' },
  ...Object.values(TRY),
  { id: 'py.local.unsure', text: '再试一次，我听得更清楚', mood: 'unsure' },
  ...Object.values(UNSURE),
];

const W = 320,
  H = 168,
  PAD = 22;
/** Two curves in semitones relative to each speaker's own median, so a child's and a model's voice line up. */
export function chartSvg(mine: number[] | null, model: number[] | null, faded: boolean): string {
  const all = [...(mine ?? []), ...(model ?? [])];
  const top = Math.max(5, ...all) + 1.5,
    bottom = Math.min(-5, ...all) - 1.5;
  const x = (i: number, n: number) => PAD + ((W - 2 * PAD) * i) / Math.max(1, n - 1);
  const y = (v: number) => PAD + ((H - 2 * PAD) * (top - v)) / (top - bottom);
  const path = (c: number[]) => c.map((v, i) => `${i ? 'L' : 'M'}${x(i, c.length).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const dot = (c: number[], shape: 'circle' | 'square') => {
    const cx = x(c.length - 1, c.length),
      cy = y(c[c.length - 1]);
    return shape === 'circle' ? `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="8"/>` : `<rect x="${(cx - 7).toFixed(1)}" y="${(cy - 7).toFixed(1)}" width="14" height="14" rx="3"/>`;
  };
  return (
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="我的声音和示范的高低曲线" preserveAspectRatio="xMidYMid meet">` +
    `<line class="score-mid" x1="${PAD}" x2="${W - PAD}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>` +
    `<text class="score-axis" x="4" y="${PAD + 4}">高</text><text class="score-axis" x="4" y="${H - PAD + 12}">低</text>` +
    (model ? `<g class="score-model"><path d="${path(model)}"/>${dot(model, 'square')}</g>` : '') +
    (mine ? `<g class="score-mine${faded ? ' is-faded' : ''}"><path d="${path(mine)}"/>${dot(mine, 'circle')}</g>` : '') +
    `</svg>`
  );
}

export interface CardOptions {
  syllable: string;
  result: ScoreResult;
  mine: Contour['curve'] | null;
  model: Contour['curve'] | null;
  copy: Copy;
  actions: HTMLElement[];
}
export function buildScoreCard(o: CardOptions): HTMLElement {
  const chart = h('div', { class: 'score-chart' });
  chart.innerHTML = chartSvg(o.mine, o.model, o.copy.mood === 'unsure');
  const line = h(
    'p',
    { class: 'score-line', 'aria-live': 'polite' },
    o.copy.mood === 'match' ? glyph('star') : o.copy.mood === 'try' ? glyph('listen') : glyph('mic'),
    h('span', null, o.copy.text),
  );
  return h(
    'section',
    { class: `score-card is-${o.copy.mood}`, role: 'region', 'aria-label': '我的声音和示范', 'data-verdict': o.result.verdict },
    h(
      'header',
      { class: 'score-head' },
      h('h3', null, '我的声音', h('span', { class: 'score-vs' }, ' 和 '), '示范'),
      pinyin(displayPinyin(o.syllable), 'score-syllable'),
      h('div', { class: 'score-legend', 'aria-hidden': 'true' }, h('span', { class: 'mine' }, '我的'), h('span', { class: 'model' }, '示范')),
    ),
    h('div', { class: 'score-body' }, chart, h('div', { class: 'score-side' }, line, h('div', { class: 'score-actions' }, ...o.actions))),
  );
}
