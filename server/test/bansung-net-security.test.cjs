'use strict';

require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { performance } = require('node:perf_hooks');

const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { ServeStaticModule } = require('@nestjs/serve-static');
const { io } = require('socket.io-client');

const S = require('../dist/shared/src/index.js');
const {
  BAN_SUNG_STATIC_PREFIX,
  BAN_SUNG_ROOT,
  ALLOWED_BANSUNG_STATIC_EXT,
  BanSungStaticGuard,
  guardBanSungStaticRequest,
} = require('../dist/server/src/app.module.js');
const { AccountController } = require('../dist/server/src/store/account.controller.js');
const { AccountsService, START_COINS } = require('../dist/server/src/store/accounts.service.js');
const { DbService } = require('../dist/server/src/store/db.service.js');
const { ACCOUNT_STORE } = require('../dist/server/src/store/json.store.js');
const { RoomsService, normalizeGameMode } = require('../dist/server/src/game/rooms.service.js');
const { GameGateway } = require('../dist/server/src/game/game.gateway.js');
const { Game, GameError } = require('../dist/server/src/game/game.js');
const {
  BansungWorld,
  computeBansungPlayerScore,
  buildBansungResult,
} = require('../dist/server/src/game/bansung/world.js');
const sec = require('../dist/server/src/game/bansung/security.js');
const {
  BANSUNG_SWAP_LOCK_TICKS,
  switchHeroWeaponSlot,
  handleHeroReloadCmd,
  tickHeroReload,
} = require('../dist/server/src/game/bansung/weapons.js');
const { spawnMob } = require('../dist/server/src/game/bansung/mobs.js');
const { hasLineOfSight } = require('../dist/server/src/game/bansung/spatial.js');

const {
  GAME_MODES,
  BANSUNG_EVT_FRAME,
  BANSUNG_EVT_CMD,
  BANSUNG_EVT_HERO,
  BANSUNG_ENEMY_FIELDS,
  BANSUNG_BULLET_FIELDS,
  BANSUNG_FX_FIELDS,
  FX_DMG,
  BANSUNG_RELOAD_LOCKOUT_U,
  BANSUNG_RELOAD_SWEET_MIN,
  BANSUNG_RELOAD_SWEET_MAX,
  BANSUNG_ACTIVE_ENERGY_BONUS,
  BANSUNG_AIM_STEPS,
  BANSUNG_MOB_IDS,
  BANSUNG_ARENA_W,
  BANSUNG_ARENA_H,
  BANSUNG_MAP_W,
  BANSUNG_MAP_H,
  BANSUNG_PLAYER_FIELDS,
  BANSUNG_GACHA_SKILL_MAP,
  BANSUNG_WEAPONS,
  BANSUNG_GADGETS,
  resolveBansungGameMode,
} = S;

const VIEW_HALF_W = 860;
const VIEW_HALF_H = 540;
const noHooks = { tick() {}, changed() {} };

function makeMemoryStore() {
  return {
    kind: 'local',
    content: '{"version":1,"accounts":{}}',
    version: '0',
    async read() {
      return { content: this.content, version: this.version };
    },
    async write(content, expectedVersion) {
      assert.equal(expectedVersion, this.version);
      this.content = content;
      this.version = String(Number(this.version) + 1);
      return this.version;
    },
  };
}

function disposeAllRooms(rooms) {
  for (const game of [...rooms.rooms.values()]) {
    game.dispose();
    rooms.rooms.delete(game.code);
  }
  for (const timer of rooms.payoutRetry.values()) {
    clearTimeout(timer);
  }
  rooms.payoutRetry.clear();
}

async function createServiceHarness(t) {
  const store = makeMemoryStore();
  const db = new DbService(store);
  await db.onModuleInit();
  const accounts = new AccountsService(db);
  const rooms = new RoomsService(accounts);
  const emitSink = { emit() {} };
  emitSink.volatile = emitSink;
  rooms.bind({
    to: () => emitSink,
    in: () => ({ fetchSockets: async () => [] }),
  });
  if (t) {
    t.after(() => {
      disposeAllRooms(rooms);
    });
  }
  return { db, accounts, rooms };
}

function nextSocketEvent(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, timeoutMs);
    const handler = (payload) => {
      try {
        if (predicate(payload)) {
          cleanup();
          resolve(payload);
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };
    function cleanup() {
      clearTimeout(timer);
      socket.off(event, handler);
    }
    socket.on(event, handler);
  });
}

function requestAck(socket, event, body) {
  return socket.timeout(5000).emitWithAck(event, ...(body === undefined ? [] : [body]));
}

async function connectSocket(baseUrl, auth, clients) {
  const socket = io(baseUrl, {
    auth,
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(socket);
  await nextSocketEvent(socket, 'connect');
  return socket;
}

function rawHttpRequest(port, reqPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            bodyBuffer: buf,
            body: buf.toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function makeTempDir(t, prefix = 'bansung-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function makeMockRes() {
  return {
    statusCode: 200,
    jsonBody: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

async function runGuard(req, rootDir) {
  const res = makeMockRes();
  let calledNext = false;
  await guardBanSungStaticRequest(
    req,
    res,
    () => {
      calledNext = true;
    },
    rootDir,
  );
  return {
    calledNext,
    status: res.statusCode,
    body: res.jsonBody,
  };
}

function makeGameWithPlayers(playerDefs, config = {}, bet = 0) {
  let changedCalls = 0;
  let frameCalls = 0;
  const hooks = {
    changed: () => {
      changedCalls += 1;
    },
    bansungFrame: () => {
      frameCalls += 1;
    },
  };
  const game = new Game('BS01', hooks, undefined, 'bansung');
  game.addPlayer(playerDefs[0].id, playerDefs[0].name);
  for (let i = 1; i < playerDefs.length; i += 1) {
    game.addPlayer(playerDefs[i].id, playerDefs[i].name);
  }
  game.setBansungConfig(playerDefs[0].id, {
    biome: 'desert',
    difficulty: 'normal',
    bots: 0,
    botLevel: 'normal',
    reviveMode: 'coop',
    ...config,
  });
  for (const def of playerDefs) {
    if (def.heroId) {
      game.setBansungHero(def.id, { heroId: def.heroId });
    }
  }
  if (bet > 0) {
    game.setBet(playerDefs[0].id, bet);
  }
  for (let i = 1; i < playerDefs.length; i += 1) {
    game.setReady(playerDefs[i].id, true, game.rulesVersion);
  }
  game.start(playerDefs[0].id);
  return {
    game,
    get changedCalls() {
      return changedCalls;
    },
    get frameCalls() {
      return frameCalls;
    },
  };
}

function forceWorldVictory(world) {
  world.mobMgr.mobs.length = 0;
  world.mobMgr.mobById.clear();
  world.mobMgr.mobByNumId.clear();
  world.director.wave = 10;
  world.director.wavesCleared = 9;
  world.director.phase = 'cleanup';
  world.director.phaseTimer = 0;
  world.director.budget = 0;
  world.director.spawnTelegraphs.length = 0;
  world.director.portalGates.length = 0;
  world.director.artilleryStrikes.length = 0;
  world.director.beaconState.active = false;
  world.step();
}

function forceWorldDefeat(world) {
  for (const p of world.players) {
    p.alive = false;
    p.downed = false;
    p.life = 'dead';
    p.hp = 0;
  }
  world.step();
}

// ============================================================================
// 1. Game / RoomsService lifecycle & real Socket.IO bansung flow
// ============================================================================

test('1a. normalizeGameMode & Game bansung lobby/config/hero/start/dispose lifecycle', (t) => {
  assert.equal(normalizeGameMode('ban_sung'), 'bansung');
  assert.equal(normalizeGameMode('  bansung  '), 'bansung');
  assert.equal(normalizeGameMode('unknown_mode'), undefined);
  assert.equal(GAME_MODES.bansung.minPlayers, 1);
  assert.equal(GAME_MODES.bansung.maxPlayers, 4);

  const game = new Game('LOBBY1', noHooks, undefined, 'bansung');
  t.after(() => game.dispose());
  game.addPlayer('host-1', 'Host');
  game.addPlayer('ally-2', 'Ally');
  game.addSpectator('spec-3', 'Spectator');

  assert.throws(() => game.setBansungConfig('ally-2', { biome: 'cyber' }), GameError);
  assert.throws(() => game.setBansungHero('spec-3', { heroId: 'pyro' }), GameError);
  assert.throws(() => game.setBansungHero('ally-2', { heroId: 'not_a_hero' }), GameError);

  game.setReady('ally-2', true, game.rulesVersion);
  assert.equal(game.viewFor('host-1').players.find((p) => p.id === 'ally-2').ready, true);
  const prevVersion = game.rulesVersion;

  game.setBansungConfig('host-1', {
    biome: 'cyber',
    difficulty: 'hell',
    bots: 4,
    botLevel: 'hard',
    reviveMode: 'circle',
    endless: true,
  });
  assert.equal(game.rulesVersion, prevVersion + 1);
  assert.equal(game.viewFor('host-1').players.find((p) => p.id === 'ally-2').ready, false);

  game.setBansungHero('host-1', { heroId: 'ranger' });
  game.setBansungHero('ally-2', 'pyro');
  assert.throws(() => game.start('host-1'), GameError);

  game.setReady('ally-2', true, game.rulesVersion);
  game.start('host-1');
  assert.equal(game.phase, 'playing');
  assert.ok(game.bansung);
  // 2 humans + up to BANSUNG_MAX_BOTS (4) = 6 runtime actors
  assert.equal(game.bansung.players.length, 6);
  assert.equal(game.bansung.players.filter((p) => !p.bot).length, 2);
  assert.equal(game.bansung.players.filter((p) => p.bot).length, 4);
  assert.equal(game.bansung.config.biome, 'cyber');
  assert.equal(game.bansung.config.difficulty, 'hell');

  const hostView = game.viewFor('host-1');
  const specView = game.viewFor('spec-3');
  assert.equal(hostView.gameMode, 'bansung');
  assert.equal(hostView.bansung.config.biome, 'cyber');
  assert.equal(hostView.bansung.heroes['host-1'], 'ranger');
  assert.equal(hostView.bansung.heroes['ally-2'], 'pyro');
  assert.equal(hostView.bansung.myIdx, 0);
  assert.equal(specView.bansung.myIdx, undefined);

  game.bansung.stop();
});

test('1b. Real NestJS + Socket.IO bansung:config / bansung:hero / bansung:cmd / bansung:frame flow', { timeout: 20_000 }, async (t) => {
  const store = makeMemoryStore();
  class GatewayTestModule {}
  Module({
    controllers: [AccountController],
    providers: [
      { provide: ACCOUNT_STORE, useValue: store },
      DbService,
      AccountsService,
      RoomsService,
      GameGateway,
    ],
  })(GatewayTestModule);

  const app = await NestFactory.create(GatewayTestModule, { logger: false, abortOnError: false });
  const clients = [];
  t.after(async () => {
    for (const c of clients) {
      try {
        c.disconnect();
      } catch {
        // Ignore already closed socket
      }
    }
    try {
      disposeAllRooms(app.get(RoomsService));
    } catch {
      // Ignore uninitialized
    }
    await app.close();
  });

  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const accounts = app.get(AccountsService);
  const regHost = await accounts.register('bs_host_001', 'BsHost', '1234');
  const regAlly = await accounts.register('bs_ally_002', 'BsAlly', '1234');
  const regSpec = await accounts.register('bs_spec_003', 'BsSpec', '1234');

  const hostSock = await connectSocket(baseUrl, { playerId: 'bs_host_001', name: 'BsHost', token: regHost.token }, clients);
  const allySock = await connectSocket(baseUrl, { playerId: 'bs_ally_002', name: 'BsAlly', token: regAlly.token }, clients);
  const specSock = await connectSocket(baseUrl, { playerId: 'bs_spec_003', name: 'BsSpec', token: regSpec.token }, clients);

  const hostCreatedP = nextSocketEvent(hostSock, 'state', (s) => s && s.gameMode === 'bansung' && s.phase === 'lobby');
  const createAck = await requestAck(hostSock, 'room:create', { gameMode: 'ban_sung' });
  assert.equal(createAck.ok, true);
  const createdState = await hostCreatedP;
  const code = createdState.code;
  assert.ok(code);

  const allyJoinedP = nextSocketEvent(allySock, 'state', (s) => s && s.code === code && s.players.length === 2);
  assert.equal((await requestAck(allySock, 'room:join', { code })).ok, true);
  await allyJoinedP;

  const specWatchP = nextSocketEvent(specSock, 'state', (s) => s && s.code === code && s.spectators.length === 1);
  assert.equal((await requestAck(specSock, 'room:watch', { code })).ok, true);
  await specWatchP;

  // Non-host rejected on bansung:config; spectator rejected on bansung:hero
  const nonHostCfg = await requestAck(allySock, 'bansung:config', { biome: 'cyber' });
  assert.equal(nonHostCfg.ok, false);
  const specHero = await requestAck(specSock, BANSUNG_EVT_HERO, { heroId: 'knight' });
  assert.equal(specHero.ok, false);

  // Both wrapped `{ config }` and unwrapped config payloads accepted by gateway
  const cfgWrapP = nextSocketEvent(hostSock, 'state', (s) => s && s.bansung?.config?.biome === 'crypt' && s.bansung?.config?.difficulty === 'hard');
  assert.equal(
    (await requestAck(hostSock, 'bansung:config', {
      config: { biome: 'crypt', difficulty: 'hard', bots: 1, botLevel: 'normal', reviveMode: 'coop' },
    })).ok,
    true,
  );
  await cfgWrapP;

  const cfgFlatP = nextSocketEvent(hostSock, 'state', (s) => s && s.bansung?.config?.biome === 'cyber' && s.bansung?.config?.reviveMode === 'circle');
  assert.equal(
    (await requestAck(hostSock, 'bansung:config', {
      biome: 'cyber',
      difficulty: 'normal',
      bots: 0,
      botLevel: 'normal',
      reviveMode: 'circle',
    })).ok,
    true,
  );
  await cfgFlatP;

  // Pre-game bansung:cmd must be rejected while in lobby
  const preCmd = await requestAck(hostSock, BANSUNG_EVT_CMD, { t: 'in', seq: 1, mx: 100, my: 0, aim: 0, fire: 0 });
  assert.equal(preCmd.ok, false);

  assert.equal((await requestAck(hostSock, BANSUNG_EVT_HERO, { heroId: 'ranger' })).ok, true);
  const allyHeroP = nextSocketEvent(allySock, 'state', (s) => s && s.bansung?.heroes?.bs_ally_002 === 'pyro');
  assert.equal((await requestAck(allySock, BANSUNG_EVT_HERO, { heroId: 'pyro' })).ok, true);
  await allyHeroP;

  const betP = nextSocketEvent(allySock, 'state', (s) => s && s.bet === 100);
  assert.equal((await requestAck(hostSock, 'room:bet', { amount: 100 })).ok, true);
  const betState = await betP;

  const readyP = nextSocketEvent(hostSock, 'state', (s) => s && s.players.every((p) => p.isHost || p.ready));
  assert.equal((await requestAck(allySock, 'room:ready', { ready: true, rulesVersion: betState.rulesVersion })).ok, true);
  await readyP;

  // Start match -> verify coins deducted and each client receives personalized bansung:frame
  const hostFrameP = nextSocketEvent(hostSock, BANSUNG_EVT_FRAME, (f) => f && f.me && f.me.slots?.length > 0);
  const allyFrameP = nextSocketEvent(allySock, BANSUNG_EVT_FRAME, (f) => f && f.me && f.me.slots?.length > 0);
  const specFrameP = nextSocketEvent(specSock, BANSUNG_EVT_FRAME, (f) => f && Array.isArray(f.p) && f.me === undefined);
  assert.equal((await requestAck(hostSock, 'game:start')).ok, true);

  const [hostFrame0, allyFrame0, specFrame0] = await Promise.all([hostFrameP, allyFrameP, specFrameP]);
  assert.equal(accounts.get('bs_host_001').coins, START_COINS - 100);
  assert.equal(accounts.get('bs_ally_002').coins, START_COINS - 100);
  assert.equal(accounts.get('bs_spec_003').coins, START_COINS);
  assert.equal(hostFrame0.me.slots[0].id, 'pistol');
  assert.notEqual(allyFrame0.me.slots[1].id, hostFrame0.me.slots[1].id);
  assert.equal(specFrame0.me, undefined);

  // Malformed socket command rejected
  const badSockCmd = await requestAck(hostSock, BANSUNG_EVT_CMD, { nope: true });
  assert.equal(badSockCmd.ok, false);

  // Valid movement command produces acknowledged sequence & position advance on streamed frame
  const startX = hostFrame0.p[1];
  const ackedFrameP = nextSocketEvent(
    hostSock,
    BANSUNG_EVT_FRAME,
    (f) => f && f.me && f.me.lastAckSeq === 42 && f.p[1] > startX,
  );
  assert.equal(
    (await requestAck(hostSock, BANSUNG_EVT_CMD, { t: 'in', seq: 42, mx: 100, my: 0, aim: 512, fire: 1 })).ok,
    true,
  );
  const ackedFrame = await ackedFrameP;
  assert.equal(ackedFrame.me.lastAckSeq, 42);
  assert.ok(ackedFrame.p[1] > startX);

  // Ally leaves -> Game.eliminate triggers world.resign('bs_ally_002')
  assert.equal((await requestAck(allySock, 'room:leave')).ok, true);
  const rooms = app.get(RoomsService);
  const liveGame = rooms.roomOf('bs_host_001');
  assert.ok(liveGame && liveGame.bansung);
  const allyRuntime = liveGame.bansung.players.find((p) => p.id === 'bs_ally_002');
  assert.equal(allyRuntime.left, true);
  assert.equal(allyRuntime.alive, false);

  // Host leaves -> team wipe / all resigned ends match cleanly
  assert.equal((await requestAck(hostSock, 'room:leave')).ok, true);
  assert.equal(liveGame.phase, 'ended');
});

// ============================================================================
// 2. BansungWorld 30Hz tick budget, 64px viewport culling & <12KB/s budget
// ============================================================================

test('2a. BansungWorld 30Hz step budget stays below 33.33ms/tick under 4 players + 45 mobs and updates non-vacuous stepTimeEmaMs', async (t) => {
  const players = [
    { id: 'p0', name: 'P0', hero: 'mascot' },
    { id: 'p1', name: 'P1', hero: 'ranger' },
    { id: 'p2', name: 'P2', hero: 'pyro' },
    { id: 'p3', name: 'P3', hero: 'knight' },
  ];
  const w = new BansungWorld(players, { bots: 0, biome: 'desert', difficulty: 'hard' }, noHooks, {
    seed: 101,
    skipWarmup: true,
  });
  t.after(() => w.stop());

  w.step();
  w.director.phase = 'spawning';
  w.director.wave = 5;
  w.director.budget = 0;

  const kinds = BANSUNG_MOB_IDS;
  for (let i = 0; i < 45; i += 1) {
    const x = 180 + (i % 9) * 210;
    const y = 180 + Math.floor(i / 9) * 210;
    spawnMob(w.mobMgr, { id: `bench_${i}`, kind: kinds[i % kinds.length], x, y, playerCount: 4, wave: 5, difficulty: 'hard' });
  }

  // Brief warmup so V8 JIT stabilizes before collecting steady step timings
  for (let i = 1; i <= 5; i += 1) {
    w.step();
    w.clearPendingFx();
  }

  const budgetPerTickMs = 1000 / 30;
  const ticks = 120; // 4.0s at 30Hz -> real-time budget is 4000ms
  const tickTimes = [];
  const t0 = performance.now();
  for (let i = 1; i <= ticks; i += 1) {
    const tickStart = performance.now();
    w.enqueueCommand('p0', { t: 'in', seq: i, mx: (i % 2 === 0 ? 100 : -100), my: 0, aim: (i * 64) % BANSUNG_AIM_STEPS, fire: 1 }, { nowMs: 1000 + i * 33 });
    w.enqueueCommand('p1', { t: 'in', seq: i, mx: 0, my: (i % 3 === 0 ? 100 : -100), aim: (i * 96) % BANSUNG_AIM_STEPS, fire: 1 }, { nowMs: 1000 + i * 33 });
    w.step();
    for (const p of players) {
      w.frameFor(p.id);
    }
    w.clearPendingFx();
    tickTimes.push(performance.now() - tickStart);
  }
  const elapsedMs = performance.now() - t0;
  const avgMs = elapsedMs / ticks;
  tickTimes.sort((a, b) => a - b);
  const medianMs = tickTimes[Math.floor(ticks / 2)];

  assert.equal(w.tickNo, ticks + 6);
  assert.ok(elapsedMs < ticks * budgetPerTickMs, `120 ticks + 480 frames exceeded 30Hz budget (${(ticks * budgetPerTickMs).toFixed(1)}ms): ${elapsedMs.toFixed(2)}ms`);
  assert.ok(avgMs < budgetPerTickMs, `avg tick exceeded 30Hz limit 33.33ms: ${avgMs.toFixed(2)}ms`);
  assert.ok(medianMs < 20, `median tick exceeded 20ms under 4 players + 45 mobs: ${medianMs.toFixed(2)}ms`);

  // Drive real 30Hz clock interval briefly to verify pumpClock updates non-vacuous stepTimeEmaMs > 0
  const ticksBeforeClock = w.tickNo;
  w.start();
  for (let wait = 0; wait < 40 && (w.stepTimeEmaMs <= 0 || w.tickNo <= ticksBeforeClock); wait += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  w.stop();
  assert.ok(w.tickNo > ticksBeforeClock, 'real interval clock must advance world ticks');
  assert.ok(
    Number.isFinite(w.stepTimeEmaMs) && w.stepTimeEmaMs > 0 && w.stepTimeEmaMs < budgetPerTickMs,
    `stepTimeEmaMs must be > 0 and < 33.33ms after real clock ticks, got ${w.stepTimeEmaMs}`,
  );
});

test('2b. 64px-bucket viewport culling ([cx+-860, cy+-540]) incl. SE 4224x2688 quadrant, e/b/fx hard caps & spec camera switch', (t) => {
  const w = new BansungWorld(
    [
      { id: 'p0', name: 'Near0', hero: 'mascot' },
      { id: 'p1', name: 'Far1', hero: 'ranger' },
      { id: 'p2', name: 'SE2', hero: 'pyro' },
    ],
    { bots: 0 },
    noHooks,
    { seed: 202, skipWarmup: true },
  );
  t.after(() => w.stop());

  assert.equal(w.W, BANSUNG_MAP_W);
  assert.equal(w.H, BANSUNG_MAP_H);

  w.director.phase = 'cleanup';
  w.director.wave = 2;
  w.director.budget = 0;

  // Place p0 (NW), p1 (mid) and p2 (SE quadrant x > 2112, y > 1344) in completely disjoint viewports
  w.players[0].x = 160;
  w.players[0].y = 160;
  w.players[1].x = 1950;
  w.players[1].y = 1180;
  w.players[2].x = 3820;
  w.players[2].y = 2360;

  const p0Mobs = 10;
  const p1Mobs = 72; // Exceeds 64-enemy per-frame cap inside p1's viewport!
  const p2Mobs = 8; // SE quadrant cluster
  for (let i = 0; i < p0Mobs; i += 1) {
    spawnMob(w.mobMgr, {
      id: `p0_m_${i}`,
      kind: 'scarab',
      x: 120 + (i % 5) * 35,
      y: 120 + Math.floor(i / 5) * 35,
      playerCount: 3,
      wave: 2,
      difficulty: 'normal',
    });
  }
  for (let i = 0; i < p1Mobs; i += 1) {
    spawnMob(w.mobMgr, {
      id: `p1_m_${i}`,
      kind: 'scarab',
      x: 1700 + (i % 9) * 32,
      y: 920 + Math.floor(i / 9) * 32,
      playerCount: 3,
      wave: 2,
      difficulty: 'normal',
    });
  }
  for (let i = 0; i < p2Mobs; i += 1) {
    spawnMob(w.mobMgr, {
      id: `p2_se_m_${i}`,
      kind: 'scarab',
      x: 3760 + (i % 4) * 35,
      y: 2300 + Math.floor(i / 4) * 35,
      playerCount: 3,
      wave: 2,
      difficulty: 'normal',
    });
  }

  // Also inject >96 bullets inside p1's viewport and 12 SE bullets inside p2's viewport
  for (let i = 0; i < 110; i += 1) {
    w.bulletPool.spawn({
      kind: 'kinetic_sm',
      team: 0,
      ownerId: 'p1',
      ownerIdx: 1,
      weaponId: 'pistol',
      x: 1960 + (i % 10) * 6,
      y: 1200 + Math.floor(i / 10) * 6,
      vx: 0,
      vy: 0,
      radius: 4,
      baseDmg: 5,
      ttlTicks: 30,
    });
  }
  for (let i = 0; i < 12; i += 1) {
    w.bulletPool.spawn({
      kind: 'kinetic_sm',
      team: 0,
      ownerId: 'p2',
      ownerIdx: 2,
      weaponId: 'pistol',
      x: 3840 + (i % 4) * 8,
      y: 2360 + Math.floor(i / 4) * 8,
      vx: 0,
      vy: 0,
      radius: 4,
      baseDmg: 5,
      ttlTicks: 30,
    });
  }
  w.step();

  // Emit >48 spatially-culled FX_DMG events near p0 first, plus 10 SE quadrant FX_DMG near p2
  for (let i = 0; i < 60; i += 1) {
    w.fx.push(FX_DMG, 160 + (i % 8) * 10, 160, 10, 0, 0);
  }
  for (let i = 0; i < 10; i += 1) {
    w.fx.push(FX_DMG, 3810 + (i % 5) * 12, 2360, 10, 0, 0);
  }

  const f0 = w.frameFor('p0');
  const f1 = w.frameFor('p1');
  const f2 = w.frameFor('p2');

  assert.equal(f0.e.length / BANSUNG_ENEMY_FIELDS, p0Mobs);
  for (let i = 0; i < f0.e.length; i += BANSUNG_ENEMY_FIELDS) {
    assert.ok(Math.abs(f0.e[i + 2] - w.players[0].x) <= VIEW_HALF_W + 64);
    assert.ok(Math.abs(f0.e[i + 3] - w.players[0].y) <= VIEW_HALF_H + 64);
  }

  assert.equal(f1.e.length / BANSUNG_ENEMY_FIELDS, 64, 'Per-frame enemy array must cap at 64');
  for (let i = 0; i < f1.e.length; i += BANSUNG_ENEMY_FIELDS) {
    assert.ok(f1.e[i + 2] >= 1000 && f1.e[i + 2] < 3000, 'Disjoint NW & SE mobs must be culled from p1 viewport');
  }

  assert.equal(f2.e.length / BANSUNG_ENEMY_FIELDS, p2Mobs, 'SE quadrant viewer must receive exact SE mobs');
  for (let i = 0; i < f2.e.length; i += BANSUNG_ENEMY_FIELDS) {
    assert.ok(f2.e[i + 2] >= 3500 && f2.e[i + 3] >= 2100, 'SE viewport must include SE mobs and cull NW/mid mobs');
  }

  assert.equal(f1.b.length / BANSUNG_BULLET_FIELDS, 96, 'Bullets must cap at 96');
  assert.ok(!f0.b || f0.b.length === 0, 'Far p1/p2 bullets must be culled from p0 viewport');
  assert.equal(f2.b.length / BANSUNG_BULLET_FIELDS, 12, 'SE viewport must keep only its 12 SE bullets');
  assert.equal(f0.fx.length / BANSUNG_FX_FIELDS, 48, 'FX must cap at 48');
  assert.equal(f2.fx.length / BANSUNG_FX_FIELDS, 10, 'SE viewport must receive its 10 SE FX while culling NW FX');

  // Verify dead player switching spectator target moves viewport bucket query to p1 and SE p2
  w.clearPendingFx();
  w.players[0].life = 'dead';
  w.players[0].alive = false;
  w.players[0].downed = false;
  assert.equal(w.enqueueCommand('p0', { t: 'spec', targetIdx: 1 }, { nowMs: 5000 }).ok, true);
  w.step();

  const f0SpecP1 = w.frameFor('p0');
  assert.equal(f0SpecP1.e.length / BANSUNG_ENEMY_FIELDS, 64);
  assert.ok(f0SpecP1.e[2] >= 1000 && f0SpecP1.e[2] < 3000);

  assert.equal(w.enqueueCommand('p0', { t: 'spec', targetIdx: 2 }, { nowMs: 5100 }).ok, true);
  w.step();
  const f0SpecSE = w.frameFor('p0');
  assert.equal(f0SpecSE.e.length / BANSUNG_ENEMY_FIELDS, p2Mobs);
  assert.ok(f0SpecSE.e[2] >= 3500 && f0SpecSE.e[3] >= 2100);
});

test('2c. Delta omission (pr/pk) & <12KB/s steady payload budget over 90 ticks (3.0s @ 30Hz)', (t) => {
  const w = new BansungWorld(
    [
      { id: 'p0', name: 'P0', heroId: 'mascot' },
      { id: 'p1', name: 'P1', heroId: 'ranger' },
      { id: 'p2', name: 'P2', heroId: 'pyro' },
      { id: 'p3', name: 'P3', heroId: 'knight' },
    ],
    { bots: 0 },
    noHooks,
    { seed: 303, skipWarmup: true },
  );
  t.after(() => w.stop());

  w.director.phase = 'cleanup';
  w.director.wave = 1;
  w.director.budget = 0;

  w.players[0].x = 160;
  w.players[0].y = 160;
  w.players[1].x = 1950;
  w.players[1].y = 1180;
  for (let i = 0; i < 40; i += 1) {
    spawnMob(w.mobMgr, {
      id: `far_${i}`,
      kind: 'scarab',
      x: 1840 + (i % 8) * 28,
      y: 1020 + Math.floor(i / 8) * 28,
      playerCount: 4,
      wave: 1,
      difficulty: 'normal',
    });
  }

  const initialFrame = w.frameFor('p0');
  assert.ok(Array.isArray(initialFrame.pr) && initialFrame.pr.length > 0);
  const initialBytes = Buffer.byteLength(JSON.stringify(initialFrame), 'utf8');

  let publicJsonBytes = 0;
  let playerJsonBytes = 0;
  let playerDeflateBytes = 0;
  let prEmittedOnSteady = 0;

  const steadyTicks = 90;
  for (let i = 1; i <= steadyTicks; i += 1) {
    if (i % 3 === 0) {
      w.enqueueCommand('p0', { t: 'in', seq: i, mx: i % 6 === 0 ? 100 : -100, my: 0, aim: (i * 17) % BANSUNG_AIM_STEPS, fire: 0 }, { nowMs: 1000 + i * 33 });
    }
    w.step();
    const pubJson = JSON.stringify(w.frameFor(undefined));
    const p0Frame = w.frameFor('p0');
    const p0Json = JSON.stringify(p0Frame);
    const p0Deflate = zlib.deflateRawSync(p0Json);

    if (p0Frame.pr !== undefined) prEmittedOnSteady += 1;
    publicJsonBytes += Buffer.byteLength(pubJson, 'utf8');
    playerJsonBytes += Buffer.byteLength(p0Json, 'utf8');
    playerDeflateBytes += p0Deflate.byteLength;
    w.clearPendingFx();
  }

  const avgPlayerJson = playerJsonBytes / steadyTicks;
  const publicRateBps = (publicJsonBytes / steadyTicks) * 30;
  const playerDeflateRateBps = (playerDeflateBytes / steadyTicks) * 30;

  assert.equal(prEmittedOnSteady, 0, 'Static props (pr) must not re-transmit on steady ticks');
  assert.ok(avgPlayerJson < initialBytes, `Steady frame (${avgPlayerJson.toFixed(1)}B) must be smaller than initial (${initialBytes}B)`);
  assert.ok(publicRateBps < 12 * 1024, `Public raw JSON rate ${publicRateBps.toFixed(1)} B/s must be < 12KB/s`);
  assert.ok(playerDeflateRateBps < 12 * 1024, `Player compressed rate ${playerDeflateRateBps.toFixed(1)} B/s must be < 12KB/s`);

  // Verify culled viewport saves bandwidth vs unculled dense viewport with the same 40 mobs
  const culledBytes = Buffer.byteLength(JSON.stringify(w.frameFor('p0')), 'utf8');
  const unculledBytes = Buffer.byteLength(JSON.stringify(w.frameFor('p1')), 'utf8');
  assert.ok(culledBytes < unculledBytes, `Culled frame (${culledBytes}B) must be strictly smaller than dense viewport (${unculledBytes}B)`);
});

test('2d. frame.hz (hazards), frame.tg (telegraphs) & frame.pets (alive human pets + viewport culling)', (t) => {
  const w = new BansungWorld(
    [
      { id: 'p0', name: 'HumanNW', hero: 'mascot' },
      { id: 'p1', name: 'HumanSE', hero: 'ranger' },
      { id: 'p2', name: 'DeadPetNW', hero: 'pyro' },
      { id: 'bot:0', name: 'BotNW', hero: 'tank', bot: true },
    ],
    { bots: 1, biome: 'desert', difficulty: 'normal', gameMode: 'survival' },
    noHooks,
    { seed: 304, skipWarmup: true },
  );
  t.after(() => w.stop());
  w.step();
  w.director.phase = 'cleanup';
  w.director.budget = 0;

  const p0 = w.players.find((p) => p.id === 'p0');
  const p1 = w.players.find((p) => p.id === 'p1');
  const p2 = w.players.find((p) => p.id === 'p2');
  const bot = w.players.find((p) => p.bot);
  assert.ok(p0 && p1 && p2 && bot);

  const findClearLosRow = (baseX, startY, dxMob) => {
    const isSpotClear = (cx, cy) =>
      !w.arena.obsGrid.obstacles.some((o) => o.kind !== 'pit' && Math.hypot(cx - o.x, cy - o.y) < o.r + 32);
    for (let dy = 0; dy <= 520; dy += 60) {
      for (const sgn of dy === 0 ? [1] : [1, -1]) {
        const y = Math.max(180, Math.min(BANSUNG_MAP_H - 180, startY + dy * sgn));
        if (
          isSpotClear(baseX, y) &&
          isSpotClear(baseX + dxMob, y) &&
          isSpotClear(baseX + dxMob + 60, y + 20) &&
          hasLineOfSight(w.arena.obsGrid, baseX, y, baseX + dxMob, y, 'bullet') &&
          hasLineOfSight(w.arena.obsGrid, baseX, y, baseX + dxMob + 60, y + 20, 'los')
        ) {
          return y;
        }
      }
    }
    return startY;
  };

  const nwY = findClearLosRow(420, 420, 200);
  const seY = findClearLosRow(3760, 2280, -200);

  p0.x = 420;
  p0.y = nwY;
  p0.pet.x = 445;
  p0.pet.y = nwY;
  p0.petAlive = true;

  p1.x = 3760;
  p1.y = seY;
  p1.pet.x = 3785;
  p1.pet.y = seY;
  p1.petAlive = true;

  p2.x = 460;
  p2.y = nwY + 30;
  p2.pet.x = 470;
  p2.pet.y = nwY + 30;
  p2.petAlive = false;

  bot.x = 490;
  bot.y = nwY + 20;
  bot.pet.x = 500;
  bot.pet.y = nwY + 20;
  bot.petAlive = true;

  // Spawn pyro_shaman + laser_sniper near NW p0 AND in SE quadrant near p1 with high HP so bot stays alive without killing casters
  const nwPyro = spawnMob(w.mobMgr, { id: 'nw_pyro', kind: 'pyro_shaman', x: 620, y: nwY, playerCount: 4, wave: 2, difficulty: 'normal' });
  const nwSniper = spawnMob(w.mobMgr, { id: 'nw_sniper', kind: 'laser_sniper', x: 680, y: nwY + 20, playerCount: 4, wave: 2, difficulty: 'normal' });
  const sePyro = spawnMob(w.mobMgr, { id: 'se_pyro', kind: 'pyro_shaman', x: 3560, y: seY, playerCount: 4, wave: 2, difficulty: 'normal' });
  const seSniper = spawnMob(w.mobMgr, { id: 'se_sniper', kind: 'laser_sniper', x: 3500, y: seY + 20, playerCount: 4, wave: 2, difficulty: 'normal' });
  for (const m of [nwPyro, nwSniper, sePyro, seSniper]) {
    m.hp = 2000;
    m.maxHp = 2000;
  }

  let f0HzSnap = null;
  let f1HzSnap = null;
  let f0TgSnap = null;
  let f1TgSnap = null;
  for (let tick = 0; tick < 150; tick += 1) {
    for (const p of w.players) p.invulnTimer = 5;
    w.step();
    const f0 = w.frameFor('p0');
    const f1 = w.frameFor('p1');
    const hz0 = f0.hz ?? [];
    const hz1 = f1.hz ?? [];
    const tg0 = f0.tg ?? [];
    const tg1 = f1.tg ?? [];
    if (!f0HzSnap && hz0.length > 0 && hz1.length > 0) {
      f0HzSnap = f0;
      f1HzSnap = f1;
    }
    if (!f0TgSnap && tg0.length > 0 && tg1.length > 0) {
      f0TgSnap = f0;
      f1TgSnap = f1;
    }
    if (f0HzSnap && f0TgSnap) break;
  }
  assert.ok(f0HzSnap && f1HzSnap, 'pyro_shaman fire_pool hazards must appear in frame.hz for NW & SE viewers');
  assert.ok(f0TgSnap && f1TgSnap, 'laser_sniper telegraphs must appear in frame.tg for NW & SE viewers');

  // frame.hz culling check
  assert.ok(f0HzSnap.hz.every((h) => h.x < 1800 && h.kind === 'fire_pool' && h.r > 0));
  assert.ok(f1HzSnap.hz.every((h) => h.x > 2600 && h.kind === 'fire_pool' && h.r > 0));

  // frame.tg culling check
  assert.ok(f0TgSnap.tg.every((g) => g.x1 < 2000 && g.r > 0));
  assert.ok(f1TgSnap.tg.every((g) => g.x1 > 2400 && g.r > 0));

  // frame.pets: alive human pets only, culled by viewport (dead p2 & bot excluded!)
  assert.ok(Array.isArray(f0HzSnap.pets) && f0HzSnap.pets.length === 1);
  assert.equal(f0HzSnap.pets[0].ownerId, p0.idx);
  assert.ok(Array.isArray(f0HzSnap.pets[0].tuple) && f0HzSnap.pets[0].tuple.length >= 4);

  assert.ok(Array.isArray(f1HzSnap.pets) && f1HzSnap.pets.length === 1);
  assert.equal(f1HzSnap.pets[0].ownerId, p1.idx);
  assert.ok(f1HzSnap.pets[0].tuple[0] > 3000 && f1HzSnap.pets[0].tuple[1] > 1500);
});

// ============================================================================
// 3. Anti-cheat rate limits, invalid inputs, cooldowns & atomic locks
// ============================================================================

test('3a. Object / JSON byte budget / prototype pollution / hero & config validation', () => {
  assert.equal(sec.isSafePlainObject(null), false);
  assert.equal(sec.isSafePlainObject([]), false);
  assert.equal(sec.isSafePlainObject(JSON.parse('{"__proto__":{"polluted":true}}')), false);
  assert.equal(sec.isSafePlainObject({ constructor: {} }), false);
  assert.equal(sec.isSafePlainObject({ prototype: {} }), false);
  assert.equal(sec.isSafePlainObject({ k1: 1, k2: 2, k3: 3, k4: 4, k5: 5, k6: 6, k7: 7, k8: 8, k9: 9 }, 8), false);
  assert.equal(sec.isSafePlainObject({ t: 'reload' }, 8), true);

  assert.equal(sec.isWithinJsonByteBudget({ a: 'x'.repeat(600) }, sec.BANSUNG_SEC_LIMITS.MAX_CMD_JSON_BYTES), false);
  assert.equal(sec.isWithinJsonByteBudget({ a: 'x'.repeat(1100) }, sec.BANSUNG_SEC_LIMITS.MAX_CONFIG_JSON_BYTES), false);
  const circular = {};
  circular.self = circular;
  assert.equal(sec.isWithinJsonByteBudget(circular, 512), false);

  assert.equal(sec.validateBansungCommand({ t: 'perk', id: 'x'.repeat(49) }).ok, false);
  assert.equal(sec.validateBansungCommand({ t: 'perk', id: 'nonexistent_perk_id' }).ok, false);
  assert.equal(sec.validateBansungCommand({ t: 'cheat_kill_all' }).reason, 'unknown_command');
  assert.equal(sec.validateBansungCommand({}).reason, 'missing_type');

  assert.equal(sec.validateBansungHero({ heroId: 'pyro' }).ok, true);
  assert.equal(sec.validateBansungHero('knight').ok, true);
  assert.equal(sec.validateBansungHero({ heroId: 'invalid' }).ok, false);
  assert.equal(sec.validateBansungHero(JSON.parse('{"heroId":"pyro","__proto__":{"x":1}}')).ok, false);

  assert.equal(sec.validateBansungConfig(JSON.parse('{"biome":"desert","__proto__":{"x":1}}'), 1).ok, false);
  const tooWideCfg = {};
  for (let i = 0; i <= sec.BANSUNG_SEC_LIMITS.MAX_CONFIG_KEYS; i += 1) tooWideCfg[`k${i}`] = i;
  assert.equal(sec.validateBansungConfig(tooWideCfg, 1).reason, 'invalid_config_object');
  const fallbackCfg = sec.validateBansungConfig({ biome: 'volcano' }, 1);
  assert.equal(fallbackCfg.ok, true);
  assert.equal(fallbackCfg.config.biome, 'desert');
  const clampedCfg = sec.validateBansungConfig({ biome: 'crypt', difficulty: 'hard', bots: 99, botLevel: 'hard', reviveMode: 'hardcore', endless: true }, 1);
  assert.equal(clampedCfg.ok, true);
  assert.equal(clampedCfg.config.bots, 4);
});

test('3b. NaN / Infinity / out-of-range inputs, stale seq & diagonal speed normalization', (t) => {
  // Invalid / non-finite numbers fail closed
  assert.equal(sec.validateBansungCommand({ t: 'in', seq: NaN, mx: 0, my: 0, aim: 0, fire: 0 }).reason, 'non_finite_input');
  assert.equal(sec.validateBansungCommand({ t: 'in', seq: 1, mx: Infinity, my: 0, aim: 0, fire: 0 }).reason, 'non_finite_input');
  assert.equal(sec.validateBansungCommand({ t: 'in', seq: 1, mx: 0, my: 0, aim: -Infinity, fire: 0 }).reason, 'non_finite_input');
  assert.equal(sec.validateBansungCommand({ t: 'in', seq: 1, mx: 0, my: 0, aim: 0, fire: 'yes' }).reason, 'invalid_fire_flag');
  assert.equal(sec.validateBansungCommand({ t: 'slot', idx: -1 }).reason, 'slot_out_of_range');
  assert.equal(sec.validateBansungCommand({ t: 'slot', idx: 5 }).reason, 'slot_out_of_range');
  assert.equal(sec.validateBansungCommand({ t: 'slot', idx: 1.5 }).reason, 'invalid_slot');
  assert.equal(sec.validateBansungCommand({ t: 'ping', kind: 9, x: 10, y: 10 }).reason, 'invalid_ping_kind');
  assert.equal(sec.validateBansungCommand({ t: 'spec', targetIdx: 99 }, { maxPlayers: 4 }).reason, 'spec_out_of_range');

  // Extreme finite ranges clamp safely
  const clampedIn = sec.validateBansungCommand({ t: 'in', seq: 9e15, mx: 9999, my: -9999, aim: 5000, fire: 42 });
  assert.equal(clampedIn.ok, true);
  assert.equal(clampedIn.cmd.seq, sec.BANSUNG_SEC_LIMITS.MAX_SEQ);
  assert.equal(clampedIn.cmd.mx, 100);
  assert.equal(clampedIn.cmd.my, -100);
  assert.equal(clampedIn.cmd.aim, 5000 % BANSUNG_AIM_STEPS);
  assert.equal(clampedIn.cmd.fire, 1);

  const clampedPing = sec.validateBansungCommand({ t: 'ping', kind: 2, x: -500, y: 999999 }, { arenaW: 2112, arenaH: 1344 });
  assert.deepEqual(clampedPing.cmd, { t: 'ping', kind: 2, x: 0, y: 1344 });

  // Stale sequence rejection & diagonal movement normalization in live BansungWorld
  const makeSoloWorld = () => {
    const w = new BansungWorld([{ id: 'p0', name: 'P0', heroId: 'mascot' }], { bots: 0 }, noHooks, {
      seed: 404,
      skipWarmup: true,
    });
    w.director.phase = 'cleanup';
    w.director.budget = 0;
    w.players[0].x = 1056;
    w.players[0].y = 672;
    return w;
  };

  const wCard = makeSoloWorld();
  const wDiag = makeSoloWorld();
  t.after(() => {
    wCard.stop();
    wDiag.stop();
  });

  wCard.enqueueCommand('p0', { t: 'in', seq: 10, mx: 100, my: 0, aim: 0, fire: 0 }, { nowMs: 1000 });
  wCard.step();
  const cardDist = Math.hypot(wCard.players[0].x - 1056, wCard.players[0].y - 672);

  wDiag.enqueueCommand('p0', { t: 'in', seq: 10, mx: 100, my: 100, aim: 0, fire: 0 }, { nowMs: 1000 });
  wDiag.step();
  const diagDist = Math.hypot(wDiag.players[0].x - 1056, wDiag.players[0].y - 672);

  assert.ok(cardDist > 1, 'Hero must move on cardinal input');
  assert.ok(Math.abs(diagDist - cardDist) < 0.05, `Diagonal dist (${diagDist}) must equal cardinal dist (${cardDist})`);

  // Stale seq (< 10) must not overwrite newer movement/aim or regress lastAckSeq
  wCard.enqueueCommand('p0', { t: 'in', seq: 3, mx: -100, my: 0, aim: 2048, fire: 0 }, { nowMs: 1050 });
  wCard.step();
  assert.equal(wCard.players[0].guard.lastAckSeq, 10);
  assert.equal(wCard.players[0].moveDirX, 1);
});

test('3c. BansungRateLimiter token buckets, per-tick cap & 20-violation sliding window kick + GameError', (t) => {
  const rl = new sec.BansungRateLimiter();
  let now = 10_000;

  // 1) Per-tick cap = 8, even when bucket has 45 tokens
  for (let i = 0; i < sec.BANSUNG_SEC_LIMITS.MAX_CMDS_PER_TICK; i += 1) {
    assert.equal(rl.consumeCommandGate('p0', 'in', 1, now).allowed, true);
  }
  const tickCapHit = rl.consumeCommandGate('p0', 'in', 1, now);
  assert.equal(tickCapHit.allowed, false);
  assert.equal(tickCapHit.reason, 'tick_cap');

  // 2) Drain 45-token CMD bucket across distinct ticks within same ms
  rl.reset();
  let tick = 10;
  for (let i = 0; i < sec.BANSUNG_SEC_LIMITS.CMD_BUCKET_CAP; i += 1) {
    if (i > 0 && i % sec.BANSUNG_SEC_LIMITS.MAX_CMDS_PER_TICK === 0) tick += 1;
    assert.equal(rl.consumeCommandGate('p0', 'in', tick, now).allowed, true);
  }
  const drained = rl.consumeCommandGate('p0', 'in', tick + 1, now);
  assert.equal(drained.allowed, false);
  assert.equal(drained.reason, 'rate_limit');

  // Refill after 1000ms restores 35 tokens
  now += 1000;
  assert.equal(rl.consumeCommandGate('p0', 'in', tick + 2, now).allowed, true);

  // 3) Ping bucket cap = 4, refill = 0.5/s (consumeCommandGate ping sub-bucket)
  rl.reset();
  now = 20_000;
  for (let i = 0; i < sec.BANSUNG_SEC_LIMITS.PING_BUCKET_CAP; i += 1) {
    assert.equal(rl.consumeCommandGate('p0', 'ping', 1 + i, now).allowed, true);
  }
  const pingBlocked = rl.consumeCommandGate('p0', 'ping', 6, now);
  assert.equal(pingBlocked.allowed, false);
  assert.equal(pingBlocked.reason, 'rate_limit');

  // +2100ms refills 1 ping token (at 0.5 tokens/s)
  now += 2100;
  assert.equal(rl.consumeCommandGate('p0', 'ping', 7, now).allowed, true);

  // 4) Config bucket: burst 5
  rl.reset();
  for (let i = 0; i < sec.BANSUNG_SEC_LIMITS.CONFIG_BUCKET_CAP; i += 1) {
    assert.equal(rl.consume('p0', 'config', 50_000).allowed, true);
  }
  const cfgBlocked = rl.consume('p0', 'config', 50_000);
  assert.equal(cfgBlocked.allowed, false);
  assert.equal(cfgBlocked.reason, 'rate_limit');

  // 5) Violation sliding window: 19 does not kick, 20th inside 5000ms sets shouldKick; ageing out avoids kick
  rl.reset();
  for (let i = 0; i < sec.BANSUNG_SEC_LIMITS.VIOLATION_KICK_COUNT - 1; i += 1) {
    const v = rl.recordViolation('cheater', 60_000 + i * 10);
    assert.equal(v.shouldKick, false);
  }
  const aged = rl.recordViolation('cheater', 60_000 + sec.BANSUNG_SEC_LIMITS.VIOLATION_WINDOW_MS + 100);
  assert.equal(aged.shouldKick, false, 'Expired violations outside 5000ms window must age out');

  for (let i = 0; i < sec.BANSUNG_SEC_LIMITS.VIOLATION_KICK_COUNT - 1; i += 1) {
    const v = rl.recordViolation('cheater', 70_000 + i * 5);
    assert.equal(v.shouldKick, i === sec.BANSUNG_SEC_LIMITS.VIOLATION_KICK_COUNT - 2);
  }

  // 6) Integration through Game.bansungCommand throws GameError once violation threshold trips
  const { game } = makeGameWithPlayers([{ id: 'p0', name: 'P0', heroId: 'mascot' }]);
  t.after(() => game.dispose());
  game.bansung.stop();
  let kicked = false;
  for (let i = 0; i < 25; i += 1) {
    try {
      game.bansungCommand('p0', { t: 'invalid_cheat' });
    } catch (err) {
      if (err instanceof GameError) {
        kicked = true;
        break;
      }
      throw err;
    }
  }
  assert.equal(kicked, true, 'Game.bansungCommand must throw GameError when kick threshold triggers');
});

test('3d. Life-state restrictions, swap/fire/reload lockouts, interact radius & atomic EntityClaimLock', (t) => {
  // 1) Life-state command matrix
  assert.equal(sec.isCmdAllowedInLifeState('spec', 'alive'), false);
  assert.equal(sec.isCmdAllowedInLifeState('slot', 'alive'), true);
  for (const life of ['downed', 'dead']) {
    for (const cmd of ['dash', 'slot', 'reload', 'gadget', 'use']) {
      assert.equal(sec.isCmdAllowedInLifeState(cmd, life), false);
    }
    for (const cmd of ['in', 'perk', 'ping', 'spec']) {
      assert.equal(sec.isCmdAllowedInLifeState(cmd, life), true);
    }
  }

  // 2) Guard swap & ping interval helpers + EntityClaimLock unit checks
  const guard = sec.createPlayerActionGuard();
  assert.equal(sec.canSwapWeapon(guard, 1000), true);
  sec.markWeaponSwap(guard, 1000);
  assert.equal(sec.canSwapWeapon(guard, 1050), false);
  assert.equal(sec.canSwapWeapon(guard, 1000 + sec.BANSUNG_SEC_LIMITS.SWAP_LOCKOUT_MS), true);

  assert.equal(sec.canSendTacticalPing(guard, 2000), true);
  sec.markTacticalPing(guard, 2000);
  assert.equal(sec.canSendTacticalPing(guard, 2500), false);
  assert.equal(sec.canSendTacticalPing(guard, 2000 + sec.BANSUNG_SEC_LIMITS.PING_MIN_INTERVAL_MS), true);

  assert.equal(sec.isWithinInteractRadius(100, 100, 176, 100), true);
  assert.equal(sec.isWithinInteractRadius(100, 100, 176.1, 100), false);

  const lock = new sec.EntityClaimLock();
  assert.equal(lock.tryClaim(101, 5), true);
  assert.equal(lock.tryClaim(101, 5), false);
  assert.equal(lock.tryClaim(102, 5), true);
  assert.equal(lock.tryClaim(101, 6), true);
  lock.pruneBefore(7);
  assert.equal(lock.tryClaim(101, 6), true);

  // 3) Weapon swap-cancel firing lockout & active reload lockout / jam / sweet spot
  const w = new BansungWorld(
    [
      { id: 'p0', name: 'P0', heroId: 'mascot' },
      { id: 'p1', name: 'P1', heroId: 'ranger' },
    ],
    { bots: 0 },
    noHooks,
    { seed: 505, skipWarmup: true },
  );
  t.after(() => w.stop());
  w.director.phase = 'cleanup';
  w.director.budget = 0;

  // Spawn a pedestal at (600, 600) and test both 76px boundary + atomic multi-player claim lock
  w.players[0].x = 600;
  w.players[0].y = 600;
  w.players[1].x = 750; // 150px away (> 76px)
  w.players[1].y = 600;
  const ped = w.pickupMgr.spawnWeaponPedestal(630, 600, 3, w.players, { weaponId: 'shotgun' });
  const p1InitialWeapon = w.players[1].slots[w.players[1].slotIdx].id;

  // Out of range p1 cannot claim pedestal
  w.enqueueCommand('p1', { t: 'use' }, { nowMs: 1000 });
  w.step();
  assert.equal(w.players[1].slots[w.players[1].slotIdx].id, p1InitialWeapon);

  // Move p1 next to pedestal too; both p0 & p1 press `use` in the same tick -> atomic EntityClaimLock allows only p0!
  w.players[1].x = 620;
  w.players[1].y = 600;
  w.enqueueCommand('p0', { t: 'use' }, { nowMs: 1100 });
  w.enqueueCommand('p1', { t: 'use' }, { nowMs: 1100 });
  w.step();
  assert.equal(w.players[0].slots[w.players[0].slotIdx].id, 'shotgun');
  assert.equal(w.players[1].slots[w.players[1].slotIdx].id, p1InitialWeapon, 'Simultaneous second player must be blocked by EntityClaimLock');
  assert.ok(ped);

  // Swap-cancel firing lockout inside BansungWorld: swapping slot sets swapLockTicks = 5 and blocks shots
  w.players[0].weaponState.slotCdTicks[0] = 0;
  assert.equal(switchHeroWeaponSlot(w.players[0].weaponState, 0), true);
  assert.equal(w.players[0].weaponState.swapLockTicks, BANSUNG_SWAP_LOCK_TICKS);
  const bulletsBeforeSwapShot = w.bulletPool.activeCount ?? 0;
  w.enqueueCommand('p0', { t: 'in', seq: 1, mx: 0, my: 0, aim: 0, fire: 1 }, { nowMs: 1200 });
  w.step();
  assert.equal(w.bulletPool.activeCount ?? 0, bulletsBeforeSwapShot, 'Weapon must not fire while swapLockTicks > 0');

  // Step remaining swap lock ticks so weapon is ready, then advance cooldown check
  for (let i = 0; i < BANSUNG_SWAP_LOCK_TICKS; i += 1) {
    w.step();
  }
  assert.equal(w.players[0].weaponState.swapLockTicks, 0);

  // Downed player cannot fire or use reload/dash/slot commands
  w.players[1].life = 'downed';
  w.players[1].downed = true;
  w.players[1].weaponState.downed = true;
  assert.equal(w.enqueueCommand('p1', { t: 'reload' }, { nowMs: 1300 }).reason, 'life_state_blocked');
  assert.equal(w.enqueueCommand('p1', { t: 'in', seq: 2, mx: 0, my: 0, aim: 0, fire: 1 }, { nowMs: 1320 }).ok, true);
  w.step();
  assert.equal(w.players[1].fireHeld, false, 'Downed player fire input must be cleared');

  // Active reload mechanics: lockout (<0.28), jam (<0.48), and perfect sweet spot ([0.48, 0.64])
  const ws = w.players[0].weaponState;
  ws.activeSlot = 0;
  ws.slots[0].ammoInMag = 2;
  ws.energy = 100;
  ws.maxEnergy = 200;

  assert.equal(handleHeroReloadCmd(ws, 1), 'started');
  assert.ok(ws.reload);
  assert.equal(handleHeroReloadCmd(ws, 1), 'locked_out', 'Immediate re-tap u=0 < 0.28 must lock out instead of jamming');

  // Advance until 0.30 <= u < BANSUNG_RELOAD_SWEET_MIN
  while (ws.reload && ws.reload.progressTicks / ws.reload.durationTicks < BANSUNG_RELOAD_LOCKOUT_U + 0.04) {
    tickHeroReload(ws);
  }
  assert.ok(ws.reload.progressTicks / ws.reload.durationTicks < BANSUNG_RELOAD_SWEET_MIN);
  assert.equal(handleHeroReloadCmd(ws, 10), 'jammed');
  assert.ok(ws.reload.jamTicksLeft > 0);

  // Finish jammed reload then verify perfect sweet spot
  while (ws.reload) tickHeroReload(ws);
  ws.slots[0].ammoInMag = 2;
  ws.energy = 100;
  assert.equal(handleHeroReloadCmd(ws, 100), 'started');
  while (ws.reload && ws.reload.progressTicks / ws.reload.durationTicks < (BANSUNG_RELOAD_SWEET_MIN + BANSUNG_RELOAD_SWEET_MAX) * 0.5) {
    tickHeroReload(ws);
  }
  assert.equal(handleHeroReloadCmd(ws, 120), 'perfect');
  assert.equal(ws.reload, null);
  assert.equal(ws.slots[0].empowered, true);
  assert.equal(ws.energy, 100 + BANSUNG_ACTIVE_ENERGY_BONUS);
});

// ============================================================================
// 4. Co-op 70/30 win pot split + loss refund & MVP stats
// ============================================================================

test('4a. computeBansungPlayerScore & buildBansungResult skip bots for MVP and award badges', () => {
  const highBot = {
    id: 'bot_1',
    name: 'Bot',
    heroId: 'mascot',
    bot: true,
    left: false,
    alive: true,
    downed: false,
    stats: { kills: 200, elitesKilled: 20, damageDealt: 10_000, bossDamage: 2000, damageTaken: 0, stunsInflicted: 10, revives: 5, deaths: 0 },
  };
  const humanA = {
    id: 'h0',
    name: 'HumanA',
    heroId: 'ranger',
    bot: false,
    left: false,
    alive: true,
    downed: false,
    stats: { kills: 60, elitesKilled: 4, damageDealt: 3200, bossDamage: 900, damageTaken: 80, stunsInflicted: 3, revives: 4, deaths: 0 },
  };
  const humanB = {
    id: 'h1',
    name: 'HumanB',
    heroId: 'pyro',
    bot: false,
    left: false,
    alive: true,
    downed: false,
    stats: { kills: 25, elitesKilled: 1, damageDealt: 1200, bossDamage: 200, damageTaken: 100, stunsInflicted: 1, revives: 0, deaths: 2 },
  };

  assert.ok(computeBansungPlayerScore(highBot.stats) > computeBansungPlayerScore(humanA.stats));
  assert.ok(computeBansungPlayerScore(humanA.stats) > computeBansungPlayerScore(humanB.stats));
  assert.equal(computeBansungPlayerScore({ kills: 0, elitesKilled: 0, damageDealt: 0, bossDamage: 0, damageTaken: 0, stunsInflicted: 0, revives: 0, deaths: 10 }), 0);

  const result = buildBansungResult({
    victory: true,
    reason: 'cleared',
    wavesCleared: 10,
    totalWaves: 10,
    wave: 10,
    durationMs: 180_000,
    players: [highBot, humanA, humanB],
  });
  assert.equal(result.mvpId, 'h0', 'MVP must pick top non-left human and skip higher-scoring bots');
  const h0Summary = result.players.find((p) => p.id === 'h0');
  assert.ok(Array.isArray(h0Summary.badges) && h0Summary.badges.includes('mvp'));
});

test('4b. Co-op 70/30 win pot split, survivor/leaver forfeit, odd pot conservation & loss refund via RoomsService', async (t) => {
  // Helper to run an end-to-end settled match inside RoomsService + AccountsService
  async function setupRoom(ids, bet, customCoins = 2000, configOver = {}) {
    const { accounts, rooms } = await createServiceHarness(t);
    for (const id of ids) {
      await accounts.register(id, id.toUpperCase(), '1234');
      await accounts.addCoins(id, customCoins - START_COINS);
      rooms.setVerified(id, true);
    }
    rooms.create(ids[0], ids[0].toUpperCase(), undefined, undefined, 'bansung');
    const game = rooms.roomOf(ids[0]);
    rooms.setBansungConfig(ids[0], { biome: 'desert', difficulty: 'normal', bots: 0, botLevel: 'normal', reviveMode: 'coop', gameMode: 'waves', ...configOver });
    for (let i = 1; i < ids.length; i += 1) {
      rooms.join(game.code, ids[i], ids[i].toUpperCase());
    }
    if (bet > 0) {
      rooms.setBet(ids[0], bet);
    }
    for (let i = 1; i < ids.length; i += 1) {
      rooms.setReady(ids[i], true, game.rulesVersion);
    }
    await rooms.startGame(ids[0]);
    game.bansung.stop();
    return { accounts, rooms, game };
  }

  // Case 1: 3 players in hardcore mode (dead p2 stays dead across wave clear), bet=100 (pot=300). p0 & p1 survive, p2 dead (!left).
  {
    const ids = ['win_p0_001', 'win_p1_002', 'win_p2_003'];
    const { accounts, rooms, game } = await setupRoom(ids, 100, 2000, { reviveMode: 'hardcore', gameMode: 'waves' });
    assert.equal(game.pot, 300);

    const wp = game.bansung.players;
    wp[0].stats.kills = 80;
    wp[0].stats.damageDealt = 4000;
    wp[1].stats.kills = 20;
    wp[1].stats.damageDealt = 1000;
    wp[2].stats.kills = 5;
    wp[2].stats.damageDealt = 200;
    wp[2].alive = false;
    wp[2].life = 'dead';

    forceWorldVictory(game.bansung);
    await rooms.payout(game);

    assert.equal(game.phase, 'ended');
    assert.equal(game.paid, true);
    assert.equal(game.winnerId, 'win_p0_001');
    const totalPaid = Object.values(game.payouts).reduce((a, b) => a + b, 0);
    assert.equal(totalPaid, 300, 'Entire pot must be conserved');
    // 70% = 210 -> 105 each to survivors (wp[0], wp[1]); wp[2] gets 0 base + some 30% perf share (> 0)
    assert.ok(game.payouts.win_p0_001 > 105);
    assert.ok(game.payouts.win_p1_002 >= 105);
    assert.ok(game.payouts.win_p2_003 > 0 && game.payouts.win_p2_003 < 90);
    assert.ok(game.payouts.win_p0_001 > game.payouts.win_p1_002);
    assert.ok(game.payouts.win_p1_002 > game.payouts.win_p2_003);

    assert.equal(accounts.get('win_p0_001').coins, 2000 - 100 + game.payouts.win_p0_001);
    assert.equal(accounts.get('win_p2_003').coins, 2000 - 100 + game.payouts.win_p2_003);

    // Calling payout again must be idempotent
    const snapshot = accounts.get('win_p0_001').coins;
    await rooms.payout(game);
    assert.equal(accounts.get('win_p0_001').coins, snapshot);
  }

  // Case 2: Early leaver (eliminate) forfeits BOTH 70% base and 30% perf share + odd pot integer remainder (pot=400 across 3 survivors)
  {
    const ids = ['odd_p0_001', 'odd_p1_002', 'odd_p2_003', 'odd_p3_004'];
    const { accounts, rooms, game } = await setupRoom(ids, 100);
    assert.equal(game.pot, 400);

    rooms.leave('odd_p3_004');
    const wp = game.bansung.players;
    wp[0].stats.kills = 50;
    wp[1].stats.kills = 20;
    wp[2].stats.kills = 10;

    forceWorldVictory(game.bansung);
    await rooms.payout(game);

    assert.equal(game.payouts.odd_p3_004, undefined, 'Early leaver must forfeit entire payout');
    assert.equal(Object.values(game.payouts).reduce((a, b) => a + b, 0), 400, 'Odd pot 280/3 remainder must conserve exact pot');
    assert.equal(accounts.get('odd_p3_004').coins, 2000 - 100);
  }

  // Case 3: Defeat refunds full bet to non-leavers, forfeits leaver, then restartGame allows clean Round 2
  {
    const ids = ['loss_p0_01', 'loss_p1_02', 'loss_p2_03'];
    const { accounts, rooms, game } = await setupRoom(ids, 200);
    const round1Id = game.roundId;

    rooms.leave('loss_p2_03');
    forceWorldDefeat(game.bansung);
    await rooms.payout(game);

    assert.equal(game.phase, 'ended');
    assert.equal(game.winnerId, undefined);
    assert.deepEqual(game.winnerIds, []);
    assert.equal(game.payouts.loss_p0_01, 200);
    assert.equal(game.payouts.loss_p1_02, 200);
    assert.equal(game.payouts.loss_p2_03, undefined);

    await rooms.payout(game); // Idempotent check on defeat refund
    assert.equal(accounts.get('loss_p0_01').coins, 2000);
    assert.equal(accounts.get('loss_p1_02').coins, 2000);
    assert.equal(accounts.get('loss_p2_03').coins, 2000 - 200);

    // Host restarts for Round 2
    await rooms.restartGame('loss_p0_01');
    assert.equal(game.phase, 'lobby');
    assert.equal(game.paid, false);
    assert.deepEqual(game.payouts, {});
    assert.equal(game.roundId, '');
    assert.equal(game.players.length, 2, 'Left player must be pruned on restartGame');
  }

  // Case 4: Free play (bet=0) victory settles with 0 coin change
  {
    const ids = ['free_p0_01'];
    const { accounts, rooms, game } = await setupRoom(ids, 0);
    forceWorldVictory(game.bansung);
    await rooms.payout(game);
    assert.equal(game.paid, true);
    assert.equal(accounts.get('free_p0_01').coins, 2000);
  }

  // Case 6: Co-op multiplayer free play (pot === 0) match win sets winnerIds, keeps payouts={} and 0 coinDelta
  {
    const ids = ['pot0_p0_01', 'pot0_p1_02', 'pot0_p2_03'];
    const { accounts, rooms, game } = await setupRoom(ids, 0, 2000, { reviveMode: 'hardcore', gameMode: 'waves' });
    assert.equal(game.pot, 0);

    rooms.leave('pot0_p2_03');
    const wp = game.bansung.players;
    wp[0].stats.kills = 42;
    wp[0].stats.damageDealt = 2200;
    wp[1].stats.kills = 12;
    wp[1].stats.damageDealt = 600;
    wp[1].alive = false;
    wp[1].life = 'dead';

    forceWorldVictory(game.bansung);
    await rooms.payout(game);

    assert.equal(game.phase, 'ended');
    assert.equal(game.paid, true);
    assert.equal(game.pot, 0);
    assert.equal(game.winnerId, 'pot0_p0_01');
    assert.deepEqual(game.winnerIds, ['pot0_p0_01', 'pot0_p1_02']);
    assert.deepEqual(game.payouts, {});
    assert.ok(game.bansung.result.players.every((st) => st.coinDelta === 0));
    assert.equal(accounts.get('pot0_p0_01').coins, 2000);
    assert.equal(accounts.get('pot0_p1_02').coins, 2000);
    assert.equal(accounts.get('pot0_p2_03').coins, 2000);
  }
});

// ============================================================================
// 5. BanSungStaticGuard HTTP traversal / symlink / extension fail-closed tests
// ============================================================================

test('5a. guardBanSungStaticRequest unit fail-closed: extensions, dotfiles, ADS, directory, traversal & Windows junction', async (t) => {
  assert.ok(ALLOWED_BANSUNG_STATIC_EXT.has('.png'));
  assert.ok(ALLOWED_BANSUNG_STATIC_EXT.has('.ogg'));
  assert.ok(ALLOWED_BANSUNG_STATIC_EXT.has('.json'));
  assert.equal(ALLOWED_BANSUNG_STATIC_EXT.has('.txt'), false);

  const workDir = makeTempDir(t, 'bansung-static-unit-');
  const rootDir = path.join(workDir, 'database-ban-sung');
  const outsideDir = path.join(workDir, 'outside');
  fs.mkdirSync(path.join(rootDir, 'sub'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'dir.png'), { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });

  fs.writeFileSync(path.join(rootDir, 'ok.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(rootDir, 'manifest.json'), '{"ok":true}');
  fs.writeFileSync(path.join(rootDir, 'sub', 'sfx.ogg'), 'OggS');
  fs.writeFileSync(path.join(rootDir, 'sub', 'notes.txt'), 'nope');
  fs.writeFileSync(path.join(rootDir, 'payload.exe'), 'MZ');
  fs.writeFileSync(path.join(rootDir, '.secret.json'), '{"secret":1}');
  fs.writeFileSync(path.join(rootDir, 'sources.json'), '{}');
  fs.writeFileSync(path.join(rootDir, 'LICENSES.md'), '# License');
  fs.writeFileSync(path.join(outsideDir, 'secret.png'), 'SECRET_OUTSIDE');
  fs.writeFileSync(path.join(outsideDir, 'secret.json'), '{"leak":true}');

  // Windows directory junction pointing outside rootDir
  const linkDir = path.join(rootDir, 'linkdir');
  fs.symlinkSync(outsideDir, linkDir, 'junction');

  // Optional file symlink if platform grants permission
  let hasFileSymlink = false;
  const linkFile = path.join(rootDir, 'linkfile.png');
  try {
    fs.symlinkSync(path.join(outsideDir, 'secret.png'), linkFile, 'file');
    hasFileSymlink = true;
  } catch {
    hasFileSymlink = false;
  }

  // Allowed GET / HEAD + query string
  for (const [method, url] of [
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/ok.png`],
    ['HEAD', `${BAN_SUNG_STATIC_PREFIX}/sub/sfx.ogg?v=123`],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/manifest.json`],
  ]) {
    const r = await runGuard({ method, originalUrl: url, url }, rootDir);
    assert.equal(r.calledNext, true, `Expected ${method} ${url} to pass guard`);
  }

  // Blocked HTTP methods -> 405
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'TRACE']) {
    const r = await runGuard({ method, originalUrl: `${BAN_SUNG_STATIC_PREFIX}/ok.png`, url: `${BAN_SUNG_STATIC_PREFIX}/ok.png` }, rootDir);
    assert.equal(r.calledNext, false);
    assert.equal(r.status, 405);
  }

  // Bad encodings / backslashes / null byte -> 400
  for (const url of [
    `${BAN_SUNG_STATIC_PREFIX}/%252e%252e/outside/secret.png`,
    `${BAN_SUNG_STATIC_PREFIX}/sub%5csfx.ogg`,
    `${BAN_SUNG_STATIC_PREFIX}/ok%00.png`,
    `${BAN_SUNG_STATIC_PREFIX}/%ZZ.png`,
  ]) {
    const r = await runGuard({ method: 'GET', originalUrl: url, url }, rootDir);
    assert.equal(r.calledNext, false);
    assert.equal(r.status, 400, `Expected 400 for ${url}, got ${r.status}`);
  }

  // Traversal, symlinks/junctions, disallowed extensions, dotfiles, ADS, metadata, directories -> 403
  const expected403 = [
    `${BAN_SUNG_STATIC_PREFIX}/../outside/secret.png`,
    `${BAN_SUNG_STATIC_PREFIX}/%2e%2e/outside/secret.png`,
    `${BAN_SUNG_STATIC_PREFIX}/sub/../../outside/secret.png`,
    `${BAN_SUNG_STATIC_PREFIX}/linkdir/secret.png`,
    `${BAN_SUNG_STATIC_PREFIX}/linkdir/secret.json`,
    `${BAN_SUNG_STATIC_PREFIX}/sub/notes.txt`,
    `${BAN_SUNG_STATIC_PREFIX}/payload.exe`,
    `${BAN_SUNG_STATIC_PREFIX}/.secret.json`,
    `${BAN_SUNG_STATIC_PREFIX}/sources.json`,
    `${BAN_SUNG_STATIC_PREFIX}/LICENSES.md`,
    `${BAN_SUNG_STATIC_PREFIX}/ok.png::$DATA`,
    `${BAN_SUNG_STATIC_PREFIX}/sub:stream/ok.png`,
    `${BAN_SUNG_STATIC_PREFIX}/`,
    `${BAN_SUNG_STATIC_PREFIX}/sub/`,
    `${BAN_SUNG_STATIC_PREFIX}/dir.png`,
    '/other/ok.png',
  ];
  if (hasFileSymlink) {
    expected403.push(`${BAN_SUNG_STATIC_PREFIX}/linkfile.png`);
  }
  for (const url of expected403) {
    const r = await runGuard({ method: 'GET', originalUrl: url, url }, rootDir);
    assert.equal(r.calledNext, false, `Blocked URL ${url} must not call next()`);
    assert.equal(r.status, 403, `Expected 403 for ${url}, got ${r.status}`);
    const serialized = JSON.stringify(r.body);
    assert.equal(serialized.includes(rootDir), false, 'Error response must not leak rootDir path');
  }

  // Missing file with allowed extension -> 404 (must NOT call next -> no SPA fallback)
  const missing = await runGuard({ method: 'GET', originalUrl: `${BAN_SUNG_STATIC_PREFIX}/missing_asset.png`, url: `${BAN_SUNG_STATIC_PREFIX}/missing_asset.png` }, rootDir);
  assert.equal(missing.calledNext, false);
  assert.equal(missing.status, 404);
});

test('5b. Live NestJS HTTP ServeStaticModule + BanSungStaticGuard middleware fails closed without SPA fallback', async (t) => {
  const clientDistDir = makeTempDir(t, 'bansung-spa-dist-');
  fs.writeFileSync(path.join(clientDistDir, 'index.html'), '<!doctype html><title>SPA_FALLBACK</title>');

  class HttpGuardTestModule {
    configure(consumer) {
      consumer.apply(BanSungStaticGuard).forRoutes(BAN_SUNG_STATIC_PREFIX, `${BAN_SUNG_STATIC_PREFIX}/{*path}`);
    }
  }
  Module({
    imports: [
      ServeStaticModule.forRoot(
        {
          rootPath: BAN_SUNG_ROOT,
          serveRoot: BAN_SUNG_STATIC_PREFIX,
          serveStaticOptions: { maxAge: '7d', fallthrough: false, dotfiles: 'deny', index: false, redirect: false },
        },
        {
          rootPath: clientDistDir,
          exclude: ['/api/{*path}', `${BAN_SUNG_STATIC_PREFIX}/{*path}`],
        },
      ),
    ],
  })(HttpGuardTestModule);

  const app = await NestFactory.create(HttpGuardTestModule, { logger: false, abortOnError: false });
  t.after(async () => {
    await app.close();
  });
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;

  // Real valid assets from repository BAN_SUNG_ROOT
  const manifestRes = await rawHttpRequest(port, `${BAN_SUNG_STATIC_PREFIX}/manifest.json`, 'GET');
  assert.equal(manifestRes.status, 200);
  assert.doesNotThrow(() => JSON.parse(manifestRes.body));

  const pngRes = await rawHttpRequest(port, `${BAN_SUNG_STATIC_PREFIX}/normalized/weapons/arcane_book.png`, 'GET');
  assert.equal(pngRes.status, 200);
  assert.deepEqual([...pngRes.bodyBuffer.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  const headOggRes = await rawHttpRequest(port, `${BAN_SUNG_STATIC_PREFIX}/audio/bgm/bgm_desert.ogg`, 'HEAD');
  assert.equal(headOggRes.status, 200);
  assert.equal(headOggRes.bodyBuffer.length, 0);

  // Raw TCP HTTP requests bypass client URL normalization and hit BanSungStaticGuard directly
  const httpChecks = [
    ['POST', `${BAN_SUNG_STATIC_PREFIX}/manifest.json`, 405],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/../package.json`, 403],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/%2e%2e/package.json`, 403],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/%252e%252e/package.json`, 400],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/normalized%5cweapons%5carcane_book.png`, 400],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/manifest.json%00.png`, 400],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/sources.json`, 403],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/LICENSES.md`, 403],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/.env.json`, 403],
    ['GET', `${BAN_SUNG_STATIC_PREFIX}/does_not_exist_999.png`, 404],
  ];
  for (const [method, reqPath, expectedStatus] of httpChecks) {
    const res = await rawHttpRequest(port, reqPath, method);
    assert.equal(res.status, expectedStatus, `${method} ${reqPath} expected ${expectedStatus}, got ${res.status}: ${res.body}`);
    assert.equal(res.body.includes('SPA_FALLBACK'), false, `${reqPath} must NEVER fall back to SPA index.html`);
    assert.equal(res.body.includes(BAN_SUNG_ROOT), false, `${reqPath} must not leak filesystem path`);
  }
});

// ============================================================================
// 6. Survival Mode (6336x4032, XP Orbs, 3-Card Gacha & Gun Evolution Net/Sec E2E)
// ============================================================================

test('6a. Survival gacha command validation, life-state allowance & 6336x4032 ping clamping', () => {
  assert.equal(sec.DEAD_OR_DOWNED_ALLOWED_CMDS.has('gacha'), true);
  assert.equal(sec.isCmdAllowedInLifeState('gacha', 'alive'), true);
  assert.equal(sec.isCmdAllowedInLifeState('gacha', 'downed'), true);
  assert.equal(sec.isCmdAllowedInLifeState('gacha', 'dead'), true);

  for (const pick of [0, 1, 2]) {
    const okRes = sec.validateBansungCommand({ t: 'gacha', pick });
    assert.equal(okRes.ok, true);
    assert.deepEqual(okRes.cmd, { t: 'gacha', pick });
  }

  for (const badPick of [3, -1, 1.5, NaN, Infinity, -Infinity, '0', null, undefined]) {
    const res = sec.validateBansungCommand({ t: 'gacha', pick: badPick });
    assert.equal(res.ok, false, `pick=${String(badPick)} must fail closed`);
    assert.equal(res.reason, 'invalid_gacha_pick');
  }
  assert.equal(
    sec.validateBansungCommand(JSON.parse('{"t":"gacha","pick":0,"__proto__":{"polluted":true}}')).reason,
    'invalid_object',
  );

  // Default 6336x4032 arena clamping
  assert.equal(BANSUNG_ARENA_W, 6336);
  assert.equal(BANSUNG_ARENA_H, 4032);
  const clampedDefaultPing = sec.validateBansungCommand({ t: 'ping', kind: 1, x: -50, y: 999999 });
  assert.deepEqual(clampedDefaultPing.cmd, { t: 'ping', kind: 1, x: 0, y: 4032 });
});

test('6b. BansungWorld Survival default loop: BANSUNG_PLAYER_FIELDS=12, frame.srv, mob XP orbs -> Gacha -> Weapon Mk.II & Skill Stacks', (t) => {
  const w = new BansungWorld(
    [{ id: 'p0', name: 'Survivor', heroId: 'mascot' }],
    { bots: 0 },
    noHooks,
    { seed: 707, skipWarmup: true },
  );
  t.after(() => w.stop());

  assert.equal(resolveBansungGameMode(w.config), 'survival');
  assert.equal(w.W, 6336);
  assert.equal(w.H, 4032);
  assert.equal(BANSUNG_PLAYER_FIELDS, 12);

  w.step();
  const initialFrame = w.frameFor('p0');
  assert.equal(initialFrame.p.length, BANSUNG_PLAYER_FIELDS);
  assert.equal(initialFrame.p[11], 1, 'Packed weaponTier[11] must start at Mk.I (1)');
  assert.ok(initialFrame.srv);
  assert.equal(initialFrame.srv.mode, 'survival');
  assert.equal(initialFrame.srv.cycle, 0);
  assert.equal(initialFrame.srv.stageIdx, 0);
  assert.equal(initialFrame.srv.stageId, 'swarm_light');
  assert.equal(initialFrame.me.level, 1);
  assert.deepEqual(initialFrame.me.weaponTiers, [1, 1, 1, 1, 1]);

  // 1) Mob death in Survival drops XP orb(s)
  const mob = spawnMob(w.mobMgr, {
    id: 'xp_mob_1',
    kind: 'scarab',
    x: w.players[0].x + 40,
    y: w.players[0].y,
    playerCount: 1,
    wave: 1,
    difficulty: 'normal',
  });
  w.recordMobDeath(mob, 'p0');
  assert.ok(
    w.pickupMgr.pickups.some((pk) => pk.kind.startsWith('xp_orb_')),
    'Killing a mob in survival mode must spawn XP orbs',
  );

  // 2) Invalid gacha pick is rejected at enqueueCommand boundary
  const badPickRes = w.enqueueCommand('p0', { t: 'gacha', pick: 3 }, { nowMs: 10_000 });
  assert.equal(badPickRes.ok, false);
  assert.equal(badPickRes.reason, 'invalid_gacha_pick');

  // 3) Collecting XP levels up hero and populates 3 Gacha cards
  w.pickupMgr.spawnPickup('xp_orb_l', w.players[0].x, w.players[0].y, { spawnLockTicks: 0 });
  for (let i = 0; i < 4; i += 1) {
    w.step();
  }
  const lvlUpFrame = w.frameFor('p0');
  assert.ok(lvlUpFrame.me.level >= 2, `Expected level >= 2 after collecting 145 XP, got ${lvlUpFrame.me.level}`);
  assert.ok(Array.isArray(lvlUpFrame.me.gachaChoices) && lvlUpFrame.me.gachaChoices.length === 3);
  assert.ok(lvlUpFrame.me.gachaPending >= 1);

  // Find a weapon_upgrade card on initial seeded roll, upgrade weapon tier to Mk.II
  const evoIdx = lvlUpFrame.me.gachaChoices.findIndex((c) => c.category === 'weapon_upgrade');
  assert.ok(evoIdx >= 0, 'Expected at least one weapon_upgrade card on first survival level-up');
  const upgradedSlot = lvlUpFrame.me.gachaChoices[evoIdx].slotIdx;

  // Switch active slot to the card's slot if needed so packed frame.p[11] also reflects Mk.II!
  if (w.players[0].weaponState.activeSlot !== upgradedSlot) {
    w.enqueueCommand('p0', { t: 'slot', idx: upgradedSlot }, { nowMs: 11_000 });
    w.step();
  }
  assert.equal(w.enqueueCommand('p0', { t: 'gacha', pick: evoIdx }, { nowMs: 11_100 }).ok, true);
  w.step();

  const postEvoFrame = w.frameFor('p0');
  assert.equal(postEvoFrame.me.gachaChoices, undefined, 'gachaChoices must clear after picking');
  assert.equal(postEvoFrame.me.weaponTiers[upgradedSlot], 2, 'Selected weapon slot must evolve to Mk.II (tier 2)');
  assert.equal(postEvoFrame.me.slots[upgradedSlot].tier, 2);
  assert.equal(postEvoFrame.p[11], 2, 'Packed frame.p[11] must broadcast upgraded weaponTier=2');

  // 4) Trigger another level-up and pick a combat/survival skill card -> verify skillStacks increments
  w.pickupMgr.spawnPickup('xp_orb_l', w.players[0].x, w.players[0].y, { spawnLockTicks: 0 });
  for (let i = 0; i < 4; i += 1) {
    w.step();
  }
  const lvl3Frame = w.frameFor('p0');
  assert.ok(lvl3Frame.me.level >= 3);
  assert.ok(Array.isArray(lvl3Frame.me.gachaChoices) && lvl3Frame.me.gachaChoices.length === 3);
  const skillIdx = lvl3Frame.me.gachaChoices.findIndex((c) => c.category.startsWith('skill_'));
  assert.ok(skillIdx >= 0, 'Expected at least one skill_* card in 3-card Gacha roll');
  const chosenCategory = lvl3Frame.me.gachaChoices[skillIdx].category;

  assert.equal(w.enqueueCommand('p0', { t: 'gacha', pick: skillIdx }, { nowMs: 12_000 }).ok, true);
  w.step();

  const postSkillFrame = w.frameFor('p0');
  assert.ok(postSkillFrame.me.skillStacks && postSkillFrame.me.skillStacks[chosenCategory] === 1);
  assert.equal(postSkillFrame.me.gachaChoices, undefined);
});

test('6c. Survival Gacha combat modifiers (critDmgMult & energyCostMult) & bot weapon_upgrade priority', (t) => {
  const mkGachaSkillCard = (category, rarity) => ({
    id: `${category}:${rarity}`,
    category,
    rarity,
    title: `${category} (${rarity})`,
    vnTitle: `${category} (${rarity})`,
    desc: '',
    vnDesc: '',
    icon: category,
    badge: rarity.toUpperCase(),
    value: 1,
  });

  // 1) Live BansungWorld combat comparison: skill_crit critDmgMult increases actual forced-crit mob damage
  const setupSolo = (seed) => {
    const world = new BansungWorld(
      [{ id: 'p0', name: 'GachaHero', hero: 'mascot' }],
      { mode: 'survival', bots: 0 },
      noHooks,
      { seed, skipWarmup: true },
    );
    world.step(); // Exit warmup into Wave 1
    world.director.phase = 'cleanup';
    world.director.budget = 0;
    world.mobMgr.mobs.length = 0;
    world.mobMgr.mobByNumId.clear();
    return world;
  };

  const wBase = setupSolo(901);
  const wCrit = setupSolo(902);
  t.after(() => {
    wBase.stop();
    wCrit.stop();
  });

  // Find a 0-energy firearm in mascot's slots (fallback to equipping pistol if needed) and verify critChance > 0
  const basePlayer = wBase.players[0];
  const critPlayer = wCrit.players[0];
  let testWeaponId = 'pistol';
  for (const s of basePlayer.slots) {
    if (!s) continue;
    const spec = BANSUNG_WEAPONS[s.id];
    if (spec && spec.kind === 'gun' && spec.energyCost === 0 && spec.critChance > 0) {
      testWeaponId = s.id;
      break;
    }
  }
  const slotIdxBase = basePlayer.slots.findIndex((s) => s && s.id === testWeaponId);
  if (slotIdxBase > 0) {
    wBase.enqueueCommand('p0', { t: 'slot', idx: slotIdxBase }, { nowMs: 1000 });
    wCrit.enqueueCommand('p0', { t: 'slot', idx: slotIdxBase }, { nowMs: 1000 });
    wBase.step();
    wCrit.step();
  }

  // Pick legendary skill_crit on wCrit through real gacha command queue
  // Note: skill_crit grants ONLY critChanceAdd & critDmgMult (dmgMult remains 1.0),
  // so forcing crit in both worlds isolates critDmgMult cleanly.
  critPlayer.gachaPending = 1;
  critPlayer.gachaTimerMs = 14_000;
  critPlayer.gachaChoices = [
    mkGachaSkillCard('skill_crit', 'legendary'),
    mkGachaSkillCard('skill_mobility', 'common'),
    mkGachaSkillCard('skill_hp', 'common'),
  ];
  assert.equal(wCrit.enqueueCommand('p0', { t: 'gacha', pick: 0 }, { nowMs: 1200 }).ok, true);
  wCrit.step();

  const expectedCritDmgMult = 1 + BANSUNG_GACHA_SKILL_MAP.skill_crit.legendary.secondaryValue;
  assert.ok(
    Math.abs(critPlayer.weaponState.gachaMods.critDmgMult - expectedCritDmgMult) < 1e-6,
    `Expected weaponState.gachaMods.critDmgMult=${expectedCritDmgMult}, got ${critPlayer.weaponState.gachaMods.critDmgMult}`,
  );
  assert.equal(basePlayer.weaponState.gachaMods.critDmgMult, 1);

  // Ensure the active weapon uses pistol (0 energyCost, 0.15 critChance > 0) if active slot differed
  const activeSnap = basePlayer.slots[basePlayer.slotIdx];
  const baseWeaponSpec = activeSnap ? BANSUNG_WEAPONS[activeSnap.id] : null;
  if (!baseWeaponSpec || baseWeaponSpec.kind !== 'gun' || baseWeaponSpec.critChance <= 0) {
    basePlayer.weaponState.slots[0].weaponId = 'pistol';
    critPlayer.weaponState.slots[0].weaponId = 'pistol';
    basePlayer.weaponState.activeSlot = 0;
    critPlayer.weaponState.activeSlot = 0;
    basePlayer.slotIdx = 0;
    critPlayer.slotIdx = 0;
  }

  const spawnDummyTarget = (world, id) => {
    const p = world.players[0];
    const m = spawnMob(world.mobMgr, {
      id,
      kind: 'cactus_brute',
      x: p.x + 48,
      y: p.y,
      playerCount: 1,
      wave: 1,
      difficulty: 'normal',
    });
    m.hp = 500;
    m.maxHp = 500;
    m.armor = 0;
    m.shield = 0;
    m.stunMs = 5000;
    m.vx = 0;
    m.vy = 0;
    return m;
  };

  const targetBase = spawnDummyTarget(wBase, 'crit_target_base');
  const targetCrit = spawnDummyTarget(wCrit, 'crit_target_crit');

  // Force rng() = 0 so every shot crits in both worlds; aim = 0 points straight along +X
  wBase.rng = () => 0;
  wCrit.rng = () => 0;
  wBase.enqueueCommand('p0', { t: 'in', seq: 1, mx: 0, my: 0, aim: 0, fire: 1 }, { nowMs: 1400 });
  wCrit.enqueueCommand('p0', { t: 'in', seq: 1, mx: 0, my: 0, aim: 0, fire: 1 }, { nowMs: 1400 });
  for (let i = 0; i < 4; i += 1) {
    wBase.step();
    wCrit.step();
    if (targetBase.hp < 500 && targetCrit.hp < 500) break;
  }
  const dmgBase = 500 - targetBase.hp;
  const dmgCrit = 500 - targetCrit.hp;
  assert.ok(dmgBase > 0, `Expected baseline forced crit to damage target, got ${dmgBase}`);
  assert.ok(
    dmgCrit > dmgBase,
    `Expected skill_crit critDmgMult (${expectedCritDmgMult}x) to deal strictly higher crit dmg than baseline (${dmgCrit} vs ${dmgBase})`,
  );

  // 2) energyCostMult in BansungWorld: cluster_bomb gadget (cost 25 -> 23) + bazooka weapon (cost 8 -> 7)
  const baseGadgetPreE = basePlayer.energy;
  assert.equal(wBase.enqueueCommand('p0', { t: 'gadget' }, { nowMs: 2000 }).ok, true);
  wBase.step();
  const baseGadgetSpend = baseGadgetPreE - basePlayer.energy;
  assert.equal(
    baseGadgetSpend,
    BANSUNG_GADGETS.cluster_bomb.energyCost,
    `Baseline cluster_bomb must spend ${BANSUNG_GADGETS.cluster_bomb.energyCost} energy`,
  );

  const wCost = setupSolo(903);
  t.after(() => wCost.stop());
  const costPlayer = wCost.players[0];

  // Apply 1st epic skill_multishot (-0.08 -> 0.92 energyCostMult)
  costPlayer.gachaPending = 1;
  costPlayer.gachaTimerMs = 14_000;
  costPlayer.gachaChoices = [
    mkGachaSkillCard('skill_multishot', 'epic'),
    mkGachaSkillCard('skill_hp', 'common'),
    mkGachaSkillCard('skill_mobility', 'common'),
  ];
  assert.equal(wCost.enqueueCommand('p0', { t: 'gacha', pick: 0 }, { nowMs: 2100 }).ok, true);
  wCost.step();

  const expectedCostMult1 = 1 - BANSUNG_GACHA_SKILL_MAP.skill_multishot.epic.secondaryValue;
  assert.ok(Math.abs(costPlayer.weaponState.gachaMods.energyCostMult - expectedCostMult1) < 1e-6);

  const costGadgetPreE = costPlayer.energy;
  assert.equal(wCost.enqueueCommand('p0', { t: 'gadget' }, { nowMs: 2200 }).ok, true);
  wCost.step();
  const costGadgetSpend = costGadgetPreE - costPlayer.energy;
  assert.equal(
    costGadgetSpend,
    Math.max(1, Math.round(BANSUNG_GADGETS.cluster_bomb.energyCost * expectedCostMult1)),
    `Reduced cluster_bomb gadget cost must be ${Math.round(25 * expectedCostMult1)} (< ${baseGadgetSpend})`,
  );
  assert.ok(costGadgetSpend < baseGadgetSpend);

  // Stack 2nd epic skill_multishot (0.84x) and verify bazooka (energyCost 8 -> 7)
  costPlayer.gachaPending = 1;
  costPlayer.gachaTimerMs = 14_000;
  costPlayer.gachaChoices = [
    mkGachaSkillCard('skill_multishot', 'epic'),
    mkGachaSkillCard('skill_hp', 'common'),
    mkGachaSkillCard('skill_mobility', 'common'),
  ];
  assert.equal(wCost.enqueueCommand('p0', { t: 'gacha', pick: 0 }, { nowMs: 2300 }).ok, true);
  wCost.step();

  // Switch/equip bazooka in slot 0 and fire once
  costPlayer.weaponState.slots[0].weaponId = 'bazooka';
  costPlayer.weaponState.slots[0].tier = 1;
  if (costPlayer.slots[0]) costPlayer.slots[0].id = 'bazooka';
  costPlayer.weaponState.activeSlot = 0;
  costPlayer.slotIdx = 0;
  costPlayer.weaponState.slots[0].cdTicks = 0;
  costPlayer.weaponState.energy = 100;
  costPlayer.energy = 100;
  const preBazookaE = costPlayer.energy;
  assert.equal(wCost.enqueueCommand('p0', { t: 'in', seq: 2, mx: 0, my: 0, aim: 0, fire: 1 }, { nowMs: 2400 }).ok, true);
  wCost.step();
  wCost.enqueueCommand('p0', { t: 'in', seq: 3, mx: 0, my: 0, aim: 0, fire: 0 }, { nowMs: 2450 });
  const bazookaSpend = preBazookaE - costPlayer.energy;
  assert.equal(
    bazookaSpend,
    Math.max(1, Math.round(BANSUNG_WEAPONS.bazooka.energyCost * (1 - 2 * BANSUNG_GACHA_SKILL_MAP.skill_multishot.epic.secondaryValue))),
    `2-stack skill_multishot must reduce bazooka energyCost (${BANSUNG_WEAPONS.bazooka.energyCost} -> ${bazookaSpend})`,
  );
  assert.ok(bazookaSpend < BANSUNG_WEAPONS.bazooka.energyCost);

  // 3) Bot BOT_GACHA_CATEGORY_PRIORITY prefers weapon_upgrade over skill_* cards + organic XP auto-pick
  const wBot = new BansungWorld(
    [
      { id: 'p0', name: 'Human', hero: 'mascot' },
      { id: 'bot:0', name: 'Bot', hero: 'mascot', bot: true },
    ],
    { gameMode: 'survival', bots: 1, botLevel: 'normal' },
    noHooks,
    { seed: 909, skipWarmup: true },
  );
  t.after(() => wBot.stop());
  wBot.step(); // Leave warmup into Wave 1
  wBot.director.phase = 'cleanup';
  wBot.director.budget = 0;

  const bot = wBot.players.find((pl) => pl.bot);
  assert.ok(bot, 'Expected 1 AI bot in survival match');
  const botSlot0Weapon = bot.weaponState.slots[0].weaponId;
  assert.equal(bot.weaponState.slots[0].tier, 1);

  // Place weapon_upgrade at index 2 (NOT index 0) behind skill_mobility and skill_crit
  bot.gachaPending = 1;
  bot.gachaTimerMs = 14_000;
  bot.gachaBotWaitMs = 800;
  bot.gachaChoices = [
    mkGachaSkillCard('skill_mobility', 'common'),
    mkGachaSkillCard('skill_crit', 'rare'),
    {
      id: `weapon_upgrade:0:${botSlot0Weapon}:2`,
      category: 'weapon_upgrade',
      rarity: 'epic',
      title: 'Mk.II',
      vnTitle: 'Mk.II',
      desc: '',
      vnDesc: '',
      weaponId: botSlot0Weapon,
      slotIdx: 0,
      fromTier: 1,
      toTier: 2,
      icon: botSlot0Weapon,
      badge: 'Mk.II',
      value: 2,
    },
  ];

  // Step 30 ticks (~1.0s @ 30Hz) so BOT_GACHA_AUTO_PICK_MS (800ms) fires deterministically
  for (let i = 0; i < 30; i += 1) {
    wBot.step();
  }
  assert.equal(bot.gachaChoices, undefined, 'Bot must resolve gachaChoices within 1s');
  assert.equal(bot.gachaPending, 0);
  assert.equal(bot.weaponState.slots[0].tier, 2, 'Bot must pick weapon_upgrade over skill_mobility and skill_crit');
  assert.equal(bot.skillStacks.skill_mobility ?? 0, 0);
  assert.equal(bot.skillStacks.skill_crit ?? 0, 0);

  // Also test organic XP orb collection -> bot level-up -> bot auto-pick within ~800ms
  const levelBefore = bot.level;
  wBot.pickupMgr.spawnPickup('xp_orb_l', bot.x, bot.y, { spawnLockTicks: 0 });
  for (let i = 0; i < 40; i += 1) {
    wBot.step();
    if (bot.level > levelBefore) break;
  }
  assert.ok(bot.level > levelBefore, `Expected bot to collect xp_orb_l and level up (${bot.level} > ${levelBefore})`);
  for (let i = 0; i < 35; i += 1) {
    wBot.step();
    if (bot.gachaPending === 0 && !bot.gachaChoices) break;
  }
  assert.equal(bot.gachaPending, 0, 'Bot must auto-resolve organic level-up gacha within ~1s');
  assert.equal(bot.gachaChoices, undefined);
  const gainedUpgradeOrSkill =
    bot.weaponState.slots.some((s, idx) => s && (idx === 0 ? s.tier >= 3 : s.tier >= 2)) ||
    Object.values(bot.skillStacks).some((n) => n >= 1);
  assert.ok(
    gainedUpgradeOrSkill,
    'Bot organic level-up gacha auto-pick must either evolve a weapon or grant a skill stack',
  );
});
