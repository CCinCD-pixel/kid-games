import { describe, expect, it } from 'vitest';
import { CALIBRATION_TARGETS, ORBIT_NODES, evaluateOrbitItem, makeOrbitItems, scoreCalibration } from './model';

describe('orbit calibration', () => {
  it('scores linear and compressed placements', () => {
    const targets = [...CALIBRATION_TARGETS[100]];
    expect(scoreCalibration(100, targets, targets).pass).toBe(true);
    expect(scoreCalibration(100, targets, targets.map((v) => Math.round(v * 0.7 + 15))).pass).toBe(false);
    expect(scoreCalibration(1000, [...CALIBRATION_TARGETS[1000]], [...CALIBRATION_TARGETS[1000]]).pass).toBe(true);
  });

  it('builds deterministic and unique targets for every orbit node', () => {
    expect(ORBIT_NODES).toHaveLength(11);
    for (const node of ORBIT_NODES) {
      const a = makeOrbitItems(node, 12345);
      expect(a).toEqual(makeOrbitItems(node, 12345));
      expect(a).toHaveLength(node.kind === 'calib' ? 12 : 6);
      expect(a.every((item) => item.target > 0 && item.target < item.length)).toBe(true);
      if (node.id === 'orbit.O2.5') expect(a.every((item) => item.length === 1000 && item.tolerance === 0)).toBe(true);
    }
  });

  it('accepts close placements without calling them exact', () => {
    const item = { family: 'nl.place' as const, target: 50, length: 100 as const, anchors: [0, 100], tolerance: 4 };
    expect(evaluateOrbitItem(item, 53)).toBe('exact');
    expect(evaluateOrbitItem(item, 57)).toBe('close');
    expect(evaluateOrbitItem(item, 70)).toBe('retry');
  });
});
