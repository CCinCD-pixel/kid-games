// 体积预算（xiangqi 与 board-engine.md §12）：通用核心 ≤ 60 KB gzip（不含游戏包与内容）；Worker 包单算 ≤ 50 KB gzip；
// preserveEntrySignatures: 'strict'：Vite 应用构建默认会摇掉入口的未用导出，那样量出来偏小；这里要量"全部导出"的上限。
// 禁止 barrel（任何 index.ts 重导出）；Worker 包里不得出现视图 / 输入 / 课 / 谜题 / 校准等主线程或工具模块。用 Vite 程序化打包（minify，不写盘）。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'); const E = path.join(ROOT, 'engines/board');
const CORE_ENTRIES = ['core/game', 'core/search', 'core/errormodel', 'core/see', 'core/coach', 'core/hints', 'core/rng', 'core/stateadapter', 'view/board-view', 'view/promotion-picker', 'input/input-controller', 'play/session', 'play/facetoface', 'play/recorder', 'play/replay', 'save/adapter', 'lesson/player', 'lesson/steps', 'lesson/step-ui', 'lesson/ghost', 'puzzle/player', 'puzzle/validate', 'puzzle/audit', 'art/bake', 'art/shade', 'ai/host', 'ai/handler'];
async function bundle(name: string, code: string): Promise<{ gz: number; raw: number; modules: string[] }> {
  const res = await build({ configFile: false, root: ROOT, logLevel: 'silent', resolve: { alias: { '@kit': path.join(ROOT, 'kit'), '@engines': path.join(ROOT, 'engines') } }, build: { write: false, minify: true, target: 'es2022', reportCompressedSize: false, rollupOptions: { input: { [name]: `virtual:${name}` }, preserveEntrySignatures: 'strict', external: [/^@kit\//], output: { format: 'es' } } },
    plugins: [{ name: 'virt', resolveId(id: string) { return id === `virtual:${name}` ? `\0virtual:${name}` : null; }, load(id: string) { return id === `\0virtual:${name}` ? code : null; } }] });
  const outs = (Array.isArray(res) ? res.flatMap((r) => r.output) : 'output' in res ? res.output : []) as Rollup.OutputChunk[]; const chunks = outs.filter((o) => o.type === 'chunk');
  const src = chunks.map((c) => c.code).join('\n'); return { gz: zlib.gzipSync(src).length, raw: Buffer.byteLength(src), modules: chunks.flatMap((c) => Object.keys(c.modules)) };
}
const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;

describe('体积预算', () => {
  it('通用核心（视图 / 输入 / 对局 / 课 / 谜题 / AI 宿主 / 美术 / 存档 / 核心算法，全部导出不摇树）≤ 60 KB gzip', async () => {
    const r = await bundle('core', CORE_ENTRIES.map((m) => `export * as ${m.replace(/\W/g, '_')} from ${JSON.stringify(path.join(E, m + '.ts'))};`).join('\n'));
    console.info(`core ${kb(r.raw)} → gzip ${kb(r.gz)}（预算 60 KB）`); expect(r.gz).toBeLessThanOrEqual(60 * 1024);
  }, 120000);
  it('Worker 包（worker-entry + 搜索 / 失误模型 / SEE / 教练 + 一份象棋参考规则）≤ 50 KB gzip，且不含主线程 / 工具模块', async () => {
    const r = await bundle('worker', `import ${JSON.stringify(path.join(ROOT, 'site/dev/board/ai-worker-xq.ts'))};`);
    console.info(`worker ${kb(r.raw)} → gzip ${kb(r.gz)}（预算 50 KB；其中规则是测试夹具，真游戏更小）`); expect(r.gz).toBeLessThanOrEqual(50 * 1024);
    const bad = r.modules.filter((m) => /engines\/board\/(view|input|lesson|puzzle|play|save|art)\/|calibrate|kidmodel|\/kit\//.test(m.replace(/\\/g, '/'))); expect(bad, `Worker 包里混进了：${bad.join(', ')}`).toEqual([]);
    expect(r.modules.some((m) => m.endsWith('ai/worker-entry.ts'))).toBe(true);
  }, 120000);
  it('不许 barrel：engines/board 下没有 index.ts / index.mjs；没有 `export * from` 的聚合文件（测试夹具除外）', () => {
    const files: string[] = []; const walk = (d: string): void => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'node_modules') walk(p); } else if (/\.(ts|mts|mjs)$/.test(f.name)) files.push(p); } }; walk(E);
    expect(files.filter((f) => /\/index\.(ts|mts|mjs)$/.test(f))).toEqual([]);
    const agg = files.filter((f) => !f.endsWith('.test.ts') && !f.endsWith('size-budget.test.ts') && /^\s*export \* from /m.test(fs.readFileSync(f, 'utf8'))); expect(agg).toEqual([]);
  });
});
