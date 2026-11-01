export interface NumberLineValue { flag?: number }
export interface NumberLineOptions {
  min: number;
  max: number;
  anchors: number[];
  value?: NumberLineValue;
  readOnly?: boolean;
  onChange?: (value: NumberLineValue) => void;
}

export interface NumberLineControl {
  readonly value: NumberLineValue;
  set(value: NumberLineValue): void;
  lock(on: boolean): void;
  on(event: 'change' | 'op', callback: (value: NumberLineValue) => void): () => void;
  undo(): boolean;
  reset(): void;
  destroy(): void;
}

/** A native range input supplies touch, keyboard and screen-reader control over the visual rail. */
export function createNumberLine(host: HTMLElement, options: NumberLineOptions): NumberLineControl {
  const listeners = { change: new Set<(v: NumberLineValue) => void>(), op: new Set<(v: NumberLineValue) => void>() };
  const initial = { ...options.value };
  let current = { ...initial };
  let previous: NumberLineValue | null = null;
  let locked = false;
  const frame = document.createElement('div');
  frame.className = 'mb-line';
  const caption = document.createElement('div');
  caption.className = 'mb-line__caption';
  caption.textContent = '轨道';
  const ruler = document.createElement('div');
  ruler.className = 'mb-line__ruler';
  for (const anchor of options.anchors) {
    const tick = document.createElement('span');
    tick.className = 'mb-line__tick';
    tick.style.left = `${100 * (anchor - options.min) / (options.max - options.min)}%`;
    tick.textContent = String(anchor);
    ruler.append(tick);
  }
  const flag = document.createElement('div');
  flag.className = 'mb-line__flag';
  flag.setAttribute('aria-hidden', 'true');
  const lens = document.createElement('div');
  lens.className = 'mb-line__lens';
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'mb-line__input';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = '1';
  input.setAttribute('aria-label', '移动轨道上的旗');
  input.disabled = !!options.readOnly;
  frame.append(caption, ruler, flag, lens, input);
  host.replaceChildren(frame);

  const paint = () => {
    const position = current.flag;
    flag.hidden = position === undefined;
    lens.hidden = position === undefined || options.readOnly === true;
    if (position === undefined) return;
    const x = 100 * (position - options.min) / (options.max - options.min);
    flag.style.left = `${x}%`;
    lens.style.left = `${x}%`;
    lens.textContent = String(position);
    input.value = String(position);
    input.setAttribute('aria-valuetext', `${position}`);
  };
  const set = (value: NumberLineValue) => {
    current = { ...value };
    paint();
    options.onChange?.({ ...current });
    listeners.change.forEach((cb) => cb({ ...current }));
  };
  let dragStart: NumberLineValue | null = null;
  input.addEventListener('pointerdown', () => { dragStart = { ...current }; });
  input.addEventListener('input', () => {
    if (locked) return;
    if (!dragStart) dragStart = { ...current };
    set({ flag: Number(input.value) });
  });
  const finish = () => {
    if (dragStart?.flag !== current.flag && current.flag !== undefined) {
      previous = dragStart;
      listeners.op.forEach((cb) => cb({ ...current }));
    }
    dragStart = null;
  };
  input.addEventListener('change', finish);
  input.addEventListener('pointerup', finish);
  paint();
  return {
    get value() { return { ...current }; },
    set,
    lock(on) { locked = on; input.disabled = on || !!options.readOnly; },
    on(event, callback) { listeners[event].add(callback); return () => listeners[event].delete(callback); },
    undo() { if (!previous) return false; const last = previous; previous = null; set(last); return true; },
    reset() { previous = null; set(initial); },
    destroy() { frame.remove(); listeners.change.clear(); listeners.op.clear(); },
  };
}
