import { describe, expect, it } from 'vitest';
import {
  evaluateMetrics, listMetricsSummaries, METRICS_MAX_BYTES, metricsKey, normalizeItem, normalizeSummary, readMetricsSummary, registerMetrics, writeMetricsSummary,
} from '../../kit/metrics';
import { metricCards } from '../../site/parent/src/stats';
import { MemoryStorage } from '../helpers/memory-storage';

describe('kit/metrics', () => {
  it('writes, reads and lists per-game summaries', () => {
    const st = new MemoryStorage();
    expect(writeMetricsSummary('xiangqi', { metrics: [{ id: 'lessons', label: '课程进度', value: '12 / 33', frac: 12 / 33, status: 'ok' }] }, { storage: st, now: () => 5 })).toBe(true);
    expect(JSON.parse(st.getItem('kg:metrics:v1:xiangqi')!)).toEqual({ v: 1, updatedAt: 5, metrics: [{ id: 'lessons', label: '课程进度', value: '12 / 33', frac: 0.364, status: 'ok' }] });
    expect(readMetricsSummary('xiangqi', st)?.metrics[0].value).toBe('12 / 33');
    writeMetricsSummary('chess', { metrics: [{ id: 'a', label: 'A', value: 1 }] }, { storage: st });
    st.setItem('kg:v1:other', '{}');
    expect(Object.keys(listMetricsSummaries(st)).sort()).toEqual(['chess', 'xiangqi']);
    expect(() => metricsKey('Bad Id')).toThrow();
  });

  it('clamps and sanitises untrusted content', () => {
    expect(normalizeItem({ id: 'ok-1', label: '很长'.repeat(20), value: 7, frac: 4, detail: ' a  b ', status: 'bad', hint: 'x'.repeat(80) })).toEqual({
      id: 'ok-1', label: '很长'.repeat(8), value: '7', frac: 1, detail: 'a b', hint: 'x'.repeat(48),
    });
    expect(normalizeItem({ id: 'Bad', label: 'a', value: 'b' })).toBeNull();
    expect(normalizeItem({ id: 'a', label: '', value: 'b' })).toBeNull();
    expect(normalizeSummary({ v: 2, metrics: [] })).toBeNull();
    const many = normalizeSummary({ v: 1, updatedAt: 1, metrics: ['a', 'b', 'c', 'd', 'a'].map((id) => ({ id, label: id, value: id })) });
    expect(many?.metrics.map((m) => m.id)).toEqual(['a', 'b', 'c']); // ≤ 3, no duplicate ids
  });

  it('drops the raw data first when over 4 KB, and refuses empty / newer-format writes', () => {
    const st = new MemoryStorage();
    const items = [{ id: 'a', label: 'A', value: '1' }];
    expect(writeMetricsSummary('big', { metrics: items, data: { blob: 'x'.repeat(METRICS_MAX_BYTES) } }, { storage: st })).toBe(true);
    const s = readMetricsSummary('big', st)!;
    expect(s.data).toBeUndefined();
    expect(st.getItem('kg:metrics:v1:big')!.length).toBeLessThanOrEqual(METRICS_MAX_BYTES);
    writeMetricsSummary('small', { metrics: items, data: { pae: [1, 2, 3] } }, { storage: st });
    expect(readMetricsSummary('small', st)?.data).toEqual({ pae: [1, 2, 3] });
    expect(writeMetricsSummary('empty', { metrics: [] }, { storage: st })).toBe(false);
    st.setItem('kg:metrics:v1:future', JSON.stringify({ v: 9, metrics: [] }));
    expect(writeMetricsSummary('future', { metrics: items }, { storage: st })).toBe(false);
    expect(st.getItem('kg:metrics:v1:future')).toContain('"v":9');
  });

  it('registerMetrics evaluates defs, skips empty / throwing ones, validates ≤ 3 + unique ids', () => {
    const st = new MemoryStorage();
    let rate: number | null = null;
    const handle = registerMetrics('mars-base', [
      { id: 'rate', label: '首次做对率', value: () => (rate === null ? null : { value: `${Math.round(rate * 100)}%`, frac: rate, status: rate < 0.4 ? 'watch' : 'ok', hint: rate < 0.4 ? '这一块有点吃力，可以陪他玩一次' : undefined }) },
      { id: 'boom', label: '会抛错', value: () => { throw new Error('x'); } },
      { id: 'level', label: '关卡', value: () => ({ value: '第 3 关' }) },
    ], { storage: st, now: () => 9 });
    expect(readMetricsSummary('mars-base', st)?.metrics.map((m) => m.id)).toEqual(['level']);
    rate = 0.25;
    expect(handle.refresh()).toBe(true);
    const got = readMetricsSummary('mars-base', st)!;
    expect(got.metrics.map((m) => [m.id, m.status])).toEqual([['rate', 'watch'], ['level', undefined]]);
    expect(got.metrics[0].hint).toBe('这一块有点吃力，可以陪他玩一次');
    expect(evaluateMetrics([{ id: 'x', label: 'x', value: () => undefined }])).toEqual([]);
    expect(() => registerMetrics('g', [], { storage: st })).toThrow();
    expect(() => registerMetrics('g', ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id, value: () => ({ value: 1 }) })), { storage: st })).toThrow();
    expect(() => registerMetrics('g', [{ id: 'a', label: 'a', value: () => null }, { id: 'a', label: 'b', value: () => null }], { storage: st })).toThrow();
    handle.dispose();
  });

  it('parent metric cards follow registry order and collect watch hints', () => {
    const st = new MemoryStorage();
    writeMetricsSummary('chess', { metrics: [{ id: 'a', label: '对局', value: '3 胜', status: 'ok' }, { id: 'b', label: '一步杀', value: '30%', status: 'watch', hint: '有点吃力' }] }, { storage: st });
    writeMetricsSummary('xiangqi', { metrics: [{ id: 'a', label: '课程', value: '1' }] }, { storage: st });
    writeMetricsSummary('unknown-game', { metrics: [{ id: 'a', label: 'A', value: '1' }] }, { storage: st });
    const cards = metricCards([{ id: 'xiangqi', title: '楚河棋院' }, { id: 'snake-battle', title: '贪吃蛇' }, { id: 'chess', title: '棋手学院' }], listMetricsSummaries(st));
    expect(cards.map((c) => c.game)).toEqual(['xiangqi', 'chess']);
    expect(cards[1].watch.map((m) => m.id)).toEqual(['b']);
    expect(cards[0].watch).toEqual([]);
  });
});
