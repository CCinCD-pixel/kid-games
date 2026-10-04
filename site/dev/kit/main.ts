/**
 * kit playground (/dev/kit/): a live example of every kit module, and the page the smoke tests use
 * to exercise the start gate, narration (clip, queue, interrupt, fallback), UI and input.
 * Not listed on the hub, not precached by the service worker.
 */
import { getAudioContext, isAudioUnlocked, playSuccess, playSoftMiss } from '@kit/audio';
import { mount, sayLine } from '@kit/companion';
import { makeDraggable, nearest, centerOf, type Point } from '@kit/input';
import { Narrator, type Cue } from '@kit/narration';
import { createParticles } from '@kit/particles';
import { createStore } from '@kit/progress';
import { createRng } from '@kit/rng';
import { initShell } from '@kit/shell';
import { createSubtitleBar, showModal, starRow, toast } from '@kit/ui';
import './kit-demo.css';

interface DemoSave {
  count: number;
}

const store = createStore<DemoSave>('dev-kit', { version: 1, defaults: () => ({ count: 0 }) });
let save = store.load();

const shell = initShell({
  game: 'dev-kit',
  startGate: { title: 'kit 演示台', subtitle: '点「开始」解锁声音' },
  onBeforeLeave: () => {
    store.save(save);
  },
});

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ---- narration + subtitles
const cues: (Cue | null)[] = [];
const subtitle = createSubtitleBar();
const narrator = new Narrator({
  manifestUrl: '/dev/kit/audio/audio-manifest.json',
  onCue: (cue) => {
    cues.push(cue);
    subtitle.onCue(cue);
  },
  onWord: subtitle.onWord,
});
subtitle.attach(narrator);

const bot = mount($('#bot'), { size: 120, bubble: 'left', mood: 'idle' });

$('#say-hello').addEventListener('click', () => void sayLine(bot, narrator, 'dev.hello', { mood: 'happy', interrupt: true }));
$('#say-queue').addEventListener('click', () => {
  void narrator.say('dev.hello');
  void narrator.say('dev.replay');
});
$('#say-missing').addEventListener('click', () => void narrator.say('dev.missing', { interrupt: true }));
$('#say-stop').addEventListener('click', () => {
  narrator.stop();
  bot.hush();
});

// ---- ui
const fx = createParticles();
$('#ui-modal').addEventListener('click', async () => {
  const choice = await showModal({ title: '过关啦！', body: [starRow(2, 3), '你用了 12 步。'], actions: [{ id: 'next', label: '下一关', primary: true }, { id: 'menu', label: '选关' }] });
  toast(`选了：${choice}`);
});
$('#ui-toast').addEventListener('click', () => toast('这是一条提示', { tone: 'info' }));
$('#ui-confetti').addEventListener('click', () => fx.confetti());
$('#ui-tone').addEventListener('click', () => {
  playSuccess(Math.floor(Math.random() * 4));
  setTimeout(playSoftMiss, 500);
});

// ---- drag + snap
const slots = [...document.querySelectorAll<HTMLElement>('.kd-slot')];
const tile = $('#tile');
const board = $('#board');
const slotTargets = () => slots.map((el) => ({ el, ...centerOf(el) }));
makeDraggable<{ el: HTMLElement } & Point>(tile, {
  snap: (p) => nearest(p, slotTargets(), 70),
  onMove: ({ target }) => slots.forEach((s) => s.toggleAttribute('data-hot', s === target?.el)),
  onDrop: (target) => {
    slots.forEach((s) => s.removeAttribute('data-hot'));
    if (!target) {
      bot.react('wiggle');
      return;
    }
    const b = board.getBoundingClientRect();
    const r = target.el.getBoundingClientRect();
    tile.style.left = `${r.left - b.left + (r.width - tile.offsetWidth) / 2}px`;
    fx.burstAt(target.el);
    playSuccess();
    bot.react('hop');
  },
  onTap: () => bot.react('nod'),
});

// ---- progress + rng
const out = $('#save-out');
out.textContent = String(save.count);
$('#save-inc').addEventListener('click', () => {
  save = store.update((s) => {
    s.count += 1;
  });
  out.textContent = String(save.count);
});
const rng = createRng('dev-kit');
$('#rng-roll').addEventListener('click', () => {
  $('#rng-out').textContent = String(rng.int(1, 6));
});

void shell.ready.then(() => sayLine(bot, narrator, 'dev.hello', { mood: 'happy' }));

// Test hook (smoke tests read this; harmless in production).
Object.assign(window, {
  __kitDemo: {
    shell,
    narrator,
    cues,
    store,
    audio: { isAudioUnlocked, state: () => getAudioContext()?.state ?? 'none' },
  },
});
