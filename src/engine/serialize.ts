import type { DoctrineId } from '../data/doctrines';
import { STATE_SCHEMA_VERSION, type Fleet, type GameState } from './types';

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(text: string): GameState {
  const s = JSON.parse(text) as GameState;
  if (s.schema !== STATE_SCHEMA_VERSION) {
    throw new Error(`Game saved with schema ${s.schema}; this version understands ${STATE_SCHEMA_VERSION}.`);
  }
  upgrade(s);
  return s;
}

const OLD_STANCES: Record<string, DoctrineId> = { aggressive: 'engage', defensive: 'holdLine', passive: 'retreat' };

/** Brings games saved by earlier versions up to date (fleet stances became combat doctrines). */
function upgrade(s: GameState): void {
  for (const f of Object.values(s.fleets)) {
    const old = f as Fleet & { stance?: string };
    if (!old.doctrine) old.doctrine = OLD_STANCES[old.stance ?? ''] ?? 'engage';
    delete old.stance;
  }
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

/** Short, stable fingerprint of a state, used to detect clients that are out of sync. */
export function stateHash(state: GameState): string {
  const text = serializeState(state);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
