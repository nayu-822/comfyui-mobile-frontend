import mobile_loras


def test_list_loras_uses_comfyui_registry(monkeypatch):
    calls = []

    def list_model_names(folder_name):
        calls.append(folder_name)
        return ["models/style.safetensors"]

    monkeypatch.setattr(mobile_loras, "list_model_names", list_model_names)

    assert mobile_loras.list_loras() == ["models/style.safetensors"]
    assert calls == ["loras"]
