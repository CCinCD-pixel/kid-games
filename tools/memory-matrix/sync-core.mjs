// Mirrors the oracle (tools/memory-matrix/proto/*.mjs = the specification, spec §10.1) into the page's production modules
// site/memory-matrix/src/core/*.ts, function for function. The mirror is GENERATED: edit the oracle, run
//   node tools/memory-matrix/sync-core.mjs          (writes)         node tools/memory-matrix/sync-core.mjs --check   (exit 1 when stale)
// and the vitest suite (golden fixtures + selftest + traces) proves the TS behaves exactly like the oracle.
import fs from 'node:fs';
import path from 'node:path';
const here = new URL('.', import.meta.url).pathname;
const SRC = path.join(here, 'proto'), DST = path.join(here, '..', '..', 'site', 'memory-matrix', 'src', 'core');
const FILES = ['grid', 'params', 'gen', 'controller', 'veteran', 'save', 'cards', 'constellations'];
const check = process.argv.includes('--check');
let stale = 0;
for (const f of FILES) {
  let t = fs.readFileSync(path.join(SRC, `${f}.mjs`), 'utf8');
  const cut = t.search(/^\/\*\* Optional ground-truth check|^if \(process\.argv\[1\]/m);       // tool-only tails (CLI blocks, HYG verifier) stay in the oracle
  if (cut >= 0) t = t.slice(0, cut);
  t = t.replace(/from '\.\/([\w-]+)\.mjs'/g, "from './$1'").replace(/\n+$/, '\n');
  const out = `// @ts-nocheck\n// GENERATED from tools/memory-matrix/proto/${f}.mjs by tools/memory-matrix/sync-core.mjs - do not edit; change the oracle and re-run the script.\n${t}`;
  const dst = path.join(DST, `${f}.ts`);
  const cur = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : '';
  if (cur !== out) { stale += 1; if (!check) fs.writeFileSync(dst, out); }
}

// ---- the oracle's validators, run against the TS core inside vitest (src/oracle/*): same code, same thresholds, imports pointed at src/core.
const OD = path.join(DST, '..', 'oracle');
fs.mkdirSync(OD, { recursive: true });
const CORE = new Set(['rng', 'grid', 'params', 'gen', 'controller', 'veteran', 'save', 'cards', 'constellations']);
const retarget = (t) => t.replace(/from '\.\/([\w-]+)\.mjs'/g, (m, n) => `from '${CORE.has(n) ? '../core/' : './'}${n}'`);
function emit(name, body) {
  const dst = path.join(OD, name), cur = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : '';
  if (cur !== body) { stale += 1; if (!check) fs.writeFileSync(dst, body); }
}
for (const f of ['bots', 'golden', 'stats', 'sim', 'pacing']) {
  let t = retarget(fs.readFileSync(path.join(SRC, `${f}.mjs`), 'utf8')).replace(/process\.exit\(/g, '__exit(').replace(/process\.argv\[1\]\.endsWith/g, "(process.argv[1] ?? '').endsWith");
  emit(`${f}.ts`, `// @ts-nocheck\n// GENERATED from tools/memory-matrix/proto/${f}.mjs by sync-core.mjs - the oracle's validator, pointed at the TS core.\nimport { __exit } from './harness';\n${t}`);
}
{ // selftest -> one vitest case
  const lines = retarget(fs.readFileSync(path.join(SRC, 'selftest.mjs'), 'utf8')).split('\n');
  const imports = lines.filter((l) => l.startsWith('import ')), body = lines.filter((l) => !l.startsWith('import ') && !/quiet/.test(l));
  const joined = body.join('\n').replace(/let bad = 0; const ok = [^\n]*/, 'const failures = []; const ok = (c, m) => { if (!c) failures.push(m); };').replace(/console\.log\(`selftest failed: \$\{bad\}`\); process\.exit\(bad \? 1 : 0\);/, 'expect(failures).toEqual([]);');
  emit('selftest.test.ts', `// @ts-nocheck\n// GENERATED from tools/memory-matrix/proto/selftest.mjs by sync-core.mjs - the oracle's 91 self-tests run on the TS core.\nimport { describe, it, expect } from 'vitest';\n${imports.join('\n')}\ndescribe('oracle selftest on the TS core', () => {\n  it('every check passes', () => {\n${joined}\n  }, 300_000);\n});\n`);
}
console.log(check ? `core mirror stale files: ${stale}` : `core mirror written (${stale} changed)`);
process.exit(check && stale ? 1 : 0);
