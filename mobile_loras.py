"""LoRA names exposed to the mobile simple-generation form."""

from mobile_checkpoints import list_model_names


def list_loras():
    """Return LoRA paths from ComfyUI's own LoRA registry."""
    return list_model_names("loras")
