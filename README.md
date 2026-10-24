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

Pilots bet, take off and choose a route at each intersection. Safe routes raise the multiplier, a storm cloud crashes the plane, and Land cashes out. After n safe routes the multiplier is RTP ÷ pⁿ (p = chance of a safe route, 96% RTP by default). Rounds use a provably fair commit: SHA-256 of the server seed is shown before bets open, and HMAC-SHA256 shuffles the routes.

Rounds are drawn in the browser so the math can be inspected. A production build must draw and settle rounds on the server.
