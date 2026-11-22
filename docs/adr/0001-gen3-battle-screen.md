# Battles use a separate Gen 3-style battle screen

Battles happen on a separate screen with a Battle Scene behind them, Gen 3 style: the opponent stands on a far platform and the player's Pokémon is seen from behind on a near one. The Battle Scene is chosen by the District, the terrain where the battle starts and the kind of battle (wild, trainer, gym). We chose this over fighting directly on the Overworld map, even though the existing Pokémon sheets are top-down 8-direction art made for on-map action. The user wants the Emerald battle framing, with environments redesigned for Mons.

## Consequences

- Every species will need front and back battle sprites. Until that pipeline exists, battles use the down-facing and up-facing frames of the posses sheet, scaled to the platforms.
- About 100 Battle Scenes (9 Districts × 6 terrains × wild/trainer, plus 8 gyms) are built in code from layers, not drawn one by one.
