#!/usr/bin/env node
/**
 * Orchestrates live compiled NestJS production server + executes REAL Chrome Playwright suites:
 *  - T020 (SC-004): Pixel Visual Integrity across 720p, 1080p, 125% DPI, 150% DPI
 *  - T034 (FR-014): Full End-to-End Browser User Journey (Register -> Farm -> Craft -> Enhance -> Gacha -> 2 Boss Arenas)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runFullBrowserUserJourney } from '../../apps/client/test/e2e/full-user-journey.spec';
import { runVisualIntegritySuite } from '../../apps/client/test/e2e/pixel-visual-integrity.spec';

const PORT = 3198;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/testing/evidence');
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'eldoria-playwright-'));

async function waitForHealth(url: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/api/v1/health`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not become healthy within 15s');
}

async function main() {
  const server = spawn(process.execPath, ['apps/game-server/dist/main.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DB_DIR: path.join(TMP_ROOT, 'db'),
      DATA_BACKUPS_DIR: path.join(TMP_ROOT, 'backups'),
      REDIS_ENABLED: 'false',
      ASSET_STORAGE_MODE: 'local_fs',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stderr.write(d));

  try {
    await waitForHealth(BASE_URL);
    console.log('[playwright-e2e] Running T020 Pixel Visual Integrity Suite (4 viewports/DPIs)...');
    const vis = await runVisualIntegritySuite(BASE_URL, EVIDENCE_DIR);

    console.log('[playwright-e2e] Running T034 Full Browser User Journey Suite...');
    const e2e = await runFullBrowserUserJourney(BASE_URL, EVIDENCE_DIR);

    console.log(JSON.stringify({ status: 'PASS', visualIntegrity: vis, fullUserJourney: e2e }, null, 2));
  } finally {
    server.kill();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[playwright-e2e] FAIL:', err);
  process.exit(1);
});
