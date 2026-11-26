import { CAMPAIGN, type CampaignActorFrame, type CampaignFrame, type CampaignHazard } from '../../../shared/src/mk/campaign';
import { MK_STATIC_ROOT } from '../../../shared/src/mk/types';

export const CAMPAIGN_ART = `${MK_STATIC_ROOT}/campaign`;
const loaded = new Map<string, HTMLImageElement>();

function asset(path: string): HTMLImageElement | undefined {
  let image = loaded.get(path);
  if (!image) {
    image = new Image();
    image.src = `${CAMPAIGN_ART}/${path}`;
    loaded.set(path, image);
  }
  return image.complete && image.naturalWidth ? image : undefined;
}

export function preloadCampaign() {
  asset(CAMPAIGN.maps[0].art);
  for (const hero of CAMPAIGN.heroes) {
    asset(`art/${hero.id}.png`);
    asset(`art/${hero.id}-vfx.png`);
  }
  for (const enemy of [...CAMPAIGN.enemies, CAMPAIGN.boss]) asset(`art/${enemy.id}.png`);
}

export interface SceneFrames {
  previous?: CampaignFrame;
  current?: CampaignFrame;
  received: number;
}

function drawTelegraph(g: CanvasRenderingContext2D, h: CampaignHazard, time: number) {
  const remaining = h.impactAt - time;
  g.save();
  g.translate(h.x, h.y);
  g.scale(h.facing, 1);
  g.strokeStyle = remaining > 160 ? '#f6c58a' : '#ffe8bc';
  g.fillStyle = remaining > 160 ? '#962c4380' : '#e440528f';
  g.lineWidth = 1.4;
  g.setLineDash([4, 3]);
  g.beginPath();
  if (h.shape === 'band') g.rect(0, -h.depth, h.radius, h.depth * 2);
  if (h.shape === 'fan') {
    g.moveTo(0, -h.depth * .28);
    g.lineTo(h.radius, -h.depth);
    g.lineTo(h.radius, h.depth);
    g.lineTo(0, h.depth * .28);
    g.closePath();
  }
  if (h.shape === 'circle') g.ellipse(0, 0, h.radius, h.radius / 2, 0, 0, Math.PI * 2);
  if (h.shape === 'ring') {
    const gap = Math.asin(Math.min(1, 54 / h.radius));
    g.ellipse(0, 0, h.radius, h.radius / 2, 0, gap, Math.PI * 2 - gap);
    g.lineTo(0, -27); g.lineTo(0, 27); g.closePath();
  }
  g.fill();
  g.stroke();
  g.restore();
}

function drawActor(g: CanvasRenderingContext2D, a: CampaignActorFrame, controlled: boolean) {
  const image = asset(`art/${a.asset}.png`);
  const size = a.boss ? 80 : 48;
  const anchor = a.boss ? 74 : 44;
  const x = Math.round(a.x), y = Math.round(a.y);
  g.fillStyle = '#16132197';
  g.beginPath();
  g.ellipse(x, y - 1, a.boss ? 24 : 11, a.boss ? 5 : 3, 0, 0, Math.PI * 2);
  g.fill();
  if (controlled && a.hp > 0) {
    g.strokeStyle = '#fbde9f';
    g.setLineDash([3, 2]);
    g.beginPath();
    g.ellipse(x, y, 14, 5, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  if (image) {
    g.save();
    g.translate(x, y);
    g.scale(a.facing, 1);
    g.drawImage(image, a.pose * size, 0, size, size, -size / 2, -anchor, size, size);
    g.restore();
  }
  if (!a.boss && a.hp > 0 && (a.side === 'hero' || a.hp < a.maxHp)) {
    const barY = y - (a.side === 'hero' ? 40 : 32);
    g.fillStyle = '#1d1426';
    g.fillRect(x - 13, barY, 26, 4);
    g.fillStyle = a.side === 'hero' ? '#77e2b0' : '#ee7476';
    g.fillRect(x - 12, barY + 1, Math.ceil(24 * a.hp / a.maxHp), 2);
  }
}

export function drawCampaign(g: CanvasRenderingContext2D, frames: SceneFrames, wallTime: number, reduced: boolean) {
  const [w, h] = CAMPAIGN.viewport;
  const background = asset(CAMPAIGN.maps[0].art);
  g.imageSmoothingEnabled = false;
  if (background) g.drawImage(background, 0, 0, w, h);
  else { g.fillStyle = '#24202b'; g.fillRect(0, 0, w, h); }
  const { current, previous } = frames;
  if (!current) return;
  const dt = wallTime - frames.received;
  const alpha = previous?.attemptId === current.attemptId ? Math.max(0, Math.min(1, dt / 67)) : 1;
  const prior = new Map(alpha < 1 ? previous?.actors.map((a) => [a.id, a]) : []);
  const time = current.time + Math.min(75, Math.max(0, dt));
  for (const p of current.spawn) {
    g.strokeStyle = '#ffdf90';
    g.lineWidth = 2;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.ellipse(p.x, p.y, 16, 7, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  const actors = [...current.actors].sort((a, b) => a.y - b.y);
  for (const actor of actors) {
    const p = prior.get(actor.id);
    const a = p ? { ...actor, x: p.x + (actor.x - p.x) * alpha, y: p.y + (actor.y - p.y) * alpha } : actor;
    drawActor(g, a, actor.id === current.controlled);
  }
  for (const fx of current.effects) {
    const age = time - fx.startedAt;
    if (age < 0 || age > 445 || (reduced && age > 90)) continue;
    const img = fx.asset === 'impact' || fx.asset === 'parry' ? undefined : asset(`art/${fx.asset}-vfx.png`);
    if (img) {
      g.save();
      g.translate(Math.round(fx.x), Math.round(fx.y));
      g.scale(fx.facing, 1);
      g.drawImage(img, Math.min(7, Math.floor(age / 54)) * 64, 0, 64, 64, -3, -49, 64, 64);
      g.restore();
    } else if (fx.asset === 'impact' || fx.asset === 'parry') {
      g.fillStyle = fx.asset === 'parry' ? '#9cf4ef' : '#ffe6a4';
      const d = 3 + Math.floor(age / 45);
      g.fillRect(fx.x - d, fx.y - 19, 3, 2);
      g.fillRect(fx.x + d, fx.y - 26, 2, 3);
      g.fillRect(fx.x, fx.y - 21 - d, 2, 2);
    }
  }
  for (const h of current.hazards) drawTelegraph(g, h, time);
}
