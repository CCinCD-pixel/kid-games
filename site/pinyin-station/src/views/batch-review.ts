/**
 * Quick review mode for the parent: one recording at a time, big buttons, labels are blind (no AI/local verdict is shown
 * while labelling). Labels feed the same ledger as the review list, and double as the calibration set.
 */
import { h } from '@kit/ui';
import { calibration } from '../speech/calibration';
import { localCalibration } from '../score/calibration-local';
import { recordings, type Recording } from '../speech/recordings';
import { displayPinyin } from '../domain/pinyin';
import { button, type Context } from './common';
import { downloadExport } from './export';
import { applyParentLabel, markUnsure, type ParentLabel } from './labelling';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
export function batchReviewPanel(ctx: Context, onClose: () => void): HTMLElement {
  const sheet = h('section', { class: 'batch-sheet', role: 'dialog', 'aria-label': '快速点评' });
  let queue: Recording[] = [],
    all: Recording[] = [],
    done = 0,
    current: Recording | null = null;
  const render = () => {
    const stats = h('div', { class: 'batch-stats' });
    const ai = calibration(all);
    const local = localCalibration(all);
    const labelled = all.filter((r) => r.parent).length;
    stats.append(
      h('p', null, `家长已标注 ${labelled} 条 · 拿不准 ${all.filter((r) => r.unsure).length} 条 · 共 ${all.length} 条（目标：约 300 条再评估）`),
      h('p', { class: 'parent-note' }, `AI（腾讯）与家长：一致率 ${pct(ai.agreement.rate)}（可比 ${ai.agreement.compared} 条）。本地声调与家长：说“不同”时家长同意 ${pct(local.ppvDiffers)}，读对被说不同 ${pct(local.falseRejectRate)}，覆盖 ${pct(local.coverage)}（${local.labelledTone} 条可比）。两套数字分开统计。`),
    );
    const head = h('div', { class: 'batch-head' }, h('h2', null, '快速点评'), button('关闭', onClose, 'quiet', 'back'));
    if (!current) {
      sheet.replaceChildren(
        head,
        stats,
        h('p', { class: 'batch-done' }, done ? `这一轮点评了 ${done} 条，辛苦啦。` : '没有待点评的录音了。'),
        button('导出标注集（ZIP，仅本机下载）', () => void downloadExport(all), 'primary', 'next'),
        h('p', { class: 'parent-note' }, '包含孩子的声音，只在本机保管，不要提交仓库。再用 tools/export-to-lab.mjs 转成实验脚本能读的格式。'),
      );
      return;
    }
    const r = current;
    const word = [...ctx.bank.words, ...ctx.save.customWords].find((w) => w.id === r.wordId);
    const label = r.meta?.target ? displayPinyin(r.meta.target.syllable) : (word?.display ?? displayPinyin(r.wordId));
    const wrongParts = h(
      'div',
      { class: 'batch-parts', hidden: true },
      h('p', null, '哪里不对？'),
      ...(['initial', 'final', 'tone'] as const).map((part) => button({ initial: '声母', final: '韵母', tone: '声调' }[part], () => void choose(part), 'secondary')),
    );
    const choose = async (value: ParentLabel | 'unsure') => {
      buttons.forEach((b) => (b.disabled = true));
      try {
        if (value === 'unsure') await markUnsure(r);
        else await applyParentLabel(ctx, r, value);
        done++;
        queue.shift();
        current = queue[0] ?? null;
        render();
      } catch {
        buttons.forEach((b) => (b.disabled = false));
        status.textContent = '未保存，请重试';
      }
    };
    const status = h('p', { 'aria-live': 'polite' });
    const right = button('读对', () => void choose('correct'), 'primary', 'next');
    const wrong = button('读错', () => (wrongParts.hidden = !wrongParts.hidden), 'secondary', 'hint');
    const unsure = button('拿不准', () => void choose('unsure'), 'quiet', 'listen');
    const buttons = [right, wrong, unsure, ...wrongParts.querySelectorAll('button')];
    sheet.replaceChildren(
      head,
      h('p', { class: 'batch-progress' }, `第 ${done + 1} / ${done + queue.length} 条`),
      h('div', { class: 'batch-target' }, h('small', null, '要读的是'), h('b', { class: 'pinyin' }, label), h('small', null, new Date(r.at).toLocaleString('zh-CN'))),
      h('div', { class: 'batch-play' }, button('回听孩子的', () => void ctx.replay(r.blob), 'secondary', 'replay'), button('听示范', () => void (r.meta?.target ? ctx.syllable(r.meta.target.syllable) : word ? ctx.word(word) : undefined), 'secondary', 'listen')),
      h('div', { class: 'batch-judge' }, right, wrong, unsure),
      wrongParts,
      status,
      button('先跳过这条', () => {
        queue.push(queue.shift()!);
        current = queue[0];
        render();
      }, 'quiet'),
      stats,
    );
  };
  void recordings().then((rows) => {
    all = rows;
    queue = rows.filter((r) => !r.parent && !r.unsure && !r.lab).sort((a, b) => b.at - a.at);
    current = queue[0] ?? null;
    render();
  });
  return sheet;
}
