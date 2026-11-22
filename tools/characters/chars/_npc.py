"""Helper for NPC specs: one shared palette, roles -> slots A / B / C (or 'skin')."""


def npc(group, palette, layers, child=False, **roles):
    return dict(group=group, palette=palette, layers=layers, child=child, roles=roles)
