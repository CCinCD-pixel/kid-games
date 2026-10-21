/**
 * The crystal tray view (spec §3.8.2): carts → tray (箱 / 棒 / 颗, 9 slots each + a machine entry for the 10th) → press / pack machines,
 * cut tools (棒 → 10 颗, 箱 → 10 棒 on a staging tray / rack), a shipping pile (拿走), undo / reset. The model is engines/manip/tray.ts;
 * this file only draws it and routes taps. Hints: H1 glow the next useful control, H2 pre-fill half the plan, H3 the whole plan with the
 * ghost hand. Delivery rule: staging empty and nothing waiting at a machine (reported through `blocked`).
 */
import { ghostTap } from '@kit/ui';
import { cloneTray, isCanonical, newLog, readyToShip, trayDo, trayReset, trayStep, trayUndo, trayValue, type CartId, type TrayAction } from '@engines/manip/tray';
import type { Answer } from '../app/types';
import { boxIcon, gemIcon, rodIcon } from '../art/crystals';
import { el, isAutomated, playPlan, reducedMotion, sleep, unitOf, type StageCtx, type StageHandle } from './common';

import { trayConfig, trayPlan, type TrayCfg, type TrayMode } from './trayPlan';
export { trayConfig, trayPlan };
export type { TrayCfg, TrayMode };

export function trayStage(c: StageCtx, cfg: TrayCfg, compactReadOnly = false): StageHandle {
  let state = cloneTray(cfg.start); let log = newLog(); let locked = false; let auto = false; let tool: 'take' | 'cut' = 'take'; let alive = true; let u = unitOf(c.w, c.h);
  // auto: the H2 / H3 ghost play is running (QA fix-mars-r2: a ✓ pressed while it ran used to reset + replay it on top of itself)
  const root = el('div', 'tr'); root.dataset.mode = cfg.mode; root.dataset.three = cfg.three ? '1' : '0';
  const cartList: CartId[] = (['box', 'rod', 'crystal'] as CartId[]).filter((k) => cfg.start.carts[k] > 0);
  const read = el('div', 'tr-read');
  // the unit is also capped so that NINE rods fit side by side in one bin (each piece button is >= 44 px wide for the finger, the picture keeps its size; nothing may overflow the bin)
  const fit = () => { const bins = cfg.three ? 3 : 2; u = Math.max(13, Math.min(unitOf(c.w, c.h), Math.floor(((c.w - 28) / bins - 24) / 5.7))); root.style.setProperty('--u', `${u}px`); };

  /** QA fix-mars-r1: the piece BUTTON is at least 44 x 44 (the picture inside keeps its size, negative margins give the layout back what the padding takes), so a finger — and the audit — always meets a real target */
  const hitMargin = (kind: 'crystal' | 'rod' | 'box'): string => { const w = kind === 'crystal' ? Math.round(u * 1.15) : kind === 'rod' ? Math.round(u * 0.62) : Math.round(u * 1.5); const h = kind === 'crystal' ? w : kind === 'rod' ? Math.round(u * 3.1) : w; const mx = Math.min(0, (w - 44) / 2), my = Math.min(0, (h - 44) / 2); return mx || my ? ` style="margin:${my}px ${mx}px"` : ''; };
  const items = (kind: 'crystal' | 'rod' | 'box', n: number, extra = ''): string => Array.from({ length: n }, (_, i) =>
    `<button type="button" class="tr-it ${extra}" data-kind="${kind}" data-i="${i}"${hitMargin(kind)} aria-label="${kind === 'crystal' ? '颗' : kind === 'rod' ? '棒' : '箱'}">${kind === 'crystal' ? gemIcon(Math.round(u * 1.15)) : kind === 'rod' ? rodIcon(Math.round(u * 0.62), Math.round(u * 3.1)) : boxIcon(Math.round(u * 1.5))}</button>`).join('');
  const entry = (n: 0 | 1, kind: 'crystal' | 'rod'): string => `<div class="tr-entry${n ? ' is-wait' : ''}" data-entry="${kind}">${n ? items(kind, 1, 'tr-entry-it') : ''}</div>`;
  const legal = (a: TrayAction) => !!trayStep(state, a);

  function render(flash?: string): void {
    const s = state;
    const carts = cartList.map((k) => `<button type="button" class="tr-cart" data-cart="${k}" ${s.carts[k] <= 0 || locked ? 'disabled' : ''} aria-label="${k === 'crystal' ? '颗车' : k === 'rod' ? '棒车' : '箱车'}"><span class="tr-cart-art">${k === 'crystal' ? gemIcon(Math.round(u * 1.2)) : k === 'rod' ? rodIcon(Math.round(u * 0.6), Math.round(u * 1.6)) : boxIcon(Math.round(u * 1.3))}</span><b class="tr-cart-n">${s.carts[k]}</b></button>`).join('');
    const toolsHtml = (cfg.tools ? `<button type="button" class="tr-tool${tool === 'take' ? ' is-on' : ''}" data-tool="take" aria-label="拿走">拿走</button><button type="button" class="tr-tool${tool === 'cut' ? ' is-on' : ''}" data-tool="cut" aria-label="切开">切开</button>` : '')
      + `<button type="button" class="tr-tool tr-ico" data-act="undo" aria-label="撤销" ${log.past.length && !locked ? '' : 'disabled'}>↶</button><button type="button" class="tr-tool tr-ico" data-act="reset" aria-label="重来" ${log.past.length && !locked ? '' : 'disabled'}>⟲</button>`;
    const bins = (cfg.three ? `<section class="tr-bin" data-bin="box"><h4>箱</h4><div class="tr-slots tr-slots--box">${items('box', s.boxes)}${s.vault1000 ? '<b class="tr-vault">仓满</b>' : ''}</div><div class="tr-foot"></div></section>` : '')
      + `<section class="tr-bin" data-bin="rod"><h4>棒</h4>${cfg.three ? entry(s.packEntry, 'rod') : ''}<div class="tr-slots tr-slots--rod">${items('rod', s.rods)}</div><div class="tr-foot">${cfg.three ? `<button type="button" class="tr-mach" data-m="pack" ${legal({ op: 'pack' }) && !locked ? '' : 'disabled'}>装箱机</button>` : ''}</div></section>`
      + `<section class="tr-bin" data-bin="crystal"><h4>颗</h4>${entry(s.pressEntry, 'crystal')}<div class="tr-slots tr-slots--gem">${items('crystal', s.crystals)}</div><div class="tr-foot"><button type="button" class="tr-mach" data-m="press" ${legal({ op: 'press' }) && !locked ? '' : 'disabled'}>压棒机</button></div></section>`;
    const stg = (s.cutBundles || s.stagedCrystals || s.cutBoxes || s.stagedRods)
      ? `<div class="tr-stg" aria-label="暂存盘">${s.cutBoxes ? `<button type="button" class="tr-stg-b" data-act="openBoxBundle">${boxIcon(Math.round(u * 1.2))}<i>打开</i></button>` : ''}${s.stagedRods ? `<div class="tr-stg-rack">${Array.from({ length: s.stagedRods }, () => `<button type="button" class="tr-stg-i" data-act="moveStagedRod">${rodIcon(Math.round(u * 0.5), Math.round(u * 1.5))}</button>`).join('')}</div>` : ''}`
        + `${s.cutBundles ? `<button type="button" class="tr-stg-b" data-act="openBundle">${rodIcon(Math.round(u * 0.6), Math.round(u * 1.6))}<i>打开</i></button>` : ''}${s.stagedCrystals ? `<div class="tr-stg-rack">${Array.from({ length: s.stagedCrystals }, () => `<button type="button" class="tr-stg-i" data-act="moveStaged">${gemIcon(Math.round(u * 0.9))}</button>`).join('')}</div>` : ''}</div>` : '';
    root.innerHTML = `<div class="tr-top"><div class="tr-carts">${carts}</div><div class="tr-tools">${toolsHtml}</div></div><div class="tr-tray">${bins}</div>${stg}`;
    const total = trayValue(s); const shipped = s.shipped;
    read.textContent = cfg.readout === 'live' ? (cfg.mode === 'sub' ? `${total}` : `${total}`) : ''; read.hidden = cfg.readout !== 'live';
    if (cfg.mode === 'sub' && cfg.readout === 'live') read.dataset.out = shipped ? `拿走 ${shipped}` : '';
    const top = root.querySelector('.tr-top') as HTMLElement; top.insertBefore(read, top.querySelector('.tr-tools'));   // QA fix-mars-r2: the readout is a member of the top row (carts | number | tools), never a floating pill that can lie on a cart or a tool
    if (flash) root.querySelector(flash)?.classList.add('is-pop');
    root.classList.toggle('is-locked', locked);
    root.querySelectorAll<HTMLButtonElement>('.tr-mach').forEach((b) => b.classList.toggle('is-glow', !b.disabled));
  }

  /** 压棒机 / 装箱机 must READ with the sound off: the ten pieces slide into the machine (a count "10 颗 → 1 棒"), it flashes, then the new part drops out (~0.9 s). Automation and reduced motion skip it. */
  async function machineHop(a: TrayAction): Promise<void> {
    const bin = root.querySelector(`.tr-bin[data-bin="${a.op === 'press' ? 'crystal' : 'rod'}"]`) as HTMLElement | null; if (!bin) return;
    bin.classList.add('is-merging'); const tag = el('div', 'tr-merge-tag', a.op === 'press' ? '10 颗 → 1 棒' : '10 棒 → 1 箱'); bin.append(tag);
    await sleep(620); bin.classList.remove('is-merging'); tag.classList.add('is-out'); setTimeout(() => tag.remove(), 700);
  }
  function apply(a: TrayAction, flash?: string): boolean | Promise<boolean> {
    if (locked) return false;
    const n = trayDo(log, state, a);
    if (!n) { root.classList.add('is-nope'); setTimeout(() => root.classList.remove('is-nope'), 300); return false; }
    const finish = (): boolean => { state = n; c.onOp(); c.sfx?.(a.op === 'press' || a.op === 'pack' ? 'ui-confirm' : a.op.startsWith('cut') ? 'ui-close' : 'ui-pop'); render(flash ?? (a.op === 'press' ? '[data-bin="rod"] .tr-slots' : a.op === 'pack' ? '[data-bin="box"] .tr-slots' : undefined)); if (a.op === 'press' || a.op === 'pack') root.querySelector(`.tr-bin[data-bin="${a.op === 'press' ? 'rod' : 'box'}"] .tr-slots .tr-it:last-child`)?.classList.add('is-drop'); return true; };
    if ((a.op === 'press' || a.op === 'pack') && !isAutomated() && !reducedMotion()) {
      // the model has moved (undo log) but the picture waits for the hop; taps are ignored meanwhile
      const was = locked; locked = true; return machineHop(a).then(() => { locked = was; return finish(); });
    }
    return finish();
  }
  root.addEventListener('click', (e) => {
    if (locked || auto) return; const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.cart) apply({ op: 'pour', cart: d.cart as CartId }, `[data-bin="${d.cart === 'rod' ? 'rod' : d.cart === 'box' ? 'box' : 'crystal'}"] .tr-slots`);
    else if (d.m) apply({ op: d.m as 'press' | 'pack' });
    else if (d.tool) { tool = d.tool as 'take' | 'cut'; render(); }
    else if (d.act === 'undo') { state = trayUndo(log, state); c.onOp(); render(); }
    else if (d.act === 'reset') { state = trayReset(log, state); c.onOp(); render(); }
    else if (d.act) apply({ op: d.act } as TrayAction);
    else if (t.classList.contains('tr-it') && !t.classList.contains('tr-entry-it') && cfg.tools) {
      const k = d.kind as CartId;
      if (tool === 'take') apply({ op: 'ship', part: k }); else if (k === 'rod') apply({ op: 'cutRod' }); else if (k === 'box') apply({ op: 'cutBox' });
    }
  });

  const result = (): number => trayValue(state);
  const handle: StageHandle = {
    input: cfg.mode === 'read' ? 'keypad' : 'self', layout: cfg.mode === 'read' ? 'keypad' : 'folded',
    collect: () => (cfg.mode === 'read' ? null : cfg.answer === 'build' ? { total: result(), canonical: isCanonical(state) } : result()),
    hasAnswer: () => cfg.mode === 'read' || cfg.answer === 'int' || result() > 0 || log.past.length > 0,
    blocked: () => (cfg.mode === 'read' ? null : auto ? 'mars.h3.wait' : state.stagedCrystals || state.cutBundles || state.stagedRods || state.cutBoxes ? 'mars.mis.deliverNudge' : state.pressEntry || state.packEntry ? 'mars.try.noCarry' : null),
    lock: (on) => { locked = on; render(); },
    hint(level, _answer: Answer) {
      root.classList.toggle('is-hinted', level >= 1);
      if (level === 1) {
        const m = (['press', 'pack'] as const).find((k) => legal({ op: k })); const cartK = cartList.find((k) => state.carts[k] > 0);
        const sel = m ? `.tr-mach[data-m="${m}"]` : cfg.mode === 'sub' ? '.tr-tools .tr-tool[data-tool], .tr-bin[data-bin="rod"] .tr-it' : cartK ? `.tr-cart[data-cart="${cartK}"]` : '.tr-bin';
        root.querySelectorAll(sel).forEach((e) => e.classList.add('is-glow'));
      } else if (level >= 2) autoplay(level === 2 ? 'half' : 'full').catch((e) => console.error('tray autoplay', e));
    },
    resize(w, h) { c.w = w; c.h = h; fit(); render(); },
    destroy() { alive = false; c.host.replaceChildren(); },
  };
  let chain: Promise<void> = Promise.resolve();   // H2's half play and an H3 that follows it run one after the other, never on top of each other
  const autoplay = (how: 'half' | 'full'): Promise<void> => (chain = chain.then(() => runAutoplay(how)));
  async function runAutoplay(how: 'half' | 'full'): Promise<void> {
    auto = true;
    try {
      state = trayReset(log, state); render(); log = newLog();
      const steps = trayPlan({ ...cfg, start: state }); const run = how === 'half' ? steps.slice(0, Math.max(1, Math.ceil(steps.length / 2))) : steps;
      await playPlan(run, async (a, i) => {
        if (how === 'full' && i < 2) { const t = pick(a); if (t) await ghostTap(t).catch(() => {}); }
        await apply(a);
      }, how === 'full' ? 260 : 150, () => alive);
    } finally { auto = false; }
  }
  const pick = (a: TrayAction): Element | null => {
    if (a.op === 'pour') return root.querySelector(`.tr-cart[data-cart="${a.cart}"]`);
    if (a.op === 'press' || a.op === 'pack') return root.querySelector(`.tr-mach[data-m="${a.op}"]`);
    if (a.op === 'ship') return root.querySelector(`.tr-bin[data-bin="${a.part}"] .tr-it`);
    return root.querySelector('.tr-stg-b, .tr-stg-i') ?? root.querySelector('.tr-bin[data-bin="rod"] .tr-it');
  };
  void sleep; void readyToShip; void compactReadOnly;
  fit(); render(); c.host.replaceChildren(root);
  if (/[?&]test=1/.test(location.search)) (window as any).__marsTray = { get state() { return state; }, get busy() { return auto; }, apply, plan: () => trayPlan({ ...cfg, start: cfg.start }), cfg, handle };
  return handle;
}
