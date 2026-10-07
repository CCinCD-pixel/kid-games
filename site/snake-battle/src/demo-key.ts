/**
 * The key moment of a 示范 run (spec §5.1 table) — shared by the Node recorder (validate/record-demos.test.ts),
 * the Node replay check (validate/determinism.test.ts, V15) and the WebKit replay check (tests/demos.spec.ts, V15).
 * Pure observer: it reads the world after each step and never touches sim state (no rankNow() cache, no RNG).
 *
 *   crown levels    first gem hit by him
 *   rings           the hardest ring (closest to a rock / sleeping body)
 *   eat / length    first magnet (else first big food); meteor / drop variants: first of that kind
 *   pu              first pick-up of the level's kind
 *   survive         the closest approach to a hunter's head (a near-miss event if one is closer in time) — QA r1:
 *                   the EXPERT rarely triggers 'nearmiss', so 4 survive levels had no H2 clip
 *   race (no kills) the first overtake into the target rank (rank ≤ rankLE after 3 s)
 *   loop            the first marker
 *   kill/streak     first qualifying kill
 */
import type { Mission, MissionRun } from './sim/mission';
import type { SimEvent } from './sim/world';

type Note = { kind: string; t: number; n?: number };

export class KeyTracker {
  private notes: Note[] = [];
  private minD = Infinity; private minT: number | null = null;
  private overtakeT: number | null = null;
  constructor(private readonly m: Mission, private readonly run: MissionRun) {
    run.w.keepEvents = true;
    run.onNote = (n) => this.notes.push({ kind: n.kind, t: run.w.t, n: n.n });
  }
  /** call after every run.step() */
  sample() {
    const run = this.run, w = run.w, me = run.me, o = this.m.objective;
    if (o.type === 'survive' && me.alive && w.tick % 3 === 0 && w.t >= 2) {
      for (const s of w.snakes) {
        if (s === me || !s.alive || s.persona !== 'hunter') continue;
        const d = Math.hypot(s.x - me.x, s.y - me.y) - s.r - me.r;
        if (d < this.minD) { this.minD = d; this.minT = w.t; }
      }
    }
    if (o.type === 'race' && !o.killsGE && this.overtakeT === null && w.t >= 3 && w.tick % 15 === 0) {
      const rank = w.ranking().findIndex((r) => r.s === me) + 1;
      if (rank > 0 && rank <= (o.rankLE ?? 1)) this.overtakeT = w.t;
    }
  }
  keyT(): number | null {
    const m = this.m, run = this.run, me = run.me.id, o = m.objective, evs = run.w.events as SimEvent[], notes = this.notes;
    const first = (f: (e: SimEvent) => boolean) => evs.find(f)?.t;
    const r = (t: number | undefined | null) => (t == null ? null : Math.round(t * 10) / 10);
    if (m.ai.some((a) => a.crown)) return r(first((e) => e.type === 'gem' && e.by === me));
    switch (o.type) {
      case 'rings': {
        const obs = m.arena.obstacles ?? []; const sl = m.ai.filter((a) => a.path).flatMap((a) => a.path!);
        let best = Math.floor(o.points!.length / 2), bd = 1e9;
        o.points!.forEach((p, i) => { for (const ob of obs) { const d = Math.hypot(p[0] - ob.x, p[1] - ob.y) - ob.r; if (d < bd) { bd = d; best = i; } } for (const q of sl) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = i; } } });
        return r(notes.find((n) => n.kind === 'ring' && n.n === best + 1)?.t);
      }
      case 'eat':
        if (o.kind === 'meteor') return r(first((e) => e.type === 'meteor' && e.id === me));
        if (o.kind === 'drop') return r(first((e) => e.type === 'eat' && e.id === me && e.kind === 'drop'));
        return r(first((e) => e.type === 'pu' && e.id === me && e.kind === 'magnet') ?? first((e) => e.type === 'eat' && e.id === me && e.kind === 'big'));
      case 'length': return r(first((e) => e.type === 'pu' && e.id === me && e.kind === 'magnet') ?? first((e) => e.type === 'eat' && e.id === me && e.kind === 'big'));
      case 'pu': return r(first((e) => e.type === 'pu' && e.id === me && e.kind === o.kind));
      case 'survive': {
        // the near-miss event closest to the closest approach, else the closest approach itself
        if (this.minT === null) return r(first((e) => e.type === 'nearmiss' && e.id === me));
        const nm = evs.filter((e) => e.type === 'nearmiss' && e.id === me).map((e) => e.t).sort((a, b) => Math.abs(a - this.minT!) - Math.abs(b - this.minT!))[0];
        return r(nm !== undefined && Math.abs(nm - this.minT) < 2 ? nm : this.minT);
      }
      case 'race':
        if (!o.killsGE) return r(this.overtakeT);
        return r(first((e) => e.type === 'kill' && e.killer === me && e.tag !== 'headon' && (!o.tags || o.tags.includes(e.tag))));
      case 'loop': return r(notes.find((n) => n.kind === 'marker')?.t);
      default: return r(first((e) => e.type === 'kill' && e.killer === me && e.tag !== 'headon' && (!o.tags || o.tags.includes(e.tag))));
    }
  }
}

export const DEMO_BOT = { tier: 'EXPERT', persona: 'expert' } as const;

/** one headless 示范 run: result + key moment (Node and browser alike) */
export function runDemo(m: Mission, seed: number, Run: typeof MissionRun): { ok: boolean; t: number; keyT: number | null } {
  const run = new Run(m, seed, { bot: { ...DEMO_BOT } });
  const k = new KeyTracker(m, run);
  while (!run.step()) k.sample();
  const res = run.result();
  return { ok: res.ok, t: Math.round(res.t * 10) / 10, keyT: k.keyT() };
}
