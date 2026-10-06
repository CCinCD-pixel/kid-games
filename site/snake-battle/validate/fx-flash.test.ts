/** §6.10 flash rule: every repeated luminance change in the effect keyframe table is ≤ 3 Hz and ≤ 20 %. */
import { describe, expect, it } from 'vitest';
import { FX_KEYFRAMES } from '../src/render/fx';

describe('fx-flash', () => {
  for (const [k, v] of Object.entries(FX_KEYFRAMES)) it(k, () => { expect(v.hz, `${k} hz`).toBeLessThanOrEqual(3); expect(v.amp, `${k} amp`).toBeLessThanOrEqual(0.2 + 1e-9); });
});
