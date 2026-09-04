"""Checkpoint names exposed to the mobile simple-generation form."""

import folder_paths


def list_model_names(folder_name):
    """Return the names ComfyUI currently recognizes for a model folder."""
    names = folder_paths.get_filename_list(folder_name)
    return sorted(
        {name for name in names if isinstance(name, str) and name},
        key=lambda name: (name.casefold(), name),
    )


def list_checkpoints():
    """Return selectable model paths for both checkpoint and native UNet loaders.

    The simple-generation UI keeps one ``Checkpoint`` field for both modes.
    SDXL reads it through ``CheckpointLoaderSimple`` while Anima reads it
    through ComfyUI's native ``UNETLoader``. ComfyUI registers those files in
    separate folders, so the mobile endpoint must expose their union.
    """
    names = set(list_model_names("checkpoints"))
    names.update(list_model_names("diffusion_models"))
    return sorted(names, key=lambda name: (name.casefold(), name))
