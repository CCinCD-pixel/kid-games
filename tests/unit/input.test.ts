import { describe, expect, it } from 'vitest';
import { classifyGesture, expandRect, nearest, pointInRect, PrimaryPointer, snapToGrid, swipeDirection } from '@kit/input';

const ev = (type: string, pointerId: number, extra: Partial<PointerEvent> = {}) =>
  ({ type, pointerId, isPrimary: true, pointerType: 'touch', button: 0, ...extra }) as PointerEvent;

describe('input helpers', () => {
  it('tap vs drag vs long press', () => {
    expect(classifyGesture(3, 4, 120)).toBe('tap'); // 5px
    expect(classifyGesture(8, 8, 120)).toBe('drag'); // 11.3px > 10
    expect(classifyGesture(0, 0, 900)).toBe('none');
    expect(classifyGesture(12, 0, 100, 16)).toBe('tap'); // custom slop
  });

  it('swipe direction needs a minimum distance', () => {
    expect(swipeDirection(40, 5)).toBe('right');
    expect(swipeDirection(-5, -60)).toBe('up');
    expect(swipeDirection(10, 12)).toBeNull();
  });

  it('hit slop grows a rect', () => {
    const r = { left: 10, top: 10, right: 30, bottom: 30 };
    expect(pointInRect({ x: 5, y: 20 }, r)).toBe(false);
    expect(pointInRect({ x: 5, y: 20 }, r, 6)).toBe(true);
    expect(expandRect(r, 2)).toEqual({ left: 8, top: 8, right: 32, bottom: 32 });
  });

  it('nearest respects the radius', () => {
    const slots = [{ x: 0, y: 0, id: 'a' }, { x: 100, y: 0, id: 'b' }];
    expect(nearest({ x: 70, y: 5 }, slots)?.id).toBe('b');
    expect(nearest({ x: 50, y: 80 }, slots, 40)).toBeNull();
  });

  it('snapToGrid returns the cell and its centre', () => {
    expect(snapToGrid({ x: 130, y: 20 }, 50)).toEqual({ col: 2, row: 0, x: 125, y: 25 });
    expect(snapToGrid({ x: 130, y: 70 }, 50, { x: 10, y: 10 })).toEqual({ col: 2, row: 1, x: 135, y: 85 });
  });

  it('PrimaryPointer ignores a second finger and secondary mouse buttons', () => {
    const gate = new PrimaryPointer();
    expect(gate.accept(ev('pointerdown', 1))).toBe(true);
    expect(gate.accept(ev('pointerdown', 2))).toBe(false); // palm / second finger
    expect(gate.accept(ev('pointermove', 2))).toBe(false);
    expect(gate.accept(ev('pointermove', 1))).toBe(true);
    gate.release(ev('pointerup', 1));
    expect(gate.active).toBe(false);
    expect(gate.accept(ev('pointerdown', 3, { pointerType: 'mouse', button: 2 }))).toBe(false);
    expect(gate.accept(ev('pointerdown', 4, { isPrimary: false }))).toBe(false);
  });
});
