// A 17-node 领航员 badge for the round screens. The kit companion's LED face alone is ~240 DOM nodes, which would eat most of the 400-node budget on a
// screen that also holds a town, a tray and a subtitle bar (spec §10.1). Same look (white shell, dark visor, teal LED eyes, orange ear pods), moods in CSS.
export type MiniMood = 'idle' | 'happy' | 'thinking' | 'surprised' | 'encouraging' | 'celebrating' | 'sleepy';
export interface MiniBot { el: HTMLElement; setMood(m: MiniMood | string): void; react(kind: string): void; destroy(): void }
const SVG = `<svg viewBox="0 0 64 60" aria-hidden="true"><defs><linearGradient id="mmShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd8f2"/></linearGradient></defs>
<path class="ant" d="M32 12V4" stroke="#8fa6e8" stroke-width="2.4" stroke-linecap="round"/><circle class="tip" cx="32" cy="3.4" r="3" fill="#ffd863"/>
<circle cx="8.5" cy="30" r="5.4" fill="#ff7a4d"/><circle cx="55.5" cy="30" r="5.4" fill="#ff7a4d"/>
<path class="body" d="M14 58Q14 49 24 47H40Q50 49 50 58Z" fill="url(#mmShell)" stroke="#9fb2dd" stroke-width="1.6"/><rect x="26" y="44" width="12" height="5" rx="2" fill="#e0533d"/>
<rect class="head" x="9" y="11" width="46" height="36" rx="16" fill="url(#mmShell)" stroke="#9fb2dd" stroke-width="2"/><rect x="14" y="17" width="36" height="24" rx="11" fill="#141b49"/>
<g class="eyes" fill="#5eead4"><ellipse class="eye" cx="24" cy="27" rx="3.6" ry="4.6"/><ellipse class="eye" cx="40" cy="27" rx="3.6" ry="4.6"/></g>
<path class="m m-smile" d="M26 34Q32 39.5 38 34" fill="none" stroke="#5eead4" stroke-width="2.4" stroke-linecap="round"/><ellipse class="m m-o" cx="32" cy="36" rx="2.6" ry="3" fill="#5eead4"/><path class="m m-flat" d="M28 36H36" stroke="#5eead4" stroke-width="2.4" stroke-linecap="round"/></svg>`;
export function mountMini(host: HTMLElement, size: number): MiniBot {
  const el = document.createElement('div'); el.className = 'mm-mini'; el.style.width = `${size}px`; el.innerHTML = SVG; el.dataset.mood = 'idle'; host.append(el);
  return {
    el,
    setMood(m) { el.dataset.mood = m; },
    react(kind) { el.classList.remove('is-hop'); void el.offsetWidth; el.classList.add(kind === 'hop' ? 'is-hop' : 'is-hop'); },
    destroy() { el.remove(); },
  };
}
