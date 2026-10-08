/**
 * 家长中心 (/parent/), reached by holding the hub's 家长 button or 星港 title for 3 s.
 * PIN gate (set on first use; a soft gate for a six-year-old, kit/settings), then four tabs:
 *   概览  play-log stats: last 7 / 30 days, a 14-day chart by place, how games were opened, domains
 *   进度  every game: status, progress, parent note, ability domains, last played
 *   设置  display name, narration, pinyin, sound, 跳过开场和教学, which games the hub shows, change PIN
 *   备份  export / import progress + play log (one JSON file), credits
 * Deliberately NO time budgets, timers or locks (Dad's rule 10). Everything stays on this device.
 */
import registry, { type HubEntry } from 'virtual:kg-registry';
import { isMuted, setMuted } from '@kit/audio';
import { readSessions } from '@kit/log';
import { exportProgress, importProgress, LEGACY_KEYS, readHubProgress, readLegacyLadders, readLegacySokoban } from '@kit/progress';
import { checkPin, clearPin, cleanName, DEFAULT_NAME, getSettings, hasPin, NAME_MAX, setPin, updateSettings } from '@kit/settings';
import { initShell } from '@kit/shell';
import { bindPress, h, icon, segmented, showModal, xgToast } from '@kit/ui';
import { cardProgress, playCounts } from '../../_hub/state';
import {
  dailyBars, DOMAIN_NAMES, domainMinutes, fmtAgo, fmtMinutes, launchShares, perGame, PLACE_NAMES, PLACES, totals, type Place,
} from './stats';
import './parent.css';

initShell({ game: 'parent', startGate: false, log: false, audio: false, back: { href: '/', label: '回星港' } });
bindPress(document);

const UNLOCK_KEY = 'kg:parent:unlocked';
const UNLOCK_MS = 30 * 60_000;
const app = document.getElementById('app')!;
const byId = new Map(registry.map((g) => [g.id, g]));
const placeOf = (game: string): Place | undefined => byId.get(game)?.place;
const PLACE_COLORS: Record<Place, string> = { base: '#1aa892', playground: '#df9a1c', classic: '#5466b0' };
const STATUS_NAMES = { live: '已上线', wip: '建造中', hidden: '未列出' } as const;

const session = (() => {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
})();
const readJson = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
};

// ================================================================== PIN gate
function unlocked(): boolean {
  const t = Number(session?.getItem(UNLOCK_KEY) ?? 0);
  return Date.now() - t < UNLOCK_MS;
}
function markUnlocked() {
  try {
    session?.setItem(UNLOCK_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

type GateMode = 'enter' | 'create' | 'confirm' | 'change' | 'change-confirm';

function showGate(mode: GateMode, onDone: () => void, firstPin = '') {
  const msg = {
    enter: '请输入家长 PIN',
    create: '第一次使用：设置 4 位家长 PIN',
    confirm: '再输入一次，确认 PIN',
    change: '输入新的 4 位 PIN',
    'change-confirm': '再输入一次新 PIN',
  }[mode];
  let value = '';
  const dots = h('div', { class: 'pg-dots', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const status = h('p', { class: 'pg-gate__msg', role: 'status' }, msg);
  const keys = h('div', { class: 'xg-keypad pg-keypad' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => k === ''
      ? h('span')
      : h('button', { class: `xg-key${k === 'del' ? ' xg-key--del' : ''}`, type: 'button', 'data-k': k, 'aria-label': k === 'del' ? '删除' : k, 'data-sfx': 'none' })));
  keys.querySelector('[data-k="del"]')!.innerHTML = icon('backspace');
  for (const b of keys.querySelectorAll<HTMLElement>('[data-k]')) if (b.dataset.k !== 'del') b.textContent = b.dataset.k!;
  const forgot = mode === 'enter' ? h('button', { class: 'pg-link', type: 'button' }, '忘记 PIN？') : null;
  const card = h('section', { class: 'pg-gate__card', 'aria-label': '家长 PIN' },
    h('div', { class: 'pg-gate__badge' }), h('h1', { class: 'pg-gate__title' }, '家长中心'), status, dots, keys, forgot);
  card.querySelector('.pg-gate__badge')!.innerHTML = icon('parent');
  const gate = h('div', { class: 'pg-gate' }, card);
  app.replaceChildren(gate);

  const render = () => dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < value.length));
  const nudge = (text: string) => {
    status.textContent = text;
    dots.classList.remove('is-shake');
    void dots.offsetWidth;
    dots.classList.add('is-shake');
    value = '';
    render();
  };
  const submit = () => {
    if (mode === 'enter') {
      if (checkPin(value)) { markUnlocked(); onDone(); } else nudge('PIN 不对，再试一次');
    } else if (mode === 'create' || mode === 'change') {
      showGate(mode === 'create' ? 'confirm' : 'change-confirm', onDone, value);
    } else if (value === firstPin) {
      setPin(value);
      markUnlocked();
      xgToast(mode === 'confirm' ? '家长 PIN 已设置' : '家长 PIN 已更新', { tone: 'ok', sfx: null });
      onDone();
    } else {
      showGate(mode === 'confirm' ? 'create' : 'change', onDone);
      xgToast('两次输入不一样，请重新设置', { tone: 'try', sfx: null });
    }
  };
  keys.addEventListener('click', (e) => {
    const k = (e.target as Element).closest<HTMLElement>('[data-k]')?.dataset.k;
    if (!k) return;
    if (k === 'del') value = value.slice(0, -1);
    else if (value.length < 4) value += k;
    render();
    if (value.length === 4) setTimeout(submit, 120);
  });
  forgot?.addEventListener('click', () => void forgotPin(onDone));
}

/** Grown-up check before a forgotten PIN can be reset (progress is kept). */
async function forgotPin(onDone: () => void) {
  const a = 12 + Math.floor(Math.random() * 80);
  const b = 6 + Math.floor(Math.random() * 4);
  const input = h('input', { class: 'pg-input', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-label': '答案' }) as HTMLInputElement;
  const choice = await showModal({
    title: '重设家长 PIN',
    body: [h('p', null, `请家长算一算：${a} × ${b} = ?`), input, h('p', { class: 'pg-small' }, '答对后可以设置新的 PIN，进度和记录都会保留。')],
    actions: [{ id: 'cancel', label: '取消' }, { id: 'ok', label: '确定', primary: true }],
  });
  if (choice !== 'ok') return;
  if (Number(input.value.trim()) === a * b) {
    clearPin();
    showGate('create', onDone);
  } else {
    xgToast('答案不对，PIN 保持不变', { tone: 'try', sfx: null });
  }
}

// ================================================================== main view
type Tab = 'overview' | 'progress' | 'settings' | 'backup';
const TABS: { id: Tab; label: string; icon: 'map' | 'flag' | 'settings' | 'download' }[] = [
  { id: 'overview', label: '概览', icon: 'map' },
  { id: 'progress', label: '进度', icon: 'flag' },
  { id: 'settings', label: '设置', icon: 'settings' },
  { id: 'backup', label: '备份', icon: 'download' },
];

function showMain(tab: Tab = 'overview') {
  const tabsEl = h('div', { class: 'pg-tabs' });
  const body = h('main', { class: 'pg-body', id: 'pg-body' });
  const credits = h('a', { class: 'pg-credits', href: '/credits/' }, '素材与致谢');
  const head = h('header', { class: 'pg-head' },
    h('div', { class: 'pg-head__title' }, h('h1', null, '家长中心'), h('span', { class: 'pg-head__sub' }, '记录只保存在这台设备上')),
    credits);
  app.replaceChildren(h('div', { class: 'pg' }, head, h('nav', { class: 'pg-nav' }, tabsEl), body));
  const render = (t: Tab) => {
    body.replaceChildren(...{ overview, progress: progressPanel, settings: settingsPanel, backup: backupPanel }[t]());
    body.scrollTop = 0;
    body.dataset.tab = t;
    try {
      session?.setItem('kg:parent:tab', t);
    } catch {
      /* ignore */
    }
  };
  segmented(tabsEl, { options: TABS, value: tab, onChange: (id) => render(id as Tab) });
  render(tab);
  document.body.dataset.ready = '';
  app.dataset.ready = '';
}

// ------------------------------------------------------------------ 概览
function overview(): Node[] {
  const sessions = readSessions();
  const now = Date.now();
  const t7 = totals(sessions, placeOf, 7, now);
  const t30 = totals(sessions, placeOf, 30, now);
  const learnShare = t7.minutes > 0 ? Math.round((t7.byPlace.base / t7.minutes) * 100) : 0;
  const tile = (value: string, label: string, note?: string) =>
    h('div', { class: 'pg-tile' }, h('div', { class: 'pg-tile__value' }, value), h('div', { class: 'pg-tile__label' }, label), note ? h('div', { class: 'pg-tile__note' }, note) : null);
  const tiles = h('div', { class: 'pg-tiles' },
    tile(fmtMinutes(t7.minutes), '近 7 天', `${t7.sessions} 次`),
    tile(`${t7.activeDays} / 7`, '玩过的天数'),
    tile(t7.minutes > 0 ? `${learnShare}%` : '—', '基地（学习）占比', '近 7 天'),
    tile(fmtMinutes(t30.minutes), '近 30 天', `${t30.sessions} 次`),
  );

  const bars = dailyBars(sessions, placeOf, 14, now);
  const chart = barChart(bars);

  const shares = launchShares(sessions, 30, now);
  const shareRows: [string, number][] = [
    ['自己点卡片', shares.hub], ['继续上次', shares.resume], ['点了「推荐」', shares.suggested], ['其他方式打开', shares.direct],
  ];
  const engage = section('他怎么选游戏（近 30 天）',
    shares.total
      ? h('div', { class: 'pg-hbars' }, shareRows.map(([label, n]) => hbar(label, n / shares.total, `${Math.round((n / shares.total) * 100)}%`, '#5466b0')))
      : empty('还没有记录。玩过之后，这里会显示他自己挑的比例。'),
    h('p', { class: 'pg-small' }, '「自己点卡片」越多，说明是他自己想玩；大厅每天只标一张「继续」和一张「推荐」，不挂任何奖励。'));

  const stats30 = perGame(sessions, 30, now);
  const doms = domainMinutes(stats30, (g) => byId.get(g)?.domains);
  const maxDom = Math.max(1, ...doms.map(([, m]) => m));
  const domains = section('能力领域（近 30 天，按时长）',
    doms.length
      ? h('div', { class: 'pg-hbars' }, doms.slice(0, 8).map(([d, m]) => hbar(DOMAIN_NAMES[d] ?? d, m / maxDom, fmtMinutes(m), '#1aa892')))
      : empty('还没有记录。'),
    h('p', { class: 'pg-small' }, '一个游戏的时长平均分到它的几个领域；只给家长看，孩子那边从不显示能力标签。'));

  const maxGame = Math.max(1, ...stats30.map((g) => g.minutes));
  const games = section('各游戏（近 30 天）',
    stats30.length
      ? h('div', { class: 'pg-hbars' }, stats30.slice(0, 10).map((g) => hbar(byId.get(g.game)?.title ?? g.game, g.minutes / maxGame, `${fmtMinutes(g.minutes)} · ${g.sessions} 次`, PLACE_COLORS[placeOf(g.game) ?? 'classic'])))
      : empty('还没有记录。'));

  return [tiles, section('最近 14 天', chart), h('div', { class: 'pg-cols' }, engage, domains), games,
    h('p', { class: 'pg-note' }, '星港不设时长限制或锁屏；每个学习单元 10–15 分钟会有自然的停点。')];
}

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'pg-card' }, h('h2', { class: 'pg-card__title' }, title), ...children);
}
const empty = (text: string) => h('p', { class: 'pg-empty' }, text);

function hbar(label: string, frac: number, value: string, color: string): HTMLElement {
  const fill = h('span', { class: 'pg-hbar__fill' });
  fill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  fill.style.background = color;
  return h('div', { class: 'pg-hbar' }, h('span', { class: 'pg-hbar__label' }, label), h('span', { class: 'pg-hbar__track' }, fill), h('span', { class: 'pg-hbar__value' }, value));
}

/** 14-day stacked bars (minutes by place), 2 px gaps between segments, tap a day for its numbers. */
function barChart(bars: ReturnType<typeof dailyBars>): HTMLElement {
  const W = 700, H = 200, padL = 36, padB = 26, padT = 10;
  const max = Math.max(10, ...bars.map((b) => b.total));
  const step = max <= 30 ? 10 : max <= 60 ? 20 : max <= 120 ? 30 : 60;
  const top = Math.ceil(max / step) * step;
  const y = (m: number) => padT + (H - padT - padB) * (1 - m / top);
  const bw = (W - padL) / bars.length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'pg-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '最近 14 天每天的游戏时长（分钟），按地方分色');
  let markup = '';
  for (let m = 0; m <= top; m += step) {
    markup += `<line x1="${padL}" x2="${W}" y1="${y(m)}" y2="${y(m)}" class="pg-chart__grid"/><text x="${padL - 8}" y="${y(m) + 4}" class="pg-chart__tick" text-anchor="end">${m}</text>`;
  }
  bars.forEach((b, i) => {
    const x = padL + i * bw + bw * 0.2;
    const w = bw * 0.6;
    let acc = 0;
    const segs = PLACES.filter((p) => b.minutes[p] > 0);
    segs.forEach((p, j) => {
      const y0 = y(acc), y1 = y(acc + b.minutes[p]);
      const gap = j > 0 ? 2 : 0;
      const hgt = Math.max(0, y0 - y1 - gap);
      const last = j === segs.length - 1;
      const r = last ? Math.min(4, hgt, w / 2) : 0;
      const yt = y1;
      const yb = y0 - gap;
      markup += r
        ? `<path d="M${x} ${yb}V${yt + r}Q${x} ${yt} ${x + r} ${yt}H${x + w - r}Q${x + w} ${yt} ${x + w} ${yt + r}V${yb}Z" fill="${PLACE_COLORS[p]}"/>`
        : `<rect x="${x}" y="${yt}" width="${w}" height="${hgt}" fill="${PLACE_COLORS[p]}"/>`;
      acc += b.minutes[p];
    });
    const d = new Date(b.start);
    const label = i === bars.length - 1 ? '今天' : d.getDay() === 1 || i === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '';
    if (label) markup += `<text x="${x + w / 2}" y="${H - 6}" class="pg-chart__tick" text-anchor="middle">${label}</text>`;
    markup += `<rect class="pg-chart__hit" data-i="${i}" x="${padL + i * bw}" y="0" width="${bw}" height="${H - padB}" fill="transparent"><title>${d.getMonth() + 1}月${d.getDate()}日：${Math.round(b.total)} 分钟</title></rect>`;
  });
  markup += `<line x1="${padL}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="pg-chart__axis"/>`;
  svg.innerHTML = markup;
  const caption = h('p', { class: 'pg-chart__caption', role: 'status' }, '点一下某一天，看具体分钟数。');
  svg.addEventListener('click', (e) => {
    const i = Number((e.target as Element).getAttribute('data-i'));
    if (!Number.isFinite(i) || !(e.target as Element).hasAttribute('data-i')) return;
    const b = bars[i];
    const d = new Date(b.start);
    caption.textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日：共 ${fmtMinutes(b.total)}` +
      (b.total > 0 ? `（${PLACES.filter((p) => b.minutes[p] > 0).map((p) => `${PLACE_NAMES[p].replace(/（.*）/, '')} ${fmtMinutes(b.minutes[p])}`).join('，')}）` : '');
    svg.querySelectorAll('.pg-chart__hit').forEach((r) => r.classList.toggle('is-on', r === e.target));
  });
  const week = totals(readSessions(), placeOf, 14);
  const legend = h('div', { class: 'pg-legend' }, PLACES.map((p) => {
    const sw = h('i');
    sw.style.background = PLACE_COLORS[p];
    return h('span', null, sw, `${PLACE_NAMES[p]} ${fmtMinutes(week.byPlace[p])}`);
  }));
  return h('div', { class: 'pg-chartwrap' }, legend, svg, caption);
}

// ------------------------------------------------------------------ 进度
function progressPanel(): Node[] {
  const sessions = readSessions();
  const hub = readHubProgress();
  const legacy = {
    sokoban: readLegacySokoban(readJson(LEGACY_KEYS.sokoban)),
    'memory-matrix': readLegacyLadders(readJson(LEGACY_KEYS['memory-matrix'])),
    'emoji-match': readLegacyLadders(readJson(LEGACY_KEYS['emoji-match'])),
  };
  const plays = playCounts(sessions);
  const stats = new Map(perGame(sessions, 30).map((g) => [g.game, g]));
  const hidden = new Set(getSettings().hiddenGames);
  const groups = PLACES.map((p) => {
    const games = registry.filter((g) => g.place === p && g.status !== 'hidden');
    if (!games.length) return null;
    return section(PLACE_NAMES[p], ...games.map((g) => gameRow(g, cardProgress(g, hub, legacy, plays[g.id] ?? 0), stats.get(g.id), hidden.has(g.id))));
  });
  return [h('p', { class: 'pg-lead' }, '每个游戏的训练目标、进度和最近一次玩的时间。卡片上给孩子看的是“幻想里的动作”，能力标签只在这里。'), ...groups.filter(Boolean) as HTMLElement[]];
}

function gameRow(g: HubEntry, p: ReturnType<typeof cardProgress>, s: ReturnType<typeof perGame>[number] | undefined, hidden: boolean): HTMLElement {
  const emblem = h('span', { class: 'pg-game__emblem' }, g.icon.startsWith('/') ? h('img', { src: g.icon, alt: '' }) : g.icon);
  const chips = h('span', { class: 'pg-chips' },
    h('span', { class: `pg-chip pg-chip--${g.status}` }, STATUS_NAMES[g.status]),
    hidden ? h('span', { class: 'pg-chip pg-chip--hidden' }, '大厅已隐藏') : null,
    ...g.domains.map((d) => h('span', { class: 'pg-chip' }, DOMAIN_NAMES[d] ?? d)));
  const meta = g.status === 'wip'
    ? '还在建造中，暂时不能玩。'
    : `${p?.label ?? ''} · 近 30 天 ${fmtMinutes(s?.minutes ?? 0)} · 最近：${fmtAgo(s?.lastPlayed ?? null)}`;
  return h('article', { class: 'pg-game' }, emblem,
    h('div', { class: 'pg-game__text' },
      h('div', { class: 'pg-game__head' }, h('h3', null, g.title), chips),
      h('p', { class: 'pg-game__note' }, g.parentNote),
      h('p', { class: 'pg-game__meta' }, meta)));
}

// ------------------------------------------------------------------ 设置
function toggle(label: string, checked: boolean, onChange: (v: boolean) => void, note?: string): HTMLElement {
  const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const track = h('span', { class: 'xg-toggle__track' }, h('span', { class: 'xg-toggle__thumb' }));
  return h('div', { class: 'pg-row' }, h('label', { class: 'xg-toggle pg-toggle' }, input, track, h('span', null, label)), note ? h('p', { class: 'pg-small' }, note) : null);
}

function settingsPanel(): Node[] {
  const s = getSettings();
  const name = h('input', { class: 'pg-input', type: 'text', maxlength: String(NAME_MAX), value: s.displayName, 'aria-label': '显示名', autocomplete: 'off' }) as HTMLInputElement;
  const save = h('button', { class: 'xg-btn xg-btn--primary xg-btn--sm', type: 'button' }, '保存');
  save.addEventListener('click', () => {
    const v = cleanName(name.value);
    name.value = updateSettings({ displayName: v }).displayName;
    xgToast(`显示名：${name.value}`, { tone: 'ok', sfx: null });
  });
  const nameRow = h('div', { class: 'pg-row' },
    h('div', { class: 'pg-field' }, name, save),
    h('p', { class: 'pg-small' }, `大厅和游戏里怎么称呼他（最多 ${NAME_MAX} 个字，默认「${DEFAULT_NAME}」）。语音里只会说「${DEFAULT_NAME}」；换成别的名字后，带名字的语音会换成不带名字的版本。只存在这台设备上。`));

  const hiddenSet = new Set(s.hiddenGames);
  const listed = registry.filter((g) => g.status !== 'hidden');
  const gameToggles = h('div', { class: 'pg-gametoggles' }, listed.map((g) => {
    const row = toggle(`${g.title}${g.status === 'wip' ? '（建造中）' : ''}`, !hiddenSet.has(g.id), (on) => {
      const cur = new Set(getSettings().hiddenGames);
      if (on) cur.delete(g.id); else cur.add(g.id);
      updateSettings({ hiddenGames: [...cur] });
    });
    const img = g.icon.startsWith('/') ? h('img', { src: g.icon, alt: '', class: 'pg-toggle__emblem' }) : null;
    if (img) row.querySelector('label')!.prepend(img);
    return row;
  }));

  const changePin = h('button', { class: 'xg-btn xg-btn--secondary xg-btn--sm', type: 'button' }, hasPin() ? '修改家长 PIN' : '设置家长 PIN');
  changePin.addEventListener('click', () => showGate('change', () => showMain('settings')));

  return [
    section('称呼', nameRow),
    section('声音和文字',
      toggle('旁白语音', s.narration, (v) => updateSettings({ narration: v }), '关掉后，游戏里的话只显示字幕；孩子点「再听一遍」时仍会读出来。'),
      toggle('拼音', s.pinyin, (v) => updateSettings({ pinyin: v }), '支持拼音的游戏（如山海故事匣）会在字上方显示拼音。'),
      toggle('声音', !isMuted(), (v) => setMuted(!v), '全部音效和语音的总开关（大厅右上角的喇叭也是它）。')),
    section('开场和教学',
      toggle('跳过开场和教学', s.skipIntros, (v) => updateSettings({ skipIntros: v }), '测试或换浏览器时用；孩子平时建议关着。'),
      h('p', { class: 'pg-small' }, '打开后，各游戏的开场、新手引导和教学都会直接跳过（算作看过），教学仍可从游戏菜单里重看。关着时，开场开始 1.5 秒后右上角会出现「跳过」。')),
    section('大厅里显示的游戏', h('p', { class: 'pg-small' }, '隐藏只影响大厅卡片，进度和记录都保留。'), gameToggles),
    section('家长 PIN', h('div', { class: 'pg-row' }, changePin, h('p', { class: 'pg-small' }, '进入家长中心：在大厅长按右上角的家长按钮（或「星港」两个字）3 秒。'))),
    h('p', { class: 'pg-note' }, '没有时长预算、倒计时或锁屏——这是爸爸的决定。'),
  ];
}

// ------------------------------------------------------------------ 备份
function backupPanel(): Node[] {
  const exp = exportProgress();
  const keys = Object.keys(exp.entries).length;
  const bytes = JSON.stringify(exp).length;
  const exportBtn = h('button', { class: 'xg-btn xg-btn--primary', type: 'button' });
  exportBtn.innerHTML = `${icon('download')}<span>导出备份文件</span>`;
  exportBtn.addEventListener('click', () => void doExport());
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'pg-file', 'aria-label': '选择备份文件' }) as HTMLInputElement;
  const importBtn = h('button', { class: 'xg-btn xg-btn--secondary', type: 'button' }, '从备份恢复…');
  importBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', () => void doImport(file));
  return [
    section('导出', h('p', null, `进度、游玩记录和设置（${keys} 项，约 ${Math.max(1, Math.round(bytes / 1024))} KB）存成一个 JSON 文件。可以存到「文件」或发给自己。`), h('div', { class: 'pg-actions' }, exportBtn)),
    section('导入', h('p', null, '从之前导出的文件恢复。同名的进度会被文件里的内容替换。'), h('div', { class: 'pg-actions' }, importBtn, file)),
    section('关于', h('p', null, '字体、音效、语音模型等素材的来源和许可：'), h('div', { class: 'pg-actions' }, h('a', { class: 'xg-btn xg-btn--secondary', href: '/credits/' }, '素材与致谢'))),
  ];
}

async function doExport() {
  const json = JSON.stringify(exportProgress(), null, 2);
  const name = `xinggang-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const f = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  // iPad home-screen apps cannot download blobs reliably; the share sheet can save to 文件.
  if (f && nav.canShare?.({ files: [f] }) && nav.share) {
    try {
      await nav.share({ files: [f], title: '星港备份' });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.getAttribute('href')!);
    a.remove();
  }, 1000);
}

async function doImport(input: HTMLInputElement) {
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  let bundle: unknown;
  try {
    bundle = JSON.parse(await f.text());
  } catch {
    xgToast('这个文件不是星港的备份', { tone: 'try', sfx: null });
    return;
  }
  const entries = (bundle as { entries?: Record<string, string> })?.entries;
  const n = entries ? Object.keys(entries).length : 0;
  const choice = await showModal({
    title: '恢复备份？',
    body: h('p', null, `文件里有 ${n} 项进度和记录（${(bundle as { exportedAt?: string }).exportedAt?.slice(0, 10) ?? '日期未知'}）。恢复后，这台设备上同名的内容会被替换。`),
    actions: [{ id: 'cancel', label: '取消' }, { id: 'ok', label: '恢复', primary: true }],
  });
  if (choice !== 'ok') return;
  try {
    const written = importProgress(bundle, { overwrite: true });
    xgToast(`已恢复 ${written} 项`, { tone: 'ok', sfx: null });
    showMain('backup');
  } catch (err) {
    xgToast((err as Error).message || '恢复失败', { tone: 'try', sfx: null });
  }
}

// ================================================================== start
const startTab = (session?.getItem('kg:parent:tab') as Tab | null) ?? 'overview';
if (unlocked()) showMain(startTab);
else if (hasPin()) showGate('enter', () => showMain('overview'));
else showGate('create', () => showMain('overview'));
app.dataset.gate = '';
