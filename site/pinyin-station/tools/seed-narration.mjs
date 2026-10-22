import fs from 'node:fs';
const root = new URL('../../../', import.meta.url);
const b = JSON.parse(fs.readFileSync(new URL('content/pinyin-station/bank.json', root), 'utf8'));
const rows = [
  ['welcome', '今天的电台，等你来开播。'],
  ['E', '读一读，找到它的图。'],
  ['F', '看图，把声音拼起来。'],
  ['A', '听一听，找到这个字母。'],
  ['B', '听一听，找到同一个声音。'],
  ['C', '把两段声音接起来。'],
  ['D', '准备好，就读给台长听。'],
  ['G', '点点词卡，把话接起来。'],
  ['hint1', '先听一听，再找线索。'],
  ['hint2', '我们把声音拆开看看。'],
  ['demo', '一起看示范，再接下一条信号。'],
  ['finish', '今天的声音已送到星港，歇一歇吧。'],
  ['unsure', '台长还没听清，一起再听听。'],
  ['recording', '台长正在收听。'],
  ['saved', '你的声音已经留在电台。'],
  ['follow', '听听自己的声音，再和台长比一比。'],
  ['initial', '先找开头的声音。'],
  ['final', '再找后面的声音。'],
  ['tone', '给声音放上小帽子。'],
  ...b.praise.map((text, i) => [`praise.${i}`, text]),
  ...b.words.filter((w) => w.syllables.length > 1).map((w) => [`word.${w.id}`, w.hanzi]),
];
const lines = rows.map(([id, text]) => ({
  id: `py.${id}`,
  role: id.startsWith('word.') ? 'word' : 'companion',
  text,
}));
// JSON is valid YAML 1.2 and avoids another build-time parser.
fs.writeFileSync(
  new URL('content/narration/pinyin-station.yaml', root),
  JSON.stringify({ game: 'pinyin-station', lines }, null, 2) + '\n',
);
console.log(`${lines.length} contextual narration lines; no isolated-syllable TTS`);
