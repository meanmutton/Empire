/** Tunable numbers. Change freely during playtesting; tests check behavior, not exact values. */
export const BALANCE = {
  /** Fraction of the stronger side's raw firepower that becomes damage per round (§7.1). */
  combatLethality: 0.32,
  combatRandomLow: 0.8,
  combatRandomHigh: 1.2,
  /** Planetary defense point → attack per round. */
  defenseAttackPerPoint: 1.2,
  maxShipsPerFleet: 6,

  ownedHexEnergy: 0.3,
  disconnectedPenalty: 0.5,
  populationGrowth: 0.05,
  repairFriendly: 0.1,
  repairDock: 0.3,
  negativeEnergyCombatPenalty: 0.25,

  /** Production points per turn a system contributes to its own build queue, by development level. */
  productionByLevel: [0, 2, 4, 7, 11, 16],
  /** Cost to raise a system to development level n (metals, energy). */
  developCost: [
    null,
    { metals: 20, energy: 10, turns: 2 },
    { metals: 40, energy: 20, turns: 3 },
    { metals: 80, energy: 40, turns: 4 },
    { metals: 140, energy: 70, turns: 5 },
    { metals: 220, energy: 110, turns: 6 },
  ] as const,
  /** Yield multiplier by development level. */
  developmentYield: [0, 0.5, 1, 1.4, 1.8, 2.5],

  spy: { metals: 0, energy: 30, upkeep: 1, speed: 3 },
  diplomat: { metals: 0, energy: 25, upkeep: 1, speed: 3 },
  army: { metals: 15, energy: 5, population: 1, strength: 10, upkeep: 0.5 },
  starbase: [
    null,
    { name: 'Outpost Station', metals: 60, energy: 20, hull: 150, defense: 10, sensors: 3 },
    { name: 'Starbase', metals: 150, energy: 60, hull: 400, defense: 30, sensors: 4 },
    { name: 'Citadel', metals: 320, energy: 140, exotics: 20, hull: 900, defense: 70, sensors: 5 },
  ] as const,

  /** Opinion penalty with everyone for breaking a treaty. */
  treatyBreakPenalty: 30,
  diplomatCaptureChance: 0.75,

  startingStock: { energy: 100, metals: 120, exotics: 5 },
  minorStartingStock: { energy: 60, metals: 60, exotics: 0 },
} as const;
