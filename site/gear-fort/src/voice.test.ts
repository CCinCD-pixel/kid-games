// 鲁班's own voice (K1, docs/VOICE.md role `luban`): every 鲁班 line has a clip of HIS role in the generated manifest, every
// clip path in the manifest resolves to a file, and his lines never fall back to another character's voice (they are not
// in the text manifest, so only his clips can voice them).
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { LINES } from './content';
import { textManifest } from './voice';

const ROOT = path.resolve(__dirname, '../../..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/audio/gear-fort/audio-manifest.json'), 'utf8')) as Record<string, { src: string; text: string; role?: string; durationMs: number }>;

describe('voice: 鲁班 speaks in his own voice', () => {
  const luban = Object.keys(LINES).filter((id) => LINES[id].role === 'luban');
  it('all 48 鲁班 lines have a role-luban clip whose subtitle is the line', () => {
    expect(luban.length).toBe(48);
    const bad = luban.filter((id) => !MAN[id] || MAN[id].role !== 'luban' || MAN[id].text !== LINES[id].text || !(MAN[id].durationMs > 500));
    expect(bad).toEqual([]);
  });
  it('no other line uses the luban role, and 墨子 stays dad', () => {
    expect(Object.entries(MAN).filter(([id, c]) => c.role === 'luban' && LINES[id]?.role !== 'luban').map(([id]) => id)).toEqual([]);
    expect(Object.entries(MAN).filter(([id, c]) => LINES[id]?.role === 'dad' && c.role !== 'dad').map(([id]) => id)).toEqual([]);
  });
  it('every manifest path resolves to a committed m4a', () => {
    const miss = Object.values(MAN).filter((c) => !/^\/audio\/gear-fort\/[^/]+\.[0-9a-f]{8}\.m4a$/.test(c.src) || !fs.existsSync(path.join(ROOT, 'public', c.src))).map((c) => c.src);
    expect(miss).toEqual([]);
  });
  it('鲁班 lines are absent from the text manifest (no system-voice / narrator fallback in his name)', () => {
    const tm = textManifest();
    expect(luban.filter((id) => id in tm)).toEqual([]);
  });
});

// QA r5 major (spec §8.6 audio buffers ≤6 MB): decoded narration is released outside a ~20 s window.
describe('voice: decoded narration stays bounded', () => {
  it('playing every clip in a row keeps ≤6 MB of decoded PCM (48 kHz mono float32)', async () => {
    const { clipLru, KEEP_MS } = await import('./voice');
    const lru = clipLru();
    let maxBytes = 0;
    const clips = Object.values(MAN);
    expect(clips.length).toBeGreaterThan(60);
    for (const c of [...clips, ...clips.slice(0, 80)]) {
      lru.touch(c.src, c.durationMs);
      maxBytes = Math.max(maxBytes, (lru.totalMs / 1000) * 48000 * 4);
      expect(lru.has(c.src)).toBe(true); // the line now playing is never released
    }
    expect(KEEP_MS).toBeLessThanOrEqual(25000);
    expect(maxBytes).toBeLessThan(6 * 1024 * 1024);
    expect(lru.size).toBeLessThan(15);
  });
  it('voice.ts releases everything outside the window from the kit clip cache', () => {
    const src = fs.readFileSync(path.join(__dirname, 'voice.ts'), 'utf8');
    expect(src).toMatch(/releaseClips\(drop\)/);
  });
});
