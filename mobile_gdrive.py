"""Save generated images to an arbitrary folder in the configured rclone remote.

The source is always resolved from the local ComfyUI output directory and is
passed to rclone as-is.  In particular, this module never opens the image with
Pillow or otherwise re-encodes it, so ComfyUI's embedded metadata survives the
upload byte-for-byte.
"""

from __future__ import annotations

import ntpath
import os
import posixpath
import re
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


def normalize_target_folder(target_folder: object) -> str:
    """Normalize and validate a Google Drive-root-relative destination folder.

    Both slash styles are accepted, repeated separators are collapsed, and the
    result always uses forward slashes.  The path is deliberately validated as
    an application path before it is combined with the trusted rclone remote;
    callers can never provide a remote name or an absolute filesystem path.
    """

    if not isinstance(target_folder, str) or not target_folder.strip():
        raise _invalid_target("Destination folder is required.")
    if "\x00" in target_folder or any(ord(character) < 32 for character in target_folder):
        raise _invalid_target()

    # Check both path syntaxes regardless of the host OS.  The explicit prefix
    # checks also make the policy clear for slash-only and UNC-like inputs.
    if (
        target_folder.startswith(("/", "\\"))
        or posixpath.isabs(target_folder)
        or ntpath.isabs(target_folder)
    ):
        raise _invalid_target()

    parsed = urlsplit(target_folder)
    if parsed.scheme or parsed.netloc or "://" in target_folder or ":" in target_folder:
        # A colon would allow a Windows drive or an rclone remote prefix.  It
        # is rejected everywhere, including in a later path segment.
        raise _invalid_target()

    normalized = target_folder.replace("\\", "/")
    # Empty segments are harmless when caused by repeated or trailing
    # separators.  Leading separators were rejected above, so filtering here
    # cannot turn an absolute path into an accepted folder.
    parts = [part for part in normalized.split("/") if part]
    if not parts or any(part in (".", "..") for part in parts):
        raise _invalid_target()
    return "/".join(parts)


def _next_filename(file_names: list[str], source_extension: str) -> str:
    """Return the next zero-padded filename for the source extension."""

    pattern = re.compile(
        rf"^([0-9]{{3,}}){re.escape(source_extension)}$",
        re.IGNORECASE,
    )
    highest = -1
    for file_name in file_names:
        match = pattern.fullmatch(file_name)
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{highest + 1:03d}{source_extension}"


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


def _list_remote_files(remote_folder: str, rclone_bin: str) -> list[str]:
    """List direct files in a remote folder without recursing."""

    try:
        result = subprocess.run(
            [
                rclone_bin,
                "lsf",
                "--files-only",
                "--max-depth",
                "1",
                remote_folder,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, OSError) as error:
        raise GDriveSaveError("Failed to inspect destination folder.", 500) from error

    if result.returncode != 0:
        # Google Drive does not require an explicit directory object.  A
        # not-yet-created folder can therefore be treated as empty; copyto
        # will create it when the upload succeeds.  Other failures must stop
        # before choosing a name because the existing-number set is unknown.
        error_text = f"{result.stdout}\n{result.stderr}".lower()
        if any(
            marker in error_text
            for marker in (
                "directory not found",
                "directory does not exist",
                "path does not exist",
            )
        ):
            return []
        raise GDriveSaveError("Failed to inspect destination folder.", 502)

    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def save_to_gdrive(
    relative_path: object,
    target_folder: object,
    *,
    output_root: str | None = None,
    remote_name: object = None,
    rclone_bin: str = "rclone",
) -> dict[str, object]:
    """Raw-copy one output image to a GDrive-root-relative auto-numbered path.

    ``--ignore-existing`` prevents a race from overwriting a file created
    after validation.  ``--error-on-no-transfer`` turns that skipped transfer
    into rclone's documented exit code 9, which is exposed as a clear conflict
    response to the client.
    """

    source_path = _resolve_source(relative_path, output_root)
    source_extension = os.path.splitext(os.path.basename(source_path))[1]
    normalized_folder = normalize_target_folder(target_folder)
    remote = _remote_name(remote_name)
    remote_folder = f"{remote}:{normalized_folder}"
    existing_files = _list_remote_files(remote_folder, rclone_bin)
    filename = _next_filename(existing_files, source_extension)
    normalized_target = f"{normalized_folder}/{filename}"
    remote_path = f"{remote}:{normalized_target}"

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
        "targetFolder": normalized_folder,
        "filename": filename,
        "targetPath": normalized_target,
        "remote": remote_path,
    }
