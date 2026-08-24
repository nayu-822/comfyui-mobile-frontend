#!/usr/bin/env bash
set -Eeuo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
COMFYUI_DIR="${COMFYUI_DIR:-/workspace/runpod-slim/ComfyUI}"
BAKED_COMFYUI_DIR="${BAKED_COMFYUI_DIR:-/opt/comfyui-baked}"

MOBILE_FRONTEND_SRC="${MOBILE_FRONTEND_SRC:-${WORKSPACE_DIR}/comfyui-mobile-frontend-src}"
MOBILE_CUSTOM_NODE_DIR="${MOBILE_CUSTOM_NODE_DIR:-${COMFYUI_DIR}/custom_nodes/comfyui-mobile-frontend}"

RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-gdrive}"
RCLONE_CONFIG="${RCLONE_CONFIG:-${RCLONE_CONFIG_PATH:-/tmp/rclone.conf}}"

GDRIVE_MODEL_PATH="${GDRIVE_MODEL_PATH:-sdxl_model}"
GDRIVE_LORA_PATH="${GDRIVE_LORA_PATH:-sdxl_lora}"
GDRIVE_UPSCALER_PATH="${GDRIVE_UPSCALER_PATH:-sdxl_upscaler}"
GDRIVE_DETAILER_PATH="${GDRIVE_DETAILER_PATH:-sdxl_detailer}"

COMFYUI_PYTHON="${COMFYUI_PYTHON:-python}"
START_SCRIPT="${START_SCRIPT:-/start.sh}"
OUTPUT_SYNC_LOG="${OUTPUT_SYNC_LOG:-/tmp/comfyui-mobile-output-sync.log}"
COMFYUI_OUTPUT_DIR="${COMFYUI_OUTPUT_DIR:-${COMFYUI_DIR}/output}"
GDRIVE_OUTPUT_PATH="${GDRIVE_OUTPUT_PATH:-sdxl_output/output}"
ENABLE_OUTPUT_SYNC="${ENABLE_OUTPUT_SYNC:-true}"
OUTPUT_SYNC_INTERVAL_SECONDS="${OUTPUT_SYNC_INTERVAL_SECONDS:-60}"
OUTPUT_MIN_AGE="${OUTPUT_MIN_AGE:-15s}"

INSTALL_CUSTOM_NODE_REQUIREMENTS="${INSTALL_CUSTOM_NODE_REQUIREMENTS:-true}"
INSTALL_SAM2_DEPENDENCIES="${INSTALL_SAM2_DEPENDENCIES:-false}"
IMPACT_PACK_DIR="${IMPACT_PACK_DIR:-${COMFYUI_DIR}/custom_nodes/ComfyUI-Impact-Pack}"
IMPACT_SUBPACK_DIR="${IMPACT_SUBPACK_DIR:-${COMFYUI_DIR}/custom_nodes/ComfyUI-Impact-Subpack}"
IMPACT_PACK_REF="${IMPACT_PACK_REF:-Main}"
IMPACT_SUBPACK_REF="${IMPACT_SUBPACK_REF:-main}"

CHECKPOINT_DIR="${CHECKPOINT_DIR:-${COMFYUI_DIR}/models/checkpoints}"
LORA_DIR="${LORA_DIR:-${COMFYUI_DIR}/models/loras}"
UPSCALE_MODEL_DIR="${UPSCALE_MODEL_DIR:-${COMFYUI_DIR}/models/upscale_models}"
DETAILER_DIR="${DETAILER_DIR:-${COMFYUI_DIR}/models/ultralytics/bbox}"

log() { echo "[runpod] $*"; }

is_enabled() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

prepare_comfyui() {
  if [[ -f "$COMFYUI_DIR/main.py" ]]; then
    log "using ComfyUI at $COMFYUI_DIR"
    return 0
  fi

  log "copying baked ComfyUI $BAKED_COMFYUI_DIR -> $COMFYUI_DIR"
  rm -rf "$COMFYUI_DIR"
  mkdir -p "$(dirname "$COMFYUI_DIR")"
  [[ -d "$BAKED_COMFYUI_DIR" ]] || {
    log "baked ComfyUI directory is missing: $BAKED_COMFYUI_DIR"
    exit 1
  }
  cp -a "$BAKED_COMFYUI_DIR" "$COMFYUI_DIR"
  [[ -f "$COMFYUI_DIR/main.py" ]] || {
    log "copied ComfyUI does not contain main.py"
    exit 1
  }
}

install_rclone_if_missing() {
  if command -v rclone >/dev/null 2>&1; then return 0; fi
  local installer="${RCLONE_INSTALL_URL:-https://rclone.org/install.sh}"
  log "installing rclone"
  curl --fail --location --retry 3 "$installer" | bash
}

configure_rclone() {
  if [[ -z "${RCLONE_CONFIG_B64:-}" ]]; then
    [[ -f "$RCLONE_CONFIG" ]] || {
      log "RCLONE_CONFIG_B64 is empty and config is missing: $RCLONE_CONFIG"
      exit 1
    }
    export RCLONE_CONFIG
    return 0
  fi

  mkdir -p "$(dirname "$RCLONE_CONFIG")"
  local temp_path="${RCLONE_CONFIG}.tmp.$$"
  if printf '%s' "$RCLONE_CONFIG_B64" | base64 --decode > "$temp_path" 2>/dev/null; then
    :
  elif printf '%s' "$RCLONE_CONFIG_B64" | base64 -d > "$temp_path" 2>/dev/null; then
    :
  else
    rm -f "$temp_path"
    log "could not decode RCLONE_CONFIG_B64"
    exit 1
  fi
  chmod 600 "$temp_path"
  mv -f "$temp_path" "$RCLONE_CONFIG"
  export RCLONE_CONFIG
  log "rclone config prepared at $RCLONE_CONFIG"
}

copy_gdrive_extensions() {
  local remote_path="$1"
  local destination="$2"
  shift 2
  [[ -n "$remote_path" ]] || {
    log "skipping empty GDrive path for $destination"
    return 0
  }

  mkdir -p "$destination"
  local -a args=(copy --create-empty-src-dirs)
  local pattern
  for pattern in "$@"; do
    args+=(--include "$pattern")
  done
  args+=("${RCLONE_REMOTE_NAME}:$remote_path" "$destination")
  log "copying ${RCLONE_REMOTE_NAME}:$remote_path -> $destination"
  rclone "${args[@]}"
}

copy_gdrive_models() {
  copy_gdrive_extensions "$GDRIVE_MODEL_PATH" "$CHECKPOINT_DIR" \
    '*.safetensors' '*.ckpt'
  copy_gdrive_extensions "$GDRIVE_LORA_PATH" "$LORA_DIR" \
    '*.safetensors' '*.ckpt' '*.pt'
  copy_gdrive_extensions "$GDRIVE_UPSCALER_PATH" "$UPSCALE_MODEL_DIR" \
    '*.pth' '*.pt' '*.safetensors'
  copy_gdrive_extensions "$GDRIVE_DETAILER_PATH" "$DETAILER_DIR" \
    '*.pt' '*.pth'
}

clone_if_missing() {
  local destination="$1"
  local repo="$2"
  local ref="$3"
  if [[ -d "$destination/.git" ]]; then return 0; fi
  if [[ -e "$destination" ]]; then
    log "using existing custom node directory: $destination"
    return 0
  fi
  mkdir -p "$(dirname "$destination")"
  git clone --depth 1 --branch "$ref" "$repo" "$destination"
}

install_impact_requirements() {
  local requirements="$1"
  [[ -f "$requirements" ]] || return 0
  if is_enabled "$INSTALL_SAM2_DEPENDENCIES"; then
    "$COMFYUI_PYTHON" -m pip install -r "$requirements"
    return 0
  fi

  local filtered_requirements
  filtered_requirements="$(mktemp)"
  awk '{
    line = tolower($0)
    if (line !~ /sam[-_]?2/ && line !~ /segment[-_]anything[-_]?2/) print
  }' "$requirements" > "$filtered_requirements"
  if [[ -s "$filtered_requirements" ]]; then
    "$COMFYUI_PYTHON" -m pip install -r "$filtered_requirements"
  fi
  rm -f "$filtered_requirements"
}

install_impact_pack() {
  clone_if_missing "$IMPACT_PACK_DIR" \
    "${IMPACT_PACK_REPO:-https://github.com/ltdrdata/ComfyUI-Impact-Pack.git}" \
    "$IMPACT_PACK_REF"
  clone_if_missing "$IMPACT_SUBPACK_DIR" \
    "${IMPACT_SUBPACK_REPO:-https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git}" \
    "$IMPACT_SUBPACK_REF"

  if ! is_enabled "$INSTALL_CUSTOM_NODE_REQUIREMENTS"; then return 0; fi
  install_impact_requirements "$IMPACT_PACK_DIR/requirements.txt"
  install_impact_requirements "$IMPACT_SUBPACK_DIR/requirements.txt"
}

link_mobile_frontend() {
  [[ -d "$MOBILE_FRONTEND_SRC" ]] || {
    log "mobile frontend source is missing: $MOBILE_FRONTEND_SRC"
    exit 1
  }
  [[ -f "$MOBILE_FRONTEND_SRC/dist/index.html" ]] || {
    log "mobile frontend dist/index.html is missing"
    exit 1
  }

  mkdir -p "$(dirname "$MOBILE_CUSTOM_NODE_DIR")"
  local source_real
  source_real="$(readlink -f "$MOBILE_FRONTEND_SRC")"

  if [[ -L "$MOBILE_CUSTOM_NODE_DIR" ]]; then
    local current_real
    current_real="$(readlink -f "$MOBILE_CUSTOM_NODE_DIR" 2>/dev/null || true)"
    if [[ "$current_real" == "$source_real" ]]; then return 0; fi
    rm -f "$MOBILE_CUSTOM_NODE_DIR"
  elif [[ -e "$MOBILE_CUSTOM_NODE_DIR" ]]; then
    local backup_dir
    backup_dir="$(mktemp -d "${MOBILE_CUSTOM_NODE_DIR}.backup.XXXXXX")"
    mv "$MOBILE_CUSTOM_NODE_DIR" "$backup_dir/previous"
    log "moved existing frontend aside to $backup_dir/previous"
  fi

  ln -s "$MOBILE_FRONTEND_SRC" "$MOBILE_CUSTOM_NODE_DIR"
  log "linked $MOBILE_CUSTOM_NODE_DIR -> $MOBILE_FRONTEND_SRC"
}

start_output_sync() {
  if ! is_enabled "$ENABLE_OUTPUT_SYNC"; then
    log "output sync disabled"
    return 0
  fi

  mkdir -p "$(dirname "$OUTPUT_SYNC_LOG")"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  nohup env \
    RCLONE_CONFIG="$RCLONE_CONFIG" \
    RCLONE_REMOTE_NAME="$RCLONE_REMOTE_NAME" \
    GDRIVE_OUTPUT_PATH="$GDRIVE_OUTPUT_PATH" \
    COMFYUI_DIR="$COMFYUI_DIR" \
    COMFYUI_OUTPUT_DIR="$COMFYUI_OUTPUT_DIR" \
    OUTPUT_SYNC_INTERVAL_SECONDS="$OUTPUT_SYNC_INTERVAL_SECONDS" \
    OUTPUT_MIN_AGE="$OUTPUT_MIN_AGE" \
    ENABLE_OUTPUT_SYNC="$ENABLE_OUTPUT_SYNC" \
    bash "$script_dir/sync_outputs.sh" >> "$OUTPUT_SYNC_LOG" 2>&1 &
  log "output sync worker started with pid $!"
}

mkdir -p "$WORKSPACE_DIR"
prepare_comfyui
mkdir -p "$COMFYUI_DIR/custom_nodes" "$COMFYUI_OUTPUT_DIR" \
  "$CHECKPOINT_DIR" "$LORA_DIR" "$UPSCALE_MODEL_DIR" "$DETAILER_DIR"

install_rclone_if_missing
configure_rclone
link_mobile_frontend
copy_gdrive_models
install_impact_pack
start_output_sync

if [[ ! -x "$START_SCRIPT" ]]; then
  log "start script is not executable: $START_SCRIPT"
  exit 1
fi
exec "$START_SCRIPT"
