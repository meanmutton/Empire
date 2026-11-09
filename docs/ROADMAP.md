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
- [~] **11 Computer players**: AI for majors (personalities) and minors.
- [~] **12 Client: map rendering**: canvas hex map, pan/zoom, territory borders, system icons,
  procedural faction ship tokens, minimap.
- [~] **13 Client: UI**: new game setup, system panel, fleet panel and battle groups, build queue,
  research, diplomacy inbox, turn report, combat report.
- [~] **14 Hotseat play**: play locally with several humans plus AI end to end.
- [~] **15 Relay backend**: AWS SAM template (API Gateway WebSocket + Lambda + DynamoDB + S3), local dev
  relay with the same protocol, protocol tests.
- [~] **16 Online async play**: create/join by code, seat claiming, turn upload/download, "your turn"
  notifications, reconnect, version checks.
- [~] **17 Polish and balance (first pass)**: remaining minor abilities wired in (Ghal'tar raiding, Vesh
  conversion, Ophidian bribery, Haldane smugglers, Taurine fortress homes), "How to play" screen, phone
  layout (stacked title screen, floating End Turn, panel only for selections), multi-seed balance survey.

## Backlog (pick up here)
Ordered roughly by value. Open a PR per item or small group.
1. **Deploy the relay** (`docs/RELAY.md`) and host the built `dist/index.html` (GitHub Pages or S3), with
   `EMPIRE_RELAY` baked in. Needs the owner's AWS account.
2. **Balance from real games**: territory spreads fast (~230 hexes per major by turn 80 in
   `test/ai.test.ts`); some AIs field 150–200 ships; tune claims, upkeep and research costs after playtests.
   Aggressive AIs all pick on the weakest neighbor at once (in one seed the Concord is reduced to a single
   system by turn 80); consider making AIs less eager to join a pile-on, or more eager to defend victims.
3. **Diplomacy UI**: the engine supports trading territory (hexes); the proposal builder doesn't offer it yet.
4. **Manufacturing agreements**: currently −10% ship cost; the design also lets you build at partners'
   shipyards.
5. **Offline notifications**: Web Push or email when it becomes your turn (the relay knows whose turn it is).
6. **Combat presentation**: battle report dialog with before/after per side, simple animations, sound.
7. **AI depth**: coordinated invasions with transports, starbase placement at chokepoints, smarter spy
   targeting, alliance war coordination, using Mercenary Contracts / For Hire / Star Charts actively.
8. **Unique techs per major** and ion storms that drift (both in the design doc as later work).
9. **Hidden information**: run the engine inside the Lambda and send each player only what they can see.
10. **Tutorial**: a guided first few turns.

## Notes for the next session
- Read `docs/GAME_DESIGN.md` for rules; keep it updated when rules change.
- The engine (`src/engine`) must stay pure and deterministic: no `Math.random`, `Date`, DOM or network.
  All randomness goes through the state's RNG.
- `npm test` runs the Vitest suite; `npm run build` produces `dist/index.html` (a single file).
