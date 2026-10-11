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

export interface ActiveAddition {
  nodeId: string;
  seed: number;
  index: number;
  draft: string;
  firstPart?: number;
  secondPart?: number;
  carry?: number;
  method?: 'place' | 'round';
  methodReady?: boolean;
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
  activeArea?: 'orbit' | 'cert' | 'addition';
  completed: string[];
  skipped: string[];
  active?: ActiveOrbit;
  calibrations: { nodeId: string; at: number; score: CalibrationScore }[];
  cert: { completed: string[]; active?: ActiveC1 };
  addition: { completed: string[]; active?: ActiveAddition };
}

export const orbitStore = createStore<OrbitSave>('mars-base', {
  version: 3,
  defaults: () => ({ onboardingDone: false, completed: [], skipped: [], calibrations: [], cert: { completed: [] }, addition: { completed: [] } }),
  migrate: (old, from) => {
    if (!old || typeof old !== 'object') throw new Error('Unsupported Mars save');
    if (from === 1) return { ...(old as Omit<OrbitSave, 'cert' | 'addition'>), cert: { completed: [] }, addition: { completed: [] } };
    if (from === 2) return { ...(old as Omit<OrbitSave, 'addition'>), addition: { completed: [] } };
    throw new Error('Unsupported Mars save');
  },
});

export function updateHub(save: OrbitSave): void {
  const finished = save.completed.length;
  const built = finished + save.cert.completed.length + save.addition.completed.length;
  setHubProgress('mars-base', { label: built ? `轨道 ${finished}/11 · 位值 ${save.cert.completed.length}/6 · 加法 ${save.addition.completed.length}/8` : '基地待建造', value: built / 25 });
}
