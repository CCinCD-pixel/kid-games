// site/xiangqi/src/app/panels.ts — 弹层：棋院印墙（机关模型 + 章印 + 8 张知识卡）、知识卡、加零件动画、设置、家长角（PIN）、「摆到真棋盘」。
import { h } from '@kit/ui';
import { hasPin, checkPin } from '@kit/settings';
import type { Companion } from '@kit/companion';
import cardsData from '../../../../content/xiangqi/cards.v1.json';
import { modelSvg } from '../art/model';
import { robotSvg } from '../art/robots';
import { ROBOTS } from '../rules/robots';
import { Position } from '../rules/position';
import { RED_NUM } from '../art/coords';
import { GLYPH } from './theme';
import { XQ_CHAPTERS, XQ_LESSONS } from '../lesson/data';
import type { AppCtx } from './ctx';
import { ROBOT_IDS, lessonsDone, xjDone, type XqSave } from '../progress/save';

export interface Card { id: string; title: string; text: string; art: string; unlock: string }
export const CARDS: Card[] = (cardsData as { cards: Card[] }).cards;

// ───────── 进度读数（大厅 / 墙 / 家长角共用）─────────
export const wonParts = (s: XqSave): boolean[] => ROBOT_IDS.map((id) => (s.robots[id]?.w ?? 0) > 0);
export function sealsEarned(s: XqSave): number[] { return XQ_CHAPTERS.map((c) => c[0] as number).filter((ch) => { const ls = XQ_LESSONS.filter((l) => l.ch === ch); return ls.length > 0 && ls.every((l) => s.lessons[l.id]?.done || s.lessons[l.id]?.known); }); }
export function cardUnlocked(s: XqSave, c: Card): boolean {
  const [k, v] = c.unlock.split(':'); if (k === 'intro') return !!s.intro[v as 'river' | 'palace']; if (k === 'robot') return (s.robots[v]?.w ?? 0) > 0; if (k === 'lesson') return !!(s.lessons[v]?.done || s.lessons[v]?.known); return false;
}
const ARTS: Record<string, string> = {
  river: `<svg viewBox="0 0 120 80"><rect width="120" height="80" rx="10" fill="#3a4b96"/><rect y="28" width="120" height="24" fill="#a9b8f2" opacity=".28"/><path d="M0 34q10-5 20 0t20 0 20 0 20 0 20 0M0 46q10-5 20 0t20 0 20 0 20 0 20 0" fill="none" stroke="#cfd8ff" stroke-width="1.6" opacity=".7"/><text x="30" y="46" fill="#fdd877" font-size="16" text-anchor="middle" font-family="serif">楚河</text><text x="90" y="46" fill="#fdd877" font-size="16" text-anchor="middle" font-family="serif">汉界</text></svg>`,
  palace: `<svg viewBox="0 0 120 80"><rect width="120" height="80" rx="10" fill="#3a4b96"/><g stroke="#e7c98a" stroke-width="1.6" fill="none"><rect x="36" y="10" width="48" height="60"/><path d="M36 10L84 70M84 10L36 70M36 30H84M36 50H84M60 10V70"/></g><circle cx="60" cy="40" r="11" fill="#231a3a" stroke="#9fb0ee" stroke-width="2"/><text x="60" y="45" fill="#fdd877" font-size="14" text-anchor="middle" font-family="serif">将</text></svg>`,
  history: `<svg viewBox="0 0 120 80"><rect width="120" height="80" rx="10" fill="#3a4b96"/><rect x="14" y="14" width="92" height="52" rx="4" fill="#e3b979" stroke="#a8703e" stroke-width="2"/><g stroke="#8a5530" stroke-width="1" opacity=".7"><path d="M14 27H106M14 40H106M14 53H106M33 14V66M52 14V66M71 14V66M90 14V66"/></g><circle cx="42" cy="33" r="8" fill="#f4d9a8" stroke="#a8703e"/><text x="42" y="38" fill="#7d160f" font-size="11" text-anchor="middle" font-family="serif">车</text><circle cx="80" cy="47" r="8" fill="#231a3a" stroke="#9fb0ee"/><text x="80" y="52" fill="#fdd877" font-size="11" text-anchor="middle" font-family="serif">将</text></svg>`,
  check: `<svg viewBox="0 0 120 80"><rect width="120" height="80" rx="10" fill="#3a4b96"/><circle cx="26" cy="40" r="13" fill="#f4d9a8" stroke="#a8703e" stroke-width="2"/><text x="26" y="46" fill="#7d160f" font-size="16" text-anchor="middle" font-family="serif">车</text><path d="M42 40H78" stroke="#fdd877" stroke-width="3" stroke-dasharray="5 4"/><circle cx="94" cy="40" r="13" fill="#231a3a" stroke="#9fb0ee" stroke-width="2"/><text x="94" y="46" fill="#fdd877" font-size="16" text-anchor="middle" font-family="serif">将</text><rect x="62" y="8" width="42" height="22" rx="4" fill="#c93a2c" transform="rotate(-8 83 19)"/><text x="83" y="24" fill="#fff3d6" font-size="13" text-anchor="middle" font-family="serif" transform="rotate(-8 83 19)">将军</text></svg>`,
};
export const cardArt = (c: Card, locked = false): string => (ARTS[c.art] ?? (/^R\d$/.test(c.art) ? `<div class="xq-cardart-bot">${robotSvg(c.art, { silhouette: locked })}</div>` : '')).replace('<svg ', locked ? '<svg style="filter:grayscale(1) brightness(.55)" ' : '<svg ');

// ───────── 通用模态 ─────────
export function modal(ctx: AppCtx, body: HTMLElement[], o: { cls?: string; onClose?: () => void; wide?: boolean } = {}): { close(): void; el: HTMLElement } {
  const card = h('div', { class: `xq-modal-card ${o.cls ?? ''}`, role: 'dialog', 'aria-modal': 'true' }, ...body);
  const close = (): void => { wrap.remove(); o.onClose?.(); };
  const wrap = h('div', { class: 'xq-modal', onclick: (e: Event) => { if (e.target === wrap) close(); } }, card);
  if (o.wide) card.style.maxWidth = '720px'; ctx.root.append(wrap); ctx.sfx('ui-open'); return { close, el: card };
}
const closeBtn = (m: { close(): void }, label = '好了'): HTMLElement => h('button', { type: 'button', class: 'xq-btn', 'data-act': 'close', style: { flex: 'none', minHeight: '52px' }, onclick: () => m.close() }, label);

export function openCard(ctx: AppCtx, c: Card): void {
  const m: { close(): void } = modal(ctx, [h('div', { class: 'xq-cardfull' }, Object.assign(h('div', { class: 'art' }), { innerHTML: cardArt(c) }), h('b', null, c.title), h('p', null, c.text)), closeBtn({ close: () => m.close() })], { cls: 'is-card' });
}
export function openWall(ctx: AppCtx): void {
  const s = ctx.save; const parts = wonParts(s); const seals = sealsEarned(s);
  const model = h('div', { class: 'xq-model-box' }); model.innerHTML = modelSvg(parts);
  const done = parts.filter(Boolean).length;
  const sealRow = h('div', { class: 'xq-seals' }, ...XQ_CHAPTERS.map((c) => h('span', { class: `seal ${seals.includes(c[0] as number) ? '' : 'off'}`, title: String(c[1]) }, String(c[1]).slice(0, 1))));
  const grid = h('div', { class: 'xq-cardgrid' }, ...CARDS.map((c) => { const ok = cardUnlocked(s, c); const b = h('button', { type: 'button', class: `xq-cardchip ${ok ? '' : 'is-locked'}`, 'data-card': c.id, onclick: () => { if (ok) openCard(ctx, c); else ctx.sfx('ui-locked'); } }); b.innerHTML = `<span class="art">${cardArt(c, !ok)}</span><b>${ok ? c.title : '？？？'}</b>`; return b; }));
  const m: { close(): void } = modal(ctx, [h('div', { class: 'xq-wallhead' }, h('b', null, '棋院印墙'), h('small', null, `机关模型 ${done} / 6 个零件 · 章印 ${seals.length} / ${XQ_CHAPTERS.length}`)), model, sealRow, h('div', { class: 'xq-sub' }, '知识卡'), grid, closeBtn({ close: () => m.close() })], { cls: 'is-wall', wide: true });
}
/** 赢一位机关人：模型在墙上加一个零件（2–3 s 机械动画）；点一下可提前结束 */
export async function showWallAward(ctx: AppCtx, ix: number, bot: Companion | null): Promise<void> {
  const parts = wonParts(ctx.save); parts[ix] = true; const box = h('div', { class: 'xq-model-box is-award' }); const robot = ROBOTS[ix];
  box.innerHTML = modelSvg(parts, { newPart: ix + 1 });
  return new Promise((res) => {
    let done = false; const fin = (): void => { if (done) return; done = true; wrap.remove(); res(); };
    const wrap = h('div', { class: 'xq-modal is-award', onclick: fin }, h('div', { class: 'xq-modal-card is-award' }, h('div', { class: 'xq-award-name' }, `${robot.name}的零件`), box, h('small', null, '它的零件，装进了你的棋院。'), h('div', { class: 'xq-award-tap' }, '点一下继续')));
    ctx.root.append(wrap); ctx.sfx('unlock'); setTimeout(() => ctx.sfx('level-complete', { volume: 0.5 }), 1300); void ctx.speak(bot, 'rb.join'); setTimeout(fin, 3200);
  });
}

// ───────── 摆到真棋盘 ─────────
export function diagramSvg(fen: string): string {
  // 与对局棋盘同一套竖线号：下边红方一…九（左→右 九…一），上边黑方 1…9，左边横线 1–10（从红方数）
  const pos = Position.fromFen(fen); const u = 40, mx = 40, my = 44; const W = mx * 2 + 8 * u, H = my * 2 + 9 * u; const x = (c: number): number => mx + c * u, y = (r: number): number => my + r * u;
  let g = `<rect width="${W}" height="${H}" rx="10" fill="#f1dcae"/><rect x="${mx - 8}" y="${my - 8}" width="${8 * u + 16}" height="${9 * u + 16}" fill="none" stroke="#7a4b21" stroke-width="2.4"/><g stroke="#5b3a1a" stroke-width="1.2" fill="none">`;
  for (let r = 0; r < 10; r++) g += `<path d="M${x(0)} ${y(r)}H${x(8)}"/>`; for (let c = 0; c < 9; c++) g += c === 0 || c === 8 ? `<path d="M${x(c)} ${y(0)}V${y(9)}"/>` : `<path d="M${x(c)} ${y(0)}V${y(4)}M${x(c)} ${y(5)}V${y(9)}"/>`;
  g += `<path d="M${x(3)} ${y(0)}L${x(5)} ${y(2)}M${x(5)} ${y(0)}L${x(3)} ${y(2)}M${x(3)} ${y(7)}L${x(5)} ${y(9)}M${x(5)} ${y(7)}L${x(3)} ${y(9)}"/></g><text x="${x(2)}" y="${y(4) + u * 0.64}" font-size="${u * 0.62}" fill="#7a4b21" text-anchor="middle" font-family="serif">楚河</text><text x="${x(6)}" y="${y(4) + u * 0.64}" font-size="${u * 0.62}" fill="#7a4b21" text-anchor="middle" font-family="serif">汉界</text>`;
  for (let c = 0; c < 9; c++) g += `<text x="${x(c)}" y="${y(9) + 37}" font-size="17" font-weight="700" fill="#b3261e" text-anchor="middle" font-family="'Kaiti SC','STKaiti',serif">${RED_NUM[8 - c]}</text><text x="${x(c)}" y="${y(0) - 24}" font-size="15" font-weight="700" fill="#3b3a63" text-anchor="middle" font-family="sans-serif">${c + 1}</text>`;
  for (let r = 0; r < 10; r++) g += `<text x="${mx - 28}" y="${y(r) + 5}" font-size="13" fill="#7a4b21" opacity=".8" text-anchor="middle" font-family="sans-serif">${10 - r}</text>`;
  for (let sq = 0; sq < 90; sq++) { const p = pos.b[sq]; if (!p) continue; const r = Math.floor(sq / 9), c = sq % 9, red = !(p & 8); g += `<circle cx="${x(c)}" cy="${y(r)}" r="${u * 0.43}" fill="${red ? '#fbefd0' : '#2a2140'}" stroke="${red ? '#b3261e' : '#d9c27a'}" stroke-width="2"/><text x="${x(c)}" y="${y(r) + u * 0.2}" font-size="${u * 0.58}" text-anchor="middle" font-weight="700" fill="${red ? '#b3261e' : '#f3d27a'}" font-family="'Kaiti SC','STKaiti',serif">${GLYPH[p & 7][red ? 0 : 1]}</text>`; }
  return `<svg viewBox="0 0 ${W} ${H}" class="xq-diagram" role="img" aria-label="象棋棋盘图，红方在下">${g}</svg>`;
}
/** 棋子清单：与棋盘图同一套数字——「车 九线 1行」= 下边数字九的那条竖线，左边数字 1 的那条横线 */
export function pieceList(fen: string): { red: string; black: string } {
  const pos = Position.fromFen(fen); const ord = [1, 5, 6, 4, 3, 2, 7]; const f = (side: 0 | 1): string => { const out: string[] = []; for (const t of ord) for (let sq = 0; sq < 90; sq++) { const p = pos.b[sq]; if (p && (p & 7) === t && (p >> 3) === side) out.push(`${GLYPH[t][side]} ${RED_NUM[8 - (sq % 9)]}线${10 - Math.floor(sq / 9)}行`); } return out.join('　'); };
  return { red: f(0), black: f(1) };
}
export function openRealBoard(ctx: AppCtx, fen: string, title = '摆到真棋盘', onClose?: () => void): void {
  const l = pieceList(fen); const art = h('div', { class: 'xq-diagram-box' }); art.innerHTML = diagramSvg(fen);
  const m: { close(): void } = modal(ctx, [h('div', { class: 'xq-wallhead' }, h('b', null, title), h('small', null, '红在下方。红字一…九是竖线号，左边 1–10 是横线（从红方数）')), art, h('div', { class: 'xq-plist' }, h('p', null, h('b', { class: 'r' }, '红　'), l.red), h('p', null, h('b', null, '黑　'), l.black)), closeBtn({ close: () => m.close() })], { cls: 'is-real', wide: true, onClose });
}

// ───────── 设置 ─────────
export function openSettings(ctx: AppCtx, o: { onChange?: () => void; inGame?: boolean } = {}): void {
  const s = ctx.save.settings; const rows: HTMLElement[] = [];
  const tog = (id: string, label: string, get: () => boolean, set: (v: boolean) => void, hint?: string): HTMLElement => { const b = h('button', { type: 'button', class: 'xq-toggle', 'data-setting': id, 'aria-pressed': String(get()), onclick: () => { set(!get()); b.setAttribute('aria-pressed', String(get())); ctx.persist(); o.onChange?.(); ctx.sfx('ui-tap'); } }, h('span', null, label, hint ? h('small', null, hint) : ''), h('i')); return b; };
  rows.push(
    tog('sfx', '声音', () => s.sfx !== false, (v) => { s.sfx = v; if (!v) ctx.narrator.stop(); }, '音效和说话'), tog('subs', '字幕', () => s.subs !== false, (v) => (s.subs = v), '关掉后，只在有配音时才隐藏'),
    tog('coords', '竖线号', () => s.coords, (v) => (s.coords = v), '棋盘下面的一二三…（复盘时自动显示）'), tog('danger', '危险点提示', () => s.dangerHatch, (v) => (s.dangerHatch = v), '我的子被攻击时，亮起琥珀斜纹'),
    tog('material', '子力点数', () => s.material !== false, (v) => (s.material = v), '吃子托盘上的 +3'), tog('hand', '左手顺手', () => s.handedness === 'left', (v) => (s.handedness = v ? 'left' : 'right'), '横屏：按键放左边、棋盘放右边；竖屏：按键靠左'));
  const m: { close(): void } = modal(ctx, [h('div', { class: 'xq-wallhead' }, h('b', null, '设置')), h('div', { class: 'xq-setlist' }, ...rows), closeBtn({ close: () => m.close() })], { cls: 'is-settings' });
}

// ───────── 家长角 ─────────
const bandOf = (w: number, d: number, l: number): string => { const n = w + d + l; if (n < 2) return '还不够判断'; const sc = (w + d / 2) / n; return sc >= 0.8 ? '偏容易（可以挑战下一位）' : sc >= 0.35 ? '难度合适' : '偏吃力（可开轻松档 / 让子）'; };
export function openParentCorner(ctx: AppCtx): void {
  const show = (): void => {
    const s = ctx.save; const last10 = s.history.slice(-10); const w = last10.filter((g) => g.result === 'w').length; const mate = s.puzzles.recent30; const rate = mate.length >= 5 ? `${Math.round((mate.filter(Boolean).length / mate.length) * 100)}%` : '数据还少';
    const per = ROBOT_IDS.map((id, i) => { const hs = s.history.filter((g) => g.robot === id).slice(-5); const ww = hs.filter((g) => g.result === 'w').length, dd = hs.filter((g) => g.result === 'd').length; return `${ROBOTS[i].name}：近 ${hs.length} 盘 ${ww}胜${dd}和${hs.length - ww - dd}负 · ${bandOf(ww, dd, hs.length - ww - dd)}`; });
    let legacy = false; try { legacy = !!localStorage.getItem('kg:v1:legacy-xiangqi'); } catch { /* ignore */ }
    const hr = s.settings.houseRules; const sec = (t: string, ...kids: (string | HTMLElement)[]): HTMLElement => h('section', { class: 'xq-sec' }, h('b', null, t), ...kids.map((k) => (typeof k === 'string' ? h('p', null, k) : k)));
    const m: { close(): void } = modal(ctx, [h('div', { class: 'xq-wallhead' }, h('b', null, '家长角'), h('small', null, '给爸爸妈妈看的说明与数据')),
      h('div', { class: 'xq-parent' },
        sec('训练目标', '规则意识与有序思考：先看清再走；前瞻一步、两步；输了也愿意再来一盘。'),
        sec('课标锚点', '人教版一年级「位置与方向」「数的比较」中的空间与逻辑推理；一步杀 / 两步杀练习的是"若…则…"的推理。'),
        sec('证据等级', 'C 级：棋类与推理、专注力的关系有相关研究，因果证据有限。本作不承诺提分，只提供安全、不带惩罚的练习环境。'),
        sec('三项指标', `课程进度：已学 ${lessonsDone(s)} / 33 课，小局已赢 ${xjDone(s)} / 28；对弈：近 ${last10.length} 盘赢 ${w}；一步杀首次做对率：${rate}。`),
        sec('近 5 盘估计强度', ...per.map((t) => h('p', { class: 'sm' }, t))),
        sec('规则说明（与家里下法不同时请看这里）', '困毙（对方无路可走）：判负；长将（一直将军）：判负；限着：连续 60 回合没有吃子判和；长捉 / 一将一捉：v1 一律不判，按和棋处理。以上是和机关人下时的固定规则，面对面可以在"家规"里改。'),
        sec('当前面对面家规', `困毙${hr.stalemate === 'loss' ? '判负' : '判和'} · 长将${{ loss: '判负', warn: '只提醒', off: '不判' }[hr.perpetual]} · ${hr.limit ? '限着 60 回合' : '不限着'} · 悔棋${hr.undo === 'free' ? '不限' : '每方 3 次'}`),
        sec('旧版存档', legacy ? '旧版（上一个象棋）的棋局放不进新版，已把原文备份在本机。' : '没有旧版数据。'),
        sec('其他', '“全部解锁”“跳过开场和教学”在星港家长页（/parent/）里设置，本作会跟着变。')), closeBtn({ close: () => m.close() })], { cls: 'is-parent', wide: true });
    void m;
  };
  if (!hasPin()) { show(); return; }
  let buf = ''; const dots = h('div', { class: 'xq-pin-dots' }); const msg = h('p', { class: 'sm' }, '请输入家长 PIN'); const upd = (): void => { dots.textContent = buf ? '●'.repeat(buf.length) : '　'; };
  const pad = h('div', { class: 'xq-pad' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '清', '0', '好'].map((k) => h('button', { type: 'button', class: 'xq-btn is-sub', onclick: () => { if (k === '清') buf = ''; else if (k === '好') { if (checkPin(buf)) { m.close(); show(); return; } buf = ''; msg.textContent = '不对，再试一次'; ctx.sfx('ui-locked'); } else if (buf.length < 6) buf += k; upd(); } }, k)));
  const m: { close(): void } = modal(ctx, [h('div', { class: 'xq-wallhead' }, h('b', null, '家长角')), msg, dots, pad, closeBtn({ close: () => m.close() }, '取消')], { cls: 'is-pin' }); upd();
}
/** 长按（默认 3 秒）触发：用于大厅页眉标题 */
export function onLongPress(el: HTMLElement, ms: number, fn: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | null = null; const stop = (): void => { if (t) clearTimeout(t); t = null; };
  const start = (): void => { stop(); t = setTimeout(() => { t = null; fn(); }, ms); };
  el.addEventListener('pointerdown', start); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, stop); return stop;
}
