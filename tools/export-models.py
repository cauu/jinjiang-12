"""Export .blend models to compressed .glb

Usage (at repo root):
  /Applications/Blender.app/Contents/MacOS/Blender -b <source>.blend \\
    --python tools/export-models.py -- <ratio> <output>.glb

For scene props (buildings, furniture, decorations), set ratio 1.0.
For high-poly characters, use a lower ratio like 0.1 or 0.05.

The script:
- Deletes studio elements (cameras, lights, ground, reference images)
- Scales large textures down to 1024×1024 for smaller runtime size
- Applies decimate modifier if ratio < 1
- Exports only real scene content to GLB with the given output name
"""
import bpy, sys, os

args = sys.argv[sys.argv.index('--') + 1:]
ratio, output = float(args[0]), args[1]

# Delete studio cruft that should not appear in the runtime asset
deletable_names = {
    'Camera', 'Light', 'Studio_Ground', 'Studio_floor', 'Cube',
    'Reference_Back', 'Reference_Front', 'Reference_ThreeQuarter',
    'REF_Back', 'REF_Front', 'REF_ThreeQuarter_NOT_orthographic_side'
}
for obj in list(bpy.data.objects):
    if obj.type in ('CAMERA', 'LIGHT') or obj.name in deletable_names:
        bpy.data.objects.remove(obj, do_unlink=True)

# Scale down large textures to max 1024×1024 to reduce file size
for image in bpy.data.images:
    if image.name in ('Render Result', 'Viewer Node'):
        continue
    w, h = image.size
    if w > 1024 or h > 1024:
        new_w = min(w, 1024)
        new_h = min(h, 1024)
        print(f"  scaling {image.name} from {w}×{h} to {new_w}×{new_h}")
        image.scale(new_w, new_h)

# For characters: switch armature to REST before decimation, then back to POSE for export
armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
for arm in armatures:
    arm.data.pose_position = 'REST'

bpy.context.scene.frame_set(1)

# Apply decimate to meshes if ratio < 1
if ratio < 1.0:
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            mod = obj.modifiers.new('DecimateForExport', 'DECIMATE')
            mod.ratio = ratio
            bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.select_set(False)

# Restore pose mode for character rigs
for arm in armatures:
    arm.data.pose_position = 'POSE'

# Select all remaining scene content
for obj in bpy.data.objects:
    obj.select_set(True)

# Export to GLB
print(f"  exporting {len(bpy.data.objects)} objects to {output}")
bpy.ops.export_scene.gltf(
    filepath=output,
    export_format='GLB',
    use_selection=True,
    export_image_format='AUTO'
)

print(f"  done: {output}")
