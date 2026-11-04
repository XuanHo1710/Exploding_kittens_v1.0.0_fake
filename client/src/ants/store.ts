/**
 * Kho khung hình Đế Chế Kiến phía client.
 * Giữ 2 khung gần nhất để nội suy (bản đồ sáng toàn bộ: server gửi hết kiến và trụ),
 * và gom hiệu ứng (đạn trụ, axit, xác) để vẽ trong vài trăm ms.
 */
import {
  ANTS_SHOT_FIELDS,
  ANTS_TICK_MS,
  ANTS_TOWER_FIELDS,
  ANTS_UNIT_FIELDS,
  ANT_TOWERS,
  SHOT_ACID,
  SHOT_BOMB,
  SHOT_HEAL,
  SHOT_MAIN,
  SHOT_SIDE,
  SHOT_SNIPE,
  TOWER_KINDS,
  UNIT_KINDS,
  type AntTowerKind,
  type AntUnitKind,
  type AntsFrame,
} from '../../../shared/src';

export interface UnitState {
  id: number;
  owner: number;
  kind: AntUnitKind;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  flags: number;
  angle: number;
  /** pha bước chân */
  phase: number;
}

export interface TowerState {
  id: number;
  owner: number;
  kind: AntTowerKind;
  x: number;
  y: number;
  hp: number;
  /** giây hồi đạn còn lại */
  cd: number;
}

export type ShotKind = 'acid' | 'side' | 'main' | 'snipe' | 'bomb' | 'heal';

export interface Effect {
  kind: ShotKind | 'death' | 'rubble' | 'ping' | 'boom';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** đạn bám theo mục tiêu */
  target?: number;
  t0: number;
  dur: number;
}

const SHOT_NAMES: Record<number, ShotKind> = { [SHOT_ACID]: 'acid', [SHOT_SIDE]: 'side', [SHOT_MAIN]: 'main', [SHOT_SNIPE]: 'snipe', [SHOT_BOMB]: 'bomb', [SHOT_HEAL]: 'heal' };

type Listener = () => void;

class AntsStore {
  frame?: AntsFrame;
  frameAt = 0;
  units = new Map<number, UnitState>();
  towers = new Map<number, TowerState>();
  effects: Effect[] = [];
  mapW = 0;
  mapH = 0;
  myIdx?: number;
  /** cảnh báo bị tấn công gần nhất */
  alert?: { x: number; y: number; at: number; text: string };
  private listeners = new Set<Listener>();
  private hpMemo = new Map<number, number>();
  private code = '';

  /** Mỗi ván mới / đổi phòng: xoá sạch */
  reset(code: string, startedAt: number, mapW: number, mapH: number, myIdx?: number) {
    const key = `${code}:${startedAt}:${myIdx}`;
    if (this.code === key) return;
    this.code = key;
    this.frame = undefined;
    this.units.clear();
    this.towers.clear();
    this.effects = [];
    this.hpMemo.clear();
    this.alert = undefined;
    this.mapW = mapW;
    this.mapH = mapH;
    this.myIdx = myIdx;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  push(f: AntsFrame) {
    if (this.frame && f.tick <= this.frame.tick) return;
    const now = performance.now();
    const seenU = new Set<number>();
    for (let i = 0; i < f.u.length; i += ANTS_UNIT_FIELDS) {
      const id = f.u[i];
      const x = f.u[i + 3], y = f.u[i + 4];
      seenU.add(id);
      let s = this.units.get(id);
      if (!s) {
        s = { id, owner: f.u[i + 1], kind: UNIT_KINDS[f.u[i + 2]], x, y, px: x, py: y, hp: f.u[i + 5], flags: f.u[i + 6], angle: Math.random() * Math.PI * 2, phase: Math.random() * 6 };
        this.units.set(id, s);
      } else {
        const far = Math.abs(s.x - x) + Math.abs(s.y - y) > 60;
        s.px = far ? x : s.x;
        s.py = far ? y : s.y;
        s.x = x;
        s.y = y;
        s.hp = f.u[i + 5];
        s.flags = f.u[i + 6];
        const dx = s.x - s.px, dy = s.y - s.py;
        if (dx * dx + dy * dy > 0.4) {
          let d = Math.atan2(dy, dx) - s.angle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          s.angle += d * 0.6;
        }
      }
    }
    for (const id of this.units.keys()) if (!seenU.has(id)) this.units.delete(id);

    const seenT = new Set<number>();
    for (let i = 0; i < f.b.length; i += ANTS_TOWER_FIELDS) {
      const id = f.b[i];
      seenT.add(id);
      this.towers.set(id, { id, owner: f.b[i + 1], kind: TOWER_KINDS[f.b[i + 2]], x: f.b[i + 3], y: f.b[i + 4], hp: f.b[i + 5], cd: f.b[i + 6] / 10 });
    }
    for (const id of this.towers.keys()) if (!seenT.has(id)) this.towers.delete(id);

    for (let i = 0; i < f.s.length; i += ANTS_SHOT_FIELDS) {
      const kind = SHOT_NAMES[f.s[i + 4]] ?? 'acid';
      this.effects.push({ kind, x1: f.s[i], y1: f.s[i + 1], x2: f.s[i + 2], y2: f.s[i + 3], target: f.s[i + 5], t0: now, dur: Math.max(120, f.s[i + 6]) });
    }
    for (let i = 0; i < f.d.length; i += 3) {
      const big = f.d[i + 2] === 1;
      this.effects.push({ kind: big ? 'rubble' : 'death', x1: f.d[i], y1: f.d[i + 1], x2: 0, y2: 0, t0: now, dur: big ? 1600 : 700 });
    }
    if (this.effects.length > 500) this.effects = this.effects.slice(-500);

    // cảnh báo trụ bị đánh
    if (f.me && this.myIdx !== undefined) {
      for (const t of this.towers.values()) {
        if (t.owner !== this.myIdx) continue;
        const prev = this.hpMemo.get(t.id);
        if (prev !== undefined && t.hp < prev && (!this.alert || now - this.alert.at > 9000)) {
          this.alert = { x: t.x, y: t.y, at: now, text: `${ANT_TOWERS[t.kind].name} đang bị tấn công!` };
          this.effects.push({ kind: 'ping', x1: t.x, y1: t.y, x2: 0, y2: 0, t0: now, dur: 2500 });
        }
        this.hpMemo.set(t.id, t.hp);
      }
    }

    this.frame = f;
    this.frameAt = now;
    this.listeners.forEach((l) => l());
  }

  /** Nội suy 0..1 giữa khung trước và khung hiện tại */
  alpha(now = performance.now()) {
    return Math.max(0, Math.min(1, (now - this.frameAt) / ANTS_TICK_MS));
  }

  /** Vị trí đang vẽ của một con kiến (để đạn bám theo) */
  unitPos(id: number, a = this.alpha()) {
    const u = this.units.get(id);
    return u ? { x: u.px + (u.x - u.px) * a, y: u.py + (u.y - u.py) * a } : undefined;
  }
}

export const antsStore = new AntsStore();
