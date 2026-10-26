# The games' intro clip, frame by frame at 30 fps: the timeline both intro_faces.py (the LED screens) and intro_clip.py
# (the Blender shot) follow. Every game shares the opening (black, the logo lights up, the lights come up on the
# Brainer, it wakes); then each game has its own action.
FPS = 30
OFF_END = 10                     # black: the screen is off
FLICKER = [(10, 0.0), (16, 0.35), (19, 0.06), (23, 0.7), (25, 0.4), (30, 1.0)]   # the logo's screen flickers on (as the site's logo)
EYES = [(10, 0.12), (20, 0.12), (23, 1.08), (25, 1.0), (34, 1.0), (36, 0.12), (38, 1.0)]   # the eyes blink open, then blink once
LIGHTS = (40, 62)                # the lights come up on the Brainer and its world
DOLLY = (40, 80)                 # the camera pulls back from the visor to the whole Brainer
WAKE = (66, 70, 73)              # the logo's eyes close (66-70), the LED face takes over (70-73): it wakes up smiling

# the game's own action, after the wake
ACTIONS = {
    # it reaches to the charger dock at its side, takes the plug, plugs it into its chest: the battery fills, it cheers
    'charge': {'reach': (76, 86), 'grab': 86, 'bring': (86, 98), 'plug': (98, 102), 'charge': (102, 116), 'excited': 104, 'cheer': (112, 122), 'end': 132},
}

def keyed(keys, f):   # a value from (frame, value) keys, eased between them
    if f <= keys[0][0]: return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            t = (f - f0) / (f1 - f0); t = t * t * (3 - 2 * t)
            return v0 + (v1 - v0) * t
    return keys[-1][1]
