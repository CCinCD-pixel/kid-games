import sys
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
src, out, step = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2400
im = Image.open(src); w, h = im.size
k = 0
for y in range(0, h, step):
    c = im.crop((0, y, w, min(h, y + step)))
    c = c.resize((c.width // 2, c.height // 2), Image.LANCZOS)
    c.save(f'{out}-{k:02d}.png'); k += 1
print(k, 'parts', w, h)
