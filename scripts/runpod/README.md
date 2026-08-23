# RunPod bootstrap

The RunPod template should keep only a small bootstrap that checks out the
desired ref and delegates the rest to this repository:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

REPO="https://github.com/nayu-822/comfyui-mobile-frontend.git"
REF="${MOBILE_FRONTEND_REF:-feature/simple-generation-ui}"
BOOT_DIR="/workspace/comfyui-mobile-frontend-src"

rm -rf "${BOOT_DIR}"
git clone --depth 1 --branch "${REF}" "${REPO}" "${BOOT_DIR}"
exec bash "${BOOT_DIR}/scripts/runpod/bootstrap.sh"
```

For release, set `MOBILE_FRONTEND_REF` to `main` or a commit-pinned checkout
policy in the template. Do not put `RCLONE_CONFIG_B64` or any other secret in
this file.

The bootstrap accepts these main environment variables:

- `MOBILE_FRONTEND_REF`, `MOBILE_FRONTEND_REPO`, `MOBILE_FRONTEND_SRC`
- `COMFYUI_DIR`, `COMFYUI_REPO`, `COMFYUI_REF`, `COMFYUI_PYTHON`, `START_SCRIPT`
- `RCLONE_CONFIG_B64`, `RCLONE_CONFIG_PATH`, `RCLONE_REMOTE_NAME`
- `GDRIVE_CHECKPOINT_PATH`, `GDRIVE_LORA_PATH`, `GDRIVE_UPSCALE_PATH`
- `GDRIVE_FACE_DETECTOR_PATH` or `FACE_DETECTOR_URL`
- `GDRIVE_OUTPUT_PATH`, `ENABLE_OUTPUT_SYNC`, `OUTPUT_SYNC_INTERVAL_SECONDS`, `OUTPUT_MIN_AGE`
- `CHECKPOINT_URL`, `CHECKPOINT_LOCAL_PATH`, `CHECKPOINT_FILENAME`
- `IMPACT_PACK_REPO`, `IMPACT_SUBPACK_REPO`, `INSTALL_CUSTOM_NODE_REQUIREMENTS`

`sync_outputs.sh` copies `ComfyUI/output/` recursively to
`gdrive:${GDRIVE_OUTPUT_PATH}` without classifying the generated filenames.
