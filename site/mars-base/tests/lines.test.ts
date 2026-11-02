import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as linesModule from '../src/math/lines';
import { INTRO_COVERS_HOW, LINES, RUNTIME_LINES, V3_LINE_IDS, captionOf, hintId, howId, introId, line } from '../src/math/lines';
import { STAGES, questionsFor, sampleFor } from '../src/math/problems';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const yaml = fs.readFileSync(path.join(ROOT, 'content/narration/mars-arithmetic.yaml'), 'utf8');
const yamlLines = [...yaml.matchAll(/\{id: ([^,]+), role: (\w+), text: ([^}]+?)(?:, norm: ([^}]+))?\}$/gm)].map((m) => ({ id: m[1], role: m[2], text: m[3], norm: m[4] }));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/mars-arithmetic/audio-manifest-v2.json'), 'utf8')) as Record<string, { text: string; src: string }>;

describe('narration lines', () => {
  it('every sentence is plain Chinese: no Latin letters, no pinyin, no digits', () => {
    for (const [id, text] of Object.entries(LINES)) {
      expect(text, id).not.toMatch(/[A-Za-z0-9]/);
      expect(text, id).toMatch(/^[一-鿿，。？！、]+$/);
    }
  });
  it('existing recordings still say exactly what the table says', () => {
    for (const [id, clip] of Object.entries(manifest)) expect(LINES[id], id).toBe(clip.text);
  });
  it('content/narration/mars-arithmetic.yaml holds exactly the 60 runtime sentences, once each, in the companion voice (role companion = pinyin-station robot, voice A), and the manifest has one clip for each', () => {
    const byId = new Map(yamlLines.map((l) => [l.id, l]));
    expect(byId.size).toBe(yamlLines.length);
    for (const [id] of Object.entries(RUNTIME_LINES)) { expect(byId.get(id), id).toBeTruthy(); expect(byId.get(id)!.text.trim(), id).toBe(LINES[id]); expect(byId.get(id)!.role, id).toBe('companion'); }
    for (const l of yamlLines) expect(LINES[l.id], l.id).toBeDefined();
    expect(yamlLines.map((l) => l.id).sort()).toEqual(Object.keys(RUNTIME_LINES).sort());
    expect(Object.keys(manifest)).toEqual(yamlLines.map((l) => l.id));
  });
});

describe('round 3: the robot says whole sentences only (no numbers, no spliced clips)', () => {
  const runtime = Object.entries(RUNTIME_LINES);
  it('every sentence the app can say is in the table and the yaml', () => {
    for (const [id] of runtime) { expect(LINES[id], id).toBeTruthy(); expect(yamlLines.some((l) => l.id === id), `yaml ${id}`).toBe(true); }
    expect(runtime.length).toBeGreaterThanOrEqual(60);
  });
  it('each one: no digits, no Latin letters, no 余 (the child has not met the word), at least 6 characters, 几 only inside the old sentences that already had it', () => {
    const OLD_WITH_JI = ['ma.hint.mul', 'ma.hint.div', 'ma.place.start'];
    for (const [id] of runtime) {
      const text = LINES[id];
      expect(text, id).not.toMatch(/[0-9A-Za-z]/);
      expect(text, id).not.toContain('余');
      expect(text.length, id).toBeGreaterThanOrEqual(6);
      expect(text, id).toMatch(/[，。？！]$|[一-鿿]$/);
      if (text.includes('几')) expect(OLD_WITH_JI, `${id} says 几`).toContain(id);
    }
  });
  it('the old atoms and the changed sentences are not used any more; their ids keep the old text (a changed text has a new id)', () => {
    const unused = Object.keys(LINES).filter((id) => !(id in RUNTIME_LINES)).sort();
    expect(unused).toEqual(['ma.answer', 'ma.ask', 'ma.ask.fill', 'ma.ask.rem', 'ma.blank', 'ma.cmp.gt', 'ma.cmp.lt', 'ma.eq', 'ma.hint.rem', 'ma.intro.rem', 'ma.op.add', 'ma.op.div', 'ma.op.mul', 'ma.op.sub', 'ma.rem', 'ma.res.faster', 'ma.res.more', 'ma.res.used', 'ma.sprint.bestis', 'ma.sprint.start', 'ma.unit.q', 'ma.unit.sec', 'ma.vs']);
    for (const id of unused) { expect(yamlLines.some((l) => l.id === id), `${id} is gone from the yaml`).toBe(false); expect(id in manifest, `${id} is gone from the manifest`).toBe(false); }
    expect(LINES['ma.ask.fill']).toBe('填几？'); expect(LINES['ma.ask.rem']).toBe('商是几，余几？'); expect(LINES['ma.sprint.start']).toBe('超频开始！十道题，做完记用时。'); expect(LINES['ma.res.more']).toBe('这次比以前最好的多对了');
    expect(V3_LINE_IDS.every((id) => id in RUNTIME_LINES)).toBe(true);
    expect(LINES['ma.how.fill']).toBe('方框里填多少？'); expect(LINES['ma.how.rem']).toBe('商是多少，还剩多少？'); expect(LINES['ma.sprint.start2']).toBe('超频开始！十道题，做完看用时。'); expect(LINES['ma.res.more2']).toBe('这次比以前多对了。'); expect(LINES['ma.place.same']).toBe('测完了。你已经开启得更远了，这里保持不变。');
  });
  it('whatever the helpers pick for any problem of any stage is a runtime sentence', () => {
    const seen = new Set<string>();
    for (const stage of STAGES) for (let round = 1; round <= 12; round++) for (const p of [...questionsFor(stage, round), sampleFor(stage, `l:${round}`, round)]) {
      for (const id of [howId(p), hintId(stage, p), introId(stage)]) if (id) { expect(RUNTIME_LINES[id], `${stage.id} ${id}`).toBeTruthy(); seen.add(id); }
      expect(captionOf([line(howId(p))])).not.toMatch(/\d/);
    }
    for (const id of INTRO_COVERS_HOW) expect(RUNTIME_LINES[id]).toBeTruthy();
    for (const kind of ['ma.how.calc', 'ma.how.fill', 'ma.how.rem', 'ma.how.two', 'ma.ask.cmp']) expect([...seen]).toContain(kind);
  });
  it('the helpers that built number / operator clips are gone', () => {
    for (const name of ['num', 'numId', 'opWord', 'exprToks', 'questionToks', 'answerToks', 'NUMBER_MANIFEST_SMALL', 'NUMBER_MANIFEST_BIG']) expect(name in linesModule, name).toBe(false);
  });
  it('a caption is the sentences as written, joined without anything added', () => {
    expect(captionOf([line('ma.warm'), line('ma.step.part.1')])).toBe(`${LINES['ma.warm']}${LINES['ma.step.part.1']}`);
  });
});
