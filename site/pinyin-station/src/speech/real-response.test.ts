import { afterEach, describe, expect, it, vi } from 'vitest';
import responses from './fixtures/real-responses.json';
import { assess } from './client';
import { normalize } from './normalize';

// Captured from adult reference recordings on 2026-10-22. Only assessment fields
// are retained: no audio, utterance identifiers, account data or signed URLs.
describe('real Tencent assessment responses', () => {
  it('reads Phone when ReferenceLetter and ReferencePhone are empty', () => {
    const verdict = normalize(responses.correctBa1, 150, 'gentle', { mode: 8, ref: 'ba1' });

    expect(verdict.dims.initial?.score).toBeCloseTo(98.03314971923828);
    expect(verdict.dims.final?.score).toBeCloseTo(98.92884826660156);
    expect(verdict.status).toBe('judged');
    expect(verdict.level).toBe(3);
    expect(verdict.dims.tone).toBeUndefined();
  });

  it.each([
    ['pā against bā', responses.pa1AgainstBa1, 'ba1'],
    ['tā against dā', responses.ta1AgainstDa1, 'da1'],
  ])('suggests another listen for %s despite MatchTag=0', (_, raw, ref) => {
    const verdict = normalize(raw, 150, 'gentle', { mode: 8, ref });

    expect(raw.Words[0].MatchTag).toBe(0);
    expect(raw.Words[0].PhoneInfos.every((phone) => phone.MatchTag === 0)).toBe(true);
    expect(verdict.status).toBe('judged');
    expect(verdict.level).toBe(1);
    expect(verdict.dims.initial?.ok).toBe(false);
    expect(verdict.dims.final?.ok).toBe(false);
    expect(verdict.dims.tone).toBeUndefined();
  });

  it('does not turn high pinyin scores into a passed tone', () => {
    // Actual audio is bá, while the requested pronunciation is bā. The service
    // returns high phoneme scores and explicitly says tone detection is invalid.
    const verdict = normalize(responses.ba2AgainstBa1Pinyin, 150, 'gentle', { mode: 8, ref: 'ba1' });

    expect(verdict.dims.initial?.ok).toBe(true);
    expect(verdict.dims.final?.ok).toBe(true);
    expect(verdict.dims.tone).toBeUndefined();
  });

  it('keeps Valid=true with HypothesisTone=-1 unconfirmed', () => {
    const verdict = normalize(responses.unconfirmedBa2AgainstBa1, 150, 'gentle', {
      mode: 1,
      ref: '{::cmd{F_TDET=true}}八',
    });

    expect(verdict.status).toBe('unsure');
    expect(verdict.dims.tone).toBeUndefined();
    expect(verdict.level).not.toBe(1);
  });

  it('keeps silence unjudged in either assessment mode', () => {
    expect(normalize(responses.silence, 150, 'gentle', { mode: 8, ref: 'ba1' })).toMatchObject({
      status: 'unsure',
      dims: {},
    });
    expect(normalize(responses.branchSilence, 150, 'gentle', { mode: 6, ref: '八|趴' })).toMatchObject({
      status: 'unsure',
      dims: {},
    });
  });

  it('retains evidence that a matching reported tone can be an upstream false acceptance', () => {
    // This is a known limitation, not a claim that the adapter can infer the
    // actual bà from the response. The service reported the target bā as heard.
    const reported = responses.falseAcceptedBa4AgainstBa1.Words[0].Tone;
    expect(reported).toEqual({ Valid: true, RefTone: 1, HypothesisTone: 1 });
  });

  it('uses a consistent branch as consonant evidence without trusting its polyphonic final', () => {
    const plan = { mode: 6 as const, ref: '梨|泥', branches: { syllables: ['li2', 'ni2'], target: 0, confusion: 'l|n' } };
    const verdict = normalize(responses.ni2AgainstLiOrNi, 150, 'gentle', plan);
    expect(verdict).toMatchObject({ status: 'judged', level: 1, confusion: 'l|n', dims: { initial: { ok: false, heard: 'ni2' } } });
    expect(verdict.dims.final).toBeUndefined();
    expect(verdict.dims.tone).toBeUndefined();
    const inconsistent = { ...responses.ni2AgainstLiOrNi, RefTextId: 0 };
    expect(normalize(inconsistent, 150, 'gentle', plan)).toMatchObject({ status: 'unsure', dims: {}, reason: 'branch_unconfirmed' });
  });

  it('retains the branch choice and unlocked polyphonic 泥 independently', () => {
    // The branch selection is correct for ní, but the returned final is i4;
    // branch accuracy alone does not establish correct tone or final scoring.
    expect(responses.ni2AgainstLiOrNi.RefTextId).toBe(1);
    expect(responses.ni2AgainstLiOrNi.Words[0].Word).toBe('泥');
    expect(responses.ni2AgainstLiOrNi.Words[0].PhoneInfos[1].Phone).toBe('i4');
    expect(responses.ni2AgainstLiOrNi.Words[0].Tone.Valid).toBe(false);
  });
});

describe('assessment transport completion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not judge an intermediate result when the socket closes without final', async () => {
    class Socket {
      static active: Socket;
      onmessage?: (event: { data: string }) => void;
      onerror?: () => void;
      onclose?: () => void;
      constructor() {
        Socket.active = this;
      }
      send() {}
      close() {}
    }
    vi.stubGlobal('WebSocket', Socket);
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({ url: 'wss://soe.cloud.tencent.com/soe/api/test' }),
    }));
    const result = assess(new Int16Array(1), 1, '八', 'local-test', 'gentle', new AbortController().signal);
    await vi.waitFor(() => expect(Socket.active).toBeDefined());
    Socket.active.onmessage?.({
      data: JSON.stringify({ code: 0, result: responses.correctBa1Sentence }),
    });
    Socket.active.onclose?.();

    const verdict = await result;
    expect(verdict.status).toBe('unsure');
    expect(verdict.dims).toEqual({});
  });
});
