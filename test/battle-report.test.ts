import { DESIGNS } from '../src/data/designs';
import { resolveBattleAt } from '../src/engine/combat';
import { pruneLog } from '../src/engine/events';
import { seedRng } from '../src/engine/rng';
import { emptyHex, firstDesign, fleetOf, newGame, setStatus } from './helpers';

describe('battle records', () => {
  it('record each side’s ships before and after, and link from the event log', () => {
    const g = newGame('br');
    g.rng = seedRng('br1');
    const hex = emptyHex(g);
    setStatus(g, 'rynkai', 'concord', 'war');
    fleetOf(g, 'rynkai', DESIGNS['lattice:tensor'], hex, 6);
    const esc = firstDesign('concord', (d) => d.role === 'escort');
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 4);
    fleetOf(g, 'concord', esc, hex, 2);
    resolveBattleAt(g, hex, 'rynkai');
    const b = g.battleLog!.at(-1)!;
    expect(b.firstRound).toBe(true);
    const ryn = b.sides.find((s) => s.faction === 'rynkai')!, con = b.sides.find((s) => s.faction === 'concord')!;
    expect(ryn.ships.reduce((a, r) => a + r.before, 0)).toBe(6);
    expect(con.ships.reduce((a, r) => a + r.before, 0)).toBe(6);
    const conLost = con.ships.reduce((a, r) => a + r.destroyed + r.captured, 0);
    const conLeft = Object.values(g.fleets).filter((f) => f.owner === 'concord' && f.hex === hex).reduce((a, f) => a + f.ships.length, 0);
    expect(conLost + conLeft).toBe(6);
    expect(ryn.notes.join(' ')).toMatch(/Way of the Blade/);
    expect(con.notes.join(' ')).toMatch(/escorts/);
    expect(ryn.attack).toBeGreaterThan(0);
    expect(ryn.dealt).toBeGreaterThan(0);
    const e = g.log.at(-1)!;
    expect(e.kind).toBe('battle');
    expect(e.ref).toBe(b.id);
  });

  it('record planetary defense and terrain effects', () => {
    const g = newGame('br');
    const home = g.factions.lattice.home;
    setStatus(g, 'concord', 'lattice', 'war');
    for (const f of Object.values(g.fleets)) if (f.owner === 'lattice' && f.hex === home) f.hex = 0;
    fleetOf(g, 'concord', firstDesign('lattice', (d) => d.cls === 'battleship' && d.role === 'line'), home, 6);
    resolveBattleAt(g, home, 'concord');
    const side = g.battleLog!.at(-1)!.sides.find((s) => s.faction === 'lattice')!;
    expect(side.planet!.defenseBefore).toBeGreaterThan(side.planet!.defenseAfter);
    const neb = emptyHex(g);
    g.map.hexes[neb].terrain = 'nebula';
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], neb, 2);
    fleetOf(g, 'lattice', DESIGNS['lattice:tensor'], neb, 2);
    resolveBattleAt(g, neb, 'concord');
    expect(g.battleLog!.at(-1)!.sides[0].notes.join(' ')).toMatch(/nebula/);
  });

  it('are pruned with the event log', () => {
    const g = newGame('br');
    const hex = emptyHex(g);
    setStatus(g, 'concord', 'lattice', 'war');
    fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 2);
    fleetOf(g, 'lattice', DESIGNS['lattice:tensor'], hex, 2);
    resolveBattleAt(g, hex, 'concord');
    expect(g.battleLog).toHaveLength(1);
    g.turn += 10;
    pruneLog(g);
    expect(g.battleLog).toHaveLength(0);
  });
});
