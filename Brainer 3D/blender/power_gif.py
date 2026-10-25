# The power-on as a looping clip: each frame of the screen set in a flat drawing of the head.
import os, glob
from PIL import Image, ImageDraw
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'))
W, H = 640, 420
base = Image.new('RGBA', (W, H), (99, 82, 245, 255)); d = ImageDraw.Draw(base)
for sd in (-1, 1): d.ellipse((W / 2 + sd * 300 - 42, H / 2 - 50, W / 2 + sd * 300 + 42, H / 2 + 50), fill=(90, 63, 252, 255))   # ears
d.rounded_rectangle((W / 2 - 290, H / 2 - 175, W / 2 + 290, H / 2 + 175), radius=150, fill=(255, 255, 255, 255))      # the head
frames = []
for f in sorted(glob.glob('power/f*.png')):
    fr = base.copy(); sc = Image.open(f).convert('RGBA').resize((520, 289), Image.LANCZOS)
    fr.alpha_composite(sc, ((W - 520) // 2, (H - 289) // 2))
    frames.append(fr.convert('RGB').quantize(colors=128, method=Image.Quantize.MEDIANCUT))
frames[0].save('Brainer-power-on.gif', save_all=True, append_images=frames[1:], duration=33, loop=0, optimize=True)
print(len(frames), 'frames', os.path.getsize('Brainer-power-on.gif') // 1024, 'KB')
