# The intro clip's frames into a web video (H.264 MP4) with Blender's own encoder.
# usage: blender -b --python intro_encode.py -- <frames dir> <out.mp4> [crf]      crf: 'HIGH', 'MEDIUM' (default), 'LOW'
import bpy, os, sys
argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(argv[0]), os.path.abspath(argv[1]); Q = argv[2] if len(argv) > 2 else 'MEDIUM'
files = sorted(f for f in os.listdir(SRC) if f.startswith('frame_') and f.endswith('.png'))
sc = bpy.context.scene; sc.sequence_editor_create()
strip = sc.sequence_editor.strips.new_image('frames', os.path.join(SRC, files[0]), 1, 1)
for f in files[1:]: strip.elements.append(f)
img = bpy.data.images.load(os.path.join(SRC, files[0]))
sc.render.resolution_x, sc.render.resolution_y = img.size; sc.render.resolution_percentage = 100
sc.frame_start, sc.frame_end = 1, len(files); sc.render.fps = 30
if hasattr(sc.render.image_settings, 'media_type'): sc.render.image_settings.media_type = 'VIDEO'
sc.render.image_settings.file_format = 'FFMPEG'
ff = sc.render.ffmpeg; ff.format = 'MPEG4'; ff.codec = 'H264'; ff.constant_rate_factor = Q; ff.ffmpeg_preset = 'BEST'; ff.gopsize = 15; ff.audio_codec = 'NONE'
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0   # the frames are final already
sc.render.filepath = OUT; sc.render.use_file_extension = False
bpy.ops.render.render(animation=True); print('ENCODED', OUT, len(files))
