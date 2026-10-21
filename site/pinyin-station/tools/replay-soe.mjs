// Explicit local command: re-submit exported recordings only to Tencent, never play them.
import fs from 'node:fs';
import { localEnv, probe } from './verify-soe.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node site/pinyin-station/tools/replay-soe.mjs <private-export.json> <private-results.json>');
const data=JSON.parse(fs.readFileSync(input,'utf8'));
if(data.version!==1||!Array.isArray(data.rows)||data.rows.length>200)throw new Error('Invalid private export');
const credentials=localEnv(),results=[];
for(const row of data.rows){
  const wav=Buffer.from(row.wavBase64,'base64');
  if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE'||wav.readUInt32LE(24)!==16000||wav.readUInt16LE(22)!==1||wav.readUInt16LE(34)!==16||wav.toString('ascii',36,40)!=='data')throw new Error('Expected game-generated 16k mono PCM WAV');
  const mode=row.mode,ref=row.ref;
  if(![1,8].includes(mode)||typeof ref!=='string')throw new Error('Export lacks assessment reference');
  const result=await probe(credentials,wav.subarray(44),mode,ref,1);
  results.push({id:row.id,mode,ref,result});
  fs.writeFileSync(output,JSON.stringify({version:1,results},null,2),{mode:0o600});
  console.log(`processed ${results.length}/${data.rows.length}; ${result.ok?'received':'unavailable'}`);
  if(!result.ok)break;
}
