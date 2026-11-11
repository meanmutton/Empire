/**
 * Trade routes (§5.6). A cargo ship that reaches another empire's settled system (with a Trade Agreement,
 * or any Haldane system) becomes a trade route back to the owner's nearest settled system; it can also
 * link two of the owner's own systems at least 4 hexes apart. Both ends earn energy every turn.
 * Enemy warships on the route or a blockaded endpoint cut the income that turn (Ghal'tar raiders pocket
 * it); war between the partners, or losing an endpoint, ends the route.
 */
import { design } from '../data/designs';
import { hasAbility } from '../data/factions';
import { blockadersAt } from './blockade';
import { log } from './events';
import { hexDistance } from './hex';
import { newId } from './ids';
import { findPath } from './path';
import { atWar, relation } from './query';
import { wormholeLinks } from './movement';
import type { FactionId, GameState, TradeRoute } from './types';

export type Result = { ok: true; text?: string } | { ok: false; reason: string };

export const DOMESTIC_MIN_DISTANCE = 4;
export const DOMESTIC_SHARE = 0.6;

export function routesOf(state: GameState, f: FactionId): TradeRoute[] {
  return (state.routes ?? []).filter((r) => r.owner === f);
}

/** Routes a faction may run: 2, plus one per Trade Port it owns. */
export function routeCapacity(state: GameState, f: FactionId): number {
  let ports = 0;
  for (const h of state.map.hexes) if (h.owner === f && h.system?.improvements.includes('tradePort')) ports++;
  return 2 + ports;
}

function settled(state: GameState, hex: number, owner: FactionId): boolean {
  const h = state.map.hexes[hex];
  return h.owner === owner && !!h.system && h.system.development >= 2;
}

export function canTradeWith(state: GameState, a: FactionId, b: FactionId): boolean {
  if (a === b) return true;
  const r = relation(state, a, b);
  if (r.status === 'war' || !r.contact) return false;
  return r.agreements.includes('trade') || hasAbility(b, 'freePort') || hasAbility(a, 'freePort');
}

/** Turns a cargo ship in `fleetId` into a trade route ending at the system it is in. */
export function establishRoute(state: GameState, fleetId: string): Result {
  const fl = state.fleets[fleetId];
  if (!fl) return { ok: false, reason: 'No such fleet.' };
  const owner = fl.owner;
  const ship = fl.ships.find((s) => design(state.ships[s].design).role === 'cargo');
  if (!ship) return { ok: false, reason: 'Trade routes are run by cargo ships.' };
  const to = fl.hex;
  const partner = state.map.hexes[to].owner;
  if (!partner || !settled(state, to, partner)) return { ok: false, reason: 'Trade routes end at a settled system (development 2 or more).' };
  if (!canTradeWith(state, owner, partner)) return { ok: false, reason: 'You need a Trade Agreement with them (the Haldane trade with anyone).' };
  if (routesOf(state, owner).length >= routeCapacity(state, owner)) {
    return { ok: false, reason: `You already run ${routeCapacity(state, owner)} routes. Build Trade Ports for more.` };
  }
  // Link back to the owner's nearest settled system.
  const origins = state.map.hexes.map((h, i) => i).filter((i) => i !== to && settled(state, i, owner))
    .filter((i) => partner !== owner || hexDistance(state.map, i, to) >= DOMESTIC_MIN_DISTANCE)
    .sort((a, b) => hexDistance(state.map, a, to) - hexDistance(state.map, b, to));
  for (const from of origins) {
    if ((state.routes ?? []).some((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from))) continue;
    const p = findPath(state.map, from, to, (_a, b) => (state.map.hexes[b].terrain === 'blackHole' ? Infinity : 1), wormholeLinks(state));
    if (!p) continue;
    state.routes ??= [];
    state.routes.push({ id: newId(state, 't'), owner, partner, from, to, path: p.path, since: state.turn });
    const f = state.fleets[fleetId];
    f.ships = f.ships.filter((s) => s !== ship);
    delete state.ships[ship];
    if (f.ships.length === 0) delete state.fleets[fleetId];
    const names = `${state.map.hexes[from].system!.name} – ${state.map.hexes[to].system!.name}`;
    log(state, partner === owner ? [owner] : [owner, partner], 'route', `Trade route opened: ${names}.`, to);
    return { ok: true, text: `Trade route opened: ${names}.` };
  }
  return { ok: false, reason: partner === owner ? `A domestic route needs another of your settled systems at least ${DOMESTIC_MIN_DISTANCE} hexes away.` : 'No free route back to your systems.' };
}

export function cancelRoute(state: GameState, faction: FactionId, routeId: string): Result {
  const r = (state.routes ?? []).find((x) => x.id === routeId);
  if (!r || (r.owner !== faction && r.partner !== faction)) return { ok: false, reason: 'No such route.' };
  state.routes = state.routes!.filter((x) => x !== r);
  log(state, [r.owner, r.partner], 'route', 'A trade route was closed.', r.to);
  return { ok: true };
}

/** Energy a route pays each end per turn, before disruption. */
export function routeValue(state: GameState, r: TradeRoute): number {
  const a = state.map.hexes[r.from].system!, b = state.map.hexes[r.to].system!;
  let v = 2 + Math.min(10, 0.25 * r.path.length) + (a.development + b.development) / 2;
  if (a.improvements.includes('tradePort')) v *= 1.25;
  if (b.improvements.includes('tradePort')) v *= 1.25;
  if (hasAbility(r.owner, 'tradeHub') || hasAbility(r.partner, 'tradeHub')) v *= 1.5;
  if (r.owner === r.partner) v *= DOMESTIC_SHARE;
  return Math.round(v * 10) / 10;
}

/**
 * Where `owner` could open a new route, best first: every settled system of a power it may trade with (or of
 * its own, far enough from another of its settled systems), with the energy it would pay each turn. The
 * estimate takes the straight-line distance from the nearest of the owner's settled systems.
 */
export function routeOptions(state: GameState, owner: FactionId, known?: (hex: number) => boolean): { hex: number; partner: FactionId; from: number; value: number }[] {
  const mine = state.map.hexes.map((_, i) => i).filter((i) => settled(state, i, owner));
  const out: { hex: number; partner: FactionId; from: number; value: number }[] = [];
  state.map.hexes.forEach((h, to) => {
    const partner = h.owner;
    if (!partner || !settled(state, to, partner) || (known && !known(to)) || !canTradeWith(state, owner, partner)) return;
    const origins = mine.filter((i) => i !== to && (partner !== owner || hexDistance(state.map, i, to) >= DOMESTIC_MIN_DISTANCE))
      .filter((i) => !(state.routes ?? []).some((r) => (r.from === i && r.to === to) || (r.from === to && r.to === i)));
    if (!origins.length) return;
    const from = origins.reduce((a, b) => (hexDistance(state.map, a, to) <= hexDistance(state.map, b, to) ? a : b));
    const len = hexDistance(state.map, from, to) + 1;
    out.push({ hex: to, partner, from, value: routeValue(state, { id: '', owner, partner, from, to, path: new Array(len).fill(0), since: state.turn }) });
  });
  return out.sort((a, b) => b.value - a.value);
}

/** Who is cutting a route right now: enemy warships on it, or a blockaded end. Empty if it flows. */
export function routeDisruptors(state: GameState, r: TradeRoute): FactionId[] {
  if (hasAbility(r.owner, 'smugglers') || hasAbility(r.partner, 'smugglers')) return [];
  const onPath = new Set(r.path);
  const out = new Set<FactionId>();
  for (const f of Object.values(state.fleets)) {
    if (!onPath.has(f.hex)) continue;
    if (!atWar(state, f.owner, r.owner) && !atWar(state, f.owner, r.partner)) continue;
    if (f.ships.some((s) => { const st = design(state.ships[s].design).stats; return st.energy + st.missile + st.hangar > 0; })) out.add(f.owner);
  }
  for (const b of [...blockadersAt(state, r.from), ...blockadersAt(state, r.to)]) out.add(b);
  return [...out];
}

/** Whether a route is still valid (partners at peace, both ends still held and settled). */
function stillValid(state: GameState, r: TradeRoute): boolean {
  if (!state.factions[r.owner]?.alive || !state.factions[r.partner]?.alive) return false;
  if (r.owner !== r.partner && atWar(state, r.owner, r.partner)) return false;
  return settled(state, r.from, r.owner) && settled(state, r.to, r.partner);
}

/** Start of a faction's turn: drop broken routes, then collect income from its routes (as owner or partner). */
export function runTradeRoutes(state: GameState, f: FactionId): number {
  if (!state.routes?.length) return 0;
  const broken = state.routes.filter((r) => (r.owner === f || r.partner === f) && !stillValid(state, r));
  if (broken.length) {
    state.routes = state.routes.filter((r) => !broken.includes(r));
    for (const r of broken) log(state, [r.owner, r.partner], 'route', 'A trade route collapsed (war, or a lost system).', r.to);
  }
  let income = 0;
  for (const r of state.routes) {
    if (r.owner !== f && r.partner !== f) continue;
    const v = routeValue(state, r);
    const cut = routeDisruptors(state, r);
    if (cut.length) {
      // Raiders pocket what they cut (once, on the owner's turn).
      const raider = cut.find((x) => hasAbility(x, 'raiders'));
      if (raider && r.owner === f) state.factions[raider].stock.energy += v;
      continue;
    }
    income += v;
  }
  state.factions[f].stock.energy = Math.round((state.factions[f].stock.energy + income) * 10) / 10;
  return income;
}

/** Income this faction would get from routes this turn (for display). */
export function routeIncome(state: GameState, f: FactionId): number {
  let total = 0;
  for (const r of state.routes ?? []) {
    if ((r.owner === f || r.partner === f) && routeDisruptors(state, r).length === 0) total += routeValue(state, r);
  }
  return Math.round(total * 10) / 10;
}
