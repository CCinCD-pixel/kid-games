// puzzle/player.ts — 谜题播放器：孩子在棋盘上走，引擎判对错、对手应着、提示阶梯（H1 高亮 / H2 箭头 / H3 幽灵手）。无惩罚：走错 = 走过去 → 说明 → 悔回；不扣星。
// judge 'list'：着法须在 solution[半回合] 里；'outcome'：最后一个孩子着法以 rules.status 判——任何当场取胜着都算（不是预设答案则 alsoWins）。
// 星级归课程 / 游戏（这里只返回 firstTry / hintTier / ms）。
import { createGame } from '../core/game';
import { autoTier } from '../core/hints';
import type { Disposable, GameRules, GhostHand, Puzzle, PuzzlePlayer, Sq } from '../core/types';
import type { InputControllerImpl } from '../input/input-controller';
import type { BoardViewImpl } from '../view/board-view';
import type { ChoiceOption, StepUi } from '../lesson/registry';

export interface PuzzleHooks {
  /** 走对（alsoWins：不是预设答案但也当场取胜） */ onCorrect?(i: { move: string; kidPly: number; alsoWins: boolean; last: boolean }): void;
  /** 走错：说明原因；wrong = 累计错误次数 */ onWrong?(i: { move: string; wrong: number; why: string | null }): void | Promise<void>;
  onHint?(i: { tier: 1 | 2 | 3; from: Sq | null; to: Sq | null }): void;
  onFinish?(i: { firstTry: boolean; hintTier: 0 | 1 | 2 | 3; ms: number }): void;
}
export interface PuzzleContext<M, S> {
  rules: GameRules<M, S>; view: BoardViewImpl<M, S>; input: InputControllerImpl<M, S>; ghost?: GhostHand; hooks?: PuzzleHooks;
  /** 选择题（kidPlies 0）的答题按钮；没有就拒绝 */ ui?: StepUi; labels?(id: string, p: Puzzle): string;
  /** 走错后"看一眼"的停留（毫秒；缺省 700） */ wrongHoldMs?: number; opponentDelayMs?: number; now?: () => number;
}
export interface PuzzlePlayerImpl extends PuzzlePlayer { requestHint(): void; cancel(): void; readonly active: boolean }
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createPuzzlePlayer<M, S>(c: PuzzleContext<M, S>): PuzzlePlayerImpl {
  const { rules, view, input } = c; const now = c.now ?? Date.now; let active = false; let cancelFn: (() => void) | null = null; let hintFn: (() => void) | null = null;
  /** 选择题（kidPlies 0）：meta.options = 选项 id（或 {id,label}），answer = 正确 id；答偏 → 软提示；连续 2 次点亮正解（H1），4 次只留正解（H3） */
  function playChoice(p: Puzzle): Promise<{ firstTry: boolean; hintTier: 0 | 1 | 2 | 3; ms: number }> {
    const ui = c.ui; const raw = (p.meta.options as (string | ChoiceOption)[] | undefined);
    if (!ui || !raw?.length || p.answer === undefined) return Promise.reject(new Error('no-choice-ui'));
    const options: ChoiceOption[] = raw.map((o) => (typeof o === 'string' ? { id: o, label: c.labels?.(o, p) ?? o } : o)); active = true; const t0 = now(); view.finishAnimations(); view.setState(rules.fromFen(p.fen)); view.setLastMove(null);
    const chooser = ui.choose(options); let wrong = 0, shown: 0 | 1 | 2 | 3 = 0; let alive = true; const answer = p.answer;
    return new Promise((resolve, reject) => {
      const end = (): void => { alive = false; chooser.dispose(); active = false; cancelFn = hintFn = null; };
      cancelFn = () => { end(); reject(Object.assign(new Error('cancelled'), { cancelled: true })); };
      hintFn = () => { shown = Math.min(3, shown + 1) as 1 | 2 | 3; chooser.mark(answer, 'hint'); if (shown >= 3) for (const o of options) if (o.id !== answer) chooser.mark(o.id, 'off'); c.hooks?.onHint?.({ tier: shown as 1 | 2 | 3, from: null, to: null }); };
      void (async () => {
        while (alive) {
          const id = await chooser.pick(); if (!alive) return;
          if (id === answer) { chooser.mark(id, 'ok'); c.hooks?.onCorrect?.({ move: id, kidPly: 0, alsoWins: false, last: true }); const r = { firstTry: wrong === 0 && shown === 0, hintTier: shown, ms: now() - t0 }; end(); c.hooks?.onFinish?.(r); resolve(r); return; }
          wrong++; chooser.mark(id, 'soft'); await c.hooks?.onWrong?.({ move: id, wrong, why: null }); const t = autoTier(wrong); if (t > shown) { shown = t as 1 | 2 | 3; chooser.mark(answer, 'hint'); if (t >= 3) for (const o of options) if (o.id !== answer) chooser.mark(o.id, 'off'); c.hooks?.onHint?.({ tier: shown as 1 | 2 | 3, from: null, to: null }); }
        }
      })().catch(() => undefined);
    });
  }
  return {
    get active() { return active; }, requestHint() { hintFn?.(); }, cancel() { cancelFn?.(); },
    play(p: Puzzle, o) {
      if (active) return Promise.reject(new Error('puzzle-busy'));
      if (p.kidPlies === 0) return playChoice(p);
      active = true; const g = createGame(rules, p.fen); const t0 = now(); let wrong = 0, shown: 0 | 1 | 2 | 3 = 0, kidPly = 0, busy = false; const marks: Disposable[] = [];
      view.finishAnimations(); view.setState(g.state()); view.setLastMove(null);
      const accepted = (ix: number): readonly string[] => p.solution[ix] ?? [];
      const clearHint = (): void => { for (const m of marks) m.dispose(); marks.length = 0; };
      const showHint = (tier: 1 | 2 | 3): void => {
        if (tier <= shown && tier !== 3) return; shown = Math.max(shown, tier) as 1 | 2 | 3; clearHint(); const enc = accepted(kidPly * 2)[0]; const m = enc ? rules.decode(g.state(), enc) : null; const info = m ? rules.moveInfo(g.state(), m) : null;
        c.hooks?.onHint?.({ tier, from: info?.from ?? null, to: info?.to ?? null }); if (!info) return;
        if (tier >= 1) marks.push(view.mark('hint', [info.from], { pulse: true })); if (tier >= 2) marks.push(view.arrow(info.from, info.to, 'hint')); if (tier >= 3 && c.ghost) void c.ghost.drag(info.from, info.to);
      };
      return new Promise((resolve, reject) => {
        let restore: () => void = () => undefined;
        const finish = (): void => { restore(); clearHint(); active = false; cancelFn = hintFn = null; const r = { firstTry: wrong === 0 && shown === 0, hintTier: shown, ms: now() - t0 }; c.hooks?.onFinish?.(r); resolve(r); };
        cancelFn = () => { restore(); clearHint(); active = false; cancelFn = hintFn = null; reject(Object.assign(new Error('cancelled'), { cancelled: true })); };
        hintFn = () => showHint(Math.min(3, shown + 1) as 1 | 2 | 3);
        const onKid = async (m: M): Promise<void> => {
          busy = true; try {
            const before = g.state(); const enc = rules.encode(m); const last = kidPly >= p.kidPlies - 1; let ok = accepted(kidPly * 2).includes(enc); let alsoWins = false;
            if (!ok && p.judge === 'outcome' && last) { const st = rules.status(rules.apply(before, m)); const mover = g.turn(); if (st.over && st.winner === mover) { ok = true; alsoWins = true; } }
            if (ok) {
              clearHint(); g.play(m); await view.animateMove(m, before); c.hooks?.onCorrect?.({ move: enc, kidPly, alsoWins, last }); kidPly++;
              if (kidPly >= p.kidPlies) { finish(); return; }
              const reply = accepted((kidPly - 1) * 2 + 1)[0]; const rm = reply ? rules.decode(g.state(), reply) : null; if (!rm) { finish(); return; }
              await sleep(c.opponentDelayMs ?? 350); const b2 = g.state(); g.play(rm); await view.animateMove(rm, b2); return;
            }
            wrong++; const why = rules.whyIllegal(before, rules.moveInfo(before, m).from, rules.moveInfo(before, m).to); void why;
            g.play(m); await view.animateMove(m, before); await c.hooks?.onWrong?.({ move: enc, wrong, why: null }); await sleep(c.wrongHoldMs ?? 700);
            const after = g.state(); g.undo(); await view.animateUndo(m, after, before); view.setState(g.state());
            if (o.hints) { const t = autoTier(wrong); if (t > 0) showHint(t as 1 | 2 | 3); }
          } finally { busy = false; }
        };
        restore = input.overrideHooks({ state: () => g.state(), seatToMove: () => g.turn(), canAct: () => !busy && active && !g.status().over, commit: onKid, onIllegal: () => undefined, onSelect: undefined });
      });
    },
  };
}
