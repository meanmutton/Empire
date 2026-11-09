/** Fog of war: what each faction can see (§11). */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { hasAbility } from '../data/factions';
import { getBit, setBits } from './bitset';
import { hexDistance, hexesWithin } from './hex';
import { friendly } from './query';
import type { FactionId, Fleet, GameState } from './types';

/** Marks hexes around a point as explored. */
export function revealAround(state: GameState, faction: FactionId, hex: number, radius: number): void {
  const f = state.factions[faction];
  f.explored = setBits(f.explored, hexesWithin(state.map, hex, radius));
}

export function isExplored(state: GameState, faction: FactionId, hex: number): boolean {
  return getBit(state.factions[faction].explored, hex);
}

interface Observer { hex: number; range: number; detects: boolean; }

function observers(state: GameState, faction: FactionId): Observer[] {
  const out: Observer[] = [];
  const sides = Object.keys(state.factions).filter((id) => friendly(state, faction, id));
  const side = new Set(sides);
  for (const fl of Object.values(state.fleets)) {
    if (!side.has(fl.owner)) continue;
    let range = 1, detects = false;
    for (const sid of fl.ships) {
      const d = design(state.ships[sid].design);
      range = Math.max(range, d.stats.sensors);
      if (d.role === 'science') detects = true;
    }
    if (state.map.hexes[fl.hex].terrain === 'pulsar') range = Math.max(1, range - 1);
    out.push({ hex: fl.hex, range, detects });
  }
  for (const b of Object.values(state.starbases)) {
    if (!side.has(b.owner)) continue;
    const spec = BALANCE.starbase[b.tier as 1 | 2 | 3];
    out.push({ hex: b.hex, range: spec?.sensors ?? 3, detects: true });
  }
  state.map.hexes.forEach((h, i) => {
    if (!h.owner || !side.has(h.owner)) return;
    if (h.system && h.system.development > 0) out.push({ hex: i, range: 2, detects: false });
    else out.push({ hex: i, range: 1, detects: false });
  });
  return out;
}

/** Hexes the faction (with its allies and vassals) currently sees. */
export function visibleHexes(state: GameState, faction: FactionId): Set<number> {
  const out = new Set<number>();
  for (const o of observers(state, faction)) for (const h of hexesWithin(state.map, o.hex, o.range)) out.add(h);
  return out;
}

/** Whether `faction` can see a particular fleet right now. */
export function canSeeFleet(state: GameState, faction: FactionId, fleet: Fleet, visible?: Set<number>): boolean {
  if (friendly(state, faction, fleet.owner)) return true;
  const vis = visible ?? visibleHexes(state, faction);
  if (!vis.has(fleet.hex)) return false;
  const obs = observers(state, faction);
  const sameHex = obs.some((o) => o.hex === fleet.hex);
  if (sameHex) return true;
  // Nebulae hide fleets from sensors outside the hex.
  if (state.map.hexes[fleet.hex].terrain === 'nebula') return false;
  const stealth = Math.min(...fleet.ships.map((sid) => design(state.ships[sid].design).stats.stealth));
  if (stealth <= 0) return true;
  if (hasAbility(faction, 'tracking') && obs.some((o) => hexDistance(state.map, o.hex, fleet.hex) <= 2)) return true;
  return obs.some((o) => o.detects && hexDistance(state.map, o.hex, fleet.hex) <= o.range);
}

/** Updates a faction's explored map with everything it currently sees. */
export function updateExplored(state: GameState, faction: FactionId): void {
  const f = state.factions[faction];
  f.explored = setBits(f.explored, visibleHexes(state, faction));
}
