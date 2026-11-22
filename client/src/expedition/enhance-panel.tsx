/**
 * Khung cường hoá trang bị: cấp +N/15, thanh mốc phá giới hạn (+7 / +10 / +15), buff đã mở / sắp mở,
 * chi phí (Ấn Tinh Tú, Tinh Thể EXP, nguyên liệu theo chương) và nút cường hoá.
 */

import {
  ENHANCE_MAX,
  LIMIT_BREAKS,
  LIMIT_BREAK_FX,
  MATERIALS,
  enhanceCost,
  enhanceMultiplier,
  type ExpeditionProfile,
  type ItemInstance,
  type MaterialId,
} from './shared';

export function MaterialChip({ id, have, need }: { id: MaterialId; have?: number; need?: number }) {
  const m = MATERIALS[id];
  const short = need !== undefined && (have ?? 0) < need;
  return (
    <span className={`mat-chip ${short ? 'short' : ''}`} title={m.descVi} style={{ ['--mat' as string]: m.color }}>
      <i aria-hidden="true" />
      {m.nameVi}
      <b>{need !== undefined ? `${have ?? 0}/${need}` : `×${have ?? 0}`}</b>
    </span>
  );
}

export function EnhancePanel({ item, profile, busy, onEnhance }: {
  item: ItemInstance; profile: ExpeditionProfile; busy: boolean; onEnhance: () => void;
}) {
  if (item.kind !== 'equipment') return null;
  const lv = item.enhance ?? 0;
  const cost = enhanceCost(item);
  const slot = item.slot === 'armor' ? 'armor' : 'weapon';
  const mats = profile.materials ?? {};
  const enoughMats = cost ? Object.entries(cost.mats).every(([id, n]) => (mats[id] ?? 0) >= (n ?? 0)) : false;
  const can = Boolean(cost) && profile.astralSeal >= (cost?.seal ?? 0) && profile.expCrystal >= (cost?.crystal ?? 0) && enoughMats;
  const nextBreak = LIMIT_BREAKS.find((b) => b > lv);
  return (
    <section className="enh-panel" aria-label="Cường hoá">
      <header>
        <b>Cường hoá +{lv}<small>/{ENHANCE_MAX}</small></b>
        <span>Chỉ số ×{enhanceMultiplier(lv).toFixed(2)}</span>
      </header>
      <ol className="enh-track" aria-hidden="true">
        {Array.from({ length: ENHANCE_MAX }, (_, i) => i + 1).map((n) => (
          <li key={n} className={`${n <= lv ? 'on' : ''} ${(LIMIT_BREAKS as readonly number[]).includes(n) ? 'brk' : ''}`}>{(LIMIT_BREAKS as readonly number[]).includes(n) ? n : ''}</li>
        ))}
      </ol>
      {(slot === 'weapon' || slot === 'armor') && (
        <ul className="enh-breaks">
          {LIMIT_BREAKS.map((b) => (
            <li key={b} className={lv >= b ? 'on' : ''}>
              <em>+{b}</em>
              {LIMIT_BREAK_FX[slot][b].map((f) => <span key={f.key}><b>{f.nameVi}</b> {f.descVi}</span>)}
            </li>
          ))}
        </ul>
      )}
      {cost ? (
        <>
          <div className="enh-cost">
            <span className={profile.astralSeal < cost.seal ? 'short' : ''}>{cost.seal} Ấn</span>
            <span className={profile.expCrystal < cost.crystal ? 'short' : ''}>{cost.crystal} ⬢</span>
            {(Object.entries(cost.mats) as [MaterialId, number][]).map(([id, n]) => <MaterialChip key={id} id={id} have={mats[id]} need={n} />)}
          </div>
          {nextBreak && lv + 1 === nextBreak && <p className="enh-note">Lần cường hoá này PHÁ GIỚI HẠN +{nextBreak}: chỉ số tăng vọt và mở buff mới trong trận.</p>}
          <button type="button" className="ui-plate small ui-enhance" disabled={busy || !can} onClick={onEnhance}>
            <span>{lv + 1 === nextBreak ? `Phá giới hạn +${lv + 1}` : `Cường hoá +${lv + 1}`}</span>
          </button>
        </>
      ) : <small className="enh-max">Đã cường hoá tối đa +{ENHANCE_MAX}</small>}
    </section>
  );
}
