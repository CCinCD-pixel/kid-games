import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = new URL('../../../', import.meta.url),
  out = new URL('public/audio/pinyin-station/', root);
const bank = JSON.parse(fs.readFileSync(new URL('content/pinyin-station/bank.json', root), 'utf8'));
const revision = 'aa25ecce7b7fb02757b2c2b8e3c01aa975812edc';
const manifestPath = new URL('audio-manifest.json', out);
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const index = {};
for (const syl of bank.syllables.filter((s) => s.tone > 0)) {
  if (syl.id === 'o1') continue; // Separate CC0 Lingua Libre recording; see LICENSES.md.
  const source = syl.id
    .replace(/^i([1-4])$/, 'yi$1')
    .replace(/^u([1-4])$/, 'wu$1')
    .replaceAll('v', 'uu');
  index[source] ??= [];
  index[source].push(syl);
}
const failures = [];
// Call sounds of lessons 9-13 (letters whose callSound is not a bank syllable): REAL recordings of the same library, never TTS
// (2026-11-01, dad: a TTS voice cannot be trusted to say an isolated final). callSound id -> library file; ids not listed use
// their own name. eng1 and ong1 have no usable recording (see README "需要真人补录"): they stay absent, the game plays nothing.
const CALL_SOURCE = { ui1: 'wei1', iu1: 'you1', ie1: 'ye1', ve1: 'yue1', er1: 'er2', in1: 'yin1', un1: 'wen1', vn1: 'yun1', ing1: 'ying1' };
// ong1: the library's weng1 was withdrawn on 2026-11-01 (dad doubted it, ASR heard 温): needs a real ōng recording, see README.
const CALL_MISSING = ['eng1', 'ong1'];
const CALL_DISPLAY = { ai1: 'āi', ei1: 'ēi', ui1: 'uī', ao1: 'āo', ou1: 'ōu', iu1: 'iū', ie1: 'iē', ve1: 'üē', er1: 'ér', an1: 'ān', en1: 'ēn', in1: 'īn', un1: 'ūn', vn1: 'ǖn', ang1: 'āng', ing1: 'īng', ong1: 'ōng', ye1: 'yē', yue1: 'yuē', yin1: 'yīn', yun1: 'yūn', yuan1: 'yuān', ying1: 'yīng' };
const syllableIds = new Set(bank.syllables.map((s) => s.id));
for (const letter of bank.letters.filter((l) => l.lesson >= 9 && !syllableIds.has(l.callSound))) {
  if (CALL_MISSING.includes(letter.callSound)) continue;
  const display = CALL_DISPLAY[letter.callSound];
  if (!display) throw new Error(`no display for call sound ${letter.callSound}`);
  const source = CALL_SOURCE[letter.callSound] ?? letter.callSound;
  index[source] ??= [];
  index[source].push({ id: letter.callSound, audio: `py.syl.${letter.callSound}`, display });
}
// Stage 1 of the 拼音城堡 alignment (2026-11-06; run with --stage1): exactly the library syllables the school workbook's lessons 10-13 (game stations 9-12)
// need and the game does not have yet (audit §3.3 P1, 81 names). Library name -> game id: ü is "uu" in the library, "v" in the game (luue4 -> lve4);
// every other name is the game id. `er1` is already a manifest key (the card call sound, an alias of the real recording er2 = ér), so it is NOT imported.
const STAGE1 = 'ai2 ai3 ai4 ei2 ei3 ei4 wei2 wei3 wei4 nai3 zhai1 lei4 fei3 zei2 rui4 sui2 chui1 guai1 huai4 kuai4 zhuai3 ao2 ao3 ao4 ou2 ou3 ou4 you2 you3 you4 bao1 mao4 pao3 dou1 lou4 shou3 miu4 niu2 jiu3 ye2 ye3 ye4 yue2 yue3 yue4 er1 er3 er4 tie3 jie3 qie2 jue2 xue2 luue4 an2 an3 an4 en2 en3 en4 yin2 yin3 yin4 wen2 wen3 wen4 yun2 yun3 yun4 yuan2 yuan3 yuan4 pan2 chan3 men2 ken3 pin1 jin4 dun4 tun1 jun1'.split(' ');
const marked = (id) => {
  const body = id.slice(0, -1).replaceAll('v', 'ü'), tone = Number(id.slice(-1)), marks = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
  const at = body.includes('a') ? body.indexOf('a') : body.includes('e') ? body.indexOf('e') : body.includes('ou') ? body.indexOf('o') : Math.max(...[...'aeiouü'].map((c) => body.lastIndexOf(c)));
  return body.slice(0, at) + marks[body[at]][tone - 1] + body.slice(at + 1);
};
// Stage 2 (2026-11-06): the 25 single syllables the 36 new school words are made of (castle-ui-stage2a.md): same library, same commit.
const STAGE2 = 'ban3 bao4 cai4 chu4 dao1 die2 dou4 gui1 hei1 hui2 jian4 jiao3 lao3 mai4 mei2 piao4 qian1 que4 qun2 rao4 shan1 shui3 tuo1 zhi3 zui3'.split(' ');
// Stage 3 (2026-11-07): the syllables the workbook-aligned stage 3 needs (castle-stage3-lines.json syllableClips, 103 ids): 97 library names; i2-i4 / u2-u4 are
// aliases of the yi / wu recordings (same sound), and a name whose library file is already imported under another key (wei1 wen1 you1) is aliased too, not re-imported.
const STAGE3 = 'ban1 ben1 chi2 chi4 chu3 chuo1 ci2 ci3 ci4 dan4 dao3 fa3 fan1 fang2 fen1 ga2 gai3 gao1 ge2 gei3 gou1 gua4 guo2 guo3 ha1 hai4 hao4 hei4 hou4 hu1 hua2 ji2 ji3 ji4 jia2 jia3 jia4 jie2 jin1 ka3 kao3 kou3 ku4 kua1 kuo4 lai2 lei2 lie4 lou3 man4 mei4 men4 nai4 nei4 pai2 pan4 pei2 pen2 qi4 qia3 qie4 qin2 qu4 ruo4 sa3 se4 shen1 shi2 shi3 shi4 shu3 si3 tan1 tang2 wei1 wen1 xia2 xia4 xie3 xu1 xu2 xu4 xue3 you1 za2 zao3 ze2 zha1 zhan4 zhen4 zhi2 zhi4 zhu4 zhua1 zhua3 zou3 zu2'.split(' ');
// ao4: the library's ào is a flat line (0.8 semitones, the F0 tracker hears a first tone), so it is withheld from every import until a real fourth tone exists.
const WITHHELD = ['ao4'];
const stageNames = process.argv.includes('--stage3') ? STAGE3 : process.argv.includes('--stage2') ? STAGE2 : process.argv.includes('--stage1') ? STAGE1 : null;
if (stageNames) {
  for (const key of Object.keys(index)) delete index[key];
  for (const name of stageNames) {
    if (WITHHELD.includes(name)) { console.log(`withheld ${name}: no usable recording (see README)`); continue; }
    const gameId = name.replaceAll('uu', 'v');
    if (manifest[`py.syl.${gameId}`]) { console.log(`skip ${gameId}: already a manifest key (see the comment above)`); continue; }
    const existingFile = Object.values(manifest).find((c) => new RegExp(`/human\\.${name}\\.[0-9a-f]{8}\\.`).test(c.src));
    if (existingFile) { manifest[`py.syl.${gameId}`] = { ...existingFile, text: marked(gameId) }; console.log(`alias ${gameId} -> already imported ${name}`); continue; }
    index[name] = [{ id: gameId, audio: `py.syl.${gameId}`, display: marked(gameId) }];
  }
}
// Final-only syllables of the bank (zero initial: ui2, iu3, ie4, ve2, in2, un3, vn4, er2 ...) play the library file of the matching zero-initial
// syllable (wei2, you3, ye4, yue2, yin2, wen3, yun4, er2), exactly like the call-sound aliases ui1 -> wei1: same normalised file, the card's own spelling as subtitle.
const ALIAS_BASE = { ui: 'wei', iu: 'you', ie: 'ye', ve: 'yue', in: 'yin', un: 'wen', vn: 'yun', er: 'er' };
function addFinalAliases() {
  const fileOf = (name) => Object.values(manifest).find((c) => new RegExp(`/human\\.${name}\\.[0-9a-f]{8}\\.`).test(c.src));
  for (const s of bank.syllables) {
    if (s.tone < 1 || s.initial !== '' || !(s.final in ALIAS_BASE) || manifest[s.audio]) continue;
    const base = fileOf(`${ALIAS_BASE[s.final]}${s.tone}`);
    if (!base) { console.log(`no recording ${ALIAS_BASE[s.final]}${s.tone} for ${s.id}`); continue; }
    manifest[s.audio] = { ...base, text: s.display };
  }
}
// Recordings already re-encoded by tools/normalize-syllables.mjs (manifest "processing") are final: a re-import must never
// replace them with the raw download. To start over, restore the originals and re-run normalize-syllables.mjs.
const entries = Object.entries(index).filter(([, syllables]) => !manifest[syllables[0].audio]?.processing);
// Four small HTTP transfers; conversion/inspection stays sequential. No audio is played.
for (let start = 0; start < entries.length; start += 4) {
  const batch = entries.slice(start, start + 4);
  const data = await Promise.all(
    batch.map(async ([id]) => {
      const existing = manifest[`py.syl.${batch.find(([key]) => key === id)[1][0].id}`];
      if (existing && /^davinfifield/.test(existing.source ?? '') && fs.existsSync(new URL('public' + existing.src, root)))
        return fs.readFileSync(new URL('public' + existing.src, root));
      const response = await fetch(
        `https://raw.githubusercontent.com/davinfifield/mp3-chinese-pinyin-sound/${revision}/mp3/${id}.mp3`,
      );
      return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
    }),
  );
  for (let i = 0; i < batch.length; i++) {
    const [source, syllables] = batch[i],
      bytes = data[i];
    if (!bytes) {
      failures.push(source);
      continue;
    }
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 8),
      name = `human.${source}.${hash}.mp3`;
    fs.writeFileSync(new URL(name, out), bytes);
    const seconds = Number(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=nw=1:nk=1',
          new URL(name, out).pathname,
        ],
        { encoding: 'utf8' },
      ),
    );
    for (const s of syllables)
      manifest[s.audio] = {
        src: `/audio/pinyin-station/${name}`,
        text: s.display,
        durationMs: Math.round(seconds * 1000),
        role: 'word',
        source: `davinfifield/${revision}/${source}`,
      };
  }
}
// The public-domain library lacks o. Import its separately verified CC0 recording.
if (!manifest['py.syl.o1'] || !fs.existsSync(new URL('public' + manifest['py.syl.o1'].src, root))) {
  const response = await fetch(
    'https://upload.wikimedia.org/wikipedia/commons/7/74/LL-Q9192_%28cmn%29-Cookai1205-O.wav',
  );
  if (!response.ok) throw new Error('CC0 o recording unavailable');
  const dir = path.join(os.homedir(), 'kid-games-work', 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  const wav = path.join(dir, 'pinyin-o-cc0.wav'),
    encoded = path.join(dir, 'pinyin-o-cc0.m4a');
  try {
    fs.writeFileSync(wav, Buffer.from(await response.arrayBuffer()));
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      wav,
      '-ac',
      '1',
      '-c:a',
      'aac',
      '-b:a',
      '40k',
      encoded,
    ]);
    const bytes = fs.readFileSync(encoded),
      hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 8),
      name = `human.o1.${hash}.m4a`;
    fs.writeFileSync(new URL(name, out), bytes);
    const seconds = Number(
      execFileSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', encoded],
        { encoding: 'utf8' },
      ),
    );
    manifest['py.syl.o1'] = {
      src: `/audio/pinyin-station/${name}`,
      text: 'ō',
      durationMs: Math.round(seconds * 1000),
      role: 'word',
      source: 'LinguaLibre/Cookai1205/CC0',
    };
  } finally {
    for (const file of [wav, encoded]) if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
if (process.argv.includes('--stage3')) {
  for (const [id, base] of [['i', 'yi'], ['u', 'wu']]) for (const tone of [2, 3, 4]) {
    const file = Object.values(manifest).find((c) => new RegExp(`/human\\.${base}${tone}\\.[0-9a-f]{8}\\.`).test(c.src));
    if (file && !manifest[`py.syl.${id}${tone}`]) manifest[`py.syl.${id}${tone}`] = { ...file, text: marked(`${id}${tone}`) };
  }
}
if (stageNames) addFinalAliases();
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Human syllables: ${Object.keys(index).length - failures.length}; missing: ${failures.join(', ') || 'none'}`,
);
if (failures.length) process.exitCode = 1;
