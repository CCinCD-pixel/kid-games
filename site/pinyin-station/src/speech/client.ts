import { normalize, type Verdict } from './normalize';
import type { AssessmentPlan } from './reference';
export async function assess(
  pcm: Int16Array,
  mode: 8 | 1 | 6,
  ref: string,
  token: string,
  strictness: 'gentle' | 'balanced' | 'precise',
  signal: AbortSignal,
  assessment: AssessmentPlan = { mode, ref },
): Promise<Verdict> {
  const request = await fetch('/.netlify/functions/soe-sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Family-Token': token },
    body: JSON.stringify({ mode, ref, pronunciation: assessment.pronunciation }),
    cache: 'no-store',
    signal,
  });
  if (!request.ok) throw new Error(`service_${request.status}`);
  const { url } = (await request.json()) as { url: string };
  if (!url.startsWith('wss://soe.cloud.tencent.com/soe/api/')) throw new Error('invalid_endpoint');
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let result: unknown = null,
      sent = false,
      done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      socket.close();
      if (error) reject(error);
      else resolve(normalize(result, performance.now() - start, strictness, assessment));
    };
    const abort = () => finish(new Error('cancelled'));
    const timer = setTimeout(() => finish(new Error('timeout')), 12000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    socket.onmessage = (event) => {
      try {
        const response = JSON.parse(String(event.data));
        if (response.code) {
          finish(new Error('engine_unavailable'));
          return;
        }
        if (response.result)
          result = typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
        if (response.final === 1) {
          finish();
          return;
        }
        if (!sent) {
          sent = true;
          socket.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
          socket.send(JSON.stringify({ type: 'end' }));
        }
      } catch {
        finish(new Error('invalid_response'));
      }
    };
    socket.onerror = () => finish(new Error('connection_error'));
    socket.onclose = () => {
      if (!done) {
        result = null;
        finish();
      }
    };
  });
}
