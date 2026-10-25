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
| `index.html` | Home: core message, the six selling points, Brain cells (the ten robot levels), games, the three steps to go live, fairness sample, call to book a demo |
| `games.html` | Every game from the catalogue |
| `game.html?g=<id>` | One game: playable demo with full screen, how to play, risk levels, fairness, specs and downloads |
| `operators.html` | Skins, promo tools, player-facing qualities, compliance status, integration routes |
| `fairness.html` | How provably fair works, with a working SHA-256 checker |
| `contact.html` | Demo request form |

Header, footer, menu drawer and the 18+ check are drawn by `assets/js/site.js` on every page. Any element with `data-games` fills itself with game cards, `data-ladder` with the ten robots and `data-tiers` with the five level colours.

## Brand assets

`assets/fonts/firago/` holds FiraGO Regular, Bold and ExtraBold (see Typeface below). `assets/brainer/` holds files downloaded from Tornike's Brainer Drive on 2026-10-25 with his OK: `robots/1.png` to `robots/10.png` (500x500, transparent, one per player level) and `logo/` (`logo-white.png` is the B on the gradient tile used in the header and footer, `logo-blue.png` the gradient B on white, `logo-mono.png` a small B + "Brainer" lockup, `favicon.png`).

## Common changes

- **Add or rename a game:** edit `GAMES` in `assets/js/data.js`. A playable game needs `src` (its `index.html`, with spaces as `%20` and `#` as `%23`) and `art` (a 4:5 image in `assets/games/`). Specs, levels, rules and downloads all come from the same entry.
- **Typeface:** FiraGO for all text, Latin and Georgian (Tornike's pick, 2026-10-25): headings 700, h1 800, body 400. The three `.woff2` files in `assets/fonts/firago/` come from the Brainer Drive's Font folder (FiraGO_WEB_1001/Roman, downloaded with his OK) and are declared by `@font-face` at the top of `site.css`; the regular weight is preloaded on every page. FiraGO is under the SIL Open Font License, so self-hosting and subsetting are allowed. The files are subset to Latin, Latin Extended-A, punctuation, currency (incl. ₾), common symbols and all of FiraGO's Georgian, about 50 KB each instead of 250 KB. To redo it or add a weight from the Drive folder (Thin to Heavy), run fontTools with brotli:

```bash
python -m fontTools.subset FiraGO-Medium.woff2 --unicodes="U+0000-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0304,U+0308-0309,U+0323,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-214F,U+2190-2199,U+2212,U+2215,U+2248,U+2260,U+2264-2265,U+FEFF,U+FFFD,U+10A0-10FF,U+1C90-1CBF,U+2D00-2D2F" --layout-features='*' --flavor=woff2 --output-file=FiraGO-Medium.subset.woff2
```
- **Colours:** tokens at the top of `site.css`, taken from the brand book (`--g1` main gradient, `--l2` to `--l5` level gradients).
- **Name and logo:** `SITE.logo` in `data.js` is the brand book's drawn wordmark (`logo/logo-mono.png`, B + "Brainer", 154x36 px), turned white in the footer by a CSS filter. It is soft on high-density screens; swap in the designer's vector with "Games" when it exists.
- **Company, licence, lab and email:** `SITE` in `data.js`. Every `[bracketed]` value shows on the site until it is filled in.

## Not real yet

- Game specs mirror `cfg` and `LEVELS` in the rewritten `Game #1 - Plane Crash/game.js` (98% RTP, four levels, bets 0.10 to 200, max win 10,000) and are marked provisional until certification. The game developer session says when they change.
- Brain levels (Tornike's pick, 2026-10-25): one brain cell per path flown; levels at 0, 10, 25, 45, 70, 100, 140, 190, 250 and 320 cells; each level adds +0% to +1% to every multiplier inside the game maths, locked at take-off, so RTP runs from 98% to about 98.98%. Mirrored in `BRAIN` and the Plane Crash entry in `data.js`. It is shown as a demo feature until the test lab and a lawyer sign it off. Wording rules from Marketing: "Brain level N" only, never "smarter", and no public level rankings.
- Decided 2026-10-25: the player's own Brainer is the hero of every game, including the Plane Crash pilot. The tile shows the robot from behind in the cockpit as placeholder art; final key art comes from the game team.
- Player-facing copy must not sell levels as smartness or status, or nudge people to play more (Marketing's rule). The old Brainer lines "Join the smart side", "top brainers" and "how many games will you play today?" are not used.
- The demo's pilot is the player's Brainer robot, and brain cells (one per path flown) are stored in `localStorage` key `brainer.cells` on the site's origin, so every game served from the site shares one level. The game page's level table lists brain-level-1 multipliers with a note on the boost. Remove or reword `demoNote` in `data.js` once the review and the game name are settled. The Brainer version is live at https://tornikez2z.github.io/blink-gaming/plane-crash/.
- The fairness page states the scheme (SHA-256 commit, HMAC-SHA256 per step). The release game has to match it, or the page changes.
- Promo tools, skins, localisation and player protection settings are described from the marketing plan; they need to exist in the game before launch.
- The contact form checks its fields but sends nothing until a form backend is chosen.
- Responsible gaming, Terms and Privacy are footer links that say "not written yet".
- `assets/games/plane-crash.svg` is placeholder key art that copies the game's own scene (sky, fields, hoops, bombs, the white plane and the robot pilot from behind, colours taken from `game.js`). If the game's look changes, regenerate it or swap in the game team's key art.
- Nothing here is published: the Pages workflow deploys only the root page and the game folder.
