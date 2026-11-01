// play/facetoface.ts — 面对面（两人围着一块 iPad）：同意 / 先不用、发起方可撤回、认输二次确认、轮次灯。
// 契约：棋盘本体永不翻转；对方侧的卡片朝向对方（rotate 180°）；等待期间棋盘全锁；撤回 / 拒绝 / 同意都释放锁；永不因超时锁棋盘（没有超时）。
import type { Consent, FaceToFace, LockReason, Side } from '../core/types';

export interface F2fStrings { agree: string; decline: string; retract: string; resignYes: string; resignNo: string; waiting(name: string): string; ask(kind: 'undo' | 'draw', name: string): string; resign(name: string): string }
export const F2F_ZH: F2fStrings = {
  agree: '同意', decline: '先不用', retract: '撤回请求', resignYes: '认输', resignNo: '继续下',
  waiting: (n) => `等${n}回答…`, ask: (k, n) => (k === 'undo' ? `${n}想悔一步棋，可以吗？` : `${n}想和棋，可以吗？`), resign: (n) => `${n}真的要认输吗？`,
};
export interface FaceToFaceOptions {
  /** 覆盖层的容器（通常是棋盘外层容器，position: relative / absolute） */
  host: HTMLElement;
  /** 轮次灯画在这个元素里（通常 view.el） */
  board: HTMLElement;
  lock(reason: LockReason): () => void;
  sideName(s: Side): string;
  strings?: Partial<F2fStrings>;
}
export interface FaceToFaceImpl extends FaceToFace { readonly open: boolean; readonly lamp: Side | null; destroy(): void }

const CSS = `
.bk-f2f{position:absolute;inset:0;z-index:40;pointer-events:none;font-family:var(--xg-font-ui,system-ui,sans-serif)}
.bk-f2f-card{position:absolute;left:50%;width:min(86%,420px);box-sizing:border-box;padding:14px 16px;border-radius:22px;background:var(--bk-promo-bg,rgba(24,34,72,.97));color:#fff3d6;box-shadow:0 14px 40px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,255,255,.18);pointer-events:auto;text-align:center;touch-action:manipulation}
.bk-f2f-card[data-seat="0"]{bottom:10px;transform:translateX(-50%)}.bk-f2f-card[data-seat="1"]{top:10px;transform:translateX(-50%) rotate(180deg)}
.bk-f2f-card.is-wait{width:min(64%,300px);padding:8px 12px;font-size:15px}.bk-f2f-card[data-seat="0"].is-wait{bottom:84px}.bk-f2f-card[data-seat="1"].is-wait{top:84px}
.bk-f2f-msg{font:600 20px/1.3 var(--xg-font-read,serif);margin:2px 0 12px}.is-wait .bk-f2f-msg{font-size:15px;margin:0 0 6px}
.bk-f2f-row{display:flex;gap:10px;justify-content:center}.bk-f2f-btn{flex:1;min-height:64px;border:0;border-radius:16px;font:700 20px/1 var(--xg-font-ui,sans-serif);color:#0c1230;background:#fdd877;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.bk-f2f-btn.is-sub{background:rgba(255,255,255,.14);color:#f4ecd6;box-shadow:inset 0 0 0 1px rgba(183,193,236,.3)}.is-wait .bk-f2f-btn{min-height:44px;font-size:15px}
.bk-f2f-btn:active{transform:scale(.97)}
.bk-lamp{position:absolute;left:8%;right:8%;height:5px;border-radius:5px;background:linear-gradient(90deg,transparent,#fdd877,transparent);opacity:0;transition:opacity .18s;pointer-events:none;box-shadow:0 0 14px 2px rgba(253,216,119,.7)}
.bk-lamp[data-seat="0"]{bottom:3px}.bk-lamp[data-seat="1"]{top:3px}.bk-lamp.is-on{opacity:.95}
`;
const ensure = (doc: Document): void => { if (doc.getElementById('bk-f2f-styles')) return; const s = doc.createElement('style'); s.id = 'bk-f2f-styles'; s.textContent = CSS; doc.head.appendChild(s); };
const otherSide = (s: Side): Side => (s === 0 ? 1 : 0);

export function createFaceToFace(o: FaceToFaceOptions): FaceToFaceImpl {
  const doc = o.host.ownerDocument; ensure(doc); const S: F2fStrings = { ...F2F_ZH, ...o.strings };
  const root = doc.createElement('div'); root.className = 'bk-f2f'; o.host.appendChild(root);
  const lamps = [0, 1].map((s) => { const l = doc.createElement('div'); l.className = 'bk-lamp'; l.dataset.seat = String(s); o.board.appendChild(l); return l; });
  let lampSide: Side | null = null; let openCount = 0; const cleanups = new Set<() => void>();
  const card = (seat: Side, wait = false): { el: HTMLElement; msg: HTMLElement; row: HTMLElement } => { const el = doc.createElement('div'); el.className = `bk-f2f-card${wait ? ' is-wait' : ''}`; el.dataset.seat = String(seat); el.setAttribute('role', 'alertdialog'); const msg = doc.createElement('div'); msg.className = 'bk-f2f-msg'; const row = doc.createElement('div'); row.className = 'bk-f2f-row'; el.append(msg, row); root.appendChild(el); return { el, msg, row }; };
  const btn = (label: string, fn: () => void, sub = false): HTMLButtonElement => { const b = doc.createElement('button'); b.type = 'button'; b.className = `bk-f2f-btn${sub ? ' is-sub' : ''}`; b.textContent = label; b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };

  const api: FaceToFaceImpl = {
    get open() { return openCount > 0; }, get lamp() { return lampSide; },
    consent(kind, from) {
      const release = o.lock('consent'); openCount++; const target = otherSide(from); let settled = false; let resolve!: (v: boolean) => void; const result = new Promise<boolean>((r) => (resolve = r));
      const ask = card(target); ask.msg.textContent = S.ask(kind, o.sideName(from)); const wait = card(from, true); wait.msg.textContent = S.waiting(o.sideName(target));
      const settle = (v: boolean): void => { if (settled) return; settled = true; ask.el.remove(); wait.el.remove(); release(); openCount--; cleanups.delete(cancelNow); resolve(v); };
      const cancelNow = (): void => settle(false);
      ask.row.append(btn(S.agree, () => settle(true)), btn(S.decline, () => settle(false), true)); wait.row.append(btn(S.retract, () => settle(false), true)); cleanups.add(cancelNow);
      return { result, cancel: cancelNow } satisfies Consent;
    },
    resign(from) {
      const release = o.lock('modal'); openCount++; return new Promise<boolean>((resolve) => {
        const c = card(from); c.msg.textContent = S.resign(o.sideName(from)); let done = false;
        const settle = (v: boolean): void => { if (done) return; done = true; c.el.remove(); release(); openCount--; cleanups.delete(() => settle(false)); resolve(v); };
        c.row.append(btn(S.resignYes, () => settle(true), true), btn(S.resignNo, () => settle(false))); cleanups.add(() => settle(false));
      });
    },
    turnLamp(side) { lampSide = side; lamps.forEach((l, i) => l.classList.toggle('is-on', i === side)); },
    destroy() { for (const c of [...cleanups]) c(); root.remove(); for (const l of lamps) l.remove(); },
  };
  return api;
}
