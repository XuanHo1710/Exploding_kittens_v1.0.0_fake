/**
 * Hồ sơ người chơi: đổi tên + avatar (mèo vẽ sẵn hoặc ảnh tải lên server).
 * Thông tin lưu trong localStorage (identity), ảnh lưu ở server: /avatars/<file>
 */
import { useRef, useState } from 'react';
import type { AccountInfo, Identity } from '../../../shared/src';
import { fmtCoins } from './Dock';
import PlayerAvatar from '../art/PlayerAvatar';
import Modal from './Modal';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

const randomSeeds = () => Array.from({ length: 11 }, () => Math.random().toString(36).slice(2, 9));

/** Cắt vuông giữa ảnh + thu về 256px để ảnh nhẹ (~20–40KB) */
async function toSquareDataUrl(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Không đọc được ảnh'));
      i.src = url;
    });
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface Props {
  identity: Identity;
  account: AccountInfo | null;
  onDaily: () => void;
  onLogout: () => void;
  onSave: (patch: { name: string; avatar?: string }) => void;
  onClose: () => void;
}

export default function ProfileModal({ identity, account, onDaily, onLogout, onSave, onClose }: Props) {
  const [name, setName] = useState(identity.name);
  const [avatar, setAvatar] = useState<string | undefined>(identity.avatar);
  const [seeds, setSeeds] = useState(randomSeeds);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file?: File) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Chọn file ảnh (jpg, png, webp…) nhé.');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await toSquareDataUrl(file);
      const res = await fetch(`${SERVER_URL}/api/avatar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: identity.playerId, dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? 'Tải ảnh lỗi');
      setAvatar(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tải ảnh lỗi, thử lại nhé.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const options = [undefined, ...seeds.map((s) => `cat:${s}`)];
  const changed = name.trim() !== identity.name || avatar !== identity.avatar;

  return (
    <Modal title="🐱 Hồ sơ của bạn" onClose={onClose} width={560}>
      <div className="profile-head">
        <div className="profile-preview">
          <PlayerAvatar id={identity.playerId} avatar={avatar} size={104} />
          {uploading && <span className="profile-uploading">Đang tải…</span>}
        </div>
        <div className="profile-name">
          <label className="muted small" htmlFor="profile-name">
            Tên hiển thị
          </label>
          <input id="profile-name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
          <span className="muted small">Đăng nhập máy khác bằng tên này + mã PIN</span>
        </div>
      </div>

      {account && (
        <section className="wallet">
          <div className="wallet-main">
            <span className="wallet-label">Ví xu</span>
            <span className="wallet-coins">🪙 {fmtCoins(account.coins)}</span>
            <span className="muted small">
              Đã chơi {account.games} ván · thắng {account.wins}
              {account.games > 0 && ` (${Math.round((account.wins / account.games) * 100)}%)`}
            </span>
          </div>
          <button className={account.canClaimDaily ? 'primary' : 'secondary'} disabled={!account.canClaimDaily} onClick={onDaily}>
            {account.canClaimDaily ? '🎁 Nhận 500 xu hôm nay' : '✓ Hôm nay nhận rồi'}
          </button>
        </section>
      )}

      <section className="profile-section">
        <div className="profile-section-head">
          <h3>Chọn mèo</h3>
          <button className="ghost" onClick={() => setSeeds(randomSeeds())}>
            🎲 Kiểu khác
          </button>
        </div>
        <div className="avatar-grid">
          {options.map((a) => (
            <button key={a ?? 'default'} className={`avatar-opt${a === avatar ? ' on' : ''}`} onClick={() => setAvatar(a)} title={a ? 'Mèo ngẫu nhiên' : 'Mèo mặc định'}>
              <PlayerAvatar id={identity.playerId} avatar={a} size={52} />
            </button>
          ))}
          {avatar?.startsWith('/avatars/') && (
            <button className="avatar-opt on" title="Ảnh của bạn">
              <PlayerAvatar id={identity.playerId} avatar={avatar} size={52} />
            </button>
          )}
        </div>
      </section>

      <section className="profile-section">
        <h3>Hoặc dùng ảnh của bạn</h3>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <button className="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          📷 {uploading ? 'Đang tải ảnh…' : 'Tải ảnh lên'}
        </button>
        <span className="muted small"> Ảnh tự cắt vuông, thu nhỏ còn 256px.</span>
        {error && <p className="bad-text">{error}</p>}
      </section>

      <div className="modal-actions">
        <button className="ghost logout" onClick={onLogout} title="Xoá thông tin trên trình duyệt này (đăng nhập lại bằng tên + PIN)">
          ↩ Đăng xuất
        </button>
        <button className="ghost" onClick={onClose}>
          Huỷ
        </button>
        <button className="primary big" disabled={!name.trim() || uploading || !changed} onClick={() => onSave({ name: name.trim(), avatar })}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}
