/**
 * Space combat (§7). One round per faction turn, resolved simultaneously for every party in the hex.
 *
 * Each party's strength against its enemies is attack (after enemy shields and point defense) × durability,
 * Lanchester style. The fraction of a party destroyed in a round is
 *   0.5 × (incoming enemy strength / own strength) ^ 0.75, capped at 100%,
 * so two equal forces each lose about half per round, and a force twice as strong loses ~30% while
 * destroying ~84%. Damage is focus-fired: ships are picked one at a time (bigger ships and escorts draw more
 * fire) and destroyed, so the fraction shows up as lost ships rather than an even scratch on everyone.
 */
import { BALANCE } from '../data/balance';
import { design, DESIGNS } from '../data/designs';
import { hasAbility as hasAbilityRaw } from '../data/factions';
import { ROLES } from '../data/ships';
import { log } from './events';
import { neighbors } from './hex';
import { newId } from './ids';
import { removeShip } from './movement';
import { atWar } from './query';
import { techEffects } from './research';
import { Rng } from './rng';
import { spawnShip } from './setup';
import type { FactionId, GameState } from './types';

/** Pseudo-faction id for independent (unowned) defended systems. */
export const INDEPENDENT = '@independent';

function hasAbility(f: FactionId, a: Parameters<typeof hasAbilityRaw>[1]): boolean {
  return f !== INDEPENDENT && hasAbilityRaw(f, a);
}

interface Unit {
  kind: 'ship' | 'starbase' | 'planet';
  /** Ship id, starbase id, or hex as string for planets. */
  id: string;
  hull: number;
  maxHull: number;
  shields: number;
  energy: number;
  missile: number;
  fighters: number;
  pd: number;
  weight: number;
  xp: number;
  cost: number;
  /** Durability multiplier from tech (hull, starbase, planetary). */
  tough: number;
}

interface Party {
  faction: FactionId;
  units: Unit[];
}

export interface BattleReport {
  hex: number;
  firstRound: boolean;
  parties: { faction: FactionId; units: number; lost: number; captured: number; damage: number }[];
}

function shieldEnv(state: GameState, hex: number): number {
  const t = state.map.hexes[hex].terrain;
  return t === 'nebula' ? 0.5 : t === 'ionStorm' ? 0 : 1;
}

function effHP(u: Unit, env: number): number {
  return (u.kind === 'ship' ? u.hull + 2 * u.shields * env : u.hull) * u.tough;
}

function collectParties(state: GameState, hex: number, active: FactionId): Party[] {
  const parties = new Map<FactionId, Party>();
  const party = (f: FactionId) => {
    let p = parties.get(f);
    if (!p) parties.set(f, (p = { faction: f, units: [] }));
    return p;
  };
  for (const fl of Object.values(state.fleets)) {
    if (fl.hex !== hex) continue;
    const te = techEffects(state, fl.owner);
    for (const sid of fl.ships) {
      const s = state.ships[sid];
      const d = design(s.design);
      party(fl.owner).units.push({
        kind: 'ship', id: sid, hull: s.hull, maxHull: d.stats.hull, shields: d.stats.shields * (1 + te.shields),
        energy: d.stats.energy * (1 + te.energyWeapons + te.attack), missile: d.stats.missile * (1 + te.missiles + te.attack),
        fighters: s.fighters * (1 + te.fighters), pd: d.stats.pd * (1 + te.pointDefense), tough: 1 + te.hull,
        weight: d.cls === 'fighter' ? 0.5 : DESIGN_WEIGHT(d.cls) * (ROLES[d.role].escort ? 2.5 : 1),
        xp: s.xp, cost: d.cost.metals + d.cost.energy,
      });
    }
  }
  for (const b of Object.values(state.starbases)) {
    if (b.hex !== hex) continue;
    const spec = BALANCE.starbase[b.tier as 1 | 2 | 3]!;
    const te = techEffects(state, b.owner);
    party(b.owner).units.push({
      kind: 'starbase', id: b.id, hull: b.hull, maxHull: spec.hull, shields: 0, energy: spec.defense * (1 + te.attack),
      missile: spec.defense / 2, fighters: 0, pd: spec.defense / 4, weight: 8, xp: 1, cost: spec.metals,
      tough: 1 + te.starbaseHull,
    });
  }
  const h = state.map.hexes[hex];
  const sys = h.system;
  if (sys && sys.development > 0 && sys.defense > 0) {
    const owner = h.owner ?? INDEPENDENT;
    const pd = h.owner ? 1 + techEffects(state, h.owner).planetDefense : 1;
    const attack = sys.defense * BALANCE.defenseAttackPerPoint * pd;
    party(owner).units.push({
      kind: 'planet', id: String(hex), hull: sys.defense * 5, maxHull: sys.defense * 5, shields: 0,
      energy: attack / 2, missile: attack / 2, fighters: 0, pd: sys.defense / 4, weight: 6, xp: 1, cost: 0, tough: pd,
    });
  }
  const list = [...parties.values()];
  void active;
  return list;
}

function DESIGN_WEIGHT(cls: string): number {
  const sizes: Record<string, number> = {
    runabout: 1, corvette: 2, frigate: 3, destroyer: 4, lightCruiser: 5, heavyCruiser: 6,
    battleCruiser: 7, battleship: 8, dreadnaught: 10,
  };
  return sizes[cls] ?? 1;
}

/** Do parties a and b fight? Independents fight factions that have aggressive fleets present. */
function hostile(state: GameState, hex: number, a: FactionId, b: FactionId): boolean {
  if (a === b) return false;
  if (a === INDEPENDENT || b === INDEPENDENT) {
    const other = a === INDEPENDENT ? b : a;
    return Object.values(state.fleets).some((f) => f.hex === hex && f.owner === other && f.stance === 'aggressive');
  }
  return atWar(state, a, b);
}

/** Hexes where `faction` must fight this turn. */
export function battleHexes(state: GameState, faction: FactionId): number[] {
  const candidates = new Set<number>();
  for (const f of Object.values(state.fleets)) if (f.owner === faction) candidates.add(f.hex);
  for (const b of Object.values(state.starbases)) if (b.owner === faction) candidates.add(b.hex);
  state.map.hexes.forEach((h, i) => { if (h.owner === faction && h.system && h.system.defense > 0) candidates.add(i); });
  const out: number[] = [];
  for (const hex of candidates) {
    const parties = collectParties(state, hex, faction);
    const me = parties.find((p) => p.faction === faction);
    if (!me) continue;
    if (parties.some((p) => hostile(state, hex, faction, p.faction))) out.push(hex);
  }
  return out.sort((a, b) => a - b);
}

/** Resolves one combat round in every hex where `faction` is fighting. */
export function resolveCombat(state: GameState, faction: FactionId): BattleReport[] {
  const reports: BattleReport[] = [];
  for (const hex of battleHexes(state, faction)) reports.push(resolveBattleAt(state, hex, faction));
  return reports;
}

export function resolveBattleAt(state: GameState, hex: number, active: FactionId): BattleReport {
  const rng = new Rng(state.rng);
  const parties = collectParties(state, hex, active);
  const env = shieldEnv(state, hex);
  const last = state.battles[hex];
  const firstRound = last === undefined || state.seq - last > state.turnOrder.length;
  state.battles[hex] = state.seq;

  const enemiesOf = (p: Party) => parties.filter((q) => hostile(state, hex, p.faction, q.faction));
  const durability = (p: Party) => p.units.reduce((a, u) => a + effHP(u, env), 0);

  // Effective attack of p against its enemies (after shields and point defense).
  const attackOf = (p: Party): number => {
    const enemies = enemiesOf(p);
    if (enemies.length === 0) return 0;
    const eUnits = enemies.flatMap((q) => q.units);
    const ships = eUnits.filter((u) => u.kind === 'ship');
    const avgShield = ships.length ? ships.reduce((a, u) => a + u.shields, 0) / ships.length : 0;
    const shieldFrac = Math.min(0.6, (avgShield * env) / 30);
    const myMissiles = p.units.reduce((a, u) => a + u.missile + u.fighters * 3, 0);
    const enemyPd = eUnits.reduce((a, u) => a + u.pd, 0);
    const pdFrac = Math.min(0.6, (enemyPd / (myMissiles + 1)) * 0.5);
    let total = 0;
    for (const u of p.units) {
      const xpMult = 1 + 0.05 * Math.max(0, u.xp - 1);
      total += (u.energy * (1 - shieldFrac) + u.missile * (1 - pdFrac) * (1 - shieldFrac / 2) + u.fighters * 6 * (1 - pdFrac * 0.5)) * xpMult;
    }
    return total * partyMultiplier(state, hex, p, enemies, firstRound, env);
  };

  const A = new Map(parties.map((p) => [p.faction, attackOf(p)]));
  const D = new Map(parties.map((p) => [p.faction, durability(p)]));
  const S = (f: FactionId) => (A.get(f) ?? 0) * (D.get(f) ?? 0);

  // Damage pool each party receives (in effective HP).
  const incoming = new Map<FactionId, number>();
  const dealt = new Map<FactionId, number>();
  for (const q of parties) {
    const attackers = enemiesOf(q);
    if (attackers.length === 0) continue;
    let enemyStrength = 0;
    let rawCap = 0;
    for (const p of attackers) {
      const theirEnemies = enemiesOf(p);
      const totalD = theirEnemies.reduce((a, r) => a + (D.get(r.faction) ?? 0), 0) || 1;
      const share = (D.get(q.faction) ?? 0) / totalD;
      enemyStrength += S(p.faction) * share;
      rawCap += (A.get(p.faction) ?? 0) * share * 25;
    }
    const own = S(q.faction);
    let fraction = own > 0 ? 0.5 * Math.pow(enemyStrength / own, 0.75) : enemyStrength > 0 ? 1 : 0;
    fraction *= rng.float(BALANCE.combatRandomLow, BALANCE.combatRandomHigh);
    if (firstRound && attackers.some((p) => hasAbility(p.faction, 'solarFlare'))) fraction += 0.1;
    fraction = Math.min(1, fraction);
    const pool = Math.min(fraction * (D.get(q.faction) ?? 0), rawCap);
    incoming.set(q.faction, pool);
    for (const p of attackers) {
      const share = (S(p.faction) || 1) / (enemyStrength || 1);
      dealt.set(p.faction, (dealt.get(p.faction) ?? 0) + pool * Math.min(1, share));
    }
  }

  // Apply damage simultaneously.
  const destroyed = new Map<FactionId, Unit[]>();
  for (const q of parties) {
    const pool = incoming.get(q.faction) ?? 0;
    destroyed.set(q.faction, applyDamage(state, rng, hex, q, pool, env));
  }

  const report: BattleReport = { hex, firstRound, parties: [] };
  for (const q of parties) {
    const lost = destroyed.get(q.faction) ?? [];
    const enemies = enemiesOf(q).map((p) => p.faction);
    let captured = 0;
    for (const u of lost) {
      if (u.kind !== 'ship') continue;
      const ship = state.ships[u.id];
      if (!ship) continue;
      const captor = enemies.find((e) => e !== INDEPENDENT && (hasAbility(e, 'boardingActions') || hasAbility(e, 'boardingParties')));
      if (captor && rng.chance(0.25)) {
        captureShip(state, ship.id, captor, hex);
        captured++;
        continue;
      }
      for (const e of enemies) {
        if (e === INDEPENDENT) continue;
        if (hasAbility(e, 'salvagers')) state.factions[e].stock.metals += Math.round(u.cost * 0.25);
      }
      const cryx = enemies.find((e) => e !== INDEPENDENT && hasAbility(e, 'cryxAssimilation'));
      if (cryx && rng.chance(0.2) && DESIGNS[ship.design]) {
        const fid = spawnShip(state, cryx, design(ship.design), hex);
        const ns = state.ships[state.fleets[fid].ships[0]];
        ns.hull = Math.max(1, Math.round(design(ship.design).stats.hull * 0.25));
        state.fleets[fid].name = 'Risen';
      }
      removeShip(state, ship.id);
    }
    report.parties.push({
      faction: q.faction, units: q.units.length, lost: lost.length - captured, captured,
      damage: Math.round(dealt.get(q.faction) ?? 0),
    });
  }

  // Aftermath: experience, Lattice learning, elusive retreats, spores.
  for (const q of parties) {
    if (q.faction === INDEPENDENT) continue;
    if (hasAbility(q.faction, 'distributedCognition')) state.factions[q.faction].research.progress += 5 + q.units.length;
    for (const u of q.units) {
      const s = u.kind === 'ship' ? state.ships[u.id] : undefined;
      if (s && s.xp < 3 && rng.chance(0.3)) s.xp++;
    }
    const lostFrac = (destroyed.get(q.faction)?.length ?? 0) / Math.max(1, q.units.length);
    if (hasAbility(q.faction, 'elusive') && lostFrac >= 0.3 && rng.chance(0.5)) {
      const exits = neighbors(state.map, hex).filter((n) => state.map.hexes[n].terrain !== 'blackHole');
      if (exits.length) {
        const to = rng.pick(exits);
        for (const f of Object.values(state.fleets)) if (f.owner === q.faction && f.hex === hex) { f.hex = to; f.path = []; }
      }
    }
    const sys = state.map.hexes[hex].system;
    if (sys && hasAbility(q.faction, 'sporePayload') && enemiesOf(q).some((p) => p.faction === (state.map.hexes[hex].owner ?? INDEPENDENT))) {
      const floor = state.map.hexes[hex].owner && hasAbility(state.map.hexes[hex].owner!, 'deepShelters') ? 1 : 0;
      sys.population = Math.max(floor, sys.population - 1);
    }
  }

  const involved = parties.map((p) => p.faction).filter((f) => f !== INDEPENDENT);
  const name = state.map.hexes[hex].system?.name ?? 'deep space';
  const summary = report.parties.map((p) => `${p.faction} lost ${p.lost}/${p.units}${p.captured ? ` (${p.captured} captured)` : ''}`).join(', ');
  log(state, involved, 'battle', `Battle at ${name}: ${summary}.`, hex);
  return report;
}

function partyMultiplier(state: GameState, hex: number, p: Party, enemies: Party[], firstRound: boolean, env: number): number {
  if (p.faction === INDEPENDENT) return 1;
  const f = p.faction;
  let m = 1;
  if (state.factions[f].flags.unsupplied) m -= BALANCE.negativeEnergyCombatPenalty;
  if (firstRound && hasAbility(f, 'wayOfTheBlade')) m += 0.25;
  if (firstRound && enemies.some((e) => e.faction !== INDEPENDENT && hasAbility(e.faction, 'harmonicCalm'))) m -= 0.2;
  const terrain = state.map.hexes[hex].terrain;
  if (hasAbility(f, 'ambush') && (terrain === 'nebula' || terrain === 'asteroids')) m += 0.3;
  if (hasAbility(f, 'stampede') && state.map.hexes[hex].owner === f) m += 0.2;
  if (hasAbility(f, 'grudge') && enemies.some((e) => e.faction === 'lattice')) m += 0.25;
  if (enemies.some((e) => state.factions[f].flags[`grudge:${e.faction}`])) m += 0.1;
  if (hasAbility(f, 'huntersInstinct')) {
    const eu = enemies.flatMap((e) => e.units);
    const hp = eu.reduce((a, u) => a + u.hull, 0), max = eu.reduce((a, u) => a + u.maxHull, 0);
    if (max > 0 && hp / max < 0.9) m += 0.3;
  }
  void env;
  return Math.max(0.1, m);
}

/** Focus-fire damage onto a party's units. Returns destroyed units. */
function applyDamage(state: GameState, rng: Rng, hex: number, q: Party, pool: number, env: number): Unit[] {
  const destroyed: Unit[] = [];
  const alive = q.units.map((u) => ({ u, hp: effHP(u, env) }));
  let remaining = pool;
  while (remaining > 0.5 && alive.length > 0) {
    const total = alive.reduce((a, x) => a + x.u.weight, 0);
    let r = rng.next() * total;
    let idx = 0;
    for (; idx < alive.length - 1; idx++) {
      r -= alive[idx].u.weight;
      if (r < 0) break;
    }
    const t = alive[idx];
    const hit = Math.min(remaining, t.hp);
    remaining -= hit;
    if (hit >= t.hp - 0.01) {
      destroyed.push(t.u);
      alive.splice(idx, 1);
      if (t.u.kind !== 'ship') applyUnitHull(state, hex, t.u, 0);
    } else {
      const frac = effHP(t.u, env) > 0 ? t.u.hull / effHP(t.u, env) : 1;
      // frac converts effective damage (which includes shields and toughness) back into hull points.
      t.hp -= hit;
      applyUnitHull(state, hex, t.u, Math.max(1, t.u.hull - hit * frac));
      t.u.hull = Math.max(1, t.u.hull - hit * frac);
    }
  }
  // Carriers lose fighters in proportion to the damage taken.
  const lostFrac = Math.min(1, pool / Math.max(1, q.units.reduce((a, u) => a + effHP(u, env), 0)));
  for (const u of q.units) {
    if (u.kind === 'ship' && u.fighters > 0 && state.ships[u.id]) {
      state.ships[u.id].fighters = Math.max(0, Math.round(u.fighters * (1 - lostFrac)));
    }
  }
  return destroyed.filter((u) => u.kind === 'ship' || u.kind === 'starbase');
}

function applyUnitHull(state: GameState, hex: number, u: Unit, hull: number): void {
  if (u.kind === 'ship') {
    const s = state.ships[u.id];
    if (s) s.hull = Math.round(hull);
  } else if (u.kind === 'starbase') {
    if (hull <= 0) delete state.starbases[u.id];
    else if (state.starbases[u.id]) state.starbases[u.id].hull = Math.round(hull);
  } else {
    const sys = state.map.hexes[hex].system;
    if (sys) sys.defense = Math.max(0, Math.round(hull / 5));
  }
}

function captureShip(state: GameState, shipId: string, captor: FactionId, hex: number): void {
  const s = state.ships[shipId];
  const d = design(s.design);
  const oldFleet = state.fleets[s.fleet];
  if (oldFleet) {
    oldFleet.ships = oldFleet.ships.filter((x) => x !== shipId);
    if (oldFleet.ships.length === 0) delete state.fleets[oldFleet.id];
  }
  for (const c of s.cargo) { delete state.armies[c]; delete state.agents[c]; }
  const fid = newId(state, 'f');
  state.fleets[fid] = { id: fid, owner: captor, name: `Prize ${d.name}`, hex, ships: [shipId], movesLeft: 0, path: [], stance: 'passive' };
  s.owner = captor;
  s.fleet = fid;
  s.cargo = [];
  s.hull = Math.max(1, Math.round(d.stats.hull * 0.25));
  log(state, [captor, d.faction], 'captured', `${captor} boarded and captured a ${d.name}.`, hex);
}

/** Retreat: the fleet moves to an adjacent hex free of enemies after taking a parting volley. */
export function retreatFleet(state: GameState, fleetId: string): { ok: boolean; reason?: string } {
  const f = state.fleets[fleetId];
  if (!f) return { ok: false, reason: 'No such fleet.' };
  if (hasAbility(f.owner, 'wayOfTheBlade')) return { ok: false, reason: "The Ryn'kai never retreat." };
  const enemies = Object.values(state.fleets).filter((x) => x.hex === f.hex && atWar(state, f.owner, x.owner));
  if (enemies.length === 0) return { ok: false, reason: 'There is nothing to retreat from.' };
  const exits = neighbors(state.map, f.hex).filter((n) =>
    state.map.hexes[n].terrain !== 'blackHole' &&
    !Object.values(state.fleets).some((x) => x.hex === n && atWar(state, f.owner, x.owner)));
  if (exits.length === 0) return { ok: false, reason: 'Surrounded: no way out.' };
  const rng = new Rng(state.rng);
  // Parting shot: each ship has a chance to be destroyed unless the retreating group is faster.
  const mySpeed = Math.min(...f.ships.map((s) => design(state.ships[s].design).stats.speed));
  const theirSpeed = Math.max(...enemies.flatMap((e) => e.ships.map((s) => design(state.ships[s].design).stats.speed)));
  const risk = mySpeed > theirSpeed ? 0.05 : 0.2;
  for (const sid of [...f.ships]) if (rng.chance(risk)) removeShip(state, sid);
  if (state.fleets[fleetId]) {
    f.hex = rng.pick(exits);
    f.movesLeft = 0;
    f.path = [];
  }
  return { ok: true };
}

/** Repairs and fighter restocking at the start of a faction's turn. */
export function repairFleets(state: GameState, faction: FactionId): void {
  const docks = new Set(Object.values(state.starbases).filter((b) => b.owner === faction).map((b) => b.hex));
  state.map.hexes.forEach((h, i) => { if (h.owner === faction && h.system?.improvements.some((x) => x === 'shipyard' || x === 'heavyShipyard')) docks.add(i); });
  let bonus = 0;
  if (hasAbility(faction, 'selfRepair') || hasAbility(faction, 'mechSelfRepair')) bonus += 0.15;
  if (hasAbility(faction, 'regrowth')) bonus += 0.1;
  if (hasAbility(faction, 'livingHulls')) bonus += 0.2;
  for (const f of Object.values(state.fleets)) {
    if (f.owner !== faction) continue;
    const owned = state.map.hexes[f.hex].owner === faction;
    let rate = bonus;
    if (docks.has(f.hex)) rate += BALANCE.repairDock;
    else if (owned) rate += BALANCE.repairFriendly;
    for (const sid of f.ships) {
      const s = state.ships[sid];
      const d = design(s.design);
      if (rate > 0) s.hull = Math.min(d.stats.hull, Math.round(s.hull + d.stats.hull * rate));
      if (owned && s.fighters < d.stats.hangar) s.fighters = Math.min(d.stats.hangar, s.fighters + Math.max(1, Math.ceil(d.stats.hangar / 3)));
    }
  }
}
