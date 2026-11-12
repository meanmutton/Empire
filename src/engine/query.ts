/** Read-only helpers over the game state. */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { CLASSES } from '../data/ships';
import { techEffects } from './research';
import { relationKey } from './ids';
import { neighbors } from './hex';
import type { FactionId, GameState, Relation, RelationStatus } from './types';

export function relation(state: GameState, a: FactionId, b: FactionId): Relation {
  const r = state.relations[relationKey(a, b)];
  if (!r) throw new Error(`No relation ${a}/${b}`);
  return r;
}

export function statusBetween(state: GameState, a: FactionId, b: FactionId): RelationStatus {
  if (a === b) return 'alliance';
  return relation(state, a, b).status;
}

export function atWar(state: GameState, a: FactionId, b: FactionId): boolean {
  return a !== b && statusBetween(state, a, b) === 'war';
}

/** Factions on the same side: self, allies, overlord/vassals. */
export function friendly(state: GameState, a: FactionId, b: FactionId): boolean {
  if (a === b) return true;
  if (statusBetween(state, a, b) === 'alliance') return true;
  const fa = state.factions[a], fb = state.factions[b];
  return fa.overlord === b || fb.overlord === a || (fa.overlord !== null && fa.overlord === fb.overlord);
}

export function activeFaction(state: GameState): FactionId {
  return state.turnOrder[state.active];
}

export function fleetsAt(state: GameState, hex: number): string[] {
  return Object.values(state.fleets).filter((f) => f.hex === hex).map((f) => f.id);
}

export function ownedHexes(state: GameState, faction: FactionId): number[] {
  const out: number[] = [];
  state.map.hexes.forEach((h, i) => { if (h.owner === faction) out.push(i); });
  return out;
}

export function ownedSystems(state: GameState, faction: FactionId): number[] {
  const out: number[] = [];
  state.map.hexes.forEach((h, i) => { if (h.owner === faction && h.system) out.push(i); });
  return out;
}

/**
 * The hex at the other end of a wormhole in `hex`, when `faction` owns both ends: territory is connected through
 * a wormhole its owner holds at both ends, as if the two hexes were neighbours. Null otherwise.
 */
export function ownedWormholeTwin(state: GameState, faction: FactionId, hex: number): number | null {
  const twin = state.map.hexes[hex].wormhole;
  return twin !== null && state.map.hexes[hex].owner === faction && state.map.hexes[twin].owner === faction ? twin : null;
}

/** Owned hexes connected to the faction's home through a chain of owned hexes (and wormholes it holds at both ends). */
export function connectedHexes(state: GameState, faction: FactionId): Set<number> {
  const home = state.factions[faction].home;
  const seen = new Set<number>();
  if (state.map.hexes[home].owner !== faction) return seen;
  const stack = [home];
  seen.add(home);
  while (stack.length) {
    const h = stack.pop()!;
    const link = ownedWormholeTwin(state, faction, h);
    for (const n of link === null ? neighbors(state.map, h) : [...neighbors(state.map, h), link]) {
      if (!seen.has(n) && state.map.hexes[n].owner === faction) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

export function fleetSpeed(state: GameState, fleetId: string): number {
  const f = state.fleets[fleetId];
  const te = techEffects(state, f.owner);
  let speed = Infinity;
  for (const sid of f.ships) {
    const d = design(state.ships[sid].design);
    if (d.cls === 'fighter') continue;
    const small = CLASSES[d.cls].size <= CLASSES.frigate.size ? te.smallShipSpeed : 0;
    // Crippled ships (under a quarter hull) limp along one hex slower.
    const crippled = state.ships[sid].hull < d.stats.hull * BALANCE.combat.crippledAt ? 1 : 0;
    speed = Math.min(speed, Math.max(1, d.stats.speed + te.speed + small - crippled));
  }
  return isFinite(speed) ? speed : 0;
}

export function shipsOf(state: GameState, faction: FactionId): string[] {
  return Object.values(state.ships).filter((s) => s.owner === faction).map((s) => s.id);
}
