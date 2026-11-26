"""Kiểm định hình học, catalog, sprite và dữ liệu của bản duyệt."""
from pathlib import Path
import json
import re
from PIL import Image

ROOT = Path(__file__).parent
DATA = json.loads((ROOT / 'campaign.json').read_text(encoding='utf8'))


def validate_strip(name, size, count):
    with Image.open(ROOT / 'art' / f'{name}.png') as image:
        assert image.mode == 'RGBA' and image.size == (size*count, size), name
        seen = set()
        for index in range(count):
            frame = image.crop((index*size, 0, (index+1)*size, size))
            alpha = frame.getchannel('A')
            bounds = alpha.getbbox()
            assert bounds and min(bounds[:2]) >= 1 and max(bounds[2:]) <= size-1, (name, index, bounds)
            assert set(alpha.tobytes()) == {0, 255}, (name, index)
            seen.add(frame.tobytes())
        assert len(seen) == count, (name, len(seen))


def validate_maps(maps):
    assert [m['id'] for m in maps] == ['grasslands','desert','night','underwater','volcano']
    assert [m['id'] for m in maps if m['state'] == 'chapter'] == ['grasslands']
    width, height = DATA['viewport']
    for arena in maps:
        with Image.open(ROOT / arena['art']) as img:
            img.verify()
        with Image.open(ROOT / arena['art']) as img:
            assert img.format == 'PNG' and abs(img.width / img.height - width / height) < 0.01
        left, top, w, h = arena['lane']
        assert w > 0 and h > 0 and 0 <= left < left+w <= width and 0 <= top < top+h <= height
        points = [arena['party'], *arena['entries'].values()]
        if 'boss' in arena:
            points.append(arena['boss'])
        assert len(set(map(tuple, points))) == len(points)
        assert all(left <= x <= left+w and top <= y <= top+h for x, y in points), arena['id']


def validate_waves(waves, heroes, enemy_ids, boss, map_data):
    assert [wave['number'] for wave in waves] == list(range(1, 6))
    starter = DATA['progression']['starter']
    assert {wave['recruit'] for wave in waves} == heroes - {starter}
    assert len(heroes) == 6 and sum(w['crest'] for w in waves) == 235
    costs = [tier['cost'] for tier in DATA['progression']['upgradeTiers']]
    assert sorted(costs) == costs and waves[0]['crest'] >= costs[0]
    assert [p['thresholdPct'] for p in boss['phases']] == [100, 65, 30]
    assert all(p['windupMs'] >= 700 and p['response'] for p in boss['phases'])
    seen = set()
    for wave in waves:
        mobs_this_wave = set()
        worst_alive = 0
        for index, group in enumerate(wave['groups']):
            assert group['entry'] in map_data['entries'] or group['entry'] == 'boss' and wave['number'] == 5
            assert set(group['mobs']) <= enemy_ids | {boss['id']}
            assert all(isinstance(count, int) and count > 0 for count in group['mobs'].values())
            gate = group['gate']
            if index == 0:
                assert gate == 'start'
            elif wave['number'] == 5:
                assert gate == f"bossHp<={boss['phases'][index]['thresholdPct']}%"
            else:
                threshold = re.fullmatch(r'remaining<=(\d+)', gate)
                assert threshold, gate
                worst_alive = min(worst_alive, int(threshold[1]))
            worst_alive += sum(group['mobs'].values())
            assert worst_alive <= wave['maxAlive'], (wave['number'], index, worst_alive)
            mobs_this_wave.update(group['mobs'])
        assert mobs_this_wave - seen, wave['number']
        seen.update(mobs_this_wave)


def main():
    validate_maps(DATA['maps'])
    heroes, enemies, boss = DATA['heroes'], DATA['enemies'], DATA['boss']
    hero_ids = {hero['id'] for hero in heroes}
    enemy_ids = {enemy['id'] for enemy in enemies}
    assert len(hero_ids) == len(heroes) == 6 and len(enemy_ids) == len(enemies) == 5
    assert not (hero_ids & enemy_ids or boss['id'] in hero_ids | enemy_ids)
    validate_waves(DATA['waves'], hero_ids, enemy_ids, boss, DATA['maps'][0])
    for hero in heroes:
        validate_strip(hero['id'], 48, 15)
        validate_strip(hero['id'] + '-vfx', 64, 8)
        assert all(len(hero[skill]['phasesMs']) == 3 and min(hero[skill]['phasesMs']) > 0
                   for skill in ('active', 'ultimate'))
    for enemy in enemies:
        validate_strip(enemy['id'], 48, 11)
    validate_strip(boss['id'], 80, 15)
    js = (ROOT / 'preview-data.js').read_text(encoding='utf8').split('const campaign = ', 1)[1]
    preview = json.loads(js.strip().removesuffix(';'))
    assert {key: value for key, value in preview.items() if key != 'poses'} == DATA
    assert [len(preview['poses'][kind]) for kind in ('hero', 'foe', 'boss')] == [15, 11, 15]
    print('OK: 5 maps, 5 waves, 6 heroes, 5 mobs, 1 boss, 12 sprite strips, 6 VFX strips, 235 Crest')


if __name__ == '__main__':
    main()
