// 编钟 · 木头 · 鼓 — the game's sound effects (spec §7.1). Every buffer is computed by the pure-JS synth (synth.ts) and
// copied into an AudioBuffer of the kit's ONE context; one-shots play through kit `playBuffer(…, { bus: 'sfx' })`,
// the three continuously modulated loops (冲车助跑, 阳燧, 蚁傅) through this game's own Gain → Panner → sfx-bus chain.
// The mixer (§7.1 混音规则): ≤12 voices, per-id "at once" and "per second" caps, priority drop (P0 never dropped),
// pan by lane. Kit UI sounds (ui-tap …) go through installKitSfx. Silent under automation (kit/automute.ts).
import { getAudioContext, getBus, playBuffer, type Voice } from '@kit/audio';
import { RECIPES, renderSfx, SR } from './synth';
import { commonSfx, levelSfx, halfRate, HALF } from './sfxset';
import type { Level } from '../lane/types';

const bufs = new Map<string, AudioBuffer>(); let bufCtx: AudioContext | null = null;
const STEP = [0, 2, 4, 7, 9, 12, 14, 16]; // C5 D5 E5 G5 A5 C6 D6 E6 — the kit chime ladder
const stepRate = (k: number): number => Math.pow(2, STEP[((k % 8) + 8) % 8] / 12);
const portrait = (): boolean => typeof innerHeight === 'number' && innerHeight > innerWidth;
const panOf = (lane?: number): number => (lane == null ? 0 : (lane - 2) * (portrait() ? 0.15 : 0.25));

function ac(): AudioContext | null { const a = getAudioContext(); return a && a.state === 'running' && getBus('sfx') ? a : null; }
function buf(a: AudioContext, id: string): AudioBuffer {
  if (bufCtx !== a) { bufs.clear(); bufCtx = a; }
  let b = bufs.get(id);
  if (!b) { const half = HALF.has(id) && !RECIPES[id].loop; const d0 = renderSfx(id); const d = half ? halfRate(d0) : d0; b = a.createBuffer(1, d.length, half ? SR / 2 : SR); b.copyToChannel(d, 0); bufs.set(id, b); }
  return b;
}
/** bytes of sound-effect samples held right now (spec §8.6 budget; read by the tech probe) */
export function sfxBytes(): number { let n = 0; for (const b of bufs.values()) n += b.length * b.numberOfChannels * 4; return n; }
/** synthesize ahead in idle slices (battle-critical ids first; spec: ≤150 ms on A13, split in two batches) */
const FIRST = ['place', 'hit.wood', 'hit.metal', 'shoot.crossbow', 'collect', 'machine.break', 'parts.fly', 'unit.hurt', 'flag.drum', 'shoot.lobber', 'syll'];
export function warmSfx(): void { warm([...FIRST, ...commonSfx(Object.keys(RECIPES)).filter((k) => !FIRST.includes(k))]); }
/** a battle starts: keep the common set + this level's own sounds, let the rest go (spec §8.6 "只合成用到的音效") */
export function prepareLevel(L: Level, cards?: string[]): void {
  const keep = new Set([...commonSfx(Object.keys(RECIPES)), ...levelSfx(L, cards)]);
  for (const id of [...bufs.keys()]) if (!keep.has(id) && !loops.has(id)) bufs.delete(id);
  warm([...keep].filter((id) => !bufs.has(id)));
}
let warmTok = 0;
function warm(ids: string[]): void {
  let i = 0; const tok = ++warmTok;
  const slice = (): void => { if (tok !== warmTok && i === 0) return; const a = ac(); if (!a) { setTimeout(slice, 500); return; } const t = performance.now(); while (i < ids.length && performance.now() - t < 6) buf(a, ids[i++]); if (i < ids.length) setTimeout(slice, 30); };
  setTimeout(slice, 60);
}

interface Live { id: string; pri: number; v: Voice; at: number; done: boolean }
let live: Live[] = []; const recent = new Map<string, number[]>();
export interface PlayOpts { lane?: number; vol?: number; rate?: number; step?: number; delay?: number }
/** one-shot through the mixer; silently skipped when capped (the picture still shows the event) */
export function play(id: string, o: PlayOpts = {}): void {
  const rc = RECIPES[id]; const a = ac(); if (!rc || !a) return;
  const now = performance.now(); const hist = (recent.get(id) || []).filter((t) => now - t < 1000);
  if (hist.length >= rc.perSec) { recent.set(id, hist); return; }
  live = live.filter((l) => !l.done);
  const same = live.filter((l) => l.id === id);
  if (same.length >= rc.max) { if (rc.pri > 0) return; same[0].v.stop(0.03); same[0].done = true; }
  if (live.filter((l) => !l.done).length >= 12) {
    const victim = live.filter((l) => !l.done && (l.pri > rc.pri || (l.pri === 2 && rc.pri === 2))).sort((x, y) => y.pri - x.pri || x.at - y.at)[0];
    if (!victim && rc.pri > 0) return; const v = victim ?? live.find((l) => !l.done)!; v.v.stop(0.03); v.done = true;
  }
  const rate = (o.rate ?? 1) * (o.step != null ? stepRate(o.step) : 1) * (rc.jit ? 1 + (Math.random() * 2 - 1) * rc.jit : 1);
  const v = playBuffer(buf(a, id), { bus: 'sfx', rate, pan: panOf(o.lane), volume: rc.vol * (o.vol ?? 1), delay: o.delay }); if (!v) return;
  const l: Live = { id, pri: rc.pri, v, at: now, done: false }; live.push(l); void v.ended.then(() => { l.done = true; });
  hist.push(now); recent.set(id, hist);
}

// ── continuous loops (own chain: they need live gain / rate / pan, which kit playBuffer cannot do — spec §7.1 B18) ──
const loops = new Map<string, { src: AudioBufferSourceNode; g: GainNode; p: StereoPannerNode | null }>();
export function setLoop(id: string, level: number, o: { rate?: number; lane?: number } = {}): void {
  const a = ac(); const bus = getBus('sfx'); let l = loops.get(id);
  if (!a || !bus) return;
  if (level <= 0.001) { if (l) { l.g.gain.setTargetAtTime(0, a.currentTime, 0.08); try { l.src.stop(a.currentTime + 0.5); } catch { /* stopped */ } loops.delete(id); } return; }
  if (!l) {
    const src = a.createBufferSource(); src.buffer = buf(a, id); src.loop = true; const g = a.createGain(); g.gain.value = 0;
    const p = typeof a.createStereoPanner === 'function' ? a.createStereoPanner() : null; src.connect(g); if (p) g.connect(p).connect(bus); else g.connect(bus);
    src.start(); l = { src, g, p }; loops.set(id, l); src.onended = () => { src.disconnect(); g.disconnect(); p?.disconnect(); };
  }
  l.g.gain.setTargetAtTime(RECIPES[id].vol * Math.min(1, level), a.currentTime, 0.12);
  if (o.rate) l.src.playbackRate.setTargetAtTime(o.rate, a.currentTime, 0.15);
  if (l.p && o.lane != null) l.p.pan.setTargetAtTime(panOf(o.lane), a.currentTime, 0.15);
}
export function stopLoops(): void { for (const id of [...loops.keys()]) setLoop(id, 0); }

// ── ladders (spec: collect = pentatonic steps within 1.5 s; parts = one rising figure per machine) ──
let colStep = 0, colAt = 0, partStep = 0, partAt = 0;
export function collect(lane?: number): void { const now = performance.now(); colStep = now - colAt < 1500 ? colStep + 1 : 0; colAt = now; play('collect', { step: Math.min(7, colStep), lane }); }
export function parts(n: number, delay = 0.6): void {
  const now = performance.now(); if (now - partAt > 1500) partStep = 0; partAt = now;
  for (let i = 0; i < n; i++) play('parts.fly', { step: Math.min(7, partStep++), delay: delay + i * 0.09 });
}
/** 鲁班's wooden "puppet talk" (no voice yet, kit request K1): pentatonic woodblock syllables */
export function babble(n = 4): void { for (let i = 0; i < n; i++) play('syll', { step: Math.floor(Math.random() * 6), delay: i * 0.085, rate: 0.9 + Math.random() * 0.2 }); }
export function resetSfx(): void { live = []; recent.clear(); colStep = 0; partStep = 0; stopLoops(); }
