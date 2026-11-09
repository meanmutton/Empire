import { DESIGNS } from '../src/data/designs';
import { blockadedHexes, blockadersAt } from '../src/engine/blockade';
import { factionIncome, queueBuild, runEconomy, rushBuild, systemYield } from '../src/engine/economy';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';
import { firstDesign, fleetOf, newGame, setStatus } from './helpers';

function colonyOf(g: GameState, f: string): number {
  return g.map.hexes.findIndex((h) => h.owner === f && h.system && h.system.development > 0 && !h.system.homeOf);
}

describe('blockades', () => {
  it('enemy warships alone in a system blockade it and halve its output', () => {
    const g = newGame('blk');
    const hex = colonyOf(g, 'rynkai');
    const before = systemYield(g, hex);
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 2);
    expect(blockadersAt(g, hex)).toEqual([]); // not at war yet
    setStatus(g, 'concord', 'rynkai', 'war');
    expect(blockadersAt(g, hex)).toEqual(['concord']);
    expect(blockadedHexes(g, 'rynkai').has(hex)).toBe(true);
    const after = systemYield(g, hex);
    expect(after.metals).toBeCloseTo(before.metals / 2, 5);
    expect(after.energy).toBeCloseTo(before.energy / 2, 5);
    expect(factionIncome(g, 'rynkai').bySystem[hex].metals).toBeCloseTo(before.metals / 2, 5);
  });

  it('unarmed ships do not blockade, and defenders or a starbase lift it', () => {
    const g = newGame('blk');
    setStatus(g, 'concord', 'rynkai', 'war');
    const hex = colonyOf(g, 'rynkai');
    fleetOf(g, 'concord', firstDesign('concord', (d) => d.role === 'colony'), hex);
    expect(blockadersAt(g, hex)).toEqual([]);
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex);
    expect(blockadersAt(g, hex)).toEqual(['concord']);
    g.starbases.sb = { id: 'sb', owner: 'rynkai', hex, tier: 1, hull: 150 };
    expect(blockadersAt(g, hex)).toEqual([]);
    delete g.starbases.sb;
    fleetOf(g, 'rynkai', DESIGNS['lattice:tensor'], hex);
    expect(blockadersAt(g, hex)).toEqual([]);
  });

  it("a blockaded shipyard can't finish or rush ships, but other builds continue", () => {
    const g = newGame('blk');
    setStatus(g, 'concord', 'rynkai', 'war');
    const home = g.factions.rynkai.home;
    for (const f of Object.values(g.fleets)) if (f.owner === 'rynkai' && f.hex === home) f.hex = colonyOf(g, 'rynkai');
    g.factions.rynkai.stock = { energy: 5000, metals: 5000, exotics: 50 };
    const ship = firstDesign('rynkai', (d) => d.cls === 'corvette' && d.role === 'line');
    expect(queueBuild(g, 'rynkai', home, 'ship', ship.id).ok).toBe(true);
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], home, 3);
    expect(rushBuild(g, 'rynkai', home)).toBe(false);
    const fleets = Object.values(g.fleets).filter((f) => f.owner === 'rynkai').length;
    for (let i = 0; i < 5; i++) runEconomy(g, 'rynkai');
    expect(Object.values(g.fleets).filter((f) => f.owner === 'rynkai').length).toBe(fleets);
    expect(g.log.some((e) => e.kind === 'blockade')).toBe(true);
    // Improvements still progress.
    g.map.hexes[home].system!.queue = [];
    expect(queueBuild(g, 'rynkai', home, 'improvement', 'garrison').ok).toBe(true);
    for (let i = 0; i < 10 && g.map.hexes[home].system!.queue.length; i++) runEconomy(g, 'rynkai');
    expect(g.map.hexes[home].system!.improvements).toContain('garrison');
  });

  it('Haldane systems cannot be blockaded', () => {
    const g = createGame({ seed: 'blk-h', seats: [{ faction: 'concord', name: 'A' }], minors: ['haldane', 'myrr', 'quorr', 'ixxi', 'nhar', 'tal', 'skarn', 'cryx', 'zenith', 'echo'] });
    setStatus(g, 'concord', 'haldane', 'war');
    const home = g.factions.haldane.home;
    for (const f of Object.values(g.fleets)) if (f.owner === 'haldane') f.hex = 0;
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], home, 2);
    expect(blockadersAt(g, home)).toEqual([]);
  });
});
