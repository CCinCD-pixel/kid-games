// kit/sync — public surface of the merge engine + ledger contract (work package S3). S4+ add the clock, crypto, sidecar, store factory and triggers beside it.
export * from './contract';
export { R } from './rules';
export type { Rule, RuleKind, RuleOf, Rules, Stamp } from './rules';
export * from './merge';
export * from './ledger';
