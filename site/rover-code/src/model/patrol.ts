import { createRng } from '@kit/rng';
import { DEFAULT_CONFIG, act, atGoal, parseLevel, startState, type Card, type Level, type State } from './sim';

/**
 * 月面巡逻: a new little level every time, made on the spot from a seed and always checked: a breadth-first search over the same
 * moves the child has proves it can be solved and says how few cards it takes, which is also the star rule (the fewest = 3 stars).
 */
export type Tier = 1 | 2 | 3;
export const TIERS: Record<Tier, { label: string; W: number; H: number; rocks: [number, number]; samples: number; min: [number, number] }> = {
  1: { label: '轻松', W: 4, H: 4, rocks: [2, 4], samples: 0, min: [4, 7] },
  2: { label: '普通', W: 5, H: 4, rocks: [4, 7], samples: 1, min: [6, 10] },
  3: { label: '挑战', W: 6, H: 5, rocks: [6, 10], samples: 2, min: [9, 15] },
};

/** the fewest cards (flat, no loops) that get the rover home, with one way to do it; null when there is none within the depth */
export function shortest(lv: Level, alphabet: readonly Card[], maxDepth = 24): { n: number; prog: string } | null {
  const key = (s: State) => `${s.x},${s.y},${s.d},${s.m}`;
  const s0 = startState(lv);
  if (atGoal(lv, s0)) return null;
  const seen = new Set([key(s0)]);
  let frontier: { s: State; p: string }[] = [{ s: s0, p: '' }];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const { s, p } of frontier) for (const a of alphabet) {
      const r = act(lv, DEFAULT_CONFIG, s, a);
      if (r.err) continue;
      if (atGoal(lv, r.s)) return { n: depth, prog: p + a };
      const k = key(r.s);
      if (!seen.has(k)) { seen.add(k); next.push({ s: r.s, p: p + a }); }
    }
    frontier = next;
  }
  return null;
}

export function generatePatrol(seed: string, tier: Tier): Level {
  const T = TIERS[tier];
  const cards: Card[] = T.samples ? ['F', 'L', 'R', 'P'] : ['F', 'L', 'R'];
  for (let attempt = 0; attempt < 400; attempt++) {
    const rng = createRng(`patrol:${tier}:${seed}:${attempt}`);
    const grid = Array.from({ length: T.H }, () => Array<string>(T.W).fill('.'));
    const cells = rng.shuffle(Array.from({ length: T.W * T.H }, (_, i) => i));
    const take = () => cells.pop()!;
    const at = (i: number) => ({ x: i % T.W, y: Math.floor(i / T.W) });
    const st = at(take()), go = at(take());
    if (Math.abs(st.x - go.x) + Math.abs(st.y - go.y) < 3) continue;
    grid[st.y][st.x] = rng.pick(['^', '>', 'v', '<']);
    grid[go.y][go.x] = 'G';
    const rocks = rng.int(T.rocks[0], T.rocks[1]);
    for (let k = 0; k < rocks; k++) { const c = at(take()); grid[c.y][c.x] = rng.chance(0.3) ? 'o' : '#'; }
    for (let k = 0; k < T.samples; k++) { const c = at(take()); grid[c.y][c.x] = 'a'; }
    const map = grid.map((r) => r.join(''));
    const draft = parseLevel({ id: 'draft', kind: 'grid', brief: '', ch: 0, n: 0, role: '', title: '', teach: '', cards, slots: 30, expectMin: 0, map, solution: { main: '' } });
    const best = shortest(draft, cards);
    if (!best || best.n < T.min[0] || best.n > T.min[1]) continue;
    return parseLevel({
      id: `patrol-${tier}-${seed}`, kind: 'grid', brief: '巡逻任务：开到小旗那里。', ch: 0, n: 0, role: '', title: `月面巡逻 · ${T.label}`,
      teach: T.samples ? '先想好路线，别忘了在亮点上采样。' : '先看看哪里能走，再排卡片。', cards, slots: best.n + 3, expectMin: best.n, map, solution: { main: best.prog },
    });
  }
  throw new Error(`patrol: no level for ${seed} tier ${tier}`); // cannot happen with these parameters; the tests would show it
}

/** today's patrol is the same for everyone on the same day */
export const dailySeed = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
