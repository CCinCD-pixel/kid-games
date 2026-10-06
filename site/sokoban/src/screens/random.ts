/**
 * S8 货单板 (spec §2.1, §3.9): three order cards — 小货单 / 中货单 / 大货单 (T1–T3) — each showing its
 * crates and pads and the route it flies; locked tiers are grey with a lock (they open at 70 % of
 * chapters 2 / 3 / 4). A tier with an order left half-way shows 继续. Tapping a card plays the
 * "传送带送来一个新仓库" delivery (0.6–1.5 s) while the Worker generates, then opens the warehouse.
 * The fallback pool chunk starts loading only when this board opens.
 */
import { icon } from '@kit/ui';
import { playMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import { gameIcon } from '../art/icons';
import type { AppCtx } from '../app/context';
import { orderRandom, preloadPool, randomLevelDef, type RandomSpec, type Tier } from '../app/random';
import { randomTierOpen, TIER_CHAPTER } from '../app/unlock';
import { drawCrate } from '../render/crate';
import { backdropSvg } from '../render/backdrop';

const TIER_INFO: Record<Tier, { name: string; crates: number; line: string; dest: string; route: string }> = {
  1: { name: '小货单', crates: 2, line: 'sok.random.t1', dest: '天宫', route: 'tiangong' },
  2: { name: '中货单', crates: 2, line: 'sok.random.t2', dest: '月宫', route: 'moon' },
  3: { name: '大货单', crates: 3, line: 'sok.random.t3', dest: '火星', route: 'mars' },
};

/**
 * Card art = the information (spec S8): a top-down mini warehouse whose size, walls and crate count
 * grow with the tier — 小 is a small open room, 中 a bigger room with a wall to go round, 大 the
 * biggest room with three crates (QA r1: 小/中 used to share the same 2-crate picture).
 */
const PLANS: Record<Tier, string[]> = {
  1: ['-----', '-$-.-', '-$-.-', '-----'],
  2: ['-------', '-$-#-.-', '---#---', '-$---.-', '--##---'],
  3: ['--------', '-$--#-.-', '-#--#---', '---$--.-', '-$-##-.-', '--------'],
};

function cardFace(tier: Tier, open: boolean): string {
  const plan = PLANS[tier];
  const cell = 13;
  const wall = 6;
  const rows = plan.length;
  const cols = plan[0].length;
  const w = cols * cell + wall * 2;
  const h = rows * cell + wall * 2;
  const ox = (140 - w) / 2;
  const oy = (110 - h) / 2;
  const parts: string[] = [
    `<rect x="${ox + 1}" y="${oy + 4}" width="${w}" height="${h}" rx="7" fill="#0C1230" opacity=".28"/>`,
    `<rect x="${ox}" y="${oy}" width="${w}" height="${h}" rx="7" fill="#1B2A5C"/>`,
    `<rect x="${ox + wall}" y="${oy + wall}" width="${cols * cell}" height="${rows * cell}" rx="2" fill="#EEF1F7"/>`,
  ];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = ox + wall + c * cell;
      const y = oy + wall + r * cell;
      const ch = plan[r][c];
      if ((r + c) % 2 === 1 && ch !== '#') parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#E1E6F0"/>`);
      if (ch === '#') parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="#1B2A5C"/>`);
      else if (ch === '.') parts.push(`<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.36}" fill="#F7EBD3" stroke="#A27038" stroke-width="2"/>`);
      else if (ch === '$') parts.push(`<g transform="translate(${x + 1} ${y + 1})"><rect width="${cell - 2}" height="${cell - 2}" rx="2.5" fill="#A27038" stroke="#4A2D12" stroke-width="1.4"/><rect x="${(cell - 2) / 2 - 1.5}" width="3" height="${cell - 2}" fill="#F9A726"/></g>`);
    }
  }
  return `<svg viewBox="0 0 140 110" class="sok-order__art${open ? '' : ' is-locked'}" aria-hidden="true">${parts.join('')}</svg>`;
}

export async function showOrderBoard(ctx: AppCtx): Promise<void> {
  void preloadPool();
  playMusic();
  const save = ctx.save.data;
  const scrim = document.createElement('div');
  scrim.className = 'xg-scrim xg-root sok-orders';
  scrim.dataset.xgGame = 'porter';
  const panel = document.createElement('div');
  panel.className = 'xg-modal sok-orders__panel';
  panel.dataset.testid = 'order-board';
  panel.innerHTML = `<div class="xg-ribbon">随机新仓库</div>
    <button type="button" class="xg-iconbtn xg-iconbtn--sm xg-modal__close" data-act="close" aria-label="关闭">${icon('close')}</button>
    <p class="sok-orders__lead">新货单来啦，每次都不一样</p>
    <div class="sok-orders__cards"></div>`;
  scrim.append(panel);
  document.body.append(scrim);
  const cards = panel.querySelector<HTMLElement>('.sok-orders__cards')!;
  const resume = save.inProgress?.rnd;
  for (const tier of [1, 2, 3] as Tier[]) {
    const info = TIER_INFO[tier];
    const open = randomTierOpen(save, tier);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sok-order${open ? '' : ' is-locked'}`;
    b.dataset.tier = String(tier);
    b.dataset.testid = `order-T${tier}`;
    const cont = open && resume?.tier === tier;
    b.innerHTML = `${cardFace(tier, open)}<span class="sok-order__name">${info.name}</span>
      <span class="sok-order__meta">${gameIcon('crate')}<b>${info.crates}</b><span class="sok-order__dest">→ ${info.dest}</span></span>
      ${open ? `<span class="sok-order__done">已送 <b>${save.random.byTier[tier - 1]}</b></span>` : `<span class="sok-order__lock">${icon('lock')}<span>第 ${TIER_CHAPTER[tier]} 章</span></span>`}
      ${cont ? '<span class="sok-order__resume">继续</span>' : ''}`;
    b.setAttribute('aria-label', `${info.name}${open ? '' : '（还没开放）'}`);
    cards.append(b);
  }
  if (!save.onceLines.includes('sok.random.intro')) {
    ctx.save.update((s) => s.onceLines.push('sok.random.intro'));
    void ctx.voice.say('sok.random.intro', { interrupt: true });
  }
  return new Promise((resolve) => {
    const close = () => {
      scrim.classList.add('is-leaving');
      setTimeout(() => scrim.remove(), 260);
      resolve();
    };
    scrim.addEventListener('click', (e) => {
      const t = e.target as Element;
      if (t.closest('[data-act="close"]') || t === scrim) {
        playSfx('ui-close');
        close();
        return;
      }
      const card = t.closest<HTMLElement>('.sok-order');
      if (!card) return;
      const tier = Number(card.dataset.tier) as Tier;
      if (card.classList.contains('is-locked')) {
        playSfx('ui-locked');
        card.classList.remove('is-shake');
        void card.offsetWidth;
        card.classList.add('is-shake');
        return;
      }
      void ctx.voice.say(TIER_INFO[tier].line, { interrupt: true });
      close();
      const left = ctx.save.data.inProgress?.rnd;
      if (left && left.tier === tier) {
        ctx.go({ name: 'play', id: randomLevelDef(left).id, def: randomLevelDef(left) });
        return;
      }
      void deliverOrder(ctx, tier);
    });
  });
}

/**
 * "传送带送来一个新仓库" (0.6–1.5 s): a sealed crate rides the belt in while the Worker generates (or the
 * pool answers), the lid pops, the warehouse opens.
 */
export async function deliverOrder(ctx: AppCtx, tier: Tier): Promise<void> {
  // QA r2: a designed beat, not a loading screen — the order's crates ride in on the belt over the
  // destination hall's own sky; when the warehouse is ready its floor assembles tile by tile and the
  // crates hop off the belt into it (the play screen's own entrance then takes over)
  const info = TIER_INFO[tier];
  const el = document.createElement('div');
  el.className = 'sok-deliver';
  el.dataset.testid = 'deliver';
  const w = window.innerWidth;
  const h = window.innerHeight;
  const sky = tier === 1 ? 'earth' : tier === 2 ? 'moon' : 'mars';
  const COLS = 5;
  const ROWS = 3;
  const tiles = Array.from({ length: COLS * ROWS }, (_v, i) => `<i style="--d:${((ROWS - 1 - Math.floor(i / COLS)) * COLS + (i % COLS)) * 28}ms"></i>`).join('');
  el.innerHTML = `<div class="sok-deliver__sky">${backdropSvg(sky, w, h, 'deliver')}</div><div class="sok-deliver__floor" style="--cols:${COLS}">${tiles}</div><div class="sok-belt sok-deliver__belt"><div class="sok-belt__band"></div><div class="sok-belt__rollers">${'<i></i>'.repeat(14)}</div></div><div class="sok-deliver__crates"></div><div class="sok-deliver__label">${info.name}</div>`;
  document.body.append(el);
  const host = el.querySelector<HTMLElement>('.sok-deliver__crates')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const n = info.crates + 1;
  for (let i = 0; i < n; i += 1) {
    const c = document.createElement('canvas');
    c.width = 120 * dpr;
    c.height = 132 * dpr;
    c.style.width = '120px';
    c.style.height = '132px';
    c.style.setProperty('--i', String(i));
    c.style.setProperty('--n', String(n));
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    drawCrate(g, 6, 24, 108, { color: i % 4, lock: 0 });
    host.append(c);
  }
  playSfx('sok-conveyor', { volume: 0.4 });
  const t0 = performance.now();
  let spec: RandomSpec;
  try {
    spec = (await orderRandom(ctx, tier)).spec;
  } catch (err) {
    console.error('[sokoban] random order failed', err);
    el.remove();
    ctx.go({ name: 'map' });
    return;
  }
  const minMs = ctx.test ? 0 : 760;
  const wait = Math.max(0, minMs - (performance.now() - t0));
  await new Promise((r) => setTimeout(r, wait));
  el.classList.add('is-open');
  playSfx('ui-pop-big', { volume: 0.7 });
  if (!ctx.test) setTimeout(() => playSfx('sok-land', { volume: 0.5 }), 380);
  await new Promise((r) => setTimeout(r, ctx.test ? 0 : 560));
  const def = randomLevelDef(spec);
  ctx.go({ name: 'play', id: def.id, fresh: true, def });
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), ctx.test ? 0 : 300);
}
