# Brainer Games website

B2B studio site for aggregators and casino operators, in Brainer direction A ("brand book, light"), which Tornike picked on 2026-10-25. It uses Tornike's core palette (2026-10-27, see Colours below), with the Brainer visor logo and the 3D Brainer's ten looks. Pages are light or dark: dark mode follows the system setting, and the switch in the header overrides it (kept in `localStorage` `brainer.theme`). Plain HTML, CSS and JavaScript with no build step, same as the games.

## Run it

From the repo root, serve the whole folder so the site can reach the game folders:

```bash
python -m http.server 5174
```

Then open http://localhost:5174/Website/. In Claude Code the `website` entry in `.claude/launch.json` does the same.

## Pages

| File | What it is |
|---|---|
| `index.html` | Home, a casino-style lobby: the featured carousel, swipe rows of game tiles, what operators get, a brain-levels teaser, the fairness sample and a call to request a demo. Its `h1` is visually hidden (the carousel's game titles are `h2`s), so screen readers and search engines still get the page's name |
| `games.html` | Every game as a tile, with genre filters once there is more than one genre |
| `game-<id>.html` (and `game.html?g=<id>` for older links) | One game, one static page each so its link preview shows its own picture: playable demo with full screen (the page's own button, and the game's: its `brainer:focus` message hides the site header and game bar and gives the frame the whole window, which is the only full screen iPhone has), how to play, the odds (games with `levels`: the difficulties with bombs, paths, first and top multipliers; FogRush: every tile type with its chance and multiplier; Fly High has no odds table), fairness and specs |
| `operators.html` | Brain levels (the full ladder, `#brain`), promo tools, player-facing qualities, compliance status, integration routes |
| `fairness.html` | How provably fair works, the exact scheme (seeds, nonce, rolls, payouts) with each game's roll message, and a working SHA-256 checker |
| `contact.html` | Demo request form, sent to the inbox Worker (`Inbox/` in the repo, `https://api.brainer.games/requests`): it stores each request in Cloudflare D1, emails the team and lists it at admin.brainer.games. Name, work email, company and company type are required; if sending fails, the answers stay and the page offers partners@brainer.games |
| `responsible-gaming.html`, `terms.html`, `privacy.html` | Short legal pages for the demo stage |

The home page is a casino-style lobby (Tornike's pick C, 2026-10-27): games come first. A featured carousel shows one slide per playable game, newest first as `data.js` lists them, moving on every 6 s unless the pointer or focus is on it or the visitor prefers reduced motion. Under it, rows of game tiles swipe sideways; a genre gets its own row once it has three games. The brain levels are a short teaser that links to `operators.html#brain`. `assets/js/hero-3d.js` (the 3D Brainer showcase) is no longer mounted on any page.

Header, footer, menu drawer and the 18+ check are drawn by `assets/js/site.js` on every page. The lobby fills itself from the catalogue: `data-feature` (the carousel), `data-row` (a swipe row: `all`, `new` or a genre), `data-genre-rows`, `data-grid` (the games page), `data-brain-strip` (the ten looks); `data-ladder` with the ten Brainer stages in their stage colours and `data-tiers` with the five tiers, each showing its two stage colours.

## Brand assets

`assets/fonts/firago/` holds FiraGO Regular, Bold and ExtraBold (see Typeface below). `assets/brainer/logo/` holds files downloaded from Tornike's Brainer Drive on 2026-10-25 with his OK (`logo-white.png` is the B on the gradient tile, `logo-blue.png` the gradient B on white, `logo-mono.png` a small B + "Brainer" lockup, `favicon.png`). `assets/brainer/robots/1.webp` to `10.webp` are the ten stage stills, Baby to Master, one per ten brain levels: the game team's renders of the 3D Brainer (`Brainer 3D/renders/stages/`), re-rendered on 2026-10-27 at 800×800 with a transparent background and no shadow haze, about 37 to 64 KB each. They replaced the brand book's flat robots on 2026-10-25.

## Link previews

Every page carries Open Graph and Twitter tags (between `<!-- link preview -->` comments), so a link on LinkedIn, in email or in chat shows a picture, a title and a description. Tornike approved the images on 2026-10-27; Marketing's rules: on the image only the visor lockup and at most "Instant games for casinos" (a game's image adds its name), no numbers, money or win wording, the Brainer happy and in action, never a thumbs-up; descriptions follow the site's claim rules.

- `assets/share/brainer-games.jpg` (1200×630) previews every page that isn't a game: the visor lockup and the tagline beside the Plane Crash and Space Crash posters on the posters' violet. `assets/share/<id>.jpg` previews each game: the lockup, the game's name and its poster.
- Link crawlers don't run scripts, so each game has its own static page, `game-<id>.html` (a copy of `game.html` with its own title, description, preview and `data-game`); the site links there. `game.html?g=<id>` still works but previews as the site.
- `tools/share-images.py` draws the images (Pillow, fontTools and brotli; posters from `Brainer 3D/renders/cards/`), and `tools/link-previews.py` writes the tags on every page and the game pages from `game.html` and `data.js` (Node). Run both from the repo root after adding a game, and the second after changing any page's title or description or `game.html`. Every preview URL is absolute on https://brainer.games.

## Common changes

- **Add or rename a game:** edit `GAMES` in `assets/js/data.js`, then make its link preview (see Link previews below: its share image and its `game-<id>.html` page). A playable game needs `src` (its `index.html`, with spaces as `%20` and `#` as `%23`; published, each game sits in its own folder next to the site) and `art` (a 4:5 image in `assets/games/`). Specs, odds, rules, the fairness paragraph and downloads all come from the same entry; `round` is the word for one round ("flight" in Plane Crash). The odds show as difficulties when the entry has `levels` and as tiles and chests when it has `chests`.
- **Typeface:** FiraGO for all text, Latin and Georgian (Tornike's pick, 2026-10-25): headings 700, h1 800, body 400. The three `.woff2` files in `assets/fonts/firago/` come from the Brainer Drive's Font folder (FiraGO_WEB_1001/Roman, downloaded with his OK) and are declared by `@font-face` at the top of `site.css`; the regular weight is preloaded on every page. FiraGO is under the SIL Open Font License, so self-hosting and subsetting are allowed. The files are subset to Latin, Latin Extended-A, punctuation, currency (incl. ₾), common symbols and all of FiraGO's Georgian, about 50 KB each instead of 250 KB. To redo it or add a weight from the Drive folder (Thin to Heavy), run fontTools with brotli:

```bash
python -m fontTools.subset FiraGO-Medium.woff2 --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0308-0309,U+0323,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,U+2190-2199,U+2212,U+2215,U+2248,U+2260,U+2264-2265,U+FEFF,U+FFFD,U+10A0-10FF,U+1C90-1CBF,U+2D00-2D2F" --layout-features='*' --flavor=woff2 --output-file=FiraGO-Medium.subset.woff2
```
- **Colours:** Tornike's core palette (2026-10-27), five roles plus the stage scale, everything else retired. Brainer violet `#532aff` (`--main`), with `#4b36fc` to `#8447fb` (`--g1`) as the only brand gradient and lighter tints where contrast needs them (dark mode's `#A493FF`); screen blue `#3550F0` for the visor logo and the robot's face; ink `#1B1838` and night `#0B0F1E` (`--dark`: the footer, the frame, shadows and fades); white and the tint family (`--tint`, `--tint-2`, `--line`); win gold `#FFC147` only for wins and game titles, never the logo (the site uses none). The ten stage colours, Baby to Master, are `BRAIN.colours` in `data.js`: the ladder colours each stage with its own, and the five tiers show their two. Every game's `color` (the tile's colour while its poster loads, and the carousel glow) is the brand violet. Success green and error red (`--green`, `--red`) are state colours, not brand; the compliance ticks are green because they mean done. Tokens are at the top of `site.css`, with the dark-mode set below them.
- **Name and logo:** `SITE.brand` in `data.js` names the site; the logo is the visor (see Logo at the end). `SITE.logo` still points at the brand book's wordmark PNG, but nothing reads it any more.
- **Email and legal line:** the address is partners@brainer.games (Cloudflare Email Routing forwards it to Tornike), written straight into `contact.html` and `assets/js/contact.js`; `SITE.email` is empty and unused. `SITE.legal` is the footer's status line ("Licensing in progress"). Name the company, licence and lab there once they are final.

## Not real yet

- Game specs are marked provisional until certification. If a game's math changes, update `BRAIN` and that game's entry in `data.js` with it.
  - Plane Crash mirrors `cfg` and `LEVELS` in `Game #1 - Plane Crash/game.js` (Chicken Road's ladder: 25 tiles hide 1, 3, 5 or 10 bombs; bets $0.10 to $200; max win $10,000 per flight, which caps every payout). Every top the site shows is what a flight can pay, `min(top, maxWin ÷ minBet)`: 24.50×, 2,254.00×, 52,067.40× and 100,000.00×. A Hardcore flight through path 14 has reached the max win even at $0.10, so its path 15 (3,203,384.80×, kept as `top`) is never offered and the site says "up to 14 paths" (`reach`).
  - FogRush mirrors `cfg` in `Game #2 - FogRush/game.js` (25 × 25 map; 8% of new tiles are bombs; 5% of safe tiles hold a chest: ×1.3 at 3%, ×2 at 1.2%, ×4 at 0.6%, ×10 at 0.15%, ×25 at 0.05%; every safe new tile multiplies by 1 / (0.92 × 1.0645) ≈ 1.0211, so each step is fair on average and the RTP is taken once at the start; bets $0.10 to $200; max win $10,000 per round). `assets/games/fogrush.webp` is the game team's card render `Brainer 3D/renders/cards/fogrush.png` (Blender, `world.py` view `card_fog`).
- Brain levels (Tornike's decision, 2026-10-25): 100 levels in ten stages, one brand robot per stage, shared by every game; every finished round, in any game, earns the same 10 brain cells at any bet or difficulty (about 80 rounds to level 10, 20,000 to level 100); in Plane Crash, worlds unlock at 20 (Cloud sea) and 40 (City at dusk). They never change odds or payouts. The demo stores progress in `localStorage` `brainer.xp` and `brainer.level`; the ladder at `operators.html#brain` marks the visitor's stage from `brainer.level`. Wording rules from Marketing: "Brain level N" only, never "smarter", no public level rankings, and nothing that nudges people to play more.
- The player's own Brainer is the hero of every game, including the Plane Crash pilot. The game cards `assets/games/<id>.webp` are the game team's poster renders `Brainer 3D/renders/cards/<id>.png` (Blender, `Brainer 3D/blender/cards.py`; the poster look Tornike picked on 2026-10-27: brand violet, light rays and sparkles, the Brainer and the game's key piece in the top three-quarters so the title fade at the foot leaves them clear), 800×1000, saved as WebP at quality 86, 35 to 45 KB each.
- Brain cells and the brain level live in `localStorage` keys `brainer.xp` and `brainer.level` on the site's origin, so the website and every game served from it share one level.
- RTP wording (Tornike's decision, 2026-10-26): the RTP is "up to 98%", never "98% for every player" or "whatever the route or the cash-out". Where a page explains it, it says the return is 98% before two things lower it in some rounds: payouts round down to the cent, and the $10,000 max win ends long or high-bet rounds early. Short labels say "RTP up to 98%" or "Up to 98% RTP".
- The fairness page states each game's scheme exactly: the game commits first (the next round's server seed hash shows in the game's fairness sheet before the player chooses the client seed), the player can set the client seed there (1 to 64 characters counted as code points, trimmed, or "New random"; it counts from the next round and is kept for the session), the nonce is the round number, and each roll is HMAC-SHA256, first 52 bits, of "client seed:nonce:step:path" in Plane Crash (bomb when the roll is at or above the step's survival chance) or "client seed:nonce:column:row" in FogRush (bomb under 0.08, then plain or a chest by `outcome()`'s shares; start tile always plain). Payouts round down to the cent and stop at the $10,000 max win. If a game changes any of it, the page changes with it.
- Promo tools are marked "on the roadmap"; player protection settings, Georgian and the lab certificate are marked in progress. We don't offer colour skins for operators (Tornike, 2026-10-27), so no page promises one.
- FogRush is hidden from the site and the deploy (`hidden: true` in its `data.js` entry, filtered out at the end of the file); its entry and code stay, so setting it back to `false` (and restoring its copy step in the Pages workflow) brings it back.
- Every page is `noindex` until launch.

Logo (Tornike's pick, 2026-10-27): the Brainer's visor, `assets/brainer/logo/visor.svg`, its screen flat screen blue `#3550F0` (core palette, same day), with the name set in FiraGO ExtraBold. `site.js` draws it inline so its screen lights up from black and the eyes blink open on load; `favicon.svg` is the same mark for the tab (the old `favicon.png` stays as a fallback). The brand book's B logo PNGs stay in `assets/brainer/logo/` but no page uses them.
