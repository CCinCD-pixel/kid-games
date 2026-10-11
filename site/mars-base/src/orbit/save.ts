import { createStore, setHubProgress } from '@kit/progress';
import type { CalibrationScore } from './model';
import type { TrayState } from '@engines/manip/tray';

export interface ActiveC1 {
  nodeId: string;
  seed: number;
  index: number;
  draft: string;
  symbol?: '>' | '<' | '=';
  decisive?: 'tens' | 'ones';
  tray?: TrayState;
  trayBefore?: TrayState;
  attempts: number;
  firstTry: boolean[];
  lastCorrect?: boolean;
}

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
  cert: { completed: string[]; active?: ActiveC1 };
}

export const orbitStore = createStore<OrbitSave>('mars-base', {
  version: 2,
  defaults: () => ({ onboardingDone: false, completed: [], skipped: [], calibrations: [], cert: { completed: [] } }),
  migrate: (old, from) => {
    if (from !== 1 || !old || typeof old !== 'object') throw new Error('Unsupported Mars save');
    const previous = old as Omit<OrbitSave, 'cert'>;
    return { ...previous, cert: { completed: [] } };
  },
});

export function updateHub(save: OrbitSave): void {
  const finished = save.completed.length;
  setHubProgress('mars-base', { label: finished || save.cert.completed.length ? `轨道 ${finished}/11 · 位值 ${save.cert.completed.length}/6` : '基地待建造', value: (finished + save.cert.completed.length) / 17 });
}
