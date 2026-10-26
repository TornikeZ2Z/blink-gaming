# The Brainer, modelled in Blender. The approved look (Tornike, 2026-10-25): a clean round head with a big LED visor
# over nearly the whole face, no brain on the body, and the stage number in LED dots on the chest. Direction 'G' is
# the approved evolution, "Grows up": baby to master over 10 stages, one accessory per pair of stages (none, scarf,
# cap, bow tie, graduation cap), each stage with its own pose and LED face (STAGES, below build()).
# The other directions (A gear, B finishes, C brand colours), screen styles and brain placements are kept for reference.
# The LED textures (face_pixel_*_bg.png, face_power_*_bg.png, num_*.png) come from ../textures.mjs.
# usage: blender -b --python brainer2.py -- <outdir> <mode> [args]
#   modes: lineup <dir> <row 1|2> [style] | stages | hero <dir> <stage> [style] | final <faces> [screen] | power <keys> | sage
#          | tops <top> | screens <screen> [face] | brain_test
import bpy, bmesh, math, sys, os, random
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, MODE, ARGS = argv[0], argv[1], argv[2:]
DIR = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

_mats = {}
def material(name, color, rough=0.35, metal=0.0, coat=0.0, emit=None, strength=0.0, trans=0.0, sss=0.0, alpha=1.0, ior=1.45, film=0.0, sheen=0.0, spec=None):
    key = (name, color, rough, metal, coat, emit, strength, trans, sss, alpha, film, sheen, spec)
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin(color), 1)
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.06
    if emit: b.inputs['Emission Color'].default_value = (*lin(emit), 1); b.inputs['Emission Strength'].default_value = strength
    if trans: b.inputs['Transmission Weight'].default_value = trans; b.inputs['IOR'].default_value = ior
    if sss: b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Radius'].default_value = (0.5, 0.3, 0.4)
    if alpha < 1: b.inputs['Alpha'].default_value = alpha
    if film: b.inputs['Thin Film Thickness'].default_value = film; b.inputs['Thin Film IOR'].default_value = 1.6
    if sheen: b.inputs['Sheen Weight'].default_value = sheen
    if spec is not None: b.inputs['Specular IOR Level'].default_value = spec
    _mats[key] = m
    return m

def image_material(name, path, strength=1.4, flat=False):   # flat: pure glow, no reflections (an even screen)
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(path, check_existing=True)
    if not flat: nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    else: b.inputs['Base Color'].default_value = (0, 0, 0, 1); b.inputs['Specular IOR Level'].default_value = 0.0
    nt.links.new(tex.outputs['Color'], b.inputs['Emission Color']); nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Emission Strength'].default_value = strength; b.inputs['Roughness'].default_value = 0.06 if not flat else 0.5; b.inputs['Coat Weight'].default_value = 0.0 if flat else 1.0
    return m

def done(o, name, mat=None, parent=None, smooth=True):
    o.name = name
    if mat:
        if o.data.materials: o.data.materials[0] = mat
        else: o.data.materials.append(mat)
    if smooth and o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = True
    if parent: o.parent = parent; o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o

def activate(o):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o

def apply_scale(o): activate(o); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

def rbox(name, half, loc, bevel, mat, parent, segs=8, sub=2, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=2, location=loc, rotation=rot); o = bpy.context.active_object
    o.scale = half; apply_scale(o)
    bv = o.modifiers.new('Bevel', 'BEVEL'); bv.width = bevel; bv.segments = segs; bv.limit_method = 'NONE'; bv.use_clamp_overlap = True
    sd = o.modifiers.new('Sub', 'SUBSURF'); sd.levels = sub; sd.render_levels = sub
    return done(o, name, mat, parent)

def ell(name, radii, loc, mat, parent, segs=64, rings=32, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=loc, rotation=rot); o = bpy.context.active_object
    o.scale = radii; apply_scale(o)
    return done(o, name, mat, parent)

def cyl(name, r, depth, loc, rot, mat, parent, bevel=0.0, verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot); o = bpy.context.active_object
    if bevel: bv = o.modifiers.new('Bevel', 'BEVEL'); bv.width = bevel; bv.segments = 5; bv.limit_method = 'ANGLE'
    return done(o, name, mat, parent)

def torus(name, R, r, loc, rot, mat, parent, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=96, minor_segments=24, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = scale
    return done(o, name, mat, parent)

def capsule(name, a, b, r, mat, parent):
    a, b = Vector(a), Vector(b); d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=d.length, location=(a + b) / 2); o = bpy.context.active_object
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    done(o, name, mat, parent)
    for i, p in enumerate((a, b)): ell(f'{name}_end{i}', (r, r, r), tuple(p), mat, parent, segs=32, rings=16)
    return o

def empty(name, loc, parent=None):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc); o = bpy.context.active_object
    return done(o, name, None, parent, smooth=False)

def panel(name, w, h, r, loc, mat, parent, depth=0.02):   # a flat rounded rectangle facing -Y, thickened backwards
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(math.pi / 2, 0, 0)); o = bpy.context.active_object
    o.scale = (w, h, 1); apply_scale(o)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.bevel(bm, geom=list(bm.verts), offset=r, segments=14, affect='VERTICES', profile=0.5); bm.to_mesh(o.data); bm.free()
    so = o.modifiers.new('Thick', 'SOLIDIFY'); so.thickness = depth; so.offset = -1
    return done(o, name, mat, parent, smooth=False)

def plane(name, w, h, loc, rot, mat, parent):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot); o = bpy.context.active_object
    o.scale = (w, h, 1); apply_scale(o)
    return done(o, name, mat, parent, smooth=False)

# ---------- the brain: two lobes with folds, built once and shared ----------
TIERS = [('#33d66d', '#00ebc0', '#c8f7d9'), ('#fa7b5b', '#ffc147', '#ffe0c9'), ('#9433ed', '#e36072', '#f2c8ef'), ('#ed2b4b', '#ed6b6b', '#ffd0d6'), ('#4b36fc', '#8447fb', '#d9cfff')]
_brain = {}
SCREEN_GRID = (96, 54)   # the visor sheet's resolution (the web export uses a lighter one)
def brain_mesh(style='toon', sides=(-1, 1)):
    if (style, sides) in _brain: return _brain[(style, sides)]
    objs = []
    for sd in sides:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=128, ring_count=64, radius=1, location=(sd * 0.47 if len(sides) == 2 else 0, 0, 0), rotation=(0, math.pi / 2, 0)); o = bpy.context.active_object
        activate(o); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)   # poles point sideways (one hidden in the gap between the lobes), so the grooves fan out from the middle
        o.scale = (0.52, 0.92, 0.62); apply_scale(o)
        s1 = o.modifiers.new('Sub', 'SUBSURF'); s1.levels = 1; s1.render_levels = 1
        if style.startswith('carved'):   # winding grooves drawn by hand, carved into a smooth lobe
            t = bpy.data.textures.new(f'Grooves{sd}', 'IMAGE'); t.image = bpy.data.images.load(os.path.join(DIR, {'carved': 'grooves_a.png', 'carved_dense': 'grooves_b.png', 'carved_bold': 'grooves_c.png'}[style]), check_existing=True); t.extension = 'REPEAT'
            d = o.modifiers.new('Grooves', 'DISPLACE'); d.texture = t; d.strength = 0.075; d.mid_level = 1.0; d.texture_coords = 'UV'
        if style in ('toon', 'mix'):   # soft, rounded gyri winding over each lobe
            t = bpy.data.textures.new(f'Marble{sd}', 'MARBLE'); t.marble_type = 'SOFT'; t.noise_basis_2 = 'SIN'; t.turbulence = 2.6; t.noise_scale = 0.5; t.noise_depth = 2
            d = o.modifiers.new('Folds', 'DISPLACE'); d.texture = t; d.strength = 0.1; d.mid_level = 0.5; d.texture_coords = 'LOCAL'
        if style in ('lobes', 'mix'):   # plump bulges between grooves
            t = bpy.data.textures.new(f'Cells{sd}', 'VORONOI'); t.weight_1 = -1.0; t.weight_2 = 1.0; t.noise_scale = 0.36; t.contrast = 1.2
            d = o.modifiers.new('Cells', 'DISPLACE'); d.texture = t; d.strength = 0.2 if style == 'lobes' else 0.1; d.mid_level = 0.0; d.texture_coords = 'LOCAL'
        if not style.startswith('carved'): sm = o.modifiers.new('Soften', 'SMOOTH'); sm.factor = 0.9; sm.iterations = 8
        s2 = o.modifiers.new('Smooth', 'SUBSURF'); s2.levels = 1; s2.render_levels = 1
        activate(o)
        for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
        for p in o.data.polygons: p.use_smooth = True
        objs.append(o)
    activate(objs[0])
    for x in objs[1:]: x.select_set(True)
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = f'BrainSrc_{style}{len(sides)}'; o.hide_render = True; o.hide_viewport = True
    o.data.materials.clear(); o.data.materials.append(material('BrainBase', '#FFFFFF'))   # a slot that each brain overrides with its level's colour
    _brain[(style, sides)] = o.data
    return o.data

def bubble(name, r, loc, axis, squash, mat, parent):   # a glass half-sphere bulging out along axis
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1, location=loc); o = bpy.context.active_object
    bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.dot(Vector(axis)) < -0.001], context='VERTS'); bmesh.update_edit_mesh(o.data); bpy.ops.object.mode_set(mode='OBJECT')
    o.scale = tuple(r * (squash if a else 1) for a in axis); apply_scale(o)
    return done(o, name, mat, parent)

def mini_brain(name, loc, rot, scale, parent, sides=(-1, 1), style='carved_dense', tier=4, glow=0.25, mat=None):   # a brain placed anywhere on the body
    t = TIERS[tier]
    me = bpy.data.objects.new(name, brain_mesh(style, sides)); bpy.context.collection.objects.link(me)
    me.location = loc; me.rotation_euler = rot; me.scale = scale if isinstance(scale, tuple) else (scale,) * 3
    me.material_slots[0].link = 'OBJECT'; me.material_slots[0].material = mat or material(f'Brain{t[0]}{glow}', t[2], rough=0.32, coat=0.7, sss=0.35, emit=t[1], strength=glow)
    me.parent = parent; me.matrix_parent_inverse = parent.matrix_world.inverted()
    return me

def brain(stage, head, style='toon', tier_override=None):
    t = TIERS[(stage - 1) // 2] if tier_override is None else TIERS[tier_override]
    k = 0.42 * (0.62 + 0.38 * (stage - 1) / 9)   # grows from 62% to the full dome
    holder = empty(f'Brain_s{stage}', (0, 0, 2.04 + 0.62 * k * 0.8), head)
    me = bpy.data.objects.new(f'BrainMesh_s{stage}', brain_mesh(style)); bpy.context.collection.objects.link(me)
    me.parent = holder; me.location = (0, 0, 0); me.scale = (k, k, k)
    mat = material(f'Brain{t[0]}', t[2], rough=0.32, coat=0.7, sss=0.35, emit=t[1], strength=0.25)
    me.material_slots[0].link = 'OBJECT'; me.material_slots[0].material = mat
    rnd = random.Random(7 + stage)
    neuron = material(f'Neuron{t[1]}', t[1], rough=0.15, emit=t[1], strength=3.2)
    for i in range(3 + 2 * stage):   # glowing neurons on the lobes, more as it grows
        sd = rnd.choice((-1, 1)); th = rnd.uniform(0.15, 1.35); ph = rnd.uniform(0, 2 * math.pi)
        th = rnd.uniform(0.2, 1.1)   # on the upper part of a lobe, where it can be seen
        p = Vector((sd * 0.47 + 0.53 * math.sin(th) * math.cos(ph), 0.93 * math.sin(th) * math.sin(ph), 0.64 * math.cos(th))) * k
        o = ell(f'Neuron_s{stage}_{i}', (0.026,) * 3, (0, 0, 0), neuron, None, segs=16, rings=8)
        o.parent = holder; o.location = p
    return holder

# ---------- the character ----------
def build(stage=1, dirn='C', x=0.0, pose=None, face='face_pixel_happy.png', style='toon', top='clean', screen='visor', sage=None):
    # sage: a (colour, finish) for the trims instead of the stage's own, to compare colours for the top stage
    # screen: visor (the LED screen over nearly the whole round face: Tornike's final pick), full (a flat screen in a bigger head), frame (violet frame),
    #         white (set in a white rim), big (a large screen, nearly edge to edge)
    # top: where the brain lives. clean (no brain: Tornike's pick, 2026-10-25), dome (glass dome on the head), heart (a window in the chest),
    #      ears (a lobe in each ear), bulb (a light bulb on the antenna), helmet (the head top shaped like a brain)
    pose = pose or {}
    root = empty(f'Brainer_{dirn}{stage}', (0, 0, 0))
    # materials by direction
    body_m = material('White', '#FFFFFF', rough=0.28, coat=0.4, sss=0.05)
    acc = '#5A3FFC'
    if dirn == 'C': acc = ['#1FBF6E', '#12B39A', '#F2703F', '#F59A2A', '#B23BE6', '#D94D8A', '#E8304F', '#F05A5A', '#4B36FC', '#8447FB'][stage - 1]
    age = (stage - 1) / 9 if dirn == 'G' else None   # G: it grows up, baby to wise old master
    dz = 0.3 * age if age is not None else 0.0      # longer legs as it grows
    if dirn == 'G': acc = ['#58B7FF', '#16C79A', '#F2703F', '#F59A2A', '#E3488F', '#8447FB', '#5A3FFC', '#3B3A8F', '#9B2C5A', '#4A1C9E'][stage - 1]   # stage 10: option 1 of the sage colours until one is picked
    if dirn == 'B':
        acc = ['#5A3FFC', '#16C79A', '#F2703F', '#4B2FD6', '#E3488F', '#E8304F', '#5A3FFC', '#FFFFFF', '#4B36FC', '#FFC147'][stage - 1]
        body_m = [material('White', '#FFFFFF', rough=0.28, coat=0.4, sss=0.05), material('White', '#FFFFFF', rough=0.28, coat=0.4, sss=0.05), material('White', '#FFFFFF', rough=0.28, coat=0.4, sss=0.05),
                  material('Lavender', '#DCD4FF', rough=0.3, coat=0.5), material('Pearl', '#FFFFFF', rough=0.18, coat=1.0, film=420),
                  material('Aluminium', '#D9DDE6', rough=0.32, metal=1.0), material('Chrome', '#EEF1F8', rough=0.05, metal=1.0),
                  material('RoseGold', '#EBB39F', rough=0.16, metal=1.0), material('Gold', '#FFCF6B', rough=0.12, metal=1.0),
                  material('Crystal', '#F1ECFF', rough=0.03, trans=1.0, ior=1.5)][stage - 1]
    gold = material('GoldTrim', '#FFC94D', rough=0.14, metal=1.0)
    acc_m = gold if (dirn == 'A' and stage >= 8) else (material(f'Acc{acc}', acc, rough=0.14, metal=1.0) if (dirn == 'B' and stage == 10) else material(f'Acc{acc}', acc, rough=0.22, coat=0.6))
    joint = material('Joint', '#2B2452', rough=0.38, metal=0.35)
    tassel_m = acc_m
    if sage:   # the sage's trims in one of the candidate finishes
        acc, kind = sage
        acc_m = {'gloss': material(f'Acc{acc}', acc, rough=0.22, coat=0.6), 'metal': material(f'AccM{acc}', acc, rough=0.12, metal=1.0),
                 'pearl': material(f'AccP{acc}', acc, rough=0.12, coat=1.0, film=420)}[kind.split('+')[0]]
        tassel_m = material('TasselGlow', '#B8FBFF', rough=0.2, emit='#55E6FF', strength=4) if kind.endswith('+glow') else acc_m
    glass = material('Glass', '#F4F1FF', rough=0.02, trans=1.0, ior=1.3)
    floor = material('BrainFloor', '#EFEAFF', rough=0.4, emit='#C9B8FF', strength=0.6)
    core = material('Core', '#7DF5FF', rough=0.2, emit='#55E6FF', strength=6)
    tip = material('AntennaTip', '#B6FFDF', rough=0.2, emit='#33D66D', strength=5)
    screen_blue = material('ScreenBlue', '#2B45E6', rough=0.08, coat=1.0, emit='#2B45E6', strength=0.8)

    body = empty('Body', (0, 0, 0.36), root)
    ell('Torso', (0.56, 0.47, 0.37), (0, 0, 0.62), body_m, body)
    if top == 'heart':   # the brain sits in a glass window in its chest, like a heart
        cyl('Housing', 0.25, 0.1, (0, -0.47, 0.64), (math.pi / 2, 0, 0), acc_m, body, bevel=0.03)
        cyl('HousingBack', 0.215, 0.02, (0, -0.525, 0.64), (math.pi / 2, 0, 0), floor, body)
        torus('HousingRing', 0.22, 0.03, (0, -0.525, 0.64), (math.pi / 2, 0, 0), acc_m, body)
        mini_brain('ChestBrain', (0, -0.54, 0.64), (math.pi / 2, 0, 0), 0.18, body, glow=0.6)
        bubble('ChestGlass', 0.215, (0, -0.525, 0.64), (0, -1, 0), 0.65, glass, body)
    else:
        rbox('ChestPanel', (0.22, 0.05, 0.15), (0, -0.425, 0.64), 0.12, acc_m, body)
        plane('ChestScreen', 0.32, 0.178, (0, -0.478, 0.64), (math.pi / 2, 0, 0), image_material(f'ChestNum{stage}', os.path.join(DIR, f'num_{stage}.png'), strength=1.5, flat=True), body)   # the stage, in LED dots
    big_head = screen == 'full'   # a bigger, flatter-faced head, so the screen fits inside its front instead of sticking out
    HW, HH, HB = (0.91, 0.63, 0.22) if big_head else (0.82, 0.5, 0.36)   # half width, half height, corner rounding
    HT = 1.56 + HH   # the top of the head
    cyl('Neck', 0.2, 0.3 if big_head else 0.22, (0, 0, 1.01 if big_head else 0.98), (0, 0, 0), joint, body)
    torus('NeckRing', 0.215, 0.035, (0, 0, 0.93), (0, 0, 0), acc_m, body)
    head = empty('Head', (0, 0, 1.06), body)
    shell = rbox('HeadShell', (HW, 0.64, HH), (0, 0, 1.56), HB, body_m, head, segs=10)
    if screen == 'full':   # set flush into the flat face of the head, glowing one even blue: pure emission, no reflections
        panel('ScreenGlass', 1.24, 0.68, 0.16, (0, -0.652, 1.55), material('ScreenFull', '#000000', rough=0.5, emit='#3550F0', strength=1.5, spec=0.0), head)
        fw, fh, fy = 1.24, 0.689, -0.655   # the face texture spans the whole screen
    elif screen in ('wrap', 'visor'):   # the round head keeps its shape; the screen is a fine sheet shrink-wrapped onto its curved face
        sw, sh = (1.24, 0.68) if screen == 'wrap' else (1.48, 0.822)   # visor: nearly the whole face, a thin white rim around it
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=SCREEN_GRID[0], y_subdivisions=SCREEN_GRID[1], size=1, location=(0, -0.9, 1.55), rotation=(math.pi / 2, 0, 0)); scr = bpy.context.active_object
        scr.scale = (sw, sh, 1); apply_scale(scr)
        wr = scr.modifiers.new('Wrap', 'SHRINKWRAP'); wr.target = shell; wr.wrap_method = 'PROJECT'; wr.use_project_z = True
        wr.use_negative_direction = True; wr.use_positive_direction = True; wr.offset = 0.004
        done(scr, 'Screen', image_material('ScreenFace', os.path.join(DIR, face.replace('.png', '_bg.png')), strength=1.5, flat=True), head)
    else:
        if screen == 'big':   # a large screen set into the white head, nearly edge to edge
            rbox('Bezel', (0.78, 0.12, 0.46), (0, -0.54, 1.55), 0.3, body_m, head)
            sw, sh, sr, fw = 1.44, 0.8, 0.26, 1.34
        else:
            rbox('Bezel', (0.68, 0.06, 0.38), (0, -0.6, 1.55), 0.22, acc_m if screen == 'frame' else body_m, head)
            sw, sh, sr, fw = 1.24, 0.64, 0.19, 1.2
        panel('ScreenGlass', sw, sh, sr, (0, -0.668, 1.55), screen_blue, head)   # one even blue, flat right to its edges
        fh, fy = fw * 532 / 1024, -0.671
    ears_glow = dirn == 'A' and stage >= 2
    ear_cap = material(f'EarGlow{acc}', '#FFFFFF', rough=0.2, emit='#7DF5FF', strength=4) if ears_glow else acc_m
    for sd, nm in ((-1, 'L'), (1, 'R')):
        er = 0.29 if ears_glow or top == 'ears' else 0.25
        cyl(f'Ear{nm}', er, 0.16, (sd * (HW + 0.02), 0.02, 1.58), (0, math.pi / 2, 0), body_m, head, bevel=0.05)
        if top == 'ears':   # left brain, right brain: a lobe under glass in each ear
            cyl(f'EarBack{nm}', er - 0.03, 0.02, (sd * 0.93, 0.02, 1.58), (0, math.pi / 2, 0), floor, head)
            torus(f'EarRing{nm}', er - 0.03, 0.035, (sd * 0.93, 0.02, 1.58), (0, math.pi / 2, 0), acc_m, head)
            mini_brain(f'EarBrain{nm}', (sd * 0.93, 0.02, 1.58), (0, 0, 0 if sd > 0 else math.pi), 0.26, head, sides=(1,), glow=0.6)
            bubble(f'EarGlass{nm}', er - 0.03, (sd * 0.93, 0.02, 1.58), (sd, 0, 0), 0.6, glass, head)
            continue
        torus(f'EarRing{nm}', er - 0.05, 0.035, (sd * (HW + 0.105), 0.02, 1.58), (0, math.pi / 2, 0), acc_m, head)
        cyl(f'EarCap{nm}', er - 0.12, 0.04, (sd * (HW + 0.115), 0.02, 1.58), (0, math.pi / 2, 0), ear_cap, head, bevel=0.015)
    if top == 'ears':   # the antenna moves to the crown, out of the way of the ear globes
        capsule('Antenna', (0, 0.02, 2.04), (0.06, 0.02, 2.36), 0.022, joint, head)
        ell('AntennaTip', (0.07,) * 3, (0.065, 0.02, 2.4), tip, head)
    if top == 'bulb':   # an idea bulb on the antenna, a little brain lit up inside
        capsule('Antenna', (0.93, 0.02, 1.72), (1.0, 0.02, 2.06), 0.022, joint, head)
        cyl('BulbBase', 0.075, 0.1, (1.005, 0.02, 2.12), (0, 0, 0), gold, head, bevel=0.02)
        for i in range(3): torus(f'BulbThread{i}', 0.077, 0.012, (1.005, 0.02, 2.09 + 0.03 * i), (0, 0, 0), gold, head)
        ell('Bulb', (0.17, 0.17, 0.19), (1.005, 0.02, 2.33), glass, head)
        mini_brain('BulbBrain', (1.005, 0.02, 2.33), (0, 0, 0.5), 0.12, head, glow=2.5)
    antennas = [] if top in ('ears', 'bulb') else [1] + ([-1] if dirn == 'A' and stage >= 6 else [])
    for sd in antennas:
        az = (1.9 if dirn == 'G' and stage == 1 else 2.02) + HT - 2.06; ax = HW + 0.21
        capsule(f'Antenna{sd}', (sd * (HW + 0.11), 0.02, 1.72), (sd * (HW + 0.2), 0.02, az), 0.022, joint, head)
        ell(f'AntennaTip{sd}', (0.07 if stage < 6 or dirn != 'A' else 0.09,) * 3, (sd * ax, 0.02, az + 0.04), tip, head)
    if top == 'dome':
        torus('DomeRing', 0.6, 0.06, (0, 0, 2.02), (0, 0, 0), acc_m, head)
        cyl('BrainFloor', 0.585, 0.03, (0, 0, 2.025), (0, 0, 0), floor, head)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.6, location=(0, 0, 2.02)); dome = bpy.context.active_object
        bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(dome.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context='VERTS'); bmesh.update_edit_mesh(dome.data); bpy.ops.object.mode_set(mode='OBJECT')
        done(dome, 'Dome', glass, head)
        brain(stage, head, style)
    if top == 'helmet':   # no glass, no pink: the top of the head itself is moulded like a brain, in the body's plastic
        mini_brain('HeadBrain', (0, 0, 1.96), (0, 0, 0), (0.62, 0.6, 0.48), head, mat=body_m)
    if screen not in ('wrap', 'visor'): plane('Screen', fw, fh, (0, fy, 1.55), (math.pi / 2, 0, 0), image_material('ScreenFace', os.path.join(DIR, face.replace('.png', '_t.png'))), head)   # just the eyes and mouth, on the glass
    for sd, nm in ((-1, 'L'), (1, 'R')):
        arm = empty(f'Arm{nm}', (sd * 0.55, 0, 0.82), body)
        ell(f'Shoulder{nm}', (0.12, 0.12, 0.12), (sd * 0.55, 0, 0.82), acc_m, arm)
        capsule(f'UpperArm{nm}', (sd * 0.6, 0, 0.78), (sd * 0.7, -0.02, 0.5), 0.075, body_m, arm)
        torus(f'Cuff{nm}', 0.085, 0.03, (sd * 0.71, -0.02, 0.47), (0.0, sd * 0.3, 0), acc_m, arm)
        ell(f'Hand{nm}', (0.13, 0.11, 0.15), (sd * 0.73, -0.03, 0.34), body_m, arm)
        ell(f'Thumb{nm}', (0.055, 0.05, 0.065), (sd * 0.64, -0.1, 0.38), body_m, arm)
        if dirn == 'A' and stage >= 3:   # shoulder pads
            rbox(f'Pad{nm}', (0.16, 0.15, 0.07), (sd * 0.6, 0, 0.93), 0.06, acc_m, arm, rot=(0, sd * 0.35, 0))
        arm.rotation_euler = pose.get('arm' + nm, (0, 0, 0))
    for sd, nm in ((-1, 'L'), (1, 'R')):
        leg = empty(f'Leg{nm}', (sd * 0.24, 0, 0.36 + dz), root)
        capsule(f'Thigh{nm}', (sd * 0.24, 0, 0.36 + dz), (sd * 0.25, -0.02, 0.2), 0.09, joint, leg)
        rbox(f'Boot{nm}', (0.17, 0.22, 0.11), (sd * 0.25, -0.05, 0.13), 0.1, body_m, leg)
        leg.rotation_euler = pose.get('leg' + nm, (0, 0, 0))
        rbox(f'Sole{nm}', (0.18, 0.23, 0.035), (sd * 0.25, -0.05, 0.035), 0.03, acc_m, leg, segs=4, sub=1)
    # direction A: the gear it earns
    if dirn == 'A':
        if stage >= 4:   # belt with a buckle
            torus('Belt', 1.0, 0.045, (0, 0, 0.42), (0, 0, 0), joint, body, scale=(0.525, 0.445, 1))
            rbox('Buckle', (0.09, 0.03, 0.06), (0, -0.455, 0.42), 0.025, gold, body)
        if stage >= 5:   # jet pack
            rbox('JetPack', (0.3, 0.13, 0.25), (0, 0.52, 0.68), 0.1, acc_m, body)
            for sd in (-1, 1):
                cyl(f'Nozzle{sd}', 0.075, 0.12, (sd * 0.15, 0.55, 0.38), (0, 0, 0), joint, body, bevel=0.01)
                ell(f'Flame{sd}', (0.06, 0.06, 0.12), (sd * 0.15, 0.55, 0.26), material('Flame', '#FFE0A0', emit='#FFB347', strength=12), body)
        if stage >= 7:   # cape
            bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.78, radius2=0.42, depth=0.78, location=(0, 0.05, 0.6)); cape = bpy.context.active_object
            bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(cape.data)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < 0.12 or abs(f.normal.z) > 0.9], context='FACES'); bmesh.update_edit_mesh(cape.data); bpy.ops.object.mode_set(mode='OBJECT')
            so = cape.modifiers.new('Thick', 'SOLIDIFY'); so.thickness = 0.025; sb = cape.modifiers.new('Sub', 'SUBSURF'); sb.levels = 1
            done(cape, 'Cape', material('Cape', '#E8304F' if stage < 9 else '#5A3FFC', rough=0.7, sheen=0.8), body)
        if stage >= 9:   # energy wings
            wing = material('Wing', '#BFF7FF', rough=0.1, emit='#55E6FF', strength=3.5, alpha=0.75)
            for sd in (-1, 1):
                ell(f'Wing{sd}', (0.55, 0.035, 0.2), (sd * 0.62, 0.6, 1.0), wing, body, rot=(0, sd * 0.55, sd * 0.35))
        if stage >= 10:   # halo
            torus('Halo', 0.42, 0.035, (0, 0, 2.86 if top == 'dome' else HT + 0.32), (0.15, 0, 0), material('HaloGlow', '#FFE9A8', rough=0.1, metal=1.0, emit='#FFC94D', strength=3), head)
    if dirn == 'G':   # one accessory per pair of stages (Tornike's rule): 1-2 none, 3-4 scarf, 5-6 cap, 7-8 bow tie, 9-10 graduation cap
        pair = (stage + 1) // 2
        if pair == 2:   # a scarf
            scarf = material('Scarf', '#E8304F', rough=0.7, sheen=0.9)
            torus('Scarf', 0.27, 0.075, (0, 0, 0.93), (0, 0, 0), scarf, body)
            ell('ScarfEnd', (0.08, 0.04, 0.17), (0.17, -0.4, 0.78), scarf, body, rot=(0.2, 0.3, 0))
        if pair == 3:   # a cap in the stage's colour, worn with the peak swung round to the back
            capm = material(f'Cap{acc}', acc, rough=0.5, sheen=0.4)
            bubble('CapCrown', 0.56, (0, 0.04, HT - 0.12), (0, 0, 1), 0.55, capm, head)
            ell('CapPeak', (0.26, 0.22, 0.022), (0.53, 0.57, HT - 0.07), capm, head, rot=(0, 0, -math.pi / 4))
            ell('CapButton', (0.05, 0.05, 0.03), (0, 0.04, HT - 0.12 + 0.3), capm, head)
        if pair == 4:   # a bow tie in the stage's colour
            m = material(f'Tie{acc}', acc, rough=0.4, sheen=0.6)
            for k in (-1, 1): ell(f'Bow{k}', (0.11, 0.05, 0.075), (k * 0.1, -0.43, 0.95), m, body, rot=(0, k * 0.4, 0))
            ell('BowKnot', (0.045, 0.045, 0.045), (0, -0.46, 0.95), m, body)
        if pair == 5:   # a graduation cap
            cz = 2.6 if top == 'dome' else HT + 0.04   # on the dome, or straight on the head
            cyl('CapBase', 0.3, 0.12, (0, 0, cz), (0, 0, 0), joint, head)
            rbox('Board', (0.42, 0.42, 0.02), (0, 0, cz + 0.08), 0.02, joint, head, segs=2, sub=1, rot=(0, 0, math.pi / 4))
            capsule('Tassel', (0, 0, cz + 0.11), (0.57, -0.02, cz + 0.1), 0.018, tassel_m, head)
            capsule('TasselCord', (0.57, -0.02, cz + 0.1), (HW + 0.04, -0.05, cz - 0.08), 0.018, tassel_m, head)
            ell('TasselEnd', (0.05, 0.05, 0.09), (HW + 0.05, -0.05, cz - 0.14), tassel_m, head)
    if dirn == 'B' and stage == 10:   # crystal Brainer: a glowing core inside its glass body
        ell('InnerGlow', (0.3, 0.26, 0.22), (0, 0, 0.62), material('Inner', '#FFFFFF', emit='#8447FB', strength=6), body)
    body.rotation_euler = pose.get('body', (0, 0, 0)); head.rotation_euler = pose.get('head', (0, 0, 0))
    if big_head: head.location.z += 0.07   # lift the bigger head clear of the shoulders
    if dirn == 'G':
        body.location.z += dz                      # standing taller on longer legs
        head.scale = (1.14 - 0.22 * age,) * 3      # a baby's big head, an adult's in proportion
        root.scale = (0.74 + 0.26 * age,) * 3      # a small baby, a full-grown master
    root.location = (x, 0, pose.get('lift', 0.0) * root.scale.z)   # lift: sit (below 0), jump or float (above)
    if pose.get('aura'):   # a soft glow on the ground under a floating master
        glow = material('Aura', '#E4DAFF', emit='#9C86FF', strength=5)
        for k, r in enumerate((0.62, 0.42)): torus(f'Aura{k}', r * root.scale.x, 0.025, (x, 0, 0.03 + 0.05 * k), (0, 0, 0), glow, None)
    return root

# the Grows up stages: name, LED face and pose (Tornike: smoother steps, a pose and a face of their own for each).
# Kept in step with STAGES in shared/brainer-model.js. The head is wider than the shoulders: an arm raised more than
# 1.8 out to the side goes into the visor or an ear, so raised arms stop there and heads tilt away from a raised hand.
STAGES = [
    ('Baby', 'amazed', {'legL': (-1.45, 0, 0), 'legR': (-1.45, 0, 0), 'lift': -0.25, 'armL': (-0.5, 0.45, 0), 'armR': (-0.5, -0.45, 0), 'head': (0, 0.12, 0)}),
    ('Toddler', 'love', {'armL': (-0.9, 1.65, 0), 'armR': (-0.9, -1.65, 0), 'head': (-0.12, 0, 0)}),   # arms out for a hug
    ('Kid', 'wink', {'armR': (-0.5, -1.75, 0), 'head': (0, -0.12, -0.1)}),   # waving, the head tilted away from the hand
    ('School kid', 'happy', {'armR': (-0.15, -1.8, 0), 'armL': (0, 0.15, 0), 'body': (0, -0.06, 0)}),   # a hand up in class
    ('Teen', 'excited', {'lift': 0.35, 'legL': (0, 0.35, 0), 'legR': (0, -0.35, 0), 'armL': (0, 1.8, 0), 'armR': (0, -1.8, 0)}),   # a jump, arms in a V
    ('Student', 'proud', {'legL': (-0.45, 0, 0), 'legR': (0.45, 0, 0), 'armL': (0.5, 0, 0), 'armR': (-0.5, 0, 0), 'body': (0, 0, 0.12)}),
    ('Young pro', 'rest', {'armR': (-0.3, -1.3, 0), 'armL': (0, 0.1, 0), 'head': (0, 0, 0.25)}),
    ('Pro', 'think', {'armR': (-1.7, -0.6, 0), 'armL': (-1.0, -0.4, 0), 'head': (-0.06, -0.12, 0.1)}),
    ('Expert', 'calm', {'armL': (0.7, 0.1, 0), 'armR': (0.7, -0.1, 0), 'body': (-0.06, 0, 0), 'head': (-0.08, 0, 0)}),
    ('Master', 'wise', {'armL': (0, 1.25, 0), 'armR': (0, -1.25, 0), 'lift': 0.25, 'aura': True, 'head': (-0.08, 0, 0)}),
]

# ---------- studio ----------
def look(o, target):
    d = Vector(target) - o.location; o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
def studio(res, cam_loc, cam_tgt, lens=62, ortho=None):
    bpy.ops.object.camera_add(location=cam_loc); cam = bpy.context.active_object; scene.camera = cam; look(cam, cam_tgt)
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.lens = lens
    w = bpy.data.worlds.new('W'); scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (*lin('#F2F0FF'), 1); w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.55
    scene.render.film_transparent = True
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0)); bpy.context.active_object.is_shadow_catcher = True
    def area(loc, energy, size, color, target):
        bpy.ops.object.light_add(type='AREA', location=loc); l = bpy.context.active_object
        l.data.energy = energy; l.data.size = size; l.data.color = lin(color); look(l, target)
    cx = cam_tgt[0]
    area((cx - 3.2, -4.2, 4.6), 620 if not ortho else 1600, 3.5 if not ortho else 9, '#FFF4EA', (cx, 0, 1.2))
    area((cx + 4.2, -3.5, 1.8), 260 if not ortho else 700, 3.0 if not ortho else 8, '#E8E4FF', (cx, 0, 1.2))
    area((cx + 2.5, 4.2, 3.6), 900 if not ortho else 2200, 2.5 if not ortho else 8, '#9A85FF', (cx, 0, 1.2))
    area((cx - 3.5, 3.5, 2.5), 350 if not ortho else 900, 2.0 if not ortho else 6, '#7FE9FF', (cx, 0, 1.2))
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 80; scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.exposure = -0.5
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.get_devices()
        for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try: prefs.compute_device_type = t; break
            except Exception: pass
        for d in prefs.devices: d.use = True
        scene.cycles.device = 'GPU' if any(d.type != 'CPU' for d in prefs.devices) else 'CPU'
    except Exception: scene.cycles.device = 'CPU'
    return cam

def render(path):
    scene.render.filepath = path; bpy.ops.render.render(write_still=True); print('RENDERED', path)

if MODE == 'brain_test':   # three brain styles side by side, close up in the dome
    for i, st in enumerate(('carved', 'carved_dense', 'carved_bold')):
        build(7, 'C', x=(i - 1) * 2.0, style=st)
    studio((2100, 900), (0, -6.5, 3.6), (0, 0, 2.15), lens=50)
    render(os.path.join(OUT, 'brain_test.png'))
elif MODE == 'hero':
    dirn, stage = ARGS[0], int(ARGS[1]); style = ARGS[2] if len(ARGS) > 2 else 'toon'
    build(stage, dirn, pose={'armR': (-0.5, -1.75, 0), 'head': (0, 0.1, 0.12)}, style=style)
    studio((1100, 1200), (2.6, -6.6, 1.8), (0, 0, 1.3))
    render(os.path.join(OUT, f'hero_{dirn}{stage}.png'))
    for o in bpy.data.objects:
        if o.name == 'Screen': pass
    scene.camera.location = (0.0, -6.9, 2.3); look(scene.camera, (0, 0, 1.6)); scene.camera.data.lens = 85
    render(os.path.join(OUT, f'heroface_{dirn}{stage}.png'))
elif MODE == 'final':   # the chosen look: a three-quarter view, a front close-up and a side view
    fcs = ARGS[0].split(',') if ARGS else ['pixel_happy']; sc = ARGS[1] if len(ARGS) > 1 else 'full'; sfx = '_t' if sc not in ('wrap', 'visor') else '_bg'
    build(6, 'N', pose={'head': (0, 0.06, 0.14)}, style='carved_dense', face=f'face_{fcs[0]}.png', screen=sc)
    studio((1000, 1200), (2.6, -6.6, 1.9), (0, 0, 1.3))
    shots = [((2.6, -6.6, 1.9), (0, 0, 1.3), 62), ((0.0, -6.9, 2.0), (0, 0, 1.62), 85), ((-4.6, -4.4, 2.0), (0, 0, 1.3), 62)]
    for i, (cl, ct, ln) in enumerate(shots):
        fc = fcs[min(i, len(fcs) - 1)]
        bpy.data.objects['Screen'].active_material.node_tree.nodes['Image Texture'].image = bpy.data.images.load(os.path.join(DIR, f'face_{fc}{sfx}.png'), check_existing=True)
        scene.camera.location = cl; look(scene.camera, ct); scene.camera.data.lens = ln
        render(os.path.join(OUT, f'final_{i}.png' if sc == 'full' else f'final_{sc}_{i}.png'))
elif MODE == 'power':   # the visor switching on: off (dark glossy glass), then the stages of the power-on
    build(6, 'N', pose={'head': (0, 0.06, 0.14)}, style='carved_dense', face='face_power_off.png', screen='visor')
    studio((1000, 1000), (2.0, -5.0, 2.05), (0, 0, 1.45))
    nt = bpy.data.objects['Screen'].active_material.node_tree; b = nt.nodes['Principled BSDF']
    for k in ARGS[0].split(','):
        nt.nodes['Image Texture'].image = bpy.data.images.load(os.path.join(DIR, f'face_power_{k}_bg.png'), check_existing=True)
        off = k == 'off'   # a switched-off screen is dark glass that catches the light
        b.inputs['Specular IOR Level'].default_value = 0.5 if off else 0.0; b.inputs['Coat Weight'].default_value = 1.0 if off else 0.0
        b.inputs['Roughness'].default_value = 0.08 if off else 0.5; b.inputs['Emission Strength'].default_value = 0.6 if off else 1.5
        nt.links.new(nt.nodes['Image Texture'].outputs['Color'], b.inputs['Base Color']) if off else [nt.links.remove(l) for l in list(b.inputs['Base Color'].links)]
        render(os.path.join(OUT, f'power_{k}.png'))
elif MODE == 'screens':   # head close-up for each screen style
    sc, fc = ARGS[0], (ARGS[1] if len(ARGS) > 1 else 'happy')
    build(6, 'N', pose={'head': (0, 0.06, 0.14)}, style='carved_dense', screen=sc, face=f'face_{fc}.png')
    studio((1000, 1000), (1.8, -4.6, 2.2), (0, 0, 1.45))
    render(os.path.join(OUT, f'top_screen_{sc}.png' if len(ARGS) == 1 else f'top_screen_{sc}_{fc}.png'))
elif MODE == 'tops':   # one Brainer per brain placement, three-quarter view
    top = ARGS[0]
    build(6, 'N', pose={'head': (0, 0.06, 0.14)}, style='carved_dense', top=top)
    studio((900, 1150), (2.3, -5.6, 2.0), (0, 0, 1.25))
    render(os.path.join(OUT, f'top_{top}.png'))
elif MODE == 'sage':   # the sage (stage 10) in each candidate colour, side by side
    opts = [('#4A1C9E', 'gloss'), ('#1B2363', 'gloss+glow'), ('#D5DAE4', 'metal'), ('#EEE6FF', 'pearl'), ('#E3A58E', 'metal')]
    for i, sg in enumerate(opts):
        build(10, 'G', x=(i - 2) * 2.4, style='carved_dense', face='face_pixel_calm.png', sage=sg)
    studio((2600, 820), (2.2, -22, 4.4), (0, 0, 1.42), ortho=12.0)
    render(os.path.join(OUT, 'lineup_sage.png'))
elif MODE == 'stages':   # one picture per stage, the same camera for all so the growth shows (the games' picker and pictures)
    for s in range(1, 11):
        for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
        _, ex, ps = STAGES[s - 1]
        build(s, 'G', style='carved_dense', face=f'face_pixel_{ex}.png', pose=ps)
        studio((640, 640), (1.6, -8.4, 2.4), (0, 0, 1.45), lens=50)
        render(os.path.join(OUT, f'stage_{s}.png'))
elif MODE == 'lineup':
    dirn, row = ARGS[0], int(ARGS[1]); style = ARGS[2] if len(ARGS) > 2 else 'toon'
    stages = range(1, 6) if row == 1 else range(6, 11)
    for i, s in enumerate(stages):
        if dirn == 'G': _, ex, ps = STAGES[s - 1]
        else: ex, ps = ['happy', 'happy', 'wink', 'happy', 'excited', 'happy', 'focus', 'happy', 'wink', 'excited'][s - 1], ({'armR': (-0.4, -1.6, 0)} if s in (5, 10) else {})
        fc = f'face_pixel_{ex}.png'
        build(s, dirn, x=(i - 2) * 2.4, style=style, face=fc, pose=ps)
    studio((2600, 820), (2.2, -22, 4.4), (0, 0, 1.42), ortho=12.0)
    render(os.path.join(OUT, f'lineup_{dirn}{row}.png'))
