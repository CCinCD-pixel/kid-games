#!/usr/bin/env node
/**
 * Turns the parent page's "导出标注集" ZIP into the layout the pinyin-lab scripts read:
 *   <lab>/data/wav16k/child/<id>.wav          (16 kHz mono PCM, copied as is)
 *   <lab>/data/child_inventory.json           {"child":[{id:"child:<id>", src:<abs wav>, syl:"ni2", label, ...}]}
 * Same record shape as data/inventory.json's "real" entries (id / src / syl), plus the parent's label and the app's
 * own scorer output, so 10_tone.py-style scripts can load the clips and score them against the human labels.
 * Usage: node export-to-lab.mjs <export.zip> [labDir]      Never plays audio.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const [zip, labArg] = process.argv.slice(2);
if (!zip) {
  console.error('usage: export-to-lab.mjs <export.zip> [labDir]');
  process.exit(2);
}
const lab = labArg ?? path.join(os.homedir(), 'kid-games-work/pinyin-lab');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinyin-export-'));
try {
  execFileSync('unzip', ['-q', zip, '-d', tmp]);
  const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'pinyin-station-recordings') throw new Error('not a pinyin-station export');
  const wavDir = path.join(lab, 'data/wav16k/child');
  fs.mkdirSync(wavDir, { recursive: true });
  const child = [];
  for (const r of manifest.rows) {
    const dest = path.join(wavDir, `${r.id}.wav`);
    fs.copyFileSync(path.join(tmp, r.file), dest);
    child.push({
      id: `child:${r.id}`,
      src: dest,
      syl: r.syllable,
      initial: r.initial,
      final: r.final,
      tone: r.tone,
      label: r.label,
      parentUnsure: r.parentUnsure,
      adultLab: r.adultLab,
      confusions: r.confusions,
      at: r.at,
      local: r.local,
      tencent: r.tencent,
      quality: r.capture?.quality ?? null,
      device: r.device,
    });
  }
  fs.writeFileSync(path.join(lab, 'data/child_inventory.json'), JSON.stringify({ child }, null, 1));
  const labelled = child.filter((c) => c.label).length;
  console.log(`wrote ${child.length} clips (${labelled} labelled) to ${wavDir} and data/child_inventory.json`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
