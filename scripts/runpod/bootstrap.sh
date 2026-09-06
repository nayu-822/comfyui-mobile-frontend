#!/usr/bin/env bash
set -Eeuo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
RUNPOD_SLIM_DIR="${RUNPOD_SLIM_DIR:-${WORKSPACE_DIR}/runpod-slim}"
COMFYUI_DIR="${COMFYUI_DIR:-${RUNPOD_SLIM_DIR}/ComfyUI}"
BAKED_COMFYUI_DIR="${BAKED_COMFYUI_DIR:-/opt/comfyui-baked}"

MOBILE_FRONTEND_SRC="${MOBILE_FRONTEND_SRC:-${WORKSPACE_DIR}/comfyui-mobile-frontend-src}"
MOBILE_CUSTOM_NODE_DIR="${MOBILE_CUSTOM_NODE_DIR:-${COMFYUI_DIR}/custom_nodes/comfyui-mobile-frontend}"
CANONICAL_WORKFLOW_SRC="${CANONICAL_WORKFLOW_SRC:-${MOBILE_FRONTEND_SRC}/src/workflows/mobile_sdxl_default.json}"
COMFYUI_WORKFLOW_DIR="${COMFYUI_WORKFLOW_DIR:-${COMFYUI_DIR}/user/default/workflows}"
COMFYUI_CANONICAL_WORKFLOW="${COMFYUI_CANONICAL_WORKFLOW:-${COMFYUI_WORKFLOW_DIR}/mobile_sdxl_default.json}"
ANIMA_WORKFLOW_SRC="${ANIMA_WORKFLOW_SRC:-${MOBILE_FRONTEND_SRC}/src/workflows/mobile_anima_default.json}"
COMFYUI_ANIMA_WORKFLOW="${COMFYUI_ANIMA_WORKFLOW:-${COMFYUI_WORKFLOW_DIR}/mobile_anima_default.json}"

RCLONE_REMOTE_NAME="${RCLONE_REMOTE_NAME:-gdrive}"
RCLONE_CONFIG="${RCLONE_CONFIG:-${RCLONE_CONFIG_PATH:-/tmp/rclone.conf}}"

GDRIVE_MODEL_PATH="${GDRIVE_MODEL_PATH:-sdxl_model}"
GDRIVE_TEXT_ENCODER_PATH="${GDRIVE_TEXT_ENCODER_PATH:-anima_text_encoder}"
GDRIVE_VAE_PATH="${GDRIVE_VAE_PATH:-anima_vae}"
GDRIVE_LORA_PATH="${GDRIVE_LORA_PATH:-sdxl_lora}"
GDRIVE_UPSCALER_PATH="${GDRIVE_UPSCALER_PATH:-sdxl_upscaler}"
GDRIVE_DETAILER_PATH="${GDRIVE_DETAILER_PATH:-sdxl_detailer}"
GDRIVE_OUTPUT_PATH="${GDRIVE_OUTPUT_PATH:-sdxl_output}"

NETWORK_CHECKPOINT_DIR="${NETWORK_CHECKPOINT_DIR:-${WORKSPACE_DIR}/models/checkpoints}"
LOCAL_EPHEMERAL_ROOT="${LOCAL_EPHEMERAL_ROOT:-/runpod-local}"
LOCAL_OUTPUT_DIR="${LOCAL_OUTPUT_DIR:-${COMFYUI_OUTPUT_DIR:-${LOCAL_EPHEMERAL_ROOT}/output}}"
LOCAL_TEMP_DIR="${LOCAL_TEMP_DIR:-${LOCAL_EPHEMERAL_ROOT}/temp}"

START_SCRIPT="${START_SCRIPT:-/start.sh}"
COMFYUI_ARGS_FILE="${COMFYUI_ARGS_FILE:-${RUNPOD_SLIM_DIR}/comfyui_args.txt}"
RUNTIME_PIP_CONSTRAINT_FILE="${RUNTIME_PIP_CONSTRAINT_FILE:-/opt/comfyui-runtime-constraints.txt}"
OUTPUT_SYNC_LOG="${OUTPUT_SYNC_LOG:-/tmp/comfyui-mobile-output-sync.log}"
ENABLE_OUTPUT_SYNC="${ENABLE_OUTPUT_SYNC:-true}"
OUTPUT_SYNC_INTERVAL_SECONDS="${OUTPUT_SYNC_INTERVAL_SECONDS:-60}"
OUTPUT_MIN_AGE="${OUTPUT_MIN_AGE:-15s}"

ENABLE_COMFYUI_MANAGER="${ENABLE_COMFYUI_MANAGER:-true}"
COMFYUI_MANAGER_PACKAGE="${COMFYUI_MANAGER_PACKAGE:-comfyui-manager}"
ENABLE_STARTUP_HEALTH_CHECK="${ENABLE_STARTUP_HEALTH_CHECK:-true}"
STARTUP_HEALTH_CHECK_TIMEOUT_SECONDS="${STARTUP_HEALTH_CHECK_TIMEOUT_SECONDS:-120}"
HEALTH_CHECK_LOG="${HEALTH_CHECK_LOG:-/tmp/comfyui-mobile-health-check.log}"

INSTALL_CUSTOM_NODE_REQUIREMENTS="${INSTALL_CUSTOM_NODE_REQUIREMENTS:-true}"
INSTALL_SAM2_DEPENDENCIES="${INSTALL_SAM2_DEPENDENCIES:-false}"
IMPACT_PACK_DIR="${IMPACT_PACK_DIR:-${COMFYUI_DIR}/custom_nodes/ComfyUI-Impact-Pack}"
IMPACT_SUBPACK_DIR="${IMPACT_SUBPACK_DIR:-${COMFYUI_DIR}/custom_nodes/ComfyUI-Impact-Subpack}"
IMPACT_PACK_REF="${IMPACT_PACK_REF:-Main}"
IMPACT_SUBPACK_REF="${IMPACT_SUBPACK_REF:-main}"

CHECKPOINT_DIR="${CHECKPOINT_DIR:-${COMFYUI_DIR}/models/checkpoints}"
DIFFUSION_MODEL_DIR="${DIFFUSION_MODEL_DIR:-${COMFYUI_DIR}/models/diffusion_models}"
TEXT_ENCODER_DIR="${TEXT_ENCODER_DIR:-${COMFYUI_DIR}/models/text_encoders}"
VAE_DIR="${VAE_DIR:-${COMFYUI_DIR}/models/vae}"
LORA_DIR="${LORA_DIR:-${COMFYUI_DIR}/models/loras}"
UPSCALE_MODEL_DIR="${UPSCALE_MODEL_DIR:-${COMFYUI_DIR}/models/upscale_models}"
DETAILER_DIR="${DETAILER_DIR:-${COMFYUI_DIR}/models/ultralytics/bbox}"

ANIMA_MODEL_FILENAME="anima-base-v1.0.safetensors"
ANIMA_TEXT_ENCODER_FILENAME="qwen_3_06b_base.safetensors"
ANIMA_VAE_FILENAME="qwen_image_vae.safetensors"

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
  local configured_model_dir
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
  for configured_model_dir in \
    "$CHECKPOINT_DIR" \
    "$DIFFUSION_MODEL_DIR" \
    "$TEXT_ENCODER_DIR" \
    "$VAE_DIR"; do
    [[ ! -L "$configured_model_dir" ]] || {
      log "ComfyUI model directory must not be a symlink: $configured_model_dir"
      exit 1
    }
  done
  [[ ! -L "$configured_local_root" ]] || {
    log "LOCAL_EPHEMERAL_ROOT must be a real Container Disk directory: $configured_local_root"
    exit 1
  }

  WORKSPACE_DIR="$(resolve_path "$WORKSPACE_DIR")"
  RUNPOD_SLIM_DIR="$(resolve_path "$RUNPOD_SLIM_DIR")"
  COMFYUI_DIR="$(resolve_path "$COMFYUI_DIR")"
  NETWORK_CHECKPOINT_DIR="$(resolve_path "$NETWORK_CHECKPOINT_DIR")"
  CHECKPOINT_DIR="$(resolve_path "$CHECKPOINT_DIR")"
  DIFFUSION_MODEL_DIR="$(resolve_path "$DIFFUSION_MODEL_DIR")"
  TEXT_ENCODER_DIR="$(resolve_path "$TEXT_ENCODER_DIR")"
  VAE_DIR="$(resolve_path "$VAE_DIR")"
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

  local comfyui_models_root="${COMFYUI_DIR}/models"
  for configured_model_dir in \
    "$CHECKPOINT_DIR" \
    "$DIFFUSION_MODEL_DIR" \
    "$TEXT_ENCODER_DIR" \
    "$VAE_DIR"; do
    path_is_within "$configured_model_dir" "$comfyui_models_root" || {
      log "ComfyUI model directory must stay under $comfyui_models_root: $configured_model_dir"
      exit 1
    }
    [[ ! -L "$configured_model_dir" ]] || {
      log "ComfyUI model directory must not be a symlink: $configured_model_dir"
      exit 1
    }
  done

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
  log "ComfyUI checkpoint links: $CHECKPOINT_DIR"
  log "ComfyUI diffusion model links: $DIFFUSION_MODEL_DIR"
  log "ComfyUI text encoders: $TEXT_ENCODER_DIR"
  log "ComfyUI VAEs: $VAE_DIR"
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

configure_runtime_pip_constraints() {
  if [[ -n "${PIP_CONSTRAINT:-}" ]]; then
    export PIP_CONSTRAINT
    log "using existing pip constraint: $PIP_CONSTRAINT"
    return 0
  fi

  if [[ -f "$RUNTIME_PIP_CONSTRAINT_FILE" ]]; then
    export PIP_CONSTRAINT="$RUNTIME_PIP_CONSTRAINT_FILE"
    log "using RunPod runtime pip constraints: $PIP_CONSTRAINT"
  else
    log "RunPod runtime pip constraint file is not available: $RUNTIME_PIP_CONSTRAINT_FILE"
  fi
}

ensure_comfyui_runtime_venv() {
  local venv_dir="${COMFYUI_DIR}/.venv-cu128"
  local venv_python="${venv_dir}/bin/python"
  if [[ -x "$venv_python" ]]; then
    log "using existing ComfyUI runtime venv: $venv_dir"
    return 0
  fi

  if [[ -e "$venv_dir" || -L "$venv_dir" ]]; then
    log "ComfyUI runtime venv exists but is incomplete: $venv_dir"
    exit 1
  fi
  command -v python3.12 >/dev/null 2>&1 || {
    log "python3.12 is required to create the ComfyUI runtime venv: $venv_dir"
    exit 1
  }

  log "creating ComfyUI runtime venv: $venv_dir"
  python3.12 -m venv --system-site-packages "$venv_dir"
  [[ -x "$venv_python" ]] || {
    log "ComfyUI runtime venv Python was not created: $venv_python"
    exit 1
  }
  if ! "$venv_python" -m pip --version >/dev/null 2>&1; then
    "$venv_python" -m ensurepip --upgrade
  fi
  "$venv_python" -m pip --version >/dev/null 2>&1 || {
    log "ComfyUI runtime venv has no usable pip: $venv_python"
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

ensure_comfy_kitchen_for_anima() {
  [[ -n "$COMFYUI_PYTHON" ]] || {
    log "ComfyUI Python is not resolved; cannot verify comfy-kitchen Anima support"
    exit 1
  }

  if "$COMFYUI_PYTHON" - <<'PY'
import comfy_kitchen
raise SystemExit(
    0 if hasattr(comfy_kitchen, "rms_rope_split_half") else 1
)
PY
  then
    log "comfy-kitchen supports rms_rope_split_half"
    return 0
  fi

  log "comfy-kitchen is missing rms_rope_split_half; upgrading"
  if ! "$COMFYUI_PYTHON" -m pip install -U comfy-kitchen; then
    log "comfy-kitchen upgrade failed; Anima support cannot be verified"
    exit 1
  fi

  if ! "$COMFYUI_PYTHON" - <<'PY'
import comfy_kitchen
raise SystemExit(
    0 if hasattr(comfy_kitchen, "rms_rope_split_half") else 1
)
PY
  then
    log "comfy-kitchen upgrade completed but rms_rope_split_half is still missing"
    exit 1
  fi
  log "verified comfy-kitchen Anima support"
}

ensure_comfyui_manager() {
  if ! is_enabled "$ENABLE_COMFYUI_MANAGER"; then
    log "ComfyUI Manager installation disabled"
    return 0
  fi

  if [[ -f "$COMFYUI_DIR/manager_requirements.txt" ]]; then
    log "installing ComfyUI Manager requirements with $COMFYUI_PYTHON"
    if ! "$COMFYUI_PYTHON" -m pip install -r "$COMFYUI_DIR/manager_requirements.txt"; then
      log "ComfyUI Manager installation failed"
      exit 1
    fi
  fi

  log "installing $COMFYUI_MANAGER_PACKAGE with $COMFYUI_PYTHON"
  if ! "$COMFYUI_PYTHON" -m pip install -U --pre "$COMFYUI_MANAGER_PACKAGE"; then
    log "ComfyUI Manager installation failed"
    exit 1
  fi
  "$COMFYUI_PYTHON" -m pip show "$COMFYUI_MANAGER_PACKAGE" >/dev/null 2>&1 || {
    log "ComfyUI Manager installation failed"
    exit 1
  }
  log "ComfyUI Manager package is installed"
}

configure_comfyui_manager_args() {
  if ! is_enabled "$ENABLE_COMFYUI_MANAGER"; then return 0; fi

  mkdir -p "$(dirname -- "$COMFYUI_ARGS_FILE")"
  [[ ! -d "$COMFYUI_ARGS_FILE" ]] || {
    log "ComfyUI args path is a directory: $COMFYUI_ARGS_FILE"
    exit 1
  }
  touch "$COMFYUI_ARGS_FILE"
  if ! grep -Eq '^[[:space:]]*--enable-manager([[:space:]]|$)' "$COMFYUI_ARGS_FILE"; then
    printf '%s\n' '--enable-manager' >> "$COMFYUI_ARGS_FILE"
  fi
  log "ComfyUI Manager enabled via $COMFYUI_ARGS_FILE"
}

verify_comfyui_manager_install() {
  if ! is_enabled "$ENABLE_COMFYUI_MANAGER"; then return 0; fi

  "$COMFYUI_PYTHON" -m pip show "$COMFYUI_MANAGER_PACKAGE" >/dev/null 2>&1 || {
    log "ComfyUI Manager installation failed"
    exit 1
  }
  if [[ ! -f "$COMFYUI_ARGS_FILE" ]] || \
    ! grep -Eq '^[[:space:]]*--enable-manager([[:space:]]|$)' "$COMFYUI_ARGS_FILE"; then
    log "--enable-manager is missing from $COMFYUI_ARGS_FILE"
    exit 1
  fi
  log "ComfyUI Manager installation verified"
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

is_managed_checkpoint_link() {
  local link_path="$1"
  [[ ! -e "$link_path" ]] && return 0
  local target_path
  target_path="$(readlink -- "$link_path" 2>/dev/null || true)"
  [[ -n "$target_path" ]] || return 1
  if [[ "$target_path" != /* ]]; then
    target_path="$(dirname -- "$link_path")/$target_path"
  fi
  path_is_within "$target_path" "$NETWORK_CHECKPOINT_DIR"
}

prepare_model_link_dir() {
  local model_dir="$1"
  local label="$2"
  [[ ! -L "$model_dir" ]] || {
    log "$label directory must be a directory, not a symlink: $model_dir"
    exit 1
  }
  mkdir -p "$model_dir"

  local stale_link
  while IFS= read -r -d '' stale_link; do
    if is_managed_checkpoint_link "$stale_link"; then
      log "removing stale $label link $stale_link"
      rm -f -- "$stale_link"
    fi
  done < <(find "$model_dir" -type l -print0)
  find "$model_dir" -depth -mindepth 1 -type d -empty -delete
}

prepare_checkpoint_link_dir() {
  prepare_model_link_dir "$CHECKPOINT_DIR" "checkpoint"
  prepare_model_link_dir "$DIFFUSION_MODEL_DIR" "diffusion model"
}

link_cached_model() {
  local relative_path="$1"
  local model_dir="$2"
  local label="$3"
  local cache_path="${NETWORK_CHECKPOINT_DIR}/${relative_path}"
  local link_path="${model_dir}/${relative_path}"
  mkdir -p "$(dirname "$link_path")"

  [[ -f "$cache_path" && ! -L "$cache_path" ]] || {
    log "checkpoint cache file is missing or is not regular: $cache_path"
    exit 1
  }

  if [[ -L "$link_path" ]]; then
    local current_target cache_target
    current_target="$(readlink -f "$link_path" 2>/dev/null || true)"
    cache_target="$(resolve_path "$cache_path")"
    if [[ "$current_target" == "$cache_target" ]]; then return 0; fi
    rm -f -- "$link_path"
    log "replacing incorrect $label link $link_path"
  elif [[ -d "$link_path" ]]; then
    log "$label link path is a directory: $link_path"
    exit 1
  elif [[ -e "$link_path" ]]; then
    local backup_path
    backup_path="$(unique_backup_path "$link_path")"
    mv -- "$link_path" "$backup_path"
    log "moved existing $label model aside to $backup_path"
  fi
  ln -s "$cache_path" "$link_path"
  log "linked $link_path -> $cache_path"
}

link_checkpoint() {
  local relative_path="$1"
  link_cached_model "$relative_path" "$CHECKPOINT_DIR" "checkpoint"
  link_cached_model "$relative_path" "$DIFFUSION_MODEL_DIR" "diffusion model"
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
  if ! copy_gdrive_extensions "$GDRIVE_TEXT_ENCODER_PATH" "$TEXT_ENCODER_DIR" \
    '*.safetensors' '*.pt' '*.pth'; then
    log "warning: could not sync Anima text encoder from ${RCLONE_REMOTE_NAME}:${GDRIVE_TEXT_ENCODER_PATH}; continuing"
  fi
  if ! copy_gdrive_extensions "$GDRIVE_VAE_PATH" "$VAE_DIR" \
    '*.safetensors' '*.pt' '*.pth'; then
    log "warning: could not sync Anima VAE from ${RCLONE_REMOTE_NAME}:${GDRIVE_VAE_PATH}; continuing"
  fi
  copy_gdrive_extensions "$GDRIVE_LORA_PATH" "$LORA_DIR" \
    '*.safetensors' '*.ckpt' '*.pt'
  copy_gdrive_extensions "$GDRIVE_UPSCALER_PATH" "$UPSCALE_MODEL_DIR" \
    '*.pth' '*.pt' '*.safetensors'
  copy_gdrive_extensions "$GDRIVE_DETAILER_PATH" "$DETAILER_DIR" \
    '*.pt' '*.pth'
}

verify_anima_model_files() {
  local anima_model_path="${DIFFUSION_MODEL_DIR}/${ANIMA_MODEL_FILENAME}"
  local anima_text_encoder_path="${TEXT_ENCODER_DIR}/${ANIMA_TEXT_ENCODER_FILENAME}"
  local anima_vae_path="${VAE_DIR}/${ANIMA_VAE_FILENAME}"

  if [[ -f "$anima_model_path" ]]; then
    log "Anima model is available from diffusion_models: $anima_model_path"
  else
    log "warning: Anima model is missing from diffusion_models: $anima_model_path"
  fi
  if [[ -f "$anima_text_encoder_path" ]]; then
    log "Anima text encoder is available from text_encoders: $anima_text_encoder_path"
  else
    log "warning: Anima text encoder is missing from text_encoders: $anima_text_encoder_path"
  fi
  if [[ -f "$anima_vae_path" ]]; then
    log "Anima VAE is available from vae: $anima_vae_path"
  else
    log "warning: Anima VAE is missing from vae: $anima_vae_path"
  fi
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
  if ! clone_if_missing "$IMPACT_PACK_DIR" \
    "${IMPACT_PACK_REPO:-https://github.com/ltdrdata/ComfyUI-Impact-Pack.git}" \
    "$IMPACT_PACK_REF"; then
    log "ComfyUI-Impact-Pack installation failed"
    exit 1
  fi
  if ! clone_if_missing "$IMPACT_SUBPACK_DIR" \
    "${IMPACT_SUBPACK_REPO:-https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git}" \
    "$IMPACT_SUBPACK_REF"; then
    log "ComfyUI-Impact-Subpack installation failed"
    exit 1
  fi

  if ! is_enabled "$INSTALL_CUSTOM_NODE_REQUIREMENTS"; then return 0; fi
  if ! install_impact_requirements "$IMPACT_PACK_DIR/requirements.txt"; then
    log "ComfyUI-Impact-Pack requirements installation failed"
    exit 1
  fi
  if ! install_impact_requirements "$IMPACT_SUBPACK_DIR/requirements.txt"; then
    log "ComfyUI-Impact-Subpack requirements installation failed"
    exit 1
  fi
}

verify_required_custom_node_files() {
  [[ -d "$IMPACT_PACK_DIR" && ! -L "$IMPACT_PACK_DIR" ]] || {
    log "required custom node directory is missing: $IMPACT_PACK_DIR"
    exit 1
  }
  [[ -f "$IMPACT_PACK_DIR/__init__.py" ]] || {
    log "ComfyUI-Impact-Pack __init__.py is missing: $IMPACT_PACK_DIR/__init__.py"
    exit 1
  }
  [[ -d "$IMPACT_SUBPACK_DIR" && ! -L "$IMPACT_SUBPACK_DIR" ]] || {
    log "required custom node directory is missing: $IMPACT_SUBPACK_DIR"
    exit 1
  }
  [[ -f "$IMPACT_SUBPACK_DIR/__init__.py" ]] || {
    log "ComfyUI-Impact-Subpack __init__.py is missing: $IMPACT_SUBPACK_DIR/__init__.py"
    exit 1
  }
  log "required custom node pack present for FaceDetailer: $IMPACT_PACK_DIR"
  log "required custom node pack present for UltralyticsDetectorProvider: $IMPACT_SUBPACK_DIR"

  local face_model="${DETAILER_DIR}/face_yolov8m.pt"
  if [[ -f "$face_model" ]]; then
    log "FaceDetailer model is available: $face_model"
  else
    log "FaceDetailer model is missing: $face_model (expected from ${RCLONE_REMOTE_NAME}:${GDRIVE_DETAILER_PATH})"
  fi
}

start_post_start_health_check() {
  if ! is_enabled "$ENABLE_STARTUP_HEALTH_CHECK"; then
    log "post-start health check disabled"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1; then
    log "post-start health check skipped: curl is not available"
    return 0
  fi
  [[ "$STARTUP_HEALTH_CHECK_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || {
    log "post-start health check timeout is invalid: $STARTUP_HEALTH_CHECK_TIMEOUT_SECONDS"
    return 0
  }

  mkdir -p "$(dirname -- "$HEALTH_CHECK_LOG")"
  (
    health_deadline=$((SECONDS + STARTUP_HEALTH_CHECK_TIMEOUT_SECONDS))
    health_base_url="http://127.0.0.1:8188"
    health_object_info=""
    health_workflow_data=""
    health_mobile_status=""

    while (( SECONDS < health_deadline )); do
      health_object_info="$(curl --fail --silent --max-time 5 \
        "$health_base_url/object_info" 2>/dev/null || true)"
      health_mobile_status="$(curl --silent --location --output /dev/null \
        --write-out '%{http_code}' --max-time 5 \
        "$health_base_url/mobile/" 2>/dev/null || true)"
      health_workflow_data="$(curl --fail --silent --max-time 5 \
        "$health_base_url/api/userdata?dir=workflows&recurse=true&split=false&full_info=true" \
        2>/dev/null || true)"

      if [[ "$health_mobile_status" == 2?? ]] && \
        grep -Fq '"FaceDetailer"' <<<"$health_object_info" && \
        grep -Fq '"UltralyticsDetectorProvider"' <<<"$health_object_info" && \
        grep -Fq 'mobile_sdxl_default.json' <<<"$health_workflow_data" && \
        grep -Fq 'mobile_anima_default.json' <<<"$health_workflow_data"; then
        log "required node available: FaceDetailer"
        log "required node available: UltralyticsDetectorProvider"
        log "mobile frontend route is available: /mobile/"
        log "SDXL and Anima canonical workflows are available"
        exit 0
      fi
      sleep 2
    done

    if grep -Fq '"FaceDetailer"' <<<"$health_object_info"; then
      log "required node available: FaceDetailer"
    else
      log "required node missing after startup: FaceDetailer"
    fi
    if grep -Fq '"UltralyticsDetectorProvider"' <<<"$health_object_info"; then
      log "required node available: UltralyticsDetectorProvider"
    else
      log "required node missing after startup: UltralyticsDetectorProvider"
    fi
    if [[ "$health_mobile_status" == 2?? ]]; then
      log "mobile frontend route is available: /mobile/"
    else
      log "mobile frontend route is unavailable after startup: /mobile/ (HTTP $health_mobile_status)"
    fi
    if grep -Fq 'mobile_sdxl_default.json' <<<"$health_workflow_data"; then
      log "SDXL canonical workflow is available"
    else
      log "SDXL canonical workflow is unavailable after startup"
    fi
    if grep -Fq 'mobile_anima_default.json' <<<"$health_workflow_data"; then
      log "Anima canonical workflow is available"
    else
      log "Anima canonical workflow is unavailable after startup"
    fi
    log "post-start health check timed out after ${STARTUP_HEALTH_CHECK_TIMEOUT_SECONDS}s"
  ) >> "$HEALTH_CHECK_LOG" 2>&1 &
  log "post-start health check worker started with pid $!"
}

validate_mobile_frontend_destination() {
  local custom_nodes_root="${COMFYUI_DIR}/custom_nodes"
  local custom_nodes_root_real
  custom_nodes_root_real="$(resolve_path "$custom_nodes_root")"

  local destination_parent destination_name destination_parent_real
  destination_parent="$(dirname -- "$MOBILE_CUSTOM_NODE_DIR")"
  destination_name="$(basename -- "$MOBILE_CUSTOM_NODE_DIR")"
  destination_parent_real="$(resolve_path "$destination_parent")"
  if [[ "$destination_name" == "." || "$destination_name" == ".." ]] || \
    ! path_is_within "$destination_parent_real" "$custom_nodes_root_real"; then
    log "MOBILE_CUSTOM_NODE_DIR must stay under COMFYUI_DIR/custom_nodes: $MOBILE_CUSTOM_NODE_DIR"
    exit 1
  fi

  local source_lexical destination_lexical
  source_lexical="$(resolve_path "$(dirname -- "$MOBILE_FRONTEND_SRC")")/$(basename -- "$MOBILE_FRONTEND_SRC")"
  destination_lexical="${destination_parent_real}/${destination_name}"
  [[ "$source_lexical" != "$destination_lexical" ]] || {
    log "MOBILE_FRONTEND_SRC and MOBILE_CUSTOM_NODE_DIR must not be the same path: $MOBILE_CUSTOM_NODE_DIR"
    exit 1
  }
}

verify_mobile_frontend_install() {
  [[ -d "$MOBILE_CUSTOM_NODE_DIR" && ! -L "$MOBILE_CUSTOM_NODE_DIR" ]] || {
    log "mobile frontend custom node is not a regular directory: $MOBILE_CUSTOM_NODE_DIR"
    exit 1
  }
  [[ -f "$MOBILE_CUSTOM_NODE_DIR/__init__.py" ]] || {
    log "installed mobile frontend __init__.py is missing: $MOBILE_CUSTOM_NODE_DIR/__init__.py"
    exit 1
  }
  [[ -f "$MOBILE_CUSTOM_NODE_DIR/dist/index.html" ]] || {
    log "installed mobile frontend dist/index.html is missing: $MOBILE_CUSTOM_NODE_DIR/dist/index.html"
    exit 1
  }
}

sync_mobile_frontend() {
  local source_dir="$1"
  local destination_dir="$2"
  mkdir -p "$destination_dir"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude='.git/' \
      --exclude='node_modules/' \
      "$source_dir/" \
      "$destination_dir/"
    return 0
  fi

  log "rsync is not available; copying mobile frontend files without deleting excluded paths"
  local entry
  while IFS= read -r -d '' entry; do
    cp -a -- "$entry" "$destination_dir/"
  done < <(find "$source_dir" -mindepth 1 -maxdepth 1 \
    ! -name '.git' ! -name 'node_modules' -print0)
}

install_mobile_frontend() {
  [[ -d "$MOBILE_FRONTEND_SRC" ]] || {
    log "mobile frontend source is missing: $MOBILE_FRONTEND_SRC"
    exit 1
  }
  [[ -f "$MOBILE_FRONTEND_SRC/__init__.py" ]] || {
    log "mobile frontend __init__.py is missing: $MOBILE_FRONTEND_SRC/__init__.py"
    exit 1
  }
  [[ -f "$MOBILE_FRONTEND_SRC/dist/index.html" ]] || {
    log "mobile frontend dist/index.html is missing: $MOBILE_FRONTEND_SRC/dist/index.html"
    exit 1
  }
  validate_mobile_frontend_destination

  if [[ -L "$MOBILE_CUSTOM_NODE_DIR" ]]; then
    rm -f -- "$MOBILE_CUSTOM_NODE_DIR"
    log "removed existing mobile frontend symlink: $MOBILE_CUSTOM_NODE_DIR"
  elif [[ -e "$MOBILE_CUSTOM_NODE_DIR" && ! -d "$MOBILE_CUSTOM_NODE_DIR" ]]; then
    log "mobile frontend destination exists but is not a directory: $MOBILE_CUSTOM_NODE_DIR"
    exit 1
  fi

  local source_real destination_real
  source_real="$(resolve_path "$MOBILE_FRONTEND_SRC")"
  destination_real="$(resolve_path "$MOBILE_CUSTOM_NODE_DIR")"
  [[ "$source_real" != "$destination_real" ]] || {
    log "MOBILE_FRONTEND_SRC and MOBILE_CUSTOM_NODE_DIR must not resolve to the same path: $MOBILE_CUSTOM_NODE_DIR"
    exit 1
  }

  sync_mobile_frontend "$MOBILE_FRONTEND_SRC" "$MOBILE_CUSTOM_NODE_DIR"
  verify_mobile_frontend_install
  log "installed mobile frontend custom node: $MOBILE_CUSTOM_NODE_DIR"
}

register_canonical_workflow() {
  [[ -f "$CANONICAL_WORKFLOW_SRC" ]] || {
    log "canonical workflow is missing: $CANONICAL_WORKFLOW_SRC"
    exit 1
  }

  mkdir -p "$COMFYUI_WORKFLOW_DIR"
  [[ ! -d "$COMFYUI_CANONICAL_WORKFLOW" ]] || {
    log "canonical workflow destination is a directory: $COMFYUI_CANONICAL_WORKFLOW"
    exit 1
  }

  local temp_path="${COMFYUI_CANONICAL_WORKFLOW}.tmp.$$"
  rm -f -- "$temp_path"
  cp -- "$CANONICAL_WORKFLOW_SRC" "$temp_path"
  mv -f -- "$temp_path" "$COMFYUI_CANONICAL_WORKFLOW"
  [[ -f "$COMFYUI_CANONICAL_WORKFLOW" && ! -L "$COMFYUI_CANONICAL_WORKFLOW" ]] || {
    log "canonical workflow destination is not a regular file: $COMFYUI_CANONICAL_WORKFLOW"
    exit 1
  }
  log "registered canonical workflow: $COMFYUI_CANONICAL_WORKFLOW"
}

register_anima_workflow() {
  [[ -f "$ANIMA_WORKFLOW_SRC" ]] || {
    log "Anima canonical workflow is missing: $ANIMA_WORKFLOW_SRC"
    exit 1
  }

  mkdir -p "$COMFYUI_WORKFLOW_DIR"
  [[ ! -d "$COMFYUI_ANIMA_WORKFLOW" ]] || {
    log "Anima canonical workflow destination is a directory: $COMFYUI_ANIMA_WORKFLOW"
    exit 1
  }

  local temp_path="${COMFYUI_ANIMA_WORKFLOW}.tmp.$$"
  rm -f -- "$temp_path"
  cp -- "$ANIMA_WORKFLOW_SRC" "$temp_path"
  mv -f -- "$temp_path" "$COMFYUI_ANIMA_WORKFLOW"
  [[ -f "$COMFYUI_ANIMA_WORKFLOW" && ! -L "$COMFYUI_ANIMA_WORKFLOW" ]] || {
    log "Anima canonical workflow destination is not a regular file: $COMFYUI_ANIMA_WORKFLOW"
    exit 1
  }
  log "registered Anima canonical workflow: $COMFYUI_ANIMA_WORKFLOW"
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

bootstrap_main() {
  validate_runpod_storage_layout
  ensure_local_ephemeral_dirs
  install_rclone_if_missing
  configure_rclone
  prepare_comfyui
  configure_runtime_pip_constraints
  ensure_comfyui_runtime_venv
  resolve_comfyui_python
  ensure_comfyui_manager
  configure_comfyui_manager_args
  mkdir -p "$COMFYUI_DIR/custom_nodes" "$NETWORK_CHECKPOINT_DIR" \
    "$CHECKPOINT_DIR" "$DIFFUSION_MODEL_DIR" "$TEXT_ENCODER_DIR" "$VAE_DIR" \
    "$LORA_DIR" "$UPSCALE_MODEL_DIR" "$DETAILER_DIR"
  install_mobile_frontend
  register_canonical_workflow
  register_anima_workflow
  sync_gdrive_checkpoints
  migrate_storage_directory "$COMFYUI_DIR/output" "$LOCAL_OUTPUT_DIR" output
  migrate_storage_directory "$COMFYUI_DIR/temp" "$LOCAL_TEMP_DIR" temp
  copy_gdrive_local_models
  verify_anima_model_files
  log_storage_layout
  install_impact_pack
  verify_mobile_frontend_install
  verify_comfyui_manager_install
  verify_required_custom_node_files
  ensure_comfy_kitchen_for_anima

  if [[ ! -x "$START_SCRIPT" ]]; then
    log "start script is not executable: $START_SCRIPT"
    exit 1
  fi
  start_output_sync
  start_post_start_health_check
  exec "$START_SCRIPT"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  bootstrap_main "$@"
fi
