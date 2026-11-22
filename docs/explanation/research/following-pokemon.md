# Following Pokémon (Pokémon đi theo): prior art, Mons constraints and a proposed design

Research for a "walking Pokémon" in the Mons overworld (2026-11-20): the lead Pokémon of the party walks one cell behind
the Player, as in HGSS. **Scope from the user:** the follower only **follows**. There is no "talk to your Pokémon", no
friendship or mood messages and no new Vietnamese dialogue (both references have them, §1.1 and §1.2. Mons leaves them
out by the user's decision). This is research and a proposal only: no code. Open questions are in §6.

**Status (2026-11-20):** the user accepted the recommended answer to every open question ("đề xuất all"); the answers
are recorded under §6. Then "theo đề xuất all, full hết đ rồi test 1 lần luôn": F1, F2 and F3 are built together as
[decisions.md §32](../../agents/decisions.md).

**Sources.** Primary: the Gen 4 decompilation `pret/pokeheartgold` and the Gen 3 decompilation-based
`rh-hideout/pokeemerald-expansion` on GitHub (master branch, read on 2026-11-20; files named below). HGSS's per-step
trailing code is still assembly in `pret/pokeheartgold` (`asm/overlay_01_*.s`, called from the C as `ov01_*`), so
its exact step rule could **not** be read in decompiled form. §1.1 cites only what the C files show. Let's Go
Pikachu / Eevee is from general knowledge and marked *unverified*. Nothing in the design depends on it. The repo
itself is cited as `file:line` (main at `d3f06048`).

## 1. Prior art

### 1.1 HGSS (`pret/pokeheartgold`)
- Source: [`src/follow_mon.c`](https://github.com/pret/pokeheartgold/blob/master/src/follow_mon.c),
  [`include/follow_mon.h`](https://github.com/pret/pokeheartgold/blob/master/include/follow_mon.h),
  [`src/save_follow_mon.c`](https://github.com/pret/pokeheartgold/blob/master/src/save_follow_mon.c),
  [`include/map_header.h`](https://github.com/pret/pokeheartgold/blob/master/include/map_header.h),
  [`src/field_warp_tasks.c`](https://github.com/pret/pokeheartgold/blob/master/src/field_warp_tasks.c),
  [`src/field_use_item.c`](https://github.com/pret/pokeheartgold/blob/master/src/field_use_item.c).
- **Which Pokémon:** `FollowMon_InitMapObject` takes `GetFirstAliveMonInParty_CrashIfNone` (the first **non-fainted**
  party member, not slot 0). Only when no member is alive does it fall back to `GetFirstNonEggInParty`.
  `FollowMon_ChangeMon` re-picks the Pokémon when the party changes. `FollowMon_IsActive` is false when
  `CountAlivePokemon` is 0.
- **It is an ordinary map object:** `FollowMon_CreateMapObject` makes a `LocalMapObject` at the Player's own x, y and
  direction, with id `obj_partner_poke`, the talk script `std_following_mon` and unlimited x / y range
  (`SetXRange(-1)`). Species, form, gender and shiny go into object params (`FollowMon_SetObjectParams`).
  `FollowMon_GetSpriteID` maps the species to `SPRITE_FOLLOWER_MON_BULBASAUR + offset` (+1 for a female form, + form).
  Out-of-range species fall back to Bulbasaur.
- **Where it may walk (per map, per size):** each map header has a 2-bit `followMode`: `MAP_FOLLOWMODE_PREVENT`,
  `MAP_FOLLOWMODE_HEIGHT_RESTRICT` or `MAP_FOLLOWMODE_ALLOW` (`map_header.h:9-11, 33`).
  `FollowMon_GetPermissionBySpeciesAndMap` hides a species whose size byte (`FollowMon_GetSizeParamBySpecies`, from
  the `tsurepoke/tp_param` data) is non-zero on height-restricted maps. That is how large Pokémon stay out of low
  interiors. There is one species rule too: Diglett and Dugtrio never follow inside Bell Tower
  (`FollowMon_DiglettPermissionCheck`).
- **Cycling and surfing:** when the Player state is `PLAYER_STATE_CYCLING` or `PLAYER_STATE_SURFING`, init and
  change-mon put the object into its hidden state (`sub_0206A054` / `sub_0206A040` set the visible flag). The bike task
  (`Task_MountOrDismountBicycle` in `field_use_item.c`) toggles the same bits on mount and dismount.
- **Warps:** the warp task in `field_warp_tasks.c` runs a follower step before the fade (`ov01_0220329C`, assembly)
  when the follower is active and the Player is not cycling. After the new map loads, it checks
  `FollowMon_GetPermissionBySpeciesAndMap` for the new map before showing the follower again. The new map's object is
  created at the Player's arrival cell (`FollowMon_InitMapObject(..., location->x, location->y, location->direction,
  ...)`).
- **Save:** only `SaveFollowMon { u32 mapNo; unused : 2; inhibitFlag : 1 }`. The Pokémon itself is never saved,
  because it is always derived from the party. `inhibitFlag` (a script turned the follower off) is cleared on every
  map transition (`field_warp_tasks.c`, `Save_FollowMon_SetInhibitFlagState(..., FALSE)`).
- *Left out of Mons by the user's decision:* the talk script and the mood value
  (`FieldSystem_UnkSub108_*Mood`, −127..127, drifting toward neutral while the follower is visible).

### 1.2 Gen 3 follower in `pokeemerald-expansion`
- Source: [`include/config/overworld.h`](https://github.com/rh-hideout/pokeemerald-expansion/blob/master/include/config/overworld.h),
  [`src/event_object_movement.c`](https://github.com/rh-hideout/pokeemerald-expansion/blob/master/src/event_object_movement.c),
  [`src/field_screen_effect.c`](https://github.com/rh-hideout/pokeemerald-expansion/blob/master/src/field_screen_effect.c),
  [`src/overworld.c`](https://github.com/rh-hideout/pokeemerald-expansion/blob/master/src/overworld.c),
  [`src/field_player_avatar.c`](https://github.com/rh-hideout/pokeemerald-expansion/blob/master/src/field_player_avatar.c).
  The separate `follower_npc.c` is for a scripted NPC companion, not the Pokémon.
- **Configs:** `OW_FOLLOWERS_ENABLED` (off by default, "HGSS style"), `OW_FOLLOWERS_BOBBING` (1 px bob while idle and
  walking), `OW_FOLLOWERS_POKEBALLS` (the follower comes out of its own ball), `B_FLAG_FOLLOWERS_DISABLED` (a flag
  that turns followers off), `OW_FOLLOWERS_SCRIPT_MOVEMENT`, and the restriction lists `OW_FOLLOWERS_ALLOWED_SPECIES`
  / `_MET_LVL` / `_MET_LOC`. `OW_SUBSTITUTE_PLACEHOLDER` uses a placeholder sprite for species with no overworld art.
- **Which Pokémon:** `GetFollowerInfo` = `GetMonInfo(GetFirstLiveMon(), …)`: the first live party member, again not
  slot 0.
- **Spawn and refresh:** `UpdateFollowingPokemon` runs on every map load (`overworld.c`, also after returning to the
  field. It removes the follower after Fly). It removes the follower when the flag is set, when the species has no
  graphics, when **the map is indoors and the sprite is larger than 32×32**, when `FLAG_TEMP_HIDE_FOLLOWER` is set, or
  when an NPC follower is present. It spawns the follower at the Player's cell, **invisible**, with
  `MOVEMENT_TYPE_FOLLOW_PLAYER`. When the species, shiny or gender changes, it moves the follower onto the Player and
  hides it again.
- **The trailing rule** (`FollowablePlayerMovement_Step`): the target is the Player's `previousCoords`, the cell the
  Player just left. The follower takes one step toward it (`GetDirectionToFace`). It does not move when the Player
  bumped (current = previous) or when it already stands there. The step copies the Player's kind of movement:
  a ledge in its path → a jump (`GetJump2MovementAction`), Player dashing → walk fast, side stairs → slow stairs,
  otherwise walk normal. `InitJumpRegular` gives the follower's ledge jump the Player's timing.
- **Hide / show:** `IsFollowerVisible()` is false while the Player has `FOLLOWER_INVISIBLE_FLAGS`
  (`SURFING | UNDERWATER | BIKE | FORCED_MOVE`, `field_player_avatar.h`), when the Player's previous tile is surfable
  water, or when the Player stands on a forced-movement tile (ice, spinners, currents). The movement type has three
  states:
  - *shadow*: invisible, kept on the Player's cell;
  - *active*: when it must hide, it plays `MOVEMENT_ACTION_ENTER_POKEBALL`;
  - *exit*: it reappears with `EXIT_POKEBALL` at the Player's previous cell on the first normal step. It does not
    come out while the Player is jumping or locked by a script.
- **Doors:** `Task_DoDoorWarp` puts the follower into its ball as soon as the door starts to open, then the Player
  walks in. On the new map it spawns hidden on the Player and comes out on the first step.
- **Collision:** `GetObjectObjectCollidesWith` returns "no collision" for the follower itself, and the Player ignores
  objects with `MOVEMENT_TYPE_FOLLOW_PLAYER`. So the Player can walk back through the follower, while other objects
  still collide with it. Followers are never despawned for being off screen.
- **Sprites:** each species has its own overworld sheet, e.g. `graphics/pokemon/pikachu/overworld.png` = 192×32 =
  six 32×32 frames (down ×2, up ×2, side ×2; the other side is the side frames mirrored). Larger species get
  64×64 tables (`OW_LARGE_OW_SUPPORT`). Shiny and female use their own palette (`LoadDynamicFollowerPalette`).
- *Left out of Mons by the user's decision:* the message tables (`follower_messages.h`, `GetFollowerAction`,
  conditions on type, status, map, weather, time of day).

### 1.3 Let's Go Pikachu / Eevee (*unverified*, general knowledge)
- The starter always follows, and any one party member can be chosen to walk out. Some large species can be ridden.
  The partner walks behind with smooth free movement rather than strictly cell by cell. Nothing here is used.

### 1.4 What both decompilations agree on
1. The follower is **derived from the party** (first live member) and never stored. At most a small on / off state is
   saved.
2. It **trails into the Player's previous cell**, copying the Player's step kind (walk / run / ledge jump).
3. It **hides** for surf, bike, forced movement and doors, and on maps where it does not fit. It **reappears** on the
   first normal step, at the Player's previous cell.
4. It **never blocks the Player** and never despawns off screen.

## 2. Mons constraints (from the code)

1. **Grid movement and timing.** `World.step()` (`game/src/scenes/World.ts:790-875`) tweens the Player one cell in
   16 frames (8 / 1.75 running, 32 for a ledge jump, 8 for an ice slide), `FRAME_MS = 1000/60` (`World.ts:113`),
   `RUN_SPEED = 1.75` (`World.ts:182`). The Player's cell is `px, py`, and the target is `dest` while moving
   (`World.ts:829`). Turning in place takes 8 frames (`World.ts:780-785`). Every rule in §3.1 can hook on `step()`
   (start) and `arrived()` (end, `World.ts:904`).
2. **Ledges** jump two cells in one move (`tx = nx + dx`, `World.ts:827-830`) with a hop and a shadow ellipse
   (`World.ts:849-857`). A ledge is passable only in its direction and never while surfing (`World.ts:676`).
3. **Surf** sets `GAME.surfing` after the dialogue (`World.ts:1635-1647`). The Player sprite is lifted 4 px over a drawn
   `surfBlob` (`World.ts:373-377, 644-646`). Surfing ends on the landing step (`World.ts:832, 869`). There is **no bike**
   (`game/src/encounter.ts:19`).
4. **Forced movement:** ice slides (`World.ts:933-937`, `step(d, true)`), cracked floor that drops the Player through
   (`World.ts:892-902`), District gate walk-backs (`walkBack`, `World.ts:1404-1410`), `stepBack` that teleports one
   cell (`World.ts:1626-1632`), and the minecart ride: `ride()` tweens the Player along `st.path` with
   `locked = true` and hops off onto the landing cell (`World.ts:1143-1176`).
5. **Every warp restarts the scene.** Map connections (`changeMap`, `World.ts:1664-1677`), doors (`enterInterior`
   hides the Player while the door closes, `World.ts:1567-1601`), leaving interiors (`World.ts:1603-1612`), stairs,
   holes, warp pads and cave exits (`World.ts:915-932`), Escape Rope, battles and evolution
   (`Battle.ts:1024`, `Evolve.ts:296`) all call `scene.restart` / `scene.start("world", …)`. `create()` rebuilds
   everything from `GAME.map / x / y / facing` (`World.ts:295-410`), including the spawn fix-ups `betterLanding` and
   `unstick` (`World.ts:357-370`). So the follower is **rebuilt on every map start**. Nothing carries over except
   what is in `GAME`.
6. **Doors:** walking up into a structure door first plays the door's open frames, then steps in
   (`World.ts:816-826`). During the step the Player is drawn at `door.z + 1` (`World.ts:860`). Coming out, the door
   closes behind (`World.ts:399-406`).
7. **Depth:** objects use `depth = bottom y` (Player `py*16+15` at rest, `y − 1` while moving, `World.ts:645, 860`;
   NPCs `y*16+15`, `World.ts:331`). The camera follows only the Player (`World.ts:387`). Tall grass hides the
   Player's feet with one crop image, `grassCover` (`World.ts:380, 648-650`). It serves only the Player.
8. **Caves:** `darkness()` draws a black image with a hole of `DARK_RADIUS = 64` px (`FLASH_RADIUS = 192`) at depth
   4000, centred on the Player by `followDark()` (`World.ts:191, 490-541`). A follower one cell (16 px) away stays
   inside the hole. The darkness covers it like everything else, so nothing extra is needed.
9. **Who else uses cells:** NPCs and Trainers block the Player (`walkable`, `World.ts:670-678`). Wandering Trainers
   avoid the Player's cell and `dest` (`World.ts:2093-2094`). A Trainer's sight stops at other NPCs (`sees`,
   `World.ts:1775-1784`). Other online players are ghosts with no collision (`game/src/net/presence.ts:8-9`).
   `interactAt` checks beds, PCs, items, mechanics, other players, Trainers, NPCs, then signs (`World.ts:1684-1735`).
10. **The party:** `GAME.party: Mon[]` (`game/src/state.ts:10`). A `Mon` has `species`, `hp`, `shiny`, `gender`
    (`game/src/data.ts:54-73`). The party changes while the World is **paused**, not restarted:
    - ĐỔI CHỖ in the party screen swaps slots (`game/src/scenes/Screens.ts:234, 252`);
    - the PC box splices the party (`game/src/scenes/PcBox.ts:389-452`). `openScreen` pauses the caller and launches
      the overlay (`Screens.ts:23-28`).

    The World has no `resume` handler today. Healing changes `hp` in place (`healParty`, `World.ts:1856-1858`; nurse,
    bed). Evolution restarts the World (`Evolve.ts:296`). The World already uses "first healthy member" for field
    moves: Flash and Surf (`World.ts:544, 1636`).
11. **Pokémon sprites in the game are battle sprites and icons only.** `build_assets.py` exports
    `mons/<key>-front|back|icon[-shiny].png` (`game/tools/build_assets.py:1236-1316`). The movement sheet is used only
    to cut the front / back views (`movement_cells`, `build_assets.py:684-708`). `monsprites.ts` loads these lazily
    (`game/src/monsprites.ts:1-13, 60-80`). **No walk frames reach the game today.**
12. **What the movement sheets hold** (measured on 2026-11-20 over `assets/pokemon/Gen*/*/*-movement.png`, 254 sheets,
    192 px cells, `.agents/skills/pokemon-sprite-generator/SKILL.md:48-57, 70-86`, `docs/agents/decisions.md` §2, §2b):
    - 168 **legacy 8×6** (1536×1152): 8 direction columns, rows Walk A/B, Run A/B, Fly A/B. Column 0 = down,
      2 = right, 4 = up, 6 = left (the order `build_assets.py:686-688` relies on, column 7 = down-left).
    - 81 **v3** sheets with the `mons-loops` tEXt chunk: 4 direction rows (down, left, right, up) × 6 frames per
      loop. Loops seen: idle+walk 39, walk+run 25, idle+walk+fly 6, walk+run+fly 4, idle+fly 3, fly only 3, idle only 1.
    - 5 **v2** without the chunk (4 rows × 4 or 8 frames).

    Every sheet has a `-movement-shiny.png` twin (254 / 254, §30).
13. **Species without a movement sheet:** 906 species are in the game, 240 with 2D art and 666 with only the 3D
    Fall-back render (decisions.md §29, §5b). A render has only `front` / `back` / `icon` (decisions.md §5b,
    `-render.json`). There are **no directional walk frames** for two thirds of the species. The 8-direction 3D
    sheets (`pokemon3d/`) live outside the repo (decisions.md §5, "Location"). The Fall-back models and animations
    themselves are in `assets/pokemon/Fall-back/…/{models,animations,posers}` (decisions.md §5).
14. **Scale.** The world camera zooms 3× on PC and 5–8× on a phone (`game/src/screen.ts:33-45`). Maps are 16 px cells.
    Characters are 16×32 (NPCs, paper dolls about 21 px tall) or 32×32 frames with adults 26 px and children 22 px
    tall (decisions.md §9). The look rule is integer scaling and no smoothing (`game/AGENTS.md`). A 192 px cell shown
    at about 24 px is a 1/8 downscale. Doing it at run time would break the pixel grid, so it must be **pre-cut at
    build time** the way `strip_of` / `hires_strip` cut battle sprites (`build_assets.py:731-765`: LANCZOS, then
    binary alpha). The settled map-size formula (decisions.md §6: drawn height = `clamp(0.95·h^0.45, 0.65, 2.4)` m,
    `PX_PER_M = 27/1.7`) gives about 10–38 px.
15. **Multiplayer presence** (`game/src/net/presence.ts`, `game/src/net/protocol.ts`, `server/hub.ts`):
    - Each client sends `enter { map, x, y, facing, sprite, surf, place }` and `pos { x, y, facing, moving, run, surf }`
      on change, at most every 125 ms (`presence.ts:87-105`, `protocol.ts:199-200`).
    - Others are drawn from `PlayerView` (`protocol.ts:144-146`). Remotes walk queued cells with tweens. More than 3
      queued or a jump of more than one cell snaps (`presence.ts:142-169`). Faded while `away`.
    - The server validates `sprite` against `known.players` and rebroadcasts (`server/hub.ts:401-446`). It
      rate-limits `pos` (`hub.ts:437-441`). `known.species` already exists (the keys of `mons.json`,
      `server/validate.ts:14-24`).
    - **Nothing about the party is in presence today.** The saved party is read only for the player card
      (`hub.ts:643-645`).
16. **Save:** the cloud save is the whole `GAME` object, serialised generically, so a new `GAME` field is saved with no
    change (`game/src/net/save.ts:5-12`). Per-device display toggles live in `localStorage` and are listed in CÀI ĐẶT
    "Hiển thị" (`minimap.ts:32-37`, `game/src/scenes/Settings.ts:23-27`).
17. **GLOSSARY:** *Overworld* excludes building interiors (`GLOSSARY.md:9-11`). *Warp*, *Connection* and *Ledge* are
    defined terms (`GLOSSARY.md:93-104`). "Follower" is not a GLOSSARY term yet. If the feature is built, add
    **Follower** (Pokémon đi theo): "the lead party Pokémon drawn one cell behind the Player; derived from the party,
    never blocks", *Avoid*: pet, companion, partner.

## 3. Proposed design

### 3.1 Trailing: a one-move history, not a free path
- Keep `followMove`, the **last move the Player made**: `{ fromX, fromY, toX, toY, kind }` with kind `walk | run |
  jump | slide`. At the start of each `step()` (after all the early returns, at the point where `this.moving = true`,
  `World.ts:842`) the follower starts **its own tween into the Player's `from` cell**. The duration is the Player's
  `frames`, the kind is the Player's kind, and the direction is from its own cell to that cell (expansion
  `FollowablePlayerMovement_Step`). Both tweens run together, so the pair moves as one and the gap never opens.
- A ledge: the Player goes from A over the ledge L to B. The follower walks into A. On the Player's next move, the
  follower's move from A to B is two cells, so it plays the same 32-frame hop (expansion: `GetJump2MovementAction`
  when a ledge lies in the path). Store `jump: true` on the follower's pending move whenever its from→to distance is
  2.
- No pathfinding and no collision checks are needed: the target is always a cell the Player has just stood on, so a
  1-wide corridor, a counter gap or a door mat works by construction. Corridors are therefore not a hide case.
- **Turning back:** the Player may step into the follower's cell (expansion ignores the follower in the Player's
  collision). The two then swap: the follower takes the Player's old cell, the same rule. `walkable()` must not count
  the follower.
- **Bump, turn in place, menus:** no move, no follower move (expansion: current = previous → no step). While the
  Player stands still the follower **faces the Player** and plays its idle loop (v3 `idle` row, else frame 0 with a
  1 px bob as `OW_FOLLOWERS_BOBBING`).
- **Start of a map** (`create()`): place the follower on the cell **behind** the Player (opposite `facing`) if that
  cell is in the map, `OPEN` and free. Otherwise, as in expansion's *shadow* state, keep it hidden on the Player's
  cell. It appears on the first normal step at the Player's previous cell. This covers connections (the cell behind
  is on the old map), door arrivals, `betterLanding` / `unstick` moves and battle returns.
- **Wandering Trainers** add the follower's cell (and its `dest`) to their `blocked` test (`World.ts:2093`), so they
  never walk into it. NPC collision with it is not needed otherwise. Trainer sight is not blocked by the follower
  (the expansion follower is not an obstacle for the Player either). The A button on its cell does nothing (no
  interaction, by scope).

### 3.2 When to hide and show
Hiding plays a short "back into the ball" effect: a 6-frame shrink and white flash, with the Poké Ball of
`mon.ball`, as `OW_FOLLOWERS_POKEBALLS`. Showing plays the reverse at the Player's previous cell. Both sound-less in
F1.

| Situation (Mons code) | Rule | Prior art |
|---|---|---|
| Surf starts (`askSurf`, `World.ts:1641-1645`) | hide. Show on the first land step after `landing` | expansion `SURFING` flag; HGSS surf state |
| Ledge jump | stay visible. Hop one move later (§3.1) | expansion jump copy |
| Ice slide (`step(d, true)`) | hide at the first slide, show on the first normal step | expansion `FORCED_MOVE` / forced-movement tile |
| Cracked floor fall (`fall()`) | hide with the Player (the map restarts) | (Mons only) |
| Minecart (`ride()`, `World.ts:1143`) | hide when the ride starts, show on the first step after the hop off | expansion forced movement; no exact precedent |
| Door into a structure (`World.ts:816-826`) | hide when the door starts to open | expansion `Task_DoDoorWarp` |
| Stairs, holes, warp pads, cave mouths, connections, Escape Rope | nothing special: the restart rebuilds it (§3.1 map start) | HGSS / expansion re-init on load |
| `walkBack` / `stepBack` (gates, closed gyms, a door with no interior) | `stepBack` teleports: snap the follower behind the new cell or hide. `walkBack` is a normal step | (Mons only) |
| Battle, evolution | rebuilt on return (scene restart) | expansion `UpdateFollowingPokemon` on return to field |
| Interiors | see open question 3: either allowed for every size, or hidden for sprites over 32 px tall | expansion: indoors and > 32×32 → removed; HGSS `HEIGHT_RESTRICT` |
| No live Pokémon / empty party | no follower | HGSS `FollowMon_IsActive`; expansion `GetFirstLiveMon` |
| Setting off | no follower | `B_FLAG_FOLLOWERS_DISABLED` |
| PvP / overlay screens | nothing: the World is stopped or paused anyway | (Mons only) |

### 3.3 Which Pokémon, and keeping it current
- **Recommended:** the **first non-fainted** party member, as both decompilations do (§1.1, §1.2) and as Mons's own
  Flash / Surf do (`World.ts:544, 1636`). The user's brief says `GAME.party[0]`. With that rule a fainted lead would
  walk behind the Player, so the choice is open question 1.
- Re-pick on `create()`, on the World's `resume` event (new handler; party and PC screens pause the World,
  `Screens.ts:23-28`), and after `healParty()` (a fainted lead becomes healthy). When the species or shiny changes,
  swap the texture. Expansion first hides the follower on the Player and lets it re-emerge. F1 can just swap in place.

### 3.4 Sprite choice and scale
- **New export** in `game/tools/build_assets.py` (the only asset bridge, `game/AGENTS.md`):
  `mons/<key>-walk.png` (+ `-walk-shiny.png`). Each is 4 rows (down, left, right, up) × N frames, in a frame box of
  **32×32 px at 1×** (or 64×64 at the battle sprites' 2× texture rule, decisions.md §5c). Feet are on the bottom row
  and alpha is binary, as `strip_of` / `hires_strip` do. The drawn height uses the decisions.md §6 formula, capped by
  the box. `mons.json` gets `walkFrames` / `walkW` / `walkH` / `walkCycle`. Sources:
  - **v3 sheet:** the `walk` loop (6 frames; `fly` for fly-only species, which hover). Idle comes from the `idle` loop
    when present, else walk frame 0.
  - **v2 sheet:** its 4 or 8 walk frames.
  - **Legacy 8×6:** columns 0 / 6 / 2 / 4 (down / left / right / up), rows Walk A and Walk B = 2 frames.
  - **3D-only species (666):** F1 uses the **party icon** (`<key>-icon.png`, 2 frames of 32×32, already exported) for
    every direction, mirrored for right, with the 1 px bob. F3 adds real 4-direction walk frames rendered from the
    Fall-back model, at 4 yaws × 6 frames of the walk / hover animation, by `tools/model3d/battle_sprites.py`. The
    pipeline and look rules are already settled in decisions.md §5b, and the models are in the repo.
  - **Shiny:** cut from `-movement-shiny.png` with the same boxes, as the battle export does
    (`build_assets.py:1262-1274`). For 3D, the shiny icon.
- **Load** lazily through `monsprites.ts` (a new `"walk"` part next to `front | back | icon`). Until it arrives the
  follower is not shown. Expansion's `OW_SUBSTITUTE_PLACEHOLDER` is the alternative.
- **Draw:** origin (0.5, 1) at the cell's bottom centre, like the Player (`World.ts:378`). Depth = its own `y − 1`
  while moving and `y*16+15` at rest, so it sorts against the Player and NPCs by row. A second `grassCover`-style crop
  for tall grass is optional (F2).

### 3.5 Multiplayer
- **Send** `mon: { species, shiny } | null` in `enter` and a new `{ t: "mon", species, shiny } | null` only when the
  follower changes (rare, so no rate concern). The server validates `species` against `known.species`
  (`validate.ts:21`), stores it on `PlayerView` (`mon?: …`) and rebroadcasts. Old clients ignore the unknown field.
- **No new position traffic.** Each remote follower is driven on the receiving client from that player's own
  `pos` stream: when `walk(r)` (`presence.ts:151-169`) moves a remote from `from` to `next`, its follower tweens
  into `from`. A snap (queue > 3, jump) puts the follower behind the new cell, or hides it. `surf` hides it, and
  `away` fades it with the player (`presence.ts:58, 138`).
- Remote followers are ghosts like their players: no collision, not tappable (the tap stays on the player sprite).

### 3.6 Settings, save, performance
- **Toggle** "Pokémon đi theo" in CÀI ĐẶT "Hiển thị", next to "Khung chat" and "Bản đồ nhỏ" (`Settings.ts:24-27`).
  It is either per device (`localStorage`, like the minimap) or per account (`GAME.follower`, saved generically,
  `save.ts:5-7`). Open question 4. Off = send `mon: null` too.
- **Save:** nothing else. The follower is derived from the party, as in HGSS (`SaveFollowMon` holds no Pokémon).
- **Cost:** one sprite and one tween per player on the map. The texture is one small sheet per species, fetched once
  and kept by the service worker (`monsprites.ts:1-5`). The export adds about 906 × 2 small PNGs.

### 3.7 Edge cases checklist
- Arrival cell has no free cell behind → hidden until the first step (§3.1).
- The Player walks back into the follower → swap (§3.1).
- A wandering Trainer next to the follower → it avoids the follower's cell (§3.1).
- A Trainer spots the Player and walks up → the follower stays put (no move by the Player). It faces the Player.
- Door into an interior where the follower is not allowed → it hides at the door (§3.2) and stays hidden inside.
- The lead faints in battle → the next live member follows after the return (rule 1) or the fainted one (rule 2).
- Evolution → new species on the World restart.
- PC deposit of the lead / ĐỔI CHỖ → re-picked on `resume`.
- Releasing the last live Pokémon, or a party with no Pokémon (the start of the game) → none.
- Phone portrait and landscape: the same world camera, no UI work.
- PvP / battle start while a hide effect plays → the scene stops. Nothing persists.

### 3.8 Phases
- **F1 (minimal, offline and own client):** `-walk` export (2D sheets + icon fallback), follower sprite, the
  §3.1 trailing (walk / run / jump / swap), the §3.2 hide rules with a plain fade instead of the ball effect,
  re-pick on create / resume / heal, the CÀI ĐẶT toggle, the GLOSSARY term, a decisions.md entry. Test in the browser
  (`npm run dev`) on a route with ledges, a cave with ice and a cart, a door, surf.
- **F2:** multiplayer (`mon` in `enter` / `PlayerView` + the `mon` message, remote follower driven from the `pos`
  stream), the ball in / out effect with `mon.ball`, tall-grass cover, the idle bob.
- **F3:** 4-direction walk frames for the 666 3D-only species rendered from the Fall-back models, and per-map
  allow / size rules for interiors if wanted.

## 4. Not in scope (user, 2026-11-20)
Talking to the follower, friendship / mood messages, emotes, follower dialogue lines, item finds, riding.

## 5. Risks
- The icon fallback (two thirds of the species in F1) looks flat next to 2D walkers. F3 removes it.
- Large species (Onix, Wailord) at the §6 heights can reach 38 px tall. A 32 px cap keeps them readable but small.
  Expansion and HGSS both cap or restrict them (§1.1, §1.2).
- Cut-down v3 frames at about 1/7 scale may lose faces. The export needs a contact sheet review like the battle
  sprites (`tmp/report/`).

## 6. Open questions for the user

1. **Who follows:** `GAME.party[0]` always (even fainted), or the first non-fainted member as HGSS and the Gen 3
   expansion do (recommended)?
2. **Size:** cap every follower at a 32×32 box (recommended, Gen 3 OAM size, matches the 32×32 Player frames), or use
   the decisions.md §6 heights up to about 38 px?
3. **Interiors and caves:** follow everywhere (recommended for caves), or hide in building interiors (all of them, or
   only species taller than the box, as HGSS `HEIGHT_RESTRICT` / expansion "indoors and > 32×32")?
4. **Toggle:** per device (`localStorage`, like the minimap) or per account (saved)? On by default?
5. **3D-only species in F1:** party icon for all directions (recommended), hide them until F3, or render walk frames
   first?
6. **Hide effect:** Poké Ball in / out (expansion style, F2) or a simple fade only?
7. **Multiplayer:** should other players see your follower (F2), and only when both have the setting on?
8. **Surf:** hide while surfing (both references), or show the follower as the Pokémon carrying the Player when it is
   the one that surfs?

**Answers (user, 2026-11-20: the recommended option for each):**
1. The first non-fainted member follows; nobody follows when the whole party has fainted.
2. Every follower fits a 32×32 box.
3. It follows everywhere, building interiors and caves included (the 32×32 cap leaves no species too large indoors).
4. Per device (`localStorage`, like the minimap), on by default; no save change.
5. 3D-only species use their party icon for all directions in F1; real walk frames come in F3.
6. A simple fade in F1; the Poké Ball in / out effect in F2.
7. Yes, in F2: other players see your follower when your setting is on; a viewer who turns the setting off sees no
   followers at all.
8. Hidden while surfing, as in both references.
