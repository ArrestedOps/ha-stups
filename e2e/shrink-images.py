#!/usr/bin/env python3
"""Verkleinert die Screenshots in docs/images (und docs/images/en) auf 256 Farben (Median-Cut mit Dithering).

Aufruf im Repository-Ordner nach `node e2e/screenshots.mjs` (und `--lang en`): python3 e2e/shrink-images.py
Die Bilder werden von rund 50 MB auf rund 16 MB kleiner, auf dem Handy und im README sieht man keinen Unterschied
(Verläufe bleiben glatt, anders als bei Octree). Die Logos (stups-*.png) und die GIFs bleiben unberührt.
Braucht Pillow (`pip install pillow`).
"""
import glob
import os

from PIL import Image

root = os.path.join(os.path.dirname(__file__), '..', 'docs', 'images')
before = after = 0
for path in sorted(glob.glob(os.path.join(root, '*.png')) + glob.glob(os.path.join(root, 'en', '*.png'))):
    if os.path.basename(path).startswith('stups-'):
        continue
    before += os.path.getsize(path)
    Image.open(path).convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    after += os.path.getsize(path)
print(f'{before // 1024 // 1024} MB -> {after // 1024 // 1024} MB')
