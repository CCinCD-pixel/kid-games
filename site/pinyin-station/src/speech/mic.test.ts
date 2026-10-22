import { afterEach, expect, it, vi } from 'vitest';
const kit = vi.hoisted(()=>({context:null as any, release:vi.fn()}));
vi.mock('@kit/audio',()=>({getAudioContext:()=>kit.context,getBus:()=>({}),claimRecordingSession:()=>kit.release}));
import { Microphone } from './mic';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();kit.context=null;kit.release.mockClear();});
it('stops a stream which arrives after the user has cancelled microphone permission', async()=>{
  const stop = vi.fn();let resolve!: (x:any)=>void;
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});
  const mic=new Microphone();const result=mic.record(()=>{});mic.dispose();
  resolve({getTracks:()=>[{stop,readyState:'live'}]});
  await expect(result).rejects.toThrow('cancelled');
  expect(stop).toHaveBeenCalledOnce();
});
it('stops microphone tracks when audio cannot start', async()=>{
  const stop=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop,readyState:'live'}]})}});
  await expect(new Microphone().record(()=>{})).rejects.toThrow('unsupported');
  expect(stop).toHaveBeenCalledOnce();
});
it('bounds a hung iOS audio resume and releases microphone tracks', async()=>{
  vi.useFakeTimers();const stop=vi.fn();
  vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop,readyState:'live'}]})}});
  kit.context={audioWorklet:{},resume:()=>new Promise(()=>{})};
  const result=new Microphone().record(()=>{});const rejected=expect(result).rejects.toThrow('audio_timeout');
  await vi.advanceTimersByTimeAsync(4500);await rejected;expect(stop).toHaveBeenCalledOnce();
});
