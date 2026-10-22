/**
 * Hồ sơ người chơi: đổi tên + avatar (mèo vẽ sẵn hoặc ảnh tải lên server).
 * Thông tin lưu trong localStorage (identity), ảnh lưu ở server: /avatars/<file>
 */
import { useRef, useState } from 'react';
import { Check, Coins, Gift, LogOut, RefreshCw, Upload, User } from 'lucide-react';
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
  onSave: (patch: { name: string; avatar?: string }, closeAfter?: boolean) => Promise<void>;
  onClose: () => void;
}

export default function ProfileModal({ identity, account, onDaily, onLogout, onSave, onClose }: Props) {
  const [name, setName] = useState(identity.name);
  const [avatar, setAvatar] = useState<string | undefined>(identity.avatar);
  const [seeds, setSeeds] = useState(randomSeeds);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const persist = async (nextName: string, nextAvatar: string | undefined, closeAfter = false) => {
    const trimmed = nextName.trim();
    if (!trimmed || saving || uploading) return;
    if (!closeAfter && trimmed === identity.name && nextAvatar === identity.avatar) return;
    setSaving(true);
    setError('');
    setSavedNotice('');
    try {
      await onSave({ name: trimmed, avatar: nextAvatar }, closeAfter);
      if (!closeAfter) setSavedNotice('✓ Đã tự động lưu');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được hồ sơ. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = (nextAvatar: string | undefined) => {
    setAvatar(nextAvatar);
    void persist(name, nextAvatar, false);
  };

  const upload = async (file?: File) => {
    if (!file || saving) return;
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
        body: JSON.stringify({ playerId: identity.playerId, token: identity.token, dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? 'Tải ảnh lỗi');
      setAvatar(json.url);
      setUploading(false);
      await persist(name, json.url, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tải ảnh lỗi, thử lại nhé.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const options = [undefined, ...seeds.map((s) => `cat:${s}`)];
  const changed = name.trim() !== identity.name || avatar !== identity.avatar;

  const save = async () => {
    if (saving || uploading || !name.trim()) return;
    if (!changed) {
      onClose();
      return;
    }
    await persist(name, avatar, true);
  };

  return (
    <Modal title={<span className="modal-title-icon"><User size={19} /> Hồ sơ của bạn</span>} onClose={saving ? undefined : onClose} width={560}>
      <div className="profile-head">
        <div className="profile-preview">
          <PlayerAvatar id={identity.playerId} avatar={avatar} size={96} />
          {uploading && <span className="profile-uploading">Đang tải…</span>}
        </div>
        <div className="profile-name">
          <label className="muted small" htmlFor="profile-name">
            Tên hiển thị
          </label>
          <input
            id="profile-name"
            maxLength={20}
            value={name}
            disabled={saving}
            onChange={(e) => {
              setName(e.target.value);
              setSavedNotice('');
            }}
            onBlur={() => {
              if (name.trim() && name.trim() !== identity.name) void persist(name, avatar, false);
            }}
          />
          <span className="muted small">
            {saving ? '⏳ Đang tự động lưu…' : savedNotice || 'Đăng nhập máy khác bằng tên này + mã PIN'}
          </span>
        </div>
      </div>

      {account && (
        <section className="wallet">
          <div className="wallet-main">
            <span className="wallet-label">Ví xu</span>
            <span className="wallet-coins">
              <Coins size={24} className="inline-icon" /> {fmtCoins(account.coins)}
            </span>
            <span className="muted small">
              Đã chơi {account.games} ván · thắng {account.wins}
              {account.games > 0 && ` (${Math.round((account.wins / account.games) * 100)}%)`}
            </span>
          </div>
          <button className={account.canClaimDaily ? 'primary' : 'secondary'} disabled={saving || !account.canClaimDaily} onClick={onDaily}>
            {account.canClaimDaily ? (
              <>
                <Gift size={16} /> Nhận 500 xu hôm nay
              </>
            ) : (
              <>
                <Check size={16} /> Hôm nay nhận rồi
              </>
            )}
          </button>
        </section>
      )}

      <section className="profile-section">
        <div className="profile-section-head">
          <h3>Chọn biểu tượng</h3>
          <button className="ghost" disabled={saving} onClick={() => setSeeds(randomSeeds())}>
            <RefreshCw size={14} /> Đổi mẫu khác
          </button>
        </div>
        <div className="avatar-grid">
          {options.map((a) => (
            <button key={a ?? 'default'} className={`avatar-opt${a === avatar ? ' on' : ''}`} disabled={saving} onClick={() => pickAvatar(a)} title={a ? 'Biểu tượng ngẫu nhiên' : 'Biểu tượng mặc định'}>
              <PlayerAvatar id={identity.playerId} avatar={a} size={52} />
            </button>
          ))}
          {avatar?.startsWith('/avatars/') && (
            <button className="avatar-opt on" disabled={saving} title="Ảnh của bạn">
              <PlayerAvatar id={identity.playerId} avatar={avatar} size={52} />
            </button>
          )}
        </div>
      </section>

      <section className="profile-section">
        <h3>Hoặc dùng ảnh của bạn</h3>
        <input ref={fileRef} type="file" accept="image/*" hidden disabled={saving || uploading} onChange={(e) => upload(e.target.files?.[0])} />
        <button className="secondary" disabled={saving || uploading} onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {uploading ? 'Đang tải ảnh…' : 'Tải ảnh lên'}
        </button>
        <span className="muted small"> Ảnh tự cắt vuông, thu nhỏ còn 256px.</span>
      </section>

      {error && <p className="bad-text" role="alert">{error}</p>}

      <div className="modal-actions">
        <button className="ghost logout" disabled={saving} onClick={onLogout} title="Xoá thông tin trên trình duyệt này (đăng nhập lại bằng tên + PIN)">
          <LogOut size={16} /> Đăng xuất
        </button>
        <button className="ghost" disabled={saving} onClick={onClose}>
          Đóng
        </button>
        <button className="primary big" disabled={!name.trim() || uploading || saving} onClick={save}>
          {saving ? 'Đang lưu…' : changed ? 'Lưu & Đóng' : 'Xong'}
        </button>
      </div>
    </Modal>
  );
}
