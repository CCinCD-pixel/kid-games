import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The companion modules touch the DOM only when mounted; lint their source text so this runs in
// Node without a DOM.
const INDEX = fs.readFileSync(path.resolve(__dirname, '../../kit/companion/index.ts'), 'utf8');
const ART = fs.readFileSync(path.resolve(__dirname, '../../kit/companion/art.ts'), 'utf8');

describe('companion house rules (plan §4.4)', () => {
  it('has no sad / crying / disappointed mood', () => {
    for (const src of [INDEX, ART]) {
      const moods = /export const MOODS[^=]*=\s*\[([^\]]*)\]/.exec(src)![1];
      expect(moods).not.toMatch(/sad|cry|upset|disappoint|lonely|angry/i);
      expect(src.replace(/sad moods are intentionally unsupported/, '')).not.toMatch(/['"](sad|crying|disappointed|lonely)['"]/);
    }
    // aliases map only to the seven cheerful moods
    const alias = /const ALIAS[^=]*=\s*\{([^}]*)\}/.exec(ART)![1];
    expect(alias).not.toMatch(/sad|cry|upset|disappoint/i);
  });

  it('kit entry keeps the documented API (drop-in for games written against the stub)', () => {
    expect(INDEX).toContain('export function mount');
    expect(INDEX).toContain('export async function sayLine');
    expect(INDEX).toContain("['idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy']");
    for (const name of ['setMood(', 'say(', 'hush(', 'react(', 'lookAt(', 'destroy(']) expect(ART).toContain(name);
    expect(ART).toContain("'idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy'");
  });
});
