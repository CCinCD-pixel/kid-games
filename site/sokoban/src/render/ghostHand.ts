/**
 * The tutorial ghost hand (spec §2.3: "幽灵手"), drawn exactly like the design system's `ghostTap`
 * (same `.xg-ghost-hand` / `.xg-ghost-ripple` styles, same hand shape) but at a page point and
 * cancellable: the moment the child acts, the demonstration fades out instead of tapping on after
 * him. Kit request: an AbortSignal option on `ghostTap` (then this file can go).
 */

const HAND_SVG = '<svg viewBox="0 0 84 84" aria-hidden="true"><path d="M30 8c4 0 7 3 7 7v22l2-1c3-1 6 0 7 3l1 2 2-1c3-1 6 1 7 4l.5 1.5 1.5-.5c3-.8 6 1 6.8 4l2.2 9c2 9-2 18-10 22l-4 2c-6 3-14 2-19-3L19 63c-3-3-3-7 0-10 3-2.5 7-2.3 9.5.4l-5.5-5.4V15c0-4 3-7 7-7Z" fill="#fffaf0" stroke="#261c30" stroke-width="3.2" stroke-linejoin="round"/><path d="M37 37v10M47 41v8M56 46v6" stroke="#261c30" stroke-width="2.6" stroke-linecap="round" opacity=".5"/><circle cx="30" cy="14" r="2.2" fill="#ffd2c2"/></svg>';

let hand: HTMLDivElement | null = null;
let run = 0;

function ensureHand(): HTMLDivElement {
  if (!hand || !hand.isConnected) {
    hand = document.createElement('div');
    hand.className = 'xg-ghost-hand sok-ghost-hand';
    hand.innerHTML = HAND_SVG;
    document.body.appendChild(hand);
  }
  return hand;
}

function moveTo(h: HTMLElement, x: number, y: number, ms: number): void {
  h.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,0,.25,1), opacity .2s` : 'none';
  h.style.transform = `translate3d(${x - 25}px, ${y - 8}px, 0)`;
}

/**
 * Glide in, press at (x, y) page px with a ripple, lift, fade. Resolves `true` when it played to the
 * end, `false` when `signal` aborted it (the hand fades at once, no ripple after the abort).
 */
export async function ghostTapAt(x: number, y: number, signal?: AbortSignal, o: { fast?: boolean } = {}): Promise<boolean> {
  if (signal?.aborted) return false;
  const k = o.fast ? 0.5 : 1;
  const my = ++run;
  const h = ensureHand();
  const alive = () => my === run && !signal?.aborted;
  const stop = () => {
    if (my === run) h.classList.remove('is-on', 'is-down');
  };
  signal?.addEventListener('abort', stop, { once: true });
  const wait = (ms: number) => new Promise<boolean>((r) => setTimeout(() => r(alive()), ms));
  try {
    moveTo(h, x + 60, y + 90, 0);
    void h.offsetWidth;
    h.classList.add('is-on');
    moveTo(h, x, y, 700 * k);
    if (!(await wait(760 * k))) return false;
    h.classList.add('is-down');
    const r = document.createElement('div');
    r.className = 'xg-ghost-ripple';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 800);
    if (!(await wait(260 * k))) return false;
    h.classList.remove('is-down');
    if (!(await wait(500 * k))) return false;
    h.classList.remove('is-on');
    return true;
  } finally {
    signal?.removeEventListener('abort', stop);
  }
}

/** Remove the hand (screen teardown). */
export function hideGhostHand(): void {
  run += 1;
  hand?.classList.remove('is-on', 'is-down');
}
