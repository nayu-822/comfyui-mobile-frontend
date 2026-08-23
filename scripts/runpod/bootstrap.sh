#!/usr/bin/env bash
set -Eeuo pipefail

# RunPod bootstrap for ComfyUI + the mobile frontend. Secrets are intentionally
# read only from the environment (RunPod Secret / env vars); this file contains
# no rclone config, access token, or model URL that is meant to stay private.

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
COMFYUI_DIR="${COMFYUI_DIR:-${WORKSPACE_DIR}/ComfyUI}"
COMFYUI_REPO="${COMFYUI_REPO:-https://github.com/comfyanonymous/ComfyUI.git}"
COMFYUI_REF="${COMFYUI_REF:-master}"
MOBILE_FRONTEND_SRC="${MOBILE_FRONTEND_SRC:-${WORKSPACE_DIR}/comfyui-mobile-frontend-src}"
MOBILE_FRONTEND_REPO="${MOBILE_FRONTEND_REPO:-https://github.com/nayu-822/comfyui-mobile-frontend.git}"
MOBILE_FRONTEND_REF="${MOBILE_FRONTEND_REF:-feature/simple-generation-ui}"
MOBILE_CUSTOM_NODE_DIR="${MOBILE_CUSTOM_NODE_DIR:-${COMFYUI_DIR}/custom_nodes/comfyui-mobile-frontend}"
RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-gdrive}"
RCLONE_CONFIG_PATH="${RCLONE_CONFIG_PATH:-/root/.config/rclone/rclone.conf}"
COMFYUI_PYTHON="${COMFYUI_PYTHON:-python}"
INSTALL_CUSTOM_NODE_REQUIREMENTS="${INSTALL_CUSTOM_NODE_REQUIREMENTS:-true}"
START_SCRIPT="${START_SCRIPT:-/start.sh}"
OUTPUT_SYNC_LOG="${OUTPUT_SYNC_LOG:-/tmp/comfyui-mobile-output-sync.log}"

CHECKPOINT_DIR="${CHECKPOINT_DIR:-${COMFYUI_DIR}/models/checkpoints}"
LORA_DIR="${LORA_DIR:-${COMFYUI_DIR}/models/loras}"
UPSCALE_MODEL_DIR="${UPSCALE_MODEL_DIR:-${COMFYUI_DIR}/models/upscale_models}"
ULTRALYTICS_DIR="${ULTRALYTICS_DIR:-${COMFYUI_DIR}/models/ultralytics}"
IMPACT_PACK_DIR="${IMPACT_PACK_DIR:-${COMFYUI_DIR}/custom_nodes/ComfyUI-Impact-Pack}"
IMPACT_SUBPACK_DIR="${IMPACT_SUBPACK_DIR:-${COMFYUI_DIR}/custom_nodes/ComfyUI-Impact-Subpack}"

log() { echo "[runpod] $*"; }

is_enabled() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

clone_if_missing() {
  local destination="$1"; local repo="$2"; local ref="$3"
  if [[ -d "$destination/.git" ]]; then
    return 0
  fi
  if [[ -e "$destination" ]]; then
    log "using existing directory: $destination"
    return 0
  fi
  mkdir -p "$(dirname "$destination")"
  git clone --depth 1 --branch "$ref" "$repo" "$destination"
}

install_rclone_if_missing() {
  if command -v rclone >/dev/null 2>&1; then return 0; fi
  local installer="${RCLONE_INSTALL_URL:-https://rclone.org/install.sh}"
  log "installing rclone"
  curl --fail --location --retry 3 "$installer" | bash
}

configure_rclone() {
  [[ -n "${RCLONE_CONFIG_B64:-}" ]] || return 0
  mkdir -p "$(dirname "$RCLONE_CONFIG_PATH")"
  local temp_path="${RCLONE_CONFIG_PATH}.tmp.$$"
  if printf '%s' "$RCLONE_CONFIG_B64" | base64 --decode > "$temp_path" 2>/dev/null; then
    :
  elif printf '%s' "$RCLONE_CONFIG_B64" | base64 -d > "$temp_path" 2>/dev/null; then
    :
  else
    rm -f "$temp_path"
    echo "[runpod] could not decode RCLONE_CONFIG_B64" >&2
    exit 1
  fi
  chmod 600 "$temp_path"
  mv -f "$temp_path" "$RCLONE_CONFIG_PATH"
  export RCLONE_CONFIG="$RCLONE_CONFIG_PATH"
}

sync_gdrive_path() {
  local remote_path="$1"; local destination="$2"
  [[ -n "$remote_path" ]] || return 0
  mkdir -p "$destination"
  log "syncing ${RCLONE_REMOTE_NAME}:${remote_path} -> ${destination}"
  rclone copy "${RCLONE_REMOTE_NAME}:${remote_path}" "$destination" --create-empty-src-dirs
}

download_if_configured() {
  local url="${1:-}"; local destination="$2"
  [[ -n "$url" ]] || return 0
  if [[ -f "$destination" ]]; then return 0; fi
  mkdir -p "$(dirname "$destination")"
  log "downloading $(basename "$destination")"
  curl --fail --location --retry 3 "$url" --output "$destination"
}

install_impact_pack() {
  clone_if_missing "$IMPACT_PACK_DIR" \
    "${IMPACT_PACK_REPO:-https://github.com/ltdrdata/ComfyUI-Impact-Pack.git}" \
    "${IMPACT_PACK_REF:-main}"
  clone_if_missing "$IMPACT_SUBPACK_DIR" \
    "${IMPACT_SUBPACK_REPO:-https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git}" \
    "${IMPACT_SUBPACK_REF:-main}"

  if ! is_enabled "$INSTALL_CUSTOM_NODE_REQUIREMENTS"; then return 0; fi
  for requirements in "$IMPACT_PACK_DIR/requirements.txt" "$IMPACT_SUBPACK_DIR/requirements.txt"; do
    if [[ -f "$requirements" ]]; then
      "$COMFYUI_PYTHON" -m pip install -r "$requirements"
    fi
  done
}

prepare_face_detector() {
  local detector_path="${ULTRALYTICS_DIR}/bbox/face_yolov8m.pt"
  mkdir -p "$(dirname "$detector_path")"
  if [[ -f "$detector_path" ]]; then return 0; fi
  if [[ -n "${GDRIVE_FACE_DETECTOR_PATH:-}" ]]; then
    rclone copyto "${RCLONE_REMOTE_NAME}:${GDRIVE_FACE_DETECTOR_PATH}" "$detector_path"
  else
    download_if_configured "${FACE_DETECTOR_URL:-}" "$detector_path"
  fi
  if [[ ! -f "$detector_path" ]]; then
    log "face detector not provisioned; set GDRIVE_FACE_DETECTOR_PATH or FACE_DETECTOR_URL"
  fi
}

start_output_sync() {
  if ! is_enabled "${ENABLE_OUTPUT_SYNC:-true}"; then return 0; fi
  if [[ -z "${GDRIVE_OUTPUT_PATH:-}" ]]; then
    log "output sync disabled because GDRIVE_OUTPUT_PATH is empty"
    return 0
  fi
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  log "starting output sync worker"
  nohup env \
    COMFYUI_DIR="$COMFYUI_DIR" \
    OUTPUT_SYNC_LOG="$OUTPUT_SYNC_LOG" \
    bash "$script_dir/sync_outputs.sh" >> "$OUTPUT_SYNC_LOG" 2>&1 &
}

mkdir -p "$WORKSPACE_DIR"
clone_if_missing "$COMFYUI_DIR" "$COMFYUI_REPO" "$COMFYUI_REF"
clone_if_missing "$MOBILE_FRONTEND_SRC" "$MOBILE_FRONTEND_REPO" "$MOBILE_FRONTEND_REF"

mkdir -p "$COMFYUI_DIR/custom_nodes" "$COMFYUI_DIR/output" \
  "$CHECKPOINT_DIR" "$LORA_DIR" "$UPSCALE_MODEL_DIR" "$ULTRALYTICS_DIR"

install_rclone_if_missing
configure_rclone

# Prefer a symlink so the Python custom-node loader and dist/index.html both
# resolve from the exact commit cloned above. Never replace a real directory
# automatically; an existing installation is safer than deleting user files.
if [[ -L "$MOBILE_CUSTOM_NODE_DIR" ]]; then
  if [[ "$(readlink -f "$MOBILE_CUSTOM_NODE_DIR")" != "$(readlink -f "$MOBILE_FRONTEND_SRC")" ]]; then
    rm -f "$MOBILE_CUSTOM_NODE_DIR"
    ln -s "$MOBILE_FRONTEND_SRC" "$MOBILE_CUSTOM_NODE_DIR"
  fi
elif [[ ! -e "$MOBILE_CUSTOM_NODE_DIR" ]]; then
  ln -s "$MOBILE_FRONTEND_SRC" "$MOBILE_CUSTOM_NODE_DIR"
else
  log "keeping existing non-symlink custom node: $MOBILE_CUSTOM_NODE_DIR"
fi

sync_gdrive_path "${GDRIVE_CHECKPOINT_PATH:-}" "$CHECKPOINT_DIR"
sync_gdrive_path "${GDRIVE_LORA_PATH:-}" "$LORA_DIR"
sync_gdrive_path "${GDRIVE_UPSCALE_PATH:-}" "$UPSCALE_MODEL_DIR"

download_if_configured "${CHECKPOINT_URL:-}" "${CHECKPOINT_LOCAL_PATH:-$CHECKPOINT_DIR/${CHECKPOINT_FILENAME:-sdxl.safetensors}}"
install_impact_pack
prepare_face_detector
start_output_sync

if [[ ! -x "$START_SCRIPT" ]]; then
  echo "[runpod] start script is not executable: $START_SCRIPT" >&2
  exit 1
fi
exec "$START_SCRIPT"
