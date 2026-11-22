/**
 * Giao diện Cây Kỹ Năng (6 tầng, chọn nhánh A/B) và Bùa Hộ Mệnh (ô theo cấp + bộ sưu tập).
 */

import { OwnerTag } from './owner-tag';
import { useState } from 'react';
import type { Socket } from 'socket.io-client';
import charmAtlas from '../../../database-astral-expedition/ui/charm-icons.json';
import {
  CHARM_RARITY_COLORS,
  CHARM_RARITY_LABELS_VI,
  EXPEDITION_CHARMS,
  EXPEDITION_CHARMS_BY_ID,
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_SKILL_TREES,
  EXP_BALANCE,
  STAT_LABELS_VI,
  canUnlockTreeNode,
  charmEffectValueAt,
  charmSlotsAtLevel,
  charmStatsAt,
  formatStatValue,
  treeNodeCost,
  treeNodeReqLevel,
  treePointsUnspent,
  type CharmDef,
  type ExpeditionProfile,
  type StatKey,
} from '../../../shared/src';
import { expeditionApi } from './rpc';
import { expeditionAssetUrl } from './store';

const charmIconSlots: Readonly<Record<string, number[]>> = charmAtlas.positions;
const charmIconImage = `url("${expeditionAssetUrl('ui/charm-icons.png')}")`;

export function CharmIcon({ id }: { id: string }) {
  const slot = charmIconSlots[id];
  if (!slot) return null;
  const [column, row] = slot;
  return <span className="exp-charm-icon" aria-hidden="true" data-charm-id={id}
    style={{
      backgroundImage: charmIconImage,
      backgroundSize: `${charmAtlas.columns * 100}% ${charmAtlas.rows * 100}%`,
      backgroundPosition: `${column * 100 / (charmAtlas.columns - 1)}% ${row * 100 / (charmAtlas.rows - 1)}%`,
    }} />;
}

type RunFn = <T>(fn: () => Promise<T>, onOk?: (r: T) => void) => Promise<void>;

interface Common {
  profile: ExpeditionProfile;
  heroId: string;
  socket: Socket | null;
  run: RunFn;
  setProfile: (p: ExpeditionProfile) => void;
  busy: boolean;
}

export function SkillTreeView({ profile, heroId, socket, run, setProfile, busy }: Common) {
  const inst = profile.heroes[heroId];
  const nodes = EXPEDITION_SKILL_TREES[heroId] ?? [];
  const [selectedId, setSelectedId] = useState<string>();
  const owned = new Set(inst.treeNodes ?? []);
  const selected = nodes.find((node) => node.nodeId === selectedId) ?? nodes[0];
  if (!selected) return null;
  const selectedOwned = owned.has(selected.nodeId);
  const access = canUnlockTreeNode(inst, selected.nodeId);
  const cost = treeNodeCost(inst, selected, selectedOwned);
  const level = treeNodeReqLevel(inst, selected);

  return (
    <section className="exp-card exp-skill-tree">
      <div className="exp-tree-head">
        <h3>Cây kỹ năng</h3>
        <span className="exp-tree-points"><b>{treePointsUnspent(inst)}</b> SP</span>
      </div>
      <div className="exp-tree-scroll">
        <div className="exp-tree" role="group" aria-label="Các nhánh kỹ năng">
          {EXP_BALANCE.skillTree.tierLevels.map((_, index) => (
            <div key={index} className={`exp-tree-tier ${index === 0 ? 'root' : ''} ${nodes.some((node) => node.tier === index && owned.has(node.nodeId)) ? 'reachable' : ''}`}>
              {nodes.filter((node) => node.tier === index + 1).map((node) => {
                const learned = owned.has(node.nodeId);
                const ready = canUnlockTreeNode(inst, node.nodeId).ok;
                const state = learned ? 'owned' : ready ? 'ready' : 'locked';
                return (
                  <button
                    key={node.nodeId}
                    type="button"
                    className={`exp-tree-node ${state} br-${node.branch}`}
                    aria-pressed={selected.nodeId === node.nodeId}
                    aria-label={`${node.nameVi}, ${learned ? 'đã mở' : ready ? 'có thể mở' : 'đang khóa'}`}
                    title={node.nameVi}
                    onClick={() => setSelectedId(node.nodeId)}
                  >
                    <span className="exp-tree-icon" aria-hidden="true">{node.icon}</span>
                    <span className="exp-tree-badge" aria-hidden="true">{learned ? '✓' : ready ? treeNodeCost(inst, node) : treeNodeReqLevel(inst, node)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="exp-tree-detail" aria-live="polite">
        <div>
          <b>{selected.nameVi}</b>
          <small>{selectedOwned ? 'Đã lĩnh hội' : `Lv.${level} · ${cost} SP`}</small>
          <p>{selected.descVi}</p>
          {!selectedOwned && !access.ok && <small>{access.reason}</small>}
        </div>
        <button type="button" className="exp-tree-unlock" disabled={busy || selectedOwned || !access.ok}
          onClick={() => void run(() => expeditionApi.unlockTreeNode(socket, heroId, selected.nodeId), setProfile)}>
          {selectedOwned ? 'Đã mở' : `Mở · ${cost} SP`}
        </button>
      </div>
      {!!inst.treeNodes?.length && <button type="button" className="exp-tree-reset" disabled={busy}
        onClick={() => void run(() => expeditionApi.resetTree(socket, heroId), setProfile)}>
        Tẩy cây · {EXP_BALANCE.skillTree.resetCostSeal} ◈
      </button>}
    </section>
  );
}

export function charmSummary(def: CharmDef, rank: number): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(charmStatsAt(def, rank))) {
    parts.push(`${STAT_LABELS_VI[k as StatKey].split(' (')[0]} +${formatStatValue(k as StatKey, v ?? 0)}`);
  }
  if (def.effect && def.effect.scales) {
    const v = charmEffectValueAt(def, rank);
    parts.push(`hiệu ứng ${v < 1 ? `${Math.round(v * 100)}%` : v}`);
  }
  return parts.join(' · ');
}

export function CharmSlots({ profile, heroId, socket, run, setProfile, busy }: Common) {
  const inst = profile.heroes[heroId];
  const slots = charmSlotsAtLevel(inst.level);
  const owners = new Map<string, string>();
  for (const h of Object.values(profile.heroes)) for (const c of h.charmIds ?? []) owners.set(c, h.heroId);
  const ownedIds = Object.keys(profile.charms ?? {});
  const levels = EXP_BALANCE.charms.slotUnlockLevels;
  return (
    <section className="exp-card">
      <h3>
        Bùa Hộ Mệnh · {slots}/{levels.length} ô <small>(ô mở ở Lv.{levels.join(' / ')} · nhặt bùa khi hạ quái nhỏ, Gác Cổng, Đại Trùm)</small>
      </h3>
      <div className="exp-charm-slots">
        {levels.map((lv, i) => {
          const cid = inst.charmIds?.[i];
          const def = cid ? EXPEDITION_CHARMS_BY_ID[cid] : undefined;
          const open = i < slots;
          return (
            <div key={i} className={`exp-charm-slot ${open ? '' : 'locked'}`} style={def ? { borderColor: CHARM_RARITY_COLORS[def.rarity] } : undefined}>
              {!open ? (
                <em>🔒 Lv.{lv}</em>
              ) : (
                <>
                  {def ? (
                    <>
                      <b style={{ color: CHARM_RARITY_COLORS[def.rarity] }}>
                        <CharmIcon id={def.charmId} />{def.nameVi} <small>R{profile.charms?.[def.charmId]?.rank ?? 1}</small>
                      </b>
                      <small>{def.descVi}</small>
                    </>
                  ) : (
                    <em>Ô trống</em>
                  )}
                  <select
                    value=""
                    disabled={busy}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      void run(() => expeditionApi.equipCharm(socket, heroId, Math.min(i, inst.charmIds?.length ?? 0), v === '__none' ? null : v), setProfile);
                    }}
                  >
                    <option value="">— Chọn bùa —</option>
                    {def && <option value="__none">Tháo ra</option>}
                    {ownedIds
                      .filter((id) => id !== cid)
                      .map((id) => EXPEDITION_CHARMS_BY_ID[id])
                      .filter(Boolean)
                      .sort((a, b) => b.tier - a.tier)
                      .map((c) => (
                        <option key={c.charmId} value={c.charmId}>
                          [{CHARM_RARITY_LABELS_VI[c.rarity]}] {c.nameVi} R{profile.charms?.[c.charmId]?.rank}
                          {owners.get(c.charmId) && owners.get(c.charmId) !== heroId ? ` (đang ở ${EXPEDITION_HEROES_BY_ID[owners.get(c.charmId)!]?.nameVi})` : ''}
                        </option>
                      ))}
                  </select>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CharmsView({ profile }: { profile: ExpeditionProfile }) {
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const owners = new Map<string, string>();
  for (const h of Object.values(profile.heroes)) for (const c of h.charmIds ?? []) owners.set(c, h.heroId);
  const C = EXP_BALANCE.charms;
  const owned = (id: string) => profile.charms?.[id];
  const collected = EXPEDITION_CHARMS.filter((charm) => owned(charm.charmId));
  const entries = onlyOwned ? collected : [...collected, ...EXPEDITION_CHARMS.filter((charm) => !owned(charm.charmId))];
  const selected = entries.find((charm) => charm.charmId === selectedId) ?? entries[0];
  const rank = selected ? owned(selected.charmId)?.rank : undefined;
  const wearer = selected ? owners.get(selected.charmId) : undefined;
  return (
    <div className="exp-charms">
      <div className="exp-charm-directory">
        <div className="exp-charm-toolbar">
          <div className="ui-summon-tabs" role="group" aria-label="Lọc bùa">
            <button type="button" className={!onlyOwned ? 'on' : ''} aria-pressed={!onlyOwned} onClick={() => setOnlyOwned(false)}>Tất cả</button>
            <button type="button" className={onlyOwned ? 'on' : ''} aria-pressed={onlyOwned} onClick={() => setOnlyOwned(true)}>Đã có</button>
          </div>
          <small>{collected.length}/{EXPEDITION_CHARMS.length} đã có</small>
        </div>
        <div className="exp-charm-grid" aria-label="Danh sách bùa">
          {entries.map((charm) => {
            const item = owned(charm.charmId);
            return <button type="button" key={charm.charmId} className={`exp-charm-card ${item ? '' : 'unknown'}`}
              title={charm.nameVi} aria-pressed={selected?.charmId === charm.charmId}
              onClick={() => setSelectedId(charm.charmId)}>
              <CharmIcon id={charm.charmId} />
              <OwnerTag heroId={owners.get(charm.charmId)} />
              <span className="exp-charm-name">{charm.nameVi}</span>
              {item ? <small style={{ color: CHARM_RARITY_COLORS[charm.rarity] }}>R{item.rank}</small>
                : <small aria-label="Chưa sở hữu">◇</small>}
            </button>;
          })}
        </div>
        {!entries.length && <p className="ui-empty">Bạn chưa nhặt được bùa nào.</p>}
      </div>
      {selected && <aside className="exp-charm-inspector" aria-label="Chi tiết bùa">
        <CharmIcon id={selected.charmId} />
        <h2 style={{ color: CHARM_RARITY_COLORS[selected.rarity] }}>{selected.nameVi}</h2>
        <small>{CHARM_RARITY_LABELS_VI[selected.rarity]} · {rank ? `R${rank}` : 'Chưa sở hữu'}</small>
        <p>{selected.descVi}</p>
        {(rank !== undefined && (rank > 1 || selected.stats)) && <em>{charmSummary(selected, rank)}</em>}
        {wearer ? <OwnerTag heroId={wearer} /> : rank ? null : <small className="exp-charm-mystery">Ẩn đâu đó trên hành trình… hãy tiếp tục chiến đấu để tìm ra.</small>}
      </aside>}
    </div>
  );
}
