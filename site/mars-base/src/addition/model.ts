import { createRng, type Rng } from '@kit/rng';
import nodesData from '../../../../content/mars-base/nodes.json';

export interface AdditionNode {
  id: string;
  chapter: string;
  kind: string;
  title: string;
  teaches: string;
  items: { fam: string; count: number; band?: number; variant?: string }[];
  buildingPart?: { id: string; name: string };
}

export interface AdditionItem {
  id: string;
  family: string;
  a: number;
  b: number;
  answer: number;
  strategy: 'tray' | 'makeTen' | 'compensate' | 'column';
  firstPart?: number;
  secondPart?: number;
  carry: 0 | 1;
}

export const ADDITION_NODES = (nodesData.nodes as AdditionNode[]).filter((node) => node.chapter === 'C2');

function makeOne(family: string, band: number, variant: string | undefined, rng: Rng): AdditionItem {
  let a = 0;
  let b = 0;
  let strategy: AdditionItem['strategy'] = 'tray';
  if (family === 'add.tens') {
    a = rng.int(2, 7) * 10 + (band >= 2 ? rng.int(1, 8) : rng.chance(0.5) ? rng.int(1, 8) : 0);
    b = rng.int(1, Math.floor((99 - a) / 10)) * 10;
  } else if (family === 'add.carry1') {
    const ones = rng.int(4, 9);
    a = rng.int(2, 8) * 10 + ones;
    const fill = 10 - ones;
    b = rng.int(fill, Math.min(9, 99 - a));
    if (variant === 'makeTen') {
      strategy = 'makeTen';
      if (b === fill) b = Math.min(9, fill + 1);
    }
  } else if (family === 'add.2d2d' || family === 'col.add') {
    const carry = band >= 2 || family === 'col.add';
    const aOnes = rng.int(carry ? 4 : 1, carry ? 9 : 7);
    const bOnes = rng.int(carry ? 10 - aOnes : 1, carry ? 9 : 9 - aOnes);
    const aTens = rng.int(2, 6);
    const bTens = rng.int(1, 8 - aTens);
    a = aTens * 10 + aOnes;
    b = bTens * 10 + bOnes;
    if (family === 'col.add') strategy = 'column';
  } else if (family === 'add.compensate') {
    const offset = rng.pick([1, 2]);
    a = rng.int(2, 6) * 10 - offset;
    b = rng.int(12, Math.min(29, 99 - a));
    strategy = 'compensate';
  } else throw new Error(`Addition family ${family} is not implemented`);
  const carry = ((a % 10) + (b % 10) >= 10 ? 1 : 0) as 0 | 1;
  const firstPart = strategy === 'makeTen' ? 10 - a % 10 : strategy === 'compensate' ? 10 - a % 10 : undefined;
  return { id: `${family}:${a}:${b}`, family, a, b, answer: a + b, strategy, firstPart, secondPart: strategy === 'makeTen' ? b - firstPart! : undefined, carry };
}

export function makeAdditionItems(node: AdditionNode, seed: number): AdditionItem[] {
  const rng = createRng(`${node.id}:${seed}`);
  const used = new Set<string>();
  const items: AdditionItem[] = [];
  for (const block of node.items) {
    for (let i = 0; i < block.count; i++) {
      let candidate: AdditionItem | undefined;
      for (let attempt = 0; attempt < 100; attempt++) {
        const generated = makeOne(block.fam, block.band ?? 1, block.variant, rng);
        if (!used.has(generated.id)) { candidate = generated; break; }
      }
      if (!candidate) throw new Error(`Cannot generate unique ${block.fam} for ${node.id}`);
      used.add(candidate.id);
      items.push(candidate);
    }
  }
  return node.kind === 'boss' ? rng.shuffle(items) : items;
}
