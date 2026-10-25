# Brainer Games website

B2B studio site for aggregators and casino operators, in Brainer direction A ("brand book, light"), which Tornike picked on 2026-10-25. It follows the old Brainer brand book: white pages, the diagonal violet gradient, the five level colours and the ten Brainer robots. Plain HTML, CSS and JavaScript with no build step, same as the games.

## Run it

From the repo root, serve the whole folder so the site can reach the game folders:

```bash
python -m http.server 5174
```

Then open http://localhost:5174/Website/. In Claude Code the `website` entry in `.claude/launch.json` does the same.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home: core message with the live 3D Brainer, the six selling points, Brain cells (the ten robot levels, with the visitor's own Brainer marked once they have played), games, the three steps to go live, fairness sample, call to request a demo. The hero numbers sum up the live games in `data.js` |
| `games.html` | Every game from the catalogue |
| `game.html?g=<id>` | One game: playable demo with full screen, how to play, the odds (Plane Crash: difficulties with bombs, paths, first and top multipliers; FogRush: every tile type with its chance and multiplier), fairness and specs |
| `operators.html` | Skins, promo tools, player-facing qualities, compliance status, integration routes |
| `fairness.html` | How provably fair works, with a working SHA-256 checker |
| `contact.html` | Demo request form (not connected yet; says so and keeps what was typed) |
| `responsible-gaming.html`, `terms.html`, `privacy.html` | Short legal pages for the demo stage |

The home hero's 3D Brainer is the game team's component `shared/brainer-showcase.js` (model `shared/models/brainer.glb`, three.js from `shared/vendor/`), mounted by `assets/js/hero-3d.js`: its screen switches on, it grows through the ten stages (Baby to Master), and visitors pick stages and faces, switch it off and on and turn it. An inline script in `index.html` points the `three` import map and the component at `shared/` when published or `../shared/` in the repo. Without WebGL the robot still in the markup shows instead. `window.brainer3d` exposes `setStage`, `setFace` and `setPower` for other parts of the page.

Header, footer, menu drawer and the 18+ check are drawn by `assets/js/site.js` on every page. Any element with `data-games` fills itself with game cards, `data-ladder` with the ten Brainer stages and `data-tiers` with the five level colours.

## Brand assets

`assets/fonts/firago/` holds FiraGO Regular, Bold and ExtraBold (see Typeface below). `assets/brainer/logo/` holds files downloaded from Tornike's Brainer Drive on 2026-10-25 with his OK (`logo-white.png` is the B on the gradient tile, `logo-blue.png` the gradient B on white, `logo-mono.png` a small B + "Brainer" lockup, `favicon.png`). `assets/brainer/robots/1.webp` to `10.webp` are the ten stage stills, Baby to Master, one per ten brain levels: the game team's renders of the 3D Brainer (`Brainer 3D/renders/stages/`, 500x500, transparent), with the contact shadow faded out at the left, right and bottom edges and saved as WebP, about 35 KB each. They replaced the brand book's flat robots on 2026-10-25.

## Common changes

- **Add or rename a game:** edit `GAMES` in `assets/js/data.js`. A playable game needs `src` (its `index.html`, with spaces as `%20` and `#` as `%23`; published, each game sits in its own folder next to the site) and `art` (a 4:5 image in `assets/games/`). Specs, odds, rules, the fairness paragraph and downloads all come from the same entry; `round` is the word for one round ("flight" in Plane Crash). The odds show as difficulties when the entry has `levels` and as tiles and chests when it has `chests`.
- **Typeface:** FiraGO for all text, Latin and Georgian (Tornike's pick, 2026-10-25): headings 700, h1 800, body 400. The three `.woff2` files in `assets/fonts/firago/` come from the Brainer Drive's Font folder (FiraGO_WEB_1001/Roman, downloaded with his OK) and are declared by `@font-face` at the top of `site.css`; the regular weight is preloaded on every page. FiraGO is under the SIL Open Font License, so self-hosting and subsetting are allowed. The files are subset to Latin, Latin Extended-A, punctuation, currency (incl. ₾), common symbols and all of FiraGO's Georgian, about 50 KB each instead of 250 KB. To redo it or add a weight from the Drive folder (Thin to Heavy), run fontTools with brotli:

```bash
python -m fontTools.subset FiraGO-Medium.woff2 --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0308-0309,U+0323,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,U+2190-2199,U+2212,U+2215,U+2248,U+2260,U+2264-2265,U+FEFF,U+FFFD,U+10A0-10FF,U+1C90-1CBF,U+2D00-2D2F" --layout-features='*' --flavor=woff2 --output-file=FiraGO-Medium.subset.woff2
```
- **Colours:** tokens at the top of `site.css`, taken from the brand book (`--g1` main gradient, `--l2` to `--l5` level gradients).
- **Name and logo:** `SITE.logo` in `data.js` is the brand book's drawn wordmark (`logo/logo-mono.png`, B + "Brainer", 154x36 px), turned white in the footer by a CSS filter. It is soft on high-density screens; swap in the designer's vector with "Games" when it exists.
- **Email and legal line:** `SITE` in `data.js`. While `email` is empty the contact page says the address comes with the domain; `legal` is the footer's status line ("Licensing in progress"). Name the company, licence and lab there once they are final.

## Not real yet

- Game specs are marked provisional until certification. If a game's math changes, update `BRAIN` and that game's entry in `data.js` with it.
  - Plane Crash mirrors `cfg` and `LEVELS` in `Game #1 - Plane Crash/game.js` (Chicken Road's ladder: 25 tiles hide 1, 3, 5 or 10 bombs; RTP 98% for every player; tops 24.50×, 2,254.00×, 52,067.40× and 3,203,384.80×; bets $0.10 to $200; max win $10,000 per flight, which caps every payout).
  - FogRush mirrors `cfg` in `Game #2 - FogRush/game.js` (25 × 25 map; 8% of new tiles are bombs; 5% of safe tiles hold a chest: ×1.3 at 3%, ×2 at 1.2%, ×4 at 0.6%, ×10 at 0.15%, ×25 at 0.05%; every safe new tile multiplies by 1.0211, so each step is fair on average and the 98% RTP is taken once at the start; bets $0.10 to $200; max win $10,000 per round). `assets/games/fogrush.webp` is cropped from the game team's render `Marketing kit/renders/fogrush-chest.png`.
- Brain levels (Tornike's decision, 2026-10-25): 100 levels in ten stages, one brand robot per stage, shared by every game; every finished round (a Plane Crash flight or a FogRush round) earns the same 10 brain cells at any bet or difficulty (about 80 rounds to level 10, 20,000 to level 100); in Plane Crash, worlds unlock at 20 (Cloud sea) and 40 (City at dusk). They never change odds or payouts. The demo stores progress in `localStorage` `brainer.xp` and `brainer.level`; the home ladder marks the visitor's stage from `brainer.level`. Wording rules from Marketing: "Brain level N" only, never "smarter", no public level rankings, and nothing that nudges people to play more.
- The player's own Brainer is the hero of every game, including the Plane Crash pilot. `assets/games/plane-crash.svg` is placeholder key art copied from the game's scene; swap in the game team's key art when it exists.
- Brain cells and the brain level live in `localStorage` keys `brainer.xp` and `brainer.level` on the site's origin, so the website and every game served from it share one level.
- The fairness page states each game's scheme exactly (SHA-256 commit; HMAC-SHA256, first 52 bits, of "client seed:nonce:step:path" in Plane Crash, bomb when the roll is at or above the step's survival chance, and of "client seed:nonce:column:row" in FogRush, bomb when the roll is under 0.08, start tile always safe). If a game changes it, the page changes with it.
- Promo tools are marked "on the roadmap"; player protection settings, Georgian and the lab certificate are marked in progress. Skins exist as a service, not a self-serve tool.
- The contact form checks its fields but sends nothing until a form backend is chosen.
- Every page is `noindex` until launch.
