/**
 * Thanh HUD phía trên chuẩn Miragine War cổ điển:
 * - Hàng đối đầu 2 phe: Pha Lê Đỏ (trái) · Đồng hồ Đợt & Tiến trình sóng (`timebg.png` + `bar_frame.png`) · Pha Lê Xanh (phải).
 * - Hàng tài nguyên gọn: Vàng / Thu nhập / Dân số (cảnh báo nhấp nháy khi đầy dân số) hoặc huy hiệu Khán giả & Hũ xu,
 *   cùng cụm nút Hướng dẫn, Trò chuyện, Dock cài đặt và Rời trận / Đầu hàng.
 */
import { forwardRef, useEffect, useState, type CSSProperties } from 'react';
import { BookOpen, Flag, LogOut, MessageSquare } from 'lucide-react';
import {
  MIRAGINE_STRUCTURES,
  MIRAGINE_UI_ASSETS,
  THAP_SIDE_NAMES,
  type ThapPlayerInfo,
} from '../../../../shared/src';
import { playThap } from '../../thap/sound';
import { fmtCoins } from '../Dock';
import type { MiragineTopHudProps } from './miragineTypes';

const SPECTATOR_INLINE_STYLE: CSSProperties = {
  position: 'static',
  left: 'auto',
  bottom: 'auto',
  transform: 'none',
  padding: '4px 10px',
  fontSize: '12px',
};

const POP_WARN_PULSE_STYLE: CSSProperties = {
  animation: 'thap-blink 1s ease-in-out infinite alternate',
};

const ROLE_TAG_STYLE: CSSProperties = {
  padding: '0 5px',
  fontSize: 9.5,
  flex: 'none',
};

const REMAINING_PILL_STYLE: CSSProperties = {
  padding: '2px 7px',
  fontSize: 11,
};

function clampPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function formatMatchClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function formatLastWaveUnits(count: number): string {
  return count >= 0 ? `Đợt trước: ${count} lính` : 'Chờ đợt 1';
}

function cleanSideName(raw: string | undefined, fallback: string): string {
  const trimmed = (raw ?? '').replace(/^🤖\s*/, '').trim();
  return trimmed || fallback;
}

interface CrystalMeterRowProps {
  side: 0 | 1;
  player?: ThapPlayerInfo;
  hpPct: number;
  isMe: boolean;
  onFocus?: (sideIdx: number) => void;
}

/** Khối hiển thị Pha Lê Chính (nút xoay camera + thanh máu % + tên phe). */
function CrystalMeterRow({ side, player, hpPct, isMe, onFocus }: CrystalMeterRowProps) {
  const isBlue = side === 1;
  const crystalAsset = isBlue ? MIRAGINE_STRUCTURES.B_crystal.file : MIRAGINE_STRUCTURES.A_crystal.file;
  const crystalTitle = isBlue ? 'Pha Lê Xanh' : 'Pha Lê Đỏ';
  const name = cleanSideName(player?.name, THAP_SIDE_NAMES[side]);
  const roleLabel = isMe ? 'Bạn' : player?.bot ? '🤖 AI' : undefined;

  return (
    <div className="thap-crystal-row">
      <button
        type="button"
        className="thap-crystal-btn"
        onClick={() => {
          playThap('click');
          onFocus?.(side);
        }}
        title={`Nhìn tới ${crystalTitle} (${name})`}
        aria-label={`Nhìn tới ${crystalTitle} (${name})`}
      >
        <img src={crystalAsset} alt={crystalTitle} className="thap-crystal-ico" draggable={false} />
      </button>

      <div className="thap-crystal-meter">
        <div className="thap-crystal-label">
          <span>{name}</span>
          {roleLabel && (
            <span className="thap-tag" style={ROLE_TAG_STYLE}>
              {roleLabel}
            </span>
          )}
        </div>
        <div className="thap-crystal-bar" aria-label={`${crystalTitle}: ${hpPct}%`}>
          <div className="thap-crystal-fill" style={{ width: `${hpPct}%` }} />
          <span className="thap-crystal-hp">{hpPct}%</span>
        </div>
      </div>
    </div>
  );
}

/** Thanh HUD trên cùng của Miragine War cổ điển, hỗ trợ `forwardRef` để đo chiều cao an toàn. */
export const MiragineTopHud = forwardRef<HTMLElement, MiragineTopHudProps>(function MiragineTopHud(
  {
    players,
    myIdx,
    me,
    baseHp,
    wave,
    roundLeft,
    roundTotalS,
    lastWaveUnits,
    elapsedMs,
    endsAt,
    alive,
    ended,
    pot,
    bet,
    tutorialOpen,
    chatOpen,
    unreadCount,
    dock,
    onFocusCrystal,
    onOpenTutorial,
    onToggleChat,
    onLeave,
  },
  ref,
) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === undefined || ended) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt, ended]);

  const redPlayer = players[0];
  const bluePlayer = players[1];
  const redHpPct = clampPct(baseHp[0] ?? (redPlayer?.alive === false ? 0 : 100));
  const blueHpPct = clampPct(baseHp[1] ?? (bluePlayer?.alive === false ? 0 : 100));

  const safeRoundTotal = Math.max(1, roundTotalS || 1);
  const clampedLeft = Math.max(0, Math.min(safeRoundTotal, roundLeft));
  const wavePct = Math.max(0, Math.min(100, (1 - clampedLeft / safeRoundTotal) * 100));
  const countdownSec = Math.max(0, Math.round(roundLeft));
  const isUrgent = !ended && countdownSec > 0 && countdownSec <= 3;

  const remainingMs = endsAt !== undefined ? Math.max(0, endsAt - now) : undefined;
  const redLastWaveText = formatLastWaveUnits(lastWaveUnits[0]);
  const blueLastWaveText = formatLastWaveUnits(lastWaveUnits[1]);

  const isPopBlocked = me?.blocked === 'pop';
  const isPopWarn = isPopBlocked || (me !== undefined && me.pop >= me.popCap);
  const isActiveFighter = alive && !ended && myIdx !== undefined;
  const unreadBadge = (unreadCount ?? 0) > 99 ? '99+' : unreadCount;
  const potValue = pot ?? 0;

  return (
    <header ref={ref} className="thap-top-hud">
      <div className="thap-top-row">
        {/* Phe Đỏ (trái) + Thanh tài nguyên / trạng thái khán giả */}
        <div className="thap-hud-side red">
          <CrystalMeterRow
            side={0}
            player={redPlayer}
            hpPct={redHpPct}
            isMe={myIdx === 0}
            onFocus={onFocusCrystal}
          />

          <div className="thap-res-pills">
            {me ? (
              <>
                <span
                  className="thap-pill gold"
                  title="Vàng hiện tại – tự động chiêu mộ lính đang chọn mỗi khi hết đồng hồ đợt"
                >
                  <img
                    src={MIRAGINE_UI_ASSETS.icon_money}
                    alt="Vàng"
                    className="thap-ui-ico"
                    draggable={false}
                  />
                  <b>{fmtCoins(Math.max(0, Math.floor(me.gold)))}</b>
                </span>

                <span
                  className="thap-pill income"
                  title={`Thu nhập mỗi đợt ${fmtCoins(me.roundIncome)} / giới hạn ${fmtCoins(me.incomeLimit)}`}
                >
                  <img
                    src={MIRAGINE_UI_ASSETS.icon_income}
                    alt="Thu nhập"
                    className="thap-ui-ico"
                    draggable={false}
                  />
                  <b>{fmtCoins(me.roundIncome)}</b>
                  <span className="muted">/{fmtCoins(me.incomeLimit)}</span>
                </span>

                <span
                  className={`thap-pill pop${isPopWarn ? ' warn' : ''}`}
                  style={isPopBlocked ? POP_WARN_PULSE_STYLE : undefined}
                  title={
                    isPopBlocked
                      ? 'Đầy dân số! Cần chờ chỗ trống để xuất thêm binh chủng đang chọn'
                      : `Dân số hiện tại / Tối đa ${me.popCap}`
                  }
                >
                  <img
                    src={MIRAGINE_UI_ASSETS.icon_renli}
                    alt="Dân số"
                    className="thap-ui-ico"
                    draggable={false}
                  />
                  <b>
                    {me.pop}/{me.popCap}
                  </b>
                </span>
              </>
            ) : (
              <span className="thap-pill thap-spec-banner" style={SPECTATOR_INLINE_STYLE}>
                👀 Đang xem trận đấu
              </span>
            )}

            <span className="thap-pill" title="Số lính Phe Đỏ đã xuất ở đợt gần nhất">
              {redLastWaveText}
            </span>

            {potValue > 0 && (
              <span
                className="thap-pill gold"
                title={
                  bet && bet > 0
                    ? `Tổng hũ cược ${fmtCoins(potValue)} xu (${fmtCoins(bet)} xu/người)`
                    : `Tổng hũ cược ${fmtCoins(potValue)} xu`
                }
              >
                🪙 <b>{fmtCoins(potValue)}</b>
              </span>
            )}
          </div>
        </div>

        {/* Đồng hồ đợt sóng & thanh tiến trình giữa màn hình */}
        <div
          className={`thap-wave-clock${isUrgent ? ' urgent' : ''}`}
          title={`Đợt ${wave + 1} · Đã đấu ${formatMatchClock(elapsedMs)}`}
        >
          <div className="thap-wave-top">
            <span className="thap-wave-badge">Đợt {wave + 1}</span>

            <div className="thap-clock-face" aria-label={`Còn ${countdownSec} giây tới đợt ${wave + 1}`}>
              <img
                src={MIRAGINE_UI_ASSETS.timebg}
                alt=""
                aria-hidden="true"
                className="thap-clock-bg"
                draggable={false}
              />
              <span className="thap-clock-num">{countdownSec}s</span>
            </div>

            {remainingMs !== undefined && (
              <span
                className={`thap-pill${remainingMs < 60_000 ? ' warn' : ''}`}
                style={REMAINING_PILL_STYLE}
                title="Thời gian trận đấu còn lại"
              >
                ⏳ <b className={remainingMs < 60_000 ? 'bad-text' : ''}>{formatMatchClock(remainingMs)}</b>
              </span>
            )}
          </div>

          <div className="thap-wave-bar-track" role="progressbar" aria-valuenow={Math.round(wavePct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="thap-wave-bar-fill" style={{ width: `${wavePct}%` }}>
              <img
                src={MIRAGINE_UI_ASSETS.bar_frame}
                alt=""
                aria-hidden="true"
                className="thap-wave-bar-img"
                draggable={false}
              />
            </div>
          </div>
        </div>

        {/* Phe Xanh (phải) + Số quân đợt trước Phe Xanh + Cụm nút tiện ích */}
        <div className="thap-hud-side blue">
          <CrystalMeterRow
            side={1}
            player={bluePlayer}
            hpPct={blueHpPct}
            isMe={myIdx === 1}
            onFocus={onFocusCrystal}
          />

          <div className="thap-blue-meta">
            <span className="thap-enemy-last" title="Số lính Phe Xanh đã xuất ở đợt gần nhất">
              {blueLastWaveText}
            </span>

            <div className="thap-top-btns">
              <button
                type="button"
                className={`thap-icon${tutorialOpen ? ' on' : ''}`}
                onClick={() => {
                  playThap('click');
                  onOpenTutorial?.();
                }}
                title="Hướng dẫn & Bách khoa 16 binh chủng"
                aria-label="Hướng dẫn"
              >
                <BookOpen size={17} />
              </button>

              <button
                type="button"
                className={`thap-icon${chatOpen ? ' on' : ''}`}
                onClick={() => {
                  playThap('click');
                  onToggleChat?.();
                }}
                title="Trò chuyện"
                aria-label="Trò chuyện"
              >
                <MessageSquare size={17} />
                {!chatOpen && (unreadCount ?? 0) > 0 && <span className="thap-badge">{unreadBadge}</span>}
              </button>

              {dock !== undefined && dock !== null && <div className="thap-dock">{dock}</div>}

              <button
                type="button"
                className={`thap-icon${isActiveFighter ? ' danger' : ''}`}
                onClick={() => {
                  playThap('click');
                  onLeave?.();
                }}
                title={isActiveFighter ? 'Đầu hàng / Rời trận' : 'Rời phòng'}
                aria-label={isActiveFighter ? 'Đầu hàng' : 'Rời phòng'}
              >
                {isActiveFighter ? <Flag size={16} /> : <LogOut size={17} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});

export default MiragineTopHud;
