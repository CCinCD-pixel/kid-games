/**
 * Oracle judge + misconception classifier (spec §3.3). Pure functions: the UI never decides what is right.
 *   judge(family, params, response, ask) → Verdict { ok, grade, diag, confidence, empty }
 * The correct answer comes ONLY from the family's independent oracle; wrong answers are matched against the declared `diag[]` classes
 * in order (a collision's winner is the earlier class, the loser is only shown as 对质), then generic off-by classes, then `other`.
 */
import type { Answer, DiagClass, FamilyDef, Response, Verdict } from './types';
import { GENERIC_CLASSES, bugAnswer } from '../diag/bugs';

const isRec = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function isEmptyResponse(r: Response): boolean {
  if (r === null || r === undefined) return true;
  if (typeof r === 'string') return r.trim() === '';
  if (typeof r === 'number') return !Number.isFinite(r);
  if (Array.isArray(r)) return r.length === 0 || r.every((x) => x === null || x === undefined || (x as unknown) === '' || Number.isNaN(x as number));
  if (isRec(r)) return Object.keys(r).length === 0 || (('total' in r || 'built' in r) && r.total === undefined && r.built === undefined && !('pairs' in r));
  return false;
}
/** Typed integers are 1–4 digits without a leading zero. */
export function toInt(r: unknown): number | null {
  if (typeof r === 'number') return Number.isInteger(r) ? r : null;
  if (typeof r === 'string' && /^(0|[1-9]\d{0,3})$/.test(r.trim())) return Number(r.trim());
  return null;
}
const arrEq = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => Number(x) === Number(b[i]));
export function sameAnswer(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') { const x = toInt(a); const y = toInt(b); return x !== null && y !== null && x === y; }
  if (Array.isArray(a) && Array.isArray(b)) return arrEq(a, b);
  if (isRec(a) && isRec(b)) return Object.keys(b).every((k) => String(a[k]) === String(b[k]));
  return a === b;
}

type Scored = { ok: boolean; grade: Verdict['grade'] };
function score(f: FamilyDef, p: any, r: Response, correct: Answer, ask?: string): Scored {
  const kind = f.answer;
  const ok = (v: boolean): Scored => ({ ok: v, grade: v ? 'exact' : 'wrong' });
  if (f.id === 'nl.calib') return { ok: true, grade: 'exact' };
  if (f.id === 'nl.zoom') {
    const x = isRec(r) ? r : null;
    return ok(!!x && Number(x.hundred) === Math.floor(p.target / 100) && Number(x.ten) === Math.floor(p.target / 10));
  }
  if (kind === 'place' || kind === 'read') {
    const v = toInt(r); if (v === null) return { ok: false, grade: 'wrong' };
    const e = Math.abs(v - p.target);
    if (e < p.tol + 0.5) return { ok: true, grade: 'exact' };
    return { ok: false, grade: e <= 2 * p.tol ? 'close' : 'far' };
  }
  if (kind === 'build') {
    const x: Record<string, unknown> = isRec(r) ? r : { total: r };
    const total = toInt(x.total);
    if (total === null || total !== (correct as number)) return { ok: false, grade: 'wrong' };
    return x.canonical === false ? { ok: false, grade: 'close' } : { ok: true, grade: 'exact' };
  }
  if (kind === 'compare2') {
    const c = correct as { sym: string; digit: string };
    if (typeof r === 'string') return ok(false);
    const x = isRec(r) ? r : null;
    return ok(!!x && x.sym === c.sym && x.digit === c.digit);
  }
  if (kind === 'open') return ok(!!f.open && f.open(p, r));
  if (f.id === 'mul.write' && ask !== 'sum') {
    const c = correct as number[]; const x = Array.isArray(r) ? r.map(Number) : null;
    return ok(!!x && x.length === 2 && x[0] * x[1] === c[0] * c[1] && ((x[0] === c[0] && x[1] === c[1]) || (x[0] === c[1] && x[1] === c[0])));
  }
  if (Array.isArray(correct)) return ok(Array.isArray(r) && arrEq(r, correct));
  return ok(sameAnswer(r, correct));
}

export interface Classified { diag: DiagClass | null; confidence: 'high' | 'low'; matches: DiagClass[] }
/** Which misconception (if any) explains this wrong response? */
export function classify(f: FamilyDef, p: any, r: Response, ask?: string): Classified {
  const correct = f.oracle(p, ask);
  const key = (x: unknown) => (isRec(x) && 'sym' in x ? String((x as any).sym) : JSON.stringify(x));
  const rk = key(r);
  // compare2: the symbol alone is what a bug predicts; a right symbol on the wrong digit is cmpWrongDigit
  if (f.answer === 'compare2' && isRec(r) && isRec(correct) && r.sym === correct.sym && r.digit !== correct.digit) {
    return { diag: f.diag.includes('cmpWrongDigit') ? 'cmpWrongDigit' : 'other', confidence: 'low', matches: ['cmpWrongDigit'] };
  }
  const matches: DiagClass[] = [];
  for (const cls of f.diag) {
    if (cls === 'other') continue;
    const b = bugAnswer(f, p, cls, ask);
    if (b === null) continue;
    if (key(b) === rk || (f.answer === 'compare2' && typeof b === 'string' && isRec(r) && r.sym === b)) matches.push(cls);
  }
  if (matches.length) {
    const specific = matches.filter((c) => !GENERIC_CLASSES.includes(c));
    const winner = matches[0];
    return { diag: winner, confidence: specific.length === 1 && !GENERIC_CLASSES.includes(winner) ? 'high' : 'low', matches };
  }
  // generic fall-backs on numeric answers
  const v = toInt(r);
  if (v !== null && typeof correct === 'number') {
    const d = Math.abs(v - correct);
    if (d === 1) return { diag: 'offByOne', confidence: 'low', matches: ['offByOne'] };
    if (d === 10 || d === 100) return { diag: 'offByTen', confidence: 'low', matches: ['offByTen'] };
    if (correct >= 10 && String(v) === String(correct).split('').reverse().join('') && v !== correct) return { diag: 'digitReversal', confidence: 'low', matches: ['digitReversal'] };
  }
  return { diag: 'other', confidence: 'low', matches: [] };
}

export function judge(f: FamilyDef, p: unknown, r: Response, ask?: string): Verdict {
  if (isEmptyResponse(r)) return { ok: false, grade: 'empty', diag: null, confidence: 'low', empty: true };
  const correct = f.oracle(p, ask);
  const s = score(f, p, r, correct, ask);
  if (s.ok) return { ok: true, grade: s.grade, diag: null, confidence: 'high', empty: false };
  if (f.answer === 'open') return { ok: false, grade: 'wrong', diag: null, confidence: 'low', empty: false };
  const c = classify(f, p, r, ask);
  return { ok: false, grade: s.grade, diag: c.diag, confidence: c.confidence, empty: false };
}
