// Local-only connectivity probe. Never prints credentials, signatures or WebSocket URLs.
import fs from 'node:fs';
import WebSocket from 'ws';
import { signSoe } from '../../../netlify/lib/soe-core.mjs';
import { localEnv } from './local-credentials.mjs';
export { localEnv } from './local-credentials.mjs';
export async function probe(credentials, pcm, mode, ref, coefficient = 1) {
  const signed = signSoe(credentials,{mode,ref,coefficient});
  const started = Date.now();
  return new Promise(resolve => {
    const ws = new WebSocket(signed.url); let sent = false, result = null, done = false;
    const finish = data => { if(done)return;done=true;clearTimeout(timer);ws.close();resolve({...data, latencyMs:Date.now()-started}); };
    const timer=setTimeout(()=>finish({ok:false,error:'timeout'}),15000);
    ws.on('message', bytes => {
      let m;try { m=JSON.parse(bytes.toString()); } catch { return finish({ok:false,error:'invalid_response'}); }
      if(m.code) return finish({ok:false,code:m.code,message:String(m.message).slice(0,300)});
      if(m.result) result=m.result;
      if(m.final===1) return finish({ok:true,result});
      if(!sent){ sent=true;ws.send(pcm);ws.send(JSON.stringify({type:'end'})); }
    });
    ws.on('error',()=>finish({ok:false,error:'connection_error'}));
    ws.on('close',()=>{ if(!done)finish({ok:!!result,result,error:result?undefined:'closed'}); });
  });
}
if(process.argv[1]?.endsWith('/verify-soe.mjs')) {
  const [pcmPath, ref = 'ba1', mode = '8'] = process.argv.slice(2);
  if(!pcmPath) throw new Error('Usage: node site/pinyin-station/tools/verify-soe.mjs <16k mono s16le.pcm> [ref] [mode]');
  const result = await probe(localEnv(),fs.readFileSync(pcmPath),Number(mode),ref);
  console.log(JSON.stringify(result,null,2));
}
