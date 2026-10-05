/* =============================================================================
   星港 Companion · 领航员 (temporary name — the kid picks the real one)
   -----------------------------------------------------------------------------
   Parametric SVG robot with an LED dot-matrix face. Framework-free.

     import { mount } from './companion';
     const bot = mount(document.querySelector('#bot')!, { size: 180 });
     bot.setMood('happy');
     await bot.say('我们一起把箱子推到星星上吧！', { mood: 'encouraging' });

   Design rules (plan §3.0 / §4.4):
   - Moods are idle | happy | thinking | surprised | encouraging | celebrating | sleepy.
     There is deliberately NO sad / crying / disappointed mood (lint rule: the
     companion never looks sad when the child stops, leaves, or gets it wrong).
   - Voice is delegated: pass `speak` to say() (narration engine, TTS, or a recorded
     clip) — the companion only animates its mouth while that promise is pending.
   - Pure SVG + CSS transforms. One small blur filter on the LED layer only.
   ============================================================================= */

export type Mood = 'idle' | 'happy' | 'thinking' | 'surprised' | 'encouraging' | 'celebrating' | 'sleepy';
export const MOODS: readonly Mood[] = ['idle', 'happy', 'thinking', 'surprised', 'encouraging', 'celebrating', 'sleepy'];
/** Short names used by the repo's kit/companion stub (and 'blink' = idle + an immediate blink). */
export type MoodAlias = 'think' | 'cheer' | 'encourage' | 'blink';
const ALIAS: Record<MoodAlias, Mood> = { think: 'thinking', cheer: 'celebrating', encourage: 'encouraging', blink: 'idle' };
export const normalizeMood = (m: Mood | MoodAlias | string): Mood | null =>
  (MOODS as readonly string[]).includes(m) ? (m as Mood) : (ALIAS as Record<string, Mood>)[m] ?? null;

export interface CompanionOptions {
  /** rendered width: px number or any CSS length ('8rem'); height follows the art's aspect */
  size?: number | string;
  /** 'full' robot or 'head' only (HUD avatar, hub header) */
  variant?: 'full' | 'head';
  /** accent (ear pods, collar, cuffs) — customisation hook for chapter unlocks */
  accent?: string;
  /** LED colour */
  led?: string;
  /** shell colour */
  shell?: string;
  /** antenna tip shape */
  antenna?: 'star' | 'orb';
  /** where the speech bubble appears relative to the robot */
  bubble?: 'right' | 'left' | 'top' | 'auto';
  /** cap the bubble width (px) when the layout has less room than the viewport suggests */
  bubbleMax?: number;
  /** initial mood */
  mood?: Mood | MoodAlias;
  /** sound hook — receives sfx names from the kit manifest (blip-happy, …) */
  sfx?: (name: string) => void;
  /** accessible name */
  name?: string;
}

export interface SayOptions {
  /** mood while speaking (reverts to previous mood afterwards unless `stay`) */
  mood?: Mood | MoodAlias;
  stay?: boolean;
  /** start the actual voice; resolve when audio finished. Swappable engine hook. */
  speak?: (text: string) => Promise<unknown> | void;
  /** ms to keep the bubble after the text is fully revealed / voice ended (default 1800; 0 = keep) */
  hold?: number;
  /** characters per second for the typewriter reveal (default 16 — slow enough to read along) */
  cps?: number;
  /** extra element appended in the bubble (e.g. a 「再听一遍」 button) */
  accessory?: HTMLElement;
}

export interface Companion {
  el: HTMLElement;
  svg: SVGSVGElement;
  readonly mood: Mood;
  setMood(m: Mood | MoodAlias, opts?: { silent?: boolean }): void;
  say(text: string, opts?: SayOptions): Promise<void>;
  hush(): void;
  /** brief reaction without changing the base mood (e.g. a hop on a correct answer) */
  react(kind: 'hop' | 'nod' | 'wiggle' | 'jolt'): void;
  lookAt(x: number, y: number): void;
  destroy(): void;
}

/* ------------------------------------------------------------------ LED faces
   15 × 9 grid. '#' = LED colour, '+' = warm gold LED, '*' = blush pink, '.' = off.
   Eyes live in rows 0–4, mouth in rows 5–8 (so talking only rewrites rows 5–8). */
const COLS = 15, ROWS = 9;
type Face = string[];
const F = (s: string): Face => s.trim().split(/\s+/);

const EYES = {
  open: F(`
    ...............
    ...##.....##...
    ..####...####..
    ..####...####..
    ...##.....##...`),
  blink: F(`
    ...............
    ...............
    ...............
    ..####...####..
    ...............`),
  arc: F(`
    ...............
    ...##.....##...
    ..#..#...#..#..
    ...............
    ...............`),
  up: F(`
    ....##.....##..
    ...####...####.
    ...####...####.
    ....##.....##..
    ...............`),
  upLeft: F(`
    ..##.....##....
    .####...####...
    .####...####...
    ..##.....##....
    ...............`),
  big: F(`
    ...##.....##...
    ..####...####..
    ..####...####..
    ..####...####..
    ...##.....##...`),
  wink: F(`
    ...##.....##...
    ..#..#...####..
    .........####..
    ..........##...
    ...............`),
  star: F(`
    ...+.......+...
    ..+++.....+++..
    .+++++...+++++.
    ..+++.....+++..
    ..+.+.....+.+..`),
  sleepy: F(`
    ...............
    ...............
    ..#..#...#..#..
    ...##.....##...
    ...............`),
};
const MOUTH = {
  smile: F(`
    ...............
    .....#...#.....
    ......###......
    ...............`),
  smileBlush: F(`
    .*...........*.
    .....#...#.....
    ......###......
    ...............`),
  grin: F(`
    .*...........*.
    ....#.....#....
    .....#####.....
    ...............`),
  flatSide: F(`
    ...............
    ...............
    ........###....
    ...............`),
  o: F(`
    ...............
    ......###......
    .....#...#.....
    ......###......`),
  dot: F(`
    ...............
    ...............
    .......#.......
    ...............`),
  open: F(`
    .*...........*.
    ....#######....
    .....#####.....
    ......###......`),
  talkA: F(`
    ...............
    ......###......
    .....#...#.....
    ......###......`),
  talkB: F(`
    ...............
    .....#####.....
    ......###......
    ...............`),
  talkC: F(`
    ...............
    .....#...#.....
    ......###......
    ...............`),
};
const face = (eyes: Face, mouth: Face): Face => [...eyes, ...mouth];

interface MoodSpec { eyes: Face; mouth: Face; blink: boolean; sfx?: string; dim?: boolean }
const MOOD_SPEC: Record<Mood, MoodSpec> = {
  idle:        { eyes: EYES.open,  mouth: MOUTH.smile,      blink: true },
  happy:       { eyes: EYES.arc,   mouth: MOUTH.grin,       blink: false, sfx: 'blip-happy' },
  thinking:    { eyes: EYES.up,    mouth: MOUTH.flatSide,   blink: true,  sfx: 'blip-think' },
  surprised:   { eyes: EYES.big,   mouth: MOUTH.o,          blink: true,  sfx: 'blip-surprised' },
  encouraging: { eyes: EYES.wink,  mouth: MOUTH.smileBlush, blink: false, sfx: 'blip-happy' },
  celebrating: { eyes: EYES.star,  mouth: MOUTH.open,       blink: false, sfx: 'blip-happy' },
  sleepy:      { eyes: EYES.sleepy, mouth: MOUTH.dot,       blink: false, sfx: 'blip-sleepy', dim: true },
};

/* ------------------------------------------------------------------ styles */
const CSS = `
.xg-bot{position:relative;display:inline-block;line-height:0;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;z-index:var(--xg-z-companion,60)}
.xg-bot svg{display:block;overflow:visible}
.xg-bot[data-variant=head] svg{overflow:hidden}
.xg-bot svg *{transform-box:view-box}
.xg-bot .b-float{animation:xgbot-bob 2.8s cubic-bezier(.45,0,.55,1) infinite}
.xg-bot .b-shadow{transform-origin:120px 247px;animation:xgbot-shadow 2.8s cubic-bezier(.45,0,.55,1) infinite}
.xg-bot .b-glow{transform-origin:120px 226px;animation:xgbot-glow 1.4s ease-in-out infinite}
.xg-bot .b-pose,.xg-bot .b-head,.xg-bot .b-hand-l,.xg-bot .b-hand-r,.xg-bot .b-body{transition:transform .5s var(--xg-ease-spring,cubic-bezier(.34,1.56,.64,1))}
.xg-bot .b-pose{transform-origin:120px 230px}
.xg-bot .b-head{transform-origin:120px 150px}
.xg-bot .b-hand-l{transform-origin:76px 182px}
.xg-bot .b-hand-r{transform-origin:164px 182px}
.xg-bot .b-hand-l>g{animation:xgbot-hand 2.8s cubic-bezier(.45,0,.55,1) -.35s infinite;transform-origin:76px 182px}
.xg-bot .b-hand-r>g{animation:xgbot-hand 2.8s cubic-bezier(.45,0,.55,1) -.7s infinite;transform-origin:164px 182px}
.xg-bot .b-tip{transform-origin:120px 17px;animation:xgbot-tip 2.4s ease-in-out infinite}
.xg-bot .b-tipglow{transform-origin:120px 17px;animation:xgbot-tipglow 2.4s ease-in-out infinite}
.xg-bot .b-ear-led{animation:xgbot-ear 3.2s ease-in-out infinite}
.xg-bot .b-dot{transition:fill .18s ease, opacity .18s ease}
.xg-bot .b-dot.off{fill:var(--bot-led);opacity:.07}
.xg-bot .b-dot.on{fill:var(--bot-led);opacity:1}
.xg-bot .b-dot.warm{fill:var(--xg-led-warm,#ffd863);opacity:1}
.xg-bot .b-dot.pink{fill:#ff9db5;opacity:.95}
.xg-bot .b-leds{transition:opacity .4s ease}
.xg-bot[data-dim] .b-leds{opacity:.55}
.xg-bot .b-z{opacity:0}
/* --- moods: poses ------------------------------------------------------- */
.xg-bot[data-mood=happy] .b-hand-l{transform:translate(-4px,-10px) rotate(-18deg)}
.xg-bot[data-mood=happy] .b-hand-r{transform:translate(4px,-10px) rotate(18deg)}
.xg-bot[data-mood=thinking] .b-head{transform:rotate(7deg)}
.xg-bot[data-mood=thinking] .b-hand-r{transform:translate(-22px,-34px) rotate(-30deg)}
.xg-bot[data-mood=thinking] .b-hand-l{transform:translate(4px,4px)}
.xg-bot[data-mood=surprised] .b-head{transform:translateY(-6px) rotate(-4deg)}
.xg-bot[data-mood=surprised] .b-hand-l{transform:translate(-12px,-14px) rotate(-30deg)}
.xg-bot[data-mood=surprised] .b-hand-r{transform:translate(12px,-14px) rotate(30deg)}
.xg-bot[data-mood=encouraging] .b-head{transform:rotate(-5deg)}
.xg-bot[data-mood=encouraging] .b-hand-r{transform:translate(14px,-46px) rotate(-12deg)}
.xg-bot[data-mood=encouraging] .b-hand-r>g{animation:xgbot-pump .9s cubic-bezier(.45,0,.55,1) infinite}
.xg-bot[data-mood=celebrating] .b-hand-l{transform:translate(-10px,-58px) rotate(-24deg)}
.xg-bot[data-mood=celebrating] .b-hand-r{transform:translate(10px,-58px) rotate(24deg)}
.xg-bot[data-mood=celebrating] .b-hand-l>g{animation:xgbot-wave-l .5s ease-in-out infinite alternate}
.xg-bot[data-mood=celebrating] .b-hand-r>g{animation:xgbot-wave-r .5s ease-in-out infinite alternate}
.xg-bot[data-mood=celebrating] .b-pose{animation:xgbot-wiggle .9s ease-in-out infinite}
.xg-bot[data-mood=sleepy] .b-head{transform:translateY(4px) rotate(-7deg)}
.xg-bot[data-mood=sleepy] .b-hand-l{transform:translate(4px,8px)}
.xg-bot[data-mood=sleepy] .b-hand-r{transform:translate(-4px,8px)}
.xg-bot[data-mood=sleepy] .b-float,.xg-bot[data-mood=sleepy] .b-shadow{animation-duration:4.6s}
.xg-bot[data-mood=sleepy] .b-z{animation:xgbot-z 3.2s ease-in infinite}
.xg-bot[data-mood=sleepy] .b-z:nth-of-type(2){animation-delay:1.05s}
.xg-bot[data-mood=sleepy] .b-z:nth-of-type(3){animation-delay:2.1s}
.xg-bot[data-mood=sleepy] .b-tip,.xg-bot[data-mood=sleepy] .b-tipglow{animation-duration:4.6s;opacity:.6}
.xg-bot.r-hop .b-pose{animation:xgbot-hop .62s cubic-bezier(.3,0,.5,1)}
.xg-bot.r-nod .b-head{animation:xgbot-nod .7s ease-in-out}
.xg-bot.r-wiggle .b-pose{animation:xgbot-wiggle .45s ease-in-out 2}
.xg-bot.r-jolt .b-pose{animation:xgbot-jolt .5s cubic-bezier(.2,.8,.3,1)}
@keyframes xgbot-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes xgbot-shadow{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.84);opacity:.7}}
@keyframes xgbot-glow{0%,100%{transform:scale(1,1);opacity:.85}50%{transform:scale(1.08,.9);opacity:1}}
@keyframes xgbot-hand{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-5px) rotate(-3deg)}}
@keyframes xgbot-tip{0%,100%{transform:scale(1) rotate(0)}50%{transform:scale(1.12) rotate(12deg)}}
@keyframes xgbot-tipglow{0%,100%{transform:scale(.8);opacity:.35}50%{transform:scale(1.25);opacity:.75}}
@keyframes xgbot-ear{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes xgbot-pump{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px) rotate(-6deg)}}
@keyframes xgbot-wave-l{from{transform:rotate(-10deg)}to{transform:rotate(14deg)}}
@keyframes xgbot-wave-r{from{transform:rotate(10deg)}to{transform:rotate(-14deg)}}
@keyframes xgbot-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-4deg)}75%{transform:rotate(4deg)}}
@keyframes xgbot-hop{0%{transform:translateY(0) scale(1,1)}18%{transform:translateY(2px) scale(1.06,.92)}45%{transform:translateY(-26px) scale(.96,1.05)}72%{transform:translateY(0) scale(1.05,.94)}100%{transform:translateY(0) scale(1,1)}}
@keyframes xgbot-nod{0%,100%{transform:rotate(0)}30%{transform:translateY(5px) rotate(2deg)}60%{transform:translateY(-2px)}}
@keyframes xgbot-jolt{0%{transform:translateY(0)}25%{transform:translateY(-16px) scale(1.03)}100%{transform:translateY(0)}}
@keyframes xgbot-z{0%{opacity:0;transform:translate(0,0) scale(.6)}15%{opacity:1}100%{opacity:0;transform:translate(22px,-46px) scale(1.25)}}
.xg-bot-conf{position:absolute;left:50%;top:30%;width:10px;height:14px;border-radius:2px;pointer-events:none;animation:xgbot-conf 1.3s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes xgbot-conf{0%{transform:translate(-50%,0) rotate(0) scale(.4);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),var(--dy)) rotate(var(--rot)) scale(1);opacity:0}}
/* --- speech bubble ------------------------------------------------------ */
.xg-bot-bubble{position:absolute;z-index:2;line-height:1.5;max-width:min(340px,70vw);width:max-content;padding:14px 20px 15px;border-radius:22px;
  background:var(--xg-paper-0,#fffdf8);color:var(--xg-ink-900,#261c30);font-family:var(--xg-font-read,serif);font-weight:500;font-size:var(--xg-fs-lead,23px);letter-spacing:.04em;
  box-shadow:0 2px 0 rgba(52,30,12,.10),0 12px 26px -8px rgba(52,30,12,.34),inset 0 1.5px 0 rgba(255,255,255,.8);
  transform-origin:var(--tail-x,0) 50%;opacity:0;transform:scale(.6);pointer-events:none;
  transition:opacity .2s ease, transform .45s var(--xg-ease-spring,cubic-bezier(.34,1.56,.64,1))}
.xg-bot-bubble.show{opacity:1;transform:scale(1);pointer-events:auto}
.xg-bot-bubble::before{content:"";position:absolute;width:22px;height:22px;background:inherit;border-radius:4px;transform:rotate(45deg);box-shadow:inherit;z-index:-1}
.xg-bot-bubble::after{content:"";position:absolute;inset:0;border-radius:inherit;background:inherit}
.xg-bot-bubble>*{position:relative;z-index:1}
.xg-bot-bubble[data-side=right]{left:calc(100% - 6px);top:16%;--tail-x:0}
.xg-bot-bubble[data-side=right]::before{left:-7px;top:26px}
.xg-bot-bubble[data-side=left]{right:calc(100% - 6px);top:16%;--tail-x:100%}
.xg-bot-bubble[data-side=left]::before{right:-7px;top:26px}
.xg-bot-bubble[data-side=top]{bottom:calc(100% - 4px);left:50%;translate:-50% 0;transform-origin:50% 100%}
.xg-bot-bubble[data-side=top]::before{left:calc(50% - 11px);bottom:-7px}
.xg-bot-bubble .ch{opacity:0;transition:opacity .12s linear}
.xg-bot-bubble .ch.v{opacity:1}
.xg-bot-bubble .acc{display:flex;justify-content:flex-end;margin-top:8px}
@media (prefers-reduced-motion: reduce){
  .xg-bot .b-float,.xg-bot .b-shadow,.xg-bot .b-hand-l>g,.xg-bot .b-hand-r>g,.xg-bot .b-tip,.xg-bot .b-tipglow{animation:none}
}
`;

let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === 'undefined') return;
  if (!document.getElementById('xg-companion-css')) {
    const s = document.createElement('style');
    s.id = 'xg-companion-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  cssInjected = true;
}

/* ------------------------------------------------------------------ SVG */
let uid = 0;
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function buildSvg(o: Required<Pick<CompanionOptions, 'accent' | 'led' | 'shell' | 'antenna' | 'variant'>>, id: string): string {
  const shell = o.shell, shellD = shade(shell, -0.09), shellDD = shade(shell, -0.2), shellL = shade(shell, 0.5);
  const acc = o.accent, accD = shade(acc, -0.25), accL = shade(acc, 0.25);
  const navy = '#121a3d';
  // LED grid geometry (inside the visor 70..170 × 58..134)
  const pitch = 5.9, r = 2.05;
  const gx0 = 120 - ((COLS - 1) * pitch) / 2, gy0 = 96 - ((ROWS - 1) * pitch) / 2 + 1;
  let dots = '';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    dots += `<circle class="b-dot off" data-i="${y * COLS + x}" cx="${(gx0 + x * pitch).toFixed(2)}" cy="${(gy0 + y * pitch).toFixed(2)}" r="${r}"/>`;
  }
  const tip = o.antenna === 'star'
    ? `<path class="b-tip" d="M120 6 Q122.2 14.8 131 17 Q122.2 19.2 120 28 Q117.8 19.2 109 17 Q117.8 14.8 120 6Z" fill="#f6b934" stroke="#df9a1c" stroke-width="1.2" stroke-linejoin="round"/>`
    : `<circle class="b-tip" cx="120" cy="17" r="7" fill="#f6b934" stroke="#df9a1c" stroke-width="1.2"/>`;
  const outline = shade(shell, -0.3);
  const hand = (cx: number, flip: number) => `
      <clipPath id="${id}-h${flip}"><ellipse cx="${cx}" cy="182" rx="14" ry="17"/></clipPath>
      <ellipse cx="${cx}" cy="182" rx="14" ry="17" fill="${shell}"/>
      <g clip-path="url(#${id}-h${flip})">
        <path d="M${cx + flip * 2} 166.5a14 17 0 0 1 0 31 a16 19 0 0 0 0 -31Z" fill="${shellD}" opacity=".9" transform="${flip < 0 ? `translate(${2 * cx} 0) scale(-1 1)` : ''}"/>
        <rect x="${cx - 15}" y="173" width="30" height="6" fill="${acc}"/>
        <rect x="${cx - 15}" y="177" width="30" height="2" fill="${accD}" opacity=".5"/>
      </g>
      <ellipse cx="${cx}" cy="182" rx="14" ry="17" fill="none" stroke="${outline}" stroke-width="1.6"/>
      <ellipse cx="${cx - 4 * flip}" cy="168.5" rx="4.5" ry="2.6" fill="${shellL}" opacity=".9"/>`;
  const vb = o.variant === 'head' ? '28 0 184 151' : '0 0 240 260';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img">
  <defs>
    <linearGradient id="${id}-shell" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="${shellL}"/><stop offset=".55" stop-color="${shell}"/><stop offset="1" stop-color="${shellD}"/></linearGradient>
    <linearGradient id="${id}-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shellL}"/><stop offset=".5" stop-color="${shell}"/><stop offset="1" stop-color="${shellD}"/></linearGradient>
    <linearGradient id="${id}-visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26346e"/><stop offset=".45" stop-color="${navy}"/><stop offset="1" stop-color="#0a0f28"/></linearGradient>
    <radialGradient id="${id}-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${o.led}" stop-opacity=".75"/><stop offset=".5" stop-color="${o.led}" stop-opacity=".25"/><stop offset="1" stop-color="${o.led}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-tipglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a3" stop-opacity=".9"/><stop offset="1" stop-color="#ffe9a3" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-ear" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="${accL}"/><stop offset=".7" stop-color="${acc}"/><stop offset="1" stop-color="${accD}"/></radialGradient>
    <filter id="${id}-ledglow" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="${id}-shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1a1236" stop-opacity=".34"/><stop offset=".6" stop-color="#1a1236" stop-opacity=".18"/><stop offset="1" stop-color="#1a1236" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}-visorclip"><rect x="70" y="58" width="100" height="76" rx="30"/></clipPath>
  </defs>
  <ellipse class="b-shadow" cx="120" cy="247" rx="46" ry="8" fill="url(#${id}-shadow)"/>
  <g class="b-float">
   <g class="b-pose">
    <ellipse class="b-glow" cx="120" cy="226" rx="20" ry="9" fill="url(#${id}-glow)"/>
    <g class="b-hand-l"><g>${hand(76, -1)}</g></g>
    <g class="b-body">
      <path d="M86 156h68c3 0 5 2.4 4.6 5.4l-4.4 34C151.5 213 137 224 120 224s-31.5-11-34.2-28.6l-4.4-34C81 158.4 83 156 86 156Z" fill="url(#${id}-body)" stroke="${outline}" stroke-width="1.6"/>
      <path d="M140 157h14c3 0 5 2.4 4.6 5.4l-4.4 34C151.5 213 137 224 120 224c12-6 19-17 20.5-30Z" fill="${shellD}" opacity=".55"/>
      <path d="M90 165c1 12 3 22 6 30" stroke="#fff" stroke-opacity=".7" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      <rect x="84" y="150" width="72" height="12" rx="6" fill="${acc}"/>
      <rect x="84" y="157" width="72" height="5" rx="2.5" fill="${accD}" opacity=".6"/>
      <circle cx="120" cy="187" r="13" fill="${navy}"/>
      <circle cx="120" cy="187" r="13" fill="none" stroke="${shellDD}" stroke-width="2.5"/>
      <path d="M120 178.5Q121.4 185.6 128.5 187 121.4 188.4 120 195.5 118.6 188.4 111.5 187 118.6 185.6 120 178.5Z" fill="#f6b934"/>
      <circle cx="120" cy="187" r="13" fill="url(#${id}-glow)" opacity=".35"/>
      <path d="M104 212q16 8 32 0" stroke="${shellDD}" stroke-width="2" stroke-linecap="round" fill="none" opacity=".5"/>
    </g>
    <g class="b-head">
      <rect x="112" y="140" width="16" height="14" rx="4" fill="${shellDD}"/>
      <path d="M120 40V22" stroke="${shellDD}" stroke-width="4.5" stroke-linecap="round"/>
      <circle class="b-tipglow" cx="120" cy="17" r="15" fill="url(#${id}-tipglow)"/>
      ${tip}
      <g>
        <circle cx="53" cy="98" r="17" fill="url(#${id}-ear)" stroke="${accD}" stroke-width="1.4"/>
        <circle cx="53" cy="98" r="8.5" fill="${shell}"/>
        <circle class="b-ear-led" cx="53" cy="98" r="4" fill="${o.led}"/>
        <circle cx="187" cy="98" r="17" fill="url(#${id}-ear)" stroke="${accD}" stroke-width="1.4"/>
        <circle cx="187" cy="98" r="8.5" fill="${shell}"/>
        <circle class="b-ear-led" cx="187" cy="98" r="4" fill="${o.led}"/>
      </g>
      <rect x="56" y="36" width="128" height="114" rx="50" fill="url(#${id}-shell)" stroke="${outline}" stroke-width="1.8"/>
      <path d="M184 86v14c0 27.6-22.4 50-50 50h-28c-14 0-26.6-5.7-35.6-15 9 6 20 9.6 31.6 9.6h28c27.6 0 50-22.4 50-50V86Z" fill="${shellD}" opacity=".7"/>
      <path d="M76 58c8-11 21-17 36-17.5" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".85"/>
      <circle cx="68" cy="72" r="3" fill="#fff" opacity=".8"/>
      <rect x="66" y="54" width="108" height="84" rx="34" fill="${shellDD}" opacity=".55"/>
      <rect x="70" y="58" width="100" height="76" rx="30" fill="url(#${id}-visor)"/>
      <g clip-path="url(#${id}-visorclip)">
        <g class="b-leds" filter="url(#${id}-ledglow)">${dots}</g>
        <path d="M70 58h56c-14 4-30 14-40 30-5 8-9 18-16 22Z" fill="#fff" opacity=".07"/>
        <path d="M86 66c6-4 13-6 20-6.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".35"/>
      </g>
      <rect x="70" y="58" width="100" height="76" rx="30" fill="none" stroke="#0a0f28" stroke-width="1.5"/>
      <g fill="${o.led}" font-family="Baloo 2, system-ui, sans-serif" font-weight="800">
        <text class="b-z" x="176" y="56" font-size="14">z</text>
        <text class="b-z" x="176" y="56" font-size="18">z</text>
        <text class="b-z" x="176" y="56" font-size="22">Z</text>
      </g>
    </g>
    <g class="b-hand-r"><g>${hand(164, 1)}</g></g>
   </g>
  </g>
</svg>`;
}

/* ------------------------------------------------------------------ mount */
export function mount(el: HTMLElement, opts: CompanionOptions = {}): Companion {
  injectCss();
  const o = {
    size: opts.size ?? 160,
    variant: opts.variant ?? 'full',
    accent: opts.accent ?? '#e4513d',
    led: opts.led ?? '#8ff7ec',
    shell: opts.shell ?? '#fbf4e6',
    antenna: opts.antenna ?? 'star',
    bubble: opts.bubble ?? 'auto',
    sfx: opts.sfx,
    name: opts.name ?? '领航员',
  } as const;
  const id = `xgb${++uid}`;
  const root = document.createElement('div');
  root.className = 'xg-bot';
  root.dataset.variant = o.variant;
  root.style.setProperty('--bot-led', o.led);
  const cssSize = typeof o.size === 'number' ? `${o.size}px` : o.size;
  root.style.width = cssSize;
  root.innerHTML = buildSvg(o, id);
  const svg = root.querySelector('svg') as SVGSVGElement;
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.aspectRatio = o.variant === 'head' ? '184 / 151' : '240 / 260';
  svg.setAttribute('aria-label', o.name);
  el.appendChild(root);

  const dots = Array.from(root.querySelectorAll<SVGCircleElement>('.b-dot'));
  const leds = root.querySelector('.b-leds') as SVGGElement;
  let current: Face = Array(ROWS).fill('.'.repeat(COLS));
  let mood: Mood = normalizeMood(opts.mood ?? 'idle') ?? 'idle';
  let talking = false;
  let destroyed = false;
  let blinkTimer = 0, talkTimer = 0, idleTimer = 0, reactTimer = 0, hideTimer = 0;
  let lookOffset = 0;
  let bubble: HTMLDivElement | null = null;
  let sayToken = 0;

  function render(fc: Face, stagger = false) {
    for (let y = 0; y < ROWS; y++) {
      const row = fc[y] ?? '';
      for (let x = 0; x < COLS; x++) {
        const sx = x - lookOffset;
        const ch = y < 5 ? (row[sx] ?? '.') : (row[x] ?? '.');
        const want = ch === '#' ? 'on' : ch === '+' ? 'warm' : ch === '*' ? 'pink' : 'off';
        const d = dots[y * COLS + x];
        if (d.dataset.s === want) continue;
        d.dataset.s = want;
        const apply = () => d.setAttribute('class', `b-dot ${want}`);
        if (stagger) window.setTimeout(apply, (x + y) * 9);
        else apply();
      }
    }
    current = fc;
  }
  function moodFace(m: Mood): Face {
    const s = MOOD_SPEC[m];
    return face(s.eyes, s.mouth);
  }
  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    blinkTimer = window.setTimeout(() => {
      if (destroyed) return;
      const s = MOOD_SPEC[mood];
      if (s.blink) {
        const base = current;
        const blinked = [...EYES.blink, ...base.slice(5)];
        render(blinked);
        window.setTimeout(() => { if (!destroyed && MOOD_SPEC[mood].blink) render([...s.eyes, ...current.slice(5)]); }, 130);
        if (Math.random() < 0.25) window.setTimeout(() => { if (!destroyed && MOOD_SPEC[mood].blink) { render([...EYES.blink, ...current.slice(5)]); window.setTimeout(() => !destroyed && render([...MOOD_SPEC[mood].eyes, ...current.slice(5)]), 110); } }, 300);
      }
      scheduleBlink();
    }, 2400 + Math.random() * 3200);
  }
  function scheduleIdle() {
    // thinking: eyes glance left/right; idle: occasional look-around
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (destroyed) return;
      if (mood === 'thinking' && !talking) {
        const alt = current[0] === EYES.up[0] ? EYES.upLeft : EYES.up;
        render([...alt, ...current.slice(5)], true);
      }
      scheduleIdle();
    }, mood === 'thinking' ? 1300 : 4000);
  }

  function setMood(input: Mood | MoodAlias, so: { silent?: boolean } = {}) {
    const m = normalizeMood(input);
    if (!m) throw new Error(`[companion] unknown mood "${input}" (sad moods are intentionally unsupported)`);
    if (input === 'blink') { render([...EYES.blink, ...current.slice(5)]); window.setTimeout(() => !destroyed && render([...MOOD_SPEC[mood].eyes, ...current.slice(5)]), 140); }
    const changed = m !== mood;
    mood = m;
    root.dataset.mood = m;
    if (MOOD_SPEC[m].dim) root.dataset.dim = ''; else delete root.dataset.dim;
    const fc = moodFace(m);
    render(talking ? [...fc.slice(0, 5), ...current.slice(5)] : fc, changed);
    if (changed && !so.silent && MOOD_SPEC[m].sfx) o.sfx?.(MOOD_SPEC[m].sfx!);
    if (changed && m === 'celebrating') confetti();
    if (changed && (m === 'happy')) react('hop');
    if (changed && (m === 'surprised')) react('jolt');
    scheduleIdle();
  }

  function react(kind: 'hop' | 'nod' | 'wiggle' | 'jolt') {
    root.classList.remove('r-hop', 'r-nod', 'r-wiggle', 'r-jolt');
    void root.offsetWidth;
    root.classList.add(`r-${kind}`);
    window.clearTimeout(reactTimer);
    reactTimer = window.setTimeout(() => root.classList.remove(`r-${kind}`), 1000);
  }

  function confetti() {
    const colors = ['#f6b934', '#e4513d', '#1aa892', '#8a73ee', '#3f7be6', '#fff6e3'];
    for (let i = 0; i < 18; i++) {
      const c = document.createElement('i');
      c.className = 'xg-bot-conf';
      const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
      const px = root.getBoundingClientRect().width || 160;
      const dist = px * (0.5 + Math.random() * 0.45);
      c.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
      c.style.setProperty('--dy', `${Math.sin(a) * dist * 0.8 - px * 0.15}px`);
      c.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
      c.style.background = colors[i % colors.length];
      c.style.width = `${Math.max(6, px * 0.045)}px`;
      c.style.height = `${Math.max(8, px * 0.065)}px`;
      c.style.animationDelay = `${Math.random() * 120}ms`;
      root.appendChild(c);
      window.setTimeout(() => c.remove(), 1600);
    }
  }

  function startTalk() {
    if (talking) return;
    talking = true;
    const frames = [MOUTH.talkA, MOUTH.talkB, MOUTH.talkC, MOUTH.talkB];
    let i = 0;
    const tick = () => {
      if (!talking || destroyed) return;
      const m = frames[i++ % frames.length];
      render([...current.slice(0, 5), ...m]);
      talkTimer = window.setTimeout(tick, 85 + Math.random() * 70);
    };
    tick();
  }
  function stopTalk() {
    talking = false;
    window.clearTimeout(talkTimer);
    render([...current.slice(0, 5), ...MOOD_SPEC[mood].mouth]);
  }

  function side(): 'right' | 'left' | 'top' {
    if (o.bubble !== 'auto') return o.bubble;
    const r = root.getBoundingClientRect();
    const vw = window.innerWidth;
    if (r.right + 260 < vw) return 'right';
    if (r.left > 260) return 'left';
    return 'top';
  }
  function room(sd: 'right' | 'left' | 'top'): number {
    const r = root.getBoundingClientRect();
    const vw = window.innerWidth;
    return Math.max(180, Math.min(opts.bubbleMax ?? 380, sd === 'right' ? vw - r.right - 20 : sd === 'left' ? r.left - 20 : vw - 40));
  }

  function hush() {
    sayToken++;
    if (bubble) {
      const b = bubble;
      b.classList.remove('show');
      window.setTimeout(() => b.remove(), 300);
      bubble = null;
    }
    if (talking) stopTalk();
  }

  async function say(text: string, so: SayOptions = {}): Promise<void> {
    hush();
    const token = ++sayToken;
    const prevMood = mood;
    if (so.mood) setMood(so.mood);
    o.sfx?.('blip-talk');
    const b = document.createElement('div');
    b.className = 'xg-bot-bubble';
    const sd = side();
    b.dataset.side = sd;
    b.style.maxWidth = `${room(sd)}px`;
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    const p = document.createElement('div');
    const chars = Array.from(text);
    p.innerHTML = chars.map((c) => `<span class="ch">${c.replace(/[<&>]/g, (m) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[m]!))}</span>`).join('');
    p.setAttribute('aria-label', text);
    b.appendChild(p);
    if (so.accessory) { const a = document.createElement('div'); a.className = 'acc'; a.appendChild(so.accessory); b.appendChild(a); }
    root.appendChild(b);
    bubble = b;
    requestAnimationFrame(() => b.classList.add('show'));
    window.clearTimeout(hideTimer);

    startTalk();
    const spans = Array.from(p.children) as HTMLElement[];
    const cps = so.cps ?? 16;
    const reveal = new Promise<void>((res) => {
      let i = 0;
      const step = () => {
        if (token !== sayToken || destroyed) return res();
        if (i < spans.length) { spans[i++].classList.add('v'); window.setTimeout(step, 1000 / cps * (/[，。！？、,.!?]/.test(chars[i - 1]) ? 3 : 1)); }
        else res();
      };
      window.setTimeout(step, 120);
    });
    const voice = Promise.resolve(so.speak?.(text)).catch(() => undefined);
    await Promise.all([reveal, voice]);
    if (token !== sayToken) return;
    stopTalk();
    const hold = so.hold ?? 1800;
    if (hold > 0) {
      await new Promise<void>((res) => { hideTimer = window.setTimeout(res, hold); });
      if (token !== sayToken) return;
      hush();
    }
    if (so.mood && !so.stay) setMood(prevMood, { silent: true });
  }

  function lookAt(x: number, y: number) {
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    lookOffset = Math.max(-1, Math.min(1, Math.round((x - cx) / (r.width * 1.2))));
    void y;
    render(current);
  }

  function destroy() {
    destroyed = true;
    [blinkTimer, talkTimer, idleTimer, reactTimer, hideTimer].forEach((t) => window.clearTimeout(t));
    root.remove();
  }

  root.dataset.mood = mood;
  render(moodFace(mood));
  if (MOOD_SPEC[mood].dim) root.dataset.dim = '';
  scheduleBlink();
  scheduleIdle();
  void leds;

  return {
    el: root, svg,
    get mood() { return mood; },
    setMood, say, hush, react, lookAt, destroy,
  };
}
