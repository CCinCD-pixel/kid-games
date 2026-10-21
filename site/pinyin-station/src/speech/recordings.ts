import type { Kind } from '../domain/types';
import type { Verdict, Dim } from './normalize';
export interface Recording { id:string;blob:Blob;at:number;wordId:string;skill:string;session:number;kind:Kind;mode?:8|1;ref?:string;lab?:boolean;expected?:'correct'|Dim;verdict?:Verdict;parent?:'correct'|Dim }
let connection:Promise<IDBDatabase>|null=null;
function db():Promise<IDBDatabase> {
  return connection??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('kg-pinyin-station',1);
    request.onupgradeneeded=()=>{const database=request.result;const store=database.createObjectStore('recordings',{keyPath:'id'});store.createIndex('at','at');database.createObjectStore('pictures');};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>{connection=null;reject(new Error('local_storage_unavailable'));};
  });
}
export async function saveRecording(recording:Recording) {
  const database=await db();
  // ArrayBuffer avoids Safari/WebKit Blob persistence failures in some storage contexts.
  const {blob,...metadata}=recording;
  const stored={...metadata,audio:await blob.arrayBuffer(),mime:blob.type};
  await new Promise<void>((resolve,reject)=>{
    const tx=database.transaction('recordings','readwrite'), store=tx.objectStore('recordings');store.put(stored);
    const count=store.count();count.onsuccess=()=>{let extra=count.result-200;if(extra<=0)return;const cursor=store.index('at').openCursor();cursor.onsuccess=()=>{if(extra--<=0 || !cursor.result)return;cursor.result.delete();cursor.result.continue();};};
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error(`local_storage_full:${tx.error?.name??'unknown'}`));
  });
}
export async function recordings():Promise<Recording[]> {
  const database=await db();
  return new Promise((resolve,reject)=>{const request=database.transaction('recordings').objectStore('recordings').getAll();request.onsuccess=()=>resolve(request.result.map((value:Recording&{audio?:ArrayBuffer;mime?:string})=>{
    const {audio,mime,...record}=value;
    return{...record,blob:audio?new Blob([audio],{type:mime||'audio/wav'}):record.blob};
  }).sort((a:Recording,b:Recording)=>b.at-a.at));request.onerror=()=>reject(new Error('local_storage_unavailable'));});
}
export async function savePicture(id:string,blob:Blob) {
  const database=await db(),data=await blob.arrayBuffer();return new Promise<void>((resolve,reject)=>{const tx=database.transaction('pictures','readwrite');tx.objectStore('pictures').put({data,mime:blob.type},id);tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(new Error(`local_storage_full:${tx.error?.name??'unknown'}`));});
}
export async function getPicture(id:string):Promise<Blob|undefined> {
  const database=await db();return new Promise((resolve,reject)=>{const r=database.transaction('pictures').objectStore('pictures').get(id);r.onsuccess=()=>resolve(r.result?.data?new Blob([r.result.data],{type:r.result.mime}):r.result);r.onerror=()=>reject(new Error('local_storage_unavailable'));});
}
