/**
 * The mercenary market and shipyard contracts (§9.6).
 * - Thessic Banking Houses (Mercenary Contracts) sell warships, delivered at their home.
 * - Grendis Iron Legion (For Hire) rent out veteran armies for 10 turns.
 * - Zenith Observatory (Star Charts) sell copies of their charts.
 * - Forgeborn Anvil (Master Shipwrights) build any ship to order for empires at peace with them, 20% cheaper;
 *   partners in a Manufacturing Agreement can likewise build at each other's shipyards, 10% cheaper.
 * Buyers need contact with the seller and must not be at war with it. Prices are paid in energy to the seller.
 */
import { design, DESIGNS, DESIGNS_BY_FACTION } from '../data/designs';
import { hasAbility } from '../data/factions';
import { CLASSES } from '../data/ships';
import { setBits } from './bitset';
import { blockadersAt } from './blockade';
import { shipyardOf, productionOf } from './economy';
import { log } from './events';
import { newId } from './ids';
import { atWar, relation } from './query';
import { Rng } from './rng';
import { spawnShip } from './setup';
import type { Contract, FactionId, GameState, Offer } from './types';

export type Result = { ok: true; text?: string } | { ok: false; reason: string };

export const ARMY_RENT_TURNS = 10;
export const CHARTS_COOLDOWN = 10;

function canDeal(state: GameState, buyer: FactionId, seller: FactionId): Result {
  if (buyer === seller) return { ok: false, reason: 'You cannot buy from yourself.' };
  if (!state.factions[seller]?.alive) return { ok: false, reason: 'They are gone.' };
  const r = relation(state, buyer, seller);
  if (!r.contact) return { ok: false, reason: 'You have not met them.' };
  if (r.status === 'war') return { ok: false, reason: 'They will not deal with an enemy.' };
  return { ok: true };
}

/** New offers each round from every mercenary faction (old unsold offers lapse). */
export function refreshOffers(state: GameState): void {
  const rng = new Rng(state.rng);
  const offers: Offer[] = [];
  for (const f of Object.values(state.factions)) {
    if (!f.alive) continue;
    if (hasAbility(f.id, 'mercenaryContracts')) {
      const warships = DESIGNS_BY_FACTION[f.id].filter((d) => d.stats.energy + d.stats.missile + d.stats.hangar > 0 && d.cls !== 'fighter');
      for (const d of rng.shuffle(warships).slice(0, 2)) {
        offers.push({ id: newId(state, 'o'), seller: f.id, kind: 'ship', design: d.id, price: Math.round((d.cost.metals * 1.2 + d.cost.energy + d.cost.exotics * 4) * 1.3) });
      }
    }
    if (hasAbility(f.id, 'forHire')) {
      for (let i = 0; i < 2; i++) offers.push({ id: newId(state, 'o'), seller: f.id, kind: 'army', strength: 15, xp: 3, turns: ARMY_RENT_TURNS, price: 70 });
    }
    if (hasAbility(f.id, 'starCharts')) offers.push({ id: newId(state, 'o'), seller: f.id, kind: 'charts', price: 60 + Math.floor(state.turn / 2) });
  }
  state.offers = offers;
}

/** Offers this faction could buy right now (with the reason when it can't). */
export function offersFor(state: GameState, buyer: FactionId): { offer: Offer; check: Result }[] {
  return (state.offers ?? []).map((offer) => ({ offer, check: checkOffer(state, buyer, offer) }));
}

function checkOffer(state: GameState, buyer: FactionId, o: Offer): Result {
  const deal = canDeal(state, buyer, o.seller);
  if (!deal.ok) return deal;
  if (state.factions[buyer].stock.energy < o.price) return { ok: false, reason: `Costs ${o.price} energy.` };
  if (o.kind === 'charts' && state.turn - (state.factions[buyer].flags[`charts:${o.seller}`] ?? -999) < CHARTS_COOLDOWN) {
    return { ok: false, reason: 'You bought their charts recently.' };
  }
  return { ok: true };
}

export function buyOffer(state: GameState, buyer: FactionId, offerId: string): Result {
  const offers = state.offers ?? [];
  const o = offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'That offer is gone.' };
  const check = checkOffer(state, buyer, o);
  if (!check.ok) return check;
  const b = state.factions[buyer];
  b.stock.energy = Math.round((b.stock.energy - o.price) * 10) / 10;
  state.factions[o.seller].stock.energy += o.price;
  const seller = state.factions[o.seller];
  if (o.kind === 'ship') {
    const fid = spawnShip(state, buyer, DESIGNS[o.design], seller.home);
    state.fleets[fid].movesLeft = 0;
    state.fleets[fid].name = `Mercenary ${design(o.design).name}`;
    state.offers = offers.filter((x) => x !== o);
    log(state, [buyer, o.seller], 'mercenary', `Bought a ${design(o.design).name} from the ${o.seller}; it waits at their home system.`, seller.home);
    return { ok: true, text: 'The ship is waiting at their home system.' };
  }
  if (o.kind === 'army') {
    const id = newId(state, 'r');
    state.armies[id] = { id, owner: buyer, strength: o.strength, xp: o.xp, hex: b.home, ship: null, rentedFrom: o.seller, until: state.turn + o.turns };
    state.offers = offers.filter((x) => x !== o);
    log(state, [buyer, o.seller], 'mercenary', `Hired a veteran army from the ${o.seller} for ${o.turns} turns.`, b.home);
    return { ok: true, text: `The army reports to your home system for ${o.turns} turns.` };
  }
  b.explored = setBits(b.explored, exploredIndices(seller.explored, state.map.hexes.length));
  b.flags[`charts:${o.seller}`] = state.turn;
  log(state, [buyer, o.seller], 'mercenary', `Bought star charts from the ${o.seller}.`);
  return { ok: true, text: 'Their charts are now on your map.' };
}

function exploredIndices(bits: string, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = bits.charCodeAt(i >> 2);
    if ((((c <= 57 ? c - 48 : c - 87) >> (i & 3)) & 1) === 1) out.push(i);
  }
  return out;
}

/** Rented armies go home when their contract ends (checked at the start of the renter's turn). */
export function expireRentals(state: GameState, faction: FactionId): void {
  for (const a of Object.values(state.armies)) {
    if (a.owner !== faction || a.until === undefined || state.turn < a.until) continue;
    if (a.ship && state.ships[a.ship]) state.ships[a.ship].cargo = state.ships[a.ship].cargo.filter((c) => c !== a.id);
    delete state.armies[a.id];
    log(state, [faction], 'mercenary', `A hired army's contract ended and it went home to the ${a.rentedFrom}.`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Shipyard contracts

/** Why `buyer` may (or may not) order ships from `seller`'s yards, and the discount it gets. */
export function contractTerms(state: GameState, buyer: FactionId, seller: FactionId): { ok: true; discount: number; hex: number } | { ok: false; reason: string } {
  const deal = canDeal(state, buyer, seller);
  if (!deal.ok) return deal;
  const r = relation(state, buyer, seller);
  const shipwrights = hasAbility(seller, 'masterShipwrights');
  const manufacturing = r.agreements.includes('manufacturing');
  if (!shipwrights && !manufacturing) return { ok: false, reason: 'They only build for you with a Manufacturing Agreement.' };
  const home = state.factions[seller].home;
  if (state.map.hexes[home].owner !== seller || !shipyardOf(state.map.hexes[home].system!)) return { ok: false, reason: 'They have no working shipyard.' };
  return { ok: true, discount: shipwrights ? 0.2 : 0.1, hex: home };
}

export function contractCost(state: GameState, buyer: FactionId, seller: FactionId, designId: string): { metals: number; energy: number; exotics: number } | null {
  const t = contractTerms(state, buyer, seller);
  if (!t.ok) return null;
  const d = DESIGNS[designId];
  const m = 1 - t.discount;
  return { metals: Math.round(d.cost.metals * m), energy: Math.round(d.cost.energy * m), exotics: d.cost.exotics };
}

/** Orders one of the buyer's own designs from another faction's shipyard. */
export function orderShip(state: GameState, buyer: FactionId, seller: FactionId, designId: string): Result {
  const t = contractTerms(state, buyer, seller);
  if (!t.ok) return t;
  const d = DESIGNS[designId];
  if (!d || d.faction !== buyer || d.cls === 'fighter') return { ok: false, reason: 'Pick one of your own ship designs.' };
  if (d.tech && !state.factions[buyer].research.known.includes(d.tech)) return { ok: false, reason: `Needs ${d.tech}.` };
  const yard = shipyardOf(state.map.hexes[t.hex].system!);
  if (yard === 'light' && CLASSES[d.cls].size > CLASSES.destroyer.size) return { ok: false, reason: 'Their shipyard is too small for that class.' };
  const cost = contractCost(state, buyer, seller, designId)!;
  const s = state.factions[buyer].stock;
  if (s.metals < cost.metals || s.energy < cost.energy || s.exotics < cost.exotics) return { ok: false, reason: 'Not enough resources.' };
  s.metals -= cost.metals;
  s.energy -= cost.energy;
  s.exotics -= cost.exotics;
  // The builder keeps a 15% fee as energy.
  state.factions[seller].stock.energy += Math.round((cost.metals + cost.energy) * 0.15);
  state.contracts ??= [];
  state.contracts.push({ id: newId(state, 'k'), buyer, seller, hex: t.hex, design: designId, remaining: d.buildPoints });
  log(state, [buyer, seller], 'contract', `Ordered a ${d.name} from the ${seller} shipyards.`, t.hex);
  return { ok: true, text: 'Ordered. It will be delivered at their shipyard.' };
}

/** Advances contracts at the start of the builder's turn (without slowing its own queue). */
export function advanceContracts(state: GameState, seller: FactionId): void {
  if (!state.contracts?.length) return;
  const keep: Contract[] = [];
  for (const c of state.contracts) {
    if (c.seller !== seller) { keep.push(c); continue; }
    const d = DESIGNS[c.design];
    if (!state.factions[c.buyer]?.alive) continue;
    if (atWar(state, c.buyer, c.seller)) {
      // War: the builder keeps the hull.
      if (state.map.hexes[c.hex].owner === seller) spawnShip(state, seller, d, c.hex);
      log(state, [c.buyer, c.seller], 'contract', `The ${seller} seized the ${d.name} they were building for the ${c.buyer}.`, c.hex);
      continue;
    }
    if (state.map.hexes[c.hex].owner !== seller || blockadersAt(state, c.hex).length) { keep.push(c); continue; }
    c.remaining -= Math.max(1, productionOf(state, c.hex) * 0.5);
    if (c.remaining > 0) { keep.push(c); continue; }
    const fid = spawnShip(state, c.buyer, d, c.hex);
    state.fleets[fid].movesLeft = 0;
    log(state, [c.buyer, c.seller], 'contract', `The ${seller} shipyards delivered your ${d.name}.`, c.hex);
  }
  state.contracts = keep;
}

