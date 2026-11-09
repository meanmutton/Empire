/**
 * Relay logic, independent of AWS. The Lambda handler and the local dev server both call `handleMessage`.
 *
 * The relay stores each game's lobby, seats and latest packed state, checks that only the player whose turn
 * it is submits the next state (optimistic versioning prevents double submits), and pushes "turn" updates
 * to everyone connected. It does not run game rules: the game is deterministic and played by friends.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  chunkText, isGameCode, PROTOCOL_VERSION, randomCode, type ClientMessage, type Lobby, type ServerMessage,
} from '../../src/net/protocol';
import type { GameRecord, Store } from './store';

const MAJORS = ['concord', 'rynkai', 'varrhen', 'krasnyr', 'lattice'];
const MAX_UPLOAD_CHUNKS = 64;

export type Send = (conn: string, msg: ServerMessage) => Promise<boolean>;

export interface Ctx {
  store: Store;
  send: Send;
  now: () => number;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(`empire:${token}`).digest('hex');
}

function publicLobby(g: GameRecord): Lobby {
  const { tokens: _t, hostToken: _h, pending: _p, ...lobby } = g;
  void _t; void _h; void _p;
  return lobby;
}

function seatOf(g: GameRecord, tokenHash: string): string | null {
  for (const [faction, h] of Object.entries(g.tokens)) if (h === tokenHash) return faction;
  return null;
}

async function broadcast(ctx: Ctx, code: string, msg: ServerMessage, except?: string): Promise<void> {
  const conns = await ctx.store.connections(code);
  await Promise.all(conns.filter((c) => c.conn !== except).map(async (c) => {
    if (!(await ctx.send(c.conn, msg))) await ctx.store.removeConnection(c.conn);
  }));
}

export async function handleDisconnect(ctx: Ctx, conn: string): Promise<void> {
  await ctx.store.removeConnection(conn);
}

export async function handleMessage(ctx: Ctx, conn: string, raw: string): Promise<void> {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    await ctx.send(conn, { type: 'error', message: 'Bad message.' });
    return;
  }
  const req = (msg as { req?: number }).req ?? 0;
  const fail = (message: string) => ctx.send(conn, { type: 'error', req, message });
  try {
    await dispatch(ctx, conn, msg, fail);
  } catch (e) {
    await fail(`Server error: ${(e as Error).message}`);
  }
}

async function dispatch(ctx: Ctx, conn: string, msg: ClientMessage, fail: (m: string) => Promise<boolean>): Promise<void> {
  const { store } = ctx;
  if (msg.action === 'ping') {
    await ctx.send(conn, { type: 'pong', req: msg.req });
    return;
  }
  if ('protocol' in msg && msg.protocol !== PROTOCOL_VERSION) {
    await fail('Your copy of Empire is a different version from the relay. Reload the page to update.');
    return;
  }
  if (msg.action === 'create') {
    if (!MAJORS.includes(msg.faction)) { await fail('Pick a major faction.'); return; }
    let code = '';
    for (let tries = 0; tries < 20; tries++) {
      const c = randomCode(() => randomBytes(1)[0] / 256);
      if (!(await store.getGame(c))) { code = c; break; }
    }
    if (!code) { await fail('Could not allocate a game code.'); return; }
    const th = hashToken(msg.token);
    const g: GameRecord = {
      code, status: 'lobby', host: msg.faction, seats: [{ faction: msg.faction, name: clean(msg.name) }],
      config: msg.config, version: 0, active: null, turn: 0, updatedAt: ctx.now(), lastSubmitAt: ctx.now(),
      tokens: { [msg.faction]: th }, hostToken: th, pending: {},
    };
    await store.putGame(g);
    await store.addConnection(conn, code, msg.faction);
    await ctx.send(conn, { type: 'created', req: msg.req, lobby: publicLobby(g), you: msg.faction });
    return;
  }

  const code = (msg as { code?: string }).code ?? '';
  if (!isGameCode(code)) { await fail('A game code is six letters.'); return; }
  const g = await store.getGame(code);
  if (!g) { await fail(`There is no game with the code ${code}.`); return; }
  const th = hashToken((msg as { token: string }).token ?? '');
  const me = seatOf(g, th);

  switch (msg.action) {
    case 'join': {
      await store.addConnection(conn, code, me);
      if (!me && g.status === 'lobby') {
        g.pending[th] = clean(msg.name);
        await store.putGame(g);
      }
      if (!me && g.status !== 'lobby') { await fail('That game has already started.'); return; }
      await ctx.send(conn, { type: 'lobby', req: msg.req, lobby: publicLobby(g), you: me });
      return;
    }
    case 'claim': {
      if (g.status !== 'lobby') { await fail('The game has already started.'); return; }
      if (!MAJORS.includes(msg.faction)) { await fail('Pick a major faction.'); return; }
      const taken = g.seats.find((s) => s.faction === msg.faction);
      if (taken && g.tokens[msg.faction] !== th) { await fail(`${taken.name} already took that empire.`); return; }
      if (me === g.host && msg.faction !== me) { await fail('The host keeps their empire.'); return; }
      if (me && me !== msg.faction) {
        g.seats = g.seats.filter((s) => s.faction !== me);
        delete g.tokens[me];
      }
      if (!me && g.seats.length >= 5) { await fail('This game already has five players.'); return; }
      g.seats = g.seats.filter((s) => s.faction !== msg.faction);
      g.seats.push({ faction: msg.faction, name: clean(msg.name) });
      g.tokens[msg.faction] = th;
      delete g.pending[th];
      g.updatedAt = ctx.now();
      await store.putGame(g);
      await store.addConnection(conn, code, msg.faction);
      await ctx.send(conn, { type: 'lobby', req: msg.req, lobby: publicLobby(g), you: msg.faction });
      await broadcast(ctx, code, { type: 'lobby', lobby: publicLobby(g) }, conn);
      return;
    }
    case 'leave': {
      if (g.status !== 'lobby' || !me) { await fail('You can only leave a game that has not started.'); return; }
      if (me === g.host) { await fail('The host cannot leave.'); return; }
      g.seats = g.seats.filter((s) => s.faction !== me);
      delete g.tokens[me];
      await store.putGame(g);
      await ctx.send(conn, { type: 'ack', req: msg.req });
      await broadcast(ctx, code, { type: 'lobby', lobby: publicLobby(g) }, conn);
      return;
    }
    case 'hello': {
      await store.addConnection(conn, code, me);
      await ctx.send(conn, { type: 'lobby', req: msg.req, lobby: publicLobby(g), you: me });
      return;
    }
    case 'upload': {
      if (!me) { await fail('You are not in this game.'); return; }
      if (msg.n < 1 || msg.n > MAX_UPLOAD_CHUNKS || msg.i < 0 || msg.i >= msg.n) { await fail('Bad upload.'); return; }
      await store.putChunk(code, msg.upload, msg.i, msg.data);
      await ctx.send(conn, { type: 'ack', req: msg.req });
      return;
    }
    case 'start': {
      if (th !== g.hostToken) { await fail('Only the host can start the game.'); return; }
      if (g.status !== 'lobby') { await fail('The game has already started.'); return; }
      const parts = await store.getChunks(code, msg.upload, msg.n);
      if (!parts) { await fail('The upload is incomplete; try again.'); return; }
      const base = g.version;
      await store.putState(code, base + 1, parts.join(''));
      await store.deleteChunks(code, msg.upload, msg.n);
      g.status = 'playing';
      g.version = base + 1;
      g.active = msg.active;
      g.turn = msg.turn;
      g.pending = {};
      g.updatedAt = g.lastSubmitAt = ctx.now();
      if (!(await store.putGame(g, base))) { await fail('Someone else changed the game; reload.'); return; }
      await ctx.send(conn, { type: 'ack', req: msg.req, version: g.version });
      await broadcast(ctx, code, { type: 'turn', lobby: publicLobby(g) });
      return;
    }
    case 'submit': {
      if (!me) { await fail('You are not in this game.'); return; }
      if (g.status !== 'playing') { await fail('The game is not in progress.'); return; }
      if (msg.base !== g.version) { await fail('Your game is out of date: someone already played this turn. Reloading.'); return; }
      const overdue = g.config.timeoutHours > 0 && ctx.now() - g.lastSubmitAt > g.config.timeoutHours * 3_600_000;
      const actingFor = msg.forFaction ?? me;
      if (g.active !== actingFor) { await fail('It is not your turn.'); return; }
      if (actingFor !== me && !overdue) { await fail(`${actingFor} still has time to play.`); return; }
      const parts = await store.getChunks(code, msg.upload, msg.n);
      if (!parts) { await fail('The upload is incomplete; try again.'); return; }
      const base = g.version;
      await store.putState(code, base + 1, parts.join(''));
      g.version = base + 1;
      g.active = msg.active;
      g.turn = msg.turn;
      g.status = msg.finished ? 'finished' : 'playing';
      g.updatedAt = g.lastSubmitAt = ctx.now();
      if (!(await store.putGame(g, base))) { await fail('Someone else submitted first; reload.'); return; }
      await store.deleteChunks(code, msg.upload, msg.n);
      if (base > 1) await store.deleteState(code, base - 1);
      await ctx.send(conn, { type: 'ack', req: msg.req, version: g.version });
      await broadcast(ctx, code, { type: 'turn', lobby: publicLobby(g) });
      return;
    }
    case 'get': {
      if (!me) { await fail('You are not in this game.'); return; }
      const state = await store.getState(code, g.version);
      if (state === null) { await fail('The game has not started yet.'); return; }
      const parts = chunkText(state);
      for (let i = 0; i < parts.length; i++) {
        await ctx.send(conn, { type: 'state', req: msg.req, version: g.version, i, n: parts.length, data: parts[i] });
      }
      return;
    }
    default:
      await fail('Unknown action.');
  }
}

function clean(name: string): string {
  return (name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Player';
}
