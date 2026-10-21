/**
 * Line text for the screen — ALWAYS resolvable from the build-time table (lines.v1.json), never from the audio manifest, so the
 * game reads and plays with sound off or with no clips at all (spec §7.2). Numbers are read the textbook way (zhNumber).
 */
import LINES from '../data/lines.v1.json';
import type { DiagClass, FamilyDef } from '../app/types';

const T = LINES as Record<string, string>;
export const hasLine = (id: string): boolean => id in T;
export const fillVars = (text: string, vars?: Record<string, string | number>): string => (vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text);
export const lineText = (id: string, vars?: Record<string, string | number>): string => fillVars(T[id] ?? '', vars);
export const allLineIds = (): string[] => Object.keys(T);
/** the whole build-time table (voice/compose.ts matches fragments by text against it) */
export const lineTable = (): Record<string, string> => T;

const D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 教材读法: 305 → 三百零五, 200 → 二百, 10 → 十, 12 → 十二, 110 → 一百一十, 1000 → 一千 (the "两" only before measure words). */
export function zhNumber(n: number): string {
  if (n === 0) return '零';
  const th = Math.floor(n / 1000), h = Math.floor(n / 100) % 10, t = Math.floor(n / 10) % 10, o = n % 10;
  let s = '';
  if (th) s += D[th] + '千';
  if (h) s += D[h] + '百'; else if (th && (t || o)) s += '零';
  if (t) s += (t === 1 && !th && !h ? '' : D[t]) + '十'; else if ((th || h) && o) s += '零';
  if (o) s += D[o];
  return s;
}

/** The order-card voice line of each family (the line is also the 通讯条 text). */
export function orderLine(f: FamilyDef, p: any, ask?: string): { id: string; vars?: Record<string, string | number> } {
  switch (f.id) {
    case 'nl.calib': return { id: 'mars.ord.calib' };
    case 'nl.place': return p.planet ? { id: 'mars.orbit.planet', vars: { planet: lineText(`mars.planet.${p.planet}`) } } : { id: 'mars.ord.place', vars: { n: zhNumber(p.target) } };
    case 'nl.read': return { id: 'mars.ord.nlRead' };
    case 'nl.zoom': return { id: 'mars.ord.zoom', vars: { n: zhNumber(p.target) } };
    case 'pv2.read': case 'pv3.read': return { id: f.id === 'pv3.read' ? 'mars.ord.vaultRead' : 'mars.ord.read' };
    case 'pv2.build': case 'pv3.build': return { id: 'mars.ord.build' };
    case 'pv2.compare': return { id: 'mars.ord.compare' };
    case 'pv3.compare': return { id: 'mars.ord.vaultCmp' };
    case 'pv2.step': case 'pv3.step': { const minus = p.op === '-' || (p.d ?? 0) < 0; return { id: minus ? 'mars.ord.stepDm' : 'mars.ord.stepD', vars: { d: zhNumber(p.b ?? Math.abs(p.d ?? 1)) } }; }
    case 'pv2.split': return { id: 'mars.ord.split' };
    case 'add.tens': case 'add.carry1': case 'add.2d2d': case 'add.compensate': return { id: 'mars.ord.add' };
    case 'sub.tens': case 'sub.borrow1': case 'sub.thinkAdd': case 'sub.2d2d': case 'sub.compensate': return { id: 'mars.ord.sub' };
    case 'col.add': case 'col.sub': return { id: 'mars.ord.col' };
    case 'rel.compare': return { id: p.form === 'diff' ? 'mars.ord.more' : p.form === 'findBig' ? 'mars.ord.relBig' : 'mars.ord.relSmall' };
    case 'pv3.pack': return { id: 'mars.ord.pack' };
    case 'pv3.counter': return { id: 'mars.ord.counterSet' };
    case 'pv3.dictation': return { id: 'mars.ord.dictation' };
    case 'pv3.order': return { id: 'mars.ord.order' };
    case 'pv3.addHund': return { id: p.op === '-' ? 'mars.ord.hundSub' : 'mars.ord.hund' };
    case 'pv3.skip': return { id: 'mars.ord.skip' };
    case 'pv3.round': return { id: 'mars.ord.round' };
    case 'mul.groups': return { id: ask === 'count' ? 'mars.ord.groupsCount' : ask === 'size' ? 'mars.ord.groupsSize' : 'mars.ord.groupsTotal' };
    case 'mul.write': return { id: 'mars.ord.write' };
    case 'mul.equalCheck': return { id: 'mars.ord.equalCheck' };
    case 'mul.skip': return { id: 'mars.ord.skipJump' };
    case 'mul.array': return { id: ask === 'cols' ? 'mars.ord.missing' : 'mars.ord.array' };
    case 'mul.commute': return { id: 'mars.ord.rotate' };
    case 'mul.missingFactor': return { id: 'mars.ord.missing' };
    case 'mul.split': return { id: 'mars.ord.splitArr' };
    case 'mul.compareArr': return { id: 'mars.ord.cmpArr' };
    // breather orders: each one speaks ITS task (QA fix-mars-r2 P3 leftover: the generic 你来定一个数。 was read over a different task)
    case 'open.pv3': return { id: p.rule === 'zeroInside' ? 'mars.ord.openZero' : p.rule === 'over500' ? 'mars.ord.openOver' : p.rule === 'under300' ? 'mars.ord.openUnder' : 'mars.ord.open' };
    case 'open.pv3cmp': return { id: p.rel === '>' ? 'mars.ord.openCmpGt' : 'mars.ord.openCmpLt' };
    case 'open.groups': return { id: 'mars.ord.openGroups' };
    case 'open.arrays': return { id: 'mars.ord.openArrays' };
    default: return { id: 'mars.ord.open' };
  }
}
export const hintLine = (f: FamilyDef, p: any): string => {
  if (f.id.startsWith('nl.')) { const k = p.mode === 'half' ? 'half' : p.mode === 'ends' ? 'end' : p.L > 100 ? 'hund' : 'ten'; return `mars.h1.nl.${k}`; }
  return f.hint1 ?? 'mars.hint.slow';
};
export const TRY_LINE: Partial<Record<DiagClass, string>> = {
  noCarry: 'mars.try.noCarry', smallerFromLarger: 'mars.try.sfl', digitReversal: 'mars.try.rev', zeroOmit: 'mars.try.zero', pvConcat: 'mars.try.concat', canonicalOnly: 'mars.try.canon',
  mulAsAdd: 'mars.try.mul', equalAsOperator: 'mars.try.eq', keywordOp: 'mars.try.kw', offByOne: 'mars.try.one', offByTen: 'mars.try.ten', opReversed: 'mars.try.op', extraZero: 'mars.try.extraZero',
  unitAsOne: 'mars.try.unit', countOnInclusive: 'mars.try.countOn', offByStep: 'mars.try.skip', logCompress: 'mars.try.far', other: 'mars.try.gen',
};
