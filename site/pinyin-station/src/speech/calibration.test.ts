import { it,expect } from 'vitest';
import { calibration } from './calibration';
import { normalize } from './normalize';
import type { Recording } from './recordings';
it('keeps unknown dimensions and absent labels out of calibration rates',()=>{
  const base:Recording={id:'r',blob:new Blob(),wordId:'ba1',skill:'syl:ba1:say',at:0,session:1,kind:'D',parent:'correct',verdict:normalize({Words:[{PhoneInfos:[{ReferenceLetter:'b',PronAccuracy:20,MatchTag:3}],Tone:{Valid:false}}]},100)};
  const report=calibration([base]);
  expect(report.dimensions.initial.falseRejectRate).toBe(1);
  expect(report.agreement.rate).toBe(0);
  expect(report.dimensions.tone.falseRejectRate).toBeNull();
  expect(report.dimensions.tone.unsure).toBe(1);
  expect(report.gate).toBe('keep-trial');expect(report.masteryFromAI).toBe(false);
});
it('keeps adult experiments separate from the daily child sample count',()=>{
  expect(calibration([{lab:true} as Recording]).daily).toBe(0);
});
