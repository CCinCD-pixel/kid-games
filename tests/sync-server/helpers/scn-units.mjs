// scn-units.mjs -- small server units (port of the prototype unit.mjs): ip normalisation (IPv6 /64), CIDR match, limiter hard cap, backup rotation
// (14 daily + 8 weekly) with fake dates, schema-version refusal, atomic LAST_OK, restore swaps the epoch.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ipKey, inCidr, Limiter, runBackup, openDb, CFG, SCHEMA_VERSION, ID_RE } from '../../../docs/ops/kg-sync/server.mjs';
import { checker } from './inproc.mjs';

const { chk, done } = checker();
const dir = process.env.KG_TEST_DIR || process.cwd();
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) fs.rmSync(f + s, { force: true }); };

chk('IPv6 aggregated to /64', ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd') === ipKey('2001:db8:1:2:1:2:3:4') && ipKey('2001:db8:1:3::1') !== ipKey('2001:db8:1:2::1'));
chk('::ffff:1.2.3.4 -> 1.2.3.4', ipKey('::ffff:1.2.3.4') === '1.2.3.4');
chk('CIDR match / non-match / exact address', inCidr('172.30.77.5', ['172.30.77.0/24']) && !inCidr('172.30.78.5', ['172.30.77.0/24']) && inCidr('127.0.0.1', ['127.0.0.0/8']) && !inCidr('8.8.8.8', ['10.0.0.0/8']) && inCidr('1.2.3.4', ['1.2.3.4']));
chk('CIDR /0 matches everything, /32 only itself, garbage never matches', inCidr('9.9.9.9', ['0.0.0.0/0']) && inCidr('1.2.3.4', ['1.2.3.4/32']) && !inCidr('1.2.3.5', ['1.2.3.4/32']) && !inCidr('not-an-ip', ['10.0.0.0/8']) && !inCidr('10.0.0.1', ['garbage/8']));
chk('ledger ID_RE: the one shared charset (dots, colons, dashes, underscores; 3..96)', ID_RE.test('first:mars-base:orbit.O1.0') && ID_RE.test('a1b2c3d4.lx3k9f2a.0a1') && ID_RE.test('abc') && !ID_RE.test('ab') && !ID_RE.test('a'.repeat(97)) && ID_RE.test('a'.repeat(96)) && !ID_RE.test('bad id!') && !ID_RE.test('../x') && !ID_RE.test('a/b') && !ID_RE.test('é12'));
{
  let t = 1000;
  const L = new Limiter(() => t, 1000);
  for (let i = 0; i < 100000; i++) L.hit('ip' + i, 5, 900);
  chk('limiter map never grows past its hard cap (100 000 distinct sources, cap 1000)', L.m.size <= 1000, String(L.m.size));
  const L2 = new Limiter(() => t, 1000);
  const r = [1, 2, 3, 4, 5, 6].map(() => L2.hit('k', 5, 60));
  chk('limiter: 5 allowed, 6th refused with Retry-After', r.slice(0, 5).every((x) => x === 0) && r[5] === 60, JSON.stringify(r));
  t += 61;
  chk('limiter: window passes -> allowed again', L2.hit('k', 5, 60) === 0);
}
{
  const bdir = path.join(dir, 'bak-unit');
  fs.rmSync(bdir, { recursive: true, force: true });
  const dbf = path.join(dir, 'unit.db');
  rmdb(dbf);
  const db = openDb(dbf);
  let last;
  for (let d = 0; d < 120; d++) last = await runBackup(db, bdir, CFG, new Date(Date.UTC(2026, 0, 1 + d, 3, 17)));
  const files = fs.readdirSync(bdir).filter((f) => f.endsWith('.db'));
  const dly = files.filter((f) => f.startsWith('kg-d-'));
  const wk = files.filter((f) => f.startsWith('kg-w-'));
  chk('120 nightly backups -> 14 daily + 8 weekly kept', dly.length === 14 && wk.length === 8, `${dly.length}/${wk.length}`);
  chk('the newest daily is the last day, the oldest kept daily is 14 days back', dly.sort()[13] === 'kg-d-2026-04-30.db' && dly[0] === 'kg-d-2026-04-17.db', `${dly[0]} .. ${dly[13]}`);
  chk('LAST_OK written with integrity ok', JSON.parse(fs.readFileSync(path.join(bdir, 'LAST_OK'), 'utf8')).integrity === 'ok' && last.integrity === 'ok');
  chk('no temp file left behind (backup tmp, LAST_OK tmp)', !fs.readdirSync(bdir).some((f) => f.startsWith('.tmp') || f.endsWith('.tmp')));
  const b = new DatabaseSync(path.join(bdir, dly[13]));
  chk('a backup file opens and has the schema + an epoch', b.prepare("SELECT COUNT(*) c FROM meta WHERE k='epoch'").get().c === 1 && Number(Object.values(b.prepare('PRAGMA user_version').get())[0]) === SCHEMA_VERSION);
  b.close();
  db.close();
}
{
  const f = path.join(dir, 'newer.db');
  rmdb(f);
  const d = new DatabaseSync(f);
  d.exec(`PRAGMA user_version=${SCHEMA_VERSION + 1}`);
  d.close();
  let refused = false;
  try { openDb(f); } catch (e) { refused = /newer than this server/.test(e.message); }
  chk('a database written by a NEWER schema is refused (no silent downgrade)', refused);
  rmdb(f);
}
done();
