// server.mjs v1.1 -- the 星港 sync service (docs/specs/sync.md section 5). Node >= 22.16 (node:sqlite + sqlite backup()), ZERO dependencies, one file.
//   node server.mjs serve | backup <dst.db> | restore <src.db> [dst] | health | status
// The server never understands content: it stores opaque sealed envelopes (AES-GCM, key only on the devices) and enforces limits.
// Env (all optional unless marked):
//   KG_PORT(8787) KG_HOST(0.0.0.0) KG_DB(./kg.db) KG_ENROLL_CODE(REQUIRED, >= 12 chars) KG_ENROLL_OPEN_UNTIL(unix seconds, 0 = no deadline)
//   KG_ORIGINS(comma list, no '*') KG_ALLOW_LOCALHOST(0)
//   KG_TRUST_PROXY(REQUIRED, 0 or 1) KG_PROXY_CIDR(REQUIRED when KG_TRUST_PROXY=1, e.g. 172.30.77.0/24)
//   KG_MAX_FAMILIES(3) KG_STORE_MAX(65536) KG_STORES_MAX(1048576) KG_STORES_COUNT(32) KG_LEDGER_MAX(4194304) KG_LEDGER_COUNT(20000)
//   KG_MIN_FREE_MB(3072) KG_DB_MAX_MB(100) KG_PAUSE_FILE(<dir of KG_DB>/PAUSE)
//   KG_BACKUP_DIR(off when empty) KG_BACKUP_HOUR(3, UTC hour) KG_BACKUP_KEEP_DAILY(14) KG_BACKUP_KEEP_WEEKLY(8)
//   test knobs (harmless in production): KG_QUIET KG_RATE_MULT KG_ENROLL_PER_HOUR KG_ENROLL_GLOBAL_PER_HOUR KG_BACKUP_FIRST_MS KG_HEADERS_TIMEOUT_MS KG_REQUEST_TIMEOUT_MS
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';

const E = process.env;
export const CFG = {
  port: Number(E.KG_PORT || 8787),
  host: E.KG_HOST || '0.0.0.0',
  db: E.KG_DB || './kg.db',
  enroll: E.KG_ENROLL_CODE || '',
  enrollUntil: Number(E.KG_ENROLL_OPEN_UNTIL || 0),
  origins: (E.KG_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  allowLocal: E.KG_ALLOW_LOCALHOST === '1',
  trustProxy: E.KG_TRUST_PROXY === '1',
  proxyCidr: (E.KG_PROXY_CIDR || '').split(',').map((s) => s.trim()).filter(Boolean),
  maxFamilies: Number(E.KG_MAX_FAMILIES || 3),
  enrollPerHour: Number(E.KG_ENROLL_PER_HOUR || 5),
  enrollGlobalPerHour: Number(E.KG_ENROLL_GLOBAL_PER_HOUR || 10),
  storeMax: Number(E.KG_STORE_MAX || 65536),
  storesMax: Number(E.KG_STORES_MAX || 1048576),
  storesCount: Number(E.KG_STORES_COUNT || 32),
  ledgerMax: Number(E.KG_LEDGER_MAX || 4194304),
  ledgerCount: Number(E.KG_LEDGER_COUNT || 20000),
  rowOverhead: 64,
  minFreeMB: Number(E.KG_MIN_FREE_MB ?? 3072),
  dbMaxMB: Number(E.KG_DB_MAX_MB || 100),
  bodyMax: 90000,
  quiet: E.KG_QUIET === '1',
  rateMult: Number(E.KG_RATE_MULT || 1),
  pauseFile: E.KG_PAUSE_FILE || '',
  backupDir: E.KG_BACKUP_DIR || '',
  backupHour: Number(E.KG_BACKUP_HOUR ?? 3),
  keepDaily: Number(E.KG_BACKUP_KEEP_DAILY || 14),
  keepWeekly: Number(E.KG_BACKUP_KEEP_WEEKLY || 8),
  headersTimeoutMs: Number(E.KG_HEADERS_TIMEOUT_MS || 10000),
  requestTimeoutMs: Number(E.KG_REQUEST_TIMEOUT_MS || 15000),
  nowFn: null, // tests inject a virtual clock (seconds)
};
export const SCHEMA_VERSION = 1;
const sha = (b) => crypto.createHash('sha256').update(b).digest();
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const B64U = /^[A-Za-z0-9_-]+$/;
export const ID_RE = /^[A-Za-z0-9:._-]{3,96}$/; // ledger event ids: ONE charset shared with kit/economy (ID_RE) and the ledger reference implementation
export const LABELS = ['iPhone', 'iPad', '电脑', '其他'];
const MIN_ENV = 29; // flag(1) + iv(12) + gcm tag(16): nothing shorter can be a sealed envelope (0-byte and 1-byte "envelopes" are rejected)

export function openDb(dbPath = CFG.db) {
  const db = new DatabaseSync(dbPath);
  const uv = Number(Object.values(db.prepare('PRAGMA user_version').get())[0]);
  if (uv > SCHEMA_VERSION) throw new Error(`database schema ${uv} is newer than this server (${SCHEMA_VERSION}); refusing to start (roll forward, do not downgrade)`);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=3000;
  CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS family(fid TEXT PRIMARY KEY, auth_hash BLOB NOT NULL, del_hash BLOB, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, ledger_seq INTEGER NOT NULL DEFAULT 0, ledger_bytes INTEGER NOT NULL DEFAULT 0, ledger_count INTEGER NOT NULL DEFAULT 0, stores_bytes INTEGER NOT NULL DEFAULT 0, stores_count INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS store(fid TEXT NOT NULL, id TEXT NOT NULL, rev INTEGER NOT NULL, v INTEGER NOT NULL, env BLOB NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(fid,id)) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS ledger(fid TEXT NOT NULL, seq INTEGER NOT NULL, id TEXT NOT NULL, env BLOB NOT NULL, PRIMARY KEY(fid,id)) WITHOUT ROWID;
  CREATE UNIQUE INDEX IF NOT EXISTS ledger_seq ON ledger(fid,seq);
  CREATE TABLE IF NOT EXISTS pair(code TEXT PRIMARY KEY, pid TEXT NOT NULL UNIQUE, fid TEXT NOT NULL, created INTEGER NOT NULL, commit_b TEXT, label TEXT, apub TEXT, bpub TEXT, nb TEXT, grant_env TEXT, state TEXT NOT NULL, expires INTEGER NOT NULL);
  PRAGMA user_version=${SCHEMA_VERSION};`);
  if (!db.prepare('SELECT 1 FROM meta WHERE k=?').get('epoch')) db.prepare('INSERT INTO meta VALUES(?,?)').run('epoch', b64u(crypto.randomBytes(8)));
  return db;
}

// ------------------------------------------------------------------ rate limiting (in memory; resets on restart, which is fine).
// Hard cap: once the map exceeds `cap` entries, expired ones are dropped and then the oldest 10% are evicted.
export class Limiter {
  constructor(nowFn, cap = 50000) {
    this.m = new Map();
    this.now = nowFn;
    this.cap = cap;
  }
  hit(key, max, windowS) {
    // returns 0 = allowed, otherwise the Retry-After seconds
    const t = this.now();
    let e = this.m.get(key);
    if (!e || e.reset <= t) {
      e = { n: 0, reset: t + windowS };
      this.m.set(key, e);
    }
    e.n++;
    if (this.m.size > this.cap) this.gc(t);
    return e.n <= max ? 0 : e.reset - t;
  }
  peek(key) {
    const e = this.m.get(key);
    return e && e.reset > this.now() ? e.n : 0;
  }
  gc(t) {
    for (const [k, e] of this.m) if (e.reset <= t) this.m.delete(k);
    if (this.m.size > this.cap) {
      let n = Math.ceil(this.m.size * 0.1);
      for (const k of this.m.keys()) {
        this.m.delete(k);
        if (--n <= 0) break;
      }
    }
  }
}

// ------------------------------------------------------------------ ip handling
const stripV4 = (a) => (a || '?').replace(/^::ffff:/, '');
export function ipKey(a) {
  a = stripV4(a);
  if (a.includes(':')) return a.split(':').slice(0, 4).join(':') + '::/64'; // IPv6 aggregated to /64
  return a;
}
const v4n = (s) => {
  const p = s.split('.').map(Number);
  return p.length === 4 && p.every((x) => Number.isInteger(x) && x >= 0 && x < 256) ? ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0 : null;
};
export function inCidr(ip, cidrs) {
  ip = stripV4(ip);
  for (const c of cidrs) {
    const [base, bits] = c.split('/');
    if (!bits) {
      if (ip === base) return true;
      continue;
    }
    const a = v4n(ip);
    const b = v4n(base);
    if (a === null || b === null) continue;
    const m = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    if ((a & m) === (b & m)) return true;
  }
  return false;
}

class HttpErr extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function createServer(db = openDb(), cfg = CFG) {
  const nowS = cfg.nowFn || (() => Math.floor(Date.now() / 1000));
  const lim = new Limiter(nowS);
  const salt = crypto.randomBytes(8);
  const DUMMY = sha('dummy');
  const logSeen = new Map();
  const q = {
    fam: db.prepare('SELECT * FROM family WHERE fid=?'),
    famCount: db.prepare('SELECT COUNT(*) c FROM family'),
    famIns: db.prepare('INSERT INTO family(fid,auth_hash,del_hash,created,last_seen) VALUES(?,?,?,?,?)'),
    touch: db.prepare('UPDATE family SET last_seen=? WHERE fid=?'),
    stores: db.prepare('SELECT id,rev,v,length(env) bytes,updated FROM store WHERE fid=?'),
    sget: db.prepare('SELECT rev,v,env FROM store WHERE fid=? AND id=?'),
    sins: db.prepare('INSERT INTO store(fid,id,rev,v,env,updated) VALUES(?,?,?,?,?,?)'),
    supd: db.prepare('UPDATE store SET rev=?, v=?, env=?, updated=? WHERE fid=? AND id=?'),
    sacct: db.prepare('UPDATE family SET stores_bytes=stores_bytes+?, stores_count=stores_count+? WHERE fid=?'),
    lins: db.prepare('INSERT OR IGNORE INTO ledger(fid,seq,id,env) VALUES(?,?,?,?)'),
    lset: db.prepare('UPDATE family SET ledger_seq=?, ledger_bytes=ledger_bytes+?, ledger_count=ledger_count+? WHERE fid=?'),
    lget: db.prepare('SELECT seq,id,env FROM ledger WHERE fid=? AND seq>? ORDER BY seq LIMIT ?'),
    epoch: db.prepare("SELECT v FROM meta WHERE k='epoch'"),
    delFam: db.prepare('DELETE FROM family WHERE fid=?'),
    delStores: db.prepare('DELETE FROM store WHERE fid=?'),
    delLedger: db.prepare('DELETE FROM ledger WHERE fid=?'),
    delPair: db.prepare('DELETE FROM pair WHERE fid=?'),
    pIns: db.prepare("INSERT INTO pair(code,pid,fid,created,state,expires) VALUES(?,?,?,?,'open',?)"),
    pByCode: db.prepare('SELECT * FROM pair WHERE code=? AND expires>?'),
    pByPid: db.prepare('SELECT * FROM pair WHERE pid=? AND expires>?'),
    pClaim: db.prepare("UPDATE pair SET commit_b=?, label=?, state='claimed' WHERE code=? AND state='open'"),
    pApub: db.prepare("UPDATE pair SET apub=?, state='a_ready' WHERE pid=? AND state='claimed'"),
    pReveal: db.prepare("UPDATE pair SET bpub=?, nb=?, state='revealed', expires=? WHERE pid=? AND state='a_ready'"),
    pGrant: db.prepare("UPDATE pair SET grant_env=?, state='granted' WHERE pid=? AND state='revealed'"),
    pDel: db.prepare('DELETE FROM pair WHERE pid=?'),
    pGc: db.prepare('DELETE FROM pair WHERE expires<=?'),
    pCodes: db.prepare('SELECT code FROM pair WHERE expires>?'),
  };

  // ---- logging: JSON lines, never Authorization / bodies / codes / ciphertext / full fid / ledger ids. Noise from one source: at most 5 lines per minute.
  const logRaw = (o) => {
    if (!cfg.quiet) process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
  };
  const NOISY = new Set([401, 403, 404, 429, 408]);
  const log = (o) => {
    if (NOISY.has(o.s)) {
      const k = o.ip + '|' + Math.floor(nowS() / 60);
      const n = (logSeen.get(k) ?? 0) + 1;
      logSeen.set(k, n);
      if (logSeen.size > 5000) logSeen.clear();
      if (n > 5) return;
    }
    logRaw(o);
  };

  // ---- who is calling: X-Forwarded-For is honoured ONLY when the TCP peer is inside KG_PROXY_CIDR (the proxy network); rightmost entry
  const ipOf = (req) => {
    const peer = stripV4(req.socket.remoteAddress);
    if (cfg.trustProxy && inCidr(peer, cfg.proxyCidr)) {
      const x = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
      if (x && (v4n(x) !== null || /^[0-9a-f:]+$/i.test(x))) return ipKey(x);
    }
    return ipKey(peer);
  };
  const originOk = (o) => {
    if (!o) return true;
    if (cfg.origins.includes(o)) return true;
    return cfg.allowLocal && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  };

  // ---- emergency stop + disk guard
  const pauseFile = cfg.pauseFile || path.join(path.dirname(path.resolve(cfg.db)), 'PAUSE');
  const paused = () => {
    try {
      return fs.existsSync(pauseFile);
    } catch {
      return false;
    }
  };
  let diskCache = { t: -100, ok: true };
  const diskOk = () => {
    const t = nowS();
    if (t - diskCache.t < 30) return diskCache.ok;
    let ok = true;
    try {
      const dir = path.dirname(path.resolve(cfg.db));
      const s = fs.statfsSync(dir);
      const freeMB = (s.bavail * s.bsize) / 1048576;
      let dbMB = 0;
      for (const suf of ['', '-wal', '-shm']) {
        try {
          dbMB += fs.statSync(cfg.db + suf).size / 1048576;
        } catch {
          /* absent */
        }
      }
      ok = freeMB >= cfg.minFreeMB && dbMB <= cfg.dbMaxMB;
    } catch {
      ok = true;
    }
    diskCache = { t, ok };
    return ok;
  };
  const guardDisk = () => {
    if (!diskOk()) {
      logRaw({ ev: 'disk_guard' });
      throw new HttpErr(507, 'disk_guard');
    }
  };
  let lastBackup = null;
  const setLastBackup = (t) => {
    lastBackup = t;
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      const declared = Number(req.headers['content-length'] || 0);
      if (declared > cfg.bodyMax) return reject(new HttpErr(413, 'too_large'));
      const chunks = [];
      let n = 0;
      req.on('data', (c) => {
        n += c.length;
        if (n > cfg.bodyMax) {
          reject(new HttpErr(413, 'too_large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        if (!n) return resolve({});
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(j && typeof j === 'object' && !Array.isArray(j) ? j : {});
        } catch {
          reject(new HttpErr(400, 'bad_json'));
        }
      });
      req.on('error', () => reject(new HttpErr(400, 'aborted')));
    });

  // auth: Authorization: Bearer <fid>.<auth>. Unknown family and wrong key take the same path (constant-time compare against a dummy hash).
  // VALID credentials are never blocked by failure counters (384 bits cannot be guessed; the counters only shed load): a typo on one phone must not
  // lock the iPad out, and the failure buckets are per source AND per (source, fid).
  function authenticate(req, ip) {
    const m = /^Bearer ([A-Za-z0-9_-]{16,32})\.([A-Za-z0-9_-]{32,64})$/.exec(req.headers.authorization || '');
    const fid = m?.[1] ?? '-';
    const key = m?.[2] ?? '-';
    const fam = m ? q.fam.get(fid) : undefined;
    const want = fam ? Buffer.from(fam.auth_hash) : DUMMY;
    const got = sha(key === '-' ? '-' : Buffer.from(key, 'base64url'));
    const ok = crypto.timingSafeEqual(want, got) && !!fam && !!m;
    if (!ok) {
      const w = lim.hit('af:' + ip, 30, 900) || (fam ? lim.hit('afp:' + ip + '|' + fid, 10, 900) : 0);
      if (w) throw new HttpErr(429, 'slow_down', { retry: w });
      throw new HttpErr(401, 'unauthorized');
    }
    const wait = lim.hit('fam:' + fid, 300 * cfg.rateMult, 60);
    if (wait) throw new HttpErr(429, 'slow_down', { retry: wait });
    q.touch.run(nowS(), fid);
    return fam;
  }
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* nothing to roll back */
      }
      throw e;
    }
  };
  const okId = (s, re) => typeof s === 'string' && re.test(s);
  const decodeEnv = (s) => {
    // canonical base64url, flag byte 0|1, >= 29 bytes
    if (!okId(s, B64U)) return null;
    const raw = Buffer.from(s, 'base64url');
    return raw.length >= MIN_ENV && raw[0] <= 1 && raw.toString('base64url') === s ? raw : null;
  };
  const pairCode = (req) => String(req.headers['x-kg-pair-code'] || '');

  async function route(req, ip) {
    let url;
    try {
      url = new URL(req.url, 'http://x');
    } catch {
      throw new HttpErr(400, 'bad_url'); // e.g. a request line like "GET // HTTP/1.1"
    }
    const p = url.pathname;
    const M = req.method;
    let m;
    if (p === '/healthz' && M === 'GET') {
      q.epoch.get();
      return [200, { ok: true, backupAgeH: lastBackup === null ? null : Math.round(((nowS() - lastBackup) / 3600) * 10) / 10 }, 'healthz'];
    }
    if (p === '/v1/ping' && M === 'GET') return [200, { ok: true }, 'ping'];
    // remote emergency stop (touch data/PAUSE): every state-changing request is refused, reads keep working, no restart needed
    if (M !== 'GET' && p.startsWith('/v1/') && paused()) throw new HttpErr(503, 'paused');

    if (p === '/v1/enroll' && M === 'POST') {
      const w = lim.hit('enroll:' + ip, cfg.enrollPerHour, 3600) || lim.hit('enroll-g', cfg.enrollGlobalPerHour, 3600);
      if (w) throw new HttpErr(429, 'slow_down', { retry: w });
      const b = await readBody(req);
      if (!cfg.enroll || typeof b.code !== 'string' || !crypto.timingSafeEqual(sha(b.code), sha(cfg.enroll)) || (cfg.enrollUntil && nowS() > cfg.enrollUntil)) throw new HttpErr(403, 'forbidden');
      if (!okId(b.fid, /^[A-Za-z0-9_-]{16,32}$/) || !okId(b.auth, /^[A-Za-z0-9_-]{32,64}$/) || !okId(b.del, /^[A-Za-z0-9_-]{32,64}$/)) throw new HttpErr(400, 'bad_request');
      if (q.fam.get(b.fid)) throw new HttpErr(409, 'exists');
      if (q.famCount.get().c >= cfg.maxFamilies) throw new HttpErr(507, 'full');
      guardDisk();
      q.famIns.run(b.fid, sha(Buffer.from(b.auth, 'base64url')), sha(Buffer.from(b.del, 'base64url')), nowS(), nowS());
      return [201, { epoch: q.epoch.get().v }, 'enroll'];
    }

    // ---- pairing, device B side (unauthenticated: knows only the 6-digit code / pid). Claim and poll live in SEPARATE buckets so a slow parent cannot get B rate-limited.
    if (p === '/v1/pair/claim' && M === 'POST') {
      const w = lim.hit('claim:' + ip, 8, 60) || lim.hit('claim-h:' + ip, 40, 3600) || lim.hit('claim-g', 60, 60);
      if (w) throw new HttpErr(429, 'slow_down', { retry: w });
      if (lim.peek('claimfail:' + ip) > 10) throw new HttpErr(429, 'slow_down', { retry: 900 }); // a source that already failed 10+ times in 15 min is locked out, even if its next guess happens to be right
      const b = await readBody(req);
      q.pGc.run(nowS());
      const row = okId(b.code, /^\d{6}$/) ? q.pByCode.get(b.code, nowS()) : undefined;
      if (!row || row.state !== 'open' || !okId(b.commit, /^[A-Za-z0-9_-]{43}$/)) {
        lim.hit('claimfail:' + ip, 10, 900);
        if (lim.peek('claimfail:' + ip) > 10) throw new HttpErr(429, 'slow_down', { retry: 900 });
        throw new HttpErr(404, 'no_such_code');
      }
      q.pClaim.run(b.commit, LABELS.includes(b.label) ? b.label : '其他', b.code);
      return [200, { pid: row.pid, ttl: row.expires - nowS() }, 'pair.claim'];
    }
    if ((m = /^\/v1\/pair\/([A-Za-z0-9_-]{8,32})\/(apub|grant|reveal)$/.exec(p)) && (M === 'GET' || (M === 'POST' && m[2] === 'reveal'))) {
      // B: GET apub / GET grant / POST reveal  (the code travels in a HEADER, never in the URL / proxy log)
      const w = lim.hit('pollpid:' + m[1], 40, 60) || lim.hit('poll:' + ip, 120, 60);
      if (w) throw new HttpErr(429, 'slow_down', { retry: w });
      const row = q.pByPid.get(m[1], nowS());
      if (!row || pairCode(req) !== row.code) {
        lim.hit('claimfail:' + ip, 10, 900);
        throw new HttpErr(404, 'no_such_code');
      }
      if (M === 'GET' && m[2] === 'apub') {
        if (row.state === 'open' || row.state === 'claimed') return [202, { state: row.state }, 'pair.wait'];
        return [200, { apub: row.apub, state: row.state }, 'pair.apub'];
      }
      if (M === 'GET' && m[2] === 'grant') {
        if (row.state !== 'granted') return [202, { state: row.state }, 'pair.wait'];
        q.pDel.run(row.pid);
        return [200, { grant: row.grant_env }, 'pair.grant'];
      }
      if (M === 'POST' && m[2] === 'reveal') {
        const b = await readBody(req);
        if (row.state !== 'a_ready' || !okId(b.bpub, /^[A-Za-z0-9_-]{86,90}$/) || !okId(b.nB, /^[A-Za-z0-9_-]{20,24}$/)) throw new HttpErr(409, 'bad_state');
        const want = b64u(crypto.createHash('sha256').update('kg-pair-commit').update(Buffer.from(b.bpub, 'base64url')).update(Buffer.from(b.nB, 'base64url')).digest());
        if (want !== row.commit_b) throw new HttpErr(400, 'commit_mismatch');
        q.pReveal.run(b.bpub, b.nB, Math.min(row.created + 300, nowS() + 120), row.pid);
        return [200, { ok: true }, 'pair.reveal'];
      }
    }

    // ---- everything below needs a valid Bearer key
    const fam = authenticate(req, ip);
    const fid = fam.fid;
    if (p === '/v1/state' && M === 'GET') {
      const stores = {};
      for (const s of q.stores.all(fid)) stores[s.id] = { rev: s.rev, v: s.v, bytes: s.bytes, ts: s.updated };
      const f = q.fam.get(fid);
      return [
        200,
        {
          epoch: q.epoch.get().v,
          stores,
          ledger: { seq: f.ledger_seq, bytes: f.ledger_bytes, count: f.ledger_count },
          caps: { store: cfg.storeMax, stores: cfg.storesMax, storesCount: cfg.storesCount, ledger: cfg.ledgerMax, ledgerCount: cfg.ledgerCount, pause: paused() },
        },
        'state',
      ];
    }
    if ((m = /^\/v1\/stores\/([a-z0-9][a-z0-9-]{0,31})$/.exec(p))) {
      const id = m[1];
      if (M === 'GET') {
        const s = q.sget.get(fid, id);
        if (!s) throw new HttpErr(404, 'no_such_store');
        if (req.headers['if-none-match'] === `"${s.rev}"`) return [304, null, 'store.get'];
        return [200, { rev: s.rev, v: s.v, env: b64u(s.env) }, 'store.get'];
      }
      if (M === 'PUT') {
        const b = await readBody(req);
        const im = /^"(\d+)"$/.exec(req.headers['if-match'] || '');
        if (!im) throw new HttpErr(428, 'if_match_required');
        if (!Number.isInteger(b.v) || b.v < 1 || b.v > 10000) throw new HttpErr(400, 'bad_request');
        const bytes = decodeEnv(b.env);
        if (!bytes) throw new HttpErr(400, 'bad_envelope');
        if (bytes.length > cfg.storeMax) throw new HttpErr(413, 'store_too_large');
        guardDisk();
        return tx(() => {
          const cur = q.sget.get(fid, id);
          const rev = cur ? cur.rev : 0;
          if (Number(im[1]) !== rev) throw new HttpErr(412, 'rev_mismatch', { rev });
          if (cur && b.v < cur.v) throw new HttpErr(409, 'schema_older', { v: cur.v });
          const f = q.fam.get(fid);
          if (!cur && f.stores_count + 1 > cfg.storesCount) throw new HttpErr(413, 'too_many_stores');
          // a row is accounted as ciphertext + id length + 64 B overhead (creation); an update only changes the ciphertext length
          const delta = cur ? bytes.length - cur.env.length : bytes.length + id.length + cfg.rowOverhead;
          if (f.stores_bytes + delta > cfg.storesMax) throw new HttpErr(413, 'family_too_large');
          if (cur) q.supd.run(rev + 1, b.v, bytes, nowS(), fid, id);
          else q.sins.run(fid, id, 1, b.v, bytes, nowS());
          q.sacct.run(delta, cur ? 0 : 1, fid);
          return [200, { rev: rev + 1 }, 'store.put'];
        });
      }
    }
    if (p === '/v1/ledger' && M === 'POST') {
      const b = await readBody(req);
      if (!Array.isArray(b.events) || b.events.length < 1 || b.events.length > 200) throw new HttpErr(400, 'bad_request');
      const raws = [];
      const bad = [];
      b.events.forEach((e, i) => {
        // the event must be a plain object with a legal id and a string envelope of at most 1400 chars that decodes to a canonical sealed envelope
        const raw = e && typeof e === 'object' && okId(e.id, ID_RE) && typeof e.env === 'string' && e.env.length <= 1400 ? decodeEnv(e.env) : null;
        if (!raw) bad.push(i);
        raws.push(raw);
      });
      if (bad.length) throw new HttpErr(400, 'bad_event', { bad: bad.slice(0, 50) }); // the client bisects: it quarantines these and keeps pushing the rest
      guardDisk();
      return tx(() => {
        const f = q.fam.get(fid);
        let seq = f.ledger_seq;
        let added = 0;
        let bytes = 0;
        for (let i = 0; i < b.events.length; i++) {
          const e = b.events[i];
          const raw = raws[i];
          const r = q.lins.run(fid, seq + 1, e.id, raw);
          if (r.changes) {
            // only NEW events are charged (a retried batch that already landed is all duplicates and must never report "full"); a batch that would cross a cap is rolled back as a whole
            seq++;
            added++;
            bytes += raw.length + e.id.length + cfg.rowOverhead;
            if (f.ledger_count + added > cfg.ledgerCount || f.ledger_bytes + bytes > cfg.ledgerMax) throw new HttpErr(413, 'ledger_full', { count: f.ledger_count + added - 1, max: cfg.ledgerCount });
          }
        }
        q.lset.run(seq, bytes, added, fid);
        return [200, { accepted: added, dup: b.events.length - added, seq }, 'ledger.post'];
      });
    }
    if (p === '/v1/ledger' && M === 'GET') {
      const after = Math.max(0, Number(url.searchParams.get('after') || 0) | 0);
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 500) | 0));
      const rows = q.lget.all(fid, after, limit + 1);
      const f = q.fam.get(fid);
      const more = rows.length > limit;
      if (more) rows.pop();
      return [200, { seq: f.ledger_seq, more, events: rows.map((r) => ({ seq: r.seq, id: r.id, env: b64u(r.env) })) }, 'ledger.get'];
    }

    // ---- pairing, device A side (authenticated)
    if (p === '/v1/pair' && M === 'POST') {
      guardDisk();
      return tx(() => {
        q.pGc.run(nowS());
        q.delPair.run(fid);
        const used = new Set(q.pCodes.all(nowS()).map((r) => r.code));
        let code;
        do code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        while (used.has(code));
        const pid = b64u(crypto.randomBytes(12));
        q.pIns.run(code, pid, fid, nowS(), nowS() + 180);
        return [200, { pid, code, ttl: 180 }, 'pair.new'];
      });
    }
    if ((m = /^\/v1\/pair\/([A-Za-z0-9_-]{8,32})$/.exec(p)) && M === 'GET') {
      const w = lim.hit('pollpidA:' + m[1], 60, 60);
      if (w) throw new HttpErr(429, 'slow_down', { retry: w });
      const row = q.pByPid.get(m[1], nowS());
      if (!row || row.fid !== fid) throw new HttpErr(404, 'no_such_pair');
      return [200, { state: row.state, commit: row.commit_b, label: row.label, bpub: row.bpub, nB: row.nb, ttl: row.expires - nowS() }, 'pair.get'];
    }
    if ((m = /^\/v1\/pair\/([A-Za-z0-9_-]{8,32})\/(apub|grant)$/.exec(p)) && M === 'POST') {
      const b = await readBody(req);
      const row = q.pByPid.get(m[1], nowS());
      if (!row || row.fid !== fid) throw new HttpErr(404, 'no_such_pair');
      if (m[2] === 'apub') {
        if (row.state !== 'claimed' || !okId(b.apub, /^[A-Za-z0-9_-]{86,90}$/)) throw new HttpErr(409, 'bad_state');
        q.pApub.run(b.apub, row.pid);
        return [200, { ok: true }, 'pair.apub.post'];
      }
      if (row.state !== 'revealed' || !okId(b.grant, B64U) || b.grant.length > 400) throw new HttpErr(409, 'bad_state');
      q.pGrant.run(b.grant, row.pid);
      return [200, { ok: true }, 'pair.grant.post'];
    }

    // ---- delete the whole family: needs the delete token derived from the family key (a stolen Bearer is not enough); cascades
    if (p === '/v1/family' && M === 'DELETE') {
      const tok = String(req.headers['x-kg-delete-token'] || '');
      const okTok = fam.del_hash && okId(tok, /^[A-Za-z0-9_-]{32,64}$/) && crypto.timingSafeEqual(Buffer.from(fam.del_hash), sha(Buffer.from(tok, 'base64url')));
      if (!okTok) throw new HttpErr(403, 'delete_token_required');
      tx(() => {
        q.delStores.run(fid);
        q.delLedger.run(fid);
        q.delPair.run(fid);
        q.delFam.run(fid);
      });
      return [204, null, 'family.delete'];
    }
    throw new HttpErr(404, 'not_found');
  }

  const server = http.createServer({ connectionsCheckingInterval: 2000 }, async (req, res) => {
    const t0 = process.hrtime.bigint();
    const ip = ipOf(req);
    const origin = req.headers.origin;
    let status = 500;
    let label = '?';
    const send = (code, body, extra = {}) => {
      status = code;
      const data = body === null ? '' : JSON.stringify(body);
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
      res.end(data);
    };
    const cors = {};
    if (origin && originOk(origin)) Object.assign(cors, { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-expose-headers': 'ETag, Retry-After' });
    try {
      if (origin && !originOk(origin)) {
        label = 'cors-denied';
        return send(403, { error: 'origin' });
      }
      if (req.method === 'OPTIONS') {
        label = 'preflight';
        return send(204, null, { ...cors, 'access-control-allow-methods': 'GET, PUT, POST, DELETE', 'access-control-allow-headers': 'Authorization, Content-Type, If-Match, If-None-Match, X-KG-Delete-Token, X-KG-Pair-Code', 'access-control-max-age': '600' });
      }
      const w = lim.hit('ip:' + ip, 240 * cfg.rateMult, 60);
      if (w) throw new HttpErr(429, 'slow_down', { retry: w });
      const [code, body, lb] = await route(req, ip);
      label = lb;
      send(code, body, cors);
    } catch (e) {
      if (e instanceof HttpErr) {
        label = label === '?' ? e.code : label;
        send(e.status, { error: e.code, ...e.extra }, { ...cors, ...(e.extra.retry ? { 'retry-after': String(e.extra.retry) } : {}) });
      } else {
        logRaw({ ev: 'error', msg: String(e && e.message).slice(0, 120) });
        if (!res.headersSent) send(500, { error: 'internal' }, cors);
      }
    } finally {
      log({ ev: 'req', m: req.method, r: label, s: status, ms: Number((process.hrtime.bigint() - t0) / 1000n) / 1000, ip: crypto.createHash('sha256').update(salt).update(ip).digest('hex').slice(0, 8) });
    }
  });
  server.headersTimeout = cfg.headersTimeoutMs;
  server.requestTimeout = cfg.requestTimeoutMs;
  server.keepAliveTimeout = 30000;
  server.maxHeadersCount = 40;
  server.maxConnections = 200;
  return { server, db, lim, q, setLastBackup, paused, diskOk };
}

// ------------------------------------------------------------------ backups (in-process, nightly: no `docker exec` second node process inside the memory limit)
// snapshot = SQLite online backup into ONE self-contained file (journal_mode=DELETE: no -wal / -shm sidecars to forget when it is copied, pulled off-box or opened read-only) + integrity_check + counts.
export async function snapshot(db, dst) {
  await backup(db, dst);
  const chk = new DatabaseSync(dst);
  const integrity = Object.values(chk.prepare('PRAGMA integrity_check').get())[0];
  const stats = { families: chk.prepare('SELECT COUNT(*) c FROM family').get().c, stores: chk.prepare('SELECT COUNT(*) c FROM store').get().c, events: chk.prepare('SELECT COUNT(*) c FROM ledger').get().c };
  chk.exec('PRAGMA journal_mode=DELETE');
  chk.close();
  return { integrity, ...stats };
}
export async function runBackup(db, dir, cfg = CFG, when = new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  const ymd = when.toISOString().slice(0, 10);
  const tmp = path.join(dir, `.tmp-${ymd}.db`);
  fs.rmSync(tmp, { force: true });
  const { integrity: ok, ...stats } = await snapshot(db, tmp);
  if (ok !== 'ok') {
    fs.rmSync(tmp, { force: true });
    throw new Error('backup integrity_check failed');
  }
  const daily = path.join(dir, `kg-d-${ymd}.db`);
  fs.renameSync(tmp, daily);
  if (when.getUTCDay() === 0) fs.copyFileSync(daily, path.join(dir, `kg-w-${ymd}.db`));
  for (const [pre, keep] of [['kg-d-', cfg.keepDaily], ['kg-w-', cfg.keepWeekly]]) {
    const f = fs.readdirSync(dir).filter((x) => x.startsWith(pre)).sort();
    for (const old of f.slice(0, Math.max(0, f.length - keep))) fs.rmSync(path.join(dir, old), { force: true });
  }
  const lastOk = path.join(dir, 'LAST_OK');
  fs.writeFileSync(lastOk + '.tmp', JSON.stringify({ at: when.toISOString(), file: path.basename(daily), integrity: ok, ...stats }) + '\n');
  fs.renameSync(lastOk + '.tmp', lastOk); // atomic: a reader (healthz, off-box pull) never sees a half-written marker
  return { file: daily, integrity: ok, ...stats };
}

// ------------------------------------------------------------------ command line
const cmd = process.argv[2];
if (process.argv[1]?.endsWith('server.mjs') && cmd) {
  if (cmd === 'serve') {
    if (!CFG.enroll || CFG.enroll.length < 12) {
      console.error('KG_ENROLL_CODE (>= 12 chars; generate with: openssl rand -base64 12) is required');
      process.exit(2);
    }
    if (E.KG_TRUST_PROXY !== '0' && E.KG_TRUST_PROXY !== '1') {
      console.error('KG_TRUST_PROXY must be set explicitly to 0 or 1 (refusing to guess: a wrong guess makes every visitor share one rate-limit bucket or lets anyone spoof X-Forwarded-For)');
      process.exit(2);
    }
    if (CFG.trustProxy && !CFG.proxyCidr.length) {
      console.error('KG_TRUST_PROXY=1 requires KG_PROXY_CIDR (the proxy network, e.g. 172.30.77.0/24): X-Forwarded-For is only honoured from there');
      process.exit(2);
    }
    const { server, db, setLastBackup } = createServer();
    server.listen(CFG.port, CFG.host, () => process.stdout.write(JSON.stringify({ ev: 'listening', port: CFG.port }) + '\n'));
    if (CFG.backupDir) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(CFG.backupDir, 'LAST_OK'), 'utf8'));
        setLastBackup(Math.floor(new Date(j.at).getTime() / 1000));
      } catch {
        /* no backup yet */
      }
      const tick = async () => {
        const d = new Date();
        const today = d.toISOString().slice(0, 10);
        const done = fs.existsSync(path.join(CFG.backupDir, `kg-d-${today}.db`));
        if (!done && d.getUTCHours() >= CFG.backupHour) {
          try {
            const r = await runBackup(db, CFG.backupDir);
            setLastBackup(Math.floor(Date.now() / 1000));
            process.stdout.write(JSON.stringify({ ev: 'backup', ok: true, ...r }) + '\n');
          } catch (e) {
            process.stdout.write(JSON.stringify({ ev: 'backup', ok: false, msg: String(e.message).slice(0, 100) }) + '\n');
          }
        }
      };
      setInterval(tick, 10 * 60 * 1000).unref();
      setTimeout(tick, Number(E.KG_BACKUP_FIRST_MS || 15000)).unref();
    }
    const stop = () => {
      const finish = () => {
        try {
          db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
          db.close();
        } catch {
          /* already closed or busy: the WAL is replayed on the next start */
        }
        process.exit(0);
      };
      server.close(finish);
      server.closeIdleConnections();
      setTimeout(() => server.closeAllConnections(), 2000).unref();
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
    // anything unexpected: say so (no secrets can be in these messages) and exit, Docker restarts us
    process.on('uncaughtException', (e) => {
      process.stdout.write(JSON.stringify({ ev: 'fatal', msg: String(e && e.message).slice(0, 120) }) + '\n');
      process.exit(1);
    });
    process.on('unhandledRejection', (e) => {
      process.stdout.write(JSON.stringify({ ev: 'fatal', msg: String(e && e.message ? e.message : e).slice(0, 120) }) + '\n');
      process.exit(1);
    });
  } else if (cmd === 'health') {
    // plain http.get (no fetch/undici: ~35 MB instead of ~50 MB). The container HEALTHCHECK itself uses bash /dev/tcp (1.7 MB), this is for manual use.
    http
      .get({ host: '127.0.0.1', port: CFG.port, path: '/healthz', timeout: 4000 }, (r) => {
        r.resume();
        process.exit(r.statusCode === 200 ? 0 : 1);
      })
      .on('error', () => process.exit(1))
      .on('timeout', () => process.exit(1));
  } else if (cmd === 'backup') {
    if (!process.argv[3]) {
      console.error('usage: node server.mjs backup <dst.db>');
      process.exit(2);
    }
    const db = openDb();
    const r = await snapshot(db, process.argv[3]);
    console.log(JSON.stringify({ backup: process.argv[3], integrity: r.integrity }));
    if (r.integrity !== 'ok') process.exit(3);
  } else if (cmd === 'status') {
    if (!fs.existsSync(CFG.db)) {
      console.error(`no database at ${CFG.db}`);
      process.exit(2);
    }
    const db = new DatabaseSync(CFG.db, { readOnly: true });
    const f = db.prepare('SELECT COUNT(*) c FROM family').get().c;
    const s = db.prepare('SELECT COUNT(*) c FROM store').get().c;
    const l = db.prepare('SELECT COUNT(*) c FROM ledger').get().c;
    let bak = null;
    try {
      bak = JSON.parse(fs.readFileSync(path.join(CFG.backupDir || '.', 'LAST_OK'), 'utf8'));
    } catch {
      /* no backup marker */
    }
    const st = fs.statfsSync(path.dirname(path.resolve(CFG.db)));
    console.log(JSON.stringify({ families: f, stores: s, events: l, dbMB: +(fs.statSync(CFG.db).size / 1048576).toFixed(2), freeMB: Math.round((st.bavail * st.bsize) / 1048576), lastBackup: bak }));
  } else if (cmd === 'restore') {
    if (!process.argv[3]) {
      console.error('usage: node server.mjs restore <src.db> [dst.db]');
      process.exit(2);
    }
    const src = new DatabaseSync(process.argv[3]);
    const chk = Object.values(src.prepare('PRAGMA integrity_check').get())[0];
    if (chk !== 'ok') {
      console.error('integrity_check failed');
      process.exit(3);
    }
    const dst = process.argv[4] || CFG.db;
    for (const suf of ['-wal', '-shm']) fs.rmSync(dst + suf, { force: true }); // stale WAL/SHM of the old database must never be replayed over the restored file
    await backup(src, dst);
    const db = openDb(dst);
    db.prepare("UPDATE meta SET v=? WHERE k='epoch'").run(b64u(crypto.randomBytes(8))); // new epoch: every device clears its cursors and re-pushes what it holds
    console.log(JSON.stringify({ restored: true, newEpoch: true }));
  } else {
    console.error('usage: node server.mjs serve | backup <dst.db> | restore <src.db> [dst.db] | health | status');
    process.exit(2);
  }
}
