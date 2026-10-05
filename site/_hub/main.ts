/**
 * 星港 hub. The card panels are static markup rendered at build time from the registry
 * (tools/registry.mjs renderHub); this script adds what only the device knows:
 *  - kit shell (touch guards, session log, service worker — the hub is the page that activates a
 *    waiting service-worker update, so a game is never swapped mid-play) and the kit sounds
 *  - today's real moon phase (computed offline, site/_hub/moon.ts) on the paper-cut sky
 *  - the companion: idle on the skyline, greeting bubble on arrival; tapping it speaks (voice
 *    needs that first tap on iOS); tapping the moon names today's phase
 *  - place tabs 基地 / 游乐场 / 经典角, card progress, 继续 / 推荐 / NEW tags, parent-hidden games
 *  - 建造中 (wip) cards answer with a voiced line instead of navigating (?dev makes them links)
 *  - parent entry: hold the 家长 button or the 星港 title for 3 s → /parent/ (PIN there)
 * No timers, locks, streaks or rewards (plan §4.1, Dad's rule 10).
 */
import registry, { type HubEntry } from 'virtual:kg-registry';
import { isMuted, setMuted, sfx } from '@kit/audio';
import { mount, sayLine, type Companion } from '@kit/companion';
import { readSessions, recordLaunch, type LaunchSource } from '@kit/log';
import { Narrator } from '@kit/narration';
import { LEGACY_KEYS, readHubProgress, readLegacyLadders, readLegacySokoban, snapshotLegacyProgress } from '@kit/progress';
import { DEFAULT_NAME, getSettings, onSettingsChange } from '@kit/settings';
import { initShell } from '@kit/shell';
import { bindPress, icon, progress, segmented } from '@kit/ui';
import { installKitSfx } from '@kit/ui/sfx-bridge';
import { moonPhase, moonSvg } from './moon';
import {
  cardProgress, greetingId, initialPlace, isNew, localDay, pickContinue, pickSuggestion, playCounts, seenKey, PLACES, type Place,
} from './state';
import './hub.css';

const SEEN_KEY = 'kg:hub:seen';
const TAB_KEY = 'kg:hub:tab';
const VISITED_KEY = 'kg:hub:visited';
const PLACE_LABEL: Record<Place, string> = { base: '基地', playground: '游乐场', classic: '经典角' };
const PLACE_ICON = { base: 'rocket', playground: 'play', classic: 'star' } as const;

const shell = initShell({
  game: 'hub',
  startGate: false,
  back: false,
  serviceWorker: { activateWaiting: true },
});

const ls = (() => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
})();
const ss = (() => {
  try {
    return sessionStorage;
  } catch {
    return undefined;
  }
})();
const readJson = <T>(s: Storage | undefined, key: string, fallback: T): T => {
  try {
    const raw = s?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

try {
  snapshotLegacyProgress();
} catch (err) {
  console.warn('[hub] legacy snapshot failed', err);
}

const dev = new URLSearchParams(location.search).has('dev');
if (dev) document.documentElement.dataset.dev = '';
let settings = getSettings();
const byId = new Map(registry.map((g) => [g.id, g]));
const cards = [...document.querySelectorAll<HTMLElement>('.hub-card')];

// ------------------------------------------------------------------ names
function applyName() {
  for (const el of document.querySelectorAll('[data-display-name]')) el.textContent = settings.displayName;
}
applyName();

// ------------------------------------------------------------------ moon
const moon = moonPhase(new Date());
const moonEl = document.getElementById('hub-moon')!;
moonEl.innerHTML = moonSvg(moon);
moonEl.dataset.phase = moon.key;
moonEl.setAttribute('aria-label', `今天的月亮：${moon.name}`);

// ------------------------------------------------------------------ cards: visibility, progress, tags
function visibleIds(): Set<string> {
  const hidden = new Set(settings.hiddenGames);
  return new Set(registry.filter((g) => g.status !== 'hidden' && !hidden.has(g.id)).map((g) => g.id));
}

let continueId: string | null = null;
let suggestedId: string | null = null;

function renderCards() {
  const visible = visibleIds();
  const sessions = readSessions();
  const enterable = new Set([...visible].filter((id) => byId.get(id)?.status === 'live' || dev));
  continueId = pickContinue(sessions, enterable);
  suggestedId = pickSuggestion(registry, visible, continueId, localDay());
  const seen = new Set(readJson<string[]>(ls, SEEN_KEY, []));
  const hub = readHubProgress();
  const legacy = {
    sokoban: readLegacySokoban(readJson(ls, LEGACY_KEYS.sokoban, null)),
    'memory-matrix': readLegacyLadders(readJson(ls, LEGACY_KEYS['memory-matrix'], null)),
    'emoji-match': readLegacyLadders(readJson(ls, LEGACY_KEYS['emoji-match'], null)),
  };
  const plays = playCounts(sessions);

  for (const card of cards) {
    const g = byId.get(card.dataset.game!);
    if (!g) continue;
    card.hidden = !visible.has(g.id);
    if (g.status === 'wip' && dev) {
      card.setAttribute('aria-disabled', 'false');
      card.dataset.devLink = '';
    }
    card.querySelector('.xg-card__tag')?.remove();
    const tag = continueId === g.id ? ['继续', 'continue'] : isNew(g, seen) ? [g.newContent?.label ?? '新内容', 'new'] : suggestedId === g.id ? ['推荐', 'suggest'] : null;
    if (tag) {
      const t = document.createElement('span');
      t.className = `xg-card__tag hub-tag hub-tag--${tag[1]}${tag[1] === 'continue' ? '' : ' xg-card__tag--new'}`;
      t.textContent = tag[0];
      card.prepend(t);
    }
    const foot = card.querySelector<HTMLElement>('.hub-card__foot')!;
    const p = cardProgress(g, hub, legacy, plays[g.id] ?? 0);
    if (p) {
      foot.innerHTML = `${typeof p.value === 'number' ? progress(p.value) : '<span class="hub-card__spacer"></span>'}<span class="hub-card__label"></span>`;
      foot.querySelector('.hub-card__label')!.textContent = p.label;
    }
  }
  for (const grid of document.querySelectorAll<HTMLElement>('.hub-grid')) {
    grid.dataset.n = String(grid.querySelectorAll('.hub-card:not([hidden])').length);
  }
}
renderCards();

// ------------------------------------------------------------------ tabs
const panels = new Map(PLACES.map((p) => [p, document.getElementById(`hub-panel-${p}`)!] as const));
const placesWithCards = () => PLACES.filter((p) => panels.get(p)!.querySelector('.hub-card:not([hidden])'));
let place: Place = initialPlace(registry, visibleIds(), continueId, ss?.getItem(TAB_KEY));
if (!placesWithCards().includes(place)) place = placesWithCards()[0] ?? 'base';
const spokenPlaces = new Set<Place>();

const tabsEl = document.getElementById('hub-tabs')!;
segmented(tabsEl, {
  night: true,
  value: place,
  options: placesWithCards().map((p) => ({ id: p, label: PLACE_LABEL[p], icon: PLACE_ICON[p] })),
  onChange: (id) => showPlace(id as Place, true),
});
tabsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-controls', `hub-panel-${b.dataset.id}`));

function showPlace(p: Place, byChild = false) {
  place = p;
  for (const [k, el] of panels) {
    el.hidden = k !== p;
    if (k === p && byChild) {
      el.classList.remove('is-entering');
      void el.offsetWidth;
      el.classList.add('is-entering');
    }
  }
  document.body.dataset.place = p;
  try {
    ss?.setItem(TAB_KEY, p);
  } catch {
    /* ignore */
  }
  if (byChild && !spokenPlaces.has(p)) {
    spokenPlaces.add(p);
    speak(`hub.place.${p}`, 'happy');
  }
}
showPlace(place);

// ------------------------------------------------------------------ companion + narration
const narrator = new Narrator({ manifestUrl: '/audio/hub/audio-manifest.json' });
const portrait = () => innerHeight > innerWidth;
let bot: Companion | null = null;
const botHost = document.getElementById('hub-bot')!;
function mountBot() {
  bot?.destroy();
  bot = mount(botHost, { size: portrait() ? 132 : 118, mood: 'idle', bubble: 'left', bubbleMax: portrait() ? 470 : 470, sfx: (n) => sfx.play(n) });
}
mountBot();

function speak(id: string, mood: 'happy' | 'thinking' | 'encouraging' | 'surprised' | 'celebrating' = 'happy') {
  if (!bot || !narrator.has(id)) return;
  bot.react('hop');
  void sayLine(bot, narrator, id, { interrupt: true, mood, hold: 2600 });
}

const returning = ss?.getItem(VISITED_KEY) === '1';
try {
  ss?.setItem(VISITED_KEY, '1');
} catch {
  /* ignore */
}
const greeting = () => greetingId(new Date().getHours(), returning, settings.displayName === DEFAULT_NAME);
let greeted = false;
void narrator.ready().then(() => {
  // arrival: bubble only (iOS allows sound only after a tap); the first tap on the robot voices it
  const text = narrator.text(greeting());
  if (text) setTimeout(() => void bot?.say(text, { hold: 5200, mood: 'happy' }), 450);
});

const pokes = ['hub.poke.1', 'hub.poke.2', 'hub.poke.3'];
let pokeIx = 0;
botHost.addEventListener('click', () => {
  if (!greeted) {
    greeted = true;
    speak(greeting(), 'happy');
  } else {
    speak(pokes[pokeIx++ % pokes.length], pokeIx % 2 ? 'surprised' : 'happy');
  }
});
moonEl.addEventListener('click', () => {
  moonEl.classList.remove('is-poked');
  void moonEl.offsetWidth;
  moonEl.classList.add('is-poked');
  sfx.play('chime');
  speak(`hub.moon.${moon.key}`, 'surprised');
});

// ------------------------------------------------------------------ sound toggle
const soundBtn = document.getElementById('hub-sound')!;
function renderSound() {
  const m = isMuted();
  soundBtn.innerHTML = icon(m ? 'sound-off' : 'sound-on');
  soundBtn.classList.toggle('is-off', m);
  soundBtn.setAttribute('aria-pressed', String(!m));
  soundBtn.setAttribute('aria-label', m ? '声音：关' : '声音：开');
}
renderSound();
soundBtn.addEventListener('click', () => {
  setMuted(!isMuted());
  renderSound();
  if (!isMuted()) sfx.play('ui-toggle-on');
});

// ------------------------------------------------------------------ launching games
const panelsEl = document.getElementById('hub-panels')!;
let leaving = false;
panelsEl.addEventListener('click', (e) => {
  const card = (e.target as Element | null)?.closest<HTMLElement>('.hub-card');
  if (!card || leaving) return;
  const g = byId.get(card.dataset.game!);
  if (!g) return;
  e.preventDefault();
  if (g.status === 'wip' && !dev) {
    card.classList.remove('is-shaking');
    void card.offsetWidth;
    card.classList.add('is-shaking');
    speak('hub.building', 'encouraging');
    return;
  }
  launch(g, card);
});
panelsEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = (e.target as Element | null)?.closest<HTMLElement>('.hub-card[data-wip]');
  if (card) card.click();
});

function launch(g: HubEntry, card: HTMLElement) {
  leaving = true;
  const source: LaunchSource = g.id === continueId ? 'resume' : g.id === suggestedId ? 'suggested' : 'hub';
  recordLaunch(g.id, source);
  if (g.newContent) {
    const seen = new Set(readJson<string[]>(ls, SEEN_KEY, []));
    seen.add(seenKey(g));
    try {
      ls?.setItem(SEEN_KEY, JSON.stringify([...seen]));
    } catch {
      /* ignore */
    }
  }
  card.classList.add('is-launching');
  narrator.stop();
  // let the press spring and the pop sound play before the page goes
  setTimeout(() => void shell.leave(g.href), 170);
}
// bfcache restore (swipe back from a game): allow launching again and refresh progress
window.addEventListener('pageshow', (e) => {
  if (!(e as PageTransitionEvent).persisted) return;
  leaving = false;
  for (const c of cards) c.classList.remove('is-launching');
  renderCards();
});

// ------------------------------------------------------------------ parent entry (hold 3 s)
const HOLD_MS = 3000;
function holdToOpen(el: HTMLElement) {
  let timer = 0;
  const cancel = () => {
    clearTimeout(timer);
    el.classList.remove('is-holding');
  };
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    el.classList.add('is-holding');
    timer = window.setTimeout(() => {
      el.classList.remove('is-holding');
      sfx.play('unlock');
      void shell.leave('/parent/');
    }, HOLD_MS);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
const parentBtn = document.getElementById('hub-parent')!;
parentBtn.insertAdjacentHTML('beforeend', icon('parent'));
holdToOpen(parentBtn);
holdToOpen(document.getElementById('hub-brand')!);
let parentHintAt = 0;
parentBtn.addEventListener('click', () => {
  // a short tap: say how it works (for grown-ups), no sound fanfare
  if (Date.now() - parentHintAt < 2500) return;
  parentHintAt = Date.now();
  parentBtn.classList.add('is-hinting');
  setTimeout(() => parentBtn.classList.remove('is-hinting'), 1600);
});

// ------------------------------------------------------------------ settings from the parent page / rotation
onSettingsChange((s) => {
  settings = s;
  applyName();
  renderCards();
});
shell.on('layout', () => {
  const want = portrait() ? 132 : 118;
  if (bot && Math.abs(bot.el.getBoundingClientRect().width - want) > 4) mountBot();
});

// ------------------------------------------------------------------ sounds (decoded now, audible after the first tap)
bindPress(document);
void installKitSfx({ only: ['ui-tap', 'ui-pop', 'ui-tick', 'ui-press', 'ui-toggle-on', 'chime', 'unlock', 'blip-happy', 'blip-think', 'blip-surprised', 'blip-talk', 'blip-sleepy'] });

document.body.dataset.ready = '';
