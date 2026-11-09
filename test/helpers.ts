import { DESIGNS_BY_FACTION, type ShipDesign } from '../src/data/designs';
import { relationKey } from '../src/engine/ids';
import { createGame, spawnShip } from '../src/engine/setup';
import type { GameState, RelationStatus } from '../src/engine/types';

/** Minors used by tests, so ability tests can rely on them. */
export const TEST_MINORS = ['nhar', 'myrr', 'quorr', 'ghaltar', 'ixxi', 'celestine', 'cryx', 'kethran', 'skarn', 'tal'];

const cache = new Map<string, GameState>();

/** A fresh game for tests. Generated once per seed, then cloned. */
export function newGame(seed = 'test'): GameState {
  let g = cache.get(seed);
  if (!g) {
    g = createGame({ seed, seats: [{ faction: 'concord', name: 'Tester' }], minors: TEST_MINORS });
    cache.set(seed, g);
  }
  return structuredClone(g);
}

export function setStatus(g: GameState, a: string, b: string, status: RelationStatus): void {
  const r = g.relations[relationKey(a, b)];
  r.status = status;
  r.contact = true;
}

export function designNamed(faction: string, name: string): ShipDesign {
  const d = DESIGNS_BY_FACTION[faction].find((x) => x.name === name);
  if (!d) throw new Error(`no design ${faction}/${name}`);
  return d;
}

export function firstDesign(faction: string, test: (d: ShipDesign) => boolean): ShipDesign {
  const d = DESIGNS_BY_FACTION[faction].find(test);
  if (!d) throw new Error(`no design for ${faction}`);
  return d;
}

/** Spawns `count` ships of a design as one fleet at hex. */
export function fleetOf(g: GameState, faction: string, d: ShipDesign, hex: number, count = 1): string {
  const fid = spawnShip(g, faction, d, hex);
  for (let i = 1; i < count; i++) spawnShip(g, faction, d, hex, fid);
  g.fleets[fid].movesLeft = d.stats.speed;
  return fid;
}

/** An empty open-space hex far from everyone, with open space around it. */
export function emptyHex(g: GameState, minDistFromOwned = 3): number {
  const owned = g.map.hexes.map((h, i) => (h.owner ? i : -1)).filter((i) => i >= 0);
  const w = g.map.width;
  for (let i = 0; i < g.map.hexes.length; i++) {
    const h = g.map.hexes[i];
    const col = i % w, row = Math.floor(i / w);
    if (col < 4 || row < 4 || col > w - 5 || row > g.map.height - 5) continue;
    if (h.terrain !== 'space' || h.system || h.owner) continue;
    if (Object.values(g.fleets).some((f) => f.hex === i)) continue;
    const dx = (j: number) => Math.abs((j % w) - col) + Math.abs(Math.floor(j / w) - row);
    if (owned.every((j) => dx(j) > minDistFromOwned * 2)) return i;
  }
  throw new Error('no empty hex');
}
