/**
 * Combat doctrines (§7.2): standing orders a fleet follows during a battle. Battles run without human input,
 * so the doctrine is how a player steers them: when to withdraw, how much to trade defense for offense, and
 * which range to fight at.
 */

export const DOCTRINE_IDS = ['fullAttack', 'engage', 'cautious', 'holdLine', 'hitAndRun', 'retreat'] as const;
export type DoctrineId = (typeof DOCTRINE_IDS)[number];

/** Engagement range bands a battle moves through. */
export const RANGES = ['long', 'medium', 'close'] as const;
export type RangeBand = (typeof RANGES)[number];

export interface DoctrineDef {
  name: string;
  text: string;
  /** Multiplier on this fleet's fire. */
  attack: number;
  /** Multiplier on damage this fleet takes (below 1 is safer). */
  exposure: number;
  /** Withdraw once this fraction of the fleet's starting strength is gone (null: never on losses). */
  withdrawAt: number | null;
  /** Withdraw after this many combat rounds whatever happens (hit and run). */
  withdrawAfter?: number;
  /** Also withdraw when the enemy is this many times stronger after the opening round. */
  withdrawIfOutmatched?: number;
  /** Never withdraws while guarding a friendly system (planet or starbase of its side in the hex). */
  standsAtHome?: boolean;
  /** Range this fleet tries to fight at; 'auto' picks the best range for its weapons. */
  range: RangeBand | 'auto';
  /** Targeting: prefer support ships (transports, cargo, colony ships, constructors, carriers). */
  huntsSupport?: boolean;
  /** Escorts in this fleet draw extra fire away from the others. */
  screens?: boolean;
  /** Starts fights with independent defenders (and so may be attacked by them). */
  provokes: boolean;
}

export const DOCTRINES: Record<DoctrineId, DoctrineDef> = {
  fullAttack: {
    name: 'Full Attack', range: 'close', attack: 1.25, exposure: 1.25, withdrawAt: null, provokes: true,
    text: 'Close in and fight to the end. Hits much harder and takes more damage in return. Never withdraws.',
  },
  engage: {
    name: 'Engage', range: 'auto', attack: 1, exposure: 1, withdrawAt: 0.5, provokes: true,
    text: 'The standard battle line. Fights at the range that suits its weapons and withdraws after losing half its strength.',
  },
  cautious: {
    name: 'Cautious', range: 'long', attack: 0.8, exposure: 0.75, withdrawAt: 0.25, withdrawIfOutmatched: 1.5, provokes: true,
    text: 'Keeps its distance and protects its ships. Hits softer, takes much less damage, and withdraws early: after a quarter of its strength is gone, or at once if the enemy proves 1.5× stronger.',
  },
  holdLine: {
    name: 'Hold the Line', range: 'medium', attack: 0.9, exposure: 0.85, withdrawAt: 0.5, standsAtHome: true, screens: true, provokes: false,
    text: 'Defensive formation. Escorts shield the other ships, and it never withdraws while guarding one of your systems or starbases. Elsewhere it withdraws at half strength. Does not pick fights with independent worlds.',
  },
  hitAndRun: {
    name: 'Hit and Run', range: 'long', attack: 1.1, exposure: 1, withdrawAt: 0.2, withdrawAfter: 2, huntsSupport: true, provokes: true,
    text: 'Strikes from long range at transports, cargo and support ships for two combat rounds, then pulls out (sooner if it loses a fifth of its strength). Fast ships get away cleanly.',
  },
  retreat: {
    name: 'Retreat', range: 'long', attack: 0.4, exposure: 0.9, withdrawAt: 0, provokes: false,
    text: 'Avoid battle: breaks away at the first chance and fires only to cover its escape. The default for unarmed ships.',
  },
};

/** Weapon effectiveness by range: beams like it close, missiles and fighters at a distance. */
export const RANGE_MODS: Record<RangeBand, { beam: number; missile: number; fighter: number; name: string }> = {
  long: { name: 'long range', beam: 0.55, missile: 1.1, fighter: 1.1 },
  medium: { name: 'medium range', beam: 0.9, missile: 0.95, fighter: 1 },
  close: { name: 'close quarters', beam: 1.25, missile: 0.65, fighter: 0.85 },
};

export const MIN_COMBAT_ROUNDS = 3;
export const MAX_COMBAT_ROUNDS = 10;
export const DEFAULT_COMBAT_ROUNDS = 5;
