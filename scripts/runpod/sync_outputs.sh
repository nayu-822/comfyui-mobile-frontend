#!/usr/bin/env bash
set -Eeuo pipefail

# Copy ComfyUI's output tree as-is. The frontend chooses the date_normal or
# date_upscale prefix; this worker deliberately does not inspect filenames.
COMFYUI_DIR="${COMFYUI_DIR:-/workspace/ComfyUI}"
OUTPUT_DIR="${COMFYUI_OUTPUT_DIR:-${COMFYUI_DIR}/output}"
RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-gdrive}"
OUTPUT_SYNC_INTERVAL_SECONDS="${OUTPUT_SYNC_INTERVAL_SECONDS:-60}"
OUTPUT_MIN_AGE="${OUTPUT_MIN_AGE:-30}"
ENABLE_OUTPUT_SYNC="${ENABLE_OUTPUT_SYNC:-true}"
SYNC_ONCE="${SYNC_ONCE:-false}"

is_enabled() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

if ! is_enabled "$ENABLE_OUTPUT_SYNC"; then
  echo "[runpod] output sync disabled"
  exit 0
fi

if [[ -z "${GDRIVE_OUTPUT_PATH:-}" ]]; then
  echo "[runpod] GDRIVE_OUTPUT_PATH is empty; output sync is not configured"
  exit 0
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "[runpod] rclone is required for output sync" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
REMOTE_PATH="${RCLONE_REMOTE_NAME}:${GDRIVE_OUTPUT_PATH}"

sync_once() {
  local -a args=(copy "$OUTPUT_DIR/" "$REMOTE_PATH" --create-empty-src-dirs)
  if [[ -n "$OUTPUT_MIN_AGE" && "$OUTPUT_MIN_AGE" != "0" ]]; then
    if [[ "$OUTPUT_MIN_AGE" =~ ^[0-9]+$ ]]; then
      args+=(--min-age "${OUTPUT_MIN_AGE}s")
    else
      args+=(--min-age "$OUTPUT_MIN_AGE")
    fi
  fi
  echo "[runpod] syncing ${OUTPUT_DIR} -> ${REMOTE_PATH}"
  rclone "${args[@]}"
}

sync_once
if [[ "${SYNC_ONCE,,}" == "true" || "$SYNC_ONCE" == "1" ]]; then
  exit 0
fi

while true; do
  sleep "$OUTPUT_SYNC_INTERVAL_SECONDS"
  sync_once
done
