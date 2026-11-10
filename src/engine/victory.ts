/**
 * Victory conditions (§10). Each great power can only win in the ways its ideology allows
 * (src/data/victories.ts), filtered by the game's preset. Progress is measured for every track so the
 * Victory tab of the briefing (and spies) can show how close each empire is.
 */
import {
  AVAILABILITY, COUNCIL_EVERY, COUNCIL_SHARE, ECONOMIC_SHARE, gloriousWinsNeeded, PRESETS, STREAK_TURNS, VICTORIES,
  type PresetId, type VictoryId,
} from '../data/victories';
import { factionDef } from '../data/factions';
import { hasEmbassy, opinionOf } from './agents';
import { militaryStrength } from './diplomacy';
import { factionIncome } from './economy';
import { log } from './events';
import { relation } from './query';
import { completedFields } from './research';
import type { FactionId, GameState } from './types';

export function score(state: GameState, faction: FactionId): number {
  const f = state.factions[faction];
  if (!f.alive) return 0;
  let systems = 0, pop = 0;
  for (const h of state.map.hexes) {
    if (h.owner !== faction || !h.system) continue;
    systems++;
    pop += h.system.population;
  }
  const vassals = Object.values(state.factions).filter((x) => x.overlord === faction).length;
  return Math.round(systems * 10 + pop + f.research.known.length * 5 + militaryStrength(state, faction) / 50 + vassals * 20);
}

export function presetOf(state: GameState): PresetId {
  return state.config.preset ?? 'classic';
}

/** The victories `faction` may win in this game. Minor factions never win. */
export function availableVictories(state: GameState, faction: FactionId): VictoryId[] {
  if (state.factions[faction]?.kind !== 'major') return [];
  const p = PRESETS[presetOf(state)];
  const base = [...(AVAILABILITY[faction] ?? []), ...(p.extra?.[faction] ?? [])];
  return [...new Set(base)].filter((v) => p.victories.includes(v));
}

export interface Progress {
  victory: VictoryId;
  /** 0..1 */
  fraction: number;
  detail: string;
  met: boolean;
}

const majorsIn = (state: GameState) => Object.values(state.factions).filter((f) => f.kind === 'major');
const homeOf = (state: GameState, f: FactionId) => state.map.hexes.findIndex((h) => h.system?.homeOf === f);
const vassalsOf = (state: GameState, f: FactionId) => Object.values(state.factions).filter((x) => x.alive && x.overlord === f && x.kind === 'minor').length;
const streak = (state: GameState, f: FactionId, v: VictoryId) => state.factions[f].flags[`vs:${v}`] ?? 0;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Galaxy-wide income share of a faction (energy + metals + exotics). */
export function incomeShare(state: GameState, faction: FactionId): number {
  let mine = 0, total = 0;
  for (const f of Object.values(state.factions)) {
    if (!f.alive) continue;
    const g = factionIncome(state, f.id).gross;
    const v = g.energy + g.metals + g.exotics;
    total += v;
    if (f.id === faction) mine = v;
  }
  return total > 0 ? mine / total : 0;
}

/** Instant condition for streak victories (checked each round). */
function conditionNow(state: GameState, f: FactionId, v: VictoryId): boolean {
  switch (v) {
    case 'economicSupremacy':
      return incomeShare(state, f) >= ECONOMIC_SHARE;
    case 'singularity':
      return completedFields(state, f).length >= 5 && coreLabs(state, f) >= 3;
    case 'grandAlliance': {
      const alive = majorsIn(state).filter((m) => m.alive && m.id !== f);
      if (alive.length === 0 || !alive.every((o) => relation(state, f, o.id).status === 'alliance')) return false;
      const mine = systemsOf(state, f);
      return alive.every((o) => systemsOf(state, o.id) <= mine);
    }
    default:
      return false;
  }
}

function coreLabs(state: GameState, f: FactionId): number {
  return state.map.hexes.filter((h) => h.owner === f && h.system?.development === 5 && h.system.improvements.includes('lab')).length;
}

function systemsOf(state: GameState, f: FactionId): number {
  return state.map.hexes.filter((h) => h.system && h.owner === f).length;
}

export function progress(state: GameState, f: FactionId, v: VictoryId): Progress {
  const fs = state.factions[f];
  const others = majorsIn(state).filter((m) => m.id !== f);
  const out = (fraction: number, detail: string, met = false): Progress => ({ victory: v, fraction: clamp01(met ? 1 : fraction), detail, met });
  const streakText = (s: number) => `${s}/${STREAK_TURNS} turns in a row`;
  switch (v) {
    case 'conquest': {
      const needed = others.filter((o) => o.alive);
      const held = needed.filter((o) => state.map.hexes[homeOf(state, o.id)]?.owner === f).length;
      return out(needed.length ? held / needed.length : 1, `${held}/${needed.length} rival home systems held`, held === needed.length);
    }
    case 'hegemony': {
      const homes = others.filter((o) => state.map.hexes[homeOf(state, o.id)]?.owner === f).length;
      const vassals = vassalsOf(state, f);
      return out((Math.min(homes, 2) / 2 + Math.min(vassals, 4) / 4) / 2, `${homes}/2 rival homes, ${vassals}/4 vassals`, homes >= 2 && vassals >= 4);
    }
    case 'gloriousCampaign': {
      const need = gloriousWinsNeeded(state.config.width, state.config.height);
      const wins = fs.flags.battleWins ?? 0;
      const beaten = others.filter((o) => fs.flags[`beat:${o.id}`]).length;
      return out((Math.min(wins, need) / need + (others.length ? beaten / others.length : 1)) / 2,
        `${wins}/${need} battles won, ${beaten}/${others.length} great powers beaten`, wins >= need && beaten >= others.length);
    }
    case 'economicSupremacy': {
      const share = incomeShare(state, f), s = streak(state, f, v);
      return out(share < ECONOMIC_SHARE ? 0.9 * share / ECONOMIC_SHARE : 0.9 + 0.1 * s / STREAK_TURNS,
        `${Math.round(share * 100)}% of galactic income (need ${ECONOMIC_SHARE * 100}%), ${streakText(s)}`, s >= STREAK_TURNS);
    }
    case 'ascendance': {
      const fields = completedFields(state, f).length;
      const gate = !!fs.flags.ascensionGate;
      return out(Math.min(fields, 4) / 4 * 0.8 + (gate ? 0.2 : 0), `${fields}/4 research fields complete${gate ? ', Ascension Gate built' : ', Ascension Gate not built'}`, fields >= 4 && gate);
    }
    case 'singularity': {
      const fields = completedFields(state, f).length, labs = coreLabs(state, f), s = streak(state, f, v);
      return out(Math.min(fields, 5) / 5 * 0.6 + Math.min(labs, 3) / 3 * 0.3 + 0.1 * s / STREAK_TURNS,
        `${fields}/5 research fields, ${labs}/3 Core Worlds with Research Labs, ${streakText(s)}`, s >= STREAK_TURNS);
    }
    case 'worldRevolution': {
      const def = fs.flags.defections ?? 0, vassals = vassalsOf(state, f);
      return out((Math.min(def, 6) / 6 + Math.min(vassals, 3) / 3) / 2, `${def}/6 systems defected, ${vassals}/3 vassals`, def >= 6 && vassals >= 3);
    }
    case 'grandAlliance': {
      const alive = others.filter((m) => m.alive);
      const allied = alive.filter((o) => relation(state, f, o.id).status === 'alliance').length;
      const s = streak(state, f, v);
      return out((alive.length ? allied / alive.length : 1) * 0.8 + 0.2 * s / STREAK_TURNS, `allied with ${allied}/${alive.length} great powers, ${streakText(s)}`, s >= STREAK_TURNS);
    }
    case 'galacticCouncil': {
      const c = state.council;
      const share = c?.shares[f] ?? 0, wins = c?.streak[f] ?? 0;
      const next = COUNCIL_EVERY * (Math.floor(state.turn / COUNCIL_EVERY) + 1);
      return out(Math.min(1, share / COUNCIL_SHARE) * 0.5 + Math.min(wins, 2) / 2 * 0.5,
        `${c ? `last vote ${Math.round(share * 100)}%` : 'no council yet'}, ${wins}/2 wins in a row; next council on turn ${next}`, wins >= 2);
    }
    case 'score': {
      const limit = state.config.turnLimit;
      const s = score(state, f);
      const best = Math.max(...majorsIn(state).filter((m) => m.alive).map((m) => score(state, m.id)));
      return out(limit ? Math.min(1, state.turn / limit) * (s >= best ? 1 : s / Math.max(1, best)) : 0,
        limit ? `score ${s} (leader ${best}); turn ${state.turn}/${limit}` : `score ${s}; this game has no turn limit`);
    }
  }
}

const STREAKED: VictoryId[] = ['economicSupremacy', 'singularity', 'grandAlliance'];

/** Cheap win check: streak victories read their stored streak (updated once per round). */
function isMet(state: GameState, f: FactionId, v: VictoryId): boolean {
  if (STREAKED.includes(v)) return streak(state, f, v) >= STREAK_TURNS;
  if (v === 'galacticCouncil') return (state.council?.streak[f] ?? 0) >= 2;
  return progress(state, f, v).met;
}

/** Updates round-based streaks and runs the Galactic Council (end of each round). */
function endOfRoundUpdates(state: GameState): void {
  for (const f of majorsIn(state).filter((m) => m.alive)) {
    for (const v of availableVictories(state, f.id)) {
      if (STREAKED.includes(v)) {
        f.flags[`vs:${v}`] = conditionNow(state, f.id, v) ? (f.flags[`vs:${v}`] ?? 0) + 1 : 0;
      }
    }
  }
  if (state.turn > 0 && state.turn % COUNCIL_EVERY === 0 && PRESETS[presetOf(state)].victories.includes('galacticCouncil')) runCouncil(state);
}

/**
 * The Galactic Council: every living faction casts its population as votes for the eligible great power it
 * likes most (it counts itself at +50 if eligible). Vassals vote with their overlord. Candidates can only
 * receive votes from factions they have an embassy with (or themselves and their vassals).
 */
export function runCouncil(state: GameState): void {
  const candidates = majorsIn(state).filter((m) => m.alive && availableVictories(state, m.id).includes('galacticCouncil')).map((m) => m.id);
  if (candidates.length === 0) return;
  const votes: Record<FactionId, number> = {};
  let total = 0;
  for (const voter of Object.values(state.factions)) {
    if (!voter.alive) continue;
    const weight = state.map.hexes.reduce((a, h) => a + (h.owner === voter.id && h.system ? h.system.population : 0), 0);
    if (weight <= 0) continue;
    let choice: FactionId | null = null, best = -Infinity;
    if (voter.overlord && candidates.includes(voter.overlord)) choice = voter.overlord;
    else {
      for (const c of candidates) {
        const reachable = c === voter.id || hasEmbassy(state, c, voter.id);
        if (!reachable) continue;
        const o = c === voter.id ? 50 : opinionOf(state, voter.id, c);
        if (o > best) { best = o; choice = c; }
      }
    }
    total += weight;
    if (choice) votes[choice] = (votes[choice] ?? 0) + weight;
  }
  const shares: Record<FactionId, number> = {};
  const prev = state.council?.streak ?? {};
  const streakOut: Record<FactionId, number> = {};
  for (const c of candidates) {
    shares[c] = total > 0 ? (votes[c] ?? 0) / total : 0;
    streakOut[c] = shares[c] >= COUNCIL_SHARE ? (prev[c] ?? 0) + 1 : 0;
  }
  state.council = { turn: state.turn, shares, streak: streakOut };
  const leader = candidates.sort((a, b) => shares[b] - shares[a])[0];
  log(state, [], 'council', `The Galactic Council met: ${factionDef(leader).name} led with ${Math.round(shares[leader] * 100)}% of the vote.`);
}

/** Whether the game has ended (a winner, or an ending without one). */
export function isGameOver(state: GameState): boolean {
  return state.winner !== null || !!state.over;
}

/** The surviving great power with the highest score (ties broken by id), or null if none survive. */
export function leader(state: GameState): FactionId | null {
  const alive = majorsIn(state).filter((f) => f.alive);
  if (alive.length === 0) return null;
  return alive.map((f) => ({ id: f.id, s: score(state, f.id) })).sort((a, b) => b.s - a.s || a.id.localeCompare(b.id))[0].id;
}

/**
 * Checks every available victory and ends the game when one is met. Returns the winner, or null (the game
 * may still have ended without one: see isGameOver). `endOfRound` updates streaks, runs the council and
 * applies the turn limit.
 *
 * Endings without the usual victories:
 * - No great power survives: the game ends with no winner.
 * - Every human player has been eliminated: the game ends, won by the leading computer power.
 * - Only one great power is left: it wins.
 */
export function checkVictory(state: GameState, endOfRound: boolean): FactionId | null {
  if (isGameOver(state)) return state.winner;
  const alive = majorsIn(state).filter((f) => f.alive);
  const win = (id: FactionId, how: string): FactionId => {
    state.winner = id;
    state.over = { reason: how, turn: state.turn };
    log(state, [], 'victory', `${factionDef(id).name} wins: ${how}!`);
    return id;
  };
  const endWithoutWinner = (reason: string): null => {
    state.over = { reason, turn: state.turn };
    log(state, [], 'victory', `The game is over: ${reason}.`);
    return null;
  };
  if (alive.length === 0) return endWithoutWinner('no great power survived, and no empire rules the galaxy');
  if (alive.length === 1) return win(alive[0].id, 'last empire standing');
  const humans = Object.values(state.factions).filter((f) => f.controller === 'human');
  if (humans.length > 0 && humans.every((f) => !f.alive)) return win(leader(state)!, 'every human player has been eliminated');

  if (endOfRound) endOfRoundUpdates(state);
  for (const f of alive) {
    for (const v of availableVictories(state, f.id)) {
      if (v === 'score') continue;
      if (isMet(state, f.id, v)) return win(f.id, VICTORIES[v].name);
    }
  }
  if (endOfRound && state.config.turnLimit && state.turn >= state.config.turnLimit) {
    const best = leader(state);
    return best ? win(best, `highest score after ${state.config.turnLimit} turns`) : endWithoutWinner(`turn ${state.config.turnLimit} reached with no great power left`);
  }
  return null;
}
