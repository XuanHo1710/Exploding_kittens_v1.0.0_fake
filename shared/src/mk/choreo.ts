/**
 * 3-Tier Pixel Choreography Engine Contract (`shared/src/mk/choreo.ts`).
 *
 * Maps 100% of hero combos, 30 active/ultimate skills, guard/parry, dashes,
 * enemy attacks and 3-phase boss specials onto strictly 10–15 key-pose frames
 * per character (0..14 for Heroes/Bosses, 0..10 for Regular, 0..11 for Elite).
 */
import { MK_ENEMIES } from './enemies';
import { MK_HEROES, MK_HERO_MASTER_FRAMES } from './heroes';
import {
  MK_BOSS_IDS,
  MK_ENEMY_IDS,
  MK_HERO_ANCHOR_X,
  MK_HERO_ANCHOR_Y,
  MK_HERO_CELL_PX,
  MK_HERO_IDS,
  MK_STATIC_ROOT,
  type MkActionId,
  type MkAnyEnemyId,
  type MkEnemyActionId,
  type MkHeroActionId,
  type MkHeroId,
  type MkVfxId,
  type MkVfxLayer,
} from './types';

/** Semantic pose indices for the 15-frame Hero Master Atlas (720×48). */
export const HERO_POSE = {
  IDLE_1: 0,
  IDLE_2: 1,
  WALK_1: 2,
  WALK_2: 3,
  WALK_3: 4,
  WINDUP: 5,
  STRIKE_1: 6,
  STRIKE_2: 7,
  STRIKE_3: 8,
  CAST_HOLD: 9,
  AIR_SPIN: 10,
  DASH_THRUST: 11,
  GUARD_PARRY: 12,
  HIT_STUN: 13,
  DOWN_DEAD: 14,
} as const;

/** Semantic pose indices for Regular (11f) / Elite (12f) Enemy Atlas. */
export const ENEMY_POSE = {
  IDLE_1: 0,
  IDLE_2: 1,
  WALK_1: 2,
  WALK_2: 3,
  WALK_3: 4,
  WINDUP: 5,
  ATTACK_1: 6,
  ATTACK_2: 7,
  HIT_STUN: 8,
  DEAD_1: 9,
  DEAD_2: 10,
  SPECIAL_CAST: 11,
} as const;

/** Semantic pose indices for 15-frame Boss Master Atlas (1200×80). */
export const BOSS_POSE = {
  IDLE_1: 0,
  IDLE_2: 1,
  WALK_1: 2,
  WALK_2: 3,
  WALK_3: 4,
  TELEGRAPH_CHARGE: 5,
  ATTACK_1: 6,
  ATTACK_2: 7,
  SLAM_IMPACT: 8,
  SPECIAL_CAST: 9,
  DASH_CHARGE: 10,
  ENRAGE_ROAR: 11,
  STAGGER_HIT: 12,
  DEFEAT_1: 13,
  DEFEAT_2: 14,
} as const;

export interface MkPixelAtlasSpec {
  entityId: MkHeroId | MkAnyEnemyId;
  category: 'hero' | 'enemy' | 'boss';
  atlasPath: string;
  portraitPath?: string;
  cellW: number;
  cellH: number;
  anchorX: number;
  anchorY: number;
  frameCount: number;
  paletteAccent: string;
}

export interface MkVfxSpawnCue {
  vfxId: MkVfxId;
  layer: MkVfxLayer;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  tint?: string;
  scale?: number;
  minSkillLevel?: 1 | 3 | 5;
}

export interface MkChoreoStep {
  frame: number;
  durationMs: number;
  dx?: number;
  dz?: number;
  flipX?: boolean;
  afterimage?: boolean;
  flashColor?: string;
  hitstopMs?: number;
  hitboxTag?: string;
  vfx?: MkVfxSpawnCue[];
  sfx?: string;
}

export interface MkChoreoTimeline {
  actionId: MkActionId;
  loop: boolean;
  cancelAfterMs?: number;
  superArmor?: boolean;
  invulnWindow?: readonly [number, number];
  steps: readonly MkChoreoStep[];
}

const P = HERO_POSE;

function makeBaseHeroTimelines(accent: string, secondary: string): Record<MkHeroActionId, MkChoreoTimeline> {
  return {
    idle: {
      actionId: 'idle',
      loop: true,
      steps: [
        { frame: P.IDLE_1, durationMs: 360 },
        { frame: P.IDLE_2, durationMs: 360 },
      ],
    },
    walk: {
      actionId: 'walk',
      loop: true,
      steps: [
        { frame: P.WALK_1, durationMs: 105 },
        { frame: P.WALK_2, durationMs: 95 },
        { frame: P.WALK_3, durationMs: 105 },
        { frame: P.WALK_2, durationMs: 95 },
      ],
    },
    combo1: {
      actionId: 'combo1',
      loop: false,
      cancelAfterMs: 135,
      steps: [
        { frame: P.WINDUP, durationMs: 60 },
        {
          frame: P.STRIKE_1,
          durationMs: 110,
          dx: 5,
          hitstopMs: 35,
          hitboxTag: 'combo1',
          vfx: [{ vfxId: 'slash_crescent', layer: 'front', offsetX: 20, offsetY: 0, offsetZ: 14, tint: accent }],
        },
        { frame: P.IDLE_1, durationMs: 90 },
      ],
    },
    combo2: {
      actionId: 'combo2',
      loop: false,
      cancelAfterMs: 140,
      steps: [
        { frame: P.STRIKE_1, durationMs: 55 },
        {
          frame: P.STRIKE_2,
          durationMs: 115,
          dx: 7,
          hitstopMs: 40,
          hitboxTag: 'combo2',
          vfx: [{ vfxId: 'slash_crescent', layer: 'front', offsetX: 22, offsetY: -2, offsetZ: 16, tint: secondary }],
        },
        { frame: P.IDLE_2, durationMs: 95 },
      ],
    },
    combo3: {
      actionId: 'combo3',
      loop: false,
      cancelAfterMs: 210,
      superArmor: true,
      steps: [
        { frame: P.WINDUP, durationMs: 85, dx: -2 },
        { frame: P.AIR_SPIN, durationMs: 65, dx: 6, dz: 10, afterimage: true },
        {
          frame: P.STRIKE_3,
          durationMs: 150,
          dx: 10,
          dz: 0,
          afterimage: true,
          hitstopMs: 65,
          hitboxTag: 'combo3',
          vfx: [
            { vfxId: 'slash_cross_x', layer: 'front', offsetX: 24, offsetY: 0, offsetZ: 16, tint: secondary, scale: 1.2 },
            { vfxId: 'dust_puff', layer: 'behind', offsetX: 0, offsetY: 0, offsetZ: 0 },
          ],
        },
        { frame: P.IDLE_1, durationMs: 110 },
      ],
    },
    dash_atk: {
      actionId: 'dash_atk',
      loop: false,
      cancelAfterMs: 180,
      steps: [
        { frame: P.DASH_THRUST, durationMs: 75, dx: 14, afterimage: true },
        {
          frame: P.STRIKE_1,
          durationMs: 120,
          dx: 10,
          afterimage: true,
          hitstopMs: 48,
          hitboxTag: 'dash_atk',
          vfx: [{ vfxId: 'slash_crescent', layer: 'front', offsetX: 24, offsetY: 0, offsetZ: 14, tint: secondary }],
        },
        { frame: P.IDLE_1, durationMs: 90 },
      ],
    },
    dash: {
      actionId: 'dash',
      loop: false,
      cancelAfterMs: 150,
      invulnWindow: [0, 280],
      steps: [
        {
          frame: P.DASH_THRUST,
          durationMs: 90,
          dx: 12,
          afterimage: true,
          vfx: [{ vfxId: 'dust_puff', layer: 'behind', offsetX: -10, offsetY: 0, offsetZ: 0 }],
        },
        { frame: P.DASH_THRUST, durationMs: 95, dx: 12, afterimage: true },
        { frame: P.WALK_3, durationMs: 75, dx: 4 },
      ],
    },
    guard: {
      actionId: 'guard',
      loop: false,
      cancelAfterMs: 260,
      steps: [
        { frame: P.GUARD_PARRY, durationMs: 180, flashColor: '#fef08a' },
        { frame: P.GUARD_PARRY, durationMs: 270 },
      ],
    },
    parry_ok: {
      actionId: 'parry_ok',
      loop: false,
      cancelAfterMs: 170,
      invulnWindow: [0, 340],
      superArmor: true,
      steps: [
        {
          frame: P.GUARD_PARRY,
          durationMs: 95,
          flashColor: '#fde047',
          hitstopMs: 70,
          vfx: [{ vfxId: 'parry_ring', layer: 'front', offsetX: 6, offsetY: 0, offsetZ: 16, tint: '#fde047', scale: 1.3 }],
          sfx: 'parry_clang',
        },
        {
          frame: P.STRIKE_3,
          durationMs: 145,
          dx: 8,
          afterimage: true,
          flashColor: '#fef08a',
          vfx: [{ vfxId: 'slash_cross_x', layer: 'front', offsetX: 22, offsetY: 0, offsetZ: 16, tint: '#fde047', scale: 1.35 }],
        },
        { frame: P.IDLE_1, durationMs: 90 },
      ],
    },
    hit: {
      actionId: 'hit',
      loop: false,
      steps: [
        { frame: P.HIT_STUN, durationMs: 110, dx: -5, flashColor: '#ffffff' },
        { frame: P.HIT_STUN, durationMs: 110, dx: -2 },
      ],
    },
    dead: {
      actionId: 'dead',
      loop: false,
      steps: [
        { frame: P.HIT_STUN, durationMs: 140, dx: -4 },
        { frame: P.DOWN_DEAD, durationMs: 999999 },
      ],
    },
    // Overridden per hero below
    skill1: { actionId: 'skill1', loop: false, steps: [{ frame: P.STRIKE_1, durationMs: 300 }] },
    skill2: { actionId: 'skill2', loop: false, steps: [{ frame: P.STRIKE_2, durationMs: 360 }] },
    skill3: { actionId: 'skill3', loop: false, steps: [{ frame: P.CAST_HOLD, durationMs: 360 }] },
    skill4: { actionId: 'skill4', loop: false, steps: [{ frame: P.STRIKE_3, durationMs: 380 }] },
    ultimate: { actionId: 'ultimate', loop: false, superArmor: true, invulnWindow: [0, 850], steps: [{ frame: P.CAST_HOLD, durationMs: 600 }] },
  };
}

function buildHeroTimelines(): Record<MkHeroId, Record<MkHeroActionId, MkChoreoTimeline>> {
  const knight = makeBaseHeroTimelines('#3b82f6', '#fde047');
  knight.skill1 = {
    actionId: 'skill1',
    loop: false,
    cancelAfterMs: 420,
    superArmor: true,
    invulnWindow: [0, 560],
    steps: [
      { frame: P.WINDUP, durationMs: 70 },
      { frame: P.AIR_SPIN, durationMs: 75, dz: 6, afterimage: true, vfx: [{ vfxId: 'whirlwind_360', layer: 'front', offsetX: 0, offsetY: 0, offsetZ: 14, tint: '#60a5fa' }] },
      { frame: P.STRIKE_1, durationMs: 75, dz: 6, afterimage: true, hitstopMs: 40, hitboxTag: 'spin1' },
      { frame: P.STRIKE_2, durationMs: 75, dz: 6, flipX: true, afterimage: true },
      { frame: P.STRIKE_1, durationMs: 75, dz: 4, afterimage: true, hitboxTag: 'spin2', vfx: [{ vfxId: 'lightning_bolt', layer: 'front', offsetX: 28, offsetY: 0, offsetZ: 0, tint: '#93c5fd', minSkillLevel: 5 }] },
      { frame: P.STRIKE_2, durationMs: 75, dz: 0, flipX: true },
      { frame: P.IDLE_1, durationMs: 90 },
    ],
  };
  knight.skill2 = {
    actionId: 'skill2',
    loop: false,
    cancelAfterMs: 460,
    superArmor: true,
    steps: [
      { frame: P.WINDUP, durationMs: 80 },
      { frame: P.AIR_SPIN, durationMs: 140, dx: 10, dz: 48, afterimage: true },
      {
        frame: P.STRIKE_3,
        durationMs: 180,
        dx: 12,
        dz: 0,
        flashColor: '#fef08a',
        hitstopMs: 75,
        hitboxTag: 'slam',
        vfx: [
          { vfxId: 'holy_pillar', layer: 'front', offsetX: 18, offsetY: 0, offsetZ: 0, tint: '#fde047', scale: 1.2 },
          { vfxId: 'ground_fissure', layer: 'ground', offsetX: 18, offsetY: 0, offsetZ: 0, tint: '#fef08a', minSkillLevel: 3 },
        ],
      },
      { frame: P.STRIKE_3, durationMs: 120 },
    ],
  };
  knight.skill3 = {
    actionId: 'skill3',
    loop: false,
    cancelAfterMs: 360,
    superArmor: true,
    steps: [
      { frame: P.GUARD_PARRY, durationMs: 80, flashColor: '#fde047', vfx: [{ vfxId: 'parry_ring', layer: 'front', offsetX: 10, offsetY: 0, offsetZ: 14, tint: '#fde047' }] },
      { frame: P.DASH_THRUST, durationMs: 110, dx: 18, afterimage: true, hitboxTag: 'charge1' },
      { frame: P.DASH_THRUST, durationMs: 110, dx: 18, afterimage: true, hitboxTag: 'charge2' },
      { frame: P.STRIKE_1, durationMs: 100, dx: 6, hitstopMs: 50, vfx: [{ vfxId: 'aura_fury', layer: 'behind', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#60a5fa' }] },
      { frame: P.GUARD_PARRY, durationMs: 80 },
    ],
  };
  knight.skill4 = {
    actionId: 'skill4',
    loop: false,
    cancelAfterMs: 340,
    steps: [
      { frame: P.WINDUP, durationMs: 90, flashColor: '#93c5fd' },
      {
        frame: P.STRIKE_3,
        durationMs: 135,
        dx: 6,
        afterimage: true,
        hitstopMs: 55,
        hitboxTag: 'wave',
        vfx: [{ vfxId: 'slash_crescent', layer: 'front', offsetX: 28, offsetY: 0, offsetZ: 16, tint: '#fde047', scale: 1.5 }],
      },
      { frame: P.STRIKE_1, durationMs: 110, dx: 4 },
      { frame: P.IDLE_1, durationMs: 90 },
    ],
  };
  knight.ultimate = {
    actionId: 'ultimate',
    loop: false,
    superArmor: true,
    invulnWindow: [0, 900],
    steps: [
      {
        frame: P.CAST_HOLD,
        durationMs: 190,
        flashColor: '#fef08a',
        vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#fde047', scale: 1.5 }],
      },
      { frame: P.CAST_HOLD, durationMs: 160, dz: 10, flashColor: '#ffffff' },
      { frame: P.AIR_SPIN, durationMs: 130, dz: 36, afterimage: true },
      {
        frame: P.STRIKE_3,
        durationMs: 260,
        dz: 0,
        flashColor: '#fde047',
        hitstopMs: 85,
        hitboxTag: 'ult',
        vfx: [
          { vfxId: 'holy_pillar', layer: 'front', offsetX: 30, offsetY: 0, offsetZ: 0, tint: '#fde047', scale: 1.8 },
          { vfxId: 'ground_fissure', layer: 'ground', offsetX: 30, offsetY: 0, offsetZ: 0, tint: '#fde047', scale: 1.6 },
        ],
      },
    ],
  };

  const archer = makeBaseHeroTimelines('#22c55e', '#38bdf8');
  archer.skill1 = {
    actionId: 'skill1',
    loop: false,
    cancelAfterMs: 340,
    steps: [
      { frame: P.WINDUP, durationMs: 90 },
      { frame: P.CAST_HOLD, durationMs: 130, flashColor: '#fef08a', vfx: [{ vfxId: 'aura_fury', layer: 'behind', offsetX: 0, offsetY: 0, offsetZ: 4, tint: '#fde047' }] },
      { frame: P.STRIKE_3, durationMs: 150, dx: -5, hitstopMs: 55, hitboxTag: 'snipe', vfx: [{ vfxId: 'hit_spark', layer: 'front', offsetX: 26, offsetY: 0, offsetZ: 18, tint: '#fde047', scale: 1.3 }] },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  archer.skill2 = {
    actionId: 'skill2',
    loop: false,
    cancelAfterMs: 380,
    steps: [
      { frame: P.WINDUP, durationMs: 75 },
      { frame: P.CAST_HOLD, durationMs: 110, vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#38bdf8' }] },
      { frame: P.STRIKE_2, durationMs: 120, hitboxTag: 'rain', vfx: [{ vfxId: 'frost_nova', layer: 'ground', offsetX: 110, offsetY: 0, offsetZ: 0, tint: '#38bdf8', scale: 1.3 }] },
      { frame: P.CAST_HOLD, durationMs: 95 },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  archer.skill3 = {
    actionId: 'skill3',
    loop: false,
    cancelAfterMs: 320,
    invulnWindow: [0, 260],
    steps: [
      { frame: P.AIR_SPIN, durationMs: 110, dx: -16, dz: 34, afterimage: true, vfx: [{ vfxId: 'whirlwind_360', layer: 'front', offsetX: 14, offsetY: 0, offsetZ: 8, tint: '#4ade80' }] },
      { frame: P.STRIKE_1, durationMs: 115, dx: -14, dz: 22, afterimage: true, hitboxTag: 'fan' },
      { frame: P.DASH_THRUST, durationMs: 95, dx: -8, dz: 0 },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  archer.skill4 = {
    actionId: 'skill4',
    loop: false,
    cancelAfterMs: 280,
    steps: [
      { frame: P.WINDUP, durationMs: 85 },
      { frame: P.STRIKE_2, durationMs: 140, hitboxTag: 'snare', vfx: [{ vfxId: 'lightning_bolt', layer: 'front', offsetX: 75, offsetY: 0, offsetZ: 0, tint: '#4ade80' }] },
      { frame: P.IDLE_1, durationMs: 95 },
    ],
  };
  archer.ultimate = {
    actionId: 'ultimate',
    loop: false,
    superArmor: true,
    invulnWindow: [0, 850],
    steps: [
      { frame: P.AIR_SPIN, durationMs: 160, dz: 42, afterimage: true, vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#4ade80', scale: 1.4 }] },
      { frame: P.CAST_HOLD, durationMs: 190, dz: 44, flashColor: '#fde047' },
      { frame: P.STRIKE_3, durationMs: 230, dx: -8, dz: 18, hitstopMs: 80, hitboxTag: 'ult', vfx: [{ vfxId: 'phoenix_flame', layer: 'front', offsetX: 40, offsetY: 0, offsetZ: 18, tint: '#fb923c', scale: 1.6 }] },
      { frame: P.IDLE_1, durationMs: 110, dz: 0 },
    ],
  };

  const rogue = makeBaseHeroTimelines('#eab308', '#c084fc');
  rogue.skill1 = {
    actionId: 'skill1',
    loop: false,
    cancelAfterMs: 360,
    steps: [
      { frame: P.WINDUP, durationMs: 55 },
      { frame: P.STRIKE_1, durationMs: 60, dx: 4, afterimage: true, hitboxTag: 'f1', vfx: [{ vfxId: 'slash_cross_x', layer: 'front', offsetX: 20, offsetY: 0, offsetZ: 14, tint: '#facc15' }] },
      { frame: P.STRIKE_2, durationMs: 60, dx: 4, afterimage: true },
      { frame: P.STRIKE_1, durationMs: 60, dx: 4, flipX: false, afterimage: true, hitboxTag: 'f2' },
      { frame: P.STRIKE_2, durationMs: 60, dx: 4, afterimage: true, vfx: [{ vfxId: 'slash_cross_x', layer: 'front', offsetX: 22, offsetY: 0, offsetZ: 16, tint: '#c084fc' }] },
      { frame: P.STRIKE_3, durationMs: 95, dx: 6, hitstopMs: 55, hitboxTag: 'f3', vfx: [{ vfxId: 'lightning_bolt', layer: 'front', offsetX: 26, offsetY: 0, offsetZ: 0, tint: '#c084fc', minSkillLevel: 5 }] },
      { frame: P.IDLE_1, durationMs: 70 },
    ],
  };
  rogue.skill2 = {
    actionId: 'skill2',
    loop: false,
    cancelAfterMs: 420,
    invulnWindow: [0, 440],
    steps: [
      { frame: P.DASH_THRUST, durationMs: 85, dx: 24, afterimage: true, flashColor: '#c084fc' },
      { frame: P.DASH_THRUST, durationMs: 85, dx: 24, flipX: true, afterimage: true, hitboxTag: 'raid1' },
      { frame: P.STRIKE_1, durationMs: 85, dx: 12, afterimage: true, vfx: [{ vfxId: 'slash_cross_x', layer: 'front', offsetX: 0, offsetY: 0, offsetZ: 16, tint: '#a855f7', scale: 1.3 }] },
      { frame: P.STRIKE_2, durationMs: 85, dx: 12, afterimage: true, hitboxTag: 'raid2' },
      { frame: P.STRIKE_3, durationMs: 110, hitstopMs: 65, vfx: [{ vfxId: 'slash_cross_x', layer: 'front', offsetX: 16, offsetY: 0, offsetZ: 16, tint: '#fde047', scale: 1.4 }] },
    ],
  };
  rogue.skill3 = {
    actionId: 'skill3',
    loop: false,
    cancelAfterMs: 280,
    steps: [
      { frame: P.AIR_SPIN, durationMs: 85, dz: 22, afterimage: true },
      { frame: P.STRIKE_1, durationMs: 95, dz: 14, hitboxTag: 'shuriken', vfx: [{ vfxId: 'hit_spark', layer: 'front', offsetX: 20, offsetY: 0, offsetZ: 16, tint: '#4ade80' }] },
      { frame: P.STRIKE_2, durationMs: 90, dz: 0 },
      { frame: P.IDLE_1, durationMs: 70 },
    ],
  };
  rogue.skill4 = {
    actionId: 'skill4',
    loop: false,
    cancelAfterMs: 260,
    invulnWindow: [0, 260],
    steps: [
      { frame: P.GUARD_PARRY, durationMs: 90, flashColor: '#c084fc', vfx: [{ vfxId: 'dust_puff', layer: 'front', offsetX: 0, offsetY: 0, offsetZ: 10, tint: '#a855f7', scale: 1.5 }] },
      { frame: P.DASH_THRUST, durationMs: 120, dx: -24, afterimage: true, hitboxTag: 'decoy' },
      { frame: P.IDLE_1, durationMs: 90 },
    ],
  };
  rogue.ultimate = {
    actionId: 'ultimate',
    loop: false,
    superArmor: true,
    invulnWindow: [0, 900],
    steps: [
      { frame: P.CAST_HOLD, durationMs: 150, flashColor: '#c084fc', vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#a855f7', scale: 1.5 }] },
      { frame: P.DASH_THRUST, durationMs: 90, dx: 20, afterimage: true },
      { frame: P.STRIKE_1, durationMs: 85, afterimage: true, hitboxTag: 'ult1', vfx: [{ vfxId: 'slash_cross_x', layer: 'front', offsetX: 20, offsetY: -10, offsetZ: 18, tint: '#c084fc', scale: 1.7 }] },
      { frame: P.STRIKE_2, durationMs: 85, flipX: true, afterimage: true },
      { frame: P.STRIKE_1, durationMs: 85, afterimage: true, vfx: [{ vfxId: 'slash_cross_x', layer: 'front', offsetX: -14, offsetY: 10, offsetZ: 18, tint: '#facc15', scale: 1.7 }] },
      { frame: P.STRIKE_3, durationMs: 190, hitstopMs: 85, hitboxTag: 'ult2', flashColor: '#fde047' },
    ],
  };

  const barbarian = makeBaseHeroTimelines('#ef4444', '#fb923c');
  barbarian.skill1 = {
    actionId: 'skill1',
    loop: false,
    cancelAfterMs: 320,
    steps: [
      { frame: P.WINDUP, durationMs: 90 },
      { frame: P.STRIKE_1, durationMs: 120, dx: 6, hitboxTag: 'throw', vfx: [{ vfxId: 'slash_crescent', layer: 'front', offsetX: 24, offsetY: 0, offsetZ: 16, tint: '#f97316', scale: 1.3 }] },
      { frame: P.STRIKE_2, durationMs: 110 },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  barbarian.skill2 = {
    actionId: 'skill2',
    loop: false,
    cancelAfterMs: 480,
    superArmor: true,
    steps: [
      { frame: P.WINDUP, durationMs: 95 },
      { frame: P.AIR_SPIN, durationMs: 145, dx: 10, dz: 48, afterimage: true },
      {
        frame: P.STRIKE_3,
        durationMs: 190,
        dx: 8,
        dz: 0,
        flashColor: '#fb923c',
        hitstopMs: 80,
        hitboxTag: 'slam',
        vfx: [
          { vfxId: 'ground_fissure', layer: 'ground', offsetX: 16, offsetY: 0, offsetZ: 0, tint: '#f97316', scale: 1.5 },
          { vfxId: 'fire_meteor', layer: 'front', offsetX: 16, offsetY: 0, offsetZ: 4, tint: '#ef4444', minSkillLevel: 3 },
        ],
      },
      { frame: P.STRIKE_3, durationMs: 110 },
    ],
  };
  barbarian.skill3 = {
    actionId: 'skill3',
    loop: false,
    cancelAfterMs: 340,
    superArmor: true,
    steps: [
      { frame: P.CAST_HOLD, durationMs: 140, flashColor: '#ef4444', vfx: [{ vfxId: 'aura_fury', layer: 'behind', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#ef4444', scale: 1.4 }] },
      { frame: P.CAST_HOLD, durationMs: 140, hitboxTag: 'warcry', vfx: [{ vfxId: 'parry_ring', layer: 'front', offsetX: 0, offsetY: 0, offsetZ: 16, tint: '#ef4444', scale: 1.5 }] },
      { frame: P.GUARD_PARRY, durationMs: 100 },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  barbarian.skill4 = {
    actionId: 'skill4',
    loop: false,
    cancelAfterMs: 380,
    superArmor: true,
    steps: [
      { frame: P.STRIKE_1, durationMs: 100, hitboxTag: 'hook', vfx: [{ vfxId: 'slash_crescent', layer: 'front', offsetX: 48, offsetY: 0, offsetZ: 14, tint: '#f97316', scale: 1.4 }] },
      { frame: P.WINDUP, durationMs: 110, dx: -4 },
      { frame: P.STRIKE_3, durationMs: 160, dx: 8, hitstopMs: 70, hitboxTag: 'cleave', vfx: [{ vfxId: 'ground_fissure', layer: 'ground', offsetX: 26, offsetY: 0, offsetZ: 0, tint: '#ef4444', scale: 1.3 }] },
      { frame: P.IDLE_1, durationMs: 90 },
    ],
  };
  barbarian.ultimate = {
    actionId: 'ultimate',
    loop: false,
    superArmor: true,
    invulnWindow: [0, 950],
    steps: [
      { frame: P.CAST_HOLD, durationMs: 170, flashColor: '#ef4444', vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#ef4444', scale: 1.6 }] },
      { frame: P.STRIKE_3, durationMs: 130, hitstopMs: 50, hitboxTag: 'ult1', vfx: [{ vfxId: 'ground_fissure', layer: 'ground', offsetX: 12, offsetY: 0, offsetZ: 0, tint: '#f97316', scale: 1.5 }] },
      { frame: P.AIR_SPIN, durationMs: 140, dz: 56, afterimage: true },
      { frame: P.STRIKE_3, durationMs: 260, dz: 0, hitstopMs: 85, hitboxTag: 'ult2', flashColor: '#fb923c', vfx: [{ vfxId: 'fire_meteor', layer: 'front', offsetX: 36, offsetY: 0, offsetZ: 0, tint: '#f97316', scale: 1.8 }] },
    ],
  };

  const mage = makeBaseHeroTimelines('#a855f7', '#f97316');
  mage.skill1 = {
    actionId: 'skill1',
    loop: false,
    cancelAfterMs: 360,
    steps: [
      { frame: P.CAST_HOLD, durationMs: 120, flashColor: '#fb923c', vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#f97316' }] },
      { frame: P.CAST_HOLD, durationMs: 110 },
      { frame: P.STRIKE_3, durationMs: 150, hitboxTag: 'meteor', vfx: [{ vfxId: 'fire_meteor', layer: 'front', offsetX: 85, offsetY: 0, offsetZ: 10, tint: '#f97316', scale: 1.3 }] },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  mage.skill2 = {
    actionId: 'skill2',
    loop: false,
    cancelAfterMs: 360,
    steps: [
      { frame: P.WINDUP, durationMs: 75 },
      { frame: P.CAST_HOLD, durationMs: 120, flashColor: '#93c5fd', vfx: [{ vfxId: 'aura_fury', layer: 'behind', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#a855f7' }] },
      { frame: P.STRIKE_1, durationMs: 115, hitstopMs: 50, hitboxTag: 'thunder', vfx: [{ vfxId: 'lightning_bolt', layer: 'front', offsetX: 60, offsetY: 0, offsetZ: 0, tint: '#c084fc', scale: 1.2 }] },
      { frame: P.STRIKE_2, durationMs: 90 },
      { frame: P.IDLE_1, durationMs: 75 },
    ],
  };
  mage.skill3 = {
    actionId: 'skill3',
    loop: false,
    cancelAfterMs: 320,
    steps: [
      { frame: P.CAST_HOLD, durationMs: 130, flashColor: '#c084fc' },
      { frame: P.STRIKE_2, durationMs: 140, hitboxTag: 'gravity', vfx: [{ vfxId: 'gravity_vortex', layer: 'ground', offsetX: 95, offsetY: 0, offsetZ: 0, tint: '#a855f7', scale: 1.4 }] },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  mage.skill4 = {
    actionId: 'skill4',
    loop: false,
    cancelAfterMs: 280,
    invulnWindow: [0, 300],
    steps: [
      { frame: P.DASH_THRUST, durationMs: 90, afterimage: true, flashColor: '#38bdf8', vfx: [{ vfxId: 'frost_nova', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#a855f7' }] },
      { frame: P.AIR_SPIN, durationMs: 95, dz: 14, afterimage: true, hitboxTag: 'blink' },
      { frame: P.CAST_HOLD, durationMs: 100, dz: 0, vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#38bdf8' }] },
      { frame: P.IDLE_1, durationMs: 70 },
    ],
  };
  mage.ultimate = {
    actionId: 'ultimate',
    loop: false,
    superArmor: true,
    invulnWindow: [0, 950],
    steps: [
      { frame: P.AIR_SPIN, durationMs: 140, dz: 30, flashColor: '#c084fc', vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#c084fc', scale: 1.8 }] },
      { frame: P.CAST_HOLD, durationMs: 180, dz: 30, flashColor: '#ffffff' },
      { frame: P.CAST_HOLD, durationMs: 160, dz: 30, hitboxTag: 'ult1', vfx: [{ vfxId: 'holy_pillar', layer: 'front', offsetX: 80, offsetY: 0, offsetZ: 0, tint: '#c084fc', scale: 1.9 }] },
      { frame: P.STRIKE_3, durationMs: 230, dz: 0, hitstopMs: 85, hitboxTag: 'ult2', vfx: [{ vfxId: 'gravity_vortex', layer: 'ground', offsetX: 80, offsetY: 0, offsetZ: 0, tint: '#facc15', scale: 1.7 }] },
    ],
  };

  const lancer = makeBaseHeroTimelines('#06b6d4', '#93c5fd');
  lancer.skill1 = {
    actionId: 'skill1',
    loop: false,
    cancelAfterMs: 360,
    superArmor: true,
    steps: [
      { frame: P.WINDUP, durationMs: 75 },
      { frame: P.DASH_THRUST, durationMs: 105, dx: 20, afterimage: true, hitboxTag: 'pierce1', vfx: [{ vfxId: 'dragon_spirit', layer: 'front', offsetX: 28, offsetY: 0, offsetZ: 14, tint: '#06b6d4', scale: 1.3 }] },
      { frame: P.DASH_THRUST, durationMs: 105, dx: 20, afterimage: true, hitboxTag: 'pierce2' },
      { frame: P.STRIKE_1, durationMs: 105, dx: 8, hitstopMs: 55 },
      { frame: P.IDLE_1, durationMs: 80 },
    ],
  };
  lancer.skill2 = {
    actionId: 'skill2',
    loop: false,
    cancelAfterMs: 380,
    steps: [
      { frame: P.AIR_SPIN, durationMs: 120, dz: 40, afterimage: true },
      { frame: P.STRIKE_2, durationMs: 115, dz: 26, hitboxTag: 'trilance', vfx: [{ vfxId: 'dragon_spirit', layer: 'front', offsetX: 46, offsetY: 0, offsetZ: 12, tint: '#38bdf8' }] },
      { frame: P.STRIKE_3, durationMs: 130, dz: 0, hitstopMs: 60, vfx: [{ vfxId: 'frost_nova', layer: 'ground', offsetX: 60, offsetY: 0, offsetZ: 0, tint: '#06b6d4', scale: 1.3 }] },
      { frame: P.IDLE_1, durationMs: 85 },
    ],
  };
  lancer.skill3 = {
    actionId: 'skill3',
    loop: false,
    cancelAfterMs: 420,
    steps: [
      { frame: P.WINDUP, durationMs: 60 },
      { frame: P.STRIKE_1, durationMs: 55, dx: 4, afterimage: true, hitboxTag: 't1', vfx: [{ vfxId: 'hit_spark', layer: 'front', offsetX: 38, offsetY: -4, offsetZ: 16, tint: '#38bdf8' }] },
      { frame: P.STRIKE_2, durationMs: 55, dx: 4, afterimage: true },
      { frame: P.STRIKE_1, durationMs: 55, dx: 4, afterimage: true, hitboxTag: 't2', vfx: [{ vfxId: 'hit_spark', layer: 'front', offsetX: 42, offsetY: 4, offsetZ: 14, tint: '#06b6d4' }] },
      { frame: P.STRIKE_2, durationMs: 55, dx: 4, afterimage: true },
      { frame: P.STRIKE_1, durationMs: 55, dx: 4, afterimage: true, hitboxTag: 't3' },
      { frame: P.STRIKE_3, durationMs: 115, dx: 8, hitstopMs: 65, vfx: [{ vfxId: 'dragon_spirit', layer: 'front', offsetX: 40, offsetY: 0, offsetZ: 14, tint: '#93c5fd', minSkillLevel: 5 }] },
    ],
  };
  lancer.skill4 = {
    actionId: 'skill4',
    loop: false,
    cancelAfterMs: 360,
    superArmor: true,
    steps: [
      { frame: P.GUARD_PARRY, durationMs: 260, flashColor: '#38bdf8', vfx: [{ vfxId: 'parry_ring', layer: 'front', offsetX: 0, offsetY: 0, offsetZ: 14, tint: '#06b6d4', scale: 1.2 }] },
      { frame: P.GUARD_PARRY, durationMs: 260 },
      { frame: P.STRIKE_3, durationMs: 140, dx: 6, hitboxTag: 'counter_release' },
    ],
  };
  lancer.ultimate = {
    actionId: 'ultimate',
    loop: false,
    superArmor: true,
    invulnWindow: [0, 950],
    steps: [
      { frame: P.CAST_HOLD, durationMs: 160, flashColor: '#38bdf8', vfx: [{ vfxId: 'magic_rune_25d', layer: 'ground', offsetX: 0, offsetY: 0, offsetZ: 0, tint: '#06b6d4', scale: 1.6 }] },
      { frame: P.AIR_SPIN, durationMs: 140, dz: 32, afterimage: true },
      { frame: P.DASH_THRUST, durationMs: 160, dx: 18, dz: 14, afterimage: true, hitboxTag: 'ult', vfx: [{ vfxId: 'dragon_spirit', layer: 'front', offsetX: 48, offsetY: 0, offsetZ: 16, tint: '#22d3ee', scale: 1.8 }] },
      { frame: P.STRIKE_3, durationMs: 210, dz: 0, hitstopMs: 85, vfx: [{ vfxId: 'frost_nova', layer: 'ground', offsetX: 64, offsetY: 0, offsetZ: 0, tint: '#38bdf8', scale: 1.7 }] },
    ],
  };

  return { knight, archer, rogue, barbarian, mage, lancer };
}

export const MK_HERO_CHOREO: Record<MkHeroId, Record<MkHeroActionId, MkChoreoTimeline>> = buildHeroTimelines();

const EP = ENEMY_POSE;
const BP = BOSS_POSE;

export const MK_REGULAR_ENEMY_CHOREO: Record<MkEnemyActionId, MkChoreoTimeline> = {
  idle: { actionId: 'idle', loop: true, steps: [{ frame: EP.IDLE_1, durationMs: 360 }, { frame: EP.IDLE_2, durationMs: 360 }] },
  walk: {
    actionId: 'walk',
    loop: true,
    steps: [
      { frame: EP.WALK_1, durationMs: 120 },
      { frame: EP.WALK_2, durationMs: 110 },
      { frame: EP.WALK_3, durationMs: 120 },
      { frame: EP.WALK_2, durationMs: 110 },
    ],
  },
  windup: { actionId: 'windup', loop: false, steps: [{ frame: EP.WINDUP, durationMs: 260, flashColor: '#f87171' }] },
  attack: {
    actionId: 'attack',
    loop: false,
    steps: [
      { frame: EP.WINDUP, durationMs: 110 },
      { frame: EP.ATTACK_1, durationMs: 140, dx: 4 },
      { frame: EP.ATTACK_2, durationMs: 130 },
    ],
  },
  slam: {
    actionId: 'slam',
    loop: false,
    steps: [
      { frame: EP.WINDUP, durationMs: 130 },
      { frame: EP.ATTACK_2, durationMs: 180, dx: 5 },
    ],
  },
  special: {
    actionId: 'special',
    loop: false,
    steps: [
      { frame: EP.WINDUP, durationMs: 140, flashColor: '#fbbf24' },
      { frame: EP.ATTACK_2, durationMs: 180 },
    ],
  },
  charge: {
    actionId: 'charge',
    loop: true,
    steps: [
      { frame: EP.WALK_1, durationMs: 85, dx: 3, afterimage: true },
      { frame: EP.WALK_3, durationMs: 85, dx: 3, afterimage: true },
    ],
  },
  enrage: { actionId: 'enrage', loop: false, steps: [{ frame: EP.WINDUP, durationMs: 240, flashColor: '#ef4444' }] },
  hit: { actionId: 'hit', loop: false, steps: [{ frame: EP.HIT_STUN, durationMs: 180, dx: -4, flashColor: '#ffffff' }] },
  dead: {
    actionId: 'dead',
    loop: false,
    steps: [
      { frame: EP.DEAD_1, durationMs: 160 },
      { frame: EP.DEAD_2, durationMs: 420 },
    ],
  },
};

export const MK_ELITE_ENEMY_CHOREO: Record<MkEnemyActionId, MkChoreoTimeline> = {
  ...MK_REGULAR_ENEMY_CHOREO,
  special: {
    actionId: 'special',
    loop: false,
    steps: [
      { frame: EP.WINDUP, durationMs: 130, flashColor: '#38bdf8' },
      { frame: EP.SPECIAL_CAST, durationMs: 210, flashColor: '#f43f5e' },
      { frame: EP.IDLE_1, durationMs: 100 },
    ],
  },
};

export const MK_BOSS_CHOREO: Record<MkEnemyActionId, MkChoreoTimeline> = {
  idle: { actionId: 'idle', loop: true, steps: [{ frame: BP.IDLE_1, durationMs: 380 }, { frame: BP.IDLE_2, durationMs: 380 }] },
  walk: {
    actionId: 'walk',
    loop: true,
    steps: [
      { frame: BP.WALK_1, durationMs: 135 },
      { frame: BP.WALK_2, durationMs: 120 },
      { frame: BP.WALK_3, durationMs: 135 },
      { frame: BP.WALK_2, durationMs: 120 },
    ],
  },
  windup: {
    actionId: 'windup',
    loop: false,
    steps: [
      { frame: BP.TELEGRAPH_CHARGE, durationMs: 220, flashColor: '#ef4444' },
      { frame: BP.TELEGRAPH_CHARGE, durationMs: 220, flashColor: '#fde047' },
    ],
  },
  attack: {
    actionId: 'attack',
    loop: false,
    steps: [
      { frame: BP.TELEGRAPH_CHARGE, durationMs: 140 },
      { frame: BP.ATTACK_1, durationMs: 140, dx: 6 },
      { frame: BP.ATTACK_2, durationMs: 160, dx: 6 },
      { frame: BP.IDLE_1, durationMs: 100 },
    ],
  },
  slam: {
    actionId: 'slam',
    loop: false,
    steps: [
      { frame: BP.TELEGRAPH_CHARGE, durationMs: 180, dz: 18, flashColor: '#ef4444' },
      { frame: BP.SLAM_IMPACT, durationMs: 240, dz: 0, flashColor: '#fb923c' },
      { frame: BP.IDLE_1, durationMs: 120 },
    ],
  },
  special: {
    actionId: 'special',
    loop: false,
    steps: [
      { frame: BP.TELEGRAPH_CHARGE, durationMs: 160, flashColor: '#c084fc' },
      { frame: BP.SPECIAL_CAST, durationMs: 260, flashColor: '#fde047' },
      { frame: BP.IDLE_1, durationMs: 120 },
    ],
  },
  charge: {
    actionId: 'charge',
    loop: true,
    steps: [
      { frame: BP.DASH_CHARGE, durationMs: 120, dx: 10, afterimage: true },
      { frame: BP.DASH_CHARGE, durationMs: 120, dx: 10, afterimage: true, flashColor: '#fb923c' },
    ],
  },
  enrage: {
    actionId: 'enrage',
    loop: false,
    steps: [
      { frame: BP.ENRAGE_ROAR, durationMs: 220, flashColor: '#ef4444' },
      { frame: BP.ENRAGE_ROAR, durationMs: 220, flashColor: '#fde047' },
      { frame: BP.ENRAGE_ROAR, durationMs: 200, flashColor: '#ef4444' },
    ],
  },
  hit: { actionId: 'hit', loop: false, steps: [{ frame: BP.STAGGER_HIT, durationMs: 220, dx: -3, flashColor: '#ffffff' }] },
  dead: {
    actionId: 'dead',
    loop: false,
    steps: [
      { frame: BP.DEFEAT_1, durationMs: 280 },
      { frame: BP.DEFEAT_2, durationMs: 700 },
    ],
  },
};

export function getHeroChoreoTimeline(heroId: MkHeroId, actionId: MkHeroActionId): MkChoreoTimeline {
  return MK_HERO_CHOREO[heroId][actionId] ?? MK_HERO_CHOREO[heroId].idle;
}

export function getEnemyChoreoTimeline(kind: MkAnyEnemyId, actionId: MkEnemyActionId): MkChoreoTimeline {
  const spec = MK_ENEMIES[kind];
  if (spec.isBoss) return MK_BOSS_CHOREO[actionId] ?? MK_BOSS_CHOREO.idle;
  if (spec.frameCount >= 12) return MK_ELITE_ENEMY_CHOREO[actionId] ?? MK_ELITE_ENEMY_CHOREO.idle;
  return MK_REGULAR_ENEMY_CHOREO[actionId] ?? MK_REGULAR_ENEMY_CHOREO.idle;
}

export function getTimelineTotalMs(timeline: MkChoreoTimeline): number {
  let total = 0;
  for (let i = 0; i < timeline.steps.length; i++) total += timeline.steps[i].durationMs;
  return Math.max(1, total);
}

export interface MkResolvedStep {
  step: MkChoreoStep;
  stepIndex: number;
  stepElapsedMs: number;
  progress: number;
  finished: boolean;
}

export function resolveChoreoStepAtMs(timeline: MkChoreoTimeline, elapsedMs: number): MkResolvedStep {
  const total = getTimelineTotalMs(timeline);
  const clamped = elapsedMs < 0 ? 0 : elapsedMs;
  const t = timeline.loop ? clamped % total : Math.min(clamped, total);
  let acc = 0;
  for (let i = 0; i < timeline.steps.length; i++) {
    const step = timeline.steps[i];
    if (t < acc + step.durationMs || i === timeline.steps.length - 1) {
      return {
        step,
        stepIndex: i,
        stepElapsedMs: Math.max(0, t - acc),
        progress: Math.min(1, t / total),
        finished: !timeline.loop && clamped >= total,
      };
    }
    acc += step.durationMs;
  }
  const last = timeline.steps[timeline.steps.length - 1];
  return { step: last, stepIndex: timeline.steps.length - 1, stepElapsedMs: last.durationMs, progress: 1, finished: !timeline.loop };
}

export const MK_PIXEL_ATLAS_SPECS: Record<MkHeroId | MkAnyEnemyId, MkPixelAtlasSpec> = (() => {
  const out = {} as Record<MkHeroId | MkAnyEnemyId, MkPixelAtlasSpec>;
  for (const heroId of MK_HERO_IDS) {
    const h = MK_HEROES[heroId];
    out[heroId] = {
      entityId: heroId,
      category: 'hero',
      atlasPath: `${MK_STATIC_ROOT}/sprites/heroes/${heroId}.png`,
      portraitPath: `${MK_STATIC_ROOT}/portraits/${heroId}.png`,
      cellW: MK_HERO_CELL_PX,
      cellH: MK_HERO_CELL_PX,
      anchorX: MK_HERO_ANCHOR_X,
      anchorY: MK_HERO_ANCHOR_Y,
      frameCount: MK_HERO_MASTER_FRAMES,
      paletteAccent: h.accentColor,
    };
  }
  for (const enemyId of MK_ENEMY_IDS) {
    const e = MK_ENEMIES[enemyId];
    out[enemyId] = {
      entityId: enemyId,
      category: 'enemy',
      atlasPath: `${MK_STATIC_ROOT}/sprites/enemies/${enemyId}.png`,
      cellW: e.cellW,
      cellH: e.cellH,
      anchorX: e.anchorX,
      anchorY: e.anchorY,
      frameCount: e.frameCount,
      paletteAccent: e.accentColor,
    };
  }
  for (const bossId of MK_BOSS_IDS) {
    const b = MK_ENEMIES[bossId];
    out[bossId] = {
      entityId: bossId,
      category: 'boss',
      atlasPath: `${MK_STATIC_ROOT}/sprites/bosses/${bossId}.png`,
      cellW: b.cellW,
      cellH: b.cellH,
      anchorX: b.anchorX,
      anchorY: b.anchorY,
      frameCount: b.frameCount,
      paletteAccent: b.accentColor,
    };
  }
  return out;
})();
