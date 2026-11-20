/**
 * Concise 0.45s Pixel Portrait Cut-In Banner displayed top-left on Awakening Ultimate
 * without freezing Co-op teammates.
 */
import { MK_STATIC_ROOT, type MkUltCutInEvent } from '../../../../shared/src';

export interface MkUltCutInProps {
  cutIn?: MkUltCutInEvent & { expiresAt: number };
}

export function MkUltCutIn({ cutIn }: MkUltCutInProps) {
  if (!cutIn) return null;
  return (
    <div
      className="mk-ult-cutin"
      style={{ borderColor: cutIn.accentColor }}
      aria-live="polite"
    >
      <img
        src={`${MK_STATIC_ROOT}/portraits/${cutIn.heroId}.png`}
        alt={cutIn.heroName}
        className="mk-ult-cutin-img mk-pixel"
      />
      <div className="mk-ult-cutin-text">
        <span className="mk-ult-cutin-tag">AWAKENING ULTIMATE</span>
        <strong className="mk-ult-cutin-skill" style={{ color: cutIn.accentColor }}>
          {cutIn.skillNameVi}
        </strong>
        <span className="mk-ult-cutin-hero">{cutIn.heroName}</span>
      </div>
    </div>
  );
}
