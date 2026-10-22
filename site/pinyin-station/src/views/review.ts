import { h } from '@kit/ui';
import { button, pinyin, type Context } from './common';
type Flags = { picture: boolean; audio: boolean; note: string };
const key = 'pinyin-content-review-v1';
export function reviewPanel(ctx: Context): HTMLElement {
  let flags: Record<string, Flags> = {};
  try {
    flags = JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    /* Start a fresh local review. */
  }
  const status = h('p', { 'aria-live': 'polite' });
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(flags));
      status.textContent = '核对结果已保存在这台设备';
    } catch {
      status.textContent = '本机未能保存，请先导出核对结果';
    }
  };
  const exportReview = () => {
    const rows = ctx.bank.words.filter((w) => {
      const f = flags[w.id];
      return f && (f.picture || f.audio || f.note);
    });
    const text =
      '# 拼音电台 · 家长内容核对\n\n' +
      (rows.length
        ? rows
            .map((w) => {
              const f = flags[w.id];
              return `- ${w.hanzi}（${w.display}）：${[f.picture ? '图看不懂' : '', f.audio ? '音不对' : '', f.note].filter(Boolean).join('；')}`;
            })
            .join('\n')
        : '暂未标记问题。') +
      '\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = h('a', { href: url, download: '拼音电台-家长核对.md' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const host = h(
    'section',
    { class: 'parent-card content-review' },
    h('h3', null, '词图与读音核对'),
    h('p', null, '逐条看看图、听听示范。看不明白或读音不合适就勾选，也可以写一句备注。结果只保存在本机。'),
    h(
      'p',
      { class: 'parent-note' },
      '单音节使用真人录音。多音节词优先使用已有词语示范；新增词若可用真人音节，会逐音节播放。词语示范可能使用合成语音，请核对多音字和轻声。',
    ),
    button('导出核对结果', exportReview, 'primary'),
    status,
  );
  for (const w of ctx.bank.words) {
    const f = (flags[w.id] ??= { picture: false, audio: false, note: '' });
    const picture = h('input', {
      type: 'checkbox',
      checked: f.picture,
      'aria-label': `图看不懂：${w.hanzi}`,
    });
    const audio = h('input', { type: 'checkbox', checked: f.audio, 'aria-label': `音不对：${w.hanzi}` });
    const note = h('input', {
      value: f.note,
      maxlength: 160,
      'aria-label': `备注：${w.hanzi}`,
      placeholder: '可选：哪里需要调整',
    });
    picture.onchange = () => {
      f.picture = picture.checked;
      save();
    };
    audio.onchange = () => {
      f.audio = audio.checked;
      save();
    };
    note.onchange = () => {
      f.note = note.value;
      save();
    };
    host.append(
      h(
        'article',
        { class: 'content-review-row' },
        ctx.picture(w),
        h(
          'div',
          null,
          h('b', null, w.hanzi),
          pinyin(w.display),
          h('small', null, w.source),
          button(
            w.kind === 'cloze' ? '听空格音节' : '播放示范',
            () => void ctx.word(w),
            'secondary',
            'listen',
          ),
          h('label', null, picture, '图看不懂'),
          h('label', null, audio, '音不对'),
          note,
        ),
      ),
    );
  }
  return host;
}
