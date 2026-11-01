/** Test helper: run the kit's own clamp over our metric items (what the parent page will actually receive). */
import { normalizeItem, type MetricItem } from '@kit/metrics';
export const normalizeMetrics = (items: readonly unknown[]): MetricItem[] => items.map((x) => normalizeItem(x)).filter((x): x is MetricItem => !!x);
