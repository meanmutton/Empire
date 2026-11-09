import { aiTurn } from '../src/ai/ai';
import { MAJOR_IDS } from '../src/data/factions';
import { ownedHexes } from '../src/engine/query';
import { stateHash } from '../src/engine/serialize';
import { createGame } from '../src/engine/setup';
import { beginGame, endTurn, runUntilHuman } from '../src/engine/turn';
import type { GameState } from '../src/engine/types';

function aiOnlyGame(seed: string): GameState {
  return createGame({ seed, seats: [{ faction: 'concord', name: 'Bot' }] });
}

/** Plays `rounds` rounds with the computer also playing the (single) human seat. */
function simulate(g: GameState, rounds: number): void {
  beginGame(g, aiTurn);
  for (let r = 0; r < rounds && !g.winner; r++) {
    aiTurn(g, 'concord');
    endTurn(g);
    runUntilHuman(g, aiTurn);
  }
}

describe('computer players', { timeout: 120000 }, () => {
  const g = aiOnlyGame('sim-1');
  const t0 = performance.now();
  simulate(g, 80);
  const ms = performance.now() - t0;
  const summary = MAJOR_IDS.map((m) => ({
    m,
    hexes: ownedHexes(g, m).length,
    systems: ownedHexes(g, m).filter((h) => g.map.hexes[h].system).length,
    ships: Object.values(g.ships).filter((s) => s.owner === m).length,
    techs: g.factions[m].research.known.length,
    energy: Math.round(g.factions[m].stock.energy),
    metals: Math.round(g.factions[m].stock.metals),
    alive: g.factions[m].alive,
  }));

  it('plays 80 rounds in reasonable time', () => {
    console.log(`80 rounds in ${Math.round(ms)}ms; turn ${g.turn}; winner ${g.winner}`);
    console.table(summary);
    const rel = Object.values(g.relations);
    console.log('wars', rel.filter((r) => r.status === 'war').length, 'embassies', rel.filter((r) => r.embassyA || r.embassyB).length,
      'agreements', rel.reduce((a, r) => a + r.agreements.length, 0), 'vassals', Object.values(g.factions).filter((f) => f.overlord).length);
    expect(ms).toBeLessThan(60000);
  });

  it('majors expand, build and research', () => {
    for (const s of summary) {
      if (!s.alive) continue;
      expect(s.hexes, s.m).toBeGreaterThan(22);
      expect(s.systems, s.m).toBeGreaterThan(3);
      expect(s.ships, s.m).toBeGreaterThan(4);
      expect(s.techs, s.m).toBeGreaterThan(4);
    }
  });

  it('makes diplomatic contact and opens embassies', () => {
    const rel = Object.values(g.relations);
    expect(rel.filter((r) => r.contact).length).toBeGreaterThan(10);
    expect(rel.filter((r) => r.embassyA || r.embassyB).length).toBeGreaterThan(3);
  });

  it('minors stay near home', () => {
    for (const id of g.config.minors) {
      if (!g.factions[id].alive) continue;
      for (const h of ownedHexes(g, id)) {
        const d = Math.abs((h % g.map.width) - (g.factions[id].home % g.map.width));
        expect(d).toBeLessThan(8);
      }
    }
  });

  it('is deterministic', { timeout: 60000 }, () => {
    const a = aiOnlyGame('sim-2'), b = aiOnlyGame('sim-2');
    simulate(a, 15);
    simulate(b, 15);
    expect(stateHash(a)).toBe(stateHash(b));
  });
});
