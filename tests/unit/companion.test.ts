import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The companion module touches the DOM only when mounted; import its mood list via source text so
// this lint runs in Node without a DOM.
const SRC = fs.readFileSync(path.resolve(__dirname, '../../kit/companion/index.ts'), 'utf8');

describe('companion house rules (plan §4.4)', () => {
  it('has no sad / crying / disappointed mood', () => {
    const moods = /export const MOODS[^=]*=\s*\[([^\]]*)\]/.exec(SRC)![1];
    expect(moods).not.toMatch(/sad|cry|upset|disappoint|lonely|angry/i);
    expect(SRC).not.toMatch(/['"](sad|crying|disappointed|lonely)['"]/);
  });

  it('API matches the 星港 design-system companion (drop-in swap)', () => {
    for (const name of ['export function mount', 'setMood(', 'say(', 'hush(', 'react(', 'lookAt(', 'destroy(']) expect(SRC).toContain(name);
    expect(SRC).toContain("'idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy'");
  });
});
