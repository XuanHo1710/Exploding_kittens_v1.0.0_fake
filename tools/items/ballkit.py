#!/usr/bin/env python3
"""
ballkit: shared constants of the Mons Poké Ball sprite sheets (layout, balls, paths). Pillow only (agy's python3).

Sheet `assets/items/PokeBalls/<Folder>/<id>-ball.png`: 8 columns x 6 rows of square native cells (64 px, grown in steps of 8
when an effect would not fit; the sheet's .json gives `cell`), exported x2. Rows (frames used, left-aligned; the rest of the row is transparent):
  0 throw   8  closed ball spinning forward in flight (45 deg per frame, one full turn)
  1 open    4  lid half open, lid wide open, open + white flash burst, burst fading (Pokémon absorbed)
  2 shake   5  resting on the ground, tilt left 15 / 30 deg, tilt right 15 / 30 deg
  3 success 4  button click flash, ball darkened + 3 stars appear, stars arc out, stars fade
  4 break   4  jolt, lid bursts open, flash burst, fading sparks (no ball)
  5 icon    1  closed ball, front view
The ball is BALL_PX native px wide (24: twice the Gen 3 12 px ball, user request), centred in its cell; shake frames
stand on a common baseline.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
try:                                   # system / venv Pillow first; the .pydeps build only fits agy's python3.14
    import PIL.Image  # noqa: F401
except ImportError:
    sys.path.insert(0, os.path.join(REPO, "tools/units/.pydeps"))
sys.path.append(os.path.join(REPO, "tools", "gen3"))   # gen3.py

OUT_DIR = os.path.join(REPO, "assets", "items", "PokeBalls")
REF_ASSETS = os.environ.get("MONS_REF_ASSETS", "")   # upstream 3D reference assets dir (only ball_pack / facts need it)
PROMPTS = os.path.join(REPO, "tmp", "prompts")
REFS = os.path.join(PROMPTS, "balls")          # attachments made by tools/agy/ball_pack.py
RAW_DIR = os.path.join(REPO, "tmp", "mons-refs")   # in the repo: agy (a snap) has a private /tmp

CELL = 64          # native cell (minimum; grown in steps of 8 when an effect would not fit)
SCALE = 2          # export scale
COLS = 8
BALL_PX = 24       # native ball diameter (user 2026-11-19: twice the Gen 3 12 px, more detail)
BASELINE = CELL // 2 + BALL_PX // 2   # shake row: bottom of the ball (native y)
MARGIN = 4         # native px kept free at the cell border (never cut: an effect that does not fit grows the cell)
MAX_CELL = 128     # native cell cap; past it the whole sheet shrinks uniformly
ROWS = [  # (name, frames, gen3 timing hint)
    ("throw", 8, "loop at 30 fps while the ball flies the 34-frame (567 ms) arc"),
    ("open", 4, "f1-f2 5 GBA frames each (83 ms), f3-f4 while the Pokémon shrinks in (467 ms)"),
    ("shake", 5, "per shake: f1 -> f2 -> f3 (roll ~133 ms) -> f2 -> f1 -> f4 -> f5 (~217 ms) -> f4 -> f1 (~83 ms); 517 ms rest between shakes"),
    ("success", 4, "f1 at +667 ms (click), f2-f4 over 400 ms (stars, flickering)"),
    ("break", 4, "83 ms each, then the Pokémon grows out"),
    ("icon", 1, "static"),
]
ROW_INDEX = {r[0]: i for i, r in enumerate(ROWS)}
FRAMES = sum(n for _, n, _ in ROWS)

# The 28 official non-ancient balls the 3D reference has: 12 Gen 3 first (Master Ball right after the Poké Ball: user rule),
# then 16 later ones. The 5 reference-only apricorn colours (azure, citrine, roseate, slate, verdant) are NOT drawn.
# notes = colours / markings in the official artwork (the attached artwork and reference icon win if they differ)
BALLS = [
    ("poke", "Poké Ball", "red upper half, white lower half, black middle band, white button with a black ring"),
    ("master", "Master Ball", "purple upper half with two round pink bumps (use #e060b0-like pink, never #FF00FF) and a white 'M' between them, white lower half, black band, white button"),
    ("great", "Great Ball", "blue upper half with two red side patches (left and right), white lower half, black band, white button"),
    ("ultra", "Ultra Ball", "black upper half with two thick yellow stripes curving over it (an 'H' seen from the front), white lower half, black band, white button"),
    ("safari", "Safari Ball", "upper half light green with darker green camouflage patches, lower half beige / off-white, dark band, white button"),
    ("net", "Net Ball", "upper half teal-blue with a black net / grid pattern, white lower half, black band, white button"),
    ("dive", "Dive Ball", "upper half blue with light-blue wave-shaped stripes, white lower half, black band, white button"),
    ("nest", "Nest Ball", "green and lime ball with a darker leafy pattern as in the artwork, black band, button"),
    ("repeat", "Repeat Ball", "upper half orange-red with yellow ring lines, lower half yellow / pale as in the artwork, black band, button"),
    ("timer", "Timer Ball", "upper half white with red and black clock-like stripes, white lower half, black band, button"),
    ("luxury", "Luxury Ball", "black ball with a gold band and gold / red stripes on the upper half, black lower half, button"),
    ("premier", "Premier Ball", "all-white ball with a red middle band and a red ring around the white button"),
    ("dusk", "Dusk Ball", "dark grey / black ball with green bands on the upper half, as in the artwork"),
    ("heal", "Heal Ball", "pink upper half with white bars, white lower half, as in the artwork"),
    ("quick", "Quick Ball", "blue ball with yellow lightning-shaped panels, as in the artwork"),
    ("level", "Level Ball", "black / dark ball with red and silver-yellow details, as in the artwork"),
    ("lure", "Lure Ball", "blue upper half with red fish-hook shapes, white lower half, as in the artwork"),
    ("moon", "Moon Ball", "dark navy-blue upper half with a yellow crescent moon and dots, light lower half, as in the artwork"),
    ("friend", "Friend Ball", "green upper half with a red flower / leaf shape on top, white lower half, as in the artwork"),
    ("love", "Love Ball", "pink upper half with a red heart, white lower half, as in the artwork"),
    ("heavy", "Heavy Ball", "grey-silver ball with blue top panel and dark handle-like stripes, as in the artwork"),
    ("fast", "Fast Ball", "white upper half with orange / yellow wing shapes, white lower half, as in the artwork"),
    ("sport", "Sport Ball", "orange ball with dark netting stripes, as in the artwork"),
    ("park", "Park Ball", "yellow ball with blue patches, as in the artwork"),
    ("dream", "Dream Ball", "pink / purple ball with paler pink spots, as in the artwork"),
    ("beast", "Beast Ball", "blue ball with yellow lines and spiky light-blue / yellow markings, as in the artwork"),
    ("cherish", "Cherish Ball", "red ball with a darker red upper part and black details, as in the artwork"),
    ("strange", "Strange Ball", "the Strange Ball colours exactly as in the attached reference icon (copy its two-tone halves and markings)"),
]
# purple / pink balls are drawn on pure green #00FF00 instead of #FF00FF (user 2026-11-19: magenta bleed specks on
# Master Ball): their item art is >= 5 % purple-magenta-pink hue (measured on the reference item art / texture)
GREEN_BG = {"master", "love", "heal", "dream", "beast"}


def bg_of(bid):
    return "green" if bid in GREEN_BG else "magenta"


GEN3_IDS = ["poke", "master", "great", "ultra", "safari", "net", "dive", "nest", "repeat", "timer", "luxury", "premier"]
BY_ID = {b[0]: b for b in BALLS}


def folder(bid):
    """assets/items/PokeBalls/<Folder>: 'Poke-Ball', 'Master-Ball', …"""
    name = BY_ID[bid][1].replace("é", "e")
    return os.path.join(OUT_DIR, name.replace(" ", "-"))


def sheet_path(bid):
    return os.path.join(folder(bid), f"{bid}-ball.png")


def raw_path(bid):
    return os.path.join(RAW_DIR, f"{bid}-ball-raw.png")
