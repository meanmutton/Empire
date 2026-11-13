# Empire

Online asynchronous turn-based 4X space strategy game for the browser (TypeScript, Vite, canvas).

- Rules: `docs/GAME_DESIGN.md`. Work plan and priorities: `docs/ROADMAP.md` (the backlog there orders the
  GitHub issues; take the highest item that is not done). Relay protocol: `docs/RELAY.md`. Lore: `docs/LORE.md`.
- Layout: `src/engine` (pure deterministic rules), `src/data` (factions, ships, techs, balance), `src/ai`,
  `src/ui` (canvas + DOM client), `src/net` (relay client), `relay/` (AWS backend and local dev relay),
  `test/` (Vitest).
- Commands: `npm test`, `npm run typecheck`, `npm run build` (single-file `dist/index.html`), `npm run dev`,
  `npm run release` (rebuilds `release/Empire.html`, the downloadable, with the live relay from `.env`).
- Release: any PR that changes the game runs `npm run release` and commits the new `release/Empire.html`.
  Every release bumps the version first: `npm version patch --no-git-tag-version` (or `minor` for a milestone)
  and adds an entry to `CHANGELOG.md`. The version lives only in `package.json`; `src/version.ts` reads it, and
  the stage label (`STAGE`, now "Beta") is set there.
- Engine rule: no `Math.random`, `Date.now`, DOM or network calls inside `src/engine`, `src/data` or `src/ai`;
  use the RNG in the game state, so every client computes identical results.
- Workflow: one PR per issue (or small group of related issues) on a `claude/NN-name` branch, where NN is the
  issue number. Never push to or merge into `main`; the owner merges.
