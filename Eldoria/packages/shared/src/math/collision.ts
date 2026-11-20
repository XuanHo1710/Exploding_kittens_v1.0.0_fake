/**
 * Pure TypeScript Shared AABB & Tilemap Collision Library (Zero Runtime IO)
 * Imported identically by NestJS 20 Hz Simulation Server & Phaser 3 60 FPS Client
 * Enforces the 4-Box Spatial Contract: Sprite Frame != Hurtbox != Ground Foot Collision != Interaction Box
 */

export interface RectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialBoxes {
  spriteFrame: RectBox;
  hurtbox: RectBox;
  footCollision: RectBox;
  interactionBox: RectBox;
}

export interface TileCollisionMap {
  widthTiles: number;
  heightTiles: number;
  tileSize: number;
  blockedTiles: Uint8Array; // 1 = blocked, 0 = walkable
}

export function compute4BoxesFromFoot(
  footX: number,
  footY: number,
  spriteW = 48,
  spriteH = 64,
  pivotY = 0.875,
): SpatialBoxes {
  const spriteX = Math.round(footX - spriteW / 2);
  const spriteY = Math.round(footY - spriteH * pivotY);
  const footW = Math.round(spriteW * 0.42); // ~20px for 48px hero
  const footH = 12;
  const hurtW = Math.round(spriteW * 0.5);
  const hurtH = Math.round(spriteH * 0.58);
  const interactW = footW + 24;
  const interactH = 28;
  return {
    spriteFrame: { x: spriteX, y: spriteY, width: spriteW, height: spriteH },
    hurtbox: { x: Math.round(footX - hurtW / 2), y: Math.round(footY - hurtH), width: hurtW, height: hurtH },
    footCollision: { x: Math.round(footX - footW / 2), y: Math.round(footY - footH / 2), width: footW, height: footH },
    interactionBox: { x: Math.round(footX - interactW / 2), y: Math.round(footY - interactH / 2), width: interactW, height: interactH },
  };
}

export function boxesOverlap(a: RectBox, b: RectBox): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function isBoxBlockedOnMap(box: RectBox, map: TileCollisionMap): boolean {
  const worldW = map.widthTiles * map.tileSize;
  const worldH = map.heightTiles * map.tileSize;
  if (box.x < 0 || box.y < 0 || box.x + box.width > worldW || box.y + box.height > worldH) {
    return true;
  }
  const minTx = Math.floor(box.x / map.tileSize);
  const maxTx = Math.floor((box.x + box.width - 0.001) / map.tileSize);
  const minTy = Math.floor(box.y / map.tileSize);
  const maxTy = Math.floor((box.y + box.height - 0.001) / map.tileSize);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (tx < 0 || ty < 0 || tx >= map.widthTiles || ty >= map.heightTiles) return true;
      if (map.blockedTiles[ty * map.widthTiles + tx] === 1) return true;
    }
  }
  return false;
}

/**
 * Axis-separated sliding collision step (shared between Client prediction and Server 20 Hz tick).
 */
export function resolveSlidingMove(
  footX: number,
  footY: number,
  dx: number,
  dy: number,
  speedPxPerSec: number,
  dtSec: number,
  map: TileCollisionMap,
  footHalfW = 10,
  footHalfH = 6,
): { x: number; y: number; collided: boolean } {
  const len = Math.hypot(dx, dy);
  if (len < 0.0001 || dtSec <= 0) return { x: footX, y: footY, collided: false };
  const nx = dx / len;
  const ny = dy / len;
  const stepX = nx * speedPxPerSec * dtSec;
  const stepY = ny * speedPxPerSec * dtSec;

  let nextX = footX + stepX;
  let nextY = footY;
  let collided = false;

  const boxX: RectBox = { x: nextX - footHalfW, y: nextY - footHalfH, width: footHalfW * 2, height: footHalfH * 2 };
  if (isBoxBlockedOnMap(boxX, map)) {
    nextX = footX;
    collided = true;
  }

  const candY = footY + stepY;
  const boxY: RectBox = { x: nextX - footHalfW, y: candY - footHalfH, width: footHalfW * 2, height: footHalfH * 2 };
  if (isBoxBlockedOnMap(boxY, map)) {
    nextY = footY;
    collided = true;
  } else {
    nextY = candY;
  }

  return { x: nextX, y: nextY, collided };
}

export function distancePx(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}
