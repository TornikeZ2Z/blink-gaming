# Key art for the game cards: the Brainer large and in action, 4:5, with the bottom quarter left calm for the card's
# title. Three looks to choose from, tried on Fly High (the Iron Brainer jetting up):
#   cinematic  the game's world, real light: up through golden-hour clouds high over the valley
#   poster     the Brainer big against the brand violet, rays and speed streaks (the background is painted in post)
#   diorama    a little floating island of the game's world, the Brainer lifting off it, on a soft lavender ground
# usage: blender -b --python keyart.py -- <outdir> <look> [width]   (writes keyart_<look>.png; post.py finishes poster/diorama)
import bpy, bmesh, math, os, sys, runpy, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, LOOK = argv[0], argv[1]
WIDTH = int(argv[2]) if len(argv) > 2 else 800
DIR = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], '--', OUT, 'none']   # load the Brainer kit as a library: its own modes do nothing
K = runpy.run_path(os.path.join(DIR, 'brainer2.py'), run_name='brainer2')
material, ell, cyl, rbox, capsule, done, look, lin, build, STAGES = (K[n] for n in ('material', 'ell', 'cyl', 'rbox', 'capsule', 'done', 'look', 'lin', 'build', 'STAGES'))
scene = bpy.context.scene
rnd = random.Random(5)
O = bpy.data.objects

# ---------- the Iron Brainer: stage 6 (the student in its violet cap), star-eyed, with jet boots and a jet pack ----------
STAGE = 6
root = build(STAGE, 'G', style='carved_dense', face='face_pixel_excited.png', pose={})
s = root.scale.x
nozzle = material('Nozzle', '#2B2452', rough=0.3, metal=0.7)
metal = material('JetMetal', '#D9DDE6', rough=0.25, metal=1.0)
flame_core = material('FlameCore', '#FFFFFF', emit='#FFF6D0', strength=60)
flame_out = material('FlameOut', '#FF9A3D', emit='#FF7A1A', strength=35, alpha=0.9)
def flame(name, at, down, length, radius, parent):   # a jet flame: a hot white core inside an orange cone, pointing along down
    d = Vector(down).normalized()
    for k, (mat, r, l) in enumerate(((flame_out, radius, length), (flame_core, radius * 0.5, length * 0.6))):
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=r, radius2=0.0, depth=l, location=Vector(at) + d * (l / 2))
        o = bpy.context.active_object; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (-d).to_track_quat('Z', 'Y')
        done(o, f'{name}{k}', mat, parent)
for nm in ('L', 'R'):   # boots: a nozzle under each, flames down
    boot = O[f'Boot{nm}']; p = boot.matrix_world.translation
    cyl(f'BootJet{nm}', 0.11 * s, 0.1 * s, (p.x, p.y + 0.03 * s, p.z - 0.12 * s), (0, 0, 0), nozzle, boot, bevel=0.01)
    flame(f'BootFlame{nm}', (p.x, p.y + 0.03 * s, p.z - 0.17 * s), (0, 0, -1), 0.95 * s, 0.1 * s, boot)
body = O['Body']; bp = body.matrix_world.translation
rbox('JetPack', (0.26 * s, 0.12 * s, 0.24 * s), (bp.x, bp.y + 0.5 * s, bp.z + 0.32 * s), 0.08 * s, metal, body)
for sd in (-1, 1):
    q = (bp.x + sd * 0.14 * s, bp.y + 0.55 * s, bp.z + 0.02 * s)
    cyl(f'PackJet{sd}', 0.07 * s, 0.14 * s, q, (0, 0, 0), nozzle, body, bevel=0.01)
    flame(f'PackFlame{sd}', (q[0], q[1], q[2] - 0.08 * s), (0, 0.25, -1), 1.3 * s, 0.085 * s, body)
# the flying pose: leaning into the climb, arms back and out a little like a rocket, legs trailing
O['Body'].rotation_euler = (0.14, 0, 0.05)
O['Head'].rotation_euler = (-0.18, 0.05, 0.1)   # chin up, looking where it climbs
O['ArmL'].rotation_euler = (0.55, 1.05, 0); O['ArmR'].rotation_euler = (0.4, -1.15, 0)   # swept back and out, like a rocket's fins
O['LegL'].rotation_euler = (0.55, 0.08, 0); O['LegR'].rotation_euler = (0.25, -0.1, 0)   # trailing behind
root.rotation_euler = (0.22, -0.32, -0.3)   # tilted into a climb up and to the right, turned a little toward the camera

# ---------- lights, camera and the world for each look ----------
def area(loc, energy, size, color, target):
    bpy.ops.object.light_add(type='AREA', location=loc); l = bpy.context.active_object
    l.data.energy = energy; l.data.size = size; l.data.color = lin(color); look(l, target); return l
def camera(loc, target, lens):
    bpy.ops.object.camera_add(location=loc); c = bpy.context.active_object; scene.camera = c; look(c, target); c.data.lens = lens; c.data.clip_end = 3000; return c
cloud_m = material('KeyCloud', '#FFFFFF', rough=0.95, sss=0.25, sheen=0.6)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1); PUFF = bpy.context.active_object
PUFF.data.materials.append(cloud_m); [setattr(p, 'use_smooth', True) for p in PUFF.data.polygons]; PUFF.hide_render = True; PUFF.hide_viewport = True
def cloud(x, y, z, size, n=6, flat=0.55):   # a cumulus of overlapping puffs, flat-bottomed
    for k in range(n):
        o = bpy.data.objects.new('Puff', PUFF.data); bpy.context.collection.objects.link(o)
        r = size * rnd.uniform(0.45, 0.9); o.location = (x + rnd.uniform(-1.3, 1.3) * size, y + rnd.uniform(-0.6, 0.6) * size, z + r * 0.25)
        o.scale = (r * 1.15, r, r * flat)

lift = 1.1   # the Brainer flies above its feet' rest height
root.location.z += lift
target = Vector((0, 0, 1.25 + lift))
if LOOK == 'cinematic':
    w = bpy.data.worlds.new('Sky'); scene.world = w; w.use_nodes = True; nt = w.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mr = nt.nodes.new('ShaderNodeMapRange'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    mr.inputs['From Min'].default_value = -0.02; mr.inputs['From Max'].default_value = 0.55   # the view direction's height: horizon to zenith
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (*lin('#FFD7A3'), 1); ramp.color_ramp.elements[1].color = (*lin('#3F3CC9'), 1)
    mid = ramp.color_ramp.elements.new(0.3); mid.color = (*lin('#A9B6FF'), 1)
    nt.links.new(ramp.outputs['Color'], nt.nodes['Background'].inputs['Color']); nt.nodes['Background'].inputs['Strength'].default_value = 1.0
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 30)); sun = bpy.context.active_object
    sun.data.energy = 6.5; sun.data.angle = math.radians(3); sun.data.color = lin('#FFD8A8'); sun.rotation_euler = (math.radians(68), 0, math.radians(-128))   # low, warm, from behind-left: rim light
    area((4.5, -6, 4.5), 900, 5, '#E8E6FF', target)   # a soft fill on the face from the camera side
    # the valley far below, and clouds round and under the Brainer
    gm = bpy.data.materials.new('Valley'); gm.use_nodes = True; gt = gm.node_tree; gb = gt.nodes['Principled BSDF']
    tex = gt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(os.path.join(DIR, '..', '..', 'Game #1 - Plane Crash', 'assets', 'valley-ground.webp')); tex.extension = 'MIRROR'
    mp = gt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (6, 6, 1); tcg = gt.nodes.new('ShaderNodeTexCoord')
    gt.links.new(tcg.outputs['UV'], mp.inputs['Vector']); gt.links.new(mp.outputs['Vector'], tex.inputs['Vector']); gt.links.new(tex.outputs['Color'], gb.inputs['Base Color']); gb.inputs['Roughness'].default_value = 0.9
    bpy.ops.mesh.primitive_plane_add(size=2400, location=(0, 300, -140)); g = bpy.context.active_object; g.data.materials.append(gm)
    for k in range(60):   # a sea of cloud below, thinning into the distance
        cloud(rnd.uniform(-180, 180), rnd.uniform(10, 420), rnd.uniform(-60, -35), rnd.uniform(9, 20), n=7)
    for (x, y, z, sz) in ((-4.5, 4, -1.5, 2.0), (5.5, 7, 0.2, 2.4), (-7, 14, 4.5, 3.5), (8, 16, -2, 3.2), (-2.5, 1.5, -3.2, 1.4), (3.2, 2, -3.0, 1.2)):
        cloud(x, y, z, sz)
    cam = camera((1.9, -5.0, 1.2 + lift), target + Vector((0.1, 0, -0.1)), 40)
    cam.data.dof.use_dof = True; cam.data.dof.focus_object = O['Head']; cam.data.dof.aperture_fstop = 2.8
    scene.render.film_transparent = False
elif LOOK in ('poster', 'diorama'):
    w = bpy.data.worlds.new('Studio'); scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin('#EDE9FF'), 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    area((-4, -6, 6), 1300, 5, '#FFF4EA', target)                 # key
    area((5, 3.5, 3.5), 1600, 3, '#8F6BFF' if LOOK == 'poster' else '#A58BFF', target)   # violet rim
    area((-5, 3.5, 2.5), 900, 3, '#5FE8FF', target)                 # cyan rim
    area((3, -5, 0.5), 300, 4, '#E8E4FF', target)                   # under-fill
    if LOOK == 'poster':   # clouds the Brainer bursts out of, low in the frame
        for (x, y, z, sz) in ((-2.4, 1.8, -1.2, 1.1), (2.6, 1.6, -1.4, 1.2), (0.2, 3.0, -1.7, 1.4), (-3.4, 3.6, 0.8, 0.8), (3.6, 4.0, 1.6, 0.9)):
            cloud(x, y, z, sz, n=7)
        cam = camera((1.8, -5.6, 1.0 + lift), target + Vector((-0.15, 0, -0.3)), 40)
    else:   # the diorama: a round island of the valley with a runway, trees and a tower, floating on its rock
        isl = Vector((0, 0.6, -1.05))
        grass = material('IsleGrass', '#7FCB5A', rough=0.85, sheen=0.3); earth = material('IsleEarth', '#9C7A58', rough=0.9)
        cyl('IsleTop', 1.7, 0.28, tuple(isl), (0, 0, 0), grass, None, bevel=0.1, verts=96)
        bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=1.66, radius2=0.25, depth=1.7, location=tuple(isl + Vector((0, 0, -0.99))), rotation=(math.pi, 0, 0))
        done(bpy.context.active_object, 'IsleRock', earth)
        rbox('IsleRunway', (0.26, 1.25, 0.02), tuple(isl + Vector((0.45, 0, 0.15))), 0.02, material('IsleTarmac', '#4A4D57', rough=0.8), None, segs=2, sub=0)
        for k in range(5): rbox(f'IsleDash{k}', (0.025, 0.1, 0.005), tuple(isl + Vector((0.45, -1.0 + k * 0.5, 0.175))), 0.004, material('Paint', '#FFFFFF'), None, segs=1, sub=0)
        tree = material('IsleTree', '#3FAE5A', rough=0.8, sheen=0.4)
        for k in range(9):
            a = rnd.uniform(0, math.tau); r = rnd.uniform(0.9, 1.45)
            if abs(math.cos(a) * r - 0.45) < 0.5: continue
            ell(f'IsleTree{k}', (0.17, 0.17, 0.2), tuple(isl + Vector((math.cos(a) * r, math.sin(a) * r, 0.42))), tree, None, segs=20, rings=10)
        cyl('IsleTower', 0.08, 0.6, tuple(isl + Vector((-0.7, 0.9, 0.45))), (0, 0, 0), material('White', '#FFFFFF', rough=0.3), None)
        cyl('IsleCab', 0.16, 0.14, tuple(isl + Vector((-0.7, 0.9, 0.8))), (0, 0, 0), material('Cab', '#9FE8FF', emit='#4FD7FF', strength=0.6), None)
        for (x, y, z, sz) in ((-2.3, 1.2, -2.4, 0.7), (2.4, 1.8, -2.3, 0.8), (0.3, 3.0, -2.8, 0.9), (-1.4, -0.6, -3.0, 0.55)):
            cloud(x, y, z, sz, n=6)
        cam = camera((2.5, -7.1, 1.5 + lift), Vector((0, 0.3, 0.15 + lift)), 40)
    scene.render.film_transparent = True

scene.render.engine = 'CYCLES'; scene.cycles.samples = 128; scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = WIDTH, WIDTH * 5 // 4
scene.view_settings.view_transform = 'Standard'
scene.view_settings.exposure = -0.25 if LOOK == 'cinematic' else -0.4
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try: prefs.compute_device_type = t; break
        except Exception: pass
    for d in prefs.devices: d.use = True
    scene.cycles.device = 'GPU' if any(d.type != 'CPU' for d in prefs.devices) else 'CPU'
except Exception: scene.cycles.device = 'CPU'
scene.render.filepath = os.path.join(OUT, f'keyart_{LOOK}.png'); bpy.ops.render.render(write_still=True); print('RENDERED', scene.render.filepath)
