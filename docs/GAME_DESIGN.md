# Empire: Game Design Document

Empire is an online, asynchronous, turn-based 4X space strategy game played in the browser. Each game has
1–5 human players and up to 14 computer players: the 5 **major factions** (human or computer) and 10 **minor
factions** (always computer) drawn from a pool of 30.

This document is the source of truth for rules. Numbers marked *(tunable)* live in `src/data/balance.ts`
and are expected to change during playtesting.

---

## 1. Core loop

1. **Explore**: scouts and deep-exploration ships reveal the map, find star systems, anomalies and other factions.
2. **Expand**: ships claim hexes; constructors and colony ships settle and develop star systems.
3. **Exploit**: developed systems produce resources; resources fund ships, armies, starbases, agents and research.
4. **Exterminate / Negotiate**: diplomats open relations, treaties and trade; fleets, armies and spies take what diplomacy can't.

## 2. Players and turns

- A game has 15 factions: all 5 majors plus 10 minors chosen at random from 30.
- 1–5 humans each pick a major faction. Majors without a human are run by the computer.
- **Turn order** is fixed at game start (shuffled). A *round* is every faction taking one turn.
- **Asynchronous play**: when a human ends their turn, their client resolves the turn, then runs every
  computer faction's turn up to the next human, and uploads the new game state to the relay. The next human is
  notified and plays when convenient. Nobody needs to be online at the same time.
- **Turn timer** *(optional, per game)*: if a human doesn't play within N hours, the computer may play a
  "caretaker" turn for them (defensive only, no diplomacy).
- The engine is deterministic: the game state carries its own seeded random generator, so any client given the
  same state and orders produces the same result.

### Phases of a faction's turn

1. **Start of turn**
   - Pending claims resolve: any hex this faction occupied at the end of its previous turn with no enemy
     present becomes its territory (see §5.3).
   - Income is collected; upkeep is paid; population grows; research progresses.
   - Build queues advance; finished units appear at their shipyard.
   - Agents (spies, diplomats) resolve missions that completed.
2. **Orders**: move fleets and agents, set builds, research, diplomacy, trades. Moving into a hex with
   enemies stops movement.
3. **End of turn**
   - One **combat round** resolves in every hex where this faction's forces share a hex with forces it is at
     war with (see §7).
   - Hexes this faction occupies alone are marked as **pending claims** for the start of its next turn.
   - Diplomatic proposals are delivered to their recipients.

## 3. Factions

Each faction has a color, a ship visual style, attribute modifiers, special abilities, a ship roster (not
every faction has every class or role) and an AI personality. Full numbers are in `src/data/factions.ts`.

### 3.1 Major factions

| # | Name | Species and government | Inspiration | Color |
|---|------|------------------------|-------------|-------|
| 1 | **Terran Concord** | Humans; cooperative social democracy | 21st-century Sweden | Azure `#3f8efc` |
| 2 | **Ryn'kai Dominion** | Mammalian humanoid warriors; honor-bound military dictatorship | early–mid 20th-century Imperial Japan | Crimson `#d7263d` |
| 3 | **Varrhen Ascendancy** | Reptilian humanoids; authoritarian ultranationalist state | early–mid 20th-century Germany | Olive gold `#b5a33a` |
| 4 | **Krasnyr People's Union** | Mammalian humanoids; one-party collectivist state | Cold War USSR | Orange `#ff8c1a` |
| 5 | **The Lattice** | Artificial beings; AI-run technocracy | none | Violet `#9b5de5` |

**Leaders.** Each great power has three leaders (`src/data/leaders.ts`; lore in `docs/LORE.md`). A computer-run
power gets one picked by the galaxy seed; a human player picks one at setup or leads under their own name. Their
portraits appear in Diplomacy and beside their words; minor factions show an envoy. Leaders are flavour only.
A portrait with a modest version (`<name>-sfw`) shows that one unless the player turns on **Show revealing
portraits** in Options (title screen or in-game Menu; off by default, saved per browser).

#### Terran Concord
*Explorers, scientists and negotiators who would rather talk than fight.*
- Attributes: Science +20%, Diplomacy +25%, ship attack −10%, army strength −10%.
- **Open Society**: diplomats move +1 hex per turn and are 50% more likely to win acceptance of proposals.
  Every research agreement the Concord is in gives both partners +10% science.
- **Pathfinders**: Scout and Deep Exploration ships get +1 movement and +2 sensor range. The first time any
  Concord ship enters an anomaly or ruin, the Concord gets a bonus science grant.
- **Consensus Government**: war weariness. While the Concord is at war with a faction that didn't declare war
  on it first, all output is −10%. In exchange, systems never revolt and unrest is halved.
- Roster: every class except Dreadnaught; strong Science, Escort and Deep Exploration roles; Fighter Carriers
  from Light Cruiser up.
- AI personality: Peaceful explorer. Seeks research and trade agreements; defends allies; declares war only on
  someone who attacked it or an ally.

#### Ryn'kai Dominion
*A warrior people bound by honor. Strength is the only argument that matters, though alliances serve when needed.*
- Attributes: ship attack +20%, army strength +30%, Science −15%, Diplomacy −10%.
- **Way of the Blade**: Ryn'kai battle groups never retreat. In the first combat round of a battle they deal
  +25% damage.
- **Boarding Actions**: when an enemy ship is left with ≤25% hull at the end of a combat round, a Ryn'kai
  ship in the same battle may capture it instead of destroying it (chance based on army strength).
- **Honor Bound**: the Ryn'kai never break a treaty first. Allies who break one with them suffer a permanent
  −50 opinion with the Dominion, and the Dominion gets +10% attack against them for the rest of the game.
- Roster: every class; ships are heavily armed with thin shields; no Science Vessel role. Their Cargo Vessel is the Tallyman.
- AI personality: Aggressive conqueror. Attacks the weakest neighbor; allies with whoever shares its
  strongest enemy; keeps its word.

#### Varrhen Ascendancy
*Cold, cunning reptilian expansionists. They use violence freely, but play diplomat while they are weak.*
- Attributes: Metals +20%, ship build cost −15%, Diplomacy −5%.
- **Total Mobilization**: may switch the economy into Mobilization: ship and army build time −50%,
  Science −50%. Switching back takes 3 turns.
- **Lightning War**: in the 3 turns after declaring war, all Varrhen fleets get +1 movement.
- **Calculated Diplomacy**: while the Ascendancy's military strength is below the average of the majors, non-aggression
  pacts and trade agreements it proposes are 40% more likely to be accepted.
- Roster: every class; especially strong Destroyers and Battleships; few Cargo variants.
- AI personality: Opportunist. Builds up behind pacts, then strikes when it's stronger than its target.

#### Krasnyr People's Union
*A vast collectivist state that would rather win a war in the shadows than on the battlefield.*
- Attributes: Population growth +25%, Metals +10%, Science −10%, espionage +30%; *Realpolitik*: may break
  treaties at half the usual opinion penalty.
- **Ministry of State Security**: spies cost −40% and have +30% mission success. The Union starts with 2 spies.
- **Five-Year Plan**: once per 10 turns, choose a resource. Its output is +50% for 5 turns, then −10% for 5 turns.
- **Fifth Column**: spies can run *Subversion* in enemy systems, raising unrest until the system defects. A
  defected system joins the Union with its improvements intact.
- Roster: every class except Battle Cruiser; cheap, plentiful Corvettes and Frigates; massive Dreadnaughts.
- AI personality: Schemer. Joins alliances, spies on everyone, betrays an ally when it calculates a gain.

#### The Lattice
*A networked society of artificial minds. Unpredictable: equally likely to calculate that war or peace is optimal.*
- Attributes: average in everything (no modifiers).
- **Distributed Cognition**: earns +1 science for every 5 hexes it owns, and gains research points from every battle
  it fights (win or lose).
- **Self-Repair**: Lattice ships repair 15% of hull every turn even outside friendly territory.
- **Assimilation**: conquered systems join the Lattice with no unrest and keep 100% of their improvements
  (others keep 50%).
- Roster: every class; uniform, balanced ships; drone Fighters; no Cargo Vessel crew limits.
- AI personality: Calculator. Re-evaluates every relation every 5 turns from expected value; no grudges, no loyalty.

### 3.2 Minor factions

There are 30 minor factions, and 10 are drawn for each game. Minors are always computer-controlled. Each owns a
home system plus the 6 adjacent hexes, never expands beyond 2 hexes from home, and can become a **vassal** of a
major (§9.5). Each has 1–2 special abilities and a small roster (2–4 classes).

| # | Name | Ideology | Strength | Abilities |
|---|------|----------|----------|-----------|
| 1 | Myrr Choir | Psionic pacifist theocracy | Science | **Mind Shield** (immune to espionage); **Harmonic Calm** (attackers −20% damage in round 1) |
| 2 | Quorr Salvage Fleets | Nomadic anarchist scavengers | Metals | **Salvagers** (gain metals equal to 25% of the cost of ships destroyed in their battles) |
| 3 | Thessic Banking Houses | Mercantile plutocracy | Energy | **Trade Hub** (trade agreements +50% for both sides); **Mercenary Contracts** (sell warships on the mercenary market) |
| 4 | Ghal'tar Pirate Clans | Raider clans | Raiding | **Raiders** (fleets in an enemy system steal 10% of its energy and metals each turn); **Ambush** (+30% attack in nebulae and asteroids) |
| 5 | Ixxi Swarm | Insectoid hive mind | Numbers | **Swarm Tactics** (Fighters and Corvettes −30% cost); **Rapid Breeding** (+50% population growth) |
| 6 | Celestine Order | Monastic knightly theocracy | Armies | **Zealots** (armies +50% strength); **Aegis of Faith** (shields +20%) |
| 7 | Voidborn Drifters | Deep-space nomads | Mobility | **Void-Adapted** (no hazard penalties); **Elusive** (50% chance to retreat from a losing battle) |
| 8 | Aurelian Republic | Declining elder democracy | Technology | **Ancient Archives** (start with 3 extra techs, willing to trade them); **Prestige** (+20 opinion with all) |
| 9 | Korrigan Miners' Guild | Syndicalist miners | Metals | **Deep-Core Mining** (asteroid fields yield double metals) |
| 10 | Sylph Gardeners | Ecological plant-collective | Growth | **Terraformers** (system development −40% cost); **Regrowth** (ships repair +10% per turn) |
| 11 | Nhar Shadow Court | Secretive oligarchy of spymasters | Stealth | **Cloaking Fields** (ships invisible unless an enemy has sensors ≥ their stealth); **Infiltrators** (+40% spy success) |
| 12 | Brakk Warbands | Feudal warlords | Brute force | **Berserkers** (+30% attack, −30% shields); **Boarding Parties** (capture crippled ships) |
| 13 | Ophidian Syndicate | Criminal cartel | Commerce | **Black Market** (no fee on the galactic exchange; trade partners pay half); **Bribery** (enemies fighting in their territory deal −30% damage) |
| 14 | Lumen Collective | Beings of pure energy | Energy | **Photonic Weapons** (energy weapons +25%); **Stellar Feeding** (double energy from stars) |
| 15 | Cryx Remnant | Cybernetic husk of a fallen empire | Attrition | **Assimilation** (20% of enemy ships destroyed in their battles join the Cryx at 25% hull) |
| 16 | Taurine Herd Assembly | Pastoral defensive democracy | Defense | **Fortress Worlds** (planetary defenses +100%); **Stampede** (+20% attack in own territory) |
| 17 | Echo Engineers | Isolationist genius-caste | Engines | **Advanced Engines** (+1 movement); **Prototype Lab** (trade techs 30% cheaper) |
| 18 | Vesh Prophets | Missionary faith | Influence | **Conversion** (+5 unrest per turn, up to 60, in foreign systems within 3 hexes) |
| 19 | Haldane Free Traders | Libertarian convoy culture | Trade | **Smugglers** (systems can't be blockaded; cargo ships draw 90% less fire and can't be boarded); **Free Port** (anyone may trade with them without a diplomat) |
| 20 | Grendis Iron Legion | Mercenary army-state | Armies | **For Hire** (rent out veteran armies for 10 turns); **Veterans** (armies start at elite rank) |
| 21 | Pelagic Union | Aquatic federation | Population | **Ocean Worlds** (+50% population on habitable worlds); **Deep Shelters** (systems can't be bombarded below 1 population) |
| 22 | Zenith Observatory | Scholar-astronomers | Sensors | **Long-Range Sensors** (sensor range +3); **Star Charts** (sell copies of their charts) |
| 23 | Morrow Bloom | Biological horror fleet | Bio-weapons | **Spore Payload** (attacks reduce a system's population); **Living Hulls** (ships regenerate 20% hull per turn) |
| 24 | Kethran Crystal-Minds | Silicon crystalline consensus | Durability | **Crystalline Hulls** (hull +40%); **Slow Thought** (−1 movement) |
| 25 | Skarn Hunters | Apex predator packs | Aggression | **Hunter's Instinct** (+30% damage against already-damaged ships); **Tracking** (cloaked ships within 2 hexes revealed) |
| 26 | Ilyrian Courts | Dynastic monarchy | Diplomacy | **Royal Marriage** (vassalage offers +50% likely accepted); **Court Intrigue** (+20% spy defense) |
| 27 | Forgeborn Anvil | Industrial guild-state | Shipbuilding | **Master Shipwrights** (ships −20% cost; build ships to order for anyone at peace with them) |
| 28 | Tal Wanderers | Wormhole-faring archivists | Exploration | **Wormhole Navigation** (move through wormholes at no cost, reveal wormhole pairs) |
| 29 | Hollow Sun Cult | Star-worshippers | Exotics | **Stellar Harnessing** (neutron stars and pulsars yield double exotics); **Solar Flare** (once per battle, 10% damage to all enemies) |
| 30 | Unbound Mechanists | Machines freed from the Lattice | Resilience | **Self-Repair** (ships repair 15% per turn); **Grudge** (+25% attack against the Lattice) |

## 4. The map

### 4.1 Layout
- Hex grid, **50 columns × 30 rows** (1,500 hexes) by default, pointy-top hexes in an odd-row offset layout,
  axial coordinates in the engine. The size is configurable (small 36×22, standard 50×30, huge 64×40).
- Generated fresh each game from a seed.

### 4.2 Hexes: terrain and star systems
Every hex has a **terrain**, and may also contain one **star system**. These are separate: a system can sit
in open space, an asteroid field, a nebula, or beside a neutron star or pulsar.

**Terrain** (`TERRAIN_INFO` in `src/data/improvements.ts`)

| Terrain | Move cost | Notes |
|---------|-----------|-------|
| Open space | 1 | Each owned hex gives +0.1 energy. |
| Asteroid field | 2 | Systems here are asteroid-belt mining colonies, rich in metals. |
| Nebula | 2 | Hides fleets from sensors outside the hex; shields −50% inside; systems inside get +1 science. |
| Neutron star | 1 | Ships ending a turn here take 5% hull damage; systems here have a neutron star (high energy and exotics). |
| Pulsar | 1 | −1 sensor range for ships inside; systems here orbit a pulsar (exotics, science). |
| Ion storm | 2 | No shields inside. *(Later: drifts 1 hex every few turns.)* |
| Black hole | — | Impassable. |
| Wormhole | 1 | Paired; jumping to the twin costs 1 movement (0 for the Tal or with Wormhole Stabilization). A fleet standing on one has an **Enter wormhole** button on its card that makes the jump. |

**Star systems** have a star (yellow, orange, red dwarf, blue giant, white, neutron, pulsar), a **planet
type**, a size (1–5) and a development level (§5.2).

| Planet type | Population | Notes |
|-------------|------------|-------|
| Terran, Ocean, Jungle | high | Best colony worlds; colony ships found a level-2 colony. |
| Desert, Arctic | medium | Habitable; colony ships found a level-2 colony. |
| Barren, Volcanic | very low | Metals; footholds. |
| Gas giant | none | Energy and exotics; can only be developed to level 2 (footholds and colonies). |
| Asteroid belt | very low | The system type found in asteroid fields; double metals with Deep-Core Mining. |

A system's state comes from who owns it and how developed it is: **unsettled** (development 0, anyone can
settle it with a colony ship, or hold it with an outpost), an **independent colony** (pre-existing, level 1–2, with its own planetary defense
and garrison), a faction's **colony**, or a **home system** (majors start at level 4, minors at 3). A system
may also hold **ancient ruins**, a one-time reward for the first survey ship or colony.

### 4.3 Generation rules
1. **Majors** are placed first, spread as evenly as possible (best-of-N candidate placement maximizing the
   minimum distance; a minimum of 9 hexes between majors on a standard map).
2. Each major gets a **starting territory of ~20 hexes**: the home system plus two other systems within 3 hexes,
   grown outward from home by flood-fill.
3. **Minors** are placed between majors, at least 3 hexes from any other faction's territory, and own their home
   system plus the 6 adjacent hexes.
4. **No faction starts adjacent to another**: there's always at least one unclaimed hex between territories.
5. Remaining hexes are filled by weighted random types, with clustering for nebulae and asteroid belts, a few
   wormhole pairs, black holes away from homes, and a fairness pass: every major has comparable resources
   within 6 hexes (±10%).

## 5. Territory, systems and the economy

### 5.1 Resources

| Resource | Source | Used for |
|----------|--------|----------|
| **Energy** ⚡ | Stars, power plants, owned hexes, trade | Upkeep for ships and starbases, diplomacy, spies, rush-buying |
| **Metals** ⛏ | Planets, asteroids, mines | Ships, starbases, improvements |
| **Population** 👥 | Habitable worlds (grows each turn up to capacity) | Armies, colony ships, crews (big ships need population), workforce multiplier |
| **Science** 🔬 | Labs, population, anomalies, agreements | Research |
| **Exotics** ✦ | Gas giants, nebulae, neutron stars, pulsars | Advanced ships (Battle Cruiser and up), cloaking, shields tier 3+, wonders |

Energy, Metals and Exotics are stockpiled. Population is per system (with an empire total). Science goes
straight into research. A stockpile can go negative only for energy, and then ships lose supply (−25% combat)
until it's positive again.

### 5.2 Star systems and development
Every system has a **planet type**, a **size** (1–5), base yields, and a **development level** of 0–5:

| Level | Name | Unlocks |
|-------|------|---------|
| 0 | Unclaimed / Survey | — |
| 1 | Foothold | a colony ship's settlement on a harsh world (population cap below 4); claims the hex |
| 2 | Colony | population can grow; spies and diplomats |
| 3 | Settlement | shipyard (up to Destroyer) |
| 4 | Industrial World | heavy shipyard (all classes) |
| 5 | Core World | highest yields (×2.5 base) |

**Improvement slots** = size + 2 × development − 1 (at least 2): from 2 on a small new foothold to 14 on a
large core world. Gas giants and similar uninhabitable worlds can be developed only to level 2.

Builds are paid for up front when queued; each system then puts production points into its own queue
every turn (more for higher development and population). Unfinished builds can be rushed with energy
(3 energy per remaining point). Cancelling gives everything back until work on a build begins, and half once
it is under way.

**Improvements** (each takes one slot): Mine (+4 Metals), Power Plant (+3 Energy), Research Lab (+3 Science),
Factory (+3 production), Habitat (+4 population capacity), Orbital Farm (+3 population capacity, +1 energy;
Hydroponics), Deep Core Mine (+7 Metals; level 3, Asteroid Mining), Antimatter Reactor (+6 Energy; level 3,
Antimatter), University (+6 Science; level 3, Quantum Computing; one per system), Refinery (+Exotics, needs
an exotic source), Shipyard / Heavy Shipyard, Planetary Shield (+defense), Ground Garrison (+army defense),
Trade Port (+energy per trade agreement), Academy (new units start veteran). Yields grow 10% per development
level. **Repeats taper off**: each further copy of the same improvement in one system yields 20% less than the
one before (100%, 80%, 64%, …), so a mix pays better than a stack.

### 5.3 Claiming hexes
- **Only empty hexes are taken by presence**: open space and unsettled star systems (development 0). Such a
  hex becomes yours at the **start of your next turn** if, at the end of your turn, your ship or battle group
  was in it with no other non-allied forces there. This gives enemies one round to contest or recapture it.
- Taking an **enemy-owned** hex requires being at war with its owner.
- **Settled planets** (any development level, including undefended footholds and independent colonies) are
  never taken by presence: fleets knock their planetary defense down to 0 in combat, then armies **invade**
  (§7.5).
- An **enemy starbase** in a hex blocks any claim there until it is destroyed in combat.
- **Outposts** are monitoring posts, not settlements. A Constructor builds one (30 metals, 10 energy; the
  constructor survives but spends its turn) in any hex of your own territory or unclaimed space, one per hex,
  never in a black hole or beside non-allied forces. It claims the hex at once and holds it: nobody can claim
  that hex while the outpost stands, and it keeps the territory around it connected (see cut-off territory).
  It watches the hexes around it exactly as far as your scouts see (their sensors plus your sensor techs),
  and, like a scout, doesn't reveal cloaked ships. It has no yields, slots, population or build queue. A
  world under your outpost can still be settled by your colony ship. Outposts are unarmed: enemy warships
  (at war) in the hex, with none of the owner's forces left there, destroy it at the end of their turn,
  after which the hex can be claimed as usual.
- **Enclosed space**: at the start of your turn, any pocket of unowned hexes (up to 60) that your territory
  completely surrounds becomes yours, without ships. A pocket that touches the map edge or borders anyone
  else's territory doesn't count. Inside it, settled independent worlds, black holes and hexes with other
  powers' ships stay unclaimed.
- An owned hex not connected to your home by a chain of owned hexes is **disconnected**: −50% yields
  *(tunable)*.
- **Cut-off territory changes hands**: owned hexes with none of their owner's planets, outposts or starbases
  connected to them (through the owner's territory) for **10 turns** pass to the power that **completely
  engulfs** them: every hex bordering the piece belongs to that one power, and it doesn't touch the map edge.
  If no single power surrounds it, it stays where it is. Hexes where the owner has ships, and settled worlds,
  are never handed over this way. The hex panel shows the countdown and who would get it.
- The hex panel also says, wherever your ships are, whether they will claim the hex and, if not, why not.

**Moving more than one turn.** A fleet sent further than it can go this turn moves as far as it can at once
and keeps the rest of its route. On each later turn it starts with its full movement and its route still set:
you can redirect or stop it, and if you leave it alone it carries on along the route at the **end of your
turn** (before battles and claims).

### 5.4 Income each turn
`yield = base(system type) × development multiplier × improvement bonuses × faction modifiers × treaties`,
plus 0.1 energy per owned empty hex. Upkeep: each ship costs energy per turn by class; starbases and agents cost
energy too. Population grows 5% per turn toward capacity (faction-modified).

### 5.5 The galactic exchange
- Any faction can swap one stockpiled resource (energy, metals, exotics) for another on the public exchange,
  at any time on its turn, without needing a partner.
- Base prices (in energy): energy 1, metals 1.2, exotics 4. Selling a resource pushes its price down and
  buying pushes it up (by the value traded ÷ (1,500 + 40 × turn)), within half and double the base price.
  Prices drift 15% back toward base each round.
- A **40% fee** applies. The Ophidian Syndicate (Black Market) pays none, and anyone with a Trade
  Agreement with the Ophidians pays 20%.
- For a better deal, trade one-on-one with another faction through a proposal (§9.4), where no fee applies.

### 5.6 Trade routes
- A **cargo ship** that reaches a settled system (development 2+) of an empire you have a **Trade Agreement**
  with (or any Haldane system: Free Port) can **open a trade route**. The ship becomes the route, linked back
  to your nearest settled system. You can also link two of your own systems at least 4 hexes apart (a
  domestic route).
- Every turn **both ends earn energy**: 2 + ¼ per hex of length (up to +10) + the average development of the
  two systems, ×1.25 for a Trade Port at either end, ×1.5 if either side has Trade Hub. Domestic routes pay
  60%.
- You can run **2 routes, plus one per Trade Port** you own.
- **Disruption**: armed warships of anyone at war with either partner, anywhere on the route, or a blockade
  at either end, stop the income that turn. Ghal'tar raiders pocket what they cut. Haldane routes can't be
  disrupted (Smugglers).
- War between the partners, or losing either system, ends the route.
- The Ryn'kai have no cargo ships: they don't run trade routes.

## 6. Units

### 6.1 Ship classes

| Class | Size | Hull | Slots | Typical move | Needs tech | Crew (pop) |
|-------|------|------|-------|--------------|------------|------------|
| Fighter | 1 | 10 | 1 | carried | — | 0 |
| Runabout | 1 | 20 | 1 | 5 | — | 0 |
| Corvette | 2 | 40 | 2 | 4 | — | 0 |
| Frigate | 3 | 70 | 3 | 4 | — | 1 |
| Destroyer | 4 | 110 | 4 | 4 | Hull II | 1 |
| Light Cruiser | 5 | 160 | 5 | 3 | Hull II | 2 |
| Heavy Cruiser | 6 | 230 | 6 | 3 | Hull III | 2 |
| Battle Cruiser | 7 | 300 | 7 | 4 | Hull IV + Exotics | 3 |
| Battleship | 8 | 400 | 8 | 3 | Hull IV + Exotics | 4 |
| Dreadnaught | 10 | 600 | 10 | 2 | Hull V + Exotics | 6 |

### 6.2 Ship attributes
- **Hull**: hit points. At 0 the ship is destroyed.
- **Shields**: absorb that many points of *energy* damage per round and absorb missiles at half efficiency.
  Shields fully recharge each round.
- **Energy weapons**: beam attack strength. Accurate, reduced by shields.
- **Missile weapons**: missile attack strength. Ignore half of shields; can be shot down by point defense.
- **Point defense**: destroys incoming missile damage and fighters.
- **Hangar**: number of Fighters carried (Fighter Carriers).
- **Speed**: movement points per turn.
- **Sensors**: how far the ship sees.
- **Stealth**: cloaked unless an enemy's sensor strength in range is ≥ stealth.
- **Cargo**: armies, colonists or trade goods carried.
- **Evasion**: chance to dodge (higher for small ships).
- **Cost**: metals, energy, exotics, population (crew), and build time in turns.
- **Upkeep**: energy per turn.
- **Experience**: Green → Regular → Veteran → Elite (+5% attack and evasion per rank above Regular).

### 6.3 Roles
A ship design = class + role + faction style. The role sets how the class's slots are spent.

| Role | Emphasis |
|------|----------|
| Scout | Speed, sensors; minimal weapons |
| Deep Exploration | Range, hazard resistance, sensors; can survey anomalies and ruins |
| Ship-of-the-Line | Balanced weapons, shields and hull |
| Fighter Carrier | Hangar for fighters; light weapons |
| Escort | Point defense, shields; protects other ships (takes hits for them) |
| Science Vessel | +2 science a turn, +5 while studying a nebula, pulsar, neutron star, ion storm or wormhole or beside a black hole; surveys ruins; reveals cloaked ships and spies in sensor range |
| Cargo Vessel | Carries armies, colonists, resources; trade routes |
| Colony Ship | Settles a system: a Colony (level 2) on habitable worlds, a Foothold (level 1) on harsh ones (consumed) |
| Constructor | Builds outposts (monitoring posts, §5.3) and starbases |
| Troop Transport | Heavy-duty army carrier with landing bonus |
| Raider | Speed and missiles; bonus vs Cargo/Colony ships |

### 6.4 Battle groups
- Up to **6 ships** form a battle group that moves and fights as one. It moves at the speed of its slowest ship.
- Fighters don't count toward the 6; they ride in carriers.
- A hex can hold any number of battle groups.

### 6.5 Other units
- **Armies**: built at systems with population; carried by Cargo/Troop ships; invade systems by beating the
  garrison in a ground battle. Strength, morale, experience.
- **Spies**: move covertly (only visible to science vessels and starbases with detection). Missions:
  Steal Tech, Raid the Treasury (steal 15% of the target's energy and metals, up to 150 of each), Sabotage
  (destroy an improvement or delay a build), Incite Unrest, Subversion (Krasnyr only), Assassinate Diplomat,
  Reveal Territory. A spy's panel lists every mission it could run where it stands, with the odds. Victims
  always learn what was done to them, and half the time whose spies did it (−10 opinion).
- **Diplomats**: travel physically to a faction's home system to open relations (§9). Can ride in ships.
  Capturable by enemy ships.
- **Starbases**: built by Constructors in owned hexes; tiers Orbital Station → Starbase → Citadel.
  Defense, shipyard and repair in empty space, extra sensor range, supply.

## 7. Combat

Combat is **en masse and simultaneous**, and it runs **without human input**. At the end of a faction's
turn, every hex where its forces share a hex with an enemy fights a **battle** of several **combat rounds**
(separate from campaign rounds, the factions' turns). The host sets how many: **3 to 10, default 5**. More
rounds make battles bloodier, because fleets that fight to the end keep fighting. Players steer battles
through each fleet's **battle orders** (§7.2).

### 7.1 Resolution
Every ship, starbase and planetary defense in the hex fights for its faction. With three or more mutually
hostile parties, every party fires at every hostile party. Each combat round:
1. **Range.** Battles open at long range. From the second round, the side that wins the maneuver (faster
   ships, veteran crews, and a die roll) moves the range one band toward what its orders want: **long**,
   **medium** or **close quarters**. Beams do 55% / 90% / 125% of their damage at long / medium / close;
   missiles 110% / 95% / 65%; fighters 110% / 100% / 85%. Planets and starbases ignore range.
2. **Events** (§7.3): about 5% of rounds bring a minor event, and about 0.3% a major one.
3. **Fire.** Every unit fires a number of shots (1 for small ships, up to 5 for a dreadnaught, 4 for
   planets and starbases, 2 more for carriers' fighters). Each shot:
   - picks a target: 60% of a side's shots go to its current focus target, the rest at random, with bigger
     ships ×size and escorts ×2.5 more likely to be picked;
   - may **miss** against evasive targets (class evasion, ×1.2 at long range and ×0.8 at close);
   - does **50–150%** of its expected damage;
   - lands a **critical hit** 5% of the time (+1% per experience level): 40% double damage, 20% weapons
     knocked out (half fire for the rest of the battle), 15% shields collapse (no shields, +25% damage
     taken), 15% engines crippled (can't withdraw with its fleet: it is left behind), 10% bridge hit (its
     group fires 20% less).
   Fire is reduced by enemy shields (beams) and point defense (missiles and fighters), and changed by
   faction abilities, terrain, experience (+5% per level), damage (below), and each side's **fortunes of
   war**: a factor for the whole battle (random, from about ×0.3 to ×3.3) and a smaller one each round.
4. **Damage lands at once.** Shields soak damage first (2 points per shield point, halved in nebulae, none
   in ion storms), then hull. Ships under **half hull are damaged** (fire at 75%), under **a quarter
   crippled** (fire at 40%, and their fleet moves 1 hex slower on the map until repaired). At 0 they are
   destroyed. Boarding factions capture 35% of the ships they destroy at close quarters, 20% at medium.
5. **Withdrawals** (§7.2): fleets that spent the round pulling out leave the hex; fleets that reached the
   limit in their orders start pulling out.

The battle ends when one side is gone or has withdrawn, or after the last combat round. If both sides
remain, they fight again at the end of the next faction's turn.

**Lethality** is set per battle so that, at nominal fire, the armed forces lose 22% of their durability per
round, whatever the designs. Numbers, tactics, doctrine and luck decide battles, not the raw size of
weapon numbers. Calibration (tested in `test/combat.test.ts`, at the default 5 rounds):
- two equal fleets on Engage each lose about 35–40% of their ships; on Full Attack about 70%;
- the **underdog comes out ahead** about **25–30%** of the time at 1.5 : 1, **10–15%** at 2 : 1, and
  almost never (1–2%) at 3 : 1.

A side **comes out ahead** when its enemies lost more build value (ships destroyed or captured, hull
damage, starbase and planetary defense) than it did. That is a battle win for the Glorious Campaign.

Damaged ships repair in friendly territory (10%/turn), at a shipyard or starbase (30%/turn), or by faction
abilities.

### 7.2 Battle orders (doctrines)
Each fleet has standing orders, chosen from a list. They set when it withdraws, how much it trades defense
for offense, which range it fights at and what it shoots.

| Orders | Fire | Damage taken | Withdraws | Range |
|--------|------|--------------|-----------|-------|
| **Full Attack** | ×1.25 | ×1.25 | never | close |
| **Engage** (default for warships) | ×1 | ×1 | at 50% losses | best for its weapons |
| **Cautious** | ×0.8 | ×0.75 | at 25% losses, or after round 1 if the enemy is 1.5× stronger | long |
| **Hold the Line** | ×0.9 | ×0.85 | never while guarding one of its systems or starbases; elsewhere at 50% | medium |
| **Hit and Run** | ×1.1 | ×1 | after 2 rounds, or at 20% losses | long; targets transports, cargo and support ships first |
| **Retreat** (default for unarmed ships) | ×0.4 | ×0.9 | at once | long |

- Hold the Line also makes its escorts draw twice the fire. Hold the Line and Retreat don't start fights
  with independent worlds; the others do.
- **Withdrawing** takes a combat round: the fleet fires at 30% while pulling out, and takes pursuit fire ×0.5
  if its slowest ship is faster than the fastest pursuer, ×0.8 at equal speed, ×1.1 if slower (×0.6 when
  only planets and starbases are shooting). Then it moves to the best free neighboring hex (friendly space
  toward home first). A fleet with no free hex is cornered and fights on.
- The **Ryn'kai never withdraw**: they can't take Retreat orders, and their fleets ignore withdrawal limits,
  but Full Attack and Cautious still differ in fire, damage taken and range.
- **Voidborn** (Elusive) fleets that lose 30% sometimes vanish at once, with no pursuit.
- Fleets can also simply move out of a hex with enemies on their own turn.

### 7.3 Battle events
Rare, and mostly small; a very few swing a whole battle.
- **Minor** (about 1 round in 20): sensor ghosts (−15% fire this round), inspired gunnery (+15%), drifting
  wreckage (everyone −10%), jammed communications (no fleet of that side can start withdrawing), damage
  control (a damaged ship repairs 15%), fighters launch late (carriers' fighters miss the round).
- **Major** (about 1 round in 300, marked ★ in the report): a reactor breach destroys a side's largest ship
  and damages the others; a brilliant commander (+40% fire for the rest of the battle); the fleet commander
  killed (−30% fire, and that side's fleets fall back unless on Full Attack); a crippled ship rams the
  enemy's largest ship (both lost); the star flares (every ship takes 20% damage; only at star systems);
  crippled enemy ships surrender (captured).

### 7.4 Battle forecast
Selecting a hex where your forces meet enemies, or tapping an enemy hex once with a fleet selected, shows a
forecast: **Overwhelming victory, Likely victory, Even fight, Likely loss or Hopeless cause**. It compares
firepower × durability (as a force ratio: twice the ships reads 2.0) using only what you know:
- your own and your allies' forces exactly;
- only enemy fleets you can see (cloaked or nebula-hidden fleets are left out);
- without a **scout** (your ship in the hex, or a scout, science or exploration ship within 2 hexes), only
  their ship classes: typical designs at full hull with green crews;
- without a **spy** at their capital (spy intelligence level 1 or better, §10.3), their technology is
  assumed equal to yours;
- their orders only with both; otherwise assumed Engage.
With good intelligence the labels match outcomes (in simulation: overwhelming 97% won, likely 71%, even
43%, likely loss 20%, hopeless 1%). The computer powers use the same forecast, from their own point of
view, to pick battle orders.

### 7.5 Ground and planetary combat
- Systems have planetary defense (shields and guns) that join space battles in their hex.
- Once a system's defense is 0, troop ships may land armies. Ground combat is the same simultaneous model,
  using army strength vs. garrison strength, with a +50% defender bonus.
- Conquered systems keep 50% of their improvements (Lattice: 100%) and have unrest for 5 turns.

### 7.6 Blockades
- A settled system is **blockaded** while armed warships of a faction at war with its owner sit in its hex,
  and the owner has no armed ships or starbase there to contest them.
- A blockaded system produces **half** its usual output, and its build queue can't finish **ships or
  armies** (or rush them). Improvements and development continue.
- The blockade lifts as soon as the blockaders leave or are destroyed, or the owner brings armed ships or a
  starbase into the hex (that becomes a battle instead).
- Blockading is the natural first step of a siege: fleets blockade and grind down planetary defense, then
  armies invade (§7.5).
- The Haldane Free Traders' systems (Smugglers) can't be blockaded.

## 8. Research

There are 6 fields with ~8 techs each (≈48 techs), plus unique techs per major. Science points fill the current
project; overflow carries over.

| Field | Examples |
|-------|----------|
| Propulsion | Ion Drives (+1 move small ships), Warp Lanes, Hyperspace Jump, Wormhole Stabilization |
| Weapons | Lasers → Plasma → Disruptors; Missiles → Torpedoes → Antimatter Warheads; Fighter Bays |
| Defense | Deflectors → Phase Shields → Aegis Barrier; Point Defense; Planetary Shields |
| Construction | Hull II–V (unlocks classes), Starbases I–III, Orbital Shipyards, Asteroid Mining |
| Biology/Society | Hydroponics, Genetic Adaptation, Terraforming, Xenodiplomacy, Propaganda |
| Computing | Sensors I–III, Cloaking (needs exotics), Battle AI, Espionage Networks, Counter-Intel |

Techs can be traded, stolen by spies, and shared through research agreements (§9.3).

## 9. Diplomacy

### 9.1 Contact and diplomats
- Two factions have **contact** when their ships or territories have seen each other.
- To open **relations**, send a **Diplomat** to the target's home system. While traveling, a diplomat can be
  **captured** by any ship of a faction at war with (or hostile to) the sender that ends its turn in the
  diplomat's hex. Captured diplomats can be returned, ransomed, or executed (large opinion penalty).
- When the diplomat arrives, an **embassy** is founded. Embassies enable all proposals below, and the diplomat
  stays resident (it can be expelled, which downgrades relations).

### 9.2 Relation states
`War` ↔ `Hostile` ↔ `Neutral` (contact only) ↔ `Relations` (embassy) ↔ `Non-Aggression Pact` ↔ `Alliance`;
plus `Vassal`/`Overlord` for minors.

**Pacts and alliances are earned, not bought** (`statusObjection` in `src/engine/diplomacy.ts`). A computer power
refuses these outright, whatever else the proposal offers, until its conditions are met, and the proposal
screen says which one is missing:
- **Non-aggression pact:** their opinion of you is at least +10.
- **Alliance:**
  - a pact that has held for 10 turns;
  - their opinion of you is at least +40;
  - a common enemy you are both at war with (diplomatic powers will accept +60 opinion instead);
  - the Ryn'kai want you at least 60% as strong as they are, and the Lattice at least 40%.
- **Completing a Grand Alliance:** a power will not become the last ally you need unless its opinion of you is
  +80.

**Alliances come with obligations.** An ally who stays out of a war you have fought for more than 3 turns
(against a power they know and aren't allied with) costs 5 opinion a turn. A computer ally whose opinion
falls below 0 ends the alliance. Ambitious or treacherous computer powers also walk out of an alliance with
anyone 3 turns into a Grand Alliance streak. The Ryn'kai never break an alliance first.

### 9.3 Agreements (need an embassy)

| Agreement | Effect |
|-----------|--------|
| Trade Agreement | Each side gets energy equal to 10% of the other's energy income, and they can open trade routes to each other (§5.6) |
| Research Agreement | Each side gets 10% of the other's science |
| Economic Agreement | Each side gets +10% metals; resources can be gifted at 1:1 |
| Manufacturing Agreement | Ships cost 10% less, and each side can order ships built at the other's shipyard (§9.9) |
| Technology Exchange | One-time swap of specific techs |
| Open Borders | Ships may pass through each other's territory without incident |
| Non-Aggression Pact | No war without a 3-turn notice; breaking it = −opinion with everyone |
| Alliance | Shared vision, joint wars, combined battles |

### 9.4 Trades
Proposals can include any mix of resources (lump sum or per turn for N turns), techs, ships/battle groups,
armies (garrisoned ones; they move to the new owner's home), star systems/hexes (the giver's garrison goes
home, and a starbase there changes hands), map knowledge, and returning captured diplomats. A **resource
swap** is a proposal with just one resource on each side.

**Technology in trades.** You always know your own techs. You see which techs another power knows only with
an embassy at its capital or a spy there (intelligence level 1+); then the proposal builder lists exactly
what it has that you lack (and, when offering, what you have that it lacks). Either way you can trade **"a
technology of the giver's choice"**: on acceptance the giver hands over its cheapest tech (lowest tier) that
the other side lacks. Asking for one never reveals whether they have any; if they have nothing to give, the
deal can't go through when they accept.

All of this lives in the **Diplomacy** screen: an overview (proposals waiting for you, your recent ones,
prisoners, every power you have met), then one page per power with relations, your embassy (send a
diplomat from there, or train one if none is free), actions, proposals and the conversation.

Agreements only ever add income: each side gets a share of the *other* side's output **on top of** its own,
and nothing is taken from the partner, so both always come out ahead. AI factions judge proposals
by value, opinion and personality.

### 9.5 Vassals
- A minor becomes a major's **vassal** by agreement, and gifts alone never buy it. The minor needs three things:
  - The major is at least **3× as strong**.
  - The minor likes it: opinion of at least +40, plus 10 for each vassal the major already holds. This is
    waived if the two are at war.
  - It has **a reason**: the major has 3 or more ships within 3 hexes of its home, or the minor is at war with
    someone stronger than itself.
- It can also happen by occupying the minor's home system.
- Vassals pay 20% of their income as tribute, join their overlord's wars, give vision, and can't be attacked by
  the overlord's allies. Overlords must defend them, or the vassal may break free.
- A vassal whose overlord loses its home system becomes independent.

### 9.6 Opinion
Each faction holds an opinion (−100..+100) of every other, driven by shared enemies, treaties, gifts, border
tension, broken treaties, espionage caught, ideology (similar governments like each other), and faction
personality.

### 9.7 Messages between players
- Human players can **message** each other (in the Diplomacy screen): privately with any human they have met in the game, in group
  conversations, or on an **All players** channel.
- Messages are talk only. Binding deals go through proposals (§9.4), which the engine enforces.
- **Online**, chat lives on the relay, not in the game state. You can write at any time (not only on your
  turn), recipients who are connected get it immediately, and the relay only hands a message to its
  sender and recipients. **Hot seat** chat is saved with the game, and each player only sees their own
  conversations.
- Computer powers have their own conversations; see §9.8.

### 9.8 Talking with computer powers
Computer-run great powers can't read free text, but they talk, and they understand diplomatic statements.

**They speak to you** in their own voice when something happens between you: first contact, an embassy
opening, declaring war (or being attacked), peace, signing a pact or alliance, being betrayed, sending you
a proposal, accepting or refusing yours, receiving a gift, your warships trespassing in their space (at
most every 5 turns), and winning or losing a battle against you. They speak in the words of whoever leads
them this game (`src/ai/leader-voices.ts`): each of the fifteen leaders has their own voice, from Sean
Sutton's jokes and Lindqvist's bluntness to Vel'dhara quoting the Ledger, Kesh's files, Malenkai's
figures and HALCYON's single warnings. Any occasion a leader has no line for falls back to the faction's
voice (`src/ai/voice.ts`). Minor factions don't talk.

**You can make statements** to them, on your turn. Each power answers, and acts on its answer, at the
start of its next turn. Each kind of statement can be made to a power once every 3 turns.

| Statement | How they decide |
|-----------|-----------------|
| Demand they withdraw | Complies (fleets leave your territory and stay out for 8 turns) if it likes you, or you are about as strong and it isn't very aggressive; otherwise refuses and likes you a little less. Not at war. |
| Ask for help against X | Already at war with X: welcomes you. Otherwise joins your war if its opinion of you, its dislike of X, its aggression, an alliance with you and your combined strength add up, unless a treaty with X stops it. |
| Threaten | Always costs opinion. A clearly weaker, not-too-aggressive power backs down (no war on you for 10 turns, fleets withdraw). An aggressive power that thinks itself stronger declares war. The Ryn'kai never back down. |
| Reassure | Raises its opinion of you, unless it already distrusts you (very low opinion, a grudge, or at war). |
| Ask their intentions | At war: says so. Otherwise names who it has its eye on. If that is you, honest powers warn you; treacherous ones (Krasnyr, Varrhen) lie. |
| Denounce X | Agrees if it dislikes X (likes you more, X less), objects if it likes X, otherwise shrugs. |

Conversations live in the game state, so every player's game agrees on them. *(Later, an optional
language-model mode could let you chat with computer leaders in free text, with any real effect still
going through these rules.)*

### 9.9 Mercenaries and shipyard contracts
Opened from **Diplomacy → Market**. Buyers need contact with the seller and must not be at war with it.
- **Thessic Banking Houses** (Mercenary Contracts) offer two of their warships every round, for energy.
  The ship waits at the Thessic home system for its new owner.
- **Grendis Iron Legion** (For Hire) offer two veteran armies (strength 15, elite) every round. A hired army
  reports to your home system and goes home after 10 turns. It can't be traded on.
- **Zenith Observatory** (Star Charts) sell a copy of everything they have explored, at most once every 10
  turns per buyer.
- **Shipyard contracts**: the **Forgeborn Anvil** (Master Shipwrights) build any of your own designs to
  order, 20% cheaper, for anyone at peace with them. Partners in a **Manufacturing Agreement** do the same
  for each other, 10% cheaper. The builder keeps a 15% fee. The ship is built alongside the builder's own
  queue at half its home yard's production, and is delivered there. If the two go to war, the builder
  keeps the ship.

## 10. Victory

Each great power can only win in ways that fit its ideology, and each has exactly one victory of its own
(★). Progress on every path is shown on the **Victory** tab of the briefing.

### 10.1 Victories

| Victory | Condition |
|---------|-----------|
| **Conquest** | Hold the home system of every other great power. |
| **Hegemony** ★ Varrhen | Hold the home systems of 2 other great powers and rule 4 minor factions as vassals. |
| **Glorious Campaign** ★ Ryn'kai | Win battles (a battle where you lose fewer ships than your enemies), including at least one against every other great power. 45 wins on a standard map, scaled by map area (24 small, 77 huge). *(tunable)* |
| **Economic Supremacy** | Produce 35% of the galaxy's income (energy + metals + exotics) for 10 turns in a row. |
| **Ascendance** ★ Concord | Complete every tech in 4 fields and build the Ascension Gate. |
| **Singularity** ★ Lattice | Complete every tech in 5 fields and run Research Labs on 3 Core Worlds for 10 turns in a row. |
| **World Revolution** ★ Krasnyr | Have 6 systems defect to you through subversion, and rule 3 minor factions as vassals. |
| **Grand Alliance** | Every surviving great power is allied with you for 10 turns, and you hold the most systems among them. |
| **Galactic Council** | Win two council elections in a row with two-thirds of the vote. |
| **Score** | Highest score when the turn limit (default **200 rounds**) is reached. |

Games are expected to be decided around **rounds 95–110**. The 200-round limit is a maximum length, and Score
decides only games that reach it.

**Galactic Council**: every 20 turns, every living faction (minors included) casts its population as votes
for the eligible great power it likes most, counting itself at +50 if it is a candidate. Vassals vote with
their overlord. A candidate can only receive votes from factions it has an embassy with (plus itself and
its vassals).

### 10.2 Who can win how (Classic)

| Victory | Concord | Ryn'kai | Varrhen | Krasnyr | Lattice |
|---------|:-:|:-:|:-:|:-:|:-:|
| Conquest | — | ✓ | ✓ | ✓ | ✓ |
| Unique (★) | Ascendance | Glorious Campaign | Hegemony | World Revolution | Singularity |
| Economic Supremacy | ✓ | — | ✓ | ✓ | ✓ |
| Grand Alliance | ✓ | — | ✓ | ✓ | ✓ |
| Galactic Council | ✓ | — | ✓ | ✓ | ✓ |
| Score | ✓ | ✓ | ✓ | ✓ | ✓ |

The Ryn'kai are deliberately narrow and predictable (Conquest, Glorious Campaign, Score), which makes them
a good empire for new players.

**Game presets** (chosen by the host):
- **Classic**: all five great powers, as in the table.
- **Peaceful**: four great powers (no Ryn'kai), and no military victories (Conquest, Hegemony, Glorious
  Campaign).
- **Total War**: military victories only (Conquest, Hegemony, Glorious Campaign), and the Concord may win by
  Conquest too. Score still decides a game that reaches the turn limit. Total War **starts advanced**
  (`src/engine/advanced-start.ts`):
  - the whole galaxy is claimed except black holes and a **one-hex neutral zone** wherever two powers meet;
    great powers together hold about **60%** of the claimed space and minor powers about **40%**;
  - every system inside a power's borders is its colony, **a third developed** (level 2 of 5) with
    population and one improvement; home systems keep their usual development;
  - every faction knows **a third of the tech tree** (16 of 49), chosen the way its own research leans
    (the Ryn'kai lean to weapons, the Concord to society, and so on);
  - great powers start with **30 ships** (best designs their techs allow, in battle groups at home and on the
    borders), **5 diplomats, 5 spies** and 4 armies; minor powers with **10 ships** and an army;
  - powers whose borders face each other already have contact, and everyone has mapped its own space plus
    3 hexes beyond its borders.

### 10.3 Knowing how close your rivals are
You always see your own progress. A rival's progress is secret unless your spies are at its home system:
- Each spy there gives 1 point of intelligence, +0.5 each for Ministry of State Security (Krasnyr),
  Infiltrators (Nhar) and the Espionage Networks tech.
- The rival subtracts its own idle spies guarding its home (valued the same way), +1 for
  Counter-Intelligence tech and +1 for Court Intrigue. The Myrr's Mind Shield blocks all of it.
- **1 point**: which victories it can pursue. **2**: its progress on each, as a 20% range. **3+**: its exact
  progress.

Computer powers keep a spy watching their strongest rival's capital and a guard at home, and are far more
willing to go to war with a rival they know is near victory.

### 10.4 Other endings
The game also ends:
- with **no winner** if every great power has been eliminated;
- won by the **leading computer power** (highest score) if every human player has been eliminated;
- won by the **last great power standing**.

A human who is eliminated can keep watching. A human who leaves is replaced by the computer.

**The ending screen.** When a game ends, every human sees a full-screen **Victory** or **Defeat** splash once:
Victory if their power won, Defeat otherwise (including when their power has fallen, or the game ended with no
winner). It names the winner and how they won, or says the player's empire has fallen, and gives the turn the
game ended on. "See the galaxy" returns to the final map and "Leave to title" quits. On a shared hot-seat screen
a win by any human power is a Victory. The artwork is `art/endings/`, packed into the game by
`scripts/endings.py`.

## 10.5 How computer powers play (summary)
- **Campaigns**: at war, a computer power concentrates on one target system at a time (rescuing an ally's
  system under attack comes first). Fleets gather at the nearest friendly hex, strike together once they
  outmatch the defenses by 30%, and stay to siege. Transports collect enough armies for the garrison (with
  the defender bonus) before landing.
- **Balance of power**: it won't join a war against an empire already fighting two great powers, unless that
  empire is near victory (known through spies) or running away with the game (score 40% above the average).
- **Borders**: constructors with nothing to settle build starbases on the border facing the nearest rival
  (one per six systems).
- **Spies**: one watches the strongest rival's capital, one guards home (with three or more), and the rest
  work the most valuable targets: enemy shipyards in wartime, techs they lack, unrest for the Krasnyr.

## 11. Information and fog of war
- Each faction sees what its ships, starbases, territory and allies' vision reveal. Explored but unseen
  hexes show their last known state.
- The client hides what you shouldn't see. Because the full state passes through every player's client in async
  play, a determined player could inspect it; Empire is meant for friends. Real hidden-information enforcement
  would need server-side resolution *(not in scope)*.

## 12. Presentation
- Single-page browser game (canvas map + HTML panels), built into one self-contained HTML file, like Hexfront.
- **Tokens**: each ship is drawn procedurally from its faction's *hull style* (Concord: sleek white-blue
  arrowheads; Ryn'kai: blade-like crescents; Varrhen: heavy angular wedges; Krasnyr: blocky hammer forms;
  Lattice: geometric polyhedra; minors each have their own style family). Class sets size and detail; role adds
  a badge. Battle groups show a stacked token with a count.
- Faction colors outline territory and tint tokens.
- Pan and zoom map; minimap; turn summary report ("While you were away…"); combat report; diplomacy inbox.

## 13. Online play
See `docs/RELAY.md`. In short: an AWS API Gateway WebSocket relay (like Hexfront's), backed by Lambda and
DynamoDB, stores each game's current state, roster and turn order, and notifies the next player: pushed to
anyone connected, and optionally by email (each player can opt in per game; see `docs/RELAY.md`).
Games are joined with a six-letter code.
