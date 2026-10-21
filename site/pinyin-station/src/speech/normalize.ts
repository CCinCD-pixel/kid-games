import scoring from '../../../../content/pinyin-station/scoring.json';
export type Dim = 'initial' | 'final' | 'tone';
export interface Verdict { status: 'judged' | 'unsure'; level?: 1|2|3; dims: Partial<Record<Dim,{ok:boolean;score?:number;heard?:string}>>; engine: 'tencent-soe-n'; latencyMs:number; raw:unknown }
type Obj = Record<string, unknown>;
const object = (x:unknown):Obj => x && typeof x==='object' ? x as Obj : {};
export function normalize(raw: unknown, latencyMs: number, strictness: keyof typeof scoring.profiles = 'gentle'): Verdict {
  const envelope = object(raw), result = object(envelope.result ?? raw), cfg=scoring.profiles[strictness];
  const verdict:Verdict={status:'unsure',dims:{},engine:'tencent-soe-n',latencyMs,raw};
  if(envelope.code && envelope.code!==0) return verdict;
  const sentenceSets = Array.isArray(result.SentenceInfoSet) ? result.SentenceInfoSet : [];
  const words = Array.isArray(result.Words) ? result.Words : sentenceSets.flatMap(s=>Array.isArray(object(s).Words)?object(s).Words as unknown[]:[]);
  if(!words.length) return verdict;
  if(words.some(w=>typeof object(w).MatchTag==='number'&&object(w).MatchTag!==0))return verdict;
  const dimensions:{initial:number[];final:number[]}={initial:[],final:[]}; let obvious=false, toneMismatch=false, toneSeen=false;
  for(const value of words) {
    const w=object(value), phones=Array.isArray(w.PhoneInfos)?w.PhoneInfos:[];
    for(const phone of phones) {
      const p=object(phone), letter=String(p.ReferenceLetter || p.ReferencePhone || '').toLowerCase();
      if(!letter || typeof p.PronAccuracy!=='number' || !Number.isFinite(p.PronAccuracy) || typeof p.MatchTag!=='number') continue;
      const dim:Dim=/^(zh|ch|sh|[bpmfdtnlgkhjqxzcsr])$/.test(letter)?'initial':'final';
      dimensions[dim].push(p.PronAccuracy);
      if(p.MatchTag===3 && p.PronAccuracy<cfg.obviousMismatch) obvious=true;
    }
    const tone=object(w.Tone);
    // Neutral tones and invalid/missing detection cannot produce a negative judgement.
    if(tone.Valid===true && Number(tone.RefTone)>=1 && Number(tone.RefTone)<=4 && Number(tone.HypothesisTone)>=1 && Number(tone.HypothesisTone)<=4) {
      toneSeen=true;
      if(Number(tone.RefTone)!==Number(tone.HypothesisTone)) toneMismatch=true;
    }
  }
  for(const dim of ['initial','final'] as const) if(dimensions[dim].length) {
    const score=Math.min(...dimensions[dim]);verdict.dims[dim]={ok:score>=cfg.basic,score};
  }
  if(toneSeen) verdict.dims.tone={ok:!toneMismatch};
  if(!Object.keys(verdict.dims).length) return verdict;
  if(obvious || toneMismatch) { verdict.status='judged';verdict.level=1; }
  else if(Object.values(verdict.dims).every(d=>d.ok)) { verdict.status=toneSeen?'judged':'unsure';verdict.level=Object.values(verdict.dims).every(d=>d.score===undefined || d.score>=cfg.clear)?3:2; }
  return verdict;
}
