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

assert_order() {
  local file="$1"
  local first="$2"
  local second="$3"
  local first_line second_line

  first_line="$(grep -nF -- "$first" "$file" | tail -n1 | cut -d: -f1)"
  second_line="$(grep -nF -- "$second" "$file" | tail -n1 | cut -d: -f1)"
  [[ -n "$first_line" && -n "$second_line" && "$first_line" -lt "$second_line" ]] || {
    echo "ordering contract failed in $file: $first must precede $second" >&2
    exit 1
  }
}

bash -n "$BOOTSTRAP"
bash -n "$SYNC"

assert_contains "$BOOTSTRAP" 'checkpoint_manifest'
assert_contains "$BOOTSTRAP" 'rclone copyto "$remote_path" "$temp_path"'
assert_contains "$BOOTSTRAP" 'mv -f "$temp_path" "$cache_path"'
assert_contains "$BOOTSTRAP" 'NETWORK_CHECKPOINT_DIR'
assert_contains "$BOOTSTRAP" 'GDRIVE_TEXT_ENCODER_PATH="${GDRIVE_TEXT_ENCODER_PATH:-anima_text_encoder}"'
assert_contains "$BOOTSTRAP" 'GDRIVE_VAE_PATH="${GDRIVE_VAE_PATH:-anima_vae}"'
assert_contains "$BOOTSTRAP" 'DIFFUSION_MODEL_DIR="${DIFFUSION_MODEL_DIR:-${COMFYUI_DIR}/models/diffusion_models}"'
assert_contains "$BOOTSTRAP" 'TEXT_ENCODER_DIR="${TEXT_ENCODER_DIR:-${COMFYUI_DIR}/models/text_encoders}"'
assert_contains "$BOOTSTRAP" 'VAE_DIR="${VAE_DIR:-${COMFYUI_DIR}/models/vae}"'
assert_contains "$BOOTSTRAP" 'prepare_model_link_dir "$DIFFUSION_MODEL_DIR" "diffusion model"'
assert_contains "$BOOTSTRAP" 'link_cached_model "$relative_path" "$DIFFUSION_MODEL_DIR" "diffusion model"'
assert_contains "$BOOTSTRAP" 'copy_gdrive_extensions "$GDRIVE_TEXT_ENCODER_PATH" "$TEXT_ENCODER_DIR"'
assert_contains "$BOOTSTRAP" 'copy_gdrive_extensions "$GDRIVE_VAE_PATH" "$VAE_DIR"'
assert_contains "$BOOTSTRAP" "'*.safetensors' '*.pt' '*.pth'"
assert_contains "$BOOTSTRAP" 'verify_anima_model_files()'
assert_contains "$BOOTSTRAP" 'warning: Anima model is missing from diffusion_models'
assert_contains "$BOOTSTRAP" 'warning: Anima text encoder is missing from text_encoders'
assert_contains "$BOOTSTRAP" 'warning: Anima VAE is missing from vae'
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
assert_contains "$BOOTSTRAP" 'RUNTIME_PIP_CONSTRAINT_FILE="${RUNTIME_PIP_CONSTRAINT_FILE:-/opt/comfyui-runtime-constraints.txt}"'
assert_contains "$BOOTSTRAP" '/opt/comfyui-runtime-constraints.txt'
assert_contains "$BOOTSTRAP" 'configure_runtime_pip_constraints()'
assert_contains "$BOOTSTRAP" 'export PIP_CONSTRAINT'
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
assert_contains "$BOOTSTRAP" "grep -Fq 'mobile_anima_default.json' <<<\"\$health_workflow_data\""
assert_contains "$BOOTSTRAP" 'CANONICAL_WORKFLOW_SRC="${CANONICAL_WORKFLOW_SRC:-${MOBILE_FRONTEND_SRC}/src/workflows/mobile_sdxl_default.json}"'
assert_contains "$BOOTSTRAP" 'COMFYUI_WORKFLOW_DIR="${COMFYUI_WORKFLOW_DIR:-${COMFYUI_DIR}/user/default/workflows}"'
assert_contains "$BOOTSTRAP" 'COMFYUI_CANONICAL_WORKFLOW="${COMFYUI_CANONICAL_WORKFLOW:-${COMFYUI_WORKFLOW_DIR}/mobile_sdxl_default.json}"'
assert_contains "$BOOTSTRAP" 'ANIMA_WORKFLOW_SRC="${ANIMA_WORKFLOW_SRC:-${MOBILE_FRONTEND_SRC}/src/workflows/mobile_anima_default.json}"'
assert_contains "$BOOTSTRAP" 'COMFYUI_ANIMA_WORKFLOW="${COMFYUI_ANIMA_WORKFLOW:-${COMFYUI_WORKFLOW_DIR}/mobile_anima_default.json}"'
assert_contains "$BOOTSTRAP" 'register_canonical_workflow()'
assert_contains "$BOOTSTRAP" 'register_anima_workflow()'
assert_contains "$BOOTSTRAP" 'cp -- "$CANONICAL_WORKFLOW_SRC" "$temp_path"'
assert_contains "$BOOTSTRAP" 'mv -f -- "$temp_path" "$COMFYUI_CANONICAL_WORKFLOW"'
assert_contains "$BOOTSTRAP" '[[ -f "$COMFYUI_CANONICAL_WORKFLOW" && ! -L "$COMFYUI_CANONICAL_WORKFLOW" ]]'
assert_contains "$BOOTSTRAP" 'cp -- "$ANIMA_WORKFLOW_SRC" "$temp_path"'
assert_contains "$BOOTSTRAP" 'mv -f -- "$temp_path" "$COMFYUI_ANIMA_WORKFLOW"'
assert_contains "$BOOTSTRAP" '[[ -f "$COMFYUI_ANIMA_WORKFLOW" && ! -L "$COMFYUI_ANIMA_WORKFLOW" ]]'
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

assert_order "$BOOTSTRAP" 'prepare_comfyui' 'configure_runtime_pip_constraints'
assert_order "$BOOTSTRAP" 'configure_runtime_pip_constraints' 'ensure_comfyui_runtime_venv'
assert_order "$BOOTSTRAP" 'configure_runtime_pip_constraints' 'ensure_comfyui_manager'
assert_order "$BOOTSTRAP" 'sync_gdrive_checkpoints' 'copy_gdrive_local_models'
assert_order "$BOOTSTRAP" 'copy_gdrive_local_models' 'verify_anima_model_files'

behavior_tmp="$(mktemp -d)"
trap 'rm -rf -- "$behavior_tmp"' EXIT
export WORKSPACE_DIR="$behavior_tmp/workspace"
export RUNPOD_SLIM_DIR="$behavior_tmp/runpod-slim"
export COMFYUI_DIR="$RUNPOD_SLIM_DIR/ComfyUI"
export MOBILE_FRONTEND_SRC="$behavior_tmp/comfyui-mobile-frontend-src"
export MOBILE_CUSTOM_NODE_DIR="$COMFYUI_DIR/custom_nodes/comfyui-mobile-frontend"
export COMFYUI_ARGS_FILE="$behavior_tmp/comfyui_args.txt"
export ENABLE_COMFYUI_MANAGER=true
export RUNTIME_PIP_CONSTRAINT_FILE="$behavior_tmp/runtime-constraints.txt"

mkdir -p "$COMFYUI_DIR/custom_nodes" "$MOBILE_FRONTEND_SRC/dist"
printf '%s\n' '# test custom node' > "$MOBILE_FRONTEND_SRC/__init__.py"
printf '%s\n' '<html></html>' > "$MOBILE_FRONTEND_SRC/dist/index.html"
source "$BOOTSTRAP"

workflow_source_dir="$behavior_tmp/workflows"
mkdir -p "$workflow_source_dir"
printf '%s\n' '{"workflow":"sdxl"}' > "$workflow_source_dir/mobile_sdxl_default.json"
printf '%s\n' '{"workflow":"anima"}' > "$workflow_source_dir/mobile_anima_default.json"
CANONICAL_WORKFLOW_SRC="$workflow_source_dir/mobile_sdxl_default.json"
COMFYUI_CANONICAL_WORKFLOW="$behavior_tmp/registered/mobile_sdxl_default.json"
ANIMA_WORKFLOW_SRC="$workflow_source_dir/mobile_anima_default.json"
COMFYUI_ANIMA_WORKFLOW="$behavior_tmp/registered/mobile_anima_default.json"
register_canonical_workflow
register_anima_workflow
[[ -f "$COMFYUI_CANONICAL_WORKFLOW" && -f "$COMFYUI_ANIMA_WORKFLOW" ]] || {
  echo "workflow behavior test failed: both canonical workflows were not registered" >&2
  exit 1
}
grep -Fq '"workflow":"sdxl"' "$COMFYUI_CANONICAL_WORKFLOW" || {
  echo "workflow behavior test failed: SDXL workflow content was not copied" >&2
  exit 1
}
grep -Fq '"workflow":"anima"' "$COMFYUI_ANIMA_WORKFLOW" || {
  echo "workflow behavior test failed: Anima workflow content was not copied" >&2
  exit 1
}

printf '%s\n' '# runtime constraint' > "$RUNTIME_PIP_CONSTRAINT_FILE"
unset PIP_CONSTRAINT
configure_runtime_pip_constraints
[[ "$PIP_CONSTRAINT" == "$RUNTIME_PIP_CONSTRAINT_FILE" ]] || {
  echo "pip constraint behavior test failed: runtime constraint was not exported" >&2
  exit 1
}

existing_constraint="$behavior_tmp/existing-constraints.txt"
export PIP_CONSTRAINT="$existing_constraint"
configure_runtime_pip_constraints
[[ "$PIP_CONSTRAINT" == "$existing_constraint" ]] || {
  echo "pip constraint behavior test failed: existing constraint was overwritten" >&2
  exit 1
}

unset PIP_CONSTRAINT
RUNTIME_PIP_CONSTRAINT_FILE="$behavior_tmp/missing-constraints.txt" configure_runtime_pip_constraints

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

model_behavior_tmp="$behavior_tmp/model-layout"
NETWORK_CHECKPOINT_DIR="$model_behavior_tmp/workspace/models/checkpoints"
CHECKPOINT_DIR="$model_behavior_tmp/runpod-slim/ComfyUI/models/checkpoints"
DIFFUSION_MODEL_DIR="$model_behavior_tmp/runpod-slim/ComfyUI/models/diffusion_models"
TEXT_ENCODER_DIR="$model_behavior_tmp/runpod-slim/ComfyUI/models/text_encoders"
VAE_DIR="$model_behavior_tmp/runpod-slim/ComfyUI/models/vae"
GDRIVE_MODEL_PATH="sdxl_model"
GDRIVE_TEXT_ENCODER_PATH="anima_text_encoder"
GDRIVE_VAE_PATH="anima_vae"
SDXL_MODEL_FILENAME="sdxl-model.safetensors"
mkdir -p "$NETWORK_CHECKPOINT_DIR" "$CHECKPOINT_DIR" "$DIFFUSION_MODEL_DIR" \
  "$TEXT_ENCODER_DIR" "$VAE_DIR"
printf '%s\n' stale > "$NETWORK_CHECKPOINT_DIR/stale.safetensors"
ln -s "$NETWORK_CHECKPOINT_DIR/stale.safetensors" "$CHECKPOINT_DIR/stale.safetensors"
ln -s "$NETWORK_CHECKPOINT_DIR/stale.safetensors" "$DIFFUSION_MODEL_DIR/stale.safetensors"
copyto_count=0
skip_anima_sync=false

rclone() {
  local operation="${1:-}"
  case "$operation" in
    lsf)
      printf '7\t%s\n' "$ANIMA_MODEL_FILENAME"
      printf '6\t%s\n' "$SDXL_MODEL_FILENAME"
      ;;
    copyto)
      copyto_count=$((copyto_count + 1))
      if [[ "$2" == *"$SDXL_MODEL_FILENAME" ]]; then
        printf 'sdxl!!' > "$3"
      else
        printf 'anima!!' > "$3"
      fi
      ;;
    copy)
      local argument destination="" remote_path=""
      for argument in "$@"; do
        destination="$argument"
        if [[ "$argument" == "${RCLONE_REMOTE_NAME}:${GDRIVE_TEXT_ENCODER_PATH}" || \
          "$argument" == "${RCLONE_REMOTE_NAME}:${GDRIVE_VAE_PATH}" ]]; then
          remote_path="$argument"
        fi
      done
      if [[ "$skip_anima_sync" == true && -n "$remote_path" ]]; then
        return 1
      fi
      mkdir -p "$destination"
      if [[ "$remote_path" == "${RCLONE_REMOTE_NAME}:${GDRIVE_TEXT_ENCODER_PATH}" ]]; then
        printf '%s\n' encoder > "$destination/$ANIMA_TEXT_ENCODER_FILENAME"
      elif [[ "$remote_path" == "${RCLONE_REMOTE_NAME}:${GDRIVE_VAE_PATH}" ]]; then
        printf '%s\n' vae > "$destination/$ANIMA_VAE_FILENAME"
      fi
      ;;
    *)
      echo "unexpected rclone operation in model behavior test: $operation" >&2
      return 1
      ;;
  esac
}

sync_gdrive_checkpoints
sync_gdrive_checkpoints
[[ -f "$NETWORK_CHECKPOINT_DIR/$ANIMA_MODEL_FILENAME" ]] || {
  echo "model behavior test failed: checkpoint cache file was not downloaded" >&2
  exit 1
}
[[ -L "$CHECKPOINT_DIR/$ANIMA_MODEL_FILENAME" && \
  -L "$DIFFUSION_MODEL_DIR/$ANIMA_MODEL_FILENAME" ]] || {
  echo "model behavior test failed: both ComfyUI model links were not created" >&2
  exit 1
}
[[ "$(readlink -f "$CHECKPOINT_DIR/$ANIMA_MODEL_FILENAME")" == \
  "$(readlink -f "$NETWORK_CHECKPOINT_DIR/$ANIMA_MODEL_FILENAME")" ]] || {
  echo "model behavior test failed: checkpoint link does not target the shared cache" >&2
  exit 1
}
[[ "$(readlink -f "$DIFFUSION_MODEL_DIR/$ANIMA_MODEL_FILENAME")" == \
  "$(readlink -f "$NETWORK_CHECKPOINT_DIR/$ANIMA_MODEL_FILENAME")" ]] || {
  echo "model behavior test failed: diffusion model link does not target the shared cache" >&2
  exit 1
}
[[ -L "$CHECKPOINT_DIR/$SDXL_MODEL_FILENAME" && \
  -L "$DIFFUSION_MODEL_DIR/$SDXL_MODEL_FILENAME" ]] || {
  echo "model behavior test failed: existing SDXL checkpoint links were not created" >&2
  exit 1
}
[[ ! -e "$CHECKPOINT_DIR/stale.safetensors" && \
  ! -e "$DIFFUSION_MODEL_DIR/stale.safetensors" ]] || {
  echo "model behavior test failed: stale model links were not removed" >&2
  exit 1
}
cache_file_count="$(find "$NETWORK_CHECKPOINT_DIR" -type f -name "$ANIMA_MODEL_FILENAME" | wc -l | tr -d '[:space:]')"
[[ "$cache_file_count" == "1" ]] || {
  echo "model behavior test failed: checkpoint model was copied more than once" >&2
  exit 1
}
[[ "$copyto_count" == "2" ]] || {
  echo "model behavior test failed: cache reuse downloaded the checkpoint more than once" >&2
  exit 1
}

copy_gdrive_local_models
[[ -f "$TEXT_ENCODER_DIR/$ANIMA_TEXT_ENCODER_FILENAME" ]] || {
  echo "model behavior test failed: text encoder was not synced" >&2
  exit 1
}
[[ -f "$VAE_DIR/$ANIMA_VAE_FILENAME" ]] || {
  echo "model behavior test failed: VAE was not synced" >&2
  exit 1
}
rm -f -- "$TEXT_ENCODER_DIR/$ANIMA_TEXT_ENCODER_FILENAME" "$VAE_DIR/$ANIMA_VAE_FILENAME"
skip_anima_sync=true
copy_gdrive_local_models
anima_verification_log="$(verify_anima_model_files 2>&1)"
grep -Fq 'warning: Anima text encoder is missing from text_encoders' <<<"$anima_verification_log" || {
  echo "model behavior test failed: missing Anima dependency did not produce a warning" >&2
  exit 1
}
grep -Fq 'warning: Anima VAE is missing from vae' <<<"$anima_verification_log" || {
  echo "model behavior test failed: missing Anima VAE did not produce a warning" >&2
  exit 1
}

echo "RunPod bootstrap static checks passed."
