import React, { useEffect, useState } from 'react';
import { gameUiBridge } from '../bridge/GameUiBridge';
import { inputFocusManager } from '../bridge/InputFocusManager';
import { realtimeClient } from '../network/RealtimeClient';
import {
  ModalScreenId,
  useAuthStore,
  useHomesteadStore,
  useHudStore,
  useProgressionStore,
  useSocialStore,
  useUiModalStore,
} from '../stores/gameStores';

const NAV_BUTTONS: Array<{ id: ModalScreenId; label: string; keyHint: string }> = [
  { id: 'INVENTORY', label: 'Túi Đồ', keyHint: 'I' },
  { id: 'EQUIPMENT', label: 'Trang Bị', keyHint: 'C' },
  { id: 'STATS', label: 'Chỉ Số', keyHint: 'P' },
  { id: 'SKILL_TREE', label: 'Kỹ Năng', keyHint: 'K' },
  { id: 'HERO_COLLECTION', label: 'Anh Hùng', keyHint: 'H' },
  { id: 'GACHA', label: 'Gacha', keyHint: 'G' },
  { id: 'BLACKSMITH', label: 'Lò Rèn', keyHint: 'R' },
  { id: 'ENHANCEMENT', label: 'Cường Hóa', keyHint: 'U' },
  { id: 'CRAFTING', label: 'Chế Tạo', keyHint: 'V' },
  { id: 'BUILDING', label: 'Xây Dựng', keyHint: 'B' },
  { id: 'FARMING', label: 'Nông Trại', keyHint: 'N' },
  { id: 'QUESTS', label: 'Nhiệm Vụ', keyHint: 'J' },
  { id: 'WORLD_MAP', label: 'Bản Đồ', keyHint: 'M' },
  { id: 'PARTY', label: 'Tổ Đội', keyHint: 'O' },
  { id: 'SETTINGS', label: 'Cài Đặt', keyHint: 'ESC' },
];

export const GameHudOverlay: React.FC = () => {
  const hud = useHudStore((s) => s.hud);
  const minimap = useHudStore((s) => s.minimap);
  const skillCooldowns = useHudStore((s) => s.skillCooldowns);
  const toast = useHudStore((s) => s.toast);
  const wsConnected = useAuthStore((s) => s.wsConnected);
  const character = useProgressionStore((s) => s.character);
  const nextLevelExp = useProgressionStore((s) => s.nextLevelExp);
  const activeSkills = useProgressionStore((s) => s.activeSkills);
  const chatMessages = useSocialStore((s) => s.chatMessages);
  const openModal = useUiModalStore((s) => s.openModal);
  const placingBuildingId = useHomesteadStore((s) => s.placingBuildingId);
  const setPlacingBuildingId = useHomesteadStore((s) => s.setPlacingBuildingId);

  const [chatText, setChatText] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const usableSkills = activeSkills.filter((s: any) => s.skillType !== 'PASSIVE').slice(0, 4);
  const activeQuest = character?.quests?.find((q: any) => q.status === 'ACTIVE' || q.status === 'COMPLETED');

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputFocusManager.isImeComposing()) return;
    if (!chatText.trim()) return;
    await realtimeClient.sendChat('ZONE', chatText.trim());
    setChatText('');
  };

  return (
    <div
      data-testid="screen-hud"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 20 }}
    >
      {/* Top-Left: Hero Portrait + HP / MP / Stamina / EXP + Wallet (SCR-05) */}
      <div
        className="rpg-panel"
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 310,
          padding: 8,
          display: 'flex',
          gap: 10,
          pointerEvents: 'auto',
        }}
      >
        <img
          className="pixel-art"
          src={`/assets/v1/ui/portraits/${character?.activeHeroId || 'chr_kael_vanguard'}.png`}
          alt="hero"
          style={{ width: 58, height: 58, border: '2px solid #e4b65d', background: '#17110e', cursor: 'pointer' }}
          onClick={() => openModal('STATS')}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
            <span>
              {character?.name || 'Adventurer'} <span style={{ color: '#e4b65d' }}>Lv.{character?.level || 1}</span>
            </span>
            <span style={{ fontSize: 10, color: wsConnected ? '#45c470' : '#ff6b6b' }}>
              {wsConnected ? '● ONLINE' : '○ RECONNECT'}
            </span>
          </div>
          <div className="rpg-bar-track">
            <div className="rpg-bar-fill" style={{ width: `${Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100)}%`, background: 'var(--rpg-hp)' }} />
            <div className="rpg-bar-label">HP {hud.hp}/{hud.maxHp}</div>
          </div>
          <div className="rpg-bar-track" style={{ height: 13 }}>
            <div className="rpg-bar-fill" style={{ width: `${Math.min(100, (hud.mp / Math.max(1, hud.maxMp)) * 100)}%`, background: 'var(--rpg-mp)' }} />
            <div className="rpg-bar-label" style={{ fontSize: 10 }}>MP {hud.mp}/{hud.maxMp}</div>
          </div>
          <div className="rpg-bar-track" style={{ height: 13 }}>
            <div className="rpg-bar-fill" style={{ width: `${Math.min(100, (hud.stamina / Math.max(1, hud.maxStamina)) * 100)}%`, background: 'var(--rpg-stamina)' }} />
            <div className="rpg-bar-label" style={{ fontSize: 10 }}>STAM {hud.stamina}/{hud.maxStamina}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#e4b65d' }}>
            <span>Gold: {character?.wallet?.gold ?? 0}</span>
            <span>Shards: {character?.wallet?.starlightShard ?? 0}</span>
            <span>EXP: {character?.exp ?? 0}/{nextLevelExp}</span>
          </div>
        </div>
      </div>

      {/* Top-Center: Boss HP + Poise Bar when in Boss Arena */}
      {hud.bossHud && (
        <div
          className="rpg-panel rpg-panel-gold"
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 420,
            padding: '8px 12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
            <span style={{ color: '#ff6b6b' }}>☠ {hud.bossHud.name}</span>
            <span className="rpg-tag" style={{ color: '#facc15' }}>PHASE {hud.bossHud.phase}/3</span>
          </div>
          <div className="rpg-bar-track" style={{ height: 16, marginBottom: 4 }}>
            <div className="rpg-bar-fill" style={{ width: `${(hud.bossHud.hp / Math.max(1, hud.bossHud.maxHp)) * 100}%`, background: '#dc2626' }} />
            <div className="rpg-bar-label">{hud.bossHud.hp} / {hud.bossHud.maxHp}</div>
          </div>
          <div className="rpg-bar-track" style={{ height: 9 }}>
            <div className="rpg-bar-fill" style={{ width: `${(hud.bossHud.poise / Math.max(1, hud.bossHud.maxPoise)) * 100}%`, background: '#facc15' }} />
            <div className="rpg-bar-label" style={{ fontSize: 8 }}>POISE {hud.bossHud.poise}/{hud.bossHud.maxPoise}</div>
          </div>
        </div>
      )}

      {/* Top-Right: Minimap Widget (SCR-18) + Active Quest Tracker */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'flex-end',
          pointerEvents: 'auto',
        }}
      >
        <div
          data-testid="screen-minimap"
          className="rpg-panel"
          style={{ width: 176, padding: 6, cursor: 'pointer' }}
          onClick={() => openModal('WORLD_MAP')}
          title="Nhấn để mở Bản Đồ Thế Giới (M)"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#e4b65d', marginBottom: 4 }}>
            <span>{hud.zoneId.replace('reg_', '').replace('dng_', '').replace(/_/g, ' ')}</span>
            <span>{hud.timeOfDayPhase}</span>
          </div>
          <div style={{ position: 'relative', width: 160, height: 100, background: '#18241d', border: '1px solid #593e29', overflow: 'hidden' }}>
            {minimap.entities.map((e) => {
              const mx = Math.max(2, Math.min(156, (e.x / 1152) * 160));
              const my = Math.max(2, Math.min(96, (e.y / 832) * 100));
              const col =
                e.kind === 'PLAYER' ? '#45c470' : e.kind === 'BOSS' ? '#ff3b3b' : e.kind === 'MONSTER' || e.kind === 'ELITE' ? '#f97316' : e.kind === 'NPC' ? '#38bdf8' : e.kind === 'LOOT' ? '#facc15' : '#94a3b8';
              const sz = e.kind === 'BOSS' ? 7 : e.kind === 'PLAYER' ? 6 : 4;
              return (
                <div
                  key={e.id}
                  style={{
                    position: 'absolute',
                    left: mx,
                    top: my,
                    width: sz,
                    height: sz,
                    background: col,
                    borderRadius: '50%',
                  }}
                />
              );
            })}
          </div>
          <div style={{ fontSize: 9, color: '#c2b092', marginTop: 3 }}>
            ({hud.playerX}, {hud.playerY}) • Click mở Bản Đồ
          </div>
        </div>

        {activeQuest && (
          <div
            className="rpg-panel"
            style={{ width: 210, padding: 8, fontSize: 11, cursor: 'pointer' }}
            onClick={() => openModal('QUESTS')}
          >
            <div style={{ color: '#e4b65d', fontWeight: 700, marginBottom: 3 }}>
              ★ Nhiệm Vụ ({activeQuest.status})
            </div>
            <div style={{ color: '#f4e6c8' }}>{activeQuest.questId}</div>
            <div style={{ color: '#c2b092', fontSize: 10, marginTop: 2 }}>Nhấn J để xem & nhận thưởng</div>
          </div>
        )}
      </div>

      {/* Building Placement Mode Banner */}
      {placingBuildingId && (
        <div
          className="rpg-panel rpg-panel-gold"
          style={{
            position: 'absolute',
            top: 90,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            pointerEvents: 'auto',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <span>Chế độ Xây Dựng: Click lên mặt đất để đặt <b>{placingBuildingId}</b></span>
          <button className="rpg-btn rpg-btn-danger" onClick={() => setPlacingBuildingId(null)}>Hủy (ESC)</button>
        </div>
      )}

      {/* Contextual Interaction Prompt */}
      {hud.nearbyPrompt && (
        <div
          className="rpg-panel rpg-panel-gold"
          style={{
            position: 'absolute',
            bottom: 130,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 700,
            color: '#fde047',
          }}
        >
          {hud.nearbyPrompt.label}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="rpg-panel rpg-panel-gold"
          style={{
            position: 'absolute',
            top: 110,
            right: 20,
            padding: '8px 14px',
            fontSize: 12,
            color: '#fde047',
          }}
        >
          {toast}
        </div>
      )}

      {/* Bottom-Left: Chat Box (Vietnamese IME Safe) */}
      <div
        className="rpg-panel"
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          width: 300,
          padding: 6,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ height: 84, overflowY: 'auto', fontSize: 11, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {chatMessages.length === 0 && (
            <div style={{ color: '#9c8b70' }}>WASD di chuyển • Space/Click đánh • 1-3/Q kỹ năng • Shift né • F tương tác</div>
          )}
          {chatMessages.map((m) => (
            <div key={m.id} style={{ color: m.channel === 'SYSTEM' ? '#facc15' : '#f4e6c8' }}>
              <b style={{ color: m.channel === 'SYSTEM' ? '#fb923c' : '#7ce0c3' }}>[{m.senderName}]:</b> {m.message}
            </div>
          ))}
        </div>
        <form onSubmit={sendChat} style={{ display: 'flex', gap: 4 }}>
          <input
            className="rpg-input"
            style={{ flex: 1, padding: '4px 6px', fontSize: 11 }}
            placeholder="Chat tiếng Việt (IME-safe)..."
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onFocus={() => inputFocusManager.setChatFocused(true)}
            onBlur={() => inputFocusManager.setChatFocused(false)}
            onCompositionStart={() => inputFocusManager.setImeComposing(true)}
            onCompositionEnd={() => inputFocusManager.setImeComposing(false)}
          />
          <button type="submit" className="rpg-btn" style={{ padding: '4px 8px', fontSize: 11 }}>Gửi</button>
        </form>
      </div>

      {/* Bottom-Center: Skill Hotbar + Quick RPG Dock */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          pointerEvents: 'auto',
        }}
      >
        <div className="rpg-panel" style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
          <button
            className="rpg-btn"
            style={{ minWidth: 66 }}
            onClick={() => gameUiBridge.emit('client:triggerSkill', { action: 'BASIC_ATTACK' })}
          >
            [SPC] Đánh
          </button>
          {usableSkills.map((sk: any, idx: number) => {
            const keyLbl = idx === 3 ? 'Q' : String(idx + 1);
            const readyAt = skillCooldowns[sk.id] || 0;
            const remSec = Math.max(0, Math.ceil((readyAt - nowMs) / 1000));
            return (
              <button
                key={sk.id}
                className={`rpg-btn ${idx === 3 ? 'rpg-btn-primary' : ''}`}
                disabled={remSec > 0}
                style={{ minWidth: 96, position: 'relative' }}
                onClick={() => gameUiBridge.emit('client:triggerSkill', { action: 'SKILL', skillId: sk.id })}
                title={sk.descriptionVi}
              >
                [{keyLbl}] {sk.name.split(' ')[0]} {remSec > 0 ? `(${remSec}s)` : ''}
              </button>
            );
          })}
          <button className="rpg-btn" onClick={() => gameUiBridge.emit('client:triggerSkill', { action: 'DODGE' })}>
            [Shift] Né
          </button>
          <button className="rpg-btn" onClick={() => gameUiBridge.emit('client:triggerSkill', { action: 'BLOCK' })}>
            [E] Đỡ
          </button>
        </div>

        <div className="rpg-panel" style={{ padding: '4px 6px', display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 680 }}>
          {NAV_BUTTONS.map((b) => (
            <button
              key={b.id}
              className="rpg-btn"
              style={{ padding: '3px 7px', fontSize: 11 }}
              onClick={() => openModal(b.id)}
            >
              {b.label} <span style={{ color: '#e4b65d' }}>({b.keyHint})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
