from PIL import Image
import os

DECOR_DIR = "/home/user/game/game/assets/decor"
MAX_DIM = 460
COLORS = 64

total_before = 0
total_after = 0
count = 0
for slug in sorted(os.listdir(DECOR_DIR)):
    d = os.path.join(DECOR_DIR, slug)
    if not os.path.isdir(d):
        continue
    for fname in os.listdir(d):
        p = os.path.join(d, fname)
        before = os.path.getsize(p)
        im = Image.open(p).convert("RGBA")
        if max(im.size) > MAX_DIM:
            im.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
        im = im.quantize(colors=COLORS, method=Image.FASTOCTREE)
        im.save(p, optimize=True)
        after = os.path.getsize(p)
        total_before += before
        total_after += after
        count += 1

print(f"{count} files: {total_before/1024/1024:.1f}MB -> {total_after/1024/1024:.1f}MB")
