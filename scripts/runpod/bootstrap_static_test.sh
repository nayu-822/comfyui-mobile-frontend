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
assert_contains "$BOOTSTRAP" 'mountpoint -q "$WORKSPACE_DIR"'
assert_contains "$BOOTSTRAP" 'LOCAL_EPHEMERAL_ROOT'
assert_contains "$BOOTSTRAP" 'LOCAL_OUTPUT_DIR'
assert_contains "$BOOTSTRAP" 'LOCAL_TEMP_DIR'
assert_contains "$BOOTSTRAP" 'migrate_storage_directory'
assert_contains "$BOOTSTRAP" 'sync_legacy_output'
assert_contains "$BOOTSTRAP" 'cp -a "$BAKED_COMFYUI_DIR"/. "$COMFYUI_DIR"/'
assert_contains "$BOOTSTRAP" 'GDRIVE_OUTPUT_PATH="${GDRIVE_OUTPUT_PATH:-sdxl_output}"'
assert_contains "$BOOTSTRAP" 'RCLONE_CONFIG_B64'
assert_contains "$BOOTSTRAP" 'python3.12'
assert_contains "$BOOTSTRAP" 'python3)'
assert_contains "$BOOTSTRAP" 'CANONICAL_WORKFLOW_SRC="${CANONICAL_WORKFLOW_SRC:-${MOBILE_FRONTEND_SRC}/src/workflows/mobile_sdxl_default.json}"'
assert_contains "$BOOTSTRAP" 'COMFYUI_WORKFLOW_DIR="${COMFYUI_WORKFLOW_DIR:-${COMFYUI_DIR}/user/default/workflows}"'
assert_contains "$BOOTSTRAP" 'COMFYUI_CANONICAL_WORKFLOW="${COMFYUI_CANONICAL_WORKFLOW:-${COMFYUI_WORKFLOW_DIR}/mobile_sdxl_default.json}"'
assert_contains "$BOOTSTRAP" 'register_canonical_workflow()'
assert_contains "$BOOTSTRAP" 'cp -- "$CANONICAL_WORKFLOW_SRC" "$temp_path"'
assert_contains "$BOOTSTRAP" 'mv -f -- "$temp_path" "$COMFYUI_CANONICAL_WORKFLOW"'
assert_contains "$BOOTSTRAP" '[[ -f "$COMFYUI_CANONICAL_WORKFLOW" && ! -L "$COMFYUI_CANONICAL_WORKFLOW" ]]'
assert_contains "$BOOTSTRAP" 'registered canonical workflow:'
assert_not_contains "$BOOTSTRAP" 'ln -s "$CANONICAL_WORKFLOW_SRC"'
assert_not_contains "$BOOTSTRAP" 'ln -s "$COMFYUI_CANONICAL_WORKFLOW"'
assert_not_contains "$BOOTSTRAP" 'copy_gdrive_extensions "$GDRIVE_MODEL_PATH"'
assert_not_contains "$BOOTSTRAP" '/network-models'
assert_not_contains "$BOOTSTRAP" 'rm -rf "$COMFYUI_DIR"'
assert_not_contains "$BOOTSTRAP" 'rm -rf "$RUNPOD_SLIM_DIR"'

assert_contains "$SYNC" 'rclone "${args[@]}"'
assert_contains "$SYNC" 'LOCAL_OUTPUT_DIR must stay under LOCAL_EPHEMERAL_ROOT'
assert_not_contains "$SYNC" 'rclone sync'
assert_not_contains "$SYNC" 'copy "${RCLONE_REMOTE_NAME}:$GDRIVE_OUTPUT_PATH"'

echo "RunPod bootstrap static checks passed."
