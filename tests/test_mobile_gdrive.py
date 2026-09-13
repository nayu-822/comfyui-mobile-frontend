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


def _mock_rclone(monkeypatch: pytest.MonkeyPatch, returncode: int = 0):
    calls = []

    def run(args, **kwargs):
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, returncode, stdout="", stderr="")

    monkeypatch.setattr(gdrive.subprocess, "run", run)
    return calls


def test_normalizes_slashes_and_repeated_separators():
    assert gdrive.normalize_target_path(
        r"生成画像\\kotone///01.png",
        ".png",
    ) == "生成画像/kotone/01.png"


def test_keeps_matching_extension_and_appends_missing_extension():
    assert gdrive.normalize_target_path("生成画像/kotone/01.png", ".png") == "生成画像/kotone/01.png"
    assert gdrive.normalize_target_path("生成画像/kotone/01", ".png") == "生成画像/kotone/01.png"


@pytest.mark.parametrize(
    "target",
    [
        "",
        "   ",
        ".",
        "foo/..",
        "../secret.png",
        "/absolute.png",
        r"\absolute.png",
        "gdrive:abc.png",
        "otherremote:abc.png",
        r"C:\test.png",
        "https://example.test/image.png",
        "folder/",
    ],
)
def test_rejects_unsafe_target_paths(target: str):
    with pytest.raises(gdrive.GDriveSaveError, match="Destination path is required|Invalid Google Drive path"):
        gdrive.normalize_target_path(target, ".png")


def test_rejects_different_destination_extension():
    with pytest.raises(gdrive.GDriveSaveError, match="destination extension"):
        gdrive.normalize_target_path("folder/image.jpg", ".png")


def test_rejects_source_outside_output_root(output_root: Path):
    outside = output_root.parent / "outside.png"
    outside.write_bytes(b"not allowed")

    with pytest.raises(gdrive.GDriveSaveError, match="Invalid source image path"):
        gdrive.save_to_gdrive("../outside.png", "copy.png", output_root=str(output_root))


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
        gdrive.save_to_gdrive("escape/secret.png", "copy.png", output_root=str(output_root))


def test_calls_rclone_copyto_with_gdrive_root_path_and_preserves_source_bytes(
    output_root: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    source = _write_source(output_root)
    calls = _mock_rclone(monkeypatch)

    result = gdrive.save_to_gdrive(
        "20260913_normal/render.png",
        r"生成画像\kotone\01",
        output_root=str(output_root),
    )

    assert result == {
        "ok": True,
        "targetPath": "生成画像/kotone/01.png",
        "remote": "gdrive:生成画像/kotone/01.png",
    }
    args, kwargs = calls[0]
    assert args[0:2] == ["rclone", "copyto"]
    assert args[-2:] == [str(source.resolve()), "gdrive:生成画像/kotone/01.png"]
    assert "--ignore-existing" in args
    assert "--error-on-no-transfer" in args
    assert kwargs == {
        "check": False,
        "capture_output": True,
        "text": True,
    }
    assert source.read_bytes() == b"PNG bytes with ComfyUI metadata"


def test_existing_destination_is_reported_without_overwrite(
    output_root: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    _write_source(output_root)
    _mock_rclone(monkeypatch, returncode=9)

    with pytest.raises(gdrive.GDriveSaveError, match="already exists") as error:
        gdrive.save_to_gdrive(
            "20260913_normal/render.png",
            "render.png",
            output_root=str(output_root),
        )
    assert error.value.status_code == 409


def test_missing_source_is_reported(output_root: Path, monkeypatch: pytest.MonkeyPatch):
    calls = _mock_rclone(monkeypatch)

    with pytest.raises(gdrive.GDriveSaveError, match="source image does not exist"):
        gdrive.save_to_gdrive("missing.png", "copy.png", output_root=str(output_root))
    assert calls == []


def test_rclone_failure_is_reported(output_root: Path, monkeypatch: pytest.MonkeyPatch):
    _write_source(output_root)
    _mock_rclone(monkeypatch, returncode=1)

    with pytest.raises(gdrive.GDriveSaveError, match="Failed to upload to Google Drive"):
        gdrive.save_to_gdrive("20260913_normal/render.png", "copy.png", output_root=str(output_root))
