import {
  axialOf, axialToOffset, hexDistance, hexesWithin, hexToPixel, indexOf, neighbors, offsetToAxial, pixelToHex, ring,
} from '../src/engine/hex';
import { findPath, reachable } from '../src/engine/path';

const grid = { width: 50, height: 30 };

describe('hex math', () => {
  it('round-trips offset and axial coordinates', () => {
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        const a = offsetToAxial(col, row);
        expect(axialToOffset(a.q, a.r)).toEqual({ col, row });
      }
    }
  });

  it('interior hexes have 6 neighbors at distance 1', () => {
    for (const i of [indexOf(grid, 10, 10), indexOf(grid, 11, 11), indexOf(grid, 25, 4)]) {
      const n = neighbors(grid, i);
      expect(n).toHaveLength(6);
      for (const j of n) expect(hexDistance(grid, i, j)).toBe(1);
    }
  });

  it('corner hexes have fewer neighbors', () => {
    expect(neighbors(grid, 0).length).toBeLessThan(6);
  });

  it('neighbor relation is symmetric', () => {
    for (let i = 0; i < grid.width * grid.height; i += 37) {
      for (const j of neighbors(grid, i)) expect(neighbors(grid, j)).toContain(i);
    }
  });

  it('rings have 6k hexes in the interior and match distance', () => {
    const c = indexOf(grid, 25, 15);
    for (let k = 1; k <= 5; k++) {
      const r = ring(grid, c, k);
      expect(r).toHaveLength(6 * k);
      for (const j of r) expect(hexDistance(grid, c, j)).toBe(k);
    }
    expect(hexesWithin(grid, c, 2)).toHaveLength(19);
  });

  it('pixel conversion round-trips', () => {
    for (let i = 0; i < grid.width * grid.height; i += 13) {
      const p = hexToPixel(grid, i, 20);
      expect(pixelToHex(grid, p.x, p.y, 20)).toBe(i);
    }
  });

  it('distance agrees with axial math', () => {
    const a = indexOf(grid, 0, 0), b = indexOf(grid, 49, 29);
    const aa = axialOf(grid, a), bb = axialOf(grid, b);
    expect(hexDistance(grid, a, b)).toBe((Math.abs(aa.q - bb.q) + Math.abs(aa.r - bb.r) + Math.abs(aa.q + aa.r - bb.q - bb.r)) / 2);
  });
});

describe('pathfinding', () => {
  it('finds a straight path on open ground', () => {
    const a = indexOf(grid, 5, 5), b = indexOf(grid, 12, 5);
    const p = findPath(grid, a, b, () => 1)!;
    expect(p.cost).toBe(7);
    expect(p.path[0]).toBe(a);
    expect(p.path[p.path.length - 1]).toBe(b);
  });

  it('routes around a wall', () => {
    const wall = new Set<number>();
    for (let row = 0; row < 20; row++) wall.add(indexOf(grid, 10, row));
    const a = indexOf(grid, 5, 5), b = indexOf(grid, 15, 5);
    const p = findPath(grid, a, b, (_f, t) => (wall.has(t) ? Infinity : 1))!;
    expect(p).not.toBeNull();
    for (const h of p.path) expect(wall.has(h)).toBe(false);
    expect(p.cost).toBeGreaterThan(10);
  });

  it('uses wormhole links', () => {
    const a = indexOf(grid, 1, 1), b = indexOf(grid, 48, 28);
    const p = findPath(grid, a, b, () => 1, (i) => (i === a ? [b] : []))!;
    expect(p.cost).toBe(1);
  });

  it('reachable respects the budget', () => {
    const c = indexOf(grid, 25, 15);
    const r = reachable(grid, c, 2, () => 1);
    expect(r.size).toBe(19);
  });
});
