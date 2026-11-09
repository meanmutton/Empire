/** Storage used by the relay: DynamoDB in AWS, memory for tests and the local dev server. */
import type { Lobby } from '../../src/net/protocol';

/** Lobby plus private fields never sent to clients. */
export interface GameRecord extends Lobby {
  /** sha256(token) per seat faction. */
  tokens: Record<string, string>;
  /** sha256(token) of the host. */
  hostToken: string;
  /** Pending lobby members who joined but have not claimed a faction: tokenHash → name. */
  pending: Record<string, string>;
}

export interface Store {
  getGame(code: string): Promise<GameRecord | null>;
  /** Writes the game; when `expectVersion` is given the write only succeeds if the stored version matches. */
  putGame(game: GameRecord, expectVersion?: number): Promise<boolean>;
  /** Packed state for a version. States are written before the game record points at them. */
  getState(code: string, version: number): Promise<string | null>;
  putState(code: string, version: number, data: string): Promise<void>;
  deleteState(code: string, version: number): Promise<void>;
  putChunk(code: string, upload: string, i: number, data: string): Promise<void>;
  /** All chunks 0..n-1 of an upload, or null if any are missing. */
  getChunks(code: string, upload: string, n: number): Promise<string[] | null>;
  deleteChunks(code: string, upload: string, n: number): Promise<void>;
  addConnection(conn: string, code: string, faction: string | null): Promise<void>;
  removeConnection(conn: string): Promise<void>;
  connections(code: string): Promise<{ conn: string; faction: string | null }[]>;
}

export class MemoryStore implements Store {
  games = new Map<string, GameRecord>();
  states = new Map<string, string>();
  chunks = new Map<string, string>();
  conns = new Map<string, { code: string; faction: string | null }>();

  async getGame(code: string) {
    const g = this.games.get(code);
    return g ? structuredClone(g) : null;
  }
  async putGame(game: GameRecord, expectVersion?: number) {
    const cur = this.games.get(game.code);
    if (expectVersion !== undefined && (cur?.version ?? -1) !== expectVersion) return false;
    this.games.set(game.code, structuredClone(game));
    return true;
  }
  async getState(code: string, version: number) { return this.states.get(`${code}@${version}`) ?? null; }
  async putState(code: string, version: number, data: string) { this.states.set(`${code}@${version}`, data); }
  async deleteState(code: string, version: number) { this.states.delete(`${code}@${version}`); }
  async putChunk(code: string, upload: string, i: number, data: string) { this.chunks.set(`${code}/${upload}/${i}`, data); }
  async getChunks(code: string, upload: string, n: number) {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const c = this.chunks.get(`${code}/${upload}/${i}`);
      if (c === undefined) return null;
      out.push(c);
    }
    return out;
  }
  async deleteChunks(code: string, upload: string, n: number) { for (let i = 0; i < n; i++) this.chunks.delete(`${code}/${upload}/${i}`); }
  async addConnection(conn: string, code: string, faction: string | null) { this.conns.set(conn, { code, faction }); }
  async removeConnection(conn: string) { this.conns.delete(conn); }
  async connections(code: string) {
    return [...this.conns.entries()].filter(([, v]) => v.code === code).map(([conn, v]) => ({ conn, faction: v.faction }));
  }
}
