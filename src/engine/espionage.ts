/** Spy missions (§6.5). A spy in one of the target's systems works on a mission for a few turns, then rolls. */
import { factionDef, hasAbility, modifiersOf } from '../data/factions';
import { IMPROVEMENTS } from '../data/improvements';
import { TECH_BY_ID } from '../data/techs';
import { adjustOpinion } from './agents';
import { setBits } from './bitset';
import { log } from './events';
import { conquerSystem } from './ground';
import { ownedHexes, relation } from './query';
import { grantTech, techEffects } from './research';
import { Rng } from './rng';
import type { FactionId, GameState } from './types';

export const MISSIONS = {
  stealTech: { name: 'Steal Technology', turns: 3, base: 0.45, text: 'Steal a technology the target knows.' },
  sabotage: { name: 'Sabotage', turns: 2, base: 0.5, text: 'Destroy an improvement or wreck the build queue.' },
  incite: { name: 'Incite Unrest', turns: 2, base: 0.55, text: 'Raise unrest in the system by 30.' },
  subversion: { name: 'Subversion', turns: 3, base: 0.45, text: 'Krasnyr only: raise unrest by 25; at 100 the system defects.' },
  reveal: { name: 'Reveal Territory', turns: 1, base: 0.7, text: 'Map all of the target’s territory.' },
  assassinate: { name: 'Assassinate Diplomat', turns: 2, base: 0.4, text: 'Kill a foreign diplomat at the target’s home, closing that embassy.' },
} as const;
export type MissionId = keyof typeof MISSIONS;

export type Result = { ok: true; text?: string } | { ok: false; reason: string };

export function startMission(state: GameState, agentId: string, mission: MissionId): Result {
  const a = state.agents[agentId];
  if (!a || a.kind !== 'spy' || a.capturedBy || a.ship) return { ok: false, reason: 'Pick a free spy.' };
  if (!(mission in MISSIONS)) return { ok: false, reason: 'Unknown mission.' };
  const h = state.map.hexes[a.hex];
  const target = h.owner;
  if (!target || target === a.owner || !h.system) return { ok: false, reason: 'The spy must be in a foreign star system.' };
  if (mission === 'subversion' && !hasAbility(a.owner, 'fifthColumn')) return { ok: false, reason: 'Only the Krasnyr can run Subversion.' };
  if (mission === 'assassinate' && h.system.homeOf !== target) return { ok: false, reason: 'Diplomats live at home systems.' };
  a.mission = mission;
  a.target = target;
  a.progress = 0;
  return { ok: true };
}

export function successChance(state: GameState, spyOwner: FactionId, target: FactionId, mission: MissionId): number {
  if (hasAbility(target, 'mindShield')) return 0;
  let p: number = MISSIONS[mission].base;
  p *= 1 + modifiersOf(spyOwner).espionage + techEffects(state, spyOwner).espionage;
  if (hasAbility(spyOwner, 'stateSecurity')) p *= 1.3;
  if (hasAbility(spyOwner, 'infiltrators')) p *= 1.4;
  p *= 1 - techEffects(state, target).spyDefense;
  if (hasAbility(target, 'courtIntrigue')) p *= 0.8;
  return Math.max(0.02, Math.min(0.95, p));
}

/** Advances this faction's spy missions at the start of its turn. */
export function runEspionage(state: GameState, faction: FactionId): void {
  const rng = new Rng(state.rng);
  for (const a of Object.values(state.agents)) {
    if (a.owner !== faction || a.kind !== 'spy' || !a.mission || a.capturedBy) continue;
    const mission = a.mission as MissionId;
    const target = a.target!;
    if (state.map.hexes[a.hex].owner !== target) { a.mission = null; continue; }
    a.progress++;
    if (a.progress < MISSIONS[mission].turns) continue;
    a.progress = 0;
    const repeat = mission === 'subversion' || mission === 'incite';
    if (!repeat) a.mission = null;
    if (rng.chance(successChance(state, faction, target, mission))) {
      succeed(state, rng, a.id, mission, target);
    } else if (rng.chance(0.5)) {
      a.capturedBy = target;
      a.mission = null;
      adjustOpinion(state, target, faction, -15);
      relation(state, faction, target).contact = true;
      log(state, [faction, target], 'spy', `A ${factionDef(faction).short} spy was caught by ${factionDef(target).short}.`, a.hex);
    } else {
      log(state, [faction], 'spy', `Spy mission ${MISSIONS[mission].name} failed, but the spy escaped.`, a.hex);
    }
  }
}

function succeed(state: GameState, rng: Rng, agentId: string, mission: MissionId, target: FactionId): void {
  const a = state.agents[agentId];
  const me = a.owner;
  const sys = state.map.hexes[a.hex].system!;
  switch (mission) {
    case 'stealTech': {
      const mine = new Set(state.factions[me].research.known);
      const options = state.factions[target].research.known.filter((t) => !mine.has(t) && t !== 'ascension');
      if (options.length === 0) { log(state, [me], 'spy', 'There was nothing worth stealing.'); return; }
      const t = rng.pick(options);
      grantTech(state, me, t);
      log(state, [me], 'spy', `Spies stole ${TECH_BY_ID[t].name} from ${factionDef(target).short}.`, a.hex);
      return;
    }
    case 'sabotage': {
      if (sys.improvements.length && rng.chance(0.6)) {
        const idx = rng.int(sys.improvements.length);
        const [gone] = sys.improvements.splice(idx, 1);
        log(state, [me, target], 'spy', `Saboteurs destroyed the ${IMPROVEMENTS[gone]?.name ?? gone} at ${sys.name}.`, a.hex);
      } else {
        for (const q of sys.queue) q.remaining *= 2;
        log(state, [me, target], 'spy', `Saboteurs set back construction at ${sys.name}.`, a.hex);
      }
      return;
    }
    case 'incite':
      sys.unrest = Math.min(100, sys.unrest + 30);
      log(state, [me], 'spy', `Unrest is spreading on ${sys.name}.`, a.hex);
      return;
    case 'subversion':
      sys.unrest = Math.min(100, sys.unrest + 25);
      if (sys.unrest >= 100 && sys.homeOf !== target) {
        conquerSystem(state, a.hex, me, true);
        a.mission = null;
        log(state, [], 'defection', `${sys.name} defected from ${factionDef(target).name} to ${factionDef(me).name}!`, a.hex);
      }
      return;
    case 'reveal':
      state.factions[me].explored = setBits(state.factions[me].explored, ownedHexes(state, target));
      log(state, [me], 'spy', `Spies mapped all of ${factionDef(target).short} territory.`);
      return;
    case 'assassinate': {
      const victim = Object.values(state.agents).find((x) => x.kind === 'diplomat' && x.resident && x.target === target && x.owner !== me);
      if (!victim) { log(state, [me], 'spy', 'No foreign diplomat was found.'); return; }
      delete state.agents[victim.id];
      const r = relation(state, victim.owner, target);
      if (r.a === victim.owner) r.embassyA = false; else r.embassyB = false;
      adjustOpinion(state, victim.owner, target, -25);
      log(state, [victim.owner, target], 'spy', `The ${factionDef(victim.owner).short} ambassador was murdered at ${sys.name}.`, a.hex);
      return;
    }
  }
}
