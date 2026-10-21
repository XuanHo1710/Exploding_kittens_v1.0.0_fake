import { useState } from 'react';
import { ArrowRight, Eye, Plus } from 'lucide-react';
import { GAME_MODES, type GameMode, type RoomRules } from '../../../shared/src';
import Landing from './Hero';
import RoomSettings, { getSavedRoomRules } from './RoomSettings';

function getInitialRoomCode(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get('room') ?? '';
    return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  } catch {
    return '';
  }
}

export default function Home({
  onCreate,
  onJoin,
  onWatch,
}: {
  onCreate: (rules: RoomRules, gameMode: GameMode) => void | Promise<void>;
  onJoin: (code: string) => void;
  onWatch: (code: string) => void;
}) {
  const [code, setCode] = useState(getInitialRoomCode);
  const [gameMode, setGameMode] = useState<GameMode>('exploding_kittens');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ready = code.trim().length === 4;

  const handleQuickCreate = async (mode: GameMode) => {
    setGameMode(mode);
    if (mode === 'exploding_kittens') {
      setSettingsOpen(true);
    } else {
      const base = getSavedRoomRules();
      await onCreate(
        {
          ...base,
          maxPlayers: mode === 'tien_len' ? 4 : mode === 'blackjack_21' ? 10 : 6,
        },
        mode,
      );
    }
  };

  return (
    <>
      <Landing>
        <div className="panel">
          <div className="panel-block">
            <h2>Chọn trò chơi & Tạo phòng mới</h2>
            <p className="muted">Hỗ trợ cược xu thật trong tài khoản cho cả 3 chế độ chơi!</p>
            <div className="mode-select-grid">
              {(Object.keys(GAME_MODES) as GameMode[]).map((m) => {
                const info = GAME_MODES[m];
                const active = gameMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    className={`mode-card${active ? ' on' : ''}`}
                    onClick={() => setGameMode(m)}
                  >
                    <div className="mode-card-head">
                      <span className="mode-emoji">{info.emoji}</span>
                      <b>{info.name}</b>
                    </div>
                    <small className="muted">{info.desc}</small>
                  </button>
                );
              })}
            </div>
            <button className="primary big" onClick={() => void handleQuickCreate(gameMode)}>
              <Plus size={18} /> Tạo phòng {GAME_MODES[gameMode].shortName}
            </button>
          </div>
          <div className="divider">
            <span>hoặc</span>
          </div>
          <form
            className="panel-block"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) onJoin(code);
            }}
          >
            <h2>Vào phòng có sẵn</h2>
            <p className="muted">Nhập mã 4 chữ chủ phòng gửi cho bạn. Bấm “Xem” để vào làm khán giả (tối đa 15 người/phòng), kể cả khi ván đang chơi.</p>
            <div className="join-row">
              <input
                className="code-input"
                maxLength={4}
                placeholder="VD: ABCD"
                aria-label="Mã phòng 4 chữ"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              />
              <button className={ready ? 'primary big' : 'secondary big'} disabled={!ready}>
                Vào <ArrowRight size={18} />
              </button>
              <button type="button" className="secondary big" disabled={!ready} onClick={() => onWatch(code)} title="Vào xem, không ngồi bàn">
                <Eye size={18} /> Xem
              </button>
            </div>
          </form>
        </div>
      </Landing>
      {settingsOpen && (
        <RoomSettings
          initialRules={getSavedRoomRules()}
          onClose={() => setSettingsOpen(false)}
          onConfirm={async (rules) => {
            await onCreate(rules, 'exploding_kittens');
            setSettingsOpen(false);
          }}
        />
      )}
    </>
  );
}
