"""Trainer classes: one sprite per class, reused on every Map (shared NPC palettes)."""
from _npc import npc
from parts import (BACKPACK, BEARD, BELT, BODY, BODY_WIDE, CANE, HAIR_BOB, HAIR_LONG, HAIR_NEAT, HAIR_SHORT,
                   HAIR_SPIKY, HAT_BEANIE, HAT_CAP, HAT_STRAW, HAT_TOP, HEAD, HEADBAND, HOOD, LONG_SKIRT, NET,
                   ROD, SCARF, SKIRT, TUFTS)

G = "Trainers"
SPECS = {
    # Rival DUY: spiky brown hair, green jacket, yellow scarf, brown trousers
    "rival": npc(G, "npc3", [BODY, SCARF, HEAD, HAIR_SPIKY],
                 top="A", accent="B", bottom="C", leg="C", shoe="B", hair="C"),
    # Youngster: blue cap, khaki tee, blue shorts
    "youngster": npc(G, "npc1", [BODY, HEAD, HAIR_SHORT, TUFTS, HAT_CAP],
                     hat="A", top="C", bottom="A", leg="skin", shoe="A", hair="B"),
    # Lass: long brown hair, khaki blouse, blue skirt
    "lass": npc(G, "npc1", [BODY, SKIRT, HEAD, HAIR_LONG],
                top="C", bottom="A", leg="skin", shoe="A", hair="B"),
    # Bug Catcher: straw hat with a green band, bug net, green tee, shorts
    "bug-catcher": npc(G, "npc3", [BODY, HEAD, TUFTS, HAT_STRAW, NET],
                       hat="B", accent="A", extra="C", top="A", bottom="C", leg="skin", shoe="C", hair="C"),
    # Hiker: big build, beard, blue beanie, khaki shirt, blue rucksack
    "hiker": npc(G, "npc1", [BODY_WIDE, BACKPACK, HEAD, HAIR_SHORT, BEARD, HAT_BEANIE],
                 hat="A", accent="A", extra="A", top="C", bottom="B", shoe="B", hair="B"),
    # Fisherman: khaki cap, blue vest, rod
    "fisherman": npc(G, "npc1", [BODY, HEAD, HAIR_SHORT, TUFTS, HAT_CAP, ROD],
                     hat="C", extra="B", top="A", bottom="C", leg="C", shoe="B", hair="B"),
    # Swimmer (m): bare chest, blue trunks, barefoot
    "swimmer-m": npc(G, "npc1", [BODY, HEAD, HAIR_SHORT],
                     top="skin", bottom="A", leg="skin", shoe="skin", hair="B"),
    # Swimmer (f): red swimsuit, navy bob, barefoot
    "swimmer-f": npc(G, "npc2", [BODY, HEAD, HAIR_BOB],
                     top="A", bottom="A", leg="skin", shoe="skin", hair="B"),
    # Black Belt: white gi, black belt, red headband, barefoot
    "black-belt": npc(G, "npc2", [BODY, BELT, HEAD, HAIR_SPIKY, HEADBAND],
                      top="C", bottom="C", leg="C", shoe="skin", hair="B", accent="A"),
    # Beauty: long plum hair, coral gown
    "beauty": npc(G, "npc4", [BODY, LONG_SKIRT, HEAD, HAIR_LONG],
                  top="A", bottom="A", leg="skin", shoe="B", hair="B"),
    # Gentleman: navy suit, top hat with a red band, grey hair and cravat, cane
    "gentleman": npc(G, "npc2", [BODY, CANE, SCARF, HEAD, HAIR_NEAT, HAT_TOP],
                     hat="B", accent="A", extra="B", top="B", bottom="B", leg="B", shoe="B", hair="C"),
    # Psychic: plum hood over a pale lavender robe
    "psychic": npc(G, "npc4", [BODY, LONG_SKIRT, HEAD, HAIR_SHORT, HOOD],
                   hat="B", top="C", bottom="C", leg="skin", shoe="B", hair="C"),
    # Ace Trainer (m): red spiky hair, navy jacket, stone trousers
    "ace-trainer-m": npc(G, "npc2", [BODY, HEAD, HAIR_SPIKY],
                         top="B", bottom="C", leg="C", shoe="A", hair="A"),
    # Ace Trainer (f): long gold hair, green top, timber skirt
    "ace-trainer-f": npc(G, "npc3", [BODY, SKIRT, HEAD, HAIR_LONG],
                         top="A", bottom="C", leg="skin", shoe="A", hair="B"),
}
