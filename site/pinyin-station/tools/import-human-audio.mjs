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
// their own name. eng1 has no recording in the library (see README "需要真人补录"): it stays absent, the game plays nothing.
const CALL_SOURCE = { ui1: 'wei1', iu1: 'you1', ie1: 'ye1', ve1: 'yue1', er1: 'er2', in1: 'yin1', un1: 'wen1', vn1: 'yun1', ing1: 'ying1', ong1: 'weng1' };
const CALL_MISSING = ['eng1'];
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
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(
  `Human syllables: ${Object.keys(index).length - failures.length}; missing: ${failures.join(', ') || 'none'}`,
);
if (failures.length) process.exitCode = 1;
