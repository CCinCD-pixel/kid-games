// ai/protocol.ts — 宿主 ↔ Worker 的消息格式（纯类型 + 常量；Worker 与主线程共用，不含 DOM）。
import type { AiPlugin, AiRequest, Sq } from '../core/types';

/** Worker → 宿主：请求回复（id/epoch 原样带回；宿主丢弃过期 epoch 与未知 id 的回复） */
export type AiReply = { readonly id: number; readonly epoch: number; readonly ok: true; readonly result: unknown } | { readonly id: number; readonly epoch: number; readonly ok: false; readonly error: string };
/** 宿主 → Worker：热身（一次微型搜索让 JSC 先编译；没有 id，无回复） */
export interface AiWarmup { readonly type: 'warmup' }
export const WARMUP: AiWarmup = { type: 'warmup' };
export const isWarmup = (m: unknown): m is AiWarmup => !!m && typeof m === 'object' && (m as { type?: unknown }).type === 'warmup';
export const isReply = (m: unknown): m is AiReply => !!m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'number' && typeof (m as { ok?: unknown }).ok === 'boolean';

/** move 请求的结果 */
export interface AiMoveResult { readonly move: string | null; readonly resign: boolean; readonly ply: number }
/** hint 请求的结果（tier 只决定界面怎么呈现：1 = 高亮要动的子，2 = 箭头，3 = 幽灵手演示） */
export interface AiHintResult { readonly move: string | null; readonly from: Sq; readonly to: Sq; readonly score: number; readonly tier: 1 | 2 | 3 }
/** 游戏插件的可选扩展（AiPlugin 本身已冻结） */
export interface AiPluginExt<M, S> extends AiPlugin<M, S> {
  /** 困毙判负（象棋）= 一步杀检测把困毙也算；国象 = false（缺省） */
  readonly stalemateLoss?: boolean;
  /** hint 搜索强度（缺省 depth 3 / nodes 15000） */
  readonly hint?: { readonly depth: number; readonly nodes: number };
}
export type { AiRequest };
