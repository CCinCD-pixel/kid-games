"""ffmpeg filter snippets used by voice presets (the strings themselves are hashed into the clip key)."""

# Companion robot: subtle "digital" tint that keeps every consonant clear for a 6-year-old —
# two very short comb echoes (7/11 ms -> faint metallic ring), a light log-bitcrush mixed at 10 %,
# and a presence lift around 3 kHz. Pitch is raised separately by the preset (pitch: 1.03).
ROBOT = ("aecho=0.9:0.9:7|11:0.20|0.10,"
         "acrusher=level_in=1:level_out=1:bits=11:mode=log:aa=1:mix=0.10,"
         "equalizer=f=3000:t=o:w=1.5:g=2")
