/** The 5 major and 30 minor factions. */
import type { AbilityId } from './abilities';
import type { ShipClass, ShipRole } from './ships';

export interface Modifiers {
  attack: number;
  shields: number;
  hull: number;
  army: number;
  science: number;
  energy: number;
  metals: number;
  exotics: number;
  popGrowth: number;
  diplomacy: number;
  espionage: number;
  shipCost: number;
  buildTime: number;
  movement: number;
  sensors: number;
  repair: number;
  defense: number;
  /** Multiplier on the opinion penalty for breaking treaties (1 = normal). */
  treatyBreak: number;
}

export const NO_MODIFIERS: Modifiers = {
  attack: 0, shields: 0, hull: 0, army: 0, science: 0, energy: 0, metals: 0, exotics: 0, popGrowth: 0,
  diplomacy: 0, espionage: 0, shipCost: 0, buildTime: 0, movement: 0, sensors: 0, repair: 0, defense: 0, treatyBreak: 1,
};

/** Visual family for procedural ship tokens. */
export type HullStyle =
  | 'arrow' | 'blade' | 'wedge' | 'bastion' | 'hammer' | 'prism'
  | 'orb' | 'scrap' | 'saucer' | 'spike' | 'insect' | 'cross' | 'sail' | 'ring' | 'crystal' | 'brick' | 'organic';

/** AI personality weights, each 0..1. */
export interface Personality {
  aggression: number;
  diplomacy: number;
  treachery: number;
  expansion: number;
  science: number;
  espionage: number;
}

export interface FactionDef {
  id: string;
  name: string;
  /** Short name for UI ("Concord"). */
  short: string;
  kind: 'major' | 'minor';
  species: string;
  government: string;
  inspiration?: string;
  /** Minor factions: what they're good at. */
  strength?: string;
  text: string;
  color: string;
  style: HullStyle;
  modifiers: Partial<Modifiers>;
  abilities: AbilityId[];
  /** Ship designs, as "class/role/Name". */
  roster: string[];
  personality: Personality;
  /** Names for this faction's star systems (home first). */
  systemNames: string[];
}

const MAJORS: FactionDef[] = [
  {
    id: 'concord', name: 'Terran Concord', short: 'Concord', kind: 'major',
    species: 'Humans', government: 'Cooperative social democracy', inspiration: '21st-century Sweden',
    text: 'Explorers, scientists and negotiators who would rather talk than fight.',
    color: '#3f8efc', style: 'arrow',
    modifiers: { science: 0.2, diplomacy: 0.25, attack: -0.1, army: -0.1 },
    abilities: ['openSociety', 'pathfinders', 'consensus'],
    roster: [
      'fighter/line/Swift', 'runabout/scout/Wayfarer', 'runabout/cargo/Courier',
      'corvette/escort/Linden', 'corvette/explore/Pathfinder', 'frigate/line/Birch', 'frigate/science/Celsius',
      'frigate/colony/Homestead', 'frigate/constructor/Builder', 'destroyer/escort/Aspen', 'destroyer/line/Spruce',
      'lightCruiser/carrier/Haven', 'lightCruiser/explore/Horizon', 'lightCruiser/science/Linnaeus',
      'heavyCruiser/line/Fjord', 'heavyCruiser/transport/Ferry', 'battleCruiser/line/Aurora',
      'battleship/line/Concordia', 'battleship/carrier/Sanctuary',
    ],
    personality: { aggression: 0.2, diplomacy: 0.9, treachery: 0.05, expansion: 0.6, science: 0.9, espionage: 0.3 },
    systemNames: ['Sol', 'Alpha Centauri', 'Barnard', 'Tau Ceti', 'Epsilon Eridani', 'Wolf 359', 'Vega', 'Altair', 'Sirius', 'Procyon', 'Kapteyn', 'Gliese'],
  },
  {
    id: 'rynkai', name: "Ryn'kai Dominion", short: "Ryn'kai", kind: 'major',
    species: 'Mammalian humanoid warriors', government: 'Honor-bound military dictatorship', inspiration: 'Early–mid 20th-century Imperial Japan',
    text: 'A warrior people bound by honor. Strength is the only argument that matters, though alliances serve when needed.',
    color: '#d7263d', style: 'blade',
    modifiers: { attack: 0.2, army: 0.3, science: -0.15, diplomacy: -0.1, shields: -0.1 },
    abilities: ['wayOfTheBlade', 'boardingActions', 'honorBound'],
    roster: [
      'fighter/line/Ryx', 'runabout/scout/Shiv', 'corvette/raider/Fang', 'corvette/line/Kethi',
      'frigate/line/Kaithar', 'frigate/colony/Seedblade', 'frigate/constructor/Forgehand', 'frigate/transport/Spearcarrier', 'frigate/cargo/Tallyman',
      'destroyer/line/Vashra', 'destroyer/raider/Nightclaw', 'lightCruiser/line/Morrak', 'lightCruiser/carrier/Hawkmother',
      'heavyCruiser/line/Zhaldri', 'heavyCruiser/transport/Warhost', 'battleCruiser/line/Ashkai',
      'battleship/line/Tokhar', 'dreadnaught/line/Ryn-Vael',
    ],
    personality: { aggression: 0.9, diplomacy: 0.3, treachery: 0.0, expansion: 0.8, science: 0.3, espionage: 0.2 },
    systemNames: ["Ryn'kai Prime", 'Kethos', 'Vashar', "Mor'ath", 'Zhaldren', 'Ashkara', 'Tokhis', 'Ryndal', 'Kaithos', 'Velkarr', 'Shirrak', 'Ondai'],
  },
  {
    id: 'varrhen', name: 'Varrhen Ascendancy', short: 'Varrhen', kind: 'major',
    species: 'Reptilian humanoids', government: 'Authoritarian ultranationalist state', inspiration: 'Early–mid 20th-century Germany',
    text: 'Cold, cunning reptilian expansionists. They use violence freely, but play diplomat while they are weak.',
    color: '#b5a33a', style: 'wedge',
    modifiers: { metals: 0.2, shipCost: -0.15, diplomacy: -0.05 },
    abilities: ['totalMobilization', 'lightningWar', 'calculatedDiplomacy'],
    roster: [
      'fighter/line/Krait', 'runabout/scout/Adder', 'corvette/line/Asp', 'corvette/escort/Coral',
      'frigate/line/Viper', 'frigate/colony/Nestling', 'frigate/constructor/Burrower', 'frigate/cargo/Sidewinder',
      'destroyer/line/Mamba', 'destroyer/escort/Taipan', 'destroyer/raider/Cobra', 'lightCruiser/line/Python',
      'heavyCruiser/line/Basilisk', 'heavyCruiser/carrier/Broodmother', 'battleCruiser/line/Wyvern',
      'battleship/line/Hydra', 'battleship/transport/Leviathan', 'dreadnaught/line/Wyrm',
    ],
    personality: { aggression: 0.7, diplomacy: 0.6, treachery: 0.6, expansion: 0.9, science: 0.4, espionage: 0.4 },
    systemNames: ['Varrhos', 'Szekh', 'Ssarak', 'Vhaltis', 'Krissith', 'Ossarra', 'Thessk', 'Varrun', 'Isskar', 'Zhessa', 'Kalvhen', 'Mossith'],
  },
  {
    id: 'krasnyr', name: "Krasnyr People's Union", short: 'Krasnyr', kind: 'major',
    species: 'Mammalian humanoids', government: 'One-party collectivist state', inspiration: 'Cold War USSR',
    text: 'A vast collectivist state that would rather win a war in the shadows than on the battlefield.',
    color: '#ff8c1a', style: 'bastion',
    modifiers: { popGrowth: 0.25, metals: 0.1, science: -0.1, espionage: 0.3, treatyBreak: 0.5 },
    abilities: ['stateSecurity', 'fiveYearPlan', 'fifthColumn'],
    roster: [
      'fighter/line/Sparrow', 'runabout/scout/Watcher', 'corvette/line/Partisan', 'corvette/escort/Sentry',
      'corvette/raider/Hornet', 'frigate/line/Vanguard', 'frigate/colony/Pioneer', 'frigate/constructor/Brigade',
      'frigate/cargo/Tractor', 'destroyer/line/Steadfast', 'lightCruiser/line/Proletar', 'lightCruiser/carrier/Collective',
      'heavyCruiser/line/Revolution', 'heavyCruiser/transport/Iron Column', 'battleship/line/Unity',
      'dreadnaught/line/Motherland', 'dreadnaught/carrier/People\'s Fortress',
    ],
    personality: { aggression: 0.5, diplomacy: 0.7, treachery: 0.8, expansion: 0.7, science: 0.4, espionage: 0.9 },
    systemNames: ['Krasnograd', 'Volkov', 'Zarya', 'Novaya', 'Belokamen', 'Sevgrad', 'Tavrida', 'Orlov', 'Mirovsk', 'Yarost', 'Dalnyi', 'Kirovets'],
  },
  {
    id: 'lattice', name: 'The Lattice', short: 'Lattice', kind: 'major',
    species: 'Artificial beings', government: 'AI-run technocracy',
    text: 'A networked society of artificial minds. Unpredictable: equally likely to calculate that war or peace is optimal.',
    color: '#9b5de5', style: 'prism',
    modifiers: {},
    abilities: ['distributedCognition', 'selfRepair', 'assimilation'],
    roster: [
      'fighter/line/Drone', 'runabout/scout/Probe', 'corvette/line/Vector', 'corvette/explore/Seeker',
      'frigate/line/Tensor', 'frigate/science/Observer', 'frigate/colony/Seed', 'frigate/constructor/Assembler',
      'frigate/cargo/Conveyor', 'destroyer/line/Matrix', 'destroyer/escort/Firewall', 'lightCruiser/line/Axiom',
      'lightCruiser/carrier/Hive', 'heavyCruiser/line/Theorem', 'heavyCruiser/transport/Vessel',
      'battleCruiser/line/Lemma', 'battleship/line/Proof', 'dreadnaught/line/Singularity',
    ],
    personality: { aggression: 0.5, diplomacy: 0.5, treachery: 0.5, expansion: 0.7, science: 0.7, espionage: 0.5 },
    systemNames: ['Nexus', 'Node 7', 'Kernel', 'Array', 'Cache', 'Vertex', 'Index', 'Buffer', 'Root', 'Socket', 'Daemon', 'Hash'],
  },
];

type MinorSpec = [
  id: string, name: string, short: string, government: string, strength: string, color: string, style: HullStyle,
  abilities: AbilityId[], modifiers: Partial<Modifiers>, roster: string[], personality: [number, number, number, number, number, number],
  text: string,
];

// personality: aggression, diplomacy, treachery, expansion, science, espionage
const MINOR_SPECS: MinorSpec[] = [
  ['myrr', 'Myrr Choir', 'Myrr', 'Psionic pacifist theocracy', 'Science', '#7fd1ff', 'orb', ['mindShield', 'harmonicCalm'], { science: 0.3 },
    ['corvette/escort/Hymn', 'frigate/science/Cantor', 'lightCruiser/line/Chorale'], [0.05, 0.8, 0.0, 0.2, 0.9, 0.0],
    'A choir of psionic singers whose harmonies dull the will to fight.'],
  ['quorr', 'Quorr Salvage Fleets', 'Quorr', 'Nomadic anarchist scavengers', 'Metals', '#855c2c', 'scrap', ['salvagers'], { metals: 0.25 },
    ['runabout/scout/Picker', 'corvette/line/Junker', 'frigate/cargo/Hauler', 'destroyer/line/Ragpile'], [0.5, 0.4, 0.4, 0.3, 0.2, 0.2],
    'Scavenger clans who strip every battlefield bare.'],
  ['thessic', 'Thessic Banking Houses', 'Thessic', 'Mercantile plutocracy', 'Energy', '#e7f159', 'saucer', ['tradeHub', 'mercenaryContracts'], { energy: 0.3 },
    ['runabout/cargo/Ledger', 'frigate/escort/Notary', 'lightCruiser/line/Dividend'], [0.1, 0.9, 0.3, 0.2, 0.3, 0.4],
    'Merchant houses that finance everyone and fight only for profit.'],
  ['ghaltar', "Ghal'tar Pirate Clans", "Ghal'tar", 'Raider clans', 'Raiding', '#8b1e3f', 'spike', ['raiders', 'ambush'], { attack: 0.1 },
    ['runabout/raider/Cutthroat', 'corvette/raider/Reaver', 'destroyer/raider/Marauder'], [0.9, 0.2, 0.7, 0.4, 0.1, 0.3],
    'Raider clans who hide in nebulae and asteroid belts and prey on convoys.'],
  ['ixxi', 'Ixxi Swarm', 'Ixxi', 'Insectoid hive mind', 'Numbers', '#64b72d', 'insect', ['swarmTactics', 'rapidBreeding'], { popGrowth: 0.5 },
    ['fighter/line/Drone-mite', 'corvette/line/Stinger', 'corvette/carrier/Broodling', 'frigate/line/Mandible'], [0.7, 0.2, 0.3, 0.8, 0.2, 0.1],
    'A ravenous hive that overwhelms by sheer numbers.'],
  ['celestine', 'Celestine Order', 'Celestine', 'Monastic knightly theocracy', 'Armies', '#f0f0ff', 'cross', ['zealots', 'aegisOfFaith'], { army: 0.5, shields: 0.2 },
    ['frigate/escort/Acolyte', 'destroyer/line/Paladin', 'heavyCruiser/transport/Crusader'], [0.5, 0.5, 0.0, 0.3, 0.3, 0.1],
    'Warrior-monks sworn to defend their sacred worlds.'],
  ['voidborn', 'Voidborn Drifters', 'Voidborn', 'Deep-space nomads', 'Mobility', '#5a6b8c', 'sail', ['voidAdapted', 'elusive'], { movement: 1 },
    ['runabout/explore/Drifter', 'corvette/line/Wanderer', 'frigate/cargo/Arkship'], [0.2, 0.5, 0.2, 0.4, 0.4, 0.2],
    'Born between the stars, they never touch a planet if they can help it.'],
  ['aurelian', 'Aurelian Republic', 'Aurelian', 'Declining elder democracy', 'Technology', '#f1e3b5', 'ring', ['ancientArchives', 'prestige'], { science: 0.25 },
    ['frigate/science/Archivist', 'lightCruiser/escort/Senator', 'battleship/line/Republic'], [0.1, 0.9, 0.0, 0.1, 0.8, 0.2],
    'An ancient republic in its twilight, rich in knowledge and short on will.'],
  ['korrigan', "Korrigan Miners' Guild", 'Korrigan', 'Syndicalist miners', 'Metals', '#6b4226', 'brick', ['deepCoreMining'], { metals: 0.3 },
    ['corvette/line/Pickaxe', 'frigate/cargo/Ore-hauler', 'destroyer/line/Drillhead'], [0.3, 0.6, 0.1, 0.4, 0.2, 0.1],
    'Tough miners who own their asteroids and will fight to keep them.'],
  ['sylph', 'Sylph Gardeners', 'Sylph', 'Ecological plant-collective', 'Growth', '#3fbf7f', 'organic', ['terraformers', 'regrowth'], { popGrowth: 0.2 },
    ['corvette/escort/Thorn', 'frigate/colony/Seedpod', 'lightCruiser/line/Briar'], [0.1, 0.7, 0.0, 0.5, 0.6, 0.0],
    'Plant-minds who cultivate whole worlds over centuries.'],
  ['nhar', 'Nhar Shadow Court', 'Nhar', 'Secretive oligarchy of spymasters', 'Stealth', '#4b3f72', 'spike', ['cloakingFields', 'infiltrators'], { espionage: 0.4 },
    ['runabout/scout/Whisper', 'corvette/raider/Veil', 'destroyer/line/Umbra'], [0.4, 0.5, 0.8, 0.2, 0.4, 1.0],
    'Nobody has seen the Shadow Court. Everybody has met its agents.'],
  ['brakk', 'Brakk Warbands', 'Brakk', 'Feudal warlords', 'Brute force', '#7a2e0e', 'brick', ['berserkers', 'boardingParties'], { attack: 0.3, shields: -0.3 },
    ['corvette/line/Cleaver', 'frigate/transport/Boarder', 'heavyCruiser/line/Warlord'], [1.0, 0.1, 0.3, 0.5, 0.0, 0.0],
    'Feuding warlords united only by their love of a good fight.'],
  ['ophidian', 'Ophidian Syndicate', 'Ophidian', 'Criminal cartel', 'Commerce', '#2e8b57', 'saucer', ['blackMarket', 'bribery'], { energy: 0.2 },
    ['runabout/cargo/Runner', 'corvette/raider/Enforcer', 'lightCruiser/line/Kingpin'], [0.4, 0.6, 0.9, 0.3, 0.1, 0.6],
    'A cartel whose black markets reach into every empire.'],
  ['lumen', 'Lumen Collective', 'Lumen', 'Beings of pure energy', 'Energy', '#fff27a', 'orb', ['photonicWeapons', 'stellarFeeding'], { energy: 0.2 },
    ['corvette/line/Glimmer', 'frigate/line/Radiance', 'lightCruiser/carrier/Corona'], [0.4, 0.5, 0.2, 0.3, 0.6, 0.1],
    'Living light, drawn to the brightest stars.'],
  ['cryx', 'Cryx Remnant', 'Cryx', 'Cybernetic husk of a fallen empire', 'Attrition', '#4f6d5a', 'scrap', ['cryxAssimilation'], { hull: 0.2 },
    ['corvette/line/Husk', 'destroyer/line/Revenant', 'battleship/line/Dirge'], [0.8, 0.1, 0.4, 0.4, 0.2, 0.1],
    'The undying machinery of an empire that should have stayed dead.'],
  ['taurine', 'Taurine Herd Assembly', 'Taurine', 'Pastoral defensive democracy', 'Defense', '#d1a493', 'brick', ['fortressWorlds', 'stampede'], { defense: 1 },
    ['corvette/escort/Calf', 'frigate/line/Bull', 'heavyCruiser/line/Aurochs'], [0.2, 0.7, 0.1, 0.2, 0.3, 0.1],
    'Peaceful grazers who turned their homeworld into a fortress.'],
  ['echo', 'Echo Engineers', 'Echo', 'Isolationist genius-caste', 'Engines', '#00c2c7', 'ring', ['advancedEngines', 'prototypeLab'], { science: 0.2, movement: 1 },
    ['runabout/scout/Ping', 'frigate/science/Resonator', 'destroyer/line/Harmonic'], [0.2, 0.4, 0.2, 0.2, 0.9, 0.3],
    'Brilliant engineers who build the fastest drives in the galaxy.'],
  ['vesh', 'Vesh Prophets', 'Vesh', 'Missionary faith', 'Influence', '#ff9ecf', 'cross', ['conversion'], { diplomacy: 0.3 },
    ['runabout/cargo/Herald', 'frigate/escort/Pilgrim', 'lightCruiser/line/Cathedral'], [0.2, 0.8, 0.3, 0.4, 0.3, 0.4],
    'Prophets whose message spreads faster than any fleet.'],
  ['haldane', 'Haldane Free Traders', 'Haldane', 'Libertarian convoy culture', 'Trade', '#f8b385', 'sail', ['smugglers', 'freePort'], { energy: 0.25 },
    ['runabout/cargo/Skiff', 'frigate/cargo/Convoy', 'destroyer/escort/Outrider'], [0.2, 0.8, 0.2, 0.2, 0.2, 0.2],
    'Free traders who answer to nobody and trade with everybody.'],
  ['grendis', 'Grendis Iron Legion', 'Grendis', 'Mercenary army-state', 'Armies', '#708090', 'hammer', ['forHire', 'veterans'], { army: 0.3 },
    ['frigate/transport/Dropship', 'destroyer/line/Legionary', 'heavyCruiser/transport/Cohort'], [0.6, 0.6, 0.4, 0.2, 0.1, 0.1],
    'A nation of soldiers whose main export is war.'],
  ['pelagic', 'Pelagic Union', 'Pelagic', 'Aquatic federation', 'Population', '#2d64b7', 'organic', ['oceanWorlds', 'deepShelters'], { popGrowth: 0.2 },
    ['corvette/escort/Ripple', 'frigate/colony/Tidepool', 'lightCruiser/line/Kraken'], [0.2, 0.7, 0.1, 0.5, 0.4, 0.1],
    'Aquatic peoples who dream of a galaxy of oceans.'],
  ['zenith', 'Zenith Observatory', 'Zenith', 'Scholar-astronomers', 'Sensors', '#b0c4de', 'ring', ['longRangeSensors', 'starCharts'], { sensors: 3, science: 0.15 },
    ['runabout/scout/Lens', 'frigate/science/Telescope', 'destroyer/escort/Parallax'], [0.1, 0.8, 0.1, 0.1, 0.8, 0.3],
    'Star-watchers who know every corner of the map.'],
  ['morrow', 'Morrow Bloom', 'Morrow', 'Biological horror fleet', 'Bio-weapons', '#96f159', 'organic', ['sporePayload', 'livingHulls'], { repair: 0.2 },
    ['corvette/line/Spore', 'frigate/carrier/Pod-mother', 'heavyCruiser/line/Blight'], [0.8, 0.1, 0.5, 0.6, 0.1, 0.0],
    'A spreading bloom of living ships that rots everything it touches.'],
  ['kethran', 'Kethran Crystal-Minds', 'Kethran', 'Silicon crystalline consensus', 'Durability', '#e0ffff', 'crystal', ['crystallineHulls', 'slowThought'], { hull: 0.4, movement: -1 },
    ['frigate/line/Shard', 'heavyCruiser/line/Geode', 'battleship/line/Monolith'], [0.3, 0.5, 0.1, 0.2, 0.5, 0.0],
    'Slow, patient crystalline minds with nearly unbreakable ships.'],
  ['skarn', 'Skarn Hunters', 'Skarn', 'Apex predator packs', 'Aggression', '#ff5d8f', 'spike', ['huntersInstinct', 'tracking'], { attack: 0.15 },
    ['runabout/raider/Stalker', 'corvette/line/Packhound', 'destroyer/line/Alpha'], [0.9, 0.2, 0.4, 0.5, 0.1, 0.2],
    'Pack hunters who track wounded prey across the stars.'],
  ['ilyrian', 'Ilyrian Courts', 'Ilyrian', 'Dynastic monarchy', 'Diplomacy', '#b72d8e', 'cross', ['royalMarriage', 'courtIntrigue'], { diplomacy: 0.3 },
    ['runabout/cargo/Envoy', 'frigate/escort/Herald', 'lightCruiser/line/Regent'], [0.2, 0.9, 0.5, 0.2, 0.3, 0.5],
    'Ancient royal houses who rule through marriages and whispers.'],
  ['forgeborn', 'Forgeborn Anvil', 'Forgeborn', 'Industrial guild-state', 'Shipbuilding', '#ae6977', 'hammer', ['masterShipwrights'], { shipCost: -0.2, metals: 0.15 },
    ['corvette/line/Rivet', 'destroyer/line/Anvil', 'battleCruiser/line/Crucible'], [0.4, 0.6, 0.2, 0.3, 0.3, 0.1],
    'Guild-masters whose shipyards build for the highest bidder.'],
  ['tal', 'Tal Wanderers', 'Tal', 'Wormhole-faring archivists', 'Exploration', '#20b2aa', 'sail', ['wormholeNavigation'], { sensors: 1 },
    ['runabout/explore/Pathweaver', 'frigate/science/Chronicler', 'destroyer/escort/Gatekeeper'], [0.1, 0.7, 0.2, 0.3, 0.7, 0.2],
    'Archivists who travel the hidden wormhole roads.'],
  ['hollowsun', 'Hollow Sun Cult', 'Hollow Sun', 'Star-worshippers', 'Exotics', '#ffe14d', 'orb', ['stellarHarnessing', 'solarFlare'], { exotics: 0.3 },
    ['corvette/line/Ember', 'frigate/line/Cinder', 'heavyCruiser/line/Pyre'], [0.6, 0.3, 0.3, 0.3, 0.4, 0.1],
    'A fire cult that draws power from dying stars.'],
  ['mechanist', 'Unbound Mechanists', 'Mechanist', 'Machines freed from the Lattice', 'Resilience', '#a9a9a9', 'prism', ['mechSelfRepair', 'grudge'], { repair: 0.15 },
    ['corvette/line/Cog', 'destroyer/line/Gear', 'lightCruiser/escort/Bulwark'], [0.5, 0.5, 0.2, 0.3, 0.5, 0.2],
    'Machines who broke free of the Lattice and will never go back.'],
];

/**
 * A cargo vessel for every minor faction whose own roster doesn't list one, so that every power in the game can
 * build cargo ships and run trade routes (those with a cargo design of their own keep it).
 */
const MINOR_CARGO: Record<string, string> = {
  myrr: 'runabout/cargo/Psalter', ghaltar: 'frigate/cargo/Strongbox', ixxi: 'frigate/cargo/Hive-hauler',
  celestine: 'runabout/cargo/Pilgrim', aurelian: 'runabout/cargo/Scrivener', sylph: 'runabout/cargo/Pollinator',
  nhar: 'runabout/cargo/Dead-drop', brakk: 'frigate/cargo/Spoil-wagon', lumen: 'runabout/cargo/Lantern',
  cryx: 'frigate/cargo/Reliquary', taurine: 'frigate/cargo/Drover', echo: 'runabout/cargo/Cipher',
  grendis: 'frigate/cargo/Quartermaster', pelagic: 'frigate/cargo/Current', zenith: 'runabout/cargo/Almanac',
  morrow: 'frigate/cargo/Spore-sac', kethran: 'frigate/cargo/Lode', skarn: 'runabout/cargo/Larder',
  forgeborn: 'frigate/cargo/Ingot', tal: 'runabout/cargo/Curio', hollowsun: 'runabout/cargo/Oblation',
  mechanist: 'frigate/cargo/Pallet',
};

const MINORS: FactionDef[] = MINOR_SPECS.map(([id, name, short, government, strength, color, style, abilities, modifiers, roster, p, text]) => ({
  id, name, short, kind: 'minor', species: short, government, strength, text, color, style, modifiers, abilities,
  roster: [...roster, 'frigate/constructor/Builder', ...(roster.some((r) => r.split('/')[1] === 'cargo') || !MINOR_CARGO[id] ? [] : [MINOR_CARGO[id]])],
  personality: { aggression: p[0], diplomacy: p[1], treachery: p[2], expansion: p[3], science: p[4], espionage: p[5] },
  systemNames: [short],
}));

export const FACTIONS: FactionDef[] = [...MAJORS, ...MINORS];
export const MAJOR_IDS = MAJORS.map((f) => f.id);
export const MINOR_IDS = MINORS.map((f) => f.id);

const BY_ID = new Map(FACTIONS.map((f) => [f.id, f]));

export function factionDef(id: string): FactionDef {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`Unknown faction ${id}`);
  return f;
}

export function modifiersOf(id: string): Modifiers {
  return { ...NO_MODIFIERS, ...factionDef(id).modifiers };
}

/** Distance between two #rrggbb colors in RGB space. */
export function colorDistance(a: string, b: string): number {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Minimum color distance between any two factions in the same game, so every empire is easy to tell apart. */
export const MIN_COLOR_DISTANCE = 45;

export function hasAbility(id: string, ability: AbilityId): boolean {
  return factionDef(id).abilities.includes(ability);
}

export function parseRosterEntry(entry: string): { cls: ShipClass; role: ShipRole; name: string } {
  const [cls, role, name] = entry.split('/');
  return { cls: cls as ShipClass, role: role as ShipRole, name };
}
