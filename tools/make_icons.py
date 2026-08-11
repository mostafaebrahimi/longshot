#!/usr/bin/env python3
"""Render the Longshot icon set.

The mark: a tall page (the thing being captured) with a stitch seam across it
and an arrow travelling down — the whole product in one glyph. Drawn large and
downsampled so the 16px version stays crisp.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SIZES = (16, 32, 48, 128)
MASTER = 1024

AMBER = (255, 138, 61, 255)
AMBER_DEEP = (236, 111, 34, 255)
INK = (16, 18, 22, 255)
LINE = (58, 64, 75, 255)


def rounded(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def render(size: int) -> Image.Image:
    s = MASTER
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Body: amber tile with a slightly deeper base for weight at small sizes.
    rounded(d, (0, 0, s - 1, s - 1), radius=int(s * 0.235), fill=AMBER_DEEP)
    rounded(d, (0, 0, s - 1, int(s * 0.965)), radius=int(s * 0.235), fill=AMBER)

    # The page: a tall dark panel with a browser bar across its top.
    pw, ph = int(s * 0.58), int(s * 0.72)
    px, py = (s - pw) // 2, int(s * 0.14)
    radius = int(s * 0.07)
    rounded(d, (px, py, px + pw, py + ph), radius=radius, fill=INK)
    bar = int(ph * 0.15)
    rounded(d, (px, py, px + pw, py + bar + radius), radius=radius, fill=LINE)
    d.rectangle((px, py + bar, px + pw, py + bar + radius), fill=INK)

    # The capture runs down the page. Its shaft is segmented: three captured
    # screens stacked into one image, which is the whole idea of the product.
    cx = s // 2
    shaft_w = int(s * 0.10)
    top = py + int(ph * 0.30)
    bottom = py + int(ph * 0.64)
    seg_gap = int(s * 0.028)
    seg_h = (bottom - top - seg_gap * 2) / 3
    for i in range(3):
        y = top + i * (seg_h + seg_gap)
        d.rectangle((cx - shaft_w // 2, int(y), cx + shaft_w // 2, int(y + seg_h)), fill=AMBER)
    head = int(s * 0.135)
    d.polygon(
        [
            (cx - head, bottom + seg_gap),
            (cx + head, bottom + seg_gap),
            (cx, bottom + seg_gap + int(head * 1.2)),
        ],
        fill=AMBER,
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(exist_ok=True)
    for size in SIZES:
        out = ICONS / f"icon-{size}.png"
        render(size).save(out)
        print(f"wrote {out.relative_to(ROOT)}")
    render(512).save(ICONS / "icon-512.png")
    print("wrote icons/icon-512.png (store listing)")


if __name__ == "__main__":
    main()
