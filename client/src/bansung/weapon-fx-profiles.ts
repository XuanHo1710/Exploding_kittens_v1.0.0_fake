/**
 * client/src/bansung/weapon-fx-profiles.ts — hồ sơ hiệu ứng bắn RIÊNG cho từng khẩu (spec 007 · C).
 *
 * Mỗi khẩu súng có: kiểu chớp đầu nòng + hình phụ (nón dài, quạt, vòng, sao, phun…), màu, số tia lửa,
 * loại vỏ đạn, khói nòng, hệ số giật/bloom; mỗi loại đạn có vệt đạn (tracer) và màu tia va chạm riêng.
 * vfx.ts đọc bảng này trong consumeFxEvent(FX_MUZZLE / FX_IMPACT) và resolveTracerStyle().
 * Toàn bộ là dữ liệu tĩnh — không cấp phát mỗi frame.
 */
import type { BansungProjectileKind, BansungWeaponId } from '../../../shared/src';
import { FxColor } from './particles';

/** Kiểu chớp nòng cơ bản (khớp MuzzleFlashStyle trong vfx.ts). */
export type WeaponMuzzleStyle = 'kinetic' | 'plasma' | 'shotgun' | 'laser' | 'flame' | 'emp';

/** Hình phụ vẽ thêm trên chớp nòng để mỗi súng nhìn khác nhau. */
export type WeaponMuzzleAccent =
  | 'none'
  | 'cone' // nón lửa ngắn
  | 'long' // vệt sáng dài mảnh (sniper / rail)
  | 'fan' // quạt rộng (shotgun)
  | 'ring' // vòng năng lượng (plasma / void)
  | 'star' // sao 4 cánh (pistol / bow)
  | 'spray' // phun liên tục (flamethrower / cryo)
  | 'arc' // tia điện ngoằn ngoèo
  | 'backblast'; // xả khí ngược (bazooka / rpg)

export type WeaponCasingKind = 'none' | 'brass' | 'shell' | 'heavy';

export interface WeaponFxProfile {
  readonly style: WeaponMuzzleStyle;
  readonly accent: WeaponMuzzleAccent;
  /** Hệ số kích thước chớp nòng. */
  readonly scale: number;
  /** Màu chủ đạo của hình phụ / quầng sáng (hex). */
  readonly tint: string;
  /** Màu lõi (gần trắng) của hình phụ. */
  readonly core: string;
  /** Tia lửa bắn ra khi khai hoả. */
  readonly sparkColor: number;
  readonly sparkCount: number;
  readonly sparkSpeed: number;
  /** Độ toả của tia lửa quanh hướng bắn (rad). */
  readonly sparkSpread: number;
  readonly casing: WeaponCasingKind;
  /** Số cụm khói nòng sau phát bắn (0 = không). */
  readonly smoke: number;
  /** Thời gian sống thêm của chớp nòng (ms) — súng nặng sáng lâu hơn. */
  readonly ttlBonusMs: number;
}

const P = (
  style: WeaponMuzzleStyle,
  accent: WeaponMuzzleAccent,
  scale: number,
  tint: string,
  core: string,
  sparkColor: number,
  sparkCount: number,
  sparkSpeed: number,
  sparkSpread: number,
  casing: WeaponCasingKind,
  smoke: number,
  ttlBonusMs = 0,
): WeaponFxProfile => ({
  style,
  accent,
  scale,
  tint,
  core,
  sparkColor,
  sparkCount,
  sparkSpeed,
  sparkSpread,
  casing,
  smoke,
  ttlBonusMs,
});

/** Hồ sơ cho đủ 36 khẩu súng. */
export const WEAPON_FX_PROFILES: Readonly<Record<BansungWeaponId, WeaponFxProfile>> = {
  // ── Đạn thường ──────────────────────────────────────────────────────────
  pistol: P('kinetic', 'star', 0.9, '#ffd166', '#fff8e1', FxColor.HotGold, 2, 140, 0.45, 'brass', 0),
  rifle: P('kinetic', 'cone', 1.15, '#ffae34', '#fff3c4', FxColor.HotGold, 3, 170, 0.35, 'brass', 1),
  smg: P('kinetic', 'cone', 0.95, '#ffd166', '#ffffff', FxColor.Gold, 2, 150, 0.5, 'brass', 0),
  shotgun: P('shotgun', 'fan', 1.35, '#ff8c42', '#fff1d6', FxColor.ShotgunRed, 7, 210, 0.75, 'shell', 2, 25),
  sniper_rifle: P('kinetic', 'long', 1.45, '#e9ecef', '#ffffff', FxColor.White, 4, 260, 0.18, 'heavy', 2, 40),
  dual_pistols: P('kinetic', 'star', 0.85, '#ffe066', '#ffffff', FxColor.HotGold, 2, 140, 0.6, 'brass', 0),
  minigun: P('kinetic', 'cone', 1.2, '#ff9f1c', '#fff1c1', FxColor.Orange, 3, 190, 0.55, 'brass', 1),
  saw_launcher: P('kinetic', 'ring', 1.05, '#ced4da', '#ffffff', FxColor.Shrapnel, 5, 230, 0.9, 'none', 0),
  plasma_shotgun: P('plasma', 'fan', 1.3, '#4dabf7', '#e7f5ff', FxColor.ElectricCore, 6, 200, 0.75, 'none', 0, 20),
  twin_smg: P('kinetic', 'cone', 0.9, '#ffc078', '#ffffff', FxColor.Gold, 2, 160, 0.6, 'brass', 0),
  ricochet_disc: P('kinetic', 'ring', 1.0, '#94d82d', '#f4fce3', FxColor.Sap, 4, 200, 0.8, 'none', 0),
  phantom_bow: P('plasma', 'star', 1.1, '#b197fc', '#f3f0ff', FxColor.Violet, 4, 180, 0.4, 'none', 0, 30),

  // ── Chất nổ ─────────────────────────────────────────────────────────────
  grenade_launcher: P('flame', 'cone', 1.2, '#ff922b', '#ffe8cc', FxColor.Ember, 4, 150, 0.5, 'heavy', 3, 20),
  stun_launcher: P('emp', 'ring', 1.15, '#74c0fc', '#e7f5ff', FxColor.Cyan, 4, 150, 0.6, 'heavy', 1, 20),
  bazooka: P('flame', 'backblast', 1.45, '#ff6b35', '#fff4e6', FxColor.Ember, 6, 170, 0.5, 'none', 4, 45),
  mine_gun: P('flame', 'cone', 1.0, '#ffd43b', '#fff9db', FxColor.Gold, 3, 120, 0.6, 'heavy', 1, 10),
  cluster_rpg: P('flame', 'backblast', 1.4, '#ff8787', '#fff5f5', FxColor.Ember, 6, 180, 0.6, 'none', 4, 45),
  orbital_cannon: P('laser', 'long', 1.55, '#ffd43b', '#ffffff', FxColor.HotGold, 6, 240, 0.3, 'none', 2, 60),

  // ── Năng lượng / phép ───────────────────────────────────────────────────
  plasma_rifle: P('plasma', 'ring', 1.05, '#4dabf7', '#e7f5ff', FxColor.ElectricCore, 3, 160, 0.4, 'none', 0),
  railgun: P('laser', 'long', 1.4, '#66d9e8', '#ffffff', FxColor.Cyan, 5, 280, 0.15, 'none', 1, 50),
  lightning_staff: P('emp', 'arc', 1.15, '#ffe066', '#fffbe6', FxColor.ElectricCore, 5, 190, 0.9, 'none', 0, 20),
  arcane_book: P('flame', 'star', 1.1, '#f783ac', '#fff0f6', FxColor.Ember, 4, 150, 0.7, 'none', 0, 20),
  laser_cannon: P('laser', 'long', 1.5, '#ff4d6d', '#ffffff', FxColor.HitRed, 6, 260, 0.2, 'none', 2, 60),
  electric_gun: P('emp', 'arc', 1.05, '#74c0fc', '#ffffff', FxColor.ElectricCore, 4, 200, 0.8, 'none', 0, 10),
  flamethrower: P('flame', 'spray', 1.0, '#ff922b', '#fff3bf', FxColor.Ember, 3, 120, 0.4, 'none', 1),
  cryo_cannon: P('plasma', 'spray', 1.15, '#a5d8ff', '#ffffff', FxColor.Cyan, 5, 160, 0.6, 'none', 1, 15),
  gravity_gun: P('plasma', 'ring', 1.3, '#9775fa', '#e5dbff', FxColor.VoidPurple, 5, 120, 1.2, 'none', 0, 35),
  ion_beam: P('laser', 'long', 1.35, '#3bc9db', '#e3fafc', FxColor.CyberTeal, 4, 240, 0.2, 'none', 1, 40),
  tesla_coil: P('emp', 'arc', 1.2, '#4dabf7', '#ffffff', FxColor.ElectricCore, 6, 220, 1.1, 'none', 0, 20),
  void_cannon: P('plasma', 'ring', 1.45, '#7048e8', '#e5dbff', FxColor.DeepViolet, 6, 150, 0.9, 'none', 1, 45),
  blizzard_carbine: P('plasma', 'cone', 1.0, '#99e9f2', '#ffffff', FxColor.Cyan, 3, 170, 0.45, 'none', 0),
  magma_spitter: P('flame', 'spray', 1.15, '#fd7e14', '#ffe8cc', FxColor.Ember, 4, 140, 0.6, 'none', 2, 15),
  chronos_rifle: P('plasma', 'ring', 1.2, '#ffd43b', '#fff9db', FxColor.Gold, 4, 200, 0.35, 'none', 0, 30),

  // ── Cận chiến (không có chớp nòng, dùng cho skill) ─────────────────────
  crescent_blade: P('kinetic', 'none', 1.0, '#e9ecef', '#ffffff', FxColor.White, 0, 0, 0, 'none', 0),
  reaper_scythe: P('kinetic', 'none', 1.0, '#b197fc', '#f3f0ff', FxColor.Violet, 0, 0, 0, 'none', 0),
  shock_baton: P('kinetic', 'none', 1.0, '#74c0fc', '#ffffff', FxColor.ElectricCore, 0, 0, 0, 'none', 0),
};

const DEFAULT_PROFILE: WeaponFxProfile = WEAPON_FX_PROFILES.rifle;

export function getWeaponFxProfile(weaponId: BansungWeaponId | undefined | null): WeaponFxProfile {
  if (!weaponId) return DEFAULT_PROFILE;
  return WEAPON_FX_PROFILES[weaponId] ?? DEFAULT_PROFILE;
}

/** Vệt đạn riêng theo loại đạn của người chơi (ghi đè preset gốc trong vfx.ts). */
export interface ProjectileTracerOverride {
  readonly color: string;
  readonly coreColor: string;
  readonly outerGlow: string;
  readonly minLen: number;
  readonly maxLen: number;
  readonly width: number;
  readonly additive: boolean;
}

const T = (
  color: string,
  coreColor: string,
  outerGlow: string,
  minLen: number,
  maxLen: number,
  width: number,
  additive: boolean,
): ProjectileTracerOverride => ({ color, coreColor, outerGlow, minLen, maxLen, width, additive });

export const PROJECTILE_TRACER_OVERRIDES: Readonly<Partial<Record<BansungProjectileKind, ProjectileTracerOverride>>> = {
  kinetic_sm: T('#ffe066', '#ffffff', 'rgba(255, 224, 102, 0.5)', 12, 40, 2.0, false),
  kinetic_md: T('#ffae34', '#ffffff', 'rgba(255, 174, 52, 0.55)', 18, 58, 2.6, false),
  twin_smg_bullet: T('#ffc078', '#fff4e6', 'rgba(255, 192, 120, 0.45)', 10, 34, 1.8, false),
  shotgun_pellet: T('#ff8c42', '#fff1d6', 'rgba(255, 140, 66, 0.45)', 8, 22, 1.8, false),
  sniper_slug: T('#e9ecef', '#ffffff', 'rgba(233, 236, 239, 0.65)', 60, 180, 3.2, true),
  plasma_pellet: T('#4dabf7', '#e7f5ff', 'rgba(77, 171, 247, 0.6)', 10, 26, 2.6, true),
  phantom_arrow: T('#b197fc', '#f3f0ff', 'rgba(177, 151, 252, 0.65)', 30, 90, 2.8, true),
  saw_disc: T('#ced4da', '#ffffff', 'rgba(206, 212, 218, 0.45)', 10, 28, 3.0, false),
  ricochet_blade: T('#94d82d', '#f4fce3', 'rgba(148, 216, 45, 0.55)', 14, 40, 2.6, true),
  plasma_bolt: T('#4dabf7', '#e7f5ff', 'rgba(77, 171, 247, 0.6)', 16, 44, 3.0, true),
  chronos_slug: T('#ffd43b', '#fff9db', 'rgba(255, 212, 59, 0.6)', 24, 70, 3.0, true),
  cryo_shard: T('#a5d8ff', '#ffffff', 'rgba(165, 216, 255, 0.6)', 14, 40, 2.6, true),
  blizzard_bolt: T('#99e9f2', '#ffffff', 'rgba(153, 233, 242, 0.55)', 12, 34, 2.2, true),
  electric_arc_bolt: T('#74c0fc', '#ffffff', 'rgba(116, 192, 252, 0.7)', 16, 46, 2.4, true),
  tesla_arc: T('#4dabf7', '#ffffff', 'rgba(77, 171, 247, 0.7)', 16, 46, 2.4, true),
  flame_stream_orb: T('#ff922b', '#fff3bf', 'rgba(255, 146, 43, 0.6)', 8, 22, 4.0, true),
  magma_glob: T('#fd7e14', '#ffe8cc', 'rgba(253, 126, 20, 0.6)', 10, 30, 4.2, true),
  gravity_orb: T('#9775fa', '#e5dbff', 'rgba(151, 117, 250, 0.6)', 14, 34, 4.2, true),
  void_cannon_orb: T('#7048e8', '#e5dbff', 'rgba(112, 72, 232, 0.65)', 16, 40, 5.0, true),
  arcane_fireball: T('#f783ac', '#fff0f6', 'rgba(247, 131, 172, 0.6)', 14, 38, 4.0, true),
  ion_lance: T('#3bc9db', '#e3fafc', 'rgba(59, 201, 219, 0.65)', 40, 120, 3.0, true),
  rocket: T('#ff6b35', '#fff4e6', 'rgba(255, 107, 53, 0.55)', 20, 60, 3.6, false),
  cluster_rocket: T('#ff8787', '#fff5f5', 'rgba(255, 135, 135, 0.55)', 20, 56, 3.4, false),
  orbital_shell: T('#ffd43b', '#ffffff', 'rgba(255, 212, 59, 0.6)', 26, 80, 4.0, true),
};

/** Màu tia khi đạn trúng (theo loại đạn), dùng cho FX_IMPACT flesh/spark. */
export const PROJECTILE_IMPACT_COLOR: Readonly<Partial<Record<BansungProjectileKind, number>>> = {
  kinetic_sm: FxColor.HotGold,
  kinetic_md: FxColor.HotGold,
  twin_smg_bullet: FxColor.Gold,
  shotgun_pellet: FxColor.ShotgunRed,
  sniper_slug: FxColor.White,
  plasma_pellet: FxColor.ElectricCore,
  phantom_arrow: FxColor.Violet,
  saw_disc: FxColor.Shrapnel,
  ricochet_blade: FxColor.Sap,
  plasma_bolt: FxColor.ElectricCore,
  rail_beam: FxColor.Cyan,
  chronos_slug: FxColor.Gold,
  cryo_shard: FxColor.Cyan,
  blizzard_bolt: FxColor.Cyan,
  electric_arc_bolt: FxColor.ElectricCore,
  tesla_arc: FxColor.ElectricCore,
  thunder_orb: FxColor.ElectricCore,
  flame_stream_orb: FxColor.Ember,
  magma_glob: FxColor.Ember,
  arcane_fireball: FxColor.Ember,
  arcane_ember: FxColor.Ember,
  gravity_orb: FxColor.VoidPurple,
  void_cannon_orb: FxColor.DeepViolet,
  ion_lance: FxColor.CyberTeal,
  laser_map_beam: FxColor.HitRed,
};

/** Số tia va chạm mặc định theo loại đạn (đạn nặng toé nhiều hơn). */
export const PROJECTILE_IMPACT_COUNT: Readonly<Partial<Record<BansungProjectileKind, number>>> = {
  sniper_slug: 9,
  rail_beam: 8,
  shotgun_pellet: 3,
  saw_disc: 6,
  void_cannon_orb: 8,
  gravity_orb: 7,
  magma_glob: 6,
  laser_map_beam: 8,
  chronos_slug: 6,
};
