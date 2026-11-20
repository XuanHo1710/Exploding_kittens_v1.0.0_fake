import React, { useState } from 'react';
import { apiClient } from '../network/ApiClient';
import {
  useAuthStore,
  useHudStore,
  useInventoryStore,
  useProgressionStore,
} from '../stores/gameStores';

const STARTER_HEROES = [
  {
    id: 'chr_kael_vanguard',
    name: 'Kael Ironbound',
    title: 'Vanguard of the Ashen Hearth',
    role: 'Warrior • FIRE • Melee DPS',
    portrait: '/assets/v1/ui/portraits/chr_kael_vanguard.png',
    desc: 'Kiếm sĩ tuyến đầu khắc chế Thornback Elder (điểm yếu Lửa). Ultimate: Crimson Crescent!',
  },
  {
    id: 'chr_lyra_windrunner',
    name: 'Lyra Windrunner',
    title: 'Gale Ranger of Whispering Forest',
    role: 'Archer • WIND • Ranged DPS',
    portrait: '/assets/v1/ui/portraits/chr_lyra_windrunner.png',
    desc: 'Xạ thủ cơ động né đòn siêu nhanh, giữ khoảng cách an toàn. Ultimate: Tempest Arrowstorm!',
  },
  {
    id: 'chr_seraphina_dawn',
    name: 'Seraphina Dawn',
    title: 'Oracle of the First Sun',
    role: 'Healer / Mage • LIGHT • Support',
    portrait: '/assets/v1/ui/portraits/chr_seraphina_dawn.png',
    desc: 'Hồi máu đồng đội, tạo khiên ánh sáng và trừng phạt bằng cột sáng Solar Judgment!',
  },
] as const;

interface Props {
  onEnterWorld: (characterId: string) => Promise<void>;
}

export const AuthAndLobbyScreens: React.FC<Props> = ({ onEnterWorld }) => {
  const { screen, setScreen, account, setAccount, characters, setCharacters, setPreferences } = useAuthStore();
  const loadProgress = useHudStore((s) => s.loadProgress);

  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [charName, setCharName] = useState('');
  const [selectedHero, setSelectedHero] = useState<(typeof STARTER_HEROES)[number]['id']>('chr_kael_vanguard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLobbyData = async () => {
    const [chars, catalog, enhTable, gachaCat] = await Promise.all([
      apiClient.request<any[]>('GET', '/api/v1/characters'),
      apiClient.request<any>('GET', '/api/v1/catalog'),
      apiClient.request<any>('GET', '/api/v1/enhancement/table'),
      apiClient.request<any>('GET', '/api/v1/gacha/banners'),
    ]);
    setCharacters(chars);
    useInventoryStore.getState().setCatalog(catalog);
    useInventoryStore.getState().setEnhancementTable(enhTable.tiers || []);
    useProgressionStore.getState().setGachaCatalog(gachaCat);
    setScreen(chars.length > 0 ? 'CHAR_SELECT' : 'CHAR_CREATE');
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data =
        mode === 'REGISTER'
          ? await apiClient.request('POST', '/api/v1/auth/register', { username, email, password }, { skipAuth: true })
          : await apiClient.request('POST', '/api/v1/auth/login', { identifier, password }, { skipAuth: true });
      apiClient.setTokens(data.accessToken, data.refreshToken);
      setAccount(data.account);
      if (data.account?.preferences) setPreferences(data.account.preferences);
      await loadLobbyData();
    } catch (err: any) {
      setError(err.message || 'Xác thực thất bại');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const bundle = await apiClient.request('POST', '/api/v1/characters', {
        name: charName.trim(),
        starterHeroId: selectedHero,
      });
      await onEnterWorld(bundle.character.id);
    } catch (err: any) {
      setError(err.message || 'Không thể tạo nhân vật');
    } finally {
      setBusy(false);
    }
  };

  // SCR-01: Login & Register
  if (screen === 'LOGIN') {
    return (
      <div
        data-testid="screen-login"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 25%, #2b1f1a 0%, #110d0c 70%)',
        }}
      >
        <div className="rpg-panel rpg-panel-gold" style={{ width: 430, padding: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: '#e4b65d', letterSpacing: 2 }}>16-BIT PIXEL FANTASY RPG</div>
            <h1 style={{ margin: '6px 0 4px', fontSize: 24, color: '#f4e6c8', textShadow: '2px 2px 0 #000' }}>
              ELDORIA: FORGOTTEN WILDS
            </h1>
            <div style={{ fontSize: 12, color: '#c2b092' }}>
              100% Local JSON Primary DB • Pixel-Perfect 640×360 • Fair Gameplay
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              className={`rpg-btn ${mode === 'LOGIN' ? 'rpg-btn-primary' : ''}`}
              style={{ flex: 1 }}
              onClick={() => {
                setMode('LOGIN');
                setError(null);
              }}
            >
              Đăng Nhập
            </button>
            <button
              type="button"
              className={`rpg-btn ${mode === 'REGISTER' ? 'rpg-btn-primary' : ''}`}
              style={{ flex: 1 }}
              onClick={() => {
                setMode('REGISTER');
                setError(null);
              }}
            >
              Đăng Ký Mới
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'REGISTER' ? (
              <>
                <input
                  className="rpg-input"
                  placeholder="Tên tài khoản (3-24 ký tự a-z0-9_)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <input
                  className="rpg-input"
                  type="email"
                  placeholder="Email (vd: hero@eldoria.local)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </>
            ) : (
              <input
                className="rpg-input"
                placeholder="Username hoặc Email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            )}
            <input
              className="rpg-input"
              type="password"
              placeholder="Mật khẩu (>=10 ký tự, có Hoa, thường, số)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <div style={{ background: '#451414', border: '1px solid #f87171', padding: 8, fontSize: 12, color: '#fecaca' }}>
                {error}
              </div>
            )}
            <button type="submit" className="rpg-btn rpg-btn-primary" disabled={busy} style={{ padding: '10px 14px', fontSize: 14 }}>
              {busy ? 'Đang kết nối...' : mode === 'REGISTER' ? 'Khởi Tạo Tài Khoản Eldoria' : 'Vào Thế Giới Eldoria'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // SCR-02: Character Selection
  if (screen === 'CHAR_SELECT') {
    return (
      <div
        data-testid="screen-char-select"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 25%, #271d18 0%, #110d0c 75%)',
          padding: 20,
        }}
      >
        <div className="rpg-panel rpg-panel-gold" style={{ width: 'min(820px, 95vw)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: '#e4b65d' }}>Chọn Nhân Vật ({characters.length}/4)</h2>
              <div style={{ fontSize: 12, color: '#c2b092' }}>Tài khoản: {account?.username}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {characters.length < 4 && (
                <button className="rpg-btn rpg-btn-emerald" onClick={() => setScreen('CHAR_CREATE')}>
                  + Tạo Nhân Vật Mới
                </button>
              )}
              <button
                className="rpg-btn"
                onClick={() => {
                  apiClient.setTokens(null, null);
                  setScreen('LOGIN');
                }}
              >
                Đăng Xuất
              </button>
            </div>
          </div>

          <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
            {characters.map((ch) => (
              <div key={ch.id} className="rpg-card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img
                  className="pixel-art"
                  src={`/assets/v1/ui/portraits/${ch.activeHeroId}.png`}
                  alt={ch.name}
                  style={{ width: 72, height: 72, border: '2px solid #a8763e', background: '#17110e' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#f4e6c8' }}>{ch.name}</div>
                  <div style={{ fontSize: 12, color: '#e4b65d' }}>
                    Lv.{ch.level} • CR {ch.computedStats?.combatRating ?? 100}
                  </div>
                  <div style={{ fontSize: 11, color: '#c2b092', marginTop: 4 }}>
                    Gold: {ch.wallet?.gold} • Shards: {ch.wallet?.starlightShard}
                  </div>
                </div>
                <button className="rpg-btn rpg-btn-primary" onClick={() => void onEnterWorld(ch.id)}>
                  Chơi Ngay
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // SCR-03: Starter Character Creation
  if (screen === 'CHAR_CREATE') {
    return (
      <div
        data-testid="screen-char-create"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 25%, #271d18 0%, #110d0c 75%)',
          padding: 20,
        }}
      >
        <div className="rpg-panel rpg-panel-gold" style={{ width: 'min(900px, 96vw)', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ margin: 0, color: '#e4b65d' }}>Chọn Anh Hùng Khởi Đầu — Greenhaven Village</h2>
            {characters.length > 0 && (
              <button className="rpg-btn" onClick={() => setScreen('CHAR_SELECT')}>
                ← Quay lại
              </button>
            )}
          </div>

          <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
            {STARTER_HEROES.map((h) => {
              const active = selectedHero === h.id;
              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedHero(h.id)}
                  className="rpg-card"
                  style={{
                    cursor: 'pointer',
                    borderColor: active ? '#e4b65d' : '#593e29',
                    background: active ? 'rgba(168, 118, 62, 0.22)' : 'rgba(17, 12, 10, 0.72)',
                    textAlign: 'center',
                  }}
                >
                  <img
                    className="pixel-art"
                    src={h.portrait}
                    alt={h.name}
                    style={{ width: 96, height: 96, border: '2px solid #a8763e', marginBottom: 8 }}
                  />
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#f4e6c8' }}>{h.name}</div>
                  <div style={{ fontSize: 11, color: '#e4b65d', marginBottom: 6 }}>{h.role}</div>
                  <div style={{ fontSize: 12, color: '#c2b092', lineHeight: 1.4 }}>{h.desc}</div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleCreateCharacter} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              className="rpg-input"
              style={{ flex: 1 }}
              placeholder="Đặt tên nhân vật (3-20 ký tự, vd: ArisuVanguard)"
              value={charName}
              onChange={(e) => setCharName(e.target.value)}
              required
            />
            <button type="submit" className="rpg-btn rpg-btn-primary" disabled={busy} style={{ padding: '10px 20px' }}>
              {busy ? 'Đang khởi tạo...' : 'Bắt Đầu Hành Trình'}
            </button>
          </form>
          {error && <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>
      </div>
    );
  }

  // SCR-04: Loading Screen
  return (
    <div
      data-testid="screen-loading"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#110d0c',
        padding: 24,
      }}
    >
      <div className="rpg-panel rpg-panel-gold" style={{ width: 460, padding: 22, textAlign: 'center' }}>
        <h2 style={{ margin: '0 0 10px', color: '#e4b65d' }}>ELDORIA: FORGOTTEN WILDS</h2>
        <div className="rpg-bar-track" style={{ height: 18, marginBottom: 10 }}>
          <div className="rpg-bar-fill" style={{ width: `${loadProgress.pct}%`, background: '#e4b65d' }} />
          <div className="rpg-bar-label">{loadProgress.pct}%</div>
        </div>
        <div style={{ fontSize: 12, color: '#c2b092' }}>{loadProgress.label}</div>
      </div>
    </div>
  );
};
