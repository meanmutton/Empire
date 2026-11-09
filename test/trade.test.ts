import { applyAction } from '../src/engine/actions';
import { acceptProposal, diplomacyIncome, propose } from '../src/engine/diplomacy';
import { factionIncome } from '../src/engine/economy';
import { relationKey } from '../src/engine/ids';
import { BASE_PRICES, exchangeFee, prices, quote, relaxMarket } from '../src/engine/market';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';
import { newGame, setStatus } from './helpers';

function embassy(g: GameState, a: string, b: string) {
  const r = g.relations[relationKey(a, b)];
  r.contact = true;
  if (r.a === a) r.embassyA = true; else r.embassyB = true;
  if (r.status === 'neutral') r.status = 'relations';
}

describe('agreements', () => {
  it('are a net gain for both sides: nobody loses income', () => {
    const g = newGame('agree');
    embassy(g, 'concord', 'lattice');
    const before = { c: factionIncome(g, 'concord').net, l: factionIncome(g, 'lattice').net };
    const r = propose(g, 'concord', 'lattice', [{ kind: 'agreement', agreement: 'trade' }, { kind: 'agreement', agreement: 'research' }, { kind: 'agreement', agreement: 'economic' }], []);
    acceptProposal(g, r.id!);
    // Own production is untouched…
    expect(factionIncome(g, 'concord').net).toEqual(before.c);
    expect(factionIncome(g, 'lattice').net).toEqual(before.l);
    // …and both get extra on top.
    for (const f of ['concord', 'lattice']) {
      const extra = diplomacyIncome(g, f);
      expect(extra.energy).toBeGreaterThan(0);
      expect(extra.science).toBeGreaterThan(0);
      expect(extra.metals).toBeGreaterThan(0);
    }
  });
});

describe('trading territory and armies', () => {
  it('hands over a system with its starbase, sending the old garrison home', () => {
    const g = newGame('trade');
    embassy(g, 'concord', 'lattice');
    const hex = g.map.hexes.findIndex((h) => h.owner === 'concord' && h.system && !h.system.homeOf);
    g.armies.g1 = { id: 'g1', owner: 'concord', strength: 10, xp: 0, hex, ship: null };
    g.starbases.sb = { id: 'sb', owner: 'concord', hex, tier: 1, hull: 150 };
    const r = propose(g, 'concord', 'lattice', [{ kind: 'hex', hex }], []);
    expect(acceptProposal(g, r.id!).ok).toBe(true);
    expect(g.map.hexes[hex].owner).toBe('lattice');
    expect(g.starbases.sb.owner).toBe('lattice');
    expect(g.armies.g1.hex).toBe(g.factions.concord.home);
    const home = propose(g, 'concord', 'lattice', [{ kind: 'hex', hex: g.factions.concord.home }], []);
    expect(home.ok).toBe(false);
  });

  it('hands over a garrisoned army, which moves to its new owner', () => {
    const g = newGame('trade');
    embassy(g, 'concord', 'lattice');
    const army = Object.values(g.armies).find((a) => a.owner === 'concord')!;
    const r = propose(g, 'concord', 'lattice', [{ kind: 'army', army: army.id }], [{ kind: 'resource', resource: 'energy', amount: 10 }]);
    expect(acceptProposal(g, r.id!).ok).toBe(true);
    expect(g.armies[army.id].owner).toBe('lattice');
    expect(g.armies[army.id].hex).toBe(g.factions.lattice.home);
  });

  it('resource swaps are plain one-for-one proposals with no fee', () => {
    const g = newGame('trade');
    embassy(g, 'concord', 'lattice');
    const c0 = { ...g.factions.concord.stock }, l0 = { ...g.factions.lattice.stock };
    const r = propose(g, 'concord', 'lattice', [{ kind: 'resource', resource: 'energy', amount: 60 }], [{ kind: 'resource', resource: 'metals', amount: 40 }]);
    acceptProposal(g, r.id!);
    expect(g.factions.concord.stock.energy).toBe(c0.energy - 60);
    expect(g.factions.concord.stock.metals).toBe(c0.metals + 40);
    expect(g.factions.lattice.stock.energy).toBe(l0.energy + 60);
  });
});

describe('galactic exchange', () => {
  it('trades at public prices with a fee, moving prices that recover', () => {
    const g = newGame('market');
    g.active = g.turnOrder.indexOf('concord');
    expect(exchangeFee(g, 'concord')).toBe(0.4);
    const q = quote(g, 'concord', 'energy', 'metals', 80);
    expect(q).toBeCloseTo((80 / 1.2) * 0.6, 0);
    const m0 = g.factions.concord.stock.metals;
    expect(applyAction(g, 'concord', { type: 'exchange', sell: 'energy', buy: 'metals', amount: 80 }).ok).toBe(true);
    expect(g.factions.concord.stock.metals).toBeCloseTo(m0 + q, 1);
    expect(prices(g).energy).toBeLessThan(BASE_PRICES.energy);
    expect(prices(g).metals).toBeGreaterThan(BASE_PRICES.metals);
    const e1 = prices(g).energy;
    relaxMarket(g);
    expect(prices(g).energy).toBeGreaterThan(e1);
    expect(applyAction(g, 'concord', { type: 'exchange', sell: 'exotics', buy: 'metals', amount: 9999 }).ok).toBe(false);
    expect(applyAction(g, 'concord', { type: 'exchange', sell: 'metals', buy: 'metals', amount: 5 }).ok).toBe(false);
  });

  it('the Ophidian Black Market pays no fee, and their trade partners pay less', () => {
    const g = createGame({ seed: 'bm', seats: [{ faction: 'concord', name: 'A' }], minors: ['ophidian', 'myrr', 'quorr', 'ixxi', 'nhar', 'tal', 'skarn', 'cryx', 'zenith', 'echo'] });
    expect(exchangeFee(g, 'ophidian')).toBe(0);
    expect(exchangeFee(g, 'concord')).toBe(0.4);
    setStatus(g, 'concord', 'ophidian', 'relations');
    g.relations[relationKey('concord', 'ophidian')].agreements.push('trade');
    expect(exchangeFee(g, 'concord')).toBe(0.2);
  });
});
