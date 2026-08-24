#!/usr/bin/env bash
set -Eeuo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
RUNPOD_SLIM_DIR="${RUNPOD_SLIM_DIR:-${WORKSPACE_DIR}/runpod-slim}"
COMFYUI_DIR="${COMFYUI_DIR:-${RUNPOD_SLIM_DIR}/ComfyUI}"
BAKED_COMFYUI_DIR="${BAKED_COMFYUI_DIR:-/opt/comfyui-baked}"

MOBILE_FRONTEND_SRC="${MOBILE_FRONTEND_SRC:-${WORKSPACE_DIR}/comfyui-mobile-frontend-src}"
MOBILE_CUSTOM_NODE_DIR="${MOBILE_CUSTOM_NODE_DIR:-${COMFYUI_DIR}/custom_nodes/comfyui-mobile-frontend}"

RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-gdrive}"
RCLONE_CONFIG="${RCLONE_CONFIG:-${RCLONE_CONFIG_PATH:-/tmp/rclone.conf}}"

GDRIVE_MODEL_PATH="${GDRIVE_MODEL_PATH:-sdxl_model}"
GDRIVE_LORA_PATH="${GDRIVE_LORA_PATH:-sdxl_lora}"
GDRIVE_UPSCALER_PATH="${GDRIVE_UPSCALER_PATH:-sdxl_upscaler}"
GDRIVE_DETAILER_PATH="${GDRIVE_DETAILER_PATH:-sdxl_detailer}"
GDRIVE_OUTPUT_PATH="${GDRIVE_OUTPUT_PATH:-sdxl_output}"

NETWORK_CHECKPOINT_DIR="${NETWORK_CHECKPOINT_DIR:-${WORKSPACE_DIR}/models/checkpoints}"
LOCAL_EPHEMERAL_ROOT="${LOCAL_EPHEMERAL_ROOT:-/runpod-local}"
LOCAL_OUTPUT_DIR="${LOCAL_OUTPUT_DIR:-${COMFYUI_OUTPUT_DIR:-${LOCAL_EPHEMERAL_ROOT}/output}}"
LOCAL_TEMP_DIR="${LOCAL_TEMP_DIR:-${LOCAL_EPHEMERAL_ROOT}/temp}"

START_SCRIPT="${START_SCRIPT:-/start.sh}"
OUTPUT_SYNC_LOG="${OUTPUT_SYNC_LOG:-/tmp/comfyui-mobile-output-sync.log}"
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

assert_not_workspace_path() {
  local label="$1"
  local candidate="$2"
  if path_is_within "$candidate" "$WORKSPACE_DIR"; then
    log "$label must stay on Container Disk and must not be under $WORKSPACE_DIR: $candidate"
    exit 1
  fi
}

validate_runpod_storage_layout() {
  command -v realpath >/dev/null 2>&1 || {
    log "realpath is required for storage safety checks"
    exit 1
  }
  command -v mountpoint >/dev/null 2>&1 || {
    log "mountpoint is required to verify the /workspace Network Volume"
    exit 1
  }

  local configured_workspace_dir="$WORKSPACE_DIR"
  local configured_runpod_slim_dir="$RUNPOD_SLIM_DIR"
  local configured_comfyui_dir="$COMFYUI_DIR"
  local configured_checkpoint_dir="$NETWORK_CHECKPOINT_DIR"
  local configured_local_root="$LOCAL_EPHEMERAL_ROOT"
  [[ ! -L "$configured_workspace_dir" ]] || {
    log "$configured_workspace_dir must be a real Network Volume mount path"
    exit 1
  }
  [[ ! -L "$configured_runpod_slim_dir" ]] || {
    log "$configured_runpod_slim_dir must remain a normal directory, not a symlink"
    exit 1
  }
  [[ ! -L "$configured_comfyui_dir" ]] || {
    log "$configured_comfyui_dir must remain a normal directory, not a symlink"
    exit 1
  }
  [[ ! -L "$configured_checkpoint_dir" ]] || {
    log "NETWORK_CHECKPOINT_DIR must not be a symlink: $configured_checkpoint_dir"
    exit 1
  }
  [[ ! -L "$configured_local_root" ]] || {
    log "LOCAL_EPHEMERAL_ROOT must be a real Container Disk directory: $configured_local_root"
    exit 1
  }

  WORKSPACE_DIR="$(resolve_path "$WORKSPACE_DIR")"
  RUNPOD_SLIM_DIR="$(resolve_path "$RUNPOD_SLIM_DIR")"
  COMFYUI_DIR="$(resolve_path "$COMFYUI_DIR")"
  NETWORK_CHECKPOINT_DIR="$(resolve_path "$NETWORK_CHECKPOINT_DIR")"
  LOCAL_EPHEMERAL_ROOT="$(resolve_path "$LOCAL_EPHEMERAL_ROOT")"
  LOCAL_OUTPUT_DIR="$(resolve_path "$LOCAL_OUTPUT_DIR")"
  LOCAL_TEMP_DIR="$(resolve_path "$LOCAL_TEMP_DIR")"

  [[ "$WORKSPACE_DIR" = /* ]] || {
    log "WORKSPACE_DIR must be an absolute path: $WORKSPACE_DIR"
    exit 1
  }
  [[ -d "$WORKSPACE_DIR" ]] && mountpoint -q "$WORKSPACE_DIR" || {
    log "Network Volume is not mounted at $WORKSPACE_DIR"
    exit 1
  }

  [[ ! -L "$RUNPOD_SLIM_DIR" ]] || {
    log "$RUNPOD_SLIM_DIR must remain a normal directory, not a symlink"
    exit 1
  }
  path_is_within "$COMFYUI_DIR" "$RUNPOD_SLIM_DIR" || {
    log "COMFYUI_DIR must stay under $RUNPOD_SLIM_DIR: $COMFYUI_DIR"
    exit 1
  }
  path_is_within "$NETWORK_CHECKPOINT_DIR" "$WORKSPACE_DIR/models/checkpoints" || {
    log "NETWORK_CHECKPOINT_DIR must stay under $WORKSPACE_DIR/models/checkpoints: $NETWORK_CHECKPOINT_DIR"
    exit 1
  }
  [[ ! -L "$NETWORK_CHECKPOINT_DIR" ]] || {
    log "NETWORK_CHECKPOINT_DIR must not be a symlink: $NETWORK_CHECKPOINT_DIR"
    exit 1
  }

  [[ ! -L "$LOCAL_EPHEMERAL_ROOT" ]] || {
    log "LOCAL_EPHEMERAL_ROOT must be a real Container Disk directory: $LOCAL_EPHEMERAL_ROOT"
    exit 1
  }
  assert_not_workspace_path "LOCAL_EPHEMERAL_ROOT" "$LOCAL_EPHEMERAL_ROOT"
  assert_not_workspace_path "LOCAL_OUTPUT_DIR" "$LOCAL_OUTPUT_DIR"
  assert_not_workspace_path "LOCAL_TEMP_DIR" "$LOCAL_TEMP_DIR"
  assert_not_workspace_path "RCLONE_CONFIG" "$RCLONE_CONFIG"
  assert_not_workspace_path "OUTPUT_SYNC_LOG" "$OUTPUT_SYNC_LOG"
  assert_not_workspace_path "START_SCRIPT" "$START_SCRIPT"
  assert_not_workspace_path "BAKED_COMFYUI_DIR" "$BAKED_COMFYUI_DIR"

  path_is_within "$LOCAL_OUTPUT_DIR" "$LOCAL_EPHEMERAL_ROOT" || {
    log "LOCAL_OUTPUT_DIR must stay under LOCAL_EPHEMERAL_ROOT: $LOCAL_OUTPUT_DIR"
    exit 1
  }
  path_is_within "$LOCAL_TEMP_DIR" "$LOCAL_EPHEMERAL_ROOT" || {
    log "LOCAL_TEMP_DIR must stay under LOCAL_EPHEMERAL_ROOT: $LOCAL_TEMP_DIR"
    exit 1
  }
}

log_storage_layout() {
  log "Network Volume checkpoints: $NETWORK_CHECKPOINT_DIR"
  log "ComfyUI: $COMFYUI_DIR"
  log "Local output: $LOCAL_OUTPUT_DIR"
  log "Local temp: $LOCAL_TEMP_DIR"
  log "Google Drive output: ${RCLONE_REMOTE_NAME}:${GDRIVE_OUTPUT_PATH}"
}

prepare_comfyui() {
  [[ ! -L "$RUNPOD_SLIM_DIR" ]] || {
    log "$RUNPOD_SLIM_DIR must remain a normal directory, not a symlink"
    exit 1
  }
  [[ ! -L "$COMFYUI_DIR" ]] || {
    log "$COMFYUI_DIR must remain a normal directory, not a symlink"
    exit 1
  }
  mkdir -p "$RUNPOD_SLIM_DIR" "$COMFYUI_DIR"

  if [[ -f "$COMFYUI_DIR/main.py" ]]; then
    log "using ComfyUI at $COMFYUI_DIR"
    return 0
  fi

  [[ -d "$BAKED_COMFYUI_DIR" ]] || {
    log "baked ComfyUI directory is missing: $BAKED_COMFYUI_DIR"
    exit 1
  }
  log "copying baked ComfyUI contents $BAKED_COMFYUI_DIR -> $COMFYUI_DIR"
  # Never remove COMFYUI_DIR or runpod-slim: RunPod's /start.sh expects the
  # standard directory hierarchy to remain in place.
  cp -a "$BAKED_COMFYUI_DIR"/. "$COMFYUI_DIR"/
  [[ -f "$COMFYUI_DIR/main.py" ]] || {
    log "copied ComfyUI does not contain main.py"
    exit 1
  }
}

ensure_local_ephemeral_dirs() {
  mkdir -p "$LOCAL_EPHEMERAL_ROOT" "$LOCAL_OUTPUT_DIR" "$LOCAL_TEMP_DIR"
  [[ -d "$LOCAL_OUTPUT_DIR" && -d "$LOCAL_TEMP_DIR" ]] || {
    log "could not create local output/temp directories under $LOCAL_EPHEMERAL_ROOT"
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

unique_backup_path() {
  local source_path="$1"
  local backup_path="${source_path}.migrated.$(date -u +%Y%m%d%H%M%S).$$"
  while [[ -e "$backup_path" || -L "$backup_path" ]]; do
    backup_path="${source_path}.migrated.$(date -u +%Y%m%d%H%M%S).$$.${RANDOM}"
  done
  printf '%s' "$backup_path"
}

sync_legacy_output() {
  local source_path="$1"
  if ! is_enabled "$ENABLE_OUTPUT_SYNC"; then
    log "legacy output sync disabled; preserving $source_path locally"
    return 0
  fi

  local remote_path="${RCLONE_REMOTE_NAME}:${GDRIVE_OUTPUT_PATH}"
  log "syncing legacy output $source_path -> $remote_path before migration"
  if ! rclone copy --create-empty-src-dirs "$source_path/" "$remote_path"; then
    log "legacy output sync failed; source will still be preserved at its migration backup"
  fi
}

migrate_storage_directory() {
  local source_path="$1"
  local target_path="$2"
  local label="$3"

  if [[ -L "$source_path" ]]; then
    local current_target expected_target
    current_target="$(readlink -f "$source_path" 2>/dev/null || true)"
    expected_target="$(readlink -f "$target_path" 2>/dev/null || true)"
    if [[ "$current_target" == "$expected_target" ]]; then return 0; fi
    local symlink_backup
    symlink_backup="$(unique_backup_path "$source_path")"
    mv "$source_path" "$symlink_backup"
    log "moved incorrect $label symlink aside to $symlink_backup"
  elif [[ -e "$source_path" ]]; then
    [[ -d "$source_path" ]] || {
      log "$source_path exists but is not a directory"
      exit 1
    }
    if [[ "$label" == "output" ]]; then
      sync_legacy_output "$source_path"
    fi
    log "copying existing $label contents $source_path -> $target_path"
    # -n preserves files already present on the Container Disk.
    cp -a -n -- "$source_path"/. "$target_path"/
    local directory_backup
    directory_backup="$(unique_backup_path "$source_path")"
    mv "$source_path" "$directory_backup"
    log "moved existing $label directory aside to $directory_backup"
  fi

  ln -s "$target_path" "$source_path"
  log "linked $source_path -> $target_path"
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

migrate_legacy_checkpoint_files() {
  [[ ! -L "$CHECKPOINT_DIR" ]] || {
    log "CHECKPOINT_DIR must be a directory, not a symlink: $CHECKPOINT_DIR"
    exit 1
  }
  [[ -d "$CHECKPOINT_DIR" ]] || return 0

  local legacy_file relative_path cache_path
  while IFS= read -r -d '' legacy_file; do
    relative_path="${legacy_file#"$CHECKPOINT_DIR"/}"
    validate_checkpoint_relative_path "$relative_path"
    cache_path="${NETWORK_CHECKPOINT_DIR}/${relative_path}"
    if [[ -e "$cache_path" || -L "$cache_path" ]]; then
      log "preserving existing legacy checkpoint because cache path exists: $legacy_file"
      continue
    fi
    mkdir -p "$(dirname "$cache_path")"
    mv "$legacy_file" "$cache_path"
    log "moved legacy checkpoint $legacy_file -> $cache_path"
  done < <(find "$CHECKPOINT_DIR" -type f -print0)
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

  [[ ! -L "$cache_path" ]] || {
    log "checkpoint cache path must be a regular file, not a symlink: $cache_path"
    exit 1
  }
  if [[ -d "$cache_path" ]]; then
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
    log "CHECKPOINT_DIR must be a directory, not a symlink: $CHECKPOINT_DIR"
    exit 1
  }
  mkdir -p "$CHECKPOINT_DIR"

  local legacy_file
  legacy_file="$(find "$CHECKPOINT_DIR" -type f -print -quit)"
  if [[ -n "$legacy_file" ]]; then
    local backup_dir
    backup_dir="$(unique_backup_path "$CHECKPOINT_DIR")"
    mv "$CHECKPOINT_DIR" "$backup_dir"
    mkdir -p "$CHECKPOINT_DIR"
    log "moved unmanaged local checkpoint directory aside to $backup_dir"
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

  # Obtain the GDrive manifest before using any local checkpoint entry to
  # decide which files ComfyUI should expose.
  mkdir -p "$NETWORK_CHECKPOINT_DIR"
  migrate_legacy_checkpoint_files
  prepare_checkpoint_link_dir

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
  log "configured $count GDrive checkpoints from $NETWORK_CHECKPOINT_DIR"
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
    WORKSPACE_DIR="$WORKSPACE_DIR" \
    COMFYUI_DIR="$COMFYUI_DIR" \
    LOCAL_EPHEMERAL_ROOT="$LOCAL_EPHEMERAL_ROOT" \
    LOCAL_OUTPUT_DIR="$LOCAL_OUTPUT_DIR" \
    LOCAL_TEMP_DIR="$LOCAL_TEMP_DIR" \
    COMFYUI_OUTPUT_DIR="$LOCAL_OUTPUT_DIR" \
    OUTPUT_SYNC_INTERVAL_SECONDS="$OUTPUT_SYNC_INTERVAL_SECONDS" \
    OUTPUT_MIN_AGE="$OUTPUT_MIN_AGE" \
    ENABLE_OUTPUT_SYNC="$ENABLE_OUTPUT_SYNC" \
    bash "$script_dir/sync_outputs.sh" >> "$OUTPUT_SYNC_LOG" 2>&1 &
  log "output sync worker started with pid $!"
}

validate_runpod_storage_layout
ensure_local_ephemeral_dirs
install_rclone_if_missing
configure_rclone
prepare_comfyui
resolve_comfyui_python
mkdir -p "$COMFYUI_DIR/custom_nodes" "$NETWORK_CHECKPOINT_DIR" \
  "$LORA_DIR" "$UPSCALE_MODEL_DIR" "$DETAILER_DIR"
link_mobile_frontend
sync_gdrive_checkpoints
migrate_storage_directory "$COMFYUI_DIR/output" "$LOCAL_OUTPUT_DIR" output
migrate_storage_directory "$COMFYUI_DIR/temp" "$LOCAL_TEMP_DIR" temp
copy_gdrive_local_models
log_storage_layout
install_impact_pack
start_output_sync

if [[ ! -x "$START_SCRIPT" ]]; then
  log "start script is not executable: $START_SCRIPT"
  exit 1
fi
exec "$START_SCRIPT"
