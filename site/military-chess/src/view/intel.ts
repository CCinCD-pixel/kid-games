/**
 * 情报板 (spec §2.3): all icons, each cell readable by a tap.
 *  - 明棋: the pieces each side has lost (two rows of mini tiles)
 *  - 翻翻棋: the opponent's pieces still face down (12 cells: tile + count), first cell = their mines
 *    left (3 mine icons, one slashed per mine gone), second = "what can dig" (shovel × engineers,
 *    bomb × bombs)
 * Everything shown is public information.
 */
import { BOMB, DISPLAY_ORDER, ENG, MINE, NAMES } from '../core/pieces';
import type { GameState } from '../core/state';
import { mcIcon } from './icons';

export interface IntelHandlers {
  onCell(line: string, wordId?: string): void;
}

export class Intel {
  readonly el: HTMLDivElement;
  constructor(private h: IntelHandlers) {
    this.el = document.createElement('div');
    this.el.className = 'mc-panel mc-intel-panel';
    this.el.dataset.testid = 'intel';
  }

  /**
   * The cell a tap meant. On phones the cells are too small to be tap targets of their own (≥ 44 px rule):
   * they ignore pointers and the whole panel takes the tap, which goes to the cell nearest the finger.
   */
  private cellFor(e: MouseEvent): HTMLElement | null {
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (hit) return hit;
    let best: HTMLElement | null = null, bestD = Infinity;
    for (const c of this.el.querySelectorAll<HTMLElement>('[data-cell]')) {
      const r = c.getBoundingClientRect();
      const d = (e.clientX - (r.left + r.width / 2)) ** 2 + (e.clientY - (r.top + r.height / 2)) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** 明棋 (and family 翻翻棋 fallback): pieces down per side */
  renderLosses(s: GameState, names: [string, string], cols: number): void {
    this.el.className = 'mc-panel mc-intel-panel is-trays';
    const rows: string[] = [];
    for (const side of [1, 0]) {
      const lost: number[] = [];
      for (let p = 0; p < s.np; p++) if (s.pside[p] === side && !s.palive[p] && (s.mode !== 'fan' || s.pup[p] || true)) lost.push(s.ptype[p]);
      lost.sort((a, b) => b - a);
      // readable chips (QA r1: 20×12 px mini tiles were unreadable): one per kind, "排长 ×2", side colour
      const kinds = [...new Set(lost)];
      const chips = kinds.map((t) => {
        const n = lost.filter((x) => x === t).length;
        return `<span class="mc-cap" data-side="${side}">${NAMES[t]}${n > 1 ? `<b>×${n}</b>` : ''}</span>`;
      }).join('');
      const empty = lost.length ? '' : `<span class="mc-tray__empty">${mcIcon('shield')}</span>`;
      // many kinds down (QA r2: the 3rd row was clipped): the label joins the chip flow, chips shrink
      const dense = kinds.length > 6 ? ' is-dense' : '';
      rows.push(`<div class="mc-tray${lost.length ? '' : ' is-empty'}${dense}" data-side="${side}"><span class="mc-tray__label"><i style="background:${side ? '#2d5ba3' : '#b8342a'}"></i>${names[side]}下场 ${lost.length}</span>${chips}${empty}</div>`);
    }
    this.el.innerHTML = rows.join('');
    this.el.style.setProperty('--cols', String(cols));
    this.el.onclick = () => this.h.onCell('mc.intel.ming');
  }

  /**
   * 暗棋: the opponent's 25-piece list (12 kinds × count); only pieces CERTAINLY down are struck out
   * (`dead` = per type, from the child's knowledge), never a guess.
   */
  renderAn(foe: number, counts: readonly number[], dead: readonly number[], layout: { cols: number; compact?: boolean }): void {
    this.el.className = `mc-panel mc-intel-panel is-grid is-an${layout.compact ? ' is-compact' : ''}`;
    const cells: string[] = [];
    for (const t of DISPLAY_ORDER) {
      const total = counts[t];
      const gone = Math.min(total, dead[t]);
      const left = total - gone;
      const strikes = gone ? `<span class="mc-intel__x">${'<i></i>'.repeat(gone)}</span>` : '';
      cells.push(`<button class="mc-intel__cell${left ? '' : ' is-zero'}" data-cell="t${t}" data-left="${left}" aria-label="${NAMES[t]} ${left}"><span class="mc-cap" data-side="${foe}">${NAMES[t]}</span><b class="mc-intel__n">${left}</b>${strikes}</button>`);
    }
    this.el.innerHTML = `<div class="mc-intel" style="grid-template-columns: repeat(${layout.cols}, 1fr)">${cells.join('')}</div>`;
    this.el.onclick = (e) => {
      const c = this.cellFor(e);
      if (!c) return;
      this.h.onCell('mc.intel.an', `mc.w.${NAMES[Number(c.dataset.cell!.slice(1))]}`);
    };
  }

  /** 翻翻棋: what the opponent (`foe` colour) still has face down + mines left + my diggers */
  renderFan(s: GameState, foe: number, me: number, layout: { cols: number; compact?: boolean }): void {
    this.el.className = `mc-panel mc-intel-panel is-grid${layout.compact ? ' is-compact' : ''}`;
    const hidden = new Array(12).fill(0);
    let foeMines = 0, myEng = 0, myBomb = 0;
    for (let p = 0; p < s.np; p++) {
      if (s.pside[p] === foe && s.palive[p] && s.ptype[p] === MINE) foeMines++;
      if (s.pside[p] === me && s.palive[p] && s.ptype[p] === ENG) myEng++;
      if (s.pside[p] === me && s.palive[p] && s.ptype[p] === BOMB) myBomb++;
      if (s.pside[p] === foe && s.palive[p] && !s.pup[p]) hidden[s.ptype[p]]++;
    }
    const cells: string[] = [];
    const mineIcons = [0, 1, 2].map((k) => `<span class="mc-minei${k >= foeMines ? ' is-gone' : ''}">${mcIcon('mine')}</span>`).join('');
    cells.push(`<button class="mc-intel__cell is-mines" data-cell="mines" aria-label="地雷" style="color:${foe ? '#2d5ba3' : '#b8342a'}">${mineIcons}</button>`);
    cells.push(`<button class="mc-intel__cell is-tools" data-cell="tools" aria-label="工兵 ${myEng} 炸弹 ${myBomb}"><span class="mc-tool">${mcIcon('shovel')}<b>${myEng}</b></span><span class="mc-tool">${mcIcon('bomb')}<b>${myBomb}</b></span></button>`);
    for (const t of DISPLAY_ORDER) {
      if (t === MINE) continue;
      const n = hidden[t];
      cells.push(`<button class="mc-intel__cell${n ? '' : ' is-zero'}" data-cell="t${t}" aria-label="${NAMES[t]} ${n}"><span class="mc-cap" data-side="${foe}">${NAMES[t]}</span><b class="mc-intel__n">${n}</b></button>`);
    }
    this.el.innerHTML = `<div class="mc-intel" style="grid-template-columns: repeat(${layout.cols}, 1fr)">${cells.join('')}</div>`;
    this.el.onclick = (e) => {
      const c = this.cellFor(e);
      if (!c) return;
      const id = c.dataset.cell!;
      if (id === 'mines') this.h.onCell('mc.intel.fan.mines');
      else if (id === 'tools') this.h.onCell('mc.intel.fan.tools');
      else this.h.onCell('mc.intel.fan.count', `mc.w.${NAMES[Number(id.slice(1))]}`);
    };
  }
}
