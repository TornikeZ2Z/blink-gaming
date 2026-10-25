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
| `index.html` | Home: core message, the six selling points, Brain cells (the ten robot levels, with the visitor's own Brainer marked once they have played), games, the three steps to go live, fairness sample, call to request a demo |
| `games.html` | Every game from the catalogue |
| `game.html?g=<id>` | One game: playable demo with full screen, how to play, difficulties (bombs, paths, first and top multipliers), fairness and specs |
| `operators.html` | Skins, promo tools, player-facing qualities, compliance status, integration routes |
| `fairness.html` | How provably fair works, with a working SHA-256 checker |
| `contact.html` | Demo request form (not connected yet; says so and keeps what was typed) |
| `responsible-gaming.html`, `terms.html`, `privacy.html` | Short legal pages for the demo stage |

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
- **Email and legal line:** `SITE` in `data.js`. While `email` is empty the contact page says the address comes with the domain; `legal` is the footer's status line ("Licensing in progress"). Name the company, licence and lab there once they are final.

## Not real yet

- Game specs mirror `cfg` and `LEVELS` in `Game #1 - Plane Crash/game.js` (Chicken Road's ladder: 25 tiles hide 1, 3, 5 or 10 bombs; RTP 98% for every player; tops 24.50×, 2,254.00×, 52,067.40× and 3,203,384.80×; bets $0.10 to $200; max win $10,000 per flight, which caps every payout) and are marked provisional until certification. If the game math changes, update `BRAIN` and the Plane Crash entry in `data.js` with it.
- Brain levels (Tornike's decision, 2026-10-25): 100 levels in ten stages, one brand robot per stage; every finished flight earns the same 10 brain cells at any bet or difficulty (about 80 flights to level 10, 20,000 to level 100); worlds unlock at 20 (Cloud sea) and 40 (City at dusk). They never change odds or payouts. The demo stores progress in `localStorage` `brainer.xp` and `brainer.level`; the home ladder marks the visitor's stage from `brainer.level`. Wording rules from Marketing: "Brain level N" only, never "smarter", no public level rankings, and nothing that nudges people to play more.
- The player's own Brainer is the hero of every game, including the Plane Crash pilot. `assets/games/plane-crash.svg` is placeholder key art copied from the game's scene; swap in the game team's key art when it exists.
- Brain cells and the brain level live in `localStorage` keys `brainer.xp` and `brainer.level` on the site's origin, so the website and every game served from it share one level.
- The fairness page states the game's scheme exactly (SHA-256 commit; HMAC-SHA256 of "client seed:nonce:step:path", first 52 bits, bomb when the roll is at or above the step's survival chance). If the game changes it, the page changes with it.
- Promo tools are marked "on the roadmap"; player protection settings, Georgian and the lab certificate are marked in progress. Skins exist as a service, not a self-serve tool.
- The contact form checks its fields but sends nothing until a form backend is chosen.
- Every page is `noindex` until launch.
