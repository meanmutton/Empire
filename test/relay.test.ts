import { handleMessage, type Ctx } from '../relay/src/core';
import { MemoryStore } from '../relay/src/store';
import { chunkText, PROTOCOL_VERSION, type ClientMessage, type LobbyConfig, type ServerMessage } from '../src/net/protocol';

const config: LobbyConfig = { seed: 's', width: 50, height: 30, turnLimit: null, victory: { conquest: true, domination: true, ascendance: true, alliance: true }, timeoutHours: 24 };

function setup() {
  const store = new MemoryStore();
  const inbox = new Map<string, ServerMessage[]>();
  let clock = 1_000_000;
  const ctx: Ctx = {
    store,
    now: () => clock,
    send: async (conn, msg) => { inbox.set(conn, [...(inbox.get(conn) ?? []), msg]); return true; },
  };
  const send = async (conn: string, msg: ClientMessage) => {
    inbox.set(conn, []);
    await handleMessage(ctx, conn, JSON.stringify(msg));
    return inbox.get(conn)!;
  };
  return { store, inbox, send, advance: (ms: number) => { clock += ms; } };
}

async function upload(send: ReturnType<typeof setup>['send'], conn: string, code: string, token: string, text: string, id: string) {
  const parts = chunkText(text, 10);
  for (let i = 0; i < parts.length; i++) await send(conn, { action: 'upload', req: i, code, token, upload: id, i, n: parts.length, data: parts[i] });
  return parts.length;
}

describe('relay', () => {
  it('runs a full lobby → start → turns cycle', async () => {
    const { send, inbox } = setup();
    const created = await send('h', { action: 'create', req: 1, name: 'Ann', faction: 'concord', token: 'tA', config, protocol: PROTOCOL_VERSION });
    expect(created[0].type).toBe('created');
    const code = (created[0] as { lobby: { code: string } }).lobby.code;
    expect(code).toMatch(/^[A-Z]{6}$/);

    const joined = await send('b', { action: 'join', req: 2, code, name: 'Bob', token: 'tB', protocol: PROTOCOL_VERSION });
    expect(joined[0].type).toBe('lobby');
    const claim = await send('b', { action: 'claim', req: 3, code, token: 'tB', faction: 'rynkai', name: 'Bob' });
    expect((claim[0] as { you: string }).you).toBe('rynkai');
    expect(inbox.get('h')?.some((m) => m.type === 'lobby')).toBe(true);
    const steal = await send('c', { action: 'claim', req: 4, code, token: 'tC', faction: 'rynkai', name: 'Cat' });
    expect(steal[0].type).toBe('error');

    // Only the host starts.
    const n = await upload(send, 'h', code, 'tA', 'INITIAL-STATE-0123456789', 'u1');
    expect((await send('b', { action: 'start', req: 5, code, token: 'tB', upload: 'u1', n, active: 'concord', turn: 1 }))[0].type).toBe('error');
    const started = await send('h', { action: 'start', req: 6, code, token: 'tA', upload: 'u1', n, active: 'concord', turn: 1 });
    expect(started.some((m) => m.type === 'ack')).toBe(true);
    expect(inbox.get('b')?.some((m) => m.type === 'turn')).toBe(true);

    // Download in chunks.
    const got = await send('b', { action: 'get', req: 7, code, token: 'tB' });
    const text = got.filter((m) => m.type === 'state').map((m) => (m as { data: string }).data).join('');
    expect(text).toBe('INITIAL-STATE-0123456789');

    // Bob cannot play Ann's turn; Ann can.
    const n2 = await upload(send, 'b', code, 'tB', 'BOB-STATE', 'u2');
    expect((await send('b', { action: 'submit', req: 8, code, token: 'tB', upload: 'u2', n: n2, base: 1, active: 'rynkai', turn: 1, finished: false }))[0].type).toBe('error');
    const n3 = await upload(send, 'h', code, 'tA', 'AFTER-ANN', 'u3');
    const sub = await send('h', { action: 'submit', req: 9, code, token: 'tA', upload: 'u3', n: n3, base: 1, active: 'rynkai', turn: 1, finished: false });
    expect(sub.find((m) => m.type === 'ack')).toMatchObject({ version: 2 });
    // A stale base is refused.
    const n4 = await upload(send, 'h', code, 'tA', 'AGAIN', 'u4');
    expect((await send('h', { action: 'submit', req: 10, code, token: 'tA', upload: 'u4', n: n4, base: 1, active: 'rynkai', turn: 1, finished: false }))[0].type).toBe('error');
    const got2 = await send('b', { action: 'get', req: 11, code, token: 'tB' });
    expect(got2.filter((m) => m.type === 'state').map((m) => (m as { data: string }).data).join('')).toBe('AFTER-ANN');
  });

  it('allows caretaker turns only after the timeout', async () => {
    const { send, advance } = setup();
    const created = await send('h', { action: 'create', req: 1, name: 'Ann', faction: 'concord', token: 'tA', config, protocol: PROTOCOL_VERSION });
    const code = (created[0] as { lobby: { code: string } }).lobby.code;
    await send('b', { action: 'claim', req: 2, code, token: 'tB', faction: 'lattice', name: 'Bob' });
    const n = await upload(send, 'h', code, 'tA', 'S0', 'u1');
    await send('h', { action: 'start', req: 3, code, token: 'tA', upload: 'u1', n, active: 'concord', turn: 1 });
    const m = await upload(send, 'b', code, 'tB', 'CARETAKER', 'u2');
    const early = await send('b', { action: 'submit', req: 4, code, token: 'tB', upload: 'u2', n: m, base: 1, active: 'lattice', turn: 1, finished: false, forFaction: 'concord' });
    expect(early[0].type).toBe('error');
    advance(25 * 3_600_000);
    const late = await send('b', { action: 'submit', req: 5, code, token: 'tB', upload: 'u2', n: m, base: 1, active: 'lattice', turn: 1, finished: false, forFaction: 'concord' });
    expect(late.some((x) => x.type === 'ack')).toBe(true);
  });

  it('rejects bad codes, unknown games, wrong protocol and outsiders', async () => {
    const { send } = setup();
    expect((await send('x', { action: 'join', req: 1, code: 'abc', name: 'X', token: 't', protocol: PROTOCOL_VERSION }))[0]).toMatchObject({ type: 'error' });
    expect((await send('x', { action: 'join', req: 1, code: 'ZZZZZZ', name: 'X', token: 't', protocol: PROTOCOL_VERSION }))[0]).toMatchObject({ type: 'error', message: expect.stringContaining('no game') });
    expect((await send('x', { action: 'create', req: 1, name: 'X', faction: 'concord', token: 't', config, protocol: 999 }))[0]).toMatchObject({ type: 'error' });
    const created = await send('h', { action: 'create', req: 1, name: 'Ann', faction: 'concord', token: 'tA', config, protocol: PROTOCOL_VERSION });
    const code = (created[0] as { lobby: { code: string } }).lobby.code;
    expect((await send('x', { action: 'get', req: 2, code, token: 'nope' }))[0].type).toBe('error');
    expect((await send('x', { action: 'ping', req: 3 }))[0].type).toBe('pong');
  });

  it('limits a game to five human players and never leaks tokens', async () => {
    const { send } = setup();
    const created = await send('h', { action: 'create', req: 1, name: 'Ann', faction: 'concord', token: 't0', config, protocol: PROTOCOL_VERSION });
    const code = (created[0] as { lobby: { code: string } }).lobby.code;
    const majors = ['rynkai', 'varrhen', 'krasnyr', 'lattice'];
    for (let i = 0; i < 4; i++) await send(`p${i}`, { action: 'claim', req: 2, code, token: `t${i + 1}`, faction: majors[i], name: `P${i}` });
    const lobby = await send('z', { action: 'join', req: 3, code, name: 'Z', token: 'tz', protocol: PROTOCOL_VERSION });
    expect((lobby[0] as { lobby: { seats: unknown[] } }).lobby.seats).toHaveLength(5);
    expect(JSON.stringify(lobby)).not.toContain('tokens');
    expect(JSON.stringify(lobby)).not.toContain('hostToken');
  });
});

describe('relay chat', () => {
  async function threePlayers() {
    const t = setup();
    const created = await t.send('a', { action: 'create', req: 1, name: 'Ann', faction: 'concord', token: 'tA', config, protocol: PROTOCOL_VERSION });
    const code = (created[0] as { lobby: { code: string } }).lobby.code;
    await t.send('b', { action: 'claim', req: 2, code, token: 'tB', faction: 'rynkai', name: 'Bob' });
    await t.send('c', { action: 'claim', req: 3, code, token: 'tC', faction: 'lattice', name: 'Cat' });
    return { ...t, code };
  }

  it('delivers private messages only to the people in the conversation', async () => {
    const { send, inbox, code } = await threePlayers();
    inbox.set('b', []); inbox.set('c', []);
    const sent = await send('a', { action: 'message', req: 4, code, token: 'tA', to: ['rynkai'], text: 'Truce?', turn: 3 });
    expect(sent[0]).toMatchObject({ type: 'message', message: { from: 'concord', to: ['rynkai'], text: 'Truce?', turn: 3 } });
    expect(inbox.get('b')!.some((m) => m.type === 'message')).toBe(true);
    expect(inbox.get('c')!.some((m) => m.type === 'message')).toBe(false);
    const bobs = await send('b', { action: 'messages', req: 5, code, token: 'tB', since: 0 });
    expect((bobs[0] as { messages: unknown[] }).messages).toHaveLength(1);
    const cats = await send('c', { action: 'messages', req: 6, code, token: 'tC', since: 0 });
    expect((cats[0] as { messages: unknown[] }).messages).toHaveLength(0);
  });

  it('broadcasts to all players, ignores non-players as recipients, and refuses outsiders', async () => {
    const { send, inbox, code } = await threePlayers();
    inbox.set('b', []); inbox.set('c', []);
    await send('a', { action: 'message', req: 4, code, token: 'tA', to: ['all'], text: 'Hello galaxy', turn: 1 });
    expect(inbox.get('b')!.some((m) => m.type === 'message')).toBe(true);
    expect(inbox.get('c')!.some((m) => m.type === 'message')).toBe(true);
    const bad = await send('a', { action: 'message', req: 5, code, token: 'tA', to: ['varrhen'], text: 'hi', turn: 1 });
    expect(bad[0].type).toBe('error');
    expect((await send('x', { action: 'message', req: 6, code, token: 'nope', to: ['all'], text: 'spam', turn: 1 }))[0].type).toBe('error');
    expect((await send('x', { action: 'messages', req: 7, code, token: 'nope', since: 0 }))[0].type).toBe('error');
    const long = await send('a', { action: 'message', req: 8, code, token: 'tA', to: ['all'], text: 'x'.repeat(5000), turn: 1 });
    expect((long[0] as { message: { text: string } }).message.text).toHaveLength(1000);
  });
});
