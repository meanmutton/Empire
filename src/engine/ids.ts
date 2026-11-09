import type { GameState } from './types';

/** Allocates a new id unique within this game. */
export function newId(state: GameState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId.toString(36)}`;
}

/** Key for the relation between two factions (order-independent). */
export function relationKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
