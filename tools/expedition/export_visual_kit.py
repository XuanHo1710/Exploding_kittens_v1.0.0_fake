"""Export landmarks, pixel HUD and the 30 skill VFX pairs.

From the repository root: py tools/expedition/export_visual_kit.py
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

from build_bundle import REALMS_LAYOUT, sha256_file
from pixel_sprites import ELEMENT_RAMPS, render_skill_vfx_pair, render_summon_orb_sheet
from visual_kit import combat_kit, hud_kit, landmark_sheets

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "database-astral-expedition"
STYLES = ("slash", "ray", "meteor", "wave", "sigil")


def validate_strip(relative, image):
    if image.size != (768,96):
        raise ValueError(f"{relative}: invalid strip dimensions {image.size}")
    for index in range(8):
        cell = image.crop((index*96,0,(index+1)*96,96))
        box = cell.getbbox()
        if box is None or min(box[0],box[1],96-box[2],96-box[3]) < 2:
            raise ValueError(f"{relative}: empty or clipped frame {index}")


def kit_assets():
    yield from landmark_sheets()
    yield "ui/hud-kit.png", hud_kit()
    yield "ui/combat-kit.png", combat_kit()
    yield "ui/gacha/astral-orb.png", render_summon_orb_sheet()
    for element in ELEMENT_RAMPS:
        for style in STYLES:
            cast, effect = render_skill_vfx_pair(element, style)
            for phase, image in (("cast",cast),("effect",effect)):
                name = f"vfx/skills/{element.lower()}_{style}-{phase}.png"
                validate_strip(name, image)
                yield name, image


def preview(out):
    out.mkdir(parents=True, exist_ok=True)
    chart = Image.new("RGBA",(960,410),"#191a27")
    title = ImageDraw.Draw(chart)
    for i,realm in enumerate(REALMS_LAYOUT):
        theme = realm["theme"]
        x,y = 10+(i%4)*238, 12+(i//4)*187
        title.text((x,y),realm["mapId"],fill="#e9d7ad")
        for j, kind in enumerate(("rest-anchor-flag","realm-warp-gate")):
            with Image.open(BUNDLE/"structures"/theme/f"{kind}.png") as sheet:
                crop = sheet.crop((128*j,0,128*(j+1),128)).resize((112,112),Image.Resampling.NEAREST)
                chart.alpha_composite(crop,(x+112*j,y+28))
    chart.save(out/"landmarks-preview.png")
    ui = Image.new("RGBA",(560,332),"#191a27")
    ui.alpha_composite(Image.open(BUNDLE/"ui/hud-kit.png"),(18,24))
    ui.alpha_composite(Image.open(BUNDLE/"ui/combat-kit.png"),(18,117))
    orb = Image.open(BUNDLE/"ui/gacha/astral-orb.png")
    for i,(col,row) in enumerate(((4,0),(2,1),(3,4))):
        ui.alpha_composite(orb.crop((col*128,row*128,(col+1)*128,(row+1)*128)),(380,8+i*103))
    ui.save(out/"hud-preview.png")

    # Show cast and impact at their approximate screen sizes in opposing directions.
    vfx = Image.new("RGBA",(900,666),"#191a27")
    labels = ImageDraw.Draw(vfx)
    for i,element in enumerate(ELEMENT_RAMPS):
        path = list(REALMS_LAYOUT)[i]["mapId"]
        with Image.open(BUNDLE/"battle-scenes"/path/"backdrop.png") as source:
            bg = source.resize((174,80),Image.Resampling.NEAREST)
        for j,style in enumerate(STYLES):
            x,y = 7+j*179, 9+i*110
            card = bg.copy()
            for phase,frame,point,size,flip in (("cast",2,(4,25),49,False),("effect",4,(104,7),60,True)):
                with Image.open(BUNDLE/"vfx/skills"/f"{element.lower()}_{style}-{phase}.png") as strip:
                    cell = strip.crop((frame*96,0,(frame+1)*96,96)).resize((size,size),Image.Resampling.NEAREST)
                card.alpha_composite(ImageOps.mirror(cell) if flip else cell, point)
            vfx.alpha_composite(card,(x,y+17))
            labels.text((x,y),f"{element} / {style}",fill="#e9d7ad")
    vfx.save(out/"skill-vfx-preview.png")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", type=Path, help="Folder for the three review images")
    args = parser.parse_args()
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assets = list(kit_assets())
    for relative, image in assets:
        path = BUNDLE / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path)
        manifest["files"][relative] = {
            "sha256":sha256_file(path), "bytes":path.stat().st_size, "width":image.width, "height":image.height,
        }
    manifest["totalFiles"] = len(manifest["files"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2),encoding="utf-8")
    if args.preview:
        preview(args.preview)
    from art_source import export as export_art, mapping as art_mapping

    for domain in ("ui", "vfx"):  # art-source/<domain>/*-source.png win over the code drawings (1-1)
        export_art(art_mapping(domain))
    print(f"Exported {len(assets)} visual asset files.")


if __name__ == "__main__":
    main()
