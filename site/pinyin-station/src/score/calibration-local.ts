import type { Recording } from '../speech/recordings';
/**
 * How the on-device tone scorer agrees with the parent's labels. Kept apart from the Tencent figures (speech/calibration.ts):
 * the two engines are different instruments and must never be pooled. Only the TONE dimension is compared: a parent label
 * of 'correct' means the tone was fine, 'tone' means it was not; labels 'initial'/'final' say nothing about tone and are skipped.
 */
export function localCalibration(rows: Recording[]) {
  let right = 0,
    wrong = 0,
    match = { right: 0, wrong: 0 },
    differs = { right: 0, wrong: 0 },
    unsure = 0,
    skipped = 0;
  for (const r of rows) {
    if (!r.local) continue;
    const label = r.parent;
    if (label !== 'correct' && label !== 'tone') {
      skipped++;
      continue;
    }
    if (label === 'correct') right++;
    else wrong++;
    if (r.local.verdict === 'unsure') unsure++;
    else if (r.local.verdict === 'match') match[label === 'correct' ? 'right' : 'wrong']++;
    else differs[label === 'tone' ? 'right' : 'wrong']++;
  }
  const judged = right + wrong - unsure,
    said = differs.right + differs.wrong;
  return {
    labelledTone: right + wrong,
    parentCorrect: right,
    parentToneWrong: wrong,
    unsure,
    skipped,
    coverage: right + wrong ? judged / (right + wrong) : null,
    /** When the scorer says "differs", how often the parent agreed (needs >= 0.85 before it may be shown to the child). */
    ppvDiffers: said ? differs.right / said : null,
    /** Correct readings that the scorer called "differs" (needs <= 0.05). */
    falseRejectRate: right ? differs.wrong / right : null,
    recallWrong: wrong ? differs.right / wrong : null,
    matchWhenWrong: wrong ? match.wrong / wrong : null,
  };
}
