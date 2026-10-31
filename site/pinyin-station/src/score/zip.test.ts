import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zip';
import { FIXTURES } from './test-support';

describe('zipStore', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
  });
  it('writes an archive that the system unzip accepts and extracts byte-for-byte', () => {
    const wav = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31) % 251);
    const bytes = zipStore([
      { name: 'manifest.json', data: new TextEncoder().encode('{"ok":"拼音"}') },
      { name: 'wav/a.wav', data: wav },
    ]);
    fs.mkdirSync(FIXTURES, { recursive: true });
    const file = path.join(FIXTURES, '_test-export.zip');
    fs.writeFileSync(file, bytes);
    execFileSync('unzip', ['-tq', file]);
    const back = execFileSync('unzip', ['-p', file, 'wav/a.wav']);
    expect(Uint8Array.from(back)).toEqual(wav);
    expect(execFileSync('unzip', ['-p', file, 'manifest.json'], { encoding: 'utf8' })).toBe('{"ok":"拼音"}');
    fs.rmSync(file);
  });
});
