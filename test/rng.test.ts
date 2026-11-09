import { Rng, seedRng } from '../src/engine/rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = Rng.fromSeed('galaxy-1'), b = Rng.fromSeed('galaxy-1');
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs between seeds', () => {
    const a = Rng.fromSeed(1), b = Rng.fromSeed(2);
    expect(a.nextU32()).not.toBe(b.nextU32());
  });

  it('resumes from serialized state', () => {
    const a = Rng.fromSeed(42);
    a.next(); a.next();
    const b = new Rng(JSON.parse(JSON.stringify(a.state)));
    expect(b.next()).toBe(a.next());
  });

  it('mutates the state array in place', () => {
    const state = seedRng(7);
    const before = state.slice();
    new Rng(state).next();
    expect(state).not.toEqual(before);
  });

  it('produces roughly uniform ints', () => {
    const r = Rng.fromSeed('uniform');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60000; i++) counts[r.int(6)]++;
    for (const c of counts) expect(Math.abs(c - 10000)).toBeLessThan(500);
  });

  it('range, shuffle and weighted behave', () => {
    const r = Rng.fromSeed(3);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
    const items = [1, 2, 3, 4, 5, 6, 7];
    expect(r.shuffle(items).sort()).toEqual(items);
    const w: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 1000; i++) w[r.weighted({ a: 1, b: 0, c: -1 } as Record<string, number>)]++;
    expect(w.a).toBe(1000);
  });
});
