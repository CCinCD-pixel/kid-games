/**
 * `?test=1` hook (spec §8.10): window.__em for Playwright. Lazy chunk; absent without the parameter.
 */
import type { App } from '../app';
import type { AppCtx, ScreenReq } from '../ctx';
import type { PlayScreen } from '../screens/play';
import type { BoosterUse, Move } from '../core/types';
import { boardString } from '../core';
import { stepToOp } from '../core/expect';

export function installTestHook(ctx: AppCtx, app: () => App | null): void {
  const play = () => ctx.play as PlayScreen | null;
  // record the log marks (spec §8.11: ≤ 2 per attempt, level-end ≤ 200 bytes) without changing them
  const marks: { name: string; data?: Record<string, unknown> }[] = [];
  const mark = ctx.mark;
  ctx.mark = (name, data) => { marks.push({ name, data }); mark(name, data); };
  (window as unknown as { __em: unknown }).__em = {
    state: () => { const p = play(); return p ? { id: p.def.id, mode: p.mode, movesUsed: p.st.movesUsed, ready: p.ready, done: p.done, won: p.won(), seed: p.seed, energy: p.st.energy } : null; },
    screen: () => app()?.req ?? null,
    bestMove: () => play()?.bestMove() ?? null,
    lessonMove: () => play()?.lessonMove() ?? null,
    /** the puzzle's standard solution as moves (puzzle mode only) */
    solution: () => { const p = play(); return p?.puzzle ? p.puzzle.solution.map((s) => stepToOp(p.st, s).move) : null; },
    legal: () => play()?.legal() ?? [],
    play: (mv: Move) => play()?.play(mv) ?? Promise.resolve(false),
    tool: (use: BoosterUse) => play()?.tool(use) ?? Promise.resolve(false),
    bar: (id: string) => play()?.barPress(id),
    plant: (list: [number, number][]) => play()?.plant(list) ?? [],
    aiming: () => play()?.aiming ?? false,
    toolUses: () => play()?.uses ?? 0,
    /** spec §8.10: fast-forward the main-line play clock (15-minute stop bubble) */
    advanceClock: (ms: number) => { ctx.playMs += ms; },
    setSeed: (n: number) => { ctx.forceSeed = n; },
    forceAssist: (t: number) => { ctx.forceAssist = t; },
    goto: (r: ScreenReq) => app()?.go(r),
    timeScale: (n: number) => { ctx.timeScale = n; },
    step: (ms: number) => play()?.pauseAt(ms),
    pause: () => play()?.pause(),
    resume: () => play()?.resume(),
    setSave: (obj: Record<string, unknown>) => { Object.assign(ctx.save.data, obj); ctx.save.commit(); },
    save: () => JSON.parse(JSON.stringify(ctx.save.data)),
    rects: () => play()?.rects() ?? null,
    board: () => { const p = play(); return p ? boardString(p.st) : null; },
    width: () => play()?.L.W ?? 0,
    voiceLog: () => ctx.voice.log.slice(),
    marks: () => JSON.parse(JSON.stringify(marks)),
    /** masked cells of the current lesson / aim (null = no mask) */
    mask: () => { const p = play(); return p?.scene.maskCells ? [...p.scene.maskCells] : null; },
    ghost: () => !!document.querySelector('.em-ghost:not([hidden])'),
    hintCells: () => { const p = play(); return p?.scene.hintCells ? [...p.scene.hintCells] : null; },
    /** spec §2.6: show the first-run dock cutscene (screenshots); resolves when it ends */
    cutscene: () => import('../screens/cutscene').then((m) => m.playCutscene(ctx)),
    goals: () => [...document.querySelectorAll('.em-goal__n')].map((e) => e.textContent ?? ''),
    /** V12 silhouettes on the real sprites: pairwise IoU of the six gem alpha masks at cell 76 × DPR 2 */
    art: async () => {
      const { buildAtlas } = await import('../view/atlas');
      const size = 152, atlas = await buildAtlas(size);
      const masks: Uint8Array[] = [], pixels: Uint8ClampedArray[] = [];
      for (let g = 0; g < 6; g += 1) {
        const cv = document.createElement('canvas'); cv.width = cv.height = size;
        const c = cv.getContext('2d')!;
        atlas.draw(c, `gem${g}`, size / 2, size / 2, size);
        const d = c.getImageData(0, 0, size, size).data, m = new Uint8Array(size * size);
        for (let k = 0; k < m.length; k += 1) m[k] = d[k * 4 + 3] > 127 ? 1 : 0;
        masks.push(m); pixels.push(d); cv.width = cv.height = 0;
      }
      // V12 strokes ≥ 2 css px at cell 76: erode each mask by 1 device px; no part (component) may vanish
      const comps = (m: Uint8Array) => {
        const seen = new Uint8Array(m.length); let n = 0;
        for (let k = 0; k < m.length; k += 1) {
          if (!m[k] || seen[k]) continue;
          let area = 0; const st = [k]; seen[k] = 1;
          while (st.length) { const q = st.pop()!; area += 1; const x = q % size, y = (q / size) | 0;
            for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue; const j = ny * size + nx; if (m[j] && !seen[j]) { seen[j] = 1; st.push(j); } } }
          if (area >= 3) n += 1;
        }
        return n;
      };
      const erode = (m: Uint8Array) => m.map((v, k) => { const x = k % size, y = (k / size) | 0; return v && x > 0 && y > 0 && x < size - 1 && y < size - 1 && m[k - 1] && m[k + 1] && m[k - size] && m[k + size] ? 1 : 0; });
      const strokes = masks.map((m) => ({ before: comps(m), after: comps(erode(m)) }));
      // ice keeps the gem's hue (QA r1, §6.5): mean colour of the gem's centre with and without ice1/ice2 on top
      const hue = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
      const ice: number[][] = [];
      for (let g = 0; g < 6; g += 1) {
        const row: number[] = []; let h0 = 0;
        for (const over of ['', 'ice1', 'ice2']) {
          const cv = document.createElement('canvas'); cv.width = cv.height = size;
          const c = cv.getContext('2d')!;
          atlas.draw(c, `gem${g}`, size / 2, size / 2, size);
          if (over) atlas.draw(c, over, size / 2, size / 2, size);
          const d = c.getImageData(size * 0.3, size * 0.3, size * 0.4, size * 0.4).data;
          let r = 0, gg = 0, b = 0, n = 0;
          for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 200) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; n += 1; }
          const h = hue(r / n, gg / n, b / n); cv.width = cv.height = 0;
          if (!over) h0 = h; else { const dh = Math.abs(h - h0); row.push(Math.min(dh, 360 - dh)); }
        }
        ice.push(row);
      }
      atlas.dispose();
      // V12c (spec §6.3, §9.2): the rendered sprite's outermost 2 device px ring (every visible pixel not
      // in the twice-eroded mask), alpha-weighted mean colour → WCAG contrast against both tile colours
      const { BOARD } = await import('../view/art/palette');
      const lum = (r: number, g: number, b: number) => { const f = (v: number) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const hexLum = (h: string) => lum(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
      const tiles = [BOARD.tileA, BOARD.tileB].map(hexLum);
      const rim = masks.map((m, g) => {
        const inner = erode(erode(m)), d = pixels[g];
        let r = 0, gg = 0, b = 0, w = 0;
        for (let k = 0; k < m.length; k += 1) { const a = d[k * 4 + 3]; if (!a || inner[k]) continue; r += d[k * 4] * a; gg += d[k * 4 + 1] * a; b += d[k * 4 + 2] * a; w += a; }
        const L = lum(r / w, gg / w, b / w);
        return tiles.map((t) => +((Math.max(L, t) + 0.05) / (Math.min(L, t) + 0.05)).toFixed(2));
      });
      const iou: number[][] = [];
      for (let a = 0; a < 6; a += 1) { iou.push([]); for (let b = 0; b < 6; b += 1) { let i = 0, u = 0; for (let k = 0; k < masks[a].length; k += 1) { i += masks[a][k] & masks[b][k]; u += masks[a][k] | masks[b][k]; } iou[a].push(u ? i / u : 0); } }
      return { iou, area: masks.map((m) => m.reduce((x, y) => x + y, 0) / m.length), ice, strokes, rim };
    },
  };
}
