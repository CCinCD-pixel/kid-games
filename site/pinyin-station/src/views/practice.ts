import { h } from '@kit/ui';
import { createRng } from '@kit/rng';
import { mount } from '@kit/companion';
import { displayPinyin, parseSyllable } from '../domain/pinyin';
import { nextQuestion, recordAttempt, schedule } from '../domain/learning';
import type { Question } from '../domain/types';
import { Microphone } from '../speech/mic';
import { assess } from '../speech/client';
import { saveRecording, type Recording } from '../speech/recordings';
import { button, glyph, pinyin, type Context } from './common';

const titles={A:'声音来信',B:'小耳朵接信号',C:'把声音接起来',D:'小小播音员',E:'给声音找个家',F:'图画也会说拼音',G:'把一句话接通'};
export class Practice {
  readonly el=h('section',{class:'practice', 'aria-label':'电台节目'});
  private queue:Question[];private index=0;private tries=0;private stopped=false;private generation=0;
  private mic=new Microphone();private abort:AbortController|null=null;
  private recorded:Recording[]=[];private locked=false;
  private syllableIndex=0;private fullParts=0;private sentence:string[]=[];private used=new Set<number>();
  private instruction=h('p',{class:'instruction','aria-live':'polite'});private stage=h('div',{class:'practice-stage'});private feedback=h('div',{class:'feedback','aria-live':'polite'});private actions=h('div',{class:'practice-actions'});
  constructor(private ctx:Context,mode:string) { this.queue=schedule(ctx.save,ctx.bank,mode);this.render(); }
  private get q(){return this.queue[this.index];}
  private get word(){return [...this.ctx.bank.words,...this.ctx.save.customWords].find(w=>w.id===this.q.target)!;}
  private speak(id:string){void this.ctx.say(id);}
  private async stimulus(){if(this.q.kind==='A'){const l=this.ctx.bank.letters.find(l=>l.id===this.q.target);if(l)await this.ctx.syllable(l.callSound);}else if(this.q.kind==='B'||this.q.kind==='C')await this.ctx.syllable(this.q.target);else await this.ctx.word(this.word);}
  private render(){
    if(this.stopped)return;
    this.el.classList.remove('is-resolved','has-recording');this.generation++;this.locked=false;this.syllableIndex=0;this.fullParts=0;this.sentence=[];this.used.clear();
    const phase=this.q.phase==='warmup'?'热身信号':'主节目';
    const steps=h('div',{class:'signal-steps','aria-label':`${phase}，正在接通信号`},this.queue.slice(0,15).map((_,i)=>h('i',{class:i<this.index?'lit':i===this.index?'current':''})));
    const header=h('div',{class:'practice-header'},button('收好电台',()=>this.finish(),'quiet','back'),h('div',null,h('small',null,phase),h('h2',null,titles[this.q.kind])),steps);
    this.instruction=h('p',{class:'instruction','aria-live':'polite'},this.prompt());
    this.stage=h('div',{class:`practice-stage type-${this.q.kind}`});this.feedback=h('div',{class:'feedback','aria-live':'polite'});this.actions=h('div',{class:'practice-actions'});
    const coach=h('div',{class:'coach-mini'});mount(coach,{size:80});
    const controls=h('div',{class:'listening-tools'},button('再听一遍',()=>{void this.ctx.say(`py.${this.q.kind}`).then(()=>['A','B','F'].includes(this.q.kind)?this.stimulus():undefined);},'quiet','replay'),button('给我线索',()=>this.hint(),'quiet','hint'));
    this.el.replaceChildren(header,h('div',{class:'question-head'},coach,h('div',null,this.instruction,controls)),this.stage,this.feedback,this.actions);
    this.draw();
    if(this.q.kind==='A'||this.q.kind==='B') {const gen=this.generation;void this.ctx.say(`py.${this.q.kind}`).then(()=>{if(gen===this.generation&&!this.stopped)void this.stimulus();});}else this.speak(`py.${this.q.kind}`);
  }
  private prompt(){return ({A:'听声音，找到它',B:'哪个声音和来信一样？',C:'点一点，让两个声音相遇',D:'把这条声音送到星港',E:'读一读，哪幅图住在里面？',F:'看图，把它的声音拼出来',G:'点点词卡，接成一句话'})[this.q.kind];}
  private draw(){
    this.stage.replaceChildren();this.actions.replaceChildren();
    if(this.q.kind==='E')this.readPicture();
    else if(this.q.kind==='F')this.spelling();
    else if(this.q.kind==='A'||this.q.kind==='B')this.listening();
    else if(this.q.kind==='C')this.blending();
    else if(this.q.kind==='G')this.ordering();
    else this.reading();
  }
  private readPicture(){
    this.stage.append(pinyin(this.word.display,'question-pinyin'));
    const choices=h('div',{class:'picture-choices'});
    for(const id of this.q.choices){const w=[...this.ctx.bank.words,...this.ctx.save.customWords].find(w=>w.id===id)!;const choice=h('button',{class:'picture-choice',type:'button','aria-label':w.hanzi,onclick:()=>this.answer(id===this.q.target)},this.ctx.picture(w));choices.append(choice);}
    this.stage.append(choices);this.actions.append(button('听听这个词',()=>void this.stimulus(),'secondary','listen'));
  }
  private listening(){
    const signal=button('听来信',()=>void this.stimulus(),'listen','listen');this.stage.append(signal);
    const row=h('div',{class:'syllable-choices'});
    this.q.choices.forEach(choice=>row.append(h('button',{type:'button',class:'pinyin-key pinyin','data-choice':choice,onclick:()=>this.answer(choice===this.q.target,choice)},this.q.kind==='A'?choice.replace('v','ü'):displayPinyin(choice))));this.stage.append(row);
  }
  private spelling(){
    const w=this.word, id=w.syllables[this.syllableIndex], s=parseSyllable(id)!;
    const preferred=this.ctx.save.settings.scaffold, box=this.ctx.save.atoms[this.q.skill]?.box??0;
    const levels=['initial','final','tone','full'] as const;
    const level=levels[Math.max(levels.indexOf(preferred),Math.min(3,box))];
    let component=level==='full'?levels[this.fullParts]:level;
    if(component==='initial'&&!s.initial){component='final';if(level==='full')this.fullParts=1;}
    const correct=component==='initial'?s.initial:component==='final'?s.final:String(s.tone);
    const show=component==='initial'?`＿${displayPinyin(s.final+id.at(-1))}`:component==='final'?`${s.initial}＿`:`${s.initial+s.final} ＿`;
    const picture=h('div',{class:'spelling-picture'},this.ctx.picture(w),button('听听图画',()=>void this.stimulus(),'quiet','listen'));
    const sequence=h('div',{class:'word-slots'},w.syllables.map((sy,i)=>h('span',{class:`grid-slot pinyin ${i===this.syllableIndex?'active':''}`},i<this.syllableIndex?displayPinyin(sy):i===this.syllableIndex?show:'·')));
    const directions=h('p',{class:'part-direction'},component==='initial'?'先找开头的声音':component==='final'?'找到后面的声音':'给它戴上声调小帽子');
    const alternatives=component==='tone'?['1','2','3','4',...(s.tone===0?['0']:[])]:component==='initial'?[correct,...(correct==='b'?['p','d']:correct==='l'?['n','t']:['b','p','d','t','n','l','m','f']).filter(x=>x!==correct).slice(0,level==='full'?7:1)]:[correct,...['a','o','e','i','u','v'].filter(x=>x!==correct).slice(0,level==='full'?5:1)];
    const keys=h('div',{class:'spelling-keys'}), rng=createRng(`${this.ctx.save.sessions}:${this.index}:${this.syllableIndex}:${component}`);
    for(const value of rng.shuffle(alternatives))keys.append(h('button',{type:'button',class:'pinyin-key pinyin','data-piece':value,onclick:()=>{
      if(this.locked)return;
      if(value!==correct){this.answer(false);return;}
      if(level==='full'&&this.fullParts<2){this.fullParts++;this.stage.replaceChildren();this.spelling();return;}
      this.fullParts=0;this.syllableIndex++;
      if(this.syllableIndex===w.syllables.length)this.answer(true);else {this.stage.replaceChildren();this.spelling();}
    }},component==='tone'?['轻声','—','／','∨','＼'][+value]:value.replaceAll('v','ü')));
    this.stage.append(picture,h('div',{class:'spelling-work'},sequence,directions,keys));
    requestAnimationFrame(()=>{const active=sequence.querySelector<HTMLElement>('.active');if(active)sequence.scrollLeft=active.offsetLeft-sequence.offsetLeft-sequence.clientWidth/2+active.clientWidth/2;});
  }
  private blending(){
    const s=parseSyllable(this.q.target)!;
    const merged=pinyin('·','blend-result'), a=button(s.initial||'听',()=>{void this.ctx.syllable(this.ctx.bank.letters.find(l=>l.id===s.initial)?.callSound??this.q.target);a.classList.add('selected');},'secondary'), b=button(displayPinyin(s.final+s.tone),()=>{
      b.classList.add('selected');merged.textContent=displayPinyin(this.q.target);void this.stimulus();
      this.remember(true);this.actions.replaceChildren(button('读给台长听',()=>void this.record(),'primary','mic'),button('先接下一条',()=>this.advance(),'quiet','next'));
    },'secondary');a.classList.add('pinyin-key','pinyin');b.classList.add('pinyin-key','pinyin');
    this.stage.append(h('div',{class:'blend-parts'},a,h('span',{class:'blend-plus'},'+'),b),merged,this.lamps());
  }
  private lamps(){return h('div',{class:'three-lamps'},['声母','韵母','声调'].map(label=>h('div',{class:'lamp'},h('i'),h('span',null,label))));}
  private reading(){
    this.stage.append(h('div',{class:'reading-picture'},this.ctx.picture(this.word)),pinyin(this.word.display,'question-pinyin'),this.lamps());
    this.actions.append(button('先听台长读',()=>void this.stimulus(),'secondary','listen'),button('读给台长听',()=>void this.record(),'primary','mic'),button('这次先跟读',()=>this.follow(),'quiet','next'));
  }
  private ordering(){
    const chunks=this.word.chunks??[], result=h('div',{class:'sentence-track','aria-label':'已经接通的词卡'},...this.sentence.map(s=>pinyin(s.split(' ').map(displayPinyin).join(' '),'sentence-chunk')));
    const row=h('div',{class:'sentence-choices'});
    this.q.choices.forEach((s,i)=>{const key=h('button',{type:'button',class:'pinyin-key pinyin',disabled:this.used.has(i),onclick:()=>{if(this.locked)return;this.used.add(i);this.sentence.push(s);if(this.sentence.length===chunks.length)this.answer(this.sentence.every((x,j)=>x===chunks[j]));else{this.stage.replaceChildren();this.ordering();}}},s.split(' ').map(displayPinyin).join(' '));row.append(key);});
    this.stage.append(h('div',{class:'sentence-picture'},this.ctx.picture(this.word)),result,row);
    this.actions.replaceChildren(button('重新接一接',()=>{this.sentence=[];this.used.clear();this.draw();},'quiet','undo'));
  }
  private remember(correct:boolean,confusion?:string,judge:'deterministic'|'self'='deterministic'){
    recordAttempt(this.ctx.save,{id:`${this.ctx.save.sessions}:${this.index}:${this.tries}:${judge}`,skill:this.q.skill,kind:this.q.kind,correct,judge,session:this.ctx.save.sessions,at:Date.now(),confusion});this.ctx.persist();
  }
  private answer(correct:boolean,choice?:string){
    if(this.locked)return;
    const confusion=this.q.kind==='B'?this.q.skill.split(':')[1]:this.q.kind==='A'&&choice?[this.q.target,choice].sort().join('|'):undefined;
    this.remember(correct,correct?undefined:confusion);
    if(correct){
      this.locked=true;this.el.classList.add('is-resolved');
      const choices={A:[2,13],B:[5],C:[3],D:[19],E:[0,16],F:[7,9,12,17],G:[18,7]}[this.q.kind];
      const praiseId=this.tries>0?8:choices[this.index%choices.length];
      this.feedback.replaceChildren(glyph('star'),h('span',null,this.ctx.bank.praise[praiseId]));
      this.feedback.classList.add('is-lit');this.speak(`py.praise.${praiseId}`);
      this.actions.replaceChildren(button('接下一条',()=>this.advance(),'primary','next'));
    }
    else {
      this.tries++;const next=nextQuestion(this.queue,this.index,this.tries,false);this.queue=next.queue;
      if(next.action==='demonstrate'){this.locked=true;this.feedback.replaceChildren(h('span',null,'一起看示范，再接下一条信号'));this.demonstrate();this.speak('py.demo');this.actions.replaceChildren(button('接下一条',()=>this.advance(),'primary','next'));}
      else {this.hint();if(this.q.kind==='G'){this.sentence=[];this.used.clear();this.draw();}}
    }
  }
  private hint(){
    const c=this.ctx.bank.confusions.find(c=>this.q.skill.includes(c.pair.join('|')));
    this.feedback.replaceChildren(glyph('hint'),h('span',null,c?.tip??(this.tries>=2?'把声音拆小一点，再接起来':'先听一听，找一个小线索')));
    this.speak(this.tries>=2?'py.hint2':'py.hint1');
    if(this.tries>=2)this.demonstrate(false);
    else void this.stimulus();
  }
  private demonstrate(full=true){
    if(this.q.kind==='A'||this.q.kind==='B'){const answer=this.stage.querySelector(`[data-choice="${this.q.target}"]`);answer?.classList.add('clue');}
    else if(this.q.kind==='E'){const name=this.word.hanzi;[...this.stage.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===name)?.classList.add('clue');}
    else if(this.q.kind==='F'){const w=this.word;this.feedback.append(pinyin(full?w.display:displayPinyin(w.syllables[this.syllableIndex]),'hint-pinyin'));}
    else if(this.q.kind==='G')this.feedback.append(pinyin(this.word.display,'hint-pinyin'));
    void this.stimulus();
  }
  private follow(){this.feedback.replaceChildren(h('span',null,'跟台长读一遍，声音也能慢慢接通'));this.speak('py.follow');this.actions.replaceChildren(button('我读过啦',()=>{this.remember(true,undefined,'self');this.advance();},'primary','next'),button('再听一遍',()=>void this.stimulus(),'secondary','listen'));}
  private async record(){
    if(this.locked)return;
    this.locked=true;this.ctx.stopAudio();this.abort?.abort();this.abort=new AbortController();const gen=this.generation;
    const meter=h('div',{class:'voice-meter','aria-label':'正在收听'},Array.from({length:7},()=>h('i')));
    this.feedback.replaceChildren(meter,h('span',null,'台长正在收听'));this.actions.replaceChildren(button('我读好了',()=>this.mic.stop(),'primary','mic'));
    try {
      const capture=await this.mic.record(rms=>meter.style.setProperty('--level',String(Math.min(1,rms*12))));
      if(this.stopped||gen!==this.generation)return;
      const record:Recording={id:crypto.randomUUID(),blob:capture.blob,at:Date.now(),wordId:this.q.target,skill:this.q.skill.replace(/:blend$/,':say'),session:this.ctx.save.sessions,kind:this.q.kind};
      const syl=this.q.kind==='C'?this.q.target:null;
      const neutral=!syl&&this.word.syllables.some(s=>s.endsWith('0'));
      const ref=syl??(neutral?this.word.hanzi:this.word.syllables.join(' '));
      record.ref=ref;record.mode=neutral?1:8;
      if(capture.heard && this.ctx.save.settings.ai && navigator.onLine){
        try {record.verdict=await assess(capture.pcm,neutral?1:8,ref,sessionStorage.getItem('pinyin-family-token')??'',this.ctx.save.settings.strictness,this.abort.signal);} catch{/* Network or service errors use local follow-reading. */}
      }
      if(this.stopped||gen!==this.generation)return;
      this.recorded.push(record);this.el.classList.add('has-recording');let stored=true;
      try{await saveRecording(record);}catch{stored=false;}
      this.locked=false;
      if(record.verdict){
        const dims=record.verdict.dims;const lamps=this.el.querySelectorAll('.lamp');
        (['initial','final','tone'] as const).forEach((dim,i)=>{const d=dims[dim];if(lamps[i]){lamps[i].classList.toggle('lit',d?.ok===true);lamps[i].setAttribute('aria-label',`${['声母','韵母','声调'][i]}：${d?(d.ok?'声音接通':'一起再听听'):'先听一听'}`);}});
      }
      this.feedback.replaceChildren(h('span',null,!capture.heard?'台长还没听清，可以再试试':record.verdict?.level===1?'声音收到啦，一起听听小变化':stored?'声音收到啦，听听自己的节目':'声音收到啦，这次可以现场回听'));
      this.actions.replaceChildren(button('听我的声音',()=>void this.ctx.replay(record.blob),'secondary','replay'),button('听台长读',()=>void this.stimulus(),'secondary','listen'),button('接下一条',()=>{this.remember(true,undefined,'self');this.advance();},'primary','next'),button('我再读一遍',()=>void this.record(),'quiet','mic'));
    } catch {
      if(this.stopped||gen!==this.generation)return;this.locked=false;this.feedback.replaceChildren(h('span',null,'可以先跟着台长读，准备好了再开麦'));this.follow();
    }
  }
  private advance(){this.abort?.abort();this.mic.stop();this.ctx.stopAudio();this.index++;this.tries=0;if(this.index>=this.queue.length)this.finish();else this.render();}
  private finish(){this.stop();this.ctx.finish(this.recorded);}
  stop(){this.stopped=true;this.generation++;this.abort?.abort();this.mic.dispose();this.ctx.stopAudio();}
}
