/**
 * S3 level card (spec §2.4, §2.7): level id, goal cards (icon + number; tap = hear the goal again,
 * auto-read the first time a goal type appears), moves, the visible take-off assist row, the new
 * element's "i" button (replays its intro card), 「开始」 76 px. On the first start of an intro level the
 * S3a intro card plays before the board (spec §8.4 CARD → [INTRO] → PLAY).
 */
import { bindPress, icon } from '@kit/ui';
import { EPISODES, LEVELS, levelById } from '../content';
import type { AppCtx } from '../ctx';
import { newGame, parseLevel, remaining } from '../core';
import { assistTier } from '../save';
import { assistKinds, miniIcon, objectiveIcon } from '../view/icons';
import { showIntroCard } from './intro-card';

export function showLevelCard(app: AppCtx, id: string, back: 'map' | 'route'): HTMLElement {
  const d = levelById(id)!;
  const L = parseLevel(d);
  const rec = app.save.data.levels[id];
  const st0 = newGame(L, 1);
  const tier = d.id === '1-01' ? 0 : assistTier(rec?.failStreak ?? 0);
  const ep = EPISODES.find((e) => e.ep === d.ep)!;
  const idx = LEVELS.findIndex((x) => x.id === id);
  const kinds = assistKinds(idx, LEVELS.findIndex((x) => x.id === '1-05'), LEVELS.findIndex((x) => x.id === '1-07'), tier);
  const goalIds: Record<string, string> = { collect: 'em.goal.collect', dust: 'em.goal.dust', crate: 'em.goal.crate', ice: 'em.goal.ice', energy: 'em.goal.energy' };
  const intro = d.intro;
  const scrim = document.createElement('div');
  scrim.className = 'xg-scrim xg-root em-card-scrim';
  scrim.dataset.xgGame = 'match';
  scrim.innerHTML = `<div class="xg-modal em-card" role="dialog" aria-modal="true">
      <div class="xg-ribbon">${ep.name}</div>
      ${intro ? `<button class="xg-iconbtn em-card__info" data-act="info" aria-label="再看一遍介绍" data-sfx="ui-open">${icon('info')}</button>` : ''}
      <div class="em-card__id xg-num">${d.id}</div>
      <div class="em-card__goals">${L.objectives.map((o, k) => `<button class="em-card__goal" data-goal="${k}" data-sfx="ui-tap"><span class="em-card__icon">${objectiveIcon(o)}</span><b class="xg-num">${remaining(st0, o)}</b></button>`).join('')}</div>
      <div class="em-card__moves"><b class="xg-num">${d.moves}</b><span>步</span></div>
      ${tier > 0 ? `<div class="em-assist-row">${icon('robot')}<span>领航员帮你装好了：</span>${kinds.map(miniIcon).join('')}</div>` : ''}
      <div class="em-card__actions"><button class="xg-btn xg-btn--secondary em-card__back" data-act="back" data-sfx="ui-back">${icon(back === 'map' ? 'map' : 'back')}<span>${back === 'map' ? '地图' : '航线'}</span></button>
      <button class="xg-btn xg-btn--primary xg-btn--lg em-card__go" data-act="go" data-sfx="ui-confirm">${icon('play')}<span>开始</span></button></div></div>`;
  document.body.append(scrim);
  bindPress(scrim);
  const close = () => { scrim.classList.add('is-leaving'); window.setTimeout(() => scrim.remove(), 240); };
  scrim.querySelectorAll<HTMLElement>('[data-goal]').forEach((b) => b.addEventListener('click', () => {
    const o = L.objectives[Number(b.dataset.goal)];
    void app.voice.say(goalIds[o.t] ?? 'em.goal.collect', { interrupt: true });
  }));
  scrim.querySelector('[data-act="back"]')!.addEventListener('click', () => { close(); if (back === 'route') app.go({ s: 'route' }); else app.go({ s: 'map', ep: d.ep }); });
  scrim.querySelector('[data-act="info"]')?.addEventListener('click', () => { app.voice.stop(); void showIntroCard(app, intro!); });
  let going = false;
  scrim.querySelector('[data-act="go"]')!.addEventListener('click', async () => {
    if (going) return;
    going = true;
    close();
    const resume = app.save.data.resume?.id === id;
    // first start of an intro level: the intro card first (and the booster grant on a tool card)
    if (intro && !app.save.data.intros.includes(intro) && !resume) { app.voice.stop(); await showIntroCard(app, intro, { first: true }); }
    app.go({ s: 'play', id, resume });
  });
  // first time a goal type appears: read it out (spec §2.7)
  const seen = new Set(LEVELS.slice(0, idx).flatMap((x) => parseLevel(x).objectives.map((o) => o.t)));
  const fresh = L.objectives.find((o) => !seen.has(o.t));
  if (fresh) void app.voice.say(goalIds[fresh.t]);
  return scrim;
}
