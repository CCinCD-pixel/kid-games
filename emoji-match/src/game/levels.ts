import type { Ladder, LevelSpec } from '../types';

export const STORAGE_KEY = 'kid_games_emoji_match_v1';

function buildLevels(spec: (number: number) => LevelSpec): LevelSpec[] {
  const levels: LevelSpec[] = [];
  for (let number = 1; number <= 40; number += 1) {
    levels.push(spec(number));
  }
  return levels;
}

export const LADDERS: Ladder[] = [
  {
    id: 'fruit',
    title: '🍓 水果派对',
    shortTitle: '水果',
    accent: '#ff8fab',
    description: '表情少、目标直白，先学会交换和做四消。',
    pool: ['🍎', '🍓', '🍊', '🍇', '🍌', '🥝'],
    levels: buildLevels((n) => {
      if (n <= 10) return { number: n, boardSize: 5, kindCount: 4, moves: 20 - Math.floor((n - 1) / 3), goals: [10 + Math.floor((n - 1) * 0.7)] };
      if (n <= 20) return { number: n, boardSize: 5, kindCount: 5, moves: 18 - Math.floor((n - 11) / 4), goals: [16 + Math.floor((n - 11) * 0.7)] };
      if (n <= 30) return { number: n, boardSize: 5, kindCount: 5, moves: 16 - Math.floor((n - 21) / 5), goals: [18 + Math.floor((n - 21) * 0.6), 8 + Math.floor((n - 21) * 0.4)] };
      return { number: n, boardSize: 6, kindCount: 5, moves: 15 - Math.floor((n - 31) / 5), goals: [22 + Math.floor((n - 31) * 0.7), 10 + Math.floor((n - 31) * 0.5)] };
    }),
  },
  {
    id: 'animal',
    title: '🐼 动物乐园',
    shortTitle: '动物',
    accent: '#7bd389',
    description: '棋盘更大，表情更多，后半段会同时收集两种目标。',
    pool: ['🐶', '🐱', '🐼', '🐰', '🦊', '🐸', '🐻'],
    levels: buildLevels((n) => {
      if (n <= 10) return { number: n, boardSize: 6, kindCount: 5, moves: 18 - Math.floor((n - 1) / 4), goals: [16 + Math.floor((n - 1) * 0.8)] };
      if (n <= 20) return { number: n, boardSize: 6, kindCount: 5, moves: 16 - Math.floor((n - 11) / 4), goals: [20 + Math.floor((n - 11) * 0.7), 8 + Math.floor((n - 11) * 0.45)] };
      if (n <= 30) return { number: n, boardSize: 6, kindCount: 6, moves: 15 - Math.floor((n - 21) / 5), goals: [22 + Math.floor((n - 21) * 0.8), 10 + Math.floor((n - 21) * 0.5)] };
      return { number: n, boardSize: 6, kindCount: 6, moves: 13 - Math.floor((n - 31) / 6), goals: [26 + Math.floor((n - 31) * 0.9), 12 + Math.floor((n - 31) * 0.6)] };
    }),
  },
  {
    id: 'magic',
    title: '🎪 魔法马戏团',
    shortTitle: '马戏团',
    accent: '#f4b942',
    description: '三阶里最难，步数更紧，更需要做特殊块和连锁。',
    pool: ['⭐', '🌈', '🎈', '🫧', '🪀', '🧸', '🍭'],
    levels: buildLevels((n) => {
      if (n <= 10) return { number: n, boardSize: 6, kindCount: 5, moves: 16 - Math.floor((n - 1) / 5), goals: [18 + Math.floor((n - 1) * 0.8), 10 + Math.floor((n - 1) * 0.4)] };
      if (n <= 20) return { number: n, boardSize: 6, kindCount: 6, moves: 15 - Math.floor((n - 11) / 5), goals: [22 + Math.floor((n - 11) * 0.8), 12 + Math.floor((n - 11) * 0.5)] };
      if (n <= 30) return { number: n, boardSize: 6, kindCount: 6, moves: 13 - Math.floor((n - 21) / 5), goals: [26 + Math.floor((n - 21) * 0.9), 14 + Math.floor((n - 21) * 0.6)] };
      return { number: n, boardSize: 6, kindCount: 7, moves: 12 - Math.floor((n - 31) / 6), goals: [30 + Math.floor((n - 31) * 1), 16 + Math.floor((n - 31) * 0.7)] };
    }),
  },
];
