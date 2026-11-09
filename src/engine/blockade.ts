/**
 * Blockades (§7.4). A settled system is blockaded while armed warships of a faction at war with its owner sit
 * in its hex and the owner has no armed ships or starbase there to contest them. A blockaded system produces
 * half as much and its shipyard can't finish ships or armies. Haldane systems (Smugglers) can't be blockaded.
 */
import { design } from '../data/designs';
import { hasAbility } from '../data/factions';
import { atWar } from './query';
import type { FactionId, Fleet, GameState } from './types';

function armed(state: GameState, f: Fleet): boolean {
  return f.ships.some((s) => {
    const st = design(state.ships[s].design).stats;
    return st.energy + st.missile + st.hangar > 0;
  });
}

/** Factions blockading a system, or [] if it isn't blockaded. */
export function blockadersAt(state: GameState, hex: number): FactionId[] {
  const h = state.map.hexes[hex];
  const owner = h.owner;
  if (!owner || !h.system || h.system.development === 0 || hasAbility(owner, 'smugglers')) return [];
  const here = Object.values(state.fleets).filter((f) => f.hex === hex && armed(state, f));
  if (here.some((f) => f.owner === owner)) return [];
  if (Object.values(state.starbases).some((b) => b.hex === hex && b.owner === owner)) return [];
  return [...new Set(here.filter((f) => atWar(state, f.owner, owner)).map((f) => f.owner))];
}

/** Every blockaded system (optionally only those owned by one faction), computed in one pass over fleets. */
export function blockadedHexes(state: GameState, owner?: FactionId): Set<number> {
  const out = new Set<number>();
  const candidates = new Set<number>();
  for (const f of Object.values(state.fleets)) {
    const h = state.map.hexes[f.hex];
    if (h.owner && h.owner !== f.owner && h.system && h.system.development > 0 && (!owner || h.owner === owner)) candidates.add(f.hex);
  }
  for (const hex of candidates) if (blockadersAt(state, hex).length) out.add(hex);
  return out;
}
