# A board to choose the key-art look: each finished card as the site shows it (rounded, the title on a dark fade at the
# foot), side by side with its name. usage: python keyart_board.py <dir> <out.png> look:Label:line ...
import sys, os
from PIL import Image, ImageDraw, ImageFont
d, out, specs = sys.argv[1], sys.argv[2], [a.split(':', 2) for a in sys.argv[3:]]
CW, CH, GAP, TOP, FOOT = 480, 600, 40, 150, 120
F = lambda size, bold=True: ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf', size)
board = Image.new('RGB', (GAP + len(specs) * (CW + GAP), TOP + CH + FOOT), (14, 18, 34)); bd = ImageDraw.Draw(board)
bd.text((GAP, 40), 'Game card art: which look?', font=F(52), fill='white')
bd.text((GAP, 104), 'Fly High as the test. The chosen look then goes to all five games.', font=F(26, False), fill=(170, 180, 214))
for i, (look, label, line) in enumerate(specs):
    card = Image.open(os.path.join(d, f'card_{look}.png')).convert('RGB').resize((CW, CH), Image.LANCZOS)
    fade = Image.new('L', (CW, CH)); fp = fade.load()   # the site's dark fade under the title
    for y in range(CH):
        a = max(0, (y - CH * 0.62) / (CH * 0.38)); v = int(200 * a ** 1.4)
        for x in range(CW): fp[x, y] = v
    card = Image.composite(Image.new('RGB', (CW, CH), (12, 10, 40)), card, fade)
    cd = ImageDraw.Draw(card); cd.text((26, CH - 82), 'Fly High', font=F(40), fill='white'); cd.text((28, CH - 34), 'CRASH', font=F(18), fill=(220, 220, 240))
    mask = Image.new('L', (CW, CH)); ImageDraw.Draw(mask).rounded_rectangle((0, 0, CW - 1, CH - 1), 28, fill=255)
    x = GAP + i * (CW + GAP); board.paste(card, (x, TOP), mask)
    bd.text((x, TOP + CH + 18), label, font=F(32), fill='white'); bd.text((x, TOP + CH + 62), line, font=F(22, False), fill=(170, 180, 214))
board.save(out); print('saved', out, board.size)
