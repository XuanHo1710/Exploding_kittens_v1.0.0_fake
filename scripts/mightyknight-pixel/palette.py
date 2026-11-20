#!/usr/bin/env python3
"""
Mighty Knight 2.5D Pixel — 1:1 Native Pixel Art Toolkit & Dark-Fantasy 32-Color Palette.

Guarantees:
- Pure integer pixel rasterization (NO Lanczos, NO anti-aliasing).
- Strict binary alpha (0 or 255) helper for character sprites.
- Crisp 1px dark plum-indigo outline (#140c1c) pass.
- Bayer 2x2 pixel dithering for retro 16-bit shading.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple
from PIL import Image

RGBA = Tuple[int, int, int, int]

# Curated 32-color Dark-Fantasy Pixel Palette (inspired by Endesga-32)
OUTLINE: RGBA = (20, 12, 28, 255)        # #140c1c crisp 1px dark plum outline
TRANSP: RGBA = (0, 0, 0, 0)

PAL: Dict[str, RGBA] = {
    "ink": (20, 12, 28, 255),
    "void": (32, 22, 46, 255),
    "slate_dk": (46, 52, 74, 255),
    "slate": (88, 99, 126, 255),
    "slate_lt": (152, 166, 194, 255),
    "silver": (214, 224, 240, 255),
    "white": (248, 250, 255, 255),
    "skin_sh": (176, 114, 86, 255),
    "skin": (228, 168, 126, 255),
    "skin_hi": (250, 208, 168, 255),
    "wood_dk": (74, 42, 32, 255),
    "wood": (122, 70, 44, 255),
    "wood_lt": (168, 108, 66, 255),
    "red_dk": (124, 24, 42, 255),
    "red": (212, 44, 58, 255),
    "red_hi": (252, 108, 92, 255),
    "orange": (244, 134, 44, 255),
    "gold_dk": (176, 112, 22, 255),
    "gold": (242, 194, 48, 255),
    "gold_hi": (255, 244, 152, 255),
    "green_dk": (22, 82, 54, 255),
    "green": (44, 158, 82, 255),
    "green_hi": (124, 226, 112, 255),
    "cyan_dk": (18, 96, 132, 255),
    "cyan": (34, 184, 214, 255),
    "cyan_hi": (146, 238, 252, 255),
    "blue_dk": (28, 56, 138, 255),
    "blue": (56, 122, 236, 255),
    "blue_hi": (128, 188, 255, 255),
    "purple_dk": (68, 28, 116, 255),
    "purple": (146, 68, 222, 255),
    "purple_hi": (210, 146, 255, 255),
    "bone_sh": (148, 142, 136, 255),
    "bone": (218, 210, 194, 255),
    "bone_hi": (246, 242, 232, 255),
}

BAYER2 = ((0, 2), (3, 1))


def hex_rgba(h: str, a: int = 255) -> RGBA:
    s = h.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), a)


def tint_ramp(base: RGBA) -> Tuple[RGBA, RGBA, RGBA]:
    """Return crisp (hi, mid, sh) pixel ramp from a base RGBA."""
    r, g, b, a = base
    hi = (min(255, int(r + (255 - r) * 0.42)), min(255, int(g + (255 - g) * 0.40)), min(255, int(b + (255 - b) * 0.30)), a)
    sh = (max(0, int(r * 0.56)), max(0, int(g * 0.52)), min(255, int(b * 0.68 + 12)), a)
    return hi, base, sh


class PixelCanvas:
    """1:1 native integer pixel canvas (zero anti-aliasing)."""

    def __init__(self, w: int, h: int) -> None:
        self.w = w
        self.h = h
        self.img = Image.new("RGBA", (w, h), TRANSP)
        self.px = self.img.load()

    def put(self, x: int, y: int, col: RGBA) -> None:
        ix = int(round(x))
        iy = int(round(y))
        if 0 <= ix < self.w and 0 <= iy < self.h:
            if col[3] == 0:
                return
            if col[3] == 255:
                self.px[ix, iy] = col
            else:
                # Discrete pixel alpha blend for VFX/terrains only
                dr, dg, db, da = self.px[ix, iy]
                sa = col[3] / 255.0
                inv = 1.0 - sa
                nr = int(col[0] * sa + dr * inv)
                ng = int(col[1] * sa + dg * inv)
                nb = int(col[2] * sa + db * inv)
                na = min(255, int(col[3] + da * inv))
                self.px[ix, iy] = (nr, ng, nb, na)

    def rect(self, x: int, y: int, w: int, h: int, col: RGBA, dither: Optional[RGBA] = None) -> None:
        x0, y0 = int(round(x)), int(round(y))
        for py in range(y0, y0 + int(round(h))):
            for px in range(x0, x0 + int(round(w))):
                if dither is not None and (px + py) % 2 == 1:
                    self.put(px, py, dither)
                else:
                    self.put(px, py, col)

    def shaded_rect(self, x: int, y: int, w: int, h: int, ramp: Tuple[RGBA, RGBA, RGBA]) -> None:
        hi, mid, sh = ramp
        x0, y0, iw, ih = int(round(x)), int(round(y)), int(round(w)), int(round(h))
        for py in range(y0, y0 + ih):
            for px in range(x0, x0 + iw):
                if py == y0 or px == x0:
                    self.put(px, py, hi)
                elif py >= y0 + ih - 1 or px >= x0 + iw - 1:
                    self.put(px, py, sh)
                else:
                    self.put(px, py, mid)

    def ellipse(self, cx: float, cy: float, rx: float, ry: float, col: RGBA, dither: Optional[RGBA] = None) -> None:
        if rx <= 0 or ry <= 0:
            return
        x0, x1 = int(math.floor(cx - rx)), int(math.ceil(cx + rx))
        y0, y1 = int(math.floor(cy - ry)), int(math.ceil(cy + ry))
        for py in range(y0, y1 + 1):
            for px in range(x0, x1 + 1):
                dx = (px - cx) / rx
                dy = (py - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    if dither is not None and BAYER2[py & 1][px & 1] >= 2:
                        self.put(px, py, dither)
                    else:
                        self.put(px, py, col)

    def shaded_ellipse(self, cx: float, cy: float, rx: float, ry: float, ramp: Tuple[RGBA, RGBA, RGBA]) -> None:
        hi, mid, sh = ramp
        if rx <= 0 or ry <= 0:
            return
        x0, x1 = int(math.floor(cx - rx)), int(math.ceil(cx + rx))
        y0, y1 = int(math.floor(cy - ry)), int(math.ceil(cy + ry))
        for py in range(y0, y1 + 1):
            for px in range(x0, x1 + 1):
                dx = (px - cx) / rx
                dy = (py - cy) / ry
                d2 = dx * dx + dy * dy
                if d2 <= 1.0:
                    if dx + dy < -0.45:
                        self.put(px, py, hi)
                    elif dx + dy > 0.55:
                        self.put(px, py, sh)
                    else:
                        self.put(px, py, mid)

    def line(self, x0: float, y0: float, x1: float, y1: float, col: RGBA, thickness: int = 1) -> None:
        ix0, iy0 = int(round(x0)), int(round(y0))
        ix1, iy1 = int(round(x1)), int(round(y1))
        dx = abs(ix1 - ix0)
        dy = abs(iy1 - iy0)
        sx = 1 if ix0 < ix1 else -1
        sy = 1 if iy0 < iy1 else -1
        err = dx - dy
        r = max(0, thickness - 1)
        while True:
            if r == 0:
                self.put(ix0, iy0, col)
            else:
                for oy in range(-r, r + 1):
                    for ox in range(-r, r + 1):
                        if ox * ox + oy * oy <= r * r + 1:
                            self.put(ix0 + ox, iy0 + oy, col)
            if ix0 == ix1 and iy0 == iy1:
                break
            e2 = err * 2
            if e2 > -dy:
                err -= dy
                ix0 += sx
            if e2 < dx:
                err += dx
                iy0 += sy

    def poly(self, pts: Sequence[Tuple[float, float]], col: RGBA) -> None:
        if len(pts) < 3:
            return
        min_y = max(0, int(math.floor(min(p[1] for p in pts))))
        max_y = min(self.h - 1, int(math.ceil(max(p[1] for p in pts))))
        n = len(pts)
        for py in range(min_y, max_y + 1):
            nodes: List[float] = []
            j = n - 1
            for i in range(n):
                yi, yj = pts[i][1], pts[j][1]
                if (yi < py + 0.5 <= yj) or (yj < py + 0.5 <= yi):
                    xi, xj = pts[i][0], pts[j][0]
                    nodes.append(xi + (py + 0.5 - yi) / (yj - yi) * (xj - xi))
                j = i
            nodes.sort()
            for k in range(0, len(nodes) - 1, 2):
                x0 = int(math.floor(nodes[k]))
                x1 = int(math.ceil(nodes[k + 1]))
                for px in range(x0, x1 + 1):
                    self.put(px, py, col)

    def add_outline(self, color: RGBA = OUTLINE) -> None:
        """Crisp 4-neighbor 1px pixel outline around opaque pixels."""
        src = self.img.copy().load()
        for y in range(self.h):
            for x in range(self.w):
                if src[x, y][3] == 0:
                    has_nb = (
                        (x > 0 and src[x - 1, y][3] > 0)
                        or (x + 1 < self.w and src[x + 1, y][3] > 0)
                        or (y > 0 and src[x, y - 1][3] > 0)
                        or (y + 1 < self.h and src[x, y + 1][3] > 0)
                    )
                    if has_nb:
                        self.px[x, y] = color

    def enforce_binary_alpha(self) -> None:
        for y in range(self.h):
            for x in range(self.w):
                r, g, b, a = self.px[x, y]
                if a >= 128:
                    self.px[x, y] = (r, g, b, 255)
                else:
                    self.px[x, y] = TRANSP


def rot(px: float, py: float, ox: float, oy: float, deg: float) -> Tuple[float, float]:
    rad = math.radians(deg)
    ca, sa = math.cos(rad), math.sin(rad)
    dx, dy = px - ox, py - oy
    return (ox + dx * ca - dy * sa, oy + dx * sa + dy * ca)
