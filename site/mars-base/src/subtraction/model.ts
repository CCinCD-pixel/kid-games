import { createRng, type Rng } from '@kit/rng';
import nodesData from '../../../../content/mars-base/nodes.json';

export interface SubtractionNode {
  id: string;
  chapter: string;
  kind: string;
  title: string;
  teaches: string;
  items: { fam: string; count: number; band?: number }[];
  buildingPart?: { id: string; name: string };
}

export interface SubtractionItem {
  id: string;
  family: string;
  a: number;
  b: number;
  answer: number;
  strategy: 'tray' | 'thinkAdd' | 'compensate' | 'compare' | 'column';
  borrow: boolean;
  rounded?: number;
}

export const SUBTRACTION_NODES = (nodesData.nodes as SubtractionNode[]).filter((node) => node.chapter === 'C3');

function makeOne(family: string, band: number, index: number, rng: Rng): SubtractionItem {
  let a: number;
  let b: number;
  let strategy: SubtractionItem['strategy'] = 'tray';
  if (family === 'sub.tens') {
    const tens = rng.int(3, 9);
    a = tens * 10 + (band >= 2 || index % 2 === 1 ? rng.int(1, 9) : 0);
    b = rng.int(1, tens - 1) * 10;
  } else if (family === 'sub.borrow1') {
    const ones = rng.int(0, 7);
    a = rng.int(band >= 2 ? 5 : 2, band >= 2 ? 9 : 4) * 10 + ones;
    b = rng.int(ones + 1, 9);
  } else if (family === 'sub.thinkAdd') {
    b = rng.int(20, 89);
    a = b + rng.int(2, Math.min(9, 99 - b));
    strategy = 'thinkAdd';
  } else if (family === 'sub.2d2d' || family === 'col.sub') {
    const borrow = family === 'col.sub' || band >= 2 || index % 2 === 1;
    const ones = rng.int(borrow ? 0 : 2, borrow ? 7 : 9);
    a = rng.int(3, 9) * 10 + ones;
    b = rng.int(1, Math.floor(a / 10) - 1) * 10 + rng.int(borrow ? ones + 1 : 0, borrow ? 9 : ones);
    if (family === 'col.sub') strategy = 'column';
  } else if (family === 'sub.compensate') {
    const rounded = rng.int(2, 7) * 10;
    b = rounded - rng.pick([1, 2]);
    a = rng.int(b + 5, 99);
    strategy = 'compensate';
  } else if (family === 'rel.compare') {
    b = rng.int(15, 60);
    a = b + rng.int(2, 25);
    strategy = 'compare';
  } else throw new Error(`Subtraction family ${family} is not implemented`);
  return {
    id: `${family}:${a}:${b}`, family, a, b, answer: a - b, strategy,
    borrow: a % 10 < b % 10,
    ...(strategy === 'compensate' ? { rounded: Math.ceil(b / 10) * 10 } : {}),
  };
}

export function makeSubtractionItems(node: SubtractionNode, seed: number): SubtractionItem[] {
  const rng = createRng(`${node.id}:${seed}`);
  const used = new Set<string>();
  const items: SubtractionItem[] = [];
  for (const block of node.items) {
    for (let i = 0; i < block.count; i++) {
      let candidate: SubtractionItem | undefined;
      for (let attempt = 0; attempt < 100; attempt++) {
        const generated = makeOne(block.fam, block.band ?? 1, i, rng);
        if (!used.has(generated.id)) { candidate = generated; break; }
      }
      if (!candidate) throw new Error(`Cannot generate unique ${block.fam} for ${node.id}`);
      used.add(candidate.id);
      items.push(candidate);
    }
  }
  return node.kind === 'boss' ? rng.shuffle(items) : items;
}
