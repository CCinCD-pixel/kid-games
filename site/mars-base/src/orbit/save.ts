import { createStore, setHubProgress } from '@kit/progress';
import type { CalibrationScore } from './model';

export interface ActiveOrbit {
  nodeId: string;
  seed: number;
  index: number;
  draft?: number;
  attempts: number;
  zoomStage?: 0 | 1 | 2;
  estimates: number[];
  firstTry: boolean[];
}

export interface OrbitSave {
  onboardingDone: boolean;
  completed: string[];
  skipped: string[];
  active?: ActiveOrbit;
  calibrations: { nodeId: string; at: number; score: CalibrationScore }[];
}

export const orbitStore = createStore<OrbitSave>('mars-base', {
  version: 1,
  defaults: () => ({ onboardingDone: false, completed: [], skipped: [], calibrations: [] }),
});

export function updateHub(save: OrbitSave): void {
  const finished = save.completed.length;
  setHubProgress('mars-base', { label: finished ? `轨道站 ${finished}/11 站` : '基地待建造', value: finished / 11 });
}
