import { describe, expect, it } from 'vitest';
import { b64u, derive, ecKey, fromCode, newNonce, newSecret, open, openEvent, pairCommit, sas, seal, sealEvent, sharedKey, toCode, unb64u, unwrap, wrap } from '../../kit/sync/crypto';

describe('family key and sealed sync payloads', () => {
  it('detects a changed character in each code group', () => {
    const secret = newSecret(); const code = toCode(secret);
    const parsed = fromCode(code);
    expect(parsed.ok && [...parsed.secret]).toEqual([...secret]);
    for (let group = 0; group < 8; group++) {
      const at = group * 6;
      const changed = code.slice(0, at) + (code[at] === 'A' ? 'B' : 'A') + code.slice(at + 1);
      expect(fromCode(changed)).toEqual({ ok: false, reason: 'check', group: group + 1 });
    }
    expect(fromCode(code.slice(1))).toEqual({ ok: false, reason: 'length' });
  });

  it('binds ciphertext to family, slot and version, and rejects malformed envelopes', async () => {
    const keys = await derive(newSecret());
    const value = { score: 123, note: '火星'.repeat(200) };
    const sealed = await seal(keys, 'mars-base', 6, value);
    expect(await open(keys, 'mars-base', 6, sealed)).toEqual(value);
    await expect(open(keys, 'xiangqi', 6, sealed)).rejects.toThrow();
    await expect(open(keys, 'mars-base', 5, sealed)).rejects.toThrow();
    await expect(open(await derive(newSecret()), 'mars-base', 6, sealed)).rejects.toThrow();
    const bytes = unb64u(sealed); bytes[0] = 2;
    await expect(open(keys, 'mars-base', 6, b64u(bytes))).rejects.toThrow('invalid envelope');
    await expect(open(keys, 'mars-base', 6, b64u(new Uint8Array(2)))).rejects.toThrow('invalid envelope');
  });

  it('binds each ledger payload to its outer event id', async () => {
    const keys = await derive(newSecret());
    const event = { id: 'mn:one:1:a', amount: 26 };
    const sealed = await sealEvent(keys, event);
    expect(await openEvent(keys, event.id, sealed)).toEqual(event);
    await expect(openEvent(keys, 'mn:other:1:a', sealed)).rejects.toThrow();
    const forged = await seal(keys, 'ledger:mn:other:1:a', 1, event);
    await expect(openEvent(keys, 'mn:other:1:a', forged)).rejects.toThrow('ledger id mismatch');
  });

  it('commits before reveal, agrees on the short code and transfers a key only with matching AAD', async () => {
    const a = await ecKey(), b = await ecKey(), nonce = newNonce();
    expect(await pairCommit(b.pub, nonce)).not.toBe(await pairCommit(b.pub, newNonce()));
    expect(await sas(a.pub, b.pub, nonce)).toMatch(/^\d{6}$/);
    const aShared = await sharedKey(a.priv, b.pub), bShared = await sharedKey(b.priv, a.pub);
    const secret = newSecret(); const sealed = await wrap(aShared, secret, 'pair-1');
    expect(await unwrap(bShared, sealed, 'pair-1')).toEqual(secret);
    await expect(unwrap(bShared, sealed, 'pair-2')).rejects.toThrow();
  });
});
