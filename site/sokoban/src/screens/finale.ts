/**
 * S11 v1 finale "一级调度员" (spec §2.1, §5.5, §6.6): once, after the first pass of 4-7 (the chapter-4
 * boss) and its result card. ≈ 6 s: the starport panorama opens (600 ms) → the three routes' rockets
 * fly in turn from the lower left to the upper right with trails (1.2 s each, `launch` 0.6) → the
 * paper certificate drops in (outBack 500 ms) and the three route stamps are pressed (`place-piece`,
 * 300 ms apart) → confetti + `chapter-complete`; the companion says sok.finale.1 and sok.finale.2.
 * 好 can be tapped after 2 s. Reduced motion: the certificate simply fades in.
 * 跳过 (Dad's feedback 2026-10-08): the kit pill jumps straight to the certificate with 好 ready (the
 * certificate is the reward: it is never skipped); the parent switch 跳过开场和教学 starts there.
 */
import { confetti, icon, mountSkipButton, shouldAutoSkip } from '@kit/ui';
import { getSettings } from '@kit/settings';
import { playMusic } from '../audio/music';
import { playSfx } from '../audio/sfx';
import { sayChain } from '../audio/voice';
import { certificateHtml } from '../art/certificate';
import type { AppCtx } from '../app/context';
import { ROCKET_H, RocketSprite, drawDestination, type RocketKind } from '../render/rocket';

const ROUTES: RocketKind[] = ['tiangong', 'moon', 'mars'];

export function showFinale(ctx: AppCtx): Promise<void> {
  return new Promise((resolve) => {
    ctx.save.update((s) => {
      s.finale.v1At = Date.now();
    });
    ctx.marks.add('finale', { v: 1 });
    ctx.marks.flush();
    playMusic();
    const el = document.createElement('div');
    el.className = 'sok-finale';
    el.dataset.testid = 'finale';
    const cv = document.createElement('canvas');
    cv.className = 'sok-finale__sky';
    const cert = document.createElement('div');
    cert.className = 'sok-finale__cert';
    const name = getSettings().displayName || '小步步';
    cert.innerHTML = certificateHtml(name, ctx.save.data.launched.byDest);
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'xg-btn xg-btn--primary xg-btn--lg sok-finale__ok';
    ok.innerHTML = `${icon('check')}<span>好</span>`;
    ok.disabled = true;
    ok.dataset.testid = 'finale-ok';
    cert.append(ok);
    el.append(cv, cert);
    document.body.append(el);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const g = cv.getContext('2d')!;
    const quick = ctx.reduced || ctx.instant || shouldAutoSkip();
    let unskip: () => void = () => {};
    let certTimer: ReturnType<typeof setTimeout> | null = null;
    const ready = () => {
      unskip();
      ok.disabled = false;
      ok.classList.add('is-ready');
    };
    let raf = 0;
    let left = false;
    let sprites: RocketSprite[] = [];
    let spriteH = 0;
    const t0 = performance.now();
    const trails: { x: number; y: number }[][] = [[], [], []];
    // QA r2: a fuller panorama — twinkling stars, the 货运图 road joining the three routes, the
    // starport's lit warehouses on the limb, and a procession of the child's own launches (≤ 6)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stars = Array.from({ length: 70 }, () => ({ x: rnd(), y: rnd() * 0.62, r: 0.6 + rnd() * 1.6, ph: rnd() * 6.28 }));
    const L = ctx.save.data.launched.byDest;
    const parade: number[] = [];
    for (let i = 0; parade.length < Math.min(6, L.tiangong + L.moon + L.mars) && i < 18; i += 1) {
      const r = i % 3;
      if ([L.tiangong, L.moon, L.mars][r] > Math.floor(i / 3)) parade.push(r);
    }
    const sounded = new Set<number>();
    const draw = (now: number) => {
      const t = now - t0;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        cv.style.width = `${w}px`;
        cv.style.height = `${h}px`;
      }
      const want = Math.round(Math.min(w, h) * 0.2);
      if (want !== spriteH) {
        for (const s of sprites) s.dispose();
        spriteH = want;
        sprites = ROUTES.map((k) => new RocketSprite(k, want / ROCKET_H.tiangong, dpr));
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const open = Math.min(1, t / 600);
      for (const st of stars) {
        g.fillStyle = `rgba(255, 250, 240, ${(0.35 + 0.35 * Math.sin(t / 420 + st.ph)) * open})`;
        g.beginPath();
        g.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
        g.fill();
      }
      // the starport below: the Earth's limb rising into view with its glow, and the launch towers
      const R = Math.max(w, h) * 1.2;
      const cy = h + R * (0.86 - 0.04 * open);
      const glow = g.createRadialGradient(w / 2, cy, R * 0.98, w / 2, cy, R * 1.06);
      glow.addColorStop(0, 'rgba(143, 247, 236, 0.22)');
      glow.addColorStop(1, 'rgba(143, 247, 236, 0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(w / 2, cy, R * 1.06, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2C5FC4';
      g.beginPath();
      g.arc(w / 2, cy, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(183, 193, 236, 0.8)';
      g.lineWidth = 2;
      g.stroke();
      for (const [k, tx] of [[0, 0.1], [1, 0.16], [2, 0.86]] as const) {
        const base = cy - Math.sqrt(Math.max(0, R * R - (tx * w - w / 2) ** 2));
        const th = 70 + 18 * (k % 2);
        g.strokeStyle = '#35468C';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(tx * w - 7, base);
        g.lineTo(tx * w - 7, base - th);
        g.moveTo(tx * w + 7, base);
        g.lineTo(tx * w + 7, base - th);
        for (let y = 10; y < th; y += 14) {
          g.moveTo(tx * w - 7, base - y);
          g.lineTo(tx * w + 7, base - y - 14);
        }
        g.stroke();
      }
      // the starport skyline on the limb: warehouses with lit windows
      for (let i = 0; i < 7; i += 1) {
        const bx = w * (0.26 + i * 0.075);
        const bw = w * 0.06;
        const bh = 26 + ((i * 37) % 3) * 12;
        const base = cy - Math.sqrt(Math.max(0, R * R - (bx + bw / 2 - w / 2) ** 2)) + 4;
        g.fillStyle = '#1F3478';
        g.beginPath();
        g.roundRect(bx, base - bh, bw, bh, [6, 6, 0, 0]);
        g.fill();
        g.fillStyle = '#F6B934';
        for (let k = 0; k < 3; k += 1) if ((i + k) % 2 === 0 || t > 1800 + i * 200) g.fillRect(bx + bw * (0.18 + k * 0.26), base - bh + 9, bw * 0.14, 7);
      }
      // the three destinations across the sky
      const dests = ROUTES.map((_k, i) => ({ x: w * (0.22 + 0.28 * i), y: h * (0.16 + (i === 1 ? -0.04 : 0)) }));
      const rr = Math.min(w, h) * 0.06;
      // the 货运图 road: dotted, joining the routes as each rocket arrives
      g.save();
      g.setLineDash([2, 12]);
      g.lineCap = 'round';
      g.lineWidth = 5;
      for (let i = 0; i < 2; i += 1) {
        const k = Math.max(0, Math.min(1, (t - (600 + (i + 1) * 1200 + 1100)) / 500));
        if (k <= 0) continue;
        const a = dests[i];
        const b = dests[i + 1];
        g.strokeStyle = `rgba(143, 247, 236, ${0.7 * k})`;
        g.beginPath();
        g.moveTo(a.x + rr * 1.2, a.y);
        g.quadraticCurveTo((a.x + b.x) / 2, Math.max(a.y, b.y) + rr * 1.6, a.x + rr * 1.2 + (b.x - rr * 1.2 - a.x - rr * 1.2) * k, a.y + (b.y - a.y) * k);
        g.stroke();
      }
      g.restore();
      // the procession: his own launches, small, crossing to their routes (after the three heroes)
      parade.forEach((r, j) => {
        const u = (t - (3000 + j * 240)) / 1100;
        if (u < 0 || u > 1 || !sprites[r]) return;
        const x0 = w * (0.3 + j * 0.08);
        const y0 = h * 0.8;
        const d = dests[r];
        const x = x0 + (d.x - x0) * u;
        const y = y0 + (d.y + rr * 2 - y0) * (u * (2 - u));
        g.save();
        g.globalAlpha = Math.min(1, (1 - u) * 3);
        g.translate(x, y);
        g.rotate(Math.atan2(d.x - x0, -(d.y - y0)) * 0.6);
        g.scale(0.38, 0.38);
        sprites[r].draw(g, 0, spriteH * 0.5, { flame: 1, frame: Math.round(t / 33) + j, sep: 0, stage2: 0 });
        g.restore();
      });
      ROUTES.forEach((k, i) => {
        const arrived = (t - (600 + i * 1200 + 1100)) / 400;
        const pulse = arrived > 0 && arrived < 1 ? Math.sin(arrived * Math.PI) : 0;
        drawDestination(g, k, dests[i].x, dests[i].y, rr * open * (1 + 0.25 * pulse), open * (0.6 + 0.4 * pulse));
      });
      // each route's rocket in turn, from the starport (lower left) up to its own destination, with a trail
      ROUTES.forEach((_k, i) => {
        const start = 600 + i * 1200;
        const u = (t - start) / 1200;
        if (u < 0) return;
        if (!sounded.has(i)) {
          sounded.add(i);
          playSfx('launch', { volume: 0.6 });
        }
        const e = Math.min(1, u);
        const ease = e * e * (3 - 2 * e);
        const x0 = w * 0.13;
        const y0 = h * 0.86;
        const d = dests[i];
        const cx1 = x0 + (d.x - x0) * 0.1;
        const cy1 = y0 - (y0 - d.y) * 0.75;
        const bx = (1 - ease) ** 2 * x0 + 2 * (1 - ease) * ease * cx1 + ease * ease * d.x;
        const by = (1 - ease) ** 2 * y0 + 2 * (1 - ease) * ease * cy1 + ease * ease * (d.y + rr * 1.4);
        const trail = trails[i];
        if (u <= 1) trail.push({ x: bx, y: by });
        if (trail.length > 1) {
          g.save();
          g.lineCap = 'round';
          const fade = u > 1 ? Math.max(0, 1 - (u - 1) * 1.5) : 1;
          for (let j = 1; j < trail.length; j += 1) {
            const a = (j / trail.length) * fade;
            g.strokeStyle = `rgba(255, 216, 99, ${0.55 * a})`;
            g.lineWidth = 6 * (j / trail.length) + 1;
            g.beginPath();
            g.moveTo(trail[j - 1].x, trail[j - 1].y);
            g.lineTo(trail[j].x, trail[j].y);
            g.stroke();
          }
          g.restore();
        }
        if (u <= 1) {
          const prev = trail.length > 1 ? trail[trail.length - 2] : { x: x0, y: y0 + 1 };
          const ang = Math.atan2(bx - prev.x, prev.y - by);
          g.save();
          g.translate(bx, by);
          g.rotate(ang);
          const sc = 1 - 0.55 * ease;
          g.scale(sc, sc);
          sprites[i].draw(g, 0, spriteH * 0.5, { flame: 1, frame: Math.round(t / 33), sep: 0, stage2: 0 });
          g.restore();
        }
      });
      if (t < 5200) raf = requestAnimationFrame(draw);
    };
    const showCert = (fast = quick) => {
      if (cert.classList.contains('is-in')) return;
      cert.classList.add('is-in');
      playSfx('chapter-complete');
      const stamps = Array.from(cert.querySelectorAll<HTMLElement>('.sok-stamp'));
      stamps.forEach((s, i) => setTimeout(() => {
        s.classList.add('is-stamped');
        playSfx('place-piece', { volume: 0.7 });
      }, fast ? 0 : 500 + i * 300));
      setTimeout(() => {
        if (!fast) confetti(80);
      }, fast ? 0 : 1500);
      void sayChain(ctx.voice, ['sok.finale.1', 'sok.finale.2'], () => !left);
      setTimeout(ready, ctx.test || fast ? 0 : 2000);
    };
    if (quick) {
      el.classList.add('is-quick');
      showCert();
    } else {
      raf = requestAnimationFrame(draw);
      certTimer = setTimeout(() => showCert(), 4200);
      unskip = mountSkipButton(document.body, () => {
        ctx.marks.add('skip', { id: 'finale' });
        ctx.marks.flush();
        if (certTimer) clearTimeout(certTimer);
        cancelAnimationFrame(raf);
        el.classList.add('is-quick');
        showCert(true);
        ready();
      });
    }
    ok.addEventListener('click', () => {
      if (ok.disabled) return;
      left = true;
      unskip();
      cancelAnimationFrame(raf);
      for (const s of sprites) s.dispose();
      cv.width = cv.height = 0;
      ctx.voice.stop();
      el.classList.add('is-leaving');
      setTimeout(() => {
        el.remove();
        resolve();
      }, ctx.test ? 0 : 280);
    });
  });
}
