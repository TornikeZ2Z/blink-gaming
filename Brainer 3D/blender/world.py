# The Brainer world: one land shared by both games. Plane Crash takes off from the airfield and flies over it;
# FogRush is played on the ground, in the foggy valley beside the airfield.
# usage: blender -b --python world.py -- <outdir> <theme> <view> [res]
#   themes: meadow (green countryside), tech (lavender land with glowing circuit roads), islands (floating islands)
#   views: establish (the whole world), plane (behind the plane in flight), fog (over the FogRush valley)
import bpy, bmesh, math, os, random, runpy, sys
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, THEME, VIEW = argv[0], argv[1], argv[2]
RES = int(argv[3]) if len(argv) > 3 else 1600
DIR = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], '--', OUT, 'none']   # load the Brainer kit as a library: its own modes do nothing
K = runpy.run_path(os.path.join(DIR, 'brainer2.py'), run_name='brainer2')
material, ell, cyl, rbox, capsule, done, look, lin, build = (K[n] for n in ('material', 'ell', 'cyl', 'rbox', 'capsule', 'done', 'look', 'lin', 'build'))
scene = bpy.context.scene
rnd = random.Random(11)

PAL = {   # each theme's colours
    'meadow': dict(grass=['#74DB5E', '#62CF55', '#86E36B'], fields=['#B5EC5C', '#FFD95C', '#8EE070', '#D4F07A', '#5FCB5A', '#FFC07A'],
                   tree=['#2FB850', '#4CCB55', '#1FA14C'], water='#5CC8FF', far='#C3C6F7', rock='#7C6BD6', roof='#5A3FFC', glow=None,
                   sky=('#EEF1FF', '#6656FF'), haze='#E2E4FF'),
    'tech': dict(grass=['#A796FF', '#9C8AFF', '#B3A5FF'], fields=['#C2B4FF', '#F2A6DD', '#97E6CC', '#8EA2FF', '#FFC4E6', '#A6DDFF'],
                 tree=['#8E5CFF', '#E070C8', '#6F4CF0'], water='#3E57F5', far='#B7AEF2', rock='#6A55D6', roof='#5A3FFC', glow='#55E6FF',
                 sky=('#F4ECFF', '#5A44FF'), haze='#D9CFFF'),
}
PAL['islands'] = PAL['meadow']
P = PAL[THEME]

def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def smooth(a, b, x): t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def vmat(name, rough=0.8, glow=None):   # a material that takes its colour from the mesh's painted colours
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'; nt.links.new(a.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    if glow:
        g = nt.nodes.new('ShaderNodeVertexColor'); g.layer_name = 'Glow'; nt.links.new(g.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 3.0
    return m

# ---------- the layout: where each game happens ----------
RUNWAY = (0.0, 30.0, 4.0, 58.0)    # centre x, centre y, half width, half length (the plane takes off towards +y)
FOG = (40.0, 26.0, 2.7, 11)         # FogRush valley: centre x, centre y, tile pitch, tiles shown across
def play_dist(x, y):   # how far a point is from the airfield and the valley (for flattening the land around them)
    dr = max(abs(x - RUNWAY[0]) - RUNWAY[2] - 14, abs(y - RUNWAY[1]) - RUNWAY[3] - 6, 0)
    half = FOG[2] * FOG[3] / 2 + 6
    df = max(abs(x - FOG[0]) - half, abs(y - FOG[1]) - half, 0)
    dh = math.hypot(x + 18, y + 4) - 16   # around the hangar
    return min(dr, df, max(dh, 0))
def height(x, y):
    n = noise.noise(Vector((x / 55, y / 55, 0.3))) * 7 + noise.noise(Vector((x / 17, y / 17, 1.7))) * 1.6
    r = math.hypot(x - 20, y - 30)
    return max(n + 2.5, 0) * smooth(4, 34, play_dist(x, y)) + max(0, r - 170) * 0.22

# ---------- the land ----------
def field_colour(x, y):
    u, v = x, y   # fields on the land's own grid, so their edges stay crisp
    cu, cv = math.floor(u / 24), math.floor(v / 18)
    h = (cu * 73856093 ^ cv * 19349663) & 0xffff
    if play_dist(x, y) < 10 or h % 5 == 0: c = P['grass'][h % len(P['grass'])]
    else:
        c = P['fields'][h % len(P['fields'])]
        if h % 3 == 0 and math.floor(u / 2) % 2: c = '#%02x%02x%02x' % tuple(int(255 * max(0, k - 0.06)) for k in hexrgb(c))   # crop rows
    border = (u - cu * 24 < 1.5 or v - cv * 18 < 1.5) and play_dist(x, y) > 8   # one row of the land's faces: a thin road
    return hexrgb(c), border
def land(size=300, seg=300):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=seg, y_segments=seg, size=size)
    col = bm.loops.layers.color.new('Col'); glow = bm.loops.layers.color.new('Glow')
    k = size / max(abs(v.co.x) for v in bm.verts)   # whatever span create_grid uses, make it +-size
    for v in bm.verts: v.co.x = v.co.x * k + 20; v.co.y = v.co.y * k + 30; v.co.z = height(v.co.x, v.co.y)
    for f in bm.faces:
        c = f.calc_center_median(); rgb, border = field_colour(c.x, c.y)
        g = hexrgb(P['glow']) if (P['glow'] and border) else (0, 0, 0)
        if P['glow'] and border: rgb = hexrgb('#3A2E8A')   # a dark trace that glows cyan
        for l in f.loops: l[col] = (*rgb, 1); l[glow] = (*g, 1)
    me = bpy.data.meshes.new('Land'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('Land', me); bpy.context.collection.objects.link(o)
    for p in me.polygons: p.use_smooth = True
    me.materials.append(vmat('LandMat', glow=P['glow'])); return o

def island(name, cx, cy, r, seed):   # a floating island: a grassy top and a rocky underside
    # built as a polar mesh: rings out to the rim, then down to a point below
    me = bpy.data.meshes.new(name); verts, faces, cols = [], [], []
    rings, segs = 40, 180
    def rim_r(a): return r * (1 + 0.08 * noise.noise(Vector((math.cos(a) * 2 + seed, math.sin(a) * 2, 0))))
    verts.append((cx, cy, height(cx, cy) * 0.15))
    for i in range(1, rings + 1):
        for j in range(segs):
            a = j / segs * math.tau; rr = rim_r(a) * i / rings; x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
            verts.append((x, y, height(x, y) * 0.15 * (1 - (i / rings) ** 6)))
    under = 12
    for i in range(1, under + 1):   # the rock below, tapering to a point with lumps
        t = i / under
        for j in range(segs):
            a = j / segs * math.tau; rr = rim_r(a) * (1 - t) ** 1.3 * (1 + 0.12 * noise.noise(Vector((a * 3 + seed, t * 4, 1))))
            verts.append((cx + rr * math.cos(a), cy + rr * math.sin(a), -t * r * 0.85 - 0.6 * (1 - t)))
    verts.append((cx, cy, -r * 0.92))
    for j in range(segs): faces.append((0, 1 + j, 1 + (j + 1) % segs))
    total = rings + under
    for i in range(1, total):
        for j in range(segs):
            a0 = 1 + (i - 1) * segs; a1 = 1 + i * segs
            faces.append((a0 + j, a1 + j, a1 + (j + 1) % segs, a0 + (j + 1) % segs))
    tip = len(verts) - 1; base = 1 + (total - 1) * segs
    for j in range(segs): faces.append((base + j, tip, base + (j + 1) % segs))
    me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(me); col = bm.loops.layers.color.new('Col'); glow = bm.loops.layers.color.new('Glow')
    for f in bm.faces:
        c = f.calc_center_median(); top = c.z > -0.4
        rgb = field_colour(c.x, c.y)[0] if top else hexrgb(P['rock'] if (int(-c.z * 1.4) % 2) else '#8E7FE0')
        for l in f.loops: l[col] = (*rgb, 1); l[glow] = (0, 0, 0, 1)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(bpy.data.materials.get('LandMat') or vmat('LandMat')); return o

# ---------- props ----------
def trees():
    canopies = []
    for k, c in enumerate(P['tree']):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1); m = bpy.context.active_object
        m.data.materials.append(material(f'Tree{c}', c, rough=0.75, sheen=0.4)); [setattr(p, 'use_smooth', True) for p in m.data.polygons]
        m.hide_render = True; canopies.append(m.data)
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.22, depth=2); tk = bpy.context.active_object; tk.hide_render = True
    tk.data.materials.append(material('Trunk', '#8A5A3C', rough=0.8)); trunk = tk.data
    placed = 0; tries = 0
    centres = [(rnd.uniform(-120, 160), rnd.uniform(-90, 170)) for _ in range(26)]   # little woods
    while placed < 420 and tries < 6000:
        tries += 1; cx, cy = rnd.choice(centres); x, y = cx + rnd.gauss(0, 9), cy + rnd.gauss(0, 9)
        if play_dist(x, y) < 6 or (THEME == 'islands' and not on_island(x, y)): continue
        z = ground_z(x, y); s = rnd.uniform(1.3, 2.3)
        o = bpy.data.objects.new('Canopy', canopies[rnd.randrange(len(canopies))]); o.location = (x, y, z + 1.4 + s * 0.9); o.scale = (s, s, s * 1.1)
        t = bpy.data.objects.new('Trunk', trunk); t.location = (x, y, z + 0.9); bpy.context.collection.objects.link(o); bpy.context.collection.objects.link(t)
        placed += 1
def clouds(n, zlo, zhi, area, scale=(3, 6)):
    m = material('Cloud', '#FFFFFF', rough=0.95, sss=0.15, sheen=0.5)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1); src = bpy.context.active_object
    src.data.materials.append(m); [setattr(p, 'use_smooth', True) for p in src.data.polygons]; src.hide_render = True
    for _ in range(n):
        x, y, z = rnd.uniform(*area[0]), rnd.uniform(*area[1]), rnd.uniform(zlo, zhi); s = rnd.uniform(*scale)
        for k in range(rnd.randint(4, 7)):
            o = bpy.data.objects.new('Puff', src.data); bpy.context.collection.objects.link(o)
            r = s * rnd.uniform(0.5, 1.0); o.location = (x + rnd.uniform(-1.4, 1.4) * s, y + rnd.uniform(-0.6, 0.6) * s, z + r * 0.3)
            o.scale = (r, r * 0.9, r * 0.75)
def far_hills():
    for k in range(34):
        a = k / 34 * math.tau + rnd.uniform(-0.05, 0.05); d = rnd.uniform(270, 310); r = rnd.uniform(40, 75)
        ell('Far', (r, r * 0.8, r * rnd.uniform(0.3, 0.5)), (20 + d * math.cos(a), 30 + d * math.sin(a), height(20 + d * math.cos(a), 30 + d * math.sin(a)) - r * 0.15),
            material('FarHill', P['far'], rough=0.9), None, segs=32, rings=16)

def airfield():
    x, y, hw, hl = RUNWAY
    asphalt = material('Runway', '#D9D6EE' if THEME != 'tech' else '#2C2A5A', rough=0.85)
    paint = material('Paint', '#FFFFFF', rough=0.6) if THEME != 'tech' else material('PaintGlow', '#BFFBFF', emit=P['glow'], strength=3)
    rbox('Runway', (hw, hl, 0.1), (x, y, 0.08), 0.05, asphalt, None, segs=2, sub=0)
    for k in range(-11, 12): rbox(f'Dash{k}', (0.18, 1.6, 0.03), (x, y + k * 4.8, 0.2), 0.02, paint, None, segs=1, sub=0)
    for k in range(-3, 4): rbox(f'Bar{k}', (0.3, 2.2, 0.03), (x + k * 1.0, y - hl + 3, 0.2), 0.02, paint, None, segs=1, sub=0)
    lamp = material('Lamp', '#FFFFFF', emit='#9EF6FF', strength=6)
    for sd in (-1, 1):
        for k in range(-12, 13): ell('Light', (0.16, 0.16, 0.16), (x + sd * (hw + 0.5), y + k * 4.8, 0.25), lamp, None, segs=12, rings=6)
    rbox('Taxiway', (3.2, 2.0, 0.09), (-7, -4, 0.07), 0.05, asphalt, None, segs=2, sub=0)
    # the hangar: a white barrel vault with a violet band and the brand mark
    white = material('HWhite', '#FFFFFF', rough=0.35, coat=0.4); roof = material('Roof', P['roof'], rough=0.3, coat=0.6)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=7, depth=16, location=(-18, -4, 0), rotation=(0, math.pi / 2, 0)); h = bpy.context.active_object
    K['activate'](h); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)   # the vault runs along x, its door facing the runway
    bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(h.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context='VERTS'); bmesh.update_edit_mesh(h.data); bpy.ops.object.mode_set(mode='OBJECT')
    done(h, 'Hangar', white)
    bpy.ops.mesh.primitive_torus_add(major_radius=7.05, minor_radius=0.35, location=(-18, -4, 0), rotation=(0, math.pi / 2, 0)); band = bpy.context.active_object; done(band, 'Band', roof)
    cyl('Door', 6.4, 0.2, (-10.05, -4, 0), (0, math.pi / 2, 0), material('Door', '#2B2452', rough=0.6), None)
    rbox('Sign', (0.15, 2.2, 2.2), (-9.9, -4, 5.0), 0.6, roof, None)
    bpy.ops.object.text_add(location=(-9.7, -4, 3.65), rotation=(math.pi / 2, 0, math.pi / 2)); tx = bpy.context.active_object
    tx.data.body = 'B'; tx.data.size = 3.2; tx.data.extrude = 0.12; tx.data.align_x = 'CENTER'; done(tx, 'Mark', material('MarkWhite', '#FFFFFF', emit='#FFFFFF', strength=0.4), None, smooth=False)
    # control tower and windsock
    cyl('Tower', 1.2, 9, (14, -10, 4.5), (0, 0, 0), white, None)
    cyl('Cab', 2.0, 2.0, (14, -10, 10), (0, 0, 0), material('TowerGlass', '#9FE8FF', rough=0.05, emit='#4FD7FF', strength=0.6), None)
    cyl('TowerRoof', 2.3, 0.5, (14, -10, 11.25), (0, 0, 0), roof, None)
    capsule('Pole', (8, 4, 0), (8, 4, 6), 0.08, white, None)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.6, radius2=0.25, depth=2.6, location=(9.3, 4, 5.6), rotation=(0, math.pi / 2 - 0.15, 0))
    done(bpy.context.active_object, 'Sock', material('Sock', '#FF7A59', rough=0.6))

def fog_valley():
    fx, fy, pitch, n = FOG; c = (n - 1) / 2
    plot = [material(f'Plot{k}', g, rough=0.8, sheen=0.3) for k, g in enumerate(P['grass'])]
    dirt = material('Path', '#E8D6B5' if THEME != 'tech' else '#E9E4FF', rough=0.9)
    rbox('ValleyFloor', (pitch * n / 2 + 1.2, pitch * n / 2 + 1.2, 0.1), (fx, fy, 0.05), 0.4, dirt, None, segs=2, sub=0)
    trail = [(5, 0), (5, 1), (5, 2), (4, 2), (4, 3), (4, 4), (5, 4), (6, 4), (6, 5), (6, 6), (5, 6)]   # the tiles cleared so far
    chests = {(4, 3): '#FFC94D', (6, 5): '#8447FB'}; boom = (7, 4)
    cloud = material('Fog', '#FFFFFF', rough=0.95, sss=0.2, sheen=0.6)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1); src = bpy.context.active_object
    src.data.materials.append(cloud); [setattr(p, 'use_smooth', True) for p in src.data.polygons]; src.hide_render = True
    for i in range(n):
        for j in range(n):
            x, y = fx + (i - c) * pitch, fy + (j - c) * pitch
            rbox(f'Tile{i}_{j}', (pitch * 0.45, pitch * 0.45, 0.22), (x, y, 0.3), 0.18, plot[(i * 7 + j * 3) % len(plot)], None, segs=3, sub=0)
            if (i, j) in trail or (i, j) == boom: continue
            for k in range(rnd.randint(3, 5)):   # fog over every tile not yet explored
                o = bpy.data.objects.new('FogPuff', src.data); bpy.context.collection.objects.link(o)
                r = rnd.uniform(0.75, 1.1); o.location = (x + rnd.uniform(-0.6, 0.6), y + rnd.uniform(-0.6, 0.6), 0.9 + rnd.uniform(0, 0.5)); o.scale = (r, r, r * 0.8)
    for (i, j), col in chests.items():   # little treasure chests on cleared tiles
        x, y = fx + (i - c) * pitch, fy + (j - c) * pitch
        rbox('Chest', (0.55, 0.4, 0.32), (x, y, 0.85), 0.08, material(f'Chest{col}', col, rough=0.3, metal=0.6), None, segs=3, sub=0)
        rbox('Lid', (0.58, 0.43, 0.14), (x, y, 1.25), 0.12, material('Wood', '#7A4A2A', rough=0.6), None, segs=3, sub=0)
    x, y = fx + (boom[0] - c) * pitch, fy + (boom[1] - c) * pitch   # a bomb crater, for scale of the danger
    cyl('Crater', 1.0, 0.1, (x, y, 0.55), (0, 0, 0), material('Scorch', '#3B2E5A', rough=0.9), None)
    ell('Bomb', (0.45, 0.45, 0.45), (x, y, 0.95), material('BombBlack', '#262040', rough=0.3, coat=0.8), None, segs=24, rings=12)
    i, j = trail[-1]; return (fx + (i - c) * pitch, fy + (j - c) * pitch)

def plane_model(loc, heading=0.0, bank=0.0, scale=1.0):   # the Brainer's plane: white with violet trim, like the game's
    root = bpy.data.objects.new('Plane', None); bpy.context.collection.objects.link(root)
    white = material('PWhite', '#FFFFFF', rough=0.3, coat=0.6); vio = material('PViolet', '#5A3FFC', rough=0.25, coat=0.7)
    def part(o): o.parent = root; return o
    part(ell('Fuselage', (1.05, 3.6, 1.0), (0, 0, 0), white, None))
    part(ell('Nose', (0.75, 0.6, 0.72), (0, 3.35, 0), vio, None))
    part(rbox('Wing', (4.6, 1.0, 0.16), (0, 0.4, -0.2), 0.14, white, None, segs=4, sub=1))
    for sd in (-1, 1): part(rbox('WingTip', (0.35, 1.02, 0.17), (sd * 4.35, 0.4, -0.2), 0.14, vio, None, segs=4, sub=1))
    part(rbox('Tailplane', (1.8, 0.6, 0.1), (0, -3.2, 0.25), 0.08, white, None, segs=3, sub=1))
    part(rbox('Fin', (0.12, 0.8, 0.9), (0, -3.25, 1.1), 0.1, vio, None, segs=3, sub=1))
    for k in (-1, 1): part(rbox('Blade', (0.12, 0.05, 1.1), (0, 3.95, k * 0.0), 0.04, material('Prop', '#2B2452', rough=0.4), None, segs=2, sub=1)).rotation_euler = (0, k * 0.6 + 0.6, 0)
    b = build(6, 'G', style='carved_dense', face='face_pixel_excited.png'); b.scale = (0.42,) * 3; b.location = (0, 0.2, 0.55); b.rotation_euler = (0, 0, math.pi); b.parent = root   # the pilot, facing the nose
    root.location = loc; root.rotation_euler = (0, bank, heading); root.scale = (scale,) * 3
    return root

def sky_and_light():
    w = bpy.data.worlds.new('Sky'); scene.world = w; w.use_nodes = True; nt = w.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); mr = nt.nodes.new('ShaderNodeMapRange'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    mr.inputs['From Min'].default_value = -0.02; mr.inputs['From Max'].default_value = 0.38
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].color = (*lin(P['sky'][0]), 1); ramp.color_ramp.elements[1].color = (*lin(P['sky'][1]), 1)
    bg = nt.nodes['Background']; nt.links.new(ramp.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0
    amb = nt.nodes.new('ShaderNodeBackground'); amb.inputs['Color'].default_value = (*lin('#F3F3FF'), 1); amb.inputs['Strength'].default_value = 0.55
    lp = nt.nodes.new('ShaderNodeLightPath'); mix = nt.nodes.new('ShaderNodeMixShader')   # the camera sees the coloured sky; the land is lit by a neutral one
    nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac']); nt.links.new(amb.outputs['Background'], mix.inputs[1]); nt.links.new(bg.outputs['Background'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], nt.nodes['World Output'].inputs['Surface'])
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 50)); sun = bpy.context.active_object
    sun.data.energy = 4.6; sun.data.angle = math.radians(8); sun.data.color = lin('#FFF3E0'); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    ell('SunDisc', (22, 22, 22), (337, 236, 110), material('SunGlow', '#FFFFFF', emit='#FFF6D8', strength=4), None, segs=32, rings=16)

def ground_z(x, y): return 0.0 if THEME == 'islands' and not on_island(x, y) else (height(x, y) if THEME != 'islands' else height(x, y) * 0.15)
ISLES = [(18, 28, 82, 1.0), (-90, 110, 26, 3.0), (130, 120, 30, 4.0), (-80, -50, 20, 5.0), (140, -20, 18, 6.0)]   # the main island holds the airfield and the valley
def on_island(x, y): return any(math.hypot(x - cx, y - cy) < r * 0.92 for cx, cy, r, _ in ISLES)

# ---------- build ----------
sky_and_light()
if THEME == 'islands':
    for k, (cx, cy, r, sd) in enumerate(ISLES): island(f'Isle{k}', cx, cy, r, sd)
    clouds(70, -40, -10, ((-200, 260), (-150, 300)), scale=(6, 12))   # a sea of cloud below the islands
else:
    land(); far_hills()
airfield(); trees(); bx, by = fog_valley()
clouds(26, 26, 46, ((-150, 220), (70, 280)))
if THEME != 'islands': clouds(10, 8, 14, ((60, 200), (60, 200)), scale=(2.5, 4))
explorer = build(6, 'G', style='carved_dense', face='face_pixel_happy.png'); explorer.scale = (0.62,) * 3; explorer.location = (bx, by, 0.52)
PH = -0.45; PL = Vector((22, 0, 22)); PD = Vector((-math.sin(PH), math.cos(PH), 0))   # the plane, heading over the valley
plane = plane_model(tuple(PL), heading=PH, bank=0.2, scale=1.0)

cam_presets = {
    'establish': ((-58, -62, 40), (30, 50, 25), 30, (RES, RES * 9 // 16)),
    'plane': (tuple(PL - PD * 20 + Vector((0, 0, 7))), tuple(PL + PD * 70 + Vector((0, 0, -14))), 35, (RES, RES * 9 // 16)),
    'fog': ((FOG[0] - 2, FOG[1] - 14, 13), (FOG[0], FOG[1] + 3, 0), 32, (RES, RES * 9 // 16)),
}
if THEME == 'islands': cam_presets['establish'] = ((-150, -125, 16), (25, 35, -10), 30, (RES, RES * 9 // 16))   # from beside, to see them float
cl, ct, lens, res = cam_presets[VIEW]
bpy.ops.object.camera_add(location=cl); cam = bpy.context.active_object; scene.camera = cam; look(cam, ct); cam.data.lens = lens; cam.data.clip_end = 2000
scene.render.engine = 'CYCLES'; scene.cycles.samples = 64; scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = res
scene.view_settings.view_transform = 'Standard'; scene.view_settings.exposure = -0.1
def add_haze(m, eye, near=160, far=520):   # aerial perspective: far things fade towards the sky's haze
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    if b is None or b.inputs['Base Color'].is_linked and b.inputs['Base Color'].links[0].from_node.type == 'MIX': return
    geo = nt.nodes.new('ShaderNodeNewGeometry'); dist = nt.nodes.new('ShaderNodeVectorMath'); dist.operation = 'DISTANCE'; dist.inputs[1].default_value = eye
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = near; mr.inputs['From Max'].default_value = far; mr.inputs['To Max'].default_value = 0.55
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    a = [i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA'][0]; bb = [i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA'][0]
    if b.inputs['Base Color'].is_linked: nt.links.new(b.inputs['Base Color'].links[0].from_socket, a)
    else: a.default_value = b.inputs['Base Color'].default_value
    bb.default_value = (*lin(P['haze']), 1)
    nt.links.new(geo.outputs['Position'], dist.inputs[0]); nt.links.new(dist.outputs['Value'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], mix.inputs['Factor'])
    nt.links.new([o for o in mix.outputs if o.type == 'RGBA'][0], b.inputs['Base Color'])
for m in list(bpy.data.materials):
    if m.use_nodes and not m.name.startswith(('ScreenFace', 'ChestNum', 'Sun')): add_haze(m, cl)
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try: prefs.compute_device_type = t; break
        except Exception: pass
    for d in prefs.devices: d.use = True
    scene.cycles.device = 'GPU' if any(d.type != 'CPU' for d in prefs.devices) else 'CPU'
except Exception: scene.cycles.device = 'CPU'
scene.render.filepath = os.path.join(OUT, f'world_{THEME}_{VIEW}.png'); bpy.ops.render.render(write_still=True); print('RENDERED', scene.render.filepath)
