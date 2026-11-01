// Delivery bundle checks (docs/ops/kg-sync/): the container hardening promised in docs/specs/sync.md 6.2 is really in compose.yml / Dockerfile, the public repo holds no
// IP or secret, SHA256SUMS is fresh, RUNBOOK.md covers every procedure with expected output, and the helper scripts (ensure-net, pull-backups, check-health, smoke-remote)
// behave as documented -- all on localhost, with a fake `docker` and local-directory "remote". Nothing here deploys or contacts anything.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BUNDLE, REPO, boot, cli, mustRun, portAllocator, rmrf, sleep, tmpDir, type Srv } from './helpers/proc';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const read = (f: string) => fs.readFileSync(path.join(BUNDLE, f), 'utf8');
const have = (cmd: string) => spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).status === 0;
const SUMMED = ['server.mjs', 'Dockerfile', 'compose.yml', 'Caddyfile.snippet', '.env.example', '.dockerignore', 'ensure-net.sh', 'pull-backups.sh', 'check-health.sh', 'smoke-remote.mjs'];
const ALL_FILES = [...SUMMED, 'make-sums.sh', 'SHA256SUMS', 'RUNBOOK.md', '.gitignore'];

describe('bundle: files and checksums', () => {
  it('every promised file exists; scripts are executable', () => {
    for (const f of ALL_FILES) expect(fs.existsSync(path.join(BUNDLE, f)), f).toBe(true);
    for (const f of ['ensure-net.sh', 'pull-backups.sh', 'check-health.sh', 'smoke-remote.mjs', 'make-sums.sh']) expect(fs.statSync(path.join(BUNDLE, f)).mode & 0o111, f).not.toBe(0);
  });
  it('SHA256SUMS lists exactly the deployable files and every hash is current (run ./make-sums.sh after editing)', () => {
    const lines = read('SHA256SUMS').trim().split('\n');
    expect(lines.map((l) => l.split(/\s+/)[1])).toEqual(SUMMED);
    for (const l of lines) {
      const [hash, name] = l.split(/\s+/);
      expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(BUNDLE, name!))).digest('hex'), `${name} changed: run docs/ops/kg-sync/make-sums.sh`).toBe(hash);
    }
  });
  it('.dockerignore sends nothing but server.mjs to the Docker daemon (no data/, no .env, no docs)', () => {
    const lines = read('.dockerignore').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
    expect(lines).toEqual(['*', '!server.mjs']);
  });
  it('the bundle holds no stray files (nothing like .env, data/, *.db, keys)', () => {
    const names = fs.readdirSync(BUNDLE).sort();
    expect(names).toEqual([...ALL_FILES].sort());
  });
});

describe('bundle: no IP address, secret or key in the public repository', () => {
  const files = ALL_FILES.filter((f) => f !== 'SHA256SUMS');
  it('IPv4 literals are only loopback, 0.0.0.0 and the private kg-net range 172.30.77.x', () => {
    const bad: string[] = [];
    for (const f of files) for (const m of read(f).matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)) if (!/^(127\.0\.0\.1|0\.0\.0\.0|172\.30\.77\.\d{1,3}|127\.0\.0\.0)$/.test(m[1]!)) bad.push(`${f}: ${m[1]}`);
    expect(bad).toEqual([]);
  });
  it('no private keys, public keys, tokens, long random strings or filled-in codes', () => {
    const bad: string[] = [];
    for (const f of files) {
      const t = read(f);
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) bad.push(`${f}: private key`);
      if (/ssh-(ed25519|rsa) AAAA[0-9A-Za-z+/]{20,}/.test(t)) bad.push(`${f}: ssh key`);
      for (const tok of t.replace(/https?:\/\/\S+/g, '').match(/[A-Za-z0-9+/_-]{40,}/g) ?? []) if (/[a-z]/.test(tok) && /[A-Z]/.test(tok) && /\d/.test(tok)) bad.push(`${f}: long random-looking string ${tok.slice(0, 12)}...`);
      if (/sha256:[0-9a-f]{64}/.test(t)) bad.push(`${f}: pinned digest (belongs in the server's .env, not in the repository)`);
    }
    expect(bad).toEqual([]);
    const env = read('.env.example');
    expect(/^KG_ENROLL_CODE=\s*$/m.test(env)).toBe(true); // the enrolment code is blank in the example
    expect(/^CADDY_CONTAINER=\s*$/m.test(env)).toBe(true);
    expect(/^KG_ORIGINS=\s*$/m.test(env)).toBe(true);
  });
  it('.gitignore keeps data/ and .env out of git (checked with git itself)', () => {
    const g = read('.gitignore');
    expect(g).toMatch(/^data\/$/m);
    expect(g).toMatch(/^\.env$/m);
    const paths = ['docs/ops/kg-sync/.env', 'docs/ops/kg-sync/data/kg.db', 'docs/ops/kg-sync/data/backup/kg-d-2026-01-01.db', 'docs/ops/kg-sync/pull-backups.env'];
    const r = spawnSync('git', ['check-ignore', ...paths], { cwd: REPO, encoding: 'utf8' });
    expect(r.stdout.trim().split('\n')).toEqual(paths); // all four are ignored
    const r2 = spawnSync('git', ['check-ignore', '-q', 'docs/ops/kg-sync/.env.example'], { cwd: REPO });
    expect(r2.status).toBe(1); // .env.example must stay tracked
  });
  it('no domain other than the documented kg host and generic placeholders (no real Netlify / API hostnames)', () => {
    const hosts = new Set<string>();
    for (const f of files) for (const m of read(f).matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)) hosts.add(m[1]!.toLowerCase());
    for (const h of hosts) expect(['kg.ccincd.shop', 'localhost', '127.0.0.1', 'x'].includes(h) || /^(example|xxx)\./.test(h) || h.endsWith('.example') || h === 'kg-test.example', `unexpected host ${h}`).toBe(true);
  });
});

describe('bundle: compose.yml and Dockerfile carry the promised hardening', () => {
  const c = read('compose.yml');
  const d = read('Dockerfile');
  it('container: non-root, read-only fs, no capabilities, no new privileges, 256 MB incl. swap, 0.5 CPU, 64 pids, heap cap, tmpfs /tmp, restart policy', () => {
    for (const re of [/^\s+read_only: true$/m, /^\s+user: "1000:1000"$/m, /^\s+cap_drop:\n\s+- ALL$/m, /no-new-privileges:true/, /^\s+mem_limit: 256m$/m, /^\s+memswap_limit: 256m$/m, /^\s+cpus: 0\.5$/m, /^\s+pids_limit: 64$/m, /--max-old-space-size=96/, /^\s+- \/tmp:/m, /^\s+restart: unless-stopped$/m, /^\s+init: true$/m]) expect(c).toMatch(re);
    expect(c).not.toMatch(/privileged|network_mode|pid: host|ipc: host|cap_add|docker\.sock|devices:/);
  });
  it('no published ports at all; the only network is the dedicated internal kg-net with the fixed subnet; the service joins nothing else', () => {
    expect(c).not.toMatch(/^\s+ports:/m);
    expect(c).not.toMatch(/\n\s+- "?\d+:\d+/);
    expect(c).toMatch(/^networks:\n\s+kg-net:\n\s+name: kg-net\n\s+internal: true\n\s+ipam:\n\s+config:\n\s+- subnet: 172\.30\.77\.0\/24$/m);
    const svc = c.slice(c.indexOf('services:'), c.indexOf('\nnetworks:'));
    const joined = /^ {4}networks:\n((?: {6}.*\n?)+)/m.exec(svc);
    expect(joined).toBeTruthy();
    expect([...joined![1]!.matchAll(/^ {6}([a-z0-9-]+):/gm)].map((m) => m[1])).toEqual(['kg-net']);
  });
  it('Docker log rotation (json-file, 5 MB x 3) and the data volume', () => {
    expect(c).toMatch(/logging:\n\s+driver: json-file\n\s+options:\n\s+max-size: "5m"\n\s+max-file: "3"/);
    expect(c).toMatch(/volumes:\n\s+- \.\/data:\/data$/m);
  });
  it('secrets come from .env (required ones fail loudly when missing); proxy trust defaults match the fixed subnet', () => {
    expect(c).toMatch(/KG_ENROLL_CODE: "\$\{KG_ENROLL_CODE:\?/);
    expect(c).toMatch(/KG_ORIGINS: "\$\{KG_ORIGINS:\?/);
    expect(c).toMatch(/KG_TRUST_PROXY: "\$\{KG_TRUST_PROXY:-1\}"/);
    expect(c).toMatch(/KG_PROXY_CIDR: "\$\{KG_PROXY_CIDR:-172\.30\.77\.0\/24\}"/);
    expect(c).toMatch(/KG_ALLOW_LOCALHOST: "\$\{KG_ALLOW_LOCALHOST:-0\}"/);
    expect(c).not.toMatch(/KG_ENROLL_CODE: [^"$]/);
    // every ${VAR} compose substitutes is documented in .env.example
    const env = read('.env.example');
    for (const m of c.matchAll(/\$\{([A-Z_]+)[:}-]/g)) expect(env, `.env.example lacks ${m[1]}`).toMatch(new RegExp(`^${m[1]}=`, 'm'));
  });
  it('Dockerfile: pinned-by-argument node 22 slim, non-root, copy-only (no downloads), bash /dev/tcp healthcheck every 60 s, serve command', () => {
    expect(d).toMatch(/^ARG NODE_IMAGE=node:22-slim$/m);
    expect(d).toMatch(/^FROM \$\{NODE_IMAGE\}$/m);
    expect(d).toMatch(/^USER node$/m);
    expect(d).toMatch(/^HEALTHCHECK --interval=60s .* CMD \["bash", "-c", ".*\/dev\/tcp\/127\.0\.0\.1\/8787.*"\]$/m);
    expect(d).toMatch(/^CMD \["node", "\/app\/server\.mjs", "serve"\]$/m);
    expect(d.split('\n').filter((l) => !l.startsWith('#')).join('\n')).not.toMatch(/\b(curl|wget|apt-get|npm|pip|ADD http)\b/);
    expect(d).toMatch(/COPY server\.mjs \/app\/server\.mjs/);
  });
  it('the node version the image uses is the one the server needs (>= 22.16: node:sqlite backup())', () => {
    expect(read('server.mjs').split('\n')[0]).toMatch(/Node >= 22\.16/);
    expect(d).toMatch(/node:22-slim/);
  });
});

describe('bundle: Caddyfile.snippet', () => {
  const s = read('Caddyfile.snippet');
  it('one site block for the kg subdomain on :8443 with body limit, no access log, no Server header, XFF set from the real client address, health checks', () => {
    const body = s.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(body).toMatch(/^kg\.ccincd\.shop:8443 \{$/m);
    expect((body.match(/^[^\s#].*\{$/gm) ?? []).length).toBe(1);
    for (const re of [/encode zstd gzip/, /max_size 100KB/, /output discard/, /header -Server/, /reverse_proxy kg-sync:8787 \{/, /header_up X-Forwarded-For \{remote_host\}/, /health_uri \/healthz/]) expect(body).toMatch(re);
    expect((body.match(/\{/g) ?? []).length).toBe((body.match(/\}/g) ?? []).length); // balanced braces ({remote_host} counts on both sides)
  });
  it('the comments warn against editing the file in place (inode trap) and name the append method', () => {
    expect(s).toMatch(/cat Caddyfile\.snippet >> Caddyfile/);
  });
});

describe('RUNBOOK.md: plain Chinese, every step has a command and an expected output', () => {
  const rb = read('RUNBOOK.md');
  const sections = rb.split(/\n(?=### )/).filter((s) => s.startsWith('### '));
  it('covers the production Caddy edit (inode trap, validate before reload, backup, rollback), restore drill, update, emergency PAUSE, off-box pull', () => {
    for (const k of ['inode', 'caddy validate', 'caddy reload', 'cp -p', '.bak.', '回滚', '恢复演练', '更新程序', '紧急暂停', 'touch data/PAUSE', 'rm /srv/kg-sync/data/PAUSE', 'rrsync -ro', 'pull-backups.sh', 'docker network connect kg-net', 'docker network disconnect kg-net', 'docker compose config', 'sha256sum -c SHA256SUMS', 'openssl rand -base64 12', 'docker buildx imagetools inspect node:22-slim', 'fallocate -l 512M', 'KG_MIN_FREE_MB=64', 'smoke-remote.mjs', 'docker tag kg-sync:local kg-sync:prev']) expect(rb, k).toContain(k);
    expect(rb).toMatch(/只用追加/);
    expect(rb).toMatch(/等你说 "go"|需要 go/);
  });
  it('every numbered step (### n.m) that has a command also says what to expect', () => {
    const steps = sections.filter((s) => /^### \d+\.\d+/.test(s) && /```bash/.test(s));
    expect(steps.length).toBeGreaterThanOrEqual(18);
    const missing = steps.filter((s) => !/预期|正常的样子|成功的标志/.test(s)).map((s) => s.split('\n')[0]);
    expect(missing).toEqual([]);
  });
  it('the number of explicit "预期" lines is substantial and the text is Chinese', () => {
    expect((rb.match(/预期/g) ?? []).length).toBeGreaterThanOrEqual(30);
    expect((rb.match(/[一-鿿]/g) ?? []).length).toBeGreaterThan(3000);
  });
  it('consistency: every KG_* name and server.mjs sub-command in the docs exists in the code', () => {
    const code = ['server.mjs', 'compose.yml', 'ensure-net.sh', 'pull-backups.sh', 'check-health.sh', 'smoke-remote.mjs'].map(read).join('\n');
    const known = new Set([...code.matchAll(/KG_[A-Z0-9_]+/g)].map((m) => m[0]));
    for (const m of (rb + read('.env.example')).matchAll(/KG_[A-Z0-9_]+/g)) expect(known.has(m[0]), `${m[0]} is documented but unknown to the code`).toBe(true);
    for (const m of rb.matchAll(/server\.mjs (\w+)/g)) expect(['serve', 'backup', 'restore', 'status', 'health']).toContain(m[1]);
    expect(rb).toContain('PAUSE');
    expect(read('server.mjs')).toContain("'PAUSE'");
    expect(rb).toContain('SHA256SUMS');
  });
  it('the documented file list matches the directory', () => {
    for (const f of SUMMED.concat(['make-sums.sh'])) expect(rb, f).toContain(f.replace(/^\./, '.'));
  });
});

describe('ensure-net.sh (fake docker): reconnects Caddy to kg-net only when it fell out', () => {
  let d = '';
  beforeAll(() => {
    d = tmpDir('ensure');
    fs.copyFileSync(path.join(BUNDLE, 'ensure-net.sh'), path.join(d, 'ensure-net.sh'));
    fs.chmodSync(path.join(d, 'ensure-net.sh'), 0o755);
    fs.mkdirSync(path.join(d, 'bin'));
    // fake docker: behaviour controlled by files FAKE_MISSING / FAKE_NONET / FAKE_INNET in the same dir; every call is appended to calls.log
    fs.writeFileSync(
      path.join(d, 'bin/docker'),
      `#!/bin/sh
D="$(dirname "$0")/.."
echo "$@" >> "$D/calls.log"
case "$1 $2" in
  "inspect "*) [ -f "$D/FAKE_MISSING" ] && exit 1
     case "$*" in *NetworkSettings*) if [ -f "$D/FAKE_INNET" ]; then echo '{"bridge":{},"kg-net":{}}'; else echo '{"bridge":{}}'; fi ;; esac; exit 0 ;;
  "network inspect") [ -f "$D/FAKE_NONET" ] && exit 1; exit 0 ;;
  "network connect") exit 0 ;;
esac
exit 0
`,
      { mode: 0o755 },
    );
  });
  afterAll(() => rmrf(d));
  const run = (env: Record<string, string> = {}) => spawnSync('bash', [path.join(d, 'ensure-net.sh')], { encoding: 'utf8', env: { PATH: `${path.join(d, 'bin')}:/usr/bin:/bin`, HOME: d, ...env } });
  const reset = () => {
    for (const f of ['calls.log', 'FAKE_MISSING', 'FAKE_NONET', 'FAKE_INNET', '.env']) fs.rmSync(path.join(d, f), { force: true });
  };
  const calls = () => (fs.existsSync(path.join(d, 'calls.log')) ? fs.readFileSync(path.join(d, 'calls.log'), 'utf8') : '');
  it('already connected: silent, exit 0, no connect call', () => {
    reset();
    fs.writeFileSync(path.join(d, 'FAKE_INNET'), '');
    const r = run({ CADDY_CONTAINER: 'caddy-prod' });
    expect([r.status, r.stdout, r.stderr]).toEqual([0, '', '']);
    expect(calls()).not.toContain('network connect');
  });
  it('fell out of kg-net: connects it back and says so once', () => {
    reset();
    const r = run({ CADDY_CONTAINER: 'caddy-prod' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('caddy-prod');
    expect(calls()).toContain('network connect kg-net caddy-prod');
  });
  it('the container name can come from .env (quotes and spaces stripped)', () => {
    reset();
    fs.writeFileSync(path.join(d, '.env'), 'KG_ENROLL_CODE=abc/def+ghi==\nCADDY_CONTAINER="my-caddy" \nOTHER=1\n');
    const r = run();
    expect(r.status).toBe(0);
    expect(calls()).toContain('network connect kg-net my-caddy');
  });
  it('misconfiguration is loud: no name -> exit 2; container missing -> exit 1; kg-net missing -> exit 1 (and never a connect call)', () => {
    reset();
    expect(run().status).toBe(2);
    fs.writeFileSync(path.join(d, 'FAKE_MISSING'), '');
    const m = run({ CADDY_CONTAINER: 'nope' });
    expect([m.status, m.stderr]).toEqual([1, expect.stringContaining('找不到容器')]);
    reset();
    fs.writeFileSync(path.join(d, 'FAKE_NONET'), '');
    const n = run({ CADDY_CONTAINER: 'caddy-prod' });
    expect([n.status, n.stderr]).toEqual([1, expect.stringContaining('kg-net')]);
    expect(calls()).not.toContain('network connect');
  });
});

describe.skipIf(!mustRun)('scripts against a real local server', () => {
  const alloc = portAllocator(59500);
  let dir = '';
  const running: Srv[] = [];
  beforeAll(() => {
    dir = tmpDir('scripts');
  });
  afterAll(async () => {
    await Promise.all(running.map((s) => s.stop()));
    rmrf(dir);
  });

  it('smoke-remote.mjs: the whole smoke passes against a local server, leaves no family behind, and never prints the enrolment code', async () => {
    const code = 'smoke-code-ABCDEF-123456';
    const s = await boot(alloc, dir, { KG_ENROLL_CODE: code }, { name: 'smoke' });
    running.push(s);
    const r = spawnSync(process.execPath, [path.join(BUNDLE, 'smoke-remote.mjs'), s.base], { encoding: 'utf8', env: { ...process.env, KG_ENROLL_CODE: code }, timeout: 40000 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('冒烟通过');
    expect((r.stdout.match(/^\s+ok /gm) ?? []).length).toBeGreaterThanOrEqual(11);
    expect(r.stdout + r.stderr).not.toContain(code);
    expect(JSON.parse(cli(['status'], { ...s.env }).out).families).toBe(0);
    const bad = spawnSync(process.execPath, [path.join(BUNDLE, 'smoke-remote.mjs'), s.base], { encoding: 'utf8', env: { ...process.env, KG_ENROLL_CODE: 'wrong-code-zzzzzz' }, timeout: 40000 });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('FAIL');
    expect(bad.stdout).toContain('开通码不对');
    expect(spawnSync(process.execPath, [path.join(BUNDLE, 'smoke-remote.mjs')], { encoding: 'utf8', env: { ...process.env, KG_ENROLL_CODE: '' } }).status).toBe(2);
  });

  it('check-health.sh: exit 1 until a backup exists, exit 0 afterwards, exit 1 when the server is down', async () => {
    if (!have('curl')) return;
    const bdir = path.join(dir, 'hbak');
    const s = await boot(alloc, dir, { KG_BACKUP_DIR: bdir, KG_BACKUP_HOUR: '0', KG_BACKUP_FIRST_MS: '800' }, { name: 'health' });
    running.push(s);
    const run = (extra: Record<string, string> = {}) => spawnSync('bash', [path.join(BUNDLE, 'check-health.sh')], { encoding: 'utf8', env: { PATH: process.env.PATH, KG_HEALTH_URL: s.base + '/healthz', ...extra } });
    const early = run();
    if (early.status === 1) expect(early.stdout).toMatch(/还没有备份|最近一次备份/); // before the first tick the age is null
    for (let i = 0; i < 60 && !fs.existsSync(path.join(bdir, 'LAST_OK')); i++) await sleep(100);
    await sleep(100);
    const ok = run();
    expect([ok.status, ok.stdout]).toEqual([0, expect.stringContaining('云存档正常')]);
    expect(run({ KG_MAX_BACKUP_AGE_H: '-1' }).status).toBe(1); // stale threshold honoured
    expect(spawnSync('bash', [path.join(BUNDLE, 'check-health.sh')], { encoding: 'utf8', env: { PATH: process.env.PATH } }).status).toBe(2);
    await s.stop();
    running.splice(running.indexOf(s), 1);
    const down = run();
    expect([down.status, down.stdout]).toEqual([1, expect.stringContaining('不通')]);
  });

  describe('pull-backups.sh (local-directory mode: no ssh, no network)', () => {
    const rsyncOk = have('rsync');
    const script = path.join(BUNDLE, 'pull-backups.sh');
    let remote = '';
    let local = '';
    const run = (extra: Record<string, string> = {}) => spawnSync('bash', [script, ...(extra.V ? ['-v'] : [])], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, KG_REMOTE_DIR: remote, KG_LOCAL_DIR: local, ...extra } });
    beforeAll(() => {
      remote = path.join(dir, 'remote');
      local = path.join(dir, 'local');
      fs.mkdirSync(remote, { recursive: true });
    });
    it.skipIf(!rsyncOk)('pulls real backups, verifies them, is silent on success and keeps files older than the remote has them', () => {
      const f = cli(['backup', path.join(remote, 'kg-d-2026-10-19.db')], { KG_DB: path.join(dir, 'pull-src.db') });
      expect(f.status).toBe(0);
      fs.writeFileSync(path.join(remote, 'LAST_OK'), '{"at":"now"}\n');
      fs.writeFileSync(path.join(remote, '.tmp-2026-10-20.db'), 'half written');
      const r = run();
      expect([r.status, r.stdout, r.stderr]).toEqual([0, '', '']);
      expect(fs.readdirSync(local).sort()).toEqual(['LAST_OK', 'kg-d-2026-10-19.db']); // temp files are not pulled
      const v = run({ V: '1' });
      expect(v.status).toBe(0);
      expect(v.stdout).toContain('完成');
      fs.rmSync(path.join(remote, 'kg-d-2026-10-19.db')); // the remote rotated it away: the off-box copy keeps it (no --delete)
      fs.copyFileSync(path.join(local, 'kg-d-2026-10-19.db'), path.join(remote, 'kg-d-2026-10-20.db'));
      expect(run().status).toBe(0);
      expect(fs.existsSync(path.join(local, 'kg-d-2026-10-19.db'))).toBe(true);
    });
    it.skipIf(!rsyncOk)('retention: local files older than KG_KEEP_DAYS are deleted, newer ones stay', () => {
      const old = path.join(local, 'kg-w-2025-01-05.db');
      fs.writeFileSync(old, 'x');
      const t = new Date(Date.now() - 45 * 86400_000);
      fs.utimesSync(old, t, t);
      expect(run().status).toBe(0);
      expect(fs.existsSync(old)).toBe(false);
      expect(fs.existsSync(path.join(local, 'kg-d-2026-10-20.db'))).toBe(true);
    });
    it.skipIf(!rsyncOk)('alarms (exit 1, message on stderr): stale LAST_OK, damaged newest backup, no backup at all', () => {
      const lo = path.join(remote, 'LAST_OK');
      const t = new Date(Date.now() - 50 * 3600_000);
      fs.utimesSync(lo, t, t);
      const stale = run();
      expect([stale.status, stale.stderr]).toEqual([1, expect.stringContaining('超过 36 小时')]);
      expect(run({ KG_MAX_AGE_H: '100' }).status).toBe(0);
      fs.utimesSync(lo, new Date(), new Date());
      fs.writeFileSync(path.join(remote, 'kg-d-2026-10-21.db'), 'this is not a database file');
      const bad = run();
      expect([bad.status, bad.stderr]).toEqual([1, expect.stringContaining('不是 SQLite 文件')]);
      fs.writeFileSync(path.join(remote, 'kg-d-2026-10-21.db'), '');
      expect(run().stderr).toContain('空文件');
      const empty = path.join(dir, 'empty-remote');
      fs.mkdirSync(empty, { recursive: true });
      const none = run({ KG_REMOTE_DIR: empty, KG_LOCAL_DIR: path.join(dir, 'local2') });
      expect([none.status, none.stderr]).toEqual([1, expect.stringContaining('没有任何')]);
    });
    it('configuration errors are loud: neither KG_REMOTE nor KG_REMOTE_DIR -> exit 2; KG_REMOTE without a key file -> exit 2', () => {
      const a = spawnSync('bash', [script], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, KG_LOCAL_DIR: path.join(dir, 'l3') } });
      expect(a.status).toBe(2);
      const b = spawnSync('bash', [script], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, KG_REMOTE: 'nobody@invalid.example', KG_SSH_KEY: path.join(dir, 'no-such-key'), KG_LOCAL_DIR: path.join(dir, 'l4') } });
      expect(b.status).toBe(2); // stops BEFORE any ssh attempt
      expect(b.stderr).toContain('私钥');
    });
    it('the ssh command line is locked down (no password prompts, strict host key checking, dedicated key, no --delete)', () => {
      const t = fs.readFileSync(script, 'utf8');
      for (const k of ['BatchMode=yes', 'StrictHostKeyChecking=yes', '-i $KEY', '--timeout=120', "--exclude '.tmp*'"]) expect(t).toContain(k);
      expect(t.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')).not.toMatch(/--delete/);
    });
  });
});

describe('operator commands used in the RUNBOOK actually work (against local files)', () => {
  it('make-sums.sh reproduces SHA256SUMS byte for byte (run in a scratch copy, the repository is not touched)', () => {
    const d = tmpDir('sums');
    try {
      for (const f of [...SUMMED, 'make-sums.sh']) fs.copyFileSync(path.join(BUNDLE, f), path.join(d, f));
      const r = spawnSync('bash', [path.join(d, 'make-sums.sh')], { encoding: 'utf8' });
      expect(r.status).toBe(0);
      expect(fs.readFileSync(path.join(d, 'SHA256SUMS'), 'utf8')).toBe(read('SHA256SUMS'));
    } finally {
      rmrf(d);
    }
  });
});
