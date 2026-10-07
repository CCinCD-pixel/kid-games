/**
 * S15 家长面板 (spec §2.1, §0.2 item 9, §9.8, DoD 9): behind the kit PIN (the camp's gear, held 3 s).
 * Form-style, 20 px UI font, two columns in landscape. Shows the three parent metrics (学堂 items
 * with ≥ 1★ / 66, the highest robot beaten per mode, family games in the last 30 days) plus mastery
 * and 稳定战胜, and holds the 家规 (house rules for family games — puzzles and the ladder always play
 * the standard rules), display options, the AI level override, unlock-all, export and reset.
 */
import { downloadProgress } from '@kit/progress';
import { icon, segmented } from '@kit/ui';
import { LESSONS } from '../content';
import { CONCEPT_NAMES, academyDone, bestBeaten, mastered, steadyWin } from '../core/progress';
import { defaultSave, type SaveV1 } from '../ctrl/save';
import { OPPONENTS } from '../view/hats';
import { BaseScreen, abs, button, div } from './base';

type Settings = SaveV1['settings'];

export class ParentScreen extends BaseScreen {
  readonly name = 'parent';
  private confirmReset = false;

  back(): boolean {
    this.app.go({ name: 'home' });
    return true;
  }

  private set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.app.save.settings[k] = v;
    this.app.persist();
    this.app.play('ui-toggle-on');
    this.render();
  }

  protected render(): void {
    const portrait = this.o === 'portrait', st = this.safeTop;
    const W = portrait ? 810 : 1080, H = portrait ? 1080 : 810;
    this.el.replaceChildren();
    this.el.classList.add('mc-parent');
    const title = div('mc-h2 mc-center', `${icon('parent')}<span>家长面板 · 陆战棋</span>`);
    abs(title, { x: 100, y: st + 10, w: W - 200, h: 52 });
    this.el.appendChild(title);
    const save = this.app.save;
    const s = save.settings;

    // ---------------------------------------------------------------- metrics
    const stats = div('mc-pform');
    stats.dataset.testid = 'parent-stats';
    const n = LESSONS.reduce((a, l) => a + l.items.length, 0);
    const month = (save.family.log ?? []).filter((t) => Date.now() - t < 30 * 864e5).length;
    const modes = [['fan', '翻翻棋'], ['ming', '明棋'], ['an', '暗棋']] as const;
    const best = modes.map(([m, label]) => {
      const b = bestBeaten(save, m);
      const steady = [1, 2, 3, 4].filter((l) => steadyWin(save, m, l)).pop();
      return `<span class="mc-pstat__m"><b>${label}</b>${b ? `${b} 档 ${OPPONENTS[b - 1].name}` : '—'}${steady ? `<i>稳定 ${steady} 档</i>` : ''}</span>`;
    }).join('');
    const concepts = Object.keys(CONCEPT_NAMES);
    const mast = concepts.filter((c) => mastered(save, c));
    const tag = save.tagStats.total ? `${Math.round((save.tagStats.correct / save.tagStats.total) * 100)}%（${save.tagStats.games} 盘）` : '—';
    stats.innerHTML = `
      <h3>孩子的进度</h3>
      <div class="mc-pstat"><span>学堂（题 ≥1★）</span><b data-testid="metric-academy">${academyDone(save)} / ${n}</b></div>
      <div class="mc-pstat is-col"><span>天梯最高战胜</span><div class="mc-pstat__modes" data-testid="metric-ladder">${best}</div></div>
      <div class="mc-pstat"><span>家庭对局（近 30 天）</span><b data-testid="metric-family">${month} 盘</b><i>合计 ${save.family.games} 盘（孩子胜 ${save.family.kidWins} · 爸爸胜 ${save.family.dadWins} · 和 ${save.family.draws}）；实体棋裁判 ${save.family.physicalVerdicts} 次</i></div>
      <div class="mc-pstat is-col"><span>掌握的概念 ${mast.length} / ${concepts.length}</span><div class="mc-pstat__chips">${concepts.map((c) => `<em class="${mast.includes(c) ? 'is-on' : ''}">${CONCEPT_NAMES[c]}</em>`).join('')}</div></div>
      <div class="mc-pstat"><span>暗棋侦察便签猜中</span><b>${tag}</b></div>`;

    // ---------------------------------------------------------------- settings
    const form = div('mc-pform');
    form.innerHTML = '<h3>家规与设置</h3>';
    const row = (label: string, note: string, control: HTMLElement): void => {
      const r = div('mc-prow');
      r.innerHTML = `<span class="mc-prow__l"><b>${label}</b>${note ? `<i>${note}</i>` : ''}</span>`;
      r.appendChild(control);
      form.appendChild(r);
    };
    const seg = <T extends string | number>(id: string, opts: Array<[T, string]>, value: T, onChange: (v: T) => void): HTMLElement => {
      const el = div('mc-pseg');
      el.dataset.testid = id;
      segmented(el, { options: opts.map(([v, l]) => ({ id: String(v), label: l })), value: String(value), onChange: (v) => onChange(opts.find((o) => String(o[0]) === v)![0]) });
      return el;
    };
    row('棋子数字角标', '关掉更像家里的实体棋', seg('set-numbers', [[1, '开'], [0, '关']], s.numberBadges ? 1 : 0, (v) => this.set('numberBadges', v === 1)));
    row('参谋提醒', '自动 = 1–2 档对手开', seg('set-coach', [['auto', '自动'], ['on', '开'], ['off', '关']], s.coachAlerts, (v) => this.set('coachAlerts', v)));
    row('暗棋参谋笔记', '对方子上的推理角标', seg('set-notes', [[1, '开'], [0, '关']], s.coachNotes ? 1 : 0, (v) => this.set('coachNotes', v === 1)));
    row('家规：翻翻棋扛旗', '标准 = 先挖光地雷（对战和家庭局都用）', seg('set-fanflag', [['standard', '标准'], ['easy', '随时能扛']], s.fanFlagRule, (v) => this.set('fanFlagRule', v)));
    row('家规：不碰子判和', '明棋家庭局', seg('set-quiet', [[40, '40 步'], [80, '80 步'], [120, '120 步']], s.familyQuiet, (v) => this.set('familyQuiet', v)));
    row('家规：来回走最多', '同一个子', seg('set-shuttle', [[3, '3 次'], [4, '4 次'], [5, '5 次']], s.shuttleMax, (v) => this.set('shuttleMax', v)));
    row('机器人强度', '覆盖天梯对手的档位', seg('set-ai', [[0, '不覆盖'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], s.aiOverride ?? 0, (v) => this.set('aiOverride', v === 0 ? null : (v as 1 | 2 | 3 | 4))));
    row('全部打开', '学堂、天梯、残局都能直接进', seg('set-unlock', [[0, '关'], [1, '开']], s.unlockAll ? 1 : 0, (v) => this.set('unlockAll', v === 1)));
    row('音乐', '营地环境曲', seg('set-music', [[1, '开'], [0, '关']], s.music ? 1 : 0, (v) => this.set('music', v === 1)));
    const name = document.createElement('input');
    name.className = 'mc-pinput';
    name.value = save.family.dadName;
    name.maxLength = 6;
    name.dataset.testid = 'set-dadname';
    name.addEventListener('change', () => {
      save.family.dadName = name.value.trim().slice(0, 6) || '爸爸';
      this.app.persist();
    });
    row('对手的名字', '和爸爸下时显示', name);

    const data = div('mc-prow is-btns');
    data.append(
      button('xg-btn xg-btn--secondary', `${icon('download')}<span>导出存档</span>`, () => {
        this.app.persist();
        downloadProgress();
      }, 'export'),
      button(`xg-btn ${this.confirmReset ? 'xg-btn--accent' : 'xg-btn--secondary'}`, `${icon('restart')}<span>${this.confirmReset ? '确定清空本游戏进度？' : '清空本游戏进度'}</span>`, () => this.reset(), 'reset'),
    );
    form.appendChild(data);

    if (portrait) {
      abs(stats, { x: 24, y: st + 66, w: 762, h: 318 });
      abs(form, { x: 24, y: st + 394, w: 762, h: H - st - 394 - 12 });
    } else {
      abs(stats, { x: 16, y: st + 66, w: 420, h: H - st - 66 - 16 });
      abs(form, { x: 452, y: st + 66, w: 612, h: H - st - 66 - 16 });
    }
    this.el.append(stats, form);
  }

  private reset(): void {
    if (!this.confirmReset) {
      this.confirmReset = true;
      this.app.play('ui-open');
      this.render();
      return;
    }
    const keep = this.app.save.settings;
    const fresh = defaultSave();
    fresh.settings = keep;
    fresh.firstRun.ft = true;
    this.app.save = fresh;
    this.app.persist();
    this.app.hub();
    this.app.play('ui-close');
    this.confirmReset = false;
    this.render();
  }
}
