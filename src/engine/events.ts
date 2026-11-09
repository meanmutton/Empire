import type { FactionId, GameState } from './types';

/** Rounds of history kept in the state's event log. */
export const LOG_ROUNDS = 3;

export function log(state: GameState, to: FactionId[], kind: string, text: string, hex?: number): void {
  state.log.push({ turn: state.turn, to, kind, text, ...(hex !== undefined ? { hex } : {}) });
}

export function pruneLog(state: GameState): void {
  const keepFrom = state.turn - LOG_ROUNDS;
  if (state.log.length && state.log[0].turn < keepFrom) state.log = state.log.filter((e) => e.turn >= keepFrom);
}

/** Events a faction may see. */
export function eventsFor(state: GameState, faction: FactionId, sinceTurn = 0): typeof state.log {
  return state.log.filter((e) => e.turn >= sinceTurn && (e.to.length === 0 || e.to.includes(faction)));
}
