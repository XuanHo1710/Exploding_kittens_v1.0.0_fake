import React, { useState } from 'react';
import { gameUiBridge } from '../bridge/GameUiBridge';
import { apiClient } from '../network/ApiClient';
import {
  useHomesteadStore,
  useHudStore,
  useInventoryStore,
  useProgressionStore,
  useUiModalStore,
} from '../stores/gameStores';

const WORLD_REGIONS = [
  { id: 'reg_greenhaven_village', name: 'Greenhaven Village', lv: 'Lv 1-5', unlocked: true, desc: 'Làng khởi đầu, nông trại, lò rèn Garrik và vùng an toàn.' },
  { id: 'reg_whispering_forest', name: 'Whispering Forest', lv: 'Lv 5-15', unlocked: true, desc: 'Rừng rậm 8 loài quái vật + Alpha Direwolf & cổng hầm ngục.' },
  { id: 'dng_mossroot_hollow', name: 'Mossroot Hollow (Boss #1)', lv: 'Lv 15 Boss', unlocked: true, desc: 'Đấu trường 3 Phase của Boss Thornback Elder (điểm yếu FIRE).' },
  { id: 'dng_ironmaw_foundry', name: 'Ironpeak Foundry (Boss #2)', lv: 'Lv 25 Boss', unlocked: true, desc: 'Đấu trường lò luyện của Boss Ignis Forgelord (128×128, điểm yếu WATER/FROST)!' },
  { id: 'reg_crystal_caverns', name: 'Crystal Caverns', lv: 'Lv 31-45', unlocked: false, desc: 'Roadmap mở rộng — Hang tinh thể ánh sáng.' },
  { id: 'reg_forgotten_ruins', name: 'Forgotten Ruins', lv: 'Lv 46-60', unlocked: false, desc: 'Roadmap mở rộng — Phế tích đế chế cổ đại.' },
  { id: 'reg_frostbound_highlands', name: 'Frostbound Highlands', lv: 'Lv 61-75', unlocked: false, desc: 'Roadmap mở rộng — Cao nguyên băng giá.' },
  { id: 'reg_abyssal_kingdom', name: 'Abyssal Kingdom', lv: 'Lv 85-100', unlocked: false, desc: 'Roadmap Endgame — Vương quốc vực thẳm.' },
];

interface Props {
  refreshBundle: () => Promise<void>;
}

export const ForgeGachaAndWorldModals: React.FC<Props> = ({ refreshBundle }) => {
  const activeModal = useUiModalStore((s) => s.activeModal);
  const closeTopModal = useUiModalStore((s) => s.closeTopModal);
  const openModal = useUiModalStore((s) => s.openModal);
  const showToast = useHudStore((s) => s.showToast);

  const character = useProgressionStore((s) => s.character);
  const gachaCatalog = useProgressionStore((s) => s.gachaCatalog);
  const inventory = useInventoryStore((s) => s.inventory);
  const catalog = useInventoryStore((s) => s.catalog);
  const enhancementTable = useInventoryStore((s) => s.enhancementTable);
  const homestead = useHomesteadStore((s) => s.homestead);
  const setPlacingBuildingId = useHomesteadStore((s) => s.setPlacingBuildingId);

  const [selectedBannerId, setSelectedBannerId] = useState('bnr_perm_heroes');
  const [lastPullResults, setLastPullResults] = useState<any[] | null>(null);
  const [selectedCrop, setSelectedCrop] = useState('crp_sunwheat');

  if (!character || !activeModal) return null;
  if (!['GACHA', 'BLACKSMITH', 'ENHANCEMENT', 'CRAFTING', 'BUILDING', 'FARMING', 'WORLD_MAP'].includes(activeModal)) return null;

  const itemById = new Map<string, any>((catalog?.items || []).map((i: any) => [i.id, i]));
  const countInBag = (itemId: string) =>
    (inventory?.bagItems || []).filter((i: any) => i.itemId === itemId).reduce((s: number, i: any) => s + i.quantity, 0);

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

  const weaponsInBag = (inventory?.bagItems || []).filter((i: any) => itemById.get(i.itemId)?.category === 'WEAPON');
  const mvpBanners = (gachaCatalog?.banners || []).filter((b: any) => b.active);
  const currentBanner = mvpBanners.find((b: any) => b.id === selectedBannerId) || mvpBanners[0];

  return (
    <div className="rpg-modal-backdrop" onClick={closeTopModal}>
      <div className="rpg-panel rpg-panel-gold rpg-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="rpg-modal-header">
          <div style={{ fontWeight: 700, fontSize: 16, color: '#e4b65d' }}>
            {activeModal === 'GACHA' && 'Hiệu Triệu Công Bằng (100% Gameplay Currency) — SCR-11'}
            {activeModal === 'BLACKSMITH' && 'Lò Rèn Garrik — SCR-12'}
            {activeModal === 'ENHANCEMENT' && 'Cường Hóa Vũ Khí +0 → +10 (100% Chắc Chắn, Không Gãy) — SCR-13'}
            {activeModal === 'CRAFTING' && 'Chế Tạo & Luyện Kim (22 Công Thức MVP) — SCR-14'}
            {activeModal === 'BUILDING' && 'Xây Dựng Lãnh Địa (Homestead) — SCR-15'}
            {activeModal === 'FARMING' && 'Nông Trại & Chăn Nuôi (Server-Time) — SCR-16'}
            {activeModal === 'WORLD_MAP' && 'Bản Đồ Thế Giới Eldoria & Dịch Chuyển Nhanh — SCR-17'}
          </div>
          <button className="rpg-btn" onClick={closeTopModal}>✕ Đóng (ESC)</button>
        </div>

        <div className="rpg-modal-body">
          {/* SCR-11: Fair Gacha */}
          {activeModal === 'GACHA' && currentBanner && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  {mvpBanners.map((b: any) => (
                    <button
                      key={b.id}
                      className={`rpg-btn ${b.id === currentBanner.id ? 'rpg-btn-primary' : ''}`}
                      onClick={() => setSelectedBannerId(b.id)}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: '#e4b65d' }}>
                  Starlight Shards: <b>{character.wallet.starlightShard}</b> • Star Essence: <b>{character.wallet.starEssence}</b>
                </div>
              </div>

              <div className="rpg-card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#f4e6c8' }}>{currentBanner.titleVi || currentBanner.name}</div>
                <div style={{ fontSize: 12, color: '#c2b092', margin: '6px 0' }}>{currentBanner.descriptionVi}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, marginBottom: 10 }}>
                  <span className="rpg-tag rarity-MYTHIC">MYTHIC: {(currentBanner.baseRates.MYTHIC * 100).toFixed(2)}%</span>
                  <span className="rpg-tag rarity-LEGENDARY">LEGENDARY: {(currentBanner.baseRates.LEGENDARY * 100).toFixed(2)}%</span>
                  <span className="rpg-tag rarity-EPIC">EPIC: {(currentBanner.baseRates.EPIC * 100).toFixed(2)}%</span>
                  <span className="rpg-tag rarity-RARE">RARE: {(currentBanner.baseRates.RARE * 100).toFixed(1)}%</span>
                  <span className="rpg-tag">
                    Pity: {character.pityByGroup?.[currentBanner.sharedPityGroup]?.pullsSinceHighRarity || 0}/{currentBanner.pity.hardPity} (Soft {currentBanner.pity.softPityStart})
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="rpg-btn rpg-btn-primary"
                    disabled={character.wallet.starlightShard < currentBanner.cost.singlePull}
                    onClick={async () => {
                      const res = await runAction(
                        () => apiClient.request('POST', `/api/v1/characters/${character.id}/gacha/pull`, { bannerId: currentBanner.id, count: 1 }, { idempotent: true }),
                        'Hiệu triệu x1 thành công!',
                      );
                      if (res?.results) setLastPullResults(res.results);
                    }}
                  >
                    Hiệu Triệu x1 ({currentBanner.cost.singlePull} Shards)
                  </button>
                  <button
                    className="rpg-btn rpg-btn-emerald"
                    disabled={character.wallet.starlightShard < currentBanner.cost.tenPull}
                    onClick={async () => {
                      const res = await runAction(
                        () => apiClient.request('POST', `/api/v1/characters/${character.id}/gacha/pull`, { bannerId: currentBanner.id, count: 10 }, { idempotent: true }),
                        'Hiệu triệu x10 (Đảm bảo Epic+) thành công!',
                      );
                      if (res?.results) setLastPullResults(res.results);
                    }}
                  >
                    Hiệu Triệu x10 ({currentBanner.cost.tenPull} Shards — Đảm Bảo Epic+)
                  </button>
                </div>
              </div>

              {lastPullResults && (
                <div className="rpg-card" style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: '#e4b65d', marginBottom: 8 }}>Kết Quả Hiệu Triệu Vừa Rồi:</div>
                  <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                    {lastPullResults.map((r) => (
                      <div key={r.pullId} className={`rpg-card rarity-${r.rarity}`}>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{r.rarity}</div>
                        <div style={{ fontSize: 12 }}>{r.rewardId}</div>
                        {r.isDuplicate && <div style={{ fontSize: 10, color: '#fde047' }}>Trùng → +{r.starEssenceGranted} Essence</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rpg-card">
                <div style={{ fontWeight: 700, color: '#e4b65d', marginBottom: 6 }}>Cửa Hàng Đổi Tinh Hoa Ánh Sao (Chống Xui Xẻo)</div>
                <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {(gachaCatalog?.starEssenceShop || []).slice(0, 6).map((offer: any) => (
                    <div key={offer.offerId} className="rpg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{offer.rewardId}</div>
                        <div style={{ fontSize: 11, color: '#e4b65d' }}>{offer.costStarEssence} Star Essence</div>
                      </div>
                      <button
                        className="rpg-btn"
                        disabled={character.wallet.starEssence < offer.costStarEssence}
                        onClick={() =>
                          void runAction(
                            () => apiClient.request('POST', `/api/v1/characters/${character.id}/gacha/exchange`, { offerId: offer.offerId }),
                            `Đã đổi ${offer.rewardId}!`,
                          )
                        }
                      >
                        Đổi
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* SCR-12: Blacksmith Hub */}
          {activeModal === 'BLACKSMITH' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="rpg-card">
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Cường Hóa Vũ Khí (+0 → +10)</h3>
                <p style={{ fontSize: 12, color: '#c2b092' }}>
                  100% thành công khi đủ nguyên liệu & vàng. Không bao giờ rớt cấp hay vỡ vũ khí trong MVP.
                </p>
                <button className="rpg-btn rpg-btn-primary" onClick={() => openModal('ENHANCEMENT')}>
                  Mở Bàn Cường Hóa →
                </button>
              </div>
              <div className="rpg-card">
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Nung Quặng & Rèn Vũ Khí</h3>
                <p style={{ fontSize: 12, color: '#c2b092' }}>
                  Luyện Copper/Iron Ingot và chế tạo trang bị từ nguyên liệu thu thập ngoài thế giới.
                </p>
                <button className="rpg-btn rpg-btn-emerald" onClick={() => openModal('CRAFTING')}>
                  Mở Lò Rèn & Chế Tạo →
                </button>
              </div>
            </div>
          )}

          {/* SCR-13: Weapon Enhancement (+0..+10) */}
          {activeModal === 'ENHANCEMENT' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr' }}>
              {weaponsInBag.map((wpn: any) => {
                const tmpl = itemById.get(wpn.itemId);
                const nextTier = enhancementTable[wpn.enhancementLevel];
                return (
                  <div key={wpn.instanceId} className="rpg-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#e4b65d' }}>
                          {tmpl?.name || wpn.itemId} <span style={{ color: '#45c470' }}>+{wpn.enhancementLevel}</span> / +10
                        </div>
                        {nextTier ? (
                          <div style={{ fontSize: 12, color: '#c2b092', marginTop: 4 }}>
                            Lên +{nextTier.toLevel}: <b>{nextTier.goldCost} Gold</b> (Blacksmith Lv.{nextTier.requiredBlacksmithLevel}) • Nguyên liệu:{' '}
                            {nextTier.materials.map((m: any) => `${m.itemId} (${countInBag(m.itemId)}/${m.qty})`).join(', ')}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#facc15' }}>Đã đạt mốc tối đa +10 Huyền Thoại!</div>
                        )}
                      </div>
                      {nextTier && (
                        <button
                          className="rpg-btn rpg-btn-primary"
                          onClick={() =>
                            void runAction(
                              () => apiClient.request('POST', `/api/v1/characters/${character.id}/enhancement/upgrade`, { itemInstanceId: wpn.instanceId }, { idempotent: true }),
                              `Cường hóa thành công ${tmpl?.name} lên +${nextTier.toLevel}!`,
                            )
                          }
                        >
                          Cường Hóa +{nextTier.toLevel} (100%)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* SCR-14: Crafting */}
          {activeModal === 'CRAFTING' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {(catalog?.recipes || []).filter((r: any) => r.mvp).map((r: any) => (
                <div key={r.id} className="rpg-card">
                  <div style={{ fontWeight: 700, color: '#e4b65d' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#c2b092', margin: '4px 0' }}>
                    {r.category} • {r.goldCost} Gold → {r.outputItemId} x{r.outputQty}
                  </div>
                  <div style={{ fontSize: 11, marginBottom: 8 }}>
                    {(r.ingredients || []).map((ing: any) => (
                      <div key={ing.itemId} style={{ color: countInBag(ing.itemId) >= ing.qty ? '#86efac' : '#fca5a5' }}>
                        • {ing.itemId}: {countInBag(ing.itemId)}/{ing.qty}
                      </div>
                    ))}
                  </div>
                  <button
                    className="rpg-btn rpg-btn-primary"
                    style={{ width: '100%' }}
                    onClick={() =>
                      void runAction(
                        () => apiClient.request('POST', `/api/v1/characters/${character.id}/crafting/craft`, { recipeId: r.id }, { idempotent: true }),
                        `Chế tạo thành công ${r.name}!`,
                      )
                    }
                  >
                    Chế Tạo
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* SCR-15: Building & Housing */}
          {activeModal === 'BUILDING' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Công Trình Đã Xây ({homestead?.buildings?.length || 0})</h3>
                <div className="rpg-grid">
                  {(homestead?.buildings || []).map((b: any) => (
                    <div key={b.instanceId} className="rpg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{b.buildingId} (Lv.{b.level})</div>
                        <div style={{ fontSize: 11, color: '#c2b092' }}>Tọa độ ô: ({b.tileX}, {b.tileY})</div>
                      </div>
                      <button
                        className="rpg-btn rpg-btn-primary"
                        style={{ fontSize: 11 }}
                        onClick={() =>
                          void runAction(
                            () => apiClient.request('POST', `/api/v1/characters/${character.id}/homestead/buildings/upgrade`, { instanceId: b.instanceId }),
                            `Đã nâng cấp ${b.buildingId} lên Lv.${b.level + 1}!`,
                          )
                        }
                      >
                        Nâng Cấp
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Xây Mới (Ghost Grid Preview)</h3>
                <div className="rpg-grid">
                  {(catalog?.buildings || []).filter((b: any) => b.mvp).map((b: any) => (
                    <div key={b.id} className="rpg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{b.name}</div>
                        <div style={{ fontSize: 11, color: '#c2b092' }}>
                          {b.footprintTiles.width}×{b.footprintTiles.height} ô • {b.levels?.[0]?.goldCost || 0} Gold
                        </div>
                      </div>
                      <button
                        className="rpg-btn rpg-btn-emerald"
                        style={{ fontSize: 11 }}
                        onClick={() => {
                          setPlacingBuildingId(b.id);
                          closeTopModal();
                          showToast(`Click lên bản đồ để đặt ${b.name}!`);
                        }}
                      >
                        Đặt Preview
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SCR-16: Farming & Animal Husbandry */}
          {activeModal === 'FARMING' && homestead && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12 }}>Chọn hạt giống để gieo:</span>
                {(catalog?.crops || []).filter((c: any) => c.mvp).map((c: any) => (
                  <button
                    key={c.id}
                    className={`rpg-btn ${selectedCrop === c.id ? 'rpg-btn-primary' : ''}`}
                    style={{ fontSize: 11 }}
                    onClick={() => setSelectedCrop(c.id)}
                  >
                    {c.name} ({countInBag(c.seedItemId)})
                  </button>
                ))}
              </div>
              <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
                {homestead.plots.map((p: any) => (
                  <div key={p.plotId} className="rpg-card">
                    <div style={{ fontWeight: 700, color: '#e4b65d' }}>{p.plotId} — {p.state}</div>
                    <div style={{ fontSize: 11, color: '#c2b092', margin: '4px 0' }}>
                      {p.cropId ? `${p.cropId} (${Math.round(p.growthProgressMin)}m)` : 'Đất trống'}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {p.state === 'UNTILLED' && (
                        <button
                          className="rpg-btn"
                          onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/homestead/farm/till`, { plotId: p.plotId }), 'Đã cuốc đất!')}
                        >
                          Cuốc Đất
                        </button>
                      )}
                      {p.state === 'TILLED' && (
                        <button
                          className="rpg-btn rpg-btn-emerald"
                          onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/homestead/farm/plant`, { plotId: p.plotId, cropId: selectedCrop }), `Đã gieo ${selectedCrop}!`)}
                        >
                          Gieo Hạt
                        </button>
                      )}
                      {p.state === 'PLANTED' && (
                        <button
                          className="rpg-btn rpg-btn-primary"
                          onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/homestead/farm/water`, { plotId: p.plotId }), 'Đã tưới nước tăng tốc!')}
                        >
                          Tưới Nước
                        </button>
                      )}
                      {p.state === 'MATURE' && (
                        <button
                          className="rpg-btn rpg-btn-primary"
                          onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/homestead/farm/harvest`, { plotId: p.plotId }), 'Thu hoạch thành công!')}
                        >
                          Thu Hoạch!
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <h3 style={{ margin: '0 0 8px', color: '#e4b65d' }}>Vật Nuôi ({homestead.animals.length})</h3>
              <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {homestead.animals.map((a: any) => (
                  <div key={a.animalInstanceId} className="rpg-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{a.name} ({a.animalId})</div>
                      <div style={{ fontSize: 11, color: '#c2b092' }}>Vui vẻ: {a.happiness}% • No: {a.hunger}%</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="rpg-btn"
                        style={{ fontSize: 11 }}
                        onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/homestead/animals/feed`, { animalInstanceId: a.animalInstanceId }), `Đã cho ${a.name} ăn!`)}
                      >
                        Cho Ăn
                      </button>
                      <button
                        className="rpg-btn rpg-btn-emerald"
                        style={{ fontSize: 11 }}
                        onClick={() => void runAction(() => apiClient.request('POST', `/api/v1/characters/${character.id}/homestead/animals/collect`, { animalInstanceId: a.animalInstanceId }), `Đã thu sản phẩm từ ${a.name}!`)}
                      >
                        Thu Hoạch
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* SCR-17: World Map & Fast Travel */}
          {activeModal === 'WORLD_MAP' && (
            <div className="rpg-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {WORLD_REGIONS.map((r) => (
                <div key={r.id} className="rpg-card" style={{ opacity: r.unlocked ? 1 : 0.52 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span style={{ color: r.unlocked ? '#e4b65d' : '#94a3b8' }}>{r.name}</span>
                    <span className="rpg-tag">{r.lv}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#c2b092', margin: '6px 0' }}>{r.desc}</div>
                  {r.unlocked ? (
                    <button
                      className="rpg-btn rpg-btn-primary"
                      onClick={() => {
                        gameUiBridge.emit('client:travelZone', { targetZoneId: r.id });
                        closeTopModal();
                        showToast(`Đang dịch chuyển tới ${r.name}...`);
                      }}
                    >
                      Dịch Chuyển Nhanh
                    </button>
                  ) : (
                    <span className="rpg-tag">Mở khóa ở phiên bản mở rộng</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
