import { displayPinyin } from '../domain/pinyin';
import type { Recording } from '../speech/recordings';
import { zipStore } from '../score/zip';

export interface ExportRow {
  id: string;
  file: string;
  at: string;
  wordId: string;
  skill: string;
  kind: string;
  session: number;
  syllable: string | null;
  display: string | null;
  initial: string | null;
  final: string | null;
  tone: number | null;
  confusions: unknown;
  /** Parent label: correct | initial | final | tone; null = not labelled. */
  label: string | null;
  labelledBy: 'parent' | null;
  parentUnsure: boolean;
  adultLab: boolean;
  assisted: boolean;
  local: Recording['local'] | null;
  tencent: { status: string; level?: number; dims: unknown; reason?: string } | null;
  capture: unknown;
  device: unknown;
  speakerN: number | null;
}
export async function buildExport(rows: Recording[]): Promise<{ zip: Uint8Array; manifest: { rows: ExportRow[] } }> {
  const files: { name: string; data: Uint8Array }[] = [];
  const out: ExportRow[] = [];
  for (const r of rows.slice().sort((a, b) => a.at - b.at)) {
    const wavBytes = new Uint8Array(await r.blob.arrayBuffer());
    const file = `wav/${r.id}.wav`;
    files.push({ name: file, data: wavBytes });
    const t = r.meta?.target;
    out.push({
      id: r.id,
      file,
      at: new Date(r.at).toISOString(),
      wordId: r.wordId,
      skill: r.skill,
      kind: r.kind,
      session: r.session,
      syllable: t?.syllable ?? null,
      display: t ? displayPinyin(t.syllable) : null,
      initial: t?.initial ?? null,
      final: t?.final ?? null,
      tone: t?.tone ?? null,
      confusions: r.meta?.confusions ?? null,
      label: r.parent ?? null,
      labelledBy: r.parent ? 'parent' : null,
      parentUnsure: r.unsure === true,
      adultLab: r.lab === true,
      assisted: r.assisted === true,
      local: r.local ?? null,
      tencent: r.verdict ? { status: r.verdict.status, level: r.verdict.level, dims: r.verdict.dims, reason: r.verdict.reason } : null,
      capture: r.meta?.capture ?? null,
      device: r.meta?.device ?? null,
      speakerN: r.meta?.speakerN ?? null,
    });
  }
  const manifest = { format: 'pinyin-station-recordings', version: 1, exportedAt: new Date().toISOString(), note: 'Private: contains a child voice. Keep out of the repository.', rows: out };
  files.unshift({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 1)) });
  return { zip: zipStore(files), manifest };
}
/** Local file download only: no network, no upload. */
export async function downloadExport(rows: Recording[]): Promise<number> {
  const { zip } = await buildExport(rows);
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `pinyin-station-recordings-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return rows.length;
}
