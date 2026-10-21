// lesson/steps.ts — 课步骤的公开入口：注册表（registerStep）+ 引擎自带的 15 种步型（import 本文件即全部注册）。
// 步型：tap quiz setup（steps-ask）· stars capture sweep escape make trade（steps-move）· demo card bank bank2 battle play（steps-flow）。
// 国象专用种类（castleQuiz endgame pawnwar goto count choice save …）由棋手学院在 lesson/steps-chess/ 用 registerStep 注册，不改本文件。
// 走错处理（对所有步型一致）：说原因 → 走过去看一眼 → 悔回 → 连续 2 / 3 / 4 次触发 H1 / H2 / H3（ctx.hints）；不出现"错"字、不扣星。
export { registerStep, getRunner, stepKinds, createScope, isCancelled, CANCELLED, nameMap, posOf, stepPromise } from './registry';
export type { LessonStep, StepContextImpl, StepUi, Chooser, ChoiceOption, LessonData, SetupSpec, StepScope, StepScopeImpl } from './registry';
export { starsFor, applyHint, showHint, hintSayId } from './common';
export { CHOICES, guessable } from './steps-ask';
import './steps-ask';
import './steps-move';
import './steps-flow';
