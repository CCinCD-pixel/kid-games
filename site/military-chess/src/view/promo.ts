/**
 * The promotion ceremony (spec §5.4): for each new rank the shoulder board drops from the top on a
 * spring, a gloss sweeps across it, bell + level-up, milestone confetti and the rank's line. A tap or
 * 3.2 s moves on. Shared by the result page, the puzzle screen and the first-time flow.
 */
import { confetti } from '@kit/ui';
import { EASE, d } from './anim';
import { insignia, RANK_NAMES } from './insignia';

export interface PromoIO {
  play(name: string): void;
  say(line: string): void;
  wait(ms: number): Promise<void>;
  /** FT keeps quiet: no confetti (spec §2.6) */
  quiet?: boolean;
}

export async function promotionCeremony(host: HTMLElement, ranks: readonly number[], io: PromoIO): Promise<void> {
  for (const r of ranks) {
    const scrim = document.createElement('div');
    scrim.className = 'mc-scrim mc-promo';
    scrim.dataset.testid = 'promotion';
    scrim.innerHTML = `<div class="mc-promo__card">${insignia(r, 260)}<i class="mc-promo__gloss"></i><h2>${RANK_NAMES[r]}</h2><p>升军衔啦</p></div>`;
    const card = scrim.firstElementChild as HTMLElement;
    host.appendChild(scrim);
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d(200), fill: 'backwards' });
    io.play('bell');
    card.animate([{ transform: 'translateY(-700px) rotate(-8deg)' }, { transform: 'translateY(0) rotate(0)' }], { duration: d(900), easing: EASE.spring, fill: 'backwards' });
    await io.wait(d(860));
    io.play('level-up');
    card.querySelector<HTMLElement>('.mc-promo__gloss')?.animate([{ transform: 'translateX(-160%) skewX(-20deg)' }, { transform: 'translateX(260%) skewX(-20deg)' }], { duration: d(600), easing: 'ease-out' });
    if (!io.quiet) confetti(80);
    io.say(`mc.end.promote.${r}`);
    await new Promise<void>((res) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        scrim.removeEventListener('pointerup', finish);
        res();
      };
      scrim.addEventListener('pointerup', finish);
      void io.wait(d(3200)).then(finish);
    });
    await scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d(260), fill: 'forwards' }).finished.catch(() => undefined);
    scrim.remove();
  }
}
