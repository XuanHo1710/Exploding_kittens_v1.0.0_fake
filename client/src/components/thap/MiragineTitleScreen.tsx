/**
 * Màn hình tiêu đề 4:3 nguyên bản Miragine War (1P vs AI / 1v1 PvP)
 * dùng khung `title_bg.jpg`, nút `logo_unit.png` và huy hiệu `logo_miragine.png`.
 */
import { BookOpen, LogOut, Play } from 'lucide-react';
import {
  THAP_BOT_LABEL,
  THAP_MINUTE_OPTIONS,
  THAP_MODE_LABEL,
  type ThapBotLevel,
} from '../../../../shared/src';
import { playThap } from '../../thap/sound';
import { MIRAGINE_UI_ASSETS } from '../../thap/sprites';
import type { MiragineTitleScreenProps } from './miragineTypes';

const BOT_LEVELS: readonly ThapBotLevel[] = ['easy', 'normal', 'hard'];

function formatMinuteOption(minutes: number): string {
  return minutes === 0 ? 'Đánh tới vỡ Pha Lê' : `${minutes} phút`;
}

/**
 * Màn hình tiêu đề cổ điển tỷ lệ 4:3 cho phòng chờ / khởi động Miragine War.
 * Chủ phòng chỉnh độ khó AI (khi solo) & thời lượng trận; khách chỉ xem.
 */
export default function MiragineTitleScreen({
  config,
  isHost,
  players,
  canStart,
  onChangeConfig,
  onStart,
  onOpenTutorial,
  onLeave,
}: MiragineTitleScreenProps) {
  const isSolo = (players ? players.length < 2 : false) || config.mode === 'solo';
  const modeSubtitle = isSolo ? THAP_MODE_LABEL.solo : `${THAP_MODE_LABEL.pvp} · 2P`;
  const startDisabled = !isHost || canStart === false;
  const canEditConfig = isHost && Boolean(onChangeConfig);
  const glossyBtnStyle = { backgroundImage: `url(${MIRAGINE_UI_ASSETS.logo_unit})` };

  return (
    <div className="thap-title-backdrop">
      <div className="thap-title-stage" role="region" aria-label="Miragine War">
        <img
          src={MIRAGINE_UI_ASSETS.title_bg}
          alt="Miragine War"
          className="thap-title-bg"
          draggable={false}
        />

        <div className="thap-title-menu">
          <div
            className="thap-diff-row"
            style={{
              padding: '3px 12px',
              fontSize: 'clamp(10.5px, 1.6vw, 12.5px)',
              fontWeight: 700,
              color: '#ffe066',
            }}
          >
            <span>{modeSubtitle}</span>
            {!isHost && (
              <span className="muted" style={{ fontWeight: 500 }}>
                · Chờ chủ phòng
              </span>
            )}
          </div>

          {isSolo && (
            <div className="thap-diff-row" role="group" aria-label="Độ khó AI">
              <span
                className="muted"
                style={{ fontSize: 'clamp(10px, 1.5vw, 11.5px)', fontWeight: 700, padding: '0 6px' }}
              >
                AI:
              </span>
              {BOT_LEVELS.map((level) => {
                const active = config.botLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    className={`thap-diff-pill${active ? ' on' : ''}`}
                    disabled={!canEditConfig}
                    aria-pressed={active}
                    title={canEditConfig ? `Độ khó AI: ${THAP_BOT_LABEL[level]}` : 'Chỉ chủ phòng được chỉnh'}
                    onClick={() => {
                      playThap('click');
                      onChangeConfig?.({ botLevel: level });
                    }}
                  >
                    {THAP_BOT_LABEL[level]}
                  </button>
                );
              })}
            </div>
          )}

          <div className="thap-diff-row" role="group" aria-label="Thời gian trận đấu">
            {THAP_MINUTE_OPTIONS.map((minutes) => {
              const active = config.minutes === minutes;
              const label = formatMinuteOption(minutes);
              return (
                <button
                  key={minutes}
                  type="button"
                  className={`thap-diff-pill${active ? ' on' : ''}`}
                  disabled={!canEditConfig}
                  aria-pressed={active}
                  title={
                    canEditConfig
                      ? minutes === 0
                        ? 'Đánh tới khi một Pha Lê Chính bị phá hủy'
                        : `Giới hạn ${minutes} phút`
                      : 'Chỉ chủ phòng được chỉnh'
                  }
                  onClick={() => {
                    playThap('click');
                    onChangeConfig?.({ minutes });
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="thap-glossy-btn"
            style={glossyBtnStyle}
            disabled={startDisabled}
            title={
              !isHost
                ? 'Chờ chủ phòng bắt đầu trận đấu'
                : canStart === false
                  ? 'Chưa đủ điều kiện bắt đầu trận đấu'
                  : 'Bắt đầu trận Miragine War'
            }
            onClick={() => {
              playThap('click');
              onStart();
            }}
          >
            <Play size={15} fill="currentColor" aria-hidden="true" />
            BẮT ĐẦU
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="thap-glossy-btn secondary"
              style={glossyBtnStyle}
              onClick={() => {
                playThap('click');
                onOpenTutorial();
              }}
            >
              <BookOpen size={14} aria-hidden="true" />
              HƯỚNG DẪN
            </button>

            {onLeave && (
              <button
                type="button"
                className="thap-glossy-btn secondary"
                style={glossyBtnStyle}
                onClick={() => {
                  playThap('click');
                  onLeave();
                }}
              >
                <LogOut size={14} aria-hidden="true" />
                RỜI PHÒNG
              </button>
            )}
          </div>
        </div>

        <div className="thap-title-footer">
          <img
            src={MIRAGINE_UI_ASSETS.logo_miragine}
            alt="MoFunZone - Miragine War"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
