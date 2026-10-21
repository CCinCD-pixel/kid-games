// site/xiangqi/src/rules/robots.ts — 六位"机关人"（滑轮 · 木牛 · 流马 · 司南 · 浑天 · 璇玑）：数据 content/xiangqi/robots.v1.json，这里只做类型与 RobotLevel 转换。
import type { RobotLevel } from '@engines/board/core/types';
import { easyOf } from '@engines/board/core/errormodel';
import data from '../../../../content/xiangqi/robots.v1.json';

export interface RobotInfo { id: string; name: string; trait: string; tell: string; sfx: string; look: string; level: RobotLevel; easy: RobotLevel }
const COACH_CAP = [3, 3, 2, 1, 1, 0];

interface RawRobot { id: string; name: string; depth: number; nodes: number; slip: number; pcap?: number; glanceMargin: number; glanceTemp: number; temp: number; margin: number; mateSight: number; resign?: { afterPly: number; behind: number }; trait: string; tell: string; sfx: string; look: string; glanceGuard?: number; easy?: Partial<RobotLevel> }
export const ROBOTS: readonly RobotInfo[] = (data.robots as RawRobot[]).map((r, i) => {
  const level: RobotLevel = { id: r.id, depth: r.depth, nodes: r.nodes, slip: r.slip, glanceMargin: r.glanceMargin, glanceTemp: r.glanceTemp, temp: r.temp, margin: r.margin, mateSight: r.mateSight, ...(r.pcap !== undefined ? { pcap: r.pcap } : {}), ...(r.resign ? { resign: r.resign } : {}), coachCap: COACH_CAP[i] ?? 0, look: { text: r.look, tell: r.tell, ...(r.glanceGuard !== undefined ? { glanceGuard: r.glanceGuard } : {}) } };
  return { id: r.id, name: r.name, trait: r.trait, tell: r.tell, sfx: r.sfx, look: r.look, level, easy: easyOf(level) };
});
export const robotById = (id: string): RobotInfo => ROBOTS.find((r) => r.id === id) ?? ROBOTS[0];
