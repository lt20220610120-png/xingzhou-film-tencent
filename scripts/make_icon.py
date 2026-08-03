"""Process the new logo: crop transparent/white margin, resize to 1024, apply rounded corners, premultiply edges."""
from PIL import Image, ImageDraw, ImageOps
import sys, os

SRC = r"C:\Users\11599\Desktop\ChatGPT_Image_2026年8月3日_02_51_49.png"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

im = Image.open(SRC).convert("RGBA")
print("source:", im.size, im.mode)

# The source image already looks like a rounded-corner icon on (probably) white/transparent bg.
# Detect bounding box of non-white, non-transparent content? Actually the icon itself includes
# the pale gradient rounded square, so we keep the whole design but re-cut clean rounded corners.

# 1) Trim outer transparent border if any
bbox = im.getbbox()
if bbox:
    im = im.crop(bbox)
print("after alpha trim:", im.size)

# 2) Trim near-white margin around the rounded square (the drop shadow area).
#    Find the rounded-square by scanning for pixels that differ from the corner color.
px = im.load()
w, h = im.size
corner = px[2, 2]
def is_bg(p):
    # background: fully transparent or very close to corner color (white-ish)
    if p[3] < 8:
        return True
    return abs(p[0]-corner[0]) < 6 and abs(p[1]-corner[1]) < 6 and abs(p[2]-corner[2]) < 6 and corner[3] == p[3]
# scan rows/cols
left, right, top, bottom = 0, w-1, 0, h-1
def row_bg(y):
    return all(is_bg(px[x, y]) for x in range(0, w, 4))
def col_bg(x):
    return all(is_bg(px[x, y]) for y in range(0, h, 4))
while top < h//2 and row_bg(top): top += 1
while bottom > h//2 and row_bg(bottom): bottom -= 1
while left < w//2 and col_bg(left): left += 1
while right > w//2 and col_bg(right): right -= 1
print("content box:", left, top, right, bottom)
im = im.crop((left, top, right+1, bottom+1))
print("after margin trim:", im.size)

# 3) Square-pad to exact square (content should already be ~square)
side = max(im.size)
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.paste(im, ((side - im.width)//2, (side - im.height)//2))

# 4) Resize to 1024 master
master = sq.resize((1024, 1024), Image.LANCZOS)

# 5) Apply clean rounded-corner mask (radius ~22.5% like macOS/modern icons)
radius = int(1024 * 0.225)
mask = Image.new("L", (1024, 1024), 0)
d = ImageDraw.Draw(mask)
d.rounded_rectangle([0, 0, 1023, 1023], radius=radius, fill=255)
# supersample mask for smooth AA
big = Image.new("L", (4096, 4096), 0)
db = ImageDraw.Draw(big)
db.rounded_rectangle([0, 0, 4095, 4095], radius=radius*4, fill=255)
mask = big.resize((1024, 1024), Image.LANCZOS)

r, g, b, a = master.split()
# combine: final alpha = min(original alpha, mask)
import numpy as np
arr_a = np.array(a, dtype=np.uint16)
arr_m = np.array(mask, dtype=np.uint16)
final_a = np.minimum(arr_a, arr_m).astype(np.uint8)

# 6) Fix semi-transparent edge RGB: premultiply-ish — pull edge RGB from nearby opaque color
rgb = np.dstack([np.array(r), np.array(g), np.array(b)]).astype(np.uint8)
alpha = final_a
semi = (alpha > 0) & (alpha < 255)
print("semi px:", int(semi.sum()))
# Guard against dark semi-transparent edge artifacts: replace dark semi pixels
# with the average color of nearby opaque pixels (simple box sample).
dark = semi & (rgb.max(axis=2) < 80)
if dark.any():
    ys, xs = np.nonzero(dark)
    opaque = alpha == 255
    for y, x in zip(ys, xs):
        y0, y1 = max(0, y-3), min(1024, y+4)
        x0, x1 = max(0, x-3), min(1024, x+4)
        region_mask = opaque[y0:y1, x0:x1]
        if region_mask.any():
            region = rgb[y0:y1, x0:x1][region_mask]
            rgb[y, x] = region.mean(axis=0).astype(np.uint8)
print("dark semi px fixed:", int(dark.sum()))

out = np.dstack([rgb, alpha[..., None]])
final = Image.fromarray(out, "RGBA")
final.save(os.path.join(ROOT, "build", "icon-master.png"))
print("saved build/icon-master.png")
