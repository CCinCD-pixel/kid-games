// Shared harness for the sync-server suites: finds a Node that can run server.mjs (node:sqlite + backup() need >= 22.16), boots REAL server processes on
// localhost ports >= 59000 (temp dirs under node_modules/.cache, never /tmp), and offers a tiny fetch wrapper. Everything is silent (stdio is piped, KG_QUIET).
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from './kgcrypto.mjs';

export { K };
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../../..');
export const BUNDLE = path.join(REPO, 'docs/ops/kg-sync');
export const SERVER = path.join(BUNDLE, 'server.mjs');
export const CACHE = path.join(REPO, 'node_modules/.cache/kg-sync-test');

export const ORIGIN = 'https://kg-test.example';
export const ENROLL = 'enroll-code-for-test';

// ------------------------------------------------------------------ node >= 22.16
const verOk = (v: string) => {
  const [a = 0, b = 0] = v.replace(/^v/, '').split('.').map(Number);
  return a > 22 || (a === 22 && b >= 16);
};
const versionOf = (exe: string): string | null => {
  try {
    return execFileSync(exe, ['-p', 'process.versions.node'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};
function findNode(): { exe: string; version: string } | null {
  const cands: string[] = [];
  if (process.env.KG_NODE22) cands.push(process.env.KG_NODE22);
  if (verOk(process.versions.node)) cands.push(process.execPath);
  const nvm = path.join(process.env.HOME ?? '', '.nvm/versions/node');
  try {
    const dirs = fs.readdirSync(nvm).filter((d) => /^v2[2-9]\./.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const d of dirs) cands.push(path.join(nvm, d, 'bin/node'));
  } catch {
    /* no nvm */
  }
  cands.push('/opt/homebrew/bin/node', '/usr/local/bin/node', 'node');
  for (const exe of cands) {
    const v = exe === process.execPath ? process.versions.node : versionOf(exe);
    if (v && verOk(v)) return { exe, version: v };
  }
  return null;
}
export const NODE22 = findNode();
/** `describe` for suites that need a real server. Without Node >= 22.16 they are skipped, unless KG_REQUIRE_NODE22=1 (CI), where they FAIL loudly. */
export const mustRun = process.env.KG_REQUIRE_NODE22 === '1' || !!NODE22;
export function needNode(): { exe: string; version: string } {
  if (!NODE22) throw new Error('Node >= 22.16 is required to run the sync server (node:sqlite). Set KG_NODE22=/path/to/node or install Node 22 (nvm install 22).');
  return NODE22;
}

// ------------------------------------------------------------------ files, ports
let tmpN = 0;
export function tmpDir(tag: string): string {
  fs.mkdirSync(CACHE, { recursive: true });
  const d = path.join(CACHE, `${tag}-${process.pid}-${Date.now().toString(36)}-${tmpN++}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export const rmrf = (p: string) => fs.rmSync(p, { recursive: true, force: true });
export const rmdb = (f: string) => {
  for (const s of ['', '-wal', '-shm']) fs.rmSync(f + s, { force: true });
};
const canListen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
/** per-suite port allocator: each suite owns a block of 100 ports starting at its base (>= 59000), so suites running in parallel never collide; the start offset depends on the
 *  process id so that two `npm test` runs started at the same moment (two agents) do not pick the same port either */
export function portAllocator(base: number) {
  let i = (process.pid * 7) % 60;
  return async () => {
    for (let k = 0; k < 100; k++) {
      const p = base + (i++ % 100);
      if (await canListen(p)) return p;
    }
    throw new Error('no free port in block ' + base);
  };
}

// ------------------------------------------------------------------ http client
export interface Res {
  s: number;
  j: any;
  h: Headers;
}
export interface CallOpts {
  auth?: string;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: string;
}
export const makeCall = (base: string) => async (method: string, p: string, o: CallOpts = {}): Promise<Res> => {
  const r = await fetch(base + p, {
    method,
    headers: { ...(o.auth ? { authorization: 'Bearer ' + o.auth } : {}), ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.headers ?? {}) },
    body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined),
    signal: AbortSignal.timeout(8000),
  });
  let j: any = null;
  try {
    j = await r.json();
  } catch {
    /* 204 / 304 */
  }
  return { s: r.status, j, h: r.headers };
};

// ------------------------------------------------------------------ server process
export interface Srv {
  child: ChildProcess;
  port: number;
  db: string;
  dir: string;
  base: string;
  env: NodeJS.ProcessEnv;
  call: (method: string, p: string, o?: CallOpts) => Promise<Res>;
  rss: () => number;
  logs: () => string;
  stop: () => Promise<void>;
}
export const baseEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  KG_ENROLL_CODE: ENROLL,
  KG_ORIGINS: ORIGIN,
  KG_ALLOW_LOCALHOST: '1',
  KG_QUIET: '1',
  KG_HOST: '127.0.0.1',
  KG_TRUST_PROXY: '0',
  KG_MIN_FREE_MB: '0',
  NODE_NO_WARNINGS: '1',
});
export async function boot(allocPort: () => Promise<number>, dir: string, extra: Record<string, string> = {}, opts: { db?: string; name?: string } = {}): Promise<Srv> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await bootOnce(allocPort, dir, extra, opts);
    } catch (e) {
      lastErr = e;
      if (!/EADDRINUSE/.test(String(e))) throw e; // only a port race with another run is retried
    }
  }
  throw lastErr;
}
async function bootOnce(allocPort: () => Promise<number>, dir: string, extra: Record<string, string>, opts: { db?: string; name?: string }): Promise<Srv> {
  const port = await allocPort();
  const db = opts.db ?? path.join(dir, `${opts.name ?? 'srv'}-${port}.db`);
  const env = { ...baseEnv(), KG_PORT: String(port), KG_DB: db, ...extra };
  const child = spawn(needNode().exe, [SERVER, 'serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stderr!.on('data', (d) => (logs += d));
  child.stdout!.on('data', (d) => (logs += d));
  await new Promise<void>((resolve, reject) => {
    const t = setInterval(() => {
      if (logs.includes('listening')) {
        clearInterval(t);
        clearTimeout(to);
        resolve();
      }
    }, 20);
    const to = setTimeout(() => {
      clearInterval(t);
      child.kill('SIGKILL');
      reject(new Error('server did not start: ' + logs.slice(0, 400)));
    }, 15000);
    child.once('exit', () => {
      clearInterval(t);
      clearTimeout(to);
      reject(new Error('server exited at start-up: ' + logs.slice(0, 400)));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const rss = () => Number(execFileSync('ps', ['-o', 'rss=', '-p', String(child.pid)]).toString().trim()) / 1024;
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const done = new Promise<void>((r) => child.once('exit', () => r()));
    child.kill('SIGTERM');
    const t = setTimeout(() => child.kill('SIGKILL'), 6000);
    await done;
    clearTimeout(t);
  };
  return { child, port, db, dir, base, env, call: makeCall(base), rss, logs: () => logs, stop };
}
/** run `server.mjs <args>` once (CLI commands); returns status + output */
export function cli(args: string[], env: NodeJS.ProcessEnv, timeout = 20000) {
  const r = spawnSync(needNode().exe, [SERVER, ...args], { env: { ...baseEnv(), ...env }, encoding: 'utf8', timeout });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}
/** run an in-process scenario script (helpers/*.mjs, executed by the Node >= 22.16 binary); it prints one JSON line {checks:[[name,ok,info]...]} */
export function runScenario(script: string, env: NodeJS.ProcessEnv = {}, timeout = 120000): { checks: [string, boolean, string][] } {
  const r = spawnSync(needNode().exe, [path.join(HERE, script)], { env: { ...baseEnv(), ...env }, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  const lines = r.stdout.trim().split('\n');
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    throw new Error(`scenario ${script} produced no result (exit ${r.status}): ${(r.stderr || r.stdout).slice(0, 600)}`);
  }
}
export const failures = (res: { checks: [string, boolean, string][] }) => res.checks.filter((c) => !c[1]).map((c) => `${c[0]} ${c[2]}`);

// ------------------------------------------------------------------ families and canned requests
export interface Fam {
  S: Uint8Array;
  k: K.Keys;
  tok: string;
}
export const fam = async (): Promise<Fam> => {
  const S = K.newSecret();
  const k = await K.derive(S);
  return { S, k, tok: `${k.fid}.${k.auth}` };
};
export const enroll = (srv: Pick<Srv, 'call'>, f: Fam, code = ENROLL) => srv.call('POST', '/v1/enroll', { body: { fid: f.k.fid, auth: f.k.auth, del: f.k.del, code } });
/** canonical dummy envelope: flag byte 0 followed by zeros (>= 29 bytes decodes as a valid sealed-envelope SHAPE; the server cannot tell it from real ciphertext) */
export const sealB = (n = 110) => K.b64u(new Uint8Array(n));
export const putStore = (srv: Pick<Srv, 'call'>, f: Fam, id: string, rev: number, env = sealB(), v = 1) => srv.call('PUT', `/v1/stores/${id}`, { auth: f.tok, body: { v, env }, headers: { 'if-match': `"${rev}"` } });
export const postLedger = (srv: Pick<Srv, 'call'>, f: Fam, events: unknown[]) => srv.call('POST', '/v1/ledger', { auth: f.tok, body: { events } });
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
