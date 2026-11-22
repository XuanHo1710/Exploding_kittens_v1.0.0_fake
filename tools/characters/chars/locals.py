"""Locals: one or two NPCs per District who show its Theme (shared NPC palettes).
Slug = <district>-<role>; districts follow the gym types in tools/structures/gyms/ plus the neutral start area."""
from _npc import npc
from parts import (APRON, BODY, BODY_WIDE, GOGGLES, HAIR_BOB, HAIR_BUN, HAIR_LONG, HAIR_NEAT, HAIR_SHORT,
                   HAIR_SPIKY, HAT_BEANIE, HAT_CAP, HAT_HARD, HAT_PEAKED, HAT_STRAW, HEAD, HOOD,
                   LONG_SKIRT, OVERALLS, SATCHEL, SCARF, SKIRT, TUFTS)

G = "Locals"
SPECS = {
    # start area
    "start-farmer": npc(G, "npc3", [BODY, OVERALLS, HEAD, TUFTS, HAT_STRAW],
                        hat="B", accent="A", top="A", bottom="C", leg="C", shoe="C", hair="C"),
    "start-postman": npc(G, "npc1", [BODY, SATCHEL, HEAD, HAIR_SHORT, TUFTS, HAT_CAP],
                         hat="A", extra="B", top="A", bottom="C", leg="C", shoe="B", hair="B"),
    # fire district: smithy town
    "fire-smith": npc(G, "npc2", [BODY_WIDE, APRON, HEAD, HAIR_SPIKY],
                      top="C", extra="B", bottom="B", shoe="B", hair="A"),
    # water district: harbour
    "water-sailor": npc(G, "npc1", [BODY, SCARF, HEAD, HAIR_SHORT, TUFTS, HAT_PEAKED],
                        hat="C", accent="A", top="C", bottom="A", leg="A", shoe="B", hair="B"),
    "water-diver": npc(G, "npc1", [BODY, HEAD, HAIR_BOB, GOGGLES],
                       accent="A", top="A", bottom="A", leg="skin", shoe="skin", hair="B"),
    # grass district: greenhouse village
    "grass-florist": npc(G, "npc3", [BODY, LONG_SKIRT, APRON, HEAD, HAIR_BUN],
                         top="B", bottom="C", leg="skin", extra="A", shoe="C", hair="C"),
    # electric district: power-plant city
    "electric-mechanic": npc(G, "npc2", [BODY, OVERALLS, HEAD, HAIR_SPIKY, GOGGLES],
                             top="C", bottom="B", leg="B", shoe="B", hair="A", accent="B"),
    # rock district: quarry
    "rock-miner": npc(G, "npc3", [BODY_WIDE, HEAD, HAIR_SHORT, TUFTS, HAT_HARD],
                      hat="B", top="C", bottom="C", shoe="C", hair="C"),
    # ground district: desert outpost
    "ground-nomad": npc(G, "npc1", [BODY, LONG_SKIRT, HEAD, HAIR_NEAT, HOOD, SCARF],
                        hat="C", accent="A", top="C", bottom="B", leg="skin", shoe="B", hair="B"),
    # poison district: swamp
    "poison-herbalist": npc(G, "npc4", [BODY, SKIRT, SATCHEL, HEAD, HAIR_LONG, HAT_BEANIE],
                            hat="B", accent="A", top="C", bottom="B", leg="skin", extra="B", shoe="B",
                            hair="B"),
    # psychic district: temple town
    "psychic-fortune-teller": npc(G, "npc4", [BODY, LONG_SKIRT, SCARF, HEAD, HAIR_LONG, HOOD],
                                  hat="B", accent="A", top="B", bottom="B", leg="skin", shoe="B", hair="C"),
    "psychic-monk": npc(G, "npc2", [BODY, LONG_SKIRT, SCARF, HEAD, HAIR_NEAT],
                        top="A", bottom="A", leg="skin", shoe="B", accent="C", hair="B"),
}
