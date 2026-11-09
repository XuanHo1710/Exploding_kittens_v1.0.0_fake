/**
 * Một trận Nối Thú Đại Chiến (2–10 người, server quyết định mọi thứ):
 * Màn 1 đua dọn bàn → nghỉ 5 giây → cả phòng đánh liên hoàn Boss (Vua Sấm Sét → Nữ Hoàng Nhện → Bạo Chúa → Song Sát → Đại Ma Vương → Cự Thần Thiên Hà),
 * Cự Thần (Trùm Cuối): mỗi người có 2 bàn `board` (trái) + `board2` (phải), nối ở bàn nào cũng đánh Boss.
 * Boss trước gục thì nghỉ 5 giây rồi Boss sau ra. Cả 3 Boss dùng chung một đồng hồ LINK_RAID_S (dừng lúc nghỉ):
 * hạ nhanh thì dư giờ cho Boss sau; hết giờ mà chưa hạ hết thì Boss đang đánh thoát và trận kết thúc.
 * Chạy theo đồng hồ trận `t` (ms) – setInterval gọi tick(250); test gọi tick() trực tiếp.
 */
import {
  LINK_BOSSES,
  LINK_BOSS_BLACKHOLE,
  LINK_BOSS_BOLT,
  LINK_BOSS_CHAIN,
  LINK_BOSS_DRAIN,
  LINK_BOSS_ECLIPSE,
  LINK_BOSS_HELLFIRE,
  LINK_BOSS_JUDGMENT,
  LINK_BOSS_APOCALYPSE,
  LINK_BOSS_ARM_CANNON,
  LINK_BOSS_EYE_STORM,
  LINK_BOSS_LASER,
  LINK_BOSS_METEOR_RAIN,
  LINK_BOSS_SUPERNOVA,
  LINK_BOSS_TWIN_LASER,
  LINK_BOSS_VORTEX,
  LINK_BOSS_NIRVANA,
  LINK_BOSS_ROAR_MS,
  LINK_BOSS_SOUL_CHAIN,
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
  LINK_H,
  LINK_W,
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
  type LinkLock,
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
  /** bàn thứ 2 (bên phải) – chỉ có khi đánh Boss `dual` */
  board2?: LinkBoard;
  /** gợi ý đang nằm ở bàn nào */
  hintSide: 0 | 1;
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
      hintSide: 0,
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

  /** các bàn của một người (đánh Cự Thần: bàn trái + bàn phải) */
  boardsOf(p: LinkPlayer): LinkBoard[] {
    return p.board2 ? [p.board, p.board2] : [p.board];
  }

  /** Khoá n ô chia đều lên các bàn; trả chỉ số toàn cục (side * LINK_CELLS + ô) */
  private lock(p: LinkPlayer, n: number, ms: number, kind: LinkLock = 0): number[] {
    const boards = this.boardsOf(p);
    const out: number[] = [];
    boards.forEach((b, side) => {
      const k = Math.ceil((n - out.length) / (boards.length - side));
      for (const i of b.freeze(k, ms, this.t, kind)) out.push(side * LINK_CELLS + i);
    });
    if (p.hint && out.some((g) => Math.floor(g / LINK_CELLS) === p.hintSide && p.hint!.includes(g % LINK_CELLS))) p.hint = undefined;
    return out;
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
      for (const b of this.boardsOf(p)) {
        const before = b.ice.size;
        b.thaw(this.t);
        if (b.ice.size !== before) this.dirty = true;
      }
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
      for (const b of this.boardsOf(p)) b.clearLocks();
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
        return this.match(p, cmd.a, cmd.b, cmd.side === 1 ? 1 : 0);
      case 'hint': {
        if (this.t < p.hintReadyAt) return 'Gợi ý đang hồi.';
        let h: [number, number] | undefined;
        let side: 0 | 1 = 0;
        this.boardsOf(p).forEach((b, i) => {
          if (h) return;
          h = b.hint(this.t) ?? undefined;
          side = i as 0 | 1;
        });
        if (!h) return 'Chưa có cặp nào nối được, chờ băng tan nhé.';
        p.hint = h;
        p.hintSide = side;
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
        if (cmd.kind === 'freeze') this.lock(foe, LINK_FREEZE.cells, LINK_FREEZE.ms);
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
        const dmg = this.dmgOf(p, LINK_SUPER_DMG) * (this.boss.def.dmgMul ?? 1);
        this.fx.push({ k: 'super', who: p.id, dmg });
        this.hitBoss(p, dmg);
        this.emit();
        return undefined;
      }
      case 'shuffle': {
        const wait = this.shuffleIn(p);
        if (wait > 0) return 'Đảo Bàn đang hồi chiêu.';
        const boards = this.boardsOf(p).filter((b) => !b.isEmpty());
        if (!boards.length) return 'Bàn đã trống.';
        for (const b of boards) {
          b.shuffle();
          b.ensureMove(this.t);
        }
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

  private match(p: LinkPlayer, a: unknown, b: unknown, side: 0 | 1 = 0): string | undefined {
    const board = side === 1 ? p.board2 : p.board;
    if (!board) return 'Lệnh không hợp lệ.';
    const off = side * LINK_CELLS;
    if (!Number.isInteger(a) || !Number.isInteger(b) || (a as number) < 0 || (b as number) < 0 || (a as number) >= LINK_CELLS || (b as number) >= LINK_CELLS) {
      return 'Lệnh không hợp lệ.';
    }
    const ia = a as number, ib = b as number;
    if (p.stunUntil > this.t) return 'Bạn đang bị choáng!';
    const path = board.findPath(ia, ib, this.t);
    if (!path) {
      p.chain = 0;
      this.fx.push({ k: 'miss', who: p.id, a: off + ia, b: off + ib });
      this.emit();
      return 'Hai ô này không nối được.';
    }
    const kind = board.cells[ia];
    board.remove(ia, ib);
    p.hint = undefined;
    p.chain = this.t - p.lastMatchAt <= LINK_COMBO_WINDOW_S * 1000 && p.chain > 0 ? p.chain + 1 : 1;
    p.lastMatchAt = this.t;
    const combo = p.chain - 1;
    p.thunder = Math.min(100, p.thunder + linkThunderGain(combo));
    if (this.stage === 'stage1') {
      const pts = linkPairPoints(combo);
      p.score1 += pts;
      this.fx.push({ k: 'match', who: p.id, a: off + ia, b: off + ib, kind, path, combo: p.chain, pts, ...(side ? { side } : {}) });
    } else {
      const long = LinkBoard.pathLength(path) > LINK_LONG_PATH;
      const dmg = this.dmgOf(p, linkPairDamage(combo, long)) * (this.boss?.def.dmgMul ?? 1);
      this.fx.push({ k: 'match', who: p.id, a: off + ia, b: off + ib, kind, path, combo: p.chain, pts: dmg, ...(side ? { side } : {}) });
      this.fx.push({ k: 'hit', who: p.id, a: off + ia, b: off + ib, dmg, long, combo: p.chain });
      this.hitBoss(p, dmg);
    }
    if (this.stage === 'ended') return undefined;
    if (board.isEmpty()) {
      this.fx.push({ k: 'clear', who: p.id });
      if (this.stage === 'stage1') {
        p.cleared1 = true;
        p.score1 += LINK_CLEAR_BONUS + LINK_CLEAR_PER_S * Math.floor(Math.max(0, this.stageEndsAt - this.t) / 1000);
        this.endStage1();
      } else {
        // dọn sạch khi đánh Boss: phát bàn mới để đánh tiếp
        if (side === 1) p.board2 = LinkBoard.generate(newSeed());
        else p.board = LinkBoard.generate(newSeed());
      }
    } else {
      board.ensureMove(this.t);
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
    if (def.raidS) this.raidLeft = def.raidS * 1000;
    this.stage = 'stage2';
    this.stageEndsAt = this.t + this.raidLeft;
    const hp = linkBossMaxHp(no, this.players.length);
    this.boss = { id: def.id, def, no, hp, maxHp: hp, shield: 0, maxShield: 0, phase: 1, nextSkillAt: this.t + def.skillS[0] * 1000, skillIdx: 0 };
    const seed = newSeed();
    const seed2 = newSeed();
    for (const p of this.players) {
      p.board = LinkBoard.generate(seed);
      p.board2 = def.dual ? LinkBoard.generate(seed2) : undefined;
      p.hintSide = 0;
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
      // Boss kế xuất hiện sau màn nghỉ; đồng hồ đánh Boss dừng trong lúc nghỉ (riêng Màn Boss 4 có thời gian riêng 6 phút)
      this.nextBossNo = boss.no + 1;
      const nextDef = LINK_BOSSES[this.nextBossNo];
      this.raidLeft = nextDef?.raidS ? nextDef.raidS * 1000 : Math.max(0, this.stageEndsAt - this.t);
      this.stage = 'intermission';
      this.stageEndsAt = this.t + LINK_INTERMISSION_S * 1000;
      for (const x of this.players) x.chain = 0;
      this.hooks.changed();
      return;
    }
    // Boss nhiều thanh máu: mỗi lần vỡ 1 thanh dựng khiên
    const bars = boss.def.bars ?? 1;
    const barsLeft = (hp: number) => Math.ceil((hp / boss.maxHp) * bars - 1e-9);
    const broke = bars > 1 && barsLeft(boss.hp) < barsLeft(boss.hp + real);
    if (broke && boss.def.barShield) {
      const sh = Math.round(boss.maxHp * boss.def.barShield);
      boss.maxShield = Math.max(boss.shield, sh);
      boss.shield = Math.max(boss.shield, sh);
    }
    const phase: 1 | 2 | 3 = boss.hp * 3 <= boss.maxHp ? 3 : boss.hp * 3 <= boss.maxHp * 2 ? 2 : 1;
    if (broke && phase === boss.phase) this.fx.push({ k: 'boss', boss: boss.def.id, kind: 'bar', phase, left: barsLeft(boss.hp) });
    if (phase > boss.phase) {
      boss.phase = phase;
      this.fx.push({ k: 'boss', boss: boss.def.id, kind: 'rage', phase, ...(bars > 1 ? { left: barsLeft(boss.hp) } : {}) });
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
    let hits: Record<string, number[]> | undefined;
    let spin: Record<string, number[]> | undefined;
    // người đang gây nhiều sát thương nhất (Kén Tơ, Sét Lan, Xiềng Xích Linh Hồn nhắm vào)
    const top = [...alive].sort((a, b) => b.damage - a.damage)[0];
    if (kind === 'cocoon' || kind === 'chain' || kind === 'soul_chain') {
      if (top) {
        if (kind === 'cocoon') this.lock(top, LINK_BOSS_COCOON.cells, LINK_BOSS_COCOON.ms, 1);
        else if (kind === 'chain') {
          this.lock(top, LINK_BOSS_CHAIN.cells, LINK_BOSS_CHAIN.ms, 3);
          top.chain = 0;
        } else {
          this.lock(top, LINK_BOSS_SOUL_CHAIN.cells, LINK_BOSS_SOUL_CHAIN.ms, 4);
          top.chain = 0;
          top.stunUntil = this.t + LINK_BOSS_SOUL_CHAIN.stunMs;
        }
        top.hint = undefined;
        to = top.id;
      }
    } else if (kind === 'vortex') {
      // Lốc Xoáy Hỗn Nguyên: đảo lộn toàn bộ thú trên bàn mọi người, mất combo và gợi ý
      for (const p of alive) {
        for (const b of this.boardsOf(p)) {
          if (b.isEmpty()) continue;
          b.shuffle();
          b.ensureMove(this.t);
        }
        p.chain = 0;
        p.hint = undefined;
        p.thunder = Math.max(0, p.thunder - LINK_BOSS_VORTEX.thunder);
      }
    } else if (kind === 'eye_laser') {
      // Ma Nhãn Laze: bắn từ mắt làm choáng 3 / 4 / 5 con thú trên bàn mỗi người
      const n = LINK_BOSS_LASER.cells[boss.phase - 1];
      hits = {};
      for (const p of alive) hits[p.id] = this.lock(p, n, LINK_BOSS_LASER.ms, 5);
    } else if (kind === 'twin_laser') {
      // Song Nhãn Diệt Thế: mỗi mắt bắn 1 bàn, mỗi bàn choáng 2 / 3 / 4 thú
      const n = LINK_BOSS_TWIN_LASER.cells[boss.phase - 1];
      hits = {};
      for (const p of alive) hits[p.id] = this.lock(p, n * this.boardsOf(p).length, LINK_BOSS_TWIN_LASER.ms, 5);
    } else if (kind === 'apocalypse') {
      // Tận Thế Tứ Linh: 4 linh hồn Boss cùng ra đòn – băng, tơ, lửa, điện mỗi loại vài ô, trừ Sấm, mất combo
      hits = {};
      for (const p of alive) {
        const all: number[] = [];
        for (const lk of [0, 1, 2, 3] as const) all.push(...this.lock(p, LINK_BOSS_APOCALYPSE.perKind, LINK_BOSS_APOCALYPSE.ms, lk));
        hits[p.id] = all;
        p.thunder = Math.max(0, p.thunder - LINK_BOSS_APOCALYPSE.thunder);
        p.chain = 0;
      }
    } else if (kind === 'meteor_rain') {
      // Mưa Sao Băng Thiên Hà: thiêu cháy nhiều ô trên mọi bàn
      hits = {};
      for (const p of alive) hits[p.id] = this.lock(p, LINK_BOSS_METEOR_RAIN.cells, LINK_BOSS_METEOR_RAIN.ms, 2);
    } else if (kind === 'gravity') {
      // Trọng Lực Đảo Chiều: bàn trái và bàn phải đổi chỗ cho nhau (có 1 bàn thì lật ngược thứ tự thú)
      for (const p of alive) {
        if (p.board2) [p.board, p.board2] = [p.board2, p.board];
        else {
          p.board.shuffle();
          p.board.ensureMove(this.t);
        }
        p.hint = undefined;
        p.chain = 0;
      }
    } else if (kind === 'board_spin') {
      // Xoay Chuyển Càn Khôn: mỗi bàn bị lật ngang / lật dọc / xoay 180° (ngẫu nhiên từng bàn), mất combo + gợi ý
      spin = {};
      for (const p of alive) {
        spin[p.id] = this.boardsOf(p).map((b) => {
          const m = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
          b.flip(m);
          return m;
        });
        p.hint = undefined;
        p.chain = 0;
      }
    } else if (kind === 'eye_storm') {
      // Bão Sét Thiên Nhãn: sét từ 2 mắt giáng xuống mọi bàn – khoá điện + choáng ngắn, mất combo
      const n = LINK_BOSS_EYE_STORM.cells[boss.phase - 1];
      hits = {};
      for (const p of alive) {
        hits[p.id] = this.lock(p, n * this.boardsOf(p).length, LINK_BOSS_EYE_STORM.ms, 3);
        p.stunUntil = Math.max(p.stunUntil, this.t + LINK_BOSS_EYE_STORM.stunMs);
        p.chain = 0;
      }
    } else if (kind === 'arm_cannon') {
      // Song Thủ Pháo Tinh Hà: mỗi tay bắn 1 tia quét ngang hàng đông thú nhất (trong 3 hàng chọn ngẫu nhiên) của 1 bàn
      hits = {};
      for (const p of alive) {
        const all: number[] = [];
        this.boardsOf(p).forEach((b, side) => {
          let row = 0, most = -1;
          for (let k = 0; k < 3; k++) {
            const y = Math.floor(Math.random() * LINK_H);
            let cnt = 0;
            for (let x = 0; x < LINK_W; x++) if (b.cells[y * LINK_W + x] >= 0) cnt++;
            if (cnt > most) [row, most] = [y, cnt];
          }
          const inRow: number[] = [];
          for (let x = 0; x < LINK_W; x++) if (b.cells[row * LINK_W + x] >= 0) inRow.push(row * LINK_W + x);
          // rải đều dọc theo hàng
          const step = Math.max(1, inRow.length / LINK_BOSS_ARM_CANNON.cells);
          const pick = [...new Set(Array.from({ length: Math.min(LINK_BOSS_ARM_CANNON.cells, inRow.length) }, (_, j) => inRow[Math.floor(j * step)]))];
          for (const i of b.lockAt(pick, LINK_BOSS_ARM_CANNON.ms, this.t, 2)) all.push(side * LINK_CELLS + i);
        });
        hits[p.id] = all;
        if (all.length) p.hint = undefined;
      }
    } else if (kind === 'supernova') {
      // Siêu Tân Tinh: chói loá che bàn + dựng khiên
      for (const p of alive) p.darkUntil = Math.max(p.darkUntil, this.t + LINK_BOSS_SUPERNOVA.darkMs);
      const sh = Math.round(boss.maxHp * LINK_BOSS_SUPERNOVA.shield);
      boss.maxShield = Math.max(boss.maxShield, boss.shield + sh);
      boss.shield += sh;
    } else if (kind === 'drain') {
      boss.hp = Math.min(boss.maxHp, boss.hp + Math.round(boss.maxHp * LINK_BOSS_DRAIN));
    } else if (kind === 'shield') {
      boss.maxShield = Math.round(boss.maxHp * LINK_BOSS_SHIELD);
      boss.shield = boss.maxShield;
    } else if (kind === 'nirvana') {
      boss.hp = Math.min(boss.maxHp, boss.hp + Math.round(boss.maxHp * LINK_BOSS_NIRVANA.heal));
      boss.maxShield = Math.round(boss.maxHp * LINK_BOSS_NIRVANA.shield);
      boss.shield = boss.maxShield;
    } else {
      if (kind === 'judgment') {
        const sh = Math.round(boss.maxHp * LINK_BOSS_JUDGMENT.shield);
        boss.maxShield = Math.max(boss.maxShield, sh);
        boss.shield = Math.max(boss.shield, sh);
      }
      for (const p of alive) {
        if (kind === 'ice') this.lock(p, LINK_BOSS_ICE.cells, LINK_BOSS_ICE.ms, 0);
        else if (kind === 'web') this.lock(p, LINK_BOSS_WEB.cells, LINK_BOSS_WEB.ms, 1);
        else if (kind === 'meteor') this.lock(p, LINK_BOSS_METEOR.cells, LINK_BOSS_METEOR.ms, 2);
        else if (kind === 'bolt') this.lock(p, LINK_BOSS_BOLT.cells, LINK_BOSS_BOLT.ms, 3);
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
        } else if (kind === 'blackhole') {
          this.lock(p, LINK_BOSS_BLACKHOLE.cells, LINK_BOSS_BLACKHOLE.ms, 4);
          p.thunder = Math.max(0, p.thunder - LINK_BOSS_BLACKHOLE.thunder);
        } else if (kind === 'hellfire') {
          this.lock(p, LINK_BOSS_HELLFIRE.cells, LINK_BOSS_HELLFIRE.ms, 2);
          p.chain = 0;
        } else if (kind === 'eclipse') {
          p.darkUntil = this.t + LINK_BOSS_ECLIPSE.darkMs;
          p.venomUntil = this.t + LINK_BOSS_ECLIPSE.venomMs;
          p.chain = 0;
        } else if (kind === 'judgment') {
          this.lock(p, LINK_BOSS_JUDGMENT.voidCells, LINK_BOSS_JUDGMENT.ms, 4);
          this.lock(p, LINK_BOSS_JUDGMENT.fireCells, LINK_BOSS_JUDGMENT.ms, 2);
          p.stunUntil = this.t + LINK_BOSS_JUDGMENT.stunMs;
          p.chain = 0;
          p.thunder = Math.max(0, p.thunder - LINK_BOSS_JUDGMENT.thunder);
        }
        if (kind === 'ice' || kind === 'web' || kind === 'meteor' || kind === 'bolt' || kind === 'blackhole' || kind === 'hellfire' || kind === 'judgment') {
          p.hint = undefined;
        }
      }
    }
    boss.nextSkillAt = this.t + boss.def.skillS[boss.phase - 1] * 1000;
    this.fx.push({ k: 'boss', boss: boss.def.id, kind, phase: boss.phase, to, ...(hits ? { hits } : {}), ...(spin ? { spin } : {}) });
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
        ...(p.board2 ? { cells2: Array.from(p.board2.cells), ice2: p.board2.iceList(this.t) } : {}),
        dark: Math.max(0, p.darkUntil - this.t),
        score1: p.score1,
        damage: p.damage,
        combo: p.chain,
        thunder: p.thunder,
        hintIn: Math.max(0, p.hintReadyAt - this.t),
        hint: p.hint ? [p.hint[0] + p.hintSide * LINK_CELLS, p.hint[1] + p.hintSide * LINK_CELLS] : undefined,
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
