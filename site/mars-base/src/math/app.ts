/**
 * 算术站 2.0 controller. Screens: home (five lines, 测起点, 超频, 基地舱段), work (a mission round, with 拆一拆), result,
 * placement test (测起点), sprint (超频). All sentences the robot says come from lines.ts and are shown as the caption.
 */
import { CoachVoice } from '@kit/coach-voice';
import type { Mood } from '@kit/companion/art';
import { icon } from '@kit/ui';
import { glyph } from './glyphs';
import {
  INTRO_COVERS_HOW, LINES, captionOf, hintId, howId, introId, line, type Tok,
} from './lines';
import { PLACE_START, estimate, isDone, newPlacement, recordProbe, type PlaceState } from './placement';
import {
  PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, SYMBOL, TRACKS, WARMUP_QUESTIONS, questionsFor, sampleFor, stageById, trackOf, variationFor, problemKey,
  type Operation, type Problem, type Stage, type TrackOp,
} from './problems';
import {
  applyPlacement, currentOf, dueReview, doneCount, recordAnswer, sprintOpen, stageOpen, stageStatus, startRun, highestOpen, type MathSave,
} from './save';
import { planFor, splitCountsAsRight, splittable, type SplitPlan } from './split';
import { SPRINT_QUESTIONS } from './constants';
import { sprintQuestions, type SprintItem } from './sprint';
import { CMP_SYMBOL, bayHtml, dotsModel, energyHtml, equationHtml, splitPicture, starText, starsFor, type Entry } from './visuals';

type View = 'home' | 'question' | 'feedback' | 'result' | 'place' | 'placeDone' | 'sprint' | 'sprintFeedback' | 'sprintDone';
interface SplitState { plan: SplitPlan; at: number; wrong: number; origin: 'warm' | 'button' | 'miss'; missed: boolean }
interface PlaceRun { op: Operation; state: PlaceState; keys: Set<string>; problem: Problem; nonce: string }
interface SprintRun { op: TrackOp; items: SprintItem[]; i: number; wrongs: number; startedAt: number; clean: boolean; fields: string[] }
interface Finished { stageId: string; score: number; sec: number; before: { best: number | undefined; lastSec: number | undefined } }

const fieldCount = (p: Problem): number => (p.kind === 'rem' ? 2 : 1);
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clock = (sec: number): string => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function judge(p: Problem, fields: string[], choice: -1 | 0 | 1 | null): boolean {
  if (p.kind === 'cmp') return choice === p.answer;
  if (p.kind === 'rem') return Number(fields[0]) === p.answer && Number(fields[1]) === p.rem;
  return Number(fields[0]) === p.answer;
}
function answerText(p: Problem): string {
  if (p.kind === 'cmp') return CMP_SYMBOL[String(p.answer)];
  if (p.kind === 'rem') return `${p.answer} … ${p.rem}`;
  return String(p.answer);
}

export class ArithmeticApp {
  private view: View = 'home';
  private fields: string[] = [''];
  private active = 0;
  private choice: -1 | 0 | 1 | null = null;
  private shownHint = false;
  private feedback: 'right' | 'reviewed' | 'split' | 'wrong' | '' = '';
  private split: SplitState | null = null;
  private qStart = now();
  private streak = 0;
  private burst = false;
  private outcomes: ('ok' | 'soft')[] = [];
  private finished: Finished | null = null;
  private place: PlaceRun | null = null;
  private placeResult: { op: Operation; start: number; raised: boolean } | null = null;
  private sprint: SprintRun | null = null;
  private sprintResult: { op: TrackOp; sec: number; clean: boolean; best: number | undefined; isBest: boolean } | null = null;
  private clockTimer = 0;
  readonly coach = new CoachVoice('/audio/mars-arithmetic/audio-manifest-v2.json', { name: '火星搭档', accent: '#db7957', speechFallback: false });
  private coachText = '我是火星搭档，一起试试今天的算术题。';
  private speakMode: 'say' | 'quiet' = 'say';
  private lastToks: Tok[] = [];
  private lastMood: Mood = 'happy';
  /** the how-to sentence of the last question: spoken again only when the kind of question changes */
  private lastHow = '';
  /** a stage card tapped while that stage has an unfinished round: ask first (接着做 / 重新开始这一阶) */
  private choosing: string | null = null;
  private hiddenAt = 0;

  constructor(private root: HTMLElement, private save: MathSave, private persist: () => void) {
    root.addEventListener('click', (event) => this.click(event));
    window.addEventListener('keydown', (event) => this.keydown(event));
    // one back step = one level: any inner screen -> home (the progress is kept), home -> the hub. Exactly one extra history entry is ever added.
    try { history.replaceState({ ma: 'home' }, ''); } catch { /* a sandboxed frame may refuse */ }
    window.addEventListener('popstate', () => { if (this.view !== 'home') this.leave(); else if (this.choosing) { this.choosing = null; this.render(); } });
    // the clocks stand still while the page is hidden (lock screen, another app)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { this.hiddenAt = now(); return; }
      if (!this.hiddenAt) return;
      const gone = now() - this.hiddenAt; this.hiddenAt = 0;
      this.qStart += gone; if (this.sprint) this.sprint.startedAt += gone;
    });
  }

  // ------------------------------------------------------------------ speech
  intro(): void {
    const fresh = Object.keys(this.save.plays).length === 0 && Object.keys(this.save.placed).length === 0;
    this.speak(fresh ? [line('ma.home'), line('ma.home.tip')] : [line('ma.home.again')]);
  }

  /** Say whole sentences (never numbers, never spliced clips). `silent` shows the caption only; the speaker button plays it. */
  private speak(toks: Tok[], mood: Mood = 'happy', opts: { force?: boolean; silent?: boolean } = {}): void {
    const text = captionOf(toks);
    this.coachText = text; this.lastToks = toks; this.lastMood = mood; this.speakMode = opts.silent ? 'quiet' : 'say';
    const narrator = this.coach.narrator;
    // sentences that have no recording yet stay silent (caption only) - never a device voice
    const ids = opts.silent ? [] : toks.map((t) => t.id).filter((id) => narrator.has(id));
    const caption = this.root.querySelector<HTMLElement>('.ma-guide-text');
    if (caption) { caption.textContent = text; caption.dataset.speak = this.speakMode; }
    this.coach.say(text, ids, mood, opts.force);
  }
  private replay(): void { if (this.lastToks.length) this.speak(this.lastToks, this.lastMood, { force: true }); }

  /**
   * The question: only the "how to answer" sentence is said, the equation stays on the screen. It is spoken for the first question of a
   * round and when the kind of question changes; otherwise the caption shows it quietly.
   */
  private askQuestion(problem: Problem, o: { stage?: Stage; first: boolean; lead?: Tok[]; splitHint?: boolean }): void {
    const how = howId(problem);
    const toks: Tok[] = [...(o.lead ?? [])];
    const change = o.first || how !== this.lastHow;
    this.lastHow = how;
    if (o.first && o.stage && !o.lead) {
      const intro = introId(o.stage);
      if (intro) toks.push(line(intro));
      if (!(intro && INTRO_COVERS_HOW.includes(intro))) toks.push(line(how));
      if (!intro && o.splitHint) toks.push(line('ma.intro.split'));
    } else toks.push(line(how));
    this.speak(toks, 'thinking', { silent: !change });
  }

  private guide(): string {
    return `<div class="ma-guide"><div class="ma-bot-host"></div><div class="ma-guide-copy"><b>火星搭档</b><p class="ma-guide-text" role="status" data-speak="${this.speakMode}">${this.coachText}</p></div><button class="ma-replay" type="button" data-action="replay" aria-label="再听一遍" title="再听一遍">${icon('replay')}</button></div>`;
  }

  // ------------------------------------------------------------------ rendering
  render(): void {
    window.clearInterval(this.clockTimer);
    if (this.view === 'home') this.home();
    else if (this.view === 'result') this.resultView();
    else if (this.view === 'placeDone') this.placeDoneView();
    else if (this.view === 'sprintDone') this.sprintDoneView();
    else this.work();
    this.coach.attach(this.root.querySelector('.ma-bot-host'), this.root.querySelector('.ma-guide-text'));
    try { if (this.view !== 'home' && history.state?.ma !== 'inner') history.pushState({ ma: 'inner' }, ''); } catch { /* ignore */ }
    if (this.view === 'sprint') this.clockTimer = window.setInterval(() => { const c = this.root.querySelector('.ma-clock'); if (c && this.sprint) c.textContent = clock(this.sprintSeconds()); }, 1000);
  }

  private stageButton(stage: Stage): string {
    const status = stageStatus(this.save, stage);
    const best = this.save.best[stage.id];
    const state = status === 'locked' ? '还没开' : status === 'placed' ? '测起点通过' : status === 'passed' ? `${starText(starsFor(best ?? 0))} ${best} / 8` : best !== undefined ? `最好 ${best} / 8` : '开始';
    return `<button type="button" class="ma-stage is-${status}" data-stage="${stage.id}" ${status === 'locked' ? 'disabled' : ''} aria-label="${trackOf(stage.op).title}第 ${stage.tier} 阶，${stage.title}，${stage.brief}，${state}">
      <span class="ma-stage-ic">${glyph(stage.glyph)}</span><b>${stage.tier}</b><span class="ma-stage-name">${stage.title}</span><small>${stage.brief}</small><em class="ma-stage-state">${state}</em></button>`;
  }

  private home(): void {
    const resume = this.save.run;
    const resumeStage = resume && stageById(resume.stageId);
    const resumeKind = resume && resumeStage ? currentOf(this.save)?.kind : undefined;
    const resumeLabel = !resume ? '' : resumeKind === 'warm' ? `跟我做 ${resume.warmDone + 1}` : resumeKind === 'review' ? '再来一道' : `第 ${Math.min(QUESTIONS_PER_STAGE, resume.index + 1)} 题`;
    const choiceStage = this.choosing ? stageById(this.choosing) : undefined;
    this.root.innerHTML = `<main class="ma-page ma-home">
      <div class="ma-home-bar"><span>火星基地 · 算术站</span><b>${doneCount(this.save)} / ${STAGES.length}</b></div>
      <header class="ma-hero"><div class="ma-hero-copy"><span class="ma-eyebrow">火星基地 / 算术站</span><h1>火星基地</h1><p>四条路线加一条挑战线，一个任务一个任务往上闯。</p><div class="ma-hero-meta"><span>${doneCount(this.save)} / ${STAGES.length} 个舱段点亮</span><span>每个任务 8 题</span></div></div><div class="ma-hero-scene" aria-hidden="true"><div class="ma-hero-orbit"></div><img src="/icons/games/mars-base.svg" alt=""/><span class="ma-hero-star ma-hero-star-a"></span><span class="ma-hero-star ma-hero-star-b"></span></div></header>
      <div class="ma-home-guide">${this.guide()}</div>
      ${resume && resumeStage ? `<button class="ma-resume" data-action="resume" type="button"><span>继续上次的「${resumeStage.title}」· ${resumeLabel}</span><span aria-hidden="true">→</span></button>` : ''}
      ${bayHtml(this.save)}
      <div class="ma-tracks">${TRACKS.map((track) => {
        const stages = STAGES.filter((s) => s.op === track.op);
        const passed = stages.filter((s) => { const st = stageStatus(this.save, s); return st === 'passed' || st === 'placed'; }).length;
        const sprintBest = this.save.fast[track.op]?.best;
        const tools = track.op === 'mix' ? '' : `<div class="ma-track-tools"><button type="button" class="ma-tool" data-action="place" data-op="${track.op}">测起点</button><button type="button" class="ma-tool ma-tool-sprint" data-action="sprint" data-op="${track.op}" ${sprintOpen(this.save, track.op) ? '' : 'aria-disabled="true"'}>超频${sprintBest ? ` · 最好 ${sprintBest} 秒` : sprintOpen(this.save, track.op) ? '' : ' · 通过第 3 阶开启'}</button></div>`;
        return `<section class="ma-track ma-${track.color}" data-track="${track.op}"><div class="ma-track-head"><span class="ma-symbol">${track.op === 'mix' ? '?' : SYMBOL[track.op]}</span><div class="ma-track-title"><h2>${track.title}</h2><span>${track.short}</span></div><span class="ma-track-count">${passed} / ${stages.length}</span></div>${tools}<div class="ma-stages">${stages.map((s) => this.stageButton(s)).join('')}</div></section>`;
      }).join('')}</div>
      ${choiceStage ? `<div class="ma-choice" role="dialog" aria-label="这一阶还有没做完的一轮"><button class="ma-choice-bg" type="button" data-action="choose-cancel" aria-label="关闭"></button><div class="ma-choice-box"><p><b>「${choiceStage.title}」</b>还有没做完的一轮</p><button class="ma-primary" type="button" data-action="resume">接着做</button><button class="ma-choice-restart" type="button" data-action="restart" data-stage="${choiceStage.id}">重新开始这一阶</button></div></div>` : ''}
    </main>`;
  }

  private entry(state: '' | 'right' | 'wrong' = ''): Entry { return { fields: this.fields, active: this.active, choice: this.choice, state }; }

  private keypad(hintKey: boolean): string {
    return `<div class="ma-keypad" aria-label="数字键盘">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'hint', 0, 'delete'].map((x) => {
      if (x === 'hint' && !hintKey) return '<span class="ma-key-gap" aria-hidden="true"></span>';
      return `<button type="button" data-key="${x}" aria-label="${x === 'hint' ? '提示' : x === 'delete' ? '删除' : x}">${x === 'hint' ? icon('hint') : x === 'delete' ? icon('backspace') : x}</button>`;
    }).join('')}</div>`;
  }
  private cmpPad(hintKey: boolean): string {
    const pick = (value: -1 | 0 | 1, word: string, sym: string) => `<button type="button" class="ma-cmp-btn${this.choice === value ? ' is-picked' : ''}" data-cmp="${value}" aria-label="${word}"><b>${sym}</b><span>${word}</span></button>`;
    return `<div class="ma-cmp" aria-label="比大小">${pick(1, '大于', '>')}${pick(-1, '小于', '<')}${pick(0, '等于', '=')}${hintKey ? `<button type="button" class="ma-cmp-hint" data-key="hint" aria-label="提示">${icon('hint')}<span>提示</span></button>` : ''}</div>`;
  }

  private currentProblem(): Problem | null {
    if (this.view === 'place') return this.place?.problem ?? null;
    if (this.view === 'sprint' || this.view === 'sprintFeedback') return this.sprint?.items[this.sprint.i]?.problem ?? null;
    return currentOf(this.save)?.problem ?? null;
  }

  /** the little problem being typed into right now (a 拆一拆 step, or the problem itself) */
  private typing(): Problem | null {
    const p = this.currentProblem();
    if (!p) return null;
    return this.split && this.split.at < this.split.plan.steps.length ? this.split.plan.steps[this.split.at].problem : p;
  }
  private complete(): boolean {
    const p = this.typing();
    if (!p) return false;
    if (p.kind === 'cmp') return this.choice !== null;
    if (p.kind === 'rem') return this.fields[0] !== '' && this.fields[1] !== '';
    return this.fields[0] !== '';
  }
  private primary(): { action: string; label: string; disabled: boolean } {
    const p = this.typing();
    if (this.view === 'feedback' || this.view === 'sprintFeedback') return { action: this.view === 'feedback' ? 'next' : 'sprint-next', label: '下一题 →', disabled: false };
    const run = this.save.run;
    const retry = this.view === 'question' && !this.split && !!run?.retrying;
    if (p?.kind === 'rem' && this.fields[0] !== '' && this.fields[1] === '') return { action: 'submit', label: '再填剩下的', disabled: false };
    return { action: 'submit', label: retry ? '再试一次' : '确定', disabled: !this.complete() };
  }

  private work(): void {
    const view = this.view;
    const cur = view === 'question' || view === 'feedback' ? currentOf(this.save) : null;
    const run = this.save.run;
    const problem = this.currentProblem();
    if (!problem || (!this.place && view === 'place') || (!this.sprint && (view === 'sprint' || view === 'sprintFeedback')) || ((view === 'question' || view === 'feedback') && (!cur || !run))) { this.view = 'home'; this.home(); return; }
    const isRun = view === 'question' || view === 'feedback';
    const feedback = view === 'feedback' || view === 'sprintFeedback';
    const stage = cur?.stage ?? (this.sprint ? sprintStage(this.sprint) : null);
    const split = this.split;
    const typing = this.typing()!;
    const heavy = this.shownHint && problem.kind === 'expr' && problem.ops.some((o) => o === 'mul' || o === 'div');

    let headSub = '', headTitle = '', counter = '', side = '', glyphHtml = '';
    if (isRun && cur && run) {
      headSub = `${trackOf(cur.stage.op).title} · 第 ${cur.stage.tier} 阶`; headTitle = cur.stage.title; glyphHtml = glyph(cur.stage.glyph);
      counter = cur.kind === 'warm' ? `跟我做 ${run.warmDone + 1} / ${WARMUP_QUESTIONS}` : cur.kind === 'review' ? `再来一道 ${run.reviewed + 1}` : `第 ${run.index + 1} / ${QUESTIONS_PER_STAGE} 题`;
      side = `一次就对 ${run.correct}`;
    } else if (view === 'place' && this.place) {
      headSub = trackOf(this.place.op).title; headTitle = '测起点'; glyphHtml = glyph('dock'); counter = `第 ${this.place.state.probes.length + 1} 题`; side = '';
    } else if (this.sprint) {
      headSub = trackOf(this.sprint.op).title; headTitle = '超频'; glyphHtml = glyph('bolt'); counter = `第 ${this.sprint.i + 1} / ${this.sprint.items.length} 题`; side = `<span class="ma-clock">${clock(this.sprintSeconds())}</span>`;
    }

    // task card pieces
    const label = !isRun ? (view === 'place' ? '测起点' : '超频') : cur?.kind === 'warm' ? '跟我做' : cur?.kind === 'review' ? '再换一道试试' : split ? '拆一拆' : '算术任务';
    const labelRight = !isRun ? '' : cur?.kind === 'review' ? '不算分' : cur?.kind === 'warm' ? '不算分' : split ? '一步一步算' : `第 ${run!.index + 1} 站`;
    let equation = equationHtml(problem, this.entry(feedback ? (this.feedback === 'wrong' || view === 'sprintFeedback' ? 'wrong' : 'right') : ''), heavy);
    if (split) equation = equation.replace(/<button type="button" class="([^"]*)" data-field="\d" aria-label="[^"]*">/g, '<span class="$1 is-static">').replace(/<\/button>/g, '</span>');
    const hintLine = view === 'question' && !split && this.shownHint ? LINES[hintId(stage!, problem)] : '';
    const showDots = view === 'question' && !split && (this.shownHint || !!run?.retrying) && problem.kind === 'calc' && !!stage && stage.tier <= 6;
    let picture = showDots ? dotsModel(problem as Extract<Problem, { kind: 'calc' }>) : '';
    let stepRow = '';
    if (split) {
      picture = splitPicture(split.plan, split.at);
      if (!feedback) stepRow = `<div class="ma-step"><span class="ma-step-no">第 ${split.at + 1} 步 / 共 ${split.plan.steps.length} 步</span><div class="ma-equation ma-step-eq">${equationHtml(typing, this.entry())}</div></div>`;
    }
    const primary = this.primary();
    const retryNote = view === 'question' && !split && run?.retrying
      ? `<div class="ma-retry-note" role="status"><b>再试一次</b><span>${LINES[hintId(stage!, problem)]}</span>${run.attempts >= 2 ? '<button type="button" data-action="show-answer">看答案</button>' : ''}</div>` : '';
    const stepNote = split && !feedback && split.wrong > 0
      ? `<div class="ma-retry-note" role="status"><b>再想想</b><span>${LINES['ma.split.again']}</span>${split.wrong >= 2 ? '<button type="button" data-action="show-step">看这一步的答案</button>' : ''}</div>` : '';
    let banner = '';
    if (feedback) {
      const wrong = this.feedback === 'wrong' || view === 'sprintFeedback';
      const title = wrong ? `正确答案是 ${answerText(problem)}` : this.feedback === 'split' ? LINES['ma.split.done'] : LINES['ma.right'];
      const body = wrong ? '' : this.feedback === 'split' ? (this.split && splitCountsAsRight(this.split.origin, this.split.missed, cur?.kind ?? 'warm') ? `答案是 ${answerText(problem)}。这题用拆一拆做对了，算一次就对。` : `答案是 ${answerText(problem)}。这题是跟着一步步做的，不算分。`) : this.feedback === 'reviewed' ? '这题自己算出来了，不算分。' : cur?.kind === 'review' ? '这道换了数的题也做完了。' : '';
      banner = `<div class="ma-feedback ${wrong ? 'wrong' : this.feedback}" role="status"><b>${title}</b>${body ? `<span>${body}</span>` : ''}</div>`;
    }
    const canSplit = isRun && !feedback && !split && cur && cur.kind !== 'warm' && splittable(cur.stage, cur.problem);
    const secondary = split && !feedback ? '' : canSplit ? `<button class="ma-secondary" type="button" data-action="split">拆一拆</button>` : view === 'place' ? `<button class="ma-secondary" type="button" data-action="skip">这题不会</button>` : view === 'sprint' ? `<button class="ma-secondary" type="button" data-action="sprint-skip">这题不会</button>` : '';
    const hintKey = isRun && !split && !feedback;
    const input = feedback ? banner : typing.kind === 'cmp' ? this.cmpPad(hintKey) : this.keypad(hintKey);
    const energy = isRun && cur ? energyHtml(this.outcomes, QUESTIONS_PER_STAGE, cur.kind === 'scored' ? run!.index : -1, this.streak, this.burst) : '';
    this.burst = false;

    this.root.innerHTML = `<main class="ma-page ma-play ma-mode-${view === 'place' ? 'place' : view.startsWith('sprint') ? 'sprint' : 'run'}${split ? ' is-split' : ''}${retryNote || stepNote ? ' has-note' : ''}" data-kind="${problem.kind}">
      <header class="ma-play-header"><button class="ma-back" type="button" data-action="home" aria-label="返回选关" title="返回选关">${icon('back')}</button>
        <div class="ma-mission"><span class="ma-mission-ic">${glyphHtml}</span><div><span>${headSub}</span><strong class="ma-mission-name">${headTitle}</strong></div></div>
        <div class="ma-counter"><b class="ma-qno">${counter}</b><span class="ma-score">${side}</span></div></header>
      ${energy}
      ${this.guide()}
      <section class="ma-task ${cur?.kind === 'review' ? 'is-review' : ''}" aria-label="算术题"><div class="ma-task-label">${label} <span>${labelRight}</span></div>
        <div class="ma-equation" aria-live="polite">${equation}</div>
        <p class="ma-hint">${hintLine}</p>${picture}${stepRow}</section>
      ${retryNote}${stepNote}
      <div class="ma-input">${input}
      <div class="ma-actions${secondary ? ' has-two' : ''}">${secondary}<button class="ma-primary" type="button" data-action="${primary.action}" ${primary.disabled ? 'disabled' : ''}>${primary.label}</button></div></div>
    </main>`;
    if (split && !feedback) requestAnimationFrame(() => this.root.querySelector('.ma-step')?.scrollIntoView({ block: 'nearest' }));
  }

  private resultView(): void {
    const r = this.finished;
    const stage = r && stageById(r.stageId);
    if (!r || !stage) { this.view = 'home'; this.home(); return; }
    const passed = r.score >= PASS_SCORE, earned = starsFor(r.score);
    const next = STAGES.find((s) => s.op === stage.op && s.tier === stage.tier + 1);
    this.root.innerHTML = `<main class="ma-page ma-result"><div class="ma-result-body">${this.guide()}<div class="ma-stars" role="img" aria-label="${earned} 颗星，共 3 颗">${[1, 2, 3].map((i) => `<i class="ma-star${i <= earned ? ' is-on' : ''}" style="--i:${i}" aria-hidden="true">★</i>`).join('')}</div><h1>${passed ? '完成挑战' : '再练一轮'}</h1><p class="ma-result-mission">${glyph(stage.glyph, 'ma-glyph ma-glyph-sm')}<span>${stage.title}</span></p><strong>${r.score} <small>/ ${QUESTIONS_PER_STAGE}</small></strong><p class="ma-result-stat">${this.resultStat(r)}</p></div><div class="ma-result-actions"><button type="button" data-action="retry">再练一轮</button>${passed && next ? `<button class="ma-primary" type="button" data-stage="${next.id}">下一个任务 →</button>` : ''}<button type="button" data-action="home">返回选关</button></div></main>`;
  }

  /** the one sentence about this round's numbers: whole, without the numbers (they are in the stats line on the screen) */
  private resultToks(r: Finished): Tok[] {
    if (r.before.lastSec !== undefined && r.before.lastSec - r.sec >= 5) return [line('ma.res.faster2')];
    if (r.before.best !== undefined && r.score > r.before.best) return [line('ma.res.more2')];
    return [line('ma.res.used2')];
  }
  private resultStat(r: Finished): string {
    if (r.before.lastSec !== undefined && r.before.lastSec - r.sec >= 5) return `比上次快了 ${r.before.lastSec - r.sec} 秒，这次用了 ${r.sec} 秒`;
    if (r.before.best !== undefined && r.score > r.before.best) return `比以前最好的多对了 ${r.score - r.before.best} 道题`;
    return `这次一共用了 ${r.sec} 秒`;
  }

  private placeDoneView(): void {
    const r = this.placeResult;
    if (!r) { this.view = 'home'; this.home(); return; }
    const open = stageById(`${r.op}-${highestOpen(this.save, r.op)}`)!;
    const keep = !r.raised && open.tier > 1;                       // the test never lowers: an already opened line stays as it is
    const stage = keep ? open : stageById(`${r.op}-${r.raised ? r.start : 1}`)!;
    const stat = keep ? `已开启到第 ${open.tier} 阶` : stage.tier > 1 ? `前面第 1 到 ${stage.tier - 1} 阶不用再做了` : '';
    this.root.innerHTML = `<main class="ma-page ma-result"><div class="ma-result-body">${this.guide()}<span class="ma-result-glyph">${glyph(stage.glyph, 'ma-glyph ma-glyph-lg')}</span><h1>${keep ? '保持不变' : `从第 ${stage.tier} 阶出发`}</h1><p class="ma-result-mission"><span>${trackOf(r.op).title} · ${stage.title}</span></p>${stat ? `<p class="ma-result-stat">${stat}</p>` : ''}</div><div class="ma-result-actions"><button class="ma-primary" type="button" data-stage="${stage.id}">${keep ? '继续' : '开始'}「${stage.title}」→</button><button type="button" data-action="place" data-op="${r.op}">再测一次</button><button type="button" data-action="home">返回选关</button></div></main>`;
  }

  private sprintDoneView(): void {
    const r = this.sprintResult;
    if (!r) { this.view = 'home'; this.home(); return; }
    const stat = r.best !== undefined ? `最好成绩 ${r.best} 秒` : '这次不计入最好成绩';
    this.root.innerHTML = `<main class="ma-page ma-result"><div class="ma-result-body">${this.guide()}<span class="ma-result-glyph">${glyph('bolt', 'ma-glyph ma-glyph-lg')}</span><h1>超频完成</h1><p class="ma-result-mission"><span>${trackOf(r.op).title} · ${SPRINT_QUESTIONS} 题</span></p><strong>${r.sec} <small>秒</small></strong><p class="ma-result-stat">${stat}</p></div><div class="ma-result-actions"><button class="ma-primary" type="button" data-action="sprint" data-op="${r.op}">再来一次</button><button type="button" data-action="home">返回选关</button></div></main>`;
  }

  // ------------------------------------------------------------------ run flow
  private resetEntry(p: Problem): void { this.fields = Array.from({ length: fieldCount(p) }, () => ''); this.active = 0; this.choice = null; }

  private begin(stage: Stage): void {
    if (!stageOpen(this.save, stage)) return;
    startRun(this.save, stage);
    this.persist();
    this.streak = 0; this.outcomes = []; this.lastHow = '';
    this.enterQuestion();
  }

  /** show the current question of the saved run */
  private enterQuestion(): void {
    const cur = currentOf(this.save), run = this.save.run;
    if (!cur || !run) { this.view = 'home'; this.render(); return; }
    this.view = 'question'; this.feedback = ''; this.split = null; this.shownHint = false;
    this.resetEntry(cur.problem);
    this.qStart = now();
    if (this.outcomes.length < run.index) this.outcomes = [...Array.from({ length: run.correct }, () => 'ok' as const), ...Array.from({ length: run.index - run.correct }, () => 'soft' as const)];
    const wantsSplit = cur.kind === 'warm' || (run.retrying && splittable(cur.stage, cur.problem));
    if (wantsSplit) this.openSplit(cur.kind === 'warm' ? 'warm' : 'miss');
    else this.shownHint = run.retrying;
    this.render();
    if (this.split) { this.speakStep(true); return; }
    const first = run.index === 0 && !run.retrying && cur.kind === 'scored' && run.reviewed === 0;
    this.askQuestion(cur.problem, { stage: cur.stage, first, splitHint: first && questionsFor(cur.stage, run.round).some((p) => splittable(cur.stage, p)) });
  }

  private openSplit(origin: SplitState['origin']): void {
    const cur = currentOf(this.save);
    const plan = cur && planFor(cur.problem);
    if (!cur || !plan) return;
    this.split = { plan, at: 0, wrong: 0, origin, missed: false };
    this.resetEntry(plan.steps[0].problem);
  }

  private speakStep(first: boolean): void {
    const st = this.split, run = this.save.run;
    if (!st || !run) return;
    const lead = st.plan.op === 'add' || st.plan.op === 'sub'
      ? line(`ma.step.${st.plan.op}.${st.at === 0 ? 1 : 2}`)
      : line(st.at === 0 ? 'ma.step.part.1' : st.at === 1 ? 'ma.step.part.2' : 'ma.step.merge');
    const warm = first && st.origin === 'warm' && run.warmDone === 0 ? [line('ma.warm')] : [];
    this.speak([...warm, lead], 'thinking');
  }

  private fillAnswer(p: Problem): void {
    if (p.kind === 'cmp') { this.choice = p.answer; return; }
    this.fields = p.kind === 'rem' ? [String(p.answer), String(p.rem)] : [String(p.answer)];
  }

  private elapsed(): number { return Math.min(120, Math.max(0, ((this.hiddenAt || now()) - this.qStart) / 1000)); }

  private submit(): void {
    if (this.view !== 'question' && this.view !== 'place' && this.view !== 'sprint') return;
    const typing = this.typing();
    if (!typing) return;
    // "再填剩下的": the quotient is typed, the button moves to the second box (also in 测起点 and 超频)
    if (typing.kind === 'rem' && this.fields[0] !== '' && this.fields[1] === '') { this.active = 1; this.refreshEntry(); return; }
    if (this.view === 'place') { this.submitPlace(false); return; }
    if (this.view === 'sprint') { this.submitSprint(); return; }
    if (!this.complete()) return;
    if (this.split) { this.submitStep(); return; }
    const cur = currentOf(this.save), run = this.save.run;
    if (!cur || !run) return;
    if (judge(cur.problem, this.fields, this.choice)) {
      if (!run.retrying && cur.kind === 'scored') this.streak += 1;
      this.feedback = run.retrying ? 'reviewed' : 'right';
      const burst = this.feedback === 'right' && cur.kind === 'scored' && [3, 5, 8].includes(this.streak);
      const three = burst && this.streak === 3;                                            // chosen before render() clears the flag
      this.burst = burst;
      this.view = 'feedback'; this.render();
      this.speak([line(three ? 'ma.streak' : 'ma.right')], 'celebrating');
      return;
    }
    this.streak = 0;
    if (cur.kind === 'scored' && !run.retrying && !dueReview(run)) run.reviews.push({ due: Math.min(QUESTIONS_PER_STAGE, run.index + 3), problem: variationFor(cur.stage, run.round, run.index) });
    run.retrying = true; run.attempts = Math.min(3, run.attempts + 1);
    this.persist();
    this.resetEntry(cur.problem);
    if (splittable(cur.stage, cur.problem)) {
      this.openSplit('miss'); this.render(); this.speakStep(false);
      return;
    }
    this.shownHint = true; this.render();
    this.speak([line(hintId(cur.stage, cur.problem))], 'encouraging');
  }

  private submitStep(): void {
    const st = this.split!;
    const step = st.plan.steps[st.at];
    if (judge(step.problem, this.fields, this.choice)) {
      st.at += 1; st.wrong = 0;
      if (st.at >= st.plan.steps.length) {
        const doneCur = currentOf(this.save)!;
        if (splitCountsAsRight(st.origin, st.missed, doneCur.kind)) this.streak += 1;
        this.feedback = 'split'; this.view = 'feedback'; this.fillAnswer(doneCur.problem); this.render();
        this.speak([line('ma.split.done')], 'celebrating');
        return;
      }
      this.resetEntry(st.plan.steps[st.at].problem); this.render(); this.speakStep(false);
      return;
    }
    st.wrong += 1; st.missed = true;
    this.resetEntry(step.problem); this.render();
    this.speak([line('ma.split.again')], 'encouraging');
  }

  private showStep(): void {
    const st = this.split;
    if (!st || st.wrong < 2) return;
    st.missed = true;
    const q = st.plan.steps[st.at].problem;
    this.fields = q.kind === 'rem' ? [String(q.answer), String(q.rem)] : [String((q as { answer: number }).answer)];
    this.submitStep();
  }

  private showAnswer(): void {
    const run = this.save.run, cur = currentOf(this.save);
    if (this.view !== 'question' || !run?.retrying || run.attempts < 2 || !cur) return;
    this.feedback = 'wrong'; this.view = 'feedback'; this.fillAnswer(cur.problem); this.render();
    this.speak([line('ma.wrong')], 'encouraging');
  }

  private next(): void {
    if (this.view !== 'feedback' || !this.save.run) return;
    const cur = currentOf(this.save)!;
    // a first-try answer counts; so does a scored problem solved with the 拆一拆 button when no step went wrong (use the method!)
    const scoredRight = (this.feedback === 'right' && cur.kind === 'scored') || (this.feedback === 'split' && !!this.split && splitCountsAsRight(this.split.origin, this.split.missed, cur.kind));
    if (cur.kind === 'scored') this.outcomes.push(scoredRight ? 'ok' : 'soft');
    const result = recordAnswer(this.save, scoredRight, this.elapsed());
    this.persist();
    if (result.finished) {
      this.finished = { stageId: result.stageId, score: result.score, sec: result.sec, before: result.before };
      this.view = 'result'; this.render();
      const stage = stageById(result.stageId)!;
      const last = !STAGES.some((s) => s.op === stage.op && s.tier === stage.tier + 1);
      const head = result.score >= PASS_SCORE ? line(last ? 'ma.pass.last' : 'ma.pass') : line('ma.retry');
      this.speak([head, ...this.resultToks(this.finished)], result.score >= PASS_SCORE ? 'celebrating' : 'encouraging');
      return;
    }
    this.enterQuestion();
  }

  // ------------------------------------------------------------------ 测起点
  private startPlace(op: Operation): void {
    this.place = { op, state: newPlacement(), keys: new Set(), problem: sampleFor(stageById(`${op}-${PLACE_START}`)!, 'x', 0), nonce: String(Date.now()) };
    this.pickPlaceProblem();
    this.view = 'place'; this.shownHint = false; this.resetEntry(this.place.problem);
    this.render();
    this.lastHow = '';
    this.askQuestion(this.place.problem, { first: true, lead: [line('ma.place.start')] });
  }
  private pickPlaceProblem(): void {
    const pl = this.place!;
    const stage = stageById(`${pl.op}-${pl.state.tier}`)!;
    for (let k = 0; k < 40; k++) {
      const p = sampleFor(stage, `${pl.nonce}:${pl.op}:${pl.state.probes.length}:${k}`, pl.state.probes.length + k);
      if (!pl.keys.has(problemKey(p))) { pl.keys.add(problemKey(p)); pl.problem = p; return; }
    }
    pl.problem = sampleFor(stage, `${pl.nonce}:fallback`, 0);
  }
  private submitPlace(skipped: boolean): void {
    const pl = this.place;
    if (!pl) return;
    if (!skipped && !this.complete()) return;
    recordProbe(pl.state, !skipped && judge(pl.problem, this.fields, this.choice));
    if (isDone(pl.state)) {
      const start = estimate(pl.state.probes);
      const raised = applyPlacement(this.save, pl.op, start);
      this.persist();
      this.placeResult = { op: pl.op, start, raised };
      this.place = null; this.view = 'placeDone'; this.render();
      this.speak([line(raised ? 'ma.place.done' : highestOpen(this.save, pl.op) > 1 ? 'ma.place.same' : 'ma.place.first')], 'happy');
      return;
    }
    this.pickPlaceProblem(); this.resetEntry(pl.problem); this.render();
    this.askQuestion(pl.problem, { first: false });
  }

  // ------------------------------------------------------------------ 超频
  private sprintSeconds(): number { return this.sprint ? Math.max(0, Math.round(((this.hiddenAt || now()) - this.sprint.startedAt) / 1000)) : 0; }
  private startSprint(op: TrackOp): void {
    if (!sprintOpen(this.save, op)) { this.speak([line('ma.sprint.locked')], 'encouraging'); return; }
    const items = sprintQuestions(this.save, op, `${Date.now()}:${op}`);
    if (!items.length) return;
    this.sprint = { op, items, i: 0, wrongs: 0, startedAt: now(), clean: true, fields: [''] };
    this.view = 'sprint'; this.shownHint = false; this.resetEntry(items[0].problem);
    this.render();
    this.lastHow = '';
    this.askQuestion(items[0].problem, { first: true, lead: [line('ma.sprint.start2')] });
  }
  private submitSprint(): void {
    const sp = this.sprint;
    if (!sp || !this.complete()) return;
    const item = sp.items[sp.i];
    if (judge(item.problem, this.fields, this.choice)) { this.advanceSprint(); return; }
    this.sprintMiss();
  }
  /** a wrong answer or "这题不会": shown with the answer, never counted for the best time */
  private sprintMiss(): void {
    const sp = this.sprint;
    if (!sp || this.view !== 'sprint') return;
    sp.wrongs += 1; sp.clean = false;
    this.view = 'sprintFeedback'; this.fillAnswer(sp.items[sp.i].problem); this.render();
    this.speak([line('ma.wrong')], 'encouraging');
  }
  private advanceSprint(): void {
    const sp = this.sprint;
    if (!sp) return;
    sp.i += 1;
    if (sp.i >= sp.items.length) { this.finishSprint(); return; }
    this.view = 'sprint'; this.resetEntry(sp.items[sp.i].problem); this.render();
    this.askQuestion(sp.items[sp.i].problem, { first: false });
  }
  private finishSprint(): void {
    const sp = this.sprint!;
    const sec = Math.max(1, this.sprintSeconds());
    const prev = this.save.fast[sp.op];
    const isBest = sp.clean && (!prev || sec < prev.best);
    const best = sp.clean ? (prev ? Math.min(prev.best, sec) : sec) : prev?.best;
    if (best !== undefined) this.save.fast[sp.op] = { best, last: sec, runs: (prev?.runs ?? 0) + 1 };
    this.persist();
    this.sprintResult = { op: sp.op, sec, clean: sp.clean, best, isBest };
    this.sprint = null; this.view = 'sprintDone'; this.render();
    const r = this.sprintResult;
    this.speak([line(r.clean ? (r.isBest ? 'ma.sprint.best' : 'ma.sprint.keep') : 'ma.sprint.miss')], r.isBest ? 'celebrating' : 'happy');
  }

  // ------------------------------------------------------------------ input
  private click(event: MouseEvent): void {
    const target = event.target as Element;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button)) return;
    const id = button.dataset.stage;
    if (id) {
      const stage = stageById(id);
      if (!stage) return;
      if (this.view === 'home' && this.save.run?.stageId === id && !this.choosing) { this.choosing = id; this.render(); return; }   // do not drop an unfinished round without asking
      this.choosing = null; this.begin(stage); return;
    }
    if (button.dataset.key !== undefined) { this.input(button.dataset.key); return; }
    if (button.dataset.cmp !== undefined) { this.choice = Number(button.dataset.cmp) as -1 | 0 | 1; this.refreshEntry(); return; }
    if (button.dataset.field !== undefined) { this.active = Number(button.dataset.field); this.refreshEntry(); return; }
    switch (button.dataset.action) {
      case 'resume': this.choosing = null; this.enterQuestion(); break;
      case 'restart': { const stage = stageById(button.dataset.stage ?? ''); this.choosing = null; if (stage) this.begin(stage); break; }
      case 'choose-cancel': this.choosing = null; this.render(); break;
      case 'sprint-skip': this.sprintMiss(); break;
      case 'home': this.goHome(); break;
      case 'replay': this.replay(); break;
      case 'retry': { const stage = this.finished && stageById(this.finished.stageId); if (stage) this.begin(stage); break; }
      case 'submit': this.submit(); break;
      case 'show-answer': this.showAnswer(); break;
      case 'show-step': this.showStep(); break;
      case 'split': { if (this.view === 'question' && !this.split) { this.openSplit('button'); this.render(); this.speakStep(false); } break; }
      case 'skip': this.submitPlace(true); break;
      case 'place': this.startPlace(button.dataset.op as Operation); break;
      case 'sprint': this.startSprint(button.dataset.op as TrackOp); break;
      case 'sprint-next': this.advanceSprint(); break;
      case 'next': this.next(); break;
    }
  }

  /** the app's own 返回: the same single step as the browser's back button */
  private goHome(): void {
    try { if (history.state?.ma === 'inner') { history.back(); return; } } catch { /* fall through */ }
    this.leave();
  }
  private leave(): void {
    this.persist();
    this.place = null; this.sprint = null; this.split = null; this.choosing = null;
    this.view = 'home'; this.render();
    this.speak([line('ma.home.again')]);
  }

  private keydown(event: KeyboardEvent): void {
    const typing = this.view === 'question' || this.view === 'place' || this.view === 'sprint';
    if (typing && this.typing()?.kind === 'cmp') {
      const map: Record<string, -1 | 0 | 1> = { '>': 1, '<': -1, '=': 0 };
      if (event.key in map) { this.choice = map[event.key]; this.refreshEntry(); return; }
    }
    if (typing && (/^[0-9]$/.test(event.key) || event.key === 'Backspace')) this.input(event.key === 'Backspace' ? 'delete' : event.key);
    else if (event.key === 'Enter' && typing) this.submit();
    else if (event.key === 'Enter' && this.view === 'feedback') this.next();
    else if (event.key === 'Enter' && this.view === 'sprintFeedback') this.advanceSprint();
  }

  private input(key: string): void {
    if (this.view !== 'question' && this.view !== 'place' && this.view !== 'sprint') return;
    if (key === 'hint') {
      if (this.view !== 'question' || this.split) return;
      const cur = currentOf(this.save);
      if (!cur) return;
      this.shownHint = !this.shownHint;
      this.render();
      if (this.shownHint) this.speak([line(hintId(cur.stage, cur.problem))], 'encouraging');
      else this.speak([line(howId(cur.problem))], 'thinking', { silent: true });
      return;
    }
    const typing = this.typing();
    if (!typing || typing.kind === 'cmp') return;
    if (key === 'delete') this.fields[this.active] = this.fields[this.active].slice(0, -1);
    else if (this.fields[this.active].length < 3) this.fields[this.active] = `${this.fields[this.active]}${key}`.replace(/^0+(?=\d)/, '');
    this.refreshEntry();
  }

  /** update boxes, picked symbol and the main button in place (a full render would cut the robot's voice) */
  private refreshEntry(): void {
    const typing = this.typing();
    this.root.querySelectorAll<HTMLElement>('[data-field]:not(.is-static)').forEach((el) => {
      const index = Number(el.dataset.field);
      el.classList.toggle('is-active', index === this.active);
      if (typing?.kind === 'cmp') { el.textContent = this.choice === null ? '?' : CMP_SYMBOL[String(this.choice)]; el.classList.toggle('is-empty', this.choice === null); }
      else { el.textContent = this.fields[index] || '?'; el.classList.toggle('is-empty', !this.fields[index]); }
    });
    this.root.querySelectorAll<HTMLElement>('[data-cmp]').forEach((el) => el.classList.toggle('is-picked', Number(el.dataset.cmp) === this.choice));
    const primary = this.primary();
    const button = this.root.querySelector<HTMLButtonElement>('.ma-primary');
    if (button) { button.disabled = primary.disabled; button.textContent = primary.label; button.dataset.action = primary.action; }
  }
}

/** a stand-in stage for the header of a 超频 round */
function sprintStage(sp: SprintRun): Stage { return sp.items[sp.i]?.stage ?? STAGES.find((s) => s.op === sp.op)!; }

