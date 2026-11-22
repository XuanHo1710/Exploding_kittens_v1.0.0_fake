"""Normalize all seven 3D arenas to the Expedition stage texture contract.

From the repository root: py tools/expedition/export_3d_arenas.py
"""

import argparse
import json
import math
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

from build_bundle import REALMS_LAYOUT, sha256_file
from export_overworld_terrain import SOURCE as MATERIAL_SOURCE, atlas_row
from pixel_worlds import gen3
from visual_kit import near_key_mask, remove_key_fringe
from normalize_sheet import find_components

BUNDLE = Path(__file__).resolve().parents[2] / "database-astral-expedition"
SOURCE = BUNDLE / "art-source" / "battle-scenes"
PROP_NAMES = ("pillar", "pillar_broken", "arch", "rocks", "bush", "tallgrass")
PROP_HEIGHTS = (5.2, 2.8, 6.0, 1.7, 1.9, 1.1)
SCALE = Image.Resampling.NEAREST


def pixel_export(image, colors=26, palettes=13, scale=2):
    alpha = image.convert("RGBA").getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    rgb = image.convert("RGB").quantize(colors=colors, dither=Image.Dither.NONE).convert("RGBA")
    rgb.putalpha(alpha)
    clean = gen3.to_gen3(rgb, max_palettes=palettes)
    return clean if scale == 1 else clean.resize((image.width*scale,image.height*scale), SCALE)


def mirrored_ground(swatch):
    swatch = swatch.resize((64,64), SCALE)
    texture = Image.new("RGBA",(128,128))
    texture.paste(swatch,(0,0))
    texture.paste(ImageOps.mirror(swatch),(64,0))
    texture.paste(ImageOps.flip(swatch),(0,64))
    texture.paste(ImageOps.flip(ImageOps.mirror(swatch)),(64,64))
    return texture


def clearing(base, path):
    ground = mirrored_ground(base)
    trail = mirrored_ground(path)
    surface = Image.new("RGBA",(256,256))
    pixels = surface.load()
    for y in range(256):
        for x in range(256):
            angle = math.atan2(y-128,x-128)
            radius = math.hypot((x-128)/125,(y-128)/121)
            limit = .9+.04*math.sin(angle*8)+.03*math.cos(angle*13)
            if radius >= limit:
                continue
            is_path = radius < limit-.10 or (radius < limit-.05 and (x+y)%4==0)
            tex = trail if is_path else ground
            pixels[x,y] = tex.getpixel((x%128,y%128))
    return surface


def fit_panorama(source, size=(1024,256)):
    crop_width = min(source.width,source.height*4)
    crop_height = min(source.height,source.width//4)
    left = (source.width-crop_width)//2
    top = round((source.height-crop_height)*.88)
    pano = source.crop((left,top,left+crop_width,top+crop_height)).convert("RGB").resize(size,SCALE)
    # On the cylinder, the left and right edge are the same point. Blend only the join.
    width, height = pano.size
    seam = round(width * .035)
    for distance in range(seam):
        blend = (seam-distance) / (seam*2)
        left = pano.crop((distance,0,distance+1,height))
        right = pano.crop((width-distance-1,0,width-distance,height))
        pano.paste(Image.blend(left,right,blend),(distance,0))
        pano.paste(Image.blend(right,left,blend),(width-distance-1,0))
    return pano


def panorama_panel(sheet, number):
    row, col = divmod(number,2)
    box = (round(col*sheet.width/2)+2,round(row*sheet.height/3)+2,
           round((col+1)*sheet.width/2)-2,round((row+1)*sheet.height/3)-2)
    return fit_panorama(sheet.crop(box))


def regional_props(sheet):
    src = sheet.convert("RGBA")
    src.putalpha(ImageChops.invert(near_key_mask(src)))
    columns = src.width/6
    rows = src.height/6
    cells = {}
    for part in find_components(src):
        if part["area"] < 6:
            continue
        row, col = int(part["cy"]//rows), int(part["cx"]//columns)
        cells.setdefault((row,col), []).append(part)
    packed = []
    for row in range(6):
        group = []
        for col in range(6):
            parts = cells.get((row,col),[])
            if not parts:
                raise ValueError(f"Missing regional prop row {row+1}, column {col+1}")
            x0 = min(part["bbox"][0] for part in parts)
            y0 = min(part["bbox"][1] for part in parts)
            x1 = max(part["bbox"][2] for part in parts)
            y1 = max(part["bbox"][3] for part in parts)
            sprite = Image.new("RGBA",(x1-x0,y1-y0))
            for part in parts:
                for x,y in part["pts"]:
                    sprite.putpixel((x-x0,y-y0),src.getpixel((x,y)))
            group.append((sprite,PROP_HEIGHTS[col]))
        packed.append(group)
    return packed


def pack_props(sprites):
    result = Image.new("RGBA",(512,384))
    frames = []
    for i,(sprite,world_height) in enumerate(sprites):
        target_h = min(180,max(1,round(world_height*128/6)))
        target_w = max(1,round(sprite.width * target_h/sprite.height))
        if target_w > 162:
            target_h = max(1,round(target_h*162/target_w))
            target_w = 162
        row,col = divmod(i,3)
        x,y = col*170+4,row*192+4
        image = remove_key_fringe(remove_key_fringe(sprite.resize((target_w,target_h),SCALE)))
        result.paste(image,(x,y))
        frames.append({"name": PROP_NAMES[i], "x":x*2, "y":y*2, "w":target_w*2, "h":target_h*2, "worldH":world_height})
    return pixel_export(result,palettes=13), {"width":1024,"height":768,"frames":frames}


def meadow_sources(folder):
    unscaled = SOURCE / "arena-meadow"
    unscaled.mkdir(exist_ok=True)
    for file in ("ground.png","floor.png","panorama.png","props.png","props.json"):
        if not (unscaled/file).is_file():
            shutil.copyfile(folder/file,unscaled/file)
    frames = json.loads((unscaled/"props.json").read_text(encoding="utf-8"))["frames"]
    props = []
    with Image.open(unscaled/"props.png") as original:
        for name in PROP_NAMES:
            meta = next(frame for frame in frames if frame["name"]==name)
            x,y,w,h = (meta[k] for k in ("x","y","w","h"))
            cell = original.crop((x,y,x+w,y+h)).convert("RGBA")
            sprite = cell.crop(cell.getbbox())
            props.append((sprite,round(meta["worldH"]*sprite.height/h,3)))
    images = []
    for name,size in (("ground",(128,128)),("floor",(256,256)),("panorama",(1024,256))):
        updated = unscaled/"panorama-redraw-source.png"
        source = updated if name=="panorama" and updated.is_file() else unscaled/f"{name}.png"
        with Image.open(source) as original:
            if name == "panorama":
                # Remove the solid black matte below the painted forest floor.
                painted = original.convert("L").point(lambda pixel: 255 if pixel > 22 else 0).getbbox()
                bottom = painted[3] if painted else original.height
                images.append(fit_panorama(original.crop((0, 0, original.width, bottom)), (2048,512)))
            else:
                images.append(original.convert("RGBA").resize(size,SCALE))
    return (*images, props)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", choices=[realm["mapId"] for realm in REALMS_LAYOUT])
    args = parser.parse_args()
    with Image.open(MATERIAL_SOURCE) as material:
        materials = material.convert("RGB")
    with Image.open(SOURCE/"regional-panorama-atlas-source.png") as pano:
        panoramas = pano.copy()
    with Image.open(SOURCE/"regional-props-atlas-source.png") as props:
        regional = regional_props(props)
    path = BUNDLE/"manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for i,realm in enumerate(REALMS_LAYOUT):
        if args.only and realm["mapId"]!=args.only:
            continue
        folder = BUNDLE/"battle-scenes"/realm["mapId"]/"arena"
        folder.mkdir(parents=True,exist_ok=True)
        if i==0:
            ground,floor,pano,sprites = meadow_sources(folder)
        else:
            base,trail,_,_ = atlas_row(materials,i)
            ground,floor = mirrored_ground(base),clearing(base,trail)
            pano,sprites = panorama_panel(panoramas,i-1),regional[i-1]
        props,metadata = pack_props(sprites)
        panorama = pixel_export(pano, colors=40, scale=1) if i == 0 else pixel_export(pano)
        for name,image in (("ground",pixel_export(ground)),("floor",pixel_export(floor)),
                           ("panorama",panorama),("props",props)):
            output = folder/f"{name}.png"
            image.save(output)
            manifest["files"][output.relative_to(BUNDLE).as_posix()] = {
                "sha256":sha256_file(output),"bytes":output.stat().st_size,"width":image.width,"height":image.height,
            }
        output = folder/"props.json"
        output.write_text(json.dumps(metadata,indent=2)+"\n", encoding="utf-8")
        manifest["files"][output.relative_to(BUNDLE).as_posix()] = {"sha256":sha256_file(output),"bytes":output.stat().st_size}
        print(realm["mapId"]+" arena ready",flush=True)
    manifest["totalFiles"] = len(manifest["files"])
    path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


if __name__ == "__main__":
    main()
