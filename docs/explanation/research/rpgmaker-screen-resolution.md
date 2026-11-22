# Screen resolution in RPG Maker and comparable pixel RPGs: native size, tile size, PC and phone display

Purpose: show how RPG Maker (every version from 2000 to Unite) and a few well-known pixel RPGs choose their native resolution and tile size, and how they put that image on a PC monitor and on a phone. This lets us check Mons's choice ([decisions.md §10](../../agents/decisions.md): PC 320×180 ×6 = 1920×1080, phone 390×180 ×6 = 2340×1080). This note does not change that decision.

Reliability labels (same scheme as [gen3-visual-style.md](./gen3-visual-style.md)):
- **[SRC]**: read directly from engine source code: the official MV corescript, MZ core scripts as shipped in game repos, or the VX Ace default scripts.
- **[DOC]**: official documentation or a first-party page (Gotcha Gotcha Games / Kadokawa help, Apple, Google, Samsung, Godot).
- **[REIMPL]**: open-source reimplementation of an engine (EasyRPG Player for 2000/2003, mkxp for XP/VX/Ace). This is strong evidence, but it is not the original binary.
- **[2ND]**: secondary source (Wikipedia, fan wiki, forum, store or press article).
- **[CALC]**: arithmetic on the numbers above.
- **unverified**: no reliable source found in this session.

Accessed 2026-11-19. PCGamingWiki, Gematsu and GBATEK returned 403 to automated fetches, so they were not used.

---

## 0. Summary table

| Engine / game | Native screen | Tile | Ratio | PC display | Mobile display |
|---|---|---|---|---|---|
| RPG Maker 2000 / 2003 | 320×240 | 16×16 (20×15 tiles on screen) | 4:3 | Window, or fullscreen in a 640×480 mode (unverified) | none officially |
| RPG Maker XP (RGSS1) | 640×480, fixed | 32×32 (20×15) | 4:3 | Alt+Enter fullscreen; 4:3 on 16:9 is pillarboxed or stretched by the display (unverified for the original) | none |
| RPG Maker VX (RGSS2) | 544×416 | 32×32 (17×13) | 17:13 ≈ 1.31 | `Graphics.resize_screen` up to 640×480 | none |
| RPG Maker VX Ace (RGSS3) | 544×416 | 32×32 (17×13) | 17:13 | as VX | none |
| RPG Maker MV | 816×624 | 48×48 (17×13) | 17:13 | NW.js: stretch on, `min(w,h)` fractional scale, centred, black bars; browser: 1× until F3 | Android (Crosswalk) / iOS (Cordova) app, forced landscape, same fractional fit with black bars |
| RPG Maker MZ | 816×624 default, set in System 2 | 48 default; 16/24/32/48 since v1.5.0 | 17:13 default | as MV | Web export only (iOS 12+, Android 8+); same fit, phone browser height ×0.9 |
| RPG Maker Unite (Unity) | 1920×1080 "standard" | unverified | 16:9 | Unity | unverified |
| OneShot (XP) | 640×480 [CALC from engine] | 32 | 4:3 | custom mkxp fork | none (consoles only) |
| To the Moon (XP) | 640×480 [CALC from engine] | 32 | 4:3 | RGSS player | 2017 mobile *remake* in Unity, HD art |
| Omori (MV) | 640×480 [2ND] | 32 art drawn at 2× (unverified) | 4:3 | black bars at 1080p [2ND] | none (Switch / Xbox / PS4 ports) |
| LISA: The Painful (VX Ace) | unverified | 32 | unverified | | Android only for the Unity Definitive Edition (2025) |
| Ib (2000; MV remake 2022) | 320×240 original [CALC] | 16 | 4:3 | | none |
| Undertale (GameMaker) | 640×480 window, art at 2× (sources disagree) [2ND] | 20 px room grid (unverified) | 4:3 | F4 fullscreen, borderless, black bars; console versions add a decorative border | none |
| Stardew Valley (MonoGame) | no fixed resolution; 16×16 tiles drawn ×4 | 16 | any | viewport extends to the window, zoom 75–200 %, UI 75–150 % | same extend approach (iOS 2018, Android 2019) |
| Pokémon GBA (reference) | 240×160 | 8 px hardware tile, 16 px metatile (15×10) | 3:2 | n/a | n/a |
| **Mons (decided)** | **PC 320×180, phone 390×180** | **16** (20×11.25 / 24.4×11.25) | **16:9 / 19.5:9** | **integer ×6 = 1920×1080** | **landscape, integer ×6 = 2340×1080** |

---

## 1. RPG Maker engines

### 1.1 RPG Maker 2000 / 2003 (RPG_RT)
- 320×240 screen, 16×16 tiles. [REIMPL] EasyRPG Player [`src/options.h`](https://raw.githubusercontent.com/EasyRPG/Player/master/src/options.h): `#define SCREEN_TARGET_WIDTH 320`, `SCREEN_TARGET_HEIGHT 240`, `TILE_SIZE 16`.
- That is 20×15 tiles, 4:3. [CALC]
- EasyRPG reads optional `WinW`/`WinH` from `RPG_RT.ini` (Maniacs-patch style widescreen), so the 320×240 default can be overridden in modern players. [REIMPL] [`src/player.cpp`](https://raw.githubusercontent.com/EasyRPG/Player/master/src/player.cpp)
- Fullscreen in the original RPG_RT (a 640×480 display mode, then scaled by the monitor) is unverified.

### 1.2 RPG Maker XP (RGSS1)
- 640×480, 32×32 tiles, 40 fps by default. [REIMPL] mkxp [`src/graphics.cpp`](https://raw.githubusercontent.com/Ancurio/mkxp/master/src/graphics.cpp): `DEF_SCREEN_W (rgssVer == 1 ? 640 : 544)`, `DEF_SCREEN_H (rgssVer == 1 ? 480 : 416)`, `DEF_FRAMERATE (rgssVer == 1 ? 40 : 60)`. 32 px tiles: mkxp [`src/tilemap.cpp`](https://raw.githubusercontent.com/Ancurio/mkxp/master/src/tilemap.cpp) `tilesetW = 8 * 32`.
- 20×15 tiles, 4:3. [CALC] XP has no `resize_screen`; the screen size is fixed. (In mkxp it is available from RGSS2, see below.) [2ND] [mkxp-z RGSS extensions](https://roza-gb.gitbook.io/mkxp-z/extensions/rgss)
- Wikipedia: "games made in it run at 640x480". [2ND] [Wikipedia: RPG Maker](https://en.wikipedia.org/wiki/RPG_Maker)

### 1.3 RPG Maker VX (RGSS2) and VX Ace (RGSS3)
- Default 544×416, 32×32 tiles, 60 fps. [REIMPL] mkxp `graphics.cpp` (above). This is 17×13 tiles, ratio 17:13 ≈ 1.308. [CALC]
- The VX Ace default script counts on-screen tiles as `Graphics.width / 32`. [SRC] `Game_Map#screen_tile_x` in a shipped VX Ace game's scripts: [Game_Map.rb](https://raw.githubusercontent.com/ArctynFox/WindandMemoryFanTranslation/master/Scripts/Game_Map.rb)
- `Graphics.resize_screen(w, h)` is clamped to at most 640×480. [REIMPL] mkxp `Graphics::resizeScreen`: `width = clamp(width, 1, 640); height = clamp(height, 1, 480);`. Forum guides use `resize_screen(640, 480)` (20×15 tiles) or `(640, 360)` for 16:9. [2ND] [rpgmaker.net thread](https://rpgmaker.net/forums/topics/21234)
- Official confirmation of 544×416: the MV help says "Game resolution has been increased from 544x416 to 816x624" (VX Ace → MV). [DOC] [MV Help: Maps](https://rpgmakerofficial.com/product/MV_Help/page/01_01_01_02.html)
- Modern RGSS players (mkxp) have `fixedAspectRatio=true` (keep aspect, do not stretch to fill) and `smoothScaling=true` (linear filter) as defaults. They are options, not integer scaling. [REIMPL] [mkxp.conf.sample](https://raw.githubusercontent.com/Ancurio/mkxp/master/mkxp.conf.sample)

### 1.4 RPG Maker MV (2015, HTML5 / PIXI)
Defaults [SRC], official corescript [`SceneManager.js`](https://raw.githubusercontent.com/rpgtkoolmv/corescript/master/js/rpg_managers/SceneManager.js):
```js
SceneManager._screenWidth  = 816;
SceneManager._screenHeight = 624;
SceneManager._boxWidth     = 816;
SceneManager._boxHeight    = 624;
```
- Tile size 48×48: [SRC] [`Tilemap.js`](https://raw.githubusercontent.com/rpgtkoolmv/corescript/master/js/rpg_core/Tilemap.js) `this._tileWidth = 48`; [DOC] [MV Help: Asset Standards](https://rpgmakerofficial.com/product/MV_Help/page/01_11_01.html) (characters "normally 48x48"). So the screen is 17×13 tiles at 17:13. That is VX Ace ×1.5 in both directions. [CALC]
- Changing the resolution needs a plugin or a core edit. MV has no editor field for it (unverified; widely reported [2ND]).

**Scaling.** [SRC] [`Graphics.js`](https://raw.githubusercontent.com/rpgtkoolmv/corescript/master/js/rpg_core/Graphics.js):
```js
Graphics._updateRealScale = function() {
    if (this._stretchEnabled) {
        var h = window.innerWidth / this._width;
        var v = window.innerHeight / this._height;
        if (h >= 1 && h - 0.01 <= 1) h = 1;
        if (v >= 1 && v - 0.01 <= 1) v = 1;
        this._realScale = Math.min(h, v);
    } else {
        this._realScale = this._scale;
    }
};
Graphics._defaultStretchMode = function() {
    return Utils.isNwjs() || Utils.isMobileDevice();
};
```
- The fit keeps the aspect ratio and uses the largest fractional scale (`min(h, v)`). It is **not integer**; only a scale within 1 % of 1.0 snaps to exactly 1.
- Stretch is on by default in the desktop NW.js build and on mobile. In a desktop browser the game shows at 1× until the player presses F3 (`_switchStretchMode`). F4 toggles fullscreen. [SRC] `Graphics._onKeyDown`.
- `_centerElement` centres the canvas with `position:absolute; margin:auto` and sets the CSS width and height to `816 × realScale`. The page is `<body style="background-color: black">`, so the leftover area shows as **black letterbox or pillarbox bars**. [SRC] `Graphics.js`; [template/index.html](https://raw.githubusercontent.com/rpgtkoolmv/corescript/master/template/index.html)
- **Pixel-perfect behaviour:** the canvas renders at 816×624 and the browser upscales it with CSS. No `image-rendering: pixelated` appears anywhere in the core, so the browser's default (smooth) filter applies at fractional scales. [SRC] (grep of `Graphics.js`; absence checked) Texture sampling inside the canvas is NEAREST unless `bitmap.smooth = true`. [SRC] [`Bitmap.js`](https://raw.githubusercontent.com/rpgtkoolmv/corescript/master/js/rpg_core/Bitmap.js) Third-party "pixel perfect" plugins exist for this reason. [2ND] [Pixel Perfect for RPG Maker](https://galenmereth.itch.io/pixel-perfect-for-rpg-maker/devlog/305452/version-111-fix-for-spriteevent-scaling)
- Example on a 1920×1080 monitor: scale = min(2.353, 1.731) = 1.731, so 1412×1080 with 254 px black bars each side, and the pixels are non-integer. [CALC]

### 1.5 RPG Maker MZ (2020)
- Defaults: `screenWidth 816, screenHeight 624, uiAreaWidth 816, uiAreaHeight 624` in `data/System.json` → `advanced`. [SRC] [System.json of an MZ project](https://raw.githubusercontent.com/KageDesu/Alpha-NET-Z/master/data/System.json). The editor exposes "Screen Width/Screen Height" and "UI Area Width/UI Area Height" under Database → System 2 → Advanced Settings. [DOC] [MZ Help: System 2](https://rpgmakerofficial.com/product/MZ_help-en/01_08_12_02.html)
- Boot code [SRC] (`rmmz_scenes.js` v1.9.0, [copy](https://raw.githubusercontent.com/genizy/web-port/main/human-expenditure-program/js/rmmz_scenes.js)):
  ```js
  Graphics.resize(screenWidth, screenHeight);
  Graphics.defaultScale = this.screenScale();      // advanced.screenScale, default 1
  Graphics.boxWidth  = uiAreaWidth  - 4 * 2;       // 808 by default
  Graphics.boxHeight = uiAreaHeight - 4 * 2;       // 616
  ```
  So MZ separates the **game screen** from a centred **UI area**. A wide screen can keep 816×624 windows in the middle. This is MZ's own "safe area" idea.
- Tile size: 48 by default. Since v1.5.0, "change tileset size starting from "16", "24", "32", and "48"". [DOC] [RPG Maker MZ 1.5.0 Update](https://www.rpgmakerweb.com/blog/rpg-maker-mz-1-5-0-update); [SRC] `Game_Map.prototype.tileWidth` returns `$dataSystem.tileSize` when present, else 48 (`rmmz_objects.js` v1.9.0, [copy](https://raw.githubusercontent.com/genizy/web-port/main/human-expenditure-program/js/rmmz_objects.js)).
- Scaling is the same algorithm as MV, with mobile tweaks [SRC] (`rmmz_core.js` v1.9.0, [copy](https://raw.githubusercontent.com/genizy/web-port/main/human-expenditure-program/js/rmmz_core.js)):
  ```js
  Graphics._updateRealScale = function() {
      if (this._stretchEnabled && this._width > 0 && this._height > 0) {
          const h = this._stretchWidth() / this._width;
          const v = this._stretchHeight() / this._height;
          this._realScale = Math.min(h, v);
          window.scrollTo(0, 0);
      } else {
          this._realScale = this._defaultScale;
      }
  };
  // _stretchHeight on mobile: clientHeight * (Utils.isLocal() ? 1.0 : 0.9)
  //   "[Note] Mobile browsers often have special operations at the top and bottom of the screen."
  ```
  It is still a fractional `min` fit, centred by `_centerElement`, on a black body. [SRC] Unlike MV, MZ's `Bitmap.prototype.initialize` sets `this._smooth = true` (LINEAR filtering by default); only the tilemap's internal textures are forced to `PIXI.SCALE_MODES.NEAREST`. [SRC] `rmmz_core.js` v1.9.0. So scaled pictures and sprites are bilinear-filtered unless a plugin turns `smooth` off.
- Maximum resolution set in the editor: unverified.
- Official export targets are Windows, macOS and web browsers. Phones are supported through the web build only: "iOS 12 or higher, Android 8 or higher … Chrome for Android, iOS Safari". [DOC] [MZ Help: Output Formats](https://rpgmakerofficial.com/product/MZ_help-en/01_11_03.html)
- Touch UI: `ConfigManager.touchUI = true` by default. Scenes reserve a `buttonAreaHeight()` of 52 px for on-screen menu, back and page buttons. [SRC] `rmmz_managers.js`, `rmmz_scenes.js`

### 1.6 RPG Maker Unite (2024, Unity)
- "Full HD (1920x1080) is the standard resolution", so the asset specs differ from earlier versions. [2ND] [4Gamer, 2022-05-25](https://www.4gamer.net/games/617/G061790/20220525133/); [Automaton](https://automaton-media.com/en/?p=10848)
- Tile size and mobile output: unverified.

---

## 2. MV / MZ on phones

- **MV official app guides** [DOC]:
  - [Converting to an Android App](https://rpgmakerofficial.com/product/MV_Help/page/01_11_05.html) wraps the game in Crosswalk with a manifest of `"display": "fullscreen", "orientation": "landscape"`.
  - [Converting to an iOS App](https://rpgmakerofficial.com/product/MV_Help/page/01_11_06.html) uses Apache Cordova and adds `<preference name="orientation" value="landscape" />`, because "RPG Maker is optimized for holding the device sideways".
  - MV also exports for Windows, Mac, Linux, Android/iOS and the web. [DOC] [MV Help: Output Formats](https://rpgmakerofficial.com/product/MV_Help/page/01_11_04.html)
- **How the 816×624 canvas lands on a phone:** stretch is on (`Utils.isMobileDevice()` matches `Android|iPhone|iPad|…`). The canvas is fitted by height in landscape. [SRC]
  - On a 2340×1080 (19.5:9) screen: scale = 1080/624 = 1.731, image 1412×1080, black pillarbox of 464 px each side. The game uses about 60 % of the screen width. [CALC]
  - On 20:9 (2424×1080) the bars are 506 px each side. [CALC]
  - On MZ in a phone browser (not local), the height is multiplied by 0.9, so the image is smaller still. [SRC]
- No built-in safe-area handling: the core never reads `env(safe-area-inset-*)` or the cutout APIs (absence checked in `rmmz_core.js`). The pillarbox happens to keep the image clear of cutouts on the short edges. [SRC] [CALC]
- **Community practice** [2ND]:
  - Set the screen to a 16:9 size (1280×720 or similar) to avoid bars on monitors. ["Maintaining a ratio close to 16:9 is preferred…"](https://opheliaenigma.itch.io/fullscreen-resolution-override-plugin-for-rpg-maker-mv)
  - Or use plugins that resize the game to the device ratio: [AdaptToScreenSize](https://kydsgame.itch.io/adapttoscreensize), [Scale Root](https://tendev2d.itch.io/scale-root), [Adaptive Web Screen MZ](https://bobbostudio.itch.io/adaptive-web-screen-plugin-mz).
  - Users report side bars that remain at 1280×720 and at 1920×1080. [Steam thread](https://steamcommunity.com/app/363890/discussions/1/1470840994965528595)
  - None of this is official.
- **Touch:** MZ draws its own touch buttons (`touchUI`, the 52 px button row). MV relies on tap-to-move and tap-to-select; neither engine draws an on-screen D-pad. [SRC] (MZ: `Sprite_Button` + `buttonAreaHeight`; MV `Scene_Map.js` creates no menu button, checked by grep)

---

## 3. Commercial pixel RPGs

| Game | Engine | Evidence for internal resolution | PC display | Mobile |
|---|---|---|---|---|
| **OneShot** (2016) | RPG Maker XP, custom mkxp fork [2ND] [Wikipedia](https://en.wikipedia.org/wiki/OneShot) | XP is fixed at 640×480 [REIMPL] (§1.2), so 640×480 [CALC]; the libretro mkxp-z core gives XP base 640×480 [2ND] [libretro docs](https://docs.libretro.com/library/mkxp-z/) | the game recommends windowed play [2ND] | none (Switch, PS4, Xbox One in 2022) |
| **To the Moon** (2011) | RPG Maker XP [2ND] [Wikipedia](https://en.wikipedia.org/wiki/To_the_Moon_(video_game)) | 640×480 [CALC from engine] | | 2017 Android/iOS version by X.D. Network is a Unity *remake* "with high-definition graphics" [2ND] (same Wikipedia page). The port redrew the art instead of scaling the 640×480 game |
| **Omori** (2020) | RPG Maker MV [2ND] [Wikipedia](https://en.wikipedia.org/wiki/Omori_(video_game)) | 640×480 (not MV's 816×624) [2ND] [Steam discussion](https://steamcommunity.com/app/1150690/discussions/0/2995422276385005208) | black bars at top/bottom and sides on 1080p [2ND] (same thread) | none |
| **LISA: The Painful** (2014) | RPG Maker VX Ace; Unity for the Definitive Edition [2ND] [Wikipedia](https://en.wikipedia.org/wiki/Lisa:_The_Painful) | unverified | | Android only for the Definitive Edition (2025) |
| **Ib** (2012 / 2022) | RPG Maker 2000; MV remake [2ND] [Wikipedia](https://en.wikipedia.org/wiki/Ib_(video_game)) | original 320×240 [CALC from engine]; remake unverified | | none |
| **Corpse Party** | original RPG Maker 2000 (unverified); later ports | unverified | | iOS / Android ports of later editions [2ND] [Wikipedia](https://en.wikipedia.org/wiki/Corpse_Party) |
| **Undertale** (2015) | GameMaker Studio [2ND] [Wikipedia](https://en.wikipedia.org/wiki/Undertale) | 640×480 window; whether the art is a true 320×240 ×2 is disputed [2ND] [itch.io thread](https://itch.io/post/3490841) | F4 fullscreen, borderless window; decorative borders only on console versions [2ND] [Undertale wiki: Config](https://undertale.wiki/w/Config) | none |
| **Stardew Valley** (2016) | MonoGame [2ND] [Wikipedia](https://en.wikipedia.org/wiki/Stardew_Valley) | no fixed screen; map tiles "should always be 16x16" [2ND] [Modding:Maps](https://stardewvalleywiki.com/Modding:Maps); world drawn ×4 (64 px `Game1.tileSize`, unverified this session) | **extended viewport**: a bigger window shows more map; zoom 75–200 % and UI scale 75–150 % are separate settings [2ND] [Modding: Game Fundamentals](https://stardewvalleywiki.com/Modding:Modder_Guide/Game_Fundamentals) | iOS 2018, Android 2019 [2ND] (Wikipedia); the same extend-the-view approach (unverified detail) |
| **Pokémon GBA** (RSE/FRLG) | hardware | 240×160, 8 px tiles, 16 px metatiles, 15×10 metatiles on screen [GBATEK via [gen3-visual-style.md](./gen3-visual-style.md) §1–2] | n/a | n/a |
| **Pokémon DS** (DPPt/HGSS/BW) | hardware | 2 × 256×192 screens (4:3) [GBATEK](https://problemkaputt.de/gbatek.htm) (not re-fetched this session) | n/a | n/a |

Pattern [CALC]:
- RPG Maker commercial hits keep the engine's 4:3 or 17:13 frame and accept bars on 16:9 monitors (OneShot, Omori, To the Moon on PC).
- When these games reach phones, it is usually as a remake in another engine (To the Moon → Unity, LISA DE → Unity), not the RPG Maker HTML5 build.
- Games designed for many screens (Stardew) extend the viewport instead of letterboxing.

---

## 4. Phone aspect ratios today and how pixel games handle them

### 4.1 Current panels (landscape width × height)

| Device | Pixels | Ratio | Source |
|---|---|---|---|
| iPhone 17 | 2622×1206 | ≈ 19.6:9 (2.174) | [DOC] [Apple iPhone 17 specs](https://www.apple.com/iphone-17/specs/) |
| iPhone Air | 2736×1260 | ≈ 19.5:9 (2.171) | [DOC] [Apple iPhone Air specs](https://www.apple.com/iphone-air/specs/) |
| Google Pixel 10 / 9a | 2424×1080 | "20:9 aspect ratio" | [DOC] [Pixel 10 specs](https://store.google.com/us/product/pixel_10_specs), [Pixel 9a specs](https://store.google.com/us/product/pixel_9a_specs) |
| Samsung Galaxy S25 | 2340×1080 (FHD+) | 19.5:9 | [DOC, draft page] [Samsung AE comparison](https://www.samsung.com/ae/support/mobile-devices/s25-series-comparison-with-s24-series/); [2ND] [MobileDokan](https://mobiledokan.com/mobile/samsung-galaxy-s25/specification) |
| Older / budget, tablets | 16:9, 4:3 (iPad) | | general knowledge, unverified here |

So phones today sit at about 19.5:9 to 20:9 (2.17–2.22). 16:9 is now the *narrow* case. [CALC]

### 4.2 Platform rules that affect a full-screen landscape game
- **Android cutouts:** for apps targeting SDK 35 on Android 15, `LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS` is forced for non-floating windows, so content goes edge to edge under the cutout. In landscape the cutout is on a short edge. Guidance: keep text and controls out of the cutout and read the insets (`WindowInsetsCompat.getDisplayCutout()`). The page also warns that letterboxed content has window coordinates that differ from screen coordinates. [DOC] [Android: Display cutouts](https://developer.android.com/develop/ui/views/layout/display-cutout)
- **Apple:**
  - A safe area "defines the area within a window that isn't covered on the edge by a hardware feature or another view".
  - "Even if your app is locked to a certain orientation, such as a landscape-only game, it's still important to ensure your interface resizes well".
  - For artwork on a screen with a different aspect ratio that appears "cropped, letterboxed, or pillarboxed … don't change the aspect ratio of the artwork; instead, scale it".
  - [DOC] [Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)

### 4.3 Standard approaches (summarised from the Godot manual, a neutral first-party engine doc)
[DOC] [Godot: Multiple resolutions](https://docs.godotengine.org/en/stable/tutorials/rendering/multiple_resolutions.html)
1. **Integer scaling + letterbox ("keep" + integer scale mode):** the scale "is rounded down to the nearest integer", which "prevents distortion when displaying pixel art". The cost is bars.
2. **Extended viewport ("expand" / "keep_height"):** keep the height fixed and show more world to the sides on wider screens. Godot recommends `expand` for "Mobile game in landscape mode" because it "makes better use of tall smartphone displays". `keep_height` is "usually the best option for 2D games that scroll horizontally".
3. **Pixel-art baseline:** "640×360 is a good baseline, as it scales to 1280×720, 1920×1080, 2560×1440, and 3840×2160" with integer scaling and no bars. 320×180 is the same family at half size. [CALC]
4. **Safe area for UI:** draw the world edge to edge, but anchor HUD and touch controls inside the platform safe-area insets (§4.2). MZ's split between "screen" and "UI area" (§1.5) is the RPG Maker form of this idea.

---

## 5. Comparison with Mons's decision (§10)

| | RPG Maker practice | Mons |
|---|---|---|
| Native size | 320×240 (2k/2k3), 640×480 (XP), 544×416 (VX/Ace), 816×624 (MV/MZ), 1920×1080 (Unite) | 320×180 PC, 390×180 phone |
| Ratio | 4:3 or 17:13, fixed; never 16:9 by default before Unite | 16:9 PC, 19.5:9 phone |
| Tile | 16 → 32 → 48 (MZ 16–48 selectable) | 16 (GBA metatile) |
| Tiles on screen | 20×15, 17×13 | 20×11.25 (PC), 24.4×11.25 (phone) [CALC] |
| Fit to screen | fractional `min(w/W, h/H)`, centred, black bars, CSS upscale with browser smoothing (MZ bitmaps also LINEAR by default) | integer ×6, no smoothing |
| Phone | the same canvas, forced landscape, heavy pillarbox (≈ 60 % width used on 19.5:9) | its own wider frame for 19.5:9 |

What the numbers say [CALC]:
- **Integer fit is exact where it matters.**
  - PC: 320×180 is ×6 on 1920×1080, ×8 on 2560×1440, ×12 on 3840×2160 and ×4 (1280×720, small bars) on 1366×768.
  - MV/MZ's 816×624 is ×1.731 on 1080p with 254 px bars and blurred pixels.
  - Mons follows the Godot pixel-art baseline (half of 640×360). It does not follow RPG Maker's default.
- **Lineage:** 320 px wide is exactly RPG Maker 2000's width cropped from 4:3 (240 tall) to 16:9 (180 tall). With 16 px tiles the PC view is 20 tiles wide like RM2k and XP, but 11.25 tiles tall instead of 15. So a fractional row is always visible. Camera clamping and room design should allow for that, since RM2k/XP had whole-tile screens.
- **Phone:**
  - 390×180 ×6 = 2340×1080 matches Galaxy S-class 19.5:9 panels pixel for pixel.
  - On 20:9 (2424×1080) the ×6 image leaves 42 px each side.
  - On iPhone 17 (2622×1206) the integer scale is still 6 (1206/180 = 6.7), so 2340×1080 with 141 px left/right and 63 px top/bottom. That margin roughly covers the Dynamic Island on the short edge.
  - On iPhone Air (2736×1260) ×7 fits: 2730×1260.
  - This is the "integer + small letterbox" approach (§4.3 option 1) with a phone-specific frame. RPG Maker instead reuses one 17:13 canvas and pillarboxes about 40 % of a modern phone.
  - Filling the last 42–141 px would need an extended viewport (option 2), as Stardew does.
- **UI area:** Mons keeps one 180 px height on both targets and widens only the phone. For example, wide Battle Scenes are 390×180 and the PC shows x 35..354 (decisions.md §10). This is MZ's "screen vs UI area" idea turned around: MZ widens the world and keeps a centred UI box, while Mons fixes the height and widens the frame. Touch controls (D-pad left, A/B right, ☰ top right) should stay inside the platform safe-area insets (§4.2), especially on Android 15 edge-to-edge.
