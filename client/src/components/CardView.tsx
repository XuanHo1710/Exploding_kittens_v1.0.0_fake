import type { CSSProperties } from 'react';
import { CARD_INFO, type CardType } from '../../../shared/src';
import CardArt from '../art/CardArt';
import { cardImage } from '../cardImages';
import { useSettings } from '../settings';
import { usePreviewTrigger } from './CardPreview';

/** Nền tranh riêng cho vài lá (mặc định pha sáng từ màu lá) */
const PANEL: Partial<Record<CardType, string>> = {
  exploding: 'radial-gradient(circle at 50% 40%, #ffb05c, #d9480f 78%)',
  see_future: 'radial-gradient(circle at 50% 40%, #9775fa, #3b2a75 80%)',
  cat_schrodinger: 'radial-gradient(circle at 50% 40%, #74c0fc, #1864ab 85%)',
};

interface Props {
  type: CardType;
  /** Thường là id lá bài: chọn tranh biến thể (ảnh gốc) cố định cho lá đó */
  seed?: string | number;
  selected?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Giữ chuột / nhấn giữ để phóng to + xem giải thích (mặc định bật) */
  preview?: boolean;
  /** id lá trên tay để hiệu ứng bay tìm đúng phần tử */
  cid?: string;
}

export default function CardView({ type, seed, selected, size = 'md', onClick, className = '', style, preview = true, cid }: Props) {
  const info = CARD_INFO[type];
  const { cardStyle } = useSettings();
  const img = cardStyle === 'photo' ? cardImage(type, seed) : undefined;
  const Tag = onClick ? 'button' : 'div';
  const trigger = usePreviewTrigger(type, seed, preview);
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`card card-${size}${selected ? ' selected' : ''} ${className}`}
      style={{ ['--c' as string]: info.color, ['--panel' as string]: PANEL[type], ...style }}
      onClick={onClick}
      title={preview ? undefined : `${info.name}: ${info.desc}`}
      data-cid={cid}
      {...trigger}
    >
      {img ? (
        <>
          <img className="card-photo" src={img} alt={info.name} draggable={false} />
          <span className="card-photo-name">{info.name}</span>
        </>
      ) : (
        <span className="card-face">
          <span className="cf-title">{info.name}</span>
          <span className="cf-art">
            <CardArt type={type} />
          </span>
          <span className="cf-desc">{info.short}</span>
        </span>
      )}
    </Tag>
  );
}
