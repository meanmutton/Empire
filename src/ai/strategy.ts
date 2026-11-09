/**
 * Strategic layer for computer great powers: one campaign target at a time (so fleets and armies converge
 * instead of scattering), rescuing allies, starbases at the borders, balance-of-power war choices and
 * spy targeting. Pure functions over the game state; ai.ts turns them into orders.
 */
import { design } from '../data/designs';
import { hasAbility } from '../data/factions';
import { militaryStrength } from '../engine/diplomacy';
import { armyStrength } from '../engine/ground';
import { hexDistance } from '../engine/hex';
import { atWar, ownedHexes, relation } from '../engine/query';
import type { FactionId, Fleet, GameState } from '../engine/types';
import { score } from '../engine/victory';

export function fleetPower(state: GameState, fl: Fleet): number {
  return fl.ships.reduce((a, s) => {
    const d = design(state.ships[s].design).stats;
    return a + (d.energy + d.missile + d.hangar * 4) * Math.sqrt(state.ships[s].hull + d.shields * 3);
  }, 0);
}

/** Enemy military power sitting at a hex, including its planetary defense and starbase. */
export function defenseAt(state: GameState, hex: number, me: FactionId): number {
  let p = 0;
  for (const fl of Object.values(state.fleets)) if (fl.hex === hex && atWar(state, me, fl.owner)) p += fleetPower(state, fl);
  const h = state.map.hexes[hex];
  if (h.system && h.system.defense > 0 && (!h.owner || atWar(state, me, h.owner))) p += h.system.defense * 1.2 * Math.sqrt(h.system.defense * 5) * 0.8;
  for (const b of Object.values(state.starbases)) if (b.hex === hex && atWar(state, me, b.owner)) p += b.tier * 40 * Math.sqrt(b.hull);
  return p;
}

export function warPower(state: GameState, me: FactionId): number {
  let p = 0;
  for (const fl of Object.values(state.fleets)) if (fl.owner === me) p += fleetPower(state, fl);
  return p;
}

function nearestOwned(state: GameState, me: FactionId, hex: number): { hex: number; d: number } {
  let best = state.factions[me].home, bd = Infinity;
  for (const h of ownedHexes(state, me)) {
    const d = hexDistance(state.map, h, hex);
    if (d < bd) { bd = d; best = h; }
  }
  return { hex: best, d: bd };
}

/**
 * The system this empire's war effort concentrates on. Rescuing an ally's system under attack comes first;
 * otherwise the most valuable enemy system it can realistically take, weighted toward nearby targets and
 * ones where allied fleets are already fighting. Kept in flags.campaign (hex + 1) while it stays valid.
 */
export function campaignTarget(state: GameState, me: FactionId, enemies: FactionId[]): number | null {
  const f = state.factions[me];
  if (enemies.length === 0) { f.flags.campaign = 0; return null; }
  const allies = Object.keys(state.factions).filter((o) => o !== me && state.factions[o].alive && relation(state, me, o).status === 'alliance');
  // 1. Rescue: an ally's settled system with our enemies' fleets in it.
  for (const a of allies) {
    for (const h of ownedHexes(state, a)) {
      const sys = state.map.hexes[h].system;
      if (!sys || sys.development === 0) continue;
      if (Object.values(state.fleets).some((x) => x.hex === h && enemies.includes(x.owner))) return h;
    }
  }
  // 2. Keep the current target while it is still an enemy system.
  const cur = (f.flags.campaign ?? 0) - 1;
  if (cur >= 0) {
    const h = state.map.hexes[cur];
    if (h?.system && h.system.development > 0 && h.owner && enemies.includes(h.owner)) return cur;
  }
  // 3. Pick the best enemy system.
  const power = warPower(state, me);
  let best: number | null = null, bestScore = -Infinity;
  state.map.hexes.forEach((h, i) => {
    if (!h.system || h.system.development === 0 || !h.owner || !enemies.includes(h.owner)) return;
    const sys = h.system;
    const value = sys.development * 3 + sys.population + sys.improvements.length * 2 + (sys.homeOf ? 15 : 0);
    const dist = nearestOwned(state, me, i).d;
    const defense = defenseAt(state, i, me);
    if (defense > power * 0.9) return;
    const allyNear = Object.values(state.fleets).some((x) => allies.includes(x.owner) && hexDistance(state.map, x.hex, i) <= 3) ? 5 : 0;
    const s = value - dist * 1.5 - (power > 0 ? (defense / power) * 20 : 20) + allyNear;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  f.flags.campaign = best === null ? 0 : best + 1;
  return best;
}

/** Where forces gather before striking: our hex nearest the target. */
export function stagingHex(state: GameState, me: FactionId, target: number): number {
  return nearestOwned(state, me, target).hex;
}

/** Our war power already at or near the staging area and the target. */
export function gatheredPower(state: GameState, me: FactionId, staging: number, target: number): number {
  let p = 0;
  for (const fl of Object.values(state.fleets)) {
    if (fl.owner !== me) continue;
    if (hexDistance(state.map, fl.hex, staging) <= 2 || fl.hex === target) p += fleetPower(state, fl);
  }
  return p;
}

/** Armies needed to take a system: its garrison and defending armies with the +50% defender bonus, plus a margin. */
export function armiesNeeded(state: GameState, me: FactionId, target: number): number {
  const h = state.map.hexes[target];
  if (!h.system) return 0;
  const defenders = Object.values(state.armies).filter((a) => a.hex === target && a.owner === h.owner);
  const defense = (h.system.garrison + defenders.reduce((a, d) => a + (h.owner ? armyStrength(state, h.owner, d.strength, d.xp) : d.strength), 0)) * 1.5;
  const per = armyStrength(state, me, 10, 0);
  return Math.min(10, Math.max(1, Math.ceil((defense * 1.4) / per)));
}

/**
 * Where a constructor should put a starbase: an owned hex facing the nearest non-allied great power, at most
 * one starbase per six systems (home always counts as a site).
 */
export function starbaseSite(state: GameState, me: FactionId): number | null {
  const bases = Object.values(state.starbases).filter((b) => b.owner === me);
  const systems = ownedHexes(state, me).filter((h) => state.map.hexes[h].system);
  if (bases.length >= 1 + Math.floor(systems.length / 6)) return null;
  const rivals = Object.values(state.factions).filter((o) => o.kind === 'major' && o.alive && o.id !== me && relation(state, me, o.id).status !== 'alliance').map((o) => o.id);
  const theirs = rivals.flatMap((r) => ownedHexes(state, r));
  if (theirs.length === 0) return bases.some((b) => b.hex === state.factions[me].home) ? null : state.factions[me].home;
  let best: number | null = null, bestScore = Infinity;
  for (const h of systems) {
    if (bases.some((b) => b.hex === h)) continue;
    let d = Infinity;
    for (const t of theirs) { const dd = hexDistance(state.map, h, t); if (dd < d) d = dd; if (d <= 1) break; }
    const s = d - (state.map.hexes[h].system!.development * 0.3);
    if (s < bestScore) { bestScore = s; best = h; }
  }
  return best;
}

/** How many great powers are already at war with `target`. */
export function warsAgainst(state: GameState, target: FactionId): number {
  return Object.values(state.factions).filter((o) => o.kind === 'major' && o.alive && o.id !== target && atWar(state, o.id, target)).length;
}

/** Whether `f` is running away with the game: score over 1.4× the average of the other great powers. */
export function isRunaway(state: GameState, f: FactionId): boolean {
  const others = Object.values(state.factions).filter((o) => o.kind === 'major' && o.alive && o.id !== f);
  if (others.length === 0) return false;
  const avg = others.reduce((a, o) => a + score(state, o.id), 0) / others.length;
  return score(state, f) > avg * 1.4;
}

/** Best place for a spy to work, and the mission to run there. */
export function spyTarget(state: GameState, me: FactionId, from: number, enemies: FactionId[]): { hex: number; mission: 'stealTech' | 'sabotage' | 'incite' | 'subversion' } | null {
  const mine = new Set(state.factions[me].research.known);
  let best: { hex: number; mission: 'stealTech' | 'sabotage' | 'incite' | 'subversion' } | null = null, bestScore = -Infinity;
  for (const o of Object.values(state.factions)) {
    if (o.id === me || !o.alive || o.kind !== 'major' || !relation(state, me, o.id).contact || relation(state, me, o.id).status === 'alliance') continue;
    if (hasAbility(o.id, 'mindShield')) continue;
    const techGap = o.research.known.filter((t) => !mine.has(t)).length;
    const war = enemies.includes(o.id);
    for (const h of ownedHexes(state, o.id)) {
      const sys = state.map.hexes[h].system;
      if (!sys || sys.development === 0) continue;
      const dist = hexDistance(state.map, from, h);
      if (dist > 20) continue;
      let mission: 'stealTech' | 'sabotage' | 'incite' | 'subversion' = 'incite';
      let s = sys.development + sys.improvements.length - dist * 0.3;
      if (hasAbility(me, 'fifthColumn') && !sys.homeOf) { mission = 'subversion'; s += sys.unrest / 10 + 3; }
      else if (war && sys.improvements.some((i) => i === 'shipyard' || i === 'heavyShipyard')) { mission = 'sabotage'; s += 4; }
      else if (techGap >= 2) { mission = 'stealTech'; s += techGap; }
      if (s > bestScore) { bestScore = s; best = { hex: h, mission }; }
    }
  }
  return best;
}

export { militaryStrength };
