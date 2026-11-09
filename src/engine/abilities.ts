/** Start-of-turn effects of faction abilities that are not part of another system. */
import { hasAbility } from '../data/factions';
import { adjustOpinion } from './agents';
import { systemYield } from './economy';
import { log } from './events';
import { hexDistance } from './hex';
import { atWar, ownedHexes } from './query';
import type { FactionId, GameState } from './types';

export function runMinorAbilities(state: GameState, faction: FactionId): void {
  if (hasAbility(faction, 'raiders')) raid(state, faction);
  if (hasAbility(faction, 'conversion')) convert(state, faction);
}

/** Ghal'tar raiders: fleets in an enemy system skim 10% of its energy and metals. */
function raid(state: GameState, faction: FactionId): void {
  const done = new Set<number>();
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== faction || done.has(f.hex)) continue;
    const h = state.map.hexes[f.hex];
    if (!h.system || !h.owner || !atWar(state, faction, h.owner)) continue;
    done.add(f.hex);
    const y = systemYield(state, f.hex);
    const victim = state.factions[h.owner].stock;
    const e = Math.min(victim.energy, Math.round(y.energy * 0.1 * 10) / 10);
    const m = Math.min(victim.metals, Math.round(y.metals * 0.1 * 10) / 10);
    victim.energy -= e; victim.metals -= m;
    state.factions[faction].stock.energy += e;
    state.factions[faction].stock.metals += m;
    if (e + m > 0) log(state, [h.owner], 'raid', `Raiders are bleeding ${h.system.name}.`, f.hex);
  }
}

/** Vesh missionaries: unrest in nearby foreign systems, and a little goodwill from everyone in contact. */
function convert(state: GameState, faction: FactionId): void {
  const mine = ownedHexes(state, faction);
  state.map.hexes.forEach((h, i) => {
    if (!h.system || !h.owner || h.owner === faction || h.system.development === 0) return;
    if (!mine.some((m) => hexDistance(state.map, m, i) <= 3)) return;
    if (h.system.unrest < 60) h.system.unrest = Math.min(60, h.system.unrest + 5);
  });
  if (state.turn % 5 === 0) {
    for (const other of Object.keys(state.factions)) if (other !== faction) adjustOpinion(state, other, faction, 1);
  }
}
