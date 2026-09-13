"""Save generated images to an arbitrary path in the configured rclone remote.

The source is always resolved from the local ComfyUI output directory and is
passed to rclone as-is.  In particular, this module never opens the image with
Pillow or otherwise re-encodes it, so ComfyUI's embedded metadata survives the
upload byte-for-byte.
"""

from __future__ import annotations

import ntpath
import os
import posixpath
import subprocess
from urllib.parse import urlsplit

import mobile_presets


class GDriveSaveError(ValueError):
    """A user-facing GDrive-save failure with an HTTP status for the route."""

    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


def _invalid_target(message: str = "Invalid Google Drive path.") -> GDriveSaveError:
    return GDriveSaveError(message, 400)


def normalize_target_path(target_path: object, source_extension: str) -> str:
    """Normalize and validate a Google Drive-root-relative destination path.

    Both slash styles are accepted, repeated separators are collapsed, and the
    result always uses forward slashes.  The path is deliberately validated as
    an application path before it is combined with the trusted rclone remote;
    callers can never provide a remote name or an absolute filesystem path.
    """

    if not isinstance(target_path, str) or not target_path.strip():
        raise _invalid_target("Destination path is required.")
    if "\x00" in target_path or any(ord(character) < 32 for character in target_path):
        raise _invalid_target()

    # Check both path syntaxes regardless of the host OS.  The explicit prefix
    # checks also make the policy clear for slash-only and UNC-like inputs.
    if (
        target_path.startswith(("/", "\\"))
        or posixpath.isabs(target_path)
        or ntpath.isabs(target_path)
    ):
        raise _invalid_target()

    parsed = urlsplit(target_path)
    if parsed.scheme or parsed.netloc or "://" in target_path or ":" in target_path:
        # A colon would allow a Windows drive or an rclone remote prefix.  It
        # is rejected everywhere, including in a later path segment.
        raise _invalid_target()

    normalized = target_path.replace("\\", "/")
    if normalized.endswith("/"):
        raise _invalid_target()

    # Empty segments are harmless only when caused by repeated separators.
    # Leading separators were rejected above, and a trailing separator was
    # rejected above, so filtering here cannot turn an absolute or directory
    # path into an accepted file destination.
    parts = [part for part in normalized.split("/") if part]
    if not parts or any(part in (".", "..") for part in parts):
        raise _invalid_target()

    filename = parts[-1]
    requested_extension = os.path.splitext(filename)[1]
    expected_extension = source_extension.lower()
    if requested_extension:
        if requested_extension.lower() != expected_extension:
            raise _invalid_target(
                "The destination extension must match the source image extension."
            )
    else:
        filename += source_extension
    parts[-1] = filename
    return "/".join(parts)


def _remote_name(configured_name: object = None) -> str:
    name = configured_name
    if name is None:
        name = os.environ.get("RCLONE_REMOTE_NAME", "gdrive")
    if not isinstance(name, str):
        raise GDriveSaveError("Google Drive remote is unavailable.", 500)
    name = name.strip()
    # The remote name is server configuration, not request data.  Still fail
    # closed if a malformed environment value could produce an ambiguous
    # rclone destination.
    if not name or any(character in name for character in (":", "/", "\\")):
        raise GDriveSaveError("Google Drive remote is unavailable.", 500)
    return name


def _resolve_source(relative_path: object, output_root: str | None) -> str:
    try:
        _, source_path, _ = mobile_presets.resolve_source_path(
            relative_path,
            output_root,
        )
        return source_path
    except mobile_presets.PresetSaveError as error:
        message = str(error)
        if message == "Source image not found":
            raise GDriveSaveError("The source image does not exist.", error.status_code) from error
        if message in ("Source must be an image file", "Invalid output path"):
            raise GDriveSaveError("Invalid source image path.", error.status_code) from error
        raise GDriveSaveError(message, error.status_code) from error


def save_to_gdrive(
    relative_path: object,
    target_path: object,
    *,
    output_root: str | None = None,
    remote_name: object = None,
    rclone_bin: str = "rclone",
) -> dict[str, object]:
    """Raw-copy one output image to a GDrive-root-relative path.

    ``--ignore-existing`` prevents a race from overwriting a file created
    after validation.  ``--error-on-no-transfer`` turns that skipped transfer
    into rclone's documented exit code 9, which is exposed as a clear conflict
    response to the client.
    """

    source_path = _resolve_source(relative_path, output_root)
    source_extension = os.path.splitext(os.path.basename(source_path))[1]
    normalized_target = normalize_target_path(target_path, source_extension)
    remote_path = f"{_remote_name(remote_name)}:{normalized_target}"

    try:
        result = subprocess.run(
            [
                rclone_bin,
                "copyto",
                "--no-traverse",
                "--ignore-existing",
                "--error-on-no-transfer",
                source_path,
                remote_path,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, OSError) as error:
        raise GDriveSaveError("Failed to upload to Google Drive.", 500) from error

    if result.returncode == 9:
        raise GDriveSaveError("A file already exists at the destination.", 409)
    if result.returncode != 0:
        raise GDriveSaveError("Failed to upload to Google Drive.", 502)

    return {
        "ok": True,
        "targetPath": normalized_target,
        "remote": remote_path,
    }
