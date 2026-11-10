"""Portrait pipeline: `python3 scripts/portraits.py [image name ...]`.

Masters live in art/portraits/ (600x750 JPEG, named as in docs/art/PORTRAIT_PROMPTS.md, e.g.
concord-sutton.jpg). Adding a new image: `python3 scripts/portraits.py --add path/to/source.png name`
crops it to 4:5 and saves the master. Every run rebuilds the game copies in src/assets/portraits/
(240x300 WebP, about 5 KB each). Needs Pillow.
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(ROOT, 'art', 'portraits')
GAME = os.path.join(ROOT, 'src', 'assets', 'portraits')


def crop45(im):
    """Crops to 4:5, centred sideways and biased toward the top (faces sit high in a portrait)."""
    w, h = im.size
    tw, th = w, round(w * 5 / 4)
    if th > h:
        tw, th = round(h * 4 / 5), h
    left = (w - tw) // 2
    top = (h - th) // 4
    return im.crop((left, top, left + tw, top + th))


def add(src, name):
    im = crop45(Image.open(src).convert('RGB')).resize((600, 750), Image.LANCZOS)
    os.makedirs(MASTERS, exist_ok=True)
    im.save(os.path.join(MASTERS, f'{name}.jpg'), 'JPEG', quality=88, optimize=True)


def build():
    os.makedirs(GAME, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(MASTERS, '*.jpg'))):
        name = os.path.splitext(os.path.basename(f))[0]
        im = Image.open(f).convert('RGB').resize((240, 300), Image.LANCZOS)
        out = os.path.join(GAME, f'{name}.webp')
        im.save(out, 'WEBP', quality=72, method=6)
        print(f'{name}: {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    args = sys.argv[1:]
    while len(args) >= 3 and args[0] == '--add':
        add(args[1], args[2])
        args = args[3:]
    build()
