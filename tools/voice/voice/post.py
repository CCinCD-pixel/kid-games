"""ffmpeg post chain: raw engine wav -> trimmed, shaped, loudness-normalised 44.1 kHz mono -> AAC m4a.

  1. mono float, 60 Hz high-pass
  2. trim leading/trailing silence (peak < -50 dBFS), keep 30 ms / 80 ms
  3. preset shaping: pitch (asetrate+aresample, duration restored by atempo), tempo (atempo), fx
  4. pad LEAD_MS before / TAIL_MS after
  5. EBU R128: measure (ebur128), static gain to I=-16 LUFS, peak limiter only if TP would exceed
     -2.5 dBTP (1 dB AAC margin -> <= -1.5 dBTP after encode), -ar 44100 pcm before encode
  6. AAC-LC mono 40 kbps in .m4a (AudioToolbox encoder when present), +faststart
The 44.1 kHz pcm wav of step 5 is kept in cache/proc/ for timing estimation and QC.
"""
from __future__ import annotations
import json, re, shutil, subprocess
from functools import lru_cache
from pathlib import Path

import soundfile as sf

from . import config

FF = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FP = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"


@lru_cache(maxsize=1)
def encoder() -> str:
    out = subprocess.run([FF, "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    return config.CODEC["encoder"] if re.search(rf"\s{config.CODEC['encoder']}\s", out) else config.CODEC["fallback"]


def shape_chain(sr_in: int, post: dict, speed: float = 1.0) -> str:
    f = ["aformat=sample_fmts=flt:channel_layouts=mono", "highpass=f=60",
         "silenceremove=start_periods=1:start_silence=0.03:start_threshold=-50dB:detection=peak",
         "areverse",
         "silenceremove=start_periods=1:start_silence=0.08:start_threshold=-50dB:detection=peak",
         "areverse"]
    pitch = float(post.get("pitch", 1.0))
    tempo = float(post.get("tempo", 1.0)) * float(speed)
    if abs(pitch - 1.0) > 1e-3:
        f += [f"asetrate={round(sr_in * pitch)}", f"aresample={sr_in}"]
        tempo = tempo / pitch
    if abs(tempo - 1.0) > 1e-3:
        f.append(f"atempo={tempo:.4f}")
    if post.get("fx"):
        f.append(post["fx"])
    f += [f"adelay={config.LEAD_MS}:all=1", f"apad=pad_dur={config.TAIL_MS / 1000:.3f}"]
    return ",".join(f)


def _run(args):
    r = subprocess.run([FF, "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"ffmpeg failed: {' '.join(args)}\n{r.stderr[-2000:]}")
    return r.stderr


def process(raw: Path, proc_wav: Path, m4a: Path, post: dict, speed: float = 1.0) -> dict:
    sr_in = sf.info(str(raw)).samplerate
    proc_wav.parent.mkdir(parents=True, exist_ok=True)
    m4a.parent.mkdir(parents=True, exist_ok=True)
    shaped = proc_wav.with_suffix(".shaped.wav")
    _run(["-i", str(raw), "-af", shape_chain(sr_in, post, speed), "-ar", str(config.SAMPLE_RATE), "-ac", "1",
          "-c:a", "pcm_f32le", str(shaped)])
    m_in = measure_loudness(shaped)
    target = config.LOUDNORM["I"]
    gain = target - m_in["I"] if m_in["I"] is not None and m_in["I"] > -60 else None
    for _ in range(4):  # the limiter eats some loudness: re-measure and push the gain (<= +6 dB extra)
        chain = loudness_chain(m_in, gain)
        _run(["-i", str(shaped), "-af", chain, "-ar", str(config.SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le",
              str(proc_wav)])
        m_out = measure_loudness(proc_wav)
        if gain is None or m_out["I"] is None or "alimiter" not in chain or target - m_out["I"] <= 0.25 \
                or gain - (target - m_in["I"]) >= 6:
            break
        gain += target - m_out["I"]
    shaped.unlink(missing_ok=True)
    tmp = m4a.with_name(m4a.stem + ".part.m4a")
    _run(["-i", str(proc_wav), "-c:a", encoder(), "-b:a", config.CODEC["bitrate"], "-ac", "1",
          "-ar", str(config.SAMPLE_RATE), "-movflags", "+faststart", str(tmp)])
    tmp.replace(m4a)
    return {"durationMs": duration_ms(m4a), "loudnorm_in": {"input_i": m_in["I"], "input_tp": m_in["TP"]},
            "loudness_pcm": m_out, "loudness_out": measure_loudness(m4a), "chain": chain}


def loudness_chain(m: dict, gain: float | None) -> str:
    """EBU R128 normalisation that also works for 0.5-3 s clips (ffmpeg's loudnorm falls back to its
    dynamic mode below 3 s and lands 1-5 LU low on words and numbers): a static gain towards
    I = -16 LUFS, plus a fast sample-peak limiter whenever that gain would push the true peak over
    TP - margin (speech PLR is ~15 dB, so most clips get 1-3 dB of peak limiting)."""
    if gain is None:
        return "anull"
    tp_target = config.LOUDNORM["TP"] - config.TP_ENCODE_MARGIN   # -2.5 dBTP on PCM -> <= -1.5 after AAC
    f = [f"volume={gain:.2f}dB"]
    if m["TP"] is not None and m["TP"] + gain > tp_target:
        lim = 10 ** ((tp_target - 0.5) / 20)                       # 0.5 dB inter-sample headroom
        f.append(f"alimiter=limit={lim:.4f}:attack=1:release=40:level=0")
    return ",".join(f)


def duration_ms(path: Path) -> int:
    r = subprocess.run([FP, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return int(round(float(r.stdout.strip()) * 1000))


def measure_loudness(path: Path) -> dict:
    """Integrated loudness (LUFS) and true peak (dBTP) via ffmpeg ebur128."""
    err = _run(["-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"])
    i = re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", err)
    tp = re.findall(r"Peak:\s+(-?[\d.]+|-inf) dBFS", err)
    f = lambda v: None if not v or v[-1] == "-inf" else float(v[-1])
    return {"I": f(i), "TP": f(tp)}
