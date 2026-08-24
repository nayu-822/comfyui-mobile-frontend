# RunPod bootstrap

The RunPod Template clones this repository into
`/workspace/comfyui-mobile-frontend-src` and runs
`scripts/runpod/bootstrap.sh`. The bootstrap expects the official ComfyUI
image to provide the baked application at `/opt/comfyui-baked`.

It copies the baked application to `/workspace/runpod-slim/ComfyUI`, installs
the two Impact custom nodes, copies all configured model files from Google
Drive, links the frontend custom node, starts one-way output copying, and
finally execs `/start.sh`.

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

## Model copies

All model copies are one-way from Google Drive to local ComfyUI directories.

| GDrive path | Local destination | Extensions |
| --- | --- | --- |
| `gdrive:sdxl_model` | `ComfyUI/models/checkpoints` | `*.safetensors`, `*.ckpt` |
| `gdrive:sdxl_lora` | `ComfyUI/models/loras` | `*.safetensors`, `*.ckpt`, `*.pt` |
| `gdrive:sdxl_upscaler` | `ComfyUI/models/upscale_models` | `*.pth`, `*.pt`, `*.safetensors` |
| `gdrive:sdxl_detailer` | `ComfyUI/models/ultralytics/bbox` | `*.pt`, `*.pth` |

## Output copy

`sync_outputs.sh` runs one-way `rclone copy` from `ComfyUI/output/` to
`gdrive:sdxl_output/output/`. It does not classify filenames or delete
remote files, so the frontend's normal/upscale folders are copied unchanged.

## Environment variables

Required secret:

- `RCLONE_CONFIG_B64` — base64-encoded rclone config, decoded to
  `/tmp/rclone.conf`.

Main configuration:

- `MOBILE_FRONTEND_REF`
- `RCLONE_REMOTE_NAME` (default: `gdrive`)
- `GDRIVE_MODEL_PATH` (default: `sdxl_model`)
- `GDRIVE_LORA_PATH` (default: `sdxl_lora`)
- `GDRIVE_UPSCALER_PATH` (default: `sdxl_upscaler`)
- `GDRIVE_DETAILER_PATH` (default: `sdxl_detailer`)
- `GDRIVE_OUTPUT_PATH` (default: `sdxl_output/output`)
- `ENABLE_OUTPUT_SYNC` (default: `true`)
- `OUTPUT_SYNC_INTERVAL_SECONDS` (default: `60`)
- `OUTPUT_MIN_AGE` (default: `15s`)

Optional controls:

- `COMFYUI_DIR`, `BAKED_COMFYUI_DIR`, `MOBILE_FRONTEND_SRC`
- `COMFYUI_OUTPUT_DIR`, `START_SCRIPT`, `COMFYUI_PYTHON`
- `IMPACT_PACK_REF` (default: `Main`)
- `IMPACT_SUBPACK_REF` (default: `main`)
- `INSTALL_CUSTOM_NODE_REQUIREMENTS` (default: `true`)
- `INSTALL_SAM2_DEPENDENCIES` (default: `false`)

The repository contains no rclone credentials.
