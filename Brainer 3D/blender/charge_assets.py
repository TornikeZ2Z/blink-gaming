# The Charge game's assets, from the approved key frames' scene (charge.py; Tornike picked golden hour, 2026-10-26).
# Made from charge.py (its scene sections copied as they are) with the asset modes below; the error screens come
# from charge_faces.py and the set's bloom from charge_post.py. The game's files are Game #4 - Charge/assets:
# set.webp, bot/<look>-<state>.webp and scene.js (set.json and sprites.json together).
# usage: blender -b --python charge_assets.py -- <outdir> <mode> [samples] [only]
#   set:     the station on its hilltop without the Brainer (set.png), and where its parts fall in the picture (set.json)
#   sprites: the Brainer alone on a transparent background, in the set's camera and light, one per look (1-10 the Grows up
#            stages, 11 the master with the cape) and state (ok, broken), cropped, with its offset and anchor points
#            (antenna tip, hands, head, neck) in the set's pixels (sprites.json), so the game lays them exactly on the set.
#            only: a comma list of keys such as 3-ok,3-broken
#   icon:    the caped master in the stage stills' studio framing (icon-11.png), for the ladder and the next-look card
import bpy, bmesh, math, os, random, runpy, sys
from mathutils import Vector, Matrix, noise

argv = sys.argv[sys.argv.index('--') + 1:]
OUTDIR, MODE = argv[0], argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
RW, RH, LIGHT, FRAME = 1920, 1080, 'gold', 'idle'   # the station glows as in the idle frame
HERE = os.path.dirname(os.path.abspath(__file__))
KIT = HERE   # the Brainer kit, brainer2.py, lives beside this script
sys.argv = [sys.argv[0], '--', OUTDIR, 'none']   # the Brainer kit as a library: its own modes do nothing
K = runpy.run_path(os.path.join(KIT, 'brainer2.py'), run_name='brainer2')
material, ell, cyl, rbox, capsule, torus, done, build, image_material, STAGES, studio = (K[n] for n in (
    'material', 'ell', 'cyl', 'rbox', 'capsule', 'torus', 'done', 'build', 'image_material', 'STAGES', 'studio'))
import json
from bpy_extras.object_utils import world_to_camera_view
sc = bpy.context.scene
rnd = random.Random(5)

def lin4(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]
def smooth(a, b, x): t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def obj(n): return bpy.data.objects[n]
def wpos(n): bpy.context.view_layer.update(); return obj(n).matrix_world.translation.copy()

# ---------- sky and sun ----------
SUN_EL, SUN_ROT = (15, 32) if LIGHT == 'gold' else (1.2, 32)   # low in the north-west: behind the Brainer, off the left of the frame
w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True; nt = w.node_tree
sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'MULTIPLE_SCATTERING'
for k, v in (('sun_elevation', math.radians(SUN_EL)), ('sun_rotation', math.radians(SUN_ROT)), ('altitude', 300), ('air_density', 1.0),
             ('dust_density', 0.45 if LIGHT == 'gold' else 0.9), ('ozone_density', 1.0), ('sun_intensity', 0.6)):
    if hasattr(sky, k): setattr(sky, k, v)
nt.nodes['Background'].inputs['Strength'].default_value = 0.6 if LIGHT == 'gold' else 0.9
nt.links.new(sky.outputs['Color'], nt.nodes['Background'].inputs['Color'])
bpy.ops.object.light_add(type='SUN'); sun = bpy.context.active_object
sun.data.energy = 4.6 if LIGHT == 'gold' else 1.6; sun.data.angle = math.radians(1.5); sun.data.color = (1.0, 0.84, 0.64) if LIGHT == 'gold' else (1.0, 0.62, 0.42)
sun.rotation_euler = (math.radians(90 - SUN_EL), 0, math.radians(SUN_ROT + 180))

def build_land():   # the hilltop, the valley, grass, trees, clouds and haze: the set only (the sprites need none of it)
    def H(x, y):
        r = math.hypot(x, y)
        z = -58 * smooth(22, 320, r) + 300 * smooth(1300, 5200, r) * (0.55 + 0.45 * noise.noise(Vector((x / 2400, y / 2400, 0.8))))
        z += noise.fractal(Vector((x / 900, y / 900, 0.3)), 0.55, 2.1, 5) * 32 * smooth(60, 700, r)
        z += noise.noise(Vector((x / 26, y / 26, 2.1))) * 0.8 * smooth(16, 40, r)
        return z
    def land(name, size, n, sink=None):
        bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
        for v in bm.verts:
            v.co.z = H(v.co.x, v.co.y) - (2.0 if sink and abs(v.co.x) < sink and abs(v.co.y) < sink else 0)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
        for p in me.polygons: p.use_smooth = True
        return o
    gm = bpy.data.materials.new('Ground'); gm.use_nodes = True; g = gm.node_tree; nn, ll = g.nodes, g.links
    bsdf = nn['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.92
    tc = nn.new('ShaderNodeTexCoord')
    vor = nn.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 0.0035; ll.new(tc.outputs['Object'], vor.inputs['Vector'])
    sep = nn.new('ShaderNodeSeparateColor'); ll.new(vor.outputs['Color'], sep.inputs['Color'])
    ramp = nn.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    fields = ('#4f8f34', '#7fb046', '#c9b24e', '#5f9c3e', '#a9b548')
    ramp.color_ramp.elements[0].color = lin4(fields[0]); ramp.color_ramp.elements[1].position = 0.2; ramp.color_ramp.elements[1].color = lin4(fields[1])
    for i, c in enumerate(fields[2:]): e = ramp.color_ramp.elements.new(0.4 + i * 0.2); e.color = lin4(c)
    ll.new(sep.outputs[0], ramp.inputs['Fac'])
    gn = nn.new('ShaderNodeTexNoise'); gn.inputs['Scale'].default_value = 0.35; gn.inputs['Detail'].default_value = 8; ll.new(tc.outputs['Object'], gn.inputs['Vector'])
    gr = nn.new('ShaderNodeValToRGB'); gr.color_ramp.elements[0].color = lin4('#3f7a2a'); gr.color_ramp.elements[1].color = lin4('#86b24a'); ll.new(gn.outputs['Fac'], gr.inputs['Fac'])
    dist = nn.new('ShaderNodeVectorMath'); dist.operation = 'LENGTH'; ll.new(tc.outputs['Object'], dist.inputs[0])
    far = nn.new('ShaderNodeMapRange'); far.inputs['From Min'].default_value = 90; far.inputs['From Max'].default_value = 320; ll.new(dist.outputs['Value'], far.inputs['Value'])
    mix = nn.new('ShaderNodeMix'); mix.data_type = 'RGBA'; ll.new(far.outputs['Result'], mix.inputs['Factor']); ll.new(gr.outputs['Color'], mix.inputs[6]); ll.new(ramp.outputs['Color'], mix.inputs[7])
    shade = nn.new('ShaderNodeTexNoise'); shade.inputs['Scale'].default_value = 0.02; ll.new(tc.outputs['Object'], shade.inputs['Vector'])
    mul = nn.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 0.3
    ll.new(mix.outputs[2], mul.inputs[6]); ll.new(shade.outputs['Color'], mul.inputs[7]); ll.new(mul.outputs[2], bsdf.inputs['Base Color'])
    near = land('Near', 360, 360); near.data.materials.append(gm)
    farl = land('Far', 12000, 600, sink=170); farl.data.materials.append(gm)
    bpy.ops.mesh.primitive_plane_add(size=12000, location=(0, 0, -78)); bpy.context.active_object.data.materials.append(material('Water', '#2f6f9a', rough=0.06))

    # grass: real blades round the station, so the ground near the camera reads as a meadow, not a flat colour
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=320, y_segments=320, size=46)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().length < 3.75], context='FACES')
    for v in bm.verts: v.co.z = H(v.co.x, v.co.y)
    me = bpy.data.meshes.new('GrassBed'); bm.to_mesh(me); bm.free()
    bed = bpy.data.objects.new('GrassBed', me); sc.collection.objects.link(bed); bed.data.materials.append(gm)
    ps = bed.modifiers.new('Grass', 'PARTICLE_SYSTEM').particle_system; st = ps.settings
    st.type = 'HAIR'; st.count = 300000; st.hair_length = 0.17; st.use_advanced_hair = True; st.normal_factor = 0.16; st.factor_random = 0.07
    st.child_type = 'INTERPOLATED'; st.rendered_child_count = 5; st.child_parting_factor = 0; st.child_length = 0.85; st.child_length_threshold = 0.3
    st.roughness_1 = 0.03; st.roughness_endpoint = 0.04; st.radius_scale = 0.004; st.root_radius = 1.0; st.tip_radius = 0.0
    hm = bpy.data.materials.new('Blades'); hm.use_nodes = True; hn = hm.node_tree; hb = hn.nodes['Principled BSDF']
    hi = hn.nodes.new('ShaderNodeHairInfo'); hr = hn.nodes.new('ShaderNodeValToRGB')
    hr.color_ramp.elements[0].color = lin4('#3a7426'); hr.color_ramp.elements[1].color = lin4('#93bf4c'); e = hr.color_ramp.elements.new(0.92); e.color = lin4('#c2b45c')
    hn.links.new(hi.outputs['Random'], hr.inputs['Fac']); hn.links.new(hr.outputs['Color'], hb.inputs['Base Color']); hb.inputs['Roughness'].default_value = 0.55
    bed.data.materials.append(hm); st.material = 2

    # trees: woods and hedgerows down in the valley, and a few close ones framing the station
    tm = material('Leaves', '#3f6f2e', rough=0.85); tk = material('Trunk', '#5b4330', rough=0.9)
    def tree_mesh(name, crowns):
        parts = []
        for (dx, dy, dz, r) in crowns:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=r, location=(dx, dy, dz)); c = bpy.context.active_object; c.data.materials.append(tm); parts.append(c)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.12 * crowns[0][3], depth=crowns[0][2], location=(0, 0, crowns[0][2] / 2)); t = bpy.context.active_object; t.data.materials.append(tk); parts.append(t)
        bpy.ops.object.select_all(action='DESELECT')
        for p in parts: p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); o = parts[0]; o.name = name
        dp = o.modifiers.new('Lumpy', 'DISPLACE'); tx = bpy.data.textures.new(name + 'Tx', 'CLOUDS'); tx.noise_scale = 0.9; dp.texture = tx; dp.strength = 0.5 * crowns[0][3]
        for p in o.data.polygons: p.use_smooth = True
        o.location = (0, 0, -9999); return o
    far_tree = tree_mesh('FarTree', [(0, 0, 7, 5)])
    hero = tree_mesh('HeroTree', [(0, 0, 5.2, 2.6), (1.5, 0.6, 4.4, 1.9), (-1.3, -0.4, 4.6, 2.0), (0.2, 0.3, 6.6, 1.8)])
    coll = bpy.data.collections.new('Trees'); sc.collection.children.link(coll)
    for i in range(7000):
        a, r = rnd.uniform(0, 2 * math.pi), 380 + 4200 * rnd.random() ** 1.4
        x, y = r * math.sin(a), r * math.cos(a)
        if noise.noise(Vector((x / 700, y / 700, 4.2))) < 0.08: continue
        z = H(x, y)
        if z < -76: continue
        t = bpy.data.objects.new('T', far_tree.data); t.location = (x, y, z); s = rnd.uniform(0.6, 1.4); t.scale = (s, s, s * rnd.uniform(0.9, 1.3)); coll.objects.link(t)
    for (x, y, s) in ():
        t = bpy.data.objects.new('H', hero.data); t.location = (x, y, H(x, y) - 0.2); t.scale = (s, s, s); t.rotation_euler.z = rnd.uniform(0, 6.3); coll.objects.link(t)

    # clouds: the volumetric cumulus layer of the other worlds
    cm = bpy.data.materials.new('Cloud'); cm.use_nodes = True; c = cm.node_tree; cn, cl = c.nodes, c.links
    for nd in list(cn):
        if nd.type == 'BSDF_PRINCIPLED': cn.remove(nd)
    pv = cn.new('ShaderNodeVolumePrincipled'); cl.new(pv.outputs[0], cn['Material Output'].inputs['Volume'])
    cg = cn.new('ShaderNodeNewGeometry'); s3 = cn.new('ShaderNodeVectorMath'); s3.operation = 'SCALE'; s3.inputs['Scale'].default_value = 1 / 1300; cl.new(cg.outputs['Position'], s3.inputs[0])
    cno = cn.new('ShaderNodeTexNoise'); cno.inputs['Scale'].default_value = 1.0; cno.inputs['Detail'].default_value = 7; cno.inputs['Roughness'].default_value = 0.55; cl.new(s3.outputs['Vector'], cno.inputs['Vector'])
    grz = cn.new('ShaderNodeSeparateXYZ'); cl.new(cg.outputs['Position'], grz.inputs['Vector'])
    CZ = 1400
    hgt = cn.new('ShaderNodeMapRange'); hgt.inputs['From Min'].default_value = CZ - 300; hgt.inputs['From Max'].default_value = CZ + 500; cl.new(grz.outputs['Z'], hgt.inputs['Value'])
    fall = cn.new('ShaderNodeMath'); fall.operation = 'SUBTRACT'; fall.inputs[0].default_value = 1.0; cl.new(hgt.outputs['Result'], fall.inputs[1])
    pw = cn.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 0.6; cl.new(fall.outputs['Value'], pw.inputs[0])
    mu = cn.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; cl.new(cno.outputs['Fac'], mu.inputs[0]); cl.new(pw.outputs['Value'], mu.inputs[1])
    cr = cn.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0.51; cr.inputs['From Max'].default_value = 0.61; cr.inputs['To Max'].default_value = 0.22
    cl.new(mu.outputs['Value'], cr.inputs['Value']); cl.new(cr.outputs['Result'], pv.inputs['Density'])
    pv.inputs['Color'].default_value = (1.0, 0.985, 1.0, 1); pv.inputs['Anisotropy'].default_value = 0.5
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 2000, CZ + 100)); cloud = bpy.context.active_object; cloud.scale = (16000, 16000, 820); cloud.data.materials.append(cm)
    hz = bpy.data.materials.new('Haze'); hz.use_nodes = True; hzn = hz.node_tree.nodes
    for nd in list(hzn):
        if nd.type == 'BSDF_PRINCIPLED': hzn.remove(nd)
    hs = hzn.new('ShaderNodeVolumeScatter'); hs.inputs['Density'].default_value = 0.000012; hs.inputs['Color'].default_value = (0.72, 0.8, 1.0, 1)
    hz.node_tree.links.new(hs.outputs[0], hzn['Material Output'].inputs['Volume'])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 900)); hb2 = bpy.context.active_object; hb2.scale = (15000, 15000, 2200); hb2.data.materials.append(hz)

# ---------- the charging station: a paved circle, the pad, two coils, their cables ----------
white = material('StationWhite', '#F4F4F8', rough=0.3, coat=0.4)
violet = material('StationViolet', '#5A3FFC', rough=0.25, coat=0.6)
navy = material('StationNavy', '#2B2452', rough=0.35, metal=0.3)
chrome = material('Chrome', '#EEF1F8', rough=0.08, metal=1.0)
rubber = material('Rubber', '#1d1b24', rough=0.6)
GLOW = {'idle': ('#55E6FF', 2.5, 1.2), 'charge': ('#55E6FF', 16, 10), 'master': ('#FFD56B', 7, 5), 'broken': ('#FF3344', 2.2, 0.0), 'empty': ('#55E6FF', 2.5, 1.2)}[FRAME]
ring_m = material('PadGlow', '#FFFFFF', rough=0.2, emit=GLOW[0], strength=GLOW[1])
coil_m = material('CoilGlow', '#FFFFFF', rough=0.2, emit='#55E6FF', strength=GLOW[2]) if GLOW[2] else material('CoilDead', '#3a3f55', rough=0.3)
cm2 = bpy.data.materials.new('Paving'); cm2.use_nodes = True; pn = cm2.node_tree.nodes; pb = pn['Principled BSDF']; pb.inputs['Roughness'].default_value = 0.85
pt = pn.new('ShaderNodeTexNoise'); pt.inputs['Scale'].default_value = 6; pt.inputs['Detail'].default_value = 10; prr = pn.new('ShaderNodeValToRGB')
prr.color_ramp.elements[0].color = lin4('#7e7c78'); prr.color_ramp.elements[1].color = lin4('#a7a49e'); cm2.node_tree.links.new(pt.outputs['Fac'], prr.inputs['Fac']); cm2.node_tree.links.new(prr.outputs['Color'], pb.inputs['Base Color'])
cyl('Paving', 3.8, 0.12, (0, 0, 0.02), (0, 0, 0), cm2, None, bevel=0.03, verts=96)
PAD = 0.24   # the top of the pad, where the Brainer stands
cyl('Pad', 1.55, 0.2, (0, 0, 0.14), (0, 0, 0), white, None, bevel=0.05, verts=128)
cyl('PadTop', 1.3, 0.02, (0, 0, PAD - 0.005), (0, 0, 0), navy, None, verts=128)
torus('PadRing', 1.12, 0.035, (0, 0, PAD), (0, 0, 0), ring_m, None)
torus('PadRing2', 0.62, 0.02, (0, 0, PAD), (0, 0, 0), ring_m, None)
torus('PadBand', 1.56, 0.05, (0, 0, 0.12), (0, 0, 0), violet, None)
# the charging pillar (Tornike, 2026-10-27: a single pillar, visible on a phone too): behind the pad on the Brainer's right,
# close in, so a phone's narrow crop of the set keeps all of it. TERM holds its terminal, keyed by side as when there were two.
PILLAR = (1.6, 1.8)
TERM = {}
for sd in (1,):
    x, y = PILLAR
    rbox(f'CoilBase{sd}', (0.5, 0.5, 0.26), (x, y, 0.3), 0.12, white, None)
    rbox(f'CoilBand{sd}', (0.52, 0.52, 0.04), (x, y, 0.44), 0.04, violet, None, segs=4, sub=1)
    cyl(f'CoilColumn{sd}', 0.2, 2.5, (x, y, 1.75), (0, 0, 0), white, None, bevel=0.02)
    for k in range(6): torus(f'CoilRing{sd}{k}', 0.215, 0.022, (x, y, 0.85 + k * 0.42), (0, 0, 0), coil_m, None)
    torus(f'Toroid{sd}', 0.5, 0.19, (x, y, 3.15), (0, 0, 0), chrome, None)
    ell(f'Terminal{sd}', (0.13, 0.13, 0.13), (x, y, 3.42), chrome, None)
    TERM[sd] = Vector((x, y, 3.42))
    cu = bpy.data.curves.new(f'Cable{sd}', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.035; cu.bevel_resolution = 3
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(1)
    for bp, co, hl in ((sp.bezier_points[0], (x - 0.42, y - 0.35, 0.12), None), (sp.bezier_points[1], (1.0, 1.15, 0.12), None)):   # from its base to the pad's rim
        bp.co = co; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    co = bpy.data.objects.new(f'Cable{sd}', cu); sc.collection.objects.link(co); cu.materials.append(rubber)

# ---------- the Brainer, per frame ----------
def place(stage, pose, face, chest=None):
    root = build(stage, 'G', pose=pose, face=f'face_pixel_{face}.png' if not os.path.isabs(face) else face)
    root.location.z += PAD
    if chest: obj('ChestScreen').data.materials[0] = image_material('ChestErr', chest, strength=1.6, flat=True)
    bpy.context.view_layer.update(); return root
def turn(names, pivot, axis, ang):   # rotate some parts about a point in the world (a bent antenna)
    bpy.context.view_layer.update(); M = Matrix.Translation(pivot) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-pivot)
    for n in names: o = obj(n); o.matrix_world = M @ o.matrix_world
def cape(floor=None):   # the top-X cape: royal velvet, hung from the shoulders, flaring back in the wind
    sl, sr = wpos('ShoulderL'), wpos('ShoulderR'); s = obj('Torso').matrix_world.to_scale()[0]
    floor = PAD if floor is None else floor
    top = (sl.z + sr.z) / 2 + 0.06 * s; bot = floor + 0.1 + (obj('Brainer_G10').location.z - floor) * 0.4; depth = top - bot
    bpy.ops.mesh.primitive_cone_add(vertices=128, radius1=1.05 * s, radius2=0.68 * s, depth=depth, end_fill_type='NOTHING', location=(0, 0.06 * s, (top + bot) / 2))
    o = bpy.context.active_object; bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1e-4], cuts=30, use_grid_fill=False)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < 0.0], context='FACES')
    for v in bm.verts:
        f = (depth / 2 - v.co.z) / depth; a = math.atan2(v.co.y, v.co.x); k = 1 + 0.1 * f * math.sin(a * 11)
        v.co.x = v.co.x * k + 0.18 * f * f * s; v.co.y = v.co.y * k * 0.72 + 0.55 * f * f * s   # folds, and the hem lifting back and to one side
    bm.to_mesh(o.data); bm.free()
    so = o.modifiers.new('Thick', 'SOLIDIFY'); so.thickness = 0.03; sb = o.modifiers.new('Sub', 'SUBSURF'); sb.levels = sb.render_levels = 2
    done(o, 'Cape', material('Velvet', '#4A1C9E', rough=0.55, sheen=1.0), obj('Body'))
    clasp = material('Clasp', '#FFC94D', rough=0.14, metal=1.0)
    for sd, sh in ((-1, sl), (1, sr)): ell(f'Clasp{sd}', (0.07 * s, 0.03 * s, 0.07 * s), (sh.x + sd * 0.04, sh.y - 0.14 * s, top - 0.04 * s), clasp, obj('Body'))
def soot():   # scorched plastic: the white body streaked with soot
    m = bpy.data.materials.new('Sooty'); m.use_nodes = True; n = m.node_tree.nodes; b = n['Principled BSDF']; b.inputs['Roughness'].default_value = 0.5
    t = n.new('ShaderNodeTexCoord'); nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 5.5; nz.inputs['Detail'].default_value = 12; nz.inputs['Roughness'].default_value = 0.7
    m.node_tree.links.new(t.outputs['Object'], nz.inputs['Vector'])
    rr = n.new('ShaderNodeValToRGB'); rr.color_ramp.elements[0].position = 0.3; rr.color_ramp.elements[0].color = lin4('#3a3430'); rr.color_ramp.elements[1].position = 0.4; rr.color_ramp.elements[1].color = lin4('#e9e7e4')
    m.node_tree.links.new(nz.outputs['Fac'], rr.inputs['Fac']); m.node_tree.links.new(rr.outputs['Color'], b.inputs['Base Color'])
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.materials and o.data.materials[0] and o.data.materials[0].name.startswith('White'): o.data.materials[0] = m
def smoke(loc, scale, seed):
    m = bpy.data.materials.new(f'Smoke{seed}'); m.use_nodes = True; n = m.node_tree.nodes; L = m.node_tree.links
    for nd in list(n):
        if nd.type == 'BSDF_PRINCIPLED': n.remove(nd)
    v = n.new('ShaderNodeVolumePrincipled'); L.new(v.outputs[0], n['Material Output'].inputs['Volume']); v.inputs['Color'].default_value = lin4('#2c2a2a')
    t = n.new('ShaderNodeTexCoord'); nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2.2; nz.inputs['Detail'].default_value = 6; nz.noise_dimensions = '4D'
    if 'W' in nz.inputs: nz.inputs['W'].default_value = seed
    L.new(t.outputs['Object'], nz.inputs['Vector'])
    ln = n.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; L.new(t.outputs['Object'], ln.inputs[0])
    fo = n.new('ShaderNodeMapRange'); fo.inputs['From Min'].default_value = 1.0; fo.inputs['From Max'].default_value = 0.2; L.new(ln.outputs['Value'], fo.inputs['Value'])
    de = n.new('ShaderNodeMapRange'); de.inputs['From Min'].default_value = 0.45; de.inputs['From Max'].default_value = 0.7; de.inputs['To Max'].default_value = 16.0; L.new(nz.outputs['Fac'], de.inputs['Value'])
    mm = n.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; L.new(de.outputs['Result'], mm.inputs[0]); L.new(fo.outputs['Result'], mm.inputs[1]); L.new(mm.outputs['Value'], v.inputs['Density'])
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=loc); o = bpy.context.active_object; o.scale = scale; o.data.materials.append(m); return o


# ---------- the camera of the approved frames, and the render ----------
def camera():
    bpy.ops.object.camera_add(location=(0, -9.6, 3.0)); cam = bpy.context.active_object; sc.camera = cam
    tgt = Vector((0, 0, 1.8)); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 35; cam.data.clip_end = 60000; cam.data.clip_start = 0.1
    cam.data.dof.use_dof = True; cam.data.dof.focus_distance = 9.6; cam.data.dof.aperture_fstop = 2.2
    bpy.ops.object.light_add(type='AREA', location=(3.5, -8.5, 4.5)); fill = bpy.context.active_object; fill.data.energy = 800
    fill.data.size = 6; fill.data.color = (1.0, 0.95, 0.9); fill.rotation_euler = (Vector((0, 0, 1.2)) - fill.location).to_track_quat('-Z', 'Y').to_euler()
    return cam
def settings(samples):
    sc.render.resolution_x, sc.render.resolution_y = RW, RH
    sc.view_settings.view_transform = 'AgX'
    looks = [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items]
    sc.view_settings.look = next((l for l in looks if 'Punchy' in l), 'None'); sc.view_settings.exposure = -0.9
    sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
    for t in ('OPTIX', 'CUDA'):
        try: prefs.compute_device_type = t; break
        except Exception: pass
    for dv in prefs.devices: dv.use = True
    sc.cycles.device = 'GPU'
    sc.cycles.volume_step_rate = 2; sc.cycles.volume_max_steps = 512; sc.cycles.volume_bounces = 8; sc.cycles.max_bounces = 16; sc.cycles.transparent_max_bounces = 16
def render(path): sc.render.filepath = path; bpy.ops.render.render(write_still=True); print('RENDERED', path)
def px(p, cam):   # a point in the world, in the picture's pixels (y down)
    v = world_to_camera_view(sc, cam, Vector(p)); return [round(v.x * RW, 1), round((1 - v.y) * RH, 1)]
def ring(c, r, cam):   # a horizontal ring as the ellipse it makes in the picture
    pts = [px((c[0] + r * math.cos(a), c[1] + r * math.sin(a), c[2]), cam) for a in [i * math.pi / 32 for i in range(64)]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return {'cx': round((min(xs) + max(xs)) / 2, 1), 'cy': round((min(ys) + max(ys)) / 2, 1), 'rx': round((max(xs) - min(xs)) / 2, 1), 'ry': round((max(ys) - min(ys)) / 2, 1)}

if MODE == 'set':
    build_land(); cam = camera(); settings(SAMPLES)
    render(os.path.join(OUTDIR, 'set.png'))
    info = {'w': RW, 'h': RH, 'term': [px(TERM[s], cam) for s in TERM],
            'pad': ring((0, 0, PAD), 1.12, cam), 'pad2': ring((0, 0, PAD), 0.62, cam), 'padTop': ring((0, 0, PAD), 1.3, cam),
            'coils': [[ring((TERM[s].x, TERM[s].y, 0.85 + k * 0.42), 0.215, cam) for k in range(6)] for s in TERM],
            'toroid': [ring((TERM[s].x, TERM[s].y, 3.15), 0.69, cam) for s in TERM]}
    json.dump(info, open(os.path.join(OUTDIR, 'set.json'), 'w'), indent=1); print('SET JSON')
elif MODE == 'sprites':
    cam = camera(); settings(SAMPLES); sc.render.film_transparent = True
    for o in bpy.data.objects:   # the station still lights and reflects the Brainer, but only the Brainer is drawn and casts shadow
        if o.type in ('MESH', 'CURVE'): o.visible_camera = False; o.visible_shadow = False
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=1.3, fill_type='NGON', location=(0, 0, PAD + 0.002)); catcher = bpy.context.active_object
    catcher.is_shadow_catcher = True
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    BROKEN = {'legL': (-1.45, 0, -0.3), 'legR': (-1.45, 0, 0.32), 'lift': -0.25, 'body': (0.24, 0.1, 0.08), 'head': (0.36, 0.22, -0.16), 'armL': (0.25, 0.25, 0), 'armR': (0.05, -0.12, 0)}
    only = argv[3].split(',') if len(argv) > 3 else None
    for look in range(1, 12):
        for state in ('ok', 'broken'):
            key = f'{look}-{state}'
            if only and key not in only: continue
            coll = bpy.data.collections.new('Bot' + key); sc.collection.children.link(coll)
            bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[coll.name]
            stage = min(look, 10); _, face, pose = STAGES[stage - 1]
            if state == 'ok':
                place(stage, pose, face)
            else:
                place(stage, BROKEN, os.path.join(HERE, 'face_error.png'), chest=os.path.join(HERE, 'chest_error.png'))
                soot()
                turn(['Antenna1', 'Antenna1_end0', 'Antenna1_end1', 'AntennaTip1'], wpos('Antenna1_end0'), Vector((0, 1, 0)), 1.0)
                capL = obj('EarCapL'); mw = capL.matrix_world.copy(); capL.parent = None; capL.matrix_world = mw
                capL.location = (-0.85, -0.75, PAD + 0.03); capL.rotation_euler = (0, 0, 0.4)
                dm = bpy.data.materials.new('Scorch'); dm.use_nodes = True; dn = dm.node_tree.nodes; db = dn['Principled BSDF']; db.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
                gt = dn.new('ShaderNodeTexGradient'); gt.gradient_type = 'SPHERICAL'; tco = dn.new('ShaderNodeTexCoord'); dm.node_tree.links.new(tco.outputs['Object'], gt.inputs['Vector'])
                dm.node_tree.links.new(gt.outputs['Fac'], db.inputs['Alpha'])
                bpy.ops.mesh.primitive_plane_add(size=2, location=(0.1, -0.1, PAD + 0.003)); sco = bpy.context.active_object; sco.scale = (1.15, 1.0, 1); sco.data.materials.append(dm)
            if look == 11: cape()
            bpy.context.view_layer.update()
            xs, ys = [], []   # the crop: the Brainer's parts, and the pad top its shadow falls on
            for o in coll.objects:
                if o.type != 'MESH': continue
                for c in o.bound_box:
                    p = px(o.matrix_world @ Vector(c), cam); xs.append(p[0]); ys.append(p[1])
            pt = ring((0, 0, PAD), 1.3, cam)
            x0, x1 = max(0, min(min(xs), pt['cx'] - pt['rx']) - 16), min(RW, max(max(xs), pt['cx'] + pt['rx']) + 16)
            y0, y1 = max(0, min(ys) - 16), min(RH, max(max(ys), pt['cy'] + pt['ry']) + 16)
            x0, y0, x1, y1 = int(x0), int(y0), int(math.ceil(x1)), int(math.ceil(y1))
            sc.render.border_min_x, sc.render.border_max_x = x0 / RW, x1 / RW
            sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / RH, 1 - y0 / RH
            render(os.path.join(OUTDIR, f'sprite-{key}.png'))
            a = {'head': px(wpos('HeadShell'), cam), 'tip': px(wpos('AntennaTip1'), cam), 'chest': px(wpos('ChestScreen'), cam)}
            if state == 'ok': a.update(handL=px(wpos('HandL'), cam), handR=px(wpos('HandR'), cam), feet=px((wpos('BootL') + wpos('BootR')) / 2, cam))
            else: a.update(neck=px(wpos('Neck'), cam), ear=px(wpos('EarL'), cam), top=px(wpos('HeadShell') + Vector((0.05, 0.1, 0.6)), cam))
            for o in list(coll.objects): bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(coll)
            p = os.path.join(OUTDIR, 'sprites.json'); old = json.load(open(p)) if os.path.exists(p) else {}
            old[key] = {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'a': a}; json.dump(old, open(p, 'w'), indent=1)
elif MODE == 'icon':   # the stage stills' studio and camera (brainer2.py, mode stages), with the cape
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    _, face, pose = STAGES[9]
    build(10, 'G', style='carved_dense', face=f'face_pixel_{face}.png', pose=pose); bpy.context.view_layer.update(); cape(0.0)
    studio((640, 640), (1.6, -8.4, 2.4), (0, 0, 1.45), lens=50)
    render(os.path.join(OUTDIR, 'icon-11.png'))
