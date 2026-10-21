// site/xiangqi/src/app/arena.ts — 对弈：机关人选择 → 赛前面板（小局 / 整盘 · 让子 · 轻松 / 教练 · 执红 / 执黑）；面对面赛前（让子 + 家规）。
import { h, icon } from '@kit/ui';
import { unlockAll } from '@kit/settings';
import type { Companion } from '@kit/companion';
import { createRng } from '@engines/board/core/rng';
import { layoutRobots, layoutSheet, type Vp } from './layout';
import { place, setBack, type AppCtx, type Screen } from './ctx';
import { BLACK, Position, RED, START_FEN, handicapFen, type HandicapKind } from '../rules/position';
import { ROBOTS } from '../rules/robots';
import { robotSvg } from '../art/robots';
import { DEFAULT_HOUSE, ROBOT_IDS, helpInvite, r1Soft, robotUnlocked, type HouseRules } from '../progress/save';
import { modal } from './panels';
import { LESSONS_READY } from './flags';
import xiaoju from '../../../../content/xiangqi/xiaoju.v1.json';
import type { GameParams } from './game';

interface Xj { id: string; name: string; theme: string; tier: number; fen: string }
const XJ = (xiaoju as { positions: Xj[] }).positions;
const HANDICAPS: [HandicapKind, string][] = [['none', '平下'], ['first', '让先'], ['knight', '让左马'], ['knights', '让双马'], ['rook', '让一车']];
const THEMES: [string, string][] = [['danche', '单车'], ['shuangche', '双车'], ['chepao', '车炮'], ['mapao', '马炮'], ['shuangpao', '双炮'], ['chebing', '车兵'], ['duozi', '多子'], ['jianfeng', '见面']];
const newSeed = (): number => { const q = new URLSearchParams(location.search).get('seed'); return q ? Number(q) : (Date.now() ^ 0x9e3779b9) & 0x7fffffff; };

/** 让子缩略图：9×10 的点阵，被去掉的子画成幽灵 */
export function handicapThumb(kind: HandicapKind, giver: number): string {
  const base = Position.fromFen(START_FEN), cur = Position.fromFen(kind === 'none' || kind === 'first' ? START_FEN : handicapFen(kind, giver)); let d = '';
  for (let sq = 0; sq < 90; sq++) { const p = base.b[sq]; if (!p) continue; const x = 6 + (sq % 9) * 9.6, y = 6 + Math.floor(sq / 9) * 9.6; const gone = !cur.b[sq]; const red = !(p & 8);
    d += gone ? `<circle cx="${x}" cy="${y}" r="3.6" fill="none" stroke="#fdd877" stroke-width="1" stroke-dasharray="1.6 1.4"/>` : `<circle cx="${x}" cy="${y}" r="3.6" fill="${red ? '#e3b979' : '#231a3a'}" stroke="${red ? '#a8703e' : '#9fb0ee'}" stroke-width=".9"/>`; }
  return `<svg viewBox="0 0 92 100" role="img" aria-label="${kind}"><rect x="1" y="1" width="90" height="98" rx="8" fill="#3a4b96" stroke="#e7c98a" stroke-width="1.4"/><rect x="3" y="46" width="86" height="8" fill="#a9b8f2" opacity=".18"/>${d}</svg>`;
}

export function mountArena(ctx: AppCtx, o: { quick?: boolean } = {}): Screen {
  const s = ctx.save; const unlockedAll = unlockAll();
  const O = { lessonsReady: LESSONS_READY, unlockAll: unlockedAll };
  const root = h('div', { class: 'xq-screen xq-arena', 'data-screen': 'arena' }); ctx.root.append(root);
  let sel = Math.max(0, ROBOT_IDS.findIndex((_, i) => robotUnlocked(s, i, O) && s.robots[ROBOT_IDS[i]].w === 0)); if (sel < 0) sel = 0;
  const opt = { mode: 'xj' as 'xj' | 'full', side: 0 as 0 | 1, handicap: 'none' as HandicapKind, easy: false, coach: false, xjId: '', xjTheme: '' };
  const title = h('div', { class: 'xq-title' }, h('span', null, '选一位机关人')); const cards: HTMLElement[] = []; const btn = h('button', { type: 'button', class: 'xq-btn', 'data-act': 'pick' }, '选他'); const botHost = h('div', { class: 'xq-bot' });
  const prev = h('button', { type: 'button', class: 'xq-key', 'aria-label': '上一位', onclick: () => step(-1) }), next = h('button', { type: 'button', class: 'xq-key', 'aria-label': '下一位', onclick: () => step(1) }); prev.innerHTML = icon('back'); next.innerHTML = icon('next');
  const buildCard = (i: number): HTMLElement => {
    const r = ROBOTS[i], rec = s.robots[r.id], open = robotUnlocked(s, i, O); const c = h('button', { type: 'button', class: `xq-card ${open ? '' : 'is-locked'}`, 'data-robot': r.id, onclick: () => { sel = i; render(); if (open) pick(); } });
    const av = h('span', { class: 'av' }); av.innerHTML = robotSvg(r.id, { silhouette: !open && rec.w === 0 }); c.append(av, h('b', null, open || rec.w > 0 ? r.name : '？？？'), h('span', { class: 'tr' }, open ? r.trait : i === 0 ? r.trait : '赢了上一位，他就开门'), h('span', { class: 'rec' }, open ? `胜 ${rec.w} · 和 ${rec.d}` : '锁着')); if (!open) { const lk = h('span', { class: 'lock' }); lk.innerHTML = icon('lock'); c.append(lk); } return c;
  };
  ROBOTS.forEach((_, i) => cards.push(buildCard(i))); root.append(title, ...cards, btn, prev, next, botHost);
  const bot: Companion = ctx.mountBot(botHost, { size: '100%', bubble: 'right', accessory: 'junshi', mood: 'idle' }); void ctx.speak(bot, 'rb.pick');
  let vp = ctx.vp(); let sheet: HTMLElement | null = null; let scrim: HTMLElement | null = null;
  const step = (d: number): void => { sel = (sel + d + 6) % 6; render(); void ctx.speak(bot, `rb.${sel + 1}.intro`); };
  function render(): void {
    const R = layoutRobots(vp); title.replaceChildren(h('span', null, '选一位机关人')); place(title, { x: R.head.x + 66, y: R.head.y, w: R.head.w - 66, h: R.head.h });
    cards.forEach((c, i) => { c.classList.toggle('is-sel', i === sel); if (R.phone) { const r = R.cards[0]; if (i === sel) { place(c, r); } else c.style.display = 'none'; } else place(c, R.cards[i]); });
    place(btn, R.btn); const open = robotUnlocked(s, sel, O); btn.disabled = !open; btn.style.opacity = open ? '1' : '.45'; btn.textContent = open ? '选他' : '还没开门'; btn.onclick = () => { if (open) pick(); };
    prev.style.display = next.style.display = R.phone ? '' : 'none'; if (R.phone) { const c = R.cards[0]; place(prev, { x: R.area.x, y: c.y + c.h / 2 - 28, w: 52, h: 56 }); place(next, { x: R.area.x + R.area.w - 52, y: c.y + c.h / 2 - 28, w: 52, h: 56 }); }
    place(botHost, R.phone ? null : { x: R.S.x + 12, y: R.S.y + R.S.h - 70, w: 56, h: 56 }); botHost.style.display = 'none'; setBack(R.head);
    if (sheet) layoutSheetEl();
  }
  // ───────── 软门：不设锁，只是一张友好的卡片 ─────────
  /** 点机关人：R1 且推荐课（L17–L20 将军 / 应将 / 将死 / 困毙）还没学 → 先问一句；其余直接开赛前面板 */
  function pick(): void { if (sel === 0 && r1Soft(s, O)) softGate(); else openSheet(); }
  function softGate(): void {
    const go = h('button', { type: 'button', class: 'xq-btn', 'data-act': 'soft-learn', style: { flex: '1', minHeight: '52px' }, onclick: () => { m.close(); ctx.go({ to: 'academy' }); } }, '去学');
    const skip = h('button', { type: 'button', class: 'xq-btn is-sub', 'data-act': 'soft-skip', style: { flex: '1', minHeight: '52px' }, onclick: () => { s.settings.r1Skip = true; ctx.persist(); m.close(); openSheet(); } }, '不用，直接下');
    const m = modal(ctx, [h('div', { class: 'xq-softgate', style: { display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'center' } }, h('b', { style: { font: '700 22px/1.3 var(--xg-font-read, serif)' } }, '先学三招保护将，好吗？'), h('p', { class: 'sm' }, '被“将军”了怎么办？三课，十来分钟。想直接下也行。')), h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, go, skip)], { cls: 'is-soft' });
  }
  // ───────── 赛前面板 ─────────
  function openSheet(): void {
    closeSheet(); const r = ROBOTS[sel]; const rb = s.robots[r.id]; const inv = helpInvite(rb);
    if (inv >= 1 && !opt.easy && !opt.coach && opt.handicap === 'none') { opt.easy = inv >= 1; opt.coach = inv >= 2; opt.handicap = inv === 3 ? 'knight' : inv >= 4 ? 'knights' : 'none'; }
    scrim = h('div', { class: 'xq-scrim', onclick: closeSheet }); sheet = h('div', { class: 'xq-sheet', 'data-sheet': '1' }); root.append(scrim, sheet); fillSheet(); layoutSheetEl();
    if (inv > 0) void ctx.speak(bot, inv === 1 ? 'g.easy.ask' : inv === 2 ? 'g.easy.on' : 'g.hand');
  }
  function closeSheet(): void { sheet?.remove(); scrim?.remove(); sheet = scrim = null; }
  function layoutSheetEl(): void { if (!sheet) return; const S = layoutSheet(vp); place(sheet, S.sheet); const it = S.items; const kids = sheet.children; (kids[0] as HTMLElement).style.height = `${it.seg.h}px`; (kids[1] as HTMLElement).style.height = `${it.thumbs.h}px`; (kids[2] as HTMLElement).style.height = `${it.toggles.h}px`; (kids[3] as HTMLElement).style.height = `${it.start.h}px`; sheet.style.justifyContent = 'flex-start'; }
  function fillSheet(): void {
    if (!sheet) return; const r = ROBOTS[sel]; sheet.replaceChildren();
    const seg = h('div', { class: 'xq-seg' }); for (const [m, label] of [['xj', '小局'], ['full', '整盘']] as const) seg.append(h('button', { type: 'button', 'aria-pressed': String(opt.mode === m), 'data-mode': m, onclick: () => { opt.mode = m; fillSheet(); layoutSheetEl(); } }, label));
    const row2 = h('div', { class: 'xq-thumbs' });
    if (opt.mode === 'full') for (const [k, label] of HANDICAPS) { const b = h('button', { type: 'button', class: 'xq-thumb', 'aria-pressed': String(opt.handicap === k), 'data-handicap': k, onclick: () => { opt.handicap = k; if (k === 'first') opt.side = 0; fillSheet(); layoutSheetEl(); } }); b.innerHTML = `${handicapThumb(k, opt.side === 0 ? BLACK : RED)}<span>${label}</span>`; row2.append(b); }
    else { if (vp.w < 500) { row2.classList.add('is-scroll'); } else { row2.style.flexWrap = 'wrap'; row2.style.alignContent = 'center'; row2.style.overflow = 'visible'; } row2.style.alignItems = 'stretch'; const won = (id: string): boolean => (s.xj[id]?.wins ?? 0) > 0; for (const [k, label] of [['', '随机'] as [string, string], ...THEMES]) { const all = XJ.filter((x) => !k || x.theme === k); const n = all.filter((x) => won(x.id)).length; row2.append(h('button', { type: 'button', class: 'xq-thumb', 'data-theme': k || 'random', 'aria-pressed': String(opt.xjTheme === k), style: { flex: 'none', minWidth: '78px', justifyContent: 'center', fontSize: '16px', minHeight: '44px' }, onclick: () => { opt.xjTheme = k; fillSheet(); layoutSheetEl(); } }, h('span', null, label), h('small', { style: { fontSize: '12px', opacity: '.7' } }, `${n} / ${all.length}`))); } }
    const row3 = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    if (opt.mode === 'full') { const sideSeg = h('div', { class: 'xq-seg', style: { minHeight: '44px' } }); for (const [v, label] of [[0, '我执红（先走）'], [1, '我执黑']] as const) sideSeg.append(h('button', { type: 'button', 'aria-pressed': String(opt.side === v), 'data-side': String(v), onclick: () => { opt.side = v; if (v === 1 && opt.handicap === 'first') opt.handicap = 'none'; fillSheet(); layoutSheet; layoutSheetEl(); } }, label)); row3.append(sideSeg); }
    const tg = h('div', { style: { display: 'flex', gap: '6px' } }); const tgl = (label: string, key: 'easy' | 'coach'): HTMLElement => { const b = h('button', { type: 'button', class: 'xq-toggle', style: { flex: '1' }, 'aria-pressed': String(opt[key]), 'data-toggle': key, onclick: () => { opt[key] = !opt[key]; b.setAttribute('aria-pressed', String(opt[key])); } }, h('span', null, label)); b.append(h('i')); return b; };
    tg.append(tgl('轻松档', 'easy'), tgl('小军师提醒', 'coach')); row3.append(tg);
    const start = h('button', { type: 'button', class: 'xq-btn', 'data-act': 'start', onclick: () => begin() }, `开始 · 对${r.name}`);
    sheet.append(seg, row2, row3, start); ctx.sfx('ui-open');
  }
  function begin(): void {
    const r = ROBOTS[sel]; const seed = newSeed(); const kidRed = opt.mode === 'xj' ? true : opt.side === 0; let startFen = START_FEN; let xjId: string | undefined;
    if (opt.mode === 'xj') { const rng = createRng(seed); const won = (id: string): boolean => (s.xj[id]?.wins ?? 0) > 0; const themed = XJ.filter((x) => !opt.xjTheme || x.theme === opt.xjTheme); const pool = themed.filter((x) => !won(x.id)); const list = pool.length ? pool : themed; const p = list[Math.floor(rng.next() * list.length)]; startFen = p.fen; xjId = p.id; }
    else if (opt.handicap !== 'none' && opt.handicap !== 'first') startFen = handicapFen(opt.handicap, kidRed ? BLACK : RED);
    const params: GameParams = { mode: opt.mode === 'xj' ? 'xj' : 'robot', robotId: r.id, xjId, startFen, moves: [], side: kidRed ? 0 : 1, handicap: opt.mode === 'xj' ? 'none' : opt.handicap, seed, coach: opt.coach, easy: opt.easy, rules: { ...DEFAULT_HOUSE } };
    ctx.go({ to: 'game', params });
  }
  render(); if (o.quick) openSheet();   // 「来个小局」：直接开赛前面板（小局从不弹软门）
  return { resize: (v) => { vp = v; render(); }, destroy: () => { bot.destroy(); root.remove(); }, onBack: () => { if (sheet) { closeSheet(); return true; } ctx.go({ to: 'hall' }); return true; } };
}

// ═════════════ 面对面赛前：让子 + 家规 ═════════════
export function mountF2fSetup(ctx: AppCtx): Screen {
  const s = ctx.save; const root = h('div', { class: 'xq-screen xq-arena', 'data-screen': 'f2f-setup' }); ctx.root.append(root); let vp = ctx.vp();
  const rules: HouseRules = { ...DEFAULT_HOUSE, ...s.settings.houseRules }; let kind: HandicapKind = 'none'; let giver: 0 | 1 = 1;
  const title = h('div', { class: 'xq-title' }, h('span', null, '和爸爸面对面下'), h('small', null, ctx.lineText('d.who'))); const panel = h('div', { class: 'xq-sheet', 'data-sheet': 'f2f', style: { zIndex: '5' } }); root.append(title, panel);
  const cyc = <T extends string | number>(label: string, vals: [T, string][], get: () => T, set: (v: T) => void): HTMLElement => { const b = h('button', { type: 'button', class: 'xq-toggle', 'data-house': label, onclick: () => { const i = vals.findIndex((v) => v[0] === get()); set(vals[(i + 1) % vals.length][0]); fill(); } }, h('span', null, label), h('b', { style: { color: '#fdd877', fontWeight: '700' } }, vals.find((v) => v[0] === get())?.[1] ?? '')); return b; };
  function fill(): void {
    panel.replaceChildren(); const thumbs = h('div', { class: `xq-thumbs ${vp.w < 500 ? 'is-scroll' : ''}`, style: { height: vp.w < 500 ? '84px' : '104px', flex: 'none' } });
    for (const [k, label] of [...HANDICAPS, ['cannon', '让一炮'] as [HandicapKind, string]]) { const b = h('button', { type: 'button', class: 'xq-thumb', 'aria-pressed': String(kind === k), 'data-handicap': k, onclick: () => { kind = k; fill(); } }); b.innerHTML = `${handicapThumb(k, giver === 0 ? RED : BLACK)}<span>${label}</span>`; thumbs.append(b); }
    const gseg = h('div', { class: 'xq-seg' }); for (const [v, label] of [[1, '黑方让子（爸爸执黑）'], [0, '红方让子']] as const) gseg.append(h('button', { type: 'button', 'aria-pressed': String(giver === v), onclick: () => { giver = v; fill(); } }, label));
    const hr = h('div', { style: { display: 'grid', gridTemplateColumns: vp.w < 560 && vp.h > vp.w ? '1fr' : '1fr 1fr', gap: '6px' } },
      cyc('困毙', [['loss', '判负'], ['draw', '判和']], () => rules.stalemate, (v) => (rules.stalemate = v as HouseRules['stalemate'])), cyc('长将', [['loss', '判负'], ['warn', '只提醒'], ['off', '不判']], () => rules.perpetual, (v) => (rules.perpetual = v as HouseRules['perpetual'])),
      cyc('限着', [[120, '60 回合'], [0, '不限']], () => rules.limit, (v) => (rules.limit = v as HouseRules['limit'])), cyc('悔棋', [['free', '不限'], [3, '每方 3 次']], () => rules.undo, (v) => (rules.undo = v as HouseRules['undo'])));
    const go = h('button', { type: 'button', class: 'xq-btn', 'data-act': 'start', style: { flex: 'none', minHeight: '56px' }, onclick: () => { s.settings.houseRules = { ...rules }; ctx.persist(); const fen = kind === 'none' || kind === 'first' ? START_FEN : handicapFen(kind, giver === 0 ? RED : BLACK); const params: GameParams = { mode: 'f2f', startFen: fen, moves: [], side: kind === 'first' ? 0 : 0, handicap: kind, seed: newSeed(), coach: false, easy: false, rules: { ...rules } }; ctx.go({ to: 'game', params }); } }, '开始下棋');
    const note = h('div', { style: { font: '600 13px/1.3 var(--xg-font-ui)', color: 'rgba(244,236,214,.7)', textAlign: 'center' } }, `家规：困毙${rules.stalemate === 'loss' ? '判负' : '判和'} · 长将${{ loss: '判负', warn: '只提醒', off: '不判' }[rules.perpetual]} · ${rules.limit ? '限着 60 回合' : '不限着'} · 悔棋${rules.undo === 'free' ? '不限' : '每方 3 次'}`);
    panel.append(thumbs, gseg, hr, note, go);
  }
  function resize(v: Vp): void { vp = v; const S = { x: v.safe.l, y: v.safe.t, w: v.w - v.safe.l - v.safe.r, h: v.h - v.safe.t - v.safe.b }; const wide = v.w > v.h && S.h < 520; const w = Math.min(S.w - 24, wide ? 720 : 560); const hh = Math.min(S.h - 76, wide ? S.h - 76 : 520); place(title, { x: S.x + 78, y: S.y + 4, w: S.w - 90, h: 56 }); place(panel, { x: S.x + (S.w - w) / 2, y: S.y + 68 + Math.max(0, Math.floor((S.h - 76 - hh) / 2)), w, h: hh }); panel.style.display = wide ? 'grid' : 'flex'; panel.style.overflowY = 'auto'; panel.style.justifyContent = 'center'; panel.style.alignContent = 'center'; if (wide) { panel.style.gridTemplateColumns = '1fr 1fr'; } else panel.style.gridTemplateColumns = ''; setBack({ x: S.x + 12, y: S.y + 4 }); fill(); }
  resize(vp); void ctx.speak(null, 'd.who');
  return { resize, destroy: () => root.remove(), onBack: () => { ctx.go({ to: 'hall' }); return true; } };
}
