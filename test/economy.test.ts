import { DESIGNS_BY_FACTION } from '../src/data/designs';
import {
  cancelBuild, checkBuild, factionIncome, popCapOf, queueBuild, runEconomy, rushBuild, slotsOf, systemYield,
} from '../src/engine/economy';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';

function game(): GameState {
  return createGame({ seed: 'econ', seats: [{ faction: 'concord', name: 'A' }] });
}

describe('economy', () => {
  it('home systems produce every resource', () => {
    const g = game();
    const y = systemYield(g, g.factions.concord.home);
    expect(y.energy).toBeGreaterThan(0);
    expect(y.metals).toBeGreaterThan(0);
    expect(y.science).toBeGreaterThan(0);
    expect(y.population).toBeGreaterThan(0);
  });

  it('applies faction modifiers to income', () => {
    const g = game();
    const c = factionIncome(g, 'concord');
    expect(c.gross.science).toBeGreaterThan(0);
    expect(c.upkeep).toBeGreaterThan(0);
    expect(c.net.energy).toBeLessThan(c.gross.energy);
  });

  it('collects income and grows population at start of turn', () => {
    const g = game();
    const f = g.factions.concord;
    const sys = g.map.hexes[f.home].system!;
    const before = { ...f.stock };
    const pop = sys.population;
    const report = runEconomy(g, 'concord');
    expect(f.stock.metals).toBeCloseTo(before.metals + report.net.metals, 1);
    expect(f.research.progress).toBeGreaterThan(0);
    expect(sys.population).toBeGreaterThan(pop);
    expect(sys.population).toBeLessThanOrEqual(popCapOf(g, sys, 'concord'));
  });

  it('halves output of disconnected systems', () => {
    const g = game();
    const home = g.factions.concord.home;
    const connected = systemYield(g, home, new Set([home]));
    const disc = systemYield(g, home, new Set());
    expect(disc.metals).toBeCloseTo(connected.metals / 2, 5);
  });

  it('builds a ship over several turns and pays up front', () => {
    const g = game();
    const home = g.factions.concord.home;
    const d = DESIGNS_BY_FACTION.concord.find((x) => x.name === 'Birch')!;
    const metals = g.factions.concord.stock.metals;
    const r = queueBuild(g, 'concord', home, 'ship', d.id);
    expect(r.ok).toBe(true);
    expect(g.factions.concord.stock.metals).toBeCloseTo(metals - d.cost.metals, 1);
    const fleetsBefore = Object.keys(g.fleets).length;
    for (let i = 0; i < 6 && g.map.hexes[home].system!.queue.length; i++) runEconomy(g, 'concord');
    expect(Object.keys(g.fleets).length).toBe(fleetsBefore + 1);
    expect(g.log.some((e) => e.kind === 'built')).toBe(true);
  });

  it('refuses ships without the tech or shipyard', () => {
    const g = game();
    const home = g.factions.concord.home;
    const bs = DESIGNS_BY_FACTION.concord.find((x) => x.cls === 'battleship')!;
    expect(checkBuild(g, 'concord', home, 'ship', bs.id).ok).toBe(false);
    g.factions.concord.research.known.push('hull4');
    const r = checkBuild(g, 'concord', home, 'ship', bs.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/heavy shipyard/);
    const other = Object.values(g.map.hexes).findIndex((h) => h.owner === 'concord' && h.system && !h.system.homeOf);
    expect(checkBuild(g, 'concord', other, 'ship', DESIGNS_BY_FACTION.concord[2].id).ok).toBe(false);
  });

  it('enforces improvement slots and uniqueness', () => {
    const g = game();
    const home = g.factions.concord.home;
    const sys = g.map.hexes[home].system!;
    expect(slotsOf(sys)).toBe(5);
    g.factions.concord.stock.metals = 1000;
    g.factions.concord.stock.energy = 1000;
    expect(queueBuild(g, 'concord', home, 'improvement', 'shipyard').ok).toBe(false);
    expect(queueBuild(g, 'concord', home, 'improvement', 'mine').ok).toBe(true);
    expect(queueBuild(g, 'concord', home, 'improvement', 'mine').ok).toBe(false);
  });

  it('develops systems and cancels with a refund', () => {
    const g = game();
    const colony = g.map.hexes.findIndex((h) => h.owner === 'concord' && h.system && !h.system.homeOf);
    const sys = g.map.hexes[colony].system!;
    expect(sys.development).toBe(1);
    expect(queueBuild(g, 'concord', colony, 'develop', '').ok).toBe(true);
    for (let i = 0; i < 10 && sys.queue.length; i++) runEconomy(g, 'concord');
    expect(sys.development).toBe(2);
    g.factions.concord.stock.metals = 500;
    queueBuild(g, 'concord', colony, 'improvement', 'mine');
    const m = g.factions.concord.stock.metals;
    expect(cancelBuild(g, 'concord', colony, 0)).toBe(true);
    expect(g.factions.concord.stock.metals).toBeGreaterThan(m);
  });

  it('refunds everything until work begins, then half, for every kind of build', () => {
    const g = game();
    const home = g.factions.concord.home;
    const sys = g.map.hexes[home].system!;
    const st = g.factions.concord.stock;
    st.metals = 1000; st.energy = 1000;
    sys.queue = [];
    const pop0 = sys.population;
    expect(queueBuild(g, 'concord', home, 'army', '').ok).toBe(true);
    expect(queueBuild(g, 'concord', home, 'spy', '').ok).toBe(true);
    const before = { metals: st.metals, energy: st.energy };
    // The spy, second in line, hasn't started: all back.
    const spyCost = sys.queue[1].paid!;
    expect(cancelBuild(g, 'concord', home, 1)).toBe(true);
    expect(st.energy).toBeCloseTo(before.energy + spyCost.energy);
    // The army starts building this turn: half back, and half the population it took.
    const armyCost = sys.queue[0].paid!;
    sys.queue[0].remaining -= 1;
    const m = st.metals, pop = sys.population;
    expect(cancelBuild(g, 'concord', home, 0)).toBe(true);
    expect(st.metals).toBeCloseTo(m + armyCost.metals / 2);
    expect(sys.population).toBeCloseTo(pop + armyCost.population / 2);
    expect(sys.population).toBeLessThan(pop0);
  });

  it('rush-buys with energy', () => {
    const g = game();
    const home = g.factions.concord.home;
    queueBuild(g, 'concord', home, 'army', '');
    g.factions.concord.stock.energy = 1000;
    expect(rushBuild(g, 'concord', home)).toBe(true);
    const armies = Object.keys(g.armies).length;
    runEconomy(g, 'concord');
    expect(Object.keys(g.armies).length).toBe(armies + 1);
  });

  it('krasnyr spies are cheaper', () => {
    const g = game();
    const k = checkBuild(g, 'krasnyr', g.factions.krasnyr.home, 'spy', '');
    const c = checkBuild(g, 'concord', g.factions.concord.home, 'spy', '');
    expect(k.ok && c.ok && k.cost.energy < c.cost.energy).toBe(true);
  });
});
