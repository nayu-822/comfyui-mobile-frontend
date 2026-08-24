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

NETWORK_MODEL_ROOT="${NETWORK_MODEL_ROOT:-/network-models}"
NETWORK_CHECKPOINT_DIR="${NETWORK_CHECKPOINT_DIR:-${NETWORK_MODEL_ROOT}/checkpoints}"

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

# Set by resolve_comfyui_python after the baked ComfyUI directory is available.
COMFYUI_PYTHON=""

log() { echo "[runpod] $*"; }

is_enabled() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_path() {
  realpath -m -- "$1"
}

path_is_within() {
  local candidate base
  candidate="$(resolve_path "$1")"
  base="$(resolve_path "$2")"
  [[ "$candidate" == "$base" || "$candidate" == "$base"/* ]]
}

assert_not_network_volume_path() {
  local label="$1"
  local candidate="$2"
  if path_is_within "$candidate" "$NETWORK_MODEL_ROOT"; then
    log "$label must not be under Network Volume $NETWORK_MODEL_ROOT: $candidate"
    exit 1
  fi
}

validate_network_volume() {
  command -v realpath >/dev/null 2>&1 || {
    log "realpath is required for Network Volume safety checks"
    exit 1
  }
  command -v mountpoint >/dev/null 2>&1 || {
    log "mountpoint is required to verify Network Volume $NETWORK_MODEL_ROOT"
    exit 1
  }

  NETWORK_MODEL_ROOT="$(resolve_path "$NETWORK_MODEL_ROOT")"
  NETWORK_CHECKPOINT_DIR="$(resolve_path "$NETWORK_CHECKPOINT_DIR")"

  [[ "$NETWORK_MODEL_ROOT" = /* ]] || {
    log "NETWORK_MODEL_ROOT must be an absolute path: $NETWORK_MODEL_ROOT"
    exit 1
  }
  [[ -d "$NETWORK_MODEL_ROOT" ]] || {
    log "Network Volume is not mounted at $NETWORK_MODEL_ROOT"
    exit 1
  }
  mountpoint -q "$NETWORK_MODEL_ROOT" || {
    log "Network Volume is not mounted at $NETWORK_MODEL_ROOT"
    exit 1
  }
  [[ ! -L "$NETWORK_CHECKPOINT_DIR" ]] || {
    log "NETWORK_CHECKPOINT_DIR must not be a symlink: $NETWORK_CHECKPOINT_DIR"
    exit 1
  }
  path_is_within "$NETWORK_CHECKPOINT_DIR" "$NETWORK_MODEL_ROOT/checkpoints" || {
    log "NETWORK_CHECKPOINT_DIR must stay under $NETWORK_MODEL_ROOT/checkpoints: $NETWORK_CHECKPOINT_DIR"
    exit 1
  }

  local forbidden_entry
  forbidden_entry="$(find "$NETWORK_MODEL_ROOT" -mindepth 1 -maxdepth 1 ! -name checkpoints -print -quit)"
  if [[ -n "$forbidden_entry" ]]; then
    log "Network Volume may contain only the checkpoints directory; unexpected entry: $forbidden_entry"
    exit 1
  fi
}

validate_non_checkpoint_paths() {
  assert_not_network_volume_path "WORKSPACE_DIR" "$WORKSPACE_DIR"
  assert_not_network_volume_path "COMFYUI_DIR" "$COMFYUI_DIR"
  assert_not_network_volume_path "BAKED_COMFYUI_DIR" "$BAKED_COMFYUI_DIR"
  assert_not_network_volume_path "MOBILE_FRONTEND_SRC" "$MOBILE_FRONTEND_SRC"
  assert_not_network_volume_path "MOBILE_CUSTOM_NODE_DIR" "$MOBILE_CUSTOM_NODE_DIR"
  assert_not_network_volume_path "CHECKPOINT_DIR" "$CHECKPOINT_DIR"
  assert_not_network_volume_path "LORA_DIR" "$LORA_DIR"
  assert_not_network_volume_path "UPSCALE_MODEL_DIR" "$UPSCALE_MODEL_DIR"
  assert_not_network_volume_path "DETAILER_DIR" "$DETAILER_DIR"
  assert_not_network_volume_path "COMFYUI_OUTPUT_DIR" "$COMFYUI_OUTPUT_DIR"
  assert_not_network_volume_path "IMPACT_PACK_DIR" "$IMPACT_PACK_DIR"
  assert_not_network_volume_path "IMPACT_SUBPACK_DIR" "$IMPACT_SUBPACK_DIR"
  assert_not_network_volume_path "RCLONE_CONFIG" "$RCLONE_CONFIG"
  assert_not_network_volume_path "OUTPUT_SYNC_LOG" "$OUTPUT_SYNC_LOG"
  assert_not_network_volume_path "START_SCRIPT" "$START_SCRIPT"
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

resolve_comfyui_python() {
  local venv_python="${COMFYUI_DIR}/.venv-cu128/bin/python"
  if [[ -x "$venv_python" ]]; then
    COMFYUI_PYTHON="$venv_python"
  elif command -v python3.12 >/dev/null 2>&1; then
    COMFYUI_PYTHON="$(command -v python3.12)"
  elif command -v python3 >/dev/null 2>&1; then
    COMFYUI_PYTHON="$(command -v python3)"
  else
    log "no usable ComfyUI Python found; tried $venv_python, python3.12, python3"
    exit 1
  fi
  log "using ComfyUI Python: $COMFYUI_PYTHON"
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

checkpoint_manifest() {
  rclone lsf \
    --recursive \
    --files-only \
    --format 'sp' \
    --separator $'\t' \
    --include '*.safetensors' \
    --include '*.ckpt' \
    "${RCLONE_REMOTE_NAME}:${GDRIVE_MODEL_PATH}"
}

validate_checkpoint_relative_path() {
  local relative_path="$1"
  [[ -n "$relative_path" ]] || {
    log "GDrive checkpoint listing contained an empty path"
    exit 1
  }
  case "/$relative_path/" in
    /*/../*|*/./*)
      log "unsafe relative checkpoint path from GDrive: $relative_path"
      exit 1
      ;;
  esac
  [[ "$relative_path" != /* ]] || {
    log "absolute checkpoint path from GDrive is not allowed: $relative_path"
    exit 1
  }
}

checkpoint_cache_matches() {
  local cache_path="$1"
  local remote_size="$2"
  [[ -f "$cache_path" && ! -L "$cache_path" ]] || return 1
  local cache_size
  cache_size="$(stat -c '%s' -- "$cache_path")"
  [[ "$cache_size" == "$remote_size" ]]
}

copy_checkpoint_to_cache() {
  local relative_path="$1"
  local remote_size="$2"
  local remote_path="${RCLONE_REMOTE_NAME}:${GDRIVE_MODEL_PATH}/${relative_path}"
  local cache_path="${NETWORK_CHECKPOINT_DIR}/${relative_path}"
  local temp_path="${cache_path}.part"

  if checkpoint_cache_matches "$cache_path" "$remote_size"; then
    log "reusing checkpoint cache $cache_path (size $remote_size)"
    return 0
  fi

  if [[ -d "$cache_path" && ! -L "$cache_path" ]]; then
    log "checkpoint cache path is a directory: $cache_path"
    exit 1
  fi
  mkdir -p "$(dirname "$cache_path")"
  rm -f "$temp_path"
  log "copying checkpoint $remote_path -> $temp_path"
  rclone copyto "$remote_path" "$temp_path"
  [[ -f "$temp_path" ]] || {
    log "rclone did not create checkpoint temporary file: $temp_path"
    exit 1
  }

  local copied_size
  copied_size="$(stat -c '%s' -- "$temp_path")"
  if [[ "$copied_size" != "$remote_size" ]]; then
    log "checkpoint size mismatch for $relative_path: expected $remote_size, got $copied_size"
    rm -f "$temp_path"
    exit 1
  fi
  mv -f "$temp_path" "$cache_path"
}

prepare_checkpoint_link_dir() {
  [[ ! -L "$CHECKPOINT_DIR" ]] || {
    log "CHECKPOINT_DIR must be a local directory, not a symlink: $CHECKPOINT_DIR"
    exit 1
  }
  mkdir -p "$CHECKPOINT_DIR"

  local legacy_file
  legacy_file="$(find "$CHECKPOINT_DIR" -type f -print -quit)"
  if [[ -n "$legacy_file" ]]; then
    local backup_dir="${CHECKPOINT_DIR}.legacy.$$.${RANDOM}"
    while [[ -e "$backup_dir" || -L "$backup_dir" ]]; do
      backup_dir="${CHECKPOINT_DIR}.legacy.$$.${RANDOM}"
    done
    mv "$CHECKPOINT_DIR" "$backup_dir"
    mkdir -p "$CHECKPOINT_DIR"
    log "moved legacy local checkpoint files aside to $backup_dir"
  fi

  local stale_link
  while IFS= read -r -d '' stale_link; do
    log "removing stale checkpoint link $stale_link"
    rm -f "$stale_link"
  done < <(find "$CHECKPOINT_DIR" -type l -print0)
  find "$CHECKPOINT_DIR" -depth -mindepth 1 -type d -empty -delete
}

link_checkpoint() {
  local relative_path="$1"
  local cache_path="${NETWORK_CHECKPOINT_DIR}/${relative_path}"
  local link_path="${CHECKPOINT_DIR}/${relative_path}"
  mkdir -p "$(dirname "$link_path")"

  if [[ -d "$link_path" && ! -L "$link_path" ]]; then
    log "checkpoint link path is a directory: $link_path"
    exit 1
  fi
  if [[ -L "$link_path" ]]; then
    local current_target
    current_target="$(readlink -f "$link_path" 2>/dev/null || true)"
    if [[ "$current_target" == "$cache_path" ]]; then return 0; fi
    rm -f "$link_path"
  elif [[ -e "$link_path" ]]; then
    log "unmanaged local checkpoint path remains: $link_path"
    exit 1
  fi
  ln -s "$cache_path" "$link_path"
}

sync_gdrive_checkpoints() {
  local manifest
  manifest="$(mktemp)"
  log "listing canonical checkpoints from ${RCLONE_REMOTE_NAME}:${GDRIVE_MODEL_PATH}"
  checkpoint_manifest > "$manifest"

  # The GDrive manifest is intentionally obtained before touching the local
  # checkpoint directory or using any Network Volume cache entry.
  prepare_checkpoint_link_dir
  mkdir -p "$NETWORK_CHECKPOINT_DIR"

  local remote_size relative_path count=0
  while IFS=$'\t' read -r remote_size relative_path; do
    [[ -n "$remote_size" && -n "$relative_path" ]] || continue
    [[ "$remote_size" =~ ^[0-9]+$ ]] || {
      log "invalid size in GDrive checkpoint listing: $remote_size"
      rm -f "$manifest"
      exit 1
    }
    validate_checkpoint_relative_path "$relative_path"
    copy_checkpoint_to_cache "$relative_path" "$remote_size"
    link_checkpoint "$relative_path"
    count=$((count + 1))
  done < "$manifest"
  rm -f "$manifest"
  log "configured $count GDrive checkpoints from Network Volume cache"
}

copy_gdrive_local_models() {
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
    NETWORK_MODEL_ROOT="$NETWORK_MODEL_ROOT" \
    COMFYUI_DIR="$COMFYUI_DIR" \
    COMFYUI_OUTPUT_DIR="$COMFYUI_OUTPUT_DIR" \
    OUTPUT_SYNC_INTERVAL_SECONDS="$OUTPUT_SYNC_INTERVAL_SECONDS" \
    OUTPUT_MIN_AGE="$OUTPUT_MIN_AGE" \
    ENABLE_OUTPUT_SYNC="$ENABLE_OUTPUT_SYNC" \
    bash "$script_dir/sync_outputs.sh" >> "$OUTPUT_SYNC_LOG" 2>&1 &
  log "output sync worker started with pid $!"
}

validate_network_volume
validate_non_checkpoint_paths
install_rclone_if_missing
configure_rclone
prepare_comfyui
resolve_comfyui_python
mkdir -p "$COMFYUI_DIR/custom_nodes" "$LORA_DIR" "$UPSCALE_MODEL_DIR" \
  "$DETAILER_DIR" "$COMFYUI_OUTPUT_DIR"
link_mobile_frontend
sync_gdrive_checkpoints
copy_gdrive_local_models
install_impact_pack
start_output_sync

if [[ ! -x "$START_SCRIPT" ]]; then
  log "start script is not executable: $START_SCRIPT"
  exit 1
fi
exec "$START_SCRIPT"
