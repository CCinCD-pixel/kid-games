// Shared helpers of the font-coverage tooling (tools/fonts/patch-subset.mjs, tests/unit/fonts.test.ts):
//   - readWoff2Cmap(buf)      the set of code points a .woff2 font maps (cmap is never transformed in WOFF2)
//   - scanRoots(opts)         every CJK ideograph / CJK punctuation character the child can *see*:
//                             string literals of site/** + kit/** sources, content/** data, narration yaml,
//                             lines.json, display-text files, game.json titles, HTML
//   - stripCodeComments(src)  drop // and /* */ comments of a TS/JS/CSS source, keep string literals
// Pure Node, no dependencies, so the vitest suite and CI can run it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const CJK_RE = /[㐀-䶿一-鿿豈-﫿　-〿＀-￯]/gu;
/** ideographs only (what a font subset really has to carry; punctuation falls back gracefully) */
/** characters that only appear as regex range delimiters (/[㐀-鿿]/) — never displayed */
export const IGNORE = new Set(['\u3400', '\u9fff', '\uf900', '\ufaff', '\ufffd', '\ufeff']);
export const IDEOGRAPH_RE = /[㐀-䶿一-鿿豈-﫿]/gu;

// ---------------------------------------------------------------- WOFF2 cmap reader
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function base128(buf, pos) {
  let v = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[pos.i++];
    v = (v << 7) | (b & 0x7f);
    if (!(b & 0x80)) return v >>> 0;
  }
  throw new Error('woff2: bad UIntBase128');
}

/** Code points mapped by a WOFF2 font (Unicode cmap, formats 4 and 12). */
export function readWoff2Cmap(file) {
  const buf = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a woff2 file');
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  const pos = { i: 48 };
  const tables = [];
  for (let t = 0; t < numTables; t++) {
    const flags = buf[pos.i++];
    const idx = flags & 0x3f;
    let tag;
    if (idx === 63) { tag = buf.toString('latin1', pos.i, pos.i + 4); pos.i += 4; } else tag = KNOWN_TAGS[idx];
    const xform = flags >> 6;
    const origLength = base128(buf, pos);
    const transformed = tag === 'glyf' || tag === 'loca' ? xform === 0 : xform !== 0;
    const length = transformed ? base128(buf, pos) : origLength;
    tables.push({ tag, length });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(pos.i, pos.i + compressed));
  let off = 0;
  let cmap = null;
  for (const t of tables) {
    if (t.tag === 'cmap') cmap = data.subarray(off, off + t.length);
    off += t.length;
  }
  if (!cmap) throw new Error('woff2: no cmap');
  const out = new Set();
  const n = cmap.readUInt16BE(2);
  for (let r = 0; r < n; r++) {
    const platform = cmap.readUInt16BE(4 + r * 8);
    const encoding = cmap.readUInt16BE(6 + r * 8);
    const offset = cmap.readUInt32BE(8 + r * 8);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const fmt = cmap.readUInt16BE(offset);
    if (fmt === 12) {
      const groups = cmap.readUInt32BE(offset + 12);
      for (let g = 0; g < groups; g++) {
        const s = cmap.readUInt32BE(offset + 16 + g * 12);
        const e = cmap.readUInt32BE(offset + 20 + g * 12);
        for (let c = s; c <= e; c++) out.add(c);
      }
    } else if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(offset + 6);
      const seg = segX2 / 2;
      const endBase = offset + 14;
      const startBase = endBase + segX2 + 2;
      const deltaBase = startBase + segX2;
      const rangeBase = deltaBase + segX2;
      for (let s = 0; s < seg; s++) {
        const end = cmap.readUInt16BE(endBase + s * 2);
        const start = cmap.readUInt16BE(startBase + s * 2);
        const delta = cmap.readInt16BE(deltaBase + s * 2);
        const ro = cmap.readUInt16BE(rangeBase + s * 2);
        for (let c = start; c <= end && c < 0xffff; c++) {
          let gid;
          if (ro === 0) gid = (c + delta) & 0xffff;
          else {
            const gp = rangeBase + s * 2 + ro + (c - start) * 2;
            gid = gp + 2 <= cmap.length ? cmap.readUInt16BE(gp) : 0;
            if (gid) gid = (gid + delta) & 0xffff;
          }
          if (gid) out.add(c);
        }
      }
    }
  }
  return out;
}

export function cmapChars(file) {
  return new Set([...readWoff2Cmap(file)].map((c) => String.fromCodePoint(c)));
}

// ---------------------------------------------------------------- text extraction
/** Remove // and block comments from TS/JS/CSS while keeping every string / template literal intact. */
export function stripCodeComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += c; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i++]; }
        else if (q !== '`' && src[i] === '\n') break; // unterminated: bail out of the "string"
        out += src[i++];
      }
      if (i < n) out += src[i++];
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * YAML narration/data: drop whole-line comments and the `# …` tail, and the fields that are never displayed:
 * `norm:` (the TTS input spelling — a homophone is fine there) and `notes:` (author remarks). Both the block
 * form (`norm: 值`) and the flow form (`{id: x, text: y, norm: z, notes: '…'}`) are handled.
 */
export function stripYamlComments(src) {
  const hidden = /(^\s*(?:-\s+)?|[{,]\s*)(norm|notes|note|source|src):\s*('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^,}\n]*)/g;
  return src.split('\n').filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/\s#\s.*$/, '').replace(hidden, '$1')).join('\n');
}

export function chars(text, re = CJK_RE) {
  return new Set((text.match(re) ?? []).filter((c) => !IGNORE.has(c)));
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '_takes', 'tests', 'e2e', 'validate', 'tools', 'dev', '__snapshots__', 'proto-out', '.context']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.css']);
const DATA_EXT = new Set(['.json', '.txt']);
const YAML_EXT = new Set(['.yaml', '.yml']);

function* walk(dir, { allowTools = false } = {}) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) && !(allowTools && e.name === 'tools')) continue;
      yield* walk(p, { allowTools });
    } else yield p;
  }
}

/**
 * Collect the characters of everything displayed. Returns { set: Set<string>, byFile: Map<string, Set<string>> }.
 * `extraFiles` are plain-text files (display-text.txt style) read verbatim.
 */
export function scanRoots(root, { includeSpecs = false, extraFiles = [] } = {}) {
  const byFile = new Map();
  const add = (file, text) => {
    const s = chars(text);
    if (s.size) byFile.set(path.relative(root, file), s);
  };
  const read = (f) => fs.readFileSync(f, 'utf8');
  // site/** and kit/**: string literals in code, data files, html, game.json
  for (const base of ['site', 'kit']) {
    for (const f of walk(path.join(root, base))) {
      const ext = path.extname(f);
      const rel = path.relative(root, f);
      if (/\.(test|spec)\.(ts|js|mjs)$/.test(f) || /\.generated\.ts$/.test(f)) continue;
      if (rel.startsWith(path.join('kit', 'ui')) && /emblems|icons/.test(f)) continue;
      if (CODE_EXT.has(ext)) add(f, stripCodeComments(read(f)));
      else if (ext === '.html') add(f, read(f).replace(/<!--[\s\S]*?-->/g, ''));
      else if (ext === '.json' && !/package|tsconfig|manifest\.json$/.test(f)) add(f, read(f));
      else if (ext === '.txt') add(f, read(f));
      else if (YAML_EXT.has(ext)) add(f, stripYamlComments(read(f)));
    }
  }
  // content/** (levels, banks, narration yaml, lines.json, display-text.txt) — never markdown notes
  for (const f of walk(path.join(root, 'content'))) {
    const ext = path.extname(f);
    if (DATA_EXT.has(ext)) add(f, read(f));
    else if (YAML_EXT.has(ext)) add(f, stripYamlComments(read(f)));
  }
  // narration prototypes that are not under content/ yet (tools/<game>/proto/narration*.yaml)
  const toolsDir = path.join(root, 'tools');
  for (const f of walk(toolsDir, { allowTools: true })) {
    if (/\/proto\/(narration[^/]*\.yaml|lines\.json)$/.test(f.replaceAll(path.sep, '/'))) add(f, f.endsWith('.json') ? read(f) : stripYamlComments(read(f)));
  }
  // curated seed list kept next to the tool
  const seed = path.join(root, 'tools', 'fonts', 'extra-chars.txt');
  if (fs.existsSync(seed)) add(seed, read(seed).split('\n').filter((l) => !l.startsWith('#')).join('\n'));
  for (const f of extraFiles) add(path.resolve(f), /\.ya?ml$/.test(f) ? stripYamlComments(read(f)) : read(f));
  if (includeSpecs) {
    for (const f of walk(path.join(root, 'docs', 'specs'))) if (f.endsWith('.md')) add(f, read(f));
  }
  const set = new Set();
  for (const s of byFile.values()) for (const c of s) set.add(c);
  return { set, byFile };
}

/** Characters of `wanted` that are not in `have` (ideographs by default; pass punctuation=true to include it). */
export function missingFrom(wanted, have, { punctuation = false } = {}) {
  const ideo = new RegExp(IDEOGRAPH_RE.source, 'u');
  const out = [];
  for (const c of wanted) {
    if (!punctuation && !ideo.test(c)) continue;
    if (!have.has(c)) out.push(c);
  }
  return out.sort();
}

/** Which files use a character (for the report). */
export function filesUsing(byFile, ch, limit = 3) {
  const out = [];
  for (const [f, s] of byFile) if (s.has(ch)) { out.push(f); if (out.length >= limit) break; }
  return out;
}
