"""Gym Leaders: one per gym in tools/structures/gyms/, each with its own palette
built from that gym's ramps (3 ramps of 3 shades + skin, white, black). Original designs."""
from charkit import tri
from parts import (BEARD, BODY, BODY_WIDE, CAPE_BEHIND, CAPE_FRONT, GOGGLES, HAIR_BUN, HAIR_LONG, HAIR_NEAT,
                   HAIR_PIGTAILS, HAIR_SPIKY, HAT_HARD, HAT_STRAW, HEAD, HOOD, LONG_SKIRT, SCARF, SKIRT, TUFTS)

G = "GymLeaders"


def leader(gym, layers, **roles):
    return dict(group=G, palette=f"gym-{gym}", layers=layers, roles=roles)


# gym ramps (5 tones, light -> dark), copied from tools/structures/gyms/<type>.py
CRIM = [(246, 110, 88), (222, 64, 62), (186, 40, 54), (136, 26, 52), (92, 18, 46)]
BRONZE = [(246, 206, 128), (214, 162, 88), (174, 118, 62), (124, 80, 52), (84, 52, 44)]
IRON_F = [(150, 146, 168), (114, 110, 136), (84, 80, 106), (60, 56, 82), (40, 36, 58)]
SEA = [(120, 200, 255), (70, 160, 240), (40, 120, 210), (30, 84, 170), (24, 56, 120)]
CORAL = [(255, 196, 178), (250, 146, 134), (222, 98, 112), (172, 64, 98), (118, 44, 82)]
PEARL = [(255, 248, 244), (246, 224, 230), (222, 190, 210), (178, 150, 186), (128, 108, 152)]
LEAF = [(178, 230, 116), (118, 200, 90), (72, 162, 74), (46, 122, 66), (30, 84, 58)]
TIMBER_G = [(226, 176, 116), (192, 138, 86), (154, 102, 66), (112, 72, 54), (76, 48, 44)]
CREAM_G = [(250, 244, 222), (230, 220, 190), (200, 188, 160), (158, 148, 134), (112, 104, 110)]
YEL = [(255, 242, 130), (250, 212, 60), (226, 168, 34), (176, 116, 34), (116, 74, 40)]
NAVY = [(104, 118, 172), (80, 94, 150), (62, 74, 128), (46, 54, 102), (32, 36, 76)]
STL = [(214, 222, 236), (176, 186, 206), (138, 148, 176), (100, 108, 140), (66, 72, 104)]
RUST = [(236, 156, 96), (202, 110, 66), (160, 76, 52), (116, 50, 48), (78, 34, 42)]
SLATE = [(180, 186, 206), (148, 154, 178), (118, 122, 150), (88, 90, 122), (60, 60, 92)]
MEN = [(206, 194, 172), (174, 160, 142), (140, 126, 114), (104, 92, 90), (70, 60, 68)]
SAND = [(248, 222, 176), (232, 198, 148), (210, 170, 122), (170, 128, 100), (122, 88, 80)]
TERRA = [(242, 152, 98), (220, 116, 72), (186, 86, 58), (142, 60, 52), (98, 42, 46)]
TURQ = [(150, 230, 212), (90, 196, 186), (56, 152, 160), (44, 106, 128), (36, 72, 96)]
ACC = [(206, 146, 236), (170, 104, 214), (134, 72, 184), (98, 50, 142), (66, 36, 102)]
MOSS = [(176, 192, 100), (138, 162, 78), (104, 128, 64), (76, 98, 56), (52, 68, 46)]
IRON_P = [(128, 124, 150), (94, 90, 116), (68, 64, 90), (48, 44, 68), (32, 28, 46)]
PLUM = [(240, 156, 218), (212, 108, 194), (172, 72, 168), (126, 50, 138), (84, 34, 102)]
MARBLE = [(250, 246, 255), (230, 224, 246), (202, 194, 230), (164, 152, 204), (120, 108, 168)]
GOLD = [(255, 236, 156), (238, 198, 102), (202, 152, 72), (152, 106, 62), (102, 70, 56)]

SPECS = {
    # Fire: forge master. Crimson spiky hair, bronze scarf, iron-grey forge coat with a crimson cape lining
    "leader-fire": leader("fire", [CAPE_BEHIND, BODY, CAPE_FRONT, SCARF, HEAD, HAIR_SPIKY],
                          hair=tri(CRIM, (0, 2, 4)), extra=tri(CRIM), accent=tri(BRONZE), top=tri(IRON_F),
                          bottom=tri(IRON_F), leg=tri(IRON_F), shoe=tri(BRONZE, (2, 3, 4))),
    # Water: diver-captain. Long sea-blue hair, pearl top, sea skirt, coral scarf
    "leader-water": leader("water", [BODY, SKIRT, SCARF, HEAD, HAIR_LONG],
                           hair=tri(SEA), top=tri(PEARL, (0, 2, 4)), bottom=tri(SEA, (0, 2, 4)), leg="skin",
                           shoe=tri(SEA), accent=tri(CORAL)),
    # Grass: botanist. Straw hat with a leaf band, leaf-green poncho-cape, timber trousers
    "leader-grass": leader("grass", [CAPE_BEHIND, BODY, CAPE_FRONT, HEAD, HAIR_NEAT, HAT_STRAW],
                           hat=tri(CREAM_G, (0, 2, 4)), accent=tri(LEAF), extra=tri(LEAF), top=tri(LEAF),
                           bottom=tri(TIMBER_G), leg=tri(TIMBER_G), shoe=tri(TIMBER_G, (2, 3, 4)),
                           hair=tri(TIMBER_G, (2, 3, 4))),
    # Electric: engineer. Spiky yellow hair, steel goggles, navy jacket, steel trousers
    "leader-electric": leader("electric", [BODY, HEAD, HAIR_SPIKY, GOGGLES],
                              hair=tri(YEL), accent=tri(STL), top=tri(NAVY), bottom=tri(STL),
                              leg=tri(STL), shoe=tri(NAVY)),
    # Rock: miner. Big build, rust hard hat, grey beard, slate jacket
    "leader-rock": leader("rock", [BODY_WIDE, HEAD, HAIR_NEAT, BEARD, TUFTS, HAT_HARD],
                          hat=tri(RUST), hair=tri(MEN), top=tri(SLATE), bottom=tri(MEN), shoe=tri(RUST, (2, 3, 4))),
    # Ground: desert ranger. Sand hood, turquoise scarf, terracotta tunic and long skirt
    "leader-ground": leader("ground", [BODY, LONG_SKIRT, HEAD, HAIR_NEAT, HOOD, SCARF],
                            hat=tri(SAND), accent=tri(TURQ), top=tri(TERRA), bottom=tri(SAND),
                            leg="skin", shoe=tri(TERRA), hair=tri(TERRA)),
    # Poison: punk alchemist. Violet pigtails with moss ties, iron jacket, moss skirt
    "leader-poison": leader("poison", [BODY, SKIRT, HEAD, HAIR_PIGTAILS],
                            hair=tri(ACC), accent=tri(MOSS), top=tri(IRON_P), bottom=tri(MOSS), leg="skin",
                            shoe=tri(ACC, (2, 3, 4))),
    # Psychic: seer. Plum hair in a bun, marble-white gown, gold scarf, plum cape
    "leader-psychic": leader("psychic", [CAPE_BEHIND, BODY, LONG_SKIRT, CAPE_FRONT, SCARF, HEAD, HAIR_BUN],
                             hair=tri(PLUM), extra=tri(PLUM, (0, 2, 4)), top=tri(MARBLE, (0, 2, 4)),
                             bottom=tri(MARBLE, (0, 2, 4)), leg="skin", accent=tri(GOLD), shoe=tri(PLUM, (2, 3, 4))),
}
