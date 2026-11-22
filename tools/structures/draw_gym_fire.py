#!/usr/bin/env python3
"""Fire-Type Gym: thin wrapper kept for old references; the family lives in draw_gym.py."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from draw_gym import main  # noqa: E402

if __name__ == "__main__":
    main(["fire"] + sys.argv[1:])
