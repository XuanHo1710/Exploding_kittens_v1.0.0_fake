/**
 * Authoritative 30 Hz Simulation World (`MkWorld`) for Mighty Knight 2.5D Pixel.
 *
 * State machine:
 *   WAVE_INTRO (1.8s) -> COMBAT (30 Hz) -> WAVE_CLEAR (1.5s) / RELIC_DRAFT (12s) -> ENDED
 * Supports Endless Challenge (4 Biomes rotating every 5 waves) & Boss Rush (4 Bosses),
 * 1..6 human players + 0..3 COM companions, on-the-fly `switch_com`, 2.5s Co-op Revive,
 * 3-Hit Combo, Perfect Parry, 30 Active/Ultimate skills, and 12 Roguelite Relics.
 */
import {
  MK_HEROES,
  MK_LANE_BOTTOM,
  MK_LANE_TOP,
  MK_MAX_PARTY_SIZE,
  MK_RELIC_DRAFT_MS,
  MK_REVIVE_DURATION_MS,
  MK_REVIVE_RADIUS_PX,
  MK_TICK_EXACT_MS,
  MK_WAVE_CLEAR_MS,
  MK_WAVE_INTRO_MS,
  createInitialUpgrades,
  isMkBossWave,
  rollMkRelicChoices,
  type MkBossHudView,
  type MkCommand,
  type MkConfig,
  type MkDamageEvent,
  type MkEnemyView,
  type MkFighterView,
  type MkFrame,
  type MkFxEvent,
  type MkHeroId,
  type MkPickupView,
  type MkPlayerSummary,
  type MkProjectileView,
  type MkRelicId,
  type MkResultSummary,
  type MkUltCutInEvent,
  type MkWorldPhase,
  type MkZoneView,
} from '../../../../shared/src';
import { stepComBot } from './bot';
import {
  canStartAction,
  clampToArena,
  performBasicAttack,
  startGuardParry,
  startHeroAction,
  stepPickups,
  stepProjectiles,
  stepZones,
} from './combat';
import { MK_SEC_LIMITS, MkRateLimiter, validateMkCommand } from './security';
import { executeHeroSkill, executeHeroUltimate } from './skills';
import {
  applyUpgradeCommand,
  expToNextForLevel,
  grantFighterExp,
  grantRelicToFighter,
  recomputeFighterStats,
  relicStacks,
  type MkDelayedAction,
  type MkEnemySim,
  type MkFighterSim,
  type MkPickupSim,
  type MkProjectileSim,
  type MkSimContext,
  type MkZoneSim,
} from './upgrades';
import { MkWaveDirector, handleSpecialDrops, stepEnemies } from './waves';

const PUMP_POLL_MS = 16;
const MAX_FRAME_GAP_MS = 250;
const MAX_STEPS_PER_POLL = 5;

export interface MkFighterInit {
  id: string;
  name: string;
  heroId: MkHeroId;
  isCom: boolean;
  badge: string;
}

export interface MkWorldHooks {
  tick(): void;
  changed(): void;
  onEnd?(result: MkResultSummary): void;
}

export class MkWorld {
  readonly config: MkConfig;
  readonly fighters: MkFighterSim[] = [];
  readonly enemies: MkEnemySim[] = [];
  zones: MkZoneSim[] = [];
  projectiles: MkProjectileSim[] = [];
  pickups: MkPickupSim[] = [];
  result?: MkResultSummary;
  startedAt = 0;

  private readonly hooks: MkWorldHooks;
  private readonly director: MkWaveDirector;
  private readonly rateLimiter = new MkRateLimiter();
  private readonly queuedCmds = new Map<string, MkCommand[]>();
  private readonly humanIds = new Set<string>();
  private readonly humanLeft = new Set<string>();
  private readonly logs: string[] = [];
  private delayedActions: MkDelayedAction[] = [];

  private phase: MkWorldPhase = 'wave_intro';
  private phaseLeftMs = MK_WAVE_INTRO_MS;
  private banner?: string;

  private tickNo = 0;
  private elapsedMs = 0;
  private partyScore = 0;
  private totalKills = 0;

  private nextZoneId = 1;
  private nextProjId = 1;
  private nextPickupId = 1;
  private nextDmgId = 1;
  private nextFxId = 1;
  private nextCutInId = 1;

  private tickDamages: MkDamageEvent[] = [];
  private tickFx: MkFxEvent[] = [];
  private tickUltCutIns: MkUltCutInEvent[] = [];
  private tickSfx: string[] = [];

  private timer?: NodeJS.Timeout;
  private lastPumpMs = 0;
  private accumulatorMs = 0;
  private rngState: number;

  constructor(
    inits: MkFighterInit[],
    config: MkConfig,
    hooks: MkWorldHooks,
    seed = Date.now(),
  ) {
    this.config = config;
    this.hooks = hooks;
    this.rngState = (Math.floor(seed) >>> 0) || 1337;
    this.director = new MkWaveDirector(config);

    const partyInits = inits.slice(0, MK_MAX_PARTY_SIZE);
    const partyCount = Math.max(1, partyInits.length);
    const midY = (MK_LANE_TOP + MK_LANE_BOTTOM) * 0.5;
    const bossRush = config.playMode === 'boss_rush';

    partyInits.forEach((init, idx) => {
      const rowOffset = partyCount <= 1 ? 0 : (idx / (partyCount - 1) - 0.5) * 110;
      const colOffset = (idx % 2 === 0 ? -1 : 1) * 28;
      const pos = clampToArena(260 + colOffset, midY + rowOffset);
      const spec = MK_HEROES[init.heroId];
      const upgrades = createInitialUpgrades(config.playMode);

      const fighter: MkFighterSim = {
        id: init.id,
        ownerId: init.isCom ? undefined : init.id,
        originalIsCom: init.isCom,
        badge: init.badge,
        name: init.name,
        heroId: init.heroId,
        x: pos.x,
        y: pos.y,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        dir: 1,
        actionId: 'idle',
        actionTick: 0,
        actionElapsedMs: 0,
        actionLockMs: 0,
        cancelAfterMs: 0,
        comboStep: 0,
        comboWindowMs: 0,
        inputMx: 0,
        inputMy: 0,
        holdingAtk: false,
        hp: spec.baseHp,
        maxHp: spec.baseHp,
        shieldHp: 0,
        atk: spec.baseAtk,
        def: spec.baseDef,
        spd: spec.baseSpd,
        fury: bossRush ? 50 : 0,
        level: bossRush ? 5 : 1,
        exp: 0,
        expToNext: expToNextForLevel(bossRush ? 5 : 1),
        gold: bossRush ? 450 : 0,
        goldEarned: 0,
        sp: bossRush ? 2 : 0,
        kills: 0,
        parries: 0,
        damageDealt: 0,
        combo: 0,
        comboTimerMs: 0,
        attackCdMs: 0,
        dashCdMs: 0,
        dashMaxCdMs: spec.dashCooldownMs,
        dashActiveMs: 0,
        dashVx: 0,
        dashVy: 0,
        guardCdMs: 0,
        guardMaxCdMs: 1400,
        guardMs: 0,
        parryWindowMs: 0,
        s1CdMs: 0,
        s1MaxCdMs: spec.skills[0].cooldownMs,
        s2CdMs: 0,
        s2MaxCdMs: spec.skills[1].cooldownMs,
        s3CdMs: 0,
        s3MaxCdMs: spec.skills[2].cooldownMs,
        s4CdMs: 0,
        s4MaxCdMs: spec.skills[3].cooldownMs,
        invulnMs: 0,
        superArmorMs: 0,
        furyBuffMs: 0,
        lifestealBuffMs: 0,
        guaranteedCritNext: false,
        counterReadyMs: 0,
        evadeVisMs: 0,
        downed: false,
        reviveProgress: 0,
        left: false,
        upgrades,
        relics: new Map(),
        phoenixCharges: 0,
      };
      this.fighters.push(fighter);
      if (!init.isCom) this.humanIds.add(init.id);
    });

    for (const f of this.fighters) {
      recomputeFighterStats(f, this.fighters, 'add_delta');
      f.hp = f.maxHp;
    }

    this.enterWaveIntro(1);
  }

  private random = (): number => {
    let x = this.rngState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState % 1_000_000) / 1_000_000;
  };

  private makeContext(): MkSimContext {
    return {
      fighters: this.fighters,
      enemies: this.enemies,
      zones: this.zones,
      projectiles: this.projectiles,
      pickups: this.pickups,
      random: this.random,
      spawnProjectile: (p) => {
        const sim: MkProjectileSim = { ...p, id: this.nextProjId++ };
        this.projectiles.push(sim);
        return sim;
      },
      spawnZone: (z) => {
        const sim: MkZoneSim = { ...z, id: this.nextZoneId++ };
        this.zones.push(sim);
        return sim;
      },
      spawnPickup: (kind, x, y, amount) => {
        const pos = clampToArena(x, y);
        const sim: MkPickupSim = {
          id: this.nextPickupId++,
          kind,
          x: pos.x,
          y: pos.y,
          z: 8,
          vz: 85,
          amount,
          ttlMs: 16000,
        };
        this.pickups.push(sim);
        return sim;
      },
      emitDamage: (x, y, z, amount, kind, label, targetId) => {
        this.tickDamages.push({
          id: this.nextDmgId++,
          x: Math.round(x),
          y: Math.round(y),
          z: Math.round(z),
          amount,
          kind,
          ...(label ? { label } : {}),
          ...(targetId !== undefined ? { targetId } : {}),
        });
      },
      emitFx: (fx) => {
        this.tickFx.push({ ...fx, id: this.nextFxId++, x: Math.round(fx.x), y: Math.round(fx.y) });
      },
      emitUltCutIn: (ev) => {
        this.tickUltCutIns.push({ ...ev, id: this.nextCutInId++ });
      },
      emitSfx: (name) => {
        if (this.tickSfx.length < 18) this.tickSfx.push(name);
      },
      scheduleDelayed: (delayMs, fn) => {
        this.delayedActions.push({ remainingMs: Math.max(0, delayMs), fn });
      },
      onEnemyKilled: (enemy, killer) => {
        this.totalKills += 1;
        this.partyScore += enemy.scoreReward;
        if (killer) killer.kills += 1;
        for (const f of this.fighters) {
          if (!f.left) grantFighterExp(f, enemy.expReward, this.makeContext());
        }
        handleSpecialDrops(enemy, this.makeContext());
      },
      recordDamageAttribution: () => {},
      recordGoldAttribution: () => {},
      addLog: (msg) => {
        this.logs.push(msg);
      },
    };
  }

  private enterWaveIntro(wave: number): void {
    const info = this.director.prepareWave(wave, this.fighters.length, this.random);
    this.phase = 'wave_intro';
    this.phaseLeftMs = MK_WAVE_INTRO_MS;
    this.banner = info.banner;
    this.zones = [];
    this.projectiles = [];
    for (const f of this.fighters) {
      if (f.downed || f.left) continue;
      // Aegis Rune relic grants 20% MaxHP shield per stack at start of every wave!
      const aegis = relicStacks(f, 'aegis_rune');
      if (aegis > 0) {
        f.shieldHp = Math.min(f.maxHp, f.shieldHp + Math.round(f.maxHp * 0.2 * aegis));
      }
    }
    this.hooks.changed();
  }

  private enterRelicDraft(): void {
    this.phase = 'relic_draft';
    this.phaseLeftMs = MK_RELIC_DRAFT_MS;
    this.banner = 'CHỌN 1 THÁNH VẬT ROGUELITE!';
    for (const f of this.fighters) {
      if (f.left) continue;
      const choices = rollMkRelicChoices(f.relics, this.random, 3);
      if (f.ownerId) {
        f.pendingRelicChoices = choices;
      } else if (choices.length > 0) {
        grantRelicToFighter(f, choices[0]);
        recomputeFighterStats(f, this.fighters, 'none');
      }
    }
    this.hooks.changed();
  }

  start(): void {
    if (this.timer) return;
    this.startedAt = Date.now();
    this.lastPumpMs = Date.now();
    this.timer = setInterval(() => this.pump(), PUMP_POLL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private pump(): void {
    if (this.result) {
      this.stop();
      return;
    }
    const now = Date.now();
    const gap = Math.min(MAX_FRAME_GAP_MS, Math.max(0, now - this.lastPumpMs));
    this.lastPumpMs = now;
    this.accumulatorMs += gap;
    let steps = 0;
    while (this.accumulatorMs >= MK_TICK_EXACT_MS && steps < MAX_STEPS_PER_POLL) {
      this.accumulatorMs -= MK_TICK_EXACT_MS;
      this.step(MK_TICK_EXACT_MS);
      steps++;
      if (this.result) break;
    }
    if (steps > 0) this.hooks.tick();
  }

  enqueueCommand(
    playerId: string,
    rawCmd: unknown,
    nowMs = Date.now(),
  ): { ok: boolean; reason?: string; shouldKick?: boolean } {
    if (!this.humanIds.has(playerId) || this.humanLeft.has(playerId)) {
      return { ok: false, reason: 'not_a_player' };
    }
    const rl = this.rateLimiter.consume(playerId, 'cmd', nowMs);
    if (!rl.allowed) {
      return { ok: false, reason: 'rate_limit', shouldKick: rl.shouldKick };
    }
    const parsed = validateMkCommand(rawCmd);
    if (!parsed.ok) {
      const { shouldKick } = this.rateLimiter.recordViolation(`invalid:${playerId}`, nowMs);
      return { ok: false, reason: parsed.reason, shouldKick };
    }
    const q = this.queuedCmds.get(playerId) ?? [];
    if (q.length >= MK_SEC_LIMITS.MAX_CMDS_PER_TICK) {
      return { ok: false, reason: 'queue_full' };
    }
    q.push(parsed.cmd);
    this.queuedCmds.set(playerId, q);
    return { ok: true };
  }

  resign(playerId: string): void {
    this.markPlayerLeft(playerId);
  }

  markPlayerLeft(playerId: string): void {
    this.humanLeft.add(playerId);
    const controlled = this.fighters.find((f) => f.ownerId === playerId);
    if (controlled) {
      if (controlled.originalIsCom) {
        controlled.ownerId = undefined;
      } else {
        controlled.left = true;
        controlled.downed = true;
      }
    }
    this.rateLimiter.clearPlayer(playerId);
    this.checkEndCondition();
  }

  drainLogs(): string[] {
    return this.logs.splice(0, this.logs.length);
  }

  clearTickEvents(): void {
    this.tickDamages = [];
    this.tickFx = [];
    this.tickUltCutIns = [];
    this.tickSfx = [];
  }

  private getControlledFighter(playerId: string): MkFighterSim | undefined {
    return this.fighters.find((f) => f.ownerId === playerId && !f.left);
  }

  private tryDash(f: MkFighterSim, mx?: number, my?: number): boolean {
    if (!canStartAction(f, true) || f.dashCdMs > 0) return false;
    f.dashCdMs = f.dashMaxCdMs;
    f.dashActiveMs = 260;
    const dx = mx !== undefined && Math.abs(mx) > 0.1 ? mx : Math.abs(f.inputMx) > 0.1 ? f.inputMx : f.dir;
    const dy = my !== undefined ? my : f.inputMy;
    const norm = Math.max(1, Math.hypot(dx, dy));
    f.dashVx = (dx / norm) * 330;
    f.dashVy = (dy / norm) * 210;
    if (Math.abs(dx) > 0.1) f.dir = dx >= 0 ? 1 : -1;
    startHeroAction(f, 'dash');
    this.tickSfx.push('dash_whoosh');
    return true;
  }

  private handleSwitchCom(playerId: string, targetId?: string): void {
    if (!this.config.allowSwitchCom) return;
    const current = this.getControlledFighter(playerId);
    if (!current) return;
    const candidates = this.fighters.filter((f) => !f.left && !f.ownerId && f.id !== current.id);
    if (candidates.length === 0) return;
    const target = (targetId ? candidates.find((c) => c.id === targetId) : candidates[0]) ?? candidates[0];
    current.ownerId = undefined;
    current.inputMx = 0;
    current.inputMy = 0;
    current.holdingAtk = false;
    target.ownerId = playerId;
    target.inputMx = 0;
    target.inputMy = 0;
    target.holdingAtk = false;
    this.tickSfx.push('switch_hero');
  }

  private processCommands(ctx: MkSimContext): void {
    for (const [playerId, cmds] of this.queuedCmds) {
      const f = this.getControlledFighter(playerId);
      for (const cmd of cmds) {
        if (cmd.t === 'resign') {
          this.markPlayerLeft(playerId);
          break;
        }
        if (cmd.t === 'switch_com') {
          this.handleSwitchCom(playerId, cmd.targetId);
          continue;
        }
        if (cmd.t === 'skip_phase') {
          if (this.phase === 'wave_clear') this.phaseLeftMs = 0;
          continue;
        }
        if (!f) continue;

        if (cmd.t === 'pick_relic') {
          if (
            this.phase === 'relic_draft' &&
            f.pendingRelicChoices &&
            f.pendingRelicChoices.includes(cmd.relicId)
          ) {
            grantRelicToFighter(f, cmd.relicId);
            recomputeFighterStats(f, this.fighters, 'none');
            f.pendingRelicChoices = undefined;
            ctx.emitSfx('upgrade_ok');
            ctx.addLog(`✨ ${f.name} chọn Thánh Vật ${cmd.relicId}!`);
            // If all human fighters have picked, advance immediately!
            if (this.fighters.every((u) => !u.pendingRelicChoices)) {
              this.phaseLeftMs = 0;
            }
          }
          continue;
        }

        if (cmd.t === 'upgrade') {
          const targetFighter =
            cmd.fighterId ? this.fighters.find((u) => u.id === cmd.fighterId && !u.left) ?? f : f;
          applyUpgradeCommand(targetFighter, cmd.target, ctx);
          continue;
        }

        if (this.phase !== 'combat' && this.phase !== 'wave_intro') continue;

        switch (cmd.t) {
          case 'move':
            f.inputMx = cmd.mx;
            f.inputMy = cmd.my;
            if (cmd.dir) f.dir = cmd.dir;
            else if (Math.abs(cmd.mx) > 0.1) f.dir = cmd.mx >= 0 ? 1 : -1;
            if (cmd.atk !== undefined) f.holdingAtk = cmd.atk;
            break;
          case 'attack':
            if (cmd.mx !== undefined && Math.abs(cmd.mx) > 0.1) f.dir = cmd.mx >= 0 ? 1 : -1;
            if (cmd.hold !== undefined) f.holdingAtk = cmd.hold;
            performBasicAttack(f, ctx);
            break;
          case 'skill':
            executeHeroSkill(f, cmd.slot, ctx);
            break;
          case 'ultimate':
            executeHeroUltimate(f, ctx);
            break;
          case 'dash':
            this.tryDash(f, cmd.mx, cmd.my);
            break;
          case 'guard':
            startGuardParry(f, ctx);
            break;
        }
      }
    }
    this.queuedCmds.clear();
  }

  /** Advance world by one authoritative step (callable directly in deterministic tests). */
  step(dtMs = MK_TICK_EXACT_MS): void {
    if (this.result) return;
    this.tickNo += 1;
    this.elapsedMs += dtMs;
    const ctx = this.makeContext();

    this.processCommands(ctx);

    // Delayed multi-hit / echo callbacks
    if (this.delayedActions.length > 0) {
      const rem: MkDelayedAction[] = [];
      for (const act of this.delayedActions) {
        act.remainingMs -= dtMs;
        if (act.remainingMs <= 0) act.fn();
        else rem.push(act);
      }
      this.delayedActions = rem;
    }

    // Phase state machine
    if (this.phase === 'wave_intro') {
      this.phaseLeftMs -= dtMs;
      if (this.phaseLeftMs <= 0) {
        this.phase = 'combat';
        this.banner = undefined;
      }
    } else if (this.phase === 'wave_clear') {
      this.phaseLeftMs -= dtMs;
      if (this.phaseLeftMs <= 0) {
        this.enterWaveIntro(this.director.wave + 1);
      }
    } else if (this.phase === 'relic_draft') {
      this.phaseLeftMs -= dtMs;
      if (this.phaseLeftMs <= 0) {
        // Auto-pick first option for anyone who timed out
        for (const f of this.fighters) {
          if (f.pendingRelicChoices && f.pendingRelicChoices.length > 0) {
            grantRelicToFighter(f, f.pendingRelicChoices[0]);
            recomputeFighterStats(f, this.fighters, 'none');
            f.pendingRelicChoices = undefined;
          }
        }
        if (this.config.playMode === 'boss_rush' && this.director.wave >= 4) {
          this.finishMatch(true);
          return;
        }
        this.enterWaveIntro(this.director.wave + 1);
      }
    }

    // Update fighters (cooldowns, timers, movement, COM AI, Co-op Revive)
    const dtSec = dtMs * 0.001;
    for (const f of this.fighters) {
      if (f.left) continue;
      f.actionTick += 1;
      f.actionElapsedMs += dtMs;

      if (f.actionLockMs > 0) {
        f.actionLockMs = Math.max(0, f.actionLockMs - dtMs);
        if (f.actionLockMs === 0 && !f.downed) {
          f.actionId = Math.hypot(f.vx, f.vy) > 8 ? 'walk' : 'idle';
          f.actionTick = 0;
        }
      }
      if (f.comboWindowMs > 0) {
        f.comboWindowMs = Math.max(0, f.comboWindowMs - dtMs);
        if (f.comboWindowMs === 0) f.comboStep = 0;
      }
      if (f.comboTimerMs > 0) {
        f.comboTimerMs = Math.max(0, f.comboTimerMs - dtMs);
        if (f.comboTimerMs === 0) f.combo = 0;
      }
      f.attackCdMs = Math.max(0, f.attackCdMs - dtMs);
      f.dashCdMs = Math.max(0, f.dashCdMs - dtMs);
      f.guardCdMs = Math.max(0, f.guardCdMs - dtMs);
      f.guardMs = Math.max(0, f.guardMs - dtMs);
      f.parryWindowMs = Math.max(0, f.parryWindowMs - dtMs);
      f.s1CdMs = Math.max(0, f.s1CdMs - dtMs);
      f.s2CdMs = Math.max(0, f.s2CdMs - dtMs);
      f.s3CdMs = Math.max(0, f.s3CdMs - dtMs);
      f.s4CdMs = Math.max(0, f.s4CdMs - dtMs);
      f.invulnMs = Math.max(0, f.invulnMs - dtMs);
      f.superArmorMs = Math.max(0, f.superArmorMs - dtMs);
      f.furyBuffMs = Math.max(0, f.furyBuffMs - dtMs);
      f.lifestealBuffMs = Math.max(0, f.lifestealBuffMs - dtMs);
      f.counterReadyMs = Math.max(0, f.counterReadyMs - dtMs);
      f.evadeVisMs = Math.max(0, f.evadeVisMs - dtMs);

      if (f.downed) {
        f.vx = 0;
        f.vy = 0;
        // Co-op 2.5s revive when any living ally stands inside MK_REVIVE_RADIUS_PX
        const reviver = this.fighters.find(
          (a) => a.id !== f.id && !a.downed && !a.left && Math.hypot(a.x - f.x, a.y - f.y) <= MK_REVIVE_RADIUS_PX,
        );
        if (reviver) {
          f.reviveProgress = Math.min(1, f.reviveProgress + dtMs / MK_REVIVE_DURATION_MS);
          if (f.reviveProgress >= 1) {
            f.downed = false;
            f.reviveProgress = 0;
            f.hp = Math.round(f.maxHp * 0.5);
            f.invulnMs = 1500;
            f.actionId = 'idle';
            f.actionTick = 0;
            ctx.emitFx({ vfxId: 'holy_pillar', layer: 'front', x: f.x, y: f.y, dir: f.dir, radius: 50, tint: '#4ade80' });
            ctx.emitDamage(f.x, f.y, 20, f.hp, 'heal', 'REVIVE!', f.id);
            ctx.emitSfx('revive_ok');
            ctx.addLog(`💚 ${reviver.name} đã hồi sinh ${f.name}!`);
          }
        } else {
          f.reviveProgress = Math.max(0, f.reviveProgress - dtMs / 4000);
        }
        continue;
      }

      if (!f.ownerId && this.phase === 'combat') {
        stepComBot(f, dtMs, ctx, (u, mx, my) => this.tryDash(u, mx, my));
      }

      if (f.holdingAtk && this.phase === 'combat') {
        performBasicAttack(f, ctx);
      }

      if (f.dashActiveMs > 0) {
        f.dashActiveMs = Math.max(0, f.dashActiveMs - dtMs);
        f.vx = f.dashVx;
        f.vy = f.dashVy;
      } else if (f.actionLockMs <= 0 || f.actionId === 'walk' || f.actionId === 'idle') {
        const mag = Math.hypot(f.inputMx, f.inputMy);
        if (mag > 0.08) {
          const nx = f.inputMx / Math.max(1, mag);
          const ny = f.inputMy / Math.max(1, mag);
          f.vx = nx * f.spd;
          f.vy = ny * f.spd * 0.72;
          if (Math.abs(nx) > 0.1) f.dir = nx >= 0 ? 1 : -1;
          if (f.actionLockMs <= 0 && f.actionId !== 'walk') {
            f.actionId = 'walk';
            f.actionTick = 0;
          }
        } else {
          f.vx = 0;
          f.vy = 0;
          if (f.actionLockMs <= 0 && f.actionId !== 'idle') {
            f.actionId = 'idle';
            f.actionTick = 0;
          }
        }
      } else {
        f.vx *= 0.75;
        f.vy *= 0.75;
      }

      const nextPos = clampToArena(f.x + f.vx * dtSec, f.y + f.vy * dtSec);
      f.x = nextPos.x;
      f.y = nextPos.y;
    }

    // Combat simulation tick
    if (this.phase === 'combat') {
      this.director.stepSpawning(dtMs, this.fighters.length, ctx);
      stepEnemies(dtMs, ctx);
      stepZones(dtMs, ctx);
      stepProjectiles(dtMs, ctx);
      stepPickups(dtMs, ctx);

      // Check wave clear
      const aliveEnemies = this.enemies.filter((e) => e.hp > 0).length;
      if (aliveEnemies === 0 && this.director.remainingToSpawn === 0) {
        const wasBoss = isMkBossWave(this.director.wave, this.config.playMode);
        // Heal living fighters 15% HP between waves
        for (const f of this.fighters) {
          if (!f.downed && !f.left) {
            f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * 0.15));
          }
        }
        if (wasBoss) {
          if (this.config.playMode === 'boss_rush' && this.director.wave >= 4) {
            this.finishMatch(true);
            return;
          }
          this.enterRelicDraft();
        } else {
          this.phase = 'wave_clear';
          this.phaseLeftMs = MK_WAVE_CLEAR_MS;
          this.banner = `HOÀN THÀNH WAVE ${this.director.wave}!`;
          this.hooks.changed();
        }
      }
    } else {
      stepPickups(dtMs, ctx);
    }

    this.checkEndCondition();
  }

  private checkEndCondition(): void {
    if (this.result) return;
    const anyAlive = this.fighters.some((f) => !f.downed && !f.left);
    const anyHumanRemaining = this.fighters.some((f) => !f.originalIsCom && !f.left);
    if (!anyAlive || !anyHumanRemaining) {
      this.finishMatch(false);
    }
  }

  private finishMatch(victory: boolean): void {
    if (this.result) return;
    this.phase = 'ended';
    this.banner = victory ? 'CHIẾN THẮNG HUYỀN THOẠI!' : 'ĐỘI HÌNH ĐÃ GỤC NGÃ';
    this.stop();

    const players: MkPlayerSummary[] = this.fighters.map((f) => ({
      id: f.id,
      name: f.name,
      heroId: f.heroId,
      badge: f.badge,
      isCom: f.originalIsCom,
      level: f.level,
      kills: f.kills,
      parries: f.parries,
      damageDealt: f.damageDealt,
      goldEarned: f.goldEarned,
      relics: [...f.relics.entries()].map(([id, stacks]) => ({ id, stacks })),
    }));
    const sorted = [...players].sort((a, b) => b.damageDealt + b.kills * 80 - (a.damageDealt + a.kills * 80));

    this.result = {
      victory,
      playMode: this.config.playMode,
      waveReached: this.director.wave,
      totalKills: this.totalKills,
      partyScore: this.partyScore,
      elapsedMs: Math.round(this.elapsedMs),
      mvpId: sorted[0]?.id,
      players,
    };
    this.hooks.onEnd?.(this.result);
    this.hooks.changed();
  }

  frameFor(_viewerId: string): MkFrame {
    const aliveBoss = this.enemies.find((e) => e.isBoss && e.hp > 0);
    const boss: MkBossHudView | undefined = aliveBoss
      ? {
          entityId: aliveBoss.id,
          kind: aliveBoss.kind as MkBossHudView['kind'],
          nameVi: aliveBoss.name ?? 'BOSS',
          hp: aliveBoss.hp,
          maxHp: aliveBoss.maxHp,
          phase: aliveBoss.bossPhase,
          enraged: aliveBoss.bossPhase >= 2,
        }
      : undefined;

    const fighters: MkFighterView[] = this.fighters
      .filter((f) => !f.left)
      .map((f) => ({
        id: f.id,
        ownerId: f.ownerId,
        badge: f.badge,
        name: f.name,
        heroId: f.heroId,
        isCom: !f.ownerId,
        x: Math.round(f.x),
        y: Math.round(f.y),
        z: Math.round(f.z),
        vx: Math.round(f.vx),
        vy: Math.round(f.vy),
        dir: f.dir,
        actionId: f.actionId,
        actionTick: f.actionTick,
        comboStep: f.comboStep,
        hp: Math.round(f.hp),
        maxHp: f.maxHp,
        shieldHp: Math.round(f.shieldHp),
        atk: f.atk,
        def: f.def,
        spd: f.spd,
        fury: Math.round(f.fury),
        level: f.level,
        exp: f.exp,
        expToNext: f.expToNext,
        gold: f.gold,
        sp: f.sp,
        kills: f.kills,
        parries: f.parries,
        damageDealt: f.damageDealt,
        combo: f.combo,
        comboTimerMs: Math.round(f.comboTimerMs),
        cds: {
          dash: Math.round(f.dashCdMs),
          dashMax: f.dashMaxCdMs,
          guard: Math.round(f.guardCdMs),
          guardMax: f.guardMaxCdMs,
          s1: Math.round(f.s1CdMs),
          s1Max: f.s1MaxCdMs,
          s2: Math.round(f.s2CdMs),
          s2Max: f.s2MaxCdMs,
          s3: Math.round(f.s3CdMs),
          s3Max: f.s3MaxCdMs,
          s4: Math.round(f.s4CdMs),
          s4Max: f.s4MaxCdMs,
        },
        invulnMs: Math.round(f.invulnMs),
        guardMs: Math.round(f.guardMs),
        superArmorMs: Math.round(f.superArmorMs),
        furyBuffMs: Math.round(f.furyBuffMs),
        evadeVisMs: Math.round(f.evadeVisMs),
        counterReadyMs: Math.round(f.counterReadyMs),
        downed: f.downed,
        reviveProgress: Number(f.reviveProgress.toFixed(2)),
        upgrades: { ...f.upgrades },
        relics: [...f.relics.entries()].map(([id, stacks]) => ({ id, stacks })),
        ...(f.pendingRelicChoices ? { pendingRelicChoices: [...f.pendingRelicChoices] } : {}),
      }));

    const enemies: MkEnemyView[] = this.enemies.map((e) => ({
      id: e.id,
      kind: e.kind,
      isBoss: e.isBoss,
      isElite: e.isElite,
      name: e.name,
      x: Math.round(e.x),
      y: Math.round(e.y),
      z: Math.round(e.z),
      dir: e.dir,
      actionId: e.actionId,
      actionTick: e.actionTick,
      hp: Math.round(e.hp),
      maxHp: e.maxHp,
      bossPhase: e.isBoss ? e.bossPhase : undefined,
      hitFlashMs: Math.round(e.hitFlashMs),
      slowMs: Math.round(e.slowMs),
      burnMs: Math.round(e.burnMs),
      poisonMs: Math.round(e.poisonMs),
      stunMs: Math.round(e.stunMs),
      armorBreakMs: Math.round(e.armorBreakMs),
      telegraphMs: Math.round(e.telegraphMs),
      telegraphX: e.telegraphX !== undefined ? Math.round(e.telegraphX) : undefined,
      telegraphY: e.telegraphY !== undefined ? Math.round(e.telegraphY) : undefined,
      telegraphR: e.telegraphR !== undefined ? Math.round(e.telegraphR) : undefined,
    }));

    const zones: MkZoneView[] = this.zones.map((z) => ({
      id: z.id,
      kind: z.kind,
      x: Math.round(z.x),
      y: Math.round(z.y),
      radius: Math.round(z.radius),
      remainingMs: Math.round(z.remainingMs),
      maxMs: z.maxMs,
      tint: z.tint,
    }));

    const projectiles: MkProjectileView[] = this.projectiles.map((p) => ({
      id: p.id,
      kind: p.kind,
      fromEnemy: p.fromEnemy,
      x: Math.round(p.x),
      y: Math.round(p.y),
      z: Math.round(p.z),
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      dir: p.dir,
      radius: p.radius,
      tint: p.tint,
    }));

    const pickups: MkPickupView[] = this.pickups.map((pk) => ({
      id: pk.id,
      kind: pk.kind,
      x: Math.round(pk.x),
      y: Math.round(pk.y),
      z: Math.round(pk.z),
      amount: pk.amount,
    }));

    const partyGold = this.fighters.reduce((sum, f) => sum + (f.left ? 0 : f.gold), 0);
    const aliveEnemies = this.enemies.filter((e) => e.hp > 0).length;

    return {
      tick: this.tickNo,
      elapsedMs: Math.round(this.elapsedMs),
      phase: this.phase,
      playMode: this.config.playMode,
      wave: this.director.wave,
      biome: this.director.biome,
      phaseLeftMs: Math.max(0, Math.round(this.phaseLeftMs)),
      enemiesRemaining: aliveEnemies + this.director.remainingToSpawn,
      totalWaveEnemies: this.director.totalWaveEnemies,
      partyGold,
      partyScore: this.partyScore,
      totalKills: this.totalKills,
      boss,
      fighters,
      enemies,
      zones,
      projectiles,
      pickups,
      fx: this.tickFx,
      damages: this.tickDamages,
      ultCutIns: this.tickUltCutIns,
      sfx: this.tickSfx,
      banner: this.banner,
    };
  }
}
