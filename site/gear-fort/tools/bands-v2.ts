// Volume-2 type bands (proto/v1/bands.mjs TYPE2, verbatim): volume 2 is judged on K2h (the hint-taking K) with a wide K
// band, not on the volume-1 K / K+ / 2★ rules of content/gear-fort/bands.json. Shared by V7 (bands.quick) and V8 (bands.rest).
export const TYPE2: Record<string, { K2h: [number, number]; K: [number, number]; kpMin: number }> = {
  breather: { K2h: [70, 100], K: [65, 98], kpMin: 65 }, teach: { K2h: [60, 88], K: [45, 95], kpMin: 45 }, practice: { K2h: [55, 82], K: [35, 85], kpMin: 35 },
  conveyor: { K2h: [55, 88], K: [45, 92], kpMin: 45 }, test: { K2h: [45, 72], K: [25, 70], kpMin: 25 }, boss: { K2h: [40, 72], K: [20, 65], kpMin: 20 },
};
