import type { PlanetKind, ResourceKind, StarKind, Terrain } from '../engine/types';

export interface ImprovementDef {
  name: string;
  text: string;
  cost: { metals: number; energy: number; exotics: number };
  buildPoints: number;
  /** Flat yields added. */
  yields?: Partial<Record<ResourceKind, number>>;
  /** Extra population capacity. */
  popCap?: number;
  /** Extra production points per turn for the system's build queue. */
  production?: number;
  defense?: number;
  garrison?: number;
  /** Minimum development level. */
  minLevel: number;
  tech: string | null;
  /** Needs an exotic source in the system (gas giant, nebula, neutron star, pulsar). */
  needsExotics?: boolean;
  shipyard?: 'light' | 'heavy';
  unique?: boolean;
}

export const IMPROVEMENTS: Record<string, ImprovementDef> = {
  mine:         { name: 'Mine',            text: '+4 metals.',                               cost: { metals: 20, energy: 10, exotics: 0 }, buildPoints: 6,  yields: { metals: 4 }, minLevel: 1, tech: null },
  powerPlant:   { name: 'Power Plant',     text: '+3 energy.',                               cost: { metals: 20, energy: 5,  exotics: 0 }, buildPoints: 6,  yields: { energy: 3 }, minLevel: 1, tech: null },
  lab:          { name: 'Research Lab',    text: '+3 science.',                              cost: { metals: 25, energy: 15, exotics: 0 }, buildPoints: 8,  yields: { science: 3 }, minLevel: 1, tech: null },
  habitat:      { name: 'Habitat',         text: '+4 population capacity.',                  cost: { metals: 30, energy: 10, exotics: 0 }, buildPoints: 8,  popCap: 4, minLevel: 2, tech: null },
  refinery:     { name: 'Exotics Refinery', text: '+2 exotics. Needs an exotic source.',     cost: { metals: 40, energy: 20, exotics: 0 }, buildPoints: 10, yields: { exotics: 2 }, minLevel: 1, tech: 'refining', needsExotics: true },
  shipyard:     { name: 'Shipyard',        text: 'Builds ships up to Destroyer.',            cost: { metals: 40, energy: 15, exotics: 0 }, buildPoints: 10, minLevel: 3, tech: null, shipyard: 'light', unique: true },
  heavyShipyard:{ name: 'Heavy Shipyard',  text: 'Builds every class.',                      cost: { metals: 90, energy: 40, exotics: 5 }, buildPoints: 18, minLevel: 4, tech: 'hull3', shipyard: 'heavy', unique: true },
  planetShield: { name: 'Planetary Shield', text: '+20 planetary defense.',                  cost: { metals: 50, energy: 30, exotics: 0 }, buildPoints: 12, defense: 20, minLevel: 2, tech: 'deflectors' },
  garrison:     { name: 'Ground Garrison', text: '+20 ground defense.',                      cost: { metals: 30, energy: 10, exotics: 0 }, buildPoints: 8,  garrison: 20, minLevel: 1, tech: null },
  tradePort:    { name: 'Trade Port',      text: '+2 energy per trade agreement.',           cost: { metals: 35, energy: 15, exotics: 0 }, buildPoints: 9,  minLevel: 2, tech: 'commerce', unique: true },
  factory:      { name: 'Factory',         text: '+3 production per turn.',                  cost: { metals: 35, energy: 15, exotics: 0 }, buildPoints: 9,  production: 3, minLevel: 2, tech: null },
  orbitalFarm:  { name: 'Orbital Farm',    text: '+3 population capacity, +1 energy.',       cost: { metals: 25, energy: 10, exotics: 0 }, buildPoints: 7,  popCap: 3, yields: { energy: 1 }, minLevel: 1, tech: 'hydroponics' },
  deepMine:     { name: 'Deep Core Mine',  text: '+7 metals.',                               cost: { metals: 45, energy: 20, exotics: 0 }, buildPoints: 12, yields: { metals: 7 }, minLevel: 3, tech: 'asteroidMining' },
  fusionReactor:{ name: 'Antimatter Reactor', text: '+6 energy.',                            cost: { metals: 45, energy: 15, exotics: 2 }, buildPoints: 12, yields: { energy: 6 }, minLevel: 3, tech: 'antimatter' },
  university:   { name: 'University',      text: '+6 science. One per system.',              cost: { metals: 50, energy: 30, exotics: 0 }, buildPoints: 14, yields: { science: 6 }, minLevel: 3, tech: 'quantumComputing', unique: true },
  academy:      { name: 'Academy',         text: 'Ships and armies built here start as veterans.', cost: { metals: 60, energy: 30, exotics: 0 }, buildPoints: 14, minLevel: 3, tech: 'tactics', unique: true },
};

/** Base yields of a planet type at development multiplier 1. */
export const PLANET_YIELDS: Record<PlanetKind, { name: string; energy: number; metals: number; science: number; exotics: number; popCap: number }> = {
  terran:       { name: 'Terran',        energy: 2, metals: 3, science: 2, exotics: 0, popCap: 10 },
  ocean:        { name: 'Ocean',         energy: 2, metals: 1, science: 2, exotics: 0, popCap: 9 },
  jungle:       { name: 'Jungle',        energy: 1, metals: 1, science: 3, exotics: 0, popCap: 8 },
  desert:       { name: 'Desert',        energy: 3, metals: 2, science: 1, exotics: 0, popCap: 5 },
  arctic:       { name: 'Arctic',        energy: 1, metals: 2, science: 2, exotics: 0, popCap: 4 },
  barren:       { name: 'Barren',        energy: 1, metals: 3, science: 1, exotics: 0, popCap: 1 },
  volcanic:     { name: 'Volcanic',      energy: 3, metals: 4, science: 1, exotics: 0, popCap: 1 },
  gasGiant:     { name: 'Gas Giant',     energy: 3, metals: 0, science: 1, exotics: 2, popCap: 0 },
  asteroidBelt: { name: 'Asteroid Belt', energy: 0, metals: 5, science: 0, exotics: 0, popCap: 1 },
};

/** Extra yields from the star. */
export const STAR_YIELDS: Record<StarKind, { name: string; energy: number; exotics: number; science: number }> = {
  yellow:  { name: 'Yellow star',  energy: 1, exotics: 0, science: 0 },
  orange:  { name: 'Orange star',  energy: 1, exotics: 0, science: 0 },
  red:     { name: 'Red dwarf',    energy: 0, exotics: 0, science: 0 },
  blue:    { name: 'Blue giant',   energy: 3, exotics: 0, science: 1 },
  white:   { name: 'White star',   energy: 2, exotics: 0, science: 0 },
  neutron: { name: 'Neutron star', energy: 3, exotics: 3, science: 1 },
  pulsar:  { name: 'Pulsar',       energy: 2, exotics: 2, science: 2 },
};

export const TERRAIN_INFO: Record<Terrain, { name: string; moveCost: number; passable: boolean; text: string }> = {
  space:       { name: 'Open space',    moveCost: 1, passable: true,  text: 'Empty space.' },
  asteroids:   { name: 'Asteroid field', moveCost: 2, passable: true, text: 'Rich in metals. Slow going; small ships are harder to hit here.' },
  nebula:      { name: 'Nebula',        moveCost: 2, passable: true,  text: 'Hides fleets from outside sensors; shields are halved inside.' },
  neutronStar: { name: 'Neutron star',  moveCost: 1, passable: true,  text: 'Exotics and energy; ships ending a turn here take 5% hull damage.' },
  pulsar:      { name: 'Pulsar',        moveCost: 1, passable: true,  text: 'Exotics; scrambles sensors nearby.' },
  blackHole:   { name: 'Black hole',    moveCost: Infinity, passable: false, text: 'Impassable.' },
  ionStorm:    { name: 'Ion storm',     moveCost: 2, passable: true,  text: 'No shields inside.' },
  wormhole:    { name: 'Wormhole',      moveCost: 1, passable: true,  text: 'Entering it takes you to its twin.' },
};
