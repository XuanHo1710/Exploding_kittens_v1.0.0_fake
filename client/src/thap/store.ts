/**
 * Kho khung hình Miragine War cổ điển phía client (`thap:frame` 15 FPS):
 * - Lưu vị trí nhịp trước & hiện tại để nội suy mượt ở 60 FPS qua `interpPos()`.
 * - Giải mã cờ hành động lính (`THAP_FLAG_*`), đạn phép (`fb`/`tb`/`storm` & đạn Trụ Pha Lê),
 *   sự kiện tử trận (`decodeDeathCode`), cảnh báo Trụ Pha Lê và hàng đợi âm thanh không gian.
 */
import {
  MIRAGINE_ANIMS,
  THAP_ARENA_H,
  THAP_ARENA_W,
  THAP_CRYSTALS,
  THAP_DEATH_FIELDS,
  THAP_FIRST_ROUND_S,
  THAP_FLAG_ATK_START,
  THAP_FLAG_ATTACKING,
  THAP_FLAG_LEFT,
  THAP_FLAG_MOVING,
  THAP_SHOT_CRYSTAL_FLAG,
  THAP_SHOT_FB,
  THAP_SHOT_FIELDS,
  THAP_SHOT_STORM,
  THAP_SHOT_TB,
  THAP_TICK_MS,
  THAP_UNIT_FIELDS,
  THAP_UNIT_KINDS,
  THAP_UNITS,
  animKey,
  decodeDeathCode,
  type ThapFrame,
  type ThapUnitKind,
} from '../../../shared/src';

export interface ThapUnitState {
  id: number;
  owner: number;
  kind: ThapUnitKind;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  flags: number;
  angle: number;
  phase: number;
  atkAt: number;
}

export type ThapShotKind = 'fb' | 'tb' | 'storm';

export interface ThapEffect {
  kind: ThapShotKind | 'death' | 'rubble';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  target?: number;
  isCrystal?: boolean;
  unitKind?: ThapUnitKind;
  unitOwner?: number;
  left?: boolean;
  t0: number;
  dur: number;
}

export interface ThapSpatialAudioEvent {
  type: 'hit' | 'die' | 'boom';
  x: number;
  y: number;
}

const MAX_EFFECTS = 240;
const MAX_AUDIO_EVENTS = 32;
const ALERT_COOLDOWN_MS = 2500;
const SNAP_TELEPORT_DIST = 60;

/** Thời gian nổ/dư âm sau va chạm khớp với `renderEffects.ts`. */
export const THAP_FB_BOOM_MS = 380;
export const THAP_TB_LINGER_MS = 240;
export const THAP_STORM_LINGER_MS = 260;

export function effectTotalLifetimeMs(e: Pick<ThapEffect, 'kind' | 'dur'>): number {
  if (e.kind === 'fb') return e.dur + THAP_FB_BOOM_MS;
  if (e.kind === 'tb') return e.dur + THAP_TB_LINGER_MS;
  if (e.kind === 'storm') return e.dur + THAP_STORM_LINGER_MS;
  return e.dur;
}

const SHOT_KIND_BY_IDX: Record<number, ThapShotKind> = {
  [THAP_SHOT_FB]: 'fb',
  [THAP_SHOT_TB]: 'tb',
  [THAP_SHOT_STORM]: 'storm',
};

type Listener = () => void;

class ThapStore {
  frame?: ThapFrame;
  frameAt = 0;
  units = new Map<number, ThapUnitState>();
  baseHp: number[] = [100, 100];
  baseHitAt: number[] = [0, 0];
  effects: ThapEffect[] = [];
  audioEvents: ThapSpatialAudioEvent[] = [];
  mapW = THAP_ARENA_W;
  mapH = THAP_ARENA_H;
  myIdx?: number;
  bases: [number, number][] = [];
  alert?: { x: number; y: number; at: number; text: string };
  lastWaveUnits: [number, number] = [-1, -1];
  wave = 0;
  roundLeft = 0;
  roundTotalS = THAP_FIRST_ROUND_S;
  baseFalls = 0;
  unitDeaths = 0;
  combatHits = 0;

  private listeners = new Set<Listener>();
  private code = '';

  /** Đặt lại toàn bộ kho khi vào ván mới hoặc đổi phòng. */
  reset(
    code: string,
    startedAt: number,
    mapW = THAP_ARENA_W,
    mapH = THAP_ARENA_H,
    myIdx?: number,
    bases: [number, number][] = [],
  ): void {
    this.bases = bases;
    this.mapW = mapW || THAP_ARENA_W;
    this.mapH = mapH || THAP_ARENA_H;
    const key = `${code}:${startedAt}:${myIdx}`;
    if (this.code === key) return;
    // Nếu vừa chuyển từ phòng chờ trống (reset('', 0)) sang trận mới và tick-0 đã tới sớm vài ms, giữ nguyên tick-0.
    const preserveEarlyTick0 = this.code.startsWith(':0:') && code !== '' && this.frame?.tick === 0;
    this.code = key;
    if (!preserveEarlyTick0) {
      this.clearMatchState();
    }
    this.myIdx = myIdx;
  }

  /** Đăng ký lắng nghe mỗi khi có khung hình mới từ server. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Nạp một khung hình `thap:frame` mới, cập nhật thực thể, hiệu ứng và sự kiện âm thanh. */
  push(f: ThapFrame): void {
    if (this.frame && f.tick <= this.frame.tick) {
      const restartedAtZero = f.tick === 0 && this.frame.tick > 0;
      if (!restartedAtZero && this.frame.tick - f.tick < 50) return;
      this.clearMatchState();
    }

    const now = performance.now();
    this.wave = f.wave;
    this.roundLeft = f.roundLeft;
    this.roundTotalS = f.roundTotalS;
    this.lastWaveUnits = f.lastWaveUnits ? [f.lastWaveUnits[0], f.lastWaveUnits[1]] : [-1, -1];

    this.syncUnits(f.u, now);
    this.syncBaseHp(f.bh, now);
    this.pushShots(f.s, now);
    this.pushDeaths(f.d, now);
    this.pruneEffects(now);

    this.frame = f;
    this.frameAt = now;
    this.listeners.forEach((l) => l());
  }

  /** Trả về và dọn sạch hàng đợi sự kiện âm thanh không gian đã tích lũy. */
  consumeAudioEvents(): ThapSpatialAudioEvent[] {
    if (this.audioEvents.length === 0) return [];
    const out = this.audioEvents;
    this.audioEvents = [];
    return out;
  }

  /** Hệ số nội suy `0..1` giữa nhịp trước và nhịp hiện tại theo `THAP_TICK_MS`. */
  alpha(now = performance.now()): number {
    return Math.max(0, Math.min(1, (now - this.frameAt) / THAP_TICK_MS));
  }

  /** Nội suy vị trí hiện tại của một đơn vị lính theo mốc thời gian `now`. */
  interpPos(u: ThapUnitState, now = performance.now()): { x: number; y: number } {
    const a = this.alpha(now);
    return {
      x: u.px + (u.x - u.px) * a,
      y: u.py + (u.y - u.py) * a,
    };
  }

  /** Vị trí nội suy theo `id` lính (dùng để đạn bám mục tiêu). */
  unitPos(id: number, a = this.alpha()): { x: number; y: number } | undefined {
    const u = this.units.get(id);
    return u ? { x: u.px + (u.x - u.px) * a, y: u.py + (u.y - u.py) * a } : undefined;
  }

  private clearMatchState(): void {
    this.frame = undefined;
    this.frameAt = 0;
    this.units.clear();
    this.baseHp = [100, 100];
    this.baseHitAt = [0, 0];
    this.effects = [];
    this.audioEvents = [];
    this.alert = undefined;
    this.lastWaveUnits = [-1, -1];
    this.wave = 0;
    this.roundLeft = 0;
    this.roundTotalS = THAP_FIRST_ROUND_S;
    this.baseFalls = 0;
    this.unitDeaths = 0;
    this.combatHits = 0;
  }

  private pushAudio(ev: ThapSpatialAudioEvent): void {
    this.audioEvents.push(ev);
    if (this.audioEvents.length > MAX_AUDIO_EVENTS) {
      this.audioEvents = this.audioEvents.slice(-MAX_AUDIO_EVENTS);
    }
  }

  private syncUnits(buf: number[], now: number): void {
    const seen = new Set<number>();
    let anyAttack = false;

    for (let i = 0; i + THAP_UNIT_FIELDS <= buf.length; i += THAP_UNIT_FIELDS) {
      const id = buf[i];
      const owner = buf[i + 1];
      const kind = THAP_UNIT_KINDS[buf[i + 2]] ?? 'newbie';
      const x = buf[i + 3];
      const y = buf[i + 4];
      const hp = buf[i + 5];
      const flags = buf[i + 6];

      seen.add(id);
      const atkStart = (flags & THAP_FLAG_ATK_START) !== 0;
      const attacking = (flags & THAP_FLAG_ATTACKING) !== 0;
      const left = (flags & THAP_FLAG_LEFT) !== 0;
      const moving = (flags & THAP_FLAG_MOVING) !== 0;
      const prev = this.units.get(id);

      if (!prev) {
        const triggered = atkStart || attacking;
        if (triggered) {
          anyAttack = true;
          this.pushAudio({ type: 'hit', x, y });
        }
        this.units.set(id, {
          id,
          owner,
          kind,
          x,
          y,
          px: x,
          py: y,
          hp,
          flags,
          angle: left ? Math.PI : 0,
          phase: (id * 0.97) % (Math.PI * 2),
          atkAt: triggered ? now : 0,
        });
        continue;
      }

      const far = Math.abs(prev.x - x) + Math.abs(prev.y - y) > SNAP_TELEPORT_DIST;
      prev.px = far ? x : prev.x;
      prev.py = far ? y : prev.py;
      prev.x = x;
      prev.y = y;
      prev.owner = owner;
      prev.kind = kind;
      prev.hp = hp;

      const dx = prev.x - prev.px;
      const dy = prev.y - prev.py;
      if (!moving) {
        prev.angle = left ? Math.PI : 0;
      } else {
        if (dx * dx + dy * dy > 0.4) {
          let d = Math.atan2(dy, dx) - prev.angle;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          prev.angle += d * 0.6;
        } else if (far) {
          prev.angle = left ? Math.PI : 0;
        }
        const step = Math.hypot(dx, dy);
        prev.phase = (prev.phase + (step > 0.2 ? Math.min(2.2, step * 0.14) : 0.45)) % (Math.PI * 2);
      }

      const triggered = atkStart || (attacking && (prev.flags & THAP_FLAG_ATTACKING) === 0);
      prev.flags = flags;
      if (triggered) {
        anyAttack = true;
        prev.atkAt = now;
        this.pushAudio({ type: 'hit', x, y });
      }
    }

    if (anyAttack) this.combatHits++;

    for (const id of this.units.keys()) {
      if (!seen.has(id)) this.units.delete(id);
    }
  }

  private syncBaseHp(nextBh: number[], now: number): void {
    const hasPrevFrame = Boolean(this.frame);
    const prevBh = this.baseHp;
    const next = nextBh.slice();

    if (hasPrevFrame) {
      for (let i = 0; i < next.length; i++) {
        const prevHp = prevBh[i];
        const nextHp = next[i];
        if (prevHp !== undefined && nextHp !== undefined && nextHp < prevHp) {
          this.baseHitAt[i] = now;
          if (i === this.myIdx && (!this.alert || now - this.alert.at > ALERT_COOLDOWN_MS)) {
            const basePos = this.bases[i] ?? THAP_CRYSTALS[i];
            if (basePos) {
              this.alert = {
                x: basePos[0],
                y: basePos[1],
                at: now,
                text: 'Pha Lê Chính đang bị tấn công!',
              };
            }
          }
        }
      }
    }

    this.baseHp = next;
  }

  private pushShots(buf: number[], now: number): void {
    for (let i = 0; i + THAP_SHOT_FIELDS <= buf.length; i += THAP_SHOT_FIELDS) {
      const rawType = buf[i + 4];
      const isCrystal = (rawType & THAP_SHOT_CRYSTAL_FLAG) !== 0;
      const shotKind = SHOT_KIND_BY_IDX[rawType & 3] ?? 'fb';
      const target = buf[i + 5];
      const dur = Math.max(120, buf[i + 6] || (shotKind === 'storm' ? 450 : 220));

      this.effects.push({
        kind: shotKind,
        x1: buf[i],
        y1: buf[i + 1],
        x2: buf[i + 2],
        y2: buf[i + 3],
        target: target >= 0 ? target : undefined,
        isCrystal,
        t0: now,
        dur,
      });
    }
  }

  private pushDeaths(buf: number[], now: number): void {
    for (let i = 0; i + THAP_DEATH_FIELDS <= buf.length; i += THAP_DEATH_FIELDS) {
      const x = buf[i];
      const y = buf[i + 1];
      const decoded = decodeDeathCode(buf[i + 2]);

      if (decoded.isBase) {
        this.baseFalls++;
        this.effects.push({
          kind: 'rubble',
          x1: x,
          y1: y,
          x2: 0,
          y2: 0,
          unitOwner: decoded.owner,
          t0: now,
          dur: 2200,
        });
        this.pushAudio({ type: 'boom', x, y });
        continue;
      }

      const unitKind = THAP_UNIT_KINDS[decoded.kindIdx] ?? 'newbie';
      const side = decoded.owner === 1 ? 'B' : 'A';
      const anim = MIRAGINE_ANIMS[animKey(side, THAP_UNITS[unitKind].ss, 'dead')];
      const frames = anim ? anim[0] : 3;
      const dur = Math.max(420, frames * 120 + 250);

      this.unitDeaths++;
      this.effects.push({
        kind: 'death',
        x1: x,
        y1: y,
        x2: 0,
        y2: 0,
        unitKind,
        unitOwner: decoded.owner,
        left: decoded.left,
        t0: now,
        dur,
      });
      this.pushAudio({ type: 'die', x, y });
    }
  }

  private pruneEffects(now: number): void {
    this.effects = this.effects.filter((e) => now - e.t0 <= effectTotalLifetimeMs(e));
    if (this.effects.length > MAX_EFFECTS) {
      this.effects = this.effects.slice(-MAX_EFFECTS);
    }
  }
}

export const thapStore = new ThapStore();

/** Lấy và xóa toàn bộ sự kiện âm thanh không gian chờ phát của `thapStore`. */
export function consumeAudioEvents(): ThapSpatialAudioEvent[] {
  return thapStore.consumeAudioEvents();
}

/** Nội suy vị trí hiển thị mượt của một đơn vị lính theo `THAP_TICK_MS`. */
export function interpPos(u: ThapUnitState, now = performance.now()): { x: number; y: number } {
  return thapStore.interpPos(u, now);
}
