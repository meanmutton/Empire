"""Victory and defeat screens: `python3 scripts/endings.py`.

Masters live in art/endings/ (victory.jpg and defeat.jpg, any size, 16:9 works best). Every run rebuilds the game
copies in src/ui/assets/ending-victory.webp and ending-defeat.webp: 1600 px wide, WebP, small enough to ship inside
the single HTML file. To replace an image, drop a new JPEG over the master and run this again. The words
"Victory" and "Defeat" are drawn by the game on top (src/ui/screens/ending.ts), not baked into the pictures.
Needs Pillow.
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(ROOT, 'art', 'endings')
GAME = os.path.join(ROOT, 'src', 'ui', 'assets')
WIDTH = 1600
QUALITY = 66


def build():
    for name in ('victory', 'defeat'):
        im = Image.open(os.path.join(MASTERS, f'{name}.jpg')).convert('RGB')
        h = round(im.height * WIDTH / im.width)
        out = os.path.join(GAME, f'ending-{name}.webp')
        im.resize((WIDTH, h), Image.LANCZOS).save(out, 'WEBP', quality=QUALITY, method=6)
        print(f'{name}: {os.path.getsize(out) / 1024:.0f} KB ({WIDTH}x{h})')


if __name__ == '__main__':
    build()
