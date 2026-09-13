from pathlib import Path
import subprocess

import pytest

import mobile_gdrive as gdrive


@pytest.fixture
def output_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "output"
    root.mkdir()
    monkeypatch.setenv("LOCAL_OUTPUT_DIR", str(root))
    return root


def _write_source(root: Path, relative: str = "20260913_normal/render.png") -> Path:
    source = root / relative
    source.parent.mkdir(parents=True, exist_ok=True)
    # The implementation must not inspect or rewrite these bytes.
    source.write_bytes(b"PNG bytes with ComfyUI metadata")
    return source


def _mock_rclone(
    monkeypatch: pytest.MonkeyPatch,
    *,
    listing: str = "",
    list_returncode: int = 0,
    list_stderr: str = "",
    upload_returncode: int = 0,
):
    calls = []

    def run(args, **kwargs):
        calls.append((args, kwargs))
        if args[1] == "lsf":
            return subprocess.CompletedProcess(
                args,
                list_returncode,
                stdout=listing,
                stderr=list_stderr,
            )
        return subprocess.CompletedProcess(
            args,
            upload_returncode,
            stdout="",
            stderr="",
        )

    monkeypatch.setattr(gdrive.subprocess, "run", run)
    return calls


def test_normalizes_slashes_and_repeated_separators():
    assert gdrive.normalize_target_folder(
        r"生成画像\\kotone///",
    ) == "生成画像/kotone"


@pytest.mark.parametrize(
    "target_folder",
    [
        "",
        "   ",
        ".",
        "foo/.",
        "foo/..",
        "../secret",
        "/absolute",
        r"\absolute",
        "gdrive:abc",
        "otherremote:abc",
        r"C:\test",
        "https://example.test/folder",
    ],
)
def test_rejects_unsafe_target_folders(target_folder: str):
    with pytest.raises(
        gdrive.GDriveSaveError,
        match="Destination folder is required|Invalid Google Drive path",
    ):
        gdrive.normalize_target_folder(target_folder)


def test_next_filename_starts_at_zero_and_ignores_other_extensions():
    assert gdrive._next_filename(["abc.png", "010.jpg", "000.webp"], ".png") == "000.png"


def test_next_filename_uses_maximum_matching_number():
    assert gdrive._next_filename(
        ["000.png", "001.png", "004.png", "abc.png", "010.jpg"],
        ".png",
    ) == "005.png"


def test_next_filename_supports_webp_and_four_digit_numbers():
    assert gdrive._next_filename(["000.webp", "001.webp"], ".webp") == "002.webp"
    assert gdrive._next_filename(["999.png"], ".png") == "1000.png"


def test_rejects_source_outside_output_root(output_root: Path):
    outside = output_root.parent / "outside.png"
    outside.write_bytes(b"not allowed")

    with pytest.raises(gdrive.GDriveSaveError, match="Invalid source image path"):
        gdrive.save_to_gdrive("../outside.png", "folder", output_root=str(output_root))


def test_rejects_source_symlink_escape(output_root: Path, tmp_path: Path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.png").write_bytes(b"not allowed")
    link = output_root / "escape"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(gdrive.GDriveSaveError, match="Invalid source image path"):
        gdrive.save_to_gdrive("escape/secret.png", "folder", output_root=str(output_root))


def test_calls_lsf_then_copyto_with_gdrive_root_path_and_preserves_source_bytes(
    output_root: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    source = _write_source(output_root)
    calls = _mock_rclone(
        monkeypatch,
        listing="000.png\n001.png\n004.png\nabc.png\n010.jpg\n",
    )

    result = gdrive.save_to_gdrive(
        "20260913_normal/render.png",
        r"生成画像\kotone\classroom",
        output_root=str(output_root),
    )

    assert result == {
        "ok": True,
        "targetFolder": "生成画像/kotone/classroom",
        "filename": "005.png",
        "targetPath": "生成画像/kotone/classroom/005.png",
        "remote": "gdrive:生成画像/kotone/classroom/005.png",
    }
    list_args, list_kwargs = calls[0]
    assert list_args == [
        "rclone",
        "lsf",
        "--files-only",
        "--max-depth",
        "1",
        "gdrive:生成画像/kotone/classroom",
    ]
    assert list_kwargs == {
        "check": False,
        "capture_output": True,
        "text": True,
    }
    upload_args, upload_kwargs = calls[1]
    assert upload_args[0:2] == ["rclone", "copyto"]
    assert upload_args[-2:] == [
        str(source.resolve()),
        "gdrive:生成画像/kotone/classroom/005.png",
    ]
    assert "--ignore-existing" in upload_args
    assert "--error-on-no-transfer" in upload_args
    assert upload_kwargs == {
        "check": False,
        "capture_output": True,
        "text": True,
    }
    assert source.read_bytes() == b"PNG bytes with ComfyUI metadata"


def test_missing_destination_folder_is_treated_as_empty(
    output_root: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    _write_source(output_root)
    calls = _mock_rclone(
        monkeypatch,
        list_returncode=3,
        list_stderr="Failed to lsf: directory not found",
    )

    result = gdrive.save_to_gdrive(
        "20260913_normal/render.png",
        "new/folder",
        output_root=str(output_root),
    )

    assert result["filename"] == "000.png"
    assert calls[1][0][-1] == "gdrive:new/folder/000.png"


def test_existing_destination_is_reported_without_overwrite(
    output_root: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    _write_source(output_root)
    calls = _mock_rclone(
        monkeypatch,
        listing="000.png\n",
        upload_returncode=9,
    )

    with pytest.raises(gdrive.GDriveSaveError, match="already exists") as error:
        gdrive.save_to_gdrive(
            "20260913_normal/render.png",
            "folder",
            output_root=str(output_root),
        )
    assert error.value.status_code == 409
    assert len(calls) == 2


def test_missing_source_is_reported(output_root: Path, monkeypatch: pytest.MonkeyPatch):
    calls = _mock_rclone(monkeypatch)

    with pytest.raises(gdrive.GDriveSaveError, match="source image does not exist"):
        gdrive.save_to_gdrive("missing.png", "folder", output_root=str(output_root))
    assert calls == []


def test_destination_listing_failure_is_reported(
    output_root: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    _write_source(output_root)
    calls = _mock_rclone(monkeypatch, list_returncode=1, list_stderr="permission denied")

    with pytest.raises(gdrive.GDriveSaveError, match="Failed to inspect destination folder"):
        gdrive.save_to_gdrive(
            "20260913_normal/render.png",
            "folder",
            output_root=str(output_root),
        )
    assert len(calls) == 1


def test_rclone_failure_is_reported(output_root: Path, monkeypatch: pytest.MonkeyPatch):
    _write_source(output_root)
    _mock_rclone(monkeypatch, upload_returncode=1)

    with pytest.raises(gdrive.GDriveSaveError, match="Failed to upload to Google Drive"):
        gdrive.save_to_gdrive(
            "20260913_normal/render.png",
            "folder",
            output_root=str(output_root),
        )
