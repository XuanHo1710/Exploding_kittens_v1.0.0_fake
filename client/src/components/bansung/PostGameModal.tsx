import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Award,
  Clock,
  Coins,
  Crown,
  Flame,
  HeartHandshake,
  Home,
  LogOut,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  BANSUNG_MVP_WEIGHTS,
  BANSUNG_STATIC_ROOT,
  getBansungHero,
  resolveBansungGameMode,
  type BansungBadgeId,
  type BansungHeroId,
  type BansungHeroSpec,
  type BansungPlayerStats,
  type BansungResult,
  type RoomView,
} from '../../../../shared/src';
import PlayerAvatar from '../../art/PlayerAvatar';
import { useBansungHud } from '../../bansung/store';
import { fmtCoins } from '../Dock';

// ============================================================================
// 1. Public Props & Metadata Helpers
// ============================================================================

export interface PostGameModalProps {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  /** Optional explicit result override; defaults to `view.bansung?.result`. */
  result?: BansungResult;
  /** Optional custom Play Again handler (defaults to `emit('game:restart')`). */
  onPlayAgain?: () => void;
  /** Optional custom Return to Lobby handler (defaults to `emit('game:restart')`). */
  onReturnToLobby?: () => void;
  /** Optional custom Leave Room handler (defaults to `emit('room:leave')`). */
  onLeave?: () => void;
  /** Optional dismiss handler (renders close X & Escape support when provided). */
  onClose?: () => void;
}

export interface BansungBadgeMeta {
  id: BansungBadgeId;
  label: string;
  desc: string;
  color: string;
  bg: string;
}

export const BANSUNG_BADGE_META: Readonly<Record<BansungBadgeId, BansungBadgeMeta>> = {
  mvp: {
    id: 'mvp',
    label: 'MVP',
    desc: 'Chiến binh xuất sắc nhất trận',
    color: '#ffd43b',
    bg: 'rgba(255, 212, 59, 0.18)',
  },
  slayer: {
    id: 'slayer',
    label: 'Sát Thủ',
    desc: 'Hạ nhiều quái nhất',
    color: '#ff6b6b',
    bg: 'rgba(255, 107, 107, 0.16)',
  },
  medic: {
    id: 'medic',
    label: 'Cứu Thương',
    desc: 'Hồi sinh đồng đội nhiều nhất',
    color: '#51cf66',
    bg: 'rgba(81, 207, 102, 0.16)',
  },
  stunner: {
    id: 'stunner',
    label: 'Khống Chế',
    desc: 'Gây choáng nhiều nhất',
    color: '#22d3ee',
    bg: 'rgba(34, 211, 238, 0.16)',
  },
  boss_breaker: {
    id: 'boss_breaker',
    label: 'Diệt Trùm',
    desc: 'Sát thương Boss cao nhất',
    color: '#ff922b',
    bg: 'rgba(255, 146, 43, 0.16)',
  },
};

const BIOME_LABELS: Readonly<Record<string, string>> = {
  desert: 'Tàn Tích Sa Mạc',
  desert_ruins: 'Tàn Tích Sa Mạc',
  crypt: 'Hầm Mộ Đỏ',
  crimson_crypt: 'Hầm Mộ Đỏ',
  cyber: 'Phòng Thí Nghiệm',
  cyber_lab: 'Phòng Thí Nghiệm',
};

const DIFFICULTY_LABELS: Readonly<Record<string, string>> = {
  normal: 'Thường',
  hard: 'Khó',
  hell: 'Ác Mộng',
  nightmare: 'Ác Mộng',
};

const REVIVE_LABELS: Readonly<Record<string, string>> = {
  coop: 'Đồng đội cứu',
  circle: 'Vòng hồi sinh 72px',
  wave_only: 'Hồi sau mỗi đợt',
  hardcore: 'Khắc nghiệt',
};

const HERO_ID_ALIASES: Readonly<Record<string, BansungHeroId>> = {
  mascot: 'mascot',
  mascot_gunner: 'mascot',
  ranger: 'ranger',
  cyber_ranger: 'ranger',
  pyro: 'pyro',
  pyromancer: 'pyro',
  knight: 'knight',
  laser: 'laser',
  laser_vanguard: 'laser',
};

/** Maps canonical or draft hero IDs to a valid `BansungHeroId`. */
export function resolveBansungHeroId(raw: string | undefined): BansungHeroId {
  if (!raw) return 'mascot';
  return HERO_ID_ALIASES[raw] ?? 'mascot';
}

/** Formats duration in milliseconds as `mm:ss` (clamped at 0). */
export function formatMatchDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.floor((Number.isFinite(durationMs) ? durationMs : 0) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatSignedCoins(delta: number): string {
  if (delta > 0) return `+${fmtCoins(delta)}`;
  if (delta < 0) return `-${fmtCoins(Math.abs(delta))}`;
  return '0';
}

function formatCompactInt(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString('vi-VN');
}

// ============================================================================
// 2. Result Normalization & Coin Payout Breakdown
// ============================================================================

export interface CoinPayoutRow {
  id: string;
  name: string;
  isMe: boolean;
  isMvp: boolean;
  left: boolean;
  bet: number;
  payout: number;
  netDelta: number;
  score: number;
}

export interface CoinPayoutSummary {
  hasWager: boolean;
  bet: number;
  pot: number;
  basePool: number;
  perfPool: number;
  victory: boolean;
  rows: CoinPayoutRow[];
  myRow?: CoinPayoutRow;
}

function sortStatsDesc(a: BansungPlayerStats, b: BansungPlayerStats): number {
  return (
    b.score - a.score ||
    b.revives - a.revives ||
    b.damageDealt - a.damageDealt ||
    b.kills - a.kills ||
    a.deaths - b.deaths
  );
}

function computeMvpScoreLocal(s: {
  kills: number;
  elitesKilled: number;
  damageDealt: number;
  bossDamage: number;
  stunsInflicted: number;
  revives: number;
  deaths: number;
}): number {
  return Math.max(
    0,
    Math.round(
      s.kills * BANSUNG_MVP_WEIGHTS.kill +
        s.elitesKilled * BANSUNG_MVP_WEIGHTS.elite +
        s.damageDealt * BANSUNG_MVP_WEIGHTS.damage +
        s.bossDamage * BANSUNG_MVP_WEIGHTS.bossDamage +
        s.stunsInflicted * BANSUNG_MVP_WEIGHTS.stun +
        s.revives * BANSUNG_MVP_WEIGHTS.revive +
        s.deaths * BANSUNG_MVP_WEIGHTS.death,
    ),
  );
}

function normalizeResultPlayers(
  rawResult: BansungResult | undefined,
  view: RoomView,
): BansungPlayerStats[] {
  const roster = view.bansung?.players ?? [];
  const roomPlayers = view.players;

  if (rawResult?.players && rawResult.players.length > 0) {
    return [...rawResult.players].sort(sortStatsDesc);
  }

  // Fallback for compact `BansungResult.stats` payload (d02 draft format)
  if (rawResult?.stats && rawResult.stats.length > 0) {
    const built: BansungPlayerStats[] = rawResult.stats.map((st) => {
      const info = roster.find((r) => r.id === st.id || r.idx === st.idx);
      const roomP = roomPlayers.find((p) => p.id === st.id);
      const payout = view.payouts?.[st.id] ?? st.coinPayout ?? 0;
      const coinDelta = view.bet > 0 && !info?.bot ? payout - view.bet : 0;
      const deaths = info && !info.alive ? 1 : 0;
      const score = computeMvpScoreLocal({
        kills: st.kills,
        elitesKilled: 0,
        damageDealt: st.damage,
        bossDamage: 0,
        stunsInflicted: st.stuns,
        revives: st.revives,
        deaths,
      });
      return {
        id: st.id,
        name: info?.name ?? roomP?.name ?? `Player ${st.idx + 1}`,
        heroId: info?.hero ?? view.bansung?.heroes?.[st.id] ?? 'mascot',
        bot: info?.bot ?? st.id.startsWith('bot:'),
        left: roomP?.left,
        kills: st.kills,
        elitesKilled: 0,
        damageDealt: st.damage,
        bossDamage: 0,
        damageTaken: 0,
        stunsInflicted: st.stuns,
        revives: st.revives,
        deaths,
        score,
        badges: [],
        coinDelta,
      };
    });

    built.sort(sortStatsDesc);
    const mvp =
      built.find((p) => p.id === rawResult.mvpId) ??
      built.find((p) => !p.bot && !p.left) ??
      built[0];
    if (mvp) mvp.badges.push('mvp');
    const awardMax = (badge: BansungBadgeId, pick: (p: BansungPlayerStats) => number) => {
      let best: BansungPlayerStats | undefined;
      let bestVal = 0;
      for (const p of built) {
        const val = pick(p);
        if (val > bestVal) {
          bestVal = val;
          best = p;
        }
      }
      if (best && !best.badges.includes(badge)) best.badges.push(badge);
    };
    awardMax('slayer', (p) => p.kills);
    awardMax('medic', (p) => p.revives);
    awardMax('stunner', (p) => p.stunsInflicted);
    awardMax('boss_breaker', (p) => p.bossDamage);
    return built;
  }

  // Last-resort fallback from roster / room players if `result` not yet hydrated
  const sourceList =
    roster.length > 0
      ? roster.map((r) => ({
          id: r.id,
          name: r.name,
          heroId: r.hero,
          bot: r.bot,
          left: roomPlayers.find((rp) => rp.id === r.id)?.left,
          alive: r.alive,
        }))
      : roomPlayers.map((rp) => ({
          id: rp.id,
          name: rp.name,
          heroId: view.bansung?.heroes?.[rp.id] ?? 'mascot',
          bot: false,
          left: rp.left,
          alive: rp.alive,
        }));

  return sourceList.map((entry, idx) => ({
    id: entry.id,
    name: entry.name,
    heroId: entry.heroId,
    bot: entry.bot,
    left: entry.left,
    kills: 0,
    elitesKilled: 0,
    damageDealt: 0,
    bossDamage: 0,
    damageTaken: 0,
    stunsInflicted: 0,
    revives: 0,
    deaths: entry.alive ? 0 : 1,
    score: 0,
    badges: idx === 0 && rawResult?.mvpId === entry.id ? ['mvp'] : [],
    coinDelta:
      view.bet > 0 && !entry.bot && view.payouts?.[entry.id] !== undefined
        ? view.payouts[entry.id] - view.bet
        : 0,
  }));
}

export function buildCoinPayoutSummary(
  view: RoomView,
  players: readonly BansungPlayerStats[],
  victory: boolean,
  mvpId: string | undefined,
  meId: string,
): CoinPayoutSummary {
  const bet = Math.max(0, view.bet || 0);
  const pot = Math.max(0, view.pot || 0);
  const hasWager = bet > 0 || pot > 0;
  const basePool = Math.floor(pot * 0.7);
  const perfPool = Math.max(0, pot - basePool);

  const humans = players.filter((p) => !p.bot);
  const rows: CoinPayoutRow[] = humans.map((p) => {
    const roomP = view.players.find((rp) => rp.id === p.id);
    const left = Boolean(p.left ?? roomP?.left);
    const explicitPayout = view.payouts?.[p.id];
    const payout =
      explicitPayout !== undefined
        ? explicitPayout
        : hasWager
          ? Math.max(0, bet + p.coinDelta)
          : 0;
    const netDelta = hasWager
      ? explicitPayout !== undefined
        ? explicitPayout - bet
        : p.coinDelta
      : 0;

    return {
      id: p.id,
      name: p.name,
      isMe: p.id === meId,
      isMvp: p.id === mvpId || p.badges.includes('mvp'),
      left,
      bet,
      payout,
      netDelta,
      score: p.score,
    };
  });

  // Include any human in view.players who wasn't in stats (e.g. early leaver)
  for (const rp of view.players) {
    if (rows.some((r) => r.id === rp.id)) continue;
    const explicitPayout = view.payouts?.[rp.id];
    const payout = explicitPayout ?? (rp.left ? 0 : victory ? 0 : bet);
    const netDelta = hasWager ? payout - bet : 0;
    rows.push({
      id: rp.id,
      name: rp.name,
      isMe: rp.id === meId,
      isMvp: rp.id === mvpId,
      left: Boolean(rp.left),
      bet,
      payout,
      netDelta,
      score: 0,
    });
  }

  return {
    hasWager,
    bet,
    pot,
    basePool,
    perfPool,
    victory,
    rows,
    myRow: rows.find((r) => r.isMe),
  };
}

// ============================================================================
// 3. Subcomponents (Animated Pixel Hero Spotlight & Badges)
// ============================================================================

function HeroIdleSprite({
  hero,
  size = 76,
  victory,
}: {
  hero: BansungHeroSpec;
  size?: number;
  victory: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [frames, setFrames] = useState(4);
  // Spec 007 v2: dải idle nhìn thẳng 6 frame vẽ mới (số frame tự đo trong onLoad)
  const spriteSrc = `${BANSUNG_STATIC_ROOT}/normalized/heroes/hero_${hero.id}_idle_down.png`;

  useEffect(() => {
    setBroken(false);
    setFrames(4);
  }, [hero.id]);

  return (
    <div
      className={`bs-end-sprite-stage${victory ? ' win' : ' lose'}`}
      style={
        {
          '--bs-stage-size': `${size}px`,
          '--bs-hero-primary': hero.primaryHex,
          '--bs-hero-accent': hero.accentHex,
        } as CSSProperties
      }
      aria-label={hero.name}
    >
      <span className="bs-end-sprite-shadow" />
      {!broken ? (
        <div className="bs-end-sprite-clip">
          <img
            src={spriteSrc}
            alt={hero.name}
            draggable={false}
            className="bs-end-sprite-strip"
            style={
              {
                width: `${frames * 100}%`,
                animationTimingFunction: `steps(${frames}, end)`,
                animationDuration: `${Math.max(0.4, frames / 6).toFixed(2)}s`,
              } as CSSProperties
            }
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              const h = e.currentTarget.naturalHeight;
              if (w > 0 && h > 0) {
                setFrames(Math.max(1, Math.round(w / h)));
              }
            }}
            onError={() => setBroken(true)}
          />
        </div>
      ) : (
        <div className="bs-end-sprite-fallback" aria-hidden="true">
          <span className="bs-end-fallback-head" />
          <span className="bs-end-fallback-body" />
        </div>
      )}
    </div>
  );
}

function BadgeIcon({ id, size = 12 }: { id: BansungBadgeId; size?: number }) {
  switch (id) {
    case 'mvp':
      return <Crown size={size} />;
    case 'slayer':
      return <Skull size={size} />;
    case 'medic':
      return <HeartHandshake size={size} />;
    case 'stunner':
      return <Zap size={size} />;
    case 'boss_breaker':
      return <Flame size={size} />;
  }
}

function BadgeChip({ id, compact = false }: { id: BansungBadgeId; compact?: boolean }) {
  const meta = BANSUNG_BADGE_META[id];
  if (!meta) return null;
  return (
    <span
      className={`bs-end-badge${compact ? ' compact' : ''}`}
      style={{ color: meta.color, background: meta.bg, borderColor: meta.color }}
      title={meta.desc}
    >
      <BadgeIcon id={id} size={compact ? 11 : 13} />
      <span>{meta.label}</span>
    </span>
  );
}

// ============================================================================
// 4. Scoped Soul-Knight Pixel Modal Styles
// ============================================================================

const POSTGAME_CSS = `
.bs-end {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 14px;
  background: radial-gradient(circle at 50% 35%, rgba(20, 24, 38, 0.72), rgba(6, 8, 14, 0.88));
  backdrop-filter: blur(4px);
  color: #f3f1ea;
  font-variant-numeric: tabular-nums;
  animation: bs-end-fade 0.18s ease-out;
}
@keyframes bs-end-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.bs-end-card {
  position: relative;
  width: min(940px, 100%);
  max-height: calc(100vh - 28px);
  max-height: calc(100dvh - 28px);
  overflow-y: auto;
  padding: 18px 20px;
  background: linear-gradient(180deg, #1a1e2e 0%, #121521 100%);
  border: 2px solid #090b10;
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 2px #3b4254,
    0 6px 0 #090b10,
    0 20px 56px rgba(0, 0, 0, 0.72);
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bs-end-card.win {
  box-shadow:
    inset 0 0 0 2px rgba(255, 212, 59, 0.75),
    0 6px 0 #090b10,
    0 20px 60px rgba(255, 193, 7, 0.16);
}
.bs-end-card.lose {
  box-shadow:
    inset 0 0 0 2px rgba(250, 82, 82, 0.65),
    0 6px 0 #090b10,
    0 20px 60px rgba(224, 49, 49, 0.16);
}
.bs-end-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 4px;
  background: #23283c;
  border: 2px solid #0b0e14;
  box-shadow: inset 0 0 0 1px #475068;
  color: #adb5bd;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.bs-end-close:hover { color: #fff; border-color: #ffd43b; }

.bs-end-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 10px 14px 12px;
  border-radius: 4px;
  border: 2px solid #0b0e14;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(0, 0, 0, 0.22));
}
.bs-end-banner.win {
  background: linear-gradient(180deg, rgba(255, 212, 59, 0.16), rgba(232, 89, 12, 0.05));
  box-shadow: inset 0 0 0 1px rgba(255, 212, 59, 0.35);
}
.bs-end-banner.lose {
  background: linear-gradient(180deg, rgba(250, 82, 82, 0.18), rgba(134, 25, 25, 0.06));
  box-shadow: inset 0 0 0 1px rgba(250, 82, 82, 0.35);
}
.bs-end-title-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.bs-end-title {
  margin: 0;
  font-size: clamp(20px, 3vw, 27px);
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-shadow: 0 2px 0 #090b10;
}
.bs-end-banner.win .bs-end-title { color: #ffd43b; }
.bs-end-banner.lose .bs-end-title { color: #ff6b6b; }
.bs-end-reason {
  margin: 0;
  font-size: 13.5px;
  color: #ced4da;
}
.bs-end-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
}
.bs-end-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(10, 12, 18, 0.72);
  border: 1px solid #3b4254;
  color: #e9ecef;
}
.bs-end-pill.gold { border-color: rgba(255, 212, 59, 0.65); color: #ffe066; }
.bs-end-pill.cyan { border-color: rgba(34, 211, 238, 0.6); color: #66d9e8; }

.bs-end-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 12px;
}
.bs-end-box {
  padding: 12px 14px;
  background: rgba(12, 15, 24, 0.86);
  border: 2px solid #090b10;
  box-shadow: inset 0 0 0 1px #2f3648;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bs-end-box-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #adb5bd;
}

.bs-end-mvp-body {
  display: flex;
  align-items: center;
  gap: 14px;
}
.bs-end-sprite-stage {
  position: relative;
  width: var(--bs-stage-size, 76px);
  height: var(--bs-stage-size, 76px);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 4px;
  border: 2px solid #090b10;
  background: radial-gradient(circle at 50% 62%, rgba(255, 255, 255, 0.09), rgba(9, 11, 16, 0.92));
  box-shadow: inset 0 0 0 1px rgba(255, 212, 59, 0.35);
}
.bs-end-sprite-stage.lose {
  box-shadow: inset 0 0 0 1px rgba(255, 107, 107, 0.3);
}
.bs-end-sprite-shadow {
  position: absolute;
  bottom: 8px;
  left: 50%;
  width: 52%;
  height: 10px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.58);
}
.bs-end-sprite-clip {
  position: relative;
  width: 84%;
  height: 84%;
  overflow: hidden;
}
.bs-end-sprite-strip {
  display: block;
  height: 100%;
  max-width: none;
  image-rendering: pixelated;
  animation-name: bs-strip-loop;
  animation-iteration-count: infinite;
}
@keyframes bs-strip-loop {
  from { transform: translateX(0); }
  to { transform: translateX(-100%); }
}
.bs-end-sprite-fallback {
  position: relative;
  width: 34px;
  height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.bs-end-fallback-head {
  width: 18px;
  height: 16px;
  border-radius: 3px;
  background: var(--bs-hero-primary, #f8f9fa);
  border: 2px solid #181425;
  box-shadow: inset 0 -4px 0 var(--bs-hero-accent, #4dabf7);
}
.bs-end-fallback-body {
  width: 22px;
  height: 18px;
  border-radius: 3px;
  background: var(--bs-hero-accent, #4dabf7);
  border: 2px solid #181425;
}

.bs-end-mvp-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.bs-end-mvp-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.bs-end-mvp-name {
  font-size: 16px;
  font-weight: 800;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bs-end-mvp-class {
  font-size: 12px;
  color: #adb5bd;
  display: flex;
  align-items: center;
  gap: 6px;
}
.bs-end-hero-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
  border: 1px solid #0b0e14;
}
.bs-end-mvp-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-top: 2px;
}
.bs-end-stat-mini {
  padding: 4px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid #2b3142;
  display: flex;
  flex-direction: column;
}
.bs-end-stat-mini span { font-size: 10px; color: #868e96; text-transform: uppercase; }
.bs-end-stat-mini b { font-size: 13px; color: #f8f9fa; }

.bs-end-badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.bs-end-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}
.bs-end-badge.compact {
  padding: 1px 5px;
  font-size: 10px;
}

.bs-end-squad-totals {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.bs-end-payout-rule {
  font-size: 12px;
  line-height: 1.4;
  color: #ced4da;
  padding: 6px 8px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid #ffd43b;
}
.bs-end-payout-rule.free {
  border-left-color: #4dabf7;
}
.bs-end-payout-my {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border-radius: 4px;
  background: rgba(255, 212, 59, 0.08);
  border: 1px solid rgba(255, 212, 59, 0.38);
  font-size: 12.5px;
}
.bs-end-payout-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 116px;
  overflow-y: auto;
}
.bs-end-payout-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 4px 8px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
}
.bs-end-payout-row.me {
  border: 1px solid rgba(255, 212, 59, 0.55);
}

.bs-end-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 2px solid #090b10;
  box-shadow: inset 0 0 0 1px #2f3648;
  border-radius: 4px;
  background: rgba(11, 14, 22, 0.92);
}
.bs-end-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  min-width: 680px;
}
.bs-end-table th {
  padding: 8px 8px;
  text-align: right;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #adb5bd;
  background: #171b29;
  border-bottom: 2px solid #090b10;
  white-space: nowrap;
}
.bs-end-table th:nth-child(1),
.bs-end-table td:nth-child(1) {
  text-align: center;
  width: 36px;
}
.bs-end-table th:nth-child(2),
.bs-end-table td:nth-child(2) {
  text-align: left;
}
.bs-end-table td {
  padding: 8px 8px;
  text-align: right;
  border-bottom: 1px solid #1f2436;
  vertical-align: middle;
  white-space: nowrap;
}
.bs-end-table tbody tr:last-child td {
  border-bottom: 0;
}
.bs-end-table tbody tr.is-mvp {
  background: rgba(255, 212, 59, 0.08);
}
.bs-end-table tbody tr.is-me {
  box-shadow: inset 3px 0 0 #ffd43b;
  background: rgba(255, 212, 59, 0.12);
}
.bs-end-table tbody tr.is-left {
  opacity: 0.62;
}
.bs-end-table tfoot td {
  padding: 7px 8px;
  font-weight: 800;
  color: #ced4da;
  background: #151926;
  border-top: 2px solid #090b10;
}

.bs-end-player-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 190px;
  white-space: normal;
}
.bs-end-player-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.bs-end-player-name {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-weight: 700;
  color: #f8f9fa;
}
.bs-end-tag {
  padding: 0 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  background: #2b3142;
  color: #ced4da;
}
.bs-end-tag.me { background: rgba(255, 212, 59, 0.22); color: #ffe066; }
.bs-end-tag.bot { background: rgba(51, 154, 240, 0.22); color: #74c0fc; }
.bs-end-tag.left { background: rgba(250, 82, 82, 0.22); color: #ffa8a8; }
.bs-end-sub {
  font-size: 11px;
  color: #868e96;
  display: flex;
  align-items: center;
  gap: 5px;
}
.bs-end-boss-sub {
  display: block;
  font-size: 10px;
  color: #ff922b;
}

.bs-coin-pos { color: #69db7c; font-weight: 800; }
.bs-coin-neg { color: #ff8787; font-weight: 800; }
.bs-coin-zero { color: #adb5bd; font-weight: 700; }

.bs-end-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 2px;
}
.bs-end-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.bs-end-wait {
  font-size: 12.5px;
  color: #adb5bd;
}
.bs-end .bs-btn {
  height: 38px;
  padding: 0 14px;
  border-radius: 4px;
  border: 2px solid #090b10;
  font-size: 13.5px;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: transform 0.08s, filter 0.12s;
}
.bs-end .bs-btn:active:not(:disabled) { transform: translateY(1px); }
.bs-end .bs-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bs-end .bs-btn-ghost {
  background: #1d2232;
  color: #ced4da;
  box-shadow: inset 0 0 0 1px #3b4254;
}
.bs-end .bs-btn-ghost:hover:not(:disabled) { color: #fff; border-color: #74809b; filter: none; }
.bs-end .bs-btn-secondary {
  background: #272f45;
  color: #f8f9fa;
  box-shadow: inset 0 0 0 1px #525e7d;
}
.bs-end .bs-btn-secondary:hover:not(:disabled) { border-color: #ffd43b; color: #ffe066; filter: none; }
.bs-end .bs-btn-primary {
  background: linear-gradient(180deg, #ffd43b 0%, #f08c00 100%);
  color: #141013;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.45), 0 3px 0 #090b10;
}
.bs-end .bs-btn-primary:hover:not(:disabled) { filter: brightness(1.06); }

@media (max-width: 760px) {
  .bs-end-card { padding: 14px 12px; gap: 10px; }
  .bs-end-grid { grid-template-columns: 1fr; }
  .bs-end-mvp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bs-end-squad-totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bs-end-actions { flex-direction: column-reverse; align-items: stretch; }
  .bs-end-actions-right { justify-content: stretch; }
  .bs-end-actions-right .bs-btn,
  .bs-end-actions > .bs-btn { flex: 1; }
}
`;

// ============================================================================
// 5. PostGameModal Component
// ============================================================================

/**
 * Soul-Knight style Victory/Defeat summary modal for `bansung` Co-op mode.
 * Displays MVP spotlight with animated pixel hero strip, squad combat scoreboard
 * (kills, elites, damage, stuns, revives, deaths, score), coin payout breakdown,
 * and Play Again / Return to Lobby / Leave Room actions.
 */
export function PostGameModal({
  view,
  meId,
  emit,
  result: resultOverride,
  onPlayAgain,
  onReturnToLobby,
  onLeave,
  onClose,
}: PostGameModalProps) {
  const hud = useBansungHud();
  const [busy, setBusy] = useState(false);
  const busyTimerRef = useRef<number | undefined>(undefined);

  const rawResult = resultOverride ?? view.bansung?.result;
  const shouldRender = view.phase === 'ended' || Boolean(rawResult);

  useEffect(() => {
    return () => {
      if (busyTimerRef.current !== undefined) {
        window.clearTimeout(busyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldRender || !onClose) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shouldRender, onClose]);

  useEffect(() => {
    setBusy(false);
  }, [view.phase, view.code]);

  const players = useMemo(
    () => (shouldRender ? normalizeResultPlayers(rawResult, view) : []),
    [shouldRender, rawResult, view],
  );

  if (!shouldRender) return null;

  const victory = rawResult?.victory ?? false;
  const cfg = view.bansung?.config;
  const isSurvivalMode =
    (rawResult?.mode ?? hud.survival?.mode ?? resolveBansungGameMode(cfg)) === 'survival';
  const biomeKey = cfg?.biome ?? hud.biome ?? 'desert';
  const biomeLabel = BIOME_LABELS[biomeKey] ?? biomeKey;
  const diffLabel = cfg ? (DIFFICULTY_LABELS[cfg.difficulty] ?? cfg.difficulty) : 'Thường';
  const reviveLabel = cfg ? (REVIVE_LABELS[cfg.reviveMode] ?? cfg.reviveMode) : 'Đồng đội cứu';

  const waveReached = Math.max(1, rawResult?.wave ?? rawResult?.wavesCleared ?? hud.wave ?? 1);
  const finalLevel = Math.max(1, rawResult?.level ?? hud.me?.level ?? 1);
  const wavesCleared = rawResult?.wavesCleared ?? rawResult?.wave ?? hud.wave ?? 1;
  const totalWaves = rawResult?.totalWaves ?? (cfg?.endless ? Math.max(10, wavesCleared) : 10);
  const durationMs =
    rawResult?.durationMs ??
    (hud.elapsedMs > 0
      ? hud.elapsedMs
      : view.bansung?.startedAt
        ? Math.max(0, Date.now() - view.bansung.startedAt)
        : 0);

  const reason =
    rawResult?.reason ??
    (isSurvivalMode
      ? victory
        ? `Cả đội đã trụ vững đến Wave ${waveReached} (LV ${finalLevel})!`
        : `Cả đội đã gục tại Wave ${waveReached} (LV ${finalLevel}).`
      : victory
        ? `Đã hoàn thành ${wavesCleared}/${totalWaves} đợt quái!`
        : `Cả đội đã gục tại Đợt ${wavesCleared}.`);

  const mvpPlayer =
    players.find((p) => p.id === rawResult?.mvpId) ??
    players.find((p) => p.badges.includes('mvp')) ??
    players.find((p) => !p.bot && !p.left) ??
    players[0];

  const mvpId = mvpPlayer?.id ?? rawResult?.mvpId;
  const mvpHero = getBansungHero(resolveBansungHeroId(mvpPlayer?.heroId));
  const mvpBadges: BansungBadgeId[] = mvpPlayer
    ? mvpPlayer.badges.includes('mvp')
      ? mvpPlayer.badges
      : ['mvp', ...mvpPlayer.badges]
    : ['mvp'];

  const payoutSummary = buildCoinPayoutSummary(view, players, victory, mvpId, meId);

  const totals = players.reduce(
    (acc, p) => {
      acc.kills += p.kills;
      acc.elitesKilled += p.elitesKilled;
      acc.damageDealt += p.damageDealt;
      acc.bossDamage += p.bossDamage;
      acc.stunsInflicted += p.stunsInflicted;
      acc.revives += p.revives;
      acc.deaths += p.deaths;
      acc.score += p.score;
      return acc;
    },
    {
      kills: 0,
      elitesKilled: 0,
      damageDealt: 0,
      bossDamage: 0,
      stunsInflicted: 0,
      revives: 0,
      deaths: 0,
      score: 0,
    },
  );

  const isHost = view.hostId === meId;
  const isSpectator =
    view.bansung?.myIdx === undefined && !view.players.some((p) => p.id === meId);
  const showCoinColumn = payoutSummary.hasWager;
  const dungeonCoins = hud.me?.coins ?? 0;

  const triggerAction = (fn: () => void) => {
    if (busy) return;
    setBusy(true);
    fn();
    if (busyTimerRef.current !== undefined) {
      window.clearTimeout(busyTimerRef.current);
    }
    busyTimerRef.current = window.setTimeout(() => {
      busyTimerRef.current = undefined;
      setBusy(false);
    }, 750);
  };

  const handlePlayAgain = () =>
    triggerAction(() => {
      if (onPlayAgain) onPlayAgain();
      else emit('game:restart');
    });

  const handleReturnToLobby = () =>
    triggerAction(() => {
      if (onReturnToLobby) onReturnToLobby();
      else emit('game:restart');
    });

  const handleLeave = () =>
    triggerAction(() => {
      if (onLeave) onLeave();
      else emit('room:leave');
    });

  return (
    <div
      className="bs-end"
      role="dialog"
      aria-modal="true"
      aria-label={victory ? 'Tổng kết Chiến Thắng Bắn Súng Co-op' : 'Tổng kết Thất Bại Bắn Súng Co-op'}
    >
      <style>{POSTGAME_CSS}</style>
      <div className={`bs-end-card ${victory ? 'win' : 'lose'}`}>
        {onClose && (
          <button
            type="button"
            className="bs-end-close"
            onClick={onClose}
            aria-label="Đóng bảng tổng kết"
          >
            <X size={16} />
          </button>
        )}

        {/* Header Banner */}
        <header className={`bs-end-banner ${victory ? 'win' : 'lose'}`}>
          <div className="bs-end-title-row">
            {victory ? <Trophy size={26} color="#ffd43b" /> : <Skull size={26} color="#ff6b6b" />}
            <h2 className="bs-end-title">{victory ? 'CHIẾN THẮNG!' : 'THẤT BẠI!'}</h2>
            {victory ? <Sparkles size={22} color="#ffe066" /> : <Shield size={22} color="#ff8787" />}
          </div>
          <p className="bs-end-reason">{reason}</p>
          <div className="bs-end-meta">
            {isSurvivalMode ? (
              <>
                <span className="bs-end-pill gold">
                  <Swords size={13} /> Sinh Tồn · Wave {waveReached}
                </span>
                <span className="bs-end-pill cyan">
                  <Zap size={13} /> LV {finalLevel}
                </span>
              </>
            ) : (
              <span className="bs-end-pill gold">
                <Swords size={13} /> Đợt {wavesCleared}/{totalWaves}
                {cfg?.endless ? ' · Vô tận' : ''}
              </span>
            )}
            <span className="bs-end-pill">
              <Clock size={13} /> {formatMatchDuration(durationMs)}
            </span>
            <span className="bs-end-pill cyan">
              {biomeLabel} · {diffLabel}
            </span>
            <span className="bs-end-pill">{reviveLabel}</span>
          </div>
        </header>

        {/* MVP Spotlight + Coin Payout Breakdown */}
        <div className="bs-end-grid">
          {/* MVP Spotlight */}
          <section className="bs-end-box" aria-label="MVP trận đấu">
            <div className="bs-end-box-head">
              <span>
                <Crown size={13} className="inline-icon" color="#ffd43b" /> MVP Spotlight
              </span>
              {mvpPlayer && <span style={{ color: '#ffd43b' }}>{formatCompactInt(mvpPlayer.score)} điểm</span>}
            </div>
            {mvpPlayer ? (
              <>
                <div className="bs-end-mvp-body">
                  <HeroIdleSprite hero={mvpHero} size={78} victory={victory} />
                  <div className="bs-end-mvp-info">
                    <div className="bs-end-mvp-name-row">
                      <span className="bs-end-mvp-name">{mvpPlayer.name}</span>
                      {mvpPlayer.id === meId && <span className="bs-end-tag me">Bạn</span>}
                      {mvpPlayer.bot && <span className="bs-end-tag bot">BOT</span>}
                    </div>
                    <div className="bs-end-mvp-class">
                      <span
                        className="bs-end-hero-dot"
                        style={{ background: mvpHero.accentHex }}
                      />
                      <span>{mvpHero.name}</span>
                    </div>
                    <div className="bs-end-badges-row">
                      {mvpBadges.map((b) => (
                        <BadgeChip key={b} id={b} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="bs-end-mvp-stats">
                  <div className="bs-end-stat-mini">
                    <span>Hạ quái</span>
                    <b>{formatCompactInt(mvpPlayer.kills)}</b>
                  </div>
                  <div className="bs-end-stat-mini">
                    <span>Tinh anh</span>
                    <b>{formatCompactInt(mvpPlayer.elitesKilled)}</b>
                  </div>
                  <div className="bs-end-stat-mini">
                    <span>Sát thương</span>
                    <b>{formatCompactInt(mvpPlayer.damageDealt)}</b>
                  </div>
                  <div className="bs-end-stat-mini">
                    <span>Hồi sinh</span>
                    <b>{formatCompactInt(mvpPlayer.revives)}</b>
                  </div>
                </div>
              </>
            ) : (
              <p className="bs-end-reason">Chưa có dữ liệu chiến binh.</p>
            )}
          </section>

          {/* Squad Totals & Coin Payout Breakdown */}
          <section className="bs-end-box" aria-label="Tổng kết xu và đội hình">
            <div className="bs-end-box-head">
              <span>
                <Coins size={13} className="inline-icon" color="#ffd43b" /> Chia Thưởng Xu
              </span>
              {payoutSummary.hasWager ? (
                <span style={{ color: '#ffe066' }}>Hũ: {fmtCoins(payoutSummary.pot)} xu</span>
              ) : (
                <span style={{ color: '#74c0fc' }}>Miễn phí</span>
              )}
            </div>

            <div className="bs-end-squad-totals">
              <div className="bs-end-stat-mini">
                <span>Tổng hạ</span>
                <b>{formatCompactInt(totals.kills)}</b>
              </div>
              <div className="bs-end-stat-mini">
                <span>Tinh anh</span>
                <b>{formatCompactInt(totals.elitesKilled)}</b>
              </div>
              <div className="bs-end-stat-mini">
                <span>Tổng ST</span>
                <b>{formatCompactInt(totals.damageDealt)}</b>
              </div>
              <div className="bs-end-stat-mini">
                <span>Choáng/Cứu</span>
                <b>
                  {totals.stunsInflicted}/{totals.revives}
                </b>
              </div>
            </div>

            {payoutSummary.hasWager ? (
              <>
                <div className="bs-end-payout-rule">
                  {victory ? (
                    payoutSummary.rows.filter((r) => !r.left).length <= 1 ? (
                      <>
                        Thắng trận: <b>100% hũ ({fmtCoins(payoutSummary.pot)} xu)</b> thuộc về người
                        sống sót cuối cùng.
                      </>
                    ) : (
                      <>
                        Chia Co-op <b>70/30</b>: <b>{fmtCoins(payoutSummary.basePool)} xu</b> chia đều
                        đồng đội + <b>{fmtCoins(payoutSummary.perfPool)} xu</b> theo điểm hiệu suất
                        & MVP.
                      </>
                    )
                  ) : (
                    <>
                      Thua trận: <b>Hoàn {fmtCoins(payoutSummary.bet)} xu</b> tiền cược cho thành viên
                      còn ở lại trận (người bỏ trận mất cược).
                    </>
                  )}
                </div>

                {payoutSummary.myRow && (
                  <div className="bs-end-payout-my">
                    <span>
                      Cược: <b>{fmtCoins(payoutSummary.myRow.bet)} xu</b> · Nhận:{' '}
                      <b>{fmtCoins(payoutSummary.myRow.payout)} xu</b>
                    </span>
                    <span
                      className={
                        payoutSummary.myRow.netDelta > 0
                          ? 'bs-coin-pos'
                          : payoutSummary.myRow.netDelta < 0
                            ? 'bs-coin-neg'
                            : 'bs-coin-zero'
                      }
                    >
                      Ròng: {formatSignedCoins(payoutSummary.myRow.netDelta)} xu
                    </span>
                  </div>
                )}

                <div className="bs-end-payout-list">
                  {payoutSummary.rows.map((r) => (
                    <div key={r.id} className={`bs-end-payout-row${r.isMe ? ' me' : ''}`}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.isMvp ? '👑 ' : ''}
                        {r.name}
                        {r.isMe ? ' (Bạn)' : ''}
                        {r.left ? ' · Rời trận' : ''}
                      </span>
                      <span style={{ color: '#ced4da' }}>
                        Nhận <b>{fmtCoins(r.payout)}</b> xu
                      </span>
                      <span
                        className={
                          r.netDelta > 0
                            ? 'bs-coin-pos'
                            : r.netDelta < 0
                              ? 'bs-coin-neg'
                              : 'bs-coin-zero'
                        }
                      >
                        {formatSignedCoins(r.netDelta)} xu
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="bs-end-payout-rule free">
                Phòng chơi miễn phí (<b>0 xu</b> cược tài khoản).
                {dungeonCoins > 0 && (
                  <>
                    {' '}
                    Vàng nhặt trong màn: <b>{formatCompactInt(dungeonCoins)}</b>.
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Squad Combat Scoreboard Table */}
        <div className="bs-end-table-wrap">
          <table className="bs-end-table">
            <thead>
              <tr>
                <th>#</th>
                <th>
                  <Users size={12} className="inline-icon" /> Chiến Binh
                </th>
                <th>Hạ</th>
                <th>Tinh Anh</th>
                <th>Sát Thương</th>
                <th>Choáng</th>
                <th>Cứu</th>
                <th>Gục</th>
                <th>
                  <Award size={12} className="inline-icon" /> Điểm
                </th>
                {showCoinColumn && <th>Xu</th>}
              </tr>
            </thead>
            <tbody>
              {players.map((p, idx) => {
                const roomPlayer = view.players.find((rp) => rp.id === p.id);
                const rosterInfo = view.bansung?.players?.find((rp) => rp.id === p.id);
                const heroSpec = getBansungHero(resolveBansungHeroId(p.heroId));
                const isMe = p.id === meId;
                const isMvp = p.id === mvpId || p.badges.includes('mvp');
                const badgesToShow: BansungBadgeId[] =
                  isMvp && !p.badges.includes('mvp') ? ['mvp', ...p.badges] : p.badges;
                const avatar = roomPlayer?.avatar ?? rosterInfo?.avatar;
                const rowPayout = view.payouts?.[p.id];
                const netCoins =
                  !p.bot && showCoinColumn
                    ? rowPayout !== undefined
                      ? rowPayout - payoutSummary.bet
                      : p.coinDelta
                    : 0;

                return (
                  <tr
                    key={p.id}
                    className={`${isMvp ? 'is-mvp ' : ''}${isMe ? 'is-me ' : ''}${p.left ? 'is-left' : ''}`}
                  >
                    <td>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </td>
                    <td>
                      <div className="bs-end-player-cell">
                        <PlayerAvatar
                          id={p.id}
                          avatar={avatar}
                          size={32}
                          dead={p.deaths > 0 && rosterInfo?.alive === false}
                        />
                        <div className="bs-end-player-meta">
                          <div className="bs-end-player-name">
                            <span>{p.name}</span>
                            {isMe && <span className="bs-end-tag me">Bạn</span>}
                            {p.bot && <span className="bs-end-tag bot">BOT</span>}
                            {p.left && <span className="bs-end-tag left">Rời</span>}
                          </div>
                          <div className="bs-end-sub">
                            <span
                              className="bs-end-hero-dot"
                              style={{ background: heroSpec.accentHex }}
                            />
                            <span>{heroSpec.name}</span>
                          </div>
                          {badgesToShow.length > 0 && (
                            <div className="bs-end-badges-row">
                              {badgesToShow.map((b) => (
                                <BadgeChip key={b} id={b} compact />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <b>{formatCompactInt(p.kills)}</b>
                    </td>
                    <td>{formatCompactInt(p.elitesKilled)}</td>
                    <td>
                      <b>{formatCompactInt(p.damageDealt)}</b>
                      {p.bossDamage > 0 && (
                        <span className="bs-end-boss-sub">
                          Boss: {formatCompactInt(p.bossDamage)}
                        </span>
                      )}
                    </td>
                    <td>{formatCompactInt(p.stunsInflicted)}</td>
                    <td>{formatCompactInt(p.revives)}</td>
                    <td>{formatCompactInt(p.deaths)}</td>
                    <td>
                      <b style={{ color: isMvp ? '#ffd43b' : '#f8f9fa' }}>
                        {formatCompactInt(p.score)}
                      </b>
                    </td>
                    {showCoinColumn && (
                      <td>
                        {p.bot ? (
                          <span className="bs-coin-zero">—</span>
                        ) : (
                          <>
                            <span
                              className={
                                netCoins > 0
                                  ? 'bs-coin-pos'
                                  : netCoins < 0
                                    ? 'bs-coin-neg'
                                    : 'bs-coin-zero'
                              }
                            >
                              {formatSignedCoins(netCoins)} xu
                            </span>
                            {rowPayout !== undefined && (
                              <span className="bs-end-boss-sub" style={{ color: '#adb5bd' }}>
                                Nhận {fmtCoins(rowPayout)}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {players.length > 1 && (
              <tfoot>
                <tr>
                  <td>Σ</td>
                  <td>Tổng đội ({players.length})</td>
                  <td>{formatCompactInt(totals.kills)}</td>
                  <td>{formatCompactInt(totals.elitesKilled)}</td>
                  <td>
                    {formatCompactInt(totals.damageDealt)}
                    {totals.bossDamage > 0 && (
                      <span className="bs-end-boss-sub">
                        Boss: {formatCompactInt(totals.bossDamage)}
                      </span>
                    )}
                  </td>
                  <td>{formatCompactInt(totals.stunsInflicted)}</td>
                  <td>{formatCompactInt(totals.revives)}</td>
                  <td>{formatCompactInt(totals.deaths)}</td>
                  <td>{formatCompactInt(totals.score)}</td>
                  {showCoinColumn && <td>{fmtCoins(payoutSummary.pot)} xu</td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer Actions */}
        <footer className="bs-end-actions">
          <button
            type="button"
            className="bs-btn bs-btn-ghost ghost"
            disabled={busy}
            onClick={handleLeave}
          >
            <LogOut size={16} /> Rời phòng
          </button>

          <div className="bs-end-actions-right">
            {isHost ? (
              <>
                <button
                  type="button"
                  className="bs-btn bs-btn-secondary secondary"
                  disabled={busy}
                  onClick={handleReturnToLobby}
                >
                  <Home size={16} /> Về phòng chờ
                </button>
                <button
                  type="button"
                  className="bs-btn bs-btn-primary primary"
                  disabled={busy}
                  onClick={handlePlayAgain}
                >
                  <RotateCcw size={16} /> Chơi lại
                </button>
              </>
            ) : (
              <span className="bs-end-wait">
                {isSpectator
                  ? '👀 Bạn đang xem bảng tổng kết (chờ chủ phòng mở ván mới).'
                  : '⏳ Chờ chủ phòng chọn Chơi lại hoặc Về phòng chờ…'}
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export default PostGameModal;
