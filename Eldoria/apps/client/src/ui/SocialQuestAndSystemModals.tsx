import React, { useState } from 'react';
import { UiPreferences } from '@eldoria/shared';
import { gameUiBridge } from '../bridge/GameUiBridge';
import { apiClient } from '../network/ApiClient';
import {
  useAuthStore,
  useHudStore,
  useInventoryStore,
  useProgressionStore,
  useSocialStore,
  useUiModalStore,
} from '../stores/gameStores';

interface Props {
  refreshBundle: () => Promise<void>;
}

export const SocialQuestAndSystemModals: React.FC<Props> = ({ refreshBundle }) => {
  const activeModal = useUiModalStore((s) => s.activeModal);
  const closeTopModal = useUiModalStore((s) => s.closeTopModal);
  const openModal = useUiModalStore((s) => s.openModal);
  const showToast = useHudStore((s) => s.showToast);

  const character = useProgressionStore((s) => s.character);
  const lastBossReward = useProgressionStore((s) => s.lastBossReward);
  const catalog = useInventoryStore((s) => s.catalog);
  const social = useSocialStore((s) => s.social);
  const party = useSocialStore((s) => s.party);
  const setParty = useSocialStore((s) => s.setParty);
  const npcDialogue = useSocialStore((s) => s.activeNpcDialogue);
  const preferences = useAuthStore((s) => s.preferences);
  const setPreferences = useAuthStore((s) => s.setPreferences);

  const [targetCharId, setTargetCharId] = useState('');
  const [inviteIdInput, setInviteIdInput] = useState('');

  if (!character || !activeModal) return null;
  if (!['QUESTS', 'NPC_DIALOGUE', 'PARTY', 'BOSS_REWARD', 'SETTINGS', 'DEATH_RESPAWN'].includes(activeModal)) return null;

  const questById = new Map<string, any>((catalog?.quests || []).map((q: any) => [q.id, q]));

  const runAction = async (fn: () => Promise<any>, okMsg: string) => {
    try {
      const res = await fn();
      await refreshBundle();
      showToast(okMsg);
      return res;
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`);
      return null;
    }
  };

  const savePrefs = async (patch: Partial<UiPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      await apiClient.request('PUT', '/api/v1/account/preferences', next);
      showToast('Đã lưu cài đặt vào JSON DB!');
    } catch (err: any) {
      showToast(`Lỗi lưu cài đặt: ${err.message}`);
    }
  };

  return (
    <div className="rpg-modal-backdrop" onClick={activeModal === 'DEATH_RESPAWN' ? undefined : closeTopModal}>
      <div className="rpg-panel rpg-panel-gold rpg-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="rpg-modal-header">
          <div style={{ fontWeight: 700, fontSize: 16, color: '#e4b65d' }}>
            {activeModal === 'QUESTS' && 'Nhật Ký Nhiệm Vụ (12 Nhiệm Vụ MVP) — SCR-19'}
            {activeModal === 'NPC_DIALOGUE' && `${npcDialogue?.name || 'NPC'} — SCR-20`}
            {activeModal === 'PARTY' && 'Tổ Đội & Bạn Bè (Co-op 1-4 Người) — SCR-21'}
            {activeModal === 'BOSS_REWARD' && 'CHIẾN THẮNG BOSS THORNBACK ELDER! — SCR-22'}
            {activeModal === 'SETTINGS' && 'Cài Đặt & Trợ Năng (Accessibility) — SCR-23'}
            {activeModal === 'DEATH_RESPAWN' && 'NHÂN VẬT ĐÃ GỤC NGÃ — SCR-24'}
          </div>
          {activeModal !== 'DEATH_RESPAWN' && (
            <button className="rpg-btn" onClick={closeTopModal}>✕ Đóng (ESC)</button>
          )}
        </div>

        <div className="rpg-modal-body">
          {/* SCR-19: Quest Journal */}
          {activeModal === 'QUESTS' && (
            <div className="rpg-grid">
              {(character.quests || []).map((q: any) => {
                const tmpl = questById.get(q.questId);
                return (
                  <div key={q.questId} className="rpg-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#e4b65d' }}>
                        {tmpl?.titleVi || q.questId} <span className="rpg-tag">{q.status}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#c2b092', margin: '4px 0' }}>{tmpl?.summaryVi}</div>
                      <div style={{ fontSize: 11, color: '#86efac' }}>
                        Thưởng: {tmpl?.rewards?.gold || 0} Gold • {tmpl?.rewards?.starlightShard || 0} Starlight Shards • {tmpl?.rewards?.exp || 0} EXP
                      </div>
                    </div>
                    <div>
                      {q.status === 'AVAILABLE' && (
                        <button
                          className="rpg-btn rpg-btn-primary"
                          onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/quests/${q.questId}/accept`), 'Đã nhận nhiệm vụ!')}
                        >
                          Nhận
                        </button>
                      )}
                      {q.status === 'COMPLETED' && (
                        <button
                          className="rpg-btn rpg-btn-emerald"
                          onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/quests/${q.questId}/claim`), 'Đã nhận thưởng nhiệm vụ!')}
                        >
                          Nhận Thưởng!
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SCR-20: NPC Dialogue */}
          {activeModal === 'NPC_DIALOGUE' && (
            <div className="rpg-card">
              <div style={{ fontSize: 12, color: '#e4b65d', marginBottom: 4 }}>{npcDialogue?.roleVi}</div>
              <p style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>{npcDialogue?.greetingVi}</p>
              <ul style={{ fontSize: 12, color: '#c2b092' }}>
                {(npcDialogue?.tipsVi || []).map((t: string, i: number) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="rpg-btn rpg-btn-primary" onClick={() => openModal('QUESTS')}>Mở Nhiệm Vụ</button>
                <button className="rpg-btn" onClick={() => openModal('BLACKSMITH')}>Mở Lò Rèn</button>
                <button className="rpg-btn rpg-btn-emerald" onClick={() => openModal('FARMING')}>Mở Nông Trại</button>
              </div>
            </div>
          )}

          {/* SCR-21: Party & Social */}
          {activeModal === 'PARTY' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="rpg-card">
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Tổ Đội Hiện Tại (1–4)</h3>
                <div style={{ fontSize: 11, color: '#c2b092', marginBottom: 8 }}>Mã nhân vật của bạn: <b>{character.id}</b></div>
                {!party ? (
                  <button
                    className="rpg-btn rpg-btn-primary"
                    onClick={async () => {
                      const p = await runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/party/create`), 'Đã lập Tổ Đội!');
                      if (p) setParty(p);
                    }}
                  >
                    Tạo Tổ Đội Mới
                  </button>
                ) : (
                  <>
                    {party.members.map((m: any) => (
                      <div key={m.characterId} style={{ padding: '4px 0', fontSize: 12 }}>
                        • <b>{m.name}</b> (Lv.{m.level}) {m.characterId === party.leaderId ? '👑' : ''} — {m.ready ? '✅ Sẵn Sàng' : '⏳ Chờ'}
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        className="rpg-btn rpg-btn-emerald"
                        onClick={async () => {
                          const p = await runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/party/ready`), 'Đã đổi trạng thái Sẵn Sàng!');
                          if (p) setParty(p);
                        }}
                      >
                        Sẵn Sàng
                      </button>
                      <button
                        className="rpg-btn rpg-btn-danger"
                        onClick={async () => {
                          await runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/party/leave`), 'Đã rời Tổ Đội');
                          setParty(null);
                        }}
                      >
                        Rời Đội
                      </button>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <input className="rpg-input" style={{ flex: 1 }} placeholder="Nhập inviteId để vào đội..." value={inviteIdInput} onChange={(e) => setInviteIdInput(e.target.value)} />
                  <button
                    className="rpg-btn"
                    onClick={async () => {
                      const p = await runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/party/accept`, { inviteId: inviteIdInput }), 'Đã gia nhập Tổ Đội!');
                      if (p) setParty(p);
                    }}
                  >
                    Vào Đội
                  </button>
                </div>
              </div>

              <div className="rpg-card">
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Bạn Bè & Chặn</h3>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input className="rpg-input" style={{ flex: 1 }} placeholder="Character ID người chơi..." value={targetCharId} onChange={(e) => setTargetCharId(e.target.value)} />
                  <button
                    className="rpg-btn rpg-btn-primary"
                    onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/social/add_friend`, { targetCharacterId: targetCharId }), 'Đã thêm bạn!')}
                  >
                    Kết Bạn
                  </button>
                  <button
                    className="rpg-btn rpg-btn-danger"
                    onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/social/block`, { targetCharacterId: targetCharId }), 'Đã chặn người chơi')}
                  >
                    Chặn
                  </button>
                </div>
                <div style={{ fontSize: 12 }}>Bạn bè ({social?.friendIds?.length || 0}): {(social?.friendIds || []).join(', ') || 'Chưa có'}</div>
                <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>Đã chặn ({social?.blockedIds?.length || 0}): {(social?.blockedIds || []).join(', ') || 'Không có'}</div>
              </div>
            </div>
          )}

          {/* SCR-22: Boss Victory Reward */}
          {activeModal === 'BOSS_REWARD' && (
            <div className="rpg-card" style={{ textAlign: 'center', padding: 20 }}>
              <h2 style={{ color: '#facc15', marginTop: 0 }}>★ {lastBossReward?.bossName || 'Thornback Elder'} Đã Bị Hạ Gục! ★</h2>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', margin: '16px 0' }}>
                <span className="rpg-tag" style={{ color: '#e4b65d' }}>+{lastBossReward?.rewards?.gold || 420} Gold</span>
                <span className="rpg-tag" style={{ color: '#38bdf8' }}>+{lastBossReward?.rewards?.starlightShard || 320} Starlight Shards</span>
                <span className="rpg-tag" style={{ color: '#c084fc' }}>+{lastBossReward?.rewards?.bossToken || 5} Boss Tokens</span>
                <span className="rpg-tag" style={{ color: '#45c470' }}>+{lastBossReward?.rewards?.exp || 480} EXP</span>
                <span className="rpg-tag rarity-EPIC">Thorn Heartwood x3 (Personal Loot)</span>
              </div>
              <button className="rpg-btn rpg-btn-primary" onClick={closeTopModal}>Tuyệt Vời!</button>
            </div>
          )}

          {/* SCR-23: Settings & Accessibility */}
          {activeModal === 'SETTINGS' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="rpg-card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Rung Camera (Camera Shake)</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([0, 50, 100] as const).map((pct) => (
                    <button key={pct} className={`rpg-btn ${preferences.cameraShakePct === pct ? 'rpg-btn-primary' : ''}`} onClick={() => void savePrefs({ cameraShakePct: pct })}>
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="rpg-card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Độ Mờ VFX Đồng Đội</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([25, 50, 70, 100] as const).map((pct) => (
                    <button key={pct} className={`rpg-btn ${preferences.allyVfxOpacityPct === pct ? 'rpg-btn-primary' : ''}`} onClick={() => void savePrefs({ allyVfxOpacityPct: pct })}>
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="rpg-card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Tỉ Lệ Giao Diện (UI Scale)</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([100, 115, 130] as const).map((pct) => (
                    <button key={pct} className={`rpg-btn ${preferences.uiScalePct === pct ? 'rpg-btn-primary' : ''}`} onClick={() => void savePrefs({ uiScalePct: pct })}>
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="rpg-card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Trợ Năng Photosensitivity</div>
                <button
                  className={`rpg-btn ${preferences.reducedFlashing ? 'rpg-btn-emerald' : ''}`}
                  onClick={() => void savePrefs({ reducedFlashing: !preferences.reducedFlashing })}
                >
                  Giảm Nhấp Nháy (Reduced Flashing): {preferences.reducedFlashing ? 'BẬT' : 'TẮT'}
                </button>
              </div>
            </div>
          )}

          {/* SCR-24: Death & Respawn */}
          {activeModal === 'DEATH_RESPAWN' && (
            <div className="rpg-card" style={{ textAlign: 'center', padding: 24 }}>
              <h2 style={{ color: '#ff6b6b', marginTop: 0 }}>Bạn Đã Gục Ngã Trong Chiến Đấu</h2>
              <p style={{ fontSize: 13, color: '#c2b092' }}>
                Không mất trang bị hay kinh nghiệm. Hồi sinh an toàn tại Greenhaven Village với 100% HP/MP!
              </p>
              <button
                className="rpg-btn rpg-btn-primary"
                style={{ padding: '10px 24px', fontSize: 15 }}
                onClick={() => {
                  gameUiBridge.emit('client:respawn', {});
                  closeTopModal();
                }}
              >
                Hồi Sinh Tại Greenhaven Village
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
