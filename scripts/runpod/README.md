# RunPod bootstrap

The RunPod Template clones this repository into
`/workspace/comfyui-mobile-frontend-src` and runs
`scripts/runpod/bootstrap.sh`. The bootstrap keeps RunPod's standard
`/workspace/runpod-slim/ComfyUI` directory hierarchy intact and expects the
official image to provide the baked application at `/opt/comfyui-baked`.

The default `STORAGE_MODE=ephemeral` does not require a Network Volume.
`/workspace` is then an ordinary directory on the Container Disk and is rebuilt
from the baked image, Git, and Google Drive every time the Pod starts. Generated
images and ComfyUI temporary files are also placed on the Container Disk under
`/runpod-local`.

Set `STORAGE_MODE=network` only for the legacy persistent-cache layout. That
mode requires a mounted volume at `/workspace` and keeps the downloaded model
cache and ComfyUI runtime between Pod starts.

To preserve application behavior in ephemeral mode, bootstrap restores the
following from `gdrive:comfyui_state` before ComfyUI starts, then backs it up
every 30 seconds with non-destructive `rclone copy` operations:

- `ComfyUI/user` — workflows, ComfyUI settings, mobile preferences and file
  state, plus web/app push keys, subscriptions and pairing state.
- `ComfyUI/input` — uploaded workflow input files and their aliases.

Ordinary generated output and `output/preset` are deliberately excluded. Use
the mobile viewer's **Save to Google Drive** action for images worth keeping.

## Storage layout

~~~text
Container Disk: /workspace (`STORAGE_MODE=ephemeral`, default)
├── models/
│   └── checkpoints/
│       └── <relative model path>          # downloaded again after Pod stop
└── runpod-slim/
    └── ComfyUI/
        ├── custom_nodes/
        ├── user/
        ├── models/
        │   ├── checkpoints/<relative path>      -> /workspace/models/checkpoints/<relative path>
        │   └── diffusion_models/<relative path> -> /workspace/models/checkpoints/<relative path>
        ├── output -> /runpod-local/output
        └── temp   -> /runpod-local/temp

Container Disk: /runpod-local
├── output/
└── temp/
~~~

`/workspace/runpod-slim` is always a normal directory. Bootstrap never removes
it and never replaces it with a symlink; this preserves compatibility with
RunPod's official `/start.sh`. In ephemeral mode its contents are disposable.

## Canonical workflow

The Git-managed workflow is the source of truth:

~~~text
Git source of truth:
/workspace/comfyui-mobile-frontend-src/src/workflows/mobile_sdxl_default.json
/workspace/comfyui-mobile-frontend-src/src/workflows/mobile_anima_default.json

ComfyUI registered copy:
/workspace/runpod-slim/ComfyUI/user/default/workflows/mobile_sdxl_default.json
/workspace/runpod-slim/ComfyUI/user/default/workflows/mobile_anima_default.json
~~~

At Pod startup, both Git-managed copies are atomically copied into ComfyUI's
workflow directory, so `mobile_sdxl_default` and `mobile_anima_default` are
available directly from the ComfyUI Workflow list. The registered files are
regular files, not symlinks. Only these two canonical files are replaced;
other user workflows are neither changed nor deleted.

Editing and saving the registered copy in ComfyUI does not permanently change
the canonical workflow. It is overwritten by the Git version at the next Pod
startup. To make a permanent change, edit
the appropriate file under `src/workflows/` and commit it to Git.

## RunPod Template bootstrap

~~~bash
#!/usr/bin/env bash
set -Eeuo pipefail

export BOOTSTRAP_STARTED_AT_EPOCH="$(date +%s)"

REPO="https://github.com/nayu-822/comfyui-mobile-frontend.git"
REF="${MOBILE_FRONTEND_REF:-feature/simple-generation-ui}"
BOOT_DIR="/workspace/comfyui-mobile-frontend-src"

rm -rf "${BOOT_DIR}"

git clone \
  --depth 1 \
  --branch "${REF}" \
  "${REPO}" \
  "${BOOT_DIR}"

exec bash "${BOOT_DIR}/scripts/runpod/bootstrap.sh"
~~~

The only directory removed by this Template snippet is the fresh source clone
at `/workspace/comfyui-mobile-frontend-src`; it does not remove
`/workspace/runpod-slim`.

## Google Drive model layout

The Checkpoint field is shared by the SDXL and Anima screens. There is no
required SDXL/Anima classification in Google Drive: all files under
`gdrive:sdxl_model` are downloaded once into the selected storage cache and are
then exposed through both ComfyUI `models/checkpoints` and
`models/diffusion_models` as symlinks.

~~~text
sdxl_model/
├── anima-base-v1.0.safetensors
└── SDXL model files...

anima_text_encoder/
└── qwen_3_06b_base.safetensors

anima_vae/
└── qwen_image_vae.safetensors

sdxl_lora/
sdxl_upscaler/
sdxl_detailer/
~~~

The Anima text encoder and VAE are copied to their native ComfyUI directories
from the two dedicated GDrive paths. Missing Anima files produce explicit
startup warnings, but do not prevent a Pod that can still run SDXL.

## Checkpoint management

`gdrive:sdxl_model` is the source of truth for the available Checkpoint list.
Bootstrap first obtains a recursive manifest for `*.safetensors` and `*.ckpt`.
For every GDrive-relative file path:

1. The cache path is
   `/workspace/models/checkpoints/<relative path>`.
2. A same-name cache is reused when its file size matches the GDrive manifest.
3. New or changed files are downloaded to `.part`, size-checked, and moved
   into place only after a successful download.
4. ComfyUI receives symlinks at both
   `ComfyUI/models/checkpoints/<relative path>` and
   `ComfyUI/models/diffusion_models/<relative path>`, each pointing to the
   same persistent cache file.
5. Stale symlinks created by this cache integration are removed from both
   ComfyUI model directories when they are absent from the current GDrive
   manifest. Old cache files are not automatically deleted.

The second ComfyUI link never downloads or copies the model again. Both loader
folders therefore consume the same cache file, which keeps large Anima and
SDXL model files from consuming duplicate storage.

With the default `STORAGE_MODE=ephemeral`, `/workspace` does not need to be a
mountpoint and all Checkpoints are downloaded to Container Disk at startup.
With `STORAGE_MODE=network`, bootstrap stops unless `/workspace` is a mounted
volume. Legacy regular Checkpoint files found under ComfyUI are moved into the
shared Checkpoint cache when possible; unmanaged leftovers are preserved in a
timestamped migration backup.

## Other model files

Text Encoder, VAE, LoRA, Upscaler, and Detailer files are copied from GDrive
using their extension filters. They live under the ComfyUI tree on `/workspace`.
They are disposable in ephemeral mode and persistent only in network mode.

| GDrive path | ComfyUI destination | Extensions |
| --- | --- | --- |
| `gdrive:anima_text_encoder` | `ComfyUI/models/text_encoders` | `*.safetensors`, `*.pt`, `*.pth` |
| `gdrive:anima_vae` | `ComfyUI/models/vae` | `*.safetensors`, `*.pt`, `*.pth` |
| `gdrive:sdxl_lora` | `ComfyUI/models/loras` | `*.safetensors`, `*.ckpt`, `*.pt` |
| `gdrive:sdxl_upscaler` | `ComfyUI/models/upscale_models` | `*.pth`, `*.pt`, `*.safetensors` |
| `gdrive:sdxl_detailer` | `ComfyUI/models/ultralytics/bbox` | `*.pt`, `*.pth` |

## Output and temp

At every bootstrap, the following directories are created on Container Disk:

~~~bash
mkdir -p /runpod-local/output
mkdir -p /runpod-local/temp
~~~

ComfyUI's normal `output` and `temp` paths are symlinked individually to those
directories. Existing real directories are first copied without overwriting
files already on Container Disk, then moved to a timestamped migration backup;
they are never unconditionally deleted. Existing output is also copied to
Google Drive before migration when output sync is enabled.

Automatic output sync is disabled by default. Set `ENABLE_OUTPUT_SYNC=true` to
start `sync_outputs.sh`, which performs a one-way recursive `rclone copy` from
the physical `/runpod-local/output` directory to `gdrive:sdxl_output`. It never
copies old GDrive images back to the Pod and preserves subdirectories such as
`YYYYMMDD_normal/`, `YYYYMMDD_upscale/`, and `preset/sdxl/` or `preset/anima/`.

The manual **Save to Google Drive** action is independent of this worker. It
continues to upload the selected image to the explicitly entered GDrive folder
when `ENABLE_OUTPUT_SYNC=false`.

### User state and inputs

`ENABLE_STATE_SYNC=true` is independent from output sync and is enabled by
default. Startup restores `gdrive:comfyui_state/user` and
`gdrive:comfyui_state/input` before the Git-managed canonical workflows are
registered. The canonical SDXL and Anima files therefore still come from Git,
while additional user workflows and settings are restored from Google Drive.

During the session, `sync_state.sh` copies newer user-data and input files back
to Google Drive every `STATE_SYNC_INTERVAL_SECONDS` (30 seconds by default).
It uses `rclone copy`, not `rclone sync`, so an empty or partially initialized
Pod cannot delete the backup. Consequently, deleting a workflow or input does
not delete the older Google Drive copy; it can reappear at the next cold start.

Before detaching an existing Network Volume, start the updated bootstrap once
with `STORAGE_MODE=network`, wait for at least one successful state-backup cycle
in `/tmp/comfyui-mobile-state-sync.log`, and only then launch an ephemeral Pod.
This seeds `gdrive:comfyui_state` with the workflows, settings, push state, and
inputs currently stored on the volume.

## ComfyUI Python and custom nodes

When `${COMFYUI_DIR}/.venv-cu128` is missing, bootstrap creates it with
`python3.12 -m venv --system-site-packages`. An existing usable venv is reused;
it is not recreated. Impact Pack, Impact Subpack, and ComfyUI Manager
dependencies are installed with the ComfyUI runtime Python in this order:

1. `${COMFYUI_DIR}/.venv-cu128/bin/python`
2. `python3.12`
3. `python3`

Anima requires a `comfy-kitchen` version exposing
`rms_rope_split_half`. Bootstrap checks this with the ComfyUI runtime Python
and upgrades only `comfy-kitchen` when the feature is missing. The existing
`PIP_CONSTRAINT` remains active during that targeted upgrade.

Impact Pack defaults to ref `Main` and Impact Subpack defaults to ref `main`.
SAM2-related requirements are excluded by default; set
`INSTALL_SAM2_DEPENDENCIES=true` only when needed.

The Git clone at `/workspace/comfyui-mobile-frontend-src` is synchronized into
the real directory
`/workspace/runpod-slim/ComfyUI/custom_nodes/comfyui-mobile-frontend` on every
Pod start. The destination is never a symlink. `.git/` and `node_modules/`
are excluded, while `__init__.py`, Python runtime files, and `dist/` are
copied. An old destination symlink is removed without deleting its target;
an existing regular file or an unsafe destination path stops bootstrap.

### ComfyUI Manager

With `ENABLE_COMFYUI_MANAGER=true` (the default), bootstrap installs the
`comfyui-manager` package into `${COMFYUI_DIR}/.venv-cu128/bin/python` and
also installs `${COMFYUI_DIR}/manager_requirements.txt` when that file exists.
It adds `--enable-manager` exactly once to
`/workspace/runpod-slim/comfyui_args.txt` while preserving all other
arguments. The package and argument file are verified before ComfyUI starts.
An older `ComfyUI/custom_nodes/ComfyUI-Manager` directory, if present, is
left untouched.

The canonical workflow uses two external node types:

- `FaceDetailer` — provided by `ComfyUI-Impact-Pack`.
- `UltralyticsDetectorProvider` — provided by `ComfyUI-Impact-Subpack`.

Both packs are cloned when missing and their requirements are installed with
the same ComfyUI runtime Python. The detailer model
`bbox/face_yolov8m.pt` is copied from `gdrive:sdxl_detailer` when available;
if it is absent, bootstrap logs the missing model and does not substitute an
external model. A best-effort post-start health check polls `/object_info`,
`/mobile/`, and the workflow userdata API for up to 120 seconds.

Bootstrap uses RunPod's `/opt/comfyui-runtime-constraints.txt` as
`PIP_CONSTRAINT` when the file is available. An existing `PIP_CONSTRAINT` is
preserved, and the selected constraint is inherited by the ComfyUI Manager,
Impact Pack, and Impact Subpack dependency installs. If the runtime constraint
file is unavailable, bootstrap logs the condition and continues.

## Environment variables

Required secret:

- `RCLONE_CONFIG_B64` — base64-encoded rclone config, decoded to
  `/tmp/rclone.conf` by default.

Storage:

- `STORAGE_MODE` (default: `ephemeral`; use `network` to require persistent `/workspace`)
- `COMFYUI_DIR` (default: `/workspace/runpod-slim/ComfyUI`)
- `MODEL_CACHE_DIR` (default: `/workspace/models/checkpoints`)
- `NETWORK_CHECKPOINT_DIR` (legacy alias for `MODEL_CACHE_DIR`)
- `CHECKPOINT_DIR` (default: `${COMFYUI_DIR}/models/checkpoints`)
- `DIFFUSION_MODEL_DIR` (default: `${COMFYUI_DIR}/models/diffusion_models`)
- `TEXT_ENCODER_DIR` (default: `${COMFYUI_DIR}/models/text_encoders`)
- `VAE_DIR` (default: `${COMFYUI_DIR}/models/vae`)
- `LOCAL_EPHEMERAL_ROOT` (default: `/runpod-local`)
- `LOCAL_OUTPUT_DIR` (default: `/runpod-local/output`)
- `LOCAL_TEMP_DIR` (default: `/runpod-local/temp`)
- `INPUT_DIR` (default: `${COMFYUI_DIR}/input`)
- `USER_DATA_DIR` (default: `${COMFYUI_DIR}/user`)

GDrive and output worker:

- `RCLONE_REMOTE_NAME` (default: `gdrive`)
- `GDRIVE_MODEL_PATH` (default: `sdxl_model`)
- `GDRIVE_TEXT_ENCODER_PATH` (default: `anima_text_encoder`)
- `GDRIVE_VAE_PATH` (default: `anima_vae`)
- `GDRIVE_LORA_PATH` (default: `sdxl_lora`)
- `GDRIVE_UPSCALER_PATH` (default: `sdxl_upscaler`)
- `GDRIVE_DETAILER_PATH` (default: `sdxl_detailer`)
- `GDRIVE_OUTPUT_PATH` (default: `sdxl_output`)
- `ENABLE_OUTPUT_SYNC` (default: `false`; set to `true`, `1`, `yes`, or `on` to enable automatic output sync)
- `OUTPUT_SYNC_INTERVAL_SECONDS` (default: `60`)
- `OUTPUT_MIN_AGE` (default: `15s`)
- `GDRIVE_STATE_PATH` (default: `comfyui_state`)
- `ENABLE_STATE_SYNC` (default: `true`)
- `SYNC_INPUTS` (default: `true`)
- `STATE_SYNC_INTERVAL_SECONDS` (default: `30`)
- `STATE_SYNC_LOG` (default: `/tmp/comfyui-mobile-state-sync.log`)

Other controls:

- `MOBILE_FRONTEND_REF`
- `BAKED_COMFYUI_DIR` (default: `/opt/comfyui-baked`)
- `MOBILE_FRONTEND_SRC`
- `MOBILE_CUSTOM_NODE_DIR` (default: `${COMFYUI_DIR}/custom_nodes/comfyui-mobile-frontend`)
- `CANONICAL_WORKFLOW_SRC` (default: `${MOBILE_FRONTEND_SRC}/src/workflows/mobile_sdxl_default.json`)
- `COMFYUI_WORKFLOW_DIR` (default: `${COMFYUI_DIR}/user/default/workflows`)
- `COMFYUI_CANONICAL_WORKFLOW` (default: `${COMFYUI_WORKFLOW_DIR}/mobile_sdxl_default.json`)
- `ANIMA_WORKFLOW_SRC` (default: `${MOBILE_FRONTEND_SRC}/src/workflows/mobile_anima_default.json`)
- `COMFYUI_ANIMA_WORKFLOW` (default: `${COMFYUI_WORKFLOW_DIR}/mobile_anima_default.json`)
- `COMFYUI_ARGS_FILE` (default: `${RUNPOD_SLIM_DIR}/comfyui_args.txt`)
- `RUNTIME_PIP_CONSTRAINT_FILE` (default: `/opt/comfyui-runtime-constraints.txt`)
- `ENABLE_COMFYUI_MANAGER` (default: `true`)
- `COMFYUI_MANAGER_PACKAGE` (default: `comfyui-manager`)
- `ENABLE_STARTUP_HEALTH_CHECK` (default: `true`)
- `STARTUP_HEALTH_CHECK_TIMEOUT_SECONDS` (default: `120`)
- `HEALTH_CHECK_LOG` (default: `/tmp/comfyui-mobile-health-check.log`)
- `START_SCRIPT` (default: `/start.sh`)
- `IMPACT_PACK_REF` (default: `Main`)
- `IMPACT_SUBPACK_REF` (default: `main`)
- `INSTALL_CUSTOM_NODE_REQUIREMENTS` (default: `true`)
- `INSTALL_SAM2_DEPENDENCIES` (default: `false`)

The repository contains no rclone credentials.

## Local static checks

The bootstrap contract can be checked without starting ComfyUI or contacting
rclone:

~~~bash
bash scripts/runpod/bootstrap_static_test.sh
~~~

## Measuring cold-start time

Bootstrap logs every major step as `step finished: ... (Ns)`. Immediately
before `/start.sh` it prints the total bootstrap setup time. The background
health check then prints the end-to-end time when ComfyUI, the mobile route,
both canonical workflows, and the required Impact nodes are ready:

~~~text
[runpod] ComfyUI startup ready in 412s from bootstrap start
~~~

The same readiness result is saved to
`/tmp/comfyui-mobile-health-check.log`. Exporting
`BOOTSTRAP_STARTED_AT_EPOCH` before the initial Git clone, as in the template
snippet above, includes clone time in the total.

## Storage verification commands

After an ephemeral bootstrap, these commands verify the intended physical
layout:

~~~bash
test -d /workspace
test "${STORAGE_MODE:-ephemeral}" = ephemeral
test -d /workspace/models/checkpoints
test -d /workspace/runpod-slim
test "$(readlink -f /workspace/runpod-slim/ComfyUI/output)" = /runpod-local/output
test "$(readlink -f /workspace/runpod-slim/ComfyUI/temp)" = /runpod-local/temp
find /workspace/runpod-slim/ComfyUI/models/checkpoints -type l -print
find /workspace/runpod-slim/ComfyUI/models/diffusion_models -type l -print
test "$(readlink -f /workspace/runpod-slim/ComfyUI/models/diffusion_models/anima-base-v1.0.safetensors)" = /workspace/models/checkpoints/anima-base-v1.0.safetensors
test -f /workspace/runpod-slim/ComfyUI/models/text_encoders/qwen_3_06b_base.safetensors
test -f /workspace/runpod-slim/ComfyUI/models/vae/qwen_image_vae.safetensors
find /runpod-local/output -maxdepth 2 -type f -print
find /runpod-local/temp -maxdepth 2 -type f -print
~~~
