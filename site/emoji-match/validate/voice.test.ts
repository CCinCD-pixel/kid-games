/**
 * Narration loading contract (spec §7.4, QA r1): with voice.json `clips:false` no /audio/emoji-match/
 * request is made (subtitles + system voice only); with `clips:true` the generated manifest is merged.
 * The shipped state (clips:true, 113 clips present) is checked end to end in tests/play.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const added: string[] = [];
const voiceFlag = { clips: false };

vi.mock('@kit/narration', () => ({
  Narrator: class {
    constructor(public o: unknown) {}
    addManifest(url: string) { added.push(url); return Promise.resolve(); }
    say() { return Promise.resolve('done'); }
    text() { return ''; }
    stop() {}
  },
}));
vi.mock('../src/content', () => ({
  LINES: [{ id: 'em.start.1', text: '星晶号准备起飞！', role: 'companion' }],
  get VOICE() { return voiceFlag; },
}));

describe('voice.ts manifest loading', () => {
  beforeEach(() => { added.length = 0; });
  it('clips:false → no /audio request', async () => {
    voiceFlag.clips = false;
    const { createVoice } = await import('../src/voice');
    createVoice({ test: true });
    expect(added).toEqual([]);
  });
  it('clips:true → the generated manifest is merged', async () => {
    voiceFlag.clips = true;
    const { createVoice } = await import('../src/voice');
    createVoice({ test: true });
    expect(added).toEqual(['/audio/emoji-match/audio-manifest.json']);
  });
  it('the shipped voice.json has clips:true (voice step done)', async () => {
    const real = await vi.importActual<{ default: { clips: boolean } }>('../../../content/emoji-match/voice.json');
    expect(real.default.clips).toBe(true);
  });
});
