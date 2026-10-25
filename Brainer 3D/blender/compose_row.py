# One lineup row on the brand gradient with a title and a name under each figure. usage: python compose_row.py <lineup> <out> <title> "n1|n2|..."
import sys, os
from PIL import Image, ImageDraw, ImageFont
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
src, out, title, names = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4].split('|')
im = Image.open(f'{src}.png').convert('RGBA'); W, H = im.size; top = 130; lab = 70
canvas = Image.new('RGBA', (W, top + H + lab)); px = canvas.load()
for y in range(canvas.height):
    t = y / canvas.height; row = tuple(int(a + (b - a) * t) for a, b in zip((75, 54, 252), (205, 208, 255))) + (255,)
    for x in range(W): px[x, y] = row
canvas.alpha_composite(im, (0, top)); d = ImageDraw.Draw(canvas)
d.text((60, 30), title, font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 64), fill='white')
f2 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 34)
for i, n in enumerate(names):
    d.text((int(W / 2 + (i - 2) * W * 2.4 / 12.0), top + H + 10), n, font=f2, fill=(30, 20, 100), anchor='mt')
canvas.convert('RGB').save(f'{out}.png'); print('saved', out)
