/**
 * Local relay for development: same protocol as the AWS relay, in memory (optionally saved to a file).
 *   npm run relay            → ws://localhost:8787
 *   then open the game with ?relay=ws://localhost:8787
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';
import { handleDisconnect, handleMessage, type Ctx } from './core';
import { MemoryStore } from './store';

const port = Number(process.env.PORT ?? 8787);
const file = process.env.RELAY_FILE ?? 'relay/.data/relay.json';
const store = new MemoryStore();

if (existsSync(file)) {
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { games: [string, never][]; states: [string, string][] };
  store.games = new Map(saved.games);
  store.states = new Map(saved.states);
  console.log(`Loaded ${store.games.size} games from ${file}`);
}
let saveTimer: NodeJS.Timeout | null = null;
function persist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true });
    writeFileSync(file, JSON.stringify({ games: [...store.games], states: [...store.states] }));
  }, 500);
}

const sockets = new Map<string, WebSocket>();
let nextId = 1;
const ctx: Ctx = {
  store,
  // The local relay prints emails instead of sending them.
  mail: async (to, subject, text) => { console.log(`EMAIL to ${to}: ${subject}\n${text}\n`); },
  now: () => Date.now(),
  send: async (conn, msg) => {
    const ws = sockets.get(conn);
    if (!ws || ws.readyState !== ws.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  },
};

const wss = new WebSocketServer({ port, maxPayload: 128 * 1024 });
wss.on('connection', (ws) => {
  const id = `c${nextId++}`;
  sockets.set(id, ws);
  ws.on('message', async (data) => {
    await handleMessage(ctx, id, data.toString());
    persist();
  });
  ws.on('close', async () => {
    sockets.delete(id);
    await handleDisconnect(ctx, id);
  });
});
console.log(`Empire relay listening on ws://localhost:${port}`);
