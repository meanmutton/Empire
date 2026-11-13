# Roadmap

Empire is in **Beta** (see `CHANGELOG.md` for the current version). The seventeen build phases at the bottom of
this file are all merged.

**The [GitHub issues](https://github.com/meanmutton/Empire/issues) are the source of truth for outstanding
work.** This file doesn't list them; it says how to read them.

## How to pick up work
1. Take an open issue labelled **`P1`**, bugs first. When no `P1` is left, move to `P2`, then `P3`.
2. Skip anything labelled `needs-design` until its rules are written into `docs/GAME_DESIGN.md` and agreed, and
   anything labelled `parked`.
3. Read the issue: each one has the original request, the scope, and often a "Done when". If the issue says it
   depends on another, do that one first. Sub-issues of an epic are done in the order the epic lists.
4. Branch from the latest `main` as `claude/NN-short-name` (NN is the issue number) and open one PR per issue or
   small group of related issues, with `Closes #NN` in the description. A PR that depends on an unmerged PR
   targets that PR's branch; GitHub retargets it to `main` when the base merges.
5. Each PR leaves `main` building and tests passing, and updates `docs/GAME_DESIGN.md` when a rule changes.

## Labels
- **Priority:** `P1` now, `P2` next, `P3` later. The product owner sets these.
- **Theme:** `ai`, `combat`, `economy`, `diplomacy`, `ui`, `onboarding`, `platform`, `content`.
- **State:** `bug`, `needs-design` (rules to settle first), `parked` (kept for the record, not planned).

New ideas and playtest findings go in as issues, not into this file.

## Current focus
A game that stays a contest. Playtests end with the human dominant by about round 50 of an intended 95–110
(#72), so the computer players come first, along with the cheap fixes playtests keep tripping over. New systems
wait until the ones we have put up a fight.

## Done before release
- [x] **Faction lore and history** (`docs/LORE.md`), leaders and portraits, and the in-game **faction guide**
  built from it.
- [x] **Faction emblems**: a glyph for every faction drawn from its lore (`src/ui/glyphs.ts`), and detailed
  crests for the great powers and seals for the minor factions (`src/ui/crests.ts`).
- [x] **Leader voices**: each computer power speaks in its leader's own words (`src/ai/leader-voices.ts`).
- The **instruction manual** is #101, and comes last.

## Notes for the next session
- Read `docs/GAME_DESIGN.md` for rules; keep it updated when rules change.
- The engine (`src/engine`) must stay pure and deterministic: no `Math.random`, `Date`, DOM or network.
  All randomness goes through the state's RNG.
- `npm test` runs the Vitest suite; `npm run build` produces `dist/index.html` (a single file).
- A PR that changes the game bumps the version, adds a `CHANGELOG.md` entry and rebuilds `release/Empire.html`
  (see `CLAUDE.md`). Documentation-only PRs don't.
- The relay is live (stack `empire-relay` in us-east-2, address in `.env`; verified with an online game, chat
  and resume in November 2026).

## Build phases (all merged)

- [x] **01 Design and scaffold**: game design doc, this roadmap, Vite + TypeScript + Vitest project,
  single-file HTML build, CI.
- [x] **02 Engine core**: seeded RNG, hex math (axial/offset, neighbors, distance, rings, pathfinding),
  core state types, serialization.
- [x] **03 Faction and unit data**: 5 majors, 30 minors, abilities, ship classes, roles, per-faction rosters,
  improvements, balance constants.
- [x] **04 Map generation**: hex types, major/minor placement with spacing, starting territories,
  fairness pass, wormholes; tests on the spacing and adjacency rules.
- [x] **05 Economy**: income, upkeep, population growth, system development, improvements, build queues.
- [x] **06 Movement and territory**: fleets, battle groups (≤6), movement points, terrain costs, pathing,
  pending claims at the start of the next turn, fog of war and visibility.
- [x] **07 Combat**: simultaneous en-masse resolution, shields/missiles/PD/fighters, lethality tuning test
  (equal forces lose ~50%), planetary defense, invasion, capture, retreat.
- [x] **08 Research**: tech tree (6 fields), unlocks, research progress.
- [x] **09 Diplomacy and espionage**: diplomats (travel, capture, embassies), relation states, agreements,
  trade proposals, vassals, opinion; spies and missions.
- [x] **10 Turn engine**: turn order, phases, orders → resolution, victory checks, event log.
- [x] **11 Computer players**: AI for majors (personalities) and minors.
- [x] **12 Client: map rendering**: canvas hex map, pan/zoom, territory borders, system icons,
  procedural faction ship tokens, minimap.
- [x] **13 Client: UI**: new game setup, system panel, fleet panel and battle groups, build queue,
  research, diplomacy inbox, turn report, combat report.
- [x] **14 Hotseat play**: play locally with several humans plus AI end to end.
- [x] **15 Relay backend**: CloudFormation template (API Gateway WebSocket + Lambda + DynamoDB), local dev
  relay with the same protocol, protocol tests.
- [x] **16 Online async play**: create/join by code, seat claiming, turn upload/download, "your turn"
  notifications, reconnect, version checks.
- [x] **17 Polish and balance (first pass)**: remaining minor abilities wired in (Ghal'tar raiding, Vesh
  conversion, Ophidian bribery, Haldane smugglers, Taurine fortress homes), "How to play" screen, phone
  layout (stacked title screen, floating End Turn, panel only for selections), multi-seed balance survey.
