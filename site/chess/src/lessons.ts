import lessonsJson from '../../../content/chess/lessons.v1.json';
import mateJson from '../../../content/chess/puzzles.v1.json';
import puzzlesJson from '../../../content/chess/xiaoju.v1.json';
import type { PType } from '@engines/board/games/chess/position';

interface Step { id: string; k: string; pos: string; hero?: string; stars?: string[]; targets?: string[] }
interface Lesson { id: string; title: string; teaches: string; steps: Step[] }
const ids: { id: string; piece: PType; name: string }[] = [
  { id: 'A1', piece: 'R', name: '车' }, { id: 'B1', piece: 'B', name: '象' },
  { id: 'Q1', piece: 'Q', name: '后' }, { id: 'K1', piece: 'K', name: '王' },
  { id: 'N1', piece: 'N', name: '马' }, { id: 'P1', piece: 'P', name: '兵' },
];

export const PIECE_LESSONS = ids.map(({ id, piece, name }) => {
  const source = (lessonsJson.lessons as Lesson[]).find((l) => l.id === id)!;
  const tasks = source.steps.filter((s) => (s.k === 'stars' || s.k === 'capture') && (s.stars ?? s.targets)?.length === 1).slice(0, 2)
    .map((s) => ({ id: s.id, fen: s.pos, from: s.hero!, to: (s.stars ?? s.targets)![0], capture: s.k === 'capture' }));
  return { id, piece, name, title: source.title, teaches: source.teaches, tasks };
});

export const ENDGAMES = puzzlesJson.items.filter((p) => p.tier <= 2).slice(0, 8).map((p) => ({ id: p.id, title: p.zh, fen: p.fen }));

const mateIds = ['in.C1.5', 'in.C1.6', 'm1.ladder.001', 'm1.ladder.002', 'm1.backrank.001', 'm1.backrank.002', 'm1.queenKiss.023', 'm1.queenKiss.024'];
export const MATE_PUZZLES = mateIds.map((id, index) => {
  const source = mateJson.puzzles.find((p) => p.id === id)!;
  return { id, fen: source.fen, title: index < 2 ? '第一次将死' : index < 4 ? '双车合力' : index < 6 ? '守住底线' : '王后出击' };
});
export const PUZZLES = [...MATE_PUZZLES, ...ENDGAMES];
