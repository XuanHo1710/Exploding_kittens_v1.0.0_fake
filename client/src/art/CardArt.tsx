import { Box, Crown, Heart, Sparkles, Zap, type LucideProps } from 'lucide-react';
import type { CardType } from '../../../shared/src';
import { CardIcon } from '../components/icons';

const CAT_BADGES: Partial<Record<CardType, React.ComponentType<LucideProps>>> = {
  cat_potato: Sparkles,
  cat_melon: Heart,
  cat_bladder: Zap,
  cat_schrodinger: Box,
  cat_beard: Crown,
};

/** Biểu tượng vector trên mặt lá bài sử dụng icon React chuẩn (lucide-react) */
export default function CardArt({ type }: { type: CardType }) {
  const SubBadge = CAT_BADGES[type];
  return (
    <div className="card-art card-art-icon" aria-hidden="true">
      <CardIcon type={type} className="card-art-main-svg" strokeWidth={2} />
      {SubBadge && (
        <span className="card-art-sub">
          <SubBadge className="card-art-sub-svg" strokeWidth={2.2} />
        </span>
      )}
    </div>
  );
}
