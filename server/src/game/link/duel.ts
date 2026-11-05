/**
 * Một trận Nối Thú Đại Chiến (2–10 người, server quyết định mọi thứ):
 * Màn 1 đua dọn bàn → nghỉ 5 giây → cả phòng đánh liên hoàn 3 Boss (Vua Sấm Sét → Nữ Hoàng Nhện → Bạo Chúa),
 * Boss trước gục thì nghỉ 5 giây rồi Boss sau ra. Cả 3 Boss dùng chung một đồng hồ LINK_RAID_S (dừng lúc nghỉ):
 * hạ nhanh thì dư giờ cho Boss sau; hết giờ mà chưa hạ hết thì Boss đang đánh thoát và trận kết thúc.
 * Chạy theo đồng hồ trận `t` (ms) – setInterval gọi tick(250); test gọi tick() trực tiếp.
 */
import {
  LINK_BOSSES,
  LINK_BOSS_BOLT,
  LINK_BOSS_CHAIN,
  LINK_BOSS_DRAIN,
  LINK_BOSS_ROAR_MS,
  LINK_RAID_S,
  LINK_BOSS_COCOON,
  LINK_BOSS_DARK_MS,
  LINK_BOSS_METEOR,
  LINK_BOSS_QUAKE_THUNDER,
  LINK_BOSS_SHIELD,
  LINK_BOSS_VENOM_MS,
  LINK_BOSS_WEB,
  LINK_FOG_MS,
  LINK_SHUFFLE_CD_S,
  LINK_MAX_PLAYERS,
  LINK_BOSS_ICE,
  LINK_CELLS,
  LINK_CLEAR_BONUS,
  LINK_CLEAR_PER_S,
  LINK_CMD_RATE,
  LINK_COMBO_WINDOW_S,
  LINK_FREEZE,
  LINK_HINT_CD_S,
  LINK_HINT_COST,
  LINK_INTERMISSION_S,
  LINK_KO_BONUS,
  LINK_LONG_PATH,
  LINK_STAGE1_S,
  LINK_SUPER_DMG,
  linkBossMaxHp,
  linkPairDamage,
  linkPairPoints,
  linkThunderGain,
  type LinkBossDef,
  type LinkBossId,
  type LinkBossView,
  type LinkCommand,
  type LinkConfig,
  type LinkFoe,
  type LinkFx,
  type LinkResult,
  type LinkRoomView,
  type LinkStage,
  type LinkState,
} from '../../../../shared/src';
import { LinkBoard } from './board';
import { runLinkBot } from './bot';

export interface LinkPlayer {
  id: string;
  name: string;
  bot: boolean;
  board: LinkBoard;
  score1: number;
  damage: number;
  /** số Boss đã kết liễu */
  kos: number;
  /** số cặp nối liên tiếp (0 = không có combo) */
  chain: number;
  lastMatchAt: number;
  thunder: number;
  hintReadyAt: number;
  hint?: [number, number];
  cleared1: boolean;
  tokens: number;
  resigned: boolean;
  darkUntil: number;
  /** trúng Nọc Độc tới lúc này: sát thương giảm một nửa */
  venomUntil: number;
  /** bị Gầm Thét làm choáng tới lúc này: chưa nối được */
  stunUntil: number;
  /** lúc Đảo Bàn hồi chiêu xong */
  shuffleReadyAt: number;
  /** máy: lần nối kế tiếp */
  nextBotAt: number;
}

interface Boss {
  id: LinkBossId;
  def: LinkBossDef;
  /** thứ tự Boss (0, 1, 2) */
  no: number;
  hp: number;
  shield: number;
  maxShield: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  nextSkillAt: number;
  skillIdx: number;
}

export interface LinkDuelHooks {
  /** kết quả / người chơi thay đổi (game cập nhật phòng, trả cược) */
  changed(): void;
  /** trạng thái realtime thay đổi (game gửi link:state) */
  state(): void;
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export class LinkDuel {
  /** đồng hồ trận (ms) */
  t = 0;
  stage: LinkStage = 'stage1';
  stageEndsAt = LINK_STAGE1_S * 1000;
  readonly startedAt = Date.now();
  players: LinkPlayer[];
  boss?: Boss;
  result?: LinkResult;
  /** người thắng Màn 1 (được 50 Sấm đầu Màn 2) */
  stage1Winner?: string;
  private fx: LinkFx[] = [];
  private seq = 0;
  private timer?: ReturnType<typeof setInterval>;
  private lastSent = 0;
  private dirty = false;

  constructor(
    inits: { id: string; name: string; bot: boolean }[],
    readonly cfg: LinkConfig,
    private hooks: LinkDuelHooks,
    seed = newSeed(),
  ) {
    this.players = inits.slice(0, LINK_MAX_PLAYERS).map((p) => ({
      ...p,
      board: LinkBoard.generate(seed),
      score1: 0,
      damage: 0,
      kos: 0,
      chain: 0,
      lastMatchAt: -1e9,
      thunder: 0,
      hintReadyAt: 0,
      cleared1: false,
      tokens: LINK_CMD_RATE,
      resigned: false,
      darkUntil: 0,
      venomUntil: 0,
      stunUntil: 0,
      shuffleReadyAt: LINK_SHUFFLE_CD_S * 1000,
      nextBotAt: 2500,
    }));
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      try {
        this.tick(250);
      } catch (e) {
        console.error('[link] tick lỗi', e);
      }
    }, 250);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  player(id: string) {
    return this.players.find((p) => p.id === id);
  }

  /** người còn trong trận (chưa bỏ cuộc) */
  active() {
    return this.players.filter((p) => !p.resigned);
  }

  /** điểm đang đua: Màn 1 là điểm, từ Màn 2 là tổng */
  private standing(p: LinkPlayer) {
    return this.stage === 'stage1' || this.stage === 'intermission' ? p.score1 : this.total(p);
  }

  /** Mục tiêu chiêu: người được chọn, không thì người đang dẫn đầu (trừ mình) */
  targetFor(p: LinkPlayer, wanted?: string): LinkPlayer | undefined {
    const others = this.active().filter((x) => x !== p);
    const chosen = wanted ? others.find((x) => x.id === wanted) : undefined;
    if (chosen) return chosen;
    return others.sort((a, b) => this.standing(b) - this.standing(a) || b.board.remaining() - a.board.remaining())[0];
  }

  // ---------------- đồng hồ ----------------

  tick(ms: number) {
    if (this.stage === 'ended') return;
    this.t += ms;
    for (const p of this.players) {
      p.tokens = Math.min(LINK_CMD_RATE, p.tokens + (LINK_CMD_RATE * ms) / 1000);
      const before = p.board.ice.size;
      p.board.thaw(this.t);
      if (p.board.ice.size !== before) this.dirty = true;
      if (p.chain && this.t - p.lastMatchAt > LINK_COMBO_WINDOW_S * 1000) {
        p.chain = 0;
        this.dirty = true;
      }
    }
    for (const p of this.players) if (p.bot && !p.resigned && (this.stage as LinkStage) !== 'ended') runLinkBot(this, p);
    if (this.stage === 'stage1' && this.t >= this.stageEndsAt) this.endStage1();
    else if (this.stage === 'intermission' && this.t >= this.stageEndsAt) this.beginStage2();
    else if (this.stage === 'stage2') {
      this.bossStep();
      if (this.stage === 'stage2' && this.t >= this.stageEndsAt) this.finish(`Hết giờ – ${this.boss?.def.name ?? 'Boss'} thoát được.`);
    }
    // đồng bộ đồng hồ mỗi giây, còn lại chỉ gửi khi có thay đổi
    if (this.dirty || this.t - this.lastSent >= 1000) this.emit();
  }

  private emit() {
    this.dirty = false;
    this.lastSent = this.t;
    this.hooks.state();
  }

  // ---------------- lệnh ----------------

  command(playerId: string, cmd: LinkCommand): string | undefined {
    const p = this.player(playerId);
    if (!p) return 'Bạn đang xem trận này.';
    if (this.stage === 'ended') return 'Trận chưa bắt đầu.';
    if (!cmd || typeof cmd !== 'object') return 'Lệnh không hợp lệ.';
    if (p.resigned) return 'Bạn đã bỏ cuộc trận này.';
    if (cmd.t === 'resign') {
      p.resigned = true;
      p.chain = 0;
      p.board.clearLocks();
      this.fx.push({ k: 'clear', who: p.id });
      const left = this.active();
      // còn 1 người, hoặc không còn người thật nào: kết thúc
      if (left.length <= 1) this.finish(`${p.name} bỏ cuộc.`, left[0]?.id);
      else if (!left.some((x) => !x.bot)) this.finish(`${p.name} bỏ cuộc – chỉ còn máy trong trận.`);
      else {
        this.hooks.changed();
        this.emit();
      }
      return undefined;
    }
    if (p.tokens < 1) return 'Thao tác nhanh quá.';
    p.tokens -= 1;
    if (this.stage === 'intermission') return 'Chờ chút, màn mới sắp bắt đầu.';
    switch (cmd.t) {
      case 'match':
        return this.match(p, cmd.a, cmd.b);
      case 'hint': {
        if (this.t < p.hintReadyAt) return 'Gợi ý đang hồi.';
        const h = p.board.hint(this.t);
        if (!h) return 'Chưa có cặp nào nối được, chờ băng tan nhé.';
        p.hint = h;
        p.score1 = Math.max(0, p.score1 - LINK_HINT_COST);
        p.hintReadyAt = this.t + LINK_HINT_CD_S * 1000;
        this.emit();
        return undefined;
      }
      case 'skill': {
        if (this.stage !== 'stage1') return 'Chiêu này chỉ dùng ở Màn 1.';
        if (cmd.kind !== 'freeze' && cmd.kind !== 'fog') return 'Lệnh không hợp lệ.';
        if (p.thunder < 100) return 'Chưa đủ Sấm.';
        const foe = this.targetFor(p, typeof cmd.target === 'string' ? cmd.target : undefined);
        if (!foe) return 'Không còn đối thủ nào.';
        if (cmd.kind === 'freeze') foe.board.freeze(LINK_FREEZE.cells, LINK_FREEZE.ms, this.t);
        else foe.darkUntil = Math.max(foe.darkUntil, this.t + LINK_FOG_MS);
        p.thunder = 0;
        this.fx.push({ k: 'skill', from: p.id, to: foe.id, kind: cmd.kind });
        this.emit();
        return undefined;
      }
      case 'super': {
        if (this.stage !== 'stage2' || !this.boss) return 'Siêu Đấm chỉ dùng khi đánh Boss.';
        if (p.thunder < 100) return 'Chưa đủ Sấm.';
        p.thunder = 0;
        const dmg = this.dmgOf(p, LINK_SUPER_DMG);
        this.fx.push({ k: 'super', who: p.id, dmg });
        this.hitBoss(p, dmg);
        this.emit();
        return undefined;
      }
      case 'shuffle': {
        const wait = this.shuffleIn(p);
        if (wait > 0) return 'Đảo Bàn đang hồi chiêu.';
        if (p.board.isEmpty()) return 'Bàn đã trống.';
        p.board.shuffle();
        p.board.ensureMove(this.t);
        p.hint = undefined;
        p.shuffleReadyAt = this.t + LINK_SHUFFLE_CD_S * 1000;
        this.fx.push({ k: 'shuffle', who: p.id });
        this.emit();
        return undefined;
      }
      default:
        return 'Lệnh không hợp lệ.';
    }
  }

  private match(p: LinkPlayer, a: unknown, b: unknown): string | undefined {
    if (!Number.isInteger(a) || !Number.isInteger(b) || (a as number) < 0 || (b as number) < 0 || (a as number) >= LINK_CELLS || (b as number) >= LINK_CELLS) {
      return 'Lệnh không hợp lệ.';
    }
    const ia = a as number, ib = b as number;
    if (p.stunUntil > this.t) return 'Bạn đang bị choáng!';
    const path = p.board.findPath(ia, ib, this.t);
    if (!path) {
      p.chain = 0;
      this.fx.push({ k: 'miss', who: p.id, a: ia, b: ib });
      this.emit();
      return 'Hai ô này không nối được.';
    }
    const kind = p.board.cells[ia];
    p.board.remove(ia, ib);
    p.hint = undefined;
    p.chain = this.t - p.lastMatchAt <= LINK_COMBO_WINDOW_S * 1000 && p.chain > 0 ? p.chain + 1 : 1;
    p.lastMatchAt = this.t;
    const combo = p.chain - 1;
    p.thunder = Math.min(100, p.thunder + linkThunderGain(combo));
    if (this.stage === 'stage1') {
      const pts = linkPairPoints(combo);
      p.score1 += pts;
      this.fx.push({ k: 'match', who: p.id, a: ia, b: ib, kind, path, combo: p.chain, pts });
    } else {
      const long = LinkBoard.pathLength(path) > LINK_LONG_PATH;
      const dmg = this.dmgOf(p, linkPairDamage(combo, long));
      this.fx.push({ k: 'match', who: p.id, a: ia, b: ib, kind, path, combo: p.chain, pts: dmg });
      this.fx.push({ k: 'hit', who: p.id, a: ia, b: ib, dmg, long, combo: p.chain });
      this.hitBoss(p, dmg);
    }
    if (this.stage === 'ended') return undefined;
    if (p.board.isEmpty()) {
      this.fx.push({ k: 'clear', who: p.id });
      if (this.stage === 'stage1') {
        p.cleared1 = true;
        p.score1 += LINK_CLEAR_BONUS + LINK_CLEAR_PER_S * Math.floor(Math.max(0, this.stageEndsAt - this.t) / 1000);
        this.endStage1();
      } else {
        // dọn sạch khi đánh Boss: phát bàn mới để đánh tiếp
        p.board = LinkBoard.generate(newSeed());
      }
    } else {
      p.board.ensureMove(this.t);
    }
    this.emit();
    return undefined;
  }

  // ---------------- chuyển màn ----------------

  private endStage1() {
    if (this.stage !== 'stage1') return;
    this.stage1Winner = this.topOf(this.active(), (p) => p.score1);
    this.stage = 'intermission';
    this.stageEndsAt = this.t + LINK_INTERMISSION_S * 1000;
    this.hooks.changed();
    this.emit();
  }

  /** Boss tiếp theo: 0 sau Màn 1, rồi 1, 2 sau mỗi lần hạ Boss */
  private nextBossNo = 0;
  /** người kết liễu Boss gần nhất */
  private lastKo?: string;
  /** ms còn lại của đồng hồ đánh Boss (giữ lại lúc nghỉ giữa 2 Boss) */
  private raidLeft = LINK_RAID_S * 1000;

  private beginStage2() {
    const no = this.nextBossNo;
    const def = LINK_BOSSES[no];
    this.stage = 'stage2';
    this.stageEndsAt = this.t + this.raidLeft;
    const hp = linkBossMaxHp(no, this.players.length);
    this.boss = { id: def.id, def, no, hp, maxHp: hp, shield: 0, maxShield: 0, phase: 1, nextSkillAt: this.t + def.skillS[0] * 1000, skillIdx: 0 };
    const seed = newSeed();
    for (const p of this.players) {
      p.board = LinkBoard.generate(seed);
      p.chain = 0;
      p.hint = undefined;
      p.darkUntil = 0;
      p.venomUntil = 0;
      p.stunUntil = 0;
      // Boss đầu: người thắng Màn 1 được 50 Sấm; các Boss sau giữ nguyên Sấm
      if (no === 0) p.thunder = p.id === this.stage1Winner ? 50 : 0;
      p.nextBotAt = this.t + 2500;
    }
    this.fx.push({ k: 'boss', boss: def.id, kind: 'rage', phase: 1 });
    this.hooks.changed();
    this.emit();
  }

  /** Sát thương thật sau Nọc Độc */
  private dmgOf(p: LinkPlayer, dmg: number) {
    return p.venomUntil > this.t ? Math.round(dmg / 2) : dmg;
  }

  /** ms nữa thì được Đảo Bàn (0 = dùng được) */
  shuffleIn(p: LinkPlayer) {
    return Math.max(0, p.shuffleReadyAt - this.t);
  }

  private hitBoss(p: LinkPlayer, dmg: number) {
    const boss = this.boss;
    if (!boss || this.stage !== 'stage2') return;
    // Khiên Đá hút trước, phần còn lại mới trừ máu
    const absorbed = Math.min(dmg, boss.shield);
    boss.shield -= absorbed;
    const real = Math.min(dmg - absorbed, boss.hp);
    boss.hp -= real;
    p.damage += absorbed + real;
    if (boss.hp <= 0) {
      p.kos += 1;
      this.lastKo = p.id;
      this.fx.push({ k: 'ko', who: p.id });
      if (boss.no >= LINK_BOSSES.length - 1) {
        this.finish(`${p.name} hạ gục ${boss.def.name} – cả phòng phá đảo!`);
        return;
      }
      // Boss kế xuất hiện sau màn nghỉ; đồng hồ đánh Boss dừng trong lúc nghỉ
      this.nextBossNo = boss.no + 1;
      this.raidLeft = Math.max(0, this.stageEndsAt - this.t);
      this.stage = 'intermission';
      this.stageEndsAt = this.t + LINK_INTERMISSION_S * 1000;
      for (const x of this.players) x.chain = 0;
      this.hooks.changed();
      return;
    }
    const phase: 1 | 2 | 3 = boss.hp < boss.maxHp * 0.33 ? 3 : boss.hp < boss.maxHp * 0.66 ? 2 : 1;
    if (phase > boss.phase) {
      boss.phase = phase;
      this.fx.push({ k: 'boss', boss: boss.def.id, kind: 'rage', phase });
      boss.nextSkillAt = Math.min(boss.nextSkillAt, this.t + boss.def.skillS[phase - 1] * 1000);
    }
  }

  private bossStep() {
    const boss = this.boss;
    if (!boss || this.t < boss.nextSkillAt) return;
    const skills = boss.def.skills;
    const kind = skills[boss.skillIdx++ % skills.length];
    const alive = this.active();
    let to: string | undefined;
    // người đang gây nhiều sát thương nhất (Kén Tơ, Sét Lan nhắm vào)
    const top = [...alive].sort((a, b) => b.damage - a.damage)[0];
    if (kind === 'cocoon' || kind === 'chain') {
      if (top) {
        if (kind === 'cocoon') top.board.freeze(LINK_BOSS_COCOON.cells, LINK_BOSS_COCOON.ms, this.t, 1);
        else {
          top.board.freeze(LINK_BOSS_CHAIN.cells, LINK_BOSS_CHAIN.ms, this.t, 3);
          top.chain = 0;
        }
        top.hint = undefined;
        to = top.id;
      }
    } else if (kind === 'drain') {
      boss.hp = Math.min(boss.maxHp, boss.hp + Math.round(boss.maxHp * LINK_BOSS_DRAIN));
    } else if (kind === 'shield') {
      boss.maxShield = Math.round(boss.maxHp * LINK_BOSS_SHIELD);
      boss.shield = boss.maxShield;
    } else {
      for (const p of alive) {
        if (kind === 'ice') p.board.freeze(LINK_BOSS_ICE.cells, LINK_BOSS_ICE.ms, this.t, 0);
        else if (kind === 'web') p.board.freeze(LINK_BOSS_WEB.cells, LINK_BOSS_WEB.ms, this.t, 1);
        else if (kind === 'meteor') p.board.freeze(LINK_BOSS_METEOR.cells, LINK_BOSS_METEOR.ms, this.t, 2);
        else if (kind === 'bolt') p.board.freeze(LINK_BOSS_BOLT.cells, LINK_BOSS_BOLT.ms, this.t, 3);
        else if (kind === 'roar') {
          p.stunUntil = this.t + LINK_BOSS_ROAR_MS;
          p.chain = 0;
        }
        else if (kind === 'dark') p.darkUntil = this.t + LINK_BOSS_DARK_MS;
        else if (kind === 'venom') {
          p.venomUntil = this.t + LINK_BOSS_VENOM_MS;
          p.chain = 0;
        } else if (kind === 'quake') {
          p.chain = 0;
          p.thunder = Math.max(0, p.thunder - LINK_BOSS_QUAKE_THUNDER);
        }
        if (kind === 'ice' || kind === 'web' || kind === 'meteor' || kind === 'bolt') p.hint = undefined;
      }
    }
    boss.nextSkillAt = this.t + boss.def.skillS[boss.phase - 1] * 1000;
    this.fx.push({ k: 'boss', boss: boss.def.id, kind, phase: boss.phase, to });
    this.dirty = true;
  }

  total(p: LinkPlayer) {
    return p.score1 + p.damage + p.kos * LINK_KO_BONUS;
  }

  private finish(reason: string, forcedWinner?: string) {
    if (this.stage === 'ended') return;
    const totals: Record<string, number> = {};
    for (const p of this.players) totals[p.id] = this.total(p);
    const winnerId = forcedWinner ?? this.topOf(this.active(), (p) => totals[p.id]);
    const last = LINK_BOSSES.length - 1;
    const allDown = this.boss?.no === last && this.boss.hp <= 0;
    const bossesDown = this.boss ? this.boss.no + (this.boss.hp <= 0 ? 1 : 0) : 0;
    this.result = { winnerId, totals, ko: allDown ? this.lastKo : undefined, bossesDown, reason };
    this.stage = 'ended';
    this.stop();
    this.hooks.changed();
    this.emit();
  }

  /** id người cao nhất (hòa ở đầu bảng thì không ai) */
  private topOf(list: LinkPlayer[], score: (p: LinkPlayer) => number): string | undefined {
    const sorted = [...list].sort((a, b) => score(b) - score(a));
    if (!sorted.length) return undefined;
    if (sorted.length > 1 && score(sorted[0]) === score(sorted[1])) return undefined;
    return sorted[0].id;
  }

  // ---------------- gửi trạng thái ----------------

  /** Lấy hiệu ứng mới (gọi 1 lần cho mỗi đợt gửi, rồi dùng chung cho mọi người) */
  drainFx(): { fx: LinkFx[]; seq: number } {
    const fx = this.fx;
    this.fx = [];
    return { fx, seq: ++this.seq };
  }

  private bossView(): LinkBossView | undefined {
    const b = this.boss;
    if (!b) return undefined;
    const skills = b.def.skills;
    return {
      id: b.def.id,
      no: b.no,
      hp: b.hp,
      maxHp: b.maxHp,
      shield: b.shield,
      maxShield: b.maxShield,
      raidLeft: this.stage === 'stage2' ? Math.max(0, this.stageEndsAt - this.t) : this.raidLeft,
      phase: b.phase,
      nextSkillIn: Math.max(0, b.nextSkillAt - this.t),
      nextSkill: skills[b.skillIdx % skills.length],
    };
  }

  private publicOf(p: LinkPlayer): LinkFoe {
    return {
      id: p.id,
      name: p.name,
      bot: p.bot,
      filled: p.board.filledBits(),
      ice: p.board.iceList(this.t).map(([i]) => i),
      score1: p.score1,
      damage: p.damage,
      combo: p.chain,
      thunder: p.thunder,
      kos: p.kos,
      out: p.resigned,
    };
  }

  /** Trạng thái riêng: người chơi thấy bàn mình đầy đủ, bàn đối thủ chỉ biết ô nào còn / trống */
  stateFor(playerId: string | undefined, pack: { fx: LinkFx[]; seq: number }): LinkState {
    const p = playerId ? this.player(playerId) : undefined;
    const st: LinkState = {
      stage: this.stage,
      left: this.stage === 'ended' ? 0 : Math.max(0, this.stageEndsAt - this.t),
      seq: pack.seq,
      boss: this.bossView(),
      fx: pack.fx,
      result: this.result,
    };
    if (p) {
      st.me = {
        cells: Array.from(p.board.cells),
        ice: p.board.iceList(this.t),
        dark: Math.max(0, p.darkUntil - this.t),
        score1: p.score1,
        damage: p.damage,
        combo: p.chain,
        thunder: p.thunder,
        hintIn: Math.max(0, p.hintReadyAt - this.t),
        hint: p.hint,
        shuffleIn: this.shuffleIn(p),
        venom: Math.max(0, p.venomUntil - this.t),
        stun: Math.max(0, p.stunUntil - this.t),
        kos: p.kos,
      };
      st.foes = this.players.filter((x) => x !== p).map((x) => this.publicOf(x));
    } else {
      st.players = this.players.map((x) => ({ ...this.publicOf(x), cells: Array.from(x.board.cells) }));
    }
    return st;
  }

  roomView(config: LinkConfig): LinkRoomView {
    return {
      config,
      stage: this.stage,
      startedAt: this.startedAt,
      players: this.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot })),
      result: this.result,
    };
  }
}
