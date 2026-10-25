#!/usr/bin/env bash
set -Eeuo pipefail

# Back up small, user-owned state without copying generated outputs.
COMFYUI_DIR="${COMFYUI_DIR:-/workspace/runpod-slim/ComfyUI}"
INPUT_DIR="${INPUT_DIR:-${COMFYUI_DIR}/input}"
USER_DATA_DIR="${USER_DATA_DIR:-${COMFYUI_DIR}/user}"

RCLONE_CONFIG="${RCLONE_CONFIG:-/tmp/rclone.conf}"
RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-gdrive}"
GDRIVE_STATE_PATH="${GDRIVE_STATE_PATH:-comfyui_state}"

ENABLE_STATE_SYNC="${ENABLE_STATE_SYNC:-true}"
SYNC_INPUTS="${SYNC_INPUTS:-true}"
STATE_SYNC_INTERVAL_SECONDS="${STATE_SYNC_INTERVAL_SECONDS:-30}"
SYNC_ONCE="${SYNC_ONCE:-false}"

is_enabled() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

validate_remote_subpath() {
  local label="$1"
  local value="$2"
  [[ -n "$value" && "$value" != "/" && "$value" != "." ]] || {
    echo "[runpod] $label must name a non-root Google Drive folder" >&2
    exit 1
  }
  [[ "$value" != *":"* && "$value" != /* && "$value" != *".."* ]] || {
    echo "[runpod] $label contains an unsafe remote path: $value" >&2
    exit 1
  }
}

if ! is_enabled "$ENABLE_STATE_SYNC"; then
  echo "[runpod] state backup disabled"
  exit 0
fi

[[ -f "$RCLONE_CONFIG" ]] || {
  echo "[runpod] rclone config is missing: $RCLONE_CONFIG" >&2
  exit 1
}
command -v rclone >/dev/null 2>&1 || {
  echo "[runpod] rclone is required for state backup" >&2
  exit 1
}
[[ "$STATE_SYNC_INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]] || {
  echo "[runpod] STATE_SYNC_INTERVAL_SECONDS must be a positive integer" >&2
  exit 1
}

validate_remote_subpath GDRIVE_STATE_PATH "$GDRIVE_STATE_PATH"

USER_REMOTE="${RCLONE_REMOTE_NAME}:${GDRIVE_STATE_PATH}/user"
INPUT_REMOTE="${RCLONE_REMOTE_NAME}:${GDRIVE_STATE_PATH}/input"

copy_directory() {
  local source="$1"
  local destination="$2"
  local label="$3"
  mkdir -p "$source"
  echo "[runpod] backing up $label $source -> $destination"
  # Deliberately use copy rather than sync: a transient empty/incomplete local
  # directory must never delete the durable Google Drive backup.
  rclone copy --update --create-empty-src-dirs "$source/" "$destination"
}

backup_once() {
  # Includes workflows, ComfyUI/mobile preferences, file state and push state.
  copy_directory "$USER_DATA_DIR" "$USER_REMOTE" "user data"

  if is_enabled "$SYNC_INPUTS"; then
    copy_directory "$INPUT_DIR" "$INPUT_REMOTE" "inputs"
  fi
}

backup_once
if is_enabled "$SYNC_ONCE"; then
  exit 0
fi

while true; do
  sleep "$STATE_SYNC_INTERVAL_SECONDS"
  backup_once
done
