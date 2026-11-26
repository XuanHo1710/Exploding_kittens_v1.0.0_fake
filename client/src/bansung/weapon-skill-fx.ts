/**
 * client/src/bansung/weapon-skill-fx.ts — hiệu ứng skill súng + nội tại (spec 007 · C).
 *
 * Đã được nối sẵn trong render.ts:
 *  - processBansungFxEvents → onWeaponSkillFxEvent() cho FX_STATUS sub-kind 18..21
 *      tuple [5, playerIdx, kind, weaponIdx, x, y]  (evt.a, evt.b, evt.c, evt.d, evt.e)
 *  - renderBansungScene → stepWeaponSkillFx() mỗi frame
 *  - PASS 1 (mặt đất)        → drawWeaponSkillFxGround()   — vòng cảnh báo, vũng dung nham, hố đen, mìn
 *  - PASS 4 (thế giới)       → drawWeaponSkillFxWorld()    — bóng lướt, lưỡi xoay, đạn pháo rơi
 *  - PASS 5 (additive)       → drawWeaponSkillFxAdditive() — quầng sáng + lõi (ban ngày)
 *  - PASS 5c (sau lớp đêm)   → drawWeaponSkillFxOverNight() — lõi sáng luôn nhìn thấy trong đêm
 *  - clearBansungRenderCaches → resetWeaponSkillFx()
 *
 * Mỗi khẩu súng có một "công thức" hình ảnh (RECIPE) + màu lấy từ getWeaponSkillSpec(weaponId).color,
 * tầm từ spec.rangePx và thời lượng từ spec.durationMs. Toàn bộ dùng pool cấp phát sẵn — không cấp
 * phát trong vòng lặp vẽ.
 */
import { getWeaponByIdx, type BansungWeaponId } from '../../../shared/src';
import { getWeaponSkillSpec } from '../../../shared/src/bansung/weapon-skills/index';
import {
  BANSUNG_FX_STATUS_WSKILL_CAST,
  BANSUNG_FX_STATUS_WSKILL_END,
  BANSUNG_FX_STATUS_WSKILL_IMPACT,
  BANSUNG_FX_STATUS_WSKILL_PASSIVE,
} from '../../../shared/src/bansung/weapon-skills/types';
import { bansungFx } from './particles';
import type { BansungStore, SnapFxEvent } from './store';
import { getWeaponFxProfile } from './weapon-fx-profiles';

export interface WeaponSkillFxView {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WeaponSkillFxEventCtx {
  store: BansungStore;
  nowMs: number;
  viewerPos: { x: number; y: number };
  reducedFlash: boolean;
}

// ============================================================================
// Công thức hình ảnh theo từng súng
// ============================================================================

const R_NOVA = 0; // vòng nổ năng lượng quanh người
const R_CONE = 1; // nón lửa / plasma / băng theo hướng ngắm
const R_BEAM = 2; // tia xuyên dài
const R_STRIKE = 3; // vòng cảnh báo tại con trỏ → nổ
const R_FROST = 4; // vòng băng có gai + lớp băng mặt đất
const R_CHAIN = 5; // sét lan nhiều mục tiêu
const R_SINGULARITY = 6; // hố đen xoáy
const R_DASH = 7; // lướt + bóng mờ
const R_AURA = 8; // hào quang cường hoá bám theo người
const R_SPIN = 9; // lưỡi xoay quanh người
const R_MINES = 10; // bãi mìn
const R_TIMEFIELD = 11; // vùng làm chậm thời gian
const R_POOL = 12; // vũng dung nham
const R_VOLLEY = 13; // loạt bắn hình quạt
const R_SHOCK = 14; // vòm sốc điện
const R_ORBITAL = 15; // pháo quỹ đạo: cảnh báo + cột sáng từ trời

const RECIPE_BY_WEAPON: Readonly<Record<BansungWeaponId, number>> = {
  pistol: R_VOLLEY,
  rifle: R_AURA,
  smg: R_AURA,
  shotgun: R_CONE,
  sniper_rifle: R_BEAM,
  dual_pistols: R_VOLLEY,
  minigun: R_AURA,
  saw_launcher: R_SPIN,
  plasma_shotgun: R_CONE,
  twin_smg: R_VOLLEY,
  ricochet_disc: R_SPIN,
  phantom_bow: R_VOLLEY,
  grenade_launcher: R_STRIKE,
  stun_launcher: R_SHOCK,
  bazooka: R_STRIKE,
  mine_gun: R_MINES,
  cluster_rpg: R_STRIKE,
  orbital_cannon: R_ORBITAL,
  plasma_rifle: R_NOVA,
  railgun: R_BEAM,
  lightning_staff: R_CHAIN,
  arcane_book: R_NOVA,
  laser_cannon: R_BEAM,
  electric_gun: R_CHAIN,
  flamethrower: R_CONE,
  cryo_cannon: R_FROST,
  gravity_gun: R_SINGULARITY,
  ion_beam: R_BEAM,
  tesla_coil: R_CHAIN,
  void_cannon: R_SINGULARITY,
  blizzard_carbine: R_FROST,
  magma_spitter: R_POOL,
  chronos_rifle: R_TIMEFIELD,
  crescent_blade: R_DASH,
  reaper_scythe: R_SPIN,
  shock_baton: R_SHOCK,
};

/** Công thức dự phòng theo `kind` của skill (khi nhóm súng đổi thiết kế). */
function recipeFromKind(kind: string): number {
  switch (kind) {
    case 'beam':
      return R_BEAM;
    case 'zone':
      return R_POOL;
    case 'summon':
      return R_MINES;
    case 'dash':
      return R_DASH;
    case 'barrage':
      return R_VOLLEY;
    case 'buff':
      return R_AURA;
    default:
      return R_NOVA;
  }
}

/** Các công thức "bám" theo người chơi trong suốt thời lượng skill. */
function isFollowRecipe(r: number): boolean {
  return r === R_AURA || r === R_SPIN || r === R_CONE || r === R_BEAM || r === R_DASH;
}

// ============================================================================
// Pool
// ============================================================================

const MAX_EFFECTS = 96;
const MAX_GHOSTS = 64;
const MAX_POINTS = 6;
const HERO_CHEST_LIFT = 18;
const TWO_PI = Math.PI * 2;

const PH_CAST = 0;
const PH_IMPACT = 1;
const PH_END = 2;
const PH_PASSIVE = 3;

interface SkillFx {
  active: boolean;
  recipe: number;
  phase: number;
  playerIdx: number;
  weaponIdx: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  angle: number;
  range: number;
  ageMs: number;
  ttlMs: number;
  color: string;
  seed: number;
  follow: boolean;
  /** Thời gian dư của pha "đang chạy" trước khi tắt dần (ms). */
  fadeMs: number;
  nPts: number;
  px: Float32Array;
  py: Float32Array;
  ghostAccMs: number;
}

interface Ghost {
  active: boolean;
  x: number;
  y: number;
  ageMs: number;
  ttlMs: number;
  color: string;
  facing: number;
}

const effects: SkillFx[] = [];
const ghosts: Ghost[] = [];
let effectHead = 0;
let ghostHead = 0;
for (let i = 0; i < MAX_EFFECTS; i++) {
  effects.push({
    active: false,
    recipe: 0,
    phase: 0,
    playerIdx: -1,
    weaponIdx: -1,
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    angle: 0,
    range: 100,
    ageMs: 0,
    ttlMs: 300,
    color: '#ffffff',
    seed: 1,
    follow: false,
    fadeMs: 180,
    nPts: 0,
    px: new Float32Array(MAX_POINTS),
    py: new Float32Array(MAX_POINTS),
    ghostAccMs: 0,
  });
}
for (let i = 0; i < MAX_GHOSTS; i++) {
  ghosts.push({ active: false, x: 0, y: 0, ageMs: 0, ttlMs: 260, color: '#ffffff', facing: 0 });
}

let storeRef: BansungStore | null = null;
let reducedFlashOn = false;
let seedState = 0x2f6b1d;
/** Chống spam nội tại: mốc thời gian proc gần nhất theo người chơi. */
const lastPassiveAt = new Float64Array(16);

const DASH_TELEGRAPH: number[] = [7, 6];
const DASH_FINE: number[] = [3, 4];
const NO_DASH: number[] = [];
const SPARK_OPTS: { colorIdx?: number } = { colorIdx: 0 };

function nextSeed(): number {
  seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0;
  return seedState;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function allocEffect(): SkillFx {
  // Ưu tiên slot trống; nếu đầy thì ghi đè vòng tròn
  for (let n = 0; n < MAX_EFFECTS; n++) {
    const idx = (effectHead + n) % MAX_EFFECTS;
    if (!effects[idx].active) {
      effectHead = (idx + 1) % MAX_EFFECTS;
      return effects[idx];
    }
  }
  const e = effects[effectHead];
  effectHead = (effectHead + 1) % MAX_EFFECTS;
  return e;
}

function spawnGhost(x: number, y: number, color: string, facing: number): void {
  const g = ghosts[ghostHead];
  ghostHead = (ghostHead + 1) % MAX_GHOSTS;
  g.active = true;
  g.x = x;
  g.y = y;
  g.ageMs = 0;
  g.ttlMs = 280;
  g.color = color;
  g.facing = facing;
}

function sparks(x: number, y: number, ang: number, scale: number, colorIdx: number): void {
  SPARK_OPTS.colorIdx = colorIdx;
  bansungFx.spawnBurst('sparks', x, y, ang, scale, SPARK_OPTS);
}

function playerPos(idx: number, out: { x: number; y: number; aim: number }): boolean {
  const st = storeRef;
  if (!st) return false;
  const p = st.players.get(idx);
  if (!p) return false;
  out.x = p.x;
  out.y = p.y - HERO_CHEST_LIFT;
  out.aim = idx === st.myIdx ? st.localAimRad : p.aim;
  return true;
}
const POS = { x: 0, y: 0, aim: 0 };

// ============================================================================
// Sự kiện
// ============================================================================

/** Nhận sự kiện skill súng từ server (cast / impact / end / passive). */
export function onWeaponSkillFxEvent(evt: SnapFxEvent, ctx: WeaponSkillFxEventCtx): void {
  storeRef = ctx.store;
  reducedFlashOn = ctx.reducedFlash;
  const sub = evt.b | 0;
  const playerIdx = evt.a | 0;
  const weaponIdx = evt.c | 0;
  const ex = evt.d;
  const ey = evt.e;
  const w = getWeaponByIdx(weaponIdx);
  if (!w) return;
  const spec = getWeaponSkillSpec(w.id);
  const profile = getWeaponFxProfile(w.id);
  const recipe = RECIPE_BY_WEAPON[w.id] ?? recipeFromKind(spec.kind);
  const color = spec.color || profile.tint;
  const range = clamp(spec.rangePx > 0 ? spec.rangePx : 180, 40, 1400);

  const havePlayer = playerPos(playerIdx, POS);
  const ox = havePlayer ? POS.x : ex;
  const oy = havePlayer ? POS.y : ey - HERO_CHEST_LIFT;
  const aim = havePlayer ? POS.aim : 0;

  if (sub === BANSUNG_FX_STATUS_WSKILL_CAST) {
    spawnCast(recipe, playerIdx, weaponIdx, ox, oy, aim, ex, ey, range, spec.durationMs, color, profile.sparkColor);
    return;
  }
  if (sub === BANSUNG_FX_STATUS_WSKILL_IMPACT) {
    spawnImpact(recipe, playerIdx, weaponIdx, ox, oy, ex, ey, range, color, profile.sparkColor);
    return;
  }
  if (sub === BANSUNG_FX_STATUS_WSKILL_END) {
    // Tắt dần các hiệu ứng đang bám theo người chơi này
    for (let i = 0; i < MAX_EFFECTS; i++) {
      const e = effects[i];
      if (!e.active || e.playerIdx !== playerIdx || e.weaponIdx !== weaponIdx) continue;
      if (e.phase !== PH_CAST) continue;
      if (e.ttlMs - e.ageMs > e.fadeMs) e.ttlMs = e.ageMs + e.fadeMs;
    }
    const f = allocEffect();
    initEffect(f, R_NOVA, PH_END, playerIdx, weaponIdx, ex, ey - HERO_CHEST_LIFT, aim, 46, 260, color);
    return;
  }
  if (sub === BANSUNG_FX_STATUS_WSKILL_PASSIVE) {
    const slot = playerIdx & 15;
    const now = ctx.nowMs;
    if (now - lastPassiveAt[slot] < 120) return;
    lastPassiveAt[slot] = now;
    const f = allocEffect();
    initEffect(f, recipe, PH_PASSIVE, playerIdx, weaponIdx, ex, ey - HERO_CHEST_LIFT * 0.5, aim, 26, 300, color);
    sparks(ex, ey - 8, -Math.PI / 2, 0.55, profile.sparkColor);
  }
}

function initEffect(
  f: SkillFx,
  recipe: number,
  phase: number,
  playerIdx: number,
  weaponIdx: number,
  x: number,
  y: number,
  angle: number,
  range: number,
  ttlMs: number,
  color: string,
): void {
  f.active = true;
  f.recipe = recipe;
  f.phase = phase;
  f.playerIdx = playerIdx;
  f.weaponIdx = weaponIdx;
  f.x = x;
  f.y = y;
  f.tx = x;
  f.ty = y;
  f.angle = angle;
  f.range = range;
  f.ageMs = 0;
  f.ttlMs = Math.max(60, ttlMs);
  f.color = color;
  f.seed = nextSeed();
  f.follow = false;
  f.fadeMs = 180;
  f.nPts = 0;
  f.ghostAccMs = 0;
}

function spawnCast(
  recipe: number,
  playerIdx: number,
  weaponIdx: number,
  ox: number,
  oy: number,
  aim: number,
  ex: number,
  ey: number,
  range: number,
  durationMs: number,
  color: string,
  sparkColor: number,
): void {
  const f = allocEffect();
  // Nếu server gửi toạ độ cách xa người chơi → đó là điểm mục tiêu (con trỏ)
  const dxT = ex - ox;
  const dyT = ey - (oy + HERO_CHEST_LIFT);
  const hasTarget = dxT * dxT + dyT * dyT > 48 * 48;
  const tx = hasTarget ? ex : ox + Math.cos(aim) * Math.min(range, 320);
  const ty = hasTarget ? ey : oy + HERO_CHEST_LIFT + Math.sin(aim) * Math.min(range, 320);
  const dur = durationMs > 0 ? durationMs : 0;

  switch (recipe) {
    case R_STRIKE:
    case R_ORBITAL: {
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, tx, ty, aim, clamp(range * 0.35, 60, 220), recipe === R_ORBITAL ? 1100 : 750, color);
      break;
    }
    case R_SINGULARITY:
    case R_TIMEFIELD:
    case R_POOL: {
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, tx, ty, aim, clamp(range * 0.45, 70, 240), Math.max(1200, dur || 2600), color);
      f.fadeMs = 320;
      break;
    }
    case R_MINES: {
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, tx, ty, aim, clamp(range * 0.35, 50, 160), Math.max(2500, dur || 6000), color);
      f.nPts = MAX_POINTS;
      for (let i = 0; i < MAX_POINTS; i++) {
        const a = (i / MAX_POINTS) * TWO_PI + ((f.seed >>> (i * 2)) & 3) * 0.2;
        const r = f.range * (0.35 + ((f.seed >>> (i * 3)) & 7) / 12);
        f.px[i] = tx + Math.cos(a) * r;
        f.py[i] = ty + Math.sin(a) * r * 0.7;
      }
      break;
    }
    case R_CHAIN: {
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, ox, oy, aim, Math.min(range, 420), 360, color);
      buildChainPoints(f, ox, oy, aim, Math.min(range, 420));
      break;
    }
    case R_FROST:
    case R_SHOCK:
    case R_NOVA: {
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, ox, oy + HERO_CHEST_LIFT * 0.5, aim, clamp(range * 0.6, 60, 260), recipe === R_FROST ? 1600 : 520, color);
      break;
    }
    case R_VOLLEY: {
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, ox, oy, aim, Math.min(range, 380), 300, color);
      break;
    }
    case R_DASH: {
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, ox, oy, aim, Math.min(range, 260), Math.max(360, dur || 420), color);
      f.follow = true;
      break;
    }
    default: {
      // AURA / SPIN / CONE / BEAM bám theo người trong suốt thời lượng
      const baseTtl = recipe === R_BEAM ? 320 : recipe === R_CONE ? 520 : 1400;
      const ttl = dur > 0 ? dur + 120 : baseTtl;
      const r =
        recipe === R_SPIN
          ? clamp(range * 0.35, 44, 120)
          : recipe === R_AURA
            ? 30
            : recipe === R_CONE
              ? clamp(range, 90, 320)
              : clamp(range, 200, 1400);
      initEffect(f, recipe, PH_CAST, playerIdx, weaponIdx, ox, oy, aim, r, ttl, color);
      f.follow = isFollowRecipe(recipe);
      f.tx = tx;
      f.ty = ty;
      break;
    }
  }
  f.tx = recipe === R_STRIKE || recipe === R_ORBITAL || recipe === R_SINGULARITY || recipe === R_TIMEFIELD || recipe === R_POOL || recipe === R_MINES ? f.x : f.tx;
  f.ty = recipe === R_STRIKE || recipe === R_ORBITAL || recipe === R_SINGULARITY || recipe === R_TIMEFIELD || recipe === R_POOL || recipe === R_MINES ? f.y : f.ty;

  // Tia lửa khai skill ở người chơi
  sparks(ox, oy, aim, recipe === R_AURA ? 0.7 : 1, sparkColor);
}

function buildChainPoints(f: SkillFx, ox: number, oy: number, aim: number, range: number): void {
  // Điểm nhảy giả lập: zig-zag tiến về hướng ngắm (server gửi IMPACT tại mục tiêu thật)
  let s = f.seed;
  let cx = ox;
  let cy = oy;
  f.nPts = 4;
  for (let i = 0; i < f.nPts; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const a = aim + (((s >>> 9) % 100) / 100 - 0.5) * 1.3;
    const step = range * (0.22 + ((s >>> 17) % 10) / 60);
    cx += Math.cos(a) * step;
    cy += Math.sin(a) * step;
    f.px[i] = cx;
    f.py[i] = cy;
  }
}

function spawnImpact(
  recipe: number,
  playerIdx: number,
  weaponIdx: number,
  ox: number,
  oy: number,
  ex: number,
  ey: number,
  range: number,
  color: string,
  sparkColor: number,
): void {
  // Kết thúc sớm vòng cảnh báo tương ứng (nếu có)
  for (let i = 0; i < MAX_EFFECTS; i++) {
    const e = effects[i];
    if (!e.active || e.phase !== PH_CAST || e.playerIdx !== playerIdx || e.weaponIdx !== weaponIdx) continue;
    if (e.recipe === R_STRIKE || e.recipe === R_ORBITAL) {
      const dx = e.x - ex;
      const dy = e.y - ey;
      if (dx * dx + dy * dy < 220 * 220) e.ttlMs = Math.min(e.ttlMs, e.ageMs + 60);
    }
  }
  const f = allocEffect();
  const r =
    recipe === R_STRIKE || recipe === R_ORBITAL
      ? clamp(range * 0.35, 60, 220)
      : recipe === R_SINGULARITY
        ? clamp(range * 0.4, 60, 200)
        : clamp(range * 0.2, 36, 120);
  initEffect(f, recipe, PH_IMPACT, playerIdx, weaponIdx, ex, ey, 0, r, recipe === R_ORBITAL ? 620 : 420, color);
  if (recipe === R_CHAIN || recipe === R_BEAM) {
    // Tia từ người chơi tới điểm trúng
    f.tx = ox;
    f.ty = oy;
    if (recipe === R_CHAIN) {
      f.nPts = 3;
      let s = f.seed;
      for (let i = 0; i < 3; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        const a = ((s >>> 8) % 628) / 100;
        const d = 40 + ((s >>> 18) % 60);
        f.px[i] = ex + Math.cos(a) * d;
        f.py[i] = ey + Math.sin(a) * d;
      }
    }
  }
  const scale = recipe === R_ORBITAL ? 2.2 : recipe === R_STRIKE || recipe === R_SINGULARITY ? 1.6 : 1;
  sparks(ex, ey, Math.atan2(ey - oy, ex - ox), scale, sparkColor);
  if (recipe === R_STRIKE || recipe === R_ORBITAL) {
    bansungFx.spawnBurst('smoke', ex, ey, 0, scale * 0.8);
  }
}

// ============================================================================
// Bước thời gian
// ============================================================================

export function stepWeaponSkillFx(dtMs: number, _nowMs: number): void {
  const dt = dtMs > 100 ? 100 : dtMs < 0 ? 0 : dtMs;
  for (let i = 0; i < MAX_EFFECTS; i++) {
    const e = effects[i];
    if (!e.active) continue;
    e.ageMs += dt;
    if (e.ageMs >= e.ttlMs) {
      e.active = false;
      continue;
    }
    if (e.follow && e.phase === PH_CAST && playerPos(e.playerIdx, POS)) {
      e.x = POS.x;
      e.y = POS.y;
      e.angle = POS.aim;
      if (e.recipe === R_DASH) {
        e.ghostAccMs += dt;
        while (e.ghostAccMs >= 34) {
          e.ghostAccMs -= 34;
          spawnGhost(POS.x, POS.y + HERO_CHEST_LIFT, e.color, POS.aim);
        }
      }
    }
  }
  for (let i = 0; i < MAX_GHOSTS; i++) {
    const g = ghosts[i];
    if (!g.active) continue;
    g.ageMs += dt;
    if (g.ageMs >= g.ttlMs) g.active = false;
  }
}

// ============================================================================
// Vẽ
// ============================================================================

function inView(view: WeaponSkillFxView, x: number, y: number, margin: number): boolean {
  return x >= view.x0 - margin && x <= view.x1 + margin && y >= view.y0 - margin && y <= view.y1 + margin;
}

function lifeT(e: SkillFx): number {
  return clamp(e.ageMs / e.ttlMs, 0, 1);
}

/** Độ mờ dần ở cuối đời + bật nhanh ở đầu. */
function envelope(e: SkillFx): number {
  const inA = clamp(e.ageMs / 70, 0, 1);
  const rem = e.ttlMs - e.ageMs;
  const outA = clamp(rem / Math.max(60, e.fadeMs), 0, 1);
  return inA * outA;
}

function effMargin(e: SkillFx): number {
  return e.recipe === R_BEAM ? e.range + 40 : e.range + 60;
}

function strokeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, squash: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, r), Math.max(0.5, r * squash), 0, 0, TWO_PI);
  ctx.stroke();
}

function fillCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, squash: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, r), Math.max(0.5, r * squash), 0, 0, TWO_PI);
  ctx.fill();
}

function jaggedLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
  amp: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = -dy / len;
  const ny = dx / len;
  const segs = clamp((len / 18) | 0, 3, 14);
  let s = seed >>> 0;
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const t = i / segs;
    const off = (((s >>> 10) % 1000) / 1000 - 0.5) * 2 * amp;
    ctx.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
  }
  ctx.lineTo(x1, y1);
}

/** PASS 1 — mặt đất: vòng cảnh báo, vùng hiệu ứng, bãi mìn, vết băng. */
export function drawWeaponSkillFxGround(ctx: CanvasRenderingContext2D, view: WeaponSkillFxView, nowMs: number): void {
  let any = false;
  for (let i = 0; i < MAX_EFFECTS; i++) {
    const e = effects[i];
    if (!e.active || !inView(view, e.x, e.y, effMargin(e))) continue;
    const r = e.recipe;
    if (
      e.phase !== PH_CAST ||
      !(r === R_STRIKE || r === R_ORBITAL || r === R_SINGULARITY || r === R_TIMEFIELD || r === R_POOL || r === R_MINES || r === R_FROST)
    ) {
      continue;
    }
    if (!any) {
      ctx.save();
      any = true;
    }
    const a = envelope(e);
    const t = lifeT(e);
    ctx.globalCompositeOperation = 'source-over';
    switch (r) {
      case R_STRIKE:
      case R_ORBITAL: {
        // Vòng cảnh báo nét đứt + vòng trong co lại báo thời điểm nổ
        ctx.globalAlpha = 0.16 * a;
        ctx.fillStyle = e.color;
        fillCircle(ctx, e.x, e.y, e.range, 0.6);
        ctx.globalAlpha = 0.85 * a;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(DASH_TELEGRAPH);
        ctx.lineDashOffset = -(nowMs * 0.03) % 13;
        strokeCircle(ctx, e.x, e.y, e.range, 0.6);
        ctx.setLineDash(NO_DASH);
        ctx.lineWidth = 3;
        strokeCircle(ctx, e.x, e.y, e.range * (1 - t), 0.6);
        // tâm chữ thập
        ctx.fillStyle = e.color;
        ctx.fillRect(Math.round(e.x - 7), Math.round(e.y - 1), 14, 2);
        ctx.fillRect(Math.round(e.x - 1), Math.round(e.y - 5), 2, 10);
        break;
      }
      case R_SINGULARITY: {
        ctx.globalAlpha = 0.55 * a;
        ctx.fillStyle = '#0b0614';
        fillCircle(ctx, e.x, e.y, e.range * 0.42, 0.62);
        ctx.globalAlpha = 0.5 * a;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(DASH_FINE);
        ctx.lineDashOffset = (nowMs * 0.06) % 7;
        strokeCircle(ctx, e.x, e.y, e.range, 0.62);
        ctx.setLineDash(NO_DASH);
        break;
      }
      case R_TIMEFIELD: {
        ctx.globalAlpha = 0.14 * a;
        ctx.fillStyle = e.color;
        fillCircle(ctx, e.x, e.y, e.range, 0.62);
        ctx.globalAlpha = 0.7 * a;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        strokeCircle(ctx, e.x, e.y, e.range, 0.62);
        // 12 vạch đồng hồ + kim quay
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * TWO_PI;
          const cx = e.x + Math.cos(ang) * e.range * 0.88;
          const cy = e.y + Math.sin(ang) * e.range * 0.88 * 0.62;
          ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 3, 3);
        }
        const hand = nowMs * 0.0025;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(hand) * e.range * 0.7, e.y + Math.sin(hand) * e.range * 0.7 * 0.62);
        ctx.stroke();
        break;
      }
      case R_POOL: {
        ctx.globalAlpha = 0.6 * a;
        ctx.fillStyle = '#3b0d02';
        fillCircle(ctx, e.x, e.y, e.range, 0.58);
        ctx.globalAlpha = 0.75 * a;
        ctx.fillStyle = e.color;
        fillCircle(ctx, e.x, e.y, e.range * (0.78 + 0.04 * Math.sin(nowMs * 0.006)), 0.5);
        ctx.fillStyle = '#ffd8a8';
        for (let k = 0; k < 5; k++) {
          const ph = nowMs * 0.002 + k * 1.7 + (e.seed & 15);
          const bx = e.x + Math.cos(ph * 1.3 + k) * e.range * 0.5;
          const by = e.y + Math.sin(ph + k * 2) * e.range * 0.28;
          const br = 2 + ((Math.sin(ph * 3) + 1) * 1.5) | 0;
          ctx.fillRect(Math.round(bx - br * 0.5), Math.round(by - br * 0.5), br, br);
        }
        break;
      }
      case R_MINES: {
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1;
        for (let k = 0; k < e.nPts; k++) {
          const blink = ((nowMs / 260 + k) | 0) % 2 === 0;
          ctx.globalAlpha = a;
          ctx.fillStyle = '#1b1726';
          ctx.fillRect(Math.round(e.px[k] - 5), Math.round(e.py[k] - 3), 10, 6);
          ctx.fillStyle = blink ? '#ffffff' : e.color;
          ctx.fillRect(Math.round(e.px[k] - 1), Math.round(e.py[k] - 2), 3, 3);
          ctx.globalAlpha = 0.35 * a;
          strokeCircle(ctx, e.px[k], e.py[k], 22, 0.6);
        }
        break;
      }
      case R_FROST: {
        // Lớp băng mặt đất loang ra rồi tan
        ctx.globalAlpha = 0.28 * a;
        ctx.fillStyle = e.color;
        fillCircle(ctx, e.x, e.y, e.range * clamp(e.ageMs / 220, 0, 1), 0.6);
        break;
      }
      default:
        break;
    }
  }
  if (any) ctx.restore();
}

/** PASS 4 — thế giới: bóng lướt, lưỡi xoay, đạn pháo rơi. */
export function drawWeaponSkillFxWorld(ctx: CanvasRenderingContext2D, view: WeaponSkillFxView, nowMs: number): void {
  let any = false;
  for (let i = 0; i < MAX_GHOSTS; i++) {
    const g = ghosts[i];
    if (!g.active || !inView(view, g.x, g.y, 40)) continue;
    if (!any) {
      ctx.save();
      any = true;
    }
    const a = 1 - g.ageMs / g.ttlMs;
    ctx.globalAlpha = 0.45 * a;
    ctx.fillStyle = g.color;
    // bóng người cách điệu (thân + đầu) có viền mực dự án
    ctx.fillRect(Math.round(g.x - 6), Math.round(g.y - 30), 12, 22);
    ctx.fillRect(Math.round(g.x - 5), Math.round(g.y - 40), 10, 9);
    ctx.globalAlpha = 0.25 * a;
    ctx.fillStyle = '#1b1726';
    ctx.fillRect(Math.round(g.x - 7), Math.round(g.y - 8), 14, 3);
  }
  for (let i = 0; i < MAX_EFFECTS; i++) {
    const e = effects[i];
    if (!e.active || !inView(view, e.x, e.y, effMargin(e))) continue;
    if (e.phase === PH_CAST && e.recipe === R_ORBITAL) {
      // Đạn pháo rơi từ trời xuống (đổ bóng nhỏ dần)
      const t = lifeT(e);
      if (!any) {
        ctx.save();
        any = true;
      }
      const h = (1 - t) * 420;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#1b1726';
      ctx.fillRect(Math.round(e.x - 4), Math.round(e.y - h - 14), 8, 16);
      ctx.fillStyle = e.color;
      ctx.fillRect(Math.round(e.x - 2), Math.round(e.y - h - 12), 4, 12);
      ctx.globalAlpha = 0.35 + 0.4 * t;
      ctx.fillStyle = '#000000';
      fillCircle(ctx, e.x, e.y, 6 + 10 * t, 0.5);
    } else if (e.phase === PH_CAST && e.recipe === R_SPIN) {
      if (!any) {
        ctx.save();
        any = true;
      }
      const a = envelope(e);
      const rot = nowMs * 0.012 + (e.seed & 31);
      ctx.globalAlpha = 0.95 * a;
      for (let k = 0; k < 3; k++) {
        const ang = rot + (k / 3) * TWO_PI;
        const bx = e.x + Math.cos(ang) * e.range;
        const by = e.y + Math.sin(ang) * e.range * 0.62;
        ctx.save();
        ctx.translate(Math.round(bx), Math.round(by));
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = '#1b1726';
        ctx.fillRect(-9, -3, 18, 6);
        ctx.fillStyle = e.color;
        ctx.fillRect(-8, -2, 16, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-8, -2, 16, 1);
        ctx.restore();
      }
    }
  }
  if (any) ctx.restore();
}

/** Vẽ phần sáng của một hiệu ứng. `core` = chỉ vẽ lõi mảnh (dùng sau lớp đêm). */
function drawLit(ctx: CanvasRenderingContext2D, e: SkillFx, nowMs: number, core: boolean): void {
  const a = envelope(e) * (reducedFlashOn ? 0.6 : 1);
  if (a <= 0.01) return;
  const t = lifeT(e);
  const glowW = core ? 1 : 2.6;
  const alphaMul = core ? 0.9 : 0.45;
  ctx.strokeStyle = e.color;
  ctx.fillStyle = e.color;

  if (e.phase === PH_PASSIVE || e.phase === PH_END) {
    ctx.globalAlpha = alphaMul * a;
    ctx.lineWidth = core ? 1.5 : 4;
    strokeCircle(ctx, e.x, e.y, e.range * (0.4 + 0.6 * t), 0.62);
    return;
  }

  if (e.phase === PH_IMPACT) {
    const rr = e.range * (0.25 + 0.85 * Math.sqrt(t));
    ctx.globalAlpha = alphaMul * a;
    ctx.lineWidth = (core ? 2 : 7) * (1 - t * 0.6);
    strokeCircle(ctx, e.x, e.y, rr, 0.62);
    if (!core && !reducedFlashOn) {
      ctx.globalAlpha = 0.35 * a * (1 - t);
      fillCircle(ctx, e.x, e.y, e.range * 0.45 * (1 - t * 0.5), 0.62);
    }
    if (e.recipe === R_ORBITAL) {
      // Cột sáng từ trời
      const w = (core ? 4 : 16) * (1 - t);
      ctx.globalAlpha = (core ? 0.95 : 0.5) * a;
      ctx.fillRect(Math.round(e.x - w * 0.5), Math.round(e.y - 520), Math.max(1, Math.round(w)), 520);
    }
    if (e.recipe === R_CHAIN || e.recipe === R_BEAM) {
      ctx.globalAlpha = (core ? 1 : 0.5) * a;
      ctx.lineWidth = core ? 1.6 : 5;
      ctx.beginPath();
      if (e.recipe === R_CHAIN) {
        jaggedLine(ctx, e.tx, e.ty, e.x, e.y, e.seed + (((nowMs / 45) | 0) * 7919), 9);
        for (let k = 0; k < e.nPts; k++) {
          jaggedLine(ctx, e.x, e.y, e.px[k], e.py[k], e.seed + k * 131 + (((nowMs / 45) | 0) * 31), 6);
        }
      } else {
        ctx.moveTo(e.tx, e.ty);
        ctx.lineTo(e.x, e.y);
      }
      ctx.stroke();
    }
    if (e.recipe === R_FROST && !core) {
      ctx.globalAlpha = 0.8 * a;
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * TWO_PI + (e.seed & 7);
        const d = rr * 0.9;
        ctx.fillRect(Math.round(e.x + Math.cos(ang) * d - 2), Math.round(e.y + Math.sin(ang) * d * 0.62 - 2), 4, 4);
      }
    }
    return;
  }

  // ── PH_CAST ──
  switch (e.recipe) {
    case R_NOVA: {
      const rr = e.range * Math.sqrt(t);
      ctx.globalAlpha = alphaMul * a;
      ctx.lineWidth = (core ? 2 : 8) * (1 - t * 0.7);
      strokeCircle(ctx, e.x, e.y, rr, 0.62);
      ctx.lineWidth = core ? 1 : 3;
      strokeCircle(ctx, e.x, e.y, rr * 0.6, 0.62);
      break;
    }
    case R_SHOCK: {
      const rr = e.range * Math.min(1, t * 2.2);
      ctx.globalAlpha = alphaMul * a;
      ctx.lineWidth = core ? 2 : 6;
      strokeCircle(ctx, e.x, e.y, rr, 0.62);
      ctx.lineWidth = core ? 1.2 : 3;
      ctx.beginPath();
      const step = ((nowMs / 45) | 0) * 13;
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TWO_PI + (e.seed & 7);
        const a1 = a0 + 0.9;
        jaggedLine(
          ctx,
          e.x + Math.cos(a0) * rr,
          e.y + Math.sin(a0) * rr * 0.62,
          e.x + Math.cos(a1) * rr,
          e.y + Math.sin(a1) * rr * 0.62,
          e.seed + k * 97 + step,
          5,
        );
      }
      ctx.stroke();
      break;
    }
    case R_FROST: {
      const grow = clamp(e.ageMs / 220, 0, 1);
      const rr = e.range * grow;
      ctx.globalAlpha = alphaMul * a;
      ctx.lineWidth = core ? 1.5 : 5;
      strokeCircle(ctx, e.x, e.y, rr, 0.62);
      // gai băng nhô ra quanh vòng
      ctx.globalAlpha = (core ? 0.9 : 0.6) * a;
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * TWO_PI + (e.seed & 3) * 0.2;
        const sx = e.x + Math.cos(ang) * rr;
        const sy = e.y + Math.sin(ang) * rr * 0.62;
        const len = (k % 2 === 0 ? 14 : 8) * grow;
        ctx.fillRect(Math.round(sx - 1), Math.round(sy - len), 2, Math.max(1, Math.round(len)));
      }
      break;
    }
    case R_CONE: {
      const half = 0.42;
      const rr = e.range * (0.7 + 0.3 * Math.sin(nowMs * 0.02 + (e.seed & 15)) * 0.5 + 0.15);
      ctx.globalAlpha = (core ? 0.5 : 0.32) * a;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.arc(e.x, e.y, rr, e.angle - half, e.angle + half);
      ctx.closePath();
      if (core) {
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fill();
        ctx.globalAlpha = 0.5 * a;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, rr * 0.55, e.angle - half * 0.6, e.angle + half * 0.6);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case R_BEAM: {
      const len = e.range;
      const ex = e.x + Math.cos(e.angle) * len;
      const ey = e.y + Math.sin(e.angle) * len;
      const pulse = 0.75 + 0.25 * Math.sin(nowMs * 0.05);
      ctx.globalAlpha = (core ? 1 : 0.45) * a;
      ctx.lineWidth = (core ? 2.5 : 14) * pulse * (1 - t * 0.3);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      if (core) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      break;
    }
    case R_CHAIN: {
      ctx.globalAlpha = (core ? 1 : 0.5) * a;
      ctx.lineWidth = core ? 1.6 : 5;
      ctx.beginPath();
      let px = e.x;
      let py = e.y;
      const step = ((nowMs / 45) | 0) * 7919;
      for (let k = 0; k < e.nPts; k++) {
        jaggedLine(ctx, px, py, e.px[k], e.py[k], e.seed + k * 211 + step, 10);
        px = e.px[k];
        py = e.py[k];
      }
      ctx.stroke();
      break;
    }
    case R_AURA: {
      const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.012);
      ctx.globalAlpha = (core ? 0.7 : 0.35) * a;
      ctx.lineWidth = core ? 1.5 : 5;
      strokeCircle(ctx, e.x, e.y + HERO_CHEST_LIFT, e.range + pulse * 6, 0.45);
      if (!core) {
        ctx.globalAlpha = 0.18 * a;
        fillCircle(ctx, e.x, e.y, 22 + pulse * 4, 1);
      }
      // tia lửa nhỏ bay lên
      ctx.globalAlpha = (core ? 1 : 0.7) * a;
      for (let k = 0; k < 4; k++) {
        const ph = ((nowMs * 0.0016 + k * 0.25 + (e.seed & 7) * 0.1) % 1 + 1) % 1;
        const sx = e.x + Math.cos(k * 1.9 + (e.seed & 15)) * 16;
        const sy = e.y + HERO_CHEST_LIFT - ph * 46;
        ctx.fillRect(Math.round(sx - 1), Math.round(sy - 1), 2, 3);
      }
      break;
    }
    case R_SPIN: {
      ctx.globalAlpha = (core ? 0.6 : 0.3) * a;
      ctx.lineWidth = core ? 1.2 : 6;
      strokeCircle(ctx, e.x, e.y, e.range, 0.62);
      break;
    }
    case R_DASH: {
      ctx.globalAlpha = (core ? 0.8 : 0.4) * a;
      ctx.lineWidth = core ? 2 : 8;
      ctx.beginPath();
      ctx.moveTo(e.x - Math.cos(e.angle) * 40, e.y - Math.sin(e.angle) * 40);
      ctx.lineTo(e.x + Math.cos(e.angle) * 26, e.y + Math.sin(e.angle) * 26);
      ctx.stroke();
      break;
    }
    case R_VOLLEY: {
      const n = 5;
      const spread = 0.5;
      const len = e.range * Math.min(1, t * 3);
      ctx.globalAlpha = (core ? 0.95 : 0.45) * a;
      ctx.lineWidth = core ? 1.4 : 4;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const ang = e.angle + (k / (n - 1) - 0.5) * spread;
        const s0 = len * 0.25;
        ctx.moveTo(e.x + Math.cos(ang) * s0, e.y + Math.sin(ang) * s0);
        ctx.lineTo(e.x + Math.cos(ang) * len, e.y + Math.sin(ang) * len);
      }
      ctx.stroke();
      break;
    }
    case R_STRIKE:
    case R_ORBITAL: {
      // Tâm cảnh báo nhấp nháy — luôn thấy được trong đêm
      const blink = ((nowMs / 120) | 0) % 2 === 0 ? 1 : 0.45;
      ctx.globalAlpha = (core ? 0.9 : 0.4) * a * blink;
      ctx.lineWidth = core ? 1.5 : 4;
      strokeCircle(ctx, e.x, e.y, e.range, 0.6);
      fillCircle(ctx, e.x, e.y, 3 + 3 * lifeT(e), 0.6);
      break;
    }
    case R_SINGULARITY: {
      const rot = nowMs * 0.008;
      ctx.globalAlpha = (core ? 0.9 : 0.45) * a;
      ctx.lineWidth = core ? 1.4 : 4;
      for (let k = 0; k < 4; k++) {
        const a0 = rot + (k / 4) * TWO_PI;
        ctx.beginPath();
        // cánh xoắn: cung đi từ vành vào tâm
        for (let s = 0; s <= 8; s++) {
          const f = s / 8;
          const ang = a0 + f * 2.4;
          const rr = e.range * (1 - f * 0.85);
          const px = e.x + Math.cos(ang) * rr;
          const py = e.y + Math.sin(ang) * rr * 0.62;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = (core ? 1 : 0.6) * a;
      ctx.lineWidth = core ? 1.5 : 5;
      strokeCircle(ctx, e.x, e.y, e.range * 0.22, 0.62);
      break;
    }
    case R_TIMEFIELD: {
      ctx.globalAlpha = (core ? 0.7 : 0.3) * a;
      ctx.lineWidth = core ? 1.2 : 4;
      const wave = (nowMs * 0.0006) % 1;
      strokeCircle(ctx, e.x, e.y, e.range * (1 - wave), 0.62);
      break;
    }
    case R_POOL: {
      ctx.globalAlpha = (core ? 0.5 : 0.3) * a;
      fillCircle(ctx, e.x, e.y, e.range * 0.55, 0.5);
      break;
    }
    case R_MINES: {
      ctx.globalAlpha = (core ? 0.9 : 0.5) * a;
      for (let k = 0; k < e.nPts; k++) {
        if (((nowMs / 260 + k) | 0) % 2 !== 0) continue;
        fillCircle(ctx, e.px[k], e.py[k], core ? 2 : 6, 1);
      }
      break;
    }
    default:
      break;
  }
  void glowW;
}

function drawLitPass(ctx: CanvasRenderingContext2D, view: WeaponSkillFxView, nowMs: number, core: boolean): void {
  let any = false;
  for (let i = 0; i < MAX_EFFECTS; i++) {
    const e = effects[i];
    if (!e.active) continue;
    const mx = e.recipe === R_BEAM && e.phase === PH_CAST ? e.range : effMargin(e);
    if (!inView(view, e.x, e.y, mx)) continue;
    if (!any) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.setLineDash(NO_DASH);
      any = true;
    }
    drawLit(ctx, e, nowMs, core);
  }
  if (any) ctx.restore();
}

/** PASS 5 — additive: quầng sáng + lõi (ban ngày nhìn đủ; ban đêm bị lớp tối phủ). */
export function drawWeaponSkillFxAdditive(ctx: CanvasRenderingContext2D, view: WeaponSkillFxView, nowMs: number): void {
  drawLitPass(ctx, view, nowMs, false);
  drawLitPass(ctx, view, nowMs, true);
}

/** PASS 5c — sau lớp đêm: chỉ vẽ lõi mảnh để skill luôn đọc được trong bóng tối. */
export function drawWeaponSkillFxOverNight(ctx: CanvasRenderingContext2D, view: WeaponSkillFxView, nowMs: number): void {
  drawLitPass(ctx, view, nowMs, true);
}

export function resetWeaponSkillFx(): void {
  for (let i = 0; i < MAX_EFFECTS; i++) effects[i].active = false;
  for (let i = 0; i < MAX_GHOSTS; i++) ghosts[i].active = false;
  lastPassiveAt.fill(0);
  storeRef = null;
}

/** Dùng cho test / ảnh xem trước: số hiệu ứng đang hoạt động. */
export function getActiveWeaponSkillFxCount(): number {
  let n = 0;
  for (let i = 0; i < MAX_EFFECTS; i++) if (effects[i].active) n++;
  return n;
}
