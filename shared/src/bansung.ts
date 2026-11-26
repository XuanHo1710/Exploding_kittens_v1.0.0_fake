/**
 * Barrel entrypoint for `bansung` (Bắn Súng Co-op / Soul & Steel) shared types,
 * constants, weapons, evolution tiers, gacha skills, heroes, enemies,
 * wave/survival schedules, perks, and arena maps.
 *
 * Arena dimension alignment note:
 * - `./bansung/types` defines `BANSUNG_ARENA_W = 4224` and `BANSUNG_ARENA_H = 2688`.
 * - `./bansung/maps` defines the authoritative 88x56 48px-tile Survival arena
 *   (`BANSUNG_MAP_W = 4224`, `BANSUNG_MAP_H = 2688`, `BANSUNG_ARENA_CX = 2112`,
 *   `BANSUNG_ARENA_CY = 1368`, playable `[48..4176] x [96..2640]`).
 * - Both modules are aligned at `4224 x 2688`; this barrel explicitly binds
 *   `BANSUNG_ARENA_W`/`BANSUNG_ARENA_H` to `BANSUNG_MAP_W`/`BANSUNG_MAP_H` and
 *   keeps `BANSUNG_DRAFT_ARENA_W`/`BANSUNG_DRAFT_ARENA_H` (deprecated aliases of
 *   `./bansung/types`, now also `4224`/`2688`) exported so no imports break.
 */
export * from './bansung/types';
export * from './bansung/weapons';
export * from './bansung/heroes';
export * from './bansung/enemies';
export * from './bansung/maps';
export * from './bansung/night';
export * from './bansung/weapon-skills/index';

export {
  BANSUNG_MAP_W as BANSUNG_ARENA_W,
  BANSUNG_MAP_H as BANSUNG_ARENA_H,
} from './bansung/maps';

export {
  BANSUNG_ARENA_W as BANSUNG_DRAFT_ARENA_W,
  BANSUNG_ARENA_H as BANSUNG_DRAFT_ARENA_H,
} from './bansung/types';
