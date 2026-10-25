# Blink Gaming

Browser games, one folder per game.

| Game | Folder | Status |
|---|---|---|
| Plane Crash | `Game #1 - Plane Crash` | Concept build, demo credits only |

## Run a game locally

Each game is plain HTML, CSS and JavaScript with no build step. Serve its folder and open the page:

```bash
python -m http.server 5173 --directory "Game #1 - Plane Crash"
```

Then open http://localhost:5173.

## Plane Crash

The player's Brainer robot flies a plane toward five hoops while bombs fall ahead. At each step the player picks one of the five paths, or jumps out with a parachute to take the current win. A bomb on the chosen path ends the flight. Each flight is single-player and runs at the player's pace: no timers or shared rounds.

| Level | Paths to clear | First → top multiplier | Bomb chance per path |
|---|---|---|---|
| Easy | 24 | 1.02× → 24.5× | 4% rising to 20% |
| Medium | 22 | 1.11× → 2,254× | 12% rising to 44% |
| Hard | 20 | 1.22× → 52,067× | 20% rising to 58% |
| Hardcore | 15 | 1.60× → 3,203,385× | 39% rising to 78% |

Step counts, first and top multipliers and the 98% RTP follow Chicken Road; the steps in between are fitted so jumping at any step returns 98%. Every path at every step rolls HMAC-SHA256(server seed, "client seed:nonce:step:path"), so the chosen path survives with the same odds whichever one is picked.

### Brain cells

Every path flown earns one brain cell, and cells raise the robot's brain level from 1 to 10 (thresholds in `cfg.brain`). The glass dome shows the level, using the ten Brainer characters in `assets/`. Each level can add a small boost to every multiplier, locked in when a flight starts: +0% at level 1 up to +1% at level 10. The boost is pending legal review; `cfg.brain.boostOn = false` turns it off and keeps the certified 98%. In this demo the cells live in the browser (`localStorage` key `brainer.cells`), shared by every game on the same site.

Flights are drawn in the browser so the math can be inspected. A production build must draw and settle them on the server, and keep brain cells on the player's account.
