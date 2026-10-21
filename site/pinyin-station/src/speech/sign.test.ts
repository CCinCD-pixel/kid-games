import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM server implementation, excluded from the child bundle
import { createHandler, signSoe, consumeQuota } from '../../../../netlify/lib/soe-core.mjs';

describe('private SOE signing boundary', () => {
  const env = { URL: 'https://family.test', FAMILY_TOKEN: 'family-test', TENCENT_SOE_APPID:'1', TENCENT_SOE_SECRET_ID:'test-id', TENCENT_SOE_SECRET_KEY:'test-key' };
  const req = (token = '', origin = env.URL, body = { mode: 8, ref: 'ba1' }) => new Request(env.URL, { method:'POST',headers:{Origin:origin,'X-Family-Token':token},body:JSON.stringify(body) });
  it('rejects absent credentials, foreign origins and arbitrary reference commands', async () => {
    const run = createHandler({env,quota:async()=>true});
    expect((await run(req())).status).toBe(401);
    expect((await run(req(env.FAMILY_TOKEN,'https://foreign.test'))).status).toBe(403);
    expect((await run(req(env.FAMILY_TOKEN,env.URL,{mode:8,ref:'{::cmd{evil}}'}))).status).toBe(400);
  });
  it('fails closed on quota exhaustion and never caches signed URLs', async () => {
    const run = createHandler({env,quota:async()=>false});
    expect((await run(req(env.FAMILY_TOKEN))).status).toBe(429);
    const ok = await createHandler({env,quota:async()=>true})(req(env.FAMILY_TOKEN));
    expect(ok.headers.get('Cache-Control')).toContain('no-store');
    const payload = await ok.json();
    expect(payload.url).not.toContain(env.TENCENT_SOE_SECRET_KEY);
    const query = new URL(payload.url).searchParams;
    expect(Number(query.get('expired'))-Number(query.get('timestamp'))).toBe(60);
  });
  it('signs the unescaped sorted reference, then URL-encodes it', () => {
    const signed = signSoe({appid:'1',secretId:'i',secretKey:'k'},{mode:1,ref:'喇叭',now:100,voiceId:'v'});
    expect(new URL(signed.url).searchParams.get('ref_text')).toBe('{::cmd{F_TDET=true}}喇叭');
  });
  it('caps simultaneous requests with conditional writes', async () => {
    let value: {count:number}|null = null; let etag = 0;
    const store = {
      async getWithMetadata() { return value ? {data:{...value},etag:String(etag)} : null; },
      async setJSON(_key:string, data:{count:number}, opt:{onlyIfNew?:boolean;onlyIfMatch?:string}) {
        if (opt.onlyIfNew ? value !== null : opt.onlyIfMatch !== String(etag)) return {modified:false};
        value=data; etag++; return {modified:true};
      },
    };
    const results = await Promise.all(Array.from({length:10},()=>consumeQuota(store,'day',3)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });
});

it('rejects an oversized streamed body even without Content-Length', async()=>{
  const env={URL:'https://family.test',FAMILY_TOKEN:'test'};
  const request=new Request(env.URL,{method:'POST',headers:{Origin:env.URL,'X-Family-Token':'test'},body:JSON.stringify({mode:8,ref:'a'.repeat(5000)})});
  expect((await createHandler({env,quota:async()=>true})(request)).status).toBe(413);
});
