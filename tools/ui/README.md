# tools/ui

UI kit, font, HUD, icons, PC/phone screens → `assets/ui/`. Skill: `.agents/skills/expedition-ui-generator/SKILL.md`; decisions: `docs/agents/decisions.md` §10.

| File | Does |
|---|---|
| `draw_ui.py` | Exports the whole kit (+ `_preview/` designer screens): `python3 tools/ui/draw_ui.py`. |
| `uikit.py`, `monsfont.py` | The visual language and the pixel font. |
| `items.py`, `screens.py`, `previews.py` | Item icons, full-screen menus, preview composition. |
| `mon_icons.py` | Party / box icons from each species' movement sheet (`assets/ui/MonIcons`, ~70 s). |
| `app_icons.py` | Home-Screen / web-app icons → `game/public/icons/` (180 / 192 / 512, nearest-scaled): `python3 tools/ui/app_icons.py`. |
| `import_item_icons.py` | Bag icons from the upstream item textures (MPL-2.0, `THIRD_PARTY_NOTICES.md`) → `assets/ui/Items/<id>.png` + the `"source": "reference"` entries of `items.json` + `LICENSE.md` (24×24 Gen 3, ≤ 15 colours; never replaces the hand-drawn icons): `python3 -I tools/ui/import_item_icons.py [<reference checkout>]` (or `MONS_REFERENCE_SRC`). |

Other `assets/ui/` folders written elsewhere: `Screens/` (loading / login backdrops) and `Icons/app/` (app icon art; `app_icons.py` builds the favicon and Home-Screen sizes from it), both `tools/agy/ui_pack.py normalize`; `Battle/` (battle-system effects, `tools/agy/fx_pack.py normalize`) and `Evolution/` (evolution strips, `tools/skills/evolution_fx.py strips`).
