export type SpecialKind = 'row' | 'col' | 'bomb' | 'rainbow';
export type Orientation = 'row' | 'col';
export type ScreenName = 'menu' | 'levels' | 'game';
export type SparkShape = 'circle' | 'star' | 'diamond';

export interface LevelSpec {
  number: number;
  boardSize: number;
  kindCount: number;
  moves: number;
  goals: number[];
}

export interface Ladder {
  id: string;
  title: string;
  shortTitle: string;
  accent: string;
  description: string;
  pool: string[];
  levels: LevelSpec[];
}

export interface Tile {
  id: number;
  kind: string;
  special: SpecialKind | null;
}

export type BoardTile = Tile | null;

export interface GoalState {
  kind: string;
  target: number;
  collected: number;
}

export interface SolvedRecord {
  stars?: number;
  bestScore?: number;
}

export interface LadderProgress {
  unlocked: number;
  solved: Record<number, SolvedRecord>;
}

export interface ProgressState {
  ladders: Record<string, LadderProgress>;
}

export interface MatchGroup {
  kind: string;
  orientation: Orientation;
  indices: number[];
}

export interface CreationData {
  kind: string;
  special: SpecialKind;
}

export interface DragState {
  pointerId: number;
  index: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export interface ResultOptions {
  caption: string;
  score: string;
  detail: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryAction: () => void;
  secondaryAction: () => void;
}

export interface SwapOptions {
  fromDrag?: boolean;
}

export interface ClearMeta {
  comboLevel?: number;
  source?: 'match' | 'special' | 'rainbow';
  flashColor?: string;
  burstText?: string;
}

export interface RainbowSwapSet {
  clearSet: Set<number>;
  label: string;
  color: string;
}
