/** Armies: loading, unloading and invading systems (§7.3). */
import { design } from '../data/designs';
import { hasAbility, modifiersOf } from '../data/factions';
import { IMPROVEMENTS } from '../data/improvements';
import { log } from './events';
import { atWar } from './query';
import { Rng } from './rng';
import { techEffects } from './research';
import type { FactionId, GameState } from './types';

export type Result = { ok: true; text?: string } | { ok: false; reason: string };

function cargoUsed(state: GameState, shipId: string): number {
  return state.ships[shipId].cargo.length;
}

export function cargoFree(state: GameState, shipId: string): number {
  return design(state.ships[shipId].design).stats.cargo - cargoUsed(state, shipId);
}

/** Loads an army (garrisoned at the fleet's hex) onto a ship in that fleet. */
export function loadArmy(state: GameState, armyId: string, shipId: string): Result {
  const a = state.armies[armyId], s = state.ships[shipId];
  if (!a || !s || a.owner !== s.owner) return { ok: false, reason: 'Pick your own army and ship.' };
  if (a.hex === null) return { ok: false, reason: 'That army is already aboard a ship.' };
  if (state.fleets[s.fleet].hex !== a.hex) return { ok: false, reason: 'The ship must be at the army’s system.' };
  if (cargoFree(state, shipId) <= 0) return { ok: false, reason: 'No cargo space.' };
  a.hex = null;
  a.ship = shipId;
  s.cargo.push(armyId);
  return { ok: true };
}

/** Unloads an army into a friendly system at the ship's hex. */
export function unloadArmy(state: GameState, armyId: string): Result {
  const a = state.armies[armyId];
  if (!a || !a.ship) return { ok: false, reason: 'That army is not aboard a ship.' };
  const s = state.ships[a.ship];
  const hex = state.fleets[s.fleet].hex;
  if (state.map.hexes[hex].owner !== a.owner) return { ok: false, reason: 'Armies can only disembark in your own systems; use Invade otherwise.' };
  s.cargo = s.cargo.filter((c) => c !== armyId);
  a.ship = null;
  a.hex = hex;
  return { ok: true };
}

export function armyStrength(state: GameState, faction: FactionId, base: number, xp: number): number {
  const m = modifiersOf(faction);
  let s = base * (1 + m.army + techEffects(state, faction).army) * (1 + 0.1 * xp);
  if (hasAbility(faction, 'zealots')) s *= 1.5;
  return s;
}

/**
 * Lands every army aboard the fleet onto the system in its hex. The system's planetary defense must be 0.
 * Ground combat runs up to three simultaneous rounds; the defender gets +50%.
 */
export function invade(state: GameState, fleetId: string): Result {
  const f = state.fleets[fleetId];
  if (!f) return { ok: false, reason: 'No such fleet.' };
  const hex = f.hex;
  const h = state.map.hexes[hex];
  const sys = h.system;
  if (!sys || sys.development === 0) return { ok: false, reason: 'There is no settled system here.' };
  if (h.owner === f.owner) return { ok: false, reason: 'You already own this system.' };
  if (h.owner && !atWar(state, f.owner, h.owner)) return { ok: false, reason: 'You must be at war with the owner.' };
  if (sys.defense > 0) return { ok: false, reason: 'Planetary defenses must be knocked out first.' };
  const armies = f.ships.flatMap((sid) => state.ships[sid].cargo).filter((c) => state.armies[c]);
  if (armies.length === 0) return { ok: false, reason: 'This fleet carries no armies.' };

  const rng = new Rng(state.rng);
  const landingBonus = f.ships.some((sid) => design(state.ships[sid].design).role === 'transport') ? 1.2 : 1;
  let attack = armies.reduce((a, id) => a + armyStrength(state, f.owner, state.armies[id].strength, state.armies[id].xp), 0) * landingBonus;
  const defenders = Object.values(state.armies).filter((a) => a.hex === hex && a.owner === h.owner);
  const defOwner = h.owner;
  let defense = sys.garrison + defenders.reduce((a, d) => a + (defOwner ? armyStrength(state, defOwner, d.strength, d.xp) : d.strength), 0);
  defense *= 1.5;
  for (let round = 0; round < 3 && attack > 0 && defense > 0; round++) {
    const ratio = attack / defense;
    const toDef = Math.min(1, 0.5 * Math.pow(ratio, 0.75) * rng.float(0.8, 1.2));
    const toAtt = Math.min(1, 0.5 * Math.pow(1 / ratio, 0.75) * rng.float(0.8, 1.2));
    const nd = defense * (1 - toDef), na = attack * (1 - toAtt);
    defense = nd < 1 ? 0 : nd;
    attack = na < 1 ? 0 : na;
  }
  const name = sys.name;
  const total = armies.reduce((a, id) => a + armyStrength(state, f.owner, state.armies[id].strength, state.armies[id].xp), 0) * landingBonus;
  const survive = total > 0 ? attack / total : 0;
  for (const id of armies) {
    const a = state.armies[id];
    const ship = state.ships[a.ship!];
    ship.cargo = ship.cargo.filter((c) => c !== id);
    a.strength = Math.round(a.strength * survive);
    if (a.strength <= 0 || defense > 0) {
      delete state.armies[id];
    } else {
      a.ship = null;
      a.hex = hex;
      a.xp = Math.min(3, a.xp + 1);
    }
  }
  const to = [f.owner, ...(defOwner ? [defOwner] : [])];
  if (defense > 0) {
    // Defenders hold: garrison and defending armies shrink proportionally.
    const left = defense / 1.5;
    const before = sys.garrison + defenders.reduce((a, d) => a + d.strength, 0);
    const keep = before > 0 ? Math.min(1, left / before) : 0;
    sys.garrison = Math.round(sys.garrison * keep);
    for (const d of defenders) d.strength = Math.max(1, Math.round(d.strength * keep));
    log(state, to, 'invasion', `Invasion of ${name} by ${f.owner} was repelled.`, hex);
    return { ok: true, text: 'The invasion was repelled.' };
  }
  for (const d of defenders) delete state.armies[d.id];
  conquerSystem(state, hex, f.owner);
  log(state, to, 'invasion', `${f.owner} conquered ${name}.`, hex);
  return { ok: true, text: `${name} has fallen.` };
}

/** Transfers a system to a new owner after conquest or defection. */
export function conquerSystem(state: GameState, hex: number, winner: FactionId, keepAll = false): void {
  const h = state.map.hexes[hex];
  const sys = h.system!;
  const loser = h.owner;
  const assimilate = keepAll || hasAbility(winner, 'assimilation');
  if (!assimilate) {
    const rng = new Rng(state.rng);
    sys.improvements = sys.improvements.filter(() => rng.chance(0.5));
    sys.unrest = 50;
  } else {
    sys.unrest = 0;
  }
  sys.queue = [];
  sys.garrison = 5;
  sys.defense = sys.improvements.reduce((a, i) => a + (IMPROVEMENTS[i]?.defense ?? 0), 0);
  h.owner = winner;
  h.pendingClaim = null;
  if (loser && sys.homeOf === loser) relocateHome(state, loser);
}

/** When a faction loses its home system it moves its capital, or is eliminated if it has no systems. */
export function relocateHome(state: GameState, faction: FactionId): void {
  const f = state.factions[faction];
  let best = -1, bestScore = -1;
  state.map.hexes.forEach((h, i) => {
    if (h.owner !== faction || !h.system) return;
    const score = h.system.development * 10 + h.system.population;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  if (best < 0) {
    f.alive = false;
    for (const fl of Object.values(state.fleets)) if (fl.owner === faction) {
      for (const sid of fl.ships) delete state.ships[sid];
      delete state.fleets[fl.id];
    }
    for (const a of Object.values(state.agents)) if (a.owner === faction) delete state.agents[a.id];
    for (const a of Object.values(state.armies)) if (a.owner === faction) delete state.armies[a.id];
    for (const b of Object.values(state.starbases)) if (b.owner === faction) delete state.starbases[b.id];
    state.map.hexes.forEach((h) => { if (h.owner === faction) h.owner = null; });
    log(state, [], 'eliminated', `${faction} has been eliminated.`);
  } else {
    f.home = best;
    log(state, [faction], 'capital', `The capital moved to ${state.map.hexes[best].system!.name}.`, best);
  }
}
