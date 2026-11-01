// site/xiangqi/src/art/fx.ts — 棋盘上的"发生了什么"：金火花、落子涟漪、起步蓄势、吃子震一下、将军红晕、将死金光；以及三个"理由图标"（腿 / 眼 / 架）和「见面」金线。
// 只动 transform / opacity（A13 60 fps）；粒子 ≤24；prefers-reduced-motion 下全部跳过。无外部素材。
import type { Disposable, Sq } from '@engines/board/core/types';
import type { BoardViewImpl } from '@engines/board/view/board-view';
import type { Position } from '../rules/position';
import { K, SQ, colOf, rowOf } from '../rules/position';

const reduced = (): boolean => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const MAX_PARTICLES = 24;

export interface Fx {
  /** 金火花：从格中心向外飞散 */ sparks(sq: Sq, o?: { n?: number; color?: string; spread?: number }): void;
  /** 落子涟漪（落地一圈淡金环）+ 一点灰尘 */ ripple(sq: Sq, color?: string): void;
  /** 起步蓄势：起点一圈收缩的光 */ windup(sq: Sq): void;
  /** 整个棋盘轻震（吃子） */ shake(px?: number): void;
  /** 将军：被将的帅 / 将下一圈朱砂光晕扩散 */ checkPulse(sq: Sq): void;
  /** 将死 / 困毙：金光从格中心炸开 + 全盘微亮 */ burst(sq: Sq, kind: 'mate' | 'stale'): void;
  /** 理由图标（腿 / 眼 / 架 / 见面线）；返回清除函数，默认 2.4 s 后自动消失 */ reason(pos: Position, from: Sq, to: Sq, why: string, ms?: number): Disposable;
  clear(): void; destroy(): void;
}

type Pt = { x: number; y: number };
export function createFx(view: BoardViewImpl<number, Position>): Fx {
  const host = view.el as HTMLElement; const layer = document.createElement('div'); layer.className = 'xq-fx'; layer.setAttribute('aria-hidden', 'true'); host.appendChild(layer);
  let alive = 0; const disposers = new Set<() => void>();
  const centre = (sq: Sq): Pt => { const r = view.rect(sq), b = host.getBoundingClientRect(); return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top }; };
  const unit = (): number => view.cellPx || 60;
  const node = (cls: string, p: Pt, size: number, css = ''): HTMLElement => { const e = document.createElement('i'); e.className = cls; e.style.cssText = `left:${p.x - size / 2}px;top:${p.y - size / 2}px;width:${size}px;height:${size}px;${css}`; layer.appendChild(e); return e; };
  const anim = (e: HTMLElement, kf: Keyframe[], o: KeyframeAnimationOptions, done?: () => void): void => { const a = e.animate(kf, { fill: 'forwards', ...o }); const fin = (): void => { e.remove(); done?.(); }; a.onfinish = fin; a.oncancel = fin; };

  const fx: Fx = {
    sparks(sq, o = {}) {
      if (reduced() || host.clientWidth === 0) return; const c = centre(sq), u = unit(); const n = Math.min(o.n ?? 8, MAX_PARTICLES - alive); if (n <= 0) return;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5, dist = u * (o.spread ?? 0.95) * (0.65 + Math.random() * 0.6), s = u * (0.1 + Math.random() * 0.07);
        const e = node('xq-spark', c, s, `background:${o.color ?? '#fdd877'}`); alive++;
        anim(e, [{ transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist - u * 0.15}px) scale(.2) rotate(${120 + Math.random() * 160}deg)`, opacity: 0 }], { duration: 420 + Math.random() * 160, easing: 'cubic-bezier(.2,.7,.3,1)' }, () => { alive--; });
      }
    },
    ripple(sq, color = 'rgba(253,216,119,.75)') {
      if (reduced() || host.clientWidth === 0 || alive >= MAX_PARTICLES) return; const c = centre(sq), u = unit(); const e = node('xq-ring', c, u * 0.9, `border-color:${color}`); alive++;
      anim(e, [{ transform: 'scale(.55)', opacity: 0.9 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 380, easing: 'ease-out' }, () => { alive--; });
    },
    windup(sq) {
      if (reduced() || host.clientWidth === 0 || alive >= MAX_PARTICLES) return; const c = centre(sq), u = unit(); const e = node('xq-ring is-wind', c, u * 1.1); alive++;
      anim(e, [{ transform: 'scale(1.35)', opacity: 0 }, { transform: 'scale(.8)', opacity: 0.85, offset: 0.7 }, { transform: 'scale(.7)', opacity: 0 }], { duration: 200, easing: 'ease-in' }, () => { alive--; });
    },
    shake(px = 3) {
      if (reduced()) return; try { host.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-px}px,${px * 0.5}px)` }, { transform: `translate(${px}px,${-px * 0.4}px)` }, { transform: `translate(${-px * 0.5}px,0)` }, { transform: 'translate(0,0)' }], { duration: 190, easing: 'ease-out' }); } catch { /* 不支持 WAAPI：忽略 */ }
    },
    checkPulse(sq) {
      if (reduced() || host.clientWidth === 0) return; const c = centre(sq), u = unit();
      for (let k = 0; k < 2; k++) { const e = node('xq-ring is-check', c, u * 1.1); anim(e, [{ transform: 'scale(.6)', opacity: 0.95 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: 760, delay: k * 260, easing: 'ease-out' }); }
    },
    burst(sq, kind) {
      if (reduced() || host.clientWidth === 0) return; const c = centre(sq), u = unit(); const col = kind === 'mate' ? '#fdd877' : '#b7c1ec';
      const glow = node('xq-glow', c, u * 5, `background:radial-gradient(circle, ${kind === 'mate' ? 'rgba(253,216,119,.55)' : 'rgba(183,193,236,.4)'}, transparent 62%)`); anim(glow, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.35 }, { transform: 'scale(1.25)', opacity: 0 }], { duration: 900, easing: 'ease-out' });
      fx.sparks(sq, { n: 14, color: col, spread: 2.2 });
    },
    reason(pos, from, to, why, ms = 2400) {
      const made: HTMLElement[] = []; const marks: Disposable[] = []; const spots = reasonSpots(pos, from, to, why);
      const u = unit(); const add = (kind: 'leg' | 'eye' | 'mount', sq: Sq): void => { const c = centre(sq); const s = Math.max(36, u * 0.8); const e = node(`xq-badge is-${kind}`, { x: c.x + u * 0.3, y: c.y - u * 0.34 }, s); e.innerHTML = BADGE[kind]; e.style.opacity = '0'; made.push(e); anim(e, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.18)', opacity: 1, offset: 0.35 }, { transform: 'scale(1)', opacity: 1, offset: 0.5 }, { transform: 'scale(1)', opacity: 1, offset: 0.88 }, { transform: 'scale(.9)', opacity: 0 }], { duration: ms, easing: 'ease-out' }); };
      for (const s of spots.icons) { add(s.kind, s.sq); if (s.kind !== 'mount' || why === 'two') marks.push(view.mark('danger', [s.sq], { pulse: true })); } if (spots.block !== null) marks.push(view.mark('danger', [spots.block], { pulse: true })); if (spots.sight) marks.push(view.mark('sight', [spots.sight[0], spots.sight[1]], { pulse: true }));
      const t = setTimeout(() => dispose(), ms); const dispose = (): void => { clearTimeout(t); for (const m of marks) m.dispose(); for (const e of made) e.remove(); disposers.delete(dispose); }; disposers.add(dispose);
      return { dispose };
    },
    clear() { for (const d of [...disposers]) d(); layer.replaceChildren(); alive = 0; },
    destroy() { fx.clear(); layer.remove(); },
  };
  return fx;
}

// ───────── 理由图标（腿 / 眼 / 架）─────────
const INK = '#0c1230';
const disc = (inner: string): string => `<svg viewBox="0 0 40 40"><circle cx="20" cy="21.5" r="18" fill="#000" opacity=".28"/><circle cx="20" cy="20" r="18" fill="#fdd877" stroke="#a86a00" stroke-width="2"/><circle cx="20" cy="20" r="14.4" fill="none" stroke="#a86a00" stroke-width=".9" opacity=".5"/>${inner}</svg>`;
export const BADGE: Record<'leg' | 'eye' | 'mount', string> = {
  /** 脚印：两只小脚印（马被"绊腿"） */
  leg: disc(`<g fill="${INK}"><ellipse cx="14.5" cy="23.5" rx="4" ry="5.4" transform="rotate(-10 14.5 23.5)"/><circle cx="11.6" cy="15.4" r="1.5"/><circle cx="14.6" cy="14.4" r="1.6"/><circle cx="17.7" cy="14.8" r="1.5"/><ellipse cx="26" cy="19" rx="3.6" ry="5" transform="rotate(10 26 19)"/><circle cx="23.4" cy="11.5" r="1.4"/><circle cx="26.2" cy="10.6" r="1.5"/><circle cx="28.9" cy="11.2" r="1.4"/></g>`),
  /** 眼睛（象眼被塞） */
  eye: disc(`<path d="M6.5 20 Q20 8.5 33.5 20 Q20 31.5 6.5 20Z" fill="#fff3d6" stroke="${INK}" stroke-width="2"/><circle cx="20" cy="20" r="5.6" fill="${INK}"/><circle cx="21.9" cy="18.1" r="1.9" fill="#fff"/>`),
  /** 山（炮架） */
  mount: disc(`<path d="M5.5 28 L15 13 L20.5 21 L25 15.5 L34.5 28Z" fill="${INK}"/><path d="M12.6 16.6 L15 13 L17.4 16.4 L15.2 15.6Z M23.6 17.4 L25 15.5 L26.4 17.5 L25 17Z" fill="#fff3d6"/>`),
};

export interface ReasonSpots { icons: { kind: 'leg' | 'eye' | 'mount'; sq: Sq }[]; block: Sq | null; sight: [Sq, Sq] | null }
/** 从"走不了"的原因推出要标的格：马腿 = 别住它的子；象眼 = 田字中心；炮架 = 路上第一个子（或目标前一格）；见面 = 两个将帅连一条金线 */
export function reasonSpots(pos: Position, from: Sq, to: Sq, why: string): ReasonSpots {
  const out: ReasonSpots = { icons: [], block: null, sight: null }; const fr = rowOf(from), fc = colOf(from), tr = rowOf(to), tc = colOf(to), dr = tr - fr, dc = tc - fc; const sg = Math.sign;
  const first = (): Sq | null => { if (fr !== tr && fc !== tc) return null; const sr = sg(dr), sc = sg(dc); let r = fr + sr, c = fc + sc; while (r !== tr || c !== tc) { if (pos.b[SQ(r, c)]) return SQ(r, c); r += sr; c += sc; } return null; };
  switch (why) {
    case 'horse': { const leg = Math.abs(dc) === 2 ? SQ(fr, fc + sg(dc)) : SQ(fr + sg(dr), fc); out.icons.push({ kind: 'leg', sq: leg }); break; }
    case 'eye': out.icons.push({ kind: 'eye', sq: SQ(fr + dr / 2, fc + dc / 2) }); break;
    case 'screen': out.icons.push({ kind: 'mount', sq: to }); break;
    case 'two': { const b = first(); if (b !== null) out.icons.push({ kind: 'mount', sq: b }); break; }
    case 'block': out.block = first(); break;
    case 'face': { const pc = pos.b[from]; const mine = pc >> 3; const a = (pc & 7) === K ? to : pos.ksq[mine], b = pos.ksq[1 - mine]; if (a >= 0 && b >= 0) out.sight = [a, b]; break; }
  }
  return out;
}
