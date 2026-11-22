/**
 * Sân khấu trận đấu 3D (three.js, kiểu HD-2D): mặt đất và vách nền dựng từ ảnh nền trận, nhân vật và quái là sprite
 * pixel đứng trong không gian có bóng đổ. Camera đổi góc theo lượt:
 *  - Tổng quan: sau lưng đội hình, cao, thấy toàn trận.
 *  - Lượt người chơi: ra sau vai nhân vật đang chọn lệnh, nhìn thẳng về quái đang nhắm.
 *  - Nhân vật ra đòn: bám theo sau lưng khi lao vào.
 *  - Quái tấn công: nằm sau nhân vật bị nhắm, nhìn về quái đang lao tới để canh Đỡ / Né.
 * Va chạm: bóng mờ lưu ảnh khi lao, bụi dưới chân, mục tiêu giật lùi + lóe đỏ, tia nổ, rung camera.
 *
 * Toạ độ: điểm (x, y) trên canvas 2D gốc 780×360 ánh xạ thành (X, 0, Z) trên mặt đất; trục y canvas (xuống = gần)
 * thành trục Z (dương = gần camera). Lớp phủ 2D (thanh máu, số sát thương …) được chiếu lại qua `project()`.
 */

import * as THREE from 'three';
import { HERO_CHOREO, supportCastFx, type ChoreoFx, type ChoreoProjectile, type ChoreoTime, type DebrisStyle } from './hero-choreo';

/** Mảnh vụn theo nguyên tố: màu, trọng lực (âm = bay lên), có phát sáng không. */
const DEBRIS: Record<DebrisStyle, { colors: number[]; gravity: number; glow: boolean; size: number }> = {
  leaves: { colors: [0x7ccf5a, 0xa8e070, 0x4fa84a, 0xd8f5a0], gravity: 1.6, glow: false, size: 0.13 },
  shards: { colors: [0xf2fdff, 0xbfeaff, 0x8fd4ff], gravity: 7, glow: true, size: 0.11 },
  glints: { colors: [0xfff3c0, 0xffd36a, 0xffffff], gravity: -0.4, glow: true, size: 0.1 },
  droplets: { colors: [0x8fe0ff, 0x5fc0ff, 0xdaf6ff], gravity: 8, glow: false, size: 0.11 },
  embers: { colors: [0xffb347, 0xff7a3a, 0xffe08a], gravity: -1.4, glow: true, size: 0.1 },
  stars: { colors: [0xe6d4ff, 0xc08cff, 0xffffff], gravity: 0.3, glow: true, size: 0.1 },
};
import { BATTLE_CANVAS_H, BATTLE_CANVAS_W, type Battle3DView, type BattleVisualState, type UnitPose } from './battleRenderer';
import { getCachedArenaAtlas, getCachedImage, loadArenaAtlas, loadExpeditionImage, type ArenaPropAtlas } from './store';

/** Bố cục đạo cụ quanh sân (toạ độ thế giới). Chừa trống phía trước-trái nơi camera đi qua (x −12..8, z −1..16). */
const ARENA_LAYOUT: Record<string, { name: string; x: number; z: number; s?: number }[]> = {
  '01-dawn-meadow': [
    { name: 'arch', x: 1, z: -14 },
    { name: 'pillar', x: -7, z: -11 },
    { name: 'pillar', x: 9.5, z: -9.5 },
    { name: 'pillar_broken', x: 12.5, z: -3 },
    { name: 'pillar_broken', x: -12, z: -7 },
    { name: 'pillar', x: 15, z: 5 },
    { name: 'rocks', x: 6, z: -8.5 },
    { name: 'rocks', x: -4, z: -9.5, s: 1.3 },
    { name: 'rocks', x: 12, z: 3 },
    { name: 'rocks', x: -15, z: -12, s: 1.6 },
    { name: 'bush', x: -9, z: -8 },
    { name: 'bush', x: 4.5, z: -11.5 },
    { name: 'bush', x: 13.5, z: -0.5, s: 1.2 },
    { name: 'bush', x: 10.5, z: -13 },
    { name: 'bush', x: -1.5, z: -16, s: 1.4 },
    { name: 'bush', x: 17, z: 9 },
  ],
  '02-everfrost-peaks': [
    { name: 'arch', x: -2, z: -15, s: 1.1 },
    { name: 'pillar', x: -9, z: -12 },
    { name: 'pillar', x: 5, z: -12.5 },
    { name: 'pillar_broken', x: -14, z: -6 },
    { name: 'pillar', x: 11, z: -7, s: 0.9 },
    { name: 'pillar_broken', x: 15, z: -1 },
    { name: 'rocks', x: 9, z: -10, s: 1.8 },
    { name: 'rocks', x: -6, z: -14, s: 1.4 },
    { name: 'rocks', x: 16, z: 6, s: 2 },
    { name: 'rocks', x: -17, z: -10, s: 2.2 },
    { name: 'rocks', x: 3, z: -17, s: 1.5 },
    { name: 'bush', x: -11, z: -9 },
    { name: 'bush', x: 7, z: -15 },
    { name: 'bush', x: 13, z: -11, s: 1.2 },
    { name: 'bush', x: 18, z: 3 },
  ],
  '03-sunken-dunes': [
    { name: 'arch', x: -6, z: -13, s: 1.05 },
    { name: 'pillar_broken', x: -12, z: -9, s: 1.2 },
    { name: 'pillar_broken', x: 2, z: -11 },
    { name: 'pillar', x: 8, z: -13, s: 1.1 },
    { name: 'pillar_broken', x: 13, z: -5, s: 1.3 },
    { name: 'pillar', x: 16, z: 4 },
    { name: 'pillar_broken', x: -16, z: -3 },
    { name: 'rocks', x: 4, z: -7.5, s: 1.4 },
    { name: 'rocks', x: -1, z: -15, s: 1.8 },
    { name: 'rocks', x: 11, z: 1.5, s: 1.2 },
    { name: 'rocks', x: -14, z: -14, s: 2 },
    { name: 'rocks', x: 18, z: -9, s: 1.6 },
    { name: 'bush', x: -8, z: -7, s: 0.8 },
    { name: 'bush', x: 10, z: -10, s: 0.9 },
    { name: 'bush', x: 15, z: 8, s: 0.8 },
  ],
  '04-abyssal-sanctum': [
    { name: 'arch', x: 1, z: -15, s: 1.15 },
    { name: 'pillar', x: -6, z: -13 },
    { name: 'pillar', x: 8, z: -13 },
    { name: 'pillar', x: -11, z: -8.5 },
    { name: 'pillar', x: 13, z: -8 },
    { name: 'pillar', x: 15, z: -1 },
    { name: 'pillar_broken', x: 16, z: 6 },
    { name: 'pillar_broken', x: -15, z: -11 },
    { name: 'rocks', x: -3, z: -10, s: 1.2 },
    { name: 'rocks', x: 5, z: -9.5 },
    { name: 'rocks', x: 12, z: 4, s: 1.4 },
    { name: 'rocks', x: -17, z: -6, s: 1.8 },
    { name: 'bush', x: -9, z: -15, s: 1.3 },
    { name: 'bush', x: 4, z: -17, s: 1.2 },
    { name: 'bush', x: 11, z: -14 },
    { name: 'bush', x: 17, z: 10, s: 1.3 },
  ],
  '05-cinder-caldera': [
    { name: 'arch', x: 4, z: -14, s: 0.95 },
    { name: 'pillar_broken', x: -7, z: -12, s: 1.4 },
    { name: 'pillar_broken', x: 10, z: -10, s: 1.2 },
    { name: 'pillar', x: -12, z: -7 },
    { name: 'pillar_broken', x: 14, z: -3, s: 1.5 },
    { name: 'rocks', x: -2, z: -11, s: 2 },
    { name: 'rocks', x: 7, z: -16, s: 2.2 },
    { name: 'rocks', x: 13, z: 3, s: 2.4 },
    { name: 'rocks', x: -15, z: -13, s: 2.6 },
    { name: 'rocks', x: 17, z: -12, s: 2 },
    { name: 'rocks', x: -9, z: -16, s: 1.6 },
    { name: 'bush', x: 2, z: -8.5, s: 0.8 },
    { name: 'bush', x: -13, z: -3, s: 0.9 },
    { name: 'bush', x: 16, z: 9, s: 0.9 },
  ],
  '06-nocturne-veil': [
    { name: 'arch', x: -1, z: -16, s: 1.1 },
    { name: 'pillar', x: -8, z: -12, s: 0.95 },
    { name: 'pillar', x: 7, z: -11 },
    { name: 'pillar_broken', x: 12, z: -5 },
    { name: 'pillar_broken', x: -13, z: -9 },
    { name: 'bush', x: -4, z: -11, s: 1.3 },
    { name: 'bush', x: 3, z: -13, s: 1.4 },
    { name: 'bush', x: 10, z: -14, s: 1.5 },
    { name: 'bush', x: -11, z: -14, s: 1.6 },
    { name: 'bush', x: 14, z: -9, s: 1.3 },
    { name: 'bush', x: 16, z: 1, s: 1.4 },
    { name: 'bush', x: 18, z: 8, s: 1.5 },
    { name: 'bush', x: -16, z: -5, s: 1.4 },
    { name: 'rocks', x: 5, z: -8, s: 1.1 },
    { name: 'rocks', x: 13, z: 5, s: 1.3 },
  ],
  '07-aurora-zenith': [
    { name: 'arch', x: 1, z: -16, s: 1.3 },
    { name: 'pillar', x: -9, z: -13, s: 1.2 },
    { name: 'pillar', x: -4, z: -15, s: 1.1 },
    { name: 'pillar', x: 6, z: -15, s: 1.1 },
    { name: 'pillar', x: 11, z: -12, s: 1.2 },
    { name: 'pillar', x: 15, z: -6, s: 1.1 },
    { name: 'pillar', x: 17, z: 2, s: 1.1 },
    { name: 'pillar_broken', x: -14, z: -9 },
    { name: 'rocks', x: -1, z: -11, s: 1.2 },
    { name: 'rocks', x: 9, z: -8.5 },
    { name: 'rocks', x: 14, z: 6, s: 1.3 },
    { name: 'rocks', x: -17, z: -14, s: 1.5 },
    { name: 'bush', x: 4, z: -11, s: 0.9 },
    { name: 'bush', x: -12, z: -16, s: 1.1 },
  ],
};

/** Cỏ cao rải ngẫu nhiên (tất định) quanh vành sân, tránh vùng camera. */
function grassTufts(seed: number): { name: string; x: number; z: number; s?: number }[] {
  let st = seed;
  const rnd = () => ((st = (st * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: { name: string; x: number; z: number; s?: number }[] = [];
  while (out.length < 46) {
    const a = rnd() * Math.PI * 2;
    const r = 7.5 + rnd() * 12;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 1;
    if (x > -13 && x < 9 && z > -2) continue;
    out.push({ name: 'tallgrass', x, z, s: 0.8 + rnd() * 0.6 });
  }
  return out;
}
import type { BattleSessionState } from './shared';

const WPC = 0.022; // đơn vị thế giới trên 1 px canvas (ngang, chiều cao sprite)
const WZ = 0.075; // chiều sâu: canvas y → Z
const HEAD = 1.7;

function toWorld(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set((x - BATTLE_CANVAS_W / 2) * WPC, 0, (y - 240) * WZ);
}

function radialTexture(inner: string, outer: string, size = 64): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const len = i % 2 ? 40 : 62;
    g.beginPath();
    g.moveTo(Math.cos(a - 0.08) * 8, Math.sin(a - 0.08) * 8);
    g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    g.lineTo(Math.cos(a + 0.08) * 8, Math.sin(a + 0.08) * 8);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface UnitView {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  tex: THREE.Texture | null;
  sheet: string;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  ghosts: THREE.Sprite[];
  trail: { pos: THREE.Vector3; at: number }[];
  wasMoving: boolean;
  pos: THREE.Vector3;
  recoil: THREE.Vector3;
  recoilUntil: number;
  flashUntil: number;
  lastHp: number;
}

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  born: number;
  life: number;
  grow: number;
  gravity?: number;
  /** cỡ ban đầu (mặc định 0.5) */
  base?: number;
}

interface GroundRing { mesh: THREE.Mesh; born: number; life: number; size: number }

const ELEMENT_FX: Record<string, number> = {
  Verdant: 0x8dffb0, Frost: 0xa8e4ff, Solar: 0xffe07a, Tide: 0x6fe7ff, Pyre: 0xff8a4c, Astral: 0xd59bff,
};

function crescentTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(1, 'rgba(255,255,255,0.2)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 58, Math.PI * 1.05, Math.PI * 1.95);
  g.arc(64, 78, 50, Math.PI * 1.9, Math.PI * 1.1, true);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type ShotKind = 'wide' | 'command' | 'skills' | 'items' | 'aim' | 'attack' | 'defend' | 'counter';
const CAMERA_CLOSE = {
  command: { back: 5.5, side: 1.85, up: 2.85, mix: .64, fov: 41 },
  skills: { back: 5.05, side: 2.14, up: 3.06, mix: .70, fov: 39 },
  items: { back: 5.3, side: 1.9, up: 3.08, mix: .64, fov: 41 },
  aim: { back: 5.15, side: 1.72, up: 2.75, mix: .78, fov: 38 },
  attack: { back: 4.2, side: 3.25, up: 2.6, mix: .82, fov: 42 },
  defend: { back: 4.95, side: 1.9, up: 2.66, mix: .69, fov: 42 },
  counter: { back: 4.65, side: -2.9, up: 2.6, mix: .79, fov: 42 },
} as const;

const smooth = (t: number) => t*t*(3-2*t);

interface AmbientSpec {
  count: number; color: number; size: number; opacity: number; height: number;
  drift: [number, number, number]; sway: number; wobble: number; glow?: boolean; twinkle?: boolean;
}
/** Hạt môi trường từng vùng: phấn hoa, tuyết, cát bay, bong bóng, tàn lửa, đom đóm, bụi cực quang. */
const AMBIENT: Record<string, AmbientSpec> = {
  '01-dawn-meadow': { count: 110, color: 0xfff3b0, size: 0.13, opacity: 0.85, height: 7, drift: [0.35, 0.05, 0.1], sway: 0.5, wobble: 1.1, glow: true },
  '02-everfrost-peaks': { count: 340, color: 0xffffff, size: 0.12, opacity: 0.9, height: 12, drift: [0.4, -1.3, 0.25], sway: 0.6, wobble: 1.4 },
  '03-sunken-dunes': { count: 260, color: 0xe8c98a, size: 0.08, opacity: 0.7, height: 4, drift: [3.2, 0.15, 0.4], sway: 0.3, wobble: 2.2 },
  '04-abyssal-sanctum': { count: 150, color: 0xa8f0ff, size: 0.16, opacity: 0.55, height: 11, drift: [0, 0.9, 0], sway: 0.35, wobble: 1.6, glow: true },
  '05-cinder-caldera': { count: 200, color: 0xff8a3c, size: 0.12, opacity: 0.95, height: 10, drift: [0.3, 1.1, -0.1], sway: 0.7, wobble: 1.8, glow: true, twinkle: true },
  '06-nocturne-veil': { count: 90, color: 0xc8ff7a, size: 0.17, opacity: 0.9, height: 5, drift: [0.1, 0.05, 0.1], sway: 0.9, wobble: 0.8, glow: true, twinkle: true },
  '07-aurora-zenith': { count: 180, color: 0xc9a8ff, size: 0.14, opacity: 0.85, height: 12, drift: [0.15, 0.35, 0], sway: 0.6, wobble: 0.9, glow: true, twinkle: true },
};

export class Battle3DStage implements Battle3DView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  private readonly units = new Map<string, UnitView>();
  private readonly baseTex = new Map<string, THREE.Texture>();
  private readonly particles: Particle[] = [];
  private readonly shadowTex = radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)');
  private readonly dustTex = radialTexture('rgba(222,205,170,0.9)', 'rgba(222,205,170,0)');
  private readonly burstTex = starTexture();
  private readonly ambientTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32);
  private stageBuiltFor = '';
  private arena: { map: string; status: 'loading' | 'ready' | 'missing' } | null = null;
  private disposed = false;
  private camPos = new THREE.Vector3(0, 8, 16);
  private camLook = new THREE.Vector3(0, 1, -1);
  private camFov = 40;
  private shotKey = '';
  private shotAt = 0;
  private shotDuration = 0;
  private openedAt = -1;
  private readonly fromPos = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private fromFov = 40;
  private readonly targetPos = new THREE.Vector3();
  private readonly targetLook = new THREE.Vector3();
  private readonly focusActor = new THREE.Vector3();
  private readonly focusTarget = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly screenRight = new THREE.Vector3();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private projectionDirty = true;
  private readonly stageTextures = new Set<THREE.Texture>();
  private lastNow = 0;
  private ambient: { points: THREE.Points; vel: Float32Array; phase: Float32Array; spec: AmbientSpec } | null = null;
  private shakeUntil = 0;
  private shakeAmp = 0;
  private lastBeatSeen = -1;
  private lastResponseAt = -1;
  private readonly rings: GroundRing[] = [];
  private readonly slashTex = crescentTexture();
  private readonly glint = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  private readonly bolts: THREE.Sprite[] = [];
  private lastTrailAt = 0;
  private choreoEmitAt = 0;
  private lastPlaybackAt = -1;
  private width = 0;
  private height = 0;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x07070a, 1);
    this.scene.fog = new THREE.Fog(0x0b0c0a, 22, 60);
  }

  // ------------------------------------------------------------------ stage (ground + back walls from the backdrop painting)
  // ------------------------------------------------------------------ arena (bộ texture vẽ riêng cho từng vùng)
  private ensureArena(session: BattleSessionState): void {
    if (this.arena?.map === session.mapId) return;
    const map = session.mapId;
    this.arena = { map, status: 'loading' };
    const base = `battle-scenes/${map}/arena/`;
    const ground = getCachedImage(`${base}ground.png`);
    const floor = getCachedImage(`${base}floor.png`);
    const panorama = getCachedImage(`${base}panorama.png`);
    const props = getCachedImage(`${base}props.png`);
    const atlas = getCachedArenaAtlas(map);
    if (ground && floor && panorama && props && atlas) {
      this.buildArena(map, ground, floor, panorama, props, atlas);
      this.arena.status = 'ready';
      return;
    }
    void Promise.all([
      loadExpeditionImage(`${base}ground.png`),
      loadExpeditionImage(`${base}floor.png`),
      loadExpeditionImage(`${base}panorama.png`),
      loadExpeditionImage(`${base}props.png`),
      loadArenaAtlas(map),
    ]).then(([ground, floor, pano, props, atlas]) => {
      if (this.disposed || this.arena?.map !== map) return;
      this.buildArena(map, ground, floor, pano, props, atlas);
      this.arena.status = 'ready';
    }).catch(() => {
      if (this.arena?.map === map) this.arena.status = 'missing';
    });
  }

  private pixelTex(img: HTMLImageElement, repeat = false): THREE.Texture {
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    this.stageTextures.add(t);
    return t;
  }

  private clearStage(): void {
    const materials = new Set<THREE.Material>();
    for (const object of [...this.scene.children]) {
      if (!object.userData.stage) continue;
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) materials.add(material);
      }
      if (object instanceof THREE.Mesh) object.geometry.dispose();
      if (object instanceof THREE.Points) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
      this.scene.remove(object);
    }
    for (const material of materials) material.dispose();
    for (const texture of this.stageTextures) texture.dispose();
    this.stageTextures.clear();
  }

  private buildArena(map: string, groundImg: HTMLImageElement, floorImg: HTMLImageElement, panoImg: HTMLImageElement,
    propsImg: HTMLImageElement, atlas: ArenaPropAtlas): void {
    this.clearStage();
    const add = (o: THREE.Object3D) => { o.userData.stage = true; this.scene.add(o); return o; };
    // màu sương = màu rừng xa trên panorama, màu nền trời = đỉnh panorama
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const pc = probe.getContext('2d')!;
    pc.drawImage(panoImg, 0, panoImg.height * 0.62, panoImg.width, panoImg.height * 0.06, 0, 0, 1, 1);
    const [fr, fg, fb] = pc.getImageData(0, 0, 1, 1).data;
    pc.drawImage(panoImg, 0, 0, panoImg.width, 4, 0, 0, 1, 1);
    const [sr, sg, sb] = pc.getImageData(0, 0, 1, 1).data;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setRGB(fr / 255, fg / 255, fb / 255, THREE.SRGBColorSpace);
    fog.near = 30;
    fog.far = 95;
    this.renderer.setClearColor(new THREE.Color().setRGB(sr / 255, sg / 255, sb / 255, THREE.SRGBColorSpace), 1);

    // mặt đất: lát texture cỏ, mỗi ô 256 px ≈ 6 đơn vị
    const gTex = this.pixelTex(groundImg, true);
    const GROUND = 150;
    gTex.repeat.set(GROUND / 6, GROUND / 6);
    const ground = add(new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.MeshBasicMaterial({ map: gTex })));
    ground.rotation.x = -Math.PI / 2;

    // nền sân đấu giữa (cỏ mòn, vệt đất)
    const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(19, 19),
      new THREE.MeshBasicMaterial({ map: this.pixelTex(floorImg), alphaTest: 0.5 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(-0.3, 0.012, -0.6);

    // panorama 360°: vòng trụ quấn quanh sân, giữ đúng tỉ lệ điểm ảnh
    const R = 44;
    const H = (2 * Math.PI * R) * (panoImg.height / panoImg.width);
    // chân bụi cây trên panorama (≈ 88% chiều cao ảnh) đặt đúng mặt đất, dải cỏ phía dưới chìm xuống đất
    const pTex = this.pixelTex(panoImg, true);
    const pano = add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: pTex, side: THREE.BackSide, fog: false })));
    pano.position.set(-0.5, H / 2 - H * 0.12, -1);
    if (map === '01-dawn-meadow') pano.rotation.y = -Math.PI * .30;

    // đạo cụ đứng (billboard) + bóng đổ
    const base = this.pixelTex(propsImg);
    base.minFilter = THREE.NearestFilter;
    base.generateMipmaps = false;
    const frames = new Map(atlas.frames.map((f) => [f.name, f]));
    const propMaterials = new Map<string, THREE.SpriteMaterial>();
    const layout = [...(ARENA_LAYOUT[map] ?? ARENA_LAYOUT['01-dawn-meadow']), ...grassTufts([...map].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) % 100000 + 13)];
    for (const item of layout) {
      const f = frames.get(item.name);
      if (!f) continue;
      let material = propMaterials.get(f.name);
      if (!material) {
        const tex = base.clone();
        tex.needsUpdate = true;
        tex.repeat.set(f.w / atlas.width, f.h / atlas.height);
        tex.offset.set(f.x / atlas.width, 1 - (f.y + f.h) / atlas.height);
        this.stageTextures.add(tex);
        material = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, fog: true });
        propMaterials.set(f.name, material);
      }
      const h = f.worldH * (item.s ?? 1);
      const sprite = new THREE.Sprite(material);
      sprite.center.set(0.5, 0);
      sprite.scale.set(h * (f.w / f.h), h, 1);
      sprite.position.set(item.x, 0, item.z);
      add(sprite);
      if (h > 1.4) {
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.45 }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(item.x, 0.015, item.z);
        shadow.scale.set(h * (f.w / f.h) * 0.9, h * 0.25, 1);
        add(shadow);
      }
    }

    // hạt môi trường theo vùng (bay lượn quanh sân)
    const spec = AMBIENT[map] ?? AMBIENT['01-dawn-meadow'];
    const n = this.reducedMotion.matches ? Math.round(spec.count / 3) : spec.count;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 44;
      pos[i * 3 + 1] = Math.random() * spec.height;
      pos[i * 3 + 2] = -22 + Math.random() * 34;
      vel[i * 3] = spec.drift[0] * (0.6 + Math.random() * 0.8);
      vel[i * 3 + 1] = spec.drift[1] * (0.6 + Math.random() * 0.8);
      vel[i * 3 + 2] = spec.drift[2] * (0.6 + Math.random() * 0.8);
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: spec.color, size: spec.size, map: this.ambientTex, transparent: true, depthWrite: false, opacity: spec.opacity,
      blending: spec.glow ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, fog: false,
    });
    const points = new THREE.Points(geo, mat);
    add(points);
    this.ambient = { points, vel, phase, spec };
  }

  private updateAmbient(now: number, dt: number): void {
    const a = this.ambient;
    if (!a || !a.points.parent) return;
    const attr = a.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    const { spec, vel, phase } = a;
    for (let i = 0; i < phase.length; i++) {
      const w = Math.sin(now / 1000 * spec.wobble + phase[i]);
      p[i * 3] += (vel[i * 3] + w * spec.sway) * dt;
      p[i * 3 + 1] += vel[i * 3 + 1] * dt;
      p[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0) p[i * 3 + 1] += spec.height;
      if (p[i * 3 + 1] > spec.height) p[i * 3 + 1] -= spec.height;
      if (p[i * 3] > 22) p[i * 3] -= 44;
      if (p[i * 3] < -22) p[i * 3] += 44;
      if (p[i * 3 + 2] > 12) p[i * 3 + 2] -= 34;
      if (p[i * 3 + 2] < -22) p[i * 3 + 2] += 34;
    }
    attr.needsUpdate = true;
    if (spec.twinkle) (a.points.material as THREE.PointsMaterial).opacity = spec.opacity * (0.75 + 0.25 * Math.sin(now / 340));
  }

  private buildStage(session: BattleSessionState): void {
    const path = `battle-scenes/${session.mapId}/backdrop.png`;
    if (this.stageBuiltFor === path) return;
    const img = getCachedImage(path);
    if (!img) return;
    this.stageBuiltFor = path;
    this.clearStage();
    // màu sương lấy từ dải giữa ảnh nền
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    const pc = probe.getContext('2d')!;
    pc.drawImage(img, 0, img.height * 0.4, img.width, img.height * 0.3, 0, 0, 1, 1);
    const [r, g, b] = pc.getImageData(0, 0, 1, 1).data;
    const fogColor = new THREE.Color(`rgb(${r},${g},${b})`).multiplyScalar(0.55);
    (this.scene.fog as THREE.Fog).color.copy(fogColor);
    this.renderer.setClearColor(fogColor, 1);

    // mặt đất: dải dưới của ảnh nền, lặp kiểu soi gương để không lộ đường nối
    const groundSrc = document.createElement('canvas');
    groundSrc.width = img.width;
    groundSrc.height = Math.round(img.height * 0.3);
    groundSrc.getContext('2d')!.drawImage(img, 0, img.height * 0.7, img.width, img.height * 0.3, 0, 0, groundSrc.width, groundSrc.height);
    const groundTex = new THREE.CanvasTexture(groundSrc);
    this.stageTextures.add(groundTex);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    groundTex.wrapS = groundTex.wrapT = THREE.MirroredRepeatWrapping;
    groundTex.repeat.set(3, 6);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ map: groundTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.stage = true;
    this.scene.add(ground);

    const wallTex = new THREE.Texture(img);
    this.stageTextures.add(wallTex);
    wallTex.colorSpace = THREE.SRGBColorSpace;
    wallTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    wallTex.needsUpdate = true;
    const wallW = 46;
    const wallH = wallW * (img.height / img.width);
    const wallMat = new THREE.MeshBasicMaterial({ map: wallTex });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), wallMat);
    back.position.set(2, wallH / 2 - 3.2, -16);
    back.userData.stage = true;
    this.scene.add(back);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), wallMat);
    side.position.set(22, wallH / 2 - 3.2, 4);
    side.rotation.y = -Math.PI / 2;
    side.userData.stage = true;
    this.scene.add(side);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(wallW, wallH), wallMat);
    left.position.set(-20, wallH / 2 - 3.2, 2);
    left.rotation.y = Math.PI / 2;
    left.userData.stage = true;
    this.scene.add(left);
  }

  // ------------------------------------------------------------------ units
  private texFor(path: string): THREE.Texture | null {
    const cached = this.baseTex.get(path);
    if (cached) return cached;
    const img = getCachedImage(path);
    if (!img) return null;
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.baseTex.set(path, t);
    return t;
  }

  private unitView(uid: string): UnitView {
    let u = this.units.get(uid);
    if (u) return u;
    const mat = new THREE.SpriteMaterial({ alphaTest: 0.5, fog: true });
    const sprite = new THREE.Sprite(mat);
    this.scene.add(sprite);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 1;
    this.scene.add(shadow);
    const ghosts = Array.from({ length: 3 }, () => {
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.02, color: 0xbfd8ff }));
      g.visible = false;
      this.scene.add(g);
      return g;
    });
    u = {
      sprite, mat, tex: null, sheet: '', shadow, ghosts, trail: [], wasMoving: false, pos: new THREE.Vector3(),
      recoil: new THREE.Vector3(), recoilUntil: 0, flashUntil: 0, lastHp: -1,
    };
    this.units.set(uid, u);
    return u;
  }

  private dust(at: THREE.Vector3, now: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dustTex, transparent: true, depthWrite: false, opacity: 0.8 }));
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.15, (Math.random() - 0.5) * 0.6));
      s.scale.setScalar(0.5);
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ sprite: s, vel: new THREE.Vector3(Math.cos(a) * spread, 0.5 + Math.random() * 0.6, Math.sin(a) * spread), born: now, life: 420 + Math.random() * 200, grow: 1.8 });
    }
  }

  /** Sóng chấn động lan trên mặt đất. */
  private ring(at: THREE.Vector3, now: number, color: number, size: number, life = 380): void {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.04, at.z);
    mesh.scale.setScalar(0.2);
    this.scene.add(mesh);
    this.rings.push({ mesh, born: now, life, size });
  }

  /** Vệt chém lưỡi liềm xoay ngẫu nhiên tại điểm trúng đòn. */
  private slash(at: THREE.Vector3, now: number, color: number, big: boolean): void {
    const mat = new THREE.SpriteMaterial({ map: this.slashTex, color, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, rotation: (Math.random() - 0.5) * 1.6 + (Math.random() < 0.5 ? 0 : Math.PI) });
    const s = new THREE.Sprite(mat);
    s.position.copy(at);
    s.scale.setScalar(big ? 1.4 : 1);
    this.scene.add(s);
    this.particles.push({ sprite: s, vel: new THREE.Vector3(), born: now, life: 230, grow: big ? 5 : 3.6 });
  }

  /** Tia lửa toé (Đỡ đòn): hạt nhỏ bay ra rồi rơi. */
  private sparks(at: THREE.Vector3, now: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ambientTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.copy(at);
      s.scale.setScalar(0.12);
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 3.5;
      this.particles.push({ sprite: s, vel: new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp * 0.6),
        born: now, life: 320 + Math.random() * 220, grow: 0.15, gravity: 9, base: 0.14 });
    }
  }

  /** Lá gió: bay toả, rơi chậm. */
  private leaves(at: THREE.Vector3, now: number, count: number, up = 1.5, spread = 1): void {
    const greens = [0x7ccf5a, 0xa8e070, 0x4fa84a, 0xd8f5a0];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ambientTex, color: greens[i % greens.length], transparent: true, depthWrite: false }));
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0.3 + Math.random() * 1.2, (Math.random() - 0.5) * spread * 0.6));
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ sprite: s, vel: new THREE.Vector3(Math.cos(a) * spread * 1.4, up * (0.6 + Math.random() * 0.8), Math.sin(a) * spread),
        born: now, life: 700 + Math.random() * 500, grow: 0.08, gravity: 1.6, base: 0.13 });
    }
  }

  /** Mảnh vụn nguyên tố (băng vỡ, tàn lửa, giọt nước, tia nắng, sao, lá). */
  private debris(at: THREE.Vector3, now: number, style: DebrisStyle, count: number, up = 1.5, spread = 1): void {
    if (style === 'leaves') { this.leaves(at, now, count, up, spread); return; }
    const d = DEBRIS[style];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ambientTex, color: d.colors[i % d.colors.length], transparent: true,
        depthWrite: false, blending: d.glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * spread * 0.6));
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2;
      const sp = 1 + Math.random() * 2;
      this.particles.push({ sprite: s, vel: new THREE.Vector3(Math.cos(a) * sp * spread, up * (0.5 + Math.random() * 0.9), Math.sin(a) * sp * spread * 0.6),
        born: now, life: 500 + Math.random() * 450, grow: 0.06, gravity: d.gravity, base: d.size });
    }
  }

  /** Hạt sáng dâng lên (hào quang tụ lực, pháp trận). */
  private motes(at: THREE.Vector3, now: number, count: number, color: number, rise: number): void {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ambientTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const a = Math.random() * Math.PI * 2;
      s.position.copy(at).add(new THREE.Vector3(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.45));
      this.scene.add(s);
      this.particles.push({ sprite: s, vel: new THREE.Vector3(-Math.cos(a) * 0.3, rise * (0.7 + Math.random() * 0.5), -Math.sin(a) * 0.2),
        born: now, life: 600 + Math.random() * 300, grow: 0.1, gravity: -0.6, base: 0.12 });
    }
  }

  /** Cột gió / ánh sáng đứng thẳng. */
  private pillar(at: THREE.Vector3, now: number, color: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ambientTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.center.set(0.5, 0);
    s.position.set(at.x, 0, at.z);
    s.scale.set(2.2, 12, 1);
    this.scene.add(s);
    this.particles.push({ sprite: s, vel: new THREE.Vector3(), born: now, life: 520, grow: 0, base: 0 });
    // giữ dáng cột: particle loop đặt scale đều, nên dùng thêm vài tia nổ chồng theo chiều cao
    s.userData.pillar = true;
    for (let h = 0; h < 5; h++) this.burst(this.tmp2.set(at.x, 0.6 + h * 1.4, at.z), now + h * 30, color);
  }

  /** Vệt chém với góc + cỡ cho trước (vũ đạo kỹ năng). */
  private slashAt(at: THREE.Vector3, now: number, color: number, rot: number, scale: number): void {
    const mat = new THREE.SpriteMaterial({ map: this.slashTex, color, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, rotation: rot });
    const s = new THREE.Sprite(mat);
    s.position.copy(at);
    this.scene.add(s);
    this.particles.push({ sprite: s, vel: new THREE.Vector3(), born: now, life: 260, grow: 3.4 * scale, base: 0.6 * scale });
  }

  /** Thực thi một hiệu ứng của vũ đạo kỹ năng. */
  private runFx(fx: ChoreoFx, now: number, session: BattleSessionState, actorUid: string, targetUid: string | undefined, support = false): void {
    if (fx.kind === 'shake') { this.shake(now, fx.amp, fx.ms); return; }
    if (fx.kind === 'bolt') return;
    const actor = session.combatants.find((c) => c.unitUid === actorUid);
    const self = this.units.get(actorUid);
    const side = support ? actor?.side : actor?.side === 'party' ? 'enemy' : 'party';
    const group = session.combatants.filter((c) => c.side === side && c.alive).map((c) => this.units.get(c.unitUid)).filter(Boolean) as UnitView[];
    const center = new THREE.Vector3();
    for (const g of group) center.add(g.pos);
    if (group.length) center.multiplyScalar(1 / group.length);
    const one = (targetUid && this.units.get(targetUid)) || group[0];
    const at = (fx as { at: string }).at;
    const spots: THREE.Vector3[] = at === 'self' ? (self ? [self.pos] : [])
      : at === 'targets' ? group.map((g) => g.pos)
      : at === 'center' ? (group.length ? [center] : [])
      : one ? [one.pos] : [];
    for (const p of spots) {
      const pos = p.clone();
      switch (fx.kind) {
        case 'slash': this.slashAt(pos.setY(fx.height ?? HEAD * 0.75), now, fx.color ?? 0xffffff, fx.rot, fx.scale); break;
        case 'ring': this.ring(pos, now, fx.color ?? 0xffffff, fx.size, fx.life); break;
        case 'sparks': this.sparks(pos.setY(HEAD * 0.8), now, fx.color ?? 0xffffff, fx.count); break;
        case 'burst': this.burst(pos.setY(fx.height ?? HEAD * 0.8), now, fx.color ?? 0xffffff); break;
        case 'leaves': this.leaves(pos, now, fx.count, fx.up, fx.spread); break;
        case 'debris': this.debris(pos, now, fx.style, fx.count, fx.up, fx.spread); break;
        case 'motes': this.motes(pos, now, fx.count, fx.color ?? 0xffffff, fx.rise ?? 2); break;
        case 'pillar': this.pillar(pos, now, fx.color ?? 0xffffff); break;
      }
    }
  }

  private burst(at: THREE.Vector3, now: number, color: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.burstTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color }));
    s.position.copy(at);
    s.scale.setScalar(0.6);
    this.scene.add(s);
    this.particles.push({ sprite: s, vel: new THREE.Vector3(), born: now, life: 240, grow: 9 });
  }

  private shake(now: number, amp: number, ms: number): void {
    if (this.reducedMotion.matches) return;
    this.shakeUntil = Math.max(this.shakeUntil, now + ms);
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }

  // ------------------------------------------------------------------ frame
  frame(now: number, session: BattleSessionState, vis: BattleVisualState, poses: readonly UnitPose[]): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w && h && (w !== this.width || h !== this.height)) {
      this.width = w;
      this.height = h;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2_350_000 / (w*h)));
      this.renderer.setDrawingBufferSize(w, h, pixelRatio);
      this.camera.aspect = w / h;
      this.projectionDirty = true;
    }
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0.016;
    this.lastNow = now;
    this.ensureArena(session);
    if (this.arena?.status !== 'ready') this.buildStage(session);

    // nhịp đánh vừa trôi qua → va chạm
    const m = vis.motion;
    let impactNow = false;
    let impactIdx = -1;
    if (m) {
      m.beats.forEach((beat, i) => {
        const t = m.startMs + beat;
        if (t <= now && t > this.lastBeatSeen) {
          this.lastBeatSeen = t;
          impactNow = true;
          impactIdx = i;
        }
      });
      const choreo = m.skillId ? HERO_CHOREO[m.skillId] : undefined;
      if (impactNow && choreo?.impact && !this.reducedMotion.matches) {
        for (const fx of choreo.impact(impactIdx, m.beats.length)) this.runFx(fx, now, session, m.actorUid, m.targetUids[0]);
      }
    }
    // kỹ năng hỗ trợ (không có nhịp đánh) của anh hùng có vũ đạo: vòng ấn + lá gió quanh đồng đội
    const pb = vis.playback;
    if (pb && pb.startedMs !== this.lastPlaybackAt) {
      this.lastPlaybackAt = pb.startedMs;
      const caster = session.combatants.find((c) => c.unitUid === pb.actorUid);
      const offensive = m && m.actorUid === pb.actorUid && now - (m.startMs + m.beats[m.beats.length - 1]) < 600;
      if (pb.kind === 'player_skill' && caster?.side === 'party' && !offensive && !this.reducedMotion.matches
        && (!vis.castSkillId || !HERO_CHOREO[vis.castSkillId])) {
        for (const fx of supportCastFx(caster.templateId, vis.castSkillId)) this.runFx(fx, now, session, pb.actorUid, undefined, true);
      }
    }

    const live = new Set<string>();
    for (const p of poses) {
      const uid = p.unit.unitUid;
      live.add(uid);
      const u = this.unitView(uid);
      if (p.sheetPath && u.sheet !== p.sheetPath) {
        const base = this.texFor(p.sheetPath);
        if (base) {
          u.tex?.dispose();
          u.tex = base.clone();
          u.tex.needsUpdate = true;
          u.mat.map = u.tex;
          u.mat.needsUpdate = true;
          u.sheet = p.sheetPath;
          for (const g of u.ghosts) {
            (g.material as THREE.SpriteMaterial).map = u.tex;
            (g.material as THREE.SpriteMaterial).needsUpdate = true;
          }
        }
      }
      if (u.tex) {
        u.tex.repeat.set(1 / 6, 1 / p.rows);
        u.tex.offset.set(p.frame / 6, 1 - (p.row + 1) / p.rows);
      }
      // vị trí: nhà + lao tới (+ giật lùi khi trúng đòn)
      toWorld(p.home.x + p.lunge.x, p.home.y + p.lunge.y + p.lift, u.pos);
      u.pos.y = p.lift * WPC;
      if (now < u.recoilUntil) u.pos.addScaledVector(u.recoil, (u.recoilUntil - now) / 220);
      const size = p.drawW * WPC;
      u.sprite.center.set(0.5, p.footFrac);
      u.sprite.scale.set(size, size, 1);
      u.sprite.position.copy(u.pos);
      u.sprite.visible = Boolean(u.tex);
      // ---- chuyển động ra đòn 3D: lấy đà → nhảy vọt (có độ cao) → nện xuống đúng nhịp → lùi về
      u.mat.rotation = 0;
      let liftNow = 0;
      if (m && m.actorUid === uid && p.unit.alive && !this.reducedMotion.matches) {
        const first = m.startMs + m.beats[0];
        const last = m.startMs + m.beats[m.beats.length - 1];
        const rel = now - first;
        const tgt = poses.find((q) => m.targetUids.includes(q.unit.unitUid));
        const dir = tgt ? Math.sign(tgt.home.x - p.home.x) || 1 : 1;
        const heavy = p.drawW > 200;
        const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
        let sx = 1, sy = 1, lift = 0, tilt = 0, push = 0, spin = 0;
        const anim = m.anim ?? (m.melee ? 'lunge' : 'projectile');
        const approach = clamp01((rel + 510) / 450);
        const back = clamp01((now - last - 80) / 380);
        const beatT = m.beats.map((b) => m.startMs + b);
        if (rel < -510) {
          // lấy đà: nén người, ngả ra sau (Lao Xuyên lùi hẳn về sau, Nhảy Bổ khuỵu sâu)
          const k = smooth(clamp01((rel + 820) / 310));
          const deep = anim === 'leap' || anim === 'slam' ? 1.8 : 1;
          sx = 1 + 0.12 * k * deep; sy = 1 - 0.1 * k * deep; tilt = -dir * 0.14 * k;
          if (anim === 'dash') push = -0.9 * k;
          if (anim === 'spin') spin = k * 0.6;
        } else if (now <= last + 460) {
          switch (anim) {
            case 'leap': { // bật thật cao, treo trên không, giáng thẳng xuống đúng nhịp
              const t = clamp01((rel + 700) / 700);
              lift = (heavy ? 2.2 : 3.2) * Math.pow(Math.sin(t * Math.PI), 0.55) * (t < 1 ? 1 : 0);
              tilt = dir * (t < 0.7 ? -0.15 : 0.35) * Math.sin(t * Math.PI);
              if (t > 0.75 && t < 1) { sy = 1.18; sx = 0.86; } // duỗi người khi lao xuống
              break;
            }
            case 'combo': { // áp sát rồi mỗi nhịp một nhát, thân lắc trái phải
              lift = Math.sin(approach * Math.PI) * 0.5 * (approach < 1 ? 1 : 0);
              beatT.forEach((bt, i) => {
                const d = now - bt;
                if (d > -130 && d < 110) {
                  const k = 1 - Math.abs(d + 10) / 120;
                  lift += 0.32 * Math.max(0, k);
                  tilt = dir * 0.28 * (i % 2 ? -1 : 1) * Math.max(0, k);
                  push += 0.3 * Math.max(0, k);
                }
              });
              break;
            }
            case 'feint': { // nhát nhử nhẹ → nhảy lùi chờ → vồ thật
              lift = Math.sin(approach * Math.PI) * 0.6 * (approach < 1 ? 1 : 0);
              if (beatT.length > 1) {
                const pause = clamp01((now - beatT[0] - 90) / (beatT[1] - beatT[0] - 330));
                if (pause > 0 && pause < 1) { push = -1.3 * Math.sin(pause * Math.PI); lift = 0.7 * Math.sin(pause * Math.PI); tilt = -dir * 0.12; }
                const pounce = clamp01((now - (beatT[1] - 260)) / 260);
                if (pounce > 0 && pounce < 1) { lift = Math.sin(pounce * Math.PI) * 1.1; tilt = dir * 0.3; sx = 1.12; }
              }
              break;
            }
            case 'dash': { // lao thẳng tầm thấp, thân kéo dài, không nhảy
              const k = Math.sin(approach * Math.PI);
              sx = 1 + 0.28 * k; sy = 1 - 0.14 * k; tilt = dir * 0.38 * k;
              push = approach < 1 ? -0.9 * (1 - approach) : 0;
              break;
            }
            case 'spin': { // xoay tròn tại chỗ quét cả đội (lật sprite giả xoay 3D)
              const t = clamp01((rel + 300) / (last - first + 600));
              spin = t * 4;
              lift = Math.sin(t * Math.PI) * 0.35;
              break;
            }
            case 'slam': { // nhảy tại chỗ rồi dậm đất
              const t = clamp01((rel + 520) / 520);
              lift = Math.sin(t * Math.PI) * (heavy ? 1.4 : 1.9) * (t < 1 ? 1 : 0);
              if (t > 0.7 && t < 1) { sy = 1.15; sx = 0.9; }
              break;
            }
            case 'projectile':
            case 'barrage': { // vươn người, mỗi phát giật nhẹ ra sau
              const k = Math.sin(clamp01((rel + 510) / 520) * Math.PI);
              sy = 1 + 0.06 * k; tilt = dir * 0.06 * k;
              for (const bt of beatT) {
                const d = now - (bt - 400);
                if (d > 0 && d < 140) { push -= 0.18 * (1 - d / 140); sx = 1.08; }
              }
              break;
            }
            default: { // lunge
              lift = Math.sin(approach * Math.PI) * (heavy ? 0.55 : 1.05) * (approach < 1 ? 1 : 0);
              tilt = dir * 0.2 * Math.sin(approach * Math.PI);
            }
          }
          if (back > 0 && m.melee) { lift = Math.sin(back * Math.PI) * 0.45; tilt = -dir * 0.1 * Math.sin(back * Math.PI); }
        }
        // vũ đạo riêng của kỹ năng anh hùng (hero-choreo.ts) đè lên chuyển động chung
        const choreo = m.skillId ? HERO_CHOREO[m.skillId] : undefined;
        if (choreo) {
          const ct: ChoreoTime = { now, rel, approach, beatT, dir };
          ({ sx, sy, lift, tilt, push, spin } = choreo.pose(ct));
          if (choreo.emit && now - this.choreoEmitAt > 45 && now <= last + 200) {
            this.choreoEmitAt = now;
            for (const fx of choreo.emit(ct)) this.runFx(fx, now, session, uid, m.targetUids[0]);
          }
        }
        if (push) u.sprite.position.x += dir * push;
        if (spin) sx *= Math.cos(spin * Math.PI * 2) || 0.05;
        liftNow = lift;
        for (const beat of m.beats) {
          const d = now - (m.startMs + beat);
          if (d > -40 && d < 90) { const k = 1 - Math.abs(d - 25) / 65; sx = Math.max(sx, 1 + 0.16 * k); sy = Math.min(sy, 1 - 0.12 * k); }
        }
        u.sprite.position.y += lift;
        u.sprite.scale.set(size * sx, size * sy, 1);
        u.mat.rotation = tilt;
        // chớp cảnh báo trên đầu quái ngay trước mỗi nhịp đánh (canh Đỡ / Né)
        if (p.unit.side === 'enemy') {
          for (const beat of m.beats) {
            const until = m.startMs + beat - now;
            if (until > 0 && until < 240) {
              const k = 1 - until / 240;
              if (!this.glint.parent) this.scene.add(this.glint);
              this.glint.material.map = this.burstTex;
              this.glint.material.color.set(until < 90 ? 0xfff3c4 : 0xffd27a);
              this.glint.material.opacity = 0.4 + 0.6 * k;
              this.glint.material.rotation = now / 120;
              this.glint.scale.setScalar(0.35 + k * 0.55);
              this.glint.position.copy(u.pos).setY(size * (1 - p.footFrac) * 0.92 + lift);
              this.glint.visible = true;
              break;
            }
          }
        }
      }
      // lóe đỏ khi mất máu
      if (u.lastHp >= 0 && p.unit.hp < u.lastHp) {
        u.flashUntil = now + 110;
        const attacker = m ? poses.find((q) => q.unit.unitUid === m.actorUid) : undefined;
        const from = attacker ? toWorld(attacker.home.x, attacker.home.y, this.tmp2) : this.tmp2.set(0, 0, 0);
        u.recoil.copy(u.pos).sub(from).setY(0).normalize().multiplyScalar(0.45);
        u.recoilUntil = now + 220;
        this.burst(this.tmp.copy(u.pos).setY(HEAD * 0.9), now, p.unit.side === 'party' ? 0xff8a7a : 0xfff1c8);
        this.shake(now, p.unit.side === 'party' ? 0.16 : 0.12, 150);
      }
      u.lastHp = p.unit.hp;
      const flash = now < u.flashUntil;
      u.mat.color.setRGB(flash ? 1 : p.alpha < 1 ? 0.55 : 1, flash ? 0.45 : p.alpha < 1 ? 0.55 : 1, flash ? 0.45 : p.alpha < 1 ? 0.6 : 1);
      // bóng đổ
      u.shadow.position.set(u.pos.x, 0.02, u.pos.z);
      const air = 1 / (1 + liftNow * 0.35); // bóng nhỏ lại khi bay cao
      u.shadow.scale.set(size * 0.55 * air, size * 0.22 * air, 1);
      u.shadow.visible = p.unit.alive || p.alpha > 0;
      // bóng mờ lưu ảnh + bụi khi bắt đầu / dừng lao
      if (p.moving && !this.reducedMotion.matches) {
        const last = u.trail[u.trail.length - 1];
        if (!last || now - last.at > 40) u.trail.push({ pos: u.pos.clone(), at: now });
        if (u.trail.length > 4) u.trail.shift();
        if (!u.wasMoving) this.dust(u.pos, now, 5, 1.6);
      } else if (u.wasMoving) {
        this.dust(u.pos, now, 5, 1.1);
        u.trail.length = 0;
      }
      u.wasMoving = p.moving && !this.reducedMotion.matches;
      u.ghosts.forEach((g, i) => {
        const t = u.trail[u.trail.length - 2 - i];
        g.visible = Boolean(t && u.tex && p.moving);
        if (!g.visible || !t) return;
        g.position.copy(t.pos);
        g.center.copy(u.sprite.center);
        g.scale.copy(u.sprite.scale);
        (g.material as THREE.SpriteMaterial).opacity = 0.32 - i * 0.09;
      });
    }
    for (const [uid, u] of this.units) {
      if (live.has(uid)) continue;
      this.releaseUnit(u);
      this.units.delete(uid);
    }
    if (impactNow && m) {
      const attacker = session.combatants.find((c) => c.unitUid === m.actorUid);
      const heavy = attacker?.isBoss || session.encounterKind === 'boss';
      this.shake(now, attacker?.side === 'enemy' ? (heavy ? 0.2 : 0.1) : 0.14, heavy ? 190 : 120);
      if (attacker?.side === 'enemy' && !this.reducedMotion.matches) {
        const color = ELEMENT_FX[attacker.element] ?? 0xffffff;
        for (const uid of m.targetUids) {
          const t = this.units.get(uid);
          if (!t) continue;
          this.ring(t.pos, now, color, heavy ? 4.2 : 2.8);
          this.slash(this.tmp.copy(t.pos).setY(HEAD * 0.75), now, color, Boolean(heavy));
          if (heavy) this.dust(t.pos, now, 8, 2.2);
        }
      }
    }
    if (this.glint.parent && !(m && now < m.startMs + m.beats[m.beats.length - 1])) this.glint.visible = false;

    // đòn tầm xa của quái: đạn năng lượng bay theo đường cong, chạm mục tiêu đúng nhịp
    let boltIdx = 0;
    const choreoProj: ChoreoProjectile | undefined = m?.skillId ? HERO_CHOREO[m.skillId]?.projectile : undefined;
    if (m && (choreoProj || !m.melee) && !this.reducedMotion.matches) {
      const attacker = session.combatants.find((c) => c.unitUid === m.actorUid);
      const from = this.units.get(m.actorUid);
      const spec: ChoreoProjectile | undefined = choreoProj
        ?? (attacker?.side === 'enemy' ? { color: ELEMENT_FX[attacker.element] ?? 0xffffff, size: attacker.isBoss ? 1 : 0.55, arc: attacker.isBoss ? 2.2 : 1.6, flight: 400 } : undefined);
      const tos = spec?.all
        ? session.combatants.filter((c) => c.side !== attacker?.side && c.alive).map((c) => this.units.get(c.unitUid)).filter((v): v is UnitView => Boolean(v))
        : [this.units.get(m.targetUids[0])].filter((v): v is UnitView => Boolean(v));
      if (attacker && spec && from) for (const to of tos) {
        const color = spec.color;
        const flight = spec.flight ?? 400;
        for (const beat of m.beats) {
          const hit = m.startMs + beat;
          const k = (now - (hit - flight)) / flight;
          if (k < 0 || k > 1) continue;
          let b = this.bolts[boltIdx];
          if (!b) {
            b = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ambientTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            this.scene.add(b);
            this.bolts.push(b);
          }
          boltIdx++;
          b.visible = true;
          b.material.color.set(color);
          if (spec.sky) {
            // rơi chéo từ trời xuống đúng đầu mục tiêu
            b.position.set(to.pos.x - 2.2 * (1 - k), 9 * (1 - k) + 0.9, to.pos.z - 1.2 * (1 - k));
          } else {
            b.position.lerpVectors(from.pos, to.pos, k).setY(1.3 + Math.sin(k * Math.PI) * spec.arc - k * 0.4);
          }
          b.scale.setScalar(spec.size + Math.sin(now / 40) * spec.size * 0.15);
          if (now - this.lastTrailAt > 28) {
            this.lastTrailAt = now;
            const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.ambientTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            s.position.copy(b.position);
            s.scale.setScalar(0.3);
            this.scene.add(s);
            this.particles.push({ sprite: s, vel: new THREE.Vector3(), born: now, life: 260, grow: 0.2, base: 0.3 });
          }
        }
      }
    }
    for (let i = boltIdx; i < this.bolts.length; i++) this.bolts[i].visible = false;

    // phản ứng Đỡ / Né của anh hùng
    const resp = vis.response;
    if (resp && resp.at !== this.lastResponseAt) {
      this.lastResponseAt = resp.at;
      if (resp.landed) {
        for (const uid of resp.targetUids) {
          const t = this.units.get(uid);
          if (!t) continue;
          const at = this.tmp.copy(t.pos).setY(HEAD * 0.8);
          if (resp.row === 3) {
            this.burst(at, now, 0xffe9a8);
            this.sparks(at, now, 0xffd36a, 14);
            this.ring(t.pos, now, 0xffe9a8, 2.2, 300);
            this.shake(now, 0.12, 110);
          } else {
            this.dust(t.pos, now, 6, 1.8);
            this.ring(t.pos, now, 0x9fe6ff, 1.6, 260);
          }
        }
      }
    }

    // sóng chấn động mặt đất
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const k = (now - r.born) / r.life;
      if (k >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar(0.2 + (1 - (1 - k) ** 3) * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.85;
    }

    // hạt bụi / tia nổ
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      const k = (now - pt.born) / pt.life;
      if (k >= 1) {
        this.scene.remove(pt.sprite);
        pt.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      pt.sprite.position.addScaledVector(pt.vel, dt);
      if (pt.gravity) pt.vel.y -= pt.gravity * dt;
      else pt.vel.multiplyScalar(0.9);
      if (pt.sprite.userData.pillar) pt.sprite.scale.set(2.2 * (1 - k * 0.6), 12 * (1 - k * 0.15), 1);
      else pt.sprite.scale.setScalar((pt.base ?? 0.5) + k * pt.grow * 0.5);
      pt.sprite.material.opacity = (1 - k) * 0.85;
    }

    this.updateAmbient(now, dt);
    this.updateCamera(now, dt, vis, poses);
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ camera
  private updateCamera(now: number, dt: number, vis: BattleVisualState, poses: readonly UnitPose[]): void {
    if (this.openedAt < 0) this.openedAt = now;
    const getPose = (id?: string) => id ? poses.find((pose) => pose.unit.unitUid === id) : undefined;
    const motion = vis.motion;
    const motionActor = motion && now <= motion.startMs+(motion.beats.at(-1) ?? 0)+250 ? getPose(motion.actorUid) : undefined;
    const playback = vis.playback;
    const counterAt = playback?.riposteHeroUid ? playback.heroPoseOverrides[playback.riposteHeroUid]?.startedMs : undefined;
    const counter = counterAt !== undefined && now >= counterAt-110 && now <= counterAt+640;
    let kind: ShotKind = 'wide';
    let subject: UnitPose | undefined;
    let target: UnitPose | undefined;
    if (!this.reducedMotion.matches) {
      if (counter && playback) {
        kind = 'counter'; subject = getPose(playback.riposteHeroUid); target = getPose(playback.riposteTargetUid);
      } else if (motionActor && motion) {
        kind = motionActor.unit.side === 'party' ? 'attack' : 'defend';
        const receiver = getPose(motion.targetUids[0]);
        subject = kind === 'attack' ? motionActor : receiver;
        target = kind === 'attack' ? receiver : motionActor;
      } else if (vis.cameraFocus?.menu && now-this.openedAt >= 245) {
        kind = vis.cameraFocus.mode ?? 'command';
        subject = getPose(vis.cameraFocus.actorUid);
        target = getPose(vis.cameraFocus.targetUid);
      }
    }
    if (!subject || !target) kind = 'wide';

    let fov = 42;
    const { targetPos: pos, targetLook: look } = this;
    if (kind !== 'wide' && subject && target) {
      const layout = CAMERA_CLOSE[kind];
      const moving = kind === 'attack' || kind === 'counter' || kind === 'defend';
      // Direction uses the starting formation. A lunge passing close to its target cannot flip the camera.
      const axis = this.axis.set((target.home.x-subject.home.x)*WPC,0,(target.home.y-subject.home.y)*WZ);
      if (axis.lengthSq() < .04) axis.set(.72,0,-.7);
      axis.normalize();
      this.screenRight.set(-axis.z,0,axis.x);
      const from = toWorld(subject.home.x+(moving ? subject.lunge.x : 0),subject.home.y+(moving ? subject.lunge.y+subject.lift : 0),this.focusActor);
      const to = toWorld(target.home.x+(kind === 'defend' ? target.lunge.x : 0),
        target.home.y+(kind === 'defend' ? target.lunge.y+target.lift : 0),this.focusTarget);
      let impact = 0;
      if (motion && (kind === 'attack' || kind === 'defend')) {
        for (const beat of motion.beats) impact = Math.max(impact, Math.max(0,1-Math.abs(now-motion.startMs-beat)/150));
      }
      const size = target.drawW*WPC;
      const aspectAllowance = this.camera.aspect < 1.35 ? .9 : 0;
      pos.copy(from).addScaledVector(axis,-layout.back-aspectAllowance+impact*.18)
        .addScaledVector(this.screenRight,layout.side).setY(layout.up);
      look.copy(from).lerp(to,layout.mix).setY(Math.max(HEAD,size*.49));
      fov = layout.fov + (this.camera.aspect < 1.35 ? 6 : 0);
    } else {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const pose of poses) {
        if (!pose.unit.alive) continue;
        const world = toWorld(pose.home.x, pose.home.y, this.tmp);
        minX = Math.min(minX,world.x); maxX = Math.max(maxX,world.x);
        minZ = Math.min(minZ,world.z); maxZ = Math.max(maxZ,world.z);
      }
      const x = Number.isFinite(minX) ? (minX+maxX)/2 : 0;
      const z = Number.isFinite(minZ) ? (minZ+maxZ)/2 : 0;
      pos.set(x-1.4,7.5,Number.isFinite(maxZ) ? maxZ+10.4 : 16);
      look.set(x,1.1,z-.6);
      if (this.camera.aspect < 1.35) fov = 51;
    }

    const key = kind === 'wide' ? 'wide' : `${kind}:${subject?.unit.unitUid}:${target?.unit.unitUid}`;
    if (key !== this.shotKey) {
      const first = !this.shotKey;
      this.shotKey = key;
      this.canvas.dataset.cameraShot = kind;
      this.shotAt = now;
      this.shotDuration = first || this.reducedMotion.matches ? 0 : kind === 'attack' || kind === 'defend' || kind === 'counter' ? 245 : 345;
      this.fromPos.copy(this.camPos);
      this.fromLook.copy(this.camLook);
      this.fromFov = this.camFov;
    }
    if (this.shotDuration === 0) {
      this.camPos.copy(pos); this.camLook.copy(look); this.camFov = fov;
    } else if (now-this.shotAt < this.shotDuration) {
      const progress = smooth(Math.max(0,(now-this.shotAt)/this.shotDuration));
      this.camPos.lerpVectors(this.fromPos,pos,progress);
      this.camLook.lerpVectors(this.fromLook,look,progress);
      this.camFov = this.fromFov+(fov-this.fromFov)*progress;
    } else {
      const follow = 1-Math.exp(-dt*13);
      this.camPos.lerp(pos,follow); this.camLook.lerp(look,follow); this.camFov += (fov-this.camFov)*follow;
    }

    this.camera.position.copy(this.camPos);
    if (!this.reducedMotion.matches && now < this.shakeUntil) {
      const a = this.shakeAmp * Math.min(1,(this.shakeUntil-now)/150);
      // rung mượt (tổng hai sóng lệch pha) thay cho nhiễu ngẫu nhiên từng khung
      this.camera.position.x += (Math.sin(now * 0.083) * 0.6 + Math.sin(now * 0.217 + 1.3) * 0.4) * a * 0.5;
      this.camera.position.y += (Math.sin(now * 0.097 + 0.7) * 0.6 + Math.sin(now * 0.191) * 0.4) * a * 0.5;
    } else this.shakeAmp = 0;
    if (this.projectionDirty || Math.abs(this.camera.fov - this.camFov) > .025) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
      this.projectionDirty = false;
    }
    this.camera.lookAt(this.camLook);
  }

  // ------------------------------------------------------------------ overlay projection
  project(uid: string): { x: number; y: number; s: number } | null {
    const u = this.units.get(uid);
    if (!u || !this.width) return null;
    const foot = this.tmp.copy(u.pos).project(this.camera);
    if (foot.z < -1 || foot.z > 1) return null;
    const sx = (foot.x + 1) / 2 * this.width;
    const sy = (1 - foot.y) / 2 * this.height;
    const top = this.tmp2.copy(u.pos).setY(u.pos.y + 1).project(this.camera);
    const ppw = Math.hypot((top.x - foot.x) / 2 * this.width, (top.y - foot.y) / 2 * this.height);
    const k = Math.max(this.width / BATTLE_CANVAS_W, this.height / BATTLE_CANVAS_H);
    return {
      x: (sx - (this.width - BATTLE_CANVAS_W * k) / 2) / k,
      y: (sy - (this.height - BATTLE_CANVAS_H * k) / 2) / k,
      // giữ chữ / icon lớp phủ dễ đọc: không phóng quá to khi đơn vị ở sát camera
      s: Math.max(0.55, Math.min(1.45, (ppw * WPC) / k)),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.clearStage();
    for (const unit of this.units.values()) this.releaseUnit(unit);
    this.units.clear();
    for (const particle of this.particles) {
      this.scene.remove(particle.sprite);
      particle.sprite.material.dispose();
    }
    this.particles.length = 0;
    for (const t of this.baseTex.values()) t.dispose();
    this.shadowTex.dispose();
    this.dustTex.dispose();
    this.burstTex.dispose();
    this.ambientTex.dispose();
    this.slashTex.dispose();
    this.glint.material.dispose();
    for (const b of this.bolts) { this.scene.remove(b); b.material.dispose(); }
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mesh.geometry.dispose(); (r.mesh.material as THREE.Material).dispose(); }
    this.rings.length = 0;
    this.renderer.dispose();
  }

  private releaseUnit(unit: UnitView): void {
    this.scene.remove(unit.sprite, unit.shadow, ...unit.ghosts);
    unit.tex?.dispose();
    unit.mat.dispose();
    unit.shadow.material.dispose();
    unit.shadow.geometry.dispose();
    for (const ghost of unit.ghosts) ghost.material.dispose();
  }
}
