import { reviseAttempt } from '../domain/history';
import { historyArchive, saveRecording, type Recording } from '../speech/recordings';
import type { Context } from './common';

export type ParentLabel = 'correct' | 'initial' | 'final' | 'tone';
/** Same effect as the dropdown on the review list: stores the label and rebuilds the ledger entry (never stacks counts). */
export async function applyParentLabel(ctx: Context, r: Recording, label: ParentLabel): Promise<void> {
  r.parent = label;
  r.unsure = undefined;
  await saveRecording(r);
  if (!r.lab)
    await reviseAttempt(
      ctx.save,
      {
        id: r.id,
        skill: r.skill,
        kind: r.kind,
        correct: label === 'correct',
        judge: 'parent',
        session: r.session,
        at: r.at,
        assisted: r.assisted,
      },
      historyArchive,
    );
  ctx.persist();
}
/** "拿不准": a note to self. It is not a label and changes no learning record. */
export async function markUnsure(r: Recording): Promise<void> {
  r.unsure = true;
  await saveRecording(r);
}
