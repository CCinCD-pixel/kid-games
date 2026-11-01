/** Runtime text tables: the slim line table is in sync with content, every id the code can ask for resolves to a text (V8 "台词 id 解得出文字"), numbers read the textbook way. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FAMILIES } from '../src/families';
import { TRY_LINE, hasLine, hintLine, lineText, orderLine, zhNumber } from '../src/voice/lines';
import { createRng } from '@kit/rng';

const root = new URL('../../../', import.meta.url);
const all = JSON.parse(readFileSync(new URL('content/mars-base/lines.json', root), 'utf8')).lines as { id: string; text: string }[];

describe('runtime line table', () => {
  it('lines.v1.json is generated from content (tools/mars-base/emit-runtime.mjs --check)', () => {
    execFileSync('node', ['tools/mars-base/emit-runtime.mjs', '--check'], { cwd: new URL('.', root).pathname, stdio: 'pipe' });
  });
  it('every order / hint / try line the code can ask for resolves to text', () => {
    for (const [id, f] of Object.entries(FAMILIES)) {
      const rng = createRng(`lines:${id}`);
      for (const ask of f.asks?.length ? f.asks : [undefined]) {
        const { params } = f.gen(rng, { band: 1, level: 3, rep: 'A', ask, knobs: {} });
        const o = orderLine(f, params, ask); expect(hasLine(o.id), `${id} ${o.id}`).toBe(true);
        expect(lineText(o.id, o.vars).includes('{'), `${id} ${o.id} unresolved var`).toBe(false);
        expect(hasLine(hintLine(f, params)), `${id} hint`).toBe(true);
      }
    }
    for (const id of Object.values(TRY_LINE)) expect(hasLine(id!), id).toBe(true);
    for (const id of ['mars.hint.idle', 'mars.hint.fill', 'mars.hint.touchFirst', 'mars.hint.needTry', 'mars.cert.recv', 'mars.cert.alone', 'mars.h2.intro', 'mars.h3.intro', 'mars.mis.start', 'mars.mis.resume', 'mars.map.welcome', 'mars.map.pick', 'mars.map.locked', 'mars.ok.fix', 'mars.ok.steady', 'mars.mis.direct', 'mars.mis.direct.yes', 'mars.mis.direct.no', 'mars.onb.1', 'mars.onb.far']) expect(hasLine(id), id).toBe(true);
  });
  it('zhNumber reproduces the textbook reading of all 1001 number clips', () => {
    const nums = all.filter((l) => /^mars\.num\.\d+$/.test(l.id));
    expect(nums.length).toBe(1001);
    for (const l of nums) expect(zhNumber(Number(l.id.slice(9))), l.id).toBe(l.text);
  });
});
