// Rebuild the initial, parent-reviewable bank. Runtime and validators consume bank.json.
import fs from 'node:fs';
import { pinyin } from 'pinyin-pro';
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
  b: '右下半圆，轻轻闭唇',
  p: '右上半圆，纸条飘起来',
  d: '左下半圆，舌尖轻轻弹',
  t: '小伞把，纸条飘起来',
  n: '一个门洞，鼻子也唱歌',
  l: '一根小棒，舌尖轻轻抬',
  f: '小拐杖，牙齿碰下唇',
  m: '两个门洞，嘴唇轻轻合',
  v: '小鱼吐泡泡，两点要留住',
};
const letters = letterRows.flatMap(([ids, lesson, kind]) =>
  ids
    .split(' ')
    .map((id) => ({
      id,
      kind,
      lesson,
      callSound: calls[id] ?? id + '1',
      mnemonic: mnemonics[id] ?? '看一看，听一听，再读给台长听',
      grid: /[bdfhklt]/.test(id) ? 'upper-middle' : /[gpqy]/.test(id) ? 'middle-lower' : 'middle',
    })),
);
const words = [];
function word(id, hanzi, syllables, kind = 'noun', beyond = false, chunks) {
  words.push({
    id,
    hanzi,
    syllables: syllables.split(' '),
    display: pinyin(hanzi, { toneType: 'symbol', nonZh: 'removed' }),
    picture: id,
    kind,
    lesson: /^(pipa|laba|bi|mo|ma|ba|mi|bu)$/.test(id) ? 3 : 4,
    beyond,
    source: '家庭拼音练习与试卷题型',
    ...(chunks ? { chunks } : {}),
  });
}
word('po', '婆', 'po2');
word('ba-target', '靶', 'ba3');
word('nose', '鼻', 'bi2');
word('lv', '驴', 'lv2');
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
word('eight-pears', '八个梨', 'ba1 ge4 li2', 'phrase', true);
word('didi-milu', '弟弟迷路了', 'di4 di0 mi2 lu4 le0', 'sentence', false, ['di4 di0', 'mi2 lu4', 'le0']);
word('baba-pati', '爸爸爬梯', 'ba4 ba0 pa2 ti1', 'sentence', false, ['ba4 ba0', 'pa2', 'ti1']);
word('rabbit-carrot', '小白兔在拔萝卜', 'xiao3 bai2 tu4 zai4 ba2 luo2 bo0', 'sentence', true, [
  'xiao3 bai2 tu4',
  'zai4',
  'ba2',
  'luo2 bo0',
]);
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
    tip: '舌尖弹一下，读 t 时送出一小口气。',
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
      ['lv2', 'nv2'],
      ['lu4', 'nu4'],
    ],
    tip: '捏住鼻子试一试，n 的鼻子也在唱歌。',
  },
  {
    pair: ['2', '3'],
    type: 'tone',
    minimalPairs: [
      ['ba2', 'ba3'],
      ['po1', 'po2'],
    ],
    tip: '二声像上坡，三声先拐弯再往上。',
  },
];
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
for (const l of letters) if (l.lesson <= 4) add(l.callSound, l.lesson);
for (const c of confusions) for (const p of c.minimalPairs) for (const id of p) add(id, 4);
for (const w of words) for (const id of w.syllables) add(id, w.beyond ? 8 : w.lesson);
for (const base of [
  'a',
  'e',
  'yi',
  'wu',
  'yu',
  'ba',
  'pa',
  'ma',
  'bo',
  'po',
  'mo',
  'fo',
  'bu',
  'pu',
  'mu',
  'fu',
  'da',
  'ta',
  'na',
  'la',
  'de',
  'te',
  'ne',
  'le',
  'di',
  'ti',
  'ni',
  'li',
  'du',
  'tu',
  'nu',
  'lu',
  'nv',
  'lv',
])
  for (let t = 1; t <= 4; t++)
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
  JSON.stringify({ lessons, letters, syllables: [...syl.values()], words, confusions, praise }, null, 2) +
    '\n',
);
console.log(`${letters.length} letters, ${syl.size} syllables, ${words.length} words`);
