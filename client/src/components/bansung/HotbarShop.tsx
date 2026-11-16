import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  Check,
  ChevronsUp,
  Clock,
  Coins,
  Crosshair,
  Flame,
  Gift,
  Heart,
  Layers,
  Magnet,
  Orbit,
  Package,
  RefreshCw,
  Shield,
  ShoppingBag,
  Sparkles,
  Swords,
  TrendingUp,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import {
  BANSUNG_PICKUP_CONSTS,
  BANSUNG_PICKUP_KINDS,
  getBansungPerk,
} from '../../../../shared/src/bansung/enemies';
import {
  BANSUNG_PFLAG_RELOADING,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATIC_ROOT,
  BANSUNG_WEAPON_IDS,
  type BansungCommand,
  type BansungGachaCard,
  type BansungGachaCategory,
  type BansungGachaRarity,
  type BansungGadgetId,
  type BansungGadgetState,
  type BansungPerkId,
  type BansungPrivate,
  type BansungWavePhase,
  type BansungWeaponId,
  type BansungWeaponSlot,
} from '../../../../shared/src/bansung/types';
import {
  BANSUNG_GADGETS,
  BANSUNG_RELOAD_LOCKOUT_U,
  BANSUNG_RELOAD_SWEET_MAX,
  BANSUNG_RELOAD_SWEET_MIN,
  BANSUNG_SUPPLY_HEAL_COST,
  BANSUNG_WEAPON_MAX_TIER,
  BANSUNG_WEAPON_TIERS,
  formatWeaponDmgText,
  getGachaSkillSpec,
  getGadgetSpec,
  getWeaponByIdx,
  getWeaponEvolutionStats,
  getWeaponShopPrice,
  getWeaponSpec,
  getWeaponUpgradeCoinCost,
  normalizeWeaponTier,
  type BansungGadgetSpec,
  type BansungWeaponSpec,
  type BansungWeaponTier,
} from '../../../../shared/src/bansung/weapons';
import type { BansungInputController } from '../../bansung/input';
import {
  bansungStore,
  clamp,
  useBansungHud,
  type BansungHudSnapshot,
  type SnapPickup,
} from '../../bansung/store';

export interface SpriteSheetMeta {
  readonly path: string;
  readonly frames: number;
  readonly cellW: number;
  readonly cellH: number;
}

export interface ResolvedSpriteMeta extends SpriteSheetMeta {
  readonly src: string;
}

export interface NearbyWeaponPedestal {
  readonly pickup: SnapPickup;
  readonly weapon: BansungWeaponSpec;
  readonly distance: number;
}

export interface HotbarConsumableSlot {
  readonly label: string;
  readonly shortLabel?: string;
  readonly count?: number;
  readonly cdMs?: number;
  readonly cdMaxMs?: number;
  readonly iconSrc?: string;
  readonly disabled?: boolean;
  readonly onUse?: () => void;
}

export interface HotbarShopProps {
  /** Optional snapshot override for standalone boards or previews. */
  snapshot?: BansungHudSnapshot;
  /** Optional pickup list override for previews or deterministic rendering. */
  pickups?: readonly SnapPickup[];
  /** Optional input controller to handle slot, reload, skill, dash, interact, and perk actions. */
  input?: BansungInputController;
  /** Generic command emitter fallback when individual callbacks or input controller are omitted. */
  onCommand?: (cmd: BansungCommand) => void;
  onSelectSlot?: (idx: number) => void;
  onTapSlot?: (idx: number) => void;
  onReload?: () => void;
  onTriggerGadget?: () => void;
  onTriggerDash?: () => void;
  onUsePedestal?: (pedestal: NearbyWeaponPedestal) => void;
  onSelectPerk?: (id: BansungPerkId) => void;
  onSelectGacha?: (pick: 0 | 1 | 2) => void;
  /** Bitmask highlighting empowered weapon slots (bit i -> weapon slot i). */
  empoweredSlotMask?: number;
  /** Optional 5th-slot utility / consumable definition matching the 5-slot Soul-Knight hotbar. */
  consumable?: HotbarConsumableSlot | null;
  /** Set false if active-reload timing bar is rendered elsewhere (default: true). */
  showReloadBar?: boolean;
  /** Set false if weapon pedestal [E] prompt is rendered elsewhere (default: true). */
  showPedestalPrompt?: boolean;
  /** Set false to suppress the between-wave Perk Draft modal (default: true). */
  showPerkModal?: boolean;
  /** Set false to suppress the Survival XP Level-Up Gacha modal (default: true). */
  showGachaModal?: boolean;
  /** Controlled visibility of the in-match [B] Armory & Supply Coin Shop modal. */
  shopOpen?: boolean;
  /** Toggle handler for closing or opening the Armory & Supply Coin Shop modal. */
  onToggleShop?: () => void;
  className?: string;
}

type PerkDefEntry = NonNullable<ReturnType<typeof getBansungPerk>>;
type WeaponRarity = BansungWeaponSpec['rarity'];
type PerkRarity = PerkDefEntry['rarity'];
type GachaSkillCategory = Exclude<BansungGachaCategory, 'weapon_upgrade'>;

/** Verified horizontal sprite strip paths and frame metrics from database-ban-sung/manifest.json. */
export const BANSUNG_WEAPON_ICON_META: Readonly<Record<BansungWeaponId, SpriteSheetMeta>> = {
  pistol: { path: 'normalized/weapons/gun_pistol.png', frames: 3, cellW: 24, cellH: 16 },
  rifle: { path: 'normalized/weapons/gun_rifle.png', frames: 3, cellW: 40, cellH: 18 },
  smg: { path: 'normalized/weapons/gun_smg.png', frames: 3, cellW: 34, cellH: 18 },
  shotgun: { path: 'normalized/weapons/gun_shotgun.png', frames: 4, cellW: 42, cellH: 18 },
  sniper_rifle: { path: 'normalized/weapons/gun_sniper_rifle.png', frames: 3, cellW: 48, cellH: 18 },
  grenade_launcher: { path: 'normalized/weapons/w_frag_launcher.png', frames: 2, cellW: 32, cellH: 24 },
  stun_launcher: { path: 'normalized/weapons/w_stun_launcher.png', frames: 2, cellW: 32, cellH: 24 },
  bazooka: { path: 'normalized/weapons/w_triple_bazooka.png', frames: 2, cellW: 40, cellH: 24 },
  mine_gun: { path: 'normalized/weapons/w_mine_gun.png', frames: 2, cellW: 32, cellH: 24 },
  plasma_rifle: { path: 'normalized/weapons/plasma_rifle.png', frames: 2, cellW: 32, cellH: 16 },
  railgun: { path: 'normalized/weapons/railgun_piercer.png', frames: 3, cellW: 38, cellH: 16 },
  laser_cannon: { path: 'normalized/weapons/gun_laser_cannon.png', frames: 3, cellW: 44, cellH: 18 },
  electric_gun: { path: 'normalized/weapons/gun_electric_gun.png', frames: 3, cellW: 38, cellH: 18 },
  lightning_staff: { path: 'normalized/weapons/lightning_staff.png', frames: 2, cellW: 36, cellH: 14 },
  arcane_book: { path: 'normalized/weapons/arcane_book.png', frames: 2, cellW: 20, cellH: 20 },
  crescent_blade: { path: 'normalized/weapons/wpn_crescent_blade.png', frames: 4, cellW: 48, cellH: 48 },
  reaper_scythe: { path: 'normalized/weapons/wpn_reaper_scythe.png', frames: 4, cellW: 64, cellH: 64 },
  shock_baton: { path: 'normalized/weapons/wpn_shock_baton.png', frames: 4, cellW: 48, cellH: 48 },
  dual_pistols: { path: 'normalized/weapons/gun_dual_pistols.png', frames: 4, cellW: 34, cellH: 18 },
  minigun: { path: 'normalized/weapons/gun_minigun.png', frames: 4, cellW: 42, cellH: 18 },
  saw_launcher: { path: 'normalized/weapons/gun_saw_launcher.png', frames: 4, cellW: 38, cellH: 18 },
  flamethrower: { path: 'normalized/weapons/gun_flamethrower.png', frames: 4, cellW: 38, cellH: 18 },
  cryo_cannon: { path: 'normalized/weapons/gun_cryo_cannon.png', frames: 4, cellW: 38, cellH: 18 },
  gravity_gun: { path: 'normalized/weapons/gun_gravity_gun.png', frames: 4, cellW: 38, cellH: 18 },
  plasma_shotgun: { path: 'normalized/weapons/gun_plasma_shotgun.png', frames: 4, cellW: 38, cellH: 18 },
  twin_smg: { path: 'normalized/weapons/gun_twin_smg.png', frames: 4, cellW: 38, cellH: 18 },
  ion_beam: { path: 'normalized/weapons/gun_ion_beam.png', frames: 4, cellW: 38, cellH: 18 },
  cluster_rpg: { path: 'normalized/weapons/gun_cluster_rpg.png', frames: 4, cellW: 38, cellH: 18 },
  tesla_coil: { path: 'normalized/weapons/gun_tesla_coil.png', frames: 4, cellW: 38, cellH: 18 },
  void_cannon: { path: 'normalized/weapons/gun_void_cannon.png', frames: 4, cellW: 38, cellH: 18 },
  blizzard_carbine: { path: 'normalized/weapons/gun_blizzard_carbine.png', frames: 4, cellW: 38, cellH: 18 },
  ricochet_disc: { path: 'normalized/weapons/gun_ricochet_disc.png', frames: 4, cellW: 38, cellH: 18 },
  phantom_bow: { path: 'normalized/weapons/gun_phantom_bow.png', frames: 4, cellW: 38, cellH: 18 },
  magma_spitter: { path: 'normalized/weapons/gun_magma_spitter.png', frames: 4, cellW: 38, cellH: 18 },
  chronos_rifle: { path: 'normalized/weapons/gun_chronos_rifle.png', frames: 4, cellW: 38, cellH: 18 },
  orbital_cannon: { path: 'normalized/weapons/gun_orbital_cannon.png', frames: 4, cellW: 38, cellH: 18 },
};

/** Verified horizontal gadget strip paths and frame metrics from database-ban-sung/manifest.json. */
export const BANSUNG_GADGET_ICON_META: Readonly<Record<BansungGadgetId, SpriteSheetMeta>> = {
  stun_bomb: { path: 'normalized/weapons/gadget_stun_bomb.png', frames: 4, cellW: 32, cellH: 32 },
  cluster_bomb: { path: 'normalized/weapons/gadget_cluster_bomb.png', frames: 4, cellW: 32, cellH: 32 },
  auto_turret: { path: 'normalized/weapons/gadget_auto_turret.png', frames: 4, cellW: 48, cellH: 48 },
  heal_drone: { path: 'normalized/weapons/gadget_heal_drone.png', frames: 4, cellW: 32, cellH: 32 },
};

const UI_ENERGY_ICON = `${BANSUNG_STATIC_ROOT}/normalized/ui/ui_icon_energy.png`;
const WEAPON_PEDESTAL_KIND_IDX = BANSUNG_PICKUP_KINDS.indexOf('weapon_pedestal');
const STYLE_TAG_ID = 'bs-hotbar-shop-styles';

const WEAPON_RARITY_THEME: Readonly<Record<WeaponRarity, { label: string; color: string; glow: string }>> = {
  common: { label: 'Thường', color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.25)' },
  uncommon: { label: 'Khá', color: '#34d399', glow: 'rgba(52, 211, 153, 0.3)' },
  rare: { label: 'Hiếm', color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.35)' },
  epic: { label: 'Sử thi', color: '#c084fc', glow: 'rgba(192, 132, 252, 0.4)' },
  legendary: { label: 'Huyền thoại', color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.45)' },
  celestial: { label: 'Thiên Thanh', color: '#2dd4bf', glow: 'rgba(45, 212, 191, 0.5)' },
  mythic: { label: 'Huyết Thần', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.55)' },
};

const PERK_RARITY_THEME: Readonly<
  Record<PerkRarity, { label: string; accent: string; badgeBg: string; border: string }>
> = {
  common: {
    label: 'THƯỜNG',
    accent: '#94a3b8',
    badgeBg: 'rgba(148, 163, 184, 0.16)',
    border: '#64748b',
  },
  rare: {
    label: 'HIẾM',
    accent: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.18)',
    border: '#0ea5e9',
  },
  epic: {
    label: 'SỬ THI',
    accent: '#c084fc',
    badgeBg: 'rgba(192, 132, 252, 0.2)',
    border: '#a855f7',
  },
};

const WEAPON_CATEGORY_BADGE: Readonly<Record<BansungWeaponSpec['category'], string>> = {
  kinetic: 'Đạn',
  explosive: 'Nổ',
  energy: 'Năng lượng',
  melee: 'Cận chiến',
};

const GACHA_RARITY_THEME: Readonly<
  Record<BansungGachaRarity, { label: string; accent: string; badgeBg: string; border: string; glow: string }>
> = {
  common: {
    label: 'XANH',
    accent: '#4ade80',
    badgeBg: 'rgba(34, 197, 94, 0.2)',
    border: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.34)',
  },
  rare: {
    label: 'XANH',
    accent: '#38bdf8',
    badgeBg: 'rgba(56, 189, 248, 0.2)',
    border: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.38)',
  },
  epic: {
    label: 'TÍM',
    accent: '#c084fc',
    badgeBg: 'rgba(168, 85, 247, 0.24)',
    border: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.45)',
  },
  legendary: {
    label: 'VÀNG',
    accent: '#fbbf24',
    badgeBg: 'rgba(251, 191, 36, 0.24)',
    border: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.54)',
  },
  celestial: {
    label: 'LAM NGỌC',
    accent: '#2dd4bf',
    badgeBg: 'rgba(45, 212, 191, 0.24)',
    border: '#2dd4bf',
    glow: 'rgba(45, 212, 191, 0.58)',
  },
  mythic: {
    label: 'ĐỎ HUYẾT',
    accent: '#f87171',
    badgeBg: 'rgba(239, 68, 68, 0.26)',
    border: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.62)',
  },
  prismatic: {
    label: 'CẦU VỒNG',
    accent: '#f472b6',
    badgeBg: 'linear-gradient(90deg, rgba(244, 114, 182, 0.28), rgba(56, 189, 248, 0.28))',
    border: '#ec4899',
    glow: 'rgba(244, 114, 182, 0.72)',
  },
};

const GACHA_SHORT_SKILL_NAME: Readonly<Record<GachaSkillCategory, string>> = {
  skill_damage: 'Sát Thương',
  skill_hp: 'Hồi Máu',
  skill_stamina: 'Hồi Thể Lực',
  skill_shield: 'Khiên Nhỏ',
  skill_firerate: 'Tốc Đánh',
  skill_multishot: 'Đạn Lan Tỏa',
  skill_crit: 'Chí Mạng',
  skill_mobility: 'Tốc Chạy',
  skill_lightning_orb: 'Cầu Sét (+1)',
  skill_fire_orb: 'Cầu Lửa (+1)',
  skill_spirit_sword: 'Triệu Kiếm (+1)',
  skill_magnet: 'Nam Châm Hút',
};

const GACHA_SKILL_CATEGORY_META: Readonly<
  Record<GachaSkillCategory, { label: string; accent: string; Icon: React.ComponentType<{ size?: number; color?: string }> }>
> = {
  skill_damage: { label: 'Tăng Sát Thương', accent: '#f97316', Icon: Flame },
  skill_hp: { label: 'Hồi Máu Nhẹ', accent: '#34d399', Icon: Heart },
  skill_stamina: { label: 'Hồi Thể Lực', accent: '#fbbf24', Icon: Wind },
  skill_shield: { label: 'Hồi Khiên Nhẹ', accent: '#38bdf8', Icon: Shield },
  skill_firerate: { label: 'Tốc Độ Đánh/Bắn', accent: '#38bdf8', Icon: Zap },
  skill_multishot: { label: 'Đạn Lan Tỏa', accent: '#c084fc', Icon: Layers },
  skill_crit: { label: 'Chí Mạng', accent: '#fbbf24', Icon: Crosshair },
  skill_mobility: { label: 'Tốc Độ Chạy', accent: '#22d3ee', Icon: Wind },
  skill_lightning_orb: { label: 'Quả Cầu Sét Xoay', accent: '#facc15', Icon: Orbit },
  skill_fire_orb: { label: 'Quả Cầu Lửa Xoay', accent: '#fb923c', Icon: Flame },
  skill_spirit_sword: { label: 'Triệu Hồi Kiếm Kéo', accent: '#38bdf8', Icon: Swords },
  skill_magnet: { label: 'Nam Châm Hút Đồ', accent: '#2dd4bf', Icon: Magnet },
};

const HOTBAR_DEFAULT_CSS = `
@layer bs-hotbar-default {
  .bs-hotbar-wrap {
    position: fixed;
    left: 50%;
    bottom: max(12px, env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    user-select: none;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .bs-hotbar-row {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    padding: 6px 8px;
    border-radius: 8px;
    background: linear-gradient(180deg, rgba(22, 27, 42, 0.92), rgba(13, 16, 27, 0.96));
    border: 2px solid #090b10;
    box-shadow:
      inset 0 0 0 1px rgba(71, 85, 105, 0.55),
      0 10px 24px rgba(0, 0, 0, 0.55);
    pointer-events: auto;
  }

  .bs-hotbar-slot {
    position: relative;
    width: 66px;
    height: 66px;
    padding: 0;
    border-radius: 6px;
    border: 2px solid #334155;
    background: linear-gradient(180deg, #1b2234 0%, #101522 100%);
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.05), inset 0 -2px 0 rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #e2e8f0;
    cursor: pointer;
    overflow: hidden;
    transition: transform 90ms ease, border-color 110ms ease, box-shadow 110ms ease;
    touch-action: manipulation;
  }

  .bs-hotbar-slot:hover:not(:disabled) {
    border-color: #64748b;
    filter: brightness(1.08);
  }

  .bs-hotbar-slot:disabled {
    cursor: default;
  }

  .bs-hotbar-slot--active {
    transform: translateY(-4px);
    border-color: #fbbf24;
    background: linear-gradient(180deg, #272b42 0%, #161a2b 100%);
    box-shadow:
      0 0 0 1px #090b10,
      0 0 14px rgba(251, 191, 36, 0.42),
      inset 0 0 10px rgba(251, 191, 36, 0.14);
  }

  .bs-hotbar-slot--empty {
    border-style: dashed;
    border-color: rgba(71, 85, 105, 0.55);
    background: rgba(15, 20, 32, 0.72);
    color: #475569;
  }

  .bs-hotbar-slot--empowered {
    box-shadow:
      0 0 0 1px #0ea5e9,
      0 0 14px rgba(56, 189, 248, 0.45),
      inset 0 0 10px rgba(56, 189, 248, 0.22);
  }

  .bs-hotbar-slot--low-energy {
    box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.48);
  }

  .bs-slot-key {
    position: absolute;
    top: 3px;
    left: 4px;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    color: #94a3b8;
    text-shadow: 0 1px 1px #000;
    z-index: 3;
    pointer-events: none;
  }

  .bs-hotbar-slot--active .bs-slot-key {
    color: #fde68a;
  }

  .bs-slot-energy {
    position: absolute;
    top: 3px;
    right: 4px;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    color: #38bdf8;
    text-shadow: 0 1px 1px #000;
    font-variant-numeric: tabular-nums;
    z-index: 3;
    pointer-events: none;
  }

  .bs-slot-energy--short {
    color: #f87171;
  }

  .bs-slot-ammo {
    position: absolute;
    left: 2px;
    right: 2px;
    bottom: 3px;
    text-align: center;
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1;
    color: #f8fafc;
    text-shadow: 0 1px 2px #000, 0 0 3px #000;
    font-variant-numeric: tabular-nums;
    z-index: 3;
    pointer-events: none;
  }

  .bs-slot-ammo--low {
    color: #fbbf24;
  }

  .bs-slot-ammo--empty {
    color: #f87171;
  }

  .bs-slot-rarity-bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    z-index: 3;
    pointer-events: none;
  }

  .bs-slot-charges {
    position: absolute;
    right: 3px;
    bottom: 3px;
    padding: 0 3px;
    border-radius: 3px;
    background: rgba(9, 11, 16, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.45);
    font-size: 9px;
    font-weight: 800;
    line-height: 12px;
    color: #f8fafc;
    font-variant-numeric: tabular-nums;
    z-index: 3;
    pointer-events: none;
  }

  .bs-cd-curtain {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    background: rgba(6, 9, 16, 0.72);
    z-index: 2;
    pointer-events: none;
  }

  .bs-cd-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    color: #f8fafc;
    text-shadow: 0 1px 2px #000;
    font-variant-numeric: tabular-nums;
    z-index: 4;
    pointer-events: none;
  }

  .bs-hotbar-sep {
    width: 1px;
    height: 36px;
    align-self: center;
    background: rgba(71, 85, 105, 0.55);
    margin: 0 1px;
  }

  .bs-dash-chip {
    position: relative;
    width: 54px;
    height: 54px;
    align-self: center;
    padding: 0;
    border-radius: 6px;
    border: 2px solid #0ea5e9;
    background: linear-gradient(180deg, #13283d 0%, #0d1929 100%);
    box-shadow: 0 0 10px rgba(14, 165, 233, 0.25);
    color: #bae6fd;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    touch-action: manipulation;
  }

  .bs-dash-chip--cooling {
    border-color: #334155;
    background: linear-gradient(180deg, #161b2a 0%, #0f131f 100%);
    box-shadow: none;
    color: #64748b;
  }

  .bs-dash-chip-key {
    position: absolute;
    bottom: 3px;
    font-size: 9px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.02em;
    opacity: 0.92;
    z-index: 3;
    pointer-events: none;
  }

  /* Active Reload / Dry Warning Strip */
  .bs-reload-panel {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 5px;
    background: rgba(15, 20, 34, 0.94);
    border: 2px solid #090b10;
    box-shadow: inset 0 0 0 1px #3b4254, 0 6px 16px rgba(0, 0, 0, 0.45);
    color: #f8fafc;
  }

  .bs-reload-track {
    position: relative;
    width: 148px;
    height: 10px;
    border-radius: 2px;
    background: #090d16;
    border: 1px solid #334155;
    overflow: hidden;
  }

  .bs-reload-lockout {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: rgba(239, 68, 68, 0.26);
    border-right: 1px solid rgba(248, 113, 113, 0.55);
  }

  .bs-reload-sweet {
    position: absolute;
    top: 0;
    bottom: 0;
    background: linear-gradient(180deg, #fde047, #f59e0b);
    box-shadow: 0 0 8px rgba(251, 191, 36, 0.75);
  }

  .bs-reload-needle {
    position: absolute;
    top: -1px;
    bottom: -1px;
    width: 3px;
    margin-left: -1.5px;
    background: #ffffff;
    box-shadow: 0 0 6px #ffffff;
  }

  .bs-reload-btn {
    padding: 2px 7px;
    border-radius: 3px;
    border: 1px solid #475569;
    background: #1e293b;
    color: #f8fafc;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .bs-reload-btn--sweet {
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.22);
    color: #fde68a;
  }

  /* Pedestal [E] Prompt */
  .bs-pedestal-prompt {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(460px, calc(100vw - 24px));
    padding: 8px 12px;
    border-radius: 6px;
    background: linear-gradient(180deg, rgba(26, 32, 50, 0.96), rgba(15, 19, 31, 0.98));
    border: 2px solid #090b10;
    box-shadow: inset 0 0 0 1.5px #475569, 0 10px 24px rgba(0, 0, 0, 0.55);
    color: #f8fafc;
    cursor: pointer;
    text-align: left;
    transition: transform 90ms ease, filter 110ms ease;
    touch-action: manipulation;
  }

  .bs-pedestal-prompt:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  .bs-pedestal-keycap {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    border: 2px solid #fbbf24;
    background: linear-gradient(180deg, #422f10, #231908);
    color: #fde68a;
    font-size: 14px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 0 #090b10;
  }

  .bs-pedestal-iconbox {
    flex-shrink: 0;
    width: 44px;
    height: 34px;
    border-radius: 4px;
    background: rgba(9, 12, 20, 0.85);
    border: 1px solid #334155;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3px;
  }

  .bs-pedestal-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .bs-pedestal-title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 800;
    line-height: 1.2;
  }

  .bs-pedestal-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    color: #cbd5e1;
    font-variant-numeric: tabular-nums;
  }

  .bs-pedestal-compare {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 10.5px;
    color: #94a3b8;
  }

  /* Perk Draft Modal */
  .bs-perk-backdrop {
    position: fixed;
    inset: 0;
    z-index: 25;
    background: radial-gradient(circle at 50% 42%, rgba(16, 22, 38, 0.72), rgba(5, 8, 15, 0.86));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    pointer-events: auto;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .bs-perk-modal {
    width: min(760px, 100%);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 16px 18px 18px;
    border-radius: 8px;
    background: linear-gradient(180deg, #1a2033 0%, #101422 100%);
    border: 2px solid #090b10;
    box-shadow: inset 0 0 0 2px #3b4254, 0 22px 54px rgba(0, 0, 0, 0.72);
    color: #f8fafc;
  }

  .bs-perk-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .bs-perk-timer-track {
    height: 6px;
    border-radius: 3px;
    background: #090d16;
    border: 1px solid #2b3347;
    overflow: hidden;
    margin-bottom: 14px;
  }

  .bs-perk-timer-fill {
    height: 100%;
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
    transition: width 160ms linear;
  }

  .bs-perk-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .bs-perk-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 13px 12px;
    border-radius: 6px;
    border: 2px solid #334155;
    background: linear-gradient(180deg, #21293f 0%, #141929 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: #f8fafc;
    text-align: left;
    cursor: pointer;
    transition: transform 110ms ease, border-color 110ms ease, box-shadow 110ms ease;
    touch-action: manipulation;
  }

  .bs-perk-card:hover:not(:disabled) {
    transform: translateY(-3px);
    filter: brightness(1.06);
  }

  .bs-perk-card:disabled {
    cursor: default;
  }

  .bs-perk-card--picked {
    border-color: #fbbf24 !important;
    box-shadow: 0 0 18px rgba(251, 191, 36, 0.35), inset 0 0 12px rgba(251, 191, 36, 0.14);
  }

  .bs-perk-card--muted {
    opacity: 0.45;
  }

  .bs-perk-wait-pill {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(15, 21, 36, 0.92);
    border: 1.5px solid #38bdf8;
    color: #bae6fd;
    font-size: 11.5px;
    font-weight: 700;
  }

  .bs-slot-tier {
    position: absolute;
    left: 15px;
    top: 1px;
    padding: 0 3px;
    border-radius: 2px;
    background: rgba(9, 11, 16, 0.92);
    border: 1px solid currentColor;
    font-size: 7px;
    font-weight: 900;
    line-height: 10px;
    letter-spacing: 0.02em;
    z-index: 3;
    pointer-events: none;
  }

  /* Survival Level-Up Bottom-Right Non-Blocking 777 Slot-Reel Gacha Dock */
  .bs-gacha-dock-wrap {
    position: fixed;
    right: max(12px, env(safe-area-inset-right, 0px));
    bottom: max(96px, calc(90px + env(safe-area-inset-bottom, 0px)));
    z-index: 18;
    width: min(552px, calc(100vw - 24px));
    pointer-events: none;
    user-select: none;
    font-family: ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
  }

  .bs-gacha-dock {
    pointer-events: auto;
    padding: 9px 11px 11px;
    border-radius: 9px;
    background: linear-gradient(180deg, rgba(24, 30, 50, 0.95) 0%, rgba(11, 15, 27, 0.97) 100%);
    border: 2px solid #090b10;
    box-shadow:
      inset 0 0 0 1.5px #475569,
      0 0 28px rgba(168, 85, 247, 0.25),
      0 14px 36px rgba(0, 0, 0, 0.78);
    color: #f8fafc;
  }

  .bs-gacha-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .bs-gacha-queue {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.16);
    border: 1px solid #38bdf8;
    color: #bae6fd;
    font-size: 10px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .bs-gacha-card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 8px 9px;
    border-radius: 7px;
    border: 2px solid #334155;
    background: linear-gradient(180deg, #232c45 0%, #121728 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    text-align: left;
    cursor: pointer;
    min-height: 158px;
    transition: transform 110ms ease, border-color 110ms ease, box-shadow 110ms ease;
    touch-action: manipulation;
  }

  .bs-gacha-card:hover:not(:disabled) {
    transform: translateY(-3px);
    filter: brightness(1.08);
  }

  .bs-gacha-card:disabled {
    cursor: default;
  }

  .bs-gacha-card--picked {
    border-color: #fbbf24 !important;
    box-shadow: 0 0 22px rgba(251, 191, 36, 0.48), inset 0 0 14px rgba(251, 191, 36, 0.2);
  }

  .bs-gacha-card--muted {
    opacity: 0.45;
  }

  .bs-gacha-hotkey {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 4px;
    background: #090d16;
    border: 1.5px solid #475569;
    color: #fde68a;
    font-size: 10px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .bs-gacha-mult {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.02em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .bs-gacha-mult--green {
    background: rgba(34, 197, 94, 0.22);
    border: 1px solid #4ade80;
    color: #bbf7d0;
  }

  .bs-gacha-mult--purple {
    background: rgba(168, 85, 247, 0.26);
    border: 1px solid #c084fc;
    color: #f3e8ff;
    box-shadow: 0 0 8px rgba(168, 85, 247, 0.35);
  }

  .bs-gacha-mult--gold {
    background: rgba(245, 158, 11, 0.3);
    border: 1px solid #fbbf24;
    color: #fef08a;
    box-shadow: 0 0 12px rgba(251, 191, 36, 0.45);
  }

  .bs-gacha-mult--teal {
    background: rgba(20, 184, 166, 0.3);
    border: 1px solid #2dd4bf;
    color: #ccfbf1;
    box-shadow: 0 0 12px rgba(45, 212, 191, 0.5);
  }

  .bs-gacha-mult--crimson {
    background: rgba(220, 38, 38, 0.32);
    border: 1px solid #ef4444;
    color: #fee2e2;
    box-shadow: 0 0 14px rgba(239, 68, 68, 0.55);
  }

  .bs-gacha-mult--rainbow {
    background: linear-gradient(90deg, rgba(236, 72, 153, 0.45), rgba(56, 189, 248, 0.45), rgba(251, 191, 36, 0.45));
    border: 1px solid #f472b6;
    color: #ffffff;
    box-shadow: 0 0 14px rgba(244, 114, 182, 0.68);
  }

  .bs-gacha-card--prismatic {
    animation: bs-prismatic-glow 2.2s linear infinite;
  }

  @keyframes bs-prismatic-glow {
    0% {
      border-color: #f472b6;
      box-shadow: 0 0 18px rgba(244, 114, 182, 0.65);
    }
    33% {
      border-color: #38bdf8;
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.65);
    }
    66% {
      border-color: #facc15;
      box-shadow: 0 0 18px rgba(250, 204, 21, 0.65);
    }
    100% {
      border-color: #f472b6;
      box-shadow: 0 0 18px rgba(244, 114, 182, 0.65);
    }
  }

  .bs-gacha-lvup {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.01em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .bs-reel-orb--green {
    background: radial-gradient(circle at 35% 30%, #bbf7d0, #16a34a);
    border-color: #4ade80;
    color: #052e16;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.65);
  }

  .bs-reel-curtain {
    position: absolute;
    inset: 0;
    z-index: 4;
    overflow: hidden;
    background: linear-gradient(180deg, #0b1020 0%, #1b1635 50%, #0b1020 100%);
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bs-reel-strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    animation: bs-reel-scroll-up 240ms linear infinite;
  }

  .bs-reel-orb {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 900;
    border: 2px solid;
  }

  .bs-reel-orb--purple {
    background: radial-gradient(circle at 35% 30%, #e9d5ff, #9333ea);
    border-color: #d8b4fe;
    color: #fff;
    box-shadow: 0 0 14px rgba(168, 85, 247, 0.7);
  }

  .bs-reel-orb--gold {
    background: radial-gradient(circle at 35% 30%, #fef08a, #d97706);
    border-color: #fde047;
    color: #451a03;
    box-shadow: 0 0 16px rgba(251, 191, 36, 0.8);
  }

  .bs-reel-orb--teal {
    background: radial-gradient(circle at 35% 30%, #99f6e4, #0d9488);
    border-color: #2dd4bf;
    color: #042f2e;
    box-shadow: 0 0 16px rgba(45, 212, 191, 0.85);
  }

  .bs-reel-orb--crimson {
    background: radial-gradient(circle at 35% 30%, #fecaca, #b91c1c);
    border-color: #f87171;
    color: #ffffff;
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.85);
  }

  .bs-reel-orb--rainbow {
    background: conic-gradient(#f472b6, #38bdf8, #4ade80, #fbbf24, #ef4444, #f472b6);
    border-color: #ffffff;
    color: #ffffff;
    box-shadow: 0 0 18px rgba(244, 114, 182, 0.9);
  }

  @keyframes bs-reel-scroll-up {
    0% {
      transform: translateY(46%);
    }
    100% {
      transform: translateY(-46%);
    }
  }

  .bs-gacha-evo-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border-radius: 4px;
    background: rgba(9, 13, 24, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.28);
    font-size: 9.5px;
    font-weight: 800;
  }

  @media (max-width: 720px) {
    .bs-hotbar-row {
      gap: 5px;
      padding: 4px 6px;
    }

    .bs-hotbar-slot {
      width: 46px;
      height: 46px;
    }

    .bs-dash-chip {
      width: 42px;
      height: 42px;
    }

    .bs-perk-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 390px) {
    .bs-hotbar-row {
      gap: 3px;
      padding: 4px;
    }

    .bs-hotbar-slot {
      width: 40px;
      height: 40px;
    }

    .bs-dash-chip {
      width: 38px;
      height: 38px;
    }
  }

  /* Armory & Supply Coin Shop Modal ([B]) */
  .bs-shop-backdrop {
    position: fixed;
    inset: 0;
    z-index: 26;
    background: radial-gradient(circle at 50% 42%, rgba(12, 18, 32, 0.78), rgba(4, 7, 14, 0.9));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    pointer-events: auto;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .bs-shop-modal {
    width: min(920px, 100%);
    max-height: calc(100vh - 36px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
    border-radius: 8px;
    background: linear-gradient(180deg, #171e30 0%, #0d1220 100%);
    border: 2px solid #090b10;
    box-shadow: inset 0 0 0 2px #3b4254, 0 24px 60px rgba(0, 0, 0, 0.76);
    color: #f8fafc;
  }

  .bs-shop-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .bs-shop-coins {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 5px;
    background: rgba(245, 158, 11, 0.16);
    border: 1px solid rgba(251, 191, 36, 0.55);
    color: #fde047;
    font-size: 13px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .bs-shop-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 5px;
    border: 1px solid #475569;
    background: #1e293b;
    color: #e2e8f0;
    cursor: pointer;
  }

  .bs-shop-close:hover {
    border-color: #94a3b8;
    background: #334155;
  }

  .bs-shop-services {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .bs-shop-svc-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    border: 1.5px solid #334155;
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.96));
    color: #f8fafc;
    cursor: pointer;
    text-align: left;
    transition: border-color 120ms ease, transform 100ms ease;
  }

  .bs-shop-svc-btn:hover:not(:disabled) {
    border-color: #fbbf24;
    transform: translateY(-1px);
  }

  .bs-shop-svc-btn:disabled {
    opacity: 0.72;
    cursor: not-allowed;
  }

  .bs-shop-tabs {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .bs-shop-tab {
    padding: 5px 11px;
    border-radius: 5px;
    border: 1px solid #334155;
    background: #141a2b;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .bs-shop-tab--active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.18);
    color: #e0f2fe;
  }

  .bs-shop-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    overflow-y: auto;
    padding-right: 4px;
    max-height: 52vh;
  }

  .bs-shop-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
    padding: 9px 10px;
    border-radius: 6px;
    border: 1.5px solid #2b354b;
    background: rgba(15, 23, 42, 0.88);
  }

  .bs-shop-card--owned {
    border-color: rgba(52, 211, 153, 0.6);
    background: rgba(16, 42, 34, 0.42);
  }

  .bs-shop-buy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    height: 26px;
    padding: 0 10px;
    border-radius: 4px;
    border: 1px solid #d97706;
    background: linear-gradient(180deg, #b45309, #92400e);
    color: #fef3c7;
    font-size: 11px;
    font-weight: 900;
    cursor: pointer;
  }

  .bs-shop-buy:hover:not(:disabled) {
    filter: brightness(1.12);
  }

  .bs-shop-buy:disabled {
    opacity: 1;
    border-color: #334155;
    background: #1e293b;
    color: #cbd5e1;
    cursor: not-allowed;
  }

  @media (max-width: 720px) {
    .bs-shop-services {
      grid-template-columns: 1fr;
    }

    .bs-shop-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 480px) {
    .bs-shop-grid {
      grid-template-columns: 1fr;
    }
  }
}
`;

function injectDefaultHotbarStyles(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(STYLE_TAG_ID);
  if (existing) {
    if (existing.textContent !== HOTBAR_DEFAULT_CSS) {
      existing.textContent = HOTBAR_DEFAULT_CSS;
    }
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = HOTBAR_DEFAULT_CSS;
  document.head.prepend(style);
}

export function getWeaponIconMeta(id: BansungWeaponId): ResolvedSpriteMeta {
  const entry = BANSUNG_WEAPON_ICON_META[id];
  return {
    ...entry,
    src: `${BANSUNG_STATIC_ROOT}/${entry.path}`,
  };
}

export function getGadgetIconMeta(id: BansungGadgetId): ResolvedSpriteMeta {
  const entry = BANSUNG_GADGET_ICON_META[id];
  return {
    ...entry,
    src: `${BANSUNG_STATIC_ROOT}/${entry.path}`,
  };
}

export function getPerkIconPath(perkOrIcon: string): string {
  const perk = getBansungPerk(perkOrIcon);
  const iconName = perk?.icon ?? perkOrIcon;
  return `${BANSUNG_STATIC_ROOT}/normalized/ui/${iconName}.png`;
}

export function findNearestWeaponPedestal(
  pickups: readonly SnapPickup[],
  px: number,
  py: number,
  maxRange: number = BANSUNG_PICKUP_CONSTS.R_INTERACT,
): NearbyWeaponPedestal | null {
  if (WEAPON_PEDESTAL_KIND_IDX < 0 || !pickups.length) return null;
  let best: NearbyWeaponPedestal | null = null;
  let bestDistSq = maxRange * maxRange;

  for (const pickup of pickups) {
    if (pickup.kindIdx !== WEAPON_PEDESTAL_KIND_IDX) continue;
    const dx = pickup.x - px;
    const dy = pickup.y - py;
    const distSq = dx * dx + dy * dy;
    if (distSq > bestDistSq) continue;
    const weapon = getWeaponByIdx(pickup.subId);
    if (!weapon) continue;
    bestDistSq = distSq;
    best = {
      pickup,
      weapon,
      distance: Math.sqrt(distSq),
    };
  }
  return best;
}

function isSpectatingSnapshot(snapshot: BansungHudSnapshot): boolean {
  const s = snapshot.spectating as boolean | { active?: boolean } | undefined;
  if (typeof s === 'boolean') return s;
  return Boolean(s?.active);
}

function getLivingLocalCoords(snapshot: BansungHudSnapshot): { x: number; y: number } | null {
  const lp = snapshot.localPlayer;
  if (!lp || isSpectatingSnapshot(snapshot)) return null;
  if (lp.state === BANSUNG_STATE_DEAD || lp.state === BANSUNG_STATE_DOWNED) return null;
  const drawX = bansungStore.localDrawX;
  const drawY = bansungStore.localDrawY;
  // Fall back to interpolated player state if store draw coords are still uninitialized.
  if (drawX === 0 && drawY === 0 && (lp.x !== 0 || lp.y !== 0)) {
    return { x: lp.x, y: lp.y };
  }
  return { x: drawX, y: drawY };
}

function useNearbyWeaponPedestal(
  snapshot: BansungHudSnapshot,
  pickupsOverride?: readonly SnapPickup[],
): NearbyWeaponPedestal | null {
  const [nearest, setNearest] = useState<NearbyWeaponPedestal | null>(null);
  const snapshotRef = useRef(snapshot);
  const pickupsOverrideRef = useRef(pickupsOverride);
  snapshotRef.current = snapshot;
  pickupsOverrideRef.current = pickupsOverride;

  const sync = useCallback(() => {
    const coords = getLivingLocalCoords(snapshotRef.current);
    const next = coords
      ? findNearestWeaponPedestal(
          pickupsOverrideRef.current ?? bansungStore.pickups,
          coords.x,
          coords.y,
          BANSUNG_PICKUP_CONSTS.R_INTERACT,
        )
      : null;

    setNearest((prev) => {
      if (!prev && !next) return prev;
      if (prev && next && prev.pickup.id === next.pickup.id && prev.weapon.id === next.weapon.id) {
        return prev;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    sync();
  }, [snapshot, pickupsOverride, sync]);

  useEffect(() => {
    if (pickupsOverride) return undefined;
    const unsub = bansungStore.subscribe(sync);
    const timer = window.setInterval(sync, 80);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [Boolean(pickupsOverride), sync]);

  return nearest;
}

export interface WeaponSpriteIconProps {
  meta: ResolvedSpriteMeta;
  alt: string;
  maxWidth: number;
  maxHeight: number;
  fallbackKind?: 'weapon' | 'gadget';
  className?: string;
}

/** Renders frame 0 of a horizontal pixel-art sprite strip at crisp integer-fitted scale. */
export function WeaponSpriteIcon({
  meta,
  alt,
  maxWidth,
  maxHeight,
  fallbackKind = 'weapon',
  className,
}: WeaponSpriteIconProps) {
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [meta.src]);

  if (errored) {
    return fallbackKind === 'gadget' ? (
      <Sparkles size={Math.min(maxWidth, maxHeight, 20)} color="#38bdf8" aria-hidden="true" />
    ) : (
      <Crosshair size={Math.min(maxWidth, maxHeight, 20)} color="#cbd5e1" aria-hidden="true" />
    );
  }

  const rawScale = Math.min(maxWidth / meta.cellW, maxHeight / meta.cellH);
  const frameW = Math.max(12, Math.round(meta.cellW * rawScale));
  const frameH = Math.max(10, Math.round(meta.cellH * rawScale));

  return (
    <div
      className={className}
      style={{
        width: frameW,
        height: frameH,
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        pointerEvents: 'none',
      }}
    >
      <img
        src={meta.src}
        alt={alt}
        draggable={false}
        onError={() => setErrored(true)}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: frameW * meta.frames,
          height: frameH,
          maxWidth: 'none',
          objectFit: 'fill',
          imageRendering: 'pixelated',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function stopPointerPropagation(e: React.SyntheticEvent): void {
  e.stopPropagation();
}

function preventFocusOnMouseDown(e: React.MouseEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

function formatCdSeconds(ms: number): string {
  if (ms <= 0) return '0s';
  if (ms >= 10_000) return `${Math.ceil(ms / 1000)}s`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function countPerkStacks(perks: readonly BansungPerkId[], targetId: BansungPerkId): number {
  let count = 0;
  for (const id of perks) {
    if (id === targetId) count += 1;
  }
  return count;
}

type SparseWeaponSlot = (BansungWeaponSlot & { slotIdx?: number }) | null | undefined;

function getHotbarSlotAt(
  slots: readonly SparseWeaponSlot[] | undefined,
  idx: number,
): BansungWeaponSlot | null {
  if (!slots) return null;
  const hasExplicitIdx = slots.some((s) => Boolean(s && typeof s.slotIdx === 'number'));
  if (hasExplicitIdx) {
    return slots.find((s) => s?.slotIdx === idx) ?? null;
  }
  return slots[idx] ?? null;
}

function resolveSlotWeaponTier(
  slot?: BansungWeaponSlot | null,
  tierOverride?: number,
): BansungWeaponTier {
  return normalizeWeaponTier(slot?.tier ?? tierOverride ?? 1);
}

interface WeaponHotbarSlotProps {
  index: number;
  slot?: BansungWeaponSlot | null;
  tier?: number;
  active: boolean;
  empowered: boolean;
  playerEnergy: number;
  reloadRatio: number | null;
  onPress: (idx: number) => void;
}

function WeaponHotbarSlot({
  index,
  slot,
  tier: tierProp,
  active,
  empowered,
  playerEnergy,
  reloadRatio,
  onPress,
}: WeaponHotbarSlotProps) {
  const spec = slot ? getWeaponSpec(slot.id) : undefined;
  const tier = resolveSlotWeaponTier(slot, tierProp);
  const evo = slot ? getWeaponEvolutionStats(slot.id, tier) : undefined;
  const tierSpec = BANSUNG_WEAPON_TIERS[tier];
  const isEvolved = Boolean(slot && evo && evo.tier >= 2);
  const rarityTheme = spec ? WEAPON_RARITY_THEME[spec.rarity] : undefined;
  const effectiveEnergyCost = evo ? evo.energyCost : (spec?.energyCost ?? 0);
  const energyShort = Boolean(spec && effectiveEnergyCost > 0 && playerEnergy < effectiveEnergyCost);
  const hasAmmo = Boolean(slot && slot.maxClip > 0);
  const clipPct = hasAmmo && slot ? slot.clip / slot.maxClip : 1;
  const clipClass =
    hasAmmo && slot && slot.clip <= 0
      ? 'bs-slot-ammo bs-slot-ammo--empty'
      : hasAmmo && slot && clipPct <= 0.25
        ? 'bs-slot-ammo bs-slot-ammo--low'
        : 'bs-slot-ammo';

  const slotClasses = [
    'bs-hotbar-slot',
    active ? 'bs-hotbar-slot--active' : '',
    !slot ? 'bs-hotbar-slot--empty' : '',
    empowered ? 'bs-hotbar-slot--empowered' : '',
    active && energyShort ? 'bs-hotbar-slot--low-energy' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const displayName = slot?.evolvedName ?? evo?.vnName ?? spec?.vnName ?? '';
  const displayEnName = evo?.name ?? spec?.name ?? '';
  const dmgText = spec ? formatWeaponDmgText(spec, evo?.dmgMult ?? 1) : '';
  const compactDmg = dmgText.split(' · ')[0];
  const ammoSummary = hasAmmo && slot ? ` — ${slot.clip}/${slot.maxClip}` : '';
  const title = spec
    ? `[${index + 1}] ${displayName} (${displayEnName}) · ${dmgText}${isEvolved && evo ? ` [${evo.badge}]` : ''}${ammoSummary}${effectiveEnergyCost > 0 ? ` · ⚡${effectiveEnergyCost}` : ''}`
    : `Ô vũ khí trống [${index + 1}]`;

  const evolvedStyle: React.CSSProperties | undefined = isEvolved
    ? {
        borderColor: tierSpec.auraColor,
        boxShadow: active
          ? `0 0 0 1px #fbbf24, 0 0 14px ${tierSpec.auraColor}80, inset 0 0 10px ${tierSpec.auraColor}38`
          : `0 0 10px ${tierSpec.auraColor}48, inset 0 0 8px ${tierSpec.auraColor}24`,
      }
    : undefined;

  return (
    <button
      type="button"
      tabIndex={-1}
      className={slotClasses}
      style={evolvedStyle}
      disabled={!slot}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={preventFocusOnMouseDown}
      onPointerDown={stopPointerPropagation}
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        if (slot) onPress(index);
      }}
    >
      <span className="bs-slot-key">{index + 1}</span>

      {slot && spec ? (
        <>
          {effectiveEnergyCost > 0 && (
            <span className={`bs-slot-energy${energyShort ? ' bs-slot-energy--short' : ''}`}>
              <Zap size={8} />
              {effectiveEnergyCost}
            </span>
          )}

          <WeaponSpriteIcon
            meta={getWeaponIconMeta(slot.id)}
            alt={displayName}
            maxWidth={44}
            maxHeight={28}
          />

          {isEvolved && evo && (
            <span className="bs-slot-tier" style={{ color: tierSpec.auraColor }}>
              {evo.badge}
            </span>
          )}

          {compactDmg && (
            <span
              style={{
                position: 'absolute',
                left: 2,
                right: 2,
                bottom: hasAmmo ? 14 : 4,
                textAlign: 'center',
                fontSize: 8.5,
                fontWeight: 900,
                lineHeight: 1,
                color: '#fde047',
                textShadow: '0 1px 1px #000, 0 0 3px #000',
                pointerEvents: 'none',
                zIndex: 3,
              }}
            >
              {compactDmg}
            </span>
          )}

          {hasAmmo && slot && (
            <span className={clipClass}>
              {slot.clip}/{slot.maxClip}
            </span>
          )}

          {(isEvolved || rarityTheme) && (
            <span
              className="bs-slot-rarity-bar"
              style={{ background: isEvolved ? tierSpec.auraColor : rarityTheme?.color }}
            />
          )}

          {active && reloadRatio !== null && (
            <>
              <div
                className="bs-cd-curtain"
                style={{ height: `${Math.round((1 - reloadRatio) * 100)}%` }}
              />
              <span className="bs-cd-label" aria-hidden="true">
                <RefreshCw size={12} />
              </span>
            </>
          )}
        </>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.4 }}>—</span>
      )}
    </button>
  );
}

interface GadgetHotbarSlotProps {
  gadget: BansungGadgetState;
  playerEnergy: number;
  onTrigger: () => void;
}

function GadgetHotbarSlot({ gadget, playerEnergy, onTrigger }: GadgetHotbarSlotProps) {
  const spec: BansungGadgetSpec = getGadgetSpec(gadget.id) ?? BANSUNG_GADGETS.stun_bomb;
  const cdMax = Math.max(1, gadget.cdMaxMs || spec.cooldownMs);
  const cdRatio = gadget.cdMs > 0 ? clamp(gadget.cdMs / cdMax, 0, 1) : 0;
  const energyShort = spec.energyCost > 0 && playerEnergy < spec.energyCost;
  const hasCharge = gadget.charges > 0;
  const blocked = !hasCharge && gadget.cdMs > 0;

  const title = `[Q] ${spec.vnName} (${spec.name}) · Hồi ${formatCdSeconds(spec.cooldownMs)} · ⚡${spec.energyCost}`;

  return (
    <button
      type="button"
      tabIndex={-1}
      className={`bs-hotbar-slot${energyShort ? ' bs-hotbar-slot--low-energy' : ''}`}
      title={title}
      aria-label={title}
      onMouseDown={preventFocusOnMouseDown}
      onPointerDown={stopPointerPropagation}
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        onTrigger();
      }}
      style={{
        borderColor: hasCharge && !energyShort ? '#38bdf8' : '#334155',
        opacity: blocked ? 0.85 : 1,
      }}
    >
      <span className="bs-slot-key">Q</span>

      {spec.energyCost > 0 && (
        <span className={`bs-slot-energy${energyShort ? ' bs-slot-energy--short' : ''}`}>
          <Zap size={8} />
          {spec.energyCost}
        </span>
      )}

      <WeaponSpriteIcon
        meta={getGadgetIconMeta(gadget.id)}
        alt={spec.vnName}
        maxWidth={38}
        maxHeight={32}
        fallbackKind="gadget"
      />

      {cdRatio > 0 && (
        <div
          className="bs-cd-curtain"
          style={{ height: `${Math.round(cdRatio * 100)}%` }}
        />
      )}

      {blocked ? (
        <span className="bs-cd-label">{formatCdSeconds(gadget.cdMs)}</span>
      ) : (
        (spec.maxCharges > 1 || gadget.charges > 0) && (
          <span className="bs-slot-charges">x{gadget.charges}</span>
        )
      )}

      <span className="bs-slot-rarity-bar" style={{ background: '#38bdf8' }} />
    </button>
  );
}

interface SupplyHotbarSlotProps {
  consumable: HotbarConsumableSlot;
}

function SupplyHotbarSlot({ consumable }: SupplyHotbarSlotProps) {
  const cdMax = Math.max(1, consumable.cdMaxMs ?? 1);
  const cdRatio = consumable.cdMs && consumable.cdMs > 0 ? clamp(consumable.cdMs / cdMax, 0, 1) : 0;
  return (
    <button
      type="button"
      tabIndex={-1}
      className="bs-hotbar-slot"
      disabled={consumable.disabled}
      title={consumable.label}
      aria-label={consumable.label}
      onMouseDown={preventFocusOnMouseDown}
      onPointerDown={stopPointerPropagation}
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        consumable.onUse?.();
      }}
    >
      {consumable.iconSrc ? (
        <img
          src={consumable.iconSrc}
          alt={consumable.label}
          style={{ width: 22, height: 22, imageRendering: 'pixelated' }}
        />
      ) : (
        <Package size={18} color="#34d399" />
      )}
      {cdRatio > 0 && (
        <div className="bs-cd-curtain" style={{ height: `${Math.round(cdRatio * 100)}%` }} />
      )}
      {typeof consumable.count === 'number' && (
        <span className="bs-slot-charges">x{consumable.count}</span>
      )}
      <span className="bs-slot-rarity-bar" style={{ background: '#34d399' }} />
    </button>
  );
}

interface HeroSkillChipProps {
  skillCdMs?: number;
  skillMaxMs?: number;
  skillActiveMs?: number;
  skillName?: string;
  onTrigger: () => void;
}

function HeroSkillChip({
  skillCdMs = 0,
  skillMaxMs = 10000,
  skillActiveMs = 0,
  skillName = 'Tuyệt Chiêu [F]',
  onTrigger,
}: HeroSkillChipProps) {
  const active = skillActiveMs > 0;
  const cooling = !active && skillCdMs > 0;
  const cdRatio = cooling ? clamp(skillCdMs / Math.max(1, skillMaxMs), 0, 1) : 0;

  return (
    <button
      type="button"
      tabIndex={-1}
      className="bs-hotbar-slot"
      title={`[F] ${skillName}`}
      aria-label={`[F] ${skillName}`}
      onMouseDown={preventFocusOnMouseDown}
      onPointerDown={stopPointerPropagation}
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        onTrigger();
      }}
      style={{
        borderColor: active ? '#f59e0b' : cooling ? '#334155' : '#eab308',
        boxShadow: active
          ? '0 0 12px rgba(245, 158, 11, 0.55)'
          : !cooling
            ? '0 0 8px rgba(234, 179, 8, 0.25)'
            : undefined,
      }}
    >
      <span className="bs-slot-key">F</span>
      <Sparkles size={19} color={active ? '#fde047' : cooling ? '#94a3b8' : '#facc15'} aria-hidden="true" />
      {cdRatio > 0 && (
        <div className="bs-cd-curtain" style={{ height: `${Math.round(cdRatio * 100)}%` }} />
      )}
      {active ? (
        <span className="bs-slot-charges" style={{ color: '#fde047' }}>
          {(skillActiveMs / 1000).toFixed(1)}s
        </span>
      ) : cooling ? (
        <span className="bs-cd-label">{formatCdSeconds(skillCdMs)}</span>
      ) : (
        <span className="bs-slot-charges" style={{ color: '#fef08a' }}>
          CHIÊU
        </span>
      )}
      <span className="bs-slot-rarity-bar" style={{ background: active ? '#f59e0b' : '#eab308' }} />
    </button>
  );
}

interface DashChipProps {
  dashCdMs: number;
  dashMaxMs: number;
  onDash: () => void;
}

function DashChip({ dashCdMs, dashMaxMs, onDash }: DashChipProps) {
  const cooling = dashCdMs > 0;
  const cdRatio = cooling ? clamp(dashCdMs / Math.max(1, dashMaxMs), 0, 1) : 0;

  return (
    <button
      type="button"
      tabIndex={-1}
      className={`bs-dash-chip${cooling ? ' bs-dash-chip--cooling' : ''}`}
      title={cooling ? `Lướt đang hồi (${formatCdSeconds(dashCdMs)})` : 'Lướt [Space / RMB]'}
      aria-label={cooling ? `Lướt đang hồi ${formatCdSeconds(dashCdMs)}` : 'Lướt'}
      onMouseDown={preventFocusOnMouseDown}
      onPointerDown={stopPointerPropagation}
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        onDash();
      }}
    >
      <Wind size={20} aria-hidden="true" />
      {cooling ? (
        <>
          <div className="bs-cd-curtain" style={{ height: `${Math.round(cdRatio * 100)}%` }} />
          <span className="bs-cd-label" style={{ fontSize: 10 }}>
            {formatCdSeconds(dashCdMs)}
          </span>
        </>
      ) : (
        <span className="bs-dash-chip-key">SPC</span>
      )}
    </button>
  );
}

interface ActiveReloadStripProps {
  me: BansungPrivate;
  reloadingFlag: boolean;
  onReload: () => void;
}

function ActiveReloadStrip({ me, reloadingFlag, onReload }: ActiveReloadStripProps) {
  const activeSlot = getHotbarSlotAt(me.slots, me.slotIdx);
  const activeSpec = activeSlot ? getWeaponSpec(activeSlot.id) : undefined;
  const activeTier = resolveSlotWeaponTier(activeSlot, me.weaponTiers?.[me.slotIdx]);
  const activeEvo = activeSlot ? getWeaponEvolutionStats(activeSlot.id, activeTier) : undefined;
  const activeName = activeSlot?.evolvedName ?? activeEvo?.vnName ?? activeSpec?.vnName ?? activeSlot?.id ?? '';
  const activeEnergyCost = activeEvo ? activeEvo.energyCost : (activeSpec?.energyCost ?? 0);
  const isReloading =
    Boolean(activeSlot && activeSlot.maxClip > 0) &&
    me.reloadTotalMs > 0 &&
    me.reloadMs > 0 &&
    (reloadingFlag || me.reloadMs > 0);
  const u = isReloading ? clamp(1 - me.reloadMs / Math.max(1, me.reloadTotalMs), 0, 1) : 0;
  const rawMin = me.sweetSpot?.[0];
  const rawMax = me.sweetSpot?.[1];
  const sweetMin =
    typeof rawMin === 'number' && Number.isFinite(rawMin)
      ? clamp(rawMin > 1 ? rawMin / 100 : rawMin, BANSUNG_RELOAD_LOCKOUT_U, 0.92)
      : BANSUNG_RELOAD_SWEET_MIN;
  const sweetMax =
    typeof rawMax === 'number' && Number.isFinite(rawMax)
      ? clamp(rawMax > 1 ? rawMax / 100 : rawMax, sweetMin + 0.04, 0.98)
      : BANSUNG_RELOAD_SWEET_MAX;
  const inSweet = isReloading && u >= sweetMin && u <= sweetMax;

  if (isReloading) {
    return (
      <div className="bs-reload-panel" onPointerDown={stopPointerPropagation}>
        <div className="bs-reload-track" role="progressbar" aria-valuenow={Math.round(u * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="bs-reload-lockout"
            style={{ width: `${BANSUNG_RELOAD_LOCKOUT_U * 100}%` }}
          />
          <div
            className="bs-reload-sweet"
            style={{
              left: `${sweetMin * 100}%`,
              width: `${Math.max(2, (sweetMax - sweetMin) * 100)}%`,
            }}
          />
          <div className="bs-reload-needle" style={{ left: `${u * 100}%` }} />
        </div>
        <button
          type="button"
          className={`bs-reload-btn${inSweet ? ' bs-reload-btn--sweet' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onReload();
          }}
        >
          <RefreshCw size={11} />
          <span>{inSweet ? '[R] HOÀN HẢO!' : '[R] NẠP NHANH'}</span>
        </button>
      </div>
    );
  }

  if (activeSlot && activeSlot.maxClip > 0 && activeSlot.clip <= 0) {
    return (
      <div className="bs-reload-panel" onPointerDown={stopPointerPropagation}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#f87171' }}>
          HẾT ĐẠN ({activeName})
        </span>
        <button
          type="button"
          className="bs-reload-btn bs-reload-btn--sweet"
          onClick={(e) => {
            e.stopPropagation();
            onReload();
          }}
        >
          <RefreshCw size={11} />
          <span>[R] NẠP ĐẠN</span>
        </button>
      </div>
    );
  }

  if (activeSpec && activeEnergyCost > 0 && me.energy < activeEnergyCost) {
    return (
      <div className="bs-reload-panel" onPointerDown={stopPointerPropagation}>
        <Zap size={13} color="#f87171" />
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fca5a5' }}>
          Thiếu năng lượng ({Math.floor(me.energy)} / {activeEnergyCost})
        </span>
      </div>
    );
  }

  return null;
}

export interface PedestalSwapPromptProps {
  pedestal: NearbyWeaponPedestal;
  me?: BansungPrivate;
  onSwap: (pedestal: NearbyWeaponPedestal) => void;
}

function StatDeltaBadge({ delta, suffix = '', invertGood = false }: { delta: number; suffix?: string; invertGood?: boolean }) {
  if (delta === 0) return null;
  const good = invertGood ? delta < 0 : delta > 0;
  const color = good ? '#34d399' : '#f87171';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, color, fontWeight: 800 }}>
      {delta > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {delta > 0 ? `+${delta}${suffix}` : `${delta}${suffix}`}
    </span>
  );
}

/** Floating [E] interaction prompt shown when standing near a ground weapon pedestal. */
export function PedestalSwapPrompt({ pedestal, me, onSwap }: PedestalSwapPromptProps) {
  const offered = pedestal.weapon;
  const rarity = WEAPON_RARITY_THEME[offered.rarity];
  const slots = me?.slots ?? [];
  const activeSlotIdx = clamp(me?.slotIdx ?? 0, 0, 4);
  const replacedSlot = getHotbarSlotAt(slots, activeSlotIdx);
  const hasFreeSlot = !replacedSlot;
  const replacedSpec = replacedSlot ? getWeaponSpec(replacedSlot.id) : undefined;
  const replacedTier = replacedSlot
    ? resolveSlotWeaponTier(replacedSlot, me?.weaponTiers?.[activeSlotIdx])
    : 1;
  const replacedEvo = replacedSlot ? getWeaponEvolutionStats(replacedSlot.id, replacedTier) : undefined;
  const replacedName = replacedSlot?.evolvedName ?? replacedEvo?.vnName ?? replacedSpec?.vnName;
  const replacedDamage =
    replacedSpec && replacedEvo ? Math.round(replacedSpec.damage * replacedEvo.dmgMult) : replacedSpec?.damage;
  const replacedEnergy = replacedEvo ? replacedEvo.energyCost : replacedSpec?.energyCost;

  return (
    <button
      type="button"
      className="bs-pedestal-prompt"
      style={{ borderColor: rarity.color, boxShadow: `inset 0 0 0 1px ${rarity.glow}, 0 10px 24px rgba(0, 0, 0, 0.55)` }}
      onPointerDown={stopPointerPropagation}
      onClick={(e) => {
        e.stopPropagation();
        onSwap(pedestal);
      }}
    >
      <span className="bs-pedestal-keycap">E</span>

      <div className="bs-pedestal-iconbox" style={{ borderColor: rarity.color }}>
        <WeaponSpriteIcon
          meta={getWeaponIconMeta(offered.id)}
          alt={offered.vnName}
          maxWidth={38}
          maxHeight={26}
        />
      </div>

      <div className="bs-pedestal-body">
        <div className="bs-pedestal-title-row">
          <span style={{ color: rarity.color }}>{offered.vnName}</span>
          <span
            style={{
              padding: '1px 5px',
              borderRadius: 3,
              fontSize: 9.5,
              fontWeight: 800,
              background: 'rgba(15, 23, 42, 0.9)',
              border: `1px solid ${rarity.color}`,
              color: rarity.color,
            }}
          >
            {rarity.label} · {WEAPON_CATEGORY_BADGE[offered.category]}
          </span>
        </div>

        <div className="bs-pedestal-stats">
          <span>
            DMG <b>{offered.damage}</b>
            {replacedDamage !== undefined && <StatDeltaBadge delta={offered.damage - replacedDamage} />}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <img
              src={UI_ENERGY_ICON}
              alt=""
              style={{ width: 11, height: 11, imageRendering: 'pixelated' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <b>{offered.energyCost}</b>
            {replacedEnergy !== undefined && (
              <StatDeltaBadge delta={offered.energyCost - replacedEnergy} invertGood />
            )}
          </span>
          <span>
            Băng <b>{offered.magSize}</b>
            {replacedSpec && replacedSpec.magSize > 0 && (
              <StatDeltaBadge delta={offered.magSize - replacedSpec.magSize} />
            )}
          </span>
          <span>
            Tầm <b>{offered.range}</b>
          </span>
        </div>

        <div className="bs-pedestal-compare">
          <ArrowRightLeft size={10} />
          {hasFreeSlot ? (
            <span>Nhặt vào ô trống [{activeSlotIdx + 1}]</span>
          ) : replacedName ? (
            <span>
              Đổi với [{activeSlotIdx + 1}] <b style={{ color: '#e2e8f0' }}>{replacedName}</b>
            </span>
          ) : (
            <span>Nhấn [E] để nhặt vũ khí</span>
          )}
        </div>
      </div>
    </button>
  );
}

export interface PerkDraftModalProps {
  wave: number;
  wavePhase: BansungWavePhase;
  remSeconds: number;
  perkChoices?: readonly BansungPerkId[];
  ownedPerks: readonly BansungPerkId[];
  onSelectPerk: (id: BansungPerkId) => void;
}

/** 3-choice Perk Draft modal shown between waves with live countdown and stack progress. */
export function PerkDraftModal({
  wave,
  wavePhase,
  remSeconds,
  perkChoices,
  ownedPerks,
  onSelectPerk,
}: PerkDraftModalProps) {
  const choices = perkChoices ?? [];
  const [pickedId, setPickedId] = useState<BansungPerkId | null>(null);
  const choicesSignature = `${wave}:${choices.join(',')}`;

  useEffect(() => {
    setPickedId(null);
  }, [choicesSignature]);

  if (choices.length === 0) {
    if (wavePhase !== 'perk_pick') return null;
    const waitSec = Math.max(0, Math.ceil(remSeconds));
    return (
      <div className="bs-perk-wait-pill" onPointerDown={stopPointerPropagation}>
        <Clock size={13} />
        <span>Đã chọn nâng cấp — chờ đồng đội ({waitSec}s)</span>
      </div>
    );
  }

  const totalSec = BANSUNG_PICKUP_CONSTS.PERK_DRAFT_S;
  const clampedRem = Math.max(0, remSeconds);
  const timerPct = clamp((clampedRem / Math.max(1, totalSec)) * 100, 0, 100);
  const timerUrgent = clampedRem > 0 && clampedRem <= 3.5;

  return (
    <div
      className="bs-perk-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Chọn nâng cấp giữa đợt"
      onPointerDown={stopPointerPropagation}
    >
      <div className="bs-perk-modal">
        <div className="bs-perk-header">
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', letterSpacing: '0.06em' }}>
              VƯỢT ĐỢT {wave} THÀNH CÔNG
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 900, color: '#fde68a' }}>
              CHỌN 1 NÂNG CẤP CHIẾN ĐẤU
            </h2>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              borderRadius: 5,
              background: '#0b101b',
              border: `1.5px solid ${timerUrgent ? '#ef4444' : '#fbbf24'}`,
              color: timerUrgent ? '#fca5a5' : '#fde68a',
              fontSize: 13,
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Clock size={14} />
            <span>{Math.ceil(clampedRem)}s</span>
          </div>
        </div>

        <div className="bs-perk-timer-track">
          <div
            className="bs-perk-timer-fill"
            style={{
              width: `${timerPct}%`,
              background: timerUrgent
                ? 'linear-gradient(90deg, #dc2626, #f87171)'
                : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
            }}
          />
        </div>

        <div className="bs-perk-grid">
          {choices.map((perkId) => {
            const def = getBansungPerk(perkId);
            const rarity = PERK_RARITY_THEME[def?.rarity ?? 'common'];
            const currentStacks = countPerkStacks(ownedPerks, perkId);
            const maxStacks = def?.maxStacks ?? 1;
            const isPicked = pickedId === perkId;
            const isLocked = pickedId !== null;
            const cardClasses = [
              'bs-perk-card',
              isPicked ? 'bs-perk-card--picked' : '',
              isLocked && !isPicked ? 'bs-perk-card--muted' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={perkId}
                type="button"
                tabIndex={-1}
                className={cardClasses}
                disabled={isLocked}
                style={{ borderColor: isPicked ? '#fbbf24' : rarity.border }}
                onMouseDown={preventFocusOnMouseDown}
                onClick={(e) => {
                  e.stopPropagation();
                  e.currentTarget.blur();
                  if (isLocked) return;
                  setPickedId(perkId);
                  onSelectPerk(perkId);
                }}
              >
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontSize: 9.5,
                      fontWeight: 900,
                      letterSpacing: '0.04em',
                      background: rarity.badgeBg,
                      border: `1px solid ${rarity.border}`,
                      color: rarity.accent,
                    }}
                  >
                    {rarity.label}
                  </span>

                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: currentStacks > 0 ? '#34d399' : '#94a3b8',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    Cộng dồn {currentStacks}/{maxStacks}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      flexShrink: 0,
                      borderRadius: 5,
                      background: '#0a0f1c',
                      border: `1.5px solid ${rarity.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PerkIconImage perkId={perkId} alt={def?.vnName ?? perkId} />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc', lineHeight: 1.2 }}>
                      {def?.vnName ?? perkId}
                    </div>
                    {def?.name && (
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#94a3b8' }}>
                        {def.name}
                      </div>
                    )}
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, color: '#cbd5e1' }}>
                  {def?.desc ?? 'Tăng cường sức mạnh chiến đấu cho nhân vật.'}
                </p>

                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: 4,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    fontSize: 11,
                    fontWeight: 800,
                    color: isPicked ? '#fde68a' : rarity.accent,
                  }}
                >
                  {isPicked ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Check size={13} /> Đã chọn
                    </span>
                  ) : (
                    <span>Chọn nâng cấp →</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PerkIconImage({ perkId, alt }: { perkId: BansungPerkId; alt: string }) {
  const [errored, setErrored] = useState(false);
  const src = useMemo(() => getPerkIconPath(perkId), [perkId]);

  useEffect(() => {
    setErrored(false);
  }, [src]);

  if (errored) {
    return <Shield size={20} color="#fbbf24" aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onError={() => setErrored(true)}
      style={{
        width: 26,
        height: 26,
        imageRendering: 'pixelated',
        objectFit: 'contain',
      }}
    />
  );
}

export interface GachaDraftModalProps {
  level: number;
  gachaChoices?: readonly BansungGachaCard[];
  gachaPending?: number;
  gachaRemMs?: number;
  skillStacks?: Readonly<Record<string, number>>;
  onSelectGacha: (pick: 0 | 1 | 2) => void;
}

const GACHA_PICK_KEYS = ['Z', 'X', 'C'] as const;

interface GachaDraftCardProps {
  card: BansungGachaCard;
  index: 0 | 1 | 2;
  skillStacks?: Readonly<Record<string, number>>;
  pickedIdx: number | null;
  spinning: boolean;
  onChoose: (pick: 0 | 1 | 2) => void;
}

function GachaDraftCard({
  card,
  index,
  skillStacks,
  pickedIdx,
  spinning,
  onChoose,
}: GachaDraftCardProps) {
  const rarity = GACHA_RARITY_THEME[card.rarity] ?? GACHA_RARITY_THEME.common;
  const isPicked = pickedIdx === index;
  const isLocked = pickedIdx !== null;
  const cardClasses = [
    'bs-gacha-card',
    isPicked ? 'bs-gacha-card--picked' : '',
    isLocked && !isPicked ? 'bs-gacha-card--muted' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const isWeaponUpgrade = card.category === 'weapon_upgrade';
  const isWeaponUnlock = isWeaponUpgrade && card.fromTier === 0;
  const weaponId = card.weaponId ?? 'pistol';
  const weaponSpec = isWeaponUpgrade || card.weaponId ? getWeaponSpec(weaponId) : undefined;
  const fromTier = normalizeWeaponTier(Math.max(1, card.fromTier ?? 1));
  const toTier = normalizeWeaponTier(card.toTier ?? (isWeaponUnlock ? 1 : fromTier + 1));
  const nextTierSpec = BANSUNG_WEAPON_TIERS[toTier];
  const skillMeta =
    card.category !== 'weapon_upgrade' ? GACHA_SKILL_CATEGORY_META[card.category] : undefined;
  const skillSpec = card.category !== 'weapon_upgrade' ? getGachaSkillSpec(card.id) : undefined;
  const curStacks =
    card.category !== 'weapon_upgrade'
      ? Math.max(0, Math.floor(Number(skillStacks?.[card.category]) || 0))
      : 0;

  const isPrismatic = card.rarity === 'prismatic';
  const isMythic = card.rarity === 'mythic';
  const isCelestial = card.rarity === 'celestial';
  const isLegendary = card.rarity === 'legendary';
  const isEpic = card.rarity === 'epic';
  const cardAllClasses = [
    cardClasses,
    isPrismatic && !isPicked ? 'bs-gacha-card--prismatic' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const tierBorder = isPicked ? '#fbbf24' : rarity.border;
  const multClass = isPrismatic
    ? 'bs-gacha-mult--rainbow'
    : isMythic
      ? 'bs-gacha-mult--crimson'
      : isCelestial
        ? 'bs-gacha-mult--teal'
        : isLegendary
          ? 'bs-gacha-mult--gold'
          : isEpic
            ? 'bs-gacha-mult--purple'
            : 'bs-gacha-mult--green';

  const multBadgeText = isWeaponUnlock
    ? card.multLabel
      ? `${card.multLabel} MỚI`
      : 'MỞ KHÓA'
    : card.multLabel ??
      (isPrismatic ? '^^' : isMythic ? '^^' : isCelestial || isLegendary ? '^^' : '^');

  const shortTitle = weaponSpec
    ? weaponSpec.vnName
    : GACHA_SHORT_SKILL_NAME[card.category as GachaSkillCategory] ?? card.vnTitle;

  const statPill = isWeaponUpgrade
    ? isWeaponUnlock
      ? card.dmgText ?? formatWeaponDmgText(getWeaponSpec(weaponId), BANSUNG_WEAPON_TIERS[1].dmgMult)
      : `${BANSUNG_WEAPON_TIERS[fromTier].badge} → ${nextTierSpec.badge}`
    : card.badge ?? (skillSpec ? `+${Math.round(skillSpec.value * 100)}%` : undefined);

  return (
    <button
      type="button"
      tabIndex={-1}
      className={cardAllClasses}
      disabled={isLocked}
      style={{
        background: 'linear-gradient(180deg, #1e2742 0%, #101628 100%)',
        color: '#f8fafc',
        borderColor: tierBorder,
        borderWidth: 2,
        boxShadow: isPicked
          ? undefined
          : `0 0 14px ${rarity.glow}, inset 0 1px 0 rgba(255, 255, 255, 0.1)`,
      }}
      onMouseDown={preventFocusOnMouseDown}
      onPointerDown={stopPointerPropagation}
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.blur();
        if (isLocked) return;
        onChoose(index);
      }}
    >
      {spinning && (
        <div className="bs-reel-curtain" aria-hidden="true">
          <div className="bs-reel-strip">
            <div className="bs-reel-orb bs-reel-orb--rainbow">777</div>
            <div className="bs-reel-orb bs-reel-orb--crimson">x4</div>
            <div className="bs-reel-orb bs-reel-orb--teal">x3</div>
            <div className="bs-reel-orb bs-reel-orb--gold">x3</div>
            <div className="bs-reel-orb bs-reel-orb--purple">x2</div>
            <div className="bs-reel-orb bs-reel-orb--green">+1</div>
          </div>
        </div>
      )}

      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 3,
          flexWrap: 'nowrap',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
          <span className="bs-gacha-hotkey">{GACHA_PICK_KEYS[index]}</span>
          <span className={`bs-gacha-mult ${multClass}`}>{multBadgeText}</span>
        </div>

        <span
          className="bs-gacha-lvup"
          style={{
            background: rarity.badgeBg,
            border: `1px solid ${rarity.border}`,
            color: rarity.accent,
          }}
        >
          <ChevronsUp size={10} />
          <span>{isWeaponUnlock ? 'MỚI' : 'Lv Up'}</span>
        </span>
      </div>

      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '6px 4px',
          borderRadius: 6,
          background: '#0a0f1c',
          border: `1.5px solid ${rarity.border}`,
          boxShadow: `inset 0 0 12px ${rarity.glow}`,
        }}
      >
        {isWeaponUpgrade || card.weaponId ? (
          <WeaponSpriteIcon
            meta={getWeaponIconMeta(weaponId)}
            alt={shortTitle}
            maxWidth={56}
            maxHeight={32}
          />
        ) : skillMeta ? (
          <skillMeta.Icon size={25} color={skillMeta.accent} />
        ) : (
          <Sparkles size={25} color={rarity.accent} />
        )}
        <ChevronsUp size={18} color={rarity.accent} />
      </div>

      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            width: '100%',
            fontSize: 11,
            fontWeight: 900,
            color: '#f8fafc',
            lineHeight: 1.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {shortTitle}
        </div>
        {statPill && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10.5,
              fontWeight: 900,
              color: rarity.accent,
            }}
          >
            <span>{statPill}</span>
            {!isWeaponUpgrade && skillSpec && (
              <span style={{ fontSize: 9, color: '#94a3b8' }}>
                ({curStacks}/{skillSpec.maxStacks})
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 2,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 9.5,
          fontWeight: 800,
          color: isPicked ? '#fde68a' : rarity.accent,
        }}
      >
        <span>{isPicked ? 'Đã chọn' : `[${GACHA_PICK_KEYS[index]}] Chọn`}</span>
        {isPicked && <Check size={11} />}
      </div>
    </button>
  );
}

/** Non-blocking Bottom-Right 777 Slot-Reel Gacha Dock (keeps WASD / Aim / Dash / Fire 100% live). */
export function GachaDraftModal({
  level,
  gachaChoices,
  gachaPending = 0,
  gachaRemMs = 0,
  skillStacks,
  onSelectGacha,
}: GachaDraftModalProps) {
  const choices = gachaChoices ?? [];
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [stoppedCount, setStoppedCount] = useState(3);
  const signature = `${level}:${gachaPending}:${choices.map((c) => c.id).join('|')}`;
  const maxRemRef = useRef<number>(Math.max(12_000, gachaRemMs));

  useEffect(() => {
    setPickedIdx(null);
    maxRemRef.current = Math.max(12_000, gachaRemMs || 15_000);
    if (choices.length === 0) return;
    setStoppedCount(0);
    const t1 = window.setTimeout(() => setStoppedCount(1), 220);
    const t2 = window.setTimeout(() => setStoppedCount(2), 410);
    const t3 = window.setTimeout(() => setStoppedCount(3), 590);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [signature, choices.length]);

  if (gachaRemMs > maxRemRef.current) {
    maxRemRef.current = gachaRemMs;
  }

  if (choices.length === 0) return null;

  const remSec = Math.max(0, Math.ceil(gachaRemMs / 1000));
  const queuedCount = Math.max(0, gachaPending - (choices.length > 0 ? 1 : 0));
  const timerPct =
    gachaRemMs > 0 ? clamp((gachaRemMs / Math.max(1, maxRemRef.current)) * 100, 0, 100) : 0;
  const timerUrgent = gachaRemMs > 0 && gachaRemMs <= 3500;

  return (
    <div
      className="bs-gacha-dock-wrap"
      role="region"
      aria-label="Quay Xổ Số Gacha Lên Cấp"
    >
      <div className="bs-gacha-dock" onPointerDown={stopPointerPropagation}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                background: 'linear-gradient(90deg, #9333ea, #f59e0b)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 900,
              }}
            >
              🎰 777 GACHA · LV {level}
            </span>
            {queuedCount > 0 && (
              <span className="bs-gacha-queue">
                <Gift size={10} />+{queuedCount}
              </span>
            )}
            <span style={{ fontSize: 9.5, color: '#94a3b8' }}>[Z / X / C]</span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#0b101b',
              border: `1px solid ${timerUrgent ? '#ef4444' : '#fbbf24'}`,
              color: timerUrgent ? '#fca5a5' : '#fde68a',
              fontSize: 11,
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Clock size={11} />
            <span>{gachaRemMs > 0 ? `${remSec}s` : '--'}</span>
          </div>
        </div>

        <div className="bs-perk-timer-track" style={{ height: 4, marginBottom: 7 }}>
          <div
            className="bs-perk-timer-fill"
            style={{
              width: `${timerPct}%`,
              background: timerUrgent
                ? 'linear-gradient(90deg, #dc2626, #f87171)'
                : 'linear-gradient(90deg, #a855f7, #fbbf24)',
            }}
          />
        </div>

        <div className="bs-gacha-grid">
          {choices.slice(0, 3).map((card, rawIdx) => {
            const pick = rawIdx as 0 | 1 | 2;
            return (
              <GachaDraftCard
                key={`${card.id}-${rawIdx}`}
                card={card}
                index={pick}
                skillStacks={skillStacks}
                pickedIdx={pickedIdx}
                spinning={rawIdx >= stoppedCount}
                onChoose={(p) => {
                  setStoppedCount(3);
                  setPickedIdx(p);
                  onSelectGacha(p);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ArmoryShopModalProps {
  me: BansungPrivate;
  disabled: boolean;
  onBuyWeapon: (weaponId: BansungWeaponId) => void;
  onUpgradeActive: () => void;
  onSupplyHeal: () => void;
  onClose: () => void;
}

type ShopCategoryFilter = 'all' | BansungWeaponSpec['category'];

const SHOP_FILTER_TABS: readonly { id: ShopCategoryFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'kinetic', label: 'Súng đạn' },
  { id: 'explosive', label: 'Phóng nổ' },
  { id: 'energy', label: 'Phép / NL' },
  { id: 'melee', label: 'Cận chiến' },
];

const SHOP_PURCHASABLE_WEAPONS: readonly BansungWeaponId[] = BANSUNG_WEAPON_IDS.filter(
  (id) => id !== 'pistol',
);

function ArmoryShopModal({
  me,
  disabled,
  onBuyWeapon,
  onUpgradeActive,
  onSupplyHeal,
  onClose,
}: ArmoryShopModalProps) {
  const [catFilter, setCatFilter] = useState<ShopCategoryFilter>('all');

  const ownedWeaponIds = useMemo(() => {
    const set = new Set<BansungWeaponId>();
    for (const s of me.slots) {
      if (s?.id) set.add(s.id);
    }
    return set;
  }, [me.slots]);

  const activeSlot = getHotbarSlotAt(me.slots, me.slotIdx);
  const activeSpec = activeSlot ? getWeaponSpec(activeSlot.id) : undefined;
  const activeTier = activeSlot
    ? normalizeWeaponTier(me.weaponTiers?.[me.slotIdx] ?? activeSlot.tier ?? 1)
    : 1;
  const isMaxTier = activeTier >= BANSUNG_WEAPON_MAX_TIER;
  const upgradeCost = getWeaponUpgradeCoinCost(activeTier);
  const canUpgrade =
    !disabled && Boolean(activeSlot) && !isMaxTier && upgradeCost > 0 && me.coins >= upgradeCost;
  const canHeal = !disabled && me.coins >= BANSUNG_SUPPLY_HEAL_COST;

  const filteredWeapons = useMemo(() => {
    if (catFilter === 'all') return SHOP_PURCHASABLE_WEAPONS;
    return SHOP_PURCHASABLE_WEAPONS.filter((id) => getWeaponSpec(id).category === catFilter);
  }, [catFilter]);

  return (
    <div
      className="bs-shop-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Kho vũ khí và cửa hàng tiếp tế"
      onPointerDown={stopPointerPropagation}
      onMouseDown={preventFocusOnMouseDown}
      onClick={stopPointerPropagation}
    >
      <div className="bs-shop-modal" onClick={stopPointerPropagation}>
        <div className="bs-shop-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingBag size={18} color="#fbbf24" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '0.03em' }}>
                KHO VŨ KHÍ &amp; TIẾP TẾ [B]
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Mua trang bị vào ô trống (hoặc thay ô đang chọn) · Nhấn [B] / Esc để đóng
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="bs-shop-coins" aria-label={`Xu hiện có ${me.coins}`}>
              <Coins size={14} />
              {me.coins} xu
            </span>
            <button
              type="button"
              className="bs-shop-close"
              onMouseDown={preventFocusOnMouseDown}
              onClick={onClose}
              aria-label="Đóng cửa hàng"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="bs-shop-services">
          <button
            type="button"
            className="bs-shop-svc-btn"
            disabled={!canUpgrade}
            onMouseDown={preventFocusOnMouseDown}
            onClick={onUpgradeActive}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {activeSlot && (
                <WeaponSpriteIcon
                  meta={getWeaponIconMeta(activeSlot.id)}
                  alt={activeSpec?.vnName || activeSlot.id}
                  maxWidth={44}
                  maxHeight={24}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>
                  Nâng cấp vũ khí đang cầm
                </div>
                <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                  {activeSlot && activeSpec
                    ? isMaxTier
                      ? `${activeSpec.vnName || activeSpec.name} · Đã tối đa Mk.${BANSUNG_WEAPON_MAX_TIER}`
                      : `${activeSpec.vnName || activeSpec.name} · Mk.${activeTier} → Mk.${activeTier + 1} (+DMG & Nạp đầy đạn)`
                    : 'Không có vũ khí đang cầm'}
                </div>
              </div>
            </div>
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 900,
                color: isMaxTier ? '#34d399' : '#fde047',
              }}
            >
              {isMaxTier ? 'MAX' : `${upgradeCost} xu`}
            </span>
          </button>

          <button
            type="button"
            className="bs-shop-svc-btn"
            disabled={!canHeal}
            onMouseDown={preventFocusOnMouseDown}
            onClick={onSupplyHeal}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Heart size={18} color="#f87171" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0' }}>
                  Tiếp tế chiến đấu khẩn cấp
                </div>
                <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                  Hồi 100% HP, Khiên, Năng lượng &amp; +1 Gadget
                </div>
              </div>
            </div>
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 900, color: '#fde047' }}>
              {BANSUNG_SUPPLY_HEAL_COST} xu
            </span>
          </button>
        </div>

        <div className="bs-shop-tabs" role="tablist" aria-label="Lọc loại vũ khí">
          {SHOP_FILTER_TABS.map((tab) => {
            const count =
              tab.id === 'all'
                ? SHOP_PURCHASABLE_WEAPONS.length
                : SHOP_PURCHASABLE_WEAPONS.filter((id) => getWeaponSpec(id).category === tab.id).length;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={catFilter === tab.id}
                className={`bs-shop-tab${catFilter === tab.id ? ' bs-shop-tab--active' : ''}`}
                onMouseDown={preventFocusOnMouseDown}
                onClick={() => setCatFilter(tab.id)}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="bs-shop-grid">
          {filteredWeapons.map((weaponId) => {
            const spec = getWeaponSpec(weaponId);
            const rarityTheme = WEAPON_RARITY_THEME[spec.rarity];
            const owned = ownedWeaponIds.has(weaponId);
            const price = getWeaponShopPrice(weaponId);
            const canBuy = !disabled && !owned && me.coins >= price;
            const dmgText = formatWeaponDmgText(spec, BANSUNG_WEAPON_TIERS[1].dmgMult);
            const desc = `${spec.name} · Tầm ${Math.round(spec.range)}px · Chí mạng ${Math.round(spec.critChance * 100)}%`;

            return (
              <div
                key={weaponId}
                className={`bs-shop-card${owned ? ' bs-shop-card--owned' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 900,
                      color: rarityTheme.color,
                      textTransform: 'uppercase',
                    }}
                  >
                    {rarityTheme.label} · {WEAPON_CATEGORY_BADGE[spec.category]}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: '#fde047' }}>{dmgText}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 34 }}>
                  <div
                    style={{
                      width: 58,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(9, 13, 24, 0.72)',
                      borderRadius: 4,
                      border: `1px solid ${rarityTheme.glow}`,
                      flexShrink: 0,
                    }}
                  >
                    <WeaponSpriteIcon
                      meta={getWeaponIconMeta(weaponId)}
                      alt={spec.vnName || spec.name}
                      maxWidth={50}
                      maxHeight={26}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: '#f8fafc',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {spec.vnName || spec.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                      {spec.magSize > 0 ? `Băng ${spec.magSize}` : 'Cận chiến'} ·{' '}
                      {spec.energyCost > 0 ? `${spec.energyCost} EN` : '0 EN'}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: '#cbd5e1',
                    lineHeight: 1.3,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    minHeight: 26,
                  }}
                  title={desc}
                >
                  {desc}
                </div>

                <button
                  type="button"
                  className="bs-shop-buy"
                  disabled={!canBuy}
                  onMouseDown={preventFocusOnMouseDown}
                  onClick={() => onBuyWeapon(weaponId)}
                >
                  {owned ? (
                    <>
                      <Check size={12} /> ĐÃ CÓ TRONG TÚI
                    </>
                  ) : (
                    <>
                      <Coins size={12} /> MUA {price} XU
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Soul-Knight bottom 5-slot weapon/gadget hotbar, nearby Weapon Pedestal [E] swap prompt,
 * Survival Level-Up 3-card Gacha modal, Armory Coin Shop ([B]), and between-wave Perk Draft modal.
 */
export function HotbarShop({
  snapshot: snapshotProp,
  pickups: pickupsOverride,
  input,
  onCommand,
  onSelectSlot,
  onTapSlot,
  onReload,
  onTriggerGadget,
  onTriggerDash,
  onUsePedestal,
  onSelectPerk,
  onSelectGacha,
  empoweredSlotMask = 0,
  consumable = null,
  showReloadBar = true,
  showPedestalPrompt = true,
  showPerkModal = true,
  showGachaModal = true,
  shopOpen = false,
  onToggleShop,
  className,
}: HotbarShopProps) {
  useEffect(() => {
    injectDefaultHotbarStyles();
  }, []);

  const liveSnapshot = useBansungHud(60);
  const snapshot = snapshotProp ?? liveSnapshot;
  const me = snapshot.me;
  const localPlayer = snapshot.localPlayer;
  const nearbyPedestal = useNearbyWeaponPedestal(snapshot, pickupsOverride);

  const emitCommand = useCallback(
    (cmd: BansungCommand) => {
      onCommand?.(cmd);
    },
    [onCommand],
  );

  const handleReload = useCallback(() => {
    if (onReload) {
      onReload();
      return;
    }
    if (input) {
      input.triggerReload();
      return;
    }
    emitCommand({ t: 'reload' });
  }, [onReload, input, emitCommand]);

  const handleTapSlot = useCallback(
    (idx: number) => {
      if (onTapSlot) {
        onTapSlot(idx);
        return;
      }
      if (input) {
        input.tapHotbarSlot(idx);
        return;
      }
      if (me && idx === me.slotIdx) {
        if (onSelectSlot) {
          onSelectSlot(idx);
        }
        const activeSlot = getHotbarSlotAt(me.slots, idx);
        const isReloading = me.reloadTotalMs > 0 && me.reloadMs > 0;
        if (isReloading || (activeSlot && activeSlot.maxClip > 0 && activeSlot.clip < activeSlot.maxClip)) {
          handleReload();
        }
        return;
      }
      if (onSelectSlot) {
        onSelectSlot(idx);
        return;
      }
      emitCommand({ t: 'slot', idx });
    },
    [onTapSlot, onSelectSlot, input, me, handleReload, emitCommand],
  );

  const handleTriggerGadget = useCallback(() => {
    if (onTriggerGadget) {
      onTriggerGadget();
      return;
    }
    if (input) {
      input.triggerSkill();
      return;
    }
    emitCommand({ t: 'gadget' });
  }, [onTriggerGadget, input, emitCommand]);

  const handleTriggerHeroSkill = useCallback(() => {
    if (input && typeof (input as BansungInputController & { triggerHeroSkill?: () => void }).triggerHeroSkill === 'function') {
      (input as BansungInputController & { triggerHeroSkill: () => void }).triggerHeroSkill();
      return;
    }
    emitCommand({ t: 'skill' });
  }, [input, emitCommand]);

  const handleTriggerDash = useCallback(() => {
    if (onTriggerDash) {
      onTriggerDash();
      return;
    }
    if (input) {
      input.triggerDash();
      return;
    }
    emitCommand({ t: 'dash' });
  }, [onTriggerDash, input, emitCommand]);

  const handleUsePedestal = useCallback(
    (pedestal: NearbyWeaponPedestal) => {
      if (onUsePedestal) {
        onUsePedestal(pedestal);
        return;
      }
      if (input) {
        input.triggerInteract();
        return;
      }
      emitCommand({ t: 'use' });
    },
    [onUsePedestal, input, emitCommand],
  );

  const handleSelectPerk = useCallback(
    (id: BansungPerkId) => {
      if (onSelectPerk) {
        onSelectPerk(id);
        return;
      }
      if (input) {
        input.selectPerk(id);
        return;
      }
      emitCommand({ t: 'perk', id });
    },
    [onSelectPerk, input, emitCommand],
  );

  const handleSelectGacha = useCallback(
    (pick: 0 | 1 | 2) => {
      if (onSelectGacha) {
        onSelectGacha(pick);
        return;
      }
      if (onCommand) {
        emitCommand({ t: 'gacha', pick });
        return;
      }
      const maybeCtrl = input as (BansungInputController & {
        triggerGachaPick?: (p: 0 | 1 | 2) => void;
      }) | undefined;
      maybeCtrl?.triggerGachaPick?.(pick);
    },
    [onSelectGacha, onCommand, input, emitCommand],
  );

  if (!me) {
    return null;
  }

  const spectating = isSpectatingSnapshot(snapshot);
  const hudActiveSlot = getHotbarSlotAt(me.slots, me.slotIdx);
  const reloadingFlag = spectating
    ? Boolean(
        localPlayer &&
          (localPlayer.flags & BANSUNG_PFLAG_RELOADING) !== 0 &&
          localPlayer.state !== BANSUNG_STATE_DEAD &&
          localPlayer.state !== BANSUNG_STATE_DOWNED,
      )
    : Boolean(
        hudActiveSlot &&
          hudActiveSlot.maxClip > 0 &&
          me.reloadTotalMs > 0 &&
          me.reloadMs > 0 &&
          localPlayer?.state !== BANSUNG_STATE_DEAD &&
          localPlayer?.state !== BANSUNG_STATE_DOWNED,
      );
  const activeReloadRatio =
    me.reloadTotalMs > 0 && me.reloadMs > 0
      ? clamp(1 - me.reloadMs / me.reloadTotalMs, 0, 1)
      : null;

  const isAlive =
    !spectating &&
    localPlayer?.state !== BANSUNG_STATE_DEAD &&
    localPlayer?.state !== BANSUNG_STATE_DOWNED;

  const hasGachaOverlay = showGachaModal && !spectating && Boolean(me.gachaChoices?.length);
  const hasPerkOverlay =
    !hasGachaOverlay &&
    showPerkModal &&
    !spectating &&
    (Boolean(me.perkChoices?.length) || snapshot.wavePhase === 'perk_pick');

  return (
    <>
      <div className={className ? `bs-hotbar-wrap ${className}` : 'bs-hotbar-wrap'}>
        {showPedestalPrompt && nearbyPedestal && isAlive && (
          <PedestalSwapPrompt
            pedestal={nearbyPedestal}
            me={me}
            onSwap={handleUsePedestal}
          />
        )}

        {showReloadBar && isAlive && (
          <ActiveReloadStrip
            me={me}
            reloadingFlag={reloadingFlag}
            onReload={handleReload}
          />
        )}

        {hasPerkOverlay && !me.perkChoices?.length && snapshot.wavePhase === 'perk_pick' && (
          <PerkDraftModal
            wave={snapshot.wave}
            wavePhase={snapshot.wavePhase}
            remSeconds={snapshot.rem}
            perkChoices={me.perkChoices}
            ownedPerks={me.perks}
            onSelectPerk={handleSelectPerk}
          />
        )}

        <nav className="bs-hotbar-row" aria-label="Thanh vũ khí và kỹ năng">
          {[0, 1, 2, 3, 4].map((idx) => (
            <WeaponHotbarSlot
              key={idx}
              index={idx}
              slot={getHotbarSlotAt(me.slots, idx)}
              tier={me.weaponTiers?.[idx]}
              active={idx === me.slotIdx}
              empowered={(empoweredSlotMask & (1 << idx)) !== 0}
              playerEnergy={me.energy}
              reloadRatio={idx === me.slotIdx ? activeReloadRatio : null}
              onPress={handleTapSlot}
            />
          ))}

          <GadgetHotbarSlot
            gadget={me.gadget}
            playerEnergy={me.energy}
            onTrigger={handleTriggerGadget}
          />

          <HeroSkillChip
            skillCdMs={me.skillCdMs}
            skillMaxMs={me.skillMaxMs}
            skillActiveMs={me.skillActiveMs}
            skillName={me.skillName}
            onTrigger={handleTriggerHeroSkill}
          />

          {consumable && <SupplyHotbarSlot consumable={consumable} />}

          <div className="bs-hotbar-sep" aria-hidden="true" />

          <DashChip
            dashCdMs={me.dashCdMs}
            dashMaxMs={me.dashMaxMs}
            onDash={handleTriggerDash}
          />
        </nav>
      </div>

      {hasGachaOverlay && (
        <GachaDraftModal
          level={me.level ?? 1}
          gachaChoices={me.gachaChoices}
          gachaPending={me.gachaPending}
          gachaRemMs={me.gachaRemMs}
          skillStacks={me.skillStacks}
          onSelectGacha={handleSelectGacha}
        />
      )}

      {hasPerkOverlay && Boolean(me.perkChoices?.length) && (
        <PerkDraftModal
          wave={snapshot.wave}
          wavePhase={snapshot.wavePhase}
          remSeconds={snapshot.rem}
          perkChoices={me.perkChoices}
          ownedPerks={me.perks}
          onSelectPerk={handleSelectPerk}
        />
      )}

      {shopOpen && !spectating && !hasGachaOverlay && !hasPerkOverlay && (
        <ArmoryShopModal
          me={me}
          disabled={!isAlive}
          onBuyWeapon={(weaponId) => emitCommand({ t: 'shop', op: 'buy_weapon', weaponId })}
          onUpgradeActive={() => emitCommand({ t: 'shop', op: 'upgrade_active', slotIdx: me.slotIdx })}
          onSupplyHeal={() => emitCommand({ t: 'shop', op: 'supply_heal' })}
          onClose={() => onToggleShop?.()}
        />
      )}
    </>
  );
}

export default HotbarShop;
