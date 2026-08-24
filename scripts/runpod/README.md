# RunPod bootstrap

The RunPod Template clones this repository into
`/workspace/comfyui-mobile-frontend-src` and runs
`scripts/runpod/bootstrap.sh`. The bootstrap expects the official ComfyUI
image to provide the baked application at `/opt/comfyui-baked`.

The Network Volume is reserved exclusively for SDXL base Checkpoint caches.
LoRA, Upscaler, Detailer, output files, the frontend, and custom nodes remain
on the Pod local filesystem. The bootstrap fails if the Network Volume is not
mounted at the expected path or if any protected local path is configured
under it.

## Layout

~~~text
GDrive:
sdxl_model/
sdxl_lora/
sdxl_upscaler/
sdxl_detailer/
sdxl_output/

Network Volume:
/network-models/
└─ checkpoints/

ComfyUI:
models/
├─ checkpoints/       -> symlinks to Network Volume Checkpoints
├─ loras/             -> Pod local
├─ upscale_models/    -> Pod local
└─ ultralytics/bbox/  -> Pod local

output/               -> Pod local, one-way copy to GDrive
~~~

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

For release deployment, set `MOBILE_FRONTEND_REF` to `main` or a
commit-pinned ref. Do not put `RCLONE_CONFIG_B64` or any other secret in the
repository.

## Checkpoint management

`gdrive:sdxl_model` is the source of truth for the available Checkpoint list.
Bootstrap first obtains a recursive GDrive file manifest for `*.safetensors`
and `*.ckpt`; it never enumerates the Network Volume to decide which models
ComfyUI should expose.

For every GDrive-relative file path:

1. A same-name Network Volume cache is reused only when its file size matches.
2. New or changed files are copied to a `.part` file and atomically moved into
   place after the downloaded size matches the GDrive manifest.
3. `ComfyUI/models/checkpoints/<relative path>` is symlinked to the cache.
4. Stale ComfyUI Checkpoint symlinks are removed when they are absent from the
   current GDrive manifest. Old cache files on the Network Volume are not
   automatically deleted.

If `/network-models` is not a mounted Network Volume, bootstrap stops instead
of copying all Checkpoints into Pod local storage.

## Pod-local model copies

The following files are copied directly from GDrive to the Pod-local ComfyUI
directories. None of these destinations may be under `/network-models`.

| GDrive path | Local destination | Extensions |
| --- | --- | --- |
| `gdrive:sdxl_lora` | `ComfyUI/models/loras` | `*.safetensors`, `*.ckpt`, `*.pt` |
| `gdrive:sdxl_upscaler` | `ComfyUI/models/upscale_models` | `*.pth`, `*.pt`, `*.safetensors` |
| `gdrive:sdxl_detailer` | `ComfyUI/models/ultralytics/bbox` | `*.pt`, `*.pth` |

## Output copy

`sync_outputs.sh` runs one-way `rclone copy` from the Pod-local
`ComfyUI/output/` to `gdrive:sdxl_output/output/`. It never copies old GDrive
images back to the Pod, and it does not classify, delete, or flatten files.
The frontend's existing `YYYYMMDD_normal/` and `YYYYMMDD_upscale/` folders are
therefore preserved.

## ComfyUI Python and custom nodes

Impact Pack and Impact Subpack requirements are installed with the first
available Python in this order:

1. `${COMFYUI_DIR}/.venv-cu128/bin/python`
2. `python3.12`
3. `python3`

Impact Pack defaults to ref `Main` and Impact Subpack defaults to ref `main`.
SAM2-related requirements are excluded by default; set
`INSTALL_SAM2_DEPENDENCIES=true` only when they are needed.

The existing Template clone is linked to
`ComfyUI/custom_nodes/comfyui-mobile-frontend`. Bootstrap requires
`dist/index.html` and safely moves an existing real directory aside before
creating the symlink.

## Environment variables

Required secret:

- `RCLONE_CONFIG_B64` — base64-encoded rclone config, decoded to
  `/tmp/rclone.conf` by default.

GDrive and Network Volume:

- `RCLONE_REMOTE_NAME` (default: `gdrive`)
- `GDRIVE_MODEL_PATH` (default: `sdxl_model`)
- `GDRIVE_LORA_PATH` (default: `sdxl_lora`)
- `GDRIVE_UPSCALER_PATH` (default: `sdxl_upscaler`)
- `GDRIVE_DETAILER_PATH` (default: `sdxl_detailer`)
- `NETWORK_MODEL_ROOT` (default: `/network-models`)
- `NETWORK_CHECKPOINT_DIR` (default: `/network-models/checkpoints`)
- `GDRIVE_OUTPUT_PATH` (default: `sdxl_output/output`)

Output worker:

- `ENABLE_OUTPUT_SYNC` (default: `true`)
- `OUTPUT_SYNC_INTERVAL_SECONDS` (default: `60`)
- `OUTPUT_MIN_AGE` (default: `15s`)
- `COMFYUI_OUTPUT_DIR` (default: `${COMFYUI_DIR}/output`)

Other controls:

- `MOBILE_FRONTEND_REF`
- `COMFYUI_DIR` (default: `/workspace/runpod-slim/ComfyUI`)
- `BAKED_COMFYUI_DIR` (default: `/opt/comfyui-baked`)
- `MOBILE_FRONTEND_SRC`
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
