/** Fleet movement, battle-group management, territory claims and colonization (§5.3, §6.4). */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { hasAbility } from '../data/factions';
import { PLANET_YIELDS, TERRAIN_INFO } from '../data/improvements';
import { ROLES } from '../data/ships';
import { log } from './events';
import { hexesWithin, neighbors } from './hex';
import { newId } from './ids';
import { findPath, reachable } from './path';
import { atWar, fleetSpeed, friendly } from './query';
import { Rng } from './rng';
import { techEffects } from './research';
import type { FactionId, Fleet, GameState } from './types';
import { revealAround } from './visibility';

export type Result = { ok: true } | { ok: false; reason: string };
const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

/** Movement cost for `faction` to enter `to`. */
export function enterCost(state: GameState, faction: FactionId, to: number): number {
  const t = state.map.hexes[to].terrain;
  const info = TERRAIN_INFO[t];
  if (!info.passable) return Infinity;
  if (hasAbility(faction, 'voidAdapted')) return 1;
  return info.moveCost;
}

/** Wormhole links: a wormhole hex connects to its twin. */
export function wormholeLinks(state: GameState): (hex: number) => number[] {
  return (hex) => {
    const w = state.map.hexes[hex].wormhole;
    return w !== null ? [w] : [];
  };
}

function stepCost(state: GameState, faction: FactionId) {
  return (from: number, to: number) => {
    const fw = state.map.hexes[from].wormhole;
    if (fw === to) return hasAbility(faction, 'wormholeNavigation') || techEffects(state, faction).wormholeFree ? 0 : 1;
    return enterCost(state, faction, to);
  };
}

/** Hostile forces (fleets or starbases at war with `faction`) in a hex. */
export function hostilesAt(state: GameState, faction: FactionId, hex: number): boolean {
  for (const f of Object.values(state.fleets)) if (f.hex === hex && atWar(state, faction, f.owner)) return true;
  for (const b of Object.values(state.starbases)) if (b.hex === hex && atWar(state, faction, b.owner)) return true;
  return false;
}

/** Any non-friendly forces in a hex (blocks claiming). */
export function othersAt(state: GameState, faction: FactionId, hex: number): boolean {
  for (const f of Object.values(state.fleets)) if (f.hex === hex && !friendly(state, faction, f.owner)) return true;
  for (const b of Object.values(state.starbases)) if (b.hex === hex && !friendly(state, faction, b.owner)) return true;
  return false;
}

export function planPath(state: GameState, fleetId: string, dest: number): number[] | null {
  const f = state.fleets[fleetId];
  const r = findPath(state.map, f.hex, dest, stepCost(state, f.owner), wormholeLinks(state));
  return r ? r.path.slice(1) : null;
}

/** Hexes the fleet can reach this turn, with cost. */
export function reachableThisTurn(state: GameState, fleetId: string): Map<number, number> {
  const f = state.fleets[fleetId];
  return reachable(state.map, f.hex, f.movesLeft, stepCost(state, f.owner), wormholeLinks(state));
}

/** Orders a fleet toward `dest`. It moves as far as it can now and keeps the rest of the path for later turns. */
export function moveFleet(state: GameState, fleetId: string, dest: number): Result {
  const f = state.fleets[fleetId];
  if (!f) return fail('No such fleet.');
  if (f.hex === dest) {
    f.path = [];
    return OK;
  }
  const path = planPath(state, fleetId, dest);
  if (!path) return fail('No route.');
  f.path = path;
  advanceFleet(state, fleetId);
  return OK;
}

/** Moves a fleet along its stored path as far as its movement allows. */
export function advanceFleet(state: GameState, fleetId: string): void {
  const f = state.fleets[fleetId];
  const cost = stepCost(state, f.owner);
  while (f.path.length > 0) {
    const next = f.path[0];
    const c = cost(f.hex, next);
    if (!isFinite(c)) {
      f.path = [];
      break;
    }
    if (c > f.movesLeft) break;
    f.movesLeft -= c;
    f.hex = next;
    f.path.shift();
    for (const sid of f.ships) {
      for (const cargo of state.ships[sid].cargo) {
        const ag = state.agents[cargo];
        if (ag) ag.hex = next;
      }
    }
    revealAround(state, f.owner, next, fleetSensors(state, f));
    if (hostilesAt(state, f.owner, next)) {
      f.movesLeft = 0;
      f.path = [];
      break;
    }
  }
}

export function fleetSensors(state: GameState, f: Fleet): number {
  let s = 1;
  for (const sid of f.ships) s = Math.max(s, design(state.ships[sid].design).stats.sensors);
  s += techEffects(state, f.owner).sensors;
  if (state.map.hexes[f.hex].terrain === 'pulsar') s = Math.max(1, s - 1);
  return s;
}

/** Combat ships count toward the battle-group limit; fighters ride free. */
export function groupSize(state: GameState, f: Fleet): number {
  return f.ships.filter((sid) => design(state.ships[sid].design).cls !== 'fighter').length;
}

/** Merges fleet `fromId` into `intoId` (same owner and hex, ≤ 6 ships). */
export function mergeFleets(state: GameState, intoId: string, fromId: string): Result {
  const a = state.fleets[intoId], b = state.fleets[fromId];
  if (!a || !b || a === b) return fail('Pick two fleets.');
  if (a.owner !== b.owner || a.hex !== b.hex) return fail('Fleets must be together.');
  if (groupSize(state, a) + groupSize(state, b) > BALANCE.maxShipsPerFleet) return fail(`A battle group holds at most ${BALANCE.maxShipsPerFleet} ships.`);
  for (const sid of b.ships) state.ships[sid].fleet = a.id;
  a.ships.push(...b.ships);
  a.movesLeft = Math.min(a.movesLeft, b.movesLeft);
  a.path = [];
  delete state.fleets[b.id];
  return OK;
}

/** Splits ships off into a new fleet in the same hex. Returns the new fleet id. */
export function splitFleet(state: GameState, fleetId: string, shipIds: string[]): string | null {
  const f = state.fleets[fleetId];
  if (!f || shipIds.length === 0 || shipIds.length >= f.ships.length) return null;
  if (!shipIds.every((s) => f.ships.includes(s))) return null;
  const id = newId(state, 'f');
  const first = state.ships[shipIds[0]];
  state.fleets[id] = {
    id, owner: f.owner, name: design(first.design).name, hex: f.hex, ships: [...shipIds],
    movesLeft: f.movesLeft, path: [], doctrine: f.doctrine,
  };
  f.ships = f.ships.filter((s) => !shipIds.includes(s));
  for (const s of shipIds) state.ships[s].fleet = id;
  return id;
}

/** Removes a ship; deletes its fleet if empty, and anything aboard. */
export function removeShip(state: GameState, shipId: string): void {
  const s = state.ships[shipId];
  if (!s) return;
  const f = state.fleets[s.fleet];
  if (f) {
    f.ships = f.ships.filter((x) => x !== shipId);
    if (f.ships.length === 0) delete state.fleets[f.id];
  }
  for (const c of s.cargo) {
    delete state.armies[c];
    delete state.agents[c];
  }
  delete state.ships[shipId];
}

/** Resets movement at the start of a faction's turn. */
export function resetMovement(state: GameState, faction: FactionId): void {
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== faction) continue;
    let speed = fleetSpeed(state, f.id);
    if (hasAbility(faction, 'lightningWar') && state.turn <= (state.factions[faction].flags.lightningUntil ?? 0)) speed += 1;
    f.movesLeft = speed;
  }
}

/** Continues multi-turn paths at the start of a turn. */
export function continuePaths(state: GameState, faction: FactionId): void {
  for (const f of Object.values(state.fleets)) if (f.owner === faction && f.path.length > 0) advanceFleet(state, f.id);
}

// ---------------------------------------------------------------------------------------------------------
// Territory claims (§5.3)

/**
 * Whether `faction` may claim a hex it is sitting in. Only empty hexes are taken by presence: open space
 * and unsettled star systems. Settled planets (any development) must be invaded with armies, and an enemy
 * starbase must be destroyed first (it counts as a non-friendly force in the hex).
 */
export function canClaim(state: GameState, faction: FactionId, hex: number): boolean {
  const h = state.map.hexes[hex];
  if (h.owner === faction) return false;
  if (h.owner && !atWar(state, faction, h.owner)) return false;
  if (h.terrain === 'blackHole') return false;
  if (othersAt(state, faction, hex)) return false;
  if (h.system && h.system.development > 0) return false;
  return true;
}

/** End of turn: mark hexes this faction holds alone as pending claims. */
export function markClaims(state: GameState, faction: FactionId): void {
  const occupied = new Set<number>();
  for (const f of Object.values(state.fleets)) if (f.owner === faction) occupied.add(f.hex);
  for (const hex of occupied) {
    if (canClaim(state, faction, hex)) state.map.hexes[hex].pendingClaim = faction;
  }
}

/** Start of turn: pending claims that are still held become territory. Returns claimed hexes. */
export function resolveClaims(state: GameState, faction: FactionId): number[] {
  const claimed: number[] = [];
  const present = new Set<number>();
  for (const f of Object.values(state.fleets)) if (f.owner === faction) present.add(f.hex);
  state.map.hexes.forEach((h, i) => {
    if (h.pendingClaim !== faction) return;
    h.pendingClaim = null;
    if (!present.has(i) || !canClaim(state, faction, i)) return;
    const prev = h.owner;
    h.owner = faction;
    claimed.push(i);
    if (h.system && prev && prev !== faction) {
      h.system.queue = [];
      log(state, [faction, prev], 'captured', `${h.system.name} taken by ${faction} from ${prev}.`, i);
    }
  });
  return claimed;
}

/** Largest pocket of empty space that is taken over automatically when a faction's territory surrounds it. */
export const MAX_ENCLOSED = 60;

/**
 * Start of turn: empty space completely surrounded by this faction's territory joins it (§5.3). A pocket
 * counts when every hex bordering it belongs to the faction and it doesn't touch the edge of the map. Within
 * it, hexes with a settled independent world, a black hole, or someone else's ships stay unclaimed.
 */
export function claimEnclosed(state: GameState, faction: FactionId): number[] {
  const hexes = state.map.hexes;
  const seen = new Uint8Array(hexes.length);
  const claimed: number[] = [];
  for (let start = 0; start < hexes.length; start++) {
    if (seen[start] || hexes[start].owner) continue;
    // Flood-fill this pocket of unowned hexes.
    const pocket: number[] = [];
    const stack = [start];
    seen[start] = 1;
    let enclosed = true;
    while (stack.length) {
      const h = stack.pop()!;
      pocket.push(h);
      const ns = neighbors(state.map, h);
      if (ns.length < 6) enclosed = false; // touches the edge of the map
      for (const n of ns) {
        const o = hexes[n].owner;
        if (o) { if (o !== faction) enclosed = false; continue; }
        if (!seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    if (!enclosed || pocket.length > MAX_ENCLOSED) continue;
    for (const h of pocket) {
      const x = hexes[h];
      if (x.terrain === 'blackHole' || (x.system && x.system.development > 0) || othersAt(state, faction, h)) continue;
      x.owner = faction;
      x.pendingClaim = null;
      claimed.push(h);
    }
  }
  if (claimed.length) log(state, [faction], 'claim', `${claimed.length} hex${claimed.length > 1 ? 'es' : ''} of empty space surrounded by your territory joined your empire.`, claimed[0]);
  return claimed;
}

// ---------------------------------------------------------------------------------------------------------
// Colonization and construction

function findShipWith(state: GameState, fleetId: string, test: (role: string) => boolean): string | null {
  const f = state.fleets[fleetId];
  for (const sid of f.ships) if (test(design(state.ships[sid].design).role)) return sid;
  return null;
}

function colonizable(state: GameState, faction: FactionId, hex: number): Result {
  const h = state.map.hexes[hex];
  if (!h.system) return fail('There is no star system here.');
  if (h.system.development > 0) return fail('This system is already settled.');
  if (h.owner && h.owner !== faction) return fail('Another faction owns this hex.');
  if (othersAt(state, faction, hex)) return fail('Enemies are present.');
  return OK;
}

/** A colony ship founds a colony (level 2 on habitable worlds, else an outpost) and is consumed. */
export function colonize(state: GameState, fleetId: string): Result {
  const f = state.fleets[fleetId];
  if (!f) return fail('No such fleet.');
  const sid = findShipWith(state, fleetId, (r) => ROLES[r as keyof typeof ROLES].colonize === true);
  if (!sid) return fail('This fleet has no colony ship.');
  const ok = colonizable(state, f.owner, f.hex);
  if (!ok.ok) return ok;
  const h = state.map.hexes[f.hex];
  const sys = h.system!;
  const habitable = PLANET_YIELDS[sys.planet].popCap >= 4;
  sys.development = habitable ? 2 : 1;
  sys.population = habitable ? 2 : PLANET_YIELDS[sys.planet].popCap > 0 ? 1 : 0;
  sys.garrison = Math.max(sys.garrison, 5);
  h.owner = f.owner;
  h.pendingClaim = null;
  if (sys.ruins) surveyRuins(state, f.owner, f.hex);
  removeShip(state, sid);
  log(state, [f.owner], 'colonized', `Colony founded at ${sys.name}.`, f.hex);
  return OK;
}

export const OUTPOST_COST = { metals: 30, energy: 10 };

/** A constructor founds an outpost (level 1). The constructor survives but spends its turn. */
export function buildOutpost(state: GameState, fleetId: string): Result {
  const f = state.fleets[fleetId];
  if (!f) return fail('No such fleet.');
  const sid = findShipWith(state, fleetId, (r) => ROLES[r as keyof typeof ROLES].construct === true);
  if (!sid) return fail('This fleet has no constructor.');
  if (f.movesLeft <= 0) return fail('The constructor has already moved this turn.');
  const ok = colonizable(state, f.owner, f.hex);
  if (!ok.ok) return ok;
  const stock = state.factions[f.owner].stock;
  if (stock.metals < OUTPOST_COST.metals || stock.energy < OUTPOST_COST.energy) return fail('Not enough resources.');
  stock.metals -= OUTPOST_COST.metals;
  stock.energy -= OUTPOST_COST.energy;
  const h = state.map.hexes[f.hex];
  h.system!.development = 1;
  h.owner = f.owner;
  h.pendingClaim = null;
  f.movesLeft = 0;
  if (h.system!.ruins) surveyRuins(state, f.owner, f.hex);
  log(state, [f.owner], 'colonized', `Outpost founded at ${h.system!.name}.`, f.hex);
  return OK;
}

/** A constructor builds or upgrades a starbase in an owned hex. */
export function buildStarbase(state: GameState, fleetId: string): Result {
  const f = state.fleets[fleetId];
  if (!f) return fail('No such fleet.');
  const sid = findShipWith(state, fleetId, (r) => ROLES[r as keyof typeof ROLES].construct === true);
  if (!sid) return fail('This fleet has no constructor.');
  if (f.movesLeft <= 0) return fail('The constructor has already moved this turn.');
  if (state.map.hexes[f.hex].owner !== f.owner) return fail('Starbases must be built in your territory.');
  const existing = Object.values(state.starbases).find((b) => b.hex === f.hex);
  if (existing && existing.owner !== f.owner) return fail('Another starbase is here.');
  const tier = (existing?.tier ?? 0) + 1;
  const spec = BALANCE.starbase[tier as 1 | 2 | 3];
  if (!spec) return fail('Already a Citadel.');
  const tech = tier === 1 ? 'starbase1' : tier === 2 ? 'starbase2' : 'starbase3';
  if (!state.factions[f.owner].research.known.includes(tech)) return fail(`Needs ${tech}.`);
  const stock = state.factions[f.owner].stock;
  const ex = 'exotics' in spec ? spec.exotics : 0;
  if (stock.metals < spec.metals || stock.energy < spec.energy || stock.exotics < ex) return fail('Not enough resources.');
  stock.metals -= spec.metals;
  stock.energy -= spec.energy;
  stock.exotics -= ex;
  if (existing) {
    existing.tier = tier;
    existing.hull = spec.hull;
  } else {
    const id = newId(state, 'b');
    state.starbases[id] = { id, owner: f.owner, hex: f.hex, tier, hull: spec.hull };
  }
  f.movesLeft = 0;
  log(state, [f.owner], 'built', `${spec.name} completed.`, f.hex);
  return OK;
}

/** Survey rewards from ancient ruins (§4.2). */
export function surveyRuins(state: GameState, faction: FactionId, hex: number): void {
  const sys = state.map.hexes[hex].system;
  if (!sys?.ruins) return;
  sys.ruins = false;
  const f = state.factions[faction];
  const roll = new Rng(state.rng).int(3);
  if (roll === 0) {
    f.research.progress += 60;
    log(state, [faction], 'ruins', `Ancient archives at ${sys.name} yield 60 science.`, hex);
  } else if (roll === 1) {
    f.stock.metals += 80;
    f.stock.exotics += 10;
    log(state, [faction], 'ruins', `Salvage at ${sys.name}: 80 metals and 10 exotics.`, hex);
  } else {
    f.stock.energy += 100;
    log(state, [faction], 'ruins', `A dormant power core at ${sys.name} gives 100 energy.`, hex);
  }
}

/** Survey-capable ships (Deep Exploration, Science) passing ruins at the end of a turn survey them. */
export function surveyWithFleets(state: GameState, faction: FactionId): void {
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== faction) continue;
    const sys = state.map.hexes[f.hex].system;
    if (!sys?.ruins) continue;
    if (findShipWith(state, f.id, (r) => ROLES[r as keyof typeof ROLES].survey === true)) {
      surveyRuins(state, faction, f.hex);
      if (hasAbility(faction, 'pathfinders')) state.factions[faction].research.progress += 25;
    }
  }
}

/** Hazard damage at end of turn (neutron stars). */
export function applyHazards(state: GameState, faction: FactionId): void {
  if (hasAbility(faction, 'voidAdapted')) return;
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== faction || state.map.hexes[f.hex].terrain !== 'neutronStar') continue;
    for (const sid of [...f.ships]) {
      const s = state.ships[sid];
      const d = design(s.design);
      if (ROLES[d.role].hazardProof) continue;
      s.hull = Math.max(1, Math.round(s.hull - d.stats.hull * 0.05));
    }
  }
}

export { hexesWithin };
