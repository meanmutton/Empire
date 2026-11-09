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
- Roster: every class; ships are heavily armed with thin shields; no Science Vessel role.
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
| 3 | Thessic Banking Houses | Mercantile plutocracy | Energy | **Trade Hub** (trade agreements +50% for both sides); **Mercenary Contracts** (sell ships to majors) |
| 4 | Ghal'tar Pirate Clans | Raider clans | Raiding | **Raiders** (fleets in an enemy system steal 10% of its energy and metals each turn); **Ambush** (+30% attack in nebulae and asteroids) |
| 5 | Ixxi Swarm | Insectoid hive mind | Numbers | **Swarm Tactics** (Fighters and Corvettes −30% cost); **Rapid Breeding** (+50% population growth) |
| 6 | Celestine Order | Monastic knightly theocracy | Armies | **Zealots** (armies +50% strength); **Aegis of Faith** (shields +20%) |
| 7 | Voidborn Drifters | Deep-space nomads | Mobility | **Void-Adapted** (no hazard penalties); **Elusive** (50% chance to retreat from a losing battle) |
| 8 | Aurelian Republic | Declining elder democracy | Technology | **Ancient Archives** (start with 3 extra techs, willing to trade them); **Prestige** (+20 opinion with all) |
| 9 | Korrigan Miners' Guild | Syndicalist miners | Metals | **Deep-Core Mining** (asteroid fields yield double metals) |
| 10 | Sylph Gardeners | Ecological plant-collective | Growth | **Terraformers** (system development −40% cost); **Regrowth** (ships repair +10% per turn) |
| 11 | Nhar Shadow Court | Secretive oligarchy of spymasters | Stealth | **Cloaking Fields** (ships invisible unless an enemy has sensors ≥ their stealth); **Infiltrators** (+40% spy success) |
| 12 | Brakk Warbands | Feudal warlords | Brute force | **Berserkers** (+30% attack, −30% shields); **Boarding Parties** (capture crippled ships) |
| 13 | Ophidian Syndicate | Criminal cartel | Commerce | **Black Market** (trade resources at 1:1 instead of 2:1); **Bribery** (enemies fighting in their territory deal −30% damage) |
| 14 | Lumen Collective | Beings of pure energy | Energy | **Photonic Weapons** (energy weapons +25%); **Stellar Feeding** (double energy from stars) |
| 15 | Cryx Remnant | Cybernetic husk of a fallen empire | Attrition | **Assimilation** (20% of enemy ships destroyed in their battles join the Cryx at 25% hull) |
| 16 | Taurine Herd Assembly | Pastoral defensive democracy | Defense | **Fortress Worlds** (planetary defenses +100%); **Stampede** (+20% attack in own territory) |
| 17 | Echo Engineers | Isolationist genius-caste | Engines | **Advanced Engines** (+1 movement); **Prototype Lab** (trade techs 30% cheaper) |
| 18 | Vesh Prophets | Missionary faith | Influence | **Conversion** (+5 unrest per turn, up to 60, in foreign systems within 3 hexes) |
| 19 | Haldane Free Traders | Libertarian convoy culture | Trade | **Smugglers** (cargo ships draw 90% less fire and can't be boarded); **Free Port** (anyone may trade with them without a diplomat) |
| 20 | Grendis Iron Legion | Mercenary army-state | Armies | **For Hire** (rent armies to majors); **Veterans** (armies start at elite rank) |
| 21 | Pelagic Union | Aquatic federation | Population | **Ocean Worlds** (+50% population on habitable worlds); **Deep Shelters** (systems can't be bombarded below 1 population) |
| 22 | Zenith Observatory | Scholar-astronomers | Sensors | **Long-Range Sensors** (sensor range +3); **Star Charts** (sell map knowledge to others) |
| 23 | Morrow Bloom | Biological horror fleet | Bio-weapons | **Spore Payload** (attacks reduce a system's population); **Living Hulls** (ships regenerate 20% hull per turn) |
| 24 | Kethran Lattice-Minds | Silicon crystalline consensus | Durability | **Crystalline Hulls** (hull +40%); **Slow Thought** (−1 movement) |
| 25 | Skarn Hunters | Apex predator packs | Aggression | **Hunter's Instinct** (+30% damage against already-damaged ships); **Tracking** (cloaked ships within 2 hexes revealed) |
| 26 | Ilyrian Courts | Dynastic monarchy | Diplomacy | **Royal Marriage** (vassalage offers +50% likely accepted); **Court Intrigue** (+20% spy defense) |
| 27 | Forgeborn Anvil | Industrial guild-state | Shipbuilding | **Master Shipwrights** (ships −20% cost; can build ships for allies) |
| 28 | Tal Wanderers | Wormhole-faring archivists | Exploration | **Wormhole Navigation** (move through wormholes at no cost, reveal wormhole pairs) |
| 29 | Hollow Sun Cult | Star-worshippers | Exotics | **Stellar Harnessing** (neutron stars and pulsars yield double exotics); **Solar Flare** (once per battle, 10% damage to all enemies) |
| 30 | Unbound Mechanists | Machines freed from the Lattice | Resilience | **Self-Repair** (ships repair 15% per turn); **Grudge** (+25% attack against the Lattice) |

## 4. The map

### 4.1 Layout
- Hex grid, **50 columns × 30 rows** (1,500 hexes) by default, pointy-top hexes in an odd-row offset layout,
  axial coordinates in the engine. The size is configurable (small 36×22, standard 50×30, huge 64×40).
- Generated fresh each game from a seed.

### 4.2 Hex types

| Type | Passable | Notes |
|------|----------|-------|
| Empty space | yes | Cheap to claim, no resources by itself (each owned hex gives +0.1 energy). |
| Major home system | yes | Starts at development level 4; produces all resources; strong planetary defense. |
| Minor home system | yes | Starts at development level 3. |
| Developed system | yes | Pre-existing independent colony (level 1–2) with a neutral garrison; can be annexed or conquered. |
| Habitable system | yes | Terran, Ocean, Desert, Arctic, Jungle, or Barren worlds; can be colonized. |
| Gas giant | yes | Energy and exotics; outposts only. |
| Asteroid field | yes | Rich metals; −1 movement to exit; +20% evasion for Fighters/Corvettes. |
| Nebula | yes | Hides fleets from sensors outside the hex; shields −50% inside; science from survey. |
| Neutron star | yes | High exotics and energy; ships ending a turn here take 5% hull damage. |
| Pulsar | yes | Exotics; disrupts sensors 1 hex around. |
| Black hole | no | Impassable; adjacent hexes get +science for science vessels. |
| Ion storm | yes | Movement costs 2; no shields; drifts 1 hex every few turns *(later phase)*. |
| Ancient ruins | yes | One-time survey reward (tech, resources, or a derelict ship); then a normal system. |
| Wormhole | yes | Paired; moving into one ends movement at its twin. |

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
Every system has a **planet type**, a **size** (1–5 improvement slots), base yields, and a **development
level** of 0–5:

| Level | Name | Unlocks |
|-------|------|---------|
| 0 | Unclaimed / Survey | — |
| 1 | Outpost | 2 improvement slots, claims the hex |
| 2 | Colony | population can grow; spies and diplomats; 3 slots |
| 3 | Settlement | shipyard (up to Destroyer); 4 slots |
| 4 | Industrial World | heavy shipyard (all classes); 5 slots |
| 5 | Core World | highest yields (×2.5 base) |

Slots are development level + 1, capped by the system's size (1–5). Gas giants and similar uninhabitable
worlds can be developed only to level 2.

Builds are paid for up front when queued; each system then puts production points into its own queue
every turn (more for higher development and population). Unfinished builds can be rushed with energy
(3 energy per remaining point) or cancelled for a 50% refund.

**Improvements** (each takes one slot): Mine (+Metals), Power Plant (+Energy), Research Lab (+Science),
Habitat (+population capacity), Refinery (+Exotics, needs an exotic source), Shipyard / Heavy Shipyard,
Planetary Shield (+defense), Ground Garrison (+army defense), Trade Port (+energy per trade agreement),
Academy (new units start veteran).

### 5.3 Claiming hexes
- A hex becomes yours at the **start of your next turn** if, at the end of your turn, your ship or battle
  group was in it with no enemy forces there. This gives enemies one round to contest or recapture it.
- Claiming an **enemy-owned** hex requires being at war with its owner. Claiming a hex that contains a
  developed system with defenses also requires reducing its planetary defense to 0 (bombardment) or invading
  it with armies.
- An owned hex not connected to your home by a chain of owned hexes is **disconnected**: −50% yields
  *(tunable)*.

### 5.4 Income each turn
`yield = base(system type) × development multiplier × improvement bonuses × faction modifiers × treaties`,
plus 0.1 energy per owned empty hex. Upkeep: each ship costs energy per turn by class; starbases and agents cost
energy too. Population grows 5% per turn toward capacity (faction-modified).

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
| Science Vessel | Survey, +science while orbiting anomalies, reveals cloaked ships |
| Cargo Vessel | Carries armies, colonists, resources; trade routes |
| Colony Ship | Founds an Outpost/Colony on a system (consumed) |
| Constructor | Builds starbases and outposts; upgrades systems remotely |
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
  Steal Tech, Sabotage (destroy an improvement or delay a build), Incite Unrest, Subversion (Krasnyr only),
  Counter-intelligence, Assassinate Diplomat, Reveal Fleets.
- **Diplomats**: travel physically to a faction's home system to open relations (§9). Can ride in ships.
  Capturable by enemy ships.
- **Starbases**: built by Constructors in owned hexes; tiers Outpost Station → Starbase → Citadel.
  Defense, shipyard and repair in empty space, extra sensor range, supply.

## 7. Combat

Combat is **en masse and simultaneous**. There is **one combat round per player turn**: at the end of a
faction's turn, every hex where its forces share a hex with an enemy fights one round.

### 7.1 Resolution
1. Every participant in a hex (all ships, fighters, starbases and planetary defenses) is split into the two
   sides: the active faction and its allies vs. their enemies. With three or more mutually hostile parties,
   every party attacks every hostile party in proportion to their strength.
2. Each side computes its **attack pool**: energy and missile strength, plus fighters, modified by faction,
   experience, terrain, tech and ability bonuses, then multiplied by a random factor in [0.8, 1.2].
3. Missiles pass through the enemy's point defense first.
4. Damage is spread over enemy ships, weighted toward larger targets, with Escorts soaking up a share for
   their group. Each ship's shields absorb energy damage once per round; the remainder hits the hull.
5. **All damage is applied simultaneously.** Ships at 0 hull are destroyed.
6. **Lethality** (Lanchester style): a party's *strength* is its effective attack (after enemy shields and
   point defense) × its durability (hull + 2 × shields). The fraction of a party destroyed in a round is
   `0.5 × (enemy strength ÷ own strength)^0.75`, capped at 100%, ×[0.8, 1.2]. So two equal forces each lose
   about **half** per round, and a force twice as strong loses ~30% while destroying ~85%. The test suite
   checks 40–60% for equal forces of every class.
   Damage is focus-fired: targets are picked one at a time (bigger ships ×size, escorts ×2.5) and destroyed,
   so losses show up as destroyed ships, not light damage spread across everyone.
7. Damaged ships remain damaged and repair in friendly territory (10%/turn), at a shipyard or starbase (30%/turn),
   or by faction abilities.

### 7.2 Retreat and pursuit
- A battle group may be ordered to retreat at the start of its owner's turn (moves out of the hex; each enemy
  gets a free half-strength volley first unless the retreater is faster).
- Ryn'kai never retreat; Voidborn sometimes retreat automatically.

### 7.3 Ground and planetary combat
- Systems have planetary defense (shields and guns) that join space battles in their hex.
- Once a system's defense is 0, troop ships may land armies. Ground combat is the same simultaneous model,
  using army strength vs. garrison strength, with a +50% defender bonus.
- Conquered systems keep 50% of their improvements (Lattice: 100%) and have unrest for 5 turns.

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

### 9.3 Agreements (need an embassy)

| Agreement | Effect |
|-----------|--------|
| Trade Agreement | Each side gets energy equal to 10% of the other's energy income |
| Research Agreement | Each side gets 10% of the other's science |
| Economic Agreement | Each side gets +10% metals; resources can be gifted at 1:1 |
| Manufacturing Agreement | Can build ships at the partner's shipyards; −10% ship cost |
| Technology Exchange | One-time swap of specific techs |
| Open Borders | Ships may pass through each other's territory without incident |
| Non-Aggression Pact | No war without a 3-turn notice; breaking it = −opinion with everyone |
| Alliance | Shared vision, joint wars, combined battles |

### 9.4 Trades
Proposals can include any mix of resources (lump sum or per turn for N turns), techs, ships/battle groups,
armies, star systems/hexes, map knowledge, and returning captured diplomats. AI factions judge proposals
by value, opinion and personality.

### 9.5 Vassals
- A minor can become a major's **vassal** by agreement (enough opinion plus influence through gifts or
  pressure), by military pressure (major fleet strength ≥ 3× the minor's nearby), or by occupying its home system.
- Vassals pay 20% of their income as tribute, join their overlord's wars, give vision, and can't be attacked by
  the overlord's allies. Overlords must defend them, or the vassal may break free.
- A vassal whose overlord loses its home system becomes independent.

### 9.6 Opinion
Each faction holds an opinion (−100..+100) of every other, driven by shared enemies, treaties, gifts, border
tension, broken treaties, espionage caught, ideology (similar governments like each other), and faction
personality.

## 10. Victory

Each game enables any of these (default: all):
- **Conquest**: control every other major's home system (or have them as vassals or allies who concede).
- **Domination**: at the end of any round, own ≥ 40% of all star systems *(tunable)*.
- **Technological Ascendance**: research all techs in 4 fields and build the *Ascension Gate* wonder (huge exotics cost).
- **Grand Alliance**: every surviving major is in one alliance led by you for 10 consecutive turns, and you
  have the most systems in it.
- **Turn limit** *(optional, e.g. 250)*: highest score wins (systems, population, tech, fleet, vassals).

A human who is eliminated can keep watching. A human who leaves is replaced by the computer.

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
DynamoDB, stores each game's current state, roster and turn order, and notifies the next player.
Games are joined with a six-letter code.
