import { playSoftMiss, playSuccess, sfx } from '@kit/audio';
import { mount, type Companion } from '@kit/companion';
import { h, icon, showResult } from '@kit/ui';
import { CARD_NAME, COND_NAME, cardSvg, condSvg } from '../cards';
import { nextLevel } from '../model/levels';
import { DEFAULT_CONFIG, autopilot, cellAt, metresLeft, ruleStars, startState, type AutoResult, type AutoStep, type Card, type Cond, type Err, type Level, type RuleLevel, type Rules } from '../model/sim';
import { Board } from '../render/board';
import type { PlayHost } from './play';

type Act = 'L' | 'R' | 'P';
interface Slot { cond: Cond | null; act: Act | null }
interface Track { lv: Level; board: Board; rover: { x: number; y: number; ang: number; lift: number }; taken: number; crystal: boolean; marker: { x: number; y: number; kind: 'crash' | 'end' } | null }

const WHY: Record<Err, string> = {
  edge: '前面没有路了。', rock: '前面是大石头。', step: '台阶太高。', narrow: '这条缝太窄。', overhang: '石拱太矮。', nosample: '这里没有样本可以采。', dark: '阴影里看不清样本。',
};
const FRAME_MS = 20;

/**
 * 规则关 (chapter 7 and C8-6): two maps side by side, one set of rules for both. The rover drives on by itself, "一直走，到终点就停";
 * the child only says what to do when something happens: "如果是蓝格，就右转".
 */
export class RulesScreen {
  private bot: Companion | null = null;
  private tracks: Track[] = [];
  private slots: Slot[];
  private state: 'edit' | 'running' | 'result' = 'edit';
  private hints = 0;
  private hinted = false;
  private tries = 0;
  private dead = false;
  private raf = 0;
  private pulse: { cond?: Cond; act?: Act } = {};
  private el!: Record<'brief' | 'count' | 'rules' | 'conds' | 'acts' | 'send' | 'clear' | 'hint' | 'bot' | 'stage', HTMLElement>;

  constructor(private host: PlayHost, readonly lv: RuleLevel) {
    this.slots = Array.from({ length: lv.ruleSlots }, () => ({ cond: null, act: null }));
    this.build();
    this.say(lv.brief, 'happy');
    this.refresh();
    const loop = () => { if (this.dead) return; for (const t of this.tracks) this.draw(t); this.raf = requestAnimationFrame(loop); };
    requestAnimationFrame(() => { this.resize(); loop(); });
  }

  private build(): void {
    const { lv } = this;
    const q = (cls: string) => h('div', { class: cls });
    const brief = q('rc-brief'), count = q('rc-count'), rules = q('rc-rules'), conds = q('rc-tray rc-conds'), acts = q('rc-tray rc-acts'), bot = q('rc-bot');
    const send = h('button', { class: 'xg-btn xg-btn--primary xg-btn--lg rc-send', type: 'button', onclick: () => void this.send() }, '发送');
    const clear = h('button', { class: 'xg-btn rc-clear', type: 'button', onclick: () => this.clear() }, '清空');
    const hint = h('button', { class: 'xg-btn rc-hint', type: 'button', 'aria-label': '提示', onclick: () => this.hint() });
    hint.innerHTML = icon('hint');
    const stage = q('rc-stagepair');
    this.tracks = lv.maps.map((m, i) => {
      const canvas = h('canvas', { class: 'rc-stage', 'aria-label': `月面地图 ${'AB'[i]}` });
      stage.append(h('div', { class: 'rc-stagewrap rc-half' }, canvas, h('span', { class: 'rc-maptag' }, `图 ${'AB'[i]}`)));
      const s = startState(m);
      return { lv: m, board: new Board(canvas), rover: { x: s.x, y: s.y, ang: s.d * 90, lift: cellAt(m, s.x, s.y).h }, taken: 0, crystal: false, marker: null };
    });
    this.el = { brief, count, rules, conds, acts, send, clear, hint, bot, stage };
    const top = h('header', { class: 'rc-top' }, h('div', { class: 'rc-title' }, h('b', {}, lv.id), ` ${lv.title}`), bot, brief, hint);
    const side = h('aside', { class: 'rc-side' }, count, rules,
      h('div', { class: 'rc-trayhead' }, '如果……'), conds, h('div', { class: 'rc-trayhead' }, '就……'), acts, h('div', { class: 'rc-actions' }, clear, send));
    this.host.root.replaceChildren(h('section', { class: 'rc-play rc-rulesplay', 'data-ch': String(lv.ch) }, top, stage, side));
    try { this.bot = mount(bot, { size: 64 }); } catch { this.bot = null; }
    for (const c of lv.conds) {
      const b = h('button', { class: 'xg-btn rc-card rc-cond', type: 'button', 'data-cond': c, 'aria-label': `如果是${COND_NAME[c]}`, onclick: () => this.pickCond(c) });
      b.innerHTML = condSvg(c) + `<small>${COND_NAME[c]}</small>`;
      conds.append(b);
    }
    const hasSample = lv.maps.some((m) => m.req.some((r) => r.kind === 'a' || r.kind === 'd'));
    for (const a of (hasSample ? ['L', 'R', 'P'] : ['L', 'R']) as Act[]) {
      const b = h('button', { class: 'xg-btn rc-card rc-act', type: 'button', 'data-act': a, 'aria-label': `就${CARD_NAME[a]}`, onclick: () => this.pickAct(a) });
      b.innerHTML = cardSvg(a);
      acts.append(b);
    }
  }

  // ───────────────────────────────────────────────────────── the rules
  private used = (c: Cond): boolean => this.slots.some((s) => s.cond === c);
  private pickCond(c: Cond): void {
    if (this.state !== 'edit') return;
    if (this.used(c)) { this.say('这个条件已经有规则了。', 'thinking'); sfx.play('ui-locked'); return; }
    const slot = this.slots.find((s) => !s.cond);
    if (!slot) { this.say('规则槽满了。先拿掉一条再放。', 'thinking'); sfx.play('ui-locked'); return; }
    slot.cond = c; sfx.play('place-piece'); this.afterEdit();
  }
  private pickAct(a: Act): void {
    if (this.state !== 'edit') return;
    const slot = this.slots.find((s) => s.cond && !s.act) ?? this.slots.find((s) => !s.act);
    if (!slot) { this.say('每条规则都有动作了。', 'thinking'); sfx.play('ui-locked'); return; }
    slot.act = a; sfx.play('place-piece'); this.afterEdit();
  }
  private clearPart(i: number, part: 'cond' | 'act'): void {
    if (this.state !== 'edit') return;
    this.slots[i][part] = null; sfx.play('ui-pop'); this.afterEdit();
  }
  private clear(): void {
    if (this.state !== 'edit') return;
    for (const s of this.slots) { s.cond = null; s.act = null; }
    sfx.play('ui-tap'); this.afterEdit();
  }
  private afterEdit(): void { this.pulse = {}; for (const t of this.tracks) t.marker = null; this.refresh(); }
  private rules(): Rules { const r: Rules = {}; for (const s of this.slots) if (s.cond && s.act) r[s.cond] = s.act; return r; }
  private half(): boolean { return this.slots.some((s) => !!s.cond !== !!s.act); }

  private refresh(): void {
    const { el, lv } = this;
    const done = this.slots.filter((s) => s.cond && s.act).length;
    el.count.textContent = `${done} / ${lv.ruleSlots}`;
    el.rules.replaceChildren(...this.slots.map((s, i) => {
      const cond = h('button', { class: `rc-slot rc-rc${s.cond ? ' is-full' : ' rc-empty'}${!s.cond && !!s.act ? ' is-warn' : ''}`, type: 'button', 'aria-label': s.cond ? `如果${COND_NAME[s.cond]}，点一下拿掉` : '空的条件', onclick: () => s.cond && this.clearPart(i, 'cond') });
      if (s.cond) cond.innerHTML = condSvg(s.cond); else cond.textContent = '?';
      const act = h('button', { class: `rc-slot rc-ra${s.act ? ' is-full' : ' rc-empty'}${!s.act && !!s.cond ? ' is-warn' : ''}`, type: 'button', 'aria-label': s.act ? `就${CARD_NAME[s.act]}，点一下拿掉` : '空的动作', onclick: () => s.act && this.clearPart(i, 'act') });
      if (s.act) act.innerHTML = cardSvg(s.act); else act.textContent = '?';
      return h('div', { class: 'rc-rule' }, h('span', { class: 'rc-if' }, '如果'), cond, h('span', { class: 'rc-then' }, '就'), act);
    }));
    for (const b of Array.from(el.conds.children) as HTMLElement[]) {
      b.toggleAttribute('data-used', this.used(b.dataset.cond as Cond));
      b.classList.toggle('is-pulse', b.dataset.cond === this.pulse.cond);
      b.classList.toggle('is-dim', this.used(b.dataset.cond as Cond));
    }
    for (const b of Array.from(el.acts.children) as HTMLElement[]) b.classList.toggle('is-pulse', b.dataset.act === this.pulse.act);
    (el.send as HTMLButtonElement).disabled = this.state !== 'edit' || !done || this.half();
    el.send.classList.toggle('is-pulse', this.lv.id === 'C7-1' && this.state === 'edit' && done > 0 && !this.half() && this.tries === 0);
    (el.clear as HTMLButtonElement).disabled = this.state !== 'edit';
    if (this.state === 'edit') for (const t of this.tracks) this.reset(t);
  }

  // ───────────────────────────────────────────────────────── hints
  private hint(): void {
    if (this.state !== 'edit') return;
    this.hints++; sfx.play('hint');
    if (this.hints === 1) { this.say(this.lv.teach, 'thinking'); return; }
    this.hinted = true;                                                         // a pulsing hint leaves the level at one star
    const want = Object.entries(this.lv.solution) as [Cond, Act][];
    const bad = this.slots.find((s) => s.cond && (!(s.cond in this.lv.solution) || (s.act && s.act !== this.lv.solution[s.cond])));
    if (bad) { this.say('先拿掉这一条，再换一换。', 'encouraging'); return; }
    const todo = want.find(([c]) => !this.slots.some((s) => s.cond === c && s.act));
    if (!todo) { this.say('规则都放好了，按“发送”。', 'encouraging'); return; }
    const has = this.slots.find((s) => s.cond === todo[0]);
    if (has) { this.pulse = { act: todo[1] }; this.say('这条规则还差一个动作。', 'encouraging'); } else { this.pulse = { cond: todo[0] }; this.say('试试这个条件。', 'encouraging'); }
    this.refresh();
  }

  // ───────────────────────────────────────────────────────── running
  private async send(): Promise<void> {
    if (this.state !== 'edit' || this.half()) return;
    const rules = this.rules();
    if (!Object.keys(rules).length) return;
    this.state = 'running'; this.tries++; this.pulse = {};
    this.refresh(); sfx.play('launch');
    const results = this.tracks.map((t) => autopilot(t.lv, DEFAULT_CONFIG, rules));
    await this.wait(260);
    await Promise.all(this.tracks.map((t, i) => this.play(t, results[i].steps)));
    if (this.dead) return;
    await this.finish(results, rules);
  }

  private async play(t: Track, steps: AutoStep[]): Promise<void> {
    for (const st of steps) {
      if (this.dead) return;
      await this.perform(t, st);
      if (st.err) return;
    }
  }
  private async perform(t: Track, st: AutoStep): Promise<void> {
    const from = { ...t.rover };
    const dAng = ((st.s.d * 90 - from.ang + 540) % 360) - 180;
    const toLift = cellAt(t.lv, st.s.x, st.s.y).h;
    const moved = st.s.x !== Math.round(from.x) || st.s.y !== Math.round(from.y);
    if (st.card === 'P') { if (!st.err) { sfx.play('lock-in'); t.taken = st.s.m; await this.wait(220); } return; }
    if (dAng !== 0) await this.tween(st.card === 'L' || st.card === 'R' ? 200 : 140, (p) => { t.rover.ang = from.ang + dAng * p; });
    if (st.card === 'L' || st.card === 'R') { t.rover.ang = from.ang + dAng; return; }
    if (st.err) { sfx.play('bump'); return; }
    if (moved) {
      await this.tween(240, (p) => { t.rover.x = from.x + (st.s.x - from.x) * p; t.rover.y = from.y + (st.s.y - from.y) * p; t.rover.lift = from.lift + (toLift - from.lift) * p; });
      if (t.lv.req.some((r, i) => r.kind === 'r' && r.x === st.s.x && r.y === st.s.y && !((t.taken >> i) & 1))) { t.taken = st.s.m; sfx.play('coin'); }
      if (st.s.c === 1) t.crystal = true;
      t.taken = st.s.m;
    }
  }

  private async finish(results: AutoResult[], rules: Rules): Promise<void> {
    const { lv } = this;
    if (results.every((r) => r.res === 'win')) {
      this.state = 'result';
      const stars = ruleStars(lv, rules, this.hinted);
      this.bot?.setMood('celebrating'); playSuccess(stars); sfx.play(`star-${stars}`);
      this.host.onWin(lv, stars);
      this.refresh(); await this.wait(500);
      const nxt = nextLevel(lv.id);
      const id = await showResult({
        ribbon: `${lv.id} 完成`, title: lv.title, stars, accentGame: 'rabbit',
        text: this.hinted ? '两张图都到啦！下一次试试不用提示。' : stars === 3 ? '两张图都到啦，规则一条不多！' : '两张图都到啦！想试试用更少的规则吗？',
        stats: [{ label: '用了规则', value: `${Object.keys(rules).length} 条` }],
        actions: [...(nxt ? [{ id: 'next', label: '下一关', kind: 'primary' as const }] : []), { id: 'again', label: '再来一次' }, { id: 'map', label: '回地图' }],
      });
      if (this.dead) return;
      if (id === 'next' && nxt) this.host.openLevel(nxt.id); else if (id === 'again') this.host.openLevel(lv.id); else this.host.goMap();
      return;
    }
    const bad = results.findIndex((r) => r.res !== 'win');
    results.forEach((r, i) => { if (r.res !== 'win') this.tracks[i].marker = { x: r.s.x, y: r.s.y, kind: r.res === 'crash' ? 'crash' : 'end' }; });
    const r = results[bad]; const tag = `图 ${'AB'[bad]}`;
    this.say(r.res === 'crash' && r.err ? `${tag}：${WHY[r.err]}`
      : r.res === 'stuck' ? `${tag}：前面堵住了，转了三下还是出不去。`
        : r.res === 'loop' ? `${tag}：车在原地绕圈了。`
          : r.res === 'cap' ? `${tag}：走了很久还没到终点。`
            : `${tag}：还差 ${metresLeft(this.tracks[bad].lv, r.s)} 米。`, 'encouraging');
    playSoftMiss();
    await this.wait(1200);
    if (this.dead) return;
    this.state = 'edit'; for (const t of this.tracks) t.marker = null; this.refresh();
  }

  // ───────────────────────────────────────────────────────── drawing
  private reset(t: Track): void { const s = startState(t.lv); t.rover = { x: s.x, y: s.y, ang: s.d * 90, lift: cellAt(t.lv, s.x, s.y).h }; t.taken = 0; t.crystal = false; }
  private draw(t: Track): void { t.board.draw({ lv: t.lv, cfg: DEFAULT_CONFIG, rover: t.rover, taken: t.taken, crystal: t.crystal, ghost: null, marker: t.marker, now: performance.now() }); }
  resize(): void { for (const t of this.tracks) t.board.resize(); }

  private say(text: string, mood: 'happy' | 'thinking' | 'encouraging' | 'celebrating' = 'happy'): void {
    this.el.brief.textContent = text;
    try { this.bot?.setMood(mood); } catch { /* ignore */ }
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

export type { Card };
