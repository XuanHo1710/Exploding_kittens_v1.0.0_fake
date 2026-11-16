import { useMemo, useState, type CSSProperties, type SyntheticEvent } from 'react';
import {
  TW_CLASSES,
  TW_DEPLOYABLES,
  TW_DEPLOYABLE_KINDS,
  TW_FORMATIONS,
  TW_FORMATION_IDS,
  TW_GENERALS,
  TW_UNITS,
  twPointInTerrainZone,
  twVeterancyBonuses,
  type TwCommand,
  type TwDeployableKind,
  type TwFatigueState,
  type TwFormation,
  type TwGeneralClass,
  type TwMapSpec,
  type TwMoraleState,
  type TwRegimentFrame,
  type TwSideSummary,
  type TwUnitCategory,
} from '../../../../shared/src/tw';

export interface TwRetinueHudProps {
  mapSpec: TwMapSpec;
  mySide?: TwSideSummary;
  myRegiments: TwRegimentFrame[];
  enemyGenerals: TwRegimentFrame[];
  selectedIds: Set<number>;
  hoveredReg: TwRegimentFrame | null;
  showTacticalDots: boolean;
  showTrajectories: boolean;
  romanceMode: boolean;
  activeDeployableKind?: TwDeployableKind | null;
  onSelectDeployableKind?: (kind: TwDeployableKind | null) => void;
  onSelectRegiment: (id: number, multi: boolean, selectSameKind?: boolean) => void;
  onSelectAll: () => void;
  onFocusRegiment: (reg: TwRegimentFrame) => void;
  onCommand: (cmd: TwCommand) => void;
  onToggleDots: () => void;
  onToggleTrajectories: () => void;
}

const PLAQUE_INK_STYLE: CSSProperties = {
  backgroundImage:
    "radial-gradient(130% 100% at 0% 0%, rgba(36, 33, 27, 0.9), rgba(10, 12, 14, 0.96)), url('/database-total-war/ui/ink_plaque.png')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

const WUXING_KEY_BY_CLASS: Record<TwGeneralClass, 'fire' | 'wood' | 'metal' | 'earth' | 'water'> = {
  vanguard: 'fire',
  champion: 'wood',
  sentinel: 'metal',
  commander: 'earth',
  strategist: 'water',
};

const CATEGORY_META: Record<
  TwUnitCategory,
  { vn: string; en: string; glyph: string; accent: string }
> = {
  infantry_polearm: { vn: 'Trường Thương', en: 'Polearm Infantry', glyph: '🔱', accent: '#37b24d' },
  infantry_sword: { vn: 'Đao Kiếm Khiên', en: 'Melee Infantry', glyph: '🗡️', accent: '#9c6ade' },
  ranged_bow: { vn: 'Cung Thủ', en: 'Bow Infantry', glyph: '🏹', accent: '#339af0' },
  ranged_crossbow: { vn: 'Nỏ Binh', en: 'Crossbow Infantry', glyph: '🎯', accent: '#228be6' },
  artillery: { vn: 'Pháo Công Thành', en: 'Siege Artillery', glyph: '☄️', accent: '#1c7ed6' },
  cavalry_shock: { vn: 'Xung Kỵ', en: 'Shock Cavalry', glyph: '🐎', accent: '#e03131' },
  cavalry_melee: { vn: 'Chiến Kỵ', en: 'Melee Cavalry', glyph: '🛡️', accent: '#d4af37' },
};

const FORMATION_GLYPH: Record<TwFormation, string> = {
  line: '═',
  shieldwall: '▤',
  spearwall: 'Ψ',
  wedge: '▲',
  circle: '◯',
  loose: '∷',
};

const MORALE_META: Record<TwMoraleState, { label: string; tone: 'good' | 'warn' | 'bad' | '' }> = {
  eager: { label: 'Hăng Hái', tone: 'good' },
  steady: { label: 'Vững Vàng', tone: 'good' },
  wavering: { label: 'Dao Động', tone: 'warn' },
  routing: { label: 'Tháo Chạy', tone: 'bad' },
  shattered: { label: 'Tan Vỡ', tone: 'bad' },
};

const FATIGUE_META: Record<TwFatigueState, { label: string; tone: 'good' | 'warn' | 'bad' | '' }> = {
  fresh: { label: 'Sung Sức', tone: 'good' },
  active: { label: 'Đang Chiến', tone: '' },
  winded: { label: 'Thấm Mệt', tone: 'warn' },
  exhausted: { label: 'Kiệt Sức', tone: 'bad' },
};

function isRegimentAlive(reg: TwRegimentFrame): boolean {
  return reg.men > 0 && reg.hp > 0 && reg.anim !== 'dead' && reg.moraleState !== 'shattered';
}

function isRegimentWiped(reg: TwRegimentFrame): boolean {
  return reg.men <= 0 || reg.hp <= 0 || reg.anim === 'dead';
}

function hpFillColor(pct: number): string {
  if (pct < 35) return '#e03131';
  if (pct < 68) return '#f59f00';
  return '#37b24d';
}

function makeCardFallbackSvg(label: string, accent: string): string {
  const safeText = encodeURIComponent(label.slice(0, 3));
  const safeAccent = encodeURIComponent(accent);
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="92" height="152" viewBox="0 0 92 152"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%23ebe4d4"/><stop offset="70%" stop-color="%23cfc2a6"/><stop offset="100%" stop-color="%23181a1c"/></linearGradient></defs><rect width="92" height="152" fill="url(%23g)"/><circle cx="46" cy="54" r="24" fill="${safeAccent}" fill-opacity="0.22" stroke="${safeAccent}" stroke-width="2"/><text x="46" y="61" text-anchor="middle" font-family="serif" font-size="18" font-weight="bold" fill="%23222">${safeText}</text></svg>`;
}

const DEPLOYABLE_SHORT_VN: Record<TwDeployableKind, string> = {
  stakes: 'Chông Gỗ',
  caltrops: 'Chông Sắt',
  oil: 'Dầu Hỏa',
};

interface VeterancyInfo {
  rank: number;
  tier: 'bronze' | 'silver' | 'gold';
  vnTier: 'Đồng' | 'Bạc' | 'Vàng';
  color: '#cd7f32' | '#dee2e6' | '#ffd43b';
  bars: 1 | 2 | 3;
}

function getVeterancyInfo(rankRaw?: number): VeterancyInfo | null {
  const rank = Math.max(0, Math.min(9, Math.floor(Number(rankRaw) || 0)));
  if (rank <= 0) return null;
  if (rank <= 3) {
    return {
      rank,
      tier: 'bronze',
      vnTier: 'Đồng',
      color: '#cd7f32',
      bars: rank as 1 | 2 | 3,
    };
  }
  if (rank <= 6) {
    return {
      rank,
      tier: 'silver',
      vnTier: 'Bạc',
      color: '#dee2e6',
      bars: (rank - 3) as 1 | 2 | 3,
    };
  }
  return {
    rank,
    tier: 'gold',
    vnTier: 'Vàng',
    color: '#ffd43b',
    bars: (rank - 6) as 1 | 2 | 3,
  };
}

function getGuanxiPill(
  state?: 'harmony' | 'enraged' | 'rival',
): { label: string; tip: string; cls: 'harmony' | 'enraged' | 'rival' } | null {
  if (state === 'enraged') {
    return {
      label: '🔥 Cuồng Nộ',
      tip: 'Quan Hệ Huynh Đệ Báo Thù: Cuồng nộ tăng mạnh Công kích & khó tan vỡ sĩ khí!',
      cls: 'enraged',
    };
  }
  if (state === 'harmony') {
    return {
      label: '🤝 Đồng Tâm',
      tip: 'Quan Hệ Đồng Tâm Hiệp Lực: Cộng hưởng sĩ khí & phòng ngự khi chiến đấu kề vai!',
      cls: 'harmony',
    };
  }
  if (state === 'rival') {
    return {
      label: '⚡ Kình Địch',
      tip: 'Quan Hệ Kình Địch Truyền Kiếp: Bùng nổ sát thương khi đối đầu tử địch!',
      cls: 'rival',
    };
  }
  return null;
}

function renderVeterancyChevrons(info: VeterancyInfo, unitCard = false) {
  const w = unitCard ? 11 : 13;
  const h = unitCard ? 11 : 13;
  const paths: string[] = [];
  if (info.bars === 1) {
    paths.push('M2.2 7.8L6.5 4L10.8 7.8');
  } else if (info.bars === 2) {
    paths.push('M2.2 6.2L6.5 2.5L10.8 6.2');
    paths.push('M2.2 9.8L6.5 6.1L10.8 9.8');
  } else {
    paths.push('M2.2 5.0L6.5 1.5L10.8 5.0');
    paths.push('M2.2 8.0L6.5 4.5L10.8 8.0');
    paths.push('M2.2 11.0L6.5 7.5L10.8 11.0');
  }
  const bonus = twVeterancyBonuses(info.rank);
  return (
    <span
      className={`tw-vet-chevrons ${info.tier}${unitCard ? ' unit' : ''}`}
      style={{ color: info.color }}
      title={`Tinh Nhuệ Cấp ${info.rank} (${info.vnTier}) · +${bonus.meleeAtkAdd} Công, +${bonus.meleeDefAdd} Thủ, +${bonus.moraleAdd} Sĩ khí`}
    >
      <svg width={w} height={h} viewBox="0 0 13 13" fill="none" aria-hidden="true">
        {paths.map((d, idx) => (
          <path
            key={idx}
            d={d}
            stroke={info.color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </span>
  );
}

export function TwRetinueHud({
  mapSpec,
  mySide,
  myRegiments,
  enemyGenerals,
  selectedIds,
  hoveredReg,
  showTacticalDots,
  showTrajectories,
  romanceMode,
  activeDeployableKind = null,
  onSelectDeployableKind,
  onSelectRegiment,
  onSelectAll,
  onFocusRegiment,
  onCommand,
  onToggleDots,
  onToggleTrajectories,
}: TwRetinueHudProps) {
  const [localHoverId, setLocalHoverId] = useState<number | null>(null);
  const [duelHoverOpen, setDuelHoverOpen] = useState(false);

  const { generals, retinue, generalColorBySlot, aliveRegimentCount, aliveHeadcount } = useMemo(() => {
    const gens: TwRegimentFrame[] = [];
    const ret: TwRegimentFrame[] = [];
    let regAlive = 0;
    let totalSoldiers = 0;

    for (const r of myRegiments) {
      if (!isRegimentWiped(r)) {
        regAlive += 1;
        totalSoldiers += Math.max(0, r.men);
      }
      if (r.isGeneral) gens.push(r);
      else ret.push(r);
    }

    gens.sort((a, b) => a.generalSlot - b.generalSlot || a.id - b.id);
    ret.sort((a, b) => a.generalSlot - b.generalSlot || a.id - b.id);

    const slotColors: Record<number, string> = {};
    for (const g of gens) {
      const spec = g.generalId ? TW_GENERALS[g.generalId] : undefined;
      slotColors[g.generalSlot] = spec ? TW_CLASSES[spec.class].color : '#d4af37';
    }

    return {
      generals: gens,
      retinue: ret,
      generalColorBySlot: slotColors,
      aliveRegimentCount: myRegiments.length > 0 ? regAlive : (mySide?.regimentsAlive ?? 0),
      aliveHeadcount: myRegiments.length > 0 ? totalSoldiers : (mySide?.totalMen ?? 0),
    };
  }, [myRegiments, mySide]);

  const livingMyRegs = useMemo(
    () => myRegiments.filter((r) => !isRegimentWiped(r)),
    [myRegiments],
  );

  const selectedLivingRegs = useMemo(
    () => livingMyRegs.filter((r) => selectedIds.has(r.id)),
    [livingMyRegs, selectedIds],
  );

  const selectedRangedRegs = useMemo(
    () =>
      selectedLivingRegs.filter(
        (r) => !r.isGeneral && (r.maxAmmo > 0 || (TW_UNITS[r.kind]?.range ?? 0) > 0),
      ),
    [selectedLivingRegs],
  );

  const selectedSkirmishRegs = useMemo(
    () =>
      selectedRangedRegs.filter((r) => TW_UNITS[r.kind]?.category !== 'artillery'),
    [selectedRangedRegs],
  );

  const selectedBowRegs = useMemo(
    () =>
      selectedLivingRegs.filter(
        (r) => !r.isGeneral && TW_UNITS[r.kind]?.category === 'ranged_bow',
      ),
    [selectedLivingRegs],
  );

  const selectedGenerals = useMemo(
    () =>
      selectedLivingRegs.filter(
        (r) => r.isGeneral && r.generalId && Boolean(TW_GENERALS[r.generalId]),
      ),
    [selectedLivingRegs],
  );

  const primarySelectedGeneral = useMemo(() => {
    if (selectedGenerals.length === 0) return null;
    return (
      selectedGenerals.find((g) => (g.skillCooldownLeft ?? 0) <= 0.05) ??
      selectedGenerals[0]
    );
  }, [selectedGenerals]);

  const aliveEnemyGenerals = useMemo(
    () => enemyGenerals.filter((eg) => isRegimentAlive(eg)),
    [enemyGenerals],
  );

  const duelTargets = useMemo(() => {
    if (!primarySelectedGeneral) return [];
    const myGenSpec = primarySelectedGeneral.generalId
      ? TW_GENERALS[primarySelectedGeneral.generalId]
      : undefined;
    if (myGenSpec?.class === 'strategist') return [];
    return [...aliveEnemyGenerals]
      .filter((eg) => {
        const egSpec = eg.generalId ? TW_GENERALS[eg.generalId] : undefined;
        return egSpec?.class !== 'strategist';
      })
      .sort((a, b) => {
        const da = Math.hypot(a.x - primarySelectedGeneral.x, a.y - primarySelectedGeneral.y);
        const db = Math.hypot(b.x - primarySelectedGeneral.x, b.y - primarySelectedGeneral.y);
        return da - db;
      });
  }, [aliveEnemyGenerals, primarySelectedGeneral]);

  const inspectedReg = useMemo(() => {
    if (localHoverId !== null) {
      const hit = myRegiments.find((r) => r.id === localHoverId);
      if (hit) return hit;
    }
    if (hoveredReg) return hoveredReg;
    if (primarySelectedGeneral) return primarySelectedGeneral;
    return selectedLivingRegs[0] ?? null;
  }, [localHoverId, myRegiments, hoveredReg, primarySelectedGeneral, selectedLivingRegs]);

  const inspectedTerrains = useMemo(() => {
    if (!inspectedReg) return [];
    const notes: Array<{ key: string; text: string; tone: 'terrain' | 'warn' }> = [];
    let hasForest = inspectedReg.inForest;
    let hasRidge = inspectedReg.onHighGround;
    let hasRiver = false;
    let hasMud = false;

    for (const z of mapSpec.terrainZones) {
      if (!twPointInTerrainZone(inspectedReg.x, inspectedReg.y, z)) continue;
      if (z.kind === 'forest') hasForest = true;
      else if (z.kind === 'ridge') hasRidge = true;
      else if (z.kind === 'river') hasRiver = true;
      else if (z.kind === 'mud') hasMud = true;
    }

    if (hasForest) {
      notes.push({
        key: 'forest',
        text: inspectedReg.hidden
          ? '🌲 Rừng Thông: Đang ẩn nấp & +45% chắn tên'
          : '🌲 Rừng Thông: Ẩn nấp & +45% chắn tên',
        tone: 'terrain',
      });
    }
    if (hasRidge) {
      notes.push({
        key: 'ridge',
        text: '⛰️ Đồi Cao: +20% tầm bắn & +25% xung kích',
        tone: 'terrain',
      });
    }
    if (hasRiver) {
      notes.push({
        key: 'river',
        text: '🌊 Sông Cạn: -45% tốc chạy, -20% thủ cận chiến & giảm xung kích',
        tone: 'warn',
      });
    }
    if (hasMud) {
      notes.push({
        key: 'mud',
        text: '💧 Đầm Lầy: -30% tốc chạy (-44% kỵ binh) & giảm xung kích',
        tone: 'warn',
      });
    }
    return notes;
  }, [inspectedReg, mapSpec.terrainZones]);

  const castGeneralSkill = (genReg: TwRegimentFrame) => {
    if (!genReg.generalId) return;
    const spec = TW_GENERALS[genReg.generalId];
    if (!spec) return;
    if ((genReg.skillCooldownLeft ?? 0) > 0.05 || isRegimentWiped(genReg)) return;

    let targetX = Math.round(genReg.x);
    let targetY = Math.round(genReg.y);
    let targetRegId: number | undefined;

    if (spec.skill.effectKind === 'fire_volley') {
      if (genReg.lockedTargetId !== undefined) {
        targetRegId = genReg.lockedTargetId;
      } else if (aliveEnemyGenerals.length > 0) {
        const nearest = [...aliveEnemyGenerals].sort(
          (a, b) =>
            Math.hypot(a.x - genReg.x, a.y - genReg.y) -
            Math.hypot(b.x - genReg.x, b.y - genReg.y),
        )[0];
        targetX = Math.round(nearest.x);
        targetY = Math.round(nearest.y);
        targetRegId = nearest.id;
      } else {
        targetX = Math.round(genReg.x + Math.cos(genReg.facing) * 260);
        targetY = Math.round(genReg.y + Math.sin(genReg.facing) * 260);
      }
    }

    onCommand({
      t: 'use_skill',
      generalRegId: genReg.id,
      targetX,
      targetY,
      targetRegId,
    });
  };

  const challengeDuelTarget = (enemyGenReg: TwRegimentFrame) => {
    if (!primarySelectedGeneral || !romanceMode) return;
    onCommand({
      t: 'challenge_duel',
      generalRegId: primarySelectedGeneral.id,
      targetGeneralRegId: enemyGenReg.id,
    });
    setDuelHoverOpen(false);
  };

  const allArmySelected =
    livingMyRegs.length > 0 && livingMyRegs.every((r) => selectedIds.has(r.id));
  const isGuardOn =
    selectedLivingRegs.length > 0 && selectedLivingRegs.every((r) => r.guardMode);
  const isFireAtWillOn =
    selectedRangedRegs.length > 0 && selectedRangedRegs.every((r) => r.fireAtWill);
  const isSkirmishOn =
    selectedSkirmishRegs.length > 0 && selectedSkirmishRegs.every((r) => r.skirmishMode);
  const isFireArrowsOn =
    selectedBowRegs.length > 0 && selectedBowRegs.every((r) => Boolean(r.fireArrows));

  const selectedIdsArray = selectedLivingRegs.map((r) => r.id);
  const selectedRangedIdsArray = selectedRangedRegs.map((r) => r.id);
  const selectedSkirmishIdsArray = selectedSkirmishRegs.map((r) => r.id);
  const selectedBowIdsArray = selectedBowRegs.map((r) => r.id);

  const activeGenSpec =
    primarySelectedGeneral?.generalId ? TW_GENERALS[primarySelectedGeneral.generalId] : undefined;
  const activeGenCd = Math.max(0, primarySelectedGeneral?.skillCooldownLeft ?? 0);
  const activeGenSkillReady = Boolean(activeGenSpec) && activeGenCd <= 0.05;
  const activeGenWuXing = activeGenSpec ? WUXING_KEY_BY_CLASS[activeGenSpec.class] : 'earth';

  const nonDuelingEnemyTargets = duelTargets.filter((eg) => eg.anim !== 'duel');
  const preferredDuelTarget = nonDuelingEnemyTargets[0] ?? duelTargets[0] ?? null;

  return (
    <div className="tw-hud-bottom-left">
      {/* 1. Compact Unit Hover / Selected Inspector Bar */}
      {inspectedReg && (() => {
        const uSpec = TW_UNITS[inspectedReg.kind] ?? TW_UNITS.ji_militia;
        const gSpec =
          inspectedReg.isGeneral && inspectedReg.generalId
            ? TW_GENERALS[inspectedReg.generalId]
            : undefined;
        const gClass = gSpec ? TW_CLASSES[gSpec.class] : undefined;
        const catMeta = CATEGORY_META[uSpec.category];
        const fSpec = TW_FORMATIONS[inspectedReg.formation];
        const moraleInfo = MORALE_META[inspectedReg.moraleState];
        const fatigueInfo = FATIGUE_META[inspectedReg.fatigue];
        const hpPct = Math.max(
          0,
          Math.min(100, Math.round((inspectedReg.hp / Math.max(1, inspectedReg.maxHp)) * 100)),
        );
        const isEnemy = mySide !== undefined && inspectedReg.ownerIdx !== mySide.idx;
        const effAtk = gSpec ? gSpec.meleeAtk : uSpec.meleeAtk;
        const effDef = (gSpec ? gSpec.meleeDef : uSpec.meleeDef) + fSpec.meleeDefAdd;
        const effCharge = Math.round(
          (gSpec ? gSpec.chargeBonus : uSpec.chargeBonus) * fSpec.chargeMul,
        );
        const effArmor = gSpec ? gSpec.armor : uSpec.armor;
        const maxAmmoVal = inspectedReg.isGeneral
          ? 0
          : Math.max(inspectedReg.maxAmmo, uSpec.maxAmmo);

        return (
          <div className="tw-unit-inspector">
            <div className="tw-inspector-head">
              {isEnemy && <span className="tw-stat-chip bad">Địch Quân</span>}
              <span className="tw-inspector-name">
                {gSpec
                  ? `${gSpec.vnName} · ${gSpec.enName}`
                  : `${uSpec.vnName} · ${uSpec.enName}`}
              </span>
              <span className="tw-inspector-class">
                {gClass
                  ? `${gClass.element} · ${gClass.vnName} (${gClass.enName})`
                  : `${catMeta.vn} · ${catMeta.en}`}
              </span>
            </div>

            <div className="tw-inspector-stats">
              <span className={`tw-stat-chip ${hpPct < 35 ? 'bad' : hpPct < 68 ? 'warn' : 'good'}`}>
                {gSpec && romanceMode ? (
                  <>
                    ❤️ <b>{Math.ceil(inspectedReg.hp)}</b>/{inspectedReg.maxHp}
                  </>
                ) : (
                  <>
                    👥 <b>{inspectedReg.men}</b>/{inspectedReg.maxMen} · ❤️ <b>{hpPct}%</b>
                  </>
                )}
              </span>

              <span className={`tw-stat-chip ${moraleInfo.tone}`}>
                🚩 {moraleInfo.label} <b>({Math.round(inspectedReg.morale)})</b>
              </span>

              <span className={`tw-stat-chip ${fatigueInfo.tone}`}>
                ⚡ {fatigueInfo.label}
              </span>

              <span className="tw-stat-chip">
                ⚔️ Công <b>{effAtk}</b> · 🛡️ Thủ <b>{Math.max(1, effDef)}</b>
              </span>

              <span className="tw-stat-chip">
                🐎 Xung <b>{effCharge}</b>
                {!gSpec && uSpec.antiCavalryBonus > 0 ? (
                  <>
                    {' '}
                    · 🔱 Khắc kỵ <b>+{uSpec.antiCavalryBonus}</b>
                  </>
                ) : null}
              </span>

              <span className="tw-stat-chip">
                🥋 Giáp <b>{effArmor}%</b>
                {!gSpec && uSpec.shieldMissileBlock + fSpec.missileBlockAdd > 0 ? (
                  <>
                    {' '}
                    · Khiên <b>{Math.min(90, uSpec.shieldMissileBlock + fSpec.missileBlockAdd)}%</b>
                  </>
                ) : null}
              </span>

              {maxAmmoVal > 0 && (
                <span
                  className={`tw-stat-chip ${
                    inspectedReg.ammo <= 0
                      ? 'bad'
                      : inspectedReg.ammo <= Math.ceil(maxAmmoVal * 0.25)
                        ? 'warn'
                        : ''
                  }`}
                >
                  🏹 Đạn <b>{inspectedReg.ammo}</b>/{maxAmmoVal}
                </span>
              )}

              <span className="tw-stat-chip">
                📐 {fSpec.vnName}
              </span>

              {(() => {
                const vet = getVeterancyInfo(inspectedReg.rank);
                if (!vet) return null;
                const vBonus = twVeterancyBonuses(vet.rank);
                return (
                  <span
                    className="tw-stat-chip warn"
                    style={{ borderColor: `${vet.color}88`, color: vet.color }}
                  >
                    🏅 Cấp <b>{vet.rank}</b> ({vet.vnTier} +{vBonus.meleeAtkAdd}⚔️/+{vBonus.meleeDefAdd}🛡️)
                  </span>
                );
              })()}

              {(() => {
                const gx = getGuanxiPill(inspectedReg.guanxiState);
                if (!gx) return null;
                return (
                  <span
                    className={`tw-stat-chip ${
                      gx.cls === 'harmony' ? 'good' : gx.cls === 'enraged' ? 'bad' : 'warn'
                    }`}
                  >
                    {gx.label}
                  </span>
                );
              })()}

              {uSpec.category === 'ranged_bow' && inspectedReg.fireArrows && (
                <span className="tw-stat-chip warn">🔥 Tên Lửa</span>
              )}

              {inspectedReg.burning && (
                <span className="tw-stat-chip bad">🔥 Đang Bốc Cháy</span>
              )}

              {inspectedTerrains.map((t) => (
                <span key={t.key} className={`tw-stat-chip ${t.tone}`}>
                  {t.text}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 2. Circular Tactical Command Strip perched along the top rim */}
      <div className="tw-order-strip" role="toolbar" aria-label="Lệnh Chiến Thuật">
        <button
          type="button"
          className={`tw-order-circle${allArmySelected ? ' on' : ''}`}
          disabled={livingMyRegs.length === 0}
          onClick={onSelectAll}
          title="Chọn Toàn Quân · Select All Army (Ctrl+A)"
        >
          <span aria-hidden="true">🚩</span>
          <kbd style={{ fontSize: '7.5px', padding: '1px 2px' }}>Ctrl+A</kbd>
        </button>

        <button
          type="button"
          className="tw-order-circle"
          disabled={selectedIdsArray.length === 0}
          onClick={() => onCommand({ t: 'halt', regIds: selectedIdsArray })}
          title="Dừng Quân Giữ Nguyên Trận Địa · Halt (H)"
        >
          <span aria-hidden="true">✋</span>
          <kbd>H</kbd>
        </button>

        <button
          type="button"
          className={`tw-order-circle${isGuardOn ? ' on' : ''}`}
          disabled={selectedIdsArray.length === 0}
          onClick={() =>
            onCommand({
              t: 'toggle_stance',
              regIds: selectedIdsArray,
              stance: 'guard',
              value: !isGuardOn,
            })
          }
          title="Chế Độ Phòng Thủ (Giữ Tuyến Không Truy Kích) · Guard Mode (G)"
        >
          <span aria-hidden="true">🛡️</span>
          <kbd>G</kbd>
        </button>

        <button
          type="button"
          className={`tw-order-circle${isFireAtWillOn ? ' on' : ''}`}
          disabled={selectedRangedIdsArray.length === 0}
          onClick={() =>
            onCommand({
              t: 'toggle_stance',
              regIds: selectedRangedIdsArray,
              stance: 'fire_at_will',
              value: !isFireAtWillOn,
            })
          }
          title="Tự Do Xạ Kích · Fire-at-Will (F)"
        >
          <span aria-hidden="true">🎯</span>
          <kbd>F</kbd>
        </button>

        <button
          type="button"
          className={`tw-order-circle${isSkirmishOn ? ' on' : ''}`}
          disabled={selectedSkirmishIdsArray.length === 0}
          onClick={() =>
            onCommand({
              t: 'toggle_stance',
              regIds: selectedSkirmishIdsArray,
              stance: 'skirmish',
              value: !isSkirmishOn,
            })
          }
          title="Du Kích Giữ Khoảng Cách An Toàn · Skirmish Mode (K)"
        >
          <span aria-hidden="true">🏇</span>
          <kbd>K</kbd>
        </button>

        {selectedBowRegs.length > 0 && (
          <button
            type="button"
            className={`tw-order-pill fire-arrow${isFireArrowsOn ? ' on' : ''}`}
            onClick={() =>
              onCommand({
                t: 'toggle_fire_arrows',
                regIds: selectedBowIdsArray,
                value: !isFireArrowsOn,
              })
            }
            title={`🔥 Tên Lửa (${isFireArrowsOn ? 'Đang BẬT' : 'Đang TẮT'}) — Châm lửa đốt Rừng Thông, kích nổ Bẫy Dầu & uy hiếp sĩ khí địch (Phím R)`}
          >
            <span aria-hidden="true">🔥</span>
            <span className="tw-order-pill-txt">Tên Lửa</span>
            <kbd>R</kbd>
          </button>
        )}

        <span className="tw-order-sep" aria-hidden="true" />

        {/* 6 Formation Circular Buttons */}
        {TW_FORMATION_IDS.map((fmt) => {
          const fSpec = TW_FORMATIONS[fmt];
          const compatibleRegs = selectedLivingRegs.filter((r) => {
            const allowed: readonly string[] = r.isGeneral
              ? ['line']
              : TW_UNITS[r.kind]?.allowedFormations ?? ['line', 'loose'];
            return allowed.includes(fmt);
          });
          const enabled = compatibleRegs.length > 0;
          const active = enabled && compatibleRegs.every((r) => r.formation === fmt);

          return (
            <button
              key={fmt}
              type="button"
              className={`tw-order-circle${active ? ' on' : ''}`}
              disabled={!enabled}
              onClick={() =>
                onCommand({
                  t: 'set_formation',
                  regIds: compatibleRegs.map((r) => r.id),
                  formation: fmt,
                })
              }
              title={`${fSpec.vnName} (${fSpec.enName}) — ${fSpec.desc}`}
            >
              <img
                src={`/database-total-war/ui/fmt_${fmt}.png`}
                alt={fSpec.vnName}
                style={{ width: 20, height: 20, objectFit: 'contain', pointerEvents: 'none' }}
                onError={(e: SyntheticEvent<HTMLImageElement>) => {
                  e.currentTarget.style.display = 'none';
                  const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                  if (next) next.style.display = 'inline';
                }}
              />
              <span style={{ display: 'none', fontSize: 13, fontWeight: 800 }}>
                {FORMATION_GLYPH[fmt]}
              </span>
            </button>
          );
        })}

        {/* Battlefield Deployables (Wooden Stakes, Iron Caltrops, Oil Traps) */}
        {mySide && mySide.alive && onSelectDeployableKind && (
          <>
            <span className="tw-order-sep" aria-hidden="true" />
            {TW_DEPLOYABLE_KINDS.map((kind) => {
              const dSpec = TW_DEPLOYABLES[kind];
              const left = Math.max(0, mySide.deployablesLeft?.[kind] ?? 0);
              const isAct = activeDeployableKind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  className={`tw-order-pill deploy${isAct ? ' on' : ''}`}
                  disabled={left <= 0}
                  onClick={() => onSelectDeployableKind(isAct ? null : kind)}
                  title={`${dSpec.glyph} ${dSpec.vnName} (${dSpec.enName}) · Còn ${left} lượt đặt\n${dSpec.desc}\nNhấp chọn rồi nhấp chuột trái lên mặt đất để đặt bẫy (Giữ Shift để đặt liên tiếp, Chuột phải / Esc để hủy)`}
                >
                  <span aria-hidden="true">{dSpec.glyph}</span>
                  <span className="tw-order-pill-txt">{DEPLOYABLE_SHORT_VN[kind]}</span>
                  <span className={`tw-deploy-count${left <= 0 ? ' empty' : ''}`}>{left}</span>
                </button>
              );
            })}
          </>
        )}

        {/* Challenge General Duel & Active Wu Xing Skill when a Friendly General is selected */}
        {primarySelectedGeneral && (
          <>
            <span className="tw-order-sep" aria-hidden="true" />

            {aliveEnemyGenerals.length > 0 && (
              <div
                style={{ position: 'relative', display: 'inline-flex' }}
                onMouseEnter={() => setDuelHoverOpen(true)}
                onMouseLeave={() => setDuelHoverOpen(false)}
              >
                <button
                  type="button"
                  className={`tw-order-circle duel${
                    primarySelectedGeneral.anim === 'duel' ? ' on' : ''
                  }`}
                  disabled={
                    !romanceMode ||
                    primarySelectedGeneral.anim === 'duel' ||
                    !preferredDuelTarget ||
                    preferredDuelTarget.anim === 'duel'
                  }
                  onClick={() => {
                    if (preferredDuelTarget) challengeDuelTarget(preferredDuelTarget);
                  }}
                  title={
                    !romanceMode
                      ? '⚔️ Đơn Đấu (Chỉ mở trong Chế độ Diễn Nghĩa · Romance Mode)'
                      : preferredDuelTarget?.generalId
                        ? `⚔️ Đơn Đấu (V) — Khiêu chiến ${
                            TW_GENERALS[preferredDuelTarget.generalId]?.vnName ?? 'Tướng Địch'
                          }`
                        : '⚔️ Đơn Đấu · Challenge General Duel (V)'
                  }
                >
                  <span aria-hidden="true">⚔️</span>
                  <kbd>V</kbd>
                </button>

                {romanceMode &&
                  duelHoverOpen &&
                  primarySelectedGeneral.anim !== 'duel' &&
                  nonDuelingEnemyTargets.length > 1 && (
                    <div className="tw-formation-pop">
                      {nonDuelingEnemyTargets.map((eg) => {
                        const egSpec = eg.generalId ? TW_GENERALS[eg.generalId] : undefined;
                        return (
                          <button
                            key={eg.id}
                            type="button"
                            className="tw-order-circle duel"
                            onClick={() => challengeDuelTarget(eg)}
                            title={
                              egSpec
                                ? `Khiêu chiến ${egSpec.vnName} (${egSpec.enName}) · Uy vũ ${egSpec.duelPower}`
                                : 'Khiêu chiến Tướng Địch'
                            }
                          >
                            {egSpec ? (
                              <img
                                src={egSpec.tokenPortrait}
                                alt={egSpec.vnName}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                }}
                                onError={(e: SyntheticEvent<HTMLImageElement>) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <span>⚔️</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>
            )}

            {activeGenSpec && (
              <button
                type="button"
                className={`tw-order-circle ${activeGenWuXing}${activeGenSkillReady ? ' on' : ''}`}
                disabled={!activeGenSkillReady}
                onClick={() => castGeneralSkill(primarySelectedGeneral)}
                title={`✨ Tuyệt Kỹ: ${activeGenSpec.skill.vnName} (${activeGenSpec.skill.enName}) — ${
                  activeGenSkillReady
                    ? `${activeGenSpec.skill.desc} (Phím Q)`
                    : `Đang hồi chiêu: ${Math.ceil(activeGenCd)}s`
                }`}
              >
                <span aria-hidden="true">✨</span>
                {!activeGenSkillReady && (
                  <span className="tw-order-cd">{Math.ceil(activeGenCd)}s</span>
                )}
                <kbd>Q</kbd>
              </button>
            )}
          </>
        )}

        <span className="tw-order-sep" aria-hidden="true" />

        {/* Tactical Dots & Red Trajectory Lines Toggles */}
        <button
          type="button"
          className={`tw-order-circle${showTacticalDots ? ' on' : ''}`}
          onClick={onToggleDots}
          title="Bật/Tắt Chấm Quân Số Chiến Thuật · Tactical Dots"
        >
          <span style={{ fontSize: 18, fontWeight: 900, lineHeight: 1 }} aria-hidden="true">
            •
          </span>
        </button>

        <button
          type="button"
          className={`tw-order-circle${showTrajectories ? ' on' : ''}`}
          onClick={onToggleTrajectories}
          title="Bật/Tắt Đường Đạn Đỏ Tầm Xa · Red Trajectory Lines"
        >
          <span aria-hidden="true">🏹</span>
        </button>
      </div>

      {/* 3. Main Retinue Tray */}
      <div className="tw-retinue-tray">
        {/* 3a. Left Ink-Wash Battle Plaque */}
        <div className="tw-battle-plaque" style={PLAQUE_INK_STYLE}>
          <div>
            <div className="tw-plaque-title" title={mapSpec.enName}>
              {mapSpec.enName}
            </div>
            <div className="tw-plaque-sub" title={mapSpec.vnName}>
              {mapSpec.vnName}
            </div>
          </div>

          <div className="tw-plaque-counts">
            <div className="tw-plaque-regiments">
              <span>
                ⚔️ <b>{aliveRegimentCount}</b>
              </span>
              <span>·</span>
              <span>Trung đoàn</span>
            </div>
            <div className="tw-plaque-troops">
              👥 {aliveHeadcount.toLocaleString('en-US')}
            </div>
          </div>

          <div className="tw-plaque-season" title={`${mapSpec.seasonYear} (${mapSpec.vnSeasonYear})`}>
            <span>
              🍂 {mapSpec.seasonYear} ({mapSpec.vnSeasonYear})
            </span>
          </div>
        </div>

        {/* 3b. 3 Tall General Portrait Cards */}
        <div className="tw-general-cards">
          {generals.map((g) => {
            const gSpec = g.generalId ? TW_GENERALS[g.generalId] : undefined;
            const cls = gSpec ? TW_CLASSES[gSpec.class] : TW_CLASSES.commander;
            const wiped = isRegimentWiped(g);
            const selected = selectedIds.has(g.id);
            const dueling = g.anim === 'duel' && !wiped;
            const routing =
              !wiped &&
              (g.moraleState === 'routing' || g.moraleState === 'shattered' || g.anim === 'rout');
            const wavering = !wiped && !routing && g.moraleState === 'wavering';
            const hpPct = Math.max(
              0,
              Math.min(100, Math.round((g.hp / Math.max(1, g.maxHp)) * 100)),
            );
            const moralePct = Math.max(0, Math.min(100, Math.round(g.morale)));
            const cd = Math.max(0, g.skillCooldownLeft ?? 0);
            const skillReady = !wiped && cd <= 0.05;
            const portraitSrc =
              gSpec?.cardPortrait ??
              `/database-total-war/portraits/${g.generalId ?? 'cao_cao'}_card.png`;

            const cardClasses = [
              'tw-general-card',
              selected ? 'selected' : '',
              dueling ? 'dueling' : '',
              wavering ? 'wavering' : '',
              routing ? 'routing' : '',
              wiped ? 'wiped' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={g.id}
                role="button"
                tabIndex={wiped ? -1 : 0}
                className={cardClasses}
                onMouseEnter={() => setLocalHoverId(g.id)}
                onMouseLeave={() => setLocalHoverId((prev) => (prev === g.id ? null : prev))}
                onClick={(e) => {
                  if (wiped) return;
                  onSelectRegiment(g.id, e.shiftKey || e.ctrlKey || e.metaKey, false);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onFocusRegiment(g);
                }}
                onKeyDown={(e) => {
                  if (wiped) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectRegiment(g.id, e.shiftKey || e.ctrlKey || e.metaKey, false);
                  }
                }}
                title={
                  gSpec
                    ? `${gSpec.vnName} (${gSpec.enName}) — Hệ ${cls.element} (${cls.vnName})\nNhấp: Chọn tướng · Nhấp đúp: Đưa máy quay tới tướng`
                    : 'Tướng Quân'
                }
              >
                <img
                  className="tw-general-img"
                  src={portraitSrc}
                  alt={gSpec?.vnName ?? 'Tướng Quân'}
                  draggable={false}
                  onError={(e: SyntheticEvent<HTMLImageElement>) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback === '1') return;
                    img.dataset.fallback = '1';
                    img.src = makeCardFallbackSvg(cls.element, cls.color);
                  }}
                />

                <span
                  className={`tw-wuxing-dot ${gSpec?.class ?? 'commander'}`}
                  title={`Ngũ Hành: ${cls.element} · ${cls.vnName} (${cls.enName})`}
                />

                {(() => {
                  const vetInfo = !wiped ? getVeterancyInfo(g.rank) : null;
                  return vetInfo ? renderVeterancyChevrons(vetInfo, false) : null;
                })()}

                {(() => {
                  const gx = !wiped ? getGuanxiPill(g.guanxiState) : null;
                  if (!gx) return null;
                  return (
                    <span className={`tw-guanxi-pill ${gx.cls}`} title={gx.tip}>
                      {gx.label}
                    </span>
                  );
                })()}

                {dueling && (
                  <span className="tw-general-duel-ico" title="Đang Đơn Đấu!">
                    ⚔️
                  </span>
                )}

                {gSpec && !wiped && (
                  <button
                    type="button"
                    className="tw-general-skill"
                    disabled={!skillReady}
                    onClick={(e) => {
                      e.stopPropagation();
                      castGeneralSkill(g);
                    }}
                    title={`${gSpec.skill.vnName} (${gSpec.skill.enName}) — ${
                      skillReady ? 'Sẵn sàng thi triển!' : `Hồi chiêu: ${Math.ceil(cd)}s`
                    }`}
                  >
                    {skillReady ? '✨' : <span style={{ fontSize: 8.5, fontWeight: 800 }}>{Math.ceil(cd)}</span>}
                  </button>
                )}

                <div className="tw-general-foot">
                  <div className="tw-general-name">
                    {gSpec ? gSpec.vnName : `Tướng ${g.generalSlot + 1}`}
                  </div>
                  <div className={`tw-general-hp${hpPct < 35 ? ' low' : ''}`}>
                    <i
                      style={{
                        width: `${hpPct}%`,
                        background: hpFillColor(hpPct),
                      }}
                    />
                  </div>
                  <div
                    className={`tw-unit-morale${
                      routing ? ' routing' : wavering ? ' wavering' : ''
                    }`}
                  >
                    <i style={{ width: `${moralePct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3c. 2-Row Tall Retinue Unit Cards Grid */}
        <div className="tw-unit-grid">
          {retinue.map((r) => {
            const uSpec = TW_UNITS[r.kind] ?? TW_UNITS.ji_militia;
            const catMeta = CATEGORY_META[uSpec.category];
            const wiped = isRegimentWiped(r);
            const selected = selectedIds.has(r.id);
            const routing =
              !wiped &&
              (r.moraleState === 'routing' || r.moraleState === 'shattered' || r.anim === 'rout');
            const wavering = !wiped && !routing && r.moraleState === 'wavering';
            const hpPct = Math.max(
              0,
              Math.min(100, Math.round((r.hp / Math.max(1, r.maxHp)) * 100)),
            );
            const moralePct = Math.max(0, Math.min(100, Math.round(r.morale)));
            const maxAmmoVal = Math.max(r.maxAmmo, uSpec.maxAmmo);
            const ammoPct =
              maxAmmoVal > 0
                ? Math.max(0, Math.min(100, Math.round((r.ammo / maxAmmoVal) * 100)))
                : 0;
            const slotAccent = generalColorBySlot[r.generalSlot] ?? '#d4af37';

            const statusIcons: Array<{ key: string; ico: string; tip: string }> = [];
            if (!wiped) {
              if (routing) {
                statusIcons.push({ key: 'rout', ico: '🏳️', tip: 'Đang tháo chạy!' });
              } else {
                if (r.hidden || r.inForest) {
                  statusIcons.push({
                    key: 'hidden',
                    ico: '👁️',
                    tip: r.hidden ? 'Đang ẩn nấp phục kích trong rừng' : 'Đang trong Rừng Thông',
                  });
                }
                if (r.anim === 'shoot') {
                  statusIcons.push({ key: 'shoot', ico: '🏹', tip: 'Đang xạ kích' });
                } else if (r.anim === 'attack' || r.anim === 'charge') {
                  statusIcons.push({ key: 'melee', ico: '⚔️', tip: 'Đang giao chiến cận chiến' });
                } else if (
                  r.anim === 'brace' ||
                  r.formation === 'spearwall' ||
                  r.formation === 'shieldwall' ||
                  r.formation === 'circle'
                ) {
                  statusIcons.push({ key: 'brace', ico: '🛡️', tip: 'Đang dựng trận phòng ngự' });
                }
              }
            }

            const unitClasses = [
              'tw-unit-card',
              selected ? 'selected' : '',
              wavering ? 'wavering' : '',
              routing ? 'routing' : '',
              wiped ? 'wiped' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={r.id}
                type="button"
                className={unitClasses}
                style={{ borderTopColor: selected ? undefined : slotAccent }}
                onMouseEnter={() => setLocalHoverId(r.id)}
                onMouseLeave={() => setLocalHoverId((prev) => (prev === r.id ? null : prev))}
                onClick={(e) => {
                  if (wiped) return;
                  onSelectRegiment(r.id, e.shiftKey || e.ctrlKey || e.metaKey, false);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (wiped) return;
                  onSelectRegiment(r.id, e.shiftKey || e.ctrlKey || e.metaKey, true);
                }}
                title={`${uSpec.vnName} (${uSpec.enName}) — Quân số: ${r.men}/${r.maxMen}\nNhấp: Chọn trung đoàn · Nhấp đúp: Chọn toàn bộ ${uSpec.vnName}`}
              >
                <img
                  className="tw-unit-img"
                  src={`/database-total-war/units/${r.kind}.png`}
                  alt={uSpec.vnName}
                  draggable={false}
                  onError={(e: SyntheticEvent<HTMLImageElement>) => {
                    const img = e.currentTarget;
                    if (img.dataset.fallback === '1') return;
                    img.dataset.fallback = '1';
                    img.src = makeCardFallbackSvg(catMeta.glyph, catMeta.accent);
                  }}
                />

                <span
                  className="tw-unit-group"
                  style={{ borderColor: slotAccent }}
                  title={`Bộ tùy Tướng số ${r.generalSlot + 1}`}
                >
                  {r.generalSlot + 1}
                </span>

                {(() => {
                  const vetInfo = !wiped ? getVeterancyInfo(r.rank) : null;
                  return vetInfo ? renderVeterancyChevrons(vetInfo, true) : null;
                })()}

                {(() => {
                  const gx = !wiped ? getGuanxiPill(r.guanxiState) : null;
                  if (!gx) return null;
                  return (
                    <span className={`tw-guanxi-pill unit ${gx.cls}`} title={gx.tip}>
                      {gx.label}
                    </span>
                  );
                })()}

                {!wiped && uSpec.category === 'ranged_bow' && r.fireArrows && (
                  <span
                    className="tw-fire-arrow-tag"
                    title="Đang bật Tên Lửa: Châm lửa thiêu rừng thông, kích nổ Bẫy Dầu & khủng bố sĩ khí"
                  >
                    🔥 Tên Lửa
                  </span>
                )}

                {statusIcons.length > 0 && (
                  <div className="tw-unit-status">
                    {statusIcons.slice(0, 2).map((s) => (
                      <span key={s.key} className="tw-status-ico" title={s.tip}>
                        {s.ico}
                      </span>
                    ))}
                  </div>
                )}

                {maxAmmoVal > 0 && !wiped && (
                  <div
                    className={`tw-unit-ammo${ammoPct <= 25 ? ' low' : ''}`}
                    title={`Tên đạn: ${r.ammo}/${maxAmmoVal}`}
                  >
                    <i
                      style={{
                        height: `${ammoPct}%`,
                        background:
                          ammoPct <= 20
                            ? '#ff6b6b'
                            : 'linear-gradient(180deg, #ffe066, #d4af37)',
                      }}
                    />
                  </div>
                )}

                <div className="tw-unit-foot">
                  <div className={`tw-unit-hp${hpPct < 35 ? ' low' : ''}`}>
                    <i
                      style={{
                        width: `${hpPct}%`,
                        background: hpFillColor(hpPct),
                      }}
                    />
                  </div>
                  <div
                    className={`tw-unit-morale${
                      routing ? ' routing' : wavering ? ' wavering' : ''
                    }`}
                  >
                    <i style={{ width: `${moralePct}%` }} />
                  </div>
                  <div className="tw-unit-meta">
                    <span className="tw-unit-cat" title={catMeta.vn}>
                      <img
                        src={`/database-total-war/ui/cls_${uSpec.category}.png`}
                        alt={catMeta.vn}
                        style={{
                          width: 10,
                          height: 10,
                          objectFit: 'contain',
                          verticalAlign: 'middle',
                        }}
                        onError={(e: SyntheticEvent<HTMLImageElement>) => {
                          e.currentTarget.style.display = 'none';
                          const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = 'inline';
                        }}
                      />
                      <span style={{ display: 'none' }}>{catMeta.glyph}</span>
                    </span>
                    <span className="tw-unit-count">{Math.max(0, r.men)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TwRetinueHud;
