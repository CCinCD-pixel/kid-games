import { createRng, type Rng } from '@kit/rng';
import nodesData from '../../../../content/mars-base/nodes.json';

export interface C1Node {
  id: string;
  chapter: string;
  kind: string;
  title: string;
  teaches: string;
  items: { fam: string; count: number; band?: number }[];
  buildingPart?: { id: string; name: string };
}

export const C1_NODES = (nodesData.nodes as C1Node[]).filter((node) => node.chapter === 'C1');

interface Base { id: string; family: string; answer: number | '>' | '<' | '=' }
export type C1Item =
  | (Base & { family: 'pv2.read'; rods: number; crystals: number; answer: number })
  | (Base & { family: 'pv2.build'; target: number; answer: number })
  | (Base & { family: 'pv2.compare'; left: number; right: number; answer: '>' | '<' | '='; decisive: 'tens' | 'ones' })
  | (Base & { family: 'pv2.step'; from: number; delta: number; answer: number })
  | (Base & { family: 'pv2.split'; total: number; rods: number; loose: number; answer: number });

function makeOne(family: string, band: number, rng: Rng): C1Item {
  if (family === 'pv2.read') {
    const rods = rng.int(1, band >= 2 ? 7 : 9);
    const crystals = rng.int(band >= 2 ? 10 : 0, band >= 2 ? 19 : 9);
    return { id: `${family}:${rods}:${crystals}`, family, rods, crystals, answer: rods * 10 + crystals };
  }
  if (family === 'pv2.build') {
    const target = band >= 2 && rng.chance(0.5) ? rng.int(2, 9) * 10 : rng.int(21, 99);
    return { id: `${family}:${target}`, family, target, answer: target };
  }
  if (family === 'pv2.compare') {
    let left = rng.int(20, 89);
    let right = rng.int(20, 89);
    if (band === 1) {
      while (Math.floor(left / 10) === Math.floor(right / 10)) right = rng.int(20, 89);
    } else if (band === 2) {
      right = Math.floor(left / 10) * 10 + rng.int(0, 9);
      if (right === left) right = Math.floor(left / 10) * 10 + ((left + 1) % 10);
    } else {
      left = rng.int(2, 8) * 10 + rng.int(2, 8);
      right = left % 10 * 10 + Math.floor(left / 10);
      if (left === right) right = left % 10 * 10 + (Math.floor(left / 10) === 8 ? 7 : Math.floor(left / 10) + 1);
    }
    const answer = left > right ? '>' : left < right ? '<' : '=';
    return { id: `${family}:${left}:${right}`, family, left, right, answer, decisive: Math.floor(left / 10) === Math.floor(right / 10) ? 'ones' : 'tens' };
  }
  if (family === 'pv2.step') {
    const delta = rng.pick([-10, -1, 1, 10]);
    let from = rng.int(11, 89);
    if (band === 1 && Math.abs(delta) === 1) {
      while ((from + delta) % 10 === 0 || from % 10 === 0) from = rng.int(11, 89);
    }
    if (band >= 2 && Math.abs(delta) === 1 && rng.chance(0.5)) from = delta > 0 ? rng.int(2, 8) * 10 + 9 : rng.int(2, 8) * 10;
    return { id: `${family}:${from}:${delta}`, family, from, delta, answer: from + delta };
  }
  if (family === 'pv2.split') {
    const rods = rng.int(band >= 3 ? 2 : 1, band >= 3 ? 6 : 8);
    const cuts = band >= 3 ? 2 : band >= 2 ? 1 : 0;
    const loose = rng.int(1, 9);
    const total = (rods + cuts) * 10 + loose;
    return { id: `${family}:${total}:${rods}`, family, total, rods, loose: loose + cuts * 10, answer: loose + cuts * 10 };
  }
  throw new Error(`C1 family ${family} is not implemented`);
}

export function makeC1Items(node: C1Node, seed: number): C1Item[] {
  const rng = createRng(`${node.id}:${seed}`);
  const used = new Set<string>();
  const items: C1Item[] = [];
  for (const block of node.items) {
    const band = block.band ?? (node.kind === 'boss' ? 2 : 1);
    for (let i = 0; i < block.count; i++) {
      let item: C1Item | null = null;
      for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = makeOne(block.fam, band, rng);
        if (!used.has(candidate.id)) { item = candidate; break; }
      }
      if (!item) throw new Error(`Cannot generate unique ${block.fam} for ${node.id}`);
      used.add(item.id);
      items.push(item);
    }
  }
  return node.kind === 'boss' ? rng.shuffle(items) : items;
}

export function c1AnswerIsCorrect(item: C1Item, answer: string, decisive?: string): boolean {
  if (item.family === 'pv2.compare') return answer === item.answer && decisive === item.decisive;
  return Number(answer) === item.answer && answer.trim() !== '';
}
