// kit/sync/contract.ts — the ONE place for constants shared by the sync client, the sync server tests, kit/economy and docs/specs/star-pets.md.
// Pure constants, zero imports: anything may import this file without pulling in merge/ledger code.
// Authority: docs/specs/sync.md v1.1 §8.4 (ledger contract) and §4.2 (numeric limits). tests/economy/vectors.json is generated against these values.

/** The ONE event-id charset (dots and colons included: 'first:mars-base:orbit.O1.0'). Server, client, kit/economy and star-pets all use this exact regex. */
export const ID_RE = /^[A-Za-z0-9:._-]{3,96}$/;
/** Device id (kit/clock install-time random); natural events use the fixed device 'n'. */
export const DEV_RE = /^[A-Za-z0-9]{1,16}$/;
/** Once-only (natural) event ids are content-derived and canonical. */
export const NATURAL_RE = /^(first|m|u|egg|g|d1|rf|retro):/;
export const KINDS = ['earn', 'spend', 'grant'] as const;
export type Kind = (typeof KINDS)[number];
/** amount is an UNSIGNED integer 0..MAX_AMOUNT; the sign comes from `kind` (spend = minus). */
export const MAX_AMOUNT = 100000;
/** Lamport counter ceiling accepted by the event validator. */
export const MAX_LC = 2 ** 40;
export const SRC_MAX = 32;
export const REF_MAX = 48;
/** Epoch-ms values, counters and ring ords survive up to 2^53-1 (v1.0's 1e12 limit threw away Date.now() = 1.79e12). */
export const MAX_SAFE = Number.MAX_SAFE_INTEGER;
/** Per-device slot of a `sum` field (sokoban activeMs is already 2.6e9). */
export const SUM_SLOT_MAX = 2 ** 40;
/** lcSeed epoch: a fresh device's Lamport counter starts at seconds-since-this, capped at LC_SEED_MAX. */
export const LC_SEED_EPOCH_MS = Date.UTC(2026, 0, 1);
export const LC_SEED_MAX = 2 ** 33;
