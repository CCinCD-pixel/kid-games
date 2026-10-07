// ?dev=perf — the V19 stress scene (spec §9.8). Landscape, night + smoke + fog, built from the K/R real peak (not C's):
// 48 machines (32 蚁傅, 2 冲车 charging, 1 云梯车 raising its ladder) + 25 cards + 60 projectiles + 200 particles, 阳燧
// working in all 5 lanes, for 60 s. The kernel runs for real; after every step the scene is topped up (broken machines
// come back behind, nobody breaches, cards are mended) so the load stays at the peak for the whole minute.
// The overlay shows frame work p50/p95/p99, drawImage calls, painted px / screen px, kernel µs per step and heap.
// Dev only: loaded by a dynamic import from app.ts, never in the normal bundle path.
import { addUnit, spawnEnemy, occupant } from '../lane/sim';
import type { CardId, Enemy, Level, SimState } from '../lane/types';
import type { Stage } from '../render/stage';

/** 5 lanes × 5 columns; every v1 card appears; 阳燧 in every lane (column 1) */
const CARDS: CardId[][] = [
  ['farm', 'beam', 'shooter', 'radial', 'wall'],
  ['bank', 'beam', 'shooter', 'lobber', 'wall'],
  ['farm', 'beam', 'burner', 'gust', 'wall'],
  ['bank', 'beam', 'shooter', 'hook', 'wall'],
  ['farm', 'beam', 'lobber', 'shooter', 'strike'],
] as CardId[][];
interface Slot { k: string; lane: number; id: number; extra?: Partial<Enemy> }
/** 48 machines: 4 swarms × 8 ants + 2 rams + 1 ladder + 13 others (every v1 machine kind on the board) */
function roster(): Slot[] {
  const r: Slot[] = [];
  for (const lane of [0, 1, 3, 4]) for (let i = 0; i < 8; i++) r.push({ k: 'ant', lane, id: 0 });
  r.push({ k: 'ram', lane: 2, id: 0, extra: { run: 20000 } }, { k: 'ram', lane: 4, id: 0, extra: { run: 20000 } });
  r.push({ k: 'ladder', lane: 1, id: 0, extra: { lad: 1 } });
  const more: [string, number][] = [['walker', 0], ['walker', 2], ['walker', 3], ['shielder', 1], ['shielder', 4], ['shielder_m', 2], ['brute', 0], ['brute', 3],
    ['flyer', 1], ['flyer', 3], ['smoker', 2], ['drummer', 0], ['drummer', 4]];
  for (const [k, lane] of more) r.push({ k, lane, id: 0 });
  return r;
}
const FRONT = 52000; // machines never get closer than column 5.2: the cards stay busy, the lines never break
const xBack = (S: SimState): number => 60000 + ((S.tick * 7919 + S.nextId * 104729) % 28000);

export function perfLevel(base: Level): Level {
  return { ...base, id: 'perf', name: '压测', type: 'practice', lanes: [1, 1, 1, 1, 1], boss: undefined, flags: [], star3: {}, voice: undefined, belt: undefined,
    env: { night: true, fogCol: 6 }, start: 9000, jitter: 0, spawns: [], noEnd: true, star3Text: '' } as Level;
}

export function stressHooks(): { setup(S: SimState, stage: Stage): void; tick(S: SimState, stage: Stage): void; frame(S: SimState, stage: Stage): void; degrade: number } {
  const slots = roster();
  const degrade = Number((location.search.match(/[?&]degrade=(\d)/) || [])[1] || 0);
  function cards(S: SimState): void {
    for (let l = 0; l < 5; l++) for (let c = 0; c < 5; c++) { const o = occupant(S, l, c); if (!o || o.dead) addUnit(S, CARDS[l][c], l, c); }
    for (const u of S.units) if (!u.dead) u.hp = u.max;
  }
  function machines(S: SimState, first: boolean): void {
    for (const s of slots) {
      const e = s.id ? S.enemies.find((q) => q.id === s.id) : undefined;
      if (!e || e.gone || e.hp <= 0) { const x = first ? 56000 + ((slots.indexOf(s) * 9973) % 32000) : xBack(S); s.id = spawnEnemy(S, s.k, s.lane, x, s.extra).id; continue; }
      if (e.x < FRONT) e.x = xBack(S);
      if (e.hp < e.max * 0.35) e.hp = e.max; // keep hit flashes and chips coming, never the break-apart of the whole wave
      if (s.k === 'ram') e.run = 20000;
      if (s.k === 'ladder' && e.lad !== 1) { e.lad = 1; e.ladT = S.tick + 40; }
      if (s.k === 'ladder' && e.ladT <= S.tick) e.ladT = S.tick + 40; // keep raising
    }
  }
  function bolts(S: SimState): void {
    const src = S.units.find((u) => u.k === 'shooter'); if (!src) return;
    for (let i = 0; S.bolts.length < 60 && i < 60; i++) S.bolts.push({ lane: (S.tick + i) % 5, x: 6000 + ((S.tick * 31 + i * 9001) % 70000), dmg: 4, src, pierce: 0, hitIds: null });
  }
  function smoke(S: SimState): void { for (const [l, c] of [[1, 6], [1, 7], [3, 5], [3, 6], [2, 7]]) S.smoke[l][c] = Math.max(S.smoke[l][c], S.tick + 60); }
  function beams(S: SimState): void { // 阳燧 5 路全开 (night stops it in the kernel; the scene keeps the rays on for the render load)
    for (const u of S.units) if (u.k === 'beam' && !u.dead) { const t = S.enemies.find((e) => e.lane === u.lane && !e.gone && e.hp > 0 && e.layer !== 'air'); u.tgt = t ? t.id : 0; u.tOn = 80; }
  }
  return {
    degrade,
    setup(S, stage) { S.grain = 9000; cards(S); machines(S, true); bolts(S); smoke(S); beams(S); stage.fillParticles(200); },
    tick(S, stage) { cards(S); machines(S, false); bolts(S); smoke(S); beams(S); S.logs = S.logs.map(() => 1); stage.fillParticles(200); },
    frame(_S, stage) { stage.fillParticles(200); },
  };
}

/** small fixed overlay (top centre) — refreshed 4× a second from window.__gf.perf() */
export function perfOverlay(host: HTMLElement): () => void {
  const el = document.createElement('div'); el.className = 'gf-perfhud'; host.appendChild(el);
  const t0 = performance.now();
  const id = setInterval(() => {
    const g = (window as unknown as { __gf?: { perf(): Record<string, unknown> & { work: Record<string, number>; fill: Record<string, number> } } }).__gf; if (!g) return;
    const p = g.perf(); const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const sec = Math.floor((performance.now() - t0) / 1000);
    el.innerHTML = `<b>压测 ${sec}s</b> 帧 p50 ${p.work.p50} · p95 ${p.work.p95} · p99 ${p.work.p99} ms` +
      `<br>drawImage ${p.maxCalls} · 像素 ${p.fill.max}× 屏 · 内核 ${p.stepUs} µs/步 · 堆 ${mem ? Math.round(mem.usedJSHeapSize / 1048576) + ' MB' : '—'}` +
      `<br>机关 ${p.enemies} · 牒 ${p.units} · 弩箭 ${p.bolts} · 粒子 ${p.particles} · 降级 ${p.degrade} (DPR ${p.stageDpr}) · 图集 ${p.bakeMs} ms`;
  }, 250);
  return () => { clearInterval(id); el.remove(); };
}
