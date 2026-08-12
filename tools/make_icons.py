#!/usr/bin/env python3
"""Render the Longshot icon set.

The mark: a browser frame with a seam across it and an arrow travelling down —
the whole product in one glyph. It is the same drawing as the .mark element in
the popup, options and editor headers (and icons/mark.svg, the page favicon),
so the app has exactly one logo.

Drawn on a 24-unit grid at 1024px and downsampled so the 16px version stays
crisp. Strokes get a floor at the small sizes: scaled faithfully, the 1.6-unit
line lands under a pixel at 16px and greys out.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SIZES = (16, 32, 48, 128)
MASTER = 1024

# The in-app mark sits on an amber wash over the dark surface. An icon has no
# surface behind it, so the wash is pre-blended here: --amber-500 at 16% over
# --ink-800, its border at 30%, the seam lines at 45%.
AMBER = (255, 138, 61, 255)
TILE = (59, 42, 34, 255)
TILE_EDGE = (118, 71, 42, 255)
SEAM = (147, 85, 46, 255)

GRID = 24.0  # the mark's coordinate space, matching the inline SVG
MIN_STROKE_PX = 1.15  # keep lines this wide once downsampled


def glyph_span(size: int) -> float:
    """How much of the tile the mark spans. It grows as the icon shrinks: at
    toolbar sizes the padding is worth more as glyph than as margin."""
    if size <= 16:
        return 0.82
    if size <= 32:
        return 0.74
    return 0.62


def render(size: int) -> Image.Image:
    s = MASTER
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    span = s * glyph_span(size)
    unit = span / GRID
    origin = (s - span) / 2.0

    def at(x: float, y: float) -> tuple[float, float]:
        return (origin + x * unit, origin + y * unit)

    # Scaling the stroke honestly leaves 16px with a sub-pixel line, so hold a
    # floor in final-image pixels and convert it back to master units.
    stroke = max(1.6 * unit, MIN_STROKE_PX * s / size)
    w = int(round(stroke))

    def line(a, b, fill, cap=False):
        d.line([at(*a), at(*b)], fill=fill, width=w)
        if cap:  # PIL has no round cap; lay a dot at each end
            for point in (a, b):
                cx, cy = at(*point)
                r = w / 2.0
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill)

    # Tile. Its edge is a hairline the 16px grid cannot hold, so it is dropped
    # there rather than smeared into a muddy ring.
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.235), fill=TILE)
    if size > 16:
        d.rounded_rectangle(
            (0, 0, s - 1, s - 1),
            radius=int(s * 0.235),
            outline=TILE_EDGE,
            width=max(2, int(s * 0.018)),
        )

    # The browser frame.
    d.rounded_rectangle(
        (*at(3, 3), *at(21, 21)), radius=int(4 * unit), outline=AMBER, width=w
    )

    # The seam: where one captured screen meets the next. Frame, seam and arrow
    # cannot all read inside 16px — the seam is the one the glyph survives losing.
    if size > 16:
        line((3, 9), (21, 9), SEAM)
        line((8, 3), (8, 21), SEAM)

    # The capture running down the page.
    line((12, 12.5), (12, 17), AMBER, cap=True)
    line((12, 17), (14, 15), AMBER, cap=True)
    line((12, 17), (10, 15), AMBER, cap=True)

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
