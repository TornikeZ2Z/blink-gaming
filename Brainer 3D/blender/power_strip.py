# Key frames of the power-on side by side, to check the sequence at a glance.
import os
from PIL import Image, ImageDraw, ImageFont
os.chdir(os.path.dirname(os.path.abspath(__file__)))
keys = ['off', 'dot', 'line', 'open', 'grid', 'face', 'on']
ims = [Image.open(f'face_power_{k}_bg.png').convert('RGBA').resize((540, 300), Image.LANCZOS) for k in keys]
W = 40 + len(ims) * 570; c = Image.new('RGBA', (W, 400), (90, 80, 240, 255)); d = ImageDraw.Draw(c)
f = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 30)
for i, (im, k) in enumerate(zip(ims, keys)):
    c.alpha_composite(im, (40 + i * 570, 30)); d.text((40 + i * 570 + 270, 345), k, font=f, fill='white', anchor='mt')
c.convert('RGB').save('out/power_strip.png'); print('ok')
