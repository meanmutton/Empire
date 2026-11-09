import { GridSize, hexDistance, neighbors } from './hex';

/** Cost to enter `to` from `from`; Infinity means impassable. */
export type StepCost = (from: number, to: number) => number;

export interface PathResult {
  /** Hexes from start to goal inclusive. */
  path: number[];
  cost: number;
}

/** A* shortest path. Extra neighbor links (wormholes) can be supplied. Returns null if unreachable. */
export function findPath(
  grid: GridSize,
  start: number,
  goal: number,
  cost: StepCost,
  extraLinks?: (index: number) => number[],
  maxCost = Infinity,
): PathResult | null {
  if (start === goal) return { path: [start], cost: 0 };
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open = new MinHeap();
  open.push(start, hexDistance(grid, start, goal));
  const closed = new Set<number>();
  while (open.size > 0) {
    const cur = open.pop()!;
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    const base = g.get(cur)!;
    const next = neighbors(grid, cur);
    if (extraLinks) next.push(...extraLinks(cur));
    for (const n of next) {
      const c = cost(cur, n);
      if (!isFinite(c)) continue;
      const ng = base + c;
      if (ng > maxCost) continue;
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        // Wormholes make the hex-distance heuristic inadmissible; fall back to Dijkstra when links exist.
        open.push(n, ng + (extraLinks ? 0 : hexDistance(grid, n, goal)));
      }
    }
  }
  if (!g.has(goal)) return null;
  const path = [goal];
  let c = goal;
  while (c !== start) {
    c = came.get(c)!;
    path.push(c);
  }
  path.reverse();
  return { path, cost: g.get(goal)! };
}

/** Every hex reachable within `budget` movement, with its cost. */
export function reachable(
  grid: GridSize,
  start: number,
  budget: number,
  cost: StepCost,
  extraLinks?: (index: number) => number[],
): Map<number, number> {
  const best = new Map<number, number>([[start, 0]]);
  const open = new MinHeap();
  open.push(start, 0);
  while (open.size > 0) {
    const cur = open.pop()!;
    const base = best.get(cur)!;
    const next = neighbors(grid, cur);
    if (extraLinks) next.push(...extraLinks(cur));
    for (const n of next) {
      const c = cost(cur, n);
      if (!isFinite(c)) continue;
      const ng = base + c;
      if (ng > budget) continue;
      if (ng < (best.get(n) ?? Infinity)) {
        best.set(n, ng);
        open.push(n, ng);
      }
    }
  }
  return best;
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number { return this.items.length; }
  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent] <= this.prio[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastI = this.items.pop()!, lastP = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastI; this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l;
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
  }
}
