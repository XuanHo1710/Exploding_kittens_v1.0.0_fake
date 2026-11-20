import { describe, it, expect } from 'vitest';
import {
  AssetManifestSchema,
  AnimationClipDefinitionSchema,
  BackupObjectSnapshotSchema,
  compute4BoxesFromFoot,
  resolveSlidingMove,
  computeCharacterStats,
  enhancedWeaponAtk,
  computeDamageHit,
} from '../src/index';

describe('@eldoria/shared contracts & math', () => {
  it('validates AssetManifest & AssetEntry constrained fields including Q1-A 16x16 VFX standard', () => {
    const parsed = AssetManifestSchema.parse({
      manifestVersion: '1.0.0',
      generatedAt: '2026-11-20T00:00:00.000Z',
      pixelStandard: {
        baseTilePx: 32,
        heroFramePx: [48, 64],
        vfxMicroFramePx: [16, 16],
        viewportPx: [640, 360],
        paddingPx: 2,
        extrudePx: 1,
      },
      entries: [
        {
          assetKey: 'atlas_chr_kael_vanguard',
          objectKey: 'v1/atlases/heroes/chr_kael_vanguard.png',
          kind: 'ATLAS_PNG',
          loadingGroup: 'hero_on_demand',
          sha256: 'a'.repeat(64),
          sizeBytes: 4096,
        },
      ],
    });
    expect(parsed.pixelStandard.vfxMicroFramePx).toEqual([16, 16]);
  });

  it('validates AnimationClipDefinition watchdog ceiling invariant', () => {
    const valid = AnimationClipDefinitionSchema.safeParse({
      clipKey: 'chr_kael_vanguard_attack_combo_down',
      entityId: 'chr_kael_vanguard',
      state: 'attack_combo',
      direction: 'down',
      atlasKey: 'atlas_chr_kael_vanguard',
      frameCount: 4,
      frameDurationMs: [70, 70, 80, 80],
      loop: false,
      priority: 6,
      pivotNorm: { x: 0.5, y: 0.875 },
      hitFrameIndex: 2,
      cancelWindowStartFrame: 3,
      watchdogMaxDurationMs: 450,
      fallbackState: 'idle',
    });
    expect(valid.success).toBe(true);

    const badWatchdog = AnimationClipDefinitionSchema.safeParse({
      clipKey: 'chr_kael_vanguard_attack_combo_down',
      entityId: 'chr_kael_vanguard',
      state: 'attack_combo',
      direction: 'down',
      atlasKey: 'atlas_chr_kael_vanguard',
      frameCount: 4,
      frameDurationMs: [70, 70, 80, 80],
      loop: false,
      priority: 6,
      pivotNorm: { x: 0.5, y: 0.875 },
      hitFrameIndex: 2,
      cancelWindowStartFrame: 3,
      watchdogMaxDurationMs: 200, // too small (< 300 + 150)
      fallbackState: 'idle',
    });
    expect(badWatchdog.success).toBe(false);
  });

  it('validates BackupObjectSnapshot schema', () => {
    const ok = BackupObjectSnapshotSchema.safeParse({
      backupId: '20261120-001500',
      reason: 'SCHEDULED_6H',
      sourceJsonFileCount: 12,
      archiveSha256: 'f'.repeat(64),
      retentionTier: 'HOURLY_6H',
      createdAt: '2026-11-20T00:15:00.000Z',
    });
    expect(ok.success).toBe(true);
  });

  it('enforces 4-Box spatial contract & axis-separated sliding tile collision', () => {
    const boxes = compute4BoxesFromFoot(160, 160);
    expect(boxes.footCollision.width).toBeLessThan(boxes.spriteFrame.width);
    expect(boxes.interactionBox.width).toBeGreaterThan(boxes.footCollision.width);

    const blocked = new Uint8Array(10 * 10);
    blocked[5 * 10 + 6] = 1; // tile (6,5) blocked -> x in [192..224), y in [160..192)
    const map = { widthTiles: 10, heightTiles: 10, tileSize: 32, blockedTiles: blocked };
    const moved = resolveSlidingMove(180, 176, 1, 1, 150, 0.2, map);
    expect(moved.collided).toBe(true);
    expect(moved.x).toBe(180); // blocked on X, slid cleanly on Y!
    expect(moved.y).toBeGreaterThan(176);
  });

  it('computes BLG-BAL-001 balanced stats and +0..+10 weapon enhancement scaling', () => {
    expect(enhancedWeaponAtk(26, 0)).toBe(26);
    expect(enhancedWeaponAtk(26, 10)).toBe(155);

    const stats = computeCharacterStats({
      baseStats: { hp: 195, mp: 85, stamina: 120, atk: 28, def: 18, str: 15, agi: 11, int: 8, vit: 13, dex: 11, luk: 9, critRate: 0.08, critDamage: 1.55, attackSpeed: 1.05, moveSpeed: 152, cdr: 0.02 },
      growthPerLevel: { hp: 22.5, mp: 5.5, atk: 4.2, def: 2.3, str: 1.4, dex: 0.9 },
      level: 15,
      equipmentBonus: { atk: enhancedWeaponAtk(26, 5) },
    });
    expect(stats.atk).toBeGreaterThan(140);
    expect(stats.atk).toBeLessThan(260); // BLG-BAL-001 keeps Lv15 ATK controlled for 120-210s Boss TTK!

    const hit = computeDamageHit({
      attackerAtk: stats.atk,
      attackerLevel: 15,
      baseDamage: 40,
      scalingRatio: 1.4,
      critRate: 0.25,
      critDamage: 1.6,
      defenderDef: 34,
      attackElement: 'FIRE',
      defenderWeakness: 'FIRE',
      defenderElementRes: -0.35,
      isStaggered: true,
      staggerMult: 1.4,
      rngValue: 0.1,
    });
    expect(hit.isCrit).toBe(true);
    expect(hit.damage).toBeGreaterThan(200);
  });
});
