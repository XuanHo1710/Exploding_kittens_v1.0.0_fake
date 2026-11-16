/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms)
 * Kho trạng thái khung hình thời gian thực phía Client (15 Hz -> nội suy mượt 60/120/144 FPS).
 *
 * Chức năng chính:
 * - Lưu `prevFrame` & `currFrame` để nội suy tuyến tính `(x, y)` và góc xoay ngắn nhất `facing`
 *   của từng trung đoàn qua chu kỳ `TW_TICK_MS` (~67ms).
 * - Tiến triển mượt `progress` của tên bay, hỏa tiễn, nỏ sắt và đá bắn máy Uy Viễn ở 60fps+.
 * - Quản lý hàng đợi hiệu ứng âm thanh chiến trường (`pendingSfx` / `drainSfx`) và
 *   hộp thoại đối đáp võ tướng (`activeBanter` hiển thị trong 6.5 giây).
 */

import {
  TW_TICK_MS,
  type TwBanterEvent,
  type TwFrame,
  type TwProjectileFrame,
  type TwProjectileKind,
  type TwRegimentFrame,
  type TwSfxEvent,
} from '../../../shared/src/tw';

/** Thời gian hiển thị mỗi đoạn đối thoại khiêu khích võ tướng trên chiến trường (6.5 giây) */
const TW_BANTER_DISPLAY_MS = 6500;

/** Giới hạn tối đa số sự kiện âm thanh chờ phát để tránh dồn ứ khi tab chạy nền */
const TW_MAX_PENDING_SFX = 64;

/** Ngưỡng khoảng cách dịch chuyển tức thời (bỏ qua nội suy nếu vượt quá ngưỡng này) */
const TW_TELEPORT_SNAP_DIST = 260;

/** Vận tốc ước lượng theo loại đạn (đơn vị bản đồ / giây) để làm mượt nhịp bắn đầu tiên */
const PROJECTILE_SPEED_ESTIMATE: Record<TwProjectileKind, number> = {
  bolt: 560,
  arrow: 460,
  fire_arrow: 420,
  boulder: 300,
};

export interface TwInterpolatedFrame {
  frame: TwFrame;
  regiments: TwRegimentFrame[];
  projectiles: TwProjectileFrame[];
}

interface ProjectileInterpTrack {
  startProgress: number;
  endProgress: number;
}

type TwStoreListener = () => void;

const TWO_PI = Math.PI * 2;

function nowClock(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/**
 * Chuẩn hóa mốc thời gian truyền vào từ `requestAnimationFrame` (`performance.now()`)
 * hoặc từ các component dùng `Date.now()` về cùng hệ quy chiếu của `lastPushAt`.
 */
function normalizeNowMs(nowMs?: number): number {
  const perfNow = nowClock();
  if (nowMs === undefined || !Number.isFinite(nowMs)) {
    return perfNow;
  }
  if (nowMs > 1e11 && perfNow < 1e11) {
    return perfNow + (nowMs - Date.now());
  }
  return nowMs;
}

/** Đưa góc bất kỳ (radian) về đoạn chuẩn `[-PI, PI]` */
function normalizeAngle(rad: number): number {
  let a = (rad + Math.PI) % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a - Math.PI;
}

/** Nội suy góc theo cung tròn ngắn nhất giữa `fromRad` và `toRad` với hệ số `t` trong `[0, 1]` */
function lerpAngleShortest(fromRad: number, toRad: number, t: number): number {
  let diff = (toRad - fromRad + Math.PI) % TWO_PI;
  if (diff < 0) diff += TWO_PI;
  diff -= Math.PI;
  return normalizeAngle(fromRad + diff * t);
}

/** Ước lượng bước tiến `progress` mỗi nhịp `TW_TICK_MS` cho đạn mới rời cung/máy bắn đá */
function estimateProjectileStepPerTick(proj: TwProjectileFrame): number {
  const dist = Math.hypot(proj.x1 - proj.x0, proj.y1 - proj.y0);
  const speed = PROJECTILE_SPEED_ESTIMATE[proj.kind] ?? 450;
  const flightSec = Math.max(0.24, dist / speed);
  const step = (TW_TICK_MS / 1000) / flightSec;
  return Math.max(0.03, Math.min(0.35, step));
}

export class TwStore {
  prevFrame: TwFrame | null = null;
  currFrame: TwFrame | null = null;
  lastPushAt = 0;
  seenBanterIds: Set<number> = new Set<number>();
  activeBanter: TwBanterEvent | null = null;
  banterExpiresAt = 0;
  pendingSfx: TwSfxEvent[] = [];

  private readonly listeners = new Set<TwStoreListener>();
  private readonly prevRegMap = new Map<number, TwRegimentFrame>();
  private readonly prevProjMap = new Map<number, TwProjectileFrame>();
  private readonly projTracks = new Map<number, ProjectileInterpTrack>();

  constructor() {
    this.push = this.push.bind(this);
    this.reset = this.reset.bind(this);
    this.subscribe = this.subscribe.bind(this);
    this.drainSfx = this.drainSfx.bind(this);
    this.currentBanter = this.currentBanter.bind(this);
    this.pushLocalBanter = this.pushLocalBanter.bind(this);
    this.interpolatedFrame = this.interpolatedFrame.bind(this);
  }

  /** Xóa toàn bộ trạng thái khi bắt đầu trận mới hoặc rời chiến trường */
  reset(): void {
    this.prevFrame = null;
    this.currFrame = null;
    this.lastPushAt = 0;
    this.seenBanterIds.clear();
    this.activeBanter = null;
    this.banterExpiresAt = 0;
    this.pendingSfx = [];
    this.prevRegMap.clear();
    this.prevProjMap.clear();
    this.projTracks.clear();
    this.notify();
  }

  /** Đăng ký lắng nghe mỗi khi có khung hình hoặc đối thoại mới; trả về hàm hủy đăng ký */
  subscribe(fn: TwStoreListener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Đẩy khung hình mới từ máy chủ (15 Hz):
   * - Cập nhật `prevFrame` / `currFrame` và bảng tra cứu O(1) cho nội suy.
   * - Xếp hàng các sự kiện âm thanh `f.sfxEvents`.
   * - Đưa lời thoại mới trong `f.banters` lên `activeBanter` (hiển thị 6.5 giây).
   * - Thông báo cho toàn bộ subscriber (HUD / Canvas).
   */
  push(f: TwFrame): void {
    if (this.currFrame && f.tick <= this.currFrame.tick) {
      // Nếu chỉ số tick lùi sâu (ván mới khởi tạo lại từ đầu mà chưa kịp gọi reset), tự dọn sạch kho
      if (this.currFrame.tick - f.tick < 20 && f.tick > 2) {
        return;
      }
      this.prevFrame = null;
      this.seenBanterIds.clear();
      this.activeBanter = null;
      this.banterExpiresAt = 0;
      this.pendingSfx = [];
      this.prevRegMap.clear();
      this.prevProjMap.clear();
      this.projTracks.clear();
    }

    const now = nowClock();
    const prevElapsedAlpha =
      this.lastPushAt > 0
        ? Math.max(0, Math.min(1.15, (now - this.lastPushAt) / TW_TICK_MS))
        : 0;

    // Ghi nhận bản đồ trung đoàn & đạn từ khung trước để tra cứu O(1) ở 60fps
    this.prevRegMap.clear();
    this.prevProjMap.clear();
    if (this.currFrame) {
      for (const reg of this.currFrame.regiments) {
        this.prevRegMap.set(reg.id, reg);
      }
      for (const proj of this.currFrame.projectiles) {
        this.prevProjMap.set(proj.id, proj);
      }
    }

    // Tính quỹ đạo tiến triển mượt cho từng đường đạn trong nhịp mới
    const nextTracks = new Map<number, ProjectileInterpTrack>();
    for (const proj of f.projectiles) {
      const clampedServerProg = Math.max(0, Math.min(1, proj.progress));
      const prevProj = this.prevProjMap.get(proj.id);
      const prevTrack = this.projTracks.get(proj.id);

      let stepPerTick: number;
      if (prevProj && clampedServerProg > prevProj.progress) {
        stepPerTick = clampedServerProg - prevProj.progress;
      } else if (!prevProj && clampedServerProg > 0 && clampedServerProg < 0.35) {
        stepPerTick = clampedServerProg;
      } else {
        stepPerTick = estimateProjectileStepPerTick(proj);
      }

      const prevRendered = prevTrack
        ? Math.min(
            1,
            prevTrack.startProgress +
              (prevTrack.endProgress - prevTrack.startProgress) * prevElapsedAlpha,
          )
        : 0;

      const startProgress = prevTrack
        ? Math.min(1, Math.max(clampedServerProg, prevRendered))
        : clampedServerProg;

      let endProgress = Math.min(1, clampedServerProg + stepPerTick);
      if (endProgress < startProgress) {
        endProgress = Math.min(1, startProgress + stepPerTick * 0.25);
      }

      nextTracks.set(proj.id, { startProgress, endProgress });
    }
    this.projTracks.clear();
    for (const [id, track] of nextTracks) {
      this.projTracks.set(id, track);
    }

    this.prevFrame = this.currFrame;
    this.currFrame = f;
    this.lastPushAt = now;

    // Hàng đợi hiệu ứng âm thanh chiến trường
    if (f.sfxEvents && f.sfxEvents.length > 0) {
      for (const sfx of f.sfxEvents) {
        this.pendingSfx.push(sfx);
      }
      if (this.pendingSfx.length > TW_MAX_PENDING_SFX) {
        this.pendingSfx.splice(0, this.pendingSfx.length - TW_MAX_PENDING_SFX);
      }
    }

    // Dọn đối thoại đã hết hạn trước khi xét đối thoại mới
    if (this.activeBanter && now >= this.banterExpiresAt) {
      this.activeBanter = null;
      this.banterExpiresAt = 0;
    }

    // Đưa đối thoại võ tướng mới lên hiển thị trong 6.5 giây
    if (f.banters && f.banters.length > 0) {
      for (const banter of f.banters) {
        if (!this.seenBanterIds.has(banter.id)) {
          this.seenBanterIds.add(banter.id);
          this.activeBanter = banter;
          this.banterExpiresAt = now + TW_BANTER_DISPLAY_MS;
        }
      }
    }

    this.notify();
  }

  /** Rút toàn bộ sự kiện âm thanh đang chờ phát ra khỏi hàng đợi */
  drainSfx(): TwSfxEvent[] {
    if (this.pendingSfx.length === 0) {
      return [];
    }
    const drained = this.pendingSfx;
    this.pendingSfx = [];
    return drained;
  }

  /** Lấy đoạn đối thoại võ tướng đang hiển thị (trả về `null` nếu đã hết hạn 6.5 giây) */
  currentBanter(nowMs?: number): TwBanterEvent | null {
    if (!this.activeBanter) {
      return null;
    }
    const now = normalizeNowMs(nowMs);
    if (now >= this.banterExpiresAt) {
      this.activeBanter = null;
      this.banterExpiresAt = 0;
      return null;
    }
    return this.activeBanter;
  }

  /** Kích hoạt ngay một đoạn đối thoại võ tướng nội bộ phía Client trong 6.5 giây */
  pushLocalBanter(b: TwBanterEvent): void {
    const now = nowClock();
    this.seenBanterIds.add(b.id);
    this.activeBanter = b;
    this.banterExpiresAt = now + TW_BANTER_DISPLAY_MS;
    this.notify();
  }

  /**
   * Trả về khung hình đã nội suy mượt cho vòng lặp vẽ 60/120/144 FPS:
   * - Nội suy tuyến tính `(x, y)` và góc hướng mặt ngắn nhất `facing` của từng trung đoàn
   *   giữa `prevFrame` và `currFrame` trong khoảng `TW_TICK_MS` (~67ms).
   * - Tiến triển mượt `progress` của từng đường đạn để mưa tên và đá bắn bay liền mạch.
   */
  interpolatedFrame(nowMs?: number): TwInterpolatedFrame | null {
    const curr = this.currFrame;
    if (!curr) {
      return null;
    }

    const now = normalizeNowMs(nowMs);
    const elapsedMs = this.lastPushAt > 0 ? Math.max(0, now - this.lastPushAt) : 0;
    const regAlpha = Math.max(0, Math.min(1, elapsedMs / TW_TICK_MS));
    const projAlpha = Math.max(0, Math.min(1.15, elapsedMs / TW_TICK_MS));

    const hasPrev = this.prevFrame !== null && regAlpha < 1;
    const regiments: TwRegimentFrame[] = new Array<TwRegimentFrame>(curr.regiments.length);

    for (let i = 0; i < curr.regiments.length; i++) {
      const reg = curr.regiments[i];
      if (!hasPrev) {
        regiments[i] = { ...reg };
        continue;
      }

      const prev = this.prevRegMap.get(reg.id);
      if (!prev) {
        regiments[i] = { ...reg };
        continue;
      }

      const dx = reg.x - prev.x;
      const dy = reg.y - prev.y;
      if (Math.hypot(dx, dy) > TW_TELEPORT_SNAP_DIST) {
        regiments[i] = { ...reg };
        continue;
      }

      regiments[i] = {
        ...reg,
        x: prev.x + dx * regAlpha,
        y: prev.y + dy * regAlpha,
        facing: lerpAngleShortest(prev.facing, reg.facing, regAlpha),
      };
    }

    const projectiles: TwProjectileFrame[] = new Array<TwProjectileFrame>(
      curr.projectiles.length,
    );
    for (let i = 0; i < curr.projectiles.length; i++) {
      const proj = curr.projectiles[i];
      const track = this.projTracks.get(proj.id);
      let progress: number;
      if (track) {
        progress =
          track.startProgress + (track.endProgress - track.startProgress) * projAlpha;
      } else {
        const step = estimateProjectileStepPerTick(proj);
        progress = proj.progress + step * projAlpha;
      }
      projectiles[i] = {
        ...proj,
        progress: Math.max(0, Math.min(1, progress)),
      };
    }

    return {
      frame: curr,
      regiments,
      projectiles,
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const twStore = new TwStore();
