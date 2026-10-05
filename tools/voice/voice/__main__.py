"""voice — swappable local narration pipeline.

  python -m voice build   --game <id> [--engine qwen3|kokoro|say|cloud] [--out DIR] [--content DIR]
                          [--only 'id*,id2'] [--no-qc] [--batch N] [--prune] [--reroll N]
  python -m voice engines                       # list engines + availability
  python -m voice setup   --engine qwen3|kokoro|asr|all   # download models (guarded, one at a time)
  python -m voice numbers [--max 1000] [--role companion] [--game numbers] [--sample num.0,num.2,...]
  python -m voice compare [--games hub,story-box,numbers-demo] [--engines qwen3,kokoro,say]
  python -m voice selftest                      # fast checks, no model

Run through tools/voice/voice.sh (sets VOICE_HOME, HF_HOME, offline mode and the venv's python),
or `npm run voice:build [-- <game> ...]` to build straight into the repo's public/audio/.
"""
from __future__ import annotations
import argparse, sys
from pathlib import Path

from . import config


def cmd_engines(_):
    from .engines import ENGINES, DEFAULT, get
    for name in ENGINES:
        e = get(name)
        ok, why = e.available()
        print(f"{name:7s} {'OK ' if ok else '-- '} {'(default) ' if name == DEFAULT else ''}{e.license}  {why}")


SETUP = {
    "qwen3": "from huggingface_hub import snapshot_download as s; "
             "print(s('mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit', revision='049ef77fe8816b536193c0c25f9a214d17921282', max_workers=2))",
    "kokoro": f"from huggingface_hub import snapshot_download as s; "
              f"print(s('csukuangfj/kokoro-int8-multi-lang-v1_1', local_dir='{config.MODELS}/kokoro-int8-multi-lang-v1_1', max_workers=2))",
    "asr": f"from huggingface_hub import snapshot_download as s; "
           f"print(s('csukuangfj/sherpa-onnx-paraformer-zh-2024-03-09', local_dir='{config.ASR_DIR}', "
           f"allow_patterns=['model.int8.onnx','tokens.txt','README.md'], max_workers=2))",
}


def cmd_setup(a):
    import subprocess
    names = list(SETUP) if a.engine == "all" else [a.engine]
    env = config.env_for_models(); env["HF_HUB_OFFLINE"] = "0"
    for n in names:
        if n not in SETUP:
            raise SystemExit(f"nothing to set up for {n}")
        rc = subprocess.run([str(config.MEMRUN), "-l", "2000", "-t", f"setup:{n}", "--", str(config.PYTHON), "-c", SETUP[n]],
                            env=env, cwd=str(config.PIPELINE)).returncode
        if rc:
            raise SystemExit(f"setup {n} failed ({rc})")


def cmd_build(a):
    from .build import build
    only = [s.strip() for s in a.only.split(",")] if a.only else None
    build(a.game, a.engine, Path(a.out) if a.out else None, Path(a.content) if a.content else None,
          do_qc=not a.no_qc, only=only, batch=a.batch, prune=a.prune, rounds=a.reroll)


def cmd_numbers(a):
    from . import numbers
    sample = [s.strip() for s in a.sample.split(",")] if a.sample else None
    path = Path(a.content or config.CONTENT) / "narration" / f"{a.game}.yaml"
    n = numbers.write(path, game=a.game, role=a.role, max_n=a.max, sample=sample)
    print(f"wrote {path} ({n} clips) -> python -m voice build --game {a.game}")


def cmd_compare(a):
    from .compare import make
    make([g for g in a.games.split(",") if g], [e for e in a.engines.split(",") if e])


def main(argv=None):
    p = argparse.ArgumentParser(prog="voice", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    b = sp.add_parser("build"); b.add_argument("--game", required=True); b.add_argument("--engine", default="qwen3")
    b.add_argument("--out"); b.add_argument("--content"); b.add_argument("--only"); b.add_argument("--no-qc", action="store_true")
    b.add_argument("--batch", type=int, default=config.BATCH_MAX); b.add_argument("--prune", action="store_true")
    b.add_argument("--reroll", type=int, default=None, help=f"extra seeds for clips with hard QC flags (default {config.REROLL}; 0 = off)")
    b.set_defaults(fn=cmd_build)
    sp.add_parser("engines").set_defaults(fn=cmd_engines)
    sp.add_parser("selftest").set_defaults(fn=lambda a: __import__("voice.selftest", fromlist=["run"]).run())
    s = sp.add_parser("setup"); s.add_argument("--engine", default="all"); s.set_defaults(fn=cmd_setup)
    n = sp.add_parser("numbers"); n.add_argument("--game", default="numbers"); n.add_argument("--role", default="companion")
    n.add_argument("--max", type=int, default=1000); n.add_argument("--sample"); n.add_argument("--content")
    n.set_defaults(fn=cmd_numbers)
    c = sp.add_parser("compare"); c.add_argument("--games", default="hub,story-box,numbers-demo")
    c.add_argument("--engines", default="qwen3,kokoro,say"); c.set_defaults(fn=cmd_compare)
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
