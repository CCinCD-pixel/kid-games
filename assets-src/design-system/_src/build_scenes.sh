#!/bin/bash
# Paper-cut star-port backdrops: SVG (hub_scene.mjs) → 2x PNG (one headless Chromium, closed) → WebP.
set -euo pipefail
cd "$(dirname "$0")/.."
node _src/hub_scene.mjs
(cd _pw && node raster.mjs \
  ../_src/scene/hub-landscape@2x.png ../_src/scene/hub-landscape.svg 1080 810 2 \
  ../_src/scene/hub-portrait@2x.png ../_src/scene/hub-portrait.svg 810 1080 2 \
  ../_src/scene/scene-landscape@2x.png ../_src/scene/scene-landscape.svg 1080 810 2 \
  ../_src/scene/scene-portrait@2x.png ../_src/scene/scene-portrait.svg 810 1080 2)
.venv-ds/bin/python - <<'PY'
from PIL import Image
import os
for n in ['hub-landscape', 'hub-portrait', 'scene-landscape', 'scene-portrait']:
    Image.open(f'_src/scene/{n}@2x.png').convert('RGB').save(f'textures/{n}.webp', 'WEBP', quality=80, method=6)
    print(n, os.path.getsize(f'textures/{n}.webp') // 1024, 'KB')
PY
