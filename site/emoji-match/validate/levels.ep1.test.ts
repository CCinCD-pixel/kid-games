/** V4f fast difficulty tier, episode 1 (spec §9.2) — see v4f.ts. */
import { describe } from 'vitest';
import { v4fEpisode } from './v4f';

describe('V4f episode 1', () => v4fEpisode(1));
