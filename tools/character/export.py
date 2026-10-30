"""Blender --background SOURCE.blend --python tools/character/export.py -- RATIO OUTPUT.glb"""
import bpy, sys
args=sys.argv[sys.argv.index('--')+1:]
ratio,output=float(args[0]),args[1]
scene=bpy.context.scene;mesh=bpy.data.objects['HanfuBoy_Hyper3D'];rig=bpy.data.objects['HanfuBoy_Rig']
rig.data.pose_position='REST';scene.frame_set(1)
for image in bpy.data.images:
 if image.name in ('Boy_reference_matched_basecolor','Boy_paper_normal'):image.scale(1024,1024)
for obj in bpy.context.selected_objects:obj.select_set(False)
mesh.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=mesh
mod=mesh.modifiers.new('WebDecimate','DECIMATE');mod.ratio=ratio
bpy.ops.object.modifier_move_up(modifier=mod.name);bpy.ops.object.modifier_apply(modifier=mod.name)
rig.data.pose_position='POSE'
bpy.ops.export_scene.gltf(filepath=output,export_format='GLB',use_selection=True,export_image_format='AUTO')
