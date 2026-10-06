/**
 * 小推 as a DOM picture (map marker, hangar turntable, ceremonies): the board's own robot renderer
 * drawn once into a small canvas at the device pixel ratio, wearing what the save says.
 */
import { drawRobot, restPose, type Cosmetics, type RobotPose } from '../render/robot';

export interface Equipped {
  cosmetics: { equipped: Partial<Record<string, string>> };
}

/** The save's equipped items → the renderer's cosmetics flags. */
export function cosmeticsOf(save: Equipped): Cosmetics {
  const e = save.cosmetics.equipped;
  return {
    hat: !!e.hat,
    lamp: !!e.lamp,
    stripes: e.paint === 'stripes',
    retro: e.paint === 'retro',
    plate: !!e.plate,
    badge: e.badge === 'magnifier',
    random: e.badge === 'random',
  };
}

/** A canvas `w`×`h` CSS px with the robot at cell size `s`, feet at (w/2, feetY). */
export function robotCanvas(w: number, h: number, s: number, pose: Partial<RobotPose> = {}, feetY = h - 4, cls = ''): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  if (cls) c.className = cls;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  drawRobot(g, w / 2, feetY, s, { ...restPose(1), ...pose });
  return c;
}

/** Redraw an existing robot canvas (hangar: trying items on). */
export function redrawRobot(c: HTMLCanvasElement, w: number, h: number, s: number, pose: Partial<RobotPose>, feetY = h - 4): void {
  const g = c.getContext('2d')!;
  const dpr = c.width / w;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  drawRobot(g, w / 2, feetY, s, { ...restPose(1), ...pose });
}
