/**
 * S12 家长小窗 (spec §2.1, §8.7, §8.11): reached by holding the route title for 3 s. The parent PIN
 * comes first (kit/settings hasPin/checkPin + mountKeypad); without a PIN only a pointer to 家长中心.
 * Then a light, scrollable table (the one scrolling exception — a parent area): the three parent
 * metrics (progress · average attempts per pass · special/combo use), per-level attempts / wins /
 * stars / tools, the puzzles, and "重置本游戏进度" behind two confirmations (never re-imports the
 * legacy pack, review B9).
 */
import { bindPress, icon, mountKeypad, showResult } from '@kit/ui';
import { checkPin, hasPin } from '@kit/settings';
import { EPISODES, LEVELS, PUZZLES } from '../content';
import type { AppCtx } from '../ctx';
import { play as sfx } from '../audio';

function close(scrim: HTMLElement): void { scrim.classList.add('is-leaving'); window.setTimeout(() => scrim.remove(), 220); }

export function openParent(app: AppCtx): void {
  sfx('ui-open');
  const scrim = document.createElement('div');
  scrim.className = 'xg-scrim xg-root em-parent-scrim';
  scrim.dataset.xgGame = 'match';
  document.body.append(scrim);
  if (!hasPin()) {
    scrim.innerHTML = `<div class="xg-modal em-parent em-parent--pin"><div class="xg-ribbon">家长</div>
      <p class="em-parent__msg">请先在家长中心设置密码。</p>
      <div class="xg-modal__actions"><button class="xg-btn xg-btn--secondary" data-act="close">${icon('close')}<span>关闭</span></button>
      <button class="xg-btn xg-btn--primary" data-act="go">${icon('parent')}<span>去家长中心</span></button></div></div>`;
    bindPress(scrim);
    scrim.querySelector('[data-act="close"]')!.addEventListener('click', () => close(scrim));
    scrim.querySelector('[data-act="go"]')!.addEventListener('click', () => { close(scrim); if (app.shell) app.shell.leave('/parent/'); else location.href = '/parent/'; });
    return;
  }
  scrim.innerHTML = `<div class="xg-modal em-parent em-parent--pin"><div class="xg-ribbon">家长密码</div><div class="em-parent__keypad"></div>
    <div class="xg-modal__actions"><button class="xg-btn xg-btn--secondary" data-act="close">${icon('close')}<span>关闭</span></button></div></div>`;
  bindPress(scrim);
  scrim.querySelector('[data-act="close"]')!.addEventListener('click', () => close(scrim));
  mountKeypad(scrim.querySelector<HTMLElement>('.em-parent__keypad')!, {
    maxLength: 6, placeholder: '····',
    onSubmit: (v) => { if (!checkPin(v)) return false; close(scrim); showTable(app); return true; },
  });
}

function showTable(app: AppCtx): void {
  const s = app.save.data;
  const won = LEVELS.filter((d) => (s.levels[d.id]?.wins ?? 0) > 0);
  const stars = LEVELS.reduce((a, d) => a + (s.levels[d.id]?.stars ?? 0), 0);
  const attemptsToPass = won.map((d) => s.levels[d.id]!.attempts / Math.max(1, s.levels[d.id]!.wins));
  const avgAtt = attemptsToPass.length ? attemptsToPass.reduce((a, b) => a + b, 0) / attemptsToPass.length : 0;
  const specials = Object.values(s.stats.specials).reduce((a, b) => a + b, 0);
  const combos = Object.values(s.stats.combos).reduce((a, b) => a + b, 0);
  const totalAttempts = LEVELS.reduce((a, d) => a + (s.levels[d.id]?.attempts ?? 0), 0);
  const tools = s.stats.tools ?? {};
  const cur = LEVELS.find((d) => !(s.levels[d.id]?.stars)) ?? LEVELS[LEVELS.length - 1];
  const ep = EPISODES.find((e) => e.ep === cur.ep)!;
  const rows = LEVELS.map((d) => {
    const r = s.levels[d.id];
    return `<tr><td>${d.id}</td><td>${d.teach}</td><td>${r?.attempts ?? 0}</td><td>${r?.wins ?? 0}</td><td>${r?.stars ? `${r.stars} 星` : '—'}</td><td>${r && r.failStreak >= 2 ? `连续 ${r.failStreak} 次没过` : ''}</td></tr>`;
  }).join('');
  const prow = PUZZLES.map((p) => { const r = s.puzzles[p.id]; return `<tr><td>${p.id}</td><td>${p.teach}</td><td>${r?.attempts ?? 0}</td><td>${r?.solved ? '已解开' : '—'}</td><td>${r?.maxHint ? `提示用到 H${r.maxHint}` : '没用提示'}</td></tr>`; }).join('');
  const scrim = document.createElement('div');
  scrim.className = 'em-parent-page';
  scrim.innerHTML = `<div class="em-parent-page__in">
    <header><h1>星晶消消乐 · 家长</h1><button class="xg-btn xg-btn--secondary" data-act="close">${icon('close')}<span>关闭</span></button></header>
    <section class="em-parent__metrics">
      <div><b>${ep.name} · ${cur.id}</b><span>进度：已过 ${won.length} / ${LEVELS.length} 关，${stars} 颗星</span></div>
      <div><b>${avgAtt ? avgAtt.toFixed(1) : '—'}</b><span>每次过关平均尝试${avgAtt > 3 ? '（偏多：可能偏难）' : ''}</span></div>
      <div><b>${specials} / ${combos}</b><span>做出的道具 / 组合技（共 ${totalAttempts} 次尝试）</span></div>
    </section>
    <p class="em-parent__note">休息区游戏：每关难度经机器人仿真定带宽（K 机器人胜率），失败时只提示还差什么；没有生命值、计时、购买或每日任务。证据等级 D：以放松为主，不宣称提升能力。工具使用：激光钻 ${tools.drill ?? 0}、牵引臂 ${tools.tractor ?? 0}、离子炮 ${tools.ion ?? 0}；工具库存 ${s.boosters.drill}/${s.boosters.tractor}/${s.boosters.ion}。自由星海 ${s.free.plays} 次，最长连锁 ${s.free.bestCascade}。</p>
    <h2>关卡</h2><table><thead><tr><th>关</th><th>这关教什么</th><th>尝试</th><th>过关</th><th>星</th><th>起飞加成</th></tr></thead><tbody>${rows}</tbody></table>
    <h2>星图谜题</h2><table><thead><tr><th>谜题</th><th>这道题的招</th><th>尝试</th><th>结果</th><th>提示</th></tr></thead><tbody>${prow}</tbody></table>
    <h2>重置</h2><p class="em-parent__note">清空本游戏的关卡、星星、收藏和工具（旧版存档不会被删除，也不会再次发放老玩家礼包）。</p>
    <button class="xg-btn xg-btn--secondary em-parent__reset" data-act="reset">${icon('restart')}<span>重置本游戏进度</span></button>
  </div>`;
  document.body.append(scrim);
  bindPress(scrim);
  scrim.querySelector('[data-act="close"]')!.addEventListener('click', () => scrim.remove());
  scrim.querySelector('[data-act="reset"]')!.addEventListener('click', async () => {
    const a = await showResult({ ribbon: '重置进度', title: '确定要清空本游戏的进度吗？', accentGame: 'match', actions: [{ id: 'no', label: '不了', kind: 'primary' }, { id: 'yes', label: '继续', kind: 'secondary' }] });
    if (a !== 'yes') return;
    const b = await showResult({ ribbon: '再确认一次', title: '清空后不能恢复。', accentGame: 'match', actions: [{ id: 'no', label: '不了', kind: 'primary' }, { id: 'yes', label: '清空', kind: 'secondary' }] });
    if (b !== 'yes') return;
    app.save.resetProgress();
    scrim.remove();
    app.go({ s: 'route' });
  });
}
