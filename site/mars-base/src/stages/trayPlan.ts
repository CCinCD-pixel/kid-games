/** Pure part of the tray stage (no DOM): which tray a family uses in hands-on mode, and the helper's plan (V14 / stage tests run it in Node). */
import { canonicalParts, cloneTray, emptyTray, fromValue, trayStep, type CartId, type TrayAction, type TrayState } from '@engines/manip/tray';

export type TrayMode = 'build' | 'pack' | 'add' | 'sub' | 'read';
export interface TrayCfg { mode: TrayMode; three: boolean; start: TrayState; target: number; tools: boolean; readout: 'live' | 'none'; answer: 'build' | 'int'; p: any }

const tensOf = (n: number) => Math.floor(n / 10) % 10;
/** Which tray (if any) a family uses in hands-on mode. */
export function trayConfig(famId: string, p: any, hands: boolean, live: boolean): TrayCfg | null {
  switch (famId) {
    case 'pv2.build': return { mode: 'build', three: false, start: emptyTray({ rod: 9, crystal: 19 }), target: p.n, tools: false, readout: live ? 'live' : 'none', answer: 'build', p };
    case 'pv3.build': return { mode: 'build', three: true, start: emptyTray({ box: 9, rod: 14, crystal: 19 }), target: p.n, tools: false, readout: live ? 'live' : 'none', answer: 'build', p };
    case 'pv3.pack': return { mode: 'pack', three: true, start: emptyTray({ rod: p.rods, crystal: p.loose }), target: 10 * p.rods + p.loose, tools: false, readout: 'none', answer: 'build', p };
    case 'add.tens': case 'add.carry1': case 'add.2d2d': {
      if (!hands) return null; const r = p.a + p.b; const t = fromValue(p.a); t.carts = { box: Math.floor(p.b / 100), rod: tensOf(p.b), crystal: p.b % 10 };
      return { mode: 'add', three: r >= 100, start: t, target: r, tools: false, readout: live ? 'live' : 'none', answer: 'int', p };
    }
    case 'sub.tens': case 'sub.borrow1': case 'sub.2d2d': {
      if (!hands) return null;
      return { mode: 'sub', three: p.a >= 100, start: fromValue(p.a), target: p.a - p.b, tools: true, readout: live ? 'live' : 'none', answer: 'int', p };
    }
    case 'pv3.read': case 'pv2.read': {
      if (!hands) return null; const parts = { boxes: p.h ?? 0, rods: p.t, crystals: p.o }; const n = 100 * parts.boxes + 10 * parts.rods + parts.crystals;
      const t = emptyTray(); t.carts = { box: parts.boxes, rod: parts.rods, crystal: parts.crystals };
      return { mode: 'read', three: famId === 'pv3.read', start: t, target: n, tools: false, readout: 'none', answer: 'int', p };
    }
    default: return null;
  }
}

/** The plan a helper follows from the START state (deterministic; every step is a legal tray action). */
export function trayPlan(cfg: TrayCfg): TrayAction[] {
  const out: TrayAction[] = []; let s = cloneTray(cfg.start);
  const go = (a: TrayAction): boolean => { const n = trayStep(s, a); if (!n) return false; out.push(a); s = n; return true; };
  const settle = () => { while (go({ op: 'press' }) || go({ op: 'pack' })); };
  const pour = (cart: CartId, n: number) => { for (let i = 0; i < n; i++) { go({ op: 'pour', cart }); settle(); } };
  const n = cfg.target;
  if (cfg.mode === 'build') { const p = canonicalParts(n); pour('box', p.boxes); pour('rod', p.rods); pour('crystal', p.crystals); }
  else if (cfg.mode === 'pack' || cfg.mode === 'read') { pour('rod', s.carts.rod); pour('box', s.carts.box); pour('crystal', s.carts.crystal); }
  else if (cfg.mode === 'add') { pour('box', s.carts.box); pour('rod', s.carts.rod); pour('crystal', s.carts.crystal); }
  else {
    const b = cfg.p.b as number; const bt = tensOf(b) + 10 * Math.floor(b / 100); const bo = b % 10;
    const takeRod = (): void => {
      if (go({ op: 'ship', part: 'rod' })) return;
      if (s.boxes > 0 || s.cutBoxes > 0 || s.stagedRods > 0) {
        if (s.stagedRods === 0) { if (s.cutBoxes === 0) go({ op: 'cutBox' }); go({ op: 'openBoxBundle' }); }
        go({ op: 'moveStagedRod' }); go({ op: 'ship', part: 'rod' });
      }
    };
    const takeGem = (): void => {
      if (go({ op: 'ship', part: 'crystal' })) return;
      if (s.stagedCrystals === 0) { if (s.cutBundles === 0) { if (s.rods === 0) takeRod2(); go({ op: 'cutRod' }); } go({ op: 'openBundle' }); }
      go({ op: 'moveStaged' }); go({ op: 'ship', part: 'crystal' });
    };
    const takeRod2 = (): void => { if (s.rods === 0 && (s.boxes > 0 || s.stagedRods > 0 || s.cutBoxes > 0)) { if (s.stagedRods === 0) { if (s.cutBoxes === 0) go({ op: 'cutBox' }); go({ op: 'openBoxBundle' }); } go({ op: 'moveStagedRod' }); } };
    for (let i = 0; i < Math.floor(b / 100); i++) go({ op: 'ship', part: 'box' });
    for (let i = 0; i < tensOf(b); i++) takeRod();
    void bt;
    for (let i = 0; i < bo; i++) takeGem();
    while (s.stagedCrystals > 0) go({ op: 'moveStaged' }); while (s.stagedRods > 0) { if (!go({ op: 'moveStagedRod' })) break; }
    settle();
  }
  return out;
}

