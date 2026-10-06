/**
 * Referee reveal (spec §3.8 R8.2, §6.8): the verdict of a hidden collision without naming anyone.
 * Full ceremony: whistle → accelerating drum (400 ms) → verdict badge pops → the guide reads it.
 * Short: a 150 ms sting + the badge, no reading (tap the badge to hear it).
 */
import type { Outcome } from '../core/combat';
import { MS, d } from './anim';
import { dismiss, verdictBadge } from './fx';
import type { McIcon } from './icons';
import type { Pt } from './layout';

export const VERDICT: Record<Outcome, { text: string; line: string; icon: McIcon }> = {
  A: { text: '进攻胜', line: 'mc.ref.attack.win', icon: 'swords' },
  D: { text: '防守胜', line: 'mc.ref.attack.lose', icon: 'shield' },
  B: { text: '同归', line: 'mc.ref.both', icon: 'smoke' },
  F: { text: '扛旗', line: 'mc.ref.flag', icon: 'flag' },
};

export interface RefereeIO {
  play(name: string): void;
  say(line: string): Promise<unknown>;
  whistle?(): void;
}

export async function refereeReveal(layer: HTMLElement, at: Pt, outcome: Outcome, full: boolean, io: RefereeIO, wait: (ms: number) => Promise<void>): Promise<void> {
  const v = VERDICT[outcome];
  if (full) {
    io.whistle?.();
    io.play('mc.whistle');
    await wait(d(320));
    io.play('mc.reveal');
    await wait(d(400));
    io.play('chime');
  } else {
    io.play('mc.sting');
  }
  const badge = verdictBadge(layer, at, outcome, v.text, v.icon);
  badge.classList.add('mc-verdict-live');
  badge.dataset.testid = 'verdict';
  badge.style.pointerEvents = 'auto';
  badge.addEventListener('click', () => void io.say(v.line));
  if (full) {
    void io.say(v.line);
    await wait(d(MS.refereeFull + 500));
  } else await wait(d(MS.refereeShort + 550));
  await dismiss(badge);
}
