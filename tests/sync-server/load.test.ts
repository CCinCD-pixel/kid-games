// Suite 4/4 -- load, memory, backup under load, restore drill, container health-check command (docs/specs/sync.md section 5 "实测", section 6.4, section 7).
// ~20 000 mixed requests (32 concurrent) against a REAL server process started with the production heap cap; thresholds are generous for a shared CI box
// (prototype on an idle M-series Mac: ~15 000 req/s, p99 7.5 ms, RSS 53 -> 78 MB, 105 MB peak with a concurrent backup; container limit 256 MB).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BUNDLE, CACHE, K, boot, cli, enroll, fam, mustRun, portAllocator, putStore, rmdb, rmrf, sealB, sleep, tmpDir, type Fam, type Srv } from './helpers/proc';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
const alloc = portAllocator(59400);
let dir = '';
const running: Srv[] = [];
beforeAll(() => {
  if (mustRun) dir = tmpDir('load');
});
afterAll(async () => {
  await Promise.all(running.map((s) => s.stop()));
  if (dir) rmrf(dir);
});

let sampler: ReturnType<typeof setInterval> | undefined;
afterAll(() => clearInterval(sampler));
const TOTAL = 20_000;
const CONC = 32;

describe.skipIf(!mustRun)('load: 20 000 mixed requests, memory, backup while under load, restore drill', () => {
  let L: Srv;
  let bdir = '';
  const fams: Fam[] = [];
  const num: Record<string, number> = {};
  let peak = 0;

  beforeAll(async () => {
    bdir = path.join(dir, 'backup');
    L = await boot(
      alloc,
      dir,
      {
        KG_ENROLL_PER_HOUR: '60',
        KG_ENROLL_GLOBAL_PER_HOUR: '120',
        KG_RATE_MULT: '100000',
        KG_LEDGER_MAX: String(8 * 1024 * 1024),
        KG_LEDGER_COUNT: '100000',
        KG_MAX_FAMILIES: '20',
        KG_STORES_MAX: String(4 * 1048576),
        KG_BACKUP_DIR: bdir,
        KG_BACKUP_HOUR: '0',
        KG_BACKUP_FIRST_MS: '2500',
        NODE_OPTIONS: '--max-old-space-size=96', // exactly the production heap cap (compose.yml): the server must stay far below the 256 MB container limit with it
      },
      { name: 'load' },
    );
    running.push(L);
    for (let i = 0; i < 5; i++) {
      const f = await fam();
      expect((await enroll(L, f)).s).toBe(201);
      fams.push(f);
    }
  });

  it('20 000 requests / 32 concurrent: no unexpected errors, p99 and throughput within generous CI bounds, RSS bounded', async () => {
    const sealed = await K.seal(fams[0]!.k, 'x', 1, { d: { blob: 'x'.repeat(8000) }, st: {}, lc: 1 });
    const ev = sealB(110);
    const lat: number[] = [];
    let n = 0;
    let errs = 0;
    let evn = 0;
    const worker = async () => {
      while (n < TOTAL) {
        n++;
        const f = fams[n % fams.length]!;
        const a = { authorization: 'Bearer ' + f.tok, 'content-type': 'application/json' };
        const x = n % 10;
        const t0 = performance.now();
        let status = 0;
        if (x < 5) status = (await fetch(L.base + '/v1/state', { headers: a }).then(async (r) => (await r.text(), r.status)));
        else if (x < 7) status = await fetch(L.base + '/v1/stores/s' + (n % 3), { headers: a }).then(async (r) => (await r.text(), r.status));
        else if (x < 8) {
          const id = 's' + (n % 3);
          const cur = await (await fetch(L.base + '/v1/stores/' + id, { headers: a })).json().catch(() => ({}) as any);
          status = await fetch(L.base + '/v1/stores/' + id, { method: 'PUT', headers: { ...a, 'if-match': `"${cur.rev ?? 0}"` }, body: JSON.stringify({ v: 1, env: sealed }) }).then(async (r) => (await r.text(), r.status));
          if (status === 412) status = 200; // a concurrent writer won: the expected optimistic-concurrency outcome
        } else if (x < 9) status = await fetch(L.base + '/v1/ledger', { method: 'POST', headers: a, body: JSON.stringify({ events: Array.from({ length: 5 }, () => ({ id: 'e.' + evn++ + '.' + (n % 5), env: ev })) }) }).then(async (r) => (await r.text(), r.status));
        else status = await fetch(L.base + '/v1/ledger?after=0&limit=50', { headers: a }).then(async (r) => (await r.text(), r.status));
        lat.push(performance.now() - t0);
        if (status >= 500 || (status >= 400 && status !== 404 && status !== 413)) errs++;
      }
    };
    num.rssIdle = L.rss();
    peak = num.rssIdle;
    sampler = setInterval(() => {
      try {
        peak = Math.max(peak, L.rss());
      } catch {
        /* exited */
      }
    }, 100);
    const t1 = Date.now();
    await Promise.all(Array.from({ length: CONC }, worker));
    const secs = (Date.now() - t1) / 1000;
    lat.sort((p, q) => p - q);
    const pc = (p: number) => lat[Math.floor(lat.length * p)]!;
    num.rps = Math.round(TOTAL / secs);
    num.p50 = +pc(0.5).toFixed(2);
    num.p95 = +pc(0.95).toFixed(2);
    num.p99 = +pc(0.99).toFixed(2);
    num.rssAfterLoad = L.rss();
    expect(lat.length).toBeGreaterThanOrEqual(TOTAL);
    expect(errs).toBe(0);
    expect(num.p99).toBeLessThan(250);
    expect(num.p50).toBeLessThan(100);
    expect(num.rps).toBeGreaterThan(300);
    expect(num.rssIdle).toBeLessThan(120);
    expect(num.rssAfterLoad).toBeLessThan(170);
  });

  it('the nightly in-process backup runs under load: integrity ok, LAST_OK written, /healthz reports its age, peak RSS (load + backup) far below the 256 MB container limit', async () => {
    // second wave of traffic while the backup tick fires (first tick at +2.5 s)
    const a = { authorization: 'Bearer ' + fams[1]!.tok };
    const t0 = Date.now();
    let seen = false;
    while (Date.now() - t0 < 25000 && !seen) {
      await Promise.all(Array.from({ length: 8 }, async () => {
        for (let i = 0; i < 50; i++) await (await fetch(L.base + '/v1/state', { headers: a })).text();
      }));
      seen = L.logs().includes('"ev":"backup"');
      if (!seen) await sleep(50);
    }
    await sleep(150);
    clearInterval(sampler);
    peak = Math.max(peak, L.rss());
    num.rssPeak = peak;
    const line = L.logs().split('\n').find((l) => l.includes('"ev":"backup"')) ?? '';
    expect(line).toContain('"ok":true');
    expect(line).toContain('"integrity":"ok"');
    expect(fs.existsSync(path.join(bdir, 'LAST_OK'))).toBe(true);
    const h = await (await fetch(L.base + '/healthz')).json();
    expect(typeof h.backupAgeH).toBe('number');
    expect(h.backupAgeH).toBeLessThan(1);
    expect(num.rssPeak).toBeLessThan(200);
    // a leak check: a further round of traffic does not keep growing the heap
    const before = L.rss();
    for (let r = 0; r < 20; r++) await Promise.all(Array.from({ length: 16 }, () => fetch(L.base + '/v1/state', { headers: a }).then((x) => x.text())));
    expect(L.rss() - before).toBeLessThan(40);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(path.join(CACHE, 'last-load.json'), JSON.stringify({ ...num, requests: TOTAL, concurrency: CONC, db: L.db, dbKB: Math.round(fs.statSync(L.db).size / 1024) }, null, 1));
  });

  it('the container HEALTHCHECK command from the Dockerfile (bash /dev/tcp, no second node process) succeeds against the live server and FAILS when nothing listens', async () => {
    const df = fs.readFileSync(path.join(BUNDLE, 'Dockerfile'), 'utf8');
    const m = /^HEALTHCHECK .*? CMD (\[.*\])\s*$/m.exec(df);
    expect(m).toBeTruthy();
    const argv: string[] = JSON.parse(m![1]!);
    expect(argv[0]).toBe('bash');
    expect(argv.join(' ')).toContain('/dev/tcp/127.0.0.1/8787');
    const run = (port: number) => spawnSync(argv[0]!, argv.slice(1).map((x) => x.replace('127.0.0.1/8787', `127.0.0.1/${port}`)), { encoding: 'utf8', timeout: 8000 });
    expect(run(L.port).status).toBe(0);
    expect(run(await alloc()).status).not.toBe(0);
  });

  it('CLI: status (read-only) and health work against the live database', async () => {
    const env = { ...L.env, KG_PORT: String(L.port) };
    const st = cli(['status'], env);
    expect(st.status).toBe(0);
    const j = JSON.parse(st.out);
    expect(j).toMatchObject({ families: 5 });
    expect(j.events).toBeGreaterThan(1000);
    expect(j.lastBackup.at).toBeTruthy();
    expect(Object.keys(j).sort()).toEqual(['dbMB', 'events', 'families', 'freeMB', 'lastBackup', 'stores']);
    expect(cli(['health'], env).status).toBe(0);
    expect(cli(['status'], { ...env, KG_DB: path.join(dir, 'does-not-exist.db') }).status).toBe(2);
  });

  it('restore drill: CLI backup of the live DB -> stop -> restore (stale WAL/SHM junk is removed) -> new epoch, same families, stores and ledger; clients keep working', async () => {
    const f0 = fams[0]!;
    const before = (await L.call('GET', '/v1/state', { auth: f0.tok })).j;
    const bak = path.join(dir, 'drill.bak.db');
    const b = cli(['backup', bak], L.env);
    expect(b.status).toBe(0);
    expect(JSON.parse(b.out).integrity).toBe('ok');
    expect(fs.existsSync(bak + '-wal')).toBe(false); // the backup is a single self-contained file
    await L.stop();
    running.splice(running.indexOf(L), 1);
    expect(cli(['health'], { ...L.env, KG_PORT: String(L.port) }).status).not.toBe(0); // nothing answers any more

    const restored = path.join(dir, 'restored.db');
    rmdb(restored);
    fs.writeFileSync(restored + '-wal', Buffer.from('JUNK-FROM-A-DEAD-DATABASE'.repeat(200)));
    fs.writeFileSync(restored + '-shm', Buffer.from('JUNK'.repeat(1000)));
    const r = cli(['restore', bak, restored], L.env);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ restored: true, newEpoch: true });

    const R = await boot(alloc, dir, {}, { db: restored });
    running.push(R);
    const after = (await R.call('GET', '/v1/state', { auth: f0.tok })).j;
    expect(after.epoch).not.toBe(before.epoch); // devices see a new epoch and re-push everything they hold
    expect(after.stores).toEqual(before.stores);
    expect(after.ledger).toEqual(before.ledger);
    expect((await R.call('GET', '/v1/state', { auth: fams[3]!.tok })).s).toBe(200);
    expect((await putStore(R, f0, 'after-restore', 0)).s).toBe(200);
    await R.stop();
    running.splice(running.indexOf(R), 1);
  });

  it('restore refuses a damaged backup file and leaves the destination untouched', () => {
    const bad = path.join(dir, 'garbage.db');
    fs.writeFileSync(bad, Buffer.from('this is not a database '.repeat(500)));
    const dst = path.join(dir, 'should-not-exist.db');
    const r = cli(['restore', bad, dst], baseEnvFor(dir));
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(dst)).toBe(false);
    expect(cli(['restore'], baseEnvFor(dir)).status).toBe(2); // usage
  });
});

function baseEnvFor(d: string): NodeJS.ProcessEnv {
  return { KG_DB: path.join(d, 'cli.db'), KG_ENROLL_CODE: 'enroll-code-for-test', KG_TRUST_PROXY: '0' };
}
