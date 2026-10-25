# Puts lineup renders on the brand background with a title and stage labels. usage: python compose.py <dir> <title>
import sys, os
from PIL import Image, ImageDraw, ImageFont
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
dirn, title = sys.argv[1], sys.argv[2]
names = sys.argv[3].split('|') if len(sys.argv) > 3 else []
rows = [Image.open(f'lineup_{dirn}{r}.png').convert('RGBA') for r in (1, 2)]
W, H = rows[0].size; top = 130; lab = 60
canvas = Image.new('RGBA', (W, top + (H + lab) * 2))
px = canvas.load()
for y in range(canvas.height):
    t = y / canvas.height; row = tuple(int(a + (b - a) * t) for a, b in zip((75, 54, 252), (205, 208, 255))) + (255,)
    for x in range(W): px[x, y] = row
f1 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 64); f2 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 30); f3 = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 24)
d = ImageDraw.Draw(canvas)
d.text((60, 30), title, font=f1, fill='white')
for r, im in enumerate(rows):
    y0 = top + r * (H + lab)
    canvas.alpha_composite(im, (0, y0))
    for i in range(5):
        s = r * 5 + i + 1; cx = int(W / 2 + (i - 2) * W * 2.4 / 12.0)
        d.text((cx, y0 + H + 8), f'Stage {s} · levels {(s - 1) * 10 + 1}–{s * 10}', font=f2, fill='white', anchor='mt')
        if names: d.text((cx, y0 + H - 34), names[s - 1], font=f3, fill=(40, 30, 110), anchor='mt')
canvas.convert('RGB').save(f'Directions-{dirn}.png'); print('saved', f'Directions-{dirn}.png', canvas.size)
