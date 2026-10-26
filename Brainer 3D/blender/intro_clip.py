# The games' intro clip: in the dark only the Brainer's visor glows, lit as the Brainer Games logo; the lights come up
# on it and its world while the camera pulls back to the whole Brainer, face on; it wakes, then does the game's thing.
# The LED screens come from intro_faces.py (run it first); the timeline is intro_timeline.py.
# usage: blender -b --python intro_clip.py -- <game> <out dir> [w h samples frames]   frames: 1-132 or 1,30,60
#   game: charge          writes <out dir>/frame_####.png
import bpy, math, os, runpy, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
GAME, OUT = argv[0], os.path.abspath(argv[1])
RW, RH = (int(argv[2]), int(argv[3])) if len(argv) > 3 else (1280, 720)
SAMPLES = int(argv[4]) if len(argv) > 4 else 48
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from intro_timeline import OFF_END, LIGHTS, DOLLY, WAKE, ACTIONS
A = ACTIONS[GAME]
def frames(spec):   # 1-132, or 1,30,60
    out = []
    for part in spec.split(','):
        a, _, b = part.partition('-'); out += list(range(int(a), int(b or a) + 1))
    return out
FRAMES = frames(argv[5]) if len(argv) > 5 else list(range(1, A['end'] + 1))
TEX = os.environ.get('INTRO_TEX', os.path.join(OUT, 'tex'))   # the frames intro_faces.py wrote

# ---------- the game's world, built by its own key-frame script with its render switched off ----------
class _NoRender:
    def render(self, **k): return {'FINISHED'}
ops_render, bpy.ops.render = bpy.ops.render, _NoRender()
sys.argv = [sys.argv[0], '--', os.path.join(OUT, 'unused.png'), 'empty', str(RW), str(RH), str(SAMPLES), 'gold']
G = runpy.run_path(os.path.join(HERE, f'{GAME}.py'), run_name=GAME)
bpy.ops.render = ops_render
sc = bpy.context.scene; obj, wpos = G['obj'], G['wpos']
material, rbox, cyl, ell, capsule = G['material'], G['rbox'], G['cyl'], G['ell'], G['capsule']
sc.frame_start, sc.frame_end = 1, A['end']; sc.render.fps = 30

# ---------- the Brainer, standing face on, its screens playing the frames from intro_faces.py ----------
root = G['place'](1, {}, 'happy')
def play(o, prefix):   # an image material's texture becomes a numbered sequence, one image per frame
    tex = next(n for n in o.active_material.node_tree.nodes if n.type == 'TEX_IMAGE')
    tex.image = bpy.data.images.load(os.path.join(TEX, f'{prefix}_0001.png')); tex.image.source = 'SEQUENCE'
    u = tex.image_user; u.frame_duration = A['end']; u.frame_start = 1; u.frame_offset = 0; u.use_auto_refresh = True
play(obj('Screen'), 'face'); play(obj('ChestScreen'), 'chest')

def key(o, path, f, v):
    setattr(o, path, v); o.keyframe_insert(path, frame=f)
def pose(f, **p):   # key the joints at frame f; anything not named goes back to rest
    for n in ('ArmL', 'ArmR', 'LegL', 'LegR', 'Body', 'Head'):
        key(obj(n), 'rotation_euler', f, p.get(n, (0, 0, 0)))
    key(root, 'location', f, (0, 0, G['PAD'] + p.get('lift', 0.0)))

w0, w1, w2 = WAKE
pose(1); pose(w0)
pose(w1 + 2, Head=(0.05, 0.1, 0.12), lift=0.03)          # it wakes: a little tilt and bounce
pose(w2 + 3, Head=(0, -0.04, 0))
if GAME == 'charge':
    r0, r1 = A['reach']; b0, b1 = A['bring']; p0, p1 = A['plug']; c0, c1 = A['cheer']
    REACH = dict(ArmR=(-0.25, -0.55, 0), Body=(0, 0.1, -0.12), Head=(0, 0.05, -0.25))   # turned to the dock, its hand out
    pose(r0, Head=(0, -0.04, 0)); pose(r1, **REACH); pose(A['grab'] + 2, **REACH)
    CHEST = dict(ArmR=(-1.25, 0.55, 0), Head=(0.12, 0, 0))                                # the plug at its chest
    pose(b1, ArmR=(-1.1, 0.45, 0), Head=(0.12, 0, 0)); pose(p1, **CHEST); pose(p1 + 6, ArmR=(-1.25, 0.55, 0), Head=(0.0, 0, 0))
    pose(c0, ArmR=(-0.6, -0.4, 0), ArmL=(0, 0.3, 0))
    pose(c0 + 5, ArmL=(0, 1.75, 0), ArmR=(0, -1.75, 0), lift=0.22, Head=(-0.1, 0, 0))   # a cheer and a hop
    pose(c1, ArmL=(0, 1.7, 0), ArmR=(0, -1.7, 0), lift=0.0, Head=(-0.08, 0, 0))
    pose(A['end'], ArmL=(0, 1.7, 0), ArmR=(0, -1.7, 0), Head=(-0.08, 0, 0))

    # the charger dock at its right hand, the plug in it, and the cable to the pillar
    sc.frame_set(A['grab']); hand = wpos('HandR')
    white, violet, navy, chrome, rubber = (G[n] for n in ('white', 'violet', 'navy', 'chrome', 'rubber'))
    dock = Vector((hand.x + 0.05, hand.y + 0.02, G['PAD']))
    rbox('DockPost', (0.1, 0.08, (hand.z - dock.z) / 2 - 0.05), (dock.x, dock.y, (hand.z + dock.z) / 2 - 0.08), 0.04, white, None)
    rbox('DockBand', (0.105, 0.085, 0.02), (dock.x, dock.y, hand.z - 0.22), 0.015, violet, None, segs=4, sub=1)
    rbox('DockCup', (0.11, 0.1, 0.05), (dock.x, dock.y, hand.z - 0.13), 0.04, navy, None)
    def plug(name):   # a white plug with a violet grip ring and two chrome pins along its +Y
        p = bpy.data.objects.new(name, None); sc.collection.objects.link(p)
        for o in (rbox(name + 'Body', (0.07, 0.11, 0.07), (0, 0, 0), 0.05, white, p), rbox(name + 'Ring', (0.075, 0.02, 0.075), (0, -0.04, 0), 0.03, violet, p, segs=4, sub=1),
                  capsule(name + 'Pin1', (-0.03, 0.1, 0), (-0.03, 0.17, 0), 0.012, chrome, p), capsule(name + 'Pin2', (0.03, 0.1, 0), (0.03, 0.17, 0), 0.012, chrome, p)):
            o.parent = p
        return p
    held = plug('PlugHeld'); held.parent = obj('HandR')
    held.matrix_world = Matrix.Translation(hand + Vector((0, -0.02, 0.0))) @ Matrix.Rotation(math.pi / 2, 4, 'X')   # pins down, into the dock
    docked = plug('PlugDock'); docked.matrix_world = held.matrix_world.copy()
    sc.frame_set(p1); chest_m = obj('ChestScreen').matrix_world
    inchest = plug('PlugChest'); inchest.matrix_world = chest_m @ Matrix.Translation((0, 0, 0.12)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')   # pins into the screen
    inchest.parent = obj('Body'); inchest.matrix_parent_inverse = obj('Body').matrix_world.inverted()
    def show(p, frames):   # a plug renders only on its frames
        for f in range(1, A['end'] + 1):
            on = frames[0] <= f < frames[1]
            for o in [p] + list(p.children):
                o.hide_render = not on; o.keyframe_insert('hide_render', frame=f)
    show(docked, (1, A['grab'])); show(held, (A['grab'], p1)); show(inchest, (p1, A['end'] + 1))
    # the cable: from the pillar's foot to whichever plug shows, baked frame by frame
    x, y = G['PILLAR']
    cu = bpy.data.curves.new('PlugCable', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.028; cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(2)
    cab = bpy.data.objects.new('PlugCable', cu); sc.collection.objects.link(cab); cu.materials.append(rubber)
    for f in range(1, A['end'] + 1):
        sc.frame_set(f); end = (docked if f < A['grab'] else held if f < p1 else inchest).matrix_world @ Vector((0, -0.12, 0))
        start = Vector((x - 0.3, y - 0.45, 0.12)); mid = Vector(((start.x + end.x) / 2 + 0.25, (start.y + end.y) / 2, 0.14))
        for bp, co in zip(sp.bezier_points, (start, mid, end)):
            bp.co = co; bp.handle_left_type = bp.handle_right_type = 'AUTO'
            bp.keyframe_insert('co', frame=f); bp.keyframe_insert('handle_left', frame=f); bp.keyframe_insert('handle_right', frame=f)
    # the charge: sparks at the chest and a cyan glow, the pad and the coils light up
    q0, q1 = A['charge']
    spark = material('IntroSpark', '#FFFFFF', emit='#7FE9FF', strength=60)
    import random; rr = random.Random(7)
    sc.frame_set(p1); port = obj('ChestScreen').matrix_world.translation + Vector((0, -0.2, 0))
    for k in range(26):
        v = Vector((rr.uniform(-1, 1), rr.uniform(-1, -0.2), rr.uniform(-0.3, 1))).normalized(); t0 = p1 + rr.randint(0, 6)
        s = bpy.data.objects.new(f'IntroSpark{k}', None); sc.collection.objects.link(s)
        capsule(f'IntroSpark{k}Line', tuple(port + v * 0.05), tuple(port + v * rr.uniform(0.14, 0.3)), 0.008, spark, s)   # its rounded ends are objects too
        for o in s.children:
            for f in range(1, A['end'] + 1):
                o.hide_render = not (t0 <= f < t0 + 3); o.keyframe_insert('hide_render', frame=f)
    bpy.ops.object.light_add(type='POINT', location=port + Vector((0, -0.3, 0.1))); zap = bpy.context.active_object
    zap.data.color = (0.5, 0.93, 1.0); zap.data.shadow_soft_size = 0.2
    for f, e in ((1, 0), (p1 - 1, 0), (p1, 400), (p1 + 4, 120), (q1, 160), (A['end'], 60)): key(zap.data, 'energy', f, e)

# ---------- the lights come up ----------
def ramp(sock_owner, path, full, f0=LIGHTS[0], f1=LIGHTS[1]):
    key(sock_owner, path, 1, 0.0); key(sock_owner, path, f0, 0.0); key(sock_owner, path, f1, full)
ramp(G['sun'].data, 'energy', G['sun'].data.energy)
ramp(G['fill'].data, 'energy', G['fill'].data.energy)
bg = sc.world.node_tree.nodes['Background'].inputs['Strength']; ramp(bg, 'default_value', bg.default_value)
# in the dark only the visor shows: everything else that glows comes on with the lights, and the visor lights nothing round it
for o in (obj('Screen'),):
    o.visible_diffuse = o.visible_glossy = o.visible_transmission = o.visible_volume_scatter = False
for m in bpy.data.materials:
    b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    if not b or m.name.startswith(('ScreenFace', 'IntroSpark')) or b.inputs['Emission Strength'].default_value <= 0: continue
    s = b.inputs['Emission Strength']; full = s.default_value; ramp(s, 'default_value', full)
    if GAME == 'charge' and m.name in ('PadGlow', 'CoilGlow'):   # the station flares as it charges
        key(s, 'default_value', A['charge'][0] - 1, full); key(s, 'default_value', A['charge'][0] + 4, full * 6); key(s, 'default_value', A['end'], full * 3)

# ---------- the camera: from the visor, filling the middle of the frame, back to the whole Brainer ----------
cam = sc.camera; cam.data.lens = 40; cam.data.dof.use_dof = False
sc.frame_set(1); face_c = obj('Screen').matrix_world.translation.copy()
v_w = max(obj('Screen').dimensions.x * obj('Screen').matrix_world.to_scale().x, 0.5)
tall = RH > RW   # a phone's clip: the same shot, framed for a tall screen
fw = 36 / cam.data.lens * min(RW, RH) / max(RW, RH) if tall else 36 / cam.data.lens   # frame width per unit of distance (the sensor spans the longer side)
start = face_c + Vector((0, -v_w / ((0.5 if tall else 0.3) * fw), 0))   # the visor as wide as the logo shows on that screen
# the Brainer ends a little above the middle: the game's name and the loading count go under it
end_tgt, end = (Vector((0.3, 0, 0.55)), Vector((0.3, -7.4, 1.5))) if tall else (Vector((0.3, 0, 0.75)), Vector((0.3, -6.4, 1.45)))
def look(at, frm): return (at - frm).to_track_quat('-Z', 'Y').to_euler()
d0, d1 = DOLLY
for f in range(1, A['end'] + 1):
    t = min(1.0, max(0.0, (f - d0) / (d1 - d0))); t = t * t * t * (t * (6 * t - 15) + 10)
    loc = start.lerp(end, t); at = face_c.lerp(end_tgt, t)
    cam.location = loc; cam.rotation_euler = look(at, loc); cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)

# ---------- render ----------
sc.view_settings.view_transform = 'Khronos PBR Neutral'; sc.view_settings.look = 'None'   # keeps the logo's own saturated blue on the visor (AgX greys it)
sc.view_settings.exposure = -0.45
sc.render.resolution_x, sc.render.resolution_y = RW, RH; sc.cycles.samples = SAMPLES
sc.render.image_settings.file_format = 'PNG'
for f in FRAMES:
    sc.frame_set(f); sc.render.filepath = os.path.join(OUT, f'frame_{f:04d}.png')
    bpy.ops.render.render(write_still=True); print('FRAME', f, flush=True)
