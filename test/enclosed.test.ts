import { DESIGNS } from '../src/data/designs';
import { claimEnclosed, MAX_ENCLOSED } from '../src/engine/movement';
import { neighbors, ring } from '../src/engine/hex';
import type { GameState } from '../src/engine/types';
import { emptyHex, fleetOf, newGame, setStatus } from './helpers';

/** Gives `owner` a ring of territory around `center` at distance `r`, with everything inside left empty. */
function ringAround(g: GameState, center: number, r: number, owner: string): number[] {
  const inside: number[] = [center];
  for (let k = 1; k < r; k++) inside.push(...ring(g.map, center, k));
  for (const h of inside) { g.map.hexes[h].owner = null; g.map.hexes[h].system = null; g.map.hexes[h].terrain = 'space'; }
  for (const h of ring(g.map, center, r)) g.map.hexes[h].owner = owner;
  return inside;
}

describe('enclosed empty space', () => {
  it('joins the territory that surrounds it', () => {
    const g = newGame('enc');
    const c = emptyHex(g, 5);
    const inside = ringAround(g, c, 3, 'concord');
    const got = claimEnclosed(g, 'concord');
    expect(got.sort()).toEqual([...inside].sort());
    expect(inside.every((h) => g.map.hexes[h].owner === 'concord')).toBe(true);
    expect(g.log.at(-1)!.kind).toBe('claim');
  });

  it('is not taken when another power shares the border', () => {
    const g = newGame('enc');
    const c = emptyHex(g, 5);
    const inside = ringAround(g, c, 2, 'concord');
    g.map.hexes[ring(g.map, c, 2)[0]].owner = 'krasnyr';
    expect(claimEnclosed(g, 'concord')).toEqual([]);
    expect(inside.every((h) => g.map.hexes[h].owner === null)).toBe(true);
  });

  it('leaves settled independent worlds, black holes and hexes with other ships alone', () => {
    const g = newGame('enc');
    const c = emptyHex(g, 5);
    const inside = ringAround(g, c, 3, 'concord');
    const [a, b, d] = ring(g.map, c, 1);
    g.map.hexes[a].system = { ...structuredClone(Object.values(g.map.hexes).find((x) => x.system)!.system!), development: 2 };
    g.map.hexes[b].terrain = 'blackHole';
    setStatus(g, 'concord', 'krasnyr', 'war');
    fleetOf(g, 'krasnyr', DESIGNS['lattice:tensor'], d, 1);
    const got = claimEnclosed(g, 'concord');
    expect(got).not.toContain(a);
    expect(got).not.toContain(b);
    expect(got).not.toContain(d);
    expect(got.length).toBe(inside.length - 3);
  });

  it('ignores pockets against the edge of the map, and very large ones', () => {
    const g = newGame('enc');
    // A pocket in the corner, walled off by a diagonal of Concord hexes.
    const corner = 0;
    for (const n of neighbors(g.map, corner)) g.map.hexes[n].owner = 'concord';
    g.map.hexes[corner].owner = null;
    expect(claimEnclosed(g, 'concord')).not.toContain(corner);
    expect(MAX_ENCLOSED).toBeGreaterThan(30);
  });
});
