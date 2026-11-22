"""Paint pixel HUD components and split the Expedition landmark atlas.

From the repository root: py tools/expedition/export_visual_kit.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from pixel_worlds import THEME_PALETTES, gen3, render_structure_sprites
from pixel_sprites import ELEMENT_RAMPS, elemental_mote

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "units"))
from normalize_sheet import near_key_mask

OUTLINE = (24, 22, 36)
INK = (33, 30, 48)
BRONZE = (144, 102, 69)
GOLD = (229, 194, 138)


def load_structure_cutout(path, alpha_cut=128):
    with Image.open(path) as source:
        rgba = source.convert("RGBA")
    alpha = rgba.getchannel("A").point(lambda value: 255 if value >= alpha_cut else 0)
    alpha = ImageChops.multiply(alpha, ImageChops.invert(near_key_mask(rgba)))
    rgba.putalpha(alpha)
    return rgba


def native_to_asset(im, max_palettes=6):
    rgb = im.convert("RGB").quantize(colors=28, dither=Image.Dither.NONE).convert("RGBA")
    rgb.putalpha(im.getchannel("A"))
    return gen3.to_gen3(rgb, max_palettes=max_palettes).resize(
        (im.width*2, im.height*2), Image.Resampling.NEAREST,
    )


def remove_key_fringe(sprite):
    original = sprite.load()
    cleaned = sprite.copy()
    for y in range(1,sprite.height-1):
        for x in range(1,sprite.width-1):
            r,g,b,a = original[x,y]
            if not a or min(r,b)-g < 44:
                continue
            neighbors = [original[x+dx,y+dy] for dx,dy in ((0,-1),(-1,0),(1,0),(0,1))]
            if all(c[3] for c in neighbors):
                continue
            neutral = [c for c in neighbors if c[3] and min(c[0],c[2])-c[1] < 44]
            if neutral:
                cleaned.putpixel((x,y),min(neutral,key=lambda c:abs(c[1]-g)))
    return cleaned


def landmark_sheets():
    """Yield (relative destination, atlas) using shared source poses at fixed pivots."""
    atlas = ROOT / "database-astral-expedition" / "art-source" / "structures" / "landmark-atlas-source.png"
    if not atlas.exists():
        for name, image in render_structure_sprites().items():
            yield f"structures/{name}/{name}.png", image
        return
    with Image.open(atlas) as source:
        raw = source.convert("RGBA")
    raw.putalpha(ImageChops.invert(near_key_mask(raw)))
    for index, (theme, palette) in enumerate(THEME_PALETTES.items()):
        for style, kind in enumerate(("rest-anchor-flag", "realm-warp-gate")):
            row, col = divmod(index*2+style, 4)
            bounds = (round(col*raw.width/4), round(row*raw.height/4),
                      round((col+1)*raw.width/4), round((row+1)*raw.height/4))
            panel = raw.crop(bounds)
            sprite = panel.crop(panel.getbbox())
            sprite.thumbnail((58, 56), Image.Resampling.NEAREST)
            sprite = remove_key_fringe(sprite)
            footprint = Image.new("RGBA", (64,64))
            footprint.paste(sprite, ((64-sprite.width)//2, 60-sprite.height))
            sheet = Image.new("RGBA", (256,64))
            for frame in range(4):
                underlay = Image.new("RGBA", (64,64))
                draw = ImageDraw.Draw(underlay)
                rgb = gen3.snap(palette["anim"])
                if style and frame:
                    mask = footprint.getchannel("A").copy()
                    ImageDraw.floodfill(mask, (0,0), 255)
                    interior = ImageChops.invert(mask)
                    energy = Image.new("RGBA", (64,64))
                    ed = ImageDraw.Draw(energy)
                    ed.ellipse((14,15,50,53),fill=tuple(v//3 for v in rgb))
                    for i in range(11):
                        x,y = 22+(i*7+frame*3)%21,21+(i*9-frame*4)%27
                        ed.line((x,y,x+1,y-1),fill=rgb)
                    ed.arc((17+frame,18,47-frame,50),50+frame*14,266+frame*14,fill=rgb)
                    underlay.paste(energy, mask=ImageChops.multiply(energy.getchannel("A"),interior))
                underlay.alpha_composite(footprint)
                if not style:
                    # Light glints change by frame while the contact point remains fixed.
                    draw = ImageDraw.Draw(underlay)
                    x, y = ((26,49),(33,44),(37,47),(34,50))[frame]
                    if footprint.getpixel((x,y))[3]:
                        draw.point((x,y),fill=GOLD)
                sheet.paste(underlay,(frame*64,0))
            image = native_to_asset(sheet)
            yield f"structures/{theme}/{kind}.png", image
            if theme == "meadow":
                yield f"structures/{kind}/{kind}.png", image


def inset_panel(draw, box, border=BRONZE, fill=INK, active=False):
    x,y,r,b = box
    def corners(offset):
        return [(x+3+offset,y+offset),(r-3-offset,y+offset),(r-offset,y+3+offset),
                (r-offset,b-3-offset),(r-3-offset,b-offset),(x+3+offset,b-offset),
                (x+offset,b-3-offset),(x+offset,y+3+offset)]
    draw.polygon(corners(0),fill=OUTLINE)
    draw.polygon(corners(1),fill=border)
    draw.polygon(corners(2),fill=fill)
    draw.line((x+5,y+1,r-5,y+1),fill=GOLD if active else border)
    draw.point([(x+4,y+4),(r-4,b-4)],fill=border)


def hud_kit():
    im = Image.new("RGBA",(128,32))
    draw = ImageDraw.Draw(im)
    inset_panel(draw,(0,0,31,31),active=True)
    for center, full in ((48,True),(72,False)):
        gem = [(center,4),(center+8,16),(center,28),(center-8,16)]
        draw.polygon(gem,fill=INK,outline=BRONZE)
        if full:
            draw.polygon([(center,6),(center+6,16),(center,25),(center-6,16)],fill=(195,130,64))
            draw.polygon([(center,6),(center,16),(center-6,16)],fill=GOLD)
    draw.arc((101,4,123,26),20,330,fill=BRONZE,width=2)
    draw.arc((105,8,119,22),150,310,fill=GOLD,width=2)
    return native_to_asset(im)


def combat_kit():
    im = Image.new("RGBA",(144,96))
    draw = ImageDraw.Draw(im)
    for i, (el, ramp) in enumerate(ELEMENT_RAMPS.items()):
        x=24*i
        inset_panel(draw,(x+1,1,x+22,22))
        elemental_mote(draw,el,x+12,12,5,ramp)
    for i,(color,highlight) in enumerate((((83,44,51),(212,103,104)),((79,66,45),(226,174,94)),
                                         ((45,60,68),(113,193,187)),((53,47,70),(168,142,226)))):
        y=26+i*16
        inset_panel(draw,(0,y,54,y+13),color)
        draw.rectangle((4,y+5,44,y+8),fill=highlight)
        for x in range(10,45,7):
            draw.line((x,y+5,x,y+8),fill=color)
    for i,(label,color,fill) in enumerate((("normal",BRONZE,INK),("active",GOLD,(66,48,51)),
                                           ("disabled",(82,80,96),(39,37,48)))):
        y=26+i*16
        inset_panel(draw,(59,y,143,y+13),color,fill, label=="active")
        draw.polygon([(65,y+4),(69,y+7),(65,y+10),(62,y+7)], fill=color)
    for cx in (76,103,129):
        inset_panel(draw,(cx-9,76,cx+9,94),BRONZE)
    draw.line([(70,88),(75,83),(80,83)],fill=(127,190,206),width=2)
    draw.polygon([(103,81),(109,84),(108,90),(103,92),(98,90),(97,84)],outline=GOLD)
    draw.arc((124,80,135,91),30,335,fill=(185,152,221),width=2)
    return native_to_asset(im)
