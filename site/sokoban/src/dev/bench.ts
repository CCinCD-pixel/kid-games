/**
 * `?bench=1` (spec §8.11, §9.5 #4): run on the iPad — the full pre-solve of 经典 C10 (the largest
 * state graph, budget 12 s) and 20 大货单 (T3) generations, timed on this device; the numbers stay on
 * screen for Dad to send back. A separate lazy chunk: never on the child's path.
 */
import { generatePuzzle } from '@engines/puzzle/src/generator';
import { parseLevel } from '@engines/puzzle/src/level';
import { StateGraph } from '@engines/puzzle/src/stategraph';
import roomsJson from '../../../../content/sokoban/rooms.json';
import type { AppCtx } from '../app/context';
import { fixedLevelHashes } from '../app/random';
import { levelById } from '../data';

export async function mountBench(app: HTMLElement, _ctx: AppCtx): Promise<void> {
  const el = document.createElement('div');
  el.className = 'sok-bench';
  el.innerHTML = '<h2>星港搬运工 · 设备测速</h2><pre>测量中…</pre>';
  app.append(el);
  const pre = el.querySelector('pre')!;
  const lines: string[] = [`${navigator.userAgent}`, ''];
  const show = () => {
    pre.textContent = lines.join('\n');
  };
  const pause = () => new Promise((r) => setTimeout(r, 30));
  const c10 = levelById('C10')!;
  const l = parseLevel(c10.map, 'C10');
  let t = performance.now();
  const g = await StateGraph.build(l, { maxStates: 200000, maxMs: 60000 });
  const ms = performance.now() - t;
  lines.push(`C10 全图预解：${g ? g.size : '超预算'} 个状态，${(ms / 1000).toFixed(2)} s，保留 ${g ? (g.bytes / 1048576).toFixed(1) : '-'} MB（门槛 ≤ 12 s，≤ 15 MB）`);
  show();
  await pause();
  const rooms = (roomsJson as unknown as { rooms: Record<string, string[]> }).rooms;
  const avoid = new Set(fixedLevelHashes());
  const times: number[] = [];
  let ok = 0;
  for (let i = 0; i < 20; i += 1) {
    t = performance.now();
    const r = generatePuzzle(3, 7000 + i, rooms, { colors: false, avoid });
    times.push(performance.now() - t);
    if (r.ok) ok += 1;
    lines[3] = `大货单 T3 生成：${i + 1}/20 …`;
    show();
    await pause();
  }
  times.sort((a, b) => a - b);
  const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  lines[3] = `大货单 T3 生成 20 个：成功 ${ok}，p50 ${q(0.5).toFixed(0)} ms，p95 ${q(0.95).toFixed(0)} ms，最长 ${times[times.length - 1].toFixed(0)} ms（门槛 p95 ≤ 1500 ms）`;
  lines.push('', '测完了，可以截图发回。');
  show();
  app.dataset.bench = 'done';
}
