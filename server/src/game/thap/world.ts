/**
 * Miragine War (Thập Hùng Tranh Bá) – mô phỏng phía server (server là trọng tài, client chỉ vẽ).
 * 10 nhịp/giây. Mỗi nhịp: thu vàng + chu kỳ 30s Miragine War → huấn luyện / tự xuất quân → máy nghĩ → tính đích theo lệnh chung
 * (Hành Quân / Hành Quân Tấn Công Chỉ Định / Phòng Thủ / Tập Kết) → lính đi/đánh (công thức sát thương Giáp Nhẹ/Nặng chuẩn Miragine War)
 * → tách lính chồng nhau → Pha Lê Chính bắn → đạn bay → chiếm mỏ → dọn xác / loại phe → điểm → kết thúc → gửi khung hình.
 */
import {
  THAP_AGGRO,
  THAP_ATK_PER_LEVEL,
  THAP_BASE,
  THAP_BASE_INCOME,
  THAP_CMD_BURST,
  THAP_CMD_REFILL,
  THAP_DEFEND_CHASE,
  THAP_DEFEND_RADIUS,
  THAP_ECO_PER_LEVEL,
  THAP_FIRST_ROUND_S,
  THAP_HP_PER_LEVEL,
  THAP_INCOME_LIMIT,
  THAP_MAX_POP,
  THAP_MAX_QUEUE,
  THAP_MINE,
  THAP_ROUND_S,
  THAP_SHOT_ARROW,
  THAP_SHOT_BASE,
  THAP_SHOT_HEAL,
  THAP_SPAWN_INTERVAL_TICKS,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_TEAM_NAMES,
  THAP_TICK_MS,
  THAP_UNITS,
  THAP_UNIT_KINDS,
  THAP_UPGRADES,
  THAP_UPGRADE_TRACKS,
  THAP_FLAG_ATTACK,
  THAP_FLAG_HEAL,
  THAP_FLAG_LEFT,
  miragineDamage,
  thapCounter,
  thapLayout,
  thapUpgradeCost,
  type ThapCommand,
  type ThapConfig,
  type ThapFrame,
  type ThapPlayerInfo,
  type ThapPrivate,
  type ThapQueueItem,
  type ThapStance,
  type ThapUnitKind,
  type ThapUpgradeTrack,
} from '../../../../shared/src';
import { runBot, type ThapBrain } from './bot';

const DT = THAP_TICK_MS / 1000;
const GRID_CELL = 96;
const GRID_KEY = 10000;
/** đổi mục tiêu là Pha Lê Chính sang số âm: Pha Lê của phe idx = -1 - idx */
const baseRef = (idx: number) => -1 - idx;
const isBaseRef = (ref: number) => ref < 0;
const baseIdxOf = (ref: number) => -1 - ref;

export interface ThapSide {
  idx: number;
  id: string;
  name: string;
  color: string;
  team: number;
  bot: boolean;
  alive: boolean;
  gold: number;
  /** Thu nhập mỗi vòng 30s chuẩn Miragine War (khởi đầu 100, cộng thêm khi gọi lính, tối đa 8000) */
  roundIncome: number;
  queue: ThapQueueItem[];
  auto: ThapUnitKind | null;
  stance: ThapStance;
  /** idx phe đang nhắm khi stance = 'attack' (-1 = không) */
  target: number;
  rally: [number, number];
  upgrades: Record<ThapUpgradeTrack, number>;
  /** số lính địch đã hạ */
  kills: number;
  /** tổng giá lính địch đã hạ */
  killsValue: number;
  /** số lính mình đã mất */
  lost: number;
  /** chống spam lệnh */
  tokens: number;
  brain?: ThapBrain;
  resigned?: boolean;
  baseHp: number;
  /** hướng từ Căn cứ Pha Lê ra giữa bản đồ */
  facing: number;
  /** số lính đã ra (đánh số chỗ đứng trong đội hình) */
  spawned: number;
  /** quân số hiện tại (tính lại mỗi nhịp) */
  pop: number;
  /** số mỏ đang giữ (tính lại mỗi nhịp) */
  mines: number;
  /** điểm đến chung theo lệnh (tính lại vài nhịp một lần) */
  goal?: { x: number; y: number; base: number; mine: number; threat?: number };
  baseCd: number;
}

export interface ThapUnit {
  id: number;
  owner: number;
  team: number;
  kind: ThapUnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cd: number;
  /** mục tiêu đang đánh: id lính (>0) hoặc Pha Lê Chính (baseRef) */
  engage?: number;
  /** chỗ đứng trong đội hình */
  slot: number;
  /** thời gian còn hiện cờ đánh / hồi máu */
  attacking: number;
  healing: number;
  left: boolean;
  lastHitBy?: number;
}

export interface ThapMine {
  x: number;
  y: number;
  big: boolean;
  owner: number;
  /** phe đang chiếm / đang giành */
  cap: number;
  prog: number;
  everOwned: boolean;
}

interface Projectile {
  owner: number;
  /** undefined = đạn của Pha Lê Chính */
  kind?: ThapUnitKind;
  dmg: number;
  target: number;
  hitAt: number;
  tx: number;
  ty: number;
  attacker: number;
}

export interface ThapWorldHooks {
  /** gọi sau mỗi nhịp để gửi khung hình */
  tick(): void;
  /** có phe bị loại / có nhật ký mới / ván kết thúc: cần cập nhật RoomView */
  changed(): void;
}

export interface ThapInit { id: string; name: string; color: string; team: number; bot: boolean }

export interface ThapResult { winnerTeam: number; winnerIdxs: number[]; reason: string; scores: number[] }

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const KIND_INDEX: Record<ThapUnitKind, number> = Object.fromEntries(THAP_UNIT_KINDS.map((k, i) => [k, i])) as Record<ThapUnitKind, number>;
const GOLDEN = 2.39996;

export class ThapWorld {
  readonly W: number;
  readonly H: number;
  sides: ThapSide[] = [];
  units = new Map<number, ThapUnit>();
  mines: ThapMine[] = [];
  bases: [number, number][] = [];
  tickNo = 0;
  elapsed = 0;
  readonly startedAt = Date.now();
  endsAt?: number;
  result?: ThapResult;
  private seq = 0;
  private timer?: NodeJS.Timeout;
  private shots: number[] = [];
  private deaths: number[] = [];
  private projectiles: Projectile[] = [];
  private grid = new Map<number, ThapUnit[]>();
  private logs: string[] = [];
  private fullCache?: ThapFrame;
  private scoreCache: number[] = [];
  private dirty = false;

  constructor(inits: ThapInit[], readonly config: ThapConfig, private hooks: ThapWorldHooks) {
    const n = inits.length;
    const layout = thapLayout(n);
    this.W = layout.W;
    this.H = layout.H;
    this.bases = layout.bases;
    this.mines = layout.mines.map((m) => ({ ...m, owner: -1, cap: -1, prog: 0, everOwned: false }));
    if (config.minutes > 0) this.endsAt = this.startedAt + config.minutes * 60_000;
    const cx = this.W / 2, cy = this.H / 2;
    inits.forEach((init, idx) => {
      const [bx, by] = this.bases[idx];
      const facing = Math.atan2(cy - by, cx - bx);
      const s: ThapSide = {
        idx, id: init.id, name: init.name, color: init.color, team: init.team, bot: init.bot, alive: true,
        gold: THAP_START_GOLD, roundIncome: THAP_START_ROUND_INCOME, queue: [], auto: 'newbie', stance: 'attack', target: -1,
        rally: [Math.round(bx + Math.cos(facing) * 220), Math.round(by + Math.sin(facing) * 220)],
        upgrades: { atk: 0, hp: 0, eco: 0 }, kills: 0, killsValue: 0, lost: 0, tokens: THAP_CMD_BURST,
        baseHp: THAP_BASE.hp, facing, spawned: 0, pop: 0, mines: 0, baseCd: 1 + Math.random() * 0.5,
      };
      if (init.bot) s.brain = { level: config.botLevel, nextThink: Math.random(), waves: 0, attackTarget: -1, mix: Math.random(), attacking: true };
      this.sides.push(s);
    });
    // Chuẩn 100% Miragine War: khởi đầu 0 vàng, 100 thu nhập, chọn sẵn Newbie (ô 0), mặc định Tấn Công Chỉ Định vào căn cứ địch gần nhất
    for (const s of this.sides) {
      const [bx, by] = this.bases[s.idx];
      s.target = this.nearestEnemyBase(s, bx, by);
      this.updateGoal(s);
    }
    this.recount();
    this.scoreCache = this.sides.map((s) => this.score(s));
  }

  // ---------------- vòng đời ----------------

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.step();
      } catch (error) {
        console.error('[ThapWorld] lỗi mô phỏng', error);
      }
    }, THAP_TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  get running() {
    return !!this.timer;
  }

  drainLogs() {
    const l = this.logs;
    this.logs = [];
    return l;
  }

  sideById(id: string) {
    return this.sides.find((s) => s.id === id);
  }

  allied(a: number, b: number) {
    const sa = this.sides[a], sb = this.sides[b];
    return !!sa && !!sb && sa.team === sb.team;
  }

  resign(idx: number) {
    const s = this.sides[idx];
    if (!s || !s.alive) return;
    s.resigned = true;
    s.baseHp = 0;
  }

  publicInfo(): ThapPlayerInfo[] {
    return this.sides.map((s) => ({ idx: s.idx, id: s.id, name: s.name, color: s.color, team: s.team, bot: s.bot, alive: s.alive }));
  }

  baseList() {
    return this.bases.flatMap(([x, y]) => [x, y]);
  }

  mineList() {
    return this.mines.flatMap((m) => [m.x, m.y, m.big ? 1 : 0]);
  }

  /** Tên hiển thị của 1 đội (ffa: tên phe) */
  teamName(team: number) {
    if (this.config.mode === 'teams') return THAP_TEAM_NAMES[team] ?? `Đội ${team + 1}`;
    if (this.config.mode === 'coop') return team === 0 ? 'Liên quân người chơi' : 'Liên quân máy';
    return this.sides.find((s) => s.team === team)?.name ?? `Phe ${team + 1}`;
  }

  step() {
    if (this.result) return;
    this.tickNo++;
    this.elapsed += THAP_TICK_MS;
    this.shots = [];
    this.deaths = [];
    this.fullCache = undefined;

    this.recount();
    this.income();
    this.produce();
    this.rebuildGrid();
    if (this.tickNo % 5 === 0) for (const s of this.sides) if (s.bot && s.alive && s.brain) runBot(this, s);
    for (const s of this.sides) if (s.alive && (!s.goal || this.tickNo % 5 === s.idx % 5)) this.updateGoal(s);
    for (const u of this.units.values()) this.updateUnit(u);
    this.separate();
    for (const s of this.sides) this.baseFire(s);
    this.flyProjectiles();
    this.updateMines();
    for (const s of this.sides) s.tokens = Math.min(THAP_CMD_BURST, s.tokens + THAP_CMD_REFILL * DT);
    this.reap();
    if (this.tickNo % 10 === 0) this.scoreCache = this.sides.map((s) => this.score(s));
    this.checkEnd();
    if (this.dirty || this.logs.length) {
      this.dirty = false;
      this.hooks.changed();
    }
    this.hooks.tick();
  }

  // ---------------- vàng & huấn luyện ----------------

  /** Đếm lại quân số và số mỏ của từng phe */
  private recount() {
    for (const s of this.sides) { s.pop = 0; s.mines = 0; }
    for (const u of this.units.values()) if (u.hp > 0) this.sides[u.owner].pop += THAP_UNITS[u.kind].pop;
    for (const m of this.mines) if (m.owner >= 0) this.sides[m.owner].mines++;
  }

  incomeOf(s: ThapSide) {
    if (!s.alive) return 0;
    let inc = THAP_BASE_INCOME + THAP_ECO_PER_LEVEL * s.upgrades.eco;
    for (const m of this.mines) if (m.owner === s.idx) inc += m.big ? THAP_MINE.bigIncome : THAP_MINE.income;
    return inc;
  }

  private income() {
    const firstTicks = THAP_FIRST_ROUND_S * 10;
    const roundTicks = THAP_ROUND_S * 10;
    const isRoundBonus =
      this.tickNo === firstTicks || (this.tickNo > firstTicks && (this.tickNo - firstTicks) % roundTicks === 0);
    for (const s of this.sides) {
      if (!s.alive) continue;
      s.gold += this.incomeOf(s) * DT;
      // Chuẩn 100% Miragine War: đợt đầu tiên sau 6 giây, các đợt sau mỗi 30 giây nhận thêm roundIncome vàng
      if (isRoundBonus) {
        s.gold += s.roundIncome;
      }
    }
  }

  popOf(idx: number) {
    let pop = 0;
    for (const u of this.units.values()) if (u.owner === idx && u.hp > 0) pop += THAP_UNITS[u.kind].pop;
    return pop;
  }

  /** Con đang chọn có đang bị chặn vì chạm trần 60 dân số không */
  blockedOf(s: ThapSide): 'pop' | undefined {
    const kind = s.auto ?? s.queue[0]?.kind;
    if (!kind) return undefined;
    return s.pop + THAP_UNITS[kind].pop > THAP_MAX_POP ? 'pop' : undefined;
  }

  private produce() {
    if (this.tickNo % THAP_SPAWN_INTERVAL_TICKS !== 0) return;
    for (const s of this.sides) {
      if (!s.alive) continue;
      if (s.queue.length) {
        const q = s.queue[0];
        const st = THAP_UNITS[q.kind];
        if (s.pop + st.pop <= THAP_MAX_POP) {
          s.queue.shift();
          this.spawn(s, q.kind);
          s.pop += st.pop;
        }
        continue;
      }
      if (!s.auto) continue;
      const st = THAP_UNITS[s.auto];
      // Cơ chế Cổng Triệu Hồi (door.png) chuẩn 100% Miragine War:
      // Đủ vàng & chưa chạm trần 60 dân số -> lập tức xuất 1 lính, trừ vàng và cộng +incomeBonus vào thu nhập vòng!
      // Nếu chọn lính đắt hơn vàng hiện có -> tự động tích vàng qua các vòng cho tới khi đủ mua!
      if (s.gold >= st.cost && s.pop + st.pop <= THAP_MAX_POP) {
        s.gold -= st.cost;
        s.roundIncome = Math.min(THAP_INCOME_LIMIT, s.roundIncome + st.incomeBonus);
        this.spawn(s, s.auto);
        s.pop += st.pop;
      }
    }
  }

  private spawn(s: ThapSide, kind: ThapUnitKind) {
    const [bx, by] = this.bases[s.idx];
    const a = s.facing + rnd(-0.6, 0.6);
    const u = this.addUnit(s.idx, kind, bx + Math.cos(a) * 90, by + Math.sin(a) * 90);
    return u;
  }

  /** Thêm lính (dùng cả trong test) */
  addUnit(owner: number, kind: ThapUnitKind, x: number, y: number): ThapUnit {
    const st = THAP_UNITS[kind];
    const s = this.sides[owner];
    const maxHp = st.hp * (1 + THAP_HP_PER_LEVEL * (s?.upgrades.hp ?? 0));
    const u: ThapUnit = {
      id: ++this.seq, owner, team: s?.team ?? owner, kind, x, y, hp: maxHp, maxHp, cd: Math.random() * 0.3,
      slot: s ? s.spawned++ : 0, attacking: 0, healing: 0, left: Math.cos(s?.facing ?? 0) < 0,
    };
    this.collide(u);
    this.units.set(u.id, u);
    return u;
  }

  // ---------------- lệnh từ người chơi ----------------

  /** Trả về thông báo lỗi (nếu có) để hiện cho người chơi */
  command(idx: number, cmd: ThapCommand): string | undefined {
    const s = this.sides[idx];
    if (!s || !s.alive || this.result) return 'Thành của bạn không còn nữa.';
    if (!cmd || typeof cmd !== 'object') return 'Lệnh không hợp lệ.';
    if (s.tokens < 1) return undefined;
    s.tokens -= 1;
    const validKind = (k: unknown): k is ThapUnitKind => typeof k === 'string' && (THAP_UNIT_KINDS as string[]).includes(k);
    switch (cmd.t) {
      case 'train': {
        if (!validKind(cmd.kind)) return 'Loại lính không hợp lệ.';
        s.auto = cmd.kind;
        return undefined;
      }
      case 'cancel': {
        if (!validKind(cmd.kind)) return 'Loại lính không hợp lệ.';
        const st = THAP_UNITS[cmd.kind];
        for (let i = s.queue.length - 1; i >= 0; i--) {
          if (s.queue[i].kind !== cmd.kind) continue;
          s.queue.splice(i, 1);
          s.gold += st.cost;
          s.roundIncome = Math.max(THAP_START_ROUND_INCOME, s.roundIncome - st.incomeBonus);
          return undefined;
        }
        return undefined;
      }
      case 'auto': {
        if (cmd.kind === null) { s.auto = null; return undefined; }
        if (!validKind(cmd.kind)) return 'Loại lính không hợp lệ.';
        s.auto = cmd.kind;
        return undefined;
      }
      case 'stance': {
        if (cmd.stance !== 'advance' && cmd.stance !== 'defend') return 'Lệnh không hợp lệ.';
        if (cmd.stance === 'advance') {
          const [hx, hy] = this.bases[s.idx];
          const next = this.nearestEnemyBase(s, hx, hy);
          if (next >= 0) {
            s.target = next;
            this.setStance(s, 'attack');
            return undefined;
          }
        }
        this.setStance(s, cmd.stance);
        return undefined;
      }
      case 'attack': {
        const t = Math.floor(Number(cmd.target));
        const o = Number.isFinite(t) ? this.sides[t] : undefined;
        if (!o || o.idx === idx || !o.alive || o.team === s.team) return 'Không thể tấn công phe này.';
        s.target = t;
        this.setStance(s, 'attack');
        return undefined;
      }
      case 'rally': {
        const x = Number(cmd.x), y = Number(cmd.y);
        if (typeof cmd.x !== 'number' || typeof cmd.y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return 'Vị trí không hợp lệ.';
        s.rally = [Math.round(Math.max(20, Math.min(this.W - 20, x))), Math.round(Math.max(20, Math.min(this.H - 20, y)))];
        this.setStance(s, 'rally');
        return undefined;
      }
      case 'upgrade': {
        const track = cmd.track;
        if (typeof track !== 'string' || !(THAP_UPGRADE_TRACKS as string[]).includes(track)) return 'Nâng cấp không hợp lệ.';
        const lv = s.upgrades[track];
        if (lv >= THAP_UPGRADES[track].max) return 'Đã nâng cấp tối đa.';
        const cost = thapUpgradeCost(track, lv);
        if (s.gold < cost) return 'Không đủ vàng.';
        s.gold -= cost;
        s.upgrades[track] = lv + 1;
        if (track === 'hp') {
          const ratio = (1 + THAP_HP_PER_LEVEL * (lv + 1)) / (1 + THAP_HP_PER_LEVEL * lv);
          for (const u of this.units.values()) if (u.owner === idx && u.hp > 0) { u.maxHp *= ratio; u.hp *= ratio; }
        }
        return undefined;
      }
      default:
        return 'Lệnh không hợp lệ.';
    }
  }

  /** Đổi lệnh chung: cả đạo quân bỏ trận đang đánh, theo lệnh mới ngay */
  private setStance(s: ThapSide, stance: ThapStance) {
    s.stance = stance;
    if (stance !== 'attack') s.target = -1;
    for (const u of this.units.values()) if (u.owner === s.idx) { u.engage = undefined; u.lastHitBy = undefined; }
    this.updateGoal(s);
  }

  // ---------------- lệnh chung → điểm đến ----------------

  /** Phe địch còn Pha Lê gần điểm (x, y) nhất */
  nearestEnemyBase(s: ThapSide, x: number, y: number): number {
    let best = -1, bd = Infinity;
    for (const o of this.sides) {
      if (!o.alive || o.team === s.team) continue;
      const [bx, by] = this.bases[o.idx];
      const d = dist2(bx, by, x, y);
      if (d < bd) { bd = d; best = o.idx; }
    }
    return best;
  }

  private updateGoal(s: ThapSide) {
    const [hx, hy] = this.bases[s.idx];
    if (s.stance === 'attack') {
      let t: ThapSide | undefined = this.sides[s.target];
      if (!t || !t.alive || t.team === s.team) {
        // Pha Lê mục tiêu đã nổ: tự động chuyển mục tiêu sang Pha Lê địch gần nhất còn sống
        const next = this.nearestEnemyBase(s, hx, hy);
        s.target = next;
        t = next >= 0 ? this.sides[next] : undefined;
      }
      if (t && t.alive && t.team !== s.team) {
        const [bx, by] = this.bases[t.idx];
        s.goal = { x: bx, y: by, base: t.idx, mine: -1 };
        return;
      }
    }
    if (s.stance === 'defend') {
      // địch gần Pha Lê nhất trong vùng Phòng Thủ: cả đạo quân cùng ra chặn
      let threat: number | undefined, td = Infinity;
      if (this.grid.size) this.near(hx, hy, THAP_DEFEND_CHASE, (o) => {
        if (o.team === s.team) return;
        const d = dist2(o.x, o.y, hx, hy);
        if (d < td) { td = d; threat = o.id; }
      });
      s.goal = { x: hx, y: hy, base: -1, mine: -1, threat };
      return;
    }
    if (s.stance === 'rally') {
      s.goal = { x: s.rally[0], y: s.rally[1], base: -1, mine: -1 };
      return;
    }
    // Hành Quân: mỏ gần đạo quân nhất chưa thuộc phe mình / đồng minh; hết mỏ thì Pha Lê địch gần nhất
    let ax = 0, ay = 0, n = 0;
    for (const u of this.units.values()) if (u.owner === s.idx) { ax += u.x; ay += u.y; n++; }
    const cx = n ? ax / n : hx, cy = n ? ay / n : hy;
    let mine = -1, md = Infinity;
    this.mines.forEach((m, i) => {
      if (m.owner >= 0 && this.allied(m.owner, s.idx)) return;
      const d = Math.sqrt(dist2(m.x, m.y, cx, cy)) + 0.35 * Math.sqrt(dist2(m.x, m.y, hx, hy));
      const sticky = s.goal?.mine === i ? 0.8 : 1;
      if (d * sticky < md) { md = d * sticky; mine = i; }
    });
    if (mine >= 0) {
      s.goal = { x: this.mines[mine].x, y: this.mines[mine].y, base: -1, mine };
      return;
    }
    const b = this.nearestEnemyBase(s, hx, hy);
    if (b >= 0) s.goal = { x: this.bases[b][0], y: this.bases[b][1], base: b, mine: -1 };
    else s.goal = { x: hx, y: hy, base: -1, mine: -1 };
  }

  /** Chỗ đứng của lính trong đội hình quanh điểm đến */
  private slotPos(u: ThapUnit, s: ThapSide): [number, number] {
    const g = s.goal!;
    if (s.stance === 'defend') {
      const k = u.slot % 40;
      const ring = Math.floor(k / 10);
      const pos = k % 10;
      const a = s.facing + (pos - 4.5) * 0.3 + (ring % 2) * 0.15;
      const r = Math.min(THAP_DEFEND_RADIUS - 30, THAP_BASE.radius + 70 + ring * 42);
      return [g.x + Math.cos(a) * r, g.y + Math.sin(a) * r];
    }
    const k = u.slot % 40;
    const spread = g.mine >= 0 ? 13 : 17;
    const r = spread * Math.sqrt(k + 0.5);
    const a = k * GOLDEN;
    return [g.x + Math.cos(a) * r, g.y + Math.sin(a) * r];
  }

  // ---------------- lính ----------------

  private rebuildGrid() {
    this.grid.clear();
    for (const u of this.units.values()) {
      const k = Math.floor(u.x / GRID_CELL) * GRID_KEY + Math.floor(u.y / GRID_CELL);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(u);
    }
  }

  /** Duyệt lính còn sống trong bán kính r quanh (x, y) */
  near(x: number, y: number, r: number, fn: (u: ThapUnit) => void) {
    const x0 = Math.floor((x - r) / GRID_CELL), x1 = Math.floor((x + r) / GRID_CELL);
    const y0 = Math.floor((y - r) / GRID_CELL), y1 = Math.floor((y + r) / GRID_CELL);
    const r2 = r * r;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const a = this.grid.get(gx * GRID_KEY + gy);
        if (!a) continue;
        for (const u of a) if (u.hp > 0 && dist2(u.x, u.y, x, y) <= r2) fn(u);
      }
    }
  }

  /** Vị trí + bán kính + đội của mục tiêu còn sống */
  private targetOf(ref: number): { x: number; y: number; r: number; team: number; kind?: ThapUnitKind } | undefined {
    if (isBaseRef(ref)) {
      const s = this.sides[baseIdxOf(ref)];
      if (!s || !s.alive || s.baseHp <= 0) return undefined;
      const [x, y] = this.bases[s.idx];
      return { x, y, r: THAP_BASE.radius, team: s.team };
    }
    const u = this.units.get(ref);
    if (!u || u.hp <= 0) return undefined;
    return { x: u.x, y: u.y, r: THAP_UNITS[u.kind].radius, team: u.team, kind: u.kind };
  }

  /** Mục tiêu có còn nằm trong vùng lệnh chung cho phép đuổi theo không */
  private allowedChase(s: ThapSide, u: ThapUnit, tx: number, ty: number, ref: number, slack: number) {
    if (s.stance === 'defend') {
      if (isBaseRef(ref)) return false;
      const [hx, hy] = this.bases[s.idx];
      return dist2(tx, ty, hx, hy) <= (THAP_DEFEND_CHASE + slack) ** 2;
    }
    if (s.stance === 'rally') return dist2(tx, ty, s.rally[0], s.rally[1]) <= (THAP_AGGRO + 120 + slack) ** 2;
    if (s.stance === 'attack' && isBaseRef(ref)) return baseIdxOf(ref) === s.target;
    return dist2(tx, ty, u.x, u.y) <= (THAP_AGGRO + 60 + slack) ** 2 || isBaseRef(ref);
  }

  /** Tìm địch gần nhất trong tầm nhìn (ưu tiên loại mình khắc chế theo Giáp Nhẹ/Nặng) */
  private acquire(u: ThapUnit, s: ThapSide): number | undefined {
    const st = THAP_UNITS[u.kind];
    let best: number | undefined;
    let bs = Infinity;
    this.near(u.x, u.y, THAP_AGGRO, (o) => {
      if (o.team === u.team) return;
      if (!this.allowedChase(s, u, o.x, o.y, o.id, 0)) return;
      const d = Math.sqrt(dist2(o.x, o.y, u.x, u.y));
      let score = d / Math.max(0.4, thapCounter(u.kind, o.kind));
      if (st.minRange && d - st.radius - THAP_UNITS[o.kind].radius < st.minRange) score += 1000;
      if (score < bs) { bs = score; best = o.id; }
    });
    if (best !== undefined) return best;
    const threat = s.stance === 'defend' ? s.goal?.threat : undefined;
    if (threat !== undefined) {
      const t = this.targetOf(threat);
      if (t && t.team !== u.team && this.allowedChase(s, u, t.x, t.y, threat, 0)) return threat;
    }
    for (const o of this.sides) {
      if (!o.alive || o.team === u.team) continue;
      const [bx, by] = this.bases[o.idx];
      const edge = Math.sqrt(dist2(bx, by, u.x, u.y)) - THAP_BASE.radius;
      if (edge > THAP_AGGRO) continue;
      const ref = baseRef(o.idx);
      if (!this.allowedChase(s, u, bx, by, ref, 0)) continue;
      if (edge < bs) { bs = edge; best = ref; }
    }
    return best;
  }

  private updateUnit(u: ThapUnit) {
    if (u.hp <= 0) return;
    const s = this.sides[u.owner];
    if (!s || !s.alive) return;
    const st = THAP_UNITS[u.kind];
    u.cd = Math.max(0, u.cd - DT);
    u.attacking = Math.max(0, u.attacking - DT);
    u.healing = Math.max(0, u.healing - DT);

    if (st.heal) {
      this.healerStep(u, s);
      return;
    }

    if (u.engage === undefined && u.lastHitBy !== undefined) {
      const t = this.targetOf(u.lastHitBy);
      if (t && t.team !== u.team && this.allowedChase(s, u, t.x, t.y, u.lastHitBy, 0)) u.engage = u.lastHitBy;
    }
    u.lastHitBy = undefined;

    if (u.engage !== undefined) {
      const t = this.targetOf(u.engage);
      if (!t || t.team === u.team || !this.allowedChase(s, u, t.x, t.y, u.engage, 60)) u.engage = undefined;
    }

    if (this.tickNo % 3 === u.id % 3) {
      if (u.engage === undefined) u.engage = this.acquire(u, s);
      else {
        const t = this.targetOf(u.engage)!;
        const inReach = this.edge(u, t) <= st.range + 4;
        if (isBaseRef(u.engage) || !inReach) {
          const alt = this.acquire(u, s);
          if (alt !== undefined && !isBaseRef(alt)) u.engage = alt;
        }
      }
    }

    if (u.engage !== undefined) {
      const t = this.targetOf(u.engage);
      if (t) {
        this.attackStep(u, u.engage, t);
        return;
      }
      u.engage = undefined;
    }

    const g = s.goal;
    if (!g) return;
    if (g.base >= 0 && (s.stance === 'advance' || s.stance === 'attack')) {
      const [bx, by] = this.bases[g.base];
      if (Math.sqrt(dist2(bx, by, u.x, u.y)) - THAP_BASE.radius <= THAP_AGGRO) {
        u.engage = baseRef(g.base);
        const t = this.targetOf(u.engage);
        if (t) this.attackStep(u, u.engage, t);
        return;
      }
      this.moveToward(u, bx, by, THAP_BASE.radius + THAP_AGGRO - 20);
      return;
    }
    const [px, py] = this.slotPos(u, s);
    this.moveToward(u, px, py, 8);
  }

  private edge(u: ThapUnit, t: { x: number; y: number; r: number }) {
    return Math.sqrt(dist2(u.x, u.y, t.x, t.y)) - THAP_UNITS[u.kind].radius - t.r;
  }

  private healerStep(u: ThapUnit, s: ThapSide) {
    const st = THAP_UNITS[u.kind];
    let best: ThapUnit | undefined;
    let worst = 0.999;
    let bestInRange: ThapUnit | undefined;
    let worstIn = 0.999;
    this.near(u.x, u.y, st.range + 140, (o) => {
      if (o.team !== u.team || o.id === u.id || o.hp >= o.maxHp) return;
      const ratio = o.hp / o.maxHp;
      if (ratio < worst) { worst = ratio; best = o; }
      if (ratio < worstIn && Math.sqrt(dist2(o.x, o.y, u.x, u.y)) - st.radius - THAP_UNITS[o.kind].radius <= st.range) {
        worstIn = ratio;
        bestInRange = o;
      }
    });
    if (bestInRange && u.cd <= 0) {
      const b = bestInRange as ThapUnit;
      u.cd = st.cd;
      u.healing = 0.5;
      b.hp = Math.min(b.maxHp, b.hp + st.heal! * st.cd);
      u.left = b.x < u.x;
      this.shots.push(Math.round(u.x), Math.round(u.y), Math.round(b.x), Math.round(b.y), THAP_SHOT_HEAL, b.id, 300);
    }
    if (best) {
      const b = best as ThapUnit;
      if (this.allowedChase(s, u, b.x, b.y, b.id, 0)) {
        this.moveToward(u, b.x, b.y, st.range * 0.7);
        return;
      }
    }
    const g = s.goal;
    if (!g) return;
    if (g.base >= 0 && (s.stance === 'advance' || s.stance === 'attack')) {
      const [bx, by] = this.bases[g.base];
      this.moveToward(u, bx, by, THAP_BASE.radius + THAP_BASE.range + 40);
      return;
    }
    const [px, py] = this.slotPos(u, s);
    this.moveToward(u, px, py, 8);
  }

  private attackStep(u: ThapUnit, ref: number, t: { x: number; y: number; r: number; kind?: ThapUnitKind }) {
    const st = THAP_UNITS[u.kind];
    const d = Math.sqrt(dist2(u.x, u.y, t.x, t.y));
    const edge = d - st.radius - t.r;
    if (edge > st.range + 4) {
      this.moveToward(u, t.x, t.y, st.radius + t.r + st.range);
      return;
    }
    if (st.minRange && edge < st.minRange) {
      const k = d || 1;
      this.moveToward(u, u.x + ((u.x - t.x) / k) * 60, u.y + ((u.y - t.y) / k) * 60, 0);
      return;
    }
    u.left = t.x < u.x;
    if (u.cd > 0) return;
    const s = this.sides[u.owner];
    u.cd = st.cd;
    u.attacking = 0.45;
    const atkMult = 1 + THAP_ATK_PER_LEVEL * s.upgrades.atk;
    // Sát thương chuẩn Miragine War: damage[victim.armorTypeID] * atkMult - victim.armor
    const dmg = t.kind ? miragineDamage(u.kind, t.kind, atkMult) : Math.round(st.atk * atkMult * (st.siege ?? 1));
    if (st.shot !== undefined) {
      const ms = Math.round(Math.min(900, 120 + d * (st.shot === THAP_SHOT_ARROW ? 1.4 : 2.0)));
      this.shots.push(Math.round(u.x), Math.round(u.y), Math.round(t.x), Math.round(t.y), st.shot, isBaseRef(ref) ? -1 : ref, ms);
      this.projectiles.push({ owner: u.owner, kind: u.kind, dmg, target: ref, hitAt: this.elapsed + ms, tx: t.x, ty: t.y, attacker: u.id });
    } else {
      this.applyHit(u.owner, u.kind, dmg, ref, u.id, t.x, t.y);
    }
  }

  /** Trúng đòn: sát thương chính + lan 50% lên địch quanh điểm trúng */
  private applyHit(owner: number, kind: ThapUnitKind | undefined, dmg: number, ref: number, attacker: number, x: number, y: number) {
    this.damage(owner, ref, dmg, attacker);
    const st = kind ? THAP_UNITS[kind] : undefined;
    if (st?.splash) {
      const team = this.sides[owner]?.team;
      const atkMult = 1 + THAP_ATK_PER_LEVEL * (this.sides[owner]?.upgrades.atk ?? 0);
      this.near(x, y, st.splash, (o) => {
        if (o.team === team || o.id === ref) return;
        this.damage(owner, o.id, miragineDamage(kind!, o.kind, atkMult) * 0.5, attacker);
      });
    }
  }

  private damage(owner: number, ref: number, amount: number, attacker: number) {
    const src = this.sides[owner];
    if (isBaseRef(ref)) {
      const s = this.sides[baseIdxOf(ref)];
      if (!s || !s.alive || s.baseHp <= 0 || (src && src.team === s.team)) return;
      s.baseHp = Math.max(0, s.baseHp - amount);
      return;
    }
    const u = this.units.get(ref);
    if (!u || u.hp <= 0 || (src && src.team === u.team)) return;
    u.hp -= amount;
    if (attacker > 0) u.lastHitBy = attacker;
    if (u.hp <= 0) {
      if (src) {
        src.kills++;
        src.killsValue += THAP_UNITS[u.kind].cost;
      }
      const victim = this.sides[u.owner];
      if (victim) victim.lost++;
    }
  }

  /** Đi về phía (tx, ty), dừng cách stopAt; lái vòng qua Pha Lê. Trả về khoảng cách còn lại. */
  private moveToward(u: ThapUnit, tx: number, ty: number, stopAt: number) {
    let dx = tx - u.x;
    let dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d <= stopAt) return d;
    dx /= d;
    dy /= d;
    const st = THAP_UNITS[u.kind];
    const step = Math.min(st.speed * DT, d - stopAt);
    const look = st.radius + 50;
    let sx = 0, sy = 0;
    for (let i = 0; i < this.sides.length; i++) {
      if (!this.sides[i].alive) continue;
      const [ox, oy] = this.bases[i];
      const or = THAP_BASE.radius;
      const rx = ox - u.x, ry = oy - u.y;
      const along = rx * dx + ry * dy;
      if (along <= 0 || along > or + look) continue;
      const perp = rx * -dy + ry * dx;
      const clear = or + st.radius + 4;
      if (Math.abs(perp) >= clear) continue;
      if (dist2(ox, oy, tx, ty) < (or + stopAt + 2) ** 2) continue;
      const side = perp > 0 ? -1 : 1;
      const w = (1 - Math.abs(perp) / clear) * 1.6;
      sx += -dy * side * w;
      sy += dx * side * w;
    }
    if (sx || sy) {
      dx += sx;
      dy += sy;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L;
      dy /= L;
    }
    u.x += dx * step;
    u.y += dy * step;
    if (Math.abs(dx) > 0.2) u.left = dx < 0;
    this.collide(u);
    return Math.hypot(tx - u.x, ty - u.y);
  }

  private collide(u: ThapUnit) {
    const st = THAP_UNITS[u.kind];
    for (let i = 0; i < this.sides.length; i++) {
      if (!this.sides[i]?.alive) continue;
      const [ox, oy] = this.bases[i];
      const min = THAP_BASE.radius + st.radius - 2;
      const dx = u.x - ox, dy = u.y - oy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      u.x = ox + (dx / d) * min;
      u.y = oy + (dy / d) * min;
    }
    u.x = Math.max(st.radius, Math.min(this.W - st.radius, u.x));
    u.y = Math.max(st.radius, Math.min(this.H - st.radius, u.y));
  }

  /** Lính không chồng lên nhau */
  private separate() {
    for (const a of this.grid.values()) {
      for (const u of a) {
        if (u.hp <= 0) continue;
        const su = THAP_UNITS[u.kind];
        this.near(u.x, u.y, su.radius + 16, (o) => {
          if (o.id <= u.id) return;
          const so = THAP_UNITS[o.kind];
          const min = su.radius + so.radius;
          const dx = o.x - u.x, dy = o.y - u.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) return;
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = d < 0.02 ? Math.random() - 0.5 : dx / d;
          const ny = d < 0.02 ? Math.random() - 0.5 : dy / d;
          const wu = so.radius / min, wo = su.radius / min;
          u.x -= nx * push * wu;
          u.y -= ny * push * wu;
          o.x += nx * push * wo;
          o.y += ny * push * wo;
        });
        this.collide(u);
      }
    }
  }

  // ---------------- Pha Lê Chính bắn ----------------

  private baseFire(s: ThapSide) {
    if (!s.alive || s.baseHp <= 0) return;
    s.baseCd = Math.max(0, s.baseCd - DT);
    if (s.baseCd > 0) return;
    const [bx, by] = this.bases[s.idx];
    let best: ThapUnit | undefined;
    let bd = Infinity;
    this.near(bx, by, THAP_BASE.radius + THAP_BASE.range + 14, (o) => {
      if (o.team === s.team) return;
      const edge = Math.sqrt(dist2(o.x, o.y, bx, by)) - THAP_BASE.radius - THAP_UNITS[o.kind].radius;
      if (edge > THAP_BASE.range) return;
      if (edge < bd) { bd = edge; best = o; }
    });
    if (!best) return;
    const t = best as ThapUnit;
    s.baseCd = THAP_BASE.cd;
    const ms = Math.round(Math.min(700, 150 + Math.max(0, bd) * 1.3));
    this.shots.push(bx, Math.round(by - THAP_BASE.radius * 0.8), Math.round(t.x), Math.round(t.y), THAP_SHOT_BASE, t.id, ms);
    this.projectiles.push({ owner: s.idx, dmg: Math.max(1, THAP_BASE.atk - THAP_UNITS[t.kind].armor), target: t.id, hitAt: this.elapsed + ms, tx: t.x, ty: t.y, attacker: -1 });
  }

  private flyProjectiles() {
    if (!this.projectiles.length) return;
    const left: Projectile[] = [];
    for (const p of this.projectiles) {
      if (p.hitAt > this.elapsed) { left.push(p); continue; }
      const t = this.targetOf(p.target);
      if (t) this.applyHit(p.owner, p.kind, p.dmg, p.target, p.attacker, t.x, t.y);
      else if (p.kind && THAP_UNITS[p.kind].splash) this.applyHit(p.owner, p.kind, 0, 0, p.attacker, p.tx, p.ty);
    }
    this.projectiles = left;
  }

  // ---------------- mỏ vàng ----------------

  private updateMines() {
    const rate = THAP_MINE.capturePerS * DT;
    const counts = new Map<number, number>();
    for (const m of this.mines) {
      counts.clear();
      let team = -1, contested = false;
      this.near(m.x, m.y, THAP_MINE.radius, (u) => {
        counts.set(u.owner, (counts.get(u.owner) ?? 0) + 1);
        if (team === -1) team = u.team;
        else if (team !== u.team) contested = true;
      });
      if (team === -1 || contested) continue;
      let capIdx = -1, cn = -1;
      for (const [idx, c] of counts) if (c > cn || (c === cn && idx === m.cap)) { cn = c; capIdx = idx; }
      if (m.owner >= 0) {
        if (this.sides[m.owner].team === team) {
          m.cap = -1;
          if (m.prog < 100) m.prog = Math.min(100, m.prog + rate);
          continue;
        }
        m.cap = capIdx;
        m.prog = Math.max(0, m.prog - rate);
        if (m.prog <= 0) { m.owner = -1; m.prog = 0; }
        continue;
      }
      if (m.cap >= 0 && this.sides[m.cap].team !== team && m.prog > 0) {
        m.prog = Math.max(0, m.prog - rate);
        if (m.prog <= 0) m.cap = capIdx;
        continue;
      }
      m.cap = capIdx;
      m.prog = Math.min(100, m.prog + rate);
      if (m.prog >= 100) {
        const first = !m.everOwned;
        m.owner = capIdx;
        m.cap = -1;
        m.prog = 100;
        m.everOwned = true;
        if (m.big) this.logs.push(`💰 ${this.sides[capIdx].name} chiếm Mỏ Vàng Lớn giữa bản đồ!`);
        else if (first) this.logs.push(`⛏️ ${this.sides[capIdx].name} chiếm được một Mỏ Vàng.`);
      }
    }
  }

  // ---------------- dọn xác / loại phe ----------------

  private reap() {
    for (const u of this.units.values()) {
      if (u.hp > 0) continue;
      this.units.delete(u.id);
      const code = -(KIND_INDEX[u.kind] * 16 + u.owner);
      this.deaths.push(Math.round(u.x), Math.round(u.y), code === 0 ? 0 : code);
    }
    for (const s of this.sides) {
      if (!s.alive || s.baseHp > 0) continue;
      s.alive = false;
      s.baseHp = 0;
      s.queue = [];
      s.auto = null;
      s.goal = undefined;
      const [bx, by] = this.bases[s.idx];
      this.deaths.push(bx, by, 1);
      for (const u of this.units.values()) {
        if (u.owner !== s.idx) continue;
        this.units.delete(u.id);
        const code = -(KIND_INDEX[u.kind] * 16 + u.owner);
        this.deaths.push(Math.round(u.x), Math.round(u.y), code === 0 ? 0 : code);
      }
      for (const m of this.mines) {
        if (m.owner === s.idx) { m.owner = -1; m.prog = 0; m.cap = -1; }
        if (m.cap === s.idx) { m.cap = -1; if (m.owner < 0) m.prog = 0; }
      }
      for (const o of this.sides) if (o.alive && o.stance === 'attack' && o.target === s.idx) this.updateGoal(o);
      this.logs.push(s.resigned ? `🏳️ ${s.name} bỏ cuộc, Pha Lê Chính bị phá hủy.` : `💥 Pha Lê Chính của ${s.name} đã vỡ tan! ${s.name} bị loại.`);
      this.dirty = true;
    }
  }

  armyCost(idx: number) {
    let c = 0;
    for (const u of this.units.values()) if (u.owner === idx && u.hp > 0) c += THAP_UNITS[u.kind].cost;
    return c;
  }

  score(s: ThapSide) {
    const mines = s.alive ? this.mines.filter((m) => m.owner === s.idx).length : 0;
    const hpPct = s.alive ? (s.baseHp / THAP_BASE.hp) * 100 : 0;
    const army = s.alive ? this.armyCost(s.idx) : 0;
    return Math.round(s.killsValue / 10 + 50 * mines + 3 * hpPct + army / 4);
  }

  teamScore(team: number, scores: number[]) {
    let t = 0;
    for (const s of this.sides) if (s.team === team) t += scores[s.idx] ?? 0;
    return t;
  }

  private checkEnd() {
    const aliveTeams = [...new Set(this.sides.filter((s) => s.alive).map((s) => s.team))];
    const humans = this.sides.filter((s) => !s.bot);
    const scores = this.sides.map((s) => this.score(s));
    const best = () => aliveTeams.sort((a, b) => this.teamScore(b, scores) - this.teamScore(a, scores) || a - b)[0] ?? -1;
    let winnerTeam = -1;
    let reason = '';
    if (aliveTeams.length <= 1) {
      winnerTeam = aliveTeams[0] ?? -1;
      reason = winnerTeam >= 0 ? `${this.teamName(winnerTeam)} là phe cuối cùng giữ được Pha Lê Chính – chiến thắng Miragine War!` : 'Mọi Pha Lê Chính đều đã vỡ.';
    } else if (humans.length > 0 && humans.every((s) => !s.alive)) {
      winnerTeam = best();
      reason = 'Không còn người chơi nào trụ lại – máy thắng.';
    } else if (this.endsAt && Date.now() >= this.endsAt) {
      winnerTeam = best();
      reason = `Hết giờ! ${this.teamName(winnerTeam)} có điểm cao nhất (${this.teamScore(winnerTeam, scores)}).`;
    } else return;
    this.result = {
      winnerTeam,
      winnerIdxs: winnerTeam >= 0 ? this.sides.filter((s) => s.team === winnerTeam).map((s) => s.idx) : [],
      reason,
      scores,
    };
    this.scoreCache = scores;
    this.logs.push(`🏆 ${reason}`);
    this.stop();
    this.dirty = true;
  }

  // ---------------- khung hình gửi đi ----------------

  frameFor(idx?: number): ThapFrame {
    if (!this.fullCache) this.fullCache = this.buildFrame();
    const s = idx === undefined ? undefined : this.sides[idx];
    if (!s || !s.alive) return this.fullCache;
    return { ...this.fullCache, me: this.privateOf(s) };
  }

  private buildFrame(): ThapFrame {
    const u: number[] = [];
    for (const x of this.units.values()) {
      if (x.hp <= 0) continue;
      const flags = (x.attacking > 0 ? THAP_FLAG_ATTACK : 0) | (x.healing > 0 ? THAP_FLAG_HEAL : 0) | (x.left ? THAP_FLAG_LEFT : 0);
      u.push(x.id, x.owner, KIND_INDEX[x.kind], Math.round(x.x), Math.round(x.y), Math.max(1, Math.min(100, Math.round((x.hp / x.maxHp) * 100))), flags);
    }
    const m: number[] = [];
    for (const x of this.mines) m.push(x.owner, x.cap, Math.floor(x.prog));
    return {
      tick: this.tickNo,
      elapsed: this.elapsed,
      u,
      bh: this.sides.map((s) => (s.alive && s.baseHp > 0 ? Math.max(1, Math.ceil((s.baseHp / THAP_BASE.hp) * 100)) : 0)),
      m,
      s: this.shots,
      d: this.deaths,
      sc: this.scoreCache.length ? this.scoreCache : this.sides.map(() => 0),
      al: this.sides.map((s) => (s.alive ? 1 : 0)),
      full: true,
    };
  }

  private privateOf(s: ThapSide): ThapPrivate {
    const firstTicks = THAP_FIRST_ROUND_S * 10;
    const roundTicks = THAP_ROUND_S * 10;
    const roundLeft =
      this.tickNo < firstTicks
        ? Math.max(1, Math.ceil((firstTicks - this.tickNo) / 10))
        : Math.max(1, Math.ceil((roundTicks - ((this.tickNo - firstTicks) % roundTicks)) / 10));
    return {
      gold: Math.floor(s.gold),
      income: this.incomeOf(s),
      roundIncome: s.roundIncome,
      roundLeft,
      pop: s.pop,
      popCap: THAP_MAX_POP,
      queue: s.queue.map((q) => ({ kind: q.kind, left: Math.round(q.left * 10) / 10, total: q.total })),
      blocked: this.blockedOf(s),
      auto: s.auto,
      stance: s.stance,
      target: s.target,
      rally: [Math.round(s.rally[0]), Math.round(s.rally[1])],
      upgrades: { ...s.upgrades },
      mines: s.mines,
      kills: s.kills,
      lost: s.lost,
    };
  }
}
