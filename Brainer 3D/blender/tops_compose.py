# Puts the brain-placement options side by side on the brand gradient with a title and a caption each.
import os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFont
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
opts = [('clean', '1 · Clean head', 'No brain on the body at all'),
        ('heart', '2 · Brain heart', 'It lives in a glass window in the chest'),
        ('ears', '3 · Left & right brain', 'One lobe glowing in each ear'),
        ('bulb', '4 · Idea bulb', 'A tiny lit brain in a bulb on the antenna'),
        ('helmet', '5 · Brain-shaped head', 'The head top is moulded like a brain, in white')]
if len(sys.argv) > 3: opts = [tuple(o.split('|')) for o in sys.argv[3].split(';')]   # usage: tops_compose.py <out> <title> 'key|name|line;...'
ims = [Image.open(f'top_{k}.png').convert('RGBA') for k, _, _ in opts]
w, h = ims[0].size; top = 130; cap = 120
canvas = Image.new('RGBA', (w * len(ims), top + h + cap)); px = canvas.load()
for y in range(canvas.height):
    t = y / canvas.height; row = tuple(int(p + (q - p) * t) for p, q in zip((75, 54, 252), (205, 208, 255))) + (255,)
    for x in range(canvas.width): px[x, y] = row
d = ImageDraw.Draw(canvas)
title = sys.argv[2] if len(sys.argv) > 2 else 'Where should the brain live?'
d.text((60, 32), title, font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 64), fill='white')
f2 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 40); f3 = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 30)
fade = Image.new('L', (w, h)); fp = fade.load()
for x in range(w):   # each render's floor shadow fades out at its edges, so the panels join without seams
    a = int(255 * min(1, x / 140, (w - 1 - x) / 140))
    for y in range(h): fp[x, y] = a
for i, (im, (_, name, line)) in enumerate(zip(ims, opts)):
    r, g, b, al = im.split(); im = Image.merge('RGBA', (r, g, b, ImageChops.multiply(al, fade)))
    canvas.alpha_composite(im, (i * w, top))
    d.text((i * w + w // 2, top + h + 6), name, font=f2, fill=(30, 20, 100), anchor='mt')
    d.text((i * w + w // 2, top + h + 58), line, font=f3, fill=(40, 30, 110), anchor='mt')
name = sys.argv[1] if len(sys.argv) > 1 else 'Brain-placement'
out = canvas.convert('RGB'); out.save(f'{name}.png')
out.resize((out.width // 2, out.height // 2), Image.LANCZOS).save(f'{name}-small.png'); print('saved', out.size)
