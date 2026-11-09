import { DESIGNS } from '../src/data/designs';
import { runMinorAbilities } from '../src/engine/abilities';
import { resolveBattleAt } from '../src/engine/combat';
import { hexesWithin } from '../src/engine/hex';
import { relationKey } from '../src/engine/ids';
import { seedRng } from '../src/engine/rng';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';
import { emptyHex, firstDesign, fleetOf } from './helpers';

const MINORS = ['ghaltar', 'vesh', 'ophidian', 'haldane', 'taurine', 'myrr', 'quorr', 'ixxi', 'nhar', 'tal'];
let base: GameState | null = null;
function game(): GameState {
  base ??= createGame({ seed: 'abil', seats: [{ faction: 'concord', name: 'A' }], minors: MINORS });
  return structuredClone(base);
}
function war(g: GameState, a: string, b: string) {
  const r = g.relations[relationKey(a, b)];
  r.status = 'war';
  r.contact = true;
}

describe('minor faction abilities', () => {
  it("Ghal'tar raiders skim enemy systems", () => {
    const g = game();
    war(g, 'ghaltar', 'concord');
    fleetOf(g, 'ghaltar', firstDesign('ghaltar', (d) => d.role === 'raider'), g.factions.concord.home);
    const e0 = g.factions.ghaltar.stock.energy;
    runMinorAbilities(g, 'ghaltar');
    expect(g.factions.ghaltar.stock.energy).toBeGreaterThan(e0);
  });

  it('Vesh missionaries raise unrest nearby', () => {
    const g = game();
    const near = hexesWithin(g.map, g.factions.vesh.home, 3);
    const target = g.map.hexes.findIndex((h, i) => h.owner === 'concord' && h.system && h.system.development > 0 && !near.includes(i));
    // Move a Concord system next to the Vesh for the test.
    const spot = near.find((i) => !g.map.hexes[i].owner && !g.map.hexes[i].system)!;
    g.map.hexes[spot].system = structuredClone(g.map.hexes[target].system);
    g.map.hexes[spot].owner = 'concord';
    runMinorAbilities(g, 'vesh');
    expect(g.map.hexes[spot].system!.unrest).toBe(5);
  });

  it('Taurine homes start with doubled defenses', () => {
    const g = game();
    expect(g.map.hexes[g.factions.taurine.home].system!.defense).toBe(50);
  });

  it('Ophidian bribery blunts attackers in their territory', () => {
    const lost = (bribe: boolean) => {
      let total = 0;
      for (let t = 0; t < 20; t++) {
        const g = game();
        g.rng = seedRng(`o${t}`);
        const hex = emptyHex(g);
        g.map.hexes[hex].owner = bribe ? 'ophidian' : null;
        war(g, 'ophidian', 'concord');
        const d = DESIGNS['lattice:tensor'];
        fleetOf(g, 'ophidian', d, hex, 6);
        fleetOf(g, 'concord', d, hex, 6);
        resolveBattleAt(g, hex, 'concord');
        total += 6 - Object.values(g.fleets).filter((f) => f.owner === 'ophidian' && f.hex === hex).reduce((a, f) => a + f.ships.length, 0);
      }
      return total;
    };
    expect(lost(true)).toBeLessThan(lost(false));
  });

  it('Haldane cargo ships draw little fire', () => {
    let cargoLost = 0, lineLost = 0;
    for (let t = 0; t < 20; t++) {
      const g = game();
      g.rng = seedRng(`h${t}`);
      const hex = emptyHex(g);
      war(g, 'haldane', 'concord');
      const cargo = fleetOf(g, 'haldane', firstDesign('haldane', (d) => d.role === 'cargo' && d.cls === 'frigate'), hex, 3);
      const line = fleetOf(g, 'haldane', DESIGNS['lattice:tensor'], hex, 3);
      fleetOf(g, 'concord', DESIGNS['lattice:tensor'], hex, 6);
      resolveBattleAt(g, hex, 'concord');
      cargoLost += 3 - (g.fleets[cargo]?.ships.length ?? 0);
      lineLost += 3 - (g.fleets[line]?.ships.length ?? 0);
    }
    expect(cargoLost).toBeLessThan(lineLost);
  });
});
