# Handoff: Brainer Games, 3D character, world and demos

Last updated 2026-10-26, after a full live test on Tornike's second account. This is for the next Claude session. It covers the game/3D work, which belongs to the "BG - Game Developer" session. The website (`Website/`) belongs to the "BG - Website Developer" session: commit only your own paths and never run `git add -A`.

Live site: https://brainer.datastudio.ge. It deploys from `TornikeZ2Z/brainer-games`, branch `main`, through GitHub Pages (`.github/workflows/pages.yml`).

## What is decided (Tornike approved all of it)

- **Character.** The Blender Brainer:
  - a clean round head with a big LED-pixel visor face
  - no brain on the body
  - an even blue screen
  - an off state, then a power-on animation (dot, line, blue, LEDs ripple on, eyes open)
- **Evolution.** Ten "Grows up" stages, one per 10 brain levels:
  - Baby, Toddler, Kid, School kid, Teen, Student, Young pro, Pro, Expert, Master.
  - Each stage has its own pose, LED face and colour, and shows its number on the chest.
  - One accessory per pair of stages: none, scarf, cap, bow tie, graduation cap.
  - No cane and no glasses. The master's colour is royal violet `#4A1C9E`.
- **World.** One connected **Meadow** world:
  - Plane Crash parks at an airfield (runway, the "B" hangar, the tower) and flies over the meadow.
  - FogRush is played on grass plots in a foggy valley next to that airfield.

## Where things live

- `Brainer 3D/`: the Blender kit. See its README.
  - `blender/brainer2.py` builds the character; `STAGES` holds the stage poses.
  - `export_glb.py` writes the web model, `world.py` the world and card shots, `pc_sprites.py` the airfield sprites.
  - `textures.mjs` makes the LED textures.
  - `renders/stages/1..10.png` are the stage stills.
  - Blender 5.2 is installed at `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe` and runs headless.
- `shared/`:
  - `models/brainer.glb`: the web model, 1 MB.
  - `brainer-model.js`: the rig both games and the site use.
  - `brainer3d.js`: the games' Brainer API, plus the plane, the parachute and BrainerStage.
  - `led-face.js`: the LED faces, the power-on and the chest numbers.
  - `brainer-showcase.js`: the website hero.
  - `glb-lite.js`: the GLB loader.
  - `gl-guard.js`: WebGL loss handling.
  - `focus.js` and `focus.css`: full screen.
- The games: `Game #1 - Plane Crash/` and `Game #2 - FogRush/`.

## Full live test and fixes, 2026-10-26 (d8b6167)

1. **What was tested.** Everything on https://brainer.datastudio.ge, at desktop (1440×900) and phone (390×844, touch), each from a fresh first visit:
   - All 10 website pages, including both game pages: no errors, no failed requests, no broken images, no sideways overflow.
     - The 18+ check opens on the first visit, the phone menu opens and the 3D hero takes stage and face picks.
     - The fairness checker matches (the SHA-256 was recomputed independently), and the contact form blocks an empty submit and sends nothing.
   - FogRush, 12 rounds, and Plane Crash, 16 flights: wins, bombs, crashes and parachute jumps, with the balance right after every round.
     - The fairness, How to play and Brainer picker sheets open, and full screen works.
   - A level-up into a new stage: starting 5 brain cells short of level 11, one FogRush round shows "Brain level 11 – New look: stage 2 of 10". The website's ladder then marks the player's Brainer at Toddler.
   - Full screen from inside the website's game page: the game takes the whole window on desktop and phone.
2. **Fixed and pushed:**
   - **FogRush keys on a Georgian keyboard.** WASD and C did nothing, because the layout sends "დ" for D. They now match `e.code` (`KeyW`, `KeyD`, `KeyC`…).
   - **The haze across the hangar and tower in Plane Crash.** The horizon haze was drawn over them, so it cut a hard line across both.
     - `groundFields()` now collects them in `tall` and draws them after `haze()`.
     - `standing()` tints each one evenly by the haze at its feet, through a reused offscreen canvas. Clear all of that canvas each time: smoothing samples past the drawn area.
   - **The top bar cut off the wallet at 430 px (iPhone Pro Max)** in both games: the Reset button was clipped or gone. Both games now:
     - use the compact bar up to 480 px;
     - hide the logo under 375 px, and How to play only at 330 px or less (FogRush used to hide it on every phone up to 420 px);
     - in FogRush, hide the wordmark up to 560 px.
   - Every width from 320 to 1024 px was measured, with a $10,000 balance.

## Done on 2026-10-25

1. **Blank hero on Tornike's phone, fixed.**
   - Cause: phones keep only about 8–16 WebGL contexts, shared by every tab of the site, and drop the oldest. A dropped canvas shows white with a broken-image icon. After graphics crashes Chrome can also block WebGL for the site, which made FogRush show "needs 3D graphics" with an empty bet field.
   - The fix, in `shared/gl-guard.js`:
     - A dropped context is rebuilt automatically in the showcase, in BrainerStage and in FogRush's world.
     - A tab hidden for more than 10 s gives its contexts back and rebuilds them when it is seen again.
     - Each intro's context is disposed when the intro ends.
     - If WebGL stays refused, `fail()` runs: the showcase shows a still (option `still`), and FogRush shows a clear "Try again" screen and hides its controls.
     - Phones get a lower pixel ratio and smaller shadow maps in the showcase.
   - All of these were tested by forcing context loss and by blocking WebGL.
2. **Full screen (Tornike asked for it).**
   - Both games have a new button in the top bar, next to sound. It uses the real Fullscreen API where allowed.
   - It always switches to a compact layout: no page padding, slim controls, and the bet keeps −/+ but loses its chips and labels.
   - Inside the website's game page it sends `postMessage({type:'brainer:focus', on})` to the parent.
3. **Top-bar overlaps fixed** from 320 to 1440 px. This missed 430 px, which was fixed on 2026-10-26. Between 761 and 1299 px the multiplier moves under the bar and the Brainer card and level-up move to the bottom left.
4. **Full check.**
   - All 9 website pages on phone and desktop: no errors, no failed requests, no broken images, no sideways overflow.
   - Both games played for 5 rounds each on phone and desktop with no page errors. The picker images load, and the fairness and tutorial sheets open.

## Still to do

- **For the website session.** Send it these; it owns `Website/`:
  - Pass `still: s => 'assets/brainer/robots/' + (s + 1) + '.webp'` to `mountShowcase` in `Website/assets/js/hero-3d.js`, so a phone without WebGL shows the stage picture.
  - Listen for the `brainer:focus` message on `game.html` and hide the site header and game bar while it is on (it matters on iPhone, which has no element full screen).
  - The **game cards** on the home and games pages (`Website/assets/games/plane-crash.svg`, `fogrush.webp`) still show the **old** Brainer with the brain dome. They need new art, 4:5 at about 800×1000.
  - The FogRush copy in `Website/assets/js/data.js` (tagline, description, specs) still says "sky islands hidden in the clouds". It should say a foggy valley next to the airfield.
- **The website session finished 1, 2 and 4 above (723ab97, live).** It is waiting for the card art, to this spec:
  - Save to `Brainer 3D/renders/cards/plane-crash.png` and `fogrush.png`.
  - 4:5 at 800×1000, opaque, full bleed. The card only rounds the corners, at about 20 px.
  - No text or logo.
  - The cards show at about 270–480 css px wide, so keep the Brainer large in frame.
  - Plane Crash: the new Brainer in its plane over the meadow, with the airfield readable but not crowding.
  - FogRush: the Brainer on a cleared plot with fog around it, plus a chest or a few revealed plots.
  - Then message the website session. It converts them to WebP and swaps them in; the operators page's skin tiles reuse the Plane Crash card.
- **New card art.**
  - First try: `world.py` views `card_plane` and `card_fog`. Command:

    ```
    blender -b --python world.py -- <out> meadow card_plane 1000
    ```

  - The cameras need another pass: the plane shot crowds in the tower, and fog hides the explorer. Move the plane camera away from the tower, and render the fog card on a cleared tile.
  - The alternative is in-game shots: the `#stage` element with the HUD hidden.
- **Small things from the 2026-10-26 test, not fixed yet:**
  - On phones, Plane Crash's level-up banner briefly covers the bottom of the "Crashed" card. `resetToStart()` shows the level-up while the crash card is still up.
  - FogRush's loading screen (`shared/intro.js`, theme `fog`) still shows the purple sky and cloud islands, not the foggy valley.
- **Not verified yet:** real iPhone Safari. The level-up and the Plane Crash crash path were verified on 2026-10-26.
- **Untracked, not ours:** `Marketing kit/`, `NewIdeas-backup/`, `blink-domains-available.csv`. Leave them.

## Testing set-up used

- The scratchpad served a copy of the site at `http://localhost:5181`, laid out like production: games at `/plane-crash/` and `/fogrush/`, shared at `/shared/`.
- Tests used puppeteer-core with Chrome and the flags `--use-angle=d3d11 --enable-gpu`.
- Two checks to repeat for any change to a game's input or top bar:
  - Send a Georgian-layout key through CDP: `Input.dispatchKeyEvent` with key "დ" and code "KeyD".
  - Measure the bar at every width from 320 to 1024 px, with `#balance` set to "$10,000.00".
- The Browser pane in the desktop app slows animation to about 1 frame per second while it is hidden. Play the games there only while it is showing, or use headless Chrome as above.
- To reproduce locally, serve the repo root and open the folders directly:

  ```
  python -m http.server 5174
  ```
