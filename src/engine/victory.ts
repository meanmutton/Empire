/** Victory conditions and score (§10). */
import { BALANCE } from '../data/balance';
import { factionDef } from '../data/factions';
import { militaryStrength } from './diplomacy';
import { log } from './events';
import { relation } from './query';
import type { FactionId, GameState } from './types';

export function score(state: GameState, faction: FactionId): number {
  const f = state.factions[faction];
  if (!f.alive) return 0;
  let systems = 0, pop = 0;
  for (const h of state.map.hexes) {
    if (h.owner !== faction || !h.system) continue;
    systems++;
    pop += h.system.population;
  }
  const vassals = Object.values(state.factions).filter((x) => x.overlord === faction).length;
  return Math.round(systems * 10 + pop + f.research.known.length * 5 + militaryStrength(state, faction) / 50 + vassals * 20);
}

function totalSystems(state: GameState): number {
  return state.map.hexes.filter((h) => h.system).length;
}

/** Whether the game has ended (a winner, or an ending without one). */
export function isGameOver(state: GameState): boolean {
  return state.winner !== null || !!state.over;
}

/** The surviving great power with the highest score (ties broken by id), or null if none survive. */
export function leader(state: GameState): FactionId | null {
  const alive = Object.values(state.factions).filter((f) => f.kind === 'major' && f.alive);
  if (alive.length === 0) return null;
  return alive.map((f) => ({ id: f.id, s: score(state, f.id) })).sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))[0].id;
}

/**
 * Checks every enabled victory condition and ends the game when one is met. Returns the winner, or null
 * (the game may still have ended without one: see isGameOver). `endOfRound` enables round-based checks.
 *
 * Endings without the usual victories:
 * - No great power survives: the game ends with no winner.
 * - Every human player has been eliminated: the game ends, won by the leading computer power.
 * - The turn limit is reached: the highest score wins (no winner if no great power survives).
 */
export function checkVictory(state: GameState, endOfRound: boolean): FactionId | null {
  if (isGameOver(state)) return state.winner;
  const v = state.config.victory;
  const majors = Object.values(state.factions).filter((f) => f.kind === 'major');
  const alive = majors.filter((f) => f.alive);
  const win = (id: FactionId, how: string): FactionId => {
    state.winner = id;
    state.over = { reason: how, turn: state.turn };
    log(state, [], 'victory', `${factionDef(id).name} wins: ${how}!`);
    return id;
  };
  const endWithoutWinner = (reason: string): null => {
    state.over = { reason, turn: state.turn };
    log(state, [], 'victory', `The game is over: ${reason}.`);
    return null;
  };
  if (alive.length === 0) return endWithoutWinner('no great power survived, and no empire rules the galaxy');
  if (alive.length === 1) return win(alive[0].id, 'last empire standing');
  const humans = Object.values(state.factions).filter((f) => f.controller === 'human');
  if (humans.length > 0 && humans.every((f) => !f.alive)) return win(leader(state)!, 'every human player has been eliminated');

  for (const f of alive) {
    if (v.ascendance && f.flags.ascensionGate) return win(f.id, 'Technological Ascendance');
    if (v.conquest) {
      const homesHeld = majors.filter((o) => o.id !== f.id).every((o) => {
        if (!o.alive) return true;
        const home = state.map.hexes.findIndex((h) => h.system?.homeOf === o.id);
        return home >= 0 && state.map.hexes[home].owner === f.id;
      });
      if (homesHeld) return win(f.id, 'Conquest');
    }
  }
  if (!endOfRound) return null;

  if (v.domination) {
    const total = totalSystems(state);
    for (const f of alive) {
      const mine = state.map.hexes.filter((h) => h.system && h.owner === f.id).length;
      if (mine >= total * state.config.dominationShare) return win(f.id, 'Domination');
    }
  }
  if (v.alliance) {
    for (const f of alive) {
      const allied = alive.every((o) => o.id === f.id || relation(state, f.id, o.id).status === 'alliance');
      if (!allied) { delete f.flags.allianceSince; continue; }
      f.flags.allianceSince ??= state.turn;
      const mine = state.map.hexes.filter((h) => h.system && h.owner === f.id).length;
      const most = alive.every((o) => state.map.hexes.filter((h) => h.system && h.owner === o.id).length <= mine);
      if (most && state.turn - f.flags.allianceSince >= BALANCE.allianceVictoryTurns) return win(f.id, 'Grand Alliance');
    }
  }
  if (state.config.turnLimit && state.turn >= state.config.turnLimit) {
    const best = leader(state);
    return best ? win(best, `highest score after ${state.config.turnLimit} turns`) : endWithoutWinner(`turn ${state.config.turnLimit} reached with no great power left`);
  }
  return null;
}
