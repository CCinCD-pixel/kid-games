import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import { analyzeLevel, depthScan, levelDigest } from '@engines/puzzle/src/analyze';
import { twinOf } from '@engines/puzzle/src/level';
import { star2Of, type LevelDef, type PoolLevel } from '../src/data';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const LEVELS = path.join(root, 'content/sokoban/levels.json');
const POOL = path.join(root, 'content/sokoban/random-fallback.json');
const PARITY = path.join(root, 'engines/puzzle/tests/fixtures/sokoban-expanded.json');

const CHAPTERS = [
  { ch: 5, seeds: [5000, 5001, 5005, 5006, 5009, 5012, 5018, 5024], names: ['新的货单', '转过窄道', '先送左边', '双箱换位', '贴墙绕行', '看清出口', '轻推到站', '小仓收工'] },
  { ch: 6, seeds: [5011, 5013, 5015, 5020, 5021, 5025, 5026, 5033], names: ['两边都看看', '推开通道', '先后有序', '绕开墙角', '停一下再推', '箱子排队', '最后一格', '准点装车'] },
  { ch: 7, seeds: [6002, 6004, 6006, 6007, 6010, 6015, 6016, 6019], names: ['双箱新路', '让出空位', '换个方向', '转身再推', '左边先走', '不要挤墙', '顺着通道', '月面发射'] },
  { ch: 8, seeds: [6021, 6026, 6027, 6029, 6031, 6032, 6034, 6038], names: ['再走一步', '两条路线', '先找落脚点', '排好顺序', '慢慢靠近', '通道留给谁', '最后的补给', '星港总调度'] },
] as const;

const LESSON: Record<string, LevelDef['lesson']> = { pair: 'trap', corner: 'trap', wall: 'trap', order: 'order', park: 'park', plan: 'mixed' };
const TEACHES: Record<string, string> = {
  pair: '两个箱子并排时，先看会不会堵住通道', corner: '先看看墙角能不能把箱子推出来',
  wall: '沿墙推箱子前，确认终点在不在墙边', order: '先想清楚两个箱子的装货顺序',
  park: '先给一个箱子留临时停车位', plan: '先看终点，再倒着想推进路线',
};

it.skipIf(process.env.SOK_EXPAND !== '1')('publish 32 checked levels from the existing generated pool', () => {
  const doc = JSON.parse(fs.readFileSync(LEVELS, 'utf8')) as { version: number; generatedBy: string; levels: LevelDef[] };
  const pool = JSON.parse(fs.readFileSync(POOL, 'utf8')) as { levels: PoolLevel[] };
  const old = doc.levels.filter((l) => l.track !== 'main' || Number(l.ch) <= 4);
  const used = new Set(old.map((l) => l.map.join('\n')));
  const added: LevelDef[] = [];
  for (const chapter of CHAPTERS) {
    const analyzed = chapter.seeds.map((seed) => {
      const source = pool.levels.find((p) => p.seed === seed);
      if (!source) throw new Error(`missing pool seed ${seed}`);
      const key = source.map.join('\n');
      if (used.has(key)) throw new Error(`duplicate board ${seed}`);
      used.add(key);
      const a = analyzeLevel(source.map);
      const twin = twinOf(source.map);
      if (!a?.solvable || !a.replayOk || !twin) throw new Error(`invalid pool seed ${seed}`);
      return { source, a, twin };
    }).sort((x, y) => x.a.D - y.a.D);
    analyzed.forEach(({ source, a, twin }, i) => {
      const scan = depthScan(a.level, a.graph);
      const role = i === 0 ? 'intro' : i === 7 ? 'boss' : i === 2 || i === 5 ? 'review' : 'practice';
      added.push({
        id: `${chapter.ch}-${i + 1}`, release: 'v1', ch: chapter.ch, track: 'main', role, review: role === 'review',
        name: chapter.names[i], teaches: TEACHES[source.lesson], say: `sok.rnd.${source.lesson}`,
        lesson: LESSON[source.lesson], map: source.map, opt: source.opt, star2: star2Of(source.opt.pushes),
        ref: source.ref, twin: twin.kind, checks: {},
        metrics: { D: a.D, k1: null, L1: null, states: a.states, trapFirst: a.trapFirst,
          firstPushes: a.firstPushes, seqFirsts: a.seqFirsts.length, greedy: a.greedy,
          switches: a.switches, turns: a.turns, first: scan.first, invis: scan.invis },
      });
    });
  }
  doc.generatedBy = 'v1 main content + tools/sokoban/expand-levels.test.ts (checked pool selection)';
  doc.levels = [...old, ...added];
  fs.writeFileSync(LEVELS, `${JSON.stringify(doc, null, 1)}\n`);
  if (added.length !== 32) throw new Error(`expected 32, got ${added.length}`);
  const digests = Object.fromEntries(added.map((level) => [level.id, levelDigest(level.map)]));
  fs.writeFileSync(PARITY, `${JSON.stringify({ note: 'Regression baseline for the 32 pool-derived chapters 5-8; all maps also pass the independent level validator.', levels: digests }, null, 2)}\n`);
});
