"""Engine registry. Add an engine = add a module with an Engine subclass and register it here."""
from __future__ import annotations

ENGINES = {
    "qwen3": ("qwen3_mlx", "Qwen3MLX"),        # default
    "kokoro": ("sherpa_kokoro", "SherpaKokoro"),  # light fallback
    "say": ("macos_say", "MacOSSay"),
    "cloud": ("cloud_stub", "CloudStub"),
}
DEFAULT = "qwen3"


def get(name: str):
    import importlib
    if name not in ENGINES:
        raise SystemExit(f"unknown engine {name!r}; choose from {', '.join(ENGINES)}")
    mod, cls = ENGINES[name]
    return getattr(importlib.import_module(f"voice.engines.{mod}"), cls)()
