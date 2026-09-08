"""Server-side saving of generated images as reusable mobile presets.

Preset files are deliberately copied as bytes.  ComfyUI stores the workflow
and prompt in image metadata, so opening and saving an image with an image
library here would silently discard the very data that makes a preset useful.
"""

from __future__ import annotations

import json
import ntpath
import os
import posixpath
import shutil
from urllib.parse import urlsplit


IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif")
PRESET_MODES = ("sdxl", "anima")


class PresetSaveError(ValueError):
    """A user-facing preset-save failure with an HTTP status for the route."""

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


def get_output_root(output_root: str | None = None) -> str:
    """Return the physical ComfyUI output root used by preset saves.

    RunPod exports ``LOCAL_OUTPUT_DIR`` to the ComfyUI process.  The regular
    ComfyUI path remains the fallback so the endpoint also works outside
    RunPod.  Resolving the root once makes containment checks operate on the
    same physical tree as the source and destination.
    """

    configured = output_root or os.environ.get("LOCAL_OUTPUT_DIR")
    configured = configured or os.environ.get("COMFYUI_OUTPUT_DIR")
    if not configured:
        try:
            import folder_paths

            configured = folder_paths.get_output_directory()
        except Exception as error:
            raise PresetSaveError("Output directory is unavailable", 500) from error
    return os.path.realpath(os.path.abspath(configured))


def _is_within(base_dir: str, target_path: str) -> bool:
    """Return whether ``target_path`` is the base or below it."""

    try:
        return os.path.commonpath((base_dir, target_path)) == base_dir
    except ValueError:
        # Different Windows drives (or malformed paths) cannot be contained.
        return False


def _normalize_relative_path(relative_path: object) -> str:
    if not isinstance(relative_path, str) or not relative_path:
        raise PresetSaveError("Invalid output path", 400)
    if "\x00" in relative_path:
        raise PresetSaveError("Invalid output path", 400)

    # The API accepts the forward-slash paths returned by /mobile/api/files.
    # Reject both POSIX and Windows absolute-path forms even when the server
    # happens to be running on the other operating system.
    if (
        relative_path.startswith(("/", "\\"))
        or posixpath.isabs(relative_path)
        or ntpath.isabs(relative_path)
    ):
        raise PresetSaveError("Invalid output path", 403)

    parsed = urlsplit(relative_path)
    if parsed.scheme or parsed.netloc or "://" in relative_path:
        raise PresetSaveError("Invalid output path", 403)

    normalized = relative_path.replace("\\", "/")
    parts = normalized.split("/")
    # Reject rather than normalize dot segments.  This keeps the request's
    # contract unambiguous and prevents alternate spellings of an output path.
    if any(part in ("", ".", "..") for part in parts):
        raise PresetSaveError("Invalid output path", 403)
    return "/".join(parts)


def resolve_source_path(
    relative_path: object,
    output_root: str | None = None,
) -> tuple[str, str, str]:
    """Validate an output-relative path and return ``(root, real_file, rel)``."""

    root = get_output_root(output_root)
    relative = _normalize_relative_path(relative_path)
    candidate = os.path.abspath(os.path.join(root, *relative.split("/")))
    resolved = os.path.realpath(candidate)

    # This catches both ``../`` variants and symlinks that point outside the
    # output tree.  The explicit relative-path check above keeps the error
    # clear for traversal requests; this is the final physical-path boundary.
    if not _is_within(root, resolved) or resolved == root:
        raise PresetSaveError("Invalid output path", 403)
    if not os.path.exists(candidate):
        raise PresetSaveError("Source image not found", 404)
    if not os.path.isfile(candidate):
        raise PresetSaveError("Source must be an image file", 400)
    if os.path.splitext(resolved)[1].lower() not in IMAGE_EXTENSIONS:
        raise PresetSaveError("Source must be an image file", 400)
    return root, resolved, relative


def _decode_metadata_value(value: object) -> object:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return value
    return value


def _normalize_mode(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    mode = value.strip().lower()
    return mode if mode in PRESET_MODES else None


def _find_mode(value: object, depth: int = 0) -> str | None:
    """Find the mobile workflow kind in nested ComfyUI metadata.

    ``workflow`` is normally a JSON string containing a canvas workflow whose
    ``extra.mobile_generation_profile.workflowKind`` field is authoritative.
    The recursive fallback also handles prompt/extra_pnginfo layouts produced by
    older ComfyUI writers without treating an arbitrary node input as a mode.
    """

    if depth > 20:
        return None
    value = _decode_metadata_value(value)
    if isinstance(value, str):
        return _normalize_mode(value)
    if isinstance(value, list):
        for item in value:
            found = _find_mode(item, depth + 1)
            if found:
                return found
        return None
    if not isinstance(value, dict):
        return None

    for key in (
        "workflowKind",
        "workflow_kind",
        "generationMode",
        "generation_mode",
    ):
        found = _normalize_mode(_decode_metadata_value(value.get(key)))
        if found:
            return found

    # Prefer the metadata containers used by ComfyUI and this extension before
    # walking arbitrary values.  In particular, this avoids a future custom
    # node's unrelated ``mode: "sdxl"`` input becoming authoritative.
    preferred_keys = (
        "mobile_generation_profile",
        "extra",
        "extra_pnginfo",
        "workflow",
        "Workflow",
        "prompt",
        "Prompt",
        "workflow_v2",
    )
    visited: set[str] = set()
    for key in preferred_keys:
        if key not in value:
            continue
        visited.add(key)
        found = _find_mode(value[key], depth + 1)
        if found:
            return found
    for key, item in value.items():
        if key in visited:
            continue
        found = _find_mode(item, depth + 1)
        if found:
            return found
    return None


def detect_mode_from_image(image_path: str) -> str | None:
    """Read a generated image's embedded workflow and return its mobile mode."""

    try:
        from PIL import Image

        with Image.open(image_path) as image:
            metadata = dict(image.info)
            text = getattr(image, "text", None)
            if isinstance(text, dict):
                metadata.update(text)
    except Exception:
        # A valid image without readable generation metadata can still be saved
        # when the caller supplies the current generation mode.
        return None

    for key in ("workflow", "Workflow", "prompt", "Prompt", "extra_pnginfo"):
        found = _find_mode(metadata.get(key))
        if found:
            return found
    return _find_mode(metadata)


def _ensure_destination_directory(root: str, mode: str) -> str:
    preset_root = os.path.join(root, "preset")
    mode_root = os.path.join(preset_root, mode)
    for directory in (preset_root, mode_root):
        # Do not follow a pre-existing link for a write destination, even when
        # it happens to point back inside output.  This keeps the two allowed
        # destination trees explicit and makes symlink races fail closed.
        if os.path.lexists(directory) and os.path.islink(directory):
            raise PresetSaveError("Invalid preset destination", 403)
        try:
            os.makedirs(directory, exist_ok=True)
        except OSError as error:
            raise PresetSaveError("Unable to create preset directory", 500) from error
        resolved = os.path.realpath(directory)
        if not _is_within(root, resolved) or resolved == root:
            raise PresetSaveError("Invalid preset destination", 403)
        if not os.path.isdir(directory):
            raise PresetSaveError("Invalid preset destination", 403)
    return mode_root


def _copy_raw_without_overwrite(source_path: str, destination_dir: str) -> str:
    basename = os.path.basename(source_path)
    stem, extension = os.path.splitext(basename)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY

    # O_EXCL is important here: checking exists() and then copy2() would allow
    # two simultaneous mobile clients to overwrite each other's preset.
    for suffix in range(0, 10000):
        candidate_name = basename if suffix == 0 else f"{stem}__{suffix}{extension}"
        candidate_path = os.path.join(destination_dir, candidate_name)
        file_descriptor = None
        try:
            file_descriptor = os.open(candidate_path, flags, 0o644)
        except FileExistsError:
            continue
        except OSError as error:
            raise PresetSaveError("Unable to create preset file", 500) from error

        try:
            with open(source_path, "rb") as source_handle, os.fdopen(
                file_descriptor, "wb"
            ) as destination_handle:
                file_descriptor = None
                shutil.copyfileobj(source_handle, destination_handle)
                destination_handle.flush()
                os.fsync(destination_handle.fileno())
            # File metadata is not required for ComfyUI restore; this best
            # effort stat copy keeps timestamps/mode friendly without changing
            # the image bytes or making a metadata-copy failure lose the save.
            try:
                shutil.copystat(source_path, candidate_path, follow_symlinks=False)
            except OSError:
                pass
            return candidate_name
        except Exception as error:
            if file_descriptor is not None:
                try:
                    os.close(file_descriptor)
                except OSError:
                    pass
            try:
                os.remove(candidate_path)
            except OSError:
                pass
            if isinstance(error, PresetSaveError):
                raise
            raise PresetSaveError("Unable to copy source image", 500) from error

    raise PresetSaveError("Unable to create a unique preset filename", 500)


def save_preset(
    relative_path: object,
    requested_mode: object = None,
    *,
    output_root: str | None = None,
) -> dict[str, object]:
    """Raw-copy one output image into ``preset/{sdxl,anima}``."""

    root, source_path, _ = resolve_source_path(relative_path, output_root)
    caller_mode = _normalize_mode(requested_mode)
    if requested_mode is not None and caller_mode is None:
        raise PresetSaveError("Unsupported image mode", 400)

    # Image metadata wins over the mode of the currently open UI.  A stale
    # Generation tab therefore cannot put an Outputs image in the wrong tree.
    mode = detect_mode_from_image(source_path) or caller_mode
    if mode is None:
        raise PresetSaveError("Unsupported image mode", 400)

    destination_dir = _ensure_destination_directory(root, mode)
    destination_name = _copy_raw_without_overwrite(source_path, destination_dir)
    return {
        "ok": True,
        "mode": mode,
        "relativePath": f"preset/{mode}/{destination_name}",
    }
