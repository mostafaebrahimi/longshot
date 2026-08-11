#!/usr/bin/env python3
"""Compose the Chrome Web Store listing images from the raw UI screenshots.

Run tools/capture-ui.mjs first — this only frames what that produced.

Outputs
  store/screenshots/01..05-*.png   1280x800 listing screenshots
  store/promo/small-tile.png       440x280  required promo tile
  store/promo/marquee.png          1400x560 optional marquee
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "store/screenshots/raw"
SHOTS = ROOT / "store/screenshots"
PROMO = ROOT / "store/promo"

INK = (16, 18, 22)
PANEL = (28, 31, 38)
LINE = (44, 49, 58)
FG = (232, 234, 237)
DIM = (150, 157, 168)
AMBER = (255, 138, 61)

DISPLAY = "/usr/share/fonts/opentype/league-spartan/LeagueSpartan-Bold.otf"
DISPLAY_MED = "/usr/share/fonts/opentype/league-spartan/LeagueSpartan-Medium.otf"
BODY = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

SLIDES = [
    (
        "editor-fresh",
        "wide",
        "01",
        "One click. The whole page.",
        "Longshot scrolls the page for you and stitches every screen into a single image.",
    ),
    (
        "editor-annotated",
        "wide",
        "02",
        "Mark it up before you send it",
        "Arrows, text, numbered steps and highlights — plus blur for anything private.",
    ),
    (
        "editor-zoomed",
        "wide",
        "03",
        "Crop, zoom, and land on the detail",
        "The rail on the right keeps your place in a screenshot ten screens long.",
    ),
    (
        "popup",
        "inset",
        "04",
        "Two shortcuts, no menus",
        "Alt+Shift+P takes the whole page. Alt+Shift+V takes what is on screen.",
    ),
    (
        "options",
        "wide",
        "05",
        "Tuned for stubborn pages",
        "Pre-scroll for lazy images, hide sticky bars, and give slow pages more time.",
    ),
]


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def backdrop(w: int, h: int) -> Image.Image:
    """Graphite field with one warm glow — the same air as the editor stage."""
    img = Image.new("RGB", (w, h), INK)
    glow = Image.new("RGB", (w, h), INK)
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-w * 0.25, -h * 0.55, w * 0.55, h * 0.45), fill=(58, 34, 18))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(w // 8)), 0.85)

    dots = ImageDraw.Draw(img)
    step = 28
    for y in range(0, h, step):
        for x in range(0, w, step):
            dots.point((x, y), fill=(30, 33, 39))
    return img


def rounded_shot(src: Image.Image, width: int, radius: int = 12) -> Image.Image:
    scale = width / src.width
    img = src.convert("RGB").resize((width, max(1, round(src.height * scale))), Image.LANCZOS)

    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)

    frame = ImageDraw.Draw(out)
    frame.rounded_rectangle((0, 0, out.width - 1, out.height - 1), radius, outline=(70, 76, 88), width=2)
    return out


def paste_with_shadow(canvas: Image.Image, shot: Image.Image, at: tuple[int, int]) -> None:
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    block = Image.new("RGBA", shot.size, (0, 0, 0, 150))
    block.putalpha(shot.getchannel("A").point(lambda v: int(v * 0.75)))
    shadow.paste(block, (at[0], at[1] + 18), block)
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.paste(Image.alpha_composite(canvas.convert("RGBA"), shadow).convert("RGB"), (0, 0))
    canvas.paste(shot, at, shot)


def wrap(draw, text, fnt, max_width):
    words, lines, line = text.split(), [], ""
    for word in words:
        probe = f"{line} {word}".strip()
        if draw.textlength(probe, font=fnt) <= max_width:
            line = probe
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def slide(name: str, layout: str, index: str, headline: str, sub: str) -> Image.Image:
    W, H = 1280, 800
    canvas = backdrop(W, H)
    d = ImageDraw.Draw(canvas)
    margin = 64

    d.text((margin, 52), f"LONGSHOT · {index}", font=font(MONO, 15), fill=(150, 110, 78))

    head_font = font(DISPLAY, 46)
    y = 84
    for line in wrap(d, headline, head_font, W - margin * 2):
        d.text((margin, y), line, font=head_font, fill=FG)
        y += 52

    sub_font = font(BODY, 17)
    y += 6
    for line in wrap(d, sub, sub_font, 760):
        d.text((margin, y), line, font=sub_font, fill=DIM)
        y += 26

    src = Image.open(RAW / f"{name}.png")
    top = max(y + 34, 214)

    if layout == "inset":
        shot = rounded_shot(src, round(src.width * (H - top - 40) / src.height), radius=14)
        paste_with_shadow(canvas, shot, ((W - shot.width) // 2, top))
    else:
        shot = rounded_shot(src, W - margin * 2, radius=14)
        paste_with_shadow(canvas, shot, (margin, top))

    return canvas


def small_tile() -> Image.Image:
    W, H = 440, 280
    canvas = backdrop(W, H)
    d = ImageDraw.Draw(canvas)

    icon = Image.open(ROOT / "icons/icon-512.png").resize((72, 72), Image.LANCZOS)
    canvas.paste(icon, (40, 52), icon)

    d.text((130, 60), "Longshot", font=font(DISPLAY, 40), fill=FG)
    d.text((132, 108), "FULL PAGE CAPTURE", font=font(MONO, 14), fill=(150, 110, 78))
    d.text((40, 168), "Capture an entire page,", font=font(BODY, 17), fill=DIM)
    d.text((40, 194), "annotate it, save it. No uploads.", font=font(BODY, 17), fill=DIM)

    # The stitch ladder, filling left to right along the base.
    for i in range(14):
        x = 40 + i * 26
        lit = i < 9
        d.rounded_rectangle((x, 240, x + 18, 244), 2, fill=AMBER if lit else LINE)
    return canvas


def marquee() -> Image.Image:
    W, H = 1400, 560
    canvas = backdrop(W, H)
    d = ImageDraw.Draw(canvas)

    icon = Image.open(ROOT / "icons/icon-512.png").resize((80, 80), Image.LANCZOS)
    canvas.paste(icon, (80, 96), icon)

    d.text((80, 200), "Longshot", font=font(DISPLAY, 76), fill=FG)
    d.text((84, 288), "FULL PAGE SCREENSHOT", font=font(MONO, 18), fill=(150, 110, 78))
    for i, line in enumerate(
        ["One click captures the whole page —", "then crop, annotate, and save it as", "PNG, JPG or PDF."]
    ):
        d.text((80, 330 + i * 30), line, font=font(BODY, 20), fill=DIM)

    src = Image.open(RAW / "editor-annotated.png")
    shot = rounded_shot(src, 760, radius=16)
    paste_with_shadow(canvas, shot, (620, 90))
    return canvas


def main() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    PROMO.mkdir(parents=True, exist_ok=True)

    for name, layout, index, headline, sub in SLIDES:
        out = SHOTS / f"{index}-{name}.png"
        slide(name, layout, index, headline, sub).save(out)
        print(f"wrote {out.relative_to(ROOT)}  1280x800")

    small_tile().save(PROMO / "small-tile.png")
    print("wrote store/promo/small-tile.png  440x280")
    marquee().save(PROMO / "marquee.png")
    print("wrote store/promo/marquee.png  1400x560")


if __name__ == "__main__":
    main()
