// types.check.ts — COMPILE-TIME tests for RuleOf<T> / Rules<T> (sync.md §2-2, §4.3). Not executed by vitest: `tsc --noEmit` is the runner, an unused @ts-expect-error is itself an error.
// So: adding a field to a save type without a rule, a rank() missing a union member, or a numeric rule on a boolean field must NOT compile.
import { R, type RuleOf } from '@kit/sync/rules';

interface Rec { n: number; flag: boolean; tags: string[]; mode: 'a' | 'b' | 'c'; stars: 0 | 1 | 2 | 3; inner: { x: number; y?: string }; map: Record<string, { v: number }>; best: number | null }

export const ok: RuleOf<Rec> = R.obj<Rec>({
  n: R.max, flag: R.or, tags: R.set, mode: R.rank(['a', 'b', 'c']), stars: R.rank([0, 1, 2, 3]),
  inner: R.obj<Rec['inner']>({ x: R.sum, y: R.lww }), map: R.map(R.obj<{ v: number }>({ v: R.max })), best: R.min,
});
// @ts-expect-error — `tags` has no rule: adding a field to the save type without a rule is a compile error
export const missing = R.obj<Rec>({ n: R.max, flag: R.or, mode: R.rank(['a', 'b', 'c']), stars: R.rank([0, 1, 2, 3]), inner: R.obj<Rec['inner']>({ x: R.sum, y: R.lww }), map: R.map(R.obj<{ v: number }>({ v: R.max })), best: R.min });
// @ts-expect-error — the rank order lacks the union member 'c' (a new enum value without bumping the rule)
export const shortRank = R.obj<Rec>({ n: R.max, flag: R.or, tags: R.set, mode: R.rank(['a', 'b']), stars: R.rank([0, 1, 2, 3]), inner: R.obj<Rec['inner']>({ x: R.sum, y: R.lww }), map: R.map(R.obj<{ v: number }>({ v: R.max })), best: R.min });
// @ts-expect-error — `or` is for booleans, not numbers
export const wrongKind = R.obj<Rec>({ n: R.or, flag: R.or, tags: R.set, mode: R.rank(['a', 'b', 'c']), stars: R.rank([0, 1, 2, 3]), inner: R.obj<Rec['inner']>({ x: R.sum, y: R.lww }), map: R.map(R.obj<{ v: number }>({ v: R.max })), best: R.min });
// @ts-expect-error — `max` on a boolean field
export const wrongKind2 = R.obj<Rec>({ n: R.max, flag: R.max, tags: R.set, mode: R.rank(['a', 'b', 'c']), stars: R.rank([0, 1, 2, 3]), inner: R.obj<Rec['inner']>({ x: R.sum, y: R.lww }), map: R.map(R.obj<{ v: number }>({ v: R.max })), best: R.min });
// @ts-expect-error — a key the type does not have
export const extra = R.obj<Rec>({ n: R.max, flag: R.or, tags: R.set, mode: R.rank(['a', 'b', 'c']), stars: R.rank([0, 1, 2, 3]), inner: R.obj<Rec['inner']>({ x: R.sum, y: R.lww }), map: R.map(R.obj<{ v: number }>({ v: R.max })), best: R.min, ghost: R.max });
// device-local and last-writer-wins fit any field type
export const anyType: RuleOf<Rec> = R.obj<Rec>({ n: R.local, flag: R.lww, tags: R.lww, mode: R.local, stars: R.lww, inner: R.local, map: R.lww, best: R.lww });
