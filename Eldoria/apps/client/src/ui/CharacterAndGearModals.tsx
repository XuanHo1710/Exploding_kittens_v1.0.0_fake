import React, { useState } from 'react';
import { EquipmentSlot } from '@eldoria/shared';
import { apiClient } from '../network/ApiClient';
import {
  useHudStore,
  useInventoryStore,
  useProgressionStore,
  useUiModalStore,
} from '../stores/gameStores';

const ALL_SLOTS: EquipmentSlot[] = [
  'MAIN_WEAPON', 'OFF_HAND', 'HELMET', 'CHEST', 'GLOVES',
  'BOOTS', 'RING_1', 'RING_2', 'NECKLACE', 'ACCESSORY',
];

interface Props {
  refreshBundle: () => Promise<void>;
}

export const CharacterAndGearModals: React.FC<Props> = ({ refreshBundle }) => {
  const activeModal = useUiModalStore((s) => s.activeModal);
  const closeTopModal = useUiModalStore((s) => s.closeTopModal);
  const openModal = useUiModalStore((s) => s.openModal);
  const showToast = useHudStore((s) => s.showToast);

  const inventory = useInventoryStore((s) => s.inventory);
  const catalog = useInventoryStore((s) => s.catalog);
  const character = useProgressionStore((s) => s.character);
  const computedStats = useProgressionStore((s) => s.computedStats);
  const activeSkills = useProgressionStore((s) => s.activeSkills);

  const [alloc, setAlloc] = useState({ str: 0, agi: 0, int: 0, vit: 0, dex: 0, luk: 0 });
  const [filter, setFilter] = useState<'ALL' | 'WEAPON' | 'EQUIPMENT' | 'MATERIAL' | 'CONSUMABLE' | 'SEED'>('ALL');

  if (!character || !activeModal) return null;
  if (!['INVENTORY', 'EQUIPMENT', 'STATS', 'SKILL_TREE', 'HERO_COLLECTION'].includes(activeModal)) return null;

  const itemById = new Map<string, any>((catalog?.items || []).map((i: any) => [i.id, i]));
  const equippedIds = new Set(Object.values(character.equippedSlots || {}));

  const runAction = async (fn: () => Promise<void>, okMsg: string) => {
    try {
      await fn();
      await refreshBundle();
      showToast(okMsg);
    } catch (err: any) {
      showToast(`Lỗi: ${err.message}`);
    }
  };

  return (
    <div className="rpg-modal-backdrop" onClick={closeTopModal}>
      <div className="rpg-panel rpg-panel-gold rpg-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="rpg-modal-header">
          <div style={{ fontWeight: 700, fontSize: 16, color: '#e4b65d' }}>
            {activeModal === 'INVENTORY' && `Túi Đồ (${inventory?.bagItems?.length || 0}/${inventory?.bagCapacity || 40}) — SCR-06`}
            {activeModal === 'EQUIPMENT' && 'Trang Bị & Set Bonus (10 Ô) — SCR-07'}
            {activeModal === 'STATS' && `Chỉ Số Nhân Vật & Phân Bổ Điểm — SCR-08`}
            {activeModal === 'SKILL_TREE' && `Cây Kỹ Năng (${character.unspentSkillPoints} điểm) — SCR-09`}
            {activeModal === 'HERO_COLLECTION' && `Bộ Sưu Tập Anh Hùng (${character.unlockedHeroes?.length || 1}/12) — SCR-10`}
          </div>
          <button className="rpg-btn" onClick={closeTopModal}>✕ Đóng (ESC)</button>
        </div>

        <div className="rpg-modal-body">
          {/* SCR-06: Inventory */}
          {activeModal === 'INVENTORY' && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {(['ALL', 'WEAPON', 'EQUIPMENT', 'MATERIAL', 'CONSUMABLE', 'SEED'] as const).map((f) => (
                  <button
                    key={f}
                    className={`rpg-btn ${filter === f ? 'rpg-btn-primary' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {(inventory?.bagItems || [])
                  .filter((it: any) => filter === 'ALL' || itemById.get(it.itemId)?.category === filter)
                  .map((it: any) => {
                    const tmpl = itemById.get(it.itemId);
                    const isEq = equippedIds.has(it.instanceId);
                    return (
                      <div key={it.instanceId} className={`rpg-card rarity-${tmpl?.rarity || 'COMMON'}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                          <span>
                            {tmpl?.name || it.itemId} {it.enhancementLevel > 0 ? `+${it.enhancementLevel}` : ''}
                          </span>
                          <span>x{it.quantity}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#c2b092', margin: '4px 0' }}>
                          {tmpl?.category || 'ITEM'} • {tmpl?.rarity || 'COMMON'} {isEq ? '• [ĐANG MẶC]' : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          {(tmpl?.category === 'WEAPON' || tmpl?.category === 'EQUIPMENT') && !isEq && (
                            <button
                              className="rpg-btn rpg-btn-primary"
                              style={{ fontSize: 11 }}
                              onClick={() =>
                                void runAction(
                                  () => apiClient.request('POST', `/api/v1/characters/${character.id}/inventory/equip`, { itemInstanceId: it.instanceId }),
                                  `Đã trang bị ${tmpl.name}`,
                                )
                              }
                            >
                              Trang Bị
                            </button>
                          )}
                          {(tmpl?.category === 'CONSUMABLE' || tmpl?.category === 'FOOD') && (
                            <button
                              className="rpg-btn rpg-btn-emerald"
                              style={{ fontSize: 11 }}
                              onClick={() =>
                                void runAction(
                                  () => apiClient.request('POST', `/api/v1/characters/${character.id}/inventory/use`, { itemInstanceId: it.instanceId }),
                                  `Đã dùng ${tmpl.name}`,
                                )
                              }
                            >
                              Sử Dụng
                            </button>
                          )}
                          {tmpl?.category === 'WEAPON' && (
                            <button className="rpg-btn" style={{ fontSize: 11 }} onClick={() => openModal('ENHANCEMENT')}>
                              Cường Hóa
                            </button>
                          )}
                          {!isEq && (tmpl?.category === 'WEAPON' || tmpl?.category === 'EQUIPMENT') && (
                            <button
                              className="rpg-btn rpg-btn-danger"
                              style={{ fontSize: 11 }}
                              onClick={() =>
                                void runAction(
                                  () => apiClient.request('POST', `/api/v1/characters/${character.id}/inventory/dismantle`, { itemInstanceId: it.instanceId }),
                                  `Đã phân rã ${tmpl.name}`,
                                )
                              }
                            >
                              Phân Rã
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}

          {/* SCR-07: Equipment (10 Slots + Set Bonus) */}
          {activeModal === 'EQUIPMENT' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {ALL_SLOTS.map((slot) => {
                const instId = character.equippedSlots?.[slot];
                const inst = (inventory?.bagItems || []).find((i: any) => i.instanceId === instId);
                const tmpl = inst ? itemById.get(inst.itemId) : null;
                return (
                  <div key={slot} className="rpg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#e4b65d' }}>{slot}</div>
                      <div style={{ fontWeight: 700 }}>
                        {tmpl ? `${tmpl.name}${inst.enhancementLevel > 0 ? ` +${inst.enhancementLevel}` : ''}` : '— Trống —'}
                      </div>
                    </div>
                    {inst && (
                      <button
                        className="rpg-btn"
                        style={{ fontSize: 11 }}
                        onClick={() =>
                          void runAction(
                            () => apiClient.request('POST', `/api/v1/characters/${character.id}/inventory/unequip`, { slot }),
                            `Đã tháo ${tmpl?.name}`,
                          )
                        }
                      >
                        Tháo
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* SCR-08: Character Stats & Allocation */}
          {activeModal === 'STATS' && computedStats && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="rpg-card">
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Chỉ Số Chiến Đấu (CR: {computedStats.combatRating})</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13 }}>
                  <div>HP: <b>{computedStats.hp}</b></div>
                  <div>MP: <b>{computedStats.mp}</b></div>
                  <div>Stamina: <b>{computedStats.stamina}</b></div>
                  <div>ATK: <b>{computedStats.atk}</b></div>
                  <div>DEF: <b>{computedStats.def}</b></div>
                  <div>Crit Rate: <b>{(computedStats.critRate * 100).toFixed(1)}%</b></div>
                  <div>Crit DMG: <b>{(computedStats.critDamage * 100).toFixed(0)}%</b></div>
                  <div>ATK Speed: <b>{computedStats.attackSpeed}x</b></div>
                  <div>Move Speed: <b>{computedStats.moveSpeed} px/s</b></div>
                  <div>CDR: <b>{(computedStats.cdr * 100).toFixed(1)}%</b></div>
                </div>
              </div>
              <div className="rpg-card">
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>
                  Thuộc Tính Gốc (Điểm dư: {character.unspentStatPoints - Object.values(alloc).reduce((a, b) => a + b, 0)})
                </h3>
                {(['str', 'agi', 'int', 'vit', 'dex', 'luk'] as const).map((k) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ textTransform: 'uppercase' }}>
                      {k}: <b>{computedStats[k]}</b> {alloc[k] > 0 ? <span style={{ color: '#45c470' }}>(+{alloc[k]})</span> : null}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="rpg-btn"
                        disabled={alloc[k] <= 0}
                        onClick={() => setAlloc((a) => ({ ...a, [k]: Math.max(0, a[k] - 1) }))}
                      >
                        -
                      </button>
                      <button
                        className="rpg-btn"
                        disabled={Object.values(alloc).reduce((x, y) => x + y, 0) >= character.unspentStatPoints}
                        onClick={() => setAlloc((a) => ({ ...a, [k]: a[k] + 1 }))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="rpg-btn rpg-btn-primary"
                  style={{ width: '100%', marginTop: 8 }}
                  disabled={Object.values(alloc).reduce((x, y) => x + y, 0) === 0}
                  onClick={() =>
                    void runAction(async () => {
                      await apiClient.request('POST', `/api/v1/characters/${character.id}/stats/allocate`, alloc);
                      setAlloc({ str: 0, agi: 0, int: 0, vit: 0, dex: 0, luk: 0 });
                    }, 'Đã cộng điểm thuộc tính!')
                  }
                >
                  Xác Nhận Cộng Điểm
                </button>
              </div>
            </div>
          )}

          {/* SCR-09: Skill Tree */}
          {activeModal === 'SKILL_TREE' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr' }}>
              {activeSkills.map((sk: any) => {
                const rank = character.skillRanks?.[sk.id] || 1;
                const maxRank = sk.maxRank || 5;
                return (
                  <div key={sk.id} className="rpg-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#e4b65d' }}>
                        [{sk.skillType}] {sk.name} — Cấp {rank}/{maxRank}
                      </div>
                      <div style={{ fontSize: 12, color: '#f4e6c8', marginTop: 4 }}>{sk.descriptionVi}</div>
                      <div style={{ fontSize: 11, color: '#c2b092', marginTop: 4 }}>
                        MP: {sk.manaCost || 0} • CD: {((sk.cooldownMs || 0) / 1000).toFixed(1)}s • Scale: {sk.scalingRatio}x {sk.scalingStat}
                      </div>
                    </div>
                    <button
                      className="rpg-btn rpg-btn-primary"
                      disabled={character.unspentSkillPoints < 1 || rank >= maxRank}
                      onClick={() =>
                        void runAction(
                          () => apiClient.request('POST', `/api/v1/characters/${character.id}/skills/upgrade`, { skillId: sk.id }),
                          `Nâng cấp ${sk.name} lên Lv.${rank + 1}`,
                        )
                      }
                    >
                      Nâng Cấp
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* SCR-10: Character Collection (All 12 Heroes) */}
          {activeModal === 'HERO_COLLECTION' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {(catalog?.characters || []).map((hero: any) => {
                const unlocked = (character.unlockedHeroes || []).find((u: any) => u.heroId === hero.id);
                const isActive = character.activeHeroId === hero.id;
                return (
                  <div key={hero.id} className={`rpg-card rarity-${hero.rarity}`} style={{ opacity: unlocked ? 1 : 0.58 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <img
                        className="pixel-art"
                        src={`/assets/v1/ui/portraits/${hero.id}.png`}
                        alt={hero.name}
                        style={{ width: 52, height: 52, border: '2px solid #a8763e' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>{hero.name}</div>
                        <div style={{ fontSize: 11, color: '#c2b092' }}>{hero.class} • {hero.element} • {hero.rarity}</div>
                        {unlocked && <div style={{ fontSize: 11, color: '#45c470' }}>Mở khóa • C{unlocked.constellationLevel}</div>}
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {isActive ? (
                        <span className="rpg-tag" style={{ color: '#e4b65d' }}>ĐANG XUẤT TRẬN</span>
                      ) : unlocked ? (
                        <button
                          className="rpg-btn rpg-btn-primary"
                          style={{ width: '100%' }}
                          onClick={() =>
                            void runAction(
                              () => apiClient.request('POST', `/api/v1/characters/${character.id}/hero/switch`, { heroId: hero.id }),
                              `Đã chuyển sang ${hero.name}!`,
                            )
                          }
                        >
                          Chuyển Anh Hùng
                        </button>
                      ) : (
                        <span className="rpg-tag">Chưa mở khóa (Quay Gacha / Shop)</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
