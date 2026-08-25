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
assert_contains "$BOOTSTRAP" 'ensure_comfyui_runtime_venv()'
assert_contains "$BOOTSTRAP" 'python3.12 -m venv --system-site-packages'
assert_contains "$BOOTSTRAP" 'ensure_comfyui_manager()'
assert_contains "$BOOTSTRAP" 'ENABLE_COMFYUI_MANAGER="${ENABLE_COMFYUI_MANAGER:-true}"'
assert_contains "$BOOTSTRAP" 'COMFYUI_MANAGER_PACKAGE="${COMFYUI_MANAGER_PACKAGE:-comfyui-manager}"'
assert_contains "$BOOTSTRAP" 'COMFYUI_ARGS_FILE="${COMFYUI_ARGS_FILE:-${RUNPOD_SLIM_DIR}/comfyui_args.txt}"'
assert_contains "$BOOTSTRAP" 'pip install -U --pre "$COMFYUI_MANAGER_PACKAGE"'
assert_contains "$BOOTSTRAP" 'pip show "$COMFYUI_MANAGER_PACKAGE"'
assert_contains "$BOOTSTRAP" 'manager_requirements.txt'
assert_contains "$BOOTSTRAP" 'configure_comfyui_manager_args()'
assert_contains "$BOOTSTRAP" "grep -Eq '^[[:space:]]*--enable-manager([[:space:]]|$)'"
assert_contains "$BOOTSTRAP" "printf '%s\\n' '--enable-manager'"
assert_contains "$BOOTSTRAP" 'verify_comfyui_manager_install()'
assert_contains "$BOOTSTRAP" 'install_mobile_frontend()'
assert_contains "$BOOTSTRAP" 'MOBILE_CUSTOM_NODE_DIR must stay under COMFYUI_DIR/custom_nodes'
assert_contains "$BOOTSTRAP" 'path_is_within "$destination_parent_real" "$custom_nodes_root_real"'
assert_contains "$BOOTSTRAP" 'mobile frontend __init__.py is missing:'
assert_contains "$BOOTSTRAP" 'mobile frontend dist/index.html is missing:'
assert_contains "$BOOTSTRAP" 'rsync -a --delete'
assert_contains "$BOOTSTRAP" "--exclude='.git/'"
assert_contains "$BOOTSTRAP" "--exclude='node_modules/'"
assert_contains "$BOOTSTRAP" 'rm -f -- "$MOBILE_CUSTOM_NODE_DIR"'
assert_contains "$BOOTSTRAP" '[[ -d "$MOBILE_CUSTOM_NODE_DIR" && ! -L "$MOBILE_CUSTOM_NODE_DIR" ]]'
assert_contains "$BOOTSTRAP" 'verify_mobile_frontend_install()'
assert_contains "$BOOTSTRAP" 'verify_required_custom_node_files()'
assert_contains "$BOOTSTRAP" 'ComfyUI-Impact-Pack'
assert_contains "$BOOTSTRAP" 'ComfyUI-Impact-Subpack'
assert_contains "$BOOTSTRAP" 'start_post_start_health_check()'
assert_contains "$BOOTSTRAP" '/object_info'
assert_contains "$BOOTSTRAP" '/mobile/'
assert_contains "$BOOTSTRAP" 'api/userdata?dir=workflows&recurse=true&split=false&full_info=true'
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
assert_not_contains "$BOOTSTRAP" 'ln -s "$MOBILE_FRONTEND_SRC" "$MOBILE_CUSTOM_NODE_DIR"'
assert_not_contains "$BOOTSTRAP" 'copy_gdrive_extensions "$GDRIVE_MODEL_PATH"'
assert_not_contains "$BOOTSTRAP" '/network-models'
assert_not_contains "$BOOTSTRAP" 'rm -rf "$COMFYUI_DIR"'
assert_not_contains "$BOOTSTRAP" 'rm -rf "$RUNPOD_SLIM_DIR"'

assert_contains "$SYNC" 'rclone "${args[@]}"'
assert_contains "$SYNC" 'LOCAL_OUTPUT_DIR must stay under LOCAL_EPHEMERAL_ROOT'
assert_not_contains "$SYNC" 'rclone sync'
assert_not_contains "$SYNC" 'copy "${RCLONE_REMOTE_NAME}:$GDRIVE_OUTPUT_PATH"'

behavior_tmp="$(mktemp -d)"
trap 'rm -rf -- "$behavior_tmp"' EXIT
export WORKSPACE_DIR="$behavior_tmp/workspace"
export RUNPOD_SLIM_DIR="$behavior_tmp/runpod-slim"
export COMFYUI_DIR="$RUNPOD_SLIM_DIR/ComfyUI"
export MOBILE_FRONTEND_SRC="$behavior_tmp/comfyui-mobile-frontend-src"
export MOBILE_CUSTOM_NODE_DIR="$COMFYUI_DIR/custom_nodes/comfyui-mobile-frontend"
export COMFYUI_ARGS_FILE="$behavior_tmp/comfyui_args.txt"
export ENABLE_COMFYUI_MANAGER=true

mkdir -p "$COMFYUI_DIR/custom_nodes" "$MOBILE_FRONTEND_SRC/dist"
printf '%s\n' '# test custom node' > "$MOBILE_FRONTEND_SRC/__init__.py"
printf '%s\n' '<html></html>' > "$MOBILE_FRONTEND_SRC/dist/index.html"
source "$BOOTSTRAP"

if ln -s "$MOBILE_FRONTEND_SRC" "$MOBILE_CUSTOM_NODE_DIR" 2>/dev/null; then
  :
fi
install_mobile_frontend
[[ -d "$MOBILE_CUSTOM_NODE_DIR" && ! -L "$MOBILE_CUSTOM_NODE_DIR" ]] || {
  echo "mobile frontend behavior test failed: destination is not a real directory" >&2
  exit 1
}
[[ -f "$MOBILE_CUSTOM_NODE_DIR/__init__.py" && -f "$MOBILE_CUSTOM_NODE_DIR/dist/index.html" ]] || {
  echo "mobile frontend behavior test failed: runtime files were not copied" >&2
  exit 1
}

printf '%s\n' '--listen 0.0.0.0' '# --enable-manager' > "$COMFYUI_ARGS_FILE"
configure_comfyui_manager_args
configure_comfyui_manager_args
manager_arg_count="$(grep -Ec '^[[:space:]]*--enable-manager([[:space:]]|$)' "$COMFYUI_ARGS_FILE")"
[[ "$manager_arg_count" == "1" ]] || {
  echo "manager args behavior test failed: --enable-manager was duplicated" >&2
  exit 1
}
grep -Fxq -- '--listen 0.0.0.0' "$COMFYUI_ARGS_FILE" || {
  echo "manager args behavior test failed: existing argument was removed" >&2
  exit 1
}

if (MOBILE_CUSTOM_NODE_DIR="$COMFYUI_DIR"; install_mobile_frontend >/dev/null 2>&1); then
  echo "mobile frontend safety behavior test failed: unsafe destination was accepted" >&2
  exit 1
fi

echo "RunPod bootstrap static checks passed."
