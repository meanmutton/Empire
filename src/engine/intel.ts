/**
 * Intelligence on rivals' victory progress (§10.3). You always know your own progress. To learn a rival's,
 * station spies at its home system:
 *   net intelligence = your spies there × spy quality − its spies guarding home × their quality − its counter-intel
 *   1 → which victories it can pursue · 2 → its progress as a 20%-wide range · 3+ → its exact progress
 * Spy quality is 1, +0.5 each for State Security (Krasnyr), Infiltrators (Nhar) and Espionage Networks.
 * Guards are the rival's own spies idle at its home. Counter-Intelligence tech and Court Intrigue add 1 each.
 */
import { VICTORIES, type VictoryId } from '../data/victories';
import { hasAbility } from '../data/factions';
import { knows } from './research';
import type { FactionId, GameState } from './types';
import { availableVictories, progress } from './victory';

export function spyQuality(state: GameState, f: FactionId): number {
  let q = 1;
  if (hasAbility(f, 'stateSecurity')) q += 0.5;
  if (hasAbility(f, 'infiltrators')) q += 0.5;
  if (knows(state, f, 'espionageNet')) q += 0.5;
  return q;
}

/** Spies of `owner` physically at `hex` (not aboard ships, not prisoners). */
function spiesAt(state: GameState, owner: FactionId, hex: number, idleOnly = false): number {
  return Object.values(state.agents).filter((a) => a.owner === owner && a.kind === 'spy' && a.hex === hex && !a.ship && !a.capturedBy && (!idleOnly || !a.mission)).length;
}

export function intelScore(state: GameState, viewer: FactionId, target: FactionId): number {
  if (viewer === target) return 3;
  const t = state.factions[target];
  if (!t || hasAbility(target, 'mindShield')) return 0;
  const attack = spiesAt(state, viewer, t.home) * spyQuality(state, viewer);
  if (attack <= 0) return 0;
  let defense = spiesAt(state, target, t.home, true) * spyQuality(state, target);
  if (knows(state, target, 'counterIntel')) defense += 1;
  if (hasAbility(target, 'courtIntrigue')) defense += 1;
  return attack - defense;
}

/** 0 nothing, 1 victories, 2 progress ranges, 3 exact progress. */
export function intelLevel(state: GameState, viewer: FactionId, target: FactionId): 0 | 1 | 2 | 3 {
  return Math.max(0, Math.min(3, Math.floor(intelScore(state, viewer, target)))) as 0 | 1 | 2 | 3;
}

export interface RivalVictory {
  victory: VictoryId;
  name: string;
  /** Level 2: [low, high] progress band. */
  range?: [number, number];
  /** Level 3: exact progress. */
  fraction?: number;
  detail?: string;
}

export interface RivalReport {
  level: 0 | 1 | 2 | 3;
  victories: RivalVictory[];
}

/** What `viewer` knows about `target`'s path to victory. */
export function rivalReport(state: GameState, viewer: FactionId, target: FactionId): RivalReport {
  const level = intelLevel(state, viewer, target);
  if (level === 0) return { level, victories: [] };
  const victories = availableVictories(state, target).map((v): RivalVictory => {
    const out: RivalVictory = { victory: v, name: VICTORIES[v].name };
    if (level >= 2) {
      const p = progress(state, target, v);
      if (level >= 3) { out.fraction = p.fraction; out.detail = p.detail; }
      else {
        const lo = Math.min(0.8, Math.floor(p.fraction * 5) / 5);
        out.range = [lo, lo + 0.2];
      }
    }
    return out;
  });
  return { level, victories };
}

/** The highest progress `viewer` believes `target` has toward any victory (upper bound of a range). */
export function perceivedThreat(state: GameState, viewer: FactionId, target: FactionId): number {
  const r = rivalReport(state, viewer, target);
  return Math.max(0, ...r.victories.map((v) => v.fraction ?? v.range?.[1] ?? 0).filter((_, i) => r.victories[i].victory !== 'score'));
}
