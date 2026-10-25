# Brainer Games

The Brainer Games studio website and its browser games, one folder per game. Everything is plain HTML, CSS and JavaScript with no build step.

| Folder | What it is | Published at |
|---|---|---|
| `Website` | B2B studio site for casinos and aggregators | `/` |
| `Game #1 - Plane Crash` | Plane Crash demo, play money only | `/plane-crash/` |

On every push to `main`, `.github/workflows/pages.yml` publishes the website as the site root with the game next to it, so the site's game page embeds the demo from the same origin and both share the player's brain cells.

## Run it locally

Serve the repo root so the website can reach the game folder, then open http://localhost:5174/Website/:

```bash
python -m http.server 5174
```

To work on the game alone, serve its folder and open http://localhost:5173:

```bash
python -m http.server 5173 --directory "Game #1 - Plane Crash"
```

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

Everything is drawn in code on a canvas, with no image files except the Brainer portraits. The plane and the Brainer are shaded as solids lit from the upper left. The default world is Lavender fields: patchwork farmland with a river, a road, trees and clouds casting shadows. Two other worlds can be compared with `?world=clouds` (a sea of clouds at sunset) and `?world=city` (Brainer city at dusk); adding `?worlds` shows a switcher on the stage.

The Brainer is a real 3D model, rendered live with three.js (self-hosted in `assets/vendor/`, MIT licence). It is built in `brainer3d.js` from primitives:
- A pearl body.
- A curved screen showing the face.
- A glass dome holding a brain of neurons that grows with the brain level.
- A ribbed collar, and floating hands and feet.

It takes a pose for each expression. One renderer draws the Brainer from behind in the cockpit, and from the front for the portrait, the parachute, the crash spotlight and the level-up card. Without WebGL, the 2D art below stands in.

The face (`face.js`, shared by both) is drawn live, so it reacts to the flight. `assets/brainer-N-blank.png` is the brand art with the painted face removed; at rest each level shows the face from its art (a wink, happy arcs, a grin, heart eyes, glasses). It has 14 expressions:
- While playing: focused with eyes on the path you hover, a wink at take-off, and a gulp with sweat while bombs fall.
- After a step: "phew" on a safe path.
- When you jump: happy, star-eyed when excited, amazed on a big win, and ecstatic.
- On a crash: shocked, then sad with tears, and dizzy spirals in the crash spotlight.
- Other times: heart eyes on a level-up, and sleepy when left alone.

It blinks, and the glasses slip when it gets a fright.

### Brain levels

Brain levels are the Brainer's growth and never change the odds. Every finished flight earns 10 brain cells, the same at any bet and difficulty, so progress never asks for bigger bets. There are 100 levels in 10 stages: every 10 levels the Brainer gets a new look from the brand book, and its brain gains neurons every few levels. Level 10 takes about 80 flights, level 100 about 20,000. Level 20 unlocks the Cloud sea world and level 40 the City at dusk. In the demo, tapping the portrait opens "Your Brainer", with a slider to set any level and the worlds.

Progress lives in the browser (`localStorage` keys `brainer.xp` and `brainer.level`), shared by every game and the website on the same origin. Flights are drawn in the browser so the math can be inspected. A production build must draw and settle them on the server, and keep brain cells on the player's account.

### Intro

`intro.js` is the Brainer Games intro, meant for every game: brain cells fly in and link into a network, fall into the logo, the wordmark rises, and the game's own motif plays (here a plane drawing its trail under "Plane Crash") while a row of neurons shows the loading. It plays in full once a visit and short after that, and opens like an iris once the game is ready.

