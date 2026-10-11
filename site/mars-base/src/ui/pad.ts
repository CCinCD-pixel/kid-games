export function openNumericPad(root: HTMLElement, options: {
  value: string;
  maxLength?: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
}): void {
  const overlay = document.createElement('div');
  overlay.className = 'mb-pad-overlay';
  const pad = document.createElement('div');
  pad.className = 'mb-pad';
  const top = document.createElement('div');
  top.className = 'mb-pad__top';
  const readout = document.createElement('strong');
  readout.className = 'mb-pad__readout';
  readout.textContent = options.value || '?';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mb-button mb-pad__close';
  close.textContent = '关闭';
  close.addEventListener('click', () => overlay.remove());
  top.append(readout, close);
  const keys = document.createElement('div');
  keys.className = 'mb-pad__keys';
  let value = options.value;
  for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = `mb-button ${digit === '✓' ? 'mb-button--primary' : ''}`;
    key.textContent = digit;
    key.setAttribute('aria-label', digit === '⌫' ? '删除' : digit === '✓' ? '交付' : digit);
    key.addEventListener('click', () => {
      if (digit === '✓') { overlay.remove(); options.onSubmit(); return; }
      if (digit === '⌫') value = value.slice(0, -1);
      else if (value.length < (options.maxLength ?? 4)) value = value === '0' ? digit : value + digit;
      readout.textContent = value || '?';
      options.onChange(value);
    });
    keys.append(key);
  }
  pad.append(top, keys);
  overlay.append(pad);
  root.append(overlay);
}
