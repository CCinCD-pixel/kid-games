import { playSoftMiss, playSuccess, sfx } from '@kit/audio';
import { mount, type Companion } from '@kit/companion';
import { h, icon, showResult } from '@kit/ui';
import { CARD_NAME, cardSvg } from '../cards';
import { copyProg, place, removeAt, sameWhere, type Refusal, type Where } from '../model/edit';
import { advise, diagnose, type Advice, type Cell } from '../model/hint';
import { nextLevel } from '../model/levels';
import { DEFAULT_CONFIG, MAX_BODY, cellAt, cost, editCount, metresLeft, parseProg, run, slotsOf, startState, type Block, type Card, type CardKey, type Config, type Err, type Item, type Level, type MainCard, type Part, type RunResult, type Step } from '../model/sim';
import { starsFor } from '../model/stars';
import { Board, type Frame } from '../render/board';

/** what the level-complete event carries: how many runs it took, and the highest hint step used (0 for none) */
export interface WinInfo { tries: number; hint: number }
export interface PlayHost {
  root: HTMLElement;
  onWin(lv: { id: string }, stars: 1 | 2 | 3, info: WinInfo): void;
  /** a run that did not get there: why (a crash reason, 'short' when the cards ran out, 'samples' at the goal with a sample left), and the how-manyth run */
  onFail?(lv: { id: string }, reason: string, attempt: number): void;
  /** a press of the hint button, and which of its three steps it gave */
  onHint?(lv: { id: string }, tier: 1 | 2 | 3): void;
  /** what "next" means here (the patrol makes a fresh level); default: the next level of the game */
  next?(lv: { id: string }): { id: string } | undefined;
  nextLabel?: string;
  goMap(): void;
  openLevel(id: string): void;
}

const WHY: Record<Err, string> = {
  edge: '前面没有路了，车停在边上。',
  rock: '前面是大石头，过不去。',
  step: '台阶太高，小轮子上不去。',
  narrow: '这条缝太窄，大电池板挤不过去。',
  overhang: '石拱太矮，高天线过不去。',
  nosample: '这里没有样本可以采。',
  dark: '阴影里看不清，要换高天线才能采到。',
};
const DIRWORD: Record<string, string> = { E: '东', N: '北', S: '南', W: '西' };
const GARAGE: Record<Part, { label: string; opts: [string, string][]; note: Record<string, string> }> = {
  wheels: { label: '轮子', opts: [['S', '小轮'], ['L', '大轮']], note: { S: '小轮子：只能上 1 级台阶。', L: '大轮子：能上 2 级台阶，但是更重，电量少 2 格。' } },
  panel: { label: '电池板', opts: [['S', '小板'], ['L', '大板']], note: { S: '小电池板：窄缝也能过。', L: '大电池板：电量多 3 格，可是窄缝过不去。' } },
  mast: { label: '天线', opts: [['S', '矮天线'], ['T', '高天线']], note: { S: '矮天线：能过低矮的石拱。', T: '高天线：能看见阴影里的样本，可是过不了石拱。' } },
};
const FRAME_MS = 20;
/** levels where the first card to reach for, and then 发送, are pointed out by a gently breathing button */
const FIRST_CARD: Record<string, CardKey> = { 'C1-1': 'E', 'C5-1': 'X' };
const FIRST_SEND = ['C1-1', 'C1-2', 'C5-1'];
const REFUSE: Record<Refusal, string> = {
  full: '卡槽满了。先拿掉一张再放。', p1full: '魔法卡放满了。先拿掉一张再放。', bodyfull: `括号里最多放 ${MAX_BODY} 张卡。`,
  nest: '括号里不能再放重复卡。', p1x: '魔法卡里不能放重复卡。', p1c: '魔法卡里不能再放魔法卡。',
};
const UNDO_MAX = 40;

const isBlock = (it: Item): it is Block => typeof it !== 'string';
const stop = (txt: string): string => (/[。！？]$/.test(txt) ? txt : `${txt}。`);
/** what 撤回 puts back */
interface Snap { prog: Item[]; p1: Card[]; open: number; cfg: Config; target: 'main' | 'p1' }

export class PlayScreen {
  private board: Board;
  private bot: Companion | null = null;
  private cfg: Config = { ...DEFAULT_CONFIG };
  private prog: Item[] = [];
  private open = -1;               // index of the repeat block that takes the next cards, -1 for none
  private p1: Card[] = [];        // the magic card row (chapter 6)
  private target: 'main' | 'p1' = 'main'; // where the next plain card goes
  private nowP1 = -1;
  /** 'stepping': a run begun with 走一步 waits for the next press (changing a card ends it) */
  private state: 'edit' | 'running' | 'stepping' | 'result' = 'edit';
  private hints = 0;              // presses of the hint button
  private hintTier = 0;           // the highest of its three steps used (for the level-complete event)
  private hinted = false;         // step ③ was used: two stars at most
  private tries = 0;
  private dead = false;
  private raf = 0;
  private taken = 0;
  private crystal = false;
  private rover = { x: 0, y: 0, ang: 0, lift: 0 };
  private ghost: Frame['ghost'] = null;
  private marker: Frame['marker'] = null;
  private el!: Record<'brief' | 'note' | 'count' | 'rail' | 'tray' | 'garage' | 'send' | 'step' | 'clear' | 'hint' | 'bot' | 'canvas' | 'p1box' | 'p1rail' | 'p1label' | 'undo' | 'del' | 'ins' | 'done' | 'home', HTMLElement>;
  private nextPulse: CardKey | 'close' | null = null;
  private nowAt: Step['path'] | null = null;
  /** R1: the card the child tapped (a card from the box takes its place), or the place that 前面加一张 opened */
  private sel: Where | null = null;
  private caret: Where | null = null;
  private undo: Snap[] = [];
  private tips = 0;
  /** the run under way (发送 or 走一步): worked out up front, and how many of its cards the rover has done */
  private exec: { r: RunResult; prog: Item[]; p1: Card[]; k: number } | null = null;
  private trail: Cell[] = [];
  /** R2: after a run that did not get there the rover stays put, with its tracks and the card that stopped it, until a card is changed */
  private scene: { trail: Cell[]; bad: Step['path'] | null; badP1: number } | null = null;
  /** what the hint points at: a tile on the map, a card, the number of a block, a block's ×, the 拿掉 button, 发送, a garage part */
  private ring: Cell | null = null;
  private hintAt: Where | null = null;
  private hintHead = -1;
  private hintDel = -1;
  private hintP1 = false;
  private hintRemove = false;
  private hintSend = false;
  private hintPart: { part: Part; val: string } | null = null;
  /** R3: 走一步 from chapter 4 on, and on every fix-the-bug level */
  private readonly stepOn: boolean;

  constructor(private host: PlayHost, readonly lv: Level) {
    this.stepOn = lv.ch >= 4 || !!lv.buggy;
    this.prog = lv.buggy ? parseProg(lv.buggy) : [];
    this.p1 = lv.buggyP1 ? ([...lv.buggyP1] as Card[]) : [];
    const canvas = h('canvas', { class: 'rc-stage', 'aria-label': '月面地图' });
    this.board = new Board(canvas);
    this.build(canvas);
    this.resetRover();
    this.say(lv.buggy ? '这段程序走不到终点，帮忙改一改。' : lv.brief, 'happy');
    this.refresh();
    const loop = () => { if (this.dead) return; this.draw(); this.raf = requestAnimationFrame(loop); };
    requestAnimationFrame(() => { this.board.resize(); loop(); });
  }

  private build(canvas: HTMLCanvasElement): void {
    const { lv } = this;
    const q = (cls: string) => h('div', { class: cls });
    const brief = q('rc-brief'), note = q('rc-note'), rail = q('rc-rail'), tray = q('rc-tray'), garage = q('rc-garage');
    const count = h('span', { class: 'rc-count' });
    const bot = q('rc-bot');
    const btn = (cls: string, label: string, on: () => void, extra: Record<string, string> = {}) => h('button', { class: `xg-btn ${cls}`, type: 'button', ...extra, onclick: on }, label);
    const send = btn('xg-btn--primary xg-btn--lg rc-send', '发送', () => void this.send());
    const step = btn('rc-step', '走一步', () => void this.step());
    step.hidden = !this.stepOn;
    const clear = btn('rc-clear', lv.buggy ? '还原' : '清空', () => this.clear());
    const hint = h('button', { class: 'xg-btn rc-hint', type: 'button', 'aria-label': '提示', onclick: () => this.hint() });
    hint.innerHTML = icon('hint');
    const undo = btn('rc-undo', '↶ 撤回', () => this.doUndo(), { 'aria-label': '撤回' });
    const del = btn('rc-del1', '拿掉', () => this.removeSel());
    const ins = btn('rc-ins', '前面加一张', () => this.startCaret());
    const done = btn('rc-done', '加好了', () => this.endModes());
    const home = btn('rc-home', '回到起点', () => this.backToStart());
    const p1label = h('span', { class: 'rc-p1-label' }), p1rail = q('rc-rail rc-p1-rail');
    const p1box = h('div', { class: 'rc-p1', 'data-target': 'p1', onclick: () => { this.endModes(); this.setTarget('p1'); } }, p1label, p1rail);
    if (!lv.p1Slots) p1box.hidden = true;
    rail.addEventListener('click', (e) => { const t = e.target as HTMLElement; if (t === rail || t.classList.contains('rc-empty')) { this.endModes(); this.setTarget('main'); } });
    this.el = { brief, note, count, rail, tray, garage, send, step, clear, hint, bot, canvas, p1box, p1rail, p1label, undo, del, ins, done, home };
    const top = h('header', { class: 'rc-top' }, h('div', { class: 'rc-title' }, ...(lv.ch > 0 ? [h('b', {}, lv.id), ' '] : []), lv.title), bot, brief, hint);
    const side = h('aside', { class: 'rc-side' }, garage, h('div', { class: 'rc-edit' }, undo, del, ins, done, count), rail, p1box, tray, h('div', { class: 'rc-actions' }, clear, step, send));
    const stage = h('div', { class: 'rc-stagewrap' }, canvas, note, home);
    this.host.root.replaceChildren(h('section', { class: 'rc-play', 'data-ch': String(lv.ch) }, top, stage, side));
    try { this.bot = mount(bot, { size: 64 }); } catch { this.bot = null; }
    if (lv.fog) note.textContent = `任务单：${lv.fog.brief.map(([d, n]) => `向${DIRWORD[d]}开 ${n} 米`).join('，')}`;
    if (lv.garage) {
      for (const part of lv.garage.open) {
        const row = h('div', { class: 'rc-part', 'data-part': part }, h('span', { class: 'rc-part-name' }, GARAGE[part].label));
        for (const [val, label] of GARAGE[part].opts) {
          row.append(h('button', { class: 'xg-btn rc-opt', type: 'button', 'data-val': val, 'aria-pressed': String(this.cfgOf(part) === val), onclick: () => this.setPart(part, val) }, label));
        }
        garage.append(row);
      }
      garage.append(h('div', { class: 'rc-part-note' }));
    }
    for (const c of lv.cards) {
      const b = h('button', { class: 'xg-btn rc-card', type: 'button', 'data-card': c, 'aria-label': CARD_NAME[c], onclick: () => this.add(c) });
      b.innerHTML = cardSvg(c);
      tray.append(b);
    }
  }
  private cfgOf = (part: Part): string => (this.cfg as unknown as Record<string, string>)[part];

  // ───────────────────────────────────────────────────────── the programme
  private get slots(): number { return slotsOf(this.lv, this.cfg); }
  private blockAt(i: number): Block | null { const it = this.prog[i]; return it && isBlock(it) ? it : null; }
  private editable(): boolean { return this.state === 'edit' || this.state === 'stepping'; }
  private leaveStep(): void { if (this.state === 'stepping') { this.exec = null; this.state = 'edit'; this.nowAt = null; this.nowP1 = -1; } }
  /** before any change to the cards: keep the programme for 撤回, and end a 走一步 run */
  private snap(): void {
    this.undo.push({ prog: copyProg({ main: this.prog, p1: [] }).main, p1: [...this.p1], open: this.open, cfg: { ...this.cfg }, target: this.target });
    if (this.undo.length > UNDO_MAX) this.undo.shift();
    this.leaveStep();
  }
  private doUndo(): void {
    if (!this.editable()) return;
    const u = this.undo.pop();
    if (!u) return;
    this.leaveStep();
    this.prog = u.prog; this.p1 = u.p1; this.open = u.open; this.cfg = u.cfg; this.target = u.target;
    sfx.play('ui-pop'); this.say('撤回了一步。', 'happy'); this.afterEdit();
  }
  private refuse(r: Refusal): void { this.say(REFUSE[r], 'thinking'); sfx.play('ui-locked'); }
  private full(): void { this.refuse('full'); }

  /** a card from the box: it takes the place of the chosen card, goes in where 前面加一张 opened, or else at the end */
  private add(key: CardKey): void {
    if (!this.editable()) return;
    if (this.sel) { this.put(this.sel, key, 'replace'); return; }
    if (this.caret) { this.put(this.caret, key, 'insert'); return; }
    if (this.target === 'p1' && key !== 'C') {
      if (key === 'X') return this.refuse('p1x');
      if (this.p1.length >= (this.lv.p1Slots ?? 0)) return this.refuse('p1full');
      this.snap(); this.p1.push(key); sfx.play('place-piece'); this.afterEdit(); return;
    }
    if (key === 'C') this.target = 'main';                                     // a magic card is always played from the main row
    if (key === 'X') {
      if (this.open >= 0) { this.closeBlock(); return; }                       // tapping 重复 again closes the open bracket
      if (cost(this.prog) >= this.slots) return this.full();
      this.snap(); this.prog.push({ k: 'X', n: 2, body: [] }); this.open = this.prog.length - 1;
      sfx.play('place-piece'); this.say('把要重复的卡放进括号里，点数字可以改次数。', 'thinking'); this.afterEdit(); return;
    }
    if (cost(this.prog) >= this.slots) return this.full();
    this.snap();
    const blk = this.open >= 0 ? this.blockAt(this.open) : null;
    if (blk) {
      blk.body.push(key);
      if (blk.body.length >= MAX_BODY) { this.open = -1; this.say(`括号里最多放 ${MAX_BODY} 张卡。`, 'happy'); }
    } else this.prog.push(key);
    sfx.play('place-piece'); this.afterEdit();
    this.coach();
  }
  private put(w: Where, key: CardKey, mode: 'replace' | 'insert'): void {
    const r = place({ main: this.prog, p1: this.p1 }, w, key, mode, { slots: this.slots, p1Slots: this.lv.p1Slots ?? 0 });
    if ('refuse' in r) return this.refuse(r.refuse);
    this.snap();
    if (w.row === 'main' && w.j === undefined && mode === 'insert' && this.open >= w.i) this.open += 1;
    this.prog = r.prog.main; this.p1 = r.prog.p1;
    if (r.open !== undefined) { this.open = r.open; this.say('放进重复里了。点数字可以改次数，放好了点“收好”。', 'thinking'); }
    else this.say(mode === 'replace' ? '换好了。' : '加好了。还可以接着加。', 'happy');
    sfx.play('place-piece');
    this.afterEdit(r.open === undefined && mode === 'insert' ? r.next ?? null : null);
  }
  /** tapping a laid card chooses it; tapping it again lets go */
  private tapCard(w: Where): void {
    if (!this.editable()) return;
    this.caret = null;
    if (sameWhere(this.sel, w)) { this.sel = null; sfx.play('ui-tap'); this.refresh(); return; }
    this.sel = w; this.target = w.row; sfx.play('ui-tap');
    if (this.tips < 2) { this.tips++; this.say('选中了。点卡盒里的卡，就换成那一张。', 'thinking'); }
    this.refresh();
  }
  private removeSel(): void {
    const w = this.sel;
    if (!w || !this.editable()) return;
    this.snap();
    if (w.row === 'main' && w.j === undefined) this.removeItem(w.i);
    else { const q = removeAt({ main: this.prog, p1: this.p1 }, w); this.prog = q.main; this.p1 = q.p1; }
    sfx.play('ui-pop'); this.afterEdit();
  }
  private startCaret(): void {
    if (!this.sel || !this.editable()) return;
    this.caret = this.sel; this.sel = null; sfx.play('ui-tap');
    this.say('点卡盒里的卡，就加在亮的地方。', 'thinking'); this.refresh();
  }
  private endModes(): void { if (!this.sel && !this.caret) return; this.sel = null; this.caret = null; this.refresh(); }
  /** the very first level talks the child through its first run (captions only): what to put in, then 发送 */
  private coach(): void {
    if (this.lv.id === 'C1-1' && this.tries === 0) {
      const n = cost(this.prog);
      this.say(n === 1 ? '放好了！再放两张，一共三张。' : n === 2 ? '再放一张。' : n === 3 ? '三张啦！按“发送”，月球车就出发。' : this.el.brief.textContent ?? '', 'happy');
    } else if (this.lv.id === 'C5-1' && this.tries === 0 && this.open >= 0) {
      const blk = this.blockAt(this.open);
      if (blk && blk.body.length === 1) this.say('点一点括号上的数字，改成 5 次。', 'happy');
    }
  }
  private setTarget(t: 'main' | 'p1'): void {
    if (!this.editable() || !this.lv.p1Slots || this.target === t) return;
    this.target = t; sfx.play('ui-tap');
    this.say(t === 'p1' ? '现在放进魔法卡里。' : '现在放进主程序里。', 'happy'); this.refresh();
  }
  private removeBlock(i: number): void { if (!this.editable()) return; this.snap(); this.removeItem(i); sfx.play('ui-pop'); this.afterEdit(); }
  private removeItem(i: number): void {
    this.prog.splice(i, 1);
    if (this.open === i) this.open = -1; else if (this.open > i) this.open -= 1;
  }
  private cycle(i: number): void {
    const blk = this.blockAt(i);
    if (!blk || !this.editable()) return;
    this.snap();
    blk.n = blk.n >= 5 ? 2 : blk.n + 1; sfx.play('ui-tick'); this.afterEdit();
  }
  private closeBlock(): void { this.open = -1; this.sel = null; this.caret = null; this.nextPulse = null; sfx.play('ui-tap'); this.refresh(); }
  private clear(): void {
    if (!this.editable()) return;
    this.snap();
    this.prog = this.lv.buggy ? parseProg(this.lv.buggy) : []; this.p1 = this.lv.buggyP1 ? ([...this.lv.buggyP1] as Card[]) : []; this.open = -1; this.target = 'main'; sfx.play('ui-tap'); this.afterEdit();
  }
  /** after a change to the cards: the scene of the last run, the hint marks and the choice are gone; `caret` keeps an insert going */
  private afterEdit(caret: Where | null = null): void {
    this.marker = null; this.scene = null; this.ring = null; this.sel = null; this.caret = caret;
    this.clearHint(); this.refresh();
  }
  private clearHint(): void {
    this.hintAt = null; this.hintHead = -1; this.hintDel = -1; this.hintP1 = false; this.hintRemove = false; this.hintSend = false; this.hintPart = null; this.nextPulse = null;
  }

  private setPart(part: Part, val: string): void {
    if (!this.editable()) return;
    this.snap();
    (this.cfg as unknown as Record<string, string>)[part] = val;
    sfx.play('ui-toggle-on');
    let trimmed = false;
    while (cost(this.prog) > this.slots) { trimmed = true; this.dropLast(); }
    this.say(trimmed ? '大轮子更重，电量少了，最后几张卡放不下了。' : GARAGE[part].note[val], 'thinking');
    this.afterEdit();
  }
  private dropLast(): void {
    const last = this.prog[this.prog.length - 1];
    if (last && isBlock(last) && last.body.length) last.body.pop(); else this.removeItem(this.prog.length - 1);
  }

  private tile(card: MainCard, w: Where): HTMLElement {
    const inP1 = w.row === 'p1';
    const sc = this.scene;
    const now = w.row === 'p1' ? this.nowP1 === w.k : !!this.nowAt && this.nowAt[0] === w.i && this.nowAt[1] === w.j;
    const bad = !!sc && (w.row === 'p1' ? sc.badP1 === w.k : !!sc.bad && sc.bad[0] === w.i && sc.bad[1] === w.j);
    const sel = sameWhere(this.sel, w);
    const cls = ['rc-slot', 'is-full', now && 'is-now', bad && 'is-bad', sameWhere(this.hintAt, w) && 'is-hint', sel && 'is-sel'].filter(Boolean).join(' ');
    const at = w.row === 'p1' ? { 'data-k': String(w.k) } : { 'data-i': String(w.i), ...(w.j === undefined ? {} : { 'data-j': String(w.j) }) };
    const b = h('button', {
      class: cls, type: 'button', ...at, 'aria-pressed': String(sel),
      'aria-label': `${w.row === 'p1' ? `魔法卡第 ${w.k + 1} 张：` : ''}${CARD_NAME[card]}，点一下选中`, onclick: (e: Event) => { e.stopPropagation(); this.tapCard(w); },
    });
    if (inP1) b.dataset.row = 'p1';
    b.innerHTML = cardSvg(card);
    return b;
  }
  private caretEl(): HTMLElement { return h('span', { class: 'rc-caret', 'aria-label': '新卡加在这里' }); }

  /** everything that depends on the programme or the garage: the rail, the count, the ghost path, the buttons */
  private refresh(): void {
    const { el, lv } = this;
    const slots = this.slots; const used = cost(this.prog);
    el.count.textContent = `${used} / ${slots}`;
    const c = this.caret;
    const caretAt = (i: number, j?: number) => !!c && c.row === 'main' && c.i === i && c.j === j;
    const nodes: HTMLElement[] = [];
    this.prog.forEach((it, i) => {
      if (caretAt(i)) nodes.push(this.caretEl());
      if (!isBlock(it)) { nodes.push(this.tile(it, { row: 'main', i })); return; }
      const isOpen = i === this.open;
      const head = h('button', {
        class: `rc-slot rc-bh${this.nowAt && this.nowAt[0] === i ? ' is-now' : ''}${this.hintHead === i ? ' is-hint' : ''}`, type: 'button', 'data-i': String(i), 'data-j': 'h',
        'aria-label': `重复 ${it.n} 次，点一下改次数`, onclick: (e: Event) => { e.stopPropagation(); this.cycle(i); },
      });
      head.innerHTML = `${cardSvg('X')}<b>${it.n}</b>`;
      const body: HTMLElement[] = [];
      it.body.forEach((card, j) => { if (caretAt(i, j)) body.push(this.caretEl()); body.push(this.tile(card, { row: 'main', i, j })); });
      if (caretAt(i, it.body.length)) body.push(this.caretEl());
      const tools: HTMLElement[] = [];
      if (isOpen) tools.push(h('button', { class: `rc-bclose${this.nextPulse === 'close' ? ' is-pulse' : ''}`, type: 'button', 'aria-label': '括号收好', onclick: (e: Event) => { e.stopPropagation(); this.closeBlock(); } }, '收好'));
      tools.push(h('button', { class: `rc-bdel${this.hintDel === i ? ' is-pulse' : ''}`, type: 'button', 'aria-label': '拿掉整个重复块', onclick: (e: Event) => { e.stopPropagation(); this.removeBlock(i); } }, '×'));
      nodes.push(h('div', { class: `rc-block${isOpen ? ' is-open' : ''}`, 'data-i': String(i) }, head, ...body, ...tools));
    });
    if (caretAt(this.prog.length)) nodes.push(this.caretEl());
    for (let k = used; k < slots; k++) nodes.push(h('span', { class: 'rc-slot rc-empty', 'aria-hidden': 'true' }, String(k + 1)));
    el.rail.replaceChildren(...nodes);
    if (lv.p1Slots) {
      el.p1box.classList.toggle('is-target', this.target === 'p1' && !this.sel && !this.caret);
      el.p1box.classList.toggle('is-hint', this.hintP1);
      el.rail.classList.toggle('is-target', this.target === 'main' && !this.sel && !this.caret);
      el.p1label.textContent = `魔法卡 ${this.p1.length} / ${lv.p1Slots}`;
      const tiles: HTMLElement[] = [];
      this.p1.forEach((card, k) => { if (c && c.row === 'p1' && c.k === k) tiles.push(this.caretEl()); tiles.push(this.tile(card, { row: 'p1', k })); });
      if (c && c.row === 'p1' && c.k === this.p1.length) tiles.push(this.caretEl());
      for (let k = this.p1.length; k < lv.p1Slots; k++) tiles.push(h('span', { class: 'rc-slot rc-empty', 'aria-hidden': 'true' }, String(k + 1)));
      el.p1rail.replaceChildren(...tiles);
    }
    const ed = this.editable();
    (el.undo as HTMLButtonElement).disabled = !ed || !this.undo.length;
    el.del.hidden = !this.sel || !ed; el.ins.hidden = !this.sel || !ed; el.done.hidden = !this.caret;
    el.del.classList.toggle('is-pulse', this.hintRemove && !!this.sel);
    const first = FIRST_CARD[lv.id];
    for (const b of Array.from(el.tray.children) as HTMLElement[]) {
      const k = b.dataset.card;
      const intro = !!first && k === first && !this.prog.length && this.state === 'edit' && this.hints === 0;
      b.classList.toggle('is-pulse', k === this.nextPulse || intro);
    }
    const go = (this.state === 'edit' && this.prog.length > 0) || this.state === 'stepping';
    (el.send as HTMLButtonElement).disabled = !go;
    (el.step as HTMLButtonElement).disabled = !go;
    el.send.classList.toggle('is-pulse', go && ((FIRST_SEND.includes(lv.id) && this.state === 'edit' && this.tries === 0 && this.open < 0 && !this.hasEmptyBlock()) || this.hintSend));
    (el.clear as HTMLButtonElement).disabled = !ed;
    el.home.hidden = !(this.scene || this.state === 'stepping');
    for (const row of Array.from(el.garage.querySelectorAll<HTMLElement>('.rc-part'))) {
      const part = row.dataset.part as Part;
      for (const b of Array.from(row.querySelectorAll<HTMLElement>('.rc-opt'))) {
        b.setAttribute('aria-pressed', String(this.cfgOf(part) === b.dataset.val));
        b.classList.toggle('is-pulse', !!this.hintPart && this.hintPart.part === part && this.hintPart.val === b.dataset.val);
      }
    }
    const mode = lv.ghost ?? 'off';
    if (mode === 'off' || !this.prog.length || this.state !== 'edit' || this.scene || this.hasEmptyBlock()) this.ghost = null;
    else {
      const r = run(lv, this.cfg, this.prog, this.p1);
      this.ghost = { mode, pts: [{ x: lv.start.x, y: lv.start.y }, ...r.steps.filter((s) => !s.err).map((s) => ({ x: s.s.x, y: s.s.y }))] };
    }
    if (this.state === 'edit' && !this.scene) this.resetRover();
  }
  private hasEmptyBlock(): boolean { return this.prog.some((it) => isBlock(it) && !it.body.length); }

  // ───────────────────────────────────────────────────────── hints (R4): ① the task again, ② where it goes astray, ③ the next card
  private hint(): void {
    if (this.state === 'stepping') this.backToStart();
    if (this.state !== 'edit') return;
    this.hints++;
    const tier = Math.min(3, this.hints) as 1 | 2 | 3;
    this.hintTier = Math.max(this.hintTier, tier);
    sfx.play('hint');
    this.host.onHint?.(this.lv, tier);
    this.clearHint(); this.ring = null; this.sel = null; this.caret = null;
    if (tier === 1) this.say(`${stop(this.lv.brief)}${stop(this.lv.teach)}`, 'thinking');
    else if (tier === 2) this.hintWhere();
    else { this.hinted = true; this.showAdvice(advise(this.lv, this.cfg, this.prog, this.p1, this.open)); }
    this.refresh();
  }
  private tell(text: string): void { this.say(text, 'encouraging'); }
  /** ②: circle the tile where the run starts to go astray; on a fix-the-bug level light up the card that does it */
  private hintWhere(): void {
    const d = diagnose(this.lv, this.cfg, this.prog, this.p1);
    if (d.kind === 'garage') { this.hintPart = { part: d.part, val: d.val }; this.tell('先去车库看看，换一换零件。'); return; }
    if (d.kind === 'win') { this.hintSend = true; this.tell('这样就能到。按“发送”试试。'); return; }
    this.ring = d.cell;
    if (d.kind === 'empty') { this.tell('从圈着的起点出发。先看看小旗在哪边。'); return; }
    if (d.kind === 'short') { this.tell('到圈着的这一格都很好，接着往下排。'); return; }
    if (!this.lv.buggy) { this.tell('从圈着的这一格开始，车走歪了。'); return; }
    if (d.p1 !== undefined) { this.hintP1 = true; this.tell('车在圈着的这一格走歪了。看看魔法卡里的卡。'); return; }
    const [i, j] = d.path;
    if (j !== undefined && d.round > 1) { this.hintHead = i; this.tell('车转了几圈以后走歪了。看看重复的次数。'); return; }
    this.hintAt = j === undefined ? { row: 'main', i } : { row: 'main', i, j };
    this.tell('车在圈着的这一格走歪了。看看亮起来的这张卡。');
  }
  /** ③: one next move for the programme as it is */
  private showAdvice(a: Advice): void {
    switch (a.kind) {
      case 'garage': this.hintPart = { part: a.part, val: a.val }; this.tell('去车库，换上闪的那个零件。'); return;
      case 'send': this.hintSend = true; this.tell('这样就能到。按“发送”试试。'); return;
      case 'add':
        if (a.card === 'close') { this.nextPulse = 'close'; this.tell('括号里放好了，点“收好”。'); return; }
        this.target = a.row; this.nextPulse = a.card;
        this.tell(a.card === 'X' ? '试试用重复卡。' : a.row === 'p1' ? '魔法卡里放闪的这一张。' : '下一张，放闪的这一张。');
        return;
      case 'replace': this.sel = a.at; this.target = a.at.row; this.nextPulse = a.card; this.tell('把亮起来的这张，换成闪的那张。'); return;
      case 'insert': this.caret = a.at; this.nextPulse = a.card; this.tell('在亮的地方，加一张闪的卡。'); return;
      case 'remove':
        if (a.at.row === 'main' && a.at.j === undefined && this.blockAt(a.at.i)) { this.hintDel = a.at.i; this.tell(a.last ? '先拿掉最后这个重复块，再试试。' : '这个重复块多了，点 × 拿掉。'); return; }
        this.sel = a.at; this.hintRemove = true; this.tell(a.last ? '先拿掉最后这一张，再试试。' : '这张卡多了，点“拿掉”。');
        return;
      case 'count': this.hintHead = a.at; this.tell(`点重复上的数字，改成 ${a.n} 次。`); return;
      case 'none': this.say(stop(this.lv.teach), 'thinking');
    }
  }

  // ───────────────────────────────────────────────────────── running: 发送 does all the cards, 走一步 one card a press
  /** set up a run from the start; false (and why, said) when the programme cannot go yet */
  private begin(): boolean {
    if (this.hasEmptyBlock()) {
      this.say('括号里还没有卡。', 'thinking'); sfx.play('ui-locked');
      this.el.rail.querySelector('.rc-block')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return false;
    }
    if (this.lv.p1Slots && !this.p1.length && this.prog.some((it) => it === 'C' || (isBlock(it) && it.body.includes('C')))) {
      this.say('魔法卡还是空的。', 'thinking'); sfx.play('ui-locked'); this.target = 'p1'; this.refresh(); return false;
    }
    this.open = -1; this.sel = null; this.caret = null; this.scene = null; this.marker = null; this.ring = null; this.ghost = null;
    this.clearHint();
    this.tries++;
    const prog = copyProg({ main: this.prog, p1: [] }).main;
    const p1 = [...this.p1];
    this.exec = { r: run(this.lv, this.cfg, prog, p1), prog, p1, k: 0 };
    this.resetRover();
    this.trail = [{ x: this.lv.start.x, y: this.lv.start.y }];
    return true;
  }
  private async send(): Promise<void> {
    if (this.state === 'stepping' && this.exec) { this.state = 'running'; this.refresh(); await this.runRest(); return; } // the rest of a 走一步 run
    if (this.state !== 'edit' || !this.prog.length || !this.begin()) return;
    this.state = 'running'; this.refresh();
    sfx.play('launch');
    await this.wait(260);
    await this.runRest();
  }
  /** 走一步: the next card only; the first press starts the run from the start */
  private async step(): Promise<void> {
    if (this.state === 'edit') { if (!this.prog.length || !this.begin()) return; sfx.play('launch'); }
    else if (this.state !== 'stepping' || !this.exec) return;
    this.state = 'running'; this.refresh();
    const over = await this.one();
    if (this.dead) return;
    if (over) { await this.end(); return; }
    this.state = 'stepping'; this.refresh();
    if (this.exec?.k === 1) this.say('再点“走一步”，车就做下一张卡。点“发送”，一口气做完。', 'thinking');
  }
  /** the rover does the next card of the run; true when the run is over (a card it could not do, or the last card) */
  private async one(): Promise<boolean> {
    const ex = this.exec!; const st = ex.r.steps[ex.k];
    this.nowAt = st.path; this.nowP1 = st.p1 ?? -1; this.refresh();
    await this.perform(st);
    if (!st.err) this.trail.push({ x: st.s.x, y: st.s.y });
    ex.k++;
    return !!st.err || ex.k >= ex.r.steps.length;
  }
  private async runRest(): Promise<void> {
    while (this.exec && !this.dead) if (await this.one()) break;
    if (this.dead || !this.exec) return;
    await this.end();
  }
  private async end(): Promise<void> {
    const ex = this.exec!; this.exec = null;
    await this.finish(ex.r, ex.prog, ex.p1);
  }
  /** 回到起点: the rover goes home and the scene of the last run is put away (the cards stay) */
  private backToStart(): void {
    if (!this.editable()) return;
    this.exec = null; this.state = 'edit'; this.scene = null; this.marker = null; this.nowAt = null; this.nowP1 = -1;
    sfx.play('ui-tap'); this.refresh();
  }

  /** one card, animated: a turn rotates in place, a move slides, a sample pulses; a card the rover cannot do bumps */
  private async perform(st: Step): Promise<void> {
    const { lv } = this; const from = { ...this.rover };
    const targetAng = st.s.d * 90;
    const dAng = ((targetAng - from.ang + 540) % 360) - 180;
    const toLift = cellAt(lv, st.s.x, st.s.y).h;
    const moved = st.s.x !== Math.round(from.x) || st.s.y !== Math.round(from.y);
    if (st.card === 'P') {
      if (st.err) { await this.bump(); return; }
      sfx.play('lock-in'); this.taken = st.s.m; await this.wait(260); return;
    }
    if (dAng !== 0) { await this.tween(st.card === 'L' || st.card === 'R' ? 220 : 160, (p) => { this.rover.ang = from.ang + dAng * p; }); }
    if (st.card === 'L' || st.card === 'R') { this.rover.ang = from.ang + dAng; return; }
    if (st.err) { await this.bump(); return; }
    if (moved) {
      sfx.play('step');
      await this.tween(300, (p) => { this.rover.x = from.x + (st.s.x - from.x) * p; this.rover.y = from.y + (st.s.y - from.y) * p; this.rover.lift = from.lift + (toLift - from.lift) * p; });
      if (st.s.c === 1 && !this.crystal) { this.crystal = true; sfx.play('coin'); }
    }
  }
  private async bump(): Promise<void> {
    sfx.play('bump'); const x0 = this.rover.x, y0 = this.rover.y; const a = this.rover.ang * Math.PI / 180;
    await this.tween(160, (p) => { const k = Math.sin(p * Math.PI) * 0.14; this.rover.x = x0 + Math.sin(a) * k; this.rover.y = y0 - Math.cos(a) * k; });
    this.rover.x = x0; this.rover.y = y0;
  }

  private async finish(r: RunResult, prog: Item[], p1: Card[]): Promise<void> {
    const { lv } = this;
    this.nowAt = null; this.nowP1 = -1;
    if (r.res === 'win') {
      this.state = 'result';
      const stars = starsFor(lv, prog, r, this.hinted, p1);
      this.bot?.setMood('celebrating'); playSuccess(stars); sfx.play(`star-${stars}`);
      this.host.onWin(lv, stars, { tries: this.tries, hint: this.hintTier });
      this.refresh();
      await this.wait(500);
      const praise = this.hinted ? '到啦！下一次试试不用提示。'
        : lv.buggy ? (stars === 3 ? '只改了该改的地方，真细心！' : '修好了！下次试试少改几张。')
          : stars === 3 ? '一张多余的卡都没有，真利落！' : stars === 2 ? '到啦！再少用一张卡就是三颗星。' : '到啦！想试试用更少的卡吗？';
      const nxt = this.host.next ? this.host.next(lv) : nextLevel(lv.id);
      const id = await showResult({
        ribbon: lv.ch > 0 ? `${lv.id} 完成` : '完成啦', title: lv.title, text: praise, stars, accentGame: 'rabbit',
        stats: [{ label: lv.buggy ? '改动' : '用了卡', value: lv.buggy ? `${editCount(parseProg(lv.buggy), prog, [...(lv.buggyP1 ?? '')] as Card[], p1)} 处` : `${cost(prog, p1)} 张` }],
        actions: [...(nxt ? [{ id: 'next', label: this.host.nextLabel ?? '下一关', kind: 'primary' as const }] : []), { id: 'again', label: '再来一次' }, { id: 'map', label: '回地图' }],
      });
      if (this.dead) return;
      if (id === 'next' && nxt) this.host.openLevel(nxt.id);
      else if (id === 'again') this.host.openLevel(lv.id);
      else this.host.goMap();
      return;
    }
    const last = r.s;
    let reason: string;
    if (r.res === 'crash' && r.err) { reason = r.err; this.marker = { x: last.x, y: last.y, kind: 'crash' }; this.say(WHY[r.err], 'encouraging'); }
    else {
      this.marker = { x: last.x, y: last.y, kind: 'end' };
      const left = metresLeft(lv, last);
      reason = left ? 'short' : 'samples';
      if (!left && last.m !== lv.full) this.say('到终点了，可是还有样本没采。', 'encouraging');
      else if (!left) this.say('车停在终点了。', 'encouraging');
      else this.say(`程序跑完了，车停在这里，离终点还差 ${left} 米。`, 'encouraging');
    }
    const bad = r.res === 'crash' ? r.steps[r.steps.length - 1] : undefined;
    this.scene = { trail: [...this.trail], bad: bad ? bad.path : null, badP1: bad?.p1 ?? -1 };
    this.state = 'edit';
    this.host.onFail?.(lv, reason, this.tries);
    playSoftMiss();
    this.refresh();
  }

  // ───────────────────────────────────────────────────────── drawing
  private resetRover(): void {
    const s = startState(this.lv);
    this.rover = { x: s.x, y: s.y, ang: s.d * 90, lift: cellAt(this.lv, s.x, s.y).h }; this.taken = 0; this.crystal = false;
  }
  private draw(): void {
    const trail = this.scene ? this.scene.trail : this.state === 'running' || this.state === 'stepping' ? this.trail : null;
    this.board.draw({ lv: this.lv, cfg: this.cfg, rover: this.rover, taken: this.taken, crystal: this.crystal, ghost: this.ghost, marker: this.marker, trail, ring: this.ring, now: performance.now() });
  }
  resize(): void { this.board.resize(); }

  private say(text: string, mood: 'happy' | 'thinking' | 'encouraging' | 'celebrating' = 'happy'): void {
    this.el.brief.textContent = text;
    try { this.bot?.setMood(mood); } catch { /* a missing mood is not worth a crash */ }
  }
  private wait(ms: number): Promise<void> { return this.tween(ms, () => undefined); }
  private tween(ms: number, f: (p: number) => void): Promise<void> {
    return new Promise((done) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.dead) return done();
        const p = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
        f(p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
        if (p < 1) setTimeout(tick, FRAME_MS); else done();
      };
      tick();
    });
  }

  dispose(): void { this.dead = true; cancelAnimationFrame(this.raf); try { this.bot?.destroy(); } catch { /* ignore */ } }
}
