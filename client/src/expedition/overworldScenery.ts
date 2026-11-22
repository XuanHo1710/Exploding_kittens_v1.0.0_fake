import { getCachedImage, MEADOW_LANDSCAPE_ATLAS, type TiledTmjMap } from './assetLoader';

type Drawable = { sortY: number; draw: () => void };

// Atlas cells follow the Tiled structure types in tools/expedition/meadow_landscape.py.
const SCENERY = new Map([
  ['stone-bridge',    { index: 0, size: 154 }],
  ['wooden-landing',  { index: 1, size:  81, ground: true }],
  ['tall-grass',      { index: 2, size:  58, grass: true }],
  ['reeds',           { index: 3, size:  57, grass: true }],
  ['river-stones',    { index: 4, size:  58, ground: true }],
  ['ruin-wall',       { index: 5, size: 108 }],
  ['lily-pads',       { index: 6, size:  36, ground: true }],
  ['fallen-log',      { index: 7, size:  67 }],
  ['cascade',         { index: 8, size:  74, ground: true }],
]);

export function drawMeadowGrassCover(ctx: CanvasRenderingContext2D, terrain: HTMLImageElement,
  tmj: TiledTmjMap, tileX: number, tileY: number, camX: number, camY: number): void {
  const row = Math.round(tileY);
  const { tilewidth, tileheight, width } = tmj;
  const grid = tmj.layers[0].data;
  if (grid[row * width + Math.round(tileX)] !== 2) return;

  // Reuse the grass directly under the feet, with a pixel-stepped silhouette along its top edge.
  const x = Math.round(tileX * tilewidth + tilewidth / 2);
  const y = Math.round(tileY * tileheight + 25);
  for (let dx = -14; dx < 14; dx += 2) {
    const sx = x + dx;
    if (grid[row * width + Math.floor(sx / tilewidth)] !== 2) continue;
    const blade = 10 + (sx * 11 % 9);
    const top = y - blade + Math.floor(Math.abs(dx) / 5);
    ctx.drawImage(terrain, sx, top, 2, y - top + 1, sx - camX, top - camY, 2, y - top + 1);
  }
}

export function drawMeadowCurrent(ctx: CanvasRenderingContext2D, sx: number, sy: number,
  tx: number, ty: number, beat: number, northWater: boolean, westWater: boolean): void {
  const id = (tx * 73 + ty * 121) % 101;
  if (!northWater || !westWater) {
    ctx.fillStyle = '#84b4a044';
    if (!northWater) ctx.fillRect(sx + 6 + id % 5, sy + 2 + id % 3, 10 + id % 9, 1);
    if (!westWater) ctx.fillRect(sx + 3 + id % 2, sy + 8 + id % 9, 1, 10);
  }
  if (id % 6 > 3) return;
  const step = (id + beat) % 13;
  const x = sx + 3 + (id + beat * 2) % 13;
  const y = sy + 6 + (id * 3 + beat) % 19;
  ctx.fillStyle = step < 4 ? '#bcdfd454' : '#86b7bf35';
  ctx.fillRect(x, y, 5 + id % 7, 1);
  if (step < 4) ctx.fillRect(x + 3, y + 2, 2 + id % 4, 1);
}

export function drawMeadowScenery(params: {
  ctx: CanvasRenderingContext2D;
  tmj: TiledTmjMap;
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  leaderX: number;
  leaderY: number;
  beat: number;
  drawables: Drawable[];
}): void {
  const atlas = getCachedImage(MEADOW_LANDSCAPE_ATLAS);
  if (!atlas) return;
  const { ctx, tmj, camX, camY, viewW, viewH, leaderX, leaderY, beat, drawables } = params;
  const cell = 128;
  for (const item of tmj.layers.find((layer) => layer.name === 'landscape')?.objects ?? []) {
    const prop = SCENERY.get(item.type);
    if (!prop || item.visible === false) continue;
    const bridge = item.type === 'stone-bridge';
    const centerX = item.x + (bridge ? tmj.tilewidth : 0) - camX;
    const centerY = item.y - camY;
    const size = prop.size;
    if (centerX < -size || centerX > viewW + size || centerY < -size || centerY > viewH + size) continue;
    const sourceX = (prop.index % 3) * cell;
    const sourceY = Math.floor(prop.index / 3) * cell;
    const x = Math.round(centerX - size / 2);
    if (bridge) {
      // The Tiled point marks the seal at the west end of a three-tile crossing.
      const edgeHeight = Math.round(size * .6);
      const edge = (y: number) => ctx.drawImage(atlas, sourceX, sourceY, cell, cell,
        x, Math.round(y - edgeHeight / 2), size, edgeHeight);
      edge(centerY - tmj.tileheight * 1.4);
      drawables.push({ sortY: item.y / tmj.tileheight + 1.2,
        draw: () => edge(centerY + tmj.tileheight * 1.48) });
      continue;
    }
    if (prop.ground) {
      const y = Math.round(centerY - size / 2);
      ctx.drawImage(atlas, sourceX, sourceY, cell, cell, x, y, size, size);
      if (item.type === 'cascade') {
        ctx.fillStyle = '#cbebde87';
        ctx.fillRect(centerX - 7 + beat % 4, centerY + 13 + beat % 6, 9 - beat % 4, 1);
      }
      continue;
    }
    const sortY = item.y / tmj.tileheight - .26;
    const y = Math.round(centerY + 14 - size);
    const nearLeader = prop.grass && Math.abs(leaderX * tmj.tilewidth + 16 - item.x) < size * .45
      && sortY - leaderY >= 0 && sortY - leaderY < 1;
    drawables.push({ sortY, draw: () => {
      if (nearLeader) ctx.globalAlpha = .8;
      ctx.drawImage(atlas, sourceX, sourceY, cell, cell, x, y, size, size);
      if (nearLeader) ctx.globalAlpha = 1;
    } });
  }
}
