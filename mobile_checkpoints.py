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
    """Return checkpoint paths from ComfyUI's own checkpoint registry."""
    return list_model_names("checkpoints")
