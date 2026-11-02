/**
 * 测起点 — a short adaptive test that suggests where on a line to start.
 *
 * Question choice is the staircase from the spec: start at tier 5; a right answer goes up one tier
 * (two tiers after two rights in a row); a wrong answer goes down two. The *estimate* is read from
 * everything that was answered with a small Bayesian model (learner level ℓ = the first tier that is
 * still hard; tiers below ℓ are nearly always right, tiers above nearly always wrong, plus random slips),
 * and the conservative end of the posterior is used, so a lucky guess does not skip a stage the child
 * has not met. The test stops after 6–9 questions, as soon as the estimate is stable.
 */
export const PLACE_START = 5;
export const PLACE_MIN = 6;
export const PLACE_MAX = 9;
export const TIERS = 10;
/** which end of the posterior is used: 0.5 = median, lower = more cautious */
export const QUANTILE = 0.4;

export interface Probe { tier: number; right: boolean }
export interface PlaceState { tier: number; streak: number; probes: Probe[] }

/** The model the estimator assumes (the simulator in the tests deliberately uses different numbers). */
export const MODEL = { steepness: 1.5, slip: 0.12 };

export const newPlacement = (): PlaceState => ({ tier: PLACE_START, streak: 0, probes: [] });

export function recordProbe(state: PlaceState, right: boolean): void {
  state.probes.push({ tier: state.tier, right });
  if (right) {
    state.streak += 1;
    state.tier = Math.min(TIERS, state.tier + (state.streak >= 2 ? 2 : 1));
    if (state.streak >= 2) state.streak = 0;
  } else {
    state.streak = 0;
    state.tier = Math.max(1, state.tier - 2);
  }
}

const rightChance = (tier: number, level: number, model = MODEL): number => (1 - model.slip) / (1 + Math.exp(model.steepness * (tier - level)));

/** Posterior over ℓ = 1..10 (uniform prior). */
export function posterior(probes: Probe[], model = MODEL): number[] {
  const weights: number[] = [];
  for (let level = 1; level <= TIERS; level++) {
    let w = 1;
    for (const probe of probes) {
      const p = rightChance(probe.tier, level, model);
      w *= probe.right ? p : 1 - p;
    }
    weights.push(w);
  }
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => w / total);
}

/** Suggested start tier (1..10): the cautious side of the posterior (40th percentile, slightly below the median). */
export function estimate(probes: Probe[], model = MODEL, quantile = QUANTILE): number {
  const post = posterior(probes, model);
  let sum = 0;
  for (let level = 1; level <= TIERS; level++) {
    sum += post[level - 1];
    if (sum >= quantile) return level;
  }
  return TIERS;
}

/** True when the test can stop: at least 6 questions and a stable estimate, or 9 questions. */
export function isDone(state: PlaceState, model = MODEL): boolean {
  const n = state.probes.length;
  if (n >= PLACE_MAX) return true;
  if (n < PLACE_MIN) return false;
  const post = posterior(state.probes, model);
  const mode = post.indexOf(Math.max(...post)) + 1;
  let mass = 0;
  for (let level = Math.max(1, mode - 1); level <= Math.min(TIERS, mode + 1); level++) mass += post[level - 1];
  return mass >= 0.88;
}

/** A simulated learner for the tests: chance of a right answer falls smoothly with (tier − level), with 10 % random slips. */
export function simulateLearner(level: number, rng: () => number, shape = { steepness: 1.8, slip: 0.1 }, model = MODEL, quantile = QUANTILE): { start: number; questions: number } {
  const state = newPlacement();
  while (!isDone(state, model)) {
    const p = (1 - shape.slip) / (1 + Math.exp(shape.steepness * (state.tier - level)));
    recordProbe(state, rng() < p);
  }
  return { start: estimate(state.probes, model, quantile), questions: state.probes.length };
}
