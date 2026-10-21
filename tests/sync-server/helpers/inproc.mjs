// inproc.mjs -- scaffolding for in-process scenarios that need a VIRTUAL CLOCK (rate-limit windows, pairing TTLs, disk-guard cache). Executed by a Node >= 22.16
// binary (vitest itself may run on Node 20, which has no node:sqlite), see runScenario() in proc.ts. Silent: the server runs with quiet=true.
import fs from 'node:fs';
import path from 'node:path';
import { createServer, openDb, CFG } from '../../../docs/ops/kg-sync/server.mjs';

export const ENROLL = 'enroll-code-for-test';
export const T0 = 1_800_000_000;
const dirOf = () => process.env.KG_TEST_DIR || process.cwd();

/** listen on a localhost port >= 59600 (the sync-server suites own 59000-59899). The start depends on the pid (concurrent scenario processes do not fight over one port) and
 *  every call moves on to a NEW port: reusing a port would hand fetch() a stale keep-alive socket to the server that just closed (ECONNRESET). */
let nextPort = (process.pid * 3) % 300;
async function listenFrom(server, base) {
  for (let i = 0; i < 300; i++) {
    const port = base + (nextPort++ % 300);
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
      return port;
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
    }
  }
  throw new Error('no free port for the scenario server');
}

/** an in-process server with a virtual clock (seconds). `over` overrides CFG fields. */
export async function virtual(over = {}, name = 'virtual') {
  const dbf = path.join(dirOf(), `${name}-${process.pid}.db`);
  for (const s of ['', '-wal', '-shm']) fs.rmSync(dbf + s, { force: true });
  const clock = { t: T0 };
  const cfg = { ...CFG, db: dbf, enroll: ENROLL, quiet: true, nowFn: () => clock.t, minFreeMB: 0, enrollPerHour: 99, enrollGlobalPerHour: 99, allowLocal: true, origins: [], proxyCidr: [], trustProxy: false, ...over };
  const s = createServer(openDb(dbf), cfg);
  const port = await listenFrom(s.server, 59600);
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, p, { auth, body, h = {}, raw } = {}) => {
    const r = await fetch(base + p, { method, headers: { ...(auth ? { authorization: 'Bearer ' + auth } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...h }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    let j = null;
    try {
      j = await r.json();
    } catch {
      /* 204 / 304 */
    }
    return { s: r.status, j, h: r.headers };
  };
  const close = () => {
    s.server.closeAllConnections();
    s.server.close();
    try {
      s.db.close();
    } catch {
      /* closed */
    }
    for (const x of ['', '-wal', '-shm']) fs.rmSync(dbf + x, { force: true });
  };
  return { ...s, clock, cfg, call, base, dbf, close };
}

/** collect named checks, print them as ONE json line at the end (the vitest side asserts each) */
export function checker() {
  const checks = [];
  return {
    chk: (name, ok, info = '') => checks.push([name, !!ok, String(info)]),
    done: () => {
      process.stdout.write(JSON.stringify({ checks }) + '\n');
      process.exit(0);
    },
  };
}
