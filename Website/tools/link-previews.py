# Adds link-preview tags (Open Graph + Twitter) to every page of Website/, and writes one static page per game
# (game-<id>.html, from game.html) so each game previews with its own picture; link crawlers don't run scripts, so a
# game.html?g=<id> link can only ever preview as the site. Re-runnable: it replaces its own block and the game pages.
# Needs Node (to read data.js). Run from the repo root after any change to a page's title or description, to
# game.html, or to the games in data.js:
#   python -I Website/tools/link-previews.py
import html, json, re, subprocess
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
ORIGIN = 'https://brainer.games'
CRLF = chr(13) + chr(10)

games = json.loads(subprocess.check_output(['node', '-e', """
global.window = {}; global.location = { pathname: '/' };
eval(require('fs').readFileSync(process.argv[1], 'utf8'));
console.log(JSON.stringify(window.BRAINER.GAMES.map(g => ({ id: g.id, title: g.title, tagline: g.tagline }))));
""", str(SITE / 'assets' / 'js' / 'data.js')], text=True))


def nl(p):   # keep each file's line endings
    return CRLF if CRLF.encode() in p.read_bytes() else '\n'


START, END = '<!-- link preview -->', '<!-- /link preview -->'
esc = lambda s: html.escape(s, quote=True)


def block(title, desc, url, image, alt):
    return '\n'.join([START,
        '<meta property="og:type" content="website">', '<meta property="og:site_name" content="Brainer Games">',
        f'<meta property="og:title" content="{esc(title)}">', f'<meta property="og:description" content="{esc(desc)}">',
        f'<meta property="og:url" content="{esc(url)}">', f'<meta property="og:image" content="{esc(image)}">',
        '<meta property="og:image:type" content="image/jpeg">', '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{esc(alt)}">', '<meta name="twitter:card" content="summary_large_image">', END])


def untag(src):
    return re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n', '', src, flags=re.S)


def tag(src, title, desc, url, image, alt):
    src = untag(src)
    m = re.search(r'<meta name="description" content="[^"]*">\n', src)
    return src[:m.end()] + block(title, desc, url, image, alt) + '\n' + src[m.end():]


SITE_IMG = f'{ORIGIN}/assets/share/brainer-games.jpg'
SITE_ALT = 'Brainer Games: instant games for casinos, with the Brainer in Plane Crash and Space Crash'
for p in sorted(SITE.glob('*.html')):
    if p.name.startswith('game-'): continue
    s = p.read_text(encoding='utf-8')
    title = html.unescape(re.search(r'<title>([^<]*)</title>', s).group(1))
    desc = html.unescape(re.search(r'<meta name="description" content="([^"]*)">', s).group(1))
    url = f'{ORIGIN}/' if p.name == 'index.html' else f'{ORIGIN}/{p.name}'
    p.write_text(tag(s, title, desc, url, SITE_IMG, SITE_ALT), encoding='utf-8', newline=nl(p))
    print('tagged', p.name)

# one static page per game: game.html with its own title, description, preview and data-game
gpath = SITE / 'game.html'
base = untag(gpath.read_text(encoding='utf-8'))
for old in SITE.glob('game-*.html'): old.unlink()
for g in games:
    title, desc = f"{g['title']} · Brainer Games", f"{g['tagline']} A playable demo with play money, for 18+."
    s = base.replace('<title>Game · Brainer Games</title>', f'<title>{esc(title)}</title>')
    s = re.sub(r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{esc(desc)}">', s)
    s = s.replace('<body data-page="games">', f'<body data-page="games" data-game="{g["id"]}">')
    s = tag(s, title, desc, f"{ORIGIN}/game-{g['id']}.html", f"{ORIGIN}/assets/share/{g['id']}.jpg", f"{g['title']} by Brainer Games, with the Brainer in the game")
    (SITE / f"game-{g['id']}.html").write_text(s, encoding='utf-8', newline=nl(gpath))
    print('wrote', f"game-{g['id']}.html")
