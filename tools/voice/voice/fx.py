"""ffmpeg filter snippets used by voice presets (the strings themselves are hashed into the clip key)."""

# Companion robot: subtle "digital" tint that keeps every consonant clear for a 6-year-old —
# two very short comb echoes (7/11 ms -> faint metallic ring), a light log-bitcrush mixed at 10 %,
# and a presence lift around 3 kHz. Pitch is raised separately by the preset (pitch: 1.03).
ROBOT = ("aecho=0.9:0.9:7|11:0.20|0.10,"
         "acrusher=level_in=1:level_out=1:bits=11:mode=log:aa=1:mix=0.10,"
         "equalizer=f=3000:t=o:w=1.5:g=2")

# 鲁班 (gear-fort's rival master-craftsman): no effect, only voice shaping — a little chest warmth (low shelf
# around 150 Hz) and a soft presence lift (2.5 kHz) so the confident Beijing-flavoured voice sits forward
# without sounding harsh. Combined with pitch 0.96 in the preset (a touch older / fuller than Dylan's own voice).
WARM = ("equalizer=f=150:t=q:w=0.8:g=2.5,"
        "equalizer=f=2500:t=o:w=1.2:g=1.5")
