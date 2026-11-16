/**
 * Điều phối mô phỏng 30Hz (đồng bộ mạng 15Hz) cho chế độ Miragine War cổ điển (1P vs AI / 1v1 PvP).
 * Kết nối các mô-đun `economy.ts`, `steering.ts`, `combat.ts`, `structures.ts` và `bot.ts`.
 */

import {
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_CMD_BURST,
  THAP_CMD_REFILL,
  THAP_COLORS,
  THAP_CRYSTALS,
  THAP_DOORS,
  THAP_FIRST_ROUND_FRAMES,
  THAP_INCOME_LIMIT,
  THAP_MAX_POP,
  THAP_NET_DIV,
  THAP_SIM_FPS,
  THAP_SIM_MS,
  THAP_UNIT_KINDS,
  THAP_UNITS,
  encodeUnitFlags,
  type ThapCommand,
  type ThapConfig,
  type ThapFrame,
  type ThapPlayerInfo,
  type ThapPrivate,
  type ThapResult,
  type ThapSideStats,
  type ThapUnitKind,
} from '../../../../shared/src';
import { createAiBrain, runBot } from './bot';
import { applyDamageToUnit, stepCombat } from './combat';
import {
  createInitialSides,
  setSideAuto,
  sidePop,
  spawnUnit,
  stepEconomyAndSpawning,
} from './economy';
import { SpatialGrid, findTargetForUnit, stepUnitMovement } from './steering';
import { damageCrystal, stepCrystals } from './structures';
import {
  enemyOf,
  isUnitInPlay,
  type SideState,
  type SimWorldState,
  type Unit,
} from './types';

export type { ThapResult };

/** Callback kết nối `ThapWorld` với lớp phòng chơi bên ngoài (`Game`). */
export interface ThapWorldHooks {
  /** Gọi ở mỗi khung hình mạng (15Hz + lúc khởi tạo / kết thúc) để đẩy `ThapFrame` tới client. */
  tick(): void;
  /** Gọi khi có nhật ký mới hoặc trận đấu kết thúc để cập nhật `RoomView`. */
  changed(): void;
}

/** Thông tin khởi tạo một phe đầu vào cho `ThapWorld`. */
export interface ThapInit {
  id: string;
  name: string;
  color: string;
  team: number;
  bot: boolean;
}

const SPATIAL_CELL_SIZE = 80;
const SIM_DT = 1 / THAP_SIM_FPS;
const KIND_INDEX: Record<ThapUnitKind, number> = Object.fromEntries(
  THAP_UNIT_KINDS.map((k, i) => [k, i]),
) as Record<ThapUnitKind, number>;

/**
 * Thế giới mô phỏng 1v1 cổ điển của Miragine War:
 * mô phỏng logic 30Hz, đệm sự kiện & phát khung hình 15Hz an toàn cho nhiều client.
 */
export class ThapWorld {
  readonly W = THAP_ARENA_W;
  readonly H = THAP_ARENA_H;
  readonly startedAt = Date.now();
  endsAt?: number;
  result?: ThapResult;
  readonly sim: SimWorldState;

  private readonly bases: [number, number][] = THAP_CRYSTALS.map(([x, y]) => [x, y]);
  private readonly doors: [number, number][] = THAP_DOORS.map(([x, y]) => [x, y]);
  private readonly grid = new SpatialGrid(THAP_ARENA_W, THAP_ARENA_H, SPATIAL_CELL_SIZE);
  private readonly cmdTokens: number[];
  private readonly popFullLogged: boolean[];
  private logs: string[] = [];
  private timer?: NodeJS.Timeout;
  private sharedFrameCache?: Omit<ThapFrame, 'me' | 'full'>;

  constructor(
    inits: ThapInit[],
    readonly config: ThapConfig,
    private readonly hooks: ThapWorldHooks,
  ) {
    const sides = createInitialSides(inits, config);
    for (let idx = 0; idx < sides.length; idx++) {
      const s = sides[idx];
      const init = inits[idx];
      if (init) {
        s.id = init.id;
        s.name = init.name;
        s.color = init.color || THAP_COLORS[idx % THAP_COLORS.length];
        s.team = init.team;
        s.bot = init.bot;
      } else {
        s.color = THAP_COLORS[idx % THAP_COLORS.length];
        s.team = idx;
      }
      if (s.bot) {
        s.ai = createAiBrain(config.botLevel);
      }
    }

    if (config.minutes > 0) {
      this.endsAt = this.startedAt + config.minutes * 60_000;
    }

    this.sim = {
      config,
      mapW: THAP_ARENA_W,
      mapH: THAP_ARENA_H,
      simTick: 0,
      netTick: 0,
      wave: 0,
      roundFramesLeft: THAP_FIRST_ROUND_FRAMES,
      roundTotalFrames: THAP_FIRST_ROUND_FRAMES,
      startedAt: this.startedAt,
      sides,
      units: [],
      nextUnitId: 1,
      pendingShots: [],
      pendingDeaths: [],
    };

    this.cmdTokens = sides.map(() => THAP_CMD_BURST);
    this.popFullLogged = sides.map(() => false);
  }

  /** Danh sách trạng thái hai phe (0 = Đỏ bên trái, 1 = Xanh bên phải). */
  get sides(): SideState[] {
    return this.sim.sides;
  }

  /** Cho biết vòng lặp mô phỏng có đang chạy hay không. */
  get running(): boolean {
    return this.timer !== undefined;
  }

  /** Bắt đầu vòng lặp mô phỏng 30Hz và phát ngay khung hình tick-0 cho HUD. */
  start(): void {
    if (this.timer || this.result) return;
    this.captureNetworkSnapshot();
    this.hooks.tick();
    this.timer = setInterval(() => {
      try {
        this.step();
      } catch (error) {
        console.error('[ThapWorld] lỗi mô phỏng', error);
      }
    }, Math.round(THAP_SIM_MS));
  }

  /** Dừng bộ đếm mô phỏng. */
  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Chạy một khung hình mô phỏng ở 30Hz và phát snapshot mạng mỗi `THAP_NET_DIV` nhịp (15Hz). */
  step(): void {
    if (this.result) return;

    this.sim.simTick += 1;
    this.refillCommandTokens();

    const prevWave = this.sim.wave;
    stepEconomyAndSpawning(this.sim);
    this.recordEconomyLogs(prevWave);

    this.rebuildSpatialGrid();

    for (let i = 0; i < this.sim.sides.length; i++) {
      const s = this.sim.sides[i];
      if (s.alive && s.bot) {
        runBot(this.sim, s, (kind) => setSideAuto(this.sim, s.idx, kind));
      }
    }

    stepCrystals(this.sim, this.grid, applyDamageToUnit);
    stepCombat(this.sim, this.grid, (att, tgt, dmg) => {
      damageCrystal(this.sim, att, tgt, dmg);
    });

    this.sim.units = this.sim.units.filter(isUnitInPlay);

    for (let i = 0; i < this.sim.units.length; i++) {
      const u = this.sim.units[i];
      const target = findTargetForUnit(u, this.sim, this.grid);
      stepUnitMovement(u, target, this.sim, this.grid, SIM_DT);
    }

    if (this.checkMatchEnd()) return;

    if (this.sim.simTick % THAP_NET_DIV === 0) {
      this.sim.netTick += 1;
      this.captureNetworkSnapshot();
      this.hooks.tick();
    }

    if (this.logs.length > 0) {
      this.hooks.changed();
    }
  }

  /** Chạy một khung hình mạng (`THAP_NET_DIV = 2` bước mô phỏng 30Hz), tiện cho kiểm thử. */
  stepFrame(): void {
    for (let i = 0; i < THAP_NET_DIV; i++) {
      this.step();
    }
  }

  /** Xử lý lệnh điều khiển từ người chơi phe `idx`. Trả về chuỗi lỗi nếu lệnh không hợp lệ. */
  command(idx: number, cmd: ThapCommand): string | undefined {
    const s = this.sim.sides[idx];
    if (!s || !s.alive || this.result) {
      return 'Pha Lê của bạn không còn nữa.';
    }
    if (!cmd || typeof cmd !== 'object') {
      return 'Lệnh không hợp lệ.';
    }

    if (cmd.t === 'surrender') {
      this.resign(idx);
      return undefined;
    }

    if ((this.cmdTokens[idx] ?? 0) < 1) {
      return undefined;
    }
    this.cmdTokens[idx] -= 1;

    if (cmd.t === 'auto' || cmd.t === 'select') {
      if (typeof cmd.kind !== 'string' || !Object.prototype.hasOwnProperty.call(THAP_UNITS, cmd.kind)) {
        return 'Loại lính không hợp lệ.';
      }
      setSideAuto(this.sim, idx, cmd.kind);
      return undefined;
    }

    return 'Lệnh không hợp lệ.';
  }

  /** Xử lý phe `idx` đầu hàng / rời trận: phá hủy Pha Lê và kết thúc ván cho đối thủ thắng. */
  resign(idx: number): void {
    if (this.result) return;
    const s = this.sim.sides[idx];
    if (!s || !s.alive) return;

    s.alive = false;
    s.baseHp = 0;
    const crystal = THAP_CRYSTALS[idx];
    if (crystal) {
      this.sim.pendingDeaths.push(Math.round(crystal[0]), Math.round(crystal[1]), idx + 1);
    }

    const enemy = this.sim.sides[enemyOf(idx)];
    const winnerTeam = enemy ? enemy.team : -1;
    this.sim.winnerTeam = winnerTeam;
    this.sim.winReason = 'surrender';
    this.logs.push(`🏳️ ${s.name} đầu hàng, Pha Lê Chính sụp đổ.`);
    this.finish(winnerTeam, 'surrender');
  }

  /** Chốt kết quả trận đấu, dừng mô phỏng và phát snapshot cuối cùng chứa hiệu ứng kết thúc. */
  finish(winnerTeam: number, reason: string): void {
    if (this.result) return;

    const scores = this.sim.sides.map((s) => this.scoreOf(s));
    const winnerIdxs =
      winnerTeam >= 0
        ? this.sim.sides.filter((s) => s.team === winnerTeam).map((s) => s.idx)
        : [];
    const durationMs = Math.round((this.sim.simTick * 1000) / THAP_SIM_FPS);
    const stats: ThapSideStats[] = this.sim.sides.map((s) => ({
      idx: s.idx,
      kills: s.kills,
      lost: s.lost,
      spawned: s.spawned,
      killsValue: s.killsValue,
      roundIncome: s.roundIncome,
      totalEarned: s.totalEarned,
      damageToCrystal: s.damageToCrystal,
      baseHp: s.baseHp,
    }));

    this.result = {
      winnerTeam,
      winnerIdxs,
      reason,
      scores,
      durationMs,
      waves: this.sim.wave,
      stats,
    };

    const winnerNames = winnerIdxs
      .map((i) => this.sim.sides[i]?.name)
      .filter(Boolean)
      .join(', ');
    if (reason === 'crystal') {
      this.logs.push(`🏆 ${winnerNames || 'Người chiến thắng'} đã phá hủy Pha Lê Chính của đối phương!`);
    } else if (reason === 'time') {
      this.logs.push(
        winnerTeam >= 0
          ? `⏰ Hết giờ! 🏆 ${winnerNames || 'Người chiến thắng'} giành chiến thắng!`
          : '⏰ Hết giờ! Trận đấu kết thúc hòa.',
      );
    } else if (reason === 'surrender') {
      this.logs.push(`🏆 ${winnerNames || 'Đối thủ'} chiến thắng do đối phương đầu hàng!`);
    } else {
      this.logs.push(`🏆 Trận đấu kết thúc (${reason}).`);
    }

    this.stop();
    // Tăng `netTick` để client (`thapStore.push`) luôn nhận khung hình cuối chứa vụ nổ Pha Lê.
    this.sim.netTick += 1;
    this.captureNetworkSnapshot(scores);
    this.hooks.changed();
    this.hooks.tick();
  }

  /** Trả về khung hình đồng bộ cho phe `idx` (chỉ gắn `me` nếu phe còn sống, không lộ `auto` đối thủ). */
  frameFor(idx?: number, full = false): ThapFrame {
    if (!this.sharedFrameCache) {
      this.captureNetworkSnapshot();
    }
    const base = this.sharedFrameCache!;
    const frame: ThapFrame = full ? { ...base, full: true } : { ...base };
    const s = idx === undefined ? undefined : this.sim.sides[idx];
    if (s && s.alive) {
      frame.me = this.privateOf(s, base.roundLeft);
    }
    return frame;
  }

  /** Danh sách tọa độ phẳng `[x0, y0, x1, y1]` của hai Trụ Pha Lê Chính. */
  baseList(): number[] {
    return this.bases.flatMap(([x, y]) => [x, y]);
  }

  /** Danh sách tọa độ phẳng `[x0, y0, x1, y1]` của hai Cổng Triệu Hồi. */
  doorList(): number[] {
    return this.doors.flatMap(([x, y]) => [x, y]);
  }

  /** Thông tin công khai của các phe cho `RoomView`. */
  publicInfo(): ThapPlayerInfo[] {
    return this.sim.sides.map((s) => ({
      idx: s.idx,
      id: s.id,
      name: s.name,
      color: s.color,
      team: s.team,
      bot: s.bot,
      alive: s.alive,
    }));
  }

  /** Tìm trạng thái phe theo `playerId`. */
  sideById(id: string): SideState | undefined {
    return this.sim.sides.find((s) => s.id === id);
  }

  /** Lấy và xóa toàn bộ nhật ký trận đấu đang chờ gửi. */
  drainLogs(): string[] {
    if (this.logs.length === 0) return [];
    const out = this.logs;
    this.logs = [];
    return out;
  }

  /** Triệu hồi trực tiếp một đơn vị lính tại `(x, y)` (tiện cho kiểm thử chiến đấu). */
  addUnit(owner: number, kind: ThapUnitKind, x: number, y: number): Unit {
    return spawnUnit(this.sim, owner, kind, x, y);
  }

  private refillCommandTokens(): void {
    const refill = THAP_CMD_REFILL / THAP_SIM_FPS;
    for (let i = 0; i < this.cmdTokens.length; i++) {
      this.cmdTokens[i] = Math.min(THAP_CMD_BURST, this.cmdTokens[i] + refill);
    }
  }

  private recordEconomyLogs(prevWave: number): void {
    if (this.sim.wave > prevWave) {
      this.logs.push(`⚔️ Đợt ${this.sim.wave} bắt đầu!`);
    }
    for (let i = 0; i < this.sim.sides.length; i++) {
      const s = this.sim.sides[i];
      if (!s.alive) continue;
      if (s.blockedPop && !this.popFullLogged[i]) {
        this.popFullLogged[i] = true;
        this.logs.push(`⚠️ ${s.name} đã chạm trần dân số (${THAP_MAX_POP}/${THAP_MAX_POP}).`);
      } else if (!s.blockedPop && this.popFullLogged[i]) {
        this.popFullLogged[i] = false;
      }
    }
  }

  private rebuildSpatialGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.sim.units.length; i++) {
      const u = this.sim.units[i];
      if (isUnitInPlay(u)) {
        this.grid.insert(u);
      }
    }
  }

  private checkMatchEnd(): boolean {
    if (this.sim.winnerTeam !== undefined) {
      this.finish(this.sim.winnerTeam, this.sim.winReason ?? 'crystal');
      return true;
    }

    if (
      this.endsAt !== undefined &&
      this.sim.startedAt + (this.sim.simTick * 1000) / THAP_SIM_FPS >= this.endsAt
    ) {
      const winnerTeam = this.resolveTimeoutWinner();
      this.finish(winnerTeam, 'time');
      return true;
    }

    return false;
  }

  private resolveTimeoutWinner(): number {
    const s0 = this.sim.sides[0];
    const s1 = this.sim.sides[1];
    if (!s0 || !s1) return s0?.team ?? s1?.team ?? -1;

    const hpRatio0 = s0.alive && s0.baseMaxHp > 0 ? s0.baseHp / s0.baseMaxHp : 0;
    const hpRatio1 = s1.alive && s1.baseMaxHp > 0 ? s1.baseHp / s1.baseMaxHp : 0;
    if (hpRatio0 !== hpRatio1) {
      return hpRatio0 > hpRatio1 ? s0.team : s1.team;
    }

    const score0 = this.scoreOf(s0);
    const score1 = this.scoreOf(s1);
    if (score0 !== score1) {
      return score0 > score1 ? s0.team : s1.team;
    }

    return -1;
  }

  private armyCost(owner: number): number {
    let cost = 0;
    for (let i = 0; i < this.sim.units.length; i++) {
      const u = this.sim.units[i];
      if (u.owner === owner && isUnitInPlay(u)) {
        cost += THAP_UNITS[u.kind].cost;
      }
    }
    return cost;
  }

  private scoreOf(s: SideState): number {
    const hpPct = s.alive && s.baseMaxHp > 0 ? (s.baseHp / s.baseMaxHp) * 100 : 0;
    const army = s.alive ? this.armyCost(s.idx) : 0;
    return Math.round(s.killsValue / 10 + s.damageToCrystal / 10 + 3 * hpPct + army / 4);
  }

  /**
   * Chụp một bản khung hình công khai duy nhất cho mỗi nhịp mạng trước khi phân phát qua `frameFor()`,
   * đảm bảo đạn/xác chết và xung `atkStartPending` không bị mất cho client thứ hai.
   */
  private captureNetworkSnapshot(precomputedScores?: number[]): void {
    const uBuf: number[] = [];
    for (let i = 0; i < this.sim.units.length; i++) {
      const u = this.sim.units[i];
      if (!isUnitInPlay(u)) continue;
      const hpPct = Math.max(0, Math.min(100, Math.round((u.hp / Math.max(1, u.maxHp)) * 100)));
      const flags = encodeUnitFlags({
        atkStart: u.atkStartPending,
        attacking: u.attacking,
        left: u.left,
        moving: u.moving,
      });
      uBuf.push(
        u.id,
        u.owner,
        KIND_INDEX[u.kind] ?? 0,
        Math.round(u.x),
        Math.round(u.y),
        hpPct,
        flags,
      );
      u.atkStartPending = false;
    }

    const shots = this.sim.pendingShots.splice(0);
    const deaths = this.sim.pendingDeaths.splice(0);
    const bh = this.sim.sides.map((s) =>
      s.alive && s.baseHp > 0
        ? Math.max(1, Math.min(100, Math.round((s.baseHp / Math.max(1, s.baseMaxHp)) * 100)))
        : 0,
    );
    const sc = precomputedScores ?? this.sim.sides.map((s) => this.scoreOf(s));
    const al = this.sim.sides.map((s) => (s.alive ? 1 : 0));
    const roundLeft = Math.max(0, Math.ceil(this.sim.roundFramesLeft / THAP_SIM_FPS));
    const roundTotalS = Math.max(1, Math.round(this.sim.roundTotalFrames / THAP_SIM_FPS));
    const lastWaveUnits: [number, number] = [
      this.sim.sides[0]?.lastWaveUnits ?? -1,
      this.sim.sides[1]?.lastWaveUnits ?? -1,
    ];

    this.sharedFrameCache = {
      tick: this.sim.netTick,
      elapsed: Math.round((this.sim.simTick * 1000) / THAP_SIM_FPS),
      u: uBuf,
      bh,
      s: shots,
      d: deaths,
      sc,
      al,
      wave: this.sim.wave,
      roundLeft,
      roundTotalS,
      lastWaveUnits,
    };
  }

  private privateOf(s: SideState, roundLeft: number): ThapPrivate {
    return {
      gold: Math.floor(s.gold),
      roundIncome: s.roundIncome,
      incomeLimit: THAP_INCOME_LIMIT,
      roundLeft,
      pop: sidePop(this.sim, s.idx),
      popCap: THAP_MAX_POP,
      auto: s.auto,
      blocked: s.blockedPop ? 'pop' : undefined,
      kills: s.kills,
      lost: s.lost,
      spawned: s.spawned,
    };
  }
}
