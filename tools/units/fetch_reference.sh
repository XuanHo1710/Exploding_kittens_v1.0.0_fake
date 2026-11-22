#!/usr/bin/env bash
# Fast 1-second fetcher & folder resolver for Mons-Models.
# Automatically finds the Gen1-Kanto..Gen5-Unova folder and National Dex number from assets/pokemon/Gen*/*.md,
# creates assets/pokemon/<GenX-Region>/<NNN>-<PokemonName>/ (e.g. Gen1-Kanto/004-Charmander), and downloads official PokemonDB basic artwork
# to /tmp/mons-refs/<slug>-reference.jpg AND keeps a copy in the species folder as <slug>-reference.jpg
# (the artwork every drawing of the species was made from: kept so a sheet can be checked against it).
#
# Usage: ./fetch_reference.sh <PokemonName> [pokemondb-slug] [explicit-gen-folder]
# Example: ./fetch_reference.sh Arceus
#          ./fetch_reference.sh Bulbasaur
set -euo pipefail

# Repo root = 2 levels above this script (tools/units -> tools -> root)
WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEX_ROOT="${WORKSPACE_ROOT}/assets/pokemon"
INPUT_NAME="${1:?Usage: $0 <PokemonName> [pokemondb-slug] [explicit-gen-folder]}"
CUSTOM_SLUG="${2:-}"
EXPLICIT_GEN="${3:-}"

GEN_DIR="${EXPLICIT_GEN}"
CANONICAL_NAME="${INPUT_NAME}"
DEX_NO=""

# 1. Look up National Dex number, canonical name and Gen folder from the markdown tables:
#    | 001 | Bulbasaur | ... |
MATCH_LINE=$(grep -iH -E "^\|[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*${INPUT_NAME}[[:space:]]*\|" "${DEX_ROOT}"/Gen*/*.md | head -n 1 || true)
if [[ -n "${MATCH_LINE}" ]]; then
  MD_FILE="${MATCH_LINE%%:*}"
  ROW="${MATCH_LINE#*:}"
  DEX_NO=$(echo "${ROW}" | awk -F'|' '{gsub(/[[:space:]]+/, "", $2); print $2}')
  CANONICAL_NAME=$(echo "${ROW}" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3}')
  [[ -z "${GEN_DIR}" ]] && GEN_DIR=$(basename "$(dirname "${MD_FILE}")")
fi

# Sanitize folder name (keep spaces/letters clean, replace slashes)
SAFE_FOLDER_NAME=$(echo "${CANONICAL_NAME}" | sed -E 's/[\/:]+/-/g')
SLUG="${CUSTOM_SLUG:-$(echo "${CANONICAL_NAME}" | tr '[:upper:]' '[:lower:]' | sed -E "s/♀/-f/g; s/♂/-m/g; s/['’.]+//g; s/[^a-z0-9]+/-/g; s/^-|-$//g")}"

# 2. Folder name = "<NNN>-<Name>" (e.g. 004-Charmander, 493-Arceus) when the Dex number is known
if [[ -n "${DEX_NO}" ]]; then
  FOLDER_NAME="${DEX_NO}-${SAFE_FOLDER_NAME}"
else
  FOLDER_NAME="${SAFE_FOLDER_NAME}"
fi

if [[ -n "${GEN_DIR}" ]]; then
  OUT_DIR="${DEX_ROOT}/${GEN_DIR}/${FOLDER_NAME}"
else
  # Fallback for Gen 6+ or custom creatures not in Gen1-Gen5 tables
  OUT_DIR="${DEX_ROOT}/Other/${FOLDER_NAME}"
fi

# 3. Migrate a legacy un-numbered folder (e.g. Gen1-Kanto/Charmander -> Gen1-Kanto/004-Charmander)
LEGACY_DIR="$(dirname "${OUT_DIR}")/${SAFE_FOLDER_NAME}"
if [[ "${LEGACY_DIR}" != "${OUT_DIR}" && -d "${LEGACY_DIR}" && ! -e "${OUT_DIR}" ]]; then
  mv "${LEGACY_DIR}" "${OUT_DIR}"
  echo "MIGRATED=${LEGACY_DIR} -> ${OUT_DIR}"
fi

mkdir -p "${OUT_DIR}" /tmp/mons-refs
REF_PATH="/tmp/mons-refs/${SLUG}-reference.jpg"

echo "OUT_DIR=${OUT_DIR}"
echo "SLUG=${SLUG}"
echo "REF_PATH=${REF_PATH}"

KEEP_PATH="${OUT_DIR}/${SLUG}-reference.jpg"
echo "KEEP_PATH=${KEEP_PATH}"

if [[ -s "${REF_PATH}" ]]; then
  echo "STATUS=cached"
elif [[ -s "${KEEP_PATH}" ]]; then
  cp "${KEEP_PATH}" "${REF_PATH}"
  echo "STATUS=from species folder"
else
  URL="https://img.pokemondb.net/artwork/large/${SLUG}.jpg"
  if curl -fsSL "${URL}" -o "${REF_PATH}"; then
    echo "STATUS=downloaded (${URL})"
  else
    rm -f "${REF_PATH}"
    echo "ERROR: Direct download failed for ${URL}. Try passing explicit pokemondb slug (e.g. giratina-altered, shaymin-land) or use search_web; save the image you use as ${KEEP_PATH}." >&2
    exit 1
  fi
fi
# keep the reference next to the sheets (required: movement, battle and reference live together)
[[ -s "${KEEP_PATH}" ]] || cp "${REF_PATH}" "${KEEP_PATH}"
