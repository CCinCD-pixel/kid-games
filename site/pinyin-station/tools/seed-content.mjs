// Rebuild the initial, parent-reviewable bank. Runtime and validators consume bank.json.
import fs from 'node:fs';
import { pinyin } from 'pinyin-pro';
import { extendCurriculum, sceneBank } from './curriculum-content.mjs';
const out = new URL('../../../content/pinyin-station/bank.json', import.meta.url);
const lessonNames = [
  'a o e',
  'i u ü · y w',
  'b p m f',
  'd t n l',
  'g k h',
  'j q x',
  'z c s',
  'zh ch sh r',
  'ai ei ui',
  'ao ou iu',
  'ie üe er',
  'an en in un ün',
  'ang eng ing ong',
];
const lessons = lessonNames.map((title, i) => ({ id: i + 1, title, unit: i < 4 ? 2 : i < 8 ? 3 : 4 }));
const letterRows = [
  ['a o e', 1, 'final'],
  ['i u v', 2, 'final'],
  ['y w', 2, 'initial'],
  ['b p m f', 3, 'initial'],
  ['d t n l', 4, 'initial'],
  ['g k h', 5, 'initial'],
  ['j q x', 6, 'initial'],
  ['z c s', 7, 'initial'],
  ['zh ch sh r', 8, 'initial'],
  ['ai ei ui', 9, 'final'],
  ['ao ou iu', 10, 'final'],
  ['ie ve er', 11, 'final'],
  ['an en in un vn', 12, 'final'],
  ['ang eng ing ong', 13, 'final'],
  ['yi wu yu', 2, 'whole'],
  ['zi ci si', 7, 'whole'],
  ['zhi chi shi ri', 8, 'whole'],
  ['ye yue', 11, 'whole'],
  ['yin yun yuan', 12, 'whole'],
  ['ying', 13, 'whole'],
];
const calls = {
  b: 'bo1',
  p: 'po1',
  m: 'mo1',
  f: 'fo1',
  d: 'de1',
  t: 'te1',
  n: 'ne1',
  l: 'le1',
  y: 'yi1',
  w: 'wu1',
  g: 'ge1',
  k: 'ke1',
  h: 'he1',
  j: 'ji1',
  q: 'qi1',
  x: 'xi1',
  z: 'zi1',
  c: 'ci1',
  s: 'si1',
  zh: 'zhi1',
  ch: 'chi1',
  sh: 'shi1',
  r: 'ri1',
  v: 'yu1',
};
const mnemonics = {
  a: '张大嘴巴 a a a',
  o: '圆圆嘴巴 o o o',
  e: '扁扁嘴巴 e e e',
  i: '牙齿对齐 i i i',
  u: '嘴巴突出 u u u',
  y: '小树分杈，认一认 y 的样子',
  w: '屋顶相连，认一认 w 的样子',
  g: '像一条小辫子，尾巴向下弯',
  k: '一根小棒，右边伸出两条斜线',
  h: '像一把小椅子，靠背高高的',
  j: '小钩子向下弯，头上一点别忘记',
  q: '圆圆气球向左靠，细细绳子垂下来',
  x: '两条斜线交个叉',
  z: '像数字二，注意三个笔画',
  c: '半圆开口朝右边',
  s: '弯弯曲曲，像一条小路',
  zh: '舌尖轻轻翘起来，和小椅子做朋友',
  ch: '舌尖翘起来，轻轻送出一口气',
  sh: '舌尖翘起来，让气流慢慢通过',
  r: '小苗发芽，舌尖轻轻翘起来',
  b: '右下半圆，轻轻闭唇',
  p: '右上半圆，纸条飘起来',
  d: '左下半圆，舌尖轻轻弹',
  t: '小伞把，纸条飘起来',
  n: '一个门洞，鼻子也唱歌',
  l: '一根小棒，舌尖轻轻抬',
  f: '小拐杖，牙齿碰下唇',
  m: '两个门洞，嘴唇轻轻合',
  v: '嘴吹口哨 ü ü ü，两点要留住',
};
const letters = letterRows.flatMap(([ids, lesson, kind]) =>
  ids.split(' ').map((id) => ({
    id,
    kind,
    lesson,
    callSound: calls[id] ?? id + '1',
    mnemonic: mnemonics[id] ?? '看一看，听一听，再读给台长听',
    grid: /[bdfhklt]/.test(id) ? 'upper-middle' : /[gjpqy]/.test(id) ? 'middle-lower' : 'middle',
  })),
);
function syllableLesson(id) {
  const initial = /^(zh|ch|sh|[bpmfdtnlgkhjqxzcsryw])/.exec(id)?.[1] ?? '';
  if (!initial) return 1;
  return ['y', 'w'].includes(initial)
    ? 2
    : 'bpmf'.includes(initial)
      ? 3
      : 'dtnl'.includes(initial)
        ? 4
        : 'gkh'.includes(initial)
          ? 5
          : 'jqx'.includes(initial)
            ? 6
            : 'zcs'.includes(initial)
              ? 7
              : 8;
}
const words = [];
function word(id, hanzi, syllables, kind = 'noun', beyond = false, chunks) {
  words.push({
    id,
    hanzi,
    syllables: syllables.split(' '),
    display: pinyin(hanzi, { toneType: 'symbol', nonZh: 'removed' }),
    picture: id,
    kind,
    lesson: beyond ? 10 : Math.max(...syllables.split(' ').map(syllableLesson)),
    beyond,
    source: '家庭拼音练习与试卷题型',
    ...(chunks ? { chunks } : {}),
  });
}
word('po', '婆', 'po2');
word('ba-target', '靶', 'ba3');
word('nose', '鼻', 'bi2');
word('lv', '驴', 'lv2');
word('lu', '路', 'lu4');
word('lifa', '理发', 'li3 fa4', 'action');
word('dabo', '大伯', 'da4 bo2');
word('nv', '女', 'nv3');
word('pipa', '琵琶', 'pi2 pa0');
word('laba', '喇叭', 'la3 ba0');
word('bi', '笔', 'bi3');
word('mabu', '抹布', 'ma1 bu4');
word('ditu', '地图', 'di4 tu2');
word('mo', '墨', 'mo4');
word('ti', '踢', 'ti1', 'action');
word('pu', '扑', 'pu1', 'action');
word('la', '拉', 'la1', 'action');
word('ba', '拔', 'ba2', 'action');
word('pa', '爬', 'pa2', 'action');
word('mo-action', '摸', 'mo1', 'action');
word('nitu', '泥土', 'ni2 tu3');
word('muma', '木马', 'mu4 ma3');
word('labi', '蜡笔', 'la4 bi3');
word('pubu', '瀑布', 'pu4 bu4');
word('futi', '扶梯', 'fu2 ti1');
word('baba', '爸爸', 'ba4 ba0');
word('mama', '妈妈', 'ma1 ma0');
word('didi', '弟弟', 'di4 di0');
word('milu', '迷路', 'mi2 lu4', 'action');
word('mi', '米', 'mi3');
word('bu', '布', 'bu4');
word('tu', '兔', 'tu4');
word('ma', '马', 'ma3');
word('li', '梨', 'li2');
word('eight-pears', '桌子上有＿个＿', 'ba1 li2', 'cloze', false, ['ba1', 'li2']);
words.at(-1).frame = ['桌子上有', '个', ''];
word('didi-milu', '弟弟迷路了', 'di4 di0 mi2 lu4 le0', 'sentence', false, ['di4 di0', 'mi2 lu4', 'le0']);
word('dabo-papati', '大伯爬爬梯', 'da4 bo2 pa2 pa2 ti1', 'sentence', false, ['da4 bo2', 'pa2', 'pa2 ti1']);
word('rabbit-carrot', '一只小白＿在＿萝卜', 'tu4 ba2', 'cloze', false, ['tu4', 'ba2']);
words.at(-1).frame = ['一只小白', '在', '萝卜'];
const groups = {
  cloth: ['bu', 'mabu'],
  horse: ['ma', 'muma', 'lv'],
  pen: ['bi', 'labi'],
  person: ['baba', 'mama', 'didi', 'dabo', 'po', 'nv'],
  pear: ['li', 'eight-pears'],
  climbing: ['pa', 'futi'],
};
extendCurriculum(word, words);
for (const w of words) {
  w.semanticGroup ??= Object.entries(groups).find(([, ids]) => ids.includes(w.id))?.[0] ?? w.id;
  w.source = w.id === 'lv' ? '家庭补充练习（非试卷）' : '家庭拼音练习与试卷题型';
}
// Explicit elementary/neutral-tone readings take precedence over dictionary citation readings.
const tone = { a: 'āáǎà', o: 'ōóǒò', e: 'ēéěè', i: 'īíǐì', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
function display(s) {
  const t = +s.at(-1),
    raw = s.slice(0, -1).replaceAll('v', 'ü');
  if (!t) return raw;
  let i = raw.includes('a')
    ? raw.indexOf('a')
    : raw.includes('e')
      ? raw.indexOf('e')
      : raw.includes('o')
        ? raw.indexOf('o')
        : Math.max(raw.lastIndexOf('i'), raw.lastIndexOf('u'), raw.lastIndexOf('ü'));
  return raw.slice(0, i) + tone[raw[i]][t - 1] + raw.slice(i + 1);
}
for (const w of words) w.display = w.syllables.map(display).join(' ');
const confusions = [
  {
    pair: ['b', 'p'],
    type: 'aspiration',
    minimalPairs: [
      ['ba1', 'pa1'],
      ['bo2', 'po2'],
      ['bu4', 'pu4'],
    ],
    tip: '把小纸条放嘴前，读 p 时让它飘起来。',
  },
  {
    pair: ['d', 't'],
    type: 'aspiration',
    minimalPairs: [
      ['da1', 'ta1'],
      ['du4', 'tu4'],
    ],
    tip: '把小纸条放嘴前，舌尖弹一下，读 t 时让纸条飘起来。',
  },
  {
    pair: ['b', 'd'],
    type: 'visual',
    minimalPairs: [['ba1', 'da1']],
    tip: '先找小肚子的方向：b 在右下，d 在左下。',
  },
  {
    pair: ['l', 'n'],
    type: 'nasal',
    minimalPairs: [
      ['lu4', 'nu4'],
      ['lv3', 'nv3'],
      ['li2', 'ni2'],
    ],
    tip: '轻轻捏住鼻子读，n 的声音会被挡住，l 还能读出来。',
  },
  {
    pair: ['2', '3'],
    type: 'tone',
    minimalPairs: [['ba2', 'ba3']],
    tip: '二声像上坡，三声先下坡再上坡。',
  },
];
confusions.push(
  { pair: ['1', '2'], type: 'tone', minimalPairs: [['po1', 'po2']], tip: '一声平平走，二声往上坡。' },
  { pair: ['3', '4'], type: 'tone', minimalPairs: [['ba3', 'ba4']], tip: '三声先下坡再上坡，四声往下滑。' },
  {
    pair: ['p', 'f'],
    type: 'initial',
    minimalPairs: [
      ['pu4', 'fu4'],
      ['po2', 'fo2'],
    ],
    tip: '读 p 先合上嘴唇再送气，读 f 用上牙轻碰下唇。',
  },
);
confusions.push(
  {
    pair: ['g', 'k'],
    type: 'aspiration',
    minimalPairs: [['ge4', 'ke4']],
    tip: '小纸条放嘴前，读 k 时送出一口气。',
  },
  {
    pair: ['j', 'q'],
    type: 'aspiration',
    minimalPairs: [['ji1', 'qi1']],
    tip: '读 q 时气送得多一点，看看小纸条会不会动。',
  },
  {
    pair: ['z', 'c'],
    type: 'aspiration',
    minimalPairs: [['za1', 'ca1']],
    tip: '舌尖不翘起，读 c 时轻轻送气。',
  },
  {
    pair: ['zh', 'ch'],
    type: 'aspiration',
    minimalPairs: [['zhu1', 'chu1']],
    tip: '两次都翘舌，读 ch 时多送一口气。',
  },
  {
    pair: ['z', 'zh'],
    type: 'retroflex',
    minimalPairs: [['zu3', 'zhu3']],
    tip: '先不翘舌，再轻轻翘起舌尖，听听声音的小变化。',
  },
  {
    pair: ['s', 'sh'],
    type: 'retroflex',
    minimalPairs: [['sa1', 'sha1']],
    tip: '先让舌尖平放，再轻轻翘起，慢慢比较两个声音。',
  },
);
const syl = new Map();
function add(id, lesson) {
  if (syl.has(id)) {
    syl.get(id).lesson = Math.min(syl.get(id).lesson, lesson);
    return;
  }
  const m = /^(zh|ch|sh|[bpmfdtnlgkhjqxzcsryw]?)(.+)([0-4])$/.exec(id);
  syl.set(id, {
    id,
    display: display(id),
    initial: m[1],
    final: m[2],
    tone: +m[3],
    lesson,
    audio: `py.syl.${id}`,
  });
}
for (const l of letters) if (l.lesson <= 8) add(l.callSound, l.lesson);
for (const c of confusions) for (const p of c.minimalPairs) for (const id of p) add(id, syllableLesson(id));
for (const w of words) for (const id of w.syllables) add(id, w.beyond ? 8 : w.lesson);
// Deliberately selected familiar readings and consonant calls, not a four-tone cartesian product.
const familiar = {
  a: '1234',
  e: '1234',
  yi: '1234',
  wu: '1234',
  yu: '1234',
  ba: '1234',
  pa: '124',
  ma: '1234',
  bo: '1234',
  po: '1234',
  mo: '1234',
  fo: '12',
  bu: '1234',
  pu: '1234',
  mu: '234',
  fu: '1234',
  fa: '124',
  bi: '1234',
  pi: '1234',
  mi: '1234',
  da: '1234',
  ta: '134',
  na: '1234',
  la: '1234',
  de: '12',
  te: '14',
  ne: '1',
  le: '14',
  di: '1234',
  ti: '1234',
  ni: '1234',
  li: '1234',
  du: '1234',
  tu: '1234',
  nu: '4',
  lu: '124',
  nv: '3',
  lv: '234',
};
for (const [base, tones] of Object.entries(familiar))
  for (const t of tones)
    add(
      base + t,
      ['a', 'o', 'e'].includes(base)
        ? 1
        : ['yi', 'wu', 'yu'].includes(base)
          ? 2
          : /^[bpmf]/.test(base)
            ? 3
            : 4,
    );
const praise = [
  '你把声音和图画连起来了',
  '你找到了词语里的意思',
  '你先想一想再选择，很仔细',
  '两段声音被你接在一起了',
  '你留住了小鱼的两颗泡泡',
  '你听出了声音的小变化',
  '你把声调送上了小山坡',
  '你让拼音排好了队',
  '你愿意再试一次，信号更清楚了',
  '你把每一小段都照顾到了',
  '你的眼睛找到了关键的小肚子',
  '你把纸条吹得轻轻飘起来了',
  '你把一个词拆开又合起来了',
  '你认真听完再动手',
  '你把今天的声音送到了星港',
  '你找到了一条新的拼读小路',
  '你把这幅图说给拼音听了',
  '你让字母和声调一起站好了',
  '你把句子的意思接通了',
  '你慢慢读，台长听见了你的努力',
  '你发现了两个声音的不同',
  '你把熟悉的声音认出来了',
];
fs.writeFileSync(
  out,
  JSON.stringify(
    { lessons, letters, syllables: [...syl.values()], words, confusions, praise, scenes: sceneBank(words) },
    null,
    2,
  ) + '\n',
);
console.log(`${letters.length} letters, ${syl.size} syllables, ${words.length} words`);
