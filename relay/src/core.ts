/**
 * Relay logic, independent of AWS. The Lambda handler and the local dev server both call `handleMessage`.
 *
 * The relay stores each game's lobby, seats and latest packed state, checks that only the player whose turn
 * it is submits the next state (optimistic versioning prevents double submits), and pushes "turn" updates
 * to everyone connected. It does not run game rules: the game is deterministic and played by friends.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  canRead, chunkText, isEmail, isGameCode, maskEmail, MAX_MESSAGE_LENGTH, PROTOCOL_VERSION, randomCode,
  type ChatMessage, type ClientMessage, type Lobby, type ServerMessage,
} from '../../src/net/protocol';
import type { GameRecord, Store } from './store';

const MAJORS = ['concord', 'rynkai', 'varrhen', 'krasnyr', 'lattice'];
const MAX_UPLOAD_CHUNKS = 64;

export type Send = (conn: string, msg: ServerMessage) => Promise<boolean>;

/** Sends an email notice. Absent when the relay has no email service configured. */
export type Mailer = (to: string, subject: string, text: string) => Promise<void>;

export interface Ctx {
  store: Store;
  send: Send;
  now: () => number;
  mail?: Mailer;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(`empire:${token}`).digest('hex');
}

function publicLobby(g: GameRecord): Lobby {
  const { tokens: _t, hostToken: _h, pending: _p, emails: _e, stateKey: _s, prevStateKey: _ps, ...lobby } = g;
  void _t; void _h; void _p; void _e; void _s; void _ps;
  return lobby;
}

/**
 * After a turn is submitted: email the player whose turn it now is, if they asked for notices and are not
 * connected right now; when the game ends, email everyone who asked. Failures never block the turn.
 */
async function notifyTurn(ctx: Ctx, g: GameRecord): Promise<void> {
  if (!ctx.mail || !g.emails) return;
  const name = (f: string) => g.seats.find((s) => s.faction === f)?.name ?? f;
  const jobs: Promise<void>[] = [];
  if (g.status === 'finished') {
    for (const [f, email] of Object.entries(g.emails)) {
      jobs.push(ctx.mail(email, `Empire game ${g.code} is over`,
        `Hello ${name(f)},\n\nYour Empire game ${g.code} has ended on turn ${g.turn}. Open Empire and continue game ${g.code} to see the result.\n\nYou are getting this because you asked for turn notices in this game.`));
    }
  } else if (g.active && g.emails[g.active]) {
    const online = (await ctx.store.connections(g.code)).some((c) => c.faction === g.active);
    if (!online) {
      jobs.push(ctx.mail(g.emails[g.active], `Your turn in Empire (game ${g.code}, turn ${g.turn})`,
        `Hello ${name(g.active)},\n\nIt is your turn in Empire game ${g.code} (turn ${g.turn}). Open Empire and continue game ${g.code} to play.\n\nTo stop these emails, open the game menu and turn off email notices.`));
    }
  }
  await Promise.all(jobs.map((j) => j.catch(() => undefined)));
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
    if (msg.config?.preset === 'peaceful' && msg.faction === 'rynkai') { await fail('The Ryn\'kai are not in Peaceful games.'); return; }
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
        await store.putGame(g, g.version);
      }
      if (!me && g.status !== 'lobby') { await fail('That game has already started.'); return; }
      await ctx.send(conn, { type: 'lobby', req: msg.req, lobby: publicLobby(g), you: me });
      return;
    }
    case 'claim': {
      if (g.status !== 'lobby') { await fail('The game has already started.'); return; }
      if (!MAJORS.includes(msg.faction)) { await fail('Pick a major faction.'); return; }
      if (g.config.preset === 'peaceful' && msg.faction === 'rynkai') { await fail('The Ryn\'kai are not in Peaceful games.'); return; }
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
      // Conditional: if the host started the game meanwhile, this claim must not undo that.
      if (!(await store.putGame(g, g.version))) { await fail('The game changed; try again.'); return; }
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
      if (!(await store.putGame(g, g.version))) { await fail('The game changed; try again.'); return; }
      await ctx.send(conn, { type: 'ack', req: msg.req });
      await broadcast(ctx, code, { type: 'lobby', lobby: publicLobby(g) }, conn);
      return;
    }
    case 'hello': {
      await store.addConnection(conn, code, me);
      const email = me && g.emails?.[me] ? maskEmail(g.emails[me]) : null;
      await ctx.send(conn, { type: 'lobby', req: msg.req, lobby: publicLobby(g), you: me, email });
      return;
    }
    case 'notify': {
      if (!me) { await fail('You are not in this game.'); return; }
      const email = msg.email === null ? null : String(msg.email ?? '').trim();
      if (email !== null && !isEmail(email)) { await fail('That does not look like an email address.'); return; }
      // Conditional on the version, so this never overwrites a turn submitted at the same moment.
      for (let attempt = 0; attempt < 5; attempt++) {
        const fresh = (await store.getGame(code))!;
        fresh.emails ??= {};
        if (email) fresh.emails[me] = email; else delete fresh.emails[me];
        if (await store.putGame(fresh, fresh.version)) {
          await ctx.send(conn, { type: 'lobby', req: msg.req, lobby: publicLobby(fresh), you: me, email: email ? maskEmail(email) : null });
          return;
        }
      }
      await fail('The game was busy; try again.');
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
      g.status = 'playing';
      g.active = msg.active;
      g.turn = msg.turn;
      g.pending = {};
      g.updatedAt = g.lastSubmitAt = ctx.now();
      if (!(await commitState(store, g, base, msg.upload, parts.join('')))) { await fail('Someone else changed the game; reload.'); return; }
      await store.deleteChunks(code, msg.upload, msg.n);
      await ctx.send(conn, { type: 'ack', req: msg.req, version: g.version });
      await broadcast(ctx, code, { type: 'turn', lobby: publicLobby(g) });
      await notifyTurn(ctx, g);
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
      g.active = msg.active;
      g.turn = msg.turn;
      g.status = msg.finished ? 'finished' : 'playing';
      g.updatedAt = g.lastSubmitAt = ctx.now();
      if (!(await commitState(store, g, base, msg.upload, parts.join('')))) { await fail('Someone else submitted first; reload.'); return; }
      await store.deleteChunks(code, msg.upload, msg.n);
      await ctx.send(conn, { type: 'ack', req: msg.req, version: g.version });
      await broadcast(ctx, code, { type: 'turn', lobby: publicLobby(g) });
      await notifyTurn(ctx, g);
      return;
    }
    case 'message': {
      if (!me) { await fail('You are not in this game.'); return; }
      const text = (msg.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text) { await fail('Empty message.'); return; }
      const seats = new Set(g.seats.map((s) => s.faction));
      const to = msg.to.includes('all') ? ['all'] : [...new Set(msg.to)].filter((f) => f !== me && seats.has(f));
      if (to.length === 0) { await fail('Pick at least one other player.'); return; }
      const m: ChatMessage = { id: randomBytes(6).toString('hex'), from: me, to, text, at: ctx.now(), turn: Number(msg.turn) || 0 };
      await store.putMessage(code, m);
      await ctx.send(conn, { type: 'message', req: msg.req, message: m });
      const conns = await store.connections(code);
      await Promise.all(conns.filter((c) => c.conn !== conn && c.faction && canRead(m, c.faction)).map(async (c) => {
        if (!(await ctx.send(c.conn, { type: 'message', message: m }))) await store.removeConnection(c.conn);
      }));
      return;
    }
    case 'messages': {
      if (!me) { await fail('You are not in this game.'); return; }
      const all = await store.listMessages(code, Number(msg.since) || 0, 500);
      await ctx.send(conn, { type: 'messages', req: msg.req, messages: all.filter((m) => canRead(m, me)).slice(-200) });
      return;
    }
    case 'get': {
      if (!me) { await fail('You are not in this game.'); return; }
      const state = await store.getState(code, g.stateKey ?? String(g.version));
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

/**
 * Stores an uploaded state under its own key, then moves the game's pointer to it with a conditional write
 * on the version. If another submission won the race, this one's state is deleted and the winner's is
 * untouched. On success the state from two versions ago is removed.
 */
async function commitState(store: Store, g: GameRecord, base: number, upload: string, data: string): Promise<boolean> {
  const key = `${base + 1}-${String(upload).replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || randomBytes(4).toString('hex')}`;
  await store.putState(g.code, key, data);
  const stale = g.prevStateKey;
  g.prevStateKey = g.stateKey ?? (base > 0 ? String(base) : undefined);
  g.stateKey = key;
  g.version = base + 1;
  if (!(await store.putGame(g, base))) {
    await store.deleteState(g.code, key);
    return false;
  }
  if (stale) await store.deleteState(g.code, stale);
  return true;
}

function clean(name: string): string {
  return (name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Player';
}
