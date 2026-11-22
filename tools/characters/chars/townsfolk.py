"""Townsfolk: everyday NPCs who live in the towns (shared NPC palettes)."""
from _npc import npc
from parts import (BODY, BODY_WIDE, CANE, CHILD_BODY, CHILD_DRESS, CHILD_HAIR, CHILD_HEAD, CHILD_TAILS,
                   GLASSES, HAIR_BALD, HAIR_BOB, HAIR_BUN, HAIR_LONG, HAIR_NEAT, HAIR_PIGTAILS, HAIR_SHORT,
                   HAIR_SPIKY, HAT_HARD, HAT_STRAW, HEAD, LONG_SKIRT, OVERALLS, SCARF, SKIRT, TUFTS)

G = "Townsfolk"
SPECS = {
    "little-boy": npc(G, "npc1", [CHILD_BODY, CHILD_HEAD, CHILD_HAIR], child=True,
                      top="A", bottom="C", shoe="A", hair="B"),
    "little-girl": npc(G, "npc2", [CHILD_BODY, CHILD_DRESS, CHILD_HEAD, CHILD_HAIR, CHILD_TAILS], child=True,
                       top="A", bottom="A", shoe="A", hair="B", accent="A"),
    "boy": npc(G, "npc3", [BODY, HEAD, HAIR_SPIKY], top="A", bottom="C", leg="skin", shoe="A", hair="B"),
    "girl": npc(G, "npc1", [BODY, SKIRT, HEAD, HAIR_PIGTAILS],
                top="A", bottom="C", leg="skin", shoe="A", hair="B", accent="A"),
    "man": npc(G, "npc1", [BODY, HEAD, HAIR_NEAT], top="A", bottom="C", leg="C", shoe="B", hair="B"),
    "woman": npc(G, "npc4", [BODY, LONG_SKIRT, HEAD, HAIR_BOB],
                 top="A", bottom="A", leg="skin", shoe="B", hair="B"),
    "fat-man": npc(G, "npc3", [BODY_WIDE, HEAD, HAIR_SHORT], top="A", bottom="C", shoe="C", hair="C"),
    "old-man": npc(G, "npc2", [BODY, CANE, HEAD, HAIR_BALD],
                   top="B", bottom="C", leg="C", shoe="B", hair="C", extra="B"),
    "old-woman": npc(G, "npc2", [BODY, LONG_SKIRT, SCARF, HEAD, HAIR_BUN],
                     top="A", bottom="B", leg="skin", shoe="B", hair="C", accent="C"),
    "worker": npc(G, "npc3", [BODY, OVERALLS, HEAD, TUFTS, HAT_HARD],
                  top="A", bottom="C", leg="C", shoe="C", hair="C", hat="B"),
    "lady": npc(G, "npc1", [BODY, LONG_SKIRT, HEAD, HAIR_LONG, HAT_STRAW],
                top="A", bottom="A", leg="skin", shoe="B", hair="B", hat="C", accent="A"),
    "bookworm": npc(G, "npc2", [BODY, HEAD, GLASSES, HAIR_NEAT],
                    top="A", bottom="C", leg="C", shoe="B", hair="B"),
}
