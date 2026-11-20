import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  BossTelegraphEvent,
  ChatMessagePayload,
  CombatDamageEvent,
  computeDamageHit,
  distancePx,
  ElementType,
  resolveSlidingMove,
  SkillCastVfxEvent,
  TileCollisionMap,
  WorldEntitySnapshot,
  ZoneSnapshotPayload,
} from '@eldoria/shared';
import { CatalogService } from '../../database/catalog.service';
import { JsonDatabaseEngine } from '../../database/json-database.engine';
import { CharacterEntity, InventoryEntity } from '../../domain/entities';
import { LocalMinioService } from '../../infrastructure/minio/local-minio.service';
import {
  RedisPresenceService,
  RedisRateLimitService,
} from '../../infrastructure/redis/redis-ephemeral.services';
import { CharacterService } from '../character/character.service';
import { EconomyInventoryService } from './economy-inventory.service';

interface LivePlayer {
  characterId: string;
  accountId: string;
  socketId: string;
  name: string;
  heroId: string;
  zoneId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 'down' | 'up' | 'left' | 'right';
  animState: WorldEntitySnapshot['animState'];
  animUntilMs: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  stamina: number;
  maxStamina: number;
  level: number;
  atk: number;
  def: number;
  critRate: number;
  critDamage: number;
  moveSpeed: number;
  element: ElementType;
  invulnUntilMs: number;
  blockUntilMs: number;
  parryUntilMs: number;
  cooldowns: Map<string, number>;
  lastInputSeq: number;
  comboStep: number;
  lastAttackMs: number;
}

interface LiveMob {
  id: string;
  kind: 'MONSTER' | 'ELITE' | 'BOSS';
  templateId: string;
  name: string;
  zoneId: string;
  spawnX: number;
  spawnY: number;
  x: number;
  y: number;
  facing: 'down' | 'up' | 'left' | 'right';
  animState: WorldEntitySnapshot['animState'];
  aiState: 'IDLE' | 'PATROL' | 'CHASE' | 'ATTACK' | 'RETURN' | 'STUNNED' | 'DEAD';
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  atk: number;
  def: number;
  level: number;
  element: ElementType;
  weaknessElement: ElementType;
  moveSpeed: number;
  aggroRadius: number;
  leashRadius: number;
  targetPlayerId: string | null;
  phase: number;
  staggerUntilMs: number;
  nextActionAtMs: number;
  respawnAtMs: number;
  contributors: Set<string>;
}

interface LiveResourceNode {
  id: string;
  zoneId: string;
  name: string;
  resourceType: 'OAK_TREE' | 'COPPER_VEIN' | 'STONE_ROCK' | 'WILD_HERB';
  dropItemId: string;
  x: number;
  y: number;
  depletedUntilMs: number;
}

interface LiveLootDrop {
  id: string;
  zoneId: string;
  ownerCharacterId: string;
  itemId: string;
  quantity: number;
  gold: number;
  x: number;
  y: number;
  expiresAtMs: number;
}

interface ZoneRuntime {
  zoneId: string;
  regionId: string;
  map: TileCollisionMap;
  mobs: Map<string, LiveMob>;
  nodes: Map<string, LiveResourceNode>;
  loot: Map<string, LiveLootDrop>;
  telegraphs: Map<string, BossTelegraphEvent & { resolved?: boolean; damageRatio: number }>;
  chatHistory: ChatMessagePayload[];
}

export interface ZoneBroadcastHooks {
  emitToZone: (zoneId: string, event: string, payload: any) => void;
  emitToSocket: (socketId: string, event: string, payload: any) => void;
}

const ZONE_PORTALS: Record<string, { targetZoneId: string; spawnX: number; spawnY: number }> = {
  reg_greenhaven_village: { targetZoneId: 'reg_whispering_forest', spawnX: 4 * 32, spawnY: 12 * 32 },
  reg_whispering_forest: { targetZoneId: 'dng_mossroot_hollow', spawnX: 13 * 32, spawnY: 16 * 32 },
  dng_mossroot_hollow: { targetZoneId: 'reg_greenhaven_village', spawnX: 10 * 32, spawnY: 12 * 32 },
};

const VILLAGE_NPCS: WorldEntitySnapshot[] = [
  { id: 'npc_elder_rowan', kind: 'NPC', templateId: 'npc_elder_rowan', name: 'Elder Rowan', x: 8 * 32, y: 8 * 32, vx: 0, vy: 0, facing: 'down', animState: 'idle', hp: 999, maxHp: 999, level: 1 },
  { id: 'npc_smith_garrik', kind: 'NPC', templateId: 'npc_smith_garrik', name: 'Blacksmith Garrik', x: 14 * 32, y: 8 * 32, vx: 0, vy: 0, facing: 'down', animState: 'idle', hp: 999, maxHp: 999, level: 1 },
  { id: 'npc_herbalist_mira', kind: 'NPC', templateId: 'npc_herbalist_mira', name: 'Herbalist Mira', x: 8 * 32, y: 15 * 32, vx: 0, vy: 0, facing: 'down', animState: 'idle', hp: 999, maxHp: 999, level: 1 },
  { id: 'npc_scout_talia', kind: 'NPC', templateId: 'npc_scout_talia', name: 'Scout Talia', x: 24 * 32, y: 12 * 32, vx: 0, vy: 0, facing: 'left', animState: 'idle', hp: 999, maxHp: 999, level: 1 },
];

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .slice(0, 220);
}

@Injectable()
export class WorldSimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorldSimulationService.name);
  private readonly zones = new Map<string, ZoneRuntime>();
  private readonly playersByCharId = new Map<string, LivePlayer>();
  private readonly charIdBySocket = new Map<string, string>();
  private hooks: ZoneBroadcastHooks = {
    emitToZone: () => undefined,
    emitToSocket: () => undefined,
  };
  private tickTimer: NodeJS.Timeout | null = null;
  private tickCounter = 0;

  constructor(
    @Inject(JsonDatabaseEngine) private readonly db: JsonDatabaseEngine,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(LocalMinioService) private readonly minio: LocalMinioService,
    @Inject(CharacterService) private readonly characters: CharacterService,
    @Inject(EconomyInventoryService) private readonly economy: EconomyInventoryService,
    @Inject(RedisPresenceService) private readonly presence: RedisPresenceService,
    @Inject(RedisRateLimitService) private readonly rateLimit: RedisRateLimitService,
  ) {}

  onModuleInit(): void {
    this.initZones();
    this.tickTimer = setInterval(() => this.stepSimulation(0.05), 50); // Authoritative 20 Hz
    if (this.tickTimer.unref) this.tickTimer.unref();
    this.logger.log(`WorldSimulationService started at 20 Hz (${this.zones.size} zones loaded)`);
  }

  onModuleDestroy(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  public setBroadcastHooks(hooks: ZoneBroadcastHooks): void {
    this.hooks = hooks;
  }

  private loadTiledCollisionMap(zoneId: string, fallbackW: number, fallbackH: number): TileCollisionMap {
    const mapPath = path.join(this.minio.localAssetsDir, 'v1', 'maps', `${zoneId}.tmj`);
    if (fs.existsSync(mapPath)) {
      try {
        const tmj = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        const w = Number(tmj.width || fallbackW);
        const h = Number(tmj.height || fallbackH);
        const tileSize = Number(tmj.tilewidth || 32);
        const blocked = new Uint8Array(w * h);
        const colLayer = (tmj.layers || []).find((l: any) => String(l.name || '').toLowerCase() === 'collision' && Array.isArray(l.data));
        if (colLayer) {
          for (let i = 0; i < Math.min(blocked.length, colLayer.data.length); i++) {
            blocked[i] = colLayer.data[i] > 0 ? 1 : 0;
          }
        }
        return { widthTiles: w, heightTiles: h, tileSize, blockedTiles: blocked };
      } catch (err) {
        this.logger.warn(`Failed reading ${mapPath}, using border fallback: ${(err as Error).message}`);
      }
    }
    const blocked = new Uint8Array(fallbackW * fallbackH);
    for (let x = 0; x < fallbackW; x++) {
      blocked[x] = 1;
      blocked[(fallbackH - 1) * fallbackW + x] = 1;
    }
    for (let y = 0; y < fallbackH; y++) {
      blocked[y * fallbackW] = 1;
      blocked[y * fallbackW + (fallbackW - 1)] = 1;
    }
    return { widthTiles: fallbackW, heightTiles: fallbackH, tileSize: 32, blockedTiles: blocked };
  }

  private makeMobFromTemplate(zoneId: string, templateId: string, idx: number, x: number, y: number): LiveMob {
    const bossDef = this.catalog.catalog.byId.bosses.get(templateId);
    if (bossDef) {
      const s = bossDef.baseStats || { hp: 10500, atk: 82, def: 34, maxPoise: 520, moveSpeed: 95 };
      return {
        id: `${zoneId}_${templateId}_${idx}`,
        kind: 'BOSS',
        templateId,
        name: bossDef.name,
        zoneId,
        spawnX: x,
        spawnY: y,
        x,
        y,
        facing: 'down',
        animState: 'idle',
        aiState: 'IDLE',
        hp: Number(s.hp || 10500),
        maxHp: Number(s.hp || 10500),
        poise: Number(s.maxPoise || 520),
        maxPoise: Number(s.maxPoise || 520),
        atk: Number(s.atk || 82),
        def: Number(s.def || 34),
        level: Number(bossDef.level || 15),
        element: (bossDef.element || 'EARTH') as ElementType,
        weaknessElement: (bossDef.weaknessElement || 'FIRE') as ElementType,
        moveSpeed: Number(s.moveSpeed || 95),
        aggroRadius: 340,
        leashRadius: 480,
        targetPlayerId: null,
        phase: 1,
        staggerUntilMs: 0,
        nextActionAtMs: 0,
        respawnAtMs: 0,
        contributors: new Set(),
      };
    }

    const mobDef = this.catalog.catalog.byId.monsters.get(templateId) || this.catalog.catalog.monsters[0];
    const s = mobDef?.stats || { hp: 90, atk: 12, def: 4, poise: 35, moveSpeed: 72 };
    const isElite = mobDef?.tier === 'ELITE';
    return {
      id: `${zoneId}_${templateId}_${idx}`,
      kind: isElite ? 'ELITE' : 'MONSTER',
      templateId: mobDef?.id || templateId,
      name: mobDef?.name || 'Moss Slime',
      zoneId,
      spawnX: x,
      spawnY: y,
      x,
      y,
      facing: 'down',
      animState: 'idle',
      aiState: 'IDLE',
      hp: Number(s.hp || 90),
      maxHp: Number(s.hp || 90),
      poise: Number(s.poise || 35),
      maxPoise: Number(s.poise || 35),
      atk: Number(s.atk || 12),
      def: Number(s.def || 4),
      level: Number(mobDef?.level || 1),
      element: (mobDef?.element || 'EARTH') as ElementType,
      weaknessElement: (mobDef?.weaknessElement || 'FIRE') as ElementType,
      moveSpeed: Number(s.moveSpeed || 76),
      aggroRadius: isElite ? 220 : 165,
      leashRadius: 320,
      targetPlayerId: null,
      phase: 1,
      staggerUntilMs: 0,
      nextActionAtMs: 0,
      respawnAtMs: 0,
      contributors: new Set(),
    };
  }

  private initZones(): void {
    // 1. Greenhaven Village
    const village: ZoneRuntime = {
      zoneId: 'reg_greenhaven_village',
      regionId: 'reg_greenhaven_village',
      map: this.loadTiledCollisionMap('reg_greenhaven_village', 30, 22),
      mobs: new Map(),
      nodes: new Map(),
      loot: new Map(),
      telegraphs: new Map(),
      chatHistory: [],
    };
    const vSlime1 = this.makeMobFromTemplate('reg_greenhaven_village', 'mob_moss_slime', 1, 21 * 32, 16 * 32);
    const vSlime2 = this.makeMobFromTemplate('reg_greenhaven_village', 'mob_moss_slime', 2, 24 * 32, 17 * 32);
    village.mobs.set(vSlime1.id, vSlime1);
    village.mobs.set(vSlime2.id, vSlime2);

    const villageNodes: LiveResourceNode[] = [
      { id: 'node_oak_1', zoneId: 'reg_greenhaven_village', name: 'Oak Tree', resourceType: 'OAK_TREE', dropItemId: 'mat_oak_wood', x: 5 * 32, y: 15 * 32, depletedUntilMs: 0 },
      { id: 'node_oak_2', zoneId: 'reg_greenhaven_village', name: 'Oak Tree', resourceType: 'OAK_TREE', dropItemId: 'mat_oak_wood', x: 6 * 32, y: 17 * 32, depletedUntilMs: 0 },
      { id: 'node_copper_1', zoneId: 'reg_greenhaven_village', name: 'Copper Vein', resourceType: 'COPPER_VEIN', dropItemId: 'mat_copper_ore', x: 18 * 32, y: 7 * 32, depletedUntilMs: 0 },
      { id: 'node_stone_1', zoneId: 'reg_greenhaven_village', name: 'Rough Stone', resourceType: 'STONE_ROCK', dropItemId: 'mat_rough_stone', x: 16 * 32, y: 16 * 32, depletedUntilMs: 0 },
    ];
    for (const n of villageNodes) village.nodes.set(n.id, n);
    this.zones.set(village.zoneId, village);

    // 2. Whispering Forest
    const forest: ZoneRuntime = {
      zoneId: 'reg_whispering_forest',
      regionId: 'reg_whispering_forest',
      map: this.loadTiledCollisionMap('reg_whispering_forest', 36, 26),
      mobs: new Map(),
      nodes: new Map(),
      loot: new Map(),
      telegraphs: new Map(),
      chatHistory: [],
    };
    const mvpMobs = this.catalog.catalog.monsters.filter((m) => m.mvp);
    const spawnCoords = [
      [9, 8], [13, 10], [17, 7], [21, 12], [11, 17],
      [18, 19], [24, 15], [27, 9], [29, 18],
    ];
    mvpMobs.slice(0, 9).forEach((m, i) => {
      const [tx, ty] = spawnCoords[i % spawnCoords.length];
      const live = this.makeMobFromTemplate('reg_whispering_forest', m.id, i + 1, tx * 32, ty * 32);
      forest.mobs.set(live.id, live);
    });
    const forestNodes: LiveResourceNode[] = [
      { id: 'node_f_oak_1', zoneId: 'reg_whispering_forest', name: 'Ancient Oak', resourceType: 'OAK_TREE', dropItemId: 'mat_oak_wood', x: 7 * 32, y: 14 * 32, depletedUntilMs: 0 },
      { id: 'node_f_copper_1', zoneId: 'reg_whispering_forest', name: 'Rich Copper Vein', resourceType: 'COPPER_VEIN', dropItemId: 'mat_copper_ore', x: 15 * 32, y: 14 * 32, depletedUntilMs: 0 },
      { id: 'node_f_herb_1', zoneId: 'reg_whispering_forest', name: 'Moonleaf Herb', resourceType: 'WILD_HERB', dropItemId: 'mat_wild_berry', x: 22 * 32, y: 9 * 32, depletedUntilMs: 0 },
    ];
    for (const n of forestNodes) forest.nodes.set(n.id, n);
    this.zones.set(forest.zoneId, forest);

    // 3. Mossroot Hollow Boss Arena (Thornback Elder)
    const arena: ZoneRuntime = {
      zoneId: 'dng_mossroot_hollow',
      regionId: 'reg_whispering_forest',
      map: this.loadTiledCollisionMap('dng_mossroot_hollow', 26, 20),
      mobs: new Map(),
      nodes: new Map(),
      loot: new Map(),
      telegraphs: new Map(),
      chatHistory: [],
    };
    const boss = this.makeMobFromTemplate('dng_mossroot_hollow', 'boss_thornback_elder', 1, 13 * 32, 9 * 32);
    arena.mobs.set(boss.id, boss);
    this.zones.set(arena.zoneId, arena);

    // 4. Ironpeak Foundry Boss Arena (Ignis Forgelord — Canonical Boss #2 from bosses.json!)
    const foundry: ZoneRuntime = {
      zoneId: 'dng_ironmaw_foundry',
      regionId: 'reg_ironpeak_mountains',
      map: this.loadTiledCollisionMap('dng_mossroot_hollow', 26, 20),
      mobs: new Map(),
      nodes: new Map(),
      loot: new Map(),
      telegraphs: new Map(),
      chatHistory: [],
    };
    const ironBoss = this.makeMobFromTemplate('dng_ironmaw_foundry', 'boss_ignis_forgelord', 1, 13 * 32, 9 * 32);
    foundry.mobs.set(ironBoss.id, ironBoss);
    this.zones.set(foundry.zoneId, foundry);
  }

  public async joinPlayer(socketId: string, accountId: string, characterId: string, requestedZoneId?: string) {
    const ch = this.characters.getOwnedCharacter(accountId, characterId);
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${characterId}.json`);
    const stats = this.characters.computeStats(ch, inv);
    const heroDef = this.catalog.catalog.byId.characters.get(ch.activeHeroId);

    const prev = this.playersByCharId.get(characterId);
    if (prev && prev.zoneId) {
      await this.presence.leaveZone(prev.zoneId, characterId);
    }

    const zoneId = requestedZoneId && this.zones.has(requestedZoneId)
      ? requestedZoneId
      : this.zones.has(ch.position.zoneId)
        ? ch.position.zoneId
        : 'reg_greenhaven_village';

    const spawnX = requestedZoneId && requestedZoneId !== ch.position.zoneId
      ? (zoneId.startsWith('dng_') ? 13 * 32 : zoneId === 'reg_whispering_forest' ? 5 * 32 : 14 * 32)
      : ch.position.x;
    const spawnY = requestedZoneId && requestedZoneId !== ch.position.zoneId
      ? (zoneId.startsWith('dng_') ? 14 * 32 : 14 * 32)
      : ch.position.y;

    const live: LivePlayer = {
      characterId,
      accountId,
      socketId,
      name: ch.name,
      heroId: ch.activeHeroId,
      zoneId,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      facing: ch.position.facing || 'down',
      animState: 'idle',
      animUntilMs: 0,
      hp: Math.min(stats.hp, Math.max(1, ch.vitals.hp || stats.hp)),
      maxHp: stats.hp,
      mp: Math.min(stats.mp, ch.vitals.mp || stats.mp),
      maxMp: stats.mp,
      stamina: Math.min(stats.stamina, ch.vitals.stamina || stats.stamina),
      maxStamina: stats.stamina,
      level: ch.level,
      atk: stats.atk,
      def: stats.def,
      critRate: stats.critRate,
      critDamage: stats.critDamage,
      moveSpeed: stats.moveSpeed || 152,
      element: (heroDef?.element || 'FIRE') as ElementType,
      invulnUntilMs: 0,
      blockUntilMs: 0,
      parryUntilMs: 0,
      cooldowns: new Map(),
      lastInputSeq: 0,
      comboStep: 0,
      lastAttackMs: 0,
    };

    this.playersByCharId.set(characterId, live);
    this.charIdBySocket.set(socketId, characterId);
    await this.presence.joinZone(zoneId, characterId, { name: live.name, heroId: live.heroId });

    const zone = this.zones.get(zoneId)!;
    return {
      zoneId,
      player: live,
      snapshot: this.buildZoneSnapshot(zone, live.lastInputSeq),
      chatHistory: zone.chatHistory,
    };
  }

  public async disconnectSocket(socketId: string): Promise<void> {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return;
    this.charIdBySocket.delete(socketId);
    const p = this.playersByCharId.get(charId);
    if (p && p.socketId === socketId) {
      this.playersByCharId.delete(charId);
      await this.presence.leaveZone(p.zoneId, charId);
      const ch = this.db.readEntity<CharacterEntity>(`characters/${charId}.json`);
      if (ch) {
        ch.position = { regionId: p.zoneId === 'dng_mossroot_hollow' ? 'reg_whispering_forest' : p.zoneId, zoneId: p.zoneId, x: Math.round(p.x), y: Math.round(p.y), facing: p.facing };
        ch.vitals.hp = Math.max(1, Math.round(p.hp));
        ch.vitals.mp = Math.round(p.mp);
        ch.vitals.stamina = Math.round(p.stamina);
        this.db.markDirty(`characters/${charId}.json`, 'CHARACTER', charId, ch);
      }
    }
  }

  public handleMoveInput(
    socketId: string,
    payload: { seq: number; dx: number; dy: number; sprint?: boolean; dtMs?: number },
  ) {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return null;
    const p = this.playersByCharId.get(charId);
    if (!p || p.hp <= 0) return null;
    const zone = this.zones.get(p.zoneId);
    if (!zone) return null;

    const dtSec = Math.min(0.12, Math.max(0.016, Number(payload.dtMs || 50) / 1000));
    const dx = Math.max(-1, Math.min(1, Number(payload.dx || 0)));
    const dy = Math.max(-1, Math.min(1, Number(payload.dy || 0)));
    const moving = Math.hypot(dx, dy) > 0.05;
    const sprintActive = Boolean(payload.sprint && moving && p.stamina > 5);
    const speed = p.moveSpeed * (sprintActive ? 1.32 : 1.0);

    if (moving) {
      if (Math.abs(dx) > Math.abs(dy)) p.facing = dx < 0 ? 'left' : 'right';
      else p.facing = dy < 0 ? 'up' : 'down';

      const moved = resolveSlidingMove(p.x, p.y, dx, dy, speed, dtSec, zone.map);
      p.vx = (moved.x - p.x) / dtSec;
      p.vy = (moved.y - p.y) / dtSec;
      p.x = moved.x;
      p.y = moved.y;
      if (sprintActive) p.stamina = Math.max(0, p.stamina - 18 * dtSec);
      if (Date.now() > p.animUntilMs) {
        p.animState = sprintActive ? 'sprint' : 'run';
      }
    } else {
      p.vx = 0;
      p.vy = 0;
      if (Date.now() > p.animUntilMs) p.animState = 'idle';
    }
    p.lastInputSeq = Number(payload.seq || p.lastInputSeq + 1);
    return { x: Math.round(p.x), y: Math.round(p.y), facing: p.facing, seq: p.lastInputSeq };
  }

  public async handleCombatAction(
    socketId: string,
    payload: { action: 'BASIC_ATTACK' | 'SKILL' | 'DODGE' | 'BLOCK'; skillId?: string; targetX?: number; targetY?: number },
  ) {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return { ok: false, reason: 'NOT_IN_ZONE' };
    const p = this.playersByCharId.get(charId);
    if (!p || p.hp <= 0) return { ok: false, reason: 'DEAD' };
    const zone = this.zones.get(p.zoneId);
    if (!zone) return { ok: false, reason: 'ZONE_NOT_FOUND' };
    const now = Date.now();

    if (payload.action === 'DODGE') {
      if (p.stamina < 20) return { ok: false, reason: 'LOW_STAMINA' };
      p.stamina -= 20;
      p.invulnUntilMs = now + 300;
      p.animState = 'dodge';
      p.animUntilMs = now + 260;
      const dirMap = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
      const [ddx, ddy] = dirMap[p.facing];
      const moved = resolveSlidingMove(p.x, p.y, ddx, ddy, 520, 0.14, zone.map);
      p.x = moved.x;
      p.y = moved.y;
      return { ok: true, action: 'DODGE', invulnMs: 300 };
    }

    if (payload.action === 'BLOCK') {
      p.blockUntilMs = now + 700;
      p.parryUntilMs = now + 200;
      p.animState = 'block';
      p.animUntilMs = now + 500;
      return { ok: true, action: 'BLOCK', parryWindowMs: 200 };
    }

    // BASIC_ATTACK or SKILL
    let skillId = 'basic_attack';
    let baseDamage = 18;
    let scalingRatio = 1.05;
    let poiseDmg = 18;
    let rangePx = 92;
    let radiusPx = 76;
    let element: ElementType = p.element;
    let vfxKey = 'vfx16_hit_spark';
    let durationMs = 300;

    if (payload.action === 'SKILL' && payload.skillId) {
      const sk = this.catalog.catalog.byId.skills.get(payload.skillId);
      if (!sk) return { ok: false, reason: 'UNKNOWN_SKILL' };
      const cdUntil = p.cooldowns.get(sk.id) || 0;
      if (now < cdUntil) return { ok: false, reason: 'ON_COOLDOWN', remainingMs: cdUntil - now };
      const mpCost = Number(sk.manaCost || 0);
      const stamCost = Number(sk.staminaCost || 0);
      if (p.mp < mpCost) return { ok: false, reason: 'LOW_MP' };
      if (p.stamina < stamCost) return { ok: false, reason: 'LOW_STAMINA' };

      p.mp -= mpCost;
      p.stamina -= stamCost;
      p.cooldowns.set(sk.id, now + Number(sk.cooldownMs || 4000));
      skillId = sk.id;
      baseDamage = Number(sk.baseDamage || 35);
      scalingRatio = Number(sk.scalingRatio || 1.6);
      poiseDmg = Number(sk.poiseDamage || 55);
      rangePx = Math.max(110, Number(sk.rangePx || 160));
      radiusPx = Math.max(85, Number(sk.hitboxDimensions?.radiusPx || 110));
      element = (sk.element || p.element) as ElementType;
      p.animState = sk.skillType === 'ULTIMATE' ? 'ultimate' : 'skill';
      p.animUntilMs = now + (sk.skillType === 'ULTIMATE' ? 600 : 420);

      if (sk.id.includes('crimson_crescent') || sk.characterId === 'chr_kael_vanguard') {
        vfxKey = sk.id.includes('blazing') ? 'vfx_kael_dragonheart_aura' : 'vfx_kael_crimson_crescent_wave';
      } else if (sk.id.includes('solar_judgment') || sk.characterId === 'chr_seraphina_dawn') {
        vfxKey = 'vfx_seraphina_solar_judgment_pillar';
      } else if (sk.characterId === 'chr_lyra_windrunner') {
        vfxKey = 'vfx_lyra_tempest_arrowstorm_zone';
      } else if (sk.characterId === 'chr_orin_stormcaller') {
        vfxKey = 'vfx_orin_storm_dominion_dome';
      } else if (sk.characterId === 'chr_vex_nightblade') {
        vfxKey = 'vfx_vex_abyssal_eclipse_vortex';
      } else if (sk.characterId === 'chr_bram_bastion') {
        vfxKey = 'vfx_bram_bastion_quake_ring';
      }
      durationMs = sk.skillType === 'ULTIMATE' ? 750 : 450;

      // Support healing skills (e.g. Seraphina)
      if (sk.skillType === 'ACTIVE' && (sk.id.includes('sanctuary') || sk.id.includes('blessing') || sk.baseDamage === 0)) {
        const healAmt = Math.round(p.maxHp * 0.35 + p.atk * 1.2);
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        vfxKey = 'vfx16_light_heal';
      }
    } else {
      if (now - p.lastAttackMs < 220) return { ok: false, reason: 'ATTACK_RECOVERY' };
      p.comboStep = now - p.lastAttackMs < 1100 ? (p.comboStep + 1) % 3 : 0;
      p.lastAttackMs = now;
      scalingRatio = p.comboStep === 2 ? 1.35 : 1.0;
      p.animState = p.comboStep === 2 ? 'attack_combo' : 'attack';
      p.animUntilMs = now + 300;
      if (p.heroId === 'chr_lyra_windrunner' || p.heroId === 'chr_seraphina_dawn') {
        rangePx = 210;
        vfxKey = p.heroId === 'chr_lyra_windrunner' ? 'vfx16_arrow_proj' : 'vfx16_light_heal';
      }
    }

    const dirVec = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[p.facing];
    const hitCenterX = payload.targetX ?? p.x + dirVec[0] * Math.min(rangePx * 0.55, 72);
    const hitCenterY = payload.targetY ?? p.y + dirVec[1] * Math.min(rangePx * 0.55, 72);

    const vfxEvent: SkillCastVfxEvent = {
      casterId: p.characterId,
      skillId,
      vfxKey,
      element,
      x: Math.round(p.x),
      y: Math.round(p.y),
      targetX: Math.round(hitCenterX),
      targetY: Math.round(hitCenterY),
      facing: p.facing,
      radiusPx,
      durationMs,
    };
    this.hooks.emitToZone(zone.zoneId, 'S2C_SKILL_VFX', vfxEvent);

    const hits: CombatDamageEvent[] = [];
    for (const mob of zone.mobs.values()) {
      if (mob.aiState === 'DEAD' || mob.hp <= 0) continue;
      const dist = Math.min(distancePx(p.x, p.y, mob.x, mob.y), distancePx(hitCenterX, hitCenterY, mob.x, mob.y));
      if (dist > rangePx + (mob.kind === 'BOSS' ? 56 : 24)) continue;

      const rng = crypto.randomInt(0, 10000) / 10000;
      const isStaggered = now < mob.staggerUntilMs;
      const { damage, isCrit } = computeDamageHit({
        attackerAtk: p.atk,
        attackerLevel: p.level,
        baseDamage,
        scalingRatio,
        critRate: p.critRate,
        critDamage: p.critDamage,
        defenderDef: mob.def,
        attackElement: element,
        defenderWeakness: mob.weaknessElement,
        isStaggered,
        staggerMult: 1.4,
        rngValue: rng,
      });

      mob.hp = Math.max(0, mob.hp - damage);
      mob.contributors.add(p.characterId);
      mob.targetPlayerId = p.characterId;
      if (mob.aiState === 'IDLE' || mob.aiState === 'PATROL') mob.aiState = 'CHASE';

      let poiseBroken = false;
      if (!isStaggered && mob.hp > 0) {
        mob.poise = Math.max(0, mob.poise - poiseDmg);
        if (mob.poise === 0) {
          poiseBroken = true;
          mob.staggerUntilMs = now + 6000;
          mob.aiState = 'STUNNED';
          mob.animState = 'stun';
        }
      }

      // Boss phase transitions (100% -> 65% -> 30%)
      if (mob.kind === 'BOSS' && mob.hp > 0) {
        const hpRatio = mob.hp / mob.maxHp;
        if (hpRatio <= 0.3 && mob.phase < 3) {
          mob.phase = 3;
          this.hooks.emitToZone(zone.zoneId, 'S2C_CHAT_MESSAGE', {
            id: `sys_${now}`,
            channel: 'SYSTEM',
            senderId: 'SYSTEM',
            senderName: 'Mossroot Hollow',
            message: 'Thornback Elder enters PHASE 3: Crimson Sap Enrage!',
            timestamp: new Date().toISOString(),
          });
        } else if (hpRatio <= 0.65 && mob.phase < 2) {
          mob.phase = 2;
          this.hooks.emitToZone(zone.zoneId, 'S2C_CHAT_MESSAGE', {
            id: `sys_${now}`,
            channel: 'SYSTEM',
            senderId: 'SYSTEM',
            senderName: 'Mossroot Hollow',
            message: 'Thornback Elder enters PHASE 2: Briar Roar & Thorn Nova!',
            timestamp: new Date().toISOString(),
          });
        }
      }

      const dmgEvt: CombatDamageEvent = {
        attackerId: p.characterId,
        targetId: mob.id,
        skillId,
        damage,
        isCrit,
        isBlocked: false,
        isParried: false,
        element,
        targetHpAfter: mob.hp,
        targetPoiseAfter: mob.poise,
        poiseBroken,
        x: Math.round(mob.x),
        y: Math.round(mob.y),
      };
      hits.push(dmgEvt);
      this.hooks.emitToZone(zone.zoneId, 'S2C_COMBAT_DAMAGE', dmgEvt);

      if (mob.hp === 0) {
        await this.handleMobDefeated(zone, mob);
      }
    }

    return { ok: true, skillId, hits };
  }

  private async handleMobDefeated(zone: ZoneRuntime, mob: LiveMob): Promise<void> {
    const now = Date.now();
    mob.aiState = 'DEAD';
    mob.animState = 'death';
    mob.respawnAtMs = now + (mob.kind === 'BOSS' ? 30_000 : 12_000);

    const isBoss = mob.kind === 'BOSS';
    const dropItem = isBoss
      ? 'mat_thorn_heartwood'
      : mob.templateId === 'mob_timber_wolf' || mob.templateId === 'mob_alpha_direwolf'
        ? 'mat_wolf_fang'
        : 'mat_slime_gel';
    const expReward = isBoss ? 480 : mob.kind === 'ELITE' ? 120 : 35;
    const goldReward = isBoss ? 420 : mob.kind === 'ELITE' ? 95 : 22;

    for (const charId of mob.contributors) {
      const dropId = `loot_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      zone.loot.set(dropId, {
        id: dropId,
        zoneId: zone.zoneId,
        ownerCharacterId: charId,
        itemId: dropItem,
        quantity: isBoss ? 3 : 1,
        gold: goldReward,
        x: mob.x + crypto.randomInt(-18, 19),
        y: mob.y + crypto.randomInt(-14, 15),
        expiresAtMs: now + 180_000,
      });

      const ch = this.db.readEntity<CharacterEntity>(`characters/${charId}.json`);
      if (ch) {
        this.characters.applyExp(ch, expReward);
        this.economy.incrementQuestProgress(ch, 'KILL_MONSTER', mob.templateId, 1);
        if (isBoss) {
          ch.bossKillCounts[mob.templateId] = (ch.bossKillCounts[mob.templateId] || 0) + 1;
          ch.wallet.bossToken += 5;
          ch.wallet.starlightShard += 320;
          this.economy.incrementQuestProgress(ch, 'DEFEAT_BOSS', mob.templateId, 1);
        }
        await this.db.writeEntity(`characters/${charId}.json`, 'CHARACTER', charId, ch);

        const liveP = this.playersByCharId.get(charId);
        if (liveP) {
          liveP.level = ch.level;
          if (isBoss) {
            this.hooks.emitToSocket(liveP.socketId, 'S2C_BOSS_DEFEATED', {
              bossId: mob.templateId,
              bossName: mob.name,
              rewards: {
                exp: expReward,
                gold: goldReward,
                bossToken: 5,
                starlightShard: 320,
                guaranteedItem: { itemId: dropItem, qty: 3 },
              },
            });
          }
        }
      }
    }
    mob.contributors.clear();
  }

  public async handleGatherNode(socketId: string, nodeId: string) {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return { ok: false, reason: 'NOT_IN_ZONE' };
    const p = this.playersByCharId.get(charId);
    if (!p) return { ok: false, reason: 'NO_PLAYER' };
    const zone = this.zones.get(p.zoneId);
    const node = zone?.nodes.get(nodeId);
    if (!node) return { ok: false, reason: 'NODE_NOT_FOUND' };
    const now = Date.now();
    if (node.depletedUntilMs > now) return { ok: false, reason: 'DEPLETED' };
    if (distancePx(p.x, p.y, node.x, node.y) > 96) return { ok: false, reason: 'OUT_OF_RANGE' };

    node.depletedUntilMs = now + 20_000;
    p.animState = node.resourceType === 'OAK_TREE' ? 'woodcutting' : 'mining';
    p.animUntilMs = now + 450;

    const ch = this.db.readEntity<CharacterEntity>(`characters/${charId}.json`)!;
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${charId}.json`)!;
    const qty = crypto.randomInt(2, 4);
    this.economy.addItemToBag(inv, charId, node.dropItemId, qty);
    this.characters.applyExp(ch, 15);
    this.economy.incrementQuestProgress(ch, 'GATHER_ITEM', node.dropItemId, qty);

    await this.db.runTransaction([
      { relPath: `characters/${charId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: charId, data: ch },
      { relPath: `inventories/${charId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: charId, data: inv },
    ]);
    return { ok: true, nodeId, itemId: node.dropItemId, quantity: qty };
  }

  public async handleLootPickup(socketId: string, lootId: string) {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return { ok: false, reason: 'NOT_IN_ZONE' };
    const p = this.playersByCharId.get(charId);
    const zone = p ? this.zones.get(p.zoneId) : undefined;
    const drop = zone?.loot.get(lootId);
    if (!p || !zone || !drop) return { ok: false, reason: 'LOOT_NOT_FOUND' };
    if (drop.ownerCharacterId !== charId) return { ok: false, reason: 'NOT_YOUR_LOOT' };
    if (distancePx(p.x, p.y, drop.x, drop.y) > 104) return { ok: false, reason: 'OUT_OF_RANGE' };

    zone.loot.delete(lootId);
    const ch = this.db.readEntity<CharacterEntity>(`characters/${charId}.json`)!;
    const inv = this.db.readEntity<InventoryEntity>(`inventories/${charId}.json`)!;
    this.economy.addItemToBag(inv, charId, drop.itemId, drop.quantity);
    const beforeGold = ch.wallet.gold;
    ch.wallet.gold += drop.gold;
    this.economy.incrementQuestProgress(ch, 'GATHER_ITEM', drop.itemId, drop.quantity);

    const txId = crypto.randomUUID();
    await this.db.runTransaction(
      [
        { relPath: `characters/${charId}.json`, op: 'UPSERT', entityType: 'CHARACTER', entityId: charId, data: ch },
        { relPath: `inventories/${charId}.json`, op: 'UPSERT', entityType: 'INVENTORY', entityId: charId, data: inv },
        this.db.buildLedgerMutation({
          entryId: `led_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          txId,
          characterId: charId,
          currency: 'GOLD',
          delta: drop.gold,
          beforeBalance: beforeGold,
          afterBalance: ch.wallet.gold,
          reason: `LOOT_PICKUP:${drop.itemId}`,
          createdAt: new Date().toISOString(),
        }),
      ],
      { txId },
    );

    return { ok: true, lootId, itemId: drop.itemId, quantity: drop.quantity, gold: drop.gold, wallet: ch.wallet };
  }

  public async handleChat(socketId: string, channel: 'ZONE' | 'PARTY', rawMessage: string) {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return { ok: false, reason: 'NOT_IN_ZONE' };
    const p = this.playersByCharId.get(charId);
    if (!p) return { ok: false, reason: 'NO_PLAYER' };
    const allowed = await this.rateLimit.checkLimit('chat', charId, 5, 5);
    if (!allowed) return { ok: false, reason: 'RATE_LIMITED' };

    const msgText = escapeHtml(String(rawMessage || '').trim());
    if (!msgText) return { ok: false, reason: 'EMPTY' };

    const payload: ChatMessagePayload = {
      id: `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      channel,
      senderId: charId,
      senderName: p.name,
      message: msgText,
      timestamp: new Date().toISOString(),
    };
    const zone = this.zones.get(p.zoneId);
    if (zone) {
      zone.chatHistory.push(payload);
      if (zone.chatHistory.length > 50) zone.chatHistory.shift();
      this.hooks.emitToZone(zone.zoneId, 'S2C_CHAT_MESSAGE', payload);
    }
    return { ok: true, payload };
  }

  public async handleRespawn(socketId: string) {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return null;
    const p = this.playersByCharId.get(charId);
    if (!p) return null;
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.stamina = p.maxStamina;
    p.animState = 'respawn';
    p.animUntilMs = Date.now() + 500;
    return this.joinPlayer(socketId, p.accountId, charId, 'reg_greenhaven_village');
  }

  public async handlePortalTravel(socketId: string, targetZoneId?: string) {
    const charId = this.charIdBySocket.get(socketId);
    if (!charId) return null;
    const p = this.playersByCharId.get(charId);
    if (!p) return null;
    const nextZone = targetZoneId && this.zones.has(targetZoneId)
      ? targetZoneId
      : (ZONE_PORTALS[p.zoneId]?.targetZoneId || 'reg_greenhaven_village');
    return this.joinPlayer(socketId, p.accountId, charId, nextZone);
  }

  private stepSimulation(dtSec: number): void {
    this.tickCounter++;
    const now = Date.now();

    // Regenerate player vitals
    for (const p of this.playersByCharId.values()) {
      if (p.hp > 0) {
        p.mp = Math.min(p.maxMp, p.mp + 4.5 * dtSec);
        p.stamina = Math.min(p.maxStamina, p.stamina + 16 * dtSec);
        if (p.zoneId === 'reg_greenhaven_village') {
          p.hp = Math.min(p.maxHp, p.hp + 12 * dtSec);
        }
      }
      if (p.animUntilMs > 0 && now > p.animUntilMs && p.hp > 0 && Math.hypot(p.vx, p.vy) < 1) {
        p.animState = 'idle';
        p.animUntilMs = 0;
      }
    }

    for (const zone of this.zones.values()) {
      const zonePlayers = [...this.playersByCharId.values()].filter((p) => p.zoneId === zone.zoneId && p.hp > 0);

      // Clean expired loot
      for (const [lid, loot] of zone.loot.entries()) {
        if (loot.expiresAtMs <= now) zone.loot.delete(lid);
      }

      // Resolve active Boss Telegraphs!
      for (const [tid, tel] of zone.telegraphs.entries()) {
        if (now >= tel.createdAtMs + tel.telegraphMs) {
          zone.telegraphs.delete(tid);
          const boss = zone.mobs.get(tel.bossId);
          if (!boss || boss.aiState === 'DEAD') continue;
          for (const pl of zonePlayers) {
            if (distancePx(pl.x, pl.y, tel.x, tel.y) <= tel.radiusPx) {
              this.applyMobDamageToPlayer(zone, boss, pl, tel.damageRatio, tel.skillKey);
            }
          }
        }
      }

      // Update Mobs & Boss AI
      for (const mob of zone.mobs.values()) {
        if (mob.aiState === 'DEAD') {
          if (now >= mob.respawnAtMs) {
            mob.hp = mob.maxHp;
            mob.poise = mob.maxPoise;
            mob.phase = 1;
            mob.x = mob.spawnX;
            mob.y = mob.spawnY;
            mob.aiState = 'IDLE';
            mob.animState = 'idle';
            mob.targetPlayerId = null;
          }
          continue;
        }

        if (mob.aiState === 'STUNNED') {
          if (now >= mob.staggerUntilMs) {
            mob.poise = mob.maxPoise;
            mob.aiState = 'CHASE';
            mob.animState = 'idle';
          }
          continue;
        }

        // Find nearest player within aggro radius
        let target: LivePlayer | null = mob.targetPlayerId ? this.playersByCharId.get(mob.targetPlayerId) || null : null;
        if (!target || target.zoneId !== zone.zoneId || target.hp <= 0) {
          target = null;
          let bestDist = mob.aggroRadius;
          for (const pl of zonePlayers) {
            const d = distancePx(mob.x, mob.y, pl.x, pl.y);
            if (d < bestDist) {
              bestDist = d;
              target = pl;
            }
          }
          mob.targetPlayerId = target ? target.characterId : null;
        }

        if (!target) {
          const distSpawn = distancePx(mob.x, mob.y, mob.spawnX, mob.spawnY);
          if (distSpawn > 10) {
            const moved = resolveSlidingMove(mob.x, mob.y, mob.spawnX - mob.x, mob.spawnY - mob.y, mob.moveSpeed, dtSec, zone.map);
            mob.x = moved.x;
            mob.y = moved.y;
            mob.aiState = 'RETURN';
            mob.animState = 'walk';
          } else {
            mob.aiState = 'IDLE';
            mob.animState = 'idle';
          }
          continue;
        }

        // Leash check
        if (distancePx(mob.x, mob.y, mob.spawnX, mob.spawnY) > mob.leashRadius) {
          mob.targetPlayerId = null;
          mob.aiState = 'RETURN';
          continue;
        }

        const distTarget = distancePx(mob.x, mob.y, target.x, target.y);
        const attackRange = mob.kind === 'BOSS' ? 115 : 54;

        if (distTarget > attackRange) {
          const dx = target.x - mob.x;
          const dy = target.y - mob.y;
          mob.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
          const moved = resolveSlidingMove(mob.x, mob.y, dx, dy, mob.moveSpeed, dtSec, zone.map);
          mob.x = moved.x;
          mob.y = moved.y;
          mob.aiState = 'CHASE';
          mob.animState = 'walk';
        } else if (now >= mob.nextActionAtMs) {
          mob.aiState = 'ATTACK';
          mob.animState = 'attack';
          if (mob.kind === 'BOSS') {
            // Emit UNLIT #FF3B3B Boss Telegraph so player can dodge!
            const tid = `tel_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
            const radiusPx = mob.phase >= 3 ? 115 : mob.phase === 2 ? 96 : 80;
            const telegraphMs = mob.phase >= 3 ? 1150 : 1400;
            const telEvt: BossTelegraphEvent = {
              telegraphId: tid,
              bossId: mob.id,
              skillKey: mob.phase >= 3 ? 'thorn_nova_enrage' : mob.phase === 2 ? 'briar_slam' : 'root_smash',
              shape: 'CIRCLE',
              x: Math.round(target.x),
              y: Math.round(target.y),
              radiusPx,
              telegraphMs,
              createdAtMs: now,
              kind: 'DAMAGE',
            };
            zone.telegraphs.set(tid, { ...telEvt, damageRatio: mob.phase >= 3 ? 1.45 : 1.15 });
            this.hooks.emitToZone(zone.zoneId, 'S2C_BOSS_TELEGRAPH', telEvt);
            mob.nextActionAtMs = now + (mob.phase >= 3 ? 2800 : 3500);
          } else {
            this.applyMobDamageToPlayer(zone, mob, target, 0.9, 'mob_melee');
            mob.nextActionAtMs = now + 1800;
          }
        }
      }

      // Broadcast Zone Snapshot at 10 Hz (every 2nd tick) when players are present
      if (this.tickCounter % 2 === 0 && zonePlayers.length > 0) {
        const snapshot = this.buildZoneSnapshot(zone);
        this.hooks.emitToZone(zone.zoneId, 'S2C_ZONE_SNAPSHOT', snapshot);
      }
    }
  }

  private applyMobDamageToPlayer(
    zone: ZoneRuntime,
    mob: LiveMob,
    player: LivePlayer,
    ratio: number,
    skillId: string,
  ): void {
    const now = Date.now();
    if (now < player.invulnUntilMs) return; // Dodge i-frame!

    const isParried = now < player.parryUntilMs;
    const isBlocked = !isParried && now < player.blockUntilMs;
    let damage = 0;

    if (!isParried) {
      const res = computeDamageHit({
        attackerAtk: mob.atk,
        attackerLevel: mob.level,
        baseDamage: 8,
        scalingRatio: ratio,
        critRate: 0.05,
        critDamage: 1.4,
        defenderDef: player.def,
        attackElement: mob.element,
        isBlocked,
        rngValue: crypto.randomInt(0, 1000) / 1000,
      });
      damage = res.damage;
      player.hp = Math.max(0, player.hp - damage);
      if (player.hp === 0) {
        player.animState = 'death';
      } else {
        player.animState = 'hit';
        player.animUntilMs = now + 220;
      }
    } else {
      // Perfect Parry deals counter Poise damage to attacker!
      mob.poise = Math.max(0, mob.poise - 35);
    }

    const evt: CombatDamageEvent = {
      attackerId: mob.id,
      targetId: player.characterId,
      skillId,
      damage,
      isCrit: false,
      isBlocked,
      isParried,
      element: mob.element,
      targetHpAfter: player.hp,
      x: Math.round(player.x),
      y: Math.round(player.y),
    };
    this.hooks.emitToZone(zone.zoneId, 'S2C_COMBAT_DAMAGE', evt);
  }

  public buildZoneSnapshot(zone: ZoneRuntime, lastProcessedInputSeq?: number): ZoneSnapshotPayload {
    const now = Date.now();
    const entities: WorldEntitySnapshot[] = [];

    if (zone.zoneId === 'reg_greenhaven_village') {
      entities.push(...VILLAGE_NPCS);
    }

    for (const p of this.playersByCharId.values()) {
      if (p.zoneId !== zone.zoneId) continue;
      entities.push({
        id: p.characterId,
        kind: 'PLAYER',
        templateId: p.heroId,
        name: p.name,
        x: Math.round(p.x),
        y: Math.round(p.y),
        vx: Math.round(p.vx),
        vy: Math.round(p.vy),
        facing: p.facing,
        animState: p.animState,
        hp: Math.round(p.hp),
        maxHp: p.maxHp,
        mp: Math.round(p.mp),
        maxMp: p.maxMp,
        stamina: Math.round(p.stamina),
        maxStamina: p.maxStamina,
        level: p.level,
        element: p.element,
      });
    }

    for (const mob of zone.mobs.values()) {
      if (mob.aiState === 'DEAD') continue;
      entities.push({
        id: mob.id,
        kind: mob.kind,
        templateId: mob.templateId,
        name: mob.name,
        x: Math.round(mob.x),
        y: Math.round(mob.y),
        vx: 0,
        vy: 0,
        facing: mob.facing,
        animState: mob.animState,
        hp: Math.round(mob.hp),
        maxHp: mob.maxHp,
        poise: Math.round(mob.poise),
        maxPoise: mob.maxPoise,
        phase: mob.phase,
        level: mob.level,
        element: mob.element,
      });
    }

    for (const n of zone.nodes.values()) {
      entities.push({
        id: n.id,
        kind: 'RESOURCE_NODE',
        templateId: n.dropItemId,
        name: n.name,
        x: n.x,
        y: n.y,
        vx: 0,
        vy: 0,
        facing: 'down',
        animState: 'idle',
        hp: n.depletedUntilMs > now ? 0 : 1,
        maxHp: 1,
        level: 1,
        resourceType: n.resourceType,
        depletedUntil: n.depletedUntilMs,
      });
    }

    for (const l of zone.loot.values()) {
      entities.push({
        id: l.id,
        kind: 'LOOT',
        templateId: l.itemId,
        name: `${l.itemId} x${l.quantity}`,
        x: Math.round(l.x),
        y: Math.round(l.y),
        vx: 0,
        vy: 0,
        facing: 'down',
        animState: 'idle',
        hp: 1,
        maxHp: 1,
        level: 1,
        ownerCharacterId: l.ownerCharacterId,
        lootItemId: l.itemId,
        lootQuantity: l.quantity,
      });
    }

    const dayMinutes = Math.floor((now / 1000) % 1440);
    const timeOfDayPhase =
      dayMinutes < 360 ? 'NIGHT' : dayMinutes < 540 ? 'DAWN' : dayMinutes < 1080 ? 'DAY' : 'DUSK';

    return {
      tick: this.tickCounter,
      serverTimeMs: now,
      zoneId: zone.zoneId,
      regionId: zone.regionId,
      timeOfDayPhase,
      dayMinutes,
      weather: 'CLEAR',
      season: 'SPRING',
      lastProcessedInputSeq,
      entities,
      activeTelegraphs: [...zone.telegraphs.values()].map(({ damageRatio: _d, resolved: _r, ...t }) => t),
    };
  }
}
