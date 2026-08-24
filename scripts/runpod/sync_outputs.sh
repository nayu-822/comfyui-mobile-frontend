#!/usr/bin/env bash
set -Eeuo pipefail

# One-way copy from the Container Disk output directory to Google Drive.
WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
COMFYUI_DIR="${COMFYUI_DIR:-/workspace/runpod-slim/ComfyUI}"
LOCAL_EPHEMERAL_ROOT="${LOCAL_EPHEMERAL_ROOT:-/runpod-local}"
LOCAL_OUTPUT_DIR="${LOCAL_OUTPUT_DIR:-${COMFYUI_OUTPUT_DIR:-${LOCAL_EPHEMERAL_ROOT}/output}}"
LOCAL_TEMP_DIR="${LOCAL_TEMP_DIR:-${LOCAL_EPHEMERAL_ROOT}/temp}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/tmp/rclone.conf}"
RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-gdrive}"
GDRIVE_OUTPUT_PATH="${GDRIVE_OUTPUT_PATH:-sdxl_output}"
OUTPUT_SYNC_INTERVAL_SECONDS="${OUTPUT_SYNC_INTERVAL_SECONDS:-60}"
OUTPUT_MIN_AGE="${OUTPUT_MIN_AGE:-15s}"
ENABLE_OUTPUT_SYNC="${ENABLE_OUTPUT_SYNC:-true}"
SYNC_ONCE="${SYNC_ONCE:-false}"

is_enabled() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

path_is_within() {
  local candidate base
  candidate="$(realpath -m -- "$1")"
  base="$(realpath -m -- "$2")"
  [[ "$candidate" == "$base" || "$candidate" == "$base"/* ]]
}

if ! is_enabled "$ENABLE_OUTPUT_SYNC"; then
  echo "[runpod] output sync disabled"
  exit 0
fi

[[ -f "$RCLONE_CONFIG" ]] || {
  echo "[runpod] rclone config is missing: $RCLONE_CONFIG" >&2
  exit 1
}
[[ -n "$GDRIVE_OUTPUT_PATH" ]] || {
  echo "[runpod] GDRIVE_OUTPUT_PATH is empty" >&2
  exit 1
}
command -v rclone >/dev/null 2>&1 || {
  echo "[runpod] rclone is required for output sync" >&2
  exit 1
}
command -v realpath >/dev/null 2>&1 || {
  echo "[runpod] realpath is required for output sync safety checks" >&2
  exit 1
}

if path_is_within "$LOCAL_EPHEMERAL_ROOT" "$WORKSPACE_DIR"; then
  echo "[runpod] LOCAL_EPHEMERAL_ROOT must not be under Network Volume $WORKSPACE_DIR" >&2
  exit 1
fi
if ! path_is_within "$LOCAL_OUTPUT_DIR" "$LOCAL_EPHEMERAL_ROOT"; then
  echo "[runpod] LOCAL_OUTPUT_DIR must stay under LOCAL_EPHEMERAL_ROOT" >&2
  exit 1
fi
if ! path_is_within "$LOCAL_TEMP_DIR" "$LOCAL_EPHEMERAL_ROOT"; then
  echo "[runpod] LOCAL_TEMP_DIR must stay under LOCAL_EPHEMERAL_ROOT" >&2
  exit 1
fi
[[ ! -L "$LOCAL_OUTPUT_DIR" ]] || {
  echo "[runpod] LOCAL_OUTPUT_DIR must be the physical sync source, not a symlink" >&2
  exit 1
}

mkdir -p "$LOCAL_EPHEMERAL_ROOT" "$LOCAL_OUTPUT_DIR" "$LOCAL_TEMP_DIR"
REMOTE_PATH="${RCLONE_REMOTE_NAME}:${GDRIVE_OUTPUT_PATH}"

sync_once() {
  local -a args=(copy --create-empty-src-dirs)
  if [[ -n "$OUTPUT_MIN_AGE" && "$OUTPUT_MIN_AGE" != "0" ]]; then
    if [[ "$OUTPUT_MIN_AGE" =~ ^[0-9]+$ ]]; then
      args+=(--min-age "${OUTPUT_MIN_AGE}s")
    else
      args+=(--min-age "$OUTPUT_MIN_AGE")
    fi
  fi
  args+=("$LOCAL_OUTPUT_DIR/" "$REMOTE_PATH")
  echo "[runpod] copying $LOCAL_OUTPUT_DIR -> $REMOTE_PATH"
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
