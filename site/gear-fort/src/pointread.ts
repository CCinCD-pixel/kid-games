// 点读 (spec §2.6, rev d / D24 — "点任何汉字读出整词"): every label, subtitle and caption on screen can be tapped. A
// character inside one of the 45 point-read words (fort.w.*: 25 card/machine/Boss names + 墨子 鲁班 + 18 interface words)
// reads that word; any other character re-reads the sentence it belongs to (the nearest [data-line]). Buttons and cards
// keep their own tap action; on them a long press (≥ 450 ms) reads their [data-word] (the 选牒 cards, spec §2.3).
import type { AppCtx } from './ctx';

export const WORDS = ['连弩车', '禾田', '木垒', '籍车', '铁蒺藜', '陷坑', '火油罐', '礌石', '阳燧', '粮仓', '转射机', '风箱', '钩拒',
  '木甲兵', '盾甲兵', '冲车', '蚁傅', '铜甲力士', '木鹊', '烟车', '云梯车', '鼓车', '铜犀冲车', '夜枭木鸢', '墨子', '鲁班', '檑木', '机关令',
  '机关匣', '橐', '铜盾甲兵', '牒', '推演', '沙盘', '战鼓', '大波', '锦囊', '图谱', '驿站', '复盘', '附加题', '粮斗', '鲁班线', '宋城', '守得稳'] as const;
const BY_LEN = [...WORDS].sort((a, b) => b.length - a.length);
export const wordId = (w: string): string => `fort.w.${w}`;

/** the point-read word that covers text[i] (longest match wins: 铜盾甲兵 before 盾甲兵, 鲁班线 before 鲁班) */
export function wordAt(text: string, i: number): string | null {
  for (const w of BY_LEN) {
    for (let k = text.indexOf(w, Math.max(0, i - w.length + 1)); k >= 0 && k <= i; k = text.indexOf(w, k + 1)) if (i < k + w.length) return w;
  }
  return null;
}
/** the word clip for a name, if it is a point-read word */
export const nameWord = (name: string): string | null => ((WORDS as readonly string[]).includes(name) ? wordId(name) : null);

const ACTIVE = 'button, a, input, select, textarea, canvas, [role="button"], [data-a], [data-noread]';
type Hit = { node: Text; i: number; rect: DOMRect };
function charAt(x: number, y: number): Hit | null {
  const d = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null; let off = 0;
  if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  else if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const t = node as Text; const r = document.createRange();
  for (const i of [off, off - 1]) { // the caret lands between two characters: take the one the finger is really on
    if (i < 0 || i >= t.length) continue; r.setStart(t, i); r.setEnd(t, i + 1); const b = r.getBoundingClientRect();
    if (b.width && x >= b.left - 4 && x <= b.right + 4 && y >= b.top - 6 && y <= b.bottom + 6) return { node: t, i, rect: b };
  }
  return null;
}
/** a short glow on the word being read (CSS Custom Highlight API where there is one, else the element pulses) */
function glow(node: Text, i0: number, i1: number): void {
  const H = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight; const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  if (H && reg) { const r = document.createRange(); r.setStart(node, i0); r.setEnd(node, i1); reg.set('gf-read', new H(r)); window.setTimeout(() => reg.delete('gf-read'), 1100); return; }
  const p = node.parentElement; if (!p) return; p.classList.remove('gf-reading'); void p.offsetWidth; p.classList.add('gf-reading'); window.setTimeout(() => p.classList.remove('gf-reading'), 1100);
}

let cardTok = 0;
/** an info card opened (spec §2.7-2): its name (fort.w.<名>), then the given lines — a newer card, a close or any
 *  interrupt ends the chain, so nothing trails onto the next screen */
export async function sayCard(app: AppCtx, name: string, then: string[]): Promise<void> {
  const my = ++cardTok; const w = nameWord(name); const seq = [...(w ? [w] : []), ...then];
  for (let i = 0; i < seq.length; i++) { if (my !== cardTok) return; const r = await app.voice.say(seq[i], { interrupt: i === 0 }); if (r === 'interrupted') return; }
}
export const endCard = (): void => { cardTok++; };

/** glow [i0, i1) of the concatenated text of `nodes` */
function glowSpan(nodes: Text[], i0: number, i1: number): void {
  let pos = 0; let a: [Text, number] | null = null; let b: [Text, number] | null = null;
  for (const n of nodes) { const e = pos + n.data.length; if (!a && i0 < e) a = [n, i0 - pos]; if (!b && i1 <= e) { b = [n, i1 - pos]; break; } pos = e; }
  if (!a || !b) return;
  if (a[0] === b[0]) { glow(a[0], a[1], b[1]); return; }
  const H = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight; const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  if (H && reg) { const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); reg.set('gf-read', new H(r)); window.setTimeout(() => reg.delete('gf-read'), 1100); }
}

/** tap-to-read count since the last level ended — folded into gf-level (spec §8.8: at most 2 session marks per level;
 *  a mark per tap would also rewrite the whole session log to localStorage on every tap) */
let reads = 0;
export function takeReads(): number { const n = reads; reads = 0; return n; }

export function installPointRead(root: HTMLElement, app: AppCtx): () => void {
  let pressT = 0; let swallow = false; let px = 0; let py = 0;
  const onClick = (ev: MouseEvent): void => {
    if (swallow) { swallow = false; ev.stopPropagation(); ev.preventDefault(); return; }
    const t = ev.target as HTMLElement | null; if (!t || !t.closest || t.closest(ACTIVE)) return;
    const hit = charAt(ev.clientX, ev.clientY); if (!hit || !root.contains(hit.node)) return;
    // the sentence = the nearest [data-line] (or the text's own block): typewriters split it into one span per character
    const lineEl = hit.node.parentElement?.closest<HTMLElement>('[data-line]') ?? null;
    const block = lineEl ?? (hit.node.data.length <= 2 && hit.node.parentElement?.parentElement ? hit.node.parentElement.parentElement : hit.node.parentElement);
    const nodes: Text[] = []; let gi = -1; let text = '';
    if (block) { const tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n as Text; if (t === hit.node) gi = text.length + hit.i; nodes.push(t); text += t.data; } }
    if (gi < 0) { nodes.splice(0, nodes.length, hit.node); text = hit.node.data; gi = hit.i; }
    const w = wordAt(text, gi);
    if (w) { const k = text.lastIndexOf(w, gi); glowSpan(nodes, k, k + w.length); app.ui('ui-tap', 0.3); void app.voice.say(wordId(w), { interrupt: true }); reads++; ev.stopPropagation(); return; }
    const host = lineEl; if (!host) return;
    let vars: Record<string, string | number> | undefined; try { vars = host.dataset.vars ? JSON.parse(host.dataset.vars) : undefined; } catch { vars = undefined; }
    glowSpan(nodes, 0, text.length); app.ui('ui-tap', 0.3); void app.voice.say(host.dataset.line!, { interrupt: true, vars }); reads++; ev.stopPropagation();
  };
  // long press on a button / card with [data-word]: read its name; the click that follows the release is swallowed
  const onDown = (ev: PointerEvent): void => {
    if (!ev.isPrimary) return; const t = (ev.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-word]'); if (!t || !root.contains(t)) return;
    clearTimeout(pressT); px = ev.clientX; py = ev.clientY; swallow = false;
    pressT = window.setTimeout(() => { const id = nameWord(t.dataset.word!); if (!id) return; swallow = true; t.classList.add('gf-reading'); window.setTimeout(() => t.classList.remove('gf-reading'), 1100); app.ui('ui-tap', 0.3); void app.voice.say(id, { interrupt: true }); reads++; }, 450);
  };
  const onMove = (ev: PointerEvent): void => { if (pressT && Math.hypot(ev.clientX - px, ev.clientY - py) > 12) { clearTimeout(pressT); pressT = 0; } };
  const onUp = (): void => { clearTimeout(pressT); pressT = 0; window.setTimeout(() => { swallow = false; }, 400); };
  root.addEventListener('click', onClick, true); root.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', onUp, true);
  return () => { root.removeEventListener('click', onClick, true); root.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true); };
}
