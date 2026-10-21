// Types for kgcrypto.mjs (test helper; plain JS so that node scripts and vitest can share it).
export interface Keys {
  fid: string;
  auth: string;
  del: string;
  encKey: CryptoKey;
}
export const b64u: (u8: Uint8Array) => string;
export const unb64u: (s: string) => Uint8Array;
export function toCode(bytes: Uint8Array): string;
export type CodeResult = { ok: true; secret: Uint8Array } | { ok: false; reason: 'length' | 'char' | 'check'; group?: number };
export function fromCode(code: string): CodeResult;
export const newSecret: () => Uint8Array;
export function derive(secret: Uint8Array): Promise<Keys>;
export function seal(keys: Keys, slot: string, v: number, obj: unknown): Promise<string>;
export function open(keys: Keys, slot: string, v: number, s: string): Promise<any>;
export function ecKey(): Promise<{ priv: CryptoKey; pub: Uint8Array }>;
export function sharedKey(priv: CryptoKey, otherPub: Uint8Array): Promise<CryptoKey>;
export const newNonce: () => Uint8Array;
export const pairCommit: (bpub: Uint8Array, nB: Uint8Array) => Promise<string>;
export function sas(apub: Uint8Array, bpub: Uint8Array, nB: Uint8Array, digits?: number): Promise<string>;
export function wrap(key: CryptoKey, payload: Uint8Array, aad?: string): Promise<string>;
export function unwrap(key: CryptoKey, s: string, aad?: string): Promise<Uint8Array>;
export const sha256b64u: (s: string) => Promise<string>;
export const sealEvent: (keys: Keys, ev: { id: string } & Record<string, unknown>) => Promise<string>;
export function openEvent(keys: Keys, id: string, s: string): Promise<any>;
