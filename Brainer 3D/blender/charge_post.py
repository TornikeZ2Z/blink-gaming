# Finishing for the Charge renders (usage: python charge_post.py <in.png> <out.png>): a bloom only on what is much brighter than its surroundings (the arcs, the glowing
# rings, the LED dots, sparks), so big white surfaces in the sun don't glow; and the clouds' olive undersides turned a
# neutral grey, in the sky only (above the horizon line, where the pixel is cloud-bright and not green land).
import sys
import numpy as np
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(np.float32) / 255
h = a.shape[0]
r, g, b = a[..., 0], a[..., 1], a[..., 2]
sky = np.zeros(a.shape[:2], bool); sky[: int(h * 0.2)] = True
olive = sky & (g > b + 0.03) & (r > b) & (a.mean(axis=2) > 0.45)
grey = a.mean(axis=2, keepdims=True) * np.array([0.98, 0.99, 1.04])
a = np.where(olive[..., None], a * 0.4 + grey * 0.6, a)
lum = a.max(axis=2)
local = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))).astype(np.float32) / 255
src_m = np.clip((lum - local - 0.06) * 5, 0, 1) * np.clip((lum - 0.6) * 3, 0, 1)
m = src_m[..., None] * a
mi = Image.fromarray((m * 255).astype(np.uint8))
glow = sum(np.asarray(mi.filter(ImageFilter.GaussianBlur(rad))).astype(np.float32) / 255 * w for rad, w in ((3, 1.0), (10, 1.3), (30, 1.1)))
tint = np.array([0.8, 0.95, 1.0])
out = 1 - (1 - a) * (1 - np.clip(glow * tint, 0, 1))
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(dst)
print('ok', dst)
