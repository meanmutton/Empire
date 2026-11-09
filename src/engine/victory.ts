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

/** Checks every enabled victory condition; sets state.winner. `endOfRound` enables round-based checks. */
export function checkVictory(state: GameState, endOfRound: boolean): FactionId | null {
  if (state.winner) return state.winner;
  const v = state.config.victory;
  const majors = Object.values(state.factions).filter((f) => f.kind === 'major');
  const alive = majors.filter((f) => f.alive);
  const win = (id: FactionId, how: string): FactionId => {
    state.winner = id;
    log(state, [], 'victory', `${factionDef(id).name} wins: ${how}!`);
    return id;
  };
  if (alive.length === 1) return win(alive[0].id, 'last empire standing');

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
    const best = alive.map((f) => ({ id: f.id, s: score(state, f.id) })).sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))[0];
    return win(best.id, `highest score after ${state.config.turnLimit} turns`);
  }
  return null;
}
