# The website's game cards in the poster look (Tornike's pick, 2026-10-27): the Brainer large and in action with its
# game's key piece, lit like a studio poster, rendered on a transparent background; post_keyart.py paints the brand
# violet behind it (rays, sparkles, streaks) and adds the glows. One stage per game, so the set also shows it growing.
# usage: blender -b --python cards.py -- <outdir> <game> [width]    games: fly-high plane-crash charge multi-charge space-crash
# writes keyart_<game>.png; then: python post_keyart.py <outdir> <game>
import bpy, bmesh, math, os, sys, runpy, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, GAME = argv[0], argv[1]
WIDTH = int(argv[2]) if len(argv) > 2 else 800
DIR = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], '--', OUT, 'none']   # load the Brainer kit as a library: its own modes do nothing
K = runpy.run_path(os.path.join(DIR, 'brainer2.py'), run_name='brainer2')
material, ell, cyl, rbox, capsule, torus, done, look, lin, build = (K[n] for n in ('material', 'ell', 'cyl', 'rbox', 'capsule', 'torus', 'done', 'look', 'lin', 'build'))
scene = bpy.context.scene
rnd = random.Random(5)
O = bpy.data.objects

# ---------- shared pieces ----------
def brainer(stage, face, pose):   # build a Grows-up Brainer and pose its joints (Blender angles, as in STAGES)
    root = build(stage, 'G', style='carved_dense', face=f'face_pixel_{face}.png', pose={})
    for k, v in pose.items(): O[k].rotation_euler = v
    return root
def glow(name, color, strength, alpha=1.0): return material(name, color, emit=color, strength=strength, alpha=alpha)
def flame(name, at, down, length, radius, parent=None, core='#FFF6D0', outer='#FF7A1A'):   # a jet flame along `down`
    d = Vector(down).normalized()
    for k, (mat, r, l) in enumerate(((material(f'FlameOut{outer}', outer, emit=outer, strength=35, alpha=0.9), radius, length), (material(f'FlameCore{core}', '#FFFFFF', emit=core, strength=60), radius * 0.5, length * 0.6))):
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=r, radius2=0.0, depth=l, location=Vector(at) + d * (l / 2))
        o = bpy.context.active_object; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (-d).to_track_quat('Z', 'Y')
        done(o, f'{name}{k}', mat, parent)
def bolt(name, a, b, mat, r=0.026, kinks=9, jag=0.16):   # a zigzag electric arc from a to b
    a, b = Vector(a), Vector(b); d = b - a; side = d.cross(Vector((0, 0, 1))).normalized() if abs(d.z) < d.length * 0.95 else Vector((1, 0, 0)); up = d.cross(side).normalized()
    pts = [a] + [a + d * (i / kinks) + side * rnd.uniform(-jag, jag) + up * rnd.uniform(-jag, jag) for i in range(1, kinks)] + [b]
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (*p, 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.collection.objects.link(ob); ob.data.materials.append(mat); return ob
cloud_m = material('KeyCloud', '#FFFFFF', rough=0.95, sss=0.25, sheen=0.6)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1); PUFF = bpy.context.active_object
PUFF.data.materials.append(cloud_m); [setattr(p, 'use_smooth', True) for p in PUFF.data.polygons]; PUFF.hide_render = True; PUFF.hide_viewport = True
def cloud(x, y, z, size, n=7, flat=0.55):   # a cumulus of overlapping puffs, flat-bottomed
    for k in range(n):
        o = bpy.data.objects.new('Puff', PUFF.data); bpy.context.collection.objects.link(o)
        r = size * rnd.uniform(0.45, 0.9); o.location = (x + rnd.uniform(-1.3, 1.3) * size, y + rnd.uniform(-0.6, 0.6) * size, z + r * 0.25)
        o.scale = (r * 1.15, r, r * flat)
def battery(at, level=4, scale=1.0):   # Charge's battery: dark glass, bright bars, a terminal on top; returns its top centre
    at = Vector(at); s = scale
    rbox('BattShell', (0.44 * s, 0.2 * s, 0.25 * s), tuple(at), 0.08 * s, material('BattShell', '#1B1640', rough=0.12, coat=1.0), None)
    rbox('BattCap', (0.07 * s, 0.12 * s, 0.05 * s), tuple(at + Vector((0.5 * s, 0, 0))), 0.03 * s, material('BattCap', '#D9DDE6', rough=0.25, metal=1.0), None)
    bar = glow('BattBar', '#4DF3C2', 7)
    for k in range(level): rbox(f'BattBar{k}', (0.075 * s, 0.205 * s, 0.17 * s), tuple(at + Vector((-0.3 * s + k * 0.2 * s, 0, 0))), 0.03 * s, bar, None, segs=3, sub=1)
    return at
def area(loc, energy, size, color, target):
    bpy.ops.object.light_add(type='AREA', location=loc); l = bpy.context.active_object
    l.data.energy = energy; l.data.size = size; l.data.color = lin(color); look(l, target); return l
def studio(target, rim='#8F6BFF', rim2='#5FE8FF'):   # the poster light: warm key, violet and cyan rims, a soft fill from below
    t = Vector(target)
    area(t + Vector((-4, -6, 4.8)), 1300, 5, '#FFF4EA', t); area(t + Vector((5, 3.5, 2.3)), 1600, 3, rim, t)
    area(t + Vector((-5, 3.5, 1.3)), 900, 3, rim2, t); area(t + Vector((3, -5, -0.7)), 300, 4, '#E8E4FF', t)
def camera(loc, target, lens=40):
    bpy.ops.object.camera_add(location=loc); c = bpy.context.active_object; scene.camera = c; look(c, target); c.data.lens = lens; c.data.clip_end = 3000; return c

# ---------- the five scenes ----------
if GAME == 'fly-high':   # the Iron Brainer jetting up out of the clouds
    root = brainer(6, 'excited', {'Body': (0.14, 0, 0.05), 'Head': (-0.18, 0.05, 0.1), 'ArmL': (0.55, 1.05, 0), 'ArmR': (0.4, -1.15, 0), 'LegL': (0.55, 0.08, 0), 'LegR': (0.25, -0.1, 0)})
    s = root.scale.x; nozzle = material('Nozzle', '#2B2452', rough=0.3, metal=0.7); metal = material('JetMetal', '#D9DDE6', rough=0.25, metal=1.0)
    for nm in ('L', 'R'):   # jet boots
        boot = O[f'Boot{nm}']; p = boot.matrix_world.translation
        cyl(f'BootJet{nm}', 0.11 * s, 0.1 * s, (p.x, p.y + 0.03 * s, p.z - 0.12 * s), (0, 0, 0), nozzle, boot, bevel=0.01)
        flame(f'BootFlame{nm}', (p.x, p.y + 0.03 * s, p.z - 0.17 * s), (0, 0, -1), 0.95 * s, 0.1 * s, boot)
    body = O['Body']; bp = body.matrix_world.translation
    rbox('JetPack', (0.26 * s, 0.12 * s, 0.24 * s), (bp.x, bp.y + 0.5 * s, bp.z + 0.32 * s), 0.08 * s, metal, body)
    for sd in (-1, 1):
        q = (bp.x + sd * 0.14 * s, bp.y + 0.55 * s, bp.z + 0.02 * s)
        cyl(f'PackJet{sd}', 0.07 * s, 0.14 * s, q, (0, 0, 0), nozzle, body, bevel=0.01)
        flame(f'PackFlame{sd}', (q[0], q[1], q[2] - 0.08 * s), (0, 0.25, -1), 1.3 * s, 0.085 * s, body)
    root.rotation_euler = (0.22, -0.32, -0.3); root.location.z += 1.1
    for (x, y, z, sz) in ((-2.4, 1.8, -1.2, 1.1), (2.6, 1.6, -1.4, 1.2), (0.2, 3.0, -1.7, 1.4), (-3.4, 3.6, 0.8, 0.8), (3.6, 4.0, 1.6, 0.9)): cloud(x, y, z, sz)
    target = Vector((0, 0, 2.35)); studio(target); camera((1.6, -5.9, 2.1), target + Vector((-0.55, 0, -0.35)))

elif GAME == 'plane-crash':   # waving from its plane as it banks between the hoops, bombs falling behind
    pr = bpy.data.objects.new('PlaneRoot', None); bpy.context.collection.objects.link(pr)
    white = material('PWhite', '#FFFFFF', rough=0.22, coat=0.8); vio = material('PViolet', '#5A3FFC', rough=0.25, coat=0.7); dark = material('PDark', '#2B2452', rough=0.4)
    ell('Fuselage', (1.0, 2.7, 0.9), (0, 0, 0), white, pr)   # a short, chubby toy plane
    ell('NoseCap', (0.66, 0.6, 0.62), (0, -2.4, 0), vio, pr)
    bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.26, radius2=0.0, depth=0.5, location=(0, -3.12, 0), rotation=(math.pi / 2, 0, 0)); done(bpy.context.active_object, 'Spinner', vio, pr)
    cyl('PropDisc', 1.35, 0.01, (0, -3.02, 0), (math.pi / 2, 0, 0), material('PropBlur', '#FFFFFF', alpha=0.1, rough=0.5), pr)
    for k in range(3):   # the blades, blurred a little by their own disc
        b = rbox(f'Blade{k}', (0.06, 0.02, 0.62), (0, -3.0, 0), 0.02, dark, pr, segs=2, sub=1); b.rotation_euler = (0, k * math.tau / 3 + 0.4, 0)
        b.location = (math.sin(k * math.tau / 3 + 0.4) * 0.62, -3.0, math.cos(k * math.tau / 3 + 0.4) * 0.62)
    rbox('Wing', (3.3, 0.9, 0.13), (0, -0.4, -0.25), 0.12, white, pr, segs=4, sub=1)
    for sd in (-1, 1): rbox(f'WingTip{sd}', (0.32, 0.92, 0.14), (sd * 3.05, -0.4, -0.25), 0.12, vio, pr, segs=4, sub=1)
    rbox('Tailplane', (1.4, 0.45, 0.08), (0, 2.45, 0.2), 0.07, white, pr, segs=3, sub=1)
    rbox('Fin', (0.1, 0.6, 0.75), (0, 2.6, 0.9), 0.08, vio, pr, segs=3, sub=1)
    torus('CockpitRim', 0.72, 0.12, (0, -0.5, 0.8), (0, 0, 0), white, pr, scale=(1, 1.2, 1))
    pilot = brainer(3, 'excited', {'ArmR': (-0.3, -1.75, 0), 'ArmL': (-1.2, 0.3, 0), 'Head': (0, -0.12, 0.12)})
    pilot.scale = tuple(v * 0.95 for v in pilot.scale); pilot.location = (0, -0.45, 0.3)   # a big pilot in a toy plane
    pilot.parent = pr
    pr.rotation_euler = (-0.12, -0.22, -0.3); pr.location = (0, 0, 1.2)   # nose up a little, banking, coming at the viewer   # nose up a little, banking, coming toward the camera from the right
    hoop = glow('Hoop', '#FFFFFF', 2.2)
    for (x, y, z, r) in ((-4.6, 9, 4.2, 1.15), (4.4, 12, 5.6, 1.15), (0.6, 16, 7.2, 1.15)): torus(f'Hoop{x}', r, 0.07, (x, y, z), (math.pi / 2, 0, 0), hoop, None)
    bombm = material('Bomb', '#262040', rough=0.25, coat=0.9); spark = glow('Spark', '#FFD56B', 18)
    for (x, y, z, r) in ((-2.4, 7, 6.4, 0.5), (5.6, 10, 2.6, 0.55)):
        ell(f'Bomb{x}', (r, r, r), (x, y, z), bombm, None, segs=32, rings=16)
        capsule(f'Fuse{x}', (x, y, z + r * 0.9), (x + 0.12, y, z + r * 1.35), 0.04, material('FuseCord', '#C9B38A'), None)
        ell(f'Spark{x}', (0.09, 0.09, 0.09), (x + 0.13, y, z + r * 1.42), spark, None, segs=12, rings=6)
    for (x, y, z, sz) in ((-3.0, 2.0, -1.6, 1.4), (3.2, 2.4, -1.9, 1.5), (0.0, 4.0, -2.3, 1.7), (-4.8, 6.0, 1.0, 1.0)): cloud(x, y, z, sz)
    target = Vector((0, -0.6, 1.7)); studio(target); camera((1.0, -9.9, 4.1), target + Vector((-0.1, 0, 0.4)))

elif GAME == 'charge':   # arms up on the charging pad, the battery over its head filling from two coils
    root = brainer(5, 'excited', {'ArmL': (0, 1.8, 0), 'ArmR': (0, -1.8, 0), 'LegL': (0, 0.25, 0), 'LegR': (0, -0.25, 0), 'Head': (-0.1, 0, 0)})
    root.location.z += 0.12
    padm = material('Pad', '#F4F2FF', rough=0.3, coat=0.6)
    cyl('Pad', 1.45, 0.34, (0, 0, -0.1), (0, 0, 0), padm, None, bevel=0.06, verts=96)
    torus('PadRing', 1.2, 0.06, (0, 0, 0.08), (0, 0, 0), glow('PadGlow', '#5FE8FF', 6), None)
    cyl('PadCore', 0.95, 0.02, (0, 0, 0.075), (0, 0, 0), glow('PadCore', '#BFF8FF', 1.4), None, verts=96)
    top = battery((0, 0, 2.95), level=4, scale=1.05)
    metal = material('CoilMetal', '#D9DDE6', rough=0.25, metal=1.0); ring = glow('CoilRing', '#8F6BFF', 6); arc = glow('Arc', '#E6FBFF', 30)
    for sd in (-1, 1):
        x, y = sd * 2.35, 1.5
        cyl(f'CoilBase{sd}', 0.42, 0.35, (x, y, 0.17), (0, 0, 0), padm, None, bevel=0.05)
        cyl(f'CoilShaft{sd}', 0.13, 2.6, (x, y, 1.6), (0, 0, 0), metal, None)
        for k in range(6): torus(f'Coil{sd}{k}', 0.3 - k * 0.02, 0.05, (x, y, 0.65 + k * 0.38), (0, 0, 0), ring, None)
        ell(f'CoilTop{sd}', (0.2, 0.2, 0.2), (x, y, 3.0), glow('CoilTop', '#BFF8FF', 12), None, segs=24, rings=12)
        for j in range(2): bolt(f'Bolt{sd}{j}', (x - sd * 0.15, y, 3.0), (sd * 0.5, 0.05, 2.95 + (j - 0.5) * 0.1), arc, r=0.022 if j else 0.03)
    target = Vector((0, 0.2, 1.75)); studio(target); camera((1.1, -6.3, 1.6), target + Vector((0, 0, -0.05)))

elif GAME == 'multi-charge':   # in the neon lab, pointing at the one of five crystal pillars it picks
    root = brainer(9, 'excited', {'ArmR': (-0.7, -1.35, 0), 'ArmL': (0.2, 0.3, 0), 'Head': (0, 0, -0.15), 'Body': (0, 0, -0.08)})
    floorm = material('LabFloor', '#1A1540', rough=0.2, coat=1.0)
    cyl('LabFloor', 4.6, 0.12, (0, 1.2, -0.06), (0, 0, 0), floorm, None, verts=128)
    torus('LabRing', 4.4, 0.035, (0, 1.2, 0.01), (0, 0, 0), glow('LabRing', '#5FE8FF', 5), None)
    torus('PadRing', 1.0, 0.05, (0, 0, 0.02), (0, 0, 0), glow('PadRingV', '#A58BFF', 6), None)
    glass = material('PillarGlass', '#CFE9FF', rough=0.08, trans=0.5, emit='#5FE8FF', strength=0.5)
    edge, edge_hot = glow('PillarEdge', '#5FE8FF', 5), glow('PillarHot', '#C9A6FF', 9)
    crystal, crystal_hot = glow('Crystal', '#9FF2FF', 5), glow('CrystalHot', '#E3CCFF', 14)
    pick = 3; tip = None
    for i, a in enumerate((-58, -29, 0, 29, 58)):
        ar = math.radians(a); x, y = 3.0 * math.sin(ar), 1.3 + 2.0 * math.cos(ar); hot = i == pick
        cyl(f'Pillar{i}', 0.24, 2.7, (x, y, 1.35), (0, 0, 0), glass, None, verts=6)
        for z in (0.06, 2.7): torus(f'PillarEdge{i}{z}', 0.27, 0.035, (x, y, z), (0, 0, 0), edge_hot if hot else edge, None)
        for sg in (1, -1):   # an octahedral crystal floating on top
            bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.26, radius2=0.0, depth=0.42, location=(x, y, 3.25 + sg * 0.21), rotation=(0 if sg > 0 else math.pi, 0, 0))
            done(bpy.context.active_object, f'Crystal{i}{sg}', crystal_hot if hot else crystal, None, smooth=False)
        if hot: tip = Vector((x, y, 3.25))
    top = battery((0, 0, 3.0), level=3, scale=0.95)
    arc = glow('Arc', '#F0E6FF', 30)
    for j in range(2): bolt(f'Bolt{j}', tip + Vector((-0.1, 0, 0)), (0.45, 0.05, 3.0 + (j - 0.5) * 0.1), arc, r=0.022 if j else 0.03)
    target = Vector((0.1, 0.6, 1.75)); studio(target, rim='#9F7BFF', rim2='#4FE0FF'); camera((0.9, -6.5, 1.9), target + Vector((0, 0, -0.05)))

elif GAME == 'space-crash':   # in its pod, laser on a shield drone, two more drones waiting behind
    podr = bpy.data.objects.new('PodRoot', None); bpy.context.collection.objects.link(podr)
    white = material('PodWhite', '#FFFFFF', rough=0.2, coat=0.9); vio = material('PodViolet', '#5A3FFC', rough=0.25, coat=0.7)
    glass = material('Canopy', '#E8F4FF', rough=0.02, trans=1.0, ior=1.25)
    ell('PodBody', (1.05, 1.2, 0.72), (0, 0, 0.55), white, podr)
    torus('PodBand', 0.98, 0.07, (0, 0, 0.55), (0, 0, 0), vio, podr, scale=(1.05, 1.18, 1))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.8, location=(0, -0.2, 1.05)); cp = bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(cp.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS'); bmesh.update_edit_mesh(cp.data); bpy.ops.object.mode_set(mode='OBJECT')
    done(cp, 'Canopy', glass, podr)
    for sd in (-1, 1):   # two engines, rings at the intake, cyan exhaust behind
        cyl(f'Engine{sd}', 0.42, 1.5, (sd * 1.3, 0.25, 0.55), (math.pi / 2, 0, 0), white, podr, bevel=0.08)
        torus(f'Intake{sd}', 0.42, 0.08, (sd * 1.3, -0.5, 0.55), (math.pi / 2, 0, 0), vio, podr)
        cyl(f'IntakeGlow{sd}', 0.34, 0.02, (sd * 1.3, -0.52, 0.55), (math.pi / 2, 0, 0), glow('IntakeGlow', '#8FE9FF', 2.5), podr)
        rbox(f'Fin{sd}', (0.5, 0.35, 0.06), (sd * 0.85, 0.4, 0.2), 0.05, vio, podr, segs=3, sub=1, rot=(0, sd * 0.4, 0))
        flame(f'Exhaust{sd}', (sd * 1.3, 1.0, 0.55), (0, 1, 0), 1.6, 0.3, podr, core='#E6FBFF', outer='#3FD0FF')
    pilot = brainer(7, 'excited', {'Head': (-0.1, 0, 0.1)})
    pilot.scale = tuple(v * 0.46 for v in pilot.scale); pilot.location = (0, -0.2, 0.62); pilot.parent = podr
    podr.rotation_euler = (-0.05, -0.15, 0.32); podr.location = (0, 0, 0.6)
    tiers = (('#5FE8FF', -3.4, 7, 4.4), ('#A58BFF', 0.6, 10, 5.6), ('#FFC94D', 4.0, 8, 2.9))
    for i, (col, x, y, z) in enumerate(tiers):   # shield drones: a dark core, a ring, a hexagonal shield of light
        ell(f'Drone{i}', (0.38, 0.38, 0.32), (x, y, z), material('DroneCore', '#2B2452', rough=0.25, metal=0.6), None, segs=32, rings=16)
        torus(f'DroneRing{i}', 0.5, 0.06, (x, y, z), (math.pi / 2, 0, 0), glow(f'DroneRing{col}', col, 6), None)
        cyl(f'Shield{i}', 1.05, 0.04, (x, y - 0.5, z), (math.pi / 2, 0, math.pi / 6), material(f'Shield{col}', col, emit=col, strength=1.6, alpha=0.32), None, verts=6)
        torus(f'ShieldEdge{i}', 1.05, 0.03, (x, y - 0.5, z), (math.pi / 2, 0, 0), glow(f'ShieldEdge{col}', col, 4), None)
    laser = glow('Laser', '#FF8FD8', 40); a, b = Vector((-1.0, -0.6, 1.6)), Vector((tiers[1][1], tiers[1][2] - 0.55, tiers[1][3]))
    capsule('Laser', tuple(a), tuple(b), 0.035, laser, None)
    ell('Hit', (0.32, 0.32, 0.32), tuple(b), glow('Hit', '#FFFFFF', 30), None, segs=24, rings=12)
    target = Vector((0, 0.3, 1.5)); studio(target, rim='#9F7BFF', rim2='#4FE0FF'); camera((1.2, -6.4, 2.3), target + Vector((0.1, 0, 0.35)))

# ---------- render ----------
w = bpy.data.worlds.new('Studio'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin('#EDE9FF'), 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
scene.render.film_transparent = True; scene.cycles.film_transparent_glass = True
scene.render.engine = 'CYCLES'; scene.cycles.samples = 128; scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = WIDTH, WIDTH * 5 // 4
scene.view_settings.view_transform = 'Standard'; scene.view_settings.exposure = -0.4
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try: prefs.compute_device_type = t; break
        except Exception: pass
    for d in prefs.devices: d.use = True
    scene.cycles.device = 'GPU' if any(d.type != 'CPU' for d in prefs.devices) else 'CPU'
except Exception: scene.cycles.device = 'CPU'
scene.render.filepath = os.path.join(OUT, f'keyart_{GAME}.png'); bpy.ops.render.render(write_still=True); print('RENDERED', scene.render.filepath)
