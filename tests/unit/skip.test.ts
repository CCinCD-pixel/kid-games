import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSettings } from '@kit/settings';
import { createSkipController, shouldAutoSkip, SKIP_DELAY_MS } from '@kit/ui/skip';
import { MemoryStorage } from '../helpers/memory-storage';

// The DOM button (mountSkipButton) is checked in WebKit; this covers its timing / once-only core and
// the parent switch it reads.
describe('跳过 (kit/ui/skip)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('appears only after the delay (default 1.5 s) so a tapping child does not hit it', () => {
    const onShow = vi.fn();
    const onSkip = vi.fn();
    const c = createSkipController(onSkip, { onShow });
    expect(SKIP_DELAY_MS).toBe(1500);
    expect(c.state).toBe('waiting');
    expect(c.skip()).toBe(false); // a tap before it shows does nothing
    vi.advanceTimersByTime(1499);
    expect(onShow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(c.state).toBe('shown');
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('fires onSkip exactly once, however often it is tapped', () => {
    const onSkip = vi.fn();
    const c = createSkipController(onSkip, { delayMs: 300 });
    vi.advanceTimersByTime(300);
    expect(c.skip()).toBe(true);
    expect(c.skip()).toBe(false);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(c.state).toBe('done');
  });

  it('dispose before it shows cancels the reveal; dispose is idempotent', () => {
    const onShow = vi.fn();
    const onSkip = vi.fn();
    const c = createSkipController(onSkip, { delayMs: 1000, onShow });
    c.dispose();
    c.dispose();
    vi.advanceTimersByTime(5000);
    expect(onShow).not.toHaveBeenCalled();
    expect(c.skip()).toBe(false);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('dispose after it shows (the intro ended by itself) ignores later taps', () => {
    const onSkip = vi.fn();
    const c = createSkipController(onSkip, { delayMs: 0 });
    vi.advanceTimersByTime(0);
    expect(c.state).toBe('shown');
    c.dispose();
    expect(c.skip()).toBe(false);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('a bad delay falls back to the default; a negative one shows at once', () => {
    const a = createSkipController(() => {}, { delayMs: Number.NaN });
    vi.advanceTimersByTime(SKIP_DELAY_MS - 1);
    expect(a.state).toBe('waiting');
    vi.advanceTimersByTime(1);
    expect(a.state).toBe('shown');
    const b = createSkipController(() => {}, { delayMs: -50 });
    vi.advanceTimersByTime(0);
    expect(b.state).toBe('shown');
  });

  it('shouldAutoSkip() is the parent switch 跳过开场和教学 (default off)', () => {
    const st = new MemoryStorage();
    expect(shouldAutoSkip(st)).toBe(false);
    updateSettings({ skipIntros: true }, st);
    expect(shouldAutoSkip(st)).toBe(true);
    updateSettings({ skipIntros: false }, st);
    expect(shouldAutoSkip(st)).toBe(false);
  });
});
