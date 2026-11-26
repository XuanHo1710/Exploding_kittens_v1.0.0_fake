/**
 * shared/src/bansung/weapon-skills/types.ts
 *
 * Đêm Zombie v3 (spec 007 · C) — KHUNG SKILL SÚNG dùng chung client/server.
 *
 * Mỗi khẩu súng có:
 *  - 1 skill chủ động (bấm CHUỘT GIỮA), có hồi chiêu + tốn năng lượng, mạnh dần theo cấp Mk;
 *  - 1 nội tại (passive) luôn bật khi đang cầm súng đó.
 *
 * Dữ liệu từng súng nằm ở các file theo nhóm (mỗi nhóm làm song song một file):
 *   kinetic.ts · explosive.ts · energy.ts · melee.ts
 * Logic server tương ứng: server/src/game/bansung/weapon-skills/<nhóm>.ts
 * Hiệu ứng client: client/src/bansung/weapon-skill-fx.ts
 */
import type { BansungWeaponId } from '../types';

/** Kiểu skill — quyết định cách HUD mô tả và client vẽ telegraph mặc định. */
export type BansungWeaponSkillKind =
  /** Tức thời: 1 phát / 1 loạt đặc biệt. */
  | 'burst'
  /** Cường hoá súng trong `durationMs` (tốc bắn, xuyên, đạn lửa…). */
  | 'buff'
  /** Tia / laze kéo dài. */
  | 'beam'
  /** Đặt vùng hiệu ứng trên mặt đất. */
  | 'zone'
  /** Gọi thực thể phụ (tháp, drone, mìn, linh hồn…). */
  | 'summon'
  /** Lướt / dịch chuyển kèm đòn đánh. */
  | 'dash'
  /** Loạt bắn kéo dài nhiều tick. */
  | 'barrage';

/** Cách ngắm của skill (client dùng để vẽ chỉ báo khi giữ chuột giữa). */
export type BansungWeaponSkillTargeting = 'self' | 'aim' | 'cursor';

export interface BansungWeaponPassiveSpec {
  id: string;
  /** Tên tiếng Anh ngắn (1–3 từ). */
  name: string;
  vnName: string;
  /** Mô tả tiếng Việt ngắn gọn (≤ 90 ký tự). */
  desc: string;
}

export interface BansungWeaponSkillSpec {
  weaponId: BansungWeaponId;
  /** snake_case, duy nhất toàn game. */
  id: string;
  /** Tên tiếng Anh ngắn (1–3 từ), hiển thị trên HUD. */
  name: string;
  vnName: string;
  /** Mô tả tiếng Việt ngắn gọn (≤ 110 ký tự). */
  desc: string;
  kind: BansungWeaponSkillKind;
  targeting: BansungWeaponSkillTargeting;
  /** Hồi chiêu gốc ở Mk.I (ms). */
  cooldownMs: number;
  /** Năng lượng tiêu tốn khi dùng (0 = miễn phí). */
  energyCost: number;
  /** Thời gian hiệu lực (ms), 0 cho skill tức thời. */
  durationMs: number;
  /** Tầm tối đa / bán kính chính (px) — client dùng vẽ chỉ báo. */
  rangePx: number;
  /** Màu chủ đạo (hex) cho HUD + VFX. */
  color: string;
  passive: BansungWeaponPassiveSpec;
}

/** Bộ cường hoá súng tạm thời do skill / nội tại cấp (nhân dồn vào gachaMods của súng). */
export interface BansungWeaponBuffMods {
  dmgMult?: number;
  fireRateMult?: number;
  extraMultishot?: number;
  critChanceAdd?: number;
  critDmgMult?: number;
  extraPierce?: number;
  blastRadiusMult?: number;
  reloadSpeedMul?: number;
  energyCostMult?: number;
  moveSpeedMult?: number;
  /** Băng đạn không hao trong thời gian buff. */
  infiniteAmmo?: boolean;
}

/** Trạng thái skill súng gửi về cho chủ nhân (frame.me.wsk) — chỉ của súng đang cầm. */
export interface BansungWeaponSkillHud {
  /** Skill id. */
  id: string;
  weaponId: BansungWeaponId;
  /** Hồi chiêu còn lại (ms) của súng đang cầm. */
  cdMs: number;
  /** Tổng hồi chiêu sau khi trừ theo cấp Mk (ms). */
  maxMs: number;
  /** Còn hiệu lực (ms) nếu skill đang chạy. */
  activeMs?: number;
  energyCost: number;
  /** Số cộng dồn / điểm nội tại để HUD hiển thị (0 nếu không dùng). */
  stacks?: number;
}

/** FX_STATUS sub-kind: người chơi dùng skill súng. Tuple [5, playerIdx, 18, weaponIdx, x, y]. */
export const BANSUNG_FX_STATUS_WSKILL_CAST = 18;
/** FX_STATUS sub-kind: điểm nổ / va chạm chính của skill. Tuple [5, playerIdx, 19, weaponIdx, x, y]. */
export const BANSUNG_FX_STATUS_WSKILL_IMPACT = 19;
/** FX_STATUS sub-kind: skill (buff/beam/zone) kết thúc. Tuple [5, playerIdx, 20, weaponIdx, x, y]. */
export const BANSUNG_FX_STATUS_WSKILL_END = 20;
/** FX_STATUS sub-kind: nội tại kích hoạt (proc). Tuple [5, playerIdx, 21, weaponIdx, x, y]. */
export const BANSUNG_FX_STATUS_WSKILL_PASSIVE = 21;

/** Hệ số sát thương skill theo cấp Mk (Mk.I = 1 → Mk.X = 2.35). */
export function getWeaponSkillTierDmgMult(tier: number): number {
  const t = Math.max(1, Math.min(10, Math.round(Number.isFinite(tier) ? tier : 1)));
  return 1 + 0.15 * (t - 1);
}

/** Hệ số hồi chiêu skill theo cấp Mk (Mk.I = 1 → Mk.X = 0.64). */
export function getWeaponSkillTierCdMult(tier: number): number {
  const t = Math.max(1, Math.min(10, Math.round(Number.isFinite(tier) ? tier : 1)));
  return Math.max(0.64, 1 - 0.04 * (t - 1));
}

/** Hệ số thời lượng skill (buff/zone) theo cấp Mk (Mk.I = 1 → Mk.X = 1.45). */
export function getWeaponSkillTierDurationMult(tier: number): number {
  const t = Math.max(1, Math.min(10, Math.round(Number.isFinite(tier) ? tier : 1)));
  return 1 + 0.05 * (t - 1);
}

/** Bảng dữ liệu skill của một nhóm súng (mỗi file nhóm export 1 bảng). */
export type BansungWeaponSkillTable = Partial<Record<BansungWeaponId, BansungWeaponSkillSpec>>;
