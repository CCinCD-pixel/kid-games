import { PASS_SCORE, QUESTIONS_PER_STAGE, STAGES, SYMBOL, TRACKS, hintFor, questionsFor, type Problem, type Stage } from './problems';
import { recordAnswer, stageOpen, startRun, type MathSave } from './save';
import { CoachVoice } from '@kit/coach-voice';
import { icon } from '@kit/ui';

type View = 'home' | 'question' | 'feedback' | 'result';

function amount(value: number, removed = 0): string {
  if (value > 20) {
    const tens = Math.floor(value / 10), ones = value % 10;
    return `<span class="ma-tens">${Array.from({ length: tens }, () => '<i aria-hidden="true">十</i>').join('')}</span><span class="ma-dots">${Array.from({ length: ones }, () => '<i aria-hidden="true"></i>').join('')}</span>`;
  }
  return `<span class="ma-dots">${Array.from({ length: value }, (_, i) => `<i class="${i >= value - removed ? 'is-removed' : ''}" aria-hidden="true"></i>`).join('')}</span>`;
}

function modelFor(q: Problem): string {
  if (q.op === 'add') return `<div class="ma-model" aria-label="${q.a} 个加上 ${q.b} 个"><div><b>先有 ${q.a}</b>${amount(q.a)}</div><span class="ma-model-op">+</span><div><b>再加 ${q.b}</b>${amount(q.b)}</div></div>`;
  if (q.op === 'sub') return q.a <= 20
    ? `<div class="ma-model" aria-label="${q.a} 个拿走 ${q.b} 个"><div><b>先有 ${q.a}，划掉 ${q.b}</b>${amount(q.a, q.b)}</div></div>`
    : `<div class="ma-model" aria-label="${q.a} 个拿走 ${q.b} 个"><div><b>先有 ${q.a}</b>${amount(q.a)}</div><span class="ma-model-op">−</span><div class="ma-remove"><b>拿走 ${q.b}</b>${amount(q.b)}</div></div>`;
  const groups = q.op === 'mul' ? q.a : q.b;
  const each = q.op === 'mul' ? q.b : q.answer;
  return `<div class="ma-model ma-model-groups" aria-label="${groups} 组，每组 ${each} 个">${Array.from({ length: groups }, (_, i) => `<div><b>第 ${i + 1} 组</b>${amount(each)}</div>`).join('')}</div>`;
}

export class ArithmeticApp {
  private view: View = 'home';
  private chosen = '';
  private feedback = '';
  private shownHint = false;
  private lastScore = 0;
  private lastStage = '';
  readonly coach = new CoachVoice('/audio/mars-arithmetic/audio-manifest-v2.json', { name: '火星搭档', accent: '#db7957', speechFallback: false });
  private coachText = '我是火星搭档，一起试试今天的算术题。';

  constructor(private root: HTMLElement, private save: MathSave, private persist: () => void) {
    root.addEventListener('click', (event) => this.click(event));
    window.addEventListener('keydown', (event) => this.keydown(event));
    void this.coach.narrator.addManifest('/audio/mars-arithmetic-numbers/audio-manifest-v2.json');
  }

  intro(): void { this.say('选一条训练线，我们一起完成八道题。', 'ma.home'); }

  private guide(): string {
    return `<div class="ma-guide"><div class="ma-bot-host"></div><div class="ma-guide-copy"><b>火星搭档</b><p class="ma-guide-text" role="status">${this.coachText}</p></div><button class="ma-replay" type="button" data-action="replay" aria-label="再听一遍" title="再听一遍">${icon('replay')}</button></div>`;
  }

  private say(text: string, lines: string | string[], mood: 'happy' | 'encouraging' | 'thinking' | 'celebrating' = 'happy'): void {
    this.coachText = text;
    this.coach.say(text, lines, mood);
  }

  private readQuestion(): void {
    const q = this.question;
    if (!q) return;
    const word = { add: '加', sub: '减', mul: '乘', div: '除以' }[q.op];
    this.say(`${q.a} ${word} ${q.b} 等于几？`, [`num.${q.a}`, `ma.op.${q.op}`, `num.${q.b}`, 'ma.ask'], 'thinking');
  }

  private get stage(): Stage | undefined { return STAGES.find((s) => s.id === this.save.run?.stageId); }
  private get question() {
    const run = this.save.run;
    const stage = this.stage;
    return run && stage ? questionsFor(stage, run.round)[run.index] : null;
  }

  render(): void {
    if (this.view === 'home') this.home();
    else if (this.view === 'result') this.result();
    else this.exercise();
    this.coach.attach(this.root.querySelector('.ma-bot-host'), this.root.querySelector('.ma-guide-text'));
  }

  private home(): void {
    const resume = this.save.run;
    this.root.innerHTML = `<main class="ma-page ma-home">
      <header class="ma-hero"><div class="ma-hero-copy"><span class="ma-eyebrow">火星基地 / 算术站</span><h1>火星基地</h1><p>加、减、乘、除，选一条路线出发。</p><div class="ma-hero-meta"><span>${Object.values(this.save.best).filter((score) => score >= PASS_SCORE).length} / ${STAGES.length} 阶完成</span><span>每阶 8 题</span></div></div><div class="ma-hero-scene" aria-hidden="true"><div class="ma-hero-orbit"></div><img src="/icons/games/mars-base.svg" alt=""/><span class="ma-hero-star ma-hero-star-a"></span><span class="ma-hero-star ma-hero-star-b"></span></div></header>
      <div class="ma-home-guide">${this.guide()}</div>
      ${resume ? `<button class="ma-resume" data-action="resume" type="button">继续上次的 ${STAGES.find((s) => s.id === resume.stageId)?.title ?? '练习'} · 第 ${resume.index + 1} 题 <span aria-hidden="true">→</span></button>` : ''}
      <div class="ma-tracks">${TRACKS.map((track) => `<section class="ma-track ma-${track.color}"><div class="ma-track-head"><span class="ma-symbol">${SYMBOL[track.op]}</span><h2>${track.title}</h2><span class="ma-track-count">${track.stages.filter((_, i) => (this.save.best[`${track.op}-${i + 1}`] ?? 0) >= PASS_SCORE).length} / 6</span></div><div class="ma-stages">${track.stages.map((title, i) => {
        const id = `${track.op}-${i + 1}`;
        const stage = STAGES.find((s) => s.id === id)!;
        const open = stageOpen(this.save, stage);
        const best = this.save.best[id];
        return `<button type="button" class="ma-stage ${best !== undefined && best >= PASS_SCORE ? 'is-passed' : ''}" data-stage="${id}" ${open ? '' : 'disabled'} aria-label="${track.title}第 ${i + 1} 阶，${title}${open ? '' : '，未解锁'}"><b>${i + 1}</b><span>${title}</span><small>${best === undefined ? (open ? '开始' : '待解锁') : `${best} / 8`}</small></button>`;
      }).join('')}</div></section>`).join('')}</div>
    </main>`;
  }

  private exercise(): void {
    const run = this.save.run, stage = this.stage, q = this.question;
    if (!run || !stage || !q) { this.view = 'home'; this.home(); return; }
    const feedback = this.view === 'feedback';
    this.root.innerHTML = `<main class="ma-page ma-play"><header class="ma-play-header"><button class="ma-back" type="button" data-action="home" aria-label="返回选关" title="返回选关">${icon('back')}</button><div><span>${SYMBOL[stage.op]} ${stage.title}</span><strong>第 ${run.index + 1} / ${QUESTIONS_PER_STAGE} 题</strong></div><span class="ma-score">答对 ${run.correct}</span></header>
      ${this.guide()}
      <div class="ma-progress" aria-hidden="true">${Array.from({ length: QUESTIONS_PER_STAGE }, (_, i) => `<i class="${i < run.index ? 'done' : i === run.index ? 'now' : ''}"></i>`).join('')}</div>
      <section class="ma-task" aria-label="算术题"><div class="ma-task-label">算术任务 <span>第 ${run.index + 1} 站</span></div><div class="ma-equation">${q.a} <em>${SYMBOL[q.op]}</em> ${q.b} <em>=</em> <span class="ma-answer ${feedback ? (this.feedback === 'right' ? 'right' : 'wrong') : ''}">${this.chosen || '?'}</span></div><p class="ma-hint">${this.shownHint ? hintFor(q) : '想好了就输入答案，随时可以点提示。'}</p>${this.shownHint && !feedback ? modelFor(q) : ''}</section>
      ${feedback ? `<div class="ma-feedback ${this.feedback}"><b>${this.feedback === 'right' ? '答对了！' : `正确答案是 ${q.answer}`}</b><span>${this.feedback === 'right' ? '点亮一格，继续前进。' : hintFor(q)}</span></div>` : `<div class="ma-keypad" aria-label="数字键盘">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'hint', 0, 'delete'].map((x) => `<button type="button" data-key="${x}" aria-label="${x === 'hint' ? '提示' : x === 'delete' ? '删除' : x}">${x === 'hint' ? icon('hint') : x === 'delete' ? icon('backspace') : x}</button>`).join('')}</div>`}
      <button class="ma-primary" type="button" data-action="${feedback ? 'next' : 'submit'}" ${!feedback && !this.chosen ? 'disabled' : ''}>${feedback ? '下一题 →' : '确定'}</button>
    </main>`;
  }

  private result(): void {
    const stage = STAGES.find((s) => s.id === this.lastStage)!;
    const passed = this.lastScore >= PASS_SCORE;
    const next = STAGES.find((s) => s.op === stage.op && s.tier === stage.tier + 1);
    this.root.innerHTML = `<main class="ma-page ma-result"><div class="ma-result-body">${this.guide()}<div class="ma-result-symbol">${passed ? '★' : '↗'}</div><h1>${passed ? '完成挑战' : '再练一轮'}</h1><p>${stage.title}</p><strong>${this.lastScore} <small>/ ${QUESTIONS_PER_STAGE}</small></strong><p>${passed ? (next ? '下一阶已经开启' : '这一条训练线完成了') : `答对 ${PASS_SCORE} 题就能开启下一阶`}</p><div class="ma-result-actions"><button type="button" data-action="retry">再练一轮</button>${passed && next ? `<button class="ma-primary" type="button" data-stage="${next.id}">下一阶 →</button>` : ''}<button type="button" data-action="home">返回选关</button></div></div></main>`;
  }

  private begin(stage: Stage): void {
    if (!stageOpen(this.save, stage)) return;
    startRun(this.save, stage);
    this.persist();
    this.view = 'question'; this.chosen = ''; this.shownHint = false; this.render(); this.readQuestion();
  }

  private click(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button)) return;
    const id = button.dataset.stage;
    if (id) { const stage = STAGES.find((s) => s.id === id); if (stage) this.begin(stage); return; }
    const key = button.dataset.key;
    if (key !== undefined) { this.input(key); return; }
    switch (button.dataset.action) {
      case 'resume': this.view = 'question'; this.chosen = ''; this.render(); this.readQuestion(); break;
      case 'home': this.view = 'home'; this.render(); this.say('选一条训练线，接着练习吧。', 'ma.home'); break;
      case 'replay': this.coach.replay(); break;
      case 'retry': { const stage = STAGES.find((s) => s.id === this.lastStage); if (stage) this.begin(stage); break; }
      case 'submit': this.submit(); break;
      case 'next': this.next(); break;
    }
  }

  private keydown(event: KeyboardEvent): void {
    if (this.view === 'question' && (/^[0-9]$/.test(event.key) || event.key === 'Backspace')) this.input(event.key === 'Backspace' ? 'delete' : event.key);
    else if (event.key === 'Enter' && this.view === 'question') this.submit();
    else if (event.key === 'Enter' && this.view === 'feedback') this.next();
  }

  private input(key: string): void {
    if (this.view !== 'question') return;
    if (key === 'hint') {
      this.shownHint = !this.shownHint;
      this.render();
      if (this.shownHint && this.question) this.say(hintFor(this.question), `ma.hint.${this.question.op}`, 'encouraging');
      else this.readQuestion();
      return;
    }
    else if (key === 'delete') this.chosen = this.chosen.slice(0, -1);
    else if (this.chosen.length < 3) this.chosen = `${this.chosen}${key}`.replace(/^0+(?=\d)/, '');
    const answer = this.root.querySelector('.ma-answer');
    if (answer) answer.textContent = this.chosen || '?';
    const submit = this.root.querySelector<HTMLButtonElement>('[data-action="submit"]');
    if (submit) submit.disabled = !this.chosen;
  }

  private submit(): void {
    const q = this.question;
    if (this.view !== 'question' || !q || !this.chosen) return;
    this.feedback = Number(this.chosen) === q.answer ? 'right' : 'wrong';
    this.view = 'feedback'; this.render();
    this.say(this.feedback === 'right' ? '算对了，我们看下一题。' : `正确答案是 ${q.answer}。看看方法，再试下一题。`, this.feedback === 'right' ? 'ma.right' : ['ma.wrong', 'ma.answer', `num.${q.answer}`], this.feedback === 'right' ? 'celebrating' : 'encouraging');
  }

  private next(): void {
    if (this.view !== 'feedback' || !this.save.run) return;
    const result = recordAnswer(this.save, this.feedback === 'right');
    this.persist();
    this.chosen = ''; this.shownHint = false;
    if (result.finished) { this.lastStage = result.stageId; this.lastScore = result.score; this.view = 'result'; }
    else this.view = 'question';
    this.render();
    if (result.finished) this.say(result.score >= PASS_SCORE ? '八道题做完了，下一阶已经开启。' : '这一轮做完了，再练一次也可以。', result.score >= PASS_SCORE ? 'ma.pass' : 'ma.retry', result.score >= PASS_SCORE ? 'celebrating' : 'encouraging');
    else this.readQuestion();
  }
}
