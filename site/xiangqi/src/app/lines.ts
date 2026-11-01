// site/xiangqi/src/app/lines.ts — 旁白台词（content/xiangqi/narration.yaml，281 句）的运行时索引：id → 字幕文字。语音文件由 voice:build 以后生成；没有音频时气泡 / 字幕照常显示。
import raw from '../../../../content/xiangqi/narration.yaml?raw';

export interface Line { id: string; role: string; text: string }
export function parseLines(t: string): Line[] {
  const out: Line[] = []; let cur: Line | null = null;
  for (const line of t.split('\n')) {
    const m1 = /^\s+- id: (\S+)/.exec(line); if (m1) { cur = { id: m1[1], role: '', text: '' }; out.push(cur); continue; }
    const m2 = /^\s+role: (\S+)/.exec(line); if (m2 && cur) cur.role = m2[1];
    const m3 = /^\s+text: (.*)$/.exec(line); if (m3 && cur) cur.text = m3[1].trim().replace(/^['"]|['"]$/g, '');
    if (/^words:/.test(line)) cur = null;
  }
  return out;
}
const LINES = new Map(parseLines(raw).map((l) => [l.id, l]));
/** `xq.` 前缀可省：lineText('g.your') = lineText('xq.g.your') */
export const lineText = (id: string): string => LINES.get(id.startsWith('xq.') ? id : `xq.${id}`)?.text ?? '';
export const hasLine = (id: string): boolean => LINES.has(id.startsWith('xq.') ? id : `xq.${id}`);
export const xqId = (id: string): string => (id.startsWith('xq.') ? id : `xq.${id}`);
/** 没有配音时字幕要停够：整句停留 ≈ 字数 × 0.18 s + 0.8 s（打字机约 16 字/秒，标点慢 3 倍），至少 1.8 s（kit 默认）。孩子读得慢，不能一闪而过。 */
export const silentHoldMs = (text: string): number => { const cs = Array.from(text); const typeMs = 120 + cs.reduce((a, c) => a + (/[，。！？、,.!?]/.test(c) ? 188 : 63), 0); return Math.max(1800, Math.round((cs.length * 0.18 + 0.8) * 1000 - typeMs)); };
