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
- [~] **15 Relay backend**: CloudFormation template (API Gateway WebSocket + Lambda + DynamoDB), local dev
  relay with the same protocol, protocol tests.
- [~] **16 Online async play**: create/join by code, seat claiming, turn upload/download, "your turn"
  notifications, reconnect, version checks.
- [~] **17 Polish and balance (first pass)**: remaining minor abilities wired in (Ghal'tar raiding, Vesh
  conversion, Ophidian bribery, Haldane smugglers, Taurine fortress homes), "How to play" screen, phone
  layout (stacked title screen, floating End Turn, panel only for selections), multi-seed balance survey.

## Backlog (pick up here)
Ordered roughly by value. Open a PR per item or small group.
1. **Deploy the relay**: `relay/cloudformation.yaml` and `relay/deploy.sh` are ready (`docs/RELAY.md`); the
   owner runs the script in AWS CloudShell, then builds `dist/index.html` with `EMPIRE_RELAY` baked in. The
   game itself is one HTML file players open directly; only online play needs the relay. After the first
   deploy: a real online test game, and optionally a custom domain for the relay address.
2. **Balance from real games** (combat lethality, luck and doctrine numbers are in `BALANCE.combat` and
   `src/data/doctrines.ts`; `test/combat.test.ts` checks the calibration): territory spreads fast (~230 hexes per major by turn 80 in
   `test/ai.test.ts`); some AIs field 150–200 ships; tune claims, upkeep and research costs after playtests.
   Aggressive AIs all pick on the weakest neighbor at once (in one seed the Concord is reduced to a single
   system by turn 80); consider making AIs less eager to join a pile-on, or more eager to defend victims.
3. **Notifications, round two**: email is in (relay + SES, opt-in per game). Next: Web Push for players who keep a browser, a reminder email when a turn has waited a long time, and an unsubscribe link once the game has a web address.
4. **AI depth, round two**: smarter use of starbase upgrades, Varrhen vassal diplomacy toward Hegemony, Krasnyr subversion campaigns toward World Revolution, alliance war coordination beyond rescue, and wars against non-neighbors.
5. **Unique techs per major** and ion storms that drift (both in the design doc as later work).
6. **Free-text chat with computer leaders** (option 3 from the messaging discussion): an optional mode where a
   language model voices each computer power, with replies saved in the state and any effect still going
   through statements and proposals. Needs an API key on the relay.
7. **Hidden information and fair dice**: run the engine inside the Lambda and send each player only what they
   can see. That also settles dice: today the browser that ends a turn resolves its battles, so a player
   could look at the downloaded state (it holds the random seed), try different orders offline and keep the
   luckiest. Battles are much swingier since combat rounds landed, so this matters more for competitive games.
8. **Tutorial**: a guided first few turns.

## Parked
- **Desktop app (Tauri or Electron)**: the game ships as a single HTML file for now. A Tauri (~10 MB) or
  Electron (~150 MB) wrapper could later give it its own window and installer. A Node SEA was considered and
  rejected for the game (it would need a hidden local server), though it could package the relay for
  self-hosted online play.

## Before we call it done
These come last, once the game is settled. The owner wants to collaborate on both.
- **Faction lore and history**: backgrounds, histories and relationships for the 5 great powers and 30 minor
  factions, written together with the owner. It feeds the faction guide and the computer powers' voices.
- **Instruction manual with screenshots**: how to play, every screen explained with real screenshots, plus the
  **faction guide** (lore, abilities, ships and victory paths for each faction). Built after the UI and
  rules stop changing.

## Notes for the next session
- Read `docs/GAME_DESIGN.md` for rules; keep it updated when rules change.
- The engine (`src/engine`) must stay pure and deterministic: no `Math.random`, `Date`, DOM or network.
  All randomness goes through the state's RNG.
- `npm test` runs the Vitest suite; `npm run build` produces `dist/index.html` (a single file).
