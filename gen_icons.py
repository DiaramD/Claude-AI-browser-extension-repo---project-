#!/usr/bin/env python3
"""Generate RAIJIN extension icons — electric yellow lightning bolt on deep black."""

from PIL import Image, ImageDraw, ImageFilter
import os

YELLOW = (245, 230, 66)
BLUE   = (79, 195, 247)

def get_bolt(S):
    """7-point lightning bolt polygon scaled to canvas size S."""
    return [
        (S * 0.62, S * 0.04),  # top-right
        (S * 0.34, S * 0.04),  # top-left
        (S * 0.15, S * 0.52),  # left tip
        (S * 0.46, S * 0.45),  # inner notch (upper)
        (S * 0.28, S * 0.96),  # bottom tip
        (S * 0.66, S * 0.48),  # right tip
        (S * 0.52, S * 0.55),  # inner notch (lower)
    ]

def generate_icon(target_size):
    SCALE = 4
    S = target_size * SCALE
    bolt = get_bolt(S)

    def glow_layer(alpha, blur_r, color=YELLOW):
        layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(layer).polygon(bolt, fill=(*color, alpha))
        return layer.filter(ImageFilter.GaussianBlur(radius=blur_r))

    # Build up layers: black bg → blue outer glow → yellow mid glow → yellow tight glow → sharp bolt
    img = Image.new('RGBA', (S, S), (0, 0, 0, 255))
    img = Image.alpha_composite(img, glow_layer(90,  int(S * 0.13), BLUE))    # blue outer
    img = Image.alpha_composite(img, glow_layer(130, int(S * 0.07), YELLOW))  # yellow wide
    img = Image.alpha_composite(img, glow_layer(190, int(S * 0.03), YELLOW))  # yellow tight
    sharp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sharp).polygon(bolt, fill=(*YELLOW, 255))
    img = Image.alpha_composite(img, sharp)

    return img.resize((target_size, target_size), Image.LANCZOS)

here = os.path.dirname(os.path.abspath(__file__))
icons_dir = os.path.join(here, 'icons')
os.makedirs(icons_dir, exist_ok=True)

for size in [16, 48, 128]:
    icon = generate_icon(size)
    path = os.path.join(icons_dir, f'icon{size}.png')
    icon.save(path)
    print(f'Saved {path}  ({size}x{size})')

print('Done.')
