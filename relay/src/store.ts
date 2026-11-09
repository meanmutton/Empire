/** Storage used by the relay: DynamoDB in AWS, memory for tests and the local dev server. */
import type { ChatMessage, Lobby } from '../../src/net/protocol';

/** Lobby plus private fields never sent to clients. */
export interface GameRecord extends Lobby {
  /** sha256(token) per seat faction. */
  tokens: Record<string, string>;
  /** sha256(token) of the host. */
  hostToken: string;
  /** Pending lobby members who joined but have not claimed a faction: tokenHash → name. */
  pending: Record<string, string>;
  /**
   * Key of the stored state the game currently points at, and the one before it (kept so a player who is
   * mid-download still gets a complete state). Older games without it use String(version).
   */
  stateKey?: string;
  prevStateKey?: string;
  /** Notification emails by seat faction. Private: never sent to clients except masked to their owner. */
  emails?: Record<string, string>;
}

export interface Store {
  getGame(code: string): Promise<GameRecord | null>;
  /** Writes the game; when `expectVersion` is given the write only succeeds if the stored version matches. */
  putGame(game: GameRecord, expectVersion?: number): Promise<boolean>;
  /**
   * Packed states by key. Every upload gets its own key; the game record's `stateKey` says which one is
   * current, so a losing concurrent submission can never overwrite the winner's state.
   */
  getState(code: string, key: string): Promise<string | null>;
  putState(code: string, key: string, data: string): Promise<void>;
  deleteState(code: string, key: string): Promise<void>;
  putChunk(code: string, upload: string, i: number, data: string): Promise<void>;
  /** All chunks 0..n-1 of an upload, or null if any are missing. */
  getChunks(code: string, upload: string, n: number): Promise<string[] | null>;
  deleteChunks(code: string, upload: string, n: number): Promise<void>;
  addConnection(conn: string, code: string, faction: string | null): Promise<void>;
  removeConnection(conn: string): Promise<void>;
  connections(code: string): Promise<{ conn: string; faction: string | null }[]>;
  putMessage(code: string, m: ChatMessage): Promise<void>;
  /** Messages newer than `since`, oldest first, at most `limit` (the newest ones). */
  listMessages(code: string, since: number, limit: number): Promise<ChatMessage[]>;
}

export class MemoryStore implements Store {
  games = new Map<string, GameRecord>();
  states = new Map<string, string>();
  chunks = new Map<string, string>();
  conns = new Map<string, { code: string; faction: string | null }>();
  messages = new Map<string, ChatMessage[]>();

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
  async getState(code: string, key: string) { return this.states.get(`${code}@${key}`) ?? null; }
  async putState(code: string, key: string, data: string) { this.states.set(`${code}@${key}`, data); }
  async deleteState(code: string, key: string) { this.states.delete(`${code}@${key}`); }
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
  async putMessage(code: string, m: ChatMessage) {
    this.messages.set(code, [...(this.messages.get(code) ?? []), m]);
  }
  async listMessages(code: string, since: number, limit: number) {
    return (this.messages.get(code) ?? []).filter((m) => m.at > since).slice(-limit);
  }
  async connections(code: string) {
    return [...this.conns.entries()].filter(([, v]) => v.code === code).map(([conn, v]) => ({ conn, faction: v.faction }));
  }
}
