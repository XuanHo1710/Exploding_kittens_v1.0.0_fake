/**
 * client/src/bansung/sound.ts
 *
 * Spatial WebAudio SFX + dual-deck BGM engine for `ban_sung`.
 *
 * Signal flow:
 *   [AudioBufferSource | Procedural Synth]
 *     -> [StereoPannerNode] -> [voiceGain]
 *     -> sfxBus -> limiter (DynamicsCompressorNode) -> sfxMasterGain -> masterGain -> destination
 *   [deckA / deckB <audio loop>]
 *     -> [MediaElementAudioSourceNode -> bgmGainA / bgmGainB] -> bgmMasterGain -> masterGain -> destination
 *
 * All mute state shares `isMuted()` / `setMuted()` from `client/src/sfx.ts`.
 */

import { audioCtx, isMuted, setMuted as setSharedMuted } from '../sfx';
import {
  BANSUNG_FX_STATUS_WSKILL_CAST,
  BANSUNG_FX_STATUS_WSKILL_END,
  BANSUNG_FX_STATUS_WSKILL_IMPACT,
  BANSUNG_FX_STATUS_WSKILL_PASSIVE,
} from '../../../shared/src/bansung/weapon-skills/types';
import {
  BANSUNG_DMG_ARMOR,
  BANSUNG_DMG_CRIT,
  BANSUNG_DMG_HEAL,
  BANSUNG_DMG_SHOCK,
  BANSUNG_DMG_STUN,
  BANSUNG_ENEMIES,
  BANSUNG_ENEMY_IDS,
  BANSUNG_FX_BEAM_BOSS_EYE,
  BANSUNG_FX_BEAM_BOSS_LASER,
  BANSUNG_FX_BEAM_CHAIN,
  BANSUNG_FX_BEAM_LASER_MAP,
  BANSUNG_FX_BEAM_RAIL,
  BANSUNG_FX_BEAM_SHOCK,
  BANSUNG_FX_BEAM_YELLOW_LIGHTNING,
  BANSUNG_FX_BLAST_ABYSS_NOVA,
  BANSUNG_FX_BLAST_BOSS_MORTAR,
  BANSUNG_FX_BLAST_BOSS_SHOCKWAVE,
  BANSUNG_FX_BLAST_CLUSTER,
  BANSUNG_FX_BLAST_DESTROYER_METEOR,
  BANSUNG_FX_BLAST_DRONE_PULSE,
  BANSUNG_FX_BLAST_FIREBALL,
  BANSUNG_FX_BLAST_FROST_SHATTER,
  BANSUNG_FX_BLAST_HE,
  BANSUNG_FX_BLAST_HERO_NOVA,
  BANSUNG_FX_BLAST_MINE,
  BANSUNG_FX_BLAST_ORBITAL,
  BANSUNG_FX_BLAST_STEAM,
  BANSUNG_FX_BLAST_STORM_YELLOW,
  BANSUNG_FX_BLAST_STUN,
  BANSUNG_FX_BLAST_THUNDER_STORM,
  BANSUNG_FX_BLAST_TURRET_EXPIRE,
  BANSUNG_FX_BLAST_TURRET_THUNDER,
  BANSUNG_FX_BLAST_VOLATILE,
  BANSUNG_FX_IMPACT_FLESH,
  BANSUNG_FX_IMPACT_SLASH,
  BANSUNG_FX_IMPACT_SLICE,
  BANSUNG_FX_IMPACT_SPARK,
  BANSUNG_FX_IMPACT_WALL,
  BANSUNG_FX_STATUS_BOSS_MATRIX,
  BANSUNG_FX_STATUS_BOSS_OVERHEAT,
  BANSUNG_FX_STATUS_BOSS_PART_BREAK,
  BANSUNG_FX_STATUS_BOSS_PHASE,
  BANSUNG_FX_STATUS_BOSS_SHIELD_UP,
  BANSUNG_FX_STATUS_CRATE,
  BANSUNG_FX_STATUS_DASH,
  BANSUNG_FX_STATUS_DOWNED,
  BANSUNG_FX_STATUS_GACHA,
  BANSUNG_FX_STATUS_HERO_SKILL,
  BANSUNG_FX_STATUS_LEVELUP,
  BANSUNG_FX_STATUS_PERK,
  BANSUNG_FX_STATUS_RELOAD_PERFECT,
  BANSUNG_FX_STATUS_RELOAD_START,
  BANSUNG_FX_STATUS_RESTOCK,
  BANSUNG_FX_STATUS_REVIVED,
  BANSUNG_STATIC_ROOT,
  FX_BEAM,
  FX_BLAST,
  FX_DEATH,
  FX_DMG,
  FX_IMPACT,
  FX_MUZZLE,
  FX_PING,
  FX_STATUS,
  getWeaponByIdx,
  type BansungBiome,
} from '../../../shared/src';
import type { SnapFxEvent } from './store';

export { isMuted };

/**
 * Updates shared mute state in `../sfx` and immediately syncs the Bansung audio graph & BGM decks.
 */
export function setMuted(muted: boolean): void {
  setSharedMuted(muted);
  syncBansungMute();
}

// ─── Constants (d16 / d43) ──────────────────────────────────────────────────

export const MAX_SFX_VOICES = 24;
export const STEAL_FADE_SEC = 0.012;
export const PAN_RANGE_PX = 520;
export const MAX_PAN_ABS = 0.92;
export const FULL_VOL_RADIUS_PX = 140;
export const HEAR_RADIUS_PX = 1100;
export const MIN_AUDIBLE_GAIN = 0.015;
export const CROSSFADE_SEC = 1.2;
export const BOSS_CROSSFADE_SEC = 0.45;
export const PREF_KEY = 'bansung.audio.v1';
export const MAX_DECODE_CONCURRENCY = 4;

const DEFAULT_MANIFEST_URL = `${BANSUNG_STATIC_ROOT}/manifest.json`;
const DEFAULT_PREFS: BansungAudioPrefs = { master: 0.85, sfx: 0.9, bgm: 0.45 };
const LIMITER_THRESHOLD_DB = -8;
const LIMITER_KNEE_DB = 12;
const LIMITER_RATIO = 6;
const LIMITER_ATTACK_SEC = 0.003;
const LIMITER_RELEASE_SEC = 0.15;

// ─── Public Types ───────────────────────────────────────────────────────────

export type BansungBgmId =
  | 'menu'
  | 'combat'
  | 'boss'
  | 'victory'
  | 'defeat'
  | 'bgm_menu'
  | 'bgm_combat'
  | 'bgm_boss'
  | 'bgm_victory'
  | 'bgm_defeat'
  | 'bgm_lobby'
  | 'bgm_lobby_alt'
  | 'bgm_desert'
  | 'bgm_desert_chiptune'
  | 'bgm_crypt'
  | 'bgm_crypt_alt'
  | 'bgm_cyber'
  | 'bgm_cyber_nes'
  | 'bgm_boss_chiptune'
  | 'bgm_boss_epic'
  | 'bgm_boss_nes'
  | 'bgm_boss_rpg';

export type BansungCanonicalSfxId =
  // d43 44 canonical SFX IDs
  | 'shot_pistol'
  | 'shot_smg'
  | 'shot_shotgun'
  | 'shot_rifle'
  | 'shot_sniper'
  | 'shot_laser'
  | 'shot_rocket'
  | 'shot_flame'
  | 'melee_swing'
  | 'turret_shot'
  | 'reload_start'
  | 'reload_active_hit'
  | 'reload_done'
  | 'empty_click'
  | 'shell_casing'
  | 'weapon_swap'
  | 'hit_flesh'
  | 'hit_armor'
  | 'hit_crit'
  | 'shield_break'
  | 'stun_flash'
  | 'explosion_sm'
  | 'explosion_lg'
  | 'dash'
  | 'heal_orb'
  | 'energy_orb'
  | 'pickup_weapon'
  | 'perk_pick'
  | 'player_down'
  | 'revive_tick'
  | 'revive_done'
  | 'mob_spawn'
  | 'mob_die'
  | 'sniper_lock'
  | 'boss_roar'
  | 'boss_slam'
  | 'boss_laser'
  | 'ui_click'
  | 'ui_deny'
  | 'wave_start'
  | 'wave_clear'
  | 'win'
  | 'lose'
  | 'ping'
  // d16 & weapon/gadget canonical SFX IDs
  | 'gun_pistol'
  | 'gun_rifle'
  | 'gun_smg'
  | 'gun_shotgun'
  | 'gun_grenade'
  | 'gun_concussion'
  | 'gun_bazooka'
  | 'gun_plasma'
  | 'gun_railgun'
  | 'magic_arcane'
  | 'magic_lightning'
  | 'melee_slash'
  | 'melee_shock'
  | 'melee_deflect'
  | 'mine_arm'
  | 'reload_active'
  | 'dry_fire'
  | 'bomb_throw'
  | 'bomb_bounce'
  | 'explode_mini'
  | 'explode_he'
  | 'turret_deploy'
  | 'heal_pulse'
  | 'player_hurt'
  | 'crate_break'
  | 'pickup_hp'
  | 'pickup_orb'
  | 'pickup_coin'
  | 'enemy_die'
  | 'boss_beam'
  | 'boss_emp'
  | 'ping_coop'
  | 'match_win'
  | 'match_lose'
  | 'sfx_pistol_fire'
  | 'sfx_rifle_fire'
  | 'sfx_smg_fire'
  | 'sfx_shotgun_fire'
  | 'sfx_shotgun_pump'
  | 'sfx_reload_kinetic'
  | 'wpn_plasma_fire'
  | 'wpn_rail_charge'
  | 'wpn_rail_fire'
  | 'wpn_lightning_cast';

export type BansungSfxId = BansungCanonicalSfxId | (string & {});

export interface SfxPlayOpts {
  x?: number;
  y?: number;
  /** Relative scalar gain in 0..1+ (defaults to 1). */
  vol?: number;
  /** Multiplier applied over spec pitch jitter (defaults to 1). */
  pitchMul?: number;
  /** Non-spatial flag: forces pan=0 and skips distance attenuation. */
  local?: boolean;
  /** Originating actor/player ID. */
  sourceId?: number;
}

export interface SfxSpec {
  /** 0 = casings/ambiance, 1 = gunfire/hits, 2 = reload/ability/pickup, 3 = explosion/boss/down/win. */
  priority: 0 | 1 | 2 | 3;
  minGapMs: number;
  pitchMin: number;
  pitchMax: number;
  volJitter: number;
  spatial: boolean;
  baseVol: number;
  fallbackDur: number;
}

export interface BansungAudioPrefs {
  master: number;
  sfx: number;
  bgm: number;
}

export interface AudioManifestEntry {
  path: string;
  kind: 'sfx' | 'bgm';
  durationMs: number;
  gain: number;
  loop: boolean;
  synthFallback: string;
  sourceId?: string;
  fallbackPath?: string;
  variations?: string[];
}

export interface ConsumeFxAudioOpts {
  localActorId?: number;
  localPlayerIdx?: number;
  onBossAudio?: () => void;
}

export interface BansungAudioDiagnostics {
  initialized: boolean;
  muted: boolean;
  activeVoices: number;
  loadedBuffers: number;
  failedUrlCount: number;
  manifestLoaded: boolean;
  manifestCount: number;
  currentBgm: string | null;
  listener: { x: number; y: number };
}

// ─── Procedural Synth Recipe Definitions ────────────────────────────────────

type SynthStep =
  | {
      kind: 'osc';
      type: OscillatorType;
      f0: number;
      f1: number;
      dur: number;
      gain?: number;
      delay?: number;
    }
  | {
      kind: 'nz';
      dur: number;
      filterType: BiquadFilterType;
      freq: number;
      q: number;
      gain?: number;
      delay?: number;
    }
  | {
      kind: 'arp';
      type: OscillatorType;
      notes: readonly number[];
      stepSec: number;
      dur: number;
      gain?: number;
      delay?: number;
    };

interface CanonicalAudioDef {
  spec: SfxSpec;
  synth: readonly SynthStep[];
}

function makeDef(
  priority: 0 | 1 | 2 | 3,
  minGapMs: number,
  pitchMin: number,
  pitchMax: number,
  volJitter: number,
  spatial: boolean,
  baseVol: number,
  fallbackDur: number,
  synth: readonly SynthStep[],
): CanonicalAudioDef {
  return {
    spec: {
      priority,
      minGapMs,
      pitchMin,
      pitchMax,
      volJitter,
      spatial,
      baseVol,
      fallbackDur,
    },
    synth,
  };
}

const CANONICAL_DEFS: Record<string, CanonicalAudioDef> = {
  // Weapons (d43 + d16 + shared weapon keys)
  shot_pistol: makeDef(2, 24, 0.94, 1.07, 0.08, true, 0.68, 0.1, [
    { kind: 'osc', type: 'triangle', f0: 320, f1: 90, dur: 0.09, gain: 0.9 },
    { kind: 'nz', dur: 0.06, filterType: 'bandpass', freq: 1400, q: 1.8, gain: 0.65 },
  ]),
  shot_smg: makeDef(2, 18, 0.95, 1.08, 0.07, true, 0.58, 0.07, [
    { kind: 'osc', type: 'square', f0: 360, f1: 110, dur: 0.06, gain: 0.7 },
    { kind: 'nz', dur: 0.05, filterType: 'highpass', freq: 1200, q: 1.2, gain: 0.6 },
  ]),
  shot_shotgun: makeDef(2, 45, 0.93, 1.05, 0.07, true, 0.82, 0.18, [
    { kind: 'osc', type: 'sawtooth', f0: 180, f1: 45, dur: 0.18, gain: 0.85 },
    { kind: 'nz', dur: 0.16, filterType: 'lowpass', freq: 1100, q: 0.9, gain: 0.9 },
  ]),
  shot_rifle: makeDef(2, 22, 0.95, 1.06, 0.06, true, 0.68, 0.11, [
    { kind: 'osc', type: 'sawtooth', f0: 240, f1: 70, dur: 0.11, gain: 0.8 },
    { kind: 'nz', dur: 0.08, filterType: 'bandpass', freq: 1800, q: 1.5, gain: 0.7 },
  ]),
  shot_sniper: makeDef(2, 55, 0.97, 1.03, 0.04, true, 0.86, 0.22, [
    { kind: 'osc', type: 'sawtooth', f0: 520, f1: 80, dur: 0.22, gain: 0.85 },
    { kind: 'nz', dur: 0.18, filterType: 'highpass', freq: 1500, q: 1.0, gain: 0.8 },
  ]),
  shot_laser: makeDef(2, 28, 0.96, 1.05, 0.05, true, 0.65, 0.11, [
    { kind: 'osc', type: 'sine', f0: 980, f1: 310, dur: 0.1, gain: 0.8 },
    { kind: 'osc', type: 'triangle', f0: 1400, f1: 500, dur: 0.07, gain: 0.5 },
  ]),
  shot_rocket: makeDef(2, 55, 0.94, 1.04, 0.05, true, 0.8, 0.22, [
    { kind: 'osc', type: 'sawtooth', f0: 140, f1: 40, dur: 0.22, gain: 0.85 },
    { kind: 'nz', dur: 0.2, filterType: 'lowpass', freq: 900, q: 0.7, gain: 0.85 },
  ]),
  shot_flame: makeDef(1, 45, 0.9, 1.1, 0.1, true, 0.54, 0.16, [
    { kind: 'nz', dur: 0.16, filterType: 'bandpass', freq: 650, q: 0.8, gain: 0.9 },
    { kind: 'osc', type: 'sawtooth', f0: 140, f1: 85, dur: 0.14, gain: 0.4 },
  ]),
  gun_grenade: makeDef(2, 55, 0.95, 1.05, 0.05, true, 0.68, 0.15, [
    { kind: 'osc', type: 'sine', f0: 160, f1: 55, dur: 0.15, gain: 0.9 },
    { kind: 'nz', dur: 0.09, filterType: 'bandpass', freq: 700, q: 2.0, gain: 0.6 },
  ]),
  gun_concussion: makeDef(2, 55, 0.95, 1.05, 0.05, true, 0.66, 0.13, [
    { kind: 'osc', type: 'triangle', f0: 240, f1: 90, dur: 0.12, gain: 0.8 },
    { kind: 'nz', dur: 0.08, filterType: 'bandpass', freq: 950, q: 1.8, gain: 0.7 },
  ]),
  gun_railgun: makeDef(2, 60, 0.97, 1.03, 0.04, true, 0.8, 0.24, [
    { kind: 'osc', type: 'sawtooth', f0: 1800, f1: 120, dur: 0.24, gain: 0.85 },
    { kind: 'nz', dur: 0.18, filterType: 'highpass', freq: 2000, q: 1.2, gain: 0.75 },
  ]),
  wpn_rail_charge: makeDef(1, 120, 0.98, 1.02, 0.03, true, 0.48, 0.22, [
    { kind: 'osc', type: 'sine', f0: 320, f1: 1480, dur: 0.22, gain: 0.85 },
  ]),
  magic_arcane: makeDef(1, 80, 0.95, 1.05, 0.06, true, 0.54, 0.16, [
    { kind: 'arp', type: 'sine', notes: [520, 660, 780, 1040], stepSec: 0.035, dur: 0.07, gain: 0.75 },
  ]),
  magic_lightning: makeDef(1, 80, 0.93, 1.07, 0.07, true, 0.62, 0.13, [
    { kind: 'nz', dur: 0.11, filterType: 'bandpass', freq: 2600, q: 2.8, gain: 0.85 },
    { kind: 'osc', type: 'square', f0: 1200, f1: 280, dur: 0.12, gain: 0.6 },
  ]),
  melee_swing: makeDef(1, 90, 0.94, 1.08, 0.06, true, 0.48, 0.1, [
    { kind: 'nz', dur: 0.09, filterType: 'bandpass', freq: 1100, q: 1.4, gain: 0.8 },
    { kind: 'osc', type: 'sine', f0: 260, f1: 120, dur: 0.08, gain: 0.5 },
  ]),
  melee_slash: makeDef(1, 90, 0.95, 1.06, 0.06, true, 0.56, 0.12, [
    { kind: 'nz', dur: 0.11, filterType: 'bandpass', freq: 2200, q: 1.6, gain: 0.85 },
    { kind: 'osc', type: 'triangle', f0: 420, f1: 140, dur: 0.1, gain: 0.55 },
  ]),
  melee_shock: makeDef(1, 90, 0.94, 1.06, 0.06, true, 0.6, 0.13, [
    { kind: 'osc', type: 'square', f0: 880, f1: 220, dur: 0.12, gain: 0.65 },
    { kind: 'nz', dur: 0.09, filterType: 'bandpass', freq: 2800, q: 2.4, gain: 0.75 },
  ]),
  melee_deflect: makeDef(2, 60, 0.96, 1.05, 0.05, true, 0.65, 0.1, [
    { kind: 'osc', type: 'triangle', f0: 1900, f1: 1200, dur: 0.09, gain: 0.8 },
    { kind: 'osc', type: 'sine', f0: 2600, f1: 1800, dur: 0.07, gain: 0.55 },
  ]),
  turret_shot: makeDef(0, 75, 0.94, 1.08, 0.06, true, 0.34, 0.06, [
    { kind: 'osc', type: 'square', f0: 540, f1: 220, dur: 0.055, gain: 0.7 },
    { kind: 'nz', dur: 0.04, filterType: 'highpass', freq: 1800, q: 1.5, gain: 0.5 },
  ]),
  sfx_shotgun_pump: makeDef(1, 90, 0.95, 1.05, 0.05, true, 0.52, 0.12, [
    { kind: 'nz', dur: 0.06, filterType: 'bandpass', freq: 1600, q: 2.2, gain: 0.75 },
    { kind: 'osc', type: 'triangle', f0: 500, f1: 220, dur: 0.06, delay: 0.05, gain: 0.65 },
  ]),
  mine_arm: makeDef(1, 90, 0.98, 1.02, 0.03, true, 0.55, 0.13, [
    { kind: 'arp', type: 'sine', notes: [740, 988], stepSec: 0.055, dur: 0.06, gain: 0.75 },
  ]),

  // Reload / Mechanics / Casings
  reload_start: makeDef(2, 120, 0.97, 1.03, 0.04, true, 0.5, 0.06, [
    { kind: 'nz', dur: 0.05, filterType: 'bandpass', freq: 1900, q: 2.4, gain: 0.7 },
    { kind: 'osc', type: 'triangle', f0: 420, f1: 280, dur: 0.05, gain: 0.6 },
  ]),
  reload_active_hit: makeDef(2, 100, 1.0, 1.0, 0.0, false, 0.65, 0.14, [
    { kind: 'arp', type: 'triangle', notes: [660, 990, 1320], stepSec: 0.04, dur: 0.08, gain: 0.85 },
  ]),
  reload_done: makeDef(2, 120, 0.98, 1.02, 0.03, true, 0.55, 0.09, [
    { kind: 'osc', type: 'triangle', f0: 440, f1: 880, dur: 0.08, gain: 0.75 },
    { kind: 'nz', dur: 0.04, filterType: 'highpass', freq: 2400, q: 1.8, gain: 0.6 },
  ]),
  empty_click: makeDef(1, 120, 0.98, 1.02, 0.03, false, 0.45, 0.04, [
    { kind: 'osc', type: 'square', f0: 950, f1: 620, dur: 0.03, gain: 0.7 },
  ]),
  shell_casing: makeDef(0, 50, 0.88, 1.16, 0.12, true, 0.24, 0.1, [
    { kind: 'osc', type: 'sine', f0: 3200, f1: 2400, dur: 0.045, gain: 0.6 },
    { kind: 'osc', type: 'sine', f0: 3800, f1: 2900, dur: 0.035, delay: 0.055, gain: 0.4 },
  ]),
  weapon_swap: makeDef(1, 80, 0.96, 1.04, 0.04, false, 0.48, 0.06, [
    { kind: 'nz', dur: 0.05, filterType: 'highpass', freq: 1600, q: 1.4, gain: 0.65 },
    { kind: 'osc', type: 'triangle', f0: 320, f1: 480, dur: 0.05, gain: 0.6 },
  ]),

  // Hits & Status
  hit_flesh: makeDef(1, 40, 0.9, 1.12, 0.08, true, 0.48, 0.06, [
    { kind: 'nz', dur: 0.055, filterType: 'bandpass', freq: 950, q: 1.4, gain: 0.8 },
    { kind: 'osc', type: 'sine', f0: 180, f1: 80, dur: 0.05, gain: 0.7 },
  ]),
  hit_armor: makeDef(1, 45, 0.92, 1.1, 0.06, true, 0.52, 0.07, [
    { kind: 'osc', type: 'triangle', f0: 1100, f1: 620, dur: 0.065, gain: 0.75 },
    { kind: 'nz', dur: 0.04, filterType: 'bandpass', freq: 2400, q: 2.2, gain: 0.65 },
  ]),
  hit_crit: makeDef(2, 50, 0.96, 1.04, 0.04, true, 0.64, 0.09, [
    { kind: 'osc', type: 'triangle', f0: 1480, f1: 920, dur: 0.08, gain: 0.85 },
    { kind: 'osc', type: 'sine', f0: 2200, f1: 1500, dur: 0.06, gain: 0.6 },
  ]),
  shield_break: makeDef(2, 80, 0.95, 1.05, 0.05, true, 0.68, 0.18, [
    { kind: 'nz', dur: 0.18, filterType: 'highpass', freq: 1800, q: 1.4, gain: 0.8 },
    { kind: 'arp', type: 'triangle', notes: [1600, 1100, 720], stepSec: 0.04, dur: 0.06, gain: 0.75 },
  ]),
  stun_flash: makeDef(2, 90, 0.95, 1.05, 0.05, true, 0.72, 0.22, [
    { kind: 'osc', type: 'sine', f0: 2400, f1: 900, dur: 0.22, gain: 0.85 },
    { kind: 'nz', dur: 0.18, filterType: 'highpass', freq: 2400, q: 1.5, gain: 0.75 },
  ]),
  bomb_throw: makeDef(1, 90, 0.94, 1.06, 0.05, true, 0.48, 0.11, [
    { kind: 'osc', type: 'sine', f0: 280, f1: 460, dur: 0.1, gain: 0.75 },
    { kind: 'nz', dur: 0.07, filterType: 'bandpass', freq: 900, q: 1.2, gain: 0.55 },
  ]),
  bomb_bounce: makeDef(0, 70, 0.92, 1.08, 0.06, true, 0.42, 0.05, [
    { kind: 'osc', type: 'triangle', f0: 220, f1: 140, dur: 0.045, gain: 0.75 },
  ]),
  explosion_sm: makeDef(2, 60, 0.93, 1.07, 0.06, true, 0.72, 0.24, [
    { kind: 'osc', type: 'sine', f0: 150, f1: 36, dur: 0.22, gain: 0.9 },
    { kind: 'nz', dur: 0.22, filterType: 'lowpass', freq: 1000, q: 0.8, gain: 0.9 },
  ]),
  explosion_lg: makeDef(3, 70, 0.94, 1.04, 0.05, true, 0.92, 0.4, [
    { kind: 'osc', type: 'sine', f0: 120, f1: 28, dur: 0.36, gain: 0.95 },
    { kind: 'nz', dur: 0.38, filterType: 'lowpass', freq: 850, q: 0.7, gain: 0.95 },
  ]),
  crate_break: makeDef(1, 70, 0.92, 1.08, 0.06, true, 0.6, 0.15, [
    { kind: 'nz', dur: 0.14, filterType: 'lowpass', freq: 1200, q: 1.0, gain: 0.85 },
    { kind: 'osc', type: 'triangle', f0: 260, f1: 90, dur: 0.1, gain: 0.7 },
  ]),

  // Movement / Gadgets / Pickups / Players
  dash: makeDef(1, 120, 0.94, 1.06, 0.05, true, 0.52, 0.12, [
    { kind: 'nz', dur: 0.11, filterType: 'bandpass', freq: 1400, q: 1.1, gain: 0.85 },
    { kind: 'osc', type: 'sine', f0: 320, f1: 160, dur: 0.09, gain: 0.5 },
  ]),
  turret_deploy: makeDef(2, 120, 0.97, 1.03, 0.03, true, 0.62, 0.16, [
    { kind: 'arp', type: 'square', notes: [330, 440, 660], stepSec: 0.045, dur: 0.07, gain: 0.7 },
  ]),
  heal_orb: makeDef(2, 70, 0.96, 1.05, 0.04, true, 0.52, 0.22, [
    { kind: 'arp', type: 'sine', notes: [523, 659, 784, 1046], stepSec: 0.045, dur: 0.09, gain: 0.8 },
  ]),
  energy_orb: makeDef(2, 65, 0.96, 1.06, 0.04, true, 0.5, 0.14, [
    { kind: 'arp', type: 'sine', notes: [659, 987], stepSec: 0.045, dur: 0.07, gain: 0.8 },
  ]),
  pickup_coin: makeDef(1, 45, 0.95, 1.08, 0.05, true, 0.48, 0.12, [
    { kind: 'arp', type: 'sine', notes: [988, 1319], stepSec: 0.04, dur: 0.07, gain: 0.8 },
  ]),
  pickup_hp: makeDef(2, 70, 0.97, 1.04, 0.04, true, 0.56, 0.18, [
    { kind: 'arp', type: 'triangle', notes: [523, 659, 784], stepSec: 0.045, dur: 0.08, gain: 0.8 },
  ]),
  pickup_weapon: makeDef(2, 100, 1.0, 1.0, 0.0, false, 0.62, 0.2, [
    { kind: 'arp', type: 'triangle', notes: [392, 523, 659, 784], stepSec: 0.04, dur: 0.08, gain: 0.85 },
  ]),
  perk_pick: makeDef(2, 100, 1.0, 1.0, 0.0, false, 0.65, 0.22, [
    { kind: 'arp', type: 'sine', notes: [587, 740, 880, 1175], stepSec: 0.045, dur: 0.1, gain: 0.85 },
  ]),
  player_hurt: makeDef(2, 90, 0.94, 1.06, 0.05, true, 0.66, 0.13, [
    { kind: 'osc', type: 'sawtooth', f0: 210, f1: 95, dur: 0.12, gain: 0.75 },
    { kind: 'nz', dur: 0.09, filterType: 'bandpass', freq: 700, q: 1.2, gain: 0.65 },
  ]),
  player_down: makeDef(3, 250, 1.0, 1.0, 0.0, true, 0.85, 0.36, [
    { kind: 'osc', type: 'sawtooth', f0: 330, f1: 110, dur: 0.34, gain: 0.8 },
    { kind: 'nz', dur: 0.16, filterType: 'lowpass', freq: 600, q: 1.0, gain: 0.6 },
  ]),
  revive_tick: makeDef(1, 140, 0.97, 1.03, 0.03, true, 0.45, 0.07, [
    { kind: 'osc', type: 'sine', f0: 520, f1: 640, dur: 0.06, gain: 0.75 },
  ]),
  revive_done: makeDef(3, 200, 1.0, 1.0, 0.0, true, 0.72, 0.25, [
    { kind: 'arp', type: 'sine', notes: [523, 659, 784, 1046], stepSec: 0.05, dur: 0.12, gain: 0.85 },
  ]),

  // Enemies & Bosses
  mob_spawn: makeDef(0, 120, 0.92, 1.08, 0.06, true, 0.35, 0.15, [
    { kind: 'osc', type: 'sine', f0: 160, f1: 380, dur: 0.14, gain: 0.7 },
  ]),
  mob_die: makeDef(1, 50, 0.9, 1.12, 0.08, true, 0.55, 0.15, [
    { kind: 'osc', type: 'sawtooth', f0: 280, f1: 80, dur: 0.14, gain: 0.7 },
    { kind: 'nz', dur: 0.09, filterType: 'bandpass', freq: 800, q: 1.2, gain: 0.75 },
  ]),
  sniper_lock: makeDef(2, 180, 0.98, 1.02, 0.03, true, 0.56, 0.12, [
    { kind: 'arp', type: 'sine', notes: [1480, 1760], stepSec: 0.05, dur: 0.06, gain: 0.8 },
  ]),
  boss_roar: makeDef(3, 500, 0.95, 1.02, 0.03, true, 0.95, 0.46, [
    { kind: 'osc', type: 'sawtooth', f0: 140, f1: 55, dur: 0.45, gain: 0.85 },
    { kind: 'nz', dur: 0.38, filterType: 'lowpass', freq: 550, q: 1.2, gain: 0.9 },
  ]),
  boss_slam: makeDef(3, 250, 0.94, 1.04, 0.04, true, 0.9, 0.36, [
    { kind: 'osc', type: 'sine', f0: 110, f1: 30, dur: 0.34, gain: 0.95 },
    { kind: 'nz', dur: 0.28, filterType: 'lowpass', freq: 700, q: 0.8, gain: 0.9 },
  ]),
  boss_laser: makeDef(3, 200, 0.97, 1.03, 0.03, true, 0.82, 0.34, [
    { kind: 'osc', type: 'sawtooth', f0: 880, f1: 320, dur: 0.32, gain: 0.75 },
    { kind: 'nz', dur: 0.24, filterType: 'bandpass', freq: 2200, q: 1.8, gain: 0.7 },
  ]),
  boss_emp: makeDef(3, 200, 0.97, 1.03, 0.03, true, 0.8, 0.32, [
    { kind: 'osc', type: 'sine', f0: 1800, f1: 160, dur: 0.3, gain: 0.8 },
    { kind: 'nz', dur: 0.22, filterType: 'bandpass', freq: 1400, q: 1.5, gain: 0.7 },
  ]),

  // UI / Stingers / Pings
  ui_click: makeDef(1, 35, 0.98, 1.03, 0.03, false, 0.45, 0.04, [
    { kind: 'osc', type: 'sine', f0: 880, f1: 1120, dur: 0.035, gain: 0.8 },
  ]),
  ui_deny: makeDef(1, 80, 1.0, 1.0, 0.0, false, 0.5, 0.1, [
    { kind: 'osc', type: 'square', f0: 220, f1: 165, dur: 0.09, gain: 0.7 },
  ]),
  ping: makeDef(2, 200, 1.0, 1.0, 0.0, true, 0.62, 0.15, [
    { kind: 'arp', type: 'sine', notes: [880, 1320], stepSec: 0.06, dur: 0.09, gain: 0.85 },
  ]),
  wave_start: makeDef(3, 400, 1.0, 1.0, 0.0, false, 0.75, 0.3, [
    { kind: 'arp', type: 'triangle', notes: [330, 440, 660], stepSec: 0.08, dur: 0.15, gain: 0.85 },
  ]),
  wave_clear: makeDef(3, 400, 1.0, 1.0, 0.0, false, 0.75, 0.34, [
    { kind: 'arp', type: 'triangle', notes: [523, 659, 784, 1046], stepSec: 0.07, dur: 0.14, gain: 0.85 },
  ]),
  win: makeDef(3, 500, 1.0, 1.0, 0.0, false, 0.85, 0.55, [
    { kind: 'arp', type: 'triangle', notes: [523, 659, 784, 1046, 1318], stepSec: 0.09, dur: 0.22, gain: 0.9 },
  ]),
  lose: makeDef(3, 500, 1.0, 1.0, 0.0, false, 0.85, 0.6, [
    { kind: 'arp', type: 'sawtooth', notes: [392, 349, 311, 261], stepSec: 0.13, dur: 0.24, gain: 0.75 },
  ]),
};

/**
 * Maps all 231 SFX manifest keys + server alias keys to their canonical
 * spec + synth recipe so every key works synchronously before/without network I/O.
 */
const SFX_SYNTH_ALIAS: Record<string, string> = {
  gun_pistol: 'shot_pistol',
  gun_rifle: 'shot_rifle',
  gun_smg: 'shot_smg',
  gun_shotgun: 'shot_shotgun',
  gun_bazooka: 'shot_rocket',
  gun_plasma: 'shot_laser',
  wpn_plasma_fire: 'shot_laser',
  wpn_rail_fire: 'gun_railgun',
  wpn_lightning_cast: 'magic_lightning',
  wpn_arcane_cast: 'magic_arcane',
  sfx_pistol_fire: 'shot_pistol',
  sfx_rifle_fire: 'shot_rifle',
  sfx_smg_fire: 'shot_smg',
  sfx_shotgun_fire: 'shot_shotgun',
  sfx_gl_fire: 'gun_grenade',
  sfx_bazooka_fire: 'shot_rocket',
  sfx_stun_fire: 'gun_concussion',
  sfx_stun_burst: 'stun_flash',
  sfx_boom_heavy: 'explosion_lg',
  sfx_reload_kinetic: 'reload_active_hit',
  sfx_mine_deploy: 'mine_arm',
  sfx_mine_beep: 'mine_arm',
  fx_plasma_spark: 'shot_laser',
  fx_thunder_arc: 'magic_lightning',
  fx_fireball_boom: 'explosion_sm',
  sfx_melee_crescent: 'melee_slash',
  sfx_melee_scythe: 'melee_slash',
  sfx_melee_baton: 'melee_shock',
  sfx_bullet_slice: 'melee_deflect',
  sfx_shock_zap: 'melee_shock',
  sfx_stun_zap: 'melee_shock',
  sfx_pickup_hp: 'pickup_hp',
  sfx_pickup_energy: 'energy_orb',
  sfx_pickup_armor: 'energy_orb',
  sfx_pickup_coin: 'pickup_coin',
  sfx_pedestal_swap: 'pickup_weapon',
  sfx_perk_pick: 'perk_pick',
  pickup_orb: 'energy_orb',
  pickup_perk: 'perk_pick',
  heal_pulse: 'heal_orb',
  explode_mini: 'explosion_sm',
  explode_he: 'explosion_lg',
  expl_bomb_1: 'explosion_lg',
  expl_bomb_2: 'explosion_lg',
  expl_chunky: 'explosion_lg',
  expl_grenade_1: 'explosion_lg',
  expl_grenade_2: 'explosion_lg',
  expl_heavy_wav: 'explosion_lg',
  expl_retro: 'explosion_sm',
  expl_scifi: 'explosion_sm',
  gadget_throw: 'bomb_throw',
  gadget_stun_pop: 'stun_flash',
  gadget_cluster_boom: 'explosion_lg',
  gadget_turret_deploy: 'turret_deploy',
  gadget_turret_shot: 'turret_shot',
  gadget_turret_thunder: 'magic_lightning',
  gadget_drone_deploy: 'heal_orb',
  gadget_drone_pulse: 'heal_orb',
  dry_fire: 'empty_click',
  sfx_dry_fire: 'empty_click',
  sfx_wpn_dryfire: 'empty_click',
  reload_active: 'reload_active_hit',
  sfx_reload_start: 'reload_start',
  sfx_reload_perfect: 'reload_active_hit',
  sfx_reload_done: 'reload_done',
  sfx_reload_jam: 'ui_deny',
  enemy_die: 'mob_die',
  mob_kill: 'mob_die',
  mob_hurt: 'player_hurt',
  sfx_miragine_dead_1: 'mob_die',
  sfx_miragine_dead_2: 'mob_die',
  sfx_miragine_dead_3: 'mob_die',
  sfx_miragine_dead_4: 'mob_die',
  sfx_miragine_dead_5: 'mob_die',
  sfx_miragine_dead_6: 'mob_die',
  boss_beam: 'boss_laser',
  boss_beam_charge: 'boss_laser',
  boss_beam_loop: 'boss_laser',
  sfx_laser_beam: 'boss_laser',
  sfx_laser_charge: 'boss_laser',
  sfx_laser_telegraph: 'sniper_lock',
  boss_alarm: 'sniper_lock',
  boss_charge_horn: 'boss_roar',
  boss_roar_1: 'boss_roar',
  boss_roar_2: 'boss_roar',
  boss_roar_beast: 'boss_roar',
  boss_roar_cactus: 'boss_roar',
  boss_roar_deep: 'boss_roar',
  boss_roar_retro: 'boss_roar',
  sfx_boss_overlord_spawn: 'boss_roar',
  boss_growl: 'boss_slam',
  boss_slam_impact: 'boss_slam',
  boss_wall_crash: 'boss_slam',
  boss_volley_fire: 'shot_shotgun',
  boss_death_shatter: 'explosion_lg',
  boss_death: 'explosion_lg',
  boss_overheat_hiss: 'boss_emp',
  sfx_emp_charge: 'boss_emp',
  sfx_emp_pulse: 'boss_emp',
  sfx_boss_spiral_tick: 'turret_shot',
  boss_bolt: 'turret_shot',
  boss_cleave: 'melee_slash',
  mortar_launch: 'gun_grenade',
  mortar_explode: 'explosion_lg',
  shield_up: 'shield_break',
  shield_shatter: 'shield_break',
  sfx_weakpoint_break: 'shield_break',
  crit_hit: 'hit_crit',
  dash_blink: 'dash',
  dash_whoosh: 'dash',
  dash_swipe: 'melee_slash',
  hit_arcade: 'hit_flesh',
  hit_flesh_1: 'hit_flesh',
  hit_flesh_2: 'hit_flesh',
  hit_plate: 'melee_deflect',
  sfx_crate_break: 'crate_break',
  sfx_crate_hit: 'hit_armor',
  sfx_downed: 'player_down',
  sfx_energy_orb: 'energy_orb',
  sfx_flashbang: 'stun_flash',
  sfx_fx_explosion: 'explosion_lg',
  sfx_fx_stun_flash: 'stun_flash',
  sfx_revive_done: 'revive_done',
  sfx_revive_tick: 'revive_tick',
  sfx_ui_revive: 'revive_done',
  sfx_wpn_casing: 'shell_casing',
  sfx_wpn_casing_shotgun: 'shell_casing',
  sfx_wpn_casing_spin: 'shell_casing',
  sfx_wpn_casing_v2: 'shell_casing',
  sfx_wpn_casing_v3: 'shell_casing',
  sfx_wpn_shell_eject: 'shell_casing',
  sfx_wpn_cock_shotgun: 'reload_done',
  sfx_wpn_mag_insert: 'reload_start',
  sfx_wpn_rack_rifle: 'reload_active_hit',
  sfx_wpn_reload: 'reload_done',
  sfx_wpn_reload_pistol: 'reload_done',
  sfx_wpn_reload_rifle: 'reload_done',
  sfx_wpn_reload_shotgun: 'reload_start',
  sfx_wpn_laser: 'shot_laser',
  sfx_wpn_laser_retro: 'shot_laser',
  sfx_wpn_laser_v2: 'shot_laser',
  sfx_wpn_laser_arc: 'magic_lightning',
  sfx_wpn_pistol: 'shot_pistol',
  sfx_wpn_pistol_arcade: 'shot_pistol',
  sfx_wpn_pistol_v2: 'shot_pistol',
  sfx_wpn_pistol_v3: 'shot_pistol',
  sfx_wpn_revolver: 'shot_pistol',
  sfx_wpn_western_gun: 'shot_pistol',
  sfx_wpn_plasma: 'shot_laser',
  sfx_wpn_railgun: 'gun_railgun',
  sfx_wpn_rifle: 'shot_rifle',
  sfx_wpn_rifle_v2: 'shot_rifle',
  sfx_wpn_rifle_v3: 'shot_rifle',
  sfx_wpn_shotgun: 'shot_shotgun',
  sfx_wpn_shotgun_v2: 'shot_shotgun',
  sfx_wpn_shotgun_v3: 'shot_shotgun',
  sfx_wpn_smg: 'shot_smg',
  sfx_wpn_smg_v2: 'shot_smg',
  stinger_bleedout: 'player_down',
  stinger_boss: 'boss_roar',
  stinger_lose: 'lose',
  stinger_wave: 'wave_start',
  stinger_win: 'win',
  stun_bang_1: 'stun_flash',
  stun_bang_2: 'stun_flash',
  stun_down: 'boss_emp',
  stun_emp_zap: 'boss_emp',
  stun_elec_arc: 'melee_shock',
  stun_loop: 'stun_flash',
  ping_coop: 'ping',
  match_win: 'win',
  match_lose: 'lose',
  ui_back: 'ui_click',
  ui_select: 'ui_click',
  ui_confirm: 'revive_done',
  ui_glitch: 'ping',
  shot_elec: 'magic_lightning',
  hero_skill_activate: 'boss_emp',
  boss_part_break: 'shield_break',
};

const BGM_KEY_ALIAS: Record<string, string> = {
  menu: 'bgm_menu',
  combat: 'bgm_combat',
  boss: 'bgm_boss',
  victory: 'bgm_victory',
  defeat: 'bgm_defeat',
  bgm_menu: 'bgm_menu',
  bgm_combat: 'bgm_combat',
  bgm_boss: 'bgm_boss',
  bgm_victory: 'bgm_victory',
  bgm_defeat: 'bgm_defeat',
  bgm_lobby: 'bgm_lobby',
  bgm_lobby_alt: 'bgm_lobby_alt',
  bgm_desert: 'bgm_desert',
  bgm_desert_chiptune: 'bgm_desert_chiptune',
  bgm_crypt: 'bgm_crypt',
  bgm_crypt_alt: 'bgm_crypt_alt',
  bgm_cyber: 'bgm_cyber',
  bgm_cyber_nes: 'bgm_cyber_nes',
  bgm_boss_chiptune: 'bgm_boss_chiptune',
  bgm_boss_epic: 'bgm_boss_epic',
  bgm_boss_nes: 'bgm_boss_nes',
  bgm_boss_rpg: 'bgm_boss_rpg',
};

const BGM_FALLBACK_PATHS: Record<string, { paths: readonly string[]; gain: number }> = {
  bgm_menu: { paths: ['audio/bgm/bgm_lobby.ogg', 'audio/bgm/bgm_lobby.wav'], gain: 0.36 },
  bgm_lobby: { paths: ['audio/bgm/bgm_lobby.ogg', 'audio/bgm/bgm_lobby.wav'], gain: 0.36 },
  bgm_lobby_alt: { paths: ['audio/bgm/bgm_lobby_alt.mp3', 'audio/bgm/bgm_lobby_alt.wav'], gain: 0.36 },
  bgm_combat: { paths: ['audio/bgm/bgm_desert.ogg', 'audio/bgm/bgm_desert.wav'], gain: 0.34 },
  bgm_desert: { paths: ['audio/bgm/bgm_desert.ogg', 'audio/bgm/bgm_desert.wav'], gain: 0.34 },
  bgm_desert_chiptune: { paths: ['audio/bgm/bgm_desert_chiptune.ogg', 'audio/bgm/bgm_desert_chiptune.wav'], gain: 0.34 },
  bgm_crypt: { paths: ['audio/bgm/bgm_crypt.mp3', 'audio/bgm/bgm_crypt.wav'], gain: 0.34 },
  bgm_crypt_alt: { paths: ['audio/bgm/bgm_crypt_alt.ogg', 'audio/bgm/bgm_crypt_alt.wav'], gain: 0.34 },
  bgm_cyber: { paths: ['audio/bgm/bgm_cyber.mp3', 'audio/bgm/bgm_cyber.wav'], gain: 0.34 },
  bgm_cyber_nes: { paths: ['audio/bgm/bgm_cyber_nes.ogg', 'audio/bgm/bgm_cyber_nes.wav'], gain: 0.34 },
  bgm_boss: { paths: ['audio/bgm/bgm_boss_chiptune.ogg', 'audio/bgm/bgm_boss_chiptune.wav'], gain: 0.4 },
  bgm_boss_chiptune: { paths: ['audio/bgm/bgm_boss_chiptune.ogg', 'audio/bgm/bgm_boss_chiptune.wav'], gain: 0.4 },
  bgm_boss_epic: { paths: ['audio/bgm/bgm_boss_epic.ogg', 'audio/bgm/bgm_boss_epic.wav'], gain: 0.4 },
  bgm_boss_nes: { paths: ['audio/bgm/bgm_boss_nes.ogg', 'audio/bgm/bgm_boss_nes.wav'], gain: 0.4 },
  bgm_boss_rpg: { paths: ['audio/bgm/bgm_boss_rpg.ogg', 'audio/bgm/bgm_boss_rpg.wav'], gain: 0.4 },
  bgm_victory: { paths: ['audio/bgm/bgm_victory.mp3', 'audio/bgm/bgm_victory.wav'], gain: 0.36 },
  bgm_defeat: { paths: ['audio/bgm/bgm_defeat.wav'], gain: 0.34 },
};

// ─── Module Audio Graph & State ─────────────────────────────────────────────

interface ActiveVoice {
  id: string;
  priority: 0 | 1 | 2 | 3;
  startMs: number;
  endMs: number;
  gainScore: number;
  voiceGain: GainNode;
  sources: AudioScheduledSourceNode[];
}

interface BgmDeck {
  el: HTMLAudioElement | null;
  mediaSource: MediaElementAudioSourceNode | null;
  gainNode: GainNode | null;
  targetGain: number;
}

const wiredMediaElements = new WeakSet<HTMLAudioElement>();
const whiteNoiseByCtx = new WeakMap<AudioContext, AudioBuffer>();

let initialized = false;
let prefs: BansungAudioPrefs = loadPrefs();
let listenerX = 0;
let listenerY = 0;

// WebAudio graph nodes
let ctxRef: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let limiterNode: DynamicsCompressorNode | null = null;
let sfxMasterGain: GainNode | null = null;
let bgmMasterGain: GainNode | null = null;
let masterGain: GainNode | null = null;

// Voices & throttling
const activeVoices: ActiveVoice[] = [];
const lastPlayedMs = new Map<string, number>();
const lastVariationUrlBySfx = new Map<string, string>();

// Manifest & buffer decode caches
const manifestMap = new Map<string, AudioManifestEntry>();
let manifestLoadPromise: Promise<void> | null = null;
let manifestLoaded = false;

const bufferCache = new Map<string, AudioBuffer>();
const inflightDecodes = new Map<string, Promise<AudioBuffer | null>>();
const failedUrls = new Set<string>();
const decodeQueue: Array<() => void> = [];
let activeDecodeCount = 0;

// Dual-deck BGM state
const bgmDecks: [BgmDeck, BgmDeck] = [
  { el: null, mediaSource: null, gainNode: null, targetGain: 0 },
  { el: null, mediaSource: null, gainNode: null, targetGain: 0 },
];
let activeDeckIdx: 0 | 1 = 0;
let currentBgmKey: string | null = null;
let currentBgmBiome: BansungBiome | undefined;
let bgmFadeStopTimer: ReturnType<typeof setTimeout> | null = null;
let bgmDuckTimer: ReturnType<typeof setTimeout> | null = null;
let pendingBgmTrack: { track: BansungBgmId; biome?: BansungBiome } | null = null;
let unlockListenerAttached = false;

// Recent local echo window for fallback matching when caller omits explicit localActorId
let lastLocalShot: { idx: number; ts: number } | null = null;
let lastLocalStatus: { kind: number; ts: number } | null = null;

// ─── Preference Persistence ─────────────────────────────────────────────────

function clamp01(v: number, fallback: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

function loadPrefs(): BansungAudioPrefs {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<BansungAudioPrefs>;
    return {
      master: clamp01(Number(parsed.master), DEFAULT_PREFS.master),
      sfx: clamp01(Number(parsed.sfx), DEFAULT_PREFS.sfx),
      bgm: clamp01(Number(parsed.bgm), DEFAULT_PREFS.bgm),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(next: BansungAudioPrefs): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage errors (private browsing / quota / SSR)
  }
}

export function getAudioPrefs(): BansungAudioPrefs {
  return { ...prefs };
}

export function setAudioPrefs(patch: Partial<BansungAudioPrefs>): BansungAudioPrefs {
  prefs = {
    master: patch.master !== undefined ? clamp01(patch.master, prefs.master) : prefs.master,
    sfx: patch.sfx !== undefined ? clamp01(patch.sfx, prefs.sfx) : prefs.sfx,
    bgm: patch.bgm !== undefined ? clamp01(patch.bgm, prefs.bgm) : prefs.bgm,
  };
  savePrefs(prefs);
  applyBusVolumes();
  return getAudioPrefs();
}

// ─── WebAudio Helpers & Graph Construction ──────────────────────────────────

function safeParamSet(param: AudioParam, value: number, now: number, tc = 0.015): void {
  try {
    if (typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(value, now, tc);
      return;
    }
  } catch {
    // Fall through to direct assignment
  }
  param.value = value;
}

function safeParamRamp(param: AudioParam, value: number, endTime: number, exp = false): void {
  try {
    if (exp && value > 0 && typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(value, endTime);
      return;
    }
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(value, endTime);
      return;
    }
  } catch {
    // Fall through to direct assignment
  }
  param.value = value;
}

function getWhiteNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
  const cached = whiteNoiseByCtx.get(ctx);
  if (cached) return cached;
  try {
    const rate = ctx.sampleRate || 44100;
    const len = Math.max(1, Math.floor(rate));
    const buf = ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    whiteNoiseByCtx.set(ctx, buf);
    return buf;
  } catch {
    return null;
  }
}

function ensureGraph(): AudioContext | null {
  let ctx: AudioContext;
  try {
    ctx = audioCtx();
  } catch {
    return null;
  }
  if (!ctx) return null;

  if (ctxRef === ctx && masterGain && sfxBus && sfxMasterGain && bgmMasterGain) {
    return ctx;
  }

  ctxRef = ctx;
  masterGain = ctx.createGain();
  sfxMasterGain = ctx.createGain();
  bgmMasterGain = ctx.createGain();
  sfxBus = ctx.createGain();

  if (typeof ctx.createDynamicsCompressor === 'function') {
    limiterNode = ctx.createDynamicsCompressor();
    limiterNode.threshold.value = LIMITER_THRESHOLD_DB;
    limiterNode.knee.value = LIMITER_KNEE_DB;
    limiterNode.ratio.value = LIMITER_RATIO;
    limiterNode.attack.value = LIMITER_ATTACK_SEC;
    limiterNode.release.value = LIMITER_RELEASE_SEC;
    sfxBus.connect(limiterNode);
    limiterNode.connect(sfxMasterGain);
  } else {
    limiterNode = null;
    sfxBus.connect(sfxMasterGain);
  }

  sfxMasterGain.connect(masterGain);
  bgmMasterGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Create/re-bind per-deck gain nodes on the new context
  for (let i = 0; i < 2; i++) {
    const deck = bgmDecks[i];
    deck.gainNode = ctx.createGain();
    deck.gainNode.gain.value = deck.targetGain;
    deck.gainNode.connect(bgmMasterGain);
    if (deck.el && !deck.mediaSource && !wiredMediaElements.has(deck.el) && typeof ctx.createMediaElementSource === 'function') {
      try {
        deck.mediaSource = ctx.createMediaElementSource(deck.el);
        deck.mediaSource.connect(deck.gainNode);
        wiredMediaElements.add(deck.el);
      } catch {
        deck.mediaSource = null;
      }
    }
  }

  applyBusVolumes();
  return ctx;
}

function applyBusVolumes(): void {
  const muted = isMuted();
  const ctx = ctxRef;
  const now = ctx ? ctx.currentTime : 0;

  if (masterGain) {
    safeParamSet(masterGain.gain, muted ? 0 : prefs.master, now, 0.015);
  }
  if (sfxMasterGain) {
    safeParamSet(sfxMasterGain.gain, prefs.sfx, now, 0.015);
  }
  if (bgmMasterGain && !bgmDuckTimer) {
    safeParamSet(bgmMasterGain.gain, prefs.bgm, now, 0.02);
  }

  for (const deck of bgmDecks) {
    if (!deck.el) continue;
    deck.el.muted = muted;
    if (!deck.mediaSource) {
      deck.el.volume = muted ? 0 : Math.max(0, Math.min(1, deck.targetGain * prefs.bgm * prefs.master));
    }
  }
}

/**
 * Syncs the Bansung audio graph and active BGM elements with global `isMuted()`.
 */
export function syncBansungMute(): void {
  applyBusVolumes();
  if (!isMuted() && pendingBgmTrack) {
    const pending = pendingBgmTrack;
    pendingBgmTrack = null;
    setBansungBgm(pending.track, undefined, pending.biome);
  }
}

// ─── Autoplay Unlock ────────────────────────────────────────────────────────

function attachAutoplayUnlock(): void {
  if (unlockListenerAttached || typeof window === 'undefined') return;
  unlockListenerAttached = true;

  const unlock = () => {
    unlockListenerAttached = false;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    if (isMuted()) return;
    try {
      const ctx = audioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore
    }
    const activeDeck = bgmDecks[activeDeckIdx];
    if (activeDeck.el && activeDeck.el.paused && currentBgmKey) {
      void Promise.resolve(activeDeck.el.play()).catch(() => {});
    }
    if (pendingBgmTrack) {
      const next = pendingBgmTrack;
      pendingBgmTrack = null;
      setBansungBgm(next.track, 0.25, next.biome);
    }
  };

  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true, passive: true });
}

// ─── Spec & Key Resolution ──────────────────────────────────────────────────

function resolveCanonicalKey(id: string): string {
  if (CANONICAL_DEFS[id]) return id;
  const manifestAlias = manifestMap.get(id)?.synthFallback;
  if (manifestAlias && CANONICAL_DEFS[manifestAlias]) return manifestAlias;
  const staticAlias = SFX_SYNTH_ALIAS[id];
  if (staticAlias && CANONICAL_DEFS[staticAlias]) return staticAlias;
  if (staticAlias && SFX_SYNTH_ALIAS[staticAlias] && CANONICAL_DEFS[SFX_SYNTH_ALIAS[staticAlias]]) {
    return SFX_SYNTH_ALIAS[staticAlias];
  }
  return 'ui_click';
}

/**
 * Returns the resolved SfxSpec (mixing manifest gain if hydrated) for any SFX ID.
 */
export function getSfxSpec(id: BansungSfxId): SfxSpec {
  const canonical = resolveCanonicalKey(id);
  const def = CANONICAL_DEFS[canonical] ?? CANONICAL_DEFS.ui_click;
  const entry = manifestMap.get(id);
  if (entry && Number.isFinite(entry.gain) && entry.gain > 0) {
    return { ...def.spec, baseVol: Math.min(1, entry.gain) };
  }
  return def.spec;
}

/**
 * Returns true if `id` is known natively or in the loaded manifest.
 */
export function hasBansungAudioKey(id: string): boolean {
  return Boolean(CANONICAL_DEFS[id] || SFX_SYNTH_ALIAS[id] || BGM_KEY_ALIAS[id] || manifestMap.has(id));
}

// ─── Spatial Math ───────────────────────────────────────────────────────────

export function setListenerPos(x: number, y: number): void {
  if (Number.isFinite(x)) listenerX = x;
  if (Number.isFinite(y)) listenerY = y;
}

export function getListenerPos(): { x: number; y: number } {
  return { x: listenerX, y: listenerY };
}

/**
 * Computes clamped stereo pan (`520px`, `[-0.92, 0.92]`) and quadratic rolloff (`140..1100px`).
 */
export function computeSpatialParams(
  x: number | undefined,
  y: number | undefined,
  spatial: boolean,
  local?: boolean,
): { culled: boolean; pan: number; distGain: number } {
  if (!spatial || local || x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { culled: false, pan: 0, distGain: 1 };
  }
  const dx = x - listenerX;
  const dy = y - listenerY;
  const dist = Math.hypot(dx, dy);
  if (dist >= HEAR_RADIUS_PX) {
    return { culled: true, pan: 0, distGain: 0 };
  }
  const pan = Math.max(-MAX_PAN_ABS, Math.min(MAX_PAN_ABS, dx / PAN_RANGE_PX));
  let distGain = 1;
  if (dist > FULL_VOL_RADIUS_PX) {
    const t = Math.max(0, Math.min(1, (dist - FULL_VOL_RADIUS_PX) / (HEAR_RADIUS_PX - FULL_VOL_RADIUS_PX)));
    distGain = (1 - t) * (1 - t);
  }
  return { culled: false, pan, distGain };
}

// ─── 8-Voice Priority Stealing ──────────────────────────────────────────────

function pruneExpiredVoices(nowMs: number): void {
  for (let i = activeVoices.length - 1; i >= 0; i--) {
    if (nowMs >= activeVoices[i].endMs) {
      activeVoices.splice(i, 1);
    }
  }
}

function stealOrRejectVoice(ctx: AudioContext, priority: 0 | 1 | 2 | 3, incomingGain: number): boolean {
  if (activeVoices.length < MAX_SFX_VOICES) return true;

  let victimIdx = 0;
  for (let i = 1; i < activeVoices.length; i++) {
    const v = activeVoices[i];
    const best = activeVoices[victimIdx];
    if (
      v.priority < best.priority ||
      (v.priority === best.priority && (v.gainScore < best.gainScore || (v.gainScore === best.gainScore && v.startMs < best.startMs)))
    ) {
      victimIdx = i;
    }
  }

  const victim = activeVoices[victimIdx];
  if (priority < victim.priority || (priority === victim.priority && incomingGain < victim.gainScore * 0.7)) {
    return false;
  }

  const t = ctx.currentTime;
  try {
    if (typeof victim.voiceGain.gain.cancelScheduledValues === 'function') {
      victim.voiceGain.gain.cancelScheduledValues(t);
    }
    victim.voiceGain.gain.setValueAtTime(Math.max(0.0001, victim.voiceGain.gain.value || victim.gainScore), t);
    safeParamRamp(victim.voiceGain.gain, 0.0001, t + STEAL_FADE_SEC, true);
  } catch {
    // Ignore mock param edge cases
  }

  for (const src of victim.sources) {
    try {
      src.stop(t + STEAL_FADE_SEC + 0.003);
    } catch {
      // Already stopped
    }
  }

  activeVoices.splice(victimIdx, 1);
  return true;
}

// ─── Procedural WebAudio Synth Renderer ─────────────────────────────────────

function runSynthStep(
  ctx: AudioContext,
  dest: AudioNode,
  step: SynthStep,
  pitchRate: number,
  t0: number,
  noiseBuf: AudioBuffer | null,
  sources: AudioScheduledSourceNode[],
): void {
  const start = t0 + (step.delay ?? 0);
  const stepGain = step.gain ?? 0.8;

  if (step.kind === 'osc') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = step.type;
    const f0 = Math.max(20, step.f0 * pitchRate);
    const f1 = Math.max(20, step.f1 * pitchRate);
    osc.frequency.setValueAtTime(f0, start);
    safeParamRamp(osc.frequency, f1, start + step.dur, true);
    g.gain.setValueAtTime(0.0001, start);
    safeParamRamp(g.gain, Math.max(0.001, stepGain), start + 0.003, false);
    safeParamRamp(g.gain, 0.0001, start + step.dur, true);
    osc.connect(g);
    g.connect(dest);
    osc.start(start);
    osc.stop(start + step.dur + 0.01);
    sources.push(osc);
    return;
  }

  if (step.kind === 'nz') {
    if (!noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.001, stepGain), start);
    safeParamRamp(g.gain, 0.0001, start + step.dur, true);

    if (typeof ctx.createBiquadFilter === 'function') {
      const filt = ctx.createBiquadFilter();
      filt.type = step.filterType;
      filt.frequency.setValueAtTime(Math.max(40, step.freq * pitchRate), start);
      filt.Q.setValueAtTime(step.q, start);
      src.connect(filt);
      filt.connect(g);
    } else {
      src.connect(g);
    }

    g.connect(dest);
    src.start(start);
    src.stop(start + step.dur + 0.01);
    sources.push(src);
    return;
  }

  // Arpeggio step
  for (let i = 0; i < step.notes.length; i++) {
    const nStart = start + i * step.stepSec;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = step.type;
    osc.frequency.setValueAtTime(Math.max(20, step.notes[i] * pitchRate), nStart);
    g.gain.setValueAtTime(0.0001, nStart);
    safeParamRamp(g.gain, Math.max(0.001, stepGain), nStart + 0.004, false);
    safeParamRamp(g.gain, 0.0001, nStart + step.dur, true);
    osc.connect(g);
    g.connect(dest);
    osc.start(nStart);
    osc.stop(nStart + step.dur + 0.01);
    sources.push(osc);
  }
}

function createVoiceRouting(
  ctx: AudioContext,
  pan: number,
  gainValue: number,
): { entry: AudioNode; voiceGain: GainNode } | null {
  if (!sfxBus) return null;
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(Math.max(0.001, gainValue), ctx.currentTime);
  voiceGain.connect(sfxBus);

  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, ctx.currentTime);
    panner.connect(voiceGain);
    return { entry: panner, voiceGain };
  }
  return { entry: voiceGain, voiceGain };
}

// ─── Manifest & Buffer Loading (Concurrency Cap = 4, failedUrls Cache) ─────

function normalizeAssetUrl(relOrAbs: string): string {
  if (/^https?:\/\//i.test(relOrAbs) || relOrAbs.startsWith('/')) {
    return relOrAbs;
  }
  return `${BANSUNG_STATIC_ROOT}/${relOrAbs}`;
}

let cachedFormatSupport: { ogg: boolean; mp3: boolean; wav: boolean } | null = null;

function getFormatSupport(): { ogg: boolean; mp3: boolean; wav: boolean } {
  if (cachedFormatSupport) return cachedFormatSupport;
  if (typeof Audio === 'undefined') {
    cachedFormatSupport = { ogg: true, mp3: true, wav: true };
    return cachedFormatSupport;
  }
  try {
    const probe = new Audio();
    if (typeof probe.canPlayType !== 'function') {
      cachedFormatSupport = { ogg: true, mp3: true, wav: true };
    } else {
      cachedFormatSupport = {
        ogg: probe.canPlayType('audio/ogg; codecs="vorbis"') !== '',
        mp3: probe.canPlayType('audio/mpeg') !== '',
        wav: probe.canPlayType('audio/wav') !== '',
      };
    }
  } catch {
    cachedFormatSupport = { ogg: true, mp3: true, wav: true };
  }
  return cachedFormatSupport;
}

function canPlayExt(url: string): boolean {
  const support = getFormatSupport();
  const lower = url.toLowerCase();
  if (lower.endsWith('.ogg')) return support.ogg;
  if (lower.endsWith('.mp3')) return support.mp3;
  if (lower.endsWith('.wav')) return support.wav;
  return true;
}

function getOrderedCandidatesForEntry(entry: AudioManifestEntry): string[] {
  const rawList: string[] = [];
  if (entry.variations && entry.variations.length > 0) {
    const startIdx = Math.floor(Math.random() * entry.variations.length);
    for (let i = 0; i < entry.variations.length; i++) {
      rawList.push(entry.variations[(startIdx + i) % entry.variations.length]);
    }
  }
  if (!rawList.includes(entry.path)) rawList.unshift(entry.path);
  if (entry.fallbackPath && !rawList.includes(entry.fallbackPath)) {
    rawList.push(entry.fallbackPath);
  }

  // Order playable formats first (.ogg -> .mp3 -> .wav) while deduplicating
  const out: string[] = [];
  const playable: string[] = [];
  const rest: string[] = [];
  for (const rel of rawList) {
    const url = normalizeAssetUrl(rel);
    if (failedUrls.has(url) || out.includes(url)) continue;
    out.push(url);
    if (canPlayExt(url)) playable.push(url);
    else rest.push(url);
  }
  return [...playable, ...rest];
}

function pickBufferedEntry(
  id: string,
  entry: AudioManifestEntry,
): { buffer: AudioBuffer; url: string } | null {
  const candidates = getOrderedCandidatesForEntry(entry);
  const cachedHits: { buffer: AudioBuffer; url: string }[] = [];
  for (const url of candidates) {
    const cached = bufferCache.get(url);
    if (cached) cachedHits.push({ buffer: cached, url });
  }
  if (cachedHits.length === 0) return null;
  if (cachedHits.length === 1) return cachedHits[0];

  const prevUrl = lastVariationUrlBySfx.get(id);
  const pool =
    prevUrl && cachedHits.length > 1
      ? cachedHits.filter((item) => item.url !== prevUrl)
      : cachedHits;
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? cachedHits[0];
  lastVariationUrlBySfx.set(id, pick.url);
  return pick;
}

function runWithConcurrency<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeDecodeCount++;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeDecodeCount--;
          const next = decodeQueue.shift();
          if (next) next();
        });
    };
    if (activeDecodeCount < MAX_DECODE_CONCURRENCY) {
      run();
    } else {
      decodeQueue.push(run);
    }
  });
}

/**
 * Fetches & decodes a single audio URL once, caching decode buffers and
 * recording 404/network/decode errors in `failedUrls` so dead URLs never re-fetch.
 */
export function decodeAudioUrl(url: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(url);
  if (cached) return Promise.resolve(cached);
  if (failedUrls.has(url)) return Promise.resolve(null);

  const existing = inflightDecodes.get(url);
  if (existing) return existing;

  const job = runWithConcurrency(async () => {
    if (failedUrls.has(url) || typeof fetch !== 'function') return null;
    const ctx = ensureGraph();
    if (!ctx || typeof ctx.decodeAudioData !== 'function') return null;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        failedUrls.add(url);
        return null;
      }
      const arr = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arr);
      bufferCache.set(url, decoded);
      return decoded;
    } catch {
      failedUrls.add(url);
      return null;
    } finally {
      inflightDecodes.delete(url);
    }
  });

  inflightDecodes.set(url, job);
  return job;
}

async function resolveSfxBuffer(id: string, decodeAllVariations = false): Promise<AudioBuffer | null> {
  const entry = manifestMap.get(id);
  if (!entry || entry.kind !== 'sfx') return null;
  const candidates = getOrderedCandidatesForEntry(entry);
  if (decodeAllVariations) {
    // Prefer decoding every playable variation so rapid weapon shots rotate cleanly.
    const playable = candidates.filter((u) => canPlayExt(u));
    const list = playable.length > 0 ? playable : candidates;
    const bufs = await Promise.all(list.map((url) => decodeAudioUrl(url).catch(() => null)));
    return bufs.find((b): b is AudioBuffer => b !== null) ?? null;
  }
  for (const url of candidates) {
    const buf = await decodeAudioUrl(url);
    if (buf) return buf;
  }
  return null;
}

/**
 * Preloads decoded `AudioBuffer`s for the provided IDs (or core combat & weapon SFX + all variations)
 * under the 4-request concurrency cap.
 */
export async function preloadBansungSfx(ids?: readonly string[]): Promise<void> {
  const targetIds =
    ids && ids.length > 0
      ? ids
      : ([
          'sfx_pistol_fire',
          'sfx_smg_fire',
          'sfx_shotgun_fire',
          'sfx_rifle_fire',
          'shot_sniper',
          'shot_laser',
          'sfx_wpn_laser',
          'wpn_plasma_fire',
          'wpn_rail_fire',
          'wpn_lightning_cast',
          'sfx_gl_fire',
          'sfx_stun_fire',
          'sfx_bazooka_fire',
          'sfx_shock_zap',
          'sfx_shotgun_pump',
          'shot_pistol',
          'shot_smg',
          'shot_shotgun',
          'shot_rifle',
          'shot_rocket',
          'hit_flesh',
          'hit_armor',
          'hit_crit',
          'explosion_sm',
          'explosion_lg',
          'reload_start',
          'reload_active_hit',
          'reload_done',
          'dash',
          'ui_click',
          'ui_deny',
          'boss_roar',
          'wave_start',
          'wave_clear',
        ] as const);

  await Promise.all(
    targetIds.map((id) => resolveSfxBuffer(id, true).catch(() => null)),
  );
}

async function loadAudioManifest(manifestUrl = DEFAULT_MANIFEST_URL): Promise<void> {
  if (typeof fetch !== 'function') {
    manifestLoaded = true;
    return;
  }
  try {
    const res = await fetch(manifestUrl, { cache: 'no-cache' });
    if (!res.ok) return;
    const raw = (await res.json()) as { audio?: Record<string, AudioManifestEntry> };
    if (raw && raw.audio && typeof raw.audio === 'object') {
      for (const [k, entry] of Object.entries(raw.audio)) {
        if (entry && typeof entry.path === 'string') {
          manifestMap.set(k, entry);
        }
      }
      manifestLoaded = true;
    }
  } catch {
    // Graceful procedural fallback when manifest is unavailable
  }
}

/**
 * Initializes the Bansung WebAudio graph, attaches autoplay unlock hooks,
 * loads the asset manifest, and kicks off core SFX preloading.
 */
export async function initBansungAudio(manifestUrl = DEFAULT_MANIFEST_URL): Promise<void> {
  initialized = true;
  ensureGraph();
  attachAutoplayUnlock();
  syncBansungMute();

  if (!manifestLoadPromise) {
    manifestLoadPromise = loadAudioManifest(manifestUrl);
  }
  await manifestLoadPromise;
  void preloadBansungSfx().catch(() => {});
}

/**
 * Tears down active voices, stops BGM decks/timers, and releases node references.
 * Pass `clearCaches = true` to also clear cached manifests, AudioBuffers, and failedUrls.
 */
export function disposeBansungAudio(clearCaches = false): void {
  stopBansungBgm(0);
  if (bgmDuckTimer) {
    clearTimeout(bgmDuckTimer);
    bgmDuckTimer = null;
  }
  if (bgmFadeStopTimer) {
    clearTimeout(bgmFadeStopTimer);
    bgmFadeStopTimer = null;
  }

  for (const v of activeVoices) {
    for (const src of v.sources) {
      try {
        src.stop();
      } catch {
        // Ignore
      }
    }
  }
  activeVoices.length = 0;
  lastPlayedMs.clear();
  lastVariationUrlBySfx.clear();
  lastLocalShot = null;
  lastLocalStatus = null;

  for (const deck of bgmDecks) {
    if (deck.el) {
      try {
        deck.el.pause();
        deck.el.removeAttribute('src');
        deck.el.load();
      } catch {
        // Ignore
      }
    }
    deck.el = null;
    deck.mediaSource = null;
    deck.gainNode = null;
    deck.targetGain = 0;
  }

  if (clearCaches) {
    manifestMap.clear();
    manifestLoadPromise = null;
    manifestLoaded = false;
    bufferCache.clear();
    inflightDecodes.clear();
    failedUrls.clear();
    decodeQueue.length = 0;
    activeDecodeCount = 0;
  }

  ctxRef = null;
  sfxBus = null;
  limiterNode = null;
  sfxMasterGain = null;
  bgmMasterGain = null;
  masterGain = null;
  pendingBgmTrack = null;
  currentBgmKey = null;
  currentBgmBiome = undefined;
  initialized = false;
}

// ─── Core SFX Playback ──────────────────────────────────────────────────────

/**
 * Plays a Bansung SFX event using spatial pan (`520px`), quadratic distance rolloff (`140..1100px`),
 * per-ID `minGapMs` throttle, pitch/volume jitter, 8-voice priority stealing, and procedural synth fallback.
 */
export function playBansungSfx(id: BansungSfxId, opts: SfxPlayOpts = {}): boolean {
  if (isMuted()) return false;

  const spec = getSfxSpec(id);
  const canonicalKey = resolveCanonicalKey(id);
  const isWeaponFire =
    canonicalKey.startsWith('shot_') ||
    canonicalKey.startsWith('gun_') ||
    canonicalKey.startsWith('magic_') ||
    id.startsWith('wpn_') ||
    id.startsWith('sfx_wpn_');
  const effectivePriority = (
    opts.local && isWeaponFire ? Math.min(3, spec.priority + 1) : spec.priority
  ) as 0 | 1 | 2 | 3;

  const { culled, pan, distGain } = computeSpatialParams(opts.x, opts.y, spec.spatial, opts.local);
  if (culled) return false;

  const throttleKey = opts.local
    ? `local:${id}`
    : opts.sourceId !== undefined
      ? `${id}@${opts.sourceId}`
      : id;
  const nowMs = Date.now();
  const prevMs = lastPlayedMs.get(throttleKey) ?? -Infinity;
  if (spec.minGapMs > 0 && nowMs - prevMs < spec.minGapMs) {
    return false;
  }

  const jitterVol = spec.volJitter > 0 ? 1 + (Math.random() * 2 - 1) * spec.volJitter : 1;
  const gain = spec.baseVol * (opts.vol ?? 1) * distGain * jitterVol;
  if (gain < MIN_AUDIBLE_GAIN) return false;

  const ctx = ensureGraph();
  if (!ctx || !sfxBus) return false;
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    void ctx.resume().catch(() => {});
  }

  applyBusVolumes();

  pruneExpiredVoices(nowMs);
  if (!stealOrRejectVoice(ctx, effectivePriority, gain)) {
    return false;
  }

  const pitchJitter =
    spec.pitchMax > spec.pitchMin
      ? spec.pitchMin + Math.random() * (spec.pitchMax - spec.pitchMin)
      : spec.pitchMin;
  const pitchRate = Math.max(0.25, Math.min(3.5, pitchJitter * (opts.pitchMul ?? 1)));

  const routing = createVoiceRouting(ctx, pan, Math.min(1.5, gain));
  if (!routing) return false;

  const sources: AudioScheduledSourceNode[] = [];
  let durSec = spec.fallbackDur;

  const entry = manifestMap.get(id);
  const hit = entry ? pickBufferedEntry(id, entry) : null;

  if (hit) {
    const src = ctx.createBufferSource();
    src.buffer = hit.buffer;
    src.playbackRate.setValueAtTime(pitchRate, ctx.currentTime);
    src.connect(routing.entry);
    src.start(ctx.currentTime);
    sources.push(src);
    durSec = Math.max(0.05, (hit.buffer.duration || spec.fallbackDur) / pitchRate);

    // Subtle crisp low-end thump layer under decoded firearm WAVs so sustained fire hits harder.
    if (isWeaponFire && opts.local) {
      const punchStep: SynthStep =
        canonicalKey === 'shot_laser' || canonicalKey === 'magic_lightning'
          ? { kind: 'osc', type: 'triangle', f0: 960, f1: 240, dur: 0.045, gain: 0.22 }
          : { kind: 'osc', type: 'triangle', f0: 210, f1: 58, dur: 0.042, gain: 0.26 };
      runSynthStep(
        ctx,
        routing.entry,
        punchStep,
        pitchRate,
        ctx.currentTime,
        getWhiteNoiseBuffer(ctx),
        sources,
      );
    }
    if (entry && entry.variations && entry.variations.length > 1) {
      void resolveSfxBuffer(id, true).catch(() => null);
    }
  } else {
    // Lazy background fetch for next trigger if manifest entry is registered & not failed
    if (entry && entry.kind === 'sfx') {
      void resolveSfxBuffer(id, true).catch(() => null);
    } else if (!manifestLoaded && !manifestLoadPromise) {
      manifestLoadPromise = loadAudioManifest();
    }

    const def = CANONICAL_DEFS[canonicalKey] ?? CANONICAL_DEFS.ui_click;
    const noiseBuf = getWhiteNoiseBuffer(ctx);
    for (const step of def.synth) {
      runSynthStep(ctx, routing.entry, step, pitchRate, ctx.currentTime, noiseBuf, sources);
    }
    durSec = def.spec.fallbackDur / pitchRate;
  }

  lastPlayedMs.set(throttleKey, nowMs);
  activeVoices.push({
    id,
    priority: effectivePriority,
    startMs: nowMs,
    endMs: nowMs + Math.ceil(durSec * 1000) + 20,
    gainScore: gain,
    voiceGain: routing.voiceGain,
    sources,
  });

  if (opts.local && isWeaponFire) {
    // Track predicted local shot timing if caller didn't pass explicit localActorId
    lastLocalShot = { idx: -1, ts: nowMs };
  }

  return true;
}

// ─── Packed Wire FX Event Consumer ──────────────────────────────────────────

function isLocalActor(
  actorOrPlayerId: number,
  localPlayerId: number | string | null | undefined,
  opts?: ConsumeFxAudioOpts,
): boolean {
  if (
    opts?.localActorId !== undefined &&
    (actorOrPlayerId === opts.localActorId ||
      (opts.localActorId >= 1000 &&
        opts.localActorId < 2000 &&
        actorOrPlayerId === opts.localActorId - 1000))
  ) {
    return true;
  }
  if (opts?.localPlayerIdx !== undefined) {
    if (actorOrPlayerId === opts.localPlayerIdx) return true;
    if (
      actorOrPlayerId >= 1000 &&
      actorOrPlayerId < 2000 &&
      actorOrPlayerId - 1000 === opts.localPlayerIdx
    ) {
      return true;
    }
  }
  if (typeof localPlayerId === 'number') {
    if (actorOrPlayerId === localPlayerId) return true;
    if (
      actorOrPlayerId >= 1000 &&
      actorOrPlayerId < 2000 &&
      actorOrPlayerId - 1000 === localPlayerId
    ) {
      return true;
    }
  }
  return false;
}

function closestPointOnSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): { x: number; y: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-6) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  return { x: ax + vx * t, y: ay + vy * t };
}

/**
 * Registers a locally predicted weapon fire or status action so server echoes can be muted cleanly.
 */
export function markLocalPredictedAction(kind: 'shot' | 'status', code: number): void {
  const ts = Date.now();
  if (kind === 'shot') lastLocalShot = { idx: code, ts };
  else lastLocalStatus = { kind: code, ts };
}

/**
 * Decodes and dispatches one frame's server `SnapFxEvent[]` queue with echo suppression
 * only when the client already marked a matching local prediction.
 */
export function consumeFrameAudioEvents(
  events: readonly SnapFxEvent[],
  localPlayerId?: number | string | null,
  opts?: ConsumeFxAudioOpts,
): void {
  if (!events || events.length === 0 || isMuted()) return;
  const nowMs = Date.now();

  for (const evt of events) {
    switch (evt.type) {
      case FX_MUZZLE: {
        // [0, ownerId, weaponIdxOrKindId, x, y, aimQ]
        if (evt.a >= 2000) {
          const sfx = evt.b === 14 ? 'fx_thunder_arc' : 'turret_shot';
          playBansungSfx(sfx, { x: evt.c, y: evt.d });
          break;
        }
        const echoLocal =
          lastLocalShot !== null &&
          nowMs - lastLocalShot.ts < 150 &&
          (lastLocalShot.idx === -1 || lastLocalShot.idx === evt.b) &&
          Math.hypot(evt.c - listenerX, evt.d - listenerY) < 96;
        if (echoLocal) break;

        const wpn = getWeaponByIdx(evt.b);
        playBansungSfx(wpn?.sfxFire ?? 'shot_pistol', {
          x: evt.c,
          y: evt.d,
          local: isLocalActor(evt.a, localPlayerId, opts),
          sourceId: evt.a,
        });
        break;
      }

      case FX_DMG: {
        // [1, x, y, amount, dmgFlags, targetId]
        const flags = evt.d;
        if (flags & BANSUNG_DMG_HEAL) {
          playBansungSfx('heal_orb', { x: evt.a, y: evt.b, vol: 0.75 });
        } else if (flags & BANSUNG_DMG_CRIT) {
          playBansungSfx('hit_crit', { x: evt.a, y: evt.b });
        } else if (flags & BANSUNG_DMG_SHOCK) {
          playBansungSfx('sfx_shock_zap', { x: evt.a, y: evt.b });
        } else if (flags & BANSUNG_DMG_STUN) {
          playBansungSfx('stun_flash', { x: evt.a, y: evt.b, vol: 0.65 });
        } else if (flags & BANSUNG_DMG_ARMOR) {
          playBansungSfx('hit_armor', { x: evt.a, y: evt.b });
        } else if (evt.c > 0) {
          playBansungSfx('hit_flesh', { x: evt.a, y: evt.b });
        }
        break;
      }

      case FX_BLAST: {
        // [2, blastKind, x, y, radius, ownerIdx]
        switch (evt.a) {
          case BANSUNG_FX_BLAST_STUN:
            playBansungSfx('stun_flash', { x: evt.b, y: evt.c });
            break;
          case BANSUNG_FX_BLAST_STEAM:
            playBansungSfx('boss_overheat_hiss', { x: evt.b, y: evt.c });
            break;
          case BANSUNG_FX_BLAST_FIREBALL:
            playBansungSfx('fx_fireball_boom', { x: evt.b, y: evt.c });
            break;
          case BANSUNG_FX_BLAST_DRONE_PULSE:
            playBansungSfx('heal_pulse', { x: evt.b, y: evt.c });
            break;
          case BANSUNG_FX_BLAST_TURRET_THUNDER:
            playBansungSfx('gadget_turret_thunder', { x: evt.b, y: evt.c });
            break;
          case BANSUNG_FX_BLAST_TURRET_EXPIRE:
            playBansungSfx('explosion_sm', { x: evt.b, y: evt.c, vol: 0.55 });
            break;
          case BANSUNG_FX_BLAST_BOSS_SHOCKWAVE:
            playBansungSfx('boss_slam', { x: evt.b, y: evt.c });
            duckBansungBgm(0.55, 450);
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_BLAST_BOSS_MORTAR:
            playBansungSfx('mortar_explode', { x: evt.b, y: evt.c });
            break;
          case BANSUNG_FX_BLAST_THUNDER_STORM:
          case BANSUNG_FX_BLAST_STORM_YELLOW:
            playBansungSfx('wpn_lightning_cast', { x: evt.b, y: evt.c });
            break;
          case BANSUNG_FX_BLAST_DESTROYER_METEOR:
            playBansungSfx('explosion_lg', { x: evt.b, y: evt.c });
            duckBansungBgm(0.55, 420);
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_BLAST_FROST_SHATTER:
            playBansungSfx('fx_plasma_spark', { x: evt.b, y: evt.c });
            playBansungSfx('explosion_sm', { x: evt.b, y: evt.c, vol: 0.65 });
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_BLAST_ABYSS_NOVA:
          case BANSUNG_FX_BLAST_ORBITAL:
            playBansungSfx('explosion_lg', { x: evt.b, y: evt.c });
            duckBansungBgm(0.55, 420);
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_BLAST_HERO_NOVA:
            playBansungSfx('fx_fireball_boom', { x: evt.b, y: evt.c });
            playBansungSfx('boss_emp', { x: evt.b, y: evt.c, vol: 0.72 });
            break;
          case BANSUNG_FX_BLAST_HE:
          case BANSUNG_FX_BLAST_CLUSTER:
          case BANSUNG_FX_BLAST_MINE:
          case BANSUNG_FX_BLAST_VOLATILE:
          default:
            playBansungSfx(evt.d >= 95 ? 'explosion_lg' : 'explosion_sm', { x: evt.b, y: evt.c });
            break;
        }
        break;
      }

      case FX_IMPACT: {
        // [3, impactKind, x, y, aimQ, matOrKindId]
        if (evt.a === BANSUNG_FX_IMPACT_FLESH || evt.e === 1) {
          playBansungSfx('hit_flesh', { x: evt.b, y: evt.c, vol: 0.65 });
        } else if (evt.a === BANSUNG_FX_IMPACT_SLASH) {
          playBansungSfx('melee_slash', { x: evt.b, y: evt.c });
        } else if (evt.a === BANSUNG_FX_IMPACT_SLICE) {
          playBansungSfx('melee_deflect', { x: evt.b, y: evt.c });
        } else if (evt.a === BANSUNG_FX_IMPACT_SPARK) {
          playBansungSfx('fx_plasma_spark', { x: evt.b, y: evt.c, vol: 0.7 });
        } else {
          // Covers BANSUNG_FX_IMPACT_WALL and unknown impact materials
          playBansungSfx('hit_armor', { x: evt.b, y: evt.c, vol: 0.45 });
        }
        break;
      }

      case FX_DEATH: {
        // [4, kindIdx, x, y, tier, killerIdx]
        const enemyKey = BANSUNG_ENEMY_IDS[evt.a];
        const enemySpec = enemyKey ? BANSUNG_ENEMIES[enemyKey] : undefined;
        const isBoss =
          (evt.a >= 8 && evt.a <= 10) || evt.d >= 3 || Boolean(enemySpec?.isBoss);
        if (isBoss) {
          playBansungSfx('boss_death_shatter', { x: evt.b, y: evt.c });
          duckBansungBgm(0.4, 800);
          opts?.onBossAudio?.();
        } else {
          playBansungSfx('mob_die', { x: evt.b, y: evt.c });
        }
        break;
      }

      case FX_STATUS: {
        // [5, playerIdx, statusKind, val, x, y]
        const kind = evt.b;
        const isEchoable =
          kind === BANSUNG_FX_STATUS_DASH ||
          kind === BANSUNG_FX_STATUS_RELOAD_START ||
          kind === BANSUNG_FX_STATUS_RELOAD_PERFECT;
        if (
          isEchoable &&
          lastLocalStatus !== null &&
          lastLocalStatus.kind === kind &&
          nowMs - lastLocalStatus.ts < 180
        ) {
          break;
        }
        const local = isLocalActor(evt.a, localPlayerId, opts);
        switch (kind) {
          case BANSUNG_FX_STATUS_DASH:
            playBansungSfx('dash', { x: evt.d, y: evt.e, local });
            break;
          case BANSUNG_FX_STATUS_RELOAD_START:
            playBansungSfx('reload_start', { x: evt.d, y: evt.e, local });
            break;
          case BANSUNG_FX_STATUS_RELOAD_PERFECT:
            playBansungSfx('reload_active_hit', { x: evt.d, y: evt.e, local });
            break;
          case BANSUNG_FX_STATUS_DOWNED:
            playBansungSfx('player_down', { x: evt.d, y: evt.e });
            duckBansungBgm(0.5, 650);
            break;
          case BANSUNG_FX_STATUS_REVIVED:
            playBansungSfx('revive_done', { x: evt.d, y: evt.e, local });
            break;
          case BANSUNG_FX_STATUS_PERK:
            playBansungSfx('perk_pick', { local, x: evt.d, y: evt.e });
            break;
          case BANSUNG_FX_STATUS_CRATE:
            playBansungSfx('crate_break', { x: evt.d, y: evt.e });
            break;
          case BANSUNG_FX_STATUS_LEVELUP:
            playBansungSfx('ui_confirm', { local, x: evt.d, y: evt.e });
            break;
          case BANSUNG_FX_STATUS_GACHA:
            playBansungSfx('perk_pick', { local, x: evt.d, y: evt.e });
            break;
          case BANSUNG_FX_STATUS_RESTOCK:
            playBansungSfx('pickup_weapon', { local, x: evt.d, y: evt.e });
            break;
          case BANSUNG_FX_STATUS_BOSS_OVERHEAT:
            playBansungSfx('boss_overheat_hiss', { x: evt.d, y: evt.e });
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_STATUS_BOSS_SHIELD_UP:
            playBansungSfx('shield_up', { x: evt.d, y: evt.e });
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_STATUS_BOSS_MATRIX:
            playBansungSfx('sniper_lock', { x: evt.d, y: evt.e });
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_STATUS_BOSS_PHASE:
            playBansungSfx('boss_roar', { x: evt.d, y: evt.e });
            duckBansungBgm(0.5, 500);
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_STATUS_HERO_SKILL:
            playBansungSfx('hero_skill_activate', { local, x: evt.d, y: evt.e });
            break;
          // Spec 007 · C — skill súng [5, playerIdx, 18..21, weaponIdx, x, y]
          case BANSUNG_FX_STATUS_WSKILL_CAST: {
            const ww = getWeaponByIdx(evt.c);
            const cat = ww?.category;
            playBansungSfx('hero_skill_activate', { local, x: evt.d, y: evt.e, vol: 0.85 });
            if (cat === 'energy') playBansungSfx('fx_plasma_spark', { local, x: evt.d, y: evt.e, vol: 0.7 });
            else if (cat === 'melee') playBansungSfx('melee_slash', { local, x: evt.d, y: evt.e, vol: 0.8 });
            else if (cat === 'explosive') playBansungSfx('sniper_lock', { local, x: evt.d, y: evt.e, vol: 0.6 });
            else playBansungSfx('reload_active_hit', { local, x: evt.d, y: evt.e, vol: 0.7 });
            break;
          }
          case BANSUNG_FX_STATUS_WSKILL_IMPACT: {
            const ww = getWeaponByIdx(evt.c);
            const id = ww?.id ?? '';
            if (ww?.category === 'explosive' || id === 'void_cannon' || id === 'magma_spitter') {
              playBansungSfx('explosion_sm', { x: evt.d, y: evt.e, vol: 0.8 });
            } else if (id === 'lightning_staff' || id === 'tesla_coil' || id === 'electric_gun' || id === 'shock_baton') {
              playBansungSfx('sfx_shock_zap', { x: evt.d, y: evt.e, vol: 0.8 });
            } else if (id === 'railgun' || id === 'laser_cannon' || id === 'ion_beam') {
              playBansungSfx('wpn_rail_fire', { x: evt.d, y: evt.e, vol: 0.7 });
            } else if (ww?.category === 'melee') {
              playBansungSfx('melee_slash', { x: evt.d, y: evt.e, vol: 0.75 });
            } else {
              playBansungSfx('hit_crit', { x: evt.d, y: evt.e, vol: 0.6 });
            }
            break;
          }
          case BANSUNG_FX_STATUS_WSKILL_END:
            if (local) playBansungSfx('reload_start', { local, x: evt.d, y: evt.e, vol: 0.4 });
            break;
          case BANSUNG_FX_STATUS_WSKILL_PASSIVE:
            if (local) playBansungSfx('perk_pick', { local, x: evt.d, y: evt.e, vol: 0.35 });
            break;
          case BANSUNG_FX_STATUS_BOSS_PART_BREAK:
            playBansungSfx('boss_part_break', { x: evt.d, y: evt.e, vol: 1.0 });
            playBansungSfx('explosion_sm', { x: evt.d, y: evt.e, vol: 0.85 });
            duckBansungBgm(0.5, 420);
            opts?.onBossAudio?.();
            break;
        }
        break;
      }

      case FX_PING: {
        // [6, playerIdx, pingKind, x, y, 0]
        playBansungSfx('ping', {
          x: evt.c,
          y: evt.d,
          local: isLocalActor(evt.a, localPlayerId, opts),
        });
        break;
      }

      case FX_BEAM: {
        // [7, x1, y1, x2, y2, beamKind]
        const pt = closestPointOnSegment(evt.a, evt.b, evt.c, evt.d, listenerX, listenerY);
        switch (evt.e) {
          case BANSUNG_FX_BEAM_CHAIN:
          case BANSUNG_FX_BEAM_YELLOW_LIGHTNING:
            playBansungSfx('wpn_lightning_cast', { x: pt.x, y: pt.y });
            break;
          case BANSUNG_FX_BEAM_SHOCK:
            playBansungSfx('sfx_shock_zap', { x: pt.x, y: pt.y });
            break;
          case BANSUNG_FX_BEAM_BOSS_EYE:
          case BANSUNG_FX_BEAM_BOSS_LASER:
            playBansungSfx('boss_laser', { x: pt.x, y: pt.y });
            duckBansungBgm(0.55, 500);
            opts?.onBossAudio?.();
            break;
          case BANSUNG_FX_BEAM_LASER_MAP:
            playBansungSfx('sfx_wpn_laser', { x: pt.x, y: pt.y, vol: 1.0 });
            break;
          case BANSUNG_FX_BEAM_RAIL:
          default:
            playBansungSfx('wpn_rail_fire', { x: pt.x, y: pt.y });
            break;
        }
        break;
      }
    }
  }
}

// ─── Dual-Deck BGM Crossfade & Ducking ──────────────────────────────────────

function resolveBgmKey(track: BansungBgmId, biome?: BansungBiome): string {
  const mapped = BGM_KEY_ALIAS[track] ?? track;
  if ((mapped === 'bgm_combat' || mapped === 'combat') && biome) {
    if (biome === 'crypt') return 'bgm_crypt';
    if (biome === 'cyber') return 'bgm_cyber';
    if (biome === 'desert') return 'bgm_desert';
  }
  return mapped;
}

function getBgmCandidateUrls(bgmKey: string): { urls: string[]; gain: number } {
  const entry = manifestMap.get(bgmKey) ?? manifestMap.get(BGM_KEY_ALIAS[bgmKey] ?? '');
  if (entry) {
    return {
      urls: getOrderedCandidatesForEntry(entry),
      gain: entry.gain > 0 ? Math.min(1, entry.gain) : 0.4,
    };
  }
  const fb = BGM_FALLBACK_PATHS[bgmKey] ?? BGM_FALLBACK_PATHS.bgm_combat;
  const playable: string[] = [];
  const rest: string[] = [];
  for (const rel of fb.paths) {
    const url = normalizeAssetUrl(rel);
    if (failedUrls.has(url)) continue;
    if (canPlayExt(url)) playable.push(url);
    else rest.push(url);
  }
  return { urls: [...playable, ...rest], gain: fb.gain };
}

function ensureDeckElement(idx: 0 | 1): BgmDeck {
  const deck = bgmDecks[idx];
  const ctx = ensureGraph();
  if (!deck.el && typeof Audio !== 'undefined') {
    const el = new Audio();
    el.loop = true;
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.muted = isMuted();
    deck.el = el;

    if (ctx && deck.gainNode && !wiredMediaElements.has(el) && typeof ctx.createMediaElementSource === 'function') {
      try {
        deck.mediaSource = ctx.createMediaElementSource(el);
        deck.mediaSource.connect(deck.gainNode);
        wiredMediaElements.add(el);
      } catch {
        deck.mediaSource = null;
      }
    }
  }
  return deck;
}

function setDeckGain(deck: BgmDeck, targetGain: number, fadeSec: number): void {
  deck.targetGain = targetGain;
  const now = ctxRef ? ctxRef.currentTime : 0;
  if (deck.gainNode) {
    try {
      deck.gainNode.gain.cancelScheduledValues(now);
      deck.gainNode.gain.setValueAtTime(deck.gainNode.gain.value, now);
      if (fadeSec <= 0.01) {
        deck.gainNode.gain.setValueAtTime(targetGain, now);
      } else {
        safeParamRamp(deck.gainNode.gain, Math.max(0, targetGain), now + fadeSec, false);
      }
    } catch {
      deck.gainNode.gain.value = targetGain;
    }
  }
  if (deck.el && !deck.mediaSource) {
    deck.el.muted = isMuted();
    deck.el.volume = isMuted() ? 0 : Math.max(0, Math.min(1, targetGain * prefs.bgm * prefs.master));
  }
}

function loadAndPlayDeck(deck: BgmDeck, urls: string[]): void {
  if (!deck.el || urls.length === 0) return;
  const el = deck.el;
  let urlIdx = 0;

  const tryCurrent = () => {
    while (urlIdx < urls.length && failedUrls.has(urls[urlIdx])) {
      urlIdx++;
    }
    if (urlIdx >= urls.length) {
      el.onerror = null;
      return;
    }
    const url = urls[urlIdx];
    el.onerror = () => {
      failedUrls.add(url);
      urlIdx++;
      tryCurrent();
    };
    el.src = url;
    void Promise.resolve(el.play()).catch(() => {
      attachAutoplayUnlock();
    });
  };

  tryCurrent();
}

/**
 * Crossfades between dual `<audio loop>` BGM decks (`1.2s` default, `0.45s` for boss).
 */
export function setBansungBgm(track: BansungBgmId, fadeSec?: number, biome?: BansungBiome): void {
  const nextKey = resolveBgmKey(track, biome);
  if (isMuted()) {
    pendingBgmTrack = { track, biome };
    applyBusVolumes();
    return;
  }

  if (currentBgmKey === nextKey && currentBgmBiome === biome && !pendingBgmTrack) {
    return;
  }

  currentBgmKey = nextKey;
  currentBgmBiome = biome;
  pendingBgmTrack = null;
  ensureGraph();

  const isBoss = nextKey.startsWith('bgm_boss') || nextKey === 'boss';
  const fade = fadeSec ?? (isBoss ? BOSS_CROSSFADE_SEC : CROSSFADE_SEC);
  const { urls, gain } = getBgmCandidateUrls(nextKey);

  const oldIdx = activeDeckIdx;
  const newIdx: 0 | 1 = oldIdx === 0 ? 1 : 0;
  const oldDeck = bgmDecks[oldIdx];
  const newDeck = ensureDeckElement(newIdx);
  activeDeckIdx = newIdx;

  if (bgmFadeStopTimer) {
    clearTimeout(bgmFadeStopTimer);
    bgmFadeStopTimer = null;
  }

  setDeckGain(oldDeck, 0, fade);
  if (oldDeck.el) {
    const elToStop = oldDeck.el;
    bgmFadeStopTimer = setTimeout(() => {
      bgmFadeStopTimer = null;
      if (activeDeckIdx !== oldIdx) {
        try {
          elToStop.pause();
        } catch {
          // Ignore
        }
      }
    }, Math.max(20, Math.round(fade * 1000) + 60));
  }

  setDeckGain(newDeck, 0, 0);
  loadAndPlayDeck(newDeck, urls);
  setDeckGain(newDeck, gain, fade);
}

/**
 * Fades out and pauses active BGM decks.
 */
export function stopBansungBgm(fadeSec = 0.4): void {
  currentBgmKey = null;
  currentBgmBiome = undefined;
  pendingBgmTrack = null;

  if (bgmFadeStopTimer) {
    clearTimeout(bgmFadeStopTimer);
    bgmFadeStopTimer = null;
  }

  for (const deck of bgmDecks) {
    setDeckGain(deck, 0, fadeSec);
    const el = deck.el;
    if (el) {
      if (fadeSec <= 0.01) {
        try {
          el.pause();
        } catch {
          // Ignore
        }
      } else {
        setTimeout(() => {
          if (currentBgmKey === null) {
            try {
              el.pause();
            } catch {
              // Ignore
            }
          }
        }, Math.round(fadeSec * 1000) + 40);
      }
    }
  }
}

/**
 * Temporarily attenuates `bgmMasterGain` for big stingers (boss roar, boss death, downed),
 * then smoothly recovers to `prefs.bgm`.
 */
export function duckBansungBgm(factor = 0.45, holdMs = 700): void {
  const ctx = ctxRef;
  if (!ctx || !bgmMasterGain) return;

  if (bgmDuckTimer) {
    clearTimeout(bgmDuckTimer);
    bgmDuckTimer = null;
  }

  const clampedFactor = Math.max(0.05, Math.min(1, factor));
  const now = ctx.currentTime;
  safeParamSet(bgmMasterGain.gain, prefs.bgm * clampedFactor, now, 0.04);

  bgmDuckTimer = setTimeout(() => {
    bgmDuckTimer = null;
    if (!ctxRef || !bgmMasterGain) return;
    safeParamSet(bgmMasterGain.gain, prefs.bgm, ctxRef.currentTime, 0.2);
  }, Math.max(40, holdMs));
}

/**
 * Returns read-only diagnostics useful for verification and audio HUDs.
 */
export function getBansungAudioDiagnostics(): BansungAudioDiagnostics {
  pruneExpiredVoices(Date.now());
  return {
    initialized,
    muted: isMuted(),
    activeVoices: activeVoices.length,
    loadedBuffers: bufferCache.size,
    failedUrlCount: failedUrls.size,
    manifestLoaded,
    manifestCount: manifestMap.size,
    currentBgm: currentBgmKey,
    listener: { x: listenerX, y: listenerY },
  };
}
