"""Service NPCs: the people behind the counters and gates (shared NPC palettes)."""
from _npc import npc
from parts import (APRON, BEARD, BODY, COAT_TAILS, GLASSES, HAIR_BOB, HAIR_BUN, HAIR_NEAT, HAT_NURSE, HAT_PEAKED,
                   HEAD, LONG_SKIRT, SCARF, TUFTS)

G = "Service"
SPECS = {
    # Pokémon Center nurse: plum bob, white cap with a coral mark, coral dress, white apron
    "nurse": npc(G, "npc4", [BODY, LONG_SKIRT, APRON, HEAD, HAIR_BOB, HAT_NURSE],
                 top="A", bottom="A", leg="skin", shoe="A", extra="C", hat="C", accent="A", hair="B"),
    # Mart clerk: blue apron over a khaki shirt, brown trousers
    "mart-clerk": npc(G, "npc1", [BODY, APRON, HEAD, HAIR_NEAT],
                      top="C", extra="A", bottom="B", leg="B", shoe="B", hair="B"),
    # Scientist: stone-white lab coat, red tie, glasses, navy hair and trousers
    "scientist": npc(G, "npc2", [BODY, COAT_TAILS, HEAD, GLASSES, HAIR_NEAT],
                     top="C", extra="C", accent="A", bottom="B", leg="B", shoe="B", hair="B"),
    # Professor (start-town lab, gives the starter): grey swept hair and beard, white lab coat, red tie
    "professor": npc(G, "npc2", [BODY, COAT_TAILS, HEAD, HAIR_NEAT, BEARD],
                     top="C", extra="C", accent="A", bottom="B", leg="B", shoe="B", hair="C"),
    # Receptionist / gatehouse: blue suit and long skirt, khaki scarf, brown bun
    "receptionist": npc(G, "npc1", [BODY, LONG_SKIRT, SCARF, HEAD, HAIR_BUN],
                        top="A", bottom="A", leg="skin", shoe="B", accent="C", hair="B"),
    # Day Care: grey-haired grandmother, plum cardigan and skirt, coral apron
    "day-care-lady": npc(G, "npc4", [BODY, LONG_SKIRT, APRON, HEAD, HAIR_BUN],
                         top="B", bottom="B", leg="skin", shoe="B", extra="A", hair="C"),
    # Guard: navy jacket, white peaked cap with a red band and black visor, grey trousers
    "guard": npc(G, "npc2", [BODY, HEAD, TUFTS, HAT_PEAKED],
                 top="B", bottom="C", leg="C", shoe="B", hair="B", hat="C", accent="A"),
}
