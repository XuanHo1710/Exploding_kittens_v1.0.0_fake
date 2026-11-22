# Decisions (settled)

> **New architectural decisions** (repo layout, stack, major pipelines: hard to reverse) go to [`docs/adr/`](../adr/) as a numbered ADR (Status / Context / Decision / Consequences); this file keeps the user-settled format, pipeline and game-integration choices and links to the ADR when one exists. Repo layout: [ADR 0002](../adr/0002-repository-layout.md).

Decisions the user has settled for Mons-Models and the Sodier War Pokémon demo. Follow them unless the user says otherwise; when a new decision is made, add or update it here (newest facts win, keep the date).

Last updated: 2026-11-20.

## 1. Sprite folders and files

- Layout: `assets/pokemon/<GenX-Region>/<NNN>-<Name>/`, where `<NNN>` is the 3-digit dex number and `<Name>` is exactly as in the generation's `genX-*.md` table (e.g. `083-Farfetch’d`, with the curly apostrophe).
- A finished folder holds **only** `<slug>-movement.png` (folders made before 2026-11-18 may also keep `<slug>-posses.png`). `<slug>` = lowercase name, `♀`→`-f`, `♂`→`-m`, apostrophes and dots removed, every other non-alphanumeric run → `-`.
- The user drops raw generator output into the folder as `1.png` (= posses) and `2.png` or `image.png` (= movement). **Check the aspect ratio before trusting the name**: 8×5 posses ≈ 1.6, legacy 8×6 movement ≈ 1.33, v2 movement 1.0 or 2.0. The names were swapped for Victreebel and Dewgong.
- Raw files are backed up outside the repo before normalizing. Temporary files never go into a Pokémon folder.
- `tmp/reports/mistakes.md` (`python3 tools/mistakes.py`, git-ignored since 2026-11-19) lists missing / extra files and is regenerated after every batch of changes.
- Only one tool (agy, Claude, a human) may process a folder at a time. On 2026-11-17 an agy run overwrote a finished Salamence sheet with a broken one about 2 minutes after it was fixed.

## 2. Movement sheet v2 (current format)

Source of truth: `prompts/movement/README.md` and `.agents/skills/pokemon-sprite-generator/SKILL.md`.

- **Rows = 4 directions** in this order: down, left, right, up. No diagonal views; in the game, diagonal movement uses the left/right rows.
- **Columns = a smooth 4-frame loop**: walk is contact → passing → contact → passing; fly is wings up → half → down → half.
- **Layout depends on the species' `locomotion`** in `data/pokemon/pokemon-locomotion.json` (derived from the upstream species data `behaviour.moving`, `THIRD_PARTY_NOTICES.md`):

  | `locomotion` | Grid | Size (192 px cells) | Generate at |
  |---|---|---|---|
  | `walk` | 4 × 4: Walk | 768×768 | 1:1 |
  | `walk_fly` | 8 × 4: Walk (cols 1–4) + Fly (cols 5–8) | 1536×768 | 16:9 |
  | `fly` | 4 × 4: Fly/hover | 768×768 | 1:1 |

  `aquatic: true` species use `walk`, drawn as a flop or wriggle.
- **Fly frames** are lifted about 12% of the cell height above a small dark shadow ellipse. The game draws no extra shadow or lift for them.
- **Normalize** with `normalize_sheet.py --mode move4 --layout <locomotion>`:
  - Use `--row-order 1,3,2,4` if left and right are swapped.
  - Use a negative row number to mirror a row; `1,2,-2,4` builds right from left.
- **Pose guide (THIRD reference image)** for smooth motion: `tools/pokemon/pose_guide.py` renders `Fall-back/<Gen>/<NNN-Name>/<slug>-pose-guide.png` from the 3D sheets.
  - It uses the same grid as the sheet, taking frames 1, 4, 7 and 10 of the 12-frame 3D loop.
  - The 2D sheet copies the poses but stays hand-drawn pixel art.
  - Make guides **only on request**: so far only Charizard and Venomoth have one.
- **Legacy 8×6 movement sheets** (8 directions; Walk/Run/Fly A/B; 1536×1152) remain valid. The game detects the format from the image size. Redraw them to v2 over time.
- Venomoth's v2 sheet (2026-11-17) was assembled from its own legacy frames rather than redrawn: up = Fly A, half = Run A, down = Fly B.
- **2D motion follows the 3D model, drawings stay hand-drawn** (user decision 2026-11-17). `tools/model3d/animate2d.py` re-times a 4-key v2 sheet to **12 frames per loop** (the 3D frame count):
  - which hand-drawn key is shown: fly loops follow the 3D silhouette phase (tallest = wings-up key, lowest = wings-down key, half poses by the direction of travel); walk loops play the 4 keys in step order (contact L, passing, contact R, passing) as many strides as the 3D front-view bob shows;
  - the 3D body bob and sway are applied as pixel offsets; shadows stay on the ground.
  - Frames per loop = columns ÷ (2 for `walk_fly`, else 1), so 12-frame sheets are `walk`/`fly` 2304×768 and `walk_fly` 4608×768.
  - In the game, loops of 8+ frames play at the 3D cycle (3D cycle ÷ frames).
  - Rendering the 3D model itself as pixel art (`pixel2d.py`) was tried and rejected: blocky voxel-game shapes and dull colours, clearly worse than hand-drawn.
  - Venomoth is the first sheet done this way. It now uses `animate2d_pool.py`: 12 frames per loop (2304×768) built from all 6 legacy drawings per direction, so the side views get 5–6 distinct wing poses.
    - Odd eyes in the legacy Fly B drawing were replaced with Run A eyes.
    - Facing down, the Run B (angry eyes) and Fly B poses are excluded.
    - Facing left/right, the Run A/B poses are excluded: they lean forward and raise the abdomen, which looks wrong for a hovering creature.
    - Poses are mapped by height RANK, so each allowed drawing gets a fair share of the loop.
  - **Charizard** (`walk_fly`) uses `animate2d_pool.py --loop "walk:1,4,2,4:seq" --loop "fly:5,6,1:hover"`. The result is 24 columns (4608×768): Walk 12 + Fly 12.
    - **Walk loop:** follows the step order contact-L → passing → contact-R → passing, 2 strides per 3D loop. The stride count comes from the front-view bob.
    - **Fly loop:** Fly A/B plus Walk A (wings fully spread), lifted over the shadow.
    - The 4-key and 8-frame versions are backed up in the scratchpad.

## 2b. Movement v3 (current, 2026-11-17): every frame drawn in 2D, motion from the 3D model

User decision: "bắt buộc vẽ ảnh 2D nhưng animation giống theo 3D". Re-using a few drawings and only re-timing them
(`animate2d*.py`) is NOT enough; it stays only as a fallback.

- **Loops (updated 2026-11-18, option B):** 1–3 images per species, listed by `pose_guide.py --plan`:
  - `idle` always (hovering for fly-only species);
  - `walk` if it walks;
  - `fly` if it flies;
  - `run` only on request (`--with-run`); otherwise the game plays the walk faster.
  - Each image is 4 directions × 6 frames (24 cells). 96-cell 8×12 images were rejected (too many cells for the image model).
- **The species' own `pokemon3d` animation is the mandatory reference:** every 2D frame copies the matching 3D pose. Loops that ignore it are redone.
- **One image per loop:**
  - Make a pose guide with `pose_guide.py --mode <loop> --frames 6`: 6 frames sampled evenly from the 12-frame 3D loop, 4 rows (down, left, right, up).
  - Generate at 3:2 with FIRST = reference, SECOND = the same loop cut from an example sheet (`style_example.py`), THIRD = pose guide, and the COMMON + LOOP prompt blocks. Each cell copies its pose.
- **Example sheets (2026-11-18, user decision):** `Gen2-Johto/189-Jumpluff` for species that fly (`walk_fly`, and `fly`-only) and `Gen2-Johto/183-Marill` for walk-only species replace Arceus as the SECOND (style + layout) reference for movement and posses. They are full v3 sheets: Jumpluff has walk, run and fly loops, Marill has walk and run, 6 frames each.
  - `--frames 12` (all 3D frames, 16:9) is the smoother option.
- **Normalize** with `normalize_sheet.py --mode move4 --layout loop --frames N [--air]`. Fly loops are lifted over a shadow.
- **No magenta left on any sheet (2026-11-19, user: "bộ cắt nền … không cắt thiếu nền tím nữa"):** one shared
  keyer, `tools/pokemon/magenta.py`, used by `normalize_sheet.py` (raw drafts), `clean_magenta.py` (final sheets, in
  place) and `check_magenta.py` (the audit, wired into `tools/check.sh`). It floods the key, its darker / greyed
  shades (painted shadows), flat slot panels and panel / grid border lines from the background (enclosed drawing
  pixels never keyed), and despills the 1-2 px pink / purple fringe to the body or dark outline colour it is a blend
  of (no new colours). Colours of the species' own art (its `<slug>-reference.jpg` + its Fall-back texture, and
  ≥ 7 px thick pink / purple areas such as Gastly's gas) are never touched. Guards: the normalizer stops (exit 3,
  `--allow-loss` to accept) when a slot would lose more than half of what the previous keying kept; the cleaner
  leaves a cell as drawn when it would lose more than half of its drawing. All 450 existing sheets were cleaned
  mechanically on 2026-11-19 (no redraw).
- **Assemble** with `assemble_loops.py`. It writes `<slug>-movement.png` with the loops side by side plus a PNG tEXt chunk `mons-loops` = `[{mode, frames, cycle, keys}]`, where `cycle` is the 3D loop length so the 2D loop plays at the 3D rhythm.
- **Game:** `compare_manifest.py` exposes the chunk as `movement2d_loops`, and the game plays each loop at its own cycle. Sheets without the chunk keep the v2 / legacy rules.

## 2c. Smooth 3D motion models — DROPPED (2026-11-18)

- **Removed:** the hand-built rounded 3D models (skill `pokemon-3d-motion`, `tools/model3d/smooth3d`, `charizard-smooth`). The pose guides come only from the Fall-back 3D sheets in `pokemon3d/`.
- **Species without a Fall-back 3D model** (Kyogre, Groudon, Arceus, Reshiram, Zekrom) use the v2 fallback.
- **Kept, generic:** `tools/agy/agy_pack.py` (prompt packs) and `tools/agy/compare_v3.py` (2D-vs-3D check).

## 3. Posses sheet — DROPPED (2026-11-18)

- No longer generated: the game uses only the movement loops (idle / walk / fly); the posses prompt (`prompts/posses/`) was deleted. Existing posses files (208 species) are kept and still shown in the comparison dialog. If combat is added later, make attack / hit / faint as v3 action loops copied from the Fall-back 3D `physical` / `special` / `recoil` animations instead.
- Old format, for the existing files:

- 8 directions × 5 rows (Idle, Walk, Attack, Hit, Faint), 1536×960, normalized with `--mode posses`.
- Column order: down, down-right, right, up-right, up, up-left, left, down-left.
- Direction QA:
  - Column 3 must face RIGHT and column 7 LEFT.
  - If they are reversed, use `--col-order 1,8,7,6,5,4,3,2`.
  - If both face the same way, mirror one: Dewgong `1,-8,-7,-6,5,6,7,8`, Salamence posses `1,-8,3,4,5,6,7,8`.
  - The back views (columns 4 and 6) can be right while only 2/3 and 7/8 are swapped (Salamence movement `1,8,7,4,5,6,3,2`).

## 4. Anatomy

- True proportions from the Pokémon Database artwork; never chibi.
- Limbless and unusual bodies (serpent, fish, floating, arms-only, legs-only, shell/blob) get the ANATOMY OVERRIDE line from `SKILL.md`. Never invent legs, arms or wings.

## 5. Fall-back 3D models

- **Source:** the upstream 3D model jar, version 1.7.3, in `demos/` (135 MB, git-ignored; name and URL in `THIRD_PARTY_NOTICES.md`). All 851 species are copied to `assets/pokemon/Fall-back/<GenX-Region>/<NNN>-<Name>/{models,animations,posers,resolvers,textures}/` with each species' `license`. Arceus (#493) has no model there.
- **Added 2026-11-20 from the 1.8.4 jar (same licence):** only the **54 species** the 1.7.3 jar lacks (Wurmple line, Skitty, Pawniard, Kingambit, …), base forms only (`extract_fallback.py --only-missing --base-only`); the 851 earlier folders stay byte-identical (not upgraded). The library now has 905 species; 1.8.4 has no Kyogre, Groudon, Raikou, Entei, Suicune, Arceus and most Gen 4–9 legendaries either.
- **License:** CC BY-NC 3.0 (`LICENSES/CC-BY-NC-3.0.txt`). Non-commercial, internal play only. Credit the model authors as `THIRD_PARTY_NOTICES.md` §1 does and say the models were re-rendered.
- **Pre-rendered sprites, not real-time 3D.** A custom Python renderer is used:
  - Camera: orthographic, 35° above the ground.
  - Directions: 8 yaw angles in 45° steps.
  - Frames: 12 per animation loop.
  - Smoothing: 3× supersampling, then `smooth(round_px=1.0*SS, bulge_px=2.4*SS)`.
  - Colour: saturation 1.3, depth 0.93, sharpen 0.7.
  - Output: one PNG per mode (8 cols × 12 rows) plus a JSON with `cell`, `scale`, `foot`, `cycle`, `unit`.
- **Rejected:** the "rounder" look (`round_px=4*SS, bulge_px=11*SS`). All sheets were reverted to the original look.
- **Cells:** 160 px by default, Charizard 224, Rayquaza 256. Each mode is auto-fitted on its own; new sheets are 256-colour palette PNGs.
- **Animations** come from the Fall-back posers (STAND / WALK / RUN / HOVER / FLY):
  - Species that only have an idle animation get a procedural leg swing.
  - Limbless species glide.
  - Rayquaza gets a procedural S-wave serpent flight.
- **Location:** the 3D sheets live in the game repo, `sodier-war-next/client/assets/pokemon3d/` (about 880 MB).

## 5b. 3D fallback battle sprites for species without 2D art (user, 2026-11-20)

- **User decision (2026-11-20):** every Pokémon we have must be able to appear in the game. A species with **no
  hand-drawn `<slug>-movement.png`** uses battle sprites **rendered from its Fall-back 3D model** until (if ever) it
  gets a 2D sheet. This does not reverse the §2 rejection of `pixel2d.py` for movement sheets: hand-drawn 2D stays the
  goal and always wins when it exists.
- **Tool:** `tools/model3d/battle_sprites.py` (`$MONS_PY3D`, numpy + OpenCV), resumable, parallel; log
  `tmp/model3d-batch.log`, QC `--contact N` → `tmp/report/3d-sprites/contact-*.png` + `failed.txt`.
- **Look (approved on the Salamence vs Tyranitar preview):** orthographic camera **8° above the ground** (near eye
  level, no top-down view); foe / front **yaw 140** (front 3/4), player / back **yaw 340** (back, slightly turned),
  party icon yaw 140; the §5 colour + smoothing pipeline (3× supersampling, `smooth(1.0*SS, 2.4*SS)`), alpha 0/255,
  one 15-colour BGR555 palette per image (`check_gen3.py --grid 1 --max-palettes 1`).
- **Pose:** the poser's battle pose (else `battle_idle`, else the standing / hovering idle); aquatic species
  (`pokemon-locomotion.json`) use `water_idle` so fish are upright. Two frames: t = 0 and half the loop.
- **Frame sizes since 2026-11-20:** 2× textures, 128 / 160 px frames (§5c); the 40 / 52 px below are the 1× format.
- **Files**, in the species' Fall-back folder `assets/pokemon/Fall-back/<GenX-Region>/<NNN>-<Name>/` (base form only),
  same formats as the sprites `game/tools/build_assets.py` cuts from 2D sheets:
  - `<slug>-front.png`: 2 frames side by side, each `frameW` × 40, feet on the bottom row;
  - `<slug>-back.png`: 2 frames, each `frameW` × 52;
  - `<slug>-icon.png`: 32×64, two 32×32 frames stacked, frame 2 one pixel higher (as `mon_icons.py`);
  - `<slug>-render.json`: `front` / `back` / `icon` → `file`, `yaw`, `frames`, `frameW`, `frameH`, `scale`, `foot`
    (ground point in frame pixels; below the frame for hovering species), plus `pose`, `elevation`, `size_frac`,
    `model` and the licence note. The json is written last (= done).
- **Size:** a bigger species fills more of the frame: `size_frac` 0.7 – 1.0 of the frame height from
  `pokemon_sizes.json` (`game_h` compressed like §6: ≤ 0.65 m → 0.7, ≥ 1.6 m → 1.0), measured on
  max(height, √(width × height)) so flat / wide bodies are not drawn as tall as upright ones (a placeholder size entry,
  hitbox 1 × 1 with baseScale 1, uses the Pokédex height instead); width ≤ 88 px (front) /
  120 px (back).
- **Licence:** CC BY-NC 3.0, credited in `THIRD_PARTY_NOTICES.md` §1 as re-rendered battle sprites.
- **Coverage (2026-11-20):** 666 species rendered (612 from the 1.7.3 library + the 54 added from 1.8.4); species with
  neither a 2D sheet nor a model are listed by `battle_sprites.py --contact` in `tmp/report/3d-sprites/failed.txt`.
- **In the game (2026-11-20):** `game/tools/species_assets.py` `art()`: a species is in the game when it has a 2D
  movement sheet (any generation; its file slug stays the species key) or, without one, a finished render (its
  `-render.json`; key = the PokeAPI id, e.g. `mime-jr`); the render's front / back / icon are copied unchanged into
  `public/assets/mons/` (`frontW` / `backW` from the json). Species with neither are skipped and listed in
  `tmp/report/all-species/species-export.txt`; a new render is picked up by the next `npm run assets` (run
  `tools/data/build_spawn_pools.py` again to give it spawns). 2D species without a drawn icon use the render's icon,
  else an icon cut from the front sprite. All species: §29.

## 5c. Battle sprites from the battle-pose sheets, always 2D first (user, 2026-11-20)

- **User rule (2026-11-20):** the game's battle front / back come from the 2D sheets, always 2D before 3D: the
  battle-pose sheets, else the movement sheet; only a species with no 2D sheet at all uses its 3D render (§5b).
- **Priority** (`game/tools/species_assets.py` `Art.sprite`, `game/tools/build_assets.py` `sprite_strips`):
  1. `<slug>-battle.png` (2304×768): frames 1 and 6 of the attack row (both the battle stance), columns 1-6 → front,
     7-12 → back;
  2. `<slug>-posses.png` (1536×960, older format; columns S, SE, E, NE, N, NW, W, SW): the idle row, column 7
     (down-left 3/4) → front, column 4 (straight back) → back — column 3 (up-right 3/4) is drawn from the side or the
     front on many sheets (Charmeleon, Meganium, Lanturn); one drawing, shown as both idle frames;
  3. the movement sheet (cut as before);
  4. the Fall-back 3D render (`-front` / `-back.png`, copied unchanged), only without any 2D sheet.
- **Size and sharpness (user, 2026-11-20, option B of the sharpness mock-ups `tmp/report/sharpness/`):** the sprites
  are shown in the Gen 3 box, **64 px (foe) / 80 px (player) high**, at most 96 / 120 px wide, feet on the platform,
  and drawn from finer textures: 2D sheets at the drawing's own resolution (never upscaled), at most 2× the box
  (`build_assets.py` `hires_strip`, LANCZOS + alpha 0/255); 3D species re-rendered at 2× (128 / 160 px frames,
  `battle_sprites.py --res 2`, the default; the 1× 40 / 52 px files were replaced, nothing else used them).
  `mons.json` `frontW` / `frontH` / `backW` / `backH` are texture px; `src/monsprites.ts` `monSprite(..., h)` scales
  the frame to `h` on-screen px (`BATTLE_H` 64 / 80 in battles, the old 40 / 52 in the PC box, PokéNav, summary and
  the evolution scene) and `monBase(sprite)` is that scale: every scale change of a battle sprite multiplies it
  (recall, capture ghost, move poses in `movefx.ts`, the Intro / starter pop-ups). Phaser keeps nearest filtering
  (`pixelArt`), as in mock B: the 6× canvas has 2-3 device px per texel, so it is not noisy. Move effects use the
  on-screen size: `movefx.ts` reads the sprite's alpha at its displayed size, so anchors and effect sizes follow.
  Disk: the 3D front / back (+ shiny) renders went from ~4.3 MB to ~18.5 MB; `public/assets/mons` 56 MB.
- **Shiny:** the source's `-battle-shiny.png` / `-posses-shiny.png`, else the strips recoloured on the fly like the
  species' movement sheet → `-movement-shiny.png` pair (`species_assets.shiny_map`, the colour map of
  `<slug>-shiny.json` / `tools/pokemon/shiny_recolor.py`); 3D species: the 3D shiny render.
- **Icons** stay as before (drawn `assets/ui/MonIcons/`, else cut from the movement sheet's front for 2D species).
  `mons.json` `sprite` = `battle` / `posses` / `movement` / `3d`; `npm run assets` prints the counts.

## 6. Size data

- **`data/pokemon/pokemon_sizes.json` is user-maintained** (upstream species data keyed by name: `height` dm, `weight` hg, `baseScale`, `hitbox`). It replaced the earlier generated `pokemon-sizes.json`.
- **In-game size basis:** `game_h = hitbox.height × baseScale`. Use `height_m` (Pokédex) only when the hitbox is missing (about 60 species).
- **Real-life sizes were rejected** as unbalanced (Rayquaza and Onix covered the screen). The map uses a compressed size instead:
  - drawn height in metres = `clamp(0.95 × h^0.45, 0.65, 2.4)`;
  - `PX_PER_M = 27 / 1.7`, where the hero is 1.7 m and 27 world px tall;
  - width limit `MAX_W_M = 4.5`.

## 7. Sodier War demo integration (`$MONS_SODIER_WAR`, on the original machine `~/Main/sodier-war-next`; not a git repo)

- **Server:** port 8791, invite code `bdf3fa`. A Cloudflare quick tunnel is used for friends.
- **2D sheets** are served through the symlink `client/assets/mons2d` → `Mons-Models/Pokemon`.
- **Live updates:** `tools/game/watch_manifest.py` runs in tmux next to the server and rebuilds the manifest whenever a `-movement.png` / `-posses.png` appears or changes. Only correctly named sheets count; raw `1.png` / `2.png` are ignored until normalized. Suggested tmux session `mons` with 3 windows: server, tunnel, watch.
- **Manifest:** `client/assets/compare/index.json` holds every species with `movement2d`, `posses2d`, `model3d`, `gen`, `locomotion`, size fields. Regenerate it after any sprite change.
- **Clean map:** on by default (HUD hidden), with a 👁 toggle next to the search box.
- **Search box** at the top centre:
  - Filters by name, dex number, region/gen, `2d`/`3d`, plus gen chips and "Có 3D"/"Có 2D" chips.
  - Picking a Pokémon **shows it on the map** next to the hero (3D + 2D pair with labels). It does not open the dialog.
  - **Several can be picked**; picked ones are listed first, and the selection is remembered.
  - While anything is picked, the demo wanderers are hidden.
  - **Default selection (2026-11-18):** Pikachu, Charmander, Bulbasaur and Squirtle are picked on first load (localStorage key `monsShown2`). "Bỏ chọn tất cả" empties the selection.
  - **Demo wanderers removed (2026-11-18):** `SPAWN = []` in `wildmons.js`; the map shows only picked Pokémon (no Charizard / Rayquaza / Venomoth demo at game start).
- **Comparison dialog** (⇄ button): 3D vs 2D boards, "Chọn bản 3D/2D" saved in the browser, JSON export.
- **Movement rules:**
  - `walk` species never fly and `fly` species always fly.
  - v2 2D sheets pick left/right when |dx| ≥ 0.5·|dy|.
  - Walk is 0.13 s per frame and fly 0.11 s per frame.
  - Flyers keep flapping when idle.

## 8. Repo hygiene

- **Commit / push:** only when asked, and only what was asked. The user sometimes commits sprite folders themselves.
- **Git-ignored:** `tmp/` (previews for the user) and `demos/*.jar`.
- **Never commit API keys.**
- **Pipeline scripts** live in `tools/` (see `tools/README.md`): 3D renderer and builders, `compare_manifest.py`, `mistakes.py`, data and demo scripts. Agent-facing sprite scripts (`normalize_sheet.py`, `pose_guide.py`, `fetch_reference.sh`) stay in the skill folder.

## 9. Characters (Player, NPC, Trainer) — decided 2026-11-18

Facts: `docs/explanation/research/gen3-overworld-characters.md`. Terms: `GLOSSARY.md` (Character, Player, NPC, Trainer).

- **Scope, first release (~52 sheets):** 2 Player (boy, girl; 20 since 2026-11-19, see "Imported drawn Players"), ~6 service NPCs (nurse, Mart clerk, scientist, receptionist/gate, Day Care, guard), ~12 townsfolk, ~12 Trainer classes, 8 Gym Leaders (one per gym in `tools/structures/gyms/`), 1–2 local NPCs per District (~12). Build order: Player → service → townsfolk → Trainers → Gym Leaders → locals.
- **No story characters yet:** no rival, professor, villain team or Elite Four. (Since superseded: the rival `Trainers/rival` and the `League` group below exist.)
- **Overworld sprites only.** Battle front pics (64×64) and the Player back pic come later, as a separate phase.
- **Original designs only**; generic class names are fine, no copied sprites.
- **One sprite per Trainer class**, reused on every Map; names and teams are Map data, not assets.
- **Procedural paper doll**, like the structure skill: skill `.agents/skills/pokemon-character-generator/`, engine `charkit.py`, one spec per Character in `tools/characters/chars/*.py`. Output `assets/characters/<Group>/<slug>/<slug>-overworld.png` + `.json`, groups `Player`, `Service`, `Townsfolk`, `Trainers`, `GymLeaders`, `Locals`, `League`.
- **Gen 3 hardware rules**, same as structures: 16×32 native frames (16×16 for small children), exported ×2, BGR555, alpha 0/255, ≤ 15 colours + transparent; verified with `check_gen3.py`. Scale follows the Mons 16 px Map grid; the Sodier War demo scales if needed.
- **Sheet = 4×4 grid** (not the pret 9-frame strip): rows down, left, right, up (right = mirrored left); columns stand, step A, stand, step B. 128×256 after ×2 (128×128 for children, 16×16 frames). The JSON maps cells to pret frame order. Every Character, Gym Leaders included, uses the full grid.
- **Player animations:** walk and run only. The run sheet is a separate `<slug>-run.png` on the same 4×4 grid. Bike, surf, fishing and field-move sheets wait until the game has those features.
- **Palettes:** townsfolk, service, Trainers and locals share 4 NPC palettes in the Gen 3 layout (transparent, 4 shared skin shades, three 3-shade ramps, white, black), ramps taken from the gym ramps (`MONS_PALETTE=gym`). The Player and each Gym Leader have their own palette (Gym Leader = their gym's ramps).
- **Proportions:** Gen 3 two-heads-tall look (head ≈ body, visible 19–21 px in a 32 px frame). The "never chibi" rule applies to Pokémon only.
- **Outline:** selective outline (darkest shade of each area) for NPCs, Trainers and Gym Leaders; pure black only for eyes and separations. **The Player has a black silhouette outline** (pret Brendan / May / Red / Leaf look; changed and approved 2026-11-18 with Player v3: red-white cap boy, white-beanie girl).
- **Extras:** 16×8 shadow (shown on Ledge jumps), 16×16 "!" and "?" emotes. No water reflections, no raise-hand (VS Seeker) frame.
- **Review sheets:** one `assets/characters/<group>-overview.png` per group (like the `civic-*-overview.png` sheets). Checked with `check_gen3.py --grid 8 --max-palettes 1 assets/characters`.
- **Imported drawn Players (2026-11-19):** the Player list is 20, in picker order: `player-boy` "Nam", `player-girl` "Lan" (paper dolls), then 18 sheets the user drew with an image generator: Hoa, Minh, Trang, Duy, Thư, Ngọc, Quỳnh, Phong, Hạnh, Bảo, Vy, Tuấn, Mai, Linh, Khoa, An, Na (child), Bin (child). Drawn sprites are allowed **for the Player and the League only**, through `tools/characters/import_drawn.py` (skill section "Imported drawings"). **The drawings are sources in git:** `assets/characters/<Group>/<slug>/<slug>-drawn.jpg` + one hand-made index per group (`Player/players-drawn.json`: order, Vietnamese name, gender, child, look; `League/league-drawn.json`: role, name), so `npm run regen` (`tools/regen.sh chars`) rebuilds the sheets; `draw_chars.py` skips a Character that has a drawing. No run poses were drawn: `<slug>-run.png` repeats the walk frames and the game plays them faster. Every Player JSON carries `name`, `gender`, `child`, `order`, `frame.native_w`. The Title has a picker over all of them; the naming step offers a drawn character's own name first (NAM / LAN head the boy / girl lists).
- **Drawn Player size (2026-11-19, user: "test các hướng đi rồi chọn hướng tốt nhất"):** the drawings are about 24 px wide and 37 px tall at their own pixel size, so the first import (fit the widest frame into 16 px) shrank them by a third: 20–26 px tall, soft faces, eyes melting into the hair, and the wide poses (Hạnh's ponytail, Bin's net) made those Characters smaller. Tried side by side at game scale and walking in tall grass (`tmp/report/player-options.png`, `player-options-ingame.png`): a) 16×32 at 26 px with the overhang cut (cuts ponytails, the net, Phong's racket); a') 16×32 scaled from the body width (heights jump from 26 to 30 between Characters); b) 32×32 as big as the frame allows, 30 px (towers over the 21 px boy and every NPC); **c) chosen: 32×32 frames, every adult 26 px and every child 22 px tall, eyes kept** (found in the drawing and forced to 1 px dark with skin around), nothing cut. Why: one height for everyone (heights no longer depend on how wide a pose is), the face reads at 1×, 26 px stays within a head of the 21 px paper dolls and NPCs, and 32×32 is a real GBA OAM sprite shape at the same pixel scale (one pixel scale for all sprites; no half-scale rendering). Engine: `players.json` gives `frameW` per Player, Boot loads the sheet with it, World draws it bottom-centred on the tile as before (tall grass still hides the feet). NPCs stay 16×32.
- **Drawn League (2026-11-19):** the user also drew the Elite Four and the Champion, this time kept within 16 px width. They are imported the same way into `assets/characters/League/<slug>/` (16×32 frames, 26 px, or less when the widest frame would pass 16 px: Lorelei 25), replacing the paper dolls (`chars/league.py` stays for reference, JSON `source: "drawn"`, `role` / `name` kept). Not in the picker.
- **League group (2026-11-19):** the Elite Four and the Champion are paper dolls in `tools/characters/chars/league.py` → `assets/characters/League/<slug>/`: `elite-lorelei` (e4-1), `elite-bruno` (e4-2), `elite-agatha` (e4-3), `elite-lance` (e4-4), `champion`. Each has its own ≤ 15-colour palette from the gym ramps (like Gym Leaders). Outfit, colours and silhouette were read off the 3D reference skins (front / side / back renders in `tmp/`, never in the repo) and redrawn at Gen 3 scale, no pixel copy. The Champion is the rival DUY: same face, spiky timber hair and gold scarf as `Trainers/rival`, in a dark long coat and violet trousers.
- **Drawing method (2026-11-18, after review):** layers are hand-shaded in role + shade characters (palette indices, the Gen 3 way), not auto-shaded masks; the first auto-shaded draft read as flat and was rejected. Proportions copy the measured pret people (14 px head, low face, eyes 2 px apart, short arms), designs stay original.

## 10. Screens and UI — decided 2026-11-18

Skill: `.agents/skills/pokemon-ui-generator/`. Output: `assets/ui/`.

- **Screens are widescreen, not the GBA 240×160:**
  - PC: 320×180 native, ×6 = 1920×1080.
  - Phone: 390×180 native (19.5:9), held landscape, ×6 = 2340×1080. Touch controls: a round stick on the left (replaced the D-pad 2026-11-19), A and B on the right, a ☰ menu button at the top right. The ☰ is also on PC in the World (click = START, next to the online chat button; user 2026-11-19: "pc thì mất nút menu setting"), so the start menu leaves 28 px free at the right on both. A touch device takes the 390 layout from its physical screen ratio (`screen.width / height`), not the first viewport.
- **All text is Vietnamese.** The pixel font is Mons's own and composes every Vietnamese diacritic. Pokémon names stay as they are.
- **Mons's own UI language, not a GBA copy** (the first GBA-style mock was rejected as too close a copy):
  - 45° chamfered windows with a navy outline, cream paper and an accent frame that follows the current District, its colours taken from that gym's ramps;
  - speaker tabs on text boxes;
  - Start-menu icon cards, where the selected card slides out;
  - battle HUD: slanted panels with a type-coloured edge, 12-segment HP, hexagon level badges and a navy dock at the bottom. *(Replaced 2026-11-19 by HUD v2 below; the arena of ADR 0001 is unchanged.)*
- **Battle HUD v2 (user, 2026-11-19, a later handheld-generation screenshot: "đổi ui thành như này (không sửa sàn đấu nhé), có hiện những chỉ số đã bị giảm hoặc tăng nữa"; `game/src/battlehud.ts`):** only the HUD and menus changed; the Battle Scene, platforms, sprite places and the move / ball / send-out animations stay.
  - HP boxes drawn by code (no copied art): light grey, 1 px dark outline, a stair-step slanted inner edge, running off the screen edge: the foe's top-left (name, ♂ blue / ♀ red / nothing when genderless, "Lv.N", the caught mark = a small ball in wild battles for species already caught, "HP" tag + smooth bar green > 50 % > yellow > 20 % > red), the player's right-middle (the same + "cur/max" + a thin blue EXP bar). The status tag (BỎNG, TÊ …) sits left of the "HP" tag.
  - Bottom: the navy dock stays; a white text box (dark frame, grey bevel) full width for battle text, narrowed bottom-left for "<Tên> sẽ làm gì đây?" beside the four command cards ĐÁNH, TÚI, ĐỘI, CHẠY in a 2×2 grid. The cards keep the UI kit's look (cream, navy outline, teal when selected, the old icons; user, same day: "giữ lại màu/style của 4 nút cũ, nhưng bố cục 2x2"; a first try with red / orange / green / blue buttons was rejected); one tap picks.
  - Move menu: four cards of the same style over the whole bottom with the name, "PP n/max" (amber at ≤ 1/4, red at 0) and the type icon; one tap picks, LẠI on the phone, B on PC.
  - **Stat stage chips:** each changed stage as a chip "ATK / DEF / SP.ATK / SP.DEF / SPD / ACC / EVA" + ▲ green (raised) or ▼ red (lowered), one arrow per stage up to 3, then "▲4" … "▲6"; a compact 3×5 pixel font drawn by code. Foe: rows under its box; player: rows left of its box, growing upward, never over the back sprite. HP has no stage in the rules, so no HP chip. The battle core sends `{ t: "stages", who, stages }` on every change (moves, abilities, berries, White Herb, Haze, Psych Up, Transform, Belly Drum, Trainer X items, Baton Pass after the switch); a switch-in or a faint clears the side's chips; they end with the battle.
  - **Types and ball rows (user, 2026-11-19: "số lượng trainer đang đấu đang có (dùng poke ball), nếu đã chết thì ô đó trống và chỉ hiện hình tròn màu xám"):** each box shows the active Pokémon's 1–2 types as chips in the type icon's colours with the Vietnamese name (the foe's box grew a third row for them, h 30 → 42; the player's sit as tabs on top of its box, right-aligned, since its hp-text row has the status tag above and EXP below), from the battler's live types (Conversion, Camouflage, Transform). The ball row follows the user's reference picture (`tmp/mons-refs/battle-ui/party-balls-ref.jpg`): always 6 slots of 7 px, empty slots and fainted members as thin grey circles on the left (a faint light fill so they read on any ground), the members able to fight as small red / white balls on the right; the foe's directly under its box (right part, the first row of stat chips stops before it), the player's directly above its box (left part, left of the type tabs), never over a box or a sprite. Trainer battles show both rows; wild battles only the player's (one ball for a lone wild Pokémon said nothing). The active member counts by the HP its box shows, so its ball greys when the bar empties.
  - **Effectiveness tags (user, 2026-11-19: "trên mỗi ô skill sẽ ghi thêm effective x2 màu xanh, super effective x4 màu cam, not very effective x0.5 xám, immune xám"):** each move card has a small pill left of the type icon on its PP row: "×4" orange, "×2" green, "×0.5" / "×0.25" grey, "×0" dark grey; no tag at ×1 and none on status moves; fixed-damage moves (Seismic Toss, Sonic Boom, Counter …) only "×0" when immune. Computed when the menu opens by the core (`knownEffect`, `src/battle/damage.ts`): the 18-type chart, Foresight, the move's real type (Weather Ball in weather, Hidden Power), and an immunity ability (Levitate, Volt / Water Absorb, Flash Fire, Soundproof) only after the foe has shown it — a hidden ability is never leaked (the AI's rule too).
  - **Move info popup (user, same day: "thêm dialog description khi hover vào skill, chủ yếu hiện power, pp, mô tả ngắn"):** a UI-kit window right-aligned above the player's type tabs (176 px on PC, 230 on phone; it covers only the arena, never an HP box): type icon + name, category pill Vật lý / Đặc biệt / Trạng thái, PP cur/max, **Sức mạnh** and **Chính xác** ("—" for status / never-miss), and a short Vietnamese description on at most two lines. PC: hover a card, or rest the key cursor 400 ms on one (only after key input); touch: hold a card 350 ms, release closes it without picking, a short tap still picks (on release). It closes with the menu. The descriptions are generated from the effect data by `tools/data/build_move_descriptions.py` → `data/battle/move-descriptions-vi.json` (scripted moves have hand lines; the script fails when a line wraps past two lines at the PC width), exported as `desc` in `assets/data/moves.json`.
- **Start menu has no SAVE entry:** MONDEX, ĐỘI HÌNH, TÚI ĐỒ, THẺ, CÀI ĐẶT, THOÁT. *(Reversed 2026-11-19, §21: LƯU comes back with the online save.)* Battle menu: ĐÁNH, TÚI, ĐỘI, CHẠY.
- **Battle framing is pulled back** (user feedback: too close):
  - Wide Battle Scenes are 390×180 (`battle_scene.py --frame=wide`, files `*-wide.png`); the PC shows x 35..354.
  - Platforms are 92×22 and set wider apart, centred at (271, 76) for the opponent and (127, 114) for the player.
  - Pokémon are about 40 px (opponent) and 52 px (player). The ground stops at the dock (y 128).
  - The 240×160 scenes stay as they are.
- **UI assets are exported at native size** (×1). The engine scales the whole screen by an integer.
- **The overworld is zoomed out further than the UI** (user, 2026-11-19: characters and assets looked too big; "small and easy to read like Pokémon Revolution Online"; research `docs/explanation/research/pro-view-scale.md`):
  - The canvas is 1920×1080 on PC (2340×1080 on phone). UI scenes keep drawing in 320×180 / 390×180 coordinates through a camera at zoom 6 (`UI_SCALE`), so the UI keeps the ×6 look.
  - The world camera is at zoom 3 (`WORLD_ZOOM`): a 640×360 world view, 40 × 22.5 tiles on PC (48.75 on phone), 48 px per tile on 1080p. Tried and rejected: zoom 6 (20 tiles, too big), zoom 4 (30 tiles, "smaller still").
  - **Phone zoom (user, 2026-11-19, iPhone: the room was a small box in a black screen):** on a touch screen the world camera is at zoom 5 (`PHONE_ZOOM`, 13.5 tiles of height, Gen 3 shows 10); a map shorter than the view (an interior) zooms in until it fills the screen height, whole zooms only, up to 8 (`PHONE_ZOOM_MAX`, `worldZoom()` in `game/src/screen.ts`). The PC keeps zoom 3. Tried: 4 (17 tiles, too small on a 6-inch screen).
  - All maps were redesigned ×2 per axis for this view (user: "much, much bigger"); map sizes and layout rules live in the map skill.
- **Phone screen and Home-Screen app (user, 2026-11-19, iPhone screenshots: the canvas was shifted right, ran past the bottom, had blue lines and a dot, and the home-indicator swipe got in the way):**
  - The canvas always fits the visible, safe part of the screen: `game/src/fit.ts` sizes the host box from the screen area minus `env(safe-area-inset-*)` (plus 6 px more above the home indicator), Phaser FIT scales the 390×180 canvas into it and centres it; the rest is the page colour `#1c1e3a`. Re-fit on resize, rotation, `pageshow`, focus changes, a few times after launch (iOS reports the size late) and once a second.
  - **Hotfixes (user, 2026-11-19, iPhone: "màn bị lỗi rồi, nhỏ quá", the game was a 390×180 px box; then a black screen):** the screen area never trusts one source. Not the raw `visualViewport` (the on-screen keyboard of the login / chat shrinks it to about half and iOS can leave it small), and not `screen.*` + `screen.orientation` (a Home-Screen app branch that turned the screen by a stale orientation pushed the canvas off a real iPhone). It is the window (`innerWidth × innerHeight`; `clientWidth/Height`, `visualViewport`, then the screen when those read 0), narrowed by `visualViewport` only when that is ≥ 75 % of it (toolbars) and, on a touch device, by the physical screen turned the way the window is; never larger than the window, and under half its area falls back to the window. Nothing is re-fitted while a text field has focus; on blur the page is scrolled back to 0, 0. `?debug=1` or 5 quick taps in the top-left corner shows the fit numbers (window, viewport, screen, standalone, chosen box, canvas rect) for a phone screenshot.
  - **Portrait phone layout (user, 2026-11-20: "responsive cho màn hình đứng trên điện thoại", reviewed into 3 rows):** a touch screen with `innerHeight > innerWidth` no longer shows "Xoay ngang"; it stacks three rows (`game/src/portrait.ts` + `portrait.css`, sized by `fit.ts`). Row 1 is the game view only, full safe width (whole device px per SCREEN px when that keeps ≥ 90 % of the width) and as tall as the rest allows: the canvas grows to SCREEN.w × (view rows + 56), the World's camera fills the view rows (more map, same zoom) and its UI camera keeps SCREEN rows 0–124 (minimap, start menu). Row 2 is a small world chat strip (4 lines, scrolls up through 50, a tap opens the chat window, the online count as a chip on its border); it is gone when CÀI ĐẶT "Khung chat" is off, and row 1 takes the room. Row 3 is the bottom band of the screen (the World's text box and yes / no box from SCREEN y 124, drawn by a band camera below the view rows; the battle dock and move menu from y 128), clipped off the game box and copied into the pad after every frame (`preserveDrawingBuffer` on touch screens; taps on it go back to the canvas as mouse events), above the controls: the round stick, A / B, MENU (= START) and CHAT pills. The World shows the band only while a text box or the yes / no box is open. A battle shows its 128 arena rows in row 1 and no pad: row 3 is only the battle dock, which `Battle.ts` lays out in portrait as a 195-wide column below the screen rows (text box on top, the 2×2 commands under it, the moves in one column with a full-width LẠI) and the pad shows at 2× (user 2026-11-20: bigger cards and text); text advances by a tap, LẠI goes back. Evolve and intro keep the 52-row band plus the pad (the evolve B-cancel button stays). Full-screen menus (title, bag, party, PC, PokéNav, settings, the shop) keep their layout but zoom up to 1.6× (user 2026-11-20, option B), wider than the phone: a touch layer over them sends taps (and up / down drags) to the game and pans on sideways drags; the pad shrinks to B ĐÓNG, a pan bar and A CHỌN. The controls only send input: each press is the action's own key (first bound slot in `keys.ts`) dispatched on `window`, so every scene reacts as to the keyboard and holding B runs. Turning the phone re-lays out live; landscape and PC keep the plain SCREEN canvas, unchanged.
  - Home-Screen web app: `apple-mobile-web-app-capable`, status bar `black-translucent`, `viewport-fit=cover`, `game/public/manifest.webmanifest` (`display: fullscreen`, landscape, "Mons") and icons in `game/public/icons/` (`tools/ui/app_icons.py`). iOS cannot hide the home indicator, so nothing interactive sits in the bottom band.
  - Touch controls (`game/src/input.ts`, `TOUCH`): the stick has its home at the bottom left and follows the thumb anywhere in the lower-left zone; it maps to the 4 grid directions by the dominant axis with 30 % hysteresis (no flicker on diagonals), dead zone 30 %, pushed ≥ 90 % = run (as holding B). Stick, A and B keep ≥ 10 px (native) from the canvas edge. On the phone the overworld text box sits between the stick and A / B, the yes / no box clear of A.
- **PC key settings (user, 2026-11-19: "setting phím tắt"):** START → CÀI ĐẶT opens the key screen (`game/src/scenes/Settings.ts`, `game/src/keys.ts`): two keys per action (Lên, Xuống, Trái, Phải, A, B, START, Bản đồ; Tắt / bật tiếng until v0.16, §27), A on a slot waits for the next key (Esc cancels, Delete clears), a key already used elsewhere swaps places, MẶC ĐỊNH restores the defaults (arrows / WASD, Z / Space, X / Esc, Enter, M (BẢN ĐỒ since §27); Backspace and Shift always count as B). Saved per device in `localStorage` (`mons-keys-v1`). The Title shows the current keys on PC. The last row is ĐỔI TÊN, MẶC ĐỊNH, XONG, with the current trainer name at its left (§24 "Trainer name").
- **Name window (2026-11-19):** the trainer name is typed in an HTML window over the canvas (`game/src/net/name.ts`, styled like the login window: cream paper, navy outline, teal frame), on PC too, so the Vietnamese IME (Telex / VNI) and the phone keyboard work; a Gen 3 letter grid was not drawn because it cannot type the Vietnamese marks well. Two steps as Gen 3 asks back: the field (letter count x/10, suggestion buttons in the Intro) → "Tên của bạn là X?" / "Đổi tên thành X?" KHÔNG / CÓ. Enter confirms, Esc goes back (closes only in CÀI ĐẶT); presses inside the window never reach the game below.
- **Gym badges:** each badge has its own silhouette per District (user feedback, 2026-11-18): flame, scallop shell, leaf, bolt, cut gem, stepped mesa, toadstool, crescent and star. No shared round frame. *(Replaced 2026-11-20 below.)*
- **Badge case HUY HIỆU (user, 2026-11-20: the first-region badges as the look, plus a screen to view them):** the first-region badge art exists only in the content pack's badge add-on (CC BY-NC-ND, not the MPL-2.0 upstream source), so nothing is copied: `tools/ui/badges.py` redraws the shapes of the user's reference panel (`tmp/mons-refs/badges-reference.png`) from polygons, matched by the gym each Mons gym stands in for (trainers.json `frlg_gym`): grass = rainbow diamond, psychic = gold disc, electric = sun, water = drop, rock = grey gem, ground = leaf on a stem, poison = heart, fire = flame. Files `assets/ui/Badges/<gym>-badge.png` (32), `-badge-small.png` (16), `-badge-locked.png` (dark silhouette); the 24 px set is gone. START → THẺ opens HUY HIỆU (`game/src/scenes/Badges.ts`; the old THẺ text box is gone, the start menu has no room for a 12th entry online): trainer line, 8 slots in gym order (4 × 2), won = colour + name, not won = silhouette + "???"; under them the selected badge's type and when it was won (`GAME.badgeTimes`, set when the Leader is beaten; older badges say "chưa ghi thời gian"), "Giới hạn cấp hiện tại: Lv N" and the next District gate. A / a tap on the selected slot opens its gym type, Leader and city (also for the next gym to beat; the later ones stay "???"). The gym list comes from `assets/data/badges.json` (`build_assets.py export_badges`: trainers.json + the map whose door leads to the gym). The other player's card (THẺ HUẤN LUYỆN VIÊN) shows the won badges at 16 px (`badgeNames` in the profile card; an older server's count fills them in gym order).
- **Item icons are 24×24** (the Gen 3 bag size). They are drawn in the Pokémon item-icon style but are original pixels.
- **Item icons from the reference engine (2026-11-19):** user: "về danh sách vật phẩm held và evo items, … chuyển … thành 2d và sử dụng đi", then all Gen 1–3 items the reference has art for. `tools/ui/import_item_icons.py` converts its 16×16 item textures (MPL-2.0, `assets/ui/Items/LICENSE.md`) to 24×24: Scale2x + colour-majority resample to fit 22 px, outline where the edge is light, Gen 3 pass (≤ 15 colours). 130 icons: 12 evolution items, 35 hold items, 43 Gen 3 berries, 28 medicine, 7 battle items, 5 fossils; entries `"source": "reference"` in `assets/ui/Items/items.json` (name, en, pocket, kind, desc). The 12 hand-drawn icons stay (`"source": "drawn"`, `draw_ui.py` keeps the imported entries). Reference-only items (apricorns, mints, candies, food, sweets…) and balls (own sprites, §18) are not imported.
- **Poké Ball names are English everywhere (user, 2026-11-19):** Poké Ball, Great Ball, Ultra Ball, Master Ball, Safari Ball, Net / Dive / Nest / Repeat / Timer / Luxury / Premier / Dusk / Heal / Quick / Cherish / Level / Lure / Moon / Friend / Love / Heavy / Fast / Sport / Park / Dream / Beast Ball, also inside Vietnamese sentences ("Bạn ném một Poké Ball!"). Replaces Bóng Mon / Bóng Lớn / Bóng Siêu …; every other item name stays Vietnamese. Sources: `game/src/items.ts`, `tools/data/catch_rates.py` → `data/pokemon/pokemon-capture-rules.json` `name` (→ `items.json` via `game/tools/world_assets.py`), `tools/ui/uikit.py` → `assets/ui/Items/items.json` (drawn entries), `tools/items/catch_anim.py`.
- **Menu lists on touch (user, 2026-11-19, iPhone: the Mart list could not be scrolled and the D-pad covered it; "chia từng tab ra"):** a long menu list is split into tabs and every list takes touch directly: drag the rows (one row per row height, no momentum), drag the scrollbar thumb or tap its track, tap a row to pick it and tap it again to confirm, mouse wheel on PC (`game/src/scrolllist.ts`). A menu that covers the screen (the Mart) hides the stick, A / B and ☰ (`Input.setMenuMode`) and draws its own tappable buttons (MUA, ĐÓNG, ±); the touch controls come back for the clerk's messages.
- **Bag (game):** pockets THUỐC, BÓNG, VẬT PHẨM, QUẢ (tappable tabs); the bag list scrolls by keys, drag, scrollbar and wheel. Medicine and the cure / HP berries work from TÚI ĐỒ (Gen 3 amounts); evolution stones evolve at once through the Evolve scene (Gen 3 table, cannot be cancelled); hold items, battle X items, PP items, vitamins and fossils are data only for now. The department store (hub-city) has a clerk on both floors: 1F the normal Mart stock, 2F Fire / Water / Thunder / Leaf Stone (2100 đ, FRLG Celadon), Hyper Potion, Max Potion, Full Heal. Moon and Sun Stone are found items.
- **Loading screen, login backdrop and app icon (user, 2026-11-19: "thêm task cho agy vẽ màn hình loading nữa, với vẽ favicon và login game luôn"):** drawn by agy, one `generate_image` each, accepted as drawn (`tools/agy/ui_pack.py`); the loading art was then drawn by the user instead (`ui_pack.py normalize loading --anchor 1 --patch …`, a corner mark painted over). Loading and login are 390×180 backdrops without text (`assets/ui/Screens/`). Loading screen (Boot scene pack): what is loading by group with a count ("Đang tải Pokémon... (18/442)", "Đang kết nối máy chủ..." online), 4 dots that light up in turn, and the user's bar style: 26–74 % of the width near the bottom, light outline with cut corners, navy track, 45° green stripes scrolling right, % at its right end; the HTML login window covers the login art (`.mons-ov.mons-login`, `background-size: cover`). The app icon is Mons' own emblem (not the official ball), 64×64 in `assets/ui/Icons/app/`; `tools/ui/app_icons.py` builds the favicon and Home-Screen icons from it.
- **Party icons:** 32×32, 2 frames (a hop), generated from the movement sheets.
- **PokéNav (2026-11-19):** user: "làm pokenav giống <the reference> để biết chỗ đó có thể xuất hiện pokemon nào", then the reference's layout from a screenshot with Mons' own 2D sprites. Start menu entry **POKÉNAV** (after MONDEX, icon `nav` in `Icons/icons.png`). A handheld drawn in code (no AI art, nothing of the reference's art or text), grid of cards (8 per row on PC, 9 on the phone, 3 rows; user: "hiện model nhỏ hơn nữa, 1 hàng hiện 8 con"): party icon at 24 px on a terrain-coloured platform, Poké Ball if caught, silhouette + "???" if never seen (conditions hidden too, like the reference's default), chance with a decimal comma. It reads the step roll's own tables (`encounter.ts` `tableFor`, §15): no bucket roll exists in Gen 3, so rarity is a label from the slot share (20 / 10 / 5 % thresholds) and the reference's "apply bucket chance" box becomes **Tỉ lệ mỗi bước** (rate × 16 / 2880 × share). Other phases / weathers are viewable. Tracking (THEO DÕI) is a hint card on the overworld (steps, here or not) and never changes the odds; the reference does not change them either. Research: `docs/explanation/research/pokenav.md`.
- **UI polish pass (user, 2026-11-19: "design lại đi, nó tràn rồi", the PC icons overflowed and the online badge covered the shop / PC):**
  - **HỘP PC** (`game/src/scenes/PcBox.ts`, Gen 3 RSE storage layout): the box on the right as 6 × 5 cells of 30 px with a checkerboard wallpaper per box, `◀ HỘP n  k/30 ▶` above it (tap the arrows, wheel over the box, or left / right on the header); the Pokémon under the cursor on the left (front sprite, name, gender, hexagon level, held item); the party under it as 2 × 3 icon cells, the selected one bobs. A opens GỬI / RÚT, DI CHUYỂN (lift it, put it down on any cell or party slot, swapping), THÔNG TIN, THẢ (asks CÓ / KHÔNG, default KHÔNG), THÔI. A party always keeps a Pokémon able to fight. 14 boxes of 30; `GAME.box` stays a dense list and each stored Pokémon keeps its cell in `boxSlot` (box × 30 + cell; a new catch takes the first free cell).
  - **Icons never leave their cell:** the 32 × 32 party icons only use columns 1..30 and rows 1..30 (frame 0) / 0..29 (frame 1), so a box cell shows the 30 × 30 crop of frame 0 and a party cell the 30 × 31 crop of both frames, at ×1.
  - **Online badge, chat button, ticker** show only on the bare overworld: hidden while the World shows a menu, a text box, the shop or a choice, and while any screen (bag, PC, PokéNav, battle ...) runs over it.
  - **Battle status tags** hang off the HUD panel, right-aligned to the level badge (under the foe's panel, over the player's), so a long name + BỎNG never covers the level. *(HUD v2: inside the box, left of the "HP" tag.)*
  - **Start-menu clock** window grows with its longest line ("18:30  CHIỀU TỐI").
  - **Sweep fixes (checked by a text / sprite overflow pass on every screen, PC 320 and phone 390):** THÔNG TIN stats 12 px apart with the EXP line and the IV / EV heads in the first row (the marks of ĐẶC THỦ hit the dots of ĐẶC CÔNG at 10 px), PP right-aligned in the move cards; TÚI ĐỒ rows 24 px with the item icon at ×1 (was ×0.75); MONDEX 5 rows of 31 px with the icon's 30 × 30 crop and the number over the name; CÀI ĐẶT key cells 14 px tall; the place-name sign goes away when the start menu or the shop opens.
  - **Shop tabs:** when the 9 tabs do not fit (320 px), the tab row scrolls to keep the chosen tab in view with ◀ / ▶ buttons at its ends (left / right keys change tab); an unaffordable price on the selected (teal) row is light red on a dark shadow.
- **World chat box (user, 2026-11-19: "hiện khung chat thế giới ở đây"; `game/src/net/feed.ts`):** a see-through window at the bottom left of the overworld with the last 5 lines ("Tên: tin nhắn", newest at the bottom; "X đã vào / đã rời trò chơi" dimmer, from the online list). PC: always open on the overworld (user: it must not fade), hidden only by a battle, a screen over the World, the shop and the text box (they cover the same corner); it stays beside the start menu. Phone: above the stick, clear of A / B; fades to one line "💬 Chat (N mới)" 15 s after the last line and comes back on a new one; only that line takes taps, so the stick zone stays free. Click / tap (or T on PC) opens the chat window. CÀI ĐẶT "Khung chat: HIỆN / ẨN" (row Hiển thị; default HIỆN, `localStorage` `mons-chatbox-v1`); with it off the old one-line ticker comes back. The CÀI ĐẶT message line moved into the title row. "Phone" here means the 390 layout (`SCREEN.phone`, the one with the stick).
- **Beds heal the party (user, 2026-11-19: "nói chuyện với cái giường sẽ được hồi máu pokemon"):** A in front of any interior bed (grid cell `b`, exported as `beds` by `game/tools/build_assets.py`; the Player's room, houses, lighthouses) works like Gen 3's rest at home: "Bạn nằm nghỉ một lát..." with the talk sound, a fade to black and back with `center-heal`, the Pokémon Center's own heal (HP, status, PP), "Các Pokémon đã hồi phục hoàn toàn!", then an online save.
- **Round minimap (user, 2026-11-19: "cho thêm minimap tròn", top left — the top right keeps the online badge; `game/src/minimap.ts`):** 49 px pixel ring at (4, 4) (navy outline, teal accent, cream border, red north notch), 1 px per map cell (2 px in rooms smaller than the view), north up, colour-coded from collision + behaviour (floors / paths, short and tall grass, trees, water, walls, doors / mats / stairs / warps highlighted), the Player as a blinking dot in the centre, other online players as coloured plus signs; NPCs and Trainers are not shown (v2 with roofs, place icons and a tap to BẢN ĐỒ: §27). Dark caves without Flash show only the 4 cells around the Player. Base image cached per map, the view redrawn only when a cell changes. Hidden with the start menu (its clock window sits there), text boxes, the shop, choices, warps and every screen over the World; the Gen 3 place name and the PokéNav tracking card move right of it. Tap: nothing (no world map screen yet). CÀI ĐẶT: the chat toggle and this one share one row, "Hiển thị": "Khung chat: HIỆN / ẨN" and "Bản đồ nhỏ: HIỆN / ẨN" (`localStorage` `mons-minimap-v1`), so the screen still fits 180 px.

## 11. Pokémon stat system — Gen 3 (decided 2026-11-18)

Data: `data/pokemon/pokemon-stats-gen3.json`. Rules: `docs/explanation/spec/06-gameplay-systems.md` §3. Terms: `GLOSSARY.md` (Stat, IV, EV, Nature, Ability).

- **Gen 3 stats replace the Gen 1 DV / Stat Exp system.** The user asked for natures and abilities, which only fit six stats.
  - Six stats: `hp atk def spa spd spe`. Note that `spd` is now Special Defense and `spe` is Speed.
  - IVs 0–31. EVs 0–255 per stat, 510 in total, earned from each species' `evYield`.
  - The Gen 3 stat formula, with 25 natures at ±10%.
  - One Gen 3 ability per Pokémon, from its species' one or two.
- **Battle rules stay Gen 1:** 15 types, physical / special decided by move type, the Speed-based crit rate. *(Reversed 2026-11-19 by §21 answer 1: latest-generation crit, 18-type chart, latest species / move types, split per move.)*
  - Special moves use SpA against SpD.
  - The Volcano Badge boosts both SpA and SpD.
  - Growth raises SpA, Amnesia raises SpD, Psychic lowers SpD.
- **Source:** abilities and EV yields for #001–151 come from pret/pokeemerald `species_info.h`, not from memory. The Vietnamese names of natures and abilities are Mons's own.
- **Save format:** `ivs`, `evs`, `nature`, `ability` (spec 07).
- **Summary screen:** each stat row shows the value, IV and EV. The stat a nature raises is red and the one it lowers is blue. The nature and the ability, with its effect, are shown below.

## 12. Move effects (2026-11-18)

- **Display:** the Gen 3 battle screen (reference `assets/skills/image.png`). The player's Pokémon sits bottom-left seen from behind, the opponent top-right seen from the front, with a text box below.
- **How effects are built:** every move = **2 images of 8 frames** drawn by agy. Image 1 `-cast` goes on the Pokémon using the move; image 2 `-effect` is the move itself (frames 1-4 travel, 5-8 impact). They are stored in `assets/skills/<GenX-Region>/<English move name>/`. Code plays CAST → EFFECT along the archetype path → HIT (hit-stop, flash, shake). Procedural strips fill in until agy draws them. Images never contain Pokémon or the battle scene.
- **Data:** `data/battle/moves.json` holds 919 moves with their battle data and VFX archetype, built by `build_moves.py` from PokéAPI with keyword rules and `OVERRIDES`.
- **Skill:** `.agents/skills/pokemon-move-vfx`. Move lists stay in `assets/skills/<GenX-Region>/`.
- **Size and position:** effects scale with each Pokémon's real size, and battle sprites are sized from Pokédex height like the Gen 3 64 px box. Image 1 sits on the body, the back (behind the sprite, e.g. Eruption) or the ground, via `vfx.cast`.
- **Per-move tuning:** optional `<identifier>-vfx.json` in the move folder (scale, w, h, x, y for cast and effect), applied on top of the automatic size-following scale.
- **Review:** the `pokemon-move-review` skill checks every move on both sides with a big and a small Pokémon. It measures size, position, coverage and screen bounds, writes PASS/WARN/INFO, and suggests `-vfx.json` tuning.
- **Body anchors:** a move comes out of a body part (mouth, vent, hand, feet, body), not the sprite centre. Points come from the Fall-back 3D model (idle pose, same camera) in `data/pokemon/pokemon-anchors.json` and can be fixed per species in `<slug>-anchors.json`. Torkoal and Typhlosion are done first (2026-11-18).
- **Anchors for all species:** `build_anchors.py --all` covers all 851 models. `anchor_check.py` filters automatically: OK means agy does not need to look; CHECK writes a marked image. On the first run, 140 species with sheets were OK and 66 need a look. Agy checks and fixes anchors as the last step after drawing a movement sheet. The check costs no image generation.
- **Battle poses, level A (2026-11-18):** code-only squash, stretch, lean and knock-back of the one battle sprite for physical, special and self moves, hurt and faint, applied to every Pokémon. Level B (agy-drawn `<slug>-battle.png` from the 3D `physical`/`special`/`recoil`/`faint` animations, which only 10–26% of models have) is deferred.
- **Battle poses, level B:** `<slug>-battle.png` holds 4 rows (attack, hurt, dodge, faint) × 12 columns (6 front + 6 back), drawn by agy as 2 images (one per view, 3:2) with the movement sheet as the design lock. Starters come first, then popular species. Progress is tracked in `assets/pokemon/battle-animations.md` (`tools/data/battle_status.py`). The renderer uses the drawn frames when present, level A otherwise.
- **Separate skill:** battle poses have their own skill, `pokemon-battle-poses` (2 images → `<slug>-battle.png`), so agy no longer falls into the movement pipeline.
- **Diagonal battle screen (2026-11-18):** the opponent stands top-right facing the lower-left (the movement sheet's down-right column, mirrored), and the player's Pokémon stands bottom-left seen from behind facing the upper-right (the up-right column). Battle poses are drawn in these 2 directions. Anchors also have diagonal views (`front_d`, `back_d`; yaw 135 / 315). 4-direction v3 sheets keep straight front/back until they get a battle sheet.
- **Learnsets (2026-11-18):** `data/pokemon/pokemon-learnsets.json` (`tools/data/learnsets.py`, PokéAPI) lists, for each species, the moves it learns by levelling up and by TM/tutor, taken from the newest main game it appears in. Scarlet/Violet has no tutor data, so tutors come from the newest game that has them. Move identifiers match `data/battle/moves.json`.
- **Facing rule:** the opponent is always top-right looking bottom-left, and the player's Pokémon is always bottom-left looking top-right. 4-direction v3 sheets use the "left" row for the opponent (anchors view `front_s`, yaw 90) until they get a battle sheet. `assemble_battle.py` checks the facing of agy's battle drawings by colour against the design lock, flips wrong views and reports UNSURE ones.
- **Species notes and prompt fixes (2026-11-18):** `data/pokemon/pokemon-notes.json` stores per-species drawing notes that both prompt packs add automatically. Battle normalizing uses `normalize_sheet.py --keep-x`, so dodges and lunges keep their sideways move. The battle prompt no longer asks for a ground shadow, requires frames 1 and 6 to be turned 3/4 toward the foe, and requires the dodge to move clearly sideways. Torkoal's issues came mostly from our prompt and tools, not from agy.
- **Sharp sprites and real backgrounds (2026-11-18):** the Pokémon layer is drawn at the output scale (x3, or x2 with a scene), not at 240×160, so sprites drawn at 192 px keep their detail. Shrinking uses BOX. `--scene` uses the `assets/battle-scenes/` backgrounds, with the scene anchors (176,71)/(72,111) and a 48 px text box.
- **Motion check (2026-11-18):** `loop_check.py` measures the silhouette change between consecutive frames of each row. A walk, run or fly side row needs at least 6% (front/back rows 2.5%, idle 1%), and no consecutive pair may be (almost) identical; failing loops are redrawn. It caught Breloom's static walk and Umbreon's duplicated frames. The design-lock text now says: copy the design, not the pose.
- **Battle angle examples:** every battle pack attaches `prompts/battle/orientation-front.png` (Typhlosion turned 3/4 toward the lower-left) and `orientation-back.png` (Charmander from behind, turned 3/4 toward the upper-right) as the THIRD image, used for the angle only. This fixes species with 4-direction sheets (Breloom, Torkoal), whose design lock is a side or straight view.
- **Automatic review (2026-11-18):** `check_battle.py` (both views, attack reaching toward the foe, hurt, dodge sideways, faint lying) and `loop_check.py` (movement) run on every new sheet. `tools/agy/auto_fix.py` sends agy a non-interactive fix request (`agy -p --mode auto`) that redraws only the failing image or loop, at most 2 per sheet, logged in `tmp/agy-requests/`. The viewing angle (3/4) is still reviewed by eye.
- **Side check:** `check_battle.py` also fails a frame whose colours are closer to the other view's standing frame. This catches back-view frames that turn around and show the face or belly, as in Armaldo's first try. The target angle is the Gen 3 screen: opponent like Latios, 3/4 toward the lower-left; player like Scizor from behind, 3/4 toward the upper-right.
- **Reference artwork kept (2026-11-18):** each species folder keeps `<slug>-movement.png`, `<slug>-battle.png` and `<slug>-reference.jpg` (the web artwork the drawings were made from, saved by `fetch_reference.sh`), so every sheet can be checked against its source. Raw drafts still never go there.
- **Reference check (2026-11-18):** every movement and battle sheet must look like `<slug>-reference.jpg`. `tools/agy/compare_reference.py` builds a side-by-side image plus a rough colour check. Agy compares before finishing, and Claude reviews every new sheet by eye and sends targeted fix requests. First review: Armaldo, Torkoal and Breloom match; Ho-Oh does not (big head, chicken-like walk, folded wings) and is being redrawn.
- **Fix only what is wrong (2026-11-18):** `tools/agy/cell_fix.py` cuts a broken cell (1 frame) or row (6 frames as a 3×2 grid) out of a battle or movement sheet for one image edit, then puts it back scaled, on the baseline and with its sideways offset. `auto_fix.py` plans the cheapest fix: cells, then a row, then the whole image (whole image when 3+ rows or a whole-view problem). Battle frames must be a battle stance, not the idle pose; `check_battle.py` fails a standing frame that is ≥90% the idle silhouette.
- **Fallback images from the upstream particle effects (2026-11-19):** `fallback_vfx.py` (formerly named after the upstream project) converts the upstream project's move particle effects (our own Molang / Snowstorm re-implementation, Gen 3 camera, 15 colours, outline) into the 2-strip format. User decisions: the images live in `assets/skills/Fallback/<Gen>/<Name>/` (MPL-2.0 notice in its README, never in `assets/skills/Gen*/`), the viewer labels this source "Fallback" (never the upstream name), and `vfx.py` reads it only on opt-in (`MONS_VFX_SOURCE=fallback` / `source=`); agy stays the default. First moves: Eruption, Earthquake (= Bulldoze), Knock Off (= generic impact), Ice Beam.
- **Fallback as the temporary default (2026-11-19):** user decision ("đồng ý", then "dùng all fallback skills đi, agy chưa có thì fallback"): every move the upstream project has (131, `fallback_vfx.py --all`) is converted into `assets/skills/Fallback/`, and `vfx.py`'s default chain is, per image (cast and effect separately): agy's strip → the Fallback strip unless it is blank or marked `false` in `assets/skills/Fallback/approved.json` → the procedural strip. agy stays the main source and always wins once it has drawn the image. `approved.json` (`{identifier: {"cast", "effect", "note"}}`) works as a deny list: `false` only for empty or clearly broken images (a few stray pixels, nothing travelling, a solid mass hiding the Pokémon, hard-clipped edges), with the reason in `note`. Each image uses the `-vfx.json` next to the strip it came from. `MONS_VFX_SOURCE=fallback` still forces every converted image, for comparison. The move viewer labels each image "agy", "Fallback (tạm)" or "tạm do code sinh" and never prints the upstream name. The game (`game/`) does not play move strips yet, so this only changes the viewer, previews, demo and review tools for now.
- **Never cut an effect at its frame cell (2026-11-19):** user rule ("đừng để hiệu ứng skill bị tràn ra khỏi box, đảm bảo nằm trong box hoặc mở rộng box ra"), after Flamethrower's Fallback flames showed a straight vertical cut. Every move image must stay whole inside its cell, with at least 2 px to spare, or the cell must be made bigger; never a straight cut. A strip's cell is its image height (96 px by default, bigger allowed), and `vfx.py` sizes by the drawing: one cell pixel always has the scale of a 96 px cell pixel, so a bigger cell only adds room. `clip_check.py` (`--all`, `--move`, a path) flags frames whose opaque pixels touch the cell border in a run of 4 px or more. The only exceptions are beam travel frames touching left and right (agy's normalizer stretches them so the copies join; `vfx.py` rounds the head and tail copy, `beam_cap`) and fall travel frames touching the top (`vfx.py` extends them up to the sky, `from_sky`). `review_move.py` fails a cut image. `fallback_vfx.py` renders on a padded canvas and fits each strip (re-renders it smaller down to 75% with the `-vfx.json` scale compensating, then a bigger cell up to 192 px; small loose particles and pieces outside the old framing are dropped whole, never cut). `normalize_move.py` keeps a piece that runs over its slot line whole and warns when agy's draft itself is cut (redraw). The procedural strips stay inside their cell. First run: Fallback 90 of 264 strips cut, then 0; procedural 138 of 1838, then 0; agy 0 at the border (agy drafts cut before normalizing show as straight edges inside the cell: `clip_check.py --edges`, look and redraw).
- **Beam moves drawn by code (2026-11-19):** user decision: beams looked segmented, broken and stubby with both agy's and the Fallback strips (one 96 px segment tiled from the mouth to the target), so beams are redesigned and drawn by code. `beams.py` draws, on the 240×160 screen, a charge orb at the mouth (or vent) anchor, then one continuous straight beam to the target's body anchor (white core, 2 palette bands, 1 px dark outline, pulsing thickness, flared mouth end, bright head, per-move detail travelling along it), then a white flash and a radial burst while the beam pours and retracts; the hit reaction stays `vfx.py`'s. GBA-grid pixels, no anti-aliasing, BGR555-safe palettes of ≤ 15 colours. It is a third effect source, `code`, next to `agy` and Fallback: opt-in only (`source="code"`, `MONS_VFX_SOURCE=code`, `battle_preview.py --source code`, the viewer's "Code (thiết kế mới)" toggle); the default chain does not change until the user has compared. 22 of the 32 beam-archetype moves get a code beam; the other 10 are not a ray on screen (Fire Blast: in Gen 3 a fireball and the five-armed flame burst; Spike Cannon, Zap Cannon, Focus Blast, Energy Ball, Acid Spray: projectiles; Blast Burn, Psystrike: bursts on the target; Frenzy Plant: roots; Spectral Thief: contact) and keep their normal path.
- **Beams start in front of the mouth (2026-11-19):** user rule ("những skill chùm tia đường thẳng ưu tiên xuất phát từ phía trước miệng … không che đi model của pokemon, kể cả quay lưng thì cũng sẽ xuất hiện ở mép phải model; front thì mép trái miệng hoặc không giao với model"), after Heracross' Hyper Beam was drawn over its own body. Every straight-line move (all `beam`-archetype moves, code beams and strip beams) starts outside its user: `vfx.beam_start` moves the start from the `mouth` anchor sideways at mouth height toward the target until the charge orb / flared beam end (`beams.start_reach`) and the beam body clear the user's opaque pixels over every step they are shown (battle poses included). The player's Pokémon (from behind) fires from its right edge, the opponent from the left of its mouth; the flare and spike tips may touch the edge, never cover the body; the charge streaks come from the front half only; a strip beam's first segment and its charge image are pushed out the same way. `review_move.py` checks it (≤ 8% of the user covered). A wrong start means a wrong `mouth` anchor: fix it in `<slug>-anchors.json` (Heracross's back mouth was at its feet). The game (`game/`) still does not play move effects, so this is in `tools/skills/` (viewer, previews, review, demo) only.
- **Official move images for the game (2026-11-19):** user request: in the move viewer the user picks, per move, the official source ("Fallback", "agy" or, for code beams, "Code"); the choice is stored in `data/battle/move-vfx-official.json` (the record of explicit choices; 19 moves on the first day). A first version copied them to `assets/skills/Official/`; replaced the same day by the next entry (no `assets/skills/Official/`, no zip; the user's own download `assets/skills/Gen1-Kanto/mons-official-moves.zip` is theirs, not part of the pipeline).
- **One main source in `assets/skills/`, Fallback by default, agy no longer used for moves (2026-11-19):** user rules (paraphrased): moves without a choice mostly use Fallback, agy only for skills the upstream project lacks, edited skills such as beams use code, and "no choice" means the web page's default; then "chỉ giữ 1 nguồn chính trong thư mục Skills, di chuyển các skill được chọn trong fallback sang assets/skills/GenX-…/<tên skill> chính thống, ignore thư mục fallback" and "không cần agy nữa". So `assets/skills/<GenX-Region>/<English Name>/` is the ONE official place of every move's effect (`<id>-cast.png`, `<id>-effect.png`, merged `<id>-vfx.json`, or `<id>-code.json` for a code beam; `<id>-prompt.md` kept), written by `tools/skills/apply_official.py` for every move the game uses (180, `game/public/assets/data/moves.json`) plus every explicitly chosen move. Rule (`vfx.official_plan`): the explicit choice wins at the move level; otherwise a code beam (beams.py draws it) → the Fallback version when usable → agy's old drawing → procedural. Per image (cast / effect separately) nothing is ever blank: an image the chosen source lacks (missing, blank or `false` in `approved.json`) comes from the next source, fallback → agy → procedural (choice agy: agy → fallback → procedural). agy's drawings are backed up to `tmp/history/skills-agy-<date>/` before being overwritten or removed (and stay in git history); `data/battle/move-vfx-sources.json` records where each official image came from; `assets/skills/LICENSE-Fallback.md` lists the official images derived from the upstream particle effects (MPL-2.0, `LICENSES/MPL-2.0.txt`, `THIRD_PARTY_NOTICES.md`). `assets/skills/Fallback/` becomes a local library (in `.gitignore`, untracked, files kept on disk) used by the viewer for comparison and choice. `vfx.py`'s default source plays the official folder (code beam when `<id>-code.json` is there, else the strip there, else procedural); comparison sources `fallback` (an unknown older value is read as it, with a warning) and `code` stay. The viewer's default view is "Chính thức", its radios ("Mặc định / Fallback / agy (bản vẽ cũ) / Code") re-apply the move at once, sources with no usable image are disabled, labels show filled images ("cast: agy (Fallback trống)"), and "Áp dụng vào Skills" re-applies everything. agy does not draw move effects any more; the review / clip / normalize tools keep working on `assets/skills/<Gen>/`. First apply: 183 moves (180 game + 3 chosen non-game), images Fallback 89 · agy 26 · procedural 235 · code 16 (8 moves), 49 images filled.
- **Move effects in the game (2026-11-19):** the game plays the same CAST → EFFECT → HIT animation as `vfx.animate` (what the move viewer shows). `game/tools/battle_assets.py export_moves` (chained in `npm run assets`) exports only the moves the game ships: the official strips of `assets/skills/<Gen>/<Move>/` unchanged (`assets/moves/<id>-cast.png` / `-effect.png`, magenta keyed, square cells) and `moves-fx.json` (archetype, variant, cast place, body part, class, type, cell sizes, the drawn box of every frame, the `-vfx.json` tuning, the steps; code beams carry their `beams.py` style instead of strips; the type palettes; per species the body anchors of the views the game's battle sprites show, `<slug>-anchors.json` fixes applied). `game/src/movefx.ts` ports `animate` step for step at 30 steps a second and places everything at play time from the two battle sprites' real feet, sizes and anchors (both sides): level-A body motion, archetype paths, hit-stop, type flash, `beam_start` (straight-line moves start in front of the mouth, never over the user). Code beams are a line-by-line port in `game/src/beamfx.ts` (with Python's random and rounding), not pre-rendered strips, because their start (outside the user's sprite) and end (the target's body anchor) depend on the two species; a Node check renders 412 frames of 10 beams from the same points pixel-identical to `beams.py`. Game rules on top of the viewer: a drawing is moved inside the screen and above the dock (y 128) instead of being cut (beams drop pieces as in `beams.py`, with the dock as the text box); the battle background is drawn into the behind layer during a move (Phaser 4.2.1 drew squashed + rotated battle sprites with pieces missing when another image sat between the background and the Pokémon). `Battle.ts` makes one call at the "use" event (`playMove`, it replaced the lunge); it resolves on the hit step so the "hit" event (blink, target / impact sound) lands with the impact while the impact frames finish; a move with no hit before the next "use" plays as a miss (the target dodges, no impact); a charging turn (Solar Beam, Fly, …) plays only the charge; self moves play their own target sound at the end. The game's battle sprites are its own (40 px front / 52 px back, no level-B battle poses), so effects keep the viewer's placement rules and size ratios, not its pixel positions. 2026-11-19: `apply_official.py` was re-run for the 350 game moves (168 had no official folder): 18 got Fallback images, 1 a code beam (`signal-beam`), 149 procedural strips, by the default rule; the existing moves' images were kept.
- **All upstream move effects become official (2026-11-20):** user ("về hiệu ứng skill thì lấy toàn bộ của <the upstream project>" = take all of the upstream project's move effects). The conversion was re-run on the upstream 1.8.4 source (MPL-2.0, the same version as before; its 137 move timelines are identical to the release archive's): 130 moves with their own timeline + 3 borrowed (Earthquake = Bulldoze, Hyper Beam / Wing Attack) + Knock Off (generic impact) = 134 in the local library; the other 7 files are species variants, an unused one and `generic_move`. Converter gaps fixed in `fallback_vfx.py`: texture paths follow the upstream reader (Thunder's bolts were missing), sprays thrown forward without reading the target are the travel frames (Spore, Poison Powder, Sleep Powder, Stun Spore, Sand Attack, Lava Plume), the user's particles arriving at the target are the effect when nothing plays on the target (Leech Seed), a self burst splits in time (Explosion, Self-Destruct: orbs = cast, boom = effect), and a storm cloud parked high in the sky stays out of a `fall` move's falling frames (Thunder). `approved.json` was re-judged with the user's rule: sparse but visible effects, effects with only the hit, and masses that hide the Pokémon because upstream does (Explosion's boom, Play Rough, Cotton Guard) are allowed; still denied: Fire Blast's effect (travel frames 1 and 4 almost empty, gaps in its tiled path), Bulldoze / Earthquake's effect and Frustration's effect (a few stray pixels; Frustration's anger particles are missing upstream too), the stray-pixel casts. Images upstream itself leaves empty (Growl; the target of Leer, Tail Whip, Kinesis, Scary Face; most casts) stay filled per image. Rule changes: `vfx.official_plan` lets a usable Fallback version beat an explicit choice of agy (the three agy choices in `move-vfx-official.json` — Earthquake, Hypnosis, Leer — became `fallback`, with a `_note`); `vfx.SPRAY_BEAMS` (Dragon Breath, Hydro Pump: the upstream effect is a spray / stream, not a segmented beam, like Flamethrower, which the user chose) use Fallback instead of the code beam, to be confirmed by the user; the other code beams (Ice Beam, Psybeam, Aurora Beam, Hyper Beam = recoloured Ice Beam, Solar Beam, Signal Beam, Hydro Cannon) stay code; `apply_official.py` fills a Fallback effect's empty travel frames with the procedural ones (`"effect_travel": "procedural"`, Hidden Power). Applied to the 350 game moves (+ chosen non-game moves): 96 game moves use Fallback images (47 casts, 91 effects); the game moves with an upstream effect that do not are the 4 code beams, Growl and Tail Whip (upstream empty / stray pixels: agy) and Frustration. agy's replaced drawings were already in `tmp/history/skills-agy-2026-11-19/`. Sizes of Explosion, Self-Destruct, Thunder and Earthquake tuned with `review_move.py`; `clip_check.py --all` 0 cut; before / after key frames: `tmp/report/fallback-moves/`.
- **Code beams stay code (2026-11-20):** user ("các skill đã chọn code từ trước thì không chuyển qua <the upstream project>"): Dragon Breath and Hydro Pump, briefly switched to their Fallback spray in the entry above, are code beams again (`vfx.SPRAY_BEAMS` is empty); every move that played as a code beam keeps it.
- **Generic upstream impact for every damaging move (2026-11-20):** user ("theo kiểu <the upstream project>"): a damaging move with no upstream effect of its own plays what upstream plays for it, its generic move effect (`generic_move`: the type impact `impact_<type>` + `hit` on the target), like Knock Off already did. `fallback_vfx.py --generic` converts it for all 551 damaging moves without their own effect into the Fallback library (listed in `assets/skills/Fallback/generic.json`; travelling archetypes keep frames 1-4 empty and the impact in 5-8, others 8 impact frames); it is a Fallback version like any other in `vfx.official_plan` (beats agy and procedural; code beams stay code), recorded as `"fallback-generic"` in `move-vfx-sources.json` (`vfx.applied_sources` reads it as `fallback` + `generic`). Its empty cast comes from agy / procedural; its empty travel frames (a few stray specks count as empty) come from agy's old travel drawing when there is one (Surf), else procedural (`"effect_travel"`). Status moves without an upstream effect keep their images. Game: 143 moves now play the generic impact; with the 88 own upstream effects, every damaging game move plays an upstream effect except the code beams and 3 whose own effect is denied (Fire Blast, Earthquake: agy; Frustration: procedural). `clip_check.py --all` 0 cut; `review_move.py` on 12 moves of 10 types: no failure (only the usual cast-size warnings of agy / procedural casts); key frames `tmp/report/fallback-moves/before-after-generic.png`.
- **Dig drawn by agy, official by explicit choice (2026-11-20):** user asked for agy to draw Dig (cast: the user burrows, dirt burst over a hole; effect: cracks then a rock / dirt eruption under the target), one single-shot draw per image. `data/battle/move-vfx-official.json` has `"dig": "agy"`; `vfx.official_plan` now lets an explicit agy choice beat the upstream *generic* move effect (`fallback-generic`), while a move's own upstream effect still beats agy. agy's images are backed up in `tmp/history/skills-agy-2026-11-20/`; before / after: `tmp/report/dig/`.

## 12b. Evolution effect (decided 2026-11-19)

- **Gen 3 sequence on screen:** the evolution scene follows pret/pokeemerald (`evolution_scene.c`, `evolution_graphics.c`) frame by frame at 60 fps: fade in, "Ồ? X đang tiến hoá!", old cry, intro jingle, battle background to black, light-blue background cycling (pret's palette rows and timing; concentric bands stand in for pret's tiles), the old Pokémon fades to white while sparkles spiral up (161 frames), sparkles arc down (97), the white old / new silhouettes grow and shrink with speed 10 → 128 (406 frames ≈ 6.8 s; **a fresh B press cancels** here and only here — see the 2026-11-19 entry below), sparkles circle in (49), white flash + sparkle spray (129; colour back from frame 32), background back, new cry, "Chúc mừng! X đã tiến hoá thành Y!", then the new moves of that level. Cancel: white fade back to the old Pokémon, its cry, "Hả? X đã dừng tiến hoá.". Facts with sources: `data/battle/evolution-animation.json` (`evolution_fx.py facts`).
- **3D reference particles as extra sparkles:** the upstream `evo_*` particle effects (MPL-2.0) are rendered to 2D Gen 3 strips (≤ 15 colours, alpha 0/255, outline on sparkles, never cut: the cell fits every pixel, re-rendered smaller past 192 px) by `tools/skills/evolution_fx.py strips` with the move Fallback particle engine. All 12 go to the ignored library `assets/skills/Fallback/_evolution/`; the 6 the game plays (`sparkle`, `buildup`, `flyingsparkles`, `implode`, `godrays`, `sparkleburst`) go to tracked `assets/ui/Evolution/` (a full-screen scene, like the other UI kits; `LICENSE.md` = MPL-2.0 notice) with `evolution.json` (strip sizes / fps, cues per Gen 3 phase, sound cues). Buildup plays during spiral + arc, flying sparkles during the alternation, implode with the circle, godrays + sparkle burst as the flash clears; the single sparkle particle draws pret's own sparkle paths.
- **Sounds:** the upstream `evolution_notification` = intro jingle, `evolution_full` started so that its burst (10.0 s) falls on the white flash and stopped on cancel, `evolution_ui` = the "Chúc mừng" jingle; cries as before (`game/tools/export_sounds.py` SFX `evo-*`).
- **Pending evolutions from the party menu (user's choice, 2026-11-19):** a Squirtle reached Lv 16 and did not evolve until
  Lv 17 (Gen 3 checks only right after an in-battle level-up, B / the run key / a phone tap anywhere cancelled it, and a
  Pokémon that fainted in that battle misses its check). The user prefers the 3D reference game's behaviour: a ready
  evolution stays available. `data.ts` `readyEvolution(m)` = the level evolution is reached (trade evolutions: Lv 37),
  the target is in the game, HP > 0, no Everstone (the only automatic trigger the game has; stones stay bag items).
  ĐỘI HÌNH marks a ready Pokémon with a gold "TIẾN HOÁ!" chip (not in battle) and its sub-menu starts with **TIẾN HOÁ**
  (overworld only); it runs the normal Evolve scene (animation, sounds, move learning, MONDEX, B allowed) and returns to
  the World on the Player's exact cell (`World.evolveFromMenu` writes the position into `GAME` first; the evolution
  stone path uses it too), and the World start autosaves. THÔNG TIN shows "Sẵn sàng tiến hoá" in the portrait. The
  automatic post-battle evolution stays (Gen 3), but only a **fresh** B press during the alternation cancels it: B
  held when the scene starts (the run key), auto-repeat, Shift (run only) and presses before the alternation do not;
  on a phone a B button appears during the alternation and only a tap on it cancels (no more tap-anywhere).
  Fixed with it: the reused Evolve scene kept the last run's destroyed sparkle sprites, so the second evolution of a
  page session threw on every frame and froze at the spiral (that evolution was lost); `create()` now resets them.
- **One logic, two players:** `game/src/scenes/Evolve.ts` and `evolution_fx.py` (`EvoSim`) run the same per-frame logic; the move viewer page `/evolution` plays the Python render for any evolution pair (with or without B) with sound.

## 13. Game prototype stack (decided 2026-11-18)

- **Phaser 4 + Vite + TypeScript, in `game/`.** It runs in the browser on PC and phone, reads the existing PNG / JSON assets, and can later be packaged with Capacitor (Android / iOS) or Electron / Tauri (desktop). Godot was the alternative and was not chosen, because its web export is weaker on phones.
- **Pinned versions:** checked on npm 2026-11-18; stable releases, a few months old, compatible with each other.
  - `phaser 4.2.1`, `vite 8.3.8`, `typescript 6.0.3`, Node ≥ 22.12.
  - TypeScript 7 (the Go rewrite) waits until its tooling settles.
  - Vite's `picomatch` audit warning affects only the dev server. `audit fix --force` would downgrade Vite, so it is not applied.
- **Assets are exported, not committed twice:** `game/tools/build_assets.py` writes `game/public/assets/`, which git ignores.
  - Tiled maps are baked into a ground image plus separate, y-sorted objects, with a collision and behaviour grid, warps, connections and NPCs.
  - Battle sprites use the two Walk drawings (rows 0–1) of the legacy 8×6 movement sheets: column 7 for the opponent and column 3 for the player's Pokémon.
- **Scope so far:**
  - v0.1: start-town and route-1, wild battles with catching, EXP and level-ups.
  - v0.2: city-a and building interiors (1F from `assets/structures/*/<slug>-interior.json`); the Pokémon Center heals and the Mart sells items for money.
  - Maps with no base ground layer get the District's base tile (the first tileset).
  - Saving is left out on purpose: the user plans an automatic save later. *(2026-11-19: online server save with autosave + LƯU, §21.)*
  - v0.3: Trainers with line of sight, a "!" walk-up, Trainer battles (prize money, losing half, no running or catching), multi-floor interiors from the structure links, and the grass gym with its Leader and badge. Battles show the Trainer as their overworld sprite x3, since battle front pictures were dropped.
  - v0.4: all 30 `assets/maps/world.json` maps, every interior that exists (5 buildings still have none and stay locked) and the 8 gyms are built and reachable. **Changed 2026-11-20 by §26:** the world is no longer open from the start; each map and cave has a Stage (badges needed to enter), and a police Gate checks the list before the Player crosses into a higher Stage (going back is never checked). Interiors and gym doors keep their own rules. Species (147 with sprites), learnsets (Gen 1-3 moves the battle code runs), wild tables (District types, level by distance from start-town; since §26 each District's levels are kept inside its wild band), the 7 generated gyms' Trainers and Leaders, and battle scenes per District are all generated by `game/tools/build_assets.py`; only route-1 and the grass gym stay hand-made. Sea routes need Surf: prototype rule, any water-type Pokémon in the party. The overworld camera stays at zoom 1 (20 tiles across on PC); 4/3 was tried and rejected as too close.
  - v0.5: the core loop. Starter choice (Bulbasaur / Charmander / Squirtle, Lv 5). Gen 3 status conditions (poison, burn, paralysis, sleep 2-5 turns, freeze with 20% thaw, confusion; type immunities; catch bonus x2 / x1.5; the nurse and a blackout cure them), shown as a chip beside the name. Level evolution after a battle with a level-up, cancel with B; trade evolutions evolve at Lv 37 instead; stone evolutions wait for items. Gyms open in order grass → psychic → electric → water → rock → ground → poison → fire (a gym needs as many badges as gyms before it), and Surf needs 4 badges.
  - v0.6: the opening, as in the main games. After choosing boy / girl, GIÁO SƯ LÂM (original Mons Professor, `assets/characters/Service/professor`) introduces the world, shows a Pokémon and asks the name (preset names). The Player wakes in the bedroom (player-house 2F), Mom is downstairs, a lab aide stops the Player leaving town with no Pokémon, and the starter is picked from three Poké Balls on the lab desk (CÓ / KHÔNG). start-town grew from 24x20 to 24x34 to hold `professor-lab`.
  - v0.7: Pokémon management, built on the approved UI kit screens (`game/src/scenes/Screens.ts`). ĐỘI HÌNH (info, reorder, send out in battle, use an item), THÔNG TIN (stats with IV / EV, nature colours, ability, moves with PP), TÚI ĐỒ (pockets THUỐC / BÓNG / VẬT PHẨM, works in and out of battle), MONDEX (seen / caught, height and weight once caught), HỘP PC (the PC terminal in every Pokémon Center: deposit / withdraw; catches go there when the party is full) and HỌC CHIÊU (Gen 3 forget-a-move choice). Mart sells Thuốc Mạnh 700, Giải Độc 100, Hồi Sinh 1500, Bóng Lớn 600 (catch x1.5) besides Thuốc Hồi and Bóng Mon.
  - v0.8: content on the road. Every route except the hand-made route-1 gets 1-4 generated Trainers (`route_trainers` in `build_assets.py`): beside the main road between the exits, facing across it, never cutting a way between exits; District classes and types, levels by distance from start-town. Rival DUY (`assets/characters/Trainers/rival`): takes the starter that beats the Player's in the lab and battles at once (losing does not black out), then waits on route-3 (1 badge), route-6 (4 badges) and route-4 (7 badges). All 167 prototype moves have Vietnamese names (`data/battle/move-names-vi.json`); the battle move menu is Gen 3 style (moves in the text box, PP and type on the right).
  - The story and sound come next.
- **Smaller Pokémon on the battle screen (2026-11-18):** every Pokémon is drawn 1.5x smaller than the Gen 3 height rule (`POKEMON_SCALE = 1 / 1.5` in `vfx.py`); move effects scale with it. The feet stand at the centres of the battle-scene platforms: (176, 64) for the opponent, (64, 116) for the player (the text box covers the player's lowest rows, as in Gen 3). Report images (`tools/agy/species_report.py`) show the battle scene at half the renderer's output size.
- **StatSim (2026-11-18):** `sim/StatSim/` simulates how a Pokémon gets IVs, EVs, nature, ability, gender, shininess and stats the official Gen 3 (Emerald) way: one 32-bit personality value decides nature / ability slot / gender / shiny, IVs come from the next two RNG calls, EVs 255 / 510 with vitamins up to 100, shiny 8/65536. It mirrors the structure of the reference implementation's code for comparison but takes every rule from pret/pokeemerald (no reference code copied). Data in `data/stats/` (rules, natures, abilities, species, ev-items), rebuilt by `sim/StatSim/build_configs.py`.

## 14. Trainers and the Trainer AI (decided 2026-11-18)

User rule (paraphrased): use the reference implementation as much as possible, but stay closest to the official Pokémon source. Official = the pret/pokefirered (FireRed / LeafGreen) decompilation; the reference implementation and its add-ons (RCT trainers, `sim/BattleSim/ai.py`) are the structure to compare with, never the numbers.

- **One source:** `data/battle/trainers.json` (v2, `tools/data/build_trainers.py`) holds every Gym Trainer and Leader, the rival, the Elite Four and the Champion. The game reads it through `game/tools/build_assets.py`; BattleSim reads it too. Route Trainers stay generated (`route_trainers`) for now.
- **Mons order and names, FRLG teams:** each Mons gym takes the FRLG gym of the same type (grass = Erika, rock = Brock, …). Teams are scaled to the Mons ace level of that battle and evolved / un-evolved to stay legal. Moves are the FRLG custom set when nothing changed, otherwise the Gen 3 default moveset plus the custom set's TM moves. IV = `iv * 31 / 255`, and the Gen 3 trainer personality value fixes nature and ability. Gyms with more slots than FRLG Trainers are filled with FRLG Trainers whose team is (mostly) of the gym's type.
- **Rival = Champion**, as in FRLG: rival battles 1-4 map to FRLG Oak's Lab, Cerulean, Pokémon Tower and Route 22 (late). The variants are keyed by the rival's own starter.
- **Elite Four keep their official names, as the RCT trainer add-on does** (user: name them like the reference does): Lorelei (ice), Bruno (fighting), Agatha (ghost), Lance (dragon). Their sprites (`elite-<type>`) do not exist yet.
- **Trainer AI = Gen 3** (`game/src/ai.ts`; *move choice replaced 2026-11-19 by the BattleSim mechanism in `game/src/battle/ai.ts`, §21 "Battle core decisions"; the item rules below stay*): AI flags per Trainer, every move starts at 100, then `check-bad-move` (-10 when a move cannot work), `try-to-faint` (+4 for a KO, +6 with priority, -1 when not the strongest) and the stat / status parts of `check-viability`. The best score wins and ties are random; wild Pokémon pick at random. Items follow `ShouldUseItem`: Full Restore below 1/4 HP, potions below 1/4 or when the missing HP is more than they heal, Full Heal on a status, X items on the first turn. Later items wait while many Pokémon are left. Items are used before moves.

## 15. Wild encounters — Gen 3 per step (decided 2026-11-19; slot table and rates replaced by option B the same day)

User choice ("chọn A"): **Gen 3 hidden encounters rolled per step** in tall grass / caves / sand / water, not Switch-style visible spawns walking around the map. Official source first: pret/pokeemerald `src/wild_encounter.c`; the reference implementation only for comparison (§14).

- **Rules** (`data/world/encounter-rules.json`, each with its source function): per step `Random() % 2880 < encounterRate × 16` (bike ×80/100, White / Black Flute, Cleanse Tag, Stench / White Smoke / Illuminate / Arena Trap / Sand Veil), 4 steps without a check after each battle / warp, 40% skip on the first step onto a new kind of tile, land 12 slots 20/20/10/10/10/10/5/5/4/4/1/1 %, water 5 slots 60/30/5/4/1 %, level `min + Random() % (max − min + 1)`, Repel 100 / 200 / 250 steps against the lead's level, Static / Magnet Pull, Hustle / Vital Spirit / Pressure, Keen Eye / Intimidate.
- **Encounter rate per terrain** (pokemon-spawns.json has none): Emerald's usual values, tall grass 20, cave 10, sand 10, water 4, with per-map `mapOverrides`.
- **Mons' layer stays:** the `pokemon-spawns.json` tables filtered by `species_behaviors` time of day / weather (`"ANY"` matches all) and the `time_phases` rate bonus (DUSK ×1.15, NIGHT ×1.25). Each weighted list is mapped deterministically onto the Gen 3 slots; the authored % vs slot % is reported so designers see the gap (land within ~2 points; water is bound to 60/30/5/4/1; since 2026-11-19 Mons' Surf tables use 12 slots with the land odds, §23 "Wider spawn pools").
- **Simulator:** `sim/EncounterSim/` replaces `sim/GameTicks/`; GameTicks' upstream tick model (a spawn attempt every 10 ticks, a made-up 0.6 chance, rarity buckets) is dropped.
- **The game follows them (v0.9, 2026-11-19):** `game/src/encounter.ts` ports EncounterSim's step (Repel counter, 4 immune steps after battle start / warp / map change, 40% new-tile skip, rate × 16 vs a 16-bit `Random() % 2880`, slot and level rolls, Repel against the first healthy party Pokémon, lead abilities from party slot 1: Stench / White Smoke / Illuminate / Arena Trap, Static / Magnet Pull, Hustle / Vital Spirit / Pressure, Keen Eye / Intimidate); the step state lives in `GAME` (`encImmunity`, `encPrevBehaviour`, `repelSteps`) because the World scene restarts. `build_assets.py` bakes `encounters.json` per map + terrain (`<slug>`, `<slug>:water`, `<slug>:sand`, `<slug>:cave`) as `{area, rate, source, slots, phases}` with EncounterSim's own `fill_slots` (imported, not copied): `map_spawns` tables at DAY / CLEAR (no clock or weather in the game yet; MORNING / DAY / DUSK / NIGHT slots and rate mults are kept in `phases`), species without sprites skipped; map / terrain pairs with no `map_spawns` entry keep the generated District table on the same Gen 3 slots and rates. Running does not change the rate (Gen 3: only bikes). Sand tiles (`SAND` behaviour) count only on maps with a `sand` table; no map marks cave tiles yet, so the cave tables are unused. Repel (Xịt Chống, 350 đ, 100 steps) is used from the bag outside battle; an active Repel is not replaced. `game/tools/check_encounters.py` checks the data against EncounterSim and runs `encounter.ts` and EncounterSim's `Walker` on the same LCRNG seed, step by step.
- **Option B (user, 2026-11-19) replaces the Gen 3 slot table and the pure Emerald rates** (the per-step check itself, the 4 immune steps, the 40 % new-tile skip, Repel, the lead abilities, the levels and the time bonus stay Gen 3 / as above):
  - **Rate:** Mons' terrain multiplier right after the ×16, before the time bonus (`encounter-rules.json` `monsRateMult`, ×100 integers, the table's `rateMult`): tall grass ×1.5, Surf ×2, caves ×2, sand ×2, Rock Smash ×1. Mean steps between encounters (`expectedStepsBetween` = 4 immune steps + 2880 / rate, no Repel, one big patch): tall grass 13.0 → **10.0** (480 / 2880 = 16.7 % per step; NIGHT 8.8, DUSK 9.2), Surf 49.0 → 26.5, cave / sand 22.0 → 13.0. (The user's "≈ 1 per 8 steps" needs ×2.25 = 720 / 2880; ×1.5 as chosen gives 10.)
  - **Species = rarity tiers, not slots:** the reference rarity buckets common 88.5 / uncommon 10 / rare 1.2 / ultra-rare 0.3 % (`monsRarity`; the tick model's buckets, dropped earlier the same day, come back). Tier of an entry: `pool` (build_spawn_pools.py), else an explicit `tier`, else from its weight (`tierOfWeight`: 15+ common, 6+ uncommon, 2+ rare, else ultra; the authored weights are on the pool scale 20 / 10 / 4 / 1). Inside a bucket the entries share by weight; an empty bucket at that map × terrain × phase × weather is renormalised away. Built at build time by `tools/world/encounters.py` `rarity_table()` (exact fractions, integer odds out of 10000 by largest remainder, ≥ 1 each): one row per species in `slots`, its `percent` (2 decimals, sum 100) and `tiers`, for the table, every phase and every variant. `encounter.ts` `rollSlot()` rolls `(Random() << 16 | Random()) % 10000` against them (two 16-bit calls so `% 10000` has no visible bias; Rock Smash uses the same), Static / Magnet Pull keep Gen 3's uniform pick among the rows of that type. No species is dropped any more (Gen 3 had 12 slots).
  - `check_encounters.py` compares every table with EncounterSim's own `rarity_table()` (the local sim got the same layer: `step_rate(terrain_mult=)`, `choose_row()`, `data.entry_tier()`) and walks both step by step; PokéNav shows each species' row % (sum 100 %) and its tier (Thường / Ít gặp / Hiếm / Rất hiếm) on the detail panel and in the rarity filter.

## 16. Sounds from the upstream project (decided 2026-11-19)

User: "chép hết âm thanh vào repo đi bạn (gen-1 trước)", after listening to Thunderbolt / Eruption / Earthquake samples.

- `assets/third-party/reference-sounds/` holds the upstream project's 1.8.4 sounds unchanged (MPL-2.0; notice `THIRD_PARTY_NOTICES.md`, text `LICENSES/MPL-2.0.txt`), copied by `tools/data/import_sounds.py`, Gen 1 first: cries of all 1025 species (`assets/third-party/reference-sounds/Pokemon/<GenX-Region>/<NNN-Name>/`), 86 moves with their own `_actor` / `_target` sounds (`assets/third-party/reference-sounds/Moves/<GenX-Region>/<English name>/`, same folders as `assets/skills/`), 8 hit sounds per type (`assets/third-party/reference-sounds/Moves/_impact/<type>/`) and battle / UI sounds (`assets/third-party/reference-sounds/Battle/`). Groups that only exist for the upstream block game (block, ride, entity, animation) are left out.
- Manifest `assets/third-party/reference-sounds/sounds.json`. Rule: a move plays its own actor sound at the start and its target sound on the hit; a move with no own sound (Tackle, Earthquake, …) plays one of its type's impact sounds on the hit.
- Pokémon folders keep only their sprites (AGENTS.md), so sounds live in `assets/third-party/reference-sounds/`, not in `assets/pokemon/`.
- **Rule details (2026-11-19, confirmed by the user: "OKE"):** normal moves with no own sound use the fighting impacts (the upstream sounds have no normal impacts); the type impact fallback is for damaging moves only (status moves with no own sound, e.g. Growl, stay silent on the "hit"); a move with only an actor sound (Swords Dance) plays nothing on the hit. There are no normal-type impact sounds upstream, so normal uses the fighting ones. The impact files are flat in `assets/third-party/reference-sounds/Moves/_impact/` (`impact_generic_<type>_<n>.ogg`).
- **Move viewer:** `move_viewer.py` serves `/api/sound?move=<id>&part=actor|target|impact[&i=n]` (only files listed in `sounds.json`; nothing from the query becomes a path). The page has a "🔊 Bật tiếng" toggle (Web Audio, created and resumed by that tap for iOS, and `navigator.audioSession.type = "playback"` so the iPhone silent switch does not mute it), plays the actor sound on frame 0 and the target / impact sound on the hit frame (cast + travel; self moves only their own target sound). At 0.25× / 0.5× the sounds fire on the same frames at normal pitch (no slowed-down audio). Moves with their own sound have a 🔊 badge in the list.
- **Game (`game/`):** `tools/export_sounds.py` (chained in `npm run assets`) copies only what the game uses into `public/assets/sounds/` (one cry per species the game has, the own sounds of its moves, impacts per type, 15 battle sounds, the licence files; ~9.5 MB) with `index.json`. `src/audio.ts` has its own Web Audio context: files are fetched and decoded on demand (a battle warms the cries and moves of both teams), unlocked by the first tap / key, one master gain for a global mute (**M** until v0.16; now CÀI ĐẶT > Âm lượng > "Tiếng", §27; saved in localStorage) / volume. `Battle.ts` plays: cry on send-out (both sides, after the ball sound), on a wild appearance, on breaking out of a ball, and lower / slower (rate 0.8, as Gen 3) on fainting; the move rule above at the lunge and at the hit flicker (status / stat moves: their own target sound only); Poké Ball throw, hit, each shake, catch, break-out, send-out and recall; level-up; burn / poison / paralysis / confusion when inflicted and on poison / burn damage (sleep and freeze have no sound); stat up / down; medicine (player and Trainer items). Music: none upstream; CC0 music since 2026-11-19 (below).
- **Every action has a sound (2026-11-19, user: "áp dụng tất cả sound vào game", then "mọi hành động đều phải có âm thanh"):** the event → file map is data, `data/audio/game-sounds.json` (100 events: files with random variants that never repeat twice in a row, gain, cooldown, rate; `items` item id → event; `moves_extra` (Spore's mushroom sounds); `ambient`; `unused` and `silent` with reasons). `export_sounds.py` exports exactly what it references (+ every variant of the game's move sounds, each species' first cry and its `_ambient`), ~650 files / 13 MB, each source copied once; `index.json` = `{cry, ambient, moves, impact, sfx, item}`. `audio.ts`: `sfx(event)`, `ui(select|cursor|back|open|error)`, `item(id)`, `ambient(species)`, `warmSfx`; `?soundlog` in the URL logs every play request to `window.monsSoundLog` (headless checks). Choices: menus play `ui-select` on confirm and `ui-cursor` on cursor moves (Gen 3 SE_SELECT), `ui-back` on B, `ui-error` (the click at 0.5×: no buzz file upstream) on every "can't"; the `Screen` base class plays them for every menu screen (`snd` per screen: Mondex `dex-*`, bag `bag-*`, PC its own `pc-*`). The user's picks: `pc_wallpaper_unlock` when a catch is stored (after the new-species "Dữ liệu của X đã được ghi vào MONDEX." line with `pokedex_scan_register_pokemon` / `_aspect` for a shiny), `pokedex_open` whenever the Player talks to someone, opens the shop or starts the nurse dialogue (`Dialogue.cue`), and a soft `pc_click` on every text advance. Level-up: the active Pokémon's EXP bar now fills (Gen 3), `levelup_start` with a fill into a new level then `levelup`; `exp-fill` otherwise. The Center: `poke_ball_shut` per party ball, then `medicine_spray_use` (no heal jingle upstream). Obtain fanfare (`gui/levelup`) on every "<PLAYER> nhận được / nhặt được" line (`src/ui.ts` OBTAIN). Unused files (fishing not built, ancient balls, alternate cries) stand in for actions with no own file (doors, faint, money, splashes, "!" notifications…), each marked in the JSON. Silent on purpose until 2026-11-19: walking / running steps (Gen 3 has none; now footsteps, below). Online sounds (chat, join / leave, rename) come from `src/netsounds.ts`, which listens to `NET` events.
- **iPhone and Ogg:** the files stay Ogg Vorbis (unchanged, no transcoding tools here). Safari plays Ogg Vorbis only from iOS / macOS 18.4 (caniuse lists 17.4 as partial); older iPhones stay silent: the viewer shows a note, the game logs one warning. An `.m4a` / `.mp3` copy would be needed for older devices.

- **Footsteps, swimming, flying and music (2026-11-19, user-approved; supersedes "no music" and "silent steps"):** the user first asked for the sounds of a commercial block-building game and the music of a fan-made pack; both are all-rights-reserved and were **refused**. Only CC0 / public domain (or CC-BY with credit) files whose licence page was checked, or own synthesized sounds, may be added; each file's source URL, author and licence go in `THIRD_PARTY_NOTICES.md` §10. Downloads are unzipped in their own folder under `tmp/audio-downloads/` (untrusted, deleted afterwards); only the chosen files are copied to `assets/audio/`.
  - **Footsteps** (`assets/audio/footsteps/<ground>-footstep-<n>.ogg`, Kenney CC0, unchanged): one quiet step sound per Player step (gain ~0.25, a random variant, ±7 % pitch via the new `jitter` field), walk and run share them (running steps come twice as often). Ground of the cell stepped onto (`World.footstep`): grass (`SHORT_GRASS`, `TALL_GRASS`), dirt (other outdoor ground), sand (`SAND`, `TIDE_SAND`; Kenney's snow crunch), wood (every interior), stone (caves, `ICE`, `CRACKED_FLOOR`; Kenney's concrete), water (shallow water while not surfing; the upstream `fishing_bobber_land` plops, MPL-2.0). No step for bumps, ledge jumps, ice slides or other online players.
  - **Surfing:** `swim`, a quieter, higher `fishing_splash_small` every 2nd step on the water. **Flying:** the game has no Fly field move; `fly-flap` (Kenney cloth flaps, `assets/audio/flight/`) is in the JSON, exported, and not wired.
  - **Music** (`assets/audio/music/<context>-music.ogg`, 11 CC0 tracks re-encoded once from the 256-320 kbps originals to Ogg Vorbis q2 ≈ 70 kbps stereo with the `wasm-media-encoders` / `@wasm-audio-decoders/ogg-vorbis` npm packages in a scratch folder (no encoder in the repo; same sample count, so the loops stay seamless), ~9 MB): title (title + intro), town, route, night (outdoors at NIGHT), cave, center (Pokémon Center interiors), gym (gym and League buildings), other interiors play town; battle-wild, battle-trainer, battle-gym (a Trainer with a badge / `:leader`), battle-league (`e4-*`, `champion*`). `data/audio/game-sounds.json` `music` → `game/public/assets/music/` + `index.json` (`export_sounds.py`, separate from `sounds/`). `src/music.ts` streams one `<audio>` element per track through the shared Web Audio context (a GainNode per track: 600 ms crossfade; iOS ignores `element.volume`), keeps only the current track and the one fading out, pauses while the tab is hidden, stops while muted (**M**), and starts the wanted track on the first input. The battle track starts at the encounter flash; a Trainer win fades it out under `trainer-win`; the evolution scene sets no music (`evo-full` is its music). Settings (CÀI ĐẶT row "Âm lượng"): `Nhạc: BẬT / TẮT`, music volume (default 35 %), sound volume, 10 % steps, localStorage per device (`mons-music`, `mons-sound`). No victory / League-specific jingle beyond these.

## 17. Catch rates and capture rules (decided 2026-11-19)

User (2026-11-19): first the catch rate of every species and how the reference engine decides a successful capture; then "catch success / failure: copy the reference engine exactly" (an explicit exception to the Gen 3 rule of §14); then "these two files are the game's own data".

- **Game data (Mons):** `data/pokemon/pokemon-catch-rates.json` = one `catchRate` per species (+ `forms` with their own rate), the value the game uses. `data/pokemon/pokemon-capture-rules.json` = the game's capture rules in the shape `game/src/capture.ts` reads: constants, status bonus, low-level bonus, critical capture, shake rule, display, `defaults`, and the ball table (`kind`, multiplier, `condition`, plus `item` / `name` for the balls the game sells). Both carry a short `source` note (MPL-2.0, `LICENSES/MPL-2.0.txt`, `THIRD_PARTY_NOTICES.md`).
- **Rules:** `a = (3·maxHP − 2·HP) × rate × ball / (3·maxHP)` in floats (×0.5 outside a battle), sleep / freeze ×2.5, poison / burn / paralysis ×1.5, ×3 at Lv 1–3 and ×2 at Lv 4–8; critical capture from 31 species caught (chance `round(a × mult / 6) / 256`, then one check); otherwise 4 checks `roll(65537) < round(65536 / (255/a)^0.1875)`. Master Ball always catches. 4 passed checks show 3 wobbles, a critical capture 1.
- **Game:** `capture.ts` (MPL-2.0 port) is loaded from `assets/data/capture.json` (a copy of the rules file) by `Boot.ts`; `ballForItem()` maps bag items to balls (Poké Ball = `poke_ball`, Great Ball = `great_ball`; English ball names, §10). `Battle.ts throwBall` passes in-battle, the battle turn, the Pokédex caught count, owned species, types / base Speed / weight and the active Pokémon's level; clock, fishing, diving and areas use `defaults` (Dusk / Moon / Lure / Dive / Park ×1). `mons.json` `catchRate` comes from the rates file.
- **Research (not game data):** `docs/explanation/research/capture.md` + `docs/explanation/research/capture-reference.json`: the reference engine's steps with verbatim code, the official Gen 3 rules (pokeemerald `Cmd_handleballthrow`), differences, the source pack's changes and worked examples. Gen 3 would give about a/255 per throw where the game gives about (a/255)^0.75 (Pidgey Lv 15, Poké Ball: 33.7% vs 43.9%).
- **Build and checks:** `tools/data/catch_rates.py` writes all three JSON files and checks every number against the reference source and pokeemerald (paths from `--reference-src` / `MONS_REFERENCE_SRC` etc., never stored in the repo; it refuses to write the upstream project's name). `node game/tools/check_capture.ts` replays the worked examples (Monte Carlo, ±1 point).

## 18. Poké Ball sprites (decided 2026-11-19)

User: copy the Poké Ball animation (throw, shake, caught, …) from the 3D reference and let agy draw the basic balls (no ancient balls); then "bắt buộc có masterball", "pokeball dạng pixel tròn", "các ảnh vẽ bằng agy chấp nhận 1 lần vẽ và không sửa", "đảm bảo các hiệu ứng không bị hidden bởi vì box", "lỗi hiển thị ball là lỗi nghiêm trọng, cần phải sửa".

- **Facts:** `data/battle/pokeball-animation.json` (`tools/data/pokeball_anim.py --src <3D reference assets>`): the 3D reference's capture sequence and keyframes (MPL-2.0, see `THIRD_PARTY_NOTICES.md`; summarised, nothing copied), per-ball texture / particles, and the pokeemerald Gen 3 sequence. **Mons follows Gen 3 on screen** (34-frame arc, open + absorb, 4 bounces, 0-3 wobbles, click + 3 stars, break-out); the 3D reference gives the frame poses (spin, lid angles, tilt, break-out lid flip).
- **Sheet:** `assets/items/PokeBalls/<Name-Ball>/<id>-ball.png` (+ `.json` layout: cell, ball_px, baseline, rows), 8 × 6 square cells, ×2, ≤ 15 colours. **24 px ball** (user: "ball xấu quá, tăng pixel lên để rõ hơn, nới rộng box ra để hiệu ứng không tràn box"; twice the Gen 3 12 px). Cells are 64 px native minimum, sized per sheet for its largest effect + 4 px margin (steps of 8, up to 128): effects are never cut by the cell (as §12). Rows: throw 8, open 4, shake 5, success 4, break 4, icon 1. Skill `.agents/skills/pokeball-generator/`.
- **Round balls only:** the agy pose guide is a ray-cast round ball in the reference poses; the reference's voxel-cube model is never shown or copied.
- **Normalizer (mechanical):** background keyed by distance to #FF00FF (agy's magenta varies) with a flood fill, so purples / pinks inside the outline survive; magenta fringe and specks removed; frames found by row bands and clusters (agy does not always keep the 8-column grid); palette from the drawing itself and a colour-majority downscale (area averaging made muddy smudges). `check_ball.py` FAILs on "cut at the cell edge", "magenta left", "ball missing" and magenta "foreign-colour specks". Purple / pink balls (Master, Love, Heal, Dream, Beast) are drawn on green #00FF00 instead (magenta bled into the purple). Every ball was redrawn once with an official artwork found on the web attached (user: "mỗi ball phải đính kèm reference image search trên web", must match the official art).
- **agy re-enabled for balls only** (Pokémon sprite requests stay held in `tmp/agy-requests/held-pokemon-requests.json`): one `generate_image` per ball, accepted as drawn. Exception: a sheet that still FAILs on display after normalizing (magenta left, cut drawing, a row empty or missing most frames) gets one redraw. Raw drafts go to the repo's `tmp/mons-refs/` (agy, a snap, has its own private /tmp).
- **Balls:** the 12 Gen 3 balls (Poké, Master first) and the 16 later official balls the reference has (Dusk, Heal, Quick, Level, Lure, Moon, Friend, Love, Heavy, Fast, Sport, Park, Dream, Beast, Cherish, Strange). Not drawn: ancient balls and the reference-only apricorn colours (Azure, Citrine, Roseate, Slate, Verdant).
- **In the game (B10, 2026-11-19):** `game/tools/battle_assets.py` exports every sheet halved to native (24 px ball) with `balls.json` (the frame each slot shows after `catch_anim.py`'s fallbacks, the ball centre per row, the open-fade colour); `Battle.ts` shows the thrown item's sheet at 0.5 (12 px on screen, like Gen 3 and the approved preview, keeping the 24 px detail on the ×6 canvas) and plays `src/ballanim.ts`, a frame-for-frame port of `catch_anim.py`'s timeline (3 ground hits, one bounce sound). A critical capture shows its one wobble at double speed. The bag icon of a ball item is its sheet's icon frame. Only Poké Ball and Great Ball were items then (now every ball with a sheet is, §23); the other balls need an `item` in the capture rules and a bag entry first.
- **Names (user, 2026-11-19):** balls keep their English names in the game (Poké Ball, Great Ball, Ultra Ball, Master Ball …), also inside Vietnamese sentences; see §10.

## 19. The reference engine's battle simulator (facts, 2026-11-19; no game decision)

User: "research thêm phần tính damage, hiệu ứng skill, tỉ lệ miss, … mà [engine tham chiếu] đã triển khai, copy về và đặt trong thư mục Simulation".

- **What computes its battles:** not its own code. The reference engine (1.8.4) ships a fork of **Pokémon Showdown** (MIT) as `showdown.zip` (version marker 19), unpacks it and runs it in GraalVM's JavaScript engine; the host only feeds data and reads the protocol lines back. Fork: GitLab project `33814069`, `master` commit `6ac114edf689` (2026-10-26), `pokemon-showdown` 0.11.9, last upstream merge smogon/pokemon-showdown `1ef8da5dbc61` (2024-02-25).
- **Rules used:** always `gen: 9` with a ruleset id that inherits the base Gen 9 data plus one alpha rule. Damage, accuracy, crit (1/24, 1/8, 1/2, always; ×1.5), secondary chances (`random(100) < chance`), stat stages, multi-hit, recoil / drain and turn order are upstream Showdown code with no change. The fork's edits: loose format objects, carried-over HP / status / PP, uuids, capture, bag-item scripts, host-registered species / moves / abilities / held items, an alpha multiplier in `getStat()` (not used by `getDamage()`).
- **Copy:** `sim/ShowdownSim/` — `src/` the original TypeScript (19 files, 1.4 MB, unchanged), `dist/` the compiled JavaScript as shipped (43 files, 3.4 MB, the minimum a singles battle loads), `LICENSE` (MIT, unchanged), `NOTICE.md` (origin, fork diff, what was left out), `README.md` (formulas with line numbers; comparison with pret/pokeemerald Gen 3 and with `game/src/data.ts`). `examples/damage_example.mjs` (Node only) runs the copied engine and checks a plain re-statement (`examples/formulas.mjs`) against it on 6000 random cases.
- **Main gaps it shows** (for a later decision, none taken): Gen 3 crit is 1/16 ×2 and rolls the 85–100 % factor last; Gen 9 rolls it before STAB / type; the game today uses a Gen 1 Speed-based crit rate, float stat stages and the Gen 1 15-type chart, and has no multi-hit, recoil, OHKO, weather or ability / item modifiers.

## 20. Upstream names only in THIRD_PARTY_NOTICES.md (decided 2026-11-19)

- **User rule:** the repository never names the upstream project, its content pack or the platform it is built for, nor uses
  their keywords (including the standalone word for platform add-ons): not in code, configs, data, docs, comments, field
  names, file or folder names. All names, URLs, versions and licences are collected in `THIRD_PARTY_NOTICES.md` (licence
  texts in `LICENSES/`); byte-for-byte third-party copies it lists (`sim/ShowdownSim/src`, `dist`, `LICENSE`) are
  exempt. Neutral wording: "the upstream project", "the reference implementation / engine", "the 3D model source",
  "Fall-back". `python3 tools/check_names.py` enforces it.
- **Renames:** `tools/model3d/` (renderer `render3d.py`), `tools/skills/fallback_vfx.py`
  (debug notes `tmp/fallback-vfx/<…>/<id>-source.json`), vfx source `fallback` (an unknown older value is read as
  `fallback` with a warning), `Sounds/LICENSE-*` (now `assets/third-party/reference-sounds/`) → `THIRD_PARTY_NOTICES.md` + `LICENSES/MPL-2.0.txt` (the game build ships
  both next to the sounds). `assets/pokemon/Fall-back/` JSON uses neutral ids (`"geometry"`, `mons:`, `world:`, `math.fmod`,
  `*_blocky`); the 3D tools still read the original upstream ids.
- **Local checkouts** are never hard-coded: `MONS_REFERENCE_SRC` (upstream source checkout; also accepted as a CLI
  argument by the data tools), documented in `tools/README.md`.

## 21. Battle base, League, evolutions and the online game (decided 2026-11-19)

User (2026-11-19): "design phần này trước, extract logic code/json của [engine tham chiếu]. về hiệu ứng thì cứ kêu agy
vẽ"; then "online server, nội bộ chơi chung, lưu database", level C, server on this machine; priority = effects +
battle base + League design, server later. Design: `docs/explanation/spec/11-battle-and-save-systems.md`.

- **Data JSON is the source of truth for battle rules**, extracted, never hand-edited:
  `data/battle/move-effects.json` (all 354 Gen 3 moves, effect vocabulary; `tools/data/build_move_effects.py`),
  `abilities-battle.json`, `held-items.json`, `weather.json` (`tools/data/build_battle_extras.py`),
  `data/pokemon/pokemon-evolutions.json` (`tools/data/build_evolutions.py`). Numbers = Gen 3 official
  (pret/pokeemerald); the Showdown copy (and the reference engine's species data for evolutions) gives shape and
  coverage; every Gen 9 difference is listed per move. `data.ts` `AILMENT` / `STATUS_EFFECT` / `DRAIN` and
  `build_assets.py` `STATUS_OK` / `SKIP_MOVES` are to be replaced by it.
- **Battle core = pure TypeScript** in `game/src/battle/` (no Phaser, no `Math.random`; injectable seeded RNG = the
  pokeemerald LCG; `runTurn` returns events that `Battle.ts` animates), so the server can run PvP with the same code.
- **Recoil:** no own visual (reference engine and Gen 3: HP bar + "… bị phản đòn!", the hit blink); recoil HP taken
  is counted per Pokémon (`recoilTaken`) for recoil-based evolutions.
- **Online game, level C** (cloud save + see each other + chat + trade + PvP) for internal members: a Node server on
  this machine (`ws` + `node:sqlite`, open registration (§24), scrypt passwords, Cloudflare quick tunnel like the sibling project);
  progress in SQLite (`state.ts` `GAME` = the payload, party / PC / bag / dex as rows, versioned with migrations).
  **Built after the battle base** (spec 11 §9 phase S). The start menu gets **LƯU** back (reverses §10) + autosave on
  events; title TIẾP TỤC / ĐĂNG NHẬP / TRÒ CHƠI MỚI.
- **Evolutions:** every condition from the data (stones from the bag, trade, friendship 220, time, held item …), Gen 3
  values where the reference differs (friendship 160 there). Trade evolutions stay at Lv 37 until online trade exists.
  Evolution stone / held-item bag icons are drawn by code in the UI skill (`items.py`), not by agy.
- **League:** Elite Four (Lorelei, Bruno, Agatha, Lance) + Champion = rival in 6 rooms after 8 badges (no healing
  between rooms, Hall of Fame + credits, rematch). Losing keeps the progress (follow-up answer 1 below; this replaces
  the FRLG "a loss restarts the run"). Location and new maps proposed in spec 11 §4, not built yet.
- **Battle-system effects by agy** (one-shot, user: "về hiệu ứng thì cứ kêu agy vẽ"): 11 sheets queued as `fx-<key>`
  (`tools/agy/fx_pack.py`) → `assets/ui/Battle/` strips + `battle-fx.json`; existing move images (Fallback: Protect, Reflect,
  Light Screen, Mist, Haze; Leech Seed, Wrap …) are reused; banner, save icon and vanish tweens are code.
- **Answers to spec 11 §10 (user, 2026-11-19):**
  1. **Battle rules follow the latest generation** ("theo gen mới nhất", consequences confirmed 08:34): crit stage 0
     = 1/24, then 1/8, 1/2, always; ×1.5; a crit ignores the attacker's negative and the defender's positive stages
     (and screens); the 18-type chart with Fairy and the Gen 6+ Steel (no Ghost / Dark resistance); **species types
     follow the latest gen** (Clefairy, Clefable, Jigglypuff, Wigglytuff, Mr. Mime gain Fairy; later Cleffa,
     Igglybuff, Togepi, Togetic, Marill, Azumarill, Azurill, Snubbull, Granbull, Ralts line, Mawile; Magnemite /
     Magneton are Electric / Steel); **moves take their latest type** (Charm, Sweet Kiss, Moonlight → Fairy, Curse →
     Ghost); the **physical / special split is per move** (54 of the 354 moves change, e.g. Shadow Ball special,
     Crunch / Bite / Fire Punch / Waterfall physical). This reverses the Gen 1 battle rules of §11. Move power /
     accuracy / PP: latest generation too (follow-up answer 5); the rest of `move-effects.json` stays Gen 3 (pret).
     Data: `move-effects.json` v2 `type` / `category` = latest (Showdown copy `sim/ShowdownSim/dist/data/moves.js`),
     `gen3Type` / `gen3Category` kept; to do: the 18-type chart (`typechart.js` `damageTaken`: 0 ×1, 1 ×2, 2 ×½,
     3 ×0, `stellar` dropped) → `data/battle/type-chart.json` via `showdown_dump.cjs typechart` + a small
     `tools/data/build_type_chart.py`, and species types from `data/pokemon/pokemon-base-stats.json` `types`
     (already latest-gen) instead of `sim/BattleSim/data/species_base_stats.json` `gen1Types` in `build_assets.py`;
     `data.ts` `CHART` / split by type are then replaced (spec 11 §1.2, step B1).
  2. **League west of city-a:** new route (`route-17`) → Victory Road → League plateau (spec 11 §4.1).
  3. **Rematch like the reference trainer data:** the stronger League only after it was cleared once, fixed levels,
     no scaling to the player (research: `docs/explanation/research/league-rematch.md`). Mons: after `flags.champion`
     the Elite Four and Champion use the FRLG post-game teams (`TRAINER_ELITE_FOUR_<member>_2`,
     `TRAINER_CHAMPION_REMATCH_<starter>`, official levels: follow-up answer 3) → `trainers.json`
     `elite_four[].rematch`, `champion.rematch_variants_by_rival_starter`, rules in `league`. Run flow: follow-up
     answer 1.
  4. **Permanent battle weather per map: postponed** (no map has it; moves and abilities still set weather).
  5. **Game clock = real Vietnam time (UTC+7)** whatever the device's timezone; once online, the server's clock.
  6. **No offline save: online only** (only the session token is stored on the device).
  7. **Traded Pokémon always obey** (no Gen 3 badge obedience).
  8. **PvP level = a setting the players choose:** real levels, or every Pokémon set to Lv 50 for the battle.
- **Follow-up answers (user, 2026-11-19; spec 11 §10 items 9–15):**
  1. **League losses keep progress, like the reference trainer data:** a lost League battle is not a blackout; the
     party is healed on the spot, the player stays where they are (the room of the member who won), defeated Elite
     Four members stay defeated, no money is lost. No healing between rooms otherwise. The progress is cleared only
     after the Champion is beaten (the next challenge starts at the first member). Each team pays its prize money once
     (its first defeat); rematch teams unlock after becoming Champion. Data: `trainers.json` `league`
     (`on_loss`, `loss_resets_run false`, `reward_once_per_team true`).
  2. **Level caps, close to the official games:** cap = the ace level (highest level) of the next required trainer in
     `trainers.json` + 5: the next badge's Gym Leader (Mons gym levels, FRLG-based: 18, 23, 27, 31, 35, 39, 43, 47),
     with 8 badges the next undefeated League member (Lorelei 50, Bruno 52, Agatha 54, Lance 55, Champion 58); **no
     cap after becoming Champion**, as in the official games (the rematch Champion ace + 5 would be 80). The reference
     engine's higher caps (its own trainer levels, initial cap 20) are not used. A Pokémon at or above the cap gains
     no EXP (EXP below it stops at the cap level) but still gains EVs; Rare Candy has no effect at the cap; Pokémon
     already over it keep their level. **A Gym Leader refuses to battle** while any party Pokémon is above the cap;
     ordinary Trainers, the rival and the League never refuse (user, 2026-11-19: "trainer ko từ chối chứ gymer là phải
     từ chối"); with 8 badges the cap follows each League member (user: "theo từng người").
     Data: `data/battle/level-caps.json` (built by `tools/data/build_trainers.py`
     from the same teams); rule: spec 11 §4.3.
  3. **Rematch teams keep the official FRLG post-game levels** (no 0.84 ratio): Elite Four `*_2` Lv 63–72,
     Champion rematch Lv 72–75 (pret/pokefirered), with their own movesets and held items. The first League keeps
     the 0.84 ratio (Lv 43–50, Champion 48–53).
  4. **Rematch teams may use Gen 2 species** (Crobat, Misdreavus, Steelix, Heracross, Piloswine, Kingdra, Tyranitar:
     `league.rematch.species_beyond_151`). Species without their own 2D sprites use sprites from the 3D-model
     fallback pipeline (`assets/pokemon/Fall-back/`, the `pokemon3d` sheets) until their Gen 2 sprites are drawn;
     `game/tools/build_assets.py` has to export them (spec 11 §9 L1b).
  5. **Move power / accuracy / PP follow the latest generation** (the Showdown copy's Gen 9 `basePower`, `accuracy`,
     `pp`): `move-effects.json` `power` / `accuracy` / `pp` = latest, `gen3Power` / `gen3Accuracy` / `gen3Pp` kept.
     118 of the 354 moves change (power 52, accuracy 63, PP 29; e.g. Tackle 40 / 100, Fly 90, Thrash 120 / 10 PP,
     Recover 5 PP); 20 moves become never-miss (`accuracy: null`, `never-miss` in `fx`: Roar, Whirlwind, Mean Look,
     Block, Vital Throw …). Priority, effect chances and the other effect numbers stay Gen 3. The game's
     `data/battle/moves.json` already carried these latest values, so the game's numbers do not change.
  6. **PvP "Cấp 50" scales both up and down** to Lv 50 (VGC style, stats recomputed for the battle); the other mode
     uses the real levels.
  7. **Online-only save: unsent state lives only in memory**; closing the tab before it reached the server loses it
     (accepted).
- **Move names are shown in English** (user, 2026-11-19 10:43: "đổi skill thành tiếng anh hết"): `moveName()` in `game/src/data.ts` returns the English name; the approved Vietnamese names stay in `data/battle/move-names-vi.json` (exported as `vi`) but are not displayed. Poké Ball names are English too (§18).
- **Battle core confirmed by the user (2026-11-19, 09:50):** Trainer AI picks moves the BattleSim way, bag items follow Gen 3 (ok); **base stats stay Gen 3** (no latest-gen stat buffs, e.g. Raichu, Alakazam, Victreebel keep Gen 3 stats); a benched move put into an empty slot starts at 0 PP (keep, as the reference); badly poisoned becomes normal poison after battle (ok); Sketch / Snatch / Imprison / Magic Coat are not needed (no Pokémon in the game learns them); the 182 Vietnamese move names in `data/battle/move-names-vi.json` are approved.
- **Battle core decisions (battle-core agent, 2026-11-19; implemented in `game/src/battle/`):**
  - **Trainer AI = the BattleSim mechanism** (user: "the BattleSim mechanism"; replaces the Gen 3 flag scores of §14
    for move choice): `sim/BattleSim/ai.py` ported to `game/src/battle/ai.ts` — damaging move = min(1, expected
    damage / target HP × speed factor (1 / 0.6) + random margin ≤ 0.15), status move = 0.5 × (0.4–0.7), weighted
    random pick (floor 0.01). The expected damage is the game's own formula (abilities, items, weather, screens,
    18 types; multi-hit ×3), an ability counts once its banner showed, and moves that cannot work keep only the
    floor. Switching only on a faint (next able Pokémon in party order), as BattleSim. Bag items stay the Gen 3
    `ShouldUseItem` rules (BattleSim has none). Wild Pokémon pick a random usable move. Checked against BattleSim's
    own choice frequencies (`check_battle.ts`, ±5 points).
  - **Move legality = the reference engine's move lists** (user, 2026-11-19): `data/pokemon/pokemon-move-legality.json`
    (`tools/data/build_move_legality.py`, every category: level, TM, tutor, egg, legacy, special, form change; a
    pre-evolution's moves count). A Pokémon never permanently knows another move: `teach()` refuses it,
    `tools/data/build_trainers.py` filters trainer sets (none were illegal), `check_learnsets.ts` checks Trainers,
    starters, level-up lists and wild Pokémon. Mimic / Transform copies are battle-only (the battler's own slots).
  - **Benched moves like the reference** (user: yes): `Mon.benchedMoves`; a move pushed out of the four slots (HỌC
    CHIÊU, or a refused new move) goes to the bench, never lost. THÔNG TIN page 3 (CHIÊU, outside battle) swaps a slot
    with the bench or any level-up move up to the current level (the reference's `allAccessibleMoves`); PP rule of the
    reference `exchangeMove`: the move swapped in gets the replaced move's PP ratio, into an empty slot 0 PP.
  - Base stats stay Gen 3 (§11): only types / moves / crit / split are latest-gen; `check_battle.ts` compares the
    damage formula on Showdown's own stats and lists the species whose later base stats differ.
  - Badly poisoned (`tox`) becomes poisoned when the battle ends (the bag's Antidote cures it); knocked-off items come
    back after the battle; a consumed berry is gone; Pay Day = 5 × level (Gen 3).
  - Nature Power / Secret Power / Camouflage use the battle background's terrain (grass, water, cave, sand, else
    plain = Swift / paralysis / Normal). Sketch, Snatch, Imprison and Magic Coat are not run yet and not shipped.
  - 182 more moves got Mons's own Vietnamese names (`data/battle/move-names-vi.json`), so every shipped move is
    named in Vietnamese.
- **Order of work (agreed 2026-11-19):** B10 first (Poké Balls + capture animation + the agy battle effects in the
  battle), then B0 → B9; League maps M1–M3 (route-17, Victory Road, plateau + League building) in parallel.
- **The simulators are part of the plan:** `sim/ShowdownSim/` is the test oracle of the battle core (latest-gen rules
  = Showdown Gen 9 behaviour, compared on fixed seeds); `sim/StatSim/` is the oracle for creating a Pokémon (IV / EV /
  nature / gender / shiny); `sim/EncounterSim/` already is the source of the game's encounters (keep the two in sync).
- **sim/ left GitHub on 2026-11-19** (user: "sau khi ghép vào game thì ignore các sim ra khỏi github"; spec 11 §9):
  the simulators' logic is in the game, so `/sim/` is in `.gitignore` and was untracked with `git rm -r --cached sim/`
  (the folder stays on the developer's machine; git history was not rewritten). They stay the **local** oracles:
  `game/tools/check_battle.ts`, `check_stats.ts`, `check_encounters.py` run against them when `sim/` is there and
  print "skipped" (exit 0) when it is not, so CI passes without it. The build needs no sim: the encounter slot fill
  moved to `tools/world/encounters.py` (same functions, byte-identical `encounters.json`). The Showdown data scripts
  (`tools/data/build_type_chart.py`, `build_move_effects.py`, `build_battle_extras.py`) read `MONS_SHOWDOWN_SRC`
  (a Showdown checkout's `dist/data`, default the local `sim/ShowdownSim/dist/data`) and skip without overwriting the
  committed `data/battle/*.json` when it is absent; the derived data stays committed under MIT
  (`THIRD_PARTY_NOTICES.md`, `LICENSES/MIT-Pokemon-Showdown.txt`).
## 22. Repository layout: one content root (decided 2026-11-19)

Numbered 17 on `main` before the merge with §§17–21 of the Poké Ball branch (2026-11-19); older references to "§17" for the layout mean this section.

- **All content under `assets/` and `data/`, kebab-case** (user request, `docs/explanation/repo-structure.md` phase 3): `Pokemon/ Overworld/ Maps/ Structures/ Characters/ BattleScenes/ UI/ Skills/` → `assets/{pokemon,overworld,maps,structures,characters,battle-scenes,ui,skills}/`; `Sounds/` → `assets/third-party/reference-sounds/` (README; source and licence in `THIRD_PARTY_NOTICES.md` + `LICENSES/MPL-2.0.txt`); `configs/` → `data/` (subfolders `battle/ pokemon/ stats/ world/` unchanged). Every script, skill, prompt, doc and data file that named an old root was updated; the old roots must not be recreated.
- **Inner names are unchanged on purpose:** `<GenX-Region>/<NNN>-<Name>/`, move folders `<English Move Name>/`, `Base/`, `Gyms/`, `Battle/`, `Fall-back/`, `MonIcons/`… are slugs / ids that data, map specs and manifests use.
- `game/public/assets/` (export layout) did not change; the `pokemon3d` symlink stays at the repo root.
- **`sim/` left the repo (2026-11-19, §21 "sim/ left GitHub"):** it is git-ignored and local only; shared code the
  game build needs from it lives in `tools/world/` (`encounters.py`, the code for `data/world/`).
- **All code under `tools/<domain>/` and `sim/`** (phase 2, same day): the engines that lived in `.agents/skills/<skill>/scripts/` moved to `tools/<domain>/` named like `assets/<domain>/`: `tools/{maps,overworld,structures,characters,ui,battle-scenes,skills,pokemon,items}/` (move vfx + move review share `tools/skills/`; sprite + battle-pose scripts share `tools/pokemon/`), plus `tools/gen3/` for the one module several domains import (`gen3.py`, `check_gen3.py`). `Simulation/` → `sim/`. A skill folder keeps only `SKILL.md` + `references/`; a new script goes into the `tools/<domain>/` of the assets it writes, never back into a skill.
- **No Python package** (rejected `tools/src/monstools/`): the scripts keep their plain `sys.path.insert` + top-level imports; only the paths changed (`REPO` = 2 levels above `tools/<domain>/x.py`, shared code via `os.path.join(HERE, "..", "gen3")`). A package with relative imports would have touched every import line of ~120 files for no gain in output.
- **Merge with the Poké Ball branch (2026-11-19):** its additions follow the same layout: `Items/PokeBalls/` → `assets/items/PokeBalls/` (new domain `assets/items/`, tools `tools/items/` from the old `pokeball-generator/scripts/`), `UI/{Items,Battle,Evolution}/` → `assets/ui/{Items,Battle,Evolution}/`, the new `configs/*` files → `data/<domain>/`, `Simulation/ShowdownSim/` → `sim/ShowdownSim/`, `docs/research/capture*` → `docs/explanation/research/`, `docs/spec/11-…` → `docs/explanation/spec/`, `tools/data/import_item_icons.py` → `tools/ui/` (it writes `assets/ui/Items/`). The neutral names of §20 win over the names the layout pass used (`tools/model3d/`, `fallback_vfx.py`, `reference-sounds/`, `*_blocky`); `THIRD_PARTY_NOTICES.md` and `LICENSES/` stay at the repo root. `npm run lint` also runs the name check (rule `names`, K6). The battle-system effect and evolution strips (`assets/ui/Battle/`, `assets/ui/Evolution/`) came under `check_gen3` with `assets/ui/`: their colours were snapped to the BGR555 grid, and `fx_pack.py` / `fallback_vfx.gen3()` now snap their palettes (I1); the Poké Ball sheets are checked too (`tools/check.sh`).

## 23. World: clock, weather, time / weather encounters, creating a Pokémon, wandering Trainers, Marts (decided 2026-11-19)

User goal for the round (2026-11-19): "catch Pokémon with spawns that depend on time and weather and Pokémon with
random stats like the reference engine; battle wandering Trainers; battle Gym Leaders when the level allows; the shop
sells all the items; all designed sims are integrated". Implemented in game v0.13 (`game/README.md`).

- **Clock = Vietnam time (UTC+7)** whatever the device's timezone (§21 answer 5): `game/src/clock.ts` (`Date.now()` +
  7 h read with the UTC getters, a server offset hook for later). Phases = `pokemon-spawns.json` `time_phases`
  (MORNING 5–9, DAY 10–16, DUSK 17–19, NIGHT 20–4), exported in `assets/data/world-time.json`. Start menu: a clock card
  (time, phase, weather); THẺ: time, weather and the current level cap. Outdoor maps get the phase's own `tint_rgba`
  at 80 % (night = navy, dusk = orange, morning = warm), interiors none.
- **World weather = the spawn data's own weather, per District theme** (not the reference engine's global
  clear / rain / thunder; confirmed by the user, 2026-11-19: "keep weather per District"): the spawn conditions use CLEAR / RAIN / STORM / FOG / HEAT / SNOW and
  `weather_transitions` has one Markov chain per theme, so each theme has its own weather. Deterministic and shared
  (so every player sees the same weather online later, without the server): the VN day is cut into periods of 20–40
  minutes (lengths from a hash of the date), each period steps the theme's chain with a hash of date + period + theme,
  and the day's first period is drawn from the chain's stationary share (no daily reset to CLEAR). Interiors and caves
  are always CLEAR. Overlays on outdoor maps only, under every window, procedural: rain streaks (storm: denser +
  a lightning flash every 6–15 s), fog haze, heat tint, snow flakes. `assets/ui/Battle/weather-rain.png` is a battle
  strip and is not reused. **No battle weather** (battle agent, B5).
- **Encounters by time and weather, still Gen 3 per step:** every `map_spawns` table (and the cave tables) exports
  `by` (`"<PHASE>/<WEATHER>"` → index) + `variants` (deduplicated slot lists) built with EncounterSim's own
  `eligible()` + `fill_slots()` (`game/tools/world_assets.py`); `encounter.ts` `tableFor()` picks the slots for the
  VN phase and the map's weather and passes the phase's `encounter_rate_mult` as `timeMult` (DUSK ×1.15, NIGHT ×1.25)
  into the unchanged step. **No empty tables (user, 2026-11-19, "dự phòng"):** a phase × weather where EncounterSim
  finds no Pokémon copies, at export time, the first non-empty one of: the same weather at the nearest other phase
  (cyclic MORNING → DAY → DUSK → NIGHT, the earlier phase first on a tie), the same phase in CLEAR, DAY / CLEAR; it is
  listed in the table's `fallback_of` (`"NIGHT/RAIN": "DUSK/RAIN"`) so the game and PokéNav both use it as a normal
  table. `check_encounters.py` fails on any empty table and checks every fallback against that order. Generated tables (maps
  with no `map_spawns` entry) have no time / weather filter but get the phase's rate bonus. `check_encounters.py`
  checks every phase × weather of every table against EncounterSim and walks six phase / weather tables side by side.
- **Wider spawn pools (user, 2026-11-19: "many more species at once, like the reference game's spawn pools by biome,
  time and weather"):** targets per area at every phase × weather the map can have (its theme's weather chain; caves
  CLEAR): tall grass 8–12 species, Surf / sand / cave 5–8 (Rock Smash tables unchanged). Per-step encounter rates were
  not changed here; the user then chose option B (below). How:
  - `tools/data/build_spawn_pools.py` writes the pool entries into `pokemon-spawns.json` `map_spawns`: one biome pool
    per theme × terrain (meadow, forest, quarry, canyon, volcano, mystic, marsh, coast grass; sea / fresh / plant /
    marsh / mystic / rock water; beach sand; one pool per cave theme), tiers common / uncommon / rare / ultra = weight
    20 / 10 / 4 / 1 (the authored weights are on the same scale), level gates so evolved forms are rare entries of
    higher-level areas only and early species leave late areas; levels in the area's band (the authored entries'
    min..max; base forms lo..lo + 5, evolved hi − 4..hi). The authored entries are the core and never change; pool
    entries carry `"pool": "<tier>"` and are rebuilt on every run (`--check`, `--report` prints the counts). A pool
    entry is skipped when it would push a phase × weather past the target's top, unless another phase × weather it
    appears in is still under the bottom (dusk, shared by day and night species, may then hold more than 12:
    `fill_slots` drops its lightest entries). Only species with a movement sheet, no legendaries.
  - The maps that only had a generated District table (hub-city, city-b, port-city, cinder-city, starfall-town,
    bloom-town Surf; the Surf of route-1 / 2 / 3 / 6 / 7 / 11 / 14 / 15 / 15b and flint-city; the grass of route-8 /
    9a / 9b / 12 / 16) get `map_spawns` tables with the generated table's level band and the map's own weather theme
    (so the weather does not change): every game table is now a `pokemon-spawns` table with phase × weather variants.
  - `species_behaviors` (design data) was widened once (2026-11-19) so common species are out at most times and in
    any weather (Pidgey, Spearow, Caterpie, Weedle day + dusk; Rattata, Nidoran, Paras, Geodude, Tentacool, Magikarp,
    Poliwag, Goldeen, Psyduck, Krabby, Shellder, Seel, Drowzee ... any time) and the rare ones stay locked: night /
    dusk ghosts, Zubat (morning, dusk, night), Oddish, Meowth, Venonat, Jigglypuff, Staryu; rain / storm / fog Golduck;
    storm Gyarados, Magneton, Electabuzz; sun fire types (Growlithe, Ponyta, Vulpix: clear / heat / fog) ...
  - **Surf had 12 slots** (Gen 3's 5 water slots hold at most 5 species, so `monsSlots.water` gave Surf the 12 land
    odds): superseded by option B, which has no slots on any terrain (`monsSlots` and `slot_percent()` are gone).
- **Option B: more encounters and rarity tiers (user, 2026-11-19):** replaces the Gen 3 slot table and the pure
  Emerald rates for every table (details §15): per-step rate ×1.5 in tall grass (one encounter every 10.0 steps on
  average, was 13.0), ×2 on Surf (26.5, was 49.0), in caves and on sand (13.0, was 22.0), via `monsRateMult`; the
  species roll uses the buckets common 88.5 / uncommon 10 / rare 1.2 / ultra 0.3 % (`monsRarity`), shared by weight
  inside a bucket and renormalised over the non-empty buckets of the map × terrain × phase × weather. Every table,
  phase and variant in `encounters.json` is `{slots, percent, tiers}` with one row per species; `encounter.ts`,
  PokéNav and `check_encounters.py` all read those rows. Levels unchanged. Example (route-1 DAY / CLEAR): Pidgey
  30 → 44.4 %, Rattata 20 → 44.4 %, Spearow / Nidoran ♀ / ♂ 10 → 2.0 %, Caterpie / Weedle 5 → 2.0 %, Metapod /
  Kakuna 4 → 0.3 %, Mankey / Ekans 1 → 0.3 %.
- **Creating a Pokémon = StatSim = pokeemerald** (StatSim documents that the reference engine has no PID and Gen 3
  has no hidden abilities, so the game follows Gen 3 where the two differ): `data.ts` `createMon` (gift / starter:
  `Random32()` PID, IVs from the next two `Random()`), `wildMon` (Cute Charm 2/3, Synchronize 50 %, `Random() % 25`,
  PID rerolled until nature / gender match), PID → nature, ability slot (`pid & 1`), gender (`genderRatio > pid & 0xFF`),
  shininess with the Player's OT ID (`GAME.otId`, `< 8` → 1/8192), base friendship from `data/stats/species.json`
  (starter 120), wild held item = `SetWildMonHeldItem` (45 / 50 / 5, Compound Eyes 20 / 60 / 20, both items equal →
  always, never legendary) from `held-items.json` `wild`; wild EVs 0; stats with the integer nature rule
  (`n * 110 / 100`). Battle.ts still calls `makeMon(species, level)`: the World fills `WILD_CTX` (OT ID, lead PID /
  ability / gender, map, whether it is a Trainer battle: generated Trainers' Pokémon get no wild item and are never
  shiny) before every battle. New save fields on `Mon`: `pid`, `otId`, `gender`, `shiny`, `friendship`, `item`,
  `ball`, `metMap`, `metLevel`; on `GAME`: `otId`, `steps`. Checked by `node game/tools/check_stats.ts` (same LCRNG
  seeds as StatSim: 300 CreateMon, 300 CreateWildMon with no / Synchronize / Cute Charm lead, 400 stat formulas,
  2000 shiny checks, held-item rates, EV gain, friendship events).
- **EVs and friendship:** `gainEvs` follows `MonGainEVs` (stops at 510, Macho Brace ×2). Friendship =
  `AdjustFriendship` (`sFriendshipEventModifiers` tiers, Soothe Bell ×1.5, Luxury Ball +1, met map +1): walking
  (every 128 steps, 50 %), vitamins, and — applied by the World when it comes back from a battle, so `Battle.ts` stays
  untouched — each level gained (+5 / +3 / +2) and a won Gym Leader / Elite Four / Champion battle (+3 / +2 / +1).
  Fainting / battle items are the battle's (later). A caught Pokémon keeps its ball (`capture.ts` remembers the last
  successful ball): Friend Ball → 150, Heal Ball → healed, Luxury Ball → +1 on every gain.
- **Wandering Trainers** (`game/src/wander.ts`): two per generated route, placed on open path cells away from exits,
  doors and the fixed Trainers (deterministic per route and VN day), walking one cell every 1–3 s within 3 cells of
  their spot, spotting the Player in a 4-cell line like Gen 3 ("!" → walk up → battle in the usual scene and AI),
  class and sprite from the route's District (`assets/characters/Trainers`), 2–3 Pokémon at the route's Trainer level
  .. +3 from the District pool (`map.json` `wander`, written by `build_assets.py` `route_trainers`). Cooldown = one VN
  day: the id is `wander:<route>:<n>@<YYYYMMDD>`; old days are dropped from `GAME.defeated`, so tomorrow's Trainers can
  be battled again.
- **Gym Leader level cap:** `assets/data/level-caps.json` (copy of `data/battle/level-caps.json`), `caps.ts`: a Leader
  (Trainer with a `badge`) refuses while any party Pokémon is above the cap, with the data's `rule.refuse` line, and
  does not spot the Player again until the map reloads. Gym Trainers, the rival and route Trainers never refuse. EXP is
  only awarded in `Battle.ts`, so the EXP cap stays the battle agent's B11.
- **Marts sell the Gen 3 progression** (pokeemerald `data/maps/*_Mart/scripts.inc`, Oldale → Ever Grande, mapped onto
  badge counts, cumulative): 0 Poké Ball, Potion, Antidote, Paralyze Heal, Awakening, Escape Rope, Repel, X Speed /
  Attack / Defend; 1 + Super Potion, Timer Ball, Repeat Ball; 2 + Great Ball, Guard Spec., Dire Hit, X Accuracy; 3 +
  Nest Ball, Burn / Ice Heal, X Special, Super Repel, Revive; 5 + Ultra Ball, Hyper Potion; 6 + Net Ball, Dive Ball,
  Full Heal, Max Repel; 7 + Max Potion; 8 + Full Restore. Department store (Lilycove 2F–3F + FRLG Celadon stones):
  1F every basic ball / medicine / Repel / Escape Rope, 2F vitamins, X items and the four stones. Luxury Ball is never
  sold (Gen 3), a Premier Ball comes free with 10+ Poké Balls (`shop.c`), TMs are skipped (no TMs in the game). Prices =
  pokeemerald `items.h`. The shop scrolls (7 rows), shows the item's icon and text, and asks a quantity (±1 / ±10).
  **Shop tabs (2026-11-19, phone fix):** the stock is split by use into BÓNG, THUỐC (HP, Revive, PP), TRỊ BỆNH (status
  heals only; Full Restore stays THUỐC), VẬT PHẨM (Escape Rope, Repels), TRẬN ĐẤU (X items, Dire Hit, Guard Spec.),
  VITAMIN and ĐÁ (stones), in that order, showing only the tabs with stock in that Mart (`items.ts` `martTabs`,
  `game/src/shopui.ts`). Left / right or a tap change tab; the list has a scrollbar and takes drags and the wheel; the
  quantity step has tappable −10 / −1 / +1 / +10, MUA and THÔI; ĐÓNG (or B) leaves. No THÔI row in the list. The held
  count moves to the item window ("Trong túi: N").
  Every ball with a sheet is a bag item (`pokemon-capture-rules.json` `item` / `name`, Vietnamese names; also written
  by `tools/data/catch_rates.py`); `capture.ts` reads night / moon phase / light level (caves 0, night 4) from the clock.
- **"Tính năng đang phát triển" notice** (user rule, 2026-11-19): `ui.ts` `notice(scene)` — one Gen 3 window with the
  text and an ĐÓNG button (A / B / Enter / Esc / tap), used for every dead end: start-menu entries not built, bag items
  with no use yet, locked doors with no interior, upper floors, roads not open, League battles. `noticeBusy()` keeps the
  closing key from reaching the scene behind it.
- **Picking up items on the ground** (user, 2026-11-19: "làm liền chức năng lụm đồ bằng nút Z"): Gen 3 item balls
  (pokeemerald `Std_FindItem`): the map's `item-ball` props block their cell; facing one + A (Z / Space / touch A)
  removes it, plays a fanfare (the level-up one: no item jingle in the sounds), says "<TÊN> nhặt được <VẬT PHẨM>!" /
  "<TÊN> cất <VẬT PHẨM> vào túi <TÚI>.", adds one to the bag and opens the cell. Picked balls are saved in
  `GAME.picked` (`"<map>:<x>,<y>"`) and never respawn. Bag cap 999 per item: a full stack keeps the ball ("Túi đã
  đầy."). The maps name no items, so `tools/data/build_ground_items.py` writes `data/world/ground-items.json`: a
  ball's own map `item` property wins, else a weighted Gen 3 item of the map's tier (area level ≤ 7 / ≤ 13 / later,
  the wild tables' level rule) seeded by map + cell; Moon and Sun Stone each lie at least once. Hidden items
  (Itemfinder) are out of scope: A at one shows the notice. Maps are not edited for this. Code: `game/src/pickup.ts`.

## 24. Online server: accounts, cloud saves, players on the same map, chat (decided 2026-11-19)

User (2026-11-19): "làm luôn đi bạn, cho player thấy nhau, đăng nhập tạo mật khẩu, đăng xuất, responsive cho mobile, lưu
dữ liệu player"; then "đăng ký rồi chơi thôi" (open registration) and the exact form: ĐĂNG NHẬP = Tài khoản +
Mật khẩu, ĐĂNG KÝ = Tài khoản + Mật khẩu + Xác nhận mật khẩu, both with an ĐÓNG button. Phase S of spec 11 §9
(S1 accounts + saves, S2 LƯU / autosave, S4 players see each other, S5 chat); trade (S6) and PvP (S7) come later.

- **Stack:** `server/` (new top-level folder, npm workspace `mons-server`): Node ≥ 22.18 running TypeScript directly
  (type stripping, erasable syntax only), `ws` 8.18.3 (exact, as the sibling project), `node:sqlite` (built in, no
  native build). One process, one port (8790, `127.0.0.1`): HTTP serves the built client, `/ws` is the game socket,
  so one Cloudflare quick tunnel URL serves both. The protocol types and the shared rules (name / password / chat
  limits, Vietnamese error texts) live in `game/src/net/protocol.ts`, imported by the client and the server.
- **Running:** tmux session `mons-play`, window `server` (`node server/main.ts`, log `tmp/server.log`), window
  `tunnel` (cloudflared to 127.0.0.1:8790). The tunnel URL is sent to the user, never committed. How-to:
  `docs/how-to/run-server.md`.
- **Accounts:** open registration. Name 2–12 characters (letters with Vietnamese marks, digits,
  space, `.` `-`; unique case-insensitively, Vietnamese-aware lower case), password ≥ 6 characters (this replaces the
  ≥ 4 / PIN of spec 11 §6.2). Passwords only as scrypt hashes (N 16384, r 8, p 1, 16-byte salt, 32-byte key). Session
  token = 32 random bytes kept in the browser's localStorage (`mons.session`), sha256 in the database, 30 days,
  renewed on use. Limits per IP (the tunnel's `cf-connecting-ip`): 5 failed logins (per IP and per name) → 5 min lock,
  20 register tries per 10 min, 5 new accounts per day. One live tab per account: a new login moves the account and
  the old tab stops with a message. Admin from the shell: `--list`, `--set-password <name>` (stdin), `--ban`, `--unban`,
  `--set-avatar <name> <slug|none>` (below).
- **Admin-set Player sprite (2026-11-19, user: an account plays a Player sheet chosen for it):** a DB edit alone would
  be undone by the player's open tab (on a save conflict the client re-sends its own state), so the override lives on
  the account: `accounts.avatar_override` (migration `003-avatar-override.sql`), set by `node server/main.ts --set-avatar
  <name> <slug|none>` (backs the database up to `<data>/backups/` first, checks the slug against the built
  `players.json` of `MONS_DIST`, audited as `set-avatar`). While set, every save the hub accepts gets its `player` field
  and `saves.avatar` forced to it, `enter` shows it to the room whatever the client sends, the login (`auth.avatar` and
  the save it hands over) carries it, and the hub re-reads the overrides every 3 s (the admin command is another
  process) and pushes a change as `{t: "avatar", id, player}` to the player (GAME.player follows, the World sprite is
  redrawn: `net/presence.ts`) and to its room (the others' sprite of that player changes). `none` stops forcing; the
  player keeps the sprite until a new game picks another.
- **Saves (online only, §21 answers 6 + 7):** the whole `GAME` object of `state.ts`, serialised generically (fields
  other modules add are saved without a server change), into `saves` with an optimistic `rev`; the last 5 versions
  per account are kept; queryable copies (trainer name, sprite, money, badges, map, x, y, party size, Mondex caught,
  play time). The server checks shape and sanity (party ≤ 6, levels 1–100, IV / EV ranges, money 0–999 999, known
  map / species / Player sprite ids from the built client, size ≤ 512 KB) and logs (not blocks) money jumps of
  100 000+ and badge drops in `audit`. The party / box / bag / dex rows of spec 11 §6.3 come with trade (S6) as a
  migration. Autosave: every World start (map change, back from a battle / catch / evolution), within ~4 s of a money,
  bag, party, box, badge, Mondex, pickup or story change, every 60 s if anything changed, when the page goes to the
  background; never during a battle or an evolution. LƯU in the start menu (reverses §10 "no SAVE entry") waits for
  the server: "Đã lưu trò chơi.". Unsent state stays in memory and is retried; the badge says "Mất kết nối…".
- **Title:** press → login window (HTML form) → TIẾP TỤC (save card: name, badges, Mondex, play time) or TRÒ CHƠI MỚI
  (the existing Player picker + Intro naming) and ĐĂNG XUẤT. Start menu: … THẺ, LƯU, CÀI ĐẶT, ĐĂNG XUẤT, THOÁT
  (LƯU / ĐĂNG XUẤT only online; their icons are drawn in `game/src/net/world.ts`). `npm run dev` stays offline unless
  the URL has `?online` (Vite proxies `/ws` to 8790), so local play-tests need no server.
- **Rooms = maps:** a client sends its cell, facing and Player sprite on `enter` and `pos` (only on change, ≤ 8 / s;
  the server relays ≤ 10 / s); others are drawn with their sprite, walking cell to cell, name tag in the game font,
  no collision (ghosts), faded while in a battle / evolution; they stay 8 s after a dropped socket. The online count
  is a small badge at the top of the screen.
- **Trainer name (user, 2026-11-19: "thêm chức năng đổi tên (ở lần đầu đăng nhập và trong mục cài đặt)"):** two
  names. The **account name** is the login (unique, never changes). The **trainer name** (`GAME.name`, column
  `accounts.display_name`, migration `002-display-name.sql`) is what everyone sees: the name tag, chat lines (also old
  lines: the history shows the current name), the online list, the Professor's lines. 1–10 characters: letters with
  Vietnamese marks, digits, spaces; NFC, trimmed, single spaces, control / invisible characters removed
  (`protocol.ts` `cleanDisplayName` / `displayNameProblem`, checked on the client and again on the server). **Not
  unique** (the Intro offers the same presets to everyone, and a "taken" error there would block a new game).
  Chosen in the Intro on a new game (required, no way out) and changed in START → CÀI ĐẶT → ĐỔI TÊN; both use the same
  HTML window (`game/src/net/name.ts`, §10). The `rename` message is answered with `renamed` (ok, or an error with the
  seconds to wait) and broadcast as `name` to everyone online; the game then saves. **One rename per minute**
  (`renamed_at`); an account's first name is free. A save whose trainer name differs from the shown one (a new game
  named while the rename was refused or offline) is taken over when valid and the minute allows; an older account
  without a display name takes its last save's trainer name at login, else its account name is shown. Renames are
  audited (`audit.event = 'rename'`); `--list` shows `display_name`.
- **Chat:** one channel for everyone online (the map is noted), 120 characters, 1 line / s, kept 7 days, inserted
  as text only. PC: T opens (Enter stays START), Enter sends, Esc closes; phone: the chat button left of the menu
  button. A line from someone on the same map also shows as a bubble above them for 5 s.
- **Phone:** the login form and the chat line are real HTML inputs (keyboard, autofill, password manager, Vietnamese
  IME), kept inside the safe area and above the keyboard (`visualViewport`), 16 px inputs (no iOS zoom).
- **Data and backups:** `server/data/` (git-ignored, mode 700): `mons.db` (+ WAL files), optional `config.json`
  (`port`). Backup while running: `node server/main.ts --backup <file>` (SQLite online backup); see the how-to.
- **Add to home screen, Android only (user, 2026-11-19):** `game/src/install.ts` keeps Chrome's `beforeinstallprompt` and shows one "📲 Thêm vào màn hình chính" button on the title and login screens; installed, the game opens from its own icon in full screen (manifest `display: fullscreen`, landscape), without the browser bars. iOS gets no button (Safari has no install prompt).
- **Browser cache (user, 2026-11-19: "cái này không lưu trên trình duyệt được hả bạn", "tải lâu quá"):** the Boot
  loads ~3000 files, so a repeat visit was slow even with 304s (one round trip each through the tunnel). Now:
  a **service worker** (`game/public/sw.js`, registered by `game/src/sw.ts` in production builds only, scope `./`)
  serves the page and every listed file from Cache Storage; `game/vite.config.ts` writes `asset-manifest.json`
  (every file + a content hash) and the build id into `sw.js` at build time. A cached file is used only while its hash
  equals the manifest's (one cache `mons-files-v1`, entries labelled with their hash), so a deploy re-downloads only
  the changed files; the new worker takes over at once and the page shows "Có bản cập nhật, đang tải lại…" and
  reloads. `/ws`, `/healthz` and anything not in the manifest are never cached. The **server** (`server/static.ts`)
  sends ETag = the same content hash (stable across rebuilds), answers 304 also for the weak `W/` ETags Cloudflare
  makes, `immutable` for Vite's hashed bundles and `no-cache` for everything else (asset URLs are not versioned, so
  a long max-age would mix two builds), and brotli / gzip for text files (compressed once, kept in memory). Measured
  through the tunnel: first visit ~17 MB / ~40 s as before; repeat visit 0 bytes over the network, ~8 s (client CPU
  only) instead of ~22 s.
- **Trade and PvP anywhere (2026-11-19, user: "ở đâu cũng được chứ không cần ở tầng 2"):** a trade or a PvP battle
  starts wherever the two players are: one sends the request to an online player (player card from a tap on the map,
  the chat or the friend list), the other accepts; nobody is warped and both must be idle in the World. This replaces
  the Pokémon Center 2F / Cable Club rule of spec 11 §6.6 (S6 trade, S7 PvP). Research: `docs/explanation/research/friends.md`.

## 25. Caves: two playable multi-floor caves (decided 2026-11-19)

Numbered 18 on `main` before the merge with the online-build branch (2026-11-19, whose §18 is the Poké Ball sprites); older references to "§18" for caves mean this section.

User: build BOTH approved mock caves (`docs/explanation/research/gen3-caves.md` §5, A and B) as real maps, two clearly different caves, as many new pieces as needed.

- **A · Hang Nguyệt Thạch** (`moonstone-cave-1f`, `-b1f`, `-b2f`, 88×52 each, theme `moon-cave`: cool grey-blue limestone, moonstone and crystals): through-cave, in from Route 6 (cave mouth on its west wall), out at B1F to Route 7 (north wall). 1F loop, B1F ladder pockets (a Hiker gives 2 Super Potions), B2F fossil room (take one of two fossils).
- **B · Động Đá Hoa** (`rosestone-cave-1f` 84×30, `-b1f` / `-b2f` 64×52, `-b3f` 40×30, theme `granite-cave`: warm pink-brown granite, carvings, braziers): dead-end story cave from Route 12; the Hiker on 1F gives HM05 Flash; B1F and B2F are dark; B1F's cracked floor is a risky shortcut; B3F is the ancient chamber.
- **Pieces:** `tools/overworld/pieces/cave.py` → `assets/overworld/Caves/` (`gen_overworld.py --cave`). Floors are a `fill` with behaviour `CAVE`, so every floor cell has encounters (pret `MB_CAVE`); walls are a rock top plus a two-row face under every south edge.
- **Maps:** `kind: "cave"` in `mapgen.py` with `tools/maps/cavekit.py` (`carve`, `ladder`, `hole`, `cave_exit`, `cave_decorate`, `wall_props`); `mapgen.py cave <group>` checks the floors together. Caves are joined to routes by Warps (`cave_entrance` op on the route), never by world Connections, and are not in `world.json`.
- **Game rules (Gen 3, adapted):**
  - a ladder lands one cell below its partner; a hole drops to the same cell of the floor below (pret `warphole`);
  - cracked floor: Mons has no bike, so **running (B held) stands in for the Mach Bike**: running across is safe and each crossed cell breaks into a hole behind you; walking onto it, stopping on it or stepping on a broken cell drops you to the same cell below;
  - darkness keeps Gen 3's share of the screen (24 / 72 px of 240): radius 4 cells without Flash, 12 cells with it on the 640 px view; with HM05 in the bag and a healthy party Pokémon the game offers Flash on each dark floor, and it lasts until the Player leaves the cave;
  - cave tables come from `data/world/pokemon-spawns.json` `map_spawns` (`cave` terrain, rate 10), battles use the `moon-cave` / `granite-cave` battle scenes; cave Trainers come from the map events (teams of the cave's types, `CAVE_LEVEL` in `build_assets.py`).
- **Mechanics for caves D–I (2026-11-19)** (`docs/explanation/cave-regions.md` §4; spec.md "Cave mechanics"; engine `tools/maps/cavekit.py`, game `src/scenes/World.ts` + `src/field.ts`):
  - **HMs** HM01 Cut, HM04 Strength, HM06 Rock Smash are items, handed over by cave NPCs (`gift` on an NPC event: Strength in D, Rock Smash in E, Cut in I). Like Flash: a party Pokémon that knows the move, or the HM in the bag and a healthy party Pokémon (the Gen 1 move list has no Cut / Rock Smash / Flash). No badge check.
  - **Strength** (Gen 3 `FLAG_SYS_USE_STRENGTH`): A on a boulder asks; once on it lasts until the Player leaves the cave (the map, outside caves), like Flash. Walking into a boulder pushes it one cell, the Player stays put. Boulders reset when the map loads again (Gen 3) but not after a battle; a boulder that sinks into lava (the cell becomes floor), falls through a hole (it lands on the same cell below) or locks on a switch (FR Victory Road) is saved in `GAME.boulders` / `GAME.flags`.
  - **Rock Smash / Cut**: the rock or tree is gone for the visit and back when the map loads again (Gen 3: no flag). Rock Smash then rolls a wild battle at rate 20 (`RockSmashWildEncounter`) from the map's `:smash` table, else its cave table.
  - **Ice** (`MB_ICE`): slide at the fast speed until blocked (stop on the ice) or off the ice (stop on the floor past it); no wild Pokémon on ice. Crystals are solid stoppers.
  - **Ledges** jump in four directions (`^` north, `>` east, `<` west, `v` south) in caves and on routes.
  - **Minecart** (not in Gen 3): stepping on the cart rides the rail cells one way, then hops off past the end. Rails are solid on foot.
  - **Levers and electric gates** (Sunyshore idea on FR switch logic): a lever flips a bit shared by every floor of the cave group (`bit:<group>:<n>` flag); a gate is open while its bit is clear (or set, `open: false`). Fixed **lamps** cut lit circles of `r` cells into the darkness mask besides the Player's.
  - **Tide** (Shoal Cave `UpdateShoalTideFlag`): high 00-02, 09-14 and 21-23 h, picked when the Player walks into the cave from outside; high tide swaps in the map's second collision and ground (`tide` op). The hour is the game clock of §23 (Vietnam time, the server's once online; `src/clock.ts`, read by `src/field.ts` `hourOf`); main's first in-game clock (`GAME.clock`, 1 real second = 1 game minute) was dropped at the merge so the game has one clock.
  - Art is by role with placeholders (flat colours) until the pieces exist; the map step plugs the slugs into the cave themes or `themes.json` `_mechanics`.
  - Fixes from caves A/B: a taken fossil's pedestal stops drawing the fossil (`<key>-empty` art when it exists, else hidden); the Rock Smash rocks on `rosestone-cave-b2f` now smash; `scaffold.py --force` keeps `cave_entrance` ops and ops marked `"hand": true`.

## 26. District gates, Stages and wild level bands (decided 2026-11-20)

User (2026-11-19): at the end of each District a ticket-check gate with a police officer; the Player passes only after the District's tasks (gym, story, quests); a level cap per District and a wild level range per District. Research and proposal: [`docs/explanation/research/district-gates.md`](../explanation/research/district-gates.md). The user said "commit and start" after reading the proposal's recommended answers (§3.12), so those answers are the decision below. **Supersedes** v0.4 "the whole world is open" (§13) for the outdoor maps and caves, and the §23 rule that authored `map_spawns` levels never change (see "Wild bands").

- **Stage** = the badges needed to enter a Map. `data/world/districts.json` gives every `world.json` map and every cave group exactly one Stage (checked by `game/tools/build_assets.py`, which fails otherwise) and each Stage its checklist (`stages.<n>.requires`: `badges`, `defeated`, `flag`, `item`, each with a Vietnamese label). Stages: 0 start-town … root-cave; 1 hub-city, route-3, city-b; 3 route-7, port-city, power-tunnel; 4 route-6 … the sea loop; 5 route-14, dune-city, route-16; 6 route-11, fen-city, route-12, rosestone-cave; 7 route-4 … frost-cave. Stage 3 also needs `rival-2`, Stage 5 `rival-3`. Quests are added later as `flag` items; they must never be missable and are never added to a Stage a player already passed.
- **Gate** (`game/src/gates.ts`, pure): crossing from a map into a map of a **higher** Stage asks that Stage's list; a lower or equal Stage is never checked, so nobody is stranded. The first pass stamps `pass:stage-<n>` in `GAME.flags` (no save change); a stamped Stage is never asked again. `World.ts` runs it on every transition: world seams (`step()`), cave mouths (`enterInterior`) and cave exits (`arrived()`). Refused = the officer's checklist, then one step back (Gen 3 blockers). Passed = jingle, stamp, the District's wild band and the current cap, then the crossing goes on.
- **On the map** (no change under `assets/maps`): a police officer, **CẢNH SÁT** (sprite `guard`), is placed at runtime on a free floor cell beside each seam or cave mouth into a higher Stage; talking shows the list or "Chúc bạn lên đường bình an!". Land seams get a boom barrier (Props `checkpoint-post`, `checkpoint-arm`, `checkpoint-arm-v`): the arm blocks while closed and folds away on the pass; the post's lamp is red, then green. Water seams have no barrier but the same check. THẺ shows "Trạm kế tiếp: <Khu> - cần: …".
- **Level cap:** unchanged (§21: next ace + 5, no EXP at the cap, Gym Leaders refuse an over-cap party, no obedience rule). Each District names its `cap_stage` row of `data/battle/level-caps.json`. The gate does not refuse an over-cap party.
- **Wild bands:** per District `wild.max = next ace − 7` (Emerald's median gap) and `min = max − 5`. `build_assets.py` fits every terrain table into its band, both ways (user, 2026-11-20, after comparing the one-way version): a table above it moves down so its top is the band max, one below it moves up so its bottom is the band min, one wider than the band is mapped onto `[min, max]` (cave floors of one group move together, deeper floors stay higher); tables inside are kept. In a moved table a species far below its evolution level becomes its pre-evolution and one far above becomes its evolution. `pokemon-spawns.json` is not edited; `wild_rule.enabled: false` turns the bands off.
- **One-way seams fixed (2026-11-20).** Four seams were listed both ways in `world-report.md` but existed only on one side in the game: port-city → route-8 (east) and → route-9a (south), start-town → route-10 (east), route-10 → route-12 (north). The first three had no `exit` op in their map spec; the fourth was a `mapgen.py` bug (two exits on one side shared the name `N`, the second overwrote the first). The specs now have the exits (last in `ops`, so nothing else on the map moves; the sea ones carry `"surf": true`) and `mapgen.py` names a second exit on a side `<side>-<to>`. With every seam two-way, gates G5, G8, G10 and G12 work: route-8, tide-cave and the sea loop open at Stage 4 as planned.
- **Not done yet:**
  - **Walk-through gatehouses.** The `route-gate` building exists but an interior is always left by the door the Player came in by (`World.ts` `leaveInterior` / `doorOutside`), and its 12×7 interior has exits only north and south. A gatehouse needs one exit target per mat and an east-west variant.
  - District display names are placeholders (`name_vi`); Victory Road's band is decided when the League maps exist.

## 27. Friends, BẢN ĐỒ and the minimap v2 (decided 2026-11-19)

User (2026-11-19): "kết bạn để biết nhau ở đâu khi xem map tổng, có thể xem thông tin người chơi khác khi click vào, có
thể giao dịch, thách đấu nhau"; then "sửa lại cả mini map luôn, rõ hơn, nhìn được các địa điểm quan trọng trong 1 map";
"ok" to the defaults of the research (`docs/explanation/research/friends.md`): add by a tap and by a friend code, friends
see each other's place by default, 50 friends, strangers see the card without the place and are not on the world map.

- **Places** (`game/src/places.ts`, pure): `placeOf(slug)` names every map (the named ones, interiors by kind, routes
  "ĐƯỜNG SỐ <n>", `<x>-city` / `<x>-town` "THÀNH PHỐ / THỊ TRẤN <X>"); `mapPois(map)` turns a built map's warps and
  connections into points of interest (Center, Mart / department store, gym with its type, caves, the player's home,
  the lab, other buildings, the roads out); touching warp cells to the same place are one door.
  `node game/tools/check_places.ts` checks every outdoor map.
- **Minimap v2** (replaces §10's 49 px minimap and "Tap: nothing"): 57 px ring; roofs from the `*-structure` objects
  coloured by kind; 7 px icons; Center / Mart / gym / caves / roads out out of view are pinned to the ring's edge in
  their direction; friends ringed green. A tap opens BẢN ĐỒ (the disc is above the touch stick's zone).
- **BẢN ĐỒ** (`scenes/MapScreen.ts`): START entry after POKÉNAV (offline too), M on PC (the user: "mở map bấm nút M"), or the minimap. The
  key is the "Bản đồ" row of CÀI ĐẶT (rebindable), which took the row of the old mute key: the user, "tắt tiếng để
  trong cài đặt thôi", so mute is now the first card of the Âm lượng row ("Tiếng: BẬT / TẮT") and has no key. KHU VỰC: one whole map at an integer scale (wide maps scroll to the pick),
  its places and a list of the important ones. TOÀN VÙNG: every outdoor map at its world.json place, fit to the
  screen; the Player and every friend. A building or a cave counts as the town outside (`GAME.outside`).
- **Friends** (migration `004-friends.sql`): `accounts.friend_code` (8 random letters / digits without look-alikes,
  made on first use, unique; never derived from the account id), `friends` (a < b), `friend_requests`, `blocks`. A
  request to someone who already asked is an accept. A block ends the friendship and the requests either way, stops
  new ones, and hides the blocker's card from the blocked. Limits: 50 friends, 20 open requests, 12 friend actions a
  minute, 10 wrong codes per 10 minutes, 30 cards a minute.
- **Where a friend is:** `enter` carries `place` (GAME.outside inside a building or a cave, else the map and cell).
  Online: the live cell on that map; offline: the last save's place (`json_extract` of `outside`, else `saves.map`).
  Friends hear `friend-status` only when a friend comes online, goes offline (after the leave grace) or changes
  place, never the 10 Hz steps; BẢN ĐỒ and BẠN BÈ ask for a fresh list when they open.
- **The card** (THẺ HUẤN LUYỆN VIÊN, `scenes/Friends.ts`): opened by a tap on another player, A facing them, a click on
  their name in the chat, or BẠN BÈ. Shows the trainer name, sprite, badges, Mondex caught, play time, party (species,
  level, shiny), the join date, and the place for friends only; never the money, the account name or the exact cell
  to strangers. Buttons: KẾT BẠN / CHẤP NHẬN + TỪ CHỐI / RÚT LỜI MỜI / HUỶ KẾT BẠN, GIAO DỊCH, THÁCH ĐẤU, CHẶN (remove
  and block ask for a second press).
- **Trade and PvP** start from the card, anywhere (§24 "Trade and PvP anywhere"; PvP built in §28); until S6 / S7 the buttons show
  "đang được phát triển". Gifts and private messages are not planned (a server edit of the save is undone by the open
  tab, §24 avatar story; gifts would need an inbox the client claims).
- **Known gap:** an account that never chose a trainer name shows its account name (as on its name tag since §24).

## 28. Player battles: thách đấu in lockstep (decided 2026-11-20)

User (2026-11-20): "làm tiếp thách đấu" (spec 11 §6.6 S7; where: anywhere, §24; levels: Q8 / Q14).

- **Flow:** the card's THÁCH ĐẤU → CẤP THẬT / CẤP 50 → `pvp-challenge`. One open invite per player, 30 s
  (`LIMITS.pvpInviteMs`), 6 challenges a minute; refused when either side blocked the other, is offline, is in a battle
  or has another invite. The invited World asks CÓ / KHÔNG when it is free (a menu screen keeps it waiting); accepting
  saves first. On `pvp-start` both Worlds close their screens and start the Battle scene; a client that cannot (already in
  a battle) forfeits at once.
- **Teams:** from the last saves on the server ("server-side rows only", §6.6), both clients save before challenging /
  accepting. Copies, fully healed (HP, status, PP) in both rules; CẤP 50 sets every Pokémon to Lv 50 (up and down) with
  stats recomputed; held items stay. Missing save fields get plain defaults. Nothing is written back: no EXP, money,
  friendship or item use (the "restored after" of §6.6 by never touching the save).
- **Lockstep instead of server events:** §6.6 said the clients only animate the server's event list. The Battle scene
  needs a live `BattleState` (menus, PP, forced moves, the party), so each client runs the same core on the same
  `(seed, actions)` and the server runs it too as the authority: it owns the seed (`randomInt`), checks every action
  (`battle/pvp.ts legalAction`; an illegal one or none within `LIMITS.pvpStepSeconds` = 60 s becomes a random legal
  move from a separate rng, never the battle's), decides the result and stores it. Steps are turns, or the
  replacements after a faint (applied side 0 then 1, then re-checked: Spikes can faint the newcomer). A checksum (active
  slot, HP, status, PP of every Pokémon) follows every step; a client that differs reports it and the battle ends as no
  contest ("desync": an old cached build against new data).
- **Viewer:** `BattleState.pvp = { viewer, names }` changes only text (`nameOf`, `sideName`, the send-out / recall
  lines), so both viewers replay the same numbers (`check_battle.ts` §8). The scene draws its own side near (back
  sprite) by flipping `who` once at `play()` and reading the state through `my`.
- **Rules in battle:** no bag ("Không dùng túi đồ khi đấu với người chơi!"), CHẠY = BỎ CUỘC after a second question,
  switching and Baton Pass as usual. A draw when both run out in the same step.
- **Drops:** a short drop (inside `leaveGraceMs`) asks for the missed messages by seq and re-sends the pending action;
  a player gone for good (grace over, logout, another tab took the account) loses ("left").
- **Storage:** migration 005 `battles` (both accounts, level rule, seed, both teams, every step's actions, winner,
  how, times).
- Trade (S6) is still a placeholder on the card.

## 29. Every species in the game, spawns from the reference pool (user, 2026-11-20)

User: "không giới hạn pokemon sẽ xuất hiện trong game, dùng tất cả pokemon đang có, nếu không có model 2d thì dùng
model 3D fallback, giữ lại tỉ lệ xuất hiện như [trò chơi tham chiếu]"; then: legendaries and mythicals must also have a
natural spawn chance. Replaces the hand-picked Gen 1 tables and pools of §23 ("Wider spawn pools"); option B (§15:
buckets 88.5 / 10 / 1.2 / 0.3, `monsRateMult`), the Gen 3 step, the time bonus and the per-area level bands stay.

- **Species:** every species with art (§5b): 906 on 2026-11-20 (240 2D sheets, 666 renders; 119 skipped). Data:
  `data/pokemon/pokemon-species.json` (`tools/data/build_species.py`): Gen 3 numbers (pokeemerald `species_info.h`)
  for #001-386, the reference's species data after (base stats, EV yield, gender byte, friendship, growth incl.
  erratic / fluctuating, base EXP, non-hidden abilities; abilities Gen 3 lacks have no battle effect yet and say so on
  the summary), latest-gen types, catch rates (§17), labels. `stats.json` carries every species' abilities / EV yield.
- **Moves:** level-up lists keep only the moves the battle core runs and the legality lists allow (§21);
  `species_assets.damaging_fallback` adds the weakest legal damaging moves at level 1 when a list has fewer than two
  there (435 species), and `data.ts learnedMoves` keeps at least two damaging moves among the last four, so every
  species has 2+ attacks at every level (6 whose legal list has fewer, e.g. Ditto, Unown, Kakuna, use all they have);
  `check_learnsets.ts` checks it.
- **Evolutions** (`species_assets.evolutions`, notes in `tmp/report/all-species/species-export.txt`): Gen 3 entries for
  #001-386 + the reference's for later results; only targets the game has (no regional forms). Level → its level
  (extra conditions such as time / gender dropped); friendship → Lv 25; other level conditions (a move, a stat
  compare, a place …) → Lv 30; trade (± held item) and items that are not stones → Lv 37 (§21); the six stones → used
  from the bag (`mons.json` `stones`, `items.ts stoneTarget`); Dusk / Shiny → Moon, Dawn → Sun, Ice → Water Stone; a
  species that evolves by stone gets no made-up level rule (Espeon / Umbreon → Sun / Moon Stone; Glaceon, Sylveon and
  second level branches dropped).
- **Spawns (scope set by the user, 2026-11-20: keep our spawn logic, add the other generations):** the §23 tables
  and Gen 1 pools stay (themes / terrains, time × weather variants, level bands, option B tiers and rates);
  `tools/data/build_spawn_pools.py` then adds every species with art from any generation to up to 3 tables whose pool
  favours one of its types (`POOL_TYPES`), on its terrain (water species on Surf, the others on grass / sand / cave)
  and where its level fits the band (the reference spawn's level range, else its evolution stage; bands topping under
  15 keep base forms with base-stat total ≤ 360), up to 40 species per grass table, 30 Surf / cave, 25 sand; a
  species that fits nowhere goes to the closest table of its terrain. Tier = the reference bucket (common /
  uncommon / rare / ultra-rare), else by stage / base-stat total; weight 20 / 10 / 4 / 1 like the pools; the
  reference's times / weathers become the entry's own `time_of_day` / `weather` (`tools/world/encounters.py
  eligible()` reads them before `species_behaviors`). The reference data is used per species only (no biome
  mapping): `tools/data/import_spawns.py` reads the content pack's spawn pool (primary, `MONS_SPAWN_PACK`) and the
  reference engine's own (fallback, `MONS_REFERENCE_SRC`) in place into `data/world/reference-spawns.json`.
- **Legendaries / sub-legendaries / mythicals** (species labels `legendary` / `mythical`): one ultra-rare entry each
  with art (`LEGEND_AREA`: Zapdos power tunnel B2F, Moltres magma cave B2F, Mewtwo rosestone B3F, Mew fen-city grass,
  Lugia route-16 Surf, Ho-Oh route-14 in clear weather, Rayquaza route-16 grass in storm / clear …; else a table of
  their types, highest band first), never on route-1 / 2 / 3 or a band topping under 15, at most one per table where
  possible, level = the band top (route-16's authored Articuno stays).
- **Shiny:** unchanged Gen 3 rule, personality vs OT ID < 8 = 1 / 8192 (the reference default `shinyRate` 8192 is the
  same rate); wild Pokémon roll it in `data.ts wildMon`; the battle plays the shiny sounds and now also Gen 3's star
  sparkle around the sprite (`Battle.shinySparkle`); the summary shows the red star and "Màu hiếm: Có".
- **Loading:** the boot loads no Pokémon sprite; `game/src/monsprites.ts` fetches front / back / icon on first use
  (the World warms both teams during the encounter flash, `Battle.preload` / `Evolve.preload` wait for the rest;
  screens show an empty sprite that takes the texture when it arrives).
- **UI:** Mondex lists every dex number up to the highest species (← / → a page of 25, wheel), 4-digit numbers from
  #1000; summary / PokéNav use the same numbering.

## 30. Shiny sprites: recolour of the 2D sheets, shiny texture of the 3D models (user, 2026-11-20)

User: "ok shiny" (real shiny sprites, the same drawings in the shiny colours, no agy redraw); pilot on the Charmander
line approved ("ok đó, làm tiếp"), every species reviewed on the batch images.

- **2D species** (`tools/pokemon/shiny_recolor.py`, Pillow only): the reference site's normal and shiny renders of the
  species (same pose, pixel for pixel; fetched into `$MONS_SHINY_REFS`, never into `assets/`) give (normal → shiny)
  colour pairs; the sheet's colours are quantised to 48 representatives, grouped into families, and each takes the
  most common change of the reference colours near it (shiny hue, chroma ratio, lightness shift in CIE LCh), so shading
  ramps survive; then a chroma boost (≥ ×1.1, matched to the reference) and a lightness match (± 8 L*) on the changed
  colours. Writes `<slug>-movement-shiny.png` (+ `<slug>-battle-shiny.png`) beside the originals (same size, magenta
  key untouched) and `<slug>-shiny.json`: `palette` (computed map), `review` numbers and the hand overrides kept on
  every re-run: `map` (`#rrggbb` → `#rrggbb` per representative), `auto`, `saturation`, `lightness`, `keep` (pixels
  that keep their normal colour: `grow` colours within `radius` px of a `seed` colour; preset `flame` = a flame whose
  colours the body shares, e.g. Charizard's tail). The normal sheets are not Gen 3-clean (≈ 100k colours), so the
  shiny ones are not either; the game export cuts them like the normal ones.
- **3D species** (`tools/model3d/battle_sprites.py --shiny`): the same views, pose and anchors rendered with the
  model's shiny texture (the resolver's `shiny` variation; all 666 rendered species have one) → `<slug>-front-shiny.png`,
  `-back-shiny.png`, `-icon-shiny.png`, recorded under `shiny` in `-render.json` (a normal re-render keeps it);
  `check_gen3.py --grid 1 --max-palettes 1` clean. A model without a shiny texture would be recoloured by
  `shiny_recolor.py --fallback-3d`.
- **Review:** `shiny_recolor.py --all --report tmp/report/shiny` (+ `--report-3d --batch-start N`) writes
  `batch-NNN.png` (12 species: normal | shiny | reference shiny) and `review.txt` (OK / CHECK + reason / OK
  hand-tuned). Hand-tuned on 2026-11-20: Charmeleon, Charizard (`keep: flame`), Sandslash (red quills `map`), Arbok
  (`lightness` / `saturation`). Alakazam (brown normal sheet) and Gastly (gas) are redraw candidates.
- **Game:** `build_assets.py` exports `<key>-front-shiny.png` / `-back-shiny.png` / `-icon-shiny.png` (2D: cut from the
  shiny sheet with the normal boxes; drawn icons recoloured by `species_assets.icon_shiny`; 3D: copied) and
  `shiny: true` in `mons.json`; `monsprites.ts monPart(slug, part, shiny)` picks them (lazy-loaded like the normal
  ones) in battles (both sides, switches), party, summary, move-learn, PC box and the evolution scene. The Mondex
  shows the species, not a caught Pokémon, and stays normal. Sparkle and sounds unchanged (§29).

## 31. Gen 3 fishing: Old / Good / Super Rod (decided 2026-11-20)

User (2026-11-20): "Chuẩn Gen 3: 3 bậc cần câu (Old / Good / Super Rod), đứng sát nước thả cần, chờ hiệu ứng cắn câu rồi bấm A đúng nhịp để kéo Pokémon, bảng loài theo map/giờ VN/thời tiết."

- **Three permanent Key Item rods** (`game/src/items.ts`, `VẬT PHẨM` pocket, `price: 0`): **Cần Câu Cũ** (`old-rod`), **Cần Câu Tốt** (`good-rod`), **Cần Câu Siêu Cấp** (`super-rod`). Procedural 24×24 Gen 3 pixel icons in `tools/ui/items.py` + `tools/ui/uikit.py` → `assets/ui/Items/{old-rod,good-rod,super-rod}.png` (`check_gen3.py` 0 failed).
- **Acquisition:** three Fisherman NPCs (`fisherman` sprite) placed cleanly at runtime on free shore tiles beside water (`World.placeFishermen`): Stage 0 `start-town` (`fisherman-old` → Old Rod), Stage 3 `port-city` (`fisherman-good` → Good Rod), Stage 6 `fen-city` (`fisherman-super` → Super Rod). Gifted once via `GAME.flags` (`gift:fisherman-*`); repeat dialogue shares tier tips with no duplicates; `GAME.rod` stores the active quick-cast rod (auto-upgraded on receiving a higher tier, switchable any time from `TÚI ĐỒ`).
- **Dual entry & rhythm (`game/src/fishing.ts`, pure TS, no Phaser / DOM / `Math.random`):** cast from `TÚI ĐỒ → VẬT PHẨM` or by pressing A facing any fishable water tile (`~` or water behaviour, on land or while surfing; `"Không thể dùng ở đây!"` elsewhere). Base bite chance `50%`, boosted to `88%` when `party[0]` has **Suction Cups** or **Sticky Hold** (even fainted). Waiting dots (`2–5` pulses × `450 ms`) → `"Ồ! Cá cắn câu rồi!"` + `"!"` emote (`1350 ms` reaction window, `150 ms` held-input guard). Tugs: Old Rod `1`, Good Rod `1–2`, Super Rod `1–3` (`"Một cú giật mạnh!"` between tugs). Early pull `"Không! Kéo sớm quá rồi!"`, timeout `"Nó thoát mất rồi!"`, no bite `"Chẳng có gì cắn câu cả..."`, cancel B/Esc `"Bạn đã thu cần về."`.
- **Visuals & audio:** `game/src/fishfx.ts` renders an integer-pixel directional rod, curved line, bobber, water ripples, splash droplets, `"!"` cue and bottom Vietnamese status box across all 4 directions and all 20 Player avatars (PC `320×180` & phone `390×180`). Uses pre-licensed `Battle/fishing/*.ogg` cues (`fish-cast`, `fish-bobber`, `fish-bite`, `fish-splash`, `fish-reel` in `data/audio/game-sounds.json`).
- **Encounter pools & District sub-bands:** `tools/data/build_spawn_pools.py` writes biome-specific `old-rod`, `good-rod` and `super-rod` pools for every water map in `data/world/pokemon-spawns.json` (exported as `<slug>:old-rod`, `:good-rod`, `:super-rod` with all 24 `PHASE × WEATHER` variants and non-empty fallbacks). `game/tools/build_assets.py` fits rod levels to monotonic sub-bands inside each District's wild band (`Old [0.0..0.45]`, `Good [0.25..0.80]`, `Super [0.45..1.0]`, keeping `KEEP_FORM = {"magikarp"}`) and exports `<district>-water-wild-wide` Battle Scenes in `places.json` `water`. Honors `Static`, `Hustle / Vital Spirit / Pressure`, `Synchronize` / `Cute Charm`, and ignores Repel.
- **Battle, PokéNav & Online:** fished battles pass `{ fished: true, water: true }` to `Battle.ts`, selecting the District's water Battle Scene and activating **Lure Ball ×4** in `src/capture.ts`. `src/pokenav.ts` + `scenes/PokeNav.ts` display `Cần Cũ`, `Cần Tốt`, `Cần Siêu` rows with per-cast probabilities. `World.ts` marks fishing busy so online chat overlays, minimap, wandering Trainers and incoming PvP invites wait cleanly until the cast ends; `save.ts` + `server/validate.ts` persist and validate `GAME.rod`, `bag` and `flags`.
- **Check:** `node game/tools/check_fishing.ts` (purity, state machine, tug counts, 1,000-cast bite/ability Monte Carlo, all 35 water maps × 3 rods × 24 phase/weather combos, Lure Ball ×4, PokéNav) + `npm run check:server`.

## 32. The Follower: Pokémon đi theo (user, 2026-11-20)

User: "nghiên cứu chức năng người dùng dắt pokemon đầu tiên trong list đi theo", then "không cần nói chuyện chỉ cần
đi theo thôi" and "theo đề xuất all, full hết": every recommended answer of
[research/following-pokemon.md](../explanation/research/following-pokemon.md) §6, all phases.

- **Who:** the first party member with HP left (`leadFollower`, `src/follower.ts`); none when all have fainted, the
  party is empty or CÀI ĐẶT → Hiển thị → "Đi theo" is off (per device, `localStorage`, on by default; off also hides
  the other players' Followers). Nothing is saved: it is derived from the party. It only follows (no talk, no mood).
- **Trailing:** when the Player starts a step from cell A, the Follower tweens into A with the same duration; a
  two-cell move (after a ledge) is a hop, farther is a fade out and in. The Player may walk into it (they swap); it is
  not in `walkable()`, wandering Trainers avoid its cell. Standing, it faces the Player.
- **Hidden** (in its ball, a 160 ms fade; back on the next normal step at the Player's previous cell): surfing, ice
  slides, minecart rides, a door opening, a floor falling, `stepBack`. Every map start (warps, connections, battles,
  evolution) rebuilds it on the free cell behind the Player, else hidden until the first step. It follows everywhere,
  building interiors and caves included.
- **Sprites:** `public/assets/mons/<key>-walk.png` (+ `-walk-shiny.png`), 4 rows (down, left, right, up) × `walk`
  walk frames then `idle` idle frames, 32×32 at 1× (no smoothing), feet on the bottom row; `mons.json` `walk:
  {walk, idle, cycle, shiny?}`. Cut at build time by `game/tools/follower_assets.py` from the movement sheet (v3: the
  `walk` loop, else fly / run / idle, + the `idle` loop; v2: every column; legacy 8×6: Walk A / B of columns 0 / 6 / 2 /
  4), one box and one scale per species. 3D-only species: `tools/model3d/walk_sprites.py` renders the model's walk at
  30° elevation, yaws 180 / 90 / 270 / 0, 4 frames, the §5 look, one 15-colour palette, into the Fall-back folder
  (`<slug>-walk.png`, `"walk"` in `-render.json`), copied by `build_assets.py`. Without either: the party icon (2-frame
  hop, mirrored to walk right). Height: the §6 map height, kept within 14–32 px.
- **Online:** `enter` carries `mon: {species, shiny} | null`, a `mon` message changes it; the server keeps it on
  `PlayerView` only for species the built client has. Remote Followers are walked from that player's `pos` stream
  (no extra traffic), hidden while they surf, faded while away.
