// site/xiangqi/src/app/hall.ts — 大厅「楚河棋院」：三扇门（学堂 / 对弈 / 和爸爸下）+ 快捷条 + 陈列架 + 棋院印墙 + 小军师。位置全由 layoutHall 算好。
import { h, icon } from '@kit/ui';
import type { Companion } from '@kit/companion';
import { layoutHall, type Vp } from './layout';
import { place, setBack, setBubbleW, type AppCtx, type Screen } from './ctx';
import { ROBOTS } from '../rules/robots';
import { robotSvg } from '../art/robots';
import { lessonsDone, xjDone } from '../progress/save';
import { LESSONS_READY, STARMAP_READY } from './flags';
import { CARDS, cardUnlocked, openCard, openParentCorner, openSettings, openWall, onLongPress, sealsEarned, wonParts } from './panels';
import { modelSvg } from '../art/model';

const CARD_OF: Record<string, string> = { R2: 'muniu', R3: 'muniu', R4: 'sinan', R5: 'huntian', R6: 'xuanji' };
const SCENE_ACADEMY = `<svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sa-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2468"/><stop offset="1" stop-color="#34449a"/></linearGradient></defs><rect width="100" height="150" fill="url(#sa-sky)"/><circle cx="76" cy="24" r="9" fill="#fff3d6" opacity=".9"/><circle cx="80" cy="22" r="8" fill="#1b2468"/><g fill="#fff" opacity=".7"><circle cx="16" cy="18" r="1"/><circle cx="34" cy="10" r="1.2"/><circle cx="58" cy="30" r=".9"/></g><g class="sc-twinkle" fill="#fff"><circle cx="88" cy="50" r=".8"/><circle cx="8" cy="40" r=".9"/></g><path d="M0 100 Q25 82 50 98 T100 92 V150 H0Z" fill="#0f1642"/><rect x="14" y="62" width="72" height="62" rx="4" fill="#141c52" stroke="#8f241a" stroke-width="3"/><path d="M8 62 L50 36 L92 62Z" fill="#8f241a"/><path d="M8 62 L50 36 L92 62" fill="none" stroke="#fdd877" stroke-width="1.6"/><rect x="38" y="82" width="24" height="42" rx="3" fill="#0b1030" stroke="#fdd877" stroke-width="1.2"/><g><line x1="50" y1="36" x2="50" y2="46" stroke="#fdd877" stroke-width="1.4"/><ellipse cx="50" cy="56" rx="7" ry="9" fill="#e5604d"/><ellipse cx="50" cy="56" rx="7" ry="9" fill="none" stroke="#fdd877" stroke-width="1.2"/><circle cx="50" cy="56" r="14" fill="#fdd877" opacity=".16"/></g><g fill="#fdd877"><rect x="20" y="72" width="12" height="12" rx="2" opacity=".85"/><rect x="68" y="72" width="12" height="12" rx="2" opacity=".85"/></g><rect x="30" y="126" width="40" height="8" rx="3" fill="#c68b4a"/><g transform="translate(36 114)"><rect width="28" height="12" rx="2" fill="#f4ecd6"/><line x1="14" y1="0" x2="14" y2="12" stroke="#c68b4a" stroke-width="1.5"/></g></svg>`;
const SCENE_F2F = `<svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice"><rect width="100" height="150" fill="#16205f"/><g class="sc-sway"><line x1="20" y1="0" x2="20" y2="16" stroke="#fdd877" stroke-width="1"/><ellipse cx="20" cy="26" rx="6.5" ry="9" fill="#e5604d" stroke="#fdd877" stroke-width="1.2"/><circle cx="20" cy="26" r="13" fill="#fdd877" opacity=".16"/></g><g class="sc-sway d2"><line x1="80" y1="0" x2="80" y2="22" stroke="#fdd877" stroke-width="1"/><ellipse cx="80" cy="32" rx="6.5" ry="9" fill="#e5604d" stroke="#fdd877" stroke-width="1.2"/><circle cx="80" cy="32" r="13" fill="#fdd877" opacity=".16"/></g><g class="sc-twinkle" fill="#fff"><circle cx="46" cy="16" r="1.1"/><circle cx="60" cy="30" r=".9"/><circle cx="36" cy="40" r=".8"/></g><path d="M0 108 Q30 92 60 104 T100 98 V150 H0Z" fill="#0f1642"/><rect x="26" y="70" width="48" height="34" rx="6" fill="#26346e" stroke="#fdd877" stroke-width="2"/><g stroke="#e7c98a" stroke-width=".8" opacity=".8"><path d="M32 76H68M32 82H68M32 88H68M32 94H68M36 74V100M44 74V100M52 74V100M60 74V100M68 74V100"/></g><circle cx="40" cy="82" r="4.4" fill="#e3b979" stroke="#a8703e" stroke-width="1"/><circle cx="60" cy="92" r="4.4" fill="#231a3a" stroke="#9fb0ee" stroke-width="1"/><rect x="38" y="104" width="6" height="22" fill="#8a5530"/><rect x="56" y="104" width="6" height="22" fill="#8a5530"/><g><rect x="34" y="124" width="32" height="6" rx="3" fill="#c68b4a"/><ellipse cx="50" cy="52" rx="10" ry="12" fill="#e3b979" opacity=".0"/></g><g fill="#c68b4a"><rect x="14" y="108" width="14" height="6" rx="3"/><rect x="72" y="108" width="14" height="6" rx="3"/><rect x="17" y="114" width="3" height="16"/><rect x="80" y="114" width="3" height="16"/></g></svg>`;

export function mountHall(ctx: AppCtx, o: { intro?: boolean } = {}): Screen {
  const s = ctx.save; const root = h('div', { class: `xq-screen xq-hall ${o.intro ? 'is-intro' : ''}`, 'data-screen': 'hall' });
  const doorCap = (b: string, small: string): HTMLElement => h('div', { class: 'cap' }, h('b', null, b), h('small', null, small));
  let dkN0 = 0; void dkN0;
  const dk = (id: string, scene: string, cap: HTMLElement, fn: () => void, dark = false): HTMLButtonElement => { const b = h('button', { type: 'button', class: `xq-door ${dark ? 'is-dark' : ''}`, 'data-door': id, onclick: fn }); const sc = h('span', { class: 'scene' }); sc.innerHTML = scene; b.append(sc, cap); b.style.setProperty('--i', String(dkN++)); return b; };
  let dkN = 0;
  const nWon = ROBOTS.filter((r) => s.robots[r.id].w > 0).length;
  const doors = [
    dk('academy', SCENE_ACADEMY, doorCap('学堂', LESSONS_READY ? `已学 ${lessonsDone(s)} / 33 课` : '三十三课'), () => ctx.go({ to: 'academy' }), !LESSONS_READY),
    dk('arena', `<svg viewBox="0 0 100 150" preserveAspectRatio="xMidYMid slice"><rect width="100" height="150" fill="#1a2466"/><circle cx="82" cy="20" r="6" fill="#fff3d6" opacity=".85"/><path d="M0 112 Q30 96 60 108 T100 102 V150 H0Z" fill="#0f1642"/><ellipse cx="50" cy="118" rx="34" ry="8" fill="#8a5530"/><ellipse cx="50" cy="114" rx="34" ry="8" fill="#c68b4a"/><ellipse cx="50" cy="112" rx="28" ry="6" fill="#e6bd82"/><g transform="translate(15 22) scale(.7)">${robotSvg('R2', { cls: 'door-bot' }).replace(/<svg[^>]*>/, '<g>').replace('</svg>', '</g>')}</g></svg>`, doorCap('对弈', `赢过 ${nWon} / 6 位`), () => ctx.go({ to: 'arena' })),
    dk('f2f', SCENE_F2F, doorCap('和爸爸下', '面对面下棋'), () => ctx.go({ to: 'f2f-setup' })),
  ];
  const gear = h('button', { type: 'button', class: 'xq-gear', 'aria-label': '设置', onclick: () => openSettings(ctx, { onChange: () => ctx.applyPrefs() }) });
  const htitle = h('div', { class: 'xq-hall-title', 'data-hold': 'parent' }, '楚河棋院'); const stopHold = onLongPress(htitle, 3000, () => openParentCorner(ctx)); gear.innerHTML = icon('settings');
  const strip = h('div', { class: 'xq-strip' }); const shelf = h('div', { class: 'xq-shelf' }); const wall = h('button', { type: 'button', class: 'xq-wall', 'data-act': 'wall', onclick: () => openWall(ctx) }); const botHost = h('div', { class: 'xq-bot' });
  const resume = s.game ? h('button', { type: 'button', class: 'xq-btn is-sub', 'data-act': 'resume', onclick: () => ctx.go({ to: 'resume' }) }, '接着下') : null;
  const quick = h('button', { type: 'button', class: 'xq-btn', 'data-act': 'quick', onclick: () => ctx.go({ to: 'arena', quick: true }) }, '来个小局 ★'); const star = h('button', { type: 'button', class: 'xq-btn is-sub', 'data-act': 'starmap', onclick: () => ctx.go({ to: 'starmap' }) }, STARMAP_READY ? '星图' : '星图 · 筹备中');
  strip.append(...(resume ? [resume] : []), quick, star);
  for (const r of ROBOTS) { const won = s.robots[r.id].w > 0; const m = h('button', { type: 'button', class: 'medal', 'aria-label': won ? r.name : '还没赢过的机关人', onclick: () => { if (!won) { ctx.sfx('ui-locked'); return; } ctx.sfx('ui-pick', { rate: 1 + ROBOTS.indexOf(r) * 0.08 }); void ctx.speak(bot, `rb.${ROBOTS.indexOf(r) + 1}.intro`); const cid = CARD_OF[r.id]; const c = CARDS.find((x) => x.id === cid); if (c && cardUnlocked(s, c)) openCard(ctx, c); } }); m.innerHTML = robotSvg(r.id, { silhouette: !won }); shelf.append(m); }
  const earned = sealsEarned(s).length; const parts = wonParts(s); const mini = h('span', { class: 'mini' }); mini.innerHTML = modelSvg(parts, { cls: 'is-mini' });
  wall.append(mini, h('span', { class: 'wl' }, h('span', { class: 'lbl' }, '棋院印墙'), h('span', { class: 'sub' }, `零件 ${parts.filter(Boolean).length}/6 · 章印 ${earned}/9`)), ...['棋', '院', '印'].map((t, i) => h('span', { class: `seal ${earned > i ? '' : 'off'}` }, t)), h('span', { class: 'parts' }, ...parts.map((on) => h('i', { class: `part ${on ? 'on' : ''}` }))));
  root.append(...doors, htitle, gear, strip, shelf, wall, botHost); ctx.root.append(root);
  const bot: Companion = ctx.mountBot(botHost, { size: '100%', bubble: 'right', bubbleMax: Math.max(120, layoutHall(ctx.vp(), { hasResume: true }).bubble.w), accessory: 'junshi', mood: 'idle' }); if (!o.intro) void ctx.speak(bot, s.game ? 's.resume' : xjDone(s) + lessonsDone(s) > 0 ? 's.home' : 's.hello');
  let note: HTMLElement | null = null;
  if (s.notice === 'legacy') { note = h('div', { class: 'xq-note', 'data-note': 'legacy' }, lineText0('s.legacy'), h('button', { type: 'button', class: 'xq-btn', style: { marginTop: '8px', minHeight: '44px' }, onclick: () => { s.notice = 'seen'; ctx.persist(); note?.remove(); note = null; } }, '知道了')); root.append(note); }
  function lineText0(id: string): string { return ctx.lineText(id); }
  const resumeFull = s.game ? `接着下：${s.game.mode === 'f2f' ? '面对面' : `对${ROBOTS.find((r) => r.id === s.game?.robot)?.name ?? '机关人'}`} · 第 ${s.game.moves.length} 步` : '';
  function resize(vp: Vp): void {
    if (resume) resume.textContent = vp.w >= 520 ? resumeFull : '接着下';
    const H = layoutHall(vp, { hasResume: true }); H.doors.forEach((r, i) => place(doors[i], r)); place(gear, H.settings); place(htitle, { x: H.home.x + H.home.w + 8, y: H.home.y, w: Math.max(80, H.settings.x - (H.home.x + H.home.w) - 16), h: H.home.h }); place(strip, H.resume); place(shelf, H.shelf); place(wall, H.wall); place(botHost, H.companion);
    if (note) place(note, { x: H.S.x + 12, y: H.resume?.y ?? H.S.y + 80, w: H.S.w - 24, h: 96 });
    setBack(H.home); setBubbleW(H.bubble.w);
  }
  resize(ctx.vp());
  if (o.intro) { void (async () => { await new Promise((r) => setTimeout(r, 900)); void ctx.speak(bot, 's.home'); for (let i = 0; i < 3; i++) setTimeout(() => ctx.sfx('unlock', { rate: 1 + i * 0.12, volume: 0.5 }), 350 + i * 550); })(); }
  return { resize, destroy: () => { stopHold(); bot.destroy(); root.remove(); }, onBack: () => false };
}
