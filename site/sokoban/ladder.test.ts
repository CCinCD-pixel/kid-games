/**
 * Hint ladder bookkeeping (QA r3): the result card's 用了 N 次提示 counts hints that were actually
 * shown — taps swallowed by the 4 s cool-down (or while a hint is being answered) do not count.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kit/ui', () => ({ setHintReady: () => {} }));
vi.mock('./src/audio/sfx', () => ({ playSfx: () => {} }));

import { HintLadder, type LadderHost } from './src/hints/ladder';

function fakeBtn(): HTMLButtonElement {
  const cls = new Set<string>();
  return {
    addEventListener: () => {},
    classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c), contains: (c: string) => cls.has(c) },
    offsetWidth: 0,
    dataset: {},
  } as unknown as HTMLButtonElement;
}

function host(): { h: LadderHost; rings: number[] } {
  const rings: number[] = [];
  const session = { solved: false, player: 5, crates: Uint16Array.from([12]), crateAt: (cell: number) => (cell === 12 ? 0 : -1) };
  const board = {
    demoRunning: false,
    clearHints: () => {},
    crateCenterPage: () => ({ x: 0, y: 0 }),
    glance: () => {},
    showHintRing: async (slot: number) => {
      rings.push(slot);
    },
  };
  const h = {
    ctx: { test: true, client: { hint: async () => ({ slotCell: 12, dir: 1, kind: 'normal' }) } },
    def: { ch: 2 },
    session,
    board,
    strip: { say: async () => {} },
    busy: () => false,
    setDemo: () => {},
    offerRewind: () => {},
    rewindTo: async () => {},
  } as unknown as LadderHost;
  return { h, rings };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hint ladder', () => {
  it('three quick 💡 taps give one hint and count one (cool-down taps only nudge)', async () => {
    let now = 100_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { h, rings } = host();
    const ladder = new HintLadder(h, fakeBtn(), 30_000);
    const first = ladder.press();
    now += 800;
    await ladder.press(); // still answering the first press → ignored
    await first;
    now += 800;
    await ladder.press(); // inside the 4 s cool-down → nudge only
    expect(rings).toEqual([0]);
    expect(ladder.usedMax).toBe(1);
    expect(ladder.given).toBe(1);
    ladder.destroy();
  });
});
