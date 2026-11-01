// Lets the oracle's CLI validators (generated copies in this folder) run inside vitest: process.exit becomes an exception, console output is captured.
export class ExitSignal extends Error { constructor(readonly code: number) { super(`exit ${code}`); } }
export const __exit = (code = 0): never => { throw new ExitSignal(code); };
const LOADERS = { stats: () => import('./stats'), sim: () => import('./sim'), pacing: () => import('./pacing') } as const;
export async function runTool(name: keyof typeof LOADERS, args: string[]): Promise<{ code: number; out: string[] }> {
  const argv = process.argv, log = console.log, out: string[] = [];
  process.argv = ['node', `${name}.mjs`, ...args];
  console.log = (...a: unknown[]) => { out.push(a.map(String).join(' ')); };
  let code = 0;
  try { await LOADERS[name](); } catch (e) { if (e instanceof ExitSignal) code = e.code; else throw e; } finally { process.argv = argv; console.log = log; }
  return { code, out };
}
