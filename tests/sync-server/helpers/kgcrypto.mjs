// kgcrypto.mjs -- test-side copy of the WebCrypto layer of kit/sync (prototype ~/kid-games-work/specs/sync-tools/kgcrypto.mjs): key derivation, sealed envelopes, pairing (ECDH + SAS).
// Used ONLY by tests/sync-server to produce real sealed envelopes / pairing messages for the server; the server never sees plaintext.
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64u = (u8) => Buffer.from(u8).toString('base64url');
export const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const W = [1, 3, 5, 7];                                      // odd weights: any single wrong character in a group is ALWAYS detected (e*w != 0 mod 32); adjacent swaps in >= 15/16 of cases
const chk = (vals, gi) => { let c = 11 * (gi + 1); for (let i = 0; i < 4; i++) c += W[i] * vals[i]; return c & 31; };
export function toCode(bytes) {                              // 20 bytes -> 32 base32 chars -> 8 groups of 4 + 1 check char each: 'ABCD7-EFGH2-...' (40 chars + 7 dashes)
  let bits = 0, v = 0, out = []; for (const b of bytes) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out.push((v >>> (bits - 5)) & 31); bits -= 5; } }
  const groups = []; for (let g = 0; g < out.length / 4; g++) { const vals = out.slice(g * 4, g * 4 + 4); groups.push([...vals, chk(vals, g)].map((i) => B32[i]).join('')); } return groups.join('-');
}
// returns { ok:true, secret } or { ok:false, reason:'length'|'char'|'check', group?: 1-based index of the first wrong group }  (the client shows "第 N 组可能输错" and sends NOTHING to the server)
export function fromCode(code) {
  const s = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1'); if (s.length !== 40) return { ok: false, reason: 'length' };
  const vals = []; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) return { ok: false, reason: 'char' }; vals.push(i); }
  for (let g = 0; g < 8; g++) { const gv = vals.slice(g * 5, g * 5 + 4); if (chk(gv, g) !== vals[g * 5 + 4]) return { ok: false, reason: 'check', group: g + 1 }; }
  let bits = 0, v = 0; const out = []; for (let g = 0; g < 8; g++) for (let i = 0; i < 4; i++) { v = ((v << 5) | vals[g * 5 + i]) & 0xffff; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return { ok: true, secret: new Uint8Array(out) };
}
export const newSecret = () => crypto.getRandomValues(new Uint8Array(20));          // 160 bits = 32 base32 chars "家庭钥匙"
async function hkdf(secret, info, bytes) { const k = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('kg-sync-v1'), info: enc.encode(info) }, k, bytes * 8)); }
export async function derive(secret) {
  const fid = b64u(await hkdf(secret, 'fid', 16)), auth = b64u(await hkdf(secret, 'auth', 32)), del = b64u(await hkdf(secret, 'del', 32));   // del: delete token (only a holder of the key can derive it; a stolen Bearer cannot delete the family)
  const encKey = await crypto.subtle.importKey('raw', await hkdf(secret, 'enc', 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { fid, auth, del, encKey };
}
async function gz(u8, mode) { const cs = new (mode === 'c' ? CompressionStream : DecompressionStream)('gzip'); const w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
// seal: JSON -> gzip -> AES-GCM(iv random 12 B, AAD = fid|slot|v|flag) -> base64url(flag||iv||ct)
export async function seal(keys, slot, v, obj) {
  const raw = enc.encode(JSON.stringify(obj)); const z = raw.length > 256 ? await gz(raw, 'c') : raw; const flag = z === raw ? 0 : 1;
  const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${keys.fid}|${slot}|${v}|${flag}`) }, keys.encKey, z));
  const out = new Uint8Array(1 + 12 + ct.length); out[0] = flag; out.set(iv, 1); out.set(ct, 13); return b64u(out);
}
export async function open(keys, slot, v, s) {
  const u = unb64u(s); const flag = u[0], iv = u.slice(1, 13), ct = u.slice(13);
  const z = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${keys.fid}|${slot}|${v}|${flag}`) }, keys.encKey, ct));
  return JSON.parse(dec.decode(flag ? await gz(z, 'd') : z));
}
// pairing v1.1 (commit-then-reveal, ZRTP style). A and B each make an ephemeral ECDH P-256 key.
//   1 B -> server: commit = H(bpub || nB)            (B has NOT revealed bpub / nB; the server cannot grind against them)
//   2 A -> server: apub                               (only AFTER A has seen the commit)
//   3 B -> server: bpub, nB                           (only after B has seen apub; A checks H(bpub||nB) == commit)
//   4 both screens: SAS = 6 digits of H(apub || bpub || nB); the parent compares and taps allow -> A uploads grant = AES-GCM(ECDH key, secret, aad = pid)
// An active man in the middle must fix its keys BEFORE it can compute the SAS the other side will show, so it can only guess: success probability 1e-6 per pairing (and the mismatch is visible).
export async function ecKey() { const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); return { priv: kp.privateKey, pub: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) }; }
export async function sharedKey(priv, otherPub) { const pub = await crypto.subtle.importKey('raw', otherPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []); const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256)); return crypto.subtle.importKey('raw', await hkdf(bits, 'pair', 32), 'AES-GCM', false, ['encrypt', 'decrypt']); }
const sha = async (...parts) => { const len = parts.reduce((n, p) => n + p.length, 0); const u = new Uint8Array(len); let o = 0; for (const p of parts) { u.set(p, o); o += p.length; } return new Uint8Array(await crypto.subtle.digest('SHA-256', u)); };
export const newNonce = () => crypto.getRandomValues(new Uint8Array(16));
export const pairCommit = async (bpub, nB) => b64u(await sha(enc.encode('kg-pair-commit'), bpub, nB));
export async function sas(apub, bpub, nB, digits = 6) { const h = await sha(enc.encode('kg-pair-sas'), apub, bpub, nB); const n = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0; return String(n % 10 ** digits).padStart(digits, '0'); }
export async function sasOld(pubA, pubB) { const h = await sha(pubA, pubB); return String(((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0).padStart(10, '0').slice(-4); }   // v1.0 (broken against an adaptive attacker) — kept for the demonstration only
export async function wrap(key, payload, aad = '') { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, payload)); return b64u(new Uint8Array([...iv, ...ct])); }
export async function unwrap(key, s, aad = '') { const u = unb64u(s); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12), additionalData: enc.encode(aad) }, key, u.slice(12))); }
export const sha256b64u = async (s) => b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', unb64u(s))));

// ledger events: one sealed envelope each; the AAD binds the event id (slot = 'ledger:<id>'), and the plaintext id MUST equal the outer id (a server that replays a ciphertext under a new id is detected)
export const sealEvent = (keys, ev) => seal(keys, 'ledger:' + ev.id, 1, ev);
export async function openEvent(keys, id, s) { const ev = await open(keys, 'ledger:' + id, 1, s); if (ev.id !== id) throw new Error('ledger id mismatch'); return ev; }
