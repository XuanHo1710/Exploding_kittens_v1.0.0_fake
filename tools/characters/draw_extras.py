#!/usr/bin/env python3
"""Shared Character extras (decisions.md §9): jump shadow 16x8 and the "!" / "?" emotes 16x16.

Usage: draw_extras.py [--out-root assets/characters]  -> assets/characters/Shared/{shadow,emote-exclaim,emote-question}.png (x2)
The shadow shows only during Ledge jumps, centred 4 px above the frame bottom (pret InitJumpRegular);
an emote sits 16 px above the Trainer's frame, bounces (v0 = -5 px/frame, +1 each frame) and shows 60 frames.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image  # noqa: E402

import charkit as CK  # noqa: E402

INK = {".": None, "o": (40, 36, 58), "w": (255, 255, 255), "g": (206, 206, 222), "r": (222, 64, 62),
       "d": (136, 26, 52), "s": (74, 74, 90)}

SHADOW = """
....ssssssss....
..ssssssssssss..
.ssssssssssssss.
ssssssssssssssss
ssssssssssssssss
.ssssssssssssss.
..ssssssssssss..
....ssssssss....
"""
EXCLAIM = """
....oooooooo....
..oowwwwwwwwoo..
.owwwwwrrwwwwgo.
.owwwwrrrrwwwgo.
owwwwwrrrrwwwwgo
owwwwwrrrrwwwwgo
owwwwwrddrwwwwgo
owwwwwwrrwwwwwgo
owwwwwwrrwwwwwgo
owwwwwwddwwwwwgo
.owwwwwwwwwwwgo.
.owwwwwrrwwwggo.
..oowwwddwwgoo..
....oooowwoo....
.......owo......
.......oo.......
"""
QUESTION = """
....oooooooo....
..oowwwwwwwwoo..
.owwwwrrrrwwwgo.
.owwwrrddrrwwgo.
owwwwrdwwrrwwwgo
owwwwwwwwrrwwwgo
owwwwwwwrrdwwwgo
owwwwwwrrdwwwwgo
owwwwwwrrwwwwwgo
owwwwwwddwwwwwgo
.owwwwwwwwwwwgo.
.owwwwwrrwwwggo.
..oowwwddwwgoo..
....oooowwoo....
.......owo......
.......oo.......
"""


def paint(block):
    rows = [r for r in block.strip("\n").split("\n")]
    img = Image.new("RGBA", (16, len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if INK.get(ch):
                img.putpixel((x, y), INK[ch] + (255,))
    return CK.gen3.to_gen3(img)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-root", default=os.path.join(HERE, "..", "..", "assets", "characters"))
    a = ap.parse_args()
    out = os.path.join(a.out_root, "Shared")
    os.makedirs(out, exist_ok=True)
    for name, block in (("shadow", SHADOW), ("emote-exclaim", EXCLAIM), ("emote-question", QUESTION)):
        p = os.path.join(out, name + ".png")
        CK.up(paint(block)).save(p)
        print("wrote", os.path.normpath(p))
    with open(os.path.join(out, "shared.json"), "w") as f:
        json.dump({
            "scale": CK.SCALE,
            "shadow": {"file": "shadow.png", "native": [16, 8],
                       "when": "Ledge jumps only (pret: never while standing or walking)",
                       "centre_above_frame_bottom_px": 4},
            "emotes": {"files": ["emote-exclaim.png", "emote-question.png"], "native": [16, 16],
                       "offset_above_frame_px": 16, "bounce": {"v0_px_per_frame": -5, "gravity_px_per_frame": 1},
                       "show_frames": 60, "fps": 60},
        }, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
