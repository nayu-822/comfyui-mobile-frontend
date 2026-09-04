import mobile_checkpoints


def test_list_checkpoints_uses_comfyui_registry_and_sorts(monkeypatch):
    calls = []

    def get_filename_list(folder_name):
        calls.append(folder_name)
        if folder_name == "checkpoints":
            return [
                "zeta.safetensors",
                "Alpha.safetensors",
                "alpha.safetensors",
                123,
                "",
                "nested/model.safetensors",
            ]
        return [
            "anima-base-v1.0.safetensors",
            "Alpha.safetensors",
            "nested/native.safetensors",
        ]

    monkeypatch.setattr(
        mobile_checkpoints.folder_paths,
        "get_filename_list",
        get_filename_list,
    )

    assert mobile_checkpoints.list_checkpoints() == [
        "Alpha.safetensors",
        "alpha.safetensors",
        "anima-base-v1.0.safetensors",
        "nested/model.safetensors",
        "nested/native.safetensors",
        "zeta.safetensors",
    ]
    assert calls == ["checkpoints", "diffusion_models"]


def test_list_model_names_still_reads_one_registry(monkeypatch):
    calls = []

    def get_filename_list(folder_name):
        calls.append(folder_name)
        return [
            "zeta.safetensors",
            "Alpha.safetensors",
            "alpha.safetensors",
            123,
            "",
            "nested/model.safetensors",
        ]

    monkeypatch.setattr(
        mobile_checkpoints.folder_paths,
        "get_filename_list",
        get_filename_list,
    )

    assert mobile_checkpoints.list_model_names("checkpoints") == [
        "Alpha.safetensors",
        "alpha.safetensors",
        "nested/model.safetensors",
        "zeta.safetensors",
    ]
    assert calls == ["checkpoints"]
