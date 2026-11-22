"""Draw the small pixel glyphs used by Expedition's battle status HUD."""
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

from build_bundle import sha256_file
from pixel_worlds import gen3

REPO = Path(__file__).resolve().parents[2]
BUNDLE = REPO / 'database-astral-expedition'
SIZE = 24
COLUMNS = 5
INK = '#242039'
PALE = '#fff1cb'


def glyph(status):
    image = Image.new('RGBA', (SIZE, SIZE))
    d = ImageDraw.Draw(image)
    if status in ('atk_up', 'atk_down'):
        tint = '#ffd766' if status == 'atk_up' else '#ba8be0'
        d.polygon([(17,2),(21,2),(21,6),(10,17),(6,13)], fill=tint, outline=INK)
        d.line((8,14,19,3), fill=PALE, width=2)
        d.line((4,12,11,19), fill='#a4754c', width=2)
        d.line((7,16,3,20), fill=PALE, width=2)
        if status == 'atk_down':
            image = image.transpose(Image.Transpose.ROTATE_180)
    elif status in ('def_up', 'def_down'):
        broken = status == 'def_down'
        d.polygon([(3,5),(12,2),(21,5),(20,14),(17,18),(12,22),(7,18),(4,14)], fill='#d97496' if broken else '#67bdec', outline=INK)
        d.line([(5,6),(12,4),(19,6)], fill='#ffe1e4' if broken else '#d5f3ff', width=2)
        if broken:
            d.line([(15,4),(10,10),(14,12),(9,20)], fill=INK, width=3)
        else:
            d.line((12,7,12,17), fill='#d5f3ff', width=2)
    elif status == 'crit_up':
        d.polygon([(12,1),(15,8),(22,12),(15,15),(12,22),(9,15),(2,12),(9,8)], fill='#ffca52', outline=INK)
        d.polygon([(12,5),(14,10),(19,12),(14,14),(12,19),(10,14),(5,12),(10,10)], fill='#fff1a5')
    elif status == 'haste':
        for x in (2, 10):
            d.polygon([(x,5),(x+4,5),(x+10,12),(x+4,19),(x,19),(x+6,12)], fill='#69e4e1', outline=INK)
    elif status == 'regen':
        d.polygon([(3,6),(6,3),(10,3),(12,6),(14,3),(18,3),(21,6),(21,11),(12,21),(3,11)], fill='#4ccd90', outline=INK)
        d.line((8,10,16,10), fill='#e1ffd4', width=2)
        d.line((12,6,12,14), fill='#e1ffd4', width=2)
    elif status == 'taunt':
        d.polygon([(2,9),(7,9),(18,3),(20,4),(20,17),(18,18),(7,13),(3,13)], fill='#e99773', outline=INK)
        d.line((6,12,8,20), fill='#e99773', width=3)
        d.line((21,5,23,3), fill=PALE)
        d.line((21,15,23,17), fill=PALE)
    elif status in ('vuln', 'mark'):
        color = '#ffca79' if status == 'vuln' else '#ed9afd'
        d.ellipse((5,5,18,18), outline=color, width=2)
        for line in [(11,2,11,8),(11,15,11,21),(2,11,8,11),(15,11,21,11)]:
            d.line(line, fill=color, width=2)
        if status == 'vuln':
            d.line([(7,17),(17,7)], fill=PALE, width=2)
        else:
            d.rectangle((10,10,13,13), fill=color)
    elif status == 'slow':
        d.polygon([(6,4),(18,4),(16,8),(13,11),(16,14),(18,20),(6,20),(8,14),(11,11),(8,8)], fill='#9bacc8', outline=INK)
        d.line((5,3,19,3), fill='#dfe8fb', width=2)
        d.line((5,20,19,20), fill='#dfe8fb', width=2)
        d.polygon([(9,18),(12,12),(15,18)], fill='#dfe8fb')
    elif status == 'burn':
        d.polygon([(12,1),(15,8),(17,7),(20,12),(20,17),(17,21),(7,21),(3,17),(3,13),(7,7),(7,12)], fill='#df5949', outline=INK)
        d.polygon([(12,7),(14,13),(17,14),(16,19),(8,19),(6,16)], fill='#ffa056')
        d.polygon([(12,11),(15,17),(13,20),(10,19),(9,17)], fill='#fff1ac')
    elif status == 'bleed':
        d.polygon([(12,2),(15,8),(20,15),(19,19),(15,22),(8,22),(4,18),(4,14)], fill='#dc465e', outline=INK)
        d.line([(8,13),(7,16),(9,18)], fill='#ffc0b9', width=2)
    elif status in ('frostbite', 'stun'):
        color = '#9ceaff' if status == 'frostbite' else '#e1c9ff'
        if status == 'frostbite':
            for line in [(11,2,11,21),(3,6,20,17),(3,17,20,6)]:
                d.line(line, fill=color, width=2)
            for path in [[(8,4),(11,7),(14,4)],[(8,19),(11,16),(14,19)],[(4,9),(8,9),(7,5)],[(16,18),(16,14),(20,14)]]:
                d.line(path, fill=color, width=2)
        else:
            d.polygon([(12,2),(15,8),(22,9),(17,14),(18,21),(12,18),(6,21),(7,14),(2,9),(9,8)], fill=color, outline=INK)
            d.line([(12,6),(9,12),(13,12),(10,18)], fill='#6f4e99', width=2)
    else:
        raise ValueError(f'Missing battle status glyph for {status}')
    return gen3.to_gen3(image)


def publish():
    rules = (REPO / 'shared/src/expedition/combat-rules.ts').read_text(encoding='utf-8')
    statuses = re.findall(r"'([a-z_]+)'", rules.split('export const STATUS_IDS = [', 1)[1].split(']', 1)[0])
    atlas = Image.new('RGBA', (COLUMNS * SIZE, ((len(statuses) + COLUMNS - 1) // COLUMNS) * SIZE))
    for i, status in enumerate(statuses):
        atlas.paste(glyph(status), ((i % COLUMNS) * SIZE, (i // COLUMNS) * SIZE))
    atlas = atlas.resize((atlas.width * 2, atlas.height * 2), Image.Resampling.NEAREST)
    path = BUNDLE / 'ui/status-icons.png'
    atlas.save(path)
    manifest_path = BUNDLE / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['files']['ui/status-icons.png'] = {
        'width': atlas.width, 'height': atlas.height, 'sha256': sha256_file(path), 'bytes': path.stat().st_size,
    }
    manifest['totalFiles'] = len(manifest['files'])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Published {len(statuses)} combat status icons')


if __name__ == '__main__':
    publish()
