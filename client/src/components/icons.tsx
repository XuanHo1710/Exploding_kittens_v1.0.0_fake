import {
  Archive,
  ArrowDownToLine,
  ArrowUpDown,
  Ban,
  Bomb,
  Cat,
  Copy,
  Crosshair,
  Eye,
  FastForward,
  Flame,
  HandHeart,
  Layers,
  LayoutGrid,
  OctagonX,
  Pickaxe,
  Recycle,
  RefreshCcw,
  Share2,
  ShieldCheck,
  Shuffle,
  Skull,
  SkipForward,
  Sparkles,
  Swords,
  Target,
  WandSparkles,
  Zap,
  type LucideProps,
} from 'lucide-react';
import type { CardType, ShuffleStyle } from '../../../shared/src';

const CARD_ICONS: Record<CardType, React.ComponentType<LucideProps>> = {
  exploding: Bomb,
  defuse: ShieldCheck,
  attack: Swords,
  targeted_attack: Crosshair,
  personal_attack: Zap,
  skip: FastForward,
  super_skip: SkipForward,
  reverse: RefreshCcw,
  draw_bottom: ArrowDownToLine,
  catomic_bomb: Flame,
  swap_top_bottom: ArrowUpDown,
  bury: Archive,
  garbage_collection: Recycle,
  shuffle: Shuffle,
  see_future: Eye,
  alter_future: WandSparkles,
  share_future: Share2,
  dig_deeper: Pickaxe,
  favor: HandHeart,
  mark: Target,
  grave_robber: Skull,
  nope: Ban,
  super_nope: OctagonX,
  clone: Copy,
  feral_cat: Sparkles,
  cat_potato: Cat,
  cat_melon: Cat,
  cat_bladder: Cat,
  cat_schrodinger: Cat,
  cat_beard: Cat,
};

export function CardIcon({ type, size = 16, ...props }: { type: CardType } & Omit<LucideProps, 'type'>) {
  const Icon = CARD_ICONS[type] ?? Layers;
  return <Icon size={size} {...props} />;
}

const SHUFFLE_ICONS: Record<ShuffleStyle, React.ComponentType<LucideProps>> = {
  riffle: Layers,
  overhand: Shuffle,
  pile: LayoutGrid,
};

export function ShuffleIcon({ style, size = 16, ...props }: { style: ShuffleStyle } & Omit<LucideProps, 'style'>) {
  const Icon = SHUFFLE_ICONS[style] ?? Shuffle;
  return <Icon size={size} {...props} />;
}
