/** The turn sequence (§2): start-of-turn upkeep, orders, end-of-turn combat and claims, next faction. */
import { advanceAgents, captureAgents } from './agents';
import { repairFleets, resolveCombat } from './combat';
import { checkForcedVassalage, runDiplomacy, updateContacts } from './diplomacy';
import { runEconomy } from './economy';
import { runEspionage } from './espionage';
import { pruneLog } from './events';
import { applyHazards, continuePaths, markClaims, resetMovement, resolveClaims, surveyWithFleets } from './movement';
import { activeFaction } from './query';
import { advanceResearch } from './research';
import type { FactionId, GameState } from './types';
import { checkVictory } from './victory';
import { updateExplored, visibleHexes } from './visibility';

/** Start-of-turn processing for the active faction. */
export function startTurn(state: GameState): void {
  const f = activeFaction(state);
  const fs = state.factions[f];
  state.seq += 1;
  if (fs.flags.demobilizeAt && state.turn >= fs.flags.demobilizeAt) {
    fs.flags.mobilized = 0;
    delete fs.flags.demobilizeAt;
  }
  resolveClaims(state, f);
  runEconomy(state, f);
  runDiplomacy(state, f);
  advanceResearch(state, f);
  resetMovement(state, f);
  repairFleets(state, f);
  advanceAgents(state, f);
  runEspionage(state, f);
  continuePaths(state, f);
  checkForcedVassalage(state, f);
  updateExplored(state, f);
}

/** End-of-turn processing for the active faction, then hands the turn to the next living faction. */
export function endTurn(state: GameState): void {
  if (state.winner) return;
  const f = activeFaction(state);
  resolveCombat(state, f);
  captureAgents(state, f);
  markClaims(state, f);
  surveyWithFleets(state, f);
  applyHazards(state, f);
  const vis = visibleHexes(state, f);
  updateContacts(state, f, vis);
  updateExplored(state, f);
  if (checkVictory(state, false)) return;
  advanceActive(state);
}

function advanceActive(state: GameState): void {
  const n = state.turnOrder.length;
  for (let k = 0; k < n; k++) {
    state.active += 1;
    if (state.active >= n) {
      state.active = 0;
      if (checkVictory(state, true)) return;
      state.turn += 1;
      pruneLog(state);
    }
    if (state.factions[activeFaction(state)].alive) break;
  }
  startTurn(state);
}

export type AiTurn = (state: GameState, faction: FactionId) => void;

/**
 * Plays computer factions until a living human is up (or the game ends). Used after a human ends their turn,
 * so the uploaded state is waiting on the next human.
 */
export function runUntilHuman(state: GameState, ai: AiTurn, maxTurns = 1000): void {
  for (let i = 0; i < maxTurns && !state.winner; i++) {
    const f = state.factions[activeFaction(state)];
    if (f.controller === 'human' && f.alive) return;
    ai(state, f.id);
    endTurn(state);
  }
}

/** Starts a freshly created game: the first faction's start-of-turn runs, then AIs play to the first human. */
export function beginGame(state: GameState, ai: AiTurn): void {
  startTurn(state);
  runUntilHuman(state, ai);
}
