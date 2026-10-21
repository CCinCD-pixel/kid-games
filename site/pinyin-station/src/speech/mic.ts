import { getAudioContext, getBus } from '@kit/audio';
import { Resampler, Vad, wav } from './pcm';
import workletUrl from './pcm-worklet.js?url&no-inline';
type AudioNavigator = Navigator & { audioSession?:{type:string} };
export class Microphone {
  private stream:MediaStream|null=null;
  private stopCurrent:(()=>void)|null=null;
  private loading:Promise<void>|null=null;
  private disposed=false;
  async record(onLevel:(rms:number)=>void):Promise<{pcm:Int16Array;blob:Blob;heard:boolean}> {
    if(this.stopCurrent) throw new Error('busy');
    this.disposed=false;
    const nav=navigator as AudioNavigator, previous=nav.audioSession?.type ?? 'playback';
    if(nav.audioSession)nav.audioSession.type='play-and-record';
    try {
      if(!this.stream) this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      if(this.disposed){this.dispose();throw new Error('cancelled');}
      const ctx=getAudioContext();if(!ctx || !ctx.audioWorklet)throw new Error('unsupported');
      await ctx.resume();
      // Safari rejects data: worklet modules; emit a same-origin file even though it is tiny.
      this.loading??=ctx.audioWorklet.addModule(workletUrl);await this.loading;
      if(this.disposed)throw new Error('cancelled');
      const source=ctx.createMediaStreamSource(this.stream), worklet=new AudioWorkletNode(ctx,'pinyin-capture'), gain=ctx.createGain();gain.gain.value=0;
      const bus=getBus('voice');if(!bus)throw new Error('unsupported');
      source.connect(worklet);worklet.connect(gain);gain.connect(bus);
      return await new Promise(resolve=>{
        const resample=new Resampler(ctx.sampleRate), vad=new Vad(), chunks:Int16Array[]=[];let done=false;
        const finish=()=>{if(done)return;done=true;clearTimeout(timer);source.disconnect();worklet.disconnect();gain.disconnect();worklet.port.onmessage=null;this.stopCurrent=null;const pcm=new Int16Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){pcm.set(c,at);at+=c.length;}resolve({pcm,blob:new Blob([wav(pcm)],{type:'audio/wav'}),heard:vad.heard});};
        this.stopCurrent=finish;
        const timer=setTimeout(finish,8500);
        worklet.port.onmessage=event=>{const pcm=resample.push(event.data as Float32Array);chunks.push(pcm);const {rms,done}=vad.push(pcm);onLevel(rms);if(done)finish();};
      });
    } finally {if(nav.audioSession)nav.audioSession.type=previous;}
  }
  stop(){this.stopCurrent?.();}
  dispose(){this.disposed=true;this.stop();this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
}
