/**
 * Everything the robot says in the arithmetic station: one table of WHOLE sentences (id -> text). Round 3 voice rule: the robot never
 * splices short clips and never reads numbers; the equation is only on the screen. A caption is the concatenation of whole sentences and
 * is exactly what is spoken. Sentences that have no recording yet stay silent (caption only) - never a device voice.
 */
import type { Problem, Stage } from './problems';

export interface Tok { id: string; text: string }

/** First block: lines that already have recordings (/audio/mars-arithmetic). Second block: new in 2.0 (content/narration/mars-arithmetic.yaml). */
export const LINES: Record<string, string> = {
  'ma.home': '欢迎来到火星算术站，我是火星搭档。选一条路线，我们一起做八道题。',
  'ma.ask': '等于几？',
  'ma.op.add': '加', 'ma.op.sub': '减', 'ma.op.mul': '乘', 'ma.op.div': '除以',
  'ma.hint.add': '从第一个数开始，再往后数。',
  'ma.hint.sub': '从第一个数开始，再往回数。',
  'ma.hint.mul': '想想有几组，每组几个。',
  'ma.hint.div': '平均分成几组，每组几个？',
  'ma.right': '算对了，我们看下一题。',
  'ma.wrong': '没关系，看看正确答案，再试下一题。',
  'ma.answer': '正确答案是',
  'ma.pass': '八道题做完了，下一阶已经开启。',
  'ma.retry': '这一轮做完了，再练一次也可以。',
  // ---- new in 2.0
  'ma.home.again': '选一条路线，接着练吧。',
  'ma.home.tip': '不想从头开始？点测起点，我来看看你该从哪一阶出发。',
  'ma.blank': '几', 'ma.eq': '等于', 'ma.vs': '和',
  'ma.ask.rem': '商是几，余几？',
  'ma.ask.fill': '填几？',
  'ma.ask.cmp': '比大小，选一个符号。',
  'ma.intro.rem': '这一阶有余数。商和余数，都要填。',
  'ma.intro.fill': '这一阶要填空格里的数。',
  'ma.intro.cmp': '这一阶要比大小。点大于、小于或者等于。',
  'ma.intro.two': '这一阶有两步。先算乘或除，再算加或减。',
  'ma.intro.split': '不会算的时候，点拆一拆，我带你一步一步算。',
  'ma.warm': '先带你做两题。我们把数拆开，一块一块地算。',
  'ma.hint.add.big': '一位一位地加，满十就向前进一。',
  'ma.hint.sub.big': '一位一位地减，不够减就向前借一。',
  'ma.hint.zero': '先算前面的数，再补上后面的零。',
  'ma.hint.mul.big': '把大数拆成整十和个位，分别乘，再相加。',
  'ma.hint.div.big': '把被除数拆成好除的两块，分别除，再相加。',
  'ma.hint.rem': '想一想，几乘几最接近，剩下的就是余数。',
  'ma.hint.chain': '从左往右，一个数一个数地加。',
  'ma.hint.fill.add': '总数减去已知的数，就是空格里的数。',
  'ma.hint.fill.sub1': '大数减去结果，就是空格里的数。',
  'ma.hint.fill.sub2': '结果加上减去的数，就是空格里的数。',
  'ma.hint.fill.mul': '用右边的数，除以已知的数。',
  'ma.hint.fill.div1': '总数除以结果，就是空格里的数。',
  'ma.hint.fill.div2': '结果乘已知的数，就是空格里的数。',
  'ma.hint.cmp': '先把算式算出来，再和另一边比一比。',
  'ma.hint.two': '先算乘或除，再算加或减。',
  'ma.step.add.1': '先加第一块。', 'ma.step.add.2': '再加下一块。',
  'ma.step.sub.1': '先减第一块。', 'ma.step.sub.2': '再减下一块。',
  'ma.step.part.1': '先算第一块。', 'ma.step.part.2': '再算第二块。', 'ma.step.merge': '最后把两块合起来。',
  'ma.split.again': '这一步再想想，看看图上的数。',
  'ma.split.done': '全部算完了，合起来就是答案。',
  'ma.rem': '余', 'ma.cmp.gt': '大于', 'ma.cmp.lt': '小于',
  'ma.streak': '连续答对三道，能量满格了！',
  'ma.place.start': '我来出几道题，看看你该从哪一阶出发。不会的就猜一猜，没关系。',
  'ma.place.done': '测完了，前面的阶都算通过，我们从这里出发。',
  'ma.place.same': '测完了。你已经开启得更远了，这里保持不变。',
  'ma.place.first': '测完了，我们从第一阶出发。',
  'ma.sprint.start': '超频开始！十道题，做完记用时。',
  'ma.sprint.best': '新的最好成绩！',
  'ma.sprint.miss': '有的题没算出来，这次不计入最好成绩。',
  'ma.sprint.bestis': '最好成绩是',
  'ma.sprint.locked': '通过这条线的第三阶，就能开启超频。',
  'ma.res.used': '这次一共用了',
  'ma.res.faster': '这次比上次快了',
  'ma.res.more': '这次比以前最好的多对了',
  'ma.unit.sec': '秒', 'ma.unit.q': '道题',
  'ma.pass.last': '这一条训练线全部完成了。',
  // ---- round 3 (whole sentences only; the older texts above never change — a changed text gets a new id)
  'ma.how.calc': '算一算，等于多少？',
  'ma.how.fill': '方框里填多少？',
  'ma.how.rem': '商是多少，还剩多少？',
  'ma.how.two': '先算乘除，再算加减，等于多少？',
  'ma.intro.rem2': '这一阶有剩下的数。商和剩下的数，都要填。',
  'ma.hint.rem2': '想一想，哪个乘法最接近，再看还剩下多少。',
  'ma.sprint.start2': '超频开始！十道题，做完看用时。',
  'ma.sprint.keep': '这次没有超过最好成绩，再来一次吧。',
  'ma.res.faster2': '这次比上次快了。',
  'ma.res.more2': '这次比以前多对了。',
  'ma.res.used2': '这次的用时已经记下来了。',
};

/** ids added in round 3 (no recording yet when they were written: the robot stays silent on them, the caption still shows) */
export const V3_LINE_IDS = ['ma.how.calc', 'ma.how.fill', 'ma.how.rem', 'ma.how.two', 'ma.intro.rem2', 'ma.hint.rem2', 'ma.sprint.start2', 'ma.sprint.keep', 'ma.res.faster2', 'ma.res.more2', 'ma.res.used2'];

/** Every sentence the app can say, and where. Anything in LINES that is not here is no longer used at run time (the number clips, ma.op.*, ma.blank, ma.vs, ma.eq, ma.answer ... and the old versions of changed lines). */
export const RUNTIME_LINES: Record<string, string> = {
  'ma.home': '首页：第一次进入（接 ma.home.tip）',
  'ma.home.tip': '首页：第一次进入',
  'ma.home.again': '首页：之后回到首页',
  'ma.how.calc': '题型“算一算”（加减乘除、连加）：每阶第一题自动播放，题型变化时播放，其余静默（字幕仍在，点喇叭播放）',
  'ma.how.fill': '题型“填方框”：同上',
  'ma.how.rem': '题型“商和剩下的数”：同上',
  'ma.how.two': '题型“两步题”：同上（第一题由 ma.intro.two 代替）',
  'ma.ask.cmp': '题型“比大小”：同上（第一题由 ma.intro.cmp 代替）',
  'ma.intro.fill': '混合线填数两阶：第一题，接 ma.how.fill',
  'ma.intro.cmp': '混合线比大小：第一题',
  'ma.intro.two': '混合线两步题：第一题',
  'ma.intro.rem2': '有剩下的数的两阶（除法 9、10）：第一题，接 ma.how.rem',
  'ma.intro.split': '有拆一拆题型、且不用热身的阶：第一题，接在题型句后面',
  'ma.warm': '要热身的阶：第一道热身，接第一步的句子',
  'ma.step.add.1': '拆一拆（加）：第一步', 'ma.step.add.2': '拆一拆（加）：之后每一步',
  'ma.step.sub.1': '拆一拆（减）：第一步', 'ma.step.sub.2': '拆一拆（减）：之后每一步',
  'ma.step.part.1': '拆一拆（乘、除）：第一块', 'ma.step.part.2': '拆一拆（乘、除）：第二块', 'ma.step.merge': '拆一拆（乘、除）：合起来',
  'ma.split.again': '拆一拆：某一步答错',
  'ma.split.done': '拆一拆：全部做完',
  'ma.hint.add': '提示（加，1–6 阶）', 'ma.hint.sub': '提示（减，1–6 阶）', 'ma.hint.mul': '提示（乘，1–6 阶）', 'ma.hint.div': '提示（除，1–6 阶；整十除以一位的表内题）',
  'ma.hint.add.big': '提示（加，7–10 阶）', 'ma.hint.sub.big': '提示（减，7–10 阶）', 'ma.hint.zero': '提示（整十整百乘除）',
  'ma.hint.mul.big': '提示（乘，8–10 阶）', 'ma.hint.div.big': '提示（除，8 阶）', 'ma.hint.rem2': '提示（有剩下的数的除法）', 'ma.hint.chain': '提示（连加）',
  'ma.hint.fill.add': '提示（填数：加）', 'ma.hint.fill.sub1': '提示（填数：减，减数是方框）', 'ma.hint.fill.sub2': '提示（填数：减，被减数是方框）',
  'ma.hint.fill.mul': '提示（填数：乘）', 'ma.hint.fill.div1': '提示（填数：除，除数是方框）', 'ma.hint.fill.div2': '提示（填数：除，被除数是方框）',
  'ma.hint.cmp': '提示（比大小）', 'ma.hint.two': '提示（两步题）',
  'ma.right': '答对（含再试一次后答对）', 'ma.streak': '连续答对三道（代替 ma.right）',
  'ma.wrong': '再试也没算出来、点“看答案”之后；超频里答错之后（答案显示在屏幕上）',
  'ma.pass': '一轮结束且通过', 'ma.pass.last': '一轮结束且通过，这条线最后一阶', 'ma.retry': '一轮结束但没通过',
  'ma.res.faster2': '结算：比上次快 ≥ 5 秒（数字只在屏幕上）', 'ma.res.more2': '结算：得分比以前最好高（数字只在屏幕上）', 'ma.res.used2': '结算：其余情况（用时只在屏幕上）',
  'ma.place.start': '测起点：开始', 'ma.place.done': '测起点：结果往上抬了', 'ma.place.same': '测起点：结果没有更高', 'ma.place.first': '测起点：从第一阶开始',
  'ma.sprint.start2': '超频：开始', 'ma.sprint.best': '超频：新的最好成绩', 'ma.sprint.keep': '超频：全对但没超过最好成绩', 'ma.sprint.miss': '超频：有题没算出来', 'ma.sprint.locked': '首页：点还没开启的超频',
};

export const line = (id: string): Tok => ({ id, text: LINES[id] ?? id });
/** the captions are whole sentences and are spoken as they are written */
export const captionOf = (toks: Tok[]): string => toks.map((t) => t.text).join('');

/** The one-sentence "how to answer" for a kind of question. The equation itself is never read aloud. */
export function howId(p: Problem): string {
  switch (p.kind) {
    case 'rem': return 'ma.how.rem';
    case 'fill': return 'ma.how.fill';
    case 'cmp': return 'ma.ask.cmp';
    case 'expr': return p.ops.some((o) => o === 'mul' || o === 'div') ? 'ma.how.two' : 'ma.how.calc';
    case 'calc': return 'ma.how.calc';
  }
}

/** The generic spoken hint for a problem (the line id). */
export function hintId(stage: Stage, p: Problem): string {
  switch (p.kind) {
    case 'rem': return 'ma.hint.rem2';
    case 'cmp': return 'ma.hint.cmp';
    case 'expr': return stage.id === 'add-7' ? 'ma.hint.chain' : 'ma.hint.two';
    case 'fill':
      if (p.op === 'add') return 'ma.hint.fill.add';
      if (p.op === 'sub') return p.b === null ? 'ma.hint.fill.sub1' : 'ma.hint.fill.sub2';
      if (p.op === 'mul') return 'ma.hint.fill.mul';
      return p.b === null ? 'ma.hint.fill.div1' : 'ma.hint.fill.div2';
    case 'calc':
      if (stage.tier <= 6) return `ma.hint.${p.op}`;
      if (p.op === 'add') return 'ma.hint.add.big';
      if (p.op === 'sub') return 'ma.hint.sub.big';
      if (p.op === 'mul') return stage.id === 'mul-7' ? 'ma.hint.zero' : 'ma.hint.mul.big';
      return stage.id === 'div-7' ? (p.a % 10 === 0 ? 'ma.hint.zero' : 'ma.hint.div') : 'ma.hint.div.big';
  }
}
/** The sentence said at the start of a run, for stages with a new kind of question. */
export function introId(stage: Stage): string | null {
  return ({ 'div-9': 'ma.intro.rem2', 'div-10': 'ma.intro.rem2', 'mix-1': 'ma.intro.fill', 'mix-2': 'ma.intro.fill', 'mix-3': 'ma.intro.cmp', 'mix-4': 'ma.intro.two' } as Record<string, string>)[stage.id] ?? null;
}
/** Intros that already say how to answer, so no how-sentence follows them. */
export const INTRO_COVERS_HOW = ['ma.intro.cmp', 'ma.intro.two'];
