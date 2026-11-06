/**
 * Every instruction the child both reads and hears. The sentence on the screen, in the subtitle bar and in the voice
 * clip is ONE sentence: this table is the source for the screen, and `lines.test.ts` proves content/narration/
 * pinyin-station.yaml says exactly the same thing for every id (so a new id here needs the same line there).
 * Lines whose clip has not been recorded yet are still shown as subtitles (see `say` in main.ts).
 */
import type { Kind } from '../domain/types';

export interface Line {
  id: string;
  text: string;
}
const line = (id: string, text: string): Line => ({ id, text });

/** The instruction a question starts with (F is asked step by step, see STEP). */
export const INSTRUCTION: Record<Exclude<Kind, 'F'>, Line> = {
  A: line('py.A', '听一听，找到这个字母。'),
  B: line('py.B', '听一听，找到同一个声音。'),
  C: line('py.C2', '听一听，选出缺的那一段声音。'),
  D: line('py.D', '准备好，就读给台长听。'),
  E: line('py.E2', '看一看拼音，点出它的图。'),
  G: line('py.G', '点点词卡，把话接起来。'),
  H: line('py.H', '听一听，选出声调一样的那个。'),
  I: line('py.I', '找一找，哪一个和上面的一模一样？'),
};
/** F (看图拼音) asks one small thing at a time. */
export const STEP = {
  initial: line('py.initial', '先找开头的声音。'),
  final: line('py.final', '再找后面的声音。'),
  tone: line('py.tone', '给声音放上小帽子。'),
} as const;

export const HINT = {
  first: line('py.hint1', '先听一听，再找线索。'),
  split: line('py.hint2', '我们把声音拆开看看。'),
  demo: line('py.demo', '一起看示范，再接下一条信号。'),
  near: line('py.H.near', '差一点点，再听一听。'),
  look: line('py.I.look', '差一点点，再仔细看一看。'),
};
/** What the radio says once a recording really happened (or did not). */
export const RECORDING = {
  saved: line('py.saved', '你的声音已经留在电台。'),
  heard: line('py.heard', '我听到你的声音啦。'),
  unsure: line('py.unsure', '台长还没听清，一起再听听。'),
  follow: line('py.follow2', '跟着台长读一遍。'),
};
export const FINISH = {
  recorded: line('py.finish', '今天的声音已送到星港，歇一歇吧。'),
  plain: line('py.finish2', '今天的节目播完啦，歇一歇吧。'),
};
/** 小规则: the plain-Chinese line of each card (the letters and tone marks are drawn on the card, never said). */
export const RULES: { id: string; title: string; at: number; line: Line }[] = [
  { id: 'tones', title: '四声歌', at: 1, line: line('py.rule.tones', '一声平，二声扬，三声拐弯，四声降。') },
  { id: 'i', title: '小点点摘帽子', at: 2, line: line('py.rule.i', '有礼貌的小点点，标上声调就摘帽。') },
  { id: 'v', title: '两个小点点擦眼泪', at: 6, line: line('py.rule.v', '两个小点点见到这几个字母，就擦掉眼泪笑嘻嘻。') },
  { id: 'nl', title: '有的小点点要留着', at: 6, line: line('py.rule.nl', '有两个字母后面，两个小点点要好好留着。') },
  { id: 'mark', title: '声调标在哪里', at: 9, line: line('py.rule.mark', '韵母里有张大嘴巴的，声调就标在它头上；没有的话，找圆圆嘴巴和扁扁嘴巴；两个小个子并排，标在后面那个。') },
];
/** 朗读册: said when the child taps "我读了一遍" (never a count, never a target). */
export const BOOK = { plus: line('py.book.plus', '记下啦，又读了一遍。') };
export const DRILL = {
  start: line('py.drill', '一格一格慢慢读，读好了就点下一个。'),
  done: line('py.drill.done', '这一张读完啦，歇一歇。'),
};
/** Praise only says what the child really did. Index = position in bank.praise. */
export const PRAISE = {
  retry: 8,
  A: [22],
  B: [5],
  C: [3],
  D: [19],
  E: [0, 1],
  Finitial: [23],
  Ffinal: [24],
  Ftone: [6],
  Ffull: [7, 12],
  G: [18, 7],
  H: [25],
  I: [26],
} as const;

/** Text of every new/changed line, id → text (the narration yaml must match; see lines.test.ts). */
export const ALL_LINES: Line[] = [
  ...Object.values(INSTRUCTION),
  ...Object.values(STEP),
  ...Object.values(HINT),
  ...Object.values(RECORDING),
  ...Object.values(FINISH),
  ...RULES.map((r) => r.line),
  ...Object.values(DRILL),
  ...Object.values(BOOK),
];
export const lineText = (id: string): string | undefined => ALL_LINES.find((l) => l.id === id)?.text;
