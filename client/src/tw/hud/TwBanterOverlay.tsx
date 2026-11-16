import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react';
import {
  TW_CLASSES,
  TW_FACTIONS,
  TW_GENERALS,
  type TwBanterEvent,
  type TwGeneralId,
  type TwSideSummary,
} from '../../../../shared/src/tw';

export interface TwBanterOverlayProps {
  banter: TwBanterEvent | null;
  sides: TwSideSummary[];
}

const INK_PLAQUE_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, rgba(10, 12, 14, 0.74), rgba(10, 12, 14, 0.88)), url('/database-total-war/ui/ink_plaque.png')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
};

function makeFallbackBustSvg(label: string, accent: string): string {
  const safe = encodeURIComponent(label.slice(0, 2));
  const safeColor = encodeURIComponent(accent);
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="120" viewBox="0 0 96 120"><rect width="96" height="120" rx="6" fill="%23181a1c" stroke="${safeColor}" stroke-width="3"/><circle cx="48" cy="42" r="20" fill="${safeColor}" fill-opacity="0.32"/><path d="M18 112c4-26 18-40 30-40s26 14 30 40" fill="${safeColor}" fill-opacity="0.45"/><text x="48" y="49" text-anchor="middle" font-family="serif" font-size="18" font-weight="bold" fill="%23f2ece1">${safe}</text></svg>`;
}

interface BanterCardProps {
  sidePos: 'left' | 'right';
  generalId: TwGeneralId;
  ownerIdx: number;
  line: string;
  sides: TwSideSummary[];
  leaving: boolean;
}

function BanterSpeakerCard({
  sidePos,
  generalId,
  ownerIdx,
  line,
  sides,
  leaving,
}: BanterCardProps) {
  const gen = TW_GENERALS[generalId] ?? TW_GENERALS.cao_cao;
  const cls = TW_CLASSES[gen.class];
  const sideInfo = sides.find((s) => s.idx === ownerIdx) ?? sides[ownerIdx];
  const factionSpec = TW_FACTIONS[sideInfo?.faction ?? gen.faction];
  const portraitSrc = gen.cardPortrait || `/database-total-war/portraits/${generalId}_card.png`;

  const handleImgError = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    img.src = makeFallbackBustSvg(factionSpec.emblemText, cls.color);
  };

  return (
    <div
      className={`tw-banter-card ${sidePos}${leaving ? ' leaving' : ''}`}
      style={sidePos === 'right' ? { animationDelay: '110ms' } : undefined}
    >
      <img
        className={`tw-banter-portrait${sidePos === 'right' ? ' flip' : ''}`}
        src={portraitSrc}
        alt={`${gen.vnName} (${gen.enName})`}
        draggable={false}
        onError={handleImgError}
      />
      <div className="tw-banter-box" style={INK_PLAQUE_STYLE}>
        <div className="tw-banter-header">
          <span>
            {gen.vnName.toUpperCase()} · {gen.enName.toUpperCase()}
          </span>
          <span className="tw-banter-role">
            <span style={{ color: sideInfo?.color ?? factionSpec.color, marginRight: 3 }}>
              {factionSpec.emblemText}
            </span>
            {cls.element} · {cls.vnName}
          </span>
        </div>
        <div className="tw-banter-quote">&ldquo;{line}&rdquo;</div>
      </div>
    </div>
  );
}

export function TwBanterOverlay({ banter, sides }: TwBanterOverlayProps) {
  const [displayed, setDisplayed] = useState<TwBanterEvent | null>(banter);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (banter) {
      setDisplayed(banter);
      setLeaving(false);
      return;
    }
    if (!displayed) return;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setDisplayed(null);
      setLeaving(false);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [banter, displayed]);

  const active = banter ?? displayed;
  if (!active) return null;

  return (
    <div className="tw-banter-layer" aria-live="polite">
      <BanterSpeakerCard
        key={`left-${active.id}-${active.leftGeneral}`}
        sidePos="left"
        generalId={active.leftGeneral}
        ownerIdx={active.leftOwnerIdx}
        line={active.leftLine}
        sides={sides}
        leaving={!banter && leaving}
      />
      <BanterSpeakerCard
        key={`right-${active.id}-${active.rightGeneral}`}
        sidePos="right"
        generalId={active.rightGeneral}
        ownerIdx={active.rightOwnerIdx}
        line={active.rightLine}
        sides={sides}
        leaving={!banter && leaving}
      />
    </div>
  );
}

export default TwBanterOverlay;
