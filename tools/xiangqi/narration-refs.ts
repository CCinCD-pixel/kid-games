// tools/xiangqi/narration-refs.ts — 旁白 id 引用扫描：yaml 里的每一句都必须被代码 / 课程数据引用（否则配音会白白合成），代码里写死的 id 都必须在 yaml 里。
// 动态拼接的 id（w.<reason> / f.ok<n> / rb.<n>.win|lose|intro|join / g.*.win|lose / h.1.* …）用 DYNAMIC 前缀白名单声明。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const walk = (dir: string, out: string[] = []): string[] => { for (const n of readdirSync(dir)) { const p = path.join(dir, n); const st = statSync(p); if (st.isDirectory()) { if (n === 'node_modules') continue; walk(p, out); } else out.push(p); } return out; };
const SRC_DIRS = ['site/xiangqi/src', 'engines/board/lesson', 'engines/board/core', 'engines/board/play', 'engines/board/puzzle'];
const JSONS = ['lessons.v1.json', 'extra.v1.json', 'robots.v1.json', 'xiaoju.v1.json', 'cards.v1.json', 'puzzles.v1.json'].map((f) => path.join(ROOT, 'content/xiangqi', f));
export const DYNAMIC: RegExp[] = [/^w\./, /^f\.ok\d$/, /^rb\.\d\.(intro|win|lose)$/, /^g\.(mate|stale|perp)\.(win|lose)$/];
const ID_RE = /['"`]((?:[a-z][a-z0-9]{0,3}|stop|perp)(?:\.[A-Za-z0-9]+)+)['"`]/g;
export function referencedIds(): Set<string> {
  const refs = new Set<string>();
  const files = [...SRC_DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f) && !/\/test\//.test(f)), ...JSONS];
  for (const f of files) { const t = readFileSync(f, 'utf8'); for (const m of t.matchAll(ID_RE)) refs.add(m[1]); }
  for (const f of JSONS.slice(0, 1)) { const j = JSON.parse(readFileSync(f, 'utf8')) as { lessons: { lines?: string[] }[] }; for (const l of j.lessons) for (const id of l.lines ?? []) refs.add(id); }
  return refs;
}
export function yamlIds(): string[] { const t = readFileSync(path.join(ROOT, 'content/xiangqi/narration.yaml'), 'utf8'); return [...t.matchAll(/^\s+- id: xq\.(\S+)/gm)].map((m) => m[1]); }
export const isDynamic = (id: string): boolean => DYNAMIC.some((r) => r.test(id));
export function unreferenced(): string[] { const refs = referencedIds(); return yamlIds().filter((id) => !refs.has(id) && !isDynamic(id)); }
