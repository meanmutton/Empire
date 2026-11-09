import { DESIGNS_BY_FACTION } from '../src/data/designs';
import { propose } from '../src/engine/diplomacy';
import { relationKey } from '../src/engine/ids';
import { advanceContracts, buyOffer, contractCost, contractTerms, expireRentals, orderShip, refreshOffers } from '../src/engine/mercenaries';
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
    expect(g.offers!.filter((o) => o.seller === 'thessic' && o.kind === 'ship')).toHaveLength(2);
    expect(g.offers!.filter((o) => o.seller === 'grendis' && o.kind === 'army')).toHaveLength(2);
    expect(g.offers!.filter((o) => o.seller === 'zenith' && o.kind === 'charts')).toHaveLength(1);
    expect(g.offers!.some((o) => !['thessic', 'grendis', 'zenith'].includes(o.seller))).toBe(false);
  });

  it('sells a ship, delivered at the seller’s home, paying the seller', () => {
    const g = game();
    const o = offer(g, 'thessic', 'ship');
    const e0 = g.factions.thessic.stock.energy;
    expect(buyOffer(g, 'concord', o.id).ok).toBe(true);
    const f = Object.values(g.fleets).find((x) => x.owner === 'concord' && x.hex === g.factions.thessic.home)!;
    expect(f).toBeDefined();
    expect(g.factions.thessic.stock.energy).toBe(e0 + o.price);
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
