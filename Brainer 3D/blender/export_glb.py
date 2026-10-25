# Exports the Brainer for the web as one GLB: the stage 1 body (the browser grows it to any stage), every pair's
# accessory hidden on its own node, and named materials the page recolours or paints live (Accent, Screen, ChestScreen).
# usage: blender -b --python export_glb.py -- <out.glb>
import bpy, os, sys, runpy
argv = sys.argv[sys.argv.index('--') + 1:]
OUTFILE = argv[0]
DIR = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], '--', os.path.dirname(OUTFILE), 'none']
K = runpy.run_path(os.path.join(DIR, 'brainer2.py'), run_name='brainer2')
build = K['build']
build.__globals__['SCREEN_GRID'] = (48, 27)   # a lighter visor for the browser

def tree(o): return [o] + [d for c in o.children for d in tree(c)]
base = build(1, 'G', style='carved_dense', face='face_pixel_happy.png'); base.name = 'Brainer'
nodes = {o.name.split('.')[0]: o for o in tree(base) if o.type == 'EMPTY'}
ACC = {3: ('Scarf', ['Scarf', 'ScarfEnd']), 5: ('Cap', ['CapCrown', 'CapPeak', 'CapButton']),
       7: ('BowTie', ['Bow-1', 'Bow1', 'BowKnot']), 9: ('GradCap', ['CapBase', 'Board', 'Tassel', 'TasselCord', 'TasselEnd'])}
for stage, (group, names) in ACC.items():   # borrow each pair's accessory from a character built at that stage
    other = build(stage, 'G', style='carved_dense', face='face_pixel_happy.png')
    parts = [o for o in tree(other) if o.name.split('.')[0] in names or any(o.name.split('.')[0].startswith(n + '_end') for n in names)]
    for o in parts:
        host = nodes['Head'] if o.parent and o.parent.name.startswith('Head') else nodes['Body']
        pinv = o.matrix_parent_inverse.copy(); o.parent = host; o.matrix_parent_inverse = pinv   # setting parent resets this; keep the frame it was built in
        o.name = f'Acc{group}_' + o.name.split('.')[0]
        m = o.material_slots[0].material if o.material_slots else None
        if m and m.name.startswith(('Scarf', 'Cap#', 'Tie#')): m.name = f'Acc{group}'   # recoloured per stage by the page
        if m and m.name.startswith('Acc#'): m.name = 'AccTassel'   # the tassel takes the stage colour
    for o in tree(other):
        if o not in parts: bpy.data.objects.remove(o, do_unlink=True)

for o in tree(base):   # the names the page looks for
    m = o.material_slots[0].material if o.type in ('MESH', 'CURVE', 'FONT') and o.material_slots else None
    if not m: continue
    if m.name.startswith('Acc#'): m.name = 'Accent'
    if o.name.startswith('Screen'): m.name = 'Screen'
    if o.name.startswith('ChestScreen'): m.name = 'ChestScreen'
    for mod in o.modifiers:
        if mod.type == 'SUBSURF': mod.levels = min(mod.levels, 1)   # lighter for the browser
for o in tree(base):   # thin out the densest parts (not the screens: their texture coordinates must stay even)
    if o.type == 'MESH' and not o.name.startswith(('Screen', 'ChestScreen')):
        n = len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.polygons)
        big = max(o.dimensions) * max(o.matrix_world.to_scale()) > 0.5   # torso, head and boots keep more detail than thumbs and knots
        keep = 900 if big else 380
        if n > keep: d = o.modifiers.new('Lighter', 'DECIMATE'); d.ratio = max(0.06, keep / n)
tiny = bpy.data.images.new('Placeholder', 4, 4); tiny.pixels = [0.2, 0.3, 0.94, 1.0] * 16   # the page paints these screens live
for m in bpy.data.materials:
    if m.name in ('Screen', 'ChestScreen') and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE': n.image = tiny
bpy.ops.object.select_all(action='DESELECT')
for o in tree(base): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUTFILE, export_format='GLB', use_selection=True, export_apply=True, export_yup=True)
tris = 0
dg = bpy.context.evaluated_depsgraph_get()
for o in tree(base):
    if o.type == 'MESH':
        me = o.evaluated_get(dg).to_mesh(); tris += sum(len(p.vertices) - 2 for p in me.polygons); o.evaluated_get(dg).to_mesh_clear()
print('EXPORTED', OUTFILE, os.path.getsize(OUTFILE) // 1024, 'KB', tris, 'triangles', sorted(nodes))
