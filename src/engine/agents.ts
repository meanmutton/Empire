/** Diplomats and spies: travel, boarding ships, embassies and capture (§6.5, §9.1). */
import { BALANCE } from '../data/balance';
import { design } from '../data/designs';
import { hasAbility } from '../data/factions';
import { log } from './events';
import { cargoFree } from './ground';
import { findPath } from './path';
import { relation } from './query';
import { Rng } from './rng';
import type { Agent, FactionId, GameState } from './types';
import { wormholeLinks } from './movement';

export type Result = { ok: true; text?: string } | { ok: false; reason: string };

export function agentSpeed(state: GameState, a: Agent): number {
  const base = a.kind === 'spy' ? BALANCE.spy.speed : BALANCE.diplomat.speed;
  return base + (a.kind === 'diplomat' && hasAbility(a.owner, 'openSociety') ? 1 : 0);
}

function agentCost(state: GameState) {
  return (_f: number, t: number) => (state.map.hexes[t].terrain === 'blackHole' ? Infinity : 1);
}

/** Sends an agent toward a hex. It travels on its own (unless aboard a ship) at its own speed. */
export function moveAgent(state: GameState, agentId: string, dest: number): Result {
  const a = state.agents[agentId];
  if (!a || a.capturedBy) return { ok: false, reason: 'That agent cannot move.' };
  if (a.ship) return { ok: false, reason: 'The agent is aboard a ship; disembark first.' };
  if (a.resident) return { ok: false, reason: 'Recall the diplomat from the embassy first.' };
  const r = findPath(state.map, a.hex, dest, agentCost(state), wormholeLinks(state));
  if (!r) return { ok: false, reason: 'No route.' };
  a.path = r.path.slice(1);
  a.progress = Math.max(a.progress, 0);
  stepAgent(state, a, agentSpeed(state, a) - (a.moved ?? 0));
  return { ok: true };
}

function stepAgent(state: GameState, a: Agent, budget: number): void {
  let used = 0;
  while (a.path.length > 0 && used < budget) {
    a.hex = a.path.shift()!;
    used++;
  }
  a.moved = (a.moved ?? 0) + used;
  arrive(state, a);
}

/** Sends a diplomat to found an embassy at a faction's home system. */
export function sendDiplomat(state: GameState, agentId: string, target: FactionId): Result {
  const a = state.agents[agentId];
  if (!a || a.kind !== 'diplomat') return { ok: false, reason: 'Pick a diplomat.' };
  if (target === a.owner || !state.factions[target]?.alive) return { ok: false, reason: 'Pick another living faction.' };
  const rel = relation(state, a.owner, target);
  if (!rel.contact) return { ok: false, reason: 'You have not met them yet.' };
  if (hasEmbassy(state, a.owner, target)) return { ok: false, reason: 'You already have an embassy there.' };
  a.target = target;
  return moveAgent(state, agentId, state.factions[target].home);
}

export function hasEmbassy(state: GameState, from: FactionId, at: FactionId): boolean {
  const r = relation(state, from, at);
  return r.a === from ? r.embassyA : r.embassyB;
}

function setEmbassy(state: GameState, from: FactionId, at: FactionId, value: boolean): void {
  const r = relation(state, from, at);
  if (r.a === from) r.embassyA = value;
  else r.embassyB = value;
  if (value && (r.status === 'neutral' || r.status === 'hostile')) {
    r.status = 'relations';
    r.since = state.turn;
  }
  if (!value && !r.embassyA && !r.embassyB && r.status === 'relations') {
    r.status = 'neutral';
    r.since = state.turn;
  }
}

function arrive(state: GameState, a: Agent): void {
  if (a.kind !== 'diplomat' || !a.target || a.path.length > 0) return;
  const target = state.factions[a.target];
  if (!target || a.hex !== target.home) return;
  if (relation(state, a.owner, a.target).status === 'war') return;
  a.resident = true;
  setEmbassy(state, a.owner, a.target, true);
  log(state, [a.owner, a.target], 'embassy', `${a.owner} opened an embassy with ${a.target}.`, a.hex);
}

/** Continues agent travel at the start of the owner's turn. */
export function advanceAgents(state: GameState, faction: FactionId): void {
  for (const a of Object.values(state.agents)) {
    if (a.owner !== faction) continue;
    a.moved = 0;
    if (a.capturedBy || a.ship || a.resident) continue;
    if (a.path.length) stepAgent(state, a, agentSpeed(state, a));
    else arrive(state, a);
  }
}

/** Puts an agent aboard a ship in the same hex. */
export function boardShip(state: GameState, agentId: string, shipId: string): Result {
  const a = state.agents[agentId], s = state.ships[shipId];
  if (!a || !s || a.owner !== s.owner || a.capturedBy || a.resident) return { ok: false, reason: 'Cannot board.' };
  if (state.fleets[s.fleet].hex !== a.hex) return { ok: false, reason: 'The ship must be in the same hex.' };
  if (cargoFree(state, shipId) <= 0) return { ok: false, reason: 'No space aboard.' };
  a.ship = shipId;
  a.path = [];
  s.cargo.push(agentId);
  return { ok: true };
}

export function disembark(state: GameState, agentId: string): Result {
  const a = state.agents[agentId];
  if (!a?.ship) return { ok: false, reason: 'Not aboard a ship.' };
  const s = state.ships[a.ship];
  s.cargo = s.cargo.filter((c) => c !== agentId);
  a.hex = state.fleets[s.fleet].hex;
  a.ship = null;
  arrive(state, a);
  return { ok: true };
}

/** Recalls a resident diplomat, closing the embassy. */
export function recallDiplomat(state: GameState, agentId: string): Result {
  const a = state.agents[agentId];
  if (!a?.resident || !a.target) return { ok: false, reason: 'Not at an embassy.' };
  a.resident = false;
  setEmbassy(state, a.owner, a.target, false);
  a.target = null;
  return { ok: true };
}

/** The host expels another faction's diplomat. */
export function expelDiplomat(state: GameState, host: FactionId, agentId: string): Result {
  const a = state.agents[agentId];
  if (!a?.resident || a.target !== host) return { ok: false, reason: 'No such diplomat here.' };
  a.resident = false;
  setEmbassy(state, a.owner, host, false);
  a.target = null;
  adjustOpinion(state, a.owner, host, -20);
  log(state, [a.owner, host], 'expelled', `${host} expelled the ${a.owner} diplomat.`);
  return { ok: true };
}

/**
 * End of turn: this faction's ships capture traveling diplomats and detected spies of factions it is at war
 * with or hostile to, when they share a hex.
 */
export function captureAgents(state: GameState, faction: FactionId): void {
  const rng = new Rng(state.rng);
  const myHexes = new Set(Object.values(state.fleets).filter((f) => f.owner === faction).map((f) => f.hex));
  const detectors = new Set<number>();
  for (const f of Object.values(state.fleets)) {
    if (f.owner === faction && f.ships.some((s) => design(state.ships[s].design).role === 'science')) detectors.add(f.hex);
  }
  for (const b of Object.values(state.starbases)) if (b.owner === faction) detectors.add(b.hex);
  for (const a of Object.values(state.agents)) {
    if (a.owner === faction || a.capturedBy || a.ship || a.resident) continue;
    if (!myHexes.has(a.hex)) continue;
    const status = relation(state, faction, a.owner).status;
    if (status !== 'war' && status !== 'hostile') continue;
    if (a.kind === 'spy' && !detectors.has(a.hex)) continue;
    if (!rng.chance(BALANCE.diplomatCaptureChance)) continue;
    a.capturedBy = faction;
    a.path = [];
    a.mission = null;
    log(state, [faction, a.owner], 'captured', `${faction} captured a ${a.owner} ${a.kind}.`, a.hex);
  }
}

/** Executes a captured agent: large opinion penalty with its owner and a small one with everyone. */
export function executeAgent(state: GameState, captor: FactionId, agentId: string): Result {
  const a = state.agents[agentId];
  if (!a || a.capturedBy !== captor) return { ok: false, reason: 'You are not holding that agent.' };
  delete state.agents[agentId];
  adjustOpinion(state, a.owner, captor, -40);
  for (const id of Object.keys(state.factions)) if (id !== captor && id !== a.owner) adjustOpinion(state, id, captor, -5);
  log(state, [], 'executed', `${captor} executed a captured ${a.owner} ${a.kind}.`);
  return { ok: true };
}

/** Releases a captured agent, who returns home. */
export function releaseAgent(state: GameState, agentId: string): void {
  const a = state.agents[agentId];
  if (!a) return;
  a.capturedBy = null;
  a.hex = state.factions[a.owner].home;
  a.path = [];
  a.target = null;
  a.resident = false;
}

/** Changes `who`'s opinion of `of`. */
export function adjustOpinion(state: GameState, who: FactionId, of: FactionId, delta: number): void {
  if (who === of) return;
  const r = relation(state, who, of);
  if (r.a === who) r.opinionAB = clamp(r.opinionAB + delta);
  else r.opinionBA = clamp(r.opinionBA + delta);
}

export function opinionOf(state: GameState, who: FactionId, of: FactionId): number {
  if (who === of) return 100;
  const r = relation(state, who, of);
  return r.a === who ? r.opinionAB : r.opinionBA;
}

function clamp(x: number): number {
  return Math.max(-100, Math.min(100, Math.round(x * 10) / 10));
}
