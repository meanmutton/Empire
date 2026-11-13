# Empire
Online multiplayer turn-based empire conquest game.

A browser-based, asynchronous 4X space strategy game for 1–5 human players and up to 14 computer players
on a large generated hex map. See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the rules and
[docs/ROADMAP.md](docs/ROADMAP.md) for how work is planned (outstanding work lives in the GitHub issues).

## Playing
**Download [release/Empire.html](release/Empire.html)** and open it in a browser: that one file is the whole
game, with online play built in.

- **On one device**: start a game for 1–5 players. With more than one human, the board is hidden between
  turns ("hot seat"). Games autosave in the browser.
- **Online**: create a game, share the six-letter code or link, and friends join and pick an empire. Turns
  are asynchronous: play yours whenever it comes up. The relay setup is in [docs/RELAY.md](docs/RELAY.md).

## Development
```bash
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # single-file build in dist/index.html
npm run release  # build and copy it to release/Empire.html (the downloadable)
npm run relay    # local online relay on ws://localhost:8787 (open the game with ?relay=ws://localhost:8787)
```
Handy URLs: `?quick&players=concord,rynkai` jumps into a game, `?gallery` shows every faction's ships,
`?debug` adds a reveal-map option.
