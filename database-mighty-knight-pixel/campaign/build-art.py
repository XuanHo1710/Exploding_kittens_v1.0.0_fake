"""Xuất sprite strip nguyên bản và dữ liệu cho trang review ngoại tuyến."""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
DATA = json.loads((ROOT / 'campaign.json').read_text(encoding='utf8'))
INK, SHADOW, LEATHER, SKIN, STEEL = '#181423', '#30263a', '#59413e', '#eab28b', '#c1bfcc'
HERO_POSES = ['idle', 'idle-rise', 'walk-a', 'walk-b', 'walk-c', 'windup', 'strike-a',
              'strike-b', 'strike-c', 'cast', 'release', 'dash', 'guard', 'hit', 'down']
FOE_POSES = ['idle', 'idle-rise', 'walk-a', 'walk-b', 'windup', 'strike-a',
             'release', 'dash', 'guard', 'hit', 'down']
BOSS_POSES = ['idle', 'idle-rise', 'walk-a', 'walk-b', 'walk-c', 'windup', 'strike-a',
              'strike-b', 'strike-c', 'cast', 'release', 'dash', 'guard', 'hit', 'down']


def pen(surface):
    brush = ImageDraw.Draw(surface)

    def shape(points, color, outline=INK):
        brush.polygon(points, fill=color, outline=outline)

    def line(points, color, width=1):
        brush.line(points, fill=color, width=width)

    return brush, shape, line


def weapon(shape, line, style, hand, tip, hot):
    x, y = hand
    tx, ty = tip
    if style == 'bow':
        line([(x-2,y-12),(x+4,y-8),(x+7,y),(x+4,y+8),(x-2,y+12)], INK, 4)
        line([(x-2,y-12),(x+4,y-8),(x+6,y),(x+4,y+8),(x-2,y+12)], hot, 2)
        line([(x-2,y-12),(x-4,y),(x-2,y+12)], STEEL)
        return
    line([(x-3,y+3),tip], INK, 5)
    line([(x-3,y+3),tip], LEATHER, 2)
    if style == 'hammer':
        shape([(tx-5,ty-4),(tx+5,ty-4),(tx+6,ty+2),(tx+3,ty+4),(tx-5,ty+3)], STEEL)
        line([(tx-3,ty-2),(tx+3,ty-2)], hot, 2)
    elif style == 'staff':
        shape([(tx,ty-5),(tx+4,ty-2),(tx+4,ty+2),(tx,ty+6),(tx-3,ty+2),(tx-3,ty-2)], hot)
        line([(tx-1,ty-2),(tx-1,ty+1)], '#f1fff2')
    else:
        shape([(x+1,y-2),(tx-2,ty-3),(tx,ty),(tx-2,ty+3),(x+2,y+2)], STEEL)
        line([(x+3,y-1),(tx-2,ty-1)], hot)
        line([(x-1,y-4),(x+2,y+3)], INK, 2)
        if style in {'spear', 'twin'}:
            shape([(tx-5,ty-4),(tx+2,ty),(tx-5,ty+4),(tx-3,ty)], hot)


def hero(spec, pose):
    surface = Image.new('RGBA', (48, 48))
    draw, shape, line = pen(surface)
    dark, mid, bright = spec['colors']
    style = dict(arden='sword', linnet='bow', vesper='twin', brann='hammer',
                 maelle='staff', solen='spear')[spec['id']]
    if pose == 'down':
        shape([(8,40),(14,36),(24,36),(29,40),(39,40),(42,43),(8,43)], dark)
        shape([(27,39),(31,36),(36,37),(38,41),(32,42)], SKIN)
        line([(12,40),(22,39)], mid)
        return surface
    x = 23 + {'windup':-3,'strike-a':3,'strike-b':5,'strike-c':4,'dash':5,'hit':-4}.get(pose, 0)
    y = 17 + {'idle-rise':-1,'walk-b':-1,'strike-c':2,'cast':-2,'dash':5,'guard':3,'hit':2}.get(pose, 0)
    step = {'walk-a':-5,'walk-c':5,'dash':6,'strike-c':4,'hit':-4}.get(pose, 0)
    width = 7 if style == 'hammer' else 5
    cape = 13 if style in {'sword', 'staff', 'twin'} else 8
    shape([(x-5,y+5),(x-9,y+9),(x-cape,y+17),(x-cape-1-step//2,y+23),
           (x-5,y+22),(x+1,y+16)], dark)
    line([(x-8,y+10),(x-cape,y+20),(x-7,y+21)], mid)
    for i, dx in enumerate((-step-3, step+3)):
        px = x+dx
        shape([(x-4+i*5,y+15),(x-1+i*5,y+14),(px+2,39),(px+4,41),
               (px+4,43),(px-3,43),(px-3,39)], SHADOW if i == 0 else LEATHER)
        line([(px-1,41),(px+2,41)], mid)
    shape([(x-width,y+4),(x-3,y+1),(x+6,y+3),(x+width+2,y+8),
           (x+4,y+16),(x+6,y+20),(x-5,y+21),(x-7,y+16)], dark)
    shape([(x-3,y+5),(x+3,y+4),(x+4,y+12),(x-2,y+16),(x-5,y+10)], mid)
    line([(x-5,y+15),(x+4,y+14)], INK, 2)
    draw.rectangle((x,y+14,x+1,y+15), fill=bright)
    shape([(x-6,y-4),(x-3,y-9),(x+3,y-9),(x+7,y-5),(x+7,y+1),
           (x+3,y+5),(x-4,y+3)], dark if style == 'bow' else SHADOW)
    shape([(x-2,y-5),(x+4,y-5),(x+6,y-2),(x+4,y+2),(x,y+2),(x-2,y)], SKIN)
    line([(x+2,y-2),(x+4,y-2)], INK)
    if style == 'bow':
        shape([(x-7,y-4),(x-4,y-10),(x+1,y-12),(x+6,y-6),(x+4,y-5),(x-2,y-5),(x-5,y+2)], mid)
    elif style == 'spear':
        shape([(x-4,y-5),(x-4,y-12),(x,y-7),(x+3,y-11),(x+6,y-8),(x+6,y-5)], STEEL)
        line([(x-3,y-8),(x+1,y-6),(x+4,y-8)], bright)
    elif style == 'twin':
        line([(x+4,y),(x-2,y+1),(x-7,y+4),(x-13,y+2)], mid, 3)
    elif style == 'staff':
        line([(x+4,y-5),(x,y-8),(x-4,y-5),(x-4,y+3)], bright, 2)
    else:
        line([(x-4,y-6),(x+1,y-8),(x+5,y-6)], mid, 2)
    if style == 'hammer':
        shape([(x-8,y+5),(x-4,y+3),(x,y+5),(x-1,y+10),(x-8,y+10)], mid)
    dx, dy = {'walk-b':(3,8),'windup':(-4,-5),'strike-a':(8,3),'strike-b':(10,-1),
              'strike-c':(8,9),'cast':(3,-6),'release':(9,-2),'dash':(8,6),
              'guard':(4,1),'hit':(4,9)}.get(pose, (5,7))
    hand = (x+dx, y+dy)
    line([(x+3,y+5),hand], INK, 6)
    line([(x+3,y+5),hand], mid, 3)
    draw.rectangle((hand[0]-1,hand[1]-1,hand[0]+1,hand[1]+1), fill=SKIN)
    if pose == 'guard':
        shape([(x+3,y-1),(x+10,y-4),(x+17,y),(x+16,y+10),(x+10,y+15),(x+4,y+10)], mid)
        line([(x+10,y),(x+10,y+11)], bright, 2)
        return surface
    tx, ty = {'windup':(17,7),'strike-a':(43,y+1),'strike-b':(44,y-7),
              'strike-c':(43,y+14),'cast':(34,7),'release':(42,y-9),
              'dash':(43,y+3)}.get(pose, (34,y-9))
    if style == 'bow':
        hand = (min(hand[0], 36), min(max(hand[1], 15), 29))
    if style == 'hammer':
        tx = min(tx, 40)
    if style == 'staff':
        tx = min(tx, 42)
    if style == 'twin':
        weapon(shape, line, 'twin', (x-5,y+10), (max(4,x-13),y+14), bright)
    weapon(shape, line, style, hand, (tx,ty), bright)
    return surface


def foe(spec, pose):
    surface = Image.new('RGBA', (48, 48))
    draw, shape, line = pen(surface)
    dark, mid, bright = spec['colors']
    enemy = spec['id']
    if pose == 'down':
        shape([(7,42),(11,39),(19,42),(27,38),(37,40),(41,43),(7,43)], dark)
        line([(17,41),(26,41),(30,40)], mid, 2)
        return surface
    x = 23 + {'walk-a':-1,'windup':-3,'strike-a':3,'release':2,'dash':4,
              'guard':-2,'hit':-4}.get(pose,0)
    y = 30 + {'idle-rise':-1,'walk-b':-2,'windup':2,'release':-2,
              'guard':3,'hit':2,'dash':1}.get(pose, 0)
    attack = pose in ('strike-a', 'release', 'dash')
    if enemy == 'thornfly':
        y -= 8
        wing = 4 if pose in ('idle-rise','walk-b','release') else 0
        shape([(x-2,y),(x-17,y-12-wing),(x-14,y-2),(x-6,y+5)], mid)
        shape([(x,y-1),(x+11,y-13+wing),(x+13,y-5),(x+5,y+4)], bright)
        line([(x-15,y-9-wing),(x-7,y-1)], bright)
        shape([(x-9,y+1),(x-14,y+9),(x-7,y+8),(x+1,y+5),(x+1,y-2)], dark)
        shape([(x-3,y-4),(x+6,y-5),(x+10,y),(x+8,y+6),(x-2,y+5)], mid)
        draw.rectangle((x+5,y-1,x+7,y+1), fill=INK)
    elif enemy == 'reedling':
        for i, offset in enumerate((-6,6)):
            foot = x+offset+(-3 if pose == 'walk-a' and i == 0 else 0)
            ground = min(42, y+12)
            line([(x+offset,y+6),(foot,ground),(foot+3,ground)], INK, 4)
        leaf = -2 if pose == 'windup' else 5 if attack else 0
        shape([(x-4,y-6),(x-9,y-15),(x-5,y-16),(x+1,y-10),(x+4+leaf,y-20),
               (x+8+leaf,y-19),(x+7,y-9),(x+13,y-12),(x+11,y-5)], mid)
        shape([(x-11,y-2),(x-7,y-7),(x+5,y-8),(x+12,y-2),(x+11,y+6),
               (x+5,y+9),(x-7,y+8),(x-12,y+4)], dark)
        shape([(x-9,y-2),(x-4,y-5),(x+5,y-5),(x+9,y),(x+5,y+5),(x-4,y+6)], mid)
        draw.rectangle((x+2,y,x+4,y+2), fill=INK)
        draw.rectangle((x+7,y,x+8,y+1), fill=bright)
    elif enemy == 'mossback':
        shape([(x-17,y+6),(x-14,y-4),(x-8,y-12),(x+6,y-12),(x+14,y-6),
               (x+14,y+5),(x+9,y+7),(x+8,43),(x+4,43),(x+4,y+7),
               (x-8,y+7),(x-10,43),(x-15,43),(x-14,y+7)], dark)
        shape([(x-15,y-3),(x-8,y-10),(x+4,y-11),(x+9,y-6),(x+3,y-3),(x-7,y-4)], mid)
        shape([(x+3,y-3),(x+10,y-7),(x+14,y-6),(x+17,y-10),(x+16,y-3),
               (x+17,y+2),(x+10,y+5),(x+4,y+3)], mid)
        line([(x+14,y-4),(x+17,y-9)], bright, 2)
        draw.point((x+12,y-1), fill=INK)
    else:
        shape([(x-11,y+10),(x-8,y-4),(x-5,y-9),(x-7,y-16),(x-3,y-20),
               (x+6,y-19),(x+9,y-14),(x+6,y-8),(x+10,y+7),
               (x+7,42),(x+1,42),(x,39),(x-4,43),(x-11,43)], dark)
        shape([(x-6,y-7),(x,y-8),(x+4,y+2),(x+2,y+8),(x-8,y+8)], mid)
        shape([(x-2,y-16),(x+5,y-16),(x+7,y-12),(x+4,y-9),(x-1,y-10)], bright)
        draw.point((x+4,y-13), fill=INK)
        if enemy == 'barkward':
            offset = 2 if attack else 0
            s = x+offset
            shape([(s+1,y-10),(s+10,y-13),(s+16,y-9),(s+14,y+3),(s+8,y+10),(s+2,y+6)], LEATHER)
            line([(s+10,y-11),(s+8,y-2),(s+10,y+2),(s+7,y+7)], mid, 2)
            line([(s+14,y-7),(s+12,y+3)], bright)
        else:
            tx, ty = (x+14,y-13) if attack else (x+12,y-18)
            line([(x+6,y+5),(tx,ty)], bright, 2)
            shape([(tx-4,ty+6),(tx-2,ty),(tx+2,ty),(tx+4,ty+6)], mid)
            line([(tx-3,ty+6),(tx+3,ty+6)], bright, 2)
    return surface


def stag(spec, pose):
    surface = Image.new('RGBA', (80, 80))
    draw, shape, line = pen(surface)
    dark, mid, bright = spec['colors']
    if pose == 'down':
        shape([(10,72),(17,65),(43,64),(51,69),(62,65),(70,70),(71,73),(11,73)], dark)
        line([(20,69),(31,67),(43,67),(48,70)], mid, 2)
        return surface
    x = {'windup':-4,'strike-a':4,'strike-b':6,'strike-c':5,'release':2,
         'dash':4,'cast':1,'guard':-2,'hit':-5}.get(pose,0)
    y = {'idle-rise':-1,'walk-b':-2,'windup':3,'strike-c':3,'release':-2,
         'dash':2,'cast':-2,'guard':4}.get(pose,0)
    step = {'walk-a':-4,'walk-c':4,'dash':5,'strike-c':4}.get(pose,0)
    for i, a in enumerate((22,33,49,56)):
        end = a+x+(step if i%2 else -step)
        shape([(a+x-4,44+y),(a+x+3,44+y),(end+2,65),(end+5,70),(end+4,73),
               (end-3,73),(end-4,68)], dark if i%2 else SHADOW)
        line([(end-2,68),(end+1,68)], mid)
    shape([(12+x,39+y),(22+x,31+y),(43+x,30+y),(50+x,24+y),(59+x,28+y),
           (61+x,48+y),(54+x,57+y),(25+x,55+y),(16+x,49+y)], dark)
    shape([(18+x,38+y),(27+x,33+y),(42+x,34+y),(51+x,31+y),(55+x,38+y),
           (51+x,47+y),(36+x,44+y),(21+x,48+y)], mid)
    line([(42+x,35+y),(37+x,39+y),(39+x,43+y),(35+x,50+y)], INK, 2)
    line([(24+x,37+y),(29+x,37+y),(32+x,39+y)], bright)
    hx, hy = 56+x, 27+y+ (5 if pose in ('strike-a','dash') else 0)
    shape([(hx-9,hy+3),(hx-6,hy-7),(hx+2,hy-9),(hx+7,hy-3),(hx+12,hy-2),
           (hx+13,hy+3),(hx+6,hy+8),(hx-6,hy+7)], mid)
    draw.rectangle((hx+3,hy-4,hx+5,hy-2), fill=INK)
    draw.point((hx+4,hy-3), fill=bright)
    for dx, dy in ((-6,0),(2,-3)):
        fork = [(hx+dx,hy-4+dy),(hx+dx-4,hy-12+dy),(hx+dx-13,hy-17+dy),
                (hx+dx-16,max(3,hy-23+dy))]
        line(fork, INK, 5)
        line(fork, mid, 3)
        line([fork[1],(hx+dx-1,max(3,hy-22+dy))], bright, 2)
        line([fork[2],(hx+dx-8,max(3,hy-24+dy))], mid, 2)
    for i in range(3):
        px, py = 32+x+i*7, 48+y+i%2*3
        line([(px,py-5),(px,py)], INK, 2)
        shape([(px-2,py),(px+2,py),(px+3,py+3),(px-3,py+3)], bright)
    return surface


def effect(spec, index):
    surface = Image.new('RGBA', (64, 64))
    draw, shape, line = pen(surface)
    dark, mid, bright = spec['colors']
    kind = spec['active']['vfx']
    r = 9 + index*3 if index < 7 else 29
    glow = bright if index < 5 else mid
    if kind == 'arc':
        draw.arc((32-r,32-r,32+r,32+r), 260, 82, fill=mid, width=5)
        draw.arc((32-r,32-r,32+r,32+r), 269, 69, fill=glow, width=2)
    elif kind in ('arrow','spear'):
        x = 17 + 5*index
        y = 31 if kind == 'arrow' else 23+index
        shape([(max(2,x-16),y+2),(x-4,y-1),(x,y-4),(min(62,x+6),y),
               (x,y+3),(x-5,y+1)], glow, mid)
        line([(max(2,x-21),y+4),(x-7,y+2)], dark, 2)
    elif kind == 'rift':
        shape([(31-r,40),(29,33),(32+r,23),(35,34),(31,37)], glow, mid)
        line([(27,37),(37,40),(37+r//2,49)], mid, 2)
    elif kind == 'impact':
        shape([(32-r,42),(23,39),(29,26-index),(34,37),(40,32),(38,40),(32+r,44),
               (38,47),(25,45)], mid, dark)
        line([(33,36),(32,23-index),(32,16-index)], glow, 2)
    else:
        draw.ellipse((32-r,35-r//3,32+r,35+r//3), outline=mid, width=3)
        draw.arc((32-r,34-r//3,32+r,34+r//3), 15, 170, fill=glow, width=2)
    for i in range(3):
        x, y = 32 + (-1)**i*(r-i*4), 29-i*6+(index%3)
        draw.rectangle((x,y,x+1,y+1), fill=glow)
    return surface


def strip(path, cell, frames):
    sheet = Image.new('RGBA', (cell * len(frames), cell))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index*cell, 0))
    sheet.save(path, optimize=True)


def main():
    art = ROOT / 'art'
    art.mkdir(exist_ok=True)
    for spec in DATA['heroes']:
        strip(art / f"{spec['id']}.png", 48, [hero(spec, p) for p in HERO_POSES])
        strip(art / f"{spec['id']}-vfx.png", 64, [effect(spec, i) for i in range(8)])
    for spec in DATA['enemies']:
        strip(art / f"{spec['id']}.png", 48, [foe(spec, p) for p in FOE_POSES])
    strip(art / 'cairn-stag.png', 80, [stag(DATA['boss'], p) for p in BOSS_POSES])
    preview = dict(DATA, poses={'hero':HERO_POSES,'foe':FOE_POSES,'boss':BOSS_POSES})
    (ROOT / 'preview-data.js').write_text(
        f'// Generated by build-art.py\nconst campaign = {json.dumps(preview, ensure_ascii=False, separators=(",", ":"))};\n',
        encoding='utf8')


if __name__ == '__main__':
    main()
