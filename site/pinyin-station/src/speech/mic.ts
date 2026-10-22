import { claimRecordingSession, getAudioContext, getBus } from '@kit/audio';
import { Resampler, Vad, wav } from './pcm';
import workletUrl from './pcm-worklet.js?url&no-inline';
async function deadline<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([task, new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),ms);})]); }
  finally { clearTimeout(timer); }
}
export class Microphone {
  private stopCurrent: (()=>void) | null = null;
  private cancelStart: (()=>void) | null = null;
  private loading: Promise<void> | null = null;
  private active = false;
  private serial = 0;
  async record(onLevel:(rms:number)=>void):Promise<{pcm:Int16Array;blob:Blob;heard:boolean}> {
    if (this.active) throw new Error('busy');
    this.active = true;
    const serial = ++this.serial, releaseSession = claimRecordingSession();
    let stream: MediaStream | null = null;
    let source: MediaStreamAudioSourceNode | null = null, worklet: AudioWorkletNode | null = null, gain: GainNode | null = null;
    const cancelled = new Promise<never>((_,reject)=>{this.cancelStart=()=>reject(new Error('cancelled'));});
    try {
    const pending = navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}}).then(value=>{
      if (serial !== this.serial) { value.getTracks().forEach(t=>t.stop()); throw new Error('cancelled'); }
      stream=value;return value;
    });
      await deadline(Promise.race([pending,cancelled]),15000,'permission_timeout');
      if (!stream || !(stream as MediaStream).getTracks().every(t=>t.readyState === 'live' || t.readyState === undefined)) throw new Error('microphone_ended');
      const ctx=getAudioContext();
      if (!ctx?.audioWorklet) throw new Error('unsupported');
      await deadline(Promise.race([ctx.resume(),cancelled]),4000,'audio_timeout');
      this.loading ??= ctx.audioWorklet.addModule(workletUrl).catch(error=>{this.loading=null;throw error;});
      await deadline(Promise.race([this.loading,cancelled]),4000,'audio_timeout');
      if (serial !== this.serial) throw new Error('cancelled');
      source=ctx.createMediaStreamSource(stream);worklet=new AudioWorkletNode(ctx,'pinyin-capture');gain=ctx.createGain();
      gain.gain.value=0;
      const bus=getBus('voice');if(!bus)throw new Error('unsupported');
      source.connect(worklet);worklet.connect(gain);gain.connect(bus);
      const port=worklet.port;
      this.cancelStart=null;
      return await new Promise(resolve=>{
        const resample=new Resampler(ctx.sampleRate),vad=new Vad(),chunks:Int16Array[]=[];
        let done=false;
        const finish=()=>{
          if(done)return;done=true;clearTimeout(timer);port.onmessage=null;this.stopCurrent=null;
          const pcm=new Int16Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;
          for(const chunk of chunks){pcm.set(chunk,at);at+=chunk.length;}
          resolve({pcm,blob:new Blob([wav(pcm)],{type:'audio/wav'}),heard:vad.heard});
        };
        this.stopCurrent=finish;const timer=setTimeout(finish,8500);
        port.onmessage=event=>{const pcm=resample.push(event.data as Float32Array);chunks.push(pcm);const state=vad.push(pcm);onLevel(state.rms);if(state.done)finish();};
      });
    } finally {
      // Invalidates a late permission result, including after timeout or cancellation.
      this.serial++;
      this.cancelStart=null;this.stopCurrent=null;this.active=false;
      if(worklet)worklet.port.onmessage=null;
      source?.disconnect();worklet?.disconnect();gain?.disconnect();
      (stream as MediaStream | null)?.getTracks().forEach(t=>t.stop());
      releaseSession();
    }
  }
  stop(){if(this.stopCurrent)this.stopCurrent();else this.cancelStart?.();}
  dispose(){this.serial++;this.stop();}
}
