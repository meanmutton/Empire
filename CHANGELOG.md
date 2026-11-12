# Changelog

Every release bumps the version in `package.json` (the game reads it from there): a **patch** (0.2.1, 0.2.2…)
for each release, a **minor** (0.3.0) for a milestone. Add an entry here with the bump.

## 0.2.1 Beta

- **Victory and defeat screens**: when a game ends, a full-screen splash shows "Victory" or "Defeat" over key art
  of the command hall (lit gold when you win, dark and cracked when you lose), with who won or why you lost and
  the turn it ended. "See the galaxy" returns to the final map; "Leave to title" quits. On a shared (hot seat)
  screen a win by any human is a victory. The pictures are in `art/endings/`; `python3 scripts/endings.py` packs
  them into the game.
- **Enter wormhole**: a fleet standing on a wormhole now has an *Enter wormhole* button beside Move and Hold
  that jumps it to the twin (1 movement, none for the Tal or with Wormhole Stabilization) and follows it there.
- **Map scrolling**: the map could not be scrolled far enough right (or, on phones, down) because its limit ignored
  the part of the screen covered by the side panel or selection sheet, so the edge column of hexes stayed hidden.
  It now scrolls until the edge is fully visible.
- **Cargo ships for every power**: the Ryn'kai had no cargo ship, so they could not run trade routes. They now have
  the *Tallyman*, and each of the 22 minor factions that lacked one has a cargo vessel of its own, so every faction
  can build cargo ships and open routes.

## 0.2.0 Beta — the official Beta

The first release we call Beta: the whole game is playable end to end, alone against the computer, hotseat or
online through the relay. Rules may still change with playtesting, and saves from one version aren't promised
to load in the next.

Since 0.1.0:

- **The galaxy and its powers**: 5 great powers and 30 minor factions, each with its own abilities, ship
  roster, emblem, lore, three named leaders with portraits and voices, and an in-game faction guide.
- **Economy and territory**: systems, development levels, improvement slots shown on a visual colony view,
  build queues, enclosed space joining your territory, and cut-off territory passing to a power that
  completely surrounds it.
- **Outposts as monitoring posts**: constructors build outposts that hold a hex and watch as far as your
  scouts see; colony ships do the settling (colonies on habitable worlds, footholds on harsh ones).
- **Fleets and combat**: battle groups, multi-turn routes you can redirect each turn, multi-round battles
  with doctrines, crits and damage states, battle forecasts and battle reports, armies carried by transports
  for invasions.
- **Science vessels** that add science (more at stellar phenomena), survey ruins and spot cloaked ships.
- **Diplomacy and trade**: diplomats and embassies, agreements, alliances and vassals, trade proposals
  (technologies, systems, armies, resources), a public exchange, mercenaries, shipyard contracts and trade
  routes run by cargo ships; spies with missions and intelligence on rivals.
- **Victory**: several victory tracks with per-faction availability and presets.
- **Computer players** with personalities that expand, fight, trade and spy.
- **Interface**: the Command deck look, a phone layout, tooltips everywhere, a briefing dialog, one
  Diplomacy screen with the market folded in, sounds and notifications.

## 0.1.0

The first playable build.
