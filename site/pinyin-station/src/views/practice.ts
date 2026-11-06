import { familyToken } from '../speech/family';
import { ordering } from './kinds/ordering';
import { reading } from './kinds/reading';
import { blending } from './kinds/blending';
import { spelling } from './kinds/spelling';
import { toneRow } from './kinds/tone';
import { glyphMatch } from './kinds/glyph';
import { listening } from './kinds/listening';
import { readPicture } from './kinds/readPicture';
import { h, shouldAutoSkip } from '@kit/ui';
import { mount } from '@kit/companion';
import { displayPinyin } from '../domain/pinyin';
import { bookLabel } from '../domain/book';
import { beginSession, insertContrasts, nextQuestion, recordAttempt, schedule } from '../domain/learning';
import type { Confusion, Letter, Question, ResumeState } from '../domain/types';
import { Microphone } from '../speech/mic';
import { Capture, type CaptureResult } from '../score/capture';
import { toInt16 } from '../score/resample';
import type { ScoreResult } from '../score/types';
import { hasNarration, modelContour } from '../score/reference';
import { unsureResult } from '../score/scorer';
import { addRecording as addSpeakerSample, loadSpeaker, saveSpeaker } from '../score/speaker';
import { deviceInfo } from '../score/device';
import { analyzeClip } from '../score/vad';
import { fromInt16 } from '../score/resample';
import { buildScoreCard, getLocalScorer, scoreCopy, scoreTarget } from './score-card';
import { assess } from '../speech/client';
import { questionPlan } from '../speech/reference';
import { saveRecording, type Recording } from '../speech/recordings';
import { button, glyph, isTextCard, type Context, type Played } from './common';
import { HINT, INSTRUCTION, PRAISE, RECORDING, type Line } from './lines';
import type { SpellLevel } from './kinds/types';

const titles = {
  A: '声音来信',
  B: '小耳朵接信号',
  C: '把声音接起来',
  D: '小小播音员',
  E: '给声音找个家',
  F: '图画也会说拼音',
  G: '把一句话接通',
  H: '四声排排队',
  I: '字形对对碰',
};
function heardLocalQuality(local: CaptureResult | null, int16: Int16Array): Record<string, number | boolean> {
  const q = local ? local.quality : analyzeClip(fromInt16(int16)).quality;
  return { ...q };
}
export class Practice {
  readonly el = h('section', { class: 'practice', 'aria-label': '电台节目' });
  private queue: Question[];
  index = 0;
  private tries = 0;
  private stopped = false;
  private generation = 0;
  private mic = new Microphone();
  private local = new Capture();
  private abort: AbortController | null = null;
  private recorded: Recording[] = [];
  /** Recordings that were really kept (参数 keepRecordings on and the save worked): the ending page only speaks of those. */
  private savedCount = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private entering = false;
  private pendingStep: Line | null = null;
  private guided = false;
  private lastChoice: string | undefined;
  locked = false;
  syllableIndex = 0;
  fullParts = 0;
  spellLevel: SpellLevel | undefined = undefined;
  wordNamed = false;
  fillAll: (() => void) | undefined = undefined;
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
    private readonly mode: string,
    resume?: ResumeState,
  ) {
    if (resume) {
      this.queue = resume.queue;
      this.index = Math.min(resume.index, resume.queue.length - 1);
    } else this.queue = schedule(ctx.save, ctx.bank, mode);
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
  /** Run audio steps in order. A newer sound (the child tapped something) or another question cancels the rest. */
  play(...steps: Array<() => Promise<unknown>>) {
    const gen = this.generation;
    void (async () => {
      for (const step of steps) {
        if (this.stopped || gen !== this.generation) return;
        if ((await step()) === 'interrupted') return;
      }
    })();
  }
  later(ms: number, fn: () => void) {
    const gen = this.generation;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.stopped && gen === this.generation) fn();
    }, ms);
    this.timers.add(timer);
  }
  private get assessment() {
    return questionPlan(this.q, this.ctx.bank, this.q.kind === 'C' ? undefined : this.word);
  }
  /** The single syllable (tone 1-4) this question asks the child to say, if local scoring can judge it. */
  private localSyllable(): string | null {
    const id = this.q.kind === 'C' ? this.q.target : this.word?.syllables.length === 1 ? this.word.syllables[0] : null;
    return id ? (scoreTarget(id, this.ctx.bank) ? id : null) : null;
  }
  /** The sound this question is about. Listening questions play it silently (a subtitle would print the answer). */
  async stimulus(): Promise<Played> {
    if (this.el.classList.contains('is-recording')) return 'skipped';
    if (this.q.kind === 'A') {
      const l = this.ctx.bank.letters.find((l) => l.id === this.q.target);
      return l ? this.ctx.syllable(l.callSound, true) : 'skipped';
    }
    if (this.q.kind === 'B' || this.q.kind === 'C' || this.q.kind === 'H') return this.ctx.syllable(this.q.target, true);
    if (this.q.kind === 'I') return 'skipped'; // looking, not listening
    if (this.q.kind === 'G' && this.word.frame) return 'skipped'; // a gap-fill read aloud would give the answer
    // 看图拼音 asks the child to spell the word: the sound plays, but its pinyin must not be printed as a subtitle.
    return this.ctx.word(this.word, this.q.kind === 'F');
  }
  setInstruction(line: Line) {
    this.instruction.textContent = line.text;
    this.instruction.dataset.line = line.id;
  }
  /** F: name the picture once, then say the small step. Called when the step is drawn. */
  speakStep(line: Line) {
    this.pendingStep = line;
    this.instruction.dataset.line = line.id;
    if (!this.entering) this.play(...this.stepSteps());
  }
  private stepSteps(): Array<() => Promise<unknown>> {
    const line = this.pendingStep;
    if (!line) return [];
    const name = !this.wordNamed;
    this.wordNamed = true;
    return [...(name ? [() => this.stimulus()] : []), () => this.ctx.say(line.id)];
  }
  guide(target: Element | null | undefined) {
    if (!this.guided || !target) return;
    target.classList.add('guide-target');
    target.append(h('span', { class: 'guide-hand', 'aria-hidden': 'true' }, '👆'));
  }
  markTried(el: HTMLElement) {
    el.classList.add('tried');
    (el as HTMLButtonElement).disabled = true;
  }
  /** Second rung of the hint ladder: light up the right answer (the answer is never printed anywhere before this). */
  reveal() {
    this.stage.querySelectorAll('[data-answer]').forEach((a) => a.classList.add('clue'));
  }
  private markTutorial() {
    if (!this.guided) return;
    this.guided = false;
    this.ctx.save.tutorial = { ...this.ctx.save.tutorial, [this.q.kind]: true };
    this.stage.querySelectorAll('.guide-hand').forEach((x) => x.remove());
    this.stage.querySelectorAll('.guide-target').forEach((x) => x.classList.remove('guide-target'));
  }
  private render() {
    if (this.stopped) return;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.el.classList.remove('is-resolved', 'has-recording', 'has-score');
    this.generation++;
    this.locked = false;
    // D (read aloud) has no right answer to point at, so it has no guide.
    this.guided = this.q.kind !== 'D' && !this.ctx.save.tutorial?.[this.q.kind] && !shouldAutoSkip();
    // A guided question points at the right answer, so it cannot count toward mastery.
    this.assisted = (this.q.practiceOnly ?? false) || this.guided;
    this.syllableIndex = 0;
    this.fullParts = 0;
    this.spellLevel = undefined;
    this.wordNamed = false;
    this.pendingStep = null;
    this.fillAll = undefined;
    this.lastChoice = undefined;
    this.sentence = [];
    this.used.clear();
    // Leaving half way (lock screen, 回电台, the album…) resumes right here.
    this.ctx.save.resume = { mode: this.mode, queue: this.queue, index: this.index, at: Date.now() };
    this.ctx.persist();
    // The same names as the three steps on the home screen.
    const phase = this.q.phase === 'warmup' ? '热热耳朵' : '接通信号';
    const steps = h(
      'div',
      { class: 'signal-steps', 'aria-label': `${phase}，第 ${this.index + 1} 条，共 ${this.queue.length} 条` },
      this.queue.map((_, i) => h('i', { class: i < this.index ? 'lit' : i === this.index ? 'current' : '' })),
    );
    const header = h(
      'div',
      { class: 'practice-header' },
      button('回电台', () => this.ctx.home(), 'quiet', 'back'),
      h('div', null, h('small', null, h('span', { class: 'phase-name' }, `${phase} · `), bookLabel(this.ctx.bank, this.q.lesson)), h('h2', null, titles[this.q.kind])),
      steps,
      h('span', { class: 'step-count', 'aria-hidden': 'true' }, `${this.index + 1} / ${this.queue.length}`),
    );
    this.instruction = h('p', { class: 'instruction', 'aria-live': 'polite' });
    if (this.q.kind !== 'F') this.setInstruction(INSTRUCTION[this.q.kind]);
    this.stage = h('div', { class: `practice-stage type-${this.q.kind}` });
    this.feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    this.actions = h('div', { class: 'practice-actions' });
    const coach = h('div', { class: 'coach-mini' });
    mount(coach, { size: 80 });
    const listensToSound = ['A', 'B', 'C', 'H'].includes(this.q.kind);
    const controls = h(
      'div',
      { class: 'listening-tools' },
      button(
        // The name says what it does: A/B/C play the sound again; the rest say the instruction again.
        // (The subtitle bar has its own 再听一遍 for the last line, so this one must not share the name.)
        listensToSound ? '再听这个声音' : '再听指令',
        () => {
          if (listensToSound) return this.play(() => this.stimulus());
          this.play(() => this.ctx.say(this.instruction.dataset.line ?? INSTRUCTION.A.id));
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
    this.entering = true;
    this.draw();
    this.entering = false;
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
    }
    // The opening sound: scene story (if any) -> the instruction (or F's first step) -> the sound to work with.
    const kind = this.q.kind;
    this.play(
      ...(scene ? [() => this.ctx.explain(scene.prompt)] : []),
      ...(kind === 'F'
        ? this.stepSteps()
        : [
            // A sentence is read out before it is built (never a gap-fill: that would read out the answer).
            ...(kind === 'G' && !this.word.frame ? [() => this.stimulus()] : []),
            () => this.ctx.say(INSTRUCTION[kind].id),
            ...(kind === 'A' || kind === 'B' || kind === 'C' || kind === 'H' ? [() => this.stimulus()] : []),
            // A word on a text card is read out first (the demonstration), then the child reads it.
            ...(kind === 'D' && isTextCard(this.word) ? [() => this.stimulus()] : []),
          ]),
    );
  }
  draw() {
    this.stage.replaceChildren();
    this.actions.replaceChildren();
    if (this.q.kind === 'E') this.readPicture();
    else if (this.q.kind === 'F') this.spelling();
    else if (this.q.kind === 'A' || this.q.kind === 'B') this.listening();
    else if (this.q.kind === 'C') this.blending();
    else if (this.q.kind === 'H') this.toneRow();
    else if (this.q.kind === 'I') this.glyphMatch();
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

  toneRow() {
    toneRow.call(this);
  }

  glyphMatch() {
    glyphMatch.call(this);
  }

  /** The three “声母 韵母 声调” lamps only mean something when the cloud check is on; otherwise nothing is drawn. */
  lamps() {
    if (!this.ctx.save.settings.ai) return null;
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
  /** Which praise line fits what the child actually did (never “you said it” for a tap). */
  private praiseId(): number {
    if (this.tries > 0) return PRAISE.retry;
    const pick = (ids: readonly number[]) => ids[this.index % ids.length];
    switch (this.q.kind) {
      case 'F':
        return this.spellLevel === 'initial'
          ? pick(PRAISE.Finitial)
          : this.spellLevel === 'final'
            ? pick(PRAISE.Ffinal)
            : this.spellLevel === 'tone'
              ? pick(PRAISE.Ftone)
              : pick(PRAISE.Ffull);
      case 'A':
      case 'B':
      case 'C':
      case 'D':
      case 'E':
      case 'G':
      case 'H':
      case 'I':
        return pick(PRAISE[this.q.kind]);
    }
  }
  answer(correct: boolean, choice?: string) {
    if (this.locked) return;
    this.markTutorial();
    this.lastChoice = choice;
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
      this.ctx.save.resume = { mode: this.mode, queue: this.queue, index: this.index, at: Date.now() };
    }
    if (correct) {
      this.locked = true;
      this.el.classList.add('is-resolved');
      const praiseId = this.praiseId();
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
          this.q.kind === 'A' || this.q.kind === 'B' || this.q.kind === 'H' ? 'listen' : 'today',
          60,
        ),
      );
      this.queue = next.queue;
      this.ctx.save.resume = { mode: this.mode, queue: this.queue, index: this.index, at: Date.now() };
      if (next.action === 'demonstrate') {
        this.locked = true;
        this.feedback.replaceChildren(h('span', null, HINT.demo.text));
        this.demonstrate();
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
  /**
   * The hint ladder. H1 (first wrong tap or 给我线索): the line + the sound again. H2 (second wrong): the right
   * answer lights up. H3 (third wrong): a demonstration that fills the answer in. A wrong tap never dead-ends.
   */
  private hint() {
    if (this.el.classList.contains('is-recording')) return;
    this.assisted = true;
    const c = this.ctx.bank.confusions.find((c) => this.q.skill.includes(c.pair.join('|')));
    if (this.q.kind === 'H') return this.hintTone();
    if (this.q.kind === 'I') return this.hintGlyph();
    const line = this.tries >= 2 && (this.q.kind === 'F' || this.q.kind === 'C') ? HINT.split : HINT.first;
    this.feedback.replaceChildren(glyph('hint'), h('span', null, c?.tip ?? line.text));
    if (this.tries >= 2) this.reveal();
    if (c) {
      this.play(() => this.ctx.explain(c.tip), ...this.compareSounds(c), () => this.stimulus());
      return;
    }
    this.play(
      // A wrong blend is played back as the syllable it really makes, then the line, then the target.
      ...(this.q.kind === 'C' && this.lastChoice ? [() => this.ctx.syllable(this.lastChoice!, true)] : []),
      () => this.ctx.say(line.id),
      () => this.stimulus(),
    );
  }
  /**
   * 四声排排队 hint ladder: “差一点点，再听一听” + the sound again (quiet); the second wrong try lights the right card and, for
   * neighbouring tones, adds the tone tip (“二声像上坡…”). The third wrong try is the demonstration (see answer()).
   */
  /** 字形对对碰 has nothing to listen to: a gentle “look again”, then the right card lights up, then the demonstration. */
  private hintGlyph() {
    this.assisted = true;
    this.feedback.replaceChildren(glyph('hint'), h('span', null, HINT.look.text));
    if (this.tries >= 2) this.reveal();
    this.play(() => this.ctx.say(HINT.look.id));
  }
  private hintTone() {
    this.assisted = true;
    const wrong = this.lastChoice ? Number(this.lastChoice.at(-1)) : 0,
      right = Number(this.q.target.at(-1)),
      tip = this.tries >= 2 ? this.ctx.bank.confusions.find((c) => c.pair.join('|') === [wrong, right].sort().join('|')) : undefined;
    this.feedback.replaceChildren(glyph('hint'), h('span', null, tip?.tip ?? HINT.near.text));
    if (this.tries >= 2) this.reveal();
    this.play(
      () => (tip ? this.ctx.explain(tip.tip) : this.ctx.say(HINT.near.id)),
      () => this.stimulus(),
    );
  }
  /**
   * After a tip about two easily mixed letters: the two letters sit on the screen (the one the tip points at lit up),
   * then their REAL call-sound recordings play one after the other, each letter lighting up as it sounds.
   * The robot only says the plain tip sentence; it never says a letter or a sound.
   */
  private compareSounds(c: Confusion): Array<() => Promise<unknown>> {
    const letters = c.pair.map((id) => this.ctx.bank.letters.find((l) => l.id === id));
    if (letters.some((l) => !l)) return [];
    const picked = letters as Letter[];
    const focus = c.focus ?? 'both';
    const chips = h(
      'div',
      { class: 'tip-chips', 'aria-label': '两个字母' },
      picked.map((l, i) =>
        h(
          'span',
          {
            class: `tip-chip pinyin ${focus === 'both' || focus === (i ? 'right' : 'left') ? 'focus' : ''}`,
            'data-side': i ? 'right' : 'left',
            'data-clip': l.callSound,
          },
          l.id.replace('v', 'ü'), // (ü is written with its dots, never as v)
        ),
      ),
    );
    this.feedback.append(chips);
    return [
      () => {
        const caption = '听一听：先听左边，再听右边。';
        this.feedback.append(h('span', { class: 'tip-listen' }, caption));
        return this.ctx
          .listen(
            picked.map((l) => l.callSound),
            caption,
            (i) => chips.querySelectorAll('.tip-chip').forEach((chip, n) => chip.classList.toggle('active', n === i)),
          )
          .finally(() => chips.querySelectorAll('.tip-chip').forEach((chip) => chip.classList.remove('active')));
      },
    ];
  }
  private demonstrate() {
    this.assisted = true;
    this.reveal();
    this.stage.querySelectorAll<HTMLButtonElement>('button[data-choice],button[data-final]').forEach((b) => {
      if (!b.dataset.answer) b.disabled = true;
    });
    if (this.q.kind === 'F') this.fillAll?.();
    else if (this.q.kind === 'G') {
      this.sentence = [...(this.word.chunks ?? [])];
      this.used = new Set(this.q.choices.map((_, i) => i));
      this.stage.replaceChildren();
      this.ordering();
      this.stage.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
    } else if (this.q.kind === 'C') {
      const slot = this.stage.querySelector('.blend-slot');
      const right = this.stage.querySelector<HTMLElement>('[data-answer]');
      if (slot && right) {
        slot.textContent = right.textContent;
        slot.classList.remove('miss');
        slot.classList.add('ok');
      }
      const result = this.stage.querySelector('.blend-result');
      if (result) result.textContent = displayPinyin(this.q.target);
    } else if (this.q.kind === 'E') {
      const right = this.stage.querySelector<HTMLElement>('[data-answer]');
      if (right && !right.querySelector('.picture-caption') && !isTextCard(this.word))
        right.append(h('span', { class: 'picture-caption' }, this.word.hanzi));
    }
    // The demonstration line first, then the sound itself, so neither swallows the other.
    this.play(() => this.ctx.say(HINT.demo.id), () => this.stimulus());
  }
  follow() {
    this.feedback.replaceChildren(h('span', null, RECORDING.follow.text));
    this.speak(RECORDING.follow.id);
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
      button('再听台长读', () => void this.stimulus(), 'secondary', 'listen'),
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
    this.el.querySelector('.score-card')?.remove();
    this.el.classList.remove('has-score');
    this.abort?.abort();
    this.abort = new AbortController();
    const gen = this.generation;
    // Local scoring trial (parent switch, default off): capture with the score/ pipeline instead of speech/mic.
    const localId = this.ctx.save.settings.localScore === true ? this.localSyllable() : null;
    let localCapture: CaptureResult | null = null;
    const meter = h(
      'div',
      { class: 'voice-meter', 'aria-label': '正在收听' },
      Array.from({ length: 7 }, () => h('i')),
    );
    this.feedback.replaceChildren(meter, h('span', null, '台长正在收听'));
    this.actions.replaceChildren(
      button('我读好了', () => (localId ? this.local.stop() : this.mic.stop()), 'primary', 'mic'),
    );
    try {
      const capture = localId
        ? await this.local
            .start({ onLevel: (level) => meter.style.setProperty('--level', String(level)) })
            .then((r) => {
              localCapture = r;
              return { pcm: toInt16(r.pcm), blob: r.wavBlob(), heard: r.heard };
            })
        : await this.mic.record((rms) => meter.style.setProperty('--level', String(Math.min(1, rms * 12))));
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
      let localScore: ScoreResult | null = null;
      // Calibration data: every heard recording carries what is needed to interpret it later (local only).
      const targetInfo = (() => {
        const id = this.localSyllable();
        return id ? scoreTarget(id, this.ctx.bank) : null;
      })();
      const speaker = loadSpeaker();
      if (capture.heard) {
        const quality = heardLocalQuality(localCapture as CaptureResult | null, capture.pcm);
        record.meta = {
          v: 1,
          target: targetInfo?.target,
          confusions: targetInfo?.confusions,
          device: deviceInfo(),
          capture: { source: localId ? (localCapture as CaptureResult | null)?.source ?? 'worklet' : 'legacy-mic', quality },
          speakerN: speaker.recent.length,
        };
      }
      const heardLocal = localCapture as CaptureResult | null;
      // Nothing audible at all: say so gently on the same card (model curve only) instead of leaving the child with a blank.
      if (localId && heardLocal && !heardLocal.heard) localScore = unsureResult('too_quiet', ['tone-shape']);
      if (localId && heardLocal?.heard) {
        const t = scoreTarget(localId, this.ctx.bank)!;
        try {
          localScore = await getLocalScorer().score({ pcm: heardLocal.pcm, sampleRate: 16000, speaker, ...t });
          record.local = {
            verdict: localScore.verdict,
            confidence: Math.round(localScore.confidence * 100) / 100,
            reason: localScore.reason,
            heard: localScore.parts.tone?.heard,
            scorers: localScore.scorers,
            contour: localScore.evidence.contour?.points.map((x) => Math.round(x * 100) / 100),
            medianHz: localScore.evidence.contour ? Math.round(localScore.evidence.contour.medianHz) : undefined,
            rangeSt: localScore.evidence.contour ? Math.round(localScore.evidence.contour.rangeSt * 100) / 100 : undefined,
            features: localScore.evidence.features['tone-shape'],
            elapsedMs: Math.round(localScore.elapsedMs),
          };
          // His pitch centre/range keep adapting from every clean recording (no labels needed).
          const c = localScore.evidence.contour;
          if (c && !localScore.evidence.quality.unreliable) saveSpeaker(addSpeakerSample(speaker, { hz: c.medianHz, range: c.rangeSt }));
        } catch {
          /* Scoring is a bonus; the recording is kept either way. */
        }
        if (this.stopped || gen !== this.generation) return;
      }
      if (usable) {
        this.recorded.push(record);
        this.el.classList.add('has-recording');
        try {
          if (this.ctx.save.settings.keepRecordings !== false) {
            await saveRecording(record);
            stored = true;
            this.savedCount++;
          }
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
      // Only say what is true: "saved" needs a saved recording, "heard" a recording that was picked up but not kept.
      const line = !capture.heard ? RECORDING.unsure : stored ? RECORDING.saved : RECORDING.heard;
      this.feedback.replaceChildren(
        h(
          'span',
          null,
          !capture.heard
            ? RECORDING.unsure.text
            : record.verdict?.status === 'unsure' || (requested && !record.verdict)
              ? record.verdict?.reason === 'tone_unconfirmed'
                ? '声音收到啦，声调一起再听听'
                : RECORDING.unsure.text
              : record.verdict?.level === 1
                ? record.verdict.dims.initial?.heard
                  ? `这次更像 ${displayPinyin(record.verdict.dims.initial.heard)}，一起听听小变化`
                  : '声音收到啦，一起听听小变化'
                : line.text,
        ),
      );
      if (!localScore)
        this.speak(
          record.verdict?.status === 'unsure' || !capture.heard ? RECORDING.unsure.id : line.id,
        );
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
      if (localId && localScore && heardLocal) void this.showLocal(localId, localScore, heardLocal, gen);
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
  private async showLocal(id: string, score: ScoreResult, mine: CaptureResult, gen: number) {
    const model = await modelContour(id, getLocalScorer());
    if (this.stopped || gen !== this.generation) return;
    const t = scoreTarget(id, this.ctx.bank)!;
    const copy = scoreCopy(score, t.target.tone);
    const listen = button('听我的', () => void this.ctx.replay(mine.wavBlob()), 'secondary', 'replay');
    listen.disabled = !mine.heard;
    const card = buildScoreCard({
      syllable: id,
      result: score,
      mine: score.evidence.contour?.curve ?? null,
      model: model?.curve ?? null,
      copy,
      actions: [
        button('再听示范', () => void this.stimulus(), 'secondary', 'listen'),
        listen,
        button('再读一次', () => void this.record(), 'secondary', 'mic'),
        button(
          '接下一条',
          () => {
            this.remember(true, undefined, 'self');
            this.advance();
          },
          'primary',
          'next',
        ),
      ],
    });
    this.el.classList.add('has-score');
    this.el.append(card);
    // Words are always on screen; the clip plays only once it has been generated for this id.
    if (await hasNarration(copy.id)) this.speak(copy.id);
  }
  advance() {
    this.abort?.abort();
    this.mic.stop();
    this.local.stop();
    this.ctx.stopAudio();
    this.markTutorial();
    this.index++;
    this.tries = 0;
    if (this.index >= this.queue.length) this.finish();
    else this.render();
  }
  private finish() {
    this.stop();
    this.ctx.finish(this.recorded, this.savedCount);
  }
  /** Lock screen / app switch: silence everything, but keep this screen, this question and the saved place. */
  pause() {
    if (this.stopped) return;
    this.abort?.abort();
    this.mic.stop();
    this.local.stop();
    this.ctx.stopAudio();
  }
  stop() {
    this.stopped = true;
    this.generation++;
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.abort?.abort();
    this.mic.dispose();
    this.local.dispose();
    this.ctx.stopAudio();
  }
}
