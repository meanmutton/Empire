import { TECH_BY_ID, TECHS } from '../src/data/techs';
import { neighbors } from '../src/engine/hex';
import { connectedHexes, ownedHexes } from '../src/engine/query';
import { stateHash } from '../src/engine/serialize';
import { createGame } from '../src/engine/setup';
import type { GameState } from '../src/engine/types';

const cache = new Map<string, GameState>();
function totalWar(seed = 'tw'): GameState {
  if (!cache.has(seed)) cache.set(seed, createGame({ seed, seats: [{ faction: 'concord', name: 'A' }], preset: 'totalWar' }));
  return cache.get(seed)!;
}

describe('Total War advanced start', () => {
  it('claims the galaxy: about 60% great powers, 40% minor powers', () => {
    const g = totalWar();
    const owned = (fs: string[]) => g.map.hexes.filter((h) => h.owner && fs.includes(h.owner)).length;
    const maj = owned(g.config.majors), min = owned(g.config.minors);
    expect(maj / (maj + min)).toBeGreaterThan(0.55);
    expect(maj / (maj + min)).toBeLessThan(0.7);
    const claimable = g.map.hexes.filter((h) => h.terrain !== 'blackHole').length;
    expect((maj + min) / claimable).toBeGreaterThan(0.7);
  });

  it('leaves a neutral hex between every two powers', () => {
    const g = totalWar();
    for (let i = 0; i < g.map.hexes.length; i++) {
      const a = g.map.hexes[i].owner;
      if (!a) continue;
      for (const n of neighbors(g.map, i)) {
        const b = g.map.hexes[n].owner;
        expect(!b || b === a, `${a} at ${i} touches ${b} at ${n}`).toBe(true);
      }
    }
  });

  it('gives every power one connected territory around its home', () => {
    for (const seed of ['tw', 'tw-1', 'tw-3']) {
      const g = totalWar(seed);
      for (const f of Object.keys(g.factions)) expect(ownedHexes(g, f).every((h) => connectedHexes(g, f).has(h)), `${seed} ${f}`).toBe(true);
    }
  });

  it('develops every colony a third of the way', () => {
    const g = totalWar();
    const systems = g.map.hexes.filter((h) => h.owner && h.system);
    expect(systems.length).toBeGreaterThan(100);
    for (const h of systems) {
      expect(h.system!.development).toBeGreaterThanOrEqual(2);
      if (!h.system!.homeOf) expect(h.system!.improvements.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives great powers 30 ships, 5 diplomats and 5 spies; minor powers 10 ships', () => {
    const g = totalWar();
    for (const f of [...g.config.majors, ...g.config.minors]) {
      const ships = Object.values(g.ships).filter((s) => s.owner === f).length;
      const agents = Object.values(g.agents).filter((a) => a.owner === f);
      if (g.factions[f].kind === 'major') {
        expect(ships).toBe(30);
        expect(agents.filter((a) => a.kind === 'diplomat')).toHaveLength(5);
        expect(agents.filter((a) => a.kind === 'spy')).toHaveLength(5);
      } else expect(ships).toBe(10);
    }
    for (const fl of Object.values(g.fleets)) expect(fl.ships.length).toBeLessThanOrEqual(6);
  });

  it('knows a third of the tech tree, leaning the way each faction researches', () => {
    const g = totalWar();
    const goal = Math.round((TECHS.length - 1) / 3);
    for (const f of Object.keys(g.factions)) expect(g.factions[f].research.known).toHaveLength(goal);
    const inField = (f: string, field: string) => g.factions[f].research.known.filter((t) => TECH_BY_ID[t].field === field).length;
    expect(inField('rynkai', 'weapons')).toBeGreaterThan(inField('concord', 'weapons'));
    expect(inField('concord', 'society')).toBeGreaterThanOrEqual(inField('rynkai', 'society'));
  });

  it('is the same galaxy on every machine, and Classic games are untouched', () => {
    const a = createGame({ seed: 'tw-same', seats: [{ faction: 'concord', name: 'A' }], preset: 'totalWar' });
    const b = createGame({ seed: 'tw-same', seats: [{ faction: 'concord', name: 'A' }], preset: 'totalWar' });
    expect(stateHash(a)).toBe(stateHash(b));
    const classic = createGame({ seed: 'tw-same', seats: [{ faction: 'concord', name: 'A' }] });
    expect(Object.values(classic.ships).filter((s) => s.owner === 'concord').length).toBeLessThan(10);
  });
});
