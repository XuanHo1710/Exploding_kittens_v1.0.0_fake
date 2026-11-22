"""REGIONAL restyle layer: every base civic building gets one variant per gym region, so a city never
mixes styles. Slug pattern `<base>-<type>` for the 8 gym types (fire, water, grass, electric, psychic,
poison, ground, rock). pokemon-center, poke-mart and the house-* shells are skipped: civic/themed.py
already designs pokemon-center-<type>, poke-mart-<type> and house-<type> by hand.

How it works (no per-building code):
- The base exterior function runs unchanged on a RecolourScene proxy that maps every colour of the
  shared civickit / gymkit ramps (walls, roofs, wood, stone, brick, slate, steel, glass) onto the
  region's ramp at the same tone index. The ramps are the gym materials from civic/themed.py, so
  saturation stays in the gym range and the city reads as one place.
- Geometry is untouched: same canvas, body, silhouette / crown, door strip and door-json cell as the
  base building; the base interior is reused.
- Region accents (themed.py props: braziers, coral + glass bollard, topiaries, transformer, obelisks,
  toadstools, cactus + clay pot, crystals) stand in the outer metatile column on each side of the
  body, only where the base building left that ground free.
"""
import civickit as CK
import core
import landmarks
import mid
import shops
import themed as TH
import gymkit as GK

TYPES = TH.TYPES
SKIP = {"pokemon-center", "poke-mart"}

# ---------------------------------------------------------------- region ramp sets (all from themed.py)
WOODW = CK.WOODW
REGION = {
    #            walls      stone      roof        wood       brick      trim (slate) metal (steel)  glass
    "fire":     (TH.WSTONE, TH.WSTONE, TH.FBRICK, WOODW,     TH.FBRICK, TH.BRONZE, TH.BRONZE, None),
    "water":    (TH.STUCCO, TH.WROCK,  TH.SEAROOF, WOODW,    TH.STUCCO, TH.SEAGL,  TH.SEAGL,  TH.GLASS_SEA),
    "grass":    (TH.GCREAM, TH.STONEW, TH.GROOF,  TH.TIMBER, TH.POT,    TH.TIMBER, TH.TIMBER, None),
    "electric": (TH.STL,    TH.STL,    TH.NAVY,   TH.STL,    TH.STL,    TH.NAVY,   TH.NAVY,   None),
    "psychic":  (TH.MARBLE, TH.MARBLE, TH.CELLA,  TH.CELLA,  TH.MARBLE, TH.GOLD,   TH.GOLD,   None),
    "poison":   (TH.PLANK,  TH.HOOP,   TH.MOSS,   TH.PLANK,  TH.PLANK,  TH.PIRON,  TH.PIRON,  TH.GLASS_BOTTLE),
    "ground":   (TH.SAND,   TH.SAND,   TH.TERRA,  TH.GTIMBER, TH.TERRA, TH.GTIMBER, TH.GTIMBER, None),
    "rock":     (TH.MEN,    TH.MEN,    TH.RSLATE, WOODW,     TH.MEN,    TH.RIRON,  TH.RIRON,  None),
}


def colour_map(kind):
    walls, stone, roof, wood, brick, trim, metal, glass = REGION[kind]
    pairs = [(CK.SLATE, trim), (CK.STEELC, metal), (GK.STEEL, metal), (GK.STONE, stone), (GK.WOOD, wood)]
    pairs += [(r, roof) for name, r in CK.ROOF.items() if name != "slate"]
    pairs += [(CK.CREAM, walls), (CK.WHITE, walls), (CK.STONEC, stone), (CK.WOODW, wood), (CK.BRICK, brick)]
    if glass:
        pairs.append((CK.GLASS, glass))
    m = {}
    for src, dst in pairs:
        for i, c in enumerate(src):
            c = CK.rgb(c)
            if c not in m:
                m[c] = CK.rgb(dst[min(i, len(dst) - 1)])
    return m


class RecolourScene:
    """Proxy for boxkit.Scene: every colour going into box / sculpt is passed through `m`."""

    def __init__(self, sc, m):
        self._sc, self._m = sc, m

    def __getattr__(self, name):
        return getattr(self._sc, name)

    def _c(self, c):
        if c is None or isinstance(c, str):
            return c
        if isinstance(c, tuple) and len(c) == 2 and isinstance(c[0], tuple):
            return (self._m.get(c[0], c[0]), c[1])
        if isinstance(c, tuple):
            return self._m.get(c, c)
        return c

    def _f(self, f):
        if f is None:
            return None
        if callable(f):
            return lambda *a: self._c(f(*a))
        return self._c(f)

    def box(self, x0, x1, d0, d1, h0, h1, top=None, front=None, side=None, shadow=True, edge=None):
        return self._sc.box(x0, x1, d0, d1, h0, h1, top=self._f(top), front=self._f(front), side=self._f(side),
                            shadow=shadow, edge=self._c(edge))

    def sculpt(self, x0, x1, d0, d1, h0, h1, inside_fn, color_fn, shadow=True, edge=None):
        return self._sc.sculpt(x0, x1, d0, d1, h0, h1, inside_fn, self._f(color_fn), shadow=shadow,
                               edge=self._c(edge))


# ---------------------------------------------------------------- region accents (outer metatile columns)
def free(sc, B, cx, w=6, rise=22):
    """True when the base building left the ground around column cx empty (no prop already there)."""
    if cx - w < 1 or cx + w >= sc.w - 1:
        return False
    a = sc.img.load()
    for y in range(max(0, B.G - rise), min(sc.h, B.G + 8)):
        for x in range(cx - w, cx + w + 1):
            if a[x, y][3]:
                return False
    return True


def accents(kind, sc, B, night):
    L, R = B.x0 - 8, B.x1 + 8
    fl, fr = free(sc, B, L), free(sc, B, R)
    if kind == "fire":
        fl and TH.brazier(sc, L, night)
        fr and TH.brazier(sc, R, night)
    elif kind == "water":
        fl and TH.coral(sc, L)
        fr and TH.bollard(sc, R, night)
    elif kind == "grass":
        fl and TH.topiary(sc, L)
        fr and TH.topiary(sc, R)
    elif kind == "electric":
        fr and TH.transformer(sc, R, night)
        fl and TH.rod(sc, L, -2, 0, 16, night)
    elif kind == "psychic":
        fl and TH.obelisk(sc, L, night)
        fr and TH.obelisk(sc, R, night)
    elif kind == "poison":
        if fl:
            TH.toadstool(sc, L - 1, 1.0)
            TH.toadstool(sc, L + 4, 0.6, d=-1)
        fr and TH.toadstool(sc, R, 0.9)
    elif kind == "ground":
        fl and TH.cactus_pot(sc, L, flip=1)
        fr and TH.clay_pot(sc, R - 1)
    elif kind == "rock":
        fl and TH.crystal(sc, L, night)
        fr and TH.crystal(sc, R - 1, night)


def regional_exterior(base_ext, kind):
    m = colour_map(kind)

    def ext(sc, B, t, night):
        base_ext(RecolourScene(sc, m), B, t, night)
        accents(kind, sc, B, night)
    return ext


# ---------------------------------------------------------------- specs
SPECS = {}
for module in (core, shops, mid, landmarks):
    for slug, spec in module.SPECS.items():
        if slug in SKIP or slug.startswith("house-"):
            continue
        for k in TYPES:
            SPECS[f"{slug}-{k}"] = dict(spec, name=f"{spec['name']} ({k} region)",
                                        exterior=regional_exterior(spec["exterior"], k), region=k, base=slug)
