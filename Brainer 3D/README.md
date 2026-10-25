# Brainer 3D

The Brainer character and the shared game world, modelled in Blender with Python. These are the sources of every
render of the character and of `shared/models/brainer.glb`, the 3D model the website and the games load.

## The approved character (2026-10-25)

- **Head:** a clean, round head, with a big LED visor covering nearly the whole face. There is no brain on the body.
- **Face:** an LED dot-matrix face on an even blue screen, drawn by `shared/led-face.js`. It covers 18 expressions,
  the screen switching off and on, and a dot-by-dot change between faces.
- **Stages:** ten "Grows up" stages, from baby to master, one per ten brain levels:
  - Each stage has its own pose, LED face and trim colour.
  - The chest shows the stage number in LED dots.
  - Each pair of stages shares one accessory: none, scarf, cap, bow tie, graduation cap.

## Files

| File | What it does |
|---|---|
| `blender/brainer2.py` | The character. `build()` makes any stage; `STAGES` holds each stage's name, face and pose. It renders lineups, hero shots, the power-on and the old design options. |
| `blender/export_glb.py` | Exports `brainer.glb` for the browser: the stage 1 body, every accessory, and named materials the page paints or recolours (Screen, ChestScreen, Accent, AccCap, AccBowTie, AccTassel). |
| `blender/world.py` | The world both games share: the airfield Plane Crash takes off from, and the foggy valley FogRush is played in. Three looks: meadow, tech, islands. |
| `blender/*compose*.py`, `world_sheet.py`, `power_*.py` | Put renders on the brand background with titles. |
| `textures.html`, `textures.mjs` | Draw the LED textures the renders need (faces, power-on steps, chest numbers) with the same code the site uses. |

## Running it

Run all commands from the `Brainer 3D` folder.

Blender 5.2 runs headless.

1. Make the textures. In one terminal, serve the repo root:

```bash
python -m http.server 8000 --directory ..
```

   Then, in a second terminal, run the texture script. It needs puppeteer-core and Chrome:

```bash
node textures.mjs http://localhost:8000/
```

2. Render the lineup, one row at a time:

```bash
blender -b --python blender/brainer2.py -- out lineup G 1
```

3. Export the web model:

```bash
blender -b --python blender/export_glb.py -- ../shared/models/brainer.glb
```

4. Render the world:

```bash
blender -b --python blender/world.py -- out meadow establish 1600
```

The generated textures and renders are not committed. `.gitignore` keeps them out.
