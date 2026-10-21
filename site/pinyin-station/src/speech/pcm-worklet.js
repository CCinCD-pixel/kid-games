// Outputs silence: microphone input is never monitored through the speakers.
class PinyinCapture extends AudioWorkletProcessor {
  constructor() { super();this.buffer=new Float32Array(2048);this.used=0; }
  process(inputs,outputs) {
    const input=inputs[0]?.[0];
    if(input) for(const x of input) { this.buffer[this.used++]=x;if(this.used===this.buffer.length) { this.port.postMessage(this.buffer);this.used=0; } }
    for(const output of outputs) for(const channel of output) channel.fill(0);
    return true;
  }
}
registerProcessor('pinyin-capture',PinyinCapture);
