"""Check every built 3D sheet in $MONS_3D_DIR for blank cells and sprites touching the cell edge (needs numpy).

  $MONS_PY3D tools/model3d/qc.py
"""
import json, glob, os, sys
import numpy as np
from PIL import Image
from multiprocessing import Pool
O = os.environ.get("MONS_3D_DIR") or os.path.join(os.environ.get("MONS_SODIER_WAR") or "/home/huy/Main/sodier-war-next", "client/assets/pokemon3d")
def chk(j):
    m = json.load(open(j)); res = []
    for f in sorted({v["file"]: v["cell"] for v in m["modes"].values()}.items()):
        a = np.array(Image.open(f"{O}/{f[0]}").convert("RGBA"))[..., 3]; C = f[1]
        blank = edge = 0
        for r in range(a.shape[0] // C):
            for c in range(8):
                cell = a[r*C:(r+1)*C, c*C:(c+1)*C]
                if cell.max() == 0: blank += 1
                if max(cell[0].max(), cell[-1].max(), cell[:, 0].max(), cell[:, -1].max()) > 40: edge += 1
        if blank or edge: res.append(f"{f[0]} blank={blank} edge={edge}")
    return res
with Pool(6) as p:
    for r in p.imap_unordered(chk, sorted(glob.glob(f"{O}/*.json"))):
        for x in r: print(x)
