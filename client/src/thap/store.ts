/**
 * Kho khung hình Miragine War (Thập Hùng Tranh Bá) phía client.
 * Giữ vị trí nhịp trước + nhịp hiện tại của từng lính để nội suy mượt (server 10 nhịp/giây),
 * gom hiệu ứng (fireball, thunderball, storm, hồi máu, đạn Pha Lê, animation xác lính `A{ss}_dead`/`B{ss}_dead`, Pha Lê vỡ)
 * để vẽ chuẩn đồ họa gốc Miragine War.
 */
import {
  THAP_DEATH_FIELDS,
  THAP_MINE_FIELDS,
  THAP_SHOT_ARROW,
  THAP_SHOT_BASE,
  THAP_SHOT_FIELDS,
  THAP_SHOT_HEAL,
  THAP_SHOT_MAGIC,
  THAP_SHOT_STONE,
  THAP_TICK_MS,
  THAP_UNIT_FIELDS,
  THAP_UNIT_KINDS,
  type ThapFrame,
  type ThapUnitKind,
} from '../../../shared/src';

export interface ThapUnitState {
  id: number;
  owner: number;
  kind: ThapUnitKind;
  x: number;
  y: number;
  /** vị trí nhịp trước (để nội suy) */
  px: number;
  py: number;
  hp: number;
  flags: number;
  /** hướng di chuyển (rad) */
  angle: number;
  /** pha bước chân */
  phase: number;
  /** lần cuối cờ tấn công bật (ms) – để vẽ động tác vung vũ khí */
  atkAt: number;
}

export type ThapShotKind = 'arrow' | 'magic' | 'stone' | 'heal' | 'base' | 'thunder' | 'storm';

export interface ThapEffect {
  kind: ThapShotKind | 'death' | 'rubble' | 'ping';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** đạn bám theo lính mục tiêu */
  target?: number;
  /** thông tin lính vừa tử trận để vẽ đúng sprite sheet `{A|B}{ss}_dead` */
  unitKind?: ThapUnitKind;
  unitOwner?: number;
  left?: boolean;
  t0: number;
  dur: number;
}

export interface ThapMineState {
  owner: number;
  cap: number;
  prog: number;
}

const SHOT_NAMES: Record<number, ThapShotKind> = {
  [THAP_SHOT_ARROW]: 'thunder',
  [THAP_SHOT_MAGIC]: 'magic',
  [THAP_SHOT_STONE]: 'storm',
  [THAP_SHOT_HEAL]: 'heal',
  [THAP_SHOT_BASE]: 'base',
};

type Listener = () => void;

class ThapStore {
  frame?: ThapFrame;
  frameAt = 0;
  units = new Map<number, ThapUnitState>();
  /** %máu Pha Lê Thành theo idx */
  baseHp: number[] = [];
  mines: ThapMineState[] = [];
  effects: ThapEffect[] = [];
  mapW = 0;
  mapH = 0;
  myIdx?: number;
  bases: [number, number][] = [];
  /** cảnh báo Thành mình bị đánh gần nhất */
  alert?: { x: number; y: number; at: number; text: string };
  /** đếm sự kiện cho âm thanh (component đọc rồi tự so sánh) */
  baseFalls = 0;
  unitDeaths = 0;
  combatHits = 0;
  private listeners = new Set<Listener>();
  private code = '';

  /** Mỗi ván mới / đổi phòng: xoá sạch */
  reset(code: string, startedAt: number, mapW: number, mapH: number, myIdx?: number, bases: [number, number][] = []) {
    this.bases = bases;
    const key = `${code}:${startedAt}:${myIdx}`;
    if (this.code === key) return;
    this.code = key;
    this.frame = undefined;
    this.units.clear();
    this.baseHp = [];
    this.mines = [];
    this.effects = [];
    this.alert = undefined;
    this.baseFalls = 0;
    this.unitDeaths = 0;
    this.combatHits = 0;
    this.mapW = mapW;
    this.mapH = mapH;
    this.myIdx = myIdx;
    this.frameAt = 0;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  push(f: ThapFrame) {
    if (this.frame && f.tick <= this.frame.tick) {
      // nhịp lùi hẳn = trận mới (server tạo world mới, đếm lại từ 1) mà reset() chưa kịp chạy: xoá dữ liệu cũ
      if (this.frame.tick - f.tick < 50) return;
      this.units.clear();
      this.effects = [];
      this.baseHp = [];
      this.alert = undefined;
    }
    const now = performance.now();
    const seen = new Set<number>();
    let anyAttack = false;
    for (let i = 0; i + THAP_UNIT_FIELDS <= f.u.length; i += THAP_UNIT_FIELDS) {
      const id = f.u[i];
      const x = f.u[i + 3], y = f.u[i + 4];
      const flags = f.u[i + 6];
      seen.add(id);
      let s = this.units.get(id);
      const kind = THAP_UNIT_KINDS[f.u[i + 2]] ?? 'swordman';
      if (!s) {
        const left = (flags & 4) !== 0;
        s = {
          id, owner: f.u[i + 1], kind, x, y, px: x, py: y,
          hp: f.u[i + 5], flags, angle: left ? Math.PI : 0, phase: Math.random() * 6, atkAt: 0,
        };
        this.units.set(id, s);
      } else {
        const far = Math.abs(s.x - x) + Math.abs(s.y - y) > 60;
        s.px = far ? x : s.x;
        s.py = far ? y : s.y;
        s.x = x;
        s.y = y;
        s.kind = kind;
        s.hp = f.u[i + 5];
        s.flags = flags;
        const dx = s.x - s.px, dy = s.y - s.py;
        if (dx * dx + dy * dy > 0.4) {
          let d = Math.atan2(dy, dx) - s.angle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          s.angle += d * 0.6;
        }
      }
      if (flags & 1) {
        if (now - s.atkAt > 400) anyAttack = true;
        s.atkAt = now;
      }
    }
    if (anyAttack) this.combatHits++;

    // Lưu hướng nhìn của các lính vừa biến mất trong nhịp này để gán cho hiệu ứng tử trận
    const removedUnits: { x: number; y: number; left: boolean }[] = [];
    for (const [id, u] of this.units.entries()) {
      if (!seen.has(id)) {
        removedUnits.push({ x: u.x, y: u.y, left: (u.flags & 4) !== 0 });
        this.units.delete(id);
      }
    }

    // máu Thành + cảnh báo
    const prevBh = this.baseHp;
    this.baseHp = f.bh.slice();
    const me = this.myIdx;
    if (me !== undefined && f.me && prevBh.length) {
      const before = prevBh[me], after = f.bh[me];
      if (before !== undefined && after !== undefined && after < before && after > 0 && (!this.alert || now - this.alert.at > 9000)) {
        const b = this.bases[me];
        if (b) {
          this.alert = { x: b[0], y: b[1], at: now, text: 'Pha Lê Thành đang bị tấn công!' };
          this.effects.push({ kind: 'ping', x1: b[0], y1: b[1], x2: 0, y2: 0, t0: now, dur: 2500 });
        }
      }
    }

    const mines: ThapMineState[] = [];
    for (let i = 0; i + THAP_MINE_FIELDS <= f.m.length; i += THAP_MINE_FIELDS) mines.push({ owner: f.m[i], cap: f.m[i + 1], prog: f.m[i + 2] });
    this.mines = mines;

    for (let i = 0; i + THAP_SHOT_FIELDS <= f.s.length; i += THAP_SHOT_FIELDS) {
      const kind = SHOT_NAMES[f.s[i + 4]] ?? 'arrow';
      const target = f.s[i + 5];
      this.effects.push({
        kind,
        x1: f.s[i],
        y1: f.s[i + 1],
        x2: f.s[i + 2],
        y2: f.s[i + 3],
        target: target >= 0 ? target : undefined,
        t0: now,
        dur: Math.max(120, f.s[i + 6]),
      });
    }
    for (let i = 0; i + THAP_DEATH_FIELDS <= f.d.length; i += THAP_DEATH_FIELDS) {
      const dx = f.d[i], dy = f.d[i + 1], code = f.d[i + 2];
      const big = code === 1;
      if (big) {
        this.baseFalls++;
        this.effects.push({ kind: 'rubble', x1: dx, y1: dy, x2: 0, y2: 0, t0: now, dur: 2200 });
      } else {
        this.unitDeaths++;
        const raw = Math.max(0, -code);
        const kindIdx = Math.floor(raw / 16);
        const unitOwner = raw % 16;
        const unitKind = THAP_UNIT_KINDS[kindIdx] ?? 'swordman';
        const near = removedUnits.find((ru) => Math.abs(ru.x - dx) + Math.abs(ru.y - dy) < 50);
        this.effects.push({
          kind: 'death',
          x1: dx,
          y1: dy,
          x2: 0,
          y2: 0,
          unitKind,
          unitOwner,
          left: near ? near.left : dx > (this.mapW || 4000) / 2,
          t0: now,
          dur: 720,
        });
      }
    }
    if (this.effects.length > 500) this.effects = this.effects.slice(-500);

    this.frame = f;
    this.frameAt = now;
    this.listeners.forEach((l) => l());
  }

  /** Nội suy 0..1 giữa nhịp trước và nhịp hiện tại */
  alpha(now = performance.now()) {
    return Math.max(0, Math.min(1, (now - this.frameAt) / THAP_TICK_MS));
  }

  /** Vị trí đang vẽ của một lính (để đạn bám theo) */
  unitPos(id: number, a = this.alpha()) {
    const u = this.units.get(id);
    return u ? { x: u.px + (u.x - u.px) * a, y: u.py + (u.y - u.py) * a } : undefined;
  }
}

export const thapStore = new ThapStore();
