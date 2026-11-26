"""
tools/bansung/night_art/build.py — sinh lại toàn bộ art "Đêm Zombie" (spec 007, v2).

Chạy từ thư mục gốc repo:
    .venv/Scripts/python.exe tools/bansung/night_art/build.py               # anh hùng + zombie + boss
    .venv/Scripts/python.exe tools/bansung/night_art/build.py --only bosses
    .venv/Scripts/python.exe tools/bansung/night_art/build.py --preview     # chỉ xuất ảnh xem trước vào tmp/night_preview

Sau khi sinh lại PNG phải cập nhật sha256 trong database-ban-sung/LICENSES.md
(bảng Asset Provenance) + số frame trong manifest.json, rồi chạy `npm test --prefix server`.

Đầu ra (v2):
- normalized/heroes/hero_<id>_{idle 6, run 8, shoot 4, dash 6, stunned 4, dead 6}.png
- normalized/heroes/hero_<id>_{idle,walk}_{down,left,right,up}.png (idle 6 / walk 8)
- normalized/ui/ui_portrait_<id>.png
- design/bansung-night/heroes/hero_<id>_move8.png (atlas tham chiếu 8 cột × 8 hàng)
- normalized/enemies/<mob>_<clip>.png (zombie: idle 6, run 8, attack 8, dead 8, ...)
- normalized/bosses/boss_<id>_<clip>.png (9 boss zombie, 34–47 frame/boss) + emp_pylon, overlord_weakpoint
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)

import bosses  # noqa: E402
import heroes  # noqa: E402
import zombies  # noqa: E402
from PIL import Image  # noqa: E402


def build_heroes(db_heroes: str, design_dir: str, ui_dir: str | None) -> int:
    os.makedirs(design_dir, exist_ok=True)
    written = heroes.build_all(db_heroes, design_dir)
    if ui_dir:
        for L in heroes.HEROES:
            portrait = os.path.join(ui_dir, f'ui_portrait_{L.hid}.png')
            if not os.path.exists(portrait):
                continue
            size = Image.open(portrait).size
            idle = Image.open(os.path.join(db_heroes, f'hero_{L.hid}_idle_down.png')).convert('RGBA')
            crop = idle.crop((8, 3, 40, 35))
            if crop.size != size:
                crop = crop.resize(size, Image.NEAREST)
            crop.save(portrait)
    return len(written)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', choices=['heroes', 'zombies', 'bosses'])
    ap.add_argument('--preview', action='store_true')
    a = ap.parse_args()
    db = os.path.join(ROOT, 'database-ban-sung')
    out_h = os.path.join(db, 'normalized', 'heroes')
    out_e = os.path.join(db, 'normalized', 'enemies')
    out_b = os.path.join(db, 'normalized', 'bosses')
    ui_dir: str | None = os.path.join(db, 'normalized', 'ui')
    design = os.path.join(ROOT, 'design', 'bansung-night', 'heroes')
    if a.preview:
        base = os.path.join(ROOT, 'tmp', 'night_preview', 'build')
        out_h, out_e, out_b = (os.path.join(base, n) for n in ('heroes', 'zombies', 'bosses'))
        design = out_h
        ui_dir = None
        for d in (out_h, out_e, out_b):
            os.makedirs(d, exist_ok=True)
    if a.only in (None, 'heroes'):
        print('hero files:', build_heroes(out_h, design, ui_dir))
    if a.only in (None, 'zombies'):
        manifest = json.load(open(os.path.join(db, 'manifest.json'), encoding='utf8'))
        print('zombie clips:', len(zombies.build_from_manifest(manifest, out_e, None)))
    if a.only in (None, 'bosses'):
        res = bosses.build_all(out_b)
        print('boss sheets:', sum(len(v) for v in res.values()))


if __name__ == '__main__':
    main()
