/**
 * Match HUD (spec §2.3 rectangle table, §6.9): DOM over the WebGL canvas. Every non-interactive element is
 * pointer-events:none (fingers on the leaderboard/minimap still steer). Refresh rates (§8.6): leaderboard
 * 4 Hz (DOM only when order/values change), length 10 Hz, timer 1 Hz (4 Hz in the last 10 s), minimap 4 Hz.
 * Name tags and floaters live in a DPR-2 DOM overlay (pooled ≤30 nodes, transform-only updates).
 * No backdrop-filter (A13 cost, review B24): panels are flat 0.72-opacity dark.
 */
import { h } from '@kit/ui';
import type { Match } from './match';
import type { WorldView } from './render/view';
import { rgb2css } from './render/art';
import type { Snake, KillTag } from './sim/core';

const TAG_ICON: Record<KillTag, string> = { cut: '截', encircle: '围', headon: '碰', body: '撞' };
const PU_LABEL: Record<string, string> = { magnet: '吸铁石', shield: '护盾', speed: '闪电' };

export class Hud {
  root: HTMLElement;
  pause: HTMLButtonElement; boost: HTMLElement; stick: HTMLElement;
  private pill: HTMLElement; private pillNum: HTMLElement; private pillLabel: HTMLElement;
  private pus: HTMLElement; private feed: HTMLElement; private board: HTMLElement; private banner: HTMLElement;
  private mini: HTMLCanvasElement; private miniCtx: CanvasRenderingContext2D;
  private overlay: HTMLElement; private tags: HTMLElement[] = []; private floaters: { el: HTMLElement; x: number; y: number; t: number; life: number }[] = [];
  private countdown: HTMLElement;
  private t = 0; private lastBoard = ''; private lastPill = ''; private boardT = 0; private miniT = 0; private pillT = 0;
  showNames = true;
  private bannerT = 0; private bannerQ: { text: string; cls: string }[] = [];

  /** 挑战关 objective bar (spec §2.3): icon + star-sand ring, progress, 3 live stars; edge arrows */
  private goal: HTMLElement | null = null; private goalNum: HTMLElement | null = null; private goalStars: HTMLElement[] = [];
  private sand: SVGCircleElement | null = null; private goalT = 0; private lastGoal = '';
  private arrows: HTMLElement[] = [];
  /** H0/H1 pointing arrow from his head toward the goal (spec §5.1) until this world time */
  pointUntil = 0;
  private point: HTMLElement | null = null;

  /** settings changed mid-match (pause → 设置): move the boost key + minimap to the new side (QA r4) */
  setBoostSide(side: 'left' | 'right') { this.root.classList.toggle('sb-boost-left', side === 'left'); this.root.classList.toggle('sb-boost-right', side === 'right'); }
  constructor(parent: HTMLElement, private m: Match, private view: WorldView, boostSide: 'left' | 'right') {
    const timed = m.mode === 'timed' || (m.mode === 'mission' && m.isRace);
    this.overlay = h('div', { class: 'sb-overlay' });
    for (let i = 0; i < 24; i++) { const t = h('div', { class: 'sb-tag', hidden: true }); this.tags.push(t); this.overlay.append(t); }
    this.pause = h('button', { class: 'sb-pause', type: 'button', 'aria-label': '暂停' }) as HTMLButtonElement;
    this.pause.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.6"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6"/></svg>';
    this.pillNum = h('span', { class: 'sb-pill__num' }, timed ? '3:00' : '20');
    this.pillLabel = h('span', { class: 'sb-pill__label' }, timed ? '' : '长度');
    this.pill = h('div', { class: 'sb-pill' + (timed ? '' : ' sb-pill--len') }, this.pillLabel, this.pillNum);
    this.pus = h('div', { class: 'sb-pus' });
    for (const k of ['magnet', 'shield', 'speed']) {
      const slot = h('div', { class: `sb-pu sb-pu--${k}`, 'data-kind': k, hidden: true });
      slot.innerHTML = `<svg viewBox="0 0 44 44"><circle class="sb-pu__track" cx="22" cy="22" r="19"/><circle class="sb-pu__ring" cx="22" cy="22" r="19" pathLength="100"/></svg><i aria-label="${PU_LABEL[k]}"></i>`;
      this.pus.append(slot);
    }
    this.feed = h('div', { class: 'sb-feed' });
    this.board = h('div', { class: 'sb-board', hidden: !timed });
    this.banner = h('div', { class: 'sb-banner', hidden: true });
    this.mini = h('canvas', { class: 'sb-mini' }) as HTMLCanvasElement;
    const ms = innerWidth > innerHeight ? 170 : 150;
    this.mini.width = this.mini.height = ms * 2; this.miniCtx = this.mini.getContext('2d')!;
    this.boost = h('div', { class: 'sb-boost', role: 'button', 'aria-label': '加速' });
    this.boost.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M27 4 11 27h11l-4 17 19-25H25z"/></svg>';
    this.stick = h('div', { class: 'sb-stick', hidden: true }, h('div', { class: 'sb-stick__knob' }));
    this.countdown = h('div', { class: 'sb-count', hidden: true });
    this.root = h('div', { class: `sb-hud sb-hud--${m.mode}${m.isRace ? ' sb-hud--race' : ''} sb-boost-${boostSide}` }, this.overlay, this.stick, this.feed, this.pill, this.pus, this.board, this.banner, this.mini, this.boost, this.pause, this.countdown);
    if (m.run) this.buildGoal();
    if (m.mode === 'mission' && !m.isRace) this.pill.hidden = true;
    parent.append(this.root);
  }

  private buildGoal() {
    const run = this.m.run!, o = run.m.objective;
    const kind = run.king ? 'crown' : o.type === 'rings' ? ((o.radius ?? 0) >= 150 ? 'beacon' : 'ring') : o.type === 'kill' || o.type === 'streak' ? 'target' : o.type === 'eat' ? (o.kind === 'meteor' ? 'meteor' : o.kind === 'big' ? 'big' : 'orb') : o.type === 'pu' ? 'shield' : o.type === 'loop' ? 'core' : o.type === 'survive' ? 'clock' : o.type === 'length' ? 'len' : 'race';
    const capFail = !['survive', 'race'].includes(o.type);
    const ic = h('div', { class: `sb-goal__icon sb-gi--${kind}` });
    ic.innerHTML = `<svg viewBox="0 0 48 48" class="sb-goal__sand" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="100" class="sb-goal__sandring"${capFail || o.type === 'survive' ? '' : ' style="display:none"'}/></svg><i></i>`;
    this.sand = ic.querySelector('circle');
    this.goalNum = h('span', { class: 'sb-goal__num' }, '');
    const stars = h('span', { class: 'sb-goal__stars' });
    for (let i = 0; i < 3; i++) { const st = h('i', { class: 'sb-goal__star' + (i === 0 ? '' : ' is-cond') }); this.goalStars.push(st); stars.append(st); }
    this.goal = h('div', { class: 'sb-goal' + (this.m.isRace ? ' is-race' : '') + (o.type === 'survive' ? ' is-survive' : '') }, ic, this.goalNum, stars);
    this.root.append(this.goal);
    for (let i = 0; i < 4; i++) { const a = h('div', { class: 'sb-edge', hidden: true }); a.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 20 30 8v24z"/></svg>'; this.arrows.push(a); this.root.append(a); }
  }

  /** refresh the objective bar (8 Hz) and the edge arrows (every frame) */
  private updateGoal(dt: number) {
    const m = this.m, run = m.run!, o = run.m.objective, w = m.world;
    this.goalT -= dt;
    if (this.goalT <= 0) {
      this.goalT = 0.125;
      const p = run.progress();
      let txt: string;
      if (run.king) txt = `宝石 ${p.cur}/${p.n}`;
      else if (o.type === 'race') txt = `第${p.cur}名`;
      else if (o.type === 'survive') txt = '';
      else txt = `${p.cur}/${p.n}`;
      if (o.type === 'race' && o.killsGE) txt += ` ${Math.min(o.killsGE, run.me.stats.killTags.filter((k) => !o.tags || o.tags.includes(k.tag)).length)}/${o.killsGE}`;
      const st = run.m.stars;
      const s2 = st[0].type === 'clear' ? true : run.starLive(st[0]), s3 = st[1].type === 'clear' ? true : run.starLive(st[1]);
      const key = `${txt}|${s2}|${s3}`;
      if (key !== this.lastGoal) {
        if (this.lastGoal && txt !== this.lastGoal.split('|')[0]) { this.goal!.classList.remove('is-bump'); void this.goal!.offsetWidth; this.goal!.classList.add('is-bump'); }
        this.lastGoal = key; this.goalNum!.textContent = txt; this.goalNum!.classList.toggle('is-long', txt.length > 5);
        this.goalStars[1].classList.toggle('is-on', s2); this.goalStars[2].classList.toggle('is-on', s2 && s3);
      }
      this.goalStars[0].classList.toggle('is-on', !!run.outcome?.ok);
      // star sand: the last 40 % of the cap on cap-fail levels; survive: a countdown ring of `sec`
      const cap = run.m.capSec, t = w.t;
      let frac = 1;
      if (o.type === 'survive') frac = Math.max(0, 1 - t / o.sec!);
      else if (!['race'].includes(o.type)) frac = t < cap * 0.6 ? 1 : Math.max(0, (cap - t) / (cap * 0.4));
      this.sand!.style.strokeDashoffset = String(100 - frac * 100);
      this.sand!.parentElement!.classList.toggle('is-low', o.type !== 'survive' && t >= cap * 0.6);
    }
    // edge arrows: off-screen targets (gold), the current ring / beacon, 星核, meteors on meteor levels
    const pts: [number, number, string][] = [];
    if (o.type === 'rings') { const p = o.points![m.me.m!.ring]; if (p) pts.push([p[0], p[1], 'is-ring']); }
    const ptSnakes = new Map<number, Snake>();
    for (const s of w.snakes) if (s.alive && !s.isPlayer && (s.target_ || run.qualifies(s))) { ptSnakes.set(pts.length, s); pts.push([s.x, s.y, s.king ? 'is-king' : '']); }
    this.ptSnakes = ptSnakes;
    if (o.type === 'loop') { const mk = (w as unknown as { markers: { x: number; y: number; done: boolean }[] }).markers.find((q) => !q.done); if (mk) pts.push([mk.x, mk.y, 'is-ring']); }
    if (o.type === 'eat' && o.kind === 'meteor') for (const mt of w.meteors) pts.push([mt.x, mt.y, 'is-meteor']);
    const v = this.view; let ai = 0;
    const W = innerWidth, H = innerHeight, pad = 64;
    for (const [x, y, cls] of pts) {
      if (ai >= this.arrows.length) break;
      if (v.onScreen(x, y, -40)) continue;
      const [sx, sy] = v.worldToScreen(x, y);
      const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad - 40) / Math.max(1e-3, Math.abs(dy)));
      const ex = cx + dx * k, ey = cy + dy * k, ang = Math.atan2(dy, dx);
      const el = this.arrows[ai++]; el.hidden = false; el.className = `sb-edge ${cls}`;
      el.style.transform = `translate3d(${(ex - 22).toFixed(0)}px, ${(ey - 22).toFixed(0)}px, 0) rotate(${ang.toFixed(2)}rad)`;
    }
    for (; ai < this.arrows.length; ai++) if (!this.arrows[ai].hidden) this.arrows[ai].hidden = true;
    this.pts = pts;
    // H0/H1 pointing arrow from his head toward the goal (3 s); objectives without a marker point at the
    // nearest big orb / richest stardust / open water (QA r3)
    const ptT = w.t < this.pointUntil && m.me.alive ? this.hintTarget() : null;
    if (!this.point) { this.point = h('div', { class: 'sb-point', hidden: true }); this.point.innerHTML = '<svg viewBox="0 0 120 40" aria-hidden="true"><path d="M4 20h86" stroke="#ffd23f" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 13"/><path d="M84 6l30 14-30 14z" fill="#ffd23f" stroke="#7a4a00" stroke-width="3" stroke-linejoin="round"/></svg>'; this.root.append(this.point); }
    if (ptT) {
      const [hx, hy] = v.worldToScreen(m.me.x, m.me.y); const ang = Math.atan2(ptT[1] - m.me.y, ptT[0] - m.me.x);
      this.point.hidden = false; this.point.style.transform = `translate3d(${(hx + Math.cos(ang) * 40).toFixed(0)}px, ${(hy + Math.sin(ang) * 40 - 20).toFixed(0)}px, 0) rotate(${ang.toFixed(2)}rad)`;
    } else if (!this.point.hidden) this.point.hidden = true;
  }

  dispose() { this.root.remove(); }

  private pts: [number, number, string][] = [];
  private ptSnakes = new Map<number, Snake>();
  /** H0/H1 target (spec §5.1): the nearest marker (ring, beacon, 星核, target snake, meteor); objectives without a
   * marker get one too (QA r3) — eat/length/race/kill → the nearest big orb, else the richest stardust cell near
   * him; pu → the nearest power-up; survive → open water away from the nearest awake snake */
  hintTarget(): [number, number] | null {
    const m = this.m, w = m.world, me = m.me, o = m.run?.m.objective;
    if (!me.alive) return null;
    const d2 = (x: number, y: number) => (x - me.x) ** 2 + (y - me.y) ** 2;
    if (this.pts.length) {
      let best = this.pts[0], bd = 1e18, bi = 0; this.pts.forEach((q, i) => { const sn = this.ptSnakes.get(i); const dd = sn ? d2(sn.x, sn.y) : d2(q[0], q[1]); if (dd < bd) { bd = dd; best = q; bi = i; } });
      // interception levels (tags incl. 'cut'): lead the snake — aim where its head will be when he gets there,
      // a little ahead, so following the arrow lays his body across its path instead of meeting it head-on (QA r5)
      const sn = this.ptSnakes.get(bi);
      if (sn?.alive && !sn.sleep && o?.tags?.includes('cut')) return this.leadPoint(sn);
      if (sn?.alive) return [sn.x, sn.y];
      return [best[0], best[1]];
    }
    if (!o) return null;
    const R = w.R;
    if (o.type === 'pu') { let best: [number, number] | null = null, bd = 1e18; for (const p of w.pus) { const dd = d2(p.x, p.y); if (dd < bd) { bd = dd; best = [p.x, p.y]; } } if (best) return best; }
    // a stardust / open-water target is held for 2 s, so the arrow and the H0 hand agree and never jitter
    if (this.fb && w.t - this.fb.t < (o.type === 'survive' ? 0.6 : 2)) return this.fb.p;
    const fb = this.fallbackTarget(o.type, R, d2);
    this.fb = fb ? { t: w.t, p: fb } : null;
    return fb;
  }
  /** intercept point: his travel time to the snake's future head (2 refinements) + 0.7 s margin ahead of it, nudged
   * 50 u toward his side of its path; clamped to 3.5 s of its travel */
  private leadPoint(s: Snake): [number, number] {
    const me = this.m.me, sp = Math.max(1, s.speed()), mySp = Math.max(1, me.speed());
    const cx = Math.cos(s.angle), cy = Math.sin(s.angle);
    let t = Math.hypot(s.x - me.x, s.y - me.y) / mySp;
    for (let i = 0; i < 2; i++) { const fx = s.x + cx * sp * t, fy = s.y + cy * sp * t; t = Math.min(3.5, Math.hypot(fx - me.x, fy - me.y) / mySp); }
    t = Math.min(3.5, t + 0.7);
    const side = Math.sign((me.x - s.x) * -cy + (me.y - s.y) * cx) || 1;
    let x = s.x + cx * sp * t + -cy * 50 * side, y = s.y + cy * sp * t + cx * 50 * side;
    const R = this.m.world.R * 0.9, dc = Math.hypot(x, y); if (dc > R) { x *= R / dc; y *= R / dc; }
    return [x, y];
  }
  private openWater(R: number, d2: (x: number, y: number) => number): [number, number] {
    const w = this.m.world, me = this.m.me;
    let th: Snake | null = null, td = 1e18;
    for (const s of w.snakes) if (s.alive && !s.isPlayer && !s.sleep) { const dd = d2(s.x, s.y); if (dd < td) { td = dd; th = s; } }
    let ax = th ? me.x - th.x : Math.cos(me.angle), ay = th ? me.y - th.y : Math.sin(me.angle); const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const dc = Math.hypot(me.x, me.y);
    if (dc > R * 0.55) { const k = Math.min(1, (dc - R * 0.55) / (R * 0.3)); ax = ax * (1 - k) - (me.x / dc) * k; ay = ay * (1 - k) - (me.y / dc) * k; }
    const l = Math.hypot(ax, ay) || 1; return [me.x + (ax / l) * 320, me.y + (ay / l) * 320];
  }
  private fb: { t: number; p: [number, number] } | null = null;
  private fallbackTarget(type: string, R: number, d2: (x: number, y: number) => number): [number, number] | null {
    const m = this.m, w = m.world, me = m.me;
    if (type === 'survive') return this.openWater(R, d2);
    let big: [number, number] | null = null, bd = 650 * 650;
    w.food.query(me.x, me.y, 650, (f) => { if (f.kind !== 'big') return; const dd = d2(f.x, f.y); if (dd < bd && dd > (me.r + 20) ** 2) { bd = dd; big = [f.x, f.y]; } });
    if (big) return big;
    const g = w.food, c = g.cell, off = g.off, rad = 600;
    let bestV = 0, best: [number, number] | null = null;
    const x0 = Math.max(0, Math.floor((me.x - rad + off) / c)), x1 = Math.min(g.dim - 1, Math.floor((me.x + rad + off) / c));
    const y0 = Math.max(0, Math.floor((me.y - rad + off) / c)), y1 = Math.min(g.dim - 1, Math.floor((me.y + rad + off) / c));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const val = g.value[cy * g.dim + cx]; if (val <= 0) continue;
      const x = cx * c - off + c / 2, y = cy * c - off + c / 2, dd = Math.sqrt(d2(x, y));
      if (dd < 90 || Math.hypot(x, y) > R - 60) continue;
      const score = val / (1 + dd / 350); if (score > bestV) { bestV = score; best = [x, y]; }
    }
    return best;
  }

  // ---- events --------------------------------------------------------------
  showCount(n: number | '出发') {
    const el = this.countdown; el.hidden = false; el.textContent = n === '出发' ? '出发！' : String(n);
    el.classList.toggle('is-word', n === '出发');   // the word beat in the display face, digits in the number face
    el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop');
    if (n === '出发') setTimeout(() => { el.hidden = true; }, 450);
  }
  hideCount() { this.countdown.hidden = true; }

  bannerShow(text: string, cls = '') {
    // a newer banner of the same kind replaces a queued one (milestones never stack up)
    for (let i = this.bannerQ.length - 1; i >= 1; i--) if (this.bannerQ[i].cls === cls) this.bannerQ.splice(i, 1);
    if (this.bannerQ.length >= 3) this.bannerQ.splice(1, 1);
    this.bannerQ.push({ text, cls });
    if (this.bannerQ.length === 1 && this.bannerT <= 0) this.nextBanner();
  }
  private nextBanner() {
    const b = this.bannerQ[0]; if (!b) return;
    this.banner.hidden = false; this.banner.className = `sb-banner ${b.cls}`; this.banner.textContent = b.text;
    void this.banner.offsetWidth; this.banner.classList.add('is-in');
    this.bannerT = 1.38;
  }

  feedLine(killer: Snake | null, tag: KillTag, victim: Snake) {
    const me = this.m.me;
    const row = h('div', { class: 'sb-feed__row' + (killer === me ? ' is-me' : victim === me ? ' is-victim' : '') },
      h('b', { style: `color:${killer ? this.css(killer) : '#ccc'}` }, killer?.name ?? '围栏'),
      h('span', { class: `sb-feed__tag sb-feed__tag--${tag}` }, TAG_ICON[tag]),
      h('b', { style: `color:${this.css(victim)}` }, victim.name));
    this.feed.prepend(row);
    const max = this.m.mode === 'timed' ? 3 : 3;
    while (this.feed.children.length > max) this.feed.lastElementChild!.remove();
    setTimeout(() => { row.classList.add('is-out'); setTimeout(() => row.remove(), 400); }, 4000);
  }
  private css(s: Snake) { const c = this.view.colorOf(s); return rgb2css(c.map((v) => Math.min(255, v * 1.08)) as [number, number, number]); }

  floater(text: string, x: number, y: number, cls = '') {
    const el = h('div', { class: `sb-float ${cls}` }, text);
    this.overlay.append(el);
    this.floaters.push({ el, x, y, t: 0, life: cls.includes('near') ? 0.85 : 0.65 });
  }

  pulseBoost() { this.boost.classList.remove('is-hint'); void this.boost.offsetWidth; this.boost.classList.add('is-hint'); }
  setDying(on: boolean) { this.root.classList.toggle('is-dead', on); }

  // ---- per frame -----------------------------------------------------------
  update(dt: number) {
    const m = this.m, me = m.me, v = this.view;
    this.t += dt;
    // banner lifetime: in 220 ms → hold 900 → out 260
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0.26) this.banner.classList.add('is-out'); if (this.bannerT <= 0) { this.banner.hidden = true; this.banner.classList.remove('is-in', 'is-out'); this.bannerQ.shift(); if (this.bannerQ.length) this.nextBanner(); } }
    // pill
    this.pillT -= dt;
    if (this.pillT <= 0) {
      if (m.mode === 'timed' || m.isRace) {
        const tl = Math.ceil(m.timeLeft), txt = `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`;
        if (txt !== this.lastPill) { this.pillNum.textContent = txt; this.lastPill = txt; }
        this.pill.classList.toggle('is-last', m.timeLeft <= 10 && m.state !== 'over');
        this.pillT = m.timeLeft <= 10 ? 0.25 : 1;
      } else { const txt = String(Math.floor(me.alive ? me.mass : me.stats.peak)); if (txt !== this.lastPill) { this.pillNum.textContent = txt; this.lastPill = txt; } this.pillT = 0.1; }
    }
    if (this.goal) this.updateGoal(dt);
    // power-up slots (remaining-time rings)
    for (const slot of Array.from(this.pus.children) as HTMLElement[]) {
      const k = slot.dataset.kind!, left = k === 'magnet' ? me.magnet : k === 'shield' ? me.shield : me.speedPu, full = k === 'speed' ? 5 : 8;
      const on = me.alive && left > 0; if (slot.hidden === on) slot.hidden = !on;
      if (on) (slot.querySelector('.sb-pu__ring') as SVGCircleElement).style.strokeDashoffset = String(100 - (left / full) * 100);
    }
    // boost key: dim below 20
    this.boost.classList.toggle('is-low', me.mass < 20);
    // leaderboard (4 Hz; top 5 + him)
    this.boardT -= dt;
    if ((m.mode === 'timed' || m.isRace) && this.boardT <= 0) {
      this.boardT = 0.25;
      const r = m.ranking(), mine = r.findIndex((x) => x.s === me);
      const rows = r.slice(0, 5).map((x, i) => [i + 1, x.s, Math.floor(x.score)] as const);
      if (mine >= 5) rows.push([mine + 1, me, Math.floor(r[mine].score)] as const);
      const key = rows.map((x) => `${x[0]}:${x[1].id}:${x[2]}`).join('|');
      if (key !== this.lastBoard) {
        this.lastBoard = key;
        this.board.replaceChildren(...rows.map(([n, s, sc]) => h('div', { class: 'sb-board__row' + (s === me ? ' is-me' : '') + (n === 1 ? ' is-first' : '') },
          h('span', { class: 'sb-board__n' }, String(n)), h('i', { class: 'sb-board__dot', style: `background:${this.css(s)}` }),
          h('span', { class: 'sb-board__name' }, s.name), h('span', { class: 'sb-board__len' }, String(sc)))));
      }
    }
    // minimap (4 Hz)
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.25; this.drawMini(); }
    // name tags (screen space, above the head, ≥ 8 px head radius on screen)
    let ti = 0;
    if (this.showNames) {
      for (const s of m.world.snakes) {
        if (!s.alive || ti >= this.tags.length) continue;
        const rr = s.r * v.zoom; if (rr < 8) continue;
        if (!v.onScreen(s.x, s.y, 40)) continue;
        const [sx, sy] = v.worldToScreen(s.x, s.y);
        const el = this.tags[ti++];
        const name = s.name + (s.stats.lifeKills >= 3 ? ` ×${s.stats.lifeKills}` : '');
        if (el.textContent !== name) el.textContent = name;
        el.className = 'sb-tag' + (s.isPlayer ? ' is-me' : '') + (s.protect > 0 || (s.isPlayer && this.m.demo) ? ' is-ghost' : '');
        el.hidden = false;
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${(sy - s.r * (s.king ? 2.9 : 1.6) * v.zoom - 20).toFixed(1)}px, 0) translateX(-50%)`;
      }
    }
    for (; ti < this.tags.length; ti++) if (!this.tags[ti].hidden) this.tags[ti].hidden = true;
    // floaters
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]; f.t += dt;
      if (f.t >= f.life) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      const [sx, sy] = v.worldToScreen(f.x, f.y);
      const q = f.t / f.life;
      f.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${(sy - 30 - 40 * q).toFixed(1)}px, 0) translateX(-50%) scale(${q < 0.2 ? 0.6 + 2 * q : 1})`;
      f.el.style.opacity = String(q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25);
    }
  }

  private drawMini() {
    const c = this.miniCtx, S = this.mini.width, m = this.m, R = m.world.R, k = (S / 2 - 6) / R;
    c.clearRect(0, 0, S, S);
    c.save(); c.translate(S / 2, S / 2);
    c.beginPath(); c.arc(0, 0, S / 2 - 3, 0, Math.PI * 2); c.fillStyle = 'rgba(14,18,40,0.72)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(160,230,140,0.55)'; c.stroke();
    // view rectangle
    const v = this.view; const hw = (innerWidth / 2 / v.zoom) * k, hh = (innerHeight / 2 / v.zoom) * k;
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 2; c.strokeRect(v.camX * k - hw, v.camY * k - hh, hw * 2, hh * 2);
    for (const mt of m.world.meteors) { c.fillStyle = '#ff8ac0'; c.beginPath(); c.arc(mt.x * k, mt.y * k, 4, 0, Math.PI * 2); c.fill(); }
    for (const s of m.world.snakes) {
      if (!s.alive || s.isPlayer) continue;
      const col = this.view.colorOf(s); c.fillStyle = rgb2css(col);
      const x = s.x * k, y = s.y * k, rad = 3 + Math.min(5, Math.sqrt(s.mass) / 6);
      c.beginPath();
      if (s.persona === 'hunter') { c.moveTo(x + Math.cos(s.angle) * rad * 1.8, y + Math.sin(s.angle) * rad * 1.8); c.arc(x, y, rad, s.angle + 0.9, s.angle - 0.9); }
      else c.arc(x, y, rad, 0, Math.PI * 2);
      c.fill();
    }
    const me = m.me;
    if (me.alive) {
      const x = me.x * k, y = me.y * k;
      c.fillStyle = '#ffd23f'; c.strokeStyle = '#5a3a00'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x + Math.cos(me.angle) * 14, y + Math.sin(me.angle) * 14); c.lineTo(x + Math.cos(me.angle + 2.5) * 8, y + Math.sin(me.angle + 2.5) * 8); c.lineTo(x + Math.cos(me.angle - 2.5) * 8, y + Math.sin(me.angle - 2.5) * 8); c.closePath(); c.fill();
    }
    c.restore();
  }
}
