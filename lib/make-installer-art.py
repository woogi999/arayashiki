"""The installer's pictures (src-tauri/installer/), drawn from the app's mark.

    python lib/make-installer-art.py      (needs Pillow: pip install pillow)

NSIS wants 24-bit BMPs at fixed sizes: the sidebar of the Welcome and Finish
pages (164x314) and the header strip of the other pages (150x57). Both are
the start screen in miniature: the katana in lime on the viewport's grey,
over a 1-stud floor in perspective, with the name in IBM Plex Sans. Drawn at
4x and scaled down, so the edges stay smooth. A sidebar and header at 2x are
written too, for reference; NSIS itself takes the 1x files.
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "installer"
MARK = ROOT / "src-tauri" / "icons" / "app-icon.png"
FONTS = ROOT / "node_modules" / "@fontsource" / "ibm-plex-sans" / "files"
SS = 4  # supersampling

LIME = (200, 245, 66)
TOP = (40, 40, 40)
BOTTOM = (18, 18, 18)


def font(weight, size):
    return ImageFont.truetype(str(FONTS / f"ibm-plex-sans-latin-{weight}-normal.woff"), size)


def gradient(w, h, top=TOP, bottom=BOTTOM):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        for x in range(w):
            px[x, y] = c
    return im


def glow(size, radius, alpha):
    """A soft lime disc, as the start screen's glow behind the mark."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size // 2
    d.ellipse((c - radius, c - radius, c + radius, c + radius), fill=(*LIME, alpha))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.55))


def floor(w, h, horizon, color=(50, 50, 50), major=(64, 64, 64)):
    """Rows a stud apart running off to a vanishing point, fading upward."""
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, depth = w / 2, h - horizon
    for z in range(1, 120):
        y = horizon + depth * 4 / (z + 3)
        if y - horizon < SS:
            break
        d.line((0, y, w, y), fill=major if z % 5 == 0 else color, width=SS)
    for x in range(-40, 41):
        d.line((cx, horizon, cx + x * 26 * SS, h + depth), fill=major if x % 5 == 0 else color, width=SS)
    # Fade into the grey toward the horizon.
    fade = Image.new("L", (1, h))
    for y in range(h):
        t = max(0.0, min(1.0, (y - horizon) / depth))
        fade.putpixel((0, y), round(235 * t**1.3))
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), fade.resize((w, h))))
    return layer


def mark(size):
    im = Image.open(MARK).convert("RGBA")
    return im.resize((size, size), Image.LANCZOS)


def paste_center(base, layer, cx, cy):
    base.alpha_composite(layer, (round(cx - layer.width / 2), round(cy - layer.height / 2)))


def text_center(d, cx, y, s, f, fill):
    l, t, r, b = d.textbbox((0, 0), s, font=f)
    d.text((cx - (r - l) / 2 - l, y), s, font=f, fill=fill)


def sidebar(scale=1):
    w, h = 164 * scale * SS, 314 * scale * SS
    u = scale * SS  # one pixel at the final size
    im = gradient(w, h).convert("RGBA")
    im.alpha_composite(floor(w, h, round(h * 0.56)))
    cy = round(h * 0.33)
    paste_center(im, glow(150 * u, 52 * u, 70), w / 2, cy)
    m = mark(106 * u)
    shadow = Image.new("RGBA", m.size, (0, 0, 0, 0))
    shadow.putalpha(m.getchannel("A").point(lambda a: a * 0.5))
    paste_center(im, shadow.filter(ImageFilter.GaussianBlur(6 * u)), w / 2, cy + 6 * u)
    paste_center(im, m, w / 2, cy)
    d = ImageDraw.Draw(im)
    text_center(d, w / 2, round(h * 0.60), "Arayashiki", font("600", 21 * u), (242, 242, 242, 255))
    text_center(d, w / 2, round(h * 0.60) + 30 * u, "Skill Builder for JJS", font("500", 10 * u), (150, 150, 150, 255))
    # A hairline down the right edge, where the page's white begins.
    d.line((w - u, 0, w - u, h), fill=(10, 10, 10, 255), width=u)
    return im.convert("RGB").resize((164 * scale, 314 * scale), Image.LANCZOS)


def header(scale=1):
    w, h = 150 * scale * SS, 57 * scale * SS
    u = scale * SS
    im = gradient(w, h, (36, 36, 36), (22, 22, 22)).convert("RGBA")
    cx, cy = 30 * u, h / 2
    paste_center(im, glow(70 * u, 20 * u, 70), cx, cy)
    paste_center(im, mark(40 * u), cx, cy)
    d = ImageDraw.Draw(im)
    d.text((56 * u, 14 * u), "Arayashiki", font=font("600", 16 * u), fill=(242, 242, 242, 255))
    d.text((56 * u, 34 * u), "Skill Builder for JJS", font=font("500", 8 * u), fill=(150, 150, 150, 255))
    return im.convert("RGB").resize((150 * scale, 57 * scale), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    sidebar().save(OUT / "sidebar.bmp")
    header().save(OUT / "header.bmp")
    sidebar(2).save(OUT / "sidebar@2x.png")
    header(2).save(OUT / "header@2x.png")
    print("Wrote", ", ".join(p.name for p in sorted(OUT.iterdir())))
