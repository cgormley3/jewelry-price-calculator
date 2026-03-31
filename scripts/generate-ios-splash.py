#!/usr/bin/env python3
"""Generate iOS PWA launch images (apple-touch-startup-image) under public/splash-ios/.

Re-run after changing app/icon.png:
  python3 scripts/generate-ios-splash.py
"""

from __future__ import annotations

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_PATH = os.path.join(ROOT, "app", "icon.png")
OUT_DIR = os.path.join(ROOT, "public", "splash-ios")

# Tailwind stone-50 — matches main app shell
BG = (250, 250, 249)

# Portrait launch sizes (width x height px) for common iPhones / iPads.
SIZES: list[tuple[str, int, int]] = [
    ("1320x2868", 1320, 2868),
    ("1206x2622", 1206, 2622),
    ("1290x2796", 1290, 2796),
    ("1179x2556", 1179, 2556),
    ("1170x2532", 1170, 2532),
    ("1284x2778", 1284, 2778),
    ("1125x2436", 1125, 2436),
    ("1242x2688", 1242, 2688),
    ("828x1792", 828, 1792),
    ("750x1334", 750, 1334),
    ("1080x2340", 1080, 2340),
    ("2048x2732", 2048, 2732),
    ("1668x2388", 1668, 2388),
    ("1668x2224", 1668, 2224),
    ("1620x2160", 1620, 2160),
]


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    icon = Image.open(ICON_PATH).convert("RGBA")

    for name, w, h in SIZES:
        canvas = Image.new("RGB", (w, h), BG)
        target = max(96, int(min(w, h) * 0.19))
        ratio = target / max(icon.size)
        nw = max(1, int(icon.size[0] * ratio))
        nh = max(1, int(icon.size[1] * ratio))
        lg = icon.resize((nw, nh), Image.Resampling.LANCZOS)
        x, y = (w - nw) // 2, (h - nh) // 2
        canvas.paste(lg, (x, y), lg)
        out = os.path.join(OUT_DIR, f"splash-{name}.png")
        canvas.save(out, "PNG", optimize=True)
        print(out)

    print(f"Wrote {len(SIZES)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
