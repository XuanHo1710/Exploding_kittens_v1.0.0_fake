/**
 * Bảng tổng kết Thắng / Thua (hoặc góc nhìn khán giả) cho Miragine War cổ điển:
 * - Hiện `win.png` / `lose.png` cho người chơi, hoặc thông báo trung lập cho khán giả.
 * - So sánh 2 cột thống kê Phe Đỏ vs Phe Xanh (`kills`, `lost`, `spawned`, `roundIncome`, `totalEarned`, `damageToCrystal`, `baseHp`).
 * - Hiển thị chia hũ xu khi có cược & nút `Chơi lại` / `Rời phòng`.
 */
import { Coins, LogOut, RotateCcw, Trophy } from 'lucide-react';
import {
  THAP_BASE,
  THAP_COLORS,
  THAP_SIDE_NAMES,
  type ThapPlayerInfo,
  type ThapSideStats,
} from '../../../../shared/src';
import { playThap } from '../../thap/sound';
import { MIRAGINE_UI_ASSETS } from '../../thap/sprites';
import { fmtCoins } from '../Dock';
import type { MiragineResultModalProps } from './miragineTypes';

const SIDE_COLUMNS = [
  { idx: 0, css: 'red', fallbackName: THAP_SIDE_NAMES[0], fallbackColor: THAP_COLORS[0] },
  { idx: 1, css: 'blue', fallbackName: THAP_SIDE_NAMES[1], fallbackColor: THAP_COLORS[1] },
] as const;

function emptyStats(idx: number): ThapSideStats {
  return {
    idx,
    kills: 0,
    lost: 0,
    spawned: 0,
    killsValue: 0,
    roundIncome: 0,
    totalEarned: 0,
    damageToCrystal: 0,
    baseHp: 0,
  };
}

function fmtDuration(ms: number): string {
  const totalS = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSideDisplayName(player: ThapPlayerInfo | undefined, fallbackName: string): string {
  if (!player) return fallbackName;
  const clean = player.name.replace(/^🤖\s*/, '');
  return player.bot ? `🤖 ${clean}` : clean;
}

function buildStatRows(stats: ThapSideStats): Array<{ label: string; value: string }> {
  return [
    { label: 'Tiêu diệt', value: fmtCoins(stats.kills) },
    { label: 'Tổn thất', value: fmtCoins(stats.lost) },
    { label: 'Đã xuất', value: fmtCoins(stats.spawned) },
    { label: 'Thu nhập/đợt', value: `+${fmtCoins(stats.roundIncome)}` },
    { label: 'Tổng vàng', value: fmtCoins(stats.totalEarned) },
    { label: 'Sát thương Pha Lê', value: fmtCoins(stats.damageToCrystal) },
    {
      label: 'Pha Lê còn',
      value: `${fmtCoins(Math.max(0, Math.round(stats.baseHp)))} / ${fmtCoins(THAP_BASE.hp)}`,
    },
  ];
}

function resolveSpectatorAnnouncement(winnerTeam: number): string {
  if (winnerTeam === 0) return 'Phe Đỏ Thắng';
  if (winnerTeam === 1) return 'Phe Xanh Thắng';
  return 'Hòa';
}

interface PayoutEntry {
  id: string;
  name: string;
  text: string;
  positive: boolean;
}

function collectPayoutEntries(
  players: readonly ThapPlayerInfo[],
  winnerIdxs: readonly number[],
  pot: number | undefined,
  bet: number | undefined,
  payouts: Readonly<Record<string, number>> | undefined,
  winnerId: string | undefined,
): PayoutEntry[] {
  const out: PayoutEntry[] = [];
  const seen = new Set<string>();

  for (const p of players) {
    if (p.bot) continue;
    seen.add(p.id);
    const won = winnerIdxs.includes(p.idx) || winnerId === p.id;
    const paid = payouts?.[p.id];
    if (paid !== undefined) {
      out.push({
        id: p.id,
        name: p.name,
        text: won ? `nhận ${fmtCoins(paid)} xu` : `hoàn ${fmtCoins(paid)} xu`,
        positive: won && paid > 0,
      });
    } else if ((pot ?? 0) > 0 && winnerId && winnerId === p.id) {
      const net = bet ? pot! - bet : pot!;
      out.push({
        id: p.id,
        name: p.name,
        text: `+${fmtCoins(net)} xu`,
        positive: net > 0,
      });
    }
  }

  if (payouts) {
    for (const [id, paid] of Object.entries(payouts)) {
      if (seen.has(id)) continue;
      const won = winnerId === id;
      out.push({
        id,
        name: id,
        text: won ? `nhận ${fmtCoins(paid)} xu` : `hoàn ${fmtCoins(paid)} xu`,
        positive: paid > 0 && won,
      });
    }
  }

  return out;
}

/**
 * Hộp thoại tổng kết trận đấu Miragine War sau khi vỡ Pha Lê Chính hoặc hết giờ.
 */
export default function MiragineResultModal({
  result,
  players,
  myIdx,
  myTeam,
  isHost,
  pot,
  bet,
  payouts,
  winnerId,
  onRestart,
  onLeave,
}: MiragineResultModalProps) {
  const isSpectator = myIdx === undefined;
  const resolvedMyTeam =
    !isSpectator
      ? (myTeam ?? players.find((p) => p.idx === myIdx)?.team)
      : undefined;
  const hasPersonalOutcome = !isSpectator && resolvedMyTeam !== undefined;
  const won = hasPersonalOutcome ? result.winnerTeam === resolvedMyTeam : false;
  const isDraw = result.winnerTeam < 0;

  let headingText: string;
  if (hasPersonalOutcome) {
    headingText = won ? 'CHIẾN THẮNG!' : isDraw ? 'HÒA TRẬN!' : 'THẤT BẠI!';
  } else {
    headingText = resolveSpectatorAnnouncement(result.winnerTeam);
  }

  const hasPayouts = Boolean(payouts && Object.keys(payouts).length > 0);
  const showCoinSummary = (pot ?? 0) > 0 || hasPayouts;
  const payoutEntries = showCoinSummary
    ? collectPayoutEntries(players, result.winnerIdxs, pot, bet, payouts, winnerId)
    : [];

  const humanCount = players.filter((p) => !p.bot).length;
  const isSoloPlayer = !isSpectator && humanCount <= 1;
  const canRestart = isHost || isSoloPlayer;

  return (
    <div className="thap-result-backdrop" role="dialog" aria-modal="true" aria-labelledby="miragine-result-title">
      <div className="thap-result-modal">
        {hasPersonalOutcome && !isDraw && (
          <div className="thap-result-banner">
            <img
              src={won ? MIRAGINE_UI_ASSETS.win : MIRAGINE_UI_ASSETS.lose}
              alt={won ? 'Victory' : 'Defeat'}
              className="thap-result-img"
              draggable={false}
            />
          </div>
        )}

        <h2
          id="miragine-result-title"
          className={`thap-result-title${won ? ' win' : ''}`}
        >
          {(!hasPersonalOutcome || isDraw) && (
            <Trophy size={20} className="inline-icon" style={{ marginRight: 6 }} aria-hidden="true" />
          )}
          {headingText}
        </h2>

        <div className="thap-result-sub">
          {result.reason && <div>{result.reason}</div>}
          <div style={{ marginTop: 2 }}>
            Thời gian: <b>{fmtDuration(result.durationMs)}</b> · Số đợt: <b>{result.waves}</b>
          </div>
        </div>

        <div className="thap-result-stats">
          {SIDE_COLUMNS.map((col) => {
            const player = players.find((p) => p.idx === col.idx) ?? players[col.idx];
            const stats =
              result.stats.find((s) => s.idx === col.idx) ??
              result.stats[col.idx] ??
              emptyStats(col.idx);
            const isMe = myIdx !== undefined && myIdx === col.idx;
            const isWinnerSide =
              result.winnerIdxs.includes(col.idx) ||
              (result.winnerTeam >= 0 && player?.team === result.winnerTeam);
            const dotColor = player?.color || col.fallbackColor;
            const rows = buildStatRows(stats);

            return (
              <section key={col.idx} className={`thap-result-col ${col.css}`}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="dot" style={{ background: dotColor }} />
                  <span>{formatSideDisplayName(player, col.fallbackName)}</span>
                  {isMe && (
                    <span className="muted" style={{ fontSize: '11px', fontWeight: 600 }}>
                      (Bạn)
                    </span>
                  )}
                  {isWinnerSide && <span title="Phe chiến thắng">🏆</span>}
                </h3>

                {rows.map((row) => (
                  <div key={row.label} className="thap-result-stat-row">
                    <span className="muted">{row.label}</span>
                    <b>{row.value}</b>
                  </div>
                ))}
              </section>
            );
          })}
        </div>

        {showCoinSummary && (
          <div
            className="thap-result-col"
            style={{ borderColor: 'rgba(255, 212, 59, 0.45)', background: 'rgba(255, 212, 59, 0.08)' }}
          >
            <div className="thap-result-stat-row">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#ffe066' }}>
                <Coins size={15} aria-hidden="true" />
                Tổng hũ cược
                {(bet ?? 0) > 0 && (
                  <span className="muted" style={{ fontWeight: 500 }}>
                    ({fmtCoins(bet!)} xu/người)
                  </span>
                )}
              </span>
              <b style={{ color: '#ffe066' }}>{fmtCoins(pot ?? 0)} xu</b>
            </div>

            {payoutEntries.map((entry) => (
              <div key={entry.id} className="thap-result-stat-row">
                <span>{entry.name}</span>
                <b className={entry.positive ? 'good-text' : 'muted'}>{entry.text}</b>
              </div>
            ))}
          </div>
        )}

        <div className="thap-result-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              playThap('click');
              onLeave();
            }}
          >
            <LogOut size={15} aria-hidden="true" />
            Rời phòng
          </button>

          {canRestart ? (
            <button
              type="button"
              className="primary big"
              onClick={() => {
                playThap('click');
                onRestart();
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Chơi lại
            </button>
          ) : (
            <span className="muted small">Chờ chủ phòng mở ván mới…</span>
          )}
        </div>
      </div>
    </div>
  );
}
