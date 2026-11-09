import { playSoftMiss, playSuccess, sfx } from '@kit/audio';
import { mount, type Companion } from '@kit/companion';
import { h, icon, showResult } from '@kit/ui';
import { CARD_NAME, cardSvg } from '../cards';
import { nextLevel } from '../model/levels';
import { DEFAULT_CONFIG, MAX_BODY, cellAt, cost, editCount, metresLeft, parseProg, run, slotsOf, startState, type Block, type Card, type CardKey, type Config, type Err, type Item, type Level, type MainCard, type Part, type RunResult, type Step } from '../model/sim';
import { starsFor } from '../model/stars';
import { Board, type Frame } from '../render/board';

export interface PlayHost {
  root: HTMLElement;
  onWin(lv: Level, stars: 1 | 2 | 3): void;
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

const isBlock = (it: Item): it is Block => typeof it !== 'string';
const sameItem = (a: Item | undefined, b: Item | undefined): boolean =>
  a === b || (!!a && !!b && isBlock(a) && isBlock(b) && a.n === b.n && a.body.join('') === b.body.join(''));
/** the text form of the programme so far; a block that is still open has no closing bracket yet */
const partial = (prog: readonly Item[], open: number): string =>
  prog.map((it, i) => (isBlock(it) ? `${it.n}(${it.body.join('')}${i === open ? '' : ')'}` : it)).join('');

export class PlayScreen {
  private board: Board;
  private bot: Companion | null = null;
  private cfg: Config = { ...DEFAULT_CONFIG };
  private prog: Item[] = [];
  private open = -1;               // index of the repeat block that takes the next cards, -1 for none
  private p1: Card[] = [];        // the magic card row (chapter 6)
  private target: 'main' | 'p1' = 'main'; // where the next plain card goes
  private nowP1 = -1;
  private hintP1 = false;
  private state: 'edit' | 'running' | 'result' = 'edit';
  private hints = 0;
  private hinted = false;
  private tries = 0;
  private dead = false;
  private raf = 0;
  private taken = 0;
  private crystal = false;
  private rover = { x: 0, y: 0, ang: 0, lift: 0 };
  private ghost: Frame['ghost'] = null;
  private marker: Frame['marker'] = null;
  private el!: Record<'brief' | 'note' | 'count' | 'rail' | 'tray' | 'garage' | 'send' | 'clear' | 'hint' | 'bot' | 'canvas' | 'p1box' | 'p1rail' | 'p1label', HTMLElement>;
  private nextPulse: CardKey | 'close' | null = null;
  private hintItem = -1;
  private nowAt: Step['path'] | null = null;

  constructor(private host: PlayHost, readonly lv: Level) {
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
    const brief = q('rc-brief'), note = q('rc-note'), count = q('rc-count'), rail = q('rc-rail'), tray = q('rc-tray'), garage = q('rc-garage');
    const bot = q('rc-bot');
    const send = h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg rc-send', type: 'button', onclick: () => void this.send() }, '发送');
    const clear = h('button', { class: 'xg-btn rc-clear', type: 'button', onclick: () => this.clear() }, lv.buggy ? '还原' : '清空');
    const hint = h('button', { class: 'xg-btn rc-hint', type: 'button', 'aria-label': '提示', onclick: () => this.hint() });
    hint.innerHTML = icon('hint');
    const p1label = h('span', { class: 'rc-p1-label' }), p1rail = q('rc-rail rc-p1-rail');
    const p1box = h('div', { class: 'rc-p1', 'data-target': 'p1', onclick: () => this.setTarget('p1') }, p1label, p1rail);
    if (!lv.p1Slots) p1box.hidden = true;
    rail.addEventListener('click', () => this.setTarget('main'));
    this.el = { brief, note, count, rail, tray, garage, send, clear, hint, bot, canvas, p1box, p1rail, p1label };
    const top = h('header', { class: 'rc-top' }, h('div', { class: 'rc-title' }, h('b', {}, lv.id), ` ${lv.title}`), bot, brief, hint);
    const side = h('aside', { class: 'rc-side' }, garage, count, rail, p1box, tray, h('div', { class: 'rc-actions' }, clear, send));
    const stage = h('div', { class: 'rc-stagewrap' }, canvas, note);
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

  private add(key: CardKey): void {
    if (this.state !== 'edit') return;
    if (this.target === 'p1' && key !== 'C') {
      if (key === 'X') { this.say('魔法卡里不能放重复卡。', 'thinking'); sfx.play('ui-locked'); return; }
      if (this.p1.length >= (this.lv.p1Slots ?? 0)) { this.say('魔法卡放满了。先拿掉一张再放。', 'thinking'); sfx.play('ui-locked'); return; }
      this.p1.push(key); sfx.play('place-piece'); this.afterEdit(); return;
    }
    if (key === 'C') this.target = 'main';                                     // a magic card is always played from the main row
    if (key === 'X') {
      if (this.open >= 0) { this.closeBlock(); return; }                       // tapping 重复 again closes the open bracket
      if (cost(this.prog) >= this.slots) return this.full();
      this.prog.push({ k: 'X', n: 2, body: [] }); this.open = this.prog.length - 1;
      sfx.play('place-piece'); this.say('把要重复的卡放进括号里，点数字可以改次数。', 'thinking'); this.afterEdit(); return;
    }
    if (cost(this.prog) >= this.slots) return this.full();
    const blk = this.open >= 0 ? this.blockAt(this.open) : null;
    if (blk) {
      blk.body.push(key);
      if (blk.body.length >= MAX_BODY) { this.open = -1; this.say(`括号里最多放 ${MAX_BODY} 张卡。`, 'happy'); }
    } else this.prog.push(key);
    sfx.play('place-piece'); this.afterEdit();
    this.coach();
  }
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
    if (this.state !== 'edit' || !this.lv.p1Slots || this.target === t) return;
    this.target = t; sfx.play('ui-tap');
    this.say(t === 'p1' ? '现在放进魔法卡里。' : '现在放进主程序里。', 'happy'); this.refresh();
  }
  private removeP1(k: number): void { if (this.state !== 'edit') return; this.p1.splice(k, 1); sfx.play('ui-pop'); this.afterEdit(); }
  private full(): void { this.say('卡槽满了。先拿掉一张再放。', 'thinking'); sfx.play('ui-locked'); }
  private removeCard(i: number, j?: number): void {
    if (this.state !== 'edit') return;
    const blk = j === undefined ? null : this.blockAt(i);
    if (blk && j !== undefined) blk.body.splice(j, 1); else this.removeItem(i);
    sfx.play('ui-pop'); this.afterEdit();
  }
  private removeItem(i: number): void {
    this.prog.splice(i, 1);
    if (this.open === i) this.open = -1; else if (this.open > i) this.open -= 1;
  }
  private cycle(i: number): void {
    const blk = this.blockAt(i);
    if (!blk || this.state !== 'edit') return;
    blk.n = blk.n >= 5 ? 2 : blk.n + 1; sfx.play('ui-tick'); this.afterEdit();
  }
  private closeBlock(): void { this.open = -1; sfx.play('ui-tap'); this.afterEdit(); }
  private clear(): void {
    if (this.state !== 'edit') return;
    this.prog = this.lv.buggy ? parseProg(this.lv.buggy) : []; this.p1 = this.lv.buggyP1 ? ([...this.lv.buggyP1] as Card[]) : []; this.open = -1; this.target = 'main'; sfx.play('ui-tap'); this.afterEdit();
  }
  private afterEdit(): void { this.marker = null; this.hintItem = -1; this.hintP1 = false; this.nextPulse = null; this.refresh(); }

  private setPart(part: Part, val: string): void {
    if (this.state !== 'edit') return;
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

  private tile(card: MainCard, i: number, j?: number): HTMLElement {
    const now = !!this.nowAt && this.nowAt[0] === i && this.nowAt[1] === j;
    const b = h('button', {
      class: `rc-slot is-full${now ? ' is-now' : ''}${this.hintItem === i && j === undefined ? ' is-hint' : ''}`, type: 'button', 'data-i': String(i), ...(j === undefined ? {} : { 'data-j': String(j) }),
      'aria-label': `${CARD_NAME[card]}，点一下拿掉`, onclick: () => this.removeCard(i, j),
    });
    b.innerHTML = cardSvg(card);
    return b;
  }

  /** everything that depends on the programme or the garage: the rail, the count, the ghost path, the buttons */
  private refresh(): void {
    const { el, lv } = this;
    const slots = this.slots; const used = cost(this.prog);
    el.count.textContent = `${used} / ${slots}`;
    const nodes: HTMLElement[] = [];
    this.prog.forEach((it, i) => {
      if (!isBlock(it)) { nodes.push(this.tile(it, i)); return; }
      const isOpen = i === this.open;
      const head = h('button', {
        class: `rc-slot rc-bh${this.nowAt && this.nowAt[0] === i ? ' is-now' : ''}${this.hintItem === i ? ' is-hint' : ''}`, type: 'button', 'data-i': String(i), 'data-j': 'h',
        'aria-label': `重复 ${it.n} 次，点一下改次数`, onclick: () => this.cycle(i),
      });
      head.innerHTML = `${cardSvg('X')}<b>${it.n}</b>`;
      const tools: HTMLElement[] = [];
      if (isOpen) tools.push(h('button', { class: `rc-bclose${this.nextPulse === 'close' ? ' is-pulse' : ''}`, type: 'button', 'aria-label': '括号收好', onclick: () => this.closeBlock() }, '收好'));
      tools.push(h('button', { class: 'rc-bdel', type: 'button', 'aria-label': '拿掉整个重复块', onclick: () => this.removeCard(i) }, '×'));
      nodes.push(h('div', { class: `rc-block${isOpen ? ' is-open' : ''}`, 'data-i': String(i) }, head, ...it.body.map((c, j) => this.tile(c, i, j)), ...tools));
    });
    for (let k = used; k < slots; k++) nodes.push(h('span', { class: 'rc-slot rc-empty', 'aria-hidden': 'true' }, String(k + 1)));
    el.rail.replaceChildren(...nodes);
    if (lv.p1Slots) {
      el.p1box.classList.toggle('is-target', this.target === 'p1');
      el.p1box.classList.toggle('is-hint', this.hintP1);
      el.rail.classList.toggle('is-target', this.target === 'main');
      el.p1label.textContent = `魔法卡 ${this.p1.length} / ${lv.p1Slots}`;
      const tiles: HTMLElement[] = this.p1.map((c, k) => {
        const b = h('button', { class: `rc-slot is-full${this.nowP1 === k ? ' is-now' : ''}`, type: 'button', 'data-k': String(k), 'aria-label': `魔法卡第 ${k + 1} 张：${CARD_NAME[c]}，点一下拿掉`, onclick: (e: Event) => { e.stopPropagation(); this.removeP1(k); } });
        b.innerHTML = cardSvg(c);
        return b;
      });
      for (let k = this.p1.length; k < lv.p1Slots; k++) tiles.push(h('span', { class: 'rc-slot rc-empty', 'aria-hidden': 'true' }, String(k + 1)));
      el.p1rail.replaceChildren(...tiles);
    }
    const first = FIRST_CARD[lv.id];
    for (const b of Array.from(el.tray.children) as HTMLElement[]) {
      const c = b.dataset.card;
      const intro = !!first && c === first && !this.prog.length && this.state === 'edit' && this.hints === 0;
      b.classList.toggle('is-pulse', c === this.nextPulse || intro);
    }
    const sendable = this.state === 'edit' && this.prog.length > 0;
    (el.send as HTMLButtonElement).disabled = !sendable;
    el.send.classList.toggle('is-pulse', FIRST_SEND.includes(lv.id) && sendable && this.tries === 0 && this.open < 0 && !this.hasEmptyBlock());
    (el.clear as HTMLButtonElement).disabled = this.state !== 'edit';
    for (const row of Array.from(el.garage.querySelectorAll<HTMLElement>('.rc-part'))) {
      const part = row.dataset.part as Part;
      for (const b of Array.from(row.querySelectorAll<HTMLElement>('.rc-opt'))) b.setAttribute('aria-pressed', String(this.cfgOf(part) === b.dataset.val));
    }
    const mode = lv.ghost ?? 'off';
    if (mode === 'off' || !this.prog.length || this.state !== 'edit' || this.hasEmptyBlock()) this.ghost = null;
    else {
      const r = run(lv, this.cfg, this.prog, this.p1);
      this.ghost = { mode, pts: [{ x: lv.start.x, y: lv.start.y }, ...r.steps.filter((s) => !s.err).map((s) => ({ x: s.s.x, y: s.s.y }))] };
    }
    if (this.state === 'edit') this.resetRover();
  }
  private hasEmptyBlock(): boolean { return this.prog.some((it) => isBlock(it) && !it.body.length); }

  // ───────────────────────────────────────────────────────── hints
  private hint(): void {
    if (this.state !== 'edit') return;
    this.hints++;
    sfx.play('hint');
    if (this.hints === 1) { this.say(this.lv.teach, 'thinking'); return; }
    this.hinted = true; // a pulsing hint leaves the level at one star
    if (this.lv.buggy && this.lv.fix) {
      const fix = parseProg(this.lv.fix);
      let i = 0;
      while (i < this.prog.length && i < fix.length && sameItem(this.prog[i], fix[i])) i++;
      this.hintItem = i < this.prog.length ? i : -1;
      if (i >= this.prog.length && i >= fix.length && this.lv.fixP1 !== undefined && this.p1.join('') !== this.lv.fixP1) this.hintP1 = true; // the mistake is in the magic card
      this.say('看一看这一格：这里的卡可能要换一换。', 'encouraging');
    } else {
      const want = this.lv.solution.main, have = partial(this.prog, this.open);
      const want1 = this.lv.solution.p1 ?? '', have1 = this.p1.join('');
      if (!want.startsWith(have) || !want1.startsWith(have1)) { this.say('先点“清空”，从头再排一次吧。', 'encouraging'); return; }
      const mainDone = have === want && this.open < 0;
      if (mainDone && want1.length > have1.length) { this.target = 'p1'; this.nextPulse = want1[have1.length] as Card; this.say('魔法卡里放这一张。', 'encouraging'); this.refresh(); return; }
      const next = want[have.length];
      this.nextPulse = next === undefined ? null : /[2-5]/.test(next) ? 'X' : next === ')' ? 'close' : (next as CardKey);
      this.say(this.nextPulse === 'X' ? '试试用重复卡。' : this.nextPulse === 'close' ? '括号里放好了，点“收好”。' : '试试这张卡。', 'encouraging');
    }
    this.refresh();
  }

  // ───────────────────────────────────────────────────────── running
  private async send(): Promise<void> {
    if (this.state !== 'edit' || !this.prog.length) return;
    if (this.hasEmptyBlock()) {
      this.say('括号里还没有卡。', 'thinking'); sfx.play('ui-locked');
      this.el.rail.querySelector('.rc-block')?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return;
    }
    if (this.lv.p1Slots && !this.p1.length && this.prog.some((it) => it === 'C' || (isBlock(it) && it.body.includes('C')))) {
      this.say('魔法卡还是空的。', 'thinking'); sfx.play('ui-locked'); this.target = 'p1'; this.refresh(); return;
    }
    this.open = -1;
    this.state = 'running'; this.tries++; this.ghost = null; this.marker = null; this.nextPulse = null; this.hintItem = -1;
    this.refresh();
    sfx.play('launch');
    const prog = this.prog.map((it) => (isBlock(it) ? { ...it, body: [...it.body] } : it));
    const p1 = [...this.p1];
    const r = run(this.lv, this.cfg, prog, p1);
    this.resetRover();
    await this.wait(260);
    for (const st of r.steps) {
      if (this.dead) return;
      this.nowAt = st.path; this.nowP1 = st.p1 ?? -1; this.refresh();
      await this.perform(st);
      if (st.err) break;
    }
    this.nowAt = null; this.nowP1 = -1;
    await this.finish(r, prog, p1);
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
    if (r.res === 'win') {
      this.state = 'result';
      const stars = starsFor(lv, prog, r, this.hinted, p1);
      this.bot?.setMood('celebrating'); playSuccess(stars); sfx.play(`star-${stars}`);
      this.host.onWin(lv, stars);
      this.refresh();
      await this.wait(500);
      const praise = this.hinted ? '到啦！下一次试试不用提示。'
        : lv.buggy ? (stars === 3 ? '只改了该改的地方，真细心！' : '修好了！下次试试少改几张。')
          : stars === 3 ? '一张多余的卡都没有，真利落！' : stars === 2 ? '到啦！再少用一张卡就是三颗星。' : '到啦！想试试用更少的卡吗？';
      const nxt = nextLevel(lv.id);
      const id = await showResult({
        ribbon: `${lv.id} 完成`, title: lv.title, text: praise, stars, accentGame: 'rabbit',
        stats: [{ label: lv.buggy ? '改动' : '用了卡', value: lv.buggy ? `${editCount(parseProg(lv.buggy), prog, [...(lv.buggyP1 ?? '')] as Card[], p1)} 处` : `${cost(prog, p1)} 张` }],
        actions: [...(nxt ? [{ id: 'next', label: '下一关', kind: 'primary' as const }] : []), { id: 'again', label: '再来一次' }, { id: 'map', label: '回地图' }],
      });
      if (this.dead) return;
      if (id === 'next' && nxt) this.host.openLevel(nxt.id);
      else if (id === 'again') this.host.openLevel(lv.id);
      else this.host.goMap();
      return;
    }
    const last = r.s;
    if (r.res === 'crash' && r.err) { this.marker = { x: last.x, y: last.y, kind: 'crash' }; this.say(WHY[r.err], 'encouraging'); }
    else {
      this.marker = { x: last.x, y: last.y, kind: 'end' };
      const left = metresLeft(lv, last);
      if (!left && last.m !== lv.full) this.say('到终点了，可是还有样本没采。', 'encouraging');
      else if (!left) this.say('车停在终点了。', 'encouraging');
      else this.say(`程序跑完了，车停在这里，离终点还差 ${left} 米。`, 'encouraging');
    }
    playSoftMiss();
    await this.wait(1100);
    if (this.dead) return;
    this.state = 'edit'; this.marker = null; this.refresh();
  }

  // ───────────────────────────────────────────────────────── drawing
  private resetRover(): void {
    const s = startState(this.lv);
    this.rover = { x: s.x, y: s.y, ang: s.d * 90, lift: cellAt(this.lv, s.x, s.y).h }; this.taken = 0; this.crystal = false;
  }
  private draw(): void {
    this.board.draw({ lv: this.lv, cfg: this.cfg, rover: this.rover, taken: this.taken, crystal: this.crystal, ghost: this.ghost, marker: this.marker, now: performance.now() });
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
