import type { Recording } from './recordings';
import { normalize, type Dim } from './normalize';
type Profile='gentle'|'balanced'|'precise';
export function calibration(rows:Recording[],profile:Profile='gentle'){
  const labelled=rows.filter(r=>r.parent&&r.verdict);
  const dimensions=Object.fromEntries((['initial','final','tone'] as Dim[]).map(dim=>{
    let positive=0,negative=0,rejected=0,detected=0,unsure=0;
    for(const r of labelled){
      if(r.parent!=='correct'&&r.parent!==dim)continue;
      const d=normalize(r.verdict!.raw,r.verdict!.latencyMs,profile).dims[dim];
      if(!d){unsure++;continue;}
      if(r.parent==='correct'){positive++;if(!d.ok)rejected++;}
      else{negative++;if(!d.ok)detected++;}
    }
    return[dim,{positive,negative,unsure,falseRejectRate:positive?rejected/positive:null,detectionRate:negative?detected/negative:null}];
  }));
  const verdicts=rows.flatMap(r=>r.verdict?[r.verdict]:[]),latencies=verdicts.map(v=>v.latencyMs).sort((a,b)=>a-b);
  const percentile=(p:number)=>latencies.length?latencies[Math.ceil(latencies.length*p)-1]:null;
  const daily=rows.filter(r=>!r.lab).length;
  const ready=daily>=100&&labelled.length>=30&&Object.values(dimensions).every(d=>d.falseRejectRate!==null&&d.falseRejectRate<=.1&&d.detectionRate!==null&&d.detectionRate>=.7);
  return{profile,daily,labelled:labelled.length,dimensions,toneValidRatio:verdicts.length?verdicts.filter(v=>v.dims.tone).length/verdicts.length:null,latencyMs:{p50:percentile(.5),p90:percentile(.9)},gate:ready?'ready-for-parent-review':'keep-trial',masteryFromAI:false};
}
