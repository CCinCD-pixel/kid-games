/**
 * platform lab (/dev/platform/): live samples of the shared platform features added in the 2026-10-13 round —
 * companion accessories, the `chart` / `xiangqi` themes, font patch glyphs, nodeMap `skipped`, registerMetrics,
 * the safe-area test override. Not listed on the hub, not precached by the service worker.
 */
import { mount, type AccessoryId, type Mood, MOODS } from '@kit/companion';
import { clipCacheStats } from '@kit/audio';
import { isAutomated, isDevServer, isTestEnv, safeAreaOverride } from '@kit/dev';
import { evaluateMetrics, writeMetricsSummary, readMetricsSummary, type MetricDef } from '@kit/metrics';
import { getSettings, hasPin, setPin, unlockAll } from '@kit/settings';
import { initShell } from '@kit/shell';
import { askParentPin, bindPress, mountKeypad, nodeMap, showResult, type MapNode } from '@kit/ui';
import './lab.css';

initShell({ game: 'dev-platform', startGate: false, back: false, log: false, serviceWorker: false });

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const params = new URLSearchParams(location.search);
const only = params.get('only');
for (const sec of Array.from(document.querySelectorAll('.pl-panel'))) {
  if (only && sec.id !== `sec-${only}`) sec.remove();
}

// ---- accessories: hero (big), every mood, head-only
const heroSec = document.getElementById('sec-hero');
if (heroSec) {
  heroSec.append(el('h2', '', '配饰 accessory：军师 / 教练 / 无'));
  const row = el('div', 'pl-hero');
  heroSec.append(row);
  const buttons = el('div', 'pl-row');
  heroSec.append(buttons);
  const bots: { id: AccessoryId | null; bot: ReturnType<typeof mount> }[] = [];
  for (const id of [null, 'junshi', 'coach'] as const) {
    const cell = el('div', 'pl-cell');
    const host = el('div');
    cell.append(host, el('span', '', id ?? '无配饰'));
    row.append(cell);
    const bot = mount(host, { size: 280, accessory: id, bubble: 'top', mood: 'idle' });
    bots.push({ id, bot });
  }
  for (const [label, fn] of [
    ['羽扇一摇', () => bots[1].bot.react('fan')],
    ['脱帽致意', () => bots[2].bot.react('cap')],
    ['换成教练', () => bots[1].bot.setAccessory('coach')],
    ['换成军师', () => bots[1].bot.setAccessory('junshi')],
  ] as const) {
    const b = el('button', 'kit-btn', label);
    b.type = 'button';
    b.addEventListener('click', fn);
    buttons.append(b);
  }
  (window as unknown as { __pl: unknown }).__pl = { bots };
}

const moodsSec = document.getElementById('sec-moods');
if (moodsSec) {
  moodsSec.append(el('h2', '', '全部心情 × 配饰（深色底 / 浅色底）'));
  for (const id of ['junshi', 'coach'] as const) {
    const row = el('div', 'pl-row');
    for (const mood of MOODS as readonly Mood[]) {
      const cell = el('div', 'pl-cell');
      const host = el('div');
      cell.append(host, el('span', '', `${id} · ${mood}`));
      row.append(cell);
      mount(host, { size: 118, accessory: id, mood, bubble: 'top' });
    }
    moodsSec.append(row);
  }
}

const headsSec = document.getElementById('sec-heads');
if (headsSec) {
  headsSec.append(el('h2', '', '头像 variant="head"（HUD / 地图标记）'));
  const row = el('div', 'pl-row pl-night');
  headsSec.append(row);
  for (const id of [null, 'junshi', 'coach'] as const) {
    for (const size of [150, 72, 44]) {
      const host = el('div');
      row.append(host);
      mount(host, { size, variant: 'head', accessory: id, mood: size === 72 ? 'happy' : 'idle' });
    }
  }
}

// ---- themes: every colour theme's accent ramp, a button, a done node, text on the accent
const THEME_IDS = ['mars', 'moon', 'rabbit', 'story', 'lab', 'porter', 'chess', 'army', 'snake', 'match', 'defense', 'xiangqi', 'chart'];
const themesSec = document.getElementById('sec-themes');
if (themesSec) {
  themesSec.append(el('h2', '', '主题色 data-xg-game（新增：xiangqi 朱砂、chart 星图青）'));
  const row = el('div', 'pl-row');
  themesSec.append(row);
  for (const t of THEME_IDS) {
    const cell = el('div', `pl-theme${t === 'xiangqi' || t === 'chart' ? ' pl-theme--new' : ''}`);
    cell.dataset.xgGame = t;
    cell.dataset.theme = t;
    const ramp = el('div', 'pl-ramp');
    for (const v of ['hi', 'base', 'deep', 'soft']) ramp.append(el('i', `pl-ramp__${v}`));
    const on = el('div', 'pl-on', 'Aa 星港');
    const btn = el('button', 'xg-btn xg-btn--primary xg-btn--sm', '继续') as HTMLButtonElement;
    btn.type = 'button';
    cell.append(el('b', '', t), ramp, on, btn);
    row.append(cell);
  }
  bindPress(themesSec);
}

// ---- glyphs: characters the kit font subsets gained in this round (K4), in both fonts
const glyphsSec = document.getElementById('sec-glyphs');
if (glyphsSec) {
  glyphsSec.append(el('h2', '', '补字：站酷快乐体（标题）/ 霞鹜文楷（正文）'));
  const lines: [string, string][] = [
    ['象棋', '仕 蹩 帅 相 车 马 炮 兵 卒 将 士 象 楚河汉界 蹩马腿 长将 长捉'],
    ['机关守城', '偃 咔嗒 噗 埙 帧 弩 徵 攒 枭 橐 檑 牒 瓮 礌 篝 缪 蒺藜 轒 轳 辒 辘 郢 闩 韬 驿 鸢'],
    ['火星 / 星图', '琥珀 靛蓝 晶体 星图 星门 流星 镜像 坞 胫 阱 韦 弈'],
    ['配饰', '军师 教练 羽扇 头巾 帽徽 升变 易位 逼和 将杀'],
  ];
  for (const [name, text] of lines) {
    glyphsSec.append(el('p', 'pl-small', name));
    glyphsSec.append(el('div', 'pl-glyphs title', text));
    glyphsSec.append(el('div', 'pl-glyphs read', text));
  }
  glyphsSec.append(el('p', 'pl-small', '站酷快乐体的源文件本身没有「礌 轒 辒」——标题里遇到会回退到楷体，不会出现方框。'));
}

// ---- map: nodeMap states incl. skipped, nodeSize 72 / 76 / 96
const mapSec = document.getElementById('sec-map');
if (mapSec) {
  mapSec.append(el('h2', '', '节点图 nodeMap：skipped（虚线环，跳过过）与 nodeSize'));
  const wrap = el('div', 'pl-maps');
  mapSec.append(wrap);
  const states: MapNode['state'][] = ['done', 'done', 'skipped', 'done', 'current', 'open', 'locked', 'locked'];
  const mk = (n: number, boss: boolean): MapNode[] =>
    Array.from({ length: n }, (_, i) => ({ id: `n${i}`, state: states[i % states.length], stars: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1, boss: boss && i === n - 1 }));
  const specs: { cls: string; size?: number; nodes: MapNode[]; label: string }[] = [
    { cls: 'pl-map pl-map--land', nodes: mk(8, true), label: '默认 76（横）· 含 Boss' },
    { cls: 'pl-map pl-map--port', size: 72, nodes: mk(6, false), label: 'nodeSize 72（竖，手机）' },
    { cls: 'pl-map pl-map--big', size: 96, nodes: mk(7, true), label: 'nodeSize 96（大 iPad）' },
  ];
  const draws: (() => void)[] = [];
  for (const sp of specs) {
    const box = el('div', 'pl-mapbox');
    const host = el('div', sp.cls);
    box.append(host, el('span', 'pl-small', sp.label));
    wrap.append(box);
    draws.push(() => nodeMap(host, sp.nodes, { nodeSize: sp.size, onPick: (n) => (host.dataset.picked = `${n.id}:${n.state}`) }));
  }
  requestAnimationFrame(() => draws.forEach((d) => d()));
}

// ---- misc: keypad, result without confetti, parent PIN dialog, metrics, safe-area / dev switches
const miscSec = document.getElementById('sec-misc');
if (miscSec) {
  miscSec.append(el('h2', '', '其它：键盘 layout / keySize / setEnabled · showResult confetti:false · askParentPin · 指标 · 开发开关'));
  const pads = el('div', 'pl-row pl-pads');
  miscSec.append(pads);
  const handles: ReturnType<typeof mountKeypad>[] = [];
  for (const [layout, size] of [['3x4', undefined], ['4x3', { w: 56, h: 48 }]] as const) {
    const box = el('div', 'pl-padbox');
    box.dataset.layout = layout;
    pads.append(box);
    handles.push(mountKeypad(box, { layout, keySize: size, maxLength: 4, placeholder: '?', onSubmit: (v) => { box.dataset.submitted = v; } }));
  }
  const actions = el('div', 'pl-row pl-actions');
  miscSec.append(actions);
  const mkBtn = (label: string, id: string, fn: () => void) => {
    const b = el('button', 'kit-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.id = id;
    b.addEventListener('click', fn);
    actions.append(b);
    return b;
  };
  let enabled = true;
  mkBtn('键盘 禁用 / 启用', 'btn-keys', () => {
    enabled = !enabled;
    handles.forEach((hd) => hd.setEnabled(enabled));
  });
  mkBtn('结果卡（3 星，无纸屑）', 'btn-result', () => {
    void showResult({ ribbon: '过关啦', stars: 3, title: '稳稳收官', text: 'confetti: false', confetti: false, actions: [{ id: 'ok', label: '好的', kind: 'primary' }] });
  });
  mkBtn('家长 PIN 弹窗', 'btn-pin', () => {
    void askParentPin({ title: '家长角', text: '请输入家长 PIN' }).then((ok) => (document.body.dataset.pinResult = String(ok)));
  });
  if (isTestEnv() && !hasPin()) mkBtn('（测试）设置 PIN 1234', 'btn-setpin', () => setPin('1234'));

  // metrics: evaluated + written into the real kit API, but into a private in-memory store (the lab never touches the family's data)
  const mem = new Map<string, string>();
  const store = { get length() { return mem.size; }, key: (i: number) => [...mem.keys()][i] ?? null, getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() } as Storage;
  const defs: MetricDef[] = [
    { id: 'lessons', label: '课程进度', value: () => ({ value: '12 / 33', frac: 12 / 33, detail: '学堂已通关的课', status: 'ok' }) },
    { id: 'mate1', label: '一步杀首次做对率', value: () => ({ value: '31%', frac: 0.31, detail: '近 30 题', status: 'watch', hint: '这一块有点吃力，可以陪他玩一次' }) },
    { id: 'later', label: '还没数据', value: () => null },
  ];
  writeMetricsSummary('lab-demo', { metrics: evaluateMetrics(defs), data: { pae: [1, 2, 3] } }, { storage: store });
  const sum = readMetricsSummary('lab-demo', store);
  const pre = el('pre', 'pl-pre');
  pre.id = 'metrics-out';
  pre.textContent = `kg:metrics:v1:lab-demo (${mem.get('kg:metrics:v1:lab-demo')?.length ?? 0} B)\n` + JSON.stringify(sum?.metrics.map((m) => `${m.label} = ${m.value} [${m.status ?? 'note'}]${m.hint ? ' — ' + m.hint : ''}`), null, 1);
  miscSec.append(pre);

  const safe = safeAreaOverride();
  const info = el('pre', 'pl-pre');
  info.id = 'dev-out';
  const cs = getComputedStyle(document.documentElement);
  info.textContent = [
    `isDevServer=${isDevServer()}  isAutomated=${isAutomated()}  isTestEnv=${isTestEnv()}`,
    `?safe= override: ${safe ? `${safe.top},${safe.right},${safe.bottom},${safe.left}` : '(none)'}   tokens: top=${cs.getPropertyValue('--kit-safe-top').trim() || 'env()'} bottom=${cs.getPropertyValue('--kit-safe-bottom').trim() || 'env()'}`,
    `unlockAll=${unlockAll()}  narration=${getSettings().narration}  clip cache=${(() => { const c = clipCacheStats(); return `${c.clips} clips, ${c.bytes} B, limit ${Number.isFinite(c.limit) ? c.limit + ' B' : 'unlimited'}`; })()}`,
  ].join('\n');
  miscSec.append(info);
  bindPress(miscSec);
}
