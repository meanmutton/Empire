/**
 * Galaxy generation (§4.3). Places majors evenly, gives each ~20 hexes with home + 2 systems, places minors
 * between them with a gap so no two factions touch, then fills the rest with terrain and systems, and evens
 * out each major's nearby resources.
 */
import { factionDef } from '../data/factions';
import { PLANET_YIELDS, STAR_YIELDS } from '../data/improvements';
import { SYSTEM_NAMES } from '../data/names';
import { GridSize, hexDistance, hexesWithin, neighbors, ring } from './hex';
import { findPath } from './path';
import { Rng } from './rng';
import type { FactionId, Hex, MapState, PlanetKind, StarKind, StarSystem, Terrain } from './types';

export interface GeneratedMap {
  map: MapState;
  homes: Record<FactionId, number>;
  territory: Record<FactionId, number[]>;
}

export interface MapGenOptions {
  width: number;
  height: number;
  majors: FactionId[];
  minors: FactionId[];
}

const HABITABLE: PlanetKind[] = ['terran', 'ocean', 'jungle', 'desert', 'arctic'];
const ALL_PLANETS: PlanetKind[] = ['terran', 'ocean', 'jungle', 'desert', 'arctic', 'barren', 'volcanic', 'gasGiant'];

export function generateMap(opts: MapGenOptions, rng: Rng): GeneratedMap {
  const grid: GridSize = { width: opts.width, height: opts.height };
  const n = grid.width * grid.height;
  const hexes: Hex[] = [];
  for (let i = 0; i < n; i++) hexes.push({ terrain: 'space', system: null, owner: null, pendingClaim: null, wormhole: null });
  const map: MapState = { width: grid.width, height: grid.height, hexes };
  const names = new NamePool(rng);
  const homes: Record<FactionId, number> = {};
  const territory: Record<FactionId, number[]> = {};
  /** Hexes reserved by factions (territory) — used to keep gaps. */
  const reserved = new Map<number, FactionId>();

  // 1. Majors, spread out.
  const majorHomes = placeSpread(grid, opts.majors.length, rng, Math.max(3, Math.floor(Math.min(grid.width, grid.height) / 8)));
  opts.majors.forEach((f, k) => {
    const home = majorHomes[k];
    homes[f] = home;
    const def = factionDef(f);
    const terr = hexesWithin(grid, home, 2);
    // Second system at ring 2, third just outside at ring 3 (which extends the territory to ~20 hexes).
    const r2 = rng.shuffle(ring(grid, home, 2));
    const sys2 = r2[0];
    const r3 = rng.shuffle(ring(grid, home, 3)).filter((h) => hexDistance(grid, h, sys2) >= 2);
    const sys3 = r3[0] ?? r2[1];
    if (!terr.includes(sys3)) terr.push(sys3);
    for (const h of terr) {
      reserved.set(h, f);
      hexes[h].owner = f;
    }
    territory[f] = terr;
    hexes[home].system = makeHome(def.systemNames[0], f, 'major', rng);
    hexes[sys2].system = makeColony(def.systemNames[1], rng);
    hexes[sys3].system = makeColony(def.systemNames[2], rng);
  });

  // 2. Minors, in the gaps. Their 7 hexes must stay ≥ 2 away from any other territory (no adjacency).
  for (const f of opts.minors) {
    const home = pickMinorHome(grid, reserved, rng);
    if (home < 0) throw new Error('Map too small for the number of factions');
    homes[f] = home;
    const terr = hexesWithin(grid, home, 1);
    for (const h of terr) {
      reserved.set(h, f);
      hexes[h].owner = f;
    }
    territory[f] = terr;
    hexes[home].system = makeHome(factionDef(f).systemNames[0], f, 'minor', rng);
  }

  const homeSet = new Set(Object.values(homes));
  const isFree = (h: number) => !reserved.has(h);
  const nearHome = (h: number, d: number) => {
    for (const home of homeSet) if (hexDistance(grid, h, home) < d) return true;
    return false;
  };

  // 3. Terrain clusters outside territories.
  const scale = n / 1500;
  const blobs = (terrain: Terrain, count: number, size: [number, number], minHomeDist: number) => {
    for (let k = 0; k < count; k++) {
      const seed = rng.int(n);
      if (!isFree(seed) || nearHome(seed, minHomeDist) || hexes[seed].terrain !== 'space') continue;
      const target = rng.range(size[0], size[1]);
      const blob = [seed];
      const seen = new Set(blob);
      while (blob.length < target) {
        const from = rng.pick(blob);
        const nb = neighbors(grid, from).filter((x) => !seen.has(x) && isFree(x) && hexes[x].terrain === 'space' && !nearHome(x, minHomeDist));
        if (nb.length === 0) break;
        const x = rng.pick(nb);
        seen.add(x);
        blob.push(x);
      }
      for (const h of blob) hexes[h].terrain = terrain;
    }
  };
  blobs('nebula', Math.round(9 * scale), [5, 14], 4);
  blobs('asteroids', Math.round(10 * scale), [3, 8], 3);
  blobs('ionStorm', Math.round(4 * scale), [2, 5], 5);

  const singles = (terrain: Terrain, count: number, minHomeDist: number) => {
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 50; tries++) {
      const h = rng.int(n);
      if (!isFree(h) || nearHome(h, minHomeDist) || hexes[h].terrain !== 'space') continue;
      if (terrain === 'blackHole' && neighbors(grid, h).some((x) => hexes[x].terrain === 'blackHole')) continue;
      hexes[h].terrain = terrain;
      placed++;
    }
  };
  singles('blackHole', Math.round(5 * scale), 6);
  singles('neutronStar', Math.round(6 * scale), 4);
  singles('pulsar', Math.round(5 * scale), 4);

  // Wormholes: pairs far apart.
  const wormholePairs = Math.max(1, Math.round(3 * scale));
  for (let k = 0; k < wormholePairs; k++) {
    for (let tries = 0; tries < 200; tries++) {
      const a = rng.int(n), b = rng.int(n);
      if (a === b || !isFree(a) || !isFree(b) || hexes[a].terrain !== 'space' || hexes[b].terrain !== 'space') continue;
      if (nearHome(a, 5) || nearHome(b, 5) || hexDistance(grid, a, b) < Math.min(grid.width, grid.height) * 0.6) continue;
      hexes[a].terrain = 'wormhole'; hexes[a].wormhole = b;
      hexes[b].terrain = 'wormhole'; hexes[b].wormhole = a;
      break;
    }
  }

  // 4. Star systems in free hexes.
  for (let h = 0; h < n; h++) {
    const hx = hexes[h];
    if (hx.system || !isFree(h)) continue;
    let p = 0;
    switch (hx.terrain) {
      case 'space': p = 0.11; break;
      case 'asteroids': p = 0.25; break;
      case 'nebula': p = 0.06; break;
      case 'neutronStar': case 'pulsar': p = 0.6; break;
      default: p = 0;
    }
    if (p > 0 && rng.chance(p)) {
      // Avoid systems directly next to each other most of the time.
      if (neighbors(grid, h).some((x) => hexes[x].system) && rng.chance(0.7)) continue;
      hx.system = makeWildSystem(names.next(), hx.terrain, rng);
    }
  }
  // Independent developed systems and ruins.
  const wild = () => {
    const out: number[] = [];
    for (let h = 0; h < n; h++) if (hexes[h].system && !hexes[h].owner && !hexes[h].system!.homeOf) out.push(h);
    return out;
  };
  for (const h of rng.shuffle(wild().filter((x) => !nearHome(x, 5))).slice(0, Math.round(8 * scale))) {
    const s = hexes[h].system!;
    if (!HABITABLE.includes(s.planet)) s.planet = rng.pick(HABITABLE);
    s.development = rng.range(1, 2);
    s.population = 2 + s.development * 2;
    s.defense = 10 + 10 * s.development;
    s.garrison = 15 + 10 * s.development;
    s.improvements = s.development >= 2 ? ['mine', 'powerPlant'] : ['mine'];
  }
  for (const h of rng.shuffle(wild()).slice(0, Math.round(10 * scale))) {
    const s = hexes[h].system!;
    if (s.development === 0) s.ruins = true;
  }

  // 5. Fairness: each major's resource score within 6 hexes should be within 10% of the best.
  for (let pass = 0; pass < 20; pass++) {
    const scores = opts.majors.map((f) => ({ f, s: areaScore(map, homes[f], 6) }));
    const best = Math.max(...scores.map((x) => x.s));
    const poor = scores.filter((x) => x.s < best * 0.9);
    if (poor.length === 0) break;
    for (const { f } of poor) {
      const candidates = hexesWithin(grid, homes[f], 6).filter((h) =>
        !hexes[h].system && isFree(h) && hexes[h].terrain === 'space' && hexDistance(grid, h, homes[f]) >= 3 &&
        !neighbors(grid, h).some((x) => hexes[x].system));
      if (candidates.length === 0) continue;
      const h = rng.pick(candidates);
      hexes[h].system = makeWildSystem(names.next(), 'space', rng);
      hexes[h].system!.planet = rng.pick(HABITABLE);
    }
  }

  // 6. Every home must reach every other home; clear black holes if one blocks.
  const passable = (_f: number, t: number) => (hexes[t].terrain === 'blackHole' ? Infinity : 1);
  const homeList = Object.values(homes);
  for (let k = 1; k < homeList.length; k++) {
    if (!findPath(grid, homeList[0], homeList[k], passable)) {
      for (const hx of hexes) if (hx.terrain === 'blackHole') hx.terrain = 'space';
      break;
    }
  }

  return { map, homes, territory };
}

/** Sum of resource yields of systems near a hex. */
export function areaScore(map: MapState, center: number, radius: number): number {
  let s = 0;
  for (const h of hexesWithin(map, center, radius)) {
    const sys = map.hexes[h].system;
    if (!sys || sys.homeOf) continue;
    const p = PLANET_YIELDS[sys.planet], st = STAR_YIELDS[sys.star];
    s += p.energy + p.metals + p.science + p.exotics * 2 + p.popCap * 0.3 + st.energy + st.exotics * 2 + st.science;
  }
  return s;
}

function placeSpread(grid: GridSize, count: number, rng: Rng, margin: number): number[] {
  let best: number[] = [];
  let bestScore = -1;
  const inner: number[] = [];
  for (let row = margin; row < grid.height - margin; row++)
    for (let col = margin; col < grid.width - margin; col++) inner.push(row * grid.width + col);
  for (let attempt = 0; attempt < 40; attempt++) {
    const picks = [rng.pick(inner)];
    while (picks.length < count) {
      // Farthest-point sampling with a little randomness among the top candidates.
      const scored = inner.map((h) => ({ h, d: Math.min(...picks.map((p) => hexDistance(grid, h, p))) }));
      scored.sort((a, b) => b.d - a.d);
      picks.push(scored[rng.int(Math.min(4, scored.length))].h);
    }
    let minD = Infinity;
    for (let i = 0; i < picks.length; i++)
      for (let j = i + 1; j < picks.length; j++) minD = Math.min(minD, hexDistance(grid, picks[i], picks[j]));
    if (minD > bestScore) {
      bestScore = minD;
      best = picks;
    }
  }
  return best;
}

function pickMinorHome(grid: GridSize, reserved: Map<number, FactionId>, rng: Rng): number {
  const reservedList = [...reserved.keys()];
  const candidates: { h: number; d: number }[] = [];
  for (let row = 2; row < grid.height - 2; row++) {
    for (let col = 2; col < grid.width - 2; col++) {
      const h = row * grid.width + col;
      let d = Infinity;
      for (const r of reservedList) {
        const dd = hexDistance(grid, h, r);
        if (dd < d) d = dd;
        if (d < 4) break;
      }
      // Minor territory (radius 1) must be ≥ 2 from other territory, so home ≥ 3; we use ≥ 4 for breathing room.
      if (d >= 4) candidates.push({ h, d });
    }
  }
  if (candidates.length === 0) {
    // Fall back to the tightest legal gap.
    for (let h = 0; h < grid.width * grid.height; h++) {
      const { col, row } = { col: h % grid.width, row: Math.floor(h / grid.width) };
      if (col < 1 || row < 1 || col >= grid.width - 1 || row >= grid.height - 1) continue;
      if (reservedList.every((r) => hexDistance(grid, h, r) >= 3)) return h;
    }
    return -1;
  }
  // Prefer hexes in the middle ground: not hugging other territory, not in the far wilderness.
  candidates.sort((a, b) => Math.abs(a.d - 5) - Math.abs(b.d - 5) || a.h - b.h);
  const top = candidates.slice(0, Math.max(8, Math.floor(candidates.length / 6)));
  return rng.pick(top).h;
}

function baseSystem(name: string, star: StarKind, planet: PlanetKind, size: number): StarSystem {
  return {
    name, star, planet, size, development: 0, improvements: [], population: 0, homeOf: null,
    defense: 0, garrison: 0, unrest: 0, ruins: false, queue: [],
  };
}

function makeHome(name: string, faction: FactionId, kind: 'major' | 'minor', rng: Rng): StarSystem {
  const s = baseSystem(name, rng.pick<StarKind>(['yellow', 'orange', 'white']), kind === 'major' ? 'terran' : rng.pick(HABITABLE), kind === 'major' ? 5 : 4);
  s.homeOf = faction;
  if (kind === 'major') {
    s.development = 4;
    s.population = 8;
    s.improvements = ['mine', 'powerPlant', 'lab', 'shipyard'];
    s.defense = 40;
    s.garrison = 30;
  } else {
    s.development = 3;
    s.population = 5;
    s.improvements = ['mine', 'powerPlant', 'shipyard'];
    s.defense = 25;
    s.garrison = 20;
  }
  return s;
}

function makeColony(name: string, rng: Rng): StarSystem {
  const s = baseSystem(name, rng.pick<StarKind>(['yellow', 'orange', 'red', 'white']), rng.pick(ALL_PLANETS.filter((p) => p !== 'gasGiant')), rng.range(2, 4));
  s.development = 1;
  s.population = PLANET_YIELDS[s.planet].popCap > 0 ? 1 : 0;
  s.garrison = 5;
  return s;
}

function makeWildSystem(name: string, terrain: Terrain, rng: Rng): StarSystem {
  let star: StarKind;
  let planet: PlanetKind;
  if (terrain === 'neutronStar') { star = 'neutron'; planet = rng.pick<PlanetKind>(['barren', 'volcanic', 'gasGiant']); }
  else if (terrain === 'pulsar') { star = 'pulsar'; planet = rng.pick<PlanetKind>(['barren', 'gasGiant']); }
  else if (terrain === 'asteroids') { star = rng.pick<StarKind>(['red', 'orange', 'yellow']); planet = 'asteroidBelt'; }
  else {
    star = rng.weighted<StarKind>({ yellow: 4, orange: 4, red: 5, white: 2, blue: 1 });
    planet = rng.weighted<PlanetKind>({ terran: 1, ocean: 1.5, jungle: 1.5, desert: 2, arctic: 2, barren: 3, volcanic: 1.5, gasGiant: 2.5 });
  }
  return baseSystem(name, star, planet, rng.range(1, planet === 'gasGiant' || planet === 'asteroidBelt' ? 3 : 5));
}

class NamePool {
  private names: string[];
  private i = 0;
  private round = 1;
  constructor(rng: Rng) {
    this.names = rng.shuffle(SYSTEM_NAMES);
  }
  next(): string {
    if (this.i >= this.names.length) {
      this.i = 0;
      this.round++;
    }
    const base = this.names[this.i++];
    return this.round === 1 ? base : `${base} ${roman(this.round)}`;
  }
}

function roman(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}
