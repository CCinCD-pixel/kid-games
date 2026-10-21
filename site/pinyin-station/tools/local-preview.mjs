// One foreground server for reviewing the built game. Ctrl-C shuts everything down.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../../../netlify/lib/soe-core.mjs';
import { localEnv } from './local-credentials.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)), dist=path.join(root,'dist');
if(!fs.existsSync(path.join(dist,'pinyin-station/index.html')))throw new Error('请先运行 npm run build');
const port=Number(process.env.PINYIN_PORT||4188), base=`http://localhost:${port}`;
const privateDir=path.join(os.homedir(),'kid-games-work','pinyin-local');fs.mkdirSync(privateDir,{recursive:true,mode:0o700});
const tokenFile=path.join(privateDir,'family-token.txt');
if(!fs.existsSync(tokenFile))fs.writeFileSync(tokenFile,crypto.randomBytes(24).toString('base64url'),{mode:0o600});
const token=fs.readFileSync(tokenFile,'utf8').trim();let credentials={};
try{credentials=localEnv();}catch{/* A fully offline practice server needs no Tencent configuration. */}
const quotaFile=path.join(privateDir,'quota.json');let counts={};try{counts=JSON.parse(fs.readFileSync(quotaFile,'utf8'));}catch{}
const handler=createHandler({env:{URL:process.env.PINYIN_ORIGIN||base,FAMILY_TOKEN:token,TENCENT_SOE_APPID:credentials.appid,TENCENT_SOE_SECRET_ID:credentials.secretId,TENCENT_SOE_SECRET_KEY:credentials.secretKey},quota:async day=>{if((counts[day]??0)>=600)return false;counts[day]=(counts[day]??0)+1;fs.writeFileSync(quotaFile,JSON.stringify(counts),{mode:0o600});return true;}});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.m4a':'audio/mp4','.mp3':'audio/mpeg','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,base);
  if(url.pathname==='/.netlify/functions/soe-sign'){
    const chunks=[];let size=0;try{for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end();return;}chunks.push(chunk);}}catch{if(!res.headersSent)res.writeHead(400);res.end();return;}
    try{const response=await handler(new Request(url,{method:req.method,headers:req.headers,body:['GET','HEAD','OPTIONS'].includes(req.method)?undefined:Buffer.concat(chunks)}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch{res.writeHead(503,{'Cache-Control':'no-store'});res.end();}return;
  }
  let filename;try{filename=path.resolve(dist,'.'+decodeURIComponent(url.pathname));}catch{res.writeHead(400);res.end();return;}
  if(!filename.startsWith(dist+path.sep)&&filename!==dist){res.writeHead(403);res.end();return;}
  if(fs.existsSync(filename)&&fs.statSync(filename).isDirectory())filename=path.join(filename,'index.html');
  if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end();return;}
  const size=fs.statSync(filename).size,range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');
  const headers={'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':filename.endsWith('sw.js')?'no-store':'no-cache','Accept-Ranges':'bytes'};
  if(range){const start=Number(range[1]),end=Math.min(Number(range[2]||size-1),size-1);if(start>end||start>=size){res.writeHead(416);res.end();return;}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(filename,{start,end}).pipe(res);}
  else{res.writeHead(200,{...headers,'Content-Length':size});if(req.method==='HEAD')res.end();else fs.createReadStream(filename).pipe(res);}
});
server.listen(port,'127.0.0.1',()=>{console.log(`拼音电台：${base}/pinyin-station/?mute\n默认静音。家庭口令保存在本机文件：${tokenFile}\nCtrl-C 关闭预览；没有推送、发布或修改系统音量。`);});
const shutdown=()=>server.close(()=>process.exit(0));process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
