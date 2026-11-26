/**
 * server/src/game/bansung/weapon-skills/types.ts — kiểu dữ liệu cho skill súng phía server
 * (spec 007 · C). Các file nhóm (kinetic/explosive/energy/melee.ts) chỉ import từ đây.
 */
import type {
  BansungWeaponBuffMods,
  BansungWeaponId,
  BansungWeaponSkillSpec,
} from '../../../../../shared/src';
import type { BansungCombatTarget, BansungDamageKind, BansungDamageResult, BansungDotKind } from '../damage';
import type { BansungHeroWeaponState, BansungSpawnProjectileParams, BansungWeaponRuntime } from '../weapons';

/** Ảnh chụp người chơi đang cầm súng — chỉ đọc (dùng api để thay đổi thế giới). */
export interface WeaponSkillHero {
  readonly id: string;
  readonly idx: number;
  readonly actorId: number;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Hướng ngắm hiện tại (rad). */
  readonly aimRad: number;
  /** Điểm người chơi trỏ chuột lúc bấm skill (toạ độ thế giới). */
  readonly targetX: number;
  readonly targetY: number;
  readonly weaponId: BansungWeaponId;
  /** Cấp Mk 1..10 của súng đang cầm. */
  readonly tier: number;
  readonly spec: BansungWeaponSkillSpec;
  readonly weaponState: BansungHeroWeaponState;
  readonly slot: BansungWeaponRuntime;
  readonly hp: number;
  readonly maxHp: number;
  readonly shield: number;
  readonly maxShield: number;
  readonly energy: number;
  readonly maxEnergy: number;
  /** Hệ số sát thương skill = cấp Mk × perk × gacha (api đã tự nhân, trừ khi hit.raw). */
  readonly dmgScale: number;
  /** Hệ số thời lượng theo cấp Mk. */
  readonly durationScale: number;
  readonly isBot: boolean;
}

export interface WeaponSkillHit {
  baseDmg: number;
  dmgKind: BansungDamageKind;
  /** [vsLight, vsArmored] */
  affinity?: readonly [number, number];
  armorPiercePct?: number;
  critChance?: number;
  critMult?: number;
  forceCrit?: boolean;
  stunMs?: number;
  dotKind?: BansungDotKind;
  /** Đẩy lùi theo hướng từ tâm đòn ra mục tiêu (px/s). Âm = hút vào. */
  knockback?: number;
  slowPct?: number;
  slowMs?: number;
  /** true: KHÔNG nhân hero.dmgScale (đã tự tính). */
  raw?: boolean;
}

export interface WeaponSkillTargetInfo {
  readonly target: BansungCombatTarget;
  readonly actorId: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly isBoss: boolean;
  readonly dist: number;
}

export interface WeaponSkillAoeOpts {
  /** Giới hạn số mục tiêu (gần nhất trước). */
  maxTargets?: number;
  /** Bỏ qua actor đã trúng (dùng cho đòn nhiều tick). Hàm tự thêm id vào set. */
  exclude?: Set<number>;
  /** Sát thương ở mép vùng = baseDmg × edgeMult (tuyến tính từ tâm). Mặc định 1. */
  edgeMult?: number;
  /** Chặn bởi tường (cần tầm nhìn từ tâm). Mặc định false. */
  requireLos?: boolean;
}

/** Đạn do skill bắn ra — team/owner tự điền; baseDmg tự nhân dmgScale trừ khi raw. */
export type WeaponSkillProjectile = Omit<BansungSpawnProjectileParams, 'team' | 'ownerId' | 'ownerIdx'> & {
  raw?: boolean;
};

export interface WeaponSkillApi {
  readonly tickNo: number;
  /** ms mỗi tick (≈33.33). */
  readonly dtMs: number;
  rng(): number;
  /** Đẩy 1 bộ FX 6 số nguyên thô (FX_BEAM, FX_BLAST, FX_IMPACT…). */
  fx(a: number, b: number, c: number, d: number, e: number, f: number): void;
  /** FX_STATUS cho client vẽ hiệu ứng skill của súng đang cầm. */
  emitCast(x: number, y: number): void;
  emitImpact(x: number, y: number): void;
  emitEnd(x: number, y: number): void;
  emitPassive(x: number, y: number): void;
  emitBeam(x0: number, y0: number, x1: number, y1: number, beamKind: number): void;
  emitBlast(blastKind: number, x: number, y: number, r: number): void;
  sfx(key: string, x: number, y: number): void;

  /** Kẻ địch trong bán kính (đã tính bán kính actor), sắp xếp gần → xa. Mảng tái sử dụng. */
  queryEnemies(x: number, y: number, r: number): readonly WeaponSkillTargetInfo[];
  nearestEnemy(x: number, y: number, r: number): WeaponSkillTargetInfo | null;
  damageTarget(info: WeaponSkillTargetInfo, hit: WeaponSkillHit, fromX?: number, fromY?: number): BansungDamageResult | null;
  damageCircle(x: number, y: number, r: number, hit: WeaponSkillHit, opts?: WeaponSkillAoeOpts): number;
  damageLine(x0: number, y0: number, x1: number, y1: number, halfW: number, hit: WeaponSkillHit, opts?: WeaponSkillAoeOpts): number;
  damageCone(x: number, y: number, angle: number, halfAngleRad: number, range: number, hit: WeaponSkillHit, opts?: WeaponSkillAoeOpts): number;
  spawnProjectile(p: WeaponSkillProjectile): boolean;

  hasLineOfSight(x0: number, y0: number, x1: number, y1: number): boolean;
  /** Khoảng cách tới tường đầu tiên theo hướng `angle` (≤ maxDist). */
  raycastWall(x0: number, y0: number, angle: number, maxDist: number): number;
  /** Di chuyển người chơi có trượt tường; trả vị trí mới. */
  moveHero(dx: number, dy: number): { x: number; y: number };
  setInvuln(ms: number): void;
  heal(hp: number): number;
  addShield(amount: number): number;
  grantEnergy(amount: number): number;
  /** Nạp đầy băng đạn súng đang cầm. */
  refillMag(): void;
  /** Cường hoá súng tạm thời (cộng dồn nhân với các buff khác). */
  addBuff(mods: BansungWeaponBuffMods, ms: number, tag?: string): void;
  /** Đẩy / hút actor (px/s). */
  pushActor(actorId: number, vx: number, vy: number): void;
}

export interface WeaponSkillCastState {
  readonly startTick: number;
  /** Số tick đã chạy (cast = 0, step đầu tiên = 1). */
  tick: number;
  elapsedMs: number;
  /** Thời lượng thực tế (đã nhân cấp Mk). 0 = tức thời. */
  durationMs: number;
  /** Hướng ngắm lúc bấm skill. */
  aim: number;
  /** Điểm trỏ chuột lúc bấm skill. */
  tx: number;
  ty: number;
  /** Biến tuỳ ý của handler. */
  vars: Record<string, number>;
  /** Tập actor đã trúng (tuỳ handler dùng với opts.exclude). */
  hit: Set<number>;
}

export interface WeaponSkillPassiveState {
  vars: Record<string, number>;
  /** Số cộng dồn hiển thị trên HUD. */
  stacks: number;
}

export interface WeaponSkillPassiveHandler {
  /** Cường hoá luôn bật khi cầm súng (tính lại mỗi tick). */
  mods?(hero: WeaponSkillHero, ps: WeaponSkillPassiveState): BansungWeaponBuffMods | undefined;
  onTick?(hero: WeaponSkillHero, api: WeaponSkillApi, ps: WeaponSkillPassiveState, firing: boolean): void;
  /** Sau mỗi phát bắn (hoặc nhát chém) của súng đang cầm. */
  onShot?(hero: WeaponSkillHero, api: WeaponSkillApi, ps: WeaponSkillPassiveState): void;
  /** Khi đòn THƯỜNG (đạn / nhát chém / đạn do skill bắn ra) trúng kẻ địch. Sát thương tức thời do cast/step/nội tại gây ra không gọi hook này (chống đệ quy). */
  onHit?(hero: WeaponSkillHero, api: WeaponSkillApi, ps: WeaponSkillPassiveState, target: BansungCombatTarget, res: BansungDamageResult): void;
  onKill?(hero: WeaponSkillHero, api: WeaponSkillApi, ps: WeaponSkillPassiveState, target: BansungCombatTarget): void;
}

export interface WeaponSkillHandler {
  /** Dùng skill. Trả false để từ chối (không tốn hồi chiêu / năng lượng). */
  cast(hero: WeaponSkillHero, api: WeaponSkillApi, st: WeaponSkillCastState): boolean;
  /** Gọi mỗi tick trong `durationMs`. Trả false để kết thúc sớm. */
  step?(hero: WeaponSkillHero, api: WeaponSkillApi, st: WeaponSkillCastState): boolean | void;
  end?(hero: WeaponSkillHero, api: WeaponSkillApi, st: WeaponSkillCastState): void;
  passive?: WeaponSkillPassiveHandler;
}

export type WeaponSkillHandlerTable = Partial<Record<BansungWeaponId, WeaponSkillHandler>>;
