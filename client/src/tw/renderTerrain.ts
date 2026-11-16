/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms)
 * Bộ dựng Địa hình Chiến trường 2.5D, Đường Hành Quân Chiến Xa, Đài Hiệu Lệnh & Tán Rừng Thông Phương Bắc.
 *
 * Phụ trách:
 * 1. `renderTwTerrain`: mặt đất cỏ thu Bình Nguyên / sương giá Xích Bích lát gạch không gian thế giới,
 *    vết bánh xe chiến xa nối doanh trại & điểm chiến lược, 4 loại vùng địa hình elip xoay (`mud`, `river`,
 *    `forest`, `ridge`) với vách đá cheo leo Đông Nam – viền nắng Tây Bắc – đường đồng mức – tảng đá rải rác,
 *    cùng Đài Hiệu Lệnh / Vọng Lâu và vòng chiếm điểm phát sáng theo Liên Minh (`ownerTeam`, `progress`).
 * 2. `renderTwForestCanopy`: rừng 120–180 cây Thông Phương Bắc (`pine_tree_1..4.png`) hoặc Khóm Trúc
 *    (`bamboo_clump.png` tại Trường Bản) trong vùng `forest` và dọc biên Tây Bắc, sắp xếp chiều sâu theo `y`,
 *    đung đưa nhẹ trong gió thu và tự động bán trong suốt (`globalAlpha = 0.52`) ở giữa màn hình khi phóng gần.
 */

import {
  TW_TEAM_COLORS,
  twPointInTerrainZone,
  type TwCapturePointSpec,
  type TwCaptureState,
  type TwFireZoneFrame,
  type TwMapId,
  type TwMapSpec,
  type TwTerrainZone,
} from '../../../shared/src/tw';
import { TW_ISO_TILT, worldToScreen, type TwCamera } from './camera';
import { getTwStructureImg, getTwTerrainImg, isImgReady, loadTwImage } from './sprites';

/** Tùy chọn mở rộng cho mặt đất chiến trường (hỏa công, hướng gió) — hoàn toàn tùy chọn */
export interface TwTerrainRenderExtra {
  fires?: ReadonlyArray<TwFireZoneFrame> | null;
  windAngle?: number;
  windStrength?: number;
}

const getTwImage = loadTwImage;

// ============================================================================
// 1. CẤU HÌNH BẢNG MÀU KHÍ QUYỂN THEO CHIẾN TRƯỜNG
// ============================================================================

interface MapThemePalette {
  abyssBg: string;
  fallbackGrass: string;
  baseTexture: string;
  frostOverlayAlpha: number;
  meadowWarmColor: string;
  meadowCoolColor: string;
  roadShoulder: string;
  roadCore: string;
  roadRut: string;
  sunTintNW: string;
  vignetteEdge: string;
  borderLine: string;
}

const MAP_THEMES: Record<TwMapId, MapThemePalette> = {
  pingyuan: {
    abyssBg: '#1b2017',
    fallbackGrass: '#54603e',
    baseTexture: 'pingyuan_grass.jpg',
    frostOverlayAlpha: 0,
    meadowWarmColor: 'rgba(186, 158, 88, 0.18)',
    meadowCoolColor: 'rgba(46, 66, 38, 0.16)',
    roadShoulder: 'rgba(128, 108, 74, 0.34)',
    roadCore: 'rgba(148, 126, 88, 0.42)',
    roadRut: 'rgba(66, 53, 34, 0.40)',
    sunTintNW: 'rgba(255, 226, 168, 0.10)',
    vignetteEdge: 'rgba(14, 17, 12, 0.44)',
    borderLine: 'rgba(218, 190, 130, 0.34)',
  },
  guandu: {
    abyssBg: '#1d1f17',
    fallbackGrass: '#58603f',
    baseTexture: 'pingyuan_grass.jpg',
    frostOverlayAlpha: 0.05,
    meadowWarmColor: 'rgba(194, 156, 84, 0.22)',
    meadowCoolColor: 'rgba(58, 64, 38, 0.16)',
    roadShoulder: 'rgba(136, 112, 74, 0.38)',
    roadCore: 'rgba(156, 130, 88, 0.45)',
    roadRut: 'rgba(70, 54, 34, 0.42)',
    sunTintNW: 'rgba(255, 214, 150, 0.11)',
    vignetteEdge: 'rgba(18, 16, 12, 0.46)',
    borderLine: 'rgba(222, 188, 124, 0.34)',
  },
  changban: {
    abyssBg: '#162119',
    fallbackGrass: '#465c3b',
    baseTexture: 'pingyuan_grass.jpg',
    frostOverlayAlpha: 0.08,
    meadowWarmColor: 'rgba(146, 162, 86, 0.15)',
    meadowCoolColor: 'rgba(32, 68, 46, 0.22)',
    roadShoulder: 'rgba(118, 102, 72, 0.36)',
    roadCore: 'rgba(138, 118, 84, 0.44)',
    roadRut: 'rgba(58, 48, 32, 0.42)',
    sunTintNW: 'rgba(212, 238, 214, 0.09)',
    vignetteEdge: 'rgba(10, 18, 14, 0.45)',
    borderLine: 'rgba(196, 206, 152, 0.32)',
  },
  chibi: {
    abyssBg: '#161d22',
    fallbackGrass: '#5d665c',
    baseTexture: 'pingyuan_grass.jpg',
    frostOverlayAlpha: 0.54,
    meadowWarmColor: 'rgba(198, 134, 82, 0.14)',
    meadowCoolColor: 'rgba(182, 204, 216, 0.20)',
    roadShoulder: 'rgba(116, 108, 94, 0.34)',
    roadCore: 'rgba(132, 122, 106, 0.40)',
    roadRut: 'rgba(56, 52, 46, 0.40)',
    sunTintNW: 'rgba(202, 222, 240, 0.10)',
    vignetteEdge: 'rgba(10, 15, 20, 0.48)',
    borderLine: 'rgba(196, 210, 224, 0.32)',
  },
};

const PINE_SPRITE_NAMES = [
  'pine_tree_1.png',
  'pine_tree_2.png',
  'pine_tree_3.png',
  'pine_tree_4.png',
] as const;

const BOULDER_SPRITE_NAMES = ['boulder_1.png', 'boulder_2.png'] as const;

/** Cache CanvasPattern theo HTMLImageElement để không cấp phát lại mỗi khung hình */
const patternCache = new WeakMap<HTMLImageElement, CanvasPattern>();

function getCachedPattern(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
): CanvasPattern | null {
  if (!isImgReady(img)) return null;
  let pat = patternCache.get(img);
  if (!pat) {
    const created = ctx.createPattern(img, 'repeat');
    if (!created) return null;
    pat = created;
    patternCache.set(img, pat);
  }
  return pat;
}

// ============================================================================
// 2. BỘ SINH SỐ GIẢ NGẪU NHIÊN TẤT ĐỊNH & CACHE ĐỊA VẬT BẢN ĐỒ
// ============================================================================

function hashMapSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GroundPatch {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  warm: boolean;
}

interface RoadPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

interface RoadPath {
  pts: RoadPoint[];
  widthMul: number;
}

interface RidgeBoulder {
  wx: number;
  wy: number;
  sprite: (typeof BOULDER_SPRITE_NAMES)[number];
  scale: number;
  flipX: boolean;
}

interface CampProp {
  wx: number;
  wy: number;
  sprite: 'war_tent.png' | 'palisade_wall.png';
  scale: number;
  flipX: boolean;
}

export interface CanopyTreeInstance {
  wx: number;
  wy: number;
  sprite: string;
  scale: number;
  flipX: boolean;
  windPhase: number;
  windAmp: number;
  shadeTint: number;
}

interface RiverRippleSeed {
  u: number;
  v: number;
  len: number;
  phase: number;
  speed: number;
}

interface CachedMapDecor {
  key: string;
  patches: GroundPatch[];
  roads: RoadPath[];
  boulders: RidgeBoulder[];
  campProps: CampProp[];
  trees: CanopyTreeInstance[];
  ripplesByZone: Map<string, RiverRippleSeed[]>;
}

const mapDecorCache = new Map<string, CachedMapDecor>();

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function sampleCubicRoad(
  x0: number,
  y0: number,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  x1: number,
  y1: number,
  steps: number,
  widthMul: number,
): RoadPath {
  const raw: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    const b0 = inv * inv * inv;
    const b1 = 3 * inv * inv * t;
    const b2 = 3 * inv * t * t;
    const b3 = t * t * t;
    raw.push({
      x: b0 * x0 + b1 * cx1 + b2 * cx2 + b3 * x1,
      y: b0 * y0 + b1 * cy1 + b2 * cy2 + b3 * y1,
    });
  }

  const pts: RoadPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(raw.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    pts.push({
      x: raw[i].x,
      y: raw[i].y,
      nx: -dy / len,
      ny: dx / len,
    });
  }
  return { pts, widthMul };
}

function isInZoneKind(map: TwMapSpec, x: number, y: number, kind: TwTerrainZone['kind']): boolean {
  for (let i = 0; i < map.terrainZones.length; i++) {
    const z = map.terrainZones[i];
    if (z.kind === kind && twPointInTerrainZone(x, y, z)) {
      return true;
    }
  }
  return false;
}

function isNearCaptureCenter(map: TwMapSpec, x: number, y: number, minDist: number): boolean {
  const minSq = minDist * minDist;
  for (let i = 0; i < map.capturePoints.length; i++) {
    const cp = map.capturePoints[i];
    const dx = x - cp.x;
    const dy = y - cp.y;
    if (dx * dx + dy * dy < minSq) return true;
  }
  return false;
}

function buildMapDecor(map: TwMapSpec): CachedMapDecor {
  const cacheKey = `${map.id}:${map.width}x${map.height}`;
  const existing = mapDecorCache.get(cacheKey);
  if (existing) return existing;

  const rng = createMulberry32(hashMapSeed(cacheKey));
  const w = map.width;
  const h = map.height;

  // 1. Mảng cỏ thu vàng & trũng ẩm tự nhiên phá tính lặp của gạch nền
  const patches: GroundPatch[] = [];
  for (let i = 0; i < 30; i++) {
    patches.push({
      x: 120 + rng() * (w - 240),
      y: 100 + rng() * (h - 200),
      rx: 180 + rng() * 290,
      ry: 120 + rng() * 210,
      rot: (rng() - 0.5) * Math.PI,
      warm: rng() > 0.42,
    });
  }

  // 2. Đường mòn hành quân & vết bánh chiến xa nối doanh trại Khai Chiến và Đài Hiệu Lệnh
  const roads: RoadPath[] = [];
  const swSpawnX = w * 0.19;
  const swSpawnY = h * 0.67;
  const neSpawnX = w * 0.81;
  const neSpawnY = h * 0.33;
  const centerCp: TwCapturePointSpec | undefined = map.capturePoints[0];
  const midX = centerCp ? centerCp.x : w * 0.5;
  const midY = centerCp ? centerCp.y : h * 0.5;

  // Trục chính Tây Nam -> Trung Quân -> Đông Bắc
  roads.push(
    sampleCubicRoad(
      swSpawnX - 180,
      Math.min(h - 90, swSpawnY + 210),
      swSpawnX + 180,
      swSpawnY - 40,
      midX - 280,
      midY + 130,
      midX,
      midY,
      36,
      1.08,
    ),
  );
  roads.push(
    sampleCubicRoad(
      midX,
      midY,
      midX + 290,
      midY - 125,
      neSpawnX - 190,
      neSpawnY + 45,
      neSpawnX + 180,
      Math.max(90, neSpawnY - 200),
      36,
      1.08,
    ),
  );

  // Nhánh chiến thuật nối sang các Đài Hiệu Lệnh cánh (capturePoints[1..])
  for (let i = 1; i < map.capturePoints.length; i++) {
    const cp = map.capturePoints[i];
    const ctrlX1 = midX + (cp.x - midX) * 0.36 + (rng() - 0.5) * 140;
    const ctrlY1 = midY + (cp.y - midY) * 0.52 + (rng() - 0.5) * 110;
    const ctrlX2 = midX + (cp.x - midX) * 0.72 + (rng() - 0.5) * 120;
    const ctrlY2 = midY + (cp.y - midY) * 0.82 + (rng() - 0.5) * 90;
    roads.push(sampleCubicRoad(midX, midY, ctrlX1, ctrlY1, ctrlX2, ctrlY2, cp.x, cp.y, 28, 0.82));
  }

  // 3. Đá tảng rải rác trên sườn & viền các Đồi Cao ('ridge')
  const boulders: RidgeBoulder[] = [];
  for (const zone of map.terrainZones) {
    if (zone.kind !== 'ridge') continue;
    const c = Math.cos(zone.rot);
    const s = Math.sin(zone.rot);
    const count = 16;
    for (let i = 0; i < count; i++) {
      // Tập trung quanh triền đá (r = 0.62..1.03) và vách đá Đông Nam
      const angle = rng() * Math.PI * 2;
      const radial = 0.58 + rng() * 0.45;
      const lx = Math.cos(angle) * zone.rx * radial;
      const ly = Math.sin(angle) * zone.ry * radial;
      const wx = zone.x + lx * c - ly * s;
      const wy = zone.y + lx * s + ly * c;
      if (wx < 50 || wx > w - 50 || wy < 50 || wy > h - 50) continue;
      if (isNearCaptureCenter(map, wx, wy, 56)) continue;
      boulders.push({
        wx,
        wy,
        sprite: BOULDER_SPRITE_NAMES[rng() < 0.52 ? 0 : 1],
        scale: 0.72 + rng() * 0.48,
        flipX: rng() < 0.5,
      });
    }
  }
  boulders.sort((a, b) => a.wy - b.wy || a.wx - b.wx);

  // 4. Doanh trại hậu cần nhỏ (war_tent & palisade_wall) ở hậu phương hai phe
  const campCandidates: { wx: number; wy: number; sprite: 'war_tent.png' | 'palisade_wall.png'; flipX: boolean }[] = [
    { wx: w * 0.085, wy: h * 0.78, sprite: 'war_tent.png', flipX: false },
    { wx: w * 0.115, wy: h * 0.83, sprite: 'war_tent.png', flipX: false },
    { wx: w * 0.135, wy: h * 0.75, sprite: 'palisade_wall.png', flipX: false },
    { wx: w * 0.905, wy: h * 0.20, sprite: 'war_tent.png', flipX: true },
    { wx: w * 0.875, wy: h * 0.15, sprite: 'war_tent.png', flipX: true },
    { wx: w * 0.855, wy: h * 0.23, sprite: 'palisade_wall.png', flipX: true },
  ];
  const campProps: CampProp[] = [];
  for (const item of campCandidates) {
    if (isInZoneKind(map, item.wx, item.wy, 'river')) continue;
    if (isNearCaptureCenter(map, item.wx, item.wy, 110)) continue;
    campProps.push({
      wx: item.wx,
      wy: item.wy,
      sprite: item.sprite,
      scale: 0.84 + rng() * 0.12,
      flipX: item.flipX,
    });
  }
  campProps.sort((a, b) => a.wy - b.wy || a.wx - b.wx);

  // 5. Gợn nước chảy trong các vùng sông ('river')
  const ripplesByZone = new Map<string, RiverRippleSeed[]>();
  for (const zone of map.terrainZones) {
    if (zone.kind !== 'river') continue;
    const ripples: RiverRippleSeed[] = [];
    for (let i = 0; i < 28; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.82;
      ripples.push({
        u: Math.cos(a) * r,
        v: Math.sin(a) * r,
        len: 26 + rng() * 42,
        phase: rng() * Math.PI * 2,
        speed: 0.55 + rng() * 0.45,
      });
    }
    ripplesByZone.set(zone.id, ripples);
  }

  // 6. Rừng 162 cây Thông Phương Bắc / Trúc Trường Bản (nằm chuẩn trong khoảng 120–180 cây!)
  const trees: CanopyTreeInstance[] = [];
  const minSpacingSq = 33 * 33;

  const canPlaceTree = (wx: number, wy: number): boolean => {
    if (wx < 26 || wx > w - 26 || wy < 24 || wy > h - 32) return false;
    if (isInZoneKind(map, wx, wy, 'river')) return false;
    if (isNearCaptureCenter(map, wx, wy, 58)) return false;
    for (let i = 0; i < trees.length; i++) {
      const dx = trees[i].wx - wx;
      const dy = trees[i].wy - wy;
      if (dx * dx + dy * dy < minSpacingSq) return false;
    }
    return true;
  };

  const pickTreeSprite = (wy: number): string => {
    if (map.id === 'changban') {
      // Trường Bản: rừng trúc xanh dày hai bên sườn xen thông núi phía Bắc
      if (wy < h * 0.24 && rng() < 0.45) {
        return PINE_SPRITE_NAMES[Math.floor(rng() * PINE_SPRITE_NAMES.length)];
      }
      return rng() < 0.8 ? 'bamboo_clump.png' : PINE_SPRITE_NAMES[Math.floor(rng() * PINE_SPRITE_NAMES.length)];
    }
    return PINE_SPRITE_NAMES[Math.floor(rng() * PINE_SPRITE_NAMES.length)];
  };

  // 6a. Phân bổ ~112 cây bên trong các vùng 'forest' theo diện tích tương đối
  const forestZones = map.terrainZones.filter((z) => z.kind === 'forest');
  const totalForestArea =
    forestZones.reduce((acc, z) => acc + z.rx * z.ry, 0) || 1;
  const targetZoneTrees = 112;

  for (const zone of forestZones) {
    const share = (zone.rx * zone.ry) / totalForestArea;
    const quota = Math.max(18, Math.round(targetZoneTrees * share));
    const c = Math.cos(zone.rot);
    const s = Math.sin(zone.rot);
    let placed = 0;
    let attempts = 0;
    while (placed < quota && attempts < quota * 16) {
      attempts++;
      const angle = rng() * Math.PI * 2;
      // Mật độ dày tự nhiên ở lõi rừng và thưa dần ở bìa rừng (r <= 0.97)
      const rad = Math.pow(rng(), 0.58) * 0.97;
      const lx = Math.cos(angle) * zone.rx * rad;
      const ly = Math.sin(angle) * zone.ry * rad;
      const wx = zone.x + lx * c - ly * s;
      const wy = zone.y + lx * s + ly * c;
      if (!canPlaceTree(wx, wy)) continue;
      trees.push({
        wx,
        wy,
        sprite: pickTreeSprite(wy),
        scale: 0.80 + rng() * 0.36,
        flipX: rng() < 0.5,
        windPhase: rng() * Math.PI * 2,
        windAmp: 0.75 + rng() * 0.55,
        shadeTint: 0.88 + rng() * 0.2,
      });
      placed++;
    }
  }

  // 6b. Phân bổ cây Thông dọc biên Tây Bắc: trên Bình Nguyên trải vào vùng Rừng Thông Tây Bắc,
  // còn trên các bản đồ khác giữ sát vành biên không chơi (< 46) để không gây hiểu nhầm vùng ẩn nấp
  const targetBorderTrees = map.id === 'pingyuan' ? 50 : 28;
  let borderPlaced = 0;
  let borderAttempts = 0;
  while (borderPlaced < targetBorderTrees && borderAttempts < 900) {
    borderAttempts++;
    let wx: number;
    let wy: number;
    if (map.id === 'pingyuan') {
      if (rng() < 0.64) {
        wx = 34 + Math.pow(rng(), 0.82) * (w * 0.42);
        wy = 28 + Math.pow(rng(), 1.25) * 320;
      } else {
        wx = 32 + Math.pow(rng(), 1.3) * 255;
        wy = 60 + Math.pow(rng(), 0.85) * (h * 0.44);
      }
    } else if (rng() < 0.55) {
      wx = 18 + rng() * (w - 36);
      wy = 12 + rng() * 34;
    } else {
      wx = 12 + rng() * 34;
      wy = 18 + rng() * (h - 36);
    }
    if (!canPlaceTree(wx, wy)) continue;
    trees.push({
      wx,
      wy,
      sprite: pickTreeSprite(wy),
      scale: 0.86 + rng() * 0.34,
      flipX: rng() < 0.5,
      windPhase: rng() * Math.PI * 2,
      windAmp: 0.75 + rng() * 0.55,
      shadeTint: 0.86 + rng() * 0.18,
    });
    borderPlaced++;
  }

  // Sắp xếp chiều sâu từ Bắc xuống Nam (tăng dần theo wy)
  trees.sort((a, b) => a.wy - b.wy || a.wx - b.wx);

  const built: CachedMapDecor = {
    key: cacheKey,
    patches,
    roads,
    boulders,
    campProps,
    trees,
    ripplesByZone,
  };
  mapDecorCache.set(cacheKey, built);
  return built;
}

// ============================================================================
// 3. CÁC HÀM VẼ CHI TIẾT ĐỊA HÌNH TRONG HỆ TỌA ĐỘ THẾ GIỚI 2.5D
// ============================================================================

function tracePolyline(ctx: CanvasRenderingContext2D, pts: RoadPoint[], offsetNormal = 0): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x + pts[0].nx * offsetNormal, pts[0].y + pts[0].ny * offsetNormal);
  for (let i = 1; i < pts.length - 1; i++) {
    const xCurr = pts[i].x + pts[i].nx * offsetNormal;
    const yCurr = pts[i].y + pts[i].ny * offsetNormal;
    const xNext = pts[i + 1].x + pts[i + 1].nx * offsetNormal;
    const yNext = pts[i + 1].y + pts[i + 1].ny * offsetNormal;
    ctx.quadraticCurveTo(xCurr, yCurr, (xCurr + xNext) * 0.5, (yCurr + yNext) * 0.5);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x + last.nx * offsetNormal, last.y + last.ny * offsetNormal);
}

function renderBattleRoads(
  ctx: CanvasRenderingContext2D,
  roads: RoadPath[],
  theme: MapThemePalette,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const road of roads) {
    const wMul = road.widthMul;

    // Bờ đất bụi rộng hai bên đường hành quân
    tracePolyline(ctx, road.pts, 0);
    ctx.strokeStyle = theme.roadShoulder;
    ctx.lineWidth = 54 * wMul;
    ctx.stroke();

    // Lòng đường đất nện chính giữa
    tracePolyline(ctx, road.pts, 0);
    ctx.strokeStyle = theme.roadCore;
    ctx.lineWidth = 30 * wMul;
    ctx.stroke();

    // Hai vệt bánh xe chiến xa / xe lương song song đặc trưng thời Hán - Tam Quốc
    ctx.strokeStyle = theme.roadRut;
    ctx.lineWidth = 2.6 * wMul;
    ctx.setLineDash([22, 9, 14, 11]);
    tracePolyline(ctx, road.pts, -8.2 * wMul);
    ctx.stroke();
    tracePolyline(ctx, road.pts, 8.2 * wMul);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/**
 * Đổ chất liệu lặp không gian thế giới (`CanvasPattern`) vào vùng elip xoay
 * kết hợp làm mềm biên (feathered gradient) để chuyển tiếp mượt với đồng cỏ.
 */
function fillZonePatternWithFeather(
  ctx: CanvasRenderingContext2D,
  zone: TwTerrainZone,
  pattern: CanvasPattern | null,
  fallbackColor: string,
  outerSkirtStops: readonly [number, string][],
  innerRimStops: readonly [number, string][],
  patternScale = 0.85,
  patternShiftX = 0,
  patternShiftY = 0,
): void {
  const rx = Math.max(1, zone.rx);
  const ry = Math.max(1, zone.ry);

  // 1. Vầng chuyển tiếp bên ngoài elip (r: 0.7 -> 1.18)
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);
  ctx.scale(rx, ry);
  const skirtGrad = ctx.createRadialGradient(0, 0, 0.55, 0, 0, 1.18);
  for (const [stop, color] of outerSkirtStops) {
    skirtGrad.addColorStop(stop, color);
  }
  ctx.fillStyle = skirtGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 1.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Cắt vùng elip chuẩn và lát chất liệu mặt đất trong không gian thế giới
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.02, ry * 1.02, 0, 0, Math.PI * 2);
  ctx.clip();

  // Quay ngược về hệ trục thế giới để chất liệu không bị kéo giãn méo theo tỉ lệ rx/ry
  ctx.rotate(-zone.rot);
  ctx.translate(-zone.x + patternShiftX, -zone.y + patternShiftY);
  ctx.scale(patternScale, patternScale);

  const span = Math.max(rx, ry) * 1.35;
  const minX = (zone.x - patternShiftX - span) / patternScale;
  const minY = (zone.y - patternShiftY - span) / patternScale;
  const size = (span * 2) / patternScale;

  if (pattern) {
    ctx.fillStyle = pattern;
  } else {
    ctx.fillStyle = fallbackColor;
  }
  ctx.fillRect(minX, minY, size, size);
  ctx.restore();

  // 3. Phủ lớp sương/cỏ hòa trộn viền trong-ngoài để giấu đường cắt clip
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);
  ctx.scale(rx, ry);
  const rimGrad = ctx.createRadialGradient(0, 0, 0.62, 0, 0, 1.05);
  for (const [stop, color] of innerRimStops) {
    rimGrad.addColorStop(stop, color);
  }
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 1.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderMudZone(
  ctx: CanvasRenderingContext2D,
  zone: TwTerrainZone,
  mudPattern: CanvasPattern | null,
): void {
  fillZonePatternWithFeather(
    ctx,
    zone,
    mudPattern,
    '#4a3d2d',
    [
      [0, 'rgba(64, 52, 36, 0.72)'],
      [0.72, 'rgba(68, 56, 38, 0.42)'],
      [1, 'rgba(68, 56, 38, 0)'],
    ],
    [
      [0, 'rgba(32, 26, 18, 0.08)'],
      [0.75, 'rgba(68, 58, 40, 0.26)'],
      [0.95, 'rgba(84, 82, 52, 0.55)'],
      [1, 'rgba(84, 88, 56, 0)'],
    ],
    0.78,
  );

  // Vũng nước bùn lầy phản chiếu ánh trời thu xám bạc
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);
  ctx.fillStyle = 'rgba(92, 102, 96, 0.22)';
  ctx.beginPath();
  ctx.ellipse(-zone.rx * 0.22, -zone.ry * 0.1, zone.rx * 0.28, zone.ry * 0.2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(zone.rx * 0.26, zone.ry * 0.18, zone.rx * 0.22, zone.ry * 0.16, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Viền cảnh báo vùng lầy giảm tốc tinh tế
  ctx.strokeStyle = 'rgba(148, 124, 86, 0.24)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.ellipse(0, 0, zone.rx, zone.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function renderRiverZone(
  ctx: CanvasRenderingContext2D,
  zone: TwTerrainZone,
  waterPattern: CanvasPattern | null,
  ripples: RiverRippleSeed[],
  timeSec: number,
): void {
  const rx = Math.max(1, zone.rx);
  const ry = Math.max(1, zone.ry);

  // 1. Bãi cát bồi & sỏi cuội ven bờ sông cạn (Sandy Ford Banks)
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);
  ctx.scale(rx, ry);
  const bankGrad = ctx.createRadialGradient(0, 0, 0.72, 0, 0, 1.2);
  bankGrad.addColorStop(0, 'rgba(182, 164, 122, 0.85)');
  bankGrad.addColorStop(0.52, 'rgba(174, 154, 112, 0.64)');
  bankGrad.addColorStop(0.82, 'rgba(132, 118, 82, 0.30)');
  bankGrad.addColorStop(1, 'rgba(110, 104, 72, 0)');
  ctx.fillStyle = bankGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Dòng nước xanh đá cẩm thạch (Slate-Jade Water) trôi động dọc trục sông
  const flowCos = Math.cos(zone.rot);
  const flowSin = Math.sin(zone.rot);
  const flowDist = (timeSec * 24) % 512;

  fillZonePatternWithFeather(
    ctx,
    zone,
    waterPattern,
    '#4a6b6e',
    [
      [0, 'rgba(64, 98, 102, 0.75)'],
      [0.82, 'rgba(154, 144, 110, 0.35)'],
      [1, 'rgba(154, 144, 110, 0)'],
    ],
    [
      [0, 'rgba(34, 68, 74, 0.16)'],
      [0.72, 'rgba(72, 108, 108, 0.18)'],
      [0.92, 'rgba(176, 164, 128, 0.56)'],
      [1, 'rgba(176, 164, 128, 0)'],
    ],
    0.82,
    flowCos * flowDist,
    flowSin * flowDist,
  );

  // 3. Dải bến lội cạn (Sandy Ford Crossing) ở trung tâm khúc sông + gợn sóng lấp lánh
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);

  const fordGrad = ctx.createLinearGradient(-rx * 0.24, 0, rx * 0.24, 0);
  fordGrad.addColorStop(0, 'rgba(186, 174, 136, 0)');
  fordGrad.addColorStop(0.5, 'rgba(194, 182, 142, 0.26)');
  fordGrad.addColorStop(1, 'rgba(186, 174, 136, 0)');
  ctx.fillStyle = fordGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.26, ry * 0.96, 0, 0, Math.PI * 2);
  ctx.fill();

  // Gợn sóng bạc trôi theo dòng chảy
  ctx.lineCap = 'round';
  for (let i = 0; i < ripples.length; i++) {
    const rp = ripples[i];
    const driftU = ((rp.u + timeSec * 0.045 * rp.speed + 1) % 1.7) - 0.85;
    const x = driftU * rx;
    const y = rp.v * ry;
    // Giữ gợn nước nằm gọn trong lòng elip
    if ((x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.84) continue;
    const shimmer = 0.16 + 0.18 * (0.5 + 0.5 * Math.sin(timeSec * 2.6 + rp.phase));
    ctx.strokeStyle = `rgba(226, 244, 242, ${shimmer.toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - rp.len * 0.5, y);
    ctx.quadraticCurveTo(x, y - 2.5, x + rp.len * 0.5, y);
    ctx.stroke();
  }

  // Viền bọt sóng mỏng sát bờ cát
  ctx.strokeStyle = 'rgba(218, 232, 226, 0.28)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.94, ry * 0.92, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function renderForestFloorZone(
  ctx: CanvasRenderingContext2D,
  zone: TwTerrainZone,
  forestPattern: CanvasPattern | null,
): void {
  fillZonePatternWithFeather(
    ctx,
    zone,
    forestPattern,
    '#343b28',
    [
      [0, 'rgba(38, 46, 28, 0.78)'],
      [0.74, 'rgba(44, 54, 32, 0.38)'],
      [1, 'rgba(44, 54, 32, 0)'],
    ],
    [
      [0, 'rgba(18, 26, 16, 0.24)'],
      [0.76, 'rgba(36, 48, 28, 0.24)'],
      [0.96, 'rgba(64, 78, 46, 0.44)'],
      [1, 'rgba(64, 78, 46, 0)'],
    ],
    0.8,
  );

  // Vòng ranh giới Phục Kích Rừng Sâu (Ambush Concealment Boundary Ring) khớp 100% twPointInTerrainZone
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);

  ctx.strokeStyle = 'rgba(24, 34, 20, 0.42)';
  ctx.lineWidth = 4.2;
  ctx.setLineDash([16, 10]);
  ctx.beginPath();
  ctx.ellipse(0, 0, zone.rx, zone.ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(154, 198, 122, 0.36)';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.ellipse(0, 0, zone.rx, zone.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

function renderRidgeZone(
  ctx: CanvasRenderingContext2D,
  zone: TwTerrainZone,
  rockPattern: CanvasPattern | null,
  grassPattern: CanvasPattern | null,
): void {
  const rx = Math.max(1, zone.rx);
  const ry = Math.max(1, zone.ry);

  // 1. Bóng đổ vách đá dựng đứng phía Đông Nam (Dark SE Cliff Shadow Escarpment)
  ctx.save();
  ctx.translate(zone.x + 28, zone.y + 36);
  ctx.rotate(zone.rot);
  ctx.scale(rx, ry);
  const cliffShadow = ctx.createRadialGradient(0.06, 0.08, 0.55, 0.08, 0.1, 1.16);
  cliffShadow.addColorStop(0, 'rgba(14, 16, 12, 0.56)');
  cliffShadow.addColorStop(0.72, 'rgba(16, 18, 14, 0.46)');
  cliffShadow.addColorStop(0.94, 'rgba(18, 20, 15, 0.22)');
  cliffShadow.addColorStop(1, 'rgba(18, 20, 15, 0)');
  ctx.fillStyle = cliffShadow;
  ctx.beginPath();
  ctx.arc(0, 0, 1.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Vách đá dốc tầng phía Đông Nam tạo khối nổi cao độ 2.5D
  ctx.save();
  ctx.translate(zone.x + 12, zone.y + 17);
  ctx.rotate(zone.rot);
  ctx.fillStyle = 'rgba(54, 48, 40, 0.78)';
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.01, ry * 1.01, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Bề mặt đá cao nguyên ('ridge_rock.jpg')
  fillZonePatternWithFeather(
    ctx,
    zone,
    rockPattern,
    '#6e6558',
    [
      [0, 'rgba(92, 84, 72, 0.72)'],
      [0.82, 'rgba(74, 68, 56, 0.34)'],
      [1, 'rgba(74, 68, 56, 0)'],
    ],
    [
      [0, 'rgba(218, 204, 174, 0.08)'],
      [0.78, 'rgba(82, 74, 62, 0.16)'],
      [0.97, 'rgba(52, 46, 38, 0.42)'],
      [1, 'rgba(52, 46, 38, 0)'],
    ],
    0.76,
  );

  // Lớp cỏ thưa trên đỉnh gò bằng phẳng để trung đoàn đứng trên đồi cao nổi bật rõ nét
  if (grassPattern) {
    ctx.save();
    ctx.translate(zone.x, zone.y - 6);
    ctx.rotate(zone.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.68, ry * 0.64, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(-zone.rot);
    ctx.translate(-zone.x, -(zone.y - 6));
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = grassPattern;
    ctx.fillRect(zone.x - rx, zone.y - ry, rx * 2, ry * 2);
    ctx.restore();
  }

  // 3. Viền nắng Tây Bắc (Sunlit NW Rim), bóng sườn Đông Nam & các đường đồng mức địa hình (Contour Lines)
  ctx.save();
  ctx.translate(zone.x, zone.y);
  ctx.rotate(zone.rot);

  // Ánh nắng chiếu chếch từ hướng Tây Bắc xuống Đông Nam
  const sunGrad = ctx.createLinearGradient(-rx, -ry, rx, ry);
  sunGrad.addColorStop(0, 'rgba(250, 234, 194, 0.30)');
  sunGrad.addColorStop(0.45, 'rgba(220, 206, 174, 0.05)');
  sunGrad.addColorStop(1, 'rgba(22, 20, 16, 0.34)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cung viền đá đón nắng Tây Bắc
  const nwStart = -Math.PI * 0.95 - zone.rot;
  const nwEnd = -Math.PI * 0.12 - zone.rot;
  ctx.strokeStyle = 'rgba(246, 232, 196, 0.48)';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.97, ry * 0.97, 0, nwStart, nwEnd);
  ctx.stroke();

  // Cung vách đá sẫm phía Đông Nam kèm gân đá dọc
  const seStart = Math.PI * 0.05 - zone.rot;
  const seEnd = Math.PI * 0.92 - zone.rot;
  ctx.strokeStyle = 'rgba(28, 24, 18, 0.58)';
  ctx.lineWidth = 6.0;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.99, ry * 0.99, 0, seStart, seEnd);
  ctx.stroke();

  // 3 vòng đường đồng mức cao độ kiểu bản đồ quân sự cổ
  const contourRadii = [0.92, 0.74, 0.52];
  for (let i = 0; i < contourRadii.length; i++) {
    const cr = contourRadii[i];
    ctx.strokeStyle = i === 0 ? 'rgba(228, 214, 182, 0.22)' : 'rgba(218, 204, 172, 0.16)';
    ctx.lineWidth = i === 0 ? 1.8 : 1.3;
    ctx.setLineDash(i === 2 ? [10, 8] : []);
    ctx.beginPath();
    ctx.ellipse(-rx * 0.03 * i, -ry * 0.04 * i, rx * cr, ry * cr, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.restore();
}

// ============================================================================
// 4. VẼ ĐÀI HIỆU LỆNH CHIẾN LƯỢC (CAPTURE OUTPOSTS & PROGRESS ARCS)
// ============================================================================

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(220, 202, 158, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function resolveCaptureTeamColor(ownerTeam: number): string {
  if (ownerTeam >= 0) {
    return TW_TEAM_COLORS[ownerTeam % TW_TEAM_COLORS.length] ?? '#339af0';
  }
  return '#dfd0ae';
}

function renderCaptureGroundRings(
  ctx: CanvasRenderingContext2D,
  map: TwMapSpec,
  captures: TwCaptureState[],
  timeSec: number,
): void {
  for (let i = 0; i < map.capturePoints.length; i++) {
    const cp = map.capturePoints[i];
    const state =
      captures.find((c) => c.id === cp.id) ??
      captures[i] ?? { id: cp.id, ownerTeam: -1, progress: 0 };

    const baseColor = resolveCaptureTeamColor(state.ownerTeam);
    const rawProgress = Number.isFinite(state.progress) ? state.progress : 0;
    const normProgress =
      rawProgress > 0 && rawProgress <= 1 && state.ownerTeam === -1
        ? rawProgress * 100
        : clamp(rawProgress, 0, 100);
    const isGarrisonActive = state.ownerTeam >= 0 && normProgress >= 95;
    const pulse = 0.76 + 0.24 * Math.sin(timeSec * 3.8 + cp.id * 1.3);

    ctx.save();
    ctx.translate(cp.x, cp.y);

    // Hào quang mặt đất bên trong bán kính chiếm điểm
    const fillGrad = ctx.createRadialGradient(0, 0, cp.radius * 0.18, 0, 0, cp.radius);
    fillGrad.addColorStop(0, hexToRgba(baseColor, 0.04));
    fillGrad.addColorStop(0.72, hexToRgba(baseColor, 0.09));
    fillGrad.addColorStop(1, hexToRgba(baseColor, 0.24 * pulse));
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.arc(0, 0, cp.radius, 0, Math.PI * 2);
    ctx.fill();

    // Nền sân đá nện Thành Lũy Nhỏ (Bastion Stone Plinth Courtyard) ngay dưới chân Vọng Lâu
    const plinthR = cp.id === 0 ? 44 : 39;
    ctx.save();
    ctx.fillStyle = 'rgba(18, 16, 14, 0.52)';
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      const px = Math.cos(a) * (plinthR + 4) + 3;
      const py = Math.sin(a) * (plinthR + 4) + 4;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    const stoneGrad = ctx.createLinearGradient(-plinthR, -plinthR, plinthR, plinthR);
    stoneGrad.addColorStop(0, 'rgba(128, 120, 106, 0.86)');
    stoneGrad.addColorStop(0.5, 'rgba(92, 86, 75, 0.88)');
    stoneGrad.addColorStop(1, 'rgba(58, 53, 46, 0.90)');
    ctx.fillStyle = stoneGrad;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      const px = Math.cos(a) * plinthR;
      const py = Math.sin(a) * plinthR;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(224, 212, 186, 0.36)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mạch đá lát bát giác trong sân thành lũy
    ctx.strokeStyle = 'rgba(32, 28, 24, 0.36)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, plinthR * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Cung nạp loạt tên tự động của Tháp Tiễn Thành Lũy (`cap.towerCooldownPct ?? 0`)
    if (isGarrisonActive) {
      const cdPct = clamp(state.towerCooldownPct ?? 0, 0, 1);
      const garrisonR = plinthR + 10;

      ctx.strokeStyle = 'rgba(12, 16, 18, 0.56)';
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.arc(0, 0, garrisonR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(baseColor, 0.26);
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, garrisonR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (cdPct > 0.01) {
        const gStart = -Math.PI * 0.5;
        const gEnd = gStart + cdPct * Math.PI * 2;
        ctx.strokeStyle = cdPct >= 0.88 ? 'rgba(255, 216, 76, 0.92)' : hexToRgba(baseColor, 0.86);
        ctx.lineWidth = 3.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, garrisonR, gStart, gEnd);
        ctx.stroke();
      }
    }

    // Vòng viền chiến thuật đen mờ tạo tương phản + vòng màu Liên Minh
    ctx.strokeStyle = 'rgba(12, 15, 14, 0.52)';
    ctx.lineWidth = 5.2;
    ctx.beginPath();
    ctx.arc(0, 0, cp.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba(baseColor, state.ownerTeam >= 0 ? 0.78 : 0.56);
    ctx.lineWidth = 2.6;
    ctx.setLineDash([18, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, cp.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 8 vạch khắc la bàn bát quái hướng tâm
    ctx.strokeStyle = hexToRgba(baseColor, 0.45);
    ctx.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(ca * (cp.radius - 10), sa * (cp.radius - 10));
      ctx.lineTo(ca * cp.radius, sa * cp.radius);
      ctx.stroke();
    }

    // Cung tiến độ chiếm điểm phát sáng (Pulsing Progress Arc)
    if (normProgress > 0.5) {
      const startAng = -Math.PI * 0.5;
      const endAng = startAng + (normProgress / 100) * Math.PI * 2;
      const isCapturing = normProgress < 99.9;
      const arcColor = state.ownerTeam >= 0 ? baseColor : '#ffd43b';
      const arcAlpha = isCapturing ? 0.68 + 0.3 * pulse : 0.52 + 0.24 * pulse;

      ctx.strokeStyle = hexToRgba(arcColor, arcAlpha * 0.45);
      ctx.lineWidth = isCapturing ? 10.5 : 7.5;
      ctx.beginPath();
      ctx.arc(0, 0, cp.radius - 5, startAng, endAng);
      ctx.stroke();

      ctx.strokeStyle = hexToRgba(arcColor, Math.min(1, arcAlpha));
      ctx.lineWidth = isCapturing ? 4.8 : 3.2;
      ctx.beginPath();
      ctx.arc(0, 0, cp.radius - 5, startAng, endAng);
      ctx.stroke();
    }

    ctx.restore();
  }
}

/**
 * Dựng hàng rào gỗ nhọn phòng thủ (Palisade Breastwork) bao quanh chân Vọng Lâu Thành Lũy.
 */
function drawBastionPalisadeArc(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  rxPx: number,
  ryPx: number,
  zoom: number,
  isFrontHalf: boolean,
): void {
  const stakeH = Math.max(6, 17 * zoom);
  const stakeW = Math.max(1.8, 3.8 * zoom);
  const angles = isFrontHalf
    ? [0.18, 0.38, 0.58, 2.56, 2.76, 2.96]
    : [-2.88, -2.56, -2.24, -1.88, -1.26, -0.9, -0.58, -0.26];

  ctx.save();
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const px = sx + Math.cos(a) * rxPx;
    const py = sy + Math.sin(a) * ryPx;
    const leanX = Math.cos(a) * 2.2 * zoom;

    // Cọc gỗ sồi vót nhọn hướng nhẹ ra ngoài để cản bộ/kỵ xung phong
    ctx.beginPath();
    ctx.moveTo(px - stakeW * 0.5, py);
    ctx.lineTo(px - stakeW * 0.36 + leanX, py - stakeH * 0.74);
    ctx.lineTo(px + leanX * 1.15, py - stakeH);
    ctx.lineTo(px + stakeW * 0.36 + leanX, py - stakeH * 0.74);
    ctx.lineTo(px + stakeW * 0.5, py);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#5c432b' : '#4a3521';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20, 14, 10, 0.72)';
    ctx.lineWidth = Math.max(0.8, 1.0 * zoom);
    ctx.stroke();

    // Mũi vót gỗ sáng nắng
    ctx.fillStyle = '#a68256';
    ctx.beginPath();
    ctx.moveTo(px - stakeW * 0.25 + leanX, py - stakeH * 0.74);
    ctx.lineTo(px + leanX * 1.15, py - stakeH);
    ctx.lineTo(px + stakeW * 0.25 + leanX, py - stakeH * 0.74);
    ctx.closePath();
    ctx.fill();
  }

  // Thanh xà ngang buộc dây gai liên kết dãy cự mã thành lũy
  ctx.strokeStyle = '#3b2919';
  ctx.lineWidth = Math.max(1.2, 2.2 * zoom);
  if (!isFrontHalf) {
    ctx.beginPath();
    ctx.ellipse(sx, sy - stakeH * 0.44, rxPx, ryPx, 0, -2.92, -0.22);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(sx, sy - stakeH * 0.42, rxPx, ryPx, 0, 0.16, 0.62);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(sx, sy - stakeH * 0.42, rxPx, ryPx, 0, 2.52, 2.98);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Dự phòng Canvas Isometric 2.5D sắc nét cho Tháp Tiễn Thành Lũy (Small City Defense Watchtower)
 * khi ảnh `/database-total-war/structures/watchtower.png` chưa giải mã xong hoặc chạy môi trường headless.
 */
function drawIsometricWatchtowerFallback(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  wPx: number,
  hPx: number,
  teamColor: string,
  hasOwner: boolean,
): void {
  ctx.save();
  ctx.translate(sx, sy);

  // 1. Chân đế đá hộc vát nghiêng 2 mặt sáng/tối (Isometric Stone Bastion Base)
  const baseHalfW = wPx * 0.34;
  const baseTopHalfW = wPx * 0.25;
  const baseH = hPx * 0.26;
  const isoDrop = wPx * 0.11;

  // Mặt đá Tây Nam đón nắng
  ctx.fillStyle = '#857e71';
  ctx.beginPath();
  ctx.moveTo(-baseHalfW, -isoDrop * 0.4);
  ctx.lineTo(0, isoDrop * 0.75);
  ctx.lineTo(0, -baseH + isoDrop * 0.45);
  ctx.lineTo(-baseTopHalfW, -baseH);
  ctx.closePath();
  ctx.fill();

  // Mặt đá Đông Nam khuất bóng
  ctx.fillStyle = '#575249';
  ctx.beginPath();
  ctx.moveTo(0, isoDrop * 0.75);
  ctx.lineTo(baseHalfW, -isoDrop * 0.4);
  ctx.lineTo(baseTopHalfW, -baseH);
  ctx.lineTo(0, -baseH + isoDrop * 0.45);
  ctx.closePath();
  ctx.fill();

  // Mặt sàn đá đỉnh bệ
  ctx.fillStyle = '#9c9485';
  ctx.beginPath();
  ctx.moveTo(0, -baseH - isoDrop * 0.45);
  ctx.lineTo(baseTopHalfW, -baseH);
  ctx.lineTo(0, -baseH + isoDrop * 0.45);
  ctx.lineTo(-baseTopHalfW, -baseH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(24, 20, 16, 0.78)';
  ctx.lineWidth = Math.max(1, wPx * 0.014);
  ctx.stroke();

  // 2. Khung 4 cột trụ gỗ lim + giằng chữ X nâng sàn bắn tên
  const galBotY = -hPx * 0.58;
  const colSpan = wPx * 0.19;
  ctx.strokeStyle = '#3d2817';
  ctx.lineWidth = Math.max(1.8, wPx * 0.042);
  const colsX = [-colSpan, -colSpan * 0.32, colSpan * 0.32, colSpan];
  for (let c = 0; c < colsX.length; c++) {
    ctx.beginPath();
    ctx.moveTo(colsX[c], -baseH + (Math.abs(colsX[c]) < colSpan * 0.5 ? isoDrop * 0.3 : 0));
    ctx.lineTo(colsX[c] * 0.92, galBotY);
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(1.1, wPx * 0.02);
  ctx.strokeStyle = '#593b22';
  ctx.beginPath();
  ctx.moveTo(-colSpan, -baseH);
  ctx.lineTo(colSpan * 0.92, galBotY);
  ctx.moveTo(colSpan, -baseH);
  ctx.lineTo(-colSpan * 0.92, galBotY);
  ctx.stroke();

  // 3. Lầu xạ thủ có lỗ châu mai & lan can chiến lũy gỗ (Wooden Archer Gallery)
  const galHalfW = wPx * 0.27;
  const galTopY = -hPx * 0.73;
  ctx.fillStyle = '#6b4728';
  ctx.fillRect(-galHalfW, galTopY, galHalfW, galBotY - galTopY);
  ctx.fillStyle = '#4c321c';
  ctx.fillRect(0, galTopY, galHalfW, galBotY - galTopY);
  ctx.strokeStyle = '#24170c';
  ctx.lineWidth = Math.max(1, wPx * 0.015);
  ctx.strokeRect(-galHalfW, galTopY, galHalfW * 2, galBotY - galTopY);

  // Lỗ châu mai bắn tên (Arrow Slits)
  ctx.fillStyle = '#140e09';
  const slitW = Math.max(1.5, wPx * 0.025);
  const slitH = Math.max(3, hPx * 0.065);
  ctx.fillRect(-galHalfW * 0.55, galTopY + (galBotY - galTopY) * 0.26, slitW, slitH);
  ctx.fillRect(galHalfW * 0.42, galTopY + (galBotY - galTopY) * 0.26, slitW, slitH);

  // Cờ hiệu Liên Minh rủ từ lan can vọng lâu
  if (hasOwner) {
    const flagW = wPx * 0.09;
    const flagH = hPx * 0.16;
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.moveTo(-flagW * 0.5, galBotY);
    ctx.lineTo(flagW * 0.5, galBotY);
    ctx.lineTo(flagW * 0.5, galBotY + flagH * 0.8);
    ctx.lineTo(0, galBotY + flagH);
    ctx.lineTo(-flagW * 0.5, galBotY + flagH * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffd43b';
    ctx.lineWidth = Math.max(0.9, wPx * 0.012);
    ctx.stroke();
  }

  // 4. Mái ngói âm dương cong vút kiểu Hán - Tam Quốc (Sweeping Han Hip-Roof)
  const eaveHalfW = wPx * 0.37;
  const ridgeY = -hPx * 0.9;
  ctx.beginPath();
  ctx.moveTo(0, ridgeY);
  ctx.quadraticCurveTo(eaveHalfW * 0.55, galTopY - hPx * 0.04, eaveHalfW, galTopY + hPx * 0.015);
  ctx.lineTo(0, galTopY + hPx * 0.055);
  ctx.lineTo(-eaveHalfW, galTopY + hPx * 0.015);
  ctx.quadraticCurveTo(-eaveHalfW * 0.55, galTopY - hPx * 0.04, 0, ridgeY);
  ctx.closePath();
  const roofGrad = ctx.createLinearGradient(-eaveHalfW, ridgeY, eaveHalfW, galTopY);
  roofGrad.addColorStop(0, '#464d54');
  roofGrad.addColorStop(0.5, '#2f353b');
  roofGrad.addColorStop(1, '#1d2126');
  ctx.fillStyle = roofGrad;
  ctx.fill();

  ctx.strokeStyle = hasOwner ? teamColor : '#c9b37e';
  ctx.lineWidth = Math.max(1.2, wPx * 0.018);
  ctx.stroke();

  ctx.restore();
}

/**
 * Ngọn đuốc / chậu lửa hiệu lệnh Liên Minh rực cháy trên đỉnh Vọng Lâu khi điểm cứ đã chiếm giữ (`progress >= 95`).
 */
function drawWatchtowerBrazierFlame(
  ctx: CanvasRenderingContext2D,
  sx: number,
  roofSy: number,
  zoom: number,
  teamColor: string,
  timeSec: number,
  seed: number,
): void {
  const flicker =
    0.82 +
    0.18 * Math.sin(timeSec * 11.4 + seed * 1.9) * Math.cos(timeSec * 6.8 + seed * 0.7);
  const flameScale = clamp(zoom, 0.45, 1.5);
  const rHalo = 24 * flameScale * flicker;

  ctx.save();
  ctx.translate(sx, roofSy);

  // Quầng sáng hỏa đăng pha sắc cờ Liên Minh + cam hoàng kim
  const halo = ctx.createRadialGradient(0, -4 * flameScale, 1.5, 0, -4 * flameScale, rHalo);
  halo.addColorStop(0, 'rgba(255, 246, 190, 0.92)');
  halo.addColorStop(0.35, 'rgba(255, 138, 32, 0.58)');
  halo.addColorStop(0.72, hexToRgba(teamColor, 0.34));
  halo.addColorStop(1, 'rgba(255, 90, 20, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, -4 * flameScale, rHalo, 0, Math.PI * 2);
  ctx.fill();

  // Chậu đồng hỏa đài trên đỉnh nóc tháp
  const bowlW = 7.5 * flameScale;
  const bowlH = 3.2 * flameScale;
  ctx.fillStyle = '#2b241d';
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = Math.max(0.9, 1.1 * flameScale);
  ctx.beginPath();
  ctx.moveTo(-bowlW, -bowlH);
  ctx.lineTo(bowlW, -bowlH);
  ctx.lineTo(bowlW * 0.65, bowlH * 0.6);
  ctx.lineTo(-bowlW * 0.65, bowlH * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3 lớp lưỡi lửa nhảy múa (Đỏ Chu Sa -> Hổ Phách -> Lõi Kim Bạch)
  const sway = Math.sin(timeSec * 8.6 + seed * 2.1) * 3.0 * flameScale;
  const hOuter = (15.5 + 3.2 * Math.sin(timeSec * 13.0 + seed)) * flameScale;

  ctx.beginPath();
  ctx.moveTo(-bowlW * 0.78, -bowlH * 0.8);
  ctx.quadraticCurveTo(-bowlW * 0.9, -hOuter * 0.55, sway, -hOuter);
  ctx.quadraticCurveTo(bowlW * 0.9, -hOuter * 0.55, bowlW * 0.78, -bowlH * 0.8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(235, 68, 24, 0.92)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-bowlW * 0.52, -bowlH * 0.85);
  ctx.quadraticCurveTo(-bowlW * 0.5, -hOuter * 0.45, sway * 0.65, -hOuter * 0.76);
  ctx.quadraticCurveTo(bowlW * 0.5, -hOuter * 0.45, bowlW * 0.52, -bowlH * 0.85);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 176, 36, 0.95)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(sway * 0.3, -hOuter * 0.34, Math.max(1.4, 2.5 * flameScale), 0, Math.PI * 2);
  ctx.fillStyle = '#fff9db';
  ctx.fill();

  // Tàn lửa bay bổng lên trời đêm/nắng thu
  for (let sp = 0; sp < 2; sp++) {
    const t = (timeSec * 1.4 + seed * 0.37 + sp * 0.5) % 1;
    const sparkX = sway * t + Math.sin(timeSec * 6 + sp * 3.1) * 4 * flameScale;
    const sparkY = -hOuter * 0.7 - t * 14 * flameScale;
    ctx.globalAlpha = (1 - t) * 0.85;
    ctx.fillStyle = sp === 0 ? '#ffd43b' : teamColor;
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, Math.max(1.0, 1.5 * flameScale), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

interface UprightPropItem {
  wy: number;
  draw: () => void;
}

function renderUprightTerrainStructures(
  ctx: CanvasRenderingContext2D,
  map: TwMapSpec,
  captures: TwCaptureState[],
  decor: CachedMapDecor,
  cam: TwCamera,
  timeSec: number,
): void {
  const items: UprightPropItem[] = [];
  const margin = 180;

  // 1. Đá tảng trên Đồi Cao
  for (let i = 0; i < decor.boulders.length; i++) {
    const b = decor.boulders[i];
    const { sx, sy } = worldToScreen(b.wx, b.wy, cam);
    if (sx < -margin || sx > cam.viewW + margin || sy < -margin || sy > cam.viewH + margin) {
      continue;
    }
    items.push({
      wy: b.wy,
      draw: () => {
        const img = getTwStructureImg(b.sprite);
        const wPx = 68 * b.scale * cam.zoom;
        const hPx = 56 * b.scale * cam.zoom;
        if (isImgReady(img)) {
          ctx.save();
          ctx.translate(sx, sy);
          if (b.flipX) ctx.scale(-1, 1);
          ctx.drawImage(img, -wPx * 0.5, -hPx * 0.78, wPx, hPx);
          ctx.restore();
        } else {
          ctx.fillStyle = '#6c6559';
          ctx.beginPath();
          ctx.ellipse(sx, sy - hPx * 0.25, wPx * 0.4, hPx * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }

  // 2. Doanh trại hậu phương (lều quân & hàng rào gỗ)
  for (let i = 0; i < decor.campProps.length; i++) {
    const p = decor.campProps[i];
    const { sx, sy } = worldToScreen(p.wx, p.wy, cam);
    if (sx < -margin || sx > cam.viewW + margin || sy < -margin || sy > cam.viewH + margin) {
      continue;
    }
    items.push({
      wy: p.wy,
      draw: () => {
        const img = getTwStructureImg(p.sprite);
        if (!isImgReady(img)) return;
        const baseW = p.sprite === 'war_tent.png' ? 116 : 104;
        const baseH = p.sprite === 'war_tent.png' ? 102 : 78;
        const wPx = baseW * p.scale * cam.zoom;
        const hPx = baseH * p.scale * cam.zoom;
        ctx.save();
        ctx.translate(sx, sy);
        if (p.flipX) ctx.scale(-1, 1);
        ctx.drawImage(img, -wPx * 0.5, -hPx * 0.84, wPx, hPx);
        ctx.restore();
      },
    });
  }

  // 3. Thành Lũy Nhỏ & Vọng Lâu Phòng Thủ (`watchtower.png` + Palisade Bastion + Chậu Lửa & Cung Nạp Tên)
  for (let i = 0; i < map.capturePoints.length; i++) {
    const cp = map.capturePoints[i];
    const { sx, sy } = worldToScreen(cp.x, cp.y, cam);
    if (sx < -margin || sx > cam.viewW + margin || sy < -margin || sy > cam.viewH + margin) {
      continue;
    }

    const state =
      captures.find((c) => c.id === cp.id) ??
      captures[i] ?? { id: cp.id, ownerTeam: -1, progress: 0 };
    const teamColor = resolveCaptureTeamColor(state.ownerTeam);
    const rawProgress = Number.isFinite(state.progress) ? state.progress : 0;
    const normProgress =
      rawProgress > 0 && rawProgress <= 1 && state.ownerTeam === -1
        ? rawProgress * 100
        : clamp(rawProgress, 0, 100);
    const isGarrisonActive = state.ownerTeam >= 0 && normProgress >= 95;
    const towerScale = cp.id === 0 ? 1.08 : 0.98;

    items.push({
      wy: cp.y,
      draw: () => {
        const img =
          getTwImage('/database-total-war/structures/watchtower.png') ??
          getTwStructureImg('watchtower.png');
        const wPx = 114 * towerScale * cam.zoom;
        const hPx = 158 * towerScale * cam.zoom;
        const palisadeRx = (cp.id === 0 ? 43 : 38) * cam.zoom;
        const palisadeRy = palisadeRx * TW_ISO_TILT;

        // Hào quang chân thành lũy theo Liên Minh chiếm đóng
        const glowR = 50 * towerScale * cam.zoom;
        const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, glowR);
        glow.addColorStop(0, hexToRgba(teamColor, isGarrisonActive ? 0.44 : 0.30));
        glow.addColorStop(1, hexToRgba(teamColor, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(sx, sy, glowR, glowR * TW_ISO_TILT, 0, 0, Math.PI * 2);
        ctx.fill();

        // Vòng hàng rào gỗ nhọn phía Bắc (nằm sau lưng tháp theo chiều sâu Y)
        drawBastionPalisadeArc(ctx, sx, sy, palisadeRx, palisadeRy, cam.zoom, false);

        if (isImgReady(img)) {
          ctx.drawImage(img, sx - wPx * 0.5, sy - hPx * 0.88, wPx, hPx);

          // Đại kỳ Liên Minh rủ hai bên mái hiên vọng lâu khi đã có phe kiểm soát
          if (state.ownerTeam >= 0) {
            const sway = Math.sin(timeSec * 3.4 + cp.id) * 1.6 * cam.zoom;
            const flagTopY = sy - hPx * 0.56;
            const flagH = Math.max(6, 18 * cam.zoom);
            const flagW = Math.max(2.5, 5.5 * cam.zoom);
            for (const sideSign of [-1, 1] as const) {
              const fx = sx + sideSign * wPx * 0.22;
              ctx.save();
              ctx.fillStyle = teamColor;
              ctx.strokeStyle = '#ffd43b';
              ctx.lineWidth = Math.max(0.8, 1.0 * cam.zoom);
              ctx.beginPath();
              ctx.moveTo(fx - flagW * 0.5, flagTopY);
              ctx.lineTo(fx + flagW * 0.5, flagTopY);
              ctx.lineTo(fx + flagW * 0.5 + sway, flagTopY + flagH * 0.82);
              ctx.lineTo(fx + sway, flagTopY + flagH);
              ctx.lineTo(fx - flagW * 0.5 + sway, flagTopY + flagH * 0.82);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.restore();
            }
          }
        } else {
          drawIsometricWatchtowerFallback(
            ctx,
            sx,
            sy,
            wPx,
            hPx,
            teamColor,
            state.ownerTeam >= 0,
          );
        }

        // Hai cánh hàng rào gỗ nhọn tiền phương (chừa cổng vào chính diện)
        drawBastionPalisadeArc(ctx, sx, sy, palisadeRx, palisadeRy, cam.zoom, true);

        // Chậu Lửa Hiệu Lệnh trên nóc Vọng Lâu khi đồn trú Tháp Tiễn kích hoạt (`ownerTeam >= 0 && progress >= 95`)
        if (isGarrisonActive) {
          drawWatchtowerBrazierFlame(
            ctx,
            sx,
            sy - hPx * 0.88,
            cam.zoom * towerScale,
            teamColor,
            timeSec,
            cp.id + 1,
          );
        }

        // Huy hiệu đại kỳ nhỏ, đồng hồ nạp tên đồn trú & biển tên Thành Lũy phía trên công trình
        if (cam.zoom >= 0.42) {
          const badgeY = sy - hPx * (isGarrisonActive ? 0.99 : 0.93) - 8;
          const pulse = 0.85 + 0.15 * Math.sin(timeSec * 3.5 + cp.id);
          const fontSize = Math.round(clamp(11 * cam.zoom, 9.5, 13));
          const cdPct = clamp(state.towerCooldownPct ?? 0, 0, 1);

          ctx.save();
          ctx.font = `600 ${fontSize}px "Noto Serif", Georgia, serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          const label = cp.name;
          const textW = ctx.measureText(label).width;
          const padX = 9;
          const extraGarrisonW = isGarrisonActive ? 10 : 0;
          const boxW = textW + padX * 2 + 12 + extraGarrisonW;
          const boxH = fontSize + 8;
          const boxX = sx - boxW * 0.5;
          const boxY = badgeY - boxH * 0.5;

          ctx.fillStyle = 'rgba(16, 18, 20, 0.80)';
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 4);
          ctx.fill();

          ctx.strokeStyle = hexToRgba(teamColor, 0.86 * pulse);
          ctx.lineWidth = 1.25;
          ctx.stroke();

          // Chấm ngọc màu phe + vòng tiến độ nạp tên Tháp Tiễn (`towerCooldownPct`) ở đầu bảng tên
          const dialX = boxX + 9.5;
          if (isGarrisonActive) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(dialX, badgeY, 5.2, 0, Math.PI * 2);
            ctx.stroke();

            if (cdPct > 0.01) {
              ctx.strokeStyle = cdPct >= 0.88 ? '#ffd43b' : teamColor;
              ctx.lineWidth = 1.9;
              ctx.beginPath();
              ctx.arc(dialX, badgeY, 5.2, -Math.PI * 0.5, -Math.PI * 0.5 + cdPct * Math.PI * 2);
              ctx.stroke();
            }
          }

          ctx.fillStyle = teamColor;
          ctx.beginPath();
          ctx.arc(dialX, badgeY, 3.0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#f4ebd4';
          ctx.fillText(label, sx + 5 + extraGarrisonW * 0.35, badgeY + 0.5);
          ctx.restore();
        }
      },
    });
  }

  items.sort((a, b) => a.wy - b.wy);
  for (let i = 0; i < items.length; i++) {
    items[i].draw();
  }
}

// ============================================================================
// 5. HÀM XUẤT KHẨU CHÍNH: MẶT ĐẤT ĐỊA HÌNH & TÁN RỪNG THÔNG PHƯƠNG BẮC
// ============================================================================

/**
 * Dựng toàn bộ mặt đất chiến trường 2.5D, đường mòn bánh xe chiến xa, vùng địa hình
 * (`mud`, `river`, `forest`, `ridge`), tảng đá, vòng chiếm điểm và Thành Lũy Vọng Lâu.
 */
export function renderTwTerrain(
  ctx: CanvasRenderingContext2D,
  map: TwMapSpec,
  captures: TwCaptureState[],
  cam: TwCamera,
  timeSec: number,
  extra?: TwTerrainRenderExtra | ReadonlyArray<TwFireZoneFrame> | null,
): void {
  const theme = MAP_THEMES[map.id] ?? MAP_THEMES.pingyuan;
  const decor = buildMapDecor(map);
  const fires: ReadonlyArray<TwFireZoneFrame> | undefined = Array.isArray(extra)
    ? extra
    : extra && 'fires' in extra
      ? (extra.fires ?? undefined)
      : undefined;

  // 1. Nền chân trời ngoài rìa bản đồ
  ctx.save();
  ctx.fillStyle = theme.abyssBg;
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  const grassImg = getTwTerrainImg(theme.baseTexture);
  const frostImg = getTwTerrainImg('winter_frost.jpg');
  const mudImg = getTwTerrainImg('autumn_mud.jpg');
  const riverImg = getTwTerrainImg('river_water.jpg');
  const forestImg = getTwTerrainImg('forest_floor.jpg');
  const ridgeImg = getTwTerrainImg('ridge_rock.jpg');

  const grassPattern = getCachedPattern(ctx, grassImg);
  const frostPattern = getCachedPattern(ctx, frostImg);
  const mudPattern = getCachedPattern(ctx, mudImg);
  const riverPattern = getCachedPattern(ctx, riverImg);
  const forestPattern = getCachedPattern(ctx, forestImg);
  const ridgePattern = getCachedPattern(ctx, ridgeImg);

  // 2. Chuyển sang không gian mặt đất thế giới nghiêng 2.5D (khớp chính xác `worldToScreen`)
  ctx.save();
  ctx.translate(cam.viewW * 0.5, cam.viewH * 0.5);
  ctx.scale(cam.zoom, cam.zoom * TW_ISO_TILT);
  ctx.translate(-cam.x, -cam.y);

  // Đổ bóng gờ bàn sa bàn chiến thuật quanh bản đồ 3200x2200
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(-18, -14, map.width + 36, map.height + 34);

  // Cắt gọn trong diện tích bản đồ cho lớp nền cơ sở
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, map.width, map.height);
  ctx.clip();

  // Lớp chất liệu đồng cỏ gốc (Pingyuan Grass)
  if (grassPattern) {
    ctx.save();
    const tileScale = 0.88;
    ctx.scale(tileScale, tileScale);
    ctx.fillStyle = grassPattern;
    ctx.fillRect(0, 0, map.width / tileScale, map.height / tileScale);
    ctx.restore();
  } else {
    ctx.fillStyle = theme.fallbackGrass;
    ctx.fillRect(0, 0, map.width, map.height);
  }

  // Hòa trộn sương giá mùa đông cho Xích Bích / Trường Bản / Quan Độ
  if (theme.frostOverlayAlpha > 0 && frostPattern) {
    ctx.save();
    ctx.globalAlpha = theme.frostOverlayAlpha;
    const frostScale = 0.94;
    ctx.scale(frostScale, frostScale);
    ctx.fillStyle = frostPattern;
    ctx.fillRect(0, 0, map.width / frostScale, map.height / frostScale);
    ctx.restore();
  }

  // Các mảng cỏ thu vàng ấm & trũng cỏ sẫm tự nhiên
  for (let i = 0; i < decor.patches.length; i++) {
    const p = decor.patches[i];
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(p.rx, p.ry);
    const pg = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1);
    pg.addColorStop(0, p.warm ? theme.meadowWarmColor : theme.meadowCoolColor);
    pg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. Đường hành quân & vết bánh chiến xa nối doanh trại và Đài Hiệu Lệnh
  renderBattleRoads(ctx, decor.roads, theme);

  // 4. Vẽ các vùng địa hình theo đúng thứ tự chồng lớp tự nhiên: Đầm lầy -> Sông -> Nền rừng -> Đồi cao
  for (const zone of map.terrainZones) {
    if (zone.kind === 'mud') {
      renderMudZone(ctx, zone, mudPattern);
    }
  }
  for (const zone of map.terrainZones) {
    if (zone.kind === 'river') {
      const ripples = decor.ripplesByZone.get(zone.id) ?? [];
      renderRiverZone(ctx, zone, riverPattern, ripples, timeSec);
    }
  }
  for (const zone of map.terrainZones) {
    if (zone.kind === 'forest') {
      renderForestFloorZone(ctx, zone, forestPattern);
    }
  }
  for (const zone of map.terrainZones) {
    if (zone.kind === 'ridge') {
      renderRidgeZone(ctx, zone, ridgePattern, grassPattern);
    }
  }

  // Vệt đất xém nóng ấm áp dưới các biển lửa Hỏa Công nếu có truyền vào qua `extra`
  if (fires && fires.length > 0) {
    for (let i = 0; i < fires.length; i++) {
      const fz = fires[i];
      if (fz.leftSec <= 0 || fz.radius <= 0) continue;
      const heatAlpha = clamp(fz.intensity, 0.25, 1.35) * (0.28 + 0.08 * Math.sin(timeSec * 7 + fz.id));
      const rOuter = fz.radius * 1.25;
      const scorchGrad = ctx.createRadialGradient(fz.x, fz.y, fz.radius * 0.15, fz.x, fz.y, rOuter);
      scorchGrad.addColorStop(0, `rgba(22, 14, 10, ${clamp(heatAlpha * 1.35, 0, 0.68).toFixed(3)})`);
      scorchGrad.addColorStop(0.62, `rgba(196, 68, 16, ${clamp(heatAlpha * 0.72, 0, 0.42).toFixed(3)})`);
      scorchGrad.addColorStop(1, 'rgba(196, 68, 16, 0)');
      ctx.fillStyle = scorchGrad;
      ctx.beginPath();
      ctx.arc(fz.x, fz.y, rOuter, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. Vòng chiếm giữ Đài Hiệu Lệnh & cung tiến độ phát sáng trên mặt đất
  renderCaptureGroundRings(ctx, map, captures, timeSec);

  // 6. Đường biên giới hạn chiến trường kiểu Total War (cách mép 40 đơn vị)
  const margin = 40;
  ctx.strokeStyle = theme.borderLine;
  ctx.lineWidth = 3.0;
  ctx.setLineDash([26, 14]);
  ctx.strokeRect(margin, margin, map.width - margin * 2, map.height - margin * 2);
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(20, 18, 14, 0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, map.width, map.height);

  ctx.restore(); // Kết thúc clip map.width x map.height
  ctx.restore(); // Kết thúc biến đổi mặt đất thế giới

  // 7. Vẽ các vật thể đứng thẳng 2.5D: tảng đá trên đồi, lều doanh trại, Thành Lũy & Vọng Lâu
  renderUprightTerrainStructures(ctx, map, captures, decor, cam, timeSec);

  // 8. Ánh nắng thu hướng Tây Bắc & lớp tối viền ống kính khí quyển (Atmospheric Vignette)
  const sunGlow = ctx.createRadialGradient(
    cam.viewW * 0.14,
    cam.viewH * 0.12,
    10,
    cam.viewW * 0.18,
    cam.viewH * 0.16,
    Math.max(cam.viewW, cam.viewH) * 0.72,
  );
  sunGlow.addColorStop(0, theme.sunTintNW);
  sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  const outerR = Math.hypot(cam.viewW, cam.viewH) * 0.56;
  const vignette = ctx.createRadialGradient(
    cam.viewW * 0.5,
    cam.viewH * 0.5,
    outerR * 0.52,
    cam.viewW * 0.5,
    cam.viewH * 0.5,
    outerR,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, theme.vignetteEdge);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cam.viewW, cam.viewH);

  ctx.restore();
}

/** Bộ đệm Canvas nháp dùng chung 128x192 (Zero-GC) để nhuộm than hồng & tàn lửa lên đúng mặt nạ lá thông */
let scorchCanopyScratch: HTMLCanvasElement | null = null;
let scorchCanopyCtx: CanvasRenderingContext2D | null = null;

function getScorchCanopyContext(): CanvasRenderingContext2D | null {
  if (scorchCanopyCtx) return scorchCanopyCtx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  scorchCanopyScratch = c;
  scorchCanopyCtx = c.getContext('2d');
  return scorchCanopyCtx;
}

/**
 * Dựng tán rừng 120–180 cây Thông Phương Bắc (`pine_tree_1..4.png`) hoặc Khóm Trúc (`bamboo_clump.png` ở Trường Bản):
 * - Phân bố tất định trong các vùng `'forest'` và dọc sườn biên Tây Bắc (tái hiện rừng thông rậm ở Trận Bình Nguyên).
 * - Sắp xếp chuẩn chiều sâu theo `y` (`wy`), đung đưa nhẹ theo gió thu.
 * - Khi phóng gần giao tranh (`cam.zoom` lớn), các tán cây gần trung tâm màn hình tự chuyển bán trong suốt
 *   (`globalAlpha = 0.52`) để người chơi quan sát rõ từng hàng binh sĩ đang phục kích / cận chiến dưới bóng tùng!
 * - Khi truyền `fires`, các cây thông/trúc gần vùng Hỏa Công bừng lên sắc than xém đen & ánh lửa hồng rực lập lòe từ trên cao!
 */
export function renderTwForestCanopy(
  ctx: CanvasRenderingContext2D,
  map: TwMapSpec,
  cam: TwCamera,
  timeSec: number,
  fires?: ReadonlyArray<TwFireZoneFrame> | null,
): void {
  const decor = buildMapDecor(map);
  const trees = decor.trees;
  if (trees.length === 0) return;

  const hasActiveFires = Boolean(fires && fires.length > 0);
  const halfW = cam.viewW * 0.5;
  const halfH = cam.viewH * 0.5;
  const cullPadX = 130 * cam.zoom + 40;
  const cullPadTop = 40;
  const cullPadBottom = 210 * cam.zoom + 50;

  // Hệ số kích hoạt bán trong suốt khi người chơi thu phóng quan sát cận cảnh chiến sự dưới tán thông
  const zoomCutawayFactor = clamp((cam.zoom - 0.72) / 0.30, 0, 1);
  const focusInvRx = 1 / Math.max(120, cam.viewW * 0.33);
  const focusInvRy = 1 / Math.max(100, cam.viewH * 0.35);

  ctx.save();

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    const { sx, sy } = worldToScreen(tree.wx, tree.wy, cam);

    if (
      sx < -cullPadX ||
      sx > cam.viewW + cullPadX ||
      sy < -cullPadTop ||
      sy > cam.viewH + cullPadBottom
    ) {
      continue;
    }

    // Tính cường độ bén lửa / ám khói than hồng nếu cây nằm gần vùng Hỏa Công (`TwFireZoneFrame`)
    let fireHeat = 0;
    if (hasActiveFires && fires) {
      for (let f = 0; f < fires.length; f++) {
        const fz = fires[f];
        if (fz.leftSec <= 0 || fz.radius <= 0) continue;
        const reach = fz.radius * 1.48 + 46;
        const dx = tree.wx - fz.x;
        if (dx > reach || dx < -reach) continue;
        const dy = tree.wy - fz.y;
        if (dy > reach || dy < -reach) continue;
        const distSq = dx * dx + dy * dy;
        if (distSq >= reach * reach) continue;
        const prox = 1 - Math.sqrt(distSq) / reach;
        const heat = clamp(prox * 1.35 * clamp(fz.intensity || 1, 0.4, 1.4), 0, 1);
        if (heat > fireHeat) fireHeat = heat;
      }
    }

    const isBamboo = tree.sprite === 'bamboo_clump.png';
    const baseW = isBamboo ? 96 : 108;
    const baseH = isBamboo ? 138 : 168;
    const drawW = baseW * tree.scale * cam.zoom;
    const drawH = baseH * tree.scale * cam.zoom;

    // Tính độ trong suốt: đạt đúng globalAlpha = 0.52 ở vùng trung tâm màn hình khi phóng gần
    let alpha = 0.96;
    if (zoomCutawayFactor > 0.001) {
      const canopyMidY = sy - drawH * 0.45;
      const ndx = (sx - halfW) * focusInvRx;
      const ndy = (canopyMidY - halfH) * focusInvRy;
      const distNorm = Math.hypot(ndx, ndy);
      if (distNorm < 1.18) {
        const centerWeight = 1 - clamp((distNorm - 0.68) / 0.50, 0, 1);
        const targetCutaway = 0.96 - (0.96 - 0.52) * zoomCutawayFactor * centerWeight;
        alpha = Math.max(0.52, targetCutaway);
      }
    }

    // Nhịp gió thu lay ngọn thông + luồng khí nóng Hỏa Công rung giật tán lá
    const heatTremor =
      fireHeat > 0.02
        ? Math.sin(timeSec * 7.8 + tree.windPhase * 2.1) * 0.022 * fireHeat
        : 0;
    const swayAngle =
      (Math.sin(timeSec * 1.45 + tree.windPhase + tree.wx * 0.0035) * 0.028 +
        Math.sin(timeSec * 2.65 + tree.windPhase * 1.7 + tree.wy * 0.005) * 0.011) *
        tree.windAmp +
      heatTremor;

    const emberFlicker =
      fireHeat > 0.02
        ? 0.72 +
          0.28 *
            Math.sin(timeSec * 10.4 + tree.windPhase * 2.7) *
            Math.cos(timeSec * 6.1 + tree.wx * 0.03)
        : 0;

    // Bóng râm tán thông ngả về hướng Đông Nam trên mặt đất (pha ánh đỏ cam khi rừng bốc cháy)
    ctx.globalAlpha = alpha * (0.24 + fireHeat * 0.14);
    ctx.fillStyle = fireHeat > 0.35 ? '#24130c' : '#121a12';
    ctx.beginPath();
    ctx.ellipse(
      sx + drawW * 0.16,
      sy + drawH * 0.02,
      drawW * 0.34,
      drawW * 0.22 * TW_ISO_TILT,
      0.22,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    if (fireHeat > 0.04) {
      ctx.globalAlpha = alpha * fireHeat * 0.36 * emberFlicker;
      const baseGlow = ctx.createRadialGradient(sx, sy - drawH * 0.18, 2, sx, sy - drawH * 0.18, drawW * 0.56);
      baseGlow.addColorStop(0, 'rgba(255, 168, 42, 0.88)');
      baseGlow.addColorStop(0.55, 'rgba(235, 68, 18, 0.45)');
      baseGlow.addColorStop(1, 'rgba(180, 36, 12, 0)');
      ctx.fillStyle = baseGlow;
      ctx.beginPath();
      ctx.arc(sx, sy - drawH * 0.18, drawW * 0.56, 0, Math.PI * 2);
      ctx.fill();
    }

    const img = getTwStructureImg(tree.sprite);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    ctx.rotate(swayAngle);
    if (tree.flipX) {
      ctx.scale(-1, 1);
    }

    if (isImgReady(img)) {
      // Gốc thân cây trong ảnh 128x192 / 112x160 nằm ở khoảng 93% chiều cao từ đỉnh xuống
      ctx.drawImage(img, -drawW * 0.5, -drawH * 0.93, drawW, drawH);

      // Phủ mặt nạ Than Đen Ám Khói + Lửa Than Hồng lập lòe khớp 100% từng nhánh tùng/trúc
      if (fireHeat > 0.03) {
        const tCtx = getScorchCanopyContext();
        if (tCtx && scorchCanopyScratch) {
          const sw = scorchCanopyScratch.width;
          const sh = scorchCanopyScratch.height;
          tCtx.globalCompositeOperation = 'source-over';
          tCtx.clearRect(0, 0, sw, sh);
          tCtx.drawImage(img, 0, 0, sw, sh);

          tCtx.globalCompositeOperation = 'source-atop';
          const tintGrad = tCtx.createLinearGradient(0, 0, 0, sh);
          tintGrad.addColorStop(0, `rgba(24, 18, 15, ${(0.72 * fireHeat).toFixed(3)})`);
          tintGrad.addColorStop(
            0.46,
            `rgba(186, 56, 14, ${(0.62 * fireHeat * emberFlicker).toFixed(3)})`,
          );
          tintGrad.addColorStop(
            0.78,
            `rgba(255, 132, 24, ${(0.76 * fireHeat * emberFlicker).toFixed(3)})`,
          );
          tintGrad.addColorStop(
            1,
            `rgba(255, 212, 72, ${(0.68 * fireHeat * emberFlicker).toFixed(3)})`,
          );
          tCtx.fillStyle = tintGrad;
          tCtx.fillRect(0, 0, sw, sh);

          ctx.globalAlpha = alpha * clamp(fireHeat * 0.95, 0, 0.92);
          ctx.drawImage(scorchCanopyScratch, -drawW * 0.5, -drawH * 0.93, drawW, drawH);
        } else {
          // Dự phòng không có DOM Offscreen: quầng lửa nón ôm tán lá
          const coneGrad = ctx.createLinearGradient(0, -drawH * 0.9, 0, -drawH * 0.1);
          coneGrad.addColorStop(0, `rgba(28, 20, 16, ${(0.55 * fireHeat).toFixed(3)})`);
          coneGrad.addColorStop(1, `rgba(255, 118, 22, ${(0.58 * fireHeat * emberFlicker).toFixed(3)})`);
          ctx.fillStyle = coneGrad;
          ctx.beginPath();
          ctx.moveTo(0, -drawH * 0.92);
          ctx.lineTo(drawW * 0.4, -drawH * 0.16);
          ctx.lineTo(-drawW * 0.4, -drawH * 0.16);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else {
      // Bóng dáng cây thông dự phòng mượt mà khi ảnh đang tải khung đầu
      ctx.fillStyle = fireHeat > 0.3 ? '#291810' : '#3b2b1e';
      ctx.fillRect(-drawW * 0.05, -drawH * 0.18, drawW * 0.1, drawH * 0.18);
      for (let tier = 0; tier < 3; tier++) {
        const tierTop = -drawH * (0.92 - tier * 0.22);
        const tierBot = -drawH * (0.46 - tier * 0.16);
        const halfSpan = drawW * (0.22 + tier * 0.1);
        ctx.fillStyle =
          fireHeat > 0.25
            ? tier === 0
              ? '#2b201b'
              : tier === 1
                ? '#9c3611'
                : '#e86f1c'
            : isBamboo
              ? '#3c683d'
              : '#263d2d';
        ctx.beginPath();
        ctx.moveTo(0, tierTop);
        ctx.lineTo(halfSpan, tierBot);
        ctx.lineTo(-halfSpan, tierBot);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Đốm tàn lửa đỏ cam bay lượn quanh ngọn tùng đang cháy rực
    if (fireHeat > 0.22) {
      const sparkCount = fireHeat > 0.6 ? 3 : 2;
      for (let sp = 0; sp < sparkCount; sp++) {
        const cyc = (timeSec * (0.95 + sp * 0.28) + tree.windPhase + sp * 0.33) % 1;
        const spX = Math.sin(timeSec * 4.2 + tree.windPhase + sp * 2.4) * drawW * 0.26;
        const spY = -drawH * (0.28 + cyc * 0.68);
        ctx.globalAlpha = alpha * fireHeat * (1 - cyc) * 0.9;
        ctx.fillStyle = sp % 2 === 0 ? '#ffd43b' : '#ff6b35';
        ctx.beginPath();
        ctx.arc(spX, spY, Math.max(1.1, 2.0 * cam.zoom), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  ctx.restore();
}
