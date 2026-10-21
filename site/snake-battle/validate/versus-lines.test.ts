/**
 * 双人分屏对战 narration (2026-10-20): every versus line id the code can say exists in narration.yaml AND lines.json with the
 * same text, is voiced (manifest + file on disk, 0.3–25 s), at most 12 lines of its own, a spoken-form `norm` where the text
 * carries digits, P0 priority (never dropped by the in-match voice scheduler) — plus the two persona-neutral 截击 tips.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import lines from '../../../content/snake-battle/lines.json';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'site/snake-battle/src');
const L = lines as { id: string; role: string; text: string; norm?: string }[];
const BY = new Map(L.map((l) => [l.id, l]));

/** narration.yaml → id → {role, text, norm} (the file is block style: `- id:` then 2-space-indented fields) */
function yamlLines(): Map<string, { role: string; text: string; norm?: string }> {
  const out = new Map<string, { role: string; text: string; norm?: string }>();
  const body = fs.readFileSync(path.join(ROOT, 'content/snake-battle/narration.yaml'), 'utf8').split(/^\s*- id:\s*/m).slice(1);
  for (const blk of body) {
    const id = blk.split('\n')[0].trim();
    const f = (k: string) => blk.match(new RegExp(`^\\s+${k}:\\s*(.*)$`, 'm'))?.[1]?.trim().replace(/^"(.*)"$/, '$1');
    out.set(id, { role: f('role')!, text: f('text')!, norm: f('norm') });
  }
  return out;
}
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');
const VS = L.map((l) => l.id).filter((id) => id.startsWith('snake.vs.'));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/snake-battle/audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string; durationMs: number }>;

describe('versus lines', () => {
  it('snake.vs.* in yaml ⇔ lines.json, same role/text/norm, ≤ 12 lines', () => {
    const y = yamlLines();
    const yv = [...y.keys()].filter((id) => id.startsWith('snake.vs.')).sort();
    expect(yv).toEqual([...VS].sort());
    expect(VS.length).toBeGreaterThan(0);
    expect(VS.length).toBeLessThanOrEqual(12);
    for (const id of [...VS, 'snake.tip.cut.3', 'snake.tip.cut.4']) {
      expect(y.get(id), id).toBeTruthy();
      expect(y.get(id)!.role, id).toBe(BY.get(id)!.role);
      expect(y.get(id)!.text, id).toBe(BY.get(id)!.text);
      expect(y.get(id)!.norm, id).toBe(BY.get(id)!.norm);
    }
  });
  it('digits in a line carry a spoken-form norm', () => {
    for (const id of VS) if (/[0-9]/.test(BY.get(id)!.text)) expect(BY.get(id)!.norm, id).toMatch(/^[^0-9]+$/);
  });
  it('every snake.vs.* / match.* id the versus code says exists; the intro list is exactly the six intro lines', () => {
    const used = new Set<string>();
    for (const f of ['versus.ts', 'versus-intro.ts']) for (const m of read(f).matchAll(/['"`](snake\.[a-z0-9_.]+)['"`]/gi)) used.add(m[1]);
    for (const id of used) expect(BY.has(id), id).toBe(true);
    for (const id of ['snake.match.go', 'snake.match.resume', 'snake.match.last10', 'snake.match.end', 'snake.vs.win.1', 'snake.vs.win.2', 'snake.vs.draw']) expect(used.has(id), id).toBe(true);
    const ids = read('versus-intro.ts').match(/VERSUS_INTRO_IDS = \[([^\]]*)\]/)![1].match(/snake\.vs\.intro\.\d/g)!;
    expect(ids).toEqual([1, 2, 3, 4, 5, 6].map((n) => `snake.vs.intro.${n}`));
    expect(VS.filter((id) => id.startsWith('snake.vs.intro.')).sort()).toEqual([...ids].sort());
  });
  it('the intro states only what the sim does (3 min, 3 s respawn, boost costs length, longer wins)', () => {
    const venues = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/snake-battle/venues.json'), 'utf8')) as { matchSec: number; respawn: { timed: { delay: number } } };
    expect(venues.matchSec).toBe(180);                 // 「三分钟后」
    expect(venues.respawn.timed.delay).toBe(3);        // 「三秒后复活」
    const t = (n: number) => BY.get(`snake.vs.intro.${n}`)!.text;
    expect(t(4)).toMatch(/三秒后.*复活/); expect(t(6)).toMatch(/三分钟/); expect(t(6)).toMatch(/更长/); expect(t(5)).toMatch(/加速.*变短/); expect(t(3)).toMatch(/别的蛇的身体.*出局/);
    const visible = (x: string) => [...x.replace(/[，。！？、\s]/g, '')].length;
    for (const id of VS) expect(visible(BY.get(id)!.text), id).toBeLessThanOrEqual(15);   // the house subtitle limit (v4-v10-content)
    expect(/死|杀|输|笨|失败/.test(VS.map((id) => BY.get(id)!.text).join(''))).toBe(false);   // no shaming
  });
  it('the voice scheduler never drops a versus line (P0)', () => {
    expect(read('audio.ts')).toMatch(/\|vs\\\.\)\/\.test\(id\)\) return 0/);
  });
  it('voiced: manifest + file for every new line, 0.3–25 s, manifest text = yaml text', () => {
    const y = yamlLines();
    for (const id of [...VS, 'snake.tip.cut.3', 'snake.tip.cut.4']) {
      const c = MANIFEST[id];
      expect(c, id).toBeTruthy();
      expect(c.text, id).toBe(y.get(id)!.text);
      expect(c.durationMs, id).toBeGreaterThan(300);
      expect(c.durationMs, id).toBeLessThan(25000);
      expect(fs.existsSync(path.join(ROOT, 'public', c.src)), c.src).toBe(true);
    }
    expect(Object.keys(MANIFEST).sort()).toEqual([...y.keys()].sort());
  });
  it('a cut by a non-hunter gets one of the two persona-neutral 截击 tips (app.ts tipFor)', () => {
    const app = read('app.ts');
    expect(app).toMatch(/snake\.tip\.cut\.\$\{n % 2 \? 3 : 4\}/);
    expect(app).not.toMatch(/return 'snake\.tip\.body\.1'/);
  });
});
