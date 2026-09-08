import json
from pathlib import Path

import pytest

import mobile_presets as presets

Image = pytest.importorskip("PIL.Image", reason="Pillow not installed")
from PIL.PngImagePlugin import PngInfo


def _write_png(root: Path, relative: str, mode: str | None = None) -> Path:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (12, 8), (20, 40, 60))
    if mode:
        info = PngInfo()
        info.add_text(
            "workflow",
            json.dumps({
                "extra": {
                    "mobile_generation_profile": {"workflowKind": mode},
                },
            }),
        )
        image.save(path, pnginfo=info)
    else:
        image.save(path)
    return path


@pytest.fixture
def output_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "output"
    root.mkdir()
    monkeypatch.setenv("LOCAL_OUTPUT_DIR", str(root))
    return root


def test_saves_sdxl_as_raw_bytes_and_preserves_metadata(output_root: Path):
    source = _write_png(output_root, "20260908_normal/render.png", "sdxl")

    result = presets.save_preset("20260908_normal/render.png", "anima")

    destination = output_root / result["relativePath"]
    assert result == {
        "ok": True,
        "mode": "sdxl",
        "relativePath": "preset/sdxl/render.png",
    }
    assert destination.read_bytes() == source.read_bytes()
    with Image.open(destination) as image:
        workflow = json.loads(image.info["workflow"])
    assert workflow["extra"]["mobile_generation_profile"]["workflowKind"] == "sdxl"


def test_saves_anima_to_the_anima_preset_tree(output_root: Path):
    _write_png(output_root, "20260908_normal/anima.png", "anima")

    result = presets.save_preset("20260908_normal/anima.png", "sdxl")

    assert result["mode"] == "anima"
    assert (output_root / "preset/anima/anima.png").is_file()
    assert not (output_root / "preset/sdxl/anima.png").exists()


def test_unknown_metadata_uses_caller_mode(output_root: Path):
    _write_png(output_root, "render.png")

    result = presets.save_preset("render.png", "anima")

    assert result["mode"] == "anima"


def test_unknown_metadata_and_mode_is_an_error(output_root: Path):
    _write_png(output_root, "render.png")

    with pytest.raises(presets.PresetSaveError, match="Unsupported image mode"):
        presets.save_preset("render.png")


def test_duplicate_name_gets_a_suffix_without_overwriting(output_root: Path):
    source = _write_png(output_root, "render.png", "sdxl")
    existing = output_root / "preset/sdxl/render.png"
    existing.parent.mkdir(parents=True)
    existing.write_bytes(b"keep this file")

    result = presets.save_preset("render.png", "sdxl")

    assert result["relativePath"] == "preset/sdxl/render__1.png"
    assert existing.read_bytes() == b"keep this file"
    assert (output_root / result["relativePath"]).read_bytes() == source.read_bytes()


@pytest.mark.parametrize("relative", ["../secret.png", "../../output/secret.png", "https://example.test/a.png"])
def test_rejects_traversal_and_urls(output_root: Path, relative: str):
    _write_png(output_root, "render.png")

    with pytest.raises(presets.PresetSaveError, match="Invalid output path"):
        presets.save_preset(relative, "sdxl")


def test_rejects_absolute_path(output_root: Path, tmp_path: Path):
    outside = tmp_path / "outside.png"
    _write_png(tmp_path, "outside.png")

    with pytest.raises(presets.PresetSaveError, match="Invalid output path"):
        presets.save_preset(str(outside), "sdxl")


def test_rejects_symlink_escape(output_root: Path, tmp_path: Path):
    outside = tmp_path / "outside"
    outside.mkdir()
    _write_png(outside, "secret.png")
    link = output_root / "escape"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError as error:
        pytest.skip(f"symlink creation unavailable: {error}")

    with pytest.raises(presets.PresetSaveError, match="Invalid output path"):
        presets.save_preset("escape/secret.png", "sdxl")


def test_missing_source_is_an_error(output_root: Path):
    with pytest.raises(presets.PresetSaveError, match="Source image not found"):
        presets.save_preset("missing.png", "sdxl")
