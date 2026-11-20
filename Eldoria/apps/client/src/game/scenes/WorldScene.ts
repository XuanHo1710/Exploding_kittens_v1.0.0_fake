import Phaser from 'phaser';
import {
  BossTelegraphEvent,
  CombatDamageEvent,
  distancePx,
  resolveSlidingMove,
  SkillCastVfxEvent,
  TileCollisionMap,
  WorldEntitySnapshot,
  ZoneSnapshotPayload,
} from '@eldoria/shared';
import { gameUiBridge } from '../../bridge/GameUiBridge';
import { inputFocusManager } from '../../bridge/InputFocusManager';
import { realtimeClient } from '../../network/RealtimeClient';
import {
  useAuthStore,
  useHomesteadStore,
  useHudStore,
  useProgressionStore,
} from '../../stores/gameStores';
import { CharacterHfsmController } from '../animation/CharacterHfsmController';
import { PixelAnimationRegistry } from '../animation/PixelAnimationRegistry';
import { retroSfxSynth } from '../audio/RetroSfxSynth';
import { AnimatedEnvironmentController } from '../rendering/AnimatedEnvironmentController';
import { DepthLayerManager } from '../rendering/DepthLayerManager';
import { PixelCameraController } from '../rendering/PixelCameraController';

interface EntityVisual {
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  label: Phaser.GameObjects.Text;
  hpBg?: Phaser.GameObjects.Rectangle;
  hpFill?: Phaser.GameObjects.Rectangle;
  hfsm?: CharacterHfsmController;
  lastSnapshot: WorldEntitySnapshot;
}

interface TelegraphVisual {
  event: BossTelegraphEvent;
  groundFill: Phaser.GameObjects.Graphics;
  rimEcho: Phaser.GameObjects.Graphics;
}

export class WorldScene extends Phaser.Scene {
  private animRegistry!: PixelAnimationRegistry;
  private cameraCtrl!: PixelCameraController;
  private envCtrl!: AnimatedEnvironmentController;

  private currentZoneId = '';
  private tileSprites: Phaser.GameObjects.Image[] = [];
  private canopySprites: Array<{ sprite: Phaser.GameObjects.Image; cx: number; cy: number }> = [];
  private lightingOverlay!: Phaser.GameObjects.Rectangle;
  private buildGhost!: Phaser.GameObjects.Rectangle;

  private collisionMap: TileCollisionMap | null = null;
  private entityVisuals = new Map<string, EntityVisual>();
  private telegraphs = new Map<string, TelegraphVisual>();
  private latestSnapshot: ZoneSnapshotPayload | null = null;

  private localX = 10 * 32;
  private localY = 12 * 32;
  private localFacing: 'down' | 'up' | 'left' | 'right' = 'down';
  private inputSeq = 0;
  private lastMoveSendMs = 0;
  private deadEmitted = false;

  private keys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    f: Phaser.Input.Keyboard.Key;
    one: Phaser.Input.Keyboard.Key;
    two: Phaser.Input.Keyboard.Key;
    three: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
  };

  private unsubs: Array<() => void> = [];

  constructor() {
    super({ key: 'WorldScene' });
  }

  create(): void {
    this.animRegistry = this.registry.get('animRegistry') || new PixelAnimationRegistry();
    this.cameraCtrl = new PixelCameraController(this.cameras.main);
    this.envCtrl = new AnimatedEnvironmentController(this);

    const prefs = useAuthStore.getState().preferences;
    this.cameraCtrl.setShakePreference(prefs.cameraShakePct);

    // Day/Night tint overlay (Depth 111000 — NEVER covers Boss Telegraph Rim Echo or Nameplates!)
    this.lightingOverlay = this.add.rectangle(0, 0, 2000, 2000, 0x0b1636, 0).setOrigin(0, 0).setScrollFactor(0);
    this.lightingOverlay.setDepth(DepthLayerManager.lighting());

    // Building placement ghost preview (Depth 120-139)
    this.buildGhost = this.add.rectangle(0, 0, 96, 96, 0x45c470, 0.35).setStrokeStyle(2, 0x86efac).setVisible(false);
    this.buildGhost.setDepth(DepthLayerManager.buildGrid(5));

    if (this.input.keyboard) {
      this.keys = {
        w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W, false),
        a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A, false),
        s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S, false),
        d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D, false),
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP, false),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN, false),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT, false),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT, false),
        space: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false),
        shift: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT, false),
        e: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false),
        f: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F, false),
        one: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE, false),
        two: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO, false),
        three: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE, false),
        q: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q, false),
      };
    }

    // Mouse click: basic attack or confirm building placement
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!inputFocusManager.shouldForwardToPhaser()) return;
      const placingId = useHomesteadStore.getState().placingBuildingId;
      if (placingId) {
        const tx = Math.floor(pointer.worldX / 32);
        const ty = Math.floor(pointer.worldY / 32);
        gameUiBridge.emit('build:mode', { active: false, buildingId: `${placingId}@${tx},${ty}` });
        return;
      }
      this.triggerCombatAction('BASIC_ATTACK', undefined, pointer.worldX, pointer.worldY);
    });

    this.renderZoneMap('reg_greenhaven_village');

    // Subscribe to server events via GameUiBridge
    this.unsubs.push(
      gameUiBridge.on('zone:snapshot', (snap) => this.handleZoneSnapshot(snap)),
      gameUiBridge.on('combat:damage', (evt) => this.spawnDamageNumber(evt)),
      gameUiBridge.on('combat:vfx', (evt) => this.spawnSkillVfx(evt)),
      gameUiBridge.on('boss:telegraph', (evt) => this.spawnBossTelegraph(evt)),
      gameUiBridge.on('client:triggerSkill', (p) => this.triggerCombatAction(p.action, p.skillId)),
      gameUiBridge.on('client:travelZone', (p) => void realtimeClient.sendPortalTravel(p.targetZoneId)),
      gameUiBridge.on('client:respawn', () => {
        this.deadEmitted = false;
        void realtimeClient.sendRespawn();
      }),
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const u of this.unsubs) u();
      this.unsubs = [];
      this.envCtrl.clearAll();
    });
  }

  private renderZoneMap(zoneId: string): void {
    if (this.currentZoneId === zoneId) return;
    this.currentZoneId = zoneId;

    for (const t of this.tileSprites) t.destroy();
    this.tileSprites = [];
    for (const c of this.canopySprites) c.sprite.destroy();
    this.canopySprites = [];
    this.envCtrl.clearAll();

    for (const tv of this.telegraphs.values()) {
      tv.groundFill.destroy();
      tv.rimEcho.destroy();
    }
    this.telegraphs.clear();

    const mapKey = zoneId === 'dng_ironmaw_foundry' ? 'map_dng_mossroot_hollow' : `map_${zoneId}`;
    const tmj = this.cache.json.get(mapKey);
    const widthTiles = Number(tmj?.width || 40);
    const heightTiles = Number(tmj?.height || 28);
    const tileSize = 32;
    const blocked = new Uint8Array(widthTiles * heightTiles);

    const groundLayer =
      tmj?.layers?.find((l: any) => String(l.name || '').toLowerCase() === 'ground')?.data || [];
    const colLayer =
      tmj?.layers?.find((l: any) => String(l.name || '').toLowerCase() === 'collision')?.data || [];

    const TILE_FRAME_BY_GID = [
      'tile_grass_a',
      'tile_grass_b',
      'tile_dirt_path',
      'tile_water',
      'tile_forest_flr',
      'tile_stone_flr',
      'tile_wall_rock',
      'tile_farm_soil',
    ];
    const hasTileset = this.textures.exists('tileset_mvp_extruded');
    const hasProps = this.textures.exists('atlas_world_props_mvp');

    for (let ty = 0; ty < heightTiles; ty++) {
      for (let tx = 0; tx < widthTiles; tx++) {
        const idx = ty * widthTiles + tx;
        const gid = Number(groundLayer[idx] || 1);
        const col = Number(colLayer[idx] || 0);
        blocked[idx] = col > 0 ? 1 : 0;

        if (hasTileset) {
          const fname = TILE_FRAME_BY_GID[Math.max(0, Math.min(TILE_FRAME_BY_GID.length - 1, gid - 1))];
          const img = this.add
            .image(tx * tileSize + 16, ty * tileSize + 16, 'tileset_mvp_extruded', fname)
            .setDepth(DepthLayerManager.ground(0));
          this.tileSprites.push(img);

          // 16x16 animated water ripples on water tiles (gid 4)
          if (gid === 4 && (tx + ty) % 3 === 0) {
            this.envCtrl.spawnAmbientLoop('vfx16_water_ripple_down', tx * 32 + 16, ty * 32 + 16);
          }
          // 16x16 animated grass sway on lush grass/forest tiles
          if ((gid === 1 || gid === 5) && (tx * 7 + ty * 13) % 19 === 0 && !col) {
            this.envCtrl.spawnAmbientLoop('vfx16_grass_sway_down', tx * 32 + 16, ty * 32 + 16, DepthLayerManager.allyDecal(2), 0.9);
          }
          // Forest oaks with canopy alpha 0.55 occlusion
          if (hasProps && gid === 5 && (tx * 5 + ty * 11) % 29 === 0 && ty > 3 && ty < heightTiles - 3 && tx > 3 && tx < widthTiles - 3 && Math.abs(ty - 14) > 3) {
            const trunk = this.add
              .image(tx * 32 + 16, ty * 32 + 28, 'atlas_world_props_mvp', 'prop_oak_trunk')
              .setOrigin(0.5, 0.9)
              .setDepth(DepthLayerManager.ySort(ty * 32 + 28));
            const canopy = this.add
              .image(tx * 32 + 16, ty * 32 - 2, 'atlas_world_props_mvp', 'prop_oak_canopy')
              .setOrigin(0.5, 0.9)
              .setDepth(DepthLayerManager.canopy());
            this.tileSprites.push(trunk);
            this.canopySprites.push({ sprite: canopy, cx: tx * 32 + 16, cy: ty * 32 + 16 });
          }
        }
      }
    }

    // Rich 16-bit environmental landmarks & animated props per zone
    if (hasProps) {
      if (zoneId === 'reg_greenhaven_village') {
        const placeProp = (tx: number, ty: number, frame: string) => {
          const p = this.add
            .image(tx * 32, ty * 32, 'atlas_world_props_mvp', frame)
            .setOrigin(0.5, 0.9)
            .setDepth(DepthLayerManager.ySort(ty * 32));
          this.tileSprites.push(p);
          return p;
        };
        placeProp(7, 11, 'bld_player_house_lv1');
        placeProp(14, 10, 'bld_blacksmith_lv1');
        placeProp(12, 18, 'bld_chicken_coop_lv1');
        placeProp(20, 12, 'prop_village_well');
        placeProp(24, 11, 'prop_signpost');
        placeProp(10, 12, 'prop_flower_bed');
        placeProp(17, 12, 'prop_flower_bed');
        placeProp(37, 14, 'prop_portal_arch');
        placeProp(21, 4, 'prop_portal_arch');

        // Village torches with animated 16x16 flame loops!
        for (const [tx, ty] of [[12, 11], [16, 11], [19, 14], [35, 13]]) {
          placeProp(tx, ty, 'prop_torch_post');
          this.envCtrl.spawnAmbientLoop('vfx16_torch_flame_down', tx * 32, ty * 32 - 22, DepthLayerManager.ySort(ty * 32 + 4));
        }
        // Animated portal swirls
        this.envCtrl.spawnAmbientLoop('vfx16_portal_swirl_down', 37 * 32, 14 * 32 - 24, DepthLayerManager.airVfx());
        this.envCtrl.spawnAmbientLoop('vfx16_portal_swirl_down', 21 * 32, 4 * 32 - 24, DepthLayerManager.airVfx());

        // Homestead crop rows rendered visually in soil patch!
        for (let cx = 6; cx <= 11; cx++) {
          placeProp(cx, 17, cx <= 8 ? 'crp_sunwheat_stage_3' : 'crp_sunwheat_stage_2');
          placeProp(cx, 19, cx % 2 === 0 ? 'crp_golden_carrot_stage_3' : 'crp_berry_bush_stage_3');
        }
        // Canopy oak trees around village perimeter for occlusion demo
        for (const [tx, ty] of [[4, 6], [11, 6], [26, 17], [31, 18]]) {
          placeProp(tx, ty, 'prop_oak_trunk');
          const canopy = this.add
            .image(tx * 32, ty * 32 - 28, 'atlas_world_props_mvp', 'prop_oak_canopy')
            .setOrigin(0.5, 0.9)
            .setDepth(DepthLayerManager.canopy());
          this.canopySprites.push({ sprite: canopy, cx: tx * 32, cy: ty * 32 - 12 });
        }
      } else if (zoneId === 'dng_mossroot_hollow' || zoneId === 'dng_ironmaw_foundry') {
        // 4 Boss Arena Stone Pillars + Animated Flame Embers
        for (const [tx, ty] of [[7, 6], [18, 6], [7, 13], [18, 13]]) {
          const p = this.add
            .image(tx * 32, ty * 32, 'atlas_world_props_mvp', 'prop_moss_pillar')
            .setOrigin(0.5, 0.9)
            .setDepth(DepthLayerManager.ySort(ty * 32));
          this.tileSprites.push(p);
          this.envCtrl.spawnAmbientLoop(
            zoneId === 'dng_ironmaw_foundry' ? 'vfx16_torch_flame_down' : 'vfx16_fire_ember_down',
            tx * 32,
            ty * 32 - 50,
            DepthLayerManager.ySort(ty * 32 + 4),
          );
        }
      } else if (zoneId === 'reg_whispering_forest') {
        const portal = this.add
          .image(40 * 32, 14 * 32, 'atlas_world_props_mvp', 'prop_portal_arch')
          .setOrigin(0.5, 0.9)
          .setDepth(DepthLayerManager.ySort(14 * 32));
        this.tileSprites.push(portal);
        this.envCtrl.spawnAmbientLoop('vfx16_portal_swirl_down', 40 * 32, 14 * 32 - 24, DepthLayerManager.airVfx());
      }
    }

    this.collisionMap = { widthTiles, heightTiles, tileSize, blockedTiles: blocked };
    this.cameras.main.setBounds(0, 0, widthTiles * tileSize, heightTiles * tileSize);
  }

  private handleZoneSnapshot(snap: ZoneSnapshotPayload): void {
    this.latestSnapshot = snap;
    if (snap.zoneId !== this.currentZoneId) {
      this.clearEntityVisuals();
      this.renderZoneMap(snap.zoneId);
    }

    // Update subtle Day/Night overlay
    const tintAlpha = snap.timeOfDayPhase === 'NIGHT' ? 0.22 : snap.timeOfDayPhase === 'DUSK' ? 0.1 : 0;
    this.lightingOverlay.setAlpha(tintAlpha);

    const myCharId = useAuthStore.getState().activeCharacterId;
    const seen = new Set<string>();
    let myEntity: WorldEntitySnapshot | null = null;
    let bossEntity: WorldEntitySnapshot | null = null;

    for (const ent of snap.entities) {
      seen.add(ent.id);
      if (ent.id === myCharId) myEntity = ent;
      if (ent.kind === 'BOSS') bossEntity = ent;

      let vis = this.entityVisuals.get(ent.id);
      if (!vis) {
        vis = this.createEntityVisual(ent);
        this.entityVisuals.set(ent.id, vis);
      }
      vis.lastSnapshot = ent;

      if (ent.id === myCharId) {
        // Gentle client-server reconciliation (snap only if drift > 36px)
        if (distancePx(this.localX, this.localY, ent.x, ent.y) > 36) {
          this.localX = ent.x;
          this.localY = ent.y;
        }
        if (ent.hp <= 0 && !this.deadEmitted) {
          this.deadEmitted = true;
          gameUiBridge.emit('player:died', { zoneId: snap.zoneId });
        }
      }

      if (vis.hfsm && ent.id !== myCharId) {
        vis.hfsm.requestTransition(ent.animState, ent.facing);
      }

      // Resource node visibility
      if (ent.kind === 'RESOURCE_NODE') {
        const depleted = Boolean(ent.depletedUntil && ent.depletedUntil > snap.serverTimeMs);
        vis.sprite.setAlpha(depleted ? 0.3 : 1);
      }

      // Update enemy HP bar
      if (vis.hpFill && ent.maxHp > 0) {
        const pct = Math.max(0, Math.min(1, ent.hp / ent.maxHp));
        vis.hpFill.setScale(pct, 1);
      }
    }

    // Destroy departed entities
    for (const [id, vis] of this.entityVisuals.entries()) {
      if (!seen.has(id)) {
        this.destroyEntityVisual(vis);
        this.entityVisuals.delete(id);
      }
    }

    // Compute nearest interactable prompt
    let nearbyPrompt: { kind: 'NPC' | 'NODE' | 'LOOT' | 'PORTAL'; id: string; label: string } | null = null;
    if (myEntity) {
      let bestDist = 88;
      for (const ent of snap.entities) {
        if (ent.id === myCharId) continue;
        const d = distancePx(this.localX, this.localY, ent.x, ent.y);
        if (d < bestDist) {
          if (ent.kind === 'LOOT' && ent.ownerCharacterId === myCharId) {
            bestDist = d;
            nearbyPrompt = { kind: 'LOOT', id: ent.id, label: `[F] Nhặt ${ent.name}` };
          } else if (ent.kind === 'NPC') {
            bestDist = d;
            nearbyPrompt = { kind: 'NPC', id: ent.id, label: `[F] Nói chuyện: ${ent.name}` };
          } else if (ent.kind === 'RESOURCE_NODE' && ent.hp > 0) {
            bestDist = d;
            nearbyPrompt = { kind: 'NODE', id: ent.id, label: `[F] Khai thác ${ent.name}` };
          }
        }
      }
      // East gate portal check
      if (!nearbyPrompt && this.collisionMap && this.localX > (this.collisionMap.widthTiles - 3) * 32) {
        const nextName =
          snap.zoneId === 'reg_greenhaven_village'
            ? 'Whispering Forest'
            : snap.zoneId === 'reg_whispering_forest'
              ? 'Boss Arena: Mossroot Hollow'
              : 'Greenhaven Village';
        nearbyPrompt = { kind: 'PORTAL', id: 'portal_east', label: `[F] Tiến vào ${nextName}` };
      }

      gameUiBridge.emit('hud:update', {
        zoneId: snap.zoneId,
        regionId: snap.regionId,
        timeOfDayPhase: snap.timeOfDayPhase,
        weather: snap.weather,
        season: snap.season,
        playerX: Math.round(this.localX),
        playerY: Math.round(this.localY),
        hp: myEntity.hp,
        maxHp: myEntity.maxHp,
        mp: myEntity.mp ?? 100,
        maxMp: myEntity.maxMp ?? 100,
        stamina: myEntity.stamina ?? 100,
        maxStamina: myEntity.maxStamina ?? 100,
        nearbyPrompt,
        bossHud: bossEntity
          ? {
              id: bossEntity.id,
              name: bossEntity.name,
              hp: bossEntity.hp,
              maxHp: bossEntity.maxHp,
              poise: bossEntity.poise ?? 0,
              maxPoise: bossEntity.maxPoise ?? 520,
              phase: bossEntity.phase ?? 1,
            }
          : null,
      });

      gameUiBridge.emit('minimap:update', {
        zoneId: snap.zoneId,
        playerX: Math.round(this.localX),
        playerY: Math.round(this.localY),
        entities: snap.entities.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y })),
      });
    }
  }

  private createEntityVisual(ent: WorldEntitySnapshot): EntityVisual {
    let atlasKey = '__pixel_fallback';
    let frameName: string | undefined;
    let pivotY = 0.875;
    let clipEntityId = ent.templateId;

    if (ent.kind === 'PLAYER') {
      const heroAtlas = `atlas_${ent.templateId}`;
      atlasKey = this.textures.exists(heroAtlas) ? heroAtlas : 'atlas_chr_kael_vanguard';
      if (!this.textures.exists(atlasKey)) atlasKey = '__pixel_fallback';
      clipEntityId = this.textures.exists(heroAtlas) ? ent.templateId : 'chr_kael_vanguard';
    } else if (ent.kind === 'NPC') {
      atlasKey = this.textures.exists('atlas_chr_seraphina_dawn') ? 'atlas_chr_seraphina_dawn' : '__pixel_fallback';
      clipEntityId = 'chr_seraphina_dawn';
    } else if (ent.kind === 'BOSS') {
      const bossAtlas = `atlas_${ent.templateId}`;
      atlasKey = this.textures.exists(bossAtlas) ? bossAtlas : this.textures.exists('atlas_boss_thornback_elder') ? 'atlas_boss_thornback_elder' : '__pixel_fallback';
      clipEntityId = this.textures.exists(bossAtlas) ? ent.templateId : 'boss_thornback_elder';
      pivotY = 0.85;
    } else if (ent.kind === 'MONSTER' || ent.kind === 'ELITE') {
      atlasKey = this.textures.exists('atlas_mobs_forest') ? 'atlas_mobs_forest' : '__pixel_fallback';
      pivotY = 0.85;
    } else if (ent.kind === 'RESOURCE_NODE') {
      atlasKey = this.textures.exists('atlas_world_props_mvp') ? 'atlas_world_props_mvp' : '__pixel_fallback';
      frameName = ent.resourceType === 'OAK_TREE' ? 'prop_oak_trunk' : ent.resourceType === 'COPPER_VEIN' ? 'prop_ore_vein' : 'prop_moss_pillar';
      pivotY = 0.88;
    } else if (ent.kind === 'LOOT') {
      atlasKey = this.textures.exists('atlas_vfx_16x16') ? 'atlas_vfx_16x16' : '__pixel_fallback';
      clipEntityId = 'vfx16_loot_sparkle';
      pivotY = 0.5;
    }

    const shadowW = ent.kind === 'BOSS' ? 84 : ent.kind === 'PLAYER' || ent.kind === 'NPC' ? 24 : 20;
    const shadow = this.add.ellipse(Math.round(ent.x), Math.round(ent.y), shadowW, Math.round(shadowW * 0.45), 0x000000, 0.38);
    shadow.setDepth(DepthLayerManager.shadow(0));

    const sprite = this.add.sprite(Math.round(ent.x), Math.round(ent.y), atlasKey, frameName);
    sprite.setOrigin(0.5, pivotY);
    sprite.setDepth(DepthLayerManager.ySort(ent.y));

    if (ent.kind === 'LOOT' && this.anims.exists('vfx16_loot_sparkle_down')) {
      sprite.play('vfx16_loot_sparkle_down');
    }

    const labelColor =
      ent.kind === 'BOSS'
        ? '#ff6b6b'
        : ent.kind === 'ELITE'
          ? '#facc15'
          : ent.kind === 'NPC'
            ? '#7ce0c3'
            : ent.kind === 'LOOT'
              ? '#fde047'
              : '#f4e6c8';

    const label = this.add
      .text(Math.round(ent.x), Math.round(ent.y - (ent.kind === 'BOSS' ? 116 : 56)), ent.name, {
        fontFamily: 'Courier New, monospace',
        fontSize: '9px',
        color: labelColor,
        stroke: '#0c0908',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(DepthLayerManager.nameplate());

    let hpBg: Phaser.GameObjects.Rectangle | undefined;
    let hpFill: Phaser.GameObjects.Rectangle | undefined;
    if (ent.kind === 'MONSTER' || ent.kind === 'ELITE') {
      hpBg = this.add.rectangle(Math.round(ent.x), Math.round(ent.y - 46), 34, 4, 0x18100d).setDepth(DepthLayerManager.nameplate());
      hpFill = this.add
        .rectangle(Math.round(ent.x - 17), Math.round(ent.y - 46), 34, 4, ent.kind === 'ELITE' ? 0xfacc15 : 0xef4444)
        .setOrigin(0, 0.5)
        .setDepth(DepthLayerManager.nameplate() + 1);
    }

    let hfsm: CharacterHfsmController | undefined;
    if (ent.kind === 'PLAYER' || ent.kind === 'NPC' || ent.kind === 'MONSTER' || ent.kind === 'ELITE' || ent.kind === 'BOSS') {
      hfsm = new CharacterHfsmController(clipEntityId, this.animRegistry.clipMap, (clipKey, _s, dir) => {
        this.animRegistry.playSafe(sprite, clipKey, clipEntityId, dir);
      });
      this.animRegistry.playSafe(sprite, hfsm.getCurrentClipKey(), clipEntityId, ent.facing);
    }

    return { sprite, shadow, label, hpBg, hpFill, hfsm, lastSnapshot: ent };
  }

  private destroyEntityVisual(vis: EntityVisual): void {
    vis.sprite.destroy();
    vis.shadow.destroy();
    vis.label.destroy();
    vis.hpBg?.destroy();
    vis.hpFill?.destroy();
  }

  private clearEntityVisuals(): void {
    for (const v of this.entityVisuals.values()) this.destroyEntityVisual(v);
    this.entityVisuals.clear();
  }

  private triggerCombatAction(
    action: 'BASIC_ATTACK' | 'SKILL' | 'DODGE' | 'BLOCK',
    skillId?: string,
    targetX?: number,
    targetY?: number,
  ): void {
    const myCharId = useAuthStore.getState().activeCharacterId;
    const myVis = myCharId ? this.entityVisuals.get(myCharId) : undefined;
    if (myVis?.hfsm) {
      const nextState =
        action === 'DODGE' ? 'dodge' : action === 'BLOCK' ? 'block' : action === 'SKILL' ? 'skill' : 'attack';
      myVis.hfsm.requestTransition(nextState, this.localFacing);
    }
    void realtimeClient.sendCombat(action, skillId, targetX, targetY).then((res) => {
      if (res?.ok && skillId) {
        const sk = useProgressionStore.getState().activeSkills.find((s: any) => s.id === skillId);
        if (sk?.cooldownMs) {
          useHudStore.getState().setSkillCooldown(skillId, Date.now() + Number(sk.cooldownMs));
        }
      }
    });
  }

  private spawnDamageNumber(evt: CombatDamageEvent): void {
    const prefs = useAuthStore.getState().preferences;
    if (!prefs.showDamageNumbers) return;

    const textStr = evt.isParried ? 'PARRY!' : evt.isBlocked ? `BLOCK ${evt.damage}` : evt.isCrit ? `${evt.damage}!` : `${evt.damage}`;
    const color = evt.isParried ? '#49d8ff' : evt.isCrit ? '#facc15' : evt.attackerId === useAuthStore.getState().activeCharacterId ? '#ffffff' : '#ff6b6b';

    const txt = this.add
      .text(Math.round(evt.x), Math.round(evt.y - 34), textStr, {
        fontFamily: 'Courier New, monospace',
        fontSize: evt.isCrit ? '14px' : '11px',
        fontStyle: 'bold',
        color,
        stroke: '#0d0908',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(DepthLayerManager.floatingText());

    this.tweens.add({
      targets: txt,
      y: txt.y - 26,
      alpha: 0,
      duration: 680,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });

    this.envCtrl.spawnBurst16(evt.isCrit ? 'vfx16_crit_star_down' : 'vfx16_hit_spark_down', evt.x, evt.y - 18, 220);
    retroSfxSynth.play(evt.isParried ? 'parry' : evt.isCrit ? 'crit' : 'hit');

    // Crisp 80ms white hit-flash on target sprite
    const targetVis = this.entityVisuals.get(evt.targetId);
    if (targetVis?.sprite.active) {
      targetVis.sprite.setTintFill(0xffffff);
      this.time.delayedCall(80, () => {
        if (targetVis.sprite.active) targetVis.sprite.clearTint();
      });
    }

    if (evt.isCrit || evt.poiseBroken) {
      this.cameraCtrl.triggerShake(evt.poiseBroken ? 4 : 2, 160);
    }
  }

  private spawnSkillVfx(evt: SkillCastVfxEvent): void {
    const prefs = useAuthStore.getState().preferences;
    const isMine = evt.casterId === useAuthStore.getState().activeCharacterId;
    const alpha = isMine ? 0.92 : Math.max(0.25, prefs.allyVfxOpacityPct / 100);

    if (evt.vfxKey.startsWith('vfx16_')) {
      this.envCtrl.spawnBurst16(`${evt.vfxKey}_down`, evt.targetX, evt.targetY - 12, evt.durationMs);
      return;
    }

    if (this.textures.exists('atlas_vfx_skills_mvp')) {
      const frame0 = `${evt.vfxKey}_0`;
      if (this.textures.get('atlas_vfx_skills_mvp').has(frame0)) {
        const sp = this.add.sprite(Math.round(evt.targetX), Math.round(evt.targetY), 'atlas_vfx_skills_mvp', frame0);
        sp.setDepth(DepthLayerManager.airVfx());
        sp.setAlpha(alpha);
        let f = 0;
        const ev = this.time.addEvent({
          delay: Math.max(60, Math.floor(evt.durationMs / 4)),
          repeat: 3,
          callback: () => {
            f++;
            const fn = `${evt.vfxKey}_${f % 4}`;
            if (sp.active && this.textures.get('atlas_vfx_skills_mvp').has(fn)) {
              sp.setFrame(fn);
            }
          },
        });
        this.time.delayedCall(evt.durationMs + 40, () => {
          ev.remove();
          sp.destroy();
        });
      }
    }
  }

  /**
   * Renders UNLIT #FF3B3B Boss Telegraph at depth 180-199 + Telegraph Rim Echo at 109500
   * so Ultimates can NEVER hide lethal boss mechanics!
   */
  private spawnBossTelegraph(evt: BossTelegraphEvent): void {
    retroSfxSynth.play('bossTelegraph');
    const groundFill = this.add.graphics().setDepth(DepthLayerManager.bossTelegraphUnlit(5));
    const rimEcho = this.add.graphics().setDepth(DepthLayerManager.telegraphRimEcho());
    this.telegraphs.set(evt.telegraphId, { event: evt, groundFill, rimEcho });
  }

  private updateTelegraphs(): void {
    const now = Date.now();
    for (const [id, tv] of this.telegraphs.entries()) {
      const elapsed = now - tv.event.createdAtMs;
      const ratio = Math.min(1, Math.max(0, elapsed / tv.event.telegraphMs));
      if (elapsed >= tv.event.telegraphMs + 120) {
        tv.groundFill.destroy();
        tv.rimEcho.destroy();
        this.telegraphs.delete(id);
        continue;
      }
      const { x, y, radiusPx } = tv.event;
      tv.groundFill.clear();
      tv.groundFill.fillStyle(0xff3b3b, 0.25);
      tv.groundFill.fillCircle(x, y, radiusPx);
      tv.groundFill.fillStyle(0xff3b3b, 0.35);
      tv.groundFill.fillCircle(x, y, Math.round(radiusPx * ratio));

      tv.rimEcho.clear();
      tv.rimEcho.lineStyle(2, 0xff3b3b, 0.95);
      tv.rimEcho.strokeCircle(x, y, radiusPx);
    }
  }

  update(_time: number, delta: number): void {
    const dtMs = Math.min(50, delta);
    const dtSec = dtMs / 1000;
    const myCharId = useAuthStore.getState().activeCharacterId;
    const canInput = inputFocusManager.shouldForwardToPhaser() && !this.deadEmitted;

    // 1. Handle local movement prediction + 20 Hz input emission
    let dx = 0;
    let dy = 0;
    let sprint = false;
    if (canInput && this.keys) {
      if (this.keys.a.isDown || this.keys.left.isDown) dx -= 1;
      if (this.keys.d.isDown || this.keys.right.isDown) dx += 1;
      if (this.keys.w.isDown || this.keys.up.isDown) dy -= 1;
      if (this.keys.s.isDown || this.keys.down.isDown) dy += 1;
      sprint = this.keys.shift.isDown;

      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) this.triggerCombatAction('BASIC_ATTACK');
      if (Phaser.Input.Keyboard.JustDown(this.keys.shift) && (dx !== 0 || dy !== 0)) this.triggerCombatAction('DODGE');
      if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.triggerCombatAction('BLOCK');

      const skills = useProgressionStore.getState().activeSkills.filter((s: any) => s.skillType !== 'PASSIVE');
      if (Phaser.Input.Keyboard.JustDown(this.keys.one) && skills[0]) this.triggerCombatAction('SKILL', skills[0].id);
      if (Phaser.Input.Keyboard.JustDown(this.keys.two) && skills[1]) this.triggerCombatAction('SKILL', skills[1].id);
      if (Phaser.Input.Keyboard.JustDown(this.keys.three) && skills[2]) this.triggerCombatAction('SKILL', skills[2].id);
      if (Phaser.Input.Keyboard.JustDown(this.keys.q) && skills[3]) this.triggerCombatAction('SKILL', skills[3].id);

      if (Phaser.Input.Keyboard.JustDown(this.keys.f)) {
        const prompt = useHudStore.getState().hud.nearbyPrompt;
        if (prompt?.kind === 'LOOT') void realtimeClient.sendLootPickup(prompt.id);
        else if (prompt?.kind === 'NODE') void realtimeClient.sendGather(prompt.id);
        else if (prompt?.kind === 'NPC') gameUiBridge.emit('interact:npc', { npcId: prompt.id });
        else if (prompt?.kind === 'PORTAL') void realtimeClient.sendPortalTravel();
      }
    }

    const isMoving = dx !== 0 || dy !== 0;
    if (isMoving && this.collisionMap) {
      if (Math.abs(dx) > Math.abs(dy)) this.localFacing = dx < 0 ? 'left' : 'right';
      else this.localFacing = dy < 0 ? 'up' : 'down';
      const stats = useProgressionStore.getState().computedStats;
      const moveSpeed = Number(stats?.moveSpeed || 152) * (sprint ? 1.32 : 1.0);
      const moved = resolveSlidingMove(this.localX, this.localY, dx, dy, moveSpeed, dtSec, this.collisionMap);
      this.localX = moved.x;
      this.localY = moved.y;
    }

    const nowMs = performance.now();
    if (myCharId && nowMs - this.lastMoveSendMs >= 50) {
      this.lastMoveSendMs = nowMs;
      this.inputSeq++;
      realtimeClient.sendMove(this.inputSeq, dx, dy, sprint, 50);
    }

    // 2. Sync visuals, Y-sorting, HFSM watchdogs
    for (const [id, vis] of this.entityVisuals.entries()) {
      let targetX = vis.lastSnapshot.x;
      let targetY = vis.lastSnapshot.y;
      if (id === myCharId) {
        targetX = this.localX;
        targetY = this.localY;
        if (vis.hfsm) {
          vis.hfsm.requestTransition(isMoving ? (sprint ? 'sprint' : 'run') : 'idle', this.localFacing);
          vis.hfsm.tick(dtMs, isMoving);
        }
      } else {
        targetX = Phaser.Math.Linear(vis.sprite.x, vis.lastSnapshot.x, Math.min(1, dtMs / 90));
        targetY = Phaser.Math.Linear(vis.sprite.y, vis.lastSnapshot.y, Math.min(1, dtMs / 90));
        vis.hfsm?.tick(dtMs, false);
      }

      const rx = Math.round(targetX);
      const ry = Math.round(targetY);
      vis.sprite.setPosition(rx, ry);
      vis.sprite.setDepth(DepthLayerManager.ySort(ry));
      vis.shadow.setPosition(rx, ry);
      vis.label.setPosition(rx, ry - (vis.lastSnapshot.kind === 'BOSS' ? 116 : 56));
      if (vis.hpBg && vis.hpFill) {
        vis.hpBg.setPosition(rx, ry - 46);
        vis.hpFill.setPosition(rx - 17, ry - 46);
      }
    }

    // 3. Canopy occlusion alpha 0.55
    for (const c of this.canopySprites) {
      c.sprite.setAlpha(DepthLayerManager.computeCanopyAlpha(c.cx, c.cy, this.localX, this.localY));
    }

    // 4. Building placement ghost cursor snapping to 32x32 grid
    const placingId = useHomesteadStore.getState().placingBuildingId;
    if (placingId && this.input.activePointer) {
      const gx = Math.floor(this.input.activePointer.worldX / 32) * 32 + 48;
      const gy = Math.floor(this.input.activePointer.worldY / 32) * 32 + 48;
      this.buildGhost.setVisible(true).setPosition(gx, gy);
    } else {
      this.buildGhost.setVisible(false);
    }

    // 5. Boss telegraphs + Pixel-perfect integer-snapped camera
    this.updateTelegraphs();
    this.cameraCtrl.update(this.localX, this.localY, dtMs);
  }
}
