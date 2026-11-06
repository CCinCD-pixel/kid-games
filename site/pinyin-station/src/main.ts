import { initShell } from '@kit/shell';
import { createStore, setHubProgress } from '@kit/progress';
import { Narrator, type NarrationManifest } from '@kit/narration';
import { createSubtitleBar, h, shouldAutoSkip } from '@kit/ui';
import { mount } from '@kit/companion';
import { decodeClip, playBuffer, releaseClips, type Voice } from '@kit/audio';
import { bank } from './domain/content';
import { initialSave, mastery } from './domain/learning';
import { compactHistory } from './domain/history';
import { callLabel, displayPinyin } from './domain/pinyin';
import { bookLabel, currentBook } from './domain/book';
import { getPicture, historyArchive, type Recording } from './speech/recordings';
import { illustration, radio } from './views/art';
import { button, glyph, pinyin, type Context } from './views/common';
import { Practice } from './views/practice';
import type { ResumeState, Word } from './domain/types';
import { lineText } from './views/lines';
import { defaultTable, drillTables } from './domain/drill';
import { drillView } from './views/drill';
import { readBookView } from './views/readbook';
import { printView } from './views/printpage';
import { buildWeeklyQuiz, buildWorksheet } from './domain/worksheet';
import { dueSummary } from './domain/progress';
import { rulesView } from './views/rules';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const store = createStore('pinyin-station', { version: 1, defaults: initialSave });
const save = store.load();
// Guard older/corrupted local data without discarding unrelated platform saves.
if (!save.settings || !Array.isArray(save.history)) Object.assign(save, initialSave());
const sub = createSubtitleBar();
let expectedCue: string | null = null;
const cue: typeof sub.onCue = (value) => {
  if (value && (value.id ?? value.text) === expectedCue) sub.onCue(value);
};
const narrator = new Narrator({
  manifestUrl: '/audio/pinyin-station/audio-manifest.json',
  speechFallback: false,
  onCue: cue,
  onWord: sub.onWord,
});
sub.attach(narrator);
const familyNarrator = new Narrator({ speechFallback: true, onCue: cue, onWord: sub.onWord });
let practice: Practice | null = null,
  voice: Voice | null = null,
  replayUrl: string | null = null;
let audioVersion = 0;
let viewVersion = 0;
const pictureUrls = new Set<string>();
const cleanUrls = () => {
  pictureUrls.forEach((url) => URL.revokeObjectURL(url));
  pictureUrls.clear();
};
const stopAudio = () => {
  audioVersion++;
  expectedCue = null;
  sub.onCue({ id: null, text: '', source: 'text' });
  sub.hide();
  narrator.stop();
  familyNarrator.stop();
  voice?.stop();
  voice = null;
  if (replayUrl) {
    releaseClips([replayUrl]);
    URL.revokeObjectURL(replayUrl);
    replayUrl = null;
  }
};
let lastSaveOkay = true;
let foldingHistory = false;
const persist = () => {
  lastSaveOkay = store.save(save);
  if (!foldingHistory) {
    foldingHistory = true;
    void compactHistory(save, historyArchive)
      .then((changed) => {
        if (changed) lastSaveOkay = store.save(save);
      })
      .catch(() => {
        /* Keep all detail in the save if the local archive is unavailable. */
      })
      .finally(() => {
        foldingHistory = false;
      });
  }
  const lit = bank.words.filter((w) => mastery(save, `word:${w.id}`)).length;
  setHubProgress('pinyin-station', {
    label: lit ? '信号渐渐亮起来了' : '电台等你开播',
    value: lit / bank.words.length,
  });
};
type Played = 'done' | 'interrupted' | 'skipped';
const played = (result: unknown): Played =>
  result === 'interrupted' ? 'interrupted' : result === 'done' ? 'done' : 'skipped';
// ---- navigation: home <-> exactly one sub-view (practice / album / parent / finish). One back step = one level.
type ViewName = 'home' | 'practice' | 'album' | 'parent' | 'finish' | 'recall' | 'drill' | 'rules' | 'book' | 'print';
const NAV = 'ps';
let view: ViewName = 'home';
try {
  history.replaceState({ [NAV]: 'home' }, '');
} catch {
  /* A sandboxed frame may refuse; the in-page buttons still work. */
}
function open(next: ViewName) {
  view = next;
  app.dataset.view = next;
  try {
    if (history.state?.[NAV] && history.state[NAV] !== 'home') history.replaceState({ [NAV]: next }, '');
    else history.pushState({ [NAV]: next }, '');
  } catch {
    /* ignore */
  }
}
/** One step back (our 返回, 回电台, Escape and the browser/swipe back all land here). False = already at the radio home. */
function back(): boolean {
  if (view === 'home') return false;
  if (history.state?.[NAV] && history.state[NAV] !== 'home') history.back();
  else home();
  return true;
}
window.addEventListener('popstate', () => {
  if (view !== 'home') home();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && view !== 'home' && !document.querySelector('.kit-start')) {
    event.preventDefault();
    back();
  }
});
const shell = initShell({
  game: 'pinyin-station',
  startGate: { title: '拼音电台', subtitle: '把你的声音，送到星港', buttonLabel: '进入电台' },
  back: { onClick: () => back() },
  onBeforeLeave: () => {
    practice?.pause();
    stopAudio();
    persist();
  },
  // Lock screen / app switch / notification shade: stop the sound, keep the screen and the progress where they are.
  onPause: () => {
    practice?.pause();
    stopAudio();
    persist();
  },
  onResume: () => {},
});
/** Play one line. A new line always cuts the previous one (single voice channel); `quiet` plays without printing it. */
const say = async (id: string, quiet = false): Promise<Played> => {
  stopAudio();
  sub.attach(narrator);
  if (narrator.has(id)) {
    expectedCue = quiet ? null : id;
    return played(await narrator.say(id, { interrupt: true }));
  }
  // A new line whose clip has not been recorded yet: its subtitle still shows, so screen and sentence agree.
  const text = lineText(id);
  if (!text) return 'skipped';
  expectedCue = text;
  return played(await narrator.say(text, { interrupt: true }));
};
async function syllable(id: string, quiet = false): Promise<Played> {
  const version = audioVersion;
  await narrator.ready();
  if (version !== audioVersion) return 'interrupted';
  if (narrator.has(`py.syl.${id}`)) return say(`py.syl.${id}`, quiet);
  sub.el.hidden = true;
  return 'skipped';
}
/** A row of real recordings with one plain caption in the subtitle bar: the robot reads nothing here. */
async function listen(ids: string[], caption: string, onClip?: (index: number) => void): Promise<Played> {
  stopAudio();
  const version = audioVersion;
  await narrator.ready();
  if (version !== audioVersion) return 'interrupted';
  sub.attach(narrator);
  expectedCue = caption; // the clips' own cues are filtered out; the caption is what the bar shows
  sub.onCue({ id: null, text: caption, source: 'text' });
  for (const [i, id] of ids.entries()) {
    if (version !== audioVersion) return 'interrupted';
    if (!narrator.has(`py.syl.${id}`)) continue;
    onClip?.(i);
    if (played(await narrator.say(`py.syl.${id}`, { interrupt: true })) === 'interrupted') return 'interrupted';
  }
  return 'done';
}
async function word(w: Word, quiet = false): Promise<Played> {
  const version = audioVersion;
  await narrator.ready();
  if (version !== audioVersion) return 'interrupted';
  if (w.syllables.length === 1) return syllable(w.syllables[0], quiet);
  const known = bank.words.find((x) => x.hanzi === w.hanzi && x.display === w.display) ?? w;
  if (w.kind !== 'cloze' && narrator.has(`py.word.${known.id}`)) return say(`py.word.${known.id}`, quiet);
  if (w.syllables.every((id) => narrator.has(`py.syl.${id}`))) {
    stopAudio();
    const mine = audioVersion;
    sub.attach(narrator);
    for (const id of w.syllables) {
      if (mine !== audioVersion) return 'interrupted';
      expectedCue = quiet ? null : `py.syl.${id}`;
      if (played(await narrator.say(`py.syl.${id}`, { interrupt: true })) === 'interrupted') return 'interrupted';
    }
    return 'done';
  }
  // Family additions use the device's contextual word voice, never isolated-syllable TTS.
  stopAudio();
  sub.attach(familyNarrator);
  expectedCue = quiet ? null : w.hanzi;
  return played(await familyNarrator.say(w.hanzi, { interrupt: true }));
}
async function replay(blob: Blob) {
  stopAudio();
  const url = URL.createObjectURL(blob);
  replayUrl = url;
  try {
    const clip = await decodeClip(url);
    if (replayUrl !== url) return;
    if (clip) {
      voice = playBuffer(clip, { bus: 'voice' });
      await voice?.ended;
    }
  } finally {
    if (replayUrl === url) {
      releaseClips([url]);
      URL.revokeObjectURL(url);
      replayUrl = null;
      voice = null;
    }
  }
}
function picture(w: Word): HTMLElement {
  if (!w.picture.startsWith('local:')) return illustration(w.picture, w.hanzi);
  const host = h('div', { class: 'illustration', 'aria-label': w.hanzi });
  void getPicture(w.picture.slice(6))
    .then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      pictureUrls.add(url);
      if (!host.isConnected) {
        URL.revokeObjectURL(url);
        pictureUrls.delete(url);
        return;
      }
      host.append(h('img', { src: url, alt: w.hanzi }));
    })
    .catch(() => host.append(illustration('custom', w.hanzi)));
  return host;
}
const explain = async (text: string): Promise<Played> => {
  const version = audioVersion;
  await narrator.ready();
  if (version !== audioVersion) return 'interrupted';
  const scene = bank.scenes?.find((s) => s.prompt === text),
    letter = bank.letters.find((l) => l.mnemonic === text),
    tip = bank.confusions.find((c) => c.tip === text);
  const id = scene
    ? `py.scene.${scene.id}`
    : letter
      ? `py.mnemonic.${letter.id}`
      : tip
        ? `py.tip.${tip.pair.join('-')}`
        : '';
  if (id && narrator.has(id)) return say(id);
  stopAudio();
  if (id) {
    // A scene, mnemonic or tip without a recording is shown as a subtitle only. The device voice would read letters
    // and sounds in its own (English) way, which is exactly what must never happen.
    sub.attach(narrator);
    expectedCue = text;
    return played(await narrator.say(text, { interrupt: true }));
  }
  sub.attach(familyNarrator);
  expectedCue = text;
  return played(await familyNarrator.say(text, { interrupt: true }));
};
const ctx: Context = {
  save,
  bank,
  persist,
  say,
  explain,
  syllable,
  listen,
  word,
  replay,
  picture,
  finish,
  home: () => {
    if (!back()) home();
  },
  stopAudio,
  storageOkay: () => lastSaveOkay,
  print: (kind, scope) => printSheet(kind, scope),
};
function header() {
  return h(
    'header',
    { class: 'station-header' },
    h('div', { class: 'station-brand' }, glyph('mic'), h('span', null, '星港广播站')),
    h(
      'div',
      { class: 'header-tools' },
      button('信号卡册', album, 'quiet', 'book'),
      button('家长', () => void showParent(), 'quiet', 'parent'),
    ),
  );
}
function resetView() {
  viewVersion++;
  practice?.stop();
  practice = null;
  stopAudio();
  cleanUrls();
  sub.el.hidden = true;
}
const RESUME_MS = 12 * 3600_000;
function pendingResume(): ResumeState | null {
  const r = save.resume;
  if (!r || !Array.isArray(r.queue) || r.index >= r.queue.length || Date.now() - r.at > RESUME_MS) return null;
  return r;
}
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
const modeNames: Record<string, string> = {
  today: '今天的节目',
  scene: '场景小剧场',
  listen: '听听声音',
  spell: '图画拼搭',
  repair: '老朋友重逢',
  read: '小播音员',
  review: '阶段复习',
  week: '一周回顾',
};
function home() {
  resetView();
  view = 'home';
  app.dataset.view = 'home';
  const bot = h('div', { class: 'home-bot' });
  mount(bot, { size: 145 });
  const intro = h(
    'div',
    { class: 'home-title' },
    h('small', null, '今天，也有新的声音想认识你'),
    h('h1', null, '拼音电台'),
    h('p', null, '一幅图、一段声音，接通一条小小的信号。'),
  );
  const studio = h(
    'div',
    { class: 'studio' },
    h('div', { class: 'studio-note' }, h('span', { class: 'on-air-dot' }), '小播音员，请就位'),
    radio(),
    bot,
    h('div', { class: 'studio-label' }, pinyin('bā · bá · bǎ · bà'), h('span', null, '慢慢读，声音会找到路')),
  );
  const start = button('开始今天的节目', () => startPractice('today'), 'primary', 'play');
  start.classList.add('start-show');
  const resume = pendingResume();
  const quietStart = button('开始今天的节目', () => startPractice('today'), 'quiet', 'play');
  quietStart.classList.add('start-show');
  // 阶段复习 appears once the teacher is at book lesson 9 or later (and stays for stations 9-12).
  const reviewBtn = currentBook(save, bank) >= 9 ? button('阶段复习', recall, 'secondary', 'book') : null;
  const drillBtn = button('练读表', () => drill(), 'secondary', 'grid');
  // The 小规则 hint shows once (a dismiss or a visit is remembered); the parent's 跳过开场和教学 keeps it away.
  const ruleHint =
    !save.rulesSeen?.hint && !shouldAutoSkip()
      ? h(
          'div',
          { class: 'rule-hint', role: 'note' },
          h('p', null, '新朋友：读拼音的小窍门，都放在“小规则”里。'),
          h(
            'div',
            { class: 'rule-hint-actions' },
            button('去看看', () => rules(), 'secondary', 'book'),
            button('先不用', () => {
              (save.rulesSeen ??= {}).hint = true;
              persist();
              ruleHint?.remove();
            }, 'quiet'),
          ),
        )
      : null;
  // 复习队列: a quiet note when old friends are due (never a count of failures, never when today's programme is done).
  const due = dueSummary(save, bank);
  const dueHint =
    due.total && !(save.lastFinishAt !== undefined && sameDay(save.lastFinishAt, Date.now()))
      ? h(
          'p',
          { class: 'due-hint', role: 'note' },
          `今天有 ${due.total > 20 ? '好多' : due.total} 个老朋友想见你。`,
          due.pages.length ? h('small', null, `它们住在${due.pages.slice(0, 3).map((p) => `第 ${p.page} 页`).join('、')}，开始今天的节目就会遇到。`) : null,
        )
      : null;
  const doneToday = save.lastFinishAt !== undefined && sameDay(save.lastFinishAt, Date.now());
  const program = h(
    'aside',
    { class: 'program-board' },
    h(
      'small',
      null,
      `${bookLabel(bank, save.settings.lesson)} · 第 ${save.settings.lesson} 站 · ${bank.lessons.find((l) => l.id === save.settings.lesson)?.title ?? ''}`,
    ),
    h('h2', null, '你的声音，从这里出发'),
    h(
      'ol',
      null,
      [
        ['热热耳朵', '先和熟悉的声音打招呼'],
        ['接通信号', '读词找图，再把拼音搭起来'],
        ['本台播出', '听听自己的声音，歇一歇'],
      ].map(([title, desc], i) =>
        h(
          'li',
          null,
          h('span', { class: 'program-dot' }, String(i + 1)),
          h('div', null, h('b', null, title), h('p', null, desc)),
        ),
      ),
    ),
    resume
      ? h(
          'div',
          { class: 'resume-card' },
          h('p', null, `${modeNames[resume.mode] ?? '节目'}还没播完 · 第 ${resume.index + 1} / ${resume.queue.length} 条`),
          button('接着上次的节目', () => startPractice(resume.mode, resume), 'primary', 'play'),
        )
      : null,
    dueHint,
    resume ? quietStart : start,
    reviewBtn,
    drillBtn,
    ruleHint,
    doneToday && !resume ? h('p', { class: 'program-done' }, '今天的节目已经播完一场啦，想再练也可以。') : null,
  );
  const paths = h(
    'nav',
    { class: 'practice-paths', 'aria-label': '自由选台' },
    route('场景小剧场', '早餐、出门、花园和图书角', 'scene', 'grid'),
    route('听听声音', '两个声音，找一个小变化', 'listen', 'listen'),
    route('图画拼搭', '把图里的声音搭出来', 'spell', 'grid'),
    route('老朋友重逢', '和想再见的词语碰个面', 'repair', 'hint'),
    routeTo('book', '朗读册', '读一页，记一遍', 'book', readBook),
    routeTo('week', '一周回顾', '这一周练过的，小卷一张', 'hint', () => startPractice('week')),
  );
  app.replaceChildren(
    header(),
    h(
      'main',
      { class: 'station-home' },
      intro,
      h('div', { class: 'studio-row' }, studio, program),
      paths,
      h('p', { class: 'home-footnote' }, '每一条信号，都可以慢慢来。'),
    ),
  );
  app.dataset.ready = '';
}
function route(title: string, desc: string, mode: string, symbol: 'listen' | 'grid' | 'hint') {
  return h(
    'button',
    { type: 'button', class: `route-card route-${mode}`, onclick: () => startPractice(mode) },
    glyph(symbol),
    h('span', null, h('b', null, title), h('small', null, desc)),
    glyph('next'),
  );
}
function routeTo(cls: string, title: string, desc: string, symbol: 'listen' | 'grid' | 'hint' | 'book', go: () => void) {
  return h('button', { type: 'button', class: `route-card route-${cls}`, onclick: go }, glyph(symbol), h('span', null, h('b', null, title), h('small', null, desc)), glyph('next'));
}
/** 朗读册: the child's page-by-page reading counter. */
function readBook() {
  resetView();
  open('book');
  app.replaceChildren(header(), readBookView(ctx));
}
/** 打印练习页 / 一周回顾卷: a preview of the A4 paper; the print style leaves only the paper. */
function printSheet(kind: 'weak' | 'week', scope?: number) {
  resetView();
  open('print');
  const sheet = kind === 'week' ? buildWeeklyQuiz(save, bank) : buildWorksheet(save, bank, scope ?? 'weak');
  app.replaceChildren(header(), printView(sheet, () => void showParent()));
}
function startPractice(mode: string, resume?: ResumeState) {
  resetView();
  open('practice');
  if (!resume) {
    save.resume = undefined;
  }
  practice = new Practice(ctx, mode, resume);
  app.replaceChildren(header(), practice.el);
  shell.session?.mark('pinyin-session', { mode, lesson: save.settings.lesson, resumed: !!resume });
}
/** 记一记: every letter on one screen, tap one to hear its real recording; then the 阶段复习 programme starts. */
function recall() {
  resetView();
  open('recall');
  const tiles = (letters: typeof bank.letters) =>
    h(
      'div',
      { class: 'recall-tiles' },
      letters.map((l) =>
        h(
          'button',
          { type: 'button', class: 'recall-tile pinyin', 'data-letter': l.id, 'aria-label': l.id.replace('v', 'ü'), onclick: () => void syllable(l.callSound) },
          l.id.replace('v', 'ü'),
        ),
      ),
    );
  const upTo8 = bank.letters.filter((l) => l.lesson <= 8);
  const group = (title: string, letters: typeof bank.letters) => h('section', { class: 'recall-group' }, h('h3', null, title), tiles(letters));
  app.replaceChildren(
    header(),
    h(
      'main',
      { class: 'album-page recall-page' },
      h(
        'div',
        { class: 'album-title' },
        h('div', null, h('small', null, '点一点，听一听'), h('h2', null, '记一记')),
        button('回到电台', () => ctx.home(), 'secondary', 'back'),
      ),
      h(
        'div',
        { class: 'recall-scroll' },
        group('单韵母', upTo8.filter((l) => l.kind === 'final')),
        group('声母', upTo8.filter((l) => l.kind === 'initial')),
        group('整体认读音节', upTo8.filter((l) => l.kind === 'whole')),
      ),
      button('开始阶段复习', () => startPractice('review'), 'primary', 'play'),
    ),
  );
}
/** 练读表: pick one of this station's tables (the one the lesson points at is marked), then read it cell by cell. */
function drill() {
  resetView();
  open('drill');
  const station = save.settings.lesson;
  const tables = drillTables(bank, station);
  const pointed = defaultTable(tables, station);
  const list = h('div', { class: 'drill-menu' });
  const choose = () => app.replaceChildren(header(), h('main', { class: 'album-page drill-page' }, title, list));
  const title = h(
    'div',
    { class: 'album-title' },
    h('div', null, h('small', null, '一格一格慢慢读，读得越来越顺'), h('h2', null, '练读表')),
    button('回电台', () => ctx.home(), 'secondary', 'back'),
  );
  if (!tables.length)
    list.append(h('p', { class: 'drill-empty' }, '这一站的练读表还没准备好，先去玩今天的节目吧。'));
  for (const t of tables) {
    const mine = save.drillBest?.[t.id];
    list.append(
      h(
        'button',
        {
          type: 'button',
          class: `drill-choice ${t === pointed ? 'recommended' : ''} ${mine?.due !== undefined && mine.due <= Date.now() ? 'due' : ''}`,
          'data-table': t.id,
          onclick: () => {
            stopAudio();
            app.replaceChildren(header(), drillView(ctx, t, () => drill()));
          },
        },
        h('b', null, t.title),
        h('small', null, t.note),
        h('span', null, mine ? `上次读了 ${mine.last} 秒${mine.due !== undefined && mine.due <= Date.now() ? ' · 该再读一读啦' : ''}` : `${t.cells.length} 格`),
      ),
    );
  }
  choose();
}
/** 小规则: five small cards. Opening them marks the hint as seen. */
function rules(focus?: string) {
  resetView();
  open('rules');
  (save.rulesSeen ??= {}).hint = true;
  persist();
  app.replaceChildren(header(), rulesView(ctx, focus, save.settings.lesson));
}
function album() {
  resetView();
  open('album');
  const title = h(
    'div',
    { class: 'album-title' },
    h('div', null, h('small', null, '每个字母，都是声音小伙伴'), h('h2', null, '信号卡册')),
    button('回到电台', () => ctx.home(), 'secondary', 'back'),
  );
  const cards = h('div', { class: 'signal-album' });
  for (const l of bank.letters.filter((l) => l.lesson <= save.settings.lesson && l.kind !== 'whole')) {
    const lit =
      mastery(save, `letter:${l.id}`) ||
      bank.words.some((w) => mastery(save, `word:${w.id}`) && w.syllables.some((id) => id.startsWith(l.id)));
    cards.append(
      h(
        'button',
        {
          type: 'button',
          class: `signal-card ${lit ? 'lit' : ''}`,
          'data-letter': l.id,
          'aria-label': `${l.id.replace('v', 'ü')}，${l.mnemonic}，读音 ${callLabel(l)}`,
          onclick: () => {
            void explain(l.mnemonic).then((r) => (r === 'interrupted' ? r : syllable(l.callSound)));
          },
        },
        pinyin(l.id.replace('v', 'ü')),
        h('small', null, l.mnemonic),
        // No recording for this call sound yet (eng): do not promise a sound.
        h('span', null, lit ? '信号已接通' : narrator.has(`py.syl.${l.callSound}`) ? '点一点，先听听' : '点一点，看看样子'),
      ),
    );
  }
  const listen = button('去当小播音员', () => startPractice('read'), 'primary', 'mic');
  const ruleLink = h('div', { class: 'album-rules-link' }, button('小规则', () => rules(), 'quiet', 'book'));
  app.replaceChildren(header(), h('main', { class: 'album-page' }, title, ruleLink, cards, listen));
}
function finish(records: Recording[], saved: number) {
  resetView();
  open('finish');
  save.resume = undefined;
  save.lastFinishAt = Date.now();
  const bot = h('div', { class: 'finish-bot' });
  mount(bot, { size: 150 });
  const broadcast = h('div', { class: 'broadcast-list' });
  records
    .slice()
    .sort((a, b) => (b.verdict?.level ?? 0) - (a.verdict?.level ?? 0))
    .slice(0, 3)
    .forEach((r) => {
      const w = [...bank.words, ...save.customWords].find((w) => w.id === r.wordId);
      broadcast.append(
        button(w?.display ?? displayPinyin(r.wordId), () => void replay(r.blob), 'secondary', 'play'),
      );
    });
  // The page only says "your voice arrived" when a recording really exists.
  // (Not records.length: with 保留录音 off a recording only lives in memory and nothing was left at the radio.)
  const recorded = saved > 0;
  app.replaceChildren(
    header(),
    h(
      'main',
      { class: 'finish-page' },
      bot,
      h('small', null, '本台播出'),
      h('h1', null, recorded ? '今天的声音，收到啦' : '今天的节目，播完啦'),
      h(
        'p',
        null,
        recorded
          ? '这是你今天留给星港的声音'
          : records.length
            ? '这次的声音没有留下来，现在还可以听一听'
            : '你让图画和声音，又认识了一点',
      ),
      broadcast,
      h('p', { class: 'finish-message' }, '小播音员也需要歇一歇，去找爸爸妈妈聊聊吧。'),
      button('收好电台', () => ctx.home(), 'primary', 'home'),
    ),
  );
  persist();
  void say(recorded ? 'py.finish' : 'py.finish2');
}
async function showParent() {
  resetView();
  open('parent');
  const gen = viewVersion;
  const module = await import('./views/parent');
  if (gen !== viewVersion) return;
  app.replaceChildren(header(), module.parentView(ctx));
}
// Fetch (not decode) unit audio through the platform SW so offline practice needs no cloud.
async function prefetchMedia() {
  try {
    const manifest = (await fetch('/audio/pinyin-station/audio-manifest.json').then((r) =>
      r.json(),
    )) as NarrationManifest;
    const urls = [
      ...new Set(Object.values(manifest).map((c) => c.src)),
      '/fonts/pinyin-station/Andika-Regular.ttf',
    ];
    let at = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (at < urls.length) {
          const url = urls[at++];
          try {
            await fetch(url);
          } catch {
            /* Retry on the next visit. */
          }
        }
      }),
    );
  } catch {
    /* The saved lesson remains available without AI. */
  }
}
home();
if (/\/(lab|review)\//.test(location.pathname)) void showParent();
void narrator.ready();
const welcomeView = viewVersion;
void shell.ready.then(() => {
  if (viewVersion === welcomeView && !/\/(lab|review)\//.test(location.pathname)) return say('py.welcome');
});
if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(prefetchMedia);
window.addEventListener('pagehide', (event) => {
  practice?.pause();
  stopAudio();
  if (!event.persisted) cleanUrls();
  persist();
});
