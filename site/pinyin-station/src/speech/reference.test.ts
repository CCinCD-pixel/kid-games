import { expect, it } from 'vitest';
import { bank } from '../domain/content';
import { questionPlan, syllablePlan, wordPlan } from './reference';
// @ts-expect-error server ESM stays outside the browser bundle
import { signSoe, validateReference } from '../../../../netlify/lib/soe-core.mjs';
const credentials = { appid: '1', secretId: 'test-id', secretKey: 'test-key' };
it('uses sentence tone detection for words and keeps calls in pinyin mode', () => {
  expect(wordPlan({ hanzi: '理发', syllables: ['li3', 'fa4'] } as never)).toEqual({
    mode: 1,
    ref: '理发',
    pronunciation: ['li3', 'fa4'],
  });
  expect(syllablePlan('de1', bank).mode).toBe(8);
  expect(syllablePlan('ba3', bank)).toMatchObject({ mode: 1, ref: '把' });
});
it('uses branches only for consonants, with the target index matching the actual prompt', () => {
  const q = { kind: 'C', target: 'ni2' } as never;
  const b = {
    ...bank,
    confusions: [{ pair: ['l', 'n'], minimalPairs: [['li2', 'ni2']], type: 'initial', tip: '' }],
  };
  expect(questionPlan(q, b)).toMatchObject({
    mode: 6,
    ref: '梨|泥',
    branches: { target: 1, confusion: 'l|n' },
  });
  expect(questionPlan({ kind: 'C', target: 'ba3' } as never, bank).mode).toBe(1);
});
it('builds only validated pronunciation commands on the server, with exact PCM format and percent encoding', () => {
  const signed = signSoe(credentials, { mode: 1, ref: '理发', pronunciation: ['li3', 'fa4'], now: 1 });
  const query = new URL(signed.url).searchParams;
  expect(query.get('voice_format')).toBe('0');
  expect(query.get('ref_text')).toBe('{::cmd{F_TDET=true}}理{::pron{li3}}发{::pron{fa4}}');
  expect(signSoe(credentials, { mode: 8, ref: 'di4 tu2' }).url).toContain('di4%20tu2');
});
it('allows bounded branches but rejects arbitrary commands, bad pronunciation and texts beyond 30 characters', () => {
  expect(validateReference(6, '梨|泥', ['li2', 'ni2'])).toBe(true);
  expect(validateReference(6, '梨|泥', ['li2', '{::cmd{evil}}'])).toBe(false);
  for (const ref of ['梨|', '|泥', '梨||泥', '梨|泥{::cmd{evil}}'])
    expect(validateReference(6, ref)).toBe(false);
  expect(validateReference(1, '八'.repeat(31))).toBe(false);
  expect(validateReference(1, '理发', ['li3'])).toBe(false);
});
