/** Chat between human players: one interface, backed by the relay online or by the saved game in hot seat. */
import { canRead, MAX_MESSAGE_LENGTH, type ChatMessage } from '../net/protocol';
import type { GameState } from '../engine/types';

export interface Messaging {
  /** Messages the viewer may read, oldest first. */
  list(viewer: string): ChatMessage[];
  send(from: string, to: string[], text: string, turn: number): Promise<boolean>;
  /** Called whenever messages change; returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
}

/** Messages kept in the game state (hot seat): saved with the game, shown only to their participants. */
export class LocalMessaging implements Messaging {
  private subs = new Set<() => void>();
  constructor(private game: () => GameState) {}

  list(viewer: string): ChatMessage[] {
    return (this.game().messages ?? []).filter((m) => canRead(m, viewer));
  }

  async send(from: string, to: string[], text: string, turn: number): Promise<boolean> {
    const clean = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!clean || to.length === 0) return false;
    const g = this.game();
    g.messages ??= [];
    g.messages.push({ id: `m${Date.now().toString(36)}${g.messages.length}`, from, to, text: clean, at: Date.now(), turn });
    this.emit();
    return true;
  }

  subscribe(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  emit(): void {
    for (const s of this.subs) s();
  }
}

/** Key for a conversation: 'all', or the other participants (excluding the viewer), sorted. */
export function threadKey(m: ChatMessage, viewer: string): string {
  if (m.to.includes('all')) return 'all';
  return [...new Set([m.from, ...m.to])].filter((f) => f !== viewer).sort().join(',');
}

function readKey(gameId: string, viewer: string, thread: string): string {
  return `empire.read.${gameId}.${viewer}.${thread}`;
}

export function lastRead(gameId: string, viewer: string, thread: string): number {
  try { return Number(localStorage.getItem(readKey(gameId, viewer, thread)) ?? 0); } catch { return 0; }
}

export function markRead(gameId: string, viewer: string, thread: string, at: number): void {
  try { localStorage.setItem(readKey(gameId, viewer, thread), String(at)); } catch { /* storage unavailable */ }
}

/** Computer-run great powers the viewer has met (they can be addressed with statements). */
export function aiContacts(game: GameState, viewer: string): string[] {
  return Object.values(game.factions)
    .filter((f) => f.id !== viewer && f.alive && f.kind === 'major' && f.controller === 'ai')
    .filter((f) => game.relations[[viewer, f.id].sort().join('|')]?.contact)
    .map((f) => f.id);
}

/** Dispatches between the viewer and one computer power, oldest first. */
export function dispatchesWith(game: GameState, viewer: string, power: string): NonNullable<GameState['dispatches']> {
  return (game.dispatches ?? []).filter((d) => (d.from === viewer && d.to === power) || (d.from === power && d.to === viewer));
}

export function unreadCount(messaging: Messaging | undefined, game: GameState, viewer: string): number {
  const chat = messaging ? messaging.list(viewer).filter((m) => m.from !== viewer && m.at > lastRead(game.id, viewer, threadKey(m, viewer))).length : 0;
  const ai = (game.dispatches ?? []).filter((d) => d.to === viewer && d.n > lastRead(game.id, viewer, `ai:${d.from}`)).length;
  return chat + ai;
}
