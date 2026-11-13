/**
 * 涂装台 — the shared paint shop. A game opens it with what can be painted (a target with parts) and how to draw
 * the live preview; the child picks a colour, a pattern and up to 3 stickers from ready-made sets (never a blank
 * page, never a free colour picker, nothing locked), sees it on the moving preview at once, and 保存 hands the
 * game the new looks (already written to this device's save).
 *
 *   const res = await openLiveryStudio({ target, title: '我的蛇', preview: { draw(ctx, w, h, t, looks, info) { … } } });
 *   if (res.saved) applyLooks(res.looks);
 *
 * Preview contract: `draw` paints one whole frame of a w×h canvas (device pixels, already sized); `t` is seconds
 * since opening (frozen with reduced motion: then it is called once per change), `info.changedAt` is the `t` of
 * the last edit (for a little hop), `info.part` the part tab in front. Games that render with DOM instead pass
 * `{ mount(host, looks) → { update(looks, info), destroy() } }`.
 */
import { h, bindPress, icon, showModal, xgToast, sound } from '../ui';
import { prefersReducedMotion } from '../tween';
import { colorById, patternById, stickerById } from './catalog';
import { cloneLook, colorsOf, defaultLooks, liveryStore, maxStickersOf, patternsOf, randomLook, sameLook, sameLooks, sanitizeLooks, stickersOf, toggleSticker, type LiveryPart, type LiveryStore, type LiveryTarget, type Looks } from './look';
import { paintSwatch, stickerSvg } from './paint';
import './studio.css';

export interface PreviewInfo { part: string; changedAt: number; reduced: boolean }
export interface CanvasPreview {
  draw(c: CanvasRenderingContext2D, w: number, h: number, t: number, looks: Looks, info: PreviewInfo): void;
}
export interface MountedPreview { update(looks: Looks, info: PreviewInfo): void; destroy(): void }
export interface MountPreview { mount(host: HTMLElement, looks: Looks): MountedPreview }

/** semantic studio sounds; the game maps them onto its own sound bank */
export type StudioSfx = 'select' | 'sticker-on' | 'sticker-off' | 'full' | 'random' | 'reset' | 'save' | 'close' | 'tab';

export interface StudioOptions {
  target: LiveryTarget;
  /** what is being painted, under 涂装台 ("我的蛇") */
  title?: string;
  preview: CanvasPreview | MountPreview;
  /** default: liveryStore(target) */
  store?: LiveryStore;
  /** start from these looks instead of the saved ones */
  initial?: Looks;
  /** first part tab (multi-part targets) */
  part?: string;
  sfx?: (name: StudioSfx) => void;
  /** where the studio mounts (default document.body) */
  root?: HTMLElement;
}

export interface StudioResult { saved: boolean; looks: Looks }

type Tab = 'color' | 'pattern' | 'sticker';

const DICE = '<svg class="xg-icon" viewBox="0 0 32 32" aria-hidden="true"><rect x="4.5" y="4.5" width="23" height="23" rx="6.5" fill="currentColor"/><g fill="var(--lv-dice-dot, #1b2656)"><circle cx="11" cy="11" r="2.6"/><circle cx="21" cy="11" r="2.6"/><circle cx="16" cy="16" r="2.6"/><circle cx="11" cy="21" r="2.6"/><circle cx="21" cy="21" r="2.6"/></g></svg>';
const TAB_ICON: Record<Tab, string> = {
  color: '<svg class="xg-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4.5C9.1 4.5 4 9.6 4 16c0 6.1 4.9 11.5 11 11.5 1.8 0 2.7-1 2.7-2.3 0-1.7-1.6-2.1-1.6-3.6 0-1.3 1-2.2 2.4-2.2h3.1c3.5 0 6.4-2.6 6.4-6.2C28 8.4 22.6 4.5 16 4.5Z" fill="currentColor"/><circle cx="10.5" cy="14" r="2.3" fill="#ff5f7e"/><circle cx="14.5" cy="9" r="2.3" fill="#ffd23f"/><circle cx="20.5" cy="9.5" r="2.3" fill="#4fe3a1"/><circle cx="23.5" cy="14.5" r="2.3" fill="#6c8cff"/></svg>',
  pattern: '<svg class="xg-icon" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="currentColor"/><path d="M8 24 24 8M5.5 18.5 18.5 5.5M13.5 26.5l13-13" stroke="var(--lv-dice-dot, #1b2656)" stroke-width="3" stroke-linecap="round" opacity=".55"/></svg>',
  sticker: '<svg class="xg-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 4.5h16A3.5 3.5 0 0 1 27.5 8v10.5L18.5 27.5H8A3.5 3.5 0 0 1 4.5 24V8A3.5 3.5 0 0 1 8 4.5Z" fill="currentColor"/><path d="M27.5 18.5h-6a3 3 0 0 0-3 3v6" fill="none" stroke="var(--lv-dice-dot, #1b2656)" stroke-width="2.4" stroke-linejoin="round"/><path d="m16 9.5 1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6Z" fill="var(--lv-dice-dot, #1b2656)"/></svg>',
};
const TAB_NAME: Record<Tab, string> = { color: '颜色', pattern: '花纹', sticker: '贴纸' };

/** default sounds (kit semantic bank, through whatever the game installed with setSfx / installKitSfx) */
const KIT_SFX: Record<StudioSfx, string> = { select: 'ui-select', 'sticker-on': 'ui-pop', 'sticker-off': 'ui-back', full: 'ui-locked', random: 'jingle-magic', reset: 'ui-back', save: 'ui-confirm', close: 'ui-close', tab: 'ui-tap' };

let open: Promise<StudioResult> | null = null;

/** Open the 涂装台. Resolves when it closes: `saved` true after 保存 (looks are stored), false when left unchanged. */
export function openLiveryStudio(o: StudioOptions): Promise<StudioResult> {
  if (open) return open;
  open = run(o).finally(() => { open = null; });
  return open;
}

function run(o: StudioOptions): Promise<StudioResult> {
  return new Promise((resolve) => {
    const { target } = o;
    const store = o.store ?? liveryStore(target);
    const saved = sanitizeLooks(target, o.initial ?? store.load());
    const looks: Looks = {};
    for (const p of target.parts) looks[p.id] = cloneLook(saved[p.id]);
    const defaults = defaultLooks(target);
    let part: LiveryPart = target.parts.find((p) => p.id === o.part) ?? target.parts[0];
    let tab: Tab = 'color';
    const reduced = prefersReducedMotion();
    const sfx = (n: StudioSfx) => { try { if (o.sfx) o.sfx(n); else sound(KIT_SFX[n]); } catch { /* sound is optional */ } };
    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;
    let changedAt = -9;

    // ---------------------------------------------------------------- DOM
    const close = h('button', { class: 'xg-btn xg-btn--night lv-close', type: 'button', 'aria-label': '关上涂装台', 'data-sfx': 'none' });
    close.innerHTML = icon('close');
    const dice = h('button', { class: 'xg-btn xg-btn--night lv-tool lv-random', type: 'button', 'aria-label': '随机来一个', 'data-sfx': 'none' });
    dice.innerHTML = `${DICE}<span class="lv-tool__label">随机来一个</span>`;
    const reset = h('button', { class: 'xg-btn xg-btn--night lv-tool lv-reset', type: 'button', 'aria-label': '恢复原样', 'data-sfx': 'none' });
    reset.innerHTML = `${icon('undo')}<span class="lv-tool__label">恢复原样</span>`;
    const top = h('header', { class: 'lv-top' }, close,
      h('h2', { class: 'lv-title' }, h('span', { class: 'lv-title__main' }, '涂装台'), o.title ? h('span', { class: 'lv-title__sub' }, o.title) : null),
      h('div', { class: 'lv-tools' }, dice, reset));

    const stage = h('div', { class: 'lv-stage' });
    const parts = h('div', { class: 'lv-parts', role: 'tablist', 'aria-label': '涂哪里' });
    if (target.parts.length > 1) stage.append(parts);
    let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, mounted: MountedPreview | null = null;
    if ('draw' in o.preview) {
      canvas = h('canvas', { class: 'lv-cv', 'aria-hidden': 'true' }) as HTMLCanvasElement;
      ctx = canvas.getContext('2d');
      stage.prepend(canvas);
    } else {
      const host = h('div', { class: 'lv-host' });
      stage.prepend(host);
      mounted = o.preview.mount(host, looks);
    }

    const tabs = h('div', { class: 'lv-tabs', role: 'tablist', 'aria-label': '选什么' });
    const count = h('span', { class: 'lv-count', 'aria-live': 'polite' });
    const grid = h('div', { class: 'lv-grid', role: 'tabpanel' });
    stage.append(count);   // 已贴 n/3 sits on the preview, where the stickers show up
    const panel = h('section', { class: 'lv-panel' }, h('div', { class: 'lv-panel__bar' }, tabs), grid);
    const save = h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg lv-save', type: 'button', 'data-sfx': 'none' });
    save.innerHTML = `${icon('check')}<span>保存</span>`;
    const foot = h('footer', { class: 'lv-foot' }, save);
    const el = h('div', { class: 'lv-studio xg-root', 'data-xg-theme': 'night', role: 'dialog', 'aria-modal': 'true', 'aria-label': `涂装台${o.title ? ` · ${o.title}` : ''}` }, top, stage, panel, foot);
    if (reduced) el.classList.add('is-reduced');
    (o.root ?? document.body).append(el);
    // the page's 🏠 (kit back button) sits where 关上 is and would leave the game with the paint unsaved: hide it meanwhile
    document.documentElement.classList.add('lv-studio-open');
    const unbind = bindPress(el);

    // ---------------------------------------------------------------- tiles
    const swatches: { cv: HTMLCanvasElement; kind: 'color' | 'pattern'; id: string }[] = [];
    const drawSwatches = () => {
      const look = looks[part.id];
      for (const s of swatches) {
        const c = s.cv.getContext('2d'); if (!c) continue;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, s.cv.width, s.cv.height);
        if (s.kind === 'color') paintSwatch(c, look.pattern, s.cv.width, s.id);
        else paintSwatch(c, s.id, s.cv.width, look.color);
      }
    };
    const swatch = (kind: 'color' | 'pattern', id: string) => {
      const cv = h('canvas', { class: 'lv-swatch', width: 128, height: 128, 'aria-hidden': 'true' }) as HTMLCanvasElement;
      swatches.push({ cv, kind, id });
      return cv;
    };
    const tile = (kind: Tab, id: string, name: string, art: Node | string) => {
      const b = h('button', { class: `lv-tile lv-tile--${kind}`, type: 'button', 'data-id': id, 'aria-label': name, 'aria-pressed': 'false' });
      const a = h('span', { class: 'lv-tile__art' });
      if (typeof art === 'string') a.innerHTML = art; else a.append(art);
      b.append(a, h('span', { class: 'lv-tile__name' }, name), h('span', { class: 'lv-tile__badge', 'aria-hidden': 'true' }));
      b.addEventListener('click', () => pick(kind, id, b));
      return b;
    };
    const drawGrid = () => {
      swatches.length = 0;
      const list = tab === 'color' ? colorsOf(part).map((c) => tile('color', c.id, c.name, swatch('color', c.id)))
        : tab === 'pattern' ? patternsOf(part).map((p) => tile('pattern', p.id, p.name, swatch('pattern', p.id)))
          : stickersOf(part).map((s) => tile('sticker', s.id, s.name, stickerSvg(s.id)));
      grid.replaceChildren(...list);
      grid.dataset.tab = tab;
      grid.setAttribute('aria-label', TAB_NAME[tab]);
      drawSwatches(); syncState();
    };
    const drawTabs = () => {
      const avail: Tab[] = ['color', 'pattern', ...(maxStickersOf(part) && stickersOf(part).length ? ['sticker' as const] : [])];
      if (!avail.includes(tab)) tab = 'color';
      tabs.replaceChildren(...avail.map((t) => {
        const b = h('button', { class: 'lv-tab' + (t === tab ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': String(t === tab), 'data-tab': t });
        b.innerHTML = `${TAB_ICON[t]}<span>${TAB_NAME[t]}</span>`;
        b.addEventListener('click', () => { if (tab === t) return; tab = t; sfx('tab'); drawTabs(); drawGrid(); grid.scrollTop = 0; });
        return b;
      }));
      if (target.parts.length > 1) parts.replaceChildren(...target.parts.map((p) => {
        const b = h('button', { class: 'lv-part' + (p.id === part.id ? ' is-on' : ''), type: 'button', role: 'tab', 'aria-selected': String(p.id === part.id), 'data-part': p.id }, p.label);
        b.addEventListener('click', () => { if (part.id === p.id) return; part = p; sfx('tab'); drawTabs(); drawGrid(); bump(); });
        return b;
      }));
    };
    const syncState = () => {
      const look = looks[part.id];
      for (const b of Array.from(grid.children) as HTMLElement[]) {
        const id = b.dataset.id!;
        const on = tab === 'color' ? look.color === id : tab === 'pattern' ? look.pattern === id : look.stickers.includes(id);
        b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on));
        const badge = b.querySelector('.lv-tile__badge')!;
        badge.textContent = tab === 'sticker' && on ? String(look.stickers.indexOf(id) + 1) : '';
      }
      const max = maxStickersOf(part);
      count.hidden = tab !== 'sticker';
      count.textContent = `已贴 ${look.stickers.length}/${max}`;
      count.classList.toggle('is-full', look.stickers.length >= max);
      reset.classList.toggle('is-off', sameLooks(looks, defaults));
      el.classList.toggle('is-dirty', !sameLooks(looks, saved));
    };

    // ---------------------------------------------------------------- edits
    const bump = () => {
      changedAt = now();
      if (!reduced) { stage.classList.remove('is-pop'); void stage.offsetWidth; stage.classList.add('is-pop'); }
      frame();
    };
    const commit = () => { drawSwatches(); syncState(); bump(); };
    const pick = (kind: Tab, id: string, b: HTMLElement) => {
      const look = looks[part.id];
      if (kind === 'color') { if (look.color === id) return; look.color = id; sfx('select'); }
      else if (kind === 'pattern') { if (look.pattern === id) return; look.pattern = id; sfx('select'); }
      else {
        const next = toggleSticker(part, look, id);
        if (!next) {
          sfx('full');
          for (const x of [count, b]) { x.classList.remove('is-shake'); void x.offsetWidth; x.classList.add('is-shake'); }
          xgToast(`最多贴 ${maxStickersOf(part)} 张，先点一张撕下来`, { tone: 'try', sfx: null });
          return;
        }
        sfx(next.length > look.stickers.length ? 'sticker-on' : 'sticker-off');
        look.stickers = next;
      }
      commit();
    };
    dice.addEventListener('click', () => {
      looks[part.id] = randomLook(part, Math.random, looks[part.id]);
      sfx('random');
      if (!reduced) { dice.classList.remove('is-roll'); void dice.offsetWidth; dice.classList.add('is-roll'); }
      commit();
    });
    reset.addEventListener('click', () => {
      if (sameLook(looks[part.id], defaults[part.id]) && sameLooks(looks, defaults)) return;
      for (const p of target.parts) looks[p.id] = cloneLook(defaults[p.id]);
      sfx('reset'); commit();
    });

    // ---------------------------------------------------------------- preview loop
    let raf = 0, alive = true;
    const info = (): PreviewInfo => ({ part: part.id, changedAt, reduced });
    const fit = () => {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect(), k = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(r.width * k)), H = Math.max(1, Math.round(r.height * k));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    };
    const frame = () => {
      if (!alive) return;
      if (mounted) { mounted.update(looks, info()); return; }
      if (!ctx || !canvas) return;
      fit();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      try { (o.preview as CanvasPreview).draw(ctx, canvas.width, canvas.height, reduced ? 1.2 : now(), looks, info()); }
      catch (err) { console.error('[livery] preview failed', err); }
    };
    const loop = () => { raf = requestAnimationFrame(loop); frame(); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => frame()) : null;
    if (canvas) ro?.observe(canvas);
    if (reduced || mounted) frame(); else loop();

    // ---------------------------------------------------------------- leave
    const finish = (didSave: boolean) => {
      alive = false; cancelAnimationFrame(raf); ro?.disconnect();
      document.removeEventListener('keydown', onKey);
      mounted?.destroy(); unbind(); el.remove();
      document.documentElement.classList.remove('lv-studio-open');
      resolve({ saved: didSave, looks: didSave ? sanitizeLooks(target, looks) : saved });
    };
    const doSave = () => { store.save(looks); sfx('save'); finish(true); };
    const askLeave = async () => {
      if (sameLooks(looks, saved)) { sfx('close'); finish(false); return; }
      const choice = await showModal({ title: '要保存这身新涂装吗？', actions: [{ id: 'save', label: '保存', primary: true }, { id: 'drop', label: '不要了' }], dismissId: 'stay' });
      if (choice === 'save') doSave(); else if (choice === 'drop') { sfx('close'); finish(false); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.kit-modal')) void askLeave(); };
    document.addEventListener('keydown', onKey);
    close.addEventListener('click', () => void askLeave());
    save.addEventListener('click', doSave);

    drawTabs(); drawGrid();
    requestAnimationFrame(() => frame());
  });
}

/** short text for a look, e.g. for a parent summary or an aria label: 「金星黄 · 条纹 · 火箭、月亮」 */
export function describeLook(look: { color: string; pattern: string; stickers: string[] }): string {
  const bits = [colorById(look.color)?.name ?? '', patternById(look.pattern)?.name ?? ''];
  const st = look.stickers.map((s) => stickerById(s)?.name).filter(Boolean).join('、');
  if (st) bits.push(st);
  return bits.filter(Boolean).join(' · ');
}
