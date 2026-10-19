/** Thanh điều khiển nổi (thay header): xu · luật · âm thanh · nền · hồ sơ */
import { useState } from 'react';
import { Bomb, BookOpen, Check, Coins, Copy, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
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

export function copyTextSafe(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => fallbackCopy(text),
    );
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function Dock({ settings, update, identity, account, online, onRules, onProfile }: Props) {
  return (
    <div className="dock" role="toolbar" aria-label="Điều khiển">
      {account && (
        <button className="dock-coins" onClick={onProfile} title="Xu của bạn (bấm để nhận xu hằng ngày)">
          <Coins size={16} /> <b>{fmtCoins(account.coins)}</b>
          {account.canClaimDaily && <span className="dock-dot" />}
        </button>
      )}
      <button className="dock-btn" onClick={onRules} title="Luật chơi" aria-label="Luật chơi">
        <BookOpen size={18} />
      </button>
      <button
        className="dock-btn"
        onClick={() => update({ sound: !settings.sound })}
        title={settings.sound ? 'Tắt âm thanh' : 'Bật âm thanh'}
        aria-label={settings.sound ? 'Tắt âm thanh' : 'Bật âm thanh'}
      >
        {settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
      <button
        className="dock-btn"
        onClick={() => update({ theme: settings.theme === 'light' ? 'dark' : 'light' })}
        title="Nền sáng / tối"
        aria-label="Đổi giao diện sáng tối"
      >
        {settings.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
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
        <Bomb size={19} className="logo-icon" /> <span className="logo-text">Mèo Nổ</span>
      </span>
      {code && (
        <button
          className="room-tag"
          title="Bấm để copy mã phòng"
          onClick={() => {
            void copyTextSafe(code).then((ok) => setCopied(ok));
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? (
            <>
              <Check size={13} /> Đã copy
            </>
          ) : (
            <>
              Phòng {code} <Copy size={12} />
            </>
          )}
        </button>
      )}
    </div>
  );
}
