/**
 * QA dev server for 星晶消消乐: the root config with HMR off, so edits by other agents in the shared
 * tree (which trigger Vite full reloads) do not navigate pages mid-run. Reload manually after edits.
 *   npx vite --config tools/emoji-match/vite.qa.config.ts --port 5305 --strictPort
 */
import { mergeConfig } from 'vite';
import base from '../../vite.config';

export default mergeConfig(base, { server: { hmr: false } });
