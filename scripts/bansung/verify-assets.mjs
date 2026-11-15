#!/usr/bin/env node
/**
 * Independent verification harness for `database-ban-sung/` assets, manifest,
 * animation metadata, license coverage, and runtime fallbacks.
 *
 * Designed for zero-dependency Node 22+ execution on Windows/Linux/macOS.
 * Exports `verifyBansungAssets(options)` for programmatic/test use and runs as
 * a CLI audit when invoked directly (`exit 0` on clean pass, `exit 1` otherwise).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  inspectPngHeader,
  decodePng,
  parseWav,
  detectMagicFormat,
  sha256Hex,
} from './lib-pack.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../..');

export const VALID_ID_RE = /^[a-z][a-z0-9_]{2,63}$/;
export const VALID_CATEGORIES = new Set([
  'hero',
  'weapon',
  'pet',
  'enemy',
  'boss',
  'projectile',
  'vfx',
  'prop',
  'tile',
  'ui',
]);
export const VALID_FALLBACK_SHAPES = new Set(['rect', 'circle', 'capsule', 'cone']);
export const ALLOWED_LICENSES = new Set([
  'CC0-1.0',
  'MIT',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'INTERNAL-MIRAGINE',
  'GENERATED-SYNTH',
]);
export const FORBIDDEN_LICENSE_RE =
  /\b(?:GPL|AGPL|LGPL|NC|ND|CC-BY-NC|CC-BY-ND|CC-BY-SA|PROPRIETARY|ALL-RIGHTS-RESERVED)\b/i;
export const REQUIRED_LICENSE_SECTIONS = [
  '## Source Packs',
  '## Asset Provenance',
  '## Required Attributions',
];

const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/i;
const AUDIO_EXTENSIONS = new Set(['.wav', '.ogg', '.mp3']);
const ALLOWED_DB_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.wav', '.ogg', '.mp3', '.json', '.md']);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  out.sort();
  return out;
}

function isSafeRelPath(rel) {
  if (typeof rel !== 'string' || rel.length === 0) return false;
  if (rel.includes('\0') || rel.includes('\\')) return false;
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return false;
  const parts = rel.split('/');
  return !parts.some((seg) => seg === '' || seg === '.' || seg === '..');
}

function resolveContained(rootDir, rel) {
  if (!isSafeRelPath(rel)) return null;
  const rootAbs = path.resolve(rootDir);
  const full = path.resolve(rootAbs, rel);
  const relBack = path.relative(rootAbs, full);
  if (relBack === '' || relBack.startsWith('..') || path.isAbsolute(relBack)) {
    return null;
  }
  return full;
}

/**
 * Extracts `CANONICAL_DEFS`, `SFX_SYNTH_ALIAS`, `BGM_KEY_ALIAS`, and `BGM_FALLBACK_PATHS`
 * from `client/src/bansung/sound.ts` so `synthFallback` and BGM fallbacks can be verified
 * without compiling browser TypeScript in Node.
 */
export function parseClientSoundContract(soundTsSource) {
  const canonicalKeys = new Set();
  const sfxAlias = Object.create(null);
  const bgmAlias = Object.create(null);
  const bgmFallbackPaths = [];

  const canonicalMatch = soundTsSource.match(
    /const CANONICAL_DEFS\b[\s\S]*?=\s*\{([\s\S]*?)^\};/m,
  );
  if (canonicalMatch) {
    for (const m of canonicalMatch[1].matchAll(/^\s{2}([a-z0-9_]+):\s*(?:makeDef\(|\{)/gm)) {
      canonicalKeys.add(m[1]);
    }
  }

  const sfxAliasMatch = soundTsSource.match(
    /const SFX_SYNTH_ALIAS\b[\s\S]*?=\s*\{([\s\S]*?)^\};/m,
  );
  if (sfxAliasMatch) {
    for (const m of sfxAliasMatch[1].matchAll(/^\s{2}([a-z0-9_]+):\s*'([a-z0-9_]+)'/gm)) {
      sfxAlias[m[1]] = m[2];
    }
  }

  const bgmAliasMatch = soundTsSource.match(
    /const BGM_KEY_ALIAS\b[\s\S]*?=\s*\{([\s\S]*?)^\};/m,
  );
  if (bgmAliasMatch) {
    for (const m of bgmAliasMatch[1].matchAll(/^\s{2}([a-z0-9_]+):\s*'([a-z0-9_]+)'/gm)) {
      bgmAlias[m[1]] = m[2];
    }
  }

  const bgmFallbackMatch = soundTsSource.match(
    /const BGM_FALLBACK_PATHS\b[\s\S]*?=\s*\{([\s\S]*?)^\};/m,
  );
  if (bgmFallbackMatch) {
    for (const m of bgmFallbackMatch[1].matchAll(/'([^']+\.(?:ogg|wav|mp3))'/g)) {
      bgmFallbackPaths.push(m[1]);
    }
  }

  return { canonicalKeys, sfxAlias, bgmAlias, bgmFallbackPaths };
}

/**
 * Extracts `TIER1_CLIP_KEYS` from `client/src/bansung/sprites.ts`.
 */
export function parseClientTier1SpriteKeys(spritesTsSource) {
  const match = spritesTsSource.match(
    /const TIER1_CLIP_KEYS\b[\s\S]*?=\s*\[([\s\S]*?)\];/,
  );
  if (!match) return [];
  return [...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

/**
 * Collects all sprite and audio keys referenced by the compiled shared `bansung` module.
 */
export function collectSharedBansungRefs(shared) {
  const spriteRefs = [];
  const audioRefs = [];
  const addS = (ctx, key) => {
    if (key) spriteRefs.push({ ctx, key });
  };
  const addA = (ctx, key) => {
    if (key) audioRefs.push({ ctx, key });
  };

  for (const [id, hero] of Object.entries(shared.BANSUNG_HEROES || {})) {
    for (const [state, anim] of Object.entries(hero.anims || {})) {
      addS(`hero.${id}.${state}`, anim?.spriteKey || `hero_${id}_${state}`);
    }
    if (hero.miragineFallback?.unitId && hero.miragineFallback.anims) {
      const unitLower = String(hero.miragineFallback.unitId).toLowerCase();
      for (const state of Object.keys(hero.miragineFallback.anims)) {
        addS(`hero.${id}.miragineFallback.${state}`, `miragine_${unitLower}_${state}`);
      }
    }
    addS(`hero.${id}.portraitKey`, hero.portraitKey);
  }

  if (shared.BANSUNG_PET?.anims) {
    for (const [state, anim] of Object.entries(shared.BANSUNG_PET.anims)) {
      addS(`pet.${state}`, anim?.spriteKey || `pet_tiger_${state}`);
    }
  }

  for (const [id, w] of Object.entries(shared.BANSUNG_WEAPONS || {})) {
    addS(`weapon.${id}.spriteKey`, w.spriteKey);
    addS(`weapon.${id}.hotbarIcon`, w.hotbarIcon);
    addS(`weapon.${id}.anim.idle`, w.anim?.idle);
    addS(`weapon.${id}.anim.fire`, w.anim?.fire);
    addS(`weapon.${id}.anim.reload`, w.anim?.reload);
    addA(`weapon.${id}.sfxFire`, w.sfxFire);
    addA(`weapon.${id}.sfxReload`, w.sfxReload);
    addA(`weapon.${id}.sfxHit`, w.sfxHit);
  }

  for (const [id, g] of Object.entries(shared.BANSUNG_GADGETS || {})) {
    addS(`gadget.${id}.spriteKey`, g.spriteKey);
    addA(`gadget.${id}.sfxDeploy`, g.sfxDeploy);
    addA(`gadget.${id}.sfxTrigger`, g.sfxTrigger);
  }

  for (const [id, p] of Object.entries(shared.BANSUNG_PROJECTILE_CONFIGS || {})) {
    addS(`projectile.${id}.spriteKey`, p.spriteKey);
    addS(`projectile.${id}.impactVfxKey`, p.impactVfxKey);
  }

  for (const [id, e] of Object.entries(shared.BANSUNG_ENEMIES || {})) {
    for (const [state, anim] of Object.entries(e.anims || {})) {
      addS(`enemy.${id}.${state}`, anim?.spriteKey || `${id}_${state}`);
    }
  }

  for (const [id, c] of Object.entries(shared.BANSUNG_CRATES || {})) {
    addS(`crate.${id}.spriteKey`, c.spriteKey);
    addS(`crate.${id}.brokenSpriteKey`, c.brokenSpriteKey);
    for (const [biome, spriteKey] of Object.entries(c.spriteByBiome || {})) {
      addS(`crate.${id}.spriteByBiome.${biome}`, spriteKey);
    }
  }

  for (const [id, pk] of Object.entries(shared.BANSUNG_PICKUPS || {})) {
    addS(`pickup.${id}.spriteKey`, pk.spriteKey);
    addA(`pickup.${id}.sfx`, pk.sfxKey || pk.sfx);
  }

  if (typeof shared.generateArenaLayout === 'function') {
    for (const biome of Object.keys(shared.BANSUNG_BIOMES || { desert: 1, crypt: 1, cyber: 1 })) {
      const map = shared.generateArenaLayout(biome, 0);
      for (const prop of map.props || []) {
        addS(`map.${biome}.${prop.kind}`, prop.spriteId);
      }
    }
  }

  return { spriteRefs, audioRefs };
}

function resolveSfxSynthKey(key, soundContract) {
  if (!soundContract) return true;
  let cur = key;
  const visited = new Set();
  while (cur && !visited.has(cur)) {
    if (soundContract.canonicalKeys.has(cur)) return true;
    visited.add(cur);
    cur = soundContract.sfxAlias[cur];
  }
  return false;
}

function resolveBgmSynthKey(entryKey, synthFallback, soundContract) {
  if (!soundContract) return true;
  const mapped =
    soundContract.bgmAlias[synthFallback] ||
    soundContract.bgmAlias[entryKey] ||
    synthFallback;
  if (soundContract.canonicalKeys.has(mapped)) return true;
  if (typeof mapped !== 'string' || !mapped.startsWith('bgm_')) return false;
  return Boolean(
    soundContract.bgmAlias[mapped] ||
      Object.values(soundContract.bgmAlias).includes(mapped),
  );
}

function parseLicensesMarkdown(mdText) {
  const missingSections = REQUIRED_LICENSE_SECTIONS.filter((sec) => !mdText.includes(sec));
  const packs = new Map();
  const packSection = mdText.split('## Source Packs')[1]?.split(/^## /m)[0] || '';
  for (const line of packSection.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cells.length < 4) continue;
    const id = cells[0].replace(/^`|`$/g, '');
    if (!/^[a-z0-9_]+$/.test(id)) continue;
    const isSevenCol = cells.length >= 6;
    const packName = cells[1];
    const author = isSevenCol ? cells[2] : '';
    const license = (isSevenCol ? cells[3] : cells[3]).replace(/^`|`$/g, '');
    const upstreamUrl = (isSevenCol ? cells[4] : cells[2]).replace(/^`|`$/g, '');
    if (!/^[A-Z0-9._-]+$/.test(license)) continue;
    packs.set(id, {
      packName,
      author,
      upstreamUrl,
      license,
    });
  }

  const provenance = new Map();
  const provSection = mdText.split('## Asset Provenance')[1]?.split(/^## /m)[0] || '';
  for (const m of provSection.matchAll(
    /^\|\s*`([^`]+)`\s*\|\s*`([a-z0-9_]+)`\s*\|\s*([^|]+)\|/gm,
  )) {
    provenance.set(m[1], { sourceId: m[2], notes: m[3].trim() });
  }

  const requiredAttrSection = mdText.split('## Required Attributions')[1] || '';
  return { missingSections, packs, provenance, provSection, requiredAttrSection };
}

/**
 * Verifies the entire `database-ban-sung/` asset bundle, `manifest.json`,
 * `LICENSES.md`, `AnimMeta`, client/shared references, and runtime fallbacks.
 *
 * @param {object} [options]
 * @returns {object} `AssetAuditReport`
 */
export function verifyBansungAssets(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const dbRoot = path.resolve(options.dbRoot || path.join(repoRoot, 'database-ban-sung'));
  const manifestPath = path.resolve(options.manifestPath || path.join(dbRoot, 'manifest.json'));
  const licensesPath = path.resolve(options.licensesPath || path.join(dbRoot, 'LICENSES.md'));
  const sourcesPath =
    options.sourcesPath === false
      ? null
      : path.resolve(options.sourcesPath || path.join(dbRoot, 'sources.json'));
  const miragineRoot =
    options.miragineRoot === false
      ? null
      : path.resolve(options.miragineRoot || path.join(repoRoot, 'database-miraginewar'));
  const clientSoundSourcePath =
    options.clientSoundSourcePath === false
      ? null
      : path.resolve(
          options.clientSoundSourcePath || path.join(repoRoot, 'client/src/bansung/sound.ts'),
        );
  const clientSpritesSourcePath =
    options.clientSpritesSourcePath === false
      ? null
      : path.resolve(
          options.clientSpritesSourcePath || path.join(repoRoot, 'client/src/bansung/sprites.ts'),
        );
  const deepPngDecode = options.deepPngDecode !== false;
  const checkRawFiles = options.checkRawFiles !== false;
  const checkMiragineBackup = options.checkMiragineBackup !== false;
  const checkBgmFallbackPaths = options.checkBgmFallbackPaths !== false;

  const report = {
    passed: false,
    dbRoot,
    spritesChecked: 0,
    audioChecked: 0,
    uniquePngFilesChecked: 0,
    uniqueAudioFilesChecked: 0,
    missingFiles: [],
    badPngHeaders: [],
    badAudioHeaders: [],
    unlicensedSources: [],
    unreferencedFiles: [],
    schemaErrors: [],
    dimErrors: [],
    pivotErrors: [],
    fallbackErrors: [],
    referenceErrors: [],
    miragineBackupErrors: [],
  };

  if (!fs.existsSync(manifestPath)) {
    report.missingFiles.push(manifestPath);
    return report;
  }
  if (!fs.existsSync(licensesPath)) {
    report.missingFiles.push(licensesPath);
    return report;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    report.schemaErrors.push(`manifest.json invalid JSON: ${err.message}`);
    return report;
  }

  // Top-level manifest schema & defaults (d09)
  if (manifest.version !== 1) {
    report.schemaErrors.push(`manifest.version expected 1, got ${manifest.version}`);
  }
  if (typeof manifest.generatedAt !== 'string' || Number.isNaN(Date.parse(manifest.generatedAt))) {
    report.schemaErrors.push(`manifest.generatedAt must be valid ISO-8601 date string`);
  }
  const defs = manifest.defaults || {};
  if (defs.baseTilePx !== 32 || defs.nativeFacing !== 'right' || defs.simTickHz !== 30) {
    report.schemaErrors.push(
      `manifest.defaults expected {baseTilePx:32, nativeFacing:'right', simTickHz:30}, got ${JSON.stringify(defs)}`,
    );
  }
  if (!manifest.sprites || typeof manifest.sprites !== 'object' || Array.isArray(manifest.sprites)) {
    report.schemaErrors.push('manifest.sprites must be an object map');
    return report;
  }
  if (!manifest.audio || typeof manifest.audio !== 'object' || Array.isArray(manifest.audio)) {
    report.schemaErrors.push('manifest.audio must be an object map');
    return report;
  }

  // Parse LICENSES.md
  const licensesMd = fs.readFileSync(licensesPath, 'utf8');
  const licenseInfo = parseLicensesMarkdown(licensesMd);
  for (const sec of licenseInfo.missingSections) {
    report.unlicensedSources.push(`LICENSES.md missing required section: ${sec}`);
  }
  for (const [packId, pack] of licenseInfo.packs.entries()) {
    if (!ALLOWED_LICENSES.has(pack.license) || FORBIDDEN_LICENSE_RE.test(pack.license)) {
      report.unlicensedSources.push(`Pack "${packId}" has disallowed license "${pack.license}"`);
    }
  }
  if (FORBIDDEN_LICENSE_RE.test(licenseInfo.packs.size > 0 ? (licensesMd.split('## Source Packs')[1]?.split(/^## /m)[0] || '') : '')) {
    const packTable = licensesMd.split('## Source Packs')[1]?.split(/^## /m)[0] || '';
    for (const line of packTable.split(/\r?\n/)) {
      if (line.startsWith('| `') && FORBIDDEN_LICENSE_RE.test(line)) {
        report.unlicensedSources.push(`Forbidden license token in Source Packs row: ${line}`);
      }
    }
  }

  // Optional client contracts for synthFallback / Tier1 key validation
  const soundContract =
    clientSoundSourcePath && fs.existsSync(clientSoundSourcePath)
      ? parseClientSoundContract(fs.readFileSync(clientSoundSourcePath, 'utf8'))
      : null;
  const tier1SpriteKeys =
    clientSpritesSourcePath && fs.existsSync(clientSpritesSourcePath)
      ? parseClientTier1SpriteKeys(fs.readFileSync(clientSpritesSourcePath, 'utf8'))
      : null;

  const referencedRelPaths = new Set();
  const decodedPngCache = new Map();
  const verifiedAudioCache = new Map();
  const usedSourceIds = new Set();

  // Validate a single PNG file once (cached by POSIX relpath)
  const validatePngFile = (relPath, context) => {
    const full = resolveContained(dbRoot, relPath);
    if (!full) {
      report.schemaErrors.push(`${context}: unsafe path "${relPath}"`);
      return null;
    }
    if (decodedPngCache.has(relPath)) return decodedPngCache.get(relPath);

    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      report.missingFiles.push(relPath);
      decodedPngCache.set(relPath, null);
      return null;
    }
    const stat = fs.statSync(full);
    if (stat.size <= 0) {
      report.badPngHeaders.push(`${relPath}: empty (0 bytes)`);
      decodedPngCache.set(relPath, null);
      return null;
    }
    const buf = fs.readFileSync(full);
    if (detectMagicFormat(buf) !== 'png') {
      report.badPngHeaders.push(`${relPath}: invalid PNG magic bytes`);
      decodedPngCache.set(relPath, null);
      return null;
    }
    try {
      const hdr = inspectPngHeader(buf);
      if (deepPngDecode) {
        const dec = decodePng(buf);
        if (dec.width !== hdr.width || dec.height !== hdr.height) {
          report.badPngHeaders.push(`${relPath}: IHDR/decode dimension mismatch`);
          decodedPngCache.set(relPath, null);
          return null;
        }
      }
      decodedPngCache.set(relPath, hdr);
      return hdr;
    } catch (err) {
      report.badPngHeaders.push(`${relPath}: ${err.message}`);
      decodedPngCache.set(relPath, null);
      return null;
    }
  };

  // Validate a single audio file once (cached by POSIX relpath)
  const validateAudioFile = (relPath, context) => {
    const full = resolveContained(dbRoot, relPath);
    if (!full) {
      report.schemaErrors.push(`${context}: unsafe audio path "${relPath}"`);
      return false;
    }
    if (verifiedAudioCache.has(relPath)) return verifiedAudioCache.get(relPath);

    const ext = path.extname(relPath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) {
      report.badAudioHeaders.push(`${relPath}: unsupported audio extension "${ext}"`);
      verifiedAudioCache.set(relPath, false);
      return false;
    }
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      report.missingFiles.push(relPath);
      verifiedAudioCache.set(relPath, false);
      return false;
    }
    const stat = fs.statSync(full);
    if (stat.size <= 0) {
      report.badAudioHeaders.push(`${relPath}: empty (0 bytes)`);
      verifiedAudioCache.set(relPath, false);
      return false;
    }
    const buf = fs.readFileSync(full);
    const expectedFmt = ext.slice(1);
    const detected = detectMagicFormat(buf);
    if (detected !== expectedFmt) {
      report.badAudioHeaders.push(`${relPath}: expected magic "${expectedFmt}", got "${detected}"`);
      verifiedAudioCache.set(relPath, false);
      return false;
    }
    if (expectedFmt === 'wav') {
      try {
        const wav = parseWav(buf);
        if (!wav.samplesPerChannel || wav.samplesPerChannel <= 0 || wav.durationMs <= 0) {
          report.badAudioHeaders.push(`${relPath}: WAV has 0 samples`);
          verifiedAudioCache.set(relPath, false);
          return false;
        }
      } catch (err) {
        report.badAudioHeaders.push(`${relPath}: WAV parse failed (${err.message})`);
        verifiedAudioCache.set(relPath, false);
        return false;
      }
    }
    verifiedAudioCache.set(relPath, true);
    return true;
  };

  // Check every sprite entry
  for (const [key, entry] of Object.entries(manifest.sprites)) {
    report.spritesChecked++;
    if (!VALID_ID_RE.test(key)) {
      report.schemaErrors.push(`sprite "${key}": invalid ID format`);
    }
    if (!entry || typeof entry !== 'object') {
      report.schemaErrors.push(`sprite "${key}": entry must be object`);
      continue;
    }
    if (!VALID_CATEGORIES.has(entry.category)) {
      report.schemaErrors.push(`sprite "${key}": invalid category "${entry.category}"`);
    }
    if (entry.nativeFacing !== undefined && entry.nativeFacing !== 'right' && entry.nativeFacing !== 'left') {
      report.schemaErrors.push(`sprite "${key}": invalid nativeFacing "${entry.nativeFacing}"`);
    }

    // Source license coverage + provenance agreement
    if (!entry.sourceId || !licenseInfo.packs.has(entry.sourceId)) {
      report.unlicensedSources.push(`sprite "${key}": sourceId "${entry.sourceId}" missing from LICENSES.md`);
    } else {
      usedSourceIds.add(entry.sourceId);
    }

    referencedRelPaths.add(entry.path);
    const pngHdr = validatePngFile(entry.path, `sprite "${key}"`);
    const prov = licenseInfo.provenance.get(entry.path);
    if (!prov) {
      report.unlicensedSources.push(`sprite "${key}" path "${entry.path}": missing LICENSES.md Asset Provenance row`);
    } else if (entry.sourceId && prov.sourceId !== entry.sourceId) {
      report.unlicensedSources.push(
        `sprite "${key}" path "${entry.path}": sourceId mismatch (manifest="${entry.sourceId}", LICENSES="${prov.sourceId}")`,
      );
    }

    // AnimMeta dims & anchors
    if (!Number.isInteger(entry.frames) || entry.frames < 1) {
      report.dimErrors.push(`sprite "${key}": invalid frames=${entry.frames}`);
    }
    if (!Number.isInteger(entry.cellW) || entry.cellW < 1 || !Number.isInteger(entry.cellH) || entry.cellH < 1) {
      report.dimErrors.push(`sprite "${key}": invalid cell dims ${entry.cellW}x${entry.cellH}`);
    }
    if (pngHdr && Number.isInteger(entry.frames) && Number.isInteger(entry.cellW) && Number.isInteger(entry.cellH)) {
      if (pngHdr.width !== entry.frames * entry.cellW || pngHdr.height !== entry.cellH) {
        report.dimErrors.push(
          `sprite "${key}" (${entry.path}): PNG ${pngHdr.width}x${pngHdr.height} !== ${entry.frames}f * ${entry.cellW}x${entry.cellH}`,
        );
      }
    }
    if (!Number.isInteger(entry.offX) || !Number.isInteger(entry.offY)) {
      report.pivotErrors.push(`sprite "${key}": non-integer offX/offY (${entry.offX}, ${entry.offY})`);
    } else if (Number.isInteger(entry.cellW) && Number.isInteger(entry.cellH)) {
      if (entry.offX < -(entry.cellW + 8) || entry.offX > 0 || entry.offY < -(entry.cellH + 8) || entry.offY > 0) {
        report.pivotErrors.push(
          `sprite "${key}": out-of-range anchor offset (${entry.offX}, ${entry.offY}) for cell ${entry.cellW}x${entry.cellH}`,
        );
      }
    }
    if (typeof entry.fps !== 'number' || !Number.isFinite(entry.fps) || entry.fps < 0) {
      report.dimErrors.push(`sprite "${key}": invalid fps=${entry.fps}`);
    }
    if (typeof entry.loop !== 'boolean') {
      report.schemaErrors.push(`sprite "${key}": loop must be boolean`);
    }

    // Pivot validation (mandatory on rotatable weapons, validated wherever present)
    if (entry.category === 'weapon' && !entry.pivot) {
      report.pivotErrors.push(`sprite "${key}": weapon entry missing pivot`);
    }
    if (entry.pivot !== undefined) {
      const p = entry.pivot;
      if (
        !p ||
        typeof p !== 'object' ||
        typeof p.anchorX !== 'number' ||
        typeof p.anchorY !== 'number' ||
        !Number.isFinite(p.anchorX) ||
        !Number.isFinite(p.anchorY)
      ) {
        report.pivotErrors.push(`sprite "${key}": invalid pivot anchor coords`);
      } else if (Number.isInteger(entry.cellW) && Number.isInteger(entry.cellH)) {
        if (p.anchorX < 0 || p.anchorX > entry.cellW || p.anchorY < 0 || p.anchorY > entry.cellH) {
          report.pivotErrors.push(
            `sprite "${key}": pivot anchor (${p.anchorX},${p.anchorY}) outside 0..${entry.cellW}x${entry.cellH}`,
          );
        }
        if (p.muzzleX !== undefined) {
          if (typeof p.muzzleX !== 'number' || !Number.isFinite(p.muzzleX) || p.muzzleX < -4 || p.muzzleX > entry.cellW + 8) {
            report.pivotErrors.push(`sprite "${key}": invalid pivot.muzzleX=${p.muzzleX}`);
          }
        }
        if (p.muzzleY !== undefined) {
          if (typeof p.muzzleY !== 'number' || !Number.isFinite(p.muzzleY) || p.muzzleY < -4 || p.muzzleY > entry.cellH + 8) {
            report.pivotErrors.push(`sprite "${key}": invalid pivot.muzzleY=${p.muzzleY}`);
          }
        }
      }
    }

    // Sprite procedural fallback hint (d09 / sprites.ts)
    const fb = entry.fallback;
    if (!fb || typeof fb !== 'object' || !VALID_FALLBACK_SHAPES.has(fb.shape) || !HEX_COLOR_RE.test(String(fb.color || ''))) {
      report.fallbackErrors.push(`sprite "${key}": invalid fallback ${JSON.stringify(fb)}`);
    } else if (fb.accent !== undefined && !HEX_COLOR_RE.test(String(fb.accent))) {
      report.fallbackErrors.push(`sprite "${key}": invalid fallback.accent "${fb.accent}"`);
    }
  }

  // Check every audio entry
  for (const [key, entry] of Object.entries(manifest.audio)) {
    report.audioChecked++;
    if (!VALID_ID_RE.test(key)) {
      report.schemaErrors.push(`audio "${key}": invalid ID format`);
    }
    if (!entry || typeof entry !== 'object') {
      report.schemaErrors.push(`audio "${key}": entry must be object`);
      continue;
    }
    if (entry.kind !== 'sfx' && entry.kind !== 'bgm') {
      report.schemaErrors.push(`audio "${key}": invalid kind "${entry.kind}"`);
    }
    if (typeof entry.durationMs !== 'number' || !Number.isFinite(entry.durationMs) || entry.durationMs <= 0) {
      report.schemaErrors.push(`audio "${key}": invalid durationMs=${entry.durationMs}`);
    }
    if (typeof entry.gain !== 'number' || !Number.isFinite(entry.gain) || entry.gain <= 0 || entry.gain > 1.0) {
      report.schemaErrors.push(`audio "${key}": invalid gain=${entry.gain}`);
    }
    if (typeof entry.loop !== 'boolean') {
      report.schemaErrors.push(`audio "${key}": loop must be boolean`);
    }

    if (!entry.sourceId || !licenseInfo.packs.has(entry.sourceId)) {
      report.unlicensedSources.push(`audio "${key}": sourceId "${entry.sourceId}" missing from LICENSES.md`);
    } else {
      usedSourceIds.add(entry.sourceId);
    }

    const primaryAndFallback = [entry.path];
    if (entry.fallbackPath !== undefined) primaryAndFallback.push(entry.fallbackPath);
    const variationFiles = Array.isArray(entry.variations) ? entry.variations : [];

    for (const rel of primaryAndFallback) {
      referencedRelPaths.add(rel);
      validateAudioFile(rel, `audio "${key}"`);
      const prov = licenseInfo.provenance.get(rel);
      if (!prov) {
        report.unlicensedSources.push(`audio "${key}" path "${rel}": missing LICENSES.md Asset Provenance row`);
      } else if (rel === entry.fallbackPath && rel !== entry.path) {
        // Synthesized .wav fallbacks derive from generated_synth even when primary .ogg/.mp3 is OSS.
        if (!licenseInfo.packs.has(prov.sourceId)) {
          report.unlicensedSources.push(
            `audio "${key}" fallbackPath "${rel}": provenance sourceId "${prov.sourceId}" missing from LICENSES.md`,
          );
        } else if (prov.sourceId !== entry.sourceId && prov.sourceId !== 'generated_synth') {
          report.unlicensedSources.push(
            `audio "${key}" fallbackPath "${rel}": unexpected sourceId "${prov.sourceId}" for primary "${entry.sourceId}"`,
          );
        } else {
          usedSourceIds.add(prov.sourceId);
        }
      } else if (entry.sourceId && prov.sourceId !== entry.sourceId) {
        report.unlicensedSources.push(
          `audio "${key}" path "${rel}": sourceId mismatch (manifest="${entry.sourceId}", LICENSES="${prov.sourceId}")`,
        );
      }
    }

    for (const rel of variationFiles) {
      referencedRelPaths.add(rel);
      validateAudioFile(rel, `audio "${key}" variation`);
      const prov = licenseInfo.provenance.get(rel);
      if (!prov) {
        report.unlicensedSources.push(`audio "${key}" variation "${rel}": missing LICENSES.md Asset Provenance row`);
      } else if (!licenseInfo.packs.has(prov.sourceId)) {
        report.unlicensedSources.push(
          `audio "${key}" variation "${rel}": provenance sourceId "${prov.sourceId}" missing from LICENSES.md`,
        );
      } else {
        usedSourceIds.add(prov.sourceId);
      }
    }

    // Audio multi-format fallback checks (d16 + sound.ts)
    const primaryExt = path.extname(String(entry.path || '')).toLowerCase();
    if ((primaryExt === '.ogg' || primaryExt === '.mp3') && String(entry.path).startsWith('audio/')) {
      if (!entry.fallbackPath || path.extname(entry.fallbackPath).toLowerCase() !== '.wav') {
        report.fallbackErrors.push(
          `audio "${key}" (${entry.path}): non-WAV under audio/ must declare a .wav fallbackPath`,
        );
      }
    }

    if (typeof entry.synthFallback !== 'string' || !VALID_ID_RE.test(entry.synthFallback)) {
      report.fallbackErrors.push(`audio "${key}": invalid synthFallback "${entry.synthFallback}"`);
    } else if (soundContract) {
      const ok =
        entry.kind === 'bgm'
          ? resolveBgmSynthKey(key, entry.synthFallback, soundContract)
          : resolveSfxSynthKey(entry.synthFallback, soundContract);
      if (!ok) {
        report.fallbackErrors.push(
          `audio "${key}": synthFallback "${entry.synthFallback}" does not resolve in client/src/bansung/sound.ts`,
        );
      }
    }
  }

  // CC-BY attribution guard for any CC-BY packs actually used by manifest entries
  for (const srcId of usedSourceIds) {
    const pack = licenseInfo.packs.get(srcId);
    if (pack && pack.license.startsWith('CC-BY-') && !licenseInfo.requiredAttrSection.includes(srcId)) {
      report.unlicensedSources.push(
        `Used CC-BY sourceId "${srcId}" (${pack.license}) missing attribution in ## Required Attributions`,
      );
    }
  }

  // Verify every provenance row references a known sourceId and matching file SHA-256 prefix
  for (const [rel, prov] of licenseInfo.provenance.entries()) {
    if (!licenseInfo.packs.has(prov.sourceId)) {
      report.unlicensedSources.push(
        `LICENSES.md provenance "${rel}" references unknown sourceId "${prov.sourceId}"`,
      );
    }
    const shaMatch = /\bsha256=([0-9a-f]{8,64})\b/i.exec(prov.notes || '');
    if (shaMatch) {
      const abs = resolveContained(dbRoot, rel);
      if (abs && fs.existsSync(abs)) {
        const expectedPrefix = shaMatch[1].toLowerCase();
        const actualSha = sha256Hex(fs.readFileSync(abs));
        if (!actualSha.startsWith(expectedPrefix)) {
          report.schemaErrors.push(
            `LICENSES.md provenance "${rel}" sha256 mismatch: notes="${expectedPrefix}", disk="${actualSha.slice(0, expectedPrefix.length)}"`,
          );
        }
      }
    }
  }

  // Verify zero unreferenced files on disk under database-ban-sung/
  if (fs.existsSync(path.join(dbRoot, '_cache'))) {
    report.unreferencedFiles.push('_cache/ temporary directory must not exist in database-ban-sung/');
  }

  const allDiskFiles = walkFiles(dbRoot);
  for (const absFile of allDiskFiles) {
    const rel = toPosix(path.relative(dbRoot, absFile));
    const ext = path.extname(rel).toLowerCase();
    const stat = fs.statSync(absFile);

    if (stat.size <= 0 && !report.missingFiles.includes(rel)) {
      report.schemaErrors.push(`Zero-byte file on disk: ${rel}`);
    }
    if (!ALLOWED_DB_EXTENSIONS.has(ext)) {
      report.unreferencedFiles.push(`Unexpected file extension on disk: ${rel}`);
      continue;
    }

    if (rel.startsWith('normalized/')) {
      if (!referencedRelPaths.has(rel)) {
        report.unreferencedFiles.push(`Unreferenced normalized sprite: ${rel}`);
      }
      continue;
    }

    if (rel.startsWith('audio/')) {
      if (ext === '.json') {
        try {
          JSON.parse(fs.readFileSync(absFile, 'utf8'));
        } catch (err) {
          report.schemaErrors.push(`Invalid JSON metadata ${rel}: ${err.message}`);
        }
      } else if (!referencedRelPaths.has(rel)) {
        report.unreferencedFiles.push(`Unreferenced audio media: ${rel}`);
      }
      continue;
    }

    if (rel.startsWith('sprites/')) {
      if (ext === '.json') {
        try {
          JSON.parse(fs.readFileSync(absFile, 'utf8'));
        } catch (err) {
          report.schemaErrors.push(`Invalid JSON metadata ${rel}: ${err.message}`);
        }
        continue;
      }
      if (checkRawFiles) {
        if (stat.size > 0 && (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.mp3')) {
          const fmt = detectMagicFormat(fs.readFileSync(absFile));
          const expected = ext === '.jpeg' ? 'jpg' : ext.slice(1);
          if (fmt !== expected) {
            const target = expected === 'png' ? report.badPngHeaders : report.badAudioHeaders;
            if (expected === 'jpg') report.badPngHeaders.push(`${rel}: expected jpg magic, got ${fmt}`);
            else target.push(`${rel}: expected ${expected} magic, got ${fmt}`);
          } else if (expected === 'png') {
            try {
              inspectPngHeader(fs.readFileSync(absFile));
            } catch (err) {
              report.badPngHeaders.push(`${rel}: ${err.message}`);
            }
          }
        }
        if (!referencedRelPaths.has(rel) && !licensesMd.includes(rel)) {
          report.unreferencedFiles.push(`Untracked file in sprites/: ${rel}`);
        }
      }
      continue;
    }

    // Top-level files
    if (!['manifest.json', 'LICENSES.md', 'sources.json'].includes(rel)) {
      report.unreferencedFiles.push(`Unrecognized top-level file: ${rel}`);
    }
  }

  // Verify client Tier1 clip keys & BGM fallback paths
  if (tier1SpriteKeys) {
    for (const key of tier1SpriteKeys) {
      if (!manifest.sprites[key]) {
        report.referenceErrors.push(`client TIER1_CLIP_KEYS "${key}" missing from manifest.sprites`);
      }
    }
  }
  if (soundContract && checkBgmFallbackPaths) {
    for (const rel of new Set(soundContract.bgmFallbackPaths)) {
      if (!referencedRelPaths.has(rel)) {
        const full = resolveContained(dbRoot, rel);
        if (!full || !fs.existsSync(full)) {
          report.fallbackErrors.push(`sound.ts BGM_FALLBACK_PATHS "${rel}" missing on disk`);
        }
      }
    }
  }

  // Verify any shared TypeScript registry references passed in
  if (options.sharedRefs) {
    for (const item of options.sharedRefs.spriteKeys || []) {
      const { ctx, key } = typeof item === 'string' ? { ctx: 'shared', key: item } : item;
      if (!manifest.sprites[key]) {
        report.referenceErrors.push(`${ctx}: spriteKey "${key}" missing from manifest.sprites`);
      }
    }
    for (const item of options.sharedRefs.audioKeys || []) {
      const { ctx, key } = typeof item === 'string' ? { ctx: 'shared', key: item } : item;
      if (!manifest.audio[key]) {
        report.referenceErrors.push(`${ctx}: audioKey "${key}" missing from manifest.audio`);
      }
    }
  }

  // Verify sources.json + database-miraginewar local backup integrity
  if (sourcesPath && fs.existsSync(sourcesPath)) {
    let sources;
    try {
      sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
    } catch (err) {
      report.schemaErrors.push(`sources.json invalid JSON: ${err.message}`);
      sources = null;
    }
    if (sources) {
      const checkPackEntry = (id, lic) => {
        if (!ALLOWED_LICENSES.has(lic) || FORBIDDEN_LICENSE_RE.test(lic)) {
          report.unlicensedSources.push(`sources.json pack "${id}" has disallowed license "${lic}"`);
        }
        if (!licenseInfo.packs.has(id)) {
          report.unlicensedSources.push(`sources.json pack "${id}" missing from LICENSES.md ## Source Packs`);
        } else if (licenseInfo.packs.get(id).license !== lic) {
          report.unlicensedSources.push(
            `sources.json vs LICENSES.md license mismatch for "${id}": "${lic}" !== "${licenseInfo.packs.get(id).license}"`,
          );
        }
      };

      for (const packGroup of [
        sources.spritePacks || [],
        sources.audioPacks || [],
        sources.audioOptionalBundles || [],
      ]) {
        const entries = Array.isArray(packGroup)
          ? packGroup.map((info) => [info?.sourceId || info?.id, info])
          : Object.entries(packGroup);
        for (const [id, info] of entries) {
          checkPackEntry(String(id || ''), info?.license || '');
        }
      }

      if (sources.miragineReuse) {
        checkPackEntry(
          sources.miragineReuse.sourceId || 'internal_miragine',
          sources.miragineReuse.license || '',
        );
      }
      if (sources.generatedSynth) {
        checkPackEntry(
          sources.generatedSynth.id || 'generated_synth',
          sources.generatedSynth.license || '',
        );
      }
      if (checkMiragineBackup && miragineRoot && fs.existsSync(miragineRoot) && sources.miragineReuse) {
        const reuseEntries = [
          ...(sources.miragineReuse.sprites || []),
          ...(sources.miragineReuse.audio || []),
        ];
        for (const item of reuseEntries) {
          const full = resolveContained(miragineRoot, item.src);
          if (!full || !fs.existsSync(full) || fs.statSync(full).size <= 0) {
            report.miragineBackupErrors.push(`Miragine backup missing/empty: ${item.src}`);
            continue;
          }
          const ext = path.extname(item.src).slice(1).toLowerCase();
          const expected = ext === 'jpeg' ? 'jpg' : ext;
          const fmt = detectMagicFormat(fs.readFileSync(full));
          if (fmt !== expected) {
            report.miragineBackupErrors.push(
              `Miragine backup ${item.src}: expected ${expected} magic, got ${fmt}`,
            );
          }
        }
      }
    }
  }

  report.uniquePngFilesChecked = decodedPngCache.size;
  report.uniqueAudioFilesChecked = verifiedAudioCache.size;

  const errorArrays = [
    report.missingFiles,
    report.badPngHeaders,
    report.badAudioHeaders,
    report.unlicensedSources,
    report.unreferencedFiles,
    report.schemaErrors,
    report.dimErrors,
    report.pivotErrors,
    report.fallbackErrors,
    report.referenceErrors,
    report.miragineBackupErrors,
  ];
  report.passed = errorArrays.every((arr) => arr.length === 0);
  return report;
}

function loadSharedRefsIfBuilt(repoRoot) {
  const sharedDistPath = path.join(repoRoot, 'server/dist/shared/src/index.js');
  if (!fs.existsSync(sharedDistPath)) return null;
  const require = createRequire(import.meta.url);
  const shared = require(sharedDistPath);
  const { spriteRefs, audioRefs } = collectSharedBansungRefs(shared);
  return { spriteKeys: spriteRefs, audioKeys: audioRefs };
}

function runCli() {
  const args = new Set(process.argv.slice(2));
  const jsonOutput = args.has('--json');
  const deepPngDecode = !args.has('--no-deep-png');
  const sharedRefs = loadSharedRefsIfBuilt(DEFAULT_REPO_ROOT);

  const report = verifyBansungAssets({
    repoRoot: DEFAULT_REPO_ROOT,
    deepPngDecode,
    sharedRefs,
  });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const summary =
      `[verify-assets] passed=${report.passed} ` +
      `sprites=${report.spritesChecked} (uniquePng=${report.uniquePngFilesChecked}) ` +
      `audio=${report.audioChecked} (uniqueAudio=${report.uniqueAudioFilesChecked}) ` +
      `sharedRefs=${sharedRefs ? `${sharedRefs.spriteKeys.length}s/${sharedRefs.audioKeys.length}a` : 'unbuilt'}`;
    console.log(summary);
    if (!report.passed) {
      const buckets = [
        ['missingFiles', report.missingFiles],
        ['badPngHeaders', report.badPngHeaders],
        ['badAudioHeaders', report.badAudioHeaders],
        ['unlicensedSources', report.unlicensedSources],
        ['unreferencedFiles', report.unreferencedFiles],
        ['schemaErrors', report.schemaErrors],
        ['dimErrors', report.dimErrors],
        ['pivotErrors', report.pivotErrors],
        ['fallbackErrors', report.fallbackErrors],
        ['referenceErrors', report.referenceErrors],
        ['miragineBackupErrors', report.miragineBackupErrors],
      ];
      for (const [name, list] of buckets) {
        if (list.length > 0) {
          console.error(`  ${name} (${list.length}):`);
          for (const item of list.slice(0, 20)) {
            console.error(`    - ${item}`);
          }
        }
      }
    }
  }

  process.exitCode = report.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli();
}
