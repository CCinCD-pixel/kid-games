/**
 * V4 + V10 depth (spec §9.2), ported from the prototype's export-content.mjs checks so a content edit in the repo
 * (the v2 "add data + run validators" path) is checked here, not only in the prototype:
 *   V4  chapter roles (7 = boss, 8 = breather, ch 1 opens with start), every authored point inside R−60 (sleepers R−30),
 *       ring–rock clearance ≥ 15 wu, ≤ 1 time star (none on first-run / breather levels), 'clear' only c1m1/c1m2,
 *       title ≤ 6 / teaches ≤ 20 chars, new elements only in a chapter's first two levels (chapter 1 free),
 *       tactic-kill objectives carry tags, skin facts ≤ 24, 长 pinyin locks, 4 × 3 trophies with known conditions,
 *       collection unlock references resolve (venues, chapters, missions)
 *   V10 ids unique, every mission has brief + h1, subtitles ≤ 15 chars (facts ≤ 24), TONE_RULES on every
 *       player-facing string, no unfilled {template} reaches the screen (every template id is said with vars),
 *       the recorded-clip manifest covers every line (once the voice step has run)
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '../src/sim/mission';
import { VENUES, VENUE_IDS, TROPHIES, AI_NAMES } from '../src/sim/venues';
// @ts-expect-error -- plain ESM helper (platform tool), read-only use
import { lintTone } from '../../../tools/check-content.mjs';
import collection from '../../../content/snake-battle/collection.json';
import linesJson from '../../../content/snake-battle/lines.json';

const ROOT = path.resolve(__dirname, '../../..');
type Line = { id: string; role: string; text: string; norm?: string; pinyin?: Record<string, string> };
const LINES = linesJson as Line[];
type It = { id: string; name: string; fact?: string; unlock?: Record<string, unknown>; cond?: Record<string, unknown> };
const C = collection as unknown as { skins: It[]; crown: It; trails: It[]; badges: It[] };
const len = (s: string) => [...s].length;

describe('V4 content depth', () => {
  it('chapter roles: 7 = boss, 8 = breather', () => {
    for (let ch = 1; ch <= 5; ch++) {
      const ms = MISSIONS.filter((m) => m.ch === ch);
      expect(ms.length).toBe(8);
      expect(ms[6].role, `ch${ch} level 7`).toBe('boss');
      expect(ms[7].role, `ch${ch} level 8`).toBe('breather');
    }
  });
  it('geometry: points inside R−60 (sleepers R−30), rings clear rocks by ≥ 15 wu', () => {
    const bad: string[] = [];
    for (const m of MISSIONS) {
      const R = (m.arena as { R: number }).R; const pts: [string, number[], number?][] = [];
      for (const p of m.objective.points ?? []) pts.push(['ring', p]);
      for (const o of m.arena.obstacles ?? []) pts.push(['rock', [o.x, o.y], o.r]);
      for (const p of (m.arena as { markers?: number[][] }).markers ?? []) pts.push(['marker', p]);
      if (m.player.at) pts.push(['player', m.player.at]);
      for (const a of m.ai) { if (a.at) pts.push(['ai', a.at]); for (const p of a.route ?? []) pts.push(['route', p]); for (const p of a.path ?? []) pts.push(['sleeper', p]); }
      for (const [k, p, rr] of pts) { const lim = k === 'sleeper' ? R - 30 : R - 60 - (rr ?? 0); if (Math.hypot(p[0], p[1]) > lim + 1e-6) bad.push(`${m.id}: ${k} (${p[0]},${p[1]}) outside`); }
      if (m.objective.type === 'rings') for (const p of m.objective.points!) for (const o of m.arena.obstacles ?? []) { const c = Math.hypot(p[0] - o.x, p[1] - o.y) - (m.objective.radius ?? 0) - o.r; if (c < 15) bad.push(`${m.id}: ring clears rock by ${c.toFixed(0)}`); }
    }
    expect(bad).toEqual([]);
  });
  it('stars, titles, teaches, new elements, tactic tags', () => {
    const bad: string[] = [];
    for (const m of MISSIONS) {
      const times = m.stars.filter((c) => c.type === 'timeLE').length;
      if (times > 1) bad.push(`${m.id}: ${times} time stars`);
      if (times && (['c1m1', 'c1m2', 'c1m3'].includes(m.id) || m.role === 'breather')) bad.push(`${m.id}: time star on a first-run / breather level`);
      if (m.stars.some((c) => c.type === 'clear') && !['c1m1', 'c1m2'].includes(m.id)) bad.push(`${m.id}: 'clear' star`);
      if (len(m.title) > 6) bad.push(`${m.id}: title > 6`);
      if (len(m.teaches) > 20) bad.push(`${m.id}: teaches > 20`);
      if (m.newElement && !(m.ch === 1 || /m[12]$/.test(m.id))) bad.push(`${m.id}: new element late in the chapter`);
      if (['kill', 'streak'].includes(m.objective.type) && m.ai.some((a) => a.target || a.king) && m.ch >= 3 && !m.objective.tags && !m.objective.tag && !m.objective.minRatio) bad.push(`${m.id}: tactic kill without tags`);
    }
    expect(bad).toEqual([]);
  });
  it('collection: facts ≤ 24, unlock references resolve; 4 × 3 trophies with known conditions', () => {
    const bad: string[] = [];
    for (const k of [...C.skins, ...C.trails, C.crown]) if (k.fact && len(k.fact) > 24) bad.push(`${k.id}: fact > 24`);
    const missions = new Set(MISSIONS.map((m) => m.id));
    for (const k of [...C.skins, ...C.trails, ...C.badges, C.crown]) {
      const c = (k.unlock ?? k.cond ?? {}) as { venue?: string; ch?: number; id?: string };
      if (c.venue && !VENUE_IDS.includes(c.venue as never)) bad.push(`${k.id}: unknown venue ${c.venue}`);
      if (c.ch && !(c.ch >= 1 && c.ch <= 5)) bad.push(`${k.id}: unknown chapter ${c.ch}`);
      if (c.id && /^c\dm\d$/.test(c.id) && !missions.has(c.id)) bad.push(`${k.id}: unknown mission ${c.id}`);
    }
    expect(Object.keys(TROPHIES).sort()).toEqual([...VENUE_IDS].sort());
    for (const [v, ts] of Object.entries(TROPHIES as Record<string, { id: string; cond: Record<string, number> }[]>)) {
      if (ts.length !== 3) bad.push(`trophies ${v}: ${ts.length}`);
      for (const t of ts) if (!Object.keys(t.cond).every((k) => ['rankLE', 'killsGE', 'cutGE', 'peakGE'].includes(k))) bad.push(`trophy ${v}.${t.id}: bad cond`);
    }
    expect(bad).toEqual([]);
  });
  it('长 polyphones carry a pinyin lock', () => {
    expect(LINES.filter((l) => /长到|长多/.test(l.text) && !l.pinyin).map((l) => l.id)).toEqual([]);
  });
});

describe('V10 lines depth', () => {
  it('ids unique; every mission has brief + h1', () => {
    const ids = LINES.map((l) => l.id); expect(new Set(ids).size).toBe(ids.length);
    const set = new Set(ids);
    expect(MISSIONS.flatMap((m) => ['brief', 'h1'].map((k) => `snake.m.${m.id}.${k}`)).filter((id) => !set.has(id))).toEqual([]);
  });
  it('yaml → code: every recorded line has a trigger (QA r4: 17 lines shipped but were never played)', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'dev') walk(p); } else if (/\.ts$/.test(f.name) && !/\.test\.ts$/.test(f.name)) files.push(p); } };
    walk(path.join(ROOT, 'site/snake-battle/src'));
    for (const f of ['missions', 'collection', 'venues']) files.push(path.join(ROOT, `content/snake-battle/${f}.json`));
    const tokens = new Set<string>(), prefixes: string[] = [];
    // a token followed by `${` or `' +` is a template prefix (`snake.story.c${ch}`, 'snake.lobby.hello.' + n); the bare
    // game prefix is not
    for (const f of files) for (const mt of fs.readFileSync(f, 'utf8').matchAll(/(snake\.[a-z0-9_.]+)(\$\{|['"`] *\+)?/g)) {
      if (mt[2] && mt[1].split('.').length >= 3) prefixes.push(mt[1]); else tokens.add(mt[1]);
    }
    const ALLOW = new Set<string>([]);   // lines kept on purpose without a trigger (none in v1)
    const dead = LINES.map((l) => l.id).filter((id) => !ALLOW.has(id) && !tokens.has(id) && !prefixes.some((p) => id.startsWith(p)));
    expect(dead).toEqual([]);
  });
  it('subtitles ≤ 15 chars (facts ≤ 24), templates filled with a 3-char name', () => {
    const long = LINES.filter((l) => len(l.text.replace(/\{[a-z]+\}/g, '小步步')) > (l.id.startsWith('snake.fact.') ? 24 : 15)).map((l) => `${l.id} "${l.text}"`);
    expect(long).toEqual([]);
  });
  it('TONE_RULES on every player-facing string', () => {
    const texts = [...LINES.flatMap((l) => [l.text, l.norm].filter(Boolean) as string[]), ...MISSIONS.flatMap((m) => [m.title, m.teaches]),
      ...C.skins.map((s) => s.name), ...C.trails.map((t) => t.name), ...C.badges.map((b) => b.name), ...Object.values(VENUES).map((v) => v.name),
      ...AI_NAMES.colors.flatMap((c) => Object.values(AI_NAMES.persona).map((p) => c + p))];
    const bad = texts.flatMap((t) => (lintTone(t) as string[]).map((p) => `${t}: ${p}`));
    expect(bad).toEqual([]);
  });
  it('every templated line is said with vars (no raw {name} on screen — QA r1)', () => {
    const tmpl = LINES.filter((l) => /\{[a-z]+\}/.test(l.text)).map((l) => l.id);
    const src = ['app.ts', 'screens.ts', 'screens2.ts', 'hud.ts'].map((f) => fs.readFileSync(path.join(ROOT, 'site/snake-battle/src', f), 'utf8')).join('\n');
    const bad: string[] = [];
    for (const id of tmpl) {
      const prefix = id.replace(/\.[^.]+$/, '.');
      const calls = [...src.matchAll(/say(?:Capped)?\(([^;]*?)\)/g)].map((m) => m[1]).filter((a) => a.includes(`'${id}'`) || a.includes(`\`${id}\``) || a.includes(`\`${prefix}\${`) || a.includes(`\`snake.unlock.\${`));
      if (calls.length && calls.some((a) => !a.includes('vars'))) bad.push(`${id}: ${calls.find((a) => !a.includes('vars'))}`);
    }
    expect(bad).toEqual([]);
  });
  it('the recorded-clip manifest covers every line and every clip exists (voice step)', () => {
    const mf = path.join(ROOT, 'public/audio/snake-battle/audio-manifest.json');
    if (!fs.existsSync(mf)) return;   // before the voice step: text manifest only
    const m = JSON.parse(fs.readFileSync(mf, 'utf8')) as Record<string, { src: string; text: string }>;
    expect(LINES.filter((l) => !m[l.id]).map((l) => l.id)).toEqual([]);
    const missing = Object.values(m).filter((e) => !fs.existsSync(path.join(ROOT, 'public', e.src))).map((e) => e.src);
    expect(missing).toEqual([]);
  });
  it('the game loads the clip manifest (audio.ts → addManifest)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'site/snake-battle/src/audio.ts'), 'utf8');
    expect(src).toMatch(/addManifest\(CLIP_MANIFEST\)/);
    expect(src).toMatch(/CLIP_MANIFEST = '\/audio\/snake-battle\/audio-manifest\.json'/);
  });
});
