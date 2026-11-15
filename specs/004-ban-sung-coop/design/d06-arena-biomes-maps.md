# d06 — Co-op Arenas, Biomes, Cover Props & Explosive Barrels

## 1. Wave-2 Target Files
- `shared/src/bansung/maps.ts` — `BansungBiomeId`, tile/arena constants, static obstacle & prop schemas, deterministic `buildArenaMap(biome)` builder (re-exported by `shared/src/bansung.ts`).
- `server/src/game/bansung/map.ts` — Runtime `PropState[]`, damage/break handling, chain-reaction barrel detonation queue, wave-checkpoint prop respawn.
- `client/src/bansung/arenaRender.ts` — Offscreen baked 2.5D floor/wall layer, Y-sortable obstacle/prop draw helpers (`drawArenaBlock`, `drawArenaProp`), procedural pixel fallback + `database-ban-sung` sprite hook.
- Assets: `database-ban-sung/tiles/{desert,crypt,cyber}_floor.png`, `database-ban-sung/sprites/props/{cactus,rock,pillar,crate,urn,barrel_red,barrel_emp}.png`.

## 2. World Constants & Coordinate Space
- `TILE_SIZE = 48` (aligns with 48x48 normalized grid), `ARENA_COLS = 44`, `ARENA_ROWS = 28` -> `MAP_W = 2112`, `MAP_H = 1344`.
- Perimeter walls: `1` tile (`48px`) on West/East/South, `2` tiles (`96px`) on North (for 2.5D front-facing facade), yielding playable interior `x ∈ [48, 2064]`, `y ∈ [96, 1296]` (`2016 × 1200`).
- Center Boss Plaza: `(CX = 1056, CY = 696)`; clear radius `200px` around `(CX, CY)` for boss spawns (`d37`–`d39`) and player rally.
- Player Co-op Spawns (`8` slots): `(CX ± 72*k, CY + 130)` (`k ∈ {-1.5,-0.5,0.5,1.5}`) and second row `CY + 190` — always clear of obstacles.
- Enemy Spawn Gates (`8` per map): `4` cardinal archways `(CX, 96)`, `(CX, 1296)`, `(48, CY)`, `(2064, CY)` + `4` corner breaches `(192, 192)`, `(1920, 192)`, `(192, 1200)`, `(1920, 1200)`.

## 3. Shared Schemas (`shared/src/bansung/maps.ts`)
```ts
export type BansungBiomeId = 'desert' | 'crypt' | 'cyber';
export type BlockKind = 'wall' | 'pillar' | 'rock' | 'ruin' | 'tomb' | 'server';
export type PropKind = 'barrel_explosive' | 'barrel_emp' | 'cactus' | 'crate' | 'urn' | 'decor';

export interface ArenaBlock {
  id: number;
  kind: BlockKind;
  x: number; y: number; w: number; h: number; // Footprint AABB for d05 circle-vs-AABB
  visualH: number;       // 2.5D extrusion height (24..56px) drawn above y
  blocksBullet: boolean; // false only for low floor rims
  blocksSight: boolean;  // true -> blocks AoE LOS (d05) & laser sniper telegraph (d35)
  spriteId: string;
}

export interface ArenaPropSpawn {
  idx: number;
  kind: PropKind;
  x: number; y: number;   // Center footprint (snapped to 24px grid)
  w: number; h: number;   // AABB (36x36 barrels/crates, 40x40 cactus, 28x28 urn)
  hp: number;             // 0 = non-blocking decor; >0 = destructible
  solid: boolean;
  spriteId: string;
}

export interface BiomePalette {
  id: BansungBiomeId;
  name: string;
  floorA: string; floorB: string; floorAccent: string;
  wallTop: string; wallFace: string; wallTrim: string;
  ambientTint: string;
}

export interface ArenaMapDef {
  biome: BansungBiomeId;
  w: number; h: number;
  playable: { x0: number; y0: number; x1: number; y1: number };
  palette: BiomePalette;
  blocks: ArenaBlock[];      // Baked into d05 spatial hash at match init
  props: ArenaPropSpawn[];   // Initialized into server PropState[]
  playerSpawns: [number, number][];
  enemyGates: { x: number; y: number; nx: number; ny: number; cardinal: boolean }[];
  bossPad: [number, number];
}
```

## 4. Three Co-op Arenas & Cover Layouts
| Biome | Theme & Palette | Cover / Static AABBs | Destructible Props & Barrels |
|---|---|---|---|
| `desert` (**Desert Ruins**) | Soul Knight desert ref: `#d9a05b`/`#c88d48` sand tile grid, `#9e6835` top / `#6b4220` front sandstone walls, center sun-glyph mosaic | 4 perimeter arch walls, 4 ruin pillars (`96×72`) at `(CX±360, CY±216)`, 6 sandstone rocks (`72×48` / `48×48`) breaking sniper lanes, 2 broken half-walls | `10` **Spiny Cacti** (`hp:80`, `40×40`, `thornDmg:5` + knockback on contact, drops none), `8` **Red Explosive Barrels** (`hp:40`), `12` wood crates/clay pots (`hp:30/20`, hooks `d32`), `14` skull/pebble/scrub `decor` |
| `crypt` (**Crimson Crypt**) | `#2d242c`/`#3b2d38` basalt slabs, `#7a1c24` central carpet runner, `#47333d`/`#23171e` brick walls, flickering wall braziers | 6 gothic colonnade pillars (`48×72`) in 2 rows `(CX±288, CY±240/0)`, 4 Stone Sarcophagi (`96×48`) in outer alcoves | `10` **Explosive Alchemist Barrels** (`hp:40`), `12` Crypt Urns & Coffin Crates (`hp:20/35`, hooks `d32`), `12` candle/bone `decor` |
| `cyber` (**Cyber Lab**) | `#1f2937`/`#283548` steel tiles, `#22d3ee` cyan seams, `#eab308` hazard boss pad, `#334155`/`#161e2e` bulkhead walls | 4 L-shaped Server Cover Pairs around `(CX±336, CY±204)` (composed of 2 axis-aligned AABBs each — zero polygon math), 4 outer Conduit Pillars (`48×48`) | `10` **EMP/Plasma Barrels** (`hp:45`, `120` AoE dmg + `1200ms` stun), `12` Alloy Supply Crates (`hp:40`, hooks `d32`), `10` floor vent/cable `decor` |

## 5. Miragine-Style Frame & Anchor Specs
- Pivot convention matches `database-miraginewar/mapping.json`: anchor `(0, 0)` at bottom-center ground contact (`offX = -w / 2`, `offY = -h + 4`), paired with reused `shadow.png` (`38×16, offX:-19, offY:-8` scaled to `w / 38`).
- Sprite animation specs (normalized `database-ban-sung/sprites/props/`):
  - `barrel_red` / `barrel_emp`: `48×48`, `offX:-24, offY:-44`; `idle` (`1f`, or `2f` @ `400ms` blinking LED on `barrel_emp`), `flash` (`2f` @ `80ms` when hit / fuse ticking), explosion reuses/augments Miragine `fireball.png` (`3f 32×32`) + radial shockwave.
  - `cactus`: `48×64`, `offX:-24, offY:-58`; `idle` (`1f`), `hit` (`2f` @ `90ms` wobble + needle burst), `stump` (`1f` ground decal after break).
  - `crypt_brazier` (attached to crypt wall/pillar): `32×48`, `offX:-16, offY:-44`, `4f` @ `140ms` flame cycle.
  - `crate` / `urn`: `48×48` / `32×32`, `idle` (`1f`), `hit` (`1f` white tint flash `70ms`).

## 6. Prop Destruction, Explosive Barrels & Renderer Algorithms
- **Damage & Chain Detonation (`server/src/game/bansung/map.ts`)**:
  1. `damageProp(propIdx, dmg, chainDepth = 0)`: Ignore if `!prop.alive || prop.hp <= 0`. Subtract `dmg`.
  2. When `prop.hp <= 0`: set `prop.alive = false`, remove its AABB from the active `d05` spatial hash cell, emit `propBreak` delta event (`d02`).
  3. If `crate` or `urn`: call `d32` loot roll (`spawnPickup`).
  4. If `barrel_explosive` or `barrel_emp`: enqueue detonation at `triggerTick = nowTick + (chainDepth > 0 ? 4 : 0)` (`~133ms` stagger at 30Hz; cap `chainDepth <= 8`).
  5. On detonation: query spatial hash within `R = 160` (`170` for `barrel_emp`), verify `d05` `hasLineOfSight(bx, by, tx, ty)` against `blocksSight` blocks, deal `140` dmg (`120` + `1200ms` stun for `barrel_emp`) + knockback to mobs/destructible props (`chainDepth + 1`), and `18` shield-only chip + light knockback to players (prevents friendly-fire griefing).
- **Wave Checkpoint Respawn**: At start of Waves `4, 7, 10`, restore destroyed barrels and `50%` of crates whose AABB has no overlapping hero/mob (`minDist > propHalf + entityR + 8`).
- **Client 2.5D Rendering (`client/src/bansung/arenaRender.ts`)**:
  1. **Floor Bake (once per biome load)**: Pre-render `2112×1344` offscreen `<canvas>` with checkerboard tile jitter (`hash(col, row)`), perimeter outer void, mosaic/carpet/hazard markings, and non-blocking `decor` decals; blit visible viewport slice `[vx0..vx1, vy0..vy1]` in 1 `drawImage` call.
  2. **Y-Sort Queue (`d41`)**: Push `blocks` (sort key `y + h`) and alive `props` (sort key `y + h / 2`) alongside heroes/mobs/bosses. Each 2.5D block draws its darker `wallFace` front skirt `[x, y+h-visualH, w, visualH]` below the lighter top cap `[x, y-visualH, w, h]` so entities behind cover are properly occluded.
  3. **Minimap (`d45`)**: Draw static `blocks` as solid `#00000080` rects and alive barrels as `#ff6b6b` (`#22d3ee` for EMP) 2px dots.
