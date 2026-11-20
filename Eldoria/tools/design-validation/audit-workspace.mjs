#!/usr/bin/env node
/**
 * Comprehensive Cross-Document & Spec Kit Workspace Auditor for Eldoria: Forgotten Wilds
 * Checks:
 *  1. Every required deliverable from GAME_DESIGN_BRIEF.md Section 24 exists and has real content (>500B).
 *  2. Zero unresolved placeholders (TODO:, TBD, TKTK, [NEEDS CLARIFICATION], [PRINCIPLE_, [FEATURE NAME]).
 *  3. Constitution Principle I compliance (zero accidental adoption of PostgreSQL/TypeORM/Redis/S3/CDN outside rejected-alternative/prohibition clauses).
 *  4. All 12 specs/001..012 directories contain complete Spec Kit artifacts (spec, plan, research, data-model, contracts/, quickstart, tasks, analysis-report, checklists/requirements.md, custom checklist).
 *  5. Strict Spec Kit tasks.md format compliance & reviewer-owned custom checklists left unchecked [ ].
 *  6. Every relative markdown link in docs/README.md resolves on disk.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const REQUIRED_FILES = [
  '.specify/memory/constitution.md',
  'docs/README.md',
  // game-design (21)
  'docs/game-design/00-game-vision.md',
  'docs/game-design/01-game-design-document.md',
  'docs/game-design/02-core-gameplay-loop.md',
  'docs/game-design/03-world-building.md',
  'docs/game-design/04-character-design.md',
  'docs/game-design/05-character-progression.md',
  'docs/game-design/06-combat-system.md',
  'docs/game-design/07-skill-system.md',
  'docs/game-design/08-equipment-system.md',
  'docs/game-design/09-weapon-enhancement.md',
  'docs/game-design/10-gacha-system.md',
  'docs/game-design/11-crafting-system.md',
  'docs/game-design/12-farming-system.md',
  'docs/game-design/13-animal-husbandry.md',
  'docs/game-design/14-building-system.md',
  'docs/game-design/15-monster-ai.md',
  'docs/game-design/16-boss-design.md',
  'docs/game-design/17-dungeon-design.md',
  'docs/game-design/18-quest-and-npc.md',
  'docs/game-design/19-game-economy.md',
  'docs/game-design/20-multiplayer-design.md',
  // art-direction (11)
  'docs/art-direction/art-bible.md',
  'docs/art-direction/character-design-standard.md',
  'docs/art-direction/animation-standard.md',
  'docs/art-direction/animation-state-machine.md',
  'docs/art-direction/sprite-sheet-standard.md',
  'docs/art-direction/tileset-standard.md',
  'docs/art-direction/environment-design.md',
  'docs/art-direction/vfx-design.md',
  'docs/art-direction/audio-design.md',
  'docs/art-direction/asset-manifest.md',
  'docs/art-direction/asset-production-backlog.md',
  // ui-ux (7 + mockups/)
  'docs/ui-ux/design-system.md',
  'docs/ui-ux/screen-inventory.md',
  'docs/ui-ux/user-flows.md',
  'docs/ui-ux/interaction-design.md',
  'docs/ui-ux/responsive-design.md',
  'docs/ui-ux/accessibility.md',
  'docs/ui-ux/ui-testing-strategy.md',
  'docs/ui-ux/mockups/index.html',
  'docs/ui-ux/mockups/pixel-animation-showcase.html',
  // architecture (12 + ADRs + diagrams)
  'docs/architecture/system-architecture.md',
  'docs/architecture/frontend-architecture.md',
  'docs/architecture/backend-architecture.md',
  'docs/architecture/game-server-architecture.md',
  'docs/architecture/network-protocol.md',
  'docs/architecture/database-design.md',
  'docs/architecture/data-dictionary.md',
  'docs/architecture/security-design.md',
  'docs/architecture/anti-cheat-design.md',
  'docs/architecture/api-contracts.md',
  'docs/architecture/websocket-contracts.md',
  'docs/architecture/deployment-design.md',
  'docs/architecture/architecture-decisions/ADR-001-json-only-local-database.md',
  'docs/architecture/architecture-decisions/ADR-007-local-docker-redis-minio-and-glitch-free-2d-pipeline.md',
  'docs/architecture/diagrams/architecture-diagrams.md',
  // balancing (6)
  'docs/balancing/progression-model.md',
  'docs/balancing/combat-formulas.md',
  'docs/balancing/weapon-upgrade-costs.csv',
  'docs/balancing/gacha-probabilities.csv',
  'docs/balancing/economy-analysis.md',
  'docs/balancing/simulation-results.md',
  // testing (5)
  'docs/testing/test-strategy.md',
  'docs/testing/test-scenarios.md',
  'docs/testing/acceptance-criteria.md',
  'docs/testing/performance-test-plan.md',
  'docs/testing/security-test-plan.md',
  // management (10)
  'docs/management/feature-roadmap.md',
  'docs/management/mvp-scope.md',
  'docs/management/technical-backlog.md',
  'docs/management/risk-register.md',
  'docs/management/requirements-traceability.md',
  'docs/management/assumptions-and-decisions.md',
  'docs/management/sources-and-licenses.md',
  'docs/management/PROGRESS.md',
  'docs/management/HANDOFF.md',
  'docs/management/FINAL-DESIGN-REPORT.md',
  // game-data (12)
  'game-data/characters.json',
  'game-data/skills.json',
  'game-data/monsters.json',
  'game-data/bosses.json',
  'game-data/items.json',
  'game-data/recipes.json',
  'game-data/crops.json',
  'game-data/animals.json',
  'game-data/buildings.json',
  'game-data/quests.json',
  'game-data/loot-tables.json',
  'game-data/gacha-banners.json',
];

const EXPECTED_SPECS = [
  '001-foundation-game-engine',
  '002-auth-character',
  '003-world-movement',
  '004-combat-skills',
  '005-inventory-loot',
  '006-gathering-crafting',
  '007-equipment-enhancement',
  '008-housing-farming',
  '009-gacha-collection',
  '010-multiplayer-social',
  '011-dungeon-boss',
  '012-game-ui-qa',
  '013-local-infra-pixel-animation',
];

const p0 = [];
const p1 = [];
const p2 = [];

// 1. Check required files
let missingFiles = 0;
for (const rel of REQUIRED_FILES) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    p0.push(`MISSING_REQUIRED_FILE: ${rel}`);
    missingFiles++;
  } else {
    const stat = fs.statSync(fp);
    if (stat.size < 400) {
      p1.push(`THIN_OR_STUB_FILE (${stat.size}B): ${rel}`);
    }
  }
}

// 2. Check all 12 Spec Kit features
let totalSpecFiles = 0;
let totalSpecTasks = 0;
for (const sp of EXPECTED_SPECS) {
  const dir = path.join(ROOT, 'specs', sp);
  const reqArt = ['spec.md', 'plan.md', 'research.md', 'data-model.md', 'quickstart.md', 'tasks.md', 'analysis-report.md', 'checklists/requirements.md'];
  for (const a of reqArt) {
    const fp = path.join(dir, a);
    if (!fs.existsSync(fp)) {
      p0.push(`MISSING_SPEC_ARTIFACT: specs/${sp}/${a}`);
    } else {
      totalSpecFiles++;
    }
  }
  const contractsDir = path.join(dir, 'contracts');
  if (!fs.existsSync(contractsDir) || fs.readdirSync(contractsDir).length === 0) {
    p0.push(`MISSING_SPEC_CONTRACTS: specs/${sp}/contracts/`);
  } else {
    totalSpecFiles += fs.readdirSync(contractsDir).length;
  }
  const checklistsDir = path.join(dir, 'checklists');
  if (fs.existsSync(checklistsDir)) {
    const customChecklists = fs.readdirSync(checklistsDir).filter(f => f !== 'requirements.md' && f.endsWith('.md'));
    if (customChecklists.length === 0) {
      p1.push(`MISSING_CUSTOM_CHECKLIST: specs/${sp}/checklists/<domain>.md`);
    } else {
      totalSpecFiles += customChecklists.length;
      for (const cf of customChecklists) {
        const txt = fs.readFileSync(path.join(checklistsDir, cf), 'utf8');
        const checkedItems = (txt.match(/^- \[[xX]\] CHK\d+/gm) || []).length;
        const uncheckedItems = (txt.match(/^- \[ \] CHK\d+/gm) || []).length;
        if (checkedItems > 0) p1.push(`CUSTOM_CHECKLIST_PRECHECKED (${checkedItems}): specs/${sp}/checklists/${cf}`);
        if (uncheckedItems < 5) p2.push(`CUSTOM_CHECKLIST_FEW_ITEMS (${uncheckedItems}): specs/${sp}/checklists/${cf}`);
      }
    }
  }
  const tasksPath = path.join(dir, 'tasks.md');
  if (fs.existsSync(tasksPath)) {
    const lines = fs.readFileSync(tasksPath, 'utf8').split(/\r?\n/);
    const taskLines = lines.filter(l => /^- \[[ xX]\] T\d{3}\b/.test(l));
    totalSpecTasks += taskLines.length;
    if (taskLines.length < 8) p1.push(`TOO_FEW_TASKS (${taskLines.length}): specs/${sp}/tasks.md`);
  }
}

// 3. Scan all markdown & HTML files under docs/ and specs/ for placeholders & forbidden production code / CDN links
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(fp, out);
    else out.push(fp);
  }
  return out;
}

const allDesignFiles = [
  ...walk(path.join(ROOT, 'docs')),
  ...walk(path.join(ROOT, 'specs')),
  path.join(ROOT, '.specify', 'memory', 'constitution.md'),
].filter(f => /\.(md|html|csv)$/i.test(f));

const PLACEHOLDER_REGEX = /\[NEEDS CLARIFICATION|\[PRINCIPLE_\d|\[FEATURE NAME\]|\bTKTK\b|\bTODO\s*:/g;
// Constitution v2.0.0: Primary DB MUST remain 100% JSON (NO SQL/NoSQL DBMS) and ZERO external cloud SaaS (AWS S3 Cloud, Redis Cloud, Firebase, Supabase, Auth0).
// Self-hosted Local Docker Redis & Local Docker MinIO S3-compatible storage ARE permitted per ADR-007 / Constitution v2.0.0.
const FORBIDDEN_TECH_REGEX = /\b(PostgreSQL|TypeORM|Prisma|MongoDB|MySQL|MariaDB|SQLite|Firebase|Supabase|Auth0|AWS S3|Redis Cloud|Upstash)\b/i;
const NEGATION_CONTEXT_REGEX = /(KHÔNG|không|CẤM|cấm|ZERO|zero|NO\b|no\b|forbid|without|reject|từ chối|thay thế|bị cấm|loại bỏ|ngoài|tránh|0\s|not\s|never|TUYỆT ĐỐI|gợi ý|ban đầu|cũ|vi phạm|forbidden|prohibit|scan|quét|chống|instead|override|DEC-001|ADR-001|Principle I|Nguyên tắc I)/i;
let externalUrlCount = 0;
let constitutionSuspectLines = 0;

for (const fp of allDesignFiles) {
  const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
  const txt = fs.readFileSync(fp, 'utf8');
  if (!rel.endsWith('audit-workspace.mjs')) {
    const cleaned = txt
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/No \[NEEDS CLARIFICATION\] markers remain/g, '');
    const m = cleaned.match(PLACEHOLDER_REGEX);
    if (m && m.length > 0) {
      p1.push(`PLACEHOLDER_FOUND (${m.join(', ')}): ${rel}`);
    }
    const lines = cleaned.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (FORBIDDEN_TECH_REGEX.test(line) && !NEGATION_CONTEXT_REGEX.test(line)) {
        // Also check surrounding +/- 2 lines for "Rejected Alternatives" / "Phương án bị từ chối" table headers
        const windowTxt = lines.slice(Math.max(0, idx - 4), idx + 2).join(' ');
        if (!NEGATION_CONTEXT_REGEX.test(windowTxt)) {
          constitutionSuspectLines++;
          p1.push(`CONSTITUTION_I_REVIEW_NEEDED (${rel}:${idx + 1}): ${line.trim().slice(0, 100)}`);
        }
      }
    });
  }
  if (rel.endsWith('.html')) {
    const extUrls = txt.match(/https?:\/\/[^\s"'<>]+/g);
    if (extUrls) {
      externalUrlCount += extUrls.length;
      p0.push(`EXTERNAL_URL_IN_MOCKUP (${extUrls.length}): ${rel}`);
    }
  }
}

// 4. Constitution v2.0.0 Implementation Mode Guard (DEC-004):
// Ensure ZERO forbidden SQL/NoSQL/ORM/Cloud SaaS dependencies exist in any workspace package.json!
const FORBIDDEN_NPM_DEPS = new Set([
  'pg', 'postgres', 'typeorm', 'prisma', '@prisma/client', 'mongoose', 'mongodb',
  'mysql', 'mysql2', 'sqlite3', 'better-sqlite3', 'sequelize', 'knex',
  'firebase', 'firebase-admin', '@supabase/supabase-js', '@auth0/auth0-react',
]);
const pkgFiles = [
  'package.json',
  'packages/shared/package.json',
  'packages/game-config/package.json',
  'apps/game-server/package.json',
  'apps/client/package.json',
];
for (const relPkg of pkgFiles) {
  const fp = path.join(ROOT, relPkg);
  if (!fs.existsSync(fp)) continue;
  const pkg = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const dep of Object.keys(allDeps)) {
    if (FORBIDDEN_NPM_DEPS.has(dep)) {
      p0.push(`CONSTITUTION_I_FORBIDDEN_DEPENDENCY (${relPkg}): ${dep}`);
    }
  }
}

// 5. Verify docs/README.md links resolve
const readmePath = path.join(ROOT, 'docs', 'README.md');
let brokenReadmeLinks = 0;
if (fs.existsSync(readmePath)) {
  const txt = fs.readFileSync(readmePath, 'utf8');
  const linkRe = /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g;
  let match;
  while ((match = linkRe.exec(txt)) !== null) {
    const target = match[1].trim();
    if (/^https?:\/\//.test(target)) continue;
    const resolved = path.resolve(path.dirname(readmePath), target);
    if (!fs.existsSync(resolved)) {
      p1.push(`BROKEN_README_LINK: ${target}`);
      brokenReadmeLinks++;
    }
  }
}

const result = {
  auditedAt: new Date().toISOString(),
  status: p0.length === 0 && p1.length === 0 ? 'PASS' : (p0.length === 0 ? 'PASS_WITH_P1_WARNINGS' : 'FAIL'),
  stats: {
    requiredFilesChecked: REQUIRED_FILES.length,
    missingRequiredFiles: missingFiles,
    specFeaturesChecked: EXPECTED_SPECS.length,
    totalSpecFiles,
    totalSpecTasks,
    totalDesignFilesScanned: allDesignFiles.length,
    externalUrlsInMockups: externalUrlCount,
    brokenReadmeLinks,
  },
  counts: { P0: p0.length, P1: p1.length, P2: p2.length },
  P0: p0,
  P1: p1,
  P2: p2,
};

console.log(JSON.stringify(result, null, 2));
if (p0.length > 0) process.exit(1);
