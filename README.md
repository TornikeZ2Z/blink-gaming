# Brainer Games

The Brainer Games studio website and its browser games, one folder per game. Everything is plain HTML, CSS and JavaScript with no build step.

| Folder | What it is | Published at |
|---|---|---|
| `Website` | B2B studio site for casinos and aggregators | `/` |
| `Game #1 - Plane Crash` | Plane Crash demo, play money only | `/plane-crash/` |
| `Game #2 - FogRush` | FogRush demo, play money only | `/fogrush/` |
| `shared` | The 3D Brainer (model, rig, LED face), the website showcase, the intro and three.js, used by every game and the site | `/shared/` |

On every push to `main`, `.github/workflows/pages.yml` publishes the website as the site root with the game next to it, so the site's game page embeds the demo from the same origin and both share the player's brain cells.

## Run it locally

Serve the repo root so the website and the games can reach each other and `shared/`, then open http://localhost:5174/Website/ (or a game folder):

```bash
python -m http.server 5174
```

## FogRush

The player's Brainer walks a 25 x 25 map of grass plots in a foggy valley, starting in the middle. The valley lies in the Brainer world's meadow, next to the airfield Plane Crash takes off from (its runway, hangar, tower and a parked plane show at the valley's west edge). Every new tile clears its fog:
- Most new tiles are plain and nudge the multiplier up by about 2%.
- 5% hold a chest: ×1.3, ×2, ×4, ×10 or ×25, rarest last.
- 8% hold a bomb, which ends the round.

Tiles already cleared are safe to cross. The player can cash out any time after the first new tile, with an optional auto cash-out. Move with the arrows, WASD, the on-screen pad, or by tapping a tile next to the Brainer.

The math is fair at every step: a safe tile multiplies the multiplier by a base of about ×1.0211 times its chest factor (1 for plain), so (1 − 8%) × base × E[factor] = 1. The 98% RTP is applied once at the start, so the expected payout is 98% of the bet whichever way the player walks or whenever they cash out. Payouts are capped at $10,000. The original FogRush idea (in the NewIdeas repo) paid back 230–300% and was rebalanced to this.

Every tile rolls HMAC-SHA256(server seed, "client seed:nonce:column:row"). A roll under 8% is a bomb, the rest picks plain or a chest, and the start tile is always safe. The shield button checks the last round and draws its whole map. Each finished round adds the same 10 brain cells as Plane Crash; the level is shared.

## Plane Crash

The player's Brainer flies a plane toward five hoops while bombs fall ahead. Between flights the plane waits parked on the road; Play starts a takeoff (roll, lift-off, climb) and then the hoops fly in. At each step the player picks one of the five paths, or jumps out with a parachute to take the current win. After a jump the Brainer floats down and lands on the road, and the game returns to the start screen; after a crash it returns too. Each flight is single player and runs at the player's pace: no timers or shared rounds. All amounts are play-money US dollars: bets $0.10 to $200, max win $10,000 per flight.

The math is Chicken Road's, one to one, at 98% RTP for every player. A 25-tile grid hides 1, 3, 5 or 10 bombs, and each step uncovers one more tile, so the chance of surviving n steps is C(25-n, b) / C(25, b). After n safe paths the multiplier is 0.98 divided by that chance, rounded down to the cent. Every path at a step has the same odds; picking a path is the player's own call, as Chicken's yes/no is.

| Difficulty | Bombs in 25 | Paths | First → top multiplier |
|---|---|---|---|
| Easy | 1 | 24 | 1.02× → 24.50× |
| Medium | 3 | 22 | 1.11× → 2,254.00× |
| Hard | 5 | 20 | 1.22× → 52,067.40× |
| Hardcore | 10 | 15 | 1.63× → 3,203,384.80× |

The $10,000 max win caps every payout, so a flight jumps out automatically when it reaches it. Every path at every step rolls HMAC-SHA256(server seed, "client seed:nonce:step:path"). The shield button in the game shows the next flight's seed hash and re-checks the last flight: it re-hashes the revealed seed and redraws every bomb.

### Look

The world is drawn in code on a canvas. The plane and the Brainer are 3D models. The default world is the Meadow, the Brainer world's countryside and the same land FogRush is played in: patchwork farmland in the Blender world's palette, round trees, a river and a road, and clouds casting shadows. The plane parks at an airfield (a lit runway, the hangar with the B and the tower, sprites rendered in Blender), and FogRush's foggy valley passes below now and then. Two other worlds can be compared with `?world=clouds` (a sea of clouds at sunset) and `?world=city` (Brainer city at dusk); adding `?worlds` shows a switcher on the stage.

The Brainer is the character modelled in Blender (`Brainer 3D/`), exported as `shared/models/brainer.glb` and rendered live with three.js (self-hosted in `shared/vendor/`, MIT licence):
- A round head with a big LED visor showing its dot-matrix face, and its stage number in LED dots on its chest.
- Ten stages, from Baby to Master. It grows taller, takes its stage's colour, and wears its pair of stages' accessory: none, a scarf, a cap, a bow tie, a graduation cap.
- `shared/brainer-model.js` is the rig: growth, joints, accessories, and the screens painted live. `shared/brainer3d.js` keeps the games' long-standing API on top of it, and `shared/brainer-showcase.js` is the website's 3D showcase.

It takes a pose for each expression. One renderer draws the Brainer from behind in the cockpit, and from the front for the portrait, the parachute, the crash spotlight and the level-up card. Without WebGL, the old 2D art below stands in.

The face (`shared/led-face.js`) is drawn live in LED dots, so it reacts to the flight, and it changes from one expression to the next dot by dot. At rest each stage shows its own face and pose. The 2D fallback still uses `face.js` and `assets/brainer-N-blank.png`. The expressions:
- While playing: focused with eyes on the path you hover, a wink at take-off, and a gulp with sweat while bombs fall.
- After a step: "phew" on a safe path.
- When you jump: happy, star-eyed when excited, amazed on a big win, and ecstatic.
- On a crash: shocked, then sad with tears, and dizzy spirals in the crash spotlight.
- Other times: heart eyes on a level-up, and sleepy when left alone.

It blinks, and the glasses slip when it gets a fright.

### Brain levels

Brain levels are the Brainer's growth and never change the odds. Every finished flight earns 10 brain cells, the same at any bet and difficulty, so progress never asks for bigger bets. There are 100 levels in 10 stages: every 10 levels the Brainer grows into its next stage (Baby, Toddler, Kid, School kid, Teen, Student, Young pro, Pro, Expert, Master), each with its own colour, pose and face, and a new accessory every two stages. Level 10 takes about 80 flights, level 100 about 20,000. Level 20 unlocks the Cloud sea world and level 40 the City at dusk. In the demo, tapping the portrait opens "Your Brainer", with a slider to set any level and the worlds.

Progress lives in the browser (`localStorage` keys `brainer.xp` and `brainer.level`), shared by every game and the website on the same origin. Flights are drawn in the browser so the math can be inspected. A production build must draw and settle them on the server, and keep brain cells on the player's account.

### Intro

`shared/intro.js` is the Brainer Games intro for every game, and it is about the character. The player's 3D Brainer does the game's thing in the middle: flying its plane in Plane Crash, standing on a plot of the foggy valley in FogRush. Its LED screen starts dark and switches on as the game loads (a power dot, a line, the blue, the LEDs rippling on, its eyes opening), never ahead of the loading; then its face follows, with a wink at 100%. Under it are the game's styled wordmark and a 0–100% counter, and the studio logo sits small in the corner. It plays in full once a visit and short after that. The wordmarks (`BrainerIntro.wordmark`) also head each game's top bar.

