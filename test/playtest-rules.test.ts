import { describe, expect, it } from 'vitest';
import { claimBlocker, moveFleet, ORPHAN_TURNS, releaseOrphans } from '../src/engine/movement';
import { endTurn, startTurn } from '../src/engine/turn';
import { neighbors } from '../src/engine/hex';
import { emptyHex, firstDesign, fleetOf, newGame, setStatus } from './helpers';

describe('multi-turn movement', () => {
  it('a fleet on a long route keeps its movement at the start of a turn, can be redirected, and carries on at the end', () => {
    const g = newGame('route');
    g.active = g.turnOrder.indexOf('concord');
    const d = firstDesign('concord', (x) => x.role === 'scout');
    const start = emptyHex(g);
    const fid = fleetOf(g, 'concord', d, start);
    // A destination well beyond one turn's reach.
    let dest = start;
    for (let k = 0; k < d.stats.speed * 3; k++) dest = neighbors(g.map, dest).find((n) => n !== start && g.map.hexes[n].terrain === 'space') ?? dest;
    expect(moveFleet(g, fid, dest).ok).toBe(true);
    const f = g.fleets[fid];
    const after1 = f.hex;
    expect(f.path.length).toBeGreaterThan(0);
    // Turn passes back round to the Concord: the fleet has not moved yet and has its full movement.
    for (let i = 0; i < g.turnOrder.length; i++) { endTurn(g); if (g.turnOrder[g.active] === 'concord') break; }
    expect(g.turnOrder[g.active]).toBe('concord');
    const atStart = f.hex;
    expect(f.movesLeft).toBeGreaterThan(0);
    expect(f.path.length).toBeGreaterThan(0);
    // Its first leg ended at the end of the turn it was ordered (it did not move again at the start).
    expect(atStart).toBe(after1);
    // Left alone, it continues at the end of this turn.
    const before = f.path.length;
    endTurn(g);
    expect(g.fleets[fid].path.length).toBeLessThan(before);
  });
});

describe('claims', () => {
  it('explains why ships will not take a hex', () => {
    const g = newGame('claims');
    const theirs = g.map.hexes.findIndex((h) => h.owner === 'krasnyr' && !h.system);
    setStatus(g, 'concord', 'krasnyr', 'relations');
    expect(claimBlocker(g, 'concord', theirs)).toMatch(/at war/);
    setStatus(g, 'concord', 'krasnyr', 'war');
    expect(claimBlocker(g, 'concord', theirs)).toBeNull();
    const home = g.factions.krasnyr.home;
    expect(claimBlocker(g, 'concord', home)).toMatch(/invade/);
  });
});

/** A Lattice hex ringed by six Concord hexes, away from everyone's systems. */
function enclave(g: ReturnType<typeof newGame>): number {
  const c = emptyHex(g, 4);
  g.map.hexes[c].owner = 'concord';
  for (const n of neighbors(g.map, c)) g.map.hexes[n].owner = 'concord';
  return c;
}

describe('cut-off territory', () => {
  it(`passes to whoever surrounds it after ${ORPHAN_TURNS} turns without a planet, outpost or starbase`, () => {
    const g = newGame('orphans');
    const pocket = enclave(g);
    expect(pocket).toBeGreaterThanOrEqual(0);
    g.map.hexes[pocket].owner = 'lattice';
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
    g.turn += ORPHAN_TURNS - 1;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
    g.turn += 1;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('concord');
  });

  it('is kept while the owner has ships there, and never touches connected territory', () => {
    const g = newGame('orphans2');
    const pocket = enclave(g);
    g.map.hexes[pocket].owner = 'lattice';
    fleetOf(g, 'lattice', firstDesign('lattice', (x) => x.role === 'scout'), pocket);
    releaseOrphans(g, 'lattice');
    g.turn += ORPHAN_TURNS + 1;
    releaseOrphans(g, 'lattice');
    expect(g.map.hexes[pocket].owner).toBe('lattice');
    const lattice = g.map.hexes.filter((h) => h.owner === 'lattice').length;
    startTurn(g);
    expect(g.map.hexes.filter((h) => h.owner === 'lattice').length).toBeGreaterThanOrEqual(lattice - 1);
  });
});
