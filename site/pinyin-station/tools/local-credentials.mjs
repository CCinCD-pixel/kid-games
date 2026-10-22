// Local-only read. Never copy these credentials into a browser, bundle, log or deployment.
import fs from 'node:fs';
import os from 'node:os';
export function localEnv() {
  const configPath =
    process.env.SOE_CONFIG || `${os.homedir()}/Library/Application Support/Loop Pool/data/asr/config.env`;
  const values = {};
  for (const line of fs.readFileSync(configPath, 'utf8').split('\n')) {
    const m = /^(?:export\s+)?([A-Z_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) values[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return {
    appid: values.TENCENT_APP_ID,
    secretId: values.TENCENT_SECRET_ID,
    secretKey: values.TENCENT_SECRET_KEY,
  };
}
