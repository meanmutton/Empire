/** Yields, income, upkeep, population growth and build queues (§5). */
import { BALANCE } from '../data/balance';
import { design, DESIGNS } from '../data/designs';
import { hasAbility, modifiersOf } from '../data/factions';
import { IMPROVEMENTS, PLANET_YIELDS, STAR_YIELDS } from '../data/improvements';
import { CLASSES } from '../data/ships';
import { log } from './events';
import { newId } from './ids';
import { connectedHexes, ownedHexes } from './query';
import { techEffects } from './research';
import { spawnShip } from './setup';
import { RESOURCE_KINDS, type BuildOrder, type FactionId, type GameState, type Resources, type StarSystem } from './types';

export function zeroResources(): Resources {
  return { energy: 0, metals: 0, population: 0, science: 0, exotics: 0 };
}

/** Improvement slots a system has now: development + 1, capped by its size (0 when undeveloped). */
export function slotsOf(sys: StarSystem): number {
  return sys.development === 0 ? 0 : Math.min(sys.size, sys.development + 1);
}

export function popCapOf(state: GameState, sys: StarSystem, owner: FactionId | null): number {
  let cap = PLANET_YIELDS[sys.planet].popCap * (0.4 + 0.2 * sys.development);
  if (owner) cap *= 1 + techEffects(state, owner).popCap;
  for (const imp of sys.improvements) cap += IMPROVEMENTS[imp]?.popCap ?? 0;
  if (owner && hasAbility(owner, 'oceanWorlds') && PLANET_YIELDS[sys.planet].popCap >= 4) cap *= 1.5;
  return Math.round(cap * 10) / 10;
}

/** Per-turn production points a system puts into its build queue. */
export function productionOf(state: GameState, hex: number): number {
  const sys = state.map.hexes[hex].system;
  const owner = state.map.hexes[hex].owner;
  if (!sys || !owner) return 0;
  let p = BALANCE.productionByLevel[sys.development] + sys.population * 0.3;
  const m = modifiersOf(owner);
  p *= 1 - m.buildTime + techEffects(state, owner).production;
  if (state.factions[owner].flags.mobilized) p *= 2;
  p *= 1 - sys.unrest / 200;
  return Math.max(0, Math.round(p * 10) / 10);
}

/** Multiplier from temporary faction effects (Five-Year Plan, mobilization, war weariness). */
export function factionMultiplier(state: GameState, faction: FactionId, res: keyof Resources): number {
  const f = state.factions[faction];
  const m = modifiersOf(faction);
  const te = techEffects(state, faction);
  let mult = 1 + (res === 'population' ? 0 : (m[res as 'energy' | 'metals' | 'science' | 'exotics'] ?? 0) + (te[res as 'energy' | 'metals' | 'science' | 'exotics'] ?? 0));
  const plan = f.flags.planResource;
  if (plan !== undefined && plan >= 0 && RESOURCE_KINDS[plan] === res) {
    if (state.turn < f.flags.planBoostUntil) mult += 0.5;
    else if (state.turn < f.flags.planSlumpUntil) mult -= 0.1;
  }
  if (res === 'science' && f.flags.mobilized) mult *= 0.5;
  if (hasAbility(faction, 'consensus') && startedWar(state, faction)) mult *= 0.9;
  return mult;
}

function startedWar(state: GameState, faction: FactionId): boolean {
  for (const r of Object.values(state.relations)) {
    if (r.status === 'war' && r.aggressor === faction && (r.a === faction || r.b === faction)) return true;
  }
  return false;
}

/** Yields of one system for its owner this turn (before faction-wide multipliers). */
export function systemYield(state: GameState, hex: number, connected?: Set<number>): Resources {
  const out = zeroResources();
  const h = state.map.hexes[hex];
  const sys = h.system;
  if (!sys || !h.owner || sys.development === 0) return out;
  const owner = h.owner;
  const p = PLANET_YIELDS[sys.planet];
  const st = STAR_YIELDS[sys.star];
  const dev = BALANCE.developmentYield[sys.development];
  let metals = p.metals;
  if (sys.planet === 'asteroidBelt' && hasAbility(owner, 'deepCoreMining')) metals *= 2;
  if (sys.planet === 'asteroidBelt') metals *= 1 + techEffects(state, owner).asteroidMetals;
  let starEnergy = st.energy;
  if (hasAbility(owner, 'stellarFeeding')) starEnergy *= 2;
  let starExotics = st.exotics;
  if ((sys.star === 'neutron' || sys.star === 'pulsar') && hasAbility(owner, 'stellarHarnessing')) starExotics *= 2;
  out.energy = (p.energy + starEnergy) * dev;
  out.metals = metals * dev;
  out.science = (p.science + st.science) * dev;
  out.exotics = (p.exotics + starExotics) * dev;
  for (const imp of sys.improvements) {
    const y = IMPROVEMENTS[imp]?.yields;
    if (!y) continue;
    for (const k of RESOURCE_KINDS) out[k] += (y[k] ?? 0) * (1 + 0.1 * sys.development);
  }
  if (h.terrain === 'nebula') out.science += 1;
  out.energy += sys.population * 0.25;
  out.science += sys.population * 0.4;
  out.population = sys.population;
  const unrest = 1 - sys.unrest / 200;
  const disc = connected && !connected.has(hex) ? BALANCE.disconnectedPenalty : 1;
  for (const k of RESOURCE_KINDS) if (k !== 'population') out[k] *= unrest * disc;
  return out;
}

export interface IncomeReport {
  gross: Resources;
  upkeep: number;
  net: Resources;
  bySystem: Record<number, Resources>;
}

export function factionIncome(state: GameState, faction: FactionId): IncomeReport {
  const gross = zeroResources();
  const bySystem: Record<number, Resources> = {};
  const connected = connectedHexes(state, faction);
  const owned = ownedHexes(state, faction);
  let emptyHexes = 0;
  for (const hex of owned) {
    if (state.map.hexes[hex].system) {
      const y = systemYield(state, hex, connected);
      bySystem[hex] = y;
      for (const k of RESOURCE_KINDS) gross[k] += y[k];
    } else {
      emptyHexes++;
    }
  }
  gross.energy += emptyHexes * BALANCE.ownedHexEnergy;
  if (hasAbility(faction, 'distributedCognition')) gross.science += Math.floor(owned.length / 5);
  for (const k of RESOURCE_KINDS) if (k !== 'population') gross[k] *= factionMultiplier(state, faction, k);
  for (const k of RESOURCE_KINDS) gross[k] = Math.round(gross[k] * 10) / 10;
  const upkeep = Math.round(upkeepOf(state, faction) * 10) / 10;
  const net = { ...gross, energy: Math.round((gross.energy - upkeep) * 10) / 10 };
  return { gross, upkeep, net, bySystem };
}

export function upkeepOf(state: GameState, faction: FactionId): number {
  let u = 0;
  for (const s of Object.values(state.ships)) if (s.owner === faction) u += design(s.design).upkeep;
  for (const b of Object.values(state.starbases)) if (b.owner === faction) u += b.tier;
  for (const a of Object.values(state.agents)) if (a.owner === faction && !a.capturedBy) u += BALANCE.spy.upkeep;
  for (const a of Object.values(state.armies)) if (a.owner === faction) u += BALANCE.army.upkeep;
  return u;
}

/** Start-of-turn economy for a faction: collect income, pay upkeep, grow population, advance builds. */
export function runEconomy(state: GameState, faction: FactionId): IncomeReport {
  const f = state.factions[faction];
  const report = factionIncome(state, faction);
  f.stock.energy = round1(f.stock.energy + report.net.energy);
  f.stock.metals = round1(f.stock.metals + report.net.metals);
  f.stock.exotics = round1(f.stock.exotics + report.net.exotics);
  f.flags.unsupplied = f.stock.energy < 0 ? 1 : 0;
  f.research.progress += report.net.science;

  const m = modifiersOf(faction);
  const te = techEffects(state, faction);
  const growthMult = 1 + m.popGrowth + te.popGrowth + (hasAbility(faction, 'rapidBreeding') ? 0.5 : 0);
  for (const hex of ownedHexes(state, faction)) {
    const sys = state.map.hexes[hex].system;
    if (!sys || sys.development < 2) continue;
    const cap = popCapOf(state, sys, faction);
    if (sys.population < cap) {
      const growth = Math.max(0.1, sys.population * BALANCE.populationGrowth * growthMult);
      sys.population = round1(Math.min(cap, sys.population + growth));
    } else if (sys.population > cap) {
      sys.population = round1(Math.max(cap, sys.population - 0.5));
    }
    sys.unrest = Math.max(0, sys.unrest - (hasAbility(faction, 'consensus') ? 10 : 5) - te.unrestDecay);
  }
  advanceBuilds(state, faction);
  return report;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

// ---------------------------------------------------------------------------------------------------------
// Build queues

export interface BuildCost { metals: number; energy: number; exotics: number; population: number; points: number; }

export type BuildCheck = { ok: true; cost: BuildCost } | { ok: false; reason: string };

/** Whether `faction` may queue `order` at `hex` right now, and what it costs. */
export function checkBuild(state: GameState, faction: FactionId, hex: number, kind: BuildOrder['kind'], item: string): BuildCheck {
  const h = state.map.hexes[hex];
  const sys = h?.system;
  if (!sys || h.owner !== faction) return { ok: false, reason: 'You must own this system.' };
  if (sys.development === 0) return { ok: false, reason: 'Found an outpost here first.' };
  const f = state.factions[faction];
  const known = new Set(f.research.known);
  const queued = sys.queue;
  const prod = Math.max(1, productionOf(state, hex));
  switch (kind) {
    case 'ship': {
      const d = DESIGNS[item];
      if (!d || d.faction !== faction) return { ok: false, reason: 'Unknown design.' };
      if (d.tech && !known.has(d.tech)) return { ok: false, reason: `Needs ${d.tech}.` };
      const yard = shipyardOf(sys);
      if (!yard) return { ok: false, reason: 'Needs a shipyard.' };
      if (yard === 'light' && CLASSES[d.cls].size > CLASSES.destroyer.size) return { ok: false, reason: 'Needs a heavy shipyard.' };
      if (d.cost.population > 0 && sys.population < d.cost.population + 1) return { ok: false, reason: 'Not enough population for the crew.' };
      const manufacturing = Object.values(state.relations).some((r) => (r.a === faction || r.b === faction) && r.status !== 'war' && r.agreements.includes('manufacturing'));
      const mult = manufacturing ? 0.9 : 1;
      return { ok: true, cost: { ...d.cost, metals: Math.round(d.cost.metals * mult), energy: Math.round(d.cost.energy * mult), points: d.buildPoints } };
    }
    case 'army': {
      if (sys.population < BALANCE.army.population + 1) return { ok: false, reason: 'Not enough population.' };
      const a = BALANCE.army;
      return { ok: true, cost: { metals: a.metals, energy: a.energy, exotics: 0, population: a.population, points: 5 } };
    }
    case 'spy':
    case 'diplomat': {
      if (sys.development < 2) return { ok: false, reason: 'Needs a colony (level 2).' };
      const b = kind === 'spy' ? BALANCE.spy : BALANCE.diplomat;
      let energy: number = b.energy;
      if (kind === 'spy' && hasAbility(faction, 'stateSecurity')) energy = Math.round(energy * 0.6);
      return { ok: true, cost: { metals: b.metals, energy, exotics: 0, population: 0, points: 4 } };
    }
    case 'improvement': {
      const imp = IMPROVEMENTS[item];
      if (!imp) return { ok: false, reason: 'Unknown improvement.' };
      if (imp.tech && !known.has(imp.tech)) return { ok: false, reason: `Needs ${imp.tech}.` };
      if (sys.development < imp.minLevel) return { ok: false, reason: `Needs development level ${imp.minLevel}.` };
      const pending = queued.filter((q) => q.kind === 'improvement');
      if (sys.improvements.length + pending.length >= slotsOf(sys)) return { ok: false, reason: 'No free slots.' };
      if (imp.unique && (sys.improvements.includes(item) || pending.some((q) => q.item === item))) return { ok: false, reason: 'Already built.' };
      if (imp.needsExotics && !hasExoticSource(state, hex)) return { ok: false, reason: 'No exotic source here.' };
      return { ok: true, cost: { ...imp.cost, population: 0, points: imp.buildPoints } };
    }
    case 'develop': {
      const pendingLevels = queued.filter((q) => q.kind === 'develop').length;
      const next = sys.development + pendingLevels + 1;
      if (next > 5) return { ok: false, reason: 'Already a core world.' };
      if (next >= 2 && PLANET_YIELDS[sys.planet].popCap === 0 && next > 2) return { ok: false, reason: 'This world can only hold an outpost.' };
      const c = BALANCE.developCost[next]!;
      let mult = 1;
      if (hasAbility(faction, 'terraformers')) mult = 0.6;
      return {
        ok: true,
        cost: { metals: Math.round(c.metals * mult), energy: Math.round(c.energy * mult), exotics: 0, population: 0, points: Math.round(c.turns * prod) },
      };
    }
    case 'wonder': {
      if (item !== 'ascensionGate') return { ok: false, reason: 'Unknown project.' };
      if (!known.has('ascension')) return { ok: false, reason: 'Needs Ascension Theory.' };
      if (sys.homeOf !== faction) return { ok: false, reason: 'Build it at your home system.' };
      if (sys.queue.some((q) => q.kind === 'wonder')) return { ok: false, reason: 'Already under construction.' };
      const c = BALANCE.ascensionGate;
      return { ok: true, cost: { metals: c.metals, energy: c.energy, exotics: c.exotics, population: 0, points: c.points } };
    }
    default:
      return { ok: false, reason: 'Cannot build that here.' };
  }
}

function hasExoticSource(state: GameState, hex: number): boolean {
  const h = state.map.hexes[hex];
  const sys = h.system!;
  return sys.planet === 'gasGiant' || sys.star === 'neutron' || sys.star === 'pulsar' || h.terrain === 'nebula';
}

export function shipyardOf(sys: StarSystem): 'light' | 'heavy' | null {
  if (sys.improvements.includes('heavyShipyard')) return 'heavy';
  if (sys.improvements.includes('shipyard')) return 'light';
  return null;
}

export function canAfford(state: GameState, faction: FactionId, cost: BuildCost): boolean {
  const s = state.factions[faction].stock;
  return s.metals >= cost.metals && s.energy >= cost.energy && s.exotics >= cost.exotics;
}

/** Queues a build, paying resources up front. */
export function queueBuild(state: GameState, faction: FactionId, hex: number, kind: BuildOrder['kind'], item: string): BuildCheck {
  const check = checkBuild(state, faction, hex, kind, item);
  if (!check.ok) return check;
  if (!canAfford(state, faction, check.cost)) return { ok: false, reason: 'Not enough resources.' };
  const s = state.factions[faction].stock;
  s.metals = round1(s.metals - check.cost.metals);
  s.energy = round1(s.energy - check.cost.energy);
  s.exotics = round1(s.exotics - check.cost.exotics);
  const sys = state.map.hexes[hex].system!;
  sys.population = round1(sys.population - check.cost.population);
  sys.queue.push({ kind, item, remaining: check.cost.points });
  return check;
}

/** Cancels a queued build and refunds half of its cost. */
export function cancelBuild(state: GameState, faction: FactionId, hex: number, index: number): boolean {
  const h = state.map.hexes[hex];
  if (!h.system || h.owner !== faction || !h.system.queue[index]) return false;
  const order = h.system.queue[index];
  h.system.queue.splice(index, 1);
  const refund = refundFor(order);
  const s = state.factions[faction].stock;
  s.metals = round1(s.metals + refund.metals);
  s.energy = round1(s.energy + refund.energy);
  return true;
}

function refundFor(order: BuildOrder): { metals: number; energy: number } {
  if (order.kind === 'ship') {
    const d = DESIGNS[order.item];
    return d ? { metals: d.cost.metals / 2, energy: d.cost.energy / 2 } : { metals: 0, energy: 0 };
  }
  if (order.kind === 'improvement') {
    const imp = IMPROVEMENTS[order.item];
    return imp ? { metals: imp.cost.metals / 2, energy: imp.cost.energy / 2 } : { metals: 0, energy: 0 };
  }
  return { metals: 0, energy: 0 };
}

/** Energy needed to finish the head of a queue this turn. */
export function rushCost(state: GameState, hex: number): number {
  const sys = state.map.hexes[hex].system;
  if (!sys || sys.queue.length === 0) return Infinity;
  return Math.ceil(sys.queue[0].remaining * 3);
}

export function rushBuild(state: GameState, faction: FactionId, hex: number): boolean {
  const cost = rushCost(state, hex);
  const f = state.factions[faction];
  if (state.map.hexes[hex].owner !== faction || f.stock.energy < cost) return false;
  f.stock.energy = round1(f.stock.energy - cost);
  state.map.hexes[hex].system!.queue[0].remaining = 0;
  return true;
}

function advanceBuilds(state: GameState, faction: FactionId): void {
  for (const hex of ownedHexes(state, faction)) {
    const sys = state.map.hexes[hex].system;
    if (!sys || sys.queue.length === 0) continue;
    let points = productionOf(state, hex);
    while (sys.queue.length > 0) {
      const head = sys.queue[0];
      if (head.remaining > points) {
        head.remaining = round1(head.remaining - points);
        break;
      }
      points -= head.remaining;
      sys.queue.shift();
      completeBuild(state, faction, hex, head);
    }
  }
}

export function completeBuild(state: GameState, faction: FactionId, hex: number, order: BuildOrder): void {
  const sys = state.map.hexes[hex].system!;
  const veteran = sys.improvements.includes('academy');
  switch (order.kind) {
    case 'ship': {
      const d = DESIGNS[order.item];
      const fid = spawnShip(state, faction, d, hex);
      const ship = state.ships[state.fleets[fid].ships[0]];
      if (veteran) ship.xp = 2;
      state.fleets[fid].movesLeft = 0;
      log(state, [faction], 'built', `${d.name} (${CLASSES[d.cls].name}) completed at ${sys.name}.`, hex);
      break;
    }
    case 'army': {
      const id = newId(state, 'r');
      const strength = BALANCE.army.strength;
      const xp = veteran || hasAbility(faction, 'veterans') ? 3 : 0;
      state.armies[id] = { id, owner: faction, strength, xp, hex, ship: null };
      log(state, [faction], 'built', `Army raised at ${sys.name}.`, hex);
      break;
    }
    case 'spy':
    case 'diplomat': {
      const id = newId(state, 'a');
      state.agents[id] = {
        id, owner: faction, kind: order.kind, hex, ship: null, path: [], target: null, mission: null,
        progress: 0, resident: false, capturedBy: null,
      };
      log(state, [faction], 'built', `${order.kind === 'spy' ? 'Spy' : 'Diplomat'} trained at ${sys.name}.`, hex);
      break;
    }
    case 'improvement': {
      sys.improvements.push(order.item);
      const imp = IMPROVEMENTS[order.item];
      if (imp?.defense) sys.defense += imp.defense * (hasAbility(faction, 'fortressWorlds') ? 2 : 1);
      if (imp?.garrison) sys.garrison += imp.garrison;
      log(state, [faction], 'built', `${imp?.name ?? order.item} completed at ${sys.name}.`, hex);
      break;
    }
    case 'wonder': {
      state.factions[faction].flags.ascensionGate = state.turn;
      log(state, [], 'wonder', `The Ascension Gate is complete at ${sys.name}!`, hex);
      break;
    }
    case 'develop': {
      sys.development = Math.min(5, sys.development + 1);
      if (sys.population < 1 && PLANET_YIELDS[sys.planet].popCap > 0) sys.population = 1;
      log(state, [faction], 'developed', `${sys.name} grew to development level ${sys.development}.`, hex);
      break;
    }
    default:
      break;
  }
}

/** Ship design ids the faction can currently build somewhere. */
export function buildableDesigns(state: GameState, faction: FactionId, hex: number): string[] {
  return Object.values(DESIGNS)
    .filter((d) => d.faction === faction && d.cls !== 'fighter')
    .filter((d) => checkBuild(state, faction, hex, 'ship', d.id).ok)
    .map((d) => d.id);
}

export { design };
