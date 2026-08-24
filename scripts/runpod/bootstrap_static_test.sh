#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.sh"
SYNC="$SCRIPT_DIR/sync_outputs.sh"

assert_contains() {
  local file="$1"
  local text="$2"
  grep -Fq -- "$text" "$file" || {
    echo "missing contract in $file: $text" >&2
    exit 1
  }
}

assert_not_contains() {
  local file="$1"
  local text="$2"
  if grep -Fq -- "$text" "$file"; then
    echo "forbidden contract in $file: $text" >&2
    exit 1
  fi
}

bash -n "$BOOTSTRAP"
bash -n "$SYNC"

assert_contains "$BOOTSTRAP" 'checkpoint_manifest'
assert_contains "$BOOTSTRAP" 'rclone copyto "$remote_path" "$temp_path"'
assert_contains "$BOOTSTRAP" 'mv -f "$temp_path" "$cache_path"'
assert_contains "$BOOTSTRAP" 'NETWORK_CHECKPOINT_DIR'
assert_contains "$BOOTSTRAP" 'mountpoint -q "$NETWORK_MODEL_ROOT"'
assert_contains "$BOOTSTRAP" 'assert_not_network_volume_path "LORA_DIR"'
assert_contains "$BOOTSTRAP" 'assert_not_network_volume_path "COMFYUI_OUTPUT_DIR"'
assert_contains "$BOOTSTRAP" 'RCLONE_CONFIG_B64'
assert_contains "$BOOTSTRAP" 'python3.12'
assert_contains "$BOOTSTRAP" 'python3)'
assert_not_contains "$BOOTSTRAP" 'copy_gdrive_extensions "$GDRIVE_MODEL_PATH"'
assert_not_contains "$BOOTSTRAP" '/network-models/loras'
assert_not_contains "$BOOTSTRAP" '/network-models/upscale_models'
assert_not_contains "$BOOTSTRAP" '/network-models/output'

assert_contains "$SYNC" 'rclone "${args[@]}"'
assert_contains "$SYNC" 'COMFYUI_OUTPUT_DIR must not be under Network Volume'
assert_not_contains "$SYNC" 'rclone sync'
assert_not_contains "$SYNC" 'copy "${RCLONE_REMOTE_NAME}:$GDRIVE_OUTPUT_PATH"'

echo "RunPod bootstrap static checks passed."
