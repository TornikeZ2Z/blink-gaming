# Link-preview images for brainer.games (1200x630): the visor lockup with game posters on the posters' violet, one for
# the site (assets/share/brainer-games.jpg) and one per game (assets/share/<id>.jpg). Drawn at 2x and scaled down.
# Needs Pillow, fontTools and brotli (to read the site's FiraGO .woff2). Run from the repo root:
#   python -I Website/tools/share-images.py
# A new game: add it to GAMES below once its poster is in Brainer 3D/renders/cards/, then run link-previews.py too.
import io, math, random
from pathlib import Path
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

SITE = Path(__file__).resolve().parents[1]; ROOT = SITE.parent; OUT = SITE / 'assets' / 'share'
K = 2                                   # supersampling
W, H = 1200 * K, 630 * K


def ttf(weight):   # the site's FiraGO, unpacked from .woff2 for Pillow
    f = TTFont(SITE / 'assets' / 'fonts' / 'firago' / f'FiraGO-{weight}.woff2'); f.flavor = None
    b = io.BytesIO(); f.save(b); return b.getvalue()


FONT = {w: ttf(w) for w in ('Regular', 'Bold', 'ExtraBold')}
font = lambda weight, size: ImageFont.truetype(io.BytesIO(FONT[weight]), size)
CARDS = ROOT / 'Brainer 3D' / 'renders' / 'cards'
GAMES = {'space-crash': 'Space Crash', 'multi-charge': 'Multi Charge', 'plane-crash': 'Plane Crash',
         'fly-high': 'Fly High', 'charge': 'Charge'}


def lerp(a, b, t): return tuple(round(x + (y - x) * t) for x, y in zip(a, b))
def hexrgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def background(cx, cy):
    """The posters' violet: lighter at the light source, deeper at the edges, with soft rays and sparkles."""
    inner, mid, outer = hexrgb('#7E62EE'), hexrgb('#5B41CC'), hexrgb('#34217F')
    small = Image.new('RGB', (W // 8, H // 8))
    px = small.load(); r = math.hypot(W, H) / 8
    for y in range(small.height):
        for x in range(small.width):
            d = math.hypot(x - cx / 8, y - cy / 8) / r
            px[x, y] = lerp(inner, mid, min(1, d / .45)) if d < .45 else lerp(mid, outer, min(1, (d - .45) / .55))
    bg = small.resize((W, H), Image.BICUBIC).convert('RGBA')
    rays = Image.new('L', (W, H), 0); d = ImageDraw.Draw(rays)
    n = 22
    for i in range(n):
        if i % 2: continue
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        far = 3 * W
        d.polygon([(cx, cy), (cx + far * math.cos(a0), cy + far * math.sin(a0)), (cx + far * math.cos(a1), cy + far * math.sin(a1))], fill=34)
    rays = rays.filter(ImageFilter.GaussianBlur(14 * K))
    # fade the rays out with distance from the light
    fade = Image.new('L', (W, H), 0); fd = ImageDraw.Draw(fade)
    for i in range(60, 0, -1):
        rr = i / 60 * 1.1 * W; fd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=round(255 * (1 - i / 60)))
    rays = ImageChops.multiply(rays, fade.filter(ImageFilter.GaussianBlur(20 * K)))
    bg = Image.composite(Image.new('RGBA', (W, H), (255, 255, 255, 255)), bg, rays)
    return bg


def sparkles(img, seed, avoid):
    rnd = random.Random(seed); d = ImageDraw.Draw(img, 'RGBA')
    for _ in range(26):
        for _try in range(30):
            x, y = rnd.uniform(.03, .97) * W, rnd.uniform(.05, .95) * H
            if not any(a[0] <= x <= a[2] and a[1] <= y <= a[3] for a in avoid): break
        s = rnd.uniform(5, 15) * K; a = rnd.randint(110, 230)
        d.polygon([(x, y - s), (x + s * .22, y - s * .22), (x + s, y), (x + s * .22, y + s * .22), (x, y + s), (x - s * .22, y + s * .22), (x - s, y), (x - s * .22, y - s * .22)], fill=(255, 255, 255, a))
        if rnd.random() < .35: d.ellipse([x - 2 * K, y - 2 * K, x + 2 * K, y + 2 * K], fill=(160, 230, 255, a))


def rounded(im, radius):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius, fill=255)
    out = im.convert('RGBA'); out.putalpha(m); return out


def poster(name, h, angle):
    im = Image.open(CARDS / f'{name}.png').convert('RGB')
    w = round(h * im.width / im.height)
    card = rounded(im.resize((w, h), Image.LANCZOS), 30 * K)
    ring = Image.new('RGBA', card.size, (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle([0, 0, w - 1, h - 1], 30 * K, outline=(255, 255, 255, 70), width=3 * K)
    card = Image.alpha_composite(card, ring)
    return card.rotate(angle, resample=Image.BICUBIC, expand=True)


def paste_with_shadow(base, card, x, y):
    sh = Image.new('RGBA', (card.width + 160 * K, card.height + 160 * K), (0, 0, 0, 0))
    a = card.split()[3].point(lambda v: v * .55)
    sh.paste((20, 8, 70, 255), (80 * K, 100 * K), a)
    sh = sh.filter(ImageFilter.GaussianBlur(28 * K))
    base.alpha_composite(sh, (x - 80 * K, y - 80 * K))
    base.alpha_composite(card, (x, y))


def visor(h):
    """The site's visor logo (assets/brainer/logo/visor.svg, 64x44, screen blue #3550F0), drawn at height h."""
    s = h / 44; w = round(64 * s)
    g = Image.new('RGBA', (w, h), hexrgb('#3550F0') + (255,))   # the palette's screen blue, flat
    m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], 19 * s, fill=255)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); out.paste(g, (0, 0), m)
    d = ImageDraw.Draw(out)
    d.line([(12 * s, 7.5 * s), (52 * s, 7.5 * s)], fill=(255, 255, 255, 77), width=round(2.6 * s))
    for x0 in (17, 38): d.rounded_rectangle([x0 * s, 14 * s, (x0 + 9) * s, 29 * s], 3.6 * s, fill=(255, 255, 255, 255))
    # a soft white halo so the blue visor stands off the violet
    halo = Image.new('RGBA', (w + 60, h + 60), (0, 0, 0, 0))
    hm = Image.new('L', halo.size, 0); ImageDraw.Draw(hm).rounded_rectangle([30, 30, 30 + w, 30 + h], 19 * s, fill=150)
    halo.paste((255, 255, 255, 255), (0, 0), hm.filter(ImageFilter.GaussianBlur(14)))
    halo.alpha_composite(out, (30, 30))
    return halo


def text(base, xy, s, size, weight, fill=(255, 255, 255, 255), shadow=True):
    f = font(weight, size)
    if shadow:
        sh = Image.new('RGBA', base.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).text((xy[0], xy[1] + 4 * K), s, font=f, fill=(20, 8, 70, 120))
        base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(8 * K)))
    ImageDraw.Draw(base).text(xy, s, font=f, fill=fill)
    return ImageDraw.Draw(base).textbbox(xy, s, font=f)


def lockup(base, x, y, vh, size):
    v = visor(vh); base.alpha_composite(v, (x - 30, y - 30))
    vw = v.width - 60
    f = font('ExtraBold', size)
    tb = ImageDraw.Draw(base).textbbox((0, 0), 'Brainer Games', font=f)
    ty = y + (vh - (tb[3] - tb[1])) / 2 - tb[1]
    return text(base, (x + vw + round(vh * .32), ty), 'Brainer Games', size, 'ExtraBold')


def save(img, name):
    out = img.convert('RGB').resize((1200, 630), Image.LANCZOS)
    p = OUT / f'{name}.jpg'; out.save(p, 'JPEG', quality=88, optimize=True, progressive=True); print(p.name, p.stat().st_size)


OUT.mkdir(parents=True, exist_ok=True)

# the site image: the lockup and the tagline on the left, two posters fanned on the right, both Brainers in view
img = background(cx=int(W * .74), cy=int(H * .42))
sparkles(img, 7, [(W * .48, 0, W, H), (W * .03, H * .28, W * .52, H * .66)])
paste_with_shadow(img, poster('plane-crash', int(H * .66), -5), int(W * .505), int(H * .15))
paste_with_shadow(img, poster('space-crash', int(H * .70), 5), int(W * .705), int(H * .10))
lockup(img, int(W * .06), int(H * .35), 76 * K, 58 * K)
text(img, (int(W * .06), int(H * .35) + 104 * K), 'Instant games for casinos', 36 * K, 'Bold', fill=(240, 236, 255, 255))
save(img, 'brainer-games')

# one per game: its poster large on the right, the lockup and the game's name on the left
for gid, title in GAMES.items():
    img = background(cx=int(W * .72), cy=int(H * .40))
    sparkles(img, sum(map(ord, gid)), [(W * .55, 0, W, H), (W * .03, H * .24, W * .56, H * .72)])
    paste_with_shadow(img, poster(gid, int(H * .86), 3), int(W * .60), int(H * .04))
    lockup(img, int(W * .06), int(H * .30), 58 * K, 44 * K)
    text(img, (int(W * .06) - 4 * K, int(H * .30) + 92 * K), title, 96 * K, 'ExtraBold')
    save(img, gid)
