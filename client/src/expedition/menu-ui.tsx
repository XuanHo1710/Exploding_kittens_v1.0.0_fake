/**
 * Menu toàn màn hình của Astral Expedition: Trại đội hình → Hồ sơ nhân vật → các màn con
 * (Chỉ số, Bùa Hộ Mệnh, Kỹ năng, Cây kỹ năng, Trang bị).
 *
 * Nguyên tắc: mỗi lúc chỉ một việc. Màn con chỉ giữ chân dung nhân vật và thông tin liên quan, phần còn lại
 * trượt ra ngoài; chân dung là một phần tử duy nhất đổi vị trí bằng transition nên chuyển màn liền mạch.
 */

import skillAtlas from '../../../database-astral-expedition/ui/skill-icons.json';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import {
  CHARM_RARITY_COLORS,
  CHARM_RARITY_LABELS_VI,
  ELEMENT_LABELS_VI,
  EQUIP_SLOTS,
  EQUIP_SLOT_LABELS_VI,
  EXPEDITION_CHARMS_BY_ID,
  EXPEDITION_HEROES,
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_REALMS_BY_ID,
  EXPEDITION_SKILLS_BY_ID,
  EXP_BALANCE,
  BATTLE_SUPPLIES,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS_VI,
  ROLE_LABELS_VI,
  STAT_KEYS,
  STAT_LABELS_VI,
  charmSlotsAtLevel,
  computeHeroFinalStats,
  configuredSkillIds,
  expToNextLevel,
  formatStatValue,
  heroCombatSkillIds,
  itemStatValue,
  weaponRefineCost,
  enhanceCost,
  HERO_STYLE_VI,
  ENHANCE_MAX,
  skillLevelCap,
  skillUnlockLevel,
  skillUpgradeCost,
  statPointsUnspent,
  treePointsUnspent,
  unlockedSkillIds,
  type BattleSupply,
  type CombatSkillDefinition,
  type EquipSlot,
  type ExpeditionProfile,
  type ItemInstance,
  type StatKey,
} from './shared';
import { expeditionApi } from './rpc';
import { expeditionAssetUrl, outfitPortraitOf, type HeroOutfit } from './store';
import { CharmIcon, charmSummary } from './progression-ui';
import { SkillTreeGraph } from './skill-tree-ui';
import { EquipmentName, isMythicWeapon, WeaponIcon } from './weapon-art';
import { OwnerTag } from './owner-tag';
import { EnhancePanel } from './enhance-panel';

export type HeroSub = 'overview' | 'stats' | 'charms' | 'skills' | 'tree' | 'gear';
export type PageId = 'bag' | 'summon' | 'journal' | 'charms' | 'settings';
export type MenuRoute =
  | { screen: 'camp' }
  | { screen: 'hero'; heroId: string; sub: HeroSub }
  | { screen: 'page'; page: PageId };

export type RunFn = <T>(fn: () => Promise<T>, onOk?: (r: T) => void) => Promise<void>;

interface Shared {
  profile: ExpeditionProfile;
  socket: Socket | null;
  run: RunFn;
  setProfile: (p: ExpeditionProfile) => void;
  busy: boolean;
}

export const STAT_SHORT_VI: Record<StatKey, string> = {
  hp: 'Sinh lực',
  atk: 'Tấn công',
  def: 'Phòng thủ',
  spd: 'Tốc độ',
  critRate: 'Tỉ lệ chí mạng',
  critDmg: 'ST chí mạng',
  eva: 'Né tránh',
};

const STAT_HELP_VI: Record<StatKey, string> = {
  hp: 'Tăng lượng máu tối đa của nhân vật.',
  atk: 'Tăng sát thương của đòn đánh và kỹ năng.',
  def: 'Giảm sát thương phải nhận.',
  spd: 'Nhân vật hành động sớm và thường xuyên hơn.',
  critRate: 'Tăng khả năng gây đòn chí mạng.',
  critDmg: 'Tăng sát thương khi đòn đánh chí mạng.',
  eva: 'Cơ hội tự né đòn không kịp đỡ.',
};

const SCOPE_VI: Record<CombatSkillDefinition['targetScope'], string> = {
  single_enemy: 'Một kẻ địch',
  all_enemies: 'Mọi kẻ địch',
  single_ally: 'Một đồng đội',
  all_allies: 'Cả đội',
  self: 'Bản thân',
};

const SLOT_VI: Record<CombatSkillDefinition['slotKind'], string> = {
  basic: 'Đòn thường',
  active: 'Kỹ năng',
  ultimate: 'Tuyệt kỹ',
  passive: 'Nội tại',
};

export function portraitUrl(heroId: string) {
  return expeditionAssetUrl(outfitPortraitOf(heroId) ?? `units/heroes/${heroId}-portrait.png`);
}

export function orderedHeroIds(profile: ExpeditionProfile): string[] {
  const owned = EXPEDITION_HEROES.filter((h) => profile.heroes[h.heroId]).map((h) => h.heroId);
  return [...profile.activeParty.filter((id) => owned.includes(id)), ...owned.filter((id) => !profile.activeParty.includes(id))];
}

// ------------------------------------------------------------------ small building blocks

/** Nhân vật đứng thở (hàng idle hướng xuống của sheet di chuyển 6×8, ô 64 px). */
export function HeroIdle({ heroId, movement, className }: { heroId: string; movement?: string; className?: string }) {
  const url = expeditionAssetUrl(movement ?? `units/heroes/${heroId}-movement.png`);
  return <span className={`ui-idle ${className ?? ''}`} aria-hidden="true" style={{ backgroundImage: `url("${url}")` }} />;
}

export function Keys({ items }: { items: readonly [string, string][] }) {
  return (
    <div className="ui-keys" aria-hidden="true">
      {items.map(([key, label]) => (
        <span key={key + label}>
          <kbd>{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

function Meter({ value, max, kind }: { value: number; max: number; kind: 'hp' | 'exp' | 'break' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <span className={`ui-meter ${kind}`}>
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

function Currency({ profile }: { profile: ExpeditionProfile }) {
  return (
    <div className="ui-currency" aria-label="Tài nguyên">
      <span title="Ấn Tinh Tú">{profile.astralSeal.toLocaleString('vi-VN')} <b>◈</b></span>
      <span title="Tinh Huy">{profile.starlightToken.toLocaleString('vi-VN')} <b>✦</b></span>
      <span title="Tinh Thể EXP">{profile.expCrystal.toLocaleString('vi-VN')} <b>⬢</b></span>
    </div>
  );
}

/** Mạng nhện điểm tiềm năng đã cộng. */
function Radar({ alloc }: { alloc: Partial<Record<StatKey, number>> }) {
  const n = STAT_KEYS.length;
  const peak = Math.max(5, ...STAT_KEYS.map((k) => alloc[k] ?? 0));
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return `${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`;
  };
  const ring = (r: number) => STAT_KEYS.map((_, i) => pt(i, r)).join(' ');
  const shape = STAT_KEYS.map((k, i) => pt(i, 6 + ((alloc[k] ?? 0) / peak) * 30)).join(' ');
  return (
    <svg className="ui-radar" viewBox="0 0 100 100" role="img" aria-label="Phân bổ điểm tiềm năng">
      <polygon points={ring(36)} className="ring" />
      <polygon points={ring(24)} className="ring" />
      <polygon points={ring(12)} className="ring" />
      <polygon points={shape} className="fill" />
      {STAT_KEYS.map((k, i) => {
        const [x, y] = pt(i, 46).split(',').map(Number);
        return (
          <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle">
            {alloc[k] ?? 0}
          </text>
        );
      })}
    </svg>
  );
}

/** Bảng thông tin bên phải (tên, cấp, EXP, chỉ số chiến đấu, điểm tiềm năng). */
function StatPanel({ profile, heroId, children }: { profile: ExpeditionProfile; heroId: string; children?: ReactNode }) {
  const def = EXPEDITION_HEROES_BY_ID[heroId];
  const inst = profile.heroes[heroId];
  const stats = computeHeroFinalStats(def, inst, profile.inventory, profile.charms);
  const need = expToNextLevel(inst.level);
  return (
    <section className="ui-statpanel">
      <h2>{def.nameVi} <RarityTag r={def.rarity} /></h2>
      <p className="ui-sub">{def.titleVi} · {ELEMENT_LABELS_VI[def.element]} · {ROLE_LABELS_VI[def.role]}{HERO_STYLE_VI[def.heroId] ? <b className="hero-style"> · {HERO_STYLE_VI[def.heroId]}</b> : null}</p>
      <div className="ui-level">
        <span>Cấp độ<b>{inst.level}</b></span>
        <div>
          <small>{inst.exp} / {need}</small>
          <Meter value={inst.exp} max={need} kind="exp" />
          <small>{stats.hp} / {stats.hp}</small>
          <Meter value={1} max={1} kind="hp" />
        </div>
      </div>
      <h3>Chỉ số chiến đấu</h3>
      <dl className="ui-combat">
        {STAT_KEYS.map((k) => (
          <div key={k}>
            <dt>{STAT_SHORT_VI[k]}</dt>
            <dd>{formatStatValue(k, stats[k])}</dd>
          </div>
        ))}
      </dl>
      <h3>Điểm tiềm năng</h3>
      <div className="ui-radar-wrap">
        <Radar alloc={inst.statAlloc ?? {}} />
        <ul>
          {STAT_KEYS.map((k) => <li key={k}>{STAT_SHORT_VI[k]}</li>)}
        </ul>
      </div>
      {children}
    </section>
  );
}

/** Thẻ độ hiếm nhân vật: SSR vàng rực, SR tím, R xanh. */
export function RarityTag({ r }: { r: string }) {
  return <span className={`rar-tag r-${r}`} aria-label={`Hạng ${r}`}>{r}</span>;
}

const SWITCH_WINDOW = 5;

/** Thanh đổi nhân vật: chỉ hiện 5 người; Q / E đi tới nhân vật ngoài khung thì khung trượt 1 ô (vòng tròn). */
function HeroSwitcher({ profile, heroId, onPick }: { profile: ExpeditionProfile; heroId: string; onPick: (id: string) => void }) {
  const ids = orderedHeroIds(profile);
  const size = Math.min(SWITCH_WINDOW, ids.length);
  const [start, setStart] = useState(0);
  const idx = Math.max(0, ids.indexOf(heroId));
  // giữ nhân vật đang chọn trong khung; đi quá mép thì trượt đúng 1 ô, vòng từ cuối về đầu và ngược lại
  const fixedStart = idx < start ? idx : idx > start + size - 1 ? idx - size + 1 : Math.min(start, Math.max(0, ids.length - size));
  useEffect(() => { if (fixedStart !== start) setStart(fixedStart); }, [fixedStart, start]);
  const shown = ids.slice(fixedStart, fixedStart + size);
  return (
    <nav className="ui-switch" aria-label="Đổi nhân vật">
      <kbd>Q</kbd>
      {fixedStart > 0 && <span className="ui-switch-more" aria-hidden="true">‹{fixedStart}</span>}
      {shown.map((id) => {
        const def = EXPEDITION_HEROES_BY_ID[id];
        return (
          <button key={id} type="button" className={`ui-switch-hero r-${def?.rarity} ${id === heroId ? 'on' : ''}`} onClick={() => onPick(id)} title={def?.nameVi}>
            <img src={portraitUrl(id)} alt={def?.nameVi} />
            {def && <RarityTag r={def.rarity} />}
            {profile.activeParty.includes(id) && <i aria-label="Trong đội" />}
          </button>
        );
      })}
      {fixedStart + size < ids.length && <span className="ui-switch-more" aria-hidden="true">{ids.length - fixedStart - size}›</span>}
      <kbd>E</kbd>
    </nav>
  );
}

// ------------------------------------------------------------------ camp (party overview)

export function CampScreen(props: Shared & {
  looks: Record<string, string>;
  onHero: (id: string) => void;
  onPage: (p: PageId) => void;
  onClose: () => void;
  onLeave: () => void;
}) {
  const { profile, socket, run, setProfile, busy, looks, onHero, onPage, onClose, onLeave } = props;
  const [formation, setFormation] = useState(false);
  const [slot, setSlot] = useState(0);
  const realm = EXPEDITION_REALMS_BY_ID[profile.currentMapId];
  const gkDone = realm.gatekeeperIds.filter((id) => profile.clearedGatekeepers.includes(id)).length;
  const owned = orderedHeroIds(profile);
  const bench = owned.filter((id) => !profile.activeParty.includes(id));

  const place = (heroId: string) => {
    const next = [...profile.activeParty];
    if (slot < next.length) next[slot] = heroId;
    else next.push(heroId);
    void run(() => expeditionApi.updateParty(socket, next.slice(0, 4), profile.reserveParty?.filter((id) => id !== heroId)), setProfile);
  };
  const remove = (heroId: string) => {
    if (profile.activeParty.length <= 1) return;
    void run(() => expeditionApi.updateParty(socket, profile.activeParty.filter((id) => id !== heroId)), setProfile);
  };

  return (
    <div className={`ui-camp ${formation ? 'formation' : ''}`}>
      <div className="ui-camp-glow" aria-hidden="true" />
      {!formation && (
        <nav className="ui-camp-menu ui-in-left" aria-label="Menu">
          <p className="ui-realm">{realm.nameVi}<small>Gác cổng {gkDone}/{realm.gatekeeperIds.length} · Trùm {profile.clearedBosses.includes(realm.bossAltar.bossId) ? 'đã hạ' : 'chưa hạ'}</small></p>
          {([
            ['journal', 'Hành trình'],
            ['bag', 'Túi đồ'],
            ['charms', 'Bùa hộ mệnh'],
            ['summon', 'Triệu hồi'],
            ['settings', 'Cài đặt'],
          ] as [PageId, string][]).map(([id, label]) => (
            <button key={id} type="button" className="ui-plate" onClick={() => onPage(id)}><span>{label}</span></button>
          ))}
          <button type="button" className="ui-plate" onClick={() => setFormation(true)}><span>Đội hình</span></button>
          <button type="button" className="ui-plate dim" onClick={onLeave}><span>Rời game</span></button>
        </nav>
      )}
      {!formation && <Currency profile={profile} />}

      <div className="ui-camp-party" role="list">
        {Array.from({ length: formation ? 4 : profile.activeParty.length }, (_, index) => {
          const id = profile.activeParty[index];
          if (!id) {
            return (
              <button key={index} type="button" role="listitem" className={`ui-camp-hero empty ${slot === index ? 'pick' : ''}`} onClick={() => setSlot(index)}>
                <span className="ui-camp-empty">＋</span>
              </button>
            );
          }
          const def = EXPEDITION_HEROES_BY_ID[id];
          const inst = profile.heroes[id];
          const pts = statPointsUnspent(inst) + treePointsUnspent(inst);
          return (
            <button key={id} type="button" role="listitem" style={{ animationDelay: `${index * 70}ms` }}
              className={`ui-camp-hero ${formation && slot === index ? 'pick' : ''}`}
              onClick={() => (formation ? setSlot(index) : onHero(id))}>
              <HeroIdle heroId={id} movement={looks[id]} />
              <span className={`ui-nameplate r-${def.rarity}`}>
                <b>{def.nameVi} <RarityTag r={def.rarity} /></b>
                <small>Cấp độ <em>{inst.level}</em></small>
                <Meter value={1} max={1} kind="hp" />
                {pts > 0 && <i className="ui-badge" title="Điểm chưa dùng">{pts}</i>}
              </span>
              {formation && profile.activeParty.length > 1 && (
                <span className="ui-camp-remove" role="button" tabIndex={0} aria-label={`Bỏ ${def.nameVi} khỏi đội`}
                  onClick={(e) => { e.stopPropagation(); remove(id); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); remove(id); } }}>×</span>
              )}
            </button>
          );
        })}
      </div>

      {formation && (
        <section className="ui-bench ui-in-bottom" aria-label="Nhân vật dự bị">
          <h3>Chọn nhân vật cho ô {slot + 1}</h3>
          <div>
            {bench.map((id) => (
              <button key={id} type="button" className={`r-${EXPEDITION_HEROES_BY_ID[id].rarity}`} disabled={busy} onClick={() => place(id)}>
                <img src={portraitUrl(id)} alt="" />
                <span>{EXPEDITION_HEROES_BY_ID[id].nameVi} <RarityTag r={EXPEDITION_HEROES_BY_ID[id].rarity} /><small>Cấp {profile.heroes[id].level}</small></span>
              </button>
            ))}
            {!bench.length && <p className="ui-empty">Mọi nhân vật đã ở trong đội. Triệu hồi để có thêm đồng đội.</p>}
          </div>
        </section>
      )}

      {!formation && (
        <aside className="ui-supplies ui-in-right" aria-label="Vật phẩm chiến đấu">
          {(Object.keys(BATTLE_SUPPLIES) as BattleSupply[]).map((id) => (
            <span key={id} title={BATTLE_SUPPLIES[id].descriptionVi}>
              <CharmIcon id={id} />
              <b>{profile.supplies?.[id] ?? 0}</b>
              <small>{BATTLE_SUPPLIES[id].nameVi}</small>
            </span>
          ))}
        </aside>
      )}

      {formation ? (
        <div className="ui-foot"><button type="button" className="ui-plate small" onClick={() => setFormation(false)}><span>Xong</span></button>
          <Keys items={[['Esc', 'Quay lại']]} /></div>
      ) : (
        <div className="ui-foot"><Keys items={[['Chuột', 'Xem nhân vật'], ['Esc', 'Đóng']]} />
          <button type="button" className="ui-close" onClick={onClose} aria-label="Đóng menu">✕</button></div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ hero screen

export function HeroScreen(props: Shared & {
  heroId: string;
  sub: HeroSub;
  go: (heroId: string, sub: HeroSub) => void;
  looks: Record<string, string>;
  outfits: readonly HeroOutfit[];
  selectedOutfit: string;
  onOutfit: (id: string) => void;
}) {
  const { profile, heroId, sub, go } = props;
  const ids = orderedHeroIds(profile);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      const k = e.key.toLowerCase();
      if (k !== 'q' && k !== 'e') return;
      const i = ids.indexOf(heroId);
      const next = ids[(i + (k === 'e' ? 1 : ids.length - 1)) % ids.length];
      if (next && next !== heroId) go(next, sub);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [ids, heroId, sub, go]);

  if (!profile.heroes[heroId]) return null;
  return (
    <div className={`ui-hero sub-${sub}`} key={heroId}>
      <div className="ui-hero-portrait" aria-hidden="true">
        <img src={portraitUrl(heroId)} alt="" />
      </div>
      <HeroSwitcher profile={profile} heroId={heroId} onPick={(id) => go(id, sub)} />
      {sub === 'overview' && <Overview {...props} />}
      {sub === 'stats' && <StatsSub {...props} />}
      {sub === 'charms' && <CharmsSub {...props} />}
      {sub === 'skills' && <SkillsSub {...props} />}
      {sub === 'tree' && <TreeSub {...props} />}
      {sub === 'gear' && <GearSub {...props} />}
    </div>
  );
}

type SubProps = Parameters<typeof HeroScreen>[0];

function Overview(props: SubProps) {
  const { profile, heroId, go, busy, run, socket, setProfile } = props;
  const def = EXPEDITION_HEROES_BY_ID[heroId];
  const inst = profile.heroes[heroId];
  const learned = unlockedSkillIds(def, inst.level);
  const equipped = configuredSkillIds(def, inst, learned);
  const slots = EXP_BALANCE.charms.slotUnlockLevels;
  const open = charmSlotsAtLevel(inst.level);
  const free = statPointsUnspent(inst);
  const sp = treePointsUnspent(inst);
  return (
    <>
      <section className="ui-ov-left ui-in-left">
        <h3><i className="ui-dot" />Trang bị</h3>
        {EQUIP_SLOTS.map((slot) => {
          const item = profile.inventory?.find((x) => x.uid === inst.equipment?.[slot]);
          return (
            <button key={slot} type="button" className="ui-plate wide" onClick={() => go(heroId, 'gear')}>
              <span className="lbl">{EQUIP_SLOT_LABELS_VI[slot]}</span>
              {item && <WeaponIcon item={item} />}
              {item ? <EquipmentName item={item} className="val" /> : <span className="val">—</span>}
              {item && <span className="num">i{item.ilvl}</span>}
            </button>
          );
        })}
        <h3><i className="ui-dot" />Bùa hộ mệnh</h3>
        {slots.map((lv, i) => {
          const charm = inst.charmIds?.[i] ? EXPEDITION_CHARMS_BY_ID[inst.charmIds[i]] : undefined;
          return (
            <button key={i} type="button" className={`ui-plate wide ${i < open ? '' : 'locked'}`} onClick={() => go(heroId, 'charms')}>
              {i < open && charm && <CharmIcon id={charm.charmId} />}
              <span className="val" style={charm ? { color: CHARM_RARITY_COLORS[charm.rarity] } : undefined}>
                {i >= open ? `Mở ở cấp ${lv}` : charm ? charm.nameVi : '—'}
              </span>
            </button>
          );
        })}
      </section>

      <section className="ui-ov-skills ui-in-bottom">
        <h3><i className="ui-dot" />Kỹ năng</h3>
        <div>
          {Array.from({ length: 6 }, (_, i) => {
            const skill = equipped[i] ? EXPEDITION_SKILLS_BY_ID[equipped[i]] : undefined;
            return (
              <button key={i} type="button" className="ui-plate" onClick={() => go(heroId, 'skills')}>
                {skill ? <><SkillGlyph skill={skill} /><span className="val">{skill.nameVi}</span><span className="ap">{skill.apCost || `+${skill.apGain}`}</span></> : <span className="val">—</span>}
              </button>
            );
          })}
        </div>
      </section>

      <div className="ui-ov-right ui-in-right">
        <StatPanel profile={profile} heroId={heroId}>
          <div className="ui-actions">
            <button type="button" className="ui-plate" onClick={() => go(heroId, 'stats')}>
              <span>Chỉ số</span>{free > 0 && <i className="ui-badge">{free}</i>}
            </button>
            <button type="button" className="ui-plate" onClick={() => go(heroId, 'tree')}>
              <span>Cây kỹ năng</span>{sp > 0 && <i className="ui-badge">{sp}</i>}
            </button>
            <button type="button" className="ui-plate ui-awaken" disabled={busy || inst.shards < 1 || inst.awakeningRank >= 6}
              onClick={() => void run(() => expeditionApi.upgradeHero(socket, { heroId, kind: 'awaken', expectedRank: inst.awakeningRank }), setProfile)}>
              <span>Thức tỉnh A{inst.awakeningRank} · {inst.shards} mảnh</span>
            </button>
            {props.outfits.length > 0 && (
              <div className="ui-outfit-picker" role="radiogroup" aria-label="Trang phục">
                <span className="ui-outfit-title">Trang phục</span>
                <div className="ui-outfit-cards">
                  {[{ variantId: '', nameVi: 'Mặc định', portrait: undefined as string | undefined }, ...props.outfits].map((o) => (
                    <button key={o.variantId || 'default'} type="button" role="radio" aria-checked={props.selectedOutfit === o.variantId}
                      className={`ui-outfit-card ${props.selectedOutfit === o.variantId ? 'on' : ''}`} onClick={() => props.onOutfit(o.variantId)}>
                      <img src={expeditionAssetUrl(o.portrait ?? `units/heroes/${heroId}-portrait.png`)} alt="" />
                      <b>{o.nameVi}</b>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </StatPanel>
      </div>
      <div className="ui-foot"><Keys items={[['Q / E', 'Đổi nhân vật'], ['Chuột', 'Mở mục'], ['Esc', 'Quay lại']]} /></div>
    </>
  );
}

export function SkillGlyph({ skill }: { skill: CombatSkillDefinition }) {
  // icon kỹ năng vẽ riêng (cùng phong cách icon Bùa); thiếu thì dùng hình hiệu ứng cũ
  const slot = (skillAtlas.positions as Record<string, number[]>)[skill.skillId];
  if (slot) {
    const [column, row] = slot;
    return <span className="ui-glyph skill-icon" aria-hidden="true" data-skill-id={skill.skillId} style={{
      backgroundImage: skillIconImage,
      backgroundSize: `${skillAtlas.columns * 100}% ${skillAtlas.rows * 100}%`,
      backgroundPosition: `${column * 100 / (skillAtlas.columns - 1)}% ${row * 100 / (skillAtlas.rows - 1)}%`,
    }} />;
  }
  const key = `${skill.element.toLowerCase()}_${skill.vfxSpec.beamStyle ?? 'slash'}`;
  return <span className="ui-glyph" aria-hidden="true" style={{ backgroundImage: `url("${expeditionAssetUrl(`vfx/skills/${key}-effect.png`)}")` }} />;
}

const skillIconImage = `url("${expeditionAssetUrl('ui/skill-icons.png')}")`;

// ------------------------------------------------------------------ stats

function StatsSub({ profile, heroId, socket, run, setProfile, busy }: SubProps) {
  const def = EXPEDITION_HEROES_BY_ID[heroId];
  const inst = profile.heroes[heroId];
  const [pending, setPending] = useState<Partial<Record<StatKey, number>>>({});
  const [row, setRow] = useState(0);
  useEffect(() => setPending({}), [heroId]);
  const used = Object.values(pending).reduce((a, b) => a + (b ?? 0), 0);
  const free = statPointsUnspent(inst) - used;
  const now = useMemo(() => computeHeroFinalStats(def, inst, profile.inventory, profile.charms), [def, inst, profile.inventory, profile.charms]);
  const next = useMemo(() => {
    const merged = { ...inst, statAlloc: { ...inst.statAlloc } };
    for (const [k, v] of Object.entries(pending)) merged.statAlloc[k as StatKey] = (merged.statAlloc[k as StatKey] ?? 0) + (v ?? 0);
    return computeHeroFinalStats(def, merged, profile.inventory, profile.charms);
  }, [def, inst, pending, profile.inventory, profile.charms]);
  const bump = (k: StatKey, d: number) => setPending((p) => {
    const cur = p[k] ?? 0;
    const v = Math.max(0, cur + Math.min(d, free));
    return { ...p, [k]: v };
  });
  const confirm = () => {
    if (used <= 0 || busy) return;
    void run(() => expeditionApi.allocateStats(socket, heroId, pending as Record<string, number>), (p) => { setProfile(p); setPending({}); });
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const stat = STAT_KEYS[row];
      if (k === 'arrowdown' || k === 's') setRow((r) => (r + 1) % STAT_KEYS.length);
      else if (k === 'arrowup' || k === 'w') setRow((r) => (r + STAT_KEYS.length - 1) % STAT_KEYS.length);
      else if (k === 'arrowright' || k === 'd') bump(stat, 1);
      else if (k === 'arrowleft' || k === 'a') bump(stat, -1);
      else if (k === 'enter') confirm();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  return (
    <>
      <div className="ui-st-level ui-in-right"><span>Cấp độ</span><b>{inst.level}</b></div>
      <section className="ui-st-alloc ui-in-left">
        <header>
          <h2>Chỉ số</h2>
          <span className="ui-diamond"><b>{free}</b></span>
          <small>Điểm khả dụng</small>
        </header>
        {STAT_KEYS.map((k, i) => {
          const base = inst.statAlloc?.[k] ?? 0;
          const add = pending[k] ?? 0;
          return (
            <div key={k} className={`ui-alloc ${row === i ? 'focus' : ''}`} onMouseEnter={() => setRow(i)}>
              <span className="lbl">{STAT_SHORT_VI[k]}</span>
              <span className="cur">{base}</span>
              <span className="arrow">→</span>
              <button type="button" aria-label={`Bớt ${STAT_SHORT_VI[k]}`} disabled={!add} onClick={() => bump(k, -1)}>‹</button>
              <b className={add ? 'up' : ''}>{base + add}</b>
              <button type="button" aria-label={`Cộng ${STAT_SHORT_VI[k]}`} disabled={free <= 0} onClick={() => bump(k, 1)}>›</button>
            </div>
          );
        })}
        <div className="ui-st-buttons">
          <button type="button" className="ui-plate" disabled={busy || used <= 0} onClick={confirm}><span>Nâng cấp chỉ số</span><kbd>Enter</kbd></button>
          <button type="button" className="ui-plate dim" disabled={busy || !Object.keys(inst.statAlloc ?? {}).length}
            onClick={() => void run(() => expeditionApi.allocateStats(socket, heroId, null, true), setProfile)}>
            <span>Tẩy điểm · {EXP_BALANCE.statPoints.resetCostSeal} ◈</span>
          </button>
        </div>
      </section>
      <section className="ui-st-derived ui-in-right">
        {STAT_KEYS.map((k) => {
          const changed = next[k] !== now[k];
          return (
            <div key={k} className={`ui-derived ${changed ? 'changed' : ''}`}>
              <div>
                <b>{STAT_LABELS_VI[k].split(' (')[0]}</b>
                <small>{STAT_HELP_VI[k]}</small>
              </div>
              <span className="nums">
                {formatStatValue(k, now[k])}
                {changed && <><i>→</i><em>{formatStatValue(k, next[k])}</em></>}
              </span>
              <span className="per">+{formatStatValue(k, EXP_BALANCE.statPoints.valuePerPoint[k])}/điểm</span>
            </div>
          );
        })}
      </section>
      <div className="ui-foot"><Keys items={[['↑ ↓', 'Chọn'], ['← →', 'Cộng / bớt'], ['Enter', 'Xác nhận'], ['Esc', 'Quay lại']]} /></div>
    </>
  );
}

// ------------------------------------------------------------------ charms

function CharmsSub({ profile, heroId, socket, run, setProfile, busy }: SubProps) {
  const inst = profile.heroes[heroId];
  const levels = EXP_BALANCE.charms.slotUnlockLevels;
  const open = charmSlotsAtLevel(inst.level);
  const [slot, setSlot] = useState(0);
  const [hover, setHover] = useState<string>();
  const owners = new Map<string, string>();
  for (const h of Object.values(profile.heroes)) for (const c of h.charmIds ?? []) owners.set(c, h.heroId);
  const owned = Object.keys(profile.charms ?? {})
    .map((id) => EXPEDITION_CHARMS_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => b.tier - a.tier || a.nameVi.localeCompare(b.nameVi));
  const current = inst.charmIds?.[slot];
  const shown = EXPEDITION_CHARMS_BY_ID[hover ?? current ?? ''];
  const equip = (charmId: string | null) => {
    if (slot >= open) return;
    void run(() => expeditionApi.equipCharm(socket, heroId, Math.min(slot, inst.charmIds?.length ?? 0), charmId), setProfile);
  };
  return (
    <>
      <section className="ui-ch-list ui-in-left">
        <header><h2>Bùa hộ mệnh</h2><small>{open}/{levels.length} ô · {owned.length} bùa</small></header>
        <div className="ui-scroll">
          {owned.map((c) => {
            const owner = owners.get(c.charmId);
            return (
              <button key={c.charmId} type="button" className={`ui-plate wide ${current === c.charmId ? 'on' : ''}`} disabled={busy || slot >= open}
                onMouseEnter={() => setHover(c.charmId)} onMouseLeave={() => setHover(undefined)} onClick={() => equip(c.charmId)}>
                <CharmIcon id={c.charmId} />
                <span className="val" style={{ color: CHARM_RARITY_COLORS[c.rarity] }}>{c.nameVi}</span>
                <span className="num">{owner ? <OwnerTag heroId={owner} self={owner === heroId} /> : `R${profile.charms?.[c.charmId]?.rank ?? 1}`}</span>
              </button>
            );
          })}
          {!owned.length && <p className="ui-empty">Chưa có bùa. Hạ quái nhỏ, Gác Cổng và Đại Trùm để nhặt bùa.</p>}
        </div>
      </section>
      <div className="ui-ch-slots ui-in-left" role="radiogroup" aria-label="Ô bùa">
        {levels.map((lv, i) => {
          const c = inst.charmIds?.[i] ? EXPEDITION_CHARMS_BY_ID[inst.charmIds[i]] : undefined;
          return (
            <button key={i} type="button" role="radio" aria-checked={slot === i} disabled={i >= open}
              className={`ui-diamond-slot ${slot === i ? 'on' : ''} ${i >= open ? 'locked' : ''}`} onClick={() => setSlot(i)}
              style={c ? { borderColor: CHARM_RARITY_COLORS[c.rarity] } : undefined}>
              <span>{i >= open ? `Cấp ${lv}` : c ? <CharmIcon id={c.charmId} /> : 'Trống'}</span>
            </button>
          );
        })}
      </div>
      {shown && (
        <aside className="ui-ch-detail ui-in-bottom" key={shown.charmId}>
          <b style={{ color: CHARM_RARITY_COLORS[shown.rarity] }}><CharmIcon id={shown.charmId} />{shown.nameVi}</b>
          <small>{CHARM_RARITY_LABELS_VI[shown.rarity]} · Bậc {profile.charms?.[shown.charmId]?.rank ?? 1}</small>
          <p>{shown.descVi}</p>
          {charmSummary(shown, profile.charms?.[shown.charmId]?.rank ?? 1) && <em>{charmSummary(shown, profile.charms?.[shown.charmId]?.rank ?? 1)}</em>}
          {current === shown.charmId && <button type="button" className="ui-plate small dim" disabled={busy} onClick={() => equip(null)}><span>Tháo bùa</span></button>}
        </aside>
      )}
      <div className="ui-ov-right ui-in-right"><StatPanel profile={profile} heroId={heroId} /></div>
      <div className="ui-foot"><Keys items={[['Chuột', 'Chọn ô rồi chọn bùa'], ['Esc', 'Quay lại']]} /></div>
    </>
  );
}

// ------------------------------------------------------------------ skills

function SkillsSub({ profile, heroId, socket, run, setProfile, busy }: SubProps) {
  const def = EXPEDITION_HEROES_BY_ID[heroId];
  const inst = profile.heroes[heroId];
  const learned = unlockedSkillIds(def, inst.level);
  const combat = heroCombatSkillIds(def);
  const equipped = configuredSkillIds(def, inst, learned);
  // chỉ liệt kê kỹ năng đã lĩnh hội; kỹ năng chưa mở nằm trong Cây kỹ năng
  const all = [def.skillIds[0], ...combat, def.skillIds[4]].filter((id) => learned.includes(id));
  const [picked, setPick] = useState(all[1] ?? all[0]);
  const pick = all.includes(picked) ? picked : all[0];
  const skill = EXPEDITION_SKILLS_BY_ID[pick];
  const lv = inst.skillLevels[pick] ?? 1;
  const cost = skillUpgradeCost(lv);
  const capped = lv >= skillLevelCap(inst.level) || lv >= EXP_BALANCE.skills.maxLevel;
  const isLearned = learned.includes(pick);
  const toggle = (id: string) => {
    const next = equipped.includes(id) ? equipped.filter((v) => v !== id) : [...equipped, id];
    if (next.length > 6) return;
    void run(() => expeditionApi.upgradeHero(socket, { heroId, kind: 'loadout', skillIds: next }), setProfile);
  };
  return (
    <>
      <section className="ui-sk-list ui-in-left">
        <header><h2>Kỹ năng</h2><small>Đã gắn {equipped.length}/6</small></header>
        <div className="ui-scroll">
          {all.map((id) => {
            const s = EXPEDITION_SKILLS_BY_ID[id];
            const ok = learned.includes(id);
            const on = equipped.includes(id);
            return (
              <button key={id} type="button" className={`ui-plate wide ${pick === id ? 'on' : ''} ${ok ? '' : 'locked'}`}
                onMouseEnter={() => setPick(id)} onFocus={() => setPick(id)} onClick={() => { setPick(id); if (ok && combat.includes(id)) toggle(id); }}>
                <SkillGlyph skill={s} />
                <span className="val">{s.nameVi}</span>
                <span className="num">{ok ? (combat.includes(id) ? (on ? '◆' : '◇') : SLOT_VI[s.slotKind]) : `Cấp ${skillUnlockLevel(def, id)}`}</span>
              </button>
            );
          })}
        </div>
      </section>
      {skill && (
        <aside className="ui-sk-detail ui-in-right" key={pick}>
          <small className="kind">{SLOT_VI[skill.slotKind]} · {ELEMENT_LABELS_VI[skill.element]}</small>
          <h2>{skill.nameVi}</h2>
          <div className="ui-sk-meta">
            <span><small>AP</small><b>{skill.apCost > 0 ? skill.apCost : `+${skill.apGain}`}</b></span>
            <span><small>Mục tiêu</small><b>{SCOPE_VI[skill.targetScope]}</b></span>
            <span><small>Số đòn</small><b>{skill.hits.length}</b></span>
            <span><small>Cấp</small><b>{lv}/{EXP_BALANCE.skills.maxLevel}</b></span>
          </div>
          <p>{skill.summaryVi}</p>
          {isLearned ? (
            <div className="ui-sk-actions">
              {combat.includes(pick) && (
                <button type="button" className="ui-plate" disabled={busy || (!equipped.includes(pick) && equipped.length >= 6)} onClick={() => toggle(pick)}>
                  <span>{equipped.includes(pick) ? 'Tháo khỏi bộ kỹ năng' : 'Gắn vào bộ kỹ năng'}</span>
                </button>
              )}
              {cost && !capped ? (
                <button type="button" className="ui-plate" disabled={busy}
                  onClick={() => void run(() => expeditionApi.upgradeHero(socket, { heroId, kind: 'skill', skillId: pick }), setProfile)}>
                  <span>Nâng cấp · {cost.expCrystal}⬢{cost.starlight ? ` ${cost.starlight}✦` : ''}{cost.seal ? ` ${cost.seal}◈` : ''}</span>
                </button>
              ) : (
                <small className="ui-note">{lv >= EXP_BALANCE.skills.maxLevel ? 'Đã đạt cấp tối đa.' : `Cần nhân vật cấp ${lv * EXP_BALANCE.skills.levelPerSkillRank} để nâng tiếp.`}</small>
              )}
            </div>
          ) : (
            <small className="ui-note">Mở khóa ở cấp {skillUnlockLevel(def, pick)}.</small>
          )}
        </aside>
      )}
      <div className="ui-foot"><Keys items={[['Rê chuột', 'Xem'], ['Bấm', 'Gắn / tháo'], ['Esc', 'Quay lại']]} /></div>
    </>
  );
}

// ------------------------------------------------------------------ skill tree

function TreeSub(props: SubProps) {
  return (
    <>
      <section className="ui-tree-wrap ui-in-left">
        <SkillTreeGraph profile={props.profile} heroId={props.heroId} socket={props.socket} run={props.run} setProfile={props.setProfile} busy={props.busy} />
      </section>
      <div className="ui-foot"><Keys items={[['Chuột', 'Chọn nút'], ['Esc', 'Quay lại']]} /></div>
    </>
  );
}

// ------------------------------------------------------------------ gear

function ItemStats({ item, level }: { item: ItemInstance; level: number }) {
  return (
    <ul className="ui-item-stats">
      {item.main && <li className="main">{STAT_SHORT_VI[item.main.stat]} <b>+{formatStatValue(item.main.stat, itemStatValue(item, item.main, level))}</b></li>}
      {item.subs.map((s, i) => <li key={i}>{STAT_SHORT_VI[s.stat]} <b>+{formatStatValue(s.stat, itemStatValue(item, s, level))}</b></li>)}
      {item.elixir && <li className="main">Vĩnh viễn {STAT_SHORT_VI[item.elixir.stat]} <b>+{formatStatValue(item.elixir.stat, item.elixir.value)}</b></li>}
    </ul>
  );
}

function GearSub({ profile, heroId, socket, run, setProfile, busy }: SubProps) {
  const inst = profile.heroes[heroId];
  const [slot, setSlot] = useState<EquipSlot>('weapon');
  const [hover, setHover] = useState<string>();
  const equippedUid = inst.equipment?.[slot];
  const equipped = profile.inventory?.find((x) => x.uid === equippedUid);
  const options = (profile.inventory ?? [])
    .filter((x) => x.kind === 'equipment' && x.slot === slot && x.uid !== equippedUid && (!x.signatureId || x.signatureId === heroId))
    .sort((a, b) => ITEM_RARITIES.indexOf(b.rarity) - ITEM_RARITIES.indexOf(a.rarity) || b.ilvl - a.ilvl);
  const shown = options.find((x) => x.uid === hover) ?? equipped;
  const refineCost = shown && weaponRefineCost(shown);
  return (
    <>
      <section className="ui-gear-slots ui-in-left">
        <header><h2>Trang bị</h2></header>
        {EQUIP_SLOTS.map((s) => {
          const it = profile.inventory?.find((x) => x.uid === inst.equipment?.[s]);
          return (
            <button key={s} type="button" className={`ui-plate wide ${slot === s ? 'on' : ''}`} onClick={() => setSlot(s)}>
              <span className="lbl">{EQUIP_SLOT_LABELS_VI[s]}</span>
              {it && <WeaponIcon item={it} />}
              {it ? <EquipmentName item={it} className="val" /> : <span className="val">—</span>}
            </button>
          );
        })}
      </section>
      <section className="ui-gear-list ui-in-bottom" key={slot}>
        <header><h3>{EQUIP_SLOT_LABELS_VI[slot]} trong túi</h3><small>{options.length}</small></header>
        <div className="ui-scroll">
          {options.map((it) => (
            <button key={it.uid} type="button" className="ui-plate wide" disabled={busy}
              onMouseEnter={() => setHover(it.uid)} onMouseLeave={() => setHover(undefined)}
              onClick={() => void run(() => expeditionApi.equipItem(socket, heroId, slot, it.uid), setProfile)}>
              <WeaponIcon item={it} />
              <EquipmentName item={it} className="val" />
              <span className="num">{it.equippedBy ? <OwnerTag heroId={it.equippedBy} self={it.equippedBy === heroId} /> : `i${it.ilvl}`}</span>
            </button>
          ))}
          {!options.length && <p className="ui-empty">Không có {EQUIP_SLOT_LABELS_VI[slot].toLowerCase()} nào khác. Đánh Gác Cổng, Đại Trùm hoặc mở Rương Thiên Văn.</p>}
        </div>
      </section>
      <aside className={`ui-gear-detail ui-in-right${isMythicWeapon(shown) ? ' exp-foil-surface exp-foil-mythic' : ''}`}>
        {shown ? (
          <>
            <small className="kind">{shown === equipped ? 'Đang trang bị' : 'Xem trước'} · {ITEM_RARITY_LABELS_VI[shown.rarity]} · i{shown.ilvl}</small>
            <h2><WeaponIcon item={shown} /><EquipmentName item={shown} />{shown.enhance ? <span className="enh-lv"> +{shown.enhance}</span> : null}</h2>
            <ItemStats item={shown} level={inst.level} />
            {shown.signatureId && <small>Trấn · Tinh luyện {shown.refineRank ?? 1}/5 · {shown.weaponShards ?? 0} mảnh</small>}
            {refineCost && (
              <button type="button" className="ui-plate small ui-refine" disabled={busy || (shown.weaponShards ?? 0) < refineCost}
                onClick={() => void run(() => expeditionApi.refineWeapon(socket, shown.uid, shown.refineRank ?? 1), setProfile)}>
                <span>Tinh luyện · {refineCost} mảnh</span>
              </button>
            )}
            <EnhancePanel item={shown} profile={profile} busy={busy}
              onEnhance={() => void run(() => expeditionApi.enhanceItem(socket, shown.uid, shown.enhance ?? 0), setProfile)} />
            {shown === equipped && (
              <button type="button" className="ui-plate small dim" disabled={busy}
                onClick={() => void run(() => expeditionApi.equipItem(socket, heroId, slot, null), setProfile)}><span>Tháo ra</span></button>
            )}
          </>
        ) : <p className="ui-empty">Ô {EQUIP_SLOT_LABELS_VI[slot].toLowerCase()} đang trống.</p>}
      </aside>
      <div className="ui-foot"><Keys items={[['Chuột', 'Chọn ô / trang bị'], ['Esc', 'Quay lại']]} /></div>
    </>
  );
}

// ------------------------------------------------------------------ pages

export function PageShell({ title, children, onBack, resources }: { title: string; children: ReactNode; onBack: () => void; resources?: ExpeditionProfile }) {
  return (
    <div className="ui-page">
      <header className="ui-page-head ui-in-left">
        <button type="button" className="ui-back" onClick={onBack} aria-label="Quay lại">‹</button>
        <h1>{title}</h1>
        {resources && <Currency profile={resources} />}
      </header>
      <div className="ui-page-body ui-in-bottom">{children}</div>
      <div className="ui-foot"><Keys items={[['Esc', 'Quay lại']]} /></div>
    </div>
  );
}
