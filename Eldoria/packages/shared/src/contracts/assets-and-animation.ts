import { z } from 'zod';

/**
 * Shared Zod Schemas & TypeScript Contracts for 013-local-infra-pixel-animation
 * Enforces 30/30 canonical constrained fields from specs/013-local-infra-pixel-animation/data-model.md
 * Ratified Q1-A: 32x32 base tile, 48x64 humanoid, 128..256 boss, 16x16 animated VFX/micro-effects (0 mixel).
 */

export const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
export const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;
export const ISO_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
export const BACKUP_ID_REGEX = /^\d{8}-\d{6}$/;

export const PIXEL_STANDARD_INVARIANTS = {
  baseTilePx: 32,
  heroFramePx: [48, 64] as const,
  vfxMicroFramePx: [16, 16] as const,
  viewportPx: [640, 360] as const,
  paddingPx: 2,
  extrudePx: 1,
} as const;

export const RENDER_DEPTH_STACK = {
  GROUND_MIN: 0,
  GROUND_MAX: 99,
  ALLY_DECAL_MIN: 100,
  ALLY_DECAL_MAX: 119,
  BUILD_GRID_MIN: 120,
  BUILD_GRID_MAX: 139,
  HAZARD_MIN: 140,
  HAZARD_MAX: 179,
  BOSS_TELEGRAPH_UNLIT_MIN: 180,
  BOSS_TELEGRAPH_UNLIT_MAX: 199,
  GROUND_SHADOW_MIN: 200,
  GROUND_SHADOW_MAX: 299,
  YSORT_BASE: 1000,
  YSORT_MAX: 99999,
  OVERHEAD_CANOPY: 101000,
  HIGH_PROJECTILE: 103000,
  AIR_VFX_ULTIMATE: 105000,
  TELEGRAPH_RIM_ECHO: 109500,
  LIGHTING_OVERLAY: 111000,
  WEATHER_OVERLAY: 114000,
  NAMEPLATES: 116000,
  FLOATING_TEXT: 118000,
} as const;

export const AssetKindEnum = z.enum([
  'ATLAS_PNG',
  'ATLAS_JSON',
  'TILESET_EXTRUDED',
  'TILED_MAP',
  'AUDIO',
  'FONT',
]);
export type AssetKind = z.infer<typeof AssetKindEnum>;

export const AssetLoadingGroupEnum = z.enum([
  'core_ui',
  'region_mvp',
  'hero_on_demand',
  'boss_instance',
]);
export type AssetLoadingGroup = z.infer<typeof AssetLoadingGroupEnum>;

export const AssetEntrySchema = z.object({
  assetKey: z.string().regex(/^[a-z0-9_.-]+$/),
  objectKey: z.string().regex(/^v\d+\/[a-z0-9/_.-]+$/),
  kind: AssetKindEnum,
  loadingGroup: AssetLoadingGroupEnum,
  sha256: z.string().regex(SHA256_HEX_REGEX),
  sizeBytes: z.number().int().min(1),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

export const PixelStandardSchema = z.object({
  baseTilePx: z.literal(32),
  heroFramePx: z.tuple([z.literal(48), z.literal(64)]),
  vfxMicroFramePx: z.tuple([z.literal(16), z.literal(16)]),
  viewportPx: z.tuple([z.literal(640), z.literal(360)]),
  paddingPx: z.literal(2),
  extrudePx: z.literal(1),
});
export type PixelStandard = z.infer<typeof PixelStandardSchema>;

export const AssetManifestSchema = z
  .object({
    manifestVersion: z.string().regex(SEMVER_REGEX),
    generatedAt: z.string().regex(ISO_UTC_REGEX),
    pixelStandard: PixelStandardSchema,
    entries: z.array(AssetEntrySchema).min(1),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < val.entries.length; i++) {
      const k = val.entries[i].assetKey;
      if (seen.has(k)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries', i, 'assetKey'],
          message: `Duplicate AssetEntry.assetKey: ${k}`,
        });
      }
      seen.add(k);
    }
  });
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export const BackupReasonEnum = z.enum(['SCHEDULED_6H', 'PRE_MIGRATION', 'MANUAL_ADMIN']);
export const BackupRetentionTierEnum = z.enum(['HOURLY_6H', 'DAILY_7D']);

export const BackupObjectSnapshotSchema = z.object({
  backupId: z.string().regex(BACKUP_ID_REGEX),
  reason: BackupReasonEnum,
  sourceJsonFileCount: z.number().int().min(1),
  archiveSha256: z.string().regex(SHA256_HEX_REGEX),
  retentionTier: BackupRetentionTierEnum,
  createdAt: z.string().regex(ISO_UTC_REGEX),
});
export type BackupObjectSnapshot = z.infer<typeof BackupObjectSnapshotSchema>;

export const CANONICAL_25_ANIMATION_STATES = [
  'idle',
  'walk',
  'run',
  'sprint',
  'attack',
  'attack_combo',
  'cast',
  'skill',
  'ultimate',
  'dodge',
  'dash',
  'hit',
  'knockback',
  'stun',
  'block',
  'death',
  'respawn',
  'mining',
  'woodcutting',
  'farming',
  'fishing',
  'crafting',
  'building',
  'interact',
  'emote',
] as const;

export const AnimationStateEnum = z.enum(CANONICAL_25_ANIMATION_STATES);
export type AnimationState = z.infer<typeof AnimationStateEnum>;

export const AnimationDirectionEnum = z.enum([
  'down',
  'up',
  'left',
  'right',
  'down_left',
  'down_right',
  'up_left',
  'up_right',
]);
export type AnimationDirection = z.infer<typeof AnimationDirectionEnum>;
export const MVP_4_DIRECTIONS = ['down', 'up', 'left', 'right'] as const;

export const AnimationClipDefinitionSchema = z
  .object({
    clipKey: z.string().regex(/^[a-z0-9_]+_(down|up|left|right|down_left|down_right|up_left|up_right)$/),
    entityId: z.string().min(3).max(64),
    state: AnimationStateEnum,
    direction: AnimationDirectionEnum,
    atlasKey: z.string().regex(/^[a-z0-9_.-]+$/),
    frameCount: z.number().int().min(1),
    frameDurationMs: z.array(z.number().int().min(33).max(500)).min(1),
    loop: z.boolean(),
    priority: z.number().int().min(1).max(11),
    pivotNorm: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }),
    hitFrameIndex: z.number().int().min(0).nullable(),
    cancelWindowStartFrame: z.number().int().min(0).nullable(),
    watchdogMaxDurationMs: z.number().int().min(0),
    fallbackState: AnimationStateEnum.default('idle'),
  })
  .superRefine((clip, ctx) => {
    if (clip.frameDurationMs.length !== clip.frameCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['frameDurationMs'],
        message: 'frameDurationMs length must equal frameCount',
      });
    }
    if (clip.hitFrameIndex !== null && clip.hitFrameIndex >= clip.frameCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hitFrameIndex'],
        message: 'hitFrameIndex must be < frameCount',
      });
    }
    if (clip.cancelWindowStartFrame !== null && clip.cancelWindowStartFrame >= clip.frameCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cancelWindowStartFrame'],
        message: 'cancelWindowStartFrame must be < frameCount',
      });
    }
    const totalMs = clip.frameDurationMs.reduce((a, b) => a + b, 0);
    if (!clip.loop && clip.watchdogMaxDurationMs < totalMs + 150) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['watchdogMaxDurationMs'],
        message: `Non-looping clip watchdogMaxDurationMs must be >= ${totalMs + 150}`,
      });
    }
    if (clip.loop && clip.watchdogMaxDurationMs !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['watchdogMaxDurationMs'],
        message: 'Looping clip watchdogMaxDurationMs must be 0',
      });
    }
  });
export type AnimationClipDefinition = z.infer<typeof AnimationClipDefinitionSchema>;

export const HealthComponentStatusEnum = z.enum(['UP', 'DEGRADED', 'DOWN']);

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['OK', 'DEGRADED', 'DOWN']),
  protocolVersion: z.string(),
  constitutionVersion: z.string(),
  serverTime: z.string(),
  components: z.object({
    jsonPrimaryDb: z.object({
      status: HealthComponentStatusEnum,
      walPending: z.number().int().min(0),
      schemaVersion: z.string(),
    }),
    gameCatalog: z.object({
      status: HealthComponentStatusEnum,
      filesLoaded: z.number().int().min(0),
      manifestHash: z.string(),
    }),
    localRedis: z.object({
      status: HealthComponentStatusEnum,
      mode: z.enum(['CONNECTED', 'RAM_FALLBACK', 'DISABLED']),
      latencyMs: z.number().nullable(),
    }),
    localMinio: z.object({
      status: HealthComponentStatusEnum,
      mode: z.enum(['MINIO', 'LOCAL_FS_FALLBACK']),
      assetsBucket: z.string(),
      backupsBucket: z.string(),
      assetManifestVersion: z.string().nullable(),
    }),
  }),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
