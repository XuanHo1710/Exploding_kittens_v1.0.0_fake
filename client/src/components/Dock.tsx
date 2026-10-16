/** Thanh điều khiển nổi (thay header): xu · luật · kiểu bài · âm thanh · nền · hồ sơ */
import { useState } from 'react';
import type { AccountInfo, Identity } from '../../../shared/src';
import PlayerAvatar from '../art/PlayerAvatar';
import type { Settings } from '../settings';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  identity: Identity | null;
  account: AccountInfo | null;
  online: boolean;
  onRules: () => void;
  onProfile: () => void;
}

export const fmtCoins = (n: number) => n.toLocaleString('vi-VN');

export default function Dock({ settings, update, identity, account, online, onRules, onProfile }: Props) {
  return (
    <div className="dock" role="toolbar" aria-label="Điều khiển">
      {account && (
        <button className="dock-coins" onClick={onProfile} title="Xu của bạn (bấm để nhận xu hằng ngày)">
          🪙 <b>{fmtCoins(account.coins)}</b>
          {account.canClaimDaily && <span className="dock-dot" />}
        </button>
      )}
      <button className="dock-btn" onClick={onRules} title="Luật chơi">
        📖
      </button>
      <button className="dock-btn" onClick={() => update({ cardStyle: settings.cardStyle === 'vector' ? 'photo' : 'vector' })} title={settings.cardStyle === 'vector' ? 'Đang dùng bài vẽ – đổi sang ảnh gốc' : 'Đang dùng ảnh gốc – đổi sang bài vẽ'}>
        🃏
      </button>
      <button className="dock-btn" onClick={() => update({ sound: !settings.sound })} title={settings.sound ? 'Tắt âm thanh' : 'Bật âm thanh'}>
        {settings.sound ? '🔊' : '🔇'}
      </button>
      <button className="dock-btn" onClick={() => update({ theme: settings.theme === 'light' ? 'dark' : 'light' })} title="Nền sáng / tối">
        {settings.theme === 'light' ? '🌙' : '☀️'}
      </button>
      {identity && (
        <button className="dock-me" onClick={onProfile} title={`${identity.name} – hồ sơ & avatar`}>
          <PlayerAvatar id={identity.playerId} avatar={identity.avatar} size={32} />
          <span className={online ? 'dot on' : 'dot'} />
        </button>
      )}
    </div>
  );
}

/** Logo + mã phòng (bấm để copy mã) */
export function Brand({ code }: { code?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="brand">
      <span className="logo">
        <span className="logo-bomb">💣</span> Mèo Nổ
      </span>
      {code && (
        <button
          className="room-tag"
          title="Bấm để copy mã phòng"
          onClick={() => {
            navigator.clipboard?.writeText(code).then(
              () => setCopied(true),
              () => setCopied(false),
            );
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? '✓ Đã copy' : `Phòng ${code}`}
        </button>
      )}
    </div>
  );
}
