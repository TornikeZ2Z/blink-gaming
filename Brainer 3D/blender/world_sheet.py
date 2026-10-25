# One sheet per world look: the whole world on top, the two game views underneath. usage: python world_sheet.py <theme> "<title>"
import sys, os
from PIL import Image, ImageDraw, ImageFont
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
theme, title = sys.argv[1], sys.argv[2]
big = Image.open(f'world_{theme}_establish.png').convert('RGB')
small = [Image.open(f'world_{theme}_{v}.png').convert('RGB') for v in ('plane', 'fog')]
W = big.width; gap = 24; sw = (W - gap) // 2; sh = sw * 9 // 16
top = 120; lab = 56
canvas = Image.new('RGB', (W, top + big.height + lab + sh + lab), (44, 30, 150)); d = ImageDraw.Draw(canvas)
f1 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 58); f2 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 32)
d.text((40, 28), title, font=f1, fill='white')
canvas.paste(big, (0, top)); d.text((40, top + big.height + 10), 'The whole world: the airfield, and the foggy valley beside it', font=f2, fill=(220, 215, 255))
y = top + big.height + lab
for i, (im, label) in enumerate(zip(small, ('Plane Crash: flying over it', 'FogRush: down in the valley'))):
    canvas.paste(im.resize((sw, sh), Image.LANCZOS), (i * (sw + gap), y)); d.text((i * (sw + gap) + 30, y + sh + 10), label, font=f2, fill=(220, 215, 255))
canvas.save(f'World-{theme}.jpg', quality=90); print('saved', canvas.size)
