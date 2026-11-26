import { ITEM_RARITY_COLORS, type ItemInstance } from './shared';
import { expeditionAssetUrl } from './store';

const weaponFamilies: Readonly<Record<string, string>> = {
  'Steel Spear': 'field-4',
  'Dawnwind Bow': 'field-bow',
  'Prism Staff': 'field-staff',
  'Goldsand Blades': 'field-daggers',
  'Forge Axe': 'field-axe',
  'Moon Scythe': 'field-scythe',
};
const ordinaryBlade: Record<ItemInstance['rarity'], string> = {
  common: 'field-1', rare: 'field-2', epic: 'field-3', legendary: 'field-5', mythic: 'field-6',
};

export const signatureArtUrl = (heroId: string) => expeditionAssetUrl(`ui/weapons/${heroId}.png`);

export function isMythicWeapon(item: Pick<ItemInstance, 'slot' | 'rarity'> | undefined): boolean {
  return item?.slot === 'weapon' && item.rarity === 'mythic';
}

export function weaponArtUrl(item: ItemInstance): string | undefined {
  if (item.slot !== 'weapon') return undefined;
  const family = Object.entries(weaponFamilies).find(([name]) => item.nameVi.endsWith(name))?.[1];
  const key = item.signatureId ?? (family === 'field-4' && item.rarity === 'common' ? 'field-spear' : family) ?? ordinaryBlade[item.rarity];
  return signatureArtUrl(key);
}

export function WeaponIcon({ item }: { item: ItemInstance }) {
  const src = weaponArtUrl(item);
  const className = isMythicWeapon(item) ? 'exp-weapon-icon exp-foil-mythic' : 'exp-weapon-icon';
  return src ? <img className={className} src={src} alt="" draggable={false} /> : null;
}

export function EquipmentName({ item, className }: { item: ItemInstance; className?: string }) {
  if (isMythicWeapon(item)) {
    return <span className={['exp-foil-text', 'exp-foil-mythic', className].filter(Boolean).join(' ')}>{item.nameVi}</span>;
  }
  return <span className={className} style={{ color: ITEM_RARITY_COLORS[item.rarity] }}>{item.nameVi}</span>;
}
