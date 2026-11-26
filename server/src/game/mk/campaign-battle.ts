import {
  CAMPAIGN, CAMPAIGN_ACTION, campaignStats, type CampaignActorFrame, type CampaignFrame,
  type CampaignFx, type CampaignHazard, type CampaignInput, type CampaignProgress, type CampaignSkill,
} from '../../../../shared/src/mk/campaign';

export const CAMPAIGN_TICK = 1000 / 30;
type Direction = -1 | 1;
type Move = { x: number; y: number };
type HeroMove = 'attack' | CampaignSkill;
type Cast = {
  kind: HeroMove | 'enemy' | 'dash' | 'guard';
  start: number;
  end: number;
  hits: { area: CampaignHazard; applied: boolean }[];
  damage: number;
  breakPower: number;
  fx?: string;
  heal?: number;
  shield?: number;
  slow?: boolean;
  struck?: Set<string>;
  movement?: Move;
};
type Actor = Omit<CampaignActorFrame, 'pose'> & {
  speed: number;
  attack: number;
  defense: number;
  born: number;
  hurt: number;
  down: number;
  moved: boolean;
  combo: number;
  lastSwing: number;
  dodgeUntil: number;
  guardUntil: number;
  nextAttack: number;
  activeUntil: number;
  ultimateUntil: number;
  fury: number;
  activeCooldown: number;
  activeRank: number;
  ultimateRank: number;
  shield: number;
  slowUntil: number;
  cast?: Cast;
};

const arena = CAMPAIGN.maps[0];
const [left, top, width, height] = arena.lane;
const enemies = new Map(CAMPAIGN.enemies.map((enemy) => [enemy.id, enemy]));
const heroes = new Map(CAMPAIGN.heroes.map((hero) => [hero.id, hero]));
const bossId = CAMPAIGN.boss.id;
const basicRange: Record<string, number> = { arden: 51, linnet: 140, vesper: 41, brann: 59, maelle: 117, solen: 73 };
const breakPower: Record<string, number> = { arden: 18, linnet: 9, vesper: 22, brann: 34, maelle: 9, solen: 20 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const sign = (value: number): Direction => value < 0 ? -1 : 1;
const metric = (a: Move, b: Move) => Math.hypot(a.x - b.x, 2 * (a.y - b.y));

export function insideCampaignHazard(hazard: CampaignHazard, point: Move, padding = 0): boolean {
  const x = (point.x - hazard.x) * hazard.facing;
  const y = point.y - hazard.y;
  if (hazard.shape === 'band') return x >= -padding && x <= hazard.radius + padding && Math.abs(y) <= hazard.depth + padding;
  if (hazard.shape === 'fan') {
    return x >= -padding && x <= hazard.radius + padding && Math.abs(y) <= hazard.depth * (0.28 + 0.72 * Math.max(0, x) / hazard.radius) + padding;
  }
  if (Math.hypot(x, y * 2) > hazard.radius + padding) return false;
  return hazard.shape !== 'ring' || x <= 0 || Math.abs(y) > 27;
}

function actorBase(id: string, asset: string, side: Actor['side'], x: number, y: number, hp: number, attack: number, speed: number, born = 0): Actor {
  return {
    id, asset, side, x, y, hp, maxHp: hp, attack, speed, born, facing: side === 'hero' ? 1 : -1,
    defense: 0, hurt: 0, down: 0, moved: false, combo: 0, lastSwing: -1000, dodgeUntil: 0, guardUntil: 0,
    nextAttack: born + 200, activeUntil: 0, ultimateUntil: 0, fury: 0, activeCooldown: 0, activeRank: 0, ultimateRank: 0,
    shield: 0, slowUntil: 0,
  };
}

export class CampaignBattle {
  readonly spec: typeof CAMPAIGN.waves[number];
  private readonly actors: Actor[];
  private readonly effects: CampaignFx[] = [];
  private cursor = 0;
  private nextGroupAt = 820;
  private entityId = 0;
  private effectId = 0;
  private input: CampaignInput;
  private pending = 0;
  private inputAt = 0;
  private now = 0;
  private phase = 0;
  private breakMeter = 0;
  private staggerUntil = 0;
  outcome?: 'win' | 'loss';

  constructor(
    readonly id: string, readonly wave: number, readonly roster: string[],
    private controlled: string, progress: CampaignProgress,
  ) {
    this.spec = CAMPAIGN.waves[wave - 1];
    this.input = { attemptId: id, seq: 0, x: 0, y: 0, buttons: 0 };
    this.actors = roster.map((id, index) => {
      const hero = heroes.get(id)!;
      const saved = progress.heroes[id];
      const stats = campaignStats(hero, saved);
      const [x, y] = arena.party;
      return {
        ...actorBase(id, id, 'hero', x - 20 * index, y + 12 * index, stats.hp, stats.atk, hero.speed),
        defense: stats.defense, activeRank: saved.skills.active, ultimateRank: saved.skills.ultimate,
        activeCooldown: stats.activeCooldown,
      };
    });
  }

  acceptInput(input: CampaignInput) {
    if (input.attemptId !== this.id || input.seq <= this.input.seq || this.outcome) return;
    this.input = input;
    this.inputAt = this.now;
    this.pending |= input.buttons & ~CAMPAIGN_ACTION.attack;
  }

  private get party() { return this.actors.filter((a) => a.side === 'hero' && a.hp > 0); }
  private get opponents() { return this.actors.filter((a) => a.side === 'enemy' && a.hp > 0); }
  private get boss() { return this.actors.find((a) => a.boss); }

  private spawnGroup() {
    const group = this.spec.groups[this.cursor];
    if (!group || this.now < this.nextGroupAt) return;
    const live = this.opponents.length;
    const boss = this.boss;
    if (group.gate.startsWith('remaining') && live > Number(group.gate.slice('remaining<='.length))) return;
    if (group.gate.startsWith('bossHp')) {
      if (boss && !boss.hp) {
        this.cursor = this.spec.groups.length;
        return;
      }
      if (!boss || boss.hp * 100 > boss.maxHp * Number(group.gate.slice('bossHp<='.length, -1))) return;
    }
    const mobs = Object.entries(group.mobs).flatMap(([id, count]) => typeof count === 'number' ? [[id, count] as const] : []);
    if (live + mobs.reduce((n, [, count]) => n + count, 0) > this.spec.maxAlive) return;
    const origin = group.entry === 'boss' ? arena.boss! : arena.entries[group.entry as keyof typeof arena.entries];
    const advance = origin[0] > 320 ? -1 : 1;
    let index = 0;
    for (const [id, count] of mobs) {
      const isBoss = id === bossId;
      const data = isBoss ? CAMPAIGN.boss : enemies.get(id)!;
      for (let i = 0; i < count; i++, index++) {
        const unit = actorBase(`enemy-${++this.entityId}`, id, 'enemy',
          clamp(origin[0] + advance * (index % 2) * 18, left, left + width),
          clamp(origin[1] + (index % 3) * 17 - (index ? 8 : 0), top + 4, top + height - 4),
          data.hp, 'damage' in data ? data.damage : data.phases[0].damage, data.speed, this.now + 550);
        unit.boss = isBoss;
        unit.facing = advance;
        this.actors.push(unit);
      }
    }
    this.cursor++;
    this.nextGroupAt = this.now + 1000;
  }

  private closest(actor: Actor, candidates: Actor[]) {
    let best: Actor | undefined;
    let distance = Infinity;
    for (const candidate of candidates) {
      if (candidate.born > this.now || !candidate.hp) continue;
      const d = metric(actor, candidate);
      if (d < distance) { best = candidate; distance = d; }
    }
    return best;
  }

  private move(actor: Actor, x: number, y: number, speed = actor.speed) {
    const magnitude = Math.max(1, Math.hypot(x, y));
    if (actor.slowUntil > this.now) speed *= 0.75;
    if (x) actor.facing = sign(x);
    actor.x = clamp(actor.x + x / magnitude * speed * CAMPAIGN_TICK / 1000, left, left + width);
    actor.y = clamp(actor.y + y / magnitude * speed * 0.66 * CAMPAIGN_TICK / 1000, top, top + height);
    actor.moved = Boolean(x || y);
  }

  private begin(actor: Actor, kind: Cast['kind'], windup: number, active: number, recovery: number, damage = 0, power = 0): Cast {
    const cast: Cast = { kind, start: this.now, end: this.now + windup + active + recovery, damage, breakPower: power, hits: [] };
    actor.cast = cast;
    return cast;
  }

  private area(actor: Actor, shape: CampaignHazard['shape'], radius: number, depth: number, windup: number, point: Move = actor): CampaignHazard {
    return { shape, radius, depth, x: point.x, y: point.y, facing: actor.facing, impactAt: this.now + windup };
  }

  private heroCast(actor: Actor, kind: HeroMove) {
    const hero = heroes.get(actor.asset)!;
    if (kind === 'attack') {
      actor.combo = this.now - actor.lastSwing > 980 ? 0 : (actor.combo + 1) % 3;
      actor.lastSwing = this.now;
      const startup = [132, 132, 186][actor.combo];
      const range = basicRange[actor.asset];
      const cast = this.begin(actor, kind, startup, 80, actor.combo === 2 ? 210 : 145,
        actor.attack * [0.94, 1.04, 1.42][actor.combo], actor.combo === 2 ? 8 : 3);
      const depth = range > 100 ? 13 : 19;
      cast.hits.push({ area: this.area(actor, range > 100 ? 'band' : 'fan', range, depth, startup), applied: false });
      return;
    }

    const spec = hero[kind];
    const rank = kind === 'active' ? actor.activeRank : actor.ultimateRank;
    const [startup, active, recovery] = spec.phasesMs;
    const hits = kind === 'ultimate' && actor.asset === 'linnet' ? 3 : kind === 'ultimate' && actor.asset === 'vesper' ? 2 : 1;
    const cast = this.begin(actor, kind, startup, active, recovery, actor.attack * spec.ratio * (1 + 0.2 * (rank - 1)) / hits,
      (kind === 'ultimate' ? 40 : breakPower[actor.asset]) / hits);
    const shape = actor.asset === 'linnet' || actor.asset === 'solen' ? 'band' :
      kind === 'ultimate' || actor.asset === 'maelle' || actor.asset === 'brann' ? 'circle' : 'fan';
    for (let i = 0; i < hits; i++) {
      cast.hits.push({ area: this.area(actor, shape, spec.range, shape === 'band' ? 18 : 28, startup + 70 * i), applied: false });
    }
    if (kind === 'ultimate' && actor.asset === 'solen') {
      cast.struck = new Set();
      cast.hits = [-10, 10].map((offset) => ({
        area: this.area(actor, 'band', spec.range, 10, startup, { x: actor.x, y: actor.y + offset }), applied: false,
      }));
    }
    cast.fx = actor.asset;
    if (actor.asset === 'maelle') {
      cast.heal = (kind === 'active' ? 14 : 20) + 3 * (rank - 1);
      cast.slow = kind === 'ultimate';
    }
    if (actor.asset === 'arden' && kind === 'ultimate') cast.shield = 18;
    if (kind === 'active') actor.activeUntil = this.now + actor.activeCooldown;
    else { actor.fury = 0; actor.ultimateUntil = this.now + 1400; }
  }

  private heroTurn(hero: Actor, controlled: boolean, buttons: number) {
    const target = this.closest(hero, this.opponents);
    const leader = this.party.find((a) => a.id === this.controlled);
    const x = controlled ? this.input.x : target ? Math.sign(target.x - hero.x) : leader && Math.abs(leader.x - hero.x) > 32 ? Math.sign(leader.x - hero.x) : 0;
    const y = controlled ? this.input.y : target && Math.abs(target.y - hero.y) > 6 ? Math.sign(target.y - hero.y) : 0;
    const fresh = !controlled || this.now - this.inputAt < 260;
    const dodge = controlled && Boolean(buttons & CAMPAIGN_ACTION.dodge);
    const guard = controlled && Boolean(buttons & CAMPAIGN_ACTION.guard);

    if (dodge && this.now >= hero.dodgeUntil && (!hero.cast || hero.cast.hits.some((h) => h.applied))) {
      hero.dodgeUntil = this.now + 900;
      this.begin(hero, 'dash', 0, 170, 80).movement = { x: x || (!y ? hero.facing : 0), y };
    } else if (guard && !hero.cast && this.now >= hero.guardUntil) {
      hero.guardUntil = this.now + 980;
      this.begin(hero, 'guard', 0, 360, 60);
    }
    if (hero.cast?.kind === 'dash' && hero.cast.movement && this.now < hero.cast.start + 170) {
      this.move(hero, hero.cast.movement.x, hero.cast.movement.y, 342);
    }
    if (hero.cast || hero.hurt > this.now) return;
    if (!controlled) {
      const area = this.opponents.flatMap((a) => a.cast?.hits ?? []).find(({ area, applied }) =>
        !applied && area.impactAt - this.now <= 230 && insideCampaignHazard(area, hero));
      if (area) {
        const evasions = [-1, 1].map((direction) => ({ direction, x: hero.x, y: clamp(hero.y + direction * 18, top, top + height) }));
        const safe = evasions.find((p) => !insideCampaignHazard(area.area, p, 2));
        if (safe) {
          this.move(hero, 0, safe.direction);
          return;
        }
      }
    }
    const radius = basicRange[hero.asset];
    const targetInReach = target && Math.abs(target.x - hero.x) <= radius - 3 && Math.abs(target.y - hero.y) <= 12;
    const usable = controlled ? buttons : targetInReach ? CAMPAIGN_ACTION.attack | CAMPAIGN_ACTION.active : 0;
    if (fresh && usable) {
      if (x && controlled) hero.facing = sign(x);
      else if (target && target.x !== hero.x) hero.facing = sign(target.x - hero.x);
      if (usable & CAMPAIGN_ACTION.ultimate && hero.ultimateRank && hero.fury >= 100 && hero.ultimateUntil <= this.now) {
        this.heroCast(hero, 'ultimate');
        return;
      }
      if (usable & CAMPAIGN_ACTION.active && hero.activeRank && hero.activeUntil <= this.now) {
        this.heroCast(hero, 'active');
        return;
      }
      if (usable & CAMPAIGN_ACTION.attack && (!x && !y || targetInReach)) {
        this.heroCast(hero, 'attack');
        return;
      }
    }
    if (fresh) {
      const nearTarget = target && Math.abs(target.x - hero.x) < radius * 0.72;
      this.move(hero, controlled || !nearTarget ? x : 0, y);
    }
  }

  private enemyTurn(enemy: Actor) {
    if (enemy.cast || enemy.hurt > this.now || (enemy.boss && this.now < this.staggerUntil)) return;
    const target = this.closest(enemy, this.party);
    if (!target) return;
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    enemy.facing = sign(dx);
    const reach = enemy.boss ? 72 : enemy.asset === 'thornfly' ? 132 : enemy.asset === 'bellweaver' ? 105 : enemy.asset === 'mossback' ? 105 : 42;
    if (Math.abs(dx) > reach || Math.abs(dy) > 13) {
      this.move(enemy, Math.abs(dx) > reach * 0.74 ? sign(dx) : 0, Math.abs(dy) > 5 ? sign(dy) : 0);
      return;
    }
    if (this.now < enemy.nextAttack) return;
    if (enemy.boss) {
      const phase = CAMPAIGN.boss.phases[this.phase];
      const cast = this.begin(enemy, 'enemy', phase.windupMs, phase.activeMs, phase.recoveryMs, phase.damage);
      const hit = (area: CampaignHazard) => cast.hits.push({ area, applied: false });
      if (this.phase === 0) hit(this.area(enemy, 'fan', 112, 31, phase.windupMs));
      if (this.phase === 1) {
        hit(this.area(enemy, 'band', 216, 16, phase.windupMs));
        const offset = enemy.y < top + height / 2 ? 30 : -30;
        hit(this.area(enemy, 'band', 188, 14, phase.windupMs + 150, { x: enemy.x, y: enemy.y + offset }));
      }
      if (this.phase === 2) hit(this.area(enemy, 'ring', 108, 54, phase.windupMs));
    } else {
      const spec = enemies.get(enemy.asset)!;
      const cast = this.begin(enemy, 'enemy', spec.windupMs, spec.activeMs, spec.recoveryMs, spec.damage);
      const shape = enemy.asset === 'bellweaver' ? 'circle' : 'band';
      cast.hits.push({ area: this.area(enemy, shape, shape === 'circle' ? 39 : reach + 15, 13, spec.windupMs,
        shape === 'circle' ? target : enemy), applied: false });
    }
    enemy.nextAttack = enemy.cast!.end + 260;
  }

  private addBreak(boss: Actor, amount: number) {
    if (this.now < this.staggerUntil || !boss.hp) return;
    this.breakMeter += amount;
    if (this.breakMeter < CAMPAIGN.boss.breakMax) return;
    this.breakMeter = 0;
    this.staggerUntil = this.now + CAMPAIGN.boss.breakStunMs;
    boss.cast = undefined;
  }

  private land(source: Actor, cast: Cast, area: CampaignHazard) {
    const friendly = source.side === 'hero';
    const targets = friendly ? this.opponents : this.party;
    let hit = false;
    if (friendly && (cast.heal || cast.shield)) {
      for (const ally of this.party) {
        if (metric(source, ally) > area.radius) continue;
        if (cast.heal) ally.hp = Math.min(ally.maxHp, ally.hp + cast.heal);
        if (cast.shield) ally.shield = Math.max(ally.shield, cast.shield);
      }
    }
    const caught = targets.filter((actor) => actor.born <= this.now && !cast.struck?.has(actor.id) &&
      insideCampaignHazard(area, actor, actor.boss ? 12 : 4));
    caught.sort((a, b) => metric(source, a) - metric(source, b));
    const limit = source.asset === 'linnet' && cast.kind === 'active' ? 3 :
      source.asset === 'solen' && cast.kind === 'active' ? 2 : Infinity;
    for (const target of caught.slice(0, limit)) {
      const age = target.cast ? this.now - target.cast.start : Infinity;
      const guarding = target.cast?.kind === 'guard' && age < 360;
      if (target.cast?.kind === 'dash' && age >= 30 && age < 160) continue;
      if (guarding && age <= 150) {
        target.fury = Math.min(100, target.fury + 15);
        if (source.boss) this.addBreak(source, 16);
        else { source.cast = undefined; source.hurt = this.now + 210; }
        this.effect('parry', target);
        continue;
      }
      let multiplier = guarding ? 0.45 : 1;
      if (target.asset === 'barkward' && !target.cast && (source.x - target.x) * target.facing >= 0 &&
          Math.abs(source.y - target.y) < 12) multiplier *= 0.4;
      const damage = Math.max(1, Math.round(cast.damage * multiplier * (60 / (60 + target.defense))));
      const absorbed = Math.min(target.shield, damage);
      target.shield -= absorbed;
      target.hp = Math.max(0, target.hp - (damage - absorbed));
      cast.struck?.add(target.id);
      hit = true;
      if (target.boss) this.addBreak(target, cast.breakPower);
      else {
        if (cast.slow) target.slowUntil = this.now + 2000;
        target.hurt = this.now + (friendly ? 105 : 150);
        if (friendly && cast.breakPower >= 18 && target.cast?.kind === 'enemy' &&
            target.cast.hits.every((h) => !h.applied)) target.cast = undefined;
      }
      if (!target.hp) { target.down = this.now; target.cast = undefined; }
      this.effect('impact', target);
    }
    if (friendly && hit && cast.kind !== 'ultimate') {
      source.fury = Math.min(100, source.fury + (cast.kind === 'active' ? 12 : 8));
    }
    if (cast.kind === 'active' && source.asset === 'vesper') {
      source.x = clamp(source.x + source.facing * 56, left, left + width);
    }
    if (cast.fx) this.effect(cast.fx, source);
  }

  private effect(asset: string, actor: Actor) {
    this.effects.push({ id: ++this.effectId, asset, x: actor.x, y: actor.y, facing: actor.facing, startedAt: this.now });
    if (this.effects.length > 28) this.effects.shift();
  }

  step() {
    if (this.outcome) return;
    this.now += CAMPAIGN_TICK;
    if (this.now > 8 * 60_000) { this.outcome = 'loss'; return; }
    while (this.effects.length && this.effects[0].startedAt < this.now - 450) this.effects.shift();
    this.spawnGroup();
    const boss = this.boss;
    if (boss?.hp && !boss.cast) {
      const newPhase = boss.hp * 100 <= boss.maxHp * 30 ? 2 : boss.hp * 100 <= boss.maxHp * 65 ? 1 : 0;
      if (newPhase > this.phase) {
        this.phase++;
        boss.nextAttack = Math.max(boss.nextAttack, this.now + 400);
      }
    }
    const buttons = this.pending | (this.now - this.inputAt < 260 ? this.input.buttons & CAMPAIGN_ACTION.attack : 0);
    this.pending = 0;
    const party = this.party;
    const selected = party.findIndex((h) => h.id === this.controlled);
    if (party.length && (selected === -1 || buttons & CAMPAIGN_ACTION.switch)) {
      this.controlled = party[(selected + 1) % party.length].id;
    }
    for (const actor of this.actors) {
      actor.moved = false;
      if (!actor.hp || actor.born > this.now) continue;
      if (actor.cast) {
        const cast = actor.cast;
        for (const hit of cast.hits) {
          if (hit.applied || this.now < hit.area.impactAt) continue;
          hit.applied = true;
          this.land(actor, cast, hit.area);
        }
        if (actor.cast === cast && this.now >= cast.end) actor.cast = undefined;
      }
      if (actor.side === 'hero') this.heroTurn(actor, actor.id === this.controlled, buttons);
      else this.enemyTurn(actor);
    }
    if (!this.party.length) this.outcome = 'loss';
    else if (!this.opponents.length && this.cursor === this.spec.groups.length) this.outcome = 'win';
  }

  private pose(actor: Actor): number {
    const short = actor.side === 'enemy' && !actor.boss;
    if (!actor.hp) return short ? 10 : 14;
    if (actor.boss && this.now < this.staggerUntil) return 13;
    if (actor.hurt > this.now) return short ? 9 : 13;
    const cast = actor.cast;
    if (cast) {
      if (cast.kind === 'dash') return short ? 7 : 11;
      if (cast.kind === 'guard') return short ? 8 : 12;
      if (cast.hits.some((h) => h.applied)) return short ? 5 : cast.kind === 'attack' ? 6 + actor.combo : 10;
      return short ? 4 : cast.kind === 'attack' || cast.kind === 'enemy' ? 5 : 9;
    }
    if (actor.moved) return 2 + (Math.floor(this.now / 95) % (short ? 2 : 3));
    return Math.floor(this.now / 240) % 2;
  }

  snapshot(): CampaignFrame {
    const enemy = this.opponents;
    return {
      attemptId: this.id, wave: this.wave, time: Math.round(this.now), controlled: this.controlled,
      phase: this.outcome ? 'settling' : this.now < 820 ? 'intro' : 'combat',
      actors: this.actors.filter((a) => a.born <= this.now && (a.hp || a.side === 'hero' || this.now - a.down < 380))
        .map((a) => ({
          id: a.id, asset: a.asset, side: a.side, x: a.x, y: a.y, facing: a.facing, hp: a.hp, maxHp: a.maxHp,
          pose: this.pose(a), boss: a.boss, fury: a.fury, activeUntil: a.activeUntil, ultimateUntil: a.ultimateUntil,
        })),
      remaining: enemy.length, groups: this.cursor, totalGroups: this.spec.groups.length,
      hazards: enemy.flatMap((a) => a.cast?.hits.filter((h) => !h.applied).map((h) => h.area) ?? []),
      spawn: enemy.filter((a) => a.born > this.now).map(({ x, y }) => ({ x, y })),
      effects: [...this.effects], bossPhase: this.phase, bossBreak: this.breakMeter, bossStaggerUntil: this.staggerUntil,
    };
  }
}
