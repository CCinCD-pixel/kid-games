import { h } from '@kit/ui';
import { sfx } from '@kit/audio';
import { MAX_CUSTOM, type CustomMap, type RoverSave } from '../save';
import { parseLevel, run, parseProg, DEFAULT_CONFIG, type Level } from '../model/sim';

export const EDIT_W = 5, EDIT_H = 4;
const ARROWS = ['>', 'v', '<', '^'] as const;
const GLYPH: Record<string, string> = { '.': '', '#': '⛰', o: '◯', a: '✦', G: '⚑', '>': '→', v: '↓', '<': '←', '^': '↑' };
const NEXT: Record<string, string> = { '.': '#', '#': 'o', o: 'a', a: '.' };

export const blankMap = (): string[] => Array.from({ length: EDIT_H }, (_, y) => (y === 1 ? '>' + '.'.repeat(EDIT_W - 1) : '.'.repeat(EDIT_W)));

/** the level a drawn map plays as: every card of the first chapters, ten slots */
export function customLevel(i: number, map: string[]): Level {
  return parseLevel({ id: `my-${i + 1}`, kind: 'grid', brief: '开到终点的小旗那里。', ch: 0, n: i + 1, role: '', title: `我的地图 ${i + 1}`, teach: '先看看哪里能走，再排卡片。', cards: ['F', 'L', 'R', 'P'], slots: 10, expectMin: 99, map, solution: { main: '' } });
}
const hasStartGoal = (map: string[]): boolean => map.join('').match(/[<>v^]/g)?.length === 1 && map.join('').split('G').length === 2;

export interface MineHost { root: HTMLElement; save: RoverSave; persist(): void; back(): void; test(map: string[], index: number): void; play(index: number): void }

/** the list of my maps, and the way to a new one */
export function renderMine(host: MineHost): void {
  const list = host.save.custom ?? [];
  const items = list.map((m, i) => h('div', { class: 'rc-mine-item' },
    h('div', { class: 'rc-mini' }, ...m.map.flatMap((row) => [...row].map((ch) => h('i', { class: `rc-c rc-c-${ch === '.' ? 'e' : ch === '#' ? 'r' : ch === 'o' ? 'o' : ch === 'a' ? 's' : ch === 'G' ? 'g' : 'v'}` })))),
    h('b', {}, `我的地图 ${i + 1}`),
    h('button', { class: 'xg-btn xg-btn--primary', type: 'button', onclick: () => host.play(i) }, '给爸爸玩'),
    h('button', { class: 'xg-btn', type: 'button', onclick: () => host.test(m.map, i) }, '改一改'),
    h('button', { class: 'xg-btn rc-del', type: 'button', 'aria-label': '删掉这张地图', onclick: () => { list.splice(i, 1); host.save.custom = list; host.persist(); renderMine(host); } }, '×')));
  const add = list.length < MAX_CUSTOM ? h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg', type: 'button', onclick: () => host.test(blankMap(), -1) }, '画一张新地图') : h('p', {}, '地图本满了，删掉一张再画新的。');
  host.root.replaceChildren(h('section', { class: 'rc-mapscreen rc-mine' }, h('header', { class: 'rc-maphead' }, h('h1', {}, '我的地图'), h('p', {}, '自己画，自己开通关，再给爸爸玩')),
    h('div', { class: 'rc-mine-list' }, ...items, add), h('button', { class: 'xg-btn', type: 'button', onclick: () => host.back() }, '回地图')));
}

export interface EditHost { root: HTMLElement; save: RoverSave; persist(): void; list(): void; drive(map: string[], index: number): void }

/** tap a cell to change it; 小车 and 小旗 have their own tools */
export function renderEditor(host: EditHost, start: string[], index: number): void {
  let map = [...start];
  let tool: 'draw' | 'car' | 'flag' = 'draw';
  let note = '';
  const grid = h('div', { class: 'rc-edgrid', style: `grid-template-columns: repeat(${EDIT_W}, 1fr)` });
  const say = h('p', { class: 'rc-ednote' });
  const set = (x: number, y: number, ch: string) => { const row = [...map[y]]; row[x] = ch; map[y] = row.join(''); };
  const find = (re: RegExp) => { for (let y = 0; y < EDIT_H; y++) for (let x = 0; x < EDIT_W; x++) if (re.test(map[y][x])) return { x, y }; return null; };
  const draw = () => {
    grid.replaceChildren(...map.flatMap((row, y) => [...row].map((ch, x) => h('button', { class: `rc-edcell rc-c-${ch === '.' ? 'e' : ch === '#' ? 'r' : ch === 'o' ? 'o' : ch === 'a' ? 's' : ch === 'G' ? 'g' : 'v'}`, type: 'button', 'data-x': String(x), 'data-y': String(y), 'aria-label': `第 ${y + 1} 行第 ${x + 1} 格`, onclick: () => tap(x, y) }, GLYPH[ch] ?? ''))));
    say.textContent = note || (tool === 'car' ? '点一格放小车，再点一下转方向。' : tool === 'flag' ? '点一格放终点小旗。' : '点格子：石头、坑、样本、空地轮流换。');
    (send as HTMLButtonElement).disabled = !hasStartGoal(map);
  };
  const tap = (x: number, y: number) => {
    const ch = map[y][x]; note = ''; sfx.play('ui-tap');
    if (tool === 'car') {
      if (ARROWS.includes(ch as never)) set(x, y, ARROWS[(ARROWS.indexOf(ch as never) + 1) % 4]);
      else { const old = find(/[<>v^]/); if (old) set(old.x, old.y, '.'); set(x, y, '>'); }
    } else if (tool === 'flag') {
      if (ch !== 'G') { const old = find(/G/); if (old) set(old.x, old.y, '.'); set(x, y, 'G'); }
    } else if (ch in NEXT) set(x, y, NEXT[ch]);
    else if (ch === 'G' || ARROWS.includes(ch as never)) note = '这里是小车或小旗，先用上面的工具把它们挪走。';
    draw();
  };
  const tools = (['draw', 'car', 'flag'] as const).map((t) => h('button', { class: 'xg-btn rc-tool', type: 'button', 'data-tool': t, 'aria-pressed': 'false', onclick: () => { tool = t; note = ''; tools.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool))); draw(); } }, t === 'draw' ? '画格子' : t === 'car' ? '放小车' : '放小旗'));
  tools[0].setAttribute('aria-pressed', 'true');
  const send = h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg', type: 'button', onclick: () => { if (!solvable(map)) { note = '这张图好像过不去，把石头挪开一点再试试。'; draw(); return; } host.drive(map, index); } }, '开一开试试');
  host.root.replaceChildren(h('section', { class: 'rc-mapscreen rc-editor' }, h('header', { class: 'rc-maphead' }, h('h1', {}, '画地图'), h('p', {}, '画好以后自己开一遍，开通关了才能存下来')),
    h('div', { class: 'rc-tools' }, ...tools), grid, say, h('div', { class: 'rc-actions' }, h('button', { class: 'xg-btn', type: 'button', onclick: () => host.list() }, '我的地图'), send)));
  draw();
}

/** does a drawn map have a way through at all? A search over the same moves the child has */
export function solvable(map: string[]): boolean {
  const lv = customLevel(0, map);
  const seen = new Set<string>(); let frontier: { p: string }[] = [{ p: '' }];
  for (let depth = 0; depth < 14 && frontier.length; depth++) {
    const next: { p: string }[] = [];
    for (const { p } of frontier) for (const a of ['F', 'L', 'R', 'P'] as const) {
      const r = run(lv, DEFAULT_CONFIG, parseProg(p + a));
      if (r.res === 'win') return true;
      if (r.res === 'crash') continue;
      const k = `${r.s.x},${r.s.y},${r.s.d},${r.s.m}`;
      if (!seen.has(k)) { seen.add(k); next.push({ p: p + a }); }
    }
    frontier = next;
  }
  return false;
}
export type { CustomMap };
