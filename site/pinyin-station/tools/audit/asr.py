"""ASR of every clip in the manifest with the pipeline's own paraformer-zh (sherpa-onnx int8), offline, never plays audio.
usage (through memrun, see run-audit.sh):  asr.py MANIFEST_JSON PUBLIC_AUDIO_DIR OUT_JSON
Each file is decoded to 16 kHz mono with ffmpeg and recognised twice: as is ("raw") and peak-normalised ("norm")."""
import json, subprocess, sys, time
from pathlib import Path
import numpy as np
import sherpa_onnx

manifest, audio_dir, out_path = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
ASR = Path.home() / "kid-games-work/voice/models/paraformer-zh"
rec = sherpa_onnx.OfflineRecognizer.from_paraformer(paraformer=str(ASR / "model.int8.onnx"), tokens=str(ASR / "tokens.txt"),
                                                    num_threads=2, sample_rate=16000, feature_dim=80, decoding_method="greedy_search")
def decode(f):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(f), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32)
def run(x):
    st = rec.create_stream(); st.accept_waveform(16000, x); rec.decode_stream(st); return st.result.text
man = json.loads(manifest.read_text())
cache, out, t0 = {}, {}, time.time()
pad = np.zeros(int(16000 * 0.3), np.float32)
for cid, c in man.items():
    fname = c["src"].split("/")[-1]
    if fname not in cache:
        a = decode(audio_dir / fname)
        pk = float(np.max(np.abs(a)) + 1e-9)
        cache[fname] = {"raw": run(np.concatenate([pad, a, pad])), "norm": run(np.concatenate([pad, a * (0.5 / pk), pad]))}
    out[cid] = {"file": fname, **cache[fname]}
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=0))
print(len(out), "ids,", len(cache), "files,", round(time.time() - t0, 1), "s")
