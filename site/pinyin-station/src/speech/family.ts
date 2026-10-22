const key = 'pinyin-family-token';
export function familyToken(): string {
  const saved = localStorage.getItem(key);
  if (saved) return saved;
  const previous = sessionStorage.getItem(key) ?? '';
  if (previous) { localStorage.setItem(key, previous); sessionStorage.removeItem(key); }
  return previous;
}
export function saveFamilyToken(value: string) { localStorage.setItem(key, value.trim()); sessionStorage.removeItem(key); }
export async function checkConnection(token: string): Promise<string> {
  if (!token) return '请先填写家庭口令';
  try {
    const response = await fetch('/.netlify/functions/soe-sign', { method:'POST', headers:{'Content-Type':'application/json','X-Family-Token':token}, body:JSON.stringify({mode:1,ref:'八',pronunciation:['ba1']}), cache:'no-store', signal:AbortSignal.timeout(6000) });
    return response.ok ? '签名服务可用。腾讯最终连通性需录音后确认。' : ({401:'401：家庭口令不匹配',403:'403：此访问地址未获允许',429:'429：今天的签名次数已用完',503:'503：签名服务缺少配置'}[response.status] ?? `${response.status}：签名服务暂不可用`);
  } catch { return '无法连接签名服务，请检查网络和本机服务'; }
}
