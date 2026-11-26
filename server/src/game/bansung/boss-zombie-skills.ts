/**
 * server/src/game/bansung/boss-zombie-skills.ts
 *
 * Đêm Zombie v2 (spec 007 · B4b): bộ skill MỚI cho 3 boss chưa có skill mới —
 * Brood Eye (`boss_beholder`), Iron Hulk (`boss_colossus`), Plague Core (`boss_overlord`).
 *
 * Thiết kế "lớp phủ" (overlay): skill chạy song song với FSM gốc của boss, chỉ được bắt đầu
 * khi boss đang ở trạng thái di chuyển tự do (`roaming`), và chỉ sau `FIRST_USE_TICKS`
 * (20 s giao tranh). Nhờ vậy các bài test hành vi chi tiết hiện có (đếm chính xác số đạn
 * từng chiêu trong vài giây đầu) không bị ảnh hưởng, còn trong trận thật boss có thêm chiêu.
 *
 * Toàn bộ là server-authoritative: đạn đi qua đường bắn đạn sẵn có của từng boss
 * (danmaku motion), laser gây sát thương qua callback `onBeamHit`, telegraph được đẩy
 * vào danh sách telegraph của boss để client (`boss-fx.ts`) vẽ.
 *
 *  boss_beholder  · Brood Spiral   — xoắn ốc 3 cánh (P2: 5 cánh + 2 cánh ngược) kiểu Chicken Invaders
 *                 · Hatch Bolts    — 3/5 tia sét chẻ nhánh bắn thẳng từ mắt boss
 *  boss_colossus  · Rivet Bloom    — 3/4 vòng hoa đinh tán xoay ngược chiều, chừa khe thoát
 *                 · Furnace Beam   — laser lò ngực quét 1.7 rad (P2: kết thúc bằng tia sét chẻ nhánh)
 *  boss_overlord  · Plague Galaxy  — thiên hà dịch bệnh 4 cánh (P2: 6 cánh + 3 cánh ngược)
 *                 · Toxic Bloom    — 2 vòng hoa độc làm chậm
 *
 * Độ khó (spec 007 · B4c): mọi thông số skill nhân theo `ZOMBIE_SKILL_DIFFICULTY[difficulty]`
 * — thời điểm dùng lần đầu, hồi chiêu, độ dày đạn, sát thương, tốc độ đạn, tốc độ xoay.
 * Mức `normal` giữ nguyên số gốc (các test cũ không đổi).
 */
import {
  BANSUNG_DANMAKU_PALETTE,
  BANSUNG_FX_BEAM_BOSS_LASER,
  FX_BEAM,
  type BansungTelegraph,
} from '../../../../shared/src';
import {
  emitChickenSpiralVolley,
  emitFlowerSpinRing,
  emitForkedBoltVolley,
  sweepBeamHitsCircle,
  type BossDanmakuSpawnInput,
  type DanmakuMotionSpec,
} from './danmaku';

const TWO_PI = Math.PI * 2;

export const ZOMBIE_SKILL_CFG = {
  /** Lần đầu dùng skill mới sau 20 s giao tranh (30 Hz). */
  FIRST_USE_TICKS: 600,
  /** Hồi chiêu giữa 2 lần dùng skill mới. */
  CD_P1_TICKS: 360,
  CD_P2_TICKS: 270,
  /** Bị FSM gốc cắt ngang thì hồi chiêu ngắn hơn. */
  CD_ABORT_TICKS: 150,
  WINDUP_TICKS: 15,
  BEAM_WINDUP_TICKS: 24,
  BEAM_FIRE_TICKS: 40,
  BEAM_LENGTH: 640,
  BEAM_HALF_W: 18,
  BEAM_SWEEP_RAD: 1.7,
} as const;

/** Hệ số chỉnh skill boss theo độ khó phòng. */
export interface ZombieSkillTune {
  /** × thời điểm dùng skill mới lần đầu (FIRST_USE_TICKS). */
  readonly firstUse: number;
  /** × hồi chiêu giữa 2 lần dùng. */
  readonly cd: number;
  /** × số cánh xoắn ốc / số viên mỗi vòng hoa / số tia sét. */
  readonly density: number;
  /** × sát thương mỗi viên / mỗi lần laze trúng. */
  readonly dmg: number;
  /** × tốc độ bay của đạn. */
  readonly speed: number;
  /** × tốc độ xoay (curl, bước xoay xoắn ốc, tốc độ quét laze). */
  readonly spin: number;
}

/**
 * Bảng độ khó. Lobby hiện có 3 mức: `normal` (Thường), `hard` (Khó), `hell` (Địa Ngục).
 * `easy` / `insane` được định nghĩa sẵn cho `BansungDifficultyKey` dù lobby chưa cho chọn.
 * Hệ số sát thương khớp `BANSUNG_DIFFICULTY_SCALE.dmg` (0.75 / 1 / 1.25 / 1.5) như các boss khác.
 */
export const ZOMBIE_SKILL_DIFFICULTY: Readonly<Record<string, ZombieSkillTune>> = {
  easy: { firstUse: 1.5, cd: 1.35, density: 0.7, dmg: 0.75, speed: 0.85, spin: 0.8 },
  normal: { firstUse: 1, cd: 1, density: 1, dmg: 1, speed: 1, spin: 1 },
  hard: { firstUse: 0.75, cd: 0.82, density: 1.25, dmg: 1.25, speed: 1.1, spin: 1.15 },
  hell: { firstUse: 0.5, cd: 0.68, density: 1.5, dmg: 1.5, speed: 1.2, spin: 1.3 },
  insane: { firstUse: 0.5, cd: 0.68, density: 1.5, dmg: 1.5, speed: 1.2, spin: 1.3 },
};

export function resolveZombieSkillTune(difficulty?: string | null): ZombieSkillTune {
  const key = String(difficulty ?? 'normal').toLowerCase();
  return ZOMBIE_SKILL_DIFFICULTY[key] ?? ZOMBIE_SKILL_DIFFICULTY.normal;
}

/** Số tick tới lần dùng skill mới đầu tiên theo độ khó. */
export function zombieFirstUseTicks(tune: ZombieSkillTune): number {
  return Math.max(60, Math.round(ZOMBIE_SKILL_CFG.FIRST_USE_TICKS * tune.firstUse));
}

/** Nhân số lượng theo độ dày đạn, làm tròn và kẹp trong [min, max]. */
function scaleCount(base: number, tune: ZombieSkillTune, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(base * tune.density)));
}

function beamFireTicks(tune: ZombieSkillTune): number {
  return Math.max(20, Math.round(ZOMBIE_SKILL_CFG.BEAM_FIRE_TICKS / tune.spin));
}

export type ZombieBossKind = 'boss_beholder' | 'boss_colossus' | 'boss_overlord';

export type ZombieSkillId =
  | 'brood_spiral'
  | 'hatch_bolts'
  | 'rivet_bloom'
  | 'furnace_beam'
  | 'plague_galaxy'
  | 'toxic_bloom';

/** Tên hiển thị (telegraph label) — tiếng Anh ngắn theo yêu cầu. */
export const ZOMBIE_SKILL_LABELS: Readonly<Record<ZombieSkillId, string>> = {
  brood_spiral: 'BROOD SPIRAL',
  hatch_bolts: 'HATCH BOLTS',
  rivet_bloom: 'RIVET BLOOM',
  furnace_beam: 'FURNACE BEAM',
  plague_galaxy: 'PLAGUE GALAXY',
  toxic_bloom: 'TOXIC BLOOM',
};

const BOSS_SKILL_ROTATION: Readonly<Record<ZombieBossKind, readonly ZombieSkillId[]>> = {
  boss_beholder: ['brood_spiral', 'hatch_bolts'],
  boss_colossus: ['rivet_bloom', 'furnace_beam'],
  boss_overlord: ['plague_galaxy', 'toxic_bloom'],
};

const BOSS_BASE_DMG: Readonly<Record<ZombieBossKind, number>> = {
  boss_beholder: 10,
  boss_colossus: 12,
  boss_overlord: 11,
};

export interface ZombieSkillState {
  /** Số tick boss đã sống (giao tranh). */
  clockTicks: number;
  cdTicks: number;
  active: ZombieSkillId | null;
  tick: number;
  rot: number;
  dir: 1 | -1;
  aim: number;
  beamAngle: number;
  useIdx: number;
  /** Hệ số độ khó của phòng (mặc định `normal`). */
  tune: ZombieSkillTune;
}

export function createZombieSkillState(difficulty?: string | null): ZombieSkillState {
  const tune = resolveZombieSkillTune(difficulty);
  return {
    clockTicks: 0,
    cdTicks: zombieFirstUseTicks(tune),
    active: null,
    tick: 0,
    rot: 0,
    dir: 1,
    aim: 0,
    beamAngle: 0,
    useIdx: 0,
    tune,
  };
}

export interface ZombieSkillTarget {
  x: number;
  y: number;
  radius?: number;
  alive: boolean;
  downed?: boolean;
  hp?: number;
  dashIframesMs?: number;
}

export interface ZombieSkillStepInput<T extends ZombieSkillTarget> {
  bossId: number;
  kind: ZombieBossKind;
  x: number;
  y: number;
  radius: number;
  phase: 1 | 2;
  /** Boss đang ở trạng thái di chuyển tự do — được phép bắt đầu / tiếp tục skill. */
  roaming: boolean;
  players: readonly T[];
  /** Số đạn còn được phép bắn trong tick này (trần đạn boss). Mặc định không giới hạn. */
  projectileBudget?: number;
  emit: (b: BossDanmakuSpawnInput) => void;
  onBeamHit?: (p: T, dmg: number) => void;
  fx?: number[];
  telegraphsOut?: BansungTelegraph[];
  onSfx?: (key: string, x: number, y: number) => void;
}

function skillDuration(id: ZombieSkillId, phase: 1 | 2, tune: ZombieSkillTune): number {
  const w = ZOMBIE_SKILL_CFG.WINDUP_TICKS;
  switch (id) {
    case 'brood_spiral':
      return w + (phase === 2 ? 72 : 60);
    case 'hatch_bolts':
      return phase === 2 ? 50 : 36;
    case 'rivet_bloom':
      return w + (phase === 2 ? 52 : 36);
    case 'furnace_beam':
      return ZOMBIE_SKILL_CFG.BEAM_WINDUP_TICKS + beamFireTicks(tune) + (phase === 2 ? 4 : 0);
    case 'plague_galaxy':
      return w + (phase === 2 ? 84 : 72);
    case 'toxic_bloom':
      return w + 30;
    default:
      return w;
  }
}

function isTargetable(p: ZombieSkillTarget): boolean {
  return p.alive && !p.downed && (p.hp === undefined || p.hp > 0) && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function nearestTarget<T extends ZombieSkillTarget>(players: readonly T[], x: number, y: number): T | undefined {
  let best: T | undefined;
  let bestD2 = Infinity;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (!isTargetable(p)) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

/** Bọc `emit` bằng trần đạn: bỏ đạn khi đã hết ngân sách của tick. */
function budgetedEmit(
  inp: { emit: (b: BossDanmakuSpawnInput) => void; projectileBudget?: number },
  counter: { left: number },
): (b: BossDanmakuSpawnInput) => void {
  return (b) => {
    if (counter.left <= 0) return;
    counter.left -= 1;
    inp.emit(b);
  };
}

function pushRingTelegraph(
  out: BansungTelegraph[] | undefined,
  id: number,
  x: number,
  y: number,
  r: number,
  color: 0 | 1 | 2 | 3 | 4 | 5,
  prog: number,
  label: string,
  sourceKind: ZombieBossKind,
): void {
  if (!out) return;
  out.push({
    id,
    kind: 1,
    shape: 'ring',
    phase: prog >= 200 ? 1 : 0,
    color,
    prog: Math.max(0, Math.min(255, Math.round(prog))),
    x0: Math.round(x),
    y0: Math.round(y),
    x1: Math.round(x),
    y1: Math.round(y),
    r: Math.round(r),
    danger: 1,
    label,
    sourceKind,
  });
}

function pushLineTelegraph(
  out: BansungTelegraph[] | undefined,
  id: number,
  x: number,
  y: number,
  ang: number,
  len: number,
  halfW: number,
  color: 0 | 1 | 2 | 3 | 4 | 5,
  prog: number,
  active: boolean,
  label: string | undefined,
  sourceKind: ZombieBossKind,
): void {
  if (!out) return;
  out.push({
    id,
    kind: 0,
    shape: 'line',
    phase: active || prog >= 200 ? 1 : 0,
    color,
    prog: Math.max(0, Math.min(255, Math.round(prog))),
    x0: Math.round(x),
    y0: Math.round(y),
    x1: Math.round(x + Math.cos(ang) * len),
    y1: Math.round(y + Math.sin(ang) * len),
    r: halfW,
    halfW,
    active,
    danger: 1,
    ...(label ? { label } : {}),
    sourceKind,
  });
}

function endSkill(st: ZombieSkillState, phase: 1 | 2, aborted: boolean): void {
  st.active = null;
  st.tick = 0;
  const base = aborted
    ? ZOMBIE_SKILL_CFG.CD_ABORT_TICKS
    : phase === 2
      ? ZOMBIE_SKILL_CFG.CD_P2_TICKS
      : ZOMBIE_SKILL_CFG.CD_P1_TICKS;
  st.cdTicks = Math.max(60, Math.round(base * st.tune.cd));
}

/**
 * Tiến 1 tick (30 Hz) cho skill mới của boss. Trả về `true` khi một skill đang chạy —
 * boss nên giữ các đòn tấn công gốc (tăng nhẹ cooldown) để skill không bị chồng chéo.
 */
export function stepZombieBossSkills<T extends ZombieSkillTarget>(
  st: ZombieSkillState,
  inp: ZombieSkillStepInput<T>,
): boolean {
  st.clockTicks += 1;
  const target = nearestTarget(inp.players, inp.x, inp.y);

  if (st.active === null) {
    if (st.cdTicks > 0) st.cdTicks -= 1;
    if (st.cdTicks > 0 || !inp.roaming || !target) return false;
    const rotation = BOSS_SKILL_ROTATION[inp.kind];
    st.active = rotation[st.useIdx % rotation.length];
    st.useIdx += 1;
    st.tick = 0;
    st.dir = st.dir === 1 ? -1 : 1;
    st.aim = Math.atan2(target.y - inp.y, target.x - inp.x);
    st.rot = st.aim;
    st.beamAngle = st.aim - st.dir * ZOMBIE_SKILL_CFG.BEAM_SWEEP_RAD * 0.5;
    inp.onSfx?.(st.active === 'furnace_beam' ? 'sfx_laser_charge' : 'boss_roar_retro', inp.x, inp.y);
  } else if (!inp.roaming) {
    endSkill(st, inp.phase, true);
    return false;
  }

  const id = st.active as ZombieSkillId;
  st.tick += 1;
  const t = st.tick;
  const p2 = inp.phase === 2;
  const tune = st.tune;
  const dmg = Math.max(1, Math.round(BOSS_BASE_DMG[inp.kind] * tune.dmg));
  const tgBase = inp.bossId * 1000 + 880;
  const label = ZOMBIE_SKILL_LABELS[id];
  const counter = { left: Math.max(0, Math.floor(inp.projectileBudget ?? Number.MAX_SAFE_INTEGER)) };
  const emit = budgetedEmit(inp, counter);
  const W = ZOMBIE_SKILL_CFG.WINDUP_TICKS;
  if (target && id !== 'furnace_beam') {
    st.aim = Math.atan2(target.y - inp.y, target.x - inp.x);
  }

  switch (id) {
    case 'brood_spiral':
    case 'plague_galaxy': {
      const isGalaxy = id === 'plague_galaxy';
      if (t <= W) {
        pushRingTelegraph(inp.telegraphsOut, tgBase, inp.x, inp.y, inp.radius + 70, 3, (t / W) * 255, label, inp.kind);
        break;
      }
      if ((t - W) % 3 === 1) {
        emitChickenSpiralVolley(emit, {
          x: inp.x,
          y: inp.y,
          arms: scaleCount(isGalaxy ? (p2 ? 6 : 4) : p2 ? 5 : 3, tune, 2, 10),
          rotRad: st.rot,
          speed: (isGalaxy ? 150 : 165) * tune.speed,
          curl: (isGalaxy ? 0.26 : 0.32) * st.dir * tune.spin,
          accel: isGalaxy ? 12 : 18,
          damage: dmg,
          palette: isGalaxy ? BANSUNG_DANMAKU_PALETTE.EMERALD : BANSUNG_DANMAKU_PALETTE.CRIMSON,
          counterArms: p2 ? scaleCount(isGalaxy ? 3 : 2, tune, 1, 6) : 0,
          counterPalette: isGalaxy ? BANSUNG_DANMAKU_PALETTE.VIOLET : BANSUNG_DANMAKU_PALETTE.GOLD,
          ttlTicks: 110,
        });
        st.rot += (isGalaxy ? 0.21 : 0.24) * st.dir * tune.spin;
      }
      break;
    }

    case 'hatch_bolts': {
      const bolts = scaleCount(p2 ? 5 : 3, tune, 2, 9);
      const spread = 0.7;
      if (t < 18) {
        for (let k = 0; k < bolts; k++) {
          const u = bolts === 1 ? 0 : k / (bolts - 1) - 0.5;
          pushLineTelegraph(
            inp.telegraphsOut,
            tgBase + k,
            inp.x,
            inp.y,
            st.aim + u * spread,
            520,
            10,
            5,
            (t / 18) * 255,
            false,
            k === 0 ? label : undefined,
            inp.kind,
          );
        }
        break;
      }
      if (t === 18 || t === 32 || (p2 && t === 46)) {
        emitForkedBoltVolley(emit, {
          x: inp.x,
          y: inp.y,
          aimRad: st.aim,
          bolts,
          spreadRad: spread,
          speed: 600 * tune.speed,
          forkAfterTicks: 11,
          damage: dmg,
          palette: BANSUNG_DANMAKU_PALETTE.GOLD,
          forkPalette: BANSUNG_DANMAKU_PALETTE.CYAN,
        });
        inp.onSfx?.('sfx_wpn_tesla', inp.x, inp.y);
      }
      break;
    }

    case 'rivet_bloom':
    case 'toxic_bloom': {
      const isToxic = id === 'toxic_bloom';
      if (t <= W) {
        pushRingTelegraph(
          inp.telegraphsOut,
          tgBase,
          inp.x,
          inp.y,
          inp.radius + 80,
          isToxic ? 3 : 1,
          (t / W) * 255,
          label,
          inp.kind,
        );
        break;
      }
      const rel = t - W;
      const interval = isToxic ? 22 : 16;
      if (rel % interval === 1) {
        emitFlowerSpinRing(emit, {
          x: inp.x,
          y: inp.y,
          count: scaleCount(isToxic ? (p2 ? 24 : 18) : p2 ? 22 : 16, tune, 10, 36),
          rotRad: st.rot,
          speed: (isToxic ? 140 : 150) * tune.speed,
          curl: 0.6 * st.dir * tune.spin,
          damage: dmg,
          outerPalette: isToxic ? BANSUNG_DANMAKU_PALETTE.EMERALD : BANSUNG_DANMAKU_PALETTE.FLAME,
          innerPalette: isToxic ? BANSUNG_DANMAKU_PALETTE.VIOLET : BANSUNG_DANMAKU_PALETTE.SILVER,
          gapEvery: isToxic ? 6 : 5,
          ...(isToxic ? { slowPct: 0.25, slowMs: 900 } : {}),
        });
        st.rot += 0.35 * tune.spin;
        st.dir = st.dir === 1 ? -1 : 1;
      }
      break;
    }

    case 'furnace_beam': {
      const WU = ZOMBIE_SKILL_CFG.BEAM_WINDUP_TICKS;
      const FIRE = beamFireTicks(tune);
      const len = ZOMBIE_SKILL_CFG.BEAM_LENGTH;
      const halfW = ZOMBIE_SKILL_CFG.BEAM_HALF_W;
      const startAng = st.beamAngle;
      if (t <= WU) {
        // Telegraph: vạch xuất phát + vạch kết thúc của cung quét
        pushLineTelegraph(inp.telegraphsOut, tgBase, inp.x, inp.y, startAng, len, halfW, 0, (t / WU) * 255, false, label, inp.kind);
        pushLineTelegraph(
          inp.telegraphsOut,
          tgBase + 1,
          inp.x,
          inp.y,
          startAng + st.dir * ZOMBIE_SKILL_CFG.BEAM_SWEEP_RAD,
          len,
          6,
          0,
          (t / WU) * 160,
          false,
          undefined,
          inp.kind,
        );
        break;
      }
      const ft = t - WU;
      if (ft <= FIRE) {
        const ang = startAng + st.dir * ZOMBIE_SKILL_CFG.BEAM_SWEEP_RAD * (ft / FIRE);
        const ox = inp.x + Math.cos(ang) * (inp.radius * 0.6);
        const oy = inp.y + Math.sin(ang) * (inp.radius * 0.6);
        pushLineTelegraph(inp.telegraphsOut, tgBase, ox, oy, ang, len, halfW, 0, 255, true, undefined, inp.kind);
        if (ft === 1) inp.onSfx?.('sfx_laser_beam', inp.x, inp.y);
        if (ft % 2 === 1) {
          inp.fx?.push(
            FX_BEAM,
            Math.round(ox),
            Math.round(oy),
            Math.round(ox + Math.cos(ang) * len),
            Math.round(oy + Math.sin(ang) * len),
            BANSUNG_FX_BEAM_BOSS_LASER,
          );
        }
        if (ft % 5 === 1 && inp.onBeamHit) {
          for (let i = 0; i < inp.players.length; i++) {
            const p = inp.players[i];
            if (!isTargetable(p) || (p.dashIframesMs ?? 0) > 0) continue;
            if (sweepBeamHitsCircle(ox, oy, ang, len, halfW, p.x, p.y, p.radius ?? 13)) {
              inp.onBeamHit(p, Math.round(dmg * 1.4));
            }
          }
        }
        if (p2 && ft === FIRE && target) {
          // Arc Discharge: lò quá nhiệt xả sét chẻ nhánh vào người chơi gần nhất
          emitForkedBoltVolley(emit, {
            x: inp.x,
            y: inp.y,
            aimRad: Math.atan2(target.y - inp.y, target.x - inp.x),
            bolts: scaleCount(3, tune, 2, 7),
            spreadRad: 0.55,
            speed: 620 * tune.speed,
            forkAfterTicks: 10,
            damage: dmg,
            palette: BANSUNG_DANMAKU_PALETTE.CYAN,
            forkPalette: BANSUNG_DANMAKU_PALETTE.GOLD,
          });
          inp.onSfx?.('sfx_wpn_tesla', inp.x, inp.y);
        }
      }
      break;
    }

    default:
      break;
  }

  if (st.tick >= skillDuration(id, inp.phase, tune)) {
    endSkill(st, inp.phase, false);
    return false;
  }
  return true;
}

/** Tách các trường chuyển động danmaku khỏi input spawn (để boss tự điền x/y/damage). */
export function splitDanmakuMotion(b: BossDanmakuSpawnInput): DanmakuMotionSpec {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { x, y, vx, vy, radius, damage, dmgKind, ttlTicks, ownerActorId, kindId, armored, ...motion } = b;
  return motion;
}

/** Góc bay của 1 viên đạn (rad) và tốc độ, cho các boss cần `angle`/`speed` trong spawn. */
export function bulletAngleSpeed(b: BossDanmakuSpawnInput): { angle: number; speed: number } {
  return { angle: Math.atan2(b.vy, b.vx), speed: Math.hypot(b.vx, b.vy) };
}

export const ZOMBIE_SKILL_TWO_PI = TWO_PI;
