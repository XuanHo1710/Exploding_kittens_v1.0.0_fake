#!/bin/sh
set -eu

echo "[minio-init] Connecting to local MinIO at ${MINIO_ENDPOINT}..."
mc alias set local "${MINIO_ENDPOINT}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}"

# 1. Create buckets (idempotent)
mc mb --ignore-existing "local/${MINIO_BUCKET_ASSETS}"
mc mb --ignore-existing "local/${MINIO_BUCKET_BACKUPS}"

# 2. Enforce strict bucket policies:
#    - eldoria-assets: public read-only (download) for versioned pixel atlases/maps/audio
#    - eldoria-backups: strictly private (server-only JSON DB snapshots)
mc anonymous set download "local/${MINIO_BUCKET_ASSETS}"
mc anonymous set none "local/${MINIO_BUCKET_BACKUPS}"

# 3. Mirror versioned v1/ pixel assets & verify manifest exists
if [ -d "/seed-assets/v1" ]; then
  echo "[minio-init] Mirroring /seed-assets/v1 -> local/${MINIO_BUCKET_ASSETS}/v1 ..."
  mc mirror --overwrite --remove /seed-assets/v1 "local/${MINIO_BUCKET_ASSETS}/v1"
  if [ -f "/seed-assets/v1/manifest.json" ]; then
    mc stat "local/${MINIO_BUCKET_ASSETS}/v1/manifest.json" >/dev/null
    echo "[minio-init] Verified v1/manifest.json in local/${MINIO_BUCKET_ASSETS}"
  else
    echo "[minio-init] ERROR: /seed-assets/v1/manifest.json missing!" >&2
    exit 1
  fi
else
  echo "[minio-init] WARNING: /seed-assets/v1 not found yet; run npm run assets:generate first."
fi

echo "[minio-init] Local MinIO bootstrap complete."
