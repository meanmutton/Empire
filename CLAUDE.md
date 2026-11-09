# Empire

Online asynchronous turn-based 4X space strategy game for the browser (TypeScript, Vite, canvas).

- Rules: `docs/GAME_DESIGN.md`. Work plan and progress: `docs/ROADMAP.md` (continue from the first
  unchecked phase). Relay protocol: `docs/RELAY.md` (once phase 15 lands).
- Layout: `src/engine` (pure deterministic rules), `src/data` (factions, ships, techs, balance), `src/ai`,
  `src/ui` (canvas + DOM client), `src/net` (relay client), `relay/` (AWS backend and local dev relay),
  `test/` (Vitest).
- Commands: `npm test`, `npm run typecheck`, `npm run build` (single-file `dist/index.html`), `npm run dev`.
- Engine rule: no `Math.random`, `Date.now`, DOM or network calls inside `src/engine`, `src/data` or `src/ai`;
  use the RNG in the game state, so every client computes identical results.
- Workflow: one PR per roadmap phase on a `claude/NN-name` branch. Never push to or merge into `main`;
  the owner merges.
