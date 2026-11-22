/**
 * Bestiary — quái nhỏ (units/monsters và thư mục tương thích units/animals) dùng cho:
 *  - đàn quái dạo chơi trên bản đồ (đánh lại được, rớt Bùa Hộ Mệnh),
 *  - lính hộ vệ đi kèm Quái Gác Cổng.
 * Chỉ phụ thuộc types + balance để catalog có thể import mà không vòng lặp.
 */

import { EXP_BALANCE } from './balance';
import type { ElementType, EnemyAiStyle, EnemyUnitTemplate, RealmMapId } from './types';

export interface MonsterDef {
  monsterId: string;
  nameVi: string;
  dir: 'monsters' | 'animals';
  element: ElementType;
  weakness: ElementType;
  style: EnemyAiStyle;
  /** hệ số HP / ATK / tốc độ so với chuẩn quái nhỏ của vùng */
  hp: number;
  atk: number;
  spd: number;
  attackNameVi: string;
}

const MD = (
  monsterId: string,
  nameVi: string,
  dir: MonsterDef['dir'],
  element: ElementType,
  weakness: ElementType,
  style: EnemyAiStyle,
  hp: number,
  atk: number,
  spd: number,
  attackNameVi: string,
): MonsterDef => ({ monsterId, nameVi, dir, element, weakness, style, hp, atk, spd, attackNameVi });

export const EXPEDITION_MONSTERS: readonly MonsterDef[] = [
  // Vùng I — Đồng Cỏ
  MD('verdant_slime', 'Emerald Slime', 'monsters', 'Verdant', 'Pyre', 'swarm', 0.85, 0.8, 0.9, 'Slime Spit'),
  MD('briar_goblin', 'Briar Goblin', 'monsters', 'Verdant', 'Pyre', 'skirmisher', 0.9, 1.05, 1.1, 'Thorn Knife Combo'),
  MD('wild_boar', 'Stonetusk Boar', 'animals', 'Verdant', 'Frost', 'brute', 1.25, 1.1, 0.85, 'Tusk Charge'),
  MD('red_fox', 'Fire Fox', 'animals', 'Pyre', 'Tide', 'beast', 0.8, 1.0, 1.25, 'Bite'),
  MD('rabbit', 'Windfang Hare', 'animals', 'Verdant', 'Pyre', 'swarm', 0.6, 0.7, 1.35, 'Wind Kick'),
  MD('chicken', 'Hook Cockatrice', 'animals', 'Verdant', 'Pyre', 'beast', 0.85, 0.92, 1.1, 'Thorn Peck'),
  MD('sheep', 'Moss Horn', 'animals', 'Verdant', 'Pyre', 'guardian', 1.04, 0.9, 0.92, 'Root Ram'),
  MD('highway_bandit', 'Highway Bandit', 'monsters', 'Pyre', 'Tide', 'skirmisher', 1.0, 1.1, 1.05, 'Bandit Slash'),
  // Vùng II — Đỉnh Tuyết
  MD('frost_wisp', 'Frost Wisp', 'monsters', 'Frost', 'Pyre', 'caster', 0.75, 1.15, 1.1, 'Frost Ray'),
  MD('yeti_brute', 'Yeti Brute', 'monsters', 'Frost', 'Pyre', 'brute', 1.4, 1.2, 0.8, 'Ice Slam'),
  MD('snow_owl', 'Snow Owl', 'animals', 'Verdant', 'Astral', 'skirmisher', 0.7, 0.95, 1.3, 'Wind Claw'),
  MD('mountain_goat', 'Mountain Goat', 'animals', 'Frost', 'Pyre', 'guardian', 1.15, 0.9, 1.0, 'Horn Ram'),
  // Vùng III — Sa Mạc
  MD('sand_wyrm', 'Sand Wyrm', 'monsters', 'Solar', 'Frost', 'brute', 1.35, 1.15, 0.85, 'Quicksand Gulp'),
  MD('tomb_mummy', 'Tomb Mummy', 'monsters', 'Astral', 'Solar', 'caster', 1.0, 1.05, 0.9, 'Wrap Curse'),
  MD('desert_camel', 'Desert Camel', 'animals', 'Solar', 'Tide', 'guardian', 1.25, 0.85, 0.95, 'Back Kick'),
  MD('venom_spider', 'Venom Spider', 'monsters', 'Verdant', 'Pyre', 'skirmisher', 0.85, 1.1, 1.2, 'Venom Fang'),
  // Vùng IV — Thủy Cung
  MD('lantern_jelly', 'Lantern Jelly', 'monsters', 'Tide', 'Verdant', 'caster', 0.8, 1.1, 1.05, 'Shock Tentacle'),
  MD('drowned_corsair', 'Drowned Corsair', 'monsters', 'Tide', 'Verdant', 'skirmisher', 1.05, 1.15, 1.05, 'Pirate Cutlass'),
  MD('reef_crab', 'Reef Crab', 'animals', 'Tide', 'Verdant', 'guardian', 1.3, 0.9, 0.85, 'Claw Pinch'),
  MD('sea_turtle', 'Ancient Sea Turtle', 'animals', 'Tide', 'Verdant', 'guardian', 1.5, 0.75, 0.75, 'Shell Slam'),
  // Vùng V — Núi Lửa
  MD('ember_imp', 'Ember Imp', 'monsters', 'Pyre', 'Tide', 'caster', 0.75, 1.2, 1.2, 'Fireball'),
  MD('lava_salamander', 'Lava Salamander', 'monsters', 'Pyre', 'Tide', 'beast', 1.1, 1.15, 1.05, 'Flame Tongue'),
  MD('cult_acolyte', 'Cult Acolyte', 'monsters', 'Astral', 'Solar', 'guardian', 1.0, 1.0, 1.0, 'Dark Rite'),
  MD('cow', 'Basalt Bull', 'animals', 'Pyre', 'Tide', 'brute', 1.18, 1.05, 0.85, 'Basalt Ram'),
  // Vùng VI — Đêm Huyền Ảo
  MD('dusk_bat', 'Dusk Bat', 'monsters', 'Astral', 'Solar', 'swarm', 0.65, 0.95, 1.4, 'Blood Bite'),
  MD('hollow_wraith', 'Hollow Wraith', 'monsters', 'Astral', 'Solar', 'caster', 0.9, 1.2, 1.05, 'Hellfire Wisp'),
  MD('prism_moth', 'Prism Moth', 'monsters', 'Solar', 'Astral', 'swarm', 0.7, 0.9, 1.25, 'Glow Dust'),
  MD('horse', 'Night Steed', 'animals', 'Astral', 'Solar', 'skirmisher', 1.0, 1.0, 1.12, 'Night Hoof'),
  // Vùng VII — Cực Quang
  MD('star_sentinel', 'Star Sentinel', 'monsters', 'Astral', 'Solar', 'guardian', 1.35, 1.1, 0.95, 'Meteor Spear'),
];

export const EXPEDITION_MONSTERS_BY_ID: Readonly<Record<string, MonsterDef>> = Object.fromEntries(
  EXPEDITION_MONSTERS.map((m) => [m.monsterId, m]),
);

/** Quái nhỏ theo vùng (thứ tự = độ phổ biến). */
export const REALM_MONSTER_POOLS: Record<RealmMapId, readonly string[]> = {
  '01-dawn-meadow': ['rabbit', 'chicken', 'briar_goblin', 'wild_boar', 'sheep', 'red_fox', 'verdant_slime', 'highway_bandit'],
  '02-everfrost-peaks': ['frost_wisp', 'mountain_goat', 'snow_owl', 'yeti_brute'],
  '03-sunken-dunes': ['venom_spider', 'desert_camel', 'tomb_mummy', 'sand_wyrm'],
  '04-abyssal-sanctum': ['lantern_jelly', 'reef_crab', 'drowned_corsair', 'sea_turtle'],
  '05-cinder-caldera': ['ember_imp', 'lava_salamander', 'cow', 'cult_acolyte', 'highway_bandit'],
  '06-nocturne-veil': ['dusk_bat', 'prism_moth', 'horse', 'hollow_wraith', 'snow_owl'],
  '07-aurora-zenith': ['prism_moth', 'star_sentinel', 'hollow_wraith', 'frost_wisp'],
};

/** Chỉ số chuẩn quái nhỏ theo vùng (cùng đường cong với Quái Gác Cổng, nhân `wild.statScale`). */
export function makeMonsterTemplate(monsterId: string, tier: number, opts?: { minion?: boolean; scale?: number }): EnemyUnitTemplate {
  const m = EXPEDITION_MONSTERS_BY_ID[monsterId];
  if (!m) throw new Error(`Không có quái ${monsterId}`);
  const scale = (1 + (tier - 1) * 0.42) * (opts?.scale ?? 1);
  const k = EXP_BALANCE.wild.statScale;
  return {
    enemyId: `${monsterId}_t${tier}`,
    nameVi: m.nameVi,
    element: m.element,
    weakness: m.weakness,
    maxHp: Math.round(620 * scale * k * m.hp * 1.25),
    atk: Math.round(58 * scale * (0.62 + k * 0.4) * m.atk),
    def: Math.round(28 * scale * 0.7),
    spd: Math.round((84 + tier * 4) * m.spd),
    maxBreak: Math.round((60 + tier * 10) * m.hp),
    spriteKey: monsterId,
    spriteDir: m.dir,
    cellSize: 192,
    rows: 4,
    attackNameVi: m.attackNameVi,
    hitBeatsMs: [460, 820],
    hitPowerMult: 1.0,
    aiStyle: m.style,
    isMinion: true,
  };
}

export interface WildPackSpec {
  wildId: string;
  mapId: RealmMapId;
  nameVi: string;
  x: number;
  y: number;
  monsterIds: readonly string[];
}

const WILD_SPOTS: Record<RealmMapId, readonly (readonly [number, number])[]> = {
  '01-dawn-meadow': [[10, 17], [25, 7], [43, 13], [32, 23], [86, 27], [17, 49], [53, 52], [99, 56]],
  '02-everfrost-peaks': [[25, 23], [49, 23], [70, 24], [12, 28], [44, 8], [86, 28], [88, 10]],
  '03-sunken-dunes': [[20, 26], [49, 14], [70, 14], [12, 28], [44, 8], [86, 28], [88, 10]],
  '04-abyssal-sanctum': [[27, 23], [49, 23], [70, 24], [12, 28], [44, 8], [86, 28], [88, 10]],
  '05-cinder-caldera': [[20, 26], [49, 11], [70, 24], [12, 28], [44, 8], [86, 28], [88, 10]],
  '06-nocturne-veil': [[21, 23], [49, 11], [66, 26], [12, 28], [44, 8], [86, 28], [88, 10]],
  '07-aurora-zenith': [[16, 44], [78, 16], [124, 46], [40, 50], [100, 50], [130, 14], [52, 22]],
};

function buildWildPacks(): WildPackSpec[] {
  const out: WildPackSpec[] = [];
  for (const [mapId, spots] of Object.entries(WILD_SPOTS) as [RealmMapId, readonly (readonly [number, number])[]][]) {
    const pool = REALM_MONSTER_POOLS[mapId];
    spots.forEach(([x, y], i) => {
      const size = i === 0 ? 2 : 3;
      const start = i === 0 ? 0 : 2 + (i - 1) * 3;
      const ids = Array.from({ length: size }, (_, k) => pool[(start + k) % pool.length]);
      out.push({
        wildId: `${mapId}_wild_${i + 1}`,
        mapId,
        nameVi: `${EXPEDITION_MONSTERS_BY_ID[ids[0]].nameVi} Pack`,
        x,
        y,
        monsterIds: ids,
      });
    });
  }
  return out;
}

export const EXPEDITION_WILD_PACKS: readonly WildPackSpec[] = buildWildPacks();
export const EXPEDITION_WILD_PACKS_BY_ID: Readonly<Record<string, WildPackSpec>> = Object.fromEntries(
  EXPEDITION_WILD_PACKS.map((w) => [w.wildId, w]),
);
