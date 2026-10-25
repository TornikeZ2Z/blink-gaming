# Sprites of the airfield for Plane Crash's 2D world, seen from about where the game's camera sees them: the hangar
# with the B (door toward the camera, a little from its right) and the control tower with its windsock.
# usage: blender -b --python pc_sprites.py -- <outdir>
import bpy, bmesh, math, os, sys, runpy
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
DIR = os.path.dirname(os.path.abspath(__file__))
sys.argv = [sys.argv[0], '--', OUT, 'none']
K = runpy.run_path(os.path.join(DIR, 'brainer2.py'), run_name='brainer2')
material, cyl, rbox, capsule, done, look, studio, activate = (K[n] for n in ('material', 'cyl', 'rbox', 'capsule', 'done', 'look', 'studio', 'activate'))
scene = bpy.context.scene

def clear():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
def shoot(name, target, dist, h, w, yaw):   # a camera at 12 degrees above the horizon, turned yaw from straight on
    a = math.radians(12)
    studio((w, h), (target[0] + dist * math.sin(yaw) * math.cos(a), target[1] - dist * math.cos(yaw) * math.cos(a), target[2] + dist * math.sin(a)), target, lens=60)
    hold = bpy.data.materials.new('Holdout'); hold.use_nodes = True; nt = hold.node_tree; nt.nodes.clear()   # the ground hides what is under it but adds no shadow: clean edges, the game has its own ground
    nt.links.new(nt.nodes.new('ShaderNodeHoldout').outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.is_shadow_catcher]: o.is_shadow_catcher = False; o.data.materials.append(hold)
    scene.render.filepath = os.path.join(OUT, name); bpy.ops.render.render(write_still=True); print('RENDERED', name)

white = material('HWhite', '#FFFFFF', rough=0.35, coat=0.4); roof = material('Roof', '#5A3FFC', rough=0.3, coat=0.6)
# the hangar: a white barrel vault, its door toward -y
clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=7, depth=16, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0)); h = bpy.context.active_object
activate(h); bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bpy.ops.object.mode_set(mode='EDIT'); bm = bmesh.from_edit_mesh(h.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context='VERTS'); bmesh.update_edit_mesh(h.data); bpy.ops.object.mode_set(mode='OBJECT')
done(h, 'Hangar', white)
bpy.ops.mesh.primitive_torus_add(major_radius=7.05, minor_radius=0.35, location=(0, -7.7, 0), rotation=(math.pi / 2, 0, 0)); done(bpy.context.active_object, 'Band', roof)   # a violet rim round the door
cyl('Door', 6.4, 0.2, (0, -8.05, 0), (math.pi / 2, 0, 0), material('Door', '#2B2452', rough=0.6), None)
rbox('Sign', (2.2, 0.15, 2.2), (0, -8.3, 4.6), 0.6, roof, None)
bpy.ops.object.text_add(location=(0, -8.48, 3.3), rotation=(math.pi / 2, 0, 0)); tx = bpy.context.active_object
tx.data.body = 'B'; tx.data.size = 3.2; tx.data.extrude = 0.12; tx.data.align_x = 'CENTER'; done(tx, 'Mark', material('MarkWhite', '#FFFFFF', emit='#FFFFFF', strength=0.4), None, smooth=False)
shoot('hangar.png', (-1.5, 0, 3.2), 60, 1040, 1280, math.radians(28))
# the control tower and its windsock
clear()
cyl('Tower', 1.2, 9, (0, 0, 4.5), (0, 0, 0), white, None)
cyl('Cab', 2.0, 2.0, (0, 0, 10), (0, 0, 0), material('TowerGlass', '#9FE8FF', rough=0.05, emit='#4FD7FF', strength=0.6), None)
cyl('TowerRoof', 2.3, 0.5, (0, 0, 11.25), (0, 0, 0), roof, None)
capsule('Pole', (3.2, 0.5, 0), (3.2, 0.5, 6), 0.08, white, None)
bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.6, radius2=0.25, depth=2.6, location=(4.5, 0.5, 5.6), rotation=(0, math.pi / 2 - 0.15, 0))
done(bpy.context.active_object, 'Sock', material('Sock', '#FF7A59', rough=0.6))
shoot('tower.png', (1.2, 0, 5.8), 40, 1280, 840, math.radians(-20))
