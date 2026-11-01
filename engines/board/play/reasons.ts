// play/reasons.ts — 原因文案映射钩子：把规则 / 局势给的英文原因串（whyIllegal、Outcome.reason）翻成孩子看得懂的中文。
// 引擎的状态与事件里永远是原串；游戏（或游乐场）在显示处调用 createReasonText(overrides?)：游戏可以覆盖 / 追加自己的词。
// 默认表覆盖象棋（xq-rules 的 WHY 集合）与国象（insufficient / threefold / fifty …）以及通用终局原因。
export const REASON_ZH: Readonly<Record<string, string>> = {
  // 不能走的原因（whyIllegal）
  turn: '还没轮到你', own: '那里是自己的子', shape: '这个子不能这样走', palace: '不能走出九宫', river: '这个子不能过河', eye: '象眼被堵住了', horse: '蹩马腿了', block: '路上有子挡住了',
  screen: '炮要隔一个子才能吃', two: '中间隔了两个子，不行', back: '兵不能后退', side: '兵没过河不能横着走', face: '两个将不能见面', self: '走完自己的将会被吃', escape: '先要应将',
  // 终局原因（Outcome.reason）
  checkmate: '将死', stalemate: '没有路可走（困毙）', 'stalemate-loss': '困毙判负', 'stalemate-draw': '困毙和棋', insufficient: '子力不够，和棋', threefold: '重复三次，和棋', fifty: '五十回合没有进展，和棋',
  repetition: '重复局面，和棋', 'perpetual-check': '长将，判负', 'no-capture-limit': '太久没有吃子，和棋', 'no-attackers': '双方都没有能进攻的子，和棋', resign: '认输', maxply: '步数到了，和棋', timeout: '时间到',
};
export type ReasonText = (reason: string | null | undefined) => string;
export function createReasonText(overrides: Readonly<Record<string, string>> = {}): ReasonText {
  const table = { ...REASON_ZH, ...overrides }; return (reason) => (reason ? table[reason] ?? reason : '');
}
