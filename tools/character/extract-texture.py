"""Blender --background SOURCE.blend --python tools/character/extract-texture.py -- OUTPUT.png"""
import bpy,sys
output=sys.argv[sys.argv.index('--')+1]
image=bpy.data.images['Boy_reference_matched_basecolor']
with open(output,'wb') as file:file.write(image.packed_file.data)
