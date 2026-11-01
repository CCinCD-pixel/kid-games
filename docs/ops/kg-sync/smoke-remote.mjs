#!/usr/bin/env node
// smoke-remote.mjs -- 部署后的远端冒烟(S14): 用一个"测试家庭"走完 开通 -> 写存档 -> 读 -> 记账 -> 读账 -> 配对码 -> 删除 -> 确认已删。
// 从爸爸网络内的另一台设备运行(关闭 VPN/代理):
//     KG_ENROLL_CODE='<开通码>' node smoke-remote.mjs https://kg.ccincd.shop:8443
// 只依赖 Node 18+ 的内置 fetch/crypto。开通码从环境变量读(不要写在命令行里, 以免进 shell 历史); 它和任何密钥都不会被打印。
// 测试家庭用随机生成的钥匙材料(服务器本来就看不懂内容), 结束时一定删除; 如果中途失败, 脚本仍会尝试删除。
import crypto from 'node:crypto';

const base = (process.argv[2] || process.env.KG_BASE || '').replace(/\/+$/, '');
const code = process.env.KG_ENROLL_CODE || '';
if (!/^https?:\/\//.test(base) || !code) {
  console.error('用法: KG_ENROLL_CODE=<开通码> node smoke-remote.mjs https://域名:8443');
  process.exit(2);
}
const b64u = (b) => Buffer.from(b).toString('base64url');
const fid = b64u(crypto.randomBytes(16)), auth = b64u(crypto.randomBytes(32)), del = b64u(crypto.randomBytes(32));
const tok = `${fid}.${auth}`;
const env = () => b64u(Buffer.concat([Buffer.from([0]), crypto.randomBytes(60)])); // 形状合法的"密封信封"(第一个字节 0, 随后 60 字节随机)
let failed = 0;
let enrolled = false;
const step = (name, ok, info = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${info ? '  ' + info : ''}`);
};
async function call(method, path, { body, headers = {}, authed = true } = {}) {
  const t0 = performance.now();
  try {
    const r = await fetch(base + path, {
      method,
      headers: { ...(authed ? { authorization: 'Bearer ' + tok } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    let j = null;
    try { j = await r.json(); } catch { /* 204 / 304 */ }
    return { s: r.status, j, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { s: 0, j: null, ms: Math.round(performance.now() - t0), err: String(e.cause?.code || e.message).slice(0, 80) };
  }
}
try {
  const h = await call('GET', '/healthz', { authed: false });
  step('GET /healthz', h.s === 200 && h.j?.ok === true, `${h.s} ${h.ms} ms backupAgeH=${h.j?.backupAgeH ?? 'null'}${h.err ? ' ' + h.err : ''}`);
  if (h.s !== 200) throw new Error('服务不通, 后面的步骤不做了');
  const en = await call('POST', '/v1/enroll', { authed: false, body: { fid, auth, del, code } });
  enrolled = en.s === 201;
  step('POST /v1/enroll (测试家庭)', en.s === 201, `${en.s}${en.s === 403 ? ' (开通码不对或已过期)' : en.s === 507 ? ' (家庭数已满或磁盘守卫)' : en.s === 429 ? ' (开通次数限制, 一小时后再试)' : ''}`);
  if (!enrolled) throw new Error('开通失败, 后面的步骤不做了');
  const e1 = env();
  const put = await call('PUT', '/v1/stores/smoke-test', { body: { v: 1, env: e1 }, headers: { 'if-match': '"0"' } });
  step('PUT /v1/stores/smoke-test', put.s === 200 && put.j?.rev === 1, `${put.s} ${put.ms} ms`);
  const get = await call('GET', '/v1/stores/smoke-test');
  step('GET /v1/stores/smoke-test 与写入一致', get.s === 200 && get.j?.env === e1, `${get.s} ${get.ms} ms`);
  const led = await call('POST', '/v1/ledger', { body: { events: [{ id: 'smoke.test.' + Date.now().toString(36), env: env() }] } });
  step('POST /v1/ledger', led.s === 200 && led.j?.accepted === 1, `${led.s}`);
  const lg = await call('GET', '/v1/ledger?after=0');
  step('GET /v1/ledger', lg.s === 200 && lg.j?.events?.length === 1, `${lg.s}`);
  const st = await call('GET', '/v1/state');
  step('GET /v1/state', st.s === 200 && !!st.j?.epoch && st.j?.caps?.pause === false, `${st.s} caps.pause=${st.j?.caps?.pause}`);
  const pr = await call('POST', '/v1/pair', { body: {} });
  step('POST /v1/pair (只检查拿到 6 位配对码)', pr.s === 200 && /^\d{6}$/.test(pr.j?.code ?? ''), `${pr.s}`);
  const bad = await call('DELETE', '/v1/family', { headers: { 'x-kg-delete-token': b64u(crypto.randomBytes(32)) } });
  step('DELETE 用错误的删除令牌被拒绝(403)', bad.s === 403, `${bad.s}`);
} catch (e) {
  step(String(e.message), false);
} finally {
  if (enrolled) {
    const d = await call('DELETE', '/v1/family', { headers: { 'x-kg-delete-token': del } });
    step('DELETE /v1/family (删除测试家庭)', d.s === 204, `${d.s}`);
    const gone = await call('GET', '/v1/state');
    step('删除后该钥匙返回 401', gone.s === 401, `${gone.s}`);
  }
}
console.log(failed ? `\n冒烟失败: ${failed} 项不正常` : '\n冒烟通过');
process.exit(failed ? 1 : 0);
