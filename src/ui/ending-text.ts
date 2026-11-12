/** What the victory or defeat screen says for the person looking at the game (no DOM, so it can be tested). */
import { factionDef } from '../data/factions';
import type { GameState } from '../engine/types';

export interface Ending {
  kind: 'victory' | 'defeat';
  /** The line under the big word: who won, or why you lost. */
  headline: string;
  /** Smaller line: the turn the game ended on. */
  detail: string;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The ending for `viewer`, or null while the game is still going. `shared` is true when several people play on
 * one screen (hot seat): then a win by any of them is a victory for the table, since nobody else will see it.
 */
export function endingOf(g: GameState, viewer: string, shared = false): Ending | null {
  if (!g.winner && !g.over) return null;
  const reason = g.over?.reason ?? '';
  const turn = g.over?.turn ?? g.turn;
  const detail = `Turn ${turn}`;
  const winner = g.winner ? g.factions[g.winner] : null;
  const won = !!winner && (g.winner === viewer || (shared && winner.controller === 'human'));
  if (won) {
    const name = factionDef(g.winner!).name;
    return { kind: 'victory', headline: reason ? `${name} · ${sentence(reason)}` : name, detail };
  }
  const me = g.factions[viewer];
  if (me && !me.alive) return { kind: 'defeat', headline: `${factionDef(viewer).name} has fallen`, detail };
  if (winner) return { kind: 'defeat', headline: `${factionDef(g.winner!).name} wins · ${sentence(reason)}`, detail };
  return { kind: 'defeat', headline: sentence(reason || 'The game is over'), detail };
}
