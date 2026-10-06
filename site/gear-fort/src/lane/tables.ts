// 机关守城 · lane core — unit / machine / boss tables, read from content/gear-fort/{units,enemies,bosses}.json
// (exported verbatim from the prototype's content.mjs and boss.mjs CFG). The kernel only uses the numeric and
// tag fields; names, stamps and texts belong to the theme pack.
import UNITS_JSON from '../../../../content/gear-fort/units.json';
import ENEMIES_JSON from '../../../../content/gear-fort/enemies.json';
import BOSSES_JSON from '../../../../content/gear-fort/bosses.json';
import { SWARM_N } from './rules';

export interface UnitDef {
  beh: string; role: string; cost: number; cd: number; hp: number;
  period?: number; dmg?: number; dtype?: string; boltSpeed?: number; first?: number; amt?: number; amtNight?: number;
  startCd?: number; flight?: number; wear?: number; slowPct?: number; jam?: number; flat?: boolean; arm?: number;
  stuck?: number; radius?: number; delay?: number; range?: number; ramp?: number[]; build?: number; travel?: number;
  push?: number | Record<string, number>; down?: number; fireMulPct?: number; reach?: number; heal?: number;
  fortPct?: number; pay?: Record<string, number>;
  v1?: boolean; unlock?: string;
}
export interface EnemyDef {
  mat: string; wt: string; layer: string; hp: number; speed: number; threat: number; traits: string[];
  shield?: number; shieldMat?: string; shieldArmor?: number; armor?: number; bite?: number; peck?: number;
  speedMax?: number; runFull?: number; impactMin?: number; impactMax?: number; recoil?: number; recoilTicks?: number;
  cloudEvery?: number; cloudFirst?: number; cloudDur?: number; ladderHp?: number; raise?: number; pinMax?: number;
  auraPct?: number; auraDef?: number; auraDx?: number; follow?: number; hookTicks?: number; carry?: number;
  speedUp?: number; dig?: number; summonEvery?: number; summonMax?: number;
  v1?: boolean; intro?: string; fears?: string[]; must?: string[];
}

export const UNITS = UNITS_JSON as unknown as Record<string, UnitDef>;
export const ENEMIES = ENEMIES_JSON as unknown as Record<string, EnemyDef>;
export const CARD_IDS = Object.keys(UNITS);
/** Unit field that must exist (kernel invariant): the behaviour table lookup with a typed non-null result. */
export const U = (k: string): UnitDef => UNITS[k];
export const E = (k: string): EnemyDef => ENEMIES[k];
export const KIND_THREAT = (k: string): number => (k === 'swarm' ? ENEMIES.ant.threat * SWARM_N : ENEMIES[k].threat);
/** card id → 'vol-idx' of the level that unlocks it. */
export const CARD_UNLOCK: Record<string, string> = Object.fromEntries(Object.entries(UNITS).map(([k, v]) => [k, v.unlock ?? '9-9']));

export interface RhinoCfg {
  lane: number; hp: number; p2At: number; body: number; armor: number; hatchN: number; speed: number[];
  hornEvery: number[]; hornDmg: number[]; crackBlunt: number; crackLight: number; crackStrike: number; crackLog: number;
  crackMax: number; shellStun: number; shellClose: number; hatchEvery: number; hatchLanes: number[]; chargeEvery: number;
  tele: number; dashDist: number; dashSpeed: number; dashWallDmg: number; spikeStun: number; firstCharge: number;
  shellPatience: number; shellRampEvery: number;
}
export interface OwlCfg {
  dawnAt: number; walkAfterDawn: number; walkSpeed: number; landBite: number; hp: number; hoverX: number; body: number;
  laneEvery: number; shadow: number; swoopEvery: number; firstSwoop: number; swoopTele: number; swoop: number;
  swoopHit: number; down: number; downMulPct: number; bombEvery: number; firstBomb: number; bombDur: number;
  birdsEvery: number; firstBirds: number; birds: number; birdOffsets: number[]; chickHp: number; highMulPct: number;
  rageAt: number; rageSwoop: number; rageBirds: number; rageOffsets: number[];
}
export interface ShipCfg {
  lanes: number[]; speed: number; anchorX: number; partHp: number; hullHp: number; armEvery: number; armReach: number;
  dockEvery: number; drumPct: number; hookPush: number; drumBehind: number; hullOffset: number;
}
export interface FortressCfg {
  setup: number; preview: number; moveLen: number; coreHp: number; finale: number; floodLanes: number[];
  floodDur: number; smokeCols: number[]; smokeLanes: number[];
}
export interface MoveDef { id: string; name: string; spawns: [number, number, string][]; counters: string[]; flood?: boolean; smokeWall?: boolean }

const B = BOSSES_JSON as unknown as {
  assistHpPct: number; rhino: RhinoCfg; owl: OwlCfg; ship: ShipCfg; fortress: FortressCfg & { moves: MoveDef[] };
};
export const BOSS_CFG = { rhino: B.rhino, owl: B.owl, ship: B.ship, fortress: B.fortress };
export const MOVES: MoveDef[] = B.fortress.moves;
