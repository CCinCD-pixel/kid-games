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

export interface ActiveSubtraction {
  nodeId: string;
  seed: number;
  index: number;
  draft: string;
  step?: string;
  borrowChoice?: boolean;
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
  activeArea?: 'orbit' | 'cert' | 'addition' | 'subtraction';
  completed: string[];
  skipped: string[];
  active?: ActiveOrbit;
  calibrations: { nodeId: string; at: number; score: CalibrationScore }[];
  cert: { completed: string[]; active?: ActiveC1 };
  addition: { completed: string[]; active?: ActiveAddition };
  subtraction: { completed: string[]; active?: ActiveSubtraction };
}

export const orbitStore = createStore<OrbitSave>('mars-base', {
  version: 4,
  defaults: () => ({ onboardingDone: false, completed: [], skipped: [], calibrations: [], cert: { completed: [] }, addition: { completed: [] }, subtraction: { completed: [] } }),
  migrate: (old, from) => {
    if (!old || typeof old !== 'object') throw new Error('Unsupported Mars save');
    if (from === 1) return { ...(old as Omit<OrbitSave, 'cert' | 'addition' | 'subtraction'>), cert: { completed: [] }, addition: { completed: [] }, subtraction: { completed: [] } };
    if (from === 2) return { ...(old as Omit<OrbitSave, 'addition' | 'subtraction'>), addition: { completed: [] }, subtraction: { completed: [] } };
    if (from === 3) return { ...(old as Omit<OrbitSave, 'subtraction'>), subtraction: { completed: [] } };
    throw new Error('Unsupported Mars save');
  },
});

export function updateHub(save: OrbitSave): void {
  const finished = save.completed.length;
  const built = finished + save.cert.completed.length + save.addition.completed.length + save.subtraction.completed.length;
  setHubProgress('mars-base', { label: built ? `轨${finished}/11 · 位${save.cert.completed.length}/6 · 加${save.addition.completed.length}/8 · 减${save.subtraction.completed.length}/8` : '基地待建造', value: built / 33 });
}
