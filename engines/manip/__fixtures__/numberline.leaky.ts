/**
 * FROZEN MUTANT of review finding F1 (v2.0 number line): the magnifier printed the value, the slider carried aria-valuenow.
 * Never imported by the game. The leak gate (validate/numline-leak.test.ts) must REJECT this view and a readout bot must beat the
 * calibration with it — otherwise the gate has no teeth. (The original DOM control is kept beside it: numberline.f1-frozen.ts.)
 */
import { renderNumberLine, type NlViewState } from '../numberline';

export function renderLeakyNumberLine(s: NlViewState): string {
  let m = renderNumberLine(s);
  if (s.flag !== null) {
    m = m.replace('<svg class="nl-svg"', `<svg class="nl-svg" aria-valuenow="${Math.round(s.flag)}" aria-valuemin="0" aria-valuemax="${s.L}"`);
    m = m.replace(/<g class="nl-flag/, `<g data-value="${Math.round(s.flag)}" class="nl-flag`);
    m = m.replace('<circle class="nl-lens-glass" r="60"/>', `<circle class="nl-lens-glass" r="60"/><text class="nl-lens-val" y="-30">${Math.round(s.flag)}</text>`);
  }
  return m;
}
