import { DESIGNS, DESIGNS_BY_FACTION } from '../src/data/designs';
import { propose } from '../src/engine/diplomacy';
import { relationKey } from '../src/engine/ids';
import { advanceContracts, buyOffer, contractCost, contractTerms, expireRentals, offerPrice, offersFor, orderShip, priceFactor, refreshOffers, REFUSE_BELOW, shipListPrice } from '../src/engine/mercenaries';
import { MINOR_IDS } from '../src/data/factions';
import { SALES } from '../src/data/sales';
import { countBits } from '../src/engine/bitset';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';
import { setStatus } from './helpers';

const MINORS = ['thessic', 'grendis', 'zenith', 'forgeborn', 'myrr', 'quorr', 'ixxi', 'nhar', 'tal', 'skarn'];
let base: GameState | null = null;
function game(): GameState {
  base ??= createGame({ seed: 'merc', seats: [{ faction: 'concord', name: 'A' }], minors: MINORS });
  const g = structuredClone(base);
  for (const m of MINORS) g.relations[relationKey('concord', m)].contact = true;
  g.factions.concord.stock.energy = 1000;
  return g;
}
const offer = (g: GameState, seller: string, kind: string) => g.offers!.find((o) => o.seller === seller && o.kind === kind)!;

describe('mercenary market', () => {
  it('offers ships, armies and star charts from the mercenary factions', () => {
    const g = game();
    const thessicShips = g.offers!.filter((o) => o.seller === 'thessic' && o.kind === 'ship');
    expect(thessicShips.filter((o) => o.kind === 'ship' && DESIGNS[o.design].role !== 'cargo')).toHaveLength(2);
    expect(thessicShips.some((o) => o.kind === 'ship' && DESIGNS[o.design].role === 'cargo')).toBe(true);
    expect(g.offers!.filter((o) => o.seller === 'grendis' && o.kind === 'army')).toHaveLength(2);
    expect(g.offers!.filter((o) => o.seller === 'zenith' && o.kind === 'charts')).toHaveLength(1);
    // Every minor power in the game sells something.
    for (const m of MINORS) expect(g.offers!.some((o) => o.seller === m), m).toBe(true);
    expect(g.offers!.some((o) => ['concord', 'rynkai', 'varrhen', 'krasnyr', 'lattice'].includes(o.seller))).toBe(false);
  });

  it('sells a ship, delivered at the seller’s home, paying the seller', () => {
    const g = game();
    const o = offer(g, 'thessic', 'ship');
    const e0 = g.factions.thessic.stock.energy;
    expect(buyOffer(g, 'concord', o.id).ok).toBe(true);
    const f = Object.values(g.fleets).find((x) => x.owner === 'concord' && x.hex === g.factions.thessic.home)!;
    expect(f).toBeDefined();
    expect(g.factions.thessic.stock.energy).toBe(e0 + offerPrice(g, 'concord', o));
    expect(buyOffer(g, 'concord', o.id).ok).toBe(false);
  });

  it('refuses enemies, strangers and the poor', () => {
    const g = game();
    setStatus(g, 'concord', 'thessic', 'war');
    expect(buyOffer(g, 'concord', offer(g, 'thessic', 'ship').id).ok).toBe(false);
    g.relations[relationKey('concord', 'grendis')].contact = false;
    expect(buyOffer(g, 'concord', offer(g, 'grendis', 'army').id).ok).toBe(false);
    g.factions.concord.stock.energy = 5;
    expect(buyOffer(g, 'concord', offer(g, 'zenith', 'charts').id).ok).toBe(false);
  });

  it('rents armies that go home when the contract ends, and cannot be traded on', () => {
    const g = game();
    expect(buyOffer(g, 'concord', offer(g, 'grendis', 'army').id).ok).toBe(true);
    const a = Object.values(g.armies).find((x) => x.rentedFrom === 'grendis')!;
    expect(a.owner).toBe('concord');
    expect(a.hex).toBe(g.factions.concord.home);
    const r = g.relations[relationKey('concord', 'lattice')];
    r.contact = true; r.embassyA = true; r.embassyB = true; r.status = 'relations';
    expect(propose(g, 'concord', 'lattice', [{ kind: 'army', army: a.id }], []).ok).toBe(false);
    g.turn += 9;
    expect(expireRentals(g, 'concord'), 'still hired').toBeUndefined();
    expect(g.armies[a.id]).toBeDefined();
    g.turn += 1;
    expireRentals(g, 'concord');
    expect(g.armies[a.id]).toBeUndefined();
  });

  it('sells star charts, once per cooldown', () => {
    const g = game();
    const before = countBits(g.factions.concord.explored);
    const o = offer(g, 'zenith', 'charts');
    expect(buyOffer(g, 'concord', o.id).ok).toBe(true);
    expect(countBits(g.factions.concord.explored)).toBeGreaterThan(before);
    expect(buyOffer(g, 'concord', o.id).ok).toBe(false);
    refreshOffers(g);
    expect(buyOffer(g, 'concord', offer(g, 'zenith', 'charts').id).ok).toBe(false);
  });
});

function setOpinion(g: GameState, seller: string, of: string, value: number) {
  const r = g.relations[relationKey(seller, of)];
  if (r.a === seller) r.opinionAB = value; else r.opinionBA = value;
}
function giveEmbassy(g: GameState, a: string, b: string) {
  const r = g.relations[relationKey(a, b)];
  if (r.a === a) r.embassyA = true; else r.embassyB = true;
}

describe('what the minor powers sell', () => {
  it('has a sales entry for every minor, with ships that exist for the roles it asks for', () => {
    for (const id of MINOR_IDS) {
      const specs = SALES[id];
      expect(specs?.length, id).toBeGreaterThan(0);
      for (const s of specs) {
        if (s.kind === 'ship') expect(DESIGNS_BY_FACTION[id].some((d) => d.cls !== 'fighter' && s.roles.includes(d.role)), `${id} ${s.roles}`).toBe(true);
      }
    }
  });

  it('covers cargo, warships, science, colony, constructor, spies, armies and charts between them', () => {
    const roles = new Set<string>();
    const kinds = new Set<string>();
    for (const specs of Object.values(SALES)) for (const s of specs) { kinds.add(s.kind); if (s.kind === 'ship') s.roles.forEach((r) => roles.add(r)); }
    for (const r of ['cargo', 'line', 'science', 'colony', 'constructor', 'raider', 'transport']) expect(roles.has(r), r).toBe(true);
    for (const k of ['ship', 'spy', 'army', 'charts']) expect(kinds.has(k), k).toBe(true);
  });

  it('is expensive: a ship costs well over what it costs to build', () => {
    const d = DESIGNS_BY_FACTION.thessic.find((x) => x.role === 'line')!;
    expect(shipListPrice(d)).toBeGreaterThan((d.cost.metals + d.cost.energy) * 2);
  });

  it('charges according to the seller’s opinion of you, and refuses when it is low', () => {
    const g = game();
    const o = offer(g, 'thessic', 'ship');
    setOpinion(g, 'thessic', 'concord', 0);
    expect(offerPrice(g, 'concord', o)).toBe(o.price);
    setOpinion(g, 'thessic', 'concord', 60);
    const friend = offerPrice(g, 'concord', o);
    setOpinion(g, 'thessic', 'concord', -40);
    const foe = offerPrice(g, 'concord', o);
    expect(friend).toBeLessThan(o.price);
    expect(foe).toBeGreaterThan(o.price);
    expect(priceFactor(100)).toBeCloseTo(0.65);
    expect(priceFactor(-100)).toBeCloseTo(1.5);
    // Pays the price its opinion sets.
    const before = g.factions.concord.stock.energy;
    expect(buyOffer(g, 'concord', o.id).ok).toBe(true);
    expect(before - g.factions.concord.stock.energy).toBeCloseTo(foe, 0);
    setOpinion(g, 'thessic', 'concord', REFUSE_BELOW);
    const other = offer(g, 'thessic', 'ship');
    expect(buyOffer(g, 'concord', other.id).ok).toBe(false);
  });

  it('some offers need an embassy, a Trade Agreement, a pact or an alliance', () => {
    const g = game();
    // Nhar spies: embassy.
    const spy = offer(g, 'nhar', 'spy');
    expect(spy.req).toBe('embassy');
    expect(buyOffer(g, 'concord', spy.id).ok).toBe(false);
    giveEmbassy(g, 'concord', 'nhar');
    const agents0 = Object.keys(g.agents).length;
    expect(buyOffer(g, 'concord', spy.id).ok).toBe(true);
    expect(Object.keys(g.agents).length).toBe(agents0 + 1);
    const hired = Object.values(g.agents).find((a) => a.owner === 'concord' && a.kind === 'spy' && a.hex === g.factions.concord.home && !g.agents[a.id].mission && a.id !== undefined)!;
    expect(hired).toBeDefined();
    // Grendis transports: Trade Agreement.
    const transport = g.offers!.find((o) => o.seller === 'grendis' && o.kind === 'ship')!;
    expect(transport.req).toBe('trade');
    expect(buyOffer(g, 'concord', transport.id).ok).toBe(false);
    g.relations[relationKey('concord', 'grendis')].agreements.push('trade');
    expect(buyOffer(g, 'concord', transport.id).ok).toBe(true);
    // Ixxi warships: alliance only.
    const hive = g.offers!.find((o) => o.seller === 'ixxi' && o.kind === 'ship')!;
    expect(hive.req).toBe('alliance');
    expect(buyOffer(g, 'concord', hive.id).ok).toBe(false);
    g.relations[relationKey('concord', 'ixxi')].status = 'alliance';
    expect(buyOffer(g, 'concord', hive.id).ok).toBe(true);
  });

  it('says why an offer is out of reach', () => {
    const g = game();
    const row = offersFor(g, 'concord').find((x) => x.offer.seller === 'ixxi')!;
    expect(row.check.ok).toBe(false);
    expect((row.check as { reason: string }).reason).toMatch(/alliance/);
  });

  it('a trade route unlocks route-only offers', () => {
    const g = game();
    const tal = g.offers!.find((o) => o.seller === 'tal' && o.kind === 'charts')!;
    expect(tal.req).toBe('route');
    expect(buyOffer(g, 'concord', tal.id).ok).toBe(false);
    g.routes = [{ id: 'rt', owner: 'concord', partner: 'tal', from: g.factions.concord.home, to: g.factions.tal.home, path: [], since: 1 } as never];
    expect(buyOffer(g, 'concord', tal.id).ok).toBe(true);
  });
});

describe('shipyard contracts', () => {
  const frigate = DESIGNS_BY_FACTION.concord.find((d) => d.cls === 'frigate' && d.role === 'line')!;

  it('the Forgeborn build to order, 20% cheaper, delivered at their yard', () => {
    const g = game();
    const t = contractTerms(g, 'concord', 'forgeborn');
    expect(t.ok && t.discount).toBe(0.2);
    expect(contractCost(g, 'concord', 'forgeborn', frigate.id)!.metals).toBe(Math.round(frigate.cost.metals * 0.8));
    expect(orderShip(g, 'concord', 'forgeborn', frigate.id).ok).toBe(true);
    for (let i = 0; i < 20 && g.contracts!.length; i++) advanceContracts(g, 'forgeborn');
    expect(g.contracts).toHaveLength(0);
    expect(Object.values(g.fleets).some((f) => f.owner === 'concord' && f.hex === g.factions.forgeborn.home)).toBe(true);
  });

  it('others need a Manufacturing Agreement (10% off), and war means the builder keeps the ship', () => {
    const g = game();
    const r = g.relations[relationKey('concord', 'lattice')];
    r.contact = true; r.status = 'relations';
    expect(contractTerms(g, 'concord', 'lattice').ok).toBe(false);
    r.agreements.push('manufacturing');
    const t = contractTerms(g, 'concord', 'lattice');
    expect(t.ok && t.discount).toBe(0.1);
    expect(orderShip(g, 'concord', 'lattice', frigate.id).ok).toBe(true);
    const latticeFleets = Object.values(g.fleets).filter((f) => f.owner === 'lattice').length;
    r.status = 'war';
    advanceContracts(g, 'lattice');
    expect(g.contracts).toHaveLength(0);
    expect(Object.values(g.fleets).filter((f) => f.owner === 'lattice').length).toBe(latticeFleets + 1);
  });

  it('only builds your own designs, with the tech you know', () => {
    const g = game();
    const theirs = DESIGNS_BY_FACTION.lattice[3];
    expect(orderShip(g, 'concord', 'forgeborn', theirs.id).ok).toBe(false);
    const big = DESIGNS_BY_FACTION.concord.find((d) => d.cls === 'battleship')!;
    expect(orderShip(g, 'concord', 'forgeborn', big.id).ok).toBe(false);
  });
});
