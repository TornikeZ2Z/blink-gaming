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

The player's Brainer robot flies a plane toward five hoops while bombs fall ahead. At each step the player picks one of the five paths, or jumps out with a parachute to take the current win. A bomb on the chosen path ends the flight. Each flight is single-player and runs at the player's pace: no timers or shared rounds. All amounts are play-money US dollars: bets $0.10 to $200, max win $10,000 per flight.

| Difficulty | Paths | First → top multiplier at 98% RTP | Bomb chance per path |
|---|---|---|---|
| Easy | 24 | 1.04× → 25× | 6% rising to 19% |
| Medium | 22 | 1.11× → 400× | 12% rising to 34% |
| Hard | 20 | 1.22× → 2,500× | 20% rising to 43% |
| Hardcore | 15 | 1.60× → 10,000× | 39% rising to 52% |

The step counts and first multipliers follow Chicken Road; the tops were brought down from Chicken Road's to sensible values. The bomb chance rises with every step, fitted so that jumping out at any step returns the RTP. Every path at every step rolls HMAC-SHA256(server seed, "client seed:nonce:step:path"), so the chosen path survives with the same odds whichever one is picked. The shield button in the game shows the next flight's seed hash and re-checks the last flight: it re-hashes the revealed seed and redraws every bomb.

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

Every path flown earns brain cells: stake × that step's bomb chance × 10. Cells follow the risk taken rather than the time spent, so grinding Easy is slow (a $10 Easy path earns about 6 cells, a $10 Hardcore path about 39). Ten levels need 0, 50, 150, 300, 550, 900, 1,400, 2,100, 3,000 and 4,200 cells (`cfg.brain.cells`).

The brain level sets the RTP, locked when a flight starts: 96.5% at level 1, below Chicken Road; 98% at level 5, level with it; 98.75% at level 10, a little above. The odds never change, only the payout. This is a demo feature pending test-lab and legal review; `cfg.brain.on = false` keeps every player at 98%. In the demo, tapping the robot portrait picks any level.

Cells live in the browser (`localStorage` key `brainer.cells`), shared by every game and the website on the same origin. Flights are drawn in the browser so the math can be inspected. A production build must draw and settle them on the server, and keep brain cells on the player's account.
