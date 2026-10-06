/**
 * ?test=1 only: window.__mc for Playwright — read state, jump to screens, start a match from a test
 * position, map stations to client points (so tests tap like a finger), sounds and lines played.
 */
import { clearPin, setPin } from '@kit/settings';
import type { App } from '../app';
import { soundLog } from '../audio/sound';
import { ambienceOn } from '../audio/ambience';
import { BLUE, RED, parseSq, sq } from '../core/board';
import { typeFromCode } from '../core/pieces';
import { isFlip, isMove, legalMoves } from '../core/movegen';
import { createRng } from '@kit/rng';
import { newKnowledge, observe, type Knowledge } from '../core/belief';
import { LAYOUT_STYLES, aiLayout } from '../core/layout';
import { redact } from '../core/redact';
import { apply } from '../core/rules';
import { setupFan, setupStandard } from '../core/state';
import { AiClient } from '../ai/client';
import { endgameById, loadBook } from '../content';
import { parseNote } from '../core/notation';
import { bestNow, redMove, startPuzzle, type PuzzleSpec } from '../ctrl/puzzle-ctrl';
import type { Level } from '../ai/levels';
import { addPiece, encode, newState, type Mode, type RuleSet } from '../core/state';
import type { SavedMatch } from '../ctrl/save';
import { stationLocal } from '../view/layout';
import type { MatchScreen } from '../screens/match';

export interface McHooks {
  [k: string]: unknown;
}

export function installHooks(app: App): void {
  const match = (): MatchScreen | null => (app.screen()?.name === 'match' ? (app.screen() as unknown as MatchScreen) : null);
  const hooks: McHooks = {
    app,
    sounds: soundLog,
    ambience: () => ambienceOn(),
    said: () => app.voice.said,
    screen: () => app.screen()?.name ?? null,
    /** start a match from { 'c6': 'r7', 'b12': 'bF', 'a5': 'b3^' } ('^' = face up in 翻翻棋) */
    position(pieces: Record<string, string>, o: { mode?: Mode; turn?: 0 | 1 | -1; rules?: Partial<RuleSet>; family?: boolean; seating?: 'side' | 'face'; ladder?: boolean; quiet?: number; colorOf?: [number, number] } = {}) {
      const mode = o.mode ?? 'ming';
      const s = newState(mode, { endByCount: !!o.ladder, ...o.rules });
      for (const [k, v] of Object.entries(pieces)) addPiece(s, v[0] === 'r' ? RED : BLUE, typeFromCode(v[1]), parseSq(k), mode !== 'fan' || v[2] === '^');
      s.turn = o.turn ?? RED;
      if (mode === 'fan') s.colorOf = (o.colorOf as [0 | 1, 0 | 1]) ?? [0, 1];
      if (o.quiet) s.quiet = o.quiet;
      const setup: SavedMatch = {
        v: 1, id: 'test', mode, setup: { firstMover: RED, red: '', blue: '' }, actions: [],
        opponent: o.family === false ? { kind: 'ai', level: 1 } : { kind: 'family', seating: o.seating ?? 'side', names: ['小步步', '爸爸'] },
        kidSide: RED, kidSeat: 'near', tags: {}, hints: 0, coachWarnings: 0, coachOverrides: 0, undos: 0, startedAt: 0, ladder: !!o.ladder,
      };
      app.go({ name: 'match', setup, start: s });
    },
    /** client coordinates of a station on the current screen's board (match, puzzle, FT, review) */
    point(at: string) {
      const scr = app.screen() as unknown as { debug?: () => { board?: import('../view/board-view').BoardView } } | null;
      const b = scr?.debug?.().board;
      if (!b) return null;
      const r = b.el.getBoundingClientRect();
      const k = r.width / b.g.rect.w;
      const p = stationLocal(b.g, parseSq(at));
      return { x: r.left + p.x * k, y: r.top + p.y * k };
    },
    state: () => {
      const m = match();
      return m ? encode(m.debug().ctx().state) : null;
    },
    ctx: () => match()?.debug().ctx() ?? null,
    phase: () => match()?.debug().ctx().phase ?? null,
    idle: () => match()?.debug().idle(),
    dispatch: (ev: unknown) => match()?.debug().dispatch(ev as never),
    sq,
    parse: parseSq,
    deploy: () => (app.screen()?.name === 'deploy' ? (app.screen() as unknown as { debug(): unknown }).debug() : null),
    /** the current screen's own debug object (puzzle, cards, deploy-item, ft …) */
    dbg: () => (app.screen() as unknown as { debug?: () => unknown } | null)?.debug?.() ?? null,
    save: () => app.save,
    /**
     * play one move for the human side to move (tests / screenshots): a capture that surely wins if
     * any, else a seeded random action; dispatched as real taps (from, to). Returns the note or null.
     */
    autoMove(seed = 'auto') {
      const m = match();
      if (!m) return null;
      const ctx = m.debug().ctx();
      const st = ctx.state;
      if (st.result || ctx.phase !== 'idle') return null;
      const acts = legalMoves(st).filter((a) => !('pass' in a));
      if (!acts.length) return null;
      const rng = createRng(`${seed}:${st.ply}`);
      const caps = acts.filter((a) => isMove(a) && a.kind === 'attack' && (st.mode !== 'an') && st.ptype[a.pid] > st.ptype[st.board[a.to]] && st.ptype[st.board[a.to]] >= 3);
      const a = caps.length ? caps[0] : acts[Math.floor(rng.next() * acts.length)];
      if (isFlip(a)) m.debug().dispatch({ type: 'tap', at: a.flip });
      else if (isMove(a)) {
        m.debug().dispatch({ type: 'tap', at: a.from });
        m.debug().dispatch({ type: 'tap', at: a.to });
      }
      return isMove(a) ? sq(a.from) + '-' + sq(a.to) : isFlip(a) ? '*' + sq(a.flip) : null;
    },
    /**
     * AI benchmark (spec §8.6 Mac proxy, bench-ai.heavy): n seeded mid-game positions, each sent to a
     * fresh Worker as a real `think` request; wall time per answer (postMessage included) + stats.
     */
    async benchAi(o: { mode: Mode; level: Level | 'hint'; n?: number; seed?: string }) {
      const n = o.n ?? 20;
      const views = [];
      for (let g = 0; views.length < n && g < n * 10; g++) {
        const rng = createRng(`${o.seed ?? 'bench'}:${o.mode}:${g}`);
        let s = o.mode === 'fan'
          ? setupFan(createRng(`bench:fan:${g}`).next, { endByCount: true }, 0)
          : setupStandard(o.mode, { red: aiLayout(LAYOUT_STYLES.plain, createRng(`b:r:${g}`).next), blue: aiLayout(LAYOUT_STYLES.veteran, createRng(`b:b:${g}`).next), rules: { endByCount: true } });
        const know: [Knowledge, Knowledge] | null = o.mode === 'an' ? [newKnowledge(s, RED), newKnowledge(s, BLUE)] : null;
        const stop = 10 + Math.floor(rng.next() * 70);
        for (let ply = 0; ply < stop && !s.result; ply++) {
          const acts = legalMoves(s);
          if (!acts.length) break;
          const a = acts[Math.floor(rng.next() * acts.length)];
          const r = apply(s, a);
          if (know) for (const k of know) observe(k, s, r.event);
          s = r.state;
        }
        if (s.result || s.turn === -1) continue;
        views.push(redact(s, s.turn as 0 | 1, know ? know[s.turn] : null));
      }
      const client = new AiClient({ timeoutMs: 20_000 });
      const out: Array<{ ms: number; nodes: number; aborted: boolean }> = [];
      try {
        if (views.length) await client.think('warm', views[0], 1, 'warm'); // Worker start-up is not a move
        for (let i = 0; i < views.length; i++) {
          const t0 = performance.now();
          const r = o.level === 'hint' ? await client.hint(`b${i}`, views[i], `mc:hint:b:${i}`) : await client.think(`b${i}`, views[i], o.level, `mc:ai:b:${i}`);
          out.push({ ms: performance.now() - t0, nodes: r.stats?.nodes ?? -1, aborted: !!r.stats?.aborted });
        }
      } finally {
        client.destroy();
      }
      return out;
    },
    /** BLUE's book reply in an endgame (spec §8.6: ≤ 2 ms on the Mac): median of 50 lookups, ms */
    async benchReply(id = 'E2-01') {
      const eg = endgameById(id)!;
      const root = (await loadBook(eg.book)).root;
      const spec = { ...eg, id } as unknown as PuzzleSpec;
      const c = startPuzzle(spec, false, root);
      const a = parseNote(c.state, bestNow(c)[0])!;
      const ts: number[] = [];
      for (let i = 0; i < 50; i++) {
        const t0 = performance.now();
        redMove(c, a);
        ts.push(performance.now() - t0);
      }
      ts.sort((x, y) => x - y);
      return ts[25];
    },
    /** parent PIN for the pin test (kit settings storage) */
    setPin: (p: string | null) => (p ? setPin(p) : clearPin()),
  };
  (window as unknown as { __mc: McHooks }).__mc = hooks;
}
