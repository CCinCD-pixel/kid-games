import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export function validateReference(mode, ref) {
  if (mode === 8) return typeof ref === 'string' && ref.length < 240 && ref.split(' ').length <= 30 && /^(?:[a-zv]+[1-4])(?: [a-zv]+[1-4])*$/.test(ref);
  return mode === 1 && typeof ref === 'string' && /^[\u3400-\u9fff，。！？、 ]{1,60}$/.test(ref);
}
export function signSoe({ appid, secretId, secretKey }, { mode, ref, now = Math.floor(Date.now()/1000), voiceId = randomUUID(), coefficient = 1 }) {
  if (!validateReference(mode, ref)) throw new Error('invalid_reference');
  if (![appid, secretId, secretKey].every(x => typeof x === 'string' && x.length > 0)) throw new Error('not_configured');
  const params = { eval_mode: mode, expired: now+60, nonce: now, rec_mode: 1, ref_text: mode === 1 ? `{::cmd{F_TDET=true}}${ref}` : ref, score_coeff: coefficient, secretid: secretId, sentence_info_enabled: 1, server_engine_type: '16k_zh', text_mode: 0, timestamp: now, voice_format: 1, voice_id: voiceId };
  const entries = Object.entries(params).sort(([a],[b]) => a.localeCompare(b));
  const path = `soe.cloud.tencent.com/soe/api/${appid}`;
  const signature = createHmac('sha1', secretKey).update(`${path}?${entries.map(([k,v]) => `${k}=${v}`).join('&')}`).digest('base64');
  return { url: `wss://${path}?${new URLSearchParams([...entries.map(([k,v]) => [k,String(v)]), ['signature',signature]])}`, expiresAt: (now+60)*1000 };
}
export function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
// Strong reads + conditional ETag writes prevent parallel requests bypassing the daily cap.
export async function consumeQuota(store, key, limit = 600) {
  for (let i=0;i<12;i++) {
    const old = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const count = Number(old?.data?.count ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) return false;
    if (count >= limit) return false;
    const result = await store.setJSON(key, { count: count+1 }, old ? { onlyIfMatch: old.etag } : { onlyIfNew: true });
    if (result.modified) return true;
  }
  return false;
}
export function createHandler({ env, quota, now = Date.now }) {
  return async (request) => {
    const origin = request.headers.get('Origin'), allowed = env.ALLOWED_ORIGIN || env.URL;
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', Vary: 'Origin' };
    if (origin && origin === allowed) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, X-Family-Token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (!allowed || (origin && origin !== allowed)) return reply(403, { error: 'origin_denied' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!safeEqual(request.headers.get('X-Family-Token'), env.FAMILY_TOKEN)) return reply(401,{error:'unauthorized'});
    if (request.method !== 'POST') return reply(405,{error:'method_not_allowed'});
    let body;
    try {
      const reader = request.body?.getReader(), chunks = []; let size = 0;
      if (!reader) return reply(400,{error:'invalid_request'});
      try {
        while (true) {
          const {done,value} = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 4096) { await reader.cancel(); return reply(413,{error:'request_too_large'}); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return reply(400,{error:'invalid_request'}); }
    if (!validateReference(body?.mode, body?.ref)) return reply(400,{error:'invalid_reference'});
    const credentials = { appid: env.TENCENT_SOE_APPID, secretId: env.TENCENT_SOE_SECRET_ID, secretKey: env.TENCENT_SOE_SECRET_KEY };
    if (!Object.values(credentials).every(Boolean)) return reply(503,{error:'not_configured'});
    try {
      const day = new Date(now()+8*3600000).toISOString().slice(0,10);
      if (!await quota(day)) return reply(429,{error:'daily_limit'});
      return reply(200, signSoe(credentials, { mode: body.mode, ref: body.ref, now: Math.floor(now()/1000) }));
    } catch { return reply(503,{error:'temporarily_unavailable'}); }
  };
}
