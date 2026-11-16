/**
 * Pixel HUD bars, Active Reload sweet-spot gauge, Co-op Squad strip,
 * Boss + Stagger bar, 154x98 toggleable ARENA/RADAR Minimap canvas,
 * wave/ping banners, off-screen directional edge arrows, and low-HP vignette
 * for `bansung` (Bắn Súng Co-op).
 *
 * Aligns design specs d07, d31, d37-d40, and d45 with `shared/src/bansung`
 * and `client/src/bansung/store.ts`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Coins,
  Crosshair,
  Eye,
  Heart,
  LogOut,
  Map as MapIcon,
  MessageSquare,
  Radar,
  ShoppingBag,
  Skull,
  Sparkles,
} from 'lucide-react';
import {
  BANSUNG_BIOME_PALETTES,
  BANSUNG_EFLAG_EVOLVED,
  BANSUNG_ENEMIES,
  BANSUNG_ENEMY_GATES,
  BANSUNG_FX_STATUS_DOWNED,
  BANSUNG_FX_STATUS_GACHA,
  BANSUNG_FX_STATUS_LEVELUP,
  BANSUNG_FX_STATUS_RELOAD_PERFECT,
  BANSUNG_HERO_IDS,
  BANSUNG_HERO_STAT_SCALE,
  BANSUNG_MAP_H,
  BANSUNG_MAP_W,
  BANSUNG_PFLAG_BOT,
  BANSUNG_PFLAG_INVULN,
  BANSUNG_PFLAG_RELOADING,
  BANSUNG_PICKUP_KINDS,
  BANSUNG_PING_ENEMY,
  BANSUNG_PING_HELP,
  BANSUNG_PING_LOOT,
  BANSUNG_PING_REVIVE,
  BANSUNG_PROP_IDS,
  BANSUNG_RELOAD_LOCKOUT_U,
  BANSUNG_RELOAD_SWEET_MAX,
  BANSUNG_RELOAD_SWEET_MIN,
  BANSUNG_STAMINA,
  BANSUNG_STATE_DEAD,
  BANSUNG_STATE_DOWNED,
  BANSUNG_STATE_STUN,
  BANSUNG_SURVIVAL_CYCLE_S,
  BANSUNG_SURVIVAL_STAGE_S,
  BANSUNG_SURVIVAL_STAGES,
  BANSUNG_TOTAL_WAVES,
  BANSUNG_WEAPON_TIERS,
  FX_STATUS,
  getBansungHero,
  getBansungPerk,
  getBansungWaveSpec,
  getBossHpBars,
  getXpToNextLevel,
  normalizeWeaponTier,
  resolveBansungGameMode,
  resolveBossBarState,
  type BansungHeroId,
  type BansungPerkId,
  type BansungPingKind,
  type BansungPlayerInfo,
  type BansungPrivate,
  type BansungRoomView,
  type BansungSurvivalClock,
  type BansungWavePhase,
} from '../../../../shared/src';
import {
  bansungStore,
  clamp,
  useBansungHud,
  type BansungCamera,
  type BansungHudSnapshot,
  type BansungPingItem,
  type BansungStore,
  type SnapBoss,
  type SnapFxEvent,
  type SnapPlayer,
} from '../../bansung/store';
import { fmtCoins } from '../Dock';

// ============================================================================
// 1. Constants, Lookup Tables & Pure Geometry Helpers
// ============================================================================

/** Canonical desktop minimap dimensions (exact match to 6336:4032 = 11:7 ratio). */
export const BANSUNG_MINIMAP_W = 154;
export const BANSUNG_MINIMAP_H = 98;
/** World radius (px) covered in zoomed RADAR mode. */
export const BANSUNG_RADAR_RADIUS = 900;

export type BansungMinimapMode = 'arena' | 'radar';

export interface PingStyleMeta {
  readonly kind: BansungPingKind;
  readonly code: 'HELP' | 'ENEMY' | 'LOOT' | 'REVIVE';
  readonly label: string;
  readonly color: string;
  readonly symbol: string;
}

/** Uniform lookup table keyed by `BansungPingKind` (`0..3`). */
export const BANSUNG_PING_META: Readonly<Record<BansungPingKind, PingStyleMeta>> = {
  [BANSUNG_PING_HELP]: {
    kind: BANSUNG_PING_HELP,
    code: 'HELP',
    label: 'CẦN HỖ TRỢ',
    color: '#ffe066',
    symbol: '!',
  },
  [BANSUNG_PING_ENEMY]: {
    kind: BANSUNG_PING_ENEMY,
    code: 'ENEMY',
    label: 'MỤC TIÊU',
    color: '#ff6b6b',
    symbol: '⊕',
  },
  [BANSUNG_PING_LOOT]: {
    kind: BANSUNG_PING_LOOT,
    code: 'LOOT',
    label: 'NHẶT ĐỒ',
    color: '#69db7c',
    symbol: '◆',
  },
  [BANSUNG_PING_REVIVE]: {
    kind: BANSUNG_PING_REVIVE,
    code: 'REVIVE',
    label: 'CỨU ĐỒNG ĐỘI',
    color: '#ff8787',
    symbol: '+',
  },
};

const SIEGE_BADGES: Readonly<Record<string, string>> = {
  portal_rush: 'PORTAL RUSH',
  supply_beacon: 'SUPPLY BEACON',
  artillery_siege: 'ARTILLERY SIEGE',
};

const WAVE_PHASE_LABELS: Readonly<Record<BansungWavePhase, string>> = {
  combat: 'COMBAT',
  intermission: 'INTERMISSION',
  perk_pick: 'CHỌN PERK',
  boss: 'BOSS WAVE',
};

const RARITY_BORDER: Readonly<Record<'common' | 'rare' | 'epic', string>> = {
  common: '#9ca3af',
  rare: '#4dabf7',
  epic: '#cc5de8',
};

interface SurvivalStageUiMeta {
  readonly shortLabel: string;
  readonly rangeLabel: string;
  readonly color: string;
}

/** Visual accent & timeline labels for the 4 stages of each 20-minute Survival cycle. */
const SURVIVAL_STAGE_META: Readonly<Record<0 | 1 | 2 | 3, SurvivalStageUiMeta>> = {
  0: { shortLabel: 'Quái Nhẹ', rangeLabel: '0-2p', color: '#10b981' },
  1: { shortLabel: 'Boss I·ĐC', rangeLabel: '2-5p', color: '#f59e0b' },
  2: { shortLabel: 'Boss II·Trâu', rangeLabel: '5-8p', color: '#ef4444' },
  3: { shortLabel: 'Boss III-IV', rangeLabel: '8-12p+', color: '#e879f9' },
};

const XP_MINIMAP_DOTS: Readonly<Record<string, { color: string; stroke?: string; r: number }>> = {
  xp_orb_s: { color: '#10b981', r: 1.15 },
  xp_orb_m: { color: '#22d3ee', r: 1.5 },
  xp_orb_l: { color: '#38bdf8', stroke: '#e879f9', r: 1.9 },
};

function resolveIsSurvivalMode(snapshot: BansungHudSnapshot, view?: BansungRoomView): boolean {
  if (snapshot.survival) return snapshot.survival.mode === 'survival';
  if (view?.config) return resolveBansungGameMode(view.config) === 'survival';
  const me = snapshot.me;
  return Boolean(
    me &&
      ((me.xp ?? 0) > 0 ||
        (me.level ?? 1) > 1 ||
        (me.gachaChoices?.length ?? 0) > 0 ||
        (me.weaponTiers?.some((t) => t > 1) ?? false)),
  );
}

export interface EdgeIndicatorResult {
  /** `true` when world point is already inside the inset screen viewport. */
  visible: boolean;
  /** Screen CSS X coordinate (clamped to border margin when off-screen). */
  x: number;
  /** Screen CSS Y coordinate (clamped to border margin when off-screen). */
  y: number;
  /** Outward angle in radians for rotating the directional chevron. */
  angle: number;
}

/**
 * Clamps a world coordinate `(wx, wy)` onto the HUD viewport edge so off-screen
 * co-op pings, downed teammates, and bosses display directional perimeter arrows.
 */
export function clampEdgeIndicator(
  wx: number,
  wy: number,
  cam: Pick<BansungCamera, 'x' | 'y' | 'zoom'>,
  vw: number,
  vh: number,
  margin = 28,
): EdgeIndicatorResult {
  const safeW = vw > 0 ? vw : 1280;
  const safeH = vh > 0 ? vh : 720;
  const sx = (wx - cam.x) * cam.zoom + safeW * 0.5;
  const sy = (wy - cam.y) * cam.zoom + safeH * 0.5;
  const m = clamp(margin, 8, Math.min(safeW, safeH) * 0.45);

  if (sx >= m && sx <= safeW - m && sy >= m && sy <= safeH - m) {
    return { visible: true, x: sx, y: sy, angle: 0 };
  }

  const cx = safeW * 0.5;
  const cy = safeH * 0.5;
  const dx = sx - cx;
  const dy = sy - cy;
  const hx = cx - m;
  const hy = cy - m;

  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) {
    return { visible: false, x: cx, y: m, angle: -Math.PI * 0.5 };
  }

  const scaleX = Math.abs(dx) > 1e-4 ? hx / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = Math.abs(dy) > 1e-4 ? hy / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const s = Math.min(scaleX, scaleY);

  return {
    visible: false,
    x: cx + dx * s,
    y: cy + dy * s,
    angle: Math.atan2(dy, dx),
  };
}

/** Formats elapsed match milliseconds into `MM:SS`. */
export function formatMatchClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Converts a CSS-pixel click on the minimap canvas into clamped world `(x, y)` coordinates. */
export function minimapPointToWorld(
  localX: number,
  localY: number,
  cssW: number,
  cssH: number,
  mode: BansungMinimapMode,
  mapW: number,
  mapH: number,
  originX: number,
  originY: number,
): { x: number; y: number } {
  const safeW = Math.max(1, cssW);
  const safeH = Math.max(1, cssH);
  const safeMapW = Math.max(1, mapW);
  const safeMapH = Math.max(1, mapH);

  if (mode === 'radar') {
    const scale = (Math.min(safeW, safeH) * 0.5) / BANSUNG_RADAR_RADIUS;
    const wx = originX + (localX - safeW * 0.5) / scale;
    const wy = originY + (localY - safeH * 0.5) / scale;
    return {
      x: Math.round(clamp(wx, 0, safeMapW)),
      y: Math.round(clamp(wy, 0, safeMapH)),
    };
  }

  const scale = Math.min(safeW / safeMapW, safeH / safeMapH);
  const offX = (safeW - safeMapW * scale) * 0.5;
  const offY = (safeH - safeMapH * scale) * 0.5;
  return {
    x: Math.round(clamp((localX - offX) / scale, 0, safeMapW)),
    y: Math.round(clamp((localY - offY) / scale, 0, safeMapH)),
  };
}

function getHeroIdByIdx(heroIdx: number): BansungHeroId {
  return BANSUNG_HERO_IDS[heroIdx] ?? 'mascot';
}

function isInteractiveInputFocused(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

// ============================================================================
// 2. Fallback Layered CSS Injection (`@layer bs-hud-default`)
// ============================================================================

const HUD_STYLE_ID = 'bs-hud-bars-style';

/**
 * Low-priority layered fallback styles using exact `d45` `.bs-*` selectors and
 * custom properties so `HudBars` renders crisply standalone, while any rules in
 * `bansung.css` (`w43`) naturally take precedence without selector battles.
 */
const HUD_FALLBACK_CSS = `@layer bs-hud-default {
  .bs-hud-root {
    --bs-hp: #ff4757;
    --bs-sh: #4dabf7;
    --bs-stm: #f59f00;
    --bs-en: #38d9a9;
    --bs-coin: #ffd43b;
    --bs-boss: #e03131;
    --bs-stagger: #ffa94d;
    --bs-bg-panel: rgba(13, 15, 22, 0.78);
    --bs-border-px: #343a46;
    --bs-text: #f1f3f5;
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 20;
    font-family: ui-monospace, 'JetBrains Mono', 'Cascadia Mono', Consolas, monospace;
    font-variant-numeric: tabular-nums;
    color: var(--bs-text);
    user-select: none;
  }

  .bs-hud-tl {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(460px, 92vw);
  }

  .bs-hero-card {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 7px;
    background: var(--bs-bg-panel);
    border: 2px solid var(--bs-border-px);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    pointer-events: auto;
  }

  .bs-hero-portrait {
    position: relative;
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border: 2px solid #495057;
    border-radius: 4px;
    background: #171a24;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bs-hero-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: left center;
    image-rendering: pixelated;
    display: block;
  }

  .bs-hero-portrait--downed {
    border-color: #ff4757;
    animation: bs-pulse-danger 0.75s ease-in-out infinite;
  }

  .bs-hero-portrait--invuln {
    border-color: #4dabf7;
    box-shadow: 0 0 10px rgba(77, 171, 247, 0.65);
  }

  .bs-hero-portrait--dead {
    border-color: #495057;
    filter: grayscale(0.85) brightness(0.7);
  }

  .bs-hero-bars {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 148px;
    width: fit-content;
  }

  .bs-shield-delay-track {
    width: 148px;
    max-width: 100%;
    height: 3px;
    margin-top: -2px;
    border-radius: 2px;
    background: #141722;
    overflow: hidden;
  }

  .bs-shield-delay-fill {
    height: 100%;
    background: linear-gradient(90deg, #38bdf8, #bae6fd);
    transition: width 100ms linear;
  }

  .bs-hero-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #ced4da;
    line-height: 1;
  }

  .bs-bar {
    position: relative;
    width: 100%;
    max-width: min(340px, 66vw);
    height: 12px;
    background: #12151f;
    border: 1px solid #2b303b;
    border-radius: 2px;
    overflow: hidden;
    transition: width 260ms ease-out;
  }

  .bs-bar-lag {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.85);
    transition: width 260ms ease-out;
  }

  .bs-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    transition: width 90ms linear;
  }

  .bs-bar--shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
    animation: bs-shimmer 0.8s linear infinite;
  }

  .bs-bar--flash {
    animation: bs-flash-warn 0.3s ease-out;
    border-color: #ff6b6b;
  }

  .bs-bar-text {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    height: 100%;
    font-size: 9px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
    line-height: 1;
  }

  .bs-bar-mark {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(255, 255, 255, 0.5);
    z-index: 2;
    pointer-events: none;
  }

  .bs-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .bs-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 5px;
    background: rgba(24, 28, 40, 0.9);
    border: 1px solid #343a46;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.1;
    color: #e9ecef;
  }

  .bs-reload-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: var(--bs-bg-panel);
    border: 1px solid #3c4252;
    border-radius: 4px;
    width: fit-content;
  }

  .bs-reload-bar {
    position: relative;
    width: 120px;
    height: 10px;
    background: #141722;
    border: 1px solid #3c4252;
    border-radius: 2px;
    overflow: hidden;
  }

  .bs-reload-lock {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background: rgba(134, 142, 150, 0.25);
    border-right: 1px dashed rgba(173, 181, 189, 0.45);
  }

  .bs-reload-sweet {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(105, 219, 124, 0.55);
    border-left: 1px solid #69db7c;
    border-right: 1px solid #69db7c;
  }

  .bs-reload-needle {
    position: absolute;
    top: -1px;
    bottom: -1px;
    width: 3px;
    margin-left: -1.5px;
    background: #ffffff;
    box-shadow: 0 0 4px #ffffff;
  }

  .bs-reload-wrap--jammed {
    border-color: #ff6b6b;
    animation: bs-jitter 0.22s ease-in-out 2;
  }

  .bs-squad {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 200px;
  }

  .bs-ally {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 6px;
    background: var(--bs-bg-panel);
    border: 1px solid var(--bs-border-px);
    border-radius: 4px;
    pointer-events: auto;
    cursor: pointer;
    text-align: left;
    transition: border-color 120ms ease, transform 120ms ease;
  }

  .bs-ally:hover {
    border-color: #74c0fc;
  }

  .bs-ally--watching {
    border-color: #ffd43b;
    box-shadow: 0 0 0 1px rgba(255, 212, 59, 0.35);
  }

  .bs-ally--downed {
    border-color: #ff6b6b;
    animation: bs-pulse-danger 0.8s ease-in-out infinite;
  }

  .bs-ally--dead {
    opacity: 0.58;
  }

  .bs-boss-dock {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    width: clamp(280px, calc(100vw - 900px), 480px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    pointer-events: none;
    z-index: 12;
  }

  .bs-boss-dock--multi {
    width: clamp(280px, calc(100vw - 900px), 460px);
    grid-template-columns: minmax(0, 1fr);
    row-gap: 7px;
  }

  .bs-boss-dock--multi .bs-boss-entry {
    gap: 3px;
  }

  .bs-boss-dock--multi .bs-boss-track {
    height: 11px;
  }

  .bs-boss-dock--multi .bs-boss-name {
    font-size: 11px;
  }

  .bs-boss-entry {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
  }

  .bs-boss-track {
    position: relative;
    width: 100%;
    height: 12px;
    background: #090c14;
    border: 1.5px solid rgba(255, 255, 255, 0.34);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.72), inset 0 1px 2px rgba(0, 0, 0, 0.78);
    transform: skewX(-18deg);
    overflow: hidden;
  }

  .bs-boss-under {
    position: absolute;
    inset: 0;
  }

  .bs-boss-fill {
    position: relative;
    height: 100%;
    transition: width 85ms linear;
    box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.26), inset 0 -2px 0 rgba(0, 0, 0, 0.28);
  }

  .bs-boss-fill-edge {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 3px;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.75);
  }

  .bs-boss-subline {
    width: 72%;
    height: 2px;
    background: rgba(255, 255, 255, 0.16);
    transform: skewX(-18deg);
    overflow: hidden;
  }

  .bs-boss-subline-fill {
    height: 100%;
    background: #f5e6a8;
    transition: width 100ms linear;
  }

  .bs-boss-name {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #f8fafc;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95), 0 0 2px #000000;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    line-height: 1.15;
  }

  .bs-hud-tr {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }

  .bs-util-row {
    display: flex;
    align-items: center;
    gap: 5px;
    pointer-events: auto;
  }

  .bs-util-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 8px;
    background: var(--bs-bg-panel);
    border: 1px solid var(--bs-border-px);
    border-radius: 4px;
    color: #e9ecef;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 120ms ease, background 120ms ease;
  }

  .bs-util-btn:hover {
    border-color: #74c0fc;
    background: rgba(27, 32, 48, 0.92);
  }

  .bs-util-btn--active {
    border-color: #ffd43b;
    color: #ffd43b;
  }

  .bs-minimap {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px;
    background: var(--bs-bg-panel);
    border: 2px solid var(--bs-border-px);
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  .bs-minimap-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
  }

  .bs-minimap-toggle {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    background: #1f2433;
    border: 1px solid #495057;
    border-radius: 3px;
    color: #a5d8ff;
    font-size: 9px;
    font-weight: 800;
    cursor: pointer;
  }

  .bs-minimap-canvas {
    display: block;
    width: 154px;
    height: 98px;
    border: 1px solid #2b303b;
    border-radius: 2px;
    image-rendering: pixelated;
    cursor: crosshair;
  }

  .bs-perk-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 3px;
    max-width: 170px;
  }

  .bs-perk-badge {
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(18, 22, 34, 0.86);
    border: 1px solid #495057;
    font-size: 9px;
    font-weight: 700;
    color: #dee2e6;
    pointer-events: auto;
  }

  .bs-wave-banner {
    position: absolute;
    top: 76px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 6px 14px;
    background: rgba(12, 14, 21, 0.84);
    border: 1px solid #495057;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.48);
    text-align: center;
    pointer-events: none;
  }

  .bs-ping-toast {
    position: absolute;
    bottom: 88px;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: rgba(14, 17, 26, 0.88);
    border: 1px solid currentColor;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    pointer-events: none;
  }

  .bs-edge-arrow {
    position: absolute;
    width: 26px;
    height: 26px;
    margin-left: -13px;
    margin-top: -13px;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .bs-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    transition: opacity 220ms ease;
  }

  .bs-vignette--low {
    background: radial-gradient(circle at center, transparent 58%, rgba(224, 49, 49, 0.42) 100%);
    animation: bs-pulse-vignette 0.9s ease-in-out infinite;
  }

  .bs-vignette--downed {
    background: radial-gradient(circle at center, transparent 46%, rgba(255, 71, 87, 0.62) 100%);
    animation: bs-pulse-vignette 0.65s ease-in-out infinite;
  }

  .bs-vignette--dead {
    background: radial-gradient(circle at center, transparent 42%, rgba(10, 12, 18, 0.68) 100%);
  }

  .bs-xp-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 1px;
  }

  .bs-lv-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    height: 14px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(12, 34, 42, 0.92);
    border: 1px solid #22d3ee;
    color: #67e8f9;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }

  .bs-lv-badge--flash {
    box-shadow: 0 0 10px rgba(34, 211, 238, 0.85);
    border-color: #fde047;
    color: #fef08a;
  }

  .bs-survival-strip {
    position: absolute;
    top: max(10px, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    width: min(440px, 48vw);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 8px;
    background: var(--bs-bg-panel);
    border: 2px solid #2b3347;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    pointer-events: none;
    transition: top 160ms ease;
  }

  .bs-survival-strip--under-boss {
    top: 74px;
  }

  .bs-survival-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.03em;
  }

  .bs-survival-timeline {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
  }

  .bs-survival-seg {
    position: relative;
    height: 11px;
    background: rgba(17, 20, 30, 0.9);
    border: 1px solid #2f3749;
    border-radius: 2px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bs-survival-seg-fill {
    position: absolute;
    inset: 0 auto 0 0;
    opacity: 0.45;
  }

  .bs-survival-seg-label {
    position: relative;
    z-index: 1;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: #cbd5e1;
    white-space: nowrap;
  }

  @keyframes bs-pulse-danger {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.25); }
    50% { box-shadow: 0 0 0 3px rgba(255, 71, 87, 0.55); }
  }

  @keyframes bs-pulse-vignette {
    0%, 100% { opacity: 0.62; }
    50% { opacity: 1; }
  }

  @keyframes bs-shimmer {
    from { transform: translateX(-100%); }
    to { transform: translateX(100%); }
  }

  @keyframes bs-flash-warn {
    0%, 100% { filter: brightness(1); }
    40% { filter: brightness(1.85); }
  }

  @keyframes bs-jitter {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-3px); }
    75% { transform: translateX(3px); }
  }

  @media (max-width: 760px) {
    .bs-hud-tl { top: 8px; left: 8px; }
    .bs-hero-portrait { width: 34px; height: 34px; flex-basis: 34px; }
    .bs-hero-bars { min-width: 118px; width: fit-content; }
    .bs-squad { width: 146px; }
    .bs-boss-dock { width: min(320px, 58vw); top: 8px; }
    .bs-boss-dock--multi { width: min(320px, 56vw); row-gap: 5px; }
    .bs-boss-track { height: 10px; }
    .bs-boss-name { font-size: 10px; }
    .bs-survival-strip { width: min(320px, 54vw); top: 8px; padding: 4px 6px; }
    .bs-survival-strip--under-boss { top: 64px; }
    .bs-survival-seg-label { font-size: 7px; }
    .bs-hud-tr { top: 8px; right: 8px; }
    .bs-minimap-canvas { width: 114px; height: 72px; }
  }
}`;

function ensureHudStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(HUD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HUD_STYLE_ID;
  style.textContent = HUD_FALLBACK_CSS;
  document.head.prepend(style);
}

// ============================================================================
// 3. Shared Bar & Portrait Primitives
// ============================================================================

/**
 * Tracks a delayed high-water trail percentage (`lagPct`) that holds/eases over
 * `delayMs` whenever `pct` drops, matching `d45` damage-trail feedback.
 */
function useDelayedTrail(pct: number, delayMs = 40): number {
  const [lagPct, setLagPct] = useState(pct);
  const prevRef = useRef(pct);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = pct;
    if (pct >= prev) {
      setLagPct(pct);
      return;
    }
    const id = window.setTimeout(() => {
      setLagPct(pct);
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [pct, delayMs]);

  return Math.max(lagPct, pct);
}

interface ResourceBarProps {
  value: number;
  max: number;
  fillColor: string;
  height?: number;
  widthPx?: number;
  className?: string;
  label?: string;
  ariaLabel?: string;
  title?: string;
  valueText?: string;
  showLag?: boolean;
  shimmer?: boolean;
  flash?: boolean;
  marks?: readonly number[];
  trackColor?: string;
}

function computeScaledBarWidthPx(
  maxVal: number,
  baseVal: number,
  basePx = 148,
  maxPx = 328,
): number {
  const safeBase = Math.max(1, baseVal);
  if (maxVal <= safeBase) return basePx;
  const growth = (maxVal - safeBase) / safeBase;
  return clamp(Math.round(basePx + Math.min(growth, 2.2) * 84), basePx, maxPx);
}

function ResourceBar({
  value,
  max,
  fillColor,
  height = 12,
  widthPx,
  className,
  label,
  ariaLabel,
  title,
  valueText,
  showLag = true,
  shimmer = false,
  flash = false,
  marks,
  trackColor,
}: ResourceBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = clamp(value, 0, safeMax);
  const pct = (clamped / safeMax) * 100;
  const lagPct = useDelayedTrail(pct);

  return (
    <div
      className={['bs-bar', shimmer ? 'bs-bar--shimmer' : '', flash ? 'bs-bar--flash' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      style={{
        height,
        ...(widthPx !== undefined ? { width: widthPx } : {}),
        ...(trackColor ? { background: trackColor } : {}),
      }}
      title={title}
      role="progressbar"
      aria-label={ariaLabel ?? label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(clamped)}
    >
      {showLag && <div className="bs-bar-lag" style={{ width: `${lagPct}%` }} />}
      <div className="bs-bar-fill" style={{ width: `${pct}%`, background: fillColor }} />
      {marks?.map((mark) => (
        <div
          key={mark}
          className="bs-bar-mark"
          style={{ left: `${clamp(mark, 0, 1) * 100}%` }}
        />
      ))}
      {(label || valueText) && (
        <div className="bs-bar-text">
          <span>{label}</span>
          <span>{valueText ?? `${Math.ceil(clamped)}/${Math.round(safeMax)}`}</span>
        </div>
      )}
    </div>
  );
}

interface HeroPortraitProps {
  heroId: BansungHeroId;
  state: number;
  flags: number;
}

/** `44x44` pixel portrait: attempts hero sprite sheet frame 0, falling back cleanly to SVG crest. */
function HeroPortrait({ heroId, state, flags }: HeroPortraitProps) {
  const [failedHero, setFailedHero] = useState<string | null>(null);
  const hero = getBansungHero(heroId);
  const downed = state === BANSUNG_STATE_DOWNED;
  const dead = state === BANSUNG_STATE_DEAD;
  const invuln = (flags & BANSUNG_PFLAG_INVULN) !== 0;

  const portraitCls = [
    'bs-hero-portrait',
    downed ? 'bs-hero-portrait--downed' : '',
    !downed && !dead && invuln ? 'bs-hero-portrait--invuln' : '',
    dead ? 'bs-hero-portrait--dead' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const src = `/database-ban-sung/sprites/heroes/${hero.id}_idle.png`;
  const showFallback = failedHero === hero.id;

  return (
    <div className={portraitCls} title={hero.name}>
      {!showFallback ? (
        <img
          src={src}
          alt={hero.name}
          onError={() => setFailedHero(hero.id)}
        />
      ) : (
        <svg viewBox="0 0 24 24" width="32" height="32" aria-label={hero.name}>
          <rect x="4" y="4" width="16" height="16" rx="3" fill={hero.outlineHex} />
          <rect x="6" y="6" width="12" height="12" rx="2" fill={hero.primaryHex} />
          <rect x="8" y="8" width="8" height="4" fill={hero.accentHex} />
          <rect x="9" y="13" width="2" height="2" fill="#ffffff" />
          <rect x="13" y="13" width="2" height="2" fill="#ffffff" />
        </svg>
      )}
      {downed && (
        <span
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            fontSize: 9,
            fontWeight: 900,
            padding: '0 3px',
            borderRadius: 2,
            background: '#e03131',
            color: '#fff',
          }}
        >
          DOWN
        </span>
      )}
      {dead && (
        <Skull
          size={16}
          color="#ff8787"
          style={{ position: 'absolute', bottom: 2, right: 2 }}
        />
      )}
    </div>
  );
}

// ============================================================================
// 4. Active Reload Bar, Squad Strip & Top-Left HUD
// ============================================================================

export interface ActiveReloadBarProps {
  /** Remaining reload milliseconds (`BansungPrivate.reloadMs`). */
  reloadMs: number;
  /** Total reload duration milliseconds (`BansungPrivate.reloadTotalMs`). */
  reloadTotalMs: number;
  /** Optional Quick Hands / custom sweet-spot window `[minU, maxU]`. */
  sweetSpot?: readonly [number, number];
  /** Optional reload-locked / jammed visual flag. */
  jammed?: boolean;
  /** Timestamp (`Date.now()`) of last `BANSUNG_FX_STATUS_RELOAD_PERFECT` FX event. */
  perfectedAt?: number;
  /** Optional explicit override visibility when reloading flag is set on player. */
  reloading?: boolean;
}

/** `120x10` Active Reload sweet-spot gauge with `[0.48, 0.64]` window and lockout tint. */
export function ActiveReloadBar({
  reloadMs,
  reloadTotalMs,
  sweetSpot,
  jammed = false,
  perfectedAt = 0,
  reloading = false,
}: ActiveReloadBarProps) {
  const [now, setNow] = useState(() => Date.now());
  const isReloadActive = reloadTotalMs > 0 && reloadMs > 0 && (reloading || reloadMs > 0);
  const showSuccess = perfectedAt > 0 && now - perfectedAt < 900;

  useEffect(() => {
    if (!showSuccess) return;
    const rem = Math.max(16, 920 - (Date.now() - perfectedAt));
    const t = window.setTimeout(() => setNow(Date.now()), rem);
    return () => window.clearTimeout(t);
  }, [showSuccess, perfectedAt]);

  if (!isReloadActive && !showSuccess && !jammed) {
    return null;
  }

  const rawSweetMin = sweetSpot?.[0];
  const rawSweetMax = sweetSpot?.[1];
  const normSweetMin =
    typeof rawSweetMin === 'number' && Number.isFinite(rawSweetMin)
      ? rawSweetMin > 1
        ? rawSweetMin / 100
        : rawSweetMin
      : BANSUNG_RELOAD_SWEET_MIN;
  const normSweetMax =
    typeof rawSweetMax === 'number' && Number.isFinite(rawSweetMax)
      ? rawSweetMax > 1
        ? rawSweetMax / 100
        : rawSweetMax
      : BANSUNG_RELOAD_SWEET_MAX;
  const minU = clamp(normSweetMin, BANSUNG_RELOAD_LOCKOUT_U, 0.92);
  const maxU = clamp(normSweetMax, minU + 0.04, 0.98);
  const u = reloadTotalMs > 0 ? clamp(1 - reloadMs / reloadTotalMs, 0, 1) : 1;

  return (
    <div className={['bs-reload-wrap', jammed ? 'bs-reload-wrap--jammed' : ''].filter(Boolean).join(' ')}>
      <div className="bs-reload-bar" aria-label="Active Reload">
        <div
          className="bs-reload-lock"
          style={{ width: `${BANSUNG_RELOAD_LOCKOUT_U * 100}%` }}
        />
        <div
          className="bs-reload-sweet"
          style={{
            left: `${minU * 100}%`,
            width: `${(maxU - minU) * 100}%`,
          }}
        />
        {isReloadActive && (
          <div className="bs-reload-needle" style={{ left: `${u * 100}%` }} />
        )}
      </div>
      {showSuccess ? (
        <span style={{ fontSize: 10, fontWeight: 900, color: '#69db7c', letterSpacing: '0.04em' }}>
          FAST RELOAD!
        </span>
      ) : jammed ? (
        <span style={{ fontSize: 10, fontWeight: 900, color: '#ff6b6b', letterSpacing: '0.04em' }}>
          JAMMED
        </span>
      ) : (
        <span style={{ fontSize: 9, fontWeight: 700, color: '#a5d8ff' }}>[R]</span>
      )}
    </div>
  );
}

export interface SquadStripProps {
  players: readonly SnapPlayer[];
  roster: readonly BansungPlayerInfo[];
  myIdx?: number;
  spectateTargetIdx?: number | null;
  canSpectate?: boolean;
  onSpectate?: (idx: number) => void;
}

/** Co-op teammate status cards (`bs-squad`) with downed revive progress & click-to-spectate. */
export function SquadStrip({
  players,
  roster,
  myIdx,
  spectateTargetIdx = null,
  canSpectate = false,
  onSpectate,
}: SquadStripProps) {
  const rosterByIdx = useMemo(() => {
    const map = new Map<number, BansungPlayerInfo>();
    for (const r of roster) map.set(r.idx, r);
    return map;
  }, [roster]);

  const allies = useMemo(
    () => players.filter((p) => p.idx !== myIdx).sort((a, b) => a.idx - b.idx).slice(0, 3),
    [players, myIdx],
  );

  if (allies.length === 0) return null;

  return (
    <div className="bs-squad" aria-label="Squad Status">
      {allies.map((ally) => {
        const info = rosterByIdx.get(ally.idx);
        const hero = getBansungHero(getHeroIdByIdx(ally.heroIdx));
        const isBot = (ally.flags & BANSUNG_PFLAG_BOT) !== 0 || Boolean(info?.bot);
        const downed = ally.state === BANSUNG_STATE_DOWNED;
        const dead = ally.state === BANSUNG_STATE_DEAD;
        const watching = spectateTargetIdx === ally.idx;
        const maxHp = Math.max(hero.hp * BANSUNG_HERO_STAT_SCALE, ally.hp);
        const maxSh = Math.max(hero.shield * BANSUNG_HERO_STAT_SCALE, ally.shield, 1);

        const cls = [
          'bs-ally',
          watching ? 'bs-ally--watching' : '',
          downed ? 'bs-ally--downed' : '',
          dead ? 'bs-ally--dead' : '',
        ]
          .filter(Boolean)
          .join(' ');

        const handleClick = () => {
          if (onSpectate) {
            onSpectate(ally.idx);
          } else {
            bansungStore.setSpectate(ally.idx);
          }
        };

        return (
          <button
            key={ally.idx}
            type="button"
            className={cls}
            onClick={handleClick}
            title={canSpectate ? `Click to spectate ${info?.name ?? hero.name}` : info?.name ?? hero.name}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 1,
                    background: hero.primaryHex,
                    border: `1px solid ${hero.accentHex}`,
                    flexShrink: 0,
                  }}
                />
                <span>{info?.name ?? hero.name}</span>
                {isBot && (
                  <span style={{ fontSize: 8, padding: '0 3px', borderRadius: 2, background: '#2b303b', color: '#adb5bd' }}>
                    BOT
                  </span>
                )}
              </span>
              {downed ? (
                <span style={{ fontSize: 9, fontWeight: 900, color: '#ff8787' }}>
                  {ally.revivePct > 0 ? `+${Math.round(ally.revivePct)}%` : 'DOWN'}
                </span>
              ) : dead ? (
                <Skull size={11} color="#868e96" />
              ) : watching ? (
                <Eye size={11} color="#ffd43b" />
              ) : (
                <span style={{ fontSize: 9, color: '#ced4da' }}>{Math.ceil(ally.hp)}</span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 3 }}>
              <ResourceBar value={ally.hp} max={maxHp} fillColor="var(--bs-hp)" height={5} showLag={false} />
              <ResourceBar value={ally.shield} max={maxSh} fillColor="var(--bs-sh)" height={5} showLag={false} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

export interface TopLeftHudProps {
  snapshot: BansungHudSnapshot;
  view?: BansungRoomView;
  dryFireAt?: number;
  reloadPerfectedAt?: number;
  levelUpAt?: number;
  onSpectate?: (idx: number) => void;
}

/** Top-left HUD anchor: portrait, HP/Shield/Energy + XP bars, weapon tier & match pills, Active Reload, Squad strip. */
export function TopLeftHud({
  snapshot,
  view,
  dryFireAt = 0,
  reloadPerfectedAt = 0,
  levelUpAt = 0,
  onSpectate,
}: TopLeftHudProps) {
  const { localPlayer, me, wave, elapsedMs, rem, wavePhase, players, roster, myIdx, spectating } = snapshot;
  const heroId = getHeroIdByIdx(localPlayer?.heroIdx ?? 0);
  const hero = getBansungHero(heroId);

  const baseHp = hero.hp * BANSUNG_HERO_STAT_SCALE;
  const baseShield = hero.shield * BANSUNG_HERO_STAT_SCALE;
  const hp = localPlayer?.hp ?? baseHp;
  const maxHp = me?.maxHp ?? Math.max(baseHp, hp);
  const shield = localPlayer?.shield ?? baseShield;
  const maxShield = me?.maxShield ?? Math.max(baseShield, shield, 1);
  const stamina = me?.stamina ?? BANSUNG_STAMINA.BASE_MAX;
  const maxStamina = me?.maxStamina ?? BANSUNG_STAMINA.BASE_MAX;
  const dashCost = me?.dashCost ?? BANSUNG_STAMINA.DASH_COST;
  const shieldDrPct = me?.shieldDrPct ?? 25;
  const shieldDelayMs = me?.shieldDelayMs ?? 0;
  const shieldRegenTotalMs = Math.max(1000, me?.shieldRegenTotalMs ?? 5000);
  const shieldBuffMs = Math.max(0, me?.shieldBuffMs ?? 0);
  const dashCostMark = clamp(dashCost / Math.max(1, maxStamina), 0.1, 0.9);
  const energy = me?.energy ?? hero.energy;
  const maxEnergy = me?.maxEnergy ?? Math.max(hero.energy, energy, 1);

  const hpBarWidth = computeScaledBarWidthPx(maxHp, baseHp);
  const shBarWidth = computeScaledBarWidthPx(maxShield, baseShield);
  const stmBarWidth = computeScaledBarWidthPx(maxStamina, BANSUNG_STAMINA.BASE_MAX);
  const enBarWidth = computeScaledBarWidthPx(maxEnergy, hero.energy);

  const isSurvival = resolveIsSurvivalMode(snapshot, view);
  const level = Math.max(1, Math.floor(me?.level ?? 1));
  const xp = Math.max(0, me?.xp ?? 0);
  const xpToNext = Math.max(1, me?.xpToNext ?? getXpToNextLevel(level));
  const activeSlotIdx = me?.slotIdx ?? 0;
  const activeTier = normalizeWeaponTier(
    me?.weaponTiers?.[activeSlotIdx] ?? me?.slots?.[activeSlotIdx]?.tier ?? localPlayer?.weaponTier ?? 1,
  );
  const tierSpec = BANSUNG_WEAPON_TIERS[activeTier];
  const gachaPending = Math.max(0, me?.gachaPending ?? 0);
  const queuedGacha = Math.max(0, gachaPending - (me?.gachaChoices?.length ? 1 : 0));

  const [levelFlash, setLevelFlash] = useState(false);
  useEffect(() => {
    if (!levelUpAt) return;
    setLevelFlash(true);
    const t = window.setTimeout(() => setLevelFlash(false), 1200);
    return () => window.clearTimeout(t);
  }, [levelUpAt]);

  const prevShieldRef = useRef(shield);
  const [shieldRegening, setShieldRegening] = useState(false);
  useEffect(() => {
    if (shield > prevShieldRef.current && shield < maxShield) {
      setShieldRegening(true);
      const t = window.setTimeout(() => setShieldRegening(false), 650);
      prevShieldRef.current = shield;
      return () => window.clearTimeout(t);
    }
    prevShieldRef.current = shield;
    return undefined;
  }, [shield, maxShield]);

  const [energyFlash, setEnergyFlash] = useState(false);
  useEffect(() => {
    if (!dryFireAt) return;
    setEnergyFlash(true);
    const t = window.setTimeout(() => setEnergyFlash(false), 320);
    return () => window.clearTimeout(t);
  }, [dryFireAt]);

  const activeSlot = me?.slots?.[me.slotIdx];
  const isReloading = Boolean(
    activeSlot &&
      activeSlot.maxClip > 0 &&
      me &&
      me.reloadTotalMs > 0 &&
      me.reloadMs > 0 &&
      localPlayer?.state !== BANSUNG_STATE_DEAD &&
      localPlayer?.state !== BANSUNG_STATE_DOWNED,
  );

  return (
    <div className="bs-hud-tl">
      <div className="bs-hero-card">
        <HeroPortrait
          heroId={heroId}
          state={localPlayer?.state ?? 0}
          flags={localPlayer?.flags ?? 0}
        />
        <div className="bs-hero-bars">
          <div className="bs-hero-header">
            <span>{hero.name.toUpperCase()}</span>
            {spectating.active && (
              <span style={{ color: '#ffd43b', fontSize: 9 }}>
                SPEC: {spectating.targetName}
              </span>
            )}
          </div>
          <ResourceBar
            ariaLabel="HP"
            value={hp}
            max={maxHp}
            widthPx={hpBarWidth}
            fillColor="var(--bs-hp)"
            className="bs-bar--hp"
          />
          <ResourceBar
            ariaLabel="Shield"
            value={shield}
            max={maxShield}
            widthPx={shBarWidth}
            fillColor={
              shieldBuffMs > 0
                ? 'linear-gradient(90deg, #38bdf8, #fbbf24)'
                : 'var(--bs-sh)'
            }
            className="bs-bar--sh"
            shimmer={shieldRegening || shieldBuffMs > 0}
            title={`SH -${shieldDrPct}%`}
          />
          {shield < maxShield && shieldDelayMs > 0 && (
            <div
              className="bs-shield-delay-track"
              style={{ width: shBarWidth }}
              title={`Khiên hồi lại sau ${(shieldDelayMs / 1000).toFixed(1)}s không nhận sát thương`}
            >
              <div
                className="bs-shield-delay-fill"
                style={{
                  width: `${clamp(((shieldRegenTotalMs - shieldDelayMs) / shieldRegenTotalMs) * 100, 0, 100)}%`,
                }}
              />
            </div>
          )}
          <ResourceBar
            ariaLabel="Stamina"
            value={stamina}
            max={maxStamina}
            widthPx={stmBarWidth}
            fillColor={
              stamina < dashCost
                ? 'linear-gradient(90deg, #b45309, #f59e0b)'
                : 'linear-gradient(90deg, #f59f00, #ffd43b)'
            }
            className="bs-bar--stm"
            showLag={false}
            marks={[dashCostMark]}
          />
          <ResourceBar
            ariaLabel="Energy"
            value={energy}
            max={maxEnergy}
            height={8}
            widthPx={enBarWidth}
            fillColor="var(--bs-en)"
            className="bs-bar--en"
            showLag={false}
            flash={energyFlash}
          />
          {isSurvival && (
            <div className="bs-xp-row" aria-label={`Level ${level} XP`}>
              <span className={['bs-lv-badge', levelFlash ? 'bs-lv-badge--flash' : ''].filter(Boolean).join(' ')}>
                LV {level}
              </span>
              <ResourceBar
                ariaLabel={`XP Level ${level}`}
                value={xp}
                max={xpToNext}
                widthPx={110}
                fillColor="linear-gradient(90deg, #10b981, #22d3ee)"
                height={9}
                className="bs-bar--xp"
                showLag={false}
              />
            </div>
          )}
          <div className="bs-pills">
            {shieldBuffMs > 0 && (
              <span
                className="bs-pill"
                style={{
                  color: '#7dd3fc',
                  borderColor: '#fbbf24',
                  background: 'rgba(14, 116, 144, 0.42)',
                }}
                title="Khiên bảo hộ miễn nhiễm mọi đòn tấn công"
              >
                🛡️ {Math.ceil(shieldBuffMs / 1000)}s
              </span>
            )}
            {isSurvival ? (
              <>
                <span className="bs-pill" style={{ color: '#a5d8ff' }} title="Đợt quái hiện tại">
                  WAVE {Math.max(1, wave)}
                </span>
                <span
                  className="bs-pill"
                  style={{ color: tierSpec.auraColor, borderColor: tierSpec.auraColor }}
                  title={`${tierSpec.vnName} · DMG x${tierSpec.dmgMult}`}
                >
                  {tierSpec.badge}
                </span>
                {gachaPending > 0 && (
                  <span
                    className="bs-pill"
                    style={{ color: '#fde047', borderColor: '#f59e0b' }}
                    title="Hộp Gacha nâng cấp đang chờ mở"
                  >
                    {queuedGacha > 0 ? `+${queuedGacha} GACHA` : 'MỞ GACHA'}
                  </span>
                )}
              </>
            ) : (
              <span className="bs-pill" style={{ color: '#a5d8ff' }}>
                W{wave}/{BANSUNG_TOTAL_WAVES}
              </span>
            )}
            <span className="bs-pill" style={{ color: '#ffa8a8' }}>
              <Crosshair size={10} />
              {me?.kills ?? 0}
            </span>
            <span className="bs-pill">{formatMatchClock(elapsedMs)}</span>
            {!isSurvival && wavePhase === 'combat' && rem > 0 && (
              <span className="bs-pill" style={{ color: '#ffc078' }} title="Remaining enemies">
                {rem} LEFT
              </span>
            )}
          </div>
        </div>
      </div>

      <ActiveReloadBar
        reloadMs={me?.reloadMs ?? 0}
        reloadTotalMs={me?.reloadTotalMs ?? 0}
        sweetSpot={me?.sweetSpot}
        reloading={isReloading}
        perfectedAt={reloadPerfectedAt}
      />

      <SquadStrip
        players={players}
        roster={roster}
        myIdx={myIdx}
        spectateTargetIdx={spectating.targetIdx}
        canSpectate={spectating.canCycle}
        onSpectate={onSpectate}
      />
    </div>
  );
}

// ============================================================================
// 5. Top-Center Boss + Stagger Bar
// ============================================================================

export interface BossHudBarProps {
  boss?: SnapBoss;
  bosses?: readonly SnapBoss[];
}

function resolveCleanBossName(b: SnapBoss): string {
  const spec = BANSUNG_ENEMIES[b.kind];
  const raw = b.title?.trim() || spec?.name || spec?.vnName || b.kind.replace(/^boss_/, '').replace(/_/g, ' ');
  return raw.replace(/^\s*\[[^\]]+\]\s*/g, '').trim();
}

function BossSingleBar({ boss }: { boss: SnapBoss }) {
  const hp = Math.max(0, boss.hp);
  const maxHp = Math.max(1, boss.maxHp);
  const totalBars = Math.max(2, boss.hpBars ?? getBossHpBars(boss.kind, (boss.scale ?? 1) < 0.85));
  const barState = resolveBossBarState(hp, maxHp, totalBars);
  const fillPct = Math.max(0, Math.min(100, (barState.curBarHp / Math.max(1, barState.hpPerBar)) * 100));
  const stunned = boss.state === BANSUNG_STATE_STUN;
  const maxStagger = Math.max(1, boss.maxStagger ?? 0);
  const staggerPct =
    (boss.maxStagger ?? 0) > 0
      ? Math.max(0, Math.min(100, ((boss.stagger ?? 0) / maxStagger) * 100))
      : 0;
  const bossName = resolveCleanBossName(boss);
  const fillColor = barState.barColor;
  const underColor = barState.underBarColor;
  const sublineColor = stunned ? '#fb923c' : (boss.telegraph ?? 0) > 0 ? '#fca5a5' : '#f5e6a8';

  return (
    <div className="bs-boss-entry" aria-label={`Boss ${bossName}`}>
      <div className="bs-boss-track">
        {underColor && <div className="bs-boss-under" style={{ background: underColor }} />}
        <div
          className="bs-boss-fill"
          style={{
            width: `${fillPct}%`,
            background: fillColor,
          }}
        >
          {fillPct > 1 && <div className="bs-boss-fill-edge" />}
        </div>
      </div>

      <div className="bs-boss-subline">
        <div
          className="bs-boss-subline-fill"
          style={{
            width: `${stunned ? 100 : staggerPct}%`,
            background: sublineColor,
          }}
        />
      </div>

      <div className="bs-boss-name">{bossName}</div>
    </div>
  );
}

/** Top-center minimal layered Boss HP dock: skewed layered bars + centered Boss name only, 2-col parallel for 2+ bosses. */
export function BossHudBar({ boss, bosses }: BossHudBarProps) {
  const allBosses = useMemo(() => {
    const seen = new Set<number>();
    const list: SnapBoss[] = [];
    if (boss && boss.maxHp > 0) {
      seen.add(boss.id);
      list.push(boss);
    }
    if (bosses) {
      for (let i = 0; i < bosses.length; i++) {
        const b = bosses[i];
        if (!b || b.maxHp <= 0 || seen.has(b.id)) continue;
        seen.add(b.id);
        list.push(b);
      }
    }
    return list;
  }, [boss, bosses]);

  if (allBosses.length === 0) return null;

  const isMulti = allBosses.length > 1;
  return (
    <div className={`bs-boss-dock${isMulti ? ' bs-boss-dock--multi' : ''}`}>
      {allBosses.slice(0, 6).map((b) => (
        <BossSingleBar key={b.id} boss={b} />
      ))}
    </div>
  );
}

// ============================================================================
// 6. Top-Right Utility Row & 154x98 ARENA/RADAR Canvas Minimap
// ============================================================================

/**
 * Pure 2D canvas draw routine for the `154x98` minimap (`ARENA` overview or
 * `900px`-radius `RADAR` zoomed around local/followed camera). Runs at 60Hz
 * directly against `bansungStore` without triggering React HUD re-renders.
 */
export function renderBansungMinimap(
  ctx: CanvasRenderingContext2D,
  store: BansungStore,
  mode: BansungMinimapMode,
  cssW: number,
  cssH: number,
  nowMs: number,
): void {
  const safeW = Math.max(1, cssW);
  const safeH = Math.max(1, cssH);
  const mapW = store.mapW || BANSUNG_MAP_W;
  const mapH = store.mapH || BANSUNG_MAP_H;
  const palette = BANSUNG_BIOME_PALETTES[store.biome] ?? BANSUNG_BIOME_PALETTES.desert;

  const selfPlayer = store.myIdx !== undefined ? store.players.get(store.myIdx) : undefined;
  const originX =
    store.cam.mode === 'self' && selfPlayer
      ? store.localDrawX
      : store.cam.x || mapW * 0.5;
  const originY =
    store.cam.mode === 'self' && selfPlayer
      ? store.localDrawY
      : store.cam.y || mapH * 0.5;

  let scale: number;
  let offX: number;
  let offY: number;

  if (mode === 'radar') {
    scale = (Math.min(safeW, safeH) * 0.5) / BANSUNG_RADAR_RADIUS;
    offX = safeW * 0.5 - originX * scale;
    offY = safeH * 0.5 - originY * scale;
  } else {
    scale = Math.min(safeW / mapW, safeH / mapH);
    offX = (safeW - mapW * scale) * 0.5;
    offY = (safeH - mapH * scale) * 0.5;
  }

  const toX = (wx: number) => offX + wx * scale;
  const toY = (wy: number) => offY + wy * scale;

  // 1. Background & Biome arena floor
  ctx.clearRect(0, 0, safeW, safeH);
  ctx.fillStyle = '#0d1018';
  ctx.fillRect(0, 0, safeW, safeH);

  ctx.save();
  ctx.fillStyle = palette.wallFace;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(toX(0), toY(0), mapW * scale, mapH * scale);
  ctx.fillStyle = palette.floorB;
  ctx.globalAlpha = 0.28;
  const pb = store.playableBounds;
  ctx.fillRect(
    toX(pb.x0),
    toY(pb.y0),
    (pb.x1 - pb.x0) * scale,
    (pb.y1 - pb.y0) * scale,
  );
  ctx.restore();

  ctx.strokeStyle = palette.wallTrim;
  ctx.lineWidth = 1;
  ctx.strokeRect(toX(pb.x0), toY(pb.y0), (pb.x1 - pb.x0) * scale, (pb.y1 - pb.y0) * scale);

  // Perimeter enemy spawn gates (4 cardinal + 4 corners + 4 mid-quadrant)
  ctx.fillStyle = '#9775fa';
  for (let i = 0; i < BANSUNG_ENEMY_GATES.length; i++) {
    const g = BANSUNG_ENEMY_GATES[i];
    if (g.x > mapW || g.y > mapH) continue;
    const gx = toX(g.x);
    const gy = toY(g.y);
    const sz = g.cardinal ? 2.6 : 1.8;
    ctx.fillRect(gx - sz * 0.5, gy - sz * 0.5, sz, sz);
  }

  if (mode === 'radar') {
    ctx.save();
    ctx.strokeStyle = 'rgba(116, 192, 252, 0.22)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(safeW * 0.5, safeH * 0.5, Math.min(safeW, safeH) * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Static obstacles
  ctx.fillStyle = '#2c2e33';
  ctx.strokeStyle = '#495057';
  ctx.lineWidth = 0.75;
  for (let i = 0; i < store.obstacles.length; i++) {
    const o = store.obstacles[i];
    const rx = toX(o.x);
    const ry = toY(o.y);
    const rw = Math.max(2, o.w * scale);
    const rh = Math.max(2, o.h * scale);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
  }

  // 3. Props (barrels highlighted red; turrets cyan)
  for (let i = 0; i < store.props.length; i++) {
    const pr = store.props[i];
    const kind = BANSUNG_PROP_IDS[pr.kindIdx];
    const px = toX(pr.x);
    const py = toY(pr.y);
    if (kind === 'barrel') {
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    } else if (kind === 'turret' || kind === 'drone') {
      ctx.fillStyle = '#4dabf7';
      ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
  }

  // 4. Pickups (weapon pedestals = gold diamond; XP orbs = emerald/cyan; coins = warm yellow; orbs = green)
  for (let i = 0; i < store.pickups.length; i++) {
    const pk = store.pickups[i];
    const px = toX(pk.x);
    const py = toY(pk.y);
    const kindName = BANSUNG_PICKUP_KINDS[pk.kindIdx];
    const xpStyle = kindName ? XP_MINIMAP_DOTS[kindName] : undefined;
    const isPedestal = kindName === 'weapon_pedestal' || pk.kindIdx === 7;
    if (isPedestal) {
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.moveTo(px, py - 3.5);
      ctx.lineTo(px + 3.5, py);
      ctx.lineTo(px, py + 3.5);
      ctx.lineTo(px - 3.5, py);
      ctx.closePath();
      ctx.fill();
    } else if (xpStyle) {
      const dot = xpStyle;
      ctx.fillStyle = dot.color;
      ctx.beginPath();
      ctx.arc(px, py, dot.r, 0, Math.PI * 2);
      ctx.fill();
      if (dot.stroke) {
        ctx.strokeStyle = dot.stroke;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    } else if (kindName === 'coin' || kindName === 'gem_coin') {
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    } else {
      ctx.fillStyle = '#69db7c';
      ctx.fillRect(px - 1.25, py - 1.25, 2.5, 2.5);
    }
  }

  // 5. Enemies (normal = crimson; Evolved New-Edition 15-20m = bright violet-crimson)
  store.enemies.forEach((enemy) => {
    if (enemy.state === BANSUNG_STATE_DEAD) return;
    const ex = toX(enemy.x);
    const ey = toY(enemy.y);
    const evolved = (enemy.flags & BANSUNG_EFLAG_EVOLVED) !== 0;
    if (evolved) {
      ctx.fillStyle = '#e879f9';
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ex, ey, 2.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#e03131';
      ctx.beginPath();
      ctx.arc(ex, ey, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 6. Boss skull / diamond marker
  if (store.boss && store.boss.hp > 0) {
    const bx = toX(store.boss.x);
    const by = toY(store.boss.y);
    const bossPulse = (nowMs % 900) / 900;
    ctx.save();
    ctx.strokeStyle = '#ff6b6b';
    ctx.globalAlpha = 0.8 - bossPulse * 0.65;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx, by, 4.5 + bossPulse * 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ff2b2b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 7. Co-op teammates & Local player (+ aim cone)
  store.players.forEach((p) => {
    const isSelf = p.idx === store.myIdx;
    const wx = isSelf && store.cam.mode === 'self' ? store.localDrawX : p.x;
    const wy = isSelf && store.cam.mode === 'self' ? store.localDrawY : p.y;
    const aim = isSelf && store.cam.mode === 'self' ? store.localAimRad : p.aim;
    const px = toX(wx);
    const py = toY(wy);

    if (p.state === BANSUNG_STATE_DOWNED) {
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px - 3, py);
      ctx.lineTo(px + 3, py);
      ctx.moveTo(px, py - 3);
      ctx.lineTo(px, py + 3);
      ctx.stroke();
      return;
    }

    if (p.state === BANSUNG_STATE_DEAD) return;

    if (isSelf) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, 14, aim - 0.38, aim + 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1864ab';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = '#4dabf7';
      ctx.strokeStyle = '#0b192c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 2.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  });

  // 8. Active ping ripples
  for (let i = 0; i < store.pings.length; i++) {
    const ping = store.pings[i];
    if (ping.expiresAt <= nowMs) continue;
    const px = toX(ping.x);
    const py = toY(ping.y);
    const meta = BANSUNG_PING_META[ping.kind] ?? BANSUNG_PING_META[BANSUNG_PING_HELP];
    const pulse = ((nowMs % 750) / 750);
    ctx.save();
    ctx.strokeStyle = meta.color;
    ctx.globalAlpha = 1 - pulse * 0.7;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(px, py, 3 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 9. Camera viewport rectangle
  const camHalfW = (store.viewW / Math.max(0.1, store.cam.zoom)) * 0.5;
  const camHalfH = (store.viewH / Math.max(0.1, store.cam.zoom)) * 0.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 0.85;
  ctx.strokeRect(
    toX(store.cam.x - camHalfW),
    toY(store.cam.y - camHalfH),
    camHalfW * 2 * scale,
    camHalfH * 2 * scale,
  );
}

export interface MinimapHudProps {
  onPing?: (kind: BansungPingKind, x: number, y: number) => void;
  pingKind?: BansungPingKind;
  disableHotkey?: boolean;
}

/** `154x98` (mobile `114x72`) toggleable `ARENA` / `RADAR` canvas minimap with `M` hotkey & click ping. */
export function MinimapHud({ onPing, pingKind = BANSUNG_PING_ENEMY, disableHotkey = false }: MinimapHudProps) {
  const [mode, setMode] = useState<BansungMinimapMode>('arena');
  const [pingArmed, setPingArmed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (disableHotkey) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isInteractiveInputFocused(e.target)) return;
      if (e.key === 'm' || e.key === 'M') {
        setMode((prev) => (prev === 'arena' ? 'radar' : 'arena'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disableHotkey]);

  useEffect(() => {
    let rafId = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cssW = Math.round(rect.width) || BANSUNG_MINIMAP_W;
        const cssH = Math.round(rect.height) || BANSUNG_MINIMAP_H;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const targetW = Math.round(cssW * dpr);
        const targetH = Math.round(cssH * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderBansungMinimap(ctx, bansungStore, mode, cssW, cssH, performance.now());
        }
      }
      rafId = window.requestAnimationFrame(draw);
    };
    rafId = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(rafId);
  }, [mode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !onPing) return;
    if (!e.altKey && !pingArmed) return;

    const rect = canvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const selfPlayer = bansungStore.myIdx !== undefined ? bansungStore.players.get(bansungStore.myIdx) : undefined;
    const originX =
      bansungStore.cam.mode === 'self' && selfPlayer
        ? bansungStore.localDrawX
        : bansungStore.cam.x || bansungStore.mapW * 0.5;
    const originY =
      bansungStore.cam.mode === 'self' && selfPlayer
        ? bansungStore.localDrawY
        : bansungStore.cam.y || bansungStore.mapH * 0.5;

    const worldPt = minimapPointToWorld(
      localX,
      localY,
      rect.width || BANSUNG_MINIMAP_W,
      rect.height || BANSUNG_MINIMAP_H,
      mode,
      bansungStore.mapW || BANSUNG_MAP_W,
      bansungStore.mapH || BANSUNG_MAP_H,
      originX,
      originY,
    );
    onPing(pingKind, worldPt.x, worldPt.y);
    if (pingArmed) setPingArmed(false);
  };

  return (
    <div className="bs-minimap">
      <div className="bs-minimap-head">
        <button
          type="button"
          className="bs-minimap-toggle"
          onClick={() => setMode((m) => (m === 'arena' ? 'radar' : 'arena'))}
          title="Toggle ARENA / RADAR (M)"
        >
          {mode === 'arena' ? <MapIcon size={10} /> : <Radar size={10} />}
          <span>{mode === 'arena' ? 'ARENA' : 'RADAR'}</span>
          <span style={{ color: '#868e96' }}>[M]</span>
        </button>
        {onPing && (
          <button
            type="button"
            className="bs-minimap-toggle"
            style={pingArmed ? { borderColor: '#ffd43b', color: '#ffd43b' } : undefined}
            onClick={() => setPingArmed((v) => !v)}
            title="Alt+Click (or tap Ping then map) to ping world coordinates"
          >
            <span>{pingArmed ? 'TAP MAP' : 'ALT+PING'}</span>
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="bs-minimap-canvas"
        width={BANSUNG_MINIMAP_W}
        height={BANSUNG_MINIMAP_H}
        onClick={handleCanvasClick}
      />
    </div>
  );
}

export interface TopRightUtilityProps {
  perks?: readonly BansungPerkId[];
  dock?: ReactNode;
  unreadChat?: number;
  chatOpen?: boolean;
  guideOpen?: boolean;
  shopOpen?: boolean;
  disableMinimapHotkey?: boolean;
  onToggleShop?: () => void;
  onToggleChat?: () => void;
  onToggleGuide?: () => void;
  onLeave?: () => void;
  onPing?: (kind: BansungPingKind, x: number, y: number) => void;
}

/** Top-right HUD cluster: Shop [B], Guide, Chat+unread, optional Dock/Leave, 154x98 Minimap, Active Perks strip. */
export function TopRightUtility({
  perks = [],
  dock,
  unreadChat = 0,
  chatOpen = false,
  guideOpen = false,
  shopOpen = false,
  disableMinimapHotkey = false,
  onToggleShop,
  onToggleChat,
  onToggleGuide,
  onLeave,
  onPing,
}: TopRightUtilityProps) {
  const stackedPerks = useMemo(() => {
    const counts = new Map<BansungPerkId, number>();
    for (const id of perks) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [perks]);

  return (
    <div className="bs-hud-tr">
      <div className="bs-util-row">
        {dock && <div className="bs-dock">{dock}</div>}
        {onToggleShop && (
          <button
            type="button"
            className={['bs-util-btn', shopOpen ? 'bs-util-btn--active' : ''].filter(Boolean).join(' ')}
            onClick={onToggleShop}
            title="Cửa hàng vũ khí [B]"
            style={{ color: '#ffd43b' }}
          >
            <ShoppingBag size={13} />
            <span>[B]</span>
          </button>
        )}
        {onToggleGuide && (
          <button
            type="button"
            className={['bs-util-btn', guideOpen ? 'bs-util-btn--active' : ''].filter(Boolean).join(' ')}
            onClick={onToggleGuide}
            title="Hướng dẫn"
          >
            <BookOpen size={13} />
          </button>
        )}
        {onToggleChat && (
          <button
            type="button"
            className={['bs-util-btn', chatOpen ? 'bs-util-btn--active' : ''].filter(Boolean).join(' ')}
            onClick={onToggleChat}
            title="Chat"
          >
            <MessageSquare size={13} />
            {unreadChat > 0 && (
              <span
                style={{
                  minWidth: 14,
                  height: 14,
                  padding: '0 3px',
                  borderRadius: 99,
                  background: '#e03131',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
        )}
        {onLeave && (
          <button
            type="button"
            className="bs-util-btn"
            onClick={onLeave}
            title="Rời phòng"
            style={{ color: '#ffa8a8' }}
          >
            <LogOut size={13} />
          </button>
        )}
      </div>

      <MinimapHud onPing={onPing} disableHotkey={disableMinimapHotkey} />

      {stackedPerks.length > 0 && (
        <div className="bs-perk-row" aria-label="Active Perks">
          {stackedPerks.map(([id, count]) => {
            const def = getBansungPerk(id);
            const border = def ? RARITY_BORDER[def.rarity] : '#495057';
            return (
              <span
                key={id}
                className="bs-perk-badge"
                style={{ borderColor: border }}
                title={def ? `${def.name}: ${def.desc}` : id}
              >
                <Sparkles size={9} style={{ display: 'inline', marginRight: 2, color: border }} />
                {def?.name ?? id}
                {count > 1 ? ` x${count}` : ''}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 7. Wave / Ping Banners, Off-Screen Edge Arrows & Low-HP Vignette
// ============================================================================

export interface SurvivalClockStripProps {
  survival: BansungSurvivalClock | null;
  elapsedMs: number;
  hasBoss?: boolean;
}

/**
 * Top-center Survival HUD Strip displaying repeating cycle (`Vòng N`), 20:00 clock,
 * active 5-minute stage (`0-5p Quái Nhẹ`, `5-10p Quái Trâu`, `10-15p BOSS`, `15-20p Tiến Hóa Bản Mới`),
 * live `stageRemS` countdown, and segmented 4-stage timeline bar.
 */
export function SurvivalClockStrip({
  survival,
  elapsedMs,
  hasBoss = false,
}: SurvivalClockStripProps) {
  const safeElapsedS = Math.max(0, Math.floor((survival?.elapsedMs ?? elapsedMs) / 1000));
  const cycle = survival?.cycle ?? Math.floor(safeElapsedS / BANSUNG_SURVIVAL_CYCLE_S);
  const cycleSec = survival?.cycleSec ?? (safeElapsedS % BANSUNG_SURVIVAL_CYCLE_S);
  const stageIdx = (survival?.stageIdx ??
    BANSUNG_SURVIVAL_STAGES.find((s) => cycleSec < s.endSec)?.idx ??
    3) as 0 | 1 | 2 | 3;
  const stageSpec = BANSUNG_SURVIVAL_STAGES[stageIdx];
  const stageStyle = SURVIVAL_STAGE_META[stageIdx];
  const stageSpan = Math.max(1, stageSpec.endSec - stageSpec.startSec);
  const stageElapsedS = clamp(cycleSec - stageSpec.startSec, 0, stageSpan);
  const stageRemS = Math.max(0, survival?.stageRemS ?? (stageSpec.endSec - cycleSec));

  return (
    <div
      className={['bs-survival-strip', hasBoss ? 'bs-survival-strip--under-boss' : ''].filter(Boolean).join(' ')}
      style={{ borderColor: stageStyle.color }}
      role="status"
      aria-label="Survival Cycle Timeline"
    >
      <div className="bs-survival-head">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              padding: '1px 5px',
              borderRadius: 3,
              background: '#1e2436',
              border: '1px solid #495057',
              color: '#fde047',
              fontSize: 9,
              fontWeight: 900,
            }}
          >
            Vòng {cycle + 1}
          </span>
          <span style={{ color: '#f8fafc' }}>{formatMatchClock(cycleSec * 1000)} / 20:00</span>
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '1px 6px',
            borderRadius: 3,
            background: 'rgba(18, 22, 34, 0.92)',
            border: `1px solid ${stageStyle.color}`,
            color: stageStyle.color,
            fontSize: 9,
            fontWeight: 900,
          }}
        >
          <span>{stageStyle.rangeLabel} {stageSpec.vnName}</span>
          <span style={{ color: '#e2e8f0' }}>{formatMatchClock(stageRemS * 1000)}</span>
        </span>
      </div>

      <div className="bs-survival-timeline">
        {BANSUNG_SURVIVAL_STAGES.map((stage) => {
          const meta = SURVIVAL_STAGE_META[stage.idx];
          const segSpan = Math.max(1, stage.endSec - stage.startSec);
          const fillPct =
            stage.idx < stageIdx
              ? 100
              : stage.idx > stageIdx
                ? 0
                : clamp(((cycleSec - stage.startSec) / segSpan) * 100, 0, 100);
          const isCurrent = stage.idx === stageIdx;
          return (
            <div
              key={stage.id}
              className="bs-survival-seg"
              style={{
                borderColor: isCurrent ? meta.color : '#2f3749',
                boxShadow: isCurrent ? `0 0 6px ${meta.color}55` : undefined,
              }}
              title={`${meta.rangeLabel}: ${stage.vnName}`}
            >
              <div
                className="bs-survival-seg-fill"
                style={{
                  width: `${fillPct}%`,
                  background: meta.color,
                  opacity: isCurrent ? 0.62 : 0.35,
                }}
              />
              <span
                className="bs-survival-seg-label"
                style={{ color: isCurrent ? '#ffffff' : stage.idx < stageIdx ? '#94a3b8' : '#64748b' }}
              >
                {meta.rangeLabel} {meta.shortLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface WavePingBannerProps {
  wave: number;
  wavePhase: BansungWavePhase;
  rem: number;
  pings: readonly BansungPingItem[];
  roster: readonly BansungPlayerInfo[];
  spectating?: BansungHudSnapshot['spectating'];
  suppressWaveNotice?: boolean;
}

/**
 * Displays wave transition / arc / siege banners, intermission countdown,
 * spectator notice, and active co-op ping toast notifications.
 */
export function WavePingBanner({
  wave,
  wavePhase,
  rem,
  pings,
  roster,
  spectating,
  suppressWaveNotice = false,
}: WavePingBannerProps) {
  const [bannerVisibleUntil, setBannerVisibleUntil] = useState(0);
  const [toastPing, setToastPing] = useState<BansungPingItem | null>(null);
  const lastWaveRef = useRef<{ wave: number; phase: BansungWavePhase } | null>(null);
  const lastPingIdRef = useRef(0);

  useEffect(() => {
    const prev = lastWaveRef.current;
    if (!prev || prev.wave !== wave || prev.phase !== wavePhase) {
      lastWaveRef.current = { wave, phase: wavePhase };
      setBannerVisibleUntil(Date.now() + 2800);
      const t = window.setTimeout(() => setBannerVisibleUntil(0), 2850);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [wave, wavePhase]);

  useEffect(() => {
    if (pings.length === 0) return;
    const latest = pings[pings.length - 1];
    if (latest.id !== lastPingIdRef.current) {
      lastPingIdRef.current = latest.id;
      setToastPing(latest);
      const t = window.setTimeout(() => setToastPing(null), 2400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [pings]);

  const waveSpec = getBansungWaveSpec(Math.max(1, wave));
  const siegeLabel = SIEGE_BADGES[waveSpec.siege];
  const now = Date.now();
  const showWaveBanner =
    !suppressWaveNotice &&
    (wavePhase === 'intermission' || wavePhase === 'perk_pick' || now < bannerVisibleUntil);

  const rosterName = (idx: number) => roster.find((r) => r.idx === idx)?.name ?? `P${idx + 1}`;
  const toastMeta = toastPing ? BANSUNG_PING_META[toastPing.kind] ?? BANSUNG_PING_META[BANSUNG_PING_HELP] : null;

  return (
    <>
      {showWaveBanner && (
        <div className="bs-wave-banner" role="status">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 900, letterSpacing: '0.08em' }}>
            <span style={{ color: wavePhase === 'boss' ? '#ff6b6b' : '#ffd43b' }}>
              WAVE {wave}
              {wave <= BANSUNG_TOTAL_WAVES ? `/${BANSUNG_TOTAL_WAVES}` : ' [ENDLESS]'}
            </span>
            <span style={{ color: '#a5d8ff' }}>· {WAVE_PHASE_LABELS[wavePhase]}</span>
            {siegeLabel && (
              <span style={{ padding: '1px 5px', borderRadius: 3, background: '#5f3dc4', color: '#f3f0ff', fontSize: 10 }}>
                {siegeLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: '#ced4da', fontWeight: 700 }}>
            {wavePhase === 'intermission'
              ? `NEXT WAVE IN ${Math.max(0, Math.ceil(rem))}s — SHOP & SUPPLY`
              : waveSpec.arc}
            {waveSpec.mutators && waveSpec.mutators.length > 0
              ? ` · ${waveSpec.mutators.join(', ')}`
              : ''}
          </div>
        </div>
      )}

      {toastPing && toastMeta && (
        <div className="bs-ping-toast" style={{ color: toastMeta.color }}>
          <span>[{toastMeta.symbol}]</span>
          <span>{rosterName(toastPing.ownerIdx)}:</span>
          <span>{toastMeta.label}</span>
        </div>
      )}

      {spectating?.active && (
        <div
          style={{
            position: 'absolute',
            bottom: 92,
            left: 12,
            padding: '4px 8px',
            borderRadius: 4,
            background: 'rgba(13, 15, 22, 0.85)',
            border: '1px solid #ffd43b',
            fontSize: 10,
            fontWeight: 700,
            color: '#ffe066',
          }}
        >
          <Eye size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-2px' }} />
          SPECTATING: {spectating.targetName}
          {spectating.canCycle ? ' · [TAB] / Click Squad' : ''}
        </div>
      )}
    </>
  );
}

export interface EdgeIndicatorsProps {
  pings: readonly BansungPingItem[];
  players: readonly SnapPlayer[];
  boss?: SnapBoss;
  myIdx?: number;
}

interface IndicatorBadge {
  key: string;
  edge: EdgeIndicatorResult;
  color: string;
  label: string;
}

/** Off-screen perimeter chevrons for co-op pings, downed teammates, and off-screen bosses. */
export function EdgeIndicators({ pings, players, boss, myIdx }: EdgeIndicatorsProps) {
  const [items, setItems] = useState<IndicatorBadge[]>([]);

  useEffect(() => {
    let rafId = 0;
    let lastSig = '';
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      const cam = bansungStore.cam;
      const vw = bansungStore.viewW;
      const vh = bansungStore.viewH;
      const now = performance.now();
      const next: IndicatorBadge[] = [];

      for (let i = 0; i < pings.length; i++) {
        const ping = pings[i];
        if (ping.expiresAt <= now) continue;
        const edge = clampEdgeIndicator(ping.x, ping.y, cam, vw, vh);
        if (!edge.visible) {
          const meta = BANSUNG_PING_META[ping.kind] ?? BANSUNG_PING_META[BANSUNG_PING_HELP];
          next.push({
            key: `ping-${ping.id}`,
            edge,
            color: meta.color,
            label: meta.symbol,
          });
        }
      }

      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        if (p.idx === myIdx || p.state !== BANSUNG_STATE_DOWNED) continue;
        const edge = clampEdgeIndicator(p.x, p.y, cam, vw, vh);
        if (!edge.visible) {
          next.push({
            key: `down-${p.idx}`,
            edge,
            color: '#ff6b6b',
            label: '+',
          });
        }
      }

      if (boss && boss.hp > 0) {
        const edge = clampEdgeIndicator(boss.x, boss.y, cam, vw, vh);
        if (!edge.visible) {
          next.push({
            key: `boss-${boss.id}`,
            edge,
            color: '#e03131',
            label: '!',
          });
        }
      }

      const sig = next
        .map((n) => `${n.key}:${Math.round(n.edge.x)}:${Math.round(n.edge.y)}:${Math.round(n.edge.angle * 20)}`)
        .join('|');
      if (sig !== lastSig) {
        lastSig = sig;
        setItems(next);
      }

      const hasLiveTracker =
        pings.some((p) => p.expiresAt > now) ||
        players.some((p) => p.idx !== myIdx && p.state === BANSUNG_STATE_DOWNED) ||
        Boolean(boss && boss.hp > 0);
      if (hasLiveTracker) {
        rafId = window.requestAnimationFrame(update);
      }
    };
    rafId = window.requestAnimationFrame(update);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [pings, players, boss, myIdx]);

  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => {
        const deg = (item.edge.angle * 180) / Math.PI;
        return (
          <div
            key={item.key}
            className="bs-edge-arrow"
            style={{ left: item.edge.x, top: item.edge.y, color: item.color }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `rotate(${deg}deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderLeft: `8px solid ${item.color}`,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 900,
                background: 'rgba(13, 15, 22, 0.85)',
                border: `1px solid ${item.color}`,
                borderRadius: 99,
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </>
  );
}

export interface LowHpVignetteProps {
  localPlayer?: SnapPlayer;
  me?: BansungPrivate;
  /** Optional timestamp (`Date.now()`) of recent downed status FX. */
  downedAt?: number;
}

/** Peripheral danger vignette: low HP (`<= 25%`), bleeding out (`DOWNED`), or `DEAD`. */
export function LowHpVignette({ localPlayer, me, downedAt = 0 }: LowHpVignetteProps) {
  if (!localPlayer) return null;
  const hero = getBansungHero(getHeroIdByIdx(localPlayer.heroIdx));
  const maxHp = me?.maxHp ?? Math.max(hero.hp * BANSUNG_HERO_STAT_SCALE, localPlayer.hp, 1);
  const ratio = localPlayer.hp / maxHp;
  const isDead = localPlayer.state === BANSUNG_STATE_DEAD;
  const isDowned = localPlayer.state === BANSUNG_STATE_DOWNED;
  const isLow = !isDead && !isDowned && localPlayer.hp > 0 && ratio <= 0.25;

  if (!isDead && !isDowned && !isLow) return null;

  const cls = [
    'bs-vignette',
    isDowned ? 'bs-vignette--downed' : isDead ? 'bs-vignette--dead' : 'bs-vignette--low',
  ].join(' ');

  return (
    <div className={cls} data-downed-at={downedAt || undefined}>
      {isDowned && (
        <div
          style={{
            position: 'absolute',
            top: '22%',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 10px',
            background: 'rgba(130, 12, 22, 0.78)',
            border: '1px solid #ff8787',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.06em',
            color: '#fff5f5',
          }}
        >
          <Heart size={11} style={{ display: 'inline', marginRight: 5, verticalAlign: '-2px' }} />
          NGÃ GỤC — ĐỒNG ĐỘI CÓ THỂ CỨU
          {localPlayer.revivePct > 0 ? ` (${Math.round(localPlayer.revivePct)}%)` : ''}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 8. Composite HudBars Export
// ============================================================================

export interface HudBarsProps {
  /** Optional authoritative room view (reserved for spectator / lobby fallbacks). */
  view?: BansungRoomView;
  /** Optional local player id. */
  meId?: string;
  /** Floating dock element rendered in top-right utility row. */
  dock?: ReactNode;
  unreadChat?: number;
  chatOpen?: boolean;
  guideOpen?: boolean;
  shopOpen?: boolean;
  ended?: boolean;
  onToggleShop?: () => void;
  onToggleChat?: () => void;
  onToggleGuide?: () => void;
  onLeave?: () => void;
  onPing?: (kind: BansungPingKind, x: number, y: number) => void;
  onSpectate?: (idx: number) => void;
  /** External timestamp (`Date.now()`) when local dry-fire occurs on empty energy. */
  dryFireAt?: number;
  /** External timestamp (`Date.now()`) when active reload hits sweet spot. */
  reloadPerfectedAt?: number;
  className?: string;
}

/**
 * Full `ban_sung` HUD overlay reading 15Hz state from `useBansungHud()` and
 * rendering the 60Hz canvas minimap directly against `bansungStore`.
 */
export function HudBars({
  view,
  dock,
  unreadChat = 0,
  chatOpen = false,
  guideOpen = false,
  shopOpen = false,
  ended = false,
  onToggleShop,
  onToggleChat,
  onToggleGuide,
  onLeave,
  onPing,
  onSpectate,
  dryFireAt = 0,
  reloadPerfectedAt = 0,
  className,
}: HudBarsProps) {
  const snapshot = useBansungHud();
  const [fxReloadPerfectedAt, setFxReloadPerfectedAt] = useState(0);
  const [fxDownedAt, setFxDownedAt] = useState(0);
  const [fxLevelUpAt, setFxLevelUpAt] = useState(0);

  useEffect(() => {
    ensureHudStyles();
  }, []);

  useEffect(() => {
    return bansungStore.onFx((events: readonly SnapFxEvent[]) => {
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.type !== FX_STATUS) continue;
        const statusKind = ev.b;
        const myIdx = bansungStore.myIdx;
        if (statusKind === BANSUNG_FX_STATUS_RELOAD_PERFECT && (myIdx === undefined || ev.a === myIdx)) {
          setFxReloadPerfectedAt(Date.now());
        } else if (statusKind === BANSUNG_FX_STATUS_DOWNED && (myIdx === undefined || ev.a === myIdx)) {
          setFxDownedAt(Date.now());
        } else if (
          (statusKind === BANSUNG_FX_STATUS_LEVELUP || statusKind === BANSUNG_FX_STATUS_GACHA) &&
          (myIdx === undefined || ev.a === myIdx)
        ) {
          setFxLevelUpAt(Date.now());
        }
      }
    });
  }, []);

  const effectiveReloadPerfectedAt = Math.max(reloadPerfectedAt, fxReloadPerfectedAt);
  const isSurvival = resolveIsSurvivalMode(snapshot, view);

  return (
    <div className={['bs-hud-root', className ?? ''].filter(Boolean).join(' ')}>
      {!ended && (
        <LowHpVignette
          localPlayer={snapshot.localPlayer}
          me={snapshot.me}
          downedAt={fxDownedAt}
        />
      )}

      <EdgeIndicators
        pings={snapshot.pings}
        players={snapshot.players}
        boss={snapshot.boss}
        myIdx={snapshot.myIdx}
      />

      <TopLeftHud
        snapshot={snapshot}
        view={view}
        dryFireAt={dryFireAt}
        reloadPerfectedAt={effectiveReloadPerfectedAt}
        levelUpAt={fxLevelUpAt}
        onSpectate={onSpectate}
      />

      <BossHudBar boss={snapshot.boss} bosses={snapshot.bosses} />

      <TopRightUtility
        perks={snapshot.me?.perks}
        dock={dock}
        unreadChat={unreadChat}
        chatOpen={chatOpen}
        guideOpen={guideOpen}
        shopOpen={shopOpen}
        disableMinimapHotkey={guideOpen || shopOpen || ended}
        onToggleShop={onToggleShop}
        onToggleChat={onToggleChat}
        onToggleGuide={onToggleGuide}
        onLeave={onLeave}
        onPing={onPing}
      />

      {!ended && (
        <WavePingBanner
          wave={snapshot.wave}
          wavePhase={snapshot.wavePhase}
          rem={snapshot.rem}
          pings={snapshot.pings}
          roster={snapshot.roster}
          spectating={snapshot.spectating}
          suppressWaveNotice={isSurvival}
        />
      )}
    </div>
  );
}

export default HudBars;
