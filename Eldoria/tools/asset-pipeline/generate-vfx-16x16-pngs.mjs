/**
 * Offline Deterministic 16x16 Animated VFX / Particle / Projectile / Icon Generator
 * + MVP Skill & Iconic Ultimate VFX + Boss Telegraph (#FF3B3B) PNG Atlas Generator (Q1-A)
 * Enforces data-model.md: AssetManifest.pixelStandard.vfxMicroFramePx = [16, 16], paddingPx = 2.
 */
import path from 'node:path';
import { PixelBuffer, packPhaserAtlas, writeFileWithMeta } from './png-encoder.mjs';

const MICRO_16_ANIMS = [
  { key: 'vfx16_hit_spark',     frames: 4, ms: 55,  loop: false, kind: 'spark',   c1: '#ffffff', c2: '#fde047', c3: '#ff6b1a' },
  { key: 'vfx16_fire_ember',    frames: 4, ms: 80,  loop: true,  kind: 'flame',   c1: '#fff4b8', c2: '#ff6b1a', c3: '#c8281e' },
  { key: 'vfx16_water_ripple',  frames: 4, ms: 160, loop: true,  kind: 'ripple',  c1: '#e0faff', c2: '#38bdf8', c3: '#0284c7' },
  { key: 'vfx16_wind_slash',    frames: 4, ms: 65,  loop: false, kind: 'slash',   c1: '#ecfeff', c2: '#7ce0c3', c3: '#10b981' },
  { key: 'vfx16_light_heal',    frames: 4, ms: 100, loop: true,  kind: 'plus',    c1: '#ffffff', c2: '#ffe566', c3: '#4ade80' },
  { key: 'vfx16_frost_shard',   frames: 4, ms: 90,  loop: true,  kind: 'crystal', c1: '#ffffff', c2: '#93e1ff', c3: '#3b82f6' },
  { key: 'vfx16_lightning_zap', frames: 4, ms: 60,  loop: false, kind: 'bolt',    c1: '#ffffff', c2: '#49d8ff', c3: '#ffe156' },
  { key: 'vfx16_shadow_orb',    frames: 4, ms: 95,  loop: true,  kind: 'orb',     c1: '#f3e8ff', c2: '#9d5cff', c3: '#4c1d95' },
  { key: 'vfx16_earth_rock',    frames: 4, ms: 85,  loop: false, kind: 'rock',    c1: '#fde68a', c2: '#c49a45', c3: '#7c5329' },
  { key: 'vfx16_loot_sparkle',  frames: 4, ms: 140, loop: true,  kind: 'star',    c1: '#ffffff', c2: '#f5c451', c3: '#fb923c' },
  { key: 'vfx16_coin_spin',     frames: 4, ms: 120, loop: true,  kind: 'coin',    c1: '#fef08a', c2: '#f59e0b', c3: '#92400e' },
  { key: 'vfx16_arrow_proj',    frames: 2, ms: 80,  loop: true,  kind: 'arrow',   c1: '#ecfeff', c2: '#7ce0c3', c3: '#15803d' },
  { key: 'vfx16_dust_puff',     frames: 4, ms: 90,  loop: false, kind: 'dust',    c1: '#f1f5f9', c2: '#cbd5e1', c3: '#64748b' },
  { key: 'vfx16_status_burn',   frames: 2, ms: 200, loop: true,  kind: 'flame',   c1: '#fff4b8', c2: '#ff6b1a', c3: '#c8281e' },
  { key: 'vfx16_status_stun',   frames: 4, ms: 140, loop: true,  kind: 'star',    c1: '#ffffff', c2: '#facc15', c3: '#ca8a04' },
  { key: 'vfx16_status_shield', frames: 2, ms: 240, loop: true,  kind: 'shield',  c1: '#e0f2fe', c2: '#38bdf8', c3: '#0369a1' },
  { key: 'vfx16_portal_swirl',  frames: 4, ms: 110, loop: true,  kind: 'orb',     c1: '#ecfeff', c2: '#38bdf8', c3: '#7c3aed' },
  { key: 'vfx16_level_up',      frames: 4, ms: 100, loop: false, kind: 'plus',    c1: '#ffffff', c2: '#facc15', c3: '#f59e0b' },
  { key: 'vfx16_poison_bubble', frames: 4, ms: 150, loop: true,  kind: 'ripple',  c1: '#dcfce7', c2: '#84cc16', c3: '#3f6212' },
  { key: 'vfx16_crit_star',     frames: 4, ms: 65,  loop: false, kind: 'spark',   c1: '#ffffff', c2: '#facc15', c3: '#ef4444' },
  { key: 'vfx16_heal_heart',    frames: 4, ms: 120, loop: false, kind: 'heart',   c1: '#ffe4e6', c2: '#fb7185', c3: '#e11d48' },
  { key: 'vfx16_chest_glow',    frames: 4, ms: 160, loop: true,  kind: 'star',    c1: '#fffbeb', c2: '#f5c451', c3: '#d97706' },
  { key: 'vfx16_grass_sway',    frames: 4, ms: 240, loop: true,  kind: 'grass',   c1: '#bbf7d0', c2: '#4ade80', c3: '#15803d' },
  { key: 'vfx16_torch_flame',   frames: 4, ms: 110, loop: true,  kind: 'flame',   c1: '#fef9c3', c2: '#fb923c', c3: '#dc2626' },
];

function drawMicro16Frame(spec, fIdx) {
  const b = new PixelBuffer(16, 16);
  const { kind, c1, c2, c3 } = spec;
  if (kind === 'spark') {
    const r = 2 + fIdx * 2;
    b.line(8 - r, 8, 8 + r, 8, c2);
    b.line(8, 8 - r, 8, 8 + r, c2);
    b.line(8 - Math.floor(r * 0.7), 8 - Math.floor(r * 0.7), 8 + Math.floor(r * 0.7), 8 + Math.floor(r * 0.7), c3);
    b.rect(7, 7, 2, 2, c1);
  } else if (kind === 'flame') {
    const sway = fIdx % 2 === 0 ? -1 : 1;
    b.circle(8, 10, 4, c3);
    b.circle(8 + sway, 8, 3, c2);
    b.rect(7, 7 - (fIdx % 2), 2, 4, c1);
  } else if (kind === 'ripple') {
    const r = 2 + fIdx * 1.5;
    b.ring(8, 8, Math.min(7, r + 1), Math.max(1, r - 1), c2, 210);
    if (fIdx < 2) b.rect(7, 7, 2, 2, c1);
  } else if (kind === 'slash') {
    const off = fIdx * 2;
    b.line(2 + off, 13 - off, 11 + Math.min(3, off), 3 + off, c3, 240, 2);
    b.line(3 + off, 12 - off, 11 + Math.min(2, off), 4 + off, c1, 255, 1);
  } else if (kind === 'plus') {
    const lift = fIdx;
    b.rect(7, 4 - Math.floor(lift / 2), 2, 8, c2);
    b.rect(4, 7 - Math.floor(lift / 2), 8, 2, c2);
    b.rect(7, 7 - Math.floor(lift / 2), 2, 2, c1);
    b.setPixel(3, 12 - lift, c3);
    b.setPixel(12, 11 - lift, c3);
  } else if (kind === 'crystal') {
    const s = fIdx % 2 === 0 ? 0 : 1;
    b.line(8, 2 + s, 12 - s, 8, c3, 255, 2);
    b.line(8, 2 + s, 4 + s, 8, c3, 255, 2);
    b.line(4 + s, 8, 8, 14 - s, c2, 255, 2);
    b.line(12 - s, 8, 8, 14 - s, c2, 255, 2);
    b.rect(7, 6, 2, 4, c1);
  } else if (kind === 'bolt') {
    const j = fIdx % 2 === 0 ? -1 : 1;
    b.line(9, 1, 5 + j, 7, c2, 255, 2);
    b.line(5 + j, 7, 10 - j, 8, c1, 255, 2);
    b.line(10 - j, 8, 6, 14, c3, 255, 2);
  } else if (kind === 'orb') {
    const r = 4 + (fIdx % 2);
    b.circle(8, 8, r, c3, 220);
    b.circle(8, 8, r - 1, c2, 240);
    b.rect(6, 6, 3, 3, c1);
  } else if (kind === 'rock') {
    const dy = fIdx * 2;
    b.outlineRect(4, Math.min(9, 3 + dy), 7, 6, c2, '#14111b');
    b.rect(5, Math.min(10, 4 + dy), 3, 2, c1);
  } else if (kind === 'star') {
    const r = fIdx % 2 === 0 ? 5 : 3;
    b.line(8 - r, 8, 8 + r, 8, c2);
    b.line(8, 8 - r, 8, 8 + r, c2);
    b.rect(7, 7, 2, 2, c1);
  } else if (kind === 'coin') {
    const widths = [8, 6, 2, 6];
    const w = widths[fIdx % 4];
    b.outlineRect(8 - Math.floor(w / 2), 3, w, 10, c2, '#14111b');
    if (w >= 4) b.rect(8 - Math.floor(w / 2) + 1, 5, Math.max(1, w - 3), 6, c1);
  } else if (kind === 'arrow') {
    b.line(2, 8, 13, 8, c2, 255, 2);
    b.rect(11, 6, 3, 5, c1);
    b.rect(1, 6 + (fIdx % 2), 3, 4, c3);
  } else if (kind === 'dust') {
    const r = 2 + fIdx;
    b.circle(8 - fIdx, 10 - Math.floor(fIdx / 2), Math.max(1, 4 - Math.floor(fIdx / 2)), c2, 200 - fIdx * 40);
    b.circle(10, 9, Math.max(1, 3 - Math.floor(fIdx / 2)), c1, 180 - fIdx * 35);
  } else if (kind === 'shield') {
    b.outlineRect(3, 2, 10, 11, c2, '#14111b');
    b.rect(5, 4, 6, 7, c1);
    b.rect(6, 5, 4, 5, c3);
  } else if (kind === 'heart') {
    const lift = Math.floor(fIdx / 2);
    b.rect(4, 5 - lift, 3, 3, c2);
    b.rect(9, 5 - lift, 3, 3, c2);
    b.rect(3, 7 - lift, 10, 3, c2);
    b.rect(5, 10 - lift, 6, 2, c3);
    b.rect(7, 12 - lift, 2, 2, c3);
    b.rect(5, 6 - lift, 2, 1, c1);
  } else if (kind === 'grass') {
    const lean = fIdx === 1 ? 1 : fIdx === 3 ? -1 : 0;
    b.line(4, 14, 3 + lean, 7, c3, 255, 1);
    b.line(8, 14, 8 + lean, 5, c2, 255, 2);
    b.line(12, 14, 13 + lean, 8, c3, 255, 1);
    b.setPixel(8 + lean, 5, c1);
  }
  return b;
}

function drawCrimsonCrescentFrame(fIdx) {
  const b = new PixelBuffer(64, 48);
  const shift = fIdx * 4;
  for (let y = 6; y < 42; y++) {
    const dy = (y - 24) / 18;
    const curveX = Math.round(34 + shift * 0.4 - dy * dy * 18);
    b.rect(curveX - 6, y, 8, 1, '#c8281e', 210);
    b.rect(curveX - 3, y, 6, 1, '#ff6b1a', 240);
    b.rect(curveX, y, 3, 1, '#fff4b8', 255);
  }
  b.rect(14 + fIdx * 6, 12 + (fIdx * 5) % 24, 2, 2, '#fff4b8');
  b.rect(20 + fIdx * 5, 34 - (fIdx * 4) % 20, 2, 2, '#ff6b1a');
  return b;
}

function drawSolarJudgmentFrame(fIdx) {
  const b = new PixelBuffer(64, 96);
  const pulse = fIdx % 2 === 0 ? 0 : 2;
  // Semi-transparent pillar (max alpha ~165 to ALWAYS protect Boss Telegraph readability!)
  b.rect(14 - pulse, 0, 36 + pulse * 2, 74, '#f59e0b', 90);
  b.rect(22, 0, 20, 74, '#ffe566', 145);
  b.rect(28, 0, 8, 74, '#ffffff', 165);
  b.ring(32, 70, 24, 21, '#ffe566', 190);
  b.ring(32, 70, 16, 14, '#ffffff', 170);
  b.rect(16 + (fIdx * 9) % 32, 64 - fIdx * 11, 2, 2, '#ffffff');
  b.rect(44 - (fIdx * 7) % 28, 58 - fIdx * 9, 2, 2, '#ffe566');
  return b;
}

function drawTempestArrowstormFrame(fIdx) {
  const b = new PixelBuffer(64, 64);
  b.ring(32, 40, 22, 20, '#7ce0c3', 170);
  for (let i = 0; i < 6; i++) {
    const ax = 12 + ((i * 11 + fIdx * 7) % 40);
    const ay = 4 + ((i * 13 + fIdx * 11) % 32);
    b.line(ax + 3, ay, ax, ay + 14, '#10b981', 220, 2);
    b.line(ax + 3, ay, ax, ay + 12, '#ecfeff', 255, 1);
  }
  return b;
}

function drawStormDominionFrame(fIdx) {
  const b = new PixelBuffer(64, 64);
  b.ring(32, 36, 26, 23, '#38bdf8', 170);
  b.ring(32, 36, 18, 16, '#fde047', 160);
  const j = fIdx % 2 === 0 ? -3 : 3;
  b.line(32, 4, 24 + j, 24, '#49d8ff', 240, 2);
  b.line(24 + j, 24, 38 - j, 34, '#ffffff', 255, 2);
  b.line(38 - j, 34, 28, 52, '#fde047', 230, 2);
  b.line(14, 16 + fIdx * 4, 20, 34, '#38bdf8', 190, 1);
  b.line(50, 14 + fIdx * 4, 44, 36, '#38bdf8', 190, 1);
  return b;
}

function drawAbyssalEclipseFrame(fIdx) {
  const b = new PixelBuffer(64, 64);
  const r = 18 + (fIdx % 2) * 3;
  b.circle(32, 32, r + 4, '#2e1065', 140);
  b.ring(32, 32, r + 4, r + 1, '#a855f7', 210);
  b.ring(32, 32, r - 2, r - 4, '#f3e8ff', 190);
  b.circle(32, 32, 7, '#0f0720', 220);
  b.rect(12 + fIdx * 9, 14 + fIdx * 6, 3, 3, '#e9d5ff');
  b.rect(48 - fIdx * 8, 46 - fIdx * 5, 3, 3, '#c084fc');
  return b;
}

function drawBastionQuakeFrame(fIdx) {
  const b = new PixelBuffer(64, 64);
  const r = 10 + fIdx * 6;
  b.ring(32, 34, Math.min(28, r), Math.max(4, r - 3), '#d97706', 215);
  b.ring(32, 34, Math.min(24, r - 2), Math.max(2, r - 4), '#fef08a', 200);
  for (let i = 0; i < 4; i++) {
    const ox = 16 + i * 10;
    const oy = 24 + ((i + fIdx) % 2) * 14;
    b.outlineRect(ox, oy, 6, 6, '#a16207', '#14111b');
  }
  return b;
}

function drawDragonheartAuraFrame(fIdx) {
  const b = new PixelBuffer(64, 64);
  const pulse = (fIdx % 2) * 2;
  b.ring(32, 42, 22 + pulse, 19 + pulse, '#ff6b1a', 195);
  b.ring(32, 42, 16, 14, '#fff4b8', 180);
  b.line(18, 46, 14, 18 - pulse, '#c8281e', 180, 2);
  b.line(46, 46, 50, 18 - pulse, '#c8281e', 180, 2);
  b.line(32, 48, 32, 10 - pulse, '#ff6b1a', 165, 3);
  return b;
}

function drawTelegraphCircleFrame(fIdx) {
  const b = new PixelBuffer(96, 96);
  const ratio = (fIdx + 1) / 4;
  // Base fill alpha 0.25 (#FF3B3B)
  b.circle(48, 48, 44, '#ff3b3b', 64);
  // Animated fill sweep timer ring
  b.circle(48, 48, Math.round(44 * ratio), '#ff3b3b', 80);
  // Crisp outer dashed border + dark rim
  b.ring(48, 48, 46, 45, '#450a0a', 230);
  b.ring(48, 48, 45, 43, '#ff3b3b', 255);
  return b;
}

export function generateAllVfxPngs(assetsV1Dir) {
  const entries = [];
  const clips = [];

  // 1. 16x16 Animated Micro VFX Atlas (Q1-A)
  const microFrames = [];
  for (const spec of MICRO_16_ANIMS) {
    for (let f = 0; f < spec.frames; f++) {
      microFrames.push({
        name: `${spec.key}_${f}`,
        buf: drawMicro16Frame(spec, f),
        pivot: { x: 0.5, y: 0.5 },
      });
    }
    const durations = Array.from({ length: spec.frames }, () => spec.ms);
    const totalMs = durations.reduce((a, b) => a + b, 0);
    clips.push({
      clipKey: `${spec.key}_down`,
      entityId: spec.key,
      state: 'skill',
      direction: 'down',
      atlasKey: 'atlas_vfx_16x16',
      frameCount: spec.frames,
      frameDurationMs: durations,
      loop: spec.loop,
      priority: 1,
      pivotNorm: { x: 0.5, y: 0.5 },
      hitFrameIndex: null,
      cancelWindowStartFrame: null,
      watchdogMaxDurationMs: spec.loop ? 0 : totalMs + 150,
      fallbackState: 'idle',
    });
  }

  const microPacked = packPhaserAtlas({
    frames: microFrames,
    imageFileName: 'vfx_16x16_animations.png',
    paddingPx: 2,
    extrudePx: 0,
    maxDim: 2048,
  });
  const mPngRel = 'atlases/vfx/vfx_16x16_animations.png';
  const mJsonRel = 'atlases/vfx/vfx_16x16_animations.json';
  const mPngMeta = writeFileWithMeta(path.join(assetsV1Dir, mPngRel), microPacked.pngBuf);
  const mJsonMeta = writeFileWithMeta(path.join(assetsV1Dir, mJsonRel), microPacked.jsonBuf);

  entries.push(
    {
      assetKey: 'atlas_vfx_16x16',
      objectKey: `v1/${mPngRel}`,
      kind: 'ATLAS_PNG',
      loadingGroup: 'core_ui',
      sha256: mPngMeta.sha256,
      sizeBytes: mPngMeta.sizeBytes,
    },
    {
      assetKey: 'atlas_vfx_16x16_json',
      objectKey: `v1/${mJsonRel}`,
      kind: 'ATLAS_JSON',
      loadingGroup: 'core_ui',
      sha256: mJsonMeta.sha256,
      sizeBytes: mJsonMeta.sizeBytes,
    },
  );

  // 2. Iconic Skill / Ultimate VFX & Boss Telegraph Atlas (7 Skills + Boss Telegraph)
  const skillFrames = [];
  for (let f = 0; f < 4; f++) {
    skillFrames.push({ name: `vfx_kael_crimson_crescent_wave_${f}`, buf: drawCrimsonCrescentFrame(f), pivot: { x: 0.5, y: 0.5 } });
    skillFrames.push({ name: `vfx_seraphina_solar_judgment_pillar_${f}`, buf: drawSolarJudgmentFrame(f), pivot: { x: 0.5, y: 0.88 } });
    skillFrames.push({ name: `vfx_lyra_tempest_arrowstorm_zone_${f}`, buf: drawTempestArrowstormFrame(f), pivot: { x: 0.5, y: 0.75 } });
    skillFrames.push({ name: `vfx_orin_storm_dominion_dome_${f}`, buf: drawStormDominionFrame(f), pivot: { x: 0.5, y: 0.6 } });
    skillFrames.push({ name: `vfx_vex_abyssal_eclipse_vortex_${f}`, buf: drawAbyssalEclipseFrame(f), pivot: { x: 0.5, y: 0.5 } });
    skillFrames.push({ name: `vfx_bram_bastion_quake_ring_${f}`, buf: drawBastionQuakeFrame(f), pivot: { x: 0.5, y: 0.55 } });
    skillFrames.push({ name: `vfx_kael_dragonheart_aura_${f}`, buf: drawDragonheartAuraFrame(f), pivot: { x: 0.5, y: 0.75 } });
    skillFrames.push({ name: `vfx_boss_telegraph_circle_${f}`, buf: drawTelegraphCircleFrame(f), pivot: { x: 0.5, y: 0.5 } });
  }

  const skillPacked = packPhaserAtlas({
    frames: skillFrames,
    imageFileName: 'vfx_skills_mvp.png',
    paddingPx: 2,
    extrudePx: 0,
    maxDim: 2048,
  });
  const sPngRel = 'atlases/vfx/vfx_skills_mvp.png';
  const sJsonRel = 'atlases/vfx/vfx_skills_mvp.json';
  const sPngMeta = writeFileWithMeta(path.join(assetsV1Dir, sPngRel), skillPacked.pngBuf);
  const sJsonMeta = writeFileWithMeta(path.join(assetsV1Dir, sJsonRel), skillPacked.jsonBuf);

  entries.push(
    {
      assetKey: 'atlas_vfx_skills_mvp',
      objectKey: `v1/${sPngRel}`,
      kind: 'ATLAS_PNG',
      loadingGroup: 'core_ui',
      sha256: sPngMeta.sha256,
      sizeBytes: sPngMeta.sizeBytes,
    },
    {
      assetKey: 'atlas_vfx_skills_mvp_json',
      objectKey: `v1/${sJsonRel}`,
      kind: 'ATLAS_JSON',
      loadingGroup: 'core_ui',
      sha256: sJsonMeta.sha256,
      sizeBytes: sJsonMeta.sizeBytes,
    },
  );

  return { entries, clips };
}
