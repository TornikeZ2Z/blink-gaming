# Multi Charge's set: Charge's charging pad and camera (charge_assets.py, run as a library, untouched) moved into a dark
# neon laboratory, with five futuristic charging pillars round the pad, one for each of Plane Crash's five paths.
# Tornike, 2026-10-27: "visually i want charge and contentwise i want plane crash"; then "instead of outdoor, try some
# laboratory ... futuristic pillars", the pillars further from the robot; of three lab drafts he picked the dark neon one,
# then the obelisk pillars, and asked for the screens on the back wall and the logo to go.
# The camera, the pad and its height are Charge's, so the live 3D Brainer (bot.js) stands on this pad as on Charge's,
# and the sprites mode renders its stills the same way, in the lab's light. The frame is Charge's 1920 x 1080 widened by
# EX px each side, TOP px above and BOT below, so a phone (a narrow slice of a wide picture) and a short, wide stage (the
# website's game frame) can both be shown all five pillars.
# The game's files are Game #5 - Multi Charge/assets: set.webp, scene.js and the stills in bot/.
# usage: blender -b --python multi_charge_assets.py -- <outdir> <mode> <pillar> [samples] [stage]
#   pillar:  column (a plasma tube in a cage of floating magnetic rings, an orb in a gyroscope on top)
#            | obelisk (a dark hexagonal obelisk with light channels, a ring halo and a crystal over it)
#   set:     the lab and the five pillars (set.png), and where the pillars' parts fall in the picture (set.json)
#   preview: the same at half size, with a stage <stage> Brainer on the pad, to judge a look
#   json:    set.json alone, without rendering
#   sprites: the Brainer alone in the lab's light, one still per look (sprite-<look>-ok.png) and where each sits in
#            Charge's frame (sprites.json): the stills the game shows until the 3D Brainer arrives, or without WebGL
import bpy, bmesh, math, os, runpy, sys, json
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUTDIR, MODE, KIND = argv[0], argv[1], argv[2]
SAMPLES = int(argv[3]) if len(argv) > 3 else 64
STAGE = int(argv[4]) if len(argv) > 4 else 0
HERE = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], '--', OUTDIR, 'none', str(SAMPLES)]   # Charge's assets as a library: mode none builds the station and stops
C = runpy.run_path(os.path.join(HERE, 'charge_assets.py'), run_name='charge_assets')
material, cyl, torus, rbox, ell, place, STAGES, lin4 = (C[n] for n in ('material', 'cyl', 'torus', 'rbox', 'ell', 'place', 'STAGES', 'lin4'))
sc = bpy.context.scene
PAD = C['PAD']

EX, TOP, BOT = 640, 700, 220   # the frame grows by these, in Charge's pixels
RW, RH = 1920 + 2 * EX, 1080 + TOP + BOT
CYAN, VIOLET = '#55e6ff', '#8447fb'

# ---------- Charge's pad without its coils, its hilltop and its sun ----------
for o in list(bpy.data.objects):   # whatever charge_assets.py builds round the pad: Coil*, Toroid*, Terminal*, Cable*, and the sun
    if o.name.startswith(('Coil', 'Toroid', 'Terminal', 'Cable')) or (o.type == 'LIGHT' and o.data.type == 'SUN'): bpy.data.objects.remove(o, do_unlink=True)
w = bpy.data.worlds.new('Lab'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin4('#141a3a')[:3], 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.2

def emit(name, col, s): return material(name, '#ffffff', rough=0.3, emit=col, strength=s)
def nodes_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes['Principled BSDF']
def box(name, half, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=rot); o = bpy.context.active_object; o.scale = half; o.name = name; o.data.materials.append(mat); return o
def polar(r, deg, z=0): a = math.radians(deg); return (r * math.cos(a), r * math.sin(a), z)   # 90 degrees is straight behind the pad
def link(name, data):
    o = bpy.data.objects.new(name, data); sc.collection.objects.link(o); return o
metal = material('LabMetal', '#1b2244', rough=0.32, metal=0.75); panel = material('LabPanel', '#121937', rough=0.5, metal=0.2)
chrome = material('LabChrome', '#e8ecf6', rough=0.1, metal=1.0); violet = material('LabViolet', '#5a3ffc', rough=0.25, coat=0.6)
cyan_l = emit('NeonCyan', CYAN, 9); violet_l = emit('NeonViolet', VIOLET, 9); soft_l = emit('NeonSoft', '#9fd8ff', 3)

# ---------- the room: a round lab, ribbed walls with light, a reactor ring overhead ----------
R, HROOM = 11.0, 8.5
def wall_arc(a0, a1, z0, z1, mat, name, r=R):   # a curved strip of wall from angle a0 to a1 (degrees), z0 to z1 high
    bm = bmesh.new(); n = max(8, int(abs(a1 - a0) / 2)); vs = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n); vs.append((bm.verts.new((r * math.cos(a), r * math.sin(a), z0)), bm.verts.new((r * math.cos(a), r * math.sin(a), z1))))
    for i in range(n): bm.faces.new((vs[i][0], vs[i + 1][0], vs[i + 1][1], vs[i][1]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return link(name, me)
wall_arc(-90, 270, 0, HROOM, panel, 'Wall')
for d in range(-36, 217, 12):   # ribs between the wall panels, each with a line of light down its face
    rot = (0, 0, math.radians(d))
    box(f'Rib{d}', (0.22, 0.32, HROOM / 2), polar(R - 0.25, d, HROOM / 2), metal, rot)
    box(f'RibLight{d}', (0.02, 0.025, 2.4), polar(R - 0.58, d, 3.3), cyan_l, rot)
wall_arc(-90, 270, 0, 0.55, metal, 'Plinth', r=R - 0.45); wall_arc(-90, 270, 0.55, 0.6, cyan_l, 'Skirting', r=R - 0.5)
wall_arc(-90, 270, 6.0, 6.55, metal, 'Frieze', r=R - 0.45); wall_arc(-90, 270, 6.55, 6.62, violet_l, 'FriezeLight', r=R - 0.5)
# the ceiling: dark, with a reactor of light rings over the pad
bpy.ops.mesh.primitive_circle_add(vertices=128, radius=R, fill_type='NGON', location=(0, 0, HROOM)); bpy.context.active_object.data.materials.append(panel)
for r, m, t in ((3.4, violet_l, 0.07), (2.6, cyan_l, 0.05), (1.6, cyan_l, 0.04)): torus(f'Reactor{r}', r, t, (0, 0.6, HROOM - 0.35), (0, 0, 0), m, None)
torus('ReactorRim', 3.6, 0.22, (0, 0.6, HROOM - 0.3), (0, 0, 0), metal, None)

# ---------- the floor: dark and glossy, circuit lines of light running out from a two-step dais ----------
fm, fn, fl, fb = nodes_mat('LabFloor')
fb.inputs['Base Color'].default_value = (*lin4('#0c1128')[:3], 1); fb.inputs['Roughness'].default_value = 0.16; fb.inputs['Metallic'].default_value = 0.3
tco = fn.new('ShaderNodeTexCoord'); sep = fn.new('ShaderNodeSeparateXYZ'); fl.new(tco.outputs['Object'], sep.inputs['Vector'])
ang = fn.new('ShaderNodeMath'); ang.operation = 'ARCTAN2'; fl.new(sep.outputs['Y'], ang.inputs[0]); fl.new(sep.outputs['X'], ang.inputs[1])
rad = fn.new('ShaderNodeVectorMath'); rad.operation = 'LENGTH'; fl.new(tco.outputs['Object'], rad.inputs[0])
spk = fn.new('ShaderNodeMath'); spk.operation = 'MULTIPLY'; spk.inputs[1].default_value = 15; fl.new(ang.outputs[0], spk.inputs[0])   # 30 spokes
sn_ = fn.new('ShaderNodeMath'); sn_.operation = 'SINE'; fl.new(spk.outputs[0], sn_.inputs[0])
ab = fn.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; fl.new(sn_.outputs[0], ab.inputs[0])
thin = fn.new('ShaderNodeMapRange'); thin.inputs['From Min'].default_value = 0.02; thin.inputs['From Max'].default_value = 0.0; fl.new(ab.outputs[0], thin.inputs['Value'])   # a line where the sine crosses zero
rings = fn.new('ShaderNodeMath'); rings.operation = 'PINGPONG'; rings.inputs[1].default_value = 0.6; fl.new(rad.outputs['Value'], rings.inputs[0])
rthin = fn.new('ShaderNodeMapRange'); rthin.inputs['From Min'].default_value = 0.025; rthin.inputs['From Max'].default_value = 0.0; fl.new(rings.outputs[0], rthin.inputs['Value'])
mx = fn.new('ShaderNodeMath'); mx.operation = 'MAXIMUM'; fl.new(thin.outputs['Result'], mx.inputs[0]); fl.new(rthin.outputs['Result'], mx.inputs[1])
fade = fn.new('ShaderNodeMapRange'); fade.inputs['From Min'].default_value = 4.2; fade.inputs['From Max'].default_value = 9.5; fade.inputs['To Min'].default_value = 1; fade.inputs['To Max'].default_value = 0; fl.new(rad.outputs['Value'], fade.inputs['Value'])
gate = fn.new('ShaderNodeMath'); gate.operation = 'MULTIPLY'; fl.new(mx.outputs[0], gate.inputs[0]); fl.new(fade.outputs['Result'], gate.inputs[1])
st = fn.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = 1.3; fl.new(gate.outputs[0], st.inputs[0])
fb.inputs['Emission Color'].default_value = (*lin4('#3fb8ff')[:3], 1); fl.new(st.outputs[0], fb.inputs['Emission Strength'])
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0)); bpy.context.active_object.data.materials.append(fm)
bpy.data.objects['Paving'].data.materials[0] = material('Dais', '#161d3e', rough=0.22, metal=0.5)
cyl('DaisStep', 4.3, 0.06, (0, 0, 0.03), (0, 0, 0), metal, None, bevel=0.01, verts=128)
torus('DaisGlow', 4.3, 0.02, (0, 0, 0.06), (0, 0, 0), cyan_l, None); torus('DaisGlow2', 3.8, 0.02, (0, 0, 0.085), (0, 0, 0), violet_l, None)

# ---------- light: a key over the pad, cool fills, violet and cyan rims from behind ----------
def area(loc, energy, size, col, target=(0, 0, 1.0)):
    bpy.ops.object.light_add(type='AREA', location=loc); l = bpy.context.active_object; l.data.energy = energy; l.data.size = size; l.data.color = col
    l.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return l
area((0, -1.5, 6.0), 650, 2.5, (1.0, 0.97, 0.95))
area((-5, 2, 6.5), 280, 3, (0.75, 0.82, 1.0)); area((5, 2, 6.5), 280, 3, (0.75, 0.82, 1.0))
area((-3.5, 6, 3), 380, 2, (0.55, 0.4, 1.0)); area((3.5, 6, 3), 380, 2, (0.35, 0.85, 1.0))
# a faint haze in the room, so the lights glow
hz, hn, hl, _ = nodes_mat('Haze')
for nd in list(hn):
    if nd.type == 'BSDF_PRINCIPLED': hn.remove(nd)
vs = hn.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = 0.0012; vs.inputs['Color'].default_value = (0.75, 0.82, 1.0, 1)
hl.new(vs.outputs[0], hn['Material Output'].inputs['Volume'])
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=R - 0.8, depth=HROOM - 0.5, location=(0, 0, (HROOM - 0.5) / 2 + 0.01)); bpy.context.active_object.data.materials.append(hz); bpy.context.active_object.name = 'Haze'

# ---------- the five pillars ----------
# In a wide crescent behind the pad, clear of the Brainer: the middle one stands well back and taller, so its top rises
# over the tallest Brainer and the battery over its head. Each pillar has five glow bands (the game lights them up as it
# charges), a crown, and a terminal at the top that the arcs leave from.
PILLARS = [(-3.25, 1.35), (-2.25, 3.1), (0.0, 4.1), (2.25, 3.1), (3.25, 1.35)]   # 1 to 5, left to right
HT = [3.35, 3.55, 3.85, 3.55, 3.35]   # each one's height to its terminal: the far ones taller, so the five tops line up
dark = material('PDark', '#1c2448', rough=0.28, metal=0.7); glass = material('PGlass', '#dff6ff', rough=0.08, trans=1.0, ior=1.45)
core = emit('PCore', CYAN, 14); band = emit('PBand', '#8ff0ff', 7); orb = emit('POrb', '#e8fdff', 20)
INFO = []
TIP = {'column': 0.3, 'obelisk': 0.42}   # how far a pillar's top (the orb's gyroscope, the crystal's point) rises over its terminal
def pillar(i, x, y, h):
    bands = []
    cyl(f'PFoot{i}', 0.52, 0.12, (x, y, 0.06), (0, 0, 0), dark, None, bevel=0.02); cyl(f'PFoot2{i}', 0.42, 0.16, (x, y, 0.2), (0, 0, 0), dark, None, bevel=0.02)
    torus(f'PFootGlow{i}', 0.42, 0.014, (x, y, 0.28), (0, 0, 0), band, None); cyl(f'PFootBand{i}', 0.525, 0.035, (x, y, 0.1), (0, 0, 0), violet, None)
    if KIND == 'column':   # a plasma tube in a cage of floating magnetic rings; an orb in a gyroscope on top
        top = h - 0.48
        cyl(f'PTube{i}', 0.13, top - 0.3, (x, y, (top + 0.3) / 2), (0, 0, 0), glass, None); cyl(f'PCore{i}', 0.05, top - 0.3, (x, y, (top + 0.3) / 2), (0, 0, 0), core, None)
        for a in range(3):   # three rails up the outside
            ax = math.radians(30 + a * 120); cyl(f'PRail{i}{a}', 0.022, top - 0.25, (x + 0.44 * math.cos(ax), y + 0.44 * math.sin(ax), (top + 0.25) / 2), (0, 0, 0), chrome, None)
        for k in range(5):
            z = 0.75 + k * (top - 1.0) / 4
            torus(f'PRing{i}{k}', 0.33, 0.05, (x, y, z), (0, 0, 0), dark, None); torus(f'PRingGlow{i}{k}', 0.28, 0.018, (x, y, z), (0, 0, 0), band, None); bands.append((z, 0.3))
        cyl(f'PCrown{i}', 0.46, 0.09, (x, y, top), (0, 0, 0), dark, None, bevel=0.02); torus(f'PCrownGlow{i}', 0.46, 0.016, (x, y, top + 0.04), (0, 0, 0), band, None)
        crown = (top + 0.04, 0.46)
        torus(f'PGyroA{i}', 0.27, 0.018, (x, y, h), (math.pi / 2, 0, 0.5), chrome, None); torus(f'PGyroB{i}', 0.27, 0.018, (x, y, h), (math.pi / 2, 0, 2.07), chrome, None)
        ell(f'POrb{i}', (0.16, 0.16, 0.16), (x, y, h), orb, None)
    else:   # a dark hexagonal obelisk with channels of light up its edges; a halo and a crystal over it
        top = h - 0.62
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.36, radius2=0.2, depth=top - 0.28, location=(x, y, (top + 0.28) / 2)); o = bpy.context.active_object; o.name = f'PObelisk{i}'; o.data.materials.append(dark)
        bv = o.modifiers.new('Bevel', 'BEVEL'); bv.width = 0.015; bv.segments = 2
        for e in range(6):   # a line of light up each edge
            ae = math.radians(e * 60); p0 = Vector((x + 0.37 * math.cos(ae), y + 0.37 * math.sin(ae), 0.3)); p1 = Vector((x + 0.21 * math.cos(ae), y + 0.21 * math.sin(ae), top))
            cu = bpy.data.curves.new(f'PEdge{i}{e}', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.012; sp = cu.splines.new('POLY'); sp.points.add(1)
            sp.points[0].co = (*p0, 1); sp.points[1].co = (*p1, 1); link(f'PEdge{i}{e}', cu); cu.materials.append(core)
        for k in range(5): z = 0.75 + k * (top - 1.0) / 4; rr = 0.36 - 0.16 * (z - 0.28) / (top - 0.28) + 0.015; torus(f'PRing{i}{k}', rr, 0.012, (x, y, z), (0, 0, 0), band, None); bands.append((z, rr))
        crown = (top + 0.22, 0.36); torus(f'PHalo{i}', 0.36, 0.03, (x, y, crown[0]), (0, 0, 0), band, None); torus(f'PHaloRim{i}', 0.4, 0.02, (x, y, crown[0]), (0, 0, 0), chrome, None)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.3, location=(x, y, h)); o = bpy.context.active_object; o.name = f'PCrystal{i}'; o.scale = (0.7, 0.7, 1.3)
        o.data.materials.append(material('Crystal', '#bff4ff', rough=0.02, trans=1.0, ior=1.6, emit=CYAN, strength=8))
    # a conduit across the floor from the pillar's foot to the pad's rim, with a line of light along it
    d = Vector((-x, -y, 0)).normalized(); a = Vector((x, y, 0.06)) + d * 0.5; b2 = d * -1.5; b2.z = 0.1
    for nm, bev, mat, dz in (('PConduit', 0.045, dark, 0), ('PConduitLight', 0.012, core, 0.04)):
        cu = bpy.data.curves.new(f'{nm}{i}', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = bev; sp = cu.splines.new('BEZIER'); sp.bezier_points.add(1)
        for bp, co2 in ((sp.bezier_points[0], a + Vector((0, 0, dz))), (sp.bezier_points[1], b2 + Vector((0, 0, dz)))): bp.co = co2; bp.handle_left_type = bp.handle_right_type = 'AUTO'
        link(f'{nm}{i}', cu); cu.materials.append(mat)
    INFO.append({'x': x, 'y': y, 'h': h, 'bands': bands, 'crown': crown})
for i, ((x, y), h) in enumerate(zip(PILLARS, HT), 1): pillar(i, x, y, h)

# ---------- the camera: Charge's, with the wider, taller frame ----------
def camera():
    cam = C['camera']()
    cam.data.sensor_fit = 'HORIZONTAL'; cam.data.sensor_width = 36 * RW / 1920   # the same pixels per degree as Charge's frame
    cam.data.shift_x = 0; cam.data.shift_y = (TOP + 540 - RH / 2) / RW   # Charge's frame centre lands at (EX + 960, TOP + 540)
    cam.data.dof.use_dof = False   # indoors everything is near: sharp
    return cam
def px(p, cam):
    from bpy_extras.object_utils import world_to_camera_view
    v = world_to_camera_view(sc, cam, Vector(p)); return [round(v.x * RW, 1), round((1 - v.y) * RH, 1)]
def ring(c, r, cam):
    pts = [px((c[0] + r * math.cos(a), c[1] + r * math.sin(a), c[2]), cam) for a in [i * math.pi / 32 for i in range(64)]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return {'cx': round((min(xs) + max(xs)) / 2, 1), 'cy': round((min(ys) + max(ys)) / 2, 1), 'rx': round((max(xs) - min(xs)) / 2, 1), 'ry': round((max(ys) - min(ys)) / 2, 1)}

if MODE == 'sprites':   # the Brainer alone in the lab's light, one still per look, as Charge's sprites mode makes them
    cam = camera(); C['settings'](SAMPLES); sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = RW, RH; sc.view_settings.exposure = 0.0
    for o in bpy.data.objects:   # the lab still lights and reflects the Brainer, but only the Brainer is drawn and casts shadow
        if o.type in ('MESH', 'CURVE'): o.visible_camera = False; o.visible_shadow = False
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=1.3, fill_type='NGON', location=(0, 0, PAD + 0.002)); bpy.context.active_object.is_shadow_catcher = True
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    wpos, out = C['wpos'], {}
    for look in range(1, 12):
        key = f'{look}-ok'
        coll = bpy.data.collections.new('Bot' + key); sc.collection.children.link(coll)
        bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[coll.name]
        stage = min(look, 10); _, face, pose = STAGES[stage - 1]; place(stage, pose, face)
        if look == 11: C['cape']()
        bpy.context.view_layer.update()
        xs, ys = [], []   # the crop: the Brainer's parts, and the pad top its shadow falls on
        for o in coll.objects:
            if o.type != 'MESH': continue
            for c in o.bound_box: p = px(o.matrix_world @ Vector(c), cam); xs.append(p[0]); ys.append(p[1])
        pt = ring((0, 0, PAD), 1.3, cam)
        x0, x1 = max(0, min(min(xs), pt['cx'] - pt['rx']) - 16), min(RW, max(max(xs), pt['cx'] + pt['rx']) + 16)
        y0, y1 = max(0, min(ys) - 16), min(RH, max(max(ys), pt['cy'] + pt['ry']) + 16)
        x0, y0, x1, y1 = int(x0), int(y0), int(math.ceil(x1)), int(math.ceil(y1))
        sc.render.border_min_x, sc.render.border_max_x = x0 / RW, x1 / RW
        sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / RH, 1 - y0 / RH
        C['render'](os.path.join(OUTDIR, f'sprite-{key}.png'))
        cf = lambda q: [round(q[0] - EX, 1), round(q[1] - TOP, 1)]   # in Charge's frame, as the game places Charge's stills
        a = {'head': cf(px(wpos('HeadShell'), cam)), 'tip': cf(px(wpos('AntennaTip1'), cam)), 'chest': cf(px(wpos('ChestScreen'), cam)),
             'handL': cf(px(wpos('HandL'), cam)), 'handR': cf(px(wpos('HandR'), cam)), 'feet': cf(px((wpos('BootL') + wpos('BootR')) / 2, cam))}
        out[key] = {'x': x0 - EX, 'y': y0 - TOP, 'w': x1 - x0, 'h': y1 - y0, 'a': a}
        for o in list(coll.objects): bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
        json.dump(out, open(os.path.join(OUTDIR, 'sprites.json'), 'w'), indent=1)
if MODE in ('set', 'preview', 'json'):
    cam = camera(); C['settings'](SAMPLES)
    sc.render.resolution_x, sc.render.resolution_y = RW, RH
    sc.view_settings.exposure = 0.0; sc.cycles.volume_bounces = 1; sc.cycles.volume_step_rate = 4
    if MODE == 'preview':
        sc.render.resolution_percentage = 50
        if STAGE: _, face, pose = STAGES[STAGE - 1]; place(STAGE, pose, face)
    if MODE != 'json': C['render'](os.path.join(OUTDIR, 'set.png' if MODE == 'set' else f'preview-{KIND}-{STAGE}.png'))
    info = {'w': RW, 'h': RH, 'ox': EX, 'oy': TOP, 'pillar': KIND,   # Charge's frame sits at (ox, oy) in this one
            'pad': ring((0, 0, PAD), 1.12, cam), 'pad2': ring((0, 0, PAD), 0.62, cam), 'padTop': ring((0, 0, PAD), 1.3, cam),
            'pillars': [{'term': px((p['x'], p['y'], p['h']), cam), 'tip': px((p['x'], p['y'], p['h'] + TIP[KIND]), cam), 'rings': [ring((p['x'], p['y'], z), r, cam) for z, r in p['bands']],
                         'toroid': ring((p['x'], p['y'], p['crown'][0]), p['crown'][1], cam), 'base': px((p['x'], p['y'], 0.02), cam)} for p in INFO]}
    json.dump(info, open(os.path.join(OUTDIR, f'preview-{KIND}.json' if MODE == 'preview' else 'set.json'), 'w'), indent=1); print('SET JSON')
