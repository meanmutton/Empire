/** Ship classes, roles and how a design's stats are derived from class × role. */

export const SHIP_CLASSES = [
  'fighter', 'runabout', 'corvette', 'frigate', 'destroyer',
  'lightCruiser', 'heavyCruiser', 'battleCruiser', 'battleship', 'dreadnaught',
] as const;
export type ShipClass = (typeof SHIP_CLASSES)[number];

export interface ClassDef {
  name: string;
  size: number;
  hull: number;
  slots: number;
  speed: number;
  sensors: number;
  evasion: number;
  /** Tech required to build, or null. */
  tech: string | null;
  crew: number;
  cost: { metals: number; energy: number; exotics: number };
  buildPoints: number;
  upkeep: number;
}

export const CLASSES: Record<ShipClass, ClassDef> = {
  fighter:       { name: 'Fighter',        size: 1,  hull: 10,  slots: 1,  speed: 0, sensors: 1, evasion: 0.30, tech: null,    crew: 0, cost: { metals: 4,   energy: 2,  exotics: 0 },  buildPoints: 2,  upkeep: 0 },
  runabout:      { name: 'Runabout',       size: 1,  hull: 20,  slots: 1,  speed: 5, sensors: 2, evasion: 0.25, tech: null,    crew: 0, cost: { metals: 12,  energy: 6,  exotics: 0 },  buildPoints: 4,  upkeep: 0.2 },
  corvette:      { name: 'Corvette',       size: 2,  hull: 40,  slots: 2,  speed: 4, sensors: 2, evasion: 0.20, tech: null,    crew: 0, cost: { metals: 24,  energy: 10, exotics: 0 },  buildPoints: 7,  upkeep: 0.4 },
  frigate:       { name: 'Frigate',        size: 3,  hull: 70,  slots: 3,  speed: 4, sensors: 2, evasion: 0.15, tech: null,    crew: 1, cost: { metals: 40,  energy: 16, exotics: 0 },  buildPoints: 11, upkeep: 0.7 },
  destroyer:     { name: 'Destroyer',      size: 4,  hull: 110, slots: 4,  speed: 4, sensors: 2, evasion: 0.12, tech: 'hull2', crew: 1, cost: { metals: 62,  energy: 24, exotics: 0 },  buildPoints: 16, upkeep: 1 },
  lightCruiser:  { name: 'Light Cruiser',  size: 5,  hull: 160, slots: 5,  speed: 3, sensors: 3, evasion: 0.10, tech: 'hull2', crew: 2, cost: { metals: 90,  energy: 34, exotics: 0 },  buildPoints: 22, upkeep: 1.4 },
  heavyCruiser:  { name: 'Heavy Cruiser',  size: 6,  hull: 230, slots: 6,  speed: 3, sensors: 3, evasion: 0.08, tech: 'hull3', crew: 2, cost: { metals: 130, energy: 48, exotics: 0 },  buildPoints: 30, upkeep: 2 },
  battleCruiser: { name: 'Battle Cruiser', size: 7,  hull: 300, slots: 7,  speed: 4, sensors: 3, evasion: 0.08, tech: 'hull4', crew: 3, cost: { metals: 170, energy: 70, exotics: 8 },  buildPoints: 38, upkeep: 2.8 },
  battleship:    { name: 'Battleship',     size: 8,  hull: 400, slots: 8,  speed: 3, sensors: 3, evasion: 0.05, tech: 'hull4', crew: 4, cost: { metals: 220, energy: 80, exotics: 12 }, buildPoints: 46, upkeep: 3.4 },
  dreadnaught:   { name: 'Dreadnaught',    size: 10, hull: 600, slots: 10, speed: 2, sensors: 4, evasion: 0.03, tech: 'hull5', crew: 6, cost: { metals: 340, energy: 130, exotics: 25 }, buildPoints: 64, upkeep: 5 },
};

export const SHIP_ROLES = [
  'scout', 'explore', 'line', 'carrier', 'escort', 'science', 'cargo', 'colony', 'constructor', 'transport', 'raider',
] as const;
export type ShipRole = (typeof SHIP_ROLES)[number];

/** How a role spends a class's slots, as fractions (normalized), plus flat extras. */
interface RoleDef {
  name: string;
  text: string;
  alloc: Partial<Record<'energy' | 'missile' | 'shields' | 'pd' | 'hangar' | 'cargo' | 'sensors' | 'engines' | 'armor', number>>;
  /** Can survey anomalies and ruins. */
  survey?: boolean;
  /** Consumed to found a colony. */
  colonize?: boolean;
  /** Can build starbases and outposts. */
  construct?: boolean;
  /** Takes hits for its group. */
  escort?: boolean;
  /** Ignores hazard damage. */
  hazardProof?: boolean;
  /** Bonus vs cargo and colony ships. */
  raider?: boolean;
  costMult: number;
}

export const ROLES: Record<ShipRole, RoleDef> = {
  scout:       { name: 'Scout',            text: 'Fast and far-seeing, lightly armed.', alloc: { sensors: 2, engines: 2, energy: 1 }, costMult: 0.8 },
  explore:     { name: 'Deep Exploration', text: 'Long-range explorer that surveys anomalies and shrugs off hazards.', alloc: { sensors: 2, engines: 1, shields: 1, armor: 1 }, survey: true, hazardProof: true, costMult: 1.0 },
  line:        { name: 'Ship-of-the-Line', text: 'Balanced warship.', alloc: { energy: 2, missile: 2, shields: 2, armor: 1, pd: 1 }, costMult: 1.0 },
  carrier:     { name: 'Fighter Carrier',  text: 'Launches fighter wings each round.', alloc: { hangar: 4, shields: 1, pd: 1 }, costMult: 1.15 },
  escort:      { name: 'Escort',           text: 'Point defense and shields; shields its group.', alloc: { pd: 3, shields: 2, energy: 1 }, escort: true, costMult: 0.95 },
  science:     { name: 'Science Vessel',   text: 'Surveys anomalies, adds science, detects cloaked ships.', alloc: { sensors: 3, shields: 1 }, survey: true, costMult: 0.9 },
  cargo:       { name: 'Cargo Vessel',     text: 'Hauls armies, agents and goods.', alloc: { cargo: 3, armor: 1 }, costMult: 0.7 },
  colony:      { name: 'Colony Ship',      text: 'Founds a colony; consumed on use.', alloc: { cargo: 2, armor: 1 }, colonize: true, costMult: 1.1 },
  constructor: { name: 'Constructor',      text: 'Builds starbases and outposts.', alloc: { cargo: 1, armor: 1 }, construct: true, costMult: 1.0 },
  transport:   { name: 'Troop Transport',  text: 'Carries many armies; landing bonus.', alloc: { cargo: 4, armor: 1, shields: 1 }, costMult: 0.85 },
  raider:      { name: 'Raider',           text: 'Fast missile boat; preys on cargo and colony ships.', alloc: { missile: 3, engines: 1 }, raider: true, costMult: 0.9 },
};

export interface ShipStats {
  hull: number;
  shields: number;
  energy: number;
  missile: number;
  pd: number;
  hangar: number;
  cargo: number;
  sensors: number;
  speed: number;
  evasion: number;
  stealth: number;
}

/** Points of stat per slot spent. */
const PER_SLOT = { energy: 6, missile: 6, shields: 5, pd: 4, hangar: 2, cargo: 1, sensors: 1, engines: 0.5, armor: 0.12 };

/** Base stats of class × role before faction modifiers. */
export function deriveStats(cls: ShipClass, role: ShipRole): ShipStats {
  const c = CLASSES[cls];
  const r = ROLES[role];
  if (cls === 'fighter') {
    return { hull: c.hull, shields: 0, energy: 4, missile: 2, pd: 1, hangar: 0, cargo: 0, sensors: 1, speed: 0, evasion: c.evasion, stealth: 0 };
  }
  const total = Object.values(r.alloc).reduce((a, b) => a + (b ?? 0), 0);
  const share = (k: keyof typeof PER_SLOT) => ((r.alloc[k] ?? 0) / total) * c.slots;
  const s: ShipStats = {
    hull: Math.round(c.hull * (1 + share('armor') * PER_SLOT.armor)),
    shields: Math.round(share('shields') * PER_SLOT.shields),
    energy: Math.round(share('energy') * PER_SLOT.energy),
    missile: Math.round(share('missile') * PER_SLOT.missile),
    pd: Math.round(share('pd') * PER_SLOT.pd),
    hangar: Math.round(share('hangar') * PER_SLOT.hangar),
    cargo: Math.max(r.alloc.cargo ? 1 : 0, Math.round(share('cargo') * PER_SLOT.cargo)),
    sensors: c.sensors + Math.round(share('sensors') * PER_SLOT.sensors),
    speed: c.speed + Math.min(2, Math.floor(share('engines') * PER_SLOT.engines)),
    evasion: c.evasion,
    stealth: 0,
  };
  return s;
}

export function roleOf(role: ShipRole): RoleDef {
  return ROLES[role];
}
