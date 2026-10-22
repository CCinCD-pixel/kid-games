import { initShell } from '@kit/shell';
import { createStore, setHubProgress } from '@kit/progress';
import { Narrator, type NarrationManifest } from '@kit/narration';
import { createSubtitleBar, h } from '@kit/ui';
import { mount } from '@kit/companion';
import { decodeClip, playBuffer, releaseClips, type Voice } from '@kit/audio';
import { bank } from './domain/content';
import { initialSave, mastery } from './domain/learning';
import { compactHistory } from './domain/history';
import { displayPinyin } from './domain/pinyin';
import { getPicture, historyArchive, type Recording } from './speech/recordings';
import { illustration, radio } from './views/art';
import { button, glyph, pinyin, type Context } from './views/common';
import { Practice } from './views/practice';
import type { Word } from './domain/types';
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
const shell = initShell({
  game: 'pinyin-station',
  startGate: { title: '拼音电台', subtitle: '把你的声音，送到星港', buttonLabel: '进入电台' },
  onBeforeLeave: () => {
    practice?.stop();
    stopAudio();
    persist();
  },
  onPause: () => {
    practice?.stop();
    practice = null;
    stopAudio();
    home();
  },
  onResume: () => {},
});
const say = async (id: string) => {
  stopAudio();
  sub.attach(narrator);
  expectedCue = id;
  return narrator.say(id, { interrupt: true });
};
async function syllable(id: string) {
  const version = audioVersion;
  await narrator.ready();
  if (version !== audioVersion) return;
  if (narrator.has(`py.syl.${id}`)) return say(`py.syl.${id}`);
  sub.el.hidden = true;
  return undefined;
}
async function word(w: Word) {
  const version = audioVersion;
  await narrator.ready();
  if (version !== audioVersion) return;
  if (w.syllables.length === 1) return syllable(w.syllables[0]);
  const known = bank.words.find((x) => x.hanzi === w.hanzi && x.display === w.display) ?? w;
  if (w.kind !== 'cloze' && narrator.has(`py.word.${known.id}`)) return say(`py.word.${known.id}`);
  if (w.syllables.every((id) => narrator.has(`py.syl.${id}`))) {
    stopAudio();
    const version = audioVersion;
    sub.attach(narrator);
    for (const id of w.syllables) {
      if (version !== audioVersion) return;
      expectedCue = `py.syl.${id}`;
      await narrator.say(`py.syl.${id}`, { interrupt: true });
    }
    return;
  }
  // Family additions use the device's contextual word voice, never isolated-syllable TTS.
  stopAudio();
  sub.attach(familyNarrator);
  expectedCue = w.hanzi;
  return familyNarrator.say(w.hanzi, { interrupt: true });
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
const explain = async (text: string) => {
  const version = audioVersion;
  await narrator.ready();
  if (version !== audioVersion) return;
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
  sub.attach(familyNarrator);
  expectedCue = text;
  return familyNarrator.say(text, { interrupt: true });
};
const ctx: Context = {
  save,
  bank,
  persist,
  say,
  explain,
  syllable,
  word,
  replay,
  picture,
  finish,
  home,
  stopAudio,
  storageOkay: () => lastSaveOkay,
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
function home() {
  resetView();
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
  const program = h(
    'aside',
    { class: 'program-board' },
    h(
      'small',
      null,
      `第 ${save.settings.lesson} 站 · ${bank.lessons.find((l) => l.id === save.settings.lesson)?.title ?? ''}`,
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
    start,
  );
  const paths = h(
    'nav',
    { class: 'practice-paths', 'aria-label': '自由选台' },
    route('场景小剧场', '早餐、出门、花园和图书角', 'scene', 'grid'),
    route('听听声音', '两个声音，找一个小变化', 'listen', 'listen'),
    route('图画拼搭', '把图里的声音搭出来', 'spell', 'grid'),
    route('接通信号', '和想再见的词语碰个面', 'repair', 'hint'),
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
function startPractice(mode: string) {
  resetView();
  practice = new Practice(ctx, mode);
  app.replaceChildren(header(), practice.el);
  shell.session?.mark('pinyin-session', { mode, lesson: save.settings.lesson });
}
function album() {
  resetView();
  const title = h(
    'div',
    { class: 'album-title' },
    h('div', null, h('small', null, '每个字母，都是声音小伙伴'), h('h2', null, '信号卡册')),
    button('回到电台', home, 'secondary', 'back'),
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
          'aria-label': `${l.id}，${l.mnemonic}`,
          onclick: () => {
            void explain(l.mnemonic).then(() => syllable(l.callSound));
          },
        },
        pinyin(l.id.replace('v', 'ü')),
        h('small', null, l.mnemonic),
        h('span', null, lit ? '信号已接通' : '点一点，先听听'),
      ),
    );
  }
  const listen = button('去当小播音员', () => startPractice('read'), 'primary', 'mic');
  app.replaceChildren(header(), h('main', { class: 'album-page' }, title, cards, listen));
}
function finish(records: Recording[]) {
  resetView();
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
  app.replaceChildren(
    header(),
    h(
      'main',
      { class: 'finish-page' },
      bot,
      h('small', null, '本台播出'),
      h('h1', null, '今天的声音，收到啦'),
      h('p', null, records.length ? '这是你今天留给星港的声音' : '你让图画和声音，又认识了一点'),
      broadcast,
      h('p', { class: 'finish-message' }, '小播音员也需要歇一歇，去找爸爸妈妈聊聊吧。'),
      button('收好电台', home, 'primary', 'home'),
    ),
  );
  persist();
  void say('py.finish');
}
async function showParent() {
  resetView();
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
window.addEventListener('pagehide', () => {
  practice?.stop();
  stopAudio();
  cleanUrls();
  persist();
});
