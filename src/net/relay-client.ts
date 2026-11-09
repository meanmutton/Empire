/** Browser side of the relay: one WebSocket with request/response matching, chunked transfers and reconnects. */
import { chunkText, PROTOCOL_VERSION, type ChatMessage, type ClientMessage, type Lobby, type ServerMessage } from './protocol';

type Pending = { resolve: (m: ServerMessage[]) => void; reject: (e: Error) => void; got: ServerMessage[]; expectChunks: boolean; timer: number };

/** Relay URL from ?relay=, the build-time EMPIRE_RELAY setting, or none. */
export function relayUrl(): string | null {
  const p = new URLSearchParams(location.search).get('relay');
  if (p) return p;
  const built = (import.meta as unknown as { env?: Record<string, string> }).env?.EMPIRE_RELAY;
  return built || null;
}

// Omit that preserves union members.
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class RelayClient {
  private ws: WebSocket | null = null;
  private req = 1;
  private pending = new Map<number, Pending>();
  private queue: string[] = [];
  private closed = false;
  private retry = 0;
  /** Called for pushed lobby/turn updates. */
  onPush: (lobby: Lobby) => void = () => {};
  /** Called for chat messages pushed by the relay. */
  onMessage: (m: ChatMessage) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};
  /** Called after a reconnect so the session can re-register (hello). */
  onReconnect: () => void = () => {};

  constructor(private url: string) {
    this.open();
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      const reconnect = this.retry > 0;
      this.retry = 0;
      this.onStatus(true);
      for (const m of this.queue.splice(0)) ws.send(m);
      if (reconnect) this.onReconnect();
    };
    ws.onmessage = (e) => this.receive(JSON.parse(String(e.data)) as ServerMessage);
    ws.onclose = () => {
      this.onStatus(false);
      if (this.closed) return;
      const delay = Math.min(15000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  private receive(m: ServerMessage): void {
    if (m.type === 'turn' || (m.type === 'lobby' && m.req === undefined)) {
      this.onPush(m.lobby);
      return;
    }
    if (m.type === 'message' && m.req === undefined) {
      this.onMessage(m.message);
      return;
    }
    const id = (m as { req?: number }).req;
    if (id === undefined) return;
    const p = this.pending.get(id);
    if (!p) return;
    if (m.type === 'error') {
      this.finish(id);
      p.reject(new Error(m.message));
      return;
    }
    p.got.push(m);
    if (m.type === 'state') {
      if (p.got.filter((x) => x.type === 'state').length >= m.n) { this.finish(id); p.resolve(p.got); }
      return;
    }
    this.finish(id);
    p.resolve(p.got);
  }

  private finish(id: number): void {
    const p = this.pending.get(id);
    if (p) window.clearTimeout(p.timer);
    this.pending.delete(id);
  }

  /** Sends a request and resolves with its reply (or all state chunks for `get`). */
  request(msg: DistOmit<ClientMessage, 'req'>, timeoutMs = 30000): Promise<ServerMessage[]> {
    const id = this.req++;
    const full = { ...msg, req: id } as ClientMessage;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { this.pending.delete(id); reject(new Error('The relay did not answer. Check your connection.')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, got: [], expectChunks: msg.action === 'get', timer });
      const text = JSON.stringify(full);
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(text);
      else this.queue.push(text);
    });
  }

  async create(name: string, faction: string, token: string, config: Extract<ClientMessage, { action: 'create' }>['config']): Promise<Lobby> {
    const r = await this.request({ action: 'create', name, faction, token, config, protocol: PROTOCOL_VERSION });
    return (r[0] as Extract<ServerMessage, { type: 'created' }>).lobby;
  }

  async join(code: string, name: string, token: string): Promise<{ lobby: Lobby; you: string | null }> {
    const r = await this.request({ action: 'join', code, name, token, protocol: PROTOCOL_VERSION });
    const m = r[0] as Extract<ServerMessage, { type: 'lobby' }>;
    return { lobby: m.lobby, you: m.you ?? null };
  }

  async hello(code: string, token: string): Promise<{ lobby: Lobby; you: string | null; email: string | null }> {
    const r = await this.request({ action: 'hello', code, token, protocol: PROTOCOL_VERSION });
    const m = r[0] as Extract<ServerMessage, { type: 'lobby' }>;
    return { lobby: m.lobby, you: m.you ?? null, email: m.email ?? null };
  }

  /** Sets (or clears, with null) this player's "your turn" email. Returns it masked. */
  async setEmail(code: string, token: string, email: string | null): Promise<string | null> {
    const r = await this.request({ action: 'notify', code, token, email });
    return (r[0] as Extract<ServerMessage, { type: 'lobby' }>).email ?? null;
  }

  async claim(code: string, token: string, faction: string, name: string): Promise<Lobby> {
    const r = await this.request({ action: 'claim', code, token, faction, name });
    return (r[0] as Extract<ServerMessage, { type: 'lobby' }>).lobby;
  }

  async download(code: string, token: string): Promise<{ data: string; version: number }> {
    const r = await this.request({ action: 'get', code, token }, 60000);
    const parts = r.filter((m): m is Extract<ServerMessage, { type: 'state' }> => m.type === 'state').sort((a, b) => a.i - b.i);
    return { data: parts.map((p) => p.data).join(''), version: parts[0]?.version ?? 0 };
  }

  /** Uploads a packed state in chunks; returns the upload id and chunk count. */
  async upload(code: string, token: string, data: string): Promise<{ upload: string; n: number }> {
    const upload = Math.random().toString(36).slice(2, 10);
    const parts = chunkText(data);
    for (let i = 0; i < parts.length; i++) await this.request({ action: 'upload', code, token, upload, i, n: parts.length, data: parts[i] });
    return { upload, n: parts.length };
  }

  async start(code: string, token: string, data: string, active: string, turn: number): Promise<number> {
    const { upload, n } = await this.upload(code, token, data);
    const r = await this.request({ action: 'start', code, token, upload, n, active, turn });
    return (r[0] as { version?: number }).version ?? 1;
  }

  async sendMessage(code: string, token: string, to: string[], text: string, turn: number): Promise<ChatMessage> {
    const r = await this.request({ action: 'message', code, token, to, text, turn });
    return (r[0] as Extract<ServerMessage, { type: 'message' }>).message;
  }

  async fetchMessages(code: string, token: string, since: number): Promise<ChatMessage[]> {
    const r = await this.request({ action: 'messages', code, token, since });
    return (r[0] as Extract<ServerMessage, { type: 'messages' }>).messages;
  }

  async submit(code: string, token: string, data: string, base: number, active: string, turn: number, finished: boolean, forFaction?: string): Promise<number> {
    const { upload, n } = await this.upload(code, token, data);
    const r = await this.request({ action: 'submit', code, token, upload, n, base, active, turn, finished, ...(forFaction ? { forFaction } : {}) });
    return (r[0] as { version?: number }).version ?? base + 1;
  }
}
