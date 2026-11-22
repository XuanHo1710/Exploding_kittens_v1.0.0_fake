/**
 * Cached loader for multi-frame PNG sprite sheets, battle scenes, and Tiled `.tmj` maps
 * under `/database-astral-expedition`.
 */

import { ASTRAL_EXPEDITION_STATIC_ROOT, type RealmMapId } from '../../../shared/src';
import { SERVER_URL } from '../serverUrl';

export interface TiledTmjMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: Array<{
    name: string;
    type: string;
    width: number;
    height: number;
    data: number[];
    objects?: Array<{ name: string; type: string; x: number; y: number; visible?: boolean; properties?: Array<{ name: string; value: unknown }> }>;
  }>;
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
const imgReady = new Map<string, HTMLImageElement>();
const tmjCache = new Map<string, Promise<TiledTmjMap>>();
const arenaAtlasCache = new Map<RealmMapId, Promise<ArenaPropAtlas>>();
const arenaAtlasReady = new Map<RealmMapId, ArenaPropAtlas>();
export const MEADOW_LANDSCAPE_ATLAS = 'structures/meadow/waterworks.png';
export const STATUS_ICON_ATLAS = 'ui/status-icons.png';

export interface ArenaPropAtlas {
  width: number;
  height: number;
  frames: { name: string; x: number; y: number; w: number; h: number; worldH: number }[];
}

export function getCachedArenaAtlas(mapId: RealmMapId): ArenaPropAtlas | undefined {
  return arenaAtlasReady.get(mapId);
}

export function loadArenaAtlas(mapId: RealmMapId): Promise<ArenaPropAtlas> {
  const pending = arenaAtlasCache.get(mapId);
  if (pending) return pending;

  const request = fetch(expeditionAssetUrl(`battle-scenes/${mapId}/arena/props.json`)).then(async (response) => {
    if (!response.ok) throw new Error(`Cannot load arena props for ${mapId} (${response.status})`);
    const atlas = await response.json() as ArenaPropAtlas;
    if (!Array.isArray(atlas.frames) || !(atlas.width > 0 && atlas.height > 0)) {
      throw new Error(`Invalid arena prop atlas for ${mapId}`);
    }
    arenaAtlasReady.set(mapId, atlas);
    return atlas;
  }).catch((error: unknown) => {
    arenaAtlasCache.delete(mapId);
    throw error;
  });
  arenaAtlasCache.set(mapId, request);
  return request;
}

export interface HeroOutfit {
  variantId: string;
  heroId: string;
  nameVi: string;
  battle: string;
  movement: string;
  /** chân dung vẽ riêng cho trang phục */
  portrait?: string;
}

/** Chân dung đang mặc của từng anh hùng (trang phục đã chọn) — portraitUrl đọc từ đây. */
const outfitPortraits = new Map<string, string>();
export function setOutfitPortraits(looks: readonly HeroOutfit[]): void {
  outfitPortraits.clear();
  for (const o of looks) if (o.portrait) outfitPortraits.set(o.heroId, o.portrait);
}
export function outfitPortraitOf(heroId: string): string | undefined {
  return outfitPortraits.get(heroId);
}

export async function loadHeroWardrobe(): Promise<HeroOutfit[]> {
  const response = await fetch(expeditionAssetUrl('units/heroes/variants/wardrobe.json'));
  if (!response.ok) return [];
  const data: { variants?: HeroOutfit[] } = await response.json();
  return (data.variants ?? []).filter((outfit) => {
    const stem = `units/heroes/variants/${outfit.heroId}-${outfit.variantId}`;
    return /^[a-z0-9_]+$/.test(outfit.heroId) && /^[a-z0-9-]+$/.test(outfit.variantId)
      && outfit.battle === `${stem}-battle.png` && outfit.movement === `${stem}-movement.png`
      && (outfit.portrait === undefined || outfit.portrait === `${stem}-portrait.png`);
  });
}

export function expeditionAssetUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '');
  const base = SERVER_URL ? SERVER_URL.replace(/\/+$/, '') : '';
  const revision = import.meta.env.VITE_EXPEDITION_ASSET_REVISION;
  const url = `${base}${ASTRAL_EXPEDITION_STATIC_ROOT}/${clean}`;
  return revision ? `${url}?v=${revision}` : url;
}

export function getCachedImage(relPath: string): HTMLImageElement | undefined {
  return imgReady.get(relPath);
}

export function loadExpeditionImage(relPath: string): Promise<HTMLImageElement> {
  const ready = imgReady.get(relPath);
  if (ready) return Promise.resolve(ready);
  const inflight = imgCache.get(relPath);
  if (inflight) return inflight;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      imgReady.set(relPath, img);
      resolve(img);
    };
    img.onerror = () => {
      imgCache.delete(relPath);
      reject(new Error(`Không tải được ảnh pixel: ${relPath}`));
    };
    img.src = expeditionAssetUrl(relPath);
  });
  imgCache.set(relPath, p);
  return p;
}

export function loadRealmTmj(mapId: RealmMapId): Promise<TiledTmjMap> {
  const rel = `maps/${mapId}/${mapId}.tmj`;
  const existing = tmjCache.get(rel);
  if (existing) return existing;

  const p = fetch(expeditionAssetUrl(rel)).then(async (res) => {
    if (!res.ok) throw new Error(`Không tải được bản đồ ${mapId} (${res.status})`);
    return (await res.json()) as TiledTmjMap;
  }).catch((error: unknown) => {
    tmjCache.delete(rel);
    throw error;
  });
  tmjCache.set(rel, p);
  return p;
}

export async function preloadOverworldAssets(params: {
  mapId: RealmMapId;
  theme: string;
  leaderHeroId: string;
  leaderMovementPath?: string;
  gatekeeperArchetypes: readonly string[];
  extraSheets?: readonly string[];
}): Promise<TiledTmjMap> {
  const jobs: Promise<unknown>[] = [
    loadExpeditionImage(`overworld/${params.theme}-tileset.png`),
    loadExpeditionImage(`overworld/${params.theme}-anim.png`),
    loadExpeditionImage('structures/rest-anchor-flag/rest-anchor-flag.png'),
    loadExpeditionImage('structures/rest-bonfire/rest-bonfire.png').catch(() => undefined),
    loadExpeditionImage('structures/realm-warp-gate/realm-warp-gate.png'),
    loadExpeditionImage(params.leaderMovementPath ?? `units/heroes/${params.leaderHeroId}-movement.png`),
    loadExpeditionImage(`units/heroes/${params.leaderHeroId}-portrait.png`),
    loadExpeditionImage(`maps/${params.mapId}/terrain.png`).catch(() => undefined),
    loadExpeditionImage(`structures/${params.theme}/rest-anchor-flag.png`).catch(() => undefined),
    loadExpeditionImage(`structures/${params.theme}/realm-warp-gate.png`).catch(() => undefined),
    loadExpeditionImage(`structures/${params.theme}/monuments.png`).catch(() => undefined),
  ];
  for (const arch of params.gatekeeperArchetypes) {
    jobs.push(loadExpeditionImage(`units/gatekeepers/${arch}-movement.png`));
  }
  if (params.theme === 'meadow') jobs.push(loadExpeditionImage(MEADOW_LANDSCAPE_ATLAS).catch(() => undefined));
  for (const rel of params.extraSheets ?? []) jobs.push(loadExpeditionImage(rel).catch(() => undefined));
  const [tmj] = await Promise.all([loadRealmTmj(params.mapId), ...jobs]);
  return tmj;
}

export async function preloadBattleAssets(params: {
  mapId: RealmMapId;
  heroIds: readonly string[];
  encounterKind: 'gatekeeper' | 'boss' | 'wild';
  enemySpriteKeys: readonly string[];
  /** đường dẫn sprite đầy đủ (ưu tiên) */
  spriteRefs?: readonly string[];
}): Promise<void> {
  const jobs: Promise<unknown>[] = [
    loadExpeditionImage(STATUS_ICON_ATLAS).catch(() => undefined),
    loadExpeditionImage(`battle-scenes/${params.mapId}/backdrop.png`),
    // bộ sân khấu 3D (chỉ vùng nào đã vẽ mới có; thiếu thì bỏ qua)
    ...['ground', 'floor', 'panorama', 'props'].map((n) => loadExpeditionImage(`battle-scenes/${params.mapId}/arena/${n}.png`).catch(() => undefined)),
    loadArenaAtlas(params.mapId).catch(() => undefined),
    loadExpeditionImage(`battle-scenes/${params.mapId}/ambient-anim.png`),
  ];
  for (const h of params.heroIds) {
    jobs.push(loadExpeditionImage(`units/heroes/${h}-battle.png`));
    jobs.push(loadExpeditionImage(`units/heroes/${h}-portrait.png`));
  }
  for (const rel of new Set(params.spriteRefs ?? [])) jobs.push(loadExpeditionImage(rel));
  for (const key of params.spriteRefs?.length ? [] : params.enemySpriteKeys) {
    if (params.encounterKind === 'boss') {
      jobs.push(loadExpeditionImage(`units/bosses/${key}-battle.png`));
    } else {
      jobs.push(loadExpeditionImage(`units/gatekeepers/${key}-battle.png`));
    }
  }
  await Promise.all(jobs);
}
