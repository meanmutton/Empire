/**
 * Advanced start for Total War games (§10.5): the galaxy is already carved up when the game begins.
 *  - Every hex is claimed except black holes and a one-hex neutral zone between powers. Great powers
 *    together hold about 60% of the claimed space and minor powers about 40%. Each power's territory is one
 *    connected piece.
 *  - Every system inside a power's borders is its colony, a third of the way developed (level 2 of 5), with
 *    population and one improvement to match. Home systems keep their own development.
 *  - A third of the tech tree is known, chosen the way each faction's own research leans.
 *  - Great powers start with about 30 ships, 5 diplomats, 5 spies and a few armies; minor powers with 10
 *    ships. Fleets sit at home and on the borders.
 * All randomness comes from the game's RNG, so every client builds the same galaxy.
 */
import { BALANCE } from '../data/balance';
import { DESIGNS_BY_FACTION, type ShipDesign } from '../data/designs';
import { factionDef } from '../data/factions';
import { IMPROVEMENTS, PLANET_YIELDS } from '../data/improvements';
import { CLASSES, type ShipRole } from '../data/ships';
import { TECH_BY_ID, TECHS, type TechField } from '../data/techs';
import { emptyBits, setBits } from './bitset';
import { checkBuild, popCapOf } from './economy';
import { hexDistance, hexesWithin, neighbors } from './hex';
import { newId, relationKey } from './ids';
import { availableTechs, grantTech } from './research';
import { Rng } from './rng';
import { spawnShip } from './setup';
import type { FactionId, GameState } from './types';

export const ADVANCED = {
  majorShare: 0.6,
  minorShare: 0.4,
  colonyDevelopment: 2,
  techShare: 1 / 3,
  majorShips: 30,
  minorShips: 10,
  diplomats: 5,
  spies: 5,
  majorArmies: 4,
  minorArmies: 1,
};

export function applyAdvancedStart(state: GameState, rng: Rng): void {
  const all = [...state.config.majors, ...state.config.minors];
  partitionTerritory(state, all);
  for (const f of all) grantStartingTech(state, f, rng);
  for (const f of all) settleColonies(state, f);
  for (const f of all) addForces(state, f);
  for (const f of all) revealNeighborhood(state, f);
  makeContacts(state, all);
}

// -------------------------------------------------------------------------------------------------------
// Territory

/**
 * Grows every faction outward from its starting territory, breadth first, always growing whichever is
 * furthest below its target share, until the galaxy is full. Then opens a one-hex neutral zone wherever two
 * powers touch.
 */
function partitionTerritory(state: GameState, all: FactionId[]): void {
  const hexes = state.map.hexes;
  const claimable = (i: number) => hexes[i].terrain !== 'blackHole';
  const total = hexes.reduce((a, _, i) => a + (claimable(i) ? 1 : 0), 0);
  const majors = state.config.majors, minors = state.config.minors;
  const target = new Map<FactionId, number>();
  for (const m of majors) target.set(m, (total * ADVANCED.majorShare) / majors.length);
  for (const m of minors) target.set(m, (total * ADVANCED.minorShare) / Math.max(1, minors.length));
  const owner: (FactionId | null)[] = hexes.map((h) => h.owner);
  const count = new Map<FactionId, number>(all.map((f) => [f, 0]));
  const queue = new Map<FactionId, { list: number[]; at: number }>();
  for (const f of all) queue.set(f, { list: [], at: 0 });
  hexes.forEach((h, i) => {
    if (!h.owner) return;
    count.set(h.owner, (count.get(h.owner) ?? 0) + 1);
    queue.get(h.owner)?.list.push(i);
  });
  // Seed each faction's frontier with its starting hexes, home first (so growth is centered on it).
  for (const f of all) {
    const q = queue.get(f)!;
    const home = state.factions[f].home;
    q.list.sort((a, b) => hexDistance(state.map, a, home) - hexDistance(state.map, b, home) || a - b);
  }
  const active = new Set(all);
  while (active.size) {
    let pick: FactionId | null = null, ratio = Infinity;
    for (const f of active) {
      const r = count.get(f)! / target.get(f)!;
      if (r < ratio) { ratio = r; pick = f; }
    }
    const f = pick!;
    const q = queue.get(f)!;
    let grew = false;
    while (q.at < q.list.length && !grew) {
      const h = q.list[q.at++];
      for (const n of neighbors(state.map, h)) {
        if (owner[n] || !claimable(n)) continue;
        owner[n] = f;
        count.set(f, count.get(f)! + 1);
        q.list.push(n);
        grew = true;
        break;
      }
      // The hex may have more free neighbors: look at it again next time.
      if (grew) q.at--;
    }
    if (!grew) active.delete(f);
  }
  // Neutral zone: wherever two powers touch, give up one of the two hexes. Prefer giving up empty space,
  // then the side that is furthest over its share; never a home system.
  const homes = new Set(all.map((f) => state.factions[f].home));
  for (let i = 0; i < hexes.length; i++) {
    for (const n of neighbors(state.map, i)) {
      const a = owner[i], b = owner[n];
      if (!a || !b || a === b) continue;
      const cost = (h: number, f: FactionId) =>
        (homes.has(h) ? 1e6 : 0) + (hexes[h].system ? 1000 : 0) - count.get(f)! / target.get(f)! + h * 1e-7;
      const drop = cost(i, a) <= cost(n, b) ? i : n;
      const was = owner[drop]!;
      owner[drop] = null;
      count.set(was, count.get(was)! - 1);
      if (drop === i) break;
    }
  }
  // The neutral zone can cut a narrow corridor and strand a few hexes; they go back to the neutral zone, so
  // every power's territory is one connected piece around its home.
  for (const f of all) {
    const home = state.factions[f].home;
    const reach = new Set<number>([home]);
    const stack = [home];
    while (stack.length) {
      const h = stack.pop()!;
      for (const n of neighbors(state.map, h)) if (owner[n] === f && !reach.has(n)) { reach.add(n); stack.push(n); }
    }
    owner.forEach((o, i) => { if (o === f && !reach.has(i)) owner[i] = null; });
  }
  hexes.forEach((h, i) => { h.owner = owner[i]; h.pendingClaim = null; });
}

// -------------------------------------------------------------------------------------------------------
// Colonies

/** Improvements to try first, by what a world is good for. */
function improvementChoices(planet: string): string[] {
  if (planet === 'barren' || planet === 'volcanic' || planet === 'asteroidBelt') return ['mine', 'powerPlant', 'lab'];
  if (planet === 'gasGiant') return ['refinery', 'powerPlant', 'mine'];
  return ['powerPlant', 'lab', 'mine', 'habitat'];
}

function settleColonies(state: GameState, faction: FactionId): void {
  state.map.hexes.forEach((h, hex) => {
    if (h.owner !== faction || !h.system || h.system.homeOf) return;
    const sys = h.system;
    sys.development = Math.max(sys.development, ADVANCED.colonyDevelopment);
    sys.queue = [];
    sys.unrest = 0;
    const cap = popCapOf(state, sys, faction);
    sys.population = PLANET_YIELDS[sys.planet].popCap > 0 ? Math.max(1, Math.round(cap * 0.6 * 10) / 10) : 0;
    sys.defense = Math.max(sys.defense, 10);
    sys.garrison = Math.max(sys.garrison, 10);
    if (sys.improvements.length === 0) {
      const pick = improvementChoices(sys.planet).find((id) => IMPROVEMENTS[id] && checkBuild(state, faction, hex, 'improvement', id).ok);
      if (pick) sys.improvements.push(pick);
    }
  });
}

// -------------------------------------------------------------------------------------------------------
// Technology

/** Research leanings: each faction's personality, as its computer player weighs fields. */
function fieldWeights(faction: FactionId): Record<TechField, number> {
  const p = factionDef(faction).personality;
  return {
    weapons: 0.5 + p.aggression,
    defense: 0.6 + (1 - p.aggression) * 0.5,
    construction: 0.9 + p.expansion * 0.5,
    propulsion: 0.4 + p.expansion * 0.4,
    society: 0.5 + p.diplomacy * 0.5,
    computing: 0.4 + p.science * 0.6 + p.espionage * 0.3,
  };
}

function grantStartingTech(state: GameState, faction: FactionId, rng: Rng): void {
  const goal = Math.round((TECHS.length - 1) * ADVANCED.techShare);
  const w = fieldWeights(faction);
  while (state.factions[faction].research.known.length < goal) {
    const options = availableTechs(state, faction).filter((t) => t !== 'ascension');
    if (!options.length) break;
    let best = options[0], bestScore = -Infinity;
    for (const id of options) {
      const t = TECH_BY_ID[id];
      let s = w[t.field] * 10 - t.tier * 4 + rng.float(0, 3);
      if (id.startsWith('hull') || id === 'starbase1') s += 6;
      if (s > bestScore) { bestScore = s; best = id; }
    }
    grantTech(state, faction, best);
  }
}

// -------------------------------------------------------------------------------------------------------
// Forces

/** The biggest design of a role the faction can field with its techs (no fighters). */
function bestDesign(state: GameState, faction: FactionId, roles: ShipRole[]): ShipDesign | undefined {
  const known = new Set(state.factions[faction].research.known);
  return DESIGNS_BY_FACTION[faction]
    .filter((d) => roles.includes(d.role) && d.cls !== 'fighter' && (d.tech === null || known.has(d.tech)))
    .sort((a, b) => CLASSES[b.cls].size - CLASSES[a.cls].size || b.buildPoints - a.buildPoints)[0];
}

/** Owned systems nearest to other powers, for border fleets. */
function borderSystems(state: GameState, faction: FactionId): number[] {
  const mine: number[] = [], theirs: number[] = [];
  state.map.hexes.forEach((h, i) => {
    if (h.owner === faction && h.system) mine.push(i);
    else if (h.owner && h.owner !== faction && h.system) theirs.push(i);
  });
  const d = (h: number) => Math.min(Infinity, ...theirs.map((t) => hexDistance(state.map, h, t)));
  const dist = new Map(mine.map((h) => [h, d(h)]));
  return mine.filter((h) => h !== state.factions[faction].home).sort((a, b) => dist.get(a)! - dist.get(b)! || a - b);
}

function addForces(state: GameState, faction: FactionId): void {
  const f = state.factions[faction];
  const major = f.kind === 'major';
  // Clear the classic starting units: the advanced start replaces them.
  for (const fl of Object.values(state.fleets)) if (fl.owner === faction) { for (const s of fl.ships) delete state.ships[s]; delete state.fleets[fl.id]; }
  for (const a of Object.values(state.agents)) if (a.owner === faction) delete state.agents[a.id];
  for (const a of Object.values(state.armies)) if (a.owner === faction) delete state.armies[a.id];

  const line = bestDesign(state, faction, ['line']) ?? bestDesign(state, faction, ['escort', 'raider', 'carrier']);
  if (!line) return;
  const escort = bestDesign(state, faction, ['escort']) ?? line;
  const carrier = bestDesign(state, faction, ['carrier']) ?? line;
  const raider = bestDesign(state, faction, ['raider']) ?? line;
  const plan: [ShipDesign | undefined, number][] = major
    ? [[line, 16], [escort, 5], [carrier, 3], [raider, 2], [bestDesign(state, faction, ['scout']), 2],
      [bestDesign(state, faction, ['transport']), 1], [bestDesign(state, faction, ['constructor']), 1]]
    : [[line, 6], [escort, 2], [raider, 1], [bestDesign(state, faction, ['scout']) ?? line, 1]];
  const warships: ShipDesign[] = [];
  const support: ShipDesign[] = [];
  for (const [d, n] of plan) {
    if (!d) continue;
    for (let i = 0; i < n; i++) (d.stats.energy + d.stats.missile + d.stats.hangar > 0 && d.role !== 'scout' ? warships : support).push(d);
  }
  // Battle groups of up to 6 warships: the first guards home, the rest go to the borders nearest other powers.
  const sites = [f.home, ...borderSystems(state, faction)];
  let group = 0;
  for (let i = 0; i < warships.length; i += BALANCE.maxShipsPerFleet) {
    const hex = sites[Math.min(group, sites.length - 1) % sites.length];
    const chunk = warships.slice(i, i + BALANCE.maxShipsPerFleet);
    const fid = spawnShip(state, faction, chunk[0], hex);
    for (const d of chunk.slice(1)) spawnShip(state, faction, d, hex, fid);
    state.fleets[fid].name = group === 0 ? 'Home Fleet' : `${ordinal(group)} Fleet`;
    group++;
  }
  for (const d of support) spawnShip(state, faction, d, f.home);

  const agent = (kind: 'diplomat' | 'spy') => {
    const id = newId(state, 'a');
    state.agents[id] = { id, owner: faction, kind, hex: f.home, ship: null, path: [], target: null, mission: null, progress: 0, resident: false, capturedBy: null };
  };
  if (major) {
    for (let i = 0; i < ADVANCED.diplomats; i++) agent('diplomat');
    for (let i = 0; i < ADVANCED.spies; i++) agent('spy');
  }
  for (let i = 0; i < (major ? ADVANCED.majorArmies : ADVANCED.minorArmies); i++) {
    const id = newId(state, 'r');
    state.armies[id] = { id, owner: faction, strength: BALANCE.army.strength, xp: 0, hex: f.home, ship: null };
  }
}

function ordinal(n: number): string {
  return ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'][n - 1] ?? `${n}th`;
}

// -------------------------------------------------------------------------------------------------------
// Knowledge

/** Each faction has mapped its own space and a few hexes beyond its borders. */
function revealNeighborhood(state: GameState, faction: FactionId): void {
  const f = state.factions[faction];
  const seen: number[] = [];
  state.map.hexes.forEach((h, i) => { if (h.owner === faction) seen.push(i); });
  const border = seen.filter((i) => neighbors(state.map, i).some((n) => state.map.hexes[n].owner !== faction));
  const out = new Set(seen);
  for (const b of border) for (const x of hexesWithin(state.map, b, 3)) out.add(x);
  f.explored = setBits(f.explored ?? emptyBits(state.map.hexes.length), [...out]);
}

/** Powers whose borders face each other across the neutral zone already know each other. */
function makeContacts(state: GameState, all: FactionId[]): void {
  const near = new Set<string>();
  state.map.hexes.forEach((h, i) => {
    if (!h.owner) return;
    for (const x of hexesWithin(state.map, i, 2)) {
      const o = state.map.hexes[x].owner;
      if (o && o !== h.owner) near.add(relationKey(h.owner, o));
    }
  });
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const r = state.relations[relationKey(all[i], all[j])];
      if (r && near.has(relationKey(all[i], all[j]))) r.contact = true;
    }
  }
}
