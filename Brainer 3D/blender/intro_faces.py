# The LED screens of the games' intro clip, one PNG per frame: the visor starts off, lights up as the Brainer Games logo
# (its gradient, gloss line and two white eyes, website/assets/brainer/logo/visor.svg scaled onto the visor), blinks,
# then wakes into the LED dot face. The chest screen shows the stage number, then a battery charging.
# usage: python intro_faces.py <game> <out dir>      (run from this folder; needs Pillow)
import os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from intro_timeline import OFF_END, FLICKER, EYES, WAKE, ACTIONS, keyed

GAME, OUT = sys.argv[1], sys.argv[2]
A = ACTIONS[GAME]
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
img = lambda n: Image.open(os.path.join(HERE, n)).convert('RGBA')
OFF, SHAPE = img('face_power_off_bg.png'), img('face_pixel_happy_bg.png').getchannel('A')
FACES = {k: img(f'face_pixel_{k}_bg.png') for k in ('happy', 'excited')}
W, H = OFF.size   # 1080 x 600

def gradient(w, h, c0, c1):   # the logo's diagonal gradient, top left to bottom right
    g = Image.new('L', (w, h)); g.putdata([round(255 * (x / w + y / h) / 2) for y in range(h) for x in range(w)])
    return Image.composite(Image.new('RGBA', (w, h), c1), Image.new('RGBA', (w, h), c0), g)
LOGO_BG = gradient(W, H, '#3f7bff', '#5a32fb')
S = H / 44   # the logo's 64 x 44 units onto the visor's height

def logo(alpha, eye):   # the logo on the visor: its screen at alpha, the eyes squashed to eye (1 open, 0.12 shut)
    top = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(top)
    gloss = Image.new('RGBA', (W, H)); r = 1.3 * S
    ImageDraw.Draw(gloss).rounded_rectangle([W / 2 - 20 * S - r, 7.5 * S - r, W / 2 + 20 * S + r, 7.5 * S + r], radius=r, fill=(255, 255, 255, 77))
    for cx in (W / 2 - 10.5 * S, W / 2 + 10.5 * S):
        ew, eh = 9 * S, 15 * S * eye; cy = 21.5 * S
        d.rounded_rectangle([cx - ew / 2, cy - eh / 2, cx + ew / 2, cy + eh / 2], radius=min(3.6 * S, eh / 2), fill='#ffffff')
    lay = Image.alpha_composite(Image.alpha_composite(LOGO_BG, gloss), top)
    lay.putalpha(ImageChops.multiply(SHAPE, Image.new('L', (W, H), round(255 * alpha))))
    return Image.alpha_composite(OFF, lay)

def face(f):
    w0, w1, w2 = WAKE
    if f < OFF_END: return OFF
    if f < w1: return logo(keyed(FLICKER, f), keyed(EYES, f) if f < w0 else keyed([(w0, 1.0), (w1, 0.12)], f))
    led = FACES['excited' if f >= A['excited'] else 'happy']
    if f < w2: return Image.blend(logo(1, 0.12), led, (f - w1) / (w2 - w1))   # the shut logo eyes open as the LED face
    return led

CHEST = Image.open(os.path.join(HERE, 'num_1.png')).convert('RGBA')
def chest(f):   # the stage number, then a battery filling cell by cell while it charges
    c0, c1 = A.get('charge', (10 ** 6, 10 ** 6))
    if f < c0: return CHEST
    w, h = CHEST.size; im = Image.new('RGBA', (w, h)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=60, fill='#3550f0')
    dots = Image.new('RGBA', (w, h)); dd = ImageDraw.Draw(dots)
    for y in range(22, h, 44):
        for x in range(52, w, 44): dd.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(255, 255, 255, 40))
    im = Image.alpha_composite(im, dots); im.putalpha(CHEST.getchannel('A'))
    bx, by, bw, bh = 150, 110, 380, 180
    glow = Image.new('RGBA', (w, h)); gd = ImageDraw.Draw(glow)
    gd.rounded_rectangle([bx, by, bx + bw, by + bh], radius=34, outline='#ffffff', width=22); gd.rounded_rectangle([bx + bw + 12, by + 55, bx + bw + 46, by + bh - 55], radius=10, fill='#ffffff')
    n = min(4, int((f - c0) / max(1, (c1 - c0)) * 5))
    for k in range(n): gd.rounded_rectangle([bx + 30 + k * 84, by + 30, bx + 30 + k * 84 + 66, by + bh - 30], radius=12, fill='#7FF0FF')
    im = Image.alpha_composite(im, glow.filter(ImageFilter.GaussianBlur(10))); im = Image.alpha_composite(im, glow)
    return im

for f in range(1, A['end'] + 1):
    face(f).save(os.path.join(OUT, f'face_{f:04d}.png')); chest(f).save(os.path.join(OUT, f'chest_{f:04d}.png'))
print('faces', OUT, A['end'])
