/* =============================================================================
   星港 UI Kit · DOM helpers (framework-free, tree-shakeable)
   -----------------------------------------------------------------------------
   import { bindPress, showResult, toast, mountKeypad, segmented, nodeMap,
            startDrag, ghostTap, ghostDrag, confetti, icon, emblem, starSvg } from './kit';
   All helpers are optional; the CSS works on its own with plain markup.
   ============================================================================= */
import { UI_ICONS, type UiIconName } from './icons.generated';
import { GAME_EMBLEMS, type GameEmblemId } from './emblems.generated';

export { UI_ICONS, GAME_EMBLEMS };
export type { UiIconName, GameEmblemId };

/* ------------------------------------------------------------------ hooks */
export type SfxHook = (name: string, o?: { semitones?: number; gain?: number }) => void;
/** anything with play(name, opts) — ui/sfx.ts `Sfx`, or a wrapper around the repo's kit/audio */
export interface SfxPlayer { play(name: string, o?: { semitones?: number; gain?: number }): unknown }
let sfxHook: SfxHook = () => undefined;
/** route kit sounds to your audio module: setSfx((n,o)=>sfx.play(n,o)) or setSfx(sfxInstance) */
export function setSfx(s: SfxHook | SfxPlayer | null) {
  if (!s) sfxHook = () => undefined;
  else if (typeof s === 'function') sfxHook = s;
  else sfxHook = (n, o) => s.play(n, o);
}
export const sound = (name: string, o?: { semitones?: number; gain?: number }) => sfxHook(name, o);

/* ------------------------------------------------------------------ icons */
export function icon(name: UiIconName, cls = ''): string {
  return `<span class="xg-icon ${cls}" aria-hidden="true"><svg viewBox="0 0 32 32">${UI_ICONS[name]}</svg></span>`;
}
export function emblem(id: GameEmblemId): string {
  // ids inside emblems are prefixed per game; duplicate use on one page is fine (identical defs)
  return GAME_EMBLEMS[id];
}

let starUid = 0;
/** Polished reward star. kind: 'gold' (earned) | 'slot' (empty, pressed into paper) | 'flat' (small rating) */
export function starSvg(kind: 'gold' | 'slot' | 'flat' = 'gold'): string {
  const id = `xgst${++starUid}`;
  const P = 'M50 6.5c2.2 0 4.1 1.3 5 3.3l10.3 21.5 23.4 3.2c2.2.3 4 1.8 4.7 3.9.7 2.1.1 4.4-1.5 5.9L74.7 60.8l4.2 23.3c.4 2.2-.5 4.4-2.3 5.7-1.8 1.3-4.1 1.5-6.1.4L50 79 29.5 90.2c-2 1.1-4.3.9-6.1-.4-1.8-1.3-2.7-3.5-2.3-5.7l4.2-23.3L8.1 44.3c-1.6-1.5-2.2-3.8-1.5-5.9.7-2.1 2.5-3.6 4.7-3.9l23.4-3.2L45 9.8c.9-2 2.8-3.3 5-3.3Z';
  if (kind === 'slot') {
    return `<svg viewBox="0 0 100 100"><path d="${P}" fill="#e8d5b1"/><path d="${P}" fill="none" stroke="#d2b88b" stroke-width="3" transform="translate(0 1.5)" opacity=".7"/><path d="${P}" fill="#efe0c4" transform="translate(50 52) scale(.86) translate(-50 -50)"/></svg>`;
  }
  if (kind === 'flat') {
    return `<svg viewBox="0 0 100 100"><path d="${P}" fill="#f6b934" stroke="#df9a1c" stroke-width="5" stroke-linejoin="round"/><path d="M50 22l7 15 16 2.4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return `<svg viewBox="0 0 100 100"><defs>
    <linearGradient id="${id}g" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".5" stop-color="#f9c23c"/><stop offset="1" stop-color="#e99a14"/></linearGradient></defs>
    <path d="${P}" fill="#c27a0e" transform="translate(0 4)"/>
    <path d="${P}" fill="url(#${id}g)"/>
    <path d="M50 50 70 90.2 76.6 89.8 78.9 84.1 74.7 60.8 91.5 44.3Z" fill="#e48f0c" opacity=".45"/>
    <path d="M50 50 8.1 44.3 25.3 60.8 21.1 84.1Z" fill="#ffd45c" opacity=".35"/>
    <path d="M47.5 17.5 39.5 34.5 22 37" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
    <circle cx="62" cy="30" r="3.5" fill="#fff" opacity=".7"/>
    <path d="${P}" fill="none" stroke="#b56d06" stroke-opacity=".35" stroke-width="2"/></svg>`;
}
export function starRating(n: number, of = 3, cls = ''): string {
  let h = `<span class="xg-stars ${cls}" role="img" aria-label="${n} / ${of} 星">`;
  for (let i = 0; i < of; i++) h += `<span class="xg-s">${starSvg(i < n ? 'gold' : 'slot')}</span>`;
  return h + '</span>';
}

/* ------------------------------------------------------------------ press */
const PRESSABLE = '.xg-btn,.xg-iconbtn,.xg-pill,.xg-card,.xg-key,.xg-node,.xg-start__btn,[data-xg-press]';
const DEFAULT_SFX: [string, string][] = [
  ['.xg-btn--primary,.xg-btn--accent,.xg-start__btn', 'ui-press'], ['.xg-btn--gold', 'ui-press'],
  ['.xg-key', 'ui-key'], ['.xg-node--locked', 'ui-locked'], ['.xg-node', 'ui-select'], ['.xg-card', 'ui-pop'],
  ['.xg-btn,.xg-iconbtn,.xg-pill', 'ui-tap'],
];
/**
 * Tactile press for every pressable inside root (event delegation, first pointer only).
 * Adds .is-pressed on down, .is-released (spring squash) on up, plays data-sfx or a default.
 * data-sfx="none" silences an element.
 */
const handledDowns = new WeakSet<Event>();
export function bindPress(root: HTMLElement | Document = document): () => void {
  let active: HTMLElement | null = null;
  const down = (e: PointerEvent) => {
    if (!e.isPrimary || e.button > 0 || handledDowns.has(e)) return;
    const t = (e.target as Element).closest<HTMLElement>(PRESSABLE);
    if (!t || t.hasAttribute('disabled')) return;
    handledDowns.add(e);
    active = t;
    t.classList.remove('is-released');
    t.classList.add('is-pressed');
    const s = t.dataset.sfx ?? DEFAULT_SFX.find(([sel]) => t.matches(sel))?.[1];
    if (s && s !== 'none') sound(s, t.classList.contains('xg-key') ? { semitones: keyPitch(t) } : undefined);
  };
  const up = () => {
    if (!active) return;
    const t = active; active = null;
    t.classList.remove('is-pressed');
    void t.offsetWidth;
    t.classList.add('is-released');
    window.setTimeout(() => t.classList.remove('is-released'), 400);
  };
  root.addEventListener('pointerdown', down as EventListener, { passive: true });
  window.addEventListener('pointerup', up, { passive: true });
  window.addEventListener('pointercancel', up, { passive: true });
  return () => {
    root.removeEventListener('pointerdown', down as EventListener);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}
function keyPitch(k: HTMLElement): number {
  const d = Number(k.dataset.key);
  return Number.isFinite(d) ? [0, 2, 4, 7, 9, 12, 14, 16, 19, 21][d] - 7 : 0;
}

/* ------------------------------------------------------------------ toast */
let toastLayer: HTMLElement | null = null;
export function toast(text: string, o: { icon?: UiIconName; tone?: 'ok' | 'try' | 'info' | 'accent'; ms?: number; sfx?: string | null } = {}): void {
  if (!toastLayer) { toastLayer = document.createElement('div'); toastLayer.className = 'xg-toast-layer xg-root'; document.body.appendChild(toastLayer); }
  const t = document.createElement('div');
  t.className = `xg-toast xg-toast--${o.tone ?? 'accent'}`;
  t.setAttribute('role', 'status');
  t.innerHTML = `<span class="xg-toast__icon">${icon(o.icon ?? (o.tone === 'ok' ? 'check' : o.tone === 'try' ? 'hint' : 'star'))}</span><span></span>`;
  (t.lastElementChild as HTMLElement).textContent = text;
  toastLayer.appendChild(t);
  if (o.sfx !== null) sound(o.sfx ?? 'ui-notify');
  window.setTimeout(() => { t.classList.add('is-leaving'); window.setTimeout(() => t.remove(), 260); }, o.ms ?? 2400);
}

/* ------------------------------------------------------------------ confetti (paper) */
export function confetti(n = 60, colors = ['#f6b934', '#e4513d', '#1aa892', '#8a73ee', '#3f7be6', '#fff6e3', '#eb6a3c']): void {
  const layer = document.createElement('div');
  layer.className = 'xg-confetti';
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
    c.style.setProperty('--rot', `${(Math.random() - 0.5) * 1080}deg`);
    c.style.setProperty('--d', `${2 + Math.random() * 1.6}s`);
    c.style.setProperty('--delay', `${Math.random() * 0.5}s`);
    const s = 0.7 + Math.random() * 0.7;
    c.style.width = `${10 * s}px`; c.style.height = `${14 * s}px`;
    if (i % 4 === 0) c.style.borderRadius = '50%';
    layer.appendChild(c);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 4400);
}

/* ------------------------------------------------------------------ modal / result */
export interface ResultAction { id: string; label: string; kind?: 'primary' | 'secondary' | 'accent' | 'gold'; icon?: UiIconName }
export interface ResultOptions {
  ribbon?: string;            // e.g. '第 3 关完成'
  title?: string;             // big line under the stars
  text?: string;              // process praise (过程性表扬), WenKai
  stars?: 0 | 1 | 2 | 3;
  stats?: { label: string; value: string | number; best?: boolean }[];
  actions?: ResultAction[];   // never auto-advance (plan §3.0)
  closable?: boolean;
  accentGame?: string;        // sets data-xg-game on the scrim
  onOpen?: (panel: HTMLElement) => void;
}
export function showResult(o: ResultOptions): Promise<string> {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'xg-scrim xg-root';
    if (o.accentGame) scrim.dataset.xgGame = o.accentGame;
    const stars = o.stars ?? 0;
    const rays = Array.from({ length: 8 }, (_, k) => `<i style="--a:${k * 45}deg"></i>`).join('');
    const starHtml = o.stars === undefined ? '' : `<div class="xg-result-stars">${[0, 1, 2].map(() =>
      `<div class="xg-rstar"><div class="xg-rstar__slot">${starSvg('slot')}</div><div class="xg-rstar__burst">${rays}</div><div class="xg-rstar__fill">${starSvg('gold')}</div></div>`).join('')}</div>`;
    const stats = (o.stats ?? []).map((s) => `<div class="xg-stat${s.best ? ' xg-stat--best' : ''}"><b>${s.value}</b><span>${s.label}</span></div>`).join('');
    const acts = (o.actions ?? [{ id: 'ok', label: '好的', kind: 'primary' }]).map((a) =>
      `<button class="xg-btn xg-btn--${a.kind ?? 'secondary'}${a.kind === 'primary' || a.kind === 'accent' ? ' xg-btn--lg' : ''}" data-act="${a.id}">${a.icon && a.icon !== 'next' ? icon(a.icon) : ''}<span>${a.label}</span>${a.icon === 'next' ? icon('next') : ''}</button>`).join('');
    scrim.innerHTML = `<div class="xg-modal" role="dialog" aria-modal="true">
      ${o.ribbon ? `<div class="xg-ribbon">${o.ribbon}</div>` : ''}
      ${o.closable ? `<button class="xg-iconbtn xg-iconbtn--sm xg-modal__close" data-act="close" aria-label="关闭">${icon('close')}</button>` : ''}
      ${starHtml}
      ${o.title ? `<h2 class="xg-modal__title">${o.title}</h2>` : ''}
      ${o.text ? `<p class="xg-modal__text">${o.text}</p>` : ''}
      ${stats ? `<div class="xg-result-stats">${stats}</div>` : ''}
      <div class="xg-modal__actions">${acts}</div></div>`;
    document.body.appendChild(scrim);
    const unbind = bindPress(scrim);
    sound('ui-open');
    // star reveal sequence
    const els = Array.from(scrim.querySelectorAll<HTMLElement>('.xg-rstar'));
    els.forEach((el, i) => {
      if (i >= stars) return;
      window.setTimeout(() => {
        el.classList.add('is-earned');
        sound(`star-${i + 1}`);
      }, 520 + i * 420);
    });
    if (stars > 0) window.setTimeout(() => sound('level-complete', { gain: 0.8 }), 520 + stars * 420 + 120);
    if (stars === 3) window.setTimeout(() => confetti(70), 520 + 3 * 420);
    o.onOpen?.(scrim.querySelector('.xg-modal') as HTMLElement);
    scrim.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-act]');
      if (!b) return;
      sound('ui-close');
      scrim.classList.add('is-leaving');
      window.setTimeout(() => { unbind(); scrim.remove(); }, 260);
      resolve(b.dataset.act!);
    });
  });
}

/* ------------------------------------------------------------------ keypad */
export interface KeypadOptions {
  maxLength?: number;
  placeholder?: string;
  onChange?: (v: string) => void;
  onSubmit?: (v: string) => void | boolean; // return false → gentle nudge (not "wrong")
  display?: HTMLElement | null;             // existing .xg-display, or one is created above the keys
}
export function mountKeypad(el: HTMLElement, o: KeypadOptions = {}) {
  let value = '';
  const disp = o.display ?? document.createElement('div');
  if (!o.display) { disp.className = 'xg-display'; el.appendChild(disp); }
  const pad = document.createElement('div');
  pad.className = 'xg-keypad';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  pad.innerHTML = keys.map((k) => k === 'del'
    ? `<button class="xg-key xg-key--del" data-key="del" data-sfx="ui-key-delete" aria-label="删除">${icon('backspace')}</button>`
    : k === 'ok' ? `<button class="xg-key xg-key--ok" data-key="ok" data-sfx="ui-confirm" aria-label="确定">${icon('check')}</button>`
    : `<button class="xg-key" data-key="${k}">${k}</button>`).join('');
  el.appendChild(pad);
  const render = () => {
    disp.classList.toggle('is-empty', !value);
    disp.innerHTML = value ? `<span>${value}</span><i class="xg-display__caret"></i>` : `<span class="xg-display__ph">${o.placeholder ?? '?'}</span><i class="xg-display__caret"></i>`;
  };
  render();
  pad.addEventListener('click', (e) => {
    const k = (e.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key;
    if (!k) return;
    if (k === 'del') value = value.slice(0, -1);
    else if (k === 'ok') {
      const r = o.onSubmit?.(value);
      if (r === false) { disp.classList.remove('is-shake'); void disp.offsetWidth; disp.classList.add('is-shake'); }
      return;
    } else if (value.length < (o.maxLength ?? 3)) value = value === '0' ? k : value + k;
    render(); o.onChange?.(value);
  });
  return { get value() { return value; }, set value(v: string) { value = v; render(); }, clear() { value = ''; render(); } };
}

/* ------------------------------------------------------------------ segmented */
export function segmented(el: HTMLElement, o: { options: { id: string; label: string; icon?: UiIconName }[]; value?: string; night?: boolean; onChange?: (id: string) => void }) {
  el.classList.add('xg-seg'); if (o.night) el.classList.add('xg-seg--night');
  el.setAttribute('role', 'tablist');
  el.style.setProperty('--n', String(o.options.length));
  el.innerHTML = `<span class="xg-seg__thumb"></span>` + o.options.map((op) =>
    `<button role="tab" data-id="${op.id}" data-sfx="ui-tick">${op.icon ? icon(op.icon) : ''}<span>${op.label}</span></button>`).join('');
  const set = (id: string) => {
    const i = Math.max(0, o.options.findIndex((x) => x.id === id));
    el.style.setProperty('--i', String(i));
    el.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
  };
  set(o.value ?? o.options[0].id);
  el.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('button[data-id]');
    if (!b) return; set(b.dataset.id!); o.onChange?.(b.dataset.id!);
  });
  bindPress(el);
  return { set };
}

/* ------------------------------------------------------------------ progress */
export function progress(value: number, cls = ''): string {
  return `<div class="xg-progress ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(value * 100)}" style="--value:${value}"><div class="xg-progress__fill"></div></div>`;
}
export function setProgress(el: HTMLElement, value: number) {
  el.style.setProperty('--value', String(Math.max(0, Math.min(1, value))));
  el.setAttribute('aria-valuenow', String(Math.round(value * 100)));
}

/* ------------------------------------------------------------------ level node map */
export interface MapNode { id: string; label?: string; state: 'locked' | 'open' | 'done' | 'current'; stars?: number; boss?: boolean }
export interface NodeMapOptions {
  marker?: HTMLElement;            // e.g. a companion head, floats above the current node
  onPick?: (n: MapNode) => void;
  pad?: number;                    // keep node centres this far from the box edge (default 70)
  waves?: number;                  // how many S-bends the road makes (default 1.25 landscape / 1.5 portrait)
}
/**
 * Lays nodes at EQUAL ARC-LENGTH along a smooth winding road that fills the container
 * (landscape: left→right wave; portrait: bottom→top zig-zag), so nodes never crowd.
 * Re-call on resize/orientation change. Returns the node buttons.
 */
export function nodeMap(el: HTMLElement, nodes: MapNode[], o: NodeMapOptions = {}) {
  el.classList.add('xg-map');
  const w = el.clientWidth, h = el.clientHeight, n = nodes.length;
  const landscape = w >= h;
  const pad = o.pad ?? 70;
  const waves = o.waves ?? (landscape ? 1.25 : 1.5);
  const N = 480;
  const raw: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = Math.sin(t * Math.PI * 2 * waves - Math.PI / 2);
    raw.push(landscape
      ? [pad + (w - 2 * pad) * t, h / 2 + (h / 2 - pad) * 0.92 * s]
      : [w / 2 + (w / 2 - pad) * 0.92 * s, h - pad - (h - 2 * pad) * t]);
  }
  const cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const total = cum[N];
  const at = (len: number): [number, number] => {
    let k = 1; while (k < N && cum[k] < len) k++;
    const f = (len - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]);
    return [raw[k - 1][0] + (raw[k][0] - raw[k - 1][0]) * f, raw[k - 1][1] + (raw[k][1] - raw[k - 1][1]) * f];
  };
  const pts = nodes.map((_, i) => at(n === 1 ? total / 2 : (total * i) / (n - 1)));
  const poly = (upTo: number) => raw.filter((_, i) => cum[i] <= upTo + 0.5).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
  const cur = nodes.reduce((a, nd, i) => (nd.state === 'done' || nd.state === 'current' ? i : a), -1);
  const doneLen = cur < 0 ? 0 : (n === 1 ? total / 2 : (total * cur) / (n - 1));
  const d = poly(total);
  el.innerHTML = `<svg class="xg-map__path" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="rgba(52,30,12,.16)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 6)"/>
    <path d="${d}" fill="none" stroke="var(--xg-paper-0)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="var(--xg-paper-300)" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.1 16"/>
    ${doneLen > 0 ? `<path d="${poly(doneLen)}" fill="none" stroke="var(--xg-accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="0.1 16"/>` : ''}
  </svg>`;
  const els = nodes.map((nd, i) => {
    const b = document.createElement('button');
    const st = nd.state;
    b.className = `xg-node xg-node--${st === 'current' ? 'done xg-node--current' : st}${nd.boss ? ' xg-node--boss' : ''}`;
    b.style.left = `${pts[i][0]}px`; b.style.top = `${pts[i][1]}px`;
    b.setAttribute('aria-label', `${nd.label ?? i + 1}${st === 'locked' ? '（未解锁）' : ''}`);
    b.innerHTML = nd.boss ? icon(st === 'locked' ? 'lock' : 'star') : st === 'locked' ? icon('lock') : `<span>${nd.label ?? i + 1}</span>`;
    if ((st === 'done' || (nd.boss && st !== 'locked')) && nd.stars !== undefined) b.innerHTML += `<span class="xg-node__stars">${starRating(nd.stars, 3, 'xg-stars--arc')}</span>`;
    if (st === 'current' && o.marker) { const m = document.createElement('span'); m.className = 'xg-node__marker'; m.appendChild(o.marker); b.appendChild(m); }
    b.addEventListener('click', () => o.onPick?.(nd));
    el.appendChild(b);
    return b;
  });
  bindPress(el);
  return els;
}

/* ------------------------------------------------------------------ drag ghost */
export interface DragHandle { move(x: number, y: number): void; drop(target: HTMLElement | null): Promise<void>; }
/**
 * Lift a visual clone under the finger. Call from pointerdown on a .xg-draggable.
 * targets: candidate drop zones (.xg-drop) — the one under the finger gets .is-over.
 * Snap: animates into the target centre; miss: flies home. Also supports tap-to-select
 * (call `selectForTap(el)` and then tap a target) for kids who struggle with dragging.
 */
export function startDrag(src: HTMLElement, ev: PointerEvent, targets: HTMLElement[] = []): DragHandle {
  const r = src.getBoundingClientRect();
  const g = src.cloneNode(true) as HTMLElement;
  g.classList.add('xg-drag-ghost');
  g.classList.remove('is-lifted');
  g.style.width = `${r.width}px`; g.style.height = `${r.height}px`; g.style.margin = '0';
  const ox = ev.clientX - r.left, oy = ev.clientY - r.top;
  const place = (x: number, y: number) => { g.style.transform = `translate3d(${x - ox}px, ${y - oy}px, 0)`; };
  place(ev.clientX, ev.clientY);
  document.body.appendChild(g);
  src.classList.add('is-lifted');
  sound('ui-pick');
  let over: HTMLElement | null = null;
  const hit = (x: number, y: number) => targets.find((t) => { const b = t.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; }) ?? null;
  return {
    move(x, y) {
      place(x, y);
      const h = hit(x, y);
      if (h !== over) { over?.classList.remove('is-over'); h?.classList.add('is-over'); if (h) sound('ui-tick'); over = h; }
    },
    drop(target) {
      over?.classList.remove('is-over');
      const t = target ?? over;
      return new Promise((res) => {
        if (t) {
          const b = t.getBoundingClientRect();
          g.classList.add('is-snapping');
          g.style.transform = `translate3d(${b.left + (b.width - r.width) / 2}px, ${b.top + (b.height - r.height) / 2}px, 0)`;
          sound('ui-snap');
        } else {
          g.classList.add('is-returning');
          g.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
          sound('whoosh-down', { gain: 0.6 });
        }
        window.setTimeout(() => { g.remove(); src.classList.remove('is-lifted'); res(); }, t ? 260 : 420);
      });
    },
  };
}

/* ------------------------------------------------------------------ ghost hand (幽灵手 ≤3 s demo) */
const HAND_SVG = `<svg viewBox="0 0 84 84"><path d="M30 8c4 0 7 3 7 7v22l2-1c3-1 6 0 7 3l1 2 2-1c3-1 6 1 7 4l.5 1.5 1.5-.5c3-.8 6 1 6.8 4l2.2 9c2 9-2 18-10 22l-4 2c-6 3-14 2-19-3L19 63c-3-3-3-7 0-10 3-2.5 7-2.3 9.5.4l-5.5-5.4V15c0-4 3-7 7-7Z" fill="#fffaf0" stroke="#261c30" stroke-width="3.2" stroke-linejoin="round"/><path d="M37 37v10M47 41v8M56 46v6" stroke="#261c30" stroke-width="2.6" stroke-linecap="round" opacity=".5"/><circle cx="30" cy="14" r="2.2" fill="#ffd2c2"/></svg>`;
let hand: HTMLElement | null = null;
function ensureHand() {
  if (!hand) { hand = document.createElement('div'); hand.className = 'xg-ghost-hand'; hand.innerHTML = HAND_SVG; document.body.appendChild(hand); }
  return hand;
}
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
const centre = (el: Element) => { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2] as const; };
function handTo(x: number, y: number, ms: number) {
  const h = ensureHand();
  h.style.transition = `transform ${ms}ms cubic-bezier(.45,0,.25,1), opacity .2s`;
  h.style.transform = `translate3d(${x - 25}px, ${y - 8}px, 0)`;
}
export async function ghostTap(target: Element) {
  const h = ensureHand(); const [x, y] = centre(target);
  h.style.transition = 'none'; h.style.transform = `translate3d(${x + 60}px, ${y + 90}px, 0)`; void h.offsetWidth;
  h.classList.add('is-on'); handTo(x, y, 700); await wait(760);
  h.classList.add('is-down'); ripple(x, y); await wait(260); h.classList.remove('is-down'); await wait(500);
  h.classList.remove('is-on');
}
export async function ghostDrag(from: Element, to: Element) {
  const h = ensureHand(); const [x0, y0] = centre(from); const [x1, y1] = centre(to);
  h.style.transition = 'none'; h.style.transform = `translate3d(${x0 + 50}px, ${y0 + 80}px, 0)`; void h.offsetWidth;
  h.classList.add('is-on'); handTo(x0, y0, 600); await wait(640);
  h.classList.add('is-down'); await wait(200); handTo(x1, y1, 1000); await wait(1040);
  h.classList.remove('is-down'); ripple(x1, y1); await wait(450); h.classList.remove('is-on');
}
function ripple(x: number, y: number) {
  const r = document.createElement('div'); r.className = 'xg-ghost-ripple'; r.style.left = `${x}px`; r.style.top = `${y}px`;
  document.body.appendChild(r); window.setTimeout(() => r.remove(), 800);
}

/* ------------------------------------------------------------------ replay / hint state */
export function replayButton(label = '再听一遍'): string {
  return `<button class="xg-pill xg-replay" data-sfx="ui-tap">${icon('replay')}<span class="xg-bars" aria-hidden="true"><i></i><i></i><i></i></span><span>${label}</span></button>`;
}
export const setPlaying = (btn: HTMLElement, on: boolean) => btn.classList.toggle('is-playing', on);
export const setHintReady = (btn: HTMLElement, ready: boolean) => { btn.dataset.state = ready ? 'ready' : 'idle'; };
