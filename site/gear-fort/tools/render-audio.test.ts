// V16 companion (spec §7.2 "听得见的替代"): render every sound effect, both themes and all stingers to 16-bit WAV in
// ~/kid-games-work/audio-review/gear-fort/ with an index.html, for dad to audition on headphones (asynchronously).
// NEVER played on this Mac. Gated: GF_AUDIO=1 npx vitest run site/gear-fort/tools/render-audio.test.ts
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RECIPES, renderSfx, renderNotes, SR, type Inst } from '../src/audio/synth';
import { wav, lufs, peakDb, centroid } from '../src/audio/analysis';
import { MAP_THEME, STORY_THEME, STINGERS, scoreOf, stingerScore } from '../src/audio/themes';
import { MUSIC_GAIN } from '../src/audio/music';

describe.skipIf(!process.env.GF_AUDIO)('render audio for review', () => {
  it('writes WAVs + index.html + metrics.json', () => {
    const dir = join(homedir(), 'kid-games-work/audio-review/gear-fort'); mkdirSync(join(dir, 'sfx'), { recursive: true }); mkdirSync(join(dir, 'music'), { recursive: true });
    const rows: { file: string; kind: string; sec: number; peak: number; lufs?: number; centroid?: number; loop?: boolean }[] = [];
    for (const id of Object.keys(RECIPES)) {
      const b = renderSfx(id); const f = `sfx/${id}.wav`; writeFileSync(join(dir, f), wav(RECIPES[id].loop ? new Float32Array([...b, ...b, ...b]) : b));
      rows.push({ file: f, kind: 'sfx', sec: b.length / SR, peak: +peakDb(b).toFixed(2), centroid: Math.round(centroid(b)), loop: !!RECIPES[id].loop });
    }
    const inst: Partial<Record<Inst, Float32Array<ArrayBuffer>>> = {};
    for (const [name, sc] of [['theme-map', scoreOf(MAP_THEME, 1)], ['theme-story', scoreOf(STORY_THEME, 1)], ...Object.keys(STINGERS).map((k) => [`stinger-${k}`, stingerScore(k)] as const)] as const) {
      const b = renderNotes(sc.evs, sc.len + 2.5, MUSIC_GAIN, inst); const f = `music/${name}.wav`; writeFileSync(join(dir, f), wav(b));
      rows.push({ file: f, kind: 'music', sec: +(b.length / SR).toFixed(2), peak: +peakDb(b).toFixed(2), lufs: +lufs(b).toFixed(2) });
    }
    writeFileSync(join(dir, 'metrics.json'), JSON.stringify(rows, null, 1));
    writeFileSync(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>机关守城 · 声音试听</title><style>body{font:15px system-ui;margin:24px;max-width:900px}td{padding:4px 10px;border-bottom:1px solid #ddd}audio{height:28px}</style>
<h1>机关守城 · 声音试听（${rows.length} 条）</h1><p>全部由 site/gear-fort/src/audio/synth.ts 本机合成（确定性）。音效峰值 −3 dBFS；主题按页面音量（0.35）渲染，目标 −24 LUFS。循环音（loop）重复 3 次。请戴耳机、小音量试听。</p>
<table>${rows.map((r) => `<tr><td>${r.file}</td><td>${r.sec.toFixed(2)} s</td><td>${r.peak} dBFS</td><td>${r.lufs != null ? r.lufs + ' LUFS' : (r.centroid + ' Hz' + (r.loop ? ' · loop' : ''))}</td><td><audio controls preload="none" src="${r.file}"></audio></td></tr>`).join('')}</table>`);
    expect(rows.length).toBeGreaterThan(45);
    console.log(rows.filter((r) => r.kind === 'music').map((r) => `${r.file} ${r.lufs} LUFS peak ${r.peak}`).join('\n'));
  });
});
