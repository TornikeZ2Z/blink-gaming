# Puts the hero render and its face close-up side by side on the brand gradient.
import sys, os
from PIL import Image, ImageDraw, ImageFont
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
tag = sys.argv[1]
a = Image.open(f'hero_{tag}.png').convert('RGBA'); b = Image.open(f'heroface_{tag}.png').convert('RGBA')
W = a.width + b.width; H = max(a.height, b.height) + 120
canvas = Image.new('RGBA', (W, H)); px = canvas.load()
for y in range(H):
    t = y / H; row = tuple(int(p + (q - p) * t) for p, q in zip((75, 54, 252), (205, 208, 255))) + (255,)
    for x in range(W): px[x, y] = row
canvas.alpha_composite(a, (0, 120)); canvas.alpha_composite(b, (a.width, 120))
d = ImageDraw.Draw(canvas)
d.text((50, 30), 'Close-up: fully blue screen, carved brain', font=ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 54), fill='white')
canvas.convert('RGB').save(f'Hero-{tag}.png'); print('saved', f'Hero-{tag}.png', canvas.size)
