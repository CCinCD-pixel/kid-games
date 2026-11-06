import { h } from '@kit/ui';
import { button, type Context } from './common';
import { RULES } from './lines';

/**
 * 小规则: five small cards with a small animation each. The robot says the plain-Chinese line (no letters, no sounds); the letters
 * and tone marks are only drawn on the card.
 */
const INK = '#4b3f58',
  GOLD = '#d9902b',
  TEAL = '#148a7a';
const text = (x: number, y: number, s: string, size = 46, fill = INK) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" fill="${fill}" font-family="'Andika','PingFang SC',sans-serif">${s}</text>`;
const ART: Record<string, string> = {
  tones: `<svg viewBox="0 0 320 120" aria-hidden="true">${['ā', 'á', 'ǎ', 'à']
    .map((c, i) => text(40 + i * 80, 108, c, 34))
    .join('')}<g class="rule-curve" fill="none" stroke="${TEAL}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 36H64"/><path d="M96 52L144 20"/><path d="M176 24Q200 66 224 24" /><path d="M256 20L304 52"/></g></svg>`,
  i: `<svg viewBox="0 0 320 120" aria-hidden="true">${text(70, 90, 'i', 78)}<circle class="rule-dot" cx="72" cy="22" r="7" fill="${GOLD}"/>${text(160, 80, '→', 40, GOLD)}${text(250, 90, 'í', 78)}</svg>`,
  v: `<svg viewBox="0 0 320 120" aria-hidden="true">${['j', 'q', 'x', 'y'].map((c, i) => `${text(40 + i * 80, 44, `${c} ü`, 34)}${text(40 + i * 80, 74, '↓', 24, GOLD)}${text(40 + i * 80, 108, `${c} u`, 34)}`).join('')}<circle class="rule-dot" cx="52" cy="20" r="5" fill="${GOLD}"/></svg>`,
  nl: `<svg viewBox="0 0 320 120" aria-hidden="true">${[['n', 'nǚ', 100], ['l', 'lǜ', 220]].map(([c, w, x]) => `${text(x as number, 44, `${c} ü`, 34)}${text(x as number, 74, '＝', 24, GOLD)}${text(x as number, 108, w as string, 34)}`).join('')}</svg>`,
  mark: `<svg viewBox="0 0 320 120" aria-hidden="true">${['ài', 'ǒu', 'uì', 'iǔ'].map((c, i) => text(40 + i * 80, 84, c, 44)).join('')}</svg>`,
};
export function rulesView(ctx: Context, focus?: string, lesson = 12): HTMLElement {
  const cards = RULES.filter((r) => r.at <= Math.max(lesson, 2)).map((r) => {
    const art = h('div', { class: 'rule-art' });
    art.innerHTML = ART[r.id];
    return h(
      'section',
      { class: `rule-card ${r.id === focus ? 'focus' : ''}`, 'data-rule': r.id },
      h('h3', null, r.title),
      art,
      h('p', { class: 'rule-text' }, r.line.text),
      button('听一听', () => void ctx.say(r.line.id), 'secondary', 'listen'),
    );
  });
  return h(
    'main',
    { class: 'album-page rules-page' },
    h('div', { class: 'album-title' }, h('div', null, h('small', null, '读拼音的小窍门'), h('h2', null, '小规则')), button('回电台', () => ctx.home(), 'secondary', 'back')),
    h('div', { class: 'rules-scroll' }, ...cards),
  );
}
