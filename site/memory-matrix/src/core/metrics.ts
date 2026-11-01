// The three numbers the parent page shows (spec §10.3 / DoD 8): never shown to the child, never fed back into difficulty, stars or unlocks, no age norms.
import { registerMetrics, type MetricReading } from '@kit/metrics';
import { SECTOR_IDS, type Save, type SectorId } from './session';

export const SECTOR_ZH: Record<SectorId, string> = { s1: '记星星', s2: '追流星', s3: '送回家', s4: '照镜子' };
export const SECTOR_LONG: Record<SectorId, string> = { s1: '星座复刻', s2: '流星轨迹', s3: '星球住户', s4: '镜像' };
const pct = (x: number) => `${Math.round(100 * x)}%`;
const BAND = (r: number) => (r < 0.7 ? '偏难' : r > 0.92 ? '偏易' : '合适');

/** ① where each open sector's first-try rate (last 20 rounds) falls; a gentle note after 3 bad nights in a row. */
export function bandMetric(save: Save): MetricReading | null {
  const parts: string[] = []; let tot = 0, ok = 0, watch = false;
  for (const s of SECTOR_IDS) {
    const sec = save.sectors[s], h: string = sec.last20 ?? '';
    if (h.length >= 8) { const r = [...h].filter((c) => c === 'p').length / h.length; parts.push(`${SECTOR_ZH[s]}${BAND(r)}`); tot += h.length; ok += [...h].filter((c) => c === 'p').length; }
    if (sec.badStreak >= 3 || sec.tracks.some((t: { park: number }) => t.park > 0)) watch = true;
  }
  if (!tot) return null;
  const r = ok / tot;
  return { value: `${BAND(r)} ${pct(r)}`, frac: r, detail: parts.join(' · ').slice(0, 48), status: watch ? 'watch' : 'ok', hint: watch ? '这一块有点吃力，可以陪他玩一次' : undefined };
}
/** ② breadth: the biggest thing he got right on the first try, per sector (clumps and scatter separately; the mirror: left-right / up-down rates and the highest 看着 / 记着 level). */
export function breadthMetric(save: Save): MetricReading | null {
  const a = save.sectors.s1.span, b = save.sectors.s2.span, c = save.sectors.s3.span, d = save.sectors.s4.span;
  if (!a.cl && !a.sc && !b.fwd && !c.n && !d.seeD) return null;
  const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  const f = (x?: unknown): string => (Array.isArray(x) && num(x[0]) ? pct(num(x[1]) / num(x[0])) : '–');
  const see = num(d.seeD), peek = num(d.peekD);
  const value = `星${Math.max(num(a.cl), num(a.sc))} 流${Math.max(num(b.fwd), num(b.bwd))} 家${Math.max(num(c.n), num(c.nv))}${see ? ` 镜${see}/${peek}` : ''}`;
  // detail <= 48 characters, cut between tokens (never inside one)
  const toks = [`团${num(a.cl)}散${num(a.sc)}`, `顺${num(b.fwd)}倒${num(b.bwd)}`, `访客${num(c.nv)}`, `镜左右${f(d.LR)}上下${f(d.UD)}`, see ? `看${see}记${peek}` : ''].filter(Boolean);
  let detail = ''; for (const t of toks) { const nx = detail ? `${detail} ${t}` : t; if ([...nx].length > 48) break; detail = nx; }
  return { value: value.slice(0, 16), status: 'note', detail };
}
/** ③ look-again rate: the free first look and the second look, separately. */
export function lookMetric(save: Save): MetricReading | null {
  let n = 0, one = 0, two = 0;
  for (const s of SECTOR_IDS) { const st = save.sectors[s].stats; n += st.rounds; one += st.rewatch; two += st.rw2 ?? 0; }
  if (n < 6) return null;
  return { value: `${pct(one / n)} / ${pct(two / n)}`, frac: one / n, status: 'note', detail: '第一眼免费 / 第二眼；第二眼会让这回合不算一次过' };
}

export function registerParentMetrics(getSave: () => Save): { refresh(): void } {
  return registerMetrics('memory-matrix', [
    { id: 'band', label: '近期做对率', value: () => bandMetric(getSave()) },
    { id: 'breadth', label: '广度趋势', value: () => breadthMetric(getSave()) },
    { id: 'look', label: '再看一眼率', value: () => lookMetric(getSave()) },
  ]);
}
