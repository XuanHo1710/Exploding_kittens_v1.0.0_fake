/**
 * Đế Chế Kiến – mô phỏng phía server (server là trọng tài, client chỉ vẽ).
 * 10 nhịp/giây. Mỗi nhịp: cấp vàng → nở quân → máy nghĩ → kiến di chuyển/đánh → trụ bắn → đạn bay → dọn xác → gửi khung hình.
 */
import {
  ANTS_INCOME_EVERY_S,
  ANTS_MAX_POP,
  ANTS_MAX_QUEUE,
  ANTS_START_GOLD,
  ANTS_TICK_MS,
  ANT_TOWERS,
  ANT_UNITS,
  SHOT_ACID,
  SHOT_BOMB,
  SHOT_HEAL,
  SHOT_MAIN,
  SHOT_SIDE,
  SHOT_SNIPE,
  TOWER_KINDS,
  UNIT_KINDS,
  antsIncome,
  type AntTowerKind,
  type AntUnitKind,
  type AntsCommand,
  type AntsConfig,
  type AntsEmpireInfo,
  type AntsFrame,
  type AntsPrivate,
  type AntsQueueItem,
  type AntsStance,
} from '../../../../shared/src';
import { runBot, type BotBrain } from './bot';

const DT = ANTS_TICK_MS / 1000;
const GRID_CELL = 96;

export interface Empire {
  idx: number;
  id: string;
  name: string;
  color: string;
  bot: boolean;
  alive: boolean;
  gold: number;
  /** số lần đã được cấp vàng */
  payouts: number;
  queue: AntsQueueItem[];
  rally: [number, number];
  /** hướng từ căn cứ ra giữa bản đồ */
  facing: number;
  mainId: number;
  kills: number;
  towersKilled: number;
  spent: number;
  /** chống spam lệnh */
  tokens: number;
  brain?: BotBrain;
  resigned?: boolean;
  /** lệnh chung cho cả đạo quân (người chơi) */
  stance: AntsStance;
  /** đế chế chọn đánh (-1 = gần nhất) */
  target: number;
  /** trụ đang nhắm khi tổng tấn công */
  targetTower?: number;
  /** loại kiến trại đang tự nở liên tục (null = không) */
  auto: AntUnitKind | null;
  /** số con đã nở */
  hatched: number;
}

type Order =
  | { type: 'idle' }
  | { type: 'move'; x: number; y: number; attack: boolean }
  | { type: 'attack'; target: number };

export interface Unit {
  id: number;
  owner: number;
  kind: AntUnitKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cd: number;
  order: Order;
  /** mục tiêu tự tìm (khi rảnh / vừa đi vừa đánh) */
  engage?: number;
  anchorX: number;
  anchorY: number;
  idleT: number;
  stuck: number;
  lastDist: number;
  attacking: number;
  lastHitBy?: number;
}

export interface Tower {
  id: number;
  owner: number;
  kind: AntTowerKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  cd: number;
}

/** Đạn của trụ: bay tới mục tiêu, trúng là hạ gọn */
interface Bullet { towerOwner: number; target: number; hitAt: number }
/** Đòn đánh xa của kiến: trúng sau một lúc */
interface Missile { owner: number; kind: AntUnitKind; target: number; hitAt: number; tx: number; ty: number; attacker: number }

interface Rock { x: number; y: number; r: number }

export interface WorldHooks {
  /** gọi sau mỗi nhịp để gửi khung hình */
  tick(): void;
  /** có đế chế bị loại / ván kết thúc: cần cập nhật RoomView */
  changed(): void;
}

export interface EmpireInit { id: string; name: string; color: string; bot: boolean }

const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class AntWorld {
  readonly W: number;
  readonly H: number;
  rocks: Rock[] = [];
  empires: Empire[] = [];
  units = new Map<number, Unit>();
  towers = new Map<number, Tower>();
  tickNo = 0;
  elapsed = 0;
  readonly startedAt = Date.now();
  readonly endsAt?: number;
  result?: { winnerIdx: number; reason: string; scores: number[] };
  private seq = 0;
  private timer?: NodeJS.Timeout;
  private shots: number[] = [];
  private deaths: number[] = [];
  private bullets: Bullet[] = [];
  private missiles: Missile[] = [];
  private grid = new Map<number, Unit[]>();
  private logs: string[] = [];
  private fullCache?: AntsFrame;
  private scoreCache: number[] = [];

  constructor(inits: EmpireInit[], readonly config: AntsConfig, private hooks: WorldHooks) {
    const n = inits.length;
    const R = 520 + 120 * n;
    this.W = this.H = Math.round(2 * R + 900);
    if (config.minutes > 0) this.endsAt = this.startedAt + config.minutes * 60_000;
    this.generate(inits, R);
  }

  // ---------------- tạo bản đồ ----------------

  private generate(inits: EmpireInit[], R: number) {
    const n = inits.length;
    const cx = this.W / 2;
    const cy = this.H / 2;
    const base = Math.random() * Math.PI * 2;
    const slots = inits.map((_, i) => i).sort(() => Math.random() - 0.5);
    const bases: { x: number; y: number; a: number }[] = [];
    inits.forEach((init, idx) => {
      const a = base + (slots[idx] / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      bases.push({ x, y, a });
      const facing = a + Math.PI;
      const emp: Empire = {
        idx, id: init.id, name: init.name, color: init.color, bot: init.bot, alive: true,
        gold: ANTS_START_GOLD, payouts: 0, queue: [], facing,
        rally: [x + Math.cos(facing) * 170, y + Math.sin(facing) * 170],
        mainId: 0, kills: 0, towersKilled: 0, spent: 0, tokens: 40, stance: 'defend', target: -1, auto: null, hatched: 0,
      };
      if (init.bot) emp.brain = { level: this.config.botLevel, waves: 0, nextThink: 0, attackTarget: -1, mix: Math.random() };
      this.empires.push(emp);
    });

    // đá rải rác, chừa căn cứ
    for (let i = 0; i < n * 8 && this.rocks.length < n * 4 + 4; i++) {
      const r = rnd(24, 64);
      const x = rnd(r + 40, this.W - r - 40);
      const y = rnd(r + 40, this.H - r - 40);
      if (bases.some((p) => dist2(p.x, p.y, x, y) < (360 + r) ** 2)) continue;
      if (this.rocks.some((o) => dist2(o.x, o.y, x, y) < (o.r + r + 80) ** 2)) continue;
      this.rocks.push({ x, y, r });
    }

    // 3 trụ: Trụ Chính ở căn cứ, 2 Trụ Phụ chắn phía trước hai bên
    this.empires.forEach((emp, i) => {
      const p = bases[i];
      const f = emp.facing;
      emp.mainId = this.addTower(emp.idx, 'main', p.x, p.y).id;
      for (const side of [-1, 1]) {
        const a = f + side * 0.85;
        this.addTower(emp.idx, 'side', p.x + Math.cos(a) * 190, p.y + Math.sin(a) * 190);
      }
      // quân khởi đầu
      for (let k = 0; k < 3; k++) {
        const a = f + (k - 1) * 0.5;
        const u = this.addUnit(emp.idx, 'soldier', p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 90);
        u.order = { type: 'move', x: emp.rally[0] + (k - 1) * 22, y: emp.rally[1], attack: true };
      }
    });
  }

  addUnit(owner: number, kind: AntUnitKind, x: number, y: number): Unit {
    const s = ANT_UNITS[kind];
    const u: Unit = {
      id: ++this.seq, owner, kind, x, y, hp: s.hp, maxHp: s.hp, cd: 0, order: { type: 'idle' },
      anchorX: x, anchorY: y, idleT: 0, stuck: 0, lastDist: Infinity, attacking: 0,
    };
    this.units.set(u.id, u);
    return u;
  }

  private addTower(owner: number, kind: AntTowerKind, x: number, y: number): Tower {
    const s = ANT_TOWERS[kind];
    const t: Tower = { id: ++this.seq, owner, kind, x, y, r: s.radius, hp: s.hp, maxHp: s.hp, cd: 1 + Math.random() };
    this.towers.set(t.id, t);
    return t;
  }

  // ---------------- vòng đời ----------------

  start() {
    this.timer = setInterval(() => {
      try {
        this.step();
      } catch (error) {
        console.error('[AntWorld] lỗi mô phỏng', error);
      }
    }, ANTS_TICK_MS);
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

  empireById(id: string) {
    return this.empires.find((e) => e.id === id);
  }

  resign(idx: number) {
    const e = this.empires[idx];
    if (!e || !e.alive) return;
    e.resigned = true;
    const main = this.towers.get(e.mainId);
    if (main) main.hp = 0;
  }

  publicInfo(): AntsEmpireInfo[] {
    return this.empires.map((e) => ({ idx: e.idx, id: e.id, name: e.name, color: e.color, bot: e.bot, alive: e.alive }));
  }

  rockList() {
    return this.rocks.flatMap((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.r)]);
  }

  step() {
    if (this.result) return;
    this.tickNo++;
    this.elapsed += ANTS_TICK_MS;
    this.shots = [];
    this.deaths = [];
    this.fullCache = undefined;

    this.income();
    this.rebuildGrid();
    this.produce();
    if (this.tickNo % 5 === 0) for (const e of this.empires) if (e.bot && e.alive) runBot(this, e);
    if (this.tickNo % 5 === 2) for (const e of this.empires) if (!e.bot && e.alive) this.general(e);
    for (const u of this.units.values()) this.updateUnit(u);
    this.separate();
    for (const t of this.towers.values()) this.towerFire(t);
    this.flyProjectiles();
    for (const e of this.empires) e.tokens = Math.min(40, e.tokens + 15 * DT);
    this.reap();
    if (this.tickNo % 10 === 0) this.scoreCache = this.empires.map((e) => this.score(e));
    this.checkEnd();
    this.hooks.tick();
  }

  // ---------------- vàng & nở quân ----------------

  /** Mỗi 1 phút cấp vàng, lần sau nhiều hơn lần trước */
  private income() {
    const due = Math.floor(this.elapsed / 1000 / ANTS_INCOME_EVERY_S);
    for (const e of this.empires) {
      if (!e.alive) continue;
      while (e.payouts < due) {
        e.payouts++;
        e.gold += antsIncome(e.payouts);
      }
    }
  }

  incomeIn() {
    const s = this.elapsed / 1000;
    return Math.max(0, ANTS_INCOME_EVERY_S - (s % ANTS_INCOME_EVERY_S));
  }

  popOf(owner: number) {
    let pop = 0;
    for (const u of this.units.values()) if (u.owner === owner) pop += ANT_UNITS[u.kind].pop;
    return pop;
  }

  /** Dây chuyền nở quân (như nhà lính trong game đế chế): từng con một, đủ vàng mới trừ và bắt đầu nở */
  private produce() {
    for (const e of this.empires) {
      if (!e.alive) continue;
      if (!e.queue.length && e.auto) {
        const a = ANT_UNITS[e.auto];
        e.queue.push({ kind: e.auto, left: a.time, total: a.time, paid: false });
      }
      const q = e.queue[0];
      if (!q) continue;
      const s = ANT_UNITS[q.kind];
      if (!q.paid) {
        if (e.gold < s.cost || this.popOf(e.idx) + s.pop > ANTS_MAX_POP) continue;
        e.gold -= s.cost;
        e.spent += s.cost;
        q.paid = true;
      }
      q.left = Math.max(0, q.left - DT);
      if (q.left > 0) continue;
      e.queue.shift();
      this.spawn(e, q.kind);
      e.hatched++;
      // xếp con kế tiếp ngay để không có nhịp nào trống hàng chờ
      if (e.auto && !e.queue.length) {
        const a = ANT_UNITS[e.auto];
        e.queue.push({ kind: e.auto, left: a.time, total: a.time, paid: false });
      }
    }
  }

  waitingFor(e: Empire): 'gold' | 'pop' | undefined {
    const q = e.queue[0];
    if (!q || q.paid) return undefined;
    const s = ANT_UNITS[q.kind];
    if (this.popOf(e.idx) + s.pop > ANTS_MAX_POP) return 'pop';
    if (e.gold < s.cost) return 'gold';
    return undefined;
  }

  private spawn(e: Empire, kind: AntUnitKind) {
    const main = this.towers.get(e.mainId);
    if (!main) return;
    const a = e.facing + rnd(-0.5, 0.5);
    const u = this.addUnit(e.idx, kind, main.x + Math.cos(a) * (main.r + 14), main.y + Math.sin(a) * (main.r + 14));
    u.order = { type: 'move', x: e.rally[0] + rnd(-30, 30), y: e.rally[1] + rnd(-30, 30), attack: true };
  }

  /** Trụ nên đánh tiếp của đế chế mục tiêu: trụ gần căn cứ mình nhất (thường là Trụ Phụ trước) */
  private nextTowerOf(e: Empire): Tower | undefined {
    const main = this.towers.get(e.mainId);
    if (!main) return undefined;
    let targetIdx = e.target;
    if (targetIdx >= 0 && !this.empires[targetIdx]?.alive) targetIdx = e.target = -1;
    let best: Tower | undefined;
    let bd = Infinity;
    if (targetIdx === -1) {
      // gần nhất: đế chế có Trụ Chính gần mình nhất
      let near: Empire | undefined;
      for (const o of this.empires) {
        if (o.idx === e.idx || !o.alive) continue;
        const m = this.towers.get(o.mainId);
        if (!m) continue;
        const d = dist2(m.x, m.y, main.x, main.y);
        if (d < bd) { bd = d; near = o; }
      }
      if (!near) return undefined;
      targetIdx = near.idx;
      bd = Infinity;
    }
    for (const t of this.towers.values()) {
      if (t.owner !== targetIdx) continue;
      const d = dist2(t.x, t.y, main.x, main.y) + (t.kind === 'main' ? 160 ** 2 : 0);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }

  /** Lệnh chung cho cả đạo quân của người chơi: tự di chuyển, tự đánh */
  general(e: Empire): void {
    const main = this.towers.get(e.mainId);
    if (!main) return;
    const army: Unit[] = [];
    for (const u of this.units.values()) if (u.owner === e.idx) army.push(u);
    const send = (u: Unit, x: number, y: number) => {
      const o = u.order;
      if (o.type === 'move' && o.attack && dist2(o.x, o.y, x, y) < 70 ** 2) return;
      u.order = { type: 'move', x, y, attack: true };
      u.stuck = 0;
      u.lastDist = Infinity;
    };
    if (e.stance === 'attack') {
      const cur = e.targetTower !== undefined ? this.towers.get(e.targetTower) : undefined;
      const tower = cur && (e.target === -1 || cur.owner === e.target) ? cur : this.nextTowerOf(e);
      e.targetTower = tower?.id;
      if (!tower) {
        // hết địch để đánh: về giữ nhà
        e.stance = 'defend';
        return this.general(e);
      }
      army.forEach((u, i) => {
        if (u.engage !== undefined || (u.order.type === 'attack' && u.order.target === tower.id)) return;
        // tới gần trụ thì đánh thẳng vào trụ, còn đang đi thì vừa đi vừa đánh
        if (dist2(u.x, u.y, tower.x, tower.y) < (tower.r + 220) ** 2) {
          u.order = { type: 'attack', target: tower.id };
          u.anchorX = u.x;
          u.anchorY = u.y;
        } else {
          const a = (i * 2.399) % (Math.PI * 2);
          send(u, tower.x + Math.cos(a) * 40, tower.y + Math.sin(a) * 40);
        }
      });
      return;
    }
    // phòng thủ: có địch gần trụ thì cả quân lao vào, không thì đứng giữ trước căn cứ
    let threat: Unit | undefined;
    let td = Infinity;
    for (const t of this.towers.values()) {
      if (t.owner !== e.idx) continue;
      this.near(t.x, t.y, t.r + 420, (o) => {
        if (o.owner === e.idx) return;
        const d = dist2(o.x, o.y, t.x, t.y);
        if (d < td) { td = d; threat = o; }
      });
    }
    const cols = Math.ceil(Math.sqrt(army.length || 1));
    army.forEach((u, i) => {
      if (u.engage !== undefined) return;
      if (threat) return send(u, threat.x, threat.y);
      // tản đội hình quanh điểm tập kết, quân ở xa thì kéo về
      const ox = ((i % cols) - (cols - 1) / 2) * 24;
      const oy = (Math.floor(i / cols) - (cols - 1) / 2) * 24;
      const x = e.rally[0] + ox, y = e.rally[1] + oy;
      if (u.order.type === 'idle' && dist2(u.x, u.y, x, y) < 90 ** 2) return;
      if (u.order.type === 'attack') u.order = { type: 'idle' };
      send(u, x, y);
    });
  }

  // ---------------- lệnh từ người chơi ----------------

  /** Trả về thông báo lỗi (nếu có) để hiện cho người chơi */
  command(idx: number, cmd: AntsCommand): string | undefined {
    const e = this.empires[idx];
    if (!e || !e.alive || this.result) return 'Đế chế của bạn không còn nữa.';
    if (e.tokens < 1) return undefined;
    e.tokens -= 1;
    const mine = (ids: unknown) =>
      (Array.isArray(ids) ? ids.slice(0, 200) : [])
        .map((id) => this.units.get(Number(id)))
        .filter((u): u is Unit => !!u && u.owner === idx);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    const clampX = (x: number) => Math.max(0, Math.min(this.W, x));
    const clampY = (y: number) => Math.max(0, Math.min(this.H, y));
    switch (cmd?.t) {
      case 'move': {
        const x = num(cmd.x), y = num(cmd.y);
        if (Number.isNaN(x) || Number.isNaN(y)) return 'Vị trí không hợp lệ.';
        this.groupMove(mine(cmd.ids), clampX(x), clampY(y), cmd.attack !== false);
        return undefined;
      }
      case 'target': {
        const tid = Number(cmd.target);
        const t = this.targetOf(tid);
        for (const u of mine(cmd.ids)) {
          u.engage = undefined;
          u.stuck = 0;
          u.lastDist = Infinity;
          u.anchorX = u.x;
          u.anchorY = u.y;
          if (t && t.owner !== idx) u.order = { type: 'attack', target: tid };
          else if (t) u.order = { type: 'move', x: t.x + rnd(-20, 20), y: t.y + t.r + 30, attack: true };
        }
        return undefined;
      }
      case 'stop': {
        for (const u of mine(cmd.ids)) {
          u.order = { type: 'idle' };
          u.engage = undefined;
          u.anchorX = u.x;
          u.anchorY = u.y;
        }
        return undefined;
      }
      case 'train': {
        const kind = cmd.kind as AntUnitKind;
        const s = ANT_UNITS[kind];
        if (!s || !UNIT_KINDS.includes(kind)) return 'Loại kiến không hợp lệ.';
        const count = Math.max(1, Math.min(10, Math.floor(Number(cmd.count ?? 1)) || 1));
        if (e.queue.length >= ANTS_MAX_QUEUE) return `Hàng chờ tối đa ${ANTS_MAX_QUEUE} con.`;
        for (let i = 0; i < count && e.queue.length < ANTS_MAX_QUEUE; i++) e.queue.push({ kind, left: s.time, total: s.time, paid: false });
        return undefined;
      }
      case 'auto': {
        if (cmd.kind === null) {
          e.auto = null;
          e.queue = e.queue.filter((q) => q.paid);
          return undefined;
        }
        const kind = cmd.kind as AntUnitKind;
        if (!ANT_UNITS[kind] || !UNIT_KINDS.includes(kind)) return 'Loại kiến không hợp lệ.';
        e.auto = kind;
        // con đang nở dở (đã trả vàng) vẫn nở xong, các con chưa trả vàng bỏ đi
        e.queue = e.queue.filter((q) => q.paid);
        return undefined;
      }
      case 'untrain': {
        const kind = cmd.kind as AntUnitKind;
        for (let i = e.queue.length - 1; i >= 0; i--) {
          if (e.queue[i].kind !== kind) continue;
          const [q] = e.queue.splice(i, 1);
          if (q.paid) {
            e.gold += ANT_UNITS[q.kind].cost;
            e.spent -= ANT_UNITS[q.kind].cost;
          }
          break;
        }
        return undefined;
      }
      case 'stance': {
        if (cmd.stance !== 'attack' && cmd.stance !== 'defend') return 'Lệnh không hợp lệ.';
        if (cmd.stance === 'attack') {
          const t = cmd.target === undefined ? -1 : Math.floor(Number(cmd.target));
          if (t !== -1 && (!this.empires[t] || t === idx)) return 'Mục tiêu không hợp lệ.';
          if (t !== -1 && !this.empires[t].alive) return 'Đế chế đó đã bị loại.';
          e.target = t;
          e.targetTower = undefined;
        }
        e.stance = cmd.stance;
        // ra lệnh ngay cho cả đạo quân, không đợi nhịp kế tiếp
        for (const u of this.units.values()) if (u.owner === idx) { u.engage = undefined; u.order = { type: 'idle' }; }
        this.general(e);
        return undefined;
      }
      case 'rally': {
        const x = num(cmd.x), y = num(cmd.y);
        if (Number.isNaN(x) || Number.isNaN(y)) return undefined;
        e.rally = [clampX(x), clampY(y)];
        return undefined;
      }
      default:
        return 'Lệnh không hợp lệ.';
    }
  }

  /** Đi theo đội hình: tản ra quanh điểm đích để không chen chúc */
  groupMove(us: Unit[], x: number, y: number, attack: boolean) {
    const n = us.length;
    const cols = Math.ceil(Math.sqrt(n));
    const gap = 24;
    us.forEach((u, i) => {
      u.engage = undefined;
      u.stuck = 0;
      u.lastDist = Infinity;
      const ox = n === 1 ? 0 : ((i % cols) - (cols - 1) / 2) * gap;
      const oy = n === 1 ? 0 : (Math.floor(i / cols) - (cols - 1) / 2) * gap;
      u.order = { type: 'move', x: x + ox, y: y + oy, attack };
    });
  }

  // ---------------- kiến ----------------

  private rebuildGrid() {
    this.grid.clear();
    for (const u of this.units.values()) {
      const k = Math.floor(u.x / GRID_CELL) * 10000 + Math.floor(u.y / GRID_CELL);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = []));
      a.push(u);
    }
  }

  /** Duyệt kiến trong bán kính r quanh (x, y) */
  near(x: number, y: number, r: number, fn: (u: Unit) => void) {
    const x0 = Math.floor((x - r) / GRID_CELL), x1 = Math.floor((x + r) / GRID_CELL);
    const y0 = Math.floor((y - r) / GRID_CELL), y1 = Math.floor((y + r) / GRID_CELL);
    const r2 = r * r;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const a = this.grid.get(gx * 10000 + gy);
        if (!a) continue;
        for (const u of a) if (u.hp > 0 && dist2(u.x, u.y, x, y) <= r2) fn(u);
      }
    }
  }

  /** Mục tiêu (kiến / trụ) còn sống không */
  targetOf(id: number): { x: number; y: number; r: number; owner: number; isT: boolean } | undefined {
    const u = this.units.get(id);
    if (u && u.hp > 0) return { x: u.x, y: u.y, r: ANT_UNITS[u.kind].radius, owner: u.owner, isT: false };
    const t = this.towers.get(id);
    if (t && t.hp > 0) return { x: t.x, y: t.y, r: t.r, owner: t.owner, isT: true };
    return undefined;
  }

  /** Kẻ địch gần nhất: ưu tiên kiến, sau đó tới trụ */
  private acquire(u: Unit, radius: number): number | undefined {
    let best: number | undefined;
    let bd = Infinity;
    this.near(u.x, u.y, radius, (o) => {
      if (o.owner === u.owner) return;
      const d = dist2(o.x, o.y, u.x, u.y);
      if (d < bd) { bd = d; best = o.id; }
    });
    if (best !== undefined) return best;
    for (const t of this.towers.values()) {
      if (t.owner === u.owner) continue;
      const d = Math.sqrt(dist2(t.x, t.y, u.x, u.y)) - t.r;
      if (d <= radius && d < bd) { bd = d; best = t.id; }
    }
    return best;
  }

  private updateUnit(u: Unit) {
    if (u.hp <= 0) return;
    const s = ANT_UNITS[u.kind];
    u.cd = Math.max(0, u.cd - DT);
    u.attacking = Math.max(0, u.attacking - DT);

    if (s.heal) {
      this.medicStep(u);
      return;
    }

    const aggro = Math.max(s.sight * 0.8, s.range + 60);
    const o = u.order;

    // trả đòn khi bị đánh
    if (u.lastHitBy && !u.engage && (o.type === 'idle' || (o.type === 'move' && o.attack))) {
      if (this.targetOf(u.lastHitBy)) u.engage = u.lastHitBy;
    }
    u.lastHitBy = undefined;

    if (u.engage !== undefined) {
      const t = this.targetOf(u.engage);
      const leash = o.type === 'idle' ? 280 : 420;
      if (!t || dist2(t.x, t.y, u.anchorX, u.anchorY) > (leash + aggro) ** 2) u.engage = undefined;
      else {
        this.attackStep(u, u.engage, t);
        return;
      }
    }

    switch (o.type) {
      case 'idle': {
        if (this.tickNo % 3 === u.id % 3) {
          const t = this.acquire(u, aggro);
          if (t !== undefined) {
            u.engage = t;
            u.anchorX = u.x;
            u.anchorY = u.y;
          } else if (dist2(u.x, u.y, u.anchorX, u.anchorY) > 30 ** 2) {
            this.moveToward(u, u.anchorX, u.anchorY, 4);
          }
        }
        break;
      }
      case 'move': {
        if (o.attack && this.tickNo % 3 === u.id % 3) {
          const t = this.acquire(u, aggro);
          if (t !== undefined) {
            u.engage = t;
            u.anchorX = u.x;
            u.anchorY = u.y;
            break;
          }
        }
        const d = this.moveToward(u, o.x, o.y, 4);
        if (this.arrived(u, d, 8)) {
          u.order = { type: 'idle' };
          u.anchorX = u.x;
          u.anchorY = u.y;
        }
        break;
      }
      case 'attack': {
        const t = this.targetOf(o.target);
        if (!t) {
          u.order = { type: 'idle' };
          u.anchorX = u.x;
          u.anchorY = u.y;
          break;
        }
        this.attackStep(u, o.target, t);
        break;
      }
    }
  }

  /** Kiến Y Tá: đi theo đội, hồi máu người bị thương nặng nhất */
  private medicStep(u: Unit) {
    const s = ANT_UNITS[u.kind];
    let best: Unit | undefined;
    let worst = 0.999;
    this.near(u.x, u.y, s.range + 120, (o) => {
      if (o.owner !== u.owner || o.id === u.id) return;
      const ratio = o.hp / o.maxHp;
      if (ratio < worst) { worst = ratio; best = o; }
    });
    if (best) {
      const b = best as Unit;
      const d = Math.sqrt(dist2(b.x, b.y, u.x, u.y));
      if (d > s.range) this.moveToward(u, b.x, b.y, s.range - 10);
      else if (u.cd <= 0) {
        u.cd = s.cd;
        u.attacking = 0.4;
        b.hp = Math.min(b.maxHp, b.hp + s.heal! * s.cd);
        this.shots.push(Math.round(u.x), Math.round(u.y), Math.round(b.x), Math.round(b.y), SHOT_HEAL, b.id, 300);
      }
      return;
    }
    const o = u.order;
    if (o.type === 'move' || o.type === 'attack') {
      const t = o.type === 'move' ? { x: o.x, y: o.y } : this.targetOf(o.target);
      if (!t) { u.order = { type: 'idle' }; return; }
      const d = this.moveToward(u, t.x, t.y, o.type === 'move' ? 4 : 140);
      if (o.type === 'move' && this.arrived(u, d, 8)) u.order = { type: 'idle' };
    }
  }

  private arrived(u: Unit, d: number, eps: number) {
    if (d <= eps) return true;
    if (d < u.lastDist - 0.6) u.stuck = 0;
    else u.stuck++;
    u.lastDist = Math.min(u.lastDist, d);
    return (u.stuck > 8 && d < 90) || u.stuck > 40;
  }

  private attackStep(u: Unit, tid: number, t: { x: number; y: number; r: number; isT: boolean }) {
    const s = ANT_UNITS[u.kind];
    const d = Math.sqrt(dist2(u.x, u.y, t.x, t.y));
    const reach = s.range + s.radius + t.r + 2;
    if (d > reach) {
      this.moveToward(u, t.x, t.y, reach - 2);
      return;
    }
    if (u.cd > 0) return;
    u.cd = s.cd;
    u.attacking = 0.35;
    if (s.range > 0) {
      // đạn bay: trúng sau một lúc
      const kind = u.kind === 'sniper' ? SHOT_SNIPE : u.kind === 'bomber' ? SHOT_BOMB : SHOT_ACID;
      const ms = Math.round(Math.min(600, 120 + d * 1.6));
      this.shots.push(Math.round(u.x), Math.round(u.y), Math.round(t.x), Math.round(t.y), kind, tid, ms);
      this.missiles.push({ owner: u.owner, kind: u.kind, target: tid, hitAt: this.elapsed + ms, tx: t.x, ty: t.y, attacker: u.id });
    } else {
      this.hit(u.owner, u.kind, tid, u.id, t.x, t.y);
    }
  }

  /** Sát thương của kiến (kể cả lan) */
  private hit(owner: number, kind: AntUnitKind, tid: number, attacker: number, x: number, y: number) {
    const s = ANT_UNITS[kind];
    this.damage(owner, kind, tid, s.atk, attacker);
    if (s.splash) {
      this.near(x, y, s.splash, (o) => {
        if (o.owner === owner || o.id === tid) return;
        this.damage(owner, kind, o.id, s.atk * 0.6, attacker);
      });
    }
  }

  damage(owner: number, kind: AntUnitKind, tid: number, base: number, attackerId?: number) {
    const tu = this.units.get(tid);
    if (tu && tu.hp > 0) {
      tu.hp -= base;
      if (attackerId !== undefined) tu.lastHitBy = attackerId;
      if (tu.hp <= 0 && owner >= 0) this.empires[owner].kills++;
      return;
    }
    const tt = this.towers.get(tid);
    if (tt && tt.hp > 0) {
      tt.hp -= base * (ANT_UNITS[kind].siege ?? 1);
      if (tt.hp <= 0 && owner >= 0) this.empires[owner].towersKilled++;
    }
  }

  /** Đi về phía (tx, ty), dừng cách stopAt. Trả về khoảng cách còn lại. */
  private moveToward(u: Unit, tx: number, ty: number, stopAt: number) {
    let dx = tx - u.x;
    let dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d <= stopAt) return d;
    dx /= d;
    dy /= d;
    const s = ANT_UNITS[u.kind];
    const step = Math.min(s.speed * DT, d - stopAt);
    if (!s.fly) {
      // né đá / trụ: lái vòng sang bên theo pháp tuyến của hướng đi
      const look = s.radius + 34;
      let sx = 0, sy = 0;
      const avoid = (ox: number, oy: number, or: number) => {
        const rx = ox - u.x, ry = oy - u.y;
        const along = rx * dx + ry * dy;
        if (along <= 0 || along > or + look) return;
        const perp = rx * -dy + ry * dx;
        const clear = or + s.radius + 4;
        if (Math.abs(perp) >= clear) return;
        if (dist2(ox, oy, tx, ty) < (or + stopAt + 2) ** 2) return;
        const side = perp > 0 ? -1 : 1;
        const w = (1 - Math.abs(perp) / clear) * 1.6;
        sx += -dy * side * w;
        sy += dx * side * w;
      };
      for (const o of this.rocks) avoid(o.x, o.y, o.r);
      for (const t of this.towers.values()) avoid(t.x, t.y, t.r);
      if (sx || sy) {
        dx += sx;
        dy += sy;
        const L = Math.hypot(dx, dy) || 1;
        dx /= L;
        dy /= L;
      }
    }
    u.x += dx * step;
    u.y += dy * step;
    this.collide(u);
    return Math.hypot(tx - u.x, ty - u.y);
  }

  private collide(u: Unit) {
    const s = ANT_UNITS[u.kind];
    if (!s.fly) {
      for (const o of this.rocks) this.pushOut(u, o.x, o.y, o.r + s.radius);
      for (const t of this.towers.values()) this.pushOut(u, t.x, t.y, t.r + s.radius - 2);
    }
    u.x = Math.max(s.radius, Math.min(this.W - s.radius, u.x));
    u.y = Math.max(s.radius, Math.min(this.H - s.radius, u.y));
  }

  private pushOut(u: Unit, ox: number, oy: number, min: number) {
    const dx = u.x - ox, dy = u.y - oy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 0.01;
    u.x = ox + (dx / d) * min;
    u.y = oy + (dy / d) * min;
  }

  /** Kiến không chồng lên nhau */
  private separate() {
    for (const a of this.grid.values()) {
      for (const u of a) {
        const su = ANT_UNITS[u.kind];
        if (u.hp <= 0 || su.fly) continue;
        this.near(u.x, u.y, su.radius + 18, (o) => {
          const so = ANT_UNITS[o.kind];
          if (o.id <= u.id || so.fly) return;
          const min = su.radius + so.radius;
          const dx = o.x - u.x, dy = o.y - u.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) return;
          const d = Math.sqrt(d2) || 0.01;
          const push = (min - d) * 0.5;
          const nx = d < 0.02 ? Math.random() - 0.5 : dx / d;
          const ny = d < 0.02 ? Math.random() - 0.5 : dy / d;
          // kiến to bị đẩy ít hơn
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

  // ---------------- trụ bắn ----------------

  /** Mỗi trụ bắn 1 viên, trúng là hạ gọn 1 con kiến; hồi đạn 5 giây */
  private towerFire(t: Tower) {
    if (t.hp <= 0) return;
    t.cd = Math.max(0, t.cd - DT);
    if (t.cd > 0) return;
    const s = ANT_TOWERS[t.kind];
    let best: Unit | undefined;
    let bd = Infinity;
    let bestHitsMe = false;
    this.near(t.x, t.y, s.range + t.r, (o) => {
      if (o.owner === t.owner) return;
      // đã có viên đạn khác đang bay tới con này thì nhắm con khác
      if (this.bullets.some((b) => b.target === o.id)) return;
      // ưu tiên con đang đánh chính trụ này, rồi tới con gần nhất
      const hitsMe = o.engage === t.id || (o.order.type === 'attack' && o.order.target === t.id);
      const d = dist2(o.x, o.y, t.x, t.y);
      if ((hitsMe && !bestHitsMe) || (hitsMe === bestHitsMe && d < bd)) { bd = d; best = o; bestHitsMe = hitsMe; }
    });
    if (!best) return;
    const target = best as Unit;
    t.cd = s.cd;
    const ms = Math.round((Math.sqrt(bd) / s.bulletSpeed) * 1000);
    this.bullets.push({ towerOwner: t.owner, target: target.id, hitAt: this.elapsed + ms });
    this.shots.push(Math.round(t.x), Math.round(t.y - t.r * 0.9), Math.round(target.x), Math.round(target.y), t.kind === 'main' ? SHOT_MAIN : SHOT_SIDE, target.id, ms);
  }

  private flyProjectiles() {
    if (this.bullets.length) {
      const left: Bullet[] = [];
      for (const b of this.bullets) {
        if (b.hitAt > this.elapsed) { left.push(b); continue; }
        const u = this.units.get(b.target);
        if (u && u.hp > 0) {
          u.hp = 0;
          if (this.empires[b.towerOwner]) this.empires[b.towerOwner].kills++;
        }
      }
      this.bullets = left;
    }
    if (this.missiles.length) {
      const left: Missile[] = [];
      for (const m of this.missiles) {
        if (m.hitAt > this.elapsed) { left.push(m); continue; }
        const t = this.targetOf(m.target);
        if (t) this.hit(m.owner, m.kind, m.target, m.attacker, t.x, t.y);
        else if (ANT_UNITS[m.kind].splash) this.hit(m.owner, m.kind, -1, m.attacker, m.tx, m.ty);
      }
      this.missiles = left;
    }
  }

  // ---------------- dọn xác / loại đế chế ----------------

  private reap() {
    for (const u of this.units.values()) {
      if (u.hp > 0) continue;
      this.units.delete(u.id);
      this.deaths.push(Math.round(u.x), Math.round(u.y), 0);
    }
    const fallen: Empire[] = [];
    for (const t of this.towers.values()) {
      if (t.hp > 0) continue;
      this.towers.delete(t.id);
      this.deaths.push(Math.round(t.x), Math.round(t.y), 1);
      const e = this.empires[t.owner];
      if (t.kind === 'main' && e.alive) fallen.push(e);
      else if (t.kind === 'side' && e.alive) this.logs.push(`🗼 ${e.name} mất 1 Trụ Phụ!`);
    }
    for (const e of fallen) {
      e.alive = false;
      e.queue = [];
      for (const u of this.units.values()) if (u.owner === e.idx) { this.units.delete(u.id); this.deaths.push(Math.round(u.x), Math.round(u.y), 0); }
      for (const t of this.towers.values()) if (t.owner === e.idx) { this.towers.delete(t.id); this.deaths.push(Math.round(t.x), Math.round(t.y), 1); }
      this.logs.push(e.resigned ? `🏳️ ${e.name} bỏ cuộc, đế chế sụp đổ.` : `💥 Trụ Chính của ${e.name} bị phá! Đế chế bị loại.`);
    }
    if (fallen.length || this.logs.length) this.hooks.changed();
  }

  score(e: Empire) {
    let army = 0;
    if (e.alive) for (const u of this.units.values()) if (u.owner === e.idx) army += ANT_UNITS[u.kind].cost;
    let towers = 0;
    if (e.alive) for (const t of this.towers.values()) if (t.owner === e.idx) towers += Math.round((t.hp / t.maxHp) * (t.kind === 'main' ? 600 : 300));
    return Math.round(e.kills * 10 + e.towersKilled * 300 + army / 2 + towers);
  }

  private checkEnd() {
    const alive = this.empires.filter((e) => e.alive);
    const humans = this.empires.filter((e) => !e.bot);
    const humansAlive = humans.filter((e) => e.alive);
    let winner: Empire | undefined;
    let reason = '';
    if (alive.length <= 1) {
      winner = alive[0];
      reason = winner ? `${winner.name} là đế chế cuối cùng đứng vững!` : 'Tất cả đế chế đều sụp đổ.';
    } else if (humans.length > 0 && humansAlive.length === 0) {
      const scores = this.empires.map((e) => this.score(e));
      winner = alive.sort((a, b) => scores[b.idx] - scores[a.idx])[0];
      reason = 'Không còn người chơi nào trụ lại – máy thắng.';
    } else if (this.endsAt && Date.now() >= this.endsAt) {
      const scores = this.empires.map((e) => this.score(e));
      winner = alive.sort((a, b) => scores[b.idx] - scores[a.idx])[0];
      reason = `Hết giờ! ${winner?.name} có điểm sức mạnh cao nhất.`;
    } else return;
    this.result = { winnerIdx: winner?.idx ?? -1, reason, scores: this.empires.map((e) => this.score(e)) };
    this.scoreCache = this.result.scores;
    this.logs.push(`🏆 ${reason}`);
    this.stop();
    this.hooks.changed();
  }

  // ---------------- khung hình gửi đi ----------------

  /**
   * Bản đồ sáng toàn bộ: mọi người cùng thấy hết kiến và trụ (khung dùng chung, dựng 1 lần mỗi nhịp).
   * Người chơi còn sống được gắn thêm phần riêng `me` (vàng, hàng chờ, lệnh).
   */
  frameFor(idx?: number): AntsFrame {
    if (!this.fullCache) this.fullCache = this.buildFrame();
    const emp = idx === undefined ? undefined : this.empires[idx];
    if (!emp || !emp.alive) return this.fullCache;
    return { ...this.fullCache, me: this.privateOf(emp) };
  }

  private buildFrame(): AntsFrame {
    const u: number[] = [];
    for (const x of this.units.values()) {
      const flags = (x.attacking > 0 ? 2 : 0) | (ANT_UNITS[x.kind].fly ? 4 : 0);
      u.push(x.id, x.owner, UNIT_KINDS.indexOf(x.kind), Math.round(x.x), Math.round(x.y), Math.max(1, Math.round((x.hp / x.maxHp) * 100)), flags);
    }
    const b: number[] = [];
    for (const x of this.towers.values()) {
      b.push(x.id, x.owner, TOWER_KINDS.indexOf(x.kind), Math.round(x.x), Math.round(x.y), Math.max(1, Math.round((x.hp / x.maxHp) * 100)), Math.ceil(x.cd * 10));
    }
    return {
      tick: this.tickNo,
      elapsed: this.elapsed,
      u, b, s: this.shots, d: this.deaths,
      sc: this.scoreCache.length ? this.scoreCache : this.empires.map(() => 0),
      al: this.empires.map((e) => (e.alive ? 1 : 0)),
      full: true,
    };
  }

  private privateOf(e: Empire): AntsPrivate {
    return {
      gold: Math.floor(e.gold),
      incomeIn: Math.ceil(this.incomeIn()),
      incomeAmount: antsIncome(e.payouts + 1),
      pop: this.popOf(e.idx),
      popCap: ANTS_MAX_POP,
      queue: e.queue.map((q) => ({ kind: q.kind, left: Math.round(q.left * 10) / 10, total: q.total, paid: q.paid })),
      waiting: this.waitingFor(e),
      rally: [Math.round(e.rally[0]), Math.round(e.rally[1])],
      kills: e.kills,
      spent: e.spent,
      stance: e.stance,
      target: e.target,
      ...this.targetInfo(e),
      auto: e.auto,
      hatched: e.hatched,
    };
  }

  private targetInfo(e: Empire): { targetPos?: [number, number]; targetIdx?: number } {
    if (e.stance !== 'attack' || e.targetTower === undefined) return {};
    const t = this.towers.get(e.targetTower);
    return t ? { targetPos: [Math.round(t.x), Math.round(t.y)], targetIdx: t.owner } : {};
  }
}
