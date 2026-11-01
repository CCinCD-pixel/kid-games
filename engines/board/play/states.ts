// play/states.ts — 对局阶段的纯状态机（无 DOM，可单测）。屏幕状态 idle / selected / dragging 归 InputController（input.mode）；
// 这里管"棋盘之外的锁"：animating（动画期间）/ aiThinking（机器人思考）/ ended（终局），叠加锁 modal / consent / lesson 归 InputController.lock。
// 规则：输入只在 phase === 'play' 时被接受；其余一律丢弃、不排队；非法转移 = 原地不动。
export type Phase = 'play' | 'animating' | 'aiThinking' | 'ended';
export type PhaseEvent =
  | { readonly t: 'aiStart' }                                                            // 轮到机器人：play → aiThinking
  | { readonly t: 'commit' }                                                            // 一手棋提交（孩子 / 对手 / 机器人）
  | { readonly t: 'animDone'; readonly over: boolean; readonly robotTurn: boolean }     // 落子动画结束（over = 终局；robotTurn = 轮到机器人）
  | { readonly t: 'aiCancel' }                                                          // 机器人请求被取消（悔棋 / 重开 / 翻转）
  | { readonly t: 'end' }                                                               // 认输 / 裁定 / 对方离场
  | { readonly t: 'reset' };                                                            // 重开 / 悔棋后回到可操作

export function nextPhase(p: Phase, e: PhaseEvent): Phase {
  switch (e.t) {
    case 'aiStart': return p === 'play' ? 'aiThinking' : p;
    case 'commit': return p === 'play' || p === 'aiThinking' ? 'animating' : p;
    case 'animDone': return p === 'animating' ? (e.over ? 'ended' : e.robotTurn ? 'aiThinking' : 'play') : p;
    case 'aiCancel': return p === 'aiThinking' ? 'play' : p;
    case 'end': return 'ended';
    case 'reset': return 'play';
  }
}
/** 此阶段是否接受孩子 / 对手的棋盘输入 */
export const acceptsInput = (p: Phase): boolean => p === 'play';
