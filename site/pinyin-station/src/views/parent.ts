import { h } from '@kit/ui';
import { checkPin, hasPin, isValidPin, setPin } from '@kit/settings';
import { pinyin as annotate } from 'pinyin-pro';
import { parseSyllable, displayPinyin } from '../domain/pinyin';
import { mastery, recordAttempt } from '../domain/learning';
import { recordings, savePicture, saveRecording } from '../speech/recordings';
import { button, type Context } from './common';
import { labPanel } from './lab';
import type { Word } from '../domain/types';

export function parentView(ctx:Context):HTMLElement {
  const host=h('section',{class:'parent-panel','aria-label':'电台家长页'});
  const gate=()=>{
    const pin=h('input',{type:'password',inputmode:'numeric',autocomplete:'off',maxlength:6,'aria-label':hasPin()?'家长 PIN':'设置家长 PIN'}), status=h('p',{'aria-live':'polite'});
    let first='';
    const form=h('form',{class:'pin-gate',onsubmit:(event:Event)=>{
      event.preventDefault();const value=pin.value;pin.value='';
      if(hasPin()){if(checkPin(value)){sessionStorage.setItem('kg:parent:unlocked',String(Date.now()));show();}else status.textContent='PIN 不匹配，请再试一次';}
      else if(!isValidPin(value))status.textContent='请设置 4–6 位数字';
      else if(!first){first=value;status.textContent='请再输入一次确认';}
      else if(first===value){setPin(value);sessionStorage.setItem('kg:parent:unlocked',String(Date.now()));show();}
      else {first='';status.textContent='两次输入不同，请重新设置';}
    }},h('h2',null,hasPin()?'家长来接班':'设置家长 PIN'),h('p',null,'与星港家长中心共用 PIN'),pin,status,h('button',{class:'station-btn station-btn--primary',type:'submit'},'进入家长页'),button('回到电台',ctx.home,'quiet'));
    host.replaceChildren(form);
  };
  function field(label:string,control:HTMLElement){return h('label',{class:'parent-field'},h('span',null,label),control);}
  function show(){
    const s=ctx.save;
    const header=h('div',{class:'parent-heading'},h('div',null,h('small',null,'仅家长可见'),h('h2',null,'电台值班室')),button('回到电台',ctx.home,'secondary','back'));
    const lesson=h('select',{'aria-label':'当前课'},ctx.bank.lessons.filter(l=>l.unit===2).map(l=>h('option',{value:l.id,selected:l.id===s.settings.lesson},l.title)));
    lesson.onchange=()=>{s.settings.lesson=Number(lesson.value);ctx.persist();};
    const scaffold=h('select',{'aria-label':'拼搭帮助'},[['initial','先找声母'],['final','再找韵母'],['tone','再选声调'],['full','自己拼完整音节']].map(([value,label])=>h('option',{value,selected:value===s.settings.scaffold},label)));
    scaffold.onchange=()=>{s.settings.scaffold=scaffold.value as typeof s.settings.scaffold;ctx.persist();};
    const ai=h('input',{type:'checkbox',checked:s.settings.ai,'aria-label':'允许腾讯评测'});
    ai.onchange=()=>{s.settings.ai=ai.checked;ctx.persist();};
    const token=h('input',{type:'password',autocomplete:'off','aria-label':'家庭口令',placeholder:'仅本次打开有效'});token.value=sessionStorage.getItem('pinyin-family-token')??'';
    token.onchange=()=>sessionStorage.setItem('pinyin-family-token',token.value.trim());
    const strict=h('select',{'aria-label':'评测严格度'},[['gentle','宽松'],['balanced','适中'],['precise','精细']].map(([value,label])=>h('option',{value,selected:value===s.settings.strictness},label)));
    strict.onchange=()=>{s.settings.strictness=strict.value as typeof s.settings.strictness;ctx.persist();};
    const config=h('section',{class:'parent-card'},h('h3',null,'练习设置'),field('老师讲到这里',lesson),field('拼搭帮助',scaffold),h('p',null,'以拼音能力为主，教材只用来控制字母范围；拼音城堡里的纯拼音词也可以录入。补充词若没有现成词语录音，会用设备的中文词语语音；多音字需要家长核对。'));
    const consent=h('section',{class:'parent-card'},h('h3',null,'语音评测 · 试运行'),h('p',null,'开启后，录音从设备直达腾讯云；服务端只签名。不开启时使用本地跟读。最近 200 条录音仅保存在本机。'),field('允许上传录音到腾讯评测',ai),field('家庭口令',token),field('提示严格度',strict),h('p',{class:'parent-note'},'AI 和孩子自评均不计入掌握。家长回听改判后才记入“读”的学习记录。音调检测无效时不判声调。'));
    const weak=Object.entries(s.confusions).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const progress=h('section',{class:'parent-card'},h('h3',null,'练习足迹'),h('p',null,`本周开播 ${s.dates.filter(at=>Date.now()-at<7*86400000).length} 次 · 已连接词语 ${ctx.bank.words.filter(w=>mastery(s,`word:${w.id}`)).length} 个 · 待接通信号 ${Object.values(s.atoms).filter(a=>a.needsReview).length} 项`),h('h3',null,'今天可以这样夸'),h('p',{class:'parent-praise'},s.history.some(a=>a.correct&&a.judge==='deterministic')?'“你把声音和图画连起来了，还愿意自己试一试。”':'“你愿意开播，把声音送到星港。”'),h('h3',null,'可以一起试试'),...(weak.length?weak.map(([pair])=>h('p',null,ctx.bank.confusions.find(c=>c.pair.join('|')===pair)?.tip??`把 ${pair.replace('|',' 和 ')} 放在一起听听`)):[h('p',null,'拿小纸条试试 b / p 和 d / t；捏住鼻子试试 l / n。每次只找一个小变化。')]));
    const add=h('section',{class:'parent-card'},h('h3',null,'补充练习词'));
    const hanzi=h('input',{maxlength:12,'aria-label':'练习词汉字',placeholder:'例如：木马'}), syllables=h('input',{'aria-label':'数字声调拼音',placeholder:'例如：mu4 ma3'}), source=h('select',{'aria-label':'练习词来源'},['试卷','作业','拼音城堡','老师反馈'].map(x=>h('option',{value:x},x))), image=h('input',{type:'file',accept:'image/*',capture:'environment','aria-label':'练习词图片'}), chosen=h('select',{'aria-label':'选择图库'},ctx.bank.words.filter(w=>w.kind!=='sentence').map(w=>h('option',{value:w.picture},w.hanzi))), message=h('p',{'aria-live':'polite'});
    hanzi.oninput=()=>{const text=hanzi.value.trim();syllables.value=annotate(text,{toneType:'num',type:'array'}).map(x=>/\d$/.test(x)?x.replaceAll('ü','v'):x+'0').join(' ');};
    const form=h('form',{onsubmit:async(event:Event)=>{
      event.preventDefault();if(s.customWords.length>=100){message.textContent='本机已保存 100 个补充词，请先复习已有词。';return;}const text=hanzi.value.trim(), ids=syllables.value.trim().split(/\s+/);
      if(!/^[\u3400-\u9fff]{1,12}$/.test(text)||!ids.every(id=>parseSyllable(id))||ids.length!==text.length){message.textContent='请核对汉字和数字声调拼音，轻声用 0，ü 用 v';return;}
      const id=`family-${crypto.randomUUID()}`, file=image.files?.[0];
      if(file && file.size>5*1024*1024){message.textContent='请选择小于 5 MB 的图片';return;}
      try {
        if(file)await savePicture(id,file);
        const word:Word={id,hanzi:text,syllables:ids,display:ids.map(displayPinyin).join(' '),picture:file?`local:${id}`:chosen.value,kind:'noun',lesson:s.settings.lesson,beyond:true,source:source.value,custom:true};
        s.customWords.push(word);recordAttempt(s,{id:`import:${id}`,skill:`word:${id}:spell`,kind:'F',correct:false,judge:'parent',session:s.sessions,at:Date.now()});ctx.persist();message.textContent='已加入待接通信号，图片保存在本机';form.reset();
      }catch{message.textContent='本机存储暂不可用，请稍后再试';}
    }},field('汉字',hanzi),field('拼音（可修改）',syllables),field('来源',source),field('图库',chosen),field('或选本机图片',image),h('button',{type:'submit',class:'station-btn station-btn--primary'},'加入练习'),message);add.append(form);
    const review=h('section',{class:'parent-card recording-list'},h('h3',null,'回听与改判'),h('p',null,'优先查看 AI 提示再听听的录音；改判会重建学习记录，不叠加次数。'));
    void recordings().then(rows=>{
      if(!rows.length){review.append(h('p',null,'还没有录音。孩子在节目里点麦克风后，录音会留在这里。'));return;}
      rows.sort((a,b)=>Number(b.verdict?.level===1)-Number(a.verdict?.level===1));
      for(const r of rows){const word=[...ctx.bank.words,...s.customWords].find(w=>w.id===r.wordId), label=word?.display??displayPinyin(r.wordId), status=h('span',null,r.parent?'家长已标注':'待回听');
        const judgement=h('select',{'aria-label':`改判 ${label}`},[['','选择家长判断'],['correct','读得清楚'],['initial','再练声母'],['final','再练韵母'],['tone','再练声调']].map(([value,text])=>h('option',{value,selected:value===r.parent},text)));
        judgement.onchange=async()=>{if(!judgement.value)return;r.parent=judgement.value as typeof r.parent;try{await saveRecording(r);if(!r.lab)recordAttempt(s,{id:r.id,skill:r.skill,kind:r.kind,correct:r.parent==='correct',judge:'parent',session:r.session,at:r.at});ctx.persist();status.textContent='家长已标注';}catch{status.textContent='未保存，请重试';}};
        review.append(h('article',{class:'recording-row'},h('div',null,h('b',null,label),h('small',null,new Date(r.at).toLocaleString('zh-CN')),h('small',null,r.lab?'成人实验样本 · 不计孩子进度':'日常练习录音'),status),button('回听',()=>void ctx.replay(r.blob),'secondary','replay'),judgement));
      }
    }).catch(()=>review.append(h('p',null,'本机录音存储暂不可用；其他练习仍可使用。')));
    host.replaceChildren(header,h('div',{class:'parent-scroll'},config,consent,progress,add,review,...(location.pathname.includes('/lab/')?[labPanel(ctx)]:[])));
  }
  const until=Number(sessionStorage.getItem('kg:parent:unlocked')??0);
  if(hasPin()&&until>0&&Date.now()-until<30*60000)show();else gate();
  return host;
}
