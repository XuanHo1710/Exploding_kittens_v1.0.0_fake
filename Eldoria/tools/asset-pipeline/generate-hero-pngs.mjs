/**
 * Offline Deterministic 4-Direction (Front/Down, Back/Up, Left, Right) 48x64 Hero PNG Sprite-Sheet Generator
 * Generates all 3 MVP Heroes (chr_kael_vanguard, chr_lyra_windrunner, chr_seraphina_dawn)
 * covering ALL 25 canonical humanoid states x 4 directions + 128x128 pixel portraits.
 * Enforces data-model.md AnimationClipDefinition.* constraints (pivotNorm: { x: 0.5, y: 0.875 }, padding: 2px, POT <= 2048).
 */
import path from 'node:path';
import { PixelBuffer, packPhaserAtlas, writeFileWithMeta } from './png-encoder.mjs';

const HERO_SPECS = [
  {
    id: 'chr_kael_vanguard',
    atlasKey: 'atlas_chr_kael_vanguard',
    portraitKey: 'portrait_chr_kael_vanguard',
    weaponKind: 'sword',
    pal: {
      outline: '#14111b',
      skin: '#f4c7a1',
      skinShade: '#d99e77',
      hair: '#4a2511',
      hairHi: '#784421',
      cloak: '#c8281e',
      cloakDark: '#7a1612',
      cloakHi: '#ff6b1a',
      armor: '#94a3b8',
      armorDark: '#475569',
      armorHi: '#e2e8f0',
      weapon: '#e2e8f0',
      weaponEdge: '#ff6b1a',
      fx: '#ff6b1a',
      fxCore: '#fff4b8',
    },
  },
  {
    id: 'chr_lyra_windrunner',
    atlasKey: 'atlas_chr_lyra_windrunner',
    portraitKey: 'portrait_chr_lyra_windrunner',
    weaponKind: 'bow',
    pal: {
      outline: '#14111b',
      skin: '#f7d3b5',
      skinShade: '#daa680',
      hair: '#eab308',
      hairHi: '#fef08a',
      cloak: '#15803d',
      cloakDark: '#0f4d26',
      cloakHi: '#4ade80',
      armor: '#6b4f3a',
      armorDark: '#3e2b1f',
      armorHi: '#a47e5c',
      weapon: '#a16207',
      weaponEdge: '#7ce0c3',
      fx: '#7ce0c3',
      fxCore: '#ecfeff',
    },
  },
  {
    id: 'chr_seraphina_dawn',
    atlasKey: 'atlas_chr_seraphina_dawn',
    portraitKey: 'portrait_chr_seraphina_dawn',
    weaponKind: 'staff',
    pal: {
      outline: '#14111b',
      skin: '#fbe0c8',
      skinShade: '#deb494',
      hair: '#f4d35e',
      hairHi: '#fff7cc',
      cloak: '#f1f5f9',
      cloakDark: '#cbd5e1',
      cloakHi: '#fde68a',
      armor: '#f59e0b',
      armorDark: '#92400e',
      armorHi: '#fef08a',
      weapon: '#f59e0b',
      weaponEdge: '#ffe566',
      fx: '#ffe566',
      fxCore: '#ffffff',
    },
  },
  {
    id: 'chr_bram_bastion',
    atlasKey: 'atlas_chr_bram_bastion',
    portraitKey: 'portrait_chr_bram_bastion',
    weaponKind: 'shield_sword',
    pal: {
      outline: '#14111b',
      skin: '#e8b994',
      skinShade: '#c48f68',
      hair: '#64748b',
      hairHi: '#cbd5e1',
      cloak: '#b45309',
      cloakDark: '#78350f',
      cloakHi: '#f59e0b',
      armor: '#cbd5e1',
      armorDark: '#475569',
      armorHi: '#f8fafc',
      weapon: '#e2e8f0',
      weaponEdge: '#f59e0b',
      fx: '#d97706',
      fxCore: '#fef08a',
    },
  },
  {
    id: 'chr_vex_nightblade',
    atlasKey: 'atlas_chr_vex_nightblade',
    portraitKey: 'portrait_chr_vex_nightblade',
    weaponKind: 'daggers',
    pal: {
      outline: '#14111b',
      skin: '#f0cbb1',
      skinShade: '#caa082',
      hair: '#312e81',
      hairHi: '#818cf8',
      cloak: '#4c1d95',
      cloakDark: '#2e1065',
      cloakHi: '#a855f7',
      armor: '#1e1b4b',
      armorDark: '#0f172a',
      armorHi: '#6366f1',
      weapon: '#c4b5fd',
      weaponEdge: '#a855f7',
      fx: '#9d5cff',
      fxCore: '#f3e8ff',
    },
  },
  {
    id: 'chr_orin_stormcaller',
    atlasKey: 'atlas_chr_orin_stormcaller',
    portraitKey: 'portrait_chr_orin_stormcaller',
    weaponKind: 'staff',
    pal: {
      outline: '#14111b',
      skin: '#f2c8a7',
      skinShade: '#d19e7a',
      hair: '#e2e8f0',
      hairHi: '#ffffff',
      cloak: '#0369a1',
      cloakDark: '#0c4a6e',
      cloakHi: '#38bdf8',
      armor: '#1e3a8a',
      armorDark: '#172554',
      armorHi: '#60a5fa',
      weapon: '#38bdf8',
      weaponEdge: '#fde047',
      fx: '#49d8ff',
      fxCore: '#ffffff',
    },
  },
];

// Additional 6 roadmap hero portraits (128x128) so all 12/12 Heroes in SCR-10 have unique pixel portraits!
const EXTRA_PORTRAIT_HEROES = [
  { id: 'chr_mira_ironfist',    pal: { outline: '#14111b', skin: '#f1c29b', skinShade: '#cc946c', hair: '#9a3412', hairHi: '#ea580c', cloak: '#7c2d12', armor: '#d97706' } },
  { id: 'chr_rowan_tidewarden', pal: { outline: '#14111b', skin: '#edd0b6', skinShade: '#c69e7e', hair: '#0f766e', hairHi: '#2dd4bf', cloak: '#115e59', armor: '#0ea5e9' } },
  { id: 'chr_freya_frostveil',  pal: { outline: '#14111b', skin: '#fce4d6', skinShade: '#dfb59d', hair: '#bae6fd', hairHi: '#f0f9ff', cloak: '#1d4ed8', armor: '#93c5fd' } },
  { id: 'chr_torvald_rageborn', pal: { outline: '#14111b', skin: '#e6b28a', skinShade: '#b87f58', hair: '#b91c1c', hairHi: '#f97316', cloak: '#7f1d1d', armor: '#57534e' } },
  { id: 'chr_nyx_voidcaller',   pal: { outline: '#14111b', skin: '#e5d4ed', skinShade: '#b8a0c7', hair: '#1e1b4b', hairHi: '#c084fc', cloak: '#3b0764', armor: '#7e22ce' } },
  { id: 'chr_aurelia_starbow',  pal: { outline: '#14111b', skin: '#fae0c8', skinShade: '#d9b18e', hair: '#fde047', hairHi: '#fef9c3', cloak: '#be185d', armor: '#f59e0b' } },
];

// All 25 canonical humanoid states with frame specs & HFSM priorities matching animation-state-machine.md
export const HERO_STATE_CONFIGS = [
  { state: 'idle',        frames: 4, ms: 200, loop: true,  priority: 1,  hitFrame: null, cancelFrame: null, pose: 'idle' },
  { state: 'walk',        frames: 4, ms: 120, loop: true,  priority: 2,  hitFrame: null, cancelFrame: null, pose: 'walk' },
  { state: 'run',         frames: 4, ms: 85,  loop: true,  priority: 2,  hitFrame: null, cancelFrame: null, pose: 'run' },
  { state: 'sprint',      frames: 4, ms: 65,  loop: true,  priority: 2,  hitFrame: null, cancelFrame: null, pose: 'run' },
  { state: 'attack',      frames: 4, ms: 75,  loop: false, priority: 6,  hitFrame: 2,    cancelFrame: 3,    pose: 'attack' },
  { state: 'attack_combo',frames: 6, ms: 70,  loop: false, priority: 6,  hitFrame: 2,    cancelFrame: 4,    pose: 'combo' },
  { state: 'cast',        frames: 4, ms: 90,  loop: false, priority: 7,  hitFrame: 2,    cancelFrame: 3,    pose: 'cast' },
  { state: 'skill',       frames: 5, ms: 80,  loop: false, priority: 7,  hitFrame: 2,    cancelFrame: 4,    pose: 'skill' },
  { state: 'ultimate',    frames: 6, ms: 90,  loop: false, priority: 8,  hitFrame: 3,    cancelFrame: 5,    pose: 'ultimate' },
  { state: 'dodge',       frames: 4, ms: 70,  loop: false, priority: 9,  hitFrame: null, cancelFrame: 3,    pose: 'dodge' },
  { state: 'dash',        frames: 4, ms: 65,  loop: false, priority: 9,  hitFrame: null, cancelFrame: 3,    pose: 'dodge' },
  { state: 'hit',         frames: 3, ms: 65,  loop: false, priority: 10, hitFrame: null, cancelFrame: 2,    pose: 'hit' },
  { state: 'knockback',   frames: 3, ms: 90,  loop: false, priority: 10, hitFrame: null, cancelFrame: null, pose: 'hit' },
  { state: 'stun',        frames: 2, ms: 200, loop: true,  priority: 10, hitFrame: null, cancelFrame: null, pose: 'stun' },
  { state: 'block',       frames: 2, ms: 220, loop: true,  priority: 5,  hitFrame: null, cancelFrame: 1,    pose: 'block' },
  { state: 'death',       frames: 4, ms: 130, loop: false, priority: 11, hitFrame: null, cancelFrame: null, pose: 'death' },
  { state: 'respawn',     frames: 4, ms: 110, loop: false, priority: 11, hitFrame: null, cancelFrame: null, pose: 'respawn' },
  { state: 'mining',      frames: 4, ms: 115, loop: true,  priority: 4,  hitFrame: 2,    cancelFrame: 3,    pose: 'mining' },
  { state: 'woodcutting', frames: 4, ms: 115, loop: true,  priority: 4,  hitFrame: 2,    cancelFrame: 3,    pose: 'woodcutting' },
  { state: 'farming',     frames: 4, ms: 130, loop: true,  priority: 4,  hitFrame: 2,    cancelFrame: 3,    pose: 'farming' },
  { state: 'fishing',     frames: 4, ms: 160, loop: true,  priority: 4,  hitFrame: null, cancelFrame: 1,    pose: 'fishing' },
  { state: 'crafting',    frames: 3, ms: 130, loop: false, priority: 4,  hitFrame: null, cancelFrame: 2,    pose: 'mining' },
  { state: 'building',    frames: 3, ms: 130, loop: false, priority: 4,  hitFrame: null, cancelFrame: 2,    pose: 'mining' },
  { state: 'interact',    frames: 2, ms: 120, loop: false, priority: 3,  hitFrame: null, cancelFrame: 1,    pose: 'cast' },
  { state: 'emote',       frames: 4, ms: 150, loop: false, priority: 3,  hitFrame: null, cancelFrame: 1,    pose: 'emote' },
];

const DIRS = ['down', 'up', 'left', 'right'];

function drawHeroFrame(hero, pose, dir, fIdx, totalF) {
  const buf = new PixelBuffer(48, 64);
  const p = hero.pal;
  const t = fIdx / Math.max(1, totalF);
  const hitFlash = pose === 'hit' && fIdx < 2;
  const col = (hex) => (hitFlash ? '#ffffff' : hex);

  // Ground shadow anchored near footY = 56 (0.875 * 64)
  buf.ellipse(24, 56, 10, 3, '#141024', 120);

  if (pose === 'death' && fIdx >= 3) {
    // Fallen character cleanly resting on ground
    buf.outlineRect(9, 48, 28, 9, col(p.cloak), p.outline);
    buf.outlineRect(12, 46, 9, 8, col(p.skin), p.outline);
    buf.rect(13, 47, 7, 3, col(p.hair));
    buf.rect(24, 50, 10, 4, col(p.armorDark));
    return buf;
  }

  const bob =
    pose === 'idle' ? (fIdx % 2 === 0 ? 0 : -1) :
    pose === 'walk' || pose === 'run' ? (fIdx % 2 === 1 ? -2 : 0) :
    pose === 'dodge' ? Math.round(Math.sin(t * Math.PI) * -6) :
    pose === 'emote' ? (fIdx % 2 === 1 ? -4 : 0) :
    pose === 'death' ? fIdx * 5 : 0;

  const lungeX =
    (pose === 'attack' || pose === 'combo' || pose === 'skill') && fIdx >= 1 && fIdx <= 3
      ? (dir === 'left' ? -3 : dir === 'right' ? 3 : 0)
      : 0;
  const lungeY =
    (pose === 'attack' || pose === 'combo' || pose === 'skill') && fIdx >= 1 && fIdx <= 3
      ? (dir === 'up' ? -2 : dir === 'down' ? 2 : 0)
      : 0;

  const bx = 16 + lungeX;
  const by = 17 + bob + lungeY;
  const legSwing =
    pose === 'walk' || pose === 'run'
      ? Math.round(Math.sin(t * Math.PI * 2) * (pose === 'run' ? 4 : 2))
      : 0;

  // Respawn golden pillar aura behind
  if (pose === 'respawn') {
    buf.rect(14, 6, 20, 50, p.fx, 90);
    buf.rect(19, 8, 10, 46, p.fxCore, 150);
  }

  // Cloak / Cape (drawn behind when facing down/left/right)
  if (dir !== 'up') {
    const capeSway = (pose === 'run' || pose === 'dodge') ? (fIdx % 2 === 0 ? -1 : 1) : 0;
    buf.outlineRect(bx - 2 + capeSway, by + 13, 20, 18, col(p.cloak), p.outline);
    buf.rect(bx + capeSway, by + 15, 5, 13, col(p.cloakHi));
    buf.rect(bx + 12 + capeSway, by + 15, 4, 13, col(p.cloakDark));
  }

  // Boots & Legs
  buf.outlineRect(bx + 2, by + 27 + Math.max(0, legSwing), 5, 11, col(p.armorDark), p.outline);
  buf.outlineRect(bx + 9, by + 27 + Math.max(0, -legSwing), 5, 11, col(p.armorDark), p.outline);
  buf.rect(bx + 3, by + 34 + Math.max(0, legSwing), 3, 3, col(p.cloakDark));
  buf.rect(bx + 10, by + 34 + Math.max(0, -legSwing), 3, 3, col(p.cloakDark));

  // Torso Armor + Pauldrons
  buf.outlineRect(bx + 1, by + 13, 14, 15, col(p.armor), p.outline);
  buf.rect(bx + 2, by + 14, 5, 12, col(p.armorHi));
  buf.rect(bx + 10, by + 14, 4, 12, col(p.armorDark));
  buf.rect(bx + 3, by + 22, 10, 2, col(p.cloakHi)); // belt sash
  // Shoulders
  buf.outlineRect(bx - 1, by + 13, 5, 6, col(p.armorHi), p.outline);
  buf.outlineRect(bx + 12, by + 13, 5, 6, col(p.armor), p.outline);

  // Back cloak layer when facing UP
  if (dir === 'up') {
    buf.outlineRect(bx, by + 14, 16, 17, col(p.cloak), p.outline);
    buf.rect(bx + 2, by + 15, 12, 4, col(p.cloakHi));
    buf.rect(bx + 10, by + 19, 4, 10, col(p.cloakDark));
  }

  // Head + Hair + Expressive Directional Face
  buf.outlineRect(bx + 1, by, 14, 13, col(p.skin), p.outline);
  buf.rect(bx + 2, by + 9, 12, 3, col(p.skinShade));
  // Hair crown
  buf.rect(bx + 2, by + 1, 12, 4, col(p.hair));
  buf.rect(bx + 3, by + 1, 7, 2, col(p.hairHi));
  if (dir === 'up') {
    buf.rect(bx + 2, by + 1, 12, 11, col(p.hair));
    buf.rect(bx + 4, by + 2, 6, 4, col(p.hairHi));
  } else if (dir === 'down') {
    buf.rect(bx + 4, by + 7, 2, 2, p.outline);
    buf.rect(bx + 10, by + 7, 2, 2, p.outline);
    buf.setPixel(bx + 4, by + 7, '#ffffff');
    buf.setPixel(bx + 10, by + 7, '#ffffff');
  } else if (dir === 'left') {
    buf.rect(bx + 3, by + 7, 2, 2, p.outline);
    buf.setPixel(bx + 3, by + 7, '#ffffff');
    buf.rect(bx + 8, by + 2, 6, 9, col(p.hair));
  } else if (dir === 'right') {
    buf.rect(bx + 11, by + 7, 2, 2, p.outline);
    buf.setPixel(bx + 11, by + 7, '#ffffff');
    buf.rect(bx + 2, by + 2, 6, 9, col(p.hair));
  }

  // Stun stars above head
  if (pose === 'stun') {
    const sx = fIdx % 2 === 0 ? 17 : 25;
    buf.rect(sx, by - 6, 3, 3, '#fde047');
    buf.rect(42 - sx, by - 4, 2, 2, '#ffffff');
  }

  // Weapon, Combat Slash, Skill, Ultimate, Block & Life-Sim Tools
  const flip = dir === 'left' ? -1 : 1;
  const wx = dir === 'left' ? bx - 5 : bx + 15;
  const wy = by + 16;

  if (pose === 'attack' || pose === 'combo') {
    const step = fIdx % 3;
    const active = fIdx >= 1 && fIdx <= totalF - 2;
    if (hero.weaponKind === 'sword') {
      buf.line(wx, wy, wx + flip * 10, wy - 7 + step * 7, col(p.weapon), 255, 2);
      buf.line(wx + flip * 2, wy, wx + flip * 10, wy - 7 + step * 7, col(p.weaponEdge), 255, 1);
    } else if (hero.weaponKind === 'bow') {
      buf.line(wx + flip * 3, wy - 7, wx + flip * 3, wy + 7, col(p.weapon), 255, 2);
      buf.line(wx + flip * 3, wy, wx + flip * 12, wy, p.fxCore, 255, 1);
    } else {
      buf.line(wx, wy + 5, wx + flip * 6, wy - 9, col(p.weapon), 255, 2);
      buf.circle(wx + flip * 6, wy - 9, 3, p.fxCore);
    }
    if (active) {
      const arcX = dir === 'left' ? 4 : dir === 'right' ? 30 : 12;
      const arcY = dir === 'up' ? 8 : dir === 'down' ? 38 : 22 + step * 4;
      buf.rect(arcX, arcY, 14, 3, p.fx, 220);
      buf.rect(arcX + 2, arcY + 1, 10, 1, p.fxCore, 255);
    }
  } else if (pose === 'cast' || pose === 'skill') {
    buf.ring(24, 54, 12, 10, p.fx, 180);
    buf.circle(wx + flip * 4, wy - 6, 4 + (fIdx % 2), p.fx, 200);
    buf.circle(wx + flip * 4, wy - 6, 2, p.fxCore, 255);
  } else if (pose === 'ultimate') {
    // Dramatic iconic aura + directional burst within 48x64 without muddying silhouette
    buf.ring(24, 54, 15, 13, p.fx, 200);
    buf.ring(24, 54, 13, 12, p.fxCore, 220);
    if (fIdx >= 2 && fIdx <= 5) {
      const waveX = Math.max(4, Math.min(38, 24 + flip * (fIdx - 1) * 4));
      buf.rect(waveX - 3, 12, 7, 36, p.fx, 210);
      buf.rect(waveX - 1, 14, 3, 32, p.fxCore, 255);
      buf.rect(6 + (fIdx * 7) % 34, 10 + (fIdx * 5) % 30, 2, 2, p.fxCore);
      buf.rect(38 - (fIdx * 6) % 30, 16 + (fIdx * 4) % 28, 2, 2, p.fx);
    }
  } else if (pose === 'block') {
    const sx = dir === 'left' ? bx - 4 : bx + 13;
    buf.outlineRect(sx, by + 12, 7, 16, '#38bdf8', p.outline);
    buf.rect(sx + 2, by + 14, 3, 12, '#e0f2fe');
  } else if (pose === 'mining' || pose === 'woodcutting') {
    const swingY = fIdx < 2 ? -9 : 5;
    buf.line(wx, wy, wx + flip * 6, wy + swingY, '#8b5a2b', 255, 2);
    buf.rect(wx + flip * 4 - 3, wy + swingY - 2, 7, 3, pose === 'mining' ? '#cbd5e1' : '#94a3b8');
    if (fIdx === 2) {
      buf.rect(wx + flip * 8, wy + 9, 2, 2, '#fde047');
      buf.rect(wx + flip * 10, wy + 6, 2, 2, '#ffffff');
    }
  } else if (pose === 'farming') {
    const tilt = fIdx % 2 === 0 ? 0 : 4;
    buf.outlineRect(wx - 2, wy + tilt, 8, 6, '#38bdf8', p.outline);
    if (fIdx >= 2) {
      buf.rect(wx + flip * 6, wy + 12, 2, 3, '#60a5fa');
      buf.rect(wx + flip * 8, wy + 16, 2, 3, '#93c5fd');
    }
  } else if (pose === 'fishing') {
    buf.line(wx, wy - 2, wx + flip * 12, wy - 7, '#92400e', 255, 1);
    const bobY = wy + 14 + (fIdx % 2) * 3;
    buf.line(wx + flip * 12, wy - 7, wx + flip * 12, bobY, '#e2e8f0', 220, 1);
    buf.rect(wx + flip * 11, bobY, 3, 3, '#ff3b3b');
  } else if (pose === 'emote') {
    buf.rect(21, by - 9, 6, 5, '#ff4d6d');
    buf.rect(22, by - 8, 4, 3, '#ffd6e0');
  } else {
    // Default held signature weapon
    if (hero.weaponKind === 'sword' || hero.weaponKind === 'shield_sword') {
      buf.outlineRect(wx - 1, wy - 10, 4, 16, col(p.weapon), p.outline);
      buf.rect(wx, wy - 9, 1, 13, col(p.weaponEdge));
      if (hero.weaponKind === 'shield_sword') {
        const shx = dir === 'left' ? bx + 12 : bx - 4;
        buf.outlineRect(shx, wy - 4, 7, 12, col(p.armorHi), p.outline);
        buf.rect(shx + 2, wy - 2, 3, 8, col(p.cloakHi));
      }
    } else if (hero.weaponKind === 'daggers') {
      buf.outlineRect(bx - 4, wy - 4, 3, 10, col(p.weapon), p.outline);
      buf.outlineRect(bx + 16, wy - 4, 3, 10, col(p.weapon), p.outline);
      buf.rect(bx - 3, wy - 3, 1, 8, col(p.weaponEdge));
      buf.rect(bx + 17, wy - 3, 1, 8, col(p.weaponEdge));
    } else if (hero.weaponKind === 'bow') {
      buf.line(wx + flip * 2, wy - 9, wx + flip * 2, wy + 7, col(p.weapon), 255, 2);
      buf.line(wx, wy - 8, wx, wy + 6, '#e2e8f0', 180, 1);
    } else {
      buf.outlineRect(wx - 1, wy - 11, 4, 18, col(p.weapon), p.outline);
      buf.circle(wx + 1, wy - 11, 3, p.fxCore);
    }
  }

  return buf;
}

function drawPortrait128(hero) {
  const small = new PixelBuffer(32, 32);
  const p = hero.pal;
  small.rect(0, 0, 32, 32, '#1a1f33');
  small.outlineRect(1, 1, 30, 30, '#262d47', '#f5c451');
  small.outlineRect(5, 20, 22, 11, p.cloak, p.outline);
  small.outlineRect(9, 21, 14, 10, p.armor, p.outline);
  small.outlineRect(9, 6, 14, 14, p.skin, p.outline);
  small.rect(10, 7, 12, 5, p.hair);
  small.rect(11, 7, 6, 2, p.hairHi);
  small.rect(12, 13, 2, 2, p.outline);
  small.rect(18, 13, 2, 2, p.outline);
  small.setPixel(12, 13, '#ffffff');
  small.setPixel(18, 13, '#ffffff');
  small.rect(14, 17, 4, 1, p.skinShade);

  // Clean 4x integer nearest-neighbor scale to 128x128
  const big = new PixelBuffer(128, 128);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const px = small.getPixel(x, y);
      big.rect(x * 4, y * 4, 4, 4, px);
    }
  }
  return big.toPngBuffer();
}

export function generateAllHeroPngs(assetsV1Dir) {
  const entries = [];
  const clips = [];

  for (const hero of HERO_SPECS) {
    const frames = [];
    for (const cfg of HERO_STATE_CONFIGS) {
      for (const dir of DIRS) {
        const clipKey = `${hero.id}_${cfg.state}_${dir}`;
        for (let f = 0; f < cfg.frames; f++) {
          const buf = drawHeroFrame(hero, cfg.pose, dir, f, cfg.frames);
          frames.push({
            name: `${clipKey}_${f}`,
            buf,
            pivot: { x: 0.5, y: 0.875 },
          });
        }
        const durations = Array.from({ length: cfg.frames }, () => cfg.ms);
        const totalMs = durations.reduce((a, b) => a + b, 0);
        clips.push({
          clipKey,
          entityId: hero.id,
          state: cfg.state,
          direction: dir,
          atlasKey: hero.atlasKey,
          frameCount: cfg.frames,
          frameDurationMs: durations,
          loop: cfg.loop,
          priority: cfg.priority,
          pivotNorm: { x: 0.5, y: 0.875 },
          hitFrameIndex: cfg.hitFrame,
          cancelWindowStartFrame: cfg.cancelFrame,
          watchdogMaxDurationMs: cfg.loop ? 0 : totalMs + 150,
          fallbackState: 'idle',
        });
      }
    }

    const imageFileName = `${hero.id}.png`;
    const packed = packPhaserAtlas({
      frames,
      imageFileName,
      paddingPx: 2,
      extrudePx: 0,
      maxDim: 2048,
    });

    const pngRel = `atlases/heroes/${hero.id}.png`;
    const jsonRel = `atlases/heroes/${hero.id}.json`;
    const pngMeta = writeFileWithMeta(path.join(assetsV1Dir, pngRel), packed.pngBuf);
    const jsonMeta = writeFileWithMeta(path.join(assetsV1Dir, jsonRel), packed.jsonBuf);

    entries.push(
      {
        assetKey: hero.atlasKey,
        objectKey: `v1/${pngRel}`,
        kind: 'ATLAS_PNG',
        loadingGroup: 'hero_on_demand',
        sha256: pngMeta.sha256,
        sizeBytes: pngMeta.sizeBytes,
      },
      {
        assetKey: `${hero.atlasKey}_json`,
        objectKey: `v1/${jsonRel}`,
        kind: 'ATLAS_JSON',
        loadingGroup: 'hero_on_demand',
        sha256: jsonMeta.sha256,
        sizeBytes: jsonMeta.sizeBytes,
      },
    );

    // 128x128 Portrait PNG
    const portRel = `ui/portraits/${hero.id}.png`;
    const portMeta = writeFileWithMeta(path.join(assetsV1Dir, portRel), drawPortrait128(hero));
    entries.push({
      assetKey: hero.portraitKey,
      objectKey: `v1/${portRel}`,
      kind: 'ATLAS_PNG',
      loadingGroup: 'core_ui',
      sha256: portMeta.sha256,
      sizeBytes: portMeta.sizeBytes,
    });
  }

  // Generate unique 128x128 pixel portraits for the remaining 6 catalog heroes (12/12 portraits!)
  for (const extra of EXTRA_PORTRAIT_HEROES) {
    const portRel = `ui/portraits/${extra.id}.png`;
    const portMeta = writeFileWithMeta(path.join(assetsV1Dir, portRel), drawPortrait128(extra));
    entries.push({
      assetKey: `portrait_${extra.id}`,
      objectKey: `v1/${portRel}`,
      kind: 'ATLAS_PNG',
      loadingGroup: 'core_ui',
      sha256: portMeta.sha256,
      sizeBytes: portMeta.sizeBytes,
    });
  }

  return { entries, clips };
}
