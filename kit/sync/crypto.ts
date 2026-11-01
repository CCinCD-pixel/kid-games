/** Browser WebCrypto primitives for the optional family sync. Secrets never leave the device unsealed. */
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const WEIGHTS = [1, 3, 5, 7] as const;

export function b64u(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  const out = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  if (b64u(out) !== value) throw new Error('noncanonical base64url');
  return out;
}

function check(group: readonly number[], index: number): number {
  return (11 * (index + 1) + group.reduce((sum, value, i) => sum + WEIGHTS[i] * value, 0)) & 31;
}

/** Eight four-character groups, each followed by a check character. */
export function toCode(secret: Uint8Array): string {
  if (secret.length !== 20) throw new Error('family key must be 160 bits');
  let bits = 0, value = 0;
  const digits: number[] = [];
  for (const byte of secret) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { digits.push((value >>> (bits - 5)) & 31); bits -= 5; }
  }
  return Array.from({ length: 8 }, (_, i) => {
    const group = digits.slice(i * 4, i * 4 + 4);
    return [...group, check(group, i)].map((digit) => BASE32[digit]).join('');
  }).join('-');
}

export type CodeResult = { ok: true; secret: Uint8Array } | { ok: false; reason: 'length' | 'char' | 'check'; group?: number };
export function fromCode(code: string): CodeResult {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (normalized.length !== 40) return { ok: false, reason: 'length' };
  const digits = [...normalized].map((ch) => BASE32.indexOf(ch));
  if (digits.includes(-1)) return { ok: false, reason: 'char' };
  for (let i = 0; i < 8; i++) if (check(digits.slice(i * 5, i * 5 + 4), i) !== digits[i * 5 + 4]) return { ok: false, reason: 'check', group: i + 1 };
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (let group = 0; group < 8; group++) for (let i = 0; i < 4; i++) {
    value = (value << 5) | digits[group * 5 + i]; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return { ok: true, secret: Uint8Array.from(bytes) };
}

export function newSecret(): Uint8Array { return crypto.getRandomValues(new Uint8Array(20)); }

async function hkdf(secret: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const input = await crypto.subtle.importKey('raw', secret as BufferSource, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('kg-sync-v1'), info: encoder.encode(info) }, input, length * 8));
}

export interface FamilyKeys { fid: string; auth: string; del: string; encKey: CryptoKey }
export async function derive(secret: Uint8Array): Promise<FamilyKeys> {
  if (secret.length !== 20) throw new Error('family key must be 160 bits');
  const [fid, auth, del, key] = await Promise.all([hkdf(secret, 'fid', 16), hkdf(secret, 'auth', 32), hkdf(secret, 'del', 32), hkdf(secret, 'enc', 32)]);
  return { fid: b64u(fid), auth: b64u(auth), del: b64u(del), encKey: await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']) };
}

async function gzip(bytes: Uint8Array, decompress = false): Promise<Uint8Array> {
  const stream = decompress ? new DecompressionStream('gzip') : new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const result = new Response(stream.readable).arrayBuffer();
  await writer.write(bytes as BufferSource); await writer.close();
  return new Uint8Array(await result);
}

/** The AAD binds a ciphertext to one family, slot, version and compression flag. */
export async function seal(keys: FamilyKeys, slot: string, version: number, data: unknown): Promise<string> {
  const raw = encoder.encode(JSON.stringify(data));
  const flag = raw.length > 256 ? 1 : 0;
  const plain = flag ? await gzip(raw) : raw;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${keys.fid}|${slot}|${version}|${flag}`) }, keys.encKey, plain as BufferSource));
  const envelope = new Uint8Array(13 + ciphertext.length);
  envelope[0] = flag; envelope.set(iv, 1); envelope.set(ciphertext, 13);
  return b64u(envelope);
}

export async function open<T>(keys: FamilyKeys, slot: string, version: number, sealed: string): Promise<T> {
  const envelope = unb64u(sealed);
  if (envelope.length < 30 || (envelope[0] !== 0 && envelope[0] !== 1)) throw new Error('invalid envelope');
  const flag = envelope[0];
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: envelope.slice(1, 13), additionalData: encoder.encode(`${keys.fid}|${slot}|${version}|${flag}`) }, keys.encKey, envelope.slice(13) as BufferSource));
  return JSON.parse(decoder.decode(flag ? await gzip(plain, true) : plain)) as T;
}

export interface EphemeralKey { priv: CryptoKey; pub: Uint8Array }
export async function ecKey(): Promise<EphemeralKey> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { priv: pair.privateKey, pub: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)) };
}
export async function sharedKey(privateKey: CryptoKey, other: Uint8Array): Promise<CryptoKey> {
  const publicKey = await crypto.subtle.importKey('raw', other as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256));
  return crypto.subtle.importKey('raw', await hkdf(bits, 'pair', 32) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function sha(...parts: Uint8Array[]): Promise<Uint8Array> {
  const joined = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0; for (const part of parts) { joined.set(part, offset); offset += part.length; }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', joined));
}
export function newNonce(): Uint8Array { return crypto.getRandomValues(new Uint8Array(16)); }
export async function pairCommit(publicKey: Uint8Array, nonce: Uint8Array): Promise<string> { return b64u(await sha(encoder.encode('kg-pair-commit'), publicKey, nonce)); }
export async function sas(aPub: Uint8Array, bPub: Uint8Array, nonce: Uint8Array): Promise<string> {
  const hash = await sha(encoder.encode('kg-pair-sas'), aPub, bPub, nonce);
  return String(((((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 0) % 1_000_000)).padStart(6, '0');
}
export async function wrap(key: CryptoKey, bytes: Uint8Array, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, bytes as BufferSource));
  const envelope = new Uint8Array(12 + encrypted.length); envelope.set(iv); envelope.set(encrypted, 12);
  return b64u(envelope);
}
export async function unwrap(key: CryptoKey, sealed: string, aad: string): Promise<Uint8Array> {
  const envelope = unb64u(sealed);
  if (envelope.length < 29) throw new Error('invalid pair envelope');
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: envelope.slice(0, 12), additionalData: encoder.encode(aad) }, key, envelope.slice(12) as BufferSource));
}
export async function sealEvent(keys: FamilyKeys, event: { id: string }): Promise<string> { return seal(keys, `ledger:${event.id}`, 1, event); }
export async function openEvent<T extends { id: string }>(keys: FamilyKeys, id: string, sealed: string): Promise<T> {
  const event = await open<T>(keys, `ledger:${id}`, 1, sealed);
  if (event.id !== id) throw new Error('ledger id mismatch');
  return event;
}
