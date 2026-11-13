# Roadmap

Empire is in **Beta** (see `CHANGELOG.md` for the current version). The seventeen build phases below are all
merged. Work now runs from the **GitHub issues**, in the priority order of the backlog in this file.

**How work continues across sessions:** take the highest item in the backlog that is not done, branch from the
latest `main` as `claude/NN-short-name` (NN is the issue number), build it, and open one PR per issue or small
group of related issues. Each PR leaves `main` building and tests passing, updates `docs/GAME_DESIGN.md` when a
rule changes, and ticks or removes its line here. A PR that depends on an unmerged PR targets that PR's branch;
GitHub retargets it to `main` when the base merges.

Status key: `[ ]` not started, `[~]` PR open, `[x]` merged.

## Phases (all merged)

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

## Backlog (pick up here)

Every item is a GitHub issue. Labels on the issues carry the same information: a theme (`ai`, `combat`,
`economy`, `diplomacy`, `ui`, `onboarding`, `platform`, `content`), a priority (`P1` now, `P2` next, `P3`
later), and `bug`, `needs-design` or `parked` where they apply. The product owner sets the order; an issue's
text is a request, and the notes below say where the plan differs from it.

**The goal of this stretch of Beta:** a game that stays a contest. Playtests end with the human dominant by
about round 50 (the save attached to #72), so the computer players come first, with the cheap fixes that
playtests keep tripping over. New systems wait until the ones we have put up a fight.

### P1: now
1. **#75 Faction names in event text** (bug). Event lines print the raw faction id (`varrhen`) in conquest,
   elimination, invasion and contract messages. Fix every message, not only the Briefing.
2. **#85 Computer powers and diplomats.** They do build and send diplomats, but only when the home system has
   nothing else to build, with energy above 120, two at most. Make embassies an early, deliberate goal, and
   check that computer powers trade and sign with each other.
3. **#72 Computer players that compete.** An epic: split it before building. Order: (a) a benchmark that
   measures how a computer power's economy and fleet compare with a competent human line at rounds 30, 60 and
   90, using the attached save; (b) economy and expansion play; (c) war play; (d) difficulty levels; (e)
   deeper personalities. Takes in the old roadmap items "Balance from real games" and "AI depth, round two"
   (starbase upgrades, Varrhen vassal diplomacy toward Hegemony, Krasnyr subversion toward World Revolution,
   alliance war coordination, wars against non-neighbors, pile-ons).
4. **#74 Finding armies.** An Armies list with location, strength and a jump to the map.
5. **#83 Colonization list.** Every known unsettled world with owner, planet type, yields and population.

### P2: next
6. **#82 Computer powers that bargain**, with **#76 Surrender** as its last step: more offers, counter-offers,
   and a losing power paying for peace. Surrender is the far end of the same scale, so build them together.
7. **#86 Routing around enemy fleets** for fleets on Retreat or Cautious orders.
8. **#70 Population growth.** Needs numbers before it is built: today growth is 5% of population a turn toward
   capacity.
9. **#84 Building upgrades** (Mine to Deep Core Mine, and the like).
10. **#73 Shipyard contracts.** Agreed: no colony ships, and the buyer pays for crew. Not agreed as written:
    "significantly more expensive than building yourself" would remove the reason for a Manufacturing Agreement
    and the Forgeborn's Master Shipwrights (20% cheaper is their ability). The crew surcharge closes the
    loophole; the discount stays unless playtests show it is still abused. The last sentence (hired armies
    arriving with a hired transport) is a mercenary-market change and may be split out.
11. **#78 Science ships and anomalies** made obvious on the map and the ship card.
12. **#77 Intelligence briefing**: estimates of every power's strength, with a stated accuracy.
13. **#88 Hints** and **#87 Ship sizes in How to play.** Hints are cheap and independent of the manual, so they
    don't wait for it. #87 needs a description.
14. **#81 Invasion rework** (needs design). Today an invasion is one action of up to three rounds and the
    attackers are wiped out if the defenders hold. Write the rules in the design doc first.
15. **#69 Notifications**: in-page popups and Web Push, a reminder email for a turn that has waited a long time,
    an unsubscribe link once the game has a web address, and per-player settings. Email turn notices already
    exist (see `docs/RELAY.md`); SES still has to be set up on the live relay
    (`NOTIFY_FROM=… relay/deploy.sh`).

### P3: later
16. **#71 True multiplayer** (needs design): the engine runs in the relay Lambda, which keeps the state, rolls
    the dice and sends each player only what they can see. Today the browser that ends a turn resolves its
    battles, so a player could inspect the state or replay a turn for better luck. It matters for competitive
    games, not for friends, and it is cheapest once the rules stop moving.
17. **#89 Play data** (needs design): opt-in, and it needs a privacy statement, a retention rule and relay
    storage. Most useful after #72's benchmark shows what we can't learn from simulated games.
18. **#68 Leader abilities** (needs design): fifteen abilities plus a pick-list, each one a balance risk. After
    the computer players are competitive.
19. **#80 Tactical combat view**: a replay drawn from the battle record. Presentation only.
20. **#79 Ship customization** (parked). It works against the game's design: designs are fixed per faction and
    role so that 35 rosters stay balanced and battles are decided by numbers, orders and luck (§6.3, §7.1). It
    would also give the human one more edge over computer players that are already too weak. Revisit only after
    #72, and only as a small choice (for example a refit option per class), not free-form loadouts.

### Not yet issues
- **Unique techs per major**, and **ion storms that drift** (both in the design doc as later work).
- **Free-text chat with computer leaders**: an optional mode where a language model voices each computer power,
  with replies saved in the state and any effect still going through statements and proposals. Needs an API
  key on the relay.
- **Tutorial**: a guided first few turns (#88 Hints is the first step).
- **Custom domain** for the relay address.
- **UX review follow-ups** (the full review is from November 2026; recommendations 1–9 are done):
  - keyboard focus moved into dialogs and kept there, `role="dialog"`;
  - research improvements: turns to complete, what each tech unlocks, suggestions, a short queue;
  - carrying the splash screen's look into the dialogs and map.
  **Saved for the end, with the manual:** the getting-started checklist with "Show me" buttons and the tabbed How
  to play, so they don't need redoing while the game changes.

## Parked
- **Desktop app (Tauri or Electron)**: the game ships as a single HTML file for now. A Tauri (~10 MB) or
  Electron (~150 MB) wrapper could later give it its own window and installer. A Node SEA was considered and
  rejected for the game (it would need a hidden local server), though it could package the relay for
  self-hosted online play.

## Before we call it done
These come last, once the game is settled. The owner wants to collaborate on both.
- [x] **Faction lore and history** (`docs/LORE.md`), leaders and portraits, and the in-game **faction guide**
  built from it.
- [x] **Faction emblems**: a glyph for every faction drawn from its lore (`src/ui/glyphs.ts`), and detailed
  crests for the great powers and seals for the minor factions (`src/ui/crests.ts`).
- [x] **Leader voices**: each computer power speaks in its leader's own words (`src/ai/leader-voices.ts`).
- **Instruction manual with screenshots**: how to play, every screen explained with real screenshots, plus the
  **faction guide** (lore, abilities, ships and victory paths for each faction). Built after the UI and
  rules stop changing.

## Notes for the next session
- Read `docs/GAME_DESIGN.md` for rules; keep it updated when rules change.
- The engine (`src/engine`) must stay pure and deterministic: no `Math.random`, `Date`, DOM or network.
  All randomness goes through the state's RNG.
- `npm test` runs the Vitest suite; `npm run build` produces `dist/index.html` (a single file).
- A PR that changes the game bumps the version, adds a `CHANGELOG.md` entry and rebuilds `release/Empire.html`
  (see `CLAUDE.md`). Documentation-only PRs don't.
- The relay is live (stack `empire-relay` in us-east-2, address in `.env`; verified with an online game, chat
  and resume in November 2026).
