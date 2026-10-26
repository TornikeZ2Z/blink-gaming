# The overcharged Brainer's screens for the Charge game, in the LED-dot style of shared/led-face.js (360 x 200 units, dot pitch 11):
# face_error_bg.png: a glitching red error face, X eyes and a zigzag mouth; chest_error.png: a red "!" on the chest.
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import random
OUT = __import__('os').path.dirname(__file__) or '.'
rnd = random.Random(4)
def screen(w, h, radius, bg, unit, pitch, rgrid, dots, rdot, col, glow, glitch=False):
    k = w / 360; im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    base = Image.new('RGBA', (w, h), bg); gl = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(gl)
    cx, cy = w / 2, h / 2
    for i in range(-(180 // pitch), 180 // pitch + 1):
        for j in range(-(100 // pitch), 100 // pitch + 1):
            x, y = cx + i * pitch * k, cy + j * pitch * k; r = rgrid * k
            d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 26))
    base = Image.alpha_composite(base, gl)
    lit = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dl = ImageDraw.Draw(lit)
    for (i, j, c) in dots:
        x, y = cx + i * pitch * k, cy + j * pitch * k; r = rdot * k
        dl.ellipse((x - r, y - r, x + r, y + r), fill=c or col)
    halo = lit.filter(ImageFilter.GaussianBlur(16 * k * 0.5))
    halo = Image.eval(halo, lambda v: min(255, int(v * 1.6)))
    out = Image.alpha_composite(Image.alpha_composite(base, Image.composite(Image.new('RGBA', (w, h), glow), Image.new('RGBA', (w, h), (0, 0, 0, 0)), halo.split()[3])), lit)
    if glitch:   # torn bands: rows shifted sideways, one band still the old blue
        for _ in range(5):
            y0 = rnd.randint(0, h - 40); bh = rnd.randint(8, 46); dx = rnd.randint(-70, 70)
            band = out.crop((0, y0, w, y0 + bh)); out.paste(band, (dx, y0))
        y0 = int(h * 0.68); out.paste(Image.new('RGBA', (w, 22), (53, 80, 240, 255)), (0, y0))
        dd = ImageDraw.Draw(out)
        for _ in range(36):   # dead and stuck dots
            x, y = rnd.randint(0, w), rnd.randint(0, h); r = rnd.choice((3, 5, 8))
            dd.ellipse((x - r, y - r, x + r, y + r), fill=rnd.choice(((0, 0, 0, 255), (255, 60, 80, 255))))
    mask = Image.new('L', (w, h), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius * k, fill=255)
    im.paste(out, (0, 0), mask); return im
def bitmap(rows, ci, cj):
    h, w = len(rows), len(rows[0]); i0, j0 = ci - w // 2, cj - h // 2
    return [(i0 + i, j0 + j, None) for j, row in enumerate(rows) for i, c in enumerate(row) if c == '#']
X = ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#']
ZIG = ['#...#...#...#', '.#.#.#.#.#.#.', '..#...#...#..']
dots = bitmap(X, -6, -2) + bitmap(X, 6, -2) + bitmap(ZIG, 0, 6)
RED = (255, 52, 72, 255)
screen(1080, 600, 73, (46, 6, 14, 255), 1, 11, 3.2, dots, 4.3, RED, (255, 40, 60, 255), glitch=True).save(f'{OUT}/face_error_bg.png')
BANG = ['.#.', '.#.', '.#.', '.#.', '.#.', '...', '.#.']
screen(720, 400, 40, (46, 6, 14, 255), 1, 22, 6, bitmap(BANG, 0, 0), 8.5, RED, (255, 40, 60, 255)).save(f'{OUT}/chest_error.png')
print('ok')
