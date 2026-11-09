import { playSoftMiss, playSuccess, sfx } from '@kit/audio';
import { mount, type Companion } from '@kit/companion';
import { h, icon, showResult } from '@kit/ui';
import { CARD_NAME, cardSvg } from '../cards';
import { nextLevel } from '../model/levels';
import { DEFAULT_CONFIG, cellAt, metresLeft, parseProg, run, slotsOf, startState, type Card, type Config, type Err, type Level, type Part, type RunResult } from '../model/sim';
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
const GARAGE: Record<Part, { label: string; opts: [string, string, string][]; note: Record<string, string> }> = {
  wheels: { label: '轮子', opts: [['S', '小轮', 'wheel-s'], ['L', '大轮', 'wheel-l']], note: { S: '小轮子：只能上 1 级台阶。', L: '大轮子：能上 2 级台阶，但是更重，电量少 2 格。' } },
  panel: { label: '电池板', opts: [['S', '小板', 'panel-s'], ['L', '大板', 'panel-l']], note: { S: '小电池板：窄缝也能过。', L: '大电池板：电量多 3 格，可是窄缝过不去。' } },
  mast: { label: '天线', opts: [['S', '矮杆', 'mast-s'], ['T', '高杆', 'mast-t']], note: { S: '矮天线：能过低矮的石拱。', T: '高天线：能看见阴影里的样本，可是过不了石拱。' } },
};
const MAX_MS = 20; // a frame is drawn at least this often while the screen is up (the lights and the samples breathe)

export class PlayScreen {
  private board: Board;
  private bot: Companion | null = null;
  private cfg: Config = { ...DEFAULT_CONFIG };
  private prog: Card[] = [];
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
  private el!: Record<'brief' | 'note' | 'count' | 'rail' | 'tray' | 'garage' | 'send' | 'clear' | 'hint' | 'bot' | 'canvas', HTMLElement>;
  private nextPulse: Card | null = null;
  private hintSlot = -1;
  private doneSlot = -1;

  constructor(private host: PlayHost, readonly lv: Level) {
    this.prog = lv.buggy ? parseProg(lv.buggy) : [];
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
    const q = (cls: string, tag = 'div') => h(tag as 'div', { class: cls });
    const brief = q('rc-brief'), note = q('rc-note'), count = q('rc-count'), rail = q('rc-rail'), tray = q('rc-tray'), garage = q('rc-garage');
    const bot = q('rc-bot');
    const send = h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg rc-send', type: 'button', onclick: () => void this.send() }, '发送');
    const clear = h('button', { class: 'xg-btn rc-clear', type: 'button', onclick: () => this.clear() }, lv.buggy ? '还原' : '清空');
    const hint = h('button', { class: 'xg-btn rc-hint', type: 'button', 'aria-label': '提示', onclick: () => this.hint() });
    hint.innerHTML = icon('hint');
    this.el = { brief, note, count, rail, tray, garage, send, clear, hint, bot, canvas };
    const top = h('header', { class: 'rc-top' },
      h('div', { class: 'rc-title' }, h('b', {}, lv.id), ` ${lv.title}`), bot, brief, hint);
    const side = h('aside', { class: 'rc-side' }, garage, count, rail, tray, h('div', { class: 'rc-actions' }, clear, send));
    const stage = h('div', { class: 'rc-stagewrap' }, canvas, note);
    const section = h('section', { class: 'rc-play', 'data-ch': String(lv.ch) }, top, stage, side);
    this.host.root.replaceChildren(section);
    try { this.bot = mount(bot, { size: 64 }); } catch { this.bot = null; }
    if (lv.fog) note.textContent = `任务单：${lv.fog.brief.map(([d, n]) => `向${DIRWORD[d]}开 ${n} 米`).join('，')}`;
    // the garage: one switch per opened part
    if (lv.garage) {
      for (const part of lv.garage.open) {
        const row = h('div', { class: 'rc-part', 'data-part': part }, h('span', { class: 'rc-part-name' }, GARAGE[part].label));
        for (const [val, label] of GARAGE[part].opts) {
          row.append(h('button', { class: 'xg-btn rc-opt', type: 'button', 'data-val': val, 'aria-pressed': String((this.cfg as unknown as Record<string, string>)[part] === val), onclick: () => this.setPart(part, val) }, label));
        }
        garage.append(row);
      }
      garage.append(h('div', { class: 'rc-part-note' }));
    }
    // the card box
    for (const c of lv.cards) {
      const b = h('button', { class: 'xg-btn rc-card', type: 'button', 'data-card': c, 'aria-label': CARD_NAME[c], onclick: () => this.add(c) });
      b.innerHTML = cardSvg(c);
      tray.append(b);
    }
  }

  // ───────────────────────────────────────────────────────── the programme
  private get slots(): number { return slotsOf(this.lv, this.cfg); }

  private add(c: Card): void {
    if (this.state !== 'edit') return;
    if (this.prog.length >= this.slots) { this.say('卡槽满了。先拿掉一张再放。', 'thinking'); sfx.play('ui-locked'); return; }
    this.prog.push(c); sfx.play('place-piece'); this.afterEdit();
  }
  private removeAt(i: number): void {
    if (this.state !== 'edit') return;
    this.prog.splice(i, 1); sfx.play('ui-pop'); this.afterEdit();
  }
  private clear(): void {
    if (this.state !== 'edit') return;
    this.prog = this.lv.buggy ? parseProg(this.lv.buggy) : []; sfx.play('ui-tap'); this.afterEdit();
  }
  private afterEdit(): void { this.marker = null; this.hintSlot = -1; this.nextPulse = null; this.refresh(); }

  private setPart(part: Part, val: string): void {
    if (this.state !== 'edit') return;
    (this.cfg as unknown as Record<string, string>)[part] = val;
    sfx.play('ui-toggle-on');
    if (this.prog.length > this.slots) { this.prog.length = this.slots; this.say('大轮子更重，电量少了，最后几张卡放不下了。', 'thinking'); }
    else this.say(GARAGE[part].note[val], 'thinking');
    this.afterEdit();
  }

  /** everything that depends on the programme or the garage: the rail, the count, the ghost path, the buttons */
  private refresh(): void {
    const { el, lv } = this;
    const slots = this.slots;
    el.count.textContent = `${this.prog.length} / ${slots}`;
    el.rail.replaceChildren(...Array.from({ length: slots }, (_, i) => {
      const c = this.prog[i];
      const b = h('button', { class: `rc-slot${c ? ' is-full' : ''}${i === this.hintSlot ? ' is-hint' : ''}${i === this.doneSlot ? ' is-now' : ''}`, type: 'button', 'aria-label': c ? `第 ${i + 1} 张：${CARD_NAME[c]}，点一下拿掉` : `第 ${i + 1} 个空槽`, 'data-i': String(i), onclick: () => c && this.removeAt(i) });
      if (c) b.innerHTML = cardSvg(c); else b.textContent = String(i + 1);
      return b;
    }));
    for (const b of Array.from(el.tray.children) as HTMLElement[]) b.classList.toggle('is-pulse', b.dataset.card === this.nextPulse || (lv.id === 'C1-1' && !this.prog.length && this.state === 'edit' && this.hints === 0));
    (el.send as HTMLButtonElement).disabled = this.state !== 'edit' || !this.prog.length;
    (el.clear as HTMLButtonElement).disabled = this.state !== 'edit';
    for (const row of Array.from(el.garage.querySelectorAll<HTMLElement>('.rc-part'))) {
      const part = row.dataset.part as Part;
      for (const b of Array.from(row.querySelectorAll<HTMLElement>('.rc-opt'))) b.setAttribute('aria-pressed', String((this.cfg as unknown as Record<string, string>)[part] === b.dataset.val));
    }
    const mode = lv.ghost ?? 'off';
    if (mode === 'off' || !this.prog.length || this.state !== 'edit') this.ghost = null;
    else {
      const r = run(lv, this.cfg, this.prog);
      this.ghost = { mode, pts: [{ x: lv.start.x, y: lv.start.y }, ...r.steps.filter((s) => !s.err).map((s) => ({ x: s.s.x, y: s.s.y }))] };
    }
    if (this.state === 'edit') this.resetRover();
  }

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
      while (i < this.prog.length && i < fix.length && this.prog[i] === fix[i]) i++;
      this.hintSlot = i < this.slots ? i : -1;
      this.say('看一看这一格：这里的卡可能要换一换。', 'encouraging');
    } else {
      const sol = parseProg(this.lv.solution.main);
      const prefix = this.prog.every((c, i) => c === sol[i]);
      if (!prefix) { this.say('先点“清空”，从头再排一次吧。', 'encouraging'); return; }
      this.nextPulse = sol[this.prog.length] ?? null;
      this.say('试试这张卡。', 'encouraging');
    }
    this.refresh();
  }

  // ───────────────────────────────────────────────────────── running
  private async send(): Promise<void> {
    if (this.state !== 'edit' || !this.prog.length) return;
    this.state = 'running'; this.tries++; this.ghost = null; this.marker = null; this.nextPulse = null; this.hintSlot = -1;
    this.refresh();
    sfx.play('launch');
    const prog = [...this.prog];
    const r = run(this.lv, this.cfg, prog);
    this.resetRover();
    await this.wait(260);
    for (const st of r.steps) {
      if (this.dead) return;
      this.doneSlot = st.index; this.refresh2();
      await this.perform(st);
      if (st.err) break;
    }
    this.doneSlot = -1;
    await this.finish(r, prog);
  }
  private refresh2(): void { this.el.rail.querySelectorAll('.rc-slot').forEach((b, i) => b.classList.toggle('is-now', i === this.doneSlot)); }

  /** one card, animated: a turn rotates in place, a move slides, a sample pulses; a card the rover cannot do bumps */
  private async perform(st: RunResult['steps'][number]): Promise<void> {
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

  private async finish(r: RunResult, prog: Card[]): Promise<void> {
    const { lv } = this;
    if (r.res === 'win') {
      this.state = 'result';
      const stars = starsFor(lv, prog, r, this.hinted);
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
        stats: [{ label: lv.buggy ? '改动' : '用了卡', value: lv.buggy ? `${starsDistance(lv, prog)} 处` : `${prog.length} 张` }],
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
        if (p < 1) setTimeout(tick, MAX_MS); else done();
      };
      tick();
    });
  }

  dispose(): void { this.dead = true; cancelAnimationFrame(this.raf); try { this.bot?.destroy(); } catch { /* ignore */ } }
}

import { editCount } from '../model/sim';
const starsDistance = (lv: Level, prog: Card[]): number => editCount(parseProg(lv.buggy!), prog);
