#!/usr/bin/env python3
"""
boxkit: tiny pixel-art "voxel box" renderer for Mons structures (procedural fallback
when no image generator is available, and a geometry reference for prompts).

World units are pixels. A box spans x in [x0, x1) (left -> right), d in [d0, d1)
(depth: 0 = front/south, larger = further back/north) and h in [h0, h1) (height).
Projection = the overworld camera of handheld RPGs with a slight cabinet shear so the
building reads as a cube:  screen = (X0 + x + round(K * d), G - h - d)
  - K = 0      -> pure Gen 3 style (front + top faces only): exteriors AND interiors (the default in gymkit)
  - K = 0.3-0.45 -> front + top + a narrow right side face (DS-style volume, not Gen 3; avoid)
Light comes from the top-left-back, so: top face brightest, front face mid,
right side face darkest; cast shadows fall to the right and slightly toward the viewer.

Face colour functions get (u, v, U, V): u/v are integer coords on the face (v = 0 at
the bottom of a front/side face, v = 0 at the front edge of a top face) and U/V its size.
They return an RGB tuple, or (RGB, True) to mark the pixel emissive (kept bright at night).
"""
from PIL import Image, ImageDraw

OUTLINE = (27, 23, 38)


def shade(c, f, hue=(0, 0, 0)):
    """Scale brightness by f and add a hue shift (cool shadows: hue=(-6, -2, 10))."""
    return tuple(max(0, min(255, int(c[i] * f + hue[i]))) for i in range(3))


def ramp(c):
    """5-tone ramp: highlight, light, base, shadow, deep (hue-shifted toward blue/purple)."""
    return [shade(c, 1.12, (14, 12, 8)), shade(c, 1.05, (6, 6, 4)), tuple(c),
            shade(c, .80, (-4, -4, 14)), shade(c, .60, (-6, -6, 22))]


class Scene:
    def __init__(self, w, h, x0, ground, k=0.4):
        self.w, self.h, self.X0, self.G, self.K = w, h, x0, ground, k
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.px = self.img.load()
        self.emissive = set()
        self.boxes = []
        self.sculpt_cols = []  # (x, d, h_min, h_max) columns for accurate cast shadows
        self._rec = None
        self.default_edge = None  # set to an RGB to outline every following box/sculpt

    def P(self, x, d, h):
        return self.X0 + x + int(round(self.K * d)), self.G - h - d

    def put(self, x, y, col):
        if self._rec is not None:
            self._rec.add((x, y))
        if 0 <= x < self.w and 0 <= y < self.h:
            em = isinstance(col, tuple) and len(col) == 2 and isinstance(col[0], tuple)
            c = col[0] if em else col
            self.px[x, y] = c + (255,)
            (self.emissive.add if em else self.emissive.discard)((x, y))

    @staticmethod
    def _fn(c):
        return c if callable(c) else (lambda u, v, U, V, c=c: c)

    def _finish_edge(self, edge):
        if edge:
            rec, self._rec = self._rec, None
            for (x, y) in rec:
                if any((x + dx, y + dy) not in rec for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    self.put(x, y, edge)

    def box(self, x0, x1, d0, d1, h0, h1, top=None, front=None, side=None, shadow=True, edge=None):
        """Draw a box (painter's order: call back-to-front, bottom-to-top).
        edge=RGB draws a 1 px selective outline just inside the box's silhouette."""
        edge = edge if edge is not None else self.default_edge
        self._rec = set() if edge else None
        self.boxes.append((x0, x1, d0, d1, h0, h1, shadow))
        U, D, H = x1 - x0, d1 - d0, h1 - h0
        if top is not None:
            f = self._fn(top)
            for d in range(d0, d1):
                for x in range(x0, x1):
                    self.put(*self.P(x, d, h1), f(x - x0, d - d0, U, D))
        if side is not None and self.K:
            f = self._fn(side)
            for d in range(d0 + 1, d1):
                for h in range(h0, h1):
                    self.put(*self.P(x1 - 1, d, h), f(d - d0, h - h0, D, H))
        if front is not None:
            f = self._fn(front)
            for h in range(h0, h1):
                for x in range(x0, x1):
                    self.put(*self.P(x, d0, h), f(x - x0, h - h0, U, H))
        self._finish_edge(edge)

    def sculpt(self, x0, x1, d0, d1, h0, h1, inside_fn, color_fn, shadow=True, edge=None):
        """Rasterize an arbitrary 3D volumetric shape (volcano cone, dome, mesa, spire)
        defined by inside_fn(x, d, h) -> bool. color_fn(x, d, h, face) receives
        face in ('top', 'front', 'side') and returns RGB or (RGB, True) for emissive."""
        edge = edge if edge is not None else self.default_edge
        self._rec = set() if edge else None
        U, D, H = x1 - x0, d1 - d0, h1 - h0
        occ = bytearray(U * D * H)
        for d in range(d0, d1):
            db = (d - d0) * H * U
            for h in range(h0, h1):
                hb = db + (h - h0) * U
                for x in range(x0, x1):
                    if inside_fn(x, d, h):
                        occ[hb + (x - x0)] = 1

        def solid(x, d, h):
            if x < x0 or x >= x1 or d < d0 or d >= d1 or h < h0 or h >= h1:
                return False
            return occ[((d - d0) * H + (h - h0)) * U + (x - x0)] != 0

        if shadow:
            for d in range(d0, d1):
                for x in range(x0, x1):
                    hmin, hmax = None, None
                    for h in range(h0, h1):
                        if solid(x, d, h):
                            if hmin is None:
                                hmin = h
                            hmax = h + 1
                    if hmax is not None and hmax - hmin >= 2:
                        self.sculpt_cols.append((x, d, hmin, hmax))

        put = self.put
        proj = self.P
        for d in range(d1 - 1, d0 - 1, -1):
            for h in range(h0, h1):
                for x in range(x0, x1):
                    if not solid(x, d, h):
                        continue
                    top_open = not solid(x, d, h + 1)
                    front_open = not solid(x, d - 1, h)
                    side_open = self.K and not solid(x + 1, d, h)
                    if not (top_open or front_open or side_open):
                        continue
                    if side_open:
                        put(*proj(x, d, h), color_fn(x, d, h, "side"))
                    if front_open:
                        put(*proj(x, d, h), color_fn(x, d, h, "front"))
                    if top_open:
                        put(*proj(x, d, h + 1), color_fn(x, d, h, "top"))
        self._finish_edge(edge)

    def outline(self, col=OUTLINE):
        pts = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[x, y][3] == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < self.w and 0 <= ny < self.h and self.px[nx, ny][3]:
                            pts.append((x, y))
                            break
        for p in pts:
            self.px[p] = col + (255,)

    def night(self, f=(.46, .50, .70), add=(0, 4, 40)):
        for y in range(self.h):
            for x in range(self.w):
                r, g, b, a = self.px[x, y]
                if a and (x, y) not in self.emissive and (r, g, b) != OUTLINE:
                    self.px[x, y] = (int(r * f[0] + add[0]), int(g * f[1] + add[1]),
                                     min(255, int(b * f[2] + add[2])), 255)

    def shadow_layer(self, light=(0.45, -0.22), rgba=(20, 12, 48, 96)):
        """RGBA ground layer: flat semi-dark cast shadow of boxes and sculpted volumes, minus the building."""
        mask = Image.new("L", (self.w, self.h), 0)
        dr = ImageDraw.Draw(mask)
        for x0, x1, d0, d1, h0, h1, cast in self.boxes:
            if not cast or h1 - h0 < 2:
                continue
            pts = []
            for x in (x0, x1):
                for d in (d0, d1):
                    for h in (0, h1):
                        pts.append(self.P(x + light[0] * h, d + light[1] * h, 0))
            dr.polygon(_hull(pts), fill=255)
        for x, d, hmin, hmax in self.sculpt_cols:
            p0 = self.P(x + light[0] * hmin, d + light[1] * hmin, 0)
            p1 = self.P(x + light[0] * hmax, d + light[1] * hmax, 0)
            dr.line([p0, p1], fill=255, width=2)
        lay = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        mp = mask.load()
        lp = lay.load()
        for y in range(self.h):
            for x in range(self.w):
                if mp[x, y] and not self.px[x, y][3]:
                    lp[x, y] = rgba
        return lay


def _hull(pts):
    pts = sorted(set((float(x), float(y)) for x, y in pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]
