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
const entries = Object.entries(index);
// Four small HTTP transfers; conversion/inspection stays sequential. No audio is played.
for (let start = 0; start < entries.length; start += 4) {
  const batch = entries.slice(start, start + 4);
  const data = await Promise.all(
    batch.map(async ([id]) => {
      const existing = manifest[`py.syl.${batch.find(([key]) => key === id)[1][0].id}`];
      if (existing && fs.existsSync(new URL('public' + existing.src, root)))
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
