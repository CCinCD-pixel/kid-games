/**
 * Stage-2 screens (spec §2.1, §2.5, §4.6, §5): S7 挑战地图 (chapter tabs + kit nodeMap), story cards, S8 简报
 * (objective picture, one ≤15-char line, the two star conditions as icon chips — never seconds), the hint card
 * (H1/H2/H3), S9 关卡结算 (kit showResult; "先玩下一关" after 3 misses + H3), S10 收藏馆 (the only scrolling
 * screen; only the opened card animates), S11 纪录, and unlock cards. Never auto-advance.
 */
import { h, bindPress, nodeMap, showResult, starRating, type MapNode } from '@kit/ui';
import { miniReplay, hasClip } from './mini-replay';
import { MISSIONS, CHAPTERS, type Mission, type StarCond } from './sim/mission';
import { VENUES, VENUE_IDS, TROPHIES, type VenueId } from './sim/venues';
import { hex2rgb, paintSegment, segVariant, skinById } from './render/art';
import { paintSkinPortrait } from './render/skins';
import { C, allItems, progressOf, condText, starsTotal, type Item } from './collection';
import { planetBadge } from './screens';
import { lineText, play } from './audio';
import type { SaveCtl } from './save';

const CH_NAME = ['星尘新手', '躲闪高手', '截击战术', '围猎战术', '蛇王之路'];
const CH_PLANET: (VenueId | 'saturn')[] = ['moon', 'mars', 'jupiter', 'saturn', 'blackhole'];

// ---------------------------------------------------------------- icons (code-drawn SVG, 48 grid)
export const GOAL_SVG: Record<string, string> = {
  ring: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="15" fill="none" stroke="#ffd23f" stroke-width="6" stroke-dasharray="9 5"/><circle cx="24" cy="24" r="5" fill="#fff3c4"/></svg>',
  beacon: '<svg viewBox="0 0 48 48"><path d="M17 42 21 16h6l4 26z" fill="#c9d3ea" stroke="#2f3550" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="11" r="7" fill="#ffd23f"/></svg>',
  target: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17" fill="none" stroke="#ffd23f" stroke-width="4" stroke-dasharray="7 5"/><circle cx="24" cy="24" r="9" fill="#ff7a59"/><circle cx="21" cy="22" r="2.6" fill="#fff"/><circle cx="27.5" cy="22" r="2.6" fill="#fff"/></svg>',
  crown: '<svg viewBox="0 0 48 48"><path d="M7 35 6 15l10 9 8-14 8 14 10-9-1 20z" fill="#ffcf3a" stroke="#7a4a00" stroke-width="3" stroke-linejoin="round"/><path d="M24 25l3 4-3 4-3-4z" fill="#ff4fa3"/></svg>',
  core: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="#7fd4ff" opacity=".35"/><path d="M24 8l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="#fff"/></svg>',
  shield: '<svg viewBox="0 0 48 48"><path d="M24 6 39 12v11c0 9-7 16-15 19C16 39 9 32 9 23V12z" fill="#5ad8ff" stroke="#0f5a7a" stroke-width="3" stroke-linejoin="round"/></svg>',
  meteor: '<svg viewBox="0 0 48 48"><path d="M8 10l18 12" stroke="#ff9ad0" stroke-width="5" stroke-linecap="round"/><circle cx="30" cy="27" r="11" fill="#ff5f9e" stroke="#c2386f" stroke-width="3"/></svg>',
  big: '<svg viewBox="0 0 48 48"><path d="M24 6l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#ffd23f" stroke="#b86a00" stroke-width="3" stroke-linejoin="round"/></svg>',
  orb: '<svg viewBox="0 0 48 48"><circle cx="16" cy="28" r="7" fill="#ffd84d"/><circle cx="31" cy="20" r="6" fill="#3fd0ff"/><circle cx="33" cy="35" r="5" fill="#ff5f7e"/></svg>',
  clock: '<svg viewBox="0 0 48 48"><path d="M14 7h20M14 41h20M16 7c0 10 16 10 16 17s-16 7-16 17M32 7c0 10-16 10-16 17s16 7 16 17" fill="none" stroke="#ffe7a8" stroke-width="3.5" stroke-linecap="round"/></svg>',
  len: '<svg viewBox="0 0 48 48"><path d="M8 34c6-12 14 4 20-8s12-6 12-6" fill="none" stroke="#83d766" stroke-width="8" stroke-linecap="round"/><circle cx="40" cy="20" r="5" fill="#83d766"/></svg>',
  race: '<svg viewBox="0 0 48 48"><path d="M14 40V8M14 9h22l-5 7 5 7H14" fill="#ffd23f" stroke="#7a4a00" stroke-width="3" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
};
export function goalKind(m: Mission): string {
  const o = m.objective;
  if (m.ai.some((a) => a.crown)) return 'crown';
  if (o.type === 'rings') return (o.radius ?? 0) >= 150 ? 'beacon' : 'ring';
  if (o.type === 'kill' || o.type === 'streak') return 'target';
  if (o.type === 'eat') return o.kind === 'meteor' ? 'meteor' : o.kind === 'big' ? 'big' : 'orb';
  return ({ pu: 'shield', loop: 'core', survive: 'clock', length: 'len', race: 'race' } as Record<string, string>)[o.type] ?? 'ring';
}
const STAR_ICON: Record<string, string> = {
  deathsLE: '<svg viewBox="0 0 24 24"><path d="M12 3 20 6.5v5.5c0 4.6-3.5 8-8 9.5C7.5 20 4 16.6 4 12V6.5z" fill="#5ad8ff"/></svg>',
  bumpsLE: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="#8d97ad"/><path d="M6 18 18 6" stroke="#fff" stroke-width="2.6"/></svg>',
  timeLE: GOAL_SVG.clock, massGE: GOAL_SVG.len, eatGE: GOAL_SVG.big, puGE: '<svg viewBox="0 0 24 24"><path d="M5 5h5v7a2 2 0 0 0 4 0V5h5v7a7 7 0 0 1-14 0z" fill="#ff7aa8"/></svg>',
  killTagGE: GOAL_SVG.target, killsGE: GOAL_SVG.target, killRatioGE: GOAL_SVG.target, rankLE: GOAL_SVG.race, aiMeteorsLE: GOAL_SVG.meteor, multiGE: GOAL_SVG.target, nearGE: GOAL_SVG.clock, shieldSavesGE: GOAL_SVG.shield,
};
/** a star condition as a short label (icons carry the meaning; never seconds, spec §3.20) */
export function starLabel(c: StarCond): string {
  const tag: Record<string, string> = { cut: '截住', encircle: '围住', body: '撞上', headon: '头碰头' };
  const kind: Record<string, string> = { big: '大星珠', any: '星尘', meteor: '流星糖', drop: '掉落', magnet: '吸铁石', shield: '护盾', speed: '闪电' };
  switch (c.type) {
    case 'clear': return '过关';
    case 'deathsLE': return c.n === 0 ? '不出局' : `出局不超过 ${c.n} 次`;
    case 'bumpsLE': return c.n === 0 ? '不碰撞' : `碰撞不超过 ${c.n} 次`;
    case 'timeLE': return '快一点';
    case 'massGE': return `长到 ${c.n}`;
    case 'eatGE': return `${kind[c.kind!] ?? ''} ${c.n} 个`;
    case 'puGE': return `${kind[c.kind!] ?? '道具'} ${c.n} 个`;
    case 'killTagGE': return `${tag[c.tag!] ?? '击败'} ${c.n} 次`;
    case 'killsGE': return `击败 ${c.n} 条`;
    case 'killRatioGE': return `打败 ${c.n} 倍大的蛇`;
    case 'rankLE': return c.n === 1 ? '拿第一' : `前 ${c.n} 名`;
    case 'aiMeteorsLE': return '不让它们吃流星糖';
    case 'multiGE': return `${c.n} 连击`;
    default: return '';
  }
}
/** H1 note: what the gold arrow points at on this level (QA r5: was one generic line everywhere) */
function arrowNote(m: Mission): string {
  const o = m.objective, tags = [o.tag, ...(o.tags ?? [])];
  if (tags.includes('cut')) return '金色箭头带你抢到它前面。';
  if (o.type === 'loop' || tags.includes('encircle')) return '跟着金色箭头，绕着它游一圈。';
  if (o.type === 'rings') return '金色箭头指着下一个星环。';
  if (o.type === 'survive') return '金色箭头指着没有蛇的地方。';
  if (o.type === 'pu') return '金色箭头指着最近的道具。';
  if (o.type === 'eat' || o.type === 'length') return '金色箭头指着星尘多的地方。';
  return '开局跟着金色箭头游。';
}
function starChip(c: StarCond, n: 2 | 3) {
  const el = h('span', { class: 'sb-starchip' });
  el.innerHTML = `<b>${'★'.repeat(n)}</b><i>${STAR_ICON[c.type] ?? ''}</i><span>${starLabel(c)}</span>`;
  return el;
}

function scrim(root: HTMLElement, cls: string, ...kids: (Node | string)[]) {
  const s = h('div', { class: `sb-scrim ${cls}` }, ...kids); root.append(s); bindPress(s); return s;
}
function btn(label: string, kind: string, on: () => void, sfx = 'ui-confirm') {
  const b = h('button', { class: `xg-btn ${kind}`, type: 'button', 'data-sfx': sfx }, label); b.addEventListener('click', on); return b;
}
function backBtn(on: () => void) {
  const b = h('button', { class: 'sb-backbtn', type: 'button', 'aria-label': '返回', 'data-sfx': 'ui-back' });
  b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  b.addEventListener('click', on); return b;
}

// ---------------------------------------------------------------- S7 挑战地图
export interface MapHandlers { onPick: (id: string) => void; onBack: () => void; onChapter: (ch: number, first: boolean) => void }
export function missionMap(root: HTMLElement, save: SaveCtl, ch0: number, hd: MapHandlers) {
  const d = save.data;
  let ch = ch0;
  const tabs = h('div', { class: 'sb-chtabs' });
  const box = h('div', { class: 'sb-map__road' });
  const head = h('div', { class: 'sb-map__head' });
  const el = h('section', { class: 'sb-map' }, h('div', { class: 'sb-map__bar' }, backBtn(hd.onBack), h('h2', { class: 'sb-map__title' }, '挑战关'), h('span', { class: 'sb-map__stars' }, `★ ${starsTotal(d)} / 120`)), tabs, head, box);
  root.append(el); bindPress(el);
  const marker = h('div', { class: 'sb-map__me' });
  marker.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#ffc93c" stroke="#7a4a00" stroke-width="3"/><circle cx="14.5" cy="18" r="4" fill="#fff"/><circle cx="25.5" cy="18" r="4" fill="#fff"/><circle cx="15" cy="18.5" r="2" fill="#222"/><circle cx="26" cy="18.5" r="2" fill="#222"/></svg>';
  const draw = () => {
    tabs.replaceChildren(...[1, 2, 3, 4, 5].map((c) => {
      const open = save.chapterOpen(c);
      const stars = CHAPTERS[c - 1].reduce((a, m) => a + (d.missions[m.id]?.stars ?? 0), 0);
      const b = h('button', { class: 'sb-chtab' + (c === ch ? ' is-sel' : '') + (open ? '' : ' is-locked'), type: 'button', 'data-sfx': open ? 'ui-select' : 'ui-locked', 'aria-label': `第${c}章` },
        h('span', { class: 'sb-chtab__planet' }, planetBadge(CH_PLANET[c - 1], 52, !open)), h('span', { class: 'sb-chtab__n' }, open ? `★${stars}` : ''), ...(open ? [] : [h('span', { class: 'sb-chtab__lock', 'aria-hidden': 'true' })]));
      b.addEventListener('click', () => { if (!open) return; ch = c; draw(); hd.onChapter(c, false); });
      return b;
    }));
    head.replaceChildren(h('span', { class: 'sb-map__ch' }, `第${'一二三四五'[ch - 1]}章`), h('span', { class: 'sb-map__chname' }, CH_NAME[ch - 1]));
    const cur = save.currentMission();
    const nodes: MapNode[] = CHAPTERS[ch - 1].map((m) => {
      const rec = d.missions[m.id], open = save.missionOpen(m.id);
      const state: MapNode['state'] = !open ? 'locked' : m.id === cur ? 'current' : rec && rec.clears > 0 ? 'done' : 'open';
      return { id: m.id, label: `${m.ch}-${m.id.slice(3)}`, state, stars: rec?.stars ?? 0, boss: m.role === 'boss' };
    });
    box.replaceChildren();
    // phones (shorter side < 600 px): a tighter edge pad so the 8 nodes spread over the whole road
    const phone = Math.min(innerWidth, innerHeight) < 600;
    const btns = nodeMap(box, nodes, { ...(phone ? { pad: 36 } : {}), marker: nodes.some((n) => n.state === 'current') ? marker : undefined, onPick: (n) => { if (n.state !== 'locked') hd.onPick(n.id); } });
    btns.forEach((b, i) => {
      const m = CHAPTERS[ch - 1][i];
      b.classList.add(`sb-node--${m.role}`);
      b.insertAdjacentHTML('beforeend', `<span class="sb-node__title">${m.title}</span>`);
      if (d.missions[m.id]?.skipped && !(d.missions[m.id].clears > 0)) b.classList.add('is-skipped');
    });
  };
  draw();
  const onResize = () => draw();
  addEventListener('resize', onResize);
  return { el, chapter: () => ch, redraw: draw, dispose() { removeEventListener('resize', onResize); el.remove(); } };
}

/** 故事卡 (spec §1.2, §2.5): planet + one ≤15-char line read by the narrator; tap anywhere closes */
export function storyCard(root: HTMLElement, ch: number | 'end', onClose: () => void) {
  const id = ch === 'end' ? 'snake.story.end' : `snake.story.c${ch}`;
  const art = h('div', { class: 'sb-story__art' });
  if (ch === 'end') art.innerHTML = '<svg viewBox="0 0 200 200"><defs><radialGradient id="sbsl" cx="50%" cy="45%"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffb347"/><stop offset="1" stop-color="#ff5a2a" stop-opacity="0"/></radialGradient></defs><circle cx="100" cy="92" r="90" fill="url(#sbsl)"/><path d="M40 150c30-40 50 10 80-25s40-10 50-20" fill="none" stroke="#d9452b" stroke-width="22" stroke-linecap="round"/><circle cx="170" cy="105" r="16" fill="#d9452b"/><path d="M160 86l8-14 8 14" fill="#ffcf3a"/><circle cx="174" cy="102" r="4" fill="#fff"/></svg>';
  else art.append(planetBadge(CH_PLANET[ch - 1], 300, false));
  const s = scrim(root, 'sb-story', h('div', { class: 'sb-story__card xg-root' },
    art, h('div', { class: 'sb-story__ch' }, ch === 'end' ? '尾声' : `第${'一二三四五'[(ch as number) - 1]}章 · ${CH_NAME[(ch as number) - 1]}`), h('p', { class: 'sb-story__line' }, lineText(id)), h('div', { class: 'sb-story__tap' }, '点一下继续')));
  let done = false;
  const close = () => { if (done) return; done = true; s.classList.add('is-out'); setTimeout(() => { s.remove(); onClose(); }, 220); };
  setTimeout(() => s.addEventListener('click', close), 400);
  return { id, close };
}

// ---------------------------------------------------------------- S8 简报 / hint card
export interface BriefOpts { m: Mission; hint: 0 | 1 | 2 | 3; firstTime: boolean; onStart: () => void; onWatch?: () => void; onDemo?: () => void; onBack: () => void; onReplay: () => void }
export function briefCard(root: HTMLElement, o: BriefOpts) {
  const m = o.m;
  const pic = h('div', { class: `sb-brief__pic sb-gi--${goalKind(m)}` }); pic.innerHTML = GOAL_SVG[goalKind(m)];
  // H1 (spec §5.1): a small direction diagram — his head, the gold arrow, the target — instead of the goal icon (QA r3)
  if (o.hint === 1 && !o.firstTime) {
    pic.classList.add('is-dir');
    pic.innerHTML = `<svg viewBox="0 0 168 168" aria-hidden="true"><circle cx="40" cy="96" r="25" fill="#6fd16a" stroke="#1d4f2a" stroke-width="4"/><circle cx="50" cy="86" r="7.5" fill="#fff" stroke="#20223a" stroke-width="2.5"/><circle cx="50" cy="106" r="7.5" fill="#fff" stroke="#20223a" stroke-width="2.5"/><circle cx="53" cy="86" r="3.6" fill="#1a1830"/><circle cx="53" cy="106" r="3.6" fill="#1a1830"/><path class="sb-dir__dash" d="M74 90 Q100 66 112 62" fill="none" stroke="#ffd23f" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 12"/><path d="M104 50l22 7-15 17z" fill="#ffd23f" stroke="#7a4a00" stroke-width="3" stroke-linejoin="round"/>${GOAL_SVG[goalKind(m)].replace('<svg', '<svg x="112" y="8" width="54" height="54"')}</svg>`;
  }
  const line = lineText(o.hint >= 1 && !o.firstTime ? m.lines.h1 : m.lines.brief);
  const chips = h('div', { class: 'sb-brief__chips' }, ...(m.stars[0].type === 'clear' ? [] : [starChip(m.stars[0], 2), starChip(m.stars[1], 3)]));
  const actions = h('div', { class: 'sb-brief__actions' });
  if (o.hint >= 2 && o.onWatch) actions.append(btn('看一招', 'xg-btn--secondary', o.onWatch, 'ui-open'));
  if (o.hint >= 3 && o.onDemo) actions.append(btn('看示范', 'xg-btn--secondary sb-btn--demo', o.onDemo, 'ui-open'));
  actions.append(btn('开始', 'xg-btn--primary xg-btn--lg', o.onStart, 'ui-confirm'));
  const replay = h('button', { class: 'sb-replay', type: 'button', 'aria-label': '再听一遍', 'data-sfx': 'ui-tap' });
  replay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  replay.addEventListener('click', o.onReplay);
  // H2 (spec §5.1): the ghost replay loops in a small canvas on the card's right, in place of the goal picture
  let clip: HTMLElement | '' = '';
  if (o.hint >= 2 && hasClip(m.id)) {
    const cv = h('canvas', { class: 'sb-brief__cv', width: '392', height: '392', 'aria-hidden': 'true' }) as HTMLCanvasElement;
    clip = h('div', { class: 'sb-brief__clip' }, cv, h('span', { class: 'sb-brief__cliptag' }, '看一招'));
    requestAnimationFrame(() => miniReplay(cv, m.id, matchMedia('(prefers-reduced-motion: reduce)').matches));
  }
  const s = scrim(root, 'sb-brief', h('div', { class: 'sb-brief__card xg-root' },
    h('div', { class: 'sb-brief__top' }, backBtn(o.onBack), h('span', { class: 'sb-brief__no' }, `${m.ch}-${m.id.slice(3)}`), h('h2', { class: 'sb-brief__title' }, m.title), replay),
    h('div', { class: 'sb-brief__body' }, clip ? '' : pic, h('div', { class: 'sb-brief__text' }, h('p', { class: 'sb-brief__line' }, line), chips), clip),
    o.hint >= 1 && !o.firstTime ? h('p', { class: 'sb-brief__hint' }, o.hint >= 3 ? '卡住了？看看领航员怎么玩。' : o.hint >= 2 ? '看一招再试试！' : `小提示：${arrowNote(m)}`) : '',
    actions));
  return s;
}

// ---------------------------------------------------------------- S9 关卡结算
export interface ResultOpts { m: Mission; ok: boolean; stars: number; star2: boolean; star3: boolean; praise: string; retry: string; canSkip: boolean; hasNext: boolean; twin: boolean; cause?: HTMLElement; nextLabel?: string }
export function missionResult(o: ResultOpts): Promise<string> {
  const m = o.m;
  const actions: { id: string; label: string; kind?: 'primary' | 'secondary' | 'accent' | 'gold' }[] = [];
  if (o.ok && o.hasNext) actions.push({ id: 'next', label: o.nextLabel ?? '下一关', kind: 'primary' });
  actions.push({ id: 'again', label: o.ok ? '再玩一次' : '再试一次', kind: o.ok ? 'secondary' : 'primary' });
  if (!o.ok && o.canSkip) actions.push({ id: 'skip', label: '先玩下一关', kind: 'accent' });
  actions.push({ id: 'map', label: '地图', kind: 'secondary' });
  return showResult({
    ribbon: `${m.ch}-${m.id.slice(3)} ${m.title}`, title: o.ok ? lineText(o.praise) || '过关！' : '差一点！',
    // a 1★ clear: the level's own tip as "next time", not a claim he mastered it (QA r5)
    text: o.ok ? (o.stars <= 1 && m.stars[0].type !== 'clear' && lineText(m.lines.h1) ? `下次试试：${lineText(m.lines.h1)}` : `学会了：${m.teaches}`) : lineText(o.retry) || '再来一次！',
    stars: (o.ok ? Math.max(1, o.stars) : 0) as 0 | 1 | 2 | 3, actions, accentGame: 'snake',
    onOpen: (panel) => {
      if (o.cause) { panel.classList.add('sb-res--cause'); const txt = panel.querySelector('.xg-modal__text'); if (txt) txt.after(o.cause); else panel.querySelector('.xg-modal__actions')?.before(o.cause); }
      if (m.stars[0].type === 'clear') return;
      const row = h('div', { class: 'sb-res__conds' }, ...[[m.stars[0], 2, o.star2], [m.stars[1], 3, o.star3]].map(([c, n, got]) => {
        // a chip's stars light only when those stars were earned (QA r5: ★★★ met without ★★ showed three gold stars
        // over a 1★ result); a met condition whose stars were not earned gets a tick on grey stars
        const ch = starChip(c as StarCond, n as 2 | 3), earned = o.ok && o.stars >= (n as number);
        if (!earned) ch.classList.add('is-miss'); if (!earned && got && o.ok) ch.classList.add('is-met');
        return ch;
      }));
      if (o.twin) row.append(h('span', { class: 'sb-res__twin' }, '换你来的这局最多 ★★'));
      const acts = panel.querySelector('.xg-modal__actions'); if (acts) acts.before(row); else panel.append(row);
    },
  });
}

// ---------------------------------------------------------------- unlock card
export function unlockCard(root: HTMLElement, key: string, onClose: () => void) {
  const it = allItems().find((x) => x.key === key);
  const isVenue = key.startsWith('venue:');
  const title = isVenue ? VENUES[key.slice(6) as VenueId].name : it?.item.name ?? '';
  const kindTxt = isVenue ? '新赛场' : it?.kind === 'skin' ? '新皮肤' : it?.kind === 'trail' ? '新尾迹' : it?.kind === 'badge' ? '新徽章' : it?.kind === 'crown' ? '王冠' : '新东西';
  const art = h('div', { class: 'sb-unlock__art' });
  if (isVenue) art.append(planetBadge(key.slice(6) as VenueId, 150, false));
  else if (it?.kind === 'skin') art.append(skinPreview(it.item.id, 240, 120, { anim: true }));
  else art.innerHTML = it?.kind === 'crown' ? GOAL_SVG.crown : it?.kind === 'trail' ? '<svg viewBox="0 0 48 48"><path d="M6 36c10-4 14-18 26-20" fill="none" stroke="#ffd23f" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 7"/><circle cx="38" cy="14" r="6" fill="#ffd23f"/></svg>' : '<svg viewBox="0 0 48 48"><circle cx="24" cy="20" r="13" fill="#ffd23f" stroke="#7a4a00" stroke-width="3"/><path d="M16 31l-4 13 12-6 12 6-4-13" fill="#ff7a59" stroke="#7a3a1a" stroke-width="3" stroke-linejoin="round"/><path d="M24 12l2.4 5 5.4.6-4 3.7 1.1 5.3L24 24l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" fill="#fff6c8"/></svg>';
  const s = scrim(root, 'sb-unlock', h('div', { class: 'sb-unlock__card xg-root' },
    h('div', { class: 'sb-unlock__kind' }, kindTxt), art, h('h2', { class: 'sb-unlock__name' }, title),
    it?.item.fact ? h('p', { class: 'sb-unlock__fact' }, it.item.fact) : '',
    btn('好的', 'xg-btn--primary xg-btn--lg', () => close())));
  // a tap anywhere on the card or backdrop also closes it, after a 400 ms guard against stray taps (QA r2)
  let closed = false; const t0 = performance.now();
  function close() { if (closed) return; closed = true; s.remove(); onClose(); }
  s.addEventListener('pointerup', (e) => { if ((e.target as Element).closest?.('button')) return; if (performance.now() - t0 >= 400) { play('ui-close'); close(); } });
  return s;
}

// ---------------------------------------------------------------- skin preview (static: head + 4 segments)
export function skinPreview(id: string, W: number, H: number, o: { anim?: boolean } = {}): HTMLElement {
  const sk = skinById(id), base = hex2rgb(sk.base), acc = hex2rgb(sk.accent);
  const mk = (closed: boolean) => {
    const cv = h('canvas', { class: 'sb-skinpv', width: W * 2, height: H * 2 }) as HTMLCanvasElement;
    cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const c = cv.getContext('2d')!; c.scale(2, 2);
    paintSkinPortrait(c, W, H, sk, base, acc, (cc, R, v) => paintSegment(cc, R, base, acc, v), (i, n) => segVariant(sk.pattern, i, n), { closed });
    return cv;
  };
  if (sk.head !== 'zhulong' || !o.anim) return mk(false);
  // 烛龙 in menus only: when it blinks the card dims for 150 ms — "闭眼是黑夜" (§6.5)
  const wrap = h('div', { class: 'sb-zhulong' });
  const shut = mk(true); shut.classList.add('sb-zhulong__closed');
  wrap.append(mk(false), shut, h('div', { class: 'sb-zhulong__night' }));
  return wrap;
}

// ---------------------------------------------------------------- S10 收藏馆
export interface CollectionHandlers { onBack: () => void; onEquip: (key: string) => void; onFact: (key: string) => void; onLocked: (key: string) => void }
export function collectionScreen(root: HTMLElement, save: SaveCtl, hd: CollectionHandlers) {
  const d = save.data;
  const TABS = [['space', '太空'], ['eng', '工程'], ['myth', '神话'], ['trail', '尾迹'], ['badge', '徽章']] as const;
  let tab: string = 'space';
  const tabs = h('div', { class: 'sb-coll__tabs' });
  const grid = h('div', { class: 'sb-coll__grid' });
  const owned = (k: string) => d.owned.includes(k);
  const nSkins = C.skins.filter((x) => owned(`skin:${x.id}`)).length;
  const el = h('section', { class: 'sb-coll' }, h('div', { class: 'sb-map__bar' }, backBtn(hd.onBack), h('h2', { class: 'sb-map__title' }, '收藏馆'), h('span', { class: 'sb-map__stars' }, `皮肤 ${nSkins}/${C.skins.length}`)), tabs, grid);
  root.append(el); bindPress(el);
  let few = false;
  const card = (key: string, it: Item, kind: string) => {
    const has = owned(key);
    const eq = (kind === 'skin' && d.equipped.skin === it.id) || (kind === 'trail' && d.equipped.trail === it.id);
    const b = h('button', { class: 'sb-ccard' + (has ? '' : ' is-locked') + (eq ? ' is-eq' : ''), type: 'button', 'data-sfx': has ? 'ui-select' : 'ui-locked' });
    const art = h('div', { class: 'sb-ccard__art' });
    if (kind === 'skin') art.append(few ? skinPreview(it.id, 200, 120) : skinPreview(it.id, 140, 84));
    else art.innerHTML = kind === 'trail' ? `<svg viewBox="0 0 48 48"><path d="M6 36c10-4 14-18 26-20" fill="none" stroke="${has ? '#ffd23f' : '#8d97ad'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 7"/><circle cx="38" cy="14" r="6" fill="${has ? '#ffd23f' : '#8d97ad'}"/></svg>` : kind === 'crown' ? GOAL_SVG.crown : '<svg viewBox="0 0 48 48"><circle cx="24" cy="20" r="13" fill="#ffd23f" stroke="#7a4a00" stroke-width="3"/><path d="M16 31l-4 13 12-6 12 6-4-13" fill="#ff7a59" stroke="#7a3a1a" stroke-width="3" stroke-linejoin="round"/></svg>';
    b.append(art, h('span', { class: 'sb-ccard__name' }, it.name));
    const cond = (it.unlock ?? it.cond)!;
    if (!has) {
      const p = progressOf(cond, d, (v) => save.venueOpen(v));
      b.append(h('span', { class: 'sb-ccard__cond' }, condText(cond)));
      if (p.n > 1) { const bar = h('span', { class: 'sb-ccard__bar' }, h('i', { style: `width:${Math.min(100, (100 * p.cur) / p.n).toFixed(0)}%` })); b.append(bar, h('span', { class: 'sb-ccard__p' }, `${Math.min(p.cur, p.n)}/${p.n}`)); }
    } else if (eq) b.append(h('span', { class: 'sb-ccard__eq' }, '已装备'));
    b.addEventListener('click', () => { if (!has) { hd.onLocked(key); return; } open(key, it, kind); });
    return b;
  };
  const open = (key: string, it: Item, kind: string) => {
    hd.onFact(key);
    const canEquip = kind === 'skin' || kind === 'trail';
    const big = h('div', { class: 'sb-cbig__art' });
    if (kind === 'skin') { big.append(skinPreview(it.id, 300, 150, { anim: true })); big.classList.add('is-swim'); }
    else big.innerHTML = card(key, it, kind).querySelector('.sb-ccard__art')!.innerHTML;
    const s = scrim(root, 'sb-cbig', h('div', { class: 'sb-cbig__card xg-root' }, big, h('h2', { class: 'sb-unlock__name' }, it.name), it.fact ? h('p', { class: 'sb-unlock__fact' }, it.fact) : '',
      h('div', { class: 'sb-brief__actions' }, ...(canEquip ? [btn('装备', 'xg-btn--primary', () => { hd.onEquip(key); s.remove(); draw(); })] : []), btn('关上', 'xg-btn--secondary', () => s.remove(), 'ui-close'))));
  };
  const draw = () => {
    tabs.replaceChildren(...TABS.map(([id, label]) => { const b = h('button', { class: 'sb-coll__tab' + (tab === id ? ' is-sel' : ''), type: 'button', 'data-sfx': 'ui-select' }, label); b.addEventListener('click', () => { tab = id; draw(); grid.scrollTop = 0; }); return b; }));
    const cards: HTMLElement[] = [];
    // a tab of ≤ 8 (each skin family, trails): 3 big cards a row instead of a sparse grid (QA r4)
    few = (tab === 'trail' ? C.trails.length : tab === 'badge' ? 1 + C.badges.length : C.skins.filter((x) => x.family === tab).length) <= 8;
    grid.classList.toggle('is-few', few);
    if (tab === 'trail') for (const it of C.trails) cards.push(card(`trail:${it.id}`, it, 'trail'));
    else if (tab === 'badge') { cards.push(card('crown', C.crown, 'crown')); for (const it of C.badges) cards.push(card(`badge:${it.id}`, it, 'badge')); }
    else for (const it of C.skins.filter((x) => x.family === tab)) cards.push(card(`skin:${it.id}`, it, 'skin'));
    grid.replaceChildren(...cards);
  };
  draw();
  return { el, dispose() { el.remove(); } };
}

// ---------------------------------------------------------------- S11 纪录
export function recordsScreen(root: HTMLElement, save: SaveCtl, onBack: () => void) {
  const d = save.data;
  const cards = VENUE_IDS.map((v) => {
    const r = d.venues[v], open = save.venueOpen(v);
    const tro = TROPHIES[v].map((t) => h('span', { class: 'sb-rec__tro' + (d.owned.includes(`trophy:${v}.${t.id}`) ? ' is-on' : '') }, t.name));
    return h('div', { class: 'sb-rec__card' + (open ? '' : ' is-locked') },
      h('div', { class: 'sb-rec__head' }, planetBadge(v, 56, !open), h('span', { class: 'sb-rec__name' }, VENUES[v].name)),
      h('div', { class: 'sb-rec__stats' },
        stat('最好名次', r.bestRank ? `第 ${r.bestRank}` : '—'), stat('最长', r.bestPeak || '—'), stat('最多击败', r.bestKills || '—'), stat('前三', r.podiums),
        stat('无尽最长', r.endless.bestPeak || '—'), stat('活得最久', r.endless.bestLife ? `${Math.floor(r.endless.bestLife / 60)}分${r.endless.bestLife % 60}秒` : '—')),
      h('div', { class: 'sb-rec__tros' }, ...tro));
  });
  const done = MISSIONS.filter((m) => (d.missions[m.id]?.clears ?? 0) > 0).length;
  const ms = h('div', { class: 'sb-rec__card sb-rec__card--mission' }, h('div', { class: 'sb-rec__head' }, h('span', { class: 'sb-rec__name' }, '挑战关')),
    h('div', { class: 'sb-rec__stats' }, stat('通过', `${done}/40`), stat('星星', `${starsTotal(d)}/120`), stat('一共击败', d.life.kills), stat('截住', d.life.cut), stat('围住', d.life.enc), stat('流星糖', d.life.meteors)));
  const el = h('section', { class: 'sb-coll sb-rec' }, h('div', { class: 'sb-map__bar' }, backBtn(onBack), h('h2', { class: 'sb-map__title' }, '纪录')), h('div', { class: 'sb-rec__grid' }, ...cards, ms));
  root.append(el); bindPress(el);
  return { el, dispose() { el.remove(); } };
}
const stat = (label: string, v: string | number) => h('div', { class: 'sb-rec__stat' }, h('b', {}, String(v)), h('span', {}, label));
export { starRating };
