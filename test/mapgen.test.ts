import { MAJOR_IDS } from '../src/data/factions';
import { hexDistance, neighbors } from '../src/engine/hex';
import { areaScore } from '../src/engine/mapgen';
import { findPath } from '../src/engine/path';
import { stateHash } from '../src/engine/serialize';
import { createGame, MAP_SIZES } from '../src/engine/setup';

const seeds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];

describe('map generation', () => {
  for (const seed of seeds) {
    describe(`seed ${seed}`, () => {
      const g = createGame({ seed, seats: [{ faction: 'concord', name: 'Ann' }] });
      const { map } = g;
      const ids = Object.keys(g.factions);

      it('has 15 factions including all majors and 10 minors', () => {
        expect(ids).toHaveLength(15);
        for (const m of MAJOR_IDS) expect(ids).toContain(m);
        expect(g.config.minors).toHaveLength(10);
      });

      it('spaces majors at least 9 hexes apart', () => {
        const homes = MAJOR_IDS.map((m) => g.factions[m].home);
        for (let i = 0; i < homes.length; i++)
          for (let j = i + 1; j < homes.length; j++) expect(hexDistance(map, homes[i], homes[j])).toBeGreaterThanOrEqual(9);
      });

      it('gives majors ~20 hexes with home plus two systems, and minors home plus neighbors', () => {
        for (const id of ids) {
          const owned = map.hexes.map((h, i) => (h.owner === id ? i : -1)).filter((i) => i >= 0);
          const systems = owned.filter((i) => map.hexes[i].system);
          if (g.factions[id].kind === 'major') {
            expect(owned.length).toBeGreaterThanOrEqual(19);
            expect(owned.length).toBeLessThanOrEqual(21);
            expect(systems).toHaveLength(3);
          } else {
            expect(owned).toHaveLength(7);
            expect(systems).toHaveLength(1);
          }
          expect(map.hexes[g.factions[id].home].system?.homeOf).toBe(id);
        }
      });

      it('never puts two factions adjacent', () => {
        map.hexes.forEach((h, i) => {
          if (!h.owner) return;
          for (const n of neighbors(map, i)) {
            const o = map.hexes[n].owner;
            if (o) expect(o).toBe(h.owner);
          }
        });
      });

      it('pairs wormholes and keeps homes reachable', () => {
        map.hexes.forEach((h, i) => {
          if (h.terrain === 'wormhole') expect(map.hexes[h.wormhole!].wormhole).toBe(i);
        });
        const homes = ids.map((id) => g.factions[id].home);
        const cost = (_f: number, t: number) => (map.hexes[t].terrain === 'blackHole' ? Infinity : 1);
        for (const h of homes.slice(1)) expect(findPath(map, homes[0], h, cost)).not.toBeNull();
      });

      it('balances resources near major homes', () => {
        const scores = MAJOR_IDS.map((m) => areaScore(map, g.factions[m].home, 6));
        expect(Math.min(...scores)).toBeGreaterThanOrEqual(Math.max(...scores) * 0.85);
      });

      it('has a healthy mix of systems and terrain', () => {
        const systems = map.hexes.filter((h) => h.system).length;
        expect(systems).toBeGreaterThan(80);
        expect(systems).toBeLessThan(400);
        for (const t of ['nebula', 'asteroids', 'wormhole'] as const) expect(map.hexes.some((h) => h.terrain === t)).toBe(true);
      });

      it('gives starting units', () => {
        for (const m of MAJOR_IDS) {
          const fleets = Object.values(g.fleets).filter((f) => f.owner === m);
          expect(fleets.length).toBeGreaterThanOrEqual(4);
          expect(Object.values(g.agents).some((a) => a.owner === m && a.kind === 'diplomat')).toBe(true);
        }
        expect(Object.values(g.agents).filter((a) => a.owner === 'krasnyr' && a.kind === 'spy')).toHaveLength(2);
      });
    });
  }

  it('is deterministic for a seed', () => {
    const a = createGame({ seed: 'same', seats: [{ faction: 'lattice', name: 'X' }] });
    const b = createGame({ seed: 'same', seats: [{ faction: 'lattice', name: 'X' }] });
    expect(stateHash(a)).toBe(stateHash(b));
    const c = createGame({ seed: 'other', seats: [{ faction: 'lattice', name: 'X' }] });
    expect(stateHash(c)).not.toBe(stateHash(a));
  });

  it('works on small and huge maps', () => {
    for (const size of [MAP_SIZES.small, MAP_SIZES.huge]) {
      const g = createGame({ seed: 'size', seats: [{ faction: 'rynkai', name: 'R' }], ...size });
      expect(Object.keys(g.factions)).toHaveLength(15);
    }
  });

  it('validates seats', () => {
    expect(() => createGame({ seed: 's', seats: [] })).toThrow();
    expect(() => createGame({ seed: 's', seats: [{ faction: 'myrr', name: 'M' }] })).toThrow();
    expect(() => createGame({ seed: 's', seats: [{ faction: 'concord', name: 'A' }, { faction: 'concord', name: 'B' }] })).toThrow();
    const g = createGame({ seed: 's', seats: MAJOR_IDS.map((f, i) => ({ faction: f, name: `P${i}` })) });
    expect(Object.values(g.factions).filter((f) => f.controller === 'human')).toHaveLength(5);
  });
});
