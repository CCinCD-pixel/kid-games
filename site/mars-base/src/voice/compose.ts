/**
 * Runtime composition of the TEMPLATED lines (QA fix-mars-r1 T4). A line such as 再来{d}颗是几？ / 把旗插在{n}。 cannot be a recorded sentence (a TTS model would read the braces),
 * so it is spoken as  [fragment clip] [number clip] [fragment clip]  from the audio manifest: the literal pieces are the `mars.c.*` fragment lines (matched by TEXT, so a fragment
 * and the sentence it belongs to can never drift apart), the numbers are `mars.num.N` (0–1000, textbook reading), a name (planet …) is the clip of the line that has exactly that text.
 *
 * Fallback rule: if ANY piece has no clip, the WHOLE sentence goes to the speech fallback as one utterance (one voice, never a clip / robot mix). The subtitle is always the filled text.
 * Pure functions over (line table, "has clip?" predicate): unit-tested with a fake manifest (validate/compose.test.ts). No audio is generated here.
 */
import { fillVars, zhNumber } from './lines';

export type Plan = { mode: 'clip'; ids: string[]; text: string } | { mode: 'speech'; text: string; missing: string[] };
export type HasClip = (id: string) => boolean;
export interface LineTable { [id: string]: string }

const PUNCT = /[\s，。！？、：；,.!?:;]/g;
const strip = (s: string): string => s.replace(PUNCT, '');
const NUM_BY_TEXT: Map<string, number> = (() => { const m = new Map<string, number>(); for (let n = 0; n <= 1000; n++) m.set(zhNumber(n), n); return m; })();
/** fragment text -> id (lines whose id starts with `mars.c.`), and non-template line text -> id (names such as 火星 / 木星) */
export function indexOf(table: LineTable): { frag: Map<string, string>; named: Map<string, string[]> } {
  const frag = new Map<string, string>(); const named = new Map<string, string[]>();
  for (const [id, text] of Object.entries(table)) {
    if (id.startsWith('mars.c.')) frag.set(strip(text), id);
    else if (!/\{\w+\}/.test(text)) { const k = strip(text); named.set(k, [...(named.get(k) ?? []), id]); }
  }
  return { frag, named };
}
/** the clip id of a number (0–1000) */
export const numberClip = (n: number): string | null => (Number.isInteger(n) && n >= 0 && n <= 1000 ? `mars.num.${n}` : null);

/**
 * Plan how to speak line `id` with `vars`. A line without placeholders is a plain sentence: its own clip, else speech. `vars` may carry numbers or Chinese number text
 * ("三十") — both resolve to `mars.num.N`.
 */
export function composeLine(table: LineTable, has: HasClip, id: string, vars?: Record<string, string | number>): Plan {
  const raw = table[id] ?? ''; const text = fillVars(raw, vars);
  if (!raw) return { mode: 'speech', text: '', missing: [id] };
  if (!/\{\w+\}/.test(raw)) return has(id) ? { mode: 'clip', ids: [id], text } : { mode: 'speech', text, missing: [id] };
  const { frag, named } = indexOf(table);
  const ids: string[] = []; const missing: string[] = [];
  for (const part of raw.split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m) {
      const k = strip(part); if (!k) continue;   // bare punctuation between / after pieces
      const f = frag.get(k); if (f && has(f)) ids.push(f); else missing.push(f ?? `fragment:${part}`);
      continue;
    }
    const v = vars?.[m[1]];
    if (v === undefined) { missing.push(`var:${m[1]}`); continue; }
    const n = typeof v === 'number' ? v : NUM_BY_TEXT.get(String(v));
    if (n !== undefined) { const c = numberClip(n); if (c && has(c)) ids.push(c); else missing.push(c ?? `number:${v}`); continue; }
    const cand = (named.get(strip(String(v))) ?? []).find(has);
    if (cand) ids.push(cand); else missing.push(`name:${v}`);
  }
  return missing.length || !ids.length ? { mode: 'speech', text, missing } : { mode: 'clip', ids, text };
}

/** What the game needs from the Narrator (kit/narration.ts satisfies it) */
export interface SpeakerLike { has(id: string): boolean; say(idOrText: string, o?: { interrupt?: boolean; vars?: Record<string, string | number> }): Promise<unknown> }
/** Speak a line: its own clip, else the composed clips, else ONE speech-fallback utterance of the filled text. Returns the plan used (tests and the parent page read it). */
export function speakLine(narrator: SpeakerLike, table: LineTable, id: string, vars?: Record<string, string | number>, o: { interrupt?: boolean } = {}): Plan {
  const plan = composeLine(table, (x) => narrator.has(x), id, vars);
  if (plan.mode === 'clip') plan.ids.forEach((c, i) => void narrator.say(c, { interrupt: i === 0 ? o.interrupt : false }));
  else if (plan.text) void narrator.say(plan.text, { interrupt: o.interrupt });
  return plan;
}
