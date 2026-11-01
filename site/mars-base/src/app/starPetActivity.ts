export const STAR_ACTIVITY_KEY = 'kg:metrics:v1:star-pets-activity';
const DAY = 86_400_000;
type Mode = 'idle' | 'pet' | 'mission';

export interface ActivityVisit {
  id: string;
  at: number;
  petMs: number;
  missionMs: number;
  sawPet: boolean;
  sawMission: boolean;
  missions: number;
  replays: number;
}
export interface ActivityData { v: 1; visits: ActivityVisit[]; collapsed: boolean }
const empty = (): ActivityData => ({ v: 1, visits: [], collapsed: false });

export function readStarActivity(storage?: Storage): ActivityData {
  try {
    const raw = JSON.parse((storage ?? localStorage).getItem(STAR_ACTIVITY_KEY) ?? 'null') as ActivityData | null;
    if (raw?.v === 1 && Array.isArray(raw.visits)) return {
      v: 1, collapsed: raw.collapsed === true,
      visits: raw.visits.filter((visit) => visit && typeof visit.id === 'string' && Number.isSafeInteger(visit.at)
        && Number.isFinite(visit.petMs) && Number.isFinite(visit.missionMs)
        && typeof visit.sawPet === 'boolean' && typeof visit.sawMission === 'boolean'
        && Number.isSafeInteger(visit.missions) && Number.isSafeInteger(visit.replays)).slice(-120),
    };
  } catch { /* observation cannot interrupt play */ }
  return empty();
}

export function activitySummary(data: ActivityData, now: number): {
  visits: number; petOnly: number; petMs: number; missionMs: number; missions: number; replays: number; collapse: boolean;
} {
  const recent = data.visits.filter((visit) => visit.at >= now - 14 * DAY && visit.at <= now);
  const week = (from: number, to: number) => recent.filter((visit) => visit.at >= from && visit.at < to);
  const first = week(now - 14 * DAY, now - 7 * DAY);
  const second = week(now - 7 * DAY, now + 1);
  const petOnly = (visits: ActivityVisit[]) => visits.filter((visit) => visit.sawPet && !visit.sawMission).length;
  // A few visits in both weeks avoid folding the entry after one unusual afternoon.
  const collapse = data.collapsed || first.length >= 3 && second.length >= 3
    && petOnly(first) / first.length > 0.35 && petOnly(second) / second.length > 0.35;
  return {
    visits: recent.length, petOnly: petOnly(recent),
    petMs: recent.reduce((sum, visit) => sum + visit.petMs, 0),
    missionMs: recent.reduce((sum, visit) => sum + visit.missionMs, 0),
    missions: recent.reduce((sum, visit) => sum + visit.missions, 0),
    replays: recent.reduce((sum, visit) => sum + visit.replays, 0), collapse,
  };
}

export class StarPetActivity {
  private data: ActivityData;
  private current: ActivityVisit | null = null;
  private mode: Mode = 'idle';
  private visible = true;
  private last = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(private storage?: Storage, private now: () => number = Date.now) {
    this.data = readStarActivity(storage);
  }
  begin(): void {
    const at = this.now();
    this.current = { id: `${at.toString(36)}.${Math.random().toString(36).slice(2, 8)}`, at,
      petMs: 0, missionMs: 0, sawPet: false, sawMission: false, missions: 0, replays: 0 };
    this.data.visits.push(this.current);
    this.data.visits = this.data.visits.slice(-120);
    this.last = at;
    this.visible = true;
    this.write();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 15_000);
  }
  private tick(): void {
    const at = this.now();
    if (this.current && this.visible) {
      const delta = Math.min(45_000, Math.max(0, at - this.last));
      if (this.mode === 'pet') this.current.petMs += delta;
      if (this.mode === 'mission') this.current.missionMs += delta;
      this.write();
    }
    this.last = at;
  }
  setVisible(visible: boolean): void { this.tick(); this.visible = visible; }
  setMode(mode: Mode): void {
    this.tick(); this.mode = mode;
    if (this.current && mode === 'pet') this.current.sawPet = true;
    if (this.current && mode === 'mission') this.current.sawMission = true;
    this.write();
  }
  mission(replay: boolean): void {
    if (!this.current) return;
    this.current.missions++;
    if (replay) this.current.replays++;
    this.write();
  }
  private write(): void {
    if (activitySummary(this.data, this.now()).collapse) this.data.collapsed = true;
    try { (this.storage ?? localStorage).setItem(STAR_ACTIVITY_KEY, JSON.stringify(this.data)); } catch { /* observation cannot interrupt play */ }
  }
}
