// One round, start to finish (spec §3): ready -> show -> fog -> recall -> judge -> (pass | neutral | miss) -> reveal -> result.
// The controller owns the rules (slip budget = 小星灯, looks, hints, voice, results); the adapter owns the board. Nothing here reads a clock for difficulty.
import { mountMini, type MiniBot } from '../art/mini';
import { ghostDrag, ghostTap, mountSkipButton, shouldAutoSkip, starSvg } from '@kit/ui';
import { sleep } from '@kit/tween';
import { computeLayout, type RoundLayout } from '../core/layout';
import type { Finish, Outcome, Plan } from '../core/session';
import { SECTOR_ZH } from '../core/metrics';
import { CARDS } from '../core/cards';
import cardsJson from '../../../../content/memory-matrix/cards.json';
import { cardImage } from '../art/cards';
import { makeAdapter, type Adapter } from './adapters';
import { type App, btn, el, place, wait } from './app';

export interface RoundExit { fin: Finish | null; choice: 'next' | 'station' | 'sectors' | 'skipped' }
type Done = 'pass' | 'miss' | 'answer' | 'station';
type Phase = 'ready' | 'show' | 'fog' | 'recall' | 'judge' | 'reveal' | 'result';

const PROMPT: Record<string, string[]> = { s1: ['mm.s1.prompt'], s2: ['mm.s2.prompt'], s3: ['mm.s3.prompt'], s4: [] };
const TUT: Record<string, { pre: string[]; during: string[]; post: string[]; end: string[] }> = {
  s1: { pre: ['mm.s1.t1'], during: ['mm.s1.t2'], post: ['mm.s1.t3'], end: ['mm.s1.t4'] },
  s2: { pre: ['mm.s2.t1'], during: ['mm.s2.t2'], post: ['mm.s2.t3'], end: [] },
  s3: { pre: ['mm.s3.t1'], during: ['mm.s3.t2'], post: ['mm.s3.t3', 'mm.s3.t4'], end: [] },
  s4: { pre: ['mm.s4.t1', 'mm.s4.t2'], during: [], post: ['mm.s4.t3'], end: ['mm.s4.t4'] },
};
/** one strategy sentence per sector (cool-down 3 nights in voice-policy.json): clumps / say the place / colour + shape together */
const TIP: Record<string, ((stim: { k?: number; n?: number }) => string) | undefined> = { s1: (st) => ((st.k ?? 1) < (st.n ?? 1) ? 'mm.s1.cluster' : 'mm.s1.words'), s3: () => 'mm.s3.tip' };
const cardTitle = (id: string): string => CARDS.find((c: { id: string }) => c.id === id)?.title ?? '';

export async function playRound(app: App, plan0: Plan): Promise<RoundExit> {
  let plan = plan0;
  const eng = app.engine, sec = plan.sector;
  const isTut = plan.kind === 'tutorial', isGate = plan.kind === 'gate', isPrimer = plan.kind === 'primer', isDemo = plan.kind === 'demo';
  const canFail = !(isTut || isPrimer || isDemo);
  const out: Outcome = { slips: 0, rwPre: plan.rwCarry, rwMid: 0, hint: plan.kind === 'scaffold' ? 1 : 0, showAnswer: false };
  let phase = 'ready' as Phase, leftAt: Phase | null = null, taps = 0, looking = false, adapter!: Adapter, bot: MiniBot | null = null, disposeSkip = (): void => {}, tRecall = 0, idleA = 0, idleB = 0, gone = false;
  let settle!: (d: Done) => void; const finished = new Promise<Done>((r) => { settle = r; });
  const setPhase = (p: Phase): void => { phase = p; eng.phase = p; root.dataset.phase = p; };

  /* ---------------------------------------------------------------- DOM */
  const root = el('div', 'mm-round'); root.dataset.sector = sec; root.dataset.kind = plan.kind;
  const top = el('div', 'mm-top'), chip = el('div', 'mm-chip'), lamps = el('div', 'mm-lamps'), dots = el('div', 'mm-dots');
  top.append(chip, lamps, dots);
  const strip = el('div', 'mm-strip'), botHost = el('div', 'mm-bot'), subHost = el('div', 'mm-subhost'); strip.append(botHost, subHost);
  const plaque = el('div', 'mm-plaque'), stage = el('div', 'mm-stage'), actions = el('div', 'mm-actions'), sheet = el('div', 'mm-sheet'); sheet.hidden = true;
  const banner = el('div', 'mm-banner'); banner.hidden = true;
  stage.append(banner);
  root.append(top, strip, stage, plaque, actions, sheet);
  app.root.append(root);
  subHost.append(app.sub.el);
  const lay0 = L(); bot = mountMini(botHost, lay0.landscape ? (lay0.phone ? 52 : 84) : lay0.phone ? 44 : 64);

  const label = isTut ? '教学' : isGate ? '星门' : isPrimer ? '引导' : plan.kind === 'practice' ? '练习' : `第 ${plan.rel} 档`;
  const budget = plan.budget;
  const drawChip = (): void => { chip.innerHTML = `<b>${SECTOR_ZH[sec]}</b><span>${label}</span>`; };
  const drawLamps = (): void => {
    lamps.hidden = !canFail; if (!canFail) return;
    lamps.innerHTML = Array.from({ length: budget + 1 }, (_, i) => `<span class="mm-lamp${i < budget + 1 - out.slips ? ' is-on' : ''}"><i></i></span>`).join('');
    lamps.setAttribute('aria-label', `小星灯 ${Math.max(0, budget + 1 - out.slips)} 盏`);
  };
  const drawDots = (extra?: string): void => {
    if (isGate && plan.gate) {
      const g = plan.gate, cells = Array.from({ length: g.total }, (_, i) => (i < g.passes + g.misses ? (i < g.passes ? 'p' : 'm') : i === g.passes + g.misses ? (extra ?? 'c') : ''));
      dots.innerHTML = cells.map((c) => `<i class="mm-dot${c ? ` is-${c}` : ''}"></i>`).join(''); dots.dataset.gate = '1'; return;
    }
    const rs = eng.night?.rounds ?? [], n = 6;
    dots.hidden = !eng.night; if (!eng.night) return;
    dots.innerHTML = Array.from({ length: n }, (_, i) => { const r = rs[i]; return `<i class="mm-dot${r ? ` is-${r.res === 'pass' ? 'p' : r.res === 'miss' ? 'm' : 'n'}` : i === rs.length ? ' is-c' : ''}"></i>`; }).join('');
  };
  const drawPlaque = (): void => {
    const b = adapter?.banner?.() ?? null;
    plaque.hidden = !b || sec === 's1' || sec === 's3';
    if (b && !plaque.hidden) plaque.innerHTML = `<span class="mm-plaque-ic" data-k="${sec === 's4' ? plan.stim.axis : 'back'}">${sec === 's4' ? '' : '←'}</span><b>${b.title}</b><small>${b.sub}</small>`;
  };

  function L(): RoundLayout { const v = app.viewport(); return computeLayout(v.w, v.h, v.safe); }
  const layout = (): void => {
    const v = app.viewport(), l = L(), safe = v.safe;
    root.dataset.orient = l.landscape ? 'landscape' : 'portrait'; root.dataset.phone = l.phone ? '1' : '0';
    root.dataset.short = !l.landscape && l.phone ? '1' : '0';
    for (const [b, long, short] of [[bLook, '再看一眼', '再看'], [bAns, '看答案', '答案'], [bHome, '星图站', '星图']] as const) b.querySelector('.mm-lbl')!.textContent = root.dataset.short === '1' ? short : long;
    root.style.setProperty('--mm-s', `${l.S}px`);
    place(stage, { x: l.x, y: l.y, w: l.S, h: l.S });
    adapter?.scaleTo(l.S);
    if (!l.landscape) {
      const x0 = safe.left + 72, w = v.w - x0 - Math.max(l.gutter, safe.right);
      place(top, { x: x0, y: safe.top + 6, w, h: 44 });
      place(strip, l.stripRect!);
      place(plaque, { x: l.x, y: l.y + l.S + 6, w: l.S, h: 32 });
      const aTop = l.y + l.S + (plaque.hidden ? 8 : 44), aH = Math.max(l.act - 8, v.h - safe.bottom - aTop - 6);
      place(actions, { x: l.gutter, y: aTop, w: v.w - 2 * l.gutter, h: Math.min(aH, l.phone ? 64 : 88) });
      Object.assign(sheet.style, { left: `${l.gutter}px`, top: `${l.y + l.S + 8}px`, width: `${v.w - 2 * l.gutter}px`, height: 'auto', minHeight: `${Math.min(aH, l.phone ? 84 : 110)}px` });
    } else {
      const sd = l.side!, p = l.phone;
      place(top, { x: sd.x, y: sd.y, w: sd.w, h: 44 });
      place(plaque, { x: sd.x, y: sd.y + 48, w: sd.w, h: 32 });
      const sTop = sd.y + (plaque.hidden ? 48 : 84), sH = p ? 96 : 150;
      place(strip, { x: sd.x, y: sTop, w: sd.w, h: sH });
      const aTop = sTop + sH + 6; place(actions, { x: sd.x, y: aTop, w: sd.w, h: Math.max(60, sd.y + sd.h - aTop) });
      if (p) Object.assign(sheet.style, { left: `${sd.x}px`, top: `${sd.y + 48}px`, width: `${sd.w}px`, height: `${sd.h - 48}px`, minHeight: '0' });   // phone landscape: the whole column under the chip, buttons always inside the screen
      else Object.assign(sheet.style, { left: `${sd.x}px`, top: `${sTop}px`, width: `${sd.w}px`, height: 'auto', minHeight: `${Math.min(160, sd.y + sd.h - sTop)}px` });
    }
  };
  app.onResize.add(layout);

  /* ---------------------------------------------------------------- actions */
  const bLook = btn('mm-act', '再看一眼', () => void look(), 'eye'), bHint = btn('mm-act', '提示', () => hint(), 'hint'), bDemo = btn('mm-act', '演示', () => void demo(), 'info');
  const bAns = btn('mm-act', '看答案', () => { out.showAnswer = true; settle('answer'); }, 'flag'), bHome = btn('mm-act mm-act--ghost', '星图站', () => { leftAt = phase; settle('station'); }, 'map');
  bLook.dataset.act = 'look'; bHint.dataset.act = 'hint'; bDemo.dataset.act = 'demo'; bAns.dataset.act = 'answer'; bHome.dataset.act = 'station';
  actions.append(bLook, bHint, bDemo, bAns, bHome);
  const syncActions = (): void => {
    const recall = phase === 'recall' && !looking;
    bLook.disabled = !recall; bDemo.disabled = !recall; bLook.classList.toggle('is-locked', recall && lookLocked());
    bHint.hidden = bAns.hidden = isGate || isTut || out.slips === 0; bDemo.hidden = isGate || isTut;
    bHint.disabled = bAns.disabled = !recall;
    bLook.hidden = isTut;
  };

  const resetIdle = (): void => {
    clearTimeout(idleA); clearTimeout(idleB); adapter?.breathe(false);
    if (app.fast || phase !== 'recall' || isTut) return;
    idleA = window.setTimeout(() => adapter?.breathe(true), 20_000); idleB = window.setTimeout(() => void app.voice.say('mm.fb.hint0', {}), 60_000);
  };
  /** spec §3.1 / §4: a star gate has the free first look and nothing else (no second look, no look after a tap, no hint) */
  const lookLocked = (): boolean => isGate && (out.rwPre + out.rwMid >= 1 || taps > 0);
  async function look(): Promise<void> {
    if (phase !== 'recall' || looking) return;
    if (lookLocked()) { bLook.classList.remove('is-nope'); void bLook.offsetWidth; bLook.classList.add('is-nope'); app.sfx('ui-locked'); void app.voice.say('mm.g.nohint', {}); return; }
    looking = true; if (taps === 0) out.rwPre += 1; else out.rwMid += 1; syncActions(); resetIdle(); app.mark('look', { n: out.rwPre + out.rwMid });
    app.sfx('whoosh-up', { volume: 0.5 }); void app.voice.say('mm.fb.rewatch1', {});
    setPhase('show'); await adapter.rewatch(); setPhase('recall'); looking = false; syncActions(); resetIdle();
  }
  function hint(): void { if (phase !== 'recall') return; out.hint = Math.max(out.hint, 2); adapter.hintNext(); app.sfx('hint'); void app.voice.say('mm.fb.hint2', {}); }
  async function demo(): Promise<void> {
    if (phase !== 'recall' || looking) return;
    out.hint = 3; looking = true; syncActions(); app.mark('demo'); adapter.open(false); void app.voice.say('mm.fb.hint3', {}, { interrupt: true });
    await adapter.demo();
    // the child now tries on a fresh seed of the same rung (spec §7 H3)
    plan = eng.reseed(plan, 'demo'); swapAdapter(); await showAndHide(); looking = false; setPhase('recall'); adapter.open(true); tRecall = performance.now(); taps = 0; syncActions(); resetIdle();
  }

  /* ---------------------------------------------------------------- hooks */
  const hooks = {
    tapOk(step: number): void { taps += 1; app.lastActive = Date.now(); app.chime(step - 1); bot?.react('hop'); syncActions(); resetIdle(); },
    tapSlip(why?: 'copy' | 'flip' | 'lure'): void {
      taps += 1; out.slips += 1; app.lastActive = Date.now(); app.sfx('try-again'); bot?.setMood('encouraging'); drawLamps(); syncActions(); resetIdle();
      if (why === 'copy') void app.voice.say('mm.s4.copy', {}); else if (why === 'flip') void app.voice.say('mm.s4.flip', {}); else if (why === 'lure') void app.voice.say('mm.s3.lure', {}); else void app.voice.say('mm.fb.slip1', {});
      if (canFail && out.slips > budget) settle('miss');
    },
    done(): void { settle('pass'); },
  };
  const strong = !!eng.save.settings.colorAssist;
  function buildAdapter(): Adapter { const l = L(); return makeAdapter(plan, l.S, { phone: l.phone, strong, mirrorW: l.mirror }, hooks); }
  function swapAdapter(): void { const keep = adapter; adapter = buildAdapter(); keep?.destroy(); stage.prepend(adapter.el); adapter.scaleTo(L().S); if (plan.kind === 'scaffold') adapter.gift(); }
  async function showAndHide(): Promise<void> {
    setPhase('show'); await adapter.preview(); setPhase('fog'); await adapter.hide(); setPhase('recall');
  }

  /* ---------------------------------------------------------------- run */
  const cleanup = (): void => {
    gone = true; clearTimeout(idleA); clearTimeout(idleB); disposeSkip(); app.onResize.delete(layout);
    app.narrator.stop(); try { document.body.append(app.sub.el); } catch { /* gone */ }
    adapter?.destroy(); bot?.destroy(); root.remove();
  };

  if (app.test) (window as unknown as { __mmRound?: unknown }).__mmRound = { plan: () => plan, adapter: () => adapter, phase: () => phase, out, settle: (d: Done) => settle(d) };
  drawChip(); drawLamps(); drawDots(); swapAdapter(); drawPlaque(); layout(); syncActions();
  root.classList.add('is-in');
  app.voice.newRound();
  await wait(app, 380);

  try {
    /* ---- scripted first round of a sector (tutorial) ---- */
    if (isTut) {
      let skipped = false;
      disposeSkip = mountSkipButton(app.root, () => { skipped = true; app.narrator.stop(); settle('station'); });
      if (shouldAutoSkip()) skipped = true;
      const T = TUT[sec];
      const say = async (ids: string[]): Promise<void> => { for (const id of ids) { if (skipped || gone) return; await app.voice.say(id, {}, { force: true }); } };
      if (!skipped) {
        bot?.setMood('thinking'); await say(T.pre);
        const during = say(T.during); setPhase('show'); await adapter.preview(); await during;
        if (!skipped) { setPhase('fog'); await adapter.hide(); setPhase('recall'); await say(T.post); }
        if (!skipped) {
          const target = adapter.firstTarget(); adapter.open(true); syncActions();
          if (target) { if (sec === 's3') { const it = (adapter as unknown as { town: { itemOf(i: number): { el: HTMLElement }; homeOf(i: number): { hit: Element } } }).town; await ghostDrag(it.itemOf(0).el, it.homeOf(0).hit); } else await ghostTap(target); if (target.classList.contains('mm-anchor')) target.remove(); }
        }
        if (!skipped) { const r = await Promise.race([finished, sleep(app.fast ? 3000 : 60_000).then(() => 'timeout' as const)]); void r; }
      }
      adapter.open(false);
      if (!skipped && phase === 'recall') { bot?.setMood('happy'); app.sfx('correct'); await say(T.end); await wait(app, 700); }
      const fin = eng.finish(plan, out);
      cleanup(); return { fin, choice: 'skipped' };
    }

    /* ---- measured / practice / demo rounds ---- */
    const first = (eng.night?.rounds.length ?? 1) === 0, second = (eng.night?.rounds.length ?? 0) === 1;
    const ctx = { night1: first, ruleChange: plan.soft, awayMin: (Date.now() - app.lastActive) / 60_000, axisChanged: sec === 's4' && app.lastAxis !== plan.stim.axis, mode: plan.stim.mode };
    if (sec === 's4') app.lastAxis = plan.stim.axis;
    const ids = sec === 's4' ? [`mm.s4.axis.${plan.stim.axis}`] : sec === 's2' && plan.stim.dir === 'B' ? ['mm.s2.promptb'] : [...PROMPT[sec]];
    if (plan.kind === 'easy') ids.unshift('mm.fb.mercy');                                            // 「来一个轻松的，稳一稳」
    if (plan.kind === 'round' && second && eng.save.nights >= 2 && TIP[sec]) ids.push(TIP[sec](plan.stim));   // one strategy sentence (cool-down 3 nights, never after a slip: voice-policy)
    bot?.setMood('thinking');
    if (!isDemo) for (const id of ids) await Promise.race([app.voice.say(id, ctx), sleep(app.fast ? 20 : 2600)]);
    if (sec === 's4' && plan.stim.mode === 'peek') void app.voice.say('mm.s4.peek', ctx);
    if (plan.soft && plan.kind === 'round') {
      void app.voice.say('mm.fb.soft', ctx); if (sec === 's2' && plan.stim.dir === 'B') void app.voice.say('mm.s2.back1', ctx);
      await showBanner();
    }
    if (isDemo) {
      // an automatic demonstration (after 3 misses / a failed gate): skippable (kit 跳过 + the parent switch); skipping goes straight to the child's own round
      let alive = true, release = (): void => {}; const skipP = new Promise<void>((r) => { release = r; }); let skipped = shouldAutoSkip();
      if (!skipped) disposeSkip = mountSkipButton(app.root, () => { skipped = true; alive = false; app.narrator.stop(); release(); });
      if (!skipped) {
        const a = adapter;
        await Promise.race([skipP, (async () => { void app.voice.say('mm.fb.hint3', {}, { interrupt: true }); setPhase('show'); await a.preview(); if (!alive) return; setPhase('fog'); await a.hide(); if (!alive) return; await a.demo(); })()]);
      }
      alive = false; disposeSkip(); disposeSkip = (): void => {};
      const fin = eng.finish(plan, out); drawDots();
      if (skipped) { cleanup(); return { fin, choice: 'next' }; }
      await wait(app, 500); const choice = await showSheet(fin, 'demo'); cleanup(); return { fin, choice };
    }
    if (plan.newRuleTag) await ruleDemo();
    app.mark('round-start', { sector: sec, D: plan.D, kind: plan.kind });
    if (isPrimer) { void app.voice.say('mm.s4.primer', {}); if (plan.ghost === 1) void app.voice.say(`mm.s4.ex.${plan.stim.axis}`, {}); }      // the first guided round of an axis also says the example sentence
    await showAndHide();
    if (plan.kind === 'scaffold') adapter.gift();
    bot?.setMood('thinking'); adapter.open(true); tRecall = performance.now(); syncActions(); resetIdle();
    if (ctx.night1 && sec === 's1') void app.voice.say('mm.s1.fog', ctx);

    const how = await finished;
    adapter.open(false); clearTimeout(idleA); clearTimeout(idleB); adapter.breathe(false);
    if (how === 'station') { const at = leftAt ?? phase; setPhase('judge'); syncActions(); eng.abandon(at); cleanup(); return { fin: null, choice: 'station' }; }
    setPhase('judge'); syncActions();
    out.recallMs = performance.now() - tRecall;
    const passed = how === 'pass';
    if (!passed) { out.showAnswer = how === 'answer'; if (how === 'miss') out.slips = Math.max(out.slips, budget + 1); }
    const fin = eng.finish(plan, out);
    app.mark('round', { sector: sec, D: plan.D, kind: plan.kind, res: fin.res, slips: out.slips, rw: fin.rw, hintMax: out.hint, recallMs: Math.round(out.recallMs) });
    if (plan.kind !== 'practice') app.mark(fin.gate ? 'gate' : 'level', { sector: sec, D: plan.D, res: fin.res });
    drawDots(fin.gate ? (fin.res === 'pass' ? 'p' : 'm') : undefined); drawLamps();                      // the dots show THIS round's result (a gate's current cell turns gold / amber)
    if (fin.res === 'miss') {
      setPhase('reveal'); bot?.setMood('encouraging'); void app.voice.say('mm.fb.miss1', {}); await adapter.reveal(); void app.voice.say('mm.fb.reveal', {}); void app.voice.say('mm.fb.miss2', {});
    } else {
      setPhase('reveal'); bot?.setMood(fin.stars === 3 ? 'celebrating' : 'happy'); bot?.react('hop'); app.sfx('correct'); await adapter.celebrate();
      void app.voice.say(app.voice.rotate(['mm.fb.ok1', 'mm.fb.ok2', 'mm.fb.ok3']), { pass: fin.res === 'pass' });
    }
    await afterRound(fin);
    if (fin.fly) await revealCard(fin.fly);
    const choice = await showSheet(fin, fin.res === 'miss' ? 'miss' : 'pass');
    cleanup(); return { fin, choice };
  } catch (err) {
    cleanup(); throw err;
  }

  /* ---------------------------------------------------------------- a new RULE: one solved example first (spec §7 H3), skippable */
  async function ruleDemo(): Promise<void> {
    const tag = plan.newRuleTag!; eng.markRuleSeen(tag);
    if (shouldAutoSkip()) return;
    let alive = true, release = (): void => {}; const skipP = new Promise<void>((r) => { release = r; });
    disposeSkip = mountSkipButton(app.root, () => { alive = false; app.narrator.stop(); release(); });
    const line = tag === 's3:near' || tag === 's3:far' ? 'mm.s3.visit' : tag === 's4:UD' ? 'mm.s4.ex.UD' : null, a = adapter;
    bot?.setMood('thinking'); if (line) void app.voice.say(line, {});
    await Promise.race([skipP, (async () => { await a.preview(); if (!alive) return; await a.hide(); if (!alive) return; await a.demo(); await wait(app, 400); })()]);
    alive = false; disposeSkip(); disposeSkip = (): void => {};
    plan = eng.reseed(plan, 'rule'); swapAdapter(); layout();                                              // the child now tries on a fresh sky of the same rung
  }

  /* ---------------------------------------------------------------- the first moment of a new card: big, tilting in, tap or wait */
  function revealCard(id: string): Promise<void> {
    const c = CARDS.find((x: { id: string }) => x.id === id), meta = cardsJson.cards.find((x) => x.id === id);
    if (!c) return Promise.resolve();
    return new Promise((resolve) => {
      const ov = el('div', 'mm-reveal'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', `新卡片 ${c.title}`);
      ov.innerHTML = `<div class="mm-reveal-glow"></div><div class="mm-reveal-card"><small>新卡片</small><img alt="" src="${cardImage(c)}"><b>${c.title}</b><p>${meta?.fact ?? ''}</p></div>`;
      app.root.append(ov); app.sfx('jingle-magic'); void app.voice.say(`mm.card.${id}`, {});
      let done = false; const fin = (): void => { if (done) return; done = true; ov.classList.add('is-out'); window.setTimeout(() => { ov.remove(); resolve(); }, app.fast ? 0 : 260); };
      const t = window.setTimeout(fin, app.fast ? 60 : 3200); ov.addEventListener('click', () => { clearTimeout(t); fin(); });
    });
  }

  /* ---------------------------------------------------------------- feedback after a round */
  async function afterRound(fin: Finish): Promise<void> {
    const ev = fin.events;
    if (fin.res !== 'miss' && fin.stars > 0) { void app.voice.say(`mm.res.${fin.stars}`, { firstLit: true }); }
    if (ev.includes('levelUp')) { bot?.setMood('surprised'); void app.voice.say('mm.fb.up', {}); }
    if (ev.includes('levelDown')) void app.voice.say('mm.fb.down', {});
    if (ev.includes('offerBreak')) void app.voice.say('mm.fb.break', {});
    if (out.rwPre + out.rwMid >= 3 || (fin.res === 'neutral' && out.rwPre >= 2)) void app.voice.say('mm.fb.rewatch3', { neutral: fin.res === 'neutral' });
    if (fin.opened) void app.voice.say('mm.st.open', {});
  }

  /* ---------------------------------------------------------------- banner (soft rounds: a rule changed, tap to start) */
  function showBanner(): Promise<void> {
    const b = adapter.banner() ?? { title: SECTOR_ZH[sec], sub: '' };
    return new Promise((resolve) => {
      banner.hidden = false; banner.innerHTML = `<div class="mm-banner-card"><b>${b.arrow === 'left' ? '← ' : ''}${b.title}</b><small>${b.sub}</small></div>`;
      const go = btn('xg-btn xg-btn--primary xg-btn--lg mm-banner-go', '开始', () => { banner.hidden = true; app.sfx('ui-confirm'); resolve(); }, 'play');
      banner.firstElementChild!.append(go); app.sfx('ui-open');
    });
  }

  /* ---------------------------------------------------------------- result sheet */
  function showSheet(fin: Finish, kind: 'pass' | 'miss' | 'demo'): Promise<RoundExit['choice']> {
    setPhase('result'); actions.hidden = true; plaque.hidden = true; sheet.hidden = false; sheet.innerHTML = '';
    return new Promise((resolve) => {
      const left = el('div', 'mm-sheet-l'), right = el('div', 'mm-sheet-r');
      if (kind === 'pass') {
        if (fin.stars > 0) left.innerHTML = `<div class="mm-stars" role="img" aria-label="${fin.stars} 颗星">${[1, 2, 3].map((i) => `<span class="mm-star${i <= fin.stars ? ' is-on' : ''}" style="--i:${i}">${starSvg(i <= fin.stars ? 'gold' : 'slot')}</span>`).join('')}</div><p>点亮了第 ${plan.rel} 档</p>`;
        else left.innerHTML = `<p class="mm-big">星图复原了！</p>`;
      } else if (kind === 'miss') left.innerHTML = `<p class="mm-big">答案在这里</p><p>换一片新夜空，再试试。</p>`;
      else left.innerHTML = `<p class="mm-big">看懂了吗？</p><p>下一张，你来试试。</p>`;
      if (fin.fly) { const c = el('div', 'mm-newcard'); c.innerHTML = `<span>新卡片：<b>${cardTitle(fin.fly)}</b></span>`; left.append(c); }
      else if (kind === 'pass' && fin.stars > 0) app.sfx(`star-${fin.stars}`);
      const isGateNext = !!fin.gate && fin.gate.verdict === 'continue';
      const go = btn('xg-btn xg-btn--primary xg-btn--lg', fin.night ? '看看这一晚' : isGateNext ? '下一关' : kind === 'miss' ? '换一片新夜空' : '下一张星图', () => { app.sfx('ui-confirm'); resolve('next'); }, 'next');
      go.dataset.act = 'next'; right.append(go);
      if (kind === 'miss') { const o = btn('xg-btn xg-btn--night', '换个星区', () => { app.sfx('ui-back'); resolve('sectors'); }, 'swap'); o.dataset.act = 'sectors'; right.append(o); }
      if (plan.kind === 'practice') { go.querySelector('.mm-lbl')!.textContent = '再练一张'; const h = btn('xg-btn xg-btn--night', '回星区', () => resolve('sectors'), 'map'); right.append(h); }
      sheet.append(left, right); sheet.classList.add('is-in');
    });
  }
}
