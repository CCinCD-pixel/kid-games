import lessonsJson from '../../../content/chess/lessons.v1.json';
import mateJson from '../../../content/chess/puzzles.v1.json';
import puzzlesJson from '../../../content/chess/xiaoju.v1.json';
import type { PType } from '@engines/board/games/chess/position';

interface Step { id: string; k: string; pos: string; hero?: string; stars?: string[]; targets?: string[] }
interface Lesson { id: string; title: string; teaches: string; steps: Step[] }
const ids: { id: string; piece: PType; name: string; reason: string }[] = [
  { id: 'A1', piece: 'R', name: '车', reason: '车沿横线或竖线走，不能斜走。' },
  { id: 'B1', piece: 'B', name: '象', reason: '象沿斜线走，一直待在同色格。' },
  { id: 'Q1', piece: 'Q', name: '后', reason: '后能像车走直线，也能像象走斜线。' },
  { id: 'K1', piece: 'K', name: '王', reason: '王每次只走一格，还要避开被攻击的格子。' },
  { id: 'N1', piece: 'N', name: '马', reason: '马走日字，可以越过旁边的棋子。' },
  { id: 'P1', piece: 'P', name: '兵', reason: '兵向前走，走到对面就能升变。' },
];

export const PIECE_LESSONS = ids.map(({ id, piece, name, reason }) => {
  const source = (lessonsJson.lessons as Lesson[]).find((l) => l.id === id)!;
  const practice = source.steps.filter((s) => (s.k === 'stars' || s.k === 'capture') && (s.stars ?? s.targets)?.length === 1).slice(0, 2);
  const transferId: Record<string, string> = { A1: 'A1.6', B1: 'B1.6', Q1: 'Q1.5', K1: 'K1.8', N1: 'N1.6', P1: 'P1.4' };
  const transfer = source.steps.find((s) => s.id === transferId[id])!;
  const tasks = [...practice, transfer].map((s) => ({ id: s.id, fen: s.pos, from: s.hero!, to: (s.stars ?? s.targets)![0], capture: s.k === 'capture' }));
  return { id, piece, name, title: source.title, teaches: source.teaches, reason, tasks };
});

export const ENDGAMES = puzzlesJson.items.filter((p) => p.tier <= 2).slice(0, 8).map((p) => ({ id: p.id, title: p.zh, fen: p.fen }));

const mateIds = ['in.C1.5', 'in.C1.6', 'm1.ladder.001', 'm1.ladder.002', 'm1.backrank.001', 'm1.backrank.002', 'm1.queenKiss.023', 'm1.queenKiss.024'];
export const MATE_PUZZLES = mateIds.map((id, index) => {
  const source = mateJson.puzzles.find((p) => p.id === id)!;
  return { id, fen: source.fen, title: index < 2 ? '第一次将死' : index < 4 ? '双车合力' : index < 6 ? '守住底线' : '王后出击' };
});
export const PUZZLES = [...MATE_PUZZLES, ...ENDGAMES];
