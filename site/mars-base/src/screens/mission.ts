/**
 * The mission screen (S2) — the ONE runner (spec §2.3, §3.2): order card, 通讯条 (the only text surface), a stage, answer + keypad, hint / replay.
 * It never judges: judge() (oracle) decides; itemMachine decides what the answer unlocks. All geometry comes from computeLayout.
 */
import { mountKeypad, icon, type KeypadHandle } from '@kit/ui';
import { sound } from '@kit/ui';
import { chime } from '@kit/ui/sfx-bridge';
import type { Companion } from '@kit/companion';
import { family } from '../families';
import { judge, toInt } from '../app/judge';
import { MachineState, initMachine, transition, hintKeyNote, type MachineEvent } from '../app/itemMachine';
import { backCell, cellAnswers, cellView, enterCell, newCells, rewindCells, type CellsState } from '../app/cellInput';
import { beginMission, dealNext, deliver, endMission, mainIndexOf, missionDone, missionMatches, resumeMission, totalSlots, type EndSummary, type MissionRun } from '../app/mission';
import { computeLayout, checkLayout, keyGeometry, layoutVars, vpOf, type LayoutKind } from '../app/layout';
import type { Answer, Item, Mode, Response } from '../app/types';
import { TRY_LINE, hintLine, lineText, orderLine } from '../voice/lines';
import { mountStage, type StageHandle } from '../stages';
import { playDemo, type DemoHandle } from '../stages/demo';
import type { DemoStep } from '../app/types';
import { IDLE_NUDGE_S } from '../app/tuning';
import type { App } from './app';
import { consequence } from '../diag/bugs';
import { ZONE_LABEL, worldSvg, zoneEmblem, type WorldZone } from '../art/world';
import { NODE_BY_ID, zoneOfNode } from '../app/content';
import type { MarsSaveV5 } from '../save/schema';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html = ''): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
/** Shrink a one-line text until it fits its box (never below `min` px): long orders on a 320–390 px phone must not be cut (V10 "text not cut"). */
const fitText = (e: HTMLElement, min: number): void => { e.style.fontSize = ''; let px = parseFloat(getComputedStyle(e).fontSize) || 16; while (e.scrollWidth > e.clientWidth + 1 && px > min) { px -= 1; e.style.fontSize = `${px}px`; } };
const releaseKitBack = (): void => { document.documentElement.style.removeProperty('--kit-back-x'); document.documentElement.style.removeProperty('--kit-back-y'); };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface MissionOpts { nodeId: string; probe?: boolean; /** 挑战订单 */ challenge?: boolean; noWarm?: boolean; /** 徽章墙 一起验货: verify these cards in one mission */ wall?: import('../app/types').CardId[] }
export async function playMission(app: App, o: MissionOpts): Promise<EndSummary | null> {
  const { save } = app;
  let run: MissionRun | null = missionMatches(save, o) ? resumeMission(save) : null;
  const resumed = !!run;
  if (!run) run = beginMission(save, o.nodeId, save.session.index, Date.now(), { probe: o.probe, noWarm: o.noWarm, wall: o.wall, challenge: o.challenge });
  const root = el('div', 'mb-mission'); app.screen(root, 'day');
  const zone: WorldZone = run.plan.kind === 'challenge' ? 'challenge' : run.plan.kind === 'wall' ? 'cert' : ((run.plan.probeZone ?? (NODE_BY_ID[run.plan.node] ? zoneOfNode(NODE_BY_ID[run.plan.node]) : 'orbit')) as WorldZone);
  const nodeTitle = run.plan.kind === 'challenge' ? lineText('mars.chal.title') : run.plan.kind === 'wall' ? '一起验货' : run.plan.kind === 'probe' ? '先试三单' : (NODE_BY_ID[run.plan.node]?.title ?? ZONE_LABEL[zone]);
  root.dataset.zone = zone;
  const ui = buildChrome(root);
  { const l0 = app.layoutInfo(); root.insertAdjacentHTML('afterbegin', worldSvg(zone, l0.width, l0.height)); ui.zoneIcon.innerHTML = zoneEmblem(zone); }
  const bot = app.mountBot(ui.bot, 40);
  let mounted: { stage: StageHandle | null; item: Item | null } = { stage: null, item: null };
  let keypad: KeypadHandle | null = null; let layoutKind: LayoutKind = 'keypad'; let cells: CellsState = newCells(0);   // multi-cell keypad answers: app/cellInput.ts (pure, unit-tested)
  const relayout = (kind: LayoutKind) => {
    layoutKind = kind; const l = app.layoutInfo(); const vp = vpOf(l.width, l.height);
    const L = computeLayout(vp, { t: l.safe.top, r: l.safe.right, b: l.safe.bottom, l: l.safe.left }, kind);
    for (const [k, v] of Object.entries(layoutVars(L, vp))) root.style.setProperty(k, v);
    document.documentElement.style.setProperty('--kit-back-x', `${L.reg.kitBack.x}px`); document.documentElement.style.setProperty('--kit-back-y', `${L.reg.kitBack.y}px`);   // kit 🏠 follows the layout's insets (kit token)
    root.dataset.kind = kind; root.dataset.cls = vp.cls; if (checkLayout(L, vp, kind).length) root.dataset.layoutWarn = '1'; else delete root.dataset.layoutWarn;
    return { L, vp };
  };
  const insetsNow = () => { const l = app.layoutInfo(); return { t: l.safe.top, r: l.safe.right, b: l.safe.bottom, l: l.safe.left }; };
  const stageHOf = (kind: LayoutKind): number => { const l = app.layoutInfo(); return computeLayout(vpOf(l.width, l.height), insetsNow(), kind).reg.stage.h; };
  const fitAll = () => { const se = window.innerWidth <= 330; fitText(ui.orderBig, se ? 12 : 15); fitText(ui.orderSmall, 11); fitText(ui.commText, se ? 11 : 12); };
  const offLayout = app.onLayout(() => { if (!root.isConnected) return; const { L } = relayout(layoutKind); mounted.stage?.resize(L.reg.stage.w, L.reg.stage.h); fitAll(); });
  if (resumed) app.say(bot, ui, 'mars.mis.resume'); else app.say(bot, ui, 'mars.mis.start');
  let cancelled = false; let abort: (() => void) | null = null;
  ui.mapBtn.onclick = () => { cancelled = true; app.saveNow(); abort?.(); app.goMap(); };

  // progress dots (main items; warm-ups hollow, cert items drawn as slips)
  // progress lives in the header pill (zone emblem + n / total) and in the bottom plaque; the order card stays one clean expression
  const paintDots = (idx: number) => {
    const total = run!.plan.slots.length; const now = Math.min(total, idx + 1);
    ui.zoneNum.textContent = `${now}/${total}`; ui.zoneTag.setAttribute('aria-label', `第 ${now} 单，共 ${total} 单`);
    ui.dots.replaceChildren(...run!.plan.slots.map((s, i) => { const d = el('i', `mb-dot${i < idx ? ' is-done' : i === idx ? ' is-now' : ''}`); d.dataset.kind = s.kind; return d; }));
  };

  const refit = () => { if (root.isConnected) fitAll(); }; void document.fonts?.ready.then(refit); document.fonts?.addEventListener?.('loadingdone', refit);   // the webfont is wider than the fallback: fit again once it is in
  const mo = new MutationObserver(() => fitText(ui.commText, 12)); mo.observe(ui.commText, { childList: true, characterData: true, subtree: true });
  /** everything that outlives the screen: layout callback, font listener, observer, the last stage (its pointer / timer handlers) — the soak gate (V11) watches DOM / listeners for exactly this */
  const cleanup = (): void => { offLayout(); document.fonts?.removeEventListener?.('loadingdone', refit); mo.disconnect(); mounted.stage?.destroy(); mounted = { stage: null, item: null }; delete (window as any).__marsItem; };   // __marsItem (test hook) holds the last item's closure: not past the mission
  const setLine = (id: string, vars?: Record<string, string | number>) => app.say(bot, ui, id, vars);

  for (;;) {
    const item = dealNext(save, run, Date.now());
    if (!item) break;
    await playItem(item);
    if (cancelled) { cleanup(); root.remove(); releaseKitBack(); return null; }
    app.saveNow();
  }
  const sum = endMission(save, run, Date.now());
  app.saveNow();
  cleanup(); root.remove(); releaseKitBack();
  return sum;

  async function playItem(item: Item): Promise<void> {
    const f = family(item.fam); const p = item.params as any; const correct = f.oracle(p, item.ask); const mode: Mode = item.mode;
    mounted.stage?.destroy(); keypad = null; cells = newCells(0);
    ui.answer.replaceChildren(); ui.keypad.replaceChildren(); delete ui.answer.dataset.cell;
    const orderId = orderLine(f, p, item.ask);
    ui.orderBig.textContent = f.prompt(p, item.ask).big; ui.orderSmall.textContent = '';   // the 通讯条 below says the same sentence: not twice
    ui.order.dataset.slot = item.slot ?? 'main';
    paintDots(missionIndex(run!, item));
    // first pass: mount the stage in a provisional layout to learn which kind it needs
    let { L } = relayout('keypad');
    const hk = stageHOf('keypad');
    const mk = (kind: LayoutKind) => { ({ L } = relayout(kind)); ui.stage.replaceChildren(); return mountStage({ item, fam: f, params: p, host: ui.stage, w: L.reg.stage.w, h: L.reg.stage.h, hk, onOp: () => machine('op'), onAnswer: (r) => void submit(r), say: (t) => void app.narrator.say(t, { interrupt: true }), sfx: (n) => sound(n as never) }, correct); };
    let stage = mk('keypad'); if (stage.layout !== 'keypad') { stage.destroy(); stage = mk(stage.layout); }
    if (stage.layout !== layoutKind) { const want = stage.layout; stage.destroy(); stage = mk(want); }   // the stage flipped between the two heights: settle on the layout it asks for now (stages decide on `hk`, so this is a safety net)
    mounted = { stage, item }; layoutKind = stage.layout; relayout(stage.layout); fitAll();
    const vp = app.vp();
    if (stage.layout === 'keypad') {
      const k = keyGeometry(L, vp) ?? keyGeometry(computeLayout(vp, insetsNow(), 'keypad'), vp)!;
      keypad = mountKeypad(ui.keypad, { maxLength: 4, layout: vp.cls === 'phone-p' ? '4x3' : '3x4', keySize: { w: k.w, h: k.h }, display: ui.answer.appendChild(el('div', 'xg-display')) as HTMLElement, onSubmit: (v) => { void onKeypadSubmit(v); return true; } });
    } else { const pl = el('div', 'mb-plaque-node', `<i aria-hidden="true">${zoneEmblem(zone)}</i><b></b>`); (pl.querySelector('b') as HTMLElement).textContent = nodeTitle; ui.answer.append(pl); }   // nothing is typed here: the strip says where we are
    ui.ok.hidden = stage.layout === 'keypad';
    app.say(bot, ui, orderId.id, orderId.vars);

    let lastDemo: DemoStep[] = []; let demoH: DemoHandle | null = null;
    let state: MachineState = initMachine(); let ops = 0; const diags: (import('../app/types').DiagClass | null)[] = []; let locked = false; let idleT: number | undefined;
    const armIdle = () => { clearTimeout(idleT); if (mode !== 'normal') return; idleT = window.setTimeout(() => { state = transition(state, 'idle', mode); setLine('mars.hint.idle'); ui.hintBtn.classList.add('is-glow'); }, IDLE_NUDGE_S * 1000); };
    const machine = (ev: MachineEvent) => { state = transition(state, ev, mode); armIdle(); };
    ui.keypad.onclick = () => machine('op');   // typing a digit is a real touch: the hint key may escalate afterwards
    /** multi-cell answers: show which cell is being filled (a visible chip on the answer box) and what the display holds (H3 shows the answer cell by cell, so ✓ ✓ ✓ finishes the item) */
    const paintCells = (override?: string): void => {
      if (!stage.cells || !keypad) return;
      const v = cellView(cells, stage.cells, state.hint >= 3 ? cellAnswers(correct, stage.cells.length) : null);
      ui.answer.dataset.cell = v.label; keypad.clear(); const show = override ?? v.display; if (show) keypad.value = show;
    };
    if (stage.cells) {
      cells = newCells(stage.cells.length); paintCells();
      // ⌫ on an EMPTY display goes back one cell (the capture phase runs before the kit's own ⌫ handler, which would then eat a digit of the restored value)
      keypad?.pad.addEventListener('click', (e) => {
        if (locked || (e.target as Element).closest<HTMLElement>('[data-key]')?.dataset.key !== 'del' || keypad?.value !== '') return;
        const b = backCell(cells); if (!b) return;
        e.stopPropagation(); machine('op'); cells = b.state; paintCells(b.display);
      }, true);
    }
    let resolveItem!: () => void; const done = new Promise<void>((r) => { resolveItem = r; });
    abort = resolveItem; armIdle();

    const keypadResponse = (v: string): Response => {
      if (stage.cells) { const n = toInt(v); return n === null ? null : [n]; }
      const n = toInt(v); return n;
    };
    async function onKeypadSubmit(v: string): Promise<void> {
      if (locked) return;
      if (stage.cells) {   // multi-cell answers: one value per submit, in the order of the cells; the LAST ✓ hands the whole list over and the cells rewind (cellInput.ts)
        const n = toInt(v); if (n === null) { void submit(null); return; }
        if (stage.pre && !stage.pre()) { shake(); setLine('mars.hint.touchFirst'); return; }
        const step = enterCell(cells, n); cells = step.state;
        if (!step.submit) { paintCells(); if (f.id.startsWith('col.')) setLine('mars.cell.tens'); else setLine(orderId.id, orderId.vars); return; }
        void submit([...(stage.pre?.() ?? []), ...step.submit]); return;   // col.* answers are [ones, tens]; mul.write [x, y]
      }
      void submit(keypadResponse(v));
    }
    const shake = () => { ui.answer.classList.add('is-shake'); setTimeout(() => ui.answer.classList.remove('is-shake'), 400); };
    async function submit(r: Response): Promise<void> {
      if (locked) return;
      const blockedLine = stage.blocked?.(); if (blockedLine) { shake(); setLine(blockedLine); return; }
      const verdict = judge(f, p, r, item.ask);
      if (verdict.empty) { machine('subEmpty'); shake(); setLine('mars.hint.fill'); return; }
      if (f.answer === 'open' && !verdict.ok && mode === 'normal') { setLine('mars.hint.needTry'); return; }   // breather orders are never wrong, only unfinished
      ops++;
      if (mode !== 'normal') {   // cert / probe / calibration: one attempt, deferred feedback
        machine(verdict.ok ? 'subRight' : 'subWrong'); diags.push(null);
        locked = true; stage.lock(true); sound('ui-confirm'); setLine(item.slot === 'cert' ? 'mars.cert.recv' : 'mars.cert.recv');
        const est = typeof r === 'number' ? r : undefined;
        finish(verdict.ok, est); await sleep(item.mode === 'calib' ? 350 : 650); resolveItem(); return;
      }
      if (verdict.ok) {
        machine('subRight'); locked = true; stage.lock(true);
        stage.feedback?.(r, correct);
        chime(Math.min(8, Math.max(0, app.streak++))); sound('correct');
        setLine(app.praiseFor(state, item)); ui.stage.classList.add('is-ok');
        finish(true); await sleep(f.id === 'nl.place' ? 1300 : 800); resolveItem(); return;
      }
      app.streak = Math.max(0, app.streak - 1);
      diags.push(verdict.diag); machine('subWrong'); sound('try-again');
      stage.feedback?.(r, correct); cells = rewindCells(cells); paintCells();
      const line = verdict.confidence === 'high' && verdict.diag ? TRY_LINE[verdict.diag] : verdict.grade === 'far' ? 'mars.try.far' : verdict.grade === 'close' ? 'mars.try.one' : 'mars.try.gen';
      const steps = consequence(verdict.diag, verdict.confidence === 'high', { fam: f.id, p, resp: r, correct, ask: item.ask }); lastDemo = steps;
      setLine(line ?? 'mars.try.retry', { d: typeof r === 'number' && typeof correct === 'number' ? Math.abs(r - correct) : 0 });
      if (!f.id.startsWith('nl.') && f.answer !== 'open') await runDemo(steps); else machine('tapAck');
      applyHint(state.hint);
      if (!f.id.startsWith('nl.') && state.hint >= 1) setLine(state.hint === 1 ? hintLineFor(state.misses) : state.hint === 2 ? 'mars.h2.intro' : 'mars.h3.go');   // the written hint (visible with the sound off); after the H3 demo the next move is the child's: "现在轮到你，点对勾"
      else if (f.id.startsWith('nl.') && state.hint === 1 && state.misses >= 2) setLine(hintLineFor(state.misses));   // a repeated far miss does not repeat the same sentence
      if (state.hint === 3) { fillAnswer(correct); }
      ui.hintBtn.classList.remove('is-glow');
    }
    async function runDemo(steps: DemoStep[]): Promise<void> {
      demoH?.stop(); locked = true; stage.lock(true);
      try { if (!(await stage.demo?.(steps))) { demoH = playDemo(ui.stage, steps, { order: f.prompt(p, item.ask).big, p, say: undefined }); await demoH.done; } } finally { locked = false; stage.lock(false); machine('tapAck'); }
    }
    /** H1 text: the family's own hint first, then a different one for every further miss (the same sentence three times teaches nothing) */
    function hintLineFor(misses: number): string { const pool = [hintLine(f, p), 'mars.hint.again1', 'mars.hint.again2']; return pool[Math.max(0, misses - 1) % pool.length]; }
    function applyHint(level: number): void {
      if (level >= 1) stage.hint(Math.min(3, level) as 1 | 2 | 3, correct as Answer);
      if (level === 2 && stage.input === 'keypad' && !stage.cells && typeof correct === 'number' && keypad) { keypad.clear(); const d = String(correct); fillDigits(d.slice(0, Math.max(1, Math.ceil(d.length / 2)))); }   // H2: the first half of the number is already in the box
      ui.order.classList.toggle('is-hinted', level >= 1);
      if (stage.cells) { cells = rewindCells(cells); paintCells(); }   // a hint restarts the attempt on the first cell (H3: with the answer on the display)
    }
    function fillDigits(digits: string): void { for (const ch of digits) { const b = ui.keypad.querySelector(`[data-key="${ch}"]`) as HTMLElement | null; b?.click(); } }
    function fillAnswer(ans: Answer): void {
      if (typeof ans === 'number' && keypad) { keypad.clear(); fillDigits(String(ans)); }
    }
    function finish(ok: boolean, est?: number): void {
      clearTimeout(idleT);
      const info = { firstTry: state.firstTry === true, misses: state.misses, hint: state.hint, assisted: state.assisted, ok: mode === 'normal' ? state.firstTry === true : ok, diags, ops, est };
      deliver(save, run!, item, info, Date.now());
    }
    ui.ok.onclick = () => { machine('op'); void submit(stage.input === 'keypad' ? keypadResponse(keypad?.value ?? '') : stage.collect()); };
    ui.hintBtn.onclick = () => {
      ui.hintBtn.classList.remove('is-glow'); const before = state.hint; machine('key');
      const note = hintKeyNote(state, mode);
      if (note === 'alone') setLine('mars.cert.alone'); else if (note === 'tryFirst') setLine('mars.hint.touchFirst');
      else if (state.hint !== before) { setLine(state.hint === 1 ? hintLineFor(state.misses) : state.hint === 2 ? 'mars.h2.intro' : 'mars.h3.intro'); applyHint(state.hint); if (state.hint === 3) fillAnswer(correct); }
      else setLine('mars.hint.needTry');
    };
    ui.replayBtn.onclick = () => app.say(bot, ui, orderId.id, orderId.vars);
    ui.hintBtn.hidden = false;
    const demoBtn = el('button', 'xg-btn xg-btn--secondary mb-demo-btn', '？'); demoBtn.type = 'button'; demoBtn.setAttribute('aria-label', '再看一遍');
    demoBtn.onclick = () => { if (locked) return; if (lastDemo.length && !f.id.startsWith('nl.')) void runDemo(lastDemo); else app.say(bot, ui, orderId.id, orderId.vars); };
    ui.tools.replaceChildren(mode === 'normal' ? demoBtn : document.createComment(''));
    if ((window as any).__mars) (window as any).__marsItem = { item, correct, answer: (v: Response) => submit(v), state: () => ({ locked, hint: state.hint, misses: state.misses, subs: state.subs, done: state.done, assisted: state.assisted, cell: cells.idx, cells: stage.cells?.length ?? 0 }) };   // test hook only (?test=1): the production page keeps no answer in a global
    await done; clearTimeout(idleT);
  }
}
const missionIndex = (run: MissionRun, item: Item): number => Math.max(0, run.items.findIndex((x) => x.key === item.key));

interface Chrome { zoneTag: HTMLElement; zoneIcon: HTMLElement; zoneNum: HTMLElement; order: HTMLElement; orderBig: HTMLElement; orderSmall: HTMLElement; dots: HTMLElement; comm: HTMLElement; commText: HTMLElement; bot: HTMLElement; stage: HTMLElement; answer: HTMLElement; keypad: HTMLElement; tools: HTMLElement; ok: HTMLButtonElement; mapBtn: HTMLButtonElement; hintBtn: HTMLButtonElement; replayBtn: HTMLButtonElement }
function buildChrome(root: HTMLElement): Chrome {
  root.innerHTML = `
    <button class="mb-map-btn xg-btn xg-btn--secondary" type="button" aria-label="回地图">${icon('back')}</button>
    <div class="mb-zonetag" role="img"><i class="mb-zone-ico" aria-hidden="true"></i><b class="mb-zone-num"></b></div>
    <div class="mb-order"><div class="mb-order-big"></div><div class="mb-order-small"></div><div class="mb-dots"></div></div>
    <div class="mb-comm"><span class="mb-bot"></span><span class="mb-comm-text" aria-live="polite"></span></div>
    <div class="mb-stage"></div>
    <div class="mb-answer"></div>
    <div class="mb-keypad"></div>
    <div class="mb-tools"></div>
    <button class="mb-ok xg-btn xg-btn--primary xg-btn--lg" type="button" aria-label="交付">${icon('check')}</button>
    <button class="mb-hint-btn xg-btn xg-btn--accent" type="button" aria-label="提示">${icon('hint')}</button>
    <button class="mb-replay-btn xg-btn xg-btn--secondary" type="button" aria-label="再听一遍">${icon('replay')}</button>`;
  const q = (s: string) => root.querySelector(s) as HTMLElement;
  return { zoneTag: q('.mb-zonetag'), zoneIcon: q('.mb-zone-ico'), zoneNum: q('.mb-zone-num'), order: q('.mb-order'), orderBig: q('.mb-order-big'), orderSmall: q('.mb-order-small'), dots: q('.mb-dots'), comm: q('.mb-comm'), commText: q('.mb-comm-text'), bot: q('.mb-bot'), stage: q('.mb-stage'), answer: q('.mb-answer'), keypad: q('.mb-keypad'), tools: q('.mb-tools'), ok: q('.mb-ok') as HTMLButtonElement, mapBtn: q('.mb-map-btn') as HTMLButtonElement, hintBtn: q('.mb-hint-btn') as HTMLButtonElement, replayBtn: q('.mb-replay-btn') as HTMLButtonElement };
}
export { mainIndexOf, missionDone, totalSlots };
export type { Companion, MarsSaveV5 };
