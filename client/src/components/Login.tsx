import { useState } from 'react';
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import type { Identity } from '../../../shared/src';
import { loginAccount, registerAccount } from '../api';
import { genId, saveAccountIdentity } from '../identity';
import Landing from './Hero';

interface Props {
  /** Người chơi cũ chưa có PIN: giữ playerId + tên, chỉ cần đặt PIN */
  identity: Identity | null;
  onAuth: (identity: Identity) => void;
}

export default function Login({ identity, onAuth }: Props) {
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [name, setName] = useState(identity?.name ?? '');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const legacy = !!identity && !identity.token;
  const ready = name.trim().length > 0 && /^\d{4,6}$/.test(pin);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const r =
        mode === 'create'
          ? await registerAccount(identity?.playerId ?? genId(), name.trim(), pin, identity?.avatar)
          : await loginAccount(name.trim(), pin);
      onAuth(saveAccountIdentity(r.account, r.token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi, thử lại nhé');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Landing>
      <form
        className="panel auth"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="seg auth-tabs">
          <button type="button" className={mode === 'create' ? 'on' : ''} onClick={() => setMode('create')}>
            <UserPlus size={15} /> {legacy ? 'Đặt mã PIN' : 'Tạo tài khoản'}
          </button>
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            <LogIn size={15} /> Đã có tài khoản
          </button>
        </div>

        <p className="muted">
          {mode === 'login'
            ? 'Nhập tên và mã PIN để lấy lại xu, avatar trên máy này.'
            : legacy
              ? 'Đặt mã PIN ngắn để giữ xu và đăng nhập ở máy khác.'
              : 'Chỉ cần tên + mã PIN 4–6 số. Tặng ngay 1.000 xu khởi đầu.'}
        </p>

        <label className="field">
          <span>Tên hiển thị</span>
          <input autoFocus={!name} maxLength={20} placeholder="VD: Xuân Hồ" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Mã PIN (4–6 số)</span>
          <div className="pin-row">
            <input
              autoFocus={!!name}
              className="pin-input"
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              maxLength={6}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowPin((v) => !v)}
              title={showPin ? 'Ẩn PIN' : 'Hiện PIN'}
              aria-label={showPin ? 'Ẩn PIN' : 'Hiện PIN'}
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        {error && <p className="bad-text">{error}</p>}
        <button className="primary big" disabled={!ready || busy}>
          {busy ? 'Đang xử lý…' : mode === 'create' ? 'Vào chơi' : 'Đăng nhập'}
        </button>
        <p className="muted small center">Xu chỉ là điểm ảo trong game, không quy đổi ra tiền.</p>
      </form>
    </Landing>
  );
}
