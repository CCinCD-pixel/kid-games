import { createGame, replayMoves, type GameImpl } from '@engines/board/core/game';
import { createRules } from '@engines/board/games/chess/rules';
import { chessReasonText } from '@engines/board/games/chess/reasons';
import { parseSq, sqName, type ChessMove, type ChessState, type Promo } from '@engines/board/games/chess/position';
import robotsJson from '../../../content/chess/robots.v1.json';
import { ENDGAMES, MATE_PUZZLES, PIECE_LESSONS, PUZZLES } from './lessons';
import { pieceName, pieceSvg } from './piece-art';
import { freshGame, type ChessSave, type Mode } from './save';
import { CoachVoice } from '@kit/coach-voice';
import { icon } from '@kit/ui';

const rules = createRules();
const sq = (s: string): number => { const rc = parseSq(s); return rc.r * 8 + rc.c; };
const nameOf = (n: number): string => sqName(Math.floor(n / 8), n % 8);
const pieceValue = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0, X: 0 };
const PROMO_NAMES: Record<Promo, string> = { Q: '后', R: '车', B: '象', N: '马' };

export class ChessApp {
  private view: 'home' | 'lesson' | 'game' = 'home';
  private game: GameImpl<ChessMove, ChessState> | null = null;
  private lessonIdx = 0;
  private taskIdx = 0;
  private lessonState: ChessState | null = null;
  private lessonSuccess = false;
  private selected: number | null = null;
  private promotion: ChessMove[] | null = null;
  private bottom: 'w' | 'b' = 'w';
  private busy = false;
  private resetOpen = false;
  private pendingStart: { mode: Mode; level: number; puzzleIndex: number } | null = null;
  private note = '';
  private hintSq: number | null = null;
  private missSq: number | null = null;
  private epoch = 0;
  private worker: Worker | null = null;
  private requestId = 0;
  readonly coach = new CoachVoice('/audio/chess/audio-manifest.json', { name: '棋艺教练', accessory: 'coach' });
  private coachText = '我是棋艺教练，点我可以再听一遍。';

  constructor(private root: HTMLElement, private save: ChessSave, private persist: () => void) {
    root.addEventListener('click', (event) => this.click(event));
    window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && this.view !== 'home') this.back(); });
  }

  back(): boolean {
    if (this.view === 'home') return false;
    this.epoch++; this.busy = false; this.view = 'home'; this.selected = null; this.missSq = null; this.promotion = null; this.resetOpen = false; this.render();
    this.tell('欢迎回来，挑一项棋艺继续练习吧。', 'cx.home');
    return true;
  }

  render(): void {
    if (this.view === 'home') this.renderHome();
    else if (this.view === 'lesson') this.renderLesson();
    else this.renderGame();
    this.coach.attach(this.root.querySelector('.cx-bot-host'), this.root.querySelector('.cx-guide-text'));
  }

  intro(): void { this.tell('先认识棋子，再挑战一步将死。', 'cx.home'); }

  private tell(text: string, line: string, mood: 'happy' | 'encouraging' | 'thinking' | 'celebrating' = 'happy'): void {
    this.coachText = text;
    this.coach.say(text, line, mood);
  }

  private guide(): string {
    return `<div class="cx-guide"><div class="cx-bot-host"></div><div class="cx-guide-copy"><b>棋艺教练</b><p class="cx-guide-text" role="status">${this.coachText}</p></div><button class="cx-replay" type="button" data-act="replay" aria-label="再听一遍" title="再听一遍">${icon('replay')}</button></div>`;
  }

  private renderHome(): void {
    const active = this.save.game;
    this.root.innerHTML = `<main class="cx-page cx-home"><header class="cx-brand"><img src="/icons/games/chess.svg" alt=""/><div><h1>棋手学院</h1><p>天宫空间站 · 棋艺舱</p></div></header>
      <div class="cx-home-guide">${this.guide()}</div>
      ${active ? `<button class="cx-continue" type="button" data-act="resume">接着下 · ${active.mode === 'f2f' ? '面对面对弈' : active.mode === 'puzzle' ? '残局练习' : '对机器人'} <span>→</span></button>` : ''}
      <nav class="cx-mode-nav" aria-label="棋艺舱"><a href="#cx-learn">学棋子</a><a href="#cx-mates">一步将死</a><a href="#cx-robots">对机器人</a><a href="#cx-endgames">残局</a><button type="button" data-act="f2f">和爸爸下</button></nav>
      <section id="cx-learn" class="cx-section"><div class="cx-section-title"><h2>棋子学堂</h2><span>${this.save.lessons.length} / 6</span></div><div class="cx-lesson-grid">${PIECE_LESSONS.map((l, i) => `<button class="cx-lesson" type="button" data-lesson="${i}"><span class="cx-piece-icon">${pieceSvg({ color: 'w', type: l.piece })}</span><span><b>${l.name}</b><small>${l.title}</small></span><i>${this.save.lessons.includes(l.id) ? '✓' : '→'}</i></button>`).join('')}</div></section>
      <section id="cx-mates" class="cx-section"><div class="cx-section-title"><h2>一步将死</h2><span>${MATE_PUZZLES.filter((p) => this.save.puzzles.includes(p.id)).length} / ${MATE_PUZZLES.length}</span></div><div class="cx-endgame-grid">${MATE_PUZZLES.map((p, i) => `<button type="button" data-puzzle="${i}"><b>第 ${i + 1} 题</b><span>${p.title}</span><small>${this.save.puzzles.includes(p.id) ? '已完成 ✓' : '找到将死的一步'}</small></button>`).join('')}</div></section>
      <section id="cx-robots" class="cx-section"><div class="cx-section-title"><h2>机器人棋手</h2><span>整盘对弈</span></div><div class="cx-robot-grid">${[0, 1, 2].map((i) => `<button class="cx-robot" type="button" data-ai="${i}"><span class="cx-robot-face"><i></i><i></i></span><b>${robotsJson.levels[i].look.ui.name}</b><small>${i === 0 ? '入门' : i === 1 ? '练习' : '挑战'}</small></button>`).join('')}</div></section>
      <section id="cx-endgames" class="cx-section"><div class="cx-section-title"><h2>残局练习</h2><span>${ENDGAMES.filter((p) => this.save.puzzles.includes(p.id)).length} / ${ENDGAMES.length}</span></div><div class="cx-endgame-grid">${ENDGAMES.map((p, i) => `<button type="button" data-puzzle="${MATE_PUZZLES.length + i}"><b>第 ${i + 1} 局</b><span>${p.title}</span><small>${this.save.puzzles.includes(p.id) ? '已完成 ✓' : '试着将死黑王'}</small></button>`).join('')}</div></section>
      ${this.pendingStart ? '<div class="cx-overlay"><div class="cx-dialog"><h2>还有一盘没下完</h2><p>开始新对局会替换这盘棋。</p><div class="cx-dialog-actions"><button type="button" data-act="cancel-new">接着下</button><button type="button" data-act="confirm-new">开始新对局</button></div></div></div>' : ''}
    </main>`;
  }

  private startLesson(index: number): void {
    const lesson = PIECE_LESSONS[index]; if (!lesson) return;
    this.view = 'lesson'; this.lessonIdx = index; this.taskIdx = 0; this.loadTask();
  }

  private loadTask(): void {
    const task = PIECE_LESSONS[this.lessonIdx].tasks[this.taskIdx];
    this.lessonState = rules.fromFen(task.fen);
    this.lessonSuccess = false; this.selected = null; this.note = ''; this.hintSq = null; this.missSq = null; this.render();
    this.tell(`这是${PIECE_LESSONS[this.lessonIdx].name}的第${this.taskIdx + 1}题。点棋子，再走到星星。`, 'cx.lesson');
  }

  private renderLesson(): void {
    const lesson = PIECE_LESSONS[this.lessonIdx];
    const task = lesson.tasks[this.taskIdx];
    const title = `${lesson.name} · ${this.taskIdx + 1} / ${lesson.tasks.length}`;
    this.root.innerHTML = `<main class="cx-page cx-play"><header class="cx-top"><button class="cx-icon" type="button" data-act="back" aria-label="返回棋艺舱">←</button><div><strong>棋子学堂</strong><span>${title}</span></div></header>
      <div class="cx-play-layout"><div class="cx-board-wrap">${this.board(this.lessonState!, sq(task.to))}</div><aside class="cx-side">${this.guide()}<div class="cx-coach"><div class="cx-coach-head">${pieceSvg({ color: 'w', type: lesson.piece })}<strong>${lesson.title}</strong></div><p>${lesson.teaches}</p><p>把${lesson.name}走到星星上。可以分几步走。</p></div><div class="cx-note" role="status">${this.lessonSuccess ? '找到了这一步！' : this.note || '点棋子，再点落点。'}</div><div class="cx-actions">${this.lessonSuccess ? `<button class="cx-primary" type="button" data-act="next-task">${this.taskIdx + 1 === lesson.tasks.length ? '完成训练' : '下一题 →'}</button>` : '<button type="button" data-act="lesson-hint">看看能走哪里</button>'}</div></aside></div>
    </main>`;
  }

  private resume(): void {
    const rec = this.save.game; if (!rec) return;
    this.game = replayMoves(rules, rec.startFen, rec.moves).game;
    this.view = 'game'; this.selected = null; this.missSq = null; this.bottom = 'w'; this.render();
    this.tell('接着下吧，点自己的棋子，看看能走到哪里。', rec.mode === 'puzzle' ? 'cx.mate' : 'cx.game');
    if (rec.mode !== 'f2f' && this.game.turn() === 1 && !this.game.status().over) void this.aiTurn();
  }

  private startGame(mode: Mode, level = 0, puzzleIndex = 0): void {
    this.epoch++;
    this.resetOpen = false;
    const puzzle = mode === 'puzzle' ? PUZZLES[Math.max(0, puzzleIndex)] : null;
    this.save.game = freshGame(mode, level, puzzle?.fen, puzzle?.id);
    this.game = createGame(rules, this.save.game.startFen);
    this.view = 'game'; this.selected = null; this.note = ''; this.hintSq = null; this.missSq = null; this.bottom = 'w'; this.persist(); this.render();
    const line = mode === 'f2f' ? 'cx.f2f' : mode === 'ai' ? 'cx.game' : puzzleIndex < MATE_PUZZLES.length ? 'cx.mate' : 'cx.endgame';
    this.tell(mode === 'puzzle' && puzzleIndex < MATE_PUZZLES.length ? '只需一步将死。先点白棋，再找决定胜负的格子。' : mode === 'f2f' ? '白方先走，黑方接着走。' : '点自己的棋子，亮起的格子都能走。', line);
  }

  private renderGame(): void {
    const game = this.game, rec = this.save.game;
    if (!game || !rec) { this.view = 'home'; this.renderHome(); return; }
    const status = game.status();
    const winner = status.over ? status.winner === null ? '和棋' : `${status.winner === 0 ? '白方' : '黑方'}获胜` : '';
    const turn = game.turn() === 0 ? '白方' : '黑方';
    const robot = rec.mode === 'ai' ? robotsJson.levels[rec.level].look.ui.name : '残局守将';
    const mate = rec.mode === 'puzzle' && MATE_PUZZLES.some((p) => p.id === rec.puzzleId);
    const title = rec.mode === 'f2f' ? '和爸爸下' : rec.mode === 'puzzle' ? `${mate ? '一步将死' : '残局'} · ${PUZZLES.find((p) => p.id === rec.puzzleId)?.title ?? ''}` : `对弈 · ${robot}`;
    this.root.innerHTML = `<main class="cx-page cx-play"><header class="cx-top"><button class="cx-icon" type="button" data-act="back" aria-label="返回棋艺舱">←</button><div><strong>${title}</strong><span>${status.over ? winner : this.busy ? `${robot}思考中` : `${turn}走棋`}</span></div><button class="cx-icon" type="button" data-act="flip" aria-label="翻转棋盘" title="翻转棋盘">⟳</button></header>
      <div class="cx-play-layout"><div class="cx-board-wrap">${this.board(game.state())}</div><aside class="cx-side">${this.guide()}<div class="cx-coach"><div class="cx-coach-head"><strong>${rec.mode === 'f2f' ? '面对面' : mate ? '一步将死' : robot}</strong></div><p>${mate ? '让黑王无处可逃。' : rec.mode === 'puzzle' ? '试着将死黑王。' : rec.mode === 'f2f' ? '轮流走棋，把王保护好。' : '先照顾王，再想怎么进攻。'}</p><div class="cx-count">第 ${Math.floor(game.ply() / 2) + 1} 回合 · ${game.ply()} 步</div></div><div class="cx-note" role="status">${status.over ? chessReasonText(status.reason) : this.note || (this.busy ? '棋手正在想下一步' : '点棋子，再点落点。')}</div><div class="cx-actions"><button type="button" data-act="hint" ${this.busy || status.over ? 'disabled' : ''}>提示</button><button type="button" data-act="undo" ${game.ply() === 0 ? 'disabled' : ''}>悔棋</button><button type="button" data-act="restart">重来</button></div>${status.over ? `<button class="cx-primary" type="button" data-act="finish">返回棋艺舱</button>` : ''}</aside></div>
      ${this.promotion ? `<div class="cx-overlay"><div class="cx-dialog"><h2>兵升变成什么？</h2><div class="cx-promo">${this.promotion.map((m) => `<button type="button" data-promo="${m.promotion}">${pieceSvg({ color: game.state().turn, type: m.promotion! })}<span>${PROMO_NAMES[m.promotion!]}</span></button>`).join('')}</div></div></div>` : ''}
      ${this.resetOpen ? '<div class="cx-overlay"><div class="cx-dialog"><h2>重新开始这一盘？</h2><div class="cx-dialog-actions"><button type="button" data-act="cancel-reset">继续下</button><button type="button" data-act="confirm-reset">重新开始</button></div></div></div>' : ''}
    </main>`;
  }

  private board(state: ChessState, goal?: number): string {
    const legal = this.selected === null ? [] : rules.legalFrom(state, this.selected).map((m) => m.to.r * 8 + m.to.c);
    const checked = rules.check(state)?.king;
    const last = this.view === 'game' ? this.game?.moves.at(-1) : undefined;
    const cells = Array.from({ length: 64 }, (_, displaySq) => {
      const actual = this.bottom === 'w' ? displaySq : 63 - displaySq;
      const row = Math.floor(actual / 8), col = actual % 8, p = state.board[row][col];
      const classes = ['cx-square', (row + col) % 2 ? 'dark' : 'light', actual === goal ? 'goal' : '', actual === this.selected ? 'selected' : '', legal.includes(actual) ? 'legal' : '', actual === this.hintSq ? 'hint' : '', actual === this.missSq ? 'miss' : '', actual === checked ? 'check' : '', last && (actual === last.from.r * 8 + last.from.c || actual === last.to.r * 8 + last.to.c) ? 'last' : ''].filter(Boolean).join(' ');
      return `<button class="${classes}" type="button" data-sq="${actual}" aria-label="${nameOf(actual)} ${p ? pieceName(p) : '空格'}">${p ? pieceSvg(p) : ''}</button>`;
    }).join('');
    return `<div class="cx-board" role="grid" aria-label="国际象棋棋盘">${cells}</div><div class="cx-files" aria-hidden="true">${(this.bottom === 'w' ? 'abcdefgh' : 'hgfedcba').split('').map((c) => `<span>${c}</span>`).join('')}</div>`;
  }

  private squareClick(n: number): void {
    if (this.busy || this.lessonSuccess || this.promotion || this.resetOpen) return;
    const state = this.view === 'lesson' ? this.lessonState : this.game?.state();
    if (!state || (this.view === 'game' && this.game?.status().over)) return;
    const p = state.board[Math.floor(n / 8)][n % 8];
    const myTurn = this.view === 'lesson' ? 'w' : state.turn;
    if (this.selected === n) {
      if (this.view === 'lesson' || this.hintSq !== null) {
        this.note = '起点已经选中，直接点橙色终点。'; this.render();
        this.tell('起点已经选中，直接点橙色终点。', 'cx.hint', 'encouraging'); return;
      }
      this.selected = null; this.hintSq = null; this.missSq = null; this.note = '已取消选中，点一颗自己的棋子。'; this.render();
      this.tell('换一颗棋子也可以，点白棋继续。', 'cx.game', 'encouraging'); return;
    }
    if (this.selected !== null) {
      const options = rules.legalFrom(state, this.selected).filter((m) => m.to.r * 8 + m.to.c === n);
      if (options.length) {
        if (options.length > 1 && this.view === 'game') { this.promotion = options; this.render(); return; }
        this.play(options[0]); return;
      }
      this.note = chessReasonText(rules.whyIllegal(state, this.selected, n));
      this.missSq = n;
    }
    if (p && p.color === myTurn && p.type !== 'X') {
      if (this.view !== 'lesson' || n === sq(PIECE_LESSONS[this.lessonIdx].tasks[this.taskIdx].from) || this.lessonState?.board[Math.floor(n / 8)][n % 8] === p) {
        this.selected = n;
        this.missSq = null;
      }
    }
    this.render();
    if (p && p.color === myTurn && this.selected === n) {
      this.note = `选中了${pieceName(p)}，亮起的格子都能走。`;
      this.root.querySelector('.cx-note')!.textContent = this.note;
      this.tell(this.note, 'cx.select', 'encouraging');
    } else if (this.selected !== null) this.tell('这格走不到，看看亮起的格子。', 'cx.illegal', 'thinking');
    else this.tell('先点自己的棋子，亮起的格子就是可以走的位置。', this.view === 'lesson' ? 'cx.lesson' : 'cx.mate', 'encouraging');
  }

  private play(move: ChessMove): void {
    this.selected = null; this.hintSq = null; this.missSq = null; this.note = '';
    if (this.view === 'lesson') {
      const task = PIECE_LESSONS[this.lessonIdx].tasks[this.taskIdx];
      this.lessonState = { ...rules.apply(this.lessonState!, move), turn: 'w' };
      if (move.to.r * 8 + move.to.c === sq(task.to)) {
        this.lessonSuccess = true;
        if (this.taskIdx + 1 === PIECE_LESSONS[this.lessonIdx].tasks.length) {
          const id = PIECE_LESSONS[this.lessonIdx].id;
          if (!this.save.lessons.includes(id)) { this.save.lessons.push(id); this.persist(); }
        }
      } else {
        this.note = '走得好，再想想下一步。';
      }
      this.render();
      this.tell(this.lessonSuccess ? '找到了星星！' : '走得好，再向星星走一步。', this.lessonSuccess ? 'cx.lesson.win' : 'cx.lesson.step', 'celebrating');
      return;
    }
    if (!this.game || !this.save.game) return;
    if (this.save.game.mode === 'puzzle' && MATE_PUZZLES.some((p) => p.id === this.save.game?.puzzleId)) {
      const outcome = rules.status(rules.apply(this.game.state(), move));
      if (!outcome.over || outcome.winner !== 0) {
        this.selected = move.from.r * 8 + move.from.c;
        this.missSq = move.to.r * 8 + move.to.c;
        this.note = '这一步还没将死，再想想。'; this.render();
        this.tell('这一步还没将死。换一个亮起的格子试试。', 'cx.miss', 'encouraging');
        return;
      }
    }
    this.game.play(move);
    this.save.game.moves = this.game.encoded(); this.persist();
    this.finishIfOver(); this.render();
    if (this.game.status().over) this.tell('将死了！你找到了决定胜负的一步。', 'cx.win', 'celebrating');
    else if (this.save.game?.mode === 'f2f') this.tell('走得好，现在轮到另一方。', 'cx.turn', 'happy');
    else if (this.game.turn() === 0) this.tell('机器人走完了，现在轮到你。', 'cx.robot', 'encouraging');
    if (this.save.game && this.save.game.mode !== 'f2f' && this.game.turn() === 1) void this.aiTurn();
  }

  private finishIfOver(): void {
    const status = this.game?.status();
    if (!status?.over || !this.save.game || this.save.game.completed) return;
    this.save.game.completed = true;
    this.save.played++;
    if (status.winner === 0 && this.save.game.mode !== 'f2f') this.save.wins++;
    if (status.winner === 0 && this.save.game.mode === 'puzzle' && this.save.game.puzzleId && !this.save.puzzles.includes(this.save.game.puzzleId)) this.save.puzzles.push(this.save.game.puzzleId);
    this.persist();
  }

  private async aiTurn(): Promise<void> {
    const game = this.game, rec = this.save.game;
    if (!game || !rec || game.status().over || game.turn() !== 1 || this.busy) return;
    this.busy = true; this.render();
    this.tell('轮到机器人想棋了。', 'cx.turn', 'thinking');
    const epoch = ++this.epoch, id = ++this.requestId, fen = game.fen();
    const fallback = () => rules.legalMoves(game.state())[0];
    let encoded: string | null = null;
    try {
      this.worker ??= new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      const worker = this.worker;
      encoded = await new Promise<string | null>((resolve) => {
        const done = (value: string | null) => { clearTimeout(timer); worker.removeEventListener('message', onMessage); worker.removeEventListener('error', onError); resolve(value); };
        const onMessage = (e: MessageEvent<{ id: number; move?: string | null; error?: string }>) => { if (e.data.id === id) done(e.data.move ?? null); };
        const onError = () => done(null);
        const timer = setTimeout(() => { worker.terminate(); if (this.worker === worker) this.worker = null; done(null); }, 2400);
        worker.addEventListener('message', onMessage); worker.addEventListener('error', onError, { once: true });
        worker.postMessage({ id, fen, level: rec.mode === 'puzzle' ? 0 : rec.level, seed: game.ply() * 37 + this.save.played * 17 });
      });
    } catch { /* worker unavailable: use legal fallback */ }
    if (epoch !== this.epoch || this.view !== 'game' || this.game !== game) return;
    const move = encoded ? rules.decode(game.state(), encoded) : null;
    this.busy = false;
    if (move ?? fallback()) this.play(move ?? fallback());
    else this.render();
  }

  private undo(): void {
    if (!this.game || !this.save.game || this.game.ply() === 0) return;
    this.epoch++; this.busy = false; this.game.undo();
    if (this.save.game.mode !== 'f2f' && this.game.ply() > 0 && this.game.turn() === 1) this.game.undo();
    this.save.game.moves = this.game.encoded(); this.selected = null; this.missSq = null; this.note = ''; this.persist(); this.render();
  }

  private hint(): void {
    if (!this.game || this.busy) return;
    const moves = this.game.legalMoves();
    const mate = this.save.game?.mode === 'puzzle' && MATE_PUZZLES.some((p) => p.id === this.save.game?.puzzleId);
    const choice = mate ? moves.find((move) => { const outcome = rules.status(rules.apply(this.game!.state(), move)); return outcome.over && outcome.winner === 0; })
      : moves.sort((a, b) => pieceValue[b.captured?.type ?? 'X'] - pieceValue[a.captured?.type ?? 'X'])[0];
    if (!choice) return;
    this.selected = choice.from.r * 8 + choice.from.c; this.hintSq = choice.to.r * 8 + choice.to.c; this.missSq = null;
    this.note = `起点和终点亮起来了，试着走到橙色格子。`; this.render();
    this.tell('我点亮了起点和终点，跟着亮光走一次吧。', 'cx.hint', 'encouraging');
  }

  private lessonHint(): void {
    const board = this.lessonState?.board;
    if (!board) return;
    const row = board.findIndex((cells) => cells.some((piece) => piece?.color === 'w'));
    const col = row < 0 ? -1 : board[row].findIndex((piece) => piece?.color === 'w');
    if (col < 0) return;
    this.selected = row * 8 + col;
    this.note = '棋子周围亮起的格子都能走。';
    this.render();
    this.tell(this.note, 'cx.hint', 'encouraging');
  }

  private requestGame(mode: Mode, level = 0, puzzleIndex = 0): void {
    const rec = this.save.game;
    if (rec && !replayMoves(rules, rec.startFen, rec.moves).game.status().over) {
      this.pendingStart = { mode, level, puzzleIndex };
      this.render();
      return;
    }
    this.startGame(mode, level, puzzleIndex);
  }

  private click(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button)) return;
    if (button.dataset.sq !== undefined) { this.squareClick(Number(button.dataset.sq)); return; }
    if (button.dataset.lesson !== undefined) { this.startLesson(Number(button.dataset.lesson)); return; }
    if (button.dataset.ai !== undefined) { this.requestGame('ai', Number(button.dataset.ai)); return; }
    if (button.dataset.puzzle !== undefined) { this.requestGame('puzzle', 0, Number(button.dataset.puzzle)); return; }
    if (button.dataset.promo && this.promotion) { const move = this.promotion.find((m) => m.promotion === button.dataset.promo); this.promotion = null; if (move) this.play(move); return; }
    switch (button.dataset.act) {
      case 'back': this.back(); break;
      case 'replay': this.coach.replay(); break;
      case 'resume': this.resume(); break;
      case 'f2f': this.requestGame('f2f'); break;
      case 'cancel-new': this.pendingStart = null; this.render(); break;
      case 'confirm-new': if (this.pendingStart) { const next = this.pendingStart; this.pendingStart = null; this.startGame(next.mode, next.level, next.puzzleIndex); } break;
      case 'next-task': if (this.taskIdx + 1 < PIECE_LESSONS[this.lessonIdx].tasks.length) { this.taskIdx++; this.loadTask(); } else this.back(); break;
      case 'lesson-hint': this.lessonHint(); break;
      case 'flip': this.bottom = this.bottom === 'w' ? 'b' : 'w'; this.render(); break;
      case 'undo': this.undo(); break;
      case 'hint': this.hint(); break;
      case 'restart': this.resetOpen = true; this.render(); break;
      case 'cancel-reset': this.resetOpen = false; this.render(); break;
      case 'confirm-reset': if (this.save.game) this.startGame(this.save.game.mode, this.save.game.level, PUZZLES.findIndex((p) => p.id === this.save.game?.puzzleId)); break;
      case 'finish': this.save.game = null; this.persist(); this.back(); break;
    }
  }
}
