"""Split a reviewed 6x8 master into the existing gatekeeper battle and movement paths.

From the repository root: py tools/expedition/export_gatekeeper_redraws.py --jobs 4
"""

import argparse
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageChops

from build_units import ART, _publish, update_manifest, write_catalog, write_readme, write_review_page
from import_unit_art import prepare_sheet
from roster import GATEKEEPERS
from visual_kit import near_key_mask
from normalize_sheet import find_row_bounds

RAW = Path(ART)/"gatekeeper-redraw"
NORMALIZED = Path(ART)/"redraw"


def prepare(unit):
    with Image.open(RAW/f"{unit}-source.png") as original:
        master = original.convert("RGBA")
    keyed = master.copy()
    keyed.putalpha(ImageChops.invert(near_key_mask(master)))
    seam = find_row_bounds(keyed,8)[4]
    battle = master.crop((0,0,master.width,seam))
    movement = master.crop((0,seam,master.width,master.height))
    for sheet,image in (("battle",battle),("movement",movement)):
        image.save(NORMALIZED/f"{unit}-{sheet}-source.png")
    sheets = [
        (sheet,prepare_sheet(NORMALIZED/f"{unit}-{sheet}-source.png",cell,6,4,f"{unit} {sheet}"))
        for sheet,cell in (("battle",192),("movement",64))
    ]
    return unit, sheets


def job(unit):
    try:
        return prepare(unit), None
    except (OSError, ValueError) as error:
        return None,str(error)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--jobs",type=int,default=4)
    cli.add_argument("--only",help="Comma-separated gatekeeper IDs")
    cli.add_argument("--available",action="store_true",help="Process only source atlases that have arrived")
    args = cli.parse_args()
    selected = set(args.only.split(',')) if args.only else {unit["id"] for unit in GATEKEEPERS}
    units = [unit["id"] for unit in GATEKEEPERS if unit["id"] in selected]
    if args.available:
        units = [unit for unit in units if (RAW/f"{unit}-source.png").is_file()]
    if not units:
        cli.error("No matching master sheets")
    NORMALIZED.mkdir(exist_ok=True)
    failed = 0
    with ProcessPoolExecutor(max_workers=max(1,args.jobs)) as executor:
        for key,(result,error) in zip(units,executor.map(job,units)):
            if error:
                failed += 1
                print(f"{key}: {error}",flush=True)
                continue
            unit,sheets = result
            for sheet,image in sheets:
                image.save(NORMALIZED/f"{unit}-{sheet}.png")
                _publish(f"units/gatekeepers/{unit}-{sheet}.png",image,image.size)
            print(f"{unit} exported",flush=True)
    update_manifest()
    write_catalog()
    write_review_page()
    write_readme("units")
    print(f"{len(units)-failed}/{len(units)} gatekeepers exported",flush=True)
    return int(failed>0)


if __name__ == "__main__":
    raise SystemExit(main())
