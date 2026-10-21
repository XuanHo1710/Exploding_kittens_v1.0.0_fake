import type { CSSProperties } from 'react';
import type { PlayingCard } from '../../../shared/src';

interface Props {
  card?: PlayingCard;
  faceDown?: boolean;
  count?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  selected?: boolean;
  disabled?: boolean;
  /** Viền sáng "đánh được". Mặc định: có onClick là sáng */
  playable?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}

export default function PlayingCardView({
  card,
  faceDown = false,
  count,
  size = 'md',
  selected = false,
  disabled = false,
  playable,
  className = '',
  style,
  onClick,
}: Props) {
  const cls = [
    'card',
    'playing-card',
    `card-${size}`,
    selected && 'selected',
    (playable ?? (!!onClick && !disabled)) && 'playable',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (faceDown || !card) {
    return (
      <div className={cls} style={style}>
        <img className="card-photo" src="/playing-cards/Back.svg" alt="Mặt sau Bài Tây" draggable={false} />
        {count !== undefined && <span className="playing-deck-count">{count} lá</span>}
      </div>
    );
  }

  const content = (
    <>
      <img className="card-photo" src={card.image} alt={card.nameVi} draggable={false} />
      <span className={`card-photo-name playing-card-label ${card.color}`}>
        {card.rank}
        {card.suitSymbol} · {card.nameVi}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick} disabled={disabled} title={card.nameVi}>
        {content}
      </button>
    );
  }

  return (
    <div className={cls} style={style} title={card.nameVi}>
      {content}
    </div>
  );
}
