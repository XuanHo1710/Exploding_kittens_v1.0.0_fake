import {
  BANSUNG_HERO_INDEX,
  BANSUNG_PFLAG_DASHING,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_STATIC_ROOT,
  BansungRegistry,
  type BansungHeroId,
  type BansungWeaponId,
  type RegistryEntry,
} from './types';

/** Miragine-compatible sprite strip tuple: `[frames, cellW, cellH, offX, offY]`. */
export type BansungAnimMeta = readonly [
  frames: number,
  cellW: number,
  cellH: number,
  offX: number,
  offY: number,
];

export type BansungHeroAnimState = 'idle' | 'run' | 'shoot' | 'dash' | 'stunned' | 'dead';
export type BansungMiragineHeroUnitId = 'A0' | 'A11' | 'A5' | 'A8';

export interface BansungVec2 {
  readonly x: number;
  readonly y: number;
}

export interface BansungHeroAnimSpec {
  readonly meta: BansungAnimMeta;
  readonly frames: number;
  readonly cellW: 48;
  readonly cellH: 48;
  readonly offX: -24;
  readonly offY: -44;
  readonly fps: number;
  readonly loop: boolean;
  readonly nativeFacing: 'right' | 'left';
}

export interface BansungMiragineFallbackSpec {
  readonly unitId: BansungMiragineHeroUnitId;
  readonly nativeFacing: 'left';
  readonly anims: {
    readonly idle: BansungAnimMeta;
    readonly run: BansungAnimMeta;
    readonly attack: BansungAnimMeta;
    readonly dead: BansungAnimMeta;
  };
}

export interface BansungHeroRigSpec {
  readonly nativeFacing: 1 | -1;
  /** Shoulder anchor relative to foot `(x, y)` in unflipped right-facing px. */
  readonly shoulderOffset: BansungVec2;
  /** Default barrel tip anchor relative to foot `(x, y)` at aim = 0 rad. */
  readonly muzzleOffset: BansungVec2;
  readonly shoulderOffsetX: number;
  readonly shoulderLiftY: number;
  readonly headTopY: number;
  readonly bobY: readonly number[];
  readonly scale: number;
}

export interface BansungWeaponRigSpec {
  readonly id: string;
  readonly holdType: 'pistol' | 'rifle' | 'heavy' | 'staff' | 'melee';
  readonly cellW: number;
  readonly cellH: number;
  readonly gripX: number;
  readonly gripY: number;
  readonly muzzleX: number;
  readonly muzzleY: number;
  readonly ejectX: number;
  readonly ejectY: number;
  readonly shoulderR: number;
  readonly recoilKick: number;
  readonly restTiltRad?: number;
  readonly scale: number;
}

export interface BansungAimRigResult {
  readonly facingRight: boolean;
  readonly gunFlipY: 1 | -1;
  readonly zOrder: 'behind' | 'front';
  readonly aimTheta: number;
  readonly drawTheta: number;
  readonly shoulderX: number;
  readonly shoulderY: number;
  readonly gripX: number;
  readonly gripY: number;
  readonly muzzleX: number;
  readonly muzzleY: number;
  readonly ejectX: number;
  readonly ejectY: number;
}

export interface BansungHeroDashSpec {
  readonly durationMs: number;
  readonly durationS: number;
  readonly distancePx: number;
  readonly iframeMs: number;
  readonly iframeS: number;
  readonly cooldownMs: number;
  readonly cooldownS: number;
  readonly bufferMs: number;
  readonly bufferS: number;
  readonly energyCost: number;
  readonly maxSubstepPx: number;
  readonly ghostTint: string;
}

export interface BansungHeroActiveSkillSpec {
  readonly id: string;
  readonly name: string;
  readonly vnName: string;
  readonly desc: string;
  readonly cooldownMs: number;
  readonly energyCost: number;
  readonly durationMs: number;
  readonly accentHex: string;
}

export interface BansungHeroSpec extends RegistryEntry {
  readonly id: BansungHeroId;
  readonly numId: number;
  readonly name: string;
  readonly silhouette: string;
  readonly primaryHex: string;
  readonly accentHex: string;
  readonly outlineHex: string;
  readonly hp: number;
  readonly shield: number;
  readonly energy: number;
  readonly energyRegenPerS: number;
  readonly energyRegenDelayMs: number;
  readonly energyRegenDelayTicks: number;
  readonly speed: number;
  readonly radius: number;
  readonly starterWeapon: BansungWeaponId;
  readonly sidearmWeapon: BansungWeaponId;
  readonly pixelScale: number;
  readonly rig: BansungHeroRigSpec;
  readonly defaultWeaponRig: BansungWeaponRigSpec;
  readonly dash: BansungHeroDashSpec;
  readonly activeSkill: BansungHeroActiveSkillSpec;
  readonly anims: Readonly<Record<BansungHeroAnimState, BansungHeroAnimSpec>>;
  readonly miragineFallback: BansungMiragineFallbackSpec;
}

export type BansungPetKind = 'tiger' | 'cat';
/** 0=idle, 1=trot, 2=pounce, 3=fire */
export type BansungPetStateId = 0 | 1 | 2 | 3;
export type BansungPetAnimAction = 'idle' | 'trot' | 'pounce' | 'fire';
export type BansungPetNetTuple = readonly [x: number, y: number, state: BansungPetStateId, left: 0 | 1];

export interface BansungPetPalette {
  readonly outline: string;
  readonly coat: string;
  readonly shade: string;
  readonly stripe: string;
  readonly belly: string;
  readonly nose: string;
  readonly eye: string;
}

export interface BansungPetAnimSpec {
  readonly meta: BansungAnimMeta;
  readonly fps: number;
  readonly loop: boolean;
  readonly nativeFacing: 'left';
  readonly sheetPath: string;
}

export interface BansungPetTuning {
  readonly FOLLOW_X: number;
  readonly FOLLOW_Y: number;
  readonly SPRING_K: number;
  readonly DAMPING: number;
  readonly MAX_SPEED: number;
  readonly LEASH_MAX: number;
  readonly TELEPORT_DIST: number;
  readonly MAGNET_RADIUS: number;
  readonly MAGNET_PULL: number;
  readonly MAGNET_CAPTURE_RADIUS: number;
  readonly POUNCE_RANGE: number;
  readonly POUNCE_SPEED: number;
  readonly POUNCE_DUR: number;
  readonly POUNCE_STEER_DUR: number;
  readonly POUNCE_HIT_RADIUS: number;
  readonly POUNCE_DMG: number;
  readonly POUNCE_KNOCK: number;
  readonly POUNCE_CD: number;
  readonly FIRE_MIN_RANGE: number;
  readonly FIRE_RANGE: number;
  readonly FIRE_DUR: number;
  readonly FIRE_DMG: number;
  readonly FIRE_SPEED: number;
  readonly FIRE_RADIUS: number;
  readonly FIRE_TTL: number;
  readonly FIRE_CD: number;
  readonly FIRE_BURN_CHANCE: number;
  readonly FIRE_BURN_DUR: number;
  readonly FIRE_BURN_DPS: number;
}

export interface BansungPetSpec {
  readonly id: BansungPetKind;
  readonly name: string;
  readonly nativeFacing: 'left';
  readonly cellW: 32;
  readonly cellH: 32;
  readonly offX: -16;
  readonly offY: -28;
  readonly bodyW: number;
  readonly bodyH: number;
  readonly shadowMeta: BansungAnimMeta;
  readonly shadowSize: { readonly w: number; readonly h: number };
  readonly tuning: BansungPetTuning;
  readonly anims: Readonly<Record<BansungPetAnimAction, BansungPetAnimSpec>>;
  readonly fireballAnim: {
    readonly meta: BansungAnimMeta;
    readonly fps: number;
    readonly scale: number;
    readonly sheetPath: string;
  };
  readonly palette: BansungPetPalette;
  readonly variants: Readonly<Record<BansungPetKind, BansungPetPalette>>;
}

export const BANSUNG_HERO_PIXEL_SCALE = 1.5;
export const BANSUNG_SHADOW_META: BansungAnimMeta = [1, 38, 16, -19, -8];

export const BANSUNG_DASH = {
  DURATION_S: 0.24,
  DURATION_MS: 240,
  DISTANCE_PX: 140,
  IFRAME_S: 0.24,
  IFRAME_MS: 240,
  COOLDOWN_S: 0.03,
  COOLDOWN_MS: 30,
  BUFFER_S: 0.14,
  BUFFER_MS: 140,
  ENERGY_COST: 0,
  HERO_RADIUS: 13,
  MAX_SUBSTEP_PX: 11.5,
  GHOST_U: [0.08, 0.28, 0.48, 0.68] as const,
  GHOST_LIFE_S: 0.18,
  GHOST_POOL_SIZE: 64,
  PLAYER_FLAG_DASH: BANSUNG_PFLAG_DASHING,
  PLAYER_FLAG_INVULN: BANSUNG_PFLAG_INVULN,
} as const;

export const BANSUNG_STAMINA = {
  BASE_MAX: 100,
  DASH_COST: 25,
  REGEN_PER_S: 28,
  REGEN_DELAY_S: 0.25,
  REGEN_DELAY_MS: 250,
} as const;

export const BANSUNG_AIM_CONSTANTS = {
  FACING_HYST_COS: 0.08,
  BEHIND_SIN_THRESH: -0.15,
  MIN_PARALLAX_DIST: 22,
  DEADZONE_AIM_R: 12,
  AIM_WIRE_SCALE: 1000,
} as const;

export const BANSUNG_HERO_ENERGY_REGEN = {
  PER_S: 12.0,
  DELAY_TICKS: 15,
  DELAY_MS: 500,
  WAVE_RESTORE: 0.40,
  REVIVE_FLOOR: 0.50,
} as const;

const makeHeroAnimSpec = (
  frames: number,
  fps: number,
  loop: boolean,
): BansungHeroAnimSpec => ({
  meta: [frames, 48, 48, -24, -44],
  frames,
  cellW: 48,
  cellH: 48,
  offX: -24,
  offY: -44,
  fps,
  loop,
  nativeFacing: 'right',
});

export const BANSUNG_HERO_ANIM_SPECS: Readonly<Record<BansungHeroAnimState, BansungHeroAnimSpec>> = {
  // Đêm Zombie v2 (spec 007): số frame khớp `tools/bansung/night_art/heroes.py` FRAMES
  idle: makeHeroAnimSpec(6, 7, true),
  run: makeHeroAnimSpec(8, 14, true),
  shoot: makeHeroAnimSpec(4, 24, false),
  dash: makeHeroAnimSpec(6, 25, false),
  stunned: makeHeroAnimSpec(4, 8, true),
  dead: makeHeroAnimSpec(6, 12, false),
};

/**
 * Nhịp chạy 8 frame. Bob & co giãn đã VẼ SẴN trong sprite (heroes.py RUN_BOB) → ở đây giữ
 * sx/sy = 1, dy = 0 để không nhân đôi chuyển động và không làm méo pixel art (scale lẻ gây răng cưa).
 * `stepSfx` đặt tại 2 frame chạm đất (0 và 4).
 */
export const BANSUNG_HERO_RUN_CADENCE = [
  { dy: 0, sx: 1, sy: 1, stepSfx: true },
  { dy: 0, sx: 1, sy: 1, stepSfx: false },
  { dy: 0, sx: 1, sy: 1, stepSfx: false },
  { dy: 0, sx: 1, sy: 1, stepSfx: false },
  { dy: 0, sx: 1, sy: 1, stepSfx: true },
  { dy: 0, sx: 1, sy: 1, stepSfx: false },
  { dy: 0, sx: 1, sy: 1, stepSfx: false },
  { dy: 0, sx: 1, sy: 1, stepSfx: false },
] as const;

export const BANSUNG_HERO_DASH_CADENCE = [
  { startMs: 0, endMs: 55, sx: 1.04, sy: 0.96, dy: 1, dust: false },
  { startMs: 55, endMs: 155, sx: 1.06, sy: 0.95, dy: -2, dust: false },
  { startMs: 155, endMs: 230, sx: 1.02, sy: 0.98, dy: -2, dust: false },
  { startMs: 230, endMs: 280, sx: 1.03, sy: 0.97, dy: 0, dust: true },
] as const;

/** Bob vai khi chạy (px thế giới, + là xuống) = RUN_BOB của sprite × pixelScale 1.5. */
const HERO_RUN_BOB_Y = [1.5, 0, -1.5, 0, 1.5, 0, -1.5, 0] as const;

const makeDashSpec = (cooldownMs: number, ghostTint: string): BansungHeroDashSpec => ({
  durationMs: BANSUNG_DASH.DURATION_MS,
  durationS: BANSUNG_DASH.DURATION_S,
  distancePx: BANSUNG_DASH.DISTANCE_PX,
  iframeMs: BANSUNG_DASH.IFRAME_MS,
  iframeS: BANSUNG_DASH.IFRAME_S,
  cooldownMs,
  cooldownS: Number((cooldownMs / 1000).toFixed(2)),
  bufferMs: BANSUNG_DASH.BUFFER_MS,
  bufferS: BANSUNG_DASH.BUFFER_S,
  energyCost: BANSUNG_DASH.ENERGY_COST,
  maxSubstepPx: BANSUNG_DASH.MAX_SUBSTEP_PX,
  ghostTint,
});

const makeHeroRig = (
  shoulderX: number,
  shoulderY: number,
  headTopY: number,
  weaponRig: BansungWeaponRigSpec,
): BansungHeroRigSpec => {
  const muzzleDx = weaponRig.shoulderR + (weaponRig.muzzleX - weaponRig.gripX) * weaponRig.scale;
  const muzzleDy = (weaponRig.muzzleY - weaponRig.gripY) * weaponRig.scale;
  return {
    nativeFacing: 1,
    shoulderOffset: { x: shoulderX, y: shoulderY },
    muzzleOffset: {
      x: Math.round(shoulderX + muzzleDx),
      y: Math.round(shoulderY + muzzleDy),
    },
    shoulderOffsetX: shoulderX,
    shoulderLiftY: -shoulderY,
    headTopY,
    bobY: HERO_RUN_BOB_Y,
    scale: 1,
  };
};

const MASCOT_WEAPON_RIG: BansungWeaponRigSpec = {
  id: 'rifle',
  holdType: 'rifle',
  cellW: 32,
  cellH: 16,
  gripX: 10,
  gripY: 10,
  muzzleX: 30,
  muzzleY: 7,
  ejectX: 15,
  ejectY: 7,
  shoulderR: 8,
  recoilKick: 4,
  scale: 1,
};

const RANGER_WEAPON_RIG: BansungWeaponRigSpec = {
  id: 'smg',
  holdType: 'rifle',
  cellW: 32,
  cellH: 16,
  gripX: 11,
  gripY: 10,
  muzzleX: 27,
  muzzleY: 8,
  ejectX: 15,
  ejectY: 7,
  shoulderR: 7,
  recoilKick: 3,
  scale: 1,
};

const PYRO_WEAPON_RIG: BansungWeaponRigSpec = {
  id: 'plasma_rifle',
  holdType: 'rifle',
  cellW: 32,
  cellH: 16,
  gripX: 10,
  gripY: 10,
  muzzleX: 29,
  muzzleY: 8,
  ejectX: 15,
  ejectY: 8,
  shoulderR: 8,
  recoilKick: 4,
  scale: 1,
};

const KNIGHT_WEAPON_RIG: BansungWeaponRigSpec = {
  id: 'shotgun',
  holdType: 'heavy',
  cellW: 32,
  cellH: 16,
  gripX: 10,
  gripY: 10,
  muzzleX: 30,
  muzzleY: 7,
  ejectX: 16,
  ejectY: 7,
  shoulderR: 9,
  recoilKick: 6,
  scale: 1,
};

const LASER_WEAPON_RIG: BansungWeaponRigSpec = {
  id: 'laser_cannon',
  holdType: 'heavy',
  cellW: 44,
  cellH: 18,
  gripX: 12,
  gripY: 10,
  muzzleX: 41,
  muzzleY: 8,
  ejectX: 16,
  ejectY: 8,
  shoulderR: 9,
  recoilKick: 8,
  scale: 1,
};

export const BANSUNG_HEROES: Readonly<Record<BansungHeroId, BansungHeroSpec>> = {
  mascot: {
    id: 'mascot',
    numId: BANSUNG_HERO_INDEX.mascot,
    name: 'Mascot Gunner',
    silhouette: 'White hoodie with animal ears and sky-blue scarf',
    primaryHex: '#f8f9fa',
    accentHex: '#4dabf7',
    outlineHex: '#1a1622',
    hp: 6,
    shield: 5,
    energy: 200,
    energyRegenPerS: BANSUNG_HERO_ENERGY_REGEN.PER_S,
    energyRegenDelayMs: BANSUNG_HERO_ENERGY_REGEN.DELAY_MS,
    energyRegenDelayTicks: BANSUNG_HERO_ENERGY_REGEN.DELAY_TICKS,
    speed: 195,
    radius: BANSUNG_DASH.HERO_RADIUS,
    starterWeapon: 'rifle',
    sidearmWeapon: 'pistol',
    pixelScale: BANSUNG_HERO_PIXEL_SCALE,
    rig: makeHeroRig(4, -33, -58, MASCOT_WEAPON_RIG),
    defaultWeaponRig: MASCOT_WEAPON_RIG,
    dash: makeDashSpec(30, '#ffd43b'),
    activeSkill: {
      id: 'supply_overdrive',
      name: 'Supply Overdrive',
      vnName: 'Tiếp Đạn Cuồng Nộ',
      desc: 'Nạp đầy băng đạn ngay, +45% tốc bắn & +25% tốc chạy trong 4.5s',
      cooldownMs: 10000,
      energyCost: 18,
      durationMs: 4500,
      accentHex: '#4dabf7',
    },
    anims: BANSUNG_HERO_ANIM_SPECS,
    miragineFallback: {
      unitId: 'A0',
      nativeFacing: 'left',
      anims: {
        idle: [3, 62, 53, -31, -53],
        run: [6, 46, 52, -26, -49],
        attack: [5, 88, 66, -63, -65],
        dead: [6, 99, 74, -26, -60],
      },
    },
  },
  ranger: {
    id: 'ranger',
    numId: BANSUNG_HERO_INDEX.ranger,
    name: 'Cyber Ranger',
    silhouette: 'Hooded recon cloak with neon-cyan visor',
    primaryHex: '#1e293b',
    accentHex: '#22d3ee',
    outlineHex: '#1a1622',
    hp: 5,
    shield: 4,
    energy: 220,
    energyRegenPerS: BANSUNG_HERO_ENERGY_REGEN.PER_S,
    energyRegenDelayMs: BANSUNG_HERO_ENERGY_REGEN.DELAY_MS,
    energyRegenDelayTicks: BANSUNG_HERO_ENERGY_REGEN.DELAY_TICKS,
    speed: 220,
    radius: BANSUNG_DASH.HERO_RADIUS,
    starterWeapon: 'smg',
    sidearmWeapon: 'pistol',
    pixelScale: BANSUNG_HERO_PIXEL_SCALE,
    rig: makeHeroRig(4, -33, -56, RANGER_WEAPON_RIG),
    defaultWeaponRig: RANGER_WEAPON_RIG,
    dash: makeDashSpec(30, '#4dabf7'),
    activeSkill: {
      id: 'phantom_volley',
      name: 'Phantom Volley',
      vnName: 'Mưa Tiễn Ảnh',
      desc: 'Bắn quạt 7 mũi xuyên giáp + tăng 35% tốc chạy trong 3.0s',
      cooldownMs: 9000,
      energyCost: 20,
      durationMs: 3000,
      accentHex: '#22d3ee',
    },
    anims: BANSUNG_HERO_ANIM_SPECS,
    miragineFallback: {
      unitId: 'A11',
      nativeFacing: 'left',
      anims: {
        idle: [3, 62, 51, -32, -51],
        run: [3, 56, 48, -34, -46],
        attack: [6, 82, 51, -56, -51],
        dead: [4, 78, 60, -26, -53],
      },
    },
  },
  pyro: {
    id: 'pyro',
    numId: BANSUNG_HERO_INDEX.pyro,
    name: 'Pyromancer',
    silhouette: 'Crimson-gold alchemist hood with ember trim',
    primaryHex: '#c92a2a',
    accentHex: '#ff922b',
    outlineHex: '#1a1622',
    hp: 5,
    shield: 4,
    energy: 260,
    energyRegenPerS: BANSUNG_HERO_ENERGY_REGEN.PER_S,
    energyRegenDelayMs: BANSUNG_HERO_ENERGY_REGEN.DELAY_MS,
    energyRegenDelayTicks: BANSUNG_HERO_ENERGY_REGEN.DELAY_TICKS,
    speed: 190,
    radius: BANSUNG_DASH.HERO_RADIUS,
    starterWeapon: 'plasma_rifle',
    sidearmWeapon: 'pistol',
    pixelScale: BANSUNG_HERO_PIXEL_SCALE,
    rig: makeHeroRig(4, -33, -58, PYRO_WEAPON_RIG),
    defaultWeaponRig: PYRO_WEAPON_RIG,
    dash: makeDashSpec(30, '#ff922b'),
    activeSkill: {
      id: 'inferno_nova',
      name: 'Inferno Supernova',
      vnName: 'Siêu Tân Tinh Lửa',
      desc: 'Nổ vòng lửa 240px thiêu đốt quái + hồi 8 Khiên & kích hoạt hồi khiên dần',
      cooldownMs: 11000,
      energyCost: 22,
      durationMs: 2500,
      accentHex: '#ff922b',
    },
    anims: BANSUNG_HERO_ANIM_SPECS,
    miragineFallback: {
      unitId: 'A5',
      nativeFacing: 'left',
      anims: {
        idle: [3, 57, 49, -40, -48],
        run: [6, 49, 58, -28, -56],
        attack: [5, 70, 60, -53, -59],
        dead: [3, 93, 53, -42, -51],
      },
    },
  },
  knight: {
    id: 'knight',
    numId: BANSUNG_HERO_INDEX.knight,
    name: 'Knight',
    silhouette: 'Cobalt steel plate with gold horned helm and cape',
    primaryHex: '#3b5bdb',
    accentHex: '#fcc419',
    outlineHex: '#1a1622',
    hp: 7,
    shield: 7,
    energy: 180,
    energyRegenPerS: BANSUNG_HERO_ENERGY_REGEN.PER_S,
    energyRegenDelayMs: BANSUNG_HERO_ENERGY_REGEN.DELAY_MS,
    energyRegenDelayTicks: BANSUNG_HERO_ENERGY_REGEN.DELAY_TICKS,
    speed: 178,
    radius: BANSUNG_DASH.HERO_RADIUS,
    starterWeapon: 'shotgun',
    sidearmWeapon: 'pistol',
    pixelScale: BANSUNG_HERO_PIXEL_SCALE,
    rig: makeHeroRig(4, -33, -60, KNIGHT_WEAPON_RIG),
    defaultWeaponRig: KNIGHT_WEAPON_RIG,
    dash: makeDashSpec(30, '#a5d8ff'),
    activeSkill: {
      id: 'aegis_slam',
      name: 'Aegis Titan Slam',
      vnName: 'Chấn Động Khiên Thần',
      desc: 'Miễn nhiễm 1.2s, làm choáng 220px xung quanh + hồi 12 Khiên & kích hoạt hồi khiên dần',
      cooldownMs: 11000,
      energyCost: 18,
      durationMs: 1200,
      accentHex: '#fcc419',
    },
    anims: BANSUNG_HERO_ANIM_SPECS,
    miragineFallback: {
      unitId: 'A8',
      nativeFacing: 'left',
      anims: {
        idle: [3, 63, 64, -32, -63],
        run: [6, 71, 65, -37, -62],
        attack: [6, 88, 67, -56, -66],
        dead: [2, 73, 64, -32, -64],
      },
    },
  },
  laser: {
    id: 'laser',
    numId: BANSUNG_HERO_INDEX.laser,
    name: 'Laser Vanguard',
    silhouette: 'White-violet heavy prism armor with neon-magenta laser visor',
    primaryHex: '#f3f0ff',
    accentHex: '#e879f9',
    outlineHex: '#1a1622',
    hp: 5,
    shield: 6,
    energy: 280,
    energyRegenPerS: BANSUNG_HERO_ENERGY_REGEN.PER_S,
    energyRegenDelayMs: BANSUNG_HERO_ENERGY_REGEN.DELAY_MS,
    energyRegenDelayTicks: BANSUNG_HERO_ENERGY_REGEN.DELAY_TICKS,
    speed: 185,
    radius: BANSUNG_DASH.HERO_RADIUS,
    starterWeapon: 'laser_cannon',
    sidearmWeapon: 'pistol',
    pixelScale: BANSUNG_HERO_PIXEL_SCALE,
    rig: makeHeroRig(4, -33, -60, LASER_WEAPON_RIG),
    defaultWeaponRig: LASER_WEAPON_RIG,
    dash: makeDashSpec(30, '#e879f9'),
    activeSkill: {
      id: 'prism_overcharge',
      name: 'Prism Mega Beam',
      vnName: 'Đại Pháo Quang Năng',
      desc: 'Bắn chùm Laze siêu tụ xuyên bản đồ cực mạnh + tăng 35% sát thương trong 4.0s',
      cooldownMs: 11500,
      energyCost: 22,
      durationMs: 4000,
      accentHex: '#e879f9',
    },
    anims: BANSUNG_HERO_ANIM_SPECS,
    miragineFallback: {
      unitId: 'A11',
      nativeFacing: 'left',
      anims: {
        idle: [3, 62, 51, -32, -51],
        run: [3, 56, 48, -34, -46],
        attack: [6, 82, 51, -56, -51],
        dead: [4, 78, 60, -26, -53],
      },
    },
  },
};

export const BANSUNG_HERO_REGISTRY = new BansungRegistry<BansungHeroSpec>(
  'hero',
  Object.values(BANSUNG_HEROES),
);

export const BANSUNG_PET_TUNING: BansungPetTuning = {
  FOLLOW_X: 26,
  FOLLOW_Y: 14,
  SPRING_K: 42.0,
  DAMPING: 10.5,
  MAX_SPEED: 340,
  LEASH_MAX: 220,
  TELEPORT_DIST: 360,
  MAGNET_RADIUS: 140,
  MAGNET_PULL: 280,
  MAGNET_CAPTURE_RADIUS: 22,
  POUNCE_RANGE: 115,
  POUNCE_SPEED: 420,
  POUNCE_DUR: 0.36,
  POUNCE_STEER_DUR: 0.22,
  POUNCE_HIT_RADIUS: 22,
  POUNCE_DMG: 9,
  POUNCE_KNOCK: 90,
  POUNCE_CD: 1.8,
  FIRE_MIN_RANGE: 85,
  FIRE_RANGE: 195,
  FIRE_DUR: 0.24,
  FIRE_DMG: 6,
  FIRE_SPEED: 380,
  FIRE_RADIUS: 5,
  FIRE_TTL: 0.65,
  FIRE_CD: 2.6,
  FIRE_BURN_CHANCE: 0.15,
  FIRE_BURN_DUR: 1.5,
  FIRE_BURN_DPS: 2,
};

const makePetAnimSpec = (
  action: BansungPetAnimAction,
  frames: number,
  fps: number,
  loop: boolean,
): BansungPetAnimSpec => ({
  meta: [frames, 32, 32, -16, -28],
  fps,
  loop,
  nativeFacing: 'left',
  sheetPath: `${BANSUNG_STATIC_ROOT}/normalized/pets/pet_tiger_${action}.png`,
});

export const BANSUNG_PET_ANIMS: Readonly<Record<BansungPetAnimAction, BansungPetAnimSpec>> = {
  idle: makePetAnimSpec('idle', 4, 5, true),
  trot: makePetAnimSpec('trot', 6, 12, true),
  pounce: makePetAnimSpec('pounce', 4, 14, false),
  fire: makePetAnimSpec('fire', 3, 12, false),
};

export const BANSUNG_PET_PALETTES: Readonly<Record<BansungPetKind, BansungPetPalette>> = {
  tiger: {
    outline: '#1b1412',
    coat: '#f59f00',
    shade: '#d9480f',
    stripe: '#3b2214',
    belly: '#fff3bf',
    nose: '#ff8787',
    eye: '#1b1412',
  },
  cat: {
    outline: '#1b1412',
    coat: '#f8f9fa',
    shade: '#dee2e6',
    stripe: '#e8590c',
    belly: '#ffffff',
    nose: '#ffa8a8',
    eye: '#2b8a3e',
  },
};

export const BANSUNG_PET: BansungPetSpec = {
  id: 'tiger',
  name: 'Tiger Cub',
  nativeFacing: 'left',
  cellW: 32,
  cellH: 32,
  offX: -16,
  offY: -28,
  bodyW: 22,
  bodyH: 18,
  shadowMeta: BANSUNG_SHADOW_META,
  shadowSize: { w: 20, h: 8 },
  tuning: BANSUNG_PET_TUNING,
  anims: BANSUNG_PET_ANIMS,
  fireballAnim: {
    meta: [3, 32, 32, -16, -16],
    fps: 16,
    scale: 0.5,
    sheetPath: '/database-miraginewar/projectiles/fireball.png',
  },
  palette: BANSUNG_PET_PALETTES.tiger,
  variants: BANSUNG_PET_PALETTES,
};

/** Wrap angle in radians into `(-pi, pi]`. */
export function wrapPi(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  const tau = Math.PI * 2;
  let a = (((rad + Math.PI) % tau) + tau) % tau - Math.PI;
  if (a <= -Math.PI) a += tau;
  return a;
}

/** Resolve horizontal body facing with hysteresis around +/-90 degrees. */
export function solveFacing(prevRight: boolean, rawDx: number, rawDy: number): boolean {
  const rawDist = Math.hypot(rawDx, rawDy);
  if (rawDist < 1e-4) return prevRight;
  const cos = rawDx / rawDist;
  if (cos > BANSUNG_AIM_CONSTANTS.FACING_HYST_COS) return true;
  if (cos < -BANSUNG_AIM_CONSTANTS.FACING_HYST_COS) return false;
  return prevRight;
}

/** Solve 360-degree shoulder-pivoted gun orientation, depth order, and muzzle/eject anchors. */
export function solveAimRig(
  entX: number,
  entY: number,
  targetX: number,
  targetY: number,
  prevRight: boolean,
  hero: BansungHeroRigSpec,
  weapon: BansungWeaponRigSpec,
  frameIdx = 0,
  recoilPx = 0,
  swingRad = 0,
): BansungAimRigResult {
  const bobLen = hero.bobY.length;
  const bob = bobLen > 0 ? (hero.bobY[((frameIdx % bobLen) + bobLen) % bobLen] ?? 0) : 0;
  const rawDx = targetX - entX;
  const rawDy = targetY - (entY - hero.shoulderLiftY + bob);
  const facingRight = solveFacing(prevRight, rawDx, rawDy);
  const gunFlipY: 1 | -1 = facingRight ? 1 : -1;

  const shoulderX = entX + gunFlipY * hero.shoulderOffsetX;
  const shoulderY = entY - hero.shoulderLiftY + bob;
  const dx = targetX - shoulderX;
  const dy = targetY - shoulderY;
  const dist = Math.hypot(dx, dy);
  const baseAngle = dist > 1e-4 ? Math.atan2(dy, dx) : facingRight ? 0 : Math.PI;

  const perp = (weapon.muzzleY - weapon.gripY) * weapon.scale * gunFlipY;
  const safeDist = Math.max(dist, Math.abs(perp) * 2.5, BANSUNG_AIM_CONSTANTS.MIN_PARALLAX_DIST);
  const ratio = Math.max(-1, Math.min(1, perp / safeDist));
  const corr = dist < BANSUNG_AIM_CONSTANTS.DEADZONE_AIM_R ? 0 : Math.asin(ratio);
  const aimTheta = wrapPi(baseAngle - corr);
  const drawTheta = wrapPi(aimTheta + ((weapon.restTiltRad ?? 0) + swingRad) * gunFlipY);
  const zOrder: 'behind' | 'front' =
    Math.sin(aimTheta) < BANSUNG_AIM_CONSTANTS.BEHIND_SIN_THRESH ? 'behind' : 'front';

  const cos = Math.cos(drawTheta);
  const sin = Math.sin(drawTheta);
  const clampedRecoil = Math.max(0, Math.min(recoilPx, weapon.recoilKick));
  const orbit = weapon.shoulderR - clampedRecoil;
  const gripX = shoulderX + cos * orbit;
  const gripY = shoulderY + sin * orbit;

  const toWorld = (lx: number, ly: number): readonly [number, number] => {
    const mx = (lx - weapon.gripX) * weapon.scale;
    const my = (ly - weapon.gripY) * weapon.scale * gunFlipY;
    return [gripX + mx * cos - my * sin, gripY + mx * sin + my * cos] as const;
  };
  const [muzzleX, muzzleY] = toWorld(weapon.muzzleX, weapon.muzzleY);
  const [ejectX, ejectY] = toWorld(weapon.ejectX, weapon.ejectY);

  return {
    facingRight,
    gunFlipY,
    zOrder,
    aimTheta,
    drawTheta,
    shoulderX,
    shoulderY,
    gripX,
    gripY,
    muzzleX,
    muzzleY,
    ejectX,
    ejectY,
  };
}

/** Reconstruct server-authoritative shoulder, grip, and muzzle world positions from quantized aim. */
export function solveMuzzleWorld(
  entX: number,
  entY: number,
  aimTheta: number,
  hero: BansungHeroRigSpec,
  weapon: BansungWeaponRigSpec,
): {
  readonly facingRight: boolean;
  readonly gunFlipY: 1 | -1;
  readonly shoulderX: number;
  readonly shoulderY: number;
  readonly gripX: number;
  readonly gripY: number;
  readonly muzzleX: number;
  readonly muzzleY: number;
} {
  const cos = Math.cos(aimTheta);
  const sin = Math.sin(aimTheta);
  const facingRight = cos >= 0;
  const gunFlipY: 1 | -1 = facingRight ? 1 : -1;
  const shoulderX = entX + gunFlipY * hero.shoulderOffsetX;
  const shoulderY = entY - hero.shoulderLiftY;
  const gripX = shoulderX + cos * weapon.shoulderR;
  const gripY = shoulderY + sin * weapon.shoulderR;
  const mx = (weapon.muzzleX - weapon.gripX) * weapon.scale;
  const my = (weapon.muzzleY - weapon.gripY) * weapon.scale * gunFlipY;
  return {
    facingRight,
    gunFlipY,
    shoulderX,
    shoulderY,
    gripX,
    gripY,
    muzzleX: gripX + mx * cos - my * sin,
    muzzleY: gripY + mx * sin + my * cos,
  };
}

/** Return hero spec by ID with safe fallback to mascot. */
export function getBansungHero(id: BansungHeroId): BansungHeroSpec {
  return BANSUNG_HEROES[id] ?? BANSUNG_HEROES.mascot;
}

/** Integrate analytical ease-out dash travel over `[dashLeftS - dtS, dashLeftS]`. */
export function computeDashStepDistance(
  dashLeftS: number,
  dtS: number,
  durationS = BANSUNG_DASH.DURATION_S,
  distancePx = BANSUNG_DASH.DISTANCE_PX,
): { readonly stepDist: number; readonly dashLeftNext: number; readonly stepDt: number } {
  const stepDt = Math.min(Math.max(0, dtS), Math.max(0, dashLeftS));
  if (stepDt <= 0 || durationS <= 0) {
    return { stepDist: 0, dashLeftNext: 0, stepDt: 0 };
  }
  const u0 = Math.max(0, Math.min(1, 1 - dashLeftS / durationS));
  const dashLeftNext = Math.max(0, dashLeftS - stepDt);
  const u1 = Math.max(0, Math.min(1, 1 - dashLeftNext / durationS));
  const integral = (u: number) => 1.4 * u - 0.4 * u * u;
  const stepDist = distancePx * (integral(u1) - integral(u0));
  return { stepDist, dashLeftNext, stepDt };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Sample Miragine foot-pivot dash frame and squash-stretch transform at `elapsedS`. */
export function sampleDashVisualTransform(
  elapsedS: number,
  dirSign: 1 | -1,
  durationS = BANSUNG_DASH.DURATION_S,
): {
  readonly frameIdx: number;
  readonly sx: number;
  readonly sy: number;
  readonly hopY: number;
  readonly leanRad: number;
  readonly shadowScale: number;
} {
  // Đêm Zombie v2: 6 frame vẽ tay (hạ thấp → bật → lướt → tiếp đất), co giãn & nghiêng NHẸ
  // để pixel art không bị méo / răng cưa khi xoay.
  const u = durationS > 0 ? Math.max(0, Math.min(1, elapsedS / durationS)) : 1;
  const frameIdx = Math.min(5, Math.floor(u * 6));
  const arc = Math.sin(Math.PI * u);
  if (u < 0.14) {
    const t = u / 0.14;
    return {
      frameIdx,
      sx: lerp(1.0, 1.05, t),
      sy: lerp(1.0, 0.95, t),
      hopY: 0,
      leanRad: lerp(0, 0.05, t) * dirSign,
      shadowScale: 1.0,
    };
  }
  if (u < 0.82) {
    const t = (u - 0.14) / 0.68;
    return {
      frameIdx,
      sx: lerp(1.05, 1.0, t),
      sy: lerp(0.95, 1.0, t),
      hopY: -4 * arc,
      leanRad: lerp(0.07, 0.03, t) * dirSign,
      shadowScale: 1 - 0.14 * arc,
    };
  }
  const t = (u - 0.82) / 0.18;
  return {
    frameIdx,
    sx: t < 0.5 ? lerp(1.0, 1.04, t * 2) : lerp(1.04, 1.0, (t - 0.5) * 2),
    sy: t < 0.5 ? lerp(1.0, 0.96, t * 2) : lerp(0.96, 1.0, (t - 0.5) * 2),
    hopY: 0,
    leanRad: lerp(0.03, 0, t) * dirSign,
    shadowScale: 1.0,
  };
}
