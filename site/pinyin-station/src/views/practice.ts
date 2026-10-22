import { familyToken } from '../speech/family';
import { ordering } from './kinds/ordering';
import { reading } from './kinds/reading';
import { blending } from './kinds/blending';
import { spelling } from './kinds/spelling';
import { listening } from './kinds/listening';
import { readPicture } from './kinds/readPicture';
import { h } from '@kit/ui';
import { mount } from '@kit/companion';
import { displayPinyin, parseSyllable } from '../domain/pinyin';
import { beginSession, insertContrasts, nextQuestion, recordAttempt, schedule } from '../domain/learning';
import type { Question } from '../domain/types';
import { Microphone } from '../speech/mic';
import { assess } from '../speech/client';
import { questionPlan } from '../speech/reference';
import { saveRecording, type Recording } from '../speech/recordings';
import { button, glyph, pinyin, type Context } from './common';

const titles = {
  A: '声音来信',
  B: '小耳朵接信号',
  C: '把声音接起来',
  D: '小小播音员',
  E: '给声音找个家',
  F: '图画也会说拼音',
  G: '把一句话接通',
};
export class Practice {
  readonly el = h('section', { class: 'practice', 'aria-label': '电台节目' });
  private queue: Question[];
  index = 0;
  private tries = 0;
  private stopped = false;
  private generation = 0;
  private mic = new Microphone();
  private abort: AbortController | null = null;
  private recorded: Recording[] = [];
  locked = false;
  syllableIndex = 0;
  fullParts = 0;
  assisted = false;
  private insertedContrasts = new Set<string>();
  sentence: string[] = [];
  used = new Set<number>();
  instruction = h('p', { class: 'instruction', 'aria-live': 'polite' });
  stage = h('div', { class: 'practice-stage' });
  private feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  actions = h('div', { class: 'practice-actions' });
  constructor(
    readonly ctx: Context,
    mode: string,
  ) {
    this.queue = schedule(ctx.save, ctx.bank, mode);
    this.render();
  }
  get q() {
    return this.queue[this.index];
  }
  get word() {
    return [...this.ctx.bank.words, ...this.ctx.save.customWords].find((w) => w.id === this.q.target)!;
  }
  private speak(id: string) {
    void this.ctx.say(id);
  }
  private get assessment() {
    return questionPlan(this.q, this.ctx.bank, this.q.kind === 'C' ? undefined : this.word);
  }
  async stimulus() {
    if (this.el.classList.contains('is-recording')) return;
    if (this.q.kind === 'A') {
      const l = this.ctx.bank.letters.find((l) => l.id === this.q.target);
      if (l) await this.ctx.syllable(l.callSound);
    } else if (this.q.kind === 'B' || this.q.kind === 'C') await this.ctx.syllable(this.q.target);
    else await this.ctx.word(this.word);
  }
  private render() {
    if (this.stopped) return;
    this.el.classList.remove('is-resolved', 'has-recording');
    this.generation++;
    this.locked = false;
    this.assisted = this.q.practiceOnly ?? false;
    this.syllableIndex = 0;
    this.fullParts = 0;
    this.sentence = [];
    this.used.clear();
    const phase = this.q.phase === 'warmup' ? '热身信号' : '主节目';
    const steps = h(
      'div',
      { class: 'signal-steps', 'aria-label': `${phase}，正在接通信号` },
      this.queue
        .slice(0, 15)
        .map((_, i) => h('i', { class: i < this.index ? 'lit' : i === this.index ? 'current' : '' })),
    );
    const header = h(
      'div',
      { class: 'practice-header' },
      button('收好电台', () => this.finish(), 'quiet', 'back'),
      h('div', null, h('small', null, phase), h('h2', null, titles[this.q.kind])),
      steps,
    );
    this.instruction = h('p', { class: 'instruction', 'aria-live': 'polite' }, this.prompt());
    this.stage = h('div', { class: `practice-stage type-${this.q.kind}` });
    this.feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    this.actions = h('div', { class: 'practice-actions' });
    const coach = h('div', { class: 'coach-mini' });
    mount(coach, { size: 80 });
    const controls = h(
      'div',
      { class: 'listening-tools' },
      button(
        '再听一遍',
        () => {
          void this.ctx
            .say(`py.${this.q.kind}`)
            .then(() => (['A', 'B', 'F'].includes(this.q.kind) ? this.stimulus() : undefined));
        },
        'quiet',
        'replay',
      ),
      button('给我线索', () => this.hint(), 'quiet', 'hint'),
    );
    this.el.replaceChildren(
      header,
      h('div', { class: 'question-head' }, coach, h('div', null, this.instruction, controls)),
      this.stage,
      this.feedback,
      this.actions,
    );
    this.draw();
    const scene = this.ctx.bank.scenes?.find((scene) => scene.id === this.q.scene);
    if (scene) {
      this.stage.prepend(
        h(
          'aside',
          { class: 'scene-context' },
          glyph('book'),
          h('div', null, h('b', null, scene.title), h('p', null, scene.prompt)),
        ),
      );
      const gen = this.generation;
      void this.ctx.explain(scene.prompt).then(() => {
        if (gen === this.generation && !this.stopped) this.speak(`py.${this.q.kind}`);
      });
      return;
    }
    if (this.q.kind === 'A' || this.q.kind === 'B') {
      const gen = this.generation;
      void this.ctx.say(`py.${this.q.kind}`).then(() => {
        if (gen === this.generation && !this.stopped) void this.stimulus();
      });
    } else this.speak(`py.${this.q.kind}`);
  }
  private prompt() {
    return {
      A: '听声音，找到它',
      B: '哪个声音和来信一样？',
      C: '点一点，让两个声音相遇',
      D: '把这条声音送到星港',
      E: '读一读，哪幅图住在里面？',
      F: '看图，把它的声音拼出来',
      G: '点点词卡，接成一句话',
    }[this.q.kind];
  }
  draw() {
    this.stage.replaceChildren();
    this.actions.replaceChildren();
    if (this.q.kind === 'E') this.readPicture();
    else if (this.q.kind === 'F') this.spelling();
    else if (this.q.kind === 'A' || this.q.kind === 'B') this.listening();
    else if (this.q.kind === 'C') this.blending();
    else if (this.q.kind === 'G') this.ordering();
    else this.reading();
  }
  readPicture() {
    readPicture.call(this);
  }

  listening() {
    listening.call(this);
  }

  spelling() {
    spelling.call(this);
  }

  blending() {
    blending.call(this);
  }

  lamps() {
    return h(
      'div',
      { class: 'three-lamps' },
      (this.assessment.mode === 1
        ? ['声母', '韵母', '声调']
        : this.assessment.mode === 6
          ? ['声母']
          : ['声母', '韵母']
      ).map((label) => h('div', { class: 'lamp' }, h('i'), h('span', null, label))),
    );
  }
  reading() {
    reading.call(this);
  }

  ordering() {
    ordering.call(this);
  }

  remember(correct: boolean, confusion?: string, judge: 'deterministic' | 'self' = 'deterministic') {
    beginSession(this.ctx.save);
    recordAttempt(this.ctx.save, {
      id: crypto.randomUUID(),
      assisted: this.assisted,
      skill: this.q.skill,
      kind: this.q.kind,
      correct,
      judge: this.q.practiceOnly ? 'self' : judge,
      session: this.ctx.save.sessions,
      at: Date.now(),
      confusion,
    });
    this.ctx.persist();
  }
  answer(correct: boolean, choice?: string) {
    if (this.locked) return;
    const confusion =
      this.q.kind === 'B'
        ? this.q.skill.split(':')[1]
        : this.q.kind === 'A' && choice
          ? [this.q.target, choice].sort().join('|')
          : undefined;
    this.remember(correct, confusion);
    if (
      !correct &&
      confusion &&
      (this.ctx.save.confusions[confusion] ?? 0) >= 2 &&
      !this.insertedContrasts.has(confusion)
    ) {
      this.queue = insertContrasts(this.queue, this.index, this.ctx.bank, confusion);
      this.insertedContrasts.add(confusion);
    }
    if (correct) {
      this.locked = true;
      this.el.classList.add('is-resolved');
      const choices = { A: [2, 13], B: [5], C: [3], D: [19], E: [0, 16], F: [7, 9, 12, 17], G: [18, 7] }[
        this.q.kind
      ];
      const praiseId = this.tries > 0 ? 8 : choices[this.index % choices.length];
      this.feedback.replaceChildren(glyph('star'), h('span', null, this.ctx.bank.praise[praiseId]));
      this.feedback.classList.add('is-lit');
      this.speak(`py.praise.${praiseId}`);
      this.actions.replaceChildren(button('接下一条', () => this.advance(), 'primary', 'next'));
    } else {
      this.tries++;
      const next = nextQuestion(
        this.queue,
        this.index,
        this.tries,
        false,
        schedule(
          this.ctx.save,
          this.ctx.bank,
          this.q.kind === 'A' || this.q.kind === 'B' ? 'listen' : 'today',
          60,
        ),
      );
      this.queue = next.queue;
      if (next.action === 'demonstrate') {
        this.locked = true;
        this.feedback.replaceChildren(h('span', null, '一起看示范，再接下一条信号'));
        this.demonstrate();
        this.speak('py.demo');
        this.actions.replaceChildren(button('接下一条', () => this.advance(), 'primary', 'next'));
      } else {
        this.hint();
        if (this.q.kind === 'G') {
          this.sentence = [];
          this.used.clear();
          this.draw();
        }
      }
    }
  }
  private hint() {
    if (this.el.classList.contains('is-recording')) return;
    this.assisted = true;
    const c = this.ctx.bank.confusions.find((c) => this.q.skill.includes(c.pair.join('|')));
    this.feedback.replaceChildren(
      glyph('hint'),
      h('span', null, c?.tip ?? (this.tries >= 2 ? '把声音拆小一点，再接起来' : '先听一听，找一个小线索')),
    );
    if (c) void this.ctx.explain(c.tip);
    else this.speak(this.tries >= 2 ? 'py.hint2' : 'py.hint1');
    if (this.tries >= 2 && this.q.kind === 'F') {
      const sy = parseSyllable(this.word.syllables[this.syllableIndex])!;
      this.feedback.append(pinyin(`${sy.initial} · ＿`, 'hint-pinyin'));
    }
    if (!c) void this.stimulus();
  }
  private demonstrate(full = true) {
    this.assisted = true;
    if (this.q.kind === 'A' || this.q.kind === 'B') {
      const answer = this.stage.querySelector(`[data-choice="${this.q.target}"]`);
      answer?.classList.add('clue');
    } else if (this.q.kind === 'E') {
      const name = this.word.hanzi;
      [...this.stage.querySelectorAll('button')]
        .find((b) => b.getAttribute('aria-label') === name)
        ?.classList.add('clue');
    } else if (this.q.kind === 'F') {
      const w = this.word;
      this.feedback.append(
        pinyin(full ? w.display : displayPinyin(w.syllables[this.syllableIndex]), 'hint-pinyin'),
      );
    } else if (this.q.kind === 'G') this.feedback.append(pinyin(this.word.display, 'hint-pinyin'));
    void this.stimulus();
  }
  follow() {
    this.feedback.replaceChildren(h('span', null, '跟台长读一遍，声音也能慢慢接通'));
    this.speak('py.follow');
    this.actions.replaceChildren(
      button(
        '我读过啦',
        () => {
          this.remember(true, undefined, 'self');
          this.advance();
        },
        'primary',
        'next',
      ),
      button('再听一遍', () => void this.stimulus(), 'secondary', 'listen'),
    );
  }
  async record() {
    if (this.locked) return;
    beginSession(this.ctx.save);
    this.ctx.persist();
    this.locked = true;
    this.el.classList.add('is-recording');
    this.el.querySelectorAll('.lamp').forEach((l) => {
      l.classList.remove('lit');
      l.setAttribute('aria-label', '等待本次语音');
    });
    this.el
      .querySelectorAll<HTMLButtonElement>('.listening-tools button, .practice-stage button')
      .forEach((b) => (b.disabled = true));
    this.ctx.stopAudio();
    this.abort?.abort();
    this.abort = new AbortController();
    const gen = this.generation;
    const meter = h(
      'div',
      { class: 'voice-meter', 'aria-label': '正在收听' },
      Array.from({ length: 7 }, () => h('i')),
    );
    this.feedback.replaceChildren(meter, h('span', null, '台长正在收听'));
    this.actions.replaceChildren(button('我读好了', () => this.mic.stop(), 'primary', 'mic'));
    try {
      const capture = await this.mic.record((rms) =>
        meter.style.setProperty('--level', String(Math.min(1, rms * 12))),
      );
      if (this.stopped || gen !== this.generation) return;
      const record: Recording = {
        id: crypto.randomUUID(),
        blob: capture.blob,
        at: Date.now(),
        wordId: this.q.target,
        skill: this.q.skill.replace(/:blend$/, ':say'),
        session: this.ctx.save.sessions,
        kind: this.q.kind,
        assisted: this.assisted,
      };
      const plan = this.assessment;
      record.ref = plan.ref;
      record.mode = plan.mode;
      record.assessment = plan;
      const requested = capture.heard && this.ctx.save.settings.ai && navigator.onLine;
      if (requested) {
        try {
          record.verdict = await assess(
            capture.pcm,
            plan.mode,
            plan.ref,
            familyToken(),
            this.ctx.save.settings.strictness,
            this.abort.signal,
            plan,
          );
        } catch {
          /* The capture may be replayed locally, but an incomplete assessment is not archived. */
        }
      }
      if (this.stopped || gen !== this.generation) return;
      const usable =
        capture.heard &&
        (!requested ||
          (record.verdict && !['no_speech', 'incomplete'].includes(record.verdict.reason ?? '')));
      let stored = false;
      if (usable) {
        this.recorded.push(record);
        this.el.classList.add('has-recording');
        try {
          await saveRecording(record);
          stored = true;
        } catch {
          /* Local replay remains available. */
        }
      }
      this.locked = false;
      if (record.verdict?.status === 'judged') {
        const dims = record.verdict.dims;
        const lamps = this.el.querySelectorAll('.lamp');
        (['initial', 'final', 'tone'] as const).forEach((dim, i) => {
          const d = dims[dim];
          if (lamps[i]) {
            lamps[i].classList.toggle('lit', d?.ok === true);
            lamps[i].setAttribute(
              'aria-label',
              `${['声母', '韵母', '声调'][i]}：${d ? (d.ok ? '声音接通' : '一起再听听') : '先听一听'}`,
            );
          }
        });
      }
      this.feedback.replaceChildren(
        h(
          'span',
          null,
          !capture.heard
            ? '台长还没听清，可以再试试'
            : record.verdict?.status === 'unsure' || (requested && !record.verdict)
              ? record.verdict?.reason === 'tone_unconfirmed'
                ? '声音收到啦，声调一起再听听'
                : '台长还没听清，可以再试试'
              : record.verdict?.level === 1
                ? record.verdict.dims.initial?.heard
                  ? `这次更像 ${displayPinyin(record.verdict.dims.initial.heard)}，一起听听小变化`
                  : '声音收到啦，一起听听小变化'
                : stored
                  ? '声音收到啦，听听自己的节目'
                  : '声音收到啦，这次可以现场回听',
        ),
      );
      this.speak(record.verdict?.status === 'unsure' || !capture.heard ? 'py.unsure' : 'py.saved');
      this.actions.replaceChildren(
        button('听我的声音', () => void this.ctx.replay(record.blob), 'secondary', 'replay'),
        button('听台长读', () => void this.stimulus(), 'secondary', 'listen'),
        button(
          '接下一条',
          () => {
            this.remember(true, undefined, 'self');
            this.advance();
          },
          'primary',
          'next',
        ),
        button('我再读一遍', () => void this.record(), 'quiet', 'mic'),
      );
    } catch {
      if (this.stopped || gen !== this.generation) return;
      this.locked = false;
      this.feedback.replaceChildren(h('span', null, '可以先跟着台长读，准备好了再开麦'));
      this.follow();
    } finally {
      this.el.classList.remove('is-recording');
      this.el
        .querySelectorAll<HTMLButtonElement>('.listening-tools button')
        .forEach((b) => (b.disabled = false));
    }
  }
  advance() {
    this.abort?.abort();
    this.mic.stop();
    this.ctx.stopAudio();
    this.index++;
    this.tries = 0;
    if (this.index >= this.queue.length) this.finish();
    else this.render();
  }
  private finish() {
    this.stop();
    this.ctx.finish(this.recorded);
  }
  stop() {
    this.stopped = true;
    this.generation++;
    this.abort?.abort();
    this.mic.dispose();
    this.ctx.stopAudio();
  }
}
