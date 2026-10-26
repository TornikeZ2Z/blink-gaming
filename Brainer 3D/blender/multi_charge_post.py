# Multi Charge's set, finished for the game (usage: python multi_charge_post.py <set.png> <set.json> <game folder> [stills folder]):
# Charge's bloom (charge_post.py, run as it is, with its sky line moved to this taller frame's horizon; in the lab it
# finds no sky clouds to fix), then assets/set.webp, and assets/scene.js: the pillars from set.json, a tiny preview of
# the set for slow lines, and the Brainer stills (sprites) at Charge's frame offset (ox, oy). With a stills folder
# (multi_charge_assets.py's sprites mode) the stills are the lab-lit ones, written to assets/bot; without it, Charge's.
import base64, io, json, os, re, sys
from PIL import Image

src, info_path, game = sys.argv[1], sys.argv[2], sys.argv[3]
stills = sys.argv[4] if len(sys.argv) > 4 else None
HERE = os.path.dirname(os.path.abspath(__file__))
info = json.load(open(info_path))
bloomed = os.path.splitext(src)[0] + '-post.png'
code = open(os.path.join(HERE, 'charge_post.py'), encoding='utf-8').read()
sky = (info['oy'] + 216) / info['h']   # Charge treats its top 216 rows as sky; here they start oy rows lower
assert 'int(h * 0.2)' in code, 'charge_post.py changed: check where it sets the sky line'
sys.argv = ['charge_post.py', src, bloomed]
exec(compile(code.replace('int(h * 0.2)', f'int(h * {sky:.4f})'), 'charge_post.py', 'exec'), {'__name__': '__main__'})

im = Image.open(bloomed).convert('RGB')
im.save(os.path.join(game, 'assets', 'set.webp'), 'WEBP', quality=76, method=6)
buf = io.BytesIO(); im.resize((48, round(48 * im.height / im.width)), Image.LANCZOS).save(buf, 'WEBP', quality=40)
lqip = 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

if stills:
    sprites = json.load(open(os.path.join(stills, 'sprites.json')))
    for key in sprites: Image.open(os.path.join(stills, f'sprite-{key}.png')).save(os.path.join(game, 'assets', 'bot', f'{key}.webp'), 'WEBP', quality=84, method=6)
else:
    charge = open(os.path.join(game, '..', 'Game #4 - Charge', 'assets', 'scene.js'), encoding='utf-8').read()
    sprites = json.loads(re.search(r'window\.CHARGE_SCENE = (\{.*\});', charge, re.S).group(1))['sprites']
scene = {'set': {k: v for k, v in info.items() if k != 'check'}, 'sprites': sprites, 'lqip': lqip}
with open(os.path.join(game, 'assets', 'scene.js'), 'w', encoding='utf-8') as f:
    f.write(f"// Where Multi Charge's lab sits in its {info['w']} x {info['h']} render (from Brainer 3D/blender/multi_charge_assets.py and\n"
            "// multi_charge_post.py). Charge's 1920 x 1080 frame sits inside it at (set.ox, set.oy): the Brainer stills (sprites,\n"
            "// in Charge's pixels) and the live 3D Brainer (bot.js) are placed in that frame. pillars: 1 to 5, left to right, each\n"
            "// with its terminal, its five glow bands, its crown (the halo) and its base. lqip: a 48 px wide preview.\n")
    f.write('window.CHARGE_SCENE = ' + json.dumps(scene, separators=(',', ':')) + ';\n')
print('ok', os.path.getsize(os.path.join(game, 'assets', 'set.webp')), 'bytes')
