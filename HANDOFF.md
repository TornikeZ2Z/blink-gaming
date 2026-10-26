# Handoff: Brainer Games, 3D character, world and demos

Last updated 2026-10-26, evening, after a full review of the games, the shared Brainer code and the website. This is for the next Claude session. It covers the game/3D work, which belongs to the "BG - Game Developer" session. The website (`Website/`) belongs to the "BG - Website Developer" session: commit only your own paths and never run `git add -A`.

Live site: https://brainer.games (Cloudflare zone brainer.games: apex A/AAAA to GitHub Pages, www CNAME, DNS only; Pages custom domain, HTTPS enforced). brainer.datastudio.ge has a 301 rule to it in the datastudio.ge zone. It deploys from `TornikeZ2Z/brainer-games`, branch `main`, through GitHub Pages (`.github/workflows/pages.yml`).

## What is decided (Tornike approved all of it)

- **Character.** The Blender Brainer:
  - a clean round head with a big LED-pixel visor face
  - no brain on the body
  - an even blue screen
  - an off state, then a power-on animation (dot, line, blue, LEDs ripple on, eyes open)
- **Evolution.** Ten "Grows up" stages, one per 10 brain levels:
  - Baby, Toddler, Kid, School kid, Teen, Student, Young pro, Pro, Expert, Master.
  - Each stage has its own pose, LED face and colour, and shows its number on the chest. The idle Brainer in the games shows its stage's face too.
  - One accessory per pair of stages: none, scarf, cap, bow tie, graduation cap.
  - No cane and no glasses. The master's colour is royal violet `#4A1C9E`.
  - Raised arms stop at 1.8 out to the side, and a head tilts away from a raised hand: the head is wider than the shoulders, so anything higher goes into the visor or an ear. `STAGES` in `shared/brainer-model.js` and in `Brainer 3D/blender/brainer2.py` must stay in step.
  - In the plane the pilot sits 0.3 (its own units) higher than before, so the cockpit rim no longer hides the visor's mouth.
- **World.** One connected **Meadow** world:
  - Plane Crash parks at an airfield (runway, the "B" hangar, the tower) and flies over the meadow.
  - FogRush is played on grass plots in a foggy valley next to that airfield. Its loading screen shows that valley.
- **Maths, claims and fairness (2026-10-26).**
  - The $10,000 max win per round stays, and payouts round down to the cent. The maths is not re-tuned; the claims say "RTP up to 98%". Never write "98% for every player" or "whatever the route or cash-out". Where RTP is explained, say that rounding down and the max win lower it in some rounds.
  - Hardcore advertises what can really be won: up to 100,000× (the $10,000 max win at the $0.10 minimum bet), up to 14 paths. Its 15th path is never reached. Every top shown before a bet uses min(ladder top, max win ÷ minimum bet); once a bet is placed the games cap every multiplier at that bet's max win, and Plane Crash's path count and ladder follow the bet.
  - Tornike mentioned a 5-cent minimum bet; the code says $0.10 and was left there until he confirms.
  - Players set their own client seed in each game's fairness sheet: 1 to 64 characters counted as Unicode code points, trimmed, kept for the visit, locked mid-round. The game commits first: the next server seed's SHA-256 hash shows before the player chooses the seed. `Website/fairness.html` describes the scheme exactly, including FogRush's roll-to-tile mapping and the per-tile factor 1 ÷ (0.92 × 1.0645).
- **Co-founder feedback (Temo, 2026-10-26).**
  - In FogRush, walking back onto cleared tiles stays allowed.
  - FogRush's chest strip is one compact row (colour and multiplier) that never scrolls, and on short stages the multiplier card turns into a slim strip so the Brainer and the tiles stay visible.
  - His Chicken Road idea (see the path ahead with its multipliers, and the most you can win) is waiting for design options: see Still to do.

## Fly High and FogRush (2026-10-26, evening)

- **Fly High** (working title, `Game #3 - Fly High/`, published at `/fly-high/`, Game #2 on the site) is Aviator one to one with the Brainer and its world: rounds run on their own (a 6 s betting window, take-off, the multiplier e^(0.09 × seconds), a 3.2 s pause after it flies away); two bet panels, each with Bet, Cancel, Cash out, auto bet and auto cash-out; a history of the last rounds. It flies away at 0.98 ÷ (1 − u) rounded down to the cent (1.00× to 10,000×), from HMAC-SHA256(server seed, "client seed:nonce"), so every cash-out point returns 98% before rounding and the $10,000 max win. Same shell, client-seed sheet, 18+ check, intro (wordmark `fly`) and 3D plane as Plane Crash. No list of other players: invented players would nudge. Its card is a frame of the game mid-climb (`Brainer 3D/renders/cards/fly-high.png`).
- **FogRush is hidden** from the site (`hidden: true` in `Website/assets/js/data.js`) and from the deploy (`.github/workflows/pages.yml`). Its code and today's fixes stay in `Game #2 - FogRush/`; set the flag back and restore the copy step to bring it back.
- **World: the valley, semi-realistic (Tornike, 2026-10-26, after the 2D countryside).** He loves the character but wanted a world that is beautiful, a little realistic and not childish. Drafts come from `Brainer 3D/blender/concepts.py`-style Blender scenes (physical sky, golden hour, volumetric clouds with volume bounces on, a haze box), with the game's own Plane3D composited on top.
  - **Fly High: altitude follows the multiplier.** Five Blender backdrops in `assets/sky/` (ground 1.00×, low 1.6×, clouds 3.5×, above 12×, space 120×), crossfaded on a log scale as the multiplier climbs, the old one sliding down and the next fading in from above, clouds streaming past in the cloud layer; the runway backdrop is anchored so the runway stays in frame on phones (PARK is the plane's spot in it). An Aviator-style leaderboard (Top button) with made-up demo players marked "Demo data" (Tornike's call; Marketing's no-public-rankings rule still needs their sign-off) and the player's real bets.
  - **Plane Crash: the valley.** `assets/valley-sky.webp` (rendered sky, horizon at 0.553 of its height) and `assets/valley-ground.webp` (top-down farmland, mirrored 2 × 2 into a seamless pattern and drawn per screen row in perspective, mode 7 style), the gravel road, an asphalt runway and a plain hangar sprite (no letters). The unlockable Cloud sea and City worlds still have the old 2D look.

## Charge (2026-10-26, night)

- **Charge** (working title, `Game #4 - Charge/`, published at `/charge/`, Game #3 on the site) is Tornike's idea: Chicken Road where each step is a CHARGE. The Brainer starts every round at Level 1 (1.00×) on a charging pad between two coils on a hilltop over the valley; a safe charge levels it up and raises the multiplier; cash out after any charge. The maths is Plane Crash's: 1, 3, 5 or 10 overloads in 25 charges, multiplier = 0.98 ÷ the chance of surviving, rounded down to the cent, the $10,000 max win (Hardcore stops at charge 14 at $0.10). Each charge rolls HMAC-SHA256(server seed, "client seed:nonce:charge"); the fairness sheet re-checks every roll against its safe chance.
- **His picks:** golden hour; the royal velvet cape with gold clasps on the top look. After the first version he asked for (2026-10-26, late):
  - **A polite bust, no lightning at the robot.** The coils charge a battery that floats over the Brainer's head; an overload overfills it (amber, then red, swelling, a "!"), it pops in a puff of steam and little stars, and the Brainer, shocked, then dizzy, sits down and dozes off ("Battery flat"). The next round wakes it.
  - **Always in motion.** The Brainer is the live 3D rig (`bot.js`, on `shared/brainer-model.js`), drawn through the set's own Blender camera so it stands exactly on the pad. Waiting, it breathes, looks round and picks a new act every few seconds (wave, glance at a coil, check the battery, dance, stretch, foot tap, point, shrug, spin, hops, hug, sit); a charge makes it brace and look up at the battery; a safe one sets off a random cheer (jump, spin, fist pump, flex, cheer, bounce).
  - **Something new on every charge.** The eleven looks are spread evenly over the charges the round can reach (`lookAt(n, reach)`: the baby at the start, the caped master on the last), and every charge between two looks snaps on a random piece of gear (`GEAR` in `bot.js`: power bands, shoulder pads, gloves, knee rings, glow soles, power belt, bolt badge, energy wings, antenna bolt, headphones, which come off under a cap); once all are on, one turns gold. Gear is cosmetic, Math.random, never the seed.
- **How it's drawn:** the station is one Blender render (`assets/set.webp`); `assets/scene.js` holds where the coils, rings and terminals sit, so the game draws the glows, the arcs into the battery, the battery and the sparkles in 2D around the 3D Brainer. Without WebGL the Blender stills of the eleven looks (`assets/bot/<look>-ok.webp`) stand in. Sources: `Brainer 3D/blender/charge.py` (the key frames and the card), `charge_assets.py` (set, stills, cape icon), `charge_post.py` (bloom); the broken-robot stills and `charge_faces.py`'s red error screens are retired. `?test` adds `window.chargeTest.next = 'safe' | 'boom'` to force the next charge (marked in the fairness sheet).
- **UI:** a battery-style ladder on the left (a row along the stage's foot on phones), LVL and look over the multiplier, a next-look card, the brain-level card, Cash out and Charge. Keys: Space plays and charges, C cashes out (by `e.code`). Tested at 320–1280 px, in full screen too.
- **Site:** `data.js` has its entry with `words` (overloads and charges instead of bombs and paths), which `site.js` and `game-page.js` read; card art from `charge.py` at 960×1200.

## Where things live

- `Brainer 3D/`: the Blender kit. See its README.
  - `blender/brainer2.py` builds the character; `STAGES` holds the stage poses. Mode `stages` renders `stage_1..10.png` at 640 px.
  - `export_glb.py` writes the web model, `world.py` the world and the card shots, `pc_sprites.py` the airfield sprites.
  - `textures.mjs` makes the LED textures.
  - `renders/stages/1..10.png` are the stage stills: the 640 px render cropped to (157, 177, 489, 509) and scaled to 500 px with Lanczos.
    - The games' copies (`assets/brainer-N.png`) have the faint floor faded out over 36 px at the left, right and bottom edges, so copying the renders over them brings back a hard-edged rectangle.
    - The website's `assets/brainer/robots/N.webp` fade the floor with a 32 px smoothstep at the same edges and are saved at WebP quality 90.
  - `renders/cards/plane-crash.png` and `fogrush.png` are the website's card art (800×1000, opaque).
    - FogRush: `blender -b --python blender/world.py -- <out> meadow card_fog 1000`.
    - Plane Crash: the backdrop is `world.py` view `card_ground` (the airfield from above, the kit's own plane hidden). On top goes the game's own `Plane3D` with a stage 6 pilot cheering ('excited', seated), rendered on a transparent 800×1000 canvas through `BrainerStage` with a perspective camera at eye (2.237, 2.35, 7.225), target (−0.05, −0.45, 0.575), fov 36.28, bank 0.22, then composited.
    - `world.py` reads an optional `CARD` environment variable to try other card cameras.
  - Blender 5.2 is installed at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` and runs headless.
- `shared/`:
  - `models/brainer.glb`: the web model, 1 MB.
  - `brainer-model.js`: the rig both games and the site use.
  - `brainer3d.js`: the games' Brainer API, plus the plane, the parachute and BrainerStage.
  - `led-face.js`: the LED faces, the power-on and the chest numbers (with a `roundRect` polyfill for older browsers).
  - `face.js`: the 2D effects round the head (sparkles, hearts, "!", zZ) for the games' 2D stand-in.
  - `brainer-showcase.js`: the website hero.
  - `glb-lite.js`: the GLB loader (a failed load is retried, not cached).
  - `gl-guard.js`: WebGL loss handling.
  - `focus.js` and `focus.css`: full screen.
  - `intro.js` and `intro.css`: the loading screen; its fallback picture is the player's own stage still.
- The games: `Game #1 - Plane Crash/` and `Game #2 - FogRush/`. When 3D is unavailable, Plane Crash's 2D stand-in draws the stage stills; the retired dome-headed `brainer-N-blank.png` art is gone.

## The full review, 2026-10-26

A full live test (d8b6167, c8ad7fa) was followed by multi-agent reviews of both games, `shared/` and the website, with every finding checked by skeptics before it was fixed. About 90 confirmed findings were fixed. The main ones:

- **Money and rounds.** Keys pressed during the loading screen (Space, Enter, a held key) no longer start a paid round before the 18+ check. FogRush honours a cash-out pressed mid-step. Payouts and the balance stay in whole cents. Shown multipliers respect the max win. A held path key in Plane Crash flies one path, not the next ones too.
- **Keys.** FogRush reads WASD and C by physical key (a Georgian keyboard sends "დ" for D), falls back to the arrows' `e.key` for the numpad, and ignores Ctrl, Alt and Meta chords. Plane Crash reads paths 1 to 5 by position, so AZERTY and the numpad work.
- **Plane Crash.** The horizon haze no longer cuts across the hangar and tower: they are drawn after `haze()` and tinted evenly by the haze at their feet. A crash hides the level-up banner, which comes back once the crash card closes. Brain cells are re-read from storage before adding, so two open games do not overwrite each other. A seed-rotation race that could start a flight on the wrong seed is closed.
- **Layout.** Both games use the compact top bar up to 480 px, and How to play shows at every width. The bet field shows "10.00" and "200.00" in full everywhere. How to play keeps its button visible at the bottom of the card on phones. FogRush's 3D camera keeps the Brainer clear of the readout on narrow, short and landscape screens.
- **Accessibility.** Sheets keep keyboard focus and give it back; focus stays on a control through a round; focus rings show over the sky; key text meets contrast; live regions announce only what changes; reduced motion is honoured.
- **Leaks and robustness.** FogRush disposes each round's 3D objects; PMREM environments are disposed after baking; the 2D stand-in works on old iOS; without the 3D module the Plane Crash intro no longer waits 9 s.
- **Website.** The age gate cannot be dismissed with Esc or back; the contact form sends nothing even with JavaScript off; the game page no longer pulls the visitor back to #specs after they scroll; tables and strips fit at every width; the claims follow the decisions above; new card art.

## Still to do

- **Temo's Chicken Road idea.** Mock up 2 or 3 options for Tornike and Temo to pick from, for example the next multiplier shown on each fog tile around the Brainer with a visible "Max win $10,000" in FogRush, or a Chicken-Road-style scrolling ladder in Plane Crash. Do not build one before they pick.
- **Minimum bet.** Confirm with Tornike whether it should be $0.05 (the code says $0.10). If it changes, Hardcore's top becomes 200,000× and every reach and top shown must be re-derived.
- **Not verified yet:** real iPhone Safari.
- **Leftover name:** the 3D view `islandHero` in `shared/brainer3d.js` (used by FogRush's intro) is named after the old sky islands. Players never see it.
- **Untracked, not ours:** `Marketing kit/`, `NewIdeas-backup/`, `blink-domains-available.csv`. Leave them.

## Testing set-up used

- A small Node server served the working copy laid out like production at `http://localhost:5191`: `Website/` at `/`, the games at `/plane-crash/` and `/fogrush/`, `shared/` at `/shared/`.
- Tests used puppeteer-core with Chrome and the flags `--use-angle=d3d11 --enable-gpu`. Point every test at the local server; a test left on its live default plays real rounds on the public site.
- Checks to repeat for any change to a game's input or top bar:
  - Send a Georgian-layout key through CDP: `Input.dispatchKeyEvent` with key "დ" and code "KeyD".
  - Measure the bar at every width from 320 to 1024 px, with `#balance` set to "$10,000.00" and to "$1,000,000.00".
  - Load the site's game page at about 360×600 (a phone in Messenger's in-app browser): the stage is short there.
- To check a pose change, count rig vertices of the arms inside the head's parts (each head part fitted as a superellipsoid to its bounding box) for every stage and every pose in `poseFor`; it must be zero.
- The Browser pane in the desktop app slows animation to about 1 frame per second while it is hidden. Play the games there only while it is showing, or use headless Chrome as above.
- To reproduce without Node, serve the repo root and open the folders directly:

  ```
  python -m http.server 5174
  ```
