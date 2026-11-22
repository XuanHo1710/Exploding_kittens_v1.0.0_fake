#!/usr/bin/env bash
# Regenerate every tracked asset that is built by code from files in this repo (no download, no jar, no AI),
# in dependency order, then show what changed. A clean `git status` afterwards proves the generators (and any
# refactor of them) reproduce the committed files exactly.
#
#   tools/regen.sh [step ...]       default steps: overworld structures chars scenes maps ui data
#                                   optional steps: icons legacy-maps (their committed files are stale, see below)
#   tools/regen.sh --list           print the steps
#   PY=python3 MAPGEN_DEBUG=1 tools/regen.sh maps    (MAPGEN_DEBUG=1 also writes the review-only -debug.png)
#   KEEP_BYTES=1 tools/regen.sh     keep PNGs whose pixels did not change (default: they are checked out again)
#
# Determinism (checked 2026-11-19 on c6c530d2, Pillow 10.2): every default step reproduces the committed files
# pixel for pixel. PNG BYTES can differ from the commit (another Pillow / zlib compresses differently: all of
# assets/structures/ here), so the end of this script compares changed PNGs by pixels (tools/hash_outputs.py
# --git-pixels) and checks the bytes-only ones out again. Known exceptions:
#   icons        assets/ui/MonIcons: 5 icons + icons.json are older than their movement sheets (3 species have no icon)
#   legacy-maps  the 8 specs not in assets/maps/world.json were built by an older mapgen.py (report / layout changed)
#   ui           assets/ui/_preview reads assets/maps/ and assets/ui/MonIcons, so run it after maps (and icons)
# Their output is regenerated on demand only: run `tools/regen.sh icons legacy-maps` and commit on purpose.
# Skipped on purpose: tools/data/{locomotion,gen_lists,learnsets,species_notes,moves_readme,import_sounds}.py
# (need PokéAPI CSVs / the 3D model jar), build_trainers.py (downloads pret/pokefirered), animations.py and
# build_anchors.py (need the pokemon3d sheets + numpy), every AI / agy sprite step.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-python3}"
DBG=""
[ "${MAPGEN_DEBUG:-0}" = "1" ] && DBG="--debug"

step_overworld()   { "$PY" tools/overworld/gen_overworld.py all; }
step_structures()  { "$PY" tools/structures/draw_civic.py all
                     "$PY" tools/structures/draw_gym.py all; }
step_chars()       { "$PY" tools/characters/import_drawn.py      # drawn Players (sources: *-drawn.jpg, players-drawn.json)
                     "$PY" tools/characters/draw_chars.py all     # after the import: the Player overview shows both
                     "$PY" tools/characters/draw_extras.py; }
step_ui()          { "$PY" tools/ui/draw_ui.py; }
step_icons()       { "$PY" tools/ui/mon_icons.py; }          # ~70 s
step_scenes()      { "$PY" tools/battle-scenes/battle_scene.py                  # GBA 240x160
                     "$PY" tools/battle-scenes/battle_scene.py --frame=wide; }   # 390x180 *-wide
step_maps()        { "$PY" tools/maps/mapgen.py world assets/maps/world.json $DBG; }
step_legacy-maps() {
  # specs that are not (yet) in assets/maps/world.json
  for spec in assets/maps/*/*.map.json; do
    slug=$(basename "$(dirname "$spec")")
    grep -q "\"$slug\"" assets/maps/world.json || "$PY" tools/maps/mapgen.py build "$spec" $DBG
  done
}
step_data()        { "$PY" tools/data/battle_status.py
                     "$PY" tools/mistakes.py .; }

ALL=(overworld structures chars scenes maps ui data)
if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0; fi
if [ "${1:-}" = "--list" ]; then printf '%s\n' "${ALL[@]}" "icons (optional)" "legacy-maps (optional)"; exit 0; fi
STEPS=("$@"); [ ${#STEPS[@]} -eq 0 ] && STEPS=("${ALL[@]}")
for s in "${STEPS[@]}"; do
  echo "== regen: $s"
  start=$SECONDS
  "step_$s"
  echo "== regen: $s done in $((SECONDS - start)) s"
done
if [ "${KEEP_BYTES:-0}" != "1" ]; then "$PY" tools/hash_outputs.py --git-pixels --restore || true; fi
echo "== git status (tracked changes after regen):"
git status --short | grep -v '^??' || echo "   (none)"
