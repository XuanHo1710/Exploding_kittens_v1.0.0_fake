#!/usr/bin/env bash
# Definition-of-Done checks for the whole repo (CONTRIBUTING.md, Definition of Done): repo conventions (lint_repo.py),
# Gen 3 rules on every asset folder, the world build (0 seam errors), and the game typecheck. Exit code != 0 on the
# first failure. CI (.github/workflows/check.yml) runs the same steps.
#   tools/check.sh                 (npm run check)
#   SKIP_WORLD=1 tools/check.sh    (skip the ~4 min world build)
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PY:-python3}"
C=tools/gen3/check_gen3.py
echo "== lint_repo";                 "$PY" tools/lint_repo.py
echo "== check_gen3: Overworld";     "$PY" $C --quiet assets/overworld
echo "== check_gen3: Structures";    "$PY" $C --quiet assets/structures
echo "== check_gen3: Characters";    "$PY" $C --quiet --grid 8 --max-palettes 1 assets/characters
# wide scenes are 390x180: not whole 16 px tiles, so they are checked on a 2 px grid (battle-scene SKILL.md)
echo "== check_gen3: BattleScenes";  find assets/battle-scenes -name "*.png" -not -path "*/_preview/*" -not -name "*-wide*" -print0 | xargs -0 "$PY" $C --quiet
echo "== check_gen3: BattleScenes wide"; find assets/battle-scenes -name "*-wide*.png" -not -path "*/_preview/*" -print0 | xargs -0 "$PY" $C --quiet --grid 2
echo "== check_gen3: UI";            "$PY" $C --quiet --grid 1 --max-palettes 99 assets/ui
# Poké Ball sheets only: <id>-reference.png is the official web artwork they were drawn from (pokeball SKILL.md)
echo "== check_gen3: Poké Balls";    find assets/items -name "*-ball.png" -print0 | xargs -0 "$PY" $C --quiet --grid 1 --max-palettes 99
# 3D fallback battle sprites + icons (tools/model3d/battle_sprites.py): one 15-colour palette each
echo "== check_gen3: 3D battle sprites"; find assets/pokemon/Fall-back \( -name "*-front.png" -o -name "*-back.png" -o -name "*-icon.png" \) -print0 | xargs -0 -r "$PY" $C --quiet --grid 1 --max-palettes 1
# Pokémon sheets (RGB on #FF00FF, not Gen 3 palettes): no magenta background left (tools/units/check_magenta.py)
echo "== check_magenta: Pokémon";    "$PY" tools/units/check_magenta.py --quiet --no-preview --skip-busy
if [ -z "${SKIP_WORLD:-}" ]; then
  echo "== mapgen world";            "$PY" tools/maps/mapgen.py world assets/maps/world.json
  if [ -n "${CI:-}" ]; then        # CI only: the committed map outputs must be what the specs build
    "$PY" tools/hash_outputs.py --git-pixels --restore >/dev/null || true   # PNGs that differ only in bytes (zlib)
    echo "== world build matches the committed maps"; git diff --exit-code --stat -- assets/maps
  fi
fi
echo "== typecheck";                 npm run --silent -w game typecheck
echo "== all checks passed"
