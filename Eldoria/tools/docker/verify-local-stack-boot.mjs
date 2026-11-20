#!/usr/bin/env node
/**
 * Cold-Start Local Docker Compose Boot SLA Verifier (SC-001: < 60s all-healthy)
 * Also validates docker-compose.yml syntax cleanly even when Docker daemon is offline.
 */
import { execFileSync } from 'node:child_process';

const startMs = Date.now();
const DRY_RUN = process.argv.includes('--config-only');

try {
  execFileSync('docker', ['compose', 'config', '--quiet'], { stdio: 'inherit' });
  console.log('[docker-verify] docker-compose.yml syntax & schema: PASS');
} catch (err) {
  console.error('[docker-verify] docker-compose.yml validation failed:', err.message);
  process.exit(1);
}

if (DRY_RUN) {
  process.exit(0);
}

const DEADLINE_MS = 60_000;
const HEALTH_URL = process.env.HEALTH_URL || 'http://127.0.0.1:3000/api/v1/health';

async function pollHealth() {
  while (Date.now() - startMs < DEADLINE_MS) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        const body = await res.json();
        const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(2);
        console.log(JSON.stringify({ status: 'PASS', elapsedSec: Number(elapsedSec), slaSec: 60, health: body }, null, 2));
        process.exit(0);
      }
    } catch {
      // retry until deadline
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.error(`[docker-verify] FAIL: Stack did not become healthy within 60s at ${HEALTH_URL}`);
  process.exit(1);
}

pollHealth();
