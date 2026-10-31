"""Security policy tests use harmless doubles, never an executable pickle."""
from collections import OrderedDict
from unittest.mock import Mock

import pytest
import torch

from src.checkpoint import load_checkpoint


@pytest.mark.parametrize("version", ["2.2.2", "2.5.1+cpu", "2.6.0rc1", "2.6.0.dev20250101", "unknown"])
def test_unsupported_runtime_rejected_before_deserialization(monkeypatch, version):
    monkeypatch.setattr(torch, "__version__", version)
    loader = Mock(return_value={})
    monkeypatch.setattr(torch, "load", loader)
    with pytest.raises(RuntimeError, match="PyTorch"):
        load_checkpoint("unused.pt")
    loader.assert_not_called()


@pytest.mark.parametrize("version", ["2.6.0", "2.6.0+cpu", "2.10.0+cu128", "3.0.0"])
def test_supported_runtime_uses_restricted_loader(monkeypatch, version):
    monkeypatch.setattr(torch, "__version__", version)
    payload = OrderedDict(model_state_dict={"weight": torch.tensor([1.0])}, step=7)
    loader = Mock(return_value=payload)
    monkeypatch.setattr(torch, "load", loader)
    loaded = load_checkpoint("model.pt", map_location="cpu")
    assert loaded["step"] == 7
    assert torch.equal(loaded["model_state_dict"]["weight"], torch.tensor([1.0]))
    assert isinstance(loaded, dict)
    loader.assert_called_once_with("model.pt", map_location="cpu", weights_only=True)


@pytest.mark.parametrize("payload", [[], "text", None, torch.tensor([1.0])])
def test_nonmapping_checkpoint_rejected(monkeypatch, payload):
    monkeypatch.setattr(torch, "__version__", "2.6.0")
    monkeypatch.setattr(torch, "load", Mock(return_value=payload))
    with pytest.raises(ValueError, match="mapping"):
        load_checkpoint("unused.pt")


@pytest.mark.parametrize("error", [TypeError("unsupported argument"), RuntimeError("restricted object")])
def test_restricted_load_failure_never_retries_unsafe(monkeypatch, error):
    monkeypatch.setattr(torch, "__version__", "2.6.0")
    loader = Mock(side_effect=error)
    monkeypatch.setattr(torch, "load", loader)
    with pytest.raises(type(error), match=str(error)):
        load_checkpoint("unused.pt")
    loader.assert_called_once_with("unused.pt", map_location="cpu", weights_only=True)


def test_real_tensor_and_primitive_checkpoint_roundtrip(tmp_path):
    """Compatibility evidence requires a real patched runtime, never a spoofed version."""
    from packaging.version import InvalidVersion, Version

    try:
        version = Version(torch.__version__)
    except InvalidVersion:
        pytest.skip("A stable patched PyTorch runtime is required for real checkpoint loading")
    if version < Version("2.6.0") or version.is_prerelease or version.is_devrelease:
        pytest.skip("A stable patched PyTorch runtime is required for real checkpoint loading")
    path = tmp_path / "trusted.pt"
    torch.save({"model_state_dict": {"weight": torch.tensor([1.0, 2.0])}, "step": 7,
                "config": {"name": "test", "enabled": True, "ratios": [0.5, None]}}, path)
    loaded = load_checkpoint(path)
    assert torch.equal(loaded["model_state_dict"]["weight"], torch.tensor([1.0, 2.0]))
    assert loaded["step"] == 7
    assert loaded["config"] == {"name": "test", "enabled": True, "ratios": [0.5, None]}


def test_stage_checkpoint_version_metadata_uses_builtin_string(monkeypatch):
    """A str subclass in metadata would require an unsafe class allowlist on reload."""
    from src.post_training import utils

    class VersionString(str):
        pass

    monkeypatch.setattr(torch, "__version__", VersionString("2.6.0+cpu"))
    save = Mock()
    monkeypatch.setattr(utils, "atomic_save", save)
    utils.save_stage_ckpt("unused.pt", torch.nn.Linear(1, 1), None,
                          stage="test", cfg={"width": 1}, step=3)
    payload = save.call_args.args[0]
    assert type(payload["pytorch_version"]) is str
    assert payload["pytorch_version"] == "2.6.0+cpu"
