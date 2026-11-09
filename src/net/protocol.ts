/**
 * Relay protocol shared by the browser client and the relay server. Messages are JSON text over a
 * WebSocket (AWS API Gateway in production, `relay/src/local-server.ts` in development).
 * Big game states are sent in chunks so every frame stays well under API Gateway's limits.
 */

export const PROTOCOL_VERSION = 1;
/** Characters per state chunk (API Gateway frames are 32 KB; messages 128 KB). */
export const CHUNK_SIZE = 24_000;

export interface LobbyConfig {
  seed: string;
  width: number;
  height: number;
  turnLimit: number | null;
  victory: { conquest: boolean; domination: boolean; ascendance: boolean; alliance: boolean };
  /** Hours a human may take before another player can let the computer play a caretaker turn. 0 = never. */
  timeoutHours: number;
}

export interface PublicSeat { faction: string; name: string; }

export interface Lobby {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  host: string;
  seats: PublicSeat[];
  config: LobbyConfig;
  /** State version (increments with every submitted turn). */
  version: number;
  active: string | null;
  turn: number;
  updatedAt: number;
  lastSubmitAt: number;
}

export type ClientMessage =
  | { action: 'create'; req: number; name: string; faction: string; token: string; config: LobbyConfig; protocol: number }
  | { action: 'join'; req: number; code: string; name: string; token: string; protocol: number }
  | { action: 'claim'; req: number; code: string; token: string; faction: string; name: string }
  | { action: 'leave'; req: number; code: string; token: string }
  | { action: 'hello'; req: number; code: string; token: string; protocol: number }
  | { action: 'upload'; req: number; code: string; token: string; upload: string; i: number; n: number; data: string }
  /** Host starts the game with the uploaded initial state. */
  | { action: 'start'; req: number; code: string; token: string; upload: string; n: number; active: string; turn: number }
  /** Submits the state after a turn. `forFaction` is set when playing a caretaker turn for an overdue player. */
  | { action: 'submit'; req: number; code: string; token: string; upload: string; n: number; base: number; active: string; turn: number; finished: boolean; forFaction?: string }
  | { action: 'get'; req: number; code: string; token: string }
  | { action: 'ping'; req: number };

export type ServerMessage =
  | { type: 'created'; req: number; lobby: Lobby; you: string }
  | { type: 'lobby'; req?: number; lobby: Lobby; you?: string | null }
  | { type: 'state'; req: number; version: number; i: number; n: number; data: string }
  | { type: 'turn'; lobby: Lobby }
  | { type: 'ack'; req: number; version?: number }
  | { type: 'error'; req?: number; message: string }
  | { type: 'pong'; req: number };

export function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function isGameCode(s: string): boolean {
  return /^[A-HJ-NP-Z]{6}$/.test(s);
}

export function randomCode(rand: () => number): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)];
  return s;
}
