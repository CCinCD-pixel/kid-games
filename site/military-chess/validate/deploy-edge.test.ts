/** §3.13 E30: a deploy-item placement that leaves the remaining pieces nowhere to go is refused. */
import { describe, expect, test } from 'vitest';
import { placementVerdict, slotOf } from '../src/core/layout';
import { ALL_ITEMS, TEMPLATES, type DeployItem } from '../src/content';

describe('deploy items (S5 / L7)', () => {
  test('E30: placing a piece that leaves no slot for the rest → keep (refused); the real answer is accepted', () => {
    const it = ALL_ITEMS.find((i) => i.id === 'L7-2') as DeployItem;
    const base = TEMPLATES.find((t) => t.id === it.template)!.layout.split('');
    const idxs = it.blanks.map(([r, c]) => slotOf(r, c));
    const rest = it.place.slice();
    // 3 mines need the 3 back-row blanks: a 旅长 on one of them strands a mine
    const back = it.blanks.findIndex(([r]) => r === 6);
    expect(placementVerdict(base, idxs, new Map(), rest, '7', idxs[back])).toBe('keep');
    // a mine there is fine; a mine in the front rows breaks its own rule (not 'keep')
    expect(placementVerdict(base, idxs, new Map(), rest, 'M', idxs[back])).toBeNull();
    const front = it.blanks.findIndex(([r]) => r < 5);
    expect(placementVerdict(base, idxs, new Map(), rest, 'M', idxs[front])).toBe('mine');
  });
});
