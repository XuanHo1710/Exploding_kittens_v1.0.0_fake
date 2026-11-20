import 'reflect-metadata';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapGameServer } from '../../src/main';

describe('Full End-to-End Authoritative Server & Socket.IO Gameplay Journey', () => {
  let app: INestApplication;
  let baseUrl: string;
  let tmpRoot: string;
  let socket: Socket | null = null;

  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eldoria-e2e-'));
    process.env.DATA_DB_DIR = path.join(tmpRoot, 'db');
    process.env.DATA_BACKUPS_DIR = path.join(tmpRoot, 'backups');
    process.env.REDIS_ENABLED = 'false';
    process.env.ASSET_STORAGE_MODE = 'local_fs';

    app = await bootstrapGameServer(0);
    const addr = app.getHttpServer().address();
    const port = typeof addr === 'object' && addr ? addr.port : 3001;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 20_000);

  afterAll(async () => {
    if (socket) socket.disconnect();
    if (app) await app.close();
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  async function api(method: string, route: string, body?: any, token?: string, idemKey?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (idemKey) headers['X-Idempotency-Key'] = idemKey;
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, json, res };
  }

  it('serves health, validated AssetManifest, real RGBA32 PNG sprite sheets, and canonical catalog', async () => {
    const health = await api('GET', '/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.json.components.jsonPrimaryDb.status).toBe('UP');
    expect(health.json.components.gameCatalog.filesLoaded).toBe(12);

    const manifest = await api('GET', '/api/v1/assets/manifest');
    expect(manifest.status).toBe(200);
    expect(manifest.json.pixelStandard.vfxMicroFramePx).toEqual([16, 16]);
    expect(manifest.json.entries.length).toBeGreaterThanOrEqual(40);

    // Fetch real generated PNG from /assets/v1/ and check magic header \x89PNG
    const pngRes = await fetch(`${baseUrl}/assets/v1/atlases/heroes/chr_kael_vanguard.png`);
    expect(pngRes.status).toBe(200);
    const buf = Buffer.from(await pngRes.arrayBuffer());
    expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');

    const cat = await api('GET', '/api/v1/catalog');
    expect(cat.json.characters.length).toBe(12);
    expect(cat.json.skills.length).toBe(60);
    expect(cat.json.items.length).toBe(157);
  });

  it('completes Register -> Create Kael -> Farm -> Craft (Idempotent) -> Enhance -> Gacha x10 -> Party -> Live WS Combat & Boss Telegraph', async () => {
    // 1. Register & Login & Preferences
    const reg = await api('POST', '/api/v1/auth/register', {
      username: 'e2e_vanguard',
      email: 'e2e@eldoria.local',
      password: 'Password1234',
    });
    expect(reg.status).toBe(201);
    const token = reg.json.accessToken as string;
    expect(token).toBeTruthy();

    const prefRes = await api('PUT', '/api/v1/account/preferences', { cameraShakePct: 50, uiScalePct: 115 }, token);
    expect(prefRes.status).toBe(200);
    expect(prefRes.json.cameraShakePct).toBe(50);

    // 2. Create Starter Character Kael
    const created = await api('POST', '/api/v1/characters', { name: 'KaelTester', starterHeroId: 'chr_kael_vanguard' }, token);
    expect(created.status).toBe(201);
    const charId = created.json.character.id as string;
    const starterWeaponId = created.json.character.equippedSlots.MAIN_WEAPON as string;

    // 3. Allocate stats
    const statRes = await api('POST', `/api/v1/characters/${charId}/stats/allocate`, { str: 3, vit: 2 }, token);
    expect(statRes.status).toBe(201);
    expect(statRes.json.character.unspentStatPoints).toBe(0);

    // 4. Farming: Harvest mature plot_1..3, Till plot_6, Plant & Water, Feed & Collect Chicken
    const h1 = await api('POST', `/api/v1/characters/${charId}/homestead/farm/harvest`, { plotId: 'plot_1' }, token);
    expect(h1.status).toBe(201);
    expect(h1.json.harvested.itemId).toBe('mat_sunwheat_grain');
    await api('POST', `/api/v1/characters/${charId}/homestead/farm/till`, { plotId: 'plot_6' }, token);
    const plant = await api('POST', `/api/v1/characters/${charId}/homestead/farm/plant`, { plotId: 'plot_6', cropId: 'crp_sunwheat' }, token);
    expect(plant.json.plot.state).toBe('PLANTED');
    await api('POST', `/api/v1/characters/${charId}/homestead/animals/feed`, { animalInstanceId: 'anm_inst_chicken_1' }, token);
    const egg = await api('POST', `/api/v1/characters/${charId}/homestead/animals/collect`, { animalInstanceId: 'anm_inst_chicken_1' }, token);
    expect(egg.json.collected.qty).toBeGreaterThanOrEqual(1);

    // 5. Crafting with X-Idempotency-Key (replay MUST return identical txId without double spending)
    const craft1 = await api('POST', `/api/v1/characters/${charId}/crafting/craft`, { recipeId: 'rcp_smelt_copper_ingot' }, token, 'idem_craft_001');
    expect(craft1.status).toBe(201);
    const craft2 = await api('POST', `/api/v1/characters/${charId}/crafting/craft`, { recipeId: 'rcp_smelt_copper_ingot' }, token, 'idem_craft_001');
    expect(craft2.json.txId).toBe(craft1.json.txId);
    expect(craft2.json.wallet.gold).toBe(craft1.json.wallet.gold);

    // 6. Deterministic Weapon Enhancement +0 -> +1 -> +2
    const enh1 = await api('POST', `/api/v1/characters/${charId}/enhancement/upgrade`, { itemInstanceId: starterWeaponId }, token, 'idem_enh_1');
    expect(enh1.status).toBe(201);
    expect(enh1.json.toLevel).toBe(1);
    const enh2 = await api('POST', `/api/v1/characters/${charId}/enhancement/upgrade`, { itemInstanceId: starterWeaponId }, token, 'idem_enh_2');
    expect(enh2.status).toBe(201);
    expect(enh2.json.toLevel).toBe(2);
    expect(enh2.json.newWeaponAtk).toBeGreaterThan(enh1.json.newWeaponAtk);

    // 7. Fair Gacha 10-Pull (Epic+ guarantee & exact currency deduction)
    const pull = await api('POST', `/api/v1/characters/${charId}/gacha/pull`, { bannerId: 'bnr_perm_heroes', count: 10 }, token, 'idem_gacha_10');
    expect(pull.status).toBe(201);
    expect(pull.json.results).toHaveLength(10);
    const hasEpicPlus = pull.json.results.some((r: any) => ['EPIC', 'LEGENDARY', 'MYTHIC'].includes(r.rarity));
    expect(hasEpicPlus).toBe(true);
    expect(pull.json.wallet.starlightShard).toBe(0);

    // 8. Party Create & Ready
    const pty = await api('POST', `/api/v1/characters/${charId}/party/create`, {}, token);
    expect(pty.status).toBe(201);
    expect(pty.json.members).toHaveLength(1);

    // 9. Live WebSocket /game: Join -> Move -> XSS-safe Chat -> Gather -> Travel to Boss Arena -> Combat!
    socket = io(`${baseUrl}/game`, { auth: { token }, transports: ['websocket'] });
    await new Promise<void>((resolve, reject) => {
      socket!.once('connect', () => resolve());
      socket!.once('connect_error', reject);
    });

    const joinAck: any = await new Promise((resolve) => {
      socket!.emit('C2S_JOIN_ZONE', { characterId: charId }, resolve);
    });
    expect(joinAck.ok).toBe(true);
    expect(joinAck.zoneId).toBe('reg_greenhaven_village');

    const moveAck: any = await new Promise((resolve) => {
      socket!.emit('C2S_MOVE_INPUT', { seq: 1, dx: 1, dy: 0, sprint: false, dtMs: 50 }, resolve);
    });
    expect(moveAck.facing).toBe('right');

    const chatAck: any = await new Promise((resolve) => {
      socket!.emit('C2S_CHAT_SEND', { channel: 'ZONE', message: 'Xin chào <script>alert(1)</script>' }, resolve);
    });
    expect(chatAck.ok).toBe(true);
    expect(chatAck.payload.message).not.toContain('<script>');
    expect(chatAck.payload.message).toContain('&lt;script&gt;');

    // Travel directly to Mossroot Hollow Boss Arena & engage Thornback Elder!
    const travelAck: any = await new Promise((resolve) => {
      socket!.emit('C2S_PORTAL_TRAVEL', { targetZoneId: 'dng_mossroot_hollow' }, resolve);
    });
    expect(travelAck.ok).toBe(true);
    expect(travelAck.zoneId).toBe('dng_mossroot_hollow');

    // Move up toward boss and attack with Kael's fire skill
    for (let s = 2; s <= 35; s++) {
      await new Promise((resolve) => socket!.emit('C2S_MOVE_INPUT', { seq: s, dx: 0, dy: -1, sprint: true, dtMs: 100 }, resolve));
    }
    const combatAck: any = await new Promise((resolve) => {
      socket!.emit('C2S_COMBAT_ACTION', { action: 'SKILL', skillId: 'skl_kael_ult_crimson_crescent' }, resolve);
    });
    expect(combatAck.ok).toBe(true);
    expect(combatAck.hits.length).toBeGreaterThanOrEqual(1);
    expect(combatAck.hits[0].damage).toBeGreaterThan(0);
  }, 25_000);
});
