// lesson/twins.ts — 孪生题：同一道题的左右镜像（rules.mirror）。不可镜像（mirror 缺省或返回 null）→ 回退到 step.twin 指向的同课题。
// 字段名与 lessons.v1.json 一致：hero / target / from / to / targets / opts / answer / stars / movers（格名）、ghost / accepted / options[].m（着法串）。
import type { GameRules, Sq } from '../core/types';
import type { LessonStep } from './steps';

/** 几何上的左右镜像格映射（x → 2·中线 − x）；两种朝向同结果 */
export function mirrorSquares(g: GameRules<unknown, unknown>['geometry']): Sq[] {
  const mid = g.viewBox.w / 2, out: Sq[] = [];
  for (let q = 0; q < g.squares; q++) { const c = g.center(q, 'first-bottom'); const m = g.hit(2 * mid - c.x, c.y, 'first-bottom'); out.push(m ?? q); }
  return out;
}
const SQ_FIELDS = ['target', 'hero', 'from', 'to', 'piece'] as const; const SQ_LIST_FIELDS = ['targets', 'opts', 'answer', 'stars', 'movers'] as const; const MOVE_LIST_FIELDS = ['ghost', 'moves', 'accepted'] as const;
/** 把步骤数据里的格名按镜像映射改写（只改已知的格名字段；着法串另按 from/to 改写；options[].m 同理）。pos 缺省时用 posFen（puzSel 类步骤由游戏解析局面）。 */
export function mirrorStep<M, S>(step: LessonStep, rules: GameRules<M, S>, posFen?: string | null): LessonStep | null {
  const pos = step.pos ?? posFen; if (!rules.mirror || !pos) return null; const s = rules.mirror(rules.fromFen(pos)); if (!s) return null;
  const g = rules.geometry; const map = mirrorSquares(g as never); const idOf = new Map<string, Sq>(); for (let q = 0; q < g.squares; q++) idOf.set(g.name(q), q);
  const mn = (name: string): string => { const q = idOf.get(name); return q === undefined ? name : g.name(map[q]); };
  const mv = (enc: string): string => { const m = /^([a-z]\d{1,2})([a-z]\d{1,2})(.*)$/.exec(enc); return m ? mn(m[1]) + mn(m[2]) + m[3] : enc; };
  const out: Record<string, unknown> = { ...step, pos: rules.toFen(s), id: `${step.id}~m` };
  for (const f of SQ_FIELDS) if (typeof out[f] === 'string') out[f] = mn(out[f] as string);
  for (const f of SQ_LIST_FIELDS) if (Array.isArray(out[f])) out[f] = (out[f] as unknown[]).map((x) => (typeof x === 'string' ? mn(x) : x));
  for (const f of MOVE_LIST_FIELDS) if (Array.isArray(out[f])) out[f] = (out[f] as string[]).map(mv);
  if (Array.isArray(out.options)) out.options = (out.options as { m: string }[]).map((o) => ({ ...o, m: mv(o.m) }));
  delete out.twin; delete out.puzSel; return out as unknown as LessonStep;
}
/** 取孪生：'mirror' → 镜像；否则按 id 在同课里找；找不到 → null */
export function twinOf<M, S>(step: LessonStep, rules: GameRules<M, S>, byId: (id: string) => LessonStep | null, posFen?: string | null): LessonStep | null {
  if (!step.twin) return null; if (step.twin === 'mirror') return mirrorStep(step, rules, posFen) ?? null; return byId(step.twin);
}
