#!/usr/bin/env bash
# Resolve a structure from references/catalog.md, create its output folder and print
# everything the prompt + normalizer need.
#
# Usage: ./new_structure.sh <slug-or-name> [size S|M|L|XL] [category]
# Example: ./new_structure.sh pokemon-center
#          ./new_structure.sh "Fire Gym" L Battle      # not in catalog -> custom
set -euo pipefail

# Repo root = 2 levels above this script (tools/structures -> tools -> root); the catalog stays with the skill
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL_DIR="${WORKSPACE_ROOT}/.agents/skills/expedition-structure-generator"
CATALOG="${SKILL_DIR}/references/catalog.md"
INPUT="${1:?Usage: $0 <slug-or-name> [size S|M|L|XL] [category]}"
SIZE_OVERRIDE="${2:-}"
CAT_OVERRIDE="${3:-}"

SLUG=$(echo "${INPUT}" | tr '[:upper:]' '[:lower:]' | sed -E "s/é/e/g; s/['’.]+//g; s/[^a-z0-9]+/-/g; s/^-|-$//g")

# Catalog row: | slug | Name | Category | Size | Brief |
ROW=$(awk -F'|' -v s="${SLUG}" '{f=$2; gsub(/^[ \t]+|[ \t]+$/, "", f)} f == s {print; exit}' "${CATALOG}" || true)

if [[ -n "${ROW}" ]]; then
  NAME=$(echo "${ROW}" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3}')
  CATEGORY=$(echo "${ROW}" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $4); print $4}')
  SIZE=$(echo "${ROW}" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $5); print $5}')
  BRIEF=$(echo "${ROW}" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $6); print $6}')
  STATUS="catalog"
else
  NAME="${INPUT}"
  CATEGORY="Custom"
  SIZE="M"
  BRIEF="(not in catalog: write a 1-3 sentence design brief: footprint, wall/roof colours, door, signature detail)"
  STATUS="custom"
fi
[[ -n "${SIZE_OVERRIDE}" ]] && SIZE="${SIZE_OVERRIDE}"
[[ -n "${CAT_OVERRIDE}" ]] && CATEGORY="${CAT_OVERRIDE}"

# Final cell px = whole 16 px metatiles drawn x2 (Gen 3 grid): S 6x6, M 8x8, L 10x10, XL 12x12
case "${SIZE}" in
  S) CELL=192 ;;
  M) CELL=256 ;;
  L) CELL=320 ;;
  XL) CELL=384 ;;
  *) echo "ERROR: size must be S, M, L or XL (got '${SIZE}')" >&2; exit 1 ;;
esac

OUT_DIR="${WORKSPACE_ROOT}/assets/structures/${CATEGORY}/${SLUG}"
mkdir -p "${OUT_DIR}/drafts"

echo "STATUS=${STATUS}"
echo "OUT_DIR=${OUT_DIR}"
echo "SLUG=${SLUG}"
echo "NAME=${NAME}"
echo "CATEGORY=${CATEGORY}"
echo "SIZE=${SIZE}"
echo "CELL=${CELL}"
echo "METATILES=$((CELL / 32))x$((CELL / 32))"
echo "SHEET=${CELL}x${CELL} (Day only; --cols 2 for Day|Night = $((CELL * 2))x${CELL})"
echo "BRIEF=${BRIEF}"
STYLE_REF="${WORKSPACE_ROOT}/assets/structures/style-reference.png"
if [[ -s "${STYLE_REF}" ]]; then
  echo "STYLE_REF=${STYLE_REF}"
else
  echo "STYLE_REF=${WORKSPACE_ROOT}/assets/pokemon/Gen1-Kanto/Arceus/arceus-posses-192.png"
fi
