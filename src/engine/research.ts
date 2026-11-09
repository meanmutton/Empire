/** Research progress and the summed effects of known techs (§8). */
import { FIELDS, TECH_BY_ID, TECHS, TIER_COST, type TechEffects } from '../data/techs';
import { log } from './events';
import type { FactionId, GameState } from './types';

export function techCost(id: string): number {
  return TIER_COST[TECH_BY_ID[id].tier];
}

export function knows(state: GameState, faction: FactionId, tech: string): boolean {
  return state.factions[faction].research.known.includes(tech);
}

/** Fields whose every tech the faction knows. */
export function completedFields(state: GameState, faction: FactionId): string[] {
  const known = new Set(state.factions[faction].research.known);
  return FIELDS.filter((f) => TECHS.filter((t) => t.field === f && t.id !== 'ascension').every((t) => known.has(t.id)));
}

export function canResearch(state: GameState, faction: FactionId, tech: string): boolean {
  const t = TECH_BY_ID[tech];
  if (!t || knows(state, faction, tech)) return false;
  if (tech === 'ascension') return completedFields(state, faction).length >= 4;
  return t.requires.every((r) => knows(state, faction, r));
}

export function availableTechs(state: GameState, faction: FactionId): string[] {
  return TECHS.filter((t) => canResearch(state, faction, t.id)).map((t) => t.id);
}

export function setResearch(state: GameState, faction: FactionId, tech: string | null): boolean {
  if (tech !== null && !canResearch(state, faction, tech)) return false;
  state.factions[faction].research.current = tech;
  return true;
}

export function grantTech(state: GameState, faction: FactionId, tech: string): void {
  const r = state.factions[faction].research;
  if (r.known.includes(tech)) return;
  r.known.push(tech);
  effectsCache.delete(cacheKey(state, faction));
  if (r.current === tech) r.current = null;
}

/** Completes research while banked science covers the current project. */
export function advanceResearch(state: GameState, faction: FactionId): string[] {
  const r = state.factions[faction].research;
  const done: string[] = [];
  while (r.current && r.progress >= techCost(r.current)) {
    const t = r.current;
    r.progress -= techCost(t);
    grantTech(state, faction, t);
    done.push(t);
    log(state, [faction], 'research', `Research complete: ${TECH_BY_ID[t].name}.`);
  }
  r.progress = Math.round(r.progress * 10) / 10;
  return done;
}

const effectsCache = new Map<string, Required<TechEffects>>();
function cacheKey(state: GameState, faction: FactionId): string {
  return `${faction}:${state.factions[faction].research.known.join(',')}`;
}

const ZERO: Required<TechEffects> = {
  energyWeapons: 0, missiles: 0, fighters: 0, attack: 0, shields: 0, pointDefense: 0, hull: 0, planetDefense: 0,
  starbaseHull: 0, army: 0, energy: 0, metals: 0, science: 0, exotics: 0, asteroidMetals: 0, popCap: 0, popGrowth: 0,
  production: 0, diplomacy: 0, espionage: 0, spyDefense: 0, speed: 0, smallShipSpeed: 0, sensors: 0, unrestDecay: 0,
  stealth: 0, wormholeFree: false,
};

/** Summed effects of every tech a faction knows. */
export function techEffects(state: GameState, faction: FactionId): Required<TechEffects> {
  const f = state.factions[faction];
  if (!f) return ZERO;
  const key = cacheKey(state, faction);
  const hit = effectsCache.get(key);
  if (hit) return hit;
  const out: Required<TechEffects> = { ...ZERO };
  for (const id of f.research.known) {
    const e = TECH_BY_ID[id]?.effects;
    if (!e) continue;
    for (const [k, v] of Object.entries(e)) {
      if (typeof v === 'boolean') (out as Record<string, unknown>)[k] = (out as Record<string, unknown>)[k] || v;
      else (out as unknown as Record<string, number>)[k] += v;
    }
  }
  if (effectsCache.size > 500) effectsCache.clear();
  effectsCache.set(key, out);
  return out;
}
