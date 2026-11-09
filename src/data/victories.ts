/** Victory conditions (§10): what each one asks, who may pursue it, and the game presets. */
import type { FactionId } from '../engine/types';

export const VICTORY_IDS = [
  'conquest', 'hegemony', 'gloriousCampaign', 'economicSupremacy', 'ascendance', 'singularity',
  'worldRevolution', 'grandAlliance', 'galacticCouncil', 'score',
] as const;
export type VictoryId = (typeof VICTORY_IDS)[number];

export type VictoryFamily = 'conquest' | 'economic' | 'technological' | 'diplomatic' | 'other';

export interface VictoryDef {
  name: string;
  family: VictoryFamily;
  text: string;
  /** The one great power this victory belongs to, if it is unique. */
  unique?: FactionId;
}

export const VICTORIES: Record<VictoryId, VictoryDef> = {
  conquest: { name: 'Conquest', family: 'conquest', text: 'Hold the home system of every other great power.' },
  hegemony: { name: 'Hegemony', family: 'conquest', unique: 'varrhen', text: 'Hold the home systems of 2 other great powers and rule 4 minor factions as vassals.' },
  gloriousCampaign: { name: 'Glorious Campaign', family: 'conquest', unique: 'rynkai', text: 'Win many battles (more on bigger maps), including at least one against every other great power.' },
  economicSupremacy: { name: 'Economic Supremacy', family: 'economic', text: 'Produce 35% of the galaxy’s income (energy, metals and exotics) for 10 turns in a row.' },
  ascendance: { name: 'Ascendance', family: 'technological', unique: 'concord', text: 'Complete every tech in 4 fields and build the Ascension Gate.' },
  singularity: { name: 'Singularity', family: 'technological', unique: 'lattice', text: 'Complete every tech in 5 fields and run Research Labs on 3 Core Worlds for 10 turns in a row.' },
  worldRevolution: { name: 'World Revolution', family: 'other', unique: 'krasnyr', text: 'Have 6 systems defect to you through subversion and rule 3 minor factions as vassals.' },
  grandAlliance: { name: 'Grand Alliance', family: 'diplomatic', text: 'Every surviving great power is allied with you for 10 turns, and you hold the most systems among them.' },
  galacticCouncil: { name: 'Galactic Council', family: 'diplomatic', text: 'Win two Galactic Council elections in a row with two-thirds of the vote (the council meets every 20 turns).' },
  score: { name: 'Score', family: 'other', text: 'Have the highest score when the turn limit is reached.' },
};

/** Who may pursue what in a Classic game. */
export const AVAILABILITY: Record<FactionId, VictoryId[]> = {
  concord: ['ascendance', 'economicSupremacy', 'grandAlliance', 'galacticCouncil', 'score'],
  rynkai: ['conquest', 'gloriousCampaign', 'score'],
  varrhen: ['conquest', 'hegemony', 'economicSupremacy', 'grandAlliance', 'galacticCouncil', 'score'],
  krasnyr: ['conquest', 'worldRevolution', 'economicSupremacy', 'grandAlliance', 'galacticCouncil', 'score'],
  lattice: ['conquest', 'singularity', 'economicSupremacy', 'grandAlliance', 'galacticCouncil', 'score'],
};

export type PresetId = 'classic' | 'peaceful' | 'totalWar';

export interface PresetDef {
  name: string;
  text: string;
  /** Great powers in the galaxy. */
  majors: FactionId[];
  /** Victories that count in this preset. */
  victories: VictoryId[];
  /** Extra victories some factions may pursue in this preset. */
  extra?: Partial<Record<FactionId, VictoryId[]>>;
}

const ALL_MAJORS = ['concord', 'rynkai', 'varrhen', 'krasnyr', 'lattice'];
const NON_MILITARY = VICTORY_IDS.filter((v) => VICTORIES[v].family !== 'conquest');
/** Military victories, plus Score so the turn limit still ends the game. */
const MILITARY = VICTORY_IDS.filter((v) => VICTORIES[v].family === 'conquest' || v === 'score');

export const PRESETS: Record<PresetId, PresetDef> = {
  classic: { name: 'Classic', text: 'All five great powers, each with its own ways to win.', majors: ALL_MAJORS, victories: [...VICTORY_IDS] },
  peaceful: {
    name: 'Peaceful', text: 'Four great powers (no Ryn’kai) and no military victories: win by economy, science, diplomacy or revolution.',
    majors: ALL_MAJORS.filter((m) => m !== 'rynkai'), victories: NON_MILITARY,
  },
  totalWar: {
    name: 'Total War', text: 'Military victories only (Conquest, Hegemony, Glorious Campaign), and even the Concord may win by Conquest.',
    majors: ALL_MAJORS, victories: MILITARY, extra: { concord: ['conquest'] },
  },
};

/** Battles the Ryn'kai must win for a Glorious Campaign: 45 on a standard 50×30 map, scaled by map area. */
export function gloriousWinsNeeded(width: number, height: number): number {
  return Math.max(15, Math.round((45 * width * height) / 1500));
}

export const ECONOMIC_SHARE = 0.35;
export const STREAK_TURNS = 10;
export const COUNCIL_EVERY = 20;
export const COUNCIL_SHARE = 2 / 3;
export const DEFAULT_TURN_LIMIT = 200;
