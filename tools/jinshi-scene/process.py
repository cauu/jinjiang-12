"""Turns the generated Jinshi scene art (production/jinshi-scene-v2/原图) into runtime textures.

  python3 tools/jinshi-scene/process.py

Writes WebP files to packages/game-client/src/assets/jinshi/ and the sign atlas layout to
packages/game-client/src/jinshi-signs.ts. Needs Pillow and NumPy.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'production/jinshi-scene-v2/原图'
OUT = ROOT / 'packages/game-client/src/assets/jinshi'


def load(name):
    return np.asarray(Image.open(SRC / f'{name}.png').convert('RGB')).astype(np.float32)


def save(array, name, lossless=False):
    mode = 'RGBA' if array.shape[2] == 4 else 'RGB'
    image = Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), mode)
    image.save(OUT / f'{name}.webp', 'WEBP', quality=88, lossless=lossless, method=6)
    print(f'{name}.webp {image.size} {(OUT / f"{name}.webp").stat().st_size // 1024} KB')


def resize(array, w, h):
    channels = 'RGBA' if array.shape[2] == 4 else 'RGB'
    return np.asarray(Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), channels).resize((w, h), Image.LANCZOS)).astype(np.float32)


def wrap(array, feather=.25, axes=(0, 1)):
    """Make edges tile: blend with a copy rolled by half, using the rolled copy near the edges."""
    out = array
    for axis in axes:
        n = out.shape[axis]
        t = np.abs(np.arange(n) - (n - 1) / 2) / (n / 2)  # 0 centre → 1 edge
        weight = np.clip((t - (1 - 2 * feather)) / (2 * feather), 0, 1)
        weight = weight * weight * (3 - 2 * weight)
        shape = [1, 1, 1]
        shape[axis] = n
        weight = weight.reshape(shape)
        out = out * (1 - weight) + np.roll(out, n // 2, axis=axis) * weight
    return out


def grade(array, saturation=1., brightness=1., tint=(1, 1, 1)):
    grey = array[..., :3].mean(2, keepdims=True)
    rgb = (grey + (array[..., :3] - grey) * saturation) * brightness * np.array(tint, np.float32)
    return np.concatenate([rgb, array[..., 3:]], 2)


# Ground: rammed earth, a little less orange; brick ring darker and greyer than the silk stage.
save(resize(wrap(grade(load('street-ground'), .72, .9, (1, .97, .93))), 1024, 1024), 'ground-earth-v2')
save(resize(wrap(grade(load('plaza-brick'), .7, .78, (1, .97, .94)), feather=.08), 1024, 1024), 'plaza-brick-v1')

# Brocade motif: single-channel mask stored as grey; the floor shader only reads red.
motif = load('brocade-motif').mean(2, keepdims=True)
motif = wrap(np.repeat(motif, 3, 2), feather=.06, axes=(1,))
save(resize(motif, 512, 512), 'brocade-motif-v1')

# Stage side: horizontal repeat only.
skirt = load('stage-skirt')
save(resize(wrap(skirt, feather=.06, axes=(1,)), 1024, 342), 'stage-skirt-v1')

# Panorama: wraps around horizontally; the top of the sky fades out into the sky dome.
pano = wrap(load('far-panorama'), feather=.18, axes=(1,))
h = pano.shape[0]
alpha = np.clip((np.arange(h) / h - .02) / .16, 0, 1).reshape(h, 1, 1) * 255
save(np.concatenate([pano, np.broadcast_to(alpha, (h, pano.shape[1], 1))], 2), 'far-panorama-v2')


# ---- Signboards -------------------------------------------------------------------------
def runs(mask, min_len=1):
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(mask)))
    return [r for r in out if r[1] - r[0] >= min_len]


def boards(name, texts):
    a = load(name)
    ink = np.abs(a - 255).sum(2) > 60
    found = []
    for y0, y1 in runs(ink.mean(1) > .05, 60):
        for x0, x1 in runs(ink[y0:y1].mean(0) > .3, 150):
            found.append(a[y0:y1, x0:x1])
    assert len(found) == len(texts), (name, len(found))
    return dict(zip(texts, found))


def build(board, ratio, height=112):
    """Re-lay a board at a new width: end caps (frame and corner ornaments) are kept, the frame bands
    and paper field between them are rebuilt at the new length, and the characters are re-spaced."""
    h, w, _ = board.shape
    cap, inset = int(h * .42), int(h * .17)
    middle = board[:, cap:w - cap]
    field = middle[inset:h - inset]
    paper = np.median(field.reshape(-1, 3), 0)
    ink = np.abs(field - paper).sum(2) > 70
    columns = []
    for a, b in runs(ink.mean(0) > .03, 2):  # strokes of one character are separated by small gaps
        if columns and a - columns[-1][1] < h * .12:
            columns[-1] = (columns[-1][0], b)
        else:
            columns.append((a, b))
    # Corner ornaments and frame scraps are short or thin; characters span most of the field height.
    def tall(a, b):
        rows = np.where(ink[:, a:b].any(1))[0]
        return len(rows) and rows[-1] - rows[0] > ink.shape[0] * .45 and b - a > h * .12
    pad = 3
    chars = [(max(0, a - pad), min(field.shape[1], b + pad)) for a, b in columns if tall(a, b)]
    # Characters can reach into the frame bands, so cut them at full height; inside the bands only
    # pixels that differ from that row's usual colour count as ink.
    row_colour = np.median(middle, 1, keepdims=True)
    full_ink = np.clip((np.abs(middle - row_colour).sum(2) - 40) / 60, 0, 1)
    full_ink[inset:h - inset] = np.clip((np.abs(field - paper).sum(2) - 40) / 60, 0, 1)
    full_ink[int(h * .93):] = 0
    full_ink[:int(h * .07)] = 0
    glyphs = [(middle[:, a:b], full_ink[:, a:b]) for a, b in chars]
    # Paper without characters or ornament scraps, and frame bands rebuilt from each row's median.
    clean = field.copy()
    wide = np.abs(field - paper).sum(2) > 35
    for _ in range(3):
        wide[1:] |= wide[:-1].copy(); wide[:-1] |= wide[1:].copy(); wide[:, 1:] |= wide[:, :-1].copy(); wide[:, :-1] |= wide[:, 1:].copy()
    clean[wide] = paper
    width = round(ratio * h)
    centre = width - 2 * cap
    glyph_width = sum(b - a for a, b in chars)
    if centre < glyph_width + h * .1 * (len(chars) + 1):  # too narrow to respace: squash slightly
        return resize(board, round(ratio * height), height)
    out_middle = np.repeat(row_colour, centre, 1)
    out_middle[inset:h - inset] = resize(clean, centre, h - 2 * inset)
    free = centre - glyph_width
    inner = min(free / (len(chars) + 1), h * .35)
    x = (free - inner * (len(chars) - 1)) / 2
    for glyph, alpha in glyphs:
        gw = glyph.shape[1]
        x0 = int(round(x))
        region = out_middle[:, x0:x0 + gw]
        region[:] = region * (1 - alpha[..., None]) + glyph * alpha[..., None]
        x += gw + inner
    out = np.concatenate([board[:, :cap], out_middle, board[:, w - cap:]], 1)
    return resize(out, round(ratio * height), height)


plaques = {**boards('plaques-a', ['錦市', '錦官織室', '錦官城', '蜀錦', '絲帛', '彩線', '染坊', '漆器']),
           **boards('plaques-b', ['布肆', '陶器', '蜀鹽', '錦', '絲', '繡', '染', '繒'])}
# Writable face of each model's blank sign (width / height, from the GLB).
SHOP, WORKSHOP, GATE, STALL, ARCH_MAIN, ARCH_SIDE = 1.48 / .2, 1.29 / .18, 1.47 / .47, .68 / .14, 2.23 / .25, 1.37 / .25
items = [(f'shop:{t}', t, SHOP) for t in ['蜀錦', '絲帛', '彩線', '染坊', '漆器', '布肆', '陶器', '蜀鹽']]
items += [('workshop', '錦官織室', WORKSHOP), ('gate', '錦市', GATE), ('arch', '錦官城', ARCH_MAIN), ('arch-left', '蜀錦', ARCH_SIDE), ('arch-right', '絲帛', ARCH_SIDE)]
items += [(f'stall:{t}', t, STALL) for t in ['錦', '絲', '繡', '染', '繒']]
built = sorted(((key, build(plaques[text], ratio)) for key, text, ratio in items), key=lambda kv: -kv[1].shape[1])

W, H, PAD = 2048, 1024, 4
atlas = np.zeros((H, W, 3), np.float32) + 128
rects, shelves = {}, []  # shelves: [y, height, x]
for key, img in built:
    h, w = img.shape[:2]
    shelf = next((s for s in shelves if s[2] + w + PAD <= W and s[1] >= h), None)
    if shelf is None:
        y = shelves[-1][0] + shelves[-1][1] + PAD if shelves else 0
        assert y + h <= H, 'sign atlas full'
        shelf = [y, h, 0]
        shelves.append(shelf)
    x, y = shelf[2], shelf[0]
    atlas[y:y + h, x:x + w] = img
    shelf[2] += w + PAD
    rects[key] = [round(x / W, 5), round(1 - (y + h) / H, 5), round(w / W, 5), round(h / H, 5)]
save(atlas, 'signs-v1')


# ---- Banners: cut out of the white background --------------------------------------------
def cutout(a):
    white = np.abs(a - 255).sum(2) < 45
    background = np.zeros_like(white)
    background[0, :] = background[-1, :] = background[:, 0] = background[:, -1] = True
    background &= white
    while True:  # flood fill the white surround from the image border
        grown = background.copy()
        grown[1:] |= background[:-1]; grown[:-1] |= background[1:]; grown[:, 1:] |= background[:, :-1]; grown[:, :-1] |= background[:, 1:]
        grown &= white
        if (grown == background).all():
            break
        background = grown
    return np.concatenate([a, (~background)[..., None] * 255.], 2)


sheet = cutout(load('shop-banners-v2'))
cells = []
for y0, y1 in runs(sheet[..., 3].mean(1) > 10, 100):
    for x0, x1 in runs(sheet[y0:y1, :, 3].mean(0) > 10, 100):
        cells.append(sheet[y0:y1, x0:x1])
assert len(cells) == 4, len(cells)
BW, BH = 256, 320
banners = np.zeros((BH, BW * 4, 4), np.float32)
for i, cell in enumerate(cells):
    banners[:, i * BW:(i + 1) * BW] = resize(cell, BW, BH)
save(banners, 'banners-v2')

layout = {'signs': rects, 'banners': ['錦', '絲', '帛', '市']}
(ROOT / 'packages/game-client/src/jinshi-signs.ts').write_text(
    '/** Generated by tools/jinshi-scene/process.py: UV rects [u, v, width, height] in signs-v1.webp. */\n'
    f'export const SIGN_RECTS: Record<string, [number, number, number, number]> = {json.dumps(rects, ensure_ascii=False)};\n'
    f'/** Banner cells, left to right, in banners-v2.webp. */\nexport const BANNERS = {json.dumps(layout["banners"], ensure_ascii=False)};\n')
print('rects', len(rects))
