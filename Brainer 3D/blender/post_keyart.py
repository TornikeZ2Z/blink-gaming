# Finishes the key art renders (python post_keyart.py <dir> <name> [out]): a glow round the bright flames and arcs, and
# for the poster cards and the diorama the painted background the transparent render goes on.
#   poster   brand violet, lighter behind the Brainer, soft rays fanning from it, sparkles and speed streaks; the game
#            cards (cards.py: fly-high, plane-crash, charge, multi-charge, space-crash) are posters with their own touches
#   diorama  a soft lavender ground with a pale halo
import sys, os, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
d, look = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(d, f'card_{look}.png')
im = Image.open(os.path.join(d, f'keyart_{look}.png')).convert('RGBA'); W, H = im.size
render = im.copy()   # the glows come from the rendered pieces only, never the painted background
rnd = random.Random(3)

def radial(c0, c1, cx, cy, r):   # c0 at (cx, cy) fading to c1 at distance r and beyond
    g = Image.new('L', (W, H)); px = g.load()
    for y in range(H):
        for x in range(W): px[x, y] = int(255 * min(1, math.hypot(x - cx, y - cy) / r))
    return Image.composite(Image.new('RGBA', (W, H), c1), Image.new('RGBA', (W, H), c0), g)

# where the Brainer is: the middle of its opaque pixels
box = im.getchannel('A').point(lambda a: 255 if a > 200 else 0).getbbox() or (0, 0, W, H)
cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2.6
# per card: the streaks' direction (none for the standing scenes), sparkle colours, and the space card's deeper violet
VARIANT = {'poster': dict(streak=(-0.55, 0.85)), 'fly-high': dict(streak=(-0.55, 0.85)), 'plane-crash': dict(streak=(-0.95, 0.3)),
           'charge': dict(streak=None, sparks=((255, 255, 255), (150, 245, 255))), 'multi-charge': dict(streak=None, sparks=((255, 255, 255), (150, 245, 255))),
           'space-crash': dict(streak=(-0.25, 0.97), deep=True)}
if look in VARIANT:
    v = VARIANT[look]
    bg = radial((140, 110, 255, 255), (52, 28, 168, 255), cx, cy, max(W, H) * 0.85) if not v.get('deep') else radial((118, 84, 246, 255), (22, 10, 78, 255), cx, cy, max(W, H) * 0.8)
    if v.get('deep'):   # a field of small stars on the space card
        st = Image.new('RGBA', (W, H)); sd0 = ImageDraw.Draw(st)
        for k in range(int(W * H / 2600)):
            x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.choice((0.6, 0.8, 1.0, 1.4)) * W / 800
            sd0.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, rnd.randint(90, 230)))
        bg.alpha_composite(st)
    rays = Image.new('L', (W, H)); rd = ImageDraw.Draw(rays)
    for k in range(18):   # soft rays fanning out from behind the Brainer
        a = k / 18 * math.tau + 0.1; w = 0.07
        rd.polygon([(cx, cy), (cx + math.cos(a - w) * W * 2, cy + math.sin(a - w) * W * 2), (cx + math.cos(a + w) * W * 2, cy + math.sin(a + w) * W * 2)], fill=34)
    rays = rays.filter(ImageFilter.GaussianBlur(W / 60))
    bg = Image.composite(Image.new('RGBA', (W, H), (190, 170, 255, 255)), bg, rays)
    streaks = Image.new('RGBA', (W, H)); sd = ImageDraw.Draw(streaks)
    if v.get('streak'):   # speed streaks along the motion, trailing behind the Brainer
        ux, uy = v['streak']
        for k in range(16):
            x = rnd.uniform(-0.1, 1.0) * W; y = rnd.uniform(0.15, 0.95) * H; l = rnd.uniform(0.08, 0.22) * W
            sd.line([(x, y), (x + l * ux, y + l * uy)], fill=(255, 255, 255, rnd.randint(40, 95)), width=max(1, W // 300))
    bg.alpha_composite(streaks.filter(ImageFilter.GaussianBlur(0.6)))
    for k in range(10):   # a few sparkles
        x, y, r = rnd.uniform(0.05, 0.95) * W, rnd.uniform(0.05, 0.7) * H, rnd.uniform(0.006, 0.014) * W
        sp = Image.new('RGBA', (W, H)); spd = ImageDraw.Draw(sp)
        col = (*rnd.choice(v.get('sparks', ((255, 255, 255),))), 210)
        spd.polygon([(x, y - r * 2.4), (x + r * 0.45, y), (x, y + r * 2.4), (x - r * 0.45, y)], fill=col); spd.polygon([(x - r * 2.4, y), (x, y + r * 0.45), (x + r * 2.4, y), (x, y - r * 0.45)], fill=col)
        bg.alpha_composite(sp)
    bg.alpha_composite(im); im = bg
elif look == 'diorama':
    bg = radial((246, 242, 255, 255), (184, 172, 246, 255), W / 2, H * 0.48, max(W, H) * 0.8)
    bg.alpha_composite(im); im = bg
# a glow round the flames and arcs: warm bright pixels glow orange, cool bright ones cyan
rgb = im.convert('RGB'); r, g, b, a = render.split(); solid = a.point(lambda q: 255 if q > 128 else 0)
hot = ImageChops.multiply(ImageChops.multiply(r.point(lambda q: 255 if q > 235 else 0), b.point(lambda q: 255 if q < 190 else 0)), solid)
cold = ImageChops.multiply(ImageChops.multiply(b.point(lambda q: 255 if q > 245 else 0), r.point(lambda q: 255 if q < 200 else 0)), solid)
glow = Image.merge('RGB', (hot, ImageChops.add(hot.point(lambda q: q * 170 // 255), cold.point(lambda q: q * 200 // 255)), ImageChops.add(hot.point(lambda q: q * 60 // 255), cold))).filter(ImageFilter.GaussianBlur(W / 40))
im = Image.composite(ImageChops.screen(rgb, glow), rgb, Image.new('L', (W, H), 255)).convert('RGB')
im.save(out); print('saved', out, im.size)
