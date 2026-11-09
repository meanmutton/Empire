# Roadmap

Empire is built as a series of small PRs, each one leaving `main` building and tests passing. The checklist
below is how work continues across sessions: **pick the first unchecked phase, branch from the latest
`main` (or from the previous phase's branch if it isn't merged yet), build it, open a PR, tick the box here
in that PR.**

Branch names: `claude/NN-short-name`. A PR that depends on an unmerged PR targets that PR's branch; GitHub
retargets it to `main` when the base merges.

Status key: `[ ]` not started, `[~]` PR open, `[x]` merged.

## Phases

- [~] **01 Design and scaffold**: game design doc, this roadmap, Vite + TypeScript + Vitest project,
  single-file HTML build, CI.
- [~] **02 Engine core**: seeded RNG, hex math (axial/offset, neighbors, distance, rings, pathfinding),
  core state types, serialization.
- [~] **03 Faction and unit data**: 5 majors, 30 minors, abilities, ship classes, roles, per-faction rosters,
  improvements, balance constants.
- [~] **04 Map generation**: hex types, major/minor placement with spacing, starting territories,
  fairness pass, wormholes; tests on the spacing and adjacency rules.
- [~] **05 Economy**: income, upkeep, population growth, system development, improvements, build queues.
- [~] **06 Movement and territory**: fleets, battle groups (≤6), movement points, terrain costs, pathing,
  pending claims at the start of the next turn, fog of war and visibility.
- [~] **07 Combat**: simultaneous en-masse resolution, shields/missiles/PD/fighters, lethality tuning test
  (equal forces lose ~50%), planetary defense, invasion, capture, retreat.
- [~] **08 Research**: tech tree (6 fields), unlocks, research progress.
- [~] **09 Diplomacy and espionage**: diplomats (travel, capture, embassies), relation states, agreements,
  trade proposals, vassals, opinion; spies and missions.
- [~] **10 Turn engine**: turn order, phases, orders → resolution, victory checks, event log.
- [ ] **11 Computer players**: AI for majors (personalities) and minors.
- [ ] **12 Client: map rendering**: canvas hex map, pan/zoom, territory borders, system icons,
  procedural faction ship tokens, minimap.
- [ ] **13 Client: UI**: new game setup, system panel, fleet panel and battle groups, build queue,
  research, diplomacy inbox, turn report, combat report.
- [ ] **14 Hotseat play**: play locally with several humans plus AI end to end.
- [ ] **15 Relay backend**: AWS SAM template (API Gateway WebSocket + Lambda + DynamoDB + S3), local dev
  relay with the same protocol, protocol tests.
- [ ] **16 Online async play**: create/join by code, seat claiming, turn upload/download, "your turn"
  notifications, reconnect, version checks.
- [ ] **17 Polish and balance**: autoplay balance simulations, tutorial hints, sound, accessibility, mobile.

## Notes for the next session
- Read `docs/GAME_DESIGN.md` for rules; keep it updated when rules change.
- The engine (`src/engine`) must stay pure and deterministic: no `Math.random`, `Date`, DOM or network.
  All randomness goes through the state's RNG.
- `npm test` runs the Vitest suite; `npm run build` produces `dist/index.html` (a single file).
