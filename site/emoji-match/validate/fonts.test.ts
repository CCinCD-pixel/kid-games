/**
 * V13 font coverage (spec §9.2): every Chinese character this game can show — the 113 lines, level and
 * puzzle teach texts, episode / module / constellation names, and every CJK string literal in
 * site/emoji-match/src (comments stripped; the legacy page excluded) — exists in BOTH design-system
 * subsets (霞鹜文楷 3500 = reading, 站酷快乐体 3500 = titles). A missing glyph would fall back to a
 * system font mid-sentence. The WOFF2 cmap is read directly (Brotli stream → cmap table, formats 4/12),
 * so this runs in `npm run check` without Python.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONSTELLATIONS, EPISODES, LEVELS, LINES, PUZZLES } from '../src/content';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

/** the set of code points a WOFF2 font maps (cmap formats 4 and 12) */
export function woff2Cmap(file: string): Set<number> {
  const b = fs.readFileSync(file);
  if (b.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${file}: not WOFF2`);
  const numTables = b.readUInt16BE(12);
  let p = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i += 1) { const x = b[p++]; v = (v << 7) | (x & 0x7f); if (!(x & 0x80)) return v >>> 0; } throw new Error('bad UIntBase128'); };
  const tables: { tag: string; len: number }[] = [];
  for (let t = 0; t < numTables; t += 1) {
    const flags = b[p++];
    const tag = (flags & 0x3f) === 0x3f ? b.toString('latin1', p, (p += 4)) : KNOWN_TAGS[flags & 0x3f];
    const orig = base128();
    const version = (flags >> 6) & 3;
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    tables.push({ tag, len: transformed ? base128() : orig });
  }
  const totalCompressed = b.readUInt32BE(20);
  const data = zlib.brotliDecompressSync(b.subarray(p, p + totalCompressed));
  let off = 0, cmap: Buffer | null = null;
  for (const t of tables) { if (t.tag === 'cmap') cmap = data.subarray(off, off + t.len); off += t.len; }
  if (!cmap) throw new Error(`${file}: no cmap`);
  const out = new Set<number>();
  const n = cmap.readUInt16BE(2);
  for (let k = 0; k < n; k += 1) {
    const so = cmap.readUInt32BE(4 + k * 8 + 4);
    const fmt = cmap.readUInt16BE(so);
    if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(so + 6), ends = so + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        const end = cmap.readUInt16BE(ends + 2 * s), start = cmap.readUInt16BE(starts + 2 * s), delta = cmap.readInt16BE(deltas + 2 * s), ro = cmap.readUInt16BE(ranges + 2 * s);
        for (let c = start; c <= end && c !== 0xffff; c += 1) {
          const g = ro === 0 ? (c + delta) & 0xffff : cmap.readUInt16BE(ranges + 2 * s + ro + 2 * (c - start));
          if (g !== 0) out.add(c);
        }
      }
    } else if (fmt === 12) {
      const groups = cmap.readUInt32BE(so + 12);
      for (let g = 0; g < groups; g += 1) { const st = cmap.readUInt32BE(so + 16 + g * 12), en = cmap.readUInt32BE(so + 20 + g * 12); for (let c = st; c <= en; c += 1) out.add(c); }
    }
  }
  return out;
}

function sourceStrings(): string[] {
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) return e.name === 'legacy' ? [] : walk(f);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [f] : [];
  });
  const out: string[] = [];
  for (const f of walk(path.join(ROOT, 'site/emoji-match/src'))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g)) if (/[㐀-鿿]/.test(m[2])) out.push(m[2]);
  }
  return out;
}

/** every text the child (or the parent page) can see */
export function displayedText(): string[] {
  return [
    ...LINES.map((l) => l.text),
    ...LEVELS.map((d) => d.teach), ...PUZZLES.map((p) => p.teach),
    ...EPISODES.flatMap((e) => [e.name, e.dest, e.moduleName]),
    ...CONSTELLATIONS.flatMap((c) => [c.name, ...c.stars.map((s) => s.name)]),
    ...sourceStrings(),
  ];
}

describe('V13 fonts', () => {
  const chars = [...new Set(displayedText().join(''))].filter((c) => /[㐀-鿿]/.test(c)).sort();
  it.each(['wenkai-gb-medium-3500.woff2', 'zcool-kuaile-3500.woff2'])('%s covers every displayed character', (f) => {
    const cmap = woff2Cmap(path.join(ROOT, 'public/fonts', f));
    expect(cmap.size).toBeGreaterThan(3500);
    expect(chars.length).toBeGreaterThan(400);
    expect(chars.filter((c) => !cmap.has(c.codePointAt(0)!)).join('')).toBe('');
  });
});
