# Background drafts: a dedicated backdrop for each Brainer game, 2-3 directions per game, for Tornike to pick from.
# Drafts only: nothing here is wired into a game. Cycles on the GPU, rendered at a desktop and a phone framing.
# usage: blender -b --python bg_drafts.py -- <outdir> <key|all> [samples] [scale]
#   keys: pc-a pc-b pc-c  fr-a fr-b fr-c  ch-a ch-b ch-c  fh-a-1 fh-a-2 fh-a-3  fh-b-1 ... fh-c-3
#   each key writes <key>-desk.webp (1600x900) and <key>-phone.webp (720x1280); scale shrinks both for test runs
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix, noise

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, KEY = os.path.abspath(argv[0]), argv[1]
SAMPLES = int(argv[2]) if len(argv) > 2 else 96
SCALE = float(argv[3]) if len(argv) > 3 else 1.0
os.makedirs(OUT, exist_ok=True)

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)
def lin4(h): return lin(h) + (1,)
def smooth(a, b, x): t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        pr = bpy.context.preferences.addons['cycles'].preferences
        for t in ('OPTIX', 'CUDA'):
            try: pr.compute_device_type = t; break
            except Exception: pass
        pr.get_devices()
        for d in pr.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception as e: print('GPU setup failed', e)
    sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
    sc.cycles.volume_step_rate = 2; sc.cycles.max_bounces = 6; sc.cycles.volume_bounces = 4
    sc.view_settings.view_transform = 'AgX'
    try: sc.view_settings.look = 'AgX - Punchy'
    except Exception: pass
    return sc

# ---------- materials ----------
def mat(name, col, rough=0.8, emit=None, strength=0, metal=0, alpha=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin4(col); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit: b.inputs['Emission Color'].default_value = lin4(emit); b.inputs['Emission Strength'].default_value = strength
    return m

def emit_mat(name, col, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.remove(nt.nodes['Principled BSDF'])
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = lin4(col); e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs[0], nt.nodes['Material Output'].inputs['Surface']); return m

def ground_mat(name, cols, scale=0.004, cells=None, height=None, rough=0.9, detail_cols=None, bump=0.0):
    """cols: noise-blended colours. cells: (scale, colours) voronoi patchwork fields. height: [(z, colour)...] bands by world Z."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    b = N['Principled BSDF']; b.inputs['Roughness'].default_value = rough
    geo = N.new('ShaderNodeNewGeometry')
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 8
    L.new(geo.outputs['Position'], nz.inputs['Vector'])
    r = N.new('ShaderNodeValToRGB'); els = r.color_ramp.elements
    els[0].color = lin4(cols[0]); els[1].color = lin4(cols[-1])
    for i, c in enumerate(cols[1:-1]): e = els.new((i + 1) / (len(cols) - 1)); e.color = lin4(c)
    els[0].position = 0.3; els[-1].position = 0.7
    L.new(nz.outputs['Fac'], r.inputs['Fac']); out = r.outputs['Color']
    if cells:
        vs, vc = cells
        vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = vs; L.new(geo.outputs['Position'], vor.inputs['Vector'])
        sep = N.new('ShaderNodeSeparateColor'); L.new(vor.outputs['Color'], sep.inputs['Color'])
        cr = N.new('ShaderNodeValToRGB'); cr.color_ramp.interpolation = 'CONSTANT'; ce = cr.color_ramp.elements
        ce[0].color = lin4(vc[0]); ce[1].color = lin4(vc[1]); ce[1].position = 1 / len(vc)
        for i, c in enumerate(vc[2:]): e = ce.new((i + 2) / len(vc)); e.color = lin4(c)
        L.new(sep.outputs[0], cr.inputs['Fac'])
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
        L.new(cr.outputs['Color'], mx.inputs[6]); L.new(out, mx.inputs[7])
        gm = N.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.inputs['Factor'].default_value = 0.55
        L.new(cr.outputs['Color'], gm.inputs[6]); L.new(out, gm.inputs[7]); out = gm.outputs[2]
    if height:
        sz = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sz.inputs[0])
        jit = N.new('ShaderNodeMath'); jit.operation = 'MULTIPLY_ADD'; L.new(nz.outputs['Fac'], jit.inputs[0])
        jit.inputs[1].default_value = height[-1][0] * 0.08; L.new(sz.outputs['Z'], jit.inputs[2])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = height[0][0]; mr.inputs['From Max'].default_value = height[-1][0]
        L.new(jit.outputs[0], mr.inputs['Value'])
        hr = N.new('ShaderNodeValToRGB'); he = hr.color_ramp.elements; span = height[-1][0] - height[0][0]
        he[0].color = lin4(height[0][1]); he[1].color = lin4(height[-1][1])
        for z, c in height[1:-1]: e = he.new((z - height[0][0]) / span); e.color = lin4(c)
        if len(height) and height[0][1] == 'GROUND':
            pass
        L.new(mr.outputs['Result'], hr.inputs['Fac'])
        hm = N.new('ShaderNodeMix'); hm.data_type = 'RGBA'; hm.blend_type = 'MULTIPLY'; hm.inputs['Factor'].default_value = 1.0
        L.new(hr.outputs['Color'], hm.inputs[6]); L.new(out, hm.inputs[7]); out = hm.outputs[2]
    if bump:
        bn = N.new('ShaderNodeBump'); bn.inputs['Strength'].default_value = bump
        n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = scale * 60; n2.inputs['Detail'].default_value = 10
        L.new(geo.outputs['Position'], n2.inputs['Vector']); L.new(n2.outputs['Fac'], bn.inputs['Height']); L.new(bn.outputs['Normal'], b.inputs['Normal'])
    L.new(out, b.inputs['Base Color'])
    return m

def water_mat(name, deep='#0b5d78', shallow='#3fd6c8', rough=0.04, absorb=0.08):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = lin4(shallow); b.inputs['Roughness'].default_value = rough
    b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['IOR'].default_value = 1.33
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.6; nz.inputs['Detail'].default_value = 6
    geo = N.new('ShaderNodeNewGeometry'); L.new(geo.outputs['Position'], nz.inputs['Vector'])
    bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.08; L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    va = N.new('ShaderNodeVolumeAbsorption'); va.inputs['Color'].default_value = lin4(deep); va.inputs['Density'].default_value = absorb
    L.new(va.outputs[0], N['Material Output'].inputs['Volume'])
    return m

def opaque_water(name, col, rough=0.08):
    m = mat(name, col, rough); b = m.node_tree.nodes['Principled BSDF']; N, L = m.node_tree.nodes, m.node_tree.links
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.3; geo = N.new('ShaderNodeNewGeometry'); L.new(geo.outputs['Position'], nz.inputs['Vector'])
    bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.05; L.new(nz.outputs['Fac'], bp.inputs['Height']); L.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

def cloud_mat(name, density=3.0, col='#ffffff', scale=1.6, cut=0.42, shape='ball', emit=None, estr=0.0, anis=0.55):
    """A soft cumulus volume. shape 'ball' fades towards the box's edges; 'slab' fades towards its top and bottom only."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links; N.remove(N['Principled BSDF'])
    tc = N.new('ShaderNodeTexCoord')
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 6; nz.inputs['Roughness'].default_value = 0.6
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    if shape == 'ball':
        d = N.new('ShaderNodeVectorMath'); d.operation = 'LENGTH'; L.new(tc.outputs['Object'], d.inputs[0]); dist = d.outputs['Value']
    else:
        sz = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sz.inputs[0])
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(sz.outputs['Z'], ab.inputs[0]); dist = ab.outputs[0]
    f = N.new('ShaderNodeMath'); f.operation = 'MULTIPLY_ADD'; L.new(dist, f.inputs[0])
    f.inputs[1].default_value, f.inputs[2].default_value = (-0.55, 0.55) if shape == 'ball' else (-0.9, 0.2)
    s = N.new('ShaderNodeMath'); s.operation = 'ADD'; L.new(nz.outputs['Fac'], s.inputs[0]); L.new(f.outputs[0], s.inputs[1])
    c = N.new('ShaderNodeMapRange')
    c.inputs['From Min'].default_value, c.inputs['From Max'].default_value = (cut + 0.05, cut + 0.23) if shape == 'ball' else (cut + 0.03, cut + 0.18)
    c.inputs['To Max'].default_value = density; L.new(s.outputs[0], c.inputs['Value'])
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = lin4(col); v.inputs['Anisotropy'].default_value = anis
    L.new(c.outputs['Result'], v.inputs['Density'])
    if emit: v.inputs['Emission Color'].default_value = lin4(emit); v.inputs['Emission Strength'].default_value = estr
    L.new(v.outputs[0], N['Material Output'].inputs['Volume'])
    return m

def fog_mat(name, density, col='#ffffff', top=1.0):
    """Ground fog: dense at the box's bottom, gone at its top."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links; N.remove(N['Principled BSDF'])
    tc = N.new('ShaderNodeTexCoord'); sz = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sz.inputs[0])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1; mr.inputs['From Max'].default_value = top
    mr.inputs['To Min'].default_value = 1; mr.inputs['To Max'].default_value = 0; L.new(sz.outputs['Z'], mr.inputs['Value'])
    p = N.new('ShaderNodeMath'); p.operation = 'POWER'; L.new(mr.outputs['Result'], p.inputs[0]); p.inputs[1].default_value = 2.2
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3; L.new(tc.outputs['Object'], nz.inputs['Vector'])
    mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; L.new(p.outputs[0], mm.inputs[0]); L.new(nz.outputs['Fac'], mm.inputs[1])
    m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; L.new(mm.outputs[0], m2.inputs[0]); m2.inputs[1].default_value = density * 2
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = lin4(col); L.new(m2.outputs[0], v.inputs['Density'])
    L.new(v.outputs[0], N['Material Output'].inputs['Volume']); return m

def window_mat(name, lit='#ffd27a', strength=6, wall='#20243a', bias=-0.55, w=3.2, h=3.6):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links
    b = N['Principled BSDF']; b.inputs['Base Color'].default_value = lin4(wall); b.inputs['Roughness'].default_value = 0.6
    geo = N.new('ShaderNodeNewGeometry'); sp = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sp.inputs[0])
    ad = N.new('ShaderNodeMath'); ad.operation = 'ADD'; L.new(sp.outputs['X'], ad.inputs[0]); L.new(sp.outputs['Y'], ad.inputs[1])
    cb = N.new('ShaderNodeCombineXYZ'); L.new(ad.outputs[0], cb.inputs['X']); L.new(sp.outputs['Z'], cb.inputs['Y'])
    br = N.new('ShaderNodeTexBrick'); br.offset = 0; br.squash = 1
    br.inputs['Color1'].default_value = lin4(lit); br.inputs['Color2'].default_value = (0.004, 0.004, 0.006, 1); br.inputs['Mortar'].default_value = (0, 0, 0, 1)
    br.inputs['Scale'].default_value = 1; br.inputs['Mortar Size'].default_value = 0.9; br.inputs['Bias'].default_value = bias
    br.inputs['Brick Width'].default_value = w; br.inputs['Row Height'].default_value = h
    L.new(cb.outputs[0], br.inputs['Vector'])
    pn = N.new('ShaderNodeTexNoise'); pn.inputs['Scale'].default_value = 0.015; L.new(geo.outputs['Position'], pn.inputs['Vector'])
    pm = N.new('ShaderNodeMapRange'); pm.inputs['From Min'].default_value = 0.47; pm.inputs['From Max'].default_value = 0.53; L.new(pn.outputs['Fac'], pm.inputs['Value'])
    mk = N.new('ShaderNodeMix'); mk.data_type = 'RGBA'; mk.blend_type = 'MULTIPLY'; L.new(pm.outputs['Result'], mk.inputs['Factor'])
    L.new(br.outputs['Color'], mk.inputs[6]); mk.inputs[7].default_value = (0.02, 0.02, 0.03, 1)   # whole floors and blocks dark, others lit
    L.new(mk.outputs[2], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = strength
    return m

# ---------- objects ----------
def link(o): bpy.context.scene.collection.objects.link(o); return o

def terrain(name, H, size, n, m, cx=0.0, cy=0.0, sx=None):
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    for v in bm.verts:
        v.co.x += cx; v.co.y += cy; v.co.z = H(v.co.x, v.co.y)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = link(bpy.data.objects.new(name, me)); o.data.materials.append(m); return o

def prim(kind, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), m=None, **kw):
    getattr(bpy.ops.mesh, 'primitive_' + kind + '_add')(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object; o.scale = scale
    if m: o.data.materials.append(m)
    if kind in ('uv_sphere', 'ico_sphere', 'cylinder', 'cone', 'torus'):
        for p in o.data.polygons: p.use_smooth = True
    return o

def volume_box(name, loc, size, m, rot=(0, 0, 0)):
    o = prim('cube', loc, (size[0] / 2, size[1] / 2, size[2] / 2), rot, m); o.name = name; return o

def cloud(loc, size, m): return volume_box('Cloud', loc, size, m)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); o = objs[0]; o.name = name; return o

def hide(o): o.location = (0, 0, -99999); o.hide_render = False; return o

def scatter(target, inst, count, size, rnd_size=0.4, weight=None, seed=1, name='Scatter'):
    """Hair-particle instances of inst over target; weight(x, y, z) in 0..1 sets where they may grow."""
    if weight:
        vg = target.vertex_groups.new(name=name); buckets = {}
        for v in target.data.vertices:
            w = round(max(0.0, min(1.0, weight(v.co.x + target.location.x, v.co.y + target.location.y, v.co.z))) * 10) / 10
            if w > 0: buckets.setdefault(w, []).append(v.index)
        for w, ids in buckets.items(): vg.add(ids, w, 'REPLACE')
    if not inst.get('upx'):   # hair instances point their X axis along the hair (here global Z), so stand the tree up along X
        up = inst.copy(); up.data = inst.data.copy(); up.data.transform(Matrix.Rotation(math.radians(90), 4, 'Y')); up['upx'] = 1
        bpy.context.scene.collection.objects.link(up); inst = up
    mod = target.modifiers.new(name, 'PARTICLE_SYSTEM'); ps = mod.particle_system; st = ps.settings
    st.type = 'HAIR'; st.count = count; st.hair_length = 1; st.render_type = 'OBJECT'; st.instance_object = inst
    st.particle_size = size; st.size_random = rnd_size; st.use_advanced_hair = True; st.use_rotations = True
    st.rotation_mode = 'GLOB_Z'; st.phase_factor_random = 2.0; st.use_emit_random = True; st.distribution = 'RAND'
    ps.seed = seed
    if weight: ps.vertex_group_density = name
    return mod

def tree_obj(name, leaf, trunk, kind='round'):
    parts = []
    if kind == 'pine':
        for i, (z, r) in enumerate(((1.6, 1.5), (2.8, 1.15), (3.9, 0.8))):
            parts.append(prim('cone', (0, 0, z), (1, 1, 1), m=leaf, radius1=r, radius2=0.05, depth=2.0, vertices=10))
        parts.append(prim('cylinder', (0, 0, 0.5), m=trunk, radius=0.16, depth=1.2, vertices=8))
    elif kind == 'palm':
        parts.append(prim('cylinder', (0.3, 0, 2.2), (1, 1, 1), (0, 0.18, 0), trunk, radius=0.14, depth=4.6, vertices=8))
        for a in range(7):
            ang = a / 7 * 2 * math.pi
            parts.append(prim('cube', (0.75 + 1.1 * math.cos(ang), 1.1 * math.sin(ang), 4.35), (1.2, 0.28, 0.03), (0, 0.45, ang), leaf))
    else:
        for (dx, dy, dz, r) in ((0, 0, 2.6, 1.4), (0.8, 0.3, 2.2, 1.0), (-0.7, -0.2, 2.3, 1.05), (0.1, 0.2, 3.4, 0.9)):
            parts.append(prim('ico_sphere', (dx, dy, dz), (1, 1, 1), m=leaf, radius=r, subdivisions=2))
        parts.append(prim('cylinder', (0, 0, 0.8), m=trunk, radius=0.18, depth=1.8, vertices=8))
    o = join(parts, name)
    for p in o.data.polygons: p.use_smooth = True
    return hide(o)

def rock_mat(name, cols=('#7d6a5c', '#a08a76', '#5f5048'), scale=0.4):
    return ground_mat(name, list(cols), scale=scale, rough=0.95, bump=0.4)

def island(loc, r, top_m, rock_m, seed, depth=None):
    """A floating island: a lumpy grass top and a rocky cone hanging under it."""
    rr = random.Random(seed); depth = depth or r * 1.1
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=r, radius2=r * 0.08, depth=depth)
    for v in bm.verts:
        v.co.z = -v.co.z - depth / 2   # point down, top at 0
        k = 1 + 0.25 * noise.noise(Vector((v.co.x / r * 1.7 + seed, v.co.y / r * 1.7, v.co.z / r)))
        v.co.x *= k; v.co.y *= k
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    for v in bm.verts:
        if v.co.z < -0.05: v.co += Vector((noise.noise(v.co * (1.3 / r) + Vector((seed, 0, 0))), noise.noise(v.co * (1.3 / r) + Vector((0, seed, 0))), 0)) * r * 0.18
    me = bpy.data.meshes.new('Isle'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = link(bpy.data.objects.new('Isle', me)); o.location = loc; o.data.materials.append(rock_m)
    t = terrain('IsleTop', lambda x, y: 0.0, 2 * r * 1.25, 60, top_m)
    keep = []
    for v in t.data.vertices:
        d = math.hypot(v.co.x, v.co.y) / (r * 1.05)
        v.co.z = (1 - d * d) * r * 0.12 + noise.noise(Vector((v.co.x / r * 3, v.co.y / r * 3, seed))) * r * 0.04 if d < 1 else -r
    bm = bmesh.new(); bm.from_mesh(t.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if any(v.co.z <= -r * 0.5 for v in f.verts)], context='FACES')
    bm.to_mesh(t.data); bm.free(); t.location = loc
    return o, t

# ---------- sky, stars, sun ----------
def sky(sun_el, sun_rot, strength=0.6, dust=0.5, air=1.0, ozone=1.0, alt=300, stars=0.0, tint=None, disc=True, sun_int=0.6):
    sc = bpy.context.scene; w = bpy.data.worlds.new('Sky'); sc.world = w; w.use_nodes = True; nt = w.node_tree; N, L = nt.nodes, nt.links
    bg = N['Background']; s = N.new('ShaderNodeTexSky')
    for t in ('MULTIPLE_SCATTERING', 'NISHITA'):
        try: s.sky_type = t; break
        except Exception: pass
    for k, v in (('sun_elevation', math.radians(sun_el)), ('sun_rotation', math.radians(sun_rot)), ('altitude', alt), ('air_density', air),
                 ('dust_density', dust), ('ozone_density', ozone), ('sun_intensity', sun_int), ('sun_disc', disc)):
        if hasattr(s, k):
            try: setattr(s, k, v)
            except Exception as e: print('sky', k, e)
    col = s.outputs['Color']
    if tint:
        mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
        L.new(col, mx.inputs[6]); mx.inputs[7].default_value = lin4(tint); col = mx.outputs[2]
    if stars:
        tc = N.new('ShaderNodeTexCoord'); vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 520
        L.new(tc.outputs['Generated'], vo.inputs['Vector'])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.05; mr.inputs['From Max'].default_value = 0.0
        mr.inputs['To Max'].default_value = stars; L.new(vo.outputs['Distance'], mr.inputs['Value'])
        nz = N.new('ShaderNodeTexWhiteNoise'); L.new(tc.outputs['Generated'], nz.inputs['Vector'])
        vo2 = N.new('ShaderNodeTexVoronoi'); vo2.inputs['Scale'].default_value = 520; L.new(tc.outputs['Generated'], vo2.inputs['Vector'])
        gate = N.new('ShaderNodeMath'); gate.operation = 'GREATER_THAN'; L.new(vo.outputs['Color'], gate.inputs[0]); gate.inputs[1].default_value = 0.55
        st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; L.new(mr.outputs['Result'], st.inputs[0]); L.new(gate.outputs[0], st.inputs[1])
        ad = N.new('ShaderNodeMix'); ad.data_type = 'RGBA'; ad.blend_type = 'ADD'; ad.inputs['Factor'].default_value = 1
        L.new(col, ad.inputs[6]); sv = N.new('ShaderNodeCombineColor'); L.new(st.outputs[0], sv.inputs[0]); L.new(st.outputs[0], sv.inputs[1]); L.new(st.outputs[0], sv.inputs[2])
        L.new(sv.outputs[0], ad.inputs[7]); col = ad.outputs[2]
    L.new(col, bg.inputs['Color']); bg.inputs['Strength'].default_value = strength
    return w

def space_world(stars=6.0, glow=None, glow_str=0.0):
    sc = bpy.context.scene; w = bpy.data.worlds.new('Space'); sc.world = w; w.use_nodes = True; nt = w.node_tree; N, L = nt.nodes, nt.links
    tc = N.new('ShaderNodeTexCoord')
    vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 420; L.new(tc.outputs['Generated'], vo.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.07; mr.inputs['From Max'].default_value = 0.0; mr.inputs['To Max'].default_value = stars
    L.new(vo.outputs['Distance'], mr.inputs['Value'])
    gate = N.new('ShaderNodeMath'); gate.operation = 'GREATER_THAN'; L.new(vo.outputs['Color'], gate.inputs[0]); gate.inputs[1].default_value = 0.45
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; L.new(mr.outputs['Result'], st.inputs[0]); L.new(gate.outputs[0], st.inputs[1])
    neb = N.new('ShaderNodeTexNoise'); neb.inputs['Scale'].default_value = 2.2; neb.inputs['Detail'].default_value = 6; L.new(tc.outputs['Generated'], neb.inputs['Vector'])
    nr = N.new('ShaderNodeValToRGB'); ne = nr.color_ramp.elements; ne[0].position = 0.5; ne[0].color = (0.0005, 0.0006, 0.002, 1)
    ne[1].color = lin4(glow or '#1a1250'); L.new(neb.outputs['Fac'], nr.inputs['Fac'])
    ad = N.new('ShaderNodeMath'); ad.operation = 'ADD'
    ab = N.new('ShaderNodeMix'); ab.data_type = 'RGBA'; ab.blend_type = 'ADD'; ab.inputs['Factor'].default_value = 1
    L.new(nr.outputs['Color'], ab.inputs[6]); cc = N.new('ShaderNodeCombineColor')
    for i in range(3): L.new(st.outputs[0], cc.inputs[i])
    L.new(cc.outputs[0], ab.inputs[7]); L.new(ab.outputs[2], N['Background'].inputs['Color']); N['Background'].inputs['Strength'].default_value = 1
    return w

def sun(el, rot, energy=4, col=(1, 0.92, 0.8), angle=1.5):
    bpy.ops.object.light_add(type='SUN'); s = bpy.context.active_object
    s.data.energy = energy; s.data.color = col; s.data.angle = math.radians(angle)
    s.rotation_euler = (math.radians(90 - el), 0, math.radians(rot + 180)); return s

def point(loc, col, energy, r=0.2):
    bpy.ops.object.light_add(type='POINT', location=loc); l = bpy.context.active_object
    l.data.energy = energy; l.data.color = lin(col); l.data.shadow_soft_size = r; return l

# ---------- camera and rendering ----------
def camera(loc, target, desk_fov, phone_fov, roll=0.0):
    d = bpy.data.cameras.new('Cam'); c = link(bpy.data.objects.new('Cam', d)); c.location = loc
    v = Vector(target) - Vector(loc); q = v.to_track_quat('-Z', 'Y'); c.rotation_euler = q.to_euler()
    c.rotation_euler.rotate_axis('Z', math.radians(roll)) if roll else None
    d.clip_start = 0.1; d.clip_end = 200000; d.sensor_fit = 'AUTO'
    bpy.context.scene.camera = c; c['fov'] = (desk_fov, phone_fov); return c

def render(key, exposure=0.0, shift=(0.0, 0.0, 0.0)):
    sc = bpy.context.scene; c = sc.camera; sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 82
    for tag, (w, h), fov, sy in (('desk', (1600, 900), c['fov'][0], shift[0]), ('phone', (720, 1280), c['fov'][1], shift[1])):
        sc.render.resolution_x, sc.render.resolution_y = int(w * SCALE), int(h * SCALE); sc.render.resolution_percentage = 100
        c.data.angle = math.radians(fov); c.data.shift_y = sy
        sc.render.filepath = os.path.join(OUT, f'{key}-{tag}.webp')
        bpy.ops.render.render(write_still=True); print('WROTE', sc.render.filepath)

def cumulus(loc, w, h, m, seed=0):
    """A heaped cloud: a few overlapping puffs, wider at the base, rising to a dome."""
    rr = random.Random(seed); x, y, z = loc
    for k in range(4):
        s = w * (1 - k * 0.18); cloud((x + rr.uniform(-0.25, 0.25) * w, y + rr.uniform(-0.2, 0.2) * w, z + k * h * 0.28), (s, s * 0.9, h * 0.6), m)

def earth_mat(ocean, land, cloud_col='#ffffff', lights=None, scale=0.0016):
    m = bpy.data.materials.new('Earth'); m.use_nodes = True; nt = m.node_tree; N, L = nt.nodes, nt.links; b = N['Principled BSDF']
    geo = N.new('ShaderNodeNewGeometry')
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = 10; L.new(geo.outputs['Position'], nz.inputs['Vector'])
    r = N.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'LINEAR'; e = r.color_ramp.elements
    e[0].color = lin4(ocean[0]); e[0].position = 0.45; e[1].color = lin4(land[-1]); e[1].position = 0.62
    x = e.new(0.5); x.color = lin4(ocean[1]); x = e.new(0.52); x.color = lin4(land[0])
    L.new(nz.outputs['Fac'], r.inputs['Fac'])
    cz = N.new('ShaderNodeTexNoise'); cz.inputs['Scale'].default_value = scale * 3; cz.inputs['Detail'].default_value = 8; cz.inputs['Distortion'].default_value = 1.5
    L.new(geo.outputs['Position'], cz.inputs['Vector'])
    cm = N.new('ShaderNodeMapRange'); cm.inputs['From Min'].default_value = 0.6; cm.inputs['From Max'].default_value = 0.72; L.new(cz.outputs['Fac'], cm.inputs['Value'])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; L.new(cm.outputs['Result'], mx.inputs['Factor']); L.new(r.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = lin4(cloud_col)
    L.new(mx.outputs[2], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.7
    if lights:
        vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = scale * 6; L.new(geo.outputs['Position'], vo.inputs['Vector'])
        lm = N.new('ShaderNodeMapRange'); lm.inputs['From Min'].default_value = 0.3; lm.inputs['From Max'].default_value = 0.0; lm.inputs['To Max'].default_value = 60; L.new(vo.outputs['Distance'], lm.inputs['Value'])
        land_only = N.new('ShaderNodeMapRange'); land_only.inputs['From Min'].default_value = 0.5; land_only.inputs['From Max'].default_value = 0.53; L.new(nz.outputs['Fac'], land_only.inputs['Value'])
        mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; L.new(lm.outputs['Result'], mm.inputs[0]); L.new(land_only.outputs['Result'], mm.inputs[1])
        b.inputs['Emission Color'].default_value = lin4(lights); L.new(mm.outputs[0], b.inputs['Emission Strength'])
    return m

def aurora_mat(col='#57ffb4', strength=0.0004, col2='#9a6bff'):
    """Curtains of light: wavy bands, fading out at the box's sides, bottom-heavy."""
    m = bpy.data.materials.new('Aurora'); m.use_nodes = True; N, L = m.node_tree.nodes, m.node_tree.links; N.remove(N['Principled BSDF'])
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['Object'], sp.inputs[0])
    wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'X'
    wv.inputs['Scale'].default_value = 1.6; wv.inputs['Distortion'].default_value = 9; wv.inputs['Detail'].default_value = 4
    L.new(tc.outputs['Object'], wv.inputs['Vector'])
    def fade(sock, a, b):
        ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; L.new(sock, ab.inputs[0])
        mr = N.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = a; mr.inputs['From Max'].default_value = b; L.new(ab.outputs[0], mr.inputs['Value']); return mr.outputs['Result']
    fx = fade(sp.outputs['X'], 1.0, 0.4); fy = fade(sp.outputs['Y'], 1.0, 0.1)
    fz = N.new('ShaderNodeMapRange'); fz.inputs['From Min'].default_value = 1; fz.inputs['From Max'].default_value = -0.5; L.new(sp.outputs['Z'], fz.inputs['Value'])
    fb = N.new('ShaderNodeMapRange'); fb.inputs['From Min'].default_value = -1; fb.inputs['From Max'].default_value = -0.5; L.new(sp.outputs['Z'], fb.inputs['Value'])
    p = N.new('ShaderNodeMath'); p.operation = 'POWER'; L.new(wv.outputs['Fac'], p.inputs[0]); p.inputs[1].default_value = 3
    acc = p.outputs[0]
    for f in (fx, fy, fz.outputs['Result'], fb.outputs['Result']):
        mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; L.new(acc, mm.inputs[0]); L.new(f, mm.inputs[1]); acc = mm.outputs[0]
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; L.new(acc, st.inputs[0]); st.inputs[1].default_value = strength
    cr = N.new('ShaderNodeMix'); cr.data_type = 'RGBA'; L.new(fz.outputs['Result'], cr.inputs['Factor']); cr.inputs[6].default_value = lin4(col2); cr.inputs[7].default_value = lin4(col)
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Density'].default_value = 0; L.new(cr.outputs[2], v.inputs['Emission Color'])
    L.new(st.outputs[0], v.inputs['Emission Strength']); L.new(v.outputs[0], N['Material Output'].inputs['Volume']); return m

def look_at(cam_loc, target):
    return cam_loc, target

# ============================================================================================================
# PLANE CRASH: the plane flies forward over the land; the scene scrolls under it. Low, wide, a clear horizon.
# ============================================================================================================
def pc_a():   # Golden river valley: late sun ahead, patchwork farms, a river catching the light
    reset(); sky(5, 12, strength=0.45, dust=2.2, sun_int=0.5); sun(5, 12, 4.0, (1, 0.62, 0.36))
    def river(x, y): return 140 * math.sin(y / 520) + 60 * math.sin(y / 170 + 1)
    def H(x, y):
        d = abs(x - river(x, y)); z = 26 * noise.fractal(Vector((x / 900, y / 900, 0.2)), 0.5, 2.1, 5) + 6
        z += 260 * smooth(1200, 3400, abs(x)) * (0.6 + 0.4 * noise.noise(Vector((x / 1600, y / 1600, 3))))
        return z * smooth(18, 90, d) - 4 * (1 - smooth(18, 32, d))
    g = ground_mat('Farm', ['#3f6a26', '#6a9038', '#87973c'], 0.002, cells=(0.0045, ['#5d8a2e', '#c39a3a', '#7da23a', '#d2a850', '#4a7326', '#a8a442', '#96b04a']), bump=0.2)
    land = terrain('Land', H, 9000, 560, g, cy=3800)
    prim('plane', (0, 3800, 0), (4500, 4500, 1), m=opaque_water('River', '#9fb8c8', 0.02))
    leaf = mat('Leaf', '#355e22', 0.85); bark = mat('Bark', '#5a4330')
    t = tree_obj('Tree', leaf, bark)
    scatter(land, t, 14000, 4.0, weight=lambda x, y, z: smooth(0.6, 0.68, noise.noise(Vector((x / 260, y / 260, 5))) * 0.5 + 0.5) * smooth(4, 10, z), seed=3)
    cm = cloud_mat('Cu', 0.008, '#fff4ea', 1.6, 0.42)
    for i in range(16):
        rr = random.Random(i); cumulus((rr.uniform(-2800, 2800), 2200 + i * 380, 650), rr.uniform(420, 700), rr.uniform(300, 480), cm, i)
    camera((0, -40, 130), (0, 1200, 30), 70, 84); render('pc-a', -0.4, (0.0, 0.08))

def pc_b():   # Cloud canyon: high up, flying a corridor between towering cumulus over a cloud floor
    reset(); sky(30, 20, strength=0.5, dust=0.15, alt=2500, sun_int=0.6); sun(30, 20, 4.4, (1, 0.95, 0.88))
    volume_box('Sea', (0, 6000, -300), (30000, 26000, 360), cloud_mat('Floor', 0.025, '#ffffff', 60, 0.42, 'slab'))
    rr = random.Random(4); cm = cloud_mat('Tower', 0.02, '#ffffff', 1.6, 0.42)
    for i in range(22):
        side = -1 if i % 2 else 1; y = 700 + i * 420 + rr.uniform(-120, 120)
        x = side * (520 + rr.uniform(0, 600) + y * 0.15); w = rr.uniform(450, 750)
        for k in range(int(rr.uniform(3, 5))):
            s = w * (1 - k * 0.15); cloud((x + rr.uniform(-80, 80), y + rr.uniform(-80, 80), -250 + k * w * 0.42), (s, s, s * 0.8), cm)
    camera((0, -200, 140), (0, 2000, 200), 72, 84); render('pc-b', -0.8, (0.0, 0.0))

def pc_c():   # Turquoise coast: sea cliffs, a white beach and shallow lagoon water, seen from higher up
    reset(); sky(34, 100, strength=0.5, dust=0.25, sun_int=0.6); sun(34, 100, 4.4, (1, 0.95, 0.86))
    def coast(y): return 220 * math.sin(y / 600) + 120 * math.sin(y / 230 + 2) + 0.25 * y - 300
    def H(x, y):
        d = x - coast(y)
        cliff = 70 * smooth(0, 30, d) + 110 * noise.fractal(Vector((x / 700, y / 700, 1.4)), 0.5, 2.1, 4) * smooth(30, 500, d)
        sea = -16 * (1 - smooth(-300, -15, d)) - 2.0
        return max(cliff, 0) + sea + 2 * noise.noise(Vector((x / 50, y / 50, 0)))
    g = ground_mat('Coast', ['#557f30', '#6f9440', '#7f9a48'], 0.003,
                   height=[(-18, '#cdb994'), (-3, '#efe0bd'), (1.5, '#f6e9c8'), (4, '#d8ccb0'), (8, '#ffffff'), (80, '#ffffff')], bump=0.3)
    land = terrain('Coast', H, 9000, 600, g, cx=600, cy=3400)
    prim('plane', (0, 3400, 0), (6000, 6000, 1), m=water_mat('Sea', '#05607f', '#5fe3d6', 0.02, 0.045))
    leaf = mat('Pine', '#2f5424', 0.85); bark = mat('Bark', '#5a4330')
    scatter(land, tree_obj('Pine', leaf, bark, 'pine'), 16000, 4.0, weight=lambda x, y, z: smooth(70, 80, z) * smooth(0.45, 0.6, noise.noise(Vector((x / 300, y / 300, 2))) * 0.5 + 0.5), seed=5)
    isle_rock = rock_mat('IsleRock', ('#6f6252', '#a09078', '#5a4e42'))
    for (x, y, r) in ((-700, 1500, 90), (-1100, 2600, 160), (-300, 3200, 70)):
        prim('ico_sphere', (x, y, -r * 0.55), (1, 1, 0.6), m=isle_rock, radius=r, subdivisions=4)
    cm = cloud_mat('Cu', 0.02, '#ffffff', 1.6, 0.42)
    for i in range(12):
        rr = random.Random(i + 20); cumulus((rr.uniform(-3000, 3000), 1800 + i * 520, 950), rr.uniform(400, 700), 380, cm, i)
    camera((-120, -300, 420), (60, 1300, 0), 70, 84); render('pc-c', -0.3, (0.0, 0.06))

# ============================================================================================================
# FOGRUSH: the board sits low in the frame under the Brainer; the backdrop is the world round the board.
# The camera looks down at the board like the live game, so the sky shows only at the top (more on phones).
# ============================================================================================================
def board(m_tile, m_gap, n=7, pitch=2.7, fog_m=None, z=0.0):
    """A placeholder FogRush board: tiles round the Brainer's plot, fog puffs on the unexplored ones."""
    prim('cylinder', (0, 0, z - 0.6), (1, 1, 1), m=m_gap, radius=n * pitch * 0.72, depth=1.0, vertices=64)
    for i in range(n):
        for j in range(n):
            x, y = (i - n // 2) * pitch, (j - n // 2) * pitch
            if math.hypot(x, y) > n * pitch * 0.62: continue
            t = prim('cube', (x, y, z), (pitch * 0.44, pitch * 0.44, 0.18), m=m_tile); bev = t.modifiers.new('B', 'BEVEL'); bev.width = 0.18; bev.segments = 3
            if fog_m and (abs(i - n // 2) > 1 or abs(j - n // 2) > 1):
                cloud((x, y, z + 0.8), (pitch * 1.2, pitch * 1.2, 1.4), fog_m)

FR_CAM = ((0, -30, 18), (0, 22, 4))

def fr_a():   # Sky islands: the board on a floating island, more islands drifting over a sea of cloud
    reset(); sky(40, 200, strength=0.35, dust=0.2, air=1.6, alt=1500, sun_int=0.6); sun(40, 200, 4.4, (1, 0.93, 0.8))
    grass = ground_mat('IsleGrass', ['#4e9a32', '#68b040', '#7cbc48'], 0.08, bump=0.2); rock = rock_mat('IsleRock', ('#6a5444', '#8f7660', '#4e3e34'), 0.12)
    island((0, 0, -3.3), 24, grass, rock, 1, 26)
    board(mat('Tile', '#79c84f', 0.7), mat('Path', '#cdb98a', 0.9), fog_m=cloud_mat('Fog', 2.0, '#ffffff', 1.4, 0.4))
    tops = []
    for k, (x, y, z, r) in enumerate(((-120, 160, -40, 24), (140, 240, -10, 32), (-70, 460, 30, 46), (300, 560, -20, 42), (-340, 420, 10, 36), (60, 950, 60, 80), (-600, 900, -30, 60))):
        tops.append(island((x, y, z), r, grass, rock, k + 2)[1])
    volume_box('Sea', (0, 3000, -170), (12000, 12000, 120), cloud_mat('Sea', 0.03, '#f4f0ff', 50, 0.42, 'slab'))
    sea = cloud_mat('SeaPuff', 0.02, '#ffffff', 1.6, 0.42); rq = random.Random(12)
    for i in range(22): cumulus((rq.uniform(-1400, 1400), rq.uniform(200, 2600), -150), rq.uniform(140, 320), 120, sea, i)
    leaf = mat('Leaf', '#2f6a24', 0.85); bark = mat('Bark', '#5a4330'); t = tree_obj('Tree', leaf, bark)
    for i, o in enumerate(tops): scatter(o, t, 40, max(1.6, o.dimensions.x / 22), seed=i)
    cm = cloud_mat('Cu', 0.03, '#ffffff', 1.6, 0.42)
    for i in range(8):
        rr = random.Random(i + 3); cumulus((rr.uniform(-900, 900), rr.uniform(500, 1600), rr.uniform(40, 160)), rr.uniform(80, 160), 90, cm, i)
    camera(*FR_CAM, 62, 80); render('fr-a', -0.5, (0.12, 0.08))

def fr_b():   # Misty pine valley at dawn: layered forested ridges fading into pink mist
    reset(); sky(9, 50, strength=0.5, dust=1.4, sun_int=0.5); sun(9, 50, 4.0, (1, 0.7, 0.56))
    g = ground_mat('Moss', ['#3d6a35', '#55803f', '#6b904c'], 0.01, bump=0.2)
    def H(x, y):
        r = math.hypot(x, y); ridge = 0
        for k in range(6):
            ridge = max(ridge, (16 + 34 * k) * smooth(0.0, 1.0, 1 - abs(y - (220 + 230 * k + 60 * math.sin(x / (90 + k * 40) + k))) / 170))
        return ridge * (0.75 + 0.25 * noise.noise(Vector((x / 80, y / 80, 2)))) * smooth(30, 80, r) + 0.6 * noise.noise(Vector((x / 9, y / 9, 1)))
    land = terrain('Valley', H, 2600, 480, g, cy=900)
    leaf = mat('Pine', '#244a2a', 0.85); bark = mat('Bark', '#4a3626')
    scatter(land, tree_obj('Pine', leaf, bark, 'pine'), 60000, 2.4, weight=lambda x, y, z: smooth(45, 80, math.hypot(x, y)), seed=8)
    board(mat('Tile', '#6aa646', 0.7), mat('Path', '#9b8466', 0.9), fog_m=cloud_mat('Fog', 2.0, '#ffffff', 1.4, 0.4))
    volume_box('Mist', (0, 1100, 40), (3200, 2200, 200), fog_mat('Mist', 0.0025, '#ffe2ea', 0.0))   # mist pooling between the ridges
    camera((0, -30, 18), (0, 30, 9), 62, 80); render('fr-b', 0.0, (0.12, 0.08))

def fr_c():   # Lantern night: a moonlit valley, blue fog, warm lanterns on posts round the board
    reset(); sky(-8, 200, strength=1.4, dust=0.3, sun_int=0.1, stars=2.5, tint='#4a5cff', disc=False)
    sun(25, 200, 2.0, (0.6, 0.7, 1.0), 0.6)   # the moon's light
    prim('uv_sphere', (-520, 2600, 330), (1, 1, 1), m=emit_mat('Moon', '#eef2ff', 5), radius=70)
    g = ground_mat('NightGrass', ['#2c5a44', '#3a6a4e', '#4a7a58'], 0.02, bump=0.2)
    def H(x, y):
        r = math.hypot(x, y); return 160 * smooth(120, 1000, r) * (0.5 + 0.5 * noise.noise(Vector((x / 500, y / 500, 4)))) + 18 * noise.fractal(Vector((x / 200, y / 200, 1)), 0.5, 2, 4) * smooth(40, 120, r)
    land = terrain('Valley', H, 4000, 400, g, cy=1200)
    leaf = mat('Pine', '#1d3b30', 0.85); bark = mat('Bark', '#2c2420')
    scatter(land, tree_obj('Pine', leaf, bark, 'pine'), 16000, 3.4, weight=lambda x, y, z: smooth(50, 100, math.hypot(x, y)), seed=4)
    board(mat('Tile', '#4f8a5a', 0.7), mat('Path', '#6c6152', 0.9), fog_m=cloud_mat('Fog', 2.2, '#c8d4ff', 1.4, 0.4))
    post = mat('Post', '#3a2d22', 0.8); glow = emit_mat('Lantern', '#ffb35c', 30)
    for k in range(10):
        a = k / 10 * 2 * math.pi + 0.3; x, y = math.cos(a) * 14, math.sin(a) * 14
        prim('cylinder', (x, y, 1.0), m=post, radius=0.08, depth=2.4, vertices=8); prim('cube', (x, y, 2.35), (0.22, 0.22, 0.3), m=glow)
        point((x, y, 2.3), '#ffb35c', 220, 0.3)
    rr = random.Random(1)
    for k in range(60):   # far-off windows and lanterns across the valley
        a = rr.uniform(0.3, math.pi - 0.3); d = rr.uniform(120, 1600); x, y = math.cos(a) * d, math.sin(a) * d
        prim('cube', (x, y, H(x, y) + 1.5), (0.6, 0.6, 0.7), m=glow)
    volume_box('Mist', (0, 1200, 15), (4200, 4200, 70), fog_mat('Mist', 0.004, '#a8b8ff', 0.3))
    camera(*FR_CAM, 62, 80); render('fr-c', 1.0, (0.12, 0.08))

# ============================================================================================================
# CHARGE: the station sits low and centred; the backdrop frames it. Placeholder pad and coils stand in for set.webp.
# ============================================================================================================
def station(z=0.0, paving='#bdb8ae'):
    prim('cylinder', (0, 0, z + 0.15), m=mat('Paving', paving, 0.85), radius=5.2, depth=0.3, vertices=64)
    white = mat('White', '#f3f4f8', 0.35); cyan = emit_mat('Cyan', '#6fe8ff', 8); violet = emit_mat('Violet', '#6d5cff', 6)
    prim('cylinder', (0, 0, z + 0.42), m=white, radius=1.9, depth=0.25, vertices=64)
    prim('torus', (0, 0, z + 0.56), m=cyan, major_radius=1.3, minor_radius=0.05)
    prim('torus', (0, 0, z + 0.34), m=violet, major_radius=1.93, minor_radius=0.05)
    for sx in (-3.4, 3.4):
        prim('cube', (sx, 0.4, z + 0.6), (0.55, 0.55, 0.3), m=white)
        prim('cylinder', (sx, 0.4, z + 2.6), m=white, radius=0.3, depth=4.0, vertices=32)
        for k in range(5): prim('torus', (sx, 0.4, z + 1.1 + k * 0.62), m=cyan, major_radius=0.36, minor_radius=0.045)
        prim('torus', (sx, 0.4, z + 4.75), m=mat('Glass', '#dfe8ef', 0.05, metal=0.6), major_radius=0.6, minor_radius=0.22)

CH_CAM = ((0, -12.5, 3.0), (0, 0, 2.4))

def ch_a():   # Summit at golden hour: the pad on a rocky peak, a sea of cloud below, peaks catching the last sun
    reset(); sky(4, 30, strength=0.45, dust=1.8, alt=2500, sun_int=0.5); sun(4, 30, 4.0, (1, 0.62, 0.36))
    rock = rock_mat('Summit', ('#5e4c42', '#86705f', '#40342e'), 0.25)
    def H(x, y):
        r = math.hypot(x, y); return -0.25 * max(r - 6, 0) - 0.002 * max(r - 6, 0) ** 2 + 1.2 * noise.fractal(Vector((x / 4, y / 4, 0)), 0.55, 2, 5) * smooth(5.5, 9, r) - 0.3
    terrain('Peak', H, 160, 260, rock)
    for k in range(9):
        rr = random.Random(k); a = rr.uniform(0, 2 * math.pi); d = rr.uniform(6, 9)
        prim('ico_sphere', (math.cos(a) * d, math.sin(a) * d, H(math.cos(a) * d, math.sin(a) * d)), (1, 1, 0.7), (0, 0, a), rock, radius=rr.uniform(0.5, 1.3), subdivisions=2)
    snow = ground_mat('FarRock', ['#6e5e66', '#8a7a84'], 0.01, height=[(-200, '#5d4e58'), (60, '#8a7884'), (160, '#f6f1f4'), (400, '#ffffff')], bump=0.6)
    for k, (x, y, h, r) in enumerate(((-560, 900, 220, 300), (700, 1300, 300, 360), (-1500, 2400, 520, 600), (1700, 3000, 460, 650), (150, 4200, 760, 800))):
        terrain('Far', lambda X, Y, x=x, y=y, h=h, r=r: (h + 140) * max(0, 1 - math.hypot(X - x, Y - y) / r) ** 1.2 * (0.8 + 0.4 * noise.noise(Vector((X / 90, Y / 90, k)))) - 160,
                r * 2.2, 220, snow, cx=x, cy=y)
    volume_box('Sea', (0, 3000, -120), (14000, 14000, 120), cloud_mat('Sea', 0.03, '#fff0e2', 60, 0.42, 'slab'))
    station(0.0, '#a49a90')
    camera(*CH_CAM, 52, 68); render('ch-a', -0.4, (0.08, 0.14))

def ch_b():   # Wind-farm ridge: rolling hills, white wind turbines in warm late light
    reset(); sky(8, 40, strength=0.45, dust=1.4, sun_int=0.55); sun(8, 40, 4.2, (1, 0.72, 0.46))
    g = ground_mat('Hills', ['#5f8434', '#7f9c40', '#a8a24e'], 0.006, cells=(0.006, ['#6e9036', '#9aa246', '#bfa850', '#62883a', '#8a9c44']), bump=0.15)
    def H(x, y):
        r = math.hypot(x, y); return -0.12 * r + 70 * noise.fractal(Vector((x / 600, y / 600, 0.3)), 0.5, 2, 4) * smooth(20, 200, r) + 0.4 * noise.noise(Vector((x / 6, y / 6, 0)))
    terrain('Hills', H, 6000, 520, g, cy=2400)
    white = mat('Turbine', '#f4f5f7', 0.3); rr = random.Random(3)
    spots = [(-90, 150), (110, 230), (-260, 380), (280, 470), (-60, 620), (-480, 760), (430, 880), (-220, 1100), (160, 1300), (620, 1500), (-700, 1650), (60, 1900)]
    for k, (x, y) in enumerate(spots):
        z = H(x, y); s = 1.0
        prim('cone', (x, y, z + 45), (1, 1, 1), m=white, radius1=2.0, radius2=1.0, depth=90, vertices=20)
        prim('cube', (x, y + 1.0, z + 91), (1.6, 4, 1.6), m=white); prim('uv_sphere', (x, y - 3.2, z + 91), m=white, radius=1.3)
        a0 = rr.uniform(0, 2 * math.pi)
        for b in range(3):
            a = a0 + b * 2 * math.pi / 3
            prim('cube', (x + math.cos(a) * 21, y - 4, z + 91 + math.sin(a) * 21), (21, 0.3, 1.2), (0, -a, 0), white)
    station(H(0, 0), '#c8bfae')
    leaf = mat('Leaf', '#3f6a2a', 0.85); bark = mat('Bark', '#5a4330')
    for (x, y) in ((-16, 12), (18, 16), (-34, 46), (40, 60), (-60, 80)): t = tree_obj('T', leaf, bark); t.location = (x, y, H(x, y)); t.scale = (1.8, 1.8, 1.8)
    cm = cloud_mat('Cu', 0.008, '#fff4ea', 1.6, 0.42)
    for i in range(10):
        rr2 = random.Random(i); cumulus((rr2.uniform(-3000, 3000), 2500 + i * 400, 900), rr2.uniform(400, 700), 380, cm, i)
    camera(*CH_CAM, 52, 68); render('ch-b', -0.4, (0.1, 0.16))

def ch_c():   # Rooftop lab at dusk: the pad on a city roof, a skyline of lit windows under a violet sky
    reset(); sky(-2.5, 250, strength=0.35, dust=0.8, sun_int=0.3, tint='#b9a6ff'); sun(2, 250, 0.4, (1, 0.6, 0.6))
    win = window_mat('Windows', '#ffcf7a', 2.5, '#262a40', -0.7)
    bm = bmesh.new(); rr = random.Random(9)
    for k in range(420):
        a = rr.uniform(-1.2, 1.2); d = rr.uniform(140, 1600); x, y = math.sin(a) * d, math.cos(a) * d
        w = rr.uniform(18, 44); h = rr.uniform(20, 70) + (180 if rr.random() < 0.15 else 0) * (d / 1600)
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((x, y, h / 2 - 60)) @ Matrix.Diagonal((w, rr.uniform(18, 44), h, 1)))
    me = bpy.data.meshes.new('City'); bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new('City', me)); o.data.materials.append(win)
    roof = mat('Roof', '#565a6a', 0.9); prim('cube', (0, 10, -30), (40, 40, 30), m=roof)
    edge = mat('Parapet', '#6b6f80', 0.8)
    for sx in (-40, 40): prim('cube', (sx, 10, 0.6), (0.4, 40, 0.6), m=edge)
    prim('cube', (0, 50, 0.6), (40, 0.4, 0.6), m=edge)
    for k in range(3): prim('cube', (-12 + k * 12, 26, 1.2), (2.5, 1.6, 1.2), m=mat('Vent', '#7a7e8e', 0.5, metal=0.5))
    red = emit_mat('Beacon', '#ff3b4a', 20)
    for k in range(8):
        x = rr.uniform(-600, 600); y = rr.uniform(400, 1400); prim('uv_sphere', (x, y, rr.uniform(60, 160)), m=red, radius=1.5)
    station(0.0, '#8a8c98')
    volume_box('Haze', (0, 900, 0), (4000, 3000, 300), fog_mat('Haze', 0.0012, '#c9b8ff', 0.6))
    camera(*CH_CAM, 52, 68); render('ch-c', 0.3, (0.08, 0.14))

# ============================================================================================================
# FLY HIGH: the Brainer climbs; the world slides down. Three altitude frames per direction: 1 launch, 2 high sky, 3 space.
# ============================================================================================================
def tower(x, y, z, h=60, col='#e6e8f0', lights='#ff4a5a'):
    m = mat('Tower', col, 0.5, metal=0.3); parts = []
    for sx in (-3, 3):
        for sy in (-3, 3): parts.append(prim('cube', (x + sx, y + sy, z + h / 2), (0.35, 0.35, h / 2), m=m))
    for k in range(int(h / 6)):
        zz = z + 3 + k * 6
        for (a, sc) in (((0, -3), (3, 0.18, 0.18)), ((0, 3), (3, 0.18, 0.18)), ((-3, 0), (0.18, 3, 0.18)), ((3, 0), (0.18, 3, 0.18))):
            parts.append(prim('cube', (x + a[0], y + a[1], zz), sc, m=m))
        parts.append(prim('cube', (x, y - 3, zz + 3), (0.12, 0.12, 4.2), (0, math.radians(45), 0), m))
    join(parts, 'Tower')
    prim('cylinder', (x, y, z + 0.6), m=mat('Pad', '#8e8e98', 0.8), radius=16, depth=1.2, vertices=48)
    r = emit_mat('TowerLight', lights, 25)
    for k in range(4): prim('uv_sphere', (x + 3.4, y - 3.4, z + 12 + k * 14), m=r, radius=0.45)

FH_GROUND_CAM = 66, 84

def space_frame(key, em, atmo='#4fa3ff', extra=None, sun_dir=(30, 20), glow='#140c3a', exposure=0.0):
    reset(); space_world(5.0, glow); sun(sun_dir[0], sun_dir[1], 5.0, (1, 0.97, 0.92)); em = em()
    R = 4000
    prim('uv_sphere', (0, 0, -R - 120), m=em, radius=R, segments=256, ring_count=128)
    a = bpy.data.materials.new('Atmo'); a.use_nodes = True; N, L = a.node_tree.nodes, a.node_tree.links; N.remove(N['Principled BSDF'])
    lw = N.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.25
    rmp = N.new('ShaderNodeValToRGB'); e = rmp.color_ramp.elements; e[0].color = (0, 0, 0, 1); e[0].position = 0.6; e[1].position = 1.0; e[1].color = lin4(atmo)
    L.new(lw.outputs['Facing'], rmp.inputs['Fac'])
    em2 = N.new('ShaderNodeEmission'); em2.inputs['Strength'].default_value = 5.0; L.new(rmp.outputs['Color'], em2.inputs['Color'])
    tr = N.new('ShaderNodeBsdfTransparent'); ad = N.new('ShaderNodeAddShader'); L.new(em2.outputs[0], ad.inputs[0]); L.new(tr.outputs[0], ad.inputs[1])
    L.new(ad.outputs[0], N['Material Output'].inputs['Surface'])
    prim('uv_sphere', (0, 0, -R - 120), m=a, radius=R * 1.015, segments=256, ring_count=128)
    if extra: extra()
    camera((0, -40, 30), (0, 400, -10), 66, 80); render(key, exposure, (0.0, 0.0))

def fh_a(frame):   # Red-rock desert launch: mesas at sunrise, a dusty orange high sky, then a warm Earth limb
    if frame == 3:
        return space_frame('fh-a-3', lambda: earth_mat(['#0d2a4a', '#1d4f7a'], ['#a8643a', '#c98a52', '#6e4a30'], '#f6e6d6'), '#ffa070',
                           extra=lambda: prim('uv_sphere', (900, 3200, 700), m=mat('Moon', '#c9c2b8', 0.95), radius=110), sun_dir=(25, 200), glow='#2a1030')
    reset(); hi = frame == 2
    sky(5, 12, strength=0.45, dust=2.4, alt=60 if not hi else 9000, sun_int=0.6); sun(5, 12, 4.2, (1, 0.64, 0.4))
    def H(x, y):
        k = 6 if hi else 1
        n = noise.noise(Vector((x / (700 * k), y / (700 * k), 0.4)))
        step = 70 * smooth(0.12, 0.2, n) + 60 * smooth(0.38, 0.44, n)
        return (step + 6 * noise.fractal(Vector((x / 120, y / 120, 2)), 0.5, 2, 4)) * (k ** 0.5)
    g = ground_mat('Desert', ['#a85c32', '#c47e46', '#d9a06a'], 0.004 if not hi else 0.0008,
                   height=[(0, '#cf9560'), (30, '#a8522e'), (60, '#dfaa74'), (100, '#93452a'), (140, '#e6ba88')] if not hi else None, bump=0.3)
    if not hi:
        terrain('Desert', H, 12000, 560, g, cy=4800)
        tower(0, 110, H(0, 110), 60); camera((0, -50, H(0, -50) + 3), (0, 200, 46), *FH_GROUND_CAM); render('fh-a-1', -0.8, (0.1, 0.2))
    else:
        terrain('Desert', lambda x, y: 500 * noise.fractal(Vector((x / 9000, y / 9000, 0.4)), 0.5, 2, 6), 160000, 500, g, cy=60000)
        volume_box('Haze', (0, 60000, 1400), (160000, 120000, 2800), fog_mat('Haze', 0.00012, '#ffd2a8', 0.3))
        cm = cloud_mat('Cu', 0.006, '#fff0e0', 1.6, 0.42); rr = random.Random(2)
        for i in range(14): cumulus((rr.uniform(-20000, 20000), rr.uniform(8000, 50000), 3000), rr.uniform(1800, 3200), 1400, cm, i)
        camera((0, 0, 9000), (0, 10000, 7900), *FH_GROUND_CAM); render('fh-a-2', -0.6, (0.05, 0.1))

def fh_b(frame):   # Ocean island launch: a pad on a green island in turquoise sea, towering clouds, then a blue Earth
    if frame == 3:
        return space_frame('fh-b-3', lambda: earth_mat(['#0a2f66', '#1a64a8'], ['#3c7a3a', '#6f8f4a', '#2f5a2e'], '#ffffff'), '#5ab0ff', sun_dir=(45, 150))
    reset()
    def H(x, y):
        r = math.hypot(x, y - 260); return 70 * max(0, 1 - r / 420) ** 1.3 + 8 * noise.fractal(Vector((x / 90, y / 90, 0)), 0.5, 2, 4) * smooth(0, 60, 420 - r) - 6 * smooth(380, 460, r)
    if frame == 1:
        sky(30, 130, strength=0.5, dust=0.25, sun_int=0.6); sun(30, 130, 4.4, (1, 0.95, 0.86))
        g = ground_mat('Isle', ['#3f7f2c', '#5a9438'], 0.01, height=[(-8, '#d8c39a'), (0.8, '#f4e6c2'), (2.5, '#5a9438'), (70, '#3f7f2c')])
        isl = terrain('Isle', H, 1400, 400, g, cy=260)
        prim('plane', (0, 2000, 0.5), (8000, 8000, 1), m=water_mat('Sea', '#05607f', '#5fe3d6', 0.02, 0.04))
        scatter(isl, tree_obj('Tree', mat('Leaf', '#2f7a2c', 0.8), mat('Trunk', '#6a5038')), 2400, 2.6, weight=lambda x, y, z: smooth(3, 6, z), seed=2)
        tower(0, 160, H(0, 160), 90)
        cm = cloud_mat('Cu', 0.02, '#ffffff', 1.6, 0.42)
        for i in range(12):
            rr = random.Random(i); cumulus((rr.uniform(-2500, 2500), 1400 + i * 420, 600), rr.uniform(420, 700), 420, cm, i)
        camera((30, -230, 5), (0, 200, 70), *FH_GROUND_CAM); render('fh-b-1', -0.5, (0.1, 0.2))
    else:
        sky(30, 130, strength=0.5, dust=0.15, alt=6000, sun_int=0.7); sun(30, 130, 4.6)
        prim('plane', (0, 20000, 0), (60000, 60000, 1), m=opaque_water('Ocean', '#0b4f7a', 0.05))
        volume_box('Floor', (0, 12000, 2200), (60000, 40000, 500), cloud_mat('Floor', 0.02, '#ffffff', 80, 0.44, 'slab'))
        rr = random.Random(7); cm = cloud_mat('Tower', 0.012, '#ffffff', 1.6, 0.42)
        for i in range(14):
            x, y, w = rr.uniform(-9000, 9000), rr.uniform(3000, 16000), rr.uniform(1200, 2200)
            for k in range(4): s = w * (1 - k * 0.16); cloud((x, y, 2400 + k * w * 0.42), (s, s, s * 0.8), cm)
        camera((0, 0, 4600), (0, 10000, 4300), *FH_GROUND_CAM); render('fh-b-2', -0.8, (0.05, 0.1))

def fh_c(frame):   # City at dusk: the pad on a waterfront, a lit skyline, violet sky, then stars, aurora and a night Earth
    if frame == 3:
        return space_frame('fh-c-3', lambda: earth_mat(['#030914', '#071a33'], ['#0c1a2a', '#14243a', '#0a1420'], '#202a40', lights='#ffb060', scale=0.0016),
                           '#7a6bff', extra=lambda: prim('uv_sphere', (-900, 2600, 700), m=mat('Moon', '#d8dae6', 0.95), radius=320),
                           sun_dir=(12, 230), glow='#2a1a6a', exposure=0.3)
    reset()
    if frame == 1:
        sky(-2.0, 250, strength=0.4, dust=0.9, sun_int=0.3, tint='#c4b0ff'); sun(2, 250, 0.4, (1, 0.6, 0.6))
        win = window_mat('Windows', '#ffcf7a', 2.2, '#262a40', -0.75, 5.0, 6.0)
        bm = bmesh.new(); rr = random.Random(5)
        for k in range(360):
            x = rr.uniform(-1600, 1600); y = rr.uniform(700, 2200); w = rr.uniform(20, 46); h = rr.uniform(20, 90) + (160 if rr.random() < 0.12 else 0)
            bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((x, y, h / 2)) @ Matrix.Diagonal((w, rr.uniform(20, 46), h, 1)))
        me = bpy.data.meshes.new('City'); bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new('City', me)); o.data.materials.append(win)
        prim('plane', (0, 400, -1), (4000, 300, 1), m=opaque_water('Bay', '#1f2a55', 0.04))
        prim('plane', (0, -200, 0), (400, 300, 1), m=mat('Dock', '#4a4e60', 0.8))
        tower(0, 120, 0, 70, '#d9dbea')
        camera((0, -60, 6), (0, 200, 50), *FH_GROUND_CAM); render('fh-c-1', 0.4, (0.1, 0.2))
    else:
        sky(-6, 250, strength=0.25, dust=0.5, alt=10000, sun_int=0.2, stars=3.0, tint='#9a8cff', disc=False)
        bm = bmesh.new(); rr = random.Random(2)
        for k in range(2500):
            x = rr.gauss(0, 4000); y = rr.uniform(3000, 40000)
            bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((x, y, 0)) @ Matrix.Diagonal((50, 50, 4, 1)))
        me = bpy.data.meshes.new('Lights'); bm.to_mesh(me); bm.free(); o = link(bpy.data.objects.new('Lights', me)); o.data.materials.append(emit_mat('CityGlow', '#ffb060', 4))
        prim('plane', (0, 20000, -2), (80000, 80000, 1), m=mat('Night', '#0a0d1e', 0.9))
        volume_box('Aurora', (-4000, 36000, 14000), (40000, 4000, 12000), aurora_mat('#57ffb4', 0.00025, '#9a6bff'))
        camera((0, 0, 9000), (0, 10000, 9000), *FH_GROUND_CAM); render('fh-c-2', 0.2, (0.05, 0.1))

KEYS = {'pc-a': pc_a, 'pc-b': pc_b, 'pc-c': pc_c, 'fr-a': fr_a, 'fr-b': fr_b, 'fr-c': fr_c, 'ch-a': ch_a, 'ch-b': ch_b, 'ch-c': ch_c}
for d, f in (('a', fh_a), ('b', fh_b), ('c', fh_c)):
    for k in (1, 2, 3): KEYS[f'fh-{d}-{k}'] = (lambda f=f, k=k: f(k))
for k in (KEYS if KEY == 'all' else KEY.split(',')):
    try: KEYS[k]()
    except Exception as e:
        import traceback; traceback.print_exc(); print('FAILED', k, e)
