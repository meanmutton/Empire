/** Fleet movement, battle-group management, territory claims and colonization (§5.3, §6.4). */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { factionDef, hasAbility } from '../data/factions';
import { PLANET_YIELDS, TERRAIN_INFO } from '../data/improvements';
import { ROLES } from '../data/ships';
import { log } from './events';
import { hexesWithin, neighbors } from './hex';
import { newId } from './ids';
import { findPath, reachable } from './path';
import { atWar, fleetSpeed, friendly, ownedWormholeTwin } from './query';
import { Rng } from './rng';
import { techEffects } from './research';
import type { FactionId, Fleet, GameState } from './types';
import { outpostRange, revealAround } from './visibility';

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

/** Movement a jump through a wormhole costs `faction`: 1, or nothing with Wormhole Navigation or Stabilization. */
export function wormholeCost(state: GameState, faction: FactionId): number {
  return hasAbility(faction, 'wormholeNavigation') || techEffects(state, faction).wormholeFree ? 0 : 1;
}

/** The hex at the other end of the wormhole this hex holds, or null if it holds none. */
export function wormholeExit(state: GameState, hex: number): number | null {
  return state.map.hexes[hex].wormhole;
}

function stepCost(state: GameState, faction: FactionId) {
  return (from: number, to: number) => {
    const fw = state.map.hexes[from].wormhole;
    if (fw === to) return wormholeCost(state, faction);
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
  delete f.hold;
  leaveReserve(state, f);
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
  const name = shipIds.some((s) => isWarship(design(state.ships[s].design))) ? nextFleetName(state, f.owner) : design(first.design).name;
  state.fleets[id] = {
    id, owner: f.owner, name, hex: f.hex, ships: [...shipIds],
    movesLeft: f.movesLeft, path: [], doctrine: f.doctrine,
  };
  f.ships = f.ships.filter((s) => !shipIds.includes(s));
  for (const s of shipIds) state.ships[s].fleet = id;
  return id;
}

const SUPPORT_ROLES = new Set(['scout', 'explore', 'science', 'cargo', 'colony', 'constructor', 'transport']);

/** Warships fight; support ships (scouts, colony ships, constructors, transports…) do other jobs. */
export function isWarship(d: { role: string; stats: { energy: number; missile: number; hangar: number } }): boolean {
  return !SUPPORT_ROLES.has(d.role) && d.stats.energy + d.stats.missile + d.stats.hangar > 0;
}

/** "1st Fleet", "2nd Fleet", …: the next numbered fleet name for a faction. */
export function nextFleetName(state: GameState, faction: FactionId): string {
  const flags = state.factions[faction].flags;
  const n = (flags.fleetSeq ?? 0) + 1;
  flags.fleetSeq = n;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix} Fleet`;
}

/** A shipyard's reserve leaves reserve duty (and takes a numbered name) once it is sent somewhere. */
function leaveReserve(state: GameState, f: Fleet): void {
  if (!f.reserve) return;
  delete f.reserve;
  if (f.name.endsWith(' Reserve')) f.name = nextFleetName(state, f.owner);
}

/** Moves some ships of one fleet into another fleet in the same hex (all of them merges the two). */
export function transferShips(state: GameState, fromId: string, toId: string, shipIds: string[]): Result {
  const from = state.fleets[fromId], to = state.fleets[toId];
  if (!from || !to || from === to) return fail('Pick two fleets.');
  if (from.owner !== to.owner || from.hex !== to.hex) return fail('Fleets must be together.');
  if (shipIds.length === 0 || !shipIds.every((s) => from.ships.includes(s))) return fail('Pick ships from the fleet.');
  const moving = shipIds.filter((s) => design(state.ships[s].design).cls !== 'fighter').length;
  if (groupSize(state, to) + moving > BALANCE.maxShipsPerFleet) return fail(`A battle group holds at most ${BALANCE.maxShipsPerFleet} ships.`);
  if (shipIds.length === from.ships.length) return mergeFleets(state, toId, fromId);
  const split = splitFleet(state, fromId, shipIds)!;
  return mergeFleets(state, toId, split);
}

/**
 * Packs a faction's fleets in a hex into as few battle groups as possible (up to 6 ships each), biggest
 * first. Warships go with warships and support ships (scouts, colony ships, transports…) with their own
 * kind, so a scout isn't slowed by a battleship or a colony ship dragged into battle. Returns how many
 * fleets were folded into others.
 */
export function combineFleets(state: GameState, faction: FactionId, hex: number): number {
  const SUPPORT = new Set(['scout', 'explore', 'science', 'cargo', 'colony', 'constructor', 'transport']);
  const armed = (f: Fleet) => f.ships.some((s) => { const d = design(state.ships[s].design); return !SUPPORT.has(d.role) && d.stats.energy + d.stats.missile + d.stats.hangar > 0; });
  const fleets = Object.values(state.fleets).filter((f) => f.owner === faction && f.hex === hex)
    .sort((a, b) => groupSize(state, b) - groupSize(state, a) || a.id.localeCompare(b.id));
  const groups: Fleet[] = [];
  let merged = 0;
  for (const f of fleets) {
    const into = groups.find((g) => armed(g) === armed(f) && groupSize(state, g) + groupSize(state, f) <= BALANCE.maxShipsPerFleet);
    if (into && mergeFleets(state, into.id, f.id).ok) merged++;
    else groups.push(f);
  }
  return merged;
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

/** Continues multi-turn paths at the end of a faction's turn, with the movement each fleet has left. */
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
  if (h.outpost) return false;
  return true;
}

/**
 * Why `faction`'s ships in `hex` will not take it, in plain words, or null if they will (or it is already
 * theirs). Shown in the hex panel so players know why a hex isn't changing hands.
 */
export function claimBlocker(state: GameState, faction: FactionId, hex: number): string | null {
  const h = state.map.hexes[hex];
  if (h.owner === faction) return null;
  if (h.terrain === 'blackHole') return 'Black holes can’t be claimed.';
  if (h.owner && !atWar(state, faction, h.owner)) return 'Someone else owns this hex: you can only take territory from a power you are at war with.';
  if (h.system && h.system.development > 0) return 'A settled world can’t be taken by ships alone: bring down its planetary defense, then invade with armies carried by transports.';
  if (othersAt(state, faction, hex)) return 'Another power’s ships or starbase are here: ships claim a hex only when they hold it alone.';
  if (h.outpost && !hasWarshipAt(state, faction, hex)) return 'An outpost holds this hex: bring warships to destroy it first (they do at the end of your turn).';
  return null;
}

/** Turns an owner's cut-off territory (no planet, outpost or starbase connected to it) lasts before it changes hands. */
export const ORPHAN_TURNS = 10;

/** Whether this hex anchors its owner's territory: a settled world, an outpost or one of the owner's starbases. */
function anchors(state: GameState, hex: number): boolean {
  const h = state.map.hexes[hex];
  if (!h.owner) return false;
  if ((h.system?.development ?? 0) > 0 || h.outpost) return true;
  return Object.values(state.starbases).some((b) => b.hex === hex && b.owner === h.owner);
}

/** The connected piece of its owner's territory a hex belongs to, and whether a world, outpost or starbase anchors it. */
export function territoryPiece(state: GameState, hex: number): { hexes: number[]; anchored: boolean } {
  const hexes = state.map.hexes;
  const owner = hexes[hex].owner;
  if (!owner) return { hexes: [], anchored: false };
  const seen = new Set([hex]);
  const stack = [hex];
  const part: number[] = [];
  let anchored = false;
  while (stack.length) {
    const i = stack.pop()!;
    part.push(i);
    if (!anchored && anchors(state, i)) anchored = true;
    const link = ownedWormholeTwin(state, owner, i);
    for (const n of link === null ? neighbors(state.map, i) : [...neighbors(state.map, i), link]) if (!seen.has(n) && hexes[n].owner === owner) { seen.add(n); stack.push(n); }
  }
  return { hexes: part, anchored };
}

/**
 * The power that completely engulfs a piece of territory: every hex bordering it belongs to that one power and
 * the piece doesn't touch the edge of the map. Null when no single power surrounds it.
 */
export function engulfer(state: GameState, part: number[]): FactionId | null {
  const hexes = state.map.hexes;
  const inPart = new Set(part);
  let heir: FactionId | null = null;
  for (const i of part) {
    const ns = neighbors(state.map, i);
    if (ns.length < 6) return null; // touches the edge of the map
    for (const n of ns) {
      if (inPart.has(n)) continue;
      const o = hexes[n].owner;
      if (!o || (heir && o !== heir)) return null;
      heir = o;
    }
  }
  return heir;
}

/**
 * Start of a faction's turn: its territory that has had no planet, outpost or starbase connected to it for
 * ORPHAN_TURNS turns passes to the power that completely engulfs it. Territory not surrounded by a single
 * power stays where it is. Hexes where the owner still has ships, and settled worlds, never change hands
 * this way.
 */
export function releaseOrphans(state: GameState, faction: FactionId): number[] {
  const hexes = state.map.hexes;
  const seen = new Uint8Array(hexes.length);
  const moved: number[] = [];
  for (let start = 0; start < hexes.length; start++) {
    if (seen[start] || hexes[start].owner !== faction) continue;
    const { hexes: part, anchored } = territoryPiece(state, start);
    for (const i of part) seen[i] = 1;
    if (anchored) { for (const i of part) delete hexes[i].orphanSince; continue; }
    const since = Math.min(...part.map((i) => hexes[i].orphanSince ?? state.turn));
    for (const i of part) hexes[i].orphanSince = since;
    if (state.turn - since < ORPHAN_TURNS) continue;
    const heir = engulfer(state, part);
    if (!heir) continue;
    const held = new Set(Object.values(state.fleets).filter((f) => f.owner === faction).map((f) => f.hex));
    const changed: number[] = [];
    for (const i of part) {
      if (held.has(i) || hexes[i].system?.development) continue;
      hexes[i].owner = heir;
      hexes[i].pendingClaim = null;
      delete hexes[i].orphanSince;
      changed.push(i);
    }
    if (!changed.length) continue;
    moved.push(...changed);
    const n = changed.length;
    log(state, [faction, heir], 'claim',
      `${n} hex${n > 1 ? 'es' : ''} of ${factionDef(faction).short} territory, cut off for ${ORPHAN_TURNS} turns and completely surrounded by the ${factionDef(heir).short}, passed to them.`, changed[0]);
  }
  return moved;
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

/** A colony ship founds a colony (level 2 on habitable worlds, else a level-1 foothold) and is consumed. */
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

/**
 * Why a constructor in this hex can't build an outpost here, or null if it can. Outposts go in your own
 * territory or unclaimed space, one per hex, never in a black hole or beside non-allied forces.
 */
export function outpostBlocker(state: GameState, faction: FactionId, hex: number): string | null {
  const h = state.map.hexes[hex];
  if (h.terrain === 'blackHole') return 'Nothing can be built in a black hole.';
  if (h.outpost) return 'There is already an outpost here.';
  if (h.owner && h.owner !== faction) return 'Outposts go in your own territory or unclaimed space.';
  if (othersAt(state, faction, hex)) return 'Another power’s forces are here.';
  return null;
}

/**
 * A constructor builds an outpost: a monitoring post that claims the hex at once, holds it (it keeps cut-off
 * territory connected and stops claims until warships destroy it) and watches as far as the faction's scouts
 * see. It has no economy of its own. The constructor survives but spends its turn.
 */
export function buildOutpost(state: GameState, fleetId: string): Result {
  const f = state.fleets[fleetId];
  if (!f) return fail('No such fleet.');
  const sid = findShipWith(state, fleetId, (r) => ROLES[r as keyof typeof ROLES].construct === true);
  if (!sid) return fail('This fleet has no constructor.');
  if (f.movesLeft <= 0) return fail('The constructor has already moved this turn.');
  const why = outpostBlocker(state, f.owner, f.hex);
  if (why) return fail(why);
  const stock = state.factions[f.owner].stock;
  if (stock.metals < OUTPOST_COST.metals || stock.energy < OUTPOST_COST.energy) return fail('Not enough resources.');
  stock.metals -= OUTPOST_COST.metals;
  stock.energy -= OUTPOST_COST.energy;
  const h = state.map.hexes[f.hex];
  h.outpost = true;
  h.owner = f.owner;
  h.pendingClaim = null;
  delete h.orphanSince;
  f.movesLeft = 0;
  revealAround(state, f.owner, f.hex, outpostRange(state, f.owner));
  if (h.system?.ruins) surveyRuins(state, f.owner, f.hex);
  log(state, [f.owner], 'colonized', `Outpost built${h.system ? ` at ${h.system.name}` : ''}.`, f.hex);
  return OK;
}

/** Whether `faction` has an armed warship in the hex. */
function hasWarshipAt(state: GameState, faction: FactionId, hex: number): boolean {
  return Object.values(state.fleets).some((f) => f.owner === faction && f.hex === hex && f.ships.some((s) => isWarship(design(state.ships[s].design))));
}

/**
 * End of turn, after battles: this faction's warships destroy the outposts of powers it is at war with in
 * the hexes they hold alone. Outposts are unarmed, so a warship is all it takes.
 */
export function razeOutposts(state: GameState, faction: FactionId): number[] {
  const out: number[] = [];
  state.map.hexes.forEach((h, i) => {
    if (!h.outpost || !h.owner || !atWar(state, faction, h.owner)) return;
    if (othersAt(state, faction, i) || !hasWarshipAt(state, faction, i)) return;
    delete h.outpost;
    out.push(i);
    log(state, [faction, h.owner], 'captured', `${factionDef(faction).short} warships destroyed the ${factionDef(h.owner).short} outpost${h.system ? ` at ${h.system.name}` : ''}.`, i);
  });
  return out;
}

/** Outposts belong to the hex's owner: one in a hex that is no longer anyone's is gone. */
export function tidyOutposts(state: GameState): void {
  for (const h of state.map.hexes) if (h.outpost && !h.owner) delete h.outpost;
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
