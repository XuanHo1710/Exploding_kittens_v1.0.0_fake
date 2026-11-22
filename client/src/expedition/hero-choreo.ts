/**
 * Vũ đạo 3D cho từng kỹ năng của Miran (gustave_blade, Phong Mộc — kiếm gió).
 *
 * Mỗi kỹ năng có:
 *  - `pose(t)`: tư thế theo từng khung (nhảy cao, nghiêng, nén / duỗi người, lao, xoay vòng) tính theo thời gian
 *    tương đối với nhịp đánh, khớp đúng mốc sát thương của engine.
 *  - `close`: có áp sát mục tiêu hay đứng tại chỗ tung chiêu.
 *  - `emit`: hiệu ứng liên tục (hào quang, vòng pháp trận, lá gió cuốn) và `impact`: hiệu ứng ở từng nhịp trúng đòn.
 * battle3d.ts chỉ việc gọi; mọi tham số vũ đạo nằm ở đây để chỉnh tay dễ dàng.
 */

export interface ChoreoTime {
  now: number;
  /** ms so với nhịp đầu tiên (âm = trước nhịp) */
  rel: number;
  /** 0 → 1: quãng lao tới (bắt đầu 510 ms trước nhịp đầu) */
  approach: number;
  beatT: readonly number[];
  dir: number;
}

export interface ChoreoPose { sx: number; sy: number; lift: number; tilt: number; push: number; spin: number }

/** Hiệu ứng mà vũ đạo yêu cầu sân khấu 3D vẽ. */
export type ChoreoFx =
  | { kind: 'slash'; at: 'target' | 'targets' | 'self'; rot: number; scale: number; color?: number; height?: number }
  | { kind: 'ring'; at: 'target' | 'targets' | 'self' | 'center'; size: number; life?: number; color?: number }
  | { kind: 'sparks'; at: 'target' | 'targets' | 'self'; count: number; color?: number }
  | { kind: 'burst'; at: 'target' | 'targets' | 'self'; color?: number; height?: number }
  | { kind: 'leaves'; at: 'target' | 'targets' | 'self' | 'center'; count: number; up?: number; spread?: number }
  | { kind: 'motes'; at: 'self'; count: number; color?: number; rise?: number }
  | { kind: 'pillar'; at: 'target' | 'center'; color?: number }
  | { kind: 'shake'; amp: number; ms: number }
  | { kind: 'bolt' }
  | { kind: 'debris'; at: 'target' | 'targets' | 'self' | 'center'; style: DebrisStyle; count: number; up?: number; spread?: number };

export type DebrisStyle = 'leaves' | 'shards' | 'glints' | 'droplets' | 'embers' | 'stars';

/** Đạn bay của kỹ năng: từ người tung → mục tiêu (hoặc rơi từ trời xuống), chạm đúng nhịp. */
export interface ChoreoProjectile { color: number; size: number; arc: number; flight?: number; sky?: boolean; all?: boolean }

export interface SkillChoreo {
  close: boolean;
  pose(t: ChoreoTime): ChoreoPose;
  /** gọi mỗi ~45 ms trong lúc ra chiêu */
  emit?(t: ChoreoTime): ChoreoFx[];
  /** gọi đúng lúc nhịp `i` chạm */
  impact?(i: number, count: number): ChoreoFx[];
  projectile?: ChoreoProjectile;
}

const WIND = 0x8dffb0;
const WIND_HI = 0xe8fff0;
const TEAL = 0x6fe7d8;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => n * n * (3 - 2 * n);
const base = (): ChoreoPose => ({ sx: 1, sy: 1, lift: 0, tilt: 0, push: 0, spin: 0 });
/** độ gần nhịp: 1 ngay tại nhịp, 0 khi cách xa hơn `w` ms */
const near = (now: number, at: number, w: number, lead = 0) => Math.max(0, 1 - Math.abs(now - at + lead) / w);

const MIRAN: Record<string, SkillChoreo> = {
  // ------------------------------------------------ Trảm Phong Liên Nhịp (đánh thường): lướt thấp, 2 nhát ngang chéo
  gus_basic: {
    close: true,
    pose: ({ now, approach, beatT, dir }) => {
      const p = base();
      p.lift = Math.sin(approach * Math.PI) * 0.35 * (approach < 1 ? 1 : 0);
      p.tilt = dir * 0.18 * Math.sin(approach * Math.PI);
      beatT.forEach((bt, i) => {
        const k = near(now, bt, 120, 20);
        if (!k) return;
        p.tilt = dir * 0.32 * (i % 2 ? -1 : 1) * k;
        p.push += 0.32 * k;
        p.sx = Math.max(p.sx, 1 + 0.14 * k);
        p.sy = Math.min(p.sy, 1 - 0.08 * k);
      });
      return p;
    },
    emit: ({ approach }) => (approach > 0 && approach < 1 ? [{ kind: 'leaves', at: 'self', count: 1, up: 0.4, spread: 0.6 }] : []),
    impact: (i) => [
      { kind: 'slash', at: 'target', rot: i % 2 ? -0.9 : 0.25, scale: 1.05, color: WIND },
      { kind: 'sparks', at: 'target', count: 6, color: WIND_HI },
      { kind: 'leaves', at: 'target', count: 5 },
    ],
  },

  // ------------------------------------------------ Lốc Kiếm Đột Kích: xoáy lốc lao tới → hất kiếm lên trời → bổ xuống
  gus_gale_lunge: {
    close: true,
    pose: ({ now, rel, approach, beatT, dir }) => {
      const p = base();
      if (rel < -510) {
        const k = smooth(clamp01((rel + 900) / 390));
        p.sx = 1 + 0.16 * k; p.sy = 1 - 0.14 * k; p.tilt = -dir * 0.18 * k;
        return p;
      }
      if (approach < 1) { // xoáy 3 vòng khi lao
        p.spin = approach * 3;
        p.lift = Math.sin(approach * Math.PI) * 0.6;
        p.tilt = dir * 0.2;
        return p;
      }
      const [b0, b1 = b0 + 220] = beatT;
      const k = clamp01((now - b0 + 60) / (b1 - b0 + 60));
      if (k > 0 && k < 1) {
        p.lift = 1.5 * Math.sin(k * Math.PI);
        p.tilt = dir * (k < 0.5 ? -0.35 : 0.45);
        p.sy = k < 0.5 ? 1.12 : 1;
      }
      const slam = near(now, b1, 90, -20);
      if (slam) { p.sy = 1 - 0.16 * slam; p.sx = 1 + 0.18 * slam; }
      return p;
    },
    emit: ({ rel, approach }) => {
      if (rel < -510) return [{ kind: 'ring', at: 'self', size: 1.4, life: 260, color: WIND }];
      if (approach < 1) return [{ kind: 'leaves', at: 'self', count: 3, up: 1.2, spread: 1.2 }];
      return [];
    },
    impact: (i) => i === 0
      ? [{ kind: 'slash', at: 'target', rot: Math.PI / 2, scale: 1.4, color: WIND, height: 1.6 },
         { kind: 'leaves', at: 'target', count: 10, up: 3 }, { kind: 'sparks', at: 'target', count: 8, color: WIND_HI }]
      : [{ kind: 'slash', at: 'target', rot: -Math.PI / 2, scale: 1.7, color: WIND_HI },
         { kind: 'ring', at: 'target', size: 3.2, color: WIND }, { kind: 'burst', at: 'target', color: WIND_HI },
         { kind: 'shake', amp: 0.18, ms: 160 }],
  },

  // ------------------------------------------------ Đạn Ma Đạo Phá Thế: đứng vững, pháp trận dưới chân, bắn 2 viên đạn gió
  gus_overcharge: {
    close: false,
    projectile: { color: TEAL, size: 0.55, arc: 1.6, flight: 400 },
    pose: ({ now, rel, beatT, dir }) => {
      const p = base();
      const charge = clamp01((rel + 700) / 450);
      p.sy = 1 + 0.06 * charge; p.tilt = -dir * 0.08 * charge; p.push = -0.18 * charge;
      for (const bt of beatT) {
        const k = near(now, bt - 400, 110, -40);
        if (k) { p.push -= 0.28 * k; p.sx = 1 + 0.1 * k; p.tilt = -dir * 0.2 * k; }
      }
      return p;
    },
    emit: ({ rel, beatT, now }) => (rel > -700 && now < beatT[beatT.length - 1]
      ? [{ kind: 'ring', at: 'self', size: 1.8, life: 420, color: TEAL }, { kind: 'motes', at: 'self', count: 2, color: TEAL, rise: 2.2 }]
      : []),
    impact: (i, n) => [
      { kind: 'burst', at: 'target', color: TEAL },
      { kind: 'sparks', at: 'target', count: 14, color: 0xbffff3 },
      { kind: 'ring', at: 'target', size: i === n - 1 ? 2.6 : 1.6, color: TEAL },
      ...(i === n - 1 ? [{ kind: 'shake', amp: 0.16, ms: 140 } as ChoreoFx] : []),
    ],
  },

  // ------------------------------------------------ Tụ Lực: gồng run người, hào quang dâng lên → nhảy bổ một nhát khổng lồ
  gustave_blade_focus: {
    close: true,
    pose: ({ now, rel, beatT, dir }) => {
      const p = base();
      const b0 = beatT[0];
      const charge = clamp01((rel + 900) / 640);
      if (rel < -260) {
        p.sx = 1 + 0.18 * charge; p.sy = 1 - 0.16 * charge;
        p.tilt = Math.sin(now / 24) * 0.05 * charge - dir * 0.1 * charge; // run lên vì dồn lực
        return p;
      }
      const k = clamp01((now - (b0 - 260)) / 260);
      if (k < 1) { p.lift = 2.4 * Math.sin(k * Math.PI * 0.5 + (k > 0.6 ? (k - 0.6) * 2.4 : 0)) * (1 - Math.max(0, k - 0.75) * 4); p.tilt = dir * (k < 0.6 ? -0.25 : 0.55); p.sy = 1.15; }
      const slam = near(now, b0, 120, -30);
      if (slam) { p.sy = 1 - 0.22 * slam; p.sx = 1 + 0.26 * slam; p.lift = 0; }
      return p;
    },
    emit: ({ rel }) => (rel < -260 ? [{ kind: 'motes', at: 'self', count: 3, color: WIND, rise: 3.2 }, { kind: 'leaves', at: 'self', count: 1, up: 2, spread: 0.5 }] : []),
    impact: () => [
      { kind: 'slash', at: 'target', rot: -Math.PI / 2 + 0.15, scale: 2.5, color: WIND_HI },
      { kind: 'ring', at: 'target', size: 3, color: WIND_HI },
      { kind: 'ring', at: 'target', size: 5.5, life: 520, color: WIND },
      { kind: 'sparks', at: 'target', count: 22, color: WIND_HI },
      { kind: 'leaves', at: 'target', count: 16, up: 3.5 },
      { kind: 'shake', amp: 0.3, ms: 240 },
    ],
  },

  // ------------------------------------------------ Bộc Phát: đứng tại chỗ, mỗi nhịp một luồng gió lan khắp phe địch
  gustave_blade_surge: {
    close: false,
    pose: ({ now, beatT, dir }) => {
      const p = base();
      beatT.forEach((bt, i) => {
        const k = near(now, bt, 160, 60);
        if (!k) return;
        p.lift = Math.max(p.lift, 0.55 * k);
        p.push += 0.25 * k;
        p.sy = Math.max(p.sy, 1 + 0.1 * k);
        p.tilt = dir * 0.22 * (i % 2 ? -1 : 1) * k;
      });
      return p;
    },
    emit: ({ rel }) => (rel > -400 ? [{ kind: 'leaves', at: 'self', count: 2, up: 1.5, spread: 1.6 }] : []),
    impact: (i) => [
      { kind: 'ring', at: 'self', size: 10, life: 360, color: WIND },
      { kind: 'burst', at: 'targets', color: WIND_HI },
      { kind: 'leaves', at: 'targets', count: 6, up: 2 },
      ...(i === 2 ? [{ kind: 'shake', amp: 0.16, ms: 140 } as ChoreoFx] : []),
    ],
  },

  // ------------------------------------------------ Thiên Phong Thập Tự Trảm (tối thượng): vọt lên trời, chém chữ thập
  // trên đầu phe địch, xoay một vòng, rồi giáng cột gió xuống giữa trận
  gus_ult_tempest: {
    close: true,
    pose: ({ now, rel, beatT, dir }) => {
      const p = base();
      const [b0, , b2, b3 = b2] = beatT;
      if (rel < -560) {
        const k = smooth(clamp01((rel + 1000) / 440));
        p.sx = 1 + 0.2 * k; p.sy = 1 - 0.2 * k; p.tilt = Math.sin(now / 30) * 0.04 * k;
        return p;
      }
      const rise = clamp01((now - (b0 - 560)) / 420);
      p.lift = 4.2 * (1 - (1 - rise) ** 3);
      p.sy = rise < 1 ? 1.12 : 1;
      beatT.forEach((bt, i) => {
        const k = near(now, bt, 130, 20);
        if (k && i < 2) p.tilt = dir * 0.55 * (i === 0 ? 1 : -1) * k; // hai nhát chéo thành chữ thập
      });
      if (now > b2 - 150 && now < b2 + 120) p.spin = clamp01((now - b2 + 150) / 270); // xoay một vòng
      const plunge = clamp01((now - (b3 - 170)) / 170);
      if (plunge > 0) { p.lift *= 1 - plunge; p.tilt = dir * 0.5 * (1 - plunge); p.sy = 1.2 - 0.4 * near(now, b3, 100, -30); }
      if (now > b3) { p.lift = 0; const k = near(now, b3, 140, -50); p.sx = 1 + 0.3 * k; p.sy = 1 - 0.25 * k; }
      return p;
    },
    emit: ({ rel, beatT, now }) => {
      if (rel < -560) return [{ kind: 'motes', at: 'self', count: 3, color: WIND, rise: 4 }, { kind: 'ring', at: 'self', size: 2.2, life: 300, color: WIND }];
      if (now < beatT[beatT.length - 1]) return [{ kind: 'leaves', at: 'center', count: 3, up: 3, spread: 3.5 }];
      return [];
    },
    impact: (i, n) => {
      if (i < 2) return [
        { kind: 'slash', at: 'targets', rot: i === 0 ? Math.PI / 4 : -Math.PI / 4, scale: 2.4, color: WIND_HI, height: 1.4 },
        { kind: 'sparks', at: 'targets', count: 8, color: WIND_HI }, { kind: 'shake', amp: 0.14, ms: 120 },
      ];
      if (i < n - 1) return [
        { kind: 'slash', at: 'targets', rot: Math.PI / 2, scale: 2.2, color: WIND },
        { kind: 'leaves', at: 'center', count: 18, up: 4, spread: 3 },
      ];
      return [
        { kind: 'pillar', at: 'center', color: WIND_HI },
        { kind: 'ring', at: 'center', size: 4, color: WIND_HI }, { kind: 'ring', at: 'center', size: 8, life: 600, color: WIND },
        { kind: 'ring', at: 'center', size: 12, life: 800, color: TEAL },
        { kind: 'burst', at: 'targets', color: WIND_HI }, { kind: 'sparks', at: 'targets', count: 16, color: WIND_HI },
        { kind: 'leaves', at: 'center', count: 30, up: 5, spread: 4 }, { kind: 'shake', amp: 0.38, ms: 320 },
      ];
    },
  },
};

// =====================================================================================================
// Bộ động tác dùng chung (mỗi kỹ năng ghép tham số riêng → không kỹ năng nào giống hệt kỹ năng nào)
// =====================================================================================================

type PoseFn = (t: ChoreoTime) => ChoreoPose;
type At = 'target' | 'targets' | 'self' | 'center';

const ELEM = {
  Verdant: { c: 0x8dffb0, hi: 0xe8fff0, deb: 'leaves' as DebrisStyle },
  Frost: { c: 0x9fe4ff, hi: 0xf2fdff, deb: 'shards' as DebrisStyle },
  Solar: { c: 0xffd36a, hi: 0xfff6d6, deb: 'glints' as DebrisStyle },
  Tide: { c: 0x5fd0ff, hi: 0xdaf6ff, deb: 'droplets' as DebrisStyle },
  Pyre: { c: 0xff7a3a, hi: 0xffe0a8, deb: 'embers' as DebrisStyle },
  Astral: { c: 0xc08cff, hi: 0xf3e6ff, deb: 'stars' as DebrisStyle },
};
type Elem = keyof typeof ELEM;

const F = {
  slash: (rot: number, scale: number, color: number, at: At = 'target', height?: number): ChoreoFx =>
    ({ kind: 'slash', at: at === 'center' ? 'targets' : at, rot, scale, color, height }),
  ring: (size: number, color: number, at: At = 'target', life?: number): ChoreoFx => ({ kind: 'ring', at, size, color, life }),
  sparks: (count: number, color: number, at: 'target' | 'targets' | 'self' = 'target'): ChoreoFx => ({ kind: 'sparks', at, count, color }),
  burst: (color: number, at: 'target' | 'targets' | 'self' = 'target', height?: number): ChoreoFx => ({ kind: 'burst', at, color, height }),
  debris: (style: DebrisStyle, count: number, at: At = 'target', up?: number, spread?: number): ChoreoFx => ({ kind: 'debris', at, style, count, up, spread }),
  motes: (count: number, color: number, rise = 2.5): ChoreoFx => ({ kind: 'motes', at: 'self', count, color, rise }),
  pillar: (color: number, at: 'target' | 'center' = 'target'): ChoreoFx => ({ kind: 'pillar', at, color }),
  shake: (amp: number, ms: number): ChoreoFx => ({ kind: 'shake', amp, ms }),
};

const P = {
  /** áp sát, mỗi nhịp một nhát, thân lắc xen kẽ */
  dash: (o: { lift?: number; tilt?: number; push?: number; spin?: number } = {}): PoseFn => ({ now, approach, beatT, dir }) => {
    const p = base();
    p.lift = Math.sin(approach * Math.PI) * (o.lift ?? 0.4) * (approach < 1 ? 1 : 0);
    p.tilt = dir * 0.18 * Math.sin(approach * Math.PI);
    if (o.spin && approach < 1) p.spin = approach * o.spin;
    beatT.forEach((bt, i) => {
      const k = near(now, bt, 120, 20);
      if (!k) return;
      p.tilt = dir * (o.tilt ?? 0.32) * (i % 2 ? -1 : 1) * k;
      p.push += (o.push ?? 0.32) * k;
      p.sx = Math.max(p.sx, 1 + 0.14 * k);
      p.sy = Math.min(p.sy, 1 - 0.08 * k);
    });
    return p;
  },
  /** đâm thẳng: thân duỗi dài, không lắc */
  thrust: (reach = 0.6): PoseFn => ({ now, approach, beatT, dir }) => {
    const p = base();
    p.lift = Math.sin(approach * Math.PI) * 0.25 * (approach < 1 ? 1 : 0);
    for (const bt of beatT) {
      const k = near(now, bt, 110, 30);
      if (!k) continue;
      p.push += reach * k; p.sx = Math.max(p.sx, 1 + 0.3 * k); p.sy = Math.min(p.sy, 1 - 0.1 * k); p.tilt = dir * 0.12 * k;
    }
    return p;
  },
  /** vũ khí nặng: giơ cao trước mỗi nhịp, bổ xuống nén người */
  heavy: (o: { lift?: number } = {}): PoseFn => ({ now, approach, beatT, dir }) => {
    const p = base();
    p.lift = Math.sin(approach * Math.PI) * (o.lift ?? 0.5) * (approach < 1 ? 1 : 0);
    for (const bt of beatT) {
      const pre = clamp01((now - (bt - 280)) / 220);
      if (pre > 0 && now < bt) { p.tilt = -dir * 0.32 * pre; p.sy = 1 + 0.1 * pre; p.lift += 0.25 * pre; }
      const k = near(now, bt, 120, -30);
      if (k) { p.tilt = dir * 0.45 * k; p.sy = 1 - 0.18 * k; p.sx = 1 + 0.22 * k; }
    }
    return p;
  },
  /** húc khiên: lao nặng nề không nhảy, xô mạnh ở nhịp */
  bash: (): PoseFn => ({ now, approach, beatT, dir }) => {
    const p = base();
    p.tilt = dir * 0.25 * Math.sin(approach * Math.PI);
    p.sx = 1 + 0.08 * Math.sin(approach * Math.PI);
    for (const bt of beatT) {
      const k = near(now, bt, 120, 20);
      if (k) { p.push += 0.7 * k; p.sx = 1 + 0.3 * k; p.sy = 1 - 0.18 * k; }
    }
    return p;
  },
  /** nhảy cao rồi lao xuống ở nhịp đầu ("first") hoặc nhịp cuối ("last"), chém trên không ở các nhịp giữa */
  leap: (height: number, at: 'first' | 'last' = 'first'): PoseFn => ({ now, beatT, dir }) => {
    const p = base();
    const T = at === 'first' ? beatT[0] : beatT[beatT.length - 1];
    const start = (at === 'first' ? T : beatT[0]) - 720;
    const rise = clamp01((now - start) / 420);
    const plunge = clamp01((now - (T - 170)) / 170);
    if (now < T) {
      p.lift = height * (1 - (1 - rise) ** 3) * (1 - plunge);
      p.tilt = plunge > 0 ? dir * 0.5 : -dir * 0.15 * rise;
      p.sy = rise > 0 && rise < 1 ? 1.12 : plunge > 0 ? 1.18 : 1;
      if (at === 'last') beatT.slice(0, -1).forEach((bt, i) => {
        const k = near(now, bt, 120, 20);
        if (k) p.tilt = dir * 0.5 * (i % 2 ? -1 : 1) * k;
      });
    }
    const k = near(now, T, 140, -50);
    if (now >= T && k) { p.sx = 1 + 0.3 * k; p.sy = 1 - 0.25 * k; }
    return p;
  },
  /** bắn tầm xa: lùi người kéo dây / tụ phép, giật lùi đúng lúc đạn rời tay (trước nhịp `flight` ms) */
  ranged: (o: { draw?: number; recoil?: number; flight?: number; hop?: number } = {}): PoseFn => ({ now, rel, beatT, dir }) => {
    const p = base();
    const charge = clamp01((rel + 700) / 450);
    p.sy = 1 + 0.06 * charge; p.tilt = -dir * (o.draw ?? 0.1) * charge; p.push = -0.18 * charge;
    if (o.hop) p.lift = o.hop * Math.sin(clamp01((rel + 700) / 500) * Math.PI);
    for (const bt of beatT) {
      const k = near(now, bt - (o.flight ?? 400), 110, -40);
      if (k) { p.push -= (o.recoil ?? 0.28) * k; p.sx = 1 + 0.1 * k; p.tilt = -dir * 0.2 * k; }
    }
    return p;
  },
  /** niệm phép tại chỗ: lơ lửng nhẹ, mỗi nhịp một nhịp đập */
  cast: (o: { float?: number } = {}): PoseFn => ({ now, rel, beatT, dir }) => {
    const p = base();
    const k0 = clamp01((rel + 700) / 500);
    p.sy = 1 + 0.06 * k0; p.lift = (o.float ?? 0.3) * k0 + Math.sin(now / 160) * 0.05 * k0;
    for (const bt of beatT) {
      const k = near(now, bt, 140, 40);
      if (k) { p.sx = 1 + 0.1 * k; p.lift += 0.2 * k; p.tilt = dir * 0.1 * k; }
    }
    return p;
  },
  /** xoay tròn tại chỗ suốt đòn */
  whirl: (turns: number, lift = 0.3): PoseFn => ({ now, rel, beatT }) => {
    const p = base();
    const span = beatT[beatT.length - 1] - beatT[0] + 600;
    const t = clamp01((rel + 300) / span);
    p.spin = t * turns;
    p.lift = Math.sin(t * Math.PI) * lift;
    return p;
  },
  /** biến mất rồi hiện ra sau lưng mục tiêu */
  vanish: (): PoseFn => ({ now, beatT, dir }) => {
    const p = base();
    const b0 = beatT[0];
    const fade = clamp01((now - (b0 - 320)) / 160);
    const back = clamp01((now - (b0 - 80)) / 80);
    if (now < b0 - 80) p.sx = Math.max(0.04, 1 - fade);
    else if (now < b0 + 40) { p.sx = Math.max(0.04, back); p.push = 0.9; }
    beatT.forEach((bt, i) => {
      const k = near(now, bt, 110, 20);
      if (k) { p.tilt = dir * 0.35 * (i % 2 ? -1 : 1) * k; p.push += 0.3 * k; }
    });
    return p;
  },
  /** Tụ Lực (chung): run người gồng sức rồi bung một đòn (cận chiến nhảy bổ / tầm xa bắn) */
  charge: (melee: boolean): PoseFn => ({ now, rel, beatT, dir }) => {
    const p = base();
    const b0 = beatT[0];
    const charge = clamp01((rel + 900) / 640);
    if (rel < -260) {
      p.sx = 1 + 0.18 * charge; p.sy = 1 - 0.16 * charge;
      p.tilt = Math.sin(now / 24) * 0.05 * charge - dir * 0.1 * charge;
      return p;
    }
    if (melee) {
      const k = clamp01((now - (b0 - 260)) / 260);
      if (k < 1) { p.lift = 2.2 * Math.sin(k * Math.PI * 0.85); p.tilt = dir * (k < 0.6 ? -0.25 : 0.55); p.sy = 1.15; }
    } else {
      const k = near(now, b0 - 400, 140, -40);
      p.push = -0.5 * k; p.tilt = -dir * 0.3 * k;
    }
    const slam = near(now, b0, 120, -30);
    if (slam && melee) { p.sy = 1 - 0.22 * slam; p.sx = 1 + 0.26 * slam; p.lift = 0; }
    return p;
  },
  /** Bộc Phát (chung): mỗi nhịp nhún người phát một sóng */
  surge: (): PoseFn => ({ now, beatT, dir }) => {
    const p = base();
    beatT.forEach((bt, i) => {
      const k = near(now, bt, 160, 60);
      if (!k) return;
      p.lift = Math.max(p.lift, 0.55 * k); p.push += 0.25 * k;
      p.sy = Math.max(p.sy, 1 + 0.1 * k); p.tilt = dir * 0.22 * (i % 2 ? -1 : 1) * k;
    });
    return p;
  },
};

/** Tụ Lực + Bộc Phát chung cho mọi anh hùng, đổi màu / mảnh vụn theo nguyên tố và kiểu vũ khí. */
function commonKit(heroId: string, el: Elem, melee: boolean): Record<string, SkillChoreo> {
  const E = ELEM[el];
  return {
    [`${heroId}_focus`]: {
      close: melee,
      pose: P.charge(melee),
      emit: ({ rel }) => (rel < -260 ? [F.motes(3, E.c, 3.2), F.debris(E.deb, 1, 'self', 2, 0.5)] : []),
      projectile: melee ? undefined : { color: E.hi, size: 0.95, arc: 0.4, flight: 400 },
      impact: () => [F.slash(-Math.PI / 2 + 0.15, 2.4, E.hi), F.ring(3, E.hi), F.ring(5.5, E.c, 'target', 520),
        F.sparks(22, E.hi), F.debris(E.deb, 16, 'target', 3.5), F.shake(0.3, 240)],
    },
    [`${heroId}_surge`]: {
      close: false,
      pose: P.surge(),
      emit: ({ rel }) => (rel > -400 ? [F.debris(E.deb, 2, 'self', 1.5, 1.6)] : []),
      impact: (i) => [F.ring(10, E.c, 'self', 360), F.burst(E.hi, 'targets'), F.debris(E.deb, 6, 'targets', 2),
        ...(i === 2 ? [F.shake(0.16, 140)] : [])],
    },
  };
}

// =====================================================================================================
// SE OK (lyra_frostbow) — Trường Cung Băng Tinh, Phá Thế hệ Băng. Vũ đạo làm tay, tỉ mỉ từng nhịp.
// =====================================================================================================
const ICE = 0x9fe4ff;
const ICE_HI = 0xf2fdff;
const ICE_DEEP = 0x5fb8ff;

const SE_OK: Record<string, SkillChoreo> = {
  // Tên Băng Xuyên Gió: đứng tấn, kéo căng dây, 2 mũi tên thẳng tắp — mỗi phát giật vai ra sau
  lyr_basic: {
    close: false,
    pose: P.ranged({ draw: 0.14, recoil: 0.3, flight: 300 }),
    projectile: { color: ICE_HI, size: 0.38, arc: 0.25, flight: 300 },
    emit: ({ rel }) => (rel > -500 && rel < 0 ? [F.motes(1, ICE, 1.4)] : []),
    impact: (i) => [F.burst(ICE_HI), F.debris('shards', 6), F.ring(i ? 1.6 : 1.1, ICE)],
  },
  // Tam Tinh Hàn Tiễn: bật lùi một bước giữa không trung, xả 3 mũi tên băng liên hoàn, mũi sau to hơn mũi trước
  lyr_triple_icicle: {
    close: false,
    pose: ({ now, rel, beatT, dir }) => {
      const p = base();
      const hop = clamp01((rel + 760) / 420);
      p.lift = Math.sin(hop * Math.PI) * 0.9;
      p.push = -0.7 * smooth(hop);
      p.tilt = -dir * 0.16 * Math.sin(hop * Math.PI);
      beatT.forEach((bt, i) => {
        const k = near(now, bt - 300, 100, -40);
        if (k) { p.push -= 0.25 * k; p.tilt = -dir * (0.18 + i * 0.06) * k; p.sx = 1 + 0.08 * k; }
      });
      if (rel > -340) p.lift = Math.max(p.lift, 0.35 * Math.sin(clamp01((rel + 340) / (beatT[2] - beatT[0] + 340)) * Math.PI));
      return p;
    },
    projectile: { color: ICE_HI, size: 0.45, arc: 0.35, flight: 300 },
    emit: ({ rel }) => (rel < -300 ? [F.debris('shards', 1, 'self', 0.6, 0.4)] : []),
    impact: (i, n) => i < n - 1
      ? [F.burst(ICE_HI), F.debris('shards', 7 + i * 3), F.slash(0.4 - i * 0.8, 0.8 + i * 0.2, ICE)]
      : [F.burst(ICE_HI), F.pillar(ICE), F.ring(2.6, ICE_HI), F.ring(4, ICE_DEEP, 'target', 520), F.debris('shards', 18, 'target', 3), F.shake(0.18, 160)],
  },
  // Mưa Tuyết Phủ Đỉnh: ngửa người bắn một mũi lên trời → mưa băng rơi khắp phe địch 2 đợt
  lyr_hail_volley: {
    close: false,
    pose: ({ now, rel, beatT, dir }) => {
      const p = base();
      const aim = clamp01((rel + 900) / 380);
      p.tilt = -dir * 0.42 * aim; p.sy = 1 + 0.1 * aim; p.push = -0.2 * aim;
      const shot = near(now, beatT[0] - 650, 120, -40);
      if (shot) { p.lift = 0.4 * shot; p.tilt = -dir * 0.6 * shot; }
      if (now > beatT[0] - 560) { p.tilt *= 0.4; p.sy = 1 + 0.04; }
      return p;
    },
    projectile: { color: ICE_HI, size: 0.5, arc: 0, flight: 520, sky: true, all: true },
    emit: ({ rel, now, beatT }) => (rel > -700 && now < beatT[beatT.length - 1] ? [F.debris('shards', 2, 'center', 0.2, 3.2)] : []),
    impact: (i) => [F.burst(ICE_HI, 'targets'), F.ring(1.8 + i, ICE, 'targets'), F.debris('shards', 8, 'targets', 2.2),
      ...(i === 1 ? [F.shake(0.16, 150)] : [])],
  },
  // Tuyệt Độ Không Gian Tiễn (tối thượng): vọt lên trời, thời gian như đông cứng, 2 mũi tên bắn xuống,
  // mũi thứ ba là "độ không tuyệt đối" — cột băng khổng lồ đóng băng mục tiêu, Se Ok đáp xuống nhẹ nhàng
  lyr_ult_zero_arrow: {
    close: false,
    pose: ({ now, rel, beatT, dir }) => {
      const p = base();
      const [b0, b1, b2] = beatT;
      if (rel < -620) {
        const k = smooth(clamp01((rel + 1100) / 480));
        p.sx = 1 + 0.16 * k; p.sy = 1 - 0.16 * k; p.tilt = Math.sin(now / 28) * 0.03 * k;
        return p;
      }
      const rise = clamp01((now - (b0 - 620)) / 380);
      p.lift = 3.4 * (1 - (1 - rise) ** 3) + Math.sin(now / 200) * 0.08 * rise;
      p.tilt = -dir * 0.22 * rise; // ngắm chúc xuống
      for (const bt of [b0, b1]) {
        const k = near(now, bt - 300, 100, -40);
        if (k) { p.tilt = -dir * 0.4 * k; p.sx = 1 + 0.1 * k; p.push -= 0.2 * k; }
      }
      const zero = near(now, b2 - 300, 160, -60);
      if (zero) { p.sx = 1 + 0.18 * zero; p.sy = 1 - 0.1 * zero; p.tilt = -dir * 0.55 * zero; }
      const land = clamp01((now - b2) / 380);
      if (land > 0) p.lift *= 1 - smooth(land);
      return p;
    },
    projectile: { color: ICE_HI, size: 0.6, arc: -0.6, flight: 300 },
    emit: ({ rel, now, beatT }) => {
      if (rel < -620) return [F.motes(3, ICE, 3.6), F.ring(2, ICE, 'self', 300)];
      if (now < beatT[2]) return [F.debris('shards', 2, 'self', 0.3, 1.2)];
      return [];
    },
    impact: (i, n) => i < n - 1
      ? [F.burst(ICE_HI), F.debris('shards', 10), F.ring(1.8, ICE), F.shake(0.12, 110)]
      : [F.pillar(ICE_HI), F.pillar(ICE_DEEP), F.ring(3, ICE_HI), F.ring(6, ICE, 'target', 640), F.ring(9, ICE_DEEP, 'target', 820),
        F.sparks(26, ICE_HI), F.debris('shards', 30, 'target', 4.5, 1.4), F.shake(0.36, 320)],
  },
  ...commonKit('lyra_frostbow', 'Frost', false),
};

// =====================================================================================================
// 10 anh hùng còn lại — mỗi kỹ năng một tổ hợp động tác + đạn + hiệu ứng riêng theo vũ khí và nguyên tố
// =====================================================================================================
const S = ELEM.Solar, Py = ELEM.Pyre, Ti = ELEM.Tide, As = ELEM.Astral, Fr = ELEM.Frost;

const OTHERS: Record<string, SkillChoreo> = {
  // ---------------- Karen (celine_prism) · Trượng Cọ Quang Phổ · Nhật Quang
  cel_basic: { close: false, pose: P.cast({ float: 0.2 }), projectile: { color: S.hi, size: 0.42, arc: 1.1, flight: 360 },
    impact: () => [F.burst(S.hi), F.debris('glints', 8), F.slash(0.9, 0.9, S.c)] },
  cel_sun_brand: { close: false, pose: P.cast({ float: 0.45 }),
    emit: ({ rel }) => (rel > -600 && rel < 300 ? [F.ring(1.4, S.c, 'target', 260), F.motes(1, S.c, 2)] : []),
    impact: (i) => [F.pillar(i ? S.hi : S.c), F.ring(2 + i, S.c), F.debris('glints', 10, 'target', 2.5), F.shake(0.1 + i * 0.06, 120)] },
  ...commonKit('celine_prism', 'Solar', false),

  // ---------------- Park (bastian_aegis) · Khiên Tháp Lò Rèn · Dung Nham
  bas_basic: { close: true, pose: P.bash(), impact: () => [F.burst(Py.hi), F.ring(1.8, Py.c), F.debris('embers', 8), F.shake(0.16, 130)] },
  bas_anvil_crush: { close: true, pose: P.leap(1.4, 'first'),
    emit: ({ approach }) => (approach > 0 && approach < 1 ? [F.debris('embers', 1, 'self', 1, 0.5)] : []),
    impact: (i) => [F.slash(-Math.PI / 2, 1.6 + i * 0.4, Py.hi), F.ring(2.4 + i * 1.2, Py.c), F.debris('embers', 12, 'target', 3), F.shake(0.18 + i * 0.08, 170)] },
  bas_ult_bastion: { close: false,
    pose: ({ now, beatT, dir }) => { // dậm khiên 3 lần, mỗi lần một sóng lửa lan về phía địch
      const p = base();
      beatT.forEach((bt) => {
        const up = clamp01((now - (bt - 300)) / 220);
        if (up > 0 && now < bt) { p.lift = Math.sin(up * Math.PI * 0.9) * 1.1; p.sy = 1.1; }
        const k = near(now, bt, 120, -30);
        if (k) { p.sy = 1 - 0.24 * k; p.sx = 1 + 0.28 * k; p.tilt = dir * 0.1 * k; }
      });
      return p;
    },
    emit: () => [F.debris('embers', 2, 'self', 2, 1.4)],
    impact: (i, n) => [F.ring(6 + i * 3, Py.c, 'self', 420), F.burst(Py.hi, 'targets'), F.debris('embers', 8, 'targets', 3),
      ...(i === n - 1 ? [F.pillar(Py.hi, 'center'), F.ring(5, Py.hi, 'center'), F.shake(0.34, 300)] : [F.shake(0.18, 140)])] },
  ...commonKit('bastian_aegis', 'Pyre', true),

  // ---------------- Kai (kestrel_dune) · Song Đao Trăng Khuyết · Nhật Quang
  kes_basic: { close: true, pose: P.dash({ lift: 0.25, tilt: 0.4, push: 0.4 }),
    impact: (i) => [F.slash(i ? -0.6 : 0.6, 0.9, S.c), F.slash(i ? -0.2 : 0.2, 0.7, S.hi), F.debris('glints', 5)] },
  kes_sand_flurry: { close: true, pose: P.dash({ lift: 0.45, tilt: 0.55, push: 0.55, spin: 2 }),
    emit: () => [F.debris('glints', 1, 'self', 0.8, 1)],
    impact: (i, n) => [F.slash([0.3, -0.9, 1.2, -1.6][i % 4], 1 + i * 0.12, i === n - 1 ? S.hi : S.c),
      F.debris('glints', 6), ...(i === n - 1 ? [F.ring(2.6, S.hi), F.shake(0.2, 150)] : [])] },
  kes_ult_golden_fang: { close: true,
    pose: ({ now, approach, beatT, dir }) => { // lướt zigzag xuyên đội hình địch, mỗi nhịp một nanh vàng
      const p = base();
      p.lift = Math.sin(approach * Math.PI) * 0.6 * (approach < 1 ? 1 : 0);
      p.spin = approach < 1 ? approach * 2 : 0;
      beatT.forEach((bt, i) => {
        const k = near(now, bt, 150, 30);
        if (k) { p.push += (i % 2 ? -1.2 : 1.4) * k; p.tilt = dir * 0.6 * (i % 2 ? -1 : 1) * k; p.sx = 1 + 0.3 * k; p.lift = 0.4 * k; }
      });
      return p;
    },
    emit: () => [F.debris('glints', 2, 'self', 1, 1.4)],
    impact: (i, n) => [F.slash(i % 2 ? -0.8 : 0.8, 1.8, S.hi, 'targets'), F.debris('glints', 6, 'targets'),
      ...(i === n - 1 ? [F.ring(8, S.c, 'center', 600), F.burst(S.hi, 'targets'), F.shake(0.3, 260)] : [F.shake(0.12, 100)])] },
  ...commonKit('kestrel_dune', 'Solar', true),

  // ---------------- Nerio (nereus_tide) · Đàn Hạc San Hô · Thủy Triều
  ner_basic: { close: false, pose: P.cast({ float: 0.25 }), projectile: { color: Ti.hi, size: 0.4, arc: 1.4, flight: 420 },
    impact: () => [F.burst(Ti.hi), F.debris('droplets', 8), F.ring(1.3, Ti.c)] },
  ner_riptide_chord: { close: false, pose: P.cast({ float: 0.35 }),
    emit: () => [F.ring(1.5, Ti.c, 'self', 300)],
    impact: (i) => [F.ring(9 + i * 2, Ti.c, 'self', 420), F.debris('droplets', 8, 'targets', 2.4), F.burst(Ti.hi, 'targets'), F.shake(0.12, 120)] },
  ...commonKit('nereus_tide', 'Tide', false),

  // ---------------- Corvin (corvus_night) · Lưỡi Hái Nguyệt Ảnh · Tinh Tú
  cor_basic: { close: true, pose: P.heavy({ lift: 0.35 }),
    impact: (i) => [F.slash(i ? 2.6 : 0.5, 1.4, As.c), F.debris('stars', 6)] },
  cor_umbra_mark: { close: true, pose: P.vanish(),
    impact: (i) => [F.slash(i ? -1 : 1, 1.3, As.hi), F.ring(1.6 + i, As.c), F.debris('stars', 8), ...(i ? [F.pillar(As.c)] : [])] },
  cor_reaper_arc: { close: false, pose: P.whirl(3, 0.4),
    emit: () => [F.debris('stars', 1, 'self', 0.6, 1.6)],
    impact: (i) => [F.slash(i * 2.1, 1.7, As.c, 'targets'), F.ring(7, As.c, 'self', 360), F.debris('stars', 6, 'targets'), F.shake(0.12, 110)] },
  cor_ult_abyss_Bell: { close: false,
    pose: ({ now, rel, beatT, dir }) => { // bay lên, mỗi nhịp một hồi chuông — hồi cuối nện cả quả chuông bóng tối
      const p = base();
      const rise = clamp01((rel + 700) / 500);
      p.lift = 2.2 * smooth(rise) + Math.sin(now / 180) * 0.1 * rise;
      beatT.forEach((bt, i) => {
        const k = near(now, bt, 130, 40);
        if (k) { p.tilt = dir * 0.4 * (i % 2 ? -1 : 1) * k; p.sx = 1 + 0.16 * k; }
      });
      const fall = clamp01((now - beatT[beatT.length - 1]) / 360);
      if (fall > 0) p.lift *= 1 - smooth(fall);
      return p;
    },
    emit: () => [F.motes(2, As.c, 3), F.debris('stars', 1, 'center', 0.4, 3)],
    impact: (i, n) => i < n - 1
      ? [F.ring(2 + i, As.c), F.burst(As.hi), F.debris('stars', 8), F.shake(0.12, 110)]
      : [F.pillar(As.hi), F.pillar(As.c), F.ring(4, As.hi), F.ring(8, As.c, 'target', 700), F.sparks(24, As.hi), F.debris('stars', 24, 'target', 4), F.shake(0.36, 320)] },
  ...commonKit('corvus_night', 'Astral', true),

  // ---------------- Rhea (ignis_valkyrie) · Trường Thương Dung Nham · Dung Nham
  ign_basic: { close: true, pose: P.thrust(0.7),
    impact: () => [F.slash(0, 1.1, Py.hi), F.debris('embers', 7), F.burst(Py.c)] },
  ign_magma_dive: { close: true, pose: P.leap(2.6, 'first'),
    emit: ({ rel }) => (rel > -700 ? [F.debris('embers', 2, 'self', -0.5, 0.6)] : []),
    impact: (i) => i === 0
      ? [F.slash(-Math.PI / 2, 1.8, Py.hi), F.ring(3, Py.c), F.shake(0.22, 170)]
      : [F.pillar(Py.c), F.ring(5, Py.hi, 'target', 520), F.debris('embers', 18, 'target', 4), F.shake(0.18, 140)] },
  ign_cinder_sweep: { close: false, pose: P.whirl(2, 0.25),
    impact: (i) => [F.slash(i ? -2.4 : 0.6, 1.9, Py.c, 'targets'), F.ring(8, Py.c, 'self', 380), F.debris('embers', 8, 'targets', 2)] },
  ign_ult_valkyrie_star: { close: false, pose: P.leap(3.6, 'last'),
    projectile: { color: Py.hi, size: 0.7, arc: 0, flight: 380, sky: true, all: true },
    emit: () => [F.debris('embers', 2, 'self', -0.4, 1)],
    impact: (i, n) => i < n - 1
      ? [F.burst(Py.hi, 'targets'), F.ring(2, Py.c, 'targets'), F.debris('embers', 6, 'targets', 2.5), F.shake(0.12, 100)]
      : [F.pillar(Py.hi, 'center'), F.ring(4, Py.hi, 'center'), F.ring(9, Py.c, 'center', 700), F.debris('embers', 26, 'center', 5, 3), F.shake(0.38, 320)] },
  ...commonKit('ignis_valkyrie', 'Pyre', true),

  // ---------------- Mara (marina_abyss) · Roi Nước Xoáy Sâu · Thủy Triều
  mar_basic: { close: true, pose: P.dash({ lift: 0.2, tilt: 0.5, push: 0.15 }),
    impact: (i) => [F.slash(i ? 2.8 : 0.2, 1.5, Ti.c), F.debris('droplets', 8)] },
  mar_vortex_bind: { close: false, pose: P.cast({ float: 0.2 }),
    emit: ({ rel }) => (rel > -500 ? [F.ring(2.6, Ti.c, 'target', 300)] : []),
    impact: (i) => [F.ring(3.2 - i * 0.8, Ti.hi), F.debris('droplets', 8, 'target', 1.5), F.burst(Ti.c), ...(i === 2 ? [F.shake(0.16, 140)] : [])] },
  mar_abyss_geyser: { close: false, pose: P.cast({ float: 0.15 }),
    impact: (i) => [F.pillar(i ? Ti.hi : Ti.c, 'target'), F.debris('droplets', 14, 'targets', 5, 0.8), F.ring(2.4, Ti.c, 'targets'), F.shake(0.16, 140)] },
  mar_ult_maelstrom: { close: false, pose: P.whirl(4, 0.6),
    emit: () => [F.debris('droplets', 2, 'center', 2, 3), F.ring(3, Ti.c, 'center', 300)],
    impact: (i, n) => i < n - 1
      ? [F.ring(5 + i * 2, Ti.c, 'center', 500), F.burst(Ti.hi, 'targets'), F.debris('droplets', 8, 'targets', 3), F.shake(0.14, 120)]
      : [F.pillar(Ti.hi, 'center'), F.ring(12, Ti.c, 'center', 800), F.debris('droplets', 30, 'center', 5, 3), F.shake(0.36, 320)] },
  ...commonKit('marina_abyss', 'Tide', true),

  // ---------------- Aurelia (aurelia_eclipse) · Đại Kiếm Khải Huyền · Nhật Quang
  aur_basic: { close: true, pose: P.heavy({ lift: 0.6 }),
    impact: (i) => [F.slash(i ? -0.3 : 0.3, 1.6, S.hi), F.ring(2, S.c), F.debris('glints', 8), F.shake(0.16, 130)] },
  aur_solar_cleave: { close: true, pose: P.leap(1.6, 'last'),
    impact: (i, n) => [F.slash([0.5, -0.5, -Math.PI / 2][i] ?? 0, 1.5 + i * 0.4, S.hi),
      ...(i === n - 1 ? [F.pillar(S.hi), F.ring(4, S.c), F.shake(0.26, 220)] : [F.debris('glints', 8)])] },
  aur_eclipse_nova: { close: false, pose: P.cast({ float: 1 }),
    emit: () => [F.motes(2, S.c, 2.5)],
    impact: (i) => [F.ring(8 + i * 2, S.c, 'self', 460), F.burst(S.hi, 'targets'), F.debris('glints', 8, 'targets', 2), F.shake(0.14, 120)] },
  aur_ult_judgement: { close: false, pose: P.cast({ float: 1.6 }),
    projectile: { color: S.hi, size: 1, arc: 0, flight: 420, sky: true, all: true },
    emit: () => [F.motes(3, S.c, 3.5)],
    impact: (i, n) => i < n - 1
      ? [F.burst(S.hi, 'targets'), F.ring(2.4, S.c, 'targets'), F.debris('glints', 8, 'targets', 3), F.shake(0.14, 120)]
      : [F.pillar(S.hi, 'center'), F.pillar(S.c, 'center'), F.ring(5, S.hi, 'center'), F.ring(11, S.c, 'center', 800),
        F.sparks(24, S.hi, 'targets'), F.debris('glints', 30, 'center', 5, 3), F.shake(0.4, 340)] },
  ...commonKit('aurelia_eclipse', 'Solar', true),

  // ---------------- Soren (seraph_glacier) · Thánh Kiếm Vĩnh Băng · Hàn Băng
  ser_basic: { close: true, pose: P.dash({ lift: 0.3, tilt: 0.3, push: 0.35 }),
    impact: (i) => [F.slash(i ? -0.4 : 0.9, 1.2, Fr.hi), F.debris('shards', 7)] },
  ser_shatter_lance: { close: false, pose: P.ranged({ draw: 0.25, recoil: 0.45, flight: 380 }),
    projectile: { color: Fr.hi, size: 0.75, arc: 0.5, flight: 380 },
    impact: (i, n) => [F.burst(Fr.hi), F.debris('shards', 10 + i * 4), ...(i === n - 1 ? [F.pillar(Fr.hi), F.ring(3.6, Fr.c), F.shake(0.22, 180)] : [F.ring(1.6, Fr.c)])] },
  ser_ult_eternal_winter: { close: false, pose: P.cast({ float: 0.9 }),
    emit: () => [F.debris('shards', 2, 'center', 0.2, 4), F.ring(2.4, Fr.c, 'self', 320)],
    impact: (i, n) => i < n - 1
      ? [F.pillar(Fr.c, 'target'), F.ring(4 + i * 3, Fr.c, 'center', 600), F.debris('shards', 8, 'targets', 3), F.shake(0.14, 120)]
      : [F.pillar(Fr.hi, 'center'), F.ring(12, Fr.hi, 'center', 900), F.burst(Fr.hi, 'targets'), F.debris('shards', 30, 'center', 5, 3), F.shake(0.38, 320)] },
  ...commonKit('seraph_glacier', 'Frost', true),

  // ---------------- Luma (lumina_chrono) · Tinh Cầu Cực Quang · Tinh Tú
  lum_basic: { close: false, pose: P.cast({ float: 0.4 }), projectile: { color: As.hi, size: 0.45, arc: 0.9, flight: 380 },
    impact: () => [F.burst(As.hi), F.debris('stars', 8), F.ring(1.4, As.c)] },
  lum_starfall_prism: { close: false, pose: P.cast({ float: 0.8 }),
    projectile: { color: As.hi, size: 0.6, arc: 0, flight: 460, sky: true, all: true },
    emit: () => [F.debris('stars', 2, 'center', 0.3, 3.4)],
    impact: (i, n) => [F.burst(As.hi, 'targets'), F.ring(2 + i * 0.6, As.c, 'targets'), F.debris('stars', 8, 'targets', 2.5),
      ...(i === n - 1 ? [F.shake(0.2, 180)] : [])] },
  ...commonKit('lumina_chrono', 'Astral', false),
};

// =====================================================================================================
// Jung (jung_afterglow) · SSS · Hanbit Katana + cước Taekwondo · cam rạng đông
// =====================================================================================================
const JG = { c: 0xff9a2e, hi: 0xfff0c0, ember: 0xff6a1a, gold: 0xffd76a };

/** Rút kiếm iai (nhịp 1) → xoay gót đá móc (nhịp 2) → bổ gót từ trên xuống (nhịp 3). */
const jungDrawKick: PoseFn = ({ now, approach, beatT, dir }) => {
  const p = base();
  p.lift = Math.sin(approach * Math.PI) * 0.3 * (approach < 1 ? 1 : 0);
  p.tilt = -dir * 0.22 * Math.sin(approach * Math.PI); // cúi thấp lướt tới, tay đặt chuôi kiếm
  const [b0, b1, b2] = beatT;
  const draw = near(now, b0, 110, 30);
  if (draw) { p.push += 0.75 * draw; p.sx = 1 + 0.34 * draw; p.sy = 1 - 0.14 * draw; p.tilt = dir * 0.2 * draw; }
  if (b1 !== undefined) {
    const t = clamp01((now - (b1 - 220)) / 340);
    if (t > 0 && t < 1) { p.spin = t; p.lift = Math.max(p.lift, 0.55 * Math.sin(t * Math.PI)); p.push += 0.25; }
  }
  if (b2 !== undefined) {
    const rise = clamp01((now - (b2 - 360)) / 240);
    if (now < b2 && rise > 0) { p.lift = Math.max(p.lift, 1.25 * Math.sin(rise * Math.PI * 0.5)); p.tilt = -dir * 0.3 * rise; p.sy = 1.12; }
    const slam = near(now, b2, 120, -30);
    if (slam && now >= b2) { p.lift = 0; p.sy = 1 - 0.24 * slam; p.sx = 1 + 0.3 * slam; p.tilt = dir * 0.4 * slam; }
  }
  return p;
};

/** Tàn ảnh: chớp biến mất / hiện ra zig-zag qua lại mục tiêu, mỗi nhịp một vệt chém. */
const jungAfterimage: PoseFn = ({ now, approach, beatT, dir }) => {
  const p = base();
  p.lift = Math.sin(approach * Math.PI) * 0.2 * (approach < 1 ? 1 : 0);
  beatT.forEach((bt, i) => {
    const blink = near(now, bt - 70, 60);
    if (blink) p.sx = Math.max(0.05, 1 - blink * 0.95); // chớp mất
    const k = near(now, bt, 100, 10);
    if (!k) return;
    const side = i % 2 ? -1 : 1;
    p.push += (0.55 + 0.25 * side) * k;
    p.tilt = dir * 0.5 * side * k;
    p.lift = Math.max(p.lift, (i === beatT.length - 1 ? 0.6 : 0.15) * k);
    p.sx = Math.max(p.sx, 1 + 0.25 * k); p.sy = Math.min(p.sy, 1 - 0.1 * k);
  });
  return p;
};

/** Seoul Daybreak: vọt lên trời (vừa bay vừa chém 5 nhát) → bổ gót sấm rền xuống ở nhịp cuối. */
const jungDaybreak: PoseFn = ({ now, rel, beatT, dir }) => {
  const p = base();
  const last = beatT[beatT.length - 1];
  const crouch = clamp01((rel + 760) / 300);
  const rise = clamp01((rel + 460) / 380);
  const plunge = clamp01((now - (last - 200)) / 200);
  if (rel < -460) { p.sx = 1 + 0.16 * crouch; p.sy = 1 - 0.2 * crouch; p.tilt = Math.sin(now / 22) * 0.04 * crouch; return p; }
  if (now < last) {
    p.lift = 3.4 * (1 - (1 - rise) ** 3) * (1 - plunge) + Math.sin(now / 140) * 0.08;
    p.sy = plunge > 0 ? 1.25 : 1.05;
    p.tilt = plunge > 0 ? dir * 0.6 : 0;
    beatT.slice(0, -1).forEach((bt, i) => {
      const k = near(now, bt, 110, 10);
      if (k) { p.tilt = dir * 0.55 * (i % 2 ? -1 : 1) * k; p.spin = (i % 2 ? -0.12 : 0.12) * k; p.sx = 1 + 0.2 * k; }
    });
  }
  const k = near(now, last, 160, -60);
  if (now >= last && k) { p.sx = 1 + 0.4 * k; p.sy = 1 - 0.3 * k; }
  return p;
};

const JUNG: Record<string, SkillChoreo> = {
  jung_basic: { close: true, pose: jungDrawKick,
    emit: ({ approach }) => (approach > 0 && approach < 1 ? [F.motes(1, JG.c, 0.6)] : []),
    impact: (i) => [
      [F.slash(0.05, 1.9, JG.hi), F.slash(0.05, 1.5, JG.c), F.sparks(10, JG.hi), F.shake(0.1, 90)],
      [F.slash(2.6, 1.6, JG.c), F.ring(2.2, JG.c), F.debris('embers', 8)],
      [F.slash(-Math.PI / 2, 1.8, JG.hi), F.ring(3, JG.gold), F.burst(JG.c), F.debris('glints', 10, 'target', 2.5), F.shake(0.2, 160)],
    ][i % 3] },
  jung_afterimage: { close: true, pose: jungAfterimage,
    emit: () => [F.motes(2, JG.c, 0.4), F.debris('embers', 1, 'self', 0.3, 0.8)],
    impact: (i, n) => i < n - 1
      ? [F.slash(i % 2 ? 2.4 : 0.75, 1.6, i % 2 ? JG.c : JG.hi), F.sparks(8, JG.gold), F.debris('embers', 6)]
      : [F.slash(0.75, 2.3, JG.hi), F.slash(2.4, 2.3, JG.c), F.ring(3.2, JG.c), F.burst(JG.hi), F.sparks(20, JG.gold), F.shake(0.26, 200)] },
  jung_neon_cyclone: { close: false, pose: P.whirl(3, 1.5),
    emit: () => [F.ring(2.2, JG.c, 'self', 260), F.debris('embers', 2, 'self', 1.2, 1.4)],
    impact: (i) => [F.slash(i * 2.1, 2.2, i === 2 ? JG.hi : JG.c, 'targets'), F.ring(7 + i * 2, JG.c, 'self', 420),
      F.burst(JG.gold, 'targets'), F.debris('embers', 8, 'targets', 2), F.shake(0.12 + i * 0.05, 120)] },
  jung_ult_daybreak: { close: false, pose: jungDaybreak,
    emit: ({ rel }) => (rel < -460
      ? [F.motes(4, JG.gold, 3.6), F.ring(2.4, JG.c, 'self', 300)]
      : [F.debris('embers', 2, 'center', 0.4, 4), F.motes(2, JG.hi, 2)]),
    impact: (i, n) => i < n - 1
      ? [F.slash(i * 1.05 + 0.4, 2.6, i % 2 ? JG.c : JG.hi, 'targets'), F.burst(JG.gold, 'targets'), F.sparks(10, JG.hi, 'targets'), F.shake(0.12, 100)]
      : [F.pillar(JG.hi, 'center'), F.pillar(JG.c, 'center'), F.ring(5, JG.hi, 'center'), F.ring(13, JG.c, 'center', 900),
        F.slash(-Math.PI / 2, 3.4, JG.hi, 'targets'), F.sparks(30, JG.gold, 'targets'), F.debris('embers', 34, 'center', 6, 3.2),
        F.debris('glints', 20, 'center', 5, 3), F.shake(0.5, 420)] },
  ...commonKit('jung_afterglow', 'Solar', true),
};

export const HERO_CHOREO: Record<string, SkillChoreo> = { ...MIRAN, ...SE_OK, ...OTHERS, ...JUNG };

/** Hiệu ứng kỹ năng hỗ trợ (không có nhịp đánh): vòng ấn, hạt sáng, cột sáng trên đồng đội. */
function supportFx(el: Elem, big = false): ChoreoFx[] {
  const E = ELEM[el];
  return [
    F.ring(big ? 3 : 1.8, E.c, 'targets', big ? 900 : 700),
    ...(big ? [F.ring(9, E.hi, 'center', 900), F.pillar(E.hi, 'target')] : []),
    F.motes(big ? 16 : 10, E.c, 3),
    F.debris(E.deb, big ? 12 : 6, 'targets', 2.5, 0.6),
  ];
}

const HERO_ELEMENT: Record<string, Elem> = {
  gustave_blade: 'Verdant', celine_prism: 'Solar', bastian_aegis: 'Pyre', lyra_frostbow: 'Frost', kestrel_dune: 'Solar',
  nereus_tide: 'Tide', corvus_night: 'Astral', ignis_valkyrie: 'Pyre', marina_abyss: 'Tide', aurelia_eclipse: 'Solar',
  seraph_glacier: 'Frost', lumina_chrono: 'Astral', jung_afterglow: 'Solar',
};
const BIG_SUPPORT = new Set(['cel_ult_aurora_canvas', 'ner_ult_leviathan_hymn', 'lum_ult_symphony', 'ser_glacier_crown', 'bas_bulwark']);

/** Hiệu ứng khi anh hùng `heroId` tung kỹ năng hỗ trợ `skillId`. */
export function supportCastFx(heroId: string, skillId?: string): ChoreoFx[] {
  return supportFx(HERO_ELEMENT[heroId] ?? 'Verdant', Boolean(skillId && BIG_SUPPORT.has(skillId)));
}

/** (giữ tương thích) hiệu ứng hỗ trợ của Miran */
export const SUPPORT_CAST_FX: ChoreoFx[] = supportFx('Verdant');
