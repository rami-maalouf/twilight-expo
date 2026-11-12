# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow>=10"]
# ///
# builds the android launcher, monochrome and splash images from the swift
# app icon (Twilight/logo.icon): a glossy cyan crescent on a deep indigo
# squircle. the crescent is matted out of the flattened swift png against the
# indigo background, then placed inside the adaptive icon safe zone.
# usage: uv run scripts/generate-android-icons.py <path to swift icon png>
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
# indigo of the swift squircle, sampled at its top-left and bottom-right
BG_TOP = (0x2A, 0x20, 0x5E)
BG_BOTTOM = (0x13, 0x0D, 0x3E)
# adaptive icons show the middle 72 of 108 dp; the safe zone is a 66 dp circle.
# the crescent spans this share of the full 108 dp canvas.
MOON_SHARE = 0.5
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def indigo_gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = lerp(BG_TOP, BG_BOTTOM, (x + y) / (2 * (size - 1)))
    return img


def extract_moon(src):
    # the moon is the only bright cyan area inside the squircle: matte it by
    # its green channel against the local indigo and un-premultiply the color
    w, h = src.size
    inset = int(w * 0.24)
    region = src.crop((inset, inset, w - inset, h - inset)).convert('RGB')
    out = Image.new('RGBA', region.size)
    rp, op = region.load(), out.load()
    bg = (0x20, 0x18, 0x50)
    for y in range(region.size[1]):
        for x in range(region.size[0]):
            r, g, b = rp[x, y]
            a = max(0.0, min(1.0, (g - 50) / 140))
            if a <= 0:
                op[x, y] = (0, 0, 0, 0)
                continue
            fg = tuple(max(0, min(255, round((c - (1 - a) * k) / a))) for c, k in zip((r, g, b), bg))
            op[x, y] = (*fg, round(a * 255))
    return out.crop(out.getbbox())


def place(moon, size, share):
    target = int(size * share)
    scale = target / max(moon.size)
    resized = moon.resize((round(moon.size[0] * scale), round(moon.size[1] * scale)), Image.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((size - resized.size[0]) // 2, (size - resized.size[1]) // 2))
    return canvas


def main():
    src = Image.open(sys.argv[1])
    moon = extract_moon(src)

    background = indigo_gradient(SIZE)
    background.save(OUT / 'android-icon-background.png')

    foreground = place(moon, SIZE, MOON_SHARE)
    foreground.save(OUT / 'android-icon-foreground.png')

    alpha = foreground.getchannel('A')
    mono = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
    mono.putalpha(alpha)
    mono.save(OUT / 'android-icon-monochrome.png')

    # legacy square icon (pre-26 launchers, web): the same two layers, cropped
    # to the visible 72/108 of the adaptive canvas and rounded
    legacy = background.convert('RGBA')
    legacy.alpha_composite(foreground)
    crop = int(SIZE * 18 / 108)
    legacy = legacy.crop((crop, crop, SIZE - crop, SIZE - crop)).resize((SIZE, SIZE), Image.LANCZOS)
    mask = Image.new('L', (SIZE * 4, SIZE * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE * 4 - 1, SIZE * 4 - 1), radius=SIZE * 4 * 0.225, fill=255)
    legacy.putalpha(mask.resize((SIZE, SIZE), Image.LANCZOS).filter(ImageFilter.SMOOTH))
    legacy.save(OUT / 'icon.png')

    # splash: the crescent alone on transparent; expo-splash-screen paints
    # the #0a1520 background behind it
    place(moon, 512, 0.9).save(OUT / 'splash-icon.png')


if __name__ == '__main__':
    main()
