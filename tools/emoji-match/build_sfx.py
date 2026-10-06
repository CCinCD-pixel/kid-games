#!/usr/bin/env python3
"""星晶消消乐 texture-layer sound effects (spec §7.1): the Kenney CC0 samples the spec names, prepared
like the design system (mono 44.1 kHz → trim silence → optional pitch → peak-normalised to −1 dBFS
(these are 0.1–1 s one-shots: an integrated-loudness gate is meaningless that short, so the relative
levels the spec gives — −8 dB laser, −10 dB scratch, −12 dB landings … — are applied as play gains in
src/audio.ts) → 8 ms fade-out → AAC-LC 48 kbps). They are the "texture" layer under this game's
runtime-synthesised pitch / air layers: a Kenney sound never plays alone at full level.

  ~/kid-games-work/design-system/.venv-ds/bin/python tools/emoji-match/build_sfx.py
  → site/emoji-match/assets/sfx/k-sprite.m4a + k-sprite.json — ONE audio sprite (13 one-shots, 150 ms of
    silence between them; offsets in the JSON; the page slices the decoded buffer). One request, never
    inlined into the JS (Vite inlines assets < 4 KB), no per-file module imports in dev. Sources: the
    already-downloaded packs in ~/kid-games-work/design-system/_src/sfx/ (nothing is downloaded).
SILENCE RULE: files only — this script never plays audio. Licences: Kenney packs are CC0 1.0.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path.home() / 'kid-games-work/design-system/_src/sfx'
OUT = ROOT / 'site/emoji-match/assets/sfx'

# id: (pack, file, semitones, target LUFS, use)
SAMPLES = {
    'k-glass':       ('kenney_interface-sounds', 'glass_001',              0, -20, 'em-select (select a gem / long-press a special)'),
    'k-scroll':      ('kenney_interface-sounds', 'scroll_002',             0, -20, 'em-swap'),
    'k-soft':        ('kenney_impact-sounds',    'impactSoft_medium_002', -3, -20, 'em-swap-bad (−3 semitones: soft, never a buzzer)'),
    'k-land':        ('kenney_impact-sounds',    'impactGlass_light_001',  0, -24, 'em-land (played at −12 dB, throttled 60 ms)'),
    'k-laser':       ('kenney_digital-audio',    'laser6',                 0, -22, 'em-rocket texture (−8 dB)'),
    'k-plate':       ('kenney_impact-sounds',    'impactPlate_heavy_002',  0, -18, 'em-bomb'),
    'k-phase':       ('kenney_digital-audio',    'phaseJump4',             0, -22, 'em-drone accent (−10 dB)'),
    'k-plank':       ('kenney_impact-sounds',    'impactPlank_medium_001', 0, -18, 'em-crate-paper'),
    'k-metal':       ('kenney_impact-sounds',    'impactMetal_medium_001', 0, -18, 'em-crate-metal'),
    'k-wood':        ('kenney_impact-sounds',    'impactWood_heavy_002',   0, -18, 'em-crate-break'),
    'k-ice-crack':   ('kenney_impact-sounds',    'impactGlass_medium_002', 0, -18, 'em-ice-crack'),
    'k-ice-break':   ('kenney_impact-sounds',    'impactGlass_heavy_001',  0, -18, 'em-ice-break'),
    'k-scratch':     ('kenney_interface-sounds', 'scratch_003',            0, -22, 'em-dust (−10 dB)'),
}


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


GAP = 0.15       # seconds of silence before each sample (absorbs any AAC priming mismatch)
SR = 44100


def render(key, pack, name, semis):
    """one prepared sample → float32 mono PCM (numpy)"""
    import numpy as np
    src = SRC / pack / 'Audio' / f'{name}.ogg'
    pitch = []
    if semis:
        r = 2 ** (semis / 12)
        pitch = [f'asetrate={int(SR * r)}', f'aresample={SR}']
    chain = ['aformat=channel_layouts=mono', f'aresample={SR}',
             'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.004',
             'areverse', 'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.02', 'areverse',
             *pitch]
    pcm = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(src), '-af', ','.join(chain), '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    x = np.frombuffer(pcm, dtype='<f4').astype('float64')
    peak = float(np.max(np.abs(x))) or 1.0
    x = x * (10 ** (-1 / 20) / peak)                     # peak −1 dBFS; relative levels are play gains
    k = min(len(x), int(0.008 * SR))
    x[-k:] *= np.linspace(1, 0, k)                       # 8 ms fade-out
    return x


def main():
    import numpy as np
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('k-*.m4a'):
        if old.name != 'k-sprite.m4a':
            old.unlink()
    parts, offsets, t = [], {}, 0.0
    for key, (pack, name, semis, _lufs, use) in SAMPLES.items():
        x = render(key, pack, name, semis)
        gap = np.zeros(int(GAP * SR))
        parts += [gap, x]
        t += GAP
        offsets[key] = {'start': round(t, 5), 'dur': round(len(x) / SR, 5), 'source': f'{pack}/{name}.ogg', 'semitones': semis, 'use': use}
        t += len(x) / SR
    parts.append(np.zeros(int(GAP * SR)))
    y = np.concatenate(parts)
    wav = Path.home() / 'kid-games-work/emoji-match/audio/k-sprite.wav'
    wav.parent.mkdir(parents=True, exist_ok=True)
    import wave
    with wave.open(str(wav), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR)
        f.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
    out = OUT / 'k-sprite.m4a'
    enc = 'aac_at' if 'aac_at' in run(['ffmpeg', '-hide_banner', '-encoders']).stdout else 'aac'
    run(['ffmpeg', '-y', '-hide_banner', '-i', str(wav), '-c:a', enc, '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', str(out)])
    meta = {'sampleRate': SR, 'gap': GAP, 'firstStart': offsets[next(iter(offsets))]['start'], 'samples': offsets}
    (OUT / 'k-sprite.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n')
    size = out.stat().st_size
    for k_, o in offsets.items():
        print(f"{k_:12s} @{o['start']:7.3f}s  {o['dur']:5.3f}s  ← {o['source']}  ({o['use']})")
    print(f'k-sprite.m4a {size / 1024:.1f} KB, {len(y) / SR:.2f} s (budget 350 KB)')
    if size > 350 * 1024:
        raise SystemExit('over the 350 KB budget')


if __name__ == '__main__':
    main()
