// Playback policy (spec §9.4, content/memory-matrix/voice-policy.json): the voice pipeline does not know these fields, this module enforces them.
// A line is spoken only when every rule of its entry holds; lines without an entry are free one-shots. Nothing here ever interrupts a sentence
// except the explicit `interrupt` callers (再听一遍 / 跳过 / 🏠 / the next action button).
import policy from '../../../../content/memory-matrix/voice-policy.json';
import type { Narrator, SayResult } from '@kit/narration';

export interface VoiceCtx {
  night1?: boolean; ruleChange?: boolean; awayMin?: number; axisChanged?: boolean; afterSlip?: boolean;
  pass?: boolean; neutral?: boolean; firstLit?: boolean; mode?: string;
}
export interface VoiceState { once: string[]; week: Record<string, number>; nightAt: Record<string, number> }
interface Rule { once?: boolean; night1?: boolean; onRuleChange?: boolean; afterAwayMin?: number; whenChanged?: string; maxPerRound?: number; maxPerNight?: number; maxPerSession?: number; maxPerWeek?: number; cooldownRounds?: number; cooldownNights?: number; onlyOnPass?: boolean; notAfterSlip?: boolean; neutralOnly?: boolean; onlyWhenLevelFirstLit?: boolean; mode?: string }

const WEEK = 7 * 86_400_000;
const RULES = policy.lines as Record<string, Rule>;
const DROP = (policy.queue.dropIfBusy as string[]).map((p) => new RegExp(`^${p.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`));
/** praise lines rotate (ok1 / ok2 / ok3): the cooldown is shared by the whole family */
const family = (id: string): string => id.replace(/\d+$/, '');
export const isDroppable = (id: string): boolean => DROP.some((r) => r.test(id));

/** how long a line without a recorded clip stays readable: about 0.18 s a character + 0.8 s (a 6-year-old reads slowly; tutorial lines must not flash past) */
export const dwellMs = (text: string): number => Math.round(([...text].length * 0.18 + 0.8) * 1000);

export class Voice {
  private round = 0;
  private perRound = new Map<string, number>();
  private perNight = new Map<string, number>();
  private perSession = new Map<string, number>();
  private lastRound = new Map<string, number>();
  private rot = new Map<string, number>();
  /** set false in automation fast mode: say() then resolves at once and never waits for the voice */
  quiet = false;
  /** lines have no clip yet (before the narration step): say() then resolves only after the reading dwell */
  textOnly = false;
  constructor(private readonly narrator: Narrator, private readonly state: VoiceState, private readonly env: { now: () => number; nightClock: () => number; changed?: () => void }) {}

  newRound(): void { this.round += 1; this.perRound.clear(); }
  newNight(): void { this.perNight.clear(); }
  get busy(): boolean { return this.narrator.speaking; }
  /** next line of a rotation (fb.ok1..3): never the same twice in a row */
  rotate(ids: string[]): string { const i = ((this.rot.get(ids[0]) ?? -1) + 1) % ids.length; this.rot.set(ids[0], i); return ids[i]; }

  allowed(id: string, ctx: VoiceCtx = {}): boolean {
    const r = RULES[id];
    if (!r) return !(this.narrator.speaking && isDroppable(id));
    if (r.once && this.state.once.includes(id)) return false;
    if (r.night1 !== undefined || r.onRuleChange !== undefined || r.afterAwayMin !== undefined) {
      const ok = (r.night1 && ctx.night1) || (r.onRuleChange && ctx.ruleChange) || (r.afterAwayMin !== undefined && (ctx.awayMin ?? 0) >= r.afterAwayMin);
      if (!ok) return false;
    }
    if (r.whenChanged === 'axis' && !ctx.axisChanged) return false;
    if (r.onlyOnPass && !ctx.pass) return false;
    if (r.neutralOnly && !ctx.neutral) return false;
    if (r.notAfterSlip && ctx.afterSlip) return false;
    if (r.onlyWhenLevelFirstLit && !ctx.firstLit) return false;
    if (r.mode && ctx.mode !== r.mode) return false;
    if (r.maxPerRound !== undefined && (this.perRound.get(id) ?? 0) >= r.maxPerRound) return false;
    if (r.maxPerNight !== undefined && (this.perNight.get(id) ?? 0) >= r.maxPerNight) return false;
    if (r.maxPerSession !== undefined && (this.perSession.get(id) ?? 0) >= r.maxPerSession) return false;
    if (r.maxPerWeek !== undefined && this.state.week[id] !== undefined && this.env.now() - this.state.week[id] < WEEK) return false;
    const fam = family(id);
    if (r.cooldownRounds !== undefined && this.lastRound.has(fam) && this.round - (this.lastRound.get(fam) as number) <= r.cooldownRounds) return false;
    if (r.cooldownNights !== undefined && this.state.nightAt[id] !== undefined && this.env.nightClock() - this.state.nightAt[id] < r.cooldownNights) return false;
    if (isDroppable(id) && this.narrator.speaking) return false;
    return true;
  }

  /** Speak `id` if the policy allows it; resolves 'skipped' when it does not. */
  say(id: string, ctx: VoiceCtx = {}, o: { interrupt?: boolean; vars?: Record<string, string | number>; force?: boolean } = {}): Promise<SayResult> {
    if (!o.force && !this.allowed(id, ctx)) return Promise.resolve('skipped');
    const bump = (m: Map<string, number>) => m.set(id, (m.get(id) ?? 0) + 1);
    bump(this.perRound); bump(this.perNight); bump(this.perSession); this.lastRound.set(family(id), this.round);
    const r = RULES[id];
    if (r?.once) this.state.once.push(id);
    if (r?.maxPerWeek !== undefined) this.state.week[id] = this.env.now();
    if (r?.cooldownNights !== undefined) this.state.nightAt[id] = this.env.nightClock();
    this.env.changed?.();
    const t0 = this.env.now(), text = (typeof this.narrator.text === 'function' ? this.narrator.text(id) : undefined) ?? '', p = this.narrator.say(id, { interrupt: o.interrupt, vars: o.vars });
    if (this.quiet) return Promise.resolve('skipped');
    if (!this.textOnly || !text) return p;
    return p.then(async (r) => { const rest = dwellMs(text) - (this.env.now() - t0); if (r === 'done' && rest > 0) await new Promise((res) => window.setTimeout(res, rest)); return r; });
  }
}
