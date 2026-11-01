// site/xiangqi/src/app/academy.ts — 学堂：9 章 33 课的路径图 + 摸底「小军师考考你」+ 课播放屏（引擎 lesson 播放器；步型 / 提示阶梯 / 孪生题都在引擎里）。
import { h, icon, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import { xqResult } from './result';
import { unlockAll } from '@kit/settings';
import type { Companion } from '@kit/companion';
import { isTestEnv } from '@kit/dev';
import { createBoardView, type BoardViewImpl } from '@engines/board/view/board-view';
import { createInputController, type InputControllerImpl } from '@engines/board/input/input-controller';
import { createGhost } from '@engines/board/lesson/ghost';
import { createStepUi } from '@engines/board/lesson/step-ui';
import { createLessonPlayer, type LessonDef } from '@engines/board/lesson/player';
import { clearLast, nameMap, posOf, registerStep, stepPromise, type LessonStep, type StepContextImpl } from '@engines/board/lesson/registry';
import { createHintLadder } from '@engines/board/core/hints';
import type { LessonHooks, StepContext, StepResult, Sq } from '@engines/board/core/types';
import { layout, layoutMap, type Vp } from './layout';
import { place, setBack, setBubbleW, sleep, type AppCtx, type Screen } from './ctx';
import { gradePlacement, recommendAfter } from '../lesson/placement';
import { XQ_CHAPTERS, XQ_LESSONS, XQ_PLACEMENT, xqLessonData, previewFen, focusNames, type Beat, type XqLesson } from '../lesson/data';
import { createRules } from '../rules/rules';
import { START_FEN, type Position } from '../rules/position';
import { DEFAULT_HOUSE, type LessonRec } from '../progress/save';
import type { GameParams } from './game';
import { lessonsDone } from '../progress/save';
import { createFx, type Fx } from '../art/fx';
import { renderCoordRow, a11yRelabel } from '../art/coords';
import type { Disposable } from '@engines/board/core/types';

const SFX: Record<string, string> = { ok: 'correct', soft: 'hit-soft', star: 'star-1' };
/** 节点标签：超过 5 个字手动折成两行等长（中文不能靠浏览器折：会折出「…换 / 子」） */
const nameEl = (nm: string): HTMLElement => { const cs = Array.from(nm); if (cs.length <= 5) return h('span', { class: 'nm' }, nm); const k = Math.ceil(cs.length / 2); return h('span', { class: 'nm' }, cs.slice(0, k).join(''), h('br'), cs.slice(k).join('')); };
const isDone = (s: AppCtx['save'], id: string): boolean => !!(s.lessons[id]?.done || s.lessons[id]?.known);
const chOf = (id: string): number => XQ_LESSONS.find((l) => l.id === id)?.ch ?? 0;

// ═════════════ 路径图 ═════════════
export function mountAcademy(ctx: AppCtx): Screen {
  const s = ctx.save; const root = h('div', { class: 'xq-screen xq-academy', 'data-screen': 'academy' }); ctx.root.append(root);
  const title = h('div', { class: 'xq-title' }); const placement = h('button', { type: 'button', class: 'xq-btn', 'data-act': 'placement', onclick: () => ctx.go({ to: 'lesson', placement: true }) }, '考考你 ▸ 会的跳过');
  const area = h('div', { class: 'xq-maparea' }); const inner = h('div', { class: 'xq-mapinner' }); area.append(inner); const dock = h('div', { class: 'xq-dock' }); const botHost = h('div', { class: 'xq-bot' }); root.append(title, placement, area, dock, botHost);
  const bot: Companion = ctx.mountBot(botHost, { size: '100%', bubble: 'right', accessory: 'junshi', mood: 'idle' }); void ctx.speak(bot, 's.learn');
  const recIds = (): string[] => (s.placement.done ? (s.placement.rec ?? []).filter((id) => !isDone(s, id)) : []);
  const firstOpen = (): string | null => recIds()[0] ?? XQ_LESSONS.find((l) => !isDone(s, l.id))?.id ?? null; let vp = ctx.vp();
  type NodeState = 'done' | 'known' | 'current' | 'open' | 'locked';
  const stateOf = (i: number): NodeState => { const l = XQ_LESSONS[i]; const rec = s.lessons[l.id]; if (rec?.done) return 'done'; if (rec?.known) return 'known'; if (l.id === firstOpen()) return 'current'; const prevOk = i === 0 || isDone(s, XQ_LESSONS[i - 1].id); return prevOk || unlockAll() || recIds().includes(l.id) ? 'open' : 'locked'; };
  const markKnown = async (ch: number): Promise<void> => {
    const r = await xqResult(ctx, { kind: 'chapter-skip', ribbon: `第 ${ch} 章`, title: '真的都会了吗？', text: '会的话，这一章就先跳过。随时能回来重学。', actions: [{ id: 'yes', label: '真的会', kind: 'primary' }, { id: 'no', label: '再看看', kind: 'secondary' }] }); if (r !== 'yes') return;
    for (const l of XQ_LESSONS) if (l.ch === ch && !s.lessons[l.id]?.done) s.lessons[l.id] = { stars: 2, stepId: l.steps[0].id, done: false, known: true }; ctx.persist(); ctx.metrics.refresh(); ctx.sfx('star-2'); void ctx.speak(bot, 'pl.know'); draw();
  };
  function draw(): void {
    const M = layoutMap(vp); const land = M.S.w > M.S.h; const cur = XQ_LESSONS.find((l) => !isDone(s, l.id));
    title.replaceChildren(h('span', null, '学堂'), h('small', null, cur ? `第 ${cur.ch} 章 · ${XQ_CHAPTERS.find((c) => c[0] === cur.ch)?.[1] ?? ''}` : '全部学完啦'), h('span', { class: 'xq-turn', 'data-on': '1' }, `已学 ${lessonsDone(s)} / 33 课`));
    place(title, { x: M.head.x + 66, y: M.head.y, w: M.head.w - 66, h: M.head.h }); place(placement, M.placement); place(area, M.map); place(dock, M.dock); place(botHost, { x: M.dock.x + 6, y: M.dock.y + 4, w: Math.min(56, M.dock.h - 8), h: Math.min(56, M.dock.h - 8) }); setBack(M.home); setBubbleW(M.dock.w - 90);
    placement.style.display = s.placement.done && land ? 'none' : ''; inner.style.width = '100%'; inner.style.height = 'auto'; inner.classList.toggle('is-wide', M.map.w >= 760);
    inner.replaceChildren(); let curEl: HTMLElement | null = null;
    for (const [ch, chName] of XQ_CHAPTERS as readonly [number, string][]) {
      const ls = XQ_LESSONS.map((l, i) => ({ l, i })).filter((x) => x.l.ch === ch); const allDone = ls.every((x) => isDone(s, x.l.id)); const nDone = ls.filter((x) => isDone(s, x.l.id)).length; const knownAll = ls.every((x) => s.lessons[x.l.id]?.known && !s.lessons[x.l.id]?.done);
      const head = h('div', { class: 'xq-chap-h' }, h('span', { class: `seal ${allDone ? '' : 'off'}`, 'aria-hidden': 'true' }, String(ch)), h('b', null, `第 ${ch} 章 · ${chName}`), h('small', null, knownAll ? '已会 ✓' : `${nDone} / ${ls.length}`));
      if (!allDone && !knownAll) head.append(h('button', { type: 'button', class: 'xq-chap-know', 'data-know': String(ch), onclick: () => void markKnown(ch) }, '我会了'));
      const nodesEl = h('div', { class: 'xq-nodes' }); let hasCur = false;
      for (const { l, i } of ls) {
        const st = stateOf(i); const n = h('button', { type: 'button', class: `xq-node is-${st}`, 'data-id': l.id, 'aria-label': `第 ${i + 1} 课 ${l.name}`, onclick: () => { if (st === 'locked') { ctx.sfx('ui-locked'); void ctx.speak(bot, 'f.try3'); return; } ctx.sfx('ui-open'); ctx.go({ to: 'lesson', lessonId: l.id }); } },
          h('span', { class: 'c' }, String(i + 1)), nameEl(l.name)); if (recIds().includes(l.id) && st !== 'done' && st !== 'known') n.append(h('span', { class: 'st rec' }, '推荐'));
        const stars = s.lessons[l.id]?.stars ?? 0; if (st === 'done') n.append(h('span', { class: 'st' }, '★'.repeat(Math.max(1, stars)))); else if (st === 'known') n.append(h('span', { class: 'st k' }, '会'));
        nodesEl.append(n); if (st === 'current') { hasCur = true; curEl = n; }
      }
      const chapEl = h('section', { class: `xq-chap ${allDone ? 'is-done' : ''} ${hasCur ? 'is-cur' : ''}`, 'data-ch': String(ch) }, head, nodesEl);
      if (ch === 5) chapEl.append(h('div', { class: 'xq-chap-gate' }, '学完这一章，机关人「滑轮」就来开门')); inner.append(chapEl);
    }
    const later = XQ_LESSONS.filter((_, i) => stateOf(i) === 'locked').length; if (later > 0) inner.append(h('div', { class: 'xq-later' }, `灰色的课，学完前面的就会亮起来。后面还有 ${later} 课。`));
    const target = (curEl as HTMLElement | null)?.closest('.xq-chap') as HTMLElement | null; if (target) area.scrollTop = Math.max(0, target.offsetTop - 8);
  }
  draw();
  return { resize: (v) => { vp = v; draw(); }, destroy: () => { bot.destroy(); root.remove(); }, onBack: () => { ctx.go({ to: 'hall' }); return true; } };
}

// ═════════════ 摸底的"点出所有能走的点"：好了 / 对错反馈（不再凑够数量自动提交）═════════════
registerStep<number, Position>('qmoves', {
  hint: () => ({}),
  async demo() { /* 摸底不演示 */ },
  mount(step, ctx) {
    const c = ctx as unknown as StepContextImpl<number, Position>; const { view, rules } = c; const names = nameMap(rules);
    view.finishAnimations(); view.setState(rules.fromFen(posOf(step, c))); clearLast(view);
    const from = names.get(String(step.from)) as Sq; const answer = new Set<Sq>(((step.answer as string[]) ?? []).map((n) => names.get(n)).filter((q): q is Sq => q !== undefined));
    const picked = new Map<Sq, Disposable>(); const keep: Disposable[] = [view.mark('select', [from])]; const hintText = '点出能走的点，再按「好了」';
    const counter = c.ui?.counter(hintText);
    return stepPromise<StepResult>(c, (done) => {
      let finished = false; const update = (): void => counter?.set(picked.size ? `已选 ${picked.size} 个` : hintText);
      const evaluate = (): void => {
        const right = picked.size === answer.size && [...picked.keys()].every((q) => answer.has(q));
        for (const d of picked.values()) d.dispose(); picked.clear();
        if (right) { c.hooks.sfx('ok'); keep.push(view.mark('star', [...answer])); void c.hooks.narrate('f.ok1'); counter?.set('对！'); setTimeout(() => done({ stars: 3, firstTry: true, hintTier: 0 }), 1100); }
        else { c.hooks.sfx('soft'); keep.push(view.mark('star', [...answer], { pulse: true })); void c.hooks.narrate('pl.miss'); counter?.set('看，这几个才对'); setTimeout(() => done({ stars: 1, firstTry: false, hintTier: 0 }), 3000); }
      };
      const btn = c.ui?.button('好了', () => { if (finished) return; finished = true; evaluate(); }, { id: 'confirm' });
      const restore = c.input.overrideHooks({ canAct: () => true, rawTap: (sq: Sq) => { if (finished || sq === from) return true; const ex = picked.get(sq); if (ex) { ex.dispose(); picked.delete(sq); c.hooks.sfx('soft'); } else { picked.set(sq, view.mark('hint', [sq])); c.hooks.sfx('ok'); } update(); return true; } });
      return () => { restore(); btn?.dispose(); counter?.dispose(); for (const d of picked.values()) d.dispose(); for (const d of keep) d.dispose(); };
    });
  },
});

// ═════════════ 课播放屏 ═════════════
export interface LessonRun { id: string; name: string; steps: readonly LessonStep[]; lines: readonly string[]; intro: readonly string[]; post: readonly string[]; placement?: boolean }
export const lessonRunOf = (lessonId?: string, placement?: boolean): LessonRun => {
  if (placement) return { id: 'PL', name: '小军师考考你', steps: XQ_PLACEMENT, lines: [], intro: ['pl.intro'], post: [], placement: true };
  const l = (XQ_LESSONS.find((x) => x.id === lessonId) ?? XQ_LESSONS[0]) as XqLesson; return { id: l.id, name: l.name, steps: l.steps as readonly LessonStep[], lines: l.lines, intro: l.intro ?? [], post: l.post ?? [] };
};
export function mountLesson(ctx: AppCtx, run: LessonRun): Screen {
  const rules = createRules(); const s = ctx.save; let destroyed = false; let lastIll: { from: number; to: number; why: string; pos: Position } | null = null; { const orig = rules.whyIllegal.bind(rules); (rules as { whyIllegal: typeof rules.whyIllegal }).whyIllegal = (st, f, t) => { const w = orig(st, f, t); if (w) lastIll = { from: f, to: t, why: w, pos: st }; return w; }; } let L = layout(ctx.vp(), { screen: 'lesson', coords: lessonCoords(ctx.vp()) });
  const root = h('div', { class: 'xq-screen xq-lesson', 'data-screen': 'lesson' }); const host = h('div', { class: 'xq-host' }); const dock = h('div', { class: 'xq-dock' }); const botHost = h('div', { class: 'xq-bot' }); const title = h('div', { class: 'xq-title' }); const dots = h('div', { class: 'xq-dots' }); const slot = h('div', { class: 'xq-slot' }); const coordEl = h('div', { class: 'xq-coordrow' });
  // 常驻目标条：压在伙伴气泡的位置下面——气泡说完消失后，这一步要做什么仍然看得见；点一下再听一遍
  const goal = h('button', { type: 'button', class: 'xq-goal', 'data-goal': '', 'aria-label': '再听一遍', onclick: () => void say(lastGoal) }); goal.style.display = 'none';
  root.append(host, dock, title, dots, goal, botHost, slot, coordEl);
  const keyDefs: { id: string; ic: Parameters<typeof icon>[0]; label: string; fn: () => void }[] = [{ id: 'listen', ic: 'listen', label: '再听一遍', fn: () => void say(lastSay) }, { id: 'again', ic: 'restart', label: '重来这步', fn: () => void restartStep() }, { id: 'map', ic: 'map', label: '回学堂', fn: () => ctx.go({ to: 'academy' }) }];
  const keys = keyDefs.map((k) => { const b = h('button', { type: 'button', class: 'xq-key', 'data-key': k.id, 'aria-label': k.label, onclick: k.fn }); b.innerHTML = `${icon(k.ic)}<span>${k.label}</span>`; root.append(b); return b; });
  ctx.root.append(root);
  const view: BoardViewImpl<number, Position> = createBoardView<number, Position>(host, { rules, theme: ctx.theme, orientation: 'first-bottom', seat: 'single', coords: false, reducedMotion: false });
  const fx: Fx = createFx(view); const unRelabel = a11yRelabel(view.el); let sight: Disposable | null = null; let sightTimer: ReturnType<typeof setTimeout> | null = null;
  const sightCheck = (): void => { sight?.dispose(); sight = null; if (sightTimer) clearTimeout(sightTimer); if (viewState.facing()) { sight = view.mark('sight', [viewState.ksq[0], viewState.ksq[1]], { pulse: true }); ctx.sfx('ui-notify', { volume: 0.7 }); fx.sparks(viewState.ksq[1], { n: 8 }); sightTimer = setTimeout(() => { sight?.dispose(); sight = null; }, 2400); } };
  view.on('landed', ({ sq }) => fx.ripple(sq)); view.on('captured', ({ sq }) => { fx.sparks(sq, { n: 10 }); fx.shake(2.5); });
  // 开场前棋盘是空的：状态用空盘，不是标准开局（否则点空盘会选中"看不见的"棋子）
  let viewState = rules.fromFen('9/9/9/9/9/9/9/9/9/9 w'); const origSet = view.setState.bind(view); view.setState = (st, o) => { viewState = st; origSet(st, o); };
  const input = createInputController(view, rules, { state: () => viewState, seatToMove: () => rules.turn(viewState), canAct: () => true, commit: async () => undefined, onIllegal: () => undefined }, { keyboard: false }) as InputControllerImpl<number, Position>;
  input.enable(false);                                       // 开场白 / 步前旁白期间输入锁住：下一步 onStep('start') 才放开
  const bot: Companion = ctx.mountBot(botHost, { size: '100%', bubble: 'right', bubbleMax: Math.max(140, L.bubble.w), accessory: 'junshi', mood: 'idle' });
  let lastSay = ''; let lastGoal = ''; let skipFlag = isTestEnv() && new URLSearchParams(location.search).get('intro') === '0'; let curStep = run.steps[0]?.id ?? '';
  const say = async (id: string): Promise<void> => { if (!id) return; lastSay = id; await ctx.speak(bot, id); };
  const ghost = createGhost(view, rules, { playMove: async (enc) => { const m = rules.decode(viewState, enc); if (m === null) return; const before = viewState; viewState = rules.apply(before, m); await view.animateMove(m, before); sightCheck(); } });
  const ui = createStepUi(view as unknown as BoardViewImpl<never, never>, { slot });
  const data = xqLessonData(rules); const names = nameMap(rules);
  // L33 第一盘棋（play 步）：把旁白里的三件事——出车、架炮、护九宫——一件件指给孩子看，再去下一盘真棋（和滑轮，小军师提醒开着）。这盘下完，这一课才算学完（赢输都算）。
  data.play = (st, c) => new Promise<StepResult>(() => {
    const cc = c as unknown as StepContextImpl<number, Position>;
    void (async () => {
      cc.input.enable(false);
      for (const [lid, sqs] of [['l33.rook', ['a1', 'i1']], ['l33.cannon', ['b3', 'h3']], ['l33.guard', ['d1', 'e1', 'f1']]] as [string, string[]][]) { if (destroyed) return; await playBeat({ say: lid, focus: sqs }, st); }
      if (destroyed) return;
      const go = (): void => { const seed = (Date.now() ^ 0x9e3779b9) & 0x7fffffff; const params: GameParams = { mode: 'robot', robotId: 'R1', startFen: START_FEN, moves: [], side: 0, handicap: 'none', seed, coach: true, easy: false, rules: { ...DEFAULT_HOUSE }, lesson: 'L33' }; ctx.go({ to: 'game', params }); };
      const ch = cc.ui?.choose([{ id: 'play-first', label: '去下第一盘' }, { id: 'play-later', label: '先回学堂' }] as never); void ch?.pick().then((id) => { if (id === 'play-first') go(); else ctx.go({ to: 'academy' }); });
    })();
  });
  // ── 步前预览 + 旁白拍（开场 / 步前）：先把这一步的局面摆上盘，再念；念的时候指给孩子看 ──
  let pointer: Disposable[] = []; const clearPointer = (): void => { for (const d of pointer) d.dispose(); pointer = []; };
  const sqsOf = (ns: readonly string[] | undefined): number[] => (ns ?? []).map((n) => names.get(n)).filter((q): q is number => q !== undefined);
  const stepById = (id: string): LessonStep | undefined => run.steps.find((x) => x.id === id);
  const preview = (st: LessonStep): void => { const fen = previewFen(st, data); if (!fen) return; view.finishAnimations(); view.setState(rules.fromFen(fen)); clearLast(view); };
  const playedPre = new Set<string>(); let preDone: Promise<void> = Promise.resolve(); let stepLive = false; let twinLive = false; let curStepObj: LessonStep | undefined;
  /** 步后揭晓（post）画在这一步的题面上：点出能吃它的子 = 每个攻击者到目标画一条"线"，目标圈红（"看，这些线都能吃到它"） */
  const revealOf = (st: LessonStep): Disposable[] => {
    const ds: Disposable[] = []; if (st.k !== 'quiz' || st.q !== 'attackers') return ds; const t = names.get(String(st.target)); if (t === undefined) return ds;
    ds.push(view.mark('danger', [t])); for (const n of (st.answer as string[] | undefined) ?? []) { const a = names.get(n); if (a !== undefined) ds.push(view.arrow(a, t, 'threat')); } return ds;
  };
  async function playBeat(b: Beat, st: LessonStep, post = false): Promise<void> {
    const id = typeof b === 'string' ? b : b.say; const sqs = sqsOf(typeof b === 'string' ? focusNames(st, data) : b.focus ?? focusNames(st, data)); clearPointer();
    if (post && !twinLive) { preview(st); pointer.push(...revealOf(st)); }       // 揭晓回到这一步的题面上念（摆子 / 走子的步，答完盘已经变了；孪生题就留在孪生盘上，不画线）
    if (sqs.length) pointer.push(view.mark('hint', sqs, { pulse: true })); await say(id); clearPointer();
  }
  async function playPre(st: LessonStep): Promise<void> {
    if (playedPre.has(st.id)) return; playedPre.add(st.id); const beats: Beat[] = [...(st === run.steps[0] ? run.intro : []), ...(((st as { pre?: Beat[] }).pre) ?? [])];
    for (const b of beats) { if (destroyed || skipFlag || shouldAutoSkip()) break; await playBeat(b, st); }
  }
  const setGoal = (id: string): void => { lastGoal = id; goal.replaceChildren(); if (!id) { goal.style.display = 'none'; return; } goal.style.display = ''; goal.append(h('span', { class: 'sp', 'aria-hidden': 'true' }, '🔊'), h('span', { class: 't' }, ctx.lineText(id))); };
  const hooks: LessonHooks = {
    narrate: async (id) => {
      await preDone; if (destroyed) return;
      if (id.startsWith('w.') && lastIll && lastIll.why === id.slice(2)) fx.reason(lastIll.pos, lastIll.from, lastIll.to, lastIll.why);
      const st = curStepObj; if (st && !stepLive && st.say === id) { setGoal(id); if (st.k === 'demo') { void say(id); return; } }     // 演示步：边说边演，不等念完
      return say(id);
    },
    companion: { mood: (m) => bot.setMood(m as never), say: (id) => say(id) }, sfx: (n) => ctx.sfx(SFX[n] ?? n), ghost,
    save: (p) => {
      curStep = p.stepId; curStepObj = stepById(p.stepId); stepLive = false; clearPointer(); setGoal(''); input.enable(false);
      if (curStepObj) {
        preview(curStepObj); preDone = playPre(curStepObj);
        // QA r2 m5：题组步（bank / bank2，含摸底第 9 题）由谜题播放器自己跑，不经 hooks.narrate——这里补上常驻目标条，念完步前旁白就亮
        // 同时：题组的每一题都会再存一次检查点（把输入锁上），而谜题播放器从不自己放开输入 → 这里在步前旁白念完后放开（否则 20 多个题组步——L14.4 / L20.3–4 / L25–L32 / 摸底第 9 题——触屏点不动）
        if (curStepObj.k === 'bank' || curStepObj.k === 'bank2') { const at = curStepObj; const sid = typeof at.say === 'string' ? at.say : ''; void preDone.then(() => { if (destroyed || curStepObj !== at) return; if (sid) setGoal(sid); stepLive = true; clearPointer(); input.enable(true); }); }
      }
      if (run.placement) return; const rec: LessonRec = s.lessons[p.lessonId] ?? { stars: 0, stepId: p.stepId, done: false }; s.lessons[p.lessonId] = { ...rec, stepId: p.stepId, ...(p.puzzleIx !== undefined ? { puzzleIx: p.puzzleIx } : {}) }; ctx.persist();
    },
    skip: () => skipFlag || shouldAutoSkip(),
  };
  const stepCtx = { rules, view, input, ai: null as never, hooks, hints: createHintLadder(), ui, data, wrongHoldMs: 700 } as unknown as StepContextImpl<number, Position> & StepContext<number, Position>;
  const renderDots = (i: number): void => { dots.replaceChildren(...run.steps.map((_, k) => h('i', { class: `${k < i ? 'on' : k === i ? 'cur' : ''}` }))); };
  const askOptional = async (): Promise<boolean> => { const r = await xqResult(ctx, { kind: 'battle-ask', ribbon: '小战场', title: '来玩一局小战场？', text: '玩不玩都行。', actions: [{ id: 'yes', label: '来玩', kind: 'primary' }, { id: 'no', label: '先不玩', kind: 'secondary' }] }); return r === 'yes'; };
  const player = createLessonPlayer(stepCtx, { askOptional, onStep: async (e) => {
    if (e.phase === 'start') { stepLive = true; twinLive = e.step.id !== run.steps[e.index]?.id; clearPointer(); input.enable(true); renderDots(e.index); title.replaceChildren(h('span', null, run.name), ...(run.placement ? [h('small', null, `第 ${e.index + 1} / ${e.total} 题`)] : [])); }
    else {
      clearPointer(); setGoal(''); input.enable(false);
      // 步后旁白（QA r2 m6：揭晓句 "看，这些线都能吃到它" 放在答完之后念，目标条留给"要做什么"）。QA r3：必须念完才进下一步——引擎等这个 Promise，
      // 下一步的局面（hooks.save → preview）在揭晓句说完之后才摆上盘，不会再念在别人的盘上
      const done = run.steps[e.index] as (LessonStep & { post?: Beat[] }) | undefined; const beats = done?.post ?? [];
      if (beats.length && !skipFlag && !shouldAutoSkip()) for (const b of beats) { if (destroyed || skipFlag) break; await playBeat(b, done as LessonStep, true); }
    }
  } });
  const unmountSkip = mountSkipButton(root, () => { skipFlag = true; ctx.narrator.stop(); ghost.cancel(); bot.hush(); }, { delayMs: 1500 });

  function applyLayout(vp: Vp): void {
    L = layout(vp, { screen: 'lesson', coords: lessonCoords(vp) }); view.layout(L.board); place(dock, L.dock ?? L.panel); place(botHost, L.companion); place(dots, L.dots); setBack(L.home); if (L.skip) document.documentElement.style.setProperty('--xg-skip-top', `${L.skip.y}px`); setBubbleW(L.bubble.w); place(goal, L.bubble); goal.style.width = 'auto'; goal.style.height = 'auto'; goal.style.maxWidth = `${L.bubble.w}px`; goal.style.minHeight = `${Math.min(L.bubble.h, 48)}px`; goal.style.top = `${Math.round(L.companion.y + L.companion.h / 2 - Math.min(L.bubble.h, 48) / 2)}px`;
    place(coordEl, L.coordRow); if (L.coordRow) renderCoordRow(coordEl, L.c, 0);
    place(title, L.portrait ? { x: L.home.x + L.home.w + 10, y: L.home.y, w: L.S.w - L.home.w - 24 - 100, h: L.home.h } : { x: L.panel!.x + L.home.w + 10, y: L.home.y, w: L.panel!.w - L.home.w - 10 - 90, h: L.home.h });
    keys.forEach((k, i) => place(k, L.keys[i])); const u = L.keys.reduce((a, r) => ({ x1: Math.min(a.x1, r.x), y1: Math.min(a.y1, r.y), x2: Math.max(a.x2, r.x + r.w), y2: Math.max(a.y2, r.y + r.h) }), { x1: 1e9, y1: 1e9, x2: 0, y2: 0 });
    place(slot, { x: u.x1, y: u.y1, w: u.x2 - u.x1, h: u.y2 - u.y1 });
  }
  const bubbleObs = new MutationObserver(() => { goal.classList.toggle('is-under', !!botHost.querySelector('.xg-bot-bubble')); }); bubbleObs.observe(botHost, { childList: true, subtree: true });     // 气泡在说话时目标条藏在它下面，气泡消失后目标条留着
  const obs = new MutationObserver(() => { const busy = slot.childElementCount > 0; keys.forEach((k) => { k.style.visibility = busy ? 'hidden' : ''; }); }); obs.observe(slot, { childList: true });

  async function runFrom(stepId?: string): Promise<void> {
    /* 摸底 = 测验口径（strict）：不预亮提示、不放宽，一次答对才算会 */ const def: LessonDef = { id: run.id, steps: run.steps, strict: run.placement === true }; const prog = stepId ? { lessonId: run.id, stepId } : !run.placement && s.lessons[run.id] && !s.lessons[run.id].done ? { lessonId: run.id, stepId: s.lessons[run.id].stepId, puzzleIx: s.lessons[run.id].puzzleIx } : null;
    let res; try { res = await player.run(def, prog); } catch (e) { if ((e as { cancelled?: boolean }).cancelled) return; throw e; }
    if (destroyed || !res.completed) return; await finish(res);
  }
  async function restartStep(): Promise<void> { player.cancel(); ghost.cancel(); input.select(null); view.finishAnimations(); await sleep(60); void runFrom(curStep); }
  async function finish(res: Awaited<ReturnType<typeof player.run>>): Promise<void> {
    unmountSkip(); input.enable(false); clearPointer(); setGoal('');
    if (run.placement) {
      const g = gradePlacement(XQ_PLACEMENT.map((st) => ({ stepId: st.id, correct: !!res.results.find((x) => x.stepId === st.id)?.result.firstTry && res.results.find((x) => x.stepId === st.id)?.result.hintTier === 0 })));
      for (const id of g.known) { const l = XQ_LESSONS.find((x) => x.id === id); if (l && !s.lessons[id]?.done) s.lessons[id] = { stars: 2, stepId: l.steps[0].id, done: false, known: true }; }
      const known: Record<string, boolean> = {}; for (const [ch] of XQ_CHAPTERS as readonly [number, string][]) { const ls = XQ_LESSONS.filter((l) => l.ch === ch); known[String(ch)] = ls.every((l) => isDone(s, l.id)); }
      const rec = recommendAfter((id) => isDone(s, id)); s.placement = { done: true, known, rec: rec.slice(0, 4) };
      ctx.persist(); ctx.metrics.refresh(); const n = g.known.length; const nm = (id: string): string => XQ_LESSONS.find((l) => l.id === id)?.name ?? id; const next = rec[0];
      void say(n ? 'pl.done' : 'pl.rec');
      const c = await xqResult(ctx, { kind: 'placement-result', ribbon: '小军师考考你', title: n ? `有 ${n} 课你已经会了` : '我们从头学起', text: `${n ? '会的课先跳过，随时能回来重学。' : '慢慢来，一课一课学。'}${rec.length ? `接下来先学：${rec.slice(0, 3).map(nm).join('、')}。` : ''}`, actions: [...(next ? [{ id: 'next', label: `去学 · ${nm(next)}`, kind: 'primary' as const }] : []), { id: 'map', label: '去学堂', kind: next ? ('secondary' as const) : ('primary' as const) }] });
      if (c === 'next' && next) ctx.go({ to: 'lesson', lessonId: next }); else ctx.go({ to: 'academy' }); return;
    }
    if (run.post.length) { view.finishAnimations(); view.setState(rules.initial()); for (const id of run.post) { if (destroyed || skipFlag || shouldAutoSkip()) break; await say(id); } if (destroyed) return; }
    const idx = XQ_LESSONS.findIndex((l) => l.id === run.id); s.lessons[run.id] = { stars: res.stars, stepId: s.lessons[run.id]?.stepId ?? run.steps[0].id, done: true, known: false }; ctx.persist(); ctx.metrics.refresh(); ctx.sfx('level-complete');
    void say('f.done'); const next = XQ_LESSONS[idx + 1];
    const c = await xqResult(ctx, { kind: 'lesson-done', ribbon: `第 ${idx + 1} 课`, stars: res.stars, title: '这一课学完了', text: `${run.name}，你学会了。`, actions: [...(next ? [{ id: 'next', label: `下一课 · ${next.name}`, kind: 'primary' as const }] : []), { id: 'map', label: '回学堂', kind: next ? ('secondary' as const) : ('primary' as const) }] });
    if (c === 'next' && next) ctx.go({ to: 'lesson', lessonId: next.id }); else ctx.go({ to: 'academy' });
  }
  applyLayout(ctx.vp()); renderDots(0);
  void view.ready.then(() => { root.dataset.ready = '1'; const first = run.steps[0]; if (first) preview(first); void runFrom(); });     // 第一帧就摆上第一步的局面，开场白念的时候棋盘不是空的
  (window as unknown as { __xq: unknown }).__xq = { view, input, rules, get state() { return viewState; }, ctx: stepCtx, get step() { return curStep; }, get live() { return stepLive; }, get goal() { return lastGoal; }, run, skip: () => { skipFlag = true; },
    // 测试钩子（Playwright 卡片审计 + 摸底第 9 题）：直接跳到某一步 / 直接走到结果卡
    runFrom: (id?: string) => { player.cancel(); ghost.cancel(); input.select(null); view.finishAnimations(); void runFrom(id); },
    cards: { battleAsk: () => { void askOptional(); }, placementResult: (n: number) => { if (!run.placement) throw new Error('placementResult: 要先打开摸底（考考你）再调这个钩子'); player.cancel(); void finish({ completed: true, stars: 3, results: XQ_PLACEMENT.map((st, i) => ({ stepId: st.id, result: { stars: 3, firstTry: i < n, hintTier: 0 } })) } as never); }, lessonDone: () => { player.cancel(); void finish({ completed: true, stars: 3, results: [] } as never); } } };
  return { resize: (v) => { if (!destroyed) applyLayout(v); }, onBack: () => { ctx.go({ to: 'academy' }); return true; }, destroy: () => { destroyed = true; unRelabel(); fx.destroy(); player.cancel(); ghost.destroy(); ui.destroy(); obs.disconnect(); bubbleObs.disconnect(); unmountSkip(); input.destroy(); view.destroy(); bot.destroy(); clearPointer(); root.remove(); void chOf; } };
}
/** 课里的竖线号：iPad 上留一行数字（手机上的课太挤，不留） */
const lessonCoords = (vp: Vp): boolean => Math.min(vp.w, vp.h) >= 600;
