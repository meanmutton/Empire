/**
 * Deterministic, serializable pseudo-random generator (sfc32). Every random decision in the engine goes
 * through one of these, with its state stored in the game state, so every client computes the same game.
 */
export type RngState = [number, number, number, number];

export function seedRng(seed: number | string): RngState {
  // Hash the seed into 128 bits with a splitmix-like mixer.
  let h = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    h = (h + 0x9e3779b9) >>> 0;
    let z = h;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    out.push((z ^ (z >>> 16)) >>> 0);
  }
  const s = out as RngState;
  const rng = new Rng(s);
  for (let i = 0; i < 12; i++) rng.nextU32();
  return rng.state;
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Rng {
  /** The live state array. Mutated in place, so a Rng over `gameState.rng` keeps the game state current. */
  readonly state: RngState;

  constructor(state: RngState) {
    this.state = state;
  }

  static fromSeed(seed: number | string): Rng {
    return new Rng(seedRng(seed));
  }

  nextU32(): number {
    const s = this.state;
    let a = s[0] >>> 0, b = s[1] >>> 0, c = s[2] >>> 0, d = s[3] >>> 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    s[0] = a >>> 0; s[1] = b >>> 0; s[2] = c; s[3] = d;
    return t;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n);
  }

  /** Integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** Float in [lo, hi). */
  float(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[this.int(items.length)];
  }

  /** Shuffles a copy of `items`. */
  shuffle<T>(items: readonly T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Picks a key by weight. Weights ≤ 0 are never picked. */
  weighted<K extends string>(weights: Partial<Record<K, number>>): K {
    const entries = Object.entries(weights) as [K, number][];
    let total = 0;
    for (const [, w] of entries) if (w > 0) total += w;
    if (total <= 0) throw new Error('weighted pick with no positive weights');
    let x = this.next() * total;
    for (const [k, w] of entries) {
      if (w <= 0) continue;
      x -= w;
      if (x < 0) return k;
    }
    return entries.filter(([, w]) => w > 0).pop()![0];
  }
}
