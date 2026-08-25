# RunPod bootstrap

The RunPod Template clones this repository into
`/workspace/comfyui-mobile-frontend-src` and runs
`scripts/runpod/bootstrap.sh`. The bootstrap keeps RunPod's standard
`/workspace/runpod-slim/ComfyUI` directory hierarchy intact and expects the
official image to provide the baked application at `/opt/comfyui-baked`.

`/workspace` is the Network Volume. Only persistent data belongs there. New
generated images and ComfyUI temporary files are placed on the Container Disk
under `/runpod-local`.

## Storage layout

~~~text
Network Volume: /workspace
├── models/
│   └── checkpoints/
│       └── *.safetensors / *.ckpt
└── runpod-slim/
    └── ComfyUI/
        ├── custom_nodes/
        ├── user/
        ├── models/
        ├── output -> /runpod-local/output
        └── temp   -> /runpod-local/temp

Container Disk: /runpod-local
├── output/
└── temp/
~~~

`/workspace/runpod-slim` is always a normal directory. Bootstrap never removes
it and never replaces it with a symlink; this preserves compatibility with
RunPod's official `/start.sh`.

## Canonical workflow

The Git-managed workflow is the source of truth:

~~~text
Git source of truth:
/workspace/comfyui-mobile-frontend-src/src/workflows/mobile_sdxl_default.json

ComfyUI registered copy:
/workspace/runpod-slim/ComfyUI/user/default/workflows/mobile_sdxl_default.json
~~~

At Pod startup, the Git-managed copy is atomically copied into ComfyUI's
workflow directory, so `mobile_sdxl_default` is available directly from the
ComfyUI Workflow list. The registered file is a regular file, not a symlink.
Only `mobile_sdxl_default.json` is replaced; other user workflows are neither
changed nor deleted.

Editing and saving the registered copy in ComfyUI does not permanently change
the canonical workflow. It is overwritten by the Git version at the next Pod
startup. To make a permanent change, edit
`src/workflows/mobile_sdxl_default.json` and commit it to Git.

## RunPod Template bootstrap

~~~bash
#!/usr/bin/env bash
set -Eeuo pipefail

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

## Checkpoint management

`gdrive:sdxl_model` is the source of truth for the available Checkpoint list.
Bootstrap first obtains a recursive manifest for `*.safetensors` and `*.ckpt`.
For every GDrive-relative file path:

1. The persistent cache path is
   `/workspace/models/checkpoints/<relative path>`.
2. A same-name cache is reused when its file size matches the GDrive manifest.
3. New or changed files are downloaded to `.part`, size-checked, and moved
   into place only after a successful download.
4. ComfyUI receives a symlink at
   `ComfyUI/models/checkpoints/<relative path>` pointing to the persistent
   cache.
5. Stale ComfyUI Checkpoint symlinks are removed when they are absent from the
   current GDrive manifest. Old cache files are not automatically deleted.

If `/workspace` is not mounted as a Network Volume, bootstrap stops instead of
copying Checkpoints to Container Disk. Legacy regular Checkpoint files found
under ComfyUI are moved into the persistent Checkpoint area when possible;
unmanaged leftovers are preserved in a timestamped migration backup.

## Other model files

LoRA, Upscaler, and Detailer files continue to be copied from GDrive using
their existing extension filters. They are persistent model files under the
ComfyUI tree on `/workspace`; only output and temp are redirected to the
Container Disk.

| GDrive path | ComfyUI destination | Extensions |
| --- | --- | --- |
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

`sync_outputs.sh` performs one-way `rclone copy` from the physical
`/runpod-local/output` directory to `gdrive:sdxl_output`. It never copies old
GDrive images back to the Pod and preserves subdirectories such as
`YYYYMMDD_normal/` and `YYYYMMDD_upscale/`.

## ComfyUI Python and custom nodes

When `${COMFYUI_DIR}/.venv-cu128` is missing, bootstrap creates it with
`python3.12 -m venv --system-site-packages`. An existing usable venv is reused;
it is not recreated. Impact Pack, Impact Subpack, and ComfyUI Manager
dependencies are installed with the ComfyUI runtime Python in this order:

1. `${COMFYUI_DIR}/.venv-cu128/bin/python`
2. `python3.12`
3. `python3`

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

## Environment variables

Required secret:

- `RCLONE_CONFIG_B64` — base64-encoded rclone config, decoded to
  `/tmp/rclone.conf` by default.

Storage:

- `COMFYUI_DIR` (default: `/workspace/runpod-slim/ComfyUI`)
- `NETWORK_CHECKPOINT_DIR` (default: `/workspace/models/checkpoints`)
- `LOCAL_EPHEMERAL_ROOT` (default: `/runpod-local`)
- `LOCAL_OUTPUT_DIR` (default: `/runpod-local/output`)
- `LOCAL_TEMP_DIR` (default: `/runpod-local/temp`)

GDrive and output worker:

- `RCLONE_REMOTE_NAME` (default: `gdrive`)
- `GDRIVE_MODEL_PATH` (default: `sdxl_model`)
- `GDRIVE_LORA_PATH` (default: `sdxl_lora`)
- `GDRIVE_UPSCALER_PATH` (default: `sdxl_upscaler`)
- `GDRIVE_DETAILER_PATH` (default: `sdxl_detailer`)
- `GDRIVE_OUTPUT_PATH` (default: `sdxl_output`)
- `ENABLE_OUTPUT_SYNC` (default: `true`)
- `OUTPUT_SYNC_INTERVAL_SECONDS` (default: `60`)
- `OUTPUT_MIN_AGE` (default: `15s`)

Other controls:

- `MOBILE_FRONTEND_REF`
- `BAKED_COMFYUI_DIR` (default: `/opt/comfyui-baked`)
- `MOBILE_FRONTEND_SRC`
- `MOBILE_CUSTOM_NODE_DIR` (default: `${COMFYUI_DIR}/custom_nodes/comfyui-mobile-frontend`)
- `CANONICAL_WORKFLOW_SRC` (default: `${MOBILE_FRONTEND_SRC}/src/workflows/mobile_sdxl_default.json`)
- `COMFYUI_WORKFLOW_DIR` (default: `${COMFYUI_DIR}/user/default/workflows`)
- `COMFYUI_CANONICAL_WORKFLOW` (default: `${COMFYUI_WORKFLOW_DIR}/mobile_sdxl_default.json`)
- `COMFYUI_ARGS_FILE` (default: `${RUNPOD_SLIM_DIR}/comfyui_args.txt`)
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

## Storage verification commands

After bootstrap, these commands verify the intended physical layout:

~~~bash
mountpoint /workspace
test -d /workspace/models/checkpoints
test -d /workspace/runpod-slim
test "$(readlink -f /workspace/runpod-slim/ComfyUI/output)" = /runpod-local/output
test "$(readlink -f /workspace/runpod-slim/ComfyUI/temp)" = /runpod-local/temp
find /workspace/runpod-slim/ComfyUI/models/checkpoints -type l -print
find /runpod-local/output -maxdepth 2 -type f -print
find /runpod-local/temp -maxdepth 2 -type f -print
~~~
