"""League: the Elite Four and the Champion (decisions.md §9). Each has its own palette (≤ 15 colours) built from
the gym ramps. Outfit, colours and silhouette were read off the 3D reference skins (front / side / back renders,
kept out of the repo) and redrawn as Gen 3 paper dolls; no pixels are copied.
The Champion is the rival DUY (chars/trainers.py "rival"): same face, spiky timber hair and gold scarf, in a
dark long coat and violet trousers."""
from charkit import BLACK, SKIN, WHITE, tri
from gymleaders import ACC, CREAM_G, CRIM, GOLD, IRON_P, PLUM, SEA, SLATE, TIMBER_G
from parts import (BELT_ACCENT, BODY, BODY_WIDE, CANE, CAPE_BEHIND, CAPE_FRONT, CHEST_BARE, COAT_TAILS, GLASSES_THIN,
                   HAIR_BRAID, HAIR_BUN, HAIR_LONG, HAIR_SPIKY, HEAD, JABOT, LONG_SKIRT, SASH_WIDE, SCARF,
                   SLEEVELESS, WRISTBANDS_WIDE)

G = "League"

DARK = [IRON_P[2], IRON_P[3], BLACK]          # near-black cloth: 2 colours + black
DARK_GREY = [IRON_P[1], IRON_P[3], BLACK]
BARE = [SKIN[0], SKIN[1], SKIN[3]]            # bare torso in the face's own skin shades


def member(slug, role, name, layers, **roles):
    return dict(group=G, palette=slug, layers=layers, roles=roles, info={"role": role, "name": name})


SPECS = {
    # Lorelei (ice): long crimson hair, glasses, sleeveless near-black top, long violet skirt
    "elite-lorelei": member("elite-lorelei", "e4-1", "Lorelei",
                            [BODY, SLEEVELESS, LONG_SKIRT, HEAD, HAIR_LONG, GLASSES_THIN],
                            hair=tri(CRIM, (0, 2, 4)), top=tri(IRON_P, (2, 3, 4)), bottom=tri(ACC),
                            leg="skin", shoe=tri(ACC)),
    # Bruno (fighting): big bare-chested build, slate hair swept back into a braid, red wristbands,
    # black sash, violet trousers
    "elite-bruno": member("elite-bruno", "e4-2", "Bruno",
                          [BODY_WIDE, CHEST_BARE, SASH_WIDE, WRISTBANDS_WIDE, HEAD, HAIR_BRAID],
                          top=BARE, hair=tri(SLATE, (1, 3, 4)), bottom=tri(ACC, (2, 3, 4)), shoe=tri(ACC, (2, 3, 4)),
                          accent=tri(CRIM)),
    # Agatha (ghost): elderly, pale hair in a bun, plum coat and long skirt, white lace jabot, walking cane
    "elite-agatha": member("elite-agatha", "e4-3", "Agatha",
                           [BODY, LONG_SKIRT, JABOT, HEAD, HAIR_BUN, CANE],
                           hair=tri(CREAM_G, (1, 2, 4)), top=tri(PLUM, (2, 3, 4)), bottom=tri(PLUM, (2, 3, 4)),
                           leg="skin", shoe=tri(PLUM, (2, 3, 4)), accent=[WHITE, CREAM_G[1], CREAM_G[3]],
                           extra=[TIMBER_G[3], TIMBER_G[4], TIMBER_G[4]]),
    # Lance (dragon): spiky crimson hair, sea-blue bodysuit with a crimson belt, dark cape, trousers and boots
    "elite-lance": member("elite-lance", "e4-4", "Lance",
                          [CAPE_BEHIND, BODY, BELT_ACCENT, CAPE_FRONT, HEAD, HAIR_SPIKY],
                          hair=tri(CRIM, (0, 1, 4)), accent=tri(CRIM, (0, 1, 4)), top=tri(SEA, (1, 3, 4)),
                          extra=DARK_GREY, bottom=DARK_GREY, leg=DARK_GREY, shoe=DARK_GREY),
    # Champion = the rival DUY: rival hair, face and gold scarf; dark long coat, violet trousers
    "champion": member("champion", "champion", "DUY",
                       [BODY, COAT_TAILS, SCARF, HEAD, HAIR_SPIKY],
                       hair=tri(TIMBER_G), accent=[GOLD[0], GOLD[2], TIMBER_G[4]], top=DARK, extra=DARK,
                       shoe=DARK, bottom=tri(ACC), leg=tri(ACC)),
}
