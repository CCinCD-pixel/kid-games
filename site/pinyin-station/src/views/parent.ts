import { h } from '@kit/ui';
import { checkPin, hasPin, isValidPin, setPin } from '@kit/settings';
import { pinyin as annotate } from 'pinyin-pro';
import { parseSyllable, displayPinyin } from '../domain/pinyin';
import { bookOptions, currentBook, stationOfBook } from '../domain/book';
import { mastery, recordAttempt } from '../domain/learning';
import { historyArchive, recordings, savePicture, saveRecording } from '../speech/recordings';
import { reviseAttempt } from '../domain/history';
import { button, type Context } from './common';
import { labPanel } from './lab';
import { batchReviewPanel } from './batch-review';
import { downloadExport } from './export';
import { reviewPanel } from './review';
import { pageReport } from './pagereport';
import { familyToken, saveFamilyToken, checkConnection } from '../speech/family';
import type { Word } from '../domain/types';

export function parentView(ctx: Context): HTMLElement {
  const host = h('section', { class: 'parent-panel', 'aria-label': '电台家长页' });
  let adultChecked = false;
  // First visit (no PIN yet): a child must not be able to set the PIN and lock the parents out, so a small
  // grown-up question comes first and the PIN screen says who it is for.
  const adultQuestion = () => {
    const a = 6 + Math.floor(Math.random() * 4),
      b = 12 + Math.floor(Math.random() * 8);
    const answer = h('input', {
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        maxlength: 4,
        'aria-label': '算术答案',
      }),
      status = h('p', { 'aria-live': 'polite' });
    host.replaceChildren(
      h(
        'form',
        {
          class: 'pin-gate',
          onsubmit: (event: Event) => {
            event.preventDefault();
            if (answer.value.trim() === String(a * b)) {
              adultChecked = true;
              gate();
            } else {
              answer.value = '';
              status.textContent = '再算一算';
            }
          },
        },
        h('h2', null, '家长专区'),
        h('p', null, '这里是爸爸妈妈设置和查看的地方。请先回答：'),
        h('p', { class: 'adult-question' }, `${a} × ${b} = ？`),
        answer,
        status,
        h('button', { class: 'station-btn station-btn--primary', type: 'submit' }, '继续'),
        button('回到电台', ctx.home, 'quiet'),
      ),
    );
  };
  const gate = () => {
    if (!hasPin() && !adultChecked) return adultQuestion();
    const pin = h('input', {
        type: 'password',
        inputmode: 'numeric',
        autocomplete: 'off',
        maxlength: 6,
        'aria-label': hasPin() ? '家长 PIN' : '设置家长 PIN',
      }),
      status = h('p', { 'aria-live': 'polite' });
    let first = '';
    const form = h(
      'form',
      {
        class: 'pin-gate',
        onsubmit: (event: Event) => {
          event.preventDefault();
          const value = pin.value;
          pin.value = '';
          if (hasPin()) {
            if (checkPin(value)) {
              sessionStorage.setItem('kg:parent:unlocked', String(Date.now()));
              show();
            } else status.textContent = 'PIN 不匹配，请再试一次';
          } else if (!isValidPin(value)) status.textContent = '请设置 4–6 位数字';
          else if (!first) {
            first = value;
            status.textContent = '请再输入一次确认';
          } else if (first === value) {
            setPin(value);
            sessionStorage.setItem('kg:parent:unlocked', String(Date.now()));
            show();
          } else {
            first = '';
            status.textContent = '两次输入不同，请重新设置';
          }
        },
      },
      h('h2', null, hasPin() ? '家长来接班' : '设置家长 PIN'),
      h('p', null, hasPin() ? '与星港家长中心共用 PIN' : '给爸爸妈妈用的 4–6 位数字，设置后孩子就进不来这里。与星港家长中心共用。'),
      pin,
      status,
      h('button', { class: 'station-btn station-btn--primary', type: 'submit' }, '进入家长页'),
      button('回到电台', ctx.home, 'quiet'),
    );
    host.replaceChildren(form);
  };
  function field(label: string, control: HTMLElement) {
    return h('label', { class: 'parent-field' }, h('span', null, label), control);
  }
  function show() {
    const s = ctx.save;
    const header = h(
      'div',
      { class: 'parent-heading' },
      h('div', null, h('small', null, '仅家长可见'), h('h2', null, '电台值班室')),
      button('回到电台', ctx.home, 'secondary', 'back'),
    );
    const lesson = h(
      'select',
      { 'aria-label': '当前课' },
      // By BOOK lesson (what the teacher says): book 9 (y w) is station 8, book 10-13 are stations 9-12, book 14 waits.
      bookOptions(ctx.bank).map((o) =>
        h('option', { value: o.book, selected: o.book === currentBook(s, ctx.bank), disabled: o.disabled }, o.label),
      ),
    );
    lesson.onchange = () => {
      s.settings.book = Number(lesson.value);
      s.settings.lesson = stationOfBook(s.settings.book);
      ctx.persist();
    };
    const scaffold = h(
      'select',
      { 'aria-label': '拼搭帮助' },
      [
        ['initial', '先找声母'],
        ['final', '再找韵母'],
        ['tone', '再选声调'],
        ['full', '自己拼完整音节'],
      ].map(([value, label]) => h('option', { value, selected: value === s.settings.scaffold }, label)),
    );
    scaffold.onchange = () => {
      s.settings.scaffold = scaffold.value as typeof s.settings.scaffold;
      ctx.persist();
    };
    const ai = h('input', { type: 'checkbox', checked: s.settings.ai, 'aria-label': '允许腾讯评测' });
    ai.onchange = () => {
      s.settings.ai = ai.checked;
      ctx.persist();
    };
    const token = h('input', {
      type: 'password',
      autocomplete: 'off',
      'aria-label': '家庭口令',
      placeholder: '保存在本机，冷启动后仍有效',
    });
    try {
      token.value = familyToken();
    } catch {
      /* Storage warning is shown below. */
    }
    token.onchange = () => {
      try {
        saveFamilyToken(token.value);
      } catch {
        connection.textContent = '口令未能保存，请检查本机存储';
      }
    };
    const connection = h('p', { 'aria-live': 'polite' });
    const check = button(
      '连通性自检',
      async () => {
        check.disabled = true;
        connection.textContent = '正在检查签名服务';
        connection.textContent = await checkConnection(token.value.trim());
        check.disabled = false;
      },
      'secondary',
    );
    const strict = h(
      'select',
      { 'aria-label': '评测严格度' },
      [
        ['gentle', '宽松'],
        ['balanced', '适中'],
        ['precise', '精细'],
      ].map(([value, label]) => h('option', { value, selected: value === s.settings.strictness }, label)),
    );
    strict.onchange = () => {
      s.settings.strictness = strict.value as typeof s.settings.strictness;
      ctx.persist();
    };
    const config = h(
      'section',
      { class: 'parent-card' },
      h('h3', null, '练习设置'),
      h(
        'p',
        null,
        '课程按听辨 → 拼合 → 理解 → 拼写 → 运用递进；试卷只用于安排薄弱点。选择老师已讲到的档位，前面内容会按复习间隔轮换。',
      ),
      field('老师讲到这里', lesson),
      field('拼搭帮助', scaffold),
      h(
        'p',
        null,
        '以拼音能力为主，教材只用来控制字母范围；拼音城堡里的纯拼音词也可以录入。补充词若没有现成词语录音，会用设备的中文词语语音；多音字需要家长核对。',
      ),
    );
    const consent = h(
      'section',
      { class: 'parent-card' },
      h('h3', null, '语音评测 · 试运行'),
      h(
        'p',
        null,
        '开启后，录音从设备直达腾讯云；服务端只签名。不开启时使用本地跟读。最近 500 条录音仅保存在本机。',
      ),
      field('允许上传录音到腾讯评测', ai),
      field('家庭口令', token),
      h('p', { class: 'parent-note' }, '口令只保存在本机。自检不上传音频，会使用一次本日签名额度。'),
      check,
      connection,
      field('提示严格度', strict),
      h(
        'p',
        { class: 'parent-note' },
        'AI 和孩子自评均不计入掌握。家长回听改判后才记入“读”的学习记录。音调检测无效时不判声调。',
      ),
    );
    const local = h('input', { type: 'checkbox', checked: s.settings.localScore === true, 'aria-label': '本地评分（试用）' });
    local.onchange = () => {
      s.settings.localScore = local.checked;
      ctx.persist();
    };
    const localCard = h(
      'section',
      { class: 'parent-card' },
      h('h3', null, '本地评分 · 试用'),
      h(
        'p',
        null,
        '孩子读完单个音节后，在设备上用音高曲线比较声调，并画出“我的声音”和“示范”两条曲线。声音不上传，也不需要网络。',
      ),
      field('开启本地评分（试用）', local),
      h(
        'p',
        { class: 'parent-note' },
        '默认关闭。目前只比较声调的升降形状，没听清时只会说“再试一次”，不会判错；结果不计入掌握，也不影响复习安排，等家长抽查校准后再决定。',
      ),
    );
    const keep = h('input', { type: 'checkbox', checked: s.settings.keepRecordings !== false, 'aria-label': '保存录音到本机' });
    keep.onchange = () => {
      s.settings.keepRecordings = keep.checked;
      ctx.persist();
    };
    const keepCard = h(
      'section',
      { class: 'parent-card' },
      h('h3', null, '录音保存与点评'),
      h('p', null, '孩子读完后，录音和读音目标、音高曲线、设备信息会一起留在本机（最近 500 条），方便家长回听点评。不上传。'),
      field('保存录音到本机', keep),
      button('快速点评（一条一条听）', () => host.append(batchReviewPanel(ctx, () => host.querySelector('.batch-sheet')?.remove())), 'primary', 'play'),
      button('导出标注集（ZIP）', async () => void (await downloadExport(await recordings())), 'secondary', 'next'),
      h('p', { class: 'parent-note' }, '导出文件含孩子的声音，只保存在本机，不要提交仓库。'),
    );
    const weak = Object.entries(s.confusions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const progress = h(
      'section',
      { class: 'parent-card' },
      h('h3', null, '练习足迹'),
      ...(!ctx.storageOkay()
        ? [h('p', { role: 'alert' }, '练习记录未能保存，请检查设备剩余空间并备份本机数据。')]
        : []),
      h(
        'p',
        null,
        `本周开播 ${s.dates.filter((at) => Date.now() - at < 7 * 86400000).length} 次 · 已连接词语 ${ctx.bank.words.filter((w) => mastery(s, `word:${w.id}`)).length} 个 · 待接通信号 ${Object.values(s.atoms).filter((a) => a.needsReview).length} 项`,
      ),
      h('h3', null, '今天可以这样夸'),
      h(
        'p',
        { class: 'parent-praise' },
        s.history.some((a) => a.correct && a.judge === 'deterministic')
          ? '“你把声音和图画连起来了，还愿意自己试一试。”'
          : '“你愿意开播，把声音送到星港。”',
      ),
      h('h3', null, '可以一起试试'),
      ...(weak.length
        ? weak.map(([pair]) =>
            h(
              'p',
              null,
              ctx.bank.confusions.find((c) => c.pair.join('|') === pair)?.tip ??
                `把 ${pair.replace('|', ' 和 ')} 放在一起听听`,
            ),
          )
        : [h('p', null, '拿小纸条试试 b / p 和 d / t；捏住鼻子试试 l / n。每次只找一个小变化。')]),
    );
    const add = h('section', { class: 'parent-card' }, h('h3', null, '补充练习词'));
    const hanzi = h('input', { maxlength: 12, 'aria-label': '练习词汉字', placeholder: '例如：木马' }),
      syllables = h('input', { 'aria-label': '数字声调拼音', placeholder: '例如：mu4 ma3' }),
      source = h(
        'select',
        { 'aria-label': '练习词来源' },
        ['试卷', '作业', '拼音城堡', '老师反馈'].map((x) => h('option', { value: x }, x)),
      ),
      image = h('input', {
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        'aria-label': '练习词图片',
      }),
      chosen = h(
        'select',
        { 'aria-label': '选择图库' },
        h('option', { value: '' }, '请选择图片'),
        ctx.bank.words
          .filter((w) => !['sentence', 'cloze'].includes(w.kind))
          .map((w) => h('option', { value: w.picture }, w.hanzi)),
      ),
      message = h('p', { 'aria-live': 'polite' });
    hanzi.oninput = () => {
      const text = hanzi.value.trim();
      const known = ctx.bank.words.find((w) => w.hanzi === text);
      syllables.value = known
        ? known.syllables.join(' ')
        : annotate(text, { toneType: 'num', type: 'array' })
            .map((x) => (/\d$/.test(x) ? x.replaceAll('ü', 'v') : x + '0'))
            .join(' ');
      chosen.value = known?.picture ?? '';
    };
    const form = h(
      'form',
      {
        onsubmit: async (event: Event) => {
          event.preventDefault();
          if (s.customWords.length >= 100) {
            message.textContent = '本机已保存 100 个补充词，请先复习已有词。';
            return;
          }
          const text = hanzi.value.trim(),
            ids = syllables.value.trim().split(/\s+/);
          if (
            !/^[\u3400-\u9fff]{1,12}$/.test(text) ||
            !ids.every((id) => parseSyllable(id)) ||
            ids.length !== text.length
          ) {
            message.textContent = '请核对汉字和数字声调拼音，轻声用 0，ü 用 v';
            return;
          }
          const id = `family-${crypto.randomUUID()}`,
            file = image.files?.[0];
          if (!file && !chosen.value) {
            message.textContent = '请为这个词选择图库图片或本机图片';
            return;
          }
          if (file && file.size > 5 * 1024 * 1024) {
            message.textContent = '请选择小于 5 MB 的图片';
            return;
          }
          try {
            if (file) await savePicture(id, file);
            const word: Word = {
              id,
              hanzi: text,
              syllables: ids,
              display: ids.map(displayPinyin).join(' '),
              picture: file ? `local:${id}` : chosen.value,
              kind: 'noun',
              lesson: s.settings.lesson,
              beyond: true,
              source: source.value,
              custom: true,
              semanticGroup: ctx.bank.words.find((w) => w.picture === chosen.value)?.semanticGroup,
            };
            s.customWords.push(word);
            recordAttempt(s, {
              id: `import:${id}`,
              skill: `word:${id}:spell`,
              kind: 'F',
              correct: false,
              judge: 'parent',
              session: s.sessions,
              at: Date.now(),
            });
            ctx.persist();
            message.textContent = '已加入待接通信号，图片保存在本机';
            form.reset();
          } catch {
            message.textContent = '本机存储暂不可用，请稍后再试';
          }
        },
      },
      field('汉字', hanzi),
      field('拼音（可修改）', syllables),
      field('来源', source),
      field('图库', chosen),
      field('或选本机图片', image),
      h('button', { type: 'submit', class: 'station-btn station-btn--primary' }, '加入练习'),
      message,
    );
    add.append(form);
    const review = h(
      'section',
      { class: 'parent-card recording-list' },
      h('h3', null, '回听与改判'),
      h('p', null, '优先查看 AI 提示再听听的录音；改判会重建学习记录，不叠加次数。'),
    );
    let corrections = Promise.resolve();
    void recordings()
      .then((rows) => {
        if (!rows.length) {
          review.append(h('p', null, '还没有录音。孩子在节目里点麦克风后，录音会留在这里。'));
          return;
        }
        rows.sort(
          (a, b) =>
            new Date(b.at).setHours(0, 0, 0, 0) - new Date(a.at).setHours(0, 0, 0, 0) ||
            Number(b.verdict?.level === 1) - Number(a.verdict?.level === 1) ||
            b.at - a.at,
        );
        let day = '';
        const comparison = (r: (typeof rows)[number]) =>
          r.parent && r.verdict?.status === 'judged' && (r.verdict.level !== 1) !== (r.parent === 'correct')
            ? ' · AI 与家长判断不同'
            : '';
        for (const r of rows) {
          const date = new Date(r.at).toLocaleDateString('zh-CN');
          if (date !== day) {
            review.append(h('h4', null, date));
            day = date;
          }
          const word = [...ctx.bank.words, ...s.customWords].find((w) => w.id === r.wordId),
            label = word?.display ?? displayPinyin(r.wordId),
            status = h('span', null, (r.parent ? '家长已标注' : '待回听') + comparison(r));
          const judgement = h(
            'select',
            { 'aria-label': `改判 ${label}` },
            [
              ['', '选择家长判断'],
              ['correct', '读得清楚'],
              ['initial', '再练声母'],
              ['final', '再练韵母'],
              ['tone', '再练声调'],
            ].map(([value, text]) => h('option', { value, selected: value === r.parent }, text)),
          );
          judgement.onchange = () => {
            if (!judgement.value) return;
            const parent = judgement.value as typeof r.parent;
            judgement.disabled = true;
            corrections = corrections
              .then(async () => {
                r.parent = parent;
                await saveRecording(r);
                if (!r.lab)
                  await reviseAttempt(
                    s,
                    {
                      id: r.id,
                      skill: r.skill,
                      kind: r.kind,
                      correct: r.parent === 'correct',
                      judge: 'parent',
                      session: r.session,
                      at: r.at,
                      assisted: r.assisted,
                    },
                    historyArchive,
                  );
                ctx.persist();
                status.textContent = '家长已标注' + comparison(r);
              })
              .catch(() => {
                status.textContent = '未保存，请重试';
              })
              .finally(() => {
                judgement.disabled = false;
              });
          };
          review.append(
            h(
              'article',
              { class: 'recording-row' },
              h(
                'div',
                null,
                h('b', null, label),
                h('small', null, new Date(r.at).toLocaleString('zh-CN')),
                h('small', null, r.lab ? '成人实验样本 · 不计孩子进度' : '日常练习录音'),
                h(
                  'small',
                  null,
                  'AI 试运行：' +
                    (r.verdict
                      ? (['initial', 'final', 'tone'] as const)
                          .map((dim) => {
                            const d = r.verdict?.dims[dim];
                            return `${{ initial: '声母', final: '韵母', tone: '声调' }[dim]} ${d ? (d.ok ? '提示通过' : '建议再听') + (d.score === undefined ? '' : `（${Math.round(d.score)}）`) : '未确认'}`;
                          })
                          .join(' · ')
                      : '未请求或未完成'),
                ),
                status,
              ),
              button('回听', () => void ctx.replay(r.blob), 'secondary', 'replay'),
              judgement,
            ),
          );
        }
      })
      .catch(() => review.append(h('p', null, '本机录音存储暂不可用；其他练习仍可使用。')));
    host.replaceChildren(
      header,
      h(
        'div',
        { class: 'parent-scroll' },
        ...(location.pathname.includes('/review/') ? [reviewPanel(ctx)] : []),
        button(
          '核对全部词图和读音',
          () => {
            location.href = '/pinyin-station/review/';
          },
          'secondary',
        ),
        config,
        consent,
        localCard,
        keepCard,
        progress,
        ...pageReport(ctx),
        add,
        review,
        ...(location.pathname.includes('/lab/') ? [labPanel(ctx)] : []),
      ),
    );
  }
  const until = Number(sessionStorage.getItem('kg:parent:unlocked') ?? 0);
  if (hasPin() && until > 0 && Date.now() - until < 30 * 60000) show();
  else gate();
  return host;
}
