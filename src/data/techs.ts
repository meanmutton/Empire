/** The technology tree (§8). Six fields, tiers 1–6, plus the Ascension project. */

export type TechField = 'propulsion' | 'weapons' | 'defense' | 'construction' | 'society' | 'computing';

export interface TechEffects {
  /** Fractional bonuses. */
  energyWeapons?: number;
  missiles?: number;
  fighters?: number;
  attack?: number;
  shields?: number;
  pointDefense?: number;
  hull?: number;
  planetDefense?: number;
  starbaseHull?: number;
  army?: number;
  energy?: number;
  metals?: number;
  science?: number;
  exotics?: number;
  asteroidMetals?: number;
  popCap?: number;
  popGrowth?: number;
  production?: number;
  diplomacy?: number;
  espionage?: number;
  spyDefense?: number;
  /** Flat bonuses. */
  speed?: number;
  smallShipSpeed?: number;
  sensors?: number;
  unrestDecay?: number;
  stealth?: number;
  wormholeFree?: boolean;
}

export interface TechDef {
  id: string;
  name: string;
  field: TechField;
  tier: number;
  requires: string[];
  text: string;
  effects: TechEffects;
}

export const TIER_COST = [0, 60, 160, 340, 620, 1000, 1500, 3000];

const T = (id: string, name: string, field: TechField, tier: number, requires: string[], text: string, effects: TechEffects = {}): TechDef =>
  ({ id, name, field, tier, requires, text, effects });

export const TECHS: TechDef[] = [
  // Propulsion
  T('ionDrives', 'Ion Drives', 'propulsion', 1, [], '+1 movement for ships of Frigate size or smaller.', { smallShipSpeed: 1 }),
  T('navigation', 'Stellar Navigation', 'propulsion', 1, [], '+1 sensor range.', { sensors: 1 }),
  T('warpCoils', 'Warp Coils', 'propulsion', 2, ['ionDrives'], '+1 movement for all ships.', { speed: 1 }),
  T('inertialDampers', 'Inertial Dampers', 'propulsion', 3, ['warpCoils'], 'Ships are 5% tougher in battle.', { hull: 0.05 }),
  T('fuelScoops', 'Fuel Scoops', 'propulsion', 3, ['navigation'], 'Exotics +10%.', { exotics: 0.1 }),
  T('hyperspace', 'Hyperspace Jump', 'propulsion', 4, ['inertialDampers'], '+1 movement for all ships.', { speed: 1 }),
  T('wormholeStabilization', 'Wormhole Stabilization', 'propulsion', 5, ['hyperspace'], 'Wormhole jumps cost no movement.', { wormholeFree: true }),
  T('foldSpace', 'Fold Space', 'propulsion', 6, ['wormholeStabilization'], '+1 movement for all ships.', { speed: 1 }),
  // Weapons
  T('lasers', 'Focused Lasers', 'weapons', 1, [], 'Energy weapons +10%.', { energyWeapons: 0.1 }),
  T('missiles', 'Guided Missiles', 'weapons', 1, [], 'Missiles +10%.', { missiles: 0.1 }),
  T('fighterBays', 'Fighter Bays', 'weapons', 2, ['missiles'], 'Fighters +20%.', { fighters: 0.2 }),
  T('tactics', 'Fleet Tactics', 'weapons', 2, ['lasers'], 'Attack +5%. Unlocks the Academy.', { attack: 0.05 }),
  T('plasma', 'Plasma Cannons', 'weapons', 3, ['lasers'], 'Energy weapons +15%.', { energyWeapons: 0.15 }),
  T('torpedoes', 'Photon Torpedoes', 'weapons', 3, ['missiles'], 'Missiles +15%.', { missiles: 0.15 }),
  T('disruptors', 'Disruptors', 'weapons', 4, ['plasma'], 'Energy weapons +20%.', { energyWeapons: 0.2 }),
  T('antimatter', 'Antimatter Warheads', 'weapons', 5, ['torpedoes', 'disruptors'], 'Missiles +20%, fighters +20%.', { missiles: 0.2, fighters: 0.2 }),
  // Defense
  T('deflectors', 'Deflector Shields', 'defense', 1, [], 'Shields +15%. Unlocks Planetary Shields.', { shields: 0.15 }),
  T('pointDefense', 'Point Defense Grid', 'defense', 1, [], 'Point defense +25%.', { pointDefense: 0.25 }),
  T('armorPlating', 'Composite Armor', 'defense', 2, ['deflectors'], 'Hull +10%.', { hull: 0.1 }),
  T('phaseShields', 'Phase Shields', 'defense', 3, ['armorPlating'], 'Shields +20%.', { shields: 0.2 }),
  T('planetaryFortress', 'Planetary Fortress', 'defense', 3, ['pointDefense'], 'Planetary defenses +50%.', { planetDefense: 0.5 }),
  T('reactiveArmor', 'Reactive Armor', 'defense', 4, ['phaseShields'], 'Hull +15%.', { hull: 0.15 }),
  T('aegis', 'Aegis Barrier', 'defense', 5, ['reactiveArmor'], 'Shields +25%.', { shields: 0.25 }),
  T('citadelDoctrine', 'Citadel Doctrine', 'defense', 6, ['aegis', 'planetaryFortress'], 'Starbases +50% hull, planetary defenses +50%.', { starbaseHull: 0.5, planetDefense: 0.5 }),
  // Construction
  T('starbase1', 'Orbital Stations', 'construction', 1, [], 'Constructors can build Orbital Stations (tier-1 starbases).'),
  T('asteroidMining', 'Asteroid Mining', 'construction', 1, [], 'Asteroid belts yield +50% metals.', { asteroidMetals: 0.5 }),
  T('hull2', 'Hull Engineering II', 'construction', 2, ['starbase1'], 'Unlocks Destroyers and Light Cruisers.'),
  T('starbase2', 'Starbases', 'construction', 3, ['hull2'], 'Upgrade stations to Starbases.'),
  T('hull3', 'Hull Engineering III', 'construction', 3, ['hull2'], 'Unlocks Heavy Cruisers and Heavy Shipyards.'),
  T('orbitalFoundries', 'Orbital Foundries', 'construction', 4, ['hull3'], 'Production +25%.', { production: 0.25 }),
  T('hull4', 'Hull Engineering IV', 'construction', 4, ['hull3'], 'Unlocks Battle Cruisers and Battleships.'),
  T('starbase3', 'Citadels', 'construction', 5, ['starbase2', 'hull4'], 'Upgrade Starbases to Citadels.'),
  T('hull5', 'Hull Engineering V', 'construction', 6, ['hull4'], 'Unlocks Dreadnaughts.'),
  // Society
  T('hydroponics', 'Hydroponics', 'society', 1, [], 'Population capacity +10%.', { popCap: 0.1 }),
  T('commerce', 'Interstellar Commerce', 'society', 1, [], 'Energy +10%. Unlocks Trade Ports.', { energy: 0.1 }),
  T('xenodiplomacy', 'Xenodiplomacy', 'society', 2, ['commerce'], 'Diplomacy +20%.', { diplomacy: 0.2 }),
  T('geneticAdaptation', 'Genetic Adaptation', 'society', 2, ['hydroponics'], 'Population growth +25%.', { popGrowth: 0.25 }),
  T('refining', 'Exotic Refining', 'society', 2, ['commerce'], 'Exotics +10%. Unlocks Exotics Refineries.', { exotics: 0.1 }),
  T('terraforming', 'Terraforming', 'society', 3, ['geneticAdaptation'], 'Population capacity +20%.', { popCap: 0.2 }),
  T('propaganda', 'Propaganda', 'society', 3, ['xenodiplomacy'], 'Unrest fades faster; armies +10%.', { unrestDecay: 5, army: 0.1 }),
  T('utopia', 'Post-Scarcity', 'society', 5, ['terraforming', 'propaganda'], 'Energy, metals and science +10%.', { energy: 0.1, metals: 0.1, science: 0.1 }),
  // Computing
  T('sensors1', 'Subspace Sensors', 'computing', 1, [], '+1 sensor range.', { sensors: 1 }),
  T('battleAI', 'Battle Computers', 'computing', 2, ['sensors1'], 'Attack +10%.', { attack: 0.1 }),
  T('espionageNet', 'Espionage Networks', 'computing', 2, ['sensors1'], 'Spy missions +20%.', { espionage: 0.2 }),
  T('counterIntel', 'Counter-Intelligence', 'computing', 3, ['espionageNet'], 'Enemy spies −30%.', { spyDefense: 0.3 }),
  T('sensors2', 'Tachyon Sensors', 'computing', 3, ['sensors1'], '+1 sensor range.', { sensors: 1 }),
  T('quantumComputing', 'Quantum Computing', 'computing', 4, ['battleAI'], 'Science +20%.', { science: 0.2 }),
  T('cloaking', 'Cloaking Devices', 'computing', 4, ['sensors2', 'refining'], 'Scouts and raiders get stealth 2.', { stealth: 2 }),
  T('singularityCore', 'Singularity Core', 'computing', 6, ['quantumComputing'], 'Science +30%.', { science: 0.3 }),
  // Ascension
  T('ascension', 'Ascension Theory', 'computing', 7, [], 'Allows the Ascension Gate. Needs every tech in four fields.'),
];

export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

export const FIELDS: TechField[] = ['propulsion', 'weapons', 'defense', 'construction', 'society', 'computing'];
