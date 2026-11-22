/**
 * 60 FPS 2D Pixel Overworld Canvas Renderer (`overworldRenderer.ts`)
 * Renders the 7 Living Realms (`.tmj`), 8-frame synchronized liquid/aurora tiles,
 * 48-frame party leader (`idle`/`walk` x 4 directions), 4-frame Rest Anchor flags,
 * 4-frame Boss/Realm Warp Archways, Treasure Chests, and 24-frame patrolling Gatekeepers!
 */

import {
  EXPEDITION_BOSSES_BY_ID,
  EXPEDITION_MONSTERS_BY_ID,
  EXPEDITION_WILD_PACKS,
  type WildPackSpec,
  EXPEDITION_GATEKEEPERS_BY_ID,
  type ExpeditionProfile,
  type GatekeeperEncounter,
  type RealmMapSpec,
  isEncounterDefeated,
} from '../../../shared/src';
import { getCachedImage, type TiledTmjMap } from './assetLoader';
import { drawMeadowCurrent, drawMeadowGrassCover, drawMeadowScenery } from './overworldScenery';

export type Direction4 = 0 | 1 | 2 | 3; // 0=down, 1=left, 2=right, 3=up
export type CrossingKind = 'ladder' | 'grip' | 'rope';
type Point = { x: number; y: number };
type Crossing = { id: string; kind: CrossingKind; from: Point; to: Point };
type EncounterContact = { kind: 'gatekeeper' | 'wild'; targetId: string };
const crossingCache = new WeakMap<TiledTmjMap, Crossing[]>();
const accessibleCache = new WeakMap<TiledTmjMap, { key: string; cells: Set<number> }>();
const CROSSING_STYLE: Record<CrossingKind, { label: string; color: string; icon: string; duration: number }> = {
  ladder: { label: 'Leo thang', color: '#e5aa64', icon: 'H', duration: 800 },
  grip: { label: 'Nhảy bám', color: '#83d1e5', icon: '↑', duration: 420 },
  rope: { label: 'Đu dây', color: '#b7de91', icon: '↗', duration: 790 },
};

export function mapCrossings(tmj: TiledTmjMap): Crossing[] {
  const cached = crossingCache.get(tmj);
  if (cached) return cached;
  const crossings: Crossing[] = [];
  for (const object of tmj.layers.find((layer) => layer.name === 'traversal')?.objects ?? []) {
    if (object.type !== 'ladder' && object.type !== 'grip' && object.type !== 'rope') continue;
    const x = object.properties?.find((property) => property.name === 'toX')?.value;
    const y = object.properties?.find((property) => property.name === 'toY')?.value;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) continue;
    crossings.push({ id: object.name, kind: object.type, from: {x:Math.floor(object.x/TILE), y:Math.floor(object.y/TILE)}, to: {x,y} });
  }
  crossingCache.set(tmj, crossings);
  return crossings;
}

export interface OverworldRuntimeState {
  px: number; // tile-space X (e.g. 4.0 .. 49.0)
  py: number; // tile-space Y
  dir: Direction4;
  moving: boolean;
  immunityUntilMs: number;
  /**
   * Hiệu ứng hồi sinh sau khi nghỉ lửa trại: quái trong `ids` hiện dần (pop-in) từ `startMs`.
   * `startMs = Infinity` = còn ẩn (màn nghỉ ngơi đang hiện). Quái có trên bản đồ hay không do `profile.defeatedSinceRest` quyết định.
   */
  respawnFx?: { startMs: number; ids: readonly string[] };
  /** Hiệu ứng mở rương: nắp bật, cột sáng vàng, xu văng, chữ phần thưởng bay lên. */
  chestFx?: { chestId: string; startMs: number; seal: number; crystal: number };
  travel?: { from: Point; to: Point; kind: CrossingKind; startedAt: number };
  lift?: number;
  promptHint: {
    kind: 'anchor' | 'chest' | 'boss' | 'exit_portal' | 'back_portal' | CrossingKind;
    labelVi: string;
    targetId: string;
  } | null;
}

const TILE = 32;
export const OVERWORLD_VIEW_W = 1088;
export const OVERWORLD_VIEW_H = 608;

export function isTileWalkable(
  tmj: TiledTmjMap,
  tx: number,
  ty: number,
  realm: RealmMapSpec,
  clearedGatekeepers: readonly string[],
): boolean {
  if (tx < 0 || ty < 0 || tx >= tmj.width || ty >= tmj.height) return false;
  const layer = tmj.layers[0];
  const gid = layer.data[ty * tmj.width + tx] ?? 4;
  if (gid === 4 || gid === 5) return false;
  if (gid === 7) {
    // Check which Gatekeeper owns this barrier tile
    for (const gkId of realm.gatekeeperIds) {
      const gk = EXPEDITION_GATEKEEPERS_BY_ID[gkId];
      if (!gk) continue;
      if (gk.gateBarrierTiles.some(([bx, by]) => bx === tx && by === ty)) {
        return clearedGatekeepers.includes(gkId);
      }
    }
  }
  return gid === 1 || gid === 2 || gid === 3 || gid === 6 || gid === 8;
}

function accessibleCells(tmj: TiledTmjMap, realm: RealmMapSpec, cleared: readonly string[]): Set<number> {
  const key = realm.gatekeeperIds.filter((id) => cleared.includes(id)).join('|');
  const cached = accessibleCache.get(tmj);
  if (cached?.key === key) return cached.cells;
  const { width } = tmj;
  const index = ({ x, y }: Point) => y * width + x;
  const links = new Map<number, Point>();
  for (const { from, to } of mapCrossings(tmj)) {
    links.set(index(from), to);
    links.set(index(to), from);
  }
  const cells = new Set<number>();
  const queue: Point[] = [];
  const visit = (point: Point) => {
    const i = index(point);
    if (!cells.has(i) && isTileWalkable(tmj, point.x, point.y, realm, cleared)) {
      cells.add(i);
      queue.push(point);
    }
  };
  visit(realm.spawn);
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    visit({ x: x-1, y }); visit({ x: x+1, y }); visit({ x, y: y-1 }); visit({ x, y: y+1 });
    const landing = links.get(index(queue[i]));
    if (landing) visit(landing);
  }
  accessibleCache.set(tmj, { key, cells });
  return cells;
}

/** Repair the display position after a map revision or a blocked landing. */
export function recoverOverworldPosition(rt: OverworldRuntimeState, tmj: TiledTmjMap, realm: RealmMapSpec,
  profile: ExpeditionProfile, nowMs: number): boolean {
  if (rt.travel) return false;
  const cleared = profile.clearedGatekeepers;
  const cells = accessibleCells(tmj, realm, cleared);
  const isSafe = (x: number, y: number) =>
    isTileWalkable(tmj, x, y, realm, cleared) && cells.has(y * tmj.width + x);
  if (Number.isFinite(rt.px) && Number.isFinite(rt.py) && isSafe(Math.round(rt.px), Math.round(rt.py))) return false;

  // Ưu tiên đẩy sang ô an toàn GẦN NHẤT (không dịch chuyển cả bản đồ về trạm nghỉ sau mỗi trận)
  if (Number.isFinite(rt.px) && Number.isFinite(rt.py)) {
    const cx = Math.round(rt.px), cy = Math.round(rt.py);
    for (let r = 1; r <= 8; r++) {
      let best: { x: number; y: number; d: number } | undefined;
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || !isSafe(x, y)) continue;
          const d = Math.hypot(x - rt.px, y - rt.py);
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      if (best) {
        rt.px = best.x;
        rt.py = best.y;
        rt.moving = false;
        rt.lift = 0;
        return true;
      }
    }
  }

  const anchor = realm.restAnchors.find((entry) => entry.anchorId === profile.lastRestAnchorId);
  const point = anchor && isSafe(anchor.x, anchor.y) ? anchor : realm.spawn;
  rt.px = point.x;
  rt.py = point.y;
  rt.moving = false;
  rt.lift = 0;
  rt.promptHint = null;
  rt.immunityUntilMs = nowMs + 1200;
  return true;
}

export function getPatrolPosition(gk: GatekeeperEncounter, nowMs: number): { x: number; y: number; dir: Direction4 } {
  if (gk.patrolWaypoints.length < 2) return { x: gk.x, y: gk.y, dir: 0 };
  const [x0, y0] = gk.patrolWaypoints[0];
  const [x1, y1] = gk.patrolWaypoints[1];
  const cycle = (nowMs % 4400) / 4400; // smooth ping-pong patrol
  const t = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
  const x = x0 + (x1 - x0) * t;
  const y = y0 + (y1 - y0) * t;
  const dir: Direction4 = cycle < 0.5 ? 0 : 3;
  return { x, y, dir };
}

export function wildPacksOf(realm: RealmMapSpec): WildPackSpec[] {
  return EXPEDITION_WILD_PACKS.filter((w) => w.mapId === realm.mapId);
}

export function getWildPosition(w: WildPackSpec, nowMs: number, tmj: TiledTmjMap): { x: number; y: number; dir: Direction4 } {
  const seed = w.x * 13 + w.y * 7;
  const t = nowMs / 1000 + seed;
  const x = w.x + Math.sin(t * 0.45) * 1.4;
  const y = w.y + Math.sin(t * 0.31 + 1.3) * 0.6;
  const gid = tmj.layers[0].data[Math.round(y) * tmj.width + Math.round(x)];
  if (gid !== 1 && gid !== 2 && gid !== 3) return { x: w.x, y: w.y, dir: 0 };
  const dx = Math.cos(t * 0.45);
  const dir: Direction4 = Math.abs(dx) > 0.35 ? (dx < 0 ? 1 : 2) : 0;
  return { x, y, dir };
}

const RESPAWN_FX_MS = 900;

const MONUMENT_INDEX: Record<string, number> = { obelisk: 0, arch: 1, statue: 2, tower: 3 };
/** điểm phát sáng trong ô 128×128 của từng loại công trình */
const MONUMENT_GLOW: Record<string, readonly [number, number, number]> = {
  obelisk: [64, 60, 30], arch: [62, 28, 20], statue: [92, 14, 18], tower: [64, 64, 24],
};
const THEME_GLOW: Record<string, string> = {
  meadow: '120,255,170', snow: '140,220,255', desert: '255,200,90', underwater: '90,240,230',
  volcano: '255,120,40', night: '200,140,255', aurora: '130,255,200',
};

/** Công trình (tháp rune, cổng vòm, tượng, tháp canh): vẽ theo thứ tự y + quầng sáng nhịp nhàng. */
function drawMonuments(ctx: CanvasRenderingContext2D, tmj: TiledTmjMap, theme: string, camX: number, camY: number, nowMs: number,
  drawables: { sortY: number; draw: () => void }[]): void {
  const atlas = getCachedImage(`structures/${theme}/monuments.png`);
  const layer = tmj.layers.find((l) => l.name === 'structures');
  if (!atlas || !layer?.objects) return;
  for (const o of layer.objects) {
    const idx = MONUMENT_INDEX[o.type];
    if (idx === undefined) continue;
    const x = Math.round(o.x - camX - 64);
    const y = Math.round(o.y - camY - 122);
    if (x < -140 || y < -140 || x > OVERWORLD_VIEW_W + 10 || y > OVERWORLD_VIEW_H + 10) continue;
    drawables.push({
      sortY: o.y / TILE - 0.6,
      draw: () => {
        ctx.drawImage(atlas, idx * 128, 0, 128, 128, x, y, 128, 128);
        const [gx, gy, gr] = MONUMENT_GLOW[o.type];
        const pulse = 0.5 + 0.5 * Math.sin(nowMs / 520 + o.x * 0.01);
        const g = ctx.createRadialGradient(x + gx, y + gy, 2, x + gx, y + gy, gr * (1.2 + pulse * 0.5));
        g.addColorStop(0, `rgba(${THEME_GLOW[theme] ?? '255,255,255'}, ${0.28 + pulse * 0.25})`);
        g.addColorStop(1, `rgba(${THEME_GLOW[theme] ?? '255,255,255'}, 0)`);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(x + gx - gr * 2, y + gy - gr * 2, gr * 4, gr * 4);
        ctx.restore();
      },
    });
  }
}

const AURORA_BANDS = [
  { base: 0.1, amp: 26, freq: 0.0042, speed: 0.00021, color: [90, 255, 170], height: 120, alpha: 0.2 },
  { base: 0.2, amp: 34, freq: 0.0031, speed: -0.00016, color: [70, 220, 235], height: 90, alpha: 0.15 },
  { base: 0.04, amp: 20, freq: 0.0056, speed: 0.00027, color: [170, 120, 255], height: 80, alpha: 0.14 },
  { base: 0.3, amp: 18, freq: 0.0049, speed: 0.00012, color: [250, 120, 210], height: 54, alpha: 0.09 },
] as const;

/** Màn cực quang: mỗi dải là chuỗi cột sáng mảnh, chân sáng đậm mờ dần lên trên, uốn theo sóng và trôi chậm. */
function drawAuroraCurtains(ctx: CanvasRenderingContext2D, nowMs: number, camX: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const b of AURORA_BANDS) {
    const [r, g, bl] = b.color;
    for (let x = 0; x < OVERWORLD_VIEW_W; x += 4) {
      const wx = x + camX * 0.35; // trôi chậm hơn mặt đất → cảm giác ở rất xa trên trời
      const wave = Math.sin(wx * b.freq + nowMs * b.speed * 6) * b.amp + Math.sin(wx * b.freq * 2.7 + nowMs * b.speed * 11) * b.amp * 0.4;
      const y = OVERWORLD_VIEW_H * b.base + wave;
      const flicker = 0.65 + 0.35 * Math.sin(wx * 0.021 + nowMs * 0.0013) * Math.sin(wx * 0.007 - nowMs * 0.0007);
      const hgt = b.height * (0.7 + 0.3 * Math.sin(wx * 0.013 + nowMs * 0.0009));
      const grad = ctx.createLinearGradient(0, y + hgt, 0, y);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, ${b.alpha * flicker})`);
      grad.addColorStop(0.35, `rgba(${r}, ${g}, ${bl}, ${b.alpha * 0.55 * flicker})`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, 4, hgt);
    }
  }
  ctx.restore();
}

const GRASS_BLADES = ['#2f6e30', '#3f8a3a', '#5aa64a', '#7cc05c'];
/** Đứng trong đồng cỏ cao (gid 2): vẽ một dải ngọn cỏ đung đưa che phần chân của sprite. */
function drawGrassCover(ctx: CanvasRenderingContext2D, tmj: TiledTmjMap, tileX: number, tileY: number, footX: number, footY: number, nowMs: number) {
  if (tmj.layers[0].data[Math.round(tileY) * tmj.width + Math.round(tileX)] !== 2) return;
  ctx.save();
  for (let i = 0; i < 13; i++) {
    const bx = footX - 19 + i * 3 + ((i * 7) % 3);
    const h = 9 + ((i * 5) % 6);
    const sway = Math.sin(nowMs / 420 + i * 0.9) * 2;
    ctx.strokeStyle = GRASS_BLADES[i % GRASS_BLADES.length];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, footY + 3);
    ctx.lineTo(bx + sway, footY + 3 - h);
    ctx.stroke();
  }
  ctx.restore();
}

/** 0 = chưa hiện, 1 = hiện đầy đủ. Quái đang hiện dần chưa chạm được (tránh vào trận ngay khi vừa hồi sinh). */
export function respawnProgress(rt: OverworldRuntimeState, id: string, nowMs: number): number {
  const fx = rt.respawnFx;
  if (!fx || !fx.ids.includes(id)) return 1;
  if (!Number.isFinite(fx.startMs)) return 0;
  return Math.max(0, Math.min(1, (nowMs - fx.startMs) / RESPAWN_FX_MS));
}

/** Quái còn trên bản đồ = chưa bị hạ kể từ lần nghỉ gần nhất (Gác Cổng đã mở cổng vẫn đứng gác lại sau khi nghỉ). */
export function isEncounterPresent(profile: ExpeditionProfile, id: string): boolean {
  // Gác Cổng = boss mini: hạ rồi là hạ VĨNH VIỄN (nghỉ lửa trại không hồi sinh)
  if (id.includes('_gk_')) return !profile.clearedGatekeepers.includes(id);
  return !isEncounterDefeated(profile, id);
}

/** Vẽ sprite với độ mờ + nảy nhẹ từ chân (k: 0 → 1). */
function drawPopIn(ctx: CanvasRenderingContext2D, k: number, footX: number, footY: number, draw: () => void) {
  if (k >= 1) { draw(); return; }
  const e = 1 - (1 - k) ** 3;
  const sy = 0.55 + 0.45 * e + Math.sin(k * Math.PI) * 0.12;
  const sx = 1.12 - 0.12 * e;
  ctx.save();
  ctx.globalAlpha = e;
  ctx.translate(footX, footY);
  ctx.scale(sx, sy);
  ctx.translate(-footX, -footY);
  draw();
  ctx.restore();
}

/** Vòng sáng ấm + tia lấp lánh bay lên khi quái hồi sinh. */
function drawRespawnGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, k: number) {
  if (k >= 1) return;
  const fade = 1 - k;
  const r = 10 + 30 * Math.sqrt(k);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, r + 10);
  glow.addColorStop(0, `rgba(255, 214, 150, ${0.55 * fade})`);
  glow.addColorStop(0.6, `rgba(255, 170, 90, ${0.25 * fade})`);
  glow.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r - 12, cy - r - 12, (r + 12) * 2, (r + 12) * 2);
  ctx.strokeStyle = `rgba(255, 228, 170, ${0.8 * fade})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 20, r, r * 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + k * 2.4;
    const d = 6 + k * 34;
    ctx.fillStyle = `rgba(255, 240, 200, ${fade})`;
    ctx.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy - k * 26 + Math.sin(a) * d * 0.5), 2, 2);
  }
  ctx.restore();
}

export function wildSheetOf(monsterId: string): string {
  const m = EXPEDITION_MONSTERS_BY_ID[monsterId];
  return `units/${m?.dir ?? 'monsters'}/${monsterId}-movement.png`;
}

export function startCrossing(rt: OverworldRuntimeState, tmj: TiledTmjMap, realm: RealmMapSpec,
  profile: ExpeditionProfile, nowMs: number, action: 'interact' | 'grip'): boolean {
  const hint = rt.promptHint;
  if (!hint || rt.travel || (action === 'grip' ? hint.kind !== 'grip' : hint.kind !== 'ladder' && hint.kind !== 'rope')) return false;
  const link = mapCrossings(tmj).find((entry) => entry.id === hint.targetId);
  if (!link) return false;
  const at = (p: Point) => Math.hypot(rt.px-p.x, rt.py-p.y);
  const nearFrom = at(link.from) <= at(link.to);
  if (at(nearFrom ? link.from : link.to) > 1.15) return false;
  const to = nearFrom ? link.to : link.from;
  if (!isTileWalkable(tmj,to.x,to.y,realm,profile.clearedGatekeepers)) return false;
  const dx = to.x-rt.px, dy = to.y-rt.py;
  rt.dir = Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 1 : 2 : dy < 0 ? 3 : 0;
  rt.travel = { from: { x: rt.px, y: rt.py }, to, kind: link.kind, startedAt: nowMs };
  rt.promptHint = null;
  return true;
}

export function stepOverworldPhysics(params: {
  rt: OverworldRuntimeState;
  inputDx: number;
  inputDy: number;
  sprint?: boolean;
  dtSec: number;
  nowMs: number;
  tmj: TiledTmjMap;
  realm: RealmMapSpec;
  profile: ExpeditionProfile;
}): EncounterContact | undefined {
  const { rt, inputDx, inputDy, dtSec, nowMs, tmj, realm, profile } = params;
  if (rt.travel) {
    const { from, to, kind, startedAt } = rt.travel;
    const t = Math.min(1,(nowMs-startedAt)/CROSSING_STYLE[kind].duration);
    rt.px = from.x+(to.x-from.x)*t;
    rt.py = from.y+(to.y-from.y)*t;
    rt.lift = Math.sin(Math.PI*t)*(kind==='rope' ? 42 : kind==='grip' ? 21 : 10);
    rt.moving = true;
    if (t >= 1) {
      rt.travel = undefined;
      rt.lift = 0;
      rt.immunityUntilMs = nowMs + 550;
      recoverOverworldPosition(rt, tmj, realm, profile, nowMs);
    }
    return;
  }

  if (recoverOverworldPosition(rt, tmj, realm, profile, nowMs)) return;
  let dx = inputDx;
  let dy = inputDy;
  const mag = Math.hypot(dx, dy);
  if (mag > 0.01) {
    dx /= mag;
    dy /= mag;
    rt.moving = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      rt.dir = dx < 0 ? 1 : 2;
    } else {
      rt.dir = dy < 0 ? 3 : 0;
    }

    const speedTilesPerSec = params.sprint ? 9.3 : 6.2;
    const nx = rt.px + dx * speedTilesPerSec * dtSec;
    const ny = rt.py + dy * speedTilesPerSec * dtSec;

    if (isTileWalkable(tmj, Math.round(nx), Math.round(rt.py), realm, profile.clearedGatekeepers)) {
      rt.px = nx;
    }
    if (isTileWalkable(tmj, Math.round(rt.px), Math.round(ny), realm, profile.clearedGatekeepers)) {
      rt.py = ny;
    }
  } else {
    rt.moving = false;
  }

  rt.promptHint = null;
  const inReach = (point: Point, radius: number) => {
    const dx = point.x - rt.px, dy = point.y - rt.py;
    if (Math.hypot(dx, dy) > radius) return false;
    return [.25,.5,.75,1].every((t) => isTileWalkable(tmj, Math.round(rt.px+dx*t), Math.round(rt.py+dy*t), realm, profile.clearedGatekeepers));
  };
  if (nowMs >= rt.immunityUntilMs) {
    for (const id of realm.gatekeeperIds) {
      const guard = EXPEDITION_GATEKEEPERS_BY_ID[id];
      if (guard && isEncounterPresent(profile, id) && respawnProgress(rt, id, nowMs) >= 1 && inReach(getPatrolPosition(guard, nowMs), .94)) {
        return { kind: 'gatekeeper', targetId: id };
      }
    }
    for (const pack of wildPacksOf(realm)) {
      if (isEncounterPresent(profile, pack.wildId) && respawnProgress(rt, pack.wildId, nowMs) >= 1 && inReach(getWildPosition(pack, nowMs, tmj), .77)) {
        return { kind: 'wild', targetId: pack.wildId };
      }
    }
  }
  for (const link of mapCrossings(tmj)) {
    if (!inReach(link.from, 1.15) && !inReach(link.to, 1.15)) continue;
    rt.promptHint = { kind: link.kind, labelVi: CROSSING_STYLE[link.kind].label, targetId: link.id };
    return;
  }

  // Check proximity interaction hints ([E] / Tap)
  rt.promptHint = null;
  for (const anc of realm.restAnchors) {
    if (Math.hypot(rt.px - anc.x, rt.py - anc.y) <= 1.75) {
      rt.promptHint = { kind: 'anchor', labelVi: `Nghỉ Ngơi · ${anc.nameVi}`, targetId: anc.anchorId };
      return;
    }
  }
  for (const ch of realm.chests) {
    if (!profile.openedChests.includes(ch.chestId) && Math.hypot(rt.px - ch.x, rt.py - ch.y) <= 1.75) {
      rt.promptHint = {
        kind: 'chest',
        labelVi: `Mở Rương · +${ch.astralSealReward} Ấn · +${ch.expCrystalReward} Tinh Thể`,
        targetId: ch.chestId,
      };
      return;
    }
  }
  if (Math.hypot(rt.px - realm.bossAltar.x, rt.py - realm.bossAltar.y) <= 2.1) {
    const boss = EXPEDITION_BOSSES_BY_ID[realm.bossAltar.bossId];
    const cleared = profile.clearedBosses.includes(realm.bossAltar.bossId);
    rt.promptHint = {
      kind: 'boss',
      labelVi: `${cleared ? 'Tái Đấu' : 'Khiêu Chiến'} Đại Trùm · ${boss?.nameVi ?? realm.bossAltar.bossId}`,
      targetId: realm.bossAltar.bossId,
    };
    return;
  }
  if (realm.exitPortal && Math.hypot(rt.px - realm.exitPortal.x, rt.py - realm.exitPortal.y) <= 2.0) {
    const bossCleared = profile.clearedBosses.includes(realm.exitPortal.requiresBossId);
    rt.promptHint = {
      kind: 'exit_portal',
      labelVi: bossCleared
        ? 'Bước Qua Cổng Sang Vùng Kế Tiếp'
        : 'Cổng Phong Ấn (Cần hạ Đại Trùm vùng này)',
      targetId: realm.exitPortal.toMapId,
    };
    return;
  }
  if (realm.backPortal && Math.hypot(rt.px - realm.backPortal.x, rt.py - realm.backPortal.y) <= 1.8) {
    rt.promptHint = {
      kind: 'back_portal',
      labelVi: 'Quay Về Vùng Trước',
      targetId: realm.backPortal.toMapId,
    };
    return;
  }
}

function drawCrossing(ctx: CanvasRenderingContext2D, link: Crossing, camX: number, camY: number) {
  const start = { x: link.from.x*TILE-camX+16, y: link.from.y*TILE-camY+16 };
  const end = { x: link.to.x*TILE-camX+16, y: link.to.y*TILE-camY+16 };
  const { color, icon } = CROSSING_STYLE[link.kind];
  const dx = end.x-start.x, dy = end.y-start.y;
  const length = Math.hypot(dx,dy);
  if (!length) return;
  const nx = -dy/length, ny = dx/length;
  const line = (a: Point, b: Point, width: number, tint: string) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = tint;
    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
  };
  if (link.kind === 'ladder') {
    for (const side of [-1,1]) {
      const a = {x:start.x+nx*9*side,y:start.y+ny*9*side};
      const b = {x:end.x+nx*9*side,y:end.y+ny*9*side};
      line(a,b,7,'#2a1d1b'); line(a,b,3,color);
    }
    for (let distance = 10; distance < length-4; distance += 13) {
      const x = start.x+dx*distance/length, y = start.y+dy*distance/length;
      line({x:x-nx*8,y:y-ny*8},{x:x+nx*8,y:y+ny*8},3,'#c28955');
    }
  } else if (link.kind === 'rope') {
    for (const pass of [{width:6,color:'#1d2722'},{width:2,color}]) {
      ctx.lineWidth = pass.width; ctx.strokeStyle = pass.color;
      ctx.beginPath(); ctx.moveTo(start.x,start.y-12);
      ctx.quadraticCurveTo((start.x+end.x)/2,(start.y+end.y)/2+14,end.x,end.y-12);
      ctx.stroke();
    }
    for (const p of [start,end]) {
      ctx.fillStyle = '#342920'; ctx.fillRect(p.x-5,p.y-10,10,15);
      ctx.fillStyle = color; ctx.fillRect(p.x-4,p.y-11,8,3);
    }
  } else {
    for (const [i,p] of [start,end].entries()) {
      const face = i===0 ? 1 : -1;
      for (let j = -1; j <= 1; j += 1) {
        const x = p.x+dx/length*face*10+nx*j*8, y = p.y+dy/length*face*10+ny*j*8;
        ctx.fillStyle = '#142b39'; ctx.fillRect(x-4,y-4,9,8);
        ctx.fillStyle = color; ctx.fillRect(x-3,y-3,7,3);
      }
    }
  }
  for (const p of [start,end]) {
    ctx.fillStyle = '#17161e';
    ctx.fillRect(p.x-8,p.y+1,16,16);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(p.x-8,p.y+1,16,16);
    ctx.fillStyle = color; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(icon,p.x,p.y+13);
  }
}

const CHEST_FX_MS = 2200;

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Rương pixel 32×32. `fxT` = ms từ lúc mở (Infinity nếu không có hiệu ứng). */
function drawChest(ctx: CanvasRenderingContext2D, cx: number, cy: number, opened: boolean, fxT: number, nowMs: number) {
  // rung nhẹ trước khi bật nắp
  const shake = fxT < 260 ? Math.sin(fxT / 18) * 1.5 : 0;
  const x = cx + shake;
  px(ctx, '#0d0a12aa', cx + 3, cy + 25, 27, 4); // bóng
  if (!opened) {
    // hào quang mời gọi dưới chân rương
    const pulse = .55 + .45 * Math.sin(nowMs / 380);
    const glow = ctx.createRadialGradient(cx + 16, cy + 20, 2, cx + 16, cy + 20, 26);
    glow.addColorStop(0, `rgba(255, 214, 110, ${.42 * pulse})`);
    glow.addColorStop(1, 'rgba(255, 214, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 12, cy - 8, 56, 56);
  }
  const wood = opened ? '#4b3f3a' : '#7a4a26';
  const woodHi = opened ? '#5d514b' : '#a0652f';
  const trim = opened ? '#7d7469' : '#e8b84a';
  const trimHi = opened ? '#958c80' : '#fff0a8';
  // thân rương
  px(ctx, '#1c1210', x + 4, cy + 13, 24, 13);
  px(ctx, wood, x + 5, cy + 14, 22, 11);
  px(ctx, woodHi, x + 5, cy + 14, 22, 2);
  px(ctx, trim, x + 5, cy + 18, 22, 2);
  px(ctx, trim, x + 8, cy + 14, 2, 11);
  px(ctx, trim, x + 22, cy + 14, 2, 11);
  if (opened) {
    // nắp lật ra sau + lòng rương trống
    const pop = fxT < CHEST_FX_MS ? Math.max(0, Math.sin(Math.min(1, (fxT - 200) / 260) * Math.PI)) * 6 : 0;
    px(ctx, '#1c1210', x + 4, cy + 3 - pop, 24, 8);
    px(ctx, wood, x + 5, cy + 4 - pop, 22, 6);
    px(ctx, trim, x + 5, cy + 8 - pop, 22, 2);
    px(ctx, '#0b0709', x + 6, cy + 11, 20, 4); // lòng tối
    if (fxT < CHEST_FX_MS && fxT > 200) {
      const k = 1 - (fxT - 200) / (CHEST_FX_MS - 200);
      px(ctx, `rgba(255, 226, 130, ${k})`, x + 6, cy + 11, 20, 4); // ánh vàng còn trong lòng rương
    } else {
      px(ctx, '#2a2024', x + 9, cy + 13, 3, 1); // bụi trống
    }
  } else {
    // nắp đóng + khoá vàng lấp lánh
    px(ctx, '#1c1210', x + 4, cy + 7, 24, 7);
    px(ctx, wood, x + 5, cy + 8, 22, 5);
    px(ctx, woodHi, x + 6, cy + 8, 20, 1);
    px(ctx, trim, x + 8, cy + 8, 2, 6);
    px(ctx, trim, x + 22, cy + 8, 2, 6);
    px(ctx, trim, x + 14, cy + 11, 4, 5);
    px(ctx, trimHi, x + 15, cy + 12, 2, 1);
    const tw = Math.floor(nowMs / 140) % 14;
    if (tw < 3) px(ctx, '#fffbe0', x + 9 + tw * 6, cy + 8 + (tw % 2) * 7, 1, 1);
    // dấu ✦ vàng nhấp nhô báo "còn vật phẩm"
    const bob = Math.round(Math.sin(nowMs / 260) * 2);
    const my = cy - 9 + bob;
    px(ctx, '#3b2508', x + 13, my - 1, 6, 8);
    px(ctx, '#ffd257', x + 15, my - 2, 2, 10);
    px(ctx, '#ffd257', x + 12, my + 2, 8, 2);
    px(ctx, '#fff6c8', x + 15, my + 2, 2, 2);
  }
}

/** Màn bùng nổ khi mở rương: cột sáng, tia quay, vòng sóng, xu văng, chữ phần thưởng. */
function drawChestBurst(ctx: CanvasRenderingContext2D, ox: number, oy: number, t: number,
  fx: { seal: number; crystal: number }) {
  if (t < 200) return;
  const u = (t - 200) / (CHEST_FX_MS - 200); // 0 → 1
  const fade = u < .75 ? 1 : 1 - (u - .75) / .25;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // chớp trắng lúc nắp bật
  if (u < .08) {
    ctx.fillStyle = `rgba(255, 246, 210, ${.5 * (1 - u / .08)})`;
    ctx.fillRect(ox - 120, oy - 140, 240, 220);
  }
  // cột sáng vàng phụt lên
  const beamH = 150 * Math.min(1, u * 5);
  const beamW = 18 * (1 - u * .6);
  const beam = ctx.createLinearGradient(0, oy - beamH, 0, oy);
  beam.addColorStop(0, 'rgba(255, 220, 120, 0)');
  beam.addColorStop(.6, `rgba(255, 214, 100, ${.55 * fade})`);
  beam.addColorStop(1, `rgba(255, 250, 220, ${.9 * fade})`);
  ctx.fillStyle = beam;
  ctx.fillRect(ox - beamW / 2, oy - beamH, beamW, beamH);
  // tia sáng quay
  ctx.save();
  ctx.translate(ox, oy - 6);
  ctx.rotate(u * 1.6);
  for (let i = 0; i < 10; i++) {
    ctx.rotate(Math.PI / 5);
    const len = (46 + (i % 3) * 14) * Math.min(1, u * 4);
    ctx.fillStyle = `rgba(255, 205, 90, ${.32 * fade})`;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(len, -5);
    ctx.lineTo(len, 5);
    ctx.lineTo(0, 2);
    ctx.fill();
  }
  ctx.restore();
  // vòng sóng
  const ring = 8 + u * 70;
  ctx.strokeStyle = `rgba(255, 230, 150, ${.6 * (1 - u)})`;
  ctx.lineWidth = 3 * (1 - u) + 1;
  ctx.beginPath();
  ctx.ellipse(ox, oy + 6, ring, ring * .45, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  // xu vàng + tinh thể văng theo đường parabol
  const tt = (t - 200) / 1000;
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (i - 7.5) * .16 + Math.sin(i * 12.9) * .08;
    const sp = 95 + (i * 37) % 60;
    const x = ox + Math.cos(a) * sp * tt * 1.3;
    const y = oy - 8 + Math.sin(a) * sp * tt * 1.6 + 260 * tt * tt;
    if (y > oy + 14) continue; // rơi xuống đất thì biến mất
    const crystal = i % 4 === 0;
    const spin = Math.floor(t / 70 + i) % 4;
    const w = crystal ? 3 : spin === 1 || spin === 3 ? 2 : 4;
    px(ctx, crystal ? '#7fe3ff' : '#c7861c', x - w / 2, y - 2, w, 4);
    px(ctx, crystal ? '#e6fbff' : '#ffe27a', x - w / 2, y - 2, Math.max(1, w - 1), 2);
  }
  // lấp lánh
  for (let i = 0; i < 12; i++) {
    const k = ((t / 600) + i * .083) % 1;
    const x = ox + Math.sin(i * 7.3) * (10 + i * 3);
    const y = oy - 10 - k * 90;
    if (Math.floor(t / 90 + i) % 3) px(ctx, `rgba(255, 252, 220, ${(1 - k) * fade})`, x, y, 2, 2);
  }
  // chữ phần thưởng bay lên
  const rise = Math.min(1, u * 2.2);
  const ty = oy - 58 - rise * 30;
  ctx.globalAlpha = fade * Math.min(1, u * 6);
  ctx.font = '700 15px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1b1006';
  for (const [line, color, dy] of [[`+${fx.seal} Ấn Tinh Tú`, '#ffd66b', 0], [`+${fx.crystal} Tinh Thể EXP`, '#8fe8ff', 18]] as const) {
    ctx.strokeText(line, ox, ty + dy);
    ctx.fillStyle = color;
    ctx.fillText(line, ox, ty + dy);
  }
  ctx.restore();
}

export function renderOverworldFrame(params: {
  ctx: CanvasRenderingContext2D;
  nowMs: number;
  tmj: TiledTmjMap;
  realm: RealmMapSpec;
  profile: ExpeditionProfile;
  rt: OverworldRuntimeState;
  leaderMovementPath?: string;
}): void {
  const { ctx, nowMs, tmj, realm, profile, rt } = params;
  ctx.imageSmoothingEnabled = false;

  const worldW = tmj.width * TILE;
  const worldH = tmj.height * TILE;
  const camX = Math.round(Math.max(0, Math.min(worldW - OVERWORLD_VIEW_W, rt.px * TILE - OVERWORLD_VIEW_W / 2)));
  const camY = Math.round(Math.max(0, Math.min(worldH - OVERWORLD_VIEW_H, rt.py * TILE - OVERWORLD_VIEW_H / 2)));

  ctx.fillStyle = '#110f1d';
  ctx.fillRect(0, 0, OVERWORLD_VIEW_W, OVERWORLD_VIEW_H);

  const tileset = getCachedImage(`overworld/${realm.theme}-tileset.png`);
  const candidateTerrain = getCachedImage(`maps/${realm.mapId}/terrain.png`);
  const terrain = candidateTerrain?.naturalWidth === worldW && candidateTerrain?.naturalHeight === worldH ? candidateTerrain : undefined;
  const animStrip = getCachedImage(`overworld/${realm.theme}-anim.png`);
  const flagImg = getCachedImage(`structures/${realm.theme}/rest-anchor-flag.png`) ?? getCachedImage('structures/rest-anchor-flag/rest-anchor-flag.png');
  const fire = getCachedImage('structures/rest-bonfire/rest-bonfire.png');
  const gateImg = getCachedImage(`structures/${realm.theme}/realm-warp-gate.png`) ?? getCachedImage('structures/realm-warp-gate/realm-warp-gate.png');
  const leaderHeroId = profile.activeParty[0] ?? 'gustave_blade';
  const leaderSheet = getCachedImage(params.leaderMovementPath ?? `units/heroes/${leaderHeroId}-movement.png`);

  const animFrame8 = Math.floor(nowMs / 135) % 8;
  const animFrame4 = Math.floor(nowMs / 180) % 4;
  const animFrame6 = Math.floor(nowMs / 120) % 6;
  const meadow = realm.theme === 'meadow';
  const sceneBeat = Math.floor(nowMs / 135);
  const drawables: Array<{ sortY: number; draw: () => void }> = [];
  const seals: { x: number; y: number }[] = [];

  // 1. Tile Layer
  const layer = tmj.layers[0];
  const xStart = Math.max(0, Math.floor(camX / TILE));
  const xEnd = Math.min(tmj.width - 1, Math.ceil((camX + OVERWORLD_VIEW_W) / TILE));
  const yStart = Math.max(0, Math.floor(camY / TILE));
  const yEnd = Math.min(tmj.height - 1, Math.ceil((camY + OVERWORLD_VIEW_H) / TILE));

  if (terrain) ctx.drawImage(terrain, -camX, -camY);
  for (let ty = yStart; ty <= yEnd; ty++) {
    for (let tx = xStart; tx <= xEnd; tx++) {
      let gid = layer.data[ty * tmj.width + tx] ?? 1;
      const sx = tx * TILE - camX;
      const sy = ty * TILE - camY;

      // Unlocked barrier tiles render cleanly as open road (GID 3)
      if (gid === 7 && isTileWalkable(tmj, tx, ty, realm, profile.clearedGatekeepers)) {
        gid = 3;
      }

      if (terrain && gid === 5) {
        // mặt nước lấp lánh trên ảnh địa hình tĩnh
        const ph = (nowMs / 900 + tx * 0.37 + ty * 0.61) % 3;
        if (ph < 0.5) {
          ctx.fillStyle = `rgba(236, 248, 255, ${0.55 * Math.sin(ph / 0.5 * Math.PI)})`;
          ctx.fillRect(sx + ((tx * 11 + ty * 5) % 22) + 4, sy + ((tx * 7 + ty * 13) % 20) + 6, 6, 2);
        }
      }
      if (!terrain && gid === 5 && animStrip) {
        ctx.drawImage(animStrip, animFrame8 * TILE, 0, TILE, TILE, sx, sy, TILE, TILE);
      } else if (!terrain && tileset) {
        const srcIdx = Math.max(0, Math.min(7, gid - 1));
        ctx.drawImage(tileset, srcIdx * TILE, 0, TILE, TILE, sx, sy, TILE, TILE);
      }

      if (meadow && terrain && gid === 5) {
        drawMeadowCurrent(ctx, sx, sy, tx, ty, sceneBeat,
          layer.data[(ty - 1) * tmj.width + tx] === 5,
          tx > 0 && layer.data[ty * tmj.width + tx - 1] === 5);
      }

      // Locked gate barrier glowing seal highlight
      if (gid === 7) seals.push({ x: sx + 16, y: sy });
    }
  }

  if (meadow) drawMeadowScenery({ ctx, tmj, camX, camY, viewW: OVERWORLD_VIEW_W, viewH: OVERWORLD_VIEW_H,
    leaderX: rt.px, leaderY: rt.py, beat: sceneBeat, drawables });
  drawMonuments(ctx, tmj, realm.theme, camX, camY, nowMs, drawables);

  if (seals.length) {
    ctx.strokeStyle = 'rgba(222, 161, 106, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const { x, y } of seals) {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + TILE);
    }
    ctx.stroke();
  }
  for (const link of mapCrossings(tmj)) drawCrossing(ctx, link, camX, camY);

  // 2. Treasure Chests — còn đồ: rương vàng phát sáng + dấu ✦ nhấp nhô; đã mở: nắp lật, lòng rương tối, xám đi.
  for (const ch of realm.chests) {
    const cx = ch.x * TILE - camX;
    const cy = ch.y * TILE - camY;
    if (cx < -96 || cy < -128 || cx > OVERWORLD_VIEW_W + 64 || cy > OVERWORLD_VIEW_H + 64) continue;
    const fx = rt.chestFx?.chestId === ch.chestId ? rt.chestFx : undefined;
    const fxT = fx ? nowMs - fx.startMs : Infinity;
    const opened = profile.openedChests.includes(ch.chestId) || fxT < CHEST_FX_MS;
    drawables.push({ sortY: ch.y + .05, draw: () => drawChest(ctx, cx, cy, opened, fxT, nowMs) });
    if (fx && fxT < CHEST_FX_MS) drawables.push({ sortY: ch.y + 50, draw: () => drawChestBurst(ctx, cx + 16, cy + 18, fxT, fx) });
  }

  // 3. Rest shrines share the depth order of the party and tall scenery.
  if (fire || flagImg) {
    for (const anc of realm.restAnchors) {
      const ax = anc.x * TILE - camX - 48;
      const ay = anc.y * TILE - camY - 88;
      if (ax > OVERWORLD_VIEW_W || ay > OVERWORLD_VIEW_H || ax < -158 || ay < -158) continue;
      if (fire) {
        const glow = ctx.createRadialGradient(ax + 64, ay + 91, 12, ax + 64, ay + 91, 83);
        glow.addColorStop(0, '#ffb65f5a');
        glow.addColorStop(.48, '#eb884a23');
        glow.addColorStop(1, '#eb884a00');
        ctx.fillStyle = glow;
        ctx.fillRect(ax - 19, ay + 8, 166, 166);
        drawables.push({ sortY: anc.y + .1, draw: () => ctx.drawImage(fire, animFrame8 * 128, 0, 128, 128, ax, ay, 128, 128) });
      } else if (flagImg) {
        drawables.push({ sortY: anc.y + .1, draw: () => ctx.drawImage(flagImg, animFrame4 * 128, 0, 128, 128, ax, ay, 128, 128) });
      }
    }
  }

  // 4. Boss Sanctuary Archway & Portals (4-frame animated archway)
  if (gateImg) {
    const bossCleared = profile.clearedBosses.includes(realm.bossAltar.bossId);
    const bx = realm.bossAltar.x * TILE - camX - 48;
    const by = realm.bossAltar.y * TILE - camY - 88;
    ctx.drawImage(gateImg, (1 + (animFrame4 % 3)) * 128, 0, 128, 128, bx, by, 128, 128);

    // Boss emblem crown
    ctx.fillStyle = bossCleared ? '#34d399' : '#f43f5e';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bossCleared ? '★ ĐÃ CHINH PHỤC' : '⚔ ĐẠI TRÙM', bx + 64, by + 16);

    if (realm.exitPortal) {
      const ex = realm.exitPortal.x * TILE - camX - 48;
      const ey = realm.exitPortal.y * TILE - camY - 88;
      const openFrame = bossCleared ? 1 + (animFrame4 % 3) : 0;
      ctx.drawImage(gateImg, openFrame * 128, 0, 128, 128, ex, ey, 128, 128);
    }
    if (realm.backPortal) {
      const px = realm.backPortal.x * TILE - camX - 48;
      const py = realm.backPortal.y * TILE - camY - 88;
      ctx.drawImage(gateImg, 2 * 128, 0, 128, 128, px, py, 128, 128);
    }
  }

  // 5. Y-Sorted Entities (Party Leader + Patrolling Gatekeepers)

  for (const gkId of realm.gatekeeperIds) {
    if (!isEncounterPresent(profile, gkId)) continue;
    const gk = EXPEDITION_GATEKEEPERS_BY_ID[gkId];
    if (!gk) continue;
    const k = respawnProgress(rt, gkId, nowMs);
    if (k <= 0) continue;
    const pos = getPatrolPosition(gk, nowMs);
    const gkImg = getCachedImage(`units/gatekeepers/${gk.archetype}-movement.png`);
    drawables.push({
      sortY: pos.y,
      draw: () => {
        const dx = Math.round(pos.x * TILE - camX - 16);
        const dy = Math.round(pos.y * TILE - camY - 30);
        ctx.fillStyle = '#12101899';
        ctx.beginPath();
        ctx.ellipse(dx + 32, dy + 54, 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        if (gkImg) drawPopIn(ctx, k, dx + 32, dy + 56, () => ctx.drawImage(gkImg, animFrame6 * 64, pos.dir * 64, 64, 64, dx, dy, 64, 64));
        if (meadow && terrain) drawMeadowGrassCover(ctx, terrain, tmj, pos.x, pos.y, camX, camY);
        if (!meadow) drawGrassCover(ctx, tmj, pos.x, pos.y, dx + 32, dy + 56, nowMs);
        drawRespawnGlow(ctx, dx + 32, dy + 34, k);
      },
    });
  }

  for (const w of wildPacksOf(realm)) {
    if (!isEncounterPresent(profile, w.wildId)) continue;
    const k = respawnProgress(rt, w.wildId, nowMs);
    if (k <= 0) continue;
    const pos = getWildPosition(w, nowMs, tmj);
    const lead = getCachedImage(wildSheetOf(w.monsterIds[0]));
    const second = w.monsterIds[1] ? getCachedImage(wildSheetOf(w.monsterIds[1])) : undefined;
    drawables.push({
      sortY: pos.y,
      draw: () => {
        const dx = Math.round(pos.x * TILE - camX - 16);
        const dy = Math.round(pos.y * TILE - camY - 30);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.beginPath();
        ctx.ellipse(dx + 32, dy + 56, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        drawPopIn(ctx, k, dx + 32, dy + 56, () => {
          if (second) ctx.drawImage(second, ((animFrame6 + 3) % 6) * 64, pos.dir * 64, 64, 64, dx + 14, dy - 6, 52, 52);
          if (lead) ctx.drawImage(lead, animFrame6 * 64, pos.dir * 64, 64, 64, dx, dy, 64, 64);
        });
        if (meadow && terrain) drawMeadowGrassCover(ctx, terrain, tmj, pos.x, pos.y, camX, camY);
        if (!meadow) drawGrassCover(ctx, tmj, pos.x, pos.y, dx + 32, dy + 56, nowMs);
        drawRespawnGlow(ctx, dx + 32, dy + 34, k);
      },
    });
  }

  drawables.push({
    sortY: rt.py,
    draw: () => {
      const px = Math.round(rt.px * TILE - camX - 16);
      const py = Math.round(rt.py * TILE - camY - 32);
      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.beginPath();
      ctx.ellipse(px + 32, py + 58, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      if (leaderSheet) {
        const row = (rt.moving ? 4 : 0) + rt.dir;
        const blinkSkip = nowMs < rt.immunityUntilMs && Math.floor(nowMs / 90) % 2 === 0;
        if (!blinkSkip) {
          const size = leaderHeroId === 'jung_afterglow' ? 72 : 64;
          const left = px + (64 - size) / 2;
          const top = py + 58 - Math.round(58 * size / 64) - (rt.lift ?? 0);
          ctx.drawImage(leaderSheet, animFrame6 * 64, row * 64, 64, 64, left, top, size, size);
          if (meadow && terrain && (rt.lift ?? 0) < 5) drawMeadowGrassCover(ctx, terrain, tmj, rt.px, rt.py, camX, camY);
        }
        if (!rt.lift && !meadow) drawGrassCover(ctx, tmj, rt.px, rt.py, px + 32, py + 58, nowMs);
      }
    },
  });

  drawables.sort((a, b) => a.sortY - b.sortY);
  for (const item of drawables) item.draw();

  // 6a. Cực Quang Bắc Cực: các dải màn sáng uốn lượn trôi trên bầu trời đêm (vẽ cộng sáng, rất nhẹ)
  if (realm.theme === 'aurora') drawAuroraCurtains(ctx, nowMs, camX);

  // 6. Living Biome Weather / Aurora Stardust Particles
  const auroraColors = ['#5eead4', '#38bdf8', '#c084fc', '#f472b6', '#fde047'];
  for (let i = 0; i < 26; i++) {
    const wx = ((i * 97 + Math.floor(nowMs * 0.03 * (i % 2 === 0 ? 1 : -0.7))) % OVERWORLD_VIEW_W + OVERWORLD_VIEW_W) % OVERWORLD_VIEW_W;
    const wy = ((i * 53 + Math.floor(nowMs * (realm.theme === 'volcano' || realm.theme === 'underwater' ? -0.035 : 0.035))) % OVERWORLD_VIEW_H + OVERWORLD_VIEW_H) % OVERWORLD_VIEW_H;
    ctx.fillStyle =
      realm.theme === 'aurora'
        ? auroraColors[i % auroraColors.length]
        : realm.theme === 'volcano'
          ? '#fb923c'
          : realm.theme === 'snow'
            ? '#f8fafc'
            : realm.theme === 'night'
              ? '#e879f9'
              : 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(wx, wy, realm.theme === 'aurora' ? 3 : 2, realm.theme === 'aurora' ? 3 : 2);
  }

}
